"""Mustafar rebuild, STAGE 02 — the Separatist conference room (docs/MUSTAFAR_REBUILD.md).

    python3 tools/maps/mustafar_v2/stage02.py  ->  public/maps/mustafar_v2/stage02.json

The same layers as STAGE 01's zone (stage01.py), in the same world. The film's order puts this room AFTER the control
room (docs/MUSTAFAR_REBUILD.md "영화 대조 1차": landing pad → corridor → control room → conference room), so it is no
longer the room behind the facility door: it lies north of STAGE 03's interior corridor (y 96..100), 16 x 12 m,
x 41.9..57.9, y 80..92, its window wall to −y over the lava, its plain side wall to −x, its two near walls cut low —
the +x one with the door's 4 m gap (y 84..88), which opens onto a SIDE PASSAGE (3 x 12 m, x 57.9..60.9, y 84..96) running
down to the corridor just inside the facility door. ESTIMATED: the film shows neither where this room's door is nor how
it joins the corridor; this is the smallest connection the delivered walls allow (their only door is in the +x wall).
4 m between the room and the corridor: the corridor's far wall (3.5 m) hides the ground up to 4.3 m behind it on
screen, and the room's south aisle — where the push is — must stay in view.
The passage is BLOCKOUT (requested: docs/asset_requests/chatgpt_film_pass1.md).

The art is external (public/assets/mustafar/interiors, docs/asset_requests/chatgpt_stage02_conference.md): the floor a
top-down picture, the walls straight-on pictures the engine stands up (wallElevation), the furniture 2:1 sprites drawn
on guides. The room's size is the delivered pictures' (16 x 12 m: not changed — a narrower room needs new walls and
floor). The film (reference/mustafar_reference_pack_pass1, frames 13142, 13148; the set photo): a very long table down
the room's length — two figures lying end to end cover well under half of it — with high-backed chairs packed close in
an unbroken row down each side, and only a narrow aisle between the chairs and the slanted window pillars. So the
delivered table stands twice end to end (12 m: its single long version requested, docs/asset_requests/
chatgpt_film_pass1.md), the chairs 1 m apart down its whole length (how many the film hides is not known: this is a
row, not a count), the aisles what the room's walls leave. Its ends stay clear, the ways up onto its top
(`reserved.tableTop`, for a later step — the duel does not use it yet).
"""
from pathlib import Path
from _zone import FAR_H, NEAR_H, box, light, wall_x, wall_y, write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage02.json'

X0, X1 = 41.9, 57.9
Y0, Y1 = 80, 92
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2  # (49.9, 86): the door's middle is y 86
TABLE = (CX, CY)
PIECES = [-3, 3]  # the delivered 6 m table, twice end to end
TABLE_HALF = (6, 1)  # the long table's footprint (12 x 2 m), its top 0.8 m up (the delivered table's occlusion height)
CHAIRS = [-5.5 + i for i in range(12)]  # along the table (12 m), 1 m apart, either side 0.6 m off its edge
# the side passage from the room's door down to the corridor (STAGE 03, y 96..100)
SX0, SX1 = X1, 60.9
SY0, SY1 = 84, 96


def structures():
    out = [
        # the walls, on their base lines
        {'asset': 'mf.room.wall_window', 'x': CX, 'y': Y0},
        {'asset': 'mf.room.wall_side', 'x': X0, 'y': CY},
        {'asset': 'mf.room.wall_front_low', 'x': CX, 'y': Y1},
        {'asset': 'mf.room.wall_door_low', 'x': X1, 'y': CY},
        # the council's table, its chairs either side (a: facing +y, on the far side; b: facing −y, the near side)
        *[{'asset': 'mf.room.table', 'x': TABLE[0] + dx, 'y': TABLE[1], 'block': True} for dx in PIECES],
        # two consoles along the window wall
        {'asset': 'mf.room.console', 'x': X0 + 3.4, 'y': Y0 + 1.1, 'block': True},
        {'asset': 'mf.room.console', 'x': X1 - 3.6, 'y': Y0 + 1.1, 'block': True},
    ]
    for dx in CHAIRS:
        out.append({'asset': 'mf.room.chair_a', 'x': TABLE[0] + dx, 'y': TABLE[1] - 1.6, 'block': True})
        out.append({'asset': 'mf.room.chair_b', 'x': TABLE[0] + dx, 'y': TABLE[1] + 1.6, 'block': True})
    return out


def blockout():
    """The side passage's walls (grey until their pictures come); its west side is the room's door wall."""
    a = lambda b, art: {**b, 'art': art}  # noqa: E731
    return [
        a(wall_x(SX0, SX1, SY0 - 0.2, 2.0, '회의실 옆 통로'), 'mf.corridor.side_wall_end'),  # (2 m: not hiding the room)
        a(wall_y(SY0, SY1, SX1 + 0.2, NEAR_H, ''), 'mf.corridor.side_wall_low'),
        a(wall_y(Y1, SY1, SX0 - 0.2, FAR_H * 0.5, ''), 'mf.corridor.side_wall_corner'),  # (4 m)  # (between the room's corner and the corridor)
    ]


