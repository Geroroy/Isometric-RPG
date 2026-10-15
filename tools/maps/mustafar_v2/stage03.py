"""Mustafar rebuild, STAGE 03 — the control room and the facility's interior entry corridor (docs/MUSTAFAR_REBUILD.md).

    python3 tools/maps/mustafar_v2/stage03.py  ->  public/maps/mustafar_v2/stage03.json

The film's order (docs/MUSTAFAR_REBUILD.md "영화 대조 1차"): landing pad → the connecting deck (STAGE 01's corridor
pictures, out in the open) → the facility door → an INTERIOR entry corridor (the film's repeated slanted frames, its
walls with thickness) → the control room (consoles, screens) → the conference room (STAGE 02, through a side passage
off this corridor) → back to the control room — the shield generator Anakin's blade cuts open (the alarm) — and out
onto the balcony over the lava (STAGE 04). One control room, visited twice (not two copies of it).

Laid out in the same world as STAGE 01–02 (1 tile = 1 m): the interior corridor runs west 22 m from the facility door
(x 60.9, the connecting deck's end) to the control room's entry (x 38.9), 4 m wide (y 96..100: the control room's entry
gap and the door's), narrower than the 6 m deck outside. Its first 18 m from the control room are the passage's
delivered pictures (floor 6 x 4 m, back wall, low front wall) in three sections; the last 4 m by the door — where the
side passage to the conference room opens in its far wall — and the slanted frames are BLOCKOUT (grey, requested:
docs/asset_requests/chatgpt_film_pass1.md). The control room, 18 x 18 m, x 20.9..38.9, y 88..106: far walls (−y over
the lava, −x) full height, near walls (+y, +x) cut low. ELEVATION: a gallery 0.6 m up along the far wall, two steps down
in the middle. Laid out after the film's frame 12920 (reference/mustafar_reference_pack_pass1): a long central table on
the lower floor (blockout, requested), the wall consoles up behind the step (the delivered console reused: two banks of
two on the gallery), the shield generator; the corridor's door between thick slanted pillars (12911, 12915: blockout).
Exits: the corridor (+x wall) and the balcony door in the +y wall (x 27.9..31.9), an open gap in the low wall.
ESTIMATED: in the film the corridor's door is in the screen wall itself; here it is in the +x wall (the delivered
window wall has no door) — the step and the consoles stand along the far wall as in the frame.
"""
from pathlib import Path
from _zone import FAR_H, NEAR_H, box, deck, light, wall_x, wall_y, write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage03.json'

# the interior entry corridor, from the control room's entry to the facility door (STAGE 01's connecting deck beyond)
JX0, JX1 = 38.9, 60.9
JY0, JY1 = 96, 100
PS = 6  # the passage's delivered pictures: a 6 m section (floor 6 x 4, back wall, low front wall)
SECTIONS = [JX0 + PS * i for i in range(3)]  # their west ends: x 38.9, 44.9, 50.9 (the corridor's first 18 m)
JUNCTION = (SECTIONS[-1] + PS, JX1)  # the last 4 m by the door (x 56.9..60.9): blockout
SIDE = (57.9, JX1)  # the side passage's mouth in the far wall (to the conference room: STAGE 02)
FRAMES = [41.9, 44.9, 47.9, 50.9, 53.9, 56.9]  # the film's slanted frames along the walls, every 3 m (blockout)
# the control room
X0, X1 = 20.9, 38.9
Y0, Y1 = 88, 106
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
GALLERY = (Y0, 93, 0.6)  # its y0, y1 and height
STAIRS = (27.9, 31.9)  # the steps down from it (x: the gallery's middle, so its edge picture's gap is centred)
DOOR = (27.9, 31.9)  # the balcony door in the +y wall (x: centred, so the wall picture's gap is)
CORE = (X0 + 0.8, 99)  # the shield generator against the −x wall
# the film's control room (reference/mustafar_reference_pack_pass1, frame 12920): a long central holo-table on the
# lower floor, the wall's consoles and big screens behind a raised step (here the gallery), the corridor's door between
# thick slanted pillars (12911, 12915). The table: BLOCKOUT (requested), 7 x 2 m, 1 m tall — its length against the
# figures in 12920 is about four of them lying down, its top at their hips: relative, not measured. The round
# holo-tables are not in the film's frames: not placed (their picture kept in the manifest).
TABLE = (31.4, 101.0, 7.0, 2.0, 1.0)  # x, y, length along x, depth, height
# the consoles (the conference room's delivered console, 2.4 x 1 m, facing +y), in banks of two side by side, up on
# the gallery either side of the steps (the film's wall consoles under the screens)
BANKS_UP = [(23.3, 25.7), (34.1, 36.5)]
UP_Y = Y0 + 1.6
PILLARS = [(X1 + 0.1, JY0 - 0.45), (X1 + 0.1, JY1 + 0.45)]  # the entry's slanted door pillars (blockout), cut low


