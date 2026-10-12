# Lightsaber reference frames, measured: the blade's white core, the colour in rings round it
# (1-2, 2-4, 4-8, 8-16, 16-32 px at 1280 px width), the glow's reach against the core's thickness,
# and how much the background brightens (bloom) — from real frames, not by eye.
#   python3 tools/qa/saberprofile.py frame.png [frame.png ...] [--sky 0.55] [--crop x0,x1,y0,y1]
#   (--sky: rows below sky*H ignored; --crop: fractions of the frame, one blade per crop)
import sys

import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
sky = float(sys.argv[sys.argv.index('--sky') + 1]) if '--sky' in sys.argv else 1.0
crop = [float(x) for x in sys.argv[sys.argv.index('--crop') + 1].split(',')] if '--crop' in sys.argv else None  # x0,x1,y0,y1 fractions
args = [a for a in args if a not in (str(sky),) and not (crop and a == sys.argv[sys.argv.index('--crop') + 1])]
RINGS = [(1, 2), (2, 4), (4, 8), (8, 16), (16, 32)]


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(round(min(255, max(0, v)))) for v in c)


def _grow(m, r, op):
    """Square dilation (op=or) / erosion (op=and) by r px, separable, by shifting."""
    out = m
    for axis in (0, 1):
        acc = out.copy()
        for k in range(1, r + 1):
            acc = op(acc, np.roll(out, k, axis=axis))
            acc = op(acc, np.roll(out, -k, axis=axis))
        out = acc
    return out


def dil(m, r):
    return _grow(m, r, np.logical_or)


def ero(m, r):
    return _grow(m, r, np.logical_and)


rows = []
for f in args:
    im = Image.open(f).convert('RGB')
    im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
    if crop:
        im = im.crop((int(crop[0] * im.width), int(crop[2] * im.height), int(crop[1] * im.width), int(crop[3] * im.height)))
    a = np.asarray(im).astype(np.float32)
    H = a.shape[0]
    core = a.min(axis=2) > 225
    core[int(H * sky):] = False
    # a blade's core has colour right round it: drop white blobs (lights, flashes) with none
    rim = dil(core, 3) & ~core
    sat = a.max(2) - a.min(2)
    if core.sum() < 30 or (sat[rim] > 60).mean() < 0.3 or core.mean() > 0.04:
        print(f'{f}: no clean blade (core {core.mean() * 100:.2f}% of frame)')
        continue
    k = 0
    m = core
    while m.any() and k < 40:
        m = ero(m, 1)
        k += 1
    thick = 2 * k - 1  # px across the core at 1280 wide
    prev = core
    out = []
    bg_ring = dil(core, 64) & ~dil(core, 48)
    bg = a[bg_ring].mean(0) if bg_ring.any() else a.reshape(-1, 3).mean(0)
    reach = 0
    for r0, r1 in RINGS:
        ring = dil(core, r1) & ~dil(core, r0)
        c = a[ring].mean(0)
        ex = (c - bg).max()  # how much brighter than the background further out
        out.append((r0, r1, c, ex))
        if ex > 25:
            reach = r1
    blade = a[core].mean(0)
    print(f'{f.split("/")[-1]}: core {hexc(blade)} thick {thick}px | ' + ' | '.join(f'{r0}-{r1}px {hexc(c)} +{ex:.0f}' for r0, r1, c, ex in out) +
          f' | bg {hexc(bg)} | glow reach {reach}px = {reach / max(1, thick / 2):.1f}x core half-width')
