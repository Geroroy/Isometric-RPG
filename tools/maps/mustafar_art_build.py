"""The Mustafar "lava fortress" map: a painted picture as the ground (reference/mustafar_set/backdrop.png: the
facility built into a mountain over the lava sea — the landing pad with Padmé's skiff on the left, the lava falls
down the middle, the refinery block on the right, collector arms out on three sides, a bridge over the falls to the
far tower), with the walkable decks laid over it.

    python3 tools/maps/mustafar_art_build.py -> public/maps/mustafar_art.json

The picture is not in the game's 2:1 projection (one of its ground axes runs almost up the screen), so it is not
warped onto the tile grid — it is drawn as it is (terrain.js: the map's `backdrop`, the picture scaled SCALE× so
the skiff on the pad measures the game's 9 m) and the walkable areas are traced on it in picture pixels (POLYS,
below), as painted-background games do: a tile is walkable when a point of it lands inside a polygon. The characters
walk the 2:1 grid over the painting; the pad, the catwalks and the decks are flat, so nothing shows the difference.

The picture's screen rectangle is placed in the world at (X0, Y0): its top-left pixel is at that world point, and it
reaches x ≈ 188, y ≈ 189 — inside the 192 × 192 map. The camera is held over the picture (`camRegion`: the widest 2:1
box inside it). Positions below are picture pixels (u, v): u to the right, v down.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/maps/mustafar_art.json'

W, H = 192, 192
IMG_W, IMG_H = 1672, 941
SCALE = 2.1  # screen px a picture px (the skiff: 90 px long in the picture, 9 m = 201 px on screen)
X0, Y0 = 2, 90  # the world point under the picture's top-left pixel
IMAGE = 'sprites/mustafar/backdrop.webp'

# the walkable decks, traced on the picture (u, v): the landing pad, the roof decks, the bridge, the catwalks out to
# the collector arms and their top ledges
POLYS = {
    'pad': [(276, 470), (322, 440), (430, 414), (548, 444), (548, 526), (440, 548), (330, 548), (296, 522)],
    # the walkway from the pad's left tip up to the lookout tower on the rock
    'lookout_walk': [(246, 400), (292, 384), (352, 428), (330, 452), (276, 470)],
    'lookout': [(236, 350), (292, 350), (296, 404), (240, 408)],
    # the ramp under the pad's near edge and the catwalk down to the left arm
    'pad_ramp': [(380, 548), (440, 542), (448, 598), (396, 604)],
    'left_walk': [(396, 580), (446, 596), (262, 712), (228, 690)],
    'left_arm': [(216, 650), (300, 650), (302, 704), (230, 710)],
    # the roof deck east of the pad, to the bridge's foot
    'roof': [(548, 444), (548, 420), (748, 396), (748, 424), (560, 456)],
    # the bridge over the lava falls to the far tower
    'bridge': [(748, 398), (1250, 350), (1252, 378), (748, 426)],
    'tower_base': [(1206, 352), (1270, 348), (1274, 428), (1210, 434)],
    # the refinery's upper deck, the tower's foot joined to it
    'upper_deck': [(1208, 426), (1272, 420), (1300, 476), (1302, 562), (1208, 590), (1086, 566), (956, 474), (956, 436), (1140, 402)],
    # down the refinery's east side to its lower deck
    'east_stair': [(1150, 562), (1206, 586), (1206, 702), (1150, 702)],
    'lower_deck': [(950, 642), (1160, 690), (1160, 730), (1000, 712), (950, 684)],
    # the catwalk out to the right arm, and the arm's top ledge
    'right_walk': [(1300, 540), (1484, 594), (1484, 622), (1300, 572)],
    'right_arm': [(1470, 586), (1514, 582), (1516, 630), (1472, 634)],
    # the catwalk from the lower deck to the lower-right arm
    'low_walk': [(1160, 696), (1352, 742), (1352, 770), (1160, 728)],
    'low_arm': [(1338, 718), (1404, 712), (1406, 772), (1342, 778)],
}
SPAWN = (400, 505)  # Anakin on the pad, before the skiff
FOE = (452, 466)  # Obi-Wan in the lit doorway behind the pad
POIS = [
    ((410, 480), 12, '무스타파 · 착륙장'),
    ((266, 376), 6, '무스타파 · 전망탑'),
    ((258, 680), 7, '무스타파 · 서쪽 집하기 팔'),
    ((960, 388), 10, '무스타파 · 용암 폭포 다리'),
    ((1120, 480), 12, '무스타파 · 정제소 상부 데크'),
    ((1060, 690), 8, '무스타파 · 정제소 하부 데크'),
    ((1494, 608), 6, '무스타파 · 동쪽 집하기 팔'),
    ((1372, 746), 6, '무스타파 · 남쪽 집하기 팔'),
]
# the lava's glow where it meets the structures (the light map lights the characters there), the pad's lamps
LIGHTS = [
    ((830, 790), 0.3, (255, 120, 40), 260, 0.14),  # the falls' foot
    ((1000, 860), 0.3, (255, 100, 30), 200, 0.12),
    ((250, 830), 0.3, (255, 110, 30), 220, 0.14),  # under the west arm
    ((1400, 870), 0.3, (255, 110, 30), 200, 0.12),  # under the south arm
    ((1560, 700), 0.3, (255, 100, 30), 200, 0.12),  # under the east arm
    ((790, 440), 1.0, (255, 150, 60), 180, 0.1),  # the falls beside the bridge
    ((330, 520), 2.0, (255, 200, 150), 110, 0.03),  # the pad's lamps
    ((452, 462), 1.6, (255, 190, 120), 100, 0.03),  # the doorway
    ((1240, 400), 2.0, (255, 210, 160), 110, 0.03),  # the far tower's foot
]

SX0 = (X0 - Y0) * 20
SY0 = (X0 + Y0) * 10


def to_world(u, v):
    sx = SX0 + u * SCALE
    sy = SY0 + v * SCALE
    return (sx / 20 + sy / 10) / 2, (sy / 10 - sx / 20) / 2


def to_img(fx, fy):
    sx = (fx - fy) * 20
    sy = (fx + fy) * 10
    return (sx - SX0) / SCALE, (sy - SY0) / SCALE


def inside(u, v, poly):
    ok = False
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 > v) != (y1 > v) and u < (x1 - x0) * (v - y0) / (y1 - y0) + x0:
            ok = not ok
    return ok


def walkable(tx, ty):
    # the tile's middle and four points toward its corners: a narrow catwalk still gets whole tiles
    for dx, dy in ((0.5, 0.5), (0.2, 0.2), (0.8, 0.2), (0.2, 0.8), (0.8, 0.8)):
        u, v = to_img(tx + dx, ty + dy)
        if any(inside(u, v, p) for p in POLYS.values()):
            return True
    return False


def cam_region():
    # the widest 2:1 box inside the picture's screen rectangle, centred; the world rectangle whose screen box it is
    sw = IMG_W * SCALE
    sh = min(IMG_H * SCALE, sw / 2)
    sx0, sx1 = SX0, SX0 + sw
    sy0 = SY0 + (IMG_H * SCALE - sh) / 2
    sy1 = sy0 + sh
    a, b, c, d = sx0 / 20, sx1 / 20, sy0 / 10, sy1 / 10
    y0 = c / 2 - (a + b) / 4
    x0 = c - y0
    x1 = b + y0
    y1 = x0 - a
    assert abs(x1 + y1 - d) < 1e-6
    return {'x0': round(x0, 3), 'y0': round(y0, 3), 'x1': round(x1, 3), 'y1': round(y1, 3)}


def main():
    biome = [['~'] * W for _ in range(H)]
    blocked = [['#'] * W for _ in range(H)]
    n = 0
    for ty in range(H):
        for tx in range(W):
            if walkable(tx, ty):
                biome[ty][tx] = '#'
                blocked[ty][tx] = '.'
                n += 1
    # the way from the spawn: every deck must be reached (4-connected: pathfind.js cuts no corners)
    sx, sy = to_world(*SPAWN)
    start = (int(sx), int(sy))
    assert blocked[start[1]][start[0]] == '.', 'the spawn is not on a deck'
    seen = {start}
    q = [start]
    while q:
        x, y = q.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and blocked[ny][nx] == '.' and (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny))
    unreached = n - len(seen)
    for name, poly in POLYS.items():
        cu = sum(p[0] for p in poly) / len(poly)
        cv = sum(p[1] for p in poly) / len(poly)
        fx, fy = to_world(cu, cv)
        if (int(fx), int(fy)) not in seen:
            print(f'  {name}: its middle tile ({int(fx)}, {int(fy)}) is not reached from the spawn', file=sys.stderr)
    fx, fy = to_world(*FOE)
    assert blocked[int(fy)][int(fx)] == '.', 'the foe is not on a deck'
    pois = []
    for (u, v), r, name in POIS:
        x, y = to_world(u, v)
        pois.append({'x': round(x, 2), 'y': round(y, 2), 'r': r, 'name': name})
    lights = []
    for (u, v), z, (r, g, b), rad, fl in LIGHTS:
        x, y = to_world(u, v)
        lights.append({'x': round(x, 2), 'y': round(y, 2), 'z': z, 'r': r, 'g': g, 'b': b, 'rad': rad, 'flicker': fl})
    m = {
        'format': 'cw-map',
        'version': 1,
        'w': W,
        'h': H,
        'ambient': [228, 214, 206],
        'grade': 'mustafar',
        'backdrop': {'image': IMAGE, 'x': X0, 'y': Y0, 'scale': SCALE, 'w': IMG_W, 'h': IMG_H},
        'camRegion': cam_region(),
        'spawn': {'x': round(sx, 2), 'y': round(sy, 2)},
        'foeSpawn': {'x': round(fx, 2), 'y': round(fy, 2)},
        'pois': pois,
        'floorPlan': [],
        'surfaces': [],
        'biomeKey': {'~': 'LAVA', '#': 'GRATE'},
        'biome': [''.join(r) for r in biome],
        'blockedKey': {'.': 'walkable', 'o': 'blocked (a prop)', '#': 'blocked (the ground: lava, rock, a wall)'},
        'blocked': [''.join(r) for r in blocked],
        'props': [],
        'lights': lights,
    }
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    one = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))  # noqa: E731
    lines = []
    for k, v in m.items():
        if isinstance(v, list) and v and not isinstance(v[0], (int, float)):
            lines.append(f'  {one(k)}: [\n' + ',\n'.join('    ' + one(e) for e in v) + '\n  ]')
        else:
            lines.append(f'  {one(k)}: {one(v)}')
    out.write_text('{\n' + ',\n'.join(lines) + '\n}\n')
    print(f'{out} {n} walkable tiles, {unreached} not reached from the spawn, {len(lights)} lights, cam {m["camRegion"]}')


if __name__ == '__main__':
    main()
