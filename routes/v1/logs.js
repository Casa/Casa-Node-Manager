const express = require('express');
const router = express.Router();
const logsLogic = require('logic/logs.js');
const constants = require('utils/const.js');
const safeHandler = require('utils/safeHandler');

router.get('/download', safeHandler((req, res) =>
  logsLogic.downloadLogs()
    .then(logfile => res.download(logfile, constants.NODE_LOG_ARCHIVE, function callback() {
      logsLogic.deleteLogArchives();
    }))
));

module.exports = router;
