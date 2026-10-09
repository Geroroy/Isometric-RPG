"""
Coruscant undercity assets, modelled procedurally in Blender to one art
direction and exported one .glb each for render_building.py.

  python build_city_assets.py out_dir [name …]          (bpy module)

The brief every asset follows (the common style line of the asset prompts):
an isometric game asset in a high-detail pre-rendered 3D style, a gritty,
weathered sci-fi underworld city — grime, rust stains, exposed pipes and
cables, wet surfaces — at night, warm amber against neon magenta / teal,
alien glyph signage with no readable letters, nothing beyond the footprint.
The camera and the key light (upper left) come from render_building.py,
the same rig as the characters.

Materials named `lit*` glow but stay on (windows, lamps, doorway light):
render_building.py keeps them in the body layer. Other emissive materials
are neon: they go to the flickering neon layer.

Assets (name: what — footprint in tiles):
  cantina      two-storey cantina: riveted walls, wide doorway spilling amber
               light, round orange / pink neon sign, balcony with railing and
               hanging lamps, rooftop vents, cables down the facade, awning,
               crates by the door — 7 × 6
  tenement0-2  tall narrow tower of stacked boxy flats, windows of different
               colours, outside stairs and catwalks, laundry lines and
               cables, dishes and antennas on top, vertical neon strips on the
               corner, water stains — 4 × 4
  stall0-2     market stall: slanted striped canopy, metal counter with
               strange fruit, machine parts and glowing vials, a hanging
               lantern, glyph price boards, a small holo-projector — 2.4 × 1.4
  billboard    holo billboard tower: slim pole with cable bundles, a frame
               the game fills with a cycling hologram, maintenance ladder,
               bolted base with warning stripes — 1.4 × 1.4
  speeder0-1   parked hover speeder bike: dark scratched body with patched
               panels, one headlight, glowing exhausts, a blue glow under it — 2.4 × 1
  crates       stacked cargo crates with stencilled glyphs
  barrels      a cluster of fuel barrels
  ventGrate    a steam vent grate in the street (the game adds the steam)
  droidParts   a pile of broken droid parts
  trashBin     a battered trash bin
  junctionBox  a cable junction box with blinking lights

Coordinates: Blender +X = game +x, Blender −Y = game +y, +Z up; one unit is
one tile. The camera sees the +X and −Y faces, so fronts face those ways.
"""
import math
import os
import sys

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = argv[0]
ONLY = argv[1:]
TAU = math.tau
os.makedirs(OUT, exist_ok=True)
TEX_DIR = os.path.join(OUT, 'tex')

# ----------------------------------------------------------------------------
# Textures (numpy, tileable), generated once and loaded into each scene


def periodic_noise(res, cells, seed):
    r = np.random.default_rng(seed)
    lat = r.random((cells, cells))
    t = np.linspace(0, cells, res, endpoint=False)
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    fx, fy = f[None, :], f[:, None]
    return (lat[np.ix_(i0, i0)] * (1 - fx) + lat[np.ix_(i0, i1)] * fx) * (1 - fy) + (lat[np.ix_(i1, i0)] * (1 - fx) + lat[np.ix_(i1, i1)] * fx) * fy


def fbm(res, base, octaves, seed, gain=0.5):
    out, amp, tot = np.zeros((res, res)), 1.0, 0.0
    for o in range(octaves):
        out += periodic_noise(res, base * 2 ** o, seed + o) * amp
        tot += amp
        amp *= gain
    return out / tot


def streaks(res, n, seed, length=(0.1, 0.5)):
    """Vertical drip stains (v up in the image = down the wall)."""
    r = np.random.default_rng(seed)
    out = np.zeros((res, res))
    yy = np.arange(res)
    for _ in range(n):
        x = int(r.random() * res)
        w = int(r.random() * 5 + 2)
        y0 = int(r.random() * res)
        ln = int((r.random() * (length[1] - length[0]) + length[0]) * res)
        fade = np.clip(1 - ((yy - y0) % res) / max(ln, 1), 0, 1) * (((yy - y0) % res) < ln)
        for dx in range(-w, w + 1):
            out[:, (x + dx) % res] = np.maximum(out[:, (x + dx) % res], fade * (1 - abs(dx) / (w + 1)) * r.uniform(0.5, 1))
    return out


