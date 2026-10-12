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
- `mfHolo`: the control room's holo-table (image_20: an elongated hexagon, its top a glowing blue map, red indicator
  lights round the rim), along x, 4.4 m by 1.8 m, 1 m tall, fitted on eight points; `mfHolo_y` its twin along y
- `mfFall`: a lava fall (image_21: a rock cliff with three falls pouring into a cracked lava pool), the cliff along
  y, the pool in front of it to +x; 7 m of cliff, the pool 1.6 m deep, fitted on the pool's four corners (the cliff's
  height follows the render); the lava glowing; `mfFall_x` its twin (cliff along x, pool to +y)
- `mfChair`: faces +y (mirrored from the render, which faces +x: `mfChair_x`), 1.5 m tall
- `mfPassage`: a corridor's inside with no roof (the far wall tall with light panels, the near wall low, a portal at
  each end), along y, 15 m by 4 m (the far wall on −x); `mfPassage_x` along x as rendered. Fitted by least squares
  on five measured corners (the render's own proportions differ: the walkway is narrowed to the corridor's)
- `mfArm`: the collector arm (reference image_14: the vane head at its outer end, the long grated arm, the mast and
  its stays), along x, the head to −x, 22 m of deck; seen nearly as the game sees it, so scaled evenly
- `mfCatwalk`: the outside catwalk (image_15: a grated deck, a rail on its far side), along x, 17 m
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
OVER = 2
BODY_GAIN = 0.78

PIECES = {
    'mfTable': dict(
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
    'mfHolo': dict(
        src='image_20.png',
        corners=[
            ((145, 190), (-2.2, 0, 1.0)),  # the top's points and corners
            ((455, 115), (-1.4, -0.9, 1.0)),
            ((1255, 270), (1.4, -0.9, 1.0)),
            ((1635, 445), (2.2, 0, 1.0)),
            ((1350, 550), (1.4, 0.9, 1.0)),
            ((445, 395), (-1.4, 0.9, 1.0)),
            ((515, 632), (-1.3, 1.0, 0)),  # the plinth's near corners on the floor
            ((1305, 818), (1.3, 1.0, 0)),
        ],
        footprint=[[-2.2, -0.9], [2.2, -0.9], [2.2, 0.9], [-2.2, 0.9]],
        emit='holo',
        ship='mirror',  # (placed along y in the world)
        shadow=1.0,
        gain=0.9,
        lights=[[0, 0, 1.4, 90, 170, 255, 120, 0.04]],  # the map's blue light
        mirror='mfHolo_y',
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
    'mfWindow': dict(
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
    'mfCatwalk': dict(
        src='image_15.png',
        axis=((105, 118), (1650, 710)),  # the deck's near edge
        span=(1580, 17.0),
        aspect=1.25,  # seen lower than the game's view: heights a little taller than an even scale
        ground=(900, 432),  # the deck's middle
        back=0,
        footprint=[[-8.5, -1], [8.5, -1], [8.5, 1], [-8.5, 1]],
        mirror='mfCatwalk_y',
        flat=True,
        gain=1.0,
    ),
    'mfDroid': dict(
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


def emissive(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 0.5) & (r > g * 1.3) & (b < 0.4) & (a[..., 3] > 0.5)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    return np.asarray(m) / 255.0


def bake(name, P):
    src = Image.open(REF / P['src']).convert('RGBA')
    a = np.asarray(src).astype(np.float32) / 255
    if P.get('cut'):
        a = a.copy()
        a[..., 3] = cut_checker(a)
    if P.get('opaque'):  # a soft halo round the render: keep the solid pixels, a 1 px soft edge
        a = a.copy()
        al = Image.fromarray(((a[..., 3] >= 240 / 255) * 255).astype(np.uint8), 'L')
        a[..., 3] = np.asarray(al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    em = {'table': emissive_table, 'holo': emissive_holo, 'lava': emissive_lava}.get(P.get('emit'), emissive)
    m = em(a) if P.get('emit') else np.zeros(a.shape[:2], np.float32)
    body = a.copy()
    body[..., :3] *= np.where(m[..., None] > 0.5, 1, P.get('gain', BODY_GAIN))
    neon = a.copy()
    neon[..., 3] *= m
    if P.get('corners'):
        return bake_fit(name, P, body, neon)
    sx = P['span'][1] * 20 * OVER / P['span'][0]
    sy = sx if P.get('uniform') else sx * P['aspect'] if P.get('aspect') else P['height'][1] * 24.5 * OVER / P['height'][0]
    k = 0.0
    if P['axis']:
        (x0, y0), (x1, y1) = P['axis']
        k = 0.5 - (y1 - y0) / (x1 - x0) * sy / sx
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
    ax = gx * sx + 20 * OVER * P['back']
    ay = gy * sy + k * gx * sx + off - 10 * OVER * P['back']
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


def bake_fit(name, P, body, neon):
    """Least-squares affine from measured render corners to their place in the game's projection."""
    A = np.array([[sx, sy, 1] for (sx, sy), _ in P['corners']], float)
    T = np.array([screen(*w) for _, w in P['corners']], float)
    M = np.linalg.lstsq(A, T, rcond=None)[0].T  # 2x3, T = M @ [x y 1]
    res = np.abs(A @ M.T - T).max() / OVER
    h, w = body.shape[:2]
    corners = np.array([[x, y, 1] for x in (0, w) for y in (0, h)], float) @ M.T
    lo = np.floor(corners.min(0)) - 2
    size = tuple(int(v) for v in np.ceil(corners.max(0)) + 2 + (60 if P.get('shadow') else 0) - lo)  # (room for the shadow)
    F = np.vstack([M, [0, 0, 1]])
    F[:2, 2] -= lo
    Fi = np.linalg.inv(F)
    layers = {}
    for nm, arr in (('body', body), ('neon', neon)):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        big = im.transform((size[0] * 2, size[1] * 2), Image.AFFINE, tuple((Fi[:2] * [[0.5, 0.5, 1], [0.5, 0.5, 1]]).reshape(-1)), resample=Image.BICUBIC)
        layers[nm] = big.resize(size, Image.LANCZOS)
    ax, ay = -lo  # the world origin (the piece's ground centre)
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
    OUT.mkdir(parents=True, exist_ok=True)
    for n, P in PIECES.items():
        bake(n, P)
