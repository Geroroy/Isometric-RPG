# The four lightsaber looks in a 2x2 grid (rows: trail style, columns: palette), the reference
# frames beside them: the trail references on the left of each row, the palette references
# (blade crops + the sampled colours) over each column.
#   python3 tools/qa/sabergrid.py <saberlab dir> <out.png> --tcw-trail a.png,b.png --movie-trail c.png,d.png
#                                 --tcw-blade e.png,f.png --rots-blade g.png
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

lab, out = sys.argv[1], sys.argv[2]
opt = {sys.argv[i][2:]: sys.argv[i + 1].split(',') for i in range(3, len(sys.argv) - 1, 2)}
FONT = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'galmuri', 'dist', 'Galmuri11.ttf')
f14 = ImageFont.truetype(FONT, 14)
f18 = ImageFont.truetype(FONT, 18)
BG = (18, 20, 26)
PAL = {
    'tcw': [('blue', ['#f8fafe', '#3475e1', '#0946bb', '#0c3295', '#09287c']), ('red', ['#fefbfa', '#d92c42', '#a40738', '#790e35', '#621234'])],
    'rots': [('blue', ['#fcfefe', '#a7bbf8', '#8294f4', '#5963dc', '#423ca6']), ('red', None)],
}


def bright_crop(path, h, pad=40):
    """The reference frame cut to its blade / trail (the bright, white-cored part), h px high."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im)
    m = a.min(axis=2) > 225
    m[int(a.shape[0] * 0.75):] = False  # (the city lights along the bottom of the Dyvinia clip)
    ys, xs = np.nonzero(m)
    if len(xs):
        x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
        y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad)
        im = im.crop((x0, y0, x1, y1))
    k = h / im.height
    return im.resize((max(1, round(im.width * k)), h), Image.LANCZOS)


def row_of(imgs, gap=6):
    W = sum(i.width for i in imgs) + gap * (len(imgs) - 1)
    H = max(i.height for i in imgs)
    o = Image.new('RGB', (W, H), BG)
    x = 0
    for i in imgs:
        o.paste(i, (x, 0))
        x += i.width + gap
    return o


def cell(name):
    shots = ['dark_1start', 'dark_2mid', 'dark_3end', 'bright_2mid', 'dark_clash']
    labels = ['시작', '중간', '끝', '밝은 바닥', '칼 부딪힘']
    ims = [Image.open(f'{lab}/{name}_{s}.png').convert('RGB') for s in shots]
    w, h = ims[0].size
    o = Image.new('RGB', (w * 3 + 12, (h + 22) * 2), BG)
    d = ImageDraw.Draw(o)
    for i, (im, lb) in enumerate(zip(ims, labels)):
        x, y = (i % 3) * (w + 6), (i // 3) * (h + 22)
        o.paste(im, (x, y + 20))
        d.text((x + 2, y + 2), lb, font=f14, fill=(220, 220, 220))
    t = json.load(open(f'{lab}/timing.json')).get(name)
    if t:
        x, y = 2 * (w + 6), h + 22
        d.text((x + 6, y + 30), f'프레임 {t["frameAvg"]} ms (p95 {t["frameP95"]})', font=f14, fill=(200, 210, 220))
        d.text((x + 6, y + 52), f'광선검 그리기 {t["saberPassMs"]} ms', font=f14, fill=(200, 210, 220))
        old = json.load(open(f'{lab}/timing.json')).get('old')
        if old:
            d.text((x + 6, y + 74), f'(지금 게임: {old["frameAvg"]} / {old["saberPassMs"]} ms)', font=f14, fill=(150, 160, 170))
        d.text((x + 6, y + 110), '소프트웨어 GPU 측정 —', font=f14, fill=(130, 140, 150))
        d.text((x + 6, y + 128), '실기기에선 훨씬 작음', font=f14, fill=(130, 140, 150))
    return o


def palette_head(key, blades):
    crops = row_of([bright_crop(p, 200, 30) for p in blades])
    if crops.width > 380:  # keep room for the colour list
        crops = crops.crop(((crops.width - 380) // 2, 0, (crops.width + 380) // 2, crops.height))
    o = Image.new('RGB', (max(crops.width, 560), 300), BG)
    d = ImageDraw.Draw(o)
    d.text((4, 2), '색상: ' + {'tcw': '클론워즈', 'rots': '시스의 복수'}[key], font=f18, fill=(240, 240, 240))
    o.paste(crops, (4, 28))
    x = crops.width + 16
    y = 30
    for hue, cols in PAL[key]:
        d.text((x, y), {'blue': '파랑', 'red': '빨강'}[hue], font=f14, fill=(220, 220, 220))
        if not cols:
            d.text((x, y + 20), '레퍼런스에 없음 →', font=f14, fill=(230, 160, 120))
            d.text((x, y + 38), '클론워즈 빨강 사용', font=f14, fill=(230, 160, 120))
            y += 70
            continue
        for i, (c, nm) in enumerate(zip(cols, ['코어', '테두리', '2-4px', '4-8px', '8-16px'])):
            d.rectangle((x, y + 20 + i * 18, x + 14, y + 34 + i * 18), fill=c)
            d.text((x + 20, y + 20 + i * 18), f'{nm} {c}', font=f14, fill=(220, 220, 220))
        y += 120
    return o


def trail_side(key, frames):
    crops = [bright_crop(p, 190, 50) for p in frames]
    W = max(c.width for c in crops) + 8
    o = Image.new('RGB', (W, 30 + sum(c.height + 8 for c in crops)), BG)
    d = ImageDraw.Draw(o)
    d.text((4, 4), '잔상: ' + {'tcw': '클론워즈', 'movie': '영화'}[key], font=f18, fill=(240, 240, 240))
    y = 30
    for c in crops:
        o.paste(c, (4, y))
        y += c.height + 8
    return o


cells = {n: cell(n) for n in ['tcw-tcw', 'tcw-rots', 'movie-tcw', 'movie-rots']}
heads = [palette_head('tcw', opt['tcw-blade']), palette_head('rots', opt['rots-blade'])]
sides = [trail_side('tcw', opt['tcw-trail']), trail_side('movie', opt['movie-trail'])]
cw = max(max(c.width for c in cells.values()), max(h.width for h in heads))
ch = max(max(c.height for c in cells.values()), max(s.height for s in sides))
sw = max(s.width for s in sides)
hh = max(h.height for h in heads)
grid = Image.new('RGB', (sw + 2 * (cw + 16) + 16, hh + 2 * (ch + 16) + 16), BG)
d = ImageDraw.Draw(grid)
d.text((8, 8), '레퍼런스: 위 = 색상, 왼쪽 = 잔상', font=f14, fill=(160, 170, 180))
for j, h in enumerate(heads):
    grid.paste(h, (sw + 16 + j * (cw + 16), 4))
for i, (row, s) in enumerate(zip([['tcw-tcw', 'tcw-rots'], ['movie-tcw', 'movie-rots']], sides)):
    y = hh + 12 + i * (ch + 16)
    grid.paste(s, (4, y))
    for j, n in enumerate(row):
        x = sw + 16 + j * (cw + 16)
        d.rectangle((x - 4, y - 4, x + cw + 4, y + ch + 4), outline=(70, 80, 95))
        grid.paste(cells[n], (x, y))
grid.save(out)
print(out, grid.size)
