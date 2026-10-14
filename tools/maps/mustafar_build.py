"""The Mustafar duel map, built as the 2005 Battlefront II "Mustafar: Refinery" lays it out (the reference video,
reference/mustafar_set/Rapid421_-_2005_Mustafar_in_Battlefront_II_2017___WIP.mp4, walked in order), out of the
film's set pieces (public/sprites/mustafar) and the parts cut from them (tools/sprites/mustafar_set/parts.py, in the near walls' atlas).

    python3 tools/maps/mustafar_build.py -> public/maps/mustafar.json

The route, in world coordinates (x to the screen's lower right, y to its lower left; 1 tile = 1 m):

  landing pad   the rock shelf by the river, Padmé's skiff (x 118, y 118), the facility's facade behind it
  gate          the covered portal in the facade (118, 100), into
  corridor      the entry corridor north, 22 m (x 118, y 78–100): windows on its west wall, low walls east
  conference    the Separatist conference room (118, 70), 16 m square, the table and chairs, consoles, the cut
                far corner; a covered connector east out of it
  lava hall     the refinery's bridge room (x 132–162, y 64–76): a grated catwalk down the middle over two lava
                pools, pillars and rails along it, tall ribbed walls on the far sides — the Force-push beat
  control room  (176, 70): the holo-tables, the screens, the shield core (the red console), its cut corner; a
                covered passage south out of it
  terrace       the exterior walkway along the facility's south face (x 156–190, y 84–92) over the lava, pillars
                and a lit edge wall; from its west end the grated catwalk south (x 160, y 92–118) to the lifting
                arm, over the river
  river         the lava river (x 134–148, y 82–134) with the collector arm standing in it (141, 101–123), the
                service pipe over it (145.5, 96–110), lava falls pouring in from its west bank; the black-sand
                bank east of it (152, 112) — the high ground
  mountain      rock along the north and west, the lava sea everywhere else

The map file's keys and what reads them: src/world/worldgen.js MustafarArena (the ground, the way, the props, the
lights, the rooms' floor plan, the raised tops) — see that file's generate(). The duel's set boxes (MUSTAFAR_D there)
and src/game/duelMustafar.js PIPE are kept in step with this file by hand: the constants at the top here.
"""
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/maps/mustafar.json'
W = H = 192

# ------------------------------------------------------------------------------------------------ the layout
DECK = (118, 118)
CORRIDOR = dict(x=118, y0=78, y1=100)  # x 116.5–119.5
GATE_Y = 100
HALL = dict(x=118, y=70, hw=8, hh=8)
LAVA_HALL = dict(x0=132, x1=162, y0=64, y1=76, walk=(68, 72))  # the catwalk's rows
CONTROL = dict(x=176, y=70, hw=8, hh=8)
TERRACE = dict(x0=156, x1=190, y0=84, y1=92)
DOOR4 = (176, 84)
CATWALK = dict(x=160, y0=92, y1=118)
RIVER = dict(x0=134, x1=148, y0=82, y1=134)
ARM = dict(x=141, y=112, hh=11)
PIPE = dict(x=145.5, y0=96, y1=110.5)
BANK = (152, 112)
SEED = 7

BAYS = [1, 2.5, 3, 3.5, 4, 4.5, 5]
TALL = [2, 3, 4, 4.5, 5, 6]
LEDGE = [2, 4, 6]

biome = [['~'] * W for _ in range(H)]
blocked = [['#'] * W for _ in range(H)]
props = []
lights = []
plan = []
surfaces = []
rng = random.Random(SEED)


def n6(v):
    return round(float(v), 6) if isinstance(v, float) else v


def fill(x0, y0, x1, y1, b, walk=False):
    """Tiles whose centres lie in [x0, x1) x [y0, y1)."""
    for y in range(max(0, math.floor(y0)), min(H, math.ceil(y1))):
        for x in range(max(0, math.floor(x0)), min(W, math.ceil(x1))):
            if x0 <= x + 0.5 < x1 and y0 <= y + 0.5 < y1:
                biome[y][x] = b
                blocked[y][x] = '.' if walk else '#'


