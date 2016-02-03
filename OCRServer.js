var tmp = require('tmp');
var async = require('async');
var pdfsearchify = require('./pdfsearchify');

var filename = process.argv[2];
var tmpdir = tmp.dirSync({ mode: 0750, prefix: 'OCRServer', keep: true});
tmp.setGracefulCleanup();

var pages;
console.log('Output: '+tmpdir.name);

pdfsearchify.searchify(filename, tmpdir.name, function(err) {
    if (err) {
        console.log('ERROR: '+err);
    } else {
        console.log('Everything is OK');
    }
    process.exit(0);
});
