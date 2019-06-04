/* eslint-disable max-lines */

const authLogic = require('logic/auth.js');
const dockerComposeLogic = require('logic/docker-compose.js');
const dockerLogic = require('logic/docker.js');
const diskLogic = require('logic/disk.js');
const constants = require('utils/const.js');
const bashService = require('services/bash.js');
const lnapiService = require('services/lnapi.js');
const LNNodeError = require('models/errors.js').NodeError;
const DockerPullingError = require('models/errors.js').DockerPullingError;
const schemaValidator = require('utils/settingsSchema.js');
const md5Check = require('md5-file');
const ipAddressUtil = require('utils/ipAddress.js');
const logger = require('utils/logger.js');
const UUID = require('utils/UUID.js');
const auth = require('logic/auth');

let lanIPManagementInterval = {};
let ipManagementRunning = false;

let devicePassword = '';
let lndManagementInterval = {};
let lndManagementRunning = false;
let intervalsSinceLndRestart = 0;

const MIN_INTERVALS_FOR_RESTART = 6;
const RETRY_SECONDS = 10;
const RETRY_ATTEMPTS = 10;

let lastJwtCreation;

let autoImagePullInterval = {};
let lastImagePulled = new Date().getTime(); // The time the last image was successfully pulled.
let pullingImages = false; // Is the manager currently pulling images.

let systemStatus;
let bootPercent = 0; // An approximate state of where the manager is during boot.
resetSystemStatus();

// Get all ip or onion address that can be used to connect to this Casa node.
async function getAddresses() {

  // Get ip address.
  const addresses = [ipAddressUtil.getLanIPAddress()];

  const currentConfig = await diskLogic.readSettingsFile();

  // Check to see if tor is turned on and add onion address if Tor has created a new hidden service.
  if (process.env.CASA_NODE_HIDDEN_SERVICE
    && (currentConfig.lnd.lndTor || currentConfig.bitcoind.bitcoindTor)) {

    addresses.push(process.env.CASA_NODE_HIDDEN_SERVICE);
  }

  return addresses;
}

async function getBootPercent() {
  return bootPercent;
}

function resetSystemStatus() {
  systemStatus = {};
}

async function downloadChain() {
  await dockerComposeLogic.dockerLoginCasaworker();

  await dockerComposeLogic.dockerComposePull({service: constants.SERVICES.DOWNLOAD});
  systemStatus.details = 'downloading blocks...';
  await dockerComposeLogic.dockerComposeUpSingleService({
    service: constants.SERVICES.DOWNLOAD,
    attached: true,
  });
}

// Checks whether the settings.json file exists, and attempts to create it with default value should it not. Returns
// the settings.
async function settingsFileIntegrityCheck() { // eslint-disable-line id-length
  const defaultConfig = {
    bitcoind: {
      bitcoinNetwork: 'mainnet',
      bitcoindListen: true,
      tor: false, // Added February 2019
    },
    lnd: {
      chain: 'bitcoin',
      backend: 'bitcoind',
      lndNetwork: 'mainnet',
      autopilot: false, // eslint-disable-line object-shorthand
      externalIP: '',
      tor: false, // Added February 2019
    }
  };

  const exists = await diskLogic.settingsFileExists();
  if (!exists) {
    const validation = schemaValidator.validateSettingsSchema(defaultConfig);
    if (!validation.valid) {
      return new LNNodeError(validation.errors);
    }

    await rpcCredIntegrityCheck(defaultConfig);
    await diskLogic.writeSettingsFile(defaultConfig);

    return defaultConfig;
  } else {
    const settings = await diskLogic.readSettingsFile();

    await rpcCredIntegrityCheck(settings);
    await diskLogic.writeSettingsFile(settings);

    return settings;
  }
}

