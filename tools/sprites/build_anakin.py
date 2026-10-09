"""
Anakin Skywalker (The Clone Wars) — a detailed model built procedurally in
Blender and exported as a .glb with the game's animations.

  python build_anakin.py anakin_anims.json out/anakin.glb      (bpy module)
  blender -b -P build_anakin.py -- anakin_anims.json out/anakin.glb

After the Hot Toys 1/6 Clone Wars figure: wavy shoulder-length hair; a
weathered gunmetal chest and back plate with a raised collar; a large left
pauldron with the red Jedi Order crest; a long navy tabard, open at the front
and split at the sides, over a crimson tunic with long sleeves; a wide brown
belt with a silver buckle, a black clip and pouches; long brown leather
gauntlets with ribbed wrists and flared cuffs; crimson trousers; tall dark
brown boots with three straps and buckles. Every part is rigid on a joint
of the game's own humanoid rig (src/gfx/models/rig.js), so the exported
animations — sampled from the game's pose code by export_rig_anims.mjs —
move it exactly as the game's sprites move.

Coordinates: the game's model space is +X forward, +Y up, +Z to the model's
right; Blender's here is +X forward, +Z up, +Y to the model's left:
(x, y, z)_game -> (x, -z, y)_blender. Surface detail (fabric weave, leather
grain, metal scratches and grime) is generated into image textures with
normal maps so it survives the glTF export.
"""
import json
import math
import os
import sys

import bpy  # noqa: I001 (bpy first: it makes bmesh / mathutils importable)
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ANIMS = argv[0] if argv else os.path.join(os.path.dirname(__file__), 'anakin_anims.json')
OUT = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(__file__), 'out', 'anakin.glb')
TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'tex')
TAU = math.pi * 2


def G(x, y, z):
    """Game model space -> Blender."""
    return Vector((x, -z, y))


def GQ(qx, qy, qz, qw):
    """Game quaternion (three.js x, y, z, w) -> Blender (w, x, y, z)."""
    return Quaternion((qw, qx, -qz, qy))


# ----------------------------------------------------------------------------
# Scene

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
coll = scene.collection
data = json.load(open(ANIMS))
D = data['dims']


