/* eslint-disable id-length */
/* eslint-disable no-magic-numbers */
const UUID = require('utils/UUID');

module.exports = {
  CASA_NODE_HIDDEN_SERVICE_FILE: '/var/lib/tor/casa-node/hostname',
  COMPOSE_FILES: {
    DEVICE_HOST: 'device-host.yml',
    DOWNLOAD: 'download.yml',
    LIGHTNING_NODE: 'lightning-node.yml',
    LOGSPOUT: 'logspout.yml',
    MANAGER: 'manager.yml',
    TOR: 'tor.yml',
    WELCOME: 'welcome.yml'
  },
  WORKING_DIRECTORY: '/usr/local/casa/applications',
  LOGGING_DOCKER_COMPOSE_FILE: 'logspout.yml',
  NODE_LOG_ARCHIVE_TEMP: 'casa-lightning-node-logs-temp.tar.bz2',
  NODE_LOG_ARCHIVE: 'casa-lightning-node-logs.tar.bz2',
  REQUEST_CORRELATION_NAMESPACE_KEY: 'manager-request',
  REQUEST_CORRELATION_ID_KEY: 'reqId',
  SERIAL: process.env.SERIAL || UUID.fetchSerial() || 'UNKNOWN',
  SETTINGS_FILE: process.env.SETTINGS_FILE || '/settings/settings.json',
  SERVICES: {
    DEVICE_HOST: 'device-host',
    BITCOIND: 'bitcoind',
    DOWNLOAD: 'download',
    LNAPI: 'lnapi',
    LND: 'lnd',
    LOGSPOUT: 'logspout',
    MANAGER: 'manager',
    PAPERTRAIL: 'papertrail',
    SPACE_FLEET: 'space-fleet',
    SYSLOG: 'syslog',
    TOR: 'tor',
    UPDATE_MANAGER: 'update-manager',
    WELCOME: 'welcome'
  },
  TAG: process.env.TAG || 'arm',
  TIME: {
    FIVE_MINUTES_IN_MILLIS: 5 * 60 * 1000,
    ONE_DAY_IN_MILLIS: 24 * 60 * 60 * 10001000,
    ONE_SECOND_IN_MILLIS: 1000,
    ONE_HOUR_IN_MILLIS: 60 * 60 * 1000,
    NINETY_MINUTES_IN_MILLIS: 90 * 60 * 1000,
    HOURS_IN_TWO_DAYS: 47,
  },
  LOGGING_SERVICES: ['syslog', 'papertrail', 'logspout'],
  USER_PASSWORD_FILE: process.env.USER_PASSWORD_FILE || '/accounts/user.json',
  CANONICAL_YML_DIRECTORY: process.env.CANONICAL_YML_DIRECTORY || './resources',
  JWT_PRIVATE_KEY_FILE: process.env.JWT_PRIVATE_KEY_FILE || './resources/jwt.key',
  JWT_PUBLIC_KEY_FILE: process.env.JWT_PUBLIC_KEY_FILE || './resources/jwt.pem',
  NODE_LOG_ARCHIVE_GPG_RECIPIENT: 'node-logs@team.casa',
  DOCKER_ORGANIZATION: 'casanode',
  LAUNCH_SCRIPT: 'launch.sh',
  LAUNCH_DIRECTORY: '/usr/local/casa',
};
