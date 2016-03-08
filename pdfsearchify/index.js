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

    function detectColor(infile, origimage, outdir, pagenum, cb) {
        exec('python ./utils/detectColor.py '+origimage, function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                var colorcode = stdout;
                return cb(null, infile, origimage, outdir, pagenum, colorcode);
            }
        });
    }

    function deskewPNM(infile, origimage, outdir, pagenum, colorcode, cb) {
        searchify.emit('deskewPNM', { infile: infile, pagenum: pagenum, });
        var deskewPageTime = process.hrtime();
        var outfile = path.join(outdir, 'deskew-'+pagenum+'.pnm');
        exec('convert "'+origimage+'" -deskew 40% "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('PNMDeskewed', { infile: infile, pagenum: pagenum, time: process.hrtime(deskewPageTime), });
                return unlinkFilesCallback([origimage], function(err) {
                    return cb(err, infile, outfile, outdir, pagenum, colorcode);
                });
            }
        });
    }

    function preprocessPage(infile, deskewimage, outdir, pagenum, colorcode, cb) {
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
                convertOptions = '-respect-parenthesis \\( -clone 0 -colorspace gray -negate -lat 15x15+5% -contrast-stretch 0 \\) -compose copy_opacity -composite -opaque none +matte -modulate 100,100 -blur 1x1 -adaptive-sharpen 0x2 -negate -define morphology:compose=darken -morphology Thinning Rectangle:1x30+0+0 -negate';
                break;
        }
        exec('convert "'+deskewimage+'" '+convertOptions+' "'+outfile+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pagePreprocessed', { infile: infile, pagenum: pagenum, time: process.hrtime(preprocessPageTime), });
                return cb(null, infile, deskewimage, outfile, outdir, pagenum, colorcode);
            }
        });
    }

    function ocrPage(infile, deskewimage, preprocimage, outdir, pagenum, colorcode, cb) {
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
                    return cb(err, infile, deskewimage, outfilebase+'.hocr', outdir, pagenum, colorcode);
                });
            }
        });
    }
    
    function composePage(infile, deskewimage, hocrfile, outdir, pagenum, colorcode, cb) {
        searchify.emit('composePage', { infile: infile, pagenum: pagenum, });
        var composePageTime = process.hrtime();
        var outfile = path.join(outdir, 'pdf-'+pagenum+'.pdf');
        var jbig2 = path.join(outdir, 'jbig2-'+pagenum+'.pdf');
        var jpeg = path.join(outdir, 'jpeg-'+pagenum+'.jpg');
        var fileflag = '';
        if (colorcode === "0") {
            exec('jbig2 -s -p -v "'+deskewimage+'" && ./utils/pdf.py output > "'+jbig2+'"', function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    exec('python utils/hocr-pdf PDF "'+jbig2+'" "'+hocrfile+'" "'+outfile+'" '+upsample, function(err, stdout, stderr) {
                        if (err) {
                            return cb(err);
                        } else {
                            searchify.emit('pageComposed', { infile: infile, pagenum: pagenum, time: process.hrtime(composePageTime), });
                            return unlinkFilesCallback([deskewimage, hocrfile, jbig2], function(err) {
                                return cb(err, outfile);
                            });
                        }
                    });
                }
            });
        } else {
            var grayscale = (colorcode === "1" ? ' -grayscale ' : '');
            exec('pnmtojpeg --optimize '+grayscale+'"'+deskewimage+'" > "'+jpeg+'"', function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    exec('python utils/hocr-pdf JPEG "'+jpeg+'" "'+hocrfile+'" "'+outfile+'" '+upsample, function(err, stdout, stderr) {
                        if (err) {
                            return cb(err);
                        } else {
                            searchify.emit('pageComposed', { infile: infile, pagenum: pagenum, time: process.hrtime(composePageTime), });
                            return unlinkFilesCallback([deskewimage, hocrfile, jpeg], function(err) {
                                return cb(err, outfile);
                            });
                        }
                    });
                }
            });
        }
    }

    function composePDF(infiles, pdfinfofile, outdir, outfile, cb) {
        var composeTime = process.hrtime();
        var tempoutfile = path.join(outdir, 'composed.pdf');
        searchify.emit('compose', { outfile: outfile, });
        var infileargs = infiles.map(function(infile) { return '"'+infile+'"'; }).join(' ');
        exec('pdftk '+infileargs+' output '+tempoutfile, function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            }
            updatePDFInfo(tempoutfile, pdfinfofile, outfile, function(err) {
                if (err) {
                    return cb(err);
                }
                searchify.emit('composed', { outfile: outfile, time: process.hrtime(composeTime), });
                return unlinkFilesCallback([tempoutfile, pdfinfofile], function(err) {
                    return cb(null, outfile);
                });
            });
        });
    }

    function searchifyPage(infile, tmpdir, pagenum, cb) {
        searchify.emit('startPage', { infile: infile, pagenum: pagenum, });
        var startPageTime = process.hrtime();
        async.waterfall([
            async.apply(extractPNM, infile, tmpdir, pagenum),
            detectColor,
            deskewPNM,
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