def normal_map(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack((-gx, gy, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def glyph_mask(res, rows, cols, seed, ink=0.12):
    """Rows of alien glyphs: strokes and dots on a cell grid, no letters."""
    r = np.random.default_rng(seed)
    m = np.zeros((res, res))
    ch, cw = res // rows, res // cols
    for i in range(rows):
        for j in range(cols):
            if r.random() < 0.25:
                continue
            y0, x0 = i * ch + ch // 6, j * cw + cw // 6
            h, w = ch * 2 // 3, cw * 2 // 3
            t = max(1, int(min(h, w) * ink))
            for _ in range(r.integers(2, 4)):
                kind = r.integers(0, 4)
                if kind == 0:  # vertical bar
                    x = x0 + r.integers(0, w)
                    m[y0:y0 + h, max(0, x - t):x + t] = 1
                elif kind == 1:  # horizontal bar
                    y = y0 + r.integers(0, h)
                    m[max(0, y - t):y + t, x0:x0 + w] = 1
                elif kind == 2:  # ring
                    yy, xx = np.mgrid[0:h, 0:w]
                    d = np.hypot(yy - h / 2, xx - w / 2)
                    rr = min(h, w) * r.uniform(0.2, 0.45)
                    m[y0:y0 + h, x0:x0 + w] = np.maximum(m[y0:y0 + h, x0:x0 + w], (np.abs(d - rr) < t).astype(float))
                else:  # dot
                    y, x = y0 + r.integers(0, h), x0 + r.integers(0, w)
                    m[max(0, y - 2 * t):y + 2 * t, max(0, x - 2 * t):x + 2 * t] = 1
    return m


R = 512


def make_texture_arrays():
    yy, xx = np.mgrid[0:R, 0:R] / R
    T = {}
    grime = fbm(R, 4, 5, 1)
    stain = streaks(R, 40, 2)
    rust = streaks(R, 18, 3, (0.15, 0.6)) * (fbm(R, 8, 3, 4) > 0.45)
    # riveted panels: seams on a quarter grid, rivets along them
    seam = ((np.abs((xx * 4) % 1 - 0.5) > 0.485) | (np.abs((yy * 4) % 1 - 0.5) > 0.485)).astype(float)
    rv = (np.hypot((xx * 16) % 1 - 0.5, (yy * 4) % 1 - 0.08) < 0.12) | (np.hypot((xx * 4) % 1 - 0.08, (yy * 16) % 1 - 0.5) < 0.12)
    alb = 0.85 + 0.25 * (grime - 0.5) - seam * 0.35 - stain * 0.22 + rv * 0.12
    col = np.dstack([alb] * 3)
    col = col * (1 - rust[..., None] * 0.7) + rust[..., None] * np.array([0.55, 0.3, 0.16])
    T['panel'] = (col, normal_map(-seam * 0.8 + rv * 0.6 + fbm(R, 32, 2, 5) * 0.2, 1.6))
    # plain worn metal (pipes, frames)
    alb = 0.85 + 0.3 * (grime - 0.5) - stain * 0.18
    T['metal'] = (np.dstack([alb] * 3) * (1 - rust[..., None] * 0.5) + rust[..., None] * np.array([0.5, 0.28, 0.15]) * 0.5,
                  normal_map(fbm(R, 32, 2, 6) * 0.3, 1.2))
    # duracrete: pores, cracks, water stains
    crack = (np.abs(fbm(R, 6, 4, 7) - 0.5) < 0.012).astype(float)
    alb = 0.82 + 0.2 * (fbm(R, 24, 3, 8) - 0.5) - crack * 0.3 - stain * 0.25
    T['concrete'] = (np.dstack([alb] * 3), normal_map(fbm(R, 48, 2, 9) * 0.5 - crack, 1.5))
    # canvas: woven, faded stripes (the colour comes from the material)
    weave = 0.5 + 0.5 * np.sin(xx * TAU * 90) * np.sin(yy * TAU * 90)
    stripes = (np.floor(xx * 6) % 2)
    alb = (0.75 + 0.25 * stripes) * (0.9 + 0.1 * weave) - stain * 0.2 + 0.15 * (grime - 0.5)
    T['canvas'] = (np.dstack([alb] * 3), normal_map(weave, 0.8))
    # crate wood-plastic with stencilled glyphs
    g = glyph_mask(R, 3, 4, 10)
    alb = 0.85 + 0.15 * (fbm(R, 16, 3, 11) - 0.5) - g * 0.55 - stain * 0.15
    T['crate'] = (np.dstack([alb] * 3), normal_map(fbm(R, 32, 2, 12) * 0.3, 1.0))
    # warning stripes
    ws = (np.floor((xx + yy) * 8) % 2)
    T['hazard'] = (np.dstack([0.12 + 0.75 * ws, 0.1 + 0.6 * ws, 0.05 + 0.08 * ws]) * (0.85 + 0.3 * (grime[..., None] - 0.5)), None)
    # glyph boards (price boards, signs): light glyphs on a dark board
    g = glyph_mask(R, 4, 3, 13, 0.16)
    T['board'] = (np.dstack([0.12 + 0.75 * g] * 3), None)
    return T


TEXA = make_texture_arrays()


def save_png(name, arr):
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(np.dstack((np.clip(arr, 0, 1), np.ones((h, w))))).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEX_DIR, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def lin(color):
    c = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


class Scene:
    """One asset's scene: materials on demand, geometry helpers."""

    def __init__(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.coll = bpy.context.scene.collection
        self.mats = {}
        self.tex = {}
        self.n = 0

    def texture(self, kind):
        if kind not in self.tex:
            a, nrm = TEXA[kind]
            self.tex[kind] = (save_png(kind + '_a', a), save_png(kind + '_n', nrm) if nrm is not None else None)
        return self.tex[kind]

    def mat(self, name, color, kind=None, rough=0.6, metal=0.0, emit=0.0):
        """Principled material; `emit` > 0 makes it glow (neon, or steady if the name starts with 'lit')."""
        key = name
        if key in self.mats:
            return self.mats[key]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes['Principled BSDF']
        c = lin(color)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        b.inputs['Base Color'].default_value = (*c, 1)
        if emit:
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = emit
        elif kind:
            alb, nrm = self.texture(kind)
            ti = nt.nodes.new('ShaderNodeTexImage')
            ti.image = alb
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            mix.inputs[6].default_value = (*c, 1)
            nt.links.new(ti.outputs['Color'], mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
            if nrm:
                tn = nt.nodes.new('ShaderNodeTexImage')
                tn.image = nrm
                tn.image.colorspace_settings.name = 'Non-Color'
                nm = nt.nodes.new('ShaderNodeNormalMap')
                nm.inputs['Strength'].default_value = 0.7
                nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
                nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        self.mats[key] = m
        return m

    # --- geometry -------------------------------------------------------------

    def obj(self, bm, mat, smooth=False, bevel=0.0, uvscale=1.0, subsurf=0):
        uv = bm.loops.layers.uv.verify()
        bm.normal_update()
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                co = lp.vert.co
                lp[uv].uv = [(co.y * uvscale, co.z * uvscale), (co.x * uvscale, co.z * uvscale), (co.x * uvscale, co.y * uvscale)][ax]
        self.n += 1
        me = bpy.data.meshes.new(f'm{self.n}')
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f'o{self.n}', me)
        self.coll.objects.link(o)
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = smooth
        if bevel:
            md = o.modifiers.new('bevel', 'BEVEL')
            md.width = bevel
            md.segments = 2
            md.limit_method = 'ANGLE'
        if subsurf:
            md = o.modifiers.new('subd', 'SUBSURF')
            md.levels = md.render_levels = subsurf
        return o

    def box(self, mat, size, at, rot=0.0, bevel=0.01, uvscale=1.0, tilt=None):
        """A box `size` (x, y, z) with its base centre at `at`, turned `rot` about Z."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        q = Quaternion(Vector((0, 0, 1)), rot)
        if tilt:
            q = q @ Quaternion(Vector(tilt[0]), tilt[1])
        m = Matrix.LocRotScale(Vector(at) + q @ Vector((0, 0, size[2] / 2)), q, Vector(size))
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        return self.obj(bm, mat, bevel=bevel, uvscale=uvscale)

    def cyl(self, mat, r, h, at, segs=16, axis='Z', r2=None, uvscale=1.0, cap=True, smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
        rot = {'Z': Matrix.Identity(4), 'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
        off = {'Z': Vector((0, 0, h / 2)), 'X': Vector((h / 2, 0, 0)), 'Y': Vector((0, h / 2, 0))}[axis]
        bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(at) + off) @ rot, verts=bm.verts)
        return self.obj(bm, mat, smooth=smooth, uvscale=uvscale)

    def sphere(self, mat, r, at, scale=(1, 1, 1), segs=12):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
        bmesh.ops.transform(bm, matrix=Matrix.LocRotScale(Vector(at), None, Vector(scale)), verts=bm.verts)
        return self.obj(bm, mat, smooth=True)

    def tube(self, mat, pts, r, segs=6):
        """A tube along a polyline (cables, neon tubes, railings)."""
        bm = bmesh.new()
        pts = [Vector(p) for p in pts]
        rings, prev = [], None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            n = prev if prev is not None else t.orthogonal().normalized()
            n = (n - t * n.dot(t)).normalized()
            b = t.cross(n)
            prev = n
            rings.append([bm.verts.new(p + (n * math.cos(TAU * k / segs) + b * math.sin(TAU * k / segs)) * r) for k in range(segs)])
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        return self.obj(bm, mat, smooth=True)

    def cable(self, mat, a, b, sag, r=0.02, n=12):
        a, b = Vector(a), Vector(b)
        return self.tube(mat, [a.lerp(b, t) - Vector((0, 0, sag * 4 * t * (1 - t))) for t in np.linspace(0, 1, n)], r)

    def ring(self, mat, center, radius, r, normal, segs=32):
        """A torus-like tube ring (round neon signs)."""
        q = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
        pts = [Vector(center) + q @ Vector((math.cos(a) * radius, math.sin(a) * radius, 0)) for a in np.linspace(0, TAU, segs + 1)]
        return self.tube(mat, pts, r, segs=6)

    def plate(self, mat, corners, thick=0.02, uvscale=1.0):
        """A flat quad (4 corners) given thickness along its normal (awnings, panels, glyph boards)."""
        bm = bmesh.new()
        vs = [bm.verts.new(c) for c in corners]
        f = bm.faces.new(vs)
        bm.normal_update()
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        n = f.normal.copy()
        for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
            v.co -= n * thick
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.obj(bm, mat, uvscale=uvscale)

    def export(self, name):
        path = os.path.join(OUT, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True, export_lights=True)
        print('exported', path)


def G(x, y, z=0.0):
    """Game tile coordinates -> Blender (+x right-down, +y left-down on screen)."""
    return (x, -y, z)


# ----------------------------------------------------------------------------
# Assets

NEON = dict(pink=0xff4fa8, orange=0xff8a2a, teal=0x3ff0d8, magenta=0xff3fd0, cyan=0x4fe6ff, amber=0xffb347, violet=0xa070ff, red=0xff4040, green=0x6dff8a)


def window_grid(s, x0, x1, y_face, z0, z1, rows, cols, face='y', rng=None, depth=0.04, lit_p=0.6):
    """Small windows on a wall, a different light behind each (some dark)."""
    cols_ = [0xffc27a, 0xffe2a8, 0x9fe8ff, 0xff9ad0, 0xc8a2ff, 0x9dffb8]
    for i in range(rows):
        for j in range(cols):
            u = x0 + (x1 - x0) * (j + 0.5) / cols
            z = z0 + (z1 - z0) * (i + 0.5) / rows
            on = rng.random() < lit_p
            c = cols_[rng.integers(0, len(cols_))]
            m = s.mat(f'lit_win{c:x}', c, emit=rng.uniform(1.5, 3.2) if on else 0, rough=0.2) if on else s.mat('glassDark', 0x141a20, rough=0.15)
            w, h = 0.32, 0.38
            if face == 'y':  # on the game +y face (Blender −Y)
                s.box(s.mat('frame', 0x2c2d30, 'metal', 0.5, 0.4), (w + 0.08, depth + 0.02, h + 0.08), G(u, y_face, z - h / 2 - 0.04), bevel=0.005)
                s.box(m, (w, depth + 0.04, h), G(u, y_face + 0.005, z - h / 2), bevel=0)
            else:  # on the game +x face
                s.box(s.mat('frame', 0x2c2d30, 'metal', 0.5, 0.4), (depth + 0.02, w + 0.08, h + 0.08), G(y_face, u, z - h / 2 - 0.04), bevel=0.005)
                s.box(m, (depth + 0.04, w, h), G(y_face + 0.005, u, z - h / 2), bevel=0)


def doorway(s, u, face_at, w, h, glow, face='y', z0=0.0):
    """A lit doorway: a warm, softly graded glow behind a curtain of bead
    strands, framed by the dark recess of the opening."""
    warm = s.mat(f'lit_door{glow}', 0xffa64a, emit=glow, rough=0.5)
    recess = s.mat('recess', 0x0e0d0c, None, 0.9)
    bead = s.mat('beads', 0x3a2418, None, 0.6)
    if face == 'y':
        s.box(recess, (w + 0.1, 0.05, h + 0.05), G(u, face_at - 0.01, z0), bevel=0)
        s.box(warm, (w * 0.86, 0.05, h * 0.9), G(u, face_at + 0.01, z0), bevel=0)
        for k in range(int(w / 0.09)):
            x = u - w / 2 + 0.06 + k * 0.09
            s.cyl(bead, 0.012, h * 0.88, G(x, face_at + 0.05, z0 + 0.02), segs=4)
    else:
        s.box(recess, (0.05, w + 0.1, h + 0.05), G(face_at - 0.01, u, z0), bevel=0)
        s.box(warm, (0.05, w * 0.86, h * 0.9), G(face_at + 0.01, u, z0), bevel=0)
        for k in range(int(w / 0.09)):
            y = u - w / 2 + 0.06 + k * 0.09
            s.cyl(bead, 0.012, h * 0.88, G(face_at + 0.05, y, z0 + 0.02), segs=4)


def cantina(s, rng):
    wall = s.mat('wall', 0x8a7a68, 'panel', 0.55, 0.3)
    wall2 = s.mat('wall2', 0x6e7276, 'panel', 0.5, 0.35)
    dark = s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5)
    rustm = s.mat('rust', 0x7a4a2e, 'metal', 0.8, 0.2)
    cable = s.mat('cable', 0x121214, None, 0.6)
    # ground floor: 7 × 6, 3.2 high; the upper floor set back, 2.6 high
    s.box(wall, (7, 6, 3.2), G(0, 0), bevel=0.03, uvscale=0.5)
    s.box(dark, (7.12, 6.12, 0.18), G(0, 0, 3.2), bevel=0.02)  # floor slab edge
    s.box(wall2, (5.4, 4.6, 2.6), G(-0.5, -0.4, 3.38), bevel=0.03, uvscale=0.5)
    s.box(dark, (5.6, 4.8, 0.16), G(-0.5, -0.4, 5.98), bevel=0.02)
    # riveted bands
    for z in (1.0, 2.2):
        s.box(dark, (7.06, 6.06, 0.08), G(0, 0, z), bevel=0.01)
    # the doorway on the +y face: a wide opening with amber light spilling out
    doorway(s, 0.4, 3.0, 2.2, 2.2, 1.6)
    s.box(dark, (2.6, 0.2, 0.25), G(0.4, 3.02, 2.2), bevel=0.02)  # lintel
    for dx in (-1.25, 1.25):
        s.box(dark, (0.18, 0.22, 2.25), G(0.4 + dx, 3.02, 0), bevel=0.02)
    light = bpy.data.lights.new('spill', 'AREA')
    light.energy = 260
    light.color = (1.0, 0.62, 0.3)
    light.size = 2.0
    lo = bpy.data.objects.new('spill', light)
    s.coll.objects.link(lo)
    lo.location = G(0.4, 3.6, 1.2)
    lo.rotation_euler = (math.radians(60), 0, 0)
    # the worn metal awning over the door
    s.plate(rustm, [G(-1.2, 3.0, 2.75), G(2.0, 3.0, 2.75), G(2.0, 4.1, 2.45), G(-1.2, 4.1, 2.45)], 0.04)
    for dx in (-1.0, 1.8):
        s.tube(dark, [G(dx, 3.0, 3.1), G(dx, 4.0, 2.5)], 0.03)
    # the round neon sign above the entrance: orange ring, pink ring, glyphs inside
    c = Vector(G(0.4, 3.08, 3.9))
    s.ring(s.mat('neonOrange', NEON['orange'], emit=8), c, 0.62, 0.045, (0, -1, 0))
    s.ring(s.mat('neonPink', NEON['pink'], emit=8), c + Vector((0, -0.03, 0)), 0.45, 0.035, (0, -1, 0))
    s.cyl(s.mat('signBack', 0x1c1a20, None, 0.4), 0.66, 0.05, tuple(c + Vector((0, 0.05, 0))), axis='Y', segs=32)
    for k in range(3):
        a = k * TAU / 3 + 0.4
        p = c + Vector((math.cos(a) * 0.22, -0.04, math.sin(a) * 0.22))
        s.tube(s.mat('neonPink', NEON['pink'], emit=8), [p, p + Vector((math.cos(a + 2) * 0.12, 0, math.sin(a + 2) * 0.12))], 0.025)
    # the balcony on the upper floor's +x side: deck, railing, hanging lamps
    s.box(dark, (1.2, 4.2, 0.1), G(2.8, -0.4, 3.38), bevel=0.02)
    rail = s.mat('rail', 0x3a3b3f, 'metal', 0.45, 0.6)
    for y in np.linspace(-2.4, 1.6, 9):
        s.cyl(rail, 0.025, 0.9, G(3.35, y, 3.48), segs=6)
    s.tube(rail, [G(3.35, -2.45, 4.38), G(3.35, 1.65, 4.38)], 0.035)
    s.tube(rail, [G(3.35, -2.45, 3.95), G(3.35, 1.65, 3.95)], 0.02)
    for y in (-1.6, 0.0, 1.2):
        s.cable(cable, G(2.15, y, 5.9), G(2.15, y + 0.01, 5.2), 0.0, 0.01)
        s.sphere(s.mat('lit_lamp', 0xffc070, emit=6), 0.11, G(2.15, y, 5.12))
    # balcony door and windows
    doorway(s, -0.6, 2.2, 1.0, 1.8, 0.9, face='x', z0=3.48)
    window_grid(s, -3.0, 1.8, 1.9, 3.7, 5.6, 2, 4, face='y', rng=rng)
    window_grid(s, -2.6, 2.6, 3.5, 1.2, 2.8, 1, 3, face='x', rng=rng, lit_p=0.4)
    # rooftop vents (the game adds steam) and a fan housing
    for (x, y) in ((-2.0, -1.6), (-0.4, -2.2), (1.0, -1.2)):
        s.cyl(dark, 0.22, 0.6, G(x, y, 6.14), segs=12)
        s.cyl(rustm, 0.27, 0.08, G(x, y, 6.74), segs=12)
    s.box(dark, (1.2, 1.2, 0.5), G(-2.4, 0.6, 6.14), bevel=0.03)
    s.cyl(s.mat('fan', 0x1a1b1d, None, 0.4), 0.45, 0.06, G(-2.4, 0.6, 6.64), segs=20)
    # pipes and tangled cables down the facade
    pipe = s.mat('pipe', 0x5c5850, 'metal', 0.45, 0.6)
    for y in (-2.6, 2.6):
        s.tube(pipe, [G(3.55, y, 0.2), G(3.55, y, 5.8), G(3.0, y, 6.1)], 0.07, segs=8)
    for k in range(6):
        x0 = rng.uniform(-3.2, -1.2)
        pts = [G(x0 + 0.08 * math.sin(t * 7 + k), 3.07, 5.9 - t * 5.6) for t in np.linspace(0, 1, 10)]
        s.tube(cable, pts, rng.uniform(0.015, 0.03))
    for k in range(3):
        s.cable(cable, G(3.53, rng.uniform(-2.5, 2.5), 3.0), G(3.53, rng.uniform(-2.5, 2.5), 3.1), 0.35, 0.02)
    # crates stacked beside the door, a barrel
    crate = s.mat('crate', 0x6a5a44, 'crate', 0.7)
    s.box(crate, (0.8, 0.8, 0.7), G(2.5, 3.5, 0), rot=0.1, bevel=0.03)
    s.box(crate, (0.7, 0.7, 0.6), G(2.45, 3.45, 0.7), rot=-0.15, bevel=0.03)
    s.box(crate, (0.6, 0.6, 0.5), G(3.2, 2.7, 0), rot=0.4, bevel=0.03)
    s.cyl(s.mat('barrelBlue', 0x2c4a66, 'metal', 0.5, 0.3), 0.3, 0.9, G(-1.6, 3.45, 0), segs=16)
    # a glyph board on the +x wall
    s.plate(s.mat('board', 0xd0d8e0, 'board', 0.5), [G(3.52, -1.8, 2.7), G(3.52, -0.4, 2.7), G(3.52, -0.4, 1.4), G(3.52, -1.8, 1.4)], 0.03)
    s.box(s.mat('neonTeal', NEON['teal'], emit=7), (0.04, 1.5, 0.04), G(3.56, -1.1, 2.78), bevel=0)


def tenement(s, rng, variant):
    pal = [(0x6f6658, 0x4f5258), (0x5f6a6c, 0x6a5848), (0x705c50, 0x535a62)][variant]
    walls = [s.mat(f'wallA{variant}', pal[0], 'panel', 0.6, 0.25), s.mat(f'wallB{variant}', pal[1], 'concrete', 0.75)]
    dark = s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5)
    cable = s.mat('cable', 0x121214, None, 0.6)
    floors = [8, 9, 10][variant]
    z = 0.0
    # stacked flats, each a little offset, some jutting out
    for i in range(floors):
        h = rng.uniform(1.15, 1.4)
        w, d = rng.uniform(3.2, 3.8), rng.uniform(3.2, 3.8)
        ox, oy = rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25)
        if i == 0:
            w, d, ox, oy = 3.8, 3.8, 0, 0
        s.box(walls[i % 2], (w, d, h), G(ox, oy, z), bevel=0.025, uvscale=0.6)
        s.box(dark, (w + 0.08, d + 0.08, 0.08), G(ox, oy, z + h - 0.04), bevel=0.01)
        window_grid(s, oy - d / 2 + 0.4, oy + d / 2 - 0.4, ox + w / 2, z + 0.2, z + h - 0.15, 1, rng.integers(2, 4), face='x', rng=rng)
        window_grid(s, ox - w / 2 + 0.4, ox + w / 2 - 0.4, oy + d / 2, z + 0.2, z + h - 0.15, 1, rng.integers(2, 4), face='y', rng=rng)
        if i and rng.random() < 0.45:  # a jutting module or an AC box
            s.box(walls[(i + 1) % 2], (0.9, 1.1, 0.8), G(ox + w / 2 + 0.3, oy + rng.uniform(-1, 1), z + 0.2), bevel=0.02)
        if rng.random() < 0.5:
            s.box(s.mat('acUnit', 0x8a8a84, 'metal', 0.5, 0.3), (0.5, 0.35, 0.35), G(ox + rng.uniform(-1, 1), oy + d / 2 + 0.18, z + 0.1), bevel=0.02)
        z += h
    top = z
    # outside stairs: a zigzag of flights on the +x side with landings (catwalks)
    stair = s.mat('stair', 0x3b3c40, 'metal', 0.5, 0.6)
    for i in range(floors - 1):
        zz = i * 1.27 + 1.2
        s.box(stair, (0.7, 2.6, 0.06), G(2.25, 0.2, zz), bevel=0.005)  # catwalk
        s.tube(stair, [G(2.58, -1.1, zz + 0.5), G(2.58, 1.5, zz + 0.5)], 0.02)
        a, b = (-0.9, 1.2) if i % 2 else (1.2, -0.9)
        s.plate(stair, [G(1.95, a, zz + 0.06), G(2.5, a, zz + 0.06), G(2.5, b, zz + 1.33), G(1.95, b, zz + 1.33)], 0.05)
    # laundry lines and cables between the floors, sagging off the +y face
    cloth = [s.mat(f'cloth{k}', c, 'canvas', 0.9) for k, c in enumerate((0xa04040, 0x3a6a8a, 0xc0a060, 0xd0d0c8))]
    for i in range(2, floors, 3):
        zz = i * 1.27 + 0.9
        s.cable(cable, G(-1.9, 2.0, zz), G(1.9, 2.0, zz), 0.25, 0.012)
        for k in range(rng.integers(2, 5)):
            t = rng.uniform(0.15, 0.85)
            x = -1.9 + 3.8 * t
            sag = 0.25 * 4 * t * (1 - t)
            s.box(cloth[rng.integers(0, 4)], (rng.uniform(0.25, 0.45), 0.02, rng.uniform(0.3, 0.5)), G(x, 2.0, zz - sag - 0.45), bevel=0)
    for k in range(4):
        s.cable(cable, G(rng.uniform(-1.8, 1.8), 1.95, rng.uniform(2, top - 1)), G(1.95, rng.uniform(-1.8, 1.8), rng.uniform(2, top - 1)), 0.4, 0.015)
    # dishes and antennas on the roof
    dish = s.mat('dish', 0xb8b8b0, 'metal', 0.4, 0.5)
    for k in range(rng.integers(1, 3)):
        p = Vector(G(rng.uniform(-1, 1), rng.uniform(-1, 1), top))
        s.cyl(dark, 0.04, 0.6, tuple(p), segs=6)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.45)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > -0.18], context='VERTS')
        bmesh.ops.transform(bm, matrix=Matrix.Translation(p + Vector((0, 0, 0.95))) @ Matrix.Rotation(rng.uniform(0.6, 1.2), 4, Vector((1, -1, 0)).normalized()), verts=bm.verts)
        s.obj(bm, dish, smooth=True)
    for k in range(3):
        p = G(rng.uniform(-1.4, 1.4), rng.uniform(-1.4, 1.4), top)
        h = rng.uniform(1.2, 2.4)
        s.cyl(dark, 0.025, h, p, segs=5)
        s.sphere(s.mat('neonRed', NEON['red'], emit=6), 0.05, (p[0], p[1], p[2] + h))
    s.box(dark, (1.0, 1.0, 0.6), G(-0.8, -0.8, top), bevel=0.02)  # lift housing
    # vertical neon strip signs on the front corner
    strip = [('neonMagenta', NEON['magenta']), ('neonCyan', NEON['cyan']), ('neonAmber', NEON['amber'])][variant]
    zc = rng.uniform(3.0, top - 4.0)
    s.box(s.mat('signBack', 0x16161a, None, 0.4), (0.22, 0.5, 3.0), G(1.95, 1.95, zc), rot=math.pi / 4, bevel=0.01)
    nm = s.mat(strip[0], strip[1], emit=8)
    s.box(nm, (0.05, 0.05, 2.8), G(2.05, 2.05, zc + 0.1), rot=math.pi / 4, bevel=0)
    for k in range(5):
        s.box(nm, (0.04, 0.3, 0.06), G(2.05, 2.05, zc + 0.35 + k * 0.55), rot=math.pi / 4 + 0.3 * (k % 2), bevel=0)
    # a ground-floor shutter
    s.plate(s.mat('shutter', 0x55524c, 'panel', 0.6, 0.5), [G(-1.2, 1.92, 1.6), G(0.6, 1.92, 1.6), G(0.6, 1.92, 0.0), G(-1.2, 1.92, 0.0)], 0.03, 2.0)


def stall(s, rng, variant):
    canvas = s.mat(f'canvas{variant}', [0x9a3a2c, 0x2f6f6c, 0xa07a3a][variant], 'canvas', 0.9)
    metal = s.mat('counter', 0x5a5a58, 'metal', 0.45, 0.6)
    dark = s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5)
    # the counter, facing +y
    s.box(metal, (2.2, 0.8, 0.9), G(0, 0.2), bevel=0.02)
    s.box(dark, (2.3, 0.9, 0.06), G(0, 0.2, 0.9), bevel=0.01)
    s.box(s.mat('crate', 0x6a5a44, 'crate', 0.7), (0.6, 0.6, 0.5), G(-0.7, 0.6, 0), rot=0.2, bevel=0.02)
    # posts and the slanted canopy
    for x in (-1.1, 1.1):
        s.cyl(dark, 0.04, 2.3, G(x, -0.35, 0), segs=6)
        s.cyl(dark, 0.04, 2.0, G(x, 0.4, 0), segs=6)
    s.plate(canvas, [G(-1.3, -0.5, 2.35), G(1.3, -0.5, 2.35), G(1.3, 0.45, 2.0), G(-1.3, 0.45, 2.0)], 0.03, 1.2)
    s.plate(canvas, [G(-1.3, 0.45, 2.0), G(1.3, 0.45, 2.0), G(1.3, 0.5, 1.8), G(-1.3, 0.5, 1.8)], 0.02, 1.2)  # valance
    # goods: strange fruit, machine parts, glowing vials
    fruit = [s.mat(f'fruit{k}', c, None, 0.4) for k, c in enumerate((0xc04a8a, 0xe0b040, 0x60b050, 0xd06030))]
    for k in range(14):
        s.sphere(fruit[rng.integers(0, 4)], rng.uniform(0.06, 0.1), G(rng.uniform(-1.0, -0.1), rng.uniform(-0.05, 0.45), 0.98), (1, 1, rng.uniform(0.8, 1.3)), segs=8)
    part = s.mat('parts', 0x8a8a80, 'metal', 0.35, 0.8)
    for k in range(6):
        s.box(part, (rng.uniform(0.08, 0.2), rng.uniform(0.08, 0.2), rng.uniform(0.05, 0.15)), G(rng.uniform(0.1, 0.6), rng.uniform(0.0, 0.45), 0.96), rot=rng.uniform(0, 3), bevel=0.01)
    vial = s.mat(['neonTeal', 'neonMagenta', 'neonGreen'][variant], [NEON['teal'], NEON['magenta'], NEON['green']][variant], emit=6)
    for k in range(5):
        s.cyl(vial, 0.03, 0.16, G(0.75 + k * 0.08, 0.35 - (k % 2) * 0.12, 0.96), segs=8)
    # the hanging lantern and the glyph price boards
    s.cable(s.mat('cable', 0x121214, None, 0.6), G(0.6, 0.4, 2.15), G(0.6, 0.41, 1.75), 0.0, 0.01)
    s.sphere(s.mat('lit_lantern', 0xffb860, emit=7), 0.1, G(0.6, 0.4, 1.68))
    s.plate(s.mat('board', 0xe0d8c8, 'board', 0.6), [G(-1.0, 0.62, 0.8), G(-0.2, 0.62, 0.8), G(-0.2, 0.62, 0.45), G(-1.0, 0.62, 0.45)], 0.02)
    s.plate(s.mat('board', 0xe0d8c8, 'board', 0.6), [G(1.12, -0.1, 1.6), G(1.12, 0.5, 1.6), G(1.12, 0.5, 1.2), G(1.12, -0.1, 1.2)], 0.02)
    # the little holo-projector: a disc with a cone of light and an item over it
    s.cyl(dark, 0.09, 0.05, G(0.35, -0.05, 0.96), segs=12)
    s.cyl(s.mat('neonCyan', NEON['cyan'], emit=2.5), 0.12, 0.25, G(0.35, -0.05, 1.01), segs=12, r2=0.02)
    s.box(s.mat('neonCyan', NEON['cyan'], emit=2.5), (0.12, 0.12, 0.12), G(0.35, -0.05, 1.3), rot=0.6, tilt=((1, 0, 0), 0.6), bevel=0)


def billboard(s, rng):
    dark = s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5)
    cable = s.mat('cable', 0x121214, None, 0.6)
    s.box(s.mat('hazard', 0xffffff, 'hazard', 0.6), (1.2, 1.2, 0.25), G(0, 0), bevel=0.03, uvscale=1.5)
    for (x, y) in ((-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45)):
        s.cyl(s.mat('bolt', 0x9a9a90, 'metal', 0.3, 0.9), 0.05, 0.06, G(x, y, 0.25), segs=6)
    s.cyl(dark, 0.12, 4.6, G(0, 0, 0.25), segs=12)
    for k in range(3):  # cable bundles up the pole
        a = k * 2.1
        s.tube(cable, [G(math.cos(a) * 0.15 + 0.02 * math.sin(t * 9), math.sin(a) * 0.15, 0.3 + t * 4.3) for t in np.linspace(0, 1, 12)], 0.025)
    # the ladder up the back of the pole
    for side in (-0.12, 0.12):
        s.cyl(dark, 0.015, 3.6, G(-0.22 + side * 0.3, -0.22 - side * 0.3, 0.9), segs=5)
    for z in np.arange(1.0, 4.5, 0.3):
        s.tube(dark, [G(-0.25, -0.18, z), G(-0.18, -0.25, z)], 0.012, segs=4)
    # the panel frame, facing the camera's diagonal; the game draws the hologram inside it
    frame = s.mat('frameDark', 0x26272b, 'metal', 0.4, 0.6)
    half_w, z0, z1 = 1.3, 3.0, 4.6
    u = Vector((1, 1, 0)).normalized()  # along the panel (game +x −y … Blender +x +y)
    u = Vector((u.x, u.y, 0))
    c = Vector(G(0.1, 0.1, 0))
    for zz in (z0, z1):
        s.tube(frame, [c - u * half_w + Vector((0, 0, zz)), c + u * half_w + Vector((0, 0, zz))], 0.04)
    for sgn in (-1, 1):
        s.tube(frame, [c + u * half_w * sgn + Vector((0, 0, z0)), c + u * half_w * sgn + Vector((0, 0, z1))], 0.04)
    for sgn in (-1, 1):
        s.box(s.mat('neonCyan', NEON['cyan'], emit=5), (0.04, 0.04, 0.04), tuple(c + u * half_w * sgn + Vector((0, 0, z1 + 0.05))), bevel=0)
    s.box(dark, (0.3, 0.3, 0.4), G(0.1, 0.1, z0 - 0.4), bevel=0.02)  # projector housing


def speeder(s, rng, variant):
    body = s.mat(f'speeder{variant}', [0x2a2c33, 0x3a2a2a][variant], 'panel', 0.35, 0.6)
    patch = s.mat('patch', [0x6a6050, 0x4a5a60][variant], 'metal', 0.5, 0.4)
    dark = s.mat('darkMetal', 0x1e1f22, 'metal', 0.4, 0.6)
    h = 0.45  # hovering
    # the body: a long tapered hull along game +x, nose forward
    bm = bmesh.new()
    prof = [(-1.1, 0.24, 0.22), (-0.6, 0.3, 0.3), (0.0, 0.28, 0.28), (0.6, 0.2, 0.2), (1.1, 0.08, 0.1)]
    rings = []
    for x, wy, hz in prof:
        rings.append([bm.verts.new(G(x, math.cos(a) * wy, h + 0.25 + math.sin(a) * hz)) for a in np.linspace(0, TAU, 13)[:-1]])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(12):
            k2 = (k + 1) % 12
            bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    s.obj(bm, body, smooth=True, subsurf=1)
    # patched panels, seat, handlebars, steering vanes
    s.box(patch, (0.35, 0.02, 0.18), G(-0.2, 0.3, h + 0.28), rot=0.05, bevel=0.005)
    s.box(patch, (0.25, 0.02, 0.12), G(0.4, 0.22, h + 0.2), rot=-0.1, bevel=0.005)
    s.box(s.mat('seat', 0x3a2a20, None, 0.8), (0.7, 0.32, 0.12), G(-0.45, 0, h + 0.5), bevel=0.04)
    s.tube(dark, [G(0.15, -0.35, h + 0.75), G(0.25, 0, h + 0.62), G(0.15, 0.35, h + 0.75)], 0.025)
    for sgn in (-1, 1):
        s.box(dark, (0.5, 0.04, 0.3), G(0.95, sgn * 0.18, h + 0.12), rot=sgn * 0.15, bevel=0.01)
    # the headlight and the exhausts
    s.sphere(s.mat('neonHead', 0xfff2c8, emit=10), 0.07, G(1.12, 0, h + 0.3))
    for sgn in (-1, 1):
        s.cyl(dark, 0.08, 0.35, G(-1.3, sgn * 0.15, h + 0.22), axis='X', segs=12)
        s.cyl(s.mat('neonExhaust', 0xff7a3a, emit=4), 0.055, 0.02, G(-1.31, sgn * 0.15, h + 0.22), axis='X', segs=12)
    # the blue repulsor glow under it
    s.ring(s.mat('neonRepulsor', 0x2a78e0, emit=3), G(0, 0, 0.05), 0.3, 0.012, (0, 0, 1), segs=24)
    s.box(dark, (0.6, 0.3, 0.1), G(0, 0, h - 0.02), bevel=0.02)


def crates(s, rng):
    m = [s.mat('crate', 0x6a5a44, 'crate', 0.7), s.mat('crate2', 0x4f5a4a, 'crate', 0.7), s.mat('crate3', 0x5a5f68, 'crate', 0.6)]
    s.box(m[0], (0.9, 0.9, 0.8), G(0, 0), rot=0.08, bevel=0.03)
    s.box(m[1], (0.8, 0.8, 0.7), G(0.05, -0.05, 0.8), rot=-0.2, bevel=0.03)
    s.box(m[2], (0.7, 0.6, 0.5), G(0.9, 0.3, 0), rot=0.5, bevel=0.03)
    s.box(m[0], (0.5, 0.5, 0.4), G(-0.5, 0.75, 0), rot=1.0, bevel=0.03)


def barrels(s, rng):
    cols = [0x8a3a2a, 0x2c4a66, 0x6a6a3a]
    for k, (x, y, tip) in enumerate(((0, 0, 0), (0.62, 0.15, 0), (0.2, 0.62, 0), (-0.7, 0.4, 1))):
        m = s.mat(f'barrel{k % 3}', cols[k % 3], 'metal', 0.55, 0.4)
        if tip:
            s.cyl(m, 0.28, 0.85, G(x - 0.4, y, 0.28), axis='X', segs=16)
        else:
            s.cyl(m, 0.28, 0.85, G(x, y), segs=16)
            s.cyl(s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5), 0.29, 0.05, G(x, y, 0.3), segs=16)
            s.cyl(s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5), 0.29, 0.05, G(x, y, 0.62), segs=16)


def vent_grate(s, rng):
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.6)
    s.box(s.mat('rust', 0x6a4a34, 'metal', 0.8, 0.3), (1.3, 1.3, 0.06), G(0, 0), bevel=0.02)
    s.box(s.mat('hole', 0x050506, None, 0.9), (1.0, 1.0, 0.07), G(0, 0, 0.0), bevel=0)
    for k in range(7):
        s.box(dark, (1.04, 0.05, 0.08), G(0, -0.45 + k * 0.15, 0.0), bevel=0.005)
    s.box(s.mat('neonVent', 0xff6a30, emit=1.2), (0.9, 0.9, 0.01), G(0, 0, 0.01), bevel=0)  # the warm glow down the shaft


def droid_parts(s, rng):
    metal = [s.mat('droidTan', 0xb09a70, 'metal', 0.5, 0.4), s.mat('droidGrey', 0x8a8a88, 'metal', 0.4, 0.6), s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5)]
    for k in range(14):
        m = metal[rng.integers(0, 3)]
        p = G(rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0)
        if rng.random() < 0.4:
            s.cyl(m, rng.uniform(0.04, 0.08), rng.uniform(0.4, 0.8), (p[0], p[1], 0.06), axis=['X', 'Y'][rng.integers(0, 2)], segs=8)
        elif rng.random() < 0.5:
            s.sphere(m, rng.uniform(0.12, 0.2), (p[0], p[1], 0.12), (1, 1, 0.8), segs=10)
        else:
            s.box(m, (rng.uniform(0.15, 0.4),) * 2 + (rng.uniform(0.1, 0.3),), p, rot=rng.uniform(0, 3), bevel=0.02)
    s.sphere(s.mat('neonRed', NEON['red'], emit=3), 0.04, G(0.1, 0.2, 0.3))  # an eye still lit


def trash_bin(s, rng):
    m = s.mat('bin', 0x3f5a4a, 'panel', 0.6, 0.4)
    s.cyl(m, 0.38, 0.95, G(0, 0), segs=16, r2=0.42)
    s.cyl(s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5), 0.45, 0.08, G(0, 0, 0.95), segs=16)
    s.sphere(s.mat('trash', 0x4a4438, None, 0.9), 0.3, G(0.05, 0.05, 1.0), (1.2, 1.0, 0.6), segs=10)
    for k in range(4):
        s.box(s.mat('trash2', 0x6a6050, None, 0.9), (0.18, 0.12, 0.05), G(rng.uniform(-0.5, 0.6), rng.uniform(0.3, 0.6), 0), rot=rng.uniform(0, 3), bevel=0.01)


def junction_box(s, rng):
    m = s.mat('box', 0x56595c, 'panel', 0.55, 0.5)
    s.box(m, (0.5, 0.7, 1.3), G(0, 0), bevel=0.03)
    s.box(s.mat('darkMetal', 0x2e2f33, 'metal', 0.5, 0.5), (0.54, 0.74, 0.08), G(0, 0, 1.3), bevel=0.02)
    for k, c in enumerate((NEON['green'], NEON['amber'], NEON['red'])):
        s.sphere(s.mat(f'neonLed{k}', c, emit=8), 0.035, G(0.26, -0.2 + k * 0.12, 1.1))
    cable = s.mat('cable', 0x121214, None, 0.6)
    for k in range(4):
        s.tube(cable, [G(-0.1 + k * 0.06, 0.2, 1.38), G(-0.1 + k * 0.06, 0.25, 1.9 + k * 0.1), G(-0.4, 0.6 + k * 0.1, 2.2)], 0.025)
    s.plate(s.mat('hazard', 0xffffff, 'hazard', 0.6), [G(0.26, -0.3, 0.5), G(0.26, 0.3, 0.5), G(0.26, 0.3, 0.2), G(0.26, -0.3, 0.2)], 0.01)


# ----------------------------------------------------------------------------
# Street food: after real carts, kiosks and container shops — each a different
# silhouette, all serving towards game +y (the render can turn them 90°)


def stools(s, rng, pts, color=None):
    """Plastic stools: a round seat on four splayed legs."""
    cols = [0xc23a2e, 0x2f7fb8, 0xd8b23a, 0x3a9a5a]
    for (x, y) in pts:
        m = s.mat(f'stool{color or 0}', color or cols[rng.integers(0, 4)], None, 0.5)
        s.cyl(m, 0.16, 0.05, G(x, y, 0.42), segs=12)
        for k in range(4):
            a = k * math.pi / 2 + 0.785
            s.tube(m, [G(x + math.cos(a) * 0.08, y + math.sin(a) * 0.08, 0.42), G(x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, 0.0)], 0.018, segs=4)


def string_lights(s, a, b, n, sag=0.12):
    a, b = Vector(a), Vector(b)
    s.cable(s.mat('cable', 0x121214, None, 0.6), a, b, sag, 0.008)
    for k in range(n):
        t = (k + 0.5) / n
        p = a.lerp(b, t) - Vector((0, 0, sag * 4 * t * (1 - t) + 0.04))
        s.sphere(s.mat('lit_bulb', [0xffd88a, 0xffb35a, 0xfff0c0][k % 3], emit=5), 0.035, tuple(p), segs=8)


def menu_board(s, x, y, z, w, h, face='y', color=0xffe6b0):
    """A lit glyph menu board (no readable letters)."""
    m = s.mat('lit_menu', color, 'board', 0.5)
    m2 = s.mat('menuFrame', 0x1c1c20, 'metal', 0.4, 0.5)
    if face == 'y':
        s.box(m2, (w + 0.06, 0.04, h + 0.06), G(x, y - 0.01, z - 0.03), bevel=0.005)
        s.plate(s.mat('lit_menuPanel', color, emit=1.6), [G(x - w / 2, y + 0.03, z + h), G(x + w / 2, y + 0.03, z + h), G(x + w / 2, y + 0.03, z), G(x - w / 2, y + 0.03, z)], 0.01)
        s.plate(m, [G(x - w / 2 + 0.02, y + 0.045, z + h - 0.02), G(x + w / 2 - 0.02, y + 0.045, z + h - 0.02), G(x + w / 2 - 0.02, y + 0.045, z + 0.02), G(x - w / 2 + 0.02, y + 0.045, z + 0.02)], 0.005)


def cart_hotdog(s, rng):
    steel = s.mat('steel', 0xb9bdc2, 'metal', 0.28, 0.85)
    red = s.mat('cartRed', 0xb3312a, 'panel', 0.45, 0.2)
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    # the body: steel box on a red skirt, two big wheels at the back, legs at the front
    s.box(red, (1.5, 0.72, 0.55), G(0, 0, 0.22), bevel=0.02)
    s.box(steel, (1.56, 0.78, 0.22), G(0, 0, 0.77), bevel=0.02)
    for sy in (-0.42, 0.42):
        s.cyl(s.mat('tyre', 0x161616, None, 0.8), 0.28, 0.07, G(-0.5, sy, 0.28 - 0.0), axis='Y', segs=20)
        s.cyl(steel, 0.12, 0.08, G(-0.5, sy, 0.28), axis='Y', segs=12)
    for sy in (-0.3, 0.3):
        s.cyl(dark, 0.025, 0.24, G(0.65, sy, 0.0), segs=6)
    s.tube(steel, [G(-0.78, -0.3, 0.95), G(-1.05, -0.3, 1.0), G(-1.05, 0.3, 1.0), G(-0.78, 0.3, 0.95)], 0.025)  # push handle
    # the top: three steam pans with lids, condiment bottles, a cutting board
    for k, x in enumerate((-0.45, 0.0, 0.45)):
        s.box(s.mat('pan', 0x202022, None, 0.3), (0.36, 0.5, 0.02), G(x, 0.0, 0.99), bevel=0)
        if k != 1:
            s.box(steel, (0.36, 0.5, 0.04), G(x, 0.0, 1.0), tilt=((0, 1, 0), 0.2 if k else -0.2), bevel=0.01)
    s.box(s.mat('sausages', 0xa0522d, None, 0.5), (0.3, 0.42, 0.03), G(0.0, 0.0, 1.0), bevel=0.01)
    for k, c in enumerate((0xd02020, 0xe8c020, 0x2a8a3a)):
        s.cyl(s.mat(f'bottle{k}', c, None, 0.3), 0.035, 0.18, G(0.62, -0.25 + k * 0.1, 0.99), segs=8)
    # the gas canister below, a napkin box, a small sign
    s.cyl(s.mat('gas', 0x3a6a9a, 'metal', 0.5, 0.3), 0.12, 0.42, G(0.3, -0.48, 0.0), segs=12)
    menu_board(s, 0.0, 0.37, 0.35, 0.8, 0.32)
    # the round umbrella: a pole and a canopy of alternating panels
    s.cyl(dark, 0.025, 1.4, G(0.05, 0.0, 1.0), segs=6)
    cols = [s.mat('umbA', [0xc8322a, 0x2e6fb0, 0xd8a32e][rng.integers(0, 3)], 'canvas', 0.85), s.mat('umbB', 0xe8e2d0, 'canvas', 0.85)]
    c = Vector(G(0.05, 0.0, 2.38))
    for k in range(12):
        a0, a1 = k * TAU / 12, (k + 1) * TAU / 12
        bm = bmesh.new()
        v = [bm.verts.new(c + Vector((0, 0, 0.32))), bm.verts.new(c + Vector((math.cos(a0) * 1.05, math.sin(a0) * 1.05, -0.02))), bm.verts.new(c + Vector((math.cos(a1) * 1.05, math.sin(a1) * 1.05, -0.02)))]
        bm.faces.new(v)
        s.obj(bm, cols[k % 2])
    # a hanging lamp under the umbrella
    s.sphere(s.mat('lit_lamp', 0xffd090, emit=5), 0.06, G(0.05, 0.25, 2.2), segs=10)


def corrugated(s, mat, x0, x1, y, z0, z1, pitch=0.12, depth=0.03, face='y'):
    """A corrugated steel wall: ribs along its height."""
    n = int((x1 - x0) / pitch)
    for k in range(n):
        x = x0 + (k + 0.5) * pitch
        if face == 'y':
            s.box(mat, (pitch * 0.55, depth, z1 - z0), G(x, y + depth / 2, z0), bevel=0.004)
        else:
            s.box(mat, (depth, pitch * 0.55, z1 - z0), G(y + depth / 2, x, z0), bevel=0.004)


def container_body(s, rng, L, W, H, color, z0=0.0, opening=None):
    """A shipping container (half scale): frame, corrugated walls, end doors with
    locking bars; `opening` (x0, x1, za, zb) cuts the +y wall for a counter."""
    paint = s.mat(f'cont{color:x}', color, 'panel', 0.6, 0.35)
    frame = s.mat(f'contFrame{color:x}', [max(0, (color >> 16) - 30), max(0, ((color >> 8) & 255) - 30), max(0, (color & 255) - 30)][0] * 65536 + [max(0, ((color >> 8) & 255) - 30)][0] * 256 + max(0, (color & 255) - 30), 'metal', 0.55, 0.4)
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    # the shell (back, ends, roof, floor), slightly inset so the ribs stand proud
    s.box(paint, (L - 0.08, W - 0.08, H - 0.08), G(0, 0, z0 + 0.04), bevel=0.01, uvscale=0.8) if not opening else None
    if opening:
        ox0, ox1, za, zb = opening
        s.box(paint, (L - 0.08, W - 0.12, H - 0.08), G(0, -0.02, z0 + 0.04), bevel=0.01, uvscale=0.8)  # behind the opening
        s.box(s.mat('lit_inside', 0xffc27a, emit=1.4), (ox1 - ox0, 0.05, zb - za), G((ox0 + ox1) / 2, W / 2 - 0.08, z0 + za), bevel=0)
        # the +y wall in pieces round the opening
        corrugated(s, paint, -L / 2, ox0, W / 2 - 0.06, z0 + 0.04, z0 + H - 0.04)
        corrugated(s, paint, ox1, L / 2, W / 2 - 0.06, z0 + 0.04, z0 + H - 0.04)
        corrugated(s, paint, ox0, ox1, W / 2 - 0.06, z0 + 0.04, z0 + za)
        corrugated(s, paint, ox0, ox1, W / 2 - 0.06, z0 + zb, z0 + H - 0.04)
    else:
        corrugated(s, paint, -L / 2, L / 2, W / 2 - 0.06, z0 + 0.04, z0 + H - 0.04)
    corrugated(s, paint, -W / 2, W / 2, L / 2 - 0.06, z0 + 0.04, z0 + H - 0.04, face='x')
    # the corner posts and rails
    for sx in (-1, 1):
        for sy in (-1, 1):
            s.box(frame, (0.08, 0.08, H), G(sx * (L / 2 - 0.04), sy * (W / 2 - 0.04), z0), bevel=0.005)
    for z in (z0, z0 + H - 0.07):
        s.box(frame, (L, 0.07, 0.07), G(0, W / 2 - 0.035, z), bevel=0.005)
        s.box(frame, (0.07, W, 0.07), G(L / 2 - 0.035, 0, z), bevel=0.005)
    # the end doors' locking bars and the stencilled glyph markings
    for k in range(4):
        y = -W / 2 + (k + 0.5) * W / 4
        s.cyl(dark, 0.018, H - 0.2, G(L / 2 + 0.01, y, z0 + 0.1), segs=6)
    s.plate(s.mat('stencil', 0xe8e2d0, 'board', 0.7), [G(-L / 2 + 0.2, W / 2 + 0.005, z0 + H - 0.15), G(-L / 2 + 0.75, W / 2 + 0.005, z0 + H - 0.15), G(-L / 2 + 0.75, W / 2 + 0.005, z0 + H - 0.4), G(-L / 2 + 0.2, W / 2 + 0.005, z0 + H - 0.4)], 0.003)
    # rust running down from the roof
    return paint


def container_kiosk(s, rng):
    color = [0xa4522a, 0x2f6e6a][rng.integers(0, 2)]
    L, W, H = 3.0, 1.25, 1.35
    paint = container_body(s, rng, L, W, H, color, opening=(-1.1, 0.9, 0.62, 1.15))
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    # the counter shelf and the flap propped up as an awning on two struts
    s.box(s.mat('counterTop', 0x8a7a64, 'crate', 0.6), (2.1, 0.32, 0.05), G(-0.1, W / 2 + 0.12, 0.6), bevel=0.01)
    flap = [G(-1.15, W / 2, 1.2), G(0.95, W / 2, 1.2), G(0.95, W / 2 + 0.7, 1.55), G(-1.15, W / 2 + 0.7, 1.55)]
    s.plate(paint, flap, 0.04, 1.0)
    for x in (-1.0, 0.8):
        s.tube(dark, [G(x, W / 2 + 0.02, 0.85), G(x, W / 2 + 0.66, 1.52)], 0.018, segs=5)
    string_lights(s, G(-1.15, W / 2 + 0.7, 1.5), G(0.95, W / 2 + 0.7, 1.5), 9, 0.08)
    # inside: shelves with jars, a pot steaming, a menu board on the end
    for k in range(6):
        s.cyl(s.mat(f'jar{k % 3}', [0xd8a040, 0x9a3a2a, 0x6a8a3a][k % 3], None, 0.3), 0.05, 0.14, G(-0.9 + k * 0.32, W / 2 - 0.22, 0.95), segs=8)
    s.cyl(s.mat('steel', 0xb9bdc2, 'metal', 0.28, 0.85), 0.16, 0.22, G(0.5, W / 2 - 0.25, 0.65), segs=14)
    menu_board(s, 1.25, W / 2 - 0.04, 0.55, 0.42, 0.5)
    # the roof: an AC unit, a crate, a cable down
    s.box(s.mat('acUnit', 0x8a8a84, 'metal', 0.5, 0.3), (0.6, 0.45, 0.35), G(-0.8, -0.2, H), bevel=0.02)
    s.box(s.mat('crate', 0x6a5a44, 'crate', 0.7), (0.45, 0.45, 0.35), G(0.7, -0.1, H), rot=0.3, bevel=0.02)
    stools(s, rng, [(-0.8, W / 2 + 0.7), (-0.1, W / 2 + 0.75), (0.6, W / 2 + 0.7)])


def food_truck(s, rng):
    paint = s.mat('truck', [0xd9c27a, 0x6aa0a8][rng.integers(0, 2)], 'panel', 0.45, 0.3)
    stripe = s.mat('stripe', 0xb3312a, None, 0.4)
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    glass = s.mat('glassDark', 0x141a20, None, 0.12)
    z = 0.42  # hovering on its pads
    # the box (kitchen) and the cab at +x with a slanted windscreen
    s.box(paint, (2.1, 1.3, 1.6), G(-0.45, 0, z), bevel=0.06, uvscale=0.8)
    s.box(stripe, (2.12, 1.32, 0.14), G(-0.45, 0, z + 0.25), bevel=0.01)
    bm = bmesh.new()
    pts = [(0.6, z), (1.5, z), (1.5, z + 0.75), (1.15, z + 1.25), (0.6, z + 1.25)]
    for sy in (-0.62, 0.62):
        pass
    prof = [bm.verts.new(G(x, -0.62, zz)) for x, zz in pts] + [bm.verts.new(G(x, 0.62, zz)) for x, zz in pts]
    n = len(pts)
    bm.faces.new(prof[:n])
    bm.faces.new(list(reversed(prof[n:])))
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((prof[k], prof[k2], prof[n + k2], prof[n + k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    s.obj(bm, paint, bevel=0.03)
    s.plate(glass, [G(1.17, -0.55, z + 1.2), G(1.17, 0.55, z + 1.2), G(1.48, 0.55, z + 0.78), G(1.48, -0.55, z + 0.78)], 0.01)
    s.plate(glass, [G(0.7, 0.625, z + 1.15), G(1.1, 0.625, z + 1.15), G(1.1, 0.625, z + 0.8), G(0.7, 0.625, z + 0.8)], 0.01)
    s.sphere(s.mat('neonHead', 0xfff2c8, emit=8), 0.06, G(1.51, 0.4, z + 0.45))
    s.sphere(s.mat('neonHead', 0xfff2c8, emit=8), 0.06, G(1.51, -0.4, z + 0.45))
    # the serving window with its awning and a lit kitchen behind
    s.box(s.mat('lit_kitchen', 0xffd29a, emit=1.6), (1.3, 0.04, 0.55), G(-0.5, 0.66, z + 0.8), bevel=0)
    s.box(s.mat('steel', 0xb9bdc2, 'metal', 0.28, 0.85), (1.4, 0.25, 0.04), G(-0.5, 0.75, z + 0.78), bevel=0.01)
    s.plate(s.mat('awning', 0xb3312a, 'canvas', 0.85), [G(-1.25, 0.66, z + 1.45), G(0.25, 0.66, z + 1.45), G(0.25, 1.35, z + 1.2), G(-1.25, 1.35, z + 1.2)], 0.02, 1.2)
    menu_board(s, -1.2, 0.66, z + 0.25, 0.4, 0.45, color=0xbfe8ff)
    # the roof sign: a neon glyph outline
    sg = s.mat('neonMagenta', 0xff3fd0, emit=8)
    s.box(s.mat('signBack', 0x16161a, None, 0.4), (1.2, 0.05, 0.4), G(-0.45, 0.1, z + 1.62), bevel=0.01)
    s.tube(sg, [G(-0.95, 0.14, z + 1.7), G(-0.75, 0.14, z + 1.92), G(-0.55, 0.14, z + 1.7), G(-0.35, 0.14, z + 1.92), G(-0.15, 0.14, z + 1.7), G(0.05, 0.14, z + 1.92)], 0.018)
    # hover pads, their glow and the exhaust
    for x in (-1.1, 0.9):
        s.cyl(dark, 0.32, 0.12, G(x, 0, z - 0.14), segs=16)
        s.ring(s.mat('neonRepulsor', 0x2a78e0, emit=3), G(x, 0, 0.06), 0.3, 0.014, (0, 0, 1), segs=20)
    s.cyl(dark, 0.05, 0.3, G(-1.55, -0.45, z + 0.1), axis='X', segs=8)
    stools(s, rng, [(-0.9, 1.6), (-0.2, 1.65)])


def yatai(s, rng):
    wood = s.mat('wood', 0x6b4a2e, 'crate', 0.75)
    woodDark = s.mat('woodDark', 0x3e2a1a, 'crate', 0.8)
    # the cart: a wooden counter box on two wheels
    s.box(wood, (1.8, 0.8, 0.85), G(0, 0, 0.12), bevel=0.02, uvscale=1.5)
    s.box(woodDark, (1.95, 0.95, 0.06), G(0, 0.04, 0.97), bevel=0.01)
    for sx in (-0.7, 0.7):
        s.cyl(s.mat('tyre', 0x161616, None, 0.8), 0.22, 0.06, G(sx, -0.45, 0.22), axis='Y', segs=16)
    # posts and the gabled roof
    for x in (-0.85, 0.85):
        for y in (-0.32, 0.32):
            s.box(woodDark, (0.07, 0.07, 1.35), G(x, y, 0.97), bevel=0.005)
    roof = s.mat('roof', 0x4a3a2e, 'panel', 0.7, 0.2)
    s.plate(roof, [G(-1.05, 0.0, 2.55), G(1.05, 0.0, 2.55), G(1.05, 0.62, 2.25), G(-1.05, 0.62, 2.25)], 0.03)
    s.plate(roof, [G(1.05, 0.0, 2.55), G(-1.05, 0.0, 2.55), G(-1.05, -0.62, 2.25), G(1.05, -0.62, 2.25)], 0.03)
    s.box(woodDark, (2.15, 0.08, 0.08), G(0, 0, 2.5), bevel=0.005)
    # noren: cloth panels hanging under the front eave, a glyph on each
    noren = s.mat('noren', [0x2a3a6a, 0x8a2a24][rng.integers(0, 2)], 'canvas', 0.9)
    for k in range(5):
        x = -0.8 + k * 0.4
        s.plate(noren, [G(x - 0.18, 0.6, 2.25), G(x + 0.18, 0.6, 2.25), G(x + 0.18, 0.6, 1.85), G(x - 0.18, 0.6, 1.85)], 0.01)
        s.box(s.mat('glyphWhite', 0xe8e2d0, None, 0.8), (0.08, 0.012, 0.16), G(x, 0.615, 1.95), rot=0.3 * (k % 2), bevel=0)
    # red paper lanterns at the corners
    for x in (-0.95, 0.95):
        s.cable(s.mat('cable', 0x121214, None, 0.6), G(x, 0.55, 2.27), G(x, 0.551, 2.05), 0.0, 0.006)
        s.sphere(s.mat('lit_lantern_red', 0xff4a2a, emit=4.5), 0.13, G(x, 0.55, 1.92), (1, 1, 1.35), segs=12)
    # the pot steaming, bowls, a ladle; a bench and stools
    s.cyl(s.mat('steel', 0xb9bdc2, 'metal', 0.28, 0.85), 0.22, 0.28, G(-0.45, 0.05, 1.0), segs=16)
    for k in range(4):
        s.cyl(s.mat('bowl', 0xe8e2d0, None, 0.3), 0.08, 0.04, G(0.3 + (k % 2) * 0.18, 0.1, 1.0 + (k // 2) * 0.04), segs=10, r2=0.05)
    s.box(wood, (1.6, 0.3, 0.08), G(0, 1.0, 0.42), bevel=0.01)
    for x in (-0.65, 0.65):
        s.box(woodDark, (0.08, 0.26, 0.42), G(x, 1.0, 0.0), bevel=0.005)
    stools(s, rng, [(-0.9, 1.6), (0.9, 1.55)])


def grill_trike(s, rng):
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    frame = s.mat('trikeFrame', [0x3a7a4a, 0x2a5a8a][rng.integers(0, 2)], 'metal', 0.45, 0.4)
    tyre = s.mat('tyre', 0x161616, None, 0.8)
    # the rider's half: one wheel, a seat, handlebars at +x
    s.cyl(tyre, 0.26, 0.06, G(0.9, 0, 0.26 - 0.0), axis='Y', segs=18)
    s.tube(frame, [G(0.9, 0, 0.26), G(0.75, 0, 0.85), G(0.45, 0, 0.6), G(0.15, 0, 0.55)], 0.03)
    s.box(s.mat('seat', 0x3a2a20, None, 0.8), (0.25, 0.16, 0.06), G(0.48, 0, 0.82), bevel=0.02)
    s.tube(frame, [G(0.8, -0.22, 1.0), G(0.75, 0, 0.95), G(0.8, 0.22, 1.0)], 0.02)
    # the cart half: two wheels under the grill box
    for sy in (-0.42, 0.42):
        s.cyl(tyre, 0.24, 0.06, G(-0.45, sy, 0.24), axis='Y', segs=18)
    s.box(frame, (1.0, 0.8, 0.5), G(-0.45, 0, 0.32), bevel=0.02)
    s.box(dark, (0.9, 0.6, 0.18), G(-0.45, 0, 0.82), bevel=0.01)
    s.box(s.mat('neonCoals', 0xff6a1e, emit=4), (0.8, 0.5, 0.02), G(-0.45, 0, 0.99), bevel=0)  # glowing coals
    for k in range(9):  # skewers across the grill
        s.cyl(s.mat('skewer', 0x8a4a2a, None, 0.6), 0.02, 0.6, G(-0.82 + k * 0.09, -0.3, 1.03), axis='Y', segs=5)
    # the chimney hood and a small tarp on poles
    s.cyl(dark, 0.06, 0.9, G(-0.95, -0.28, 1.0), segs=8)
    s.cyl(dark, 0.12, 0.08, G(-0.95, -0.28, 1.9), segs=8)
    for x in (-0.9, 0.0):
        s.cyl(dark, 0.02, 1.2, G(x, 0.38, 0.82), segs=5)
    s.plate(s.mat('tarp', [0xd8a32e, 0x2e6fb0][rng.integers(0, 2)], 'canvas', 0.85), [G(-1.05, 0.38, 2.02), G(0.15, 0.38, 2.02), G(0.15, -0.3, 2.12), G(-1.05, -0.3, 2.12)], 0.02)
    # a cooler box and a stack of plates
    s.box(s.mat('cooler', 0x3a8ab0, None, 0.4), (0.5, 0.35, 0.35), G(-1.25, 0.5, 0), bevel=0.04)
    s.cyl(s.mat('bowl', 0xe8e2d0, None, 0.3), 0.1, 0.08, G(0.0, 0.25, 0.82), segs=10)


def stack_shop(s, rng):
    # two containers stacked crosswise, a shop in the lower one
    lower = [0x2f6e6a, 0x8a3a2a][rng.integers(0, 2)]
    upper = [0xa4822a, 0x4a5a6a][rng.integers(0, 2)]
    paint = container_body(s, rng, 3.2, 1.6, 1.5, lower, opening=(-1.4, 1.0, 0.0, 1.25))
    # the roll-up shutter, half open, over a lit shop full of shelves
    shutter = s.mat('shutter', 0x6a6a66, 'panel', 0.6, 0.6)
    for k in range(6):
        s.box(shutter, (2.4, 0.03, 0.04), G(-0.2, 0.8, 1.05 + k * 0.035), bevel=0)
    for k in range(3):
        s.box(s.mat('shelf', 0x5a4a3a, 'crate', 0.7), (2.2, 0.3, 0.03), G(-0.2, 0.55, 0.35 + k * 0.3), bevel=0)
        for j in range(8):
            s.box(s.mat(f'goods{(j + k) % 4}', [0xc23a2e, 0x2f7fb8, 0xd8b23a, 0x6a9a3a][(j + k) % 4], None, 0.5), (0.14, 0.12, 0.16), G(-1.2 + j * 0.28, 0.55, 0.38 + k * 0.3), rot=rng.uniform(-0.2, 0.2), bevel=0.01)
    # the upper container across it, a window and laundry
    container_body(s, rng, 2.6, 1.3, 1.25, upper, z0=1.5)
    s.box(s.mat('lit_win_up', 0x9fe8ff, emit=1.8), (0.6, 0.05, 0.4), G(0.3, 0.66, 1.95), bevel=0)
    s.cable(s.mat('cable', 0x121214, None, 0.6), G(-1.2, 0.7, 2.6), G(1.0, 0.75, 2.6), 0.2, 0.01)
    for k in range(3):
        s.box(s.mat(f'cloth{k}', [0xa04040, 0xd0d0c8, 0x3a6a8a][k], 'canvas', 0.9), (0.3, 0.02, 0.4), G(-0.7 + k * 0.6, 0.72, 2.05 - 0.15 * (k == 1)), bevel=0)
    # a ladder up the end, a vertical neon sign at the corner, an awning tarp
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    for y in (-0.3, 0.0):
        s.cyl(dark, 0.02, 2.7, G(1.65, y, 0), segs=5)
    for z in np.arange(0.2, 2.7, 0.28):
        s.tube(dark, [G(1.65, -0.3, z), G(1.65, 0.0, z)], 0.012, segs=4)
    s.box(s.mat('signBack', 0x16161a, None, 0.4), (0.12, 0.35, 1.3), G(1.55, 0.85, 1.4), bevel=0.01)
    nm = s.mat('neonCyan', 0x4fe6ff, emit=8)
    for k in range(4):
        s.box(nm, (0.03, 0.22, 0.05), G(1.62, 0.85, 1.55 + k * 0.28), rot=0.2 * (k % 2), bevel=0)
    s.plate(s.mat('tarp2', 0x2e6fb0, 'canvas', 0.85), [G(-1.5, 0.8, 1.45), G(1.1, 0.8, 1.45), G(1.1, 1.5, 1.2), G(-1.5, 1.5, 1.2)], 0.02, 1.2)
    s.box(s.mat('crate', 0x6a5a44, 'crate', 0.7), (0.5, 0.5, 0.45), G(1.2, 1.3, 0), rot=0.2, bevel=0.02)
    stools(s, rng, [(-1.0, 1.6), (0.2, 1.7)])


def round_kiosk(s, rng):
    body = s.mat('kiosk', [0xd9c27a, 0x9a3a4a, 0x3a6a8a][rng.integers(0, 3)], 'panel', 0.5, 0.3)
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    s.cyl(body, 0.85, 0.75, G(0, 0, 0), segs=28)
    s.cyl(s.mat('counterTop', 0x8a7a64, 'crate', 0.6), 0.95, 0.05, G(0, 0, 0.75), segs=28)
    s.cyl(s.mat('lit_kioskIn', 0xffd29a, emit=1.5), 0.72, 0.6, G(0, 0, 0.8), segs=28)  # the lit inside behind the glass ring
    for k in range(8):  # window mullions
        a = k * TAU / 8
        s.box(dark, (0.04, 0.04, 0.6), G(math.cos(a) * 0.76, math.sin(a) * 0.76, 0.8), bevel=0)
    s.cyl(body, 0.85, 0.35, G(0, 0, 1.4), segs=28)
    s.ring(s.mat('neonGreen', 0x6dff8a, emit=7), G(0, 0, 1.6), 0.865, 0.02, (0, 0, 1), segs=40)
    # the domed roof and a sign on top
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=10, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context='VERTS')
    bmesh.ops.transform(bm, matrix=Matrix.LocRotScale(Vector(G(0, 0, 1.75)), None, Vector((0.95, 0.95, 0.4))), verts=bm.verts)
    s.obj(bm, s.mat('dome', 0x5a5f68, 'panel', 0.4, 0.6), smooth=True)
    s.cyl(dark, 0.03, 0.5, G(0, 0, 2.1), segs=6)
    s.box(s.mat('signBack', 0x16161a, None, 0.4), (0.05, 0.7, 0.3), G(0, 0, 2.5), rot=math.pi / 4, bevel=0.01)
    s.box(s.mat('neonPink', 0xff4fa8, emit=8), (0.03, 0.55, 0.04), G(0.04, 0.04, 2.62), rot=math.pi / 4, bevel=0)
    # cups on the counter, a drinks cooler, stools
    for k in range(5):
        a = 0.6 + k * 0.35
        s.cyl(s.mat(f'cup{k % 2}', [0xe8e2d0, 0xff8a2a][k % 2], None, 0.4), 0.04, 0.1, G(math.cos(a) * 0.86, math.sin(a) * 0.86, 0.8), segs=8)
    stools(s, rng, [(0.3, 1.25), (1.1, 0.7)])


def table_set(s, rng):
    tbl = s.mat('table', [0xe8e2d0, 0x3a8ab0][rng.integers(0, 2)], None, 0.45)
    dark = s.mat('darkMetal', 0x2a2b2e, 'metal', 0.5, 0.5)
    for (x, y) in ((-0.6, -0.3), (0.7, 0.4)):
        s.box(tbl, (0.7, 0.7, 0.04), G(x, y, 0.7), bevel=0.01)
        for dx in (-0.3, 0.3):
            for dy in (-0.3, 0.3):
                s.cyl(dark, 0.018, 0.7, G(x + dx, y + dy, 0), segs=5)
        s.cyl(s.mat('bowl', 0xe8e2d0, None, 0.3), 0.08, 0.05, G(x + 0.1, y, 0.74), segs=10, r2=0.05)
    stools(s, rng, [(-1.15, -0.3), (-0.6, 0.3), (-0.05, -0.55), (0.15, 0.4), (0.7, 1.0), (1.25, 0.4)])
    # an umbrella over one table
    s.cyl(dark, 0.02, 1.55, G(0.7, 0.4, 0.74), segs=6)
    cols = [s.mat('umbA', 0x2e6fb0, 'canvas', 0.85), s.mat('umbB', 0xe8e2d0, 'canvas', 0.85)]
    c = Vector(G(0.7, 0.4, 2.25))
    for k in range(10):
        a0, a1 = k * TAU / 10, (k + 1) * TAU / 10
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(c + Vector((0, 0, 0.25))), bm.verts.new(c + Vector((math.cos(a0) * 0.9, math.sin(a0) * 0.9, -0.02))), bm.verts.new(c + Vector((math.cos(a1) * 0.9, math.sin(a1) * 0.9, -0.02)))])
        s.obj(bm, cols[k % 2])


ASSETS = {
    'cantina': lambda s, r: cantina(s, r),
    'tenement0': lambda s, r: tenement(s, r, 0),
    'tenement1': lambda s, r: tenement(s, r, 1),
    'tenement2': lambda s, r: tenement(s, r, 2),
    'stall0': lambda s, r: stall(s, r, 0),
    'stall1': lambda s, r: stall(s, r, 1),
    'stall2': lambda s, r: stall(s, r, 2),
    'billboard': lambda s, r: billboard(s, r),
    'cartHotdog': lambda s, r: cart_hotdog(s, r),
    'containerKiosk': lambda s, r: container_kiosk(s, r),
    'containerKiosk2': lambda s, r: container_kiosk(s, np.random.default_rng(7)),
    'foodTruck': lambda s, r: food_truck(s, r),
    'yatai': lambda s, r: yatai(s, r),
    'grillTrike': lambda s, r: grill_trike(s, r),
    'stackShop': lambda s, r: stack_shop(s, r),
    'roundKiosk': lambda s, r: round_kiosk(s, r),
    'tableSet': lambda s, r: table_set(s, r),
    'speeder0': lambda s, r: speeder(s, r, 0),
    'speeder1': lambda s, r: speeder(s, r, 1),
    'crates': lambda s, r: crates(s, r),
    'barrels': lambda s, r: barrels(s, r),
    'ventGrate': lambda s, r: vent_grate(s, r),
    'droidParts': lambda s, r: droid_parts(s, r),
    'trashBin': lambda s, r: trash_bin(s, r),
    'junctionBox': lambda s, r: junction_box(s, r),
}

for i, (name, fn) in enumerate(ASSETS.items()):
    if ONLY and name not in ONLY:
        continue
    s = Scene()
    fn(s, np.random.default_rng(100 + i))
    s.export(name)
