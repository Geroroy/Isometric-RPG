"""Mustafar lava: a seamless square texture from an isometric lava tile (reference/color_rots/image_17.png, a 2:1
diamond: cooling crust plates split by glowing veins).

    python3 tools/sprites/mustafar_lava/bake.py -> public/sprites/mustafar/lava.png

- unprojected: the diamond's top corner is the tile's (0, 0), its right corner +x, its left corner +y (the game's own
  projection), so the square is the lava as seen from above, which the terrain lays in world space (terrain.js)
- made to repeat: per axis, the square blended with itself shifted by half, the shifted copy taking over towards
  the edges
- kept as rendered (its glow is the lava's own light; the Mustafar grade and the light map do the rest)
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'reference/color_rots/image_17.png'
OUT = ROOT / 'public/sprites/mustafar/lava.png'
SIZE = 512
TOP, RIGHT, LEFT = np.array([885.0, 14.0]), np.array([1744.0, 440.0]), np.array([26.0, 440.0])
INSET = 0.03  # off the diamond's ragged rim


def main():
    src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    h, w = src.shape[:2]
    t = (np.arange(SIZE) + 0.5) / SIZE * (1 - 2 * INSET) + INSET
    u, v = np.meshgrid(t, t)  # u along +x (columns), v along +y (rows)
    p = TOP[None, None] + u[..., None] * (RIGHT - TOP) + v[..., None] * (LEFT - TOP)
    # bilinear sample
    x, y = p[..., 0] - 0.5, p[..., 1] - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    ax, ay = (x - x0)[..., None], (y - y0)[..., None]
    c = lambda yy, xx: src[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)]
    sq = (c(y0, x0) * (1 - ax) + c(y0, x0 + 1) * ax) * (1 - ay) + (c(y0 + 1, x0) * (1 - ax) + c(y0 + 1, x0 + 1) * ax) * ay
    # seamless, one axis at a time: blended with itself shifted by half along that axis, the shifted copy owning
    # the edges and the square its own middle (where the copy's seam lies)
    e = np.minimum(np.arange(SIZE), SIZE - 1 - np.arange(SIZE)) / (SIZE / 2)  # 0 at an edge, 1 in the middle
    wgt = np.clip((e - 0.05) / 0.45, 0, 1)
    out = sq
    for ax in (1, 0):
        sh = np.roll(out, SIZE // 2, ax)
        w = (wgt[None, :, None] if ax == 1 else wgt[:, None, None])
        out = out * w + sh * (1 - w)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)} {SIZE}x{SIZE}')


if __name__ == '__main__':
    main()
