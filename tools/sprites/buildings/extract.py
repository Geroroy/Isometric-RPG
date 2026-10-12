"""Cut the 48 background buildings out of the three building sheets (assets/backgrounds/buildings/
sheet_city.png, sheet_industrial.png, sheet_landmark.png: 4 × 4 isometric buildings each on white)
into single sprites with the white, the grey ground shadow and the white halo taken away:

  assets/backgrounds/buildings/cut/<id>.png    the clean sprite (sheet resolution, trimmed)
  assets/backgrounds/buildings/cut/index.json  per building: sheet, cell, size, rect on the sheet,
                                               foot (bottom centre) and base (the footprint diamond's
                                               centre), footprint width, tags (kind, size, name)

Cleaning (as tools/sprites/traffic/extract.py): everything not white is a candidate; the soft ground
shadow — neutral, smooth, lighter than mid grey, reached from the outline — is peeled off ring by
ring, then the halo (pixels still close to white) a few rings more; the biggest part of a cell is kept
with the bits that belong to it (antenna tips); pinholes are filled; the edge is matted against the
white (alpha from the distance to it, the white taken out of the colour).

The angle check: on each building the lower-left and lower-right outline of the footprint is fitted
with a line (lowest pixel per column between the footprint's side corner and its front corner);
the game's tiles are 2:1 (26.57°).
   python3 tools/sprites/buildings/extract.py [--preview out.png]
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = 'assets/backgrounds/buildings'
OUT = 'assets/backgrounds/buildings/cut'
SHEETS = ['city', 'industrial', 'landmark']
KIND = {'city': 'city', 'industrial': 'industrial', 'landmark': 'landmark'}
# names by cell (row-major), and buildings whose look belongs to another kind than their sheet
NAMES = {
    'city': ['apartmentBlock', 'billboardTower', 'smokestackPlant', 'latticeMast', 'roundOffice', 'clusterFlats', 'domePlantSpire', 'archHangar',
             'taperedTower', 'silos', 'gardenHighrise', 'officePad', 'mall', 'twinHighrise', 'observatory', 'podTower'],
    'industrial': ['kiosk', 'pillarTower', 'refinery', 'landingRing', 'gantryGate', 'radarDome', 'tankTower', 'tubeHangar',
                   'gardenBlock', 'reactor', 'commSpire', 'turretBunker', 'tankFarm', 'garage', 'needleSpire', 'fanUnit'],
    'landmark': ['senateDome', 'cathedralSpires', 'ziggurat', 'bulletTower', 'twinSpires', 'rotunda', 'padTower', 'roundTower',
                 'archTowers', 'gardenSpire', 'domeComplex', 'needleTower', 'citadel', 'sailTower', 'triCylinders', 'spirePyramid'],
}
# size by the building's scale in the city (the sheets draw a kiosk as big as a tower): S small
# facilities, M mid-rise, L high-rise and landmarks
SIZES = {
    'city': 'MMMSMMMSLSLMMLML',
    'industrial': 'SMMSSMSSMMSSSSMS',
    'landmark': 'LLLLLLMLLLLMLLLL',
}
KIND_OVERRIDE = {('city', 2): 'industrial', ('city', 6): 'industrial', ('city', 7): 'industrial', ('city', 9): 'industrial', ('industrial', 8): 'city'}


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


def sheet_masks(rgb, bg):
    """The whole sheet's building mask: not white, shadow and halo peeled from every outline."""
    from numpy.lib.stride_tricks import sliding_window_view
    mx, mn = rgb.max(2), rgb.min(2)
    lum = rgb.mean(2)
    dist = np.abs(rgb - bg).max(2)
    m = dist > 10
    std = sliding_window_view(np.pad(lum, 2, mode='edge'), (5, 5)).std(axis=(2, 3))
    # the ground shadow: neutral, smooth, lighter than mid grey, darker than the white
    shadowish = (lum > 125) & (lum < bg.mean() - 2) & ((mx - mn) < 13) & (std < 5.5)
    for _ in range(400):
        c = edge_of(m) & shadowish
        if not c.any():
            break
        m &= ~c
    lightish = (dist < 40) | ((mx - mn < 12) & (lum > 215))
    for _ in range(3):
        c = edge_of(m) & lightish
        if not c.any():
            break
        m &= ~c
    # what is left of the white on the outline: very light, colourless edge pixels (two rings)
    pale = (lum > 226) & ((mx - mn) < 10)
    for _ in range(2):
        m &= ~(edge_of(m) & pale)
    return m, dist


