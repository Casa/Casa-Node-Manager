const express = require('express');
const router = express.Router();

const applicationLogic = require('logic/application.js');
const authLogic = require('logic/auth.js');

const auth = require('middlewares/auth.js');
const changePasswordAuthHandler = require('middlewares/changePasswordAuthHandler.js');

const constants = require('utils/const.js');
const safeHandler = require('utils/safeHandler');
const validator = require('utils/validator.js');

const COMPLETE = 100;

// Endpoint to change your lnd password. Wallet must exist and be unlocked. This endpoint is authorized with basic auth
// or the property password from the body.
router.post('/changePassword', auth.convertReqBodyToBasicAuth, auth.basic, changePasswordAuthHandler, safeHandler(async(req, res, next) => {

  // Use password from the body by default. Basic auth has issues handling special characters.
  const currentPassword = req.body.password;
  const newPassword = req.body.newPassword;

  const jwt = await authLogic.refresh(req.user);

  try {
    validator.isString(currentPassword);
    validator.isMinPasswordLength(currentPassword);
    validator.isString(newPassword);
    validator.isMinPasswordLength(newPassword);
  } catch (error) {
    return next(error);
  }

  const status = await authLogic.getChangePasswordStatus();

  // return a conflict if a change password process is already running
  if (status.percent > 0 && status.percent !== COMPLETE) {
    return res.status(constants.STATUS_CODES.CONFLICT).json();
  }

  // start change password process in the background and immediately return
  authLogic.changePassword(currentPassword, newPassword, jwt.jwt);

  return res.status(constants.STATUS_CODES.ACCEPTED).json();
}));

// Returns the current status of the change password process.
router.get('/changePassword/status', auth.jwt, safeHandler(async(req, res) => {
  const status = await authLogic.getChangePasswordStatus();

  return res.status(constants.STATUS_CODES.OK).json(status);
}));

// Registered does not need auth. This is because the user may not be registered at the time and thus won't always have
// an auth token.
router.get('/registered', safeHandler((req, res) =>
  authLogic.isRegistered()
    .then(registered => res.json(registered))
));

// Endpoint to register a password with the device. Wallet must not exist. This endpoint is authorized with basic auth
// or the property password from the body.
router.post('/register', auth.convertReqBodyToBasicAuth, auth.register, safeHandler((req, res) =>
  authLogic.register(req.user)
    .then(jwt => res.json(jwt))
));

router.post('/login', auth.convertReqBodyToBasicAuth, auth.basic, safeHandler((req, res) =>
  applicationLogic.login(req.user)
    .then(jwt => res.json(jwt))
));

router.post('/refresh', auth.jwt, safeHandler((req, res) =>
  applicationLogic.refresh(req.user)
    .then(jwt => res.json(jwt))
));

module.exports = router;
