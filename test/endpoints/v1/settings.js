/* eslint-disable max-len,id-length,no-magic-numbers,no-empty-function,no-undef, max-statements */
/* eslint-env mocha */
/* globals requester */

const uuidv4 = require('uuid/v4');
const fs = require('fs');
const sinon = require('sinon');

const dockerodeMocks = require('../../mocks/dockerode.js');

const randomUsername = uuidv4();
const randomPassword = uuidv4();

let token;

const moveSettingsFile = () => {
  fs.renameSync(`${__dirname}/../../fixtures/settings/settings.json`, `${__dirname}/../../fixtures/settings/settings.json.bak`, err => {
    if (err) {
      throw err;
    }
  });
};

const putBackSettingsFile = () => {
  fs.renameSync(`${__dirname}/../../fixtures/settings/settings.json.bak`, `${__dirname}/../../fixtures/settings/settings.json`, err => {
    if (err) {
      throw err;
    }
  });
};

const restoreOriginalSettingsFile = () => {
  fs.copyFileSync(`${__dirname}/../../fixtures/settings/settings-original.json`, `${__dirname}/../../fixtures/settings/settings.json`, err => {
    if (err) {
      throw err;
    }
  });
};

describe('v1/settings endpoints', () => {

  before(() => {
    // Saving settings performs a `docker-compose up`
    dockerodeListAllContainers = sinon.stub(require('dockerode').prototype, 'listContainers')
      .yields(null, dockerodeMocks.listAllContainers());
    dockerodeListImages = sinon.stub(require('dockerode').prototype, 'listImages')
      .yields(null, dockerodeMocks.listImages());

    const dockerCompose = `${__dirname}/../../../logic/docker-compose.js`;
    dockerComposeUpStub = sinon.stub(require(dockerCompose), 'dockerComposeUpSingleService');
    dockerComposeStopStub = sinon.stub(require(dockerCompose), 'dockerComposeStop');
    dockerComposeRemoveStub = sinon.stub(require(dockerCompose), 'dockerComposeRemove');

    const lnapi = `${__dirname}/../../../services/lnapi.js`;
    unlockLndStub = sinon.stub(require(lnapi), 'unlockLnd');
  });

  after(() => {
    dockerodeListAllContainers.restore();
    dockerodeListImages.restore();
    dockerComposeUpStub.restore();
    dockerComposeStopStub.restore();
    dockerComposeRemoveStub.restore();
    unlockLndStub.restore();

    restoreOriginalSettingsFile();

    // Stop all interval services. Otherwise npm test will not exit.
    const application = `${__dirname}/../../../logic/application.js`;
    require(application).stopIntervalServices();
  });

  // Get a JWT
  // TODO: This should be moved to a place where the code can be shared.
  describe('v1/accounts/register POST', () => {

    it('should register a new user and return a new JWT', done => {

      // Clear any existing users out of the system otherwise a 'User already exists' error will be returned
      fs.writeFile(`${__dirname}/../../fixtures/accounts/user.json`, '', err => {
        if (err) {
          throw err;
        }
      });

      requester
        .post('/v1/accounts/register')
        .auth(randomUsername, randomPassword)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;
          res.body.jwt.should.not.be.empty;
          token = res.body.jwt;
          done();
        });
    });
  });

  describe('v1/settings/read GET', () => {

    it('should get the settings', done => {
      requester
        .get('/v1/settings/read')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);

          // body should correspond to test/fixtures/settings/settings.json
          res.should.be.json;
          res.body.should.have.property('bitcoind');
          res.body.bitcoind.should.have.property('bitcoinNetwork');
          res.body.bitcoind.bitcoinNetwork.should.equal('mainnet');
          res.body.bitcoind.should.have.property('bitcoindListen');
          res.body.bitcoind.bitcoindListen.should.equal(true);
          res.body.bitcoind.should.have.property('bitcoindPort');
          res.body.bitcoind.bitcoindPort.should.equal(8333);
          res.body.should.have.property('lnd');
          res.body.lnd.should.have.property('chain');
          res.body.lnd.chain.should.equal('bitcoin');
          res.body.lnd.should.have.property('backend');
          res.body.lnd.backend.should.equal('bitcoind');
          res.body.lnd.should.have.property('lndNetwork');
          res.body.lnd.lndNetwork.should.equal('mainnet');
          res.body.lnd.should.have.property('autopilot');
          res.body.lnd.autopilot.should.equal(false);
          res.body.lnd.should.have.property('externalIP');
          res.body.lnd.externalIP.should.equal('');
          res.body.lnd.should.have.property('nickName'); // nodeAlias gets converted to nickName
          res.body.lnd.nickName.should.equal('unit-test-node');

          done();
        });
    });

    it('should return an error when the settings file is missing', done => {

      moveSettingsFile();

      requester
        .get('/v1/settings/read')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          putBackSettingsFile();

          if (err) {
            done(err);
          }
          res.should.have.status(500);
          res.body.should.equal('Unable to read settings');

          done();
        });
    });

    it('should not save invalid settings and should return the appropriate validation errors', done => {
      requester
        .post('/v1/settings/save')
        .set('authorization', `JWT ${token}`)
        .send(require(`${__dirname}/../../fixtures/settings/settings-invalid.json`))
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(500);

          res.should.be.json;
          res.body.should.be.an('array');

          res.body[0].should.have.property('property');
          res.body[0].property.should.be.equal('instance.bitcoind.bitcoinNetwork');
          const bitcoinNetwork = res.body[0];
          bitcoinNetwork.should.have.property('message');
          bitcoinNetwork.message.should.equal('is not one of enum values: testnet,mainnet');
          bitcoinNetwork.should.have.property('schema');
          bitcoinNetwork.schema.should.equal('/networks');
          bitcoinNetwork.should.have.property('instance');
          bitcoinNetwork.instance.should.equal('updated-mainnet');
          bitcoinNetwork.should.have.property('name');
          bitcoinNetwork.name.should.equal('enum');
          bitcoinNetwork.should.have.property('argument');
          bitcoinNetwork.argument.should.be.an('array');
          bitcoinNetwork.argument[0].should.equal('testnet');
          bitcoinNetwork.argument[1].should.equal('mainnet');
          bitcoinNetwork.should.have.property('stack');
          bitcoinNetwork.stack.should.equal('instance.bitcoind.bitcoinNetwork is not one of enum values: testnet,mainnet');

          res.body[1].should.have.property('property');
          res.body[1].property.should.be.equal('instance.bitcoind.bitcoindListen');
          const bitcoindListen = res.body[1];
          bitcoindListen.should.have.property('message');
          bitcoindListen.message.should.equal('is not of a type(s) boolean');
          bitcoindListen.should.have.property('schema');
          bitcoindListen.schema.should.have.property('type');
          bitcoindListen.schema.type.should.equal('boolean');
          bitcoindListen.should.have.property('instance');
          bitcoindListen.instance.should.equal('true');
          bitcoindListen.should.have.property('name');
          bitcoindListen.name.should.equal('type');
          bitcoindListen.should.have.property('argument');
          bitcoindListen.argument.should.be.an('array');
          bitcoindListen.argument[0].should.equal('boolean');
          bitcoindListen.should.have.property('stack');
          bitcoindListen.stack.should.equal('instance.bitcoind.bitcoindListen is not of a type(s) boolean');

          res.body[2].should.have.property('property');
          res.body[2].property.should.be.equal('instance.bitcoind.bitcoindPort');
          const bitcoindPort = res.body[2];
          bitcoindPort.should.have.property('message');
          bitcoindPort.message.should.equal('is not of a type(s) integer');
          bitcoindPort.should.have.property('schema');
          bitcoindPort.schema.should.have.property('type');
          bitcoindPort.schema.type.should.equal('integer');
          bitcoindPort.should.have.property('instance');
          bitcoindPort.instance.should.equal('8333');
          bitcoindPort.should.have.property('name');
          bitcoindPort.name.should.equal('type');
          bitcoindPort.should.have.property('argument');
          bitcoindPort.argument.should.be.an('array');
          bitcoindPort.argument[0].should.equal('integer');
          bitcoindPort.should.have.property('stack');
          bitcoindPort.stack.should.equal('instance.bitcoind.bitcoindPort is not of a type(s) integer');

          res.body[3].should.have.property('property');
          res.body[3].property.should.be.equal('instance.lnd.lndNetwork');
          const lndNetwork = res.body[3];
          lndNetwork.should.have.property('message');
          lndNetwork.message.should.equal('is not one of enum values: testnet,mainnet');
          lndNetwork.should.have.property('schema');
          lndNetwork.schema.should.equal('/networks');
          lndNetwork.should.have.property('instance');
          lndNetwork.instance.should.equal('updated-mainnet');
          lndNetwork.should.have.property('name');
          lndNetwork.name.should.equal('enum');
          lndNetwork.should.have.property('argument');
          lndNetwork.argument.should.be.an('array');
          lndNetwork.argument[0].should.equal('testnet');
          lndNetwork.argument[1].should.equal('mainnet');
          lndNetwork.should.have.property('stack');
          lndNetwork.stack.should.equal('instance.lnd.lndNetwork is not one of enum values: testnet,mainnet');

          res.body[4].should.have.property('property');
          res.body[4].property.should.be.equal('instance.lnd.lndNodeAlias');
          const lndNodeAlias = res.body[4];
          lndNodeAlias.should.have.property('message');
          lndNodeAlias.message.should.equal('is not of a type(s) string');
          lndNodeAlias.should.have.property('schema');
          lndNodeAlias.schema.should.have.property('type');
          lndNodeAlias.schema.type.should.equal('string');
          lndNodeAlias.schema.should.have.property('maxLength');
          lndNodeAlias.schema.maxLength.should.equal(32);
          lndNodeAlias.should.have.property('instance');
          lndNodeAlias.instance.should.equal(5);
          lndNodeAlias.should.have.property('name');
          lndNodeAlias.name.should.equal('type');
          lndNodeAlias.should.have.property('argument');
          lndNodeAlias.argument.should.be.an('array');
          lndNodeAlias.argument[0].should.equal('string');
          lndNodeAlias.should.have.property('stack');
          lndNodeAlias.stack.should.equal('instance.lnd.lndNodeAlias is not of a type(s) string');

          res.body[5].should.have.property('property');
          res.body[5].property.should.be.equal('instance.lnd.autopilot');
          const autopilot = res.body[5];
          autopilot.should.have.property('message');
          autopilot.message.should.equal('is not of a type(s) boolean');
          autopilot.should.have.property('schema');
          autopilot.schema.should.have.property('type');
          autopilot.schema.type.should.equal('boolean');
          autopilot.should.have.property('instance');
          autopilot.instance.should.equal('false');
          autopilot.should.have.property('name');
          autopilot.name.should.equal('type');
          autopilot.should.have.property('argument');
          autopilot.argument.should.be.an('array');
          autopilot.argument[0].should.equal('boolean');
          autopilot.should.have.property('stack');
          autopilot.stack.should.equal('instance.lnd.autopilot is not of a type(s) boolean');

          res.body[6].should.have.property('property');
          res.body[6].property.should.be.equal('instance.lnd.maxChannels');
          const maxChannels = res.body[6];
          maxChannels.should.have.property('message');
          maxChannels.message.should.equal('is not of a type(s) integer');
          maxChannels.should.have.property('schema');
          maxChannels.schema.should.have.property('type');
          maxChannels.schema.type.should.equal('integer');
          maxChannels.schema.should.have.property('minimum');
          maxChannels.schema.minimum.should.equal(0);
          maxChannels.should.have.property('instance');
          maxChannels.instance.should.equal('ten');
          maxChannels.should.have.property('name');
          maxChannels.name.should.equal('type');
          maxChannels.should.have.property('argument');
          maxChannels.argument.should.be.an('array');
          maxChannels.argument[0].should.equal('integer');
          maxChannels.should.have.property('stack');
          maxChannels.stack.should.equal('instance.lnd.maxChannels is not of a type(s) integer');

          res.body[7].should.have.property('property');
          res.body[7].property.should.be.equal('instance.lnd.maxChanSize');
          const maxChanSize = res.body[7];
          maxChanSize.should.have.property('message');
          maxChanSize.message.should.equal('is not of a type(s) integer');
          maxChanSize.should.have.property('schema');
          maxChanSize.schema.should.have.property('type');
          maxChanSize.schema.type.should.equal('integer');
          maxChanSize.schema.should.have.property('maximum');
          maxChanSize.schema.maximum.should.equal(16777216);
          maxChanSize.should.have.property('instance');
          maxChanSize.instance.should.equal('one-hundred');
          maxChanSize.should.have.property('name');
          maxChanSize.name.should.equal('type');
          maxChanSize.should.have.property('argument');
          maxChanSize.argument.should.be.an('array');
          maxChanSize.argument[0].should.equal('integer');
          maxChanSize.should.have.property('stack');
          maxChanSize.stack.should.equal('instance.lnd.maxChanSize is not of a type(s) integer');

          res.body[8].should.have.property('property');
          res.body[8].property.should.be.equal('instance.lnd.externalIP');
          const externalIP = res.body[8];
          externalIP.should.have.property('message');
          externalIP.message.should.equal('is not of a type(s) string');
          externalIP.should.have.property('schema');
          externalIP.schema.should.have.property('type');
          externalIP.schema.type.should.equal('string');
          externalIP.should.have.property('instance');
          externalIP.instance.should.equal(100);
          externalIP.should.have.property('name');
          externalIP.name.should.equal('type');
          externalIP.should.have.property('argument');
          externalIP.argument.should.be.an('array');
          externalIP.argument[0].should.equal('string');
          externalIP.should.have.property('stack');
          externalIP.stack.should.equal('instance.lnd.externalIP is not of a type(s) string');

          done();
        });
    });

    it('should not save settings if maxChannel or maxChannelSize is too large', done => {
      const payload = require(`${__dirname}/../../fixtures/settings/settings-original.json`);
      payload.maxChannels = 50;
      payload.maxChanSize = 20000000; // 0.2 BTC

      requester
        .post('/v1/settings/save')
        .set('authorization', `JWT ${token}`)
        .send(payload)
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(500);

          res.should.be.json;
          res.body.should.be.an('array');

          res.body[0].should.have.property('property');
          res.body[0].property.should.be.equal('instance.lnd.maxChannels');
          const maxChannels = res.body[0];
          maxChannels.should.have.property('message');
          maxChannels.message.should.equal('must have a maximum value of 40');
          maxChannels.should.have.property('schema');
          maxChannels.schema.should.have.property('type');
          maxChannels.schema.type.should.equal('integer');
          maxChannels.schema.should.have.property('minimum');
          maxChannels.schema.minimum.should.equal(0);
          maxChannels.schema.should.have.property('maximum');
          maxChannels.schema.maximum.should.equal(40);
          maxChannels.should.have.property('instance');
          maxChannels.instance.should.equal(payload.maxChannels);
          maxChannels.should.have.property('name');
          maxChannels.name.should.equal('maximum');
          maxChannels.should.have.property('argument');
          maxChannels.argument.should.be.an('number');
          maxChannels.argument.should.equal(40);
          maxChannels.should.have.property('stack');
          maxChannels.stack.should.equal('instance.lnd.maxChannels must have a maximum value of 40');

          res.body[1].should.have.property('property');
          res.body[1].property.should.be.equal('instance.lnd.maxChanSize');
          const maxChanSize = res.body[1];
          maxChanSize.should.have.property('message');
          maxChanSize.message.should.equal('must have a maximum value of 16777216');
          maxChanSize.should.have.property('schema');
          maxChanSize.schema.should.have.property('type');
          maxChanSize.schema.type.should.equal('integer');
          maxChanSize.schema.should.have.property('maximum');
          maxChanSize.schema.maximum.should.equal(16777216);
          maxChanSize.should.have.property('instance');
          maxChanSize.instance.should.equal(payload.maxChanSize);
          maxChanSize.should.have.property('name');
          maxChanSize.name.should.equal('maximum');
          maxChanSize.should.have.property('argument');
          maxChanSize.argument.should.be.an('number');
          maxChanSize.argument.should.equal(16777216);
          maxChanSize.should.have.property('stack');
          maxChanSize.stack.should.equal('instance.lnd.maxChanSize must have a maximum value of 16777216');

          done();
        });
    });

    it('should save new settings', done => {

      requester
        .post('/v1/settings/save')
        .set('authorization', `JWT ${token}`)
        .send(require(`${__dirname}/../../fixtures/settings/settings-updated.json`))
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          done();
        });
    });

    it('should verify that the settings were updated', done => {
      requester
        .get('/v1/settings/read')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          res.should.be.json;

          res.body.should.have.property('bitcoind');
          res.body.bitcoind.should.have.property('bitcoinNetwork');
          res.body.bitcoind.bitcoinNetwork.should.equal('testnet');
          res.body.bitcoind.should.have.property('bitcoindListen');
          res.body.bitcoind.bitcoindListen.should.equal(true);
          res.body.bitcoind.should.have.property('bitcoindPort');
          res.body.bitcoind.bitcoindPort.should.equal(8335);

          res.body.should.have.property('lnd');
          res.body.lnd.should.have.property('chain');
          res.body.lnd.chain.should.equal('bitcoin');
          res.body.lnd.should.have.property('backend');
          res.body.lnd.backend.should.equal('bitcoind');
          res.body.lnd.should.have.property('lndNetwork');
          res.body.lnd.lndNetwork.should.equal('testnet');
          res.body.lnd.should.have.property('autopilot');
          res.body.lnd.autopilot.should.equal(false);
          res.body.lnd.should.have.property('externalIP');
          res.body.lnd.externalIP.should.equal('127.0.0.1');
          res.body.lnd.should.have.property('maxChannels');
          res.body.lnd.maxChannels.should.equal(10);
          res.body.lnd.should.have.property('maxChanSize');
          res.body.lnd.maxChanSize.should.equal(100);
          res.body.lnd.should.have.property('nickName');
          res.body.lnd.nickName.should.equal('updated-unit-test-node');

          done();
        });
    });


  });

});