def empty(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.05
    coll.objects.link(o)
    o.parent = parent
    o.location = loc
    o.rotation_mode = 'QUATERNION'
    return o


# ----------------------------------------------------------------------------
# Procedural textures (tileable), written as PNGs and packed into the .glb

RES = 512
rng = np.random.default_rng(7)


def periodic_noise(res, cells, seed):
    """Tileable value noise: a random lattice, smoothly interpolated."""
    r = np.random.default_rng(seed)
    lat = r.random((cells, cells))
    t = np.linspace(0, cells, res, endpoint=False)
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = lat[np.ix_(i0, i0)]
    b = lat[np.ix_(i0, i1)]
    c = lat[np.ix_(i1, i0)]
    d = lat[np.ix_(i1, i1)]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(res, base, octaves, seed, gain=0.5):
    out = np.zeros((res, res))
    amp = 1.0
    tot = 0.0
    for o in range(octaves):
        out += periodic_noise(res, base * 2 ** o, seed + o) * amp
        tot += amp
        amp *= gain
    return out / tot


def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack((-gx, gy, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def save_png(name, arr):
    """arr: HxWx3 or HxWx4 floats 0..1 -> a Blender image saved as PNG (packed on export)."""
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.dstack((arr, np.ones((h, w))))
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(arr).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEX_DIR, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def make_textures():
    """Greyscale albedo detail (multiplied by each material's colour) + normal map, per surface kind."""
    yy, xx = np.mgrid[0:RES, 0:RES] / RES
    tex = {}
    # fabric: a twill weave over soft mottling and a few darker wear streaks
    twill = 0.5 + 0.5 * np.sin((xx + yy) * TAU * 96) * np.sin((xx - yy) * TAU * 48)
    mott = fbm(RES, 4, 4, 11)
    alb = 0.78 + 0.1 * twill + 0.22 * (mott - 0.5)
    h = twill * 0.6 + fbm(RES, 16, 3, 12) * 0.4
    tex['fabric'] = (save_png('fabric_a', np.dstack([alb] * 3)), save_png('fabric_n', normal_from_height(h, 1.6)))
    # leather: pebbled grain, creases, scuffed lighter patches
    grain = fbm(RES, 48, 3, 21)
    crease = np.abs(fbm(RES, 6, 4, 22) - 0.5) < 0.02
    scuff = fbm(RES, 5, 3, 23)
    alb = 0.8 + 0.18 * (scuff - 0.5) + 0.08 * (grain - 0.5) - crease * 0.12
    h = grain * 0.8 - crease * 0.6
    tex['leather'] = (save_png('leather_a', np.dstack([alb] * 3)), save_png('leather_n', normal_from_height(h, 2.4)))
    # metal: grime blotches, fine scratches, chipped paint flecks
    grime = fbm(RES, 4, 5, 31)
    alb = 0.82 + 0.3 * (grime - 0.5)
    scr = np.zeros((RES, RES))
    for _ in range(260):
        x0, y0 = rng.random(2) * RES
        ang = rng.random() * math.pi
        ln = rng.random() * 40 + 6
        for t in np.linspace(0, 1, int(ln)):
            x = int(x0 + math.cos(ang) * ln * t) % RES
            y = int(y0 + math.sin(ang) * ln * t) % RES
            scr[y, x] = 1
    chips = (fbm(RES, 24, 2, 32) > 0.72).astype(float)
    alb = alb + scr * 0.25 + chips * 0.18
    h = fbm(RES, 32, 2, 33) * 0.3 - scr * 0.5 - chips * 0.4
    tex['metal'] = (save_png('metal_a', np.dstack([np.clip(alb, 0, 1.2)] * 3) / 1.2), save_png('metal_n', normal_from_height(h, 2.0)))
    # skin: very soft variation
    alb = 0.95 + 0.06 * (fbm(RES, 8, 3, 41) - 0.5)
    tex['skin'] = (save_png('skin_a', np.dstack([alb] * 3)), None)
    # hair: fine strands along V with lighter and darker locks
    strands = fbm(RES, 4, 2, 51)[:, :1] * 0 + np.sin(xx * TAU * 140 + fbm(RES, 6, 2, 52) * 8) * 0.5 + 0.5
    locks = fbm(RES, 6, 3, 53)
    alb = 0.75 + 0.18 * strands * 0.5 + 0.3 * (locks - 0.5)
    tex['hair'] = (save_png('hair_a', np.dstack([alb] * 3)), save_png('hair_n', normal_from_height(strands, 1.2)))
    return tex


TEX = make_textures()
MATS = {}


def material(name, color, kind=None, rough=0.6, metal=0.0, emit=None):
    """Principled material: colour × detail texture, normal map, roughness / metalness."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    c = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
        bsdf.inputs['Emission Color'].default_value = (*lin, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    elif kind and kind in TEX:
        alb, nrm = TEX[kind]
        ti = nt.nodes.new('ShaderNodeTexImage')
        ti.image = alb
        mix = nt.nodes.new('ShaderNodeMix')  # glTF: baseColorFactor x baseColorTexture
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = (*lin, 1)
        nt.links.new(ti.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        if nrm:
            tn = nt.nodes.new('ShaderNodeTexImage')
            tn.image = nrm
            tn.image.colorspace_settings.name = 'Non-Color'
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = 0.8
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
    MATS[name] = m
    return m


K = dict(
    skin=0xd8a281, lip=0xb57466, brow=0x3e2818, eye=0x2a3a48,
    hair=0x6a4527, hairDark=0x46301d,
    crimson=0x7a1d24, crimsonDark=0x55141a,
    navy=0x2b3a69, navyDark=0x1d2749,
    plate=0x6a7273, plateDark=0x4a5254, crest=0x9a2f2c,
    leather=0x5a3a26, leatherDark=0x382417, glove=0x5e4331, gloveDark=0x3e2a1d,
    boot=0x3d2a1f, sole=0x15110e, silver=0xc4c8cc, black=0x151517,
)
M = dict(
    skin=material('skin', K['skin'], 'skin', 0.55),
    lip=material('lip', K['lip'], None, 0.5),
    brow=material('brow', K['brow'], None, 0.8),
    eye=material('eye', K['eye'], None, 0.2),
    hair=material('hair', K['hair'], 'hair', 0.55),
    hairDark=material('hairDark', K['hairDark'], 'hair', 0.6),
    crimson=material('crimson', K['crimson'], 'fabric', 0.85),
    crimsonDark=material('crimsonDark', K['crimsonDark'], 'fabric', 0.9),
    navy=material('navy', K['navy'], 'fabric', 0.9),
    navyDark=material('navyDark', K['navyDark'], 'fabric', 0.9),
    plate=material('plate', K['plate'], 'metal', 0.42, 0.3),
    plateDark=material('plateDark', K['plateDark'], 'metal', 0.5, 0.3),
    crest=material('crest', K['crest'], 'metal', 0.55, 0.2),
    leather=material('leather', K['leather'], 'leather', 0.55),
    leatherDark=material('leatherDark', K['leatherDark'], 'leather', 0.6),
    glove=material('glove', K['glove'], 'leather', 0.5),
    gloveDark=material('gloveDark', K['gloveDark'], 'leather', 0.55),
    boot=material('boot', K['boot'], 'leather', 0.45),
    sole=material('sole', K['sole'], None, 0.9),
    silver=material('silver', K['silver'], 'metal', 0.25, 1.0),
    black=material('black', K['black'], None, 0.5),
    blade=material('blade', 0xdcefff, None, 0.5, 0, emit=8.0),
)


# ----------------------------------------------------------------------------
# Geometry helpers (all in Blender units; parts are parented to a joint)


def box_uv(bm, scale=2.0):
    """World-size box-projected UVs, so the detail textures have an even density."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            lp[uv].uv = (u * scale, v * scale)


def finish(name, bm, mat, parent, smooth=True, subsurf=0, solidify=0.0, bevel=0.0, uvscale=2.0):
    box_uv(bm, uvscale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    o.parent = parent
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    if solidify:
        md = o.modifiers.new('solid', 'SOLIDIFY')
        md.thickness = solidify
        md.offset = 1.0
    if bevel:
        md = o.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = 2
        md.limit_method = 'ANGLE'
    if subsurf:
        md = o.modifiers.new('subd', 'SUBSURF')
        md.levels = subsurf
        md.render_levels = subsurf
    return o


def lathe(name, mat, parent, prof, z0, z1, segs=24, a0=0.0, a1=TAU, sx=1.0, sy=1.0, center=(0, 0), wob=None, cap_top=False, cap_bot=False, rings=None, **kw):
    """Surface of revolution about the vertical axis from height z0 (t=0) to z1 (t=1).
    prof(t) -> radius; wob(t, a) -> radius multiplier (folds, pleats); a0..a1 an open sector."""
    rings = rings or max(4, int(abs(z1 - z0) * 60))
    closed = abs((a1 - a0) - TAU) < 1e-6
    na = segs if closed else segs + 1
    bm = bmesh.new()
    grid = []
    for i in range(rings + 1):
        t = i / rings
        z = z0 + (z1 - z0) * t
        row = []
        for k in range(na):
            a = a0 + (a1 - a0) * k / segs
            r = prof(t) * (wob(t, a) if wob else 1.0)
            row.append(bm.verts.new((center[0] + math.cos(a) * r * sx, center[1] + math.sin(a) * r * sy, z)))
        grid.append(row)
    for i in range(rings):
        for k in range(segs):
            k2 = (k + 1) % na
            bm.faces.new((grid[i][k], grid[i][k2], grid[i + 1][k2], grid[i + 1][k]))
    if closed and cap_top:
        bm.faces.new(list(reversed(grid[-1])) if z1 > z0 else grid[-1])
    if closed and cap_bot:
        bm.faces.new(grid[0] if z1 > z0 else list(reversed(grid[0])))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, parent, **kw)


def ellipsoid(name, mat, parent, r, loc=(0, 0, 0), scale=(1, 1, 1), segs=20, rings=12, cut=None, **kw):
    """UV sphere scaled to an ellipsoid; `cut(v)` -> True deletes that vertex (caps, shells)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    if cut:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if cut(v.co)], context='VERTS')
    for v in bm.verts:
        v.co += Vector(loc)
    return finish(name, bm, mat, parent, **kw)


def cube(name, mat, parent, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.004, subsurf=0, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.LocRotScale(Vector(loc), Quaternion(Vector((1, 0, 0)), rot[0]) @ Quaternion(Vector((0, 1, 0)), rot[1]) @ Quaternion(Vector((0, 0, 1)), rot[2]), Vector(size))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return finish(name, bm, mat, parent, smooth=bool(subsurf), bevel=bevel, subsurf=subsurf, **kw)


def tube(name, mat, parent, pts, radii, segs=8, **kw):
    """A tube along a polyline (hair locks, straps, cables), radius per point."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        tdir = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = prev_n if prev_n is not None else (tdir.orthogonal().normalized())
        n = (n - tdir * n.dot(tdir)).normalized()
        b = tdir.cross(n)
        prev_n = n
        ring = []
        for k in range(segs):
            a = TAU * k / segs
            ring.append(bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * radii[i]))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.normal_update()
    return finish(name, bm, mat, parent, **kw)


def extrude_poly(name, mat, parent, poly, depth, matrix, **kw):
    """A flat 2D outline (u, v) extruded by `depth`, then placed by `matrix` (emblems, plates)."""
    bm = bmesh.new()
    vs = [bm.verts.new((u, v, 0)) for u, v in poly]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(name, bm, mat, parent, smooth=False, **kw)


def bent_plate(name, mat, parent, outline, width, height, radius, thick, place, cuts=6, bulge=0.0, **kw):
    """A plate cut from a flat outline (u across −0.5..0.5, v down 0..1, in units of
    width / height), bent round a cylinder of `radius` (u runs round it) and given
    `thick`ness. `place` (Matrix) puts the cylinder: its axis is local −Z from the
    plate's top, the plate faces local +Y. `bulge` domes it a little top to bottom."""
    bm = bmesh.new()
    vs = [bm.verts.new((u * width, -v * height, 0)) for u, v in outline]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=False)
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z -= thick
    for v in bm.verts:
        u, y, w = v.co
        t = -y / height  # 0 top .. 1 bottom
        r = radius + w + bulge * math.sin(math.pi * min(1, max(0, t)))
        a = u / radius
        v.co = Vector((r * math.sin(a), r * math.cos(a), y))
    bmesh.ops.transform(bm, matrix=place, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # after placing: a mirrored placement flips the winding
    return finish(name, bm, mat, parent, smooth=True, bevel=0.002, **kw)


# ----------------------------------------------------------------------------
# The rig: an empty per joint of the game's skeleton

root = empty('anakin')
J = {}
for name, jd in data['joints'].items():
    J[name] = empty(name, None, G(*jd['pos']))
for name, jd in data['joints'].items():
    J[name].parent = J[jd['parent']] if jd['parent'] else root

thigh, shin, uarm, farm = D['thigh'], D['shin'], D['uarm'], D['farm']
Lside = {'L': 1, 'R': -1}  # his left is Blender +Y

# --- legs: crimson trousers, tall strapped boots ------------------------------
for s, sy in Lside.items():
    hip, kn, an = J['hip' + s], J['kn' + s], J['an' + s]
    lathe('thigh' + s, M['crimson'], hip, lambda t: 0.088 - 0.024 * t + 0.006 * math.sin(t * math.pi), 0.02, -thigh - 0.02, segs=18,
          wob=lambda t, a: 1 + 0.035 * math.sin(a * 3 + t * 9) * (0.4 + t), uvscale=6)
    # the boot shaft to just under the knee: a wide folded cuff, two buckled
    # straps below it and one round the ankle (after the figure's boots)
    boot = lambda t: 0.084 - 0.026 * t + 0.01 * math.sin(min(1, t * 1.6) * math.pi)
    lathe('boot' + s, M['boot'], kn, boot, -0.02, -shin + 0.02, segs=20, cap_top=True,
          wob=lambda t, a: 1 + 0.025 * math.sin(a * 5 + t * 14) * t, uvscale=6)
    lathe('bootCuff' + s, M['boot'], kn, lambda t: 0.104 - 0.012 * t, 0.045, -0.06, segs=22, solidify=0.01, uvscale=6,
          wob=lambda t, a: 1 + 0.03 * math.sin(a * 3 + 1))
    lathe('cuffSeam' + s, M['leatherDark'], kn, lambda t: 0.1, -0.052, -0.066, segs=22)
    for i, y in enumerate((-0.1, -0.17, -0.38)):
        r = boot(min(1, (-0.02 - y) / shin)) + 0.008
        lathe(f'strap{s}{i}', M['leatherDark'], kn, lambda t, r=r: r, y + 0.016, y - 0.016, segs=20, uvscale=6)
        cube(f'buckle{s}{i}', M['silver'], kn, (0.012, 0.034, 0.03), (r * 0.3, sy * r * 0.95, y), bevel=0.003)
        cube(f'strapEnd{s}{i}', M['leatherDark'], kn, (0.01, 0.04, 0.022), (r * 0.55, sy * r * 0.85, y), rot=(0, 0, sy * 0.6), bevel=0.003)
    # the foot: a rounded toe box on a chunky sole with a heel
    foot = ellipsoid('foot' + s, M['boot'], an, 0.07, (0.06, 0, -0.045), (1.75, 0.82, 0.62), segs=18, rings=10, cut=lambda v: v.z < -0.03)
    cube('sole' + s, M['sole'], an, (0.27, 0.12, 0.028), (0.06, 0, -0.077), bevel=0.006)
    cube('heel' + s, M['sole'], an, (0.07, 0.11, 0.035), (-0.035, 0, -0.095), bevel=0.004)
    lathe('ankle' + s, M['boot'], an, lambda t: 0.063 + 0.012 * t, 0.02, -0.05, segs=18)

# --- pelvis: trousers, the belt with its buckle, clip and pouches -------------
pel = J['pelvis']
lathe('hips', M['crimson'], pel, lambda t: 0.155 - 0.01 * t, 0.07, -0.13, segs=24, sx=0.88, uvscale=6)
belt_r = 0.178
lathe('belt', M['leather'], pel, lambda t: belt_r, 0.095, 0.03, segs=32, sx=0.86, uvscale=6, bevel=0.003)
for z in (0.09, 0.035):
    lathe(f'beltEdge{z}', M['leatherDark'], pel, lambda t: belt_r + 0.002, z + 0.004, z - 0.004, segs=32, sx=0.86)
cube('buckle', M['silver'], pel, (0.016, 0.07, 0.05), (0.15, 0.06, 0.062), bevel=0.004)
cube('buckleIn', M['black'], pel, (0.018, 0.04, 0.025), (0.152, 0.06, 0.062), bevel=0.002)
cube('clip', M['black'], pel, (0.024, 0.05, 0.058), (0.155, -0.035, 0.062), bevel=0.006)
cube('clipU', M['silver'], pel, (0.026, 0.026, 0.008), (0.16, -0.035, 0.07), bevel=0.002)
for i, (x, y) in enumerate(((0.06, -0.16), (-0.06, -0.17), (0.06, 0.16), (-0.12, 0.12))):
    a = math.atan2(y / 0.86, x)
    cube(f'pouch{i}', M['leatherDark'], pel, (0.055, 0.04, 0.07), (x * 1.04, y * 1.04, 0.045), rot=(0, 0, a), bevel=0.008)
    cube(f'flap{i}', M['leather'], pel, (0.058, 0.044, 0.02), (x * 1.06, y * 1.06, 0.075), rot=(0, 0, a), bevel=0.005)

# --- the tabard skirt and the crimson tunic below the belt ---------------------
# panels hang from pivots on the belt and follow the legs (keyed below)
SK = {}
pleats = lambda t, a: 1 + (0.03 * math.sin(a * 11) + 0.015 * math.sin(a * 23 + 1)) * (0.3 + t)  # heavy fabric: long soft folds
for key, s, a0, a1, mat_, ln, rr in (
    ('innerL', 'L', 0.04, 0.6, M['crimson'], 0.58, 0.162),
    ('innerR', 'R', -0.6, -0.04, M['crimson'], 0.58, 0.162),
    ('outerL', 'L', 0.09, 2.35, M['navy'], 0.64, 0.178),
    ('outerR', 'R', -2.35, -0.09, M['navy'], 0.64, 0.178),
    ('outerB', None, 2.25, TAU - 2.25, M['navy'], 0.62, 0.178),
):
    pivot = empty('skirt_' + key, pel, (0, 0, 0.04))
    SK[key] = (pivot, s)
    lathe('skirt' + key, mat_, pivot, lambda t, rr=rr: rr + 0.035 * t ** 1.2, 0.02, -ln, segs=20, a0=a0, a1=a1, sx=0.9,
          wob=pleats, solidify=0.008, uvscale=5)
    # a darker hem band
    lathe('hem' + key, M['navyDark'] if 'outer' in key else M['crimsonDark'], pivot, lambda t, rr=rr: rr + 0.035 + 0.002, -ln + 0.03, -ln, segs=20,
          a0=a0, a1=a1, sx=0.9, wob=lambda t, a: pleats(1, a), solidify=0.01, uvscale=5)

# --- torso: crimson tunic, the navy tabard over it ------------------------------
sp, ch = J['spine'], J['chest']
lathe('tunicWaist', M['crimson'], sp, lambda t: 0.152 + 0.008 * t, 0.0, D['spine'] + 0.02, segs=24, sx=0.78, uvscale=6)
lathe('tunicChest', M['crimson'], ch, lambda t: 0.16 + 0.03 * math.sin(t * math.pi * 0.8) - 0.04 * t ** 3, -0.02, 0.32, segs=24, sx=0.74, cap_top=True, uvscale=6)
vest_w = lambda t, a: 1 + 0.02 * math.sin(a * 9 + t * 4)
lathe('tabardWaist', M['navy'], sp, lambda t: 0.162 + 0.01 * t, -0.02, D['spine'] + 0.02, segs=22, a0=0.14, a1=TAU - 0.14, sx=0.8, wob=vest_w, solidify=0.006, uvscale=5)
lathe('tabardChest', M['navy'], ch, lambda t: 0.172 + 0.025 * math.sin(t * math.pi * 0.8) - 0.03 * t ** 2, -0.02, 0.26, segs=22, a0=0.16, a1=TAU - 0.16, sx=0.78, wob=vest_w, solidify=0.006, uvscale=5)
# the tabard's front edges: a slightly raised seam
for sgn in (1, -1):
    tube(f'tabardEdge{sgn}', M['navyDark'], sp, [(0.13 * math.cos(0.14), sgn * 0.162 * math.sin(0.14), z) for z in np.linspace(-0.02, D['spine'] + 0.02, 6)], [0.006] * 6, segs=6)

# --- armour (after the figure): a flat gunmetal chest plate with a straight
# lower edge, the same at the back, three stepped plates over each shoulder,
# a dark grey knit collar, and on his left upper arm a shield-shaped
# pauldron — straight sides, bottom corners cut, a notch in the middle —
# wrapped round the arm, with the red Jedi Order crest.
# the plastron: one shell round the upper chest and back, its top sloping in
# to the collar, a straight lower edge with a rolled rim
plast = lambda t: 0.2 - 0.105 * t ** 1.7  # closes in to the collar
lathe('plastron', M['plate'], ch, plast, 0.15, 0.345, segs=36, sx=0.8, solidify=0.012, subsurf=1, uvscale=4,
      wob=lambda t, a: (abs(math.cos(a)) ** 3.2 + abs(math.sin(a)) ** 3.2) ** (-1 / 3.2) * 0.93)  # flat front, squared sides
lathe('plastronRim', M['plateDark'], ch, lambda t: 0.205 + 0.004 * math.sin(t * math.pi), 0.162, 0.142, segs=36, sx=0.81,
      wob=lambda t, a: (abs(math.cos(a)) ** 3.2 + abs(math.sin(a)) ** 3.2) ** (-1 / 3.2) * 0.93)
for sgn in (1, -1):  # two shallow grooves down the front
    tube(f'plateGroove{sgn}', M['plateDark'], ch, [(0.168 - 0.035 * t ** 1.5, sgn * 0.06, 0.16 + 0.17 * t) for t in np.linspace(0, 1, 6)], [0.003] * 6, segs=5)
# the spaulders: three curved lames per shoulder, round an axis running front to
# back over the shoulder, cascading from the neck down over the arm
to_x = Matrix(((0, 0, -1, 0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1)))  # the plate cylinder's axis (local −Z) along +X
for side, sgn in (('L', 1), ('R', -1)):
    for k in range(3):
        r = 0.085 + 0.01 * k
        mid = math.radians(70 - 22 * k)  # angle of the lame's middle, from horizontal (outwards)
        arc = math.radians(78)  # broad shingles, each overlapping the next
        # u wraps round the cylinder from its +Y side; rotate so the lame sits at `mid`
        spin = Matrix.Rotation(sgn * mid, 4, 'X')  # turns the plate's facing (+Y) up to `mid` above horizontal
        place = Matrix.Translation(Vector((0.125 - 0.005 * k, sgn * (0.125 + 0.012 * k), 0.24 - 0.012 * k))) @ spin @ to_x
        if sgn < 0:
            place = place @ Matrix.Diagonal((1, -1, 1, 1))
        bent_plate(f'lame{side}{k}', M['plate'] if k != 1 else M['plateDark'], ch,
                   [(-0.5, 0.0), (0.5, 0.0), (0.5, 0.92), (0.42, 1.0), (-0.42, 1.0), (-0.5, 0.92)],
                   r * arc, 0.25 - 0.012 * k, r, 0.011, place, cuts=5, bulge=0.004, uvscale=4)
# the knit collar (dark grey turtleneck) and the plate's neck opening
lathe('collar', material('knit', 0x3b3d40, 'fabric', 0.95), ch, lambda t: 0.072 - 0.006 * t, 0.3, 0.4, segs=24, sx=0.95,
      wob=lambda t, a: 1 + 0.02 * math.sin(a * 36), uvscale=8)
lathe('collarFold', material('knit', 0x3b3d40, 'fabric', 0.95), ch, lambda t: 0.076, 0.39, 0.405, segs=24, sx=0.95)
lathe('neckRim', M['plateDark'], ch, lambda t: 0.105 - 0.01 * t, 0.33, 0.35, segs=28, sx=0.92, solidify=0.008)
# his left pauldron: a shield-shaped plate wrapped round the upper arm
shL = J['shL']
paul_outline = [(-0.5, 0.04), (-0.25, 0.0), (0.0, -0.02), (0.25, 0.0), (0.5, 0.04), (0.5, 0.78), (0.3, 0.97), (0.06, 1.0), (0.0, 0.9), (-0.06, 1.0), (-0.3, 0.97), (-0.5, 0.78)]
paul_place = Matrix.Translation(Vector((0.005, 0.0, 0.05))) @ Matrix.Rotation(0.12, 4, 'X')  # hangs from just above the joint, tilted out a little
bent_plate('pauldron', M['plate'], shL, paul_outline, 0.22, 0.25, 0.085, 0.012, paul_place, cuts=6, bulge=0.012, uvscale=4)
bent_plate('pauldronEdge', M['plateDark'], shL, [(-0.5, 0.0), (0.5, 0.0), (0.5, 1.0), (-0.5, 1.0)], 0.22, 0.014, 0.097, 0.006, paul_place, cuts=4)
# the crest, painted on: wings sweeping up either side, the blade, the star
def crest_parts():
    wing = [(0.04, -0.34), (0.2, -0.3), (0.34, -0.18), (0.42, 0.0), (0.42, 0.18), (0.36, 0.36), (0.3, 0.52), (0.34, 0.3),
            (0.3, 0.16), (0.25, 0.3), (0.19, 0.44), (0.21, 0.24), (0.19, 0.08), (0.13, -0.06), (0.04, -0.16)]
    wingL = [(-u, v) for u, v in wing]
    blade = [(-0.022, 0.6), (0.022, 0.6), (0.022, -0.42), (0.0, -0.5), (-0.022, -0.42)]
    star = []
    for i in range(16):
        a = i * math.pi / 8
        r = 0.16 if i % 2 == 0 else 0.05
        star.append((math.sin(a) * r, -0.14 + math.cos(a) * r))
    return [wing, wingL, blade, star]


def on_cylinder(poly, radius, scale, offset_v, out):
    """Map a crest outline (u right, v up, about the plate's middle) onto the pauldron's cylinder."""
    return [(u * scale, offset_v - v * scale) for u, v in poly]


for i, poly in enumerate(crest_parts()):
    outline = [(u * 0.8, 0.46 - v * 0.8 * 0.22 / 0.25) for u, v in poly]  # in the plate's (u, v) units: large, as on the figure
    bent_plate(f'crest{i}', M['crest'], shL, outline if i != 1 else outline[::-1], 0.22, 0.25, 0.0855 + 0.0125, 0.003, paul_place, cuts=3, bulge=0.012)

# --- arms: crimson sleeves, long gauntlets, gloved fists -------------------------
for s, sy in Lside.items():
    sh, el, ha = J['sh' + s], J['el' + s], J['ha' + s]
    ellipsoid('deltoid' + s, M['crimson'], sh, 0.056, (0, 0, -0.025), (1.0, 1.0, 1.15), segs=16, rings=10, uvscale=6)
    lathe('sleeve' + s, M['crimson'], sh, lambda t: 0.06 - 0.008 * t, 0.02, -uarm - 0.01, segs=16, cap_bot=True,
          wob=lambda t, a: 1 + 0.06 * math.sin(a * 3 + t * 11) * (0.3 + t), uvscale=6)
    # the gauntlet: flared cuff, forearm, ribbed wrist
    gl = lambda t: 0.068 - 0.022 * t + (0.012 if t < 0.12 else 0)
    lathe('gauntlet' + s, M['glove'], el, gl, 0.02, -farm + 0.01, segs=18, uvscale=6,
          wob=lambda t, a: 1 + 0.025 * math.sin(a * 6 + t * 20) * (1 - t))
    lathe('cuffRim' + s, M['gloveDark'], el, lambda t: 0.08, 0.025, 0.005, segs=18, solidify=0.006)
    for i in range(4):
        z = -farm + 0.05 + i * 0.022
        lathe(f'rib{s}{i}', M['gloveDark'], el, lambda t, z=z: gl((0.02 - z) / farm) + 0.004, z + 0.007, z - 0.007, segs=18)
    tube('stitch' + s, M['gloveDark'], el, [(0.0, sy * 0.06 * (1 - t * 0.3), 0.0 - t * (farm - 0.08)) for t in np.linspace(0, 1, 5)], [0.0025] * 5, segs=4)
    # the fist: palm block, curled fingers, thumb (closed on the grip)
    cube('palm' + s, M['glove'], ha, (0.07, 0.05, 0.075), (0.005, 0, -0.045), bevel=0.012)
    for i in range(4):
        tube(f'finger{s}{i}', M['glove'], ha, [(0.04, -0.022 + i * 0.015, -0.015), (0.06, -0.022 + i * 0.015, -0.045), (0.045, -0.022 + i * 0.015, -0.078), (0.015, -0.022 + i * 0.015, -0.08)], [0.011, 0.011, 0.01, 0.009], segs=6)
    tube('thumb' + s, M['glove'], ha, [(0.02, sy * 0.03, -0.03), (0.045, sy * 0.035, -0.05), (0.055, sy * 0.02, -0.065)], [0.012, 0.011, 0.009], segs=6)

# --- head (after the figure): a longer face, and the hair — light brown,
# wavy, swept back off the forehead with volume on top, short over the ears
# and at the nape. A shell under ~110 swept clumps; every clump runs
# backwards over the head along a great circle round the head's side-to-side
# axis (the "swept back" flow), lifted at the front and waving gently.
nk, hd = J['neck'], J['head']
HC = Vector((0.012, 0, 0.1))  # head centre (joint space)
HR = (0.092, 0.081, 0.112)  # head radii
lathe('neck', M['skin'], nk, lambda t: 0.046 - 0.004 * t, -0.01, 0.09, segs=14)
ellipsoid('head', M['skin'], hd, 1.0, HC, HR, segs=28, rings=18)
ellipsoid('jaw', M['skin'], hd, 0.05, (0.045, 0, 0.04), (1.0, 1.25, 0.9), segs=18, rings=10)
ellipsoid('chin', M['skin'], hd, 0.022, (0.088, 0, 0.012), (1.0, 1.2, 0.9), segs=12, rings=8)
for sgn in (1, -1):
    ellipsoid(f'ear{sgn}', M['skin'], hd, 0.022, (0.005, sgn * 0.08, 0.095), (0.6, 0.35, 1.0), segs=10, rings=8)
bm = bmesh.new()  # the nose: a straight bridge and a rounded tip
nv = [bm.verts.new(v) for v in ((0.098, 0, 0.122), (0.1, 0, 0.068), (0.124, 0, 0.074), (0.094, 0.015, 0.072), (0.094, -0.015, 0.072))]
for f in ((0, 2, 3), (0, 4, 2), (0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4)):
    bm.faces.new([nv[i] for i in f])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
finish('nose', bm, M['skin'], hd, smooth=False)
for sgn in (1, -1):
    ellipsoid(f'eye{sgn}', M['eye'], hd, 0.0105, (0.094, sgn * 0.033, 0.108), (0.55, 1.25, 0.75), segs=10, rings=6)
    cube(f'brow{sgn}', M['brow'], hd, (0.012, 0.04, 0.008), (0.097, sgn * 0.035, 0.128), rot=(sgn * 0.15, 0, 0), bevel=0.002)
cube('mouth', M['lip'], hd, (0.008, 0.034, 0.007), (0.1, 0, 0.048), bevel=0.002)


def hair_point(alpha, beta, lift):
    """A point on the hair surface: alpha runs from the forehead (≈0.5) up over
    the crown (π/2) to the nape (≈3.6), beta is the side angle; `lift` adds volume."""
    R = (HR[0] + 0.004 + lift, HR[1] + 0.006 + lift * 0.5, HR[2] + 0.004 + lift)
    cb = math.cos(beta)
    return HC + Vector((R[0] * cb * math.cos(alpha), R[1] * math.sin(beta), R[2] * cb * math.sin(alpha)))


def hairline(beta):
    """Where the hair starts (alpha) at side angle beta: high on the forehead, over the ears at the sides."""
    b = min(1.0, abs(beta) / 1.25)
    return 0.98 - 0.84 * b ** 1.3  # the forehead clear, the temples, just over the tops of the ears


def nape(beta):
    """Where it ends at the back (alpha): just below the skull, a little higher over the ears."""
    b = min(1.0, abs(beta) / 1.25)
    return 3.55 - 0.3 * b ** 2  # short at the nape


# the shell: the same surface, closed, under the clumps
bm = bmesh.new()
NA, NB = 36, 26
grid = []
for i in range(NB + 1):
    beta = -1.32 + 2.64 * i / NB
    a0, a1 = hairline(beta), nape(beta)
    grid.append([bm.verts.new(hair_point(a0 + (a1 - a0) * j / NA, beta, -0.002 + 0.006 * math.sin(math.pi * j / NA))) for j in range(NA + 1)])
for i in range(NB):
    for j in range(NA):
        bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
finish('hairShell', bm, M['hairDark'], hd, solidify=0.006, uvscale=6)
# the swept clumps
hr = np.random.default_rng(5)
for i in range(110):
    beta = hr.uniform(-1.3, 1.3)
    a0, a1 = hairline(beta), nape(beta)
    front = 1 - min(1, abs(beta) / 1.0)
    start = a0 + hr.uniform(0.0, 0.1)
    end = a1 - hr.uniform(0.0, 0.5)
    phase = hr.uniform(0, TAU)
    pts, rad = [], []
    for k in range(12):
        t = k / 11
        al = start + (end - start) * t
        # volume: the quiff lifts at the front and on top, lies flatter at the sides and back
        # the front sweeps up and back in a soft quiff, then lies close to the head
        lift = 0.016 * front * math.sin(min(1.0, t * 2.4) * math.pi) * (1 - 0.6 * t) + 0.004 * math.sin(t * math.pi) + 0.002
        b = beta + 0.06 * math.sin(t * math.pi * 2.6 + phase) * (0.4 + t)  # the wave
        pts.append(hair_point(al, b, lift))
        rad.append((0.011 + 0.005 * front) * (1 - 0.7 * t ** 1.5) + 0.002)
    tube(f'lock{i}', M['hair'] if hr.random() < 0.72 else M['hairDark'], hd, pts, rad, segs=7, uvscale=10)

# --- the lightsaber (IK-held: keyed on its own node) and the belt hilt ------------
def hilt(parent, prefix):
    lathe(prefix + 'pommel', M['silver'], parent, lambda t: 0.024 - 0.004 * t, 0.0, 0.03, segs=14, cap_bot=True)
    lathe(prefix + 'grip', M['black'], parent, lambda t: 0.021, 0.03, 0.15, segs=14, wob=lambda t, a: 1 + 0.12 * (math.sin(t * math.pi * 14) > 0.4))
    lathe(prefix + 'neck', M['silver'], parent, lambda t: 0.023, 0.15, 0.19, segs=14)
    lathe(prefix + 'shroud', M['silver'], parent, lambda t: 0.024 + 0.008 * t, 0.19, 0.25, segs=14, cap_top=True)
    cube(prefix + 'switch', M['black'], parent, (0.012, 0.012, 0.025), (0.023, 0, 0.17), bevel=0.002)


saber = empty('saber', root)
saber_ax = empty('saberAxis', saber)  # the hilt is modelled along +Z; the game's saber points along +X
saber_ax.rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.pi / 2)
saber_ax.location = (-0.13, 0, 0)
hilt(saber_ax, 'hilt_')
blade = lathe('blade', M['blade'], saber_ax, lambda t: 0.022 - 0.004 * t, 0.26, 1.26, segs=10, cap_top=True)
empty('saberBase', saber, (0.14, 0, 0))
empty('saberTip', saber, (1.13, 0, 0))
belt_hilt = empty('beltHilt', pel, G(0.02, 0.0, 0.19))
belt_hilt.rotation_quaternion = Quaternion(Vector((0, 1, 0)), 1.35)  # the game's rotation.z = -1.35
bh = empty('beltHiltAxis', belt_hilt, (-0.13, 0, 0))
bh.rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.pi / 2)
hilt(bh, 'belt_')

