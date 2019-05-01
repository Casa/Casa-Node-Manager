const axios = require('axios');
const lnapiUrl = 'http://127.0.0.1';
const lnapiPort = 3002;

async function unlockLnd(password, jwt) {

  const headers = {
    headers: {
      Authorization: 'JWT ' + jwt
    }
  };

  const body = {
    password,
  };

  return axios
    .post(lnapiUrl + ':' + lnapiPort + '/v1/lnd/wallet/unlock', body, headers);
}

async function getBitcoindAddresses(jwt) {

  const headers = {
    headers: {
      Authorization: 'JWT ' + jwt
    }
  };

  return axios
    .get(lnapiUrl + ':' + lnapiPort + '/v1/bitcoind/info/addresses', headers);
}

// Perform backup only when LND is not processing.
async function backUpLndData(jwt) {
  const headers = {
    headers: {
      Authorization: 'JWT ' + jwt
    }
  };

  return axios
    .post(lnapiUrl + ':' + lnapiPort + '/v1/lnd/util/backup', {}, headers);
}

module.exports = {
  unlockLnd,
  getBitcoindAddresses,
  backUpLndData,
};
