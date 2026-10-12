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

B = json.load(open(f'{UC}/atlas.json'))['sprites']
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
            # buildings may overlap by their footprints' margins (walls meeting), nothing more
            tol = 0.85 if name in B and it['p'] in B else 0.15
            if it['level'] == level and r[0] < q[2] - tol and r[2] > q[0] + tol and r[1] < q[3] - tol and r[3] > q[1] + tol:
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
# buildings in a row stand flush: one street wall, no slit between them that looks like an alley but
# leads only behind them (where nothing can be seen and nothing is walkable)
FLUSH = -0.8  # (the footprints are the outlines less 0.4 a side: the outlines overlap so the walls meet)

# ================================================================== the undercity
# --- the back (north) edge: tenement towers to the west of the lift square, the works to the east
end, nw_towers = P.row(['towers_00', 'towers_04', 'towers_12', 'towers_08'], 41.5, 95.5, 'n', 'low', gap=FLUSH)
assert end <= 76.5, f'NW towers end at {end}'
end, works = P.row(['plants_03', 'plants_12', 'plants_14', 'plants_11'], 90.5, 95.5, 'n', 'low', gap=FLUSH)
# --- the back (west) edge below the avenue: the residential stacks
end_w, w_towers = P.col(['towers_09', 'towers_13', 'towers_15'], 116.5, 41.5, 'w', 'low', gap=FLUSH)
# --- shop blocks along the avenue's south side (row A) and the lane (row B), west and east of the plaza
# (from x 60: the stacks' lane west of it keeps 6+ tiles in view beside the towers — the shops hide a
# wedge west of their back corner)
_, rowA_w = P.row(['shops_01', 'shops_06', 'shops_13', 'shops_09'], 60.0, 116.5, 'n', 'low', gap=FLUSH)
neon_club = P.put('shops_14', 98.0, 116.5 + B['shops_14']['tiles'][1] / 2, 'low')
cantina = P.put('shops_00', 112.2 + B['shops_00']['tiles'][0] / 2, 116.5 + B['shops_00']['tiles'][1] / 2, 'low')
_, rowA_e = P.row(['shops_03', 'shops_10', 'shops_11', 'shops_07'], 122.5, 116.5, 'n', 'low', gap=FLUSH)
# row B backs onto row A (one block, two faces): a lane between them would lie wholly behind row B —
# out of sight, so out of reach — and show only as a sliver of floor one cannot walk into
back_w = max(it['rect'][3] for it in rowA_w[:2])
back_e = max(it['rect'][3] for it in rowA_e[:2])
_, rowB_w = P.row(['shops_04', 'shops_15'], 60.0, back_w, 'n', 'low', gap=FLUSH)
_, rowB_e = P.row(['shops_08', 'shops_12'], 122.5, back_e, 'n', 'low', gap=FLUSH)
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
# (on the avenue's north kerb, against the towers and the works: what a post hides lies in their walls —
# out in the street each post's sign would hide a diagonal strip of it)
def kerb(x, half=1.2):
    """The avenue's north kerb at x: just south of the towers and works there."""
    return max([it['rect'][3] for it in nw_towers + works if it['rect'][0] < x + half and it['rect'][2] > x - half] or [103.0]) + 0.9


for x in range(46, 154, 9):
    if 76 <= x <= 90:
        continue
    P.put('lightPost', x + 0.5, kerb(x + 0.5), 'low')
