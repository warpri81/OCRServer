var fs = require('fs');
var async = require('async');
var pdfsearchify = require('./pdfsearchify')();
var chokidar = require('chokidar');
var path = require('path');
var mkdirp = require('mkdirp');

var optpath = process.argv[2];
var options = {};
var filelist = [];
var started = false;
var processing = false;
var running = true;
var watcher;


function start() {
    setPDFSearchifyListeners();
    setOptions(startWatcher);
}

function validateOptionPath(folderpath, foldertype) {
    if (!options.hasOwnProperty(foldertype)) {
        console.log('The settingsfile must name a ' + foldertype);
        exit();
    }
    options[foldertype] = path.normalize(options[foldertype]);
    fs.lstat(folderpath, function(err, stats) {
        if (err || !stats.isDirectory()) {
            console.log(foldertype + ' must be a valid directory');
            exit();
        }
    });
}

function setOptions(callback) {
    if (!optpath) {
        console.log('You must pass a path to an settings file');
        exit();
    }
    try {
        options = require(optpath);
    } catch (e) {
        console.log('The settings file must be a valid JSON file');
        exit();
    }
    validateOptionPath(options.watchpath, 'watchpath');
    validateOptionPath(options.finishpath, 'finishpath');
    validateOptionPath(options.errorpath, 'errorpath');

    callback();

}

function addFile(filepath) {
    filelist.push(filepath);

    if (started && filelist.length === 1) {
        ManagePDFSearchify();
    }
    
}

function removeFile(filepath) {
    var ind = filelist.indexOf(filepath);
    if (ind > -1) {
        filelist.splice(ind, 1);
    }
}

function fileExists(filepath) {
    try {
        fs.statSync(filepath)
        return true;
    } catch(e) {
        return false;
    }
}

function getEmptyPath(filepath) {
    var parsedPath = path.parse(filepath);
    var copyPath = parsedPath;
    var copy = 0;
    while (fileExists(path.format(copyPath))) {
        ++copy;
        copyPath = parsedPath;
        copyPath.name = ('%s(%d)', parsedPath.name, copy);
        console.log(copyPath.name);
        copyPath.base = copyPath.name + copyPath.ext;
    }
    return path.format(copyPath);
}

function copyFile(source, target) {
    console.log('Moving file from %s to %s', source, target);
    var cbCalled = false;
    var rd = fs.createReadStream(source);
    rd.on("error", function(err) { done(err); });

    var wr = fs.createWriteStream(target);
    wr.on("error", function(err) { done(err); });
    wr.on("close", function(ex) { done(); });

    rd.pipe(wr);

    function done(err) {
        if(!cbCalled) {
            cbCalled = true;
            if(err) {
                console.log('Could not move file %s to %s', source, target);
            } else {
                unlinkFile(source, target);
            }
        }
    }
}

function ensureDirPath(filepath) {
    console.log('Ensuring a path to %s', filepath);
    dirpath = path.dirname(filepath);
    mkdirp(dirpath, function(err) {
        if (err) {
            console.log('Could not make a directory path for %s', dirpath);
        }
    });
}

function unlinkFile(target, newLocation) {
    console.log('Removing %s. This file should exist at %s', target, newLocation);
    var dirname = path.dirname(target);
    if (!fileExists(newLocation)) {
        console.log('%s has not been moved to %s', target, newLocation);
        console.log('Not deleting %s', target);
    } else {
        fs.unlink(target);
        checkDeleteDirectory(dirname);
    }
}

function checkDeleteDirectory(dirname) {
    var dirname = path.normalize(dirname + '/');
    var watchpath = path.normalize(options.watchpath + '/');
    
    if (dirname != watchpath) {
        console.log('DIRNAME: %s', dirname);
        console.log('WATCHPATH: %s', watchpath);
        console.log('Attempting to delete directory %s', dirname);
        try {
            fs.rmdirSync(dirname);
            checkDeleteDirectory(path.normalize(dirname+'/..'));
            console.log('Directory %s deleted', dirname);
        } catch (e) {
            console.log('Could not delete directory %s', dirname);
        }
    }
}

    

function startWatcher() {
    watcher = chokidar.watch(options.watchpath, { persistent: true });
    watcher.on('add', function(filepath) { addFile(filepath); });
    watcher.on('unlink', function(filepath) { removeFile(filepath); });
    watcher.on('ready', function() {
        ManagePDFSearchify();
        started = true;
    });
}

function hrTimeString(hrtime) {
    return hrtime[0]+hrtime[1]/1000000000;
}

function setPDFSearchifyListeners() {
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
}

function ManagePDFSearchify() {
    if (!processing && filelist.length > 0) {
        processing = true;
        inpath = filelist[0];
        relativepath = path.normalize(inpath.replace(options.watchpath,''));
        outpath = getEmptyPath(path.normalize(path.join(options.finishpath, relativepath)));
        ensureDirPath(outpath);

        pdfsearchify(inpath, outpath, function(err) {
            if (err) {
                console.log('ERROR: '+err);
                errorpath = getEmptyPath(path.join(options.errorpath, relativepath));
                ensureDirPath(errorpath);
                copyFile(inpath, errorpath);
            } else {
                console.log('Everything is OK');
                unlinkFile(inpath, outpath);
            }
            filelist.shift();
            processing = false;
            ManagePDFSearchify();
        });
    }
}


function exit() {
    running = false;
    console.log('EXITING');
    process.exit(1);
}


start();