// Check whether the settings.json file contains rpcUser and rpcPassword. Historically it has not contained this by
// default.
async function rpcCredIntegrityCheck(settings) {
  if (!Object.prototype.hasOwnProperty.call(settings.bitcoind, 'rpcUser')) {
    settings.bitcoind.rpcUser = UUID.create();
  }

  if (!Object.prototype.hasOwnProperty.call(settings.bitcoind, 'rpcPassword')) {
    settings.bitcoind.rpcPassword = UUID.create();
  }
}

// Return true if there was an issue downloading a file otherwise false.
async function getResyncFailed() {
  const options = {};

  const logs = await bashService.exec('docker', ['logs', 'download'], options);

  if (logs.out.includes('failed') || logs.out.includes('Failed')) {
    return true;
  } else {
    return false;
  }
}

/* eslint-disable no-magic-numbers */
async function setResyncDetails() {
  try {
    const options = {};

    // Use the last 20 logs to save time by avoiding the entire logs
    const logs = await bashService.exec('docker', ['logs', 'download', '--tail', '5'], options);

    const list = logs.out.split('\r');

    for (let index = list.length - 1; index > -1; index--) {
      // Make sure text contains both Completed and file(s). This is because docker logs for the download container does
      // not produce clean logs. Sometimes lines overwrite each other at the ends. By ensuring both words exist, we
      // ensure a clean log.
      if (list[index].includes('Completed') && list[index].includes('file(s)')) {

        // return and remove extra text
        const details = list[index].split(' remaining')[0];

        // sample details 'Completed 95.2 MiB/~7.7 GiB (12.2 MiB/s) with ~62 file(s)'
        // sample details 'Completed 95.2 MiB/7.7 GiB (12.2 MiB/s) with ~62 file(s)'
        const parts = details.split(' ');
        const downloadedAmount = parts[1];
        const downloadedAmountUnit = parts[2].split('/')[0];
        let totalAmount = parts[2].split('/')[1].replace('~', '');
        let totalAmountUnit = parts[3];
        const speed = (parts[4] + ' ' + parts[5]).replace('(', '').replace(')', '');

        // The download container only gives a 10 GiB lead on downloading. Because of this, we will estimate the total
        // amount until it gets closer to the end.
        if (systemStatus.full && (downloadedAmount < 210 && downloadedAmountUnit === 'GiB'
          || downloadedAmountUnit === 'MiB')) {

          totalAmount = '220';
          totalAmountUnit = 'GiB';
        }

        systemStatus.downloadedAmount = downloadedAmount;
        systemStatus.downloadedAmountUnit = downloadedAmountUnit;
        systemStatus.totalAmount = totalAmount;
        systemStatus.totalAmountUnit = totalAmountUnit;
        systemStatus.speed = speed;

        // short circuit loop
        index = -1;
      }
    }
  } catch (error) {
    // If the download container does not exist, it will throw an error. In that case, we will just return the
    // details as is.
  }
}
/* eslint-enable no-magic-numbers */

// Return the serial id of the device.
async function getSerial() {
  return constants.SERIAL;
}

// Return info device reset state, in-progress and/or it has encountered errors.
async function getSystemStatus() {

  if (systemStatus.resync) {
    await setResyncDetails();
  }

  return systemStatus;
}

