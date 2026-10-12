"""Mustafar facility floor: one seamless tile from the floor texture sheet (reference/color_rots/image.png,
a 3x3 sheet of the film's interior floor: pale bands in chevrons round long hexagons, dark slabs, dark seam bars
with light slots between the tiles).

    python3 tools/sprites/mustafar_floor/bake.py [sheet] -> public/sprites/mustafar/floor.png

- the middle tile, cut on the seam bars' centres (measured: vertical bars at x 489 / 774, horizontal at
  y 285 / 562 in the 1251x848 sheet), so the bars split half to each edge and the tile repeats without a seam
- ART_GUIDE.md: low saturation (the sheet's green tint is mostly the light; the film's floor is grey bands on
  dark slabs), strong colour only on emitters: the light slots keep a cool tint (saturation <= 0.7)
- the bands and slabs mapped to the facility deck's brightness (the game's light map and the Mustafar grade warm
  it), the darkest seams kept dark
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'reference/color_rots/image.png'
OUT = ROOT / 'public/sprites/mustafar/floor.png'
BOX = (489, 285, 774, 562)  # the middle tile, seam centre to seam centre
SIZE = 192  # px per repeat (3 world tiles: 64 px a tile, enough for the HD terrain at zoom 2)
SAT = 0.3  # the bands and slabs: a trace of the green left
SAT_EMIT = 0.7  # the light slots (ART_GUIDE: neon saturation <= 0.7)
LO, HI = 34, 182  # output levels of the darkest seam / the brightest band


def main():
    im = Image.open(SRC).convert('RGB').crop(BOX).resize((SIZE, SIZE), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    # the light slots: blue over red, bright
    emit = np.clip((a[..., 2] - a[..., 0] - 0.12) * 4, 0, 1) * np.clip((lum - 0.35) * 4, 0, 1)
    s = SAT + (SAT_EMIT - SAT) * emit
    out = lum[..., None] + (a - lum[..., None]) * s[..., None]
    # levels: the sheet's 1st..99.5th percentile to LO..HI
    p0, p1 = np.percentile(lum, [1, 99.5])
    out = (out - p0) / (p1 - p0)
    out = LO / 255 + np.clip(out, 0, 1.15) * (HI - LO) / 255
    # make the wrap exact: blend a few px across each edge with the opposite one
    k = 3
    for i in range(k):
        w = 0.5 * (1 - i / k)
        for ax in (0, 1):
            first = np.take(out, i, axis=ax).copy()
            last = np.take(out, -1 - i, axis=ax).copy()
            m = first * (1 - w) + last * w
            n = last * (1 - w) + first * w
            if ax == 0:
                out[i], out[-1 - i] = m, n
            else:
                out[:, i], out[:, -1 - i] = m, n
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)}  {SIZE}x{SIZE}  emitters {float((emit > 0.5).mean()) * 100:.1f}%')


if __name__ == '__main__':
    main()
