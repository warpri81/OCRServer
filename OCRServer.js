var async = require('async');
var pdfsearchify = require('./pdfsearchify')();

var infile = process.argv[2]
  , outfile = process.argv[3];

function hrTimeString(hrtime) {
    return hrtime[0]+hrtime[1]/1000000000;
}

pdfsearchify.on('start', function(o) { console.log('Starting: '+o.infile); });
pdfsearchify.on('done', function(o) {
    var pagesPerSecond = o.pages / (o.time[0] + o.time[1]/1e9);
    console.log('Done: '+o.infile+' ('+o.pages+' pages in '+hrTimeString(o.time)+'s - '+pagesPerSecond+' pages/sec)');
});
pdfsearchify.on('compose', function(o) { console.log('Composing: '+o.outfile); });
pdfsearchify.on('composed', function(o) { console.log('Composed: '+o.outfile+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('startPage', function(o) { console.log('Starting page: '+o.processInfo.pagenum); });
pdfsearchify.on('donePage', function(o) { console.log('Done page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('extractPNM', function(o) { console.log('Extracting page: '+o.processInfo.pagenum); });
pdfsearchify.on('PNMExtracted', function(o) { console.log('Extracted page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('detectColor', function(o) { console.log('Detecting Color: '+o.processInfo.pagenum); });
pdfsearchify.on('colorDetected', function(o) { console.log('Detected Color: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('deskewPNM', function(o) { console.log('Deskewing page: '+o.processInfo.pagenum); });
pdfsearchify.on('PNMDeskewed', function(o) { console.log('Deskewed page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('preprocessPage', function(o) { console.log('Preprocessing page: '+o.processInfo.pagenum); });
pdfsearchify.on('pagePreprocessed', function(o) { console.log('Preprocessed page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('downsamplePage', function(o) { console.log('Downsampling page: '+o.processInfo.pagenum); });
pdfsearchify.on('pageDownsampled', function(o) { console.log('Downsampled page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('ocrPage', function(o) { console.log('Ocring page: '+o.processInfo.pagenum); });
pdfsearchify.on('pageOcred', function(o) { console.log('Ocred page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });
pdfsearchify.on('composePage', function(o) { console.log('Composing page: '+o.processInfo.pagenum); });
pdfsearchify.on('pageComposed', function(o) { console.log('Composed page: '+o.processInfo.pagenum+' ('+hrTimeString(o.time)+')'); });


pdfsearchify(infile, outfile, function(err) {
    if (err) {
        console.log('ERROR: '+err);
        process.exit(1);
    } else {
        console.log('Everything is OK');
        process.exit(0);
    }
});