// Save system settings
async function saveSettings(settings) {
  const versions = await dockerLogic.getVersions();

  // Save settings currently performs a docker compose up. This will recreate the container with the new image. We
  // don't want the user to accidentally be updating their system when they are trying to save settings. Therefore, if
  // a new image exists, we will block the user from saving until they actively choose to update their system.
  if (versions.bitcoind.updatable) {
    throw new LNNodeError('Bitcoin needs to be updated before settings can be saved');
  }
  if (versions.lnd.updatable) {
    throw new LNNodeError('Lightning needs to be updated before settings can be saved');
  }

  const currentConfig = await diskLogic.readSettingsFile();
  const newConfig = JSON.parse(JSON.stringify(currentConfig));

  var lndSettings = settings['lnd'];
  var bitcoindSettings = settings['bitcoind'];
  var systemSettings = settings['system'];

  // If Tor is active for Lnd, we erase the manually entered externalIP. This results in Lnd only being available over
  // Tor. This increases privacy by only advertising the onion address.
  if (lndSettings.tor) {
    lndSettings.externalIP = '';
  }

  for (const key in lndSettings) {
    if (lndSettings[key] !== undefined) {
      newConfig['lnd'][key] = lndSettings[key];
    }
  }

  for (const key in bitcoindSettings) {
    if (bitcoindSettings[key] !== undefined) {
      newConfig['bitcoind'][key] = bitcoindSettings[key];
    }
  }

  // Adding some default values. These properties were created after initial release.
  if (!newConfig['system']) {
    newConfig['system'] = {};
  }

  for (const key in systemSettings) {
    if (systemSettings[key] !== undefined) {
      newConfig['system'][key] = systemSettings[key];
    }
  }

  if (!Object.prototype.hasOwnProperty.call(newConfig['system'], 'systemDisplayUnits')) {
    newConfig['system']['systemDisplayUnits'] = 'btc';
  }

  const validation = schemaValidator.validateSettingsSchema(newConfig);
  if (!validation.valid) {
    throw new LNNodeError(validation.errors);
  }

  // Recreate space-fleet if tor is turned on or tor is turned off for both.
  const recreateSpaceFleet = (currentConfig.bitcoind.tor || currentConfig.lnd.tor)
    !== (newConfig.bitcoind.tor || newConfig.lnd.tor);
  const recreateBitcoind = JSON.stringify(currentConfig.bitcoind) !== JSON.stringify(newConfig.bitcoind);
  const recreateLnd = JSON.stringify(currentConfig.lnd) !== JSON.stringify(newConfig.lnd);

  await diskLogic.writeSettingsFile(newConfig);

  // Spin up applications
  await startTorAsNeeded(newConfig);

  if (recreateSpaceFleet) {
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.SPACE_FLEET});
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.SPACE_FLEET});
  }

  if (recreateBitcoind) {
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.BITCOIND});
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.BITCOIND});
  }

  if (recreateLnd) {
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.LND});
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.LND});

    const jwt = await getJwt();
    await unlockLnd(jwt);
  }
}

// The raspberry pi 3b+ has 4 processors that run at 100% each. Every hour there are 60 minutes and four processors for
// a total of 240 processor minutes.
//
// If there are no images available, this function will complete in 30 seconds while only using 40% cpu. This equates
// to 0.2 cpu-minutes or 0.08% of the hourly processing minutes available.
//
// Pulling an image typically uses 100%-120% and takes several minutes. We will have to monitor the number of updates
// we release to make sure it does not put over load the pi.
async function startImageIntervalService() {
  if (autoImagePullInterval !== {}) {
    autoImagePullInterval = setInterval(pullAllImages, constants.TIME.ONE_HOUR_IN_MILLIS);
  }
}

// Pull all docker images from docker hub.
async function pullAllImages() {
  pullingImages = true;

  try {
    const originalImageCount = (await dockerLogic.getImages()).length;
    await dockerComposeLogic.dockerComposePullAll();
    const finalImageCount = (await dockerLogic.getImages()).length;

    if (finalImageCount - originalImageCount !== 0) {
      lastImagePulled = new Date().getTime();
    }
  } catch (error) {
    throw error;
  } finally {
    pullingImages = false;
  }
}

