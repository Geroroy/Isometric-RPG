"""The Mustafar duel map, built as the LEGO model of the film's facility lays it out (reference/mustafar_set/lego:
the landing pad, the gate and its corridor, the big octagonal room with the holo-tables, the conference room with
the long table behind it, the colonnaded balcony along the front), out of the film's set pieces
(public/sprites/mustafar) and the parts cut from them (tools/sprites/mustafar_set/parts.py, in the near walls' atlas).

    python3 tools/maps/mustafar_build.py -> public/maps/mustafar.json

The layout, in world coordinates (x to the screen's lower right, y to its lower left; 1 tile = 1 m):

  landing pad   the plate deck on the rock shelf by the river (118, 118), Padmé's skiff on it, the lamps round
                its rim, the hazard-striped crates by the gate
  gate          the covered portal in the facade (118, 100), its box's east face with the octagonal lava window
  corridor      north, 11 m (x 118, y 89–100): the ribbed wall west, the octagon window east (the LEGO's)
  control room  the big room (118, 80), 18 m square with its far corner cut: the two holo-tables, the screens,
                the lava windows on its far walls, the shield core (the red console) on the west wall, the floor
                stepped up at the back; doors south (the corridor), west (the junction), east (the balcony)
  junction      the short covered passage west (106, 80) into
  conference    the conference room (96, 80), 14 × 12 m: the long table and the council's chairs, the lava
                windows all round
  balcony       the colonnade along the control room's east face (x 127–132, y 66–94) over the river: pillars,
                the rail, the roof lamps; from its south end the steps down and the grated catwalk east over the
                river (y 96, x 132–158) to the lifting arm
  river         the lava river (x 134–148, y 82–134) with the collector arm standing in it (141, 101–123), the
                service pipe over it (145.5, 96–110), the falls at its head; the black-sand bank east of it
                (152, 112) — the high ground
  mountain      rock along the north and west, the lava sea everywhere else
  cliff         the bench (UPPER boxes) stands CLIFF m over the river and the sea: rock faces below its near edges
                (terrain.js cliffFace), the lower level (the river, the arm, the bank) moved out past their foot

The map file's keys and what reads them: src/world/worldgen.js MustafarArena (the ground, the way, the props, the
lights, the rooms' floor plan, the raised tops) — see that file's generate(). The duel's set boxes (MUSTAFAR there)
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
GATE_Y = 100
CORRIDOR = dict(x=118, y0=89, y1=100)  # x 116.5–119.5
CONTROL = dict(x=118, y=80, hw=9, hh=9)
JUNCTION = dict(x=106, y=80, hw=3, hh=2)
HALL = dict(x=96, y=80, hw=7, hh=6)
DOOR4 = (127, 86)
COLONNADE = dict(x0=127, x1=132, y0=66, y1=94)
CATWALK = dict(y=96, x0=132, x1=158)  # out over the drop, its end over the river
RIVER = dict(x0=146, x1=160, y0=82, y1=134)  # the lower level: beyond the cliff's foot (CLIFF m down)
ARM = dict(x=153, y=112, hh=11)
PIPE = dict(x=157.5, y0=96, y1=110.5)
BANK = (164, 112)
# the bench up on the cliff: the ground in these boxes (not lava) stands CLIFF m over the rest (terrain.js cliffFace)
UPPER = [[76, 36, 134, 100], [100, 100, 130, 130], [126, 94, 134, 100]]
CLIFF = 7
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
    # the rock bench the facility stands on, the shelf by the river, the far bank
    fill(84, 56, 134, 100, ':')
    fill(102, 100, 130, 130, ':')
    fill(126, 94, 134, 100, ':')
    # the lower level: the river's banks, far below
    fill(134, 60, 146, 134, ':')
    fill(160, 78, 178, 132, ':')
    # the landing pad: the plate deck (x 107–125, y 109–127), as laid before
    deck = [
        (109, 115, 121), (110, 114, 122), (111, 113, 123), (112, 107, 112), (112, 113, 123), (113, 107, 124), (114, 107, 124),
        (115, 107, 124), (116, 107, 124), (117, 107, 124), (118, 107, 124), (119, 107, 124), (120, 107, 124), (121, 107, 124),
        (122, 112, 124), (123, 113, 123), (124, 113, 123), (125, 114, 122), (126, 115, 121),
    ]
    for y, x0, x1 in deck:
        fill(x0, y, x1, y + 1, 'M', True)
    # the river, its banks wandering
    fill(RIVER['x0'], RIVER['y0'], RIVER['x1'], RIVER['y1'], '~')
    for y in range(RIVER['y0'], RIVER['y1']):
        w = 1 + int(1.5 + 1.5 * math.sin(y * 0.37) + math.sin(y * 0.11))
        fill(RIVER['x0'] - min(w, 1), y, RIVER['x0'], y + 1, '~')
        fill(RIVER['x1'], y, RIVER['x1'] + max(0, w - 1), y + 1, '~')
    fill(130, 134, 172, 192, '~')
    # the bank: black sand, walked on (the ending's high ground)
    fill(161, 104, 170, 124, ':', True)
    # the collector arm's deck in the river
    fill(ARM['x'] - 2, ARM['y'] - ARM['hh'], ARM['x'] + 2, ARM['y'] + ARM['hh'], '#', True)
    # the corridor and the gate's covered walk down to the pad
    C = CORRIDOR
    fill(C['x'] - 1.5, C['y0'], C['x'] + 1.5, C['y1'] + 7, 'M', True)
    plan.append({'x': C['x'], 'y': (C['y0'] + C['y1'] + 7) / 2, 'hw': 1.5, 'hh': (C['y1'] + 7 - C['y0']) / 2, 'axis': 'y', 'runner': True})
    # the rooms: the floor out to the far walls' consoles (pad), blocked under them
    for R, extra in ((HALL, {}), (CONTROL, {'pit': 2.6})):
        x0, y0, x1, y1 = R['x'] - R['hw'], R['y'] - R['hh'], R['x'] + R['hw'], R['y'] + R['hh']
        fill(x0 - 1, y0 - 1, x1, y1, 'M')
        fill(x0, y0, x1, y1, 'M', True)
        plan.append({'x': R['x'], 'y': R['y'], 'hw': R['hw'], 'hh': R['hh'], 'axis': 'y', 'edge': 2, 'cell': 4.5, 'cut': 2.12, 'pad': 1, **extra})
    # the junction (a covered passage 4 m wide) between them
    J = JUNCTION
    fill(J['x'] - J['hw'], J['y'] - J['hh'], J['x'] + J['hw'], J['y'] + J['hh'], 'M', True)
    plan.append({'x': J['x'], 'y': J['y'], 'hw': J['hw'], 'hh': J['hh'], 'axis': 'x', 'runner': True})
    # the colonnade: plate floor, and the landing at its south end
    K = COLONNADE
    fill(K['x0'], K['y0'], K['x1'], K['y1'] + 4, 'M', True)
    # the catwalk east over the river, the lava under and round it
    W_ = CATWALK
    fill(W_['x0'] + 2, W_['y'] - 4, W_['x1'] + 6, W_['y'] + 4, '~')
    fill(W_['x0'], W_['y'] - 1, W_['x1'], W_['y'] + 1, '#', True)
    fill(RIVER['x0'] - 2, RIVER['y0'] - 4, RIVER['x1'] + 2, RIVER['y0'], ':')  # the river's head: rock under the falls


# ------------------------------------------------------------------------------------------------- the sets
def landing_pad():
    prop('mfSkiff_y', 110.5, 117, block=True)
    prop('cgCanister', 120.8, 111.9, block=True)
    prop('cgDrum', 112.7, 122.6, block=True)
    prop('cgCrateL', 121.5, 123.2, block=True)
    prop('cgCube', 123.4, 122.1, block=True)
    props.append({'type': 'cloakPile', 'x': 119.6, 'y': 115.8, 'variant': 0, 'angleIdx': 0, 'flat': True, 'id': 'cloak', 'hidden': True})
    props.append({'type': 'robePile', 'x': 116.2, 'y': 121.4, 'variant': 0, 'angleIdx': 0, 'flat': True, 'id': 'robe', 'hidden': True})
    # the pad's rim lamps (the LEGO's white blocks with amber lights), a ring of them
    for i in range(14):
        a = i / 14 * 2 * math.pi
        light(DECK[0] + 9 * math.cos(a), DECK[1] + 12 * math.sin(a), 0.2, 255, 120, 40, 150, 0.12)
    # the facade behind the pad: tall ribbed wall either side of the gate, the gate box's east face with the
    # octagonal lava window (the LEGO model's)
    tall_run('x', GATE_Y, 108, CORRIDOR['x'] - 2)
    prop('mfTallWin4', CORRIDOR['x'] + 4, GATE_Y)
    tall_run('x', GATE_Y, CORRIDOR['x'] + 6, 128)
    prop('mfCorridor', CORRIDOR['x'], GATE_Y)  # the gate: a covered portal facing the pad
    prop('mfPassageS', CORRIDOR['x'], GATE_Y - 3, flat=True)
    light(CORRIDOR['x'], GATE_Y + 1.5, 1.5, 255, 160, 80, 150, 0.08)
    light(CORRIDOR['x'] + 4, GATE_Y + 1.2, 1.7, 255, 140, 50, 130, 0.08)
    # the hazard-striped crates flanking the gate (the LEGO's)
    prop('cgCrateS', CORRIDOR['x'] - 4.2, GATE_Y + 1.6, block=True)
    prop('cgCrateS', CORRIDOR['x'] + 4.6, GATE_Y + 2.4, block=True)
    prop('cgCube', CORRIDOR['x'] - 5.4, GATE_Y + 2.9, block=True)


def corridor():
    C = CORRIDOR
    x = C['x']
    cut = [x - 1.5, C['y0'], x + 1.5, C['y1']]
    # the west wall: the facility's ribbed wall (the LEGO's buttressed pillars)
    tall_run('y', x - 2, C['y0'] - 0.3, C['y1'] - 6)
    # the east wall: ribbed wall with the octagonal lava window in its middle, cut away while someone is inside
    tall_run('y', x + 2.25, C['y0'] + 0.25, 92.25, cut)
    prop('mfTallWin4_y', x + 2.25, 94.25, cut=cut)
    for wy in (91, 97):
        light(x, wy, 2.6, 255, 170, 100, 110, 0.03)
    light(x + 3.2, 94.25, 1.7, 255, 140, 50, 120, 0.08)


def conference():
    R = HALL
    x0, y0, x1, y1 = R['x'] - R['hw'], R['y'] - R['hh'], R['x'] + R['hw'], R['y'] + R['hh']
    # the far walls: lava windows all round (the LEGO's), the cut corner's screen console
    prop('mfConsoleD', x0 + 0.73, y0 + 0.73)
    prop('mfWindow', x0 + 5.0, y0 - 0.3)
    prop('mfWindow', x0 + 11.0, y0 - 0.3)
    prop('mfWindow_r', x0 - 0.3, y0 + 5.0)
    prop('mfWindow_r', x0 - 0.3, y0 + 9.5)
    low_run('y', x0 - 0.3, y0 + 12.25, y1 - 0.25, None)
    # the table down the room (along y), the council's chairs along its west side and at its head
    tx, ty = R['x'] + 0.5, R['y']
    prop('mfTable_y', tx, ty, flat=True)
    surfaces.append({'x0': tx - 0.8, 'y0': ty - 4, 'x1': tx + 0.8, 'y1': ty + 4, 'z': 0.78})
    prop('mfChair', tx, ty - 4.7, flat=True)
    for i in range(5):
        prop('mfChair_x', tx - 1.35, ty - 3.2 + i * 1.5, flat=True)
    # the near walls: the doorway east (the junction)
    near_walls(x0, y0, x1, y1, gaps_y=[(JUNCTION['y'] - 1.9, JUNCTION['y'] + 1.9)])
    light(R['x'], R['y'], 2.5, 255, 150, 90, 220, 0.03)
    light(R['x'] - 4, R['y'] - 3, 3.2, 255, 200, 140, 130, 0.02)
    light(R['x'] + 3, R['y'] + 3, 3.2, 255, 200, 140, 130, 0.02)
    # the junction: the covered passage in from the control room, its open inside under it
    J = JUNCTION
    prop('mfCorridor_r', J['x'] + J['hw'], J['y'])
    prop('mfPassageS_x', J['x'], J['y'], flat=True)
    light(J['x'], J['y'], 1.6, 255, 160, 80, 110, 0.05)


def control_room():
    R = CONTROL
    x0, y0, x1, y1 = R['x'] - R['hw'], R['y'] - R['hh'], R['x'] + R['hw'], R['y'] + R['hh']
    # the far walls: the lava windows with screens between (the LEGO's), the cut corner's head-on console
    prop('mfConsoleD', x0 + 0.73, y0 + 0.73)
    prop('mfWindow', x0 + 5.5, y0 - 0.3)
    prop('mfConsole', x0 + 9.9, y0 - 0.3)
    prop('mfWindow', x0 + 14.5, y0 - 0.3)
    low_run('x', y0 - 0.3, x0 + 17.25, x1 - 0.25, None)
    # the west wall: the shield core (the red console) by the far corner, the doorway to the junction in its
    # middle, a lava window south of it
    prop('mfConsoleRed_r', x0 - 0.3, y0 + 4.5)
    prop('mfWindow_r', x0 - 0.3, y0 + 14.5)
    low_run('y', x0 - 0.3, y0 + 17.25, y1 - 0.25, None)
    # the two holo-tables, walked over
    for dx, dy in ((-2.2, -2.0), (2.2, 2.6)):
        hx, hy = R['x'] + dx, R['y'] + dy
        prop('mfHoloX', hx, hy, flat=True)
        surfaces.append({'x0': hx - 2.2, 'y0': hy - 0.9, 'x1': hx + 2.2, 'y1': hy + 0.9, 'z': 1})
        light(hx, hy, 0.1, 90, 210, 255, 110, 0.05)
    # the near walls: the doorway south (the corridor) and east (the balcony)
    cx = CORRIDOR['x']
    near_walls(x0, y0, x1, y1, gaps_x=[(cx - 1.9, cx + 1.9)], gaps_y=[(DOOR4[1] - 2.0, DOOR4[1] + 2.0)])
    light(R['x'], R['y'], 2.5, 255, 150, 90, 220, 0.03)
    light(R['x'] - 7.4, R['y'] - 3.5, 2.5, 255, 40, 30, 0, 0.5, id='alarm')
    for dx, dy in ((-3, -3), (3, 3), (-4, 4), (4, -4)):
        light(R['x'] + dx, R['y'] + dy, 3.2, 255, 220, 170, 150, 0.02)


def colonnade():
    """The balcony along the control room's east face (the LEGO's colonnade): pillars with lamps, the rail along
    the edge, the roof's lamps; the steps down at its south end to the catwalk out over the river."""
    K = COLONNADE
    x0, x1, y0, y1 = K['x0'], K['x1'], K['y0'], K['y1']
    # the control room's east wall seen from outside, north of the door: the ribbed facade; the end wall north
    tall_run('x', y0 - 0.3, x0, x1)
    # the rail along the edge over the river, open where the steps go down; a pillar at each post
    rail_run('y', x1 - 0.3, y0 + 0.5, y1 - 0.5)
    for y in range(y0 + 2, y1, 4):
        light(x1 - 0.6, y, 2.2, 255, 200, 120, 90, 0.04)  # the pillars' lamps
        light(x0 + 1.5, y, 3.0, 255, 190, 110, 110, 0.03)  # the roof's lamps
    for y in range(y0 + 1, y1, 4):
        light(x1 + 2.5, y, 0.2, 255, 120, 40, 130, 0.12)  # the lava below
    # the steps down at the south end, onto the landing and the catwalk
    prop('mfStairs', (x0 + x1) / 2, y1 - 0.5, flat=True)
    prop('mfLedge4', (x0 + x1) / 2, y1 + 3.8)
    W_ = CATWALK
    prop('mfCatwalkL', (W_['x0'] + W_['x1']) / 2, W_['y'], flat=True)
    prop('mfLift', W_['x1'], W_['y'], flat=True)
    for x in range(W_['x0'] + 2, W_['x1'], 4):
        light(x, W_['y'] - 3, 0.2, 255, 120, 40, 130, 0.12)
        light(x, W_['y'] + 3, 0.2, 255, 120, 40, 130, 0.12)


