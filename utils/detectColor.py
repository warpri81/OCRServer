import os
import sys

from PIL import Image, ImageStat

# http://stackoverflow.com/a/23035464
def detect_color_image(file, thumb_size=40, MSE_cutoff=22, adjust_color_bias=True):
    pil_img = Image.open(file)
    bands = pil_img.getbands()
    if bands == ('R','G','B') or bands== ('R','G','B','A'):
        thumb = pil_img.resize((thumb_size,thumb_size))
        SSE, bias = 0, [0,0,0]
        if adjust_color_bias:
            bias = ImageStat.Stat(thumb).mean[:3]
            bias = [b - sum(bias)/3 for b in bias ]
        for pixel in thumb.getdata():
            mu = sum(pixel)/3
            SSE += sum((pixel[i] - mu - bias[i])*(pixel[i] - mu - bias[i]) for i in [0,1,2])
        MSE = float(SSE)/(thumb_size*thumb_size)
        if MSE < .01:
            sys.stdout.write('0');
        elif MSE <= MSE_cutoff:
            sys.stdout.write('1');
        else:
            sys.stdout.write('2');
    else:
        sys.stdout.write('3');

if __name__ == "__main__":
    detect_color_image(sys.argv[1])

