"""Mustafar facility floor tiles from the set's texture sheets (VikoizBeast's "Mustafar Floor Tile 1/2/3" and
"Mustafar TrimSheet 4", captured from their viewer: reference/color_rots/image_10..13.png).

    python3 tools/sprites/mustafar_floor/bake.py -> public/sprites/mustafar/floor_{field,edge,corner,trim}.png

- each square cut from its capture (the texture's box found against the viewer's flat grey), 256 px
- recoloured to the set's materials (levels, warmth and grit measured on the set sprites drawn on it, so the floor
  matches them; ART_GUIDE.md: low saturation): the
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
# the film's floor in the set's own materials: levels and warmth measured on the set sprites drawn on it (the
# corridor's inside, the consoles, the covered corridor: mean brightness 40-60, the darkest 5% under 15, warm grey
# R-B +5..+25, grit 14-21) so the floor sits with them under the same light map
FILM = {
    'slab': np.array([33, 30, 28]),  # dark polished slab
    'stone': np.array([74, 69, 63]),  # worn ash-grey stone
    'band': np.array([100, 94, 86]),  # the pale bands, dulled
    'groove': np.array([13, 12, 11]),
}
GRIT = 0.11  # fine grain (multiplicative sigma), as the sprites' surfaces
DETAIL = 2.0  # the capture's own mottling, amplified


def periodic_noise(shape, sigma, rng):
    """Gaussian-blurred white noise that wraps (blurred in the frequency domain), scaled to unit std."""
    n = rng.standard_normal(shape)
    fy = np.fft.fftfreq(shape[0])[:, None]
    fx = np.fft.fftfreq(shape[1])[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx**2 + fy**2))
    out = np.real(np.fft.ifft2(np.fft.fft2(n) * g))
    return out / max(out.std(), 1e-6)


def cut(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    view = a[150:2230]
    diff = np.abs(view - view[20, 20]).sum(2) > 18
    rows = np.where(diff.mean(1) > 0.2)[0]
    cols = np.where(diff.mean(0) > 0.2)[0]
    y0, y1 = rows.min() + 150, rows.max() + 150
    x0, x1 = cols.min(), cols.max()
    return Image.fromarray(a[y0 + 4 : y1 - 3, x0 + 4 : x1 - 3].astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)


def recolour(im, seed):
    """Classes from a lightly blurred copy (so a speckle does not change class); each takes the set's material
    colour, keeping the capture's own mottling (amplified); then grit, soot and rust stains, and dark joints with a
    lit lip where two materials meet, all wrapping so the tile still repeats."""
    rng = np.random.default_rng(seed)
    a = np.asarray(im).astype(np.float32)
    bl = np.asarray(im.filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32)
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    blum = bl @ np.array([0.299, 0.587, 0.114], np.float32)
    blue = bl[..., 2] - (bl[..., 0] + bl[..., 1]) / 2
    slab = (blue > 16) & (blum < 175)  # (measured: slabs blue > 18 below 170; the stone's blue tint stays under 16)
    # close the slabs' pale flecks (a slab is one polished piece)
    sm = Image.fromarray((slab * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))
    slab = np.asarray(sm) > 127
    cls = np.zeros(lum.shape, np.int8)  # 0 stone, 1 band, 2 slab, 3 groove
    cls[blum > 232] = 1
    cls[slab] = 2
    cls[(lum < 95) & ~slab] = 3
    names = ['stone', 'band', 'slab', 'groove']
    out = np.zeros_like(a)
    for k, n in enumerate(names):
        m = cls == k
        if not m.any():
            continue
        rel = 1 + (lum[m] / max(np.median(lum[m]), 1) - 1) * DETAIL
        out[m] = FILM[n][None, :] * np.clip(rel, 0.45, 1.6)[:, None]
    shp = lum.shape
    # grit: fine grain and pits
    grain = 1 + GRIT * periodic_noise(shp, 0.6, rng)
    pits = periodic_noise(shp, 0.8, rng)
    grain *= np.where(pits > 2.3, 0.55, np.where(pits < -2.6, 1.25, 1))
    # soot: broad darker patches; rust: warm stains in the worn spots
    soot = np.clip(1 + 0.16 * periodic_noise(shp, 18, rng), 0.7, 1.15)
    rust = np.clip(periodic_noise(shp, 9, rng) - 1.0, 0, 1.5)[..., None]
    out = out * (grain * soot)[..., None]
    out = out + rust * np.array([10, 3, -3]) * (out.mean(-1, keepdims=True) / 60)
    # joints: where the class changes, a dark seam; the side towards the light (−x −y) a faint lit lip
    edge = np.zeros(shp, bool)
    for ax in (0, 1):
        edge |= cls != np.roll(cls, 1, ax)
    seam = np.asarray(Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    lip = np.roll(np.roll(seam, 2, 0), 2, 1) & ~seam
    out[seam] *= 0.45
    out[lip] *= 1.12
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, (k, f) in enumerate(SOURCES.items()):
        im = recolour(cut(REF / f), i + 7)
        im.save(OUT / f'floor_{k}.png', optimize=True)
        print(f'floor_{k}.png {im.size}')


if __name__ == '__main__':
    main()
