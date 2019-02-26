const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');

// manager startup mocks
require('module-alias/register');
require('module-alias').addPath('.');

// For mocking all dates established at manager boot time. Specifically lastImagePulled in logic/application.js.
// Clock mock must be before applicationStartup mock.
global.clock = sinon.useFakeTimers({
  now: 1546329600000, // January 1, 2019 Midnight PST
  shouldAdvanceTime: false,
});

global.applicationStartup = sinon.stub(require('../logic/application.js'), 'startup')
  .resolves({});
global.uuidBootId = sinon.stub(require('../utils/UUID.js'), 'fetchBootUUID')
  .resolves('fake_boot_id');
global.uuidSerialId = sinon.stub(require('../utils/UUID.js'), 'fetchSerial')
  .resolves('fake_serial_id');
global.diskReadJWTPublicKeyFile = sinon.stub(require('../logic/disk.js'), 'readJWTPublicKeyFile')
  .resolves(Buffer.from('2d2d2d2d2d424547494e205055424c4943204b45592d2d2d2d2d0a4d4677774451594a4b6f5a496876634e41514542425141445377417753414a42414a6949444e682b6770544f3937627135574748657476323267465a47736f4a0a6e6b54665058774335726a61674b4d56455a4a4a47584e6d51544e7441596e53615a31754a6e692f48356b4b32594e614a333933326730434177454141513d3d0a2d2d2d2d2d454e44205055424c4943204b45592d2d2d2d2d', 'hex'));

// require and start app
const server = require('../app.js');

chai.use(chaiHttp);
chai.should();

global.expect = chai.expect;
global.assert = chai.assert;

before(() => {
  global.requester = chai.request(server).keepOpen();
});

global.reset = () => {
  global.clock.restore();
  global.applicationStartup.restore();
  global.uuidBootId.restore();
  global.uuidSerialId.restore();
  global.diskReadJWTPublicKeyFile.restore();
};

after(() => {
  global.requester.close();
});
