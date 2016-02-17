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
    var optimize = options.optimize || 'default'; // screen, ebook, prepress, default
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

    function extractPNM(infile, outdir, pagenum, cb) {
        searchify.emit('extractPNM', { infile: infile, pagenum: pagenum, });
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
                    searchify.emit('PNMExtracted', { infile: infile, pagenum: pagenum, time: process.hrtime(extractPageTime), });
                    return cb(null, infile, outfile, outdir, pagenum);
                }
            }
        );
    }

    function extractPDF(infile, pageimage, outdir, pagenum, cb) {
        searchify.emit('extractPDF', {infile: infile, pagenum: pagenum, });
        var extractPageTime = process.hrtime();
        var outfile = path.join(outdir, 'original-'+pagenum+'.pdf');
        exec(
            'gs -dNOPAUSE -dSAFER -sDEVICE=pdfwrite '+
            '-r'+upsample+' -dFirstPage='+pagenum+' -dLastPage='+pagenum+' '+
            '-dBatch -o "'+outfile+'" "'+infile+'"',
            function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    searchify.emit('PDFExtracted', { infile: infile, pagenum: pagenum, time: process.hrtime(extractPageTime), });
                    return cb(null, infile, pageimage, outfile, outdir, pagenum);
                }
            }
        );
    }

    function deskewPNM(infile, pageimage, pdforiginal, outdir, pagenum, cb) {
        searchify.emit('deskewPNM', { infile: infile, pagenum: pagenum, });
        var deskewPageTime = process.hrtime();
        var outfile = path.join(outdir, 'deskew-'+pagenum+'.pnm');
        exec('convert "'+pageimage+'" -deskew 40% "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('PNMDeskewed', { infile: infile, pagenum: pagenum, time: process.hrtime(deskewPageTime), });
                return unlinkFilesCallback([pageimage], function(err) {
                    return cb(err, infile, outfile, pdforiginal, outdir, pagenum);
                });
            }
        });
    }

    function deskewPDF(infile, pageimage, pdforiginal, outdir, pagenum, cb) {
        searchify.emit('deskewPDF', { infile: infile, pagenum: pagenum, });
        var deskewPageTime = process.hrtime();
        var outfile = path.join(outdir, 'deskew-'+pagenum+'.pdf');
        exec('convert "'+pdforiginal+'" -deskew 40% "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('PDFDeskewed', { infile: infile, pagenum: pagenum, time: process.hrtime(deskewPageTime), });
                return unlinkFilesCallback([pdforiginal], function(err) {
                    return cb(err, infile, pageimage, outfile, outdir, pagenum);
                });
            }
        });
    }

    function preprocessPage(infile, pageimage, pdforiginal, outdir, pagenum, cb) {
        searchify.emit('preprocessPage', { infile: infile, pagenum: pagenum, });
        var preprocessPageTime = process.hrtime();
        var outfile = path.join(outdir, 'preprocessed-'+pagenum+'.pnm');
        exec('convert "'+pageimage+'" -type grayscale -blur 1x65000 -contrast -normalize -despeckle -despeckle -threshold 50% "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pagePreprocessed', { infile: infile, pagenum: pagenum, time: process.hrtime(preprocessPageTime), });
                return unlinkFilesCallback([pageimage], function(err) {
                    return cb(null, infile, outfile, pdforiginal, outdir, pagenum);
                });
            }
        });
    }

    function ocrPage(infile, preprocimage, pdforiginal, outdir, pagenum, cb) {
        searchify.emit('ocrPage', { infile: infile, pagenum: pagenum, });
        var ocrPageTime = process.hrtime();
        var outfile = path.join(outdir, 'ocr-'+pagenum+'.hocr');
        var outfilebase = path.join(
            path.dirname(outfile),
            path.basename(outfile, '.hocr')
        );
        exec('tesseract "'+preprocimage+'" "'+outfilebase+'" hocr', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageOcred', { infile: infile, pagenum: pagenum, time: process.hrtime(ocrPageTime), });
                return unlinkFilesCallback([preprocimage], function(err) {
                    return cb(err, infile, outfilebase+'.hocr', pdforiginal, outdir, pagenum);
                });
            }
        });
    }

    function composePage(infile, hocrfile, pdforiginal, outdir, pagenum, cb) {
        searchify.emit('composePage', { infile: infile, pagenum: pagenum, });
        var composePageTime = process.hrtime();
        var outfile = path.join(outdir, 'pdf-'+pagenum+'.pdf');
        exec('python utils/hocr-pdf "'+pdforiginal+'" "'+hocrfile+'" "'+outfile+'" '+upsample, function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageComposed', { infile: infile, pagenum: pagenum, time: process.hrtime(composePageTime), });
                return unlinkFilesCallback([hocrfile, pdforiginal], function(err) {
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
            '-dCompatibilityLevel=1.4 -dPDFSETTINGS=/'+optimize+' '+
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
            async.apply(extractPNM, infile, tmpdir, pagenum),
            extractPDF,
            deskewPNM,
            deskewPDF,
            preprocessPage,
            ocrPage,
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
