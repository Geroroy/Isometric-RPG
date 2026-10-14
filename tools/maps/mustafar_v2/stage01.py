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
  collision   blocked areas inside the walkable ones (rectangles) — none yet
  structures  walls, railings, the entry corridor (step 3, 4): sprite assets placed { asset, x, y, block } — none yet
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
        'surround': {'biome': 'LAVA', 'placeholder': True, 'note': 'temporary: the existing lava texture until the stage terrain is designed'},
        'floor': [
            {
                'id': 'pad',
                'kind': 'landingPad',
                'x0': X0, 'y0': Y0, 'x1': X1, 'y1': Y1,
                'rim': RIM,
                'bay': BAY,
                'bays': BAYS,
                'asset': 'mf.landing.floor',  # its textures (docs/asset_requests/mf.landing.floor.md)
            }
        ],
        'walk': [{'id': 'pad', 'rect': [X0, Y0, X1, Y1]}],
        'collision': [],
        'structures': [],
        'decor': [],
        'backdrop': None,
        'actors': {
            # provisional: the stage's opening (step 6, 7) decides where everyone stands
            'anakin': {'x': CX + 2.5, 'y': CY + 6.5, 'faceTo': {'x': CX, 'y': CY}},
        },
        'triggers': [],
        'camera': {'x0': X0 - 3, 'y0': Y0 - 3, 'x1': X1 + 3, 'y1': Y1 + 3},
        'lights': lights(),
        'regions': [{'x': CX, 'y': CY, 'r': 40, 'name': '무스타파 · 착륙장'}],
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
