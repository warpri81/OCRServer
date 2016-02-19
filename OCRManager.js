var fs = require('fs');
var async = require('async');
var chokidar = require('chokidar');
var path = require('path');
var mkdirp = require('mkdirp');
var pdfsearchify;

var settingspath = process.argv[2];
var settings = {};
var watcher;
var q;

var requiredPaths = ['watchpath', 'processpath', 'finishpath', 'errorpath'];
var optionalPaths = ['keeppath'];
var optionalInts = ['workers'];

function start() {
    async.series([
        checkOptionsFile,
        validateRequiredPaths,
        validateOptionalPaths,
        validateOptionalInts,
        setPDFSearchifyListeners,
        makeQueue,
        ], function(err) {
            if (err) {
                console.log(err);
                exit();
            } else {
                startWatcher();
            }
        }
    );
}

function checkOptionsFile(cb) {
    if (!settingspath) {
        return cb(new Error('No settings file passed'));
    } else {
        try {
            settings = require(settingspath);
        } catch (e) {
            return cb(new Error('Settings file is not a valid JSON object'));
        }
        pdfsearchify = require('./pdfsearchify')(settings.pdfsearchify || {});
        return cb(null);
    }
}

function validateRequiredPaths(cb) {
    async.forEach(requiredPaths, validatePath, function(err) {
        return cb(err);
    });
}

function validateOptionalPaths(cb) {
    async.forEach(optionalPaths, validateOptionalPath, function(err) {
        return cb(err);
    });
}

function validateOptionalInts(cb) {
    async.forEach(optionalInts, validateOptionalInt, function(err) {
        return cb(err);
    });
}


function validatePath(pathtype, cb) {
    if (!settings.hasOwnProperty(pathtype)) {
        return cb(new Error('Settings file must have a ' + pathtype));
    } else {
        settings[pathtype] = path.normalize(settings[pathtype] + '/');
        fs.lstat(settings[pathtype], function(err, stats) {
            if (err) {
               return cb(err);
            } else if (!stats.isDirectory()) {
                return cb(new Error(pathtype + ' must be a valid directory'));
            } else {
                return cb(null);
            }
        });
    }
}

function validateOptionalPath(pathtype, cb) {
    if (settings.hasOwnProperty(pathtype)) {
        return validatePath(pathtype, cb);
    } else {
        return cb(null);
    }
}

function validateOptionalInt(option, cb) {
    if (settings.hasOwnProperty(option)) {
        if (settings[option] === parseInt(settings[option], 10)) {
            console.log('Setting %s to %s', option, settings[option]);
            settings[option] = parseInt(settings[option], 10);
            return cb(null);
        } else {
            console.log('%s is not a valid %s value', settings[option], option);
            delete settings[option];
            return cb(null);
        }
    } else {
        return cb(null);
    }
}

