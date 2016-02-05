var tmp = require('tmp');
var async = require('async');
var pdfsearchify = require('./pdfsearchify');

var infile = process.argv[2]
  , outfile = process.argv[3];
var tmpdir = tmp.dirSync({ mode: 0750, prefix: 'OCRServer', keep: true});
tmp.setGracefulCleanup();

var pages;
console.log('Output: '+tmpdir.name);

pdfsearchify.searchify(infile, outfile, tmpdir.name, function(err) {
    if (err) {
        console.log('ERROR: '+err);
    } else {
        console.log('Everything is OK');
    }
    process.exit(0);
});
