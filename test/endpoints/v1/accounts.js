/* eslint-disable max-len,id-length */
/* globals requester, reset */
const sinon = require('sinon');

describe('v1/accounts endpoints', () => {
  let token;

  before(async() => {
    reset();

    token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QtdXNlciIsImlhdCI6MTU3NTIyNjQxMn0.N06esl2dhN1mFqn-0o4KQmmAaDW9OsHA39calpp_N9B3Ig3aXWgl064XAR9YVK0qwX7zMOnK9UrJ48KUZ-Sb4A';
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
});
