"""Lay out the rebuilt Coruscant (docs/CORUSCANT_REBUILD.md) with the 1:1 building sprites
(public/sprites/undercity, tools/sprites/undercity_buildings/bake.py) and the existing street-scale
props (public/sprites/underworld), and write src/data/undercity_v2.json — the same shape as
src/data/undercity.json plus what the v2 map changes elsewhere (`city`: the level rectangles and the
fixed points; `life`: the crowd's places and patrols; `npcs`; `qa`: spots for the QA scripts).

Rules (the design doc): the tall buildings stand on the back edges (north and west — the top of the
screen), the low ones in front; streets 6 tiles wide, lanes 3-4; nothing overlaps; every point the
crowd, the patrols or the QA use must be reachable on foot from the turbolift. The script checks all
of that and stops on a problem; --preview draws the plan (tiles, buildings by kind, points, routes).
   python3 tools/maps/undercity_v2.py [--preview out.png]
"""
import json
import math
import os
import sys
from collections import deque

UC = 'public/sprites/undercity'
UW = 'public/sprites/underworld'
OUT = 'src/data/undercity_v2.json'

LOW = (40, 94, 156, 156)  # x0, y0, x1, y1 (tiles)
UP = (62, 35, 124, 79)
LIFT_UP = (82, 77.5)
LIFT_LOW = (82, 97.5)
PAD = (117, 62)

B = {}
for f in os.listdir(UC):
    if f.endswith('.json') and f != 'index.json':
        m = json.load(open(f'{UC}/{f}'))
        B[m['name']] = m
S = {}
for f in os.listdir(UW):
    if f.endswith('.json') and f != 'index.json':
        m = json.load(open(f'{UW}/{f}'))
        if 'footprint' in m:
            xs = [p[0] for p in m['footprint']]
            ys = [p[1] for p in m['footprint']]
            S[m['name']] = (min(xs), min(ys), max(xs), max(ys), bool(m.get('flat')))


class Plan:
    def __init__(self):
        self.items = []  # dicts: p, x, y, rect, kind, level
        self.errors = []

    def rect(self, name, x, y):
        if name in B:
            a, b = B[name]['tiles']
            return (x - a / 2, y - b / 2, x + a / 2, y + b / 2)
        x0, y0, x1, y1, _ = S[name]
        return (x + x0, y + y0, x + x1, y + y1)

    def put(self, name, x, y, level, **extra):
        r = self.rect(name, x, y)
        box = LOW if level == 'low' else UP
        if r[0] < box[0] + 0.9 or r[1] < box[1] + 0.9 or r[2] > box[2] - 0.4 or r[3] > box[3] - 0.4:
            self.errors.append(f'{name} at {x:.1f},{y:.1f} leaves the {level} level ({[round(v, 1) for v in r]})')
        for it in self.items:
            q = it['rect']
            if it['level'] == level and r[0] < q[2] - 0.15 and r[2] > q[0] + 0.15 and r[1] < q[3] - 0.15 and r[3] > q[1] + 0.15:
                self.errors.append(f'{name} at {x:.1f},{y:.1f} overlaps {it["p"]} at {it["x"]:.1f},{it["y"]:.1f}')
        it = {'p': name, 'x': round(x, 2), 'y': round(y, 2), 'rect': r, 'kind': B[name]['kind'] if name in B else 'prop', 'level': level, **extra}
        self.items.append(it)
        return it

    def row(self, names, x0, edge, align, level, gap=1.5):
        """Buildings side by side along x from x0, their north (align 'n') or south ('s') sides on `edge`."""
        x = x0
        out = []
        for n in names:
            a, b = B[n]['tiles']
            out.append(self.put(n, x + a / 2, edge + b / 2 if align == 'n' else edge - b / 2, level))
            x += a + gap
        return x - gap, out

    def col(self, names, y0, edge, align, level, gap=1.5):
        """Buildings one behind another along y from y0, their west ('w') or east ('e') sides on `edge`."""
        y = y0
        out = []
        for n in names:
            a, b = B[n]['tiles']
            out.append(self.put(n, edge + a / 2 if align == 'w' else edge - a / 2, y + b / 2, level))
            y += b + gap
        return y - gap, out


