"""Mustafar rebuild, STAGE 06 — the high ground and the ending (docs/MUSTAFAR_REBUILD.md). BLOCKOUT.

    python3 tools/maps/mustafar_v2/stage06.py  ->  public/maps/mustafar_v2/stage06.json

The film (6:28 – the end): the platform comes alongside the bank; Obi-Wan leaps onto the black slope above it — "It's
over, Anakin. I have the high ground." — Anakin leaps over him and is cut down at the lava's edge below; Obi-Wan's
last words; the lava catches him. (The film's ending, kept: no other.)

Laid out on the river's far (−y) bank (1 tile = 1 m), so the river and Anakin below are nearer the camera and Obi-Wan
stands up the slope behind them, in view: x 112..136, y 134..147. ELEVATION: the top 1.4 m up (y 134..141), the slope
down to the shore over 4 m (its height in half-metre bands), the shore at the lava's level (y 145..147). A rock face
behind it all. The art: one pre-rendered picture of the whole bank (highground_bank.png), its anchor this corner (112, 147).
"""
from pathlib import Path
from _zone import box, deck, light, plate, wall_x, write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage06.json'

X0, X1 = 112, 136
Y0, Y1 = 134, 147  # (24 × 13 m: its picture fits one 1512 px image at the game's density 2)
TOP = 141  # the top's near edge
FOOT = 145  # the slope's foot (the shore: FOOT..Y1, at the lava's level)
ART = 'mf.highground.bank'  # the bank's picture (a groundImage: the delivered highground_bank.png, its anchor the near-left corner)
# the slope's height under the feet: eight half-metre bands from the crest down to the foot, 1.4 m over 4 m (the picture's
# slope is smooth; the bands are fine enough that a character climbing it reads as walking up it)
STEPS = [round(1.4 * (FOOT - (TOP + 0.5 * i + 0.25)) / (FOOT - TOP), 3) for i in range(8)]


def main():
    top_box, top_surf = deck(X0, Y0, X1, TOP, 1.4, '고지대 +1.4 m')
    boxes = [top_box]
    surfaces = [top_surf]
    for i, z in enumerate(STEPS):
        b, s = deck(X0, TOP + 0.5 * i, X1, TOP + 0.5 * (i + 1), z, '경사' if i == 3 else '')
        boxes.append(b)
        surfaces.append(s)
    boxes += [
        plate((X0 + X1) / 2, Y1 - 0.5, X1 - X0, 1, '용암 가장자리'),
        wall_x(X0, X1, Y0 - 0.2, 3.0, '바위 절벽'),
    ]
    for b in boxes:
        b['art'] = ART  # (the grey boxes go when the bank's picture is here)
    cx = (X0 + X1) / 2
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage06',
        'stage': 6,
        'title': '무스타파 · 고지대',
        'blockoutNote': 'BLOCKOUT: grey boxes stand in for the art (not requested yet)',
        'floor': [
            # the bank's picture, drawn as the ground (everyone near it stands on it or in front of it: the river side)
            {'id': 'bankArt', 'kind': 'groundImage', 'asset': ART, 'at': {'x': X0, 'y': Y1}},
            {'id': 'bank', 'kind': 'blockout', 'x0': X0, 'y0': Y0, 'x1': X1, 'y1': Y1, 'art': ART},
        ],
        'walk': [{'id': 'bank', 'rect': [X0 + 1, Y0 + 1, X1 - 1, Y1]}],
        'collision': [],
        'structures': [],
        'decor': [],
        'blockout': boxes,
        'surfaces': surfaces,
        'actors': {
            'highGround': {'x': cx, 'y': TOP + 1.4},  # where Obi-Wan lands: up the slope above the river
            'foot': {'x': cx - 1.1, 'y': Y1 - 0.8},  # where Anakin falls: the shore at the lava's edge below him
        },
        'triggers': [],
        'camera': {'x0': X0 - 4, 'y0': Y0 - 4, 'x1': X1 + 4, 'y1': Y1 + 8},
        'lights': [
            *[light(x, Y1 + 1.5, 0.3, (255, 140, 60), 220, 0.15) for x in range(X0 + 2, X1, 6)],  # the river's glow on the slope
            light(cx, Y0 + 3, 4, (200, 120, 90), 200, 0.02),
        ],
        'regions': [{'x': cx, 'y': (Y0 + Y1) / 2, 'r': 10, 'name': '무스타파 · 고지대'}],
    }
    write(OUT, m)
    print(f'{OUT}: bank {X1 - X0} x {Y1 - Y0} m, top 1.4 m')


if __name__ == '__main__':
    main()