def river():
    # the collector arm standing in the river (its tower at the +y end), the falls at the river's head
    prop('mfArm_y', ARM['x'], ARM['y'], flat=True)
    for fx in (149, 156):
        prop('mfFall~m', fx, RIVER['y0'] - 1.6)
    # the lava's glow up the cliff's foot (the light map lights the faces)
    for y in range(62, 130, 6):
        light(135.5, y, 0.2, 255, 110, 30, 150, 0.12)
    for x in range(104, 130, 6):
        light(x, 131.5, 0.2, 255, 110, 30, 150, 0.12)
    for y in range(RIVER['y0'] + 4, RIVER['y1'], 6):
        light(ARM['x'] + 3, y, 0.2, 255, 110, 30, 150, 0.12)
    for y in range(98, 112, 5):
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
    row([(x, 46) for x in range(80, 150, 7)], big, 2)
    row([(x, 53) for x in range(78, 150, 5)], wall, 1.5)
    row([(x, 59) for x in range(82, 150, 4)], wall + crag, 1.2)
    row([(x, 64) for x in range(84, 134, 3)], crag + pile, 0.8)
    # west: down the bench's edge to the landing pad, and the pad's own rock shoulder
    row([(78, y) for y in range(44, 110, 6)], big, 2)
    row([(83, y) for y in range(52, 110, 4)], wall, 1.2)
    row([(87, y) for y in range(62, 104, 3)], crag + pile, 0.8)
    row([(96, y) for y in range(100, 130, 5)], wall + big, 1.5)
    row([(103, y) for y in range(104, 128, 4)], crag + pile, 0.8)
    # the river's head, the crags on its far bank and the lava sea's shore
    row([(x, 72) for x in range(146, 164, 4)], crag + wall, 1)
    row([(x, 66) for x in range(148, 168, 5)], wall + big, 1.5)
    row([(170, y) for y in range(76, 104, 5)], wall + crag, 1)
    row([(166, 134), (174, 128), (176, 116), (178, 104), (130, 138), (150, 140)], crag + pile, 1)