def ellipse(cx, cy, rx, ry, b, walk=False):
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                biome[y][x] = b
                blocked[y][x] = '.' if walk else '#'


def prop(sheet, x, y, **kw):
    e = {'sheet': sheet, 'x': n6(x), 'y': n6(y)}
    for k, v in kw.items():
        if v is not None and v is not False:
            e[k] = v
    props.append(e)
    return e


def light(x, y, z, r, g, b, rad, flicker=0.05, id=None):
    e = {'x': n6(x), 'y': n6(y), 'z': z, 'r': r, 'g': g, 'b': b, 'rad': rad, 'flicker': flicker}
    if id:
        e['id'] = id
    lights.append(e)


# --------------------------------------------------------------------------------------------- wall builders
def pick(S, lengths):
    """Bays of one length covering S metres with the least overshoot (the longest when equal): (L, n, over)."""
    best = None
    for L in lengths:
        n = max(1, math.ceil(S / L - 1e-6))
        over = n * L - S
        if best is None or over < best[2] - 1e-9 or (abs(over - best[2]) < 1e-9 and L > best[0]):
            best = (L, n, over)
    return best


def low_run(axis, at, a0, a1, cut, from_far=True):
    """A room's near wall along `axis` (x: at y = at, facing +y; y: at x = at, facing +x) from a0 to a1, in bays
    with a pillar at both ends; the bays stacked from the far end (a0), the last cut short to end on a1."""
    S = a1 - a0
    if S < 0.6:
        return
    L, n, over = pick(S, BAYS)
    for i in range(n):
        c = a0 + L / 2 + i * L
        clip = None
        if i == n - 1 and over > 0.01:
            c = a1 - L / 2 + over
            clip = [0, round(over, 3)] if axis == 'x' else [round(over, 3), 0]
        if axis == 'x':
            prop(f'mfWall{L:g}', c, at, cut=cut, clip=clip)
        else:
            # (the image's left end is the +y end along y: its clip's l trims that end — the run's bays stack from
            # the far end a0 = −y, so the cut-short one is at a1 = +y, trimmed at its +y end)
            prop(f'mfWall{L:g}_y', at, c, cut=cut, clip=clip)


def near_walls(x0, y0, x1, y1, gaps_x=(), gaps_y=(), end_x=True, end_y=True):
    """A room box's near walls (+y side along x at y1 − 0.25, +x side along y at x1 − 0.25): the corner piece on
    the near corner, the far ends closed by the end pieces, door gaps left open (jamb pillars on their sides)."""
    cut = [x0, y0, x1, y1]
    wy = y1 - 0.25
    wx = x1 - 0.25
    arm = 0.95
    # along x: from the far end x0 to the corner
    pts = [x0 + 1.625 if end_x else x0 + 0.25] + [v for g in sorted(gaps_x) for v in g] + [wx - arm]
    if end_x:
        prop('mfWallEnd', x0 + 0.4625, wy, cut=cut)
    for a0, a1 in zip(pts[0::2], pts[1::2]):
        low_run('x', wy, a0, a1, cut)
    pts = [y0 + 1.625 if end_y else y0 + 0.25] + [v for g in sorted(gaps_y) for v in g] + [wy - arm]
    if end_y:
        prop('mfWallEnd_y', wx, y0 + 0.4625, cut=cut)
    for a0, a1 in zip(pts[0::2], pts[1::2]):
        low_run('y', wx, a0, a1, cut)
    prop('mfWallCorner', wx, wy, cut=cut)


