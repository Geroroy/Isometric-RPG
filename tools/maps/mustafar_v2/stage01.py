"""Mustafar rebuild, STAGE 01 — the landing platform (docs/MUSTAFAR_REBUILD.md). This step: the pad's floor only.

    python3 tools/maps/mustafar_v2/stage01.py  ->  public/maps/mustafar_v2/stage01.json

A zone file keeps each concern in its own layer, in world metres (1 tile = 1 m; the game's 2:1 projection, src/core/
iso.js), so later steps add to one layer without touching the others:

  floor       what is drawn as the ground: here the landing pad — its layout (the bay grid) and the manifest id of its
              external textures (public/assets/mustafar/manifest.json: `asset`); the terrain lays them out
              (gfx/padFloor.js), a debug grid until they are delivered
  surround    the ground round the zone (here a PLACEHOLDER: the existing lava texture, until the rock and the lava
              of the stage are designed)
  walk        where one may walk (rectangles); everything else is blocked
  collision   blocked areas inside the walkable ones (rectangles)
              (an entry with `needs` counts only once those assets are delivered: no invisible floor or walls)
  structures  railings, the entry corridor, the ship: sprite assets placed { asset, x, y, block }
              (docs/asset_requests/mf.landing.*.md; each appears when delivered)
  decor       loose dressing (later), as structures — none yet
  backdrop    a far background (later) — none
  actors      who starts where: Anakin (Padmé, Obi-Wan, the ship: steps 5, 6)
  triggers    cutscene / event areas (step 7) — none yet
  camera      the box the view is held in (world rect)
  lights      the light map's lights (ART_GUIDE.md §3: [x, y, z, r, g, b, radius px, flicker])
  regions     the names shown for places

The art is external (CLAUDE.md): this file only says where things go and which manifest asset draws them.
The pad's size (44 × 38 m) is a design assumption sized for Padmé's ship and a wide fighting floor; it has not been
measured against the film. Its place in the 192 × 192 world map is arbitrary (away from the map's edges).
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage01.json'

RIM = 1
BAY = 6
# the pad: 7 × 6 bays of 6 m inside a 1 m rim
X0, Y0 = 74, 76
X1, Y1 = X0 + 2 * RIM + 7 * BAY, Y0 + 2 * RIM + 6 * BAY
# the bays, a row per bay along y (from y0), a letter per bay along x (pad_floor.py): A / a plain, B access hatch,
# C vent grilles, D a cable trench cover (they line up into one service run), E the ship's tie-down clamps (the
# middle, where the ship is meant to stand: step 5)
BAYS = [
    'AaAaCaA',
    'DDDDDDD',
    'aAEEEaC',
    'CaEEEAa',
    'aBAaABa',
    'ACaAaAa',
]
assert len(BAYS) * BAY == Y1 - Y0 - 2 * RIM and all(len(r) * BAY == X1 - X0 - 2 * RIM for r in BAYS)

CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
# the entry corridor: off the pad's −x edge, 6 m wide (one railing run left out), 10 m long, toward the facility
DOOR_Y0, DOOR_Y1 = 95, 101
CORR_X0 = X0 - 13.1  # (13.1 m: the delivered pictures' own proportions at 6 m wide)
# Padmé's ship on the tie-down clamps (the E bays), nose to +x
SHIP = (96, 95)


def structures():
    """The sprite assets standing on the pad (docs/asset_requests): drawn once delivered, left out before."""
    out = []
    # railings on the rim, 0.5 m in from the edge: 6 m runs over the interior, posts at the corners
    for x in range(X0 + RIM + 3, X1 - RIM, 6):
        out += [{'asset': 'mf.landing.rail_x', 'x': x, 'y': Y0 + 0.5}, {'asset': 'mf.landing.rail_x', 'x': x, 'y': Y1 - 0.5}]
    for y in range(Y0 + RIM + 3, Y1 - RIM, 6):
        if not (y - 3 >= DOOR_Y0 - 0.01 and y + 3 <= DOOR_Y1 + 0.01):  # (the corridor's mouth)
            out.append({'asset': 'mf.landing.rail_y', 'x': X0 + 0.5, 'y': y})
        out.append({'asset': 'mf.landing.rail_y', 'x': X1 - 0.5, 'y': y})
    for x, y in ((X0 + 0.5, Y0 + 0.5), (X1 - 0.5, Y0 + 0.5), (X0 + 0.5, Y1 - 0.5), (X1 - 0.5, Y1 - 0.5)):
        out.append({'asset': 'mf.landing.rail_corner', 'x': x, 'y': y})
    # the corridor's walls (flat pictures stood up on their base lines: the back one along −y, the low front one along
    # +y, the end one with the door across the far end); its floor is a `floor` entry
    mx = (CORR_X0 + X0) / 2
    out += [
        {'asset': 'mf.landing.corridor_wall_back', 'x': mx, 'y': DOOR_Y0},
        {'asset': 'mf.landing.corridor_wall_front', 'x': mx, 'y': DOOR_Y1},
        {'asset': 'mf.landing.corridor_wall_end', 'x': CORR_X0, 'y': (DOOR_Y0 + DOOR_Y1) / 2, 'id': 'facilityDoor'},  # (STAGE 02: it opens)
    ]
    out.append({'asset': 'mf.landing.ship', 'x': SHIP[0], 'y': SHIP[1], 'block': True})
    # the robes thrown down before the duel: hidden until then (the director puts each where it falls)
    out += [
        {'asset': 'mf.landing.robe_obiwan', 'x': 94, 'y': 100, 'id': 'robe', 'hidden': True},
        {'asset': 'mf.landing.cloak_anakin', 'x': 88, 'y': 102, 'id': 'cloak', 'hidden': True},
    ]
    return out


def lights():
    """The lava's glow round the pad: a light every 6 m, 1.5 m out from each edge, flickering a little."""
    out = []
    glow = (255, 108, 40)
    for x in range(X0 + 3, X1, 6):
        for y in (Y0 - 1.5, Y1 + 1.5):
            out.append([x, y, 0.2, *glow, 160, 0.1])
    for y in range(Y0 + 3, Y1, 6):
        for x in (X0 - 1.5, X1 + 1.5):
            out.append([x, y, 0.2, *glow, 160, 0.1])
    return [{'x': l[0], 'y': l[1], 'z': l[2], 'r': l[3], 'g': l[4], 'b': l[5], 'rad': l[6], 'flicker': l[7]} for l in out]


