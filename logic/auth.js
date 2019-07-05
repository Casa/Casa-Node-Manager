const diskLogic = require('logic/disk.js');
const NodeError = require('models/errors.js').NodeError;
const JWTHelper = require('utils/jwt.js');

async function isRegistered() {
  try {
    await diskLogic.readUserFile();

    return {registered: true};
  } catch (error) {
    return {registered: false};
  }
}

async function login(user) {
  try {
    const jwt = await JWTHelper.generateJWT(user.username);

    return {jwt: jwt}; // eslint-disable-line object-shorthand
  } catch (error) {
    throw new NodeError('Unable to generate JWT');
  }
}

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

async function refresh(user) {
  try {
    const jwt = await JWTHelper.generateJWT(user.username);

    return {jwt: jwt}; // eslint-disable-line object-shorthand
  } catch (error) {
    throw new NodeError('Unable to generate JWT');
  }
}

module.exports = {
  isRegistered,
  login,
  register,
  refresh,
};
