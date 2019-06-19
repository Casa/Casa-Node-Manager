const constants = require('utils/const.js');
const ValidationError = require('models/errors.js').ValidationError;
const UPDATABLE_SERVICES = [constants.SERVICES.LND, constants.SERVICES.BITCOIND, constants.SERVICES.LNAPI,
  constants.SERVICES.SPACE_FLEET, constants.SERVICES.SYSLOG, constants.SERVICES.PAPERTRAIL,
  constants.SERVICES.LOGSPOUT];

function isUpdatableService(service) {
  if (!UPDATABLE_SERVICES.includes(service)) {
    throw new ValidationError('Unknown service or not updatable');
  }
}

function isBoolean(key, value) {
  if (value !== true && value !== false) {
    throw new ValidationError(key + ': Must be true or false.');
  }
}

module.exports = {
  isUpdatableService,
  isBoolean
};
