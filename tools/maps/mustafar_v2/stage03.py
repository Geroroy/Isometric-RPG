"""Mustafar rebuild, STAGE 03 — the control room (docs/MUSTAFAR_REBUILD.md). BLOCKOUT: grey boxes, no art yet.

    python3 tools/maps/mustafar_v2/stage03.py  ->  public/maps/mustafar_v2/stage03.json

The film (1:33 – 2:38): out of the conference room, through a short passage, into the facility's control room — the
consoles, the holo-tables, the shield generator Anakin's blade cuts open (the alarm; the shields begin to fail) — and
out onto the balcony over the lava (STAGE 04).

Laid out in the same world as STAGE 01–02 (1 tile = 1 m): the passage runs west 6 m from the conference room's new
−x door (x 44.9, y 96..100) to the control room, 18 × 18 m, x 20.9..38.9, y 88..106. Its far walls (−y over the lava,
−x) stand full height, its near walls (+y, +x) are cut low like the conference room's. ELEVATION: a gallery 0.6 m up
along the far wall (the consoles), its front edge railed but for two steps down in the middle. The lower floor is the
fighting floor (16 × 10 m less two holo-tables). Exits: the passage (+x wall) and the balcony door in the +y wall
(x 27..31), shut until the director opens it.
"""
from pathlib import Path
from _zone import FAR_H, NEAR_H, box, deck, light, wall_x, wall_y, write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage03.json'

# the passage from the conference room's −x door
JX0, JX1 = 38.9, 44.9
JY0, JY1 = 96, 100
# the control room
X0, X1 = 20.9, 38.9
Y0, Y1 = 88, 106
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
GALLERY = (Y0, 93, 0.6)  # its y0, y1 and height
STAIRS = (27.9, 31.9)  # the steps down from it (x: the gallery's middle, so its edge picture's gap is centred)
DOOR = (27.9, 31.9)  # the balcony door in the +y wall (x: centred, so the wall picture's gap is)


def blockout():
    g_box, g_surf = deck(X0, GALLERY[0], X1, GALLERY[1], GALLERY[2], '상부 회랑 +0.6 m')
    s1, s1s = deck(STAIRS[0], GALLERY[1], STAIRS[1], GALLERY[1] + 1, 0.4)
    s2, s2s = deck(STAIRS[0], GALLERY[1] + 1, STAIRS[1], GALLERY[1] + 2, 0.2)
    out = [
        # the floors' raised parts first (flat: drawn with the ground, in this order — the steps over the gallery's face)
        g_box, s1, s2,
        # the walls: far ones full height, near ones low (the door gaps left open)
        wall_x(X0, X1, Y0 - 0.2, FAR_H, '제어실 창 (용암 쪽)'),
        wall_y(Y0, Y1, X0 - 0.2, FAR_H, '제어실 벽'),
        wall_x(X0, DOOR[0], Y1 + 0.2, NEAR_H),
        wall_x(DOOR[1], X1, Y1 + 0.2, NEAR_H),
        box((DOOR[0] + DOOR[1]) / 2, Y1 + 0.2, DOOR[1] - DOOR[0], 0.3, NEAR_H, 'story', '발코니 문', id='balconyDoorLeaf'),
        wall_y(Y0, JY0, X1 + 0.2, NEAR_H),
        wall_y(JY1, Y1, X1 + 0.2, NEAR_H),
        # the passage
        wall_x(JX0, JX1, JY0 - 0.2, 3.5, '연결 통로'),
        wall_x(JX0, JX1, JY1 + 0.2, NEAR_H),
        # the shield generator on the −x wall (Anakin's cut opens it: the story's), the holo-tables, the gallery's consoles
        box(X0 + 1.1, 99, 1.4, 2.8, 1.8, 'story', '방어막 발생기', block=True, id='shieldCore'),
        box(28.5, 99.5, 1.6, 1.6, 0.9, 'furniture', '홀로 테이블', block=True),
        box(33.5, 99.5, 1.6, 1.6, 0.9, 'furniture', '홀로 테이블', block=True),
        box(25, Y0 + 1.3, 2.4, 0.8, 1.1, 'furniture', '콘솔', block=True, z=GALLERY[2]),
        box(34.5, Y0 + 1.3, 2.4, 0.8, 1.1, 'furniture', '콘솔', block=True, z=GALLERY[2]),
    ]
    return out, [g_surf, s1s, s2s]


