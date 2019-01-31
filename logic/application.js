/* eslint-disable max-lines */

const dockerComposeLogic = require('logic/docker-compose.js');
const dockerLogic = require('logic/docker.js');
const diskLogic = require('logic/disk.js');
const constants = require('utils/const.js');
const bashService = require('services/bash.js');
const LNNodeError = require('models/errors.js').NodeError;
const DockerPullingError = require('models/errors.js').DockerPullingError;
const schemaValidator = require('utils/settingsSchema.js');
const md5Check = require('md5-file');
const logger = require('utils/logger.js');
const UUID = require('utils/UUID.js');
const auth = require('logic/auth');

let autoImagePullInterval = {};
let lastImagePulled = new Date().getTime(); // The time the last image was successfully pulled

let pullingImages = false; // Is the manager currently pulling images

let systemStatus;
resetSystemStatus();

const logArchiveLocalPath = constants.WORKING_DIRECTORY + '/' + constants.NODE_LOG_ARCHIVE;
const logArchiveLocalPathTemp = constants.WORKING_DIRECTORY + '/' + constants.NODE_LOG_ARCHIVE_TEMP;
const MAX_RESYNC_ATTEMPTS = 5;

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

// Checks whether the settings.json file exists, and attempts to create it with default value should it not.
async function settingsFileIntegrityCheck() { // eslint-disable-line id-length
  const defaultConfig = {
    bitcoind: {
      bitcoinNetwork: 'mainnet',
      bitcoindListen: true,
    },
    lnd: {
      chain: 'bitcoin',
      backend: 'bitcoind',
      lndNetwork: 'mainnet',
      autopilot: false, // eslint-disable-line object-shorthand
      externalIP: '',
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

  } else {
    const settings = await diskLogic.readSettingsFile();

    await rpcCredIntegrityCheck(settings);
    await diskLogic.writeSettingsFile(settings);
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

  const validation = schemaValidator.validateSettingsSchema(newConfig);
  if (!validation.valid) {
    throw new LNNodeError(validation.errors);
  }

  const recreateBitcoind = JSON.stringify(currentConfig.bitcoind) !== JSON.stringify(newConfig.bitcoind);
  const recreateLnd = JSON.stringify(currentConfig.lnd) !== JSON.stringify(newConfig.lnd);

  await diskLogic.writeSettingsFile(newConfig);

  if (recreateBitcoind) {
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.BITCOIND});
  }
  if (recreateLnd) {
    await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.LND});
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
async function startAutoImagePull() {
  autoImagePullInterval = setInterval(pullAllImages, constants.TIME.ONE_HOUR_IN_MILLIS);
}

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

  if (elapsedTime < constants.TIME.ONE_HOUR_IN_MILLIS || pullingImages) {
    for (const version in versions) {
      if (Object.prototype.hasOwnProperty.call(versions, version)) {
        versions[version].updatable = false;
      }
    }
  }

  return versions;
}

// Run startup functions
async function startup() {

  let errorThrown = false;

  // keep retrying the startup process if there are any errors
  do {
    try {
      await settingsFileIntegrityCheck();

      // initial setup after a reset or manufacture, force an update.
      const firstBoot = await auth.isRegistered();
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

      // // TODO: remove before release, this prevents the manager from overriding local changes to YMLs.
      if (process.env.DISABLE_YML_UPDATE !== 'true') {
        await checkYMLs();
      }

      // previous releases will have a paused Welcome service, let us be good stewarts.
      await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.WELCOME});
      await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.WELCOME});

      // clean up old images
      await dockerLogic.pruneImages();

      await startSpaceFleet();
      await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND}); // Launching all services
      await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LOGSPOUT}); // Launching all services
      await startAutoImagePull(); // handles docker logout

      errorThrown = false;
    } catch (error) {
      errorThrown = true;
      logger.error(error.message, error.stack);
    }
  } while (errorThrown);
}

// Set the host device-host and restart space-fleet
async function startSpaceFleet() {
  await dockerComposeLogic.dockerLoginCasaworker();
  await runDeviceHost();
  await dockerComposeLogic.dockerComposeUpSingleService({service: 'space-fleet'});
}