def tall_run(axis, at, a0, a1, cut=None):
    """A tall ribbed wall (3 m) along `axis` from a0 to a1 (x: facing +y at y = at; y: facing +x at x = at)."""
    S = a1 - a0
    if S < 1.5:
        return
    L, n, over = pick(S, TALL)
    for i in range(n):
        c = a0 + L / 2 + i * L
        if i == n - 1 and over > 0.01:
            c = a1 - L / 2  # (overlapping the one before: the ribs repeat)
        if axis == 'x':
            prop(f'mfTall{L:g}', c, at, cut=cut)
        else:
            prop(f'mfTall{L:g}_y', at, c, cut=cut)


def ledge_run(axis, at, a0, a1):
    S = a1 - a0
    if S < 1.5:
        return
    L, n, over = pick(S, LEDGE)
    for i in range(n):
        c = a0 + L / 2 + i * L
        if i == n - 1 and over > 0.01:
            c = a1 - L / 2
        prop(f'mfLedge{L:g}' + ('' if axis == 'x' else '_y'), c if axis == 'x' else at, at if axis == 'x' else c)


def rail_run(axis, at, a0, a1, pillars=True):
    """Rails along the catwalk's edge in 4.5 m bays, a pillar at each post."""
    S = a1 - a0
    n = max(1, round(S / 4.5))
    L = S / n
    for i in range(n):
        c = a0 + L / 2 + i * L
        name = 'mfRail4.5' + ('' if axis == 'x' else '_y')
        prop(name, c if axis == 'x' else at, at if axis == 'x' else c, flat=True)
    if pillars:
        for i in range(n + 1):
            a = a0 + i * L
            prop('mfPillar', a if axis == 'x' else at, at if axis == 'x' else a)


# ---------------------------------------------------------------------------------------------- the ground
def ground():
    # the rock bench the facility stands on, the shelf by the river, the terrace's bench
    fill(100, 54, 192, 100, ':')
    fill(96, 96, 140, 136, ':')
    fill(148, 78, 192, 100, ':')
    fill(148, 100, 162, 128, ':')
    # the landing pad: the current map's plate deck (x 107–125, y 109–127), kept as it was laid
    deck = [
        (109, 115, 121), (110, 114, 122), (111, 113, 123), (112, 107, 112), (112, 113, 123), (113, 107, 124), (114, 107, 124),
        (115, 107, 124), (116, 107, 124), (117, 107, 124), (118, 107, 124), (119, 107, 124), (120, 107, 124), (121, 107, 124),
        (122, 112, 124), (123, 113, 123), (124, 113, 123), (125, 114, 122), (126, 115, 121),
    ]
    for y, x0, x1 in deck:
        fill(x0, y, x1, y + 1, 'M', True)
    # the river, its basin
    fill(RIVER['x0'], RIVER['y0'], RIVER['x1'], RIVER['y1'], '~')
    for y in range(RIVER['y0'], RIVER['y1']):  # the banks wander
        w = 1 + int(1.5 + 1.5 * math.sin(y * 0.37) + math.sin(y * 0.11))
        fill(RIVER['x0'] - w, y, RIVER['x0'], y + 1, '~')
        fill(RIVER['x1'], y, RIVER['x1'] + max(0, w - 1), y + 1, '~')
    fill(134, 134, 160, 192, '~')
    # the bank: black sand, walked on (the ending's high ground)
    fill(149, 104, 158, 124, ':', True)
    # the collector arm's deck in the river
    fill(ARM['x'] - 2, ARM['y'] - ARM['hh'], ARM['x'] + 2, ARM['y'] + ARM['hh'], '#', True)
    # the corridor
    fill(CORRIDOR['x'] - 1.5, CORRIDOR['y0'], CORRIDOR['x'] + 1.5, CORRIDOR['y1'] + 8, 'M', True)
    plan.append({'x': CORRIDOR['x'], 'y': (CORRIDOR['y0'] + CORRIDOR['y1'] + 8) / 2, 'hw': 1.5, 'hh': (CORRIDOR['y1'] + 8 - CORRIDOR['y0']) / 2, 'axis': 'y', 'runner': True})
    # the rooms: the floor out to the far walls' consoles (pad), blocked under them
    for R, extra in ((HALL, {}), (CONTROL, {'pit': 2.6})):
        x0, y0, x1, y1 = R['x'] - R['hw'], R['y'] - R['hh'], R['x'] + R['hw'], R['y'] + R['hh']
        fill(x0 - 1, y0 - 1, x1, y1, 'M')
        fill(x0, y0, x1, y1, 'M', True)
        plan.append({'x': R['x'], 'y': R['y'], 'hw': R['hw'], 'hh': R['hh'], 'axis': 'y', 'edge': 2, 'cell': 4.5, 'cut': 2.12, 'pad': 1, **extra})
    # the lava hall: pools either side of the grated catwalk
    L = LAVA_HALL
    fill(L['x0'], L['y0'], L['x1'], L['y1'], '~')
    fill(L['x0'], L['walk'][0], L['x1'], L['walk'][1], '#', True)
    # the connectors (covered corridors, 4 m wide) either side of it, and out of the control room
    for cx in (L['x0'] - 3, L['x1'] + 3):
        fill(cx - 3, 68, cx + 3, 72, 'M', True)
        plan.append({'x': cx, 'y': 70, 'hw': 3, 'hh': 2, 'axis': 'x', 'runner': True})
    fill(DOOR4[0] - 2, CONTROL['y'] + CONTROL['hh'], DOOR4[0] + 2, DOOR4[1], 'M', True)
    plan.append({'x': DOOR4[0], 'y': (CONTROL['y'] + CONTROL['hh'] + DOOR4[1]) / 2, 'hw': 2, 'hh': (DOOR4[1] - CONTROL['y'] - CONTROL['hh']) / 2, 'axis': 'y', 'runner': True})
    # the terrace: plate floor
    T = TERRACE
    fill(T['x0'], T['y0'], T['x1'], T['y1'], 'M', True)
    # the catwalk south over the lava, and the lava under and round it
    fill(CATWALK['x'] - 4, CATWALK['y0'], CATWALK['x'] + 6, 140, '~')
    fill(CATWALK['x'] - 1, CATWALK['y0'], CATWALK['x'] + 1, CATWALK['y1'], '#', True)


