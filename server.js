'use strict';

var logger   = require('./lib/logger');
var logship  = require('./lib/logship');
var shipper  = logship.createShipper();

process.on('SIGINT', function() {     // Control-C
  logger.info('\nSIGINT received (Ctrl-C)');
  shipper.shutdown();
});

process.on('SIGTERM', function () {   // kill $PID
  logger.info('\nSIGTERM received');
  shipper.shutdown();
});