def consoles():
    return [(x, UP_Y) for b in BANKS_UP for x in b]


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
    up = consoles()
    jm = (JUNCTION[0] + JUNCTION[1]) / 2
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
        # the corridor's delivered sections
        *[a(wall_x(x, x + PS, JY0 - 0.2, 3.5, '입구 복도'), 'mf.passage.wall_back') for x in SECTIONS],
        *[a(wall_x(x, x + PS, JY1 + 0.2, NEAR_H), 'mf.passage.wall_front_low') for x in SECTIONS],
        # its last 4 m by the door: a pier of the far wall beside the side passage's mouth, the low near wall
        a(wall_x(JUNCTION[0], SIDE[0], JY0 - 0.2, 3.5, ''), 'mf.corridor.junction_pier'),
        a(wall_x(JUNCTION[0], JUNCTION[1], JY1 + 0.2, NEAR_H, ''), 'mf.corridor.junction_wall_low'),
        # the film's slanted frames (12877, 12887): ribs standing out from the walls every 3 m, full height on the far
        # side, their cut bases on the near side (the camera's): a blockout until their pictures come (axis boxes: the
        # slant is the art's)
        *[a(box(x, JY0 + 0.15, 0.35, 0.5, 3.3, 'wall', '프레임' if i == 0 else ''), 'mf.corridor.frame_far') for i, x in enumerate(FRAMES)],
        *[a(box(x, JY1 - 0.15, 0.35, 0.5, 0.9, 'wall', ''), 'mf.corridor.frame_near') for x in FRAMES],
        # the shield generator on the −x wall (Anakin's cut opens it: the story's), the holo-table, the consoles
        a(box(*CORE, 1.4, 2.8, 1.8, 'story', '방어막 발생기', block=True), 'mf.control.ctl_shield_generator'),
        a(box(TABLE[0], TABLE[1], TABLE[2], TABLE[3], TABLE[4], 'furniture', '중앙 홀로 테이블', block=True), 'mf.control.ctl_long_table'),
        *[a(box(*c, 2.4, 1.0, 1.6, 'furniture', '콘솔', block=True, z=GALLERY[2]), 'mf.room.console') for c in up],
        *[a(box(x, y, 0.8, 0.9, 1.3, 'wall', '문틀 기둥' if i == 0 else ''), 'mf.control.ctl_door_pillar') for i, (x, y) in enumerate(PILLARS)],
    ]
    return out, [g_surf, s1s, s2s], jm


def structures():
    """The art, where it stands (each drawn once delivered — docs/asset_requests/chatgpt_stage03_control.md)."""
    up = consoles()
    return [
        {'asset': 'mf.control.wall_window', 'x': CX, 'y': Y0},
        {'asset': 'mf.control.wall_side', 'x': X0, 'y': CY},
        {'asset': 'mf.control.wall_front_low', 'x': CX, 'y': Y1},  # (its gap: the balcony door, x 27.9..31.9)
        {'asset': 'mf.control.wall_entry_low', 'x': X1, 'y': CY},  # (its gap: the corridor, y 96..100)
        {'asset': 'mf.control.gallery_edge', 'x': CX, 'y': GALLERY[1]},  # (its gap: the steps)
        # the corridor: the passage's pictures, section by section
        *[{'asset': 'mf.passage.wall_back', 'x': x + PS / 2, 'y': JY0} for x in SECTIONS],
        *[{'asset': 'mf.passage.wall_front_low', 'x': x + PS / 2, 'y': JY1} for x in SECTIONS],
        {'asset': 'mf.control.ctl_stairs', 'x': CX, 'y': GALLERY[1] + 1},
        {'asset': 'mf.control.ctl_shield_generator', 'x': CORE[0], 'y': CORE[1], 'block': True, 'id': 'shieldCore'},
        # the consoles: the conference room's (the user's, reused), up on the gallery
        *[{'asset': 'mf.room.console', 'x': c[0], 'y': c[1], 'z': GALLERY[2], 'block': True} for c in up],
    ]


