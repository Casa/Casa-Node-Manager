/* eslint-disable max-len,id-length,no-magic-numbers,no-empty-function,no-undef */
/* globals requester, reset */
const sinon = require('sinon');
const dockerodeMocks = require('../../mocks/dockerode.js');
const uuidv4 = require('uuid/v4');
const fs = require('fs');

describe('v1/telemetry endpoints', () => {
  let token;

  before(async() => {
    reset();
  });

  after(async() => {

  });

  // Get a JWT
  // TODO: This should be moved to a place where the code can be shared.
  describe('v1/accounts/register POST', () => {

    const randomUsername = uuidv4();
    const randomPassword = uuidv4();

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

  describe('v1/telemetry/versions GET', function() {

    afterEach(() => {
      clock.restore();
      dockerodeListAllContainers.restore();
      dockerodeListImages.restore();
    });

    it('should have no updatable containers', done => {

      clock = sinon.useFakeTimers({
        now: 1546416000000, // January 2, 2019 Midnight PST
        shouldAdvanceTime: false,
      });

      dockerodeListAllContainers = sinon.stub(require('dockerode').prototype, 'listContainers')
        .yields(null, dockerodeMocks.listAllContainers());
      dockerodeListImages = sinon.stub(require('dockerode').prototype, 'listImages')
        .yields(null, dockerodeMocks.listImages());

      requester
        .get('/v1/telemetry/version')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;

          res.body.should.have.property('lnd');
          res.body['lnd'].updatable.should.equal(false);
          res.body.should.have.property('bitcoind');
          res.body['bitcoind'].updatable.should.equal(false);
          res.body.should.have.property('lnapi');
          res.body['lnapi'].updatable.should.equal(false);
          res.body.should.have.property('space-fleet');
          res.body['space-fleet'].updatable.should.equal(false);
          res.body.should.have.property('manager');
          res.body['manager'].updatable.should.equal(false);
          res.body.should.have.property('update-manager');
          res.body['update-manager'].updatable.should.equal(false);
          res.body.should.have.property('logspout');
          res.body['logspout'].updatable.should.equal(false);
          res.body.should.have.property('syslog');
          res.body['syslog'].updatable.should.equal(false);

          done();
        });
    });

    it('should handle junk images', done => {

      clock = sinon.useFakeTimers({
        now: 1546416000000, // January 2, 2019 Midnight PST
        shouldAdvanceTime: false,
      });

      const images = dockerodeMocks.listImages();
      images.push(dockerodeMocks.getAlpineImage());

      dockerodeListAllContainers = sinon.stub(require('dockerode').prototype, 'listContainers')
        .yields(null, dockerodeMocks.listAllContainers());
      dockerodeListImages = sinon.stub(require('dockerode').prototype, 'listImages')
        .yields(null, images);

      requester
        .get('/v1/telemetry/version')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;

          res.body.should.have.property('lnd');
          res.body['lnd'].updatable.should.equal(false);
          res.body.should.have.property('bitcoind');
          res.body['bitcoind'].updatable.should.equal(false);
          res.body.should.have.property('lnapi');
          res.body['lnapi'].updatable.should.equal(false);
          res.body.should.have.property('space-fleet');
          res.body['space-fleet'].updatable.should.equal(false);
          res.body.should.have.property('manager');
          res.body['manager'].updatable.should.equal(false);
          res.body.should.have.property('update-manager');
          res.body['update-manager'].updatable.should.equal(false);
          res.body.should.have.property('logspout');
          res.body['logspout'].updatable.should.equal(false);
          res.body.should.have.property('syslog');
          res.body['syslog'].updatable.should.equal(false);

          done();
        });
    });

    it('should have an updatable containers', done => {

      clock = sinon.useFakeTimers({
        now: 1546416000000, // January 2, 2019 Midnight PST
        shouldAdvanceTime: false,
      });

      dockerodeListAllContainers = sinon.stub(require('dockerode').prototype, 'listContainers')
        .yields(null, dockerodeMocks.listAllContainers());
      dockerodeListImages = sinon.stub(require('dockerode').prototype, 'listImages')
        .yields(null, dockerodeMocks.listImagesWithUpdate());

      requester
        .get('/v1/telemetry/version')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;

          res.body.should.have.property('lnd');
          res.body['lnd'].updatable.should.equal(false);
          res.body.should.have.property('bitcoind');
          res.body['bitcoind'].updatable.should.equal(false);
          res.body.should.have.property('lnapi');
          res.body['lnapi'].updatable.should.equal(false);
          res.body.should.have.property('space-fleet');
          res.body['space-fleet'].updatable.should.equal(false);
          res.body.should.have.property('manager');
          res.body['manager'].updatable.should.equal(true);
          res.body.should.have.property('update-manager');
          res.body['update-manager'].updatable.should.equal(false);
          res.body.should.have.property('logspout');
          res.body['logspout'].updatable.should.equal(false);
          res.body.should.have.property('syslog');
          res.body['syslog'].updatable.should.equal(false);

          done();
        });
    });

    it('should have no updatable containers if one exists, but was pulled in the last 90 minutes', done => {

      clock = sinon.useFakeTimers({
        now: 1546329600000, // January 1, 2019 Midnight PST
        shouldAdvanceTime: false,
      });

      dockerodeListAllContainers = sinon.stub(require('dockerode').prototype, 'listContainers')
        .yields(null, dockerodeMocks.listAllContainers());
      dockerodeListImages = sinon.stub(require('dockerode').prototype, 'listImages')
        .yields(null, dockerodeMocks.listImagesWithUpdate());

      requester
        .get('/v1/telemetry/version')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;

          res.body.should.have.property('lnd');
          res.body['lnd'].updatable.should.equal(false);
          res.body.should.have.property('bitcoind');
          res.body['bitcoind'].updatable.should.equal(false);
          res.body.should.have.property('lnapi');
          res.body['lnapi'].updatable.should.equal(false);
          res.body.should.have.property('space-fleet');
          res.body['space-fleet'].updatable.should.equal(false);
          res.body.should.have.property('manager');
          res.body['manager'].updatable.should.equal(false);
          res.body.should.have.property('update-manager');
          res.body['update-manager'].updatable.should.equal(false);
          res.body.should.have.property('logspout');
          res.body['logspout'].updatable.should.equal(false);
          res.body.should.have.property('syslog');
          res.body['syslog'].updatable.should.equal(false);

          done();
        });
    });
  });

  describe('v1/telemetry/serial GET', function() {

    it('should return the serial ID of the device', done => {
      requester
        .get('/v1/telemetry/serial')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.body.should.equal('fake_serial_id'); // From the stub in globals.js
          done();
        });
    });
  });

  describe('v1/telemetry/status GET', function() {

    afterEach(() => {
      dockerodeListAllContainers.restore();
      dockerodeListImages.restore();
      dockerodeGetDiskUsage.restore();
    });

    it('should return the status of the containers', done => {

      dockerodeListAllContainers = sinon.stub(require('dockerode').prototype, 'listContainers')
        .yields(null, dockerodeMocks.listAllContainers());
      dockerodeListImages = sinon.stub(require('dockerode').prototype, 'listImages')
        .yields(null, dockerodeMocks.listImages());
      dockerodeGetDiskUsage = sinon.stub(require('dockerode').prototype, 'df')
        .yields(null, dockerodeMocks.df());

      requester
        .get('/v1/telemetry/status')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          res.should.be.json;

          // All the containers should be in the running status
          res.body.should.have.property('containers');
          res.body.containers.should.be.an('array');
          res.body.containers[0].should.have.property('status');
          res.body.containers[0].status.should.equal('running');
          res.body.containers[1].should.have.property('status');
          res.body.containers[1].status.should.equal('running');
          res.body.containers[2].should.have.property('status');
          res.body.containers[2].status.should.equal('running');
          res.body.containers[3].should.have.property('status');
          res.body.containers[3].status.should.equal('running');
          res.body.containers[4].should.have.property('status');
          res.body.containers[4].status.should.equal('running');
          res.body.containers[5].should.have.property('status');
          res.body.containers[5].status.should.equal('running');
          res.body.containers[6].should.have.property('status');
          res.body.containers[6].status.should.equal('running');
          res.body.containers[7].should.have.property('status');
          res.body.containers[7].status.should.equal('running');

          done();
        });
    });
  });

  describe('v1/telemetry/volumes GET', function() {

    afterEach(() => {
      dockerodeGetDiskUsage.restore();
    });

    it('should return the volume names and usage', done => {

      dockerodeGetDiskUsage = sinon.stub(require('dockerode').prototype, 'df')
        .yields(null, dockerodeMocks.df());

      requester
        .get('/v1/telemetry/volumes')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          res.should.be.json;

          // Corresponds to the dockerode-df.json mock
          res.body[0].should.have.property('name');
          res.body[0].name.should.equal('applications_accounts');
          res.body[0].should.have.property('usage');
          res.body[0].usage.should.equal(75);

          res.body[1].should.have.property('name');
          res.body[1].name.should.equal('applications_lnd-data');
          res.body[1].should.have.property('usage');
          res.body[1].usage.should.equal(173455107);

          res.body[2].should.have.property('name');
          res.body[2].name.should.equal('applications_bitcoind-data');
          res.body[2].should.have.property('usage');
          res.body[2].usage.should.equal(237440403856);

          res.body[3].should.have.property('name');
          res.body[3].name.should.equal('applications_channel-data');
          res.body[3].should.have.property('usage');
          res.body[3].usage.should.equal(434);

          res.body[4].should.have.property('name');
          res.body[4].name.should.equal('applications_logs');
          res.body[4].should.have.property('usage');
          res.body[4].usage.should.equal(9147665);

          res.body[5].should.have.property('name');
          res.body[5].name.should.equal('7bfae6b5213cbbd1f195b5bcfb4e2394861ea7c5eda92ed5b6509073cd521574');
          res.body[5].should.have.property('usage');
          res.body[5].usage.should.equal(0);

          res.body[6].should.have.property('name');
          res.body[6].name.should.equal('efb690aeb38ef217fe55275782fd541ed756d3873e8c5831e5b5ed255cf64158');
          res.body[6].should.have.property('usage');
          res.body[6].usage.should.equal(0);

          res.body[7].should.have.property('name');
          res.body[7].name.should.equal('55f79ece3d8cfb3f7b655bb4a58495bb07f89816a8e22a965521a3c4d78c516a');
          res.body[7].should.have.property('usage');
          res.body[7].usage.should.equal(0);

          res.body[8].should.have.property('name');
          res.body[8].name.should.equal('applications_settings');
          res.body[8].should.have.property('usage');
          res.body[8].usage.should.equal(317);

          done();
        });
    });
  });

  describe('v1/telemetry/system-status GET', function() {

    it('should return the system status', done => {
      requester
        .get('/v1/telemetry/system-status')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          done();
        });
    });
  });
});
