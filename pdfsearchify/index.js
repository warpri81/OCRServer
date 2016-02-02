var path = require('path');
var exec = require('child_process').exec;
var async = require('async');

var pdfsearchify = {};

var padSize = 5
  , imagePrefix = 'image'
  , unpaperPrefix = 'unpaper'
;

function padNumber(n, p, c) {
    var pad_char = typeof c !== 'undefined' ? c : '0';
    var pad = new Array(1 + p).join(pad_char);
    return (pad + n).slice(-pad.length);
}

function getPDFPageCount(filename, cb) {
    exec('pdftk "'+filename+'" dump_data | grep "NumberOfPages" | cut -d":" -f2', function(err, stdout, stderr) {
        if (stdout) {
            cb(null, parseInt(stdout.trim()));
        } else {
            cb(stderr);
        }
    });
}

function splitPDFPages(filename, outdir, cb) {
    var outfileFormat = path.join(outdir, imagePrefix+'-%0'+padSize+'d.pnm');
    exec('gs -dNOPAUSE -dSAFER -sDEVICE=pnmraw -r300 -dBatch -o "'+outfileFormat+'" "'+filename+'"', function(err, stdout, stderr) {
        if (err) {
            cb(err)
        } else {
            cb();
        }
    });
}

function unpaperImage(infile, outfile, cb) {
    exec('unpaper "'+infile+'" "'+outfile+'"', function(err, stdout, stderr) {
        if (err) {
            cb(err);
        } else {
            cb();
        }
    });
}

function unpaperPages(indir, pagecount, cb) {
    var tasks = [];
    for (var i = 1; i <= pagecount; i++) {
        (function() {
            var infile = path.join(indir, imagePrefix+'-'+padNumber(i, padSize)+'.pnm')
              , outfile = path.join(indir, unpaperPrefix+'-'+padNumber(i, padSize)+'.pnm');
            tasks.push(function(cb) {
                unpaperImage(infile, outfile, cb);
            });
        })();
    }
    async.series(tasks, cb);
}

module.exports.getPDFPageCount = getPDFPageCount;
module.exports.splitPDFPages = splitPDFPages;
module.exports.unpaperPages = unpaperPages;