// Display to the user the current versions and a filtered version of what is updatable. We filter out all updatable
// services if just one image was downloaded in the last 90 minutes.
//
// The 90 minute filter ensures that all images have been downloaded for a particular release. Every 60 minutes
// the node attempts to download the newest images. The download process could take 20 minutes (30 for padding).
//
// A node could also start downloading images while only half of the images have been uploaded to the docker source.
// The 90 minute filter handles this by making sure the node attempts to download images twice and catches any images
// it might have missed the first time.
//
// We also want to filter all versions if the node is currently pulling images. We don't want to only get half of the
// new images.
async function getFilteredVersions() {
  const versions = await dockerLogic.getVersions();
  const now = new Date().getTime();
  const elapsedTime = now - lastImagePulled;

  for (const version in versions) {
    if (Object.prototype.hasOwnProperty.call(versions, version)) {
      let filtered = false;

      if (elapsedTime < constants.TIME.NINETY_MINUTES_IN_MILLIS || pullingImages) {
        filtered = true;
        versions[version].updatable = false;
      }

      // Return the fact that all services are being filtered.
      versions[version].filtered = filtered;
    }
  }

  return versions;
}

// Start Tor as needed otherwise remove the container if it exists.
async function startTorAsNeeded(settings) {
  if (settings.lnd.lndTor || settings.bitcoind.bitcoindTor) {

    // Pull Tor image if needed
    if (!await dockerLogic.hasImageForService(constants.SERVICES.TOR)) {
      await dockerComposeLogic.dockerLoginCasaworker();
      await dockerComposeLogic.dockerComposePull({service: constants.SERVICES.TOR});
    }

    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.TOR});
    await setHiddenServiceEnv();

  } else {
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.TOR});
    await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.TOR});
  }
}

// Set the CASA_NODE_HIDDEN_SERVICE env variable.
//
// The Casa Node Hidden Service is created after tor boot. It happens quickly, but it isn't instant. We retry several
// times to retrieve it. If it cannot be retrieved Casa Node services will not be available via tor.
async function setHiddenServiceEnv() {

  let attempt = 0;

  do {

    attempt++;

    if (await diskLogic.hiddenServiceFileExists()) {
      process.env.CASA_NODE_HIDDEN_SERVICE = ('http://'
        + await diskLogic.readHiddenService()).replace('\n', '');
    } else {
      await sleepSeconds(RETRY_SECONDS);
    }
  } while (!process.env.CASA_NODE_HIDDEN_SERVICE && attempt <= RETRY_ATTEMPTS);
}

// Run startup functions
/* eslint-disable no-magic-numbers */
async function startup() {

  let errorThrown = false;

  // keep retrying the startup process if there are any errors
  do {
    const settings = await settingsFileIntegrityCheck();
    try {
      await checkAndUpdateLaunchScript();

      const ipv4 = ipAddressUtil.getLanIPAddress();
      if (ipv4) {
        process.env.DEVICE_HOST = ipv4;
      } else {
        // Add a log, but do not block the startup process.
        logger.info('No ipv4 address available. Plug in ethernet.', 'startup');
      }

      // initial setup after a reset or manufacture, force an update.
      const firstBoot = await auth.isRegistered();
      bootPercent = 10;

      if (!firstBoot.registered) {
        await dockerComposeLogic.dockerLoginCasaworker();
        await dockerComposeLogic.dockerComposePull({service: constants.SERVICES.WELCOME});

        try {
          await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.WELCOME});
        } catch (error) {
          // TODO: figure out a better way to handle this
          // Ignore errors when welcome doesn't start because space-fleet is already running
          // This can happen under the following circumstance
          // 1. The user starts the device the first time
          // 2. they don't register
          // 3. The user restarts the device
        }

        // // TODO: remove before release, this prevents the manager from overriding local changes to YMLs.
        if (process.env.DISABLE_YML_UPDATE !== 'true') {
          await checkYMLs();
        }

        await pullAllImages();

        try {
          await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.WELCOME});
          await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.WELCOME});
        } catch (error) {
          // TODO: same as above
          // Ignore error
        }
      }

      bootPercent = 20;
      if (process.env.DISABLE_YML_UPDATE !== 'true') {
        await checkYMLs();
      }
      bootPercent = 30;

      // Previous releases will have a paused Welcome service, let us be good stewarts.
      await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.WELCOME});
      await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.WELCOME});

      // Clean up old images.
      await dockerLogic.pruneImages();
      bootPercent = 40;

      // Ensure tor volumes are created before launching applications.
      await dockerLogic.ensureTorVolumes();
      bootPercent = 50;

      // Spin up applications
      await startTorAsNeeded(settings);
      bootPercent = 60;
      await dockerComposeLogic.dockerComposeUpSingleService({service: 'space-fleet'});
      bootPercent = 70;
      await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND}); // Launching all services
      bootPercent = 80;
      await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LOGSPOUT}); // Launching all services
      bootPercent = 90;

      await startIntervalServices();

      errorThrown = false;
    } catch (error) {
      errorThrown = true;
      logger.error(error.message, error.stack);

      await sleepSeconds(RETRY_SECONDS);
    }
  } while (errorThrown);

  bootPercent = 100;
}
/* eslint-enable no-magic-numbers */