# ------------------------------------------------------------------------------------------------- the sets
def landing_pad():
    prop('mfSkiff_y', 109, 116.5, block=True)
    prop('cgCanister', 120.8, 111.9, block=True)
    prop('cgDrum', 112.7, 122.6, block=True)
    prop('cgCrateL', 121.5, 123.2, block=True)
    prop('cgCube', 123.4, 122.1, block=True)
    props.append({'type': 'cloakPile', 'x': 119.6, 'y': 115.8, 'variant': 0, 'angleIdx': 0, 'flat': True, 'id': 'cloak', 'hidden': True})
    props.append({'type': 'robePile', 'x': 116.2, 'y': 121.4, 'variant': 0, 'angleIdx': 0, 'flat': True, 'id': 'robe', 'hidden': True})
    # the pad's lamps, a ring of them (as before)
    for i in range(14):
        a = i / 14 * 2 * math.pi
        light(DECK[0] + 9 * math.cos(a), DECK[1] + 12 * math.sin(a), 0.2, 255, 120, 40, 150, 0.12)
    # the facility's facade behind the pad: tall ribbed wall either side of the gate
    tall_run('x', GATE_Y, 104, CORRIDOR['x'] - 2)
    tall_run('x', GATE_Y, CORRIDOR['x'] + 2, 132)
    prop('mfCorridor', CORRIDOR['x'], GATE_Y)  # the gate: a covered portal facing the pad
    prop('mfPassageS', CORRIDOR['x'], GATE_Y - 3, flat=True)
    light(CORRIDOR['x'], GATE_Y + 1.5, 1.5, 255, 160, 80, 150, 0.08)


