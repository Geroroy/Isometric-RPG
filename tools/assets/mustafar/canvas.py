"""The canvas an externally made 2:1 sprite needs (docs/ASSETS.md): from the world box it fills, its anchor's world point
and its density, the image size, the anchor pixel and where key world points land in the image — numbers for an asset
request, so the art arrives already at the game's projection and scale (src/core/iso.js: x -> (+20, +10) px a metre,
y -> (-20, +10), up -> 24.49 px; density = image px a game px).

    python3 tools/assets/mustafar/canvas.py   (prints the STAGE 01 requests' numbers)
"""
import math

ZPX = 24.49


def screen(x, y, z=0.0):
    return ((x - y) * 20, (x + y) * 10 - z * ZPX)


def canvas(box, anchor, density=2, margin=16, points=None):
    """box: (x0, y0, z0, x1, y1, z1) world metres; anchor: (x, y) on the ground. -> dict of image numbers."""
    x0, y0, z0, x1, y1, z1 = box
    pts = [screen(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    lo = (min(p[0] for p in pts) - margin / density, min(p[1] for p in pts) - margin / density)
    hi = (max(p[0] for p in pts) + margin / density, max(p[1] for p in pts) + margin / density)
    w = math.ceil((hi[0] - lo[0]) * density / 8) * 8
    h = math.ceil((hi[1] - lo[1]) * density / 8) * 8
    px = lambda x, y, z=0.0: (round((screen(x, y, z)[0] - lo[0]) * density), round((screen(x, y, z)[1] - lo[1]) * density))  # noqa: E731
    out = {'size': [w, h], 'anchor': list(px(*anchor)), 'density': density}
    if points:
        out['points'] = {k: list(px(*v)) for k, v in points.items()}
    return out


def guide(path, box, anchor, density=2, margin=16, grid=True):
    """A projection guide for an asset request (a development aid, not game art): the canvas at its exact size, the
    world box as a wireframe (ground edges cyan, top edges orange, verticals grey), a 1 m grid on the ground under
    it, the anchor as a red cross. The artist draws the piece inside the wireframe, then removes the guide."""
    from PIL import Image, ImageDraw

    c = canvas(box, anchor, density, margin)
    x0, y0, z0, x1, y1, z1 = box
    pts = [screen(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    lo = (min(p[0] for p in pts) - margin / density, min(p[1] for p in pts) - margin / density)
    P = lambda x, y, z=0.0: ((screen(x, y, z)[0] - lo[0]) * density, (screen(x, y, z)[1] - lo[1]) * density)  # noqa: E731
    im = Image.new('RGBA', tuple(c['size']), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if grid:
        for gx in range(math.floor(x0) - 1, math.ceil(x1) + 2):
            d.line([P(gx, y0 - 1), P(gx, y1 + 1)], fill=(120, 120, 120, 110), width=1)
        for gy in range(math.floor(y0) - 1, math.ceil(y1) + 2):
            d.line([P(x0 - 1, gy), P(x1 + 1, gy)], fill=(120, 120, 120, 110), width=1)
    for z, col in ((z0, (0, 220, 255, 255)), (z1, (255, 160, 40, 255))):
        d.line([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z), P(x0, y0, z)], fill=col, width=2)
    for x in (x0, x1):
        for y in (y0, y1):
            d.line([P(x, y, z0), P(x, y, z1)], fill=(200, 200, 200, 255), width=1)
    ax, ay = c['anchor']
    d.line([(ax - 8, ay), (ax + 8, ay)], fill=(255, 40, 40, 255), width=2)
    d.line([(ax, ay - 8), (ax, ay + 8)], fill=(255, 40, 40, 255), width=2)
    im.save(path)
    return c


if __name__ == '__main__':
    import json

    # the pad: x 74..118, y 76..114 (public/maps/mustafar_v2/stage01.json)
    req = {
        # a 6 m railing run along world x (on the pad's y edges), 1.1 m tall, its foot line on y = 0
        'mf.landing.rail_x': canvas((-3, -0.15, 0, 3, 0.15, 1.1), (0, 0), points={'end_-x': (-3, 0), 'end_+x': (3, 0), 'top_-x': (-3, 0, 1.1), 'top_+x': (3, 0, 1.1)}),
        'mf.landing.rail_y': canvas((-0.15, -3, 0, 0.15, 3, 1.1), (0, 0), points={'end_-y': (0, -3), 'end_+y': (0, 3), 'top_-y': (0, -3, 1.1), 'top_+y': (0, 3, 1.1)}),
        'mf.landing.rail_corner': canvas((-0.6, -0.6, 0, 0.6, 0.6, 1.3), (0, 0)),
        # the entry corridor: 10 m along −x off the pad's −x edge (x 64..74), 6 m wide (y 95..101), walls 3 m
        'mf.landing.corridor': canvas((64, 95, 0, 74, 101, 3), (74, 98), points={'mouth_left(74,95)': (74, 95), 'mouth_right(74,101)': (74, 101), 'far_left(64,95)': (64, 95), 'far_right(64,101)': (64, 101)}),
        # Padmé's ship on the clamps: nose to +x, about 29 m long, a box 10 m across and 6 m tall
        'mf.landing.ship': canvas((81.5, 90, 0, 110.5, 100, 6), (96, 95), points={'nose(110.5,95)': (110.5, 95), 'tail(81.5,95)': (81.5, 95)}),
    }
    print(json.dumps(req, indent=1))