// Starts the interval service Lan IP Management.
async function startLanIPIntervalService() {
  if (lanIPManagementInterval !== {}) {
    lanIPManagementInterval = setInterval(lanIPManagement, constants.TIME.FIVE_MINUTES_IN_MILLIS);
  }
}

// If the lan ip address has changed, we need to recreate most services. In the future it
// would be ideal if we could update the dependencies without having to recreate them.
async function lanIPManagement() {

  // If this service is already running, do not run a second instance.
  if (ipManagementRunning) {
    return;
  }

  ipManagementRunning = true;

  try {
    const newDeviceHost = ipAddressUtil.getLanIPAddress();

    if (process.env.DEVICE_HOST !== newDeviceHost) {

      // When we recreate services, they are automatically updated to the most recent image on device. This
      // could cause compatibility issues if we are auto currently pulling images or we have only pull half of all the
      // images that are needed for a full update. To get around this, we will only restart and fix the ip problem if
      // images are not being filtered.
      //
      // The consequence of this is that if a node downloads images at the same time the node lan ip address changes,
      // this service will not resolved the issue until the versions are not being filtered and this service runs again.
      // Today, versions are filtered for 90 minutes and then it could be an additional hour for this service to run
      // again.
      const versions = await getFilteredVersions();

      if (!versions[constants.SERVICES.MANAGER].filtered) {
        await startup();
      }
    }
  } catch (error) {
    throw error;
  } finally {
    ipManagementRunning = false;
  }
}

// Removes the bitcoind chain if full is true and optionally resync it from Casa's aws server.
async function resyncChain(full, syncFromAWS) {

  try {
    resetSystemStatus();

    systemStatus.full = !!full;
    systemStatus.resync = true;
    systemStatus.error = false;

    systemStatus.details = 'stopping lnd...';
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.LND});
    systemStatus.details = 'stopping bitcoind...';
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.BITCOIND});

    if (full) {
      systemStatus.details = 'wiping existing bitcoin chain...';
      await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.BITCOIND});
      await dockerLogic.removeVolume('applications_bitcoind-data');
    } else {
      systemStatus.details = 'cleaning existing bitcoin chain...';

      // TODO do we really need to wipe index and chainstate?
    }

    if (syncFromAWS) {
      let attempt = 0;
      let failed = false;
      do {
        attempt++;

        systemStatus.details = 'trying attempt ' + attempt + '...';
        await downloadChain();
        failed = await getResyncFailed();

        // removing download container to erase logs from previous attempts
        await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.DOWNLOAD});

      } while (failed && attempt <= RETRY_ATTEMPTS);
    }

    systemStatus.details = 'removing excess images...';
    await dockerLogic.pruneImages();

    systemStatus.details = 'starting bitcoind...';
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.BITCOIND});
    systemStatus.details = 'starting lnd...';
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.LND});

    resetSystemStatus();
  } catch (error) {
    systemStatus.error = true;
    systemStatus.details = 'see logs for more details...';

    // TODO what to do with lnd and bitcoind in the event of an error?
  }
}

