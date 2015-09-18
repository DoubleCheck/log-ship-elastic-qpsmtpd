'use strict';

var path      = require('path');

exports.getElastic = function (cfg) {
  var esm = require(cfg.module);

  var opts = {
    hosts: cfg.hosts.split(/[, ]+/),
    log: 'error', // 'trace',
  };

  if (process.env.NODE_ENV === 'test') {
    opts.log = {
      type: 'file',
      path: path.join('test','spool','es-err.log'),
    };
  }

  return new esm.Client(opts);
};