def main():
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage01',
        'stage': 1,
        'title': '무스타파 · 착륙장',
        'ambient': [150, 86, 70],  # ART_GUIDE.md §4 Mustafar
        'grade': 'mustafar',
        'surround': {'biome': 'LAVA', 'asset': 'mf.lava.surface', 'note': 'the delivered lava tile (the old texture only while it is missing)'},
        'floor': [
            {
                'id': 'pad',
                'kind': 'landingPad',
                'x0': X0, 'y0': Y0, 'x1': X1, 'y1': Y1,
                'rim': RIM,
                'bay': BAY,
                'bays': BAYS,
                'asset': 'mf.landing.floor',  # its textures (docs/asset_requests/mf.landing.floor.md)
            },
            # the entry corridor's floor: one top-down picture over its rectangle (once delivered)
            {'id': 'corridor', 'kind': 'texturedRect', 'x0': CORR_X0, 'y0': DOOR_Y0, 'x1': X0, 'y1': DOOR_Y1, 'asset': 'mf.landing.corridor_floor'}
        ],
        'walk': [
            {'id': 'pad', 'rect': [X0, Y0, X1, Y1]},
            {'id': 'corridor', 'rect': [math.ceil(CORR_X0) + 1, DOOR_Y0 + 1, X0, DOOR_Y1 - 1], 'needs': ['mf.landing.corridor_floor']},
        ],
        # the rim under the railings (only once they stand there)
        'collision': [
            {'id': 'rail_y0', 'rect': [X0, Y0, X1, Y0 + RIM], 'needs': ['mf.landing.rail_x']},
            {'id': 'rail_y1', 'rect': [X0, Y1 - RIM, X1, Y1], 'needs': ['mf.landing.rail_x']},
            {'id': 'rail_x0a', 'rect': [X0, Y0, X0 + RIM, DOOR_Y0], 'needs': ['mf.landing.rail_y']},
            {'id': 'rail_x0b', 'rect': [X0, DOOR_Y1, X0 + RIM, Y1], 'needs': ['mf.landing.rail_y']},
            {'id': 'rail_x1', 'rect': [X1 - RIM, Y0, X1, Y1], 'needs': ['mf.landing.rail_y']},
        ],
        'structures': structures(),
        'decor': [],
        'backdrop': None,
        # the opening's places (src/game/mustafar/director.js), all clear of the ship's hull on the camera's side
        'actors': {
            'anakin': {'x': 77, 'y': 98.5, 'faceTo': {'x': 90.8, 'y': 100.6}},  # out of the corridor's mouth
            'anakinMeet': {'x': 87, 'y': 102.5},  # where he stops before Padmé (his backflip lands clear of the hull)
            'padme': {'x': 90.8, 'y': 100.6},  # at the foot of her ship's ramp
            'obiwanRamp': {'x': 93.2, 'y': 97.4},  # Obi-Wan appears on the ramp
            'obiwan': {'x': 94, 'y': 99.2},  # and steps down off it
            'door': {'x': 64, 'y': 98},  # the corridor's far end, at the facility door (STAGE 02 beyond)
        },
        'triggers': [],
        'camera': {'x0': math.floor(CORR_X0) - 2, 'y0': Y0 - 3, 'x1': X1 + 3, 'y1': Y1 + 3},  # (the corridor too)
        'lights': lights(),
        # (the first a point is inside names it: the corridor, then the pad — not reaching into STAGE 02's room)
        'regions': [{'x': (CORR_X0 + X0) / 2, 'y': (DOOR_Y0 + DOOR_Y1) / 2, 'r': 7, 'name': '무스타파 · 입구 복도'}, {'x': CX, 'y': CY, 'r': 28, 'name': '무스타파 · 착륙장'}],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    one = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731
    body = ',\n'.join(
        f'  {one(k)}: [\n' + ',\n'.join('    ' + one(e) for e in v) + '\n  ]' if isinstance(v, list) and v and isinstance(v[0], dict) else f'  {one(k)}: {one(v)}'
        for k, v in m.items()
    )
    OUT.write_text('{\n' + body + '\n}\n')
    print(f'{OUT}: pad {X1 - X0} x {Y1 - Y0} m at ({X0}, {Y0}), {len(m["lights"])} lights')


if __name__ == '__main__':
    main()