function setPDFSearchifyListeners(cb) {
    pdfsearchify.on('start', function(o) { console.log('Starting: '+o.infile); });
    pdfsearchify.on('compose', function(o) { console.log('Composing: '+o.outfile); });
    pdfsearchify.on('composed', function(o) { console.log('Composed: '+o.outfile+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('startPage', function(o) { console.log('Starting page: '+o.pagenum); });
    pdfsearchify.on('donePage', function(o) { console.log('Done page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('extractPage', function(o) { console.log('Extracting page: '+o.pagenum); });
    pdfsearchify.on('pageExtracted', function(o) { console.log('Extracted page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('cleanPage', function(o) { console.log('Cleaning page: '+o.pagenum); });
    pdfsearchify.on('pageCleaned', function(o) { console.log('Cleaned page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('ocrPage', function(o) { console.log('Ocring page: '+o.pagenum); });
    pdfsearchify.on('pageOcred', function(o) { console.log('Ocred page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('preparePage', function(o) { console.log('Preparing page: '+o.pagenum); });
    pdfsearchify.on('pagePrepared', function(o) { console.log('Prepared page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('composePage', function(o) { console.log('Composing page: '+o.pagenum); });
    pdfsearchify.on('pageComposed', function(o) { console.log('Composed page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
    pdfsearchify.on('done', function(o) { console.log('Done: '+o.infile+' ('+hrTimeString(o.time)+')'); });
    cb(null);
}

function hrTimeString(hrtime) {
    return hrtime[0]+hrtime[1]/1000000000;
}

function makeQueue(cb) {
    q = async.queue(managePDFSearchify, (settings.workers || 1));
    return cb(null);
}

function startWatcher() {
    watcher = chokidar.watch(settings.watchpath, { persistent: true, usePolling: true });
    watcher.on('add', function(filepath) { q.push(filepath) });
}

function fileExists(filepath) {
    try {
        fs.statSync(filepath)
        return true;
    } catch(e) {
        return false;
    }
}

function managePDFSearchify(file, cb) {
    if(fileExists(file)) {
        var processInfo = { "infile": file };
        async.waterfall([
            async.apply(calcDirPaths, processInfo),
            ensureProcDirPath,
            ensureOutDirPath,
            ensureKeepDirPath,
            calcProcFileName,
            calcOutFileName,
            calcKeepFileName,
            copyKeepFile,
            copyProcFile,
            ], function(err, processInfo) {
                if (err) {
                    console.log(err);
                    return cb(err);
                } else {
                    return searchify(processInfo, function(err) {
                        if (err) {
                            console.log(err);
                        }
                        return cleanup(err, processInfo, cb);
                    });
                }
            }
        );
    } else {
        console.log('File %s no longer exists', file);
        return cb(null);
    }
}

function calcDirPaths(processInfo, cb) {
    processInfo['relativepath'] = processInfo['infile'].replace(settings.watchpath,'');
    processInfo['procpath'] = path.normalize(path.join(settings.processpath, processInfo['relativepath']));
    processInfo['outpath'] = path.normalize(path.join(settings.finishpath, processInfo['relativepath']));
    processInfo['errorpath'] = path.normalize(path.join(settings.errorpath, processInfo['relativepath']));
    if (settings['keeppath']) {
        processInfo['keeppath'] = path.normalize(path.join(settings.keeppath, processInfo['relativepath']));
    }
    return cb(null, processInfo);
}

function ensureProcDirPath(processInfo, cb) {
    return ensureDirPath('procpath', processInfo, cb);
}

function ensureOutDirPath(processInfo, cb) {
    return ensureDirPath('outpath', processInfo, cb);
}

function ensureErrorDirPath(processInfo, cb) {
    return ensureDirPath('errorpath', processInfo, cb);
}

function ensureKeepDirPath(processInfo, cb) {
    if (processInfo['keeppath']) {
        return ensureDirPath('keeppath', processInfo, cb);
    } else {
        return cb(null, processInfo);
    }
}

function ensureDirPath(pathkey, processInfo, cb) {
    dirpath = path.dirname(processInfo[pathkey]);
    mkdirp(dirpath, function(err) {
        return cb(err, processInfo);
    });
}

function calcProcFileName(processInfo, cb) {
    return calcFileName('procpath', processInfo, cb);
}

function calcOutFileName(processInfo, cb) {
    return calcFileName('outpath', processInfo, cb);
}

function calcKeepFileName(processInfo, cb) {
    if (processInfo['keeppath']) {
        return calcFileName('keeppath', processInfo, cb);
    } else {
        return cb(null, processInfo);
    }
}

function calcErrorFileName(processInfo, cb) {
    return calcFileName('errorpath', processInfo, cb);
}

function calcFileName(pathkey, processInfo, cb) {
    var parsedPath = path.parse(processInfo[pathkey]);
    var copyPath = path.parse(processInfo[pathkey]);
    var copy = 0;
    while (fileExists(path.format(copyPath))) {
        ++copy;
        copyPath.name = parsedPath.name+'('+copy+')';
        copyPath.base = copyPath.name + copyPath.ext;
    }
    processInfo[pathkey] = path.format(copyPath);
    return cb(null, processInfo);
}

function copyKeepFile(processInfo, cb) {
    if (processInfo['keeppath']) {
        return copyFile(processInfo, processInfo.infile, processInfo.keeppath, false, cb);
    } else {
        return cb(null, processInfo);
    }
}

function copyProcFile(processInfo, cb) {
    return copyFile(processInfo, processInfo.infile, processInfo.procpath, true, cb);
}

function copyErrorFile(processInfo, cb) {
    return copyFile(processInfo, processInfo.procpath, processInfo.errorpath, true, cb);
}

function copyFile(processInfo, source, target, unlink, cb) {
    var cbCalled = false;
    var rd = fs.createReadStream(source);
    var wr = fs.createWriteStream(target);
    rd.on('error', function(err) { done(err); });
    wr.on('error', function(err) { done(err); });
    wr.on('close', function(ex) { done(); });
    rd.pipe(wr);

    function done(err) {
        if(!cbCalled) {
            cbCalled = true;
            if(err) {
                cb(err);
            } else {
                if (fileExists(target)) {
                    if (unlink) {
                        return unlinkFile(processInfo, source, target, cb);
                    } else {
                        return cb(null, processInfo);
                    }
                } else {
                    return cb(new Error('%s not moved to %s', source, target));
                }
            }
        }
    }
}

function unlinkFile(processInfo, target, newLocation, cb) {
    var dirname = path.dirname(target);
    if (!fileExists(newLocation)) {
        return cb(new Error(target+' has not been moved to '+newLocation));
    } else {
        fs.unlinkSync(target);
        return checkDeleteDirectory(processInfo, dirname, cb);
    }
}

function checkDeleteDirectory(processInfo, dirname, cb) {
    var dirname = path.normalize(dirname + '/');
    var failed = false;
    
    while (!failed && [settings.watchpath, settings.processpath, settings.errorpath].indexOf(dirname) === -1) {
        try {
            fs.rmdirSync(dirname);
            dirname = path.normalize(dirname+'/../');
        } catch (e) {
            failed = true;
        }
    }
    return cb(null, processInfo);
}

function searchify(processInfo, cb) {
    return pdfsearchify(processInfo.procpath, processInfo.outpath, cb);
}

function cleanup(err, processInfo, cb) {
    if (err) {
        async.waterfall([
            async.apply(ensureErrorDirPath, processInfo),
            calcErrorFileName,
            copyErrorFile,
            ], function(err) {
                return cb(err);
            }
        );
    } else {
        unlinkFile(processInfo, processInfo.procpath, processInfo.outpath, cb);
    }
}

function exit() {
    running = false;
    console.log('EXITING');
    process.exit(1);
}

start();
