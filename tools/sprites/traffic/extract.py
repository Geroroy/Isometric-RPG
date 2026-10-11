"""Cut the flying traffic out of the vehicle concept sheet (reference/unsorted/image_2.png,
'CATEGORY 4: VEHICLES & CRAFT') into one atlas for the skyline traffic (gfx/skylineTraffic.js):
public/sprites/traffic/traffic.png (and traffic_half.png, the same at half size, box-filtered, for the
far traffic) and traffic.json — every craft facing down-left (SW) as drawn on the sheet (the game
mirrors it for the down-right lanes), its class, and its rear and nose points (the engine wake starts
at the rear); plus the two engine-wake streaks (pink and blue).
Only hovering craft: the sheet's wheeled cars and trucks (most of it) would look wrong in the air,
and its wrecks, top-down, side-on and rear views and the one cart facing the other way are left out.
Cleaned for flight: the sheet's ground shadow (the dark, flat, neutral pixels reached from a sprite's
outline) is cut away, and the outline is matted against the sheet's grey (alpha from the distance to
it, the grey taken out of the colour) instead of a hard cut with a grey fringe.
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
    'swoop': [21, 41, 62, 49, 50, 63, 64],  # swoop bikes and racers
    'cruiser': [30, 32, 33, 42, 43, 65],  # air-taxi and luxury airspeeders
    'commuter': [31, 13, 34, 40],  # boxy air-cars and an open hover-boat
    'cargo': [47, 48, 74],  # gunship, enforcement craft, shuttle: heavy and slow
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


def clean(rgb, m):
    """Cut the ground shadow off a craft and matte its outline; returns (rgba, mask)."""
    from numpy.lib.stride_tricks import sliding_window_view
    m = m.copy()
    mx, mn = rgb.max(2), rgb.min(2)
    lum = rgb.mean(2)
    std = sliding_window_view(np.pad(lum, 1, mode='edge'), (3, 3)).std(axis=(2, 3))
    shadowish = (mx <= 86) & (mn >= 36) & ((mx - mn) < 14) & (std < 7)
    # peel: shadow-like pixels on the outline go, again and again (the shadow is reached from outside;
    # dark windows inside the hull are not)
    for _ in range(40):
        pad = np.pad(m, 1)
        edge = m & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        cut = edge & shadowish
        if not cut.any():
            break
        m &= ~cut
    _, parts = components(m)  # the hull: the biggest piece left
    sub, _ = components(m)
    m = sub == max(parts, key=lambda c: c[1])[0]
    # matte the outline: alpha from the distance to the sheet's grey, the grey taken out
    pad = np.pad(m, 1)
    edge = m & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    alpha = np.where(m, 1.0, 0.0)
    dist = np.abs(rgb - BG).max(2)
    alpha[edge] = np.clip(dist[edge] / 48.0, 0.35, 1.0)
    col = rgb.astype(float)
    a3 = alpha[..., None]
    col = np.where(a3 > 0, (col - (1 - a3) * BG) / np.maximum(a3, 1e-3), 0)
    out = np.dstack([np.clip(col, 0, 255), alpha * 255]).astype(np.uint8)
    return out, m


def half(img):
    """Half size, box-filtered with premultiplied alpha (the far traffic's sprites)."""
    h, w = img.shape[:2]
    img = img[: h - h % 2, : w - w % 2].astype(float)
    a = img[..., 3:4] / 255
    pm = np.concatenate([img[..., :3] * a, a], 2)
    q = (pm[0::2, 0::2] + pm[1::2, 0::2] + pm[0::2, 1::2] + pm[1::2, 1::2]) / 4
    aa = q[..., 3:4]
    rgb = np.where(aa > 0, q[..., :3] / np.maximum(aa, 1e-6), 0)
    return np.concatenate([rgb, aa * 255], 2).clip(0, 255).astype(np.uint8)


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
        img, m = clean(a[y0:y1, x0:x1], m) if i not in TRAILS.values() else (np.dstack([rgba[y0:y1, x0:x1, :3], np.where(m, 255, 0)]).astype(np.uint8), m)
        pieces[i] = (img, m)

    # shelf-pack into one atlas
    order = [(cls, i) for cls, ids in CLASS.items() for i in ids] + [('trail', i) for i in TRAILS.values()]
    # every sprite at even coordinates with even gaps, so the half-size atlas maps exactly (x / 2)
    W, x, y, rowh = 1024, 2, 2, 0
    place = {}
    for cls, i in order:
        img, _ = pieces[i]
        h, w = img.shape[:2]
        if x + w + 2 > W:
            x, y, rowh = 2, y + rowh + rowh % 2 + 4, 0
        place[i] = (x, y, w, h)
        x += w + w % 2 + 4
        rowh = max(rowh, h)
    Hh = y + rowh + rowh % 2 + 2
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
    Image.fromarray(half(atlas)).save(os.path.join(OUT, 'traffic_half.png'), optimize=True)
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
