/* eslint-disable max-len,id-length,no-magic-numbers,no-empty-function,no-undef */
/* eslint-env mocha */
/* globals requester */

describe('v1/logs endpoints', () => {

  describe('v1/logs/download GET', () => {

    it('should download the logs', done => {
      requester
        .get('/v1/logs/download')
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