// Start all interval services.
async function startIntervalServices() {
  await startLanIPIntervalService();
  await startLndIntervalService();
  await startImageIntervalService();
}

// Stop scheduling new interval services. Currently running interval services will still complete.
function stopIntervalServices() {
  if (autoImagePullInterval !== {}) {
    clearInterval(autoImagePullInterval);
    autoImagePullInterval = {};
  }

  if (lndManagementInterval !== {}) {
    clearInterval(lndManagementInterval);
    lndManagementInterval = {};
  }

  if (lanIPManagementInterval !== {}) {
    clearInterval(lanIPManagementInterval);
    lanIPManagementInterval = {};
  }
}

// Stops all services and removes artifacts that aren't labeled with 'casa=persist'.
// Remove docker images and pull then again if factory reset.
async function reset(factoryReset) {
  try {
    resetSystemStatus();
    systemStatus.resetting = true;
    systemStatus.error = false;
    stopIntervalServices();
    await dockerLogic.stopNonPersistentContainers();
    await dockerLogic.pruneContainers();
    await dockerLogic.pruneNetworks();
    await dockerLogic.pruneVolumes();
    await wipeSettingsVolume();
    await wipeAccountsVolume();

    if (factoryReset) {
      await dockerLogic.pruneImages(true);
      await pullAllImages();
    }
    const settings = await settingsFileIntegrityCheck();

    // Spin up applications
    await startTorAsNeeded(settings);
    await dockerComposeLogic.dockerComposeUpSingleService({service: 'space-fleet'});
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND}); // Launching all services
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LOGSPOUT}); // Launching all services
    await startIntervalServices();
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
    await dockerComposeLogic.dockerComposeUpSingleService({service: 'space-fleet'});
  } finally {
    systemStatus.resetting = false;
  }
}

async function userReset() {
  try {
    resetSystemStatus();
    systemStatus.resetting = true;
    systemStatus.error = false;
    stopIntervalServices();
    await dockerLogic.stopNonPersistentContainers();
    await dockerLogic.pruneContainers();
    await dockerLogic.pruneNetworks();

    await wipeSettingsVolume();
    await wipeAccountsVolume();
    await dockerLogic.removeVolume('applications_channel-data');
    await dockerLogic.removeVolume('applications_lnd-data');

    const settings = await settingsFileIntegrityCheck();

    // Spin up applications
    await startTorAsNeeded(settings);
    await dockerComposeLogic.dockerComposeUpSingleService({service: 'space-fleet'});
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND}); // Launching all services
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LOGSPOUT}); // Launching all services
    await startIntervalServices();
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
    await dockerComposeLogic.dockerComposeUpSingleService({service: 'space-fleet'});
  } finally {
    systemStatus.resetting = false;
  }
}

// Puts the device in a state where it is safe to unplug the power. Currently, we shutdown lnd and bitcoind
// appropriately. In the future we will shutdown the entire device.
async function shutdown() {

  // If docker is pulling and is only partially completed, when the device comes back online, it will install the
  // partial update. This could cause breaking changes. To avoid this, we will stop the user from shutting down the
  // device while docker is pulling.
  if (pullingImages) {
    throw new DockerPullingError();
  }

  await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.LND});
  await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.BITCOIND});
  await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.SPACE_FLEET});
}

// Stops, removes, and recreates a docker container based on the docker image on device. This can be used to restart a
// container or update a container to the newest image.
async function update(services) {
  for (const service of services) {
    const options = {service: service}; // eslint-disable-line object-shorthand

    await dockerComposeLogic.dockerComposeStop(options);
    await dockerComposeLogic.dockerComposeRemove(options);
    await dockerComposeLogic.dockerComposeUpSingleService(options);
  }
}

// Remove the user file.
async function wipeAccountsVolume() {
  const options = {
    cwd: '/accounts',
  };

  await bashService.exec('rm', ['-f', 'user.json'], options);
}

