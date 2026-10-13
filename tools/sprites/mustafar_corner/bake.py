"""Mustafar room corner (reference/color_rots/image_29.png: a covered corridor out of the corner between two console
banks, their screens showing the lava): the set piece that fills a room's cut far corner (worldgen.js MustafarArena
cornerSets), as the film's control room and the LEGO set have it.

    python3 tools/sprites/mustafar_corner/bake.py && python3 tools/sprites/mustafar_set/pack.py
      -> public/sprites/mustafar/mfCorner{C,L,R}.{png,json}

The render is seen lower than the game's view, its banks less foreshortened, so it is cut in three and each piece
fitted to its own wall (ART_GUIDE.md: along an axis 20 px a metre, across the diagonal 28.3, up Z_PX 24.5):
- `mfCornerC` the corridor (x 650..1000): its portal across the corner's diagonal, level across the screen, 4 m wide
- `mfCornerR` the right bank (x ≥ 1000): along the wall that runs down-right from the corner (the world's +x)
- `mfCornerL` the left bank (x < 650): along the wall that runs down-left (the world's +y)
one height scale for all three (the banks 2.9 m, the corridor 3.2 m); each piece sheared so its floor line runs
at its wall's slope on screen; drawn at 4× (k 0.25). Glowing parts (the screens, the lamps, the corridor's light)
on a neon layer.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'reference/color_rots/image_29.png'
OUT = ROOT / 'public/sprites/mustafar'
OVER = 4
SY = 0.22  # game px per render px, up
GAIN = 0.85
# name: (render x range, horizontal scale, floor line (two render points), target slope, anchor render x, footprint,
# light)
PIECES = {
    'mfCornerC': ((650, 1000), 113 / 350, ((770, 653), (930, 634)), 0.0, 840,
                  [[-1.41, 1.41], [1.41, -1.41], [-2.12, -4.95], [-4.95, -2.12]], [0.6, 0.6, 1.4, 255, 150, 70, 90, 0.05]),
    'mfCornerR': ((1000, 1672), 0.155, ((1060, 608), (1480, 716)), 0.5, 1270,
                  [[-2, -0.6], [2, -0.6], [2, 0.1], [-2, 0.1]], [0, 1.0, 1.5, 255, 90, 40, 120, 0.05]),
    'mfCornerL': ((0, 650), 0.155, ((230, 786), (490, 697)), -0.5, 380,
                  [[-0.6, -2], [0.1, -2], [0.1, 2], [-0.6, 2]], [1.0, 0, 1.5, 255, 90, 40, 120, 0.05]),
}


def emissive(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 0.5) & (r > g * 1.3) & (b < 0.45) & (a[..., 3] > 0.5)
    m |= (b > 0.55) & (b > r * 1.4) & (a[..., 3] > 0.5)  # the desks' blue lamps
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    return np.asarray(m) / 255.0


def main():
    src = Image.open(SRC).convert('RGBA')
    a = np.asarray(src).astype(np.float32) / 255
    m = emissive(a)
    body = a.copy()
    body[..., :3] *= np.where(m[..., None] > 0.5, 1, GAIN)
    neon = a.copy()
    neon[..., 3] *= m
    W, H = src.size
    for name, ((x0, x1), sxg, ((px0, py0), (px1, py1)), slope, axr, fp, light) in PIECES.items():
        sx, sy = sxg * OVER, SY * OVER
        k = slope - (py1 - py0) / (px1 - px0) * sy / sx  # added shear: the floor line onto the wall's slope
        layers = {}
        for nm, arr in (('body', body), ('neon', neon)):
            part = arr.copy()
            part[:, :x0, 3] = 0
            part[:, x1:, 3] = 0
            im = Image.fromarray((np.clip(part, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
            ow = int(W * sx) + 2
            shift = int(abs(k) * ow) + 2
            oh = int(H * sy) + shift * 2
            # (x, y) -> (x sx, y sy + k x sx + shift); PIL's affine maps output to input
            inv = (1 / sx, 0, 0, -k / sy, 1 / sy, -shift / sy)
            layers[nm] = im.transform((ow, oh), Image.AFFINE, inv, resample=Image.BICUBIC)
        ay_r = py0 + (py1 - py0) / (px1 - px0) * (axr - px0)
        ax = axr * sx
        ay = ay_r * sy + k * axr * sx + shift
        bb = layers['body'].getbbox()
        b2, n2 = layers['body'].crop(bb), layers['neon'].crop(bb)
        b2.save(OUT / f'{name}_body.png', optimize=True)
        n2.save(OUT / f'{name}_neon.png', optimize=True)
        meta = {
            'anchor': [round(ax - bb[0], 1), round(ay - bb[1], 1)],
            'k': 1 / OVER,
            'layers': {'body': f'{name}_body.png', 'neon': f'{name}_neon.png'},
            'footprint': fp,
            'lights': [light],
            'neon': {'base': 1, 'hum': 0.06, 'speed': 0.6, 'flicker': {'rate': 0.02, 'dur': [0.05, 0.15], 'level': 0.6}},
        }
        (OUT / f'{name}.json').write_text(json.dumps(meta))
        print(f'{name}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]}, shear {k:.3f}')


if __name__ == '__main__':
    main()
