var settingspath = process.argv[2] || '';
var ocrmanager = require('./ocrmanager')(settingspath);

ocrmanager(function(err) {
    if (err) {
        console.log('ERROR: ' + err);
    } else {
        console.log('Everything is OK');
    }
    process.exit(0);
});


