"""ESRGAN the buildings the bake enlarges (bake.py SCALE > 1: the towers and the plants), once, into
assets/city/buildings/hr/<id>.png at the bake's final size — so the bake resamples nothing for them.

Per building: the cut sprite's colour with its transparent surround filled by the nearest edge colour
(no dark halo at the outline), through ESRGAN 4x (esrgan/up.cjs), then Lanczos down to the final size
(4x → ~1.5x, blurred first at the source blocks' period, sharpened after); the alpha is the cut's own, Lanczos to the same size.
   (cd tools/sprites/undercity_buildings/esrgan && npm install)   # once
   python3 tools/sprites/undercity_buildings/upscale.py [ids...]
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = 'assets/city/buildings/cut'
OUT = 'assets/city/buildings/hr'
X4 = 'assets/city/buildings/x4'  # the ESRGAN 4x results, kept (not in git): a new SCALE only re-resamples
sys.path.insert(0, HERE)
SCALE = {'shops': 1.0, 'towers': 1.5, 'plants': 1.4}  # (bake.py's)
# the sheets are blocky (AI pixel art, ~1 px blocks): ESRGAN draws each block's edge as a line, a
# 4 px mesh in its 4x that the downscale to ~1.5x aliases into a visible grid. A blur at that period
# before the downscale removes it; an unsharp after brings the edges back
PREBLUR = 1.6  # Gaussian radius on the 4x
SHARPEN = 90  # unsharp after the downscale (percent; 0 = none)


def bleed(rgb, a):
    """Transparent pixels take the colour of the nearest opaque one (a few dilation passes)."""
    rgb = rgb.copy()
    m = a > 0
    img = Image.fromarray(rgb.astype(np.uint8))
    for _ in range(12):
        if m.all():
            break
        grown = np.asarray(img.filter(ImageFilter.MaxFilter(3))).astype(float)
        mm = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
        # average of opaque neighbours is better than max; use a blur weighted by the mask
        num = np.asarray(Image.fromarray(np.clip(rgb * m[..., None], 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1))).astype(float)
        den = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1))).astype(float)[..., None] / 255
        fill = np.where(den > 0, num / np.maximum(den, 1e-3), grown)
        new = mm & ~m
        rgb[new] = fill[new]
        m = mm
        img = Image.fromarray(rgb.astype(np.uint8))
    return rgb


def main():
    os.makedirs(OUT, exist_ok=True)
    index = json.load(open(f'{SRC}/index.json'))
    ids = sys.argv[1:] or [b for b, v in sorted(index.items()) if SCALE[v['sheet']] > 1]
    for bid in ids:
        k = SCALE[index[bid]['sheet']]
        img = np.asarray(Image.open(f'{SRC}/{bid}.png').convert('RGBA')).astype(float)
        h, w = img.shape[:2]
        W, H = round(w * k), round(h * k)
        x4 = f'{X4}/{bid}.png'
        if not os.path.exists(x4) or os.path.getmtime(x4) < os.path.getmtime(f'{SRC}/{bid}.png'):
            os.makedirs(X4, exist_ok=True)
            with tempfile.TemporaryDirectory() as td:
                Image.fromarray(bleed(img[..., :3], img[..., 3]).astype(np.uint8)).save(f'{td}/in.png')
                subprocess.run(['node', os.path.join(HERE, 'esrgan', 'up.cjs'), f'{td}/in.png', x4, '4'], check=True, capture_output=True)
        up = Image.open(x4).convert('RGB').filter(ImageFilter.GaussianBlur(PREBLUR)).resize((W, H), Image.LANCZOS)
        if SHARPEN:
            up = up.filter(ImageFilter.UnsharpMask(radius=0.8, percent=SHARPEN, threshold=1))
        a = Image.fromarray(img[..., 3].astype(np.uint8)).resize((W, H), Image.LANCZOS)
        out = np.dstack([np.asarray(up), np.asarray(a)])
        out[out[..., 3] < 12] = 0
        Image.fromarray(out.astype(np.uint8), 'RGBA').save(f'{OUT}/{bid}.png', optimize=True)
        print(bid, (w, h), '->', (W, H))


main()
