import sys, os
import re
from fuzzywuzzy import fuzz
from PyPDF2 import PdfFileReader

SPACE_RE = re.compile(r'\s+')

def comparePDFs(infile1, infile2):
    pagescores = []
    alltext1 = ''
    alltext2 = ''
    with open(infile1, 'rb') as fp1, open(infile2, 'rb') as fp2:
        pdf1 = PdfFileReader(fp1)
        pdf2 = PdfFileReader(fp2)
        assert(pdf1.getNumPages() == pdf2.getNumPages())
        for pagenum in range(pdf1.getNumPages()):
            #text1 = SPACE_RE.sub(' ', pdf1.getPage(pagenum).extractText().strip())
            text1 = pdf1.getPage(pagenum).extractText()
            #text2 = SPACE_RE.sub(' ', pdf2.getPage(pagenum).extractText().strip())
            text2 = pdf2.getPage(pagenum).extractText()
            pagescores.append([
                fuzz.ratio(text1, text2),
                fuzz.token_sort_ratio(text1, text2),
                len(text1),
                len(text2),
            ])
            alltext1 += text1
            alltext2 += text2
    return pagescores, fuzz.ratio(alltext1, alltext2), fuzz.token_sort_ratio(alltext1, alltext2)

def showComparePDFs(infile1, infile2):
    pagescores, all_ratio_score, all_token_score = comparePDFs(infile1, infile2)
    infilename1 = os.path.basename(infile1)
    infilename2 = os.path.basename(infile2)
    title = infilename1 if infilename1 == infilename2 else infilename1 + ' / ' + infilename2
    ratio_scores = []
    token_scores = []
    print title
    print '-'*len(title)
    page = 1
    print 'Page  Ratio Token Len1  Len2 '
    print '===== ===== ===== ===== ====='
    for ratio_score, token_score, len1, len2 in pagescores:
        print '%5d %5d %5d %5d %5d' % (page, ratio_score, token_score, len1, len2)
        ratio_scores.append(ratio_score)
        token_scores.append(token_score)
        page += 1
    ratio_avg = sum(ratio_scores) / len(ratio_scores)
    token_avg = sum(token_scores) / len(token_scores)
    print '  All %5d %5d' % (all_ratio_score, all_token_score)
    print '  AVG %5d %5d' % (ratio_avg, token_avg)
    return ratio_avg, token_avg

if __name__ == '__main__':
    path1, path2 = sys.argv[-2:]
    if os.path.isdir(path1) and os.path.isdir(path2):
        ratio_avgs = []
        token_avgs = []
        path1files = os.listdir(path1)
        path2files = os.listdir(path2)
        for f in path1files:
            if f in path2files:
                ratio_avg, token_avg = showComparePDFs(os.path.join(path1, f), os.path.join(path2, f))
                ratio_avgs.append(ratio_avg)
                token_avgs.append(token_avg)
                print
        print 'Overall Average %5d %5d' % (sum(ratio_avgs) / len(ratio_avgs), sum(token_avgs) / len(ratio_avgs))
    else:
        showComparePDFs(path1, path2)