P = Plan()

# ================================================================== the undercity
# --- the back (north) edge: tenement towers to the west of the lift square, the works to the east
end, nw_towers = P.row(['towers_00', 'towers_04', 'towers_12', 'towers_08'], 41.5, 95.5, 'n', 'low', gap=1.4)
assert end <= 76.5, f'NW towers end at {end}'
end, works = P.row(['plants_03', 'plants_12', 'plants_14', 'plants_11'], 90.5, 95.5, 'n', 'low', gap=1.6)
# --- the back (west) edge below the avenue: the residential stacks
end_w, w_towers = P.col(['towers_09', 'towers_13', 'towers_15'], 116.5, 41.5, 'w', 'low', gap=3.2)
# --- shop blocks along the avenue's south side (row A) and the lane (row B), west and east of the plaza
_, rowA_w = P.row(['shops_01', 'shops_06', 'shops_13', 'shops_09'], 57.0, 116.5, 'n', 'low', gap=1.6)
neon_club = P.put('shops_14', 98.0, 116.5 + B['shops_14']['tiles'][1] / 2, 'low')
cantina = P.put('shops_00', 112.2 + B['shops_00']['tiles'][0] / 2, 116.5 + B['shops_00']['tiles'][1] / 2, 'low')
_, rowA_e = P.row(['shops_03', 'shops_10', 'shops_11', 'shops_07'], 122.5, 116.5, 'n', 'low', gap=1.4)
_, rowB_w = P.row(['shops_04', 'shops_15'], 57.0, 130.0, 'n', 'low', gap=2.6)
_, rowB_e = P.row(['shops_08', 'shops_12'], 124.0, 130.0, 'n', 'low', gap=4.0)
# --- two towers west of the plaza, behind it (they hide the lane behind them, not the plaza)
P.put('towers_02', 73.5 + B['towers_02']['tiles'][0] / 2, 131.5 + B['towers_02']['tiles'][1] / 2, 'low')
# --- the front edges: works framing the scene (they fade when they cover someone), a market tent by
# the overlook; the long cooling plant down the east edge
P.put('plants_09', 59.0 + B['plants_09']['tiles'][0] / 2, 155.4 - B['plants_09']['tiles'][1] / 2, 'low')
P.put('shops_05', 76.5 + B['shops_05']['tiles'][0] / 2, 155.4 - B['shops_05']['tiles'][1] / 2, 'low')
P.put('plants_05', 108.5 + B['plants_05']['tiles'][0] / 2, 155.4 - B['plants_05']['tiles'][1] / 2, 'low')
P.put('plants_01', 155.4 - B['plants_01']['tiles'][0] / 2, 127.5 + B['plants_01']['tiles'][1] / 2, 'low')

# the plaza (mosaic octagon) and the overlook bay on the south rim
PLAZA = (98.0, 130.5)
PLAZA_R = 9.5
BAY = [[91.5, 150.5], [104.5, 150.5], [105.5, 156.6], [90.5, 156.6]]

# --- street-scale props: the plaza's food stalls round the octagon, terminals, signs
stalls = ['dumplingStall', 'ramenStand', 'blueMilkStand', 'skewerCart', 'groguWagon', 'marketStall', 'skewerCartB', 'tradeKiosk']
for k, n in enumerate(stalls):
    ang = math.pi * (0.95 + k * 0.205)  # an arc on the plaza's west, south and east (the north is the club)
    P.put(n, PLAZA[0] + math.cos(ang) * 8.2, PLAZA[1] + math.sin(ang) * 6.6, 'low', vendor=True)
P.put('tradeTerminal', 90.0, 124.0, 'low')
P.put('tradeTerminal', 106.0, 124.4, 'low')
P.put('neonSignSet', 92.5, 136.6, 'low')
P.put('signPost', 103.4, 136.8, 'low')
# light posts along the avenue (both kerbs) and the promenade, skipping crossings
for x in range(46, 154, 9):
    if 76 <= x <= 90:
        continue
    P.put('lightPost', x + 0.5, 110.4, 'low')
