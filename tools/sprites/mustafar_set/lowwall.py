"""Mustafar rooms' near walls (reference/color_rots/image_31.png: a plinth and a pipe-run panel between two pillars):
bays of several lengths, pillar centre to pillar centre, in one atlas with their twins along the other axis.

    python3 tools/sprites/mustafar_set/lowwall.py -> public/sprites/mustafar/lowwall.{png,json}

The map (public/maps/mustafar.json) lays a room's near side out of them as a builder would: a pillar on the near corner
and on each doorway's jamb, the stretch between split into even bays of the nearest baked length, neighbouring bays
sharing their pillar (drawn twice on one spot). Each bay is the render shortened by taking columns out of its middle
(bake.py `cutx`: the part beyond moved up the foot line's slope); one scale for all — 1180 render px pillar to
pillar = 6 m, the panel 2.2 m tall (the pillars ~2.7, as the far walls' consoles); the face to +y (`mfWall<L>`), its
twin flipped to face +x (`mfWall<L>_y`); drawn at 4× (k 0.25). The anchor is the foot line's middle.

Each sprite also says where its pillars are, for joining pieces (worldgen.js MustafarArena.joinWalls: where two
pieces' end pillars meet, one of them is trimmed off so the pillar is drawn once): `pillars` the columns of the left
pillar's and the right pillar's inner sides (frame px; the render's at x 415 and 1405, through the bake's scale and
cut), `half` the pillar centres' distance from the anchor along the wall (m), `along` its axis (the image's left end
is −x along x, +y along y).

The atlas also carries the rooms' corner pieces (bake.py `mfWallCorner`, image_33, and `mfWallCornerIn`, image_34).

The atlas also carries the end piece that closes a room's near side at its far end (bake.py `mfWallEnd_y`, image_32,
and its twin `mfWallEnd`): one image for all the room walls.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import bake  # noqa: E402

OUT = bake.OUT
LENGTHS = [1.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
PX_M = 1180 / 6  # render px a metre along the wall (pillar centres at x 300 and 1480)
SLOPE = 0.27  # the foot line's slope on the render
FOOT = lambda x: 492 + (x - 300) * SLOPE  # noqa: E731


def pillar_sides(im):
    """The inner sides of a head-on piece's two pillars (the end piece): where its top, the wall's slope taken out,
    stands well above the panel's — the first such run's right side, the last's left side."""
    a = np.asarray(im)[..., 3] > 128
    h, w = a.shape
    top = np.array([np.argmax(a[:, c]) if a[:, c].any() else h for c in range(w)], float)
    ok = top < h
    r = top + 0.5 * np.arange(w)  # (along y on screen: its top rises to the right by half a px a px)
    tall = ok & (r < np.median(r[ok]) - 12)
    runs, c = [], 0
    while c < w:
        if tall[c]:
            s = c
            while c < w and tall[c]:
                c += 1
            if c - s > 8:
                runs.append((s, c))
        else:
            c += 1
    assert len(runs) >= 2, runs
    return runs[0][1], runs[-1][0]


def corner_pieces():
    """The rooms' corner pieces (bake.py's mfWallCorner, mfWallCornerIn) as atlas entries: no pillars to join."""
    out = []
    for key in ('mfWallCorner', 'mfWallCornerIn'):
        bake.bake('_' + key, bake.PIECES[key])
        meta = json.loads((OUT / f'_{key}.json').read_text())
        im = Image.open(OUT / meta['layers']['body'])
        im.load()
        (OUT / f'_{key}.json').unlink()
        for f in meta['layers'].values():
            (OUT / f).unlink()
        out.append((key, im, meta['anchor'], meta['footprint'], {}))
    return out