def cut(rgb, m, dist, bg):
    alpha = m.astype(float)
    e = edge_of(m)
    alpha[e] = np.clip(dist[e] / 80.0, 0.35, 1.0)
    a3 = alpha[..., None]
    col = np.where(a3 > 0, (rgb - (1 - a3) * bg) / np.maximum(a3, 1e-3), 0)
    return np.dstack([np.clip(col, 0, 255), alpha * 255])


def fit_edges(m):
    """The footprint's two lower outline edges: slopes (dy/dx, both as positive numbers) fitted to the
    lowest mask pixel per column, left side corner → front corner → right side corner."""
    H, W = m.shape
    cols = np.nonzero(m.any(0))[0]
    low = np.array([np.nonzero(m[:, x])[0].max() for x in cols])
    front = cols[np.argmax(low)]
    res = []
    for side in (0, 1):
        sel = cols < front if side == 0 else cols > front
        xs, ys = cols[sel], low[sel]
        if len(xs) < 12:
            res.append(None)
            continue
        # the middle 60% of the run (corners have plinths, ramps and rounding)
        n = len(xs)
        k0, k1 = int(n * 0.2), int(n * 0.8)
        xs, ys = xs[k0:k1], ys[k0:k1]
        if len(xs) < 8:
            res.append(None)
            continue
        A = np.vstack([xs, np.ones_like(xs)]).T
        (a, b), resid, *_ = np.linalg.lstsq(A, ys, rcond=None)
        rms = float(np.sqrt(resid[0] / len(xs))) if len(resid) else 0.0
        res.append((abs(float(a)), rms))
    return res, int(front), int(low.max())


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    os.makedirs(OUT, exist_ok=True)
    index = {}
    slopes = []
    for sh in SHEETS:
        rgb = np.asarray(Image.open(f'{SRC}/sheet_{sh}.png').convert('RGB')).astype(float)
        bg = np.median(np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3)]), 0)
        m, dist = sheet_masks(rgb, bg)
        lab, parts = components(m)
        H, W = m.shape
        cw, ch = W / 4, H / 4
        cells = {}
        for p in parts:
            n, area, x0, y0, x1, y1, cx, cy = p
            if area < 12:
                continue
            cell = int(cy // ch) * 4 + int(cx // cw)
            cells.setdefault(cell, []).append(p)
        for cell in range(16):
            ps = sorted(cells.get(cell, []), key=lambda q: -q[1])
            main_p = ps[0]
            x0, y0, x1, y1 = main_p[2:6]
            keep = [main_p[0]]
            for q in ps[1:]:
                # bits that belong: inside the main part's box grown a little (antenna tips, lamps)
                if q[2] >= x0 - 14 and q[4] <= x1 + 14 and q[3] >= y0 - 40 and q[5] <= y1 + 14:
                    keep.append(q[0])
                    x0, y0, x1, y1 = min(x0, q[2]), min(y0, q[3]), max(x1, q[4]), max(y1, q[5])
            bm = np.isin(lab, keep)
            # fill pinholes
            sub = ~bm[y0:y1, x0:x1]
            inv, holes = components(sub)
            for h in holes:
                hn, area, hx0, hy0, hx1, hy1 = h[:6]
                if area < 80 and hx0 > 0 and hy0 > 0 and hx1 < sub.shape[1] and hy1 < sub.shape[0]:
                    bm[y0:y1, x0:x1] |= inv == hn
            crop_m = bm[y0:y1, x0:x1]
            img = cut(rgb[y0:y1, x0:x1], crop_m, dist[y0:y1, x0:x1], bg)
            img[~crop_m] = 0
            # trim (pad 1 px so the matte's edge is whole)
            ys, xs = np.nonzero(img[..., 3] > 0)
            ty0, ty1, tx0, tx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            img = img[ty0:ty1, tx0:tx1]
            mm = img[..., 3] > 127
            bid = f'{sh}_{cell:02d}'
            Image.fromarray(img.astype(np.uint8), 'RGBA').save(f'{OUT}/{bid}.png')
            (sl, front, bottom) = fit_edges(mm)
            for s in sl:
                if s:
                    slopes.append((bid, s[0], s[1]))
            h, w = img.shape[:2]
            # the footprint: its side corners are the widest points of the lowest part; the diamond's
            # centre sits half its 2:1 height above the front corner
            xs_low = np.nonzero(mm[int(h * 0.55):].any(0))[0]
            fx0, fx1 = int(xs_low.min()), int(xs_low.max()) + 1
            fw = fx1 - fx0
            base = [round((fx0 + fx1) / 2, 1), round(bottom - fw / 4, 1)]
            index[bid] = {
                'sheet': sh, 'cell': cell, 'name': NAMES[sh][cell],
                'kind': KIND_OVERRIDE.get((sh, cell), KIND[sh]),
                'rect': [int(x0 + tx0), int(y0 + ty0), w, h],
                'w': w, 'h': h, 'foot': [round((fx0 + fx1) / 2, 1), bottom], 'base': base, 'footW': fw,
                'area': int(mm.sum()),
            }
    for v in index.values():
        v['size'] = SIZES[v['sheet']][v['cell']]
    json.dump(index, open(f'{OUT}/index.json', 'w'), indent=1)
    s = np.array([q[1] for q in slopes])
    deg = np.degrees(np.arctan(s))
    from collections import Counter
    print(f'{len(index)} buildings; sizes', dict(Counter(v['size'] for v in index.values())), 'kinds', dict(Counter(v['kind'] for v in index.values())))
    print(f'footprint edge slope: median {np.median(s):.3f} (game 0.500), {np.median(deg):.1f}° (game 26.57°), '
          f'IQR {np.percentile(deg, 25):.1f}-{np.percentile(deg, 75):.1f}° over {len(s)} edges')
    straight = [q for q in slopes if q[2] < 1.5]
    if straight:
        sd = np.degrees(np.arctan(np.array([q[1] for q in straight])))
        print(f'  straight edges only (fit rms < 1.5 px, {len(straight)}): median {np.median(sd):.1f}°, IQR {np.percentile(sd, 25):.1f}-{np.percentile(sd, 75):.1f}°')
    json.dump({'slopes': slopes}, open(f'{OUT}/angles.json', 'w'))
    if preview:
        make_preview(index, preview)


def make_preview(index, path):
    ids = sorted(index, key=lambda k: (SHEETS.index(index[k]['sheet']), index[k]['cell']))
    cols, cw, chh = 8, 200, 236
    rows = (len(ids) + cols - 1) // cols
    P = Image.new('RGB', (cols * cw, rows * chh), (14, 16, 26))
    d = ImageDraw.Draw(P)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
    except OSError:
        font = None
    for i, bid in enumerate(ids):
        v = index[bid]
        im = Image.open(f'{OUT}/{bid}.png')
        k = min(1, (cw - 16) / im.width, (chh - 40) / im.height)
        im2 = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        gx, gy = (i % cols) * cw, (i // cols) * chh
        ox, oy = gx + (cw - im2.width) // 2, gy + chh - 26 - im2.height
        P.paste(im2, (ox, oy), im2)
        # the foot point
        fx, fy = ox + v['foot'][0] * k, oy + v['foot'][1] * k
        d.line([(fx - 4, fy), (fx + 4, fy)], fill=(255, 80, 80))
        bx, by = ox + v['base'][0] * k, oy + v['base'][1] * k
        d.ellipse([bx - 2, by - 2, bx + 2, by + 2], outline=(80, 220, 255))
        d.text((gx + 4, gy + chh - 22), f"{bid} {v['size']} {v['kind'][:4]}", fill=(200, 205, 220), font=font)
        d.text((gx + 4, gy + chh - 11), v['name'], fill=(140, 150, 170), font=font)
    P.save(path)


main()
