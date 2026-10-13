"""Mustafar cargo: nine containers from a cut-out sheet (reference/color_rots/image_23.png, 3x3, already transparent):
strapped crates long and short, a red capsule on its side, a cube, a tall canister, a red domed tank, a low drum, a
caged sphere and a caged capsule — the facility's stores, stacked as in the film's sets.

    python3 tools/sprites/mustafar_cargo/bake.py -> public/sprites/mustafar/cargo.{png,json}

- each piece seen near the game's own angle (a three-quarter view from above): one even scale from its real size —
  the screen width of a box a by b metres is (a + b) x 20 px (ART_GUIDE.md: 1 m along an axis = 20 px), checked
  against its height (Z_PX 24.5 a metre: the 1.1 m cube comes out 49 px, as the projection gives)
- the anchor on the ground under the piece's middle: (a + b) x 5 px above its lowest point
- a soft contact shadow baked under each, pushed away from the key light (upper left, ART_GUIDE.md §3)
- all nine packed on one atlas (the artifact's file limit); the JSON lists each piece's rectangle, anchor and
  footprint; the body darkened a touch to the facility's metal, the little red and blue lamps kept bright
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'reference/color_rots/image_23.png'
OUT = ROOT / 'public/sprites/mustafar'
OVER = 4  # px per game px (the remastered picture is up to 3× the game's pixels)
GAIN = 0.85
# name: (box in the sheet, footprint a x b metres (a along the piece's length), height for the shadow)
PIECES = {
    'cgCrateL': ((60, 25, 525, 345), (2.6, 1.2), 1.1),
    'cgCrateS': ((606, 70, 947, 329), (1.8, 1.1), 1.0),
    'cgCapsule': ((1099, 22, 1507, 339), (2.2, 1.2), 1.2),
    'cgCube': ((124, 370, 421, 697), (1.1, 1.1), 1.1),
    'cgCanister': ((639, 341, 855, 695), (1.0, 1.0), 1.7),
    'cgTank': ((1106, 373, 1402, 703), (1.6, 1.6), 1.6),
    'cgDrum': ((156, 769, 373, 958), (0.95, 0.95), 0.5),
    'cgCage': ((593, 694, 880, 999), (1.2, 1.2), 1.3),
    'cgCageCap': ((1088, 722, 1458, 996), (2.0, 1.1), 1.1),
}


def main():
    src = Image.open(SRC).convert('RGBA')
    sprites = []
    for name, (box, (a, b), h) in PIECES.items():
        im = src.crop(box)
        bb = im.getbbox()
        im = im.crop(bb)
        arr = np.asarray(im).astype(np.float32) / 255
        r, g, bl = arr[..., 0], arr[..., 1], arr[..., 2]
        lamp = ((r > 0.6) & (r > g * 1.8)) | ((bl > 0.6) & (bl > r * 1.6))
        arr[..., :3] *= np.where(lamp[..., None], 1, GAIN)
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        w = round((a + b) * 20 * OVER)
        hgt = round(im.height * w / im.width)
        im = im.resize((w, hgt), Image.LANCZOS)
        # contact shadow: the silhouette's bottom part squashed onto the ground, offset down-right, soft
        pad = 8 * OVER
        sh_h = round(h * 0.6 * 24.5 * OVER)
        canvas = Image.new('RGBA', (w + pad * 2 + sh_h, hgt + pad * 2), (0, 0, 0, 0))
        al = im.getchannel('A')
        foot = al.crop((0, hgt - round((a + b) * 10 * OVER), w, hgt)).point(lambda v: 255 if v > 60 else 0)
        sh = Image.new('L', canvas.size, 0)
        sh.paste(foot, (pad + round(sh_h * 0.55), pad + hgt - foot.height + round(sh_h * 0.25)))
        sh = sh.filter(ImageFilter.GaussianBlur(3 * OVER)).point(lambda v: int(v * 0.55))
        shadow = Image.new('RGBA', canvas.size, (8, 6, 5, 0))
        shadow.putalpha(sh)
        canvas.alpha_composite(shadow)
        canvas.alpha_composite(im, (pad, pad))
        canvas = canvas.crop(canvas.getbbox())
        ax = pad + w / 2
        ay = pad + hgt - (a + b) * 5 * OVER
        sprites.append((name, canvas, ax, ay, a, b))
    # pack in a row of shelves
    W = 1024
    x = y = rowh = 0
    place = []
    for name, im, ax, ay, a, b in sprites:
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + 2, 0
        place.append((name, im, x, y, ax, ay, a, b))
        x += im.width + 2
        rowh = max(rowh, im.height)
    atlas = Image.new('RGBA', (W, y + rowh))
    meta = {}
    for name, im, px, py, ax, ay, a, b in place:
        atlas.paste(im, (px, py))
        meta[name] = {'rect': [px, py, im.width, im.height], 'anchor': [round(ax, 1), round(ay, 1)], 'k': 1 / OVER,
                      'footprint': [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]], 'lights': []}
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / 'cargo.png', optimize=True)
    (OUT / 'cargo.json').write_text(json.dumps({'page': 'cargo.png', 'sprites': meta}))
    print('cargo.png', atlas.size, len(meta), 'pieces')


if __name__ == '__main__':
    main()
