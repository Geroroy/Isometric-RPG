"""Bake the cut undercity buildings (assets/city/buildings/cut/, extract.py) into city sprites at the
game's own scale — 1 m = 24.5 px up, a tile (1 m) 40 × 20 px, a person 1.85 m ≈ 52 px — in the
format the game loads (gfx/citySprites.js): public/sprites/undercity/<id>.json + _body.webp +
_neon.webp, listed by index.json.

Scale (measured on the sheets against that metre): the shops are drawn at about the game's own
metre already (a bar stool ~18 px = 0.75 m, a storey 70-90 px), the tenement towers at ~13 px a
metre (a balcony floor ~40 px = 3 m) and the plants at ~12.5 px (a roller door ~45 px = 3.5 m):
SCALE per sheet. Enlarged sprites are resampled once here (premultiplied Lanczos, a light unsharp
mask), never at run time.

Per building, from its outline at game scale:
  footprint — the base's left, front and right corners give its sides a × b in tiles; the collision
              outline is that rectangle less MARGIN on each side (one can walk up to the walls)
  anchor    — the footprint's centre on the sprite (the prop's world point)
  neon      — the lit parts (signs, lamps, windows: bright, or bright and saturated) as their own
              layer, drawn again after the lighting pass so the night does not dim them
  lights    — up to three street lights in the colours of its biggest lit parts, at their height
   python3 tools/sprites/undercity_buildings/bake.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

SRC = 'assets/city/buildings/cut'
OUT = 'public/sprites/undercity'
SCALE = {'shops': 1.0, 'towers': 1.85, 'plants': 1.9}
MARGIN = 0.4
PX_UNIT = 24.49  # px a metre, upward (core/iso.js Z_PX)


def resize(img, w, h):
    a = img[..., 3:4] / 255
    pm = np.concatenate([img[..., :3] * a, img[..., 3:4]], 2)
    q = np.dstack([np.asarray(Image.fromarray(pm[..., i].astype(np.float32), 'F').resize((w, h), Image.LANCZOS)) for i in range(4)])
    aa = np.clip(q[..., 3:4], 0, 255)
    rgb = np.where(aa > 1, q[..., :3] / np.maximum(aa / 255, 1e-3), 0)
    out = np.concatenate([rgb, aa], 2)
    out[aa[..., 0] < 12] = 0
    return out.clip(0, 255)


def sharpen(img):
    rgb = Image.fromarray(img[..., :3].astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=2))
    return np.dstack([np.asarray(rgb).astype(float), img[..., 3]])


def corners(mm):
    """The base's left, front and right corners (x, y) from the outline's lowest pixel per column."""
    h, w = mm.shape
    cols = np.nonzero(mm.any(0))[0]
    low = np.full(w, -1)
    for x in cols:
        low[x] = np.nonzero(mm[:, x])[0].max()
    fx = int(cols[np.argmax(low[cols])])
    fy = int(low[fx])
    lowpart = np.nonzero(mm[int(h * 0.5):].any(0))[0]
    lx, rx = int(lowpart.min()), int(lowpart.max())
    return (lx, int(low[lx])), (fx, fy), (rx, int(low[rx]))


def emissive(rgb, a):
    mx = rgb.max(2) / 255
    mn = rgb.min(2) / 255
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-3), 0)
    lit = np.clip((mx - 0.62) / 0.25, 0, 1) * np.clip((sat - 0.25) / 0.3, 0, 1)  # neon, lamps, warm windows
    lit = np.maximum(lit, np.clip((mx - 0.86) / 0.1, 0, 1))  # anything near white-hot
    return lit * (a > 200)


def lights_of(rgb, lit, anchor, a_t, b_t):
    """Up to three lights: the biggest lit parts, placed on the front of the footprint at their height."""
    from collections import deque
    m = lit > 0.5
    small = m[::4, ::4]
    H, W = small.shape
    seen = np.zeros_like(small)
    parts = []
    for y in range(H):
        for x in range(W):
            if small[y, x] and not seen[y, x]:
                q = deque([(y, x)])
                seen[y, x] = True
                pts = []
                while q:
                    cy, cx = q.popleft()
                    pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < H and 0 <= nx < W and small[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                q.append((ny, nx))
                parts.append(pts)
    parts.sort(key=len, reverse=True)
    out = []
    for pts in parts[:3]:
        if len(pts) < 6:
            break
        ys = np.array([p[0] for p in pts]) * 4
        xs = np.array([p[1] for p in pts]) * 4
        col = rgb[ys, xs].mean(0)
        col = col / max(col.max(), 1) * 255
        sx, sy = xs.mean() - anchor[0], ys.mean() - anchor[1]
        # on the footprint's front faces: u + v = (a + b) / 2 (the front corner's depth), u − v from x
        s = (a_t + b_t) / 2
        d = sx / 20
        u = np.clip((s + d) / 2, -a_t / 2, a_t / 2)
        v = np.clip((s - d) / 2, -b_t / 2, b_t / 2)
        z = max(0.6, ((u + v) * 10 - sy) / PX_UNIT)
        out.append([round(float(u), 2), round(float(v), 2), round(float(min(z, 8)), 2), int(col[0]), int(col[1]), int(col[2]), int(min(140, 50 + len(pts) * 1.2)), 0.06])
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(f'{OUT}/{f}')
    index = json.load(open(f'{SRC}/index.json'))
    blank = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    blank.save(f'{OUT}/_blank.png')
    listing = {}
    rows = []
    for bid, v in sorted(index.items()):
        k = SCALE[v['sheet']]
        img = np.asarray(Image.open(f'{SRC}/{bid}.png').convert('RGBA')).astype(float)
        h0, w0 = img.shape[:2]
        w, h = round(w0 * k), round(h0 * k)
        g = resize(img, w, h) if k != 1 else img
        if k > 1.3:
            g = sharpen(g)
        a = g[..., 3]
        mm = a > 127
        (lx, ly), (fx, fy), (rx, ry) = corners(mm)
        a_t = max(1.0, (fx - lx) / 20)
        b_t = max(1.0, (rx - fx) / 20)
        anchor = [round(fx + (b_t - a_t) * 10, 1), round(fy - (a_t + b_t) * 5, 1)]
        ha, hb = a_t / 2 - MARGIN, b_t / 2 - MARGIN
        foot = [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]]
        lit = emissive(g[..., :3], a)
        neon = np.dstack([g[..., :3], a * lit]).clip(0, 255).astype(np.uint8)
        body = g.clip(0, 255).astype(np.uint8)
        # WebP (lossy colour, exact alpha): a fifth of the PNGs' size for these painted sheets
        Image.fromarray(body, 'RGBA').save(f'{OUT}/{bid}_body.webp', quality=90, alpha_quality=100, method=6)
        Image.fromarray(neon, 'RGBA').save(f'{OUT}/{bid}_neon.webp', quality=90, alpha_quality=100, method=6)
        meta = {
            'name': bid, 'label': v['name'], 'kind': v['kind'], 'k': 1.0, 'anchor': anchor,
            'tiles': [round(a_t, 2), round(b_t, 2)],
            'footprint': [[round(p[0], 2), round(p[1], 2)] for p in foot], 'flat': False,
            'heightM': round((fy - 0) / PX_UNIT, 1),
            'layers': {'body': f'{bid}_body.webp', 'neon': f'{bid}_neon.webp', 'reflect': '_blank.png'},
            'neon': {'base': 1.0, 'hum': 0.04, 'speed': 6, 'flicker': {'rate': 0.06, 'dur': [0.04, 0.16], 'level': 0.35}},
            'lights': lights_of(g[..., :3], lit, anchor, a_t, b_t),
            'scale': k, 'source': f"assets/city/buildings/undercity_{v['sheet']}_sheet.png cell {v['cell']}",
        }
        json.dump(meta, open(f'{OUT}/{bid}.json', 'w'))
        listing[bid] = f'{bid}.json'
        rows.append((bid, w, h, a_t, b_t, meta['heightM']))
    json.dump(listing, open(f'{OUT}/index.json', 'w'), indent=1)
    tot = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
    print(f'{len(rows)} sprites, {tot / 1e6:.1f} MB')
    for r in rows:
        print(f'  {r[0]:12s} {r[1]:4d}x{r[2]:<4d} footprint {r[3]:5.1f} x {r[4]:5.1f} tiles, sprite height {r[5]:5.1f} m')


main()