def main():
    boxes, surfaces = blockout()
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage03',
        'stage': 3,
        'title': '무스타파 · 제어실',
        'blockoutNote': 'BLOCKOUT: grey boxes stand in for the art (not requested yet)',
        'floor': [
            {'id': 'passage', 'kind': 'blockout', 'x0': JX0, 'y0': JY0, 'x1': JX1, 'y1': JY1},
            {'id': 'control', 'kind': 'blockout', 'x0': X0, 'y0': Y0, 'x1': X1, 'y1': Y1},
        ],
        'walk': [
            {'id': 'passage', 'rect': [38, JY0, 45, JY1]},
            {'id': 'control', 'rect': [22, Y0 + 1, 38, Y1 - 1]},
            {'id': 'balconyDoorway', 'rect': [DOOR[0], Y1 - 1, DOOR[1], Y1 + 1]},
        ],
        'collision': [
            # the gallery's railed front edge, but for the steps
            {'id': 'galleryRailW', 'rect': [22, GALLERY[1] - 1, STAIRS[0], GALLERY[1]]},
            {'id': 'galleryRailE', 'rect': [STAIRS[1], GALLERY[1] - 1, 38, GALLERY[1]]},
            # the balcony door: shut until the shield generator is cut (the director opens it)
            {'id': 'balconyDoor', 'rect': [DOOR[0], Y1 - 1, DOOR[1], Y1 + 1], 'door': True},
        ],
        'structures': [],
        'decor': [],
        'blockout': boxes,
        'surfaces': surfaces,
        # the scene's places (src/game/mustafar/director.js)
        'actors': {
            'ctlAnakin': {'x': 35.5, 'y': 102.5},  # through the passage after the push, the fight goes on here
            'ctlObiwan': {'x': 31.0, 'y': 103.0},
            'core': {'x': X0 + 1.1, 'y': 99},  # the shield generator
            'balconyDoor': {'x': (DOOR[0] + DOOR[1]) / 2, 'y': Y1 - 0.6},
        },
        'triggers': [],
        'camera': {'x0': X0 - 2, 'y0': Y0 - 3, 'x1': JX1 + 2, 'y1': Y1 + 2},
        'lights': [
            *[light(x, Y0 - 1.0, 1.5, (255, 110, 40), 180, 0.1) for x in (X0 + 3, CX, X1 - 3)],  # the lava through the windows
            light(X0 + 1.6, 99, 1.2, (255, 70, 50), 120, 0.08),  # the shield generator's red
            light(28.5, 99.5, 1.4, (120, 200, 255), 90, 0.06),  # the holo-tables
            light(33.5, 99.5, 1.4, (120, 200, 255), 90, 0.06),
            light(CX, 97, 3.0, (220, 170, 120), 170, 0.02),
            light((JX0 + JX1) / 2, 98, 2.5, (220, 170, 120), 90, 0.02),
        ],
        'regions': [
            {'x': (JX0 + JX1) / 2, 'y': 98, 'r': 3, 'name': '무스타파 · 연결 통로'},
            {'x': CX, 'y': 97, 'r': 10, 'name': '무스타파 · 제어실'},
        ],
    }
    write(OUT, m)
    print(f'{OUT}: control room {X1 - X0:.0f} x {Y1 - Y0} m, {len(boxes)} blockout boxes')


if __name__ == '__main__':
    main()
