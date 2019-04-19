const bashService = require('services/bash.js');
const constants = require('utils/const.js');

const logArchiveLocalPath = constants.WORKING_DIRECTORY + '/' + constants.NODE_LOG_ARCHIVE;
const logArchiveLocalPathTemp = constants.WORKING_DIRECTORY + '/' + constants.NODE_LOG_ARCHIVE_TEMP;

// Launch docker container which will tar logs.
async function downloadLogs() {
  const logArchiveBackupPath = '/backup/' + constants.NODE_LOG_ARCHIVE_TEMP;

  const backUpCommandOptions = [
    'run',
    '--rm',
    '-v', 'applications_logs:/logs',
    '-v', constants.WORKING_DIRECTORY.concat(':/backup'),
    'alpine',
    'tar', '-cjf', logArchiveBackupPath, '-C', '/logs', './'
  ];

  await bashService.exec('docker', backUpCommandOptions, {});

  const gpgCommandOptions = [
    '--batch', '--yes', // allow overwriting.
    '--output', logArchiveLocalPath,
    '-r', constants.NODE_LOG_ARCHIVE_GPG_RECIPIENT,
    '--trust-model', 'always', // TODO: Can we register our GPG public key with some CA?
    '--encrypt', logArchiveLocalPathTemp
  ];

  await bashService.exec('gpg', gpgCommandOptions, {});

  return logArchiveLocalPath;
}

// Remove log archive.
function deleteLogArchives() {
  const options = {
    cwd: constants.WORKING_DIRECTORY
  };

  bashService.exec('rm', ['-f', logArchiveLocalPath, logArchiveLocalPathTemp], options);
}

module.exports = {
  downloadLogs,
  deleteLogArchives,
};
