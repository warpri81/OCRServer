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
    var downsample = options.downsample;
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

    function extractPNM(processInfo, cb) {
        searchify.emit('extractPNM', { processInfo: processInfo});
        var extractPageTime = process.hrtime();
        processInfo.files.originPNM = path.join(processInfo.outdir, 'original-'+processInfo.pagenum+'.pnm');
        exec(
            'gs -dNOPAUSE -dSAFER -sDEVICE=pnmraw '+
            '-r'+upsample+' -dFirstPage='+processInfo.pagenum+' -dLastPage='+processInfo.pagenum+' '+
            '-dBatch -o "'+processInfo.files.originPNM+'" "'+processInfo.infile+'"',
            function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    searchify.emit('PNMExtracted', { processInfo: processInfo, time: process.hrtime(extractPageTime), });
                    return cb(null, processInfo);
                }
            }
        );
    }

    function detectColor(processInfo, cb) {
        searchify.emit('detectColor', { processInfo: processInfo});
        var detectColorTime = process.hrtime();
        exec('python ./utils/detectColor.py '+processInfo.files.originPNM, function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                processInfo.colorcode = stdout;
                searchify.emit('colorDetected', { processInfo: processInfo, time: process.hrtime(detectColorTime), });
                return cb(null, processInfo);
            }
        });
    }

    function deskewPNM(processInfo, cb) {
        searchify.emit('deskewPNM', { processInfo: processInfo });
        var deskewPageTime = process.hrtime();
        processInfo.files.deskewPNM = path.join(processInfo.outdir, 'deskew-'+processInfo.pagenum+'.pnm');
        exec('convert "'+processInfo.files.originPNM+'" -deskew 40% "'+processInfo.files.deskewPNM+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('PNMDeskewed', { processInfo: processInfo, time: process.hrtime(deskewPageTime), });
                    return cb(err, processInfo);
            }
        });
    }

    function preprocessPage(processInfo, cb) {
        searchify.emit('preprocessPage', { processInfo: processInfo });
        var preprocessPageTime = process.hrtime();
        processInfo.files.preprocPNM = path.join(processInfo.outdir, 'preprocessed-'+processInfo.pagenum+'.pnm');
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
        exec('convert "'+processInfo.files.deskewPNM+'" '+convertOptions+' "'+processInfo.files.preprocPNM+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pagePreprocessed', { processInfo: processInfo, time: process.hrtime(preprocessPageTime), });
                return cb(null, processInfo);
            }
        });
    }

    function ocrPage(processInfo, cb) {
        searchify.emit('ocrPage', { processInfo: processInfo});
        var ocrPageTime = process.hrtime();
        processInfo.files.hocr = path.join(processInfo.outdir, 'ocr-'+processInfo.pagenum+'.hocr');
        var outfilebase = path.join(
            path.dirname(processInfo.files.hocr),
            path.basename(processInfo.files.hocr, '.hocr')
        );
        exec('tesseract "'+processInfo.files.preprocPNM+'" "'+outfilebase+'" hocr', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageOcred', { processInfo: processInfo, time: process.hrtime(ocrPageTime), });
                return cb(null, processInfo);
            }
        });
    }

    function downsamplePage(processInfo, cb) {
        if (downsample === undefined || downsample === upsample) {
            return cb(null, processInfo);
        }
        searchify.emit('downsamplePage', { processInfo: processInfo });
        var downsamplePageTime = process.hrtime();
        processInfo.files.downsamplePNM = path.join(processInfo.outdir, 'downsample-'+processInfo.pagenum+'.pnm');
        exec('convert -density '+upsample+' "'+processInfo.files.deskewPNM+'" -resample '+downsample+' "'+processInfo.files.downsamplePNM+'"', function(err, stdout, stderr) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('pageDownsampled', { processInfo: processInfo, time: process.hrtime(downsamplePageTime), });
                return cb(null, processInfo);
            }
        });
    }
    
    function composePage(processInfo, cb) {
        searchify.emit('composePage', { processInfo: processInfo });
        var composePageTime = process.hrtime();
        var outfile = path.join(processInfo.outdir, 'pdf-'+processInfo.pagenum+'.pdf');
        var pageImagePNM = processInfo.files.downsamplePNM || processInfo.files.deskewPNM;
        if (processInfo.colorcode === "0") {
            processInfo.files.jbig2 = path.join(processInfo.outdir, 'jbig2-'+processInfo.pagenum+'.pdf');
            exec('jbig2 -s -p -v "'+pageImagePNM+'" && ./utils/pdf.py output '+(downsample || upsample)+' > "'+processInfo.files.jbig2+'"', function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    exec('python utils/hocr-pdf PDF "'+processInfo.files.jbig2+'" "'+processInfo.files.hocr+'" "'+outfile+'" '+(downsample || upsample)+' '+upsample, function(err, stdout, stderr) {
                        if (err) {
                            return cb(err);
                        } else {
                            searchify.emit('pageComposed', { processInfo: processInfo, time: process.hrtime(composePageTime), });
                            return unlinkFilesCallback(processInfo['files'], function(err) {
                                return cb(err, outfile);
                            });
                        }
                    });
                }
            });
        } else {
            processInfo.files.jpeg = path.join(processInfo.outdir, 'jpeg-'+processInfo.pagenum+'.jpg');
            var grayscale = (processInfo.colorcode === "1" ? ' -grayscale ' : '');
            exec('pnmtojpeg --optimize '+grayscale+'"'+pageImagePNM+'" > "'+processInfo.files.jpeg+'"', function(err, stdout, stderr) {
                if (err) {
                    return cb(err);
                } else {
                    exec('python utils/hocr-pdf JPEG "'+processInfo.files.jpeg+'" "'+processInfo.files.hocr+'" "'+outfile+'" '+(downsample || upsample)+' '+upsample, function(err, stdout, stderr) {
                        if (err) {
                            return cb(err);
                        } else {
                            searchify.emit('pageComposed', { processInfo: processInfo, time: process.hrtime(composePageTime), });
                            return unlinkFilesCallback(processInfo.files, function(err) {
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

    function searchifyPage(processInfo, cb) {
        searchify.emit('startPage', { processInfo: processInfo });
        var startPageTime = process.hrtime();
        async.waterfall([
            async.apply(extractPNM, processInfo),
            detectColor,
            deskewPNM,
            preprocessPage,
            ocrPage,
            downsamplePage,
            composePage,
        ], function(err, outfile) {
            if (err) {
                return cb(err);
            } else {
                searchify.emit('donePage', { processInfo: processInfo, time: process.hrtime(startPageTime), });
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
                            var processInfo = {
                                "infile": infile,
                                "outdir": tmpdir,
                                "pagenum": i,
                                "files": {}
                            }
                            tasks.push(function(cb) {
                                searchifyPage(processInfo, function(err, outfile) {
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
                                if (err) {
                                    return cb(err);
                                } else if (keepfiles) {
                                    return cb();
                                } else {
                                    fs.rmdir(tmpdir, function(err) {
                                        if (!err || err.code === 'ENOTEMPTY') {
                                            return cb();
                                        } else {
                                            return cb(err);
                                        }
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    }
}
