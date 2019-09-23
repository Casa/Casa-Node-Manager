var q = require('q');

function promisify(object) {
  var deferred = q.defer();
  deferred.resolve(object);
  return deferred.promise;
}

function promiseReject(object) {
  var deferred = q.defer();
  deferred.reject(object);
  return deferred.promise;
}

module.exports = {
  promisify,
  promiseReject,
};