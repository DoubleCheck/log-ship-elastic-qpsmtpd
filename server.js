'use strict';

var logship  = require('./lib/logship');
var shipper  = logship.createShipper('./');

process.on('SIGINT', function() {     // Control-C
  console.log('\nSIGINT received (Ctrl-C)');
  shipper.shutdown();
});

process.on('SIGTERM', function () {   // kill $PID
  console.log('\nSIGTERM received');
  shipper.shutdown();
});
