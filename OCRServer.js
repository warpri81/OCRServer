var tmp = require('tmp');
var async = require('async');
var pdfsearchify = require('./pdfsearchify');

var filename = process.argv[2];
var tmpdir = tmp.dirSync({ mode: 0750, prefix: 'OCRServer', keep: true});
tmp.setGracefulCleanup();

var pages;
console.log('Output: '+tmpdir.name);

async.series([
    function(cb) {
        pdfsearchify.getPDFPageCount(filename, function(err, pagecount) {
            if (err) {
                return cb(err);
            } else {
                console.log('Pages: '+pagecount);
                pages = pagecount;
                return cb();
            }
        });
    },
    function(cb) {
        pdfsearchify.splitPDFPages(filename, tmpdir.name, cb);
    },
    function(cb) {
        pdfsearchify.unpaperPages(tmpdir.name, pages, cb);
    },
],
function(err) {
    if (err) {
        console.log('ERROR:\n'+err);
    }
    process.exit(0);
});
