var fs = require('fs');
var events = require('events');
var path = require('path');
var mixin = require('merge-descriptors');
var exec = require('child_process').exec;
var async = require('async');

module.exports = createPDFSearchify;

function createPDFSearchify(options) {

    options = options || {};
    var upsample = options.upsample || 300;
    var keepfiles = options.keepfiles || false;

    var tmp = require('tmp');
    if (!keepfiles) {
        tmp.setGracefulCleanup();
    }

    mixin(searchify, events.EventEmitter.prototype, false);
    return searchify;

    function unlinkFilesCallback(files, cb) {
        if (keepfiles) {
            return cb()
        } else {
            return async.each(files, fs.unlink, cb);
        }
    }

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
        searchify.emit('extractPage', { infile: infile, pagenum: pagenum, });
        var extractPageTime = process.hrtime();
        var outfile = path.join(outdir, 'original-'+pagenum+'.pnm');
        exec(
            'gs -dNOPAUSE -dSAFER -sDEVICE=pnmraw '+
            '-r'+upsample+' -dFirstPage='+pagenum+' -dLastPage='+pagenum+' '+
            '-dBatch -o "'+outfile+'" "'+infile+'"',
            function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    searchify.emit('pageExtracted', { infile: infile, pagenum: pagenum, time: process.hrtime(extractPageTime), });
                    return cb(null, infile, outfile, outdir, pagenum);
                }
            }
        );
    }

    function unpaperPage(infile, pageimage, outdir, pagenum, cb) {
        searchify.emit('cleanPage', { infile: infile, pagenum: pagenum, });
        var cleanPageTime = process.hrtime();
        var outfile = path.join(outdir, 'unpaper-'+pagenum+'.pnm');
        exec('unpaper "'+pageimage+'" "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageCleaned', { infile: infile, pagenum: pagenum, time: process.hrtime(cleanPageTime), });
                return unlinkFilesCallback([pageimage], function(err) {
                    return cb(err, infile, outfile, outdir, pagenum);
                });
            }
        });
    }

    function ocrPage(infile, pageimage, outdir, pagenum, cb) {
        searchify.emit('ocrPage', { infile: infile, pagenum: pagenum, });
        var ocrPageTime = process.hrtime();
        var outfile = path.join(outdir, 'ocr-'+pagenum+'.hocr');
        var outfilebase = path.join(
            path.dirname(outfile),
            path.basename(outfile, '.hocr')
        );
        exec('tesseract "'+pageimage+'" "'+outfilebase+'" hocr', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageOcred', { infile: infile, pagenum: pagenum, time: process.hrtime(ocrPageTime), });
                return cb(null, infile, pageimage, outfilebase+'.hocr', outdir, pagenum);
            }
        });
    }

    function cleanHOCR(infile, pageimage, hocrfile, outdir, pagenum, cb) {
        searchify.emit('preparePage', { infile: infile, pagenum: pagenum, });
        var preparePageTime = process.hrtime();
        var outfile = path.join(outdir, 'ocr-fixed-'+pagenum+'.hocr');
        fs.readFile(hocrfile, 'utf8', function(err, data) {
            if (err) {
                return cb(err);
            }
            var result = data.replace(/='[^"]+'/g, function(s) { return s.replace(/'/g, '"'); });
            fs.writeFile(outfile, result, 'utf8', function(err) {
                if (err) {
                    return cb(err);
                } else {
                    searchify.emit('pagePrepared', { infile: infile, pagenum: pagenum, time: process.hrtime(preparePageTime), });
                    return unlinkFilesCallback([hocrfile], function(err) {
                        return cb(err, infile, pageimage, outfile, outdir, pagenum);
                    });
                }
            });
        });
    }

    function composePage(infile, pageimage, hocrfile, outdir, pagenum, cb) {
        searchify.emit('composePage', { infile: infile, pagenum: pagenum, });
        var composePageTime = process.hrtime();
        var outfile = path.join(outdir, 'pdf-'+pagenum+'.pdf');
        exec('hocr2pdf -i "'+pageimage+'" -s -o "'+outfile+'" < "'+hocrfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageComposed', { infile: infile, pagenum: pagenum, time: process.hrtime(composePageTime), });
                return unlinkFilesCallback([pageimage, hocrfile], function(err) {
                    return cb(err, outfile);
                });
            }
        });
    }

    function composePDF(infiles, outfile, cb) {
        var composeTime = process.hrtime();
        searchify.emit('compose', { outfile: outfile, });
        var infileargs = infiles.map(function(infile) { return '"'+infile+'"'; }).join(' ');
        exec(
            'gs -dNOPAUSE -dSAFER -sDEVICE=pdfwrite '+
            '-dBatch -o "'+outfile+'" '+infileargs,
            function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                }
                searchify.emit('composed', { outfile: outfile, time: process.hrtime(composeTime), });
                return cb(null, outfile);
            }
        );
    }

    function searchifyPage(infile, tmpdir, pagenum, cb) {
        searchify.emit('startPage', { infile: infile, pagenum: pagenum, });
        var startPageTime = process.hrtime();
        async.waterfall([
            async.apply(extractPage, infile, tmpdir, pagenum),
            unpaperPage,
            ocrPage,
            cleanHOCR,
            composePage,
        ], function(err, outfile) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('donePage', { infile: infile, pagenum: pagenum, time: process.hrtime(startPageTime), });
                return cb(null, outfile);
            }
        });
    }

    function searchify(infile, outfile, cb) {
        var startTime = process.hrtime();
        searchify.emit('start', { infile: infile, outfile: outfile, });
        var pdfpages = [];
        getPDFPageCount(infile, function(err, pagecount) {
            if (err) {
                return cb(err);
            }
            tmp.dir({ prefix: 'OCRServer', keep: keepfiles }, function(err, tmpdir, cleanupcb) {
                if (err) {
                    return cb(err);
                }
                var tasks = [];
                for (var i = 1; i <= pagecount; i++) {
                    (function() {
                        var pagenum = i;
                        tasks.push(function(cb) {
                            searchifyPage(infile, tmpdir, pagenum, function(err, outfile) {
                                if (err) {
                                    return cb(err);
                                }
                                pdfpages.push(outfile);
                                return cb();
                            });
                        });
                    })();
                }
                async.series(tasks, function(err) {
                    if (err) {
                        return cb(err);
                    }
                    composePDF(pdfpages, outfile, function(err, outfile) {
                        if (err) {
                            return cb(err);
                        }
                        searchify.emit('done', { infile: infile, outfile: outfile, time: process.hrtime(startTime), });
                        return unlinkFilesCallback(pdfpages, function(err) {
                            return cb(err);
                        });
                    });
                });
            });
        });
    }

}
