FROM node:10
RUN apt-get update
RUN apt-get install -y python-pip pdftk ghostscript imagemagick tesseract-ocr netpbm
RUN pip install PyPDF2 fuzzywuzzy pillow reportlab
COPY package*.json .
RUN npm install
COPY . .
CMD [ "node", "OCRManager.js", "/docker-settings.json" ]