for x in range(60, 142, 11):
    if 86 <= x <= 110:
        continue
    P.put('lightPostHolo' if (x // 11) % 2 else 'lightPost', x + 0.5, 143.6, 'low')
# alley clutter, the works' vents and pipes, the lift square's dressing
for (n, x, y) in [('trashCompactor', 55.2, 126.0), ('crateStack', 55.0, 142.4), ('barrelPile', 70.0, 141.5), ('scrapHeap', 120.4, 141.6),
                  ('abandonedSpeeder', 85.0, 153.6), ('speederBike', 130.0, 153.2), ('compactorUnit', 152.6, 126.0)]:
    P.put(n, x, y, 'low')
for (n, x, y) in [('steamVent', 107.0, 111.8), ('steamVent', 137.0, 111.8), ('ventStack', 152.4, 112.0), ('verticalPipes', 89.3, 96.5),
                  ('conduitArray', 77.2, 96.6), ('crateStack', 88.4, 105.6), ('barrelPile', 77.0, 105.8)]:
    P.put(n, x, y, 'low', steam=(n == 'steamVent'))
P.put('barSign', cantina['rect'][0] - 1.0, cantina['rect'][3] - 0.6, 'low')

# ================================================================== the upper plaza
end, up_towers = P.row(['towers_01', 'towers_03', 'towers_06', 'towers_10', 'towers_14'], 63.0, 49.5 - 0.01, 's', 'up', gap=2.0)
# the west edge: a row of shops facing the terrace (shops reused here: a level away from their twins)
_, up_shops = P.col(['shops_07', 'shops_04', 'shops_13'], 50.5, 63.0, 'w', 'up', gap=1.5)
for (n, x, y) in [('tradeTerminal', 88.0, 62.6), ('tradeTerminal', 100.0, 62.4), ('lightPost', 88.5, 70.2), ('lightPost', 100.0, 70.4),
                  ('signPost', 94.0, 60.8), ('tradeKiosk', 77.0, 60.5), ('neonSignSet', 84.0, 55.5), ('marketStall', 108.0, 73.5),
                  ('crateStack', 104.5, 57.0), ('barrelPile', 103.0, 58.8), ('crateBarrels', 120.0, 69.6), ('scrapHeap', 70.6, 74.6),
                  ('lightPost', 78.0, 77.4), ('lightPost', 90.0, 77.4), ('lightPost', 100.0, 77.4), ('lightPost', 110.0, 77.4),
                  ('signPost', 118.0, 77.0), ('neonSignSet', 121.0, 76.2), ('steamVent', 73.0, 66.5)]:
    P.put(n, x, y, 'up', steam=(n == 'steamVent'))

if P.errors:
    print('LAYOUT PROBLEMS:')
    for e in P.errors:
        print('  ' + e)
    sys.exit(1)

# ================================================================== walkability (what the game will block)
MAP = 192
blocked = [[2] * MAP for _ in range(MAP)]


def inpoly(x, y, poly):
    ins = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


for (x0, y0, x1, y1) in (LOW, UP):
    for y in range(y0, y1):
        for x in range(x0, x1):
            blocked[y][x] = 0
for y in range(LOW[1], LOW[3]):
    for x in range(LOW[0], LOW[2]):
        if inpoly(x + 0.5, y + 0.5, BAY):
            blocked[y][x] = 2
# the low level's outer ring (as worldgen: the first row and the side columns)
for x in range(LOW[0], LOW[2]):
    blocked[LOW[1]][x] = max(blocked[LOW[1]][x], 1)
for y in range(LOW[1], LOW[3]):
    for x in (LOW[0], LOW[2] - 1):
        blocked[y][x] = max(blocked[y][x], 1)
for it in P.items:
    if it['p'] in B:
        fp = B[it['p']]['footprint']
    else:
        x0, y0, x1, y1, flat = S[it['p']]
        if flat:
            continue
        fp = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    xs = [q[0] for q in fp]
    ys = [q[1] for q in fp]
    any_ = False
    for ty in range(math.floor(it['y'] + min(ys)), math.floor(it['y'] + max(ys)) + 1):
        for tx in range(math.floor(it['x'] + min(xs)), math.floor(it['x'] + max(xs)) + 1):
            if inpoly(tx + 0.5 - it['x'], ty + 0.5 - it['y'], fp):
                blocked[ty][tx] = max(blocked[ty][tx], 1)
                any_ = True
    if not any_:
        blocked[math.floor(it['y'])][math.floor(it['x'])] = 1
# the lifts and the pad (model props: turbolift blocks nothing, the pad is flat)


def reach(start):
    seen = set()
    q = deque([start])
    seen.add(start)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if 0 <= n[0] < MAP and 0 <= n[1] < MAP and n not in seen and blocked[n[1]][n[0]] == 0:
                seen.add(n)
                q.append(n)
    return seen


low_reach = reach((int(LIFT_LOW[0] + 1.6), int(LIFT_LOW[1] + 3)))
up_reach = reach((int(PAD[0] - 4), int(PAD[1] + 1.5)))
free_low = sum(1 for y in range(LOW[1], LOW[3]) for x in range(LOW[0], LOW[2]) if blocked[y][x] == 0)
free_up = sum(1 for y in range(UP[1], UP[3]) for x in range(UP[0], UP[2]) if blocked[y][x] == 0)


def ok(pt, level):
    x, y = pt
    return (int(x), int(y)) in (low_reach if level == 'low' else up_reach)


def nearest_ok(pt, level, r=4):
    """The nearest reachable tile centre to a point (a door or a gate right at a wall)."""
    if ok(pt, level):
        return [round(pt[0], 1), round(pt[1], 1)]
    best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            q = (int(pt[0]) + dx, int(pt[1]) + dy)
            if q in (low_reach if level == 'low' else up_reach):
                d = math.hypot(q[0] + 0.5 - pt[0], q[1] + 0.5 - pt[1])
                if best is None or d < best[0]:
                    best = (d, q)
    if best is None:
        raise SystemExit(f'no reachable tile near {pt} ({level})')
    return [best[1][0] + 0.5, best[1][1] + 0.5]


# ================================================================== points, places, routes, lights
cr = cantina['rect']
bar = [round((cr[0] + cr[2]) / 2, 2), round((cr[1] + cr[3]) / 2, 2)]
bar_door = nearest_ok((cr[0] + 2.2, cr[3] + 1.2), 'low')
figrin = nearest_ok((cr[0] + 4.2, cr[3] + 1.8), 'low')
shaft = list(PLAZA)


def front_of(it, side, off=0.9):
    r = it['rect']
    if side == 's':
        return ((r[0] + r[2]) / 2, r[3] + off)
    return (r[2] + off, (r[1] + r[3]) / 2)


homes = [nearest_ok(front_of(t, 's'), 'low') for t in nw_towers] + [nearest_ok(front_of(t, 'e'), 'low') for t in w_towers]
homes += [nearest_ok(front_of(s, 's'), 'low') for s in rowB_w + rowB_e]
homes += [nearest_ok((s['rect'][2] + 0.8, s['rect'][3] - 1.5), 'low') for s in rowA_w[:3]]
gate = [nearest_ok(front_of(w, 's', 1.0), 'low') for w in works[:2]]
factory_gate = [gate[0], [gate[0][0] + 2.2, gate[0][1] + 0.4], [gate[0][0] - 1.8, gate[0][1] - 0.4]]
factory_gate = [nearest_ok(p, 'low') for p in factory_gate]
market = [nearest_ok((PLAZA[0] + math.cos(a) * 5.2, PLAZA[1] + math.sin(a) * 4.4), 'low') for a in [i * math.pi / 4 for i in range(8)]]
cantina_sq = [nearest_ok((bar_door[0] + dx, bar_door[1] + dy), 'low') for dx, dy in [(-3, 1.2), (-1, 2.4), (1.5, 2.0), (3.5, 1.0), (0.5, 3.4), (-4.5, -0.4)]]
billboards = [nearest_ok(p, 'low') for p in [(98, neon_club['rect'][3] + 1.6), (rowA_w[2]['x'], 125.6), (rowA_e[1]['x'], 125.6), (rowB_e[0]['x'], 128.6)]]
alleys = [nearest_ok(p, 'low') for p in [(56.8, 120.0), (56.8, 136.0), (74.5, 127.2), (82.0, 127.0), (120.5, 127.0), (140.0, 127.6), (88.0, 103.0), (112.0, 112.4)]]
lift_low = nearest_ok((LIFT_LOW[0] + 1.6, LIFT_LOW[1] + 2.9), 'low')
overlook = nearest_ok((98.0, 148.6), 'low')
places = {
    'factoryGate': {'at': factory_gate, 'r': 0.4, 'face': [0, -1]},
    'marketStreet': {'at': market, 'r': 0.8},
    'cantinaSquare': {'at': cantina_sq, 'r': 0.5},
    'shaftLight': {'at': shaft, 'r': 1.2},
    'billboards': {'at': billboards, 'r': 0.4, 'watch': True},
    'alleys': {'at': alleys, 'r': 0.3},
    'liftLow': {'at': lift_low, 'r': 0.6},
    'homesLow': {'at': homes[:15], 'r': 0.2},
    # the upper plaza
    'plaza': {'at': [nearest_ok(p, 'up') for p in [(90, 63), (98, 63), (94, 69), (88, 67), (100, 68)]], 'r': 1.2},
    'railing': {'at': [nearest_ok((x, 77.6), 'up') for x in (76, 86, 96, 106, 114)], 'r': 0.3, 'face': [0.7, 0.7]},
    'padView': {'at': [nearest_ok(p, 'up') for p in [(110.5, 68.5), (111, 56), (121.5, 69)]], 'r': 0.5},
    'planters': {'at': [nearest_ok(p, 'up') for p in [(81, 57.8), (87, 73.8), (105, 73.8), (109, 55.8), (77, 69.8)]], 'r': 0.3},
    'liftUp': {'at': nearest_ok((LIFT_UP[0] + 1.6, LIFT_UP[1] - 1.9), 'up'), 'r': 0.6},
}
G = '코러산트 경비대'
patrols = [
    {'name': G, 'level': 'low', 'route': [nearest_ok(p, 'low') for p in [(52, 112.5), (150, 112.5), (150, 114.0), (52, 114.0)]], 'wait': [1.5, 3]},
    {'name': G, 'level': 'low', 'route': [nearest_ok((PLAZA[0] + math.cos(a) * 6, PLAZA[1] + math.sin(a) * 5), 'low') for a in [k * math.pi / 3 for k in range(6)]], 'wait': [1.5, 3]},
    {'name': G, 'level': 'low', 'route': [nearest_ok(p, 'low') for p in [(56.8, 117), (56.8, 148), (75, 145), (88, 145), (88, 128), (70, 127.5)]], 'wait': [2, 4]},
    {'name': G, 'level': 'up', 'route': [nearest_ok(p, 'up') for p in [(78, 58), (104, 58), (104, 72), (78, 72)]], 'wait': [2, 4]},
    {'name': G, 'level': 'up', 'route': [nearest_ok(p, 'up') for p in [(76, 76.8), (116, 76.8)]], 'wait': [3, 6]},
]
for pl in places.values():
    pts = pl['at'] if isinstance(pl['at'][0], list) else [pl['at']]
    for p in pts:
        lv = 'up' if p[1] < 90 else 'low'
        assert ok(p, lv), f'unreachable place point {p}'
for pa in patrols:
    for p in pa['route']:
        assert ok(p, pa['level']), f'unreachable patrol point {p}'

lights = [
    [shaft[0], shaft[1], 7, 200, 225, 255, 170, 0.01],  # the shaft of daylight
    [lift_low[0], lift_low[1] - 1, 2.4, 140, 210, 255, 90, 0.03],
    [overlook[0], overlook[1], 2.0, 120, 200, 255, 110, 0.04],
]
for it in P.items:
    if it['level'] == 'low' and it['p'] == 'lightPost':
        lights.append([it['x'], it['y'], 3.4, 255, 200, 140, 95, 0.05])
    if it['level'] == 'low' and it['p'] == 'lightPostHolo':
        lights.append([it['x'], it['y'], 3.0, 120, 220, 255, 90, 0.08])
puddles = [[64.0, 113.5, 1.4], [86.5, 112.0, 1.1], [118.0, 113.6, 1.2], [70.5, 127.6, 1.0], [133.5, 127.4, 1.2], [56.6, 132.0, 1.0], [110.0, 143.0, 1.3]]
steam = [[w['x'] + 1.0, w['rect'][3] - 1.0, 4.5] for w in works[:3]]
pois = [
    {'x': PLAZA[0], 'y': PLAZA[1], 'r': 10, 'name': '코러산트 · 네온 시장 광장'},
    {'x': bar[0], 'y': bar[1], 'r': 6, 'name': '코러산트 · 녹슨 등불 바'},
    {'x': 48.0, 'y': 132.0, 'r': 9, 'name': '코러산트 · 주거 스택'},
    {'x': 122.0, 'y': 103.0, 'r': 14, 'name': '코러산트 · 공장 지대'},
    {'x': 60.0, 'y': 103.0, 'r': 10, 'name': '코러산트 · 북쪽 공동주택'},
    {'x': 100.0, 'y': 112.5, 'r': 9, 'name': '코러산트 · 시장 거리'},
    {'x': overlook[0], 'y': overlook[1], 'r': 5, 'name': '코러산트 · 남쪽 전망대'},
    {'x': LIFT_LOW[0], 'y': LIFT_LOW[1] + 2, 'r': 5, 'name': '코러산트 · 리프트 광장'},
]
qa = {
    'plaza': nearest_ok(PLAZA, 'low'), 'westStacks': nearest_ok((56.8, 132.0), 'low'), 'avenueEast': nearest_ok((140.0, 112.5), 'low'),
    'works': factory_gate[0], 'cantina': bar_door, 'liftSquare': lift_low, 'overlook': overlook,
}

ground = {
    'base': 'plates',
    'chasm': [{'id': 'bay', 'poly': BAY}],
    'mosaic': [{'id': 'plaza', 'poly': [[PLAZA[0] + math.cos(a) * PLAZA_R / math.cos(math.pi / 8), PLAZA[1] + math.sin(a) * PLAZA_R / math.cos(math.pi / 8)] for a in [math.pi / 8 + k * math.pi / 4 for k in range(8)]]}],
    'mud': [{'id': 'westStacks', 'poly': [[54.5, 115.5], [58.0, 115.5], [58.0, 151.0], [54.5, 151.0]]}, {'id': 'lane', 'poly': [[58.0, 125.8], [88.0, 125.8], [88.0, 129.6], [58.0, 129.6]]}],
    'dirt': [{'id': 'southWest', 'poly': [[60.0, 140.0], [86.0, 140.0], [86.0, 146.0], [60.0, 146.0]]}],
    'swamp': [{'id': 'sw', 'poly': [[41.5, 148.0], [52.0, 148.0], [52.0, 155.5], [41.5, 155.5]]}, {'id': 'se', 'poly': [[140.0, 146.5], [154.5, 146.5], [154.5, 155.5], [140.0, 155.5]]}],
}

data = {
    '_doc': 'Coruscant v2 (docs/CORUSCANT_REBUILD.md), written by tools/maps/undercity_v2.py — do not edit by hand.',
    'grid': {'type': 'isometric 40x20', 'region': list(LOW), 'upperPlaza': list(UP), 'dropBetween': [UP[3] + 1, LOW[1] - 1]},
    'city': {
        'up': {'x': (UP[0] + UP[2]) / 2, 'y': (UP[1] + UP[3]) / 2, 'hw': (UP[2] - UP[0]) / 2, 'hh': (UP[3] - UP[1]) / 2},
        'low': {'x': (LOW[0] + LOW[2]) / 2, 'y': (LOW[1] + LOW[3]) / 2, 'hw': (LOW[2] - LOW[0]) / 2, 'hh': (LOW[3] - LOW[1]) / 2},
        'pad': {'x': PAD[0], 'y': PAD[1]}, 'liftUp': {'x': LIFT_UP[0], 'y': LIFT_UP[1]}, 'liftLow': {'x': LIFT_LOW[0], 'y': LIFT_LOW[1]},
        'bar': {'x': bar[0], 'y': bar[1]}, 'barDoor': {'x': bar_door[0], 'y': bar_door[1]}, 'shaft': {'x': shaft[0], 'y': shaft[1]},
        'market': {'x': PLAZA[0], 'y': PLAZA[1] - 6, 'rad': 18},
    },
    'ground': ground,
    'props': [{'p': it['p'], 'x': it['x'], 'y': it['y'], **({'steam': True} if it.get('steam') else {})} for it in P.items if it['level'] == 'low'],
    'lights': [[round(v, 2) if isinstance(v, float) else v for v in l] for l in lights],
    'puddles': puddles,
    'steam': steam,
    'pois': pois,
    'points': {'liftLow': list(LIFT_LOW), 'liftLanding': lift_low, 'plazaCentre': shaft, 'cantina': bar, 'cantinaDoor': bar_door, 'overlook': overlook},
    'upper': {'props': [{'p': it['p'], 'x': it['x'], 'y': it['y'], **({'steam': True} if it.get('steam') else {})} for it in P.items if it['level'] == 'up']},
    'life': {'places': places, 'patrols': patrols},
    'npcs': {'figrin': figrin},
    'qa': qa,
}
json.dump(data, open(OUT, 'w'), ensure_ascii=False, indent=1)
nb = sum(1 for it in P.items if it['p'] in B)
used = sorted({it['p'] for it in P.items if it['p'] in B})
print(f'{OUT}: {nb} buildings ({len(used)} kinds of 48), {len(P.items) - nb} props; walkable low {len(low_reach)}/{free_low} tiles reachable, up {len(up_reach)}/{free_up}')
print('unused:', sorted(set(B) - set(used)))

if '--preview' in sys.argv:
    from PIL import Image, ImageDraw
    out = sys.argv[sys.argv.index('--preview') + 1]
    K = 8
    X0, Y0, X1, Y1 = 38, 36, 158, 158
    im = Image.new('RGB', ((X1 - X0) * K, (Y1 - Y0) * K), (10, 10, 14))
    d = ImageDraw.Draw(im)
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            v = blocked[y][x]
            c = (10, 10, 14) if v == 2 else (60, 64, 72) if v == 0 else (30, 30, 36)
            if v == 0 and (x, y) not in low_reach and (x, y) not in up_reach:
                c = (120, 40, 40)  # walkable but cut off
            d.rectangle([(x - X0) * K, (y - Y0) * K, (x - X0 + 1) * K - 1, (y - Y0 + 1) * K - 1], fill=c)
    col = {'shop': (230, 120, 60), 'tower': (200, 170, 90), 'plant': (120, 150, 190), 'prop': (150, 150, 150)}
    for it in P.items:
        r = it['rect']
        d.rectangle([(r[0] - X0) * K, (r[1] - Y0) * K, (r[2] - X0) * K, (r[3] - Y0) * K], outline=col[it['kind']], width=2 if it['kind'] != 'prop' else 1)
        if it['kind'] != 'prop':
            d.text(((r[0] - X0) * K + 3, (r[1] - Y0) * K + 2), it['p'].replace('_', ''), fill=col[it['kind']])
    for pa in patrols:
        pts = [((p[0] - X0) * K, (p[1] - Y0) * K) for p in pa['route']]
        d.line(pts + [pts[0]], fill=(80, 200, 255), width=1)
    for name, pl in places.items():
        pts = pl['at'] if isinstance(pl['at'][0], list) else [pl['at']]
        for p in pts:
            d.ellipse([(p[0] - X0) * K - 3, (p[1] - Y0) * K - 3, (p[0] - X0) * K + 3, (p[1] - Y0) * K + 3], fill=(255, 220, 80))
    for nm, p in qa.items():
        d.text(((p[0] - X0) * K + 4, (p[1] - Y0) * K - 4), nm, fill=(140, 255, 140))
    im.save(out)
    print('preview', out)
