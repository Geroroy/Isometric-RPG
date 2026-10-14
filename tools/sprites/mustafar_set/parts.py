"""Mustafar set parts made from the pieces already baked (no new render needed), added to the near walls' atlas
(lowwall.{png,json}: no new files for the artifact, which is at its file limit) under its bays, with their glow
layers under those (`glowShift` rows down: the atlas's `glow` sprites have one).

    python3 tools/sprites/mustafar_set/parts.py -> public/sprites/mustafar/lowwall.{png,json} (the parts rows)

Run again after lowwall.py (which writes the bays alone); the parts rows are replaced, never doubled (`baseH`).

- `mfTall<L>` / `mfTall<L>_y`: a tall wall bay (3 m, the facility's ribbed wall with its light slits) of L metres,
  facing +y (along x) and its twin facing +x — cut from the open corridor's far wall (mfPassage_x_body.png, the
  wall at y = −2 along x, 3 m tall): the wall unsheared into a strip (a column a screen column, its rows from the
  foot line up), a run of L metres taken from the strip's middle (whole ribs: the strip's rib period), then sheared
  back onto the 2:1 slope. The slits (the pale strips on the ribs) go to the glow page. For the lava hall's far
  walls and the facility's outer wall.
- `mfRail<L>` / `_y`: a catwalk rail bay, L metres along x at the anchor's y (posts 1.1 m, two bars), facing +y
  (seen from the near side); drawn (not rendered): dark steel, the bars' tops lit from the upper left. Its twin
  along y. Flat sprites (walked past, drawn with the ground): thin, so a unit draws over it where they overlap.
- `mfPillar`: a single square pillar 3.2 m tall, 0.5 m across (the lava hall's columns): drawn, the facility's
  pale pillar stripes taken from the near walls' pillar (lowwall.png mfWall1's left pillar).
- `mfLedge<L>` / `_y`: a terrace's edge wall, 1.0 m tall, L metres, dark plates with a white light slit every 2 m
  on the glow page (the exterior walkways' edge in the 2005 map); facing +y and its twin facing +x.
- `mfStairs` / `mfStairs_y`: a flight of six steps 4 m wide going down 1.5 m over 3 m, drawn flat (the way into
  the conference room); `mfStairs` runs along +y (down to +y), `_y` along +x.

Everything at 2x (k 0.5), as the big walked-on pieces.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'public/sprites/mustafar'
OUT = SRC
OVER = 2  # px a game px
PXM = 20 * OVER  # px a metre along x on screen
ZPX = 24.5 * OVER
LENGTHS = [2, 3, 4, 4.5, 5, 6]


def screen(x, y, z):
    return ((x - y) * PXM, (x + y) * PXM / 2 - z * ZPX)


# ------------------------------------------------------------------------------------------------- the tall wall
def passage_strip():
    """The open corridor's far wall unsheared: columns from x = −5.5 to 5.5 m along it (the portals left out),
    rows from the foot up 3 m."""
    im = np.asarray(Image.open(SRC / 'mfPassage_x_body.png').convert('RGBA')).astype(np.float32)
    ax, ay = 405.0, 339.0  # the anchor: the piece's origin (0, 0, 0)
    # the wall's top is 3 m over the box's far edge (measured: its line is 147 px over the y = −2 foot line), its
    # foot 1.75 m under that (the wall is a low ribbed panel on the render; the floor shows below it)
    H = 86
    xs = np.arange(-5.0, 4.6, 1 / PXM)
    strip = np.zeros((H, len(xs), 4), np.float32)
    for i, x in enumerate(xs):
        sx, sy = screen(x, -2, 0)
        c = min(max(int(round(ax + sx)), 0), im.shape[1] - 1)
        foot = ay + sy - 147 + H
        rows = np.arange(H)
        r = np.clip(np.round(foot - rows).astype(int), 0, im.shape[0] - 1)
        strip[::-1][rows, i] = im[r, c]  # (row 0 at the top)
    # stretched to the hall's 3 m
    H3 = int(round(3.0 * ZPX))
    out = np.stack([np.asarray(Image.fromarray(np.clip(strip[..., k], 0, 255).astype(np.uint8)).resize((len(xs), H3), Image.BICUBIC)) for k in range(4)], -1).astype(np.float32)
    return out


def rib_period(strip):
    """The ribs' spacing in strip columns: the strongest period of the strip's brightness along it."""
    lum = strip[..., :3].mean(2).mean(0)
    lum = lum - lum.mean()
    best, bp = 0, 0
    for p in range(int(PXM * 0.8), int(PXM * 3)):
        s = np.mean(lum[:-p] * lum[p:])
        if s > best:
            best, bp = s, p
    return bp


def tall_wall(L, strip, period):
    """A bay of L metres from the strip: whole ribs, starting on a rib edge near the strip's middle, the run tiled
    by the rib period when L is longer than the strip."""
    n = int(round(L * PXM))
    # the rib edge: the darkest column (the groove) nearest the middle
    lum = strip[..., :3].mean(2).mean(0)
    mid = len(lum) // 2
    start = mid - period // 2 + int(np.argmin(lum[mid - period // 2 : mid + period // 2]))
    cols = np.concatenate([strip[:, start : start + period]] * (n // period + 2), 1)[:, :n]
    H = strip.shape[0]
    # shear back: column c at screen x = c (the bay's left end at x = −L/2), its foot at y = c / 2
    w = n
    h = H + n // 2 + 2
    out = np.zeros((h, w, 4), np.float32)
    for c in range(n):
        foot = int(round(c / 2))
        out[foot : foot + H, c] = cols[:, c]
    body = out.copy()
    # the slits: pale pixels on the ribs, to the glow page (the body keeps them too, a little dimmer)
    lum = body[..., :3].mean(2)
    glow = (lum > 150).astype(np.float32)
    glow = np.asarray(Image.fromarray((glow * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))) / 255
    neon = body.copy()
    neon[..., 3] *= glow
    body[..., :3] *= (1 - glow[..., None] * 0.35) * 1.9
    anchor = [w / 2, H + n / 4]  # the foot line's middle (its y from the left foot at row H)
    return body, neon, anchor


# ---------------------------------------------------------------------------------------------------- drawing
def new(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def iso_poly(d, pts, origin, fill):
    ox, oy = origin
    d.polygon([(ox + sx, oy + sy) for sx, sy in (screen(*p) for p in pts)], fill=fill)


def rail(L):
    """Posts 1.1 m every 1.5 m along x at y = 0 from −L/2 to L/2, bars at 0.55 and 1.05 m; the near face lit."""
    n_posts = int(round(L / 1.5)) + 1
    w = int(L * PXM) + 8 * OVER
    h = int(1.1 * ZPX + L * PXM / 2) + 8 * OVER
    im = new(w, h)
    d = ImageDraw.Draw(im)
    ox, oy = 4 * OVER + L / 2 * PXM, h - 4 * OVER - L / 2 * PXM / 2
    xs = [-L / 2 + i * (L / (n_posts - 1)) for i in range(n_posts)]
    pw = 0.07
    for x in xs:
        # a post: a dark box with a lit left edge
        iso_poly(d, [(x - pw, 0, 0), (x + pw, 0, 0), (x + pw, 0, 1.1), (x - pw, 0, 1.1)], (ox, oy), (38, 36, 34, 255))
        iso_poly(d, [(x - pw, 0, 0), (x - pw + 0.03, 0, 0), (x - pw + 0.03, 0, 1.1), (x - pw, 0, 1.1)], (ox, oy), (96, 90, 82, 255))
        iso_poly(d, [(x - pw, 0, 1.1), (x + pw, 0, 1.1), (x + pw, 0, 1.14), (x - pw, 0, 1.14)], (ox, oy), (120, 112, 100, 255))
    for z in (0.55, 1.05):
        iso_poly(d, [(-L / 2, 0, z - 0.04), (L / 2, 0, z - 0.04), (L / 2, 0, z + 0.04), (-L / 2, 0, z + 0.04)], (ox, oy), (52, 50, 48, 255))
        iso_poly(d, [(-L / 2, 0, z + 0.02), (L / 2, 0, z + 0.02), (L / 2, 0, z + 0.045), (-L / 2, 0, z + 0.045)], (ox, oy), (132, 124, 112, 255))
    return im, [ox, oy]


def pillar():
    """A square pillar 0.5 m across, 3.2 m tall: its two seen faces striped as the near walls' pillars (dark with
    a pale band), a lit cap."""
    s = 0.25
    H = 3.2
    w = int(2 * s * PXM * 2) + 4 * OVER
    h = int(H * ZPX + 2 * s * PXM) + 4 * OVER
    im = new(w, h)
    d = ImageDraw.Draw(im)
    ox, oy = w / 2, h - 2 * OVER - s * PXM / 2
    # the +y face (left on screen) darker, the +x face (right) lit
    for (p0, p1), col in ((((-s, s), (s, s)), (58, 52, 46)), (((s, s), (s, -s)), (86, 78, 70))):
        iso_poly(d, [(*p0, 0), (*p1, 0), (*p1, H), (*p0, H)], (ox, oy), (*col, 255))
        # the pale band down the middle of each face
        a = (np.array(p0) * 0.65 + np.array(p1) * 0.35, np.array(p0) * 0.35 + np.array(p1) * 0.65)
        iso_poly(d, [(*a[0], 0.3), (*a[1], 0.3), (*a[1], H - 0.3), (*a[0], H - 0.3)], (ox, oy), (int(col[0] * 1.9), int(col[1] * 1.85), int(col[2] * 1.75), 255))
    iso_poly(d, [(-s, -s, H), (s, -s, H), (s, s, H), (-s, s, H)], (ox, oy), (150, 140, 126, 255))
    return im, [ox, oy]


def ledge(L):
    """A terrace's edge wall along x at y = 0, 1.0 m tall: dark plates, a lit top edge, a white slit every 2 m
    (on the glow page)."""
    H = 1.0
    w = int(L * PXM) + 4 * OVER
    h = int(H * ZPX + L * PXM / 2) + 4 * OVER
    im = new(w, h)
    neon = new(w, h)
    d = ImageDraw.Draw(im)
    dn = ImageDraw.Draw(neon)
    ox, oy = 2 * OVER + L / 2 * PXM, h - 2 * OVER - L / 2 * PXM / 2
    iso_poly(d, [(-L / 2, 0, 0), (L / 2, 0, 0), (L / 2, 0, H), (-L / 2, 0, H)], (ox, oy), (44, 41, 38, 255))
    # plate joints every metre, a lit lip along the top
    x = -L / 2 + 1
    while x < L / 2 - 0.1:
        iso_poly(d, [(x - 0.02, 0, 0), (x + 0.02, 0, 0), (x + 0.02, 0, H), (x - 0.02, 0, H)], (ox, oy), (24, 22, 20, 255))
        x += 1
    iso_poly(d, [(-L / 2, 0, H - 0.06), (L / 2, 0, H - 0.06), (L / 2, 0, H), (-L / 2, 0, H)], (ox, oy), (118, 110, 100, 255))
    iso_poly(d, [(-L / 2, 0, 0), (L / 2, 0, 0), (L / 2, 0, 0.12), (-L / 2, 0, 0.12)], (ox, oy), (30, 28, 26, 255))
    x = -L / 2 + 1
    while x < L / 2 - 0.5:
        for dr, col in ((d, (230, 236, 255, 255)), (dn, (235, 240, 255, 255))):
            iso_poly(dr, [(x - 0.3, 0, 0.42), (x + 0.3, 0, 0.42), (x + 0.3, 0, 0.52), (x - 0.3, 0, 0.52)], (ox, oy), col)
        x += 2
    neon = neon.filter(ImageFilter.GaussianBlur(1.2))
    return im, neon, [ox, oy]


def stairs():
    """Six steps 4 m wide (along x) going down toward +y over 3 m, 1.5 m in all, drawn flat on the ground (no
    height in play): each tread a pale slab, each riser dark; the anchor at the top edge's middle."""
    W, D, n = 4.0, 3.0, 6
    w = int((W + D) * PXM) + 4 * OVER
    h = int((W + D) * PXM / 2 + 1.5 * ZPX) + 4 * OVER
    im = new(w, h)
    d = ImageDraw.Draw(im)
    ox, oy = 2 * OVER + D * PXM, 2 * OVER + 1.5 * ZPX
    for i in range(n):
        y0, y1 = i * D / n, (i + 1) * D / n
        z0, z1 = -i * 1.5 / n, -(i + 1) * 1.5 / n
        tone = 96 - i * 4
        iso_poly(d, [(-W / 2, y0, z0), (W / 2, y0, z0), (W / 2, y1, z0), (-W / 2, y1, z0)], (ox, oy), (tone, tone - 6, tone - 12, 255))
        iso_poly(d, [(-W / 2, y1, z0), (W / 2, y1, z0), (W / 2, y1, z1), (-W / 2, y1, z1)], (ox, oy), (34, 31, 28, 255))
        iso_poly(d, [(-W / 2, y0 + 0.02, z0), (W / 2, y0 + 0.02, z0), (W / 2, y0 + 0.07, z0), (-W / 2, y0 + 0.07, z0)], (ox, oy), (150, 140, 126, 255))
    return im, [ox, oy]


