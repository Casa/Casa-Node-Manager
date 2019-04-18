/* eslint-disable max-len,id-length,no-magic-numbers */
/* eslint-env mocha */
/* globals requester, reset */
const sinon = require('sinon');
const uuidv4 = require('uuid/v4');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// A random username and password to test with
const randomUsername = uuidv4();
const randomPassword = uuidv4();

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

  describe('v1/accounts/register POST', () => {

    it('should register a new user and return a new JWT', done => {

      // Clear any existing users out of the system otherwise a 'User already exists' error will be returned
      clearUsers();
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

    it('should check the issuer in the JWT', done => {
      const decoded = jwt.decode(token);
      decoded.id.should.equal('fake_boot_id'); // stubbed in global.js
      done();
    });

    it('should be able to use the new JWT', done => {
      requester
        .post('/v1/accounts/refresh')
        .set('authorization', `jwt ${token}`)
        .send({user: randomUsername})
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

  describe('v1/accounts/login POST', () => {

    it('should login as the newly registered user', done => {
      requester
        .post('/v1/accounts/login')
        .auth(randomUsername, randomPassword)
        .end((err, res) => {
          if (err) {
            done(err);
          }
          res.should.have.status(200);
          res.body.jwt.should.not.be.empty;
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
        .send({user: randomUsername})
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
