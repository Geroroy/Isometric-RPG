"""Mustafar rock: lava-veined landforms, crags, cliff walls and boulder piles from four sheets (reference/color_rots
image_24..27): big landforms (9), crags and slabs (8), boulder piles (6), cliff walls (6). Sheets 26 and 27 have
their checkerboard baked in: cut out first (the light, grey ground flood-filled from the borders).

    python3 tools/sprites/mustafar_rocks/bake.py -> public/sprites/mustafar/rocks.{webp,json}, rocks_neon.webp

- the pieces found as the sheet's separate blobs; each scaled evenly by its sheet's size class (ART_GUIDE.md: a
  landform spans 12-15 m, a cliff wall 7-9 m, a crag 3-5 m, a boulder pile 2-3 m across: (a + b) x 20 px), seen
  near the game's own angle
- the anchor on the ground under the middle: a quarter of the width above the lowest point (the 2:1 diamond)
- the glowing lava veins on a neon layer (same atlas layout), drawn after the light map so they glow in the dark
- names rk<sheet>_<n> with a class in the JSON (land / wall / crag / pile); worldgen.js picks by distance from the
  rock's edge (the big ones deep in the mountain, the piles at its rim)
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
REF = ROOT / 'reference/color_rots'
OUT = ROOT / 'public/sprites/mustafar'
OVER = 1.5
# sheet: (class, game px per source px, checker baked in)
SHEETS = {
    'image_24.png': ('land', 0.62, False),
    'image_25.png': ('crag', 0.30, False),
    'image_26.png': ('pile', 0.17, True),
    'image_27.png': ('wall', 0.40, True),
}


def cut_checker(rgb):
    mx, mn = rgb.max(2), rgb.min(2)
    like = Image.fromarray((((mn > 200) & ((mx - mn) < 18)) * 255).astype(np.uint8), 'L').copy()
    h, w = mn.shape
    for x in range(0, w, 5):
        for y in (0, h - 1):
            if like.getpixel((x, y)) == 255:
                ImageDraw.floodfill(like, (x, y), 128)
    for y in range(0, h, 5):
        for x in (0, w - 1):
            if like.getpixel((x, y)) == 255:
                ImageDraw.floodfill(like, (x, y), 128)
    fg = Image.fromarray(((np.array(like) != 128) * 255).astype(np.uint8), 'L')
    return np.asarray(fg.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7)))


def blobs(alpha, step=4, min_area=600):
    m = alpha[::step, ::step] > 60
    h, w = m.shape
    seen = np.zeros_like(m)
    out = []
    for y in range(h):
        for x in range(w):
            if not m[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            ys, xs = [], []
            while q:
                cy, cx = q.popleft()
                ys.append(cy)
                xs.append(cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(ys) * step * step >= min_area * 4:
                out.append((min(xs) * step, min(ys) * step, (max(xs) + 1) * step, (max(ys) + 1) * step))
    out.sort(key=lambda b: (round(b[1] / 200), b[0]))
    return out


def main():
    pieces = []
    for si, (f, (cls, scale, checker)) in enumerate(SHEETS.items()):
        im = Image.open(REF / f).convert('RGBA')
        a = np.asarray(im).copy()
        if checker:
            a[..., 3] = cut_checker(a[..., :3].astype(int))
        for n, (x0, y0, x1, y1) in enumerate(blobs(a[..., 3])):
            x0, y0 = max(0, x0 - 4), max(0, y0 - 4)
            x1, y1 = min(a.shape[1], x1 + 4), min(a.shape[0], y1 + 4)
            p = Image.fromarray(a[y0:y1, x0:x1], 'RGBA')
            p = p.crop(p.getbbox())
            w = round(p.width * scale * OVER)
            h = round(p.height * scale * OVER)
            p = p.resize((w, h), Image.LANCZOS)
            arr = np.asarray(p).astype(np.float32) / 255
            r, g = arr[..., 0], arr[..., 1]
            lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            hot = np.clip((r - 0.55) * 3, 0, 1) * np.clip((g - 0.18) * 4, 0, 1) * np.clip((lum - 0.3) * 4, 0, 1)
            neon = arr.copy()
            neon[..., 3] *= np.clip(hot * 1.2, 0, 1) * 0.8
            body = arr.copy()
            body[..., :3] *= (0.62 + 0.13 * hot)[..., None]  # (the rock dark, the veins carry the light)
            name = f'rk{si + 1}_{n}'
            fw = w / OVER / 20 / 2  # a = b: (a + b) x 20 px = the width
            pieces.append((name, cls, body, neon, w / 2, h - w / 4, fw))
    # shelf-pack both layers on the same layout
    W = 2048
    x = y = rowh = 0
    place = []
    for pc in pieces:
        bw, bh = pc[2].shape[1], pc[2].shape[0]
        if x + bw > W:
            x, y, rowh = 0, y + rowh + 2, 0
        place.append((pc, x, y))
        x += bw + 2
        rowh = max(rowh, bh)
    H = y + rowh
    atlas = Image.new('RGBA', (W, H))
    natlas = Image.new('RGBA', (W, H))
    meta = {}
    for (name, cls, body, neon, ax, ay, fw), px, py in place:
        atlas.paste(Image.fromarray((np.clip(body, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA'), (px, py))
        natlas.paste(Image.fromarray((np.clip(neon, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA'), (px, py))
        meta[name] = {
            'cls': cls,
            'rect': [px, py, body.shape[1], body.shape[0]],
            'anchor': [round(ax, 1), round(ay, 1)],
            'k': 1 / OVER,
            'footprint': [[-fw, -fw], [fw, -fw], [fw, fw], [-fw, fw]],
            'lights': [],
            'neon': {'base': 0.4, 'hum': 0.12, 'speed': 0.35, 'flicker': {'rate': 0, 'dur': [0.1, 0.2], 'level': 0.75}},
        }
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / 'rocks.webp', quality=88, method=6)
    natlas.save(OUT / 'rocks_neon.webp', quality=80, method=6)
    (OUT / 'rocks.json').write_text(json.dumps({'page': 'rocks.webp', 'neon': 'rocks_neon.webp', 'sprites': meta}))
    from collections import Counter

    print('rocks', atlas.size, len(meta), dict(Counter(m['cls'] for m in meta.values())))


if __name__ == '__main__':
    main()
