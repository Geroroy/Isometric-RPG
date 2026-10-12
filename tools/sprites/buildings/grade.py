"""Night-grade the cut background buildings (assets/backgrounds/buildings/cut/) for Coruscant's night
and neon: the sheets are lit like a bright day, the map is dark blue-violet night. Done once here, not
at run time:

  assets/backgrounds/buildings/night/<id>.png   graded sprite (sheet resolution)

  1. tone: desaturate (the colour kept at SAT), a darkening curve (gamma GAMMA, then × GAIN), and a
     cool night cast (×CAST per channel) with a violet lift in the shadows;
  2. windows: the sheets' glass (blue-grey, cooler than the concrete) is where the light is. The
     glass is split in window-sized cells (WIN px); a seeded share of them (LIT) lights, a floor band
     at a time picking one colour — warm yellow, teal or neon violet — and the sheets' own amber lamps
     glow warm; a soft bloom (blurred emission, BLOOM) goes round the lit windows, under the alpha.
   python3 tools/sprites/buildings/grade.py [--compare reference/unsorted/current_map_edge.png out.png]
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

SRC = 'assets/backgrounds/buildings/cut'
OUT = 'assets/backgrounds/buildings/night'
SAT = 0.42
GAMMA = 1.55
GAIN = 0.46
CAST = np.array([0.80, 0.84, 1.12])
LIFT = np.array([7, 5, 16])  # violet in the shadows
WIN = (5, 4)  # window cell, sheet px (w, h)
LIT = 0.3
BLOOM = 0.45
NEON = [((255, 204, 128), 0.55), ((96, 232, 222), 0.27), ((206, 120, 255), 0.18)]


def h01(*k):
    return int.from_bytes(hashlib.blake2b(repr(k).encode(), digest_size=4).digest(), 'little') / 2**32


def grade(img, seed):
    rgb = img[..., :3].astype(float)
    a = img[..., 3].astype(float)
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    # the glass and the lamps, from the day colours
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    glass = (b > r + 10) & (b > g + 2) & (lum > 40) & (lum < 175) & (a > 128)
    lamp = (r > 170) & (g > 110) & (b < 0.72 * r) & (r - b > 60) & (a > 128)
    # 1. tone
    t = lum[..., None] + (rgb - lum[..., None]) * SAT
    t = 255 * (np.clip(t, 0, 255) / 255) ** GAMMA * GAIN
    t = t * CAST + LIFT * (1 - np.clip(lum / 255, 0, 1))[..., None]
    # 2. windows: cells of glass, a share lit; a floor band shares a colour
    H, W = lum.shape
    emis = np.zeros((H, W, 3))
    ys, xs = np.nonzero(glass)
    cx, cy = xs // WIN[0], ys // WIN[1]
    cells = {}
    for x, y, i, j in zip(xs, ys, cx, cy):
        cells.setdefault((i, j), []).append((y, x))
    for (i, j), px in cells.items():
        if len(px) < 4 or h01(seed, i, j) > LIT:
            continue
        band = (j // 3, i // 6)
        u = h01(seed, 'c', band)
        acc = 0
        for col, w in NEON:
            acc += w
            if u <= acc:
                break
        k = 0.45 + 0.4 * h01(seed, 'k', i, j)
        for y, x in px:
            emis[y, x] = np.array(col) * k * (0.6 + 0.4 * lum[y, x] / 175)
    emis[lamp] = np.maximum(emis[lamp], np.array([255, 196, 120]) * 0.85)
    out = np.clip(t * (1 - (emis.max(2, keepdims=True) > 0) * 0.6) + emis, 0, 255)
    # bloom round the lit windows (inside the sprite's own alpha)
    em8 = Image.fromarray(np.clip(emis, 0, 255).astype(np.uint8))
    bl = np.asarray(em8.filter(ImageFilter.GaussianBlur(2.2))).astype(float)
    out = np.clip(out + bl * BLOOM, 0, 255)
    return np.dstack([out, a]).astype(np.uint8)


def main():
    os.makedirs(OUT, exist_ok=True)
    index = json.load(open(f'{SRC}/index.json'))
    for bid in index:
        img = np.asarray(Image.open(f'{SRC}/{bid}.png').convert('RGBA'))
        Image.fromarray(grade(img, bid), 'RGBA').save(f'{OUT}/{bid}.png')
    print(f'graded {len(index)} -> {OUT}')
    if '--compare' in sys.argv:
        i = sys.argv.index('--compare')
        compare(index, sys.argv[i + 1], sys.argv[i + 2])


def compare(index, shot, out):
    """The game screenshot beside a strip of graded buildings at about game size over its own void."""
    S = Image.open(shot).convert('RGB')
    S = S.resize((1400, round(S.height * 1400 / S.width)), Image.LANCZOS)
    strip_h = 330
    C = Image.new('RGB', (1400, S.height + strip_h), (0, 0, 0))
    C.paste(S, (0, 0))
    # the strip's ground: the screenshot's void colour
    void = np.asarray(S)[S.height - 40:, :200].reshape(-1, 3).mean(0).astype(int)
    C.paste(tuple(void), (0, S.height, 1400, S.height + strip_h))
    ids = sorted(index)
    x = 6
    for k, bid in enumerate(ids[:: max(1, len(ids) // 14)]):
        im = Image.open(f'{OUT}/{bid}.png')
        sc = 0.42
        im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        if x + im.width > 1400:
            break
        C.paste(im, (x, S.height + strip_h - 12 - im.height), im)
        x += im.width + 4
    C.save(out)


main()