def lights():
    out = []
    for x in (X0 + 2.5, CX, X1 - 2.5):  # the lava's glow through the windows
        out.append(light(x, Y0 - 1.2, 1.5, (255, 110, 40), 190, 0.1))
    for y in (Y0 + 3, Y1 - 3):  # the side wall's amber
        out.append(light(X0 + 0.8, y, 1.4, (255, 170, 80), 120, 0.04))
    out.append(light(CX, CY, 2.5, (220, 170, 120), 150, 0.02))  # over the table
    out.append(light((SX0 + SX1) / 2, (SY0 + SY1) / 2, 2.5, (220, 170, 120), 90, 0.02))  # the side passage
    return out


def main():
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage02',
        'stage': 2,
        'title': '무스타파 · 분리주의 회의실',
        'blockoutNote': 'BLOCKOUT: the side passage to the corridor (grey boxes: requested)',
        'floor': [
            {'id': 'room', 'kind': 'texturedRect', 'x0': X0, 'y0': Y0, 'x1': X1, 'y1': Y1, 'asset': 'mf.room.floor'},
            {'id': 'sidePassage', 'kind': 'texturedRect', 'x0': SX0, 'y0': SY0, 'x1': SX1, 'y1': SY1, 'asset': 'mf.corridor.side_floor', 'fallback': 'grid'},
        ],
        'walk': [
            # (0.9 m in from the walls; the door's gap through the +x wall to the side passage)
            {'id': 'room', 'rect': [round(X0 + 1.1), Y0 + 1, round(X1 - 0.9), Y1 - 1], 'needs': ['mf.room.floor']},
            {'id': 'doorway', 'rect': [round(X1 - 0.9), CY - 2, round(SX0) + 1, CY + 2], 'needs': ['mf.room.floor']},
            {'id': 'sidePassage', 'rect': [round(SX0), SY0, round(SX1), SY1]},
        ],
        'collision': [],
        'structures': structures(),
        'decor': [],
        'blockout': blockout(),
        # the table's top, for the film's fight on it (a later step: the duel does not use it yet) — its ends the ways up
        'reserved': {'tableTop': {'x0': TABLE[0] - TABLE_HALF[0], 'y0': TABLE[1] - TABLE_HALF[1], 'x1': TABLE[0] + TABLE_HALF[0], 'y1': TABLE[1] + TABLE_HALF[1], 'z': 0.8,
                                  'access': [{'x': TABLE[0] - TABLE_HALF[0] - 0.6, 'y': TABLE[1]}, {'x': TABLE[0] + TABLE_HALF[0] + 0.6, 'y': TABLE[1]}]}},
        # the scene's places (src/game/mustafar/director.js): in through the door, the lane south of the table, the push
        'actors': {
            'sideBottom': {'x': 59.4, 'y': 95.2},  # the side passage's foot, at the corridor
            'sideTop': {'x': 59.4, 'y': CY},  # its top, before the room's door
            'confDoor': {'x': X1 - 0.6, 'y': CY},
            'roomAnakin': {'x': 56.0, 'y': 84.6},
            'roomObiwan': {'x': 53.8, 'y': 89.4},
            # the push on the lane south of the table: Obi-Wan thrown toward the door (he is up first and out of it,
            # back to the control room), Anakin back along the lane
            'pushAnakin': {'x': 51.0, 'y': 89.6},
            'pushObiwan': {'x': 55.2, 'y': 89.6},
            'pushAnakinTo': {'x': 44.8, 'y': 89.6},
            'pushObiwanTo': {'x': 56.9, 'y': 89.6},
        },
        'triggers': [],
        'cameras': [{'x0': X0 - 2, 'y0': Y0 - 3, 'x1': SX1 + 1, 'y1': Y1 + 1}],
        'lights': lights(),
        'regions': [
            {'x': CX, 'y': CY, 'r': 8.5, 'name': '무스타파 · 분리주의 회의실'},
            {'x': (SX0 + SX1) / 2, 'y': (SY0 + SY1) / 2, 'r': 3.2, 'name': '무스타파 · 회의실 옆 통로'},
        ],
    }
    write(OUT, m)
    print(f'{OUT}: room {X1 - X0:.1f} x {Y1 - Y0} m at ({X0:.1f}, {Y0}), side passage {SX1 - SX0:.0f} x {SY1 - SY0} m, {len(m["structures"])} pieces')


if __name__ == '__main__':
    main()
