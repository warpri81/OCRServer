var fs = require('fs');
var async = require('async');
var pdfsearchify = require('./pdfsearchify')();
var chokidar = require('chokidar');

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

function addFile(path) {
    var filepath = path.replace(options.watchpath, '');
    filelist.push(filepath);

    if (started && filelist.length === 1) {
        ManagePDFSearchify();
    }
    
}

function removeFile(path) {
    var ind = filelist.indexOf(path);
    if (ind > -1) {
        filelist.splice(ind, 1);
    }
}

function startWatcher() {
    watcher = chokidar.watch(options.watchpath, { persistent: true });
    watcher.on('add', function(path) { addFile(path); });
    watcher.on('unlink', function(path) { removeFile(path); });
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
        file = filelist[0];

        pdfsearchify(options.watchpath + file, options.finishpath + file, function(err) {
            if (err) {
                console.log('ERROR: '+err);
            } else {
                console.log('Everything is OK');
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