for x in range(60, 142, 11):
    if 86 <= x <= 110:
        continue
    P.put('lightPostHolo' if (x // 11) % 2 else 'lightPost', x + 0.5, 143.6, 'low')
# alley clutter, the works' vents and pipes, the lift square's dressing
for (n, x, y) in [('trashCompactor', 55.2, 126.0), ('crateStack', 55.0, 142.4), ('barrelPile', 70.0, 141.5), ('scrapHeap', 120.4, 141.6),
                  ('abandonedSpeeder', 85.0, 153.6), ('speederBike', 130.0, 153.2), ('compactorUnit', 152.6, 126.0)]:
    P.put(n, x, y, 'low')
for (n, x, y) in [('steamVent', 113.5, kerb(113.5, 1.6) + 0.2), ('steamVent', 140.5, kerb(140.5, 1.6) + 0.2), ('ventStack', 152.4, 112.0), ('verticalPipes', 89.3, 96.5),
                  ('conduitArray', 77.2, 96.6), ('crateStack', 88.4, 105.6), ('barrelPile', 77.0, 105.8)]:
    P.put(n, x, y, 'low', steam=(n == 'steamVent'))
P.put('barSign', cantina['rect'][0] - 1.0, cantina['rect'][3] - 0.6, 'low')

# ================================================================== the upper plaza
end, up_towers = P.row(['towers_01', 'towers_03', 'towers_06', 'towers_10', 'towers_14'], 63.0, 49.5 - 0.01, 's', 'up', gap=FLUSH)
# the west edge: a row of shops facing the terrace (shops reused here: a level away from their twins)
_, up_shops = P.col(['shops_07', 'shops_04', 'shops_13'], 50.5, 63.0, 'w', 'up', gap=FLUSH)
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

# --- no walking where something would hide the player (docs/CORUSCANT_REBUILD.md): the game's own test
# (renderer.coversPlayer: a standing sprite drawn after the player — his box behind its footprint box —
# whose opaque pixels cover 2 of 4 points down his 56 px body) at the tile's centre and four points
# inside it; buildings and the taller street props alike, on both levels. The level shows its people
# instead of hiding them — nothing is drawn see-through or as a ghost.
from PIL import Image as _Image
_atlas = json.load(open(f'{UC}/atlas.json'))
_pages = [_Image.open(f'{UC}/{f}').getchannel('A') for f in _atlas['pages']['body']]
_spr = {}
BODY_H = 56


def _sprite(name):
    """(alpha pixels, w, h, anchor, k, footprint bounds) of a building or a street prop."""
    if name not in _spr:
        if name in B:
            m = B[name]
            x, y, w, h = m['rect']
            fp = m['footprint']
            _spr[name] = (_pages[m['page']].crop((x, y, x + w, y + h)).load(), w, h, m['anchor'], 1.0, (min(q[0] for q in fp), min(q[1] for q in fp), max(q[0] for q in fp), max(q[1] for q in fp)))
        else:
            m = json.load(open(f'{UW}/{name}.json'))
            im = _Image.open(f'{UW}/{m["layers"]["body"]}').getchannel('A')
            x0, y0, x1, y1, _ = S[name]
            _spr[name] = (im.load(), im.width, im.height, m['anchor'], m.get('k', 1.0), (x0, y0, x1, y1))
    return _spr[name]


def _box_behind(a, b):
    """renderer.boxOrder(a, b) < 0: box a is behind box b."""
    e = 0.05
    xb, xf = a[2] <= b[0] + e, a[0] >= b[2] - e
    yb, yf = a[3] <= b[1] + e, a[1] >= b[3] - e
    return (xb and not yf) or (yb and not xf)


def _covers(px, py, level):
    """(the largest share of the player's body — 3 columns across his width by 4 rows from knee to head —
    one sprite drawn after him covers, whether his feet are hidden). A thin pole cuts a sliver from him;
    a wall swallows him."""
    best, feet = 0.0, False
    ub = (px - 0.25, py - 0.25, px + 0.25, py + 0.25)
    for it in tall[level]:
        a, w, h, anc, k, fb = _sprite(it['p'])
        bx = (it['x'] + fb[0], it['y'] + fb[1], it['x'] + fb[2], it['y'] + fb[3])
        if not _box_behind(ub, bx):
            # boxes that overlap (the footprint's margin) have no order: the game then draws by depth —
            # the player's x + y against the prop's sortDepth (renderer.placeProp / unitDepth)
            if _box_behind(bx, ub) or px + py >= it['x'] + it['y'] + min(fb[2] - fb[0], fb[3] - fb[1]) * 0.35:
                continue
        # the feet in the sprite's own pixels (drawn at x - anchor·k, scaled by k)
        fx = ((px - it['x']) - (py - it['y'])) * 20 / k + anc[0]
        fy = ((px - it['x']) + (py - it['y'])) * 10 / k + anc[1]
        if fx + 7 / k < 0 or fx - 7 / k >= w or fy - BODY_H / k >= h or fy < 0:
            continue
        hit = 0
        for dx in (-6, 0, 6):
            xx = int(fx + dx / k)
            if not 0 <= xx < w:
                continue
            for t in (0.2, 0.45, 0.7, 0.9):
                yy = int(fy - BODY_H * t / k)
                if 0 <= yy < h and a[xx, yy] > 128:
                    hit += 1
        if it['p'] in B:  # (a street prop in front of someone is ordinary: only the floor it hides counts)
            best = max(best, hit / 12)
        # the feet: two of three points across them, just above the floor
        yy = int(fy - 3 / k)
        if 0 <= yy < h and sum(1 for dx in (-6, 0, 6) if 0 <= int(fx + dx / k) < w and a[int(fx + dx / k), yy] > 128) >= 2:
            feet = True
    return best, feet


tall = {'low': [], 'up': []}
for it in P.items:
    a, w, h, anc, k, fb = _sprite(it['p']) if (it['p'] in B or it['p'] in S) else (None, 0, 0, 0, 1, 0)
    # the structures (a person's size and more across): a lamp post or a sign in front of someone only
    # cuts a sliver from him, as anything does in this view
    if a is not None and h * k > 30:
        tall[it['level']].append(it)
hidden = 0
floor_seen = {}  # closed tile -> its floor is in view (closed, yet it looks like open ground)
_fp = [row[:] for row in blocked]  # the footprints' own blocking (the game does that itself)
for level, (X0, Y0, X1, Y1) in (('low', LOW), ('up', UP)):
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            if blocked[y][x]:
                continue
            # closed where one could not see where one stands (the feet hidden at the centre or at two of
            # four points round it), or where a building would cover nearly all of the body (3 of 4 points):
            # what is in view is walkable, what is not is not — no invisible walls on open floor
            # the centre and two points across the tile (left and right on screen)
            centre, feet_c = _covers(x + 0.5, y + 0.5, level)
            feet_l = _covers(x + 0.2, y + 0.8, level)[1]
            feet_r = _covers(x + 0.8, y + 0.2, level)[1]
            feet_hidden = feet_c or (feet_l and feet_r)
            if feet_hidden or centre >= 0.6:
                blocked[y][x] = 1
                hidden += 1
                floor_seen[(x, y)] = not feet_hidden
if os.environ.get('DEBUG_MAP'):
    _x0, _y0, _x1, _y1 = map(int, os.environ['DEBUG_MAP'].split(','))
    for _y in range(_y0, _y1):
        print(f'{_y:4d} ' + ''.join('#' if _fp[_y][_x] else ('x' if blocked[_y][_x] == 1 else ('~' if blocked[_y][_x] == 2 else '.')) for _x in range(_x0, _x1)))
if os.environ.get('DEBUG_TILES'):
    for _t in json.loads(os.environ['DEBUG_TILES']):
        _lv = 'low' if _t[1] >= LOW[1] else 'up'
        print('tile', _t, 'blocked', blocked[_t[1]][_t[0]], 'fp', _fp[_t[1]][_t[0]], 'covers', _covers(_t[0] + 0.5, _t[1] + 0.5, _lv))
        for it in tall[_lv]:
            a_, w_, h_, anc_, k_, fb_ = _sprite(it['p'])
            bx = (it['x'] + fb_[0], it['y'] + fb_[1], it['x'] + fb_[2], it['y'] + fb_[3])
            if abs(it['x'] - _t[0]) < 12 and abs(it['y'] - _t[1]) < 12:
                print('   ', it['p'], it['x'], it['y'], [round(v, 2) for v in bx], _box_behind((_t[0] + 0.25, _t[1] + 0.25, _t[0] + 0.75, _t[1] + 0.75), bx))
print(f'closed {hidden} tiles where something would hide the player ({sum(floor_seen.values())} of them with their floor in view)')


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
# pockets cut off by the closing above: closed too (no one is placed where no one can walk to)
for (x0, y0, x1, y1) in (LOW, UP):
    for y in range(y0, y1):
        for x in range(x0, x1):
            if blocked[y][x] == 0 and (x, y) not in low_reach and (x, y) not in up_reach:
                blocked[y][x] = 1
                hidden += 1
                floor_seen[(x, y)] = not _covers(x + 0.5, y + 0.5, 'low' if y >= LOW[1] else 'up')[1]
seen_closed = sorted(t for t, v in floor_seen.items() if v)
print(f'closed tiles that look open (floor in view): {len(seen_closed)}')
_left = set(seen_closed)
while _left:
    _q = [_left.pop()]
    _grp = list(_q)
    while _q:
        cx_, cy_ = _q.pop()
        for d_ in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n_ = (cx_ + d_[0], cy_ + d_[1])
            if n_ in _left:
                _left.remove(n_)
                _q.append(n_)
                _grp.append(n_)
    print(f'  {len(_grp)} at x {min(t[0] for t in _grp)}-{max(t[0] for t in _grp)}, y {min(t[1] for t in _grp)}-{max(t[1] for t in _grp)}')
# --- what is closed yet in view (a nook beside a building that the closing cut off) is dressed with junk —
# crates, barrels, scrap — so it reads as blocked, not as open floor with an invisible wall
FILL = ['crateStack', 'barrelPile', 'scrapHeap', 'crateBarrels', 'compactorUnit', 'trashCompactor']
_k = 0
for (tx, ty) in seen_closed:
    if _fp[ty][tx] or not floor_seen.get((tx, ty)):
        continue
    level = 'low' if ty >= LOW[1] else 'up'
    for _t in range(len(FILL) * 5):
        n = FILL[(_k + _t) % len(FILL)]
        x0_, y0_, x1_, y1_, _ = S[n]
        sh = ((0, 0), (-0.5, 0), (0.5, 0), (0, -0.5), (0, 0.5))[_t // len(FILL)]
        cx_, cy_ = tx + 0.5 + sh[0], ty + 0.5 + sh[1]
        r = (cx_ + x0_, cy_ + y0_, cx_ + x1_, cy_ + y1_)
        if any(it['level'] == level and r[0] < it['rect'][2] - 0.1 and r[2] > it['rect'][0] + 0.1 and r[1] < it['rect'][3] - 0.1 and r[3] > it['rect'][1] + 0.1 for it in P.items):
            continue
        # not onto a street: at most one walkable tile under it
        under = [(xx, yy) for yy in range(math.floor(r[1]), math.floor(r[3] - 1e-6) + 1) for xx in range(math.floor(r[0]), math.floor(r[2] - 1e-6) + 1)]
        if sum(1 for (xx, yy) in under if blocked[yy][xx] == 0) > 2 or any(blocked[yy][xx] == 2 for (xx, yy) in under):
            continue
        P.put(n, cx_, cy_, level, filler=True)
        for (xx, yy) in under:  # (left in the closed runs: the game blocks only tiles whose centre is in a footprint)
            blocked[yy][xx] = 1
        _k += 1
        break
_dressed = set()
for it in P.items:
    if it.get('filler'):
        r = it['rect']
        for yy in range(math.floor(r[1] - 0.5), math.floor(r[3] + 0.5) + 1):
            for xx in range(math.floor(r[0] - 0.5), math.floor(r[2] + 0.5) + 1):
                _dressed.add((xx, yy))
undressed = [t for t in seen_closed if t not in _dressed and not _fp[t[1]][t[0]]]
print(f'dressed with {_k} junk props; still bare: {len(undressed)} {undressed[:8]}')
low_reach = reach((int(LIFT_LOW[0] + 1.6), int(LIFT_LOW[1] + 3)))
up_reach = reach((int(PAD[0] - 4), int(PAD[1] + 1.5)))
# what the game must close besides the footprints: rows of [x0, x1, y] runs
closed_runs = []
for y in range(MAP):
    x = 0
    while x < MAP:
        if blocked[y][x] == 1 and _fp[y][x] == 0:
            x0 = x
            while x < MAP and blocked[y][x] == 1 and _fp[y][x] == 0:
                x += 1
            closed_runs.append([x0, x, y])
        else:
            x += 1
free_low = sum(1 for y in range(LOW[1], LOW[3]) for x in range(LOW[0], LOW[2]) if blocked[y][x] == 0)
free_up = sum(1 for y in range(UP[1], UP[3]) for x in range(UP[0], UP[2]) if blocked[y][x] == 0)


def ok(pt, level):
    x, y = pt
    return (int(x), int(y)) in (low_reach if level == 'low' else up_reach)


PROBLEMS = []


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
        PROBLEMS.append(f'no reachable tile near {pt} ({level})')
        return [round(pt[0], 1), round(pt[1], 1)]
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
    if side == 'n':
        return ((r[0] + r[2]) / 2, r[1] - off)
    return (r[2] + off, (r[1] + r[3]) / 2)


homes = [nearest_ok(front_of(t, 's'), 'low') for t in nw_towers] + [nearest_ok(front_of(t, 'e'), 'low') for t in w_towers]
homes += [nearest_ok(front_of(s, 's'), 'low') for s in rowB_w + rowB_e]
homes += [nearest_ok(front_of(s, 'n', 1.4), 'low', 6) for s in rowA_w[:3]]  # (row B backs onto their south sides)
gate = [nearest_ok(front_of(w, 's', 1.0), 'low') for w in works[:2]]
factory_gate = [gate[0], [gate[0][0] + 2.2, gate[0][1] + 0.4], [gate[0][0] - 1.8, gate[0][1] - 0.4]]
factory_gate = [nearest_ok(p, 'low') for p in factory_gate]
market = [nearest_ok((PLAZA[0] + math.cos(a) * 5.2, PLAZA[1] + math.sin(a) * 4.4), 'low') for a in [i * math.pi / 4 for i in range(8)]]
cantina_sq = [nearest_ok((bar_door[0] + dx, bar_door[1] + dy), 'low') for dx, dy in [(-3, 1.2), (-1, 2.4), (1.5, 2.0), (3.5, 1.0), (0.5, 3.4), (-4.5, -0.4)]]
billboards = [nearest_ok(p, 'low') for p in [(98, neon_club['rect'][3] + 1.6), front_of(rowB_w[1], 's', 1.4), front_of(rowA_e[2], 's', 1.4), front_of(rowB_e[1], 's', 1.4)]]
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
        if not ok(p, lv):
            PROBLEMS.append(f'unreachable place point {p}')
for pa in patrols:
    for p in pa['route']:
        if not ok(p, pa['level']):
            PROBLEMS.append(f'unreachable patrol point {p}')

lights = [
    [shaft[0], shaft[1], 7, 200, 225, 255, 170, 0.01],  # the shaft of daylight
    [lift_low[0], lift_low[1] - 1, 2.4, 120, 160, 190, 70, 0.02],
    [overlook[0], overlook[1], 2.0, 110, 150, 180, 80, 0.02],
]
for it in P.items:
    if it['level'] == 'low' and it['p'] == 'lightPost':
        lights.append([it['x'], it['y'], 3.4, 190, 165, 135, 70, 0.02])
    if it['level'] == 'low' and it['p'] == 'lightPostHolo':
        lights.append([it['x'], it['y'], 3.0, 110, 160, 185, 60, 0.03])
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
    'closed': closed_runs,  # [x0, x1, y]: tiles hidden behind buildings, and pockets cut off by them
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
if not PROBLEMS:
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
            if floor_seen.get((x, y)):
                c = (230, 60, 160)  # closed, yet its floor is in view: looks open
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
if PROBLEMS:
    print('PROBLEMS (nothing written):')
    for e in PROBLEMS:
        print('  ' + e)
    sys.exit(1)
