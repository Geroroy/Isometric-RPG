"""Mustafar rooms' near walls (reference/color_rots/image_31.png: a plinth and a pipe-run panel between two pillars):
bays of several lengths, pillar centre to pillar centre, in one atlas with their twins along the other axis.

    python3 tools/sprites/mustafar_set/lowwall.py -> public/sprites/mustafar/lowwall.{png,json}

The map (public/maps/mustafar.json) lays a room's near side out of them as a builder would: a pillar on the near corner
and on each doorway's jamb, the stretch between split into even bays of the nearest baked length, neighbouring bays
sharing their pillar (drawn twice on one spot). Each bay is the render shortened by taking columns out of its middle
(bake.py `cutx`: the part beyond moved up the foot line's slope); one scale for all — 1180 render px pillar to
pillar = 6 m, the panel 2.2 m tall (the pillars ~2.7, as the far walls' consoles); the face to +y (`mfWall<L>`), its
twin flipped to face +x (`mfWall<L>_y`); drawn at 4× (k 0.25). The anchor is the foot line's middle.

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
        pieces.append((key, im, meta['anchor'], meta['footprint']))
        # the twin facing +x: flipped, its footprint transposed
        fl = im.transpose(Image.FLIP_LEFT_RIGHT)
        pieces.append((key + '_y', fl, [im.width - meta['anchor'][0], meta['anchor'][1]], [[y, x] for x, y in meta['footprint']]))
    # the end piece (bake.py's mfWallEnd_y: baked, then taken into the atlas)
    P = bake.PIECES['mfWallEnd_y']
    bake.bake('_wallend', {k: v for k, v in P.items() if k != 'mirror'})
    meta = json.loads((OUT / '_wallend.json').read_text())
    im = Image.open(OUT / meta['layers']['body'])
    (OUT / '_wallend.json').unlink()
    (OUT / meta['layers']['body']).unlink()
    pieces.append(('mfWallEnd_y', im, meta['anchor'], meta['footprint']))
    fl = im.transpose(Image.FLIP_LEFT_RIGHT)
    pieces.append(('mfWallEnd', fl, [im.width - meta['anchor'][0], meta['anchor'][1]], [[y, x] for x, y in meta['footprint']]))
    W = 2048
    x = y = rowh = 0
    place = []
    for key, im, anc, fp in pieces:
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + 2, 0
        place.append((key, im, x, y, anc, fp))
        x += im.width + 2
        rowh = max(rowh, im.height)
    atlas = Image.new('RGBA', (W, y + rowh))
    sprites = {}
    for key, im, px, py, anc, fp in place:
        atlas.paste(im, (px, py))
        sprites[key] = {'rect': [px, py, im.width, im.height], 'anchor': anc, 'k': 1 / bake.OVER, 'footprint': fp, 'lights': []}
    atlas.save(OUT / 'lowwall.png', optimize=True)
    (OUT / 'lowwall.json').write_text(json.dumps({'page': 'lowwall.png', 'sprites': sprites}))
    print('lowwall.png', atlas.size, len(sprites), 'sprites')


if __name__ == '__main__':
    main()
