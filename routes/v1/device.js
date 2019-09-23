const express = require('express');
const router = express.Router();

const applicationLogic = require('logic/application.js');
const auth = require('middlewares/auth.js');
const safeHandler = require('utils/safeHandler');
const validator = require('utils/validator.js');

const DockerPullingError = require('models/errors.js').DockerPullingError;

const PRECONDITION_FAILED = 412;

router.post('/chain-reset', auth.jwt, safeHandler(async(req, res) => {
  // TODO come up with unified strategy on handling resets
  if ((await applicationLogic.getSystemStatus()).resync) {
    return res.status(PRECONDITION_FAILED).json({status: 'bitcoind-already-resetting'});
  } else {

    // we ignore async call and allow processing to continue in the background
    applicationLogic.resyncChain(true, false);

    return res.json({status: 'chain-reset'});
  }
}));

router.post('/factory-reset', auth.jwt, safeHandler((req, res) => {
  applicationLogic.reset(true);

  return res.json({status: 'factory-reset'});
}));

router.post('/resync-chain', auth.accountJWTProtected, safeHandler(async(req, res) => {

  const full = req.body.full; // optional parameter to fully wipe all bitcoind data

  // TODO come up with unified strategy on handling resets
  if ((await applicationLogic.getSystemStatus()).resync) {
    return res.status(PRECONDITION_FAILED).json({status: 'bitcoind-already-resyncing'});
  } else {
    // we ignore async call and allow processing to continue in the background
    applicationLogic.resyncChain(full, true);

    return res.json({status: 'bitcoind-reset'});
  }
}));

router.post('/user-reset', auth.accountJWTProtected, safeHandler((req, res) => {
  applicationLogic.userReset();

  return res.json({status: 'user-reset'});
}));

// Use auth.basic for consistency with update manager
router.post('/shutdown', auth.convertReqBodyToBasicAuth, auth.basic, safeHandler((req, res) => { // eslint-disable-line arrow-body-style
  return applicationLogic.shutdown()
    .then(() => {
      res.json({status: 'shutdown'});
    })
    .catch(function(error) {
      if (error instanceof DockerPullingError) {
        res.status(PRECONDITION_FAILED).json({
          message: 'Cannot Shutdown. We are downloading new software. Try again in 30 minutes.'
        });
      } else {
        throw error;
      }
    });
}));

router.post('/update', auth.jwt, safeHandler((req, res, next) => {
  const services = req.body.services;

  for (const service of services) {
    try {
      validator.isUpdatableService(service);
    } catch (error) {
      return next(error);
    }
  }

  return applicationLogic.update(services)
    .then(applicationNames => res.json(applicationNames));
}));

module.exports = router;
