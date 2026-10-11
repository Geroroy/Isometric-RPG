"""Cut the flying traffic out of the vehicle concept sheet (reference/unsorted/image_2.png,
'CATEGORY 4: VEHICLES & CRAFT') into one atlas for the skyline traffic (gfx/skylineTraffic.js):
public/sprites/traffic/traffic.png and traffic.json — every vehicle facing down-left (SW) as drawn
on the sheet (the game mirrors it for the down-right lanes), its class (speed and size), and its
rear and nose points (the engine wake starts at the rear); plus the two engine-wake streaks (pink
and blue). Wrecks, the top-down, rear and side views are left out.
   python3 tools/sprites/traffic/extract.py [--contact out.png]
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

SRC = 'reference/unsorted/image_2.png'
OUT = 'public/sprites/traffic'
BG = np.array([92, 92, 92])

# the sheet's pieces (in reading order of their connected components, see --contact) by class:
#   swoop  — speeder bikes and racers: small and fast
#   cruiser — luxury sedans and sport craft: fast
#   commuter — air-cars and taxis: medium
#   cargo  — trucks and freighters: big and slow
CLASS = {
    'swoop': [6, 21, 25, 41, 46, 62, 49, 50, 63, 64],
    'cruiser': [30, 31, 32, 33, 34, 40, 42, 43, 47, 48, 65, 13],
    'commuter': [4, 5, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 23, 24, 27, 28, 29, 44, 45, 52, 53, 54, 55, 57, 59, 68, 69, 72, 74, 78, 79],
    'cargo': [15, 26, 36, 37, 38, 51, 58, 73, 84, 85, 83],
}
TRAILS = {'pink': 87, 'blue': 89}
LABELLED = {25, 46, 47}  # a label strip fused to the top of the piece


def components(fg):
    H, W = fg.shape
    lab = np.zeros((H, W), np.int32)
    out = []
    n = 0
    for y in range(H):
        for x in range(W):
            if fg[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)])
                lab[y, x] = n
                ys, xs = [], []
                while q:
                    cy, cx = q.popleft()
                    ys.append(cy)
                    xs.append(cx)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and fg[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
                out.append((n, len(ys), min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    return lab, out


def main():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
    rgba = np.asarray(Image.open(SRC).convert('RGBA')).copy()
    fg = np.abs(a - BG).max(2) > 16
    lab, comps = components(fg)
    big = [c for c in comps if c[1] > 250]  # [0] is the panel frame
    pieces = {}
    for i, (n, area, x0, y0, x1, y1) in enumerate(big):
        m = lab[y0:y1, x0:x1] == n
        if i in LABELLED:  # drop the rows of near-white label text and everything above them
            white = (a[y0:y1, x0:x1].min(2) > 170) & m
            rows = np.nonzero(white.sum(1) > 2)[0]
            if len(rows):
                m[: rows.max() + 3] = False
            sub, parts = components(m)  # and keep the vehicle: the biggest piece left
            m = sub == max(parts, key=lambda c: c[1])[0]
            ys, xs = np.nonzero(m)
            x0, y0, x1, y1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
            m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        img = rgba[y0:y1, x0:x1].copy()
        img[..., 3] = np.where(m, 255, 0)
        pieces[i] = (img, m)

    # shelf-pack into one atlas
    order = [(cls, i) for cls, ids in CLASS.items() for i in ids] + [('trail', i) for i in TRAILS.values()]
    W, x, y, rowh = 1024, 1, 1, 0
    place = {}
    for cls, i in order:
        img, _ = pieces[i]
        h, w = img.shape[:2]
        if x + w + 1 > W:
            x, y, rowh = 1, y + rowh + 2, 0
        place[i] = (x, y, w, h)
        x += w + 2
        rowh = max(rowh, h)
    Hh = y + rowh + 1
    atlas = np.zeros((Hh, W, 4), np.uint8)
    meta = {'_doc': 'Skyline traffic (tools/sprites/traffic/extract.py): vehicles face down-left (SW); rear/nose in sprite pixels.', 'vehicles': [], 'trails': {}}
    for cls, i in order:
        img, m = pieces[i]
        px, py, w, h = place[i]
        atlas[py:py + h, px:px + w] = img
        ys, xs = np.nonzero(m)
        k = 2 * xs - ys  # along the screen's down-left / up-right axis
        rear = (int(xs[k.argmax()]), int(ys[k.argmax()]))
        nose = (int(xs[k.argmin()]), int(ys[k.argmin()]))
        if cls == 'trail':
            name = next(t for t, j in TRAILS.items() if j == i)
            # the streak's down-left end goes on the vehicle's rear
            meta['trails'][name] = {'x': px, 'y': py, 'w': w, 'h': h, 'head': list(nose)}
        else:
            meta['vehicles'].append({'x': px, 'y': py, 'w': w, 'h': h, 'cls': cls, 'rear': list(rear), 'nose': list(nose), 'src': i})
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(atlas).save(os.path.join(OUT, 'traffic.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, 'traffic.json'), 'w'), separators=(',', ':'))
    print('traffic atlas', W, 'x', Hh, len(meta['vehicles']), 'vehicles', {c: len(v) for c, v in CLASS.items()})

    if '--contact' in sys.argv:  # every piece with its number, for picking
        out = sys.argv[sys.argv.index('--contact') + 1]
        cols, cw, ch = 12, 120, 90
        S = Image.new('RGB', (cols * cw, ((len(big) + cols - 1) // cols) * ch), (30, 30, 36))
        d = ImageDraw.Draw(S)
        for k, i in enumerate(sorted(pieces)):
            if i == 0:
                continue
            c = Image.fromarray(pieces[i][0])
            px, py = (k % cols) * cw, (k // cols) * ch
            S.paste(c, (px + (cw - c.width) // 2, py + 12 + (ch - 12 - c.height) // 2), c)
            d.text((px + 3, py + 1), str(i), fill=(255, 220, 0))
        S.save(out)


main()
