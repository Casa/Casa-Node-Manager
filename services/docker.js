var Docker = require('dockerode');
var docker = new Docker();

var q = require('q'); // eslint-disable-line id-length

function getContainers(all) {
  var deferred = q.defer();

  docker.listContainers({all: all}, function(err, containers) { // eslint-disable-line object-shorthand
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(containers);
    }
  });

  return deferred.promise;
}

function getDiskUsage() {
  var deferred = q.defer();

  docker.df(function(err, df) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(df);
    }
  });

  return deferred.promise;
}

function getContainerLogs(containerId) {
  var deferred = q.defer();

  var container = docker.getContainer(containerId);

  container.logs({tail: 100, stdout: true, stderr: true}, function(error, logs) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(logs.replace(/\0/g, ''));
    }
  });

  return deferred.promise;
}

function getImages() {
  var deferred = q.defer();

  docker.listImages({}, function(err, images) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(images);
    }
  });

  return deferred.promise;
}

function stopContainer(containerId) {
  var deferred = q.defer();

  var container = docker.getContainer(containerId);

  container.stop({t: 30}, function(error, result) { // eslint-disable-line id-length
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

function removeContainer(containerId, force = false) {
  var deferred = q.defer();
  var options = {
    force: force // eslint-disable-line object-shorthand
  };
  var container = docker.getContainer(containerId);

  container.remove(options, function(error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

function pruneContainers() {
  var deferred = q.defer();

  docker.pruneContainers({force: true}, function(error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

const ignorePersistentArtifactsFilter = {'label!': ['casa=persist']}; // eslint-disable-line id-length

function pruneNetworks() {
  var deferred = q.defer();

  docker.pruneNetworks({force: true, filters: ignorePersistentArtifactsFilter}, function(error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

function pruneVolumes() {
  var deferred = q.defer();

  docker.pruneVolumes({force: true, filters: ignorePersistentArtifactsFilter}, function(error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

function pruneImages(dangling = false) {
  var deferred = q.defer();

  const imageFilter = ignorePersistentArtifactsFilter;

  if (dangling) {
    imageFilter.dangling = ['0']; // prune all images
  }
  docker.pruneImages({filters: imageFilter}, function(error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

function removeVolume(name) {
  var deferred = q.defer();
  var volume = docker.getVolume(name);

  volume.remove({}, function(error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });

  return deferred.promise;
}

module.exports = {
  getContainers,
  getDiskUsage,
  getContainerLogs,
  getImages,
  stopContainer,
  removeContainer,
  pruneContainers,
  pruneNetworks,
  pruneVolumes,
  pruneImages,
  removeVolume,
};
