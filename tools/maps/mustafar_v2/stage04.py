"""Mustafar rebuild, STAGE 04 — the industrial walkway and the lava collector (docs/MUSTAFAR_REBUILD.md). BLOCKOUT.

    python3 tools/maps/mustafar_v2/stage04.py  ->  public/maps/mustafar_v2/stage04.json

The film (2:38 – 5:48): out of the control room onto the balcony; along the catwalk over the lava falls; the shields
fail and lava rains onto it (a hazard); the catwalk gives way and they hang from the collector's cables over the lava;
down onto a service pipe (inching along it); a leap onto the collector arm, lava bombs thrown up round them; "I have
failed you, Anakin"; the blades bind; "This is the end for you, my master" — a bomb takes the collector tower and the
arm comes down into the river (STAGE 05).

Laid out south of STAGE 02–03 (1 tile = 1 m): the balcony terrace (x 21..41, y 106..111) outside the control room's
balcony door; the catwalk east from it, 2 m wide, 18 m long (x 41..59, y 108..110) past the conference room's near
side; its last 6 m section gives way. ELEVATION: the service pipe (x 66, y 120..134, 0.35 m over the lava, a walkable line only
0.9 m wide) and the collector arm (3 × 22 m, x 69..72, y 120..142, 0.3 m up), its tower at the arm's far (−y) end.
The pipe and the arm are reached only by the director's scenes (the cables, the leap): no walkable way joins them to
the catwalk.
"""
from pathlib import Path
from _zone import NEAR_H, box, deck, light, plate, wall_x, wall_y, write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage04.json'

T = (21, 106, 41, 111)  # the terrace (20 × 5 m: its floor picture's size)
C = (41, 108, 59, 110)  # the catwalk (18 m: three 6 m sections, the last the one that gives way — ending here, on screen
# clear of the collector tower: further east the tower stood in front of the collapse and hid Anakin)
SEGMENTS = [44, 50, 56]  # the sections' middles along x
FALL = (17.5, 108.5)  # the lava fall beyond the terrace's west end (anywhere nearer the fight it would cover the fighters)
PIPE = {'x': 66, 'y0': 120, 'y1': 134, 'z': 0.35, 'r': 0.45}  # (south of the tower's screen area: it never covers them on it)
ARM = (69, 120, 72, 142, 0.3)
TOWER = (70.5, 117)

SCENERY = [
    ('rock_spire', 61.5, 122), ('rock_mid', 61, 131.5), ('rock_low', 63, 138.5),  # behind the pipe
    ('rock_low', 76.5, 126), ('rock_mid', 77.5, 138),  # off the arm's near side
    ('rock_mid', 33, 118.5), ('rock_low', 48, 117.5),  # out in front of the terrace and the catwalk
    ('cliff_y', 15.5, 100.5),  # behind the lava fall at the terrace's west end
]

def blockout():
    arm_box, arm_surf = deck(ARM[0], ARM[1], ARM[2], ARM[3], ARM[4], '집하기 팔 +0.3 m')
    arm_box['id'] = 'arm'  # (hidden when it falls into the river: the director)
    arm_box['art'] = 'mf.collector.collector_arm'
    cw = 'mf.walkway.catwalk_segment'
    pipe_box, pipe_surf = deck(PIPE['x'] - 0.45, PIPE['y0'], PIPE['x'] + 0.45, PIPE['y1'], PIPE['z'], '배관 +0.35 m')
    pipe_box['art'] = 'mf.collector.pipe_segment'
    out = [
        pipe_box,
        arm_box,
        {**plate(SEGMENTS[-1], 109, 6, 2, '무너지는 구간'), 'art': cw},
        # the terrace's rails (its far side is the control room's near wall: stage03) — the landing pad's, reused
        {**wall_x(T[0], T[2], T[3] + 0.2, NEAR_H, '난간'), 'art': 'mf.landing.rail_x'},
        {**wall_y(T[1], T[3], T[0] - 0.2, NEAR_H), 'art': 'mf.landing.rail_y'},
        # the catwalk's rails, both sides low (the catwalk's own picture has them)
        {**wall_x(C[0], C[2], C[1] - 0.2, NEAR_H, '난간'), 'art': cw},
        {**wall_x(C[0], C[2], C[3] + 0.2, NEAR_H), 'art': cw},
        {**wall_y(C[1], C[3], C[2] + 0.2, NEAR_H), 'art': cw},
        # the collector tower at the arm's far end
        box(TOWER[0], TOWER[1], 4, 4, 8, 'story', '집하기 탑', id='armTower', art='mf.collector.collector_tower'),
    ]
    return out, [pipe_surf, arm_surf]


