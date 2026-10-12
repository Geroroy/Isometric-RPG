"""Mustafar wall console (the film's screen bays: a wide screen over a desk between two pillars) from a cut-out
render (reference/color_rots/image_4.png, 1774x887 RGBA, seen from a lower angle than the game's).

    python3 tools/sprites/mustafar_console/bake.py [png] -> public/sprites/mustafar/console*.{png,json}

- to the game's projection (ART_GUIDE.md): 3.0 m along the wall (the feet's fronts 800 px apart in the render ->
  3 tiles = 60 px across), 2.7 m tall (the pillars ~680 px -> 66 px, Z_PX 24.5 a metre), then a vertical shear
  so the base runs at the 2:1 slope of a wall along x; drawn at 2x (k 0.5) so it stays sharp at zoom 2
- body darkened to the facility's ash metal; the neon layer is the screen and the desk's buttons, drawn after the
  light map (renderer.drawCityGlow) so they glow in the dark rooms; a green light spills on the floor in front,
  as in the film's conference room
- four sprites: `mfConsole` against a north wall (faces +y), `mfConsole_r` mirrored for a west wall (faces +x),
  and `mfConsoleRed` / `_r` with the screen turned red (the control room's middle screen in the film)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'reference/color_rots/image_4.png'
OUT = ROOT / 'public/sprites/mustafar'
OVER = 2  # px per game px
SX = 60 / 800 * OVER  # along the wall
SY = 66 / 680 * OVER  # up
FEET = ((405, 658), (1205, 884))  # the pillars' front feet in the render
DEPTH = 0.5  # m, wall to the desk's front
SCREEN = (650, 200, 1140, 560)  # the screen's box in the render (the pillars lie outside it)
BUTTONS = (600, 440, 1110, 630)
BODY_GAIN = 0.78


def lum(a):
    return a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)


def emissive(a):
    """The screen (dark green ground, amber lines) and the desk's lit buttons and the pillars' red pins."""
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    L = lum(a)
    mx, mn = a[..., :3].max(2), a[..., :3].min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    inb = lambda B: (xx >= B[0]) & (xx < B[2]) & (yy >= B[1]) & (yy < B[3])
    screen = inb(SCREEN) & (((g > r + 0.02) & (g > b)) | ((r > 0.5) & (g > 0.4) & (b < 0.35)))
    buttons = inb(BUTTONS) & (sat > 0.45) & (L > 0.4)
    pins = ~inb(SCREEN) & (r > 0.55) & (r > g * 1.8) & (r > b * 1.8)
    m = (screen | buttons | pins).astype(np.float32) * (a[..., 3] > 0.5)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    return m, screen


def redden(a, screen):
    """The film's red screen: the same display in reds."""
    out = a.copy()
    L = lum(a)
    red = np.stack([np.clip(L * 2.3, 0, 1), np.clip(L * 0.55, 0, 1), np.clip(L * 0.4, 0, 1)], -1)
    out[..., :3] = np.where(screen[..., None], red, a[..., :3])
    return out


def project(img):
    """Scale to game pixels (x2) and shear the base onto the 2:1 slope; returns the image and the feet."""
    w, h = img.size
    w2, h2 = round(w * SX), round(h * SY)
    small = img.resize((w2, h2), Image.LANCZOS)
    (x0, y0), (x1, y1) = [(x * SX, y * SY) for x, y in FEET]
    k = 0.5 - (y1 - y0) / (x1 - x0)  # added slope
    pad = int(abs(k) * w2) + 2
    # y' = y + k (x - x0): PIL's affine maps output to input
    out = small.transform((w2, h2 + pad), Image.AFFINE, (1, 0, 0, -k, 1, k * x0), resample=Image.BICUBIC)
    feet = ((x0, y0), (x1, y1 + k * (x1 - x0)))
    return out, feet


def crop(img, ox, oy):
    bb = img.getbbox()
    return img.crop(bb), ox - bb[0], oy - bb[1]


def main():
    src = Image.open(SRC).convert('RGBA')
    a = np.asarray(src).astype(np.float32) / 255
    m, screen = emissive(a)
    variants = {'mfConsole': a, 'mfConsoleRed': redden(a, screen)}
    OUT.mkdir(parents=True, exist_ok=True)
    for name, arr in variants.items():
        body = arr.copy()
        body[..., :3] *= np.where(m[..., None] > 0.5, 1, BODY_GAIN)
        neon = arr.copy()
        neon[..., 3] *= m
        bi = Image.fromarray((np.clip(body, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        ni = Image.fromarray((np.clip(neon, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        bp, ((fx0, fy0), (fx1, fy1)) = project(bi)
        npj, _ = project(ni)
        # the anchor: the ground under the console's middle, half its depth behind the feet's fronts
        # (back = −y: up and right on screen, (+20, −10) game px a metre)
        ax = (fx0 + fx1) / 2 + 20 * OVER * DEPTH / 2
        ay = (fy0 + fy1) / 2 - 10 * OVER * DEPTH / 2
        bb = bp.getbbox()
        for turned in (False, True):
            b2, n2 = bp.crop(bb), npj.crop(bb)
            ox, oy = ax - bb[0], ay - bb[1]
            if turned:  # mirrored: along a west wall, facing +x
                b2, n2 = b2.transpose(Image.FLIP_LEFT_RIGHT), n2.transpose(Image.FLIP_LEFT_RIGHT)
                ox = b2.width - ox
            nm = name + ('_r' if turned else '')
            b2.save(OUT / f'{nm}_body.png', optimize=True)
            n2.save(OUT / f'{nm}_neon.png', optimize=True)
            red = name.endswith('Red')
            col = [255, 70, 50] if red else [110, 235, 140]
            fp = [[-1.5, -DEPTH], [1.5, -DEPTH], [1.5, 0.1], [-1.5, 0.1]]  # wall to desk (north wall: +y is the room)
            light = [0, 1.0, 1.5, *col, 120, 0.04]
            if turned:  # (x, y) -> (y, −x): what faced +y faces +x
                fp = [[y, -x] for x, y in fp]
                light = [light[1], -light[0], *light[2:]]
            meta = {
                'anchor': [round(ox / OVER, 2), round(oy / OVER, 2)],
                'k': 1 / OVER,
                'layers': {'body': f'{nm}_body.png', 'neon': f'{nm}_neon.png'},
                'footprint': fp,
                'lights': [light],
                'neon': {'base': 1, 'hum': 0.06, 'speed': 0.7, 'flicker': {'rate': 0.02, 'dur': [0.05, 0.15], 'level': 0.55}},
            }
            # the anchor in the sheet's own pixels (the renderer scales by k)
            meta['anchor'] = [round(ox, 1), round(oy, 1)]
            (OUT / f'{nm}.json').write_text(json.dumps(meta))
            print(f'{nm}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]}')


if __name__ == '__main__':
    main()