def main():
    boxes, surfaces, jm = blockout()
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage03',
        'stage': 3,
        'title': '무스타파 · 제어실',
        'blockoutNote': 'BLOCKOUT: the corridor\'s frames and its last 4 m by the door (grey boxes: requested)',
        # the floors: top-down pictures (the debug grid until they come); the gallery's drawn 0.6 m up
        'floor': [
            *[{'id': f'corridor{i}', 'kind': 'texturedRect', 'x0': x, 'y0': JY0, 'x1': x + PS, 'y1': JY1, 'asset': 'mf.passage.floor', 'fallback': 'grid'} for i, x in enumerate(SECTIONS)],
            {'id': 'junction', 'kind': 'texturedRect', 'x0': JUNCTION[0], 'y0': JY0, 'x1': JUNCTION[1], 'y1': JY1, 'asset': 'mf.corridor.junction_floor', 'fallback': 'grid'},
            {'id': 'gallery', 'kind': 'texturedRect', 'x0': X0, 'y0': Y0, 'x1': X1, 'y1': GALLERY[1], 'z': GALLERY[2], 'asset': 'mf.control.gallery_floor', 'fallback': 'grid'},
            {'id': 'control', 'kind': 'texturedRect', 'x0': X0, 'y0': GALLERY[1], 'x1': X1, 'y1': Y1, 'asset': 'mf.control.floor', 'fallback': 'grid'},
        ],
        'walk': [
            {'id': 'corridor', 'rect': [38, JY0, 62, JY1]},
            {'id': 'control', 'rect': [22, Y0 + 1, 38, Y1 - 1]},
            {'id': 'balconyDoorway', 'rect': [DOOR[0], Y1 - 1, DOOR[1], Y1 + 1]},
        ],
        'collision': [
            # the gallery's railed front edge, but for the steps
            {'id': 'galleryRailW', 'rect': [22, GALLERY[1] - 1, STAIRS[0], GALLERY[1]]},
            {'id': 'galleryRailE', 'rect': [STAIRS[1], GALLERY[1] - 1, 38, GALLERY[1]]},
            # the facility door at the corridor's east end (its picture: STAGE 01's corridor_wall_end), shut until the
            # director opens it (the fight reaches it from the connecting deck)
            {'id': 'facilityDoor', 'rect': [60, JY0, 62, JY1], 'door': True},
            # (the balcony door is an open gap in the low wall: no invisible blocker — the fight may spill out onto the
            # terrace; the shield generator's scene takes it on from wherever it is)
        ],
        'structures': structures(),
        'decor': [],
        'blockout': boxes,
        'surfaces': surfaces,
        # the scene's places (src/game/mustafar/director.js, route.js)
        'actors': {
            'corrAnakin': {'x': 57.6, 'y': 98.4},  # through the facility door, the fight goes on in the corridor
            'corrObiwan': {'x': 54.6, 'y': 97.8},
            'ctlEntry': {'x': 39.6, 'y': 98},  # the corridor's west end: the control room's entry
            'ctlAnakin': {'x': 36.2, 'y': 98.6},  # in through the entry, the fight goes on among the consoles
            'ctlObiwan': {'x': 32.0, 'y': 98.4},  # (north of the central table)
            'core': {'x': CORE[0], 'y': CORE[1]},  # the shield generator
            'balconyDoor': {'x': (DOOR[0] + DOOR[1]) / 2, 'y': Y1 - 0.6},
        },
        'triggers': [],
        'cameras': [
            {'x0': X0 - 2, 'y0': Y0 - 3, 'x1': X1 + 2, 'y1': Y1 + 2},
            {'x0': JX0, 'y0': JY0 - 3, 'x1': JX1 + 1, 'y1': JY1 + 2},
        ],
        'lights': [
            *[light(x, Y0 - 1.0, 1.5, (255, 110, 40), 180, 0.1) for x in (X0 + 3, CX, X1 - 3)],  # the lava through the windows
            light(CORE[0] + 0.8, CORE[1], 1.2, (255, 150, 60), 120, 0.08),  # the shield generator's amber
            light(TABLE[0], TABLE[1], 1.4, (255, 190, 120), 110, 0.04),  # the table (its holograms: a later effect — amber here, no blue baked in)
            *[light(x, UP_Y + 0.9, 1.6, (255, 175, 90), 70, 0.04) for b in BANKS_UP for x in b],  # the wall consoles' screens
            light(CX, 100, 3.0, (220, 170, 120), 170, 0.02),
            *[light(x + PS / 2, 98, 2.5, (220, 170, 120), 90, 0.02) for x in SECTIONS],  # the corridor's ceiling lamps
            light(jm, 98, 2.5, (220, 170, 120), 90, 0.02),
        ],
        # (the corridor's first: the control room's circle reaches its west end)
        'regions': [
            *[{'x': x, 'y': 98, 'r': 3.1, 'name': '무스타파 · 입구 복도'} for x in (42.4, 48.4, 54.4, 59.4)],
            {'x': CX, 'y': 97, 'r': 10, 'name': '무스타파 · 제어실'},
        ],
    }
    write(OUT, m)
    print(f'{OUT}: corridor {JX1 - JX0:.0f} m, control room {X1 - X0:.0f} x {Y1 - Y0} m, {len(boxes)} blockout boxes')


if __name__ == '__main__':
    main()
