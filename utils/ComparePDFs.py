import sys
from fuzzywuzzy import fuzz
from PyPDF2 import PdfFileReader

def comparePDFs(infile1, infile2):
    scores = []
    with open(infile1, 'rb') as fp1, open(infile2, 'rb') as fp2:
        pdf1 = PdfFileReader(fp1)
        pdf2 = PdfFileReader(fp2)
        assert(pdf1.getNumPages() == pdf2.getNumPages())
        for pagenum in range(pdf1.getNumPages()):
            text1 = pdf1.getPage(pagenum).extractText()
            text2 = pdf2.getPage(pagenum).extractText()
            scores.append([
                fuzz.ratio(text1, text2),
                fuzz.token_sort_ratio(text1, text2)
            ])
    return scores

if __name__ == '__main__':
    scores = comparePDFs(sys.argv[-2], sys.argv[-1])
    page = 1
    for ratio_score, token_score in scores:
        print '%5d %5d %5d' % (page, ratio_score, token_score)
        page += 1
