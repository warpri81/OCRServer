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
    var preprocess = options.preprocess || 'lat'; // quick, lat
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

    function dumpPDFInfo(filename, outdir, cb) {
        var outfile = path.join(outdir, 'pdfinfo.txt');
        exec('pdftk "'+filename+'" dump_data output "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                return cb(null, filename, outfile);
            }
        });
    }

    function updatePDFInfo(infile, infofile, outfile, cb) {
        exec('pdftk "'+infile+'" update_info "'+infofile+'" output "'+outfile+'"', function(err, stdout, stderr) {
            return cb(err);
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

    function deskewPage(infile, pageimage, outdir, pagenum, cb) {
        searchify.emit('deskewPage', { infile: infile, pagenum: pagenum, });
        var deskewPageTime = process.hrtime();
        var outfile = path.join(outdir, 'deskew-'+pagenum+'.pnm');
        exec('convert "'+pageimage+'" -deskew 40% "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageDeskewed', { infile: infile, pagenum: pagenum, time: process.hrtime(deskewPageTime), });
                return unlinkFilesCallback([pageimage], function(err) {
                    return cb(err, infile, outfile, outdir, pagenum);
                });
            }
        });
    }

    function preprocessPage(infile, pageimage, outdir, pagenum, cb) {
        searchify.emit('preprocessPage', { infile: infile, pagenum: pagenum, });
        var preprocessPageTime = process.hrtime();
        var outfile = path.join(outdir, 'preprocessed-'+pagenum+'.pnm');
        var convertOptions;
        switch (preprocess) {
            case 'quick':
                convertOptions = '-type grayscale -blur 1x65000 -contrast -normalize -despeckle -despeckle -threshold 50%';
                break;
            case 'lat':
            default:
                convertOptions = '-respect-parenthesis \\( -clone 0 -colorspace gray -negate -lat 15x15+5% -contrast-stretch 0 \\) -compose copy_opacity -composite -opaque none +matte -modulate 100,100 -blur 1x1 -adaptive-sharpen 0x2 -negate -define morphology:compose=darken -morphology Thinning Rectangle:1x30+0+0 -negate'
                break;
        }
        exec('convert "'+pageimage+'" '+convertOptions+' "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pagePreprocessed', { infile: infile, pagenum: pagenum, time: process.hrtime(preprocessPageTime), });
                return cb(null, infile, pageimage, outfile, outdir, pagenum);
            }
        });
    }

    function ocrPage(infile, pageimage, preprocimage, outdir, pagenum, cb) {
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
                    return cb(err, infile, pageimage, outfilebase+'.hocr', outdir, pagenum);
                });
            }
        });
    }

    function composePage(infile, pageimage, hocrfile, outdir, pagenum, cb) {
        searchify.emit('composePage', { infile: infile, pagenum: pagenum, });
        var composePageTime = process.hrtime();
        var outfile = path.join(outdir, 'pdf-'+pagenum+'.pdf');
        exec('python utils/hocr-pdf "'+pageimage+'" "'+hocrfile+'" "'+outfile+'" '+upsample, function(err, stdout, stderr) {
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

    function composePDF(infiles, pdfinfofile, outdir, outfile, cb) {
        var composeTime = process.hrtime();
        var tempoutfile = path.join(outdir, 'composed.pdf');
        searchify.emit('compose', { outfile: outfile, });
        var infileargs = infiles.map(function(infile) { return '"'+infile+'"'; }).join(' ');
        exec(
            'gs -dNOPAUSE -dSAFER -sDEVICE=pdfwrite '+
            '-dCompatibilityLevel=1.4 -dPDFSETTINGS=/'+optimize+' '+
            '-dBatch -o "'+tempoutfile+'" '+infileargs,
            function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                }
                updatePDFInfo(tempoutfile, pdfinfofile, outfile, function(err) {
                    searchify.emit('composed', { outfile: outfile, time: process.hrtime(composeTime), });
                    return unlinkFilesCallback([tempoutfile, pdfinfofile], function(err) {
                        return cb(null, outfile);
                    });
                });
            }
        );
    }

    function searchifyPage(infile, tmpdir, pagenum, cb) {
        searchify.emit('startPage', { infile: infile, pagenum: pagenum, });
        var startPageTime = process.hrtime();
        async.waterfall([
            async.apply(extractPage, infile, tmpdir, pagenum),
            deskewPage,
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
                dumpPDFInfo(infile, tmpdir, function(err, infile, pdfinfofile) {
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
                        composePDF(pdfpages, pdfinfofile, tmpdir, outfile, function(err, outfile) {
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
        });
    }
}
