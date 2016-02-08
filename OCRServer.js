var async = require('async');
var pdfsearchify = require('./pdfsearchify')();

var infile = process.argv[2]
  , outfile = process.argv[3];

pdfsearchify(infile, outfile, function(err) {
    if (err) {
        console.log('ERROR: '+err);
    } else {
        console.log('Everything is OK');
    }
    process.exit(0);
});