// Remove any setting files.
async function wipeSettingsVolume() {
  const options = {
    cwd: '/settings',
  };

  await bashService.exec('rm', ['-f', 'settings.json'], options);
}

// Compare known compose files, except manager.yml, with on-device YMLs.
// The manager should have the latest YMLs.
async function checkYMLs() {
  const knownYMLs = Object.assign({}, constants.COMPOSE_FILES);

  const updatableYMLs = Object.values(knownYMLs);

  const outdatedYMLs = [];

  for (const knownYMLFile of updatableYMLs) {
    try {
      const canonicalMd5 = md5Check.sync(constants.CANONICAL_YML_DIRECTORY.concat('/' + knownYMLFile));
      const ondeviceMd5 = md5Check.sync(constants.WORKING_DIRECTORY.concat('/' + knownYMLFile));

      if (canonicalMd5 !== ondeviceMd5) {
        outdatedYMLs.push(knownYMLFile);
      }
    } catch (error) {
      outdatedYMLs.push(knownYMLFile);
    }
  }

  if (outdatedYMLs.length !== 0) {
    await updateYMLs(outdatedYMLs);
  }
}

// Stop non-persistent containers, and copy over outdated YMLs, restart services.
// Declared services could be different between the YMLs, so stop everything.
// Might need to disable for AWS instances with <4 CPUs as we dynamically configure CPU resources.
async function updateYMLs(outdatedYMLs) {
  try {
    systemStatus.updating = true;
    await dockerLogic.stopNonPersistentContainers();
    await dockerLogic.pruneContainers();

    for (const outdatedYML of outdatedYMLs) {
      const ymlFile = constants.CANONICAL_YML_DIRECTORY + '/' + outdatedYML;
      await bashService.exec('cp', [ymlFile, constants.WORKING_DIRECTORY], {});
    }

    stopIntervalServices();
    await pullAllImages();
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
  } finally {
    systemStatus.updating = false;
  }
}

async function checkAndUpdateLaunchScript() { // eslint-disable-line id-length
  try {
    systemStatus.updating = true;
    const canonicalMd5 = md5Check.sync(constants.CANONICAL_YML_DIRECTORY.concat('/' + constants.LAUNCH_SCRIPT));
    const ondeviceMd5 = md5Check.sync(constants.LAUNCH_DIRECTORY.concat('/' + constants.LAUNCH_SCRIPT));

    // TODO: tell space-fleet to tell the user to restart their device.
    if (canonicalMd5 !== ondeviceMd5) {
      const launchScriptFile = constants.CANONICAL_YML_DIRECTORY + '/' + constants.LAUNCH_SCRIPT;
      await bashService.exec('cp', [launchScriptFile, constants.LAUNCH_DIRECTORY], {});
    }
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
  } finally {
    systemStatus.updating = false;
  }
}

// Sleep for a given number of seconds
function sleepSeconds(seconds) {
  return new Promise(resolve => {
    setTimeout(resolve, seconds * constants.TIME.ONE_SECOND_IN_MILLIS);
  });
}

