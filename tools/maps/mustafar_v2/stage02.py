"""Mustafar rebuild, STAGE 02 — the Separatist conference room (docs/MUSTAFAR_REBUILD.md).

    python3 tools/maps/mustafar_v2/stage02.py  ->  public/maps/mustafar_v2/stage02.json

The same layers as STAGE 01's zone (stage01.py), in the same world: the room lies behind the facility door at the far
end of STAGE 01's corridor (the corridor ends at x = 60.9, its door across y 95..101), 16 × 12 m, its window wall to −y
over the lava, its console wall to −x, its two near walls cut low (the door's 4 m gap in the +x one). The art is
external (public/assets/mustafar/interiors, docs/asset_requests/chatgpt_stage02_conference.md): the floor a top-down
picture, the walls straight-on pictures the engine stands up (wallElevation), the furniture 2:1 sprites drawn on guides.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage02.json'

X1 = 60.9  # the room's +x wall: STAGE 01's corridor ends here (its door)
X0 = X1 - 16
Y0, Y1 = 92, 104
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2  # (52.9, 98): the door's middle is y 98
TABLE = (CX, CY)


def structures():
    out = [
        # the walls, on their base lines
        {'asset': 'mf.room.wall_window', 'x': CX, 'y': Y0},
        {'asset': 'mf.room.wall_side', 'x': X0, 'y': CY},
        {'asset': 'mf.room.wall_front_low', 'x': CX, 'y': Y1},
        {'asset': 'mf.room.wall_door_low', 'x': X1, 'y': CY},
        # the council's table, its chairs either side (a: facing +y, on the far side; b: facing −y, the near side)
        {'asset': 'mf.room.table', 'x': TABLE[0], 'y': TABLE[1], 'block': True},
        # two consoles along the window wall
        {'asset': 'mf.room.console', 'x': X0 + 3.4, 'y': Y0 + 1.1, 'block': True},
        {'asset': 'mf.room.console', 'x': X1 - 3.6, 'y': Y0 + 1.1, 'block': True},
    ]
    for dx in (-2.5, 0, 2.5):
        out.append({'asset': 'mf.room.chair_a', 'x': TABLE[0] + dx, 'y': TABLE[1] - 1.6, 'block': True})
        out.append({'asset': 'mf.room.chair_b', 'x': TABLE[0] + dx, 'y': TABLE[1] + 1.6, 'block': True})
    return out


def lights():
    out = []
    for x in (X0 + 2.5, CX, X1 - 2.5):  # the lava's glow through the windows
        out.append({'x': x, 'y': Y0 - 1.2, 'z': 1.5, 'r': 255, 'g': 110, 'b': 40, 'rad': 190, 'flicker': 0.1})
    for y in (Y0 + 3, Y1 - 3):  # the console wall's amber
        out.append({'x': X0 + 0.8, 'y': y, 'z': 1.4, 'r': 255, 'g': 170, 'b': 80, 'rad': 120, 'flicker': 0.04})
    out.append({'x': CX, 'y': CY, 'z': 2.5, 'r': 220, 'g': 170, 'b': 120, 'rad': 150, 'flicker': 0.02})  # over the table
    return out


def main():
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage02',
        'stage': 2,
        'title': '무스타파 · 분리주의 회의실',
        'floor': [{'id': 'room', 'kind': 'texturedRect', 'x0': X0, 'y0': Y0, 'x1': X1, 'y1': Y1, 'asset': 'mf.room.floor'}],
        'walk': [
            # (0.9 m in from the walls; the door's gap through the +x wall to STAGE 01's corridor)
            {'id': 'room', 'rect': [round(X0 + 1.1), Y0 + 1, round(X1 - 0.9), Y1 - 1], 'needs': ['mf.room.floor']},
            {'id': 'doorway', 'rect': [round(X1 - 0.9), 96, 62, 100], 'needs': ['mf.room.floor']},
            # the way on to the control room (STAGE 03, blockout): a door in the −x wall (BLOCKOUT FINDING: the delivered
            # wall_side picture has no door — its door version goes into the art requests at the polish step)
            {'id': 'westDoorway', 'rect': [44, 96, round(X0 + 1.1), 100]},
        ],
        # the facility door, shut until the director opens it (the fight reaches it: STAGE 01's corridor end)
        'collision': [
            {'id': 'facilityDoor', 'rect': [round(X1 - 0.9), 96, 62, 100], 'door': True},
            {'id': 'confWestDoor', 'rect': [44, 96, round(X0 + 1.1), 100], 'door': True},  # (opened after the push)
        ],
        'structures': structures(),
        'decor': [],
        # the scene's places (src/game/mustafar/director.js): through the door, then the lane south of the table
        'actors': {
            'roomAnakin': {'x': 59.2, 'y': 98.2},
            'roomObiwan': {'x': 57.3, 'y': 101.6},
            'pushAnakin': {'x': 57.6, 'y': 101.8},
            'pushObiwan': {'x': 53.4, 'y': 101.8},
            'pushAnakinTo': {'x': 59.4, 'y': 101.8},
            'pushObiwanTo': {'x': 47.2, 'y': 101.8},
            'confWestDoor': {'x': 45.4, 'y': 98},  # the way out to the control room (STAGE 03)
        },
        'triggers': [],
        'camera': {'x0': X0 - 2, 'y0': Y0 - 3, 'x1': X1 + 2, 'y1': Y1 + 2},
        'lights': lights(),
        'regions': [{'x': CX, 'y': CY, 'r': 9, 'name': '무스타파 · 분리주의 회의실'}],
    }
    one = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731
    body = ',\n'.join(
        f'  {one(k)}: [\n' + ',\n'.join('    ' + one(e) for e in v) + '\n  ]' if isinstance(v, list) and v and isinstance(v[0], dict) else f'  {one(k)}: {one(v)}'
        for k, v in m.items()
    )
    OUT.write_text('{\n' + body + '\n}\n')
    print(f'{OUT}: room {X1 - X0:.1f} x {Y1 - Y0} m at ({X0:.1f}, {Y0}), {len(m["structures"])} pieces')


if __name__ == '__main__':
    main()
