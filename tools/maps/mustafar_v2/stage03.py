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
(x 27.9..31.9), an open gap in the low wall.
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
CORE = (X0 + 0.8, 99)  # the shield generator against the −x wall
HOLO = [(28.5, 99.5), (33.5, 99.5)]  # the holo-tables
CONSOLES = [(25, Y0 + 1.6), (34.5, Y0 + 1.6)]  # on the gallery


def blockout():
    """The grey boxes standing in for the art until it is delivered (each names its `art`: the box goes when that comes)."""
    # the gallery: its floor is a picture drawn 0.6 m up (the zone's `floor`); until its front edge comes, a thin grey
    # face stands in for that edge only (not a box over the whole gallery: it would hide the floor's picture)
    _, g_surf = deck(X0, GALLERY[0], X1, GALLERY[1], GALLERY[2])
    g_box = box(CX, GALLERY[1] - 0.05, X1 - X0, 0.1, GALLERY[2], 'deck', '상부 회랑 가장자리 +0.6 m', flat=True, art='mf.control.gallery_edge')
    s1, s1s = deck(STAIRS[0], GALLERY[1], STAIRS[1], GALLERY[1] + 1, 0.4)
    s2, s2s = deck(STAIRS[0], GALLERY[1] + 1, STAIRS[1], GALLERY[1] + 2, 0.2)
    s1['art'] = s2['art'] = 'mf.control.ctl_stairs'
    a = lambda b, art: {**b, 'art': art}  # noqa: E731
    out = [
        # the floors' raised parts first (flat: drawn with the ground, in this order — the steps over the gallery's face)
        g_box, s1, s2,
        # the walls: far ones full height, near ones low (the door gaps left open)
        a(wall_x(X0, X1, Y0 - 0.2, FAR_H, '제어실 창 (용암 쪽)'), 'mf.control.wall_window'),
        a(wall_y(Y0, Y1, X0 - 0.2, FAR_H, '제어실 벽'), 'mf.control.wall_side'),
        a(wall_x(X0, DOOR[0], Y1 + 0.2, NEAR_H), 'mf.control.wall_front_low'),
        a(wall_x(DOOR[1], X1, Y1 + 0.2, NEAR_H), 'mf.control.wall_front_low'),
        a(wall_y(Y0, JY0, X1 + 0.2, NEAR_H), 'mf.control.wall_entry_low'),
        a(wall_y(JY1, Y1, X1 + 0.2, NEAR_H), 'mf.control.wall_entry_low'),
        # the passage
        a(wall_x(JX0, JX1, JY0 - 0.2, 3.5, '연결 통로'), 'mf.passage.wall_back'),
        a(wall_x(JX0, JX1, JY1 + 0.2, NEAR_H), 'mf.passage.wall_front_low'),
        # the shield generator on the −x wall (Anakin's cut opens it: the story's), the holo-tables, the gallery's consoles
        a(box(*CORE, 1.4, 2.8, 1.8, 'story', '방어막 발생기', block=True), 'mf.control.ctl_shield_generator'),
        *[a(box(*h, 1.6, 1.6, 0.9, 'furniture', '홀로 테이블', block=True), 'mf.control.ctl_holo_table') for h in HOLO],
        *[a(box(*c, 2.4, 1.0, 1.6, 'furniture', '콘솔', block=True, z=GALLERY[2]), 'mf.room.console') for c in CONSOLES],
    ]
    return out, [g_surf, s1s, s2s]


def structures():
    """The art, where it stands (each drawn once delivered — docs/asset_requests/chatgpt_stage03_control.md)."""
    return [
        {'asset': 'mf.control.wall_window', 'x': CX, 'y': Y0},
        {'asset': 'mf.control.wall_side', 'x': X0, 'y': CY},
        {'asset': 'mf.control.wall_front_low', 'x': CX, 'y': Y1},  # (its gap: the balcony door, x 27.9..31.9)
        {'asset': 'mf.control.wall_entry_low', 'x': X1, 'y': CY},  # (its gap: the passage, y 96..100)
        {'asset': 'mf.control.gallery_edge', 'x': CX, 'y': GALLERY[1]},  # (its gap: the steps)
        {'asset': 'mf.passage.wall_back', 'x': (JX0 + JX1) / 2, 'y': JY0},
        {'asset': 'mf.passage.wall_front_low', 'x': (JX0 + JX1) / 2, 'y': JY1},
        {'asset': 'mf.control.ctl_stairs', 'x': CX, 'y': GALLERY[1] + 1},
        {'asset': 'mf.control.ctl_shield_generator', 'x': CORE[0], 'y': CORE[1], 'block': True, 'id': 'shieldCore'},
        *[{'asset': 'mf.control.ctl_holo_table', 'x': h[0], 'y': h[1], 'block': True} for h in HOLO],
        # the consoles up on the gallery: the conference room's (the user's, reused)
        *[{'asset': 'mf.room.console', 'x': c[0], 'y': c[1], 'z': GALLERY[2], 'block': True} for c in CONSOLES],
    ]


def main():
    boxes, surfaces = blockout()
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage03',
        'stage': 3,
        'title': '무스타파 · 제어실',
        'blockoutNote': 'BLOCKOUT: grey boxes stand in for the art (not requested yet)',
        # the floors: top-down pictures (the debug grid until they come); the gallery's drawn 0.6 m up
        'floor': [
            {'id': 'passage', 'kind': 'texturedRect', 'x0': JX0, 'y0': JY0, 'x1': JX1, 'y1': JY1, 'asset': 'mf.passage.floor', 'fallback': 'grid'},
            {'id': 'gallery', 'kind': 'texturedRect', 'x0': X0, 'y0': Y0, 'x1': X1, 'y1': GALLERY[1], 'z': GALLERY[2], 'asset': 'mf.control.gallery_floor', 'fallback': 'grid'},
            {'id': 'control', 'kind': 'texturedRect', 'x0': X0, 'y0': GALLERY[1], 'x1': X1, 'y1': Y1, 'asset': 'mf.control.floor', 'fallback': 'grid'},
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
            # (the balcony door is an open gap in the low wall: no invisible blocker — the fight may spill out onto the
            # terrace; the shield generator's scene takes it on from wherever it is)
        ],
        'structures': structures(),
        'decor': [],
        'blockout': boxes,
        'surfaces': surfaces,
        # the scene's places (src/game/mustafar/director.js)
        'actors': {
            'ctlAnakin': {'x': 35.5, 'y': 102.5},  # through the passage after the push, the fight goes on here
            'ctlObiwan': {'x': 31.0, 'y': 103.0},
            'core': {'x': CORE[0], 'y': CORE[1]},  # the shield generator
            'balconyDoor': {'x': (DOOR[0] + DOOR[1]) / 2, 'y': Y1 - 0.6},
        },
        'triggers': [],
        'camera': {'x0': X0 - 2, 'y0': Y0 - 3, 'x1': JX1 + 2, 'y1': Y1 + 2},
        'lights': [
            *[light(x, Y0 - 1.0, 1.5, (255, 110, 40), 180, 0.1) for x in (X0 + 3, CX, X1 - 3)],  # the lava through the windows
            light(CORE[0] + 0.8, CORE[1], 1.2, (255, 150, 60), 120, 0.08),  # the shield generator's amber
            *[light(h[0], h[1], 1.4, (255, 190, 120), 80, 0.04) for h in HOLO],  # the holo-tables (projectors off: amber, not blue)
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
