"""Shared helpers for the Mustafar rebuild's zone generators (docs/MUSTAFAR_REBUILD.md): the blockout's boxes and the
zone file writer (one entry a line, so a change reads as a line's).

A blockout box ({x, y, w, d, h, kind, label, ...}) is a grey placeholder for a wall, a piece of furniture, a deck or a
set piece of a stage whose art is not requested yet (src/gfx/blockout.js draws it, plainly marked as a placeholder).
It never blocks on its own (`block` only for furniture standing inside a walkable area): where one may walk is the
zone's `walk` and `collision` data, as for the stages with art.
"""
import json

WALL_T = 0.4  # a blockout wall's thickness (m)
FAR_H = 4.0  # far walls (−x, −y: behind the action) at full height
NEAR_H = 1.0  # near walls (+x, +y: between the camera and the action) cut low, as the conference room's are


def box(x, y, w, d, h, kind='wall', label='', **kw):
    b = {'x': round(x, 3), 'y': round(y, 3), 'w': round(w, 3), 'd': round(d, 3), 'h': round(h, 3), 'kind': kind, 'label': label}
    b.update(kw)
    return b


def wall_x(x0, x1, y, h, label='', **kw):
    """A wall along x from x0 to x1, its base line's middle at y."""
    return box((x0 + x1) / 2, y, x1 - x0, WALL_T, h, 'wall', label, **kw)


def wall_y(y0, y1, x, h, label='', **kw):
    """A wall along y from y0 to y1, its base line's middle at x."""
    return box(x, (y0 + y1) / 2, WALL_T, y1 - y0, h, 'wall', label, **kw)


def deck(x0, y0, x1, y1, z, label='', kind='deck'):
    """A raised top one walks on: its box (flat: drawn with the ground) and its surface."""
    return box((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z, kind, label, flat=True), {'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'z': z}


def plate(x, y, w, d, label, kind='hazard'):
    """A flat marker on the ground (a sign: the lava river's flow, the part of the catwalk that gives way)."""
    return box(x, y, w, d, 0.03, kind, label, flat=True)


def light(x, y, z, rgb, rad, flicker=0.05):
    return {'x': x, 'y': y, 'z': z, 'r': rgb[0], 'g': rgb[1], 'b': rgb[2], 'rad': rad, 'flicker': flicker}


def write(path, m):
    one = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731
    body = ',\n'.join(
        f'  {one(k)}: [\n' + ',\n'.join('    ' + one(e) for e in v) + '\n  ]' if isinstance(v, list) and v and isinstance(v[0], dict) else f'  {one(k)}: {one(v)}'
        for k, v in m.items()
    )
    path.write_text('{\n' + body + '\n}\n')
