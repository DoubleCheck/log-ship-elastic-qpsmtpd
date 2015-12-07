'use strict';

// node built-ins
var assert    = require('assert');
var path      = require('path');
var util      = require('util');

// npm modules
var moment    = require('moment-timezone');

// local modules
var config    = require('./config');
var logger    = require('./logger');
var spool     = require('./spool');

var ES        = require('./elastic');

function QpsmtpdToElastic (etcDir) {
  var qp2e = this;
  qp2e.cfg = config.loadConfig(etcDir);
  assert.ok(qp2e.cfg);

  qp2e.batchDelay = qp2e.cfg.reader.batchDelay || 0;

  qp2e.spool = qp2e.cfg.main.spool || '/var/spool/log_ship/qpsmtpd';
  if (process.env.NODE_ENV === 'test') {
    this.spool = path.resolve('./test', 'spool');
  }
  spool.isValidDir(this.spool);  // initialize spool dir
  qp2e.watchdog();

  // initialize Elasticsearch
  qp2e.elastic = ES.getElastic(qp2e.cfg.elastic);
  qp2e.elasticAlive = false;

  var readerOpts = {
    batchLimit: qp2e.cfg.reader.batchLimit || 0,
    bookmark: { dir: path.resolve(qp2e.spool, '.bookmark') },
    watchDelay: qp2e.cfg.reader.watchDelay,
  };

  qp2e.queue = [];
  qp2e.queueActive = false;  // true while ES save in progress

  qp2e.elastic.ping(function (err) {
    if (err) {
      logger.error(err);
      return;
    }

    qp2e.elasticAlive = true;

    // elasticsearch is up, start reading lines
    var read = require(qp2e.cfg.reader.module);
    qp2e.reader = read.createReader(qp2e.cfg.reader.file, readerOpts)
    .on('read', function (data, lineCount) {
      logger.debug(lineCount); //  + ': ' + data);
      qp2e.queue.push(JSON.parse(data));
    })
    .on('drain', function (done) {
      // logger.info('\tdrain: ' + qp2e.queue.length);
      qp2e.saveToEs(done);
    })
    .on('end', function () {
      logger.info('end of file');
    });
  });
}

QpsmtpdToElastic.prototype.saveToEs = function(done) {
  var qp2e = this;

  if (qp2e.queueActive === true) {
    return done ('queue already active!');
  }

  if (qp2e.queue.length === 0) {
    logger.info('queue empty');
    return done(null);
  }

  qp2e.queueActive = true;

  // assemble the ES bulk request
  var esBulk = [];  // index, create, update

  for (var i = 0; i < qp2e.queue.length; i++) {
    var data = qp2e.queue.shift();
    var meta = {
      _index: qp2e.getIndexName(data.timestamp),
      _type: qp2e.cfg.elastic.type,
    };
    if      (data.id)   { meta._id = data.id;   }
    else if (data.uuid) { meta._id = data.uuid; }

    esBulk.push({ index : meta }, data);
  }

  // save the data to ES
  function bulkDone (err, res) {
    // TODO: maybe better error handling (retry, for some errors)
    if (err) return done(err);
    if (res.errors) {
      logger.info(util.inspect(res, { depth: null }));
      return done('bulk errors, see logs');
    }

    // the data is successfully saved
    qp2e.watchdog();
    qp2e.queueActive = false;
    done(null, 1);
  }
  qp2e.elastic.bulk({ body: esBulk, consistency: 'all' }, bulkDone);
};

QpsmtpdToElastic.prototype.getIndexName = function(date) {

  var name = this.cfg.elastic.index || 'qpsmtpd';
  if (!/-(?:YYYY|MM|DD)/.test(name)) return name;

  // http://momentjs.com/docs/#/get-set/get/
  date = moment(date);

  name = name.replace(/\-YYYY/, '-' + date.format('YYYY'));
  name = name.replace(/\-MM/,   '-' + date.format('MM'));
  name = name.replace(/\-DD/,   '-' + date.format('DD'));

  return name;
};

QpsmtpdToElastic.prototype.shutdown = function() {
  var qp2e = this;

  logger.info('starting graceful shutdown');

  process.env.WANTS_SHUTDOWN=1;

  if (!qp2e.elasticAlive) {
    logger.info('elastic inactive');
    process.exit();
  }

  setTimeout(function () {
    // deadman: if no shut down in 15s, exit unconditionally
    process.exit();
  }, 15 * 1000);

  function waitForQueue () {
    if (!qp2e.queueActive) {
      logger.info('queue inactive, exiting');
      process.exit();
    }
    logger.info('queue active, waiting');
    setTimeout(function () {
      waitForQueue();
    }, 1 * 1000);
  }
  waitForQueue();
};

QpsmtpdToElastic.prototype.watchdog = function() {
  var qp2e = this;
  qp2e.watchdogTimer = setTimeout(function () {
    logger.info('inactive for 1 hour, shutting down.');
    qp2e.shutdown();
  }, 1 * 10 * 60 * 1000);
};
module.exports = {
  createShipper: function (etcDir) {
    return new QpsmtpdToElastic(etcDir);
  }
};