def corridor():
    C = CORRIDOR
    x = C['x']
    cut = [x - 1.5, C['y0'], x + 1.5, C['y1']]
    # the west wall: two window walls looking out on the lava, low wall between and beyond
    for wy in (84, 90):
        prop('mfWindow_r', x - 2, wy)
    low_run('y', x - 2, C['y0'] + 0.25, 81.25, None)
    prop('mfWall1_y', x - 2, 87)
    low_run('y', x - 2, 92.75, C['y1'] - 6, None)
    # the east wall: low walls, cut away while someone is inside
    low_run('y', x + 2.25, C['y0'] + 0.25, C['y1'] - 6, cut)
    for wy in (81, 87, 93):
        light(x, wy, 2.6, 255, 170, 100, 110, 0.03)


def conference():
    R = HALL
    x0, y0, x1, y1 = R['x'] - R['hw'], R['y'] - R['hh'], R['x'] + R['hw'], R['y'] + R['hh']
    # the far walls: the cut corner's head-on screen console, consoles along the north and the west
    prop('mfConsoleD', x0 + 0.73, y0 + 0.73)
    for i in range(4):
        prop('mfConsole', x0 + 3.6 + i * 3.3, y0 - 0.3)
    for i in range(4):
        prop('mfConsole_r', x0 - 0.3, y0 + 3.6 + i * 3.3)
    # the table down the room, the council's chairs along its west side and at its head
    tx, ty = R['x'], R['y'] + 1
    prop('mfTable_y', tx, ty, flat=True)
    surfaces.append({'x0': tx - 0.8, 'y0': ty - 4, 'x1': tx + 0.8, 'y1': ty + 4, 'z': 0.78})
    prop('mfChair', tx, ty - 4.7, flat=True)
    for i in range(5):
        prop('mfChair_x', tx - 1.35, ty - 3.2 + i * 1.5, flat=True)
    # the near walls: the doorway south (the corridor), east (the connector to the lava hall)
    cx = CORRIDOR['x']
    near_walls(x0, y0, x1, y1, gaps_x=[(cx - 1.9, cx + 1.9)], gaps_y=[(68, 72)])
    light(R['x'], R['y'], 2.5, 255, 150, 90, 220, 0.03)
    light(R['x'] - 4, R['y'] - 4, 3.2, 235, 240, 255, 130, 0.02)
    light(R['x'] + 3, R['y'] + 3, 3.2, 235, 240, 255, 130, 0.02)


def lava_hall():
    L = LAVA_HALL
    x0, x1, y0, y1 = L['x0'], L['x1'], L['y0'], L['y1']
    w0, w1 = L['walk']
    cut = [x0, y0, x1, y1]
    # the connectors: the covered corridor in from the conference room, and out to the control room (their open
    # insides under them, seen while someone is in them)
    for cx in (x0, x1 + 6):
        prop('mfCorridor_r', cx, 70)
        prop('mfPassageS_x', cx - 3, 70, flat=True)
        light(cx - 3, 70, 1.6, 255, 160, 80, 110, 0.05)
    # the far walls: tall ribbed wall north, and west of the pools either side of the connector
    tall_run('x', y0 - 0.3, x0, x1)
    tall_run('y', x0 - 0.3, y0, 68)
    tall_run('y', x0 - 0.3, 72, y1)
    # the near walls: low walls south and east, the east one open where the connector leaves
    wy = y1 - 0.25
    wx = x1 - 0.25
    prop('mfWallEnd', x0 + 0.4625, wy, cut=cut)
    low_run('x', wy, x0 + 1.625, wx - 0.95, cut)
    low_run('y', wx, y0 + 0.25, 68, cut)
    low_run('y', wx, 72, wy - 0.95, cut)
    prop('mfWallCorner', wx, wy, cut=cut)
    # the catwalk's rails and pillars along both edges
    rail_run('x', w0 - 0.4, x0 + 0.6, x1 - 0.6)
    rail_run('x', w1 + 0.4, x0 + 0.6, x1 - 0.6)
    # the lava's glow from both pools, the lamps over the walk
    for x in range(x0 + 2, x1, 4):
        light(x, y0 + 2, 0.2, 255, 120, 40, 140, 0.15)
        light(x, y1 - 2, 0.2, 255, 120, 40, 140, 0.15)
    for x in range(x0 + 3, x1, 6):
        light(x, 70, 3.2, 255, 190, 120, 130, 0.03)
        light(x, y0 + 0.5, 1.6, 255, 170, 100, 120, 0.04)


