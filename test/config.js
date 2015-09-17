'use strict';

var assert  = require('assert');

var logship  = require('../lib/logship');

describe('log-ship-elastic-qpsmtpd', function () {
  var shipper = logship.createShipper('./test');

  describe('config', function () {
    it('finds a log-ship-elastic-qpsmtpd.ini', function (done) {
      assert.ok(shipper);
      done();
    });

    it('config has required sections', function (done) {
      // console.log(cfg);
      ['main', 'elastic', 'parser', 'reader'].forEach(function (s) {
        assert.ok(shipper.cfg[s]);
      });
      done();
    });
  });
});
