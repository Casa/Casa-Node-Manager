/**
 * Handles all routes regarding settings for containers.
 */

const express = require('express');
const router = express.Router();
const LNNodeError = require('models/errors.js').NodeError;

const applicationLogic = require('logic/application.js');
const auth = require('middlewares/auth.js');
const diskLogic = require('logic/disk.js');
const schemaValidator = require('utils/settingsSchema.js');
const safeHandler = require('utils/safeHandler');

router.post('/save', auth.jwt, safeHandler((req, res, next) => {
  const settings = {
    bitcoind: {
      bitcoinNetwork: req.body.network,
      bitcoindListen: req.body.bitcoindListen, // eslint-disable-line object-shorthand
    },
    lnd: {
      lndNodeAlias: req.body.nickName,
      lndNetwork: req.body.network,
      autopilot: req.body.autopilot,
      maxChannels: req.body.maxChannels,
      maxChanSize: req.body.maxChanSize,
      externalIP: req.body.externalIP,
    }
  };

  const validation = schemaValidator.validateSparseSettingsSchema(settings);
  if (!validation.valid) {
    return next(new LNNodeError(validation.errors));
  }

  return applicationLogic.saveSettings(settings)
    .then(() => res.json())
    .catch(() => next(new LNNodeError('Unable to save settings')));
}));

router.get('/read', auth.jwt, safeHandler((req, res, next) =>
  diskLogic.readSettingsFile()
    .then(config => {

      // RPC credentials should not be sent to the user until we have https and a use case for the user to have them.
      delete config.bitcoind.rpcPassword;
      delete config.bitcoind.rpcUser;

      // Renaming lndNodeAlias to nickName.
      config.lnd.nickName = config.lnd.lndNodeAlias;
      delete config.lnd.lndNodeAlias;

      // externalIP was added after initial release. It may not exist in the data store of all nodes. We will default
      // this to return an empty array to the front end to guarantee the front end always receives a consistent schema.
      config.lnd.externalIP = config.lnd.externalIP || '';

      res.json(config);
    })
    .catch(() => next(new LNNodeError('Unable to read settings')))
));

module.exports = router;
