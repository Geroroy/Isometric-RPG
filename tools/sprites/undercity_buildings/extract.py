"""Cut the undercity buildings out of the three sheets (assets/city/buildings/undercity_{shops,towers,
plants}_sheet.png: 4 × 4 isometric buildings each, on a *painted* transparency checkerboard — the
PNGs are RGB, the light/grey squares are pixels) into single clean sprites at sheet resolution:

  assets/city/buildings/cut/<id>.png    the building, background, fringe and loose smoke removed
  assets/city/buildings/cut/index.json  per building: sheet, cell, rect on the sheet, size, foot
                                        (the footprint's front corner), base (the footprint diamond's
                                        centre), the footprint's width, kind and a name

Cleaning: the checkerboard is light and colourless (two greys, ~230 and ~254), the buildings are dark
and coloured. Background is grown from the sheet's border through light, colourless pixels; then the
light colourless fringe left on every outline is peeled (a few rings), each grid cell keeps its biggest
part with the bits belonging to it (antennas, lamps, hanging signs), pinholes are filled, and the edge
is matted against the checker's mean grey (alpha from how much darker than the grey it is, the grey
taken out of the colour).
   python3 tools/sprites/undercity_buildings/extract.py [--preview out.png]
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = 'assets/city/buildings'
OUT = 'assets/city/buildings/cut'
SHEETS = ['shops', 'towers', 'plants']
KIND = {'shops': 'shop', 'towers': 'tower', 'plants': 'plant'}
NAMES = {
    'shops': ['cantinaRound', 'balconyDiner', 'garageWrench', 'cocktailBar', 'noodleCounter', 'marketTent', 'tallDiner', 'cocktailTerrace',
              'mechanicHall', 'stripedDiner', 'soupKitchen', 'domeShop', 'tarpMarket', 'redSignHouse', 'neonClub', 'wrenchGarage'],
    'towers': [f'tower{i:02d}' for i in range(16)],
    'plants': ['generatorHall', 'coolingTowers', 'boilerHouse', 'tankTower', 'pipeRack', 'stackPlant', 'substation', 'turbineHall',
               'fanHall', 'silos', 'processWorks', 'pipeHall', 'neonReactor', 'compressorWorks', 'coldWorks', 'stackBlock'],
}
BG = 242.0  # the checkerboard's mean grey


def components(fg):
    H, W = fg.shape
    lab = np.zeros((H, W), np.int32)
    out = []
    n = 0
    for y in range(H):
        for x in np.nonzero(fg[y] & (lab[y] == 0))[0]:
            if lab[y, x]:
                continue
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
            out.append((n, len(ys), min(xs), min(ys), max(xs) + 1, max(ys) + 1, sum(xs) / len(xs), sum(ys) / len(ys)))
    return lab, out


def edge_of(m):
    p = np.pad(m, 1)
    return m & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])


def background(rgb, flat_white_is_bg=False):
    """The checkerboard, grown from the border through light colourless pixels."""
    mx, mn = rgb.max(2), rgb.min(2)
    lum = rgb.mean(2)
    bgish = (lum > 196) & ((mx - mn) < 14)
    H, W = bgish.shape
    seen = np.zeros_like(bgish)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and bgish[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    # checker shut in by a building (between cables, a walkway and a wall): a light colourless patch
    # with both of the checker's greys in it — or a small one nearly white. A white awning stripe is
    # one flat grey, so it stays. (On the towers' and plants' sheets nothing is painted white —
    # their white pockets between cables, pipes and walkways are all checker or steam: any goes.)
    lab, parts = components((lum > 196) & ((mx - mn) < 28) & ~seen)  # (a little tint allowed: the sheets are compressed)
    for p in parts:
        n, area, x0, y0, x1, y1 = p[:6]
        if area < (4 if flat_white_is_bg else 20):
            continue
        sel = lab[y0:y1, x0:x1] == n
        L = lum[y0:y1, x0:x1][sel]
        hi = (L > 246).mean()
        mid = ((L > 220) & (L < 238)).mean()
        if (hi > 0.15 and mid > 0.15) or (area < 240 and L.mean() > 230) or (flat_white_is_bg and L.mean() > 205):
            seen[y0:y1, x0:x1] |= sel
    return seen


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    os.makedirs(OUT, exist_ok=True)
    index = {}
    for sh in SHEETS:
        rgb = np.asarray(Image.open(f'{SRC}/undercity_{sh}_sheet.png').convert('RGB')).astype(float)
        mx, mn = rgb.max(2), rgb.min(2)
        lum = rgb.mean(2)
        m = ~background(rgb, flat_white_is_bg=sh != 'shops')
        # the fringe: light, nearly colourless pixels on the outline (checker blended into the edge;
        # the brightest a little tinted by the compression)
        fringe = ((lum > 150) & ((mx - mn) < 22)) | ((lum > 205) & ((mx - mn) < 32))
        for _ in range(3):
            c = edge_of(m) & fringe
            if not c.any():
                break
            m &= ~c
        lab, parts = components(m)
        # two buildings touching across rows (a lamp on one reaching the cables of the one below): a
        # part taller than a row and a half is cut at its thinnest row in the middle
        rowh = m.shape[0] / 4
        for q in parts:
            n, area, qx0, qy0, qx1, qy1 = q[:6]
            if qy1 - qy0 > rowh * 1.5:
                mine = lab[qy0:qy1, qx0:qx1] == n
                rows = mine.sum(1)
                lo, hi = int(len(rows) * 0.3), int(len(rows) * 0.7)
                cut = lo + int(np.argmin(rows[lo:hi]))
                m[qy0 + cut - 1:qy0 + cut + 2, qx0:qx1] &= ~mine[cut - 1:cut + 2]
        lab, parts = components(m)
        # the 16 buildings: the 16 biggest parts, in reading order (rows by their centres' widest
        # gaps, then left to right); every smaller part joins the building whose box it sits in
        parts = [q for q in parts if q[1] >= 6]
        big = sorted(parts, key=lambda q: -q[1])[:16]
        ys_c = sorted(q[7] for q in big)
        cuts = sorted(np.argsort(np.diff(ys_c))[-3:])
        bounds = [ys_c[c] + (ys_c[c + 1] - ys_c[c]) / 2 for c in cuts]
        row_of = lambda q: sum(q[7] > b for b in bounds)
        big.sort(key=lambda q: (row_of(q), q[6]))
        bigset = {q[0] for q in big}
        for cell, mp in enumerate(big):
            x0, y0, x1, y1 = mp[2:6]
            keep = [mp[0]]
            for q in parts:
                if q[0] in bigset:
                    continue
                if q[2] >= x0 - 16 and q[4] <= x1 + 16 and q[3] >= y0 - 48 and q[5] <= y1 + 16:
                    keep.append(q[0])
                    x0, y0, x1, y1 = min(x0, q[2]), min(y0, q[3]), max(x1, q[4]), max(y1, q[5])
            bm = np.isin(lab, keep)
            sub = ~bm[y0:y1, x0:x1]
            inv, holes = components(sub)
            for hh in holes:
                hn, area, hx0, hy0, hx1, hy1 = hh[:6]
                if area < 120 and hx0 > 0 and hy0 > 0 and hx1 < sub.shape[1] and hy1 < sub.shape[0]:
                    bm[y0:y1, x0:x1] |= inv == hn
            cm = bm[y0:y1, x0:x1]
            crgb = rgb[y0:y1, x0:x1]
            clum = crgb.mean(2)
            alpha = cm.astype(float)
            e = edge_of(cm)
            # the edge: as dark against the grey as it is opaque
            alpha[e] = np.clip((BG - clum[e]) / (BG - 70), 0.35, 1.0)
            a3 = alpha[..., None]
            col = np.where(a3 > 0, (crgb - (1 - a3) * BG) / np.maximum(a3, 1e-3), 0)
            img = np.dstack([np.clip(col, 0, 255), alpha * 255])
            img[~cm] = 0
            ys, xs = np.nonzero(img[..., 3] > 0)
            img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            bid = f'{sh}_{cell:02d}'
            Image.fromarray(img.astype(np.uint8), 'RGBA').save(f'{OUT}/{bid}.png')
            mm = img[..., 3] > 127
            h, w = mm.shape
            cols = np.nonzero(mm.any(0))[0]
            low = np.array([np.nonzero(mm[:, x])[0].max() for x in cols])
            front = int(cols[np.argmax(low)])
            bottom = int(low.max())
            xs_low = np.nonzero(mm[int(h * 0.55):].any(0))[0]
            fx0, fx1 = int(xs_low.min()), int(xs_low.max()) + 1
            fw = fx1 - fx0
            index[bid] = {'sheet': sh, 'cell': cell, 'name': NAMES[sh][cell], 'kind': KIND[sh],
                          'rect': [int(x0 + xs.min()), int(y0 + ys.min()), w, h], 'w': w, 'h': h,
                          'foot': [front, bottom], 'base': [round((fx0 + fx1) / 2, 1), round(bottom - fw / 4, 1)], 'footW': fw}
    json.dump(index, open(f'{OUT}/index.json', 'w'), indent=1)
    print(f'{len(index)} buildings -> {OUT}')
    if preview:
        ids = sorted(index, key=lambda k: (SHEETS.index(index[k]['sheet']), index[k]['cell']))
        cols, cw, chh = 8, 200, 220
        P = Image.new('RGB', (cols * cw, ((len(ids) + cols - 1) // cols) * chh), (14, 16, 24))
        d = ImageDraw.Draw(P)
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
        except OSError:
            font = None
        for i, bid in enumerate(ids):
            v = index[bid]
            im = Image.open(f'{OUT}/{bid}.png')
            k = min(1, (cw - 12) / im.width, (chh - 30) / im.height)
            im2 = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            gx, gy = (i % cols) * cw, (i // cols) * chh
            P.paste(im2, (gx + (cw - im2.width) // 2, gy + chh - 18 - im2.height), im2)
            d.text((gx + 4, gy + chh - 14), f"{bid} {v['w']}x{v['h']}", fill=(200, 205, 220), font=font)
        P.save(preview)


main()
