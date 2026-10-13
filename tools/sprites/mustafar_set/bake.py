"""Mustafar set pieces from cut-out renders (reference/color_rots): the conference table, the window wall with the
lava outside, the high-backed chair.

    python3 tools/sprites/mustafar_set/bake.py -> public/sprites/mustafar/mf{Table,Window,Chair}*.{png,json}

As the consoles (tools/sprites/mustafar_console/bake.py): each render scaled to the game's projection (ART_GUIDE.md:
20 px across a metre along an axis, Z_PX 24.5 up) from a measured length and height, then sheared so its main axis
runs at the 2:1 slope; drawn at 2x (k 0.5); the body darkened to the facility's ash metal; glowing parts (the
window's lava view and lamps) on a neon layer drawn after the light map. A render on a baked-in checkerboard (the
chair) is cut out first: the light grey ground flood-filled from the borders.

- `mfTable`: along x, 8 m long (the film's long table, its pointed end to +x), 0.78 m tall
- `mfWindow`: against a north wall (faces +y), 5.5 m long, 2.8 m tall; `mfWindow_r` mirrored for a west wall
- `mfHoloX`: the control room's holo-table (image_20: an elongated hexagon, its top a glowing blue map, red indicator
  lights round the rim), along x, 4.4 m by 1.8 m, 1 m tall, fitted on eight points with its verticals kept vertical;
  the render's own colours, no glow layer or light
- `mfFall`: a lava fall (image_21: a rock cliff with three falls pouring into a cracked lava pool), the cliff along
  y, the pool in front of it to +x; 7 m of cliff, the pool 1.6 m deep, fitted on the pool's four corners (the cliff's
  height follows the render); the lava glowing; `mfFall_x` its twin (cliff along x, pool to +y)
- `mfSkiff`: Padmé's chrome star skiff (image_22), on its landing gear; 9 m nose to tail, 8.8 m across the wings,
  fitted on its three wheels, its nose and its wing tips; its shadow baked on the deck under it. Shipped as
  `mfSkiff_y` (nose to +y: along the landing apron)
- `mfChair`: faces +y (mirrored from the render, which faces +x: `mfChair_x`), 1.5 m tall
- `mfConsoleD`: the screen console seen head-on (image_30), across a room's cut far corner (the diagonal, facing
  +x+y): the render is turned a little, so its facade's plane is warped by a perspective map (`quad`) onto the
  true head-on rectangle, 3.42 m; its copper body matched to the wall consoles' grey (`match`); the screen and
  lamps on a neon layer
- the near walls (image_31): tools/sprites/mustafar_set/lowwall.py, an atlas of bays of several lengths
- `mfWallEnd_y`: a room's near side closed at its far end (image_32: a pipe-run panel between two pillars, each with
  a sloped buttress, rendered head-on): its middle taken out (`cutx`) to 2.33 m pillar to pillar, the facade warped
  (`quad`) onto a wall along y facing +x (the conference room's right side, from the far wall's last console to the
  near wall's first pillar); pillars 2.7 m as the consoles'; `mfWallEnd` its twin (along x, facing +y). Shipped in
  the near walls' atlas (lowwall.py)
- `mfWallCorner`: a room's near corner seen from outside (image_33: the two near walls' fronts meeting in a pillar,
  a buttress at each arm's end), its arms 0.95 m along −x and −y, 2.7 m tall; the render's camera a little lower than
  the game's, so each face is warped onto its own plane (`quads`: one perspective map a face, folded on the corner's
  line). Placed on both rooms' near corners, the bays beside it cut short to its arms' ends (the map's `clip`)
- `mfWallCornerIn`: the same corner seen from inside (image_34), the corner at the back, its arms 1.45 m along +y
  and +x; warped the same way. Shipped for a concave corner of the near walls (none in the rooms as laid out)
- `mfPassage`: a corridor's inside with no roof (the far wall tall with light panels, the near wall low, a portal at
  each end), along y, 15 m by 4 m (the far wall on −x); `mfPassage_x` along x as rendered. Fitted by least squares
  on five measured corners (the render's own proportions differ: the walkway is narrowed to the corridor's)
- `mfPassageS`: the same inside cut to 6 m (`shorten`: its middle bays taken out, the far end moved up), the inside
  of the covered corridor from the control room out to the balcony; `mfPassageS_x` along x
- `mfArm`: the collector arm (reference image_14: the vane head at its outer end, the long grated arm, the mast and
  its stays), along x, the head to −x, 22 m of deck; seen nearly as the game sees it, so scaled evenly
- `mfCatwalkL`: the outside catwalk (image_15: a grated deck, a rail on its far side), along x, rendered 17 m long and
  lengthened to 26 m (`lengthen`: the middle's 2.25 m stretch, a rail post's spacing, repeated)
- `mfLift`: the lifting arm at the catwalk's end (image_28: a grated beam into a cage of curved vanes), along x, the
  head to +x, the beam's end (the anchor) on the deck's level; the beam sheared onto the 2:1 slope, 8 m of it
  (both walked on: drawn with the ground, `flat`)
- `mfDroid`: the droid Anakin rides down the lava river (image_16: a round deck on legs and arms), a unit's
  single frame: the anchor on the deck's top (he stands there), the legs hanging below it; the render's soft white
  halo dropped (only its opaque pixels kept)
- `mfPlatform`: the hover platform Obi-Wan rides (image_18: a railed deck on rollers, a lamp on a pipe), the same way:
  the deck about 2.4 m by 1.6 m, the anchor on the deck's top centre
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
REF = ROOT / 'reference/color_rots'
OUT = ROOT / 'public/sprites/mustafar'
OVER = 2  # px per game px (a piece's `over`: 4 for the small props, 2 for the big walked-on ones)
BODY_GAIN = 0.78

PIECES = {
    'mfTable': dict(
        over=4,
        src='image_19.png',  # the film's table, dark top with its light strip and red indicator lights
        # render px -> (x, y, z) m, along x, the pointed end to +x, 8 m by 1.6 m, the top 0.78 m up; the render is
        # seen in a little perspective, so the game's angle comes from a least-squares fit over all eight
        corners=[
            ((38, 128), (-4, 0.8, 0.78)),  # the top's near-left corner
            ((330, 36), (-4, -0.8, 0.78)),  # far-left
            ((1630, 520), (3.2, -0.8, 0.78)),  # where the far edge turns to the point
            ((1338, 742), (3.2, 0.8, 0.78)),  # where the near edge turns
            ((1750, 688), (4, 0, 0.78)),  # the point
            ((245, 402), (-3, 0.35, 0)),  # the feet's fronts on the floor
            ((668, 622), (0, 0.35, 0)),
            ((1150, 846), (3, 0.35, 0)),
        ],
        footprint=[[-4, -0.85], [4, -0.85], [4, 0.85], [-4, 0.85]],
        emit='table',
        ship='mirror',  # (placed along y in the world)
        shadow=0.78,  # the top's height: its shadow cast onto the floor, baked under it
        gain=0.9,
        lights=[[0, 0, 1.2, 235, 240, 255, 70, 0.02]],  # the strip's light on the top and round it
        mirror='mfTable_y',
        flat=True,
    ),
    'mfHoloX': dict(  # the control room's holo-table along x (two side by side: public/maps/mustafar.json)
        over=4,
        src='image_20.png',
        corners=[
            ((145, 190), (-2.2, 0, 1.0)),  # the top's points and corners
            ((455, 115), (-1.4, -0.9, 1.0)),
            ((1255, 270), (1.4, -0.9, 1.0)),
            ((1635, 445), (2.2, 0, 1.0)),
            ((1350, 550), (1.4, 0.9, 1.0)),
            ((445, 395), (-1.4, 0.9, 1.0)),
            ((515, 632), (-1.22, 0.7, 0)),  # the plinth's near corners on the floor (narrower than the top:
            ((1305, 818), (1.22, 0.7, 0)),  # its sides slant in, measured off the near edges' lengths)
        ],
        vertical=True,  # (the render's verticals kept vertical: an unconstrained fit tipped the top forward)
        footprint=[[-2.2, -0.9], [2.2, -0.9], [2.2, 0.9], [-2.2, 0.9]],
        shadow=1.0,
        gain=1.0,  # (the render as it is: no glow layer, no darkening)
    ),
    'mfFall': dict(
        src='image_21.png',
        corners=[
            ((1240, 545), (0, -3.5, 0)),  # the pool's back-right corner, at the cliff's foot
            ((1365, 605), (1.6, -3.5, 0)),  # front-right
            ((820, 880), (1.6, 3.5, 0)),  # front-left
            ((650, 790), (0, 3.5, 0)),  # back-left, at the cliff's foot
        ],
        footprint=[[-1, -3.5], [1.6, -3.5], [1.6, 3.5], [-1, 3.5]],
        emit='lava',
        gain=0.8,
        neon_base=0.6,
        lights=[[0.8, 0, 1.0, 200, 95, 30, 120, 0.12]],
        mirror='mfFall_x',
    ),
    'mfSkiff': dict(
        over=4,
        src='image_22.png',
        corners=[
            ((1278, 795), (2.4, 0, 0)),  # the nose wheel on the deck
            ((1012, 668), (-0.6, -0.4, 0)),  # the main wheels
            ((668, 712), (-1.2, 2.3, 0)),
            ((1532, 780), (4.6, 0, 1.0)),  # the nose cone's tip
            ((150, 602), (-2.4, 4.4, 1.15)),  # the wing tips' trailing roots
            ((1602, 214), (-2.4, -4.4, 1.15)),
        ],
        footprint=[[-4.4, -1.2], [4.6, -1.2], [4.6, 1.2], [-4.4, 1.2]],
        shadow=1.0,
        gain=0.92,
        mirror='mfSkiff_y',
        ship='mirror',  # (along the apron, y, in the world)
    ),
    'mfWindow': dict(
        over=4,
        src='image_7.png',
        axis=((205, 555), (1215, 840)),  # the lamp boxes' front feet: along +x
        span=(1310, 5.5),
        height=(600, 2.8),
        ground=(710, 698),  # between the lamp boxes' feet
        back=0.5,  # m behind those feet to the wall's middle
        footprint=[[-2.75, -0.5], [2.75, -0.5], [2.75, 0.5], [-2.75, 0.5]],
        lights=[[0, 1.2, 1.4, 255, 120, 50, 110, 0.08]],  # the lava's glow through the glass
        emit=True,
        mirror='mfWindow_r',
    ),
    'mfConsoleD': dict(
        src='image_30.png',  # the screen console seen head-on: across a room's cut far corner, facing +x+y (the camera)
        over=4,
        # the render is turned a little (its right end toward the camera: taller and lower): its facade's front
        # plane — the pillars' front faces' outer corners — warped by a perspective map onto the true rectangle
        # (quad: TL, TR, BR, BL -> (x, y, z) m), the wall along (1, −1)/√2, 3.42 m wide, 2.7 m tall, the facade
        # 0.25 m in front of the anchor
        quad=[
            ((268, 152), (-1.032, 1.386, 2.7)),
            ((1485, 196), (1.386, -1.032, 2.7)),
            ((1485, 831), (1.386, -1.032, 0)),
            ((268, 757), (-1.032, 1.386, 0)),
        ],
        footprint=[[-1.387, 1.033], [1.033, -1.387], [1.281, -1.139], [-1.139, 1.281]],
        lights=[[0.7, 0.7, 1.5, 230, 190, 90, 110, 0.04]],
        emit='screen',
        glow_boxes=[(560, 300, 1300, 560), (440, 560, 1330, 660), (300, 470, 370, 520), (1410, 560, 1460, 600)],
        # the render's copper body matched to the wall consoles' grey (mfConsole: saturation 0.08, luma 0.24)
        match=dict(sat=0.18, gain=1.31),
        opaque=True,  # (the render's faint halo dropped: it reached the canvas's edges)
        gain=1.0,
    ),
    'mfWallEnd_y': dict(
        src='image_32.png',
        over=4,
        # the render head-on (pillars 33..1480 across, foot 786, pillar tops 118: 247 px a metre at 2.7 m); 722 px of
        # its middle panel taken out, symmetric about its plaque (x 757): pillar centres 2.33 m apart, 2.94 m outside
        cutx=(396, 1118, 0),
        # its front (the pillars' outer corners) onto the wall along y, its face at the anchor's x, facing +x: the
        # render's left end to +y (screen left)
        quad=[
            ((33, 118), (0, 1.4675, 2.7)),
            ((758, 118), (0, -1.4675, 2.7)),
            ((758, 786), (0, -1.4675, 0)),
            ((33, 786), (0, 1.4675, 0)),
        ],
        footprint=[[-0.5, -1.4675], [-0.5, 1.4675], [0, 1.4675], [0, -1.4675]],
        gain=0.9,  # (as the near walls')
        mirror='mfWallEnd',
    ),
    'mfWallCorner': dict(
        src='image_33.png',
        over=4,
        # a room's near corner seen from outside (image_33: the two near walls' fronts meeting in a pillar with a
        # cut edge, a sloped buttress at each arm's end): the corner on the anchor, its arms along −x (the render's
        # left) and −y (its right), their fronts on the walls' fronts (x and y of the anchor), 0.95 m each, 2.7 m
        # tall as the pillars. The render's camera is a little lower than the game's (its tops slope ~0.45, not
        # 0.5): each face warped onto its own plane (`quads`, folded at the corner's line, x 800), the corner's
        # edge where the two fronts' lines meet (the cut edge 16 px above it)
        quads=[
            ((0, 800), [((627, 160), (-0.95, 0, 2.7)), ((800, 238), (0, 0, 2.7)), ((800, 838), (0, 0, 0)), ((627, 760), (-0.95, 0, 0))]),
            ((800, 1587), [((800, 238), (0, 0, 2.7)), ((963, 162), (0, -0.95, 2.7)), ((963, 762), (0, -0.95, 0)), ((800, 838), (0, 0, 0))]),
        ],
        footprint=[[0, 0], [-0.95, 0], [-0.95, -0.5], [-0.5, -0.5], [-0.5, -0.95], [0, -0.95]],
        emit='screen',
        glow_boxes=[(850, 220, 910, 290)],  # (the red lamp)
        gain=0.8,  # (a little lighter than the near walls' render: matched to their luma)
    ),
    'mfWallCornerIn': dict(
        src='image_34.png',
        over=4,
        # the same corner seen from inside (image_34): the corner at the back on the anchor, its arms along +y (the
        # render's left) and +x (its right), their fronts on x and y of the anchor, 1.45 m each, 2.7 m tall; the
        # render in some perspective (the feet slope 0.64, the tops 0.57): each face warped onto its plane
        quads=[
            ((0, 800), [((540, 210), (0, 1.45, 2.7)), ((800, 100), (0, 0, 2.7)), ((800, 665), (0, 0, 0)), ((540, 831), (0, 1.45, 0))]),
            ((800, 1587), [((800, 100), (0, 0, 2.7)), ((1060, 210), (1.45, 0, 2.7)), ((1060, 831), (1.45, 0, 0)), ((800, 665), (0, 0, 0))]),
        ],
        footprint=[[0, 0], [0, 1.45], [-0.5, 1.45], [-0.5, -0.5], [1.45, -0.5], [1.45, 0]],
        emit='screen',
        glow_boxes=[(600, 210, 660, 275), (930, 210, 990, 275)],
        gain=0.85,
    ),
    'mfPassage_x': dict(
        src='image_9.png',
        # render px -> (x, y, z) m, along x, the far wall on −y; L 15, W 4 (outside the walls), H 3
        corners=[
            ((290, 355), (-7.5, 2, 0)),  # the near wall's foot at the far end
            ((1200, 870), (7.5, 2, 0)),  # the near end's near pillar, its foot
            ((1450, 775), (7.5, -2, 0)),  # the near end's far pillar, its foot
            ((545, 15), (-7.5, -2, 3)),  # the far wall's top at the far end
            ((1430, 495), (7.5, -2, 3)),  # the far wall's top at the near end
        ],
        footprint=[[-7.5, -2], [7.5, -2], [7.5, 2], [-7.5, 2]],
        mirror='mfPassage',
        flat=True,
    ),
    'mfPassageS_x': dict(
        src='image_9.png',  # the same corridor's inside, cut to 6 m (its middle bays taken out: `shorten`)
        corners=[
            ((290, 355), (-7.5, 2, 0)),
            ((1200, 870), (7.5, 2, 0)),
            ((1450, 775), (7.5, -2, 0)),
            ((545, 15), (-7.5, -2, 3)),
            ((1430, 495), (7.5, -2, 3)),
        ],
        shorten=(-4.5, 4.5),  # the stretch between taken out, the far end moved up to the near
        near_wall=1.0,  # m: the near wall's height (the far wall and the portals are the corners' 3 m)
        footprint=[[-3, -2], [3, -2], [3, 2], [-3, 2]],
        mirror='mfPassageS',
        flat=True,
    ),
    'mfArm': dict(
        src='image_14.png',
        axis=((575, 395), (1430, 800)),  # the deck's centre line, head to end
        span=(855, 22.0),
        uniform=True,  # near the game's own view: one scale both ways
        ground=(1002, 597),  # the deck's middle
        back=0,
        footprint=[[-11, -1.5], [11, -1.5], [11, 1.5], [-11, 1.5]],
        mirror='mfArm_y',
        flat=True,
        gain=1.0,
    ),
    'mfCatwalkL': dict(
        src='image_15.png',  # the same catwalk lengthened to 26 m (the balcony out to the lifting arm)
        axis=((105, 118), (1650, 710)),
        span=(1580, 17.0),
        aspect=1.25,
        ground=(900, 432),
        back=0,
        footprint=[[-8.5, -1], [8.5, -1], [8.5, 1], [-8.5, 1]],
        lengthen=dict(to=26.0, cut=0.0, step=2.25, half_w=1.0, top=1.2, bottom=-0.7),  # (a rail post every 2.25 m)
        mirror='mfCatwalkL_y',
        flat=True,
        gain=1.0,
    ),
    'mfLift': dict(
        src='image_28.png',  # the lifting arm: a grated beam into a cage of curved vanes, the head at +x
        axis=((370, 55), (800, 330)),  # the beam's top, its end to where it meets the head
        span=(430, 8.0),
        uniform=True,
        ground=(385, 75),  # the beam's end, on the deck's level: where it joins the catwalk
        back=0,
        footprint=[[0, -1.5], [16, -1.5], [16, 1.5], [0, 1.5]],
        mirror='mfLift_y',
        gain=1.0,
    ),
    'mfDroid': dict(
        over=4,
        src='image_16.png',
        opaque=True,
        axis=None,
        span=(460, 1.6),  # the deck's width <-> its diameter (an axis at 20 px a metre, near enough)
        uniform=True,
        ground=(885, 72),  # the deck's top centre
        back=0,
        footprint=[[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]],
        mirror=None,
        gain=0.9,
    ),
    'mfPlatform': dict(
        over=4,
        src='image_18.png',
        opaque=True,
        axis=None,
        span=(1075, 4.0),  # the deck's screen width <-> (2.4 + 1.6) m of a box seen corner-on
        uniform=True,
        ground=(900, 428),  # the deck's top centre
        back=0,
        footprint=[[-1.2, -0.8], [1.2, -0.8], [1.2, 0.8], [-1.2, 0.8]],
        mirror=None,
        gain=0.9,
    ),
    'mfChair_x': dict(
        over=4,
        src='image_8.png',
        cut=True,
        axis=None,  # near the game's view already: scaled only
        span=(210, 0.55 * 20 / 20),  # the seat's front edge: 210 px <-> 0.55 m (an axis at 20 px a metre)
        height=(815, 1.5),
        ground=(850, 745),  # under the legs' cross
        back=0,
        footprint=[[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]],
        mirror='mfChair',
    ),
}


def cut_checker(a):
    """Alpha for a render on a light checkerboard: the low-saturation light ground reached from the borders."""
    rgb = (a[..., :3] * 255).astype(int)
    mx, mn = rgb.max(2), rgb.min(2)
    like = Image.fromarray((((mn > 196) & ((mx - mn) < 16)) * 255).astype(np.uint8), 'L').copy()
    h, w = mn.shape
    for x in range(0, w, 5):
        for y in (0, h - 1):
            if like.getpixel((x, y)) == 255:
                ImageDraw.floodfill(like, (x, y), 128)
    for y in range(0, h, 5):
        for x in (0, w - 1):
            if like.getpixel((x, y)) == 255:
                ImageDraw.floodfill(like, (x, y), 128)
    fg = Image.fromarray(((np.array(like) != 128) * 255).astype(np.uint8), 'L')
    return np.asarray(fg.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))) / 255.0


def emissive_holo(a):
    """The holo-table's glowing map (saturated blue) and its red indicator lights."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b > 0.45) & (b > r * 1.8) & (b > g * 1.1)
    leds = (r > 0.55) & (r > g * 2.0) & (r > b * 2.0)
    m = (blue | leds) & (a[..., 3] > 0.5)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(m) / 255.0


