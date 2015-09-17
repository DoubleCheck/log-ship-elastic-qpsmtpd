'use strict';

// node built-ins
var path      = require('path');
// var util      = require('util');
var assert    = require('assert');

// local modules
var config    = require('./config');
var logger    = require('./logger');
var spool     = require('./spool');

var ES        = require('./elastic');

function QpsmtpdToElastic (etcDir) {
  this.cfg          = config.loadConfig(etcDir);
  assert.ok(this.cfg);

  this.spool = this.cfg.main.spool || '/var/spool/log_ship/qpsmtpd';
  if (process.env.NODE_ENV === 'test') {
    this.spool = path.resolve('./test', 'spool');
  }
  spool.isValidDir(this.spool);  // initialize spool dir

  // initialize Elasticsearch
  this.elastic      = ES.getElastic(this.cfg.elastic);
  this.elasticAlive = false;

  // this.watchdog();

  var readerOpts   = {
    batchLimit: this.batchLimit,
    bookmark: { dir: path.resolve(this.spool, '.bookmark') },
    watchDelay: this.cfg.reader.watchDelay,
  };

  var qp2e = this;
  this.elastic.ping(function (err) {
    if (err) {
      logger.error(err);
      return;
    }

    qp2e.elasticAlive = true;

    // elasticsearch is up, start reading lines
    var read = require(qp2e.cfg.reader.module);
    qp2e.reader = read.createReader(qp2e.cfg.reader.file, readerOpts)
    .on('readable', function () {
      // log file is readable, read a line (see 'read' event)
      // this.readLine();  // 'this' is a reader
    })
    .on('read', function (data, lineCount) {
      logger.debug(lineCount + ': ' + data);
    })
    .on('end', function (done) {
      logger.debug('end of batch or file');
    });
  });
}

module.exports = {
  createShipper: function (etcDir) {
    return new QpsmtpdToElastic(etcDir);
  }
};
