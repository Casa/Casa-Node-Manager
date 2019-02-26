/* eslint-disable max-len,id-length */
/* globals requester, reset */
const sinon = require('sinon');
const dockerodeMocks = require('../../mocks/dockerode.js');

describe('v1/telemetry endpoints', () => {
  let token;

  before(async() => {
    reset();

    token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QtdXNlciIsImlhdCI6MTU3NTIyNjQxMn0.N06esl2dhN1mFqn-0o4KQmmAaDW9OsHA39calpp_N9B3Ig3aXWgl064XAR9YVK0qwX7zMOnK9UrJ48KUZ-Sb4A';
  });

  after(async() => {

  });

  describe('v1/telemetry/versions GET', function() {

    let clock;
    let dockerodeListAllContainers;
    let dockerodeListImages;

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
});

