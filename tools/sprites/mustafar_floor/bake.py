"""Mustafar facility floor tiles from the set's texture sheets (VikoizBeast's "Mustafar Floor Tile 1/2/3" and
"Mustafar TrimSheet 4", captured from their viewer: reference/color_rots/image_10..13.png).

    python3 tools/sprites/mustafar_floor/bake.py -> public/sprites/mustafar/floor_{field,edge,corner,trim}.png

- each square cut from its capture (the texture's box found against the viewer's flat grey), 256 px
- recoloured to the film's floor (photos of the sets in reference/color_rots; ART_GUIDE.md: low saturation): the
  viewer shows the slabs purple and the bands white under its light — per pixel the class (slab: blue over red and
  green; band: near white; grooves: dark lines; else the speckled stone, the edge strip a darker shade of it)
  takes the film's colour for it, the pixel's own shading kept (its brightness against the class's median; the
  classes read from a lightly blurred copy so a speckle keeps its class)
- field = Tile 1 (pale chevrons on dark slabs), edge = Tile 3 (zigzag band, the trim strip on its right: the wall
  side), corner = Tile 2 (stone in its top-left corner: the walls' side, the band turning round it), trim =
  TrimSheet 4 (a corridor's runner: white strips down the middle, triangle trims either side)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
REF = ROOT / 'reference/color_rots'
OUT = ROOT / 'public/sprites/mustafar'
SIZE = 256
SOURCES = {'trim': 'image_10.png', 'edge': 'image_11.png', 'corner': 'image_12.png', 'field': 'image_13.png'}
# the film's floor (measured on the sets' photos and the first floor texture, before the game's light)
FILM = {
    'slab': np.array([58, 61, 60]),  # dark polished slab
    'band': np.array([150, 151, 147]),  # pale band
    'stone': np.array([118, 119, 115]),  # speckled stone
    'groove': np.array([30, 31, 30]),
}


def cut(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    view = a[150:2230]
    diff = np.abs(view - view[20, 20]).sum(2) > 18
    rows = np.where(diff.mean(1) > 0.2)[0]
    cols = np.where(diff.mean(0) > 0.2)[0]
    y0, y1 = rows.min() + 150, rows.max() + 150
    x0, x1 = cols.min(), cols.max()
    return Image.fromarray(a[y0 + 4 : y1 - 3, x0 + 4 : x1 - 3].astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)


def recolour(im):
    """Classes from a lightly blurred copy (so a speckle does not change class), each pixel's own shading kept."""
    a = np.asarray(im).astype(np.float32)
    bl = np.asarray(im.filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    blum = bl @ np.array([0.299, 0.587, 0.114], np.float32)
    blue = bl[..., 2] - (bl[..., 0] + bl[..., 1]) / 2
    cls = np.full(lum.shape, 'stone', object)
    cls[blum > 232] = 'band'
    slab = (blue > 16) & (blum < 175)  # (measured: slabs blue > 18 below 170; the stone's blue tint stays under 16)
    # close the slabs' pale flecks (a slab is one polished piece)
    sm = Image.fromarray((slab * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))
    slab = np.asarray(sm) > 127
    cls[slab] = 'slab'
    cls[(lum < 95) & ~slab] = 'groove'
    out = np.zeros_like(a)
    for k, col in FILM.items():
        m = cls == k
        if not m.any():
            continue
        lo, hi = (0.55, 1.25) if k == 'stone' else (0.75, 1.2)  # the stone keeps its mottling and the edge strip its shade
        rel = np.clip(lum[m] / max(np.median(lum[m]), 1), lo, hi)
        out[m] = col[None, :] * rel[:, None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for k, f in SOURCES.items():
        im = recolour(cut(REF / f))
        im.save(OUT / f'floor_{k}.png', optimize=True)
        print(f'floor_{k}.png {im.size}')


if __name__ == '__main__':
    main()
