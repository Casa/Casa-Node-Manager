const bcrypt = require('bcrypt');
const diskLogic = require('logic/disk.js');
const dockerComposeLogic = require('logic/docker-compose.js');
const lnapiService = require('services/lnapi.js');
const NodeError = require('models/errors.js').NodeError;
const JWTHelper = require('utils/jwt.js');
const constants = require('utils/const.js');
const UUID = require('utils/UUID.js');

const saltRounds = 10;
const SYSTEM_USER = UUID.fetchBootUUID() || 'admin';

let devicePassword = '';
let changePasswordStatus;

resetChangePasswordStatus();

function resetChangePasswordStatus() {
  changePasswordStatus = {percent: 0};
}

async function sleepSeconds(seconds) {
  return new Promise(resolve => {
    setTimeout(resolve, seconds * constants.TIME.ONE_SECOND_IN_MILLIS);
  });
}

// Caches the password.
function cachePassword(password) {
  devicePassword = password;
}

// Gets the cached the password.
function getCachedPassword() {
  return devicePassword;
}

// Change the device and lnd password.
async function changePassword(currentPassword, newPassword, jwt) {

  // restart lnd
  resetChangePasswordStatus();
  changePasswordStatus.percent = 1; // eslint-disable-line no-magic-numbers
  await dockerComposeLogic.dockerComposeStop({service: constants.SERVICES.LND});
  changePasswordStatus.percent = 40; // eslint-disable-line no-magic-numbers
  await dockerComposeLogic.dockerComposeUpSingleService({service: constants.SERVICES.LND});

  let complete = false;
  let attempt = 0;
  const MAX_ATTEMPTS = 20;

  do {
    try {
      attempt++;

      // call lnapi to change password
      changePasswordStatus.percent = 60 + attempt; // eslint-disable-line no-magic-numbers
      await lnapiService.changePassword(currentPassword, newPassword, jwt);

      // make new password file
      const credentials = hashCredentials(SYSTEM_USER, newPassword);

      // replace user file
      await diskLogic.deleteUserFile();
      await diskLogic.writeUserFile(credentials);

      complete = true;

      // cache the password for later use
      cachePassword(newPassword);

      changePasswordStatus.percent = 100;
    } catch (error) {

      // wait for lnd to boot up
      if (error.response.status === constants.STATUS_CODES.BAD_GATEWAY) {
        await sleepSeconds(1);

      // user supplied incorrect credentials
      } else if (error.response.status === constants.STATUS_CODES.FORBIDDEN) {
        changePasswordStatus.forbidden = true;

      // unknown error occurred
      } else {
        changePasswordStatus.error = true;
        changePasswordStatus.percent = 100;

        throw error;
      }
    }
  } while (!complete && attempt < MAX_ATTEMPTS && !changePasswordStatus.unauthorized && !changePasswordStatus.error);

  if (!complete && attempt === MAX_ATTEMPTS) {
    changePasswordStatus.error = true;
    changePasswordStatus.percent = 100;

    throw new Error('Unable to change password. Lnd would not restart properly.');
  }

}

function getChangePasswordStatus() {
  return changePasswordStatus;
}

// Returns an object with the hashed credentials inside.
function hashCredentials(username, password) {
  const hash = bcrypt.hashSync(password, saltRounds);

  return {password: hash, username};
}

// Returns true if the user is registered otherwise false.
async function isRegistered() {
  try {
    await diskLogic.readUserFile();

    return {registered: true};
  } catch (error) {
    return {registered: false};
  }
}

// Log the user into the device. Caches the password if login is successful. Then returns jwt.
async function login(user) {
  try {
    const jwt = await JWTHelper.generateJWT(user.username);
    cachePassword(user.password);

    return {jwt: jwt}; // eslint-disable-line object-shorthand
  } catch (error) {
    throw new NodeError('Unable to generate JWT');
  }
}

// Registers the the user to the device. Returns an error if a user already exists.
async function register(user) {
  if ((await isRegistered()).registered) {
    throw new NodeError('User already exists', 400); // eslint-disable-line no-magic-numbers
  }

  try {
    await diskLogic.writeUserFile({password: user.password});
  } catch (error) {

    throw new NodeError('Unable to register');
  }

  try {
    const jwt = await JWTHelper.generateJWT(user.username);

    return {jwt: jwt}; // eslint-disable-line object-shorthand
  } catch (error) {
    throw new NodeError('Unable to generate JWT');
  }
}

// Generate and return a new jwt token.
async function refresh(user) {
  try {
    const jwt = await JWTHelper.generateJWT(user.username);

    return {jwt: jwt}; // eslint-disable-line object-shorthand
  } catch (error) {
    throw new NodeError('Unable to generate JWT');
  }
}

module.exports = {
  changePassword,
  getCachedPassword,
  getChangePasswordStatus,
  hashCredentials,
  isRegistered,
  login,
  register,
  refresh,
};
