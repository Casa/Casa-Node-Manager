const express = require('express');
const router = express.Router();
const applicationLogic = require('logic/application.js');
const dockerLogic = require('logic/docker.js');
const auth = require('middlewares/auth.js');
const safeHandler = require('utils/safeHandler');

router.get('/addresses', safeHandler((req, res) =>
  applicationLogic.getAddresses()
    .then(addresses => res.json(addresses))
));

router.get('/boot', safeHandler((req, res) =>
  applicationLogic.getBootPercent()
    .then(percent => res.json({percent: percent}))
));

router.get('/version', auth.jwt, safeHandler((req, res) =>
  applicationLogic.getFilteredVersions()
    .then(versions => res.json(versions))
));

router.get('/serial', auth.jwt, safeHandler((req, res) =>
  applicationLogic.getSerial()
    .then(statuses => res.json(statuses))
));

router.get('/status', auth.jwt, safeHandler((req, res) =>
  dockerLogic.getStatuses()
    .then(statuses => res.json(statuses))
));

router.get('/volumes', auth.jwt, safeHandler((req, res) =>
  dockerLogic.getVolumeUsage()
    .then(volumeInfo => res.json(volumeInfo))
));

router.get('/logs', auth.jwt, safeHandler((req, res) =>
  dockerLogic.getLogs()
    .then(logs => res.json(logs))
));

router.get('/system-status', safeHandler((req, res) =>
  applicationLogic.getSystemStatus()
    .then(status => res.json(status))
));

module.exports = router;
