const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
var path = require('path');

// manager startup mocks
require('module-alias/register');
require('module-alias').addPath('.');

// For mocking all dates established at manager boot time. Specifically lastImagePulled in logic/application.js.
// Clock mock must be before applicationStartup mock.
global.clock = sinon.useFakeTimers({
  now: 1546329600000, // January 1, 2019 Midnight PST
  shouldAdvanceTime: false,
});

global.uuidSerialId = sinon.stub(require('../utils/UUID.js'), 'fetchSerial')
  .resolves('fake_serial_id');
global.applicationStartup = sinon.stub(require('../logic/application.js'), 'startup')
  .resolves({});
global.uuidBootId = sinon.stub(require('../utils/UUID.js'), 'fetchBootUUID')
  .returns('fake_boot_id');
global.appRoot = path.resolve(__dirname);

const mockLog = global.appRoot + '/fixtures/logs/sample-casa-lightning-node-logs.tar.bz2';
global.downloadLogsStub = sinon.stub(require('../logic/logs.js'), 'downloadLogs').resolves(mockLog);

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
};

after(() => {
  global.requester.close();
});