def main():
    bake.OVER = 4
    pieces = []
    for L in LENGTHS:
        d = (6 - L) * PX_M
        name = f'_wall{L}'
        right = 1480 - d
        P = dict(
            src='image_31.png',
            axis=((300, FOOT(300)), (right, FOOT(300) + (right - 300) * SLOPE)),
            span=(right - 300, L),
            height=(445, 2.2),
            ground=((300 + right) / 2, FOOT(300) + (right - 300) * SLOPE / 2),
            back=0,
            footprint=[[-L / 2, -0.5], [L / 2, -0.5], [L / 2, 0], [-L / 2, 0]],
            gain=0.9,
        )
        if d > 1:
            # (the columns between the left pillar's inner side and that + d taken out)
            P['cutx'] = (430, int(round(430 + d)), SLOPE)
        bake.bake(name, P)
        meta = json.loads((OUT / f'{name}.json').read_text())
        im = Image.open(OUT / meta['layers']['body'])
        (OUT / f'{name}.json').unlink()
        (OUT / meta['layers']['body']).unlink()
        key = f'mfWall{L:g}'
        # its pillars' inner sides: the render's columns scaled (the bake's x scale, no shear in x), less the crop
        right = 1480 - d
        sx = L * 20 * bake.OVER / (right - 300)
        bb0 = (300 + right) / 2 * sx - meta['anchor'][0]
        lc, rc = 415 * sx - bb0, (1405 - (d if d > 1 else 0)) * sx - bb0
        w = im.width
        pieces.append((key, im, meta['anchor'], meta['footprint'], {'pillars': [round(lc, 1), round(rc, 1)], 'half': L / 2, 'along': 'x'}))
        # the twin facing +x: flipped, its footprint transposed
        fl = im.transpose(Image.FLIP_LEFT_RIGHT)
        pieces.append((key + '_y', fl, [im.width - meta['anchor'][0], meta['anchor'][1]], [[y, x] for x, y in meta['footprint']], {'pillars': [round(w - rc, 1), round(w - lc, 1)], 'half': L / 2, 'along': 'y'}))
    # the end piece (bake.py's mfWallEnd_y: baked, then taken into the atlas)
    P = bake.PIECES['mfWallEnd_y']
    bake.bake('_wallend', {k: v for k, v in P.items() if k != 'mirror'})
    meta = json.loads((OUT / '_wallend.json').read_text())
    im = Image.open(OUT / meta['layers']['body'])
    (OUT / '_wallend.json').unlink()
    (OUT / meta['layers']['body']).unlink()
    lc, rc = pillar_sides(im)
    w = im.width
    pieces.append(('mfWallEnd_y', im, meta['anchor'], meta['footprint'], {'pillars': [lc, rc], 'half': 1.1625, 'along': 'y'}))
    fl = im.transpose(Image.FLIP_LEFT_RIGHT)
    pieces.append(('mfWallEnd', fl, [im.width - meta['anchor'][0], meta['anchor'][1]], [[y, x] for x, y in meta['footprint']], {'pillars': [w - rc, w - lc], 'half': 1.1625, 'along': 'x'}))
    # the corner pieces (bake.py's mfWallCorner, mfWallCornerIn): baked, then taken into the atlas (their lamps
    # stay painted at full strength; no glow layer: the atlas has none, and the artifact no file to spare)
    pieces += corner_pieces()
    W = 2048
    x = y = rowh = 0
    place = []
    for key, im, anc, fp, pil in pieces:
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + 2, 0
        place.append((key, im, x, y, anc, fp, pil))
        x += im.width + 2
        rowh = max(rowh, im.height)
    atlas = Image.new('RGBA', (W, y + rowh))
    sprites = {}
    for key, im, px, py, anc, fp, pil in place:
        atlas.paste(im, (px, py))
        sprites[key] = {'rect': [px, py, im.width, im.height], 'anchor': anc, 'k': 1 / bake.OVER, 'footprint': fp, 'lights': [], **pil}
    atlas.save(OUT / 'lowwall.png', optimize=True)
    (OUT / 'lowwall.json').write_text(json.dumps({'page': 'lowwall.png', 'sprites': sprites}))
    print('lowwall.png', atlas.size, len(sprites), 'sprites')


if __name__ == '__main__':
    main()
