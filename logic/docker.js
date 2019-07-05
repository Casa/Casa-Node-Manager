/*
All docker business logic goes here.
 */

const DockerError = require('models/errors.js').DockerError;
const dockerService = require('services/docker.js');
const constants = require('utils/const.js');

const q = require('q'); // eslint-disable-line id-length

async function ensureTorVolumes() {

  // Create tor volumes. This ensures they are created the very first time the manager runs.
  await dockerService.createVolume('applications_tor-cookie');
  await dockerService.createVolume('applications_tor-hidden-services');
}

function getAllContainers() {
  return dockerService.getContainers(true);
}

function getRunningContainers() {
  return dockerService.getContainers(false);
}

function pruneContainers() {
  return dockerService.pruneContainers();
}

function pruneNetworks() {
  return dockerService.pruneNetworks();
}

function pruneVolumes() {
  return dockerService.pruneVolumes();
}

function pruneImages(all) {
  return dockerService.pruneImages(all);
}

function getImages() {
  return dockerService.getImages();
}

async function getStatuses() {

  var data = {};

  const containers = await getAllContainers();

  var statuses = [];
  containers.forEach(function(container) {
    // TODO: Filter out problematic welcome service, need to fix properly by shutting it down.
    if (container['Labels']['com.docker.compose.service'] === constants.SERVICES.WELCOME) {
      return;
    }
    if (container['Labels']['com.docker.compose.service'] === constants.SERVICES.DEVICE_HOST) {
      return;
    }
    statuses.push({
      id: container['Id'],
      service: container['Labels']['com.docker.compose.service'],
      image: container['Image'],
      image_id: container['ImageID'], // eslint-disable-line camelcase
      status: container['State'],
      created: container['Created'],
      message: container['Status'],
    });
  });

  data['containers'] = statuses;

  return data;
}

// We need to parse image name from the docker image on the device. Generally, there is only one
// image on device and one service that corresponds to that image. However, when we have downloaded the latest
// image onto the device, there then exists two images for a given service. One corresponding to the container and
// one corresponding to the newly downloaded image. Because of this, container['Image'] is turned into a
// sha256 hash by docker. In those instances, we need to use the service for lookup.
function getServiceFromImage(image, defaultName) {
  const slashIndex = image.indexOf('/');
  const semiIndex = image.indexOf(':');
  const service = image.substr(slashIndex + 1, semiIndex - slashIndex - 1);

  // If we are only able to find a sha, return the default.
  if (service !== 'sha256') {
    return service;
  } else {
    return defaultName;
  }
}

// Do we have an image for the given service on device.
async function hasImageForService(service) {
  const images = await dockerService.getImages();

  for (const image of images) {
    // RepoTags is a nullable array. We have to null check and then loop over each tag.
    if (image.RepoTags) {
      for (const tag of image.RepoTags) {
        // example tag 'casanode/manager:arm'
        if (tag.includes('/') && tag.split('/')[1].split(':')[0] === service) {

          return true;
        }
      }
    }
  }

  return false;
}

// Returns true if the given service is currently running.
async function isRunningService(service) {
  const containers = await getAllContainers();

  for (const container of containers) {
    const dockerComposeService = container['Labels']['com.docker.compose.service'];
    const containerImage = container['Image'];

    if (getServiceFromImage(containerImage, dockerComposeService) === service) {
      return true;
    }
  }

  return false;
}

// Get the version and updatable status of each running container.
async function getVersions() {
  const versions = {};
  const imageDict = {};

  const containers = await getAllContainers();
  const images = await dockerService.getImages();

  for (const image of images) {
    // RepoTags is a nullable array. We have to null check and then loop over each tag.
    if (image.RepoTags) {
      for (const tag of image.RepoTags) {
        if (tag.includes('/')
          && tag.split(':')[1] === constants.TAG
          && tag.split(':')[0].includes(constants.DOCKER_ORGANIZATION)) {

          const service = getServiceFromImage(tag);
          imageDict[service] = image;
        }
      }
    }
  }

  for (const container of containers) {
    const service = container['Labels']['com.docker.compose.service'];
    const containerVersion = container['ImageID'];
    const containerImage = container['Image'];

    const lookupService = getServiceFromImage(containerImage, service);

    // During migration from `casacomputer` to `casanode` we cannot always retrieve the correct image. Filter for only
    // casanode* images.
    let updatable = false;
    let imageVersion = 'old-service';
    if (imageDict[lookupService]) {
      imageVersion = imageDict[lookupService]['Id'];
      updatable = containerVersion !== imageVersion;
    }

    // TODO: Filter out problematic welcome service, need to fix properly by shutting it down.
    if (service === constants.SERVICES.WELCOME) {
      continue;
    }

    versions[service] = {
      containerVersion: containerVersion, // eslint-disable-line object-shorthand
      imageVersion: imageVersion, // eslint-disable-line object-shorthand
      updatable: updatable, // eslint-disable-line object-shorthand
    };

  }

  return versions;
}

function getVolumeUsage() {
  var deferred = q.defer();

  function parseVolumeInfo(df) {
    var volumeInfo = [];
    df['Volumes'].forEach(function(volume) {
      volumeInfo.push({
        name: volume['Name'],
        usage: volume['UsageData']['Size']
      });
    });

    return volumeInfo;
  }

  function handleSuccess(volumeInfo) {
    deferred.resolve(volumeInfo);
  }

  function handleError() {
    deferred.reject(new DockerError('Unable to determine volume info'));
  }

  dockerService.getDiskUsage()
    .then(parseVolumeInfo)
    .then(handleSuccess)
    .catch(handleError);

  return deferred.promise;
}

const getLogs = async() => {
  var logs = [];

  var containers = await getAllContainers();

  for (const container of containers) {
    var containerLog = await dockerService.getContainerLogs(container.Id);

    logs.push({
      container: container['Labels']['com.docker.compose.service'],
      logs: containerLog
    });
  }

  return logs;
};

const stopNonPersistentContainers = async() => { // eslint-disable-line id-length
  var containers = await getRunningContainers();

  for (const container of containers) {
    if (container['Labels']['casa'] === null || container['Labels']['casa'] !== 'persist') {
      try {
        await dockerService.stopContainer(container.Id);
      } catch (error) {
        // There's a race condition, if the container is restarting it will receive a 404.
        // Restart policies can be circumvented.
        await dockerService.removeContainer(container.Id, true);
      }
    }
  }
};

async function removeVolume(name) {
  return dockerService.removeVolume(name);
}

module.exports = {
  ensureTorVolumes,
  getImages,
  getStatuses,
  getVersions,
  getVolumeUsage,
  getLogs,
  hasImageForService,
  isRunningService,
  stopNonPersistentContainers, // eslint-disable-line id-length
  pruneContainers,
  pruneNetworks,
  pruneVolumes,
  pruneImages,
  removeVolume,
};
