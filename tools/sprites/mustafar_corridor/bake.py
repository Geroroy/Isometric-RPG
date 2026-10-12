"""Mustafar covered corridor (the film's passage between rooms: a ribbed box, a pillared portal, warm light strips
inside) from a cut-out render (reference/color_rots/image_5.png, 1774x887 RGBA, seen from higher and more head-on
than the game's view).

    python3 tools/sprites/mustafar_corridor/bake.py [png] -> public/sprites/mustafar/mfCorridor*.{png,json}

- re-projected to the game's view (ART_GUIDE.md: 2:1 tiles, Z_PX 24.5 a metre): six corners of the box measured
  in the render are fitted by least squares to the box's real size in the game's projection — 4 m across the
  portal, 3.4 m tall, 6 m long — and the render resampled through that affine map, at 2x (k 0.5)
- `mfCorridor_r`: along x, the portal facing +x (as rendered); `mfCorridor`: mirrored, along y, the portal facing
  +y (into a room through its north wall). The anchor is the portal's sill, mid-way across
- body darkened to the facility's ash metal like the consoles; the neon layer is the light strips inside the
  portal, drawn after the light map, with a warm light spilling out of the mouth
- the footprint covers the box (renderer: the shell fades while someone is inside it, `roof`)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'reference/color_rots/image_5.png'
OUT = ROOT / 'public/sprites/mustafar'
OVER = 2
W, H, L = 4.0, 3.4, 6.0  # m: across the portal, tall, long
BODY_GAIN = 0.78
# corners in the render: (x, y) -> the box's (x, y, z) in metres, built along x with the portal at x = 0
# facing +x, its left side (+y) on the screen's left
CORNERS = [
    ((765, 830), (0, W / 2, 0)),  # portal, bottom left
    ((1230, 770), (0, -W / 2, 0)),  # portal, bottom right
    ((775, 360), (0, W / 2, H)),  # portal, top left
    ((1200, 310), (0, -W / 2, H)),  # portal, top right
    ((455, 95), (-L, W / 2, H)),  # back, top left
    ((800, 3), (-L, -W / 2, H)),  # back, top right
]
MOUTH = (840, 380, 1185, 805)  # the opening's box in the render


def screen(x, y, z):
    return ((x - y) * 20 * OVER, ((x + y) * 10 - z * 24.5) * OVER)


def fit():
    A = np.array([[sx, sy, 1] for (sx, sy), _ in CORNERS], float)
    T = np.array([screen(*w) for _, w in CORNERS], float)
    M, *_ = np.linalg.lstsq(A, T, rcond=None)  # T = A @ M
    res = np.abs(A @ M - T).max()
    return M.T, res  # 2x3


def emissive(a):
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    inb = (xx >= MOUTH[0]) & (xx < MOUTH[2]) & (yy >= MOUTH[1]) & (yy < MOUTH[3])
    m = inb & (r > 0.55) & (r > g * 1.25) & (b < 0.45) & (a[..., 3] > 0.5)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(m) / 255.0


def main():
    src = Image.open(SRC).convert('RGBA')
    a = np.asarray(src).astype(np.float32) / 255
    m = emissive(a)
    body = a.copy()
    body[..., :3] *= np.where(m[..., None] > 0.5, 1, BODY_GAIN)
    neon = a.copy()
    neon[..., 3] *= m
    M, res = fit()
    # output bounds: the source's opaque box mapped through M
    x0, y0, x1, y1 = src.getbbox()
    pts = np.array([[x, y, 1] for x in (x0, x1) for y in (y0, y1)], float) @ M.T
    lo = np.floor(pts.min(0)) - 2
    hi = np.ceil(pts.max(0)) + 2
    size = tuple(int(v) for v in hi - lo)
    # PIL wants output -> input: invert [M; 0 0 1] after moving the output origin to lo
    F = np.vstack([M, [0, 0, 1]])
    F[:2, 2] -= lo
    Fi = np.linalg.inv(F)
    coeffs = tuple(Fi[:2].reshape(-1))
    out = {}
    for name, arr in (('body', body), ('neon', neon)):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        # downscale first-ish: resample at 2x the output and halve, for a clean minification
        big = im.transform((size[0] * 2, size[1] * 2), Image.AFFINE, tuple(np.array(coeffs) * [0.5, 0.5, 1, 0.5, 0.5, 1]), resample=Image.BICUBIC)
        out[name] = big.resize(size, Image.LANCZOS)
    ax, ay = -lo  # the portal's sill centre (world origin) in the output
    bb = out['body'].getbbox()
    OUT.mkdir(parents=True, exist_ok=True)
    for turned in (True, False):
        b2, n2 = out['body'].crop(bb), out['neon'].crop(bb)
        ox, oy = ax - bb[0], ay - bb[1]
        fp = [[-L, -W / 2], [0, -W / 2], [0, W / 2], [-L, W / 2]]  # along x
        light = [-1.2, 0, 1.4, 255, 160, 80, 90, 0.05]
        nm = 'mfCorridor_r' if turned else 'mfCorridor'
        if not turned:  # mirrored: along y, the portal facing +y; (x, y) -> (y, x)
            b2, n2 = b2.transpose(Image.FLIP_LEFT_RIGHT), n2.transpose(Image.FLIP_LEFT_RIGHT)
            ox = b2.width - ox
            fp = [[y, x] for x, y in fp]
            light = [light[1], light[0], *light[2:]]
        b2.save(OUT / f'{nm}_body.png', optimize=True)
        n2.save(OUT / f'{nm}_neon.png', optimize=True)
        meta = {
            'anchor': [round(float(ox), 1), round(float(oy), 1)],
            'k': 1 / OVER,
            'layers': {'body': f'{nm}_body.png', 'neon': f'{nm}_neon.png'},
            'footprint': fp,
            'lights': [light],
            'roof': True,
            'neon': {'base': 1, 'hum': 0.05, 'speed': 0.5, 'flicker': {'rate': 0.01, 'dur': [0.05, 0.12], 'level': 0.6}},
        }
        (OUT / f'{nm}.json').write_text(json.dumps(meta))
        print(f'{nm}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]}, fit residual {res / OVER:.1f} game px')


if __name__ == '__main__':
    main()
