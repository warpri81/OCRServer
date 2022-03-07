OCRServer is a node script to OCR PDFs from a watch folder.
The repo is located at: https://github.com/warpri81/OCRServer.git

SYSTEM REQUIREMENTS:
-------------------
- Git
- Python2
- Node
- PDFTK
- Ghostscript
- ImageMagick

INSTALLATION:
------------
Install git, python2, node, pdftk, ghostscript, imagemagick, and pip (for python2)

Install pip packages: pillow, reportlab, pypdf2

CONFIGURATION:
-------------
Settings are specified in a JSON file. The following settings are required:
- loglevel - 'verbose' or 'warn' (defaults to 'warn')
- filelog - true or false
- watchpath - full path to watch folder
- processpath - full path to the folder where file parts are stored during processing
- errorpath - full path to the error folder where failed OCR files go
- finishpath - full path for the folder where the resulting OCRed PDFs are stored
- workers - number of daemon processes to use for PDF processing
    
TO RUN:
------
node /path/to/ocrserver/OCRServer.js /path/to/settings.json

**OR**

node /path/to/ocrserver/OCRServer.js /path/to/settings.json & (to keep running after disconnecting ssh)

TIPS:
----
- references to 'python' may need to be changed to 'python2' if running on a server where
- python3 is the default python