// Removes the bitcoind chain and resync it from Casa's server.
async function resyncChainFromServer(full) {

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

    let attempt = 0;
    let failed = false;
    do {
      attempt++;

      systemStatus.details = 'trying attempt ' + attempt + '...';
      await downloadChain();
      failed = await getResyncFailed();

      // removing download container to erase logs from previous attempts
      await dockerComposeLogic.dockerComposeRemove({service: constants.SERVICES.DOWNLOAD});

    } while (failed && attempt <= MAX_RESYNC_ATTEMPTS);

    systemStatus.details = 'removing download image...';
    await dockerLogic.pruneImages();

    systemStatus.details = 'starting lnd...';
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LND});
    systemStatus.details = 'starting bitcoind...';
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND});

    resetSystemStatus();
  } catch (error) {
    systemStatus.error = true;
    systemStatus.details = 'see logs for more details...';

    // TODO what to do with lnd and bitcoind?
  }
}

// Stops all services and removes artifacts that aren't labeled with 'casa=persist'.
// Remove docker images and pull then again if factory reset.
async function reset(factoryReset) {
  try {
    resetSystemStatus();
    systemStatus.resetting = true;
    systemStatus.error = false;
    clearInterval(autoImagePullInterval);
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
    await settingsFileIntegrityCheck();
    await startSpaceFleet();
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND}); // Launching all services
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LOGSPOUT}); // Launching all services
    await startAutoImagePull();
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
    await startSpaceFleet();
  } finally {
    systemStatus.resetting = false;
  }
}

async function userReset() {
  try {
    resetSystemStatus();
    systemStatus.resetting = true;
    systemStatus.error = false;
    clearInterval(autoImagePullInterval);
    await dockerLogic.stopNonPersistentContainers();
    await dockerLogic.pruneContainers();
    await dockerLogic.pruneNetworks();

    await wipeSettingsVolume();
    await wipeAccountsVolume();
    await dockerLogic.removeVolume('applications_channel-data');
    await dockerLogic.removeVolume('applications_lnd-data');

    await settingsFileIntegrityCheck();
    await startSpaceFleet();
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.BITCOIND}); // Launching all services
    await dockerComposeLogic.dockerComposeUp({service: constants.SERVICES.LOGSPOUT}); // Launching all services
    await startAutoImagePull();
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
    await startSpaceFleet();
  } finally {
    systemStatus.resetting = false;
  }
}

// Update .env with new host IP.
async function runDeviceHost() {
  const options = {
    attached: true,
    service: constants.SERVICES.DEVICE_HOST,
  };

  await dockerComposeLogic.dockerComposePull(options);
  await dockerComposeLogic.dockerComposeUpSingleService(options);
  await dockerComposeLogic.dockerComposeRemove(options);
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

// Launch docker container which will tar logs.
async function downloadLogs() {
  const logArchiveBackupPath = '/backup/' + constants.NODE_LOG_ARCHIVE_TEMP;

  const backUpCommandOptions = [
    'run',
    '--rm',
    '-v', 'applications_logs:/logs',
    '-v', constants.WORKING_DIRECTORY.concat(':/backup'),
    'alpine',
    'tar', '-cjf', logArchiveBackupPath, '-C', '/logs', './'
  ];

  await bashService.exec('docker', backUpCommandOptions, {});

  const gpgCommandOptions = [
    '--batch', '--yes', // allow overwriting.
    '--output', logArchiveLocalPath,
    '-r', constants.NODE_LOG_ARCHIVE_GPG_RECIPIENT,
    '--trust-model', 'always', // TODO: Can we register our GPG public key with some CA?
    '--encrypt', logArchiveLocalPathTemp
  ];

  await bashService.exec('gpg', gpgCommandOptions, {});

  return logArchiveLocalPath;
}

// Remove log archive.
function deleteLogArchives() {
  const options = {
    cwd: constants.WORKING_DIRECTORY
  };

  bashService.exec('rm', ['-f', logArchiveLocalPath, logArchiveLocalPathTemp], options);
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

    clearInterval(autoImagePullInterval);
    await pullAllImages();
    await startAutoImagePull();
    systemStatus.error = false;
  } catch (error) {
    systemStatus.error = true;
  } finally {
    systemStatus.updating = false;
  }
}

module.exports = {
  downloadLogs,
  deleteLogArchives,
  getSerial,
  getSystemStatus,
  getFilteredVersions,
  saveSettings,
  shutdown,
  startup,
  reset,
  resyncChainFromServer,
  userReset,
  update,
};