def control_room():
    R = CONTROL
    x0, y0, x1, y1 = R['x'] - R['hw'], R['y'] - R['hh'], R['x'] + R['hw'], R['y'] + R['hh']
    prop('mfConsoleD', x0 + 0.73, y0 + 0.73)
    for i in range(4):
        prop('mfConsole', x0 + 3.6 + i * 3.3, y0 - 0.3)
    # the west wall: the shield core (red) by the far corner, the screens south of the doorway
    prop('mfConsoleRed_r', x0 - 0.3, y0 + 4.5)
    prop('mfConsole_r', x0 - 0.3, y0 + 11.6)
    prop('mfConsole_r', x0 - 0.3, y0 + 14.9)
    low_run('y', x0 - 0.3, y0 + 6.2, 68 - 0.4, None)
    # the two holo-tables, walked over
    for dy in (-3.2, 1.4):
        hx, hy = R['x'] - 1.3, R['y'] + dy
        prop('mfHoloX', hx, hy, flat=True)
        surfaces.append({'x0': hx - 2.2, 'y0': hy - 0.9, 'x1': hx + 2.2, 'y1': hy + 0.9, 'z': 1})
        light(hx, hy, 0.1, 90, 210, 255, 110, 0.05)
    # the near walls: the doorway south to the terrace passage
    near_walls(x0, y0, x1, y1, gaps_x=[(DOOR4[0] - 2.1, DOOR4[0] + 2.1)], end_y=True)
    light(R['x'], R['y'], 2.5, 255, 150, 90, 220, 0.03)
    light(R['x'], R['y'], 2.5, 255, 40, 30, 0, 0.5, id='alarm')
    for dx, dy in ((-3, -3), (3, 3), (-4, 4), (4, -4)):
        light(R['x'] + dx, R['y'] + dy, 3.2, 235, 240, 255, 150, 0.02)
    # the passage south out of it
    prop('mfCorridor', DOOR4[0], DOOR4[1])
    prop('mfPassageS', DOOR4[0], DOOR4[1] - 3, flat=True)


def terrace():
    T = TERRACE
    x0, x1, y0, y1 = T['x0'], T['x1'], T['y0'], T['y1']
    # the facility's south face: tall wall either side of the passage
    tall_run('x', y0 - 0.3, x0, DOOR4[0] - 2)
    tall_run('x', y0 - 0.3, DOOR4[0] + 2, x1)
    # the edges over the lava: the lit edge wall, open where the catwalk leaves
    cw = CATWALK['x']
    ledge_run('x', y1 - 0.2, x0, cw - 1.5)
    ledge_run('x', y1 - 0.2, cw + 1.5, x1)
    ledge_run('y', x1 - 0.2, y0, y1 - 0.2)
    ledge_run('y', x0 + 0.2, y0, y1 - 0.2)
    # the colonnade along the edge
    for x in range(x0 + 7, x1 - 1, 6):
        prop('mfPillar', x, y1 - 0.9)
    for x in range(x0 + 2, x1 - 1, 6):
        if abs(x - DOOR4[0]) > 3:
            light(x, y0 + 1, 2.8, 255, 180, 110, 150, 0.03)
    for x in range(x0 + 4, x1 - 1, 6):
        light(x, (y0 + y1) / 2, 0.3, 255, 150, 90, 120, 0.03)
    for x in range(x0 + 3, x1, 4):
        light(x, y1 + 1.5, 0.2, 255, 120, 40, 120, 0.12)
    # the catwalk out over the lava to the lifting arm
    C = CATWALK
    prop('mfCatwalkL_y', C['x'], (C['y0'] + C['y1']) / 2, flat=True)
    prop('mfLift_y', C['x'], C['y1'], flat=True)
    for y in range(C['y0'] + 2, C['y1'], 4):
        light(C['x'] - 3, y, 0.2, 255, 120, 40, 130, 0.12)
        light(C['x'] + 3, y, 0.2, 255, 120, 40, 130, 0.12)


