"""Cut the air traffic out of the two eight-direction vehicle sheets (reference/unsorted/image_3.png and
image_4.png: four craft per sheet, one row each, every craft in eight views) into the atlas the game
flies (gfx/skylineTraffic.js): public/sprites/traffic/traffic.png (and traffic_half.png, the same at
half size, box-filtered, for the far traffic) and traffic.json — per craft its class and, per view,
the sprite's rect and its rear point (where the engine glow sits).

The sheets' columns run round the craft: 0 nose to the camera (S), 1 nose down-left (SW), 2 side
facing left (W), 3 nose up-left (NW), 4 tail to the camera (N), 5 nose up-right (NE), 6 side facing
right (E), 7 nose down-right (SE). The game picks the view from the screen direction of travel.

Cleaned: the flat grey background and the soft ground shadow under each craft (dark, neutral, smooth
pixels reached from the outline) are cut away and the outline is matted against the grey (alpha from
the distance to it, the grey taken out of the colour). Then every sprite is scaled to game size by
SCALE (Lanczos, premultiplied) — once, here; the game draws the pixels as they are.
The sheet's own soft ground shadow under each view is kept too, as a translucent black sprite
(traffic_shadow.png; alpha from how much darker than the grey it is, the craft and anything coloured
left out, scaled the same, at SHADOW_ALPHA): the game lays it on the street under the overhead craft.
   python3 tools/sprites/traffic/extract.py [--contact out.png]
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

OUT = 'public/sprites/traffic'
SHEETS = ['reference/unsorted/image_3.png', 'reference/unsorted/image_4.png']
# (sheet, row) -> name, class; classes set the pace: swoop (racers) > cruiser > commuter > cargo
CRAFT = {
    (0, 0): ('roadsterRed', 'cruiser'),
    (0, 1): ('airTaxi', 'commuter'),
    (0, 2): ('cargoHauler', 'cargo'),
    (0, 3): ('racer07', 'swoop'),
    (1, 0): ('interceptorBlack', 'cruiser'),
    (1, 1): ('classicRed', 'cruiser'),
    (1, 2): ('crateFreighter', 'cargo'),
    (1, 3): ('racerBlue', 'swoop'),
}
VIEWS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']
SHADOW_ALPHA = 0.85  # the darkest of the sheet's shadow, as opacity
SCALE = 0.5  # sheet px -> game px: a craft ~70-80 px long on screen, as a 4 m speeder beside 55 px people


def components(fg):
    H, W = fg.shape
    lab = np.zeros((H, W), np.int32)
    out = []
    n = 0
    for y in range(H):
        row = fg[y]
        for x in np.nonzero(row & (lab[y] == 0))[0]:
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


def cut(rgb, m, bg):
    """The craft out of a piece: shadow peeled off the outline, the biggest part kept, the edge matted."""
    from numpy.lib.stride_tricks import sliding_window_view
    m = m.copy()
    mx, mn = rgb.max(2), rgb.min(2)
    lum = rgb.mean(2)
    std = sliding_window_view(np.pad(lum, 2, mode='edge'), (5, 5)).std(axis=(2, 3))
    shadowish = (lum > 120) & (lum < bg.mean() - 1) & ((mx - mn) < 12) & (std < 6)
    for _ in range(200):
        c = edge_of(m) & shadowish
        if not c.any():
            break
        m &= ~c
    # the halo: the sheet's soft edge, pixels still close to the grey, peeled off the outline (a few rings)
    dist = np.abs(rgb - bg).max(2)
    lightish = (dist < 34) | ((mx - mn < 14) & (lum > bg.mean() - 30) & (lum < bg.mean() + 30))
    for _ in range(4):
        c = edge_of(m) & lightish
        if not c.any():
            break
        m &= ~c
    sub, parts = components(m)
    m = sub == max(parts, key=lambda c: c[1])[0]
    # fill pinholes (enclosed background-coloured pixels inside the hull are hull)
    inv, holes = components(~m)
    for h in holes:
        n, area, x0, y0, x1, y1 = h[:6]
        if area < 60 and x0 > 0 and y0 > 0 and x1 < m.shape[1] and y1 < m.shape[0]:
            m |= inv == n
    alpha = m.astype(float)
    e = edge_of(m)
    alpha[e] = np.clip(dist[e] / 70.0, 0.4, 1.0)
    a3 = alpha[..., None]
    col = np.where(a3 > 0, (rgb - (1 - a3) * bg) / np.maximum(a3, 1e-3), 0)
    return np.dstack([np.clip(col, 0, 255), alpha * 255])


def shadow_of(rgb, bg, box, craft):
    """The sheet's ground shadow under a craft (box: its rect; craft: its mask over the whole sheet) as
    an alpha map: neutral, smooth pixels darker than the grey, below and round the craft."""
    from numpy.lib.stride_tricks import sliding_window_view
    x0, y0, x1, y1 = box
    H, W = rgb.shape[:2]
    wx0, wx1 = max(0, x0 - 20), min(W, x1 + 20)
    wy0, wy1 = max(0, y0 + (y1 - y0) // 3), min(H, int(y1 + (y1 - y0) * 0.7) + 10)
    win = rgb[wy0:wy1, wx0:wx1]
    lum = win.mean(2)
    chroma = win.max(2) - win.min(2)
    std = sliding_window_view(np.pad(lum, 2, mode='edge'), (5, 5)).std(axis=(2, 3))
    c = craft[wy0:wy1, wx0:wx1]
    p = np.pad(c, 3)
    near = np.zeros_like(c)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            near |= p[3 + dy:3 + dy + c.shape[0], 3 + dx:3 + dx + c.shape[1]]
    a = np.clip((bg.mean() - lum - 2) / 36.0, 0, 1)
    a[(chroma > 14) | (std > 8) | (lum < 90) | near] = 0
    # the shadow is one soft blob: keep the heaviest connected part
    lab, parts = components(a > 0.08)
    if not parts:
        return None
    best = max(parts, key=lambda q: a[lab == q[0]].sum())
    a = np.where(lab == best[0], a, 0)
    # the craft hid the top of it on the sheet (a notched edge): rebuild it as the soft ellipse the
    # visible part belongs to — its width, the depth of its lower half and its darkness
    ys, xs = np.nonzero(a > 0.12)
    if len(xs) < 20:
        return None
    w = a[ys, xs]
    cx = (xs * w).sum() / w.sum()
    cy = (ys * w).sum() / w.sum()
    rx = (np.percentile(xs, 97) - np.percentile(xs, 3)) / 2
    ry = max((np.percentile(ys, 97) - cy) * 1.15, rx * 0.22)
    peak = np.percentile(w, 90)
    hw, hh = int(rx * 1.15) + 2, int(ry * 1.15) + 2
    gy, gx = np.mgrid[-hh:hh + 1, -hw:hw + 1]
    r = np.sqrt((gx / rx) ** 2 + (gy / ry) ** 2)
    img = np.zeros(gx.shape + (4,))
    img[..., 3] = peak * np.clip((1.08 - r) / 0.55, 0, 1) ** 1.3 * 255
    return img


def resize(img, k):
    """Premultiplied Lanczos resize of a float RGBA array."""
    h, w = img.shape[:2]
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    a = img[..., 3:4] / 255
    pm = np.concatenate([img[..., :3] * a, img[..., 3:4]], 2)
    chans = [np.asarray(Image.fromarray(pm[..., i].astype(np.float32), 'F').resize((nw, nh), Image.LANCZOS)) for i in range(4)]
    q = np.dstack(chans)
    aa = np.clip(q[..., 3:4], 0, 255)
    rgb = np.where(aa > 1, q[..., :3] / np.maximum(aa / 255, 1e-3), 0)
    out = np.concatenate([rgb, aa], 2)
    out[aa[..., 0] < 8] = 0  # no faint haze round the outline
    return out.clip(0, 255).astype(np.uint8)


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


def groups(vals, n):
    """Split sorted centroids into n clusters at the n-1 widest gaps; returns the index per value."""
    order = np.argsort(vals)
    sv = np.asarray(vals)[order]
    gaps = np.argsort(np.diff(sv))[-(n - 1):]
    cuts = sorted(gaps)
    idx = np.zeros(len(vals), int)
    g = 0
    for k, o in enumerate(order):
        idx[o] = g
        if g < n - 1 and k == cuts[g]:
            g += 1
    return idx


def main():
    sprites = {}  # (name, view) -> rgba (game size)
    shadows = {}  # (name, view) -> rgba (game size): the sheet's ground shadow
    contact = []
    for si, path in enumerate(SHEETS):
        rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
        bg = np.median(np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3)]), 0)
        fg = np.abs(rgb - bg).max(2) > 6
        lab, comps = components(fg)
        big = [c for c in comps if c[1] > 1500]
        rows = groups([c[7] for c in big], 4)
        for r in range(4):
            inrow = [c for c, rr in zip(big, rows) if rr == r]
            cols = groups([c[6] for c in inrow], 8) if len(inrow) >= 8 else None
            # a craft and its separate shadow are two pieces in one column: the craft is the bigger one
            per = {}
            for c, cc in zip(inrow, cols):
                if cc not in per or c[1] > per[cc][1]:
                    per[cc] = c
            assert len(per) == 8, (path, r, len(per))
            name, cls = CRAFT[(si, r)]
            for v in range(8):
                n, area, x0, y0, x1, y1 = per[v][:6]
                piece = cut(rgb[y0:y1, x0:x1], lab[y0:y1, x0:x1] == n, bg)
                sprites[(name, v)] = resize(piece, SCALE)
                craft_mask = np.zeros(lab.shape, bool)
                craft_mask[y0:y1, x0:x1] = piece[..., 3] > 0
                sh = shadow_of(rgb, bg, (x0, y0, x1, y1), craft_mask)
                if sh is not None:
                    sh = resize(sh, SCALE).astype(float)
                    sh[..., :3] = 0
                    sh[..., 3] *= SHADOW_ALPHA
                    shadows[(name, v)] = sh.astype(np.uint8)
                contact.append(((name, v), piece))

    # shelf-pack, even coordinates (the half atlas maps exactly)
    W, x, y, rowh = 2048, 2, 2, 0
    place = {}
    for key, img in sprites.items():
        h, w = img.shape[:2]
        if x + w + 2 > W:
            x, y, rowh = 2, y + rowh + rowh % 2 + 4, 0
        place[key] = (x, y, w, h)
        x += w + w % 2 + 4
        rowh = max(rowh, h)
    Hh = y + rowh + rowh % 2 + 2
    atlas = np.zeros((Hh, W, 4), np.uint8)
    craft = {}
    for (name, v), img in sprites.items():
        px, py, w, h = place[(name, v)]
        atlas[py:py + h, px:px + w] = img
        a = img[..., 3] > 128
        ys, xs = np.nonzero(a)
        # the rear: the far end of the hull along the view's travel direction (screen vectors per view)
        dx, dy = {'S': (0, 1), 'SW': (-2, 1), 'W': (-1, 0), 'NW': (-2, -1), 'N': (0, -1), 'NE': (2, -1), 'E': (1, 0), 'SE': (2, 1)}[VIEWS[v]]
        k = xs * dx + ys * dy
        sel = k <= k.min() + 2
        rear = [int(np.median(xs[sel])), int(np.median(ys[sel]))]
        entry = craft.setdefault(name, {'cls': CRAFT[next(kk for kk, vv in CRAFT.items() if vv[0] == name)][1], 'views': {}})
        entry['views'][VIEWS[v]] = {'x': px, 'y': py, 'w': w, 'h': h, 'rear': rear}
    # the shadows: their own atlas, a rect per view
    x, y, rowh = 2, 2, 0
    splace = {}
    for key, img in shadows.items():
        h, w = img.shape[:2]
        if x + w + 2 > 1024:
            x, y, rowh = 2, y + rowh + 4, 0
        splace[key] = (x, y, w, h)
        x += w + 4
        rowh = max(rowh, h)
    satlas = np.zeros((y + rowh + 2, 1024, 4), np.uint8)
    for (name, v), img in shadows.items():
        px, py, w, h = splace[(name, v)]
        satlas[py:py + h, px:px + w] = img
        craft[name]['views'][VIEWS[v]]['shadow'] = {'x': px, 'y': py, 'w': w, 'h': h}
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(satlas).save(os.path.join(OUT, 'traffic_shadow.png'), optimize=True)
    Image.fromarray(atlas).save(os.path.join(OUT, 'traffic.png'), optimize=True)
    Image.fromarray(half(atlas)).save(os.path.join(OUT, 'traffic_half.png'), optimize=True)
    meta = {'_doc': 'Air traffic (tools/sprites/traffic/extract.py): per craft its class and 8 views (S SW W NW N NE E SE = nose direction on screen), rect and rear point in atlas px.', 'craft': craft}
    json.dump(meta, open(os.path.join(OUT, 'traffic.json'), 'w'), separators=(',', ':'))
    print('traffic atlas', W, 'x', Hh, len(craft), 'craft x 8 views;', len(shadows), 'shadows')

    if '--contact' in sys.argv:
        out = sys.argv[sys.argv.index('--contact') + 1]
        cw, ch = 180, 140
        S = Image.new('RGB', (8 * cw, len(craft) * ch), (40, 44, 52))
        d = ImageDraw.Draw(S)
        for (name, v), img in sprites.items():
            r = list(craft).index(name)
            im = Image.fromarray(img)
            S.paste(im, (v * cw + (cw - im.width) // 2, r * ch + 14 + (ch - 14 - im.height) // 2), im)
            rx, ry = craft[name]['views'][VIEWS[v]]['rear']
            d.ellipse([v * cw + (cw - im.width) // 2 + rx - 2, r * ch + 14 + (ch - 14 - im.height) // 2 + ry - 2,
                       v * cw + (cw - im.width) // 2 + rx + 2, r * ch + 14 + (ch - 14 - im.height) // 2 + ry + 2], outline=(255, 60, 60))
            d.text((v * cw + 3, r * ch + 2), f'{name} {VIEWS[v]}', fill=(255, 220, 0))
        S.save(out)


main()