# ------------------------------------------------------------------------------------------------------ atlas
def main():
    pieces = []  # (name, body, neon, anchor, footprint, extra)

    def add(name, body, neon, anchor, fp, **extra):
        pieces.append((name, body, neon, [round(float(anchor[0]), 1), round(float(anchor[1]), 1)], fp, extra))

    def twin(name, body, neon, anchor, fp, **extra):
        add(name, body, neon, anchor, fp, **extra)
        f = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT) if im is not None else None  # noqa: E731
        add(name + '_y', f(body), f(neon), [body.width - anchor[0], anchor[1]], [[y, x] for x, y in fp], **extra)

    strip = passage_strip()
    period = rib_period(strip)
    print('rib period', period, 'px =', period / PXM, 'm')
    to_im = lambda a: Image.fromarray((np.clip(a, 0, 255) + 0.5).astype(np.uint8), 'RGBA')  # noqa: E731
    for L in LENGTHS:
        body, neon, anc = tall_wall(L, strip, period)
        twin(f'mfTall{L:g}', to_im(body), to_im(neon), anc, [[-L / 2, -0.5], [L / 2, -0.5], [L / 2, 0], [-L / 2, 0]], half=L / 2, along='x', pillars=[0, 0])
    for L in (3, 4.5, 6):
        im, anc = rail(L)
        twin(f'mfRail{L:g}', im, None, anc, [[-L / 2, -0.15], [L / 2, -0.15], [L / 2, 0.15], [-L / 2, 0.15]])
    im, anc = pillar()
    add('mfPillar', im, None, anc, [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]])
    for L in (2, 4, 6):
        im, neon, anc = ledge(L)
        twin(f'mfLedge{L:g}', im, neon, anc, [[-L / 2, -0.3], [L / 2, -0.3], [L / 2, 0], [-L / 2, 0]])
    im, anc = stairs()
    twin('mfStairs', im, None, anc, [[-2, 0], [2, 0], [2, 3], [-2, 3]])

    W = 2048
    x = y = rowh = 0
    place = []
    for name, body, neon, anc, fp, extra in pieces:
        if x + body.width > W:
            x, y, rowh = 0, y + rowh + 2, 0
        place.append((name, body, neon, x, y, anc, fp, extra))
        x += body.width + 2
        rowh = max(rowh, body.height)
    ph = y + rowh
    # under the near walls' bays: their atlas cropped back to its own rows (an earlier run's parts taken off)
    atlas = json.loads((OUT / 'lowwall.json').read_text())
    base = Image.open(OUT / 'lowwall.png').convert('RGBA')
    base_h = atlas.get('baseH', base.height)
    base = base.crop((0, 0, W, base_h))
    sprites = {k: v for k, v in atlas['sprites'].items() if not any(k.startswith(q) for q in ('mfTall', 'mfRail', 'mfPillar', 'mfLedge', 'mfStairs'))}
    page = Image.new('RGBA', (W, base_h + 2 * ph))
    page.paste(base, (0, 0))
    for name, body, neon, px, py, anc, fp, extra in place:
        page.paste(body, (px, base_h + py))
        if neon is not None:
            page.paste(neon, (px, base_h + ph + py))
        sprites[name] = {'rect': [px, base_h + py, body.width, body.height], 'anchor': anc, 'k': 1 / OVER, 'footprint': fp, 'lights': [], **extra, **({'glow': True} if neon is not None else {})}
    page.save(OUT / 'lowwall.png', optimize=True)
    out = {'page': 'lowwall.png', 'baseH': base_h, 'glowShift': ph, 'neonLevel': {'base': 1, 'hum': 0.04, 'speed': 0.3, 'flicker': {'rate': 0.01, 'dur': [0.05, 0.12], 'level': 0.7}}, 'sprites': sprites}
    (OUT / 'lowwall.json').write_text(json.dumps(out))
    print('lowwall.png', page.size, len(sprites), 'sprites', len(place), 'parts')


if __name__ == '__main__':
    main()
