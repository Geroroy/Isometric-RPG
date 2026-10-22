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
- `mfCorridorL_r` / `mfCorridorL`: the same shell lengthened to 15 m (the junction's whole length, so its roof runs
  end to end): each pixel's place along the box read off the surface its line of sight meets first (the roof, the
  near side, the portal's face), the back part moved back and the gap filled by repeating a 1.5 m stretch of the
  middle (its ribs, its side panels)
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


def lengthen(layers, ax, ay, L2, cut=-3.0, step=1.5):
    """The box (x from −L to 0) made L2 long: what lies behind `cut` moved back by L2 − L, the gap filled with
    copies of the stretch [cut − step, cut], back to front."""
    d = L2 - L
    wd, ht = layers['body'].size
    py, px = np.mgrid[0:ht, 0:wd].astype(np.float32)
    sx = (px - ax) / OVER / 20
    sy = (py - ay) / OVER / 10
    fx, fy = (sx + sy) / 2, (sy - sx) / 2
    wx = fx.copy()
    hit = np.zeros(fx.shape, bool)
    for h in np.arange(H, -0.001, -0.04):
        x, y = fx + 1.225 * h, fy + 1.225 * h
        solid = (x >= -L) & (x <= 0) & (np.abs(y) <= W / 2)
        new = solid & ~hit
        wx[new] = x[new]
        hit |= new
    back, near = wx < cut - step, wx >= cut
    mid = ~back & ~near
    shift = lambda m: (round(-m * 20 * OVER), round(-m * 10 * OVER))
    pad = shift(d)
    out = {}
    for k, im in layers.items():
        arr = np.asarray(im)
        part = lambda m: Image.fromarray(np.where(m[..., None], arr, 0).astype(np.uint8), 'RGBA')
        canvas = Image.new('RGBA', (wd - pad[0], ht - pad[1]))
        o = (-pad[0], -pad[1])  # the old origin inside the bigger canvas
        bx, by = shift(d)
        canvas.alpha_composite(part(back), (o[0] + bx, o[1] + by))
        n = int(round(d / step))
        for i in range(n, -1, -1):  # the repeated middle, farthest first
            mx, my = shift(i * d / n)
            canvas.alpha_composite(part(mid), (o[0] + mx, o[1] + my))
        canvas.alpha_composite(part(near), o)
        out[k] = canvas
    return out, ax - pad[0], ay - pad[1]


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
    OUT.mkdir(parents=True, exist_ok=True)
    long_layers, lax, lay = lengthen(out, ax, ay, 15.0)
    for nm, lay_, oax, oay, length in (('mfCorridor_r', out, ax, ay, L), ('mfCorridorL_r', long_layers, lax, lay, 15.0)):
        bb = lay_['body'].getbbox()
        b2, n2 = lay_['body'].crop(bb), lay_['neon'].crop(bb)
        ox, oy = oax - bb[0], oay - bb[1]
        fp = [[-length, -W / 2], [0, -W / 2], [0, W / 2], [-length, W / 2]]  # along x
        light = [-1.2, 0, 1.4, 255, 160, 80, 90, 0.05]
        turned = True  # (its mirrored twin is flipped by the loader: gfx/mustafarFloor.js)
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