def river():
    # the collector arm standing in the river (its tower at the +y end), the lava falls on the west bank
    prop('mfArm_y', ARM['x'], ARM['y'], flat=True)
    for fy in (92, 102, 112):
        prop('mfFall', RIVER['x0'] - 1.6, fy)
    for y in range(RIVER['y0'] + 4, RIVER['y1'], 6):
        light(ARM['x'] + 3, y, 0.2, 255, 110, 30, 150, 0.12)
    for y in range(96, 112, 5):
        light(PIPE['x'] - 2, y, 0.2, 255, 130, 40, 120, 0.12)


def mountain():
    """Rock along the bench's north edge and west edge: a mass three rows deep, the biggest at the back, the crags
    and piles in front overlapping, so it reads as the mountain the facility is cut into."""
    def row(pts, kinds, jitter=1.5):
        for x, y in pts:
            k = rng.choice(kinds)
            prop(k, x + rng.uniform(-jitter, jitter), y + rng.uniform(-jitter, jitter))
    big = [f'rk1_{i}' for i in range(9)]
    wall = [f'rk4_{i}' for i in range(6)]
    crag = [f'rk2_{i}' for i in range(8)]
    pile = [f'rk3_{i}' for i in range(6)]
    # north: the back row of the big ones, then the wall-sized ones, then crags at the bench's edge
    row([(x, 40) for x in range(94, 192, 7)], big, 2)
    row([(x, 47) for x in range(90, 192, 5)], wall, 1.5)
    row([(x, 53) for x in range(92, 192, 4)], wall + crag, 1.2)
    row([(x, 58) for x in range(104, 128, 3)] + [(x, 58) for x in range(132, 164, 3)] + [(x, 58) for x in range(172, 192, 3)], crag + pile, 0.8)
    # west: down the bench's edge to the landing pad, and the pad's own rock shoulder
    row([(90, y) for y in range(44, 100, 6)], big, 2)
    row([(96, y) for y in range(52, 100, 4)], wall, 1.2)
    row([(102, y) for y in range(60, 98, 3)], crag + pile, 0.8)
    row([(96, y) for y in range(100, 136, 5)], wall + big, 1.5)
    row([(103, y) for y in range(104, 134, 4)], crag + pile, 0.8)
    row([(x, 134) for x in range(100, 126, 5)], crag + pile, 1)
    # the river's head, and the crags on its far bank and the lava sea's shore
    row([(x, 77) for x in range(134, 150, 3)], crag + pile, 0.8)
    row([(128, y) for y in range(84, 134, 5)], pile + crag, 1)
    row([(130, 138), (140, 140), (152, 136), (164, 134), (168, 126), (172, 118), (186, 100), (186, 110)], crag + pile, 1)


