const constants = require('utils/const.js');
const diskService = require('services/disk.js');

async function deleteUserFile() {
  return await diskService.deleteFile(constants.USER_PASSWORD_FILE);
}

function readUserFile() {
  return diskService.readJsonFile(constants.USER_PASSWORD_FILE);
}

function readSettingsFile() {
  return diskService.readJsonFile(constants.SETTINGS_FILE);
}

function writeSettingsFile(data) {
  return diskService.writeJsonFile(constants.SETTINGS_FILE, data);
}

async function writeUserFile(data) {
  return diskService.writeJsonFile(constants.USER_PASSWORD_FILE, data);
}

function settingsFileExists() {
  return diskService.readJsonFile(constants.SETTINGS_FILE)
    .then(() => Promise.resolve(true))
    .catch(() => Promise.resolve(false));
}

function hiddenServiceFileExists() {
  return readHiddenService()
    .then(() => Promise.resolve(true))
    .catch(() => Promise.resolve(false));
}

function readHiddenService() {
  return diskService.readFile(constants.CASA_NODE_HIDDEN_SERVICE_FILE);
}

function readJWTPrivateKeyFile() {
  return diskService.readFile(constants.JWT_PRIVATE_KEY_FILE);
}

function readJWTPublicKeyFile() {
  return diskService.readFile(constants.JWT_PUBLIC_KEY_FILE);
}

function writeJWTPrivateKeyFile(data) {
  return diskService.writeKeyFile(constants.JWT_PRIVATE_KEY_FILE, data);
}

function writeJWTPublicKeyFile(data) {
  return diskService.writeKeyFile(constants.JWT_PUBLIC_KEY_FILE, data);
}

module.exports = {
  deleteUserFile,
  readSettingsFile,
  readUserFile,
  writeSettingsFile,
  writeUserFile,
  settingsFileExists,
  hiddenServiceFileExists,
  readHiddenService,
  readJWTPrivateKeyFile,
  readJWTPublicKeyFile,
  writeJWTPrivateKeyFile,
  writeJWTPublicKeyFile,
};
