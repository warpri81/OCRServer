var async = require('async');
var pdfsearchify = require('./pdfsearchify')();

var infile = process.argv[2]
  , outfile = process.argv[3];

pdfsearchify.on('start', function(o) { console.log('Starting: '+o.infile); });
pdfsearchify.on('done', function(o) { console.log('Done: '+o.infile); });
pdfsearchify.on('compose', function(o) { console.log('Composing: '+o.outfile); });
pdfsearchify.on('composed', function(o) { console.log('Composed: '+o.outfile); });
pdfsearchify.on('startPage', function(o) { console.log('Starting page: '+o.pagenum); });
pdfsearchify.on('donePage', function(o) { console.log('Done page: '+o.pagenum); });
pdfsearchify.on('extractPage', function(o) { console.log('Extracting page: '+o.pagenum); });
pdfsearchify.on('pageExtracted', function(o) { console.log('Extracted page: '+o.pagenum); });
pdfsearchify.on('cleanPage', function(o) { console.log('Cleaning page: '+o.pagenum); });
pdfsearchify.on('pageCleaned', function(o) { console.log('Cleaned page: '+o.pagenum); });
pdfsearchify.on('ocrPage', function(o) { console.log('Ocring page: '+o.pagenum); });
pdfsearchify.on('pageOcred', function(o) { console.log('Ocred page: '+o.pagenum); });
pdfsearchify.on('preparePage', function(o) { console.log('Preparing page: '+o.pagenum); });
pdfsearchify.on('pagePrepared', function(o) { console.log('Prepared page: '+o.pagenum); });
pdfsearchify.on('composePage', function(o) { console.log('Composing page: '+o.pagenum); });
pdfsearchify.on('pageComposed', function(o) { console.log('Composed page: '+o.pagenum); });


pdfsearchify(infile, outfile, function(err) {
    if (err) {
        console.log('ERROR: '+err);
    } else {
        console.log('Everything is OK');
    }
    process.exit(0);
});