def pois():
    return [
        {'x': DECK[0], 'y': DECK[1], 'r': 13, 'name': '무스타파 · 착륙장'},
        {'x': CORRIDOR['x'], 'y': 95, 'r': 6, 'name': '무스타파 · 입구 복도'},
        {'x': CONTROL['x'], 'y': CONTROL['y'], 'r': 10, 'name': '무스타파 · 제어실'},
        {'x': JUNCTION['x'], 'y': JUNCTION['y'], 'r': 3.5, 'name': '무스타파 · 연결 통로'},
        {'x': HALL['x'], 'y': HALL['y'], 'r': 9, 'name': '무스타파 · 분리주의 회의실'},
        {'x': (COLONNADE['x0'] + COLONNADE['x1']) / 2, 'y': 80, 'r': 15, 'name': '무스타파 · 외부 발코니'},
        {'x': (CATWALK['x0'] + CATWALK['x1']) / 2, 'y': CATWALK['y'], 'r': 13, 'name': '무스타파 · 외부 발코니'},
        {'x': ARM['x'], 'y': ARM['y'], 'r': 13, 'name': '무스타파 · 집하기 팔'},
        {'x': BANK[0], 'y': BANK[1], 'r': 9, 'name': '무스타파 · 용암 강'},
    ]


def main():
    ground()
    landing_pad()
    corridor()
    conference()
    control_room()
    colonnade()
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
        base = s[:-2] if s.endswith('~m') else s
        q = fp.get(base) or [[y, x] for x, y in fp[base[:-2] if base.endswith('_y') else base + '_y']]
        if s.endswith('~m'):
            q = [[y, x] for x, y in q]
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
        'ashLit': [160, 100, 172, 128],
        'upper': UPPER,
        'cliff': CLIFF,
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