// Get a random int.
function getRandomInt(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

// Start the Lnd Management interval service.
async function startLndIntervalService() {

  // Only start lnd management if another instance is not already running.
  if (lndManagementInterval !== {} || lndManagementRunning) {

    // Run lnd management immediately and then rerun every hour. This makes it more likely that the user skips the
    // initial login modal for lnd.
    await lndManagement();
    lndManagementInterval = setInterval(lndManagement, constants.TIME.ONE_HOUR_IN_MILLIS);
  }
}

// Restart Lnd if the appropriate criteria is met. We do this to help solve memory issue created by lnd.
async function restartLndAsNeeded(jwt) {

  // Don't restart if jwt was created in the last hour.
  if ((new Date().getTime() - lastJwtCreation) // eslint-disable-line no-extra-parens
    < constants.TIME.ONE_HOUR_IN_MILLIS) {
    return;
  }

  // Don't restart if a restart already happened recently
  if (intervalsSinceLndRestart < MIN_INTERVALS_FOR_RESTART) {
    return;
  }

  // Every time we run lnd management, generate a random number between 0 and 47. This will average out to 24. Since
  // we run lnd management every hour, this will average to 1 restart every 24 hours.
  if (getRandomInt(0, constants.TIME.HOURS_IN_TWO_DAYS) === 0
      || intervalsSinceLndRestart > constants.TIME.HOURS_IN_TWO_DAYS) {

    // Perform backup only when LND is not processing.
    await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.LND});

    // Request that the LNAPI performs LND backup as it creates and has access to the lnd-data volume.
    await lnapiService.backUpLndData(jwt);

    await dockerComposeLogic.dockerComposeRestart({service: constants.SERVICES.LND});
    await unlockLnd(jwt);

    intervalsSinceLndRestart = 0;
  }
}

// Get a new valid jwt token.
async function getJwt() {
  const genericUser = {
    username: 'admin',
  };

  return (await authLogic.login(genericUser)).jwt;
}

// Keeps lnd unlocked and up to date with the most accurate external ip.
async function lndManagement() {

  // If this service is already running, do not run a second instance.
  if (lndManagementRunning) {
    return;
  }

  if (!devicePassword) {
    return;
  }

  lndManagementRunning = true;
  intervalsSinceLndRestart++;

  try {

    // Check to see if lnd is currently running.
    if (await dockerLogic.isRunningService(constants.SERVICES.LND)) {

      // Make sure we have a valid auth token.
      const jwt = await getJwt();

      const currentConfig = await diskLogic.readSettingsFile();
      const addresses = (await lnapiService.getBitcoindAddresses(jwt)).data;

      let externalIP;
      for (const address of addresses) {
        if (!address.includes('onion')) {
          externalIP = address;
        }
      }

      // If an external ip has been set and is not equal to the current external ip and tor is not active. Tor handles
      // external address on its own.
      if (currentConfig.externalIP !== ''
        && currentConfig.externalIP !== externalIP
        && !currentConfig.lnd.tor) {

        currentConfig.externalIP = externalIP;
        await saveSettings(currentConfig);

      } else {
        await restartLndAsNeeded(jwt);
      }
    }

  } catch (error) {
    throw error;
  } finally {
    lndManagementRunning = false;
  }
}

async function unlockLnd(jwt) {
  // Unlock lnd via api call. Try up to 5 times. Lnd can fail to unlock if it was just started. It takes a few
  // seconds to boot up on a Raspberry pi 3B+.
  let attempt = 0;
  let errorOccurred;

  do {
    errorOccurred = false;
    try {
      attempt++;
      await lnapiService.unlockLnd(devicePassword, jwt);
    } catch (error) {
      errorOccurred = true;
      logger.error(error.message, 'lnd-management', error.stack);

      await sleepSeconds(RETRY_SECONDS);
    }

  } while (errorOccurred && attempt < RETRY_ATTEMPTS);
}

async function login(user) {
  try {

    devicePassword = user.password;
    const jwt = await authLogic.login(user);

    // Don't wait for lnd management to complete. It takes 10 seconds on a Raspberry Pi 3B+. Running in the background
    // improves UX.
    unlockLnd(jwt.jwt);

    lastJwtCreation = new Date().getTime();

    return jwt;
  } catch (error) {
    devicePassword = '';
    throw error;
  }
}

async function refresh(user) {

  lastJwtCreation = new Date().getTime();

  return await authLogic.refresh(user);
}

module.exports = {
  getAddresses,
  getBootPercent,
  getSerial,
  getSystemStatus,
  getFilteredVersions,
  login,
  saveSettings,
  shutdown,
  startLndIntervalService,
  startup,
  stopIntervalServices,
  reset,
  resyncChain,
  refresh,
  userReset,
  update,
};
