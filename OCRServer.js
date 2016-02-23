var async = require('async');
var pdfsearchify = require('./pdfsearchify')();

var infile = process.argv[2]
  , outfile = process.argv[3];

function hrTimeString(hrtime) {
    return hrtime[0]+hrtime[1]/1000000000;
}

pdfsearchify.on('start', function(o) { console.log('Starting: '+o.infile); });
pdfsearchify.on('done', function(o) { console.log('Done: '+o.infile+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('compose', function(o) { console.log('Composing: '+o.outfile); });
pdfsearchify.on('composed', function(o) { console.log('Composed: '+o.outfile+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('startPage', function(o) { console.log('Starting page: '+o.pagenum); });
pdfsearchify.on('donePage', function(o) { console.log('Done page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('extractPage', function(o) { console.log('Extracting page: '+o.pagenum); });
pdfsearchify.on('pageExtracted', function(o) { console.log('Extracted page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('deskewPage', function(o) { console.log('Deskewing page: '+o.pagenum); });
pdfsearchify.on('pageDeskewed', function(o) { console.log('Deskewed page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('preprocessPage', function(o) { console.log('Preprocessing page: '+o.pagenum); });
pdfsearchify.on('pagePreprocessed', function(o) { console.log('Preprocessed page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('ocrPage', function(o) { console.log('Ocring page: '+o.pagenum); });
pdfsearchify.on('pageOcred', function(o) { console.log('Ocred page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('composePage', function(o) { console.log('Composing page: '+o.pagenum); });
pdfsearchify.on('pageComposed', function(o) { console.log('Composed page: '+o.pagenum+' ('+hrTimeString(o.time)+')'); });


pdfsearchify(infile, outfile, function(err) {
    if (err) {
        console.log('ERROR: '+err);
        process.exit(1);
    } else {
        console.log('Everything is OK');
        process.exit(0);
    }
});
