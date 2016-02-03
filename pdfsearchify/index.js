var path = require('path');
var exec = require('child_process').exec;
var async = require('async');

var upsample = 300;

function getPDFPageCount(filename, cb) {
    exec('pdftk "'+filename+'" dump_data | grep "NumberOfPages" | cut -d":" -f2', function(err, stdout, stderr) {
        if (stdout) {
            return cb(null, parseInt(stdout.trim()));
        } else {
            return cb(stderr);
        }
    });
}

function extractPage(infile, outdir, pagenum, cb) {
    var outfile = path.join(outdir, 'original-'+pagenum+'.pnm');
    exec(
        'gs -dNOPAUSE -dSAFER -sDEVICE=pnmraw '+
        '-r'+upsample+' -dFirstPage='+pagenum+' -dLastPage='+pagenum+' '+
        '-dBatch -o "'+outfile+'" "'+infile+'"',
        function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                return cb(null, outfile);
            }
        }
    );
}

function unpaperPage(infile, outfile, cb) {
    exec('unpaper "'+infile+'" "'+outfile+'"', function(err, stdout, stderr) {
        if (err) {
            return cb(err);
        } else {
            return cb(null, outfile);
        }
    });
}

function searchifyPage(infile, tmpdir, pagenum, cb) {
    var originalfile
      , unpaperedfile;
    async.series([
        function(cb) {
            extractPage(infile, tmpdir, pagenum, function(err, outfile) {
                if (err) {
                    return cb(err);
                }
                originalfile = outfile;
                return cb();
            });
        },
        function(cb) {
            var unpaperedfile = path.join(tmpdir, 'unpapered-'+pagenum+'.pnm');
            unpaperPage(originalfile, unpaperedfile, function(err, outfile) {
                if (err) {
                    return cb(err);
                }
                return cb();
            });
        },
    ], function(err) {
        return cb(err);
    });
}

function searchify(infile, tmpdir, cb) {
    getPDFPageCount(infile, function(err, pagecount) {
        if (err) {
            return cb(err);
        }
        var tasks = [];
        for (var i = 1; i <= pagecount; i++) {
            (function() {
                var pagenum = i;
                tasks.push(function(cb) {
                    searchifyPage(infile, tmpdir, pagenum, cb);
                });
            })();
        }
        async.series(tasks, cb);
    });
}

module.exports.searchify = searchify;
