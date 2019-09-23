const constants = require('utils/const.js');
const ValidationError = require('models/errors.js').ValidationError;
const UPDATABLE_SERVICES = [constants.SERVICES.LND, constants.SERVICES.BITCOIND, constants.SERVICES.LNAPI,
  constants.SERVICES.SPACE_FLEET, constants.SERVICES.SYSLOG, constants.SERVICES.PAPERTRAIL,
  constants.SERVICES.LOGSPOUT];

const MAX_ALIAS_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

function isBoolean(key, value) {
  if (value !== true && value !== false) {
    throw new ValidationError(key + ': Must be true or false.');
  }
}

function isString(object) {
  if (typeof object !== 'string') {
    throw new ValidationError('Object must be of type string.');
  }
}

function isMinPasswordLength(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError('Must be ' + MIN_PASSWORD_LENGTH + ' or more characters.');
  }
}

function isUpdatableService(service) {
  if (!UPDATABLE_SERVICES.includes(service)) {
    throw new ValidationError('Unknown service or not updatable');
  }
}

function isValidAliasLength(object) {
  if (Buffer.byteLength(String(object), 'utf8') > MAX_ALIAS_LENGTH) {
    throw new ValidationError('Must be less than ' + MAX_ALIAS_LENGTH + ' bytes.');
  }
}

module.exports = {
  isBoolean,
  isString,
  isMinPasswordLength,
  isUpdatableService,
  isValidAliasLength,
};
