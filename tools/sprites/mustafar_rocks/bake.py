"""Mustafar rock: lava-veined landforms, crags, cliff walls and boulder piles from four sheets (reference/color_rots
image_24..27): big landforms (9), crags and slabs (8), boulder piles (6), cliff walls (6). Sheets 26 and 27 have
their checkerboard baked in: cut out first (the light, grey ground flood-filled from the borders).

    python3 tools/sprites/mustafar_rocks/bake.py -> public/sprites/mustafar/rocks.{webp,json}

- the pieces found as the sheet's separate blobs; each scaled evenly by its sheet's size class (ART_GUIDE.md: a
  landform spans 12-15 m, a cliff wall 7-9 m, a crag 3-5 m, a boulder pile 2-3 m across: (a + b) x 20 px), seen
  near the game's own angle
- the anchor on the ground under the middle: a quarter of the width above the lowest point (the 2:1 diamond)
- no lava in the rock (the falls carry it): the sheets' glowing veins filled with the colour of the rock round them,
  the rock an ash grey with a trace of warmth
- names rk<sheet>_<n> with a class in the JSON (land / wall / crag / pile); the map (public/maps/mustafar.json) has
  them by distance from the rock's edge (the big ones deep in the mountain, the piles at its rim)
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
            # no lava in the rock (only the falls carry it): the veins and their glow filled with the rock round them
            # (normalised convolution: the blurred colour of the cool pixels), then the whole rock a dark ash grey
            r, g, bch = arr[..., 0], arr[..., 1], arr[..., 2]
            mx = arr[..., :3].max(2)
            sat = (mx - arr[..., :3].min(2)) / np.maximum(mx, 1e-3)
            lum0 = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            hot = np.maximum(np.clip((r - 0.28) * 4, 0, 1) * np.clip((sat - 0.45) * 4, 0, 1) * (r > g * 1.25), np.clip((lum0 - 0.5) * 5, 0, 1))
            hot = np.asarray(Image.fromarray((hot * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))) / 255.0
            cool = (1 - hot) * (arr[..., 3] > 0.3)
            fill = np.zeros_like(arr[..., :3])
            wsum = np.zeros(arr.shape[:2], np.float32)
            for rad in (6, 24, 60):  # near first; wide pools (a crater's) from further off
                den = np.asarray(Image.fromarray((cool * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32)
                take = np.clip(den / 40, 0, 1) * (1 - wsum)
                for c in range(3):
                    num = np.asarray(Image.fromarray((arr[..., c] * cool * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32)
                    fill[..., c] += num / np.maximum(den, 1) * take
                wsum += take
            lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            fill *= (0.7 + 0.6 * np.clip(lum / max(lum.mean(), 1e-3), 0, 1.5) * 0.5)[..., None]  # keep some of the facets
            rgb = arr[..., :3] * (1 - hot[..., None]) + fill * hot[..., None]
            grey = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
            rgb = grey[..., None] + (rgb - grey[..., None]) * 0.25  # ash grey, a trace of warmth
            body = arr.copy()
            body[..., :3] = rgb * 0.8
            neon = None
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
    meta = {}
    for (name, cls, body, neon, ax, ay, fw), px, py in place:
        atlas.paste(Image.fromarray((np.clip(body, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA'), (px, py))
        meta[name] = {
            'cls': cls,
            'rect': [px, py, body.shape[1], body.shape[0]],
            'anchor': [round(ax, 1), round(ay, 1)],
            'k': 1 / OVER,
            'footprint': [[-fw, -fw], [fw, -fw], [fw, fw], [-fw, fw]],
            'lights': [],
        }
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / 'rocks.webp', quality=88, method=6)
    (OUT / 'rocks.json').write_text(json.dumps({'page': 'rocks.webp', 'sprites': meta}))
    from collections import Counter

    print('rocks', atlas.size, len(meta), dict(Counter(m['cls'] for m in meta.values())))


if __name__ == '__main__':
    main()