def pois():
    return [
        {'x': DECK[0], 'y': DECK[1], 'r': 13, 'name': '무스타파 · 착륙장'},
        {'x': CORRIDOR['x'], 'y': 89, 'r': 9, 'name': '무스타파 · 입구 복도'},
        {'x': HALL['x'], 'y': HALL['y'], 'r': 10, 'name': '무스타파 · 분리주의 회의실'},
        {'x': (LAVA_HALL['x0'] + LAVA_HALL['x1']) / 2, 'y': 70, 'r': 14, 'name': '무스타파 · 용암 다리'},
        {'x': CONTROL['x'], 'y': CONTROL['y'], 'r': 10, 'name': '무스타파 · 제어실'},
        {'x': (TERRACE['x0'] + TERRACE['x1']) / 2, 'y': 88, 'r': 12, 'name': '무스타파 · 외부 발코니'},
        {'x': CATWALK['x'], 'y': 108, 'r': 8, 'name': '무스타파 · 외부 발코니'},
        {'x': ARM['x'], 'y': ARM['y'], 'r': 13, 'name': '무스타파 · 집하기 팔'},
        {'x': BANK[0], 'y': BANK[1], 'r': 9, 'name': '무스타파 · 용암 강'},
    ]


def main():
    ground()
    landing_pad()
    corridor()
    conference()
    lava_hall()
    control_room()
    terrace()
    river()
    mountain()
    # the way: a prop that blocks marks its footprint's tiles (the cargo, the skiff — the set's walls stand on
    # tiles the ground already blocks, or on the rooms' edge tiles)
    fp = {}
    for f in ('cargo.json', 'lowwall.json', 'rocks.json'):
        fp.update({k: v['footprint'] for k, v in json.loads((ROOT / 'public/sprites/mustafar' / f).read_text())['sprites'].items()})
    for f in (ROOT / 'public/sprites/mustafar').glob('mf*.json'):
        fp[f.stem] = json.loads(f.read_text())['footprint']
    for e in props:
        if not e.get('block') or 'sheet' not in e:
            continue
        s = e['sheet']
        q = fp.get(s) or [[y, x] for x, y in fp[s[:-2] if s.endswith('_y') else s + '_y']]
        xs = [e['x'] + p[0] for p in q]
        ys = [e['y'] + p[1] for p in q]
        for y in range(math.floor(min(ys)), math.ceil(max(ys))):
            for x in range(math.floor(min(xs)), math.ceil(max(xs))):
                if 0 <= x < W and 0 <= y < H and min(xs) <= x + 0.5 < max(xs) and min(ys) <= y + 0.5 < max(ys) and blocked[y][x] == '.':
                    blocked[y][x] = 'o'
    # the list order is the draw order within a layer: the flats first as laid, then the standing pieces by depth
    # (worldgen.js sorts those), the rocks before the sets (behind them)
    rocks = [e for e in props if e.get('sheet', '').startswith('rk')]
    rest = [e for e in props if not e.get('sheet', '').startswith('rk')]
    m = {
        'format': 'cw-map',
        'version': 1,
        'w': W,
        'h': H,
        'ambient': [150, 86, 70],
        'grade': 'mustafar',
        'spawn': {'x': 119.5, 'y': 116.5},
        'ashLit': [148, 100, 160, 128],
        'pois': pois(),
        'floorPlan': plan,
        'surfaces': surfaces,
        'biomeKey': {'M': 'MUSTAFAR', '~': 'LAVA', ':': 'ASH', '#': 'GRATE'},
        'biome': [''.join(r) for r in biome],
        'blockedKey': {'.': 'walkable', 'o': 'blocked (a prop)', '#': 'blocked (the ground: lava, rock, a wall)'},
        'blocked': [''.join(r) for r in blocked],
        'props': rocks + rest,
        'lights': lights,
    }
    one = json.dumps
    field = lambda k, v: (f'  {one(k)}: [\n' + ',\n'.join('    ' + one(e, ensure_ascii=False) for e in v) + '\n  ]') if isinstance(v, list) and v and not isinstance(v[0], (int, float)) else f'  {one(k)}: {one(v, ensure_ascii=False)}'  # noqa: E731
    text = '{\n' + ',\n'.join(field(k, v) for k, v in m.items()) + '\n}\n'
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    out.write_text(text)
    print(out, len(props), 'props', len(lights), 'lights', len(plan), 'rooms')


if __name__ == '__main__':
    main()