def structures():
    """The art, where it stands (each drawn once delivered — docs/asset_requests/chatgpt_route_assets.md §3)."""
    y = (C[1] + C[3]) / 2
    out = [{'asset': 'mf.walkway.catwalk_segment', 'x': x, 'y': y} for x in SEGMENTS[:-1]]
    out += [
        # the last section, and the same torn off when it gives way (the director swaps them)
        {'asset': 'mf.walkway.catwalk_segment', 'x': SEGMENTS[-1], 'y': y, 'id': 'catwalkEnd'},
        {'asset': 'mf.walkway.catwalk_broken', 'x': SEGMENTS[-1], 'y': y, 'id': 'catwalkBroken', 'hidden': True},
        {'asset': 'mf.walkway.lava_fall', 'x': FALL[0], 'y': FALL[1]},
        {'asset': 'mf.collector.collector_arm', 'x': (ARM[0] + ARM[2]) / 2, 'y': (ARM[1] + ARM[3]) / 2, 'id': 'arm'},
        # the collector's tower at the arm's far end (it falls with the arm: the director hides it)
        {'asset': 'mf.collector.collector_tower', 'x': TOWER[0], 'y': TOWER[1], 'id': 'armTower'},
    ]
    # the service pipe: two 7 m sections end to end along y (its crown 0.35 m over the lava, only its upper half showing)
    out = [{'asset': 'mf.collector.pipe_segment', 'x': PIPE['x'], 'y': PIPE['y0'] + 3.5 + 7 * i} for i in range(2)] + out
    # the terrace's railings: the landing pad's (the user's), 6 m runs along its near edge, one across its west end
    out += [{'asset': 'mf.landing.rail_x', 'x': x, 'y': T[3] - 0.3} for x in (T[0] + 3, T[0] + 9, T[0] + 15)]
    out.append({'asset': 'mf.landing.rail_y', 'x': T[0] + 0.3, 'y': (T[1] + T[3]) / 2})
    # basalt in the lava (phase2_review.md): behind the pipe (−x), in front of the arm and the terrace only far
    # enough out that their tops stay below the fighters' feet on screen (the route QA's `covered` checks it)
    out += [{'asset': f'mf.lava.{k}', 'x': x, 'y': y} for k, x, y in SCENERY]
    return out


def main():
    boxes, surfaces = blockout()
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage04',
        'stage': 4,
        'title': '무스타파 · 산업 보행로 · 용암 집하 시설',
        'blockoutNote': 'BLOCKOUT: grey boxes stand in for the art (not requested yet)',
        'floor': [
            {'id': 'terrace', 'kind': 'texturedRect', 'x0': T[0], 'y0': T[1], 'x1': T[2], 'y1': T[3], 'asset': 'mf.walkway.terrace_floor', 'fallback': 'grid'},
            # (the catwalk's deck is its sprite: the grid only until that comes — the lava shows through its grating)
            {'id': 'catwalk', 'kind': 'blockout', 'x0': C[0], 'y0': C[1], 'x1': C[2], 'y1': C[3], 'art': 'mf.walkway.catwalk_segment'},
        ],
        'walk': [
            {'id': 'terrace', 'rect': [22, T[1] + 1, T[2], T[3]]},
            {'id': 'catwalk', 'rect': list(C)},
            {'id': 'arm', 'rect': [ARM[0], ARM[1], ARM[2], ARM[3]]},
        ],
        'collision': [],
        # the service pipe: a walkable line over the lava (world/mustafarStage.js strips)
        'strips': [{'x0': PIPE['x'], 'y0': PIPE['y0'] + 0.4, 'x1': PIPE['x'], 'y1': PIPE['y1'] - 0.4, 'r': PIPE['r']}],
        'structures': structures(),
        'decor': [],
        'blockout': boxes,
        'surfaces': surfaces,
        'actors': {
            'terraceAnakin': {'x': 31.5, 'y': 108.6},  # out of the balcony door
            'terraceObiwan': {'x': 35.0, 'y': 109.2},
            'collapse': {'x': SEGMENTS[-1] - 1, 'y': 109},  # where the catwalk gives way (its last section)
            'pipe': {'x': PIPE['x'], 'y0': PIPE['y0'], 'y1': PIPE['y1'], 'z': PIPE['z']},  # (the director's balance line)
            'hook': {'x': PIPE['x'] + 0.2, 'y': PIPE['y0'] + 7, 'z': 8.5},  # the crane hook the cables hang from
            'arm': {'x': (ARM[0] + ARM[2]) / 2, 'y': (ARM[1] + ARM[3]) / 2, 'hw': (ARM[2] - ARM[0]) / 2, 'hh': (ARM[3] - ARM[1]) / 2},
            'armTower': {'x': TOWER[0], 'y': TOWER[1]},
        },
        'triggers': [],
        'cameras': [
            {'x0': T[0] - 2, 'y0': T[1] - 3, 'x1': C[2] + 2, 'y1': T[3] + 3},
            {'x0': PIPE['x'] - 5, 'y0': PIPE['y0'] - 4, 'x1': ARM[2] + 5, 'y1': ARM[3] + 3},
        ],
        'lights': [
            *[light(x, 113, 0.3, (255, 110, 40), 170, 0.12) for x in range(24, 64, 6)],  # the lava below the walkways
            *[light(x, 104.5, 0.3, (255, 120, 50), 150, 0.12) for x in range(42, 64, 7)],
            *[light(68, y, 0.3, (255, 120, 50), 170, 0.12) for y in range(114, 144, 6)],
            light(TOWER[0], TOWER[1] + 2.5, 3, (255, 160, 80), 160, 0.05),
        ],
        'regions': [
            {'x': 31, 'y': 108.5, 'r': 10.5, 'name': '무스타파 · 외부 발코니'},
            {'x': 50, 'y': 109, 'r': 9.5, 'name': '무스타파 · 용암 폭포 위 보행로'},
            {'x': PIPE['x'] - 0.5, 'y': 124, 'r': 4.4, 'name': '무스타파 · 배관 위'}, {'x': PIPE['x'] - 0.5, 'y': 131, 'r': 4.4, 'name': '무스타파 · 배관 위'},
            {'x': 70.5, 'y': 129, 'r': 13, 'name': '무스타파 · 집하기 팔'},
        ],
    }
    write(OUT, m)
    print(f'{OUT}: terrace + catwalk {C[2] - T[0]:.0f} m, pipe {PIPE["y1"] - PIPE["y0"]} m, arm {ARM[3] - ARM[1]} m, {len(boxes)} boxes')


if __name__ == '__main__':
    main()