# ----------------------------------------------------------------------------
# Animations: one action per game animation, keyed on every joint node, the
# saber, the belt hilt (visibility by scale) and the skirt panels


def slerp_identity(q, k):
    return Quaternion().slerp(q, k)


anim_objs = list(J.values()) + [saber, belt_hilt] + [p for p, _ in SK.values()]
for o in anim_objs:
    o.animation_data_create()
for name, a in data['anims'].items():
    act = bpy.data.actions.new(name)
    for o in anim_objs:
        o.animation_data.action = act
    for f, fr in enumerate(a['frames']):
        for jn, v in fr['j'].items():
            o = J[jn]
            o.location = G(v[0], v[1], v[2])
            o.rotation_quaternion = GQ(v[3], v[4], v[5], v[6])
            o.keyframe_insert('location', frame=f)
            o.keyframe_insert('rotation_quaternion', frame=f)
        sv = fr.get('saber')
        if sv:
            saber.location = G(sv[0], sv[1], sv[2])
            saber.rotation_quaternion = GQ(sv[3], sv[4], sv[5], sv[6])
            saber.scale = (1, 1, 1)
        else:
            saber.scale = (1e-4, 1e-4, 1e-4)
        for prop in ('location', 'rotation_quaternion', 'scale'):
            saber.keyframe_insert(prop, frame=f)
        belt_hilt.scale = (1, 1, 1) if fr.get('beltHilt') else (1e-4, 1e-4, 1e-4)
        belt_hilt.keyframe_insert('scale', frame=f)
        # skirt panels follow the legs: the front halves most of each thigh's swing
        qL = GQ(*fr['j']['hipL'][3:])
        qR = GQ(*fr['j']['hipR'][3:])
        for key, (pivot, s) in SK.items():
            if s == 'L':
                pivot.rotation_quaternion = slerp_identity(qL, 0.75 if 'inner' in key else 0.6)
            elif s == 'R':
                pivot.rotation_quaternion = slerp_identity(qR, 0.75 if 'inner' in key else 0.6)
            else:
                pivot.rotation_quaternion = slerp_identity(qL, 0.25) @ slerp_identity(qR, 0.25)
            pivot.keyframe_insert('rotation_quaternion', frame=f)
    for o in anim_objs:
        tr = o.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        o.animation_data.action = None

# rest pose for the export's base state (the belt hilt keeps its fixed tilt)
for o in anim_objs:
    if o is not belt_hilt:
        o.rotation_quaternion = (1, 0, 0, 0)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,
    export_apply=True,  # modifiers (subdivision, bevels, thickness) baked into the mesh
    export_yup=True,
)
tris = sum(len(o.data.polygons) for o in coll.objects if o.type == 'MESH')
print(f'exported {OUT}: {len([o for o in coll.objects if o.type == "MESH"])} meshes, {tris} base faces, {len(data["anims"])} animations')
