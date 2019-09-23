/* eslint-disable max-len,id-length,no-magic-numbers */
/* eslint-env mocha */
/* globals requester, reset */
const sinon = require('sinon');
const uuidv4 = require('uuid/v4');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// A random username and password to test with
const USERNAME = uuidv4();
const PASSWORD = uuidv4();
const WRONG_PASSWORD = 'notthecorrectpassword';

// Clears any existing users out of the system
const clearUsers = () => {
  fs.writeFile(`${__dirname}/../../fixtures/accounts/user.json`, '', err => {
    if (err) {
      throw err;
    }
  });
};

after(async() => {
  clearUsers();
});

describe('v1/accounts endpoints', () => {
  let token;

  before(async() => {

    const application = `${__dirname}/../../../logic/application.js`;
    startLndManagementStub = sinon.stub(require(application), 'startLndIntervalService');
    postAxiosStub = sinon.stub(require('axios'), 'post');

    reset();
  });

  after(() => {
    startLndManagementStub.restore();
    postAxiosStub.restore();

    // Stop all interval services. Otherwise npm test will not exit.
    const application = `${__dirname}/../../../logic/application.js`;
    require(application).stopIntervalServices();
  });

  describe('v1/accounts/register POST via basic auth', () => {

    it('should register a new user and return a new JWT', done => {

      // Clear any existing users out of the system otherwise a 'User already exists' error will be returned
      clearUsers();
      requester
        .post('/v1/accounts/register')
        .auth(USERNAME, PASSWORD)
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

    it('should check the issuer in the JWT', done => {
      const decoded = jwt.decode(token);
      decoded.id.should.equal('fake_boot_id'); // stubbed in global.js
      done();
    });

    it('should be able to use the new JWT', done => {
      requester
        .post('/v1/accounts/refresh')
        .set('authorization', `jwt ${token}`)
        .send({user: USERNAME})
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          res.should.be.json;
          res.body.jwt.should.not.be.empty;
          done();
        });
    });
  });

  describe('v1/accounts/register POST via body', () => {

    it('should register a new user and return a new JWT', done => {

      // Clear any existing users out of the system otherwise a 'User already exists' error will be returned
      clearUsers();
      requester
        .post('/v1/accounts/register')
        .send({password: PASSWORD})
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

    it('should check the issuer in the JWT', done => {
      const decoded = jwt.decode(token);
      decoded.id.should.equal('fake_boot_id'); // stubbed in global.js
      done();
    });

    it('should be able to use the new JWT', done => {
      requester
        .post('/v1/accounts/refresh')
        .set('authorization', `jwt ${token}`)
        .send({user: USERNAME})
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          res.should.be.json;
          res.body.jwt.should.not.be.empty;
          done();
        });
    });
  });

  describe('v1/accounts/changePassword/status GET', () => {

    it('should return 401 if token is bad', done => {

      requester
        .get('/v1/accounts/changePassword/status')
        .set('authorization', `jwt`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(401);

          done();
        });
    });

    // Keep this test above the change password tests. Otherwise the percent will change.
    it('should return successful', done => {

      requester
        .get('/v1/accounts/changePassword/status')
        .set('authorization', `jwt ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;
          res.body.percent.should.equal(0);

          done();
        });
    });
  });

  describe('v1/accounts/changePassword POST via basic auth', () => {

    let authStub;
    let dockerComposeStopStub;
    let dockerComposeUpSingleStub;

    before(() => {
      authStub = sinon.stub(require('../../../logic/auth.js'), 'getChangePasswordStatus');
      dockerComposeStopStub = sinon.stub(require('../../../logic/docker-compose.js'), 'dockerComposeStop')
        .returns({});
      dockerComposeUpSingleStub = sinon.stub(require('../../../logic/docker-compose.js'), 'dockerComposeUpSingleService')
        .returns({});
    });

    after(() => {
      authStub.restore();
      dockerComposeStopStub.restore();
      dockerComposeUpSingleStub.restore();
    });

    it('should return 400 with missing parameters', done => {

      requester
        .post('/v1/accounts/changePassword')
        .auth(USERNAME, PASSWORD)
        .send({})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(400);
          done();
        });
    });

    it('should return 400 with passwords that are too short', done => {

      requester
        .post('/v1/accounts/changePassword')
        .auth(USERNAME, PASSWORD)
        .send({newPassword: 'tooShort'})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(400);

          done();
        });
    });

    it('should return 403 if auth is wrong', done => {

      requester
        .post('/v1/accounts/changePassword')
        .auth(USERNAME, WRONG_PASSWORD)
        .send({newPassword: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(403);

          done();
        });
    });

    it('should return 409 if a change password process is already running', done => {

      authStub.returns({percent:40});

      requester
        .post('/v1/accounts/changePassword')
        .auth(USERNAME, PASSWORD)
        .send({ password: PASSWORD,
          newPassword: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(409);

          // TODO how to return stub to default
          authStub.returns({percent:0});

          done();
        });
    });

    it('should return successful', done => {

      requester
        .post('/v1/accounts/changePassword')
        .auth(USERNAME, PASSWORD)
        .send({ password: PASSWORD,
          newPassword: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(202);

          done();
        });
    });
  });

  describe('v1/accounts/changePassword POST via body', () => {

    let authStub;
    let dockerComposeStopStub;
    let dockerComposeUpSingleStub;

    before(() => {
      authStub = sinon.stub(require('../../../logic/auth.js'), 'getChangePasswordStatus');
      dockerComposeStopStub = sinon.stub(require('../../../logic/docker-compose.js'), 'dockerComposeStop')
        .returns({});
      dockerComposeUpSingleStub = sinon.stub(require('../../../logic/docker-compose.js'), 'dockerComposeUpSingleService')
        .returns({});
    });

    after(() => {
      authStub.restore();
      dockerComposeStopStub.restore();
      dockerComposeUpSingleStub.restore();
    });

    it('should return 400 with missing parameters', done => {

      requester
        .post('/v1/accounts/changePassword')
        .send({password: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(400);
          done();
        });
    });

    it('should return 400 with passwords that are too short', done => {

      requester
        .post('/v1/accounts/changePassword')
        .send({password: PASSWORD, newPassword: 'tooShort'})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(400);

          done();
        });
    });

    it('should return 403 if the password is bad', done => {

      requester
        .post('/v1/accounts/changePassword')
        .send({password: WRONG_PASSWORD, newPassword: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(403);

          done();
        });
    });

    it('should return 409 if a change password process is already running', done => {

      authStub.returns({percent:40});

      requester
        .post('/v1/accounts/changePassword')
        .send({password: PASSWORD, newPassword: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(409);

          // TODO how to return stub to default
          authStub.returns({percent:0});

          done();
        });
    });

    it('should return successful', done => {

      requester
        .post('/v1/accounts/changePassword')
        .send({password: PASSWORD, newPassword: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(202);

          done();
        });
    });
  });

  describe('v1/accounts/login POST', () => {

    it('should login as the newly registered user', done => {
      requester
        .post('/v1/accounts/login')
        .auth(USERNAME, PASSWORD)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.body.jwt.should.not.be.empty;
          done();
        });
    });

    it('should unauth for bad credentials', done => {
      requester
        .post('/v1/accounts/login')
        .auth(USERNAME, WRONG_PASSWORD)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(401);
          done();
        });
    });

    it('should login using the post body as the newly registered user', done => {
      requester
        .post('/v1/accounts/login')
        .auth(USERNAME, PASSWORD)
        .send({password: PASSWORD})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.body.jwt.should.not.be.empty;
          done();
        });
    });

    it('should unauth using the post body for bad credentials', done => {
      requester
        .post('/v1/accounts/login')
        .send({password: 'notthecorrectpassword'})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(401);
          done();
        });
    });
  });

  describe('v1/accounts/registered GET', function() {

    let fsReadFile;

    afterEach(() => {
      fsReadFile.restore();
    });

    it('should return false if user does not exist', done => {
      fsReadFile = sinon.stub(require('../../../logic/disk.js'), 'readUserFile')
        .throws(new Error('file not found'));

      requester
        .get('/v1/accounts/registered')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;
          res.body.registered.should.be.equal(false);
          done();
        });
    });

    it('should return true if user exists', done => {
      fsReadFile = sinon.stub(require('../../../logic/disk.js'), 'readUserFile')
        .resolves('{"password":"$2b$10$7oj5KisADT8JsH5G7v2PLO6bvA6y.CUf6AejZGDa0JUF3zOOPAZzq"}');

      requester
        .get('/v1/accounts/registered')
        .set('authorization', `JWT ${token}`)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.should.be.json;
          res.body.registered.should.be.equal(true);
          done();
        });
    });
  });

  describe('v1/accounts/refresh POST', () => {

    it('should return a new JWT', done => {
      requester
        .post('/v1/accounts/refresh')
        .set('authorization', `JWT ${token}`)
        .send({user: USERNAME})
        .end((err, res) => {
          if (err) {
            done(err);
          }

          res.should.have.status(200);
          res.should.be.json;
          res.body.jwt.should.not.be.empty;

          done();
        });
    });

    it('should not let unauthorized user refresh JWT', done => {
      requester
        .post('/v1/accounts/refresh')
        .set('authorization', 'JWT invalid')
        .send({user: 'some user'})
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(401);
          done();
        });
    });
  });
});