def emissive_lava(a):
    """Only the hottest lava glows (the falls' cores, the pool's brightest cracks); the rest is lit by the room."""
    r, g = a[..., 0], a[..., 1]
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    m = (lum > 0.6) & (r > 0.85) & (g > 0.45) & (a[..., 3] > 0.5)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    return np.asarray(m) / 255.0 * 0.7


def emissive_table(a):
    """The table's light strip (near white) and its red indicator lights."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    strip = (lum > 0.82) & (np.abs(r - b) < 0.12)
    leds = (r > 0.55) & (r > g * 2.0) & (r > b * 2.0)
    m = (strip | leds) & (a[..., 3] > 0.5)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(m) / 255.0


def emissive_screen(a, boxes=None):
    """A console's screen (amber lines on a dark green ground) and its lamps: the bright, saturated pixels, within
    `boxes` (render px: the screen and the lamps; the copper edges' highlights left out)."""
    mx, mn = a[..., :3].max(2), a[..., :3].min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    m = (sat > 0.5) & (lum > 0.3) & (a[..., 3] > 0.5)
    if boxes:
        h, w = m.shape
        yy, xx = np.mgrid[0:h, 0:w]
        m &= np.any([(xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) for x0, y0, x1, y1 in boxes], axis=0)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    return np.asarray(m) / 255.0


def emissive(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 0.5) & (r > g * 1.3) & (b < 0.4) & (a[..., 3] > 0.5)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    return np.asarray(m) / 255.0


def lengthen_layers(layers, ax, ay, P):
    """A piece along x made longer (P['lengthen']: to, cut, step, half_w, top, bottom): each pixel's place along it
    read off the first surface its line of sight meets (the deck from `bottom` to its top, the far rail up to `top`),
    what lies behind `cut − step` moved back, the gap filled with copies of the stretch [cut − step, cut], back to
    front; the anchor moved to the new middle."""
    G = P['lengthen']
    xs = [q[0] for q in P['footprint']]
    L = max(xs) - min(xs)
    d = G['to'] - L
    wd, ht = layers['body'].size
    py, px = np.mgrid[0:ht, 0:wd].astype(np.float32)
    sx = (px - ax) / OVER / 20
    sy = (py - ay) / OVER / 10
    fx, fy = (sx + sy) / 2, (sy - sx) / 2
    wx = fx.copy()
    hit = np.zeros(fx.shape, bool)
    hw = G['half_w']
    for h in np.arange(G['top'], G['bottom'] - 0.001, -0.04):
        x, y = fx + 1.225 * h, fy + 1.225 * h
        solid = (np.abs(x) <= L / 2 + 0.3) & (((np.abs(y) <= hw) & (h <= 0.15)) | ((y <= -hw + 0.35) & (y >= -hw - 0.3)))
        new = solid & ~hit
        wx[new] = x[new]
        hit |= new
    cut, step = G['cut'], G['step']
    back, near = wx < cut - step, wx >= cut
    mid = ~back & ~near
    shift = lambda m: (round(-m * 20 * OVER), round(-m * 10 * OVER))
    pad = shift(d)
    o = (-pad[0], -pad[1])
    n = int(round(d / step))
    out = {}
    for k, im in layers.items():
        arr = np.asarray(im)
        part = lambda m: Image.fromarray(np.where(m[..., None], arr, 0).astype(np.uint8), 'RGBA')
        canvas = Image.new('RGBA', (wd - pad[0], ht - pad[1]))
        bx, by = shift(d)
        canvas.alpha_composite(part(back), (o[0] + bx, o[1] + by))
        for i in range(n, -1, -1):
            mx, my = shift(i * d / n)
            canvas.alpha_composite(part(mid), (o[0] + mx, o[1] + my))
        canvas.alpha_composite(part(near), o)
        out[k] = canvas
    c = shift(d / 2)
    return out, ax + o[0] + c[0], ay + o[1] + c[1]


def bake(name, P):
    src = Image.open(REF / P['src']).convert('RGBA')
    a = np.asarray(src).astype(np.float32) / 255
    if P.get('cut'):
        a = a.copy()
        a[..., 3] = cut_checker(a)
    if P.get('cutx'):
        # a stretch of the render taken out (columns a..b), the part beyond moved back by it along the piece's
        # slope on the render: a shorter piece of the same wall
        x0, x1, slope = P['cutx']
        d = x1 - x0
        dy = int(round(d * slope))
        out = np.zeros_like(a)
        out[:, :x0] = a[:, :x0]
        src_r = a[:, x1:]
        h = a.shape[0]
        # the right part up by dy (its rows moved toward 0) and left by d
        w_r = min(src_r.shape[1], out.shape[1] - x0)
        out[: h - dy, x0 : x0 + w_r] = src_r[dy:, :w_r]
        a = out
    if P.get('opaque'):  # a soft halo round the render: keep the solid pixels, a 1 px soft edge
        a = a.copy()
        al = Image.fromarray(((a[..., 3] >= 240 / 255) * 255).astype(np.uint8), 'L')
        a[..., 3] = np.asarray(al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    em = {'table': emissive_table, 'holo': emissive_holo, 'lava': emissive_lava, 'screen': emissive_screen}.get(P.get('emit'), emissive)
    m = (em(a, P.get('glow_boxes')) if P.get('emit') == 'screen' else em(a)) if P.get('emit') else np.zeros(a.shape[:2], np.float32)
    body = a.copy()
    if P.get('match'):
        # the body's colour matched to another console's: its chroma scaled toward its luma, then brightened (the
        # glowing parts left as they are)
        M = P['match']
        lum = body[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
        rgb = lum[..., None] + (body[..., :3] - lum[..., None]) * M['sat']
        keep = m[..., None] > 0.5
        body[..., :3] = np.where(keep, body[..., :3], np.clip(rgb * M['gain'], 0, 1))
    body[..., :3] *= np.where(m[..., None] > 0.5, 1, P.get('gain', BODY_GAIN))
    neon = a.copy()
    neon[..., 3] *= m
    if P.get('quad'):
        return bake_quad(name, P, body, neon)
    if P.get('quads'):
        return bake_quads(name, P, body, neon)
    if P.get('corners'):
        return bake_fit(name, P, body, neon)
    sx = P['span'][1] * P.get('px_m', 20) * OVER / P['span'][0]  # (px a metre along its axis: 20 along x or y, 28.3 along a diagonal)
    sy = sx if P.get('uniform') else sx * P['aspect'] if P.get('aspect') else P['height'][1] * 24.5 * OVER / P['height'][0]
    k = 0.0
    if P['axis']:
        (x0, y0), (x1, y1) = P['axis']
        k = P.get('slope', 0.5) - (y1 - y0) / (x1 - x0) * sy / sx
    # the map: (x, y) -> (x sx, y sy + k x sx); PIL's affine maps output to input
    w, h = src.size
    ow = int(w * sx) + 2
    shift = int(abs(k) * ow) + 2
    oh = int(h * sy) + shift * 2
    off = shift  # y offset so a negative shear stays in the image
    inv = (1 / sx, 0, 0, -k / sy, 1 / sy, -off / sy)
    layers = {}
    for nm, arr in (('body', body), ('neon', neon)):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        layers[nm] = im.transform((ow, oh), Image.AFFINE, inv, resample=Image.BICUBIC)
    gx, gy = P['ground']
    bdx, bdy = P.get('back_dir', (20, -10))  # (screen px a metre behind its front: −y for a wall along x)
    ax = gx * sx + bdx * OVER * P['back']
    ay = gy * sy + k * gx * sx + off + bdy * OVER * P['back']
    if P.get('lengthen'):
        layers, ax, ay = lengthen_layers(layers, ax, ay, P)
        t = P['lengthen']['to'] / 2
        P = {**P, 'footprint': [[-t, q[1]] if q[0] < 0 else [t, q[1]] for q in P['footprint']]}
    bb = layers['body'].getbbox()
    has_neon = P.get('emit', False)
    for nm, mirrored in ((name, False),):  # (the `mirror` twin is flipped by the loader: gfx/mustafarFloor.js)
        if not nm:
            continue
        b2, n2 = layers['body'].crop(bb), layers['neon'].crop(bb)
        ox, oy = ax - bb[0], ay - bb[1]
        fp = P['footprint']
        lights = P.get('lights', [])
        if mirrored:  # the other wall / facing: (x, y) -> (y, x) on the ground, the image flipped
            b2, n2 = b2.transpose(Image.FLIP_LEFT_RIGHT), n2.transpose(Image.FLIP_LEFT_RIGHT)
            ox = b2.width - ox
            fp = [[y, x] for x, y in fp]
            lights = [[l[1], l[0], *l[2:]] for l in lights]
        b2.save(OUT / f'{nm}_body.png', optimize=True)
        meta = {'anchor': [round(float(ox), 1), round(float(oy), 1)], 'k': 1 / OVER, 'layers': {'body': f'{nm}_body.png'}, 'footprint': fp, 'lights': lights, 'flat': bool(P.get('flat'))}
        if has_neon:
            n2.save(OUT / f'{nm}_neon.png', optimize=True)
            meta['layers']['neon'] = f'{nm}_neon.png'
            meta['neon'] = {'base': 1, 'hum': 0.08, 'speed': 0.4, 'flicker': {'rate': 0.02, 'dur': [0.05, 0.15], 'level': 0.7}}
        (OUT / f'{nm}.json').write_text(json.dumps(meta))
        print(f'{nm}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]}, shear {k:.3f}')


def screen(x, y, z):
    return ((x - y) * 20 * OVER, ((x + y) * 10 - z * 24.5) * OVER)


def homography(src, dst):
    """The projective map taking the four `src` points to the four `dst` points (as a 3x3 matrix)."""
    A = []
    b = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -x * u, -y * u])
        b.append(u)
        A.append([0, 0, 0, x, y, 1, -x * v, -y * v])
        b.append(v)
    h = np.linalg.solve(np.array(A, float), np.array(b, float))
    return np.array([[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]])


def bake_quad(name, P, body, neon):
    """A render turned off the game's view: a plane of it (four measured points) mapped by a perspective warp onto
    its place in the game's projection — a facade made to face the camera head-on (an affine fit cannot)."""
    src = [q[0] for q in P['quad']]
    dst = [screen(*q[1]) for q in P['quad']]
    H = homography(src, dst)
    h, w = body.shape[:2]
    pts = np.array([[x, y, 1] for x in (0, w) for y in (0, h)], float) @ H.T
    pts = pts[:, :2] / pts[:, 2:3]
    lo = np.floor(pts.min(0)) - 2
    size = tuple(int(v) for v in np.ceil(pts.max(0)) + 2 - lo)
    # PIL wants output -> input: the inverse map, the output origin moved to lo
    Hi = np.linalg.inv(H)
    T = np.array([[1, 0, lo[0]], [0, 1, lo[1]], [0, 0, 1]], float)
    M = Hi @ T
    M /= M[2, 2]
    coeffs = tuple(M.reshape(-1)[:8])
    layers = {}
    for nm, arr in (('body', body), ('neon', neon)):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        layers[nm] = im.transform(size, Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC)
    ax, ay = -lo
    bb = layers['body'].getbbox()
    b2, n2 = layers['body'].crop(bb), layers['neon'].crop(bb)
    ox, oy = ax - bb[0], ay - bb[1]
    b2.save(OUT / f'{name}_body.png', optimize=True)
    meta = {'anchor': [round(float(ox), 1), round(float(oy), 1)], 'k': 1 / OVER, 'layers': {'body': f'{name}_body.png'}, 'footprint': P['footprint'], 'lights': P.get('lights', []), 'flat': bool(P.get('flat'))}
    if P.get('emit'):
        n2.save(OUT / f'{name}_neon.png', optimize=True)
        meta['layers']['neon'] = f'{name}_neon.png'
        meta['neon'] = {'base': P.get('neon_base', 1), 'hum': 0.04, 'speed': 0.5, 'flicker': {'rate': 0.01, 'dur': [0.05, 0.12], 'level': 0.7}}
    (OUT / f'{name}.json').write_text(json.dumps(meta))
    print(f'{name}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]} (perspective warp)')


def bake_quads(name, P, body, neon):
    """A render seen from a little off the game's view across a corner: each face (the render's columns c0..c1)
    warped by its own perspective map (four measured points onto its plane, as bake_quad) — folded on the line two
    faces share — into one image."""
    parts = []
    for (c0, c1), quad in P['quads']:
        H = homography([q[0] for q in quad], [screen(*q[1]) for q in quad])
        parts.append((c0, c1, H))
    h, w = body.shape[:2]
    pts = []
    for c0, c1, H in parts:
        q = np.array([[x, y, 1] for x in (c0, min(c1, w)) for y in (0, h)], float) @ H.T
        pts.append(q[:, :2] / q[:, 2:3])
    pts = np.vstack(pts)
    lo = np.floor(pts.min(0)) - 2
    size = tuple(int(v) for v in np.ceil(pts.max(0)) + 2 - lo)
    T = np.array([[1, 0, lo[0]], [0, 1, lo[1]], [0, 0, 1]], float)
    layers = {'body': Image.new('RGBA', size), 'neon': Image.new('RGBA', size)}
    for c0, c1, H in parts:
        M = np.linalg.inv(H) @ T
        M /= M[2, 2]
        coeffs = tuple(M.reshape(-1)[:8])
        for nm, arr in (('body', body), ('neon', neon)):
            part = arr.copy()
            part[:, :c0] = 0
            part[:, c1:] = 0
            im = Image.fromarray((np.clip(part, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
            layers[nm].alpha_composite(im.transform(size, Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC))
    ax, ay = -lo
    bb = layers['body'].getbbox()
    b2, n2 = layers['body'].crop(bb), layers['neon'].crop(bb)
    ox, oy = ax - bb[0], ay - bb[1]
    b2.save(OUT / f'{name}_body.png', optimize=True)
    meta = {'anchor': [round(float(ox), 1), round(float(oy), 1)], 'k': 1 / OVER, 'layers': {'body': f'{name}_body.png'}, 'footprint': P['footprint'], 'lights': P.get('lights', []), 'flat': bool(P.get('flat'))}
    if P.get('emit'):
        n2.save(OUT / f'{name}_neon.png', optimize=True)
        meta['layers']['neon'] = f'{name}_neon.png'
        meta['neon'] = {'base': P.get('neon_base', 1), 'hum': 0.04, 'speed': 0.5, 'flicker': {'rate': 0.01, 'dur': [0.05, 0.12], 'level': 0.7}}
    (OUT / f'{name}.json').write_text(json.dumps(meta))
    print(f'{name}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]} (perspective warp, {len(parts)} faces)')


def bake_fit(name, P, body, neon):
    """Least-squares affine from measured render corners to their place in the game's projection."""
    A = np.array([[sx, sy, 1] for (sx, sy), _ in P['corners']], float)
    T = np.array([screen(*w) for _, w in P['corners']], float)
    M = np.linalg.lstsq(A, T, rcond=None)[0].T  # 2x3, T = M @ [x y 1]
    if P.get('vertical'):
        # screen x from the render's x alone (no shear of the verticals); y as fitted
        cx = np.linalg.lstsq(A[:, [0, 2]], T[:, 0], rcond=None)[0]
        M[0] = [cx[0], 0, cx[1]]
    res = np.abs(A @ M.T - T).max() / OVER
    h, w = body.shape[:2]
    corners = np.array([[x, y, 1] for x in (0, w) for y in (0, h)], float) @ M.T
    lo = np.floor(corners.min(0)) - 2
    size = tuple(int(v) for v in np.ceil(corners.max(0)) + 2 + (30 * OVER if P.get('shadow') else 0) - lo)  # (room for the shadow)
    F = np.vstack([M, [0, 0, 1]])
    F[:2, 2] -= lo
    Fi = np.linalg.inv(F)
    layers = {}
    for nm, arr in (('body', body), ('neon', neon)):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        big = im.transform((size[0] * 2, size[1] * 2), Image.AFFINE, tuple((Fi[:2] * [[0.5, 0.5, 1], [0.5, 0.5, 1]]).reshape(-1)), resample=Image.BICUBIC)
        layers[nm] = big.resize(size, Image.LANCZOS)
    ax, ay = -lo  # the world origin (the piece's ground centre)
    if P.get('shorten'):
        # a shorter piece along x: what lies between x = a and x = b taken out, the far part (x < a) moved up by
        # b − a. Each pixel's x is that of the surface it shows, found by walking its line of sight down from the
        # walls' top (a pixel shows (fx + 1.225 h, fy + 1.225 h, h) at each height h): the first solid it meets —
        # the far wall, the low near wall, the portals' slabs at the ends — else the floor
        a, b = P['shorten']
        d = b - a
        half = max(abs(v[1]) for _, v in P['corners'])
        end = max(abs(v[0]) for _, v in P['corners'])
        top = max(v[2] for _, v in P['corners'])
        wd, ht = layers['body'].size
        py, px = np.mgrid[0:ht, 0:wd].astype(np.float32)
        sx = (px - ax) / OVER / 20
        sy = (py - ay) / OVER / 10
        fx, fy = (sx + sy) / 2, (sy - sx) / 2
        wx = fx.copy()
        hit = np.zeros(fx.shape, bool)
        for h in np.arange(top, -0.001, -0.05):
            x, y = fx + 1.225 * h, fy + 1.225 * h
            solid = (np.abs(x) <= end) & (np.abs(y) <= half) & (
                (y <= -half + 0.4) | ((y >= half - 0.4) & (h <= P['near_wall'])) | (np.abs(x) >= end - 0.6))
            new = solid & ~hit
            wx[new] = x[new]
            hit |= new
        far, near = wx < a, wx >= b
        sh = (round(d * 20 * OVER), round(d * 10 * OVER))
        for k in layers:
            arr = np.asarray(layers[k]).copy()
            fa, na = arr.copy(), arr.copy()
            fa[~far] = 0
            na[~near] = 0
            out = Image.new('RGBA', (wd + sh[0], ht + sh[1]))
            out.alpha_composite(Image.fromarray(fa, 'RGBA'), sh)
            out.alpha_composite(Image.fromarray(na, 'RGBA'), (0, 0))
            layers[k] = out
        # the new middle: the piece now spans x −L/2 + d .. L/2, its centre d / 2 up from the old
        ax, ay = ax + d / 2 * 20 * OVER, ay + d / 2 * 10 * OVER
    if P.get('ship') == 'mirror':
        # shipped as its mirrored twin (the orientation the map places): flipped before the shadow is cast, so
        # the shadow still falls away from the key light
        for k in layers:
            layers[k] = layers[k].transpose(Image.FLIP_LEFT_RIGHT)
        ax = layers['body'].width - ax
        P = {**P, 'footprint': [[y, x] for x, y in P['footprint']], 'lights': [[l[1], l[0], *l[2:]] for l in P.get('lights', [])]}
        name = P['mirror']
    if P.get('shadow'):
        # the shadow on the floor: the piece's silhouette dropped by its height and pushed away from the key light
        # (upper left: ART_GUIDE.md §3) — down by the height on screen, right by two thirds of it — soft, under it
        h = P['shadow'] * 24.5 * OVER
        al = layers['body'].getchannel('A')
        sh = Image.new('L', al.size, 0)
        sh.paste(al, (round(h * 0.66), round(h)))
        sh = sh.filter(ImageFilter.GaussianBlur(2.5 * OVER)).point(lambda v: int(v * 0.6))
        shadow = Image.new('RGBA', al.size, (8, 6, 5, 0))
        shadow.putalpha(sh)
        shadow.alpha_composite(layers['body'])
        layers['body'] = shadow
    bb = layers['body'].getbbox()
    has_neon = bool(P.get('emit'))
    for nm, mirrored in ((name, False),):  # (the `mirror` twin is flipped by the loader: gfx/mustafarFloor.js)
        if not nm:
            continue
        b2, n2 = layers['body'].crop(bb), layers['neon'].crop(bb)
        ox, oy = ax - bb[0], ay - bb[1]
        fp = P['footprint']
        lights = P.get('lights', [])
        if mirrored:
            b2, n2 = b2.transpose(Image.FLIP_LEFT_RIGHT), n2.transpose(Image.FLIP_LEFT_RIGHT)
            ox = b2.width - ox
            fp = [[y, x] for x, y in fp]
            lights = [[l[1], l[0], *l[2:]] for l in lights]
        b2.save(OUT / f'{nm}_body.png', optimize=True)
        meta = {'anchor': [round(float(ox), 1), round(float(oy), 1)], 'k': 1 / OVER, 'layers': {'body': f'{nm}_body.png'}, 'footprint': fp, 'lights': lights, 'flat': bool(P.get('flat'))}
        if has_neon:
            n2.save(OUT / f'{nm}_neon.png', optimize=True)
            meta['layers']['neon'] = f'{nm}_neon.png'
            meta['neon'] = {'base': P.get('neon_base', 1), 'hum': 0.04, 'speed': 0.5, 'flicker': {'rate': 0.01, 'dur': [0.05, 0.12], 'level': 0.7}}
        (OUT / f'{nm}.json').write_text(json.dumps(meta))
        print(f'{nm}: {b2.width}x{b2.height} (x{OVER}), anchor {meta["anchor"]}, fit residual {res:.1f} game px')


if __name__ == '__main__':
    import sys

    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])  # (names to bake: the rest left as they are; none: all)
    for n, P in PIECES.items():
        if only and n not in only:
            continue
        OVER = P.get('over', 2)  # (the small props at 4×: the remastered picture is up to 3× the game's pixels)
        bake(n, P)
