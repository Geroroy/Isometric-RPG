"""
Anakin Skywalker (The Clone Wars), modelled from scratch after the Hot Toys
1/6 Clone Wars figure, skinned to the game's rig and exported as a .glb with
every game animation.

  python build_anakin.py anakin_anims.json out/anakin.glb [outfit]      (bpy module)
  blender -b -P build_anakin.py -- anakin_anims.json out/anakin.glb [outfit]

outfit: armor (default, the Clone Wars look below), vader (Episode III, the
night of Order 66: black leather tunic, sash and belt under the near-black
cloak, the deep hood raised — after the studio photo) or robe (the same
cloak with the hood lowered on the back). Every outfit shares the rig, the
face and the animations.

The reference, top to bottom: light brown wavy hair with volume on top, swept
back, over the tops of the ears and down to the collar; a scar over his right
eye. A dark grey knit collar inside the raised neck of a weathered gunmetal
chest plate — a boxy bib to just under the chest, the same at the back, a
two-step plate over his right shoulder; over his left shoulder a separate
rounded pauldron with the red Jedi Order crest. A sleeveless navy tabard of
heavy linen, open down the front, belted, falling in pleats to just under the
knee; under it a crimson tunic (long sleeves, a skirt nearly as long) and
crimson trousers. A wide brown belt: silver buckle on his right, black clip on
his left, pouches round the hips, the saber hilt hanging from the front when
the blade is off. Long brown leather gloves with flared cuffs to mid-forearm.
Tall dark brown boots to under the knee: a folded top, two buckled straps,
one round the ankle, chunky black soles.

The body is one armature with a bone per joint of the game's humanoid rig
(src/gfx/models/rig.js); every garment is skinned to it with smooth weights,
so elbows, knees and the waist bend without gaps and the tabard and tunic
skirts follow the legs. Hard parts (chest plate, pauldron, belt, hands,
head) are weighted to a single bone and stay rigid. The animations, sampled
from the game's pose code by export_rig_anims.mjs, key every bone of every
frame, plus the saber (its own node, as the game's IK holds it) and the belt
hilt's visibility.

Coordinates: the game's model space is +X forward, +Y up, +Z to the model's
right; Blender's here is +X forward, +Z up, +Y to the model's left:
(x, y, z)_game -> (x, -z, y)_blender. Every bone's rest orientation is the
identity, so a joint's game transform maps straight onto its pose bone.
Surface detail (linen weave, leather grain, metal wear) is generated into
image textures with normal maps so it survives the glTF export.
"""
import json
import math
import os
import sys

import bpy  # noqa: I001 (bpy first: it makes bmesh / mathutils importable)
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ANIMS = argv[0] if argv else os.path.join(os.path.dirname(__file__), 'anakin_anims.json')
OUT = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(__file__), 'out', 'anakin.glb')
TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'tex')
TAU = math.tau


def G(x, y, z):
    """Game model space -> Blender."""
    return Vector((x, -z, y))


def GQ(qx, qy, qz, qw):
    """Game quaternion (three.js x, y, z, w) -> Blender (w, x, y, z)."""
    return Quaternion((qw, qx, -qz, qy))


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def sstep(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def lerp_table(table, z):
    """Piecewise-linear lookup in rows (z, a, b, …) sorted by z."""
    if z <= table[0][0]:
        return table[0][1:]
    for r0, r1 in zip(table, table[1:]):
        if z <= r1[0]:
            t = (z - r0[0]) / (r1[0] - r0[0])
            t = t * t * (3 - 2 * t)  # smooth between rows
            return tuple(a + (b - a) * t for a, b in zip(r0[1:], r1[1:]))
    return table[-1][1:]


def superellipse(a, rx, ry, p):
    c, s = math.cos(a), math.sin(a)
    r = (abs(c) ** p + abs(s) ** p) ** (-1 / p)
    return c * r * rx, s * r * ry


# ----------------------------------------------------------------------------
# Scene and rig

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
coll = scene.collection
data = json.load(open(ANIMS))
JOINTS = data['joints']

REST = {}  # rest position of every joint, Blender world space


def rest(name):
    if name not in REST:
        jd = JOINTS[name]
        REST[name] = G(*jd['pos']) + (rest(jd['parent']) if jd['parent'] else Vector())
    return REST[name]


for _n in JOINTS:
    rest(_n)

arm_data = bpy.data.armatures.new('anakin')
arm = bpy.data.objects.new('anakin', arm_data)
coll.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n in JOINTS:
    b = arm_data.edit_bones.new(n)
    b.head = REST[n]
    b.tail = REST[n] + Vector((0, 0.05, 0))  # along +Y, roll 0: identity rest orientation
    b.roll = 0
for n, jd in JOINTS.items():
    if jd['parent']:
        arm_data.edit_bones[n].parent = arm_data.edit_bones[jd['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
assert all(abs((b.matrix_local.to_3x3() - Matrix.Identity(3)).determinant()) < 1e-6 for b in arm_data.bones)

# ----------------------------------------------------------------------------
# Procedural textures (tileable), written as PNGs and packed into the .glb

RES = 512
rng = np.random.default_rng(3)


def periodic_noise(res, cells, seed):
    """Tileable value noise: a random lattice, smoothly interpolated."""
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


def normal_map(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack((-gx, gy, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def save_png(name, arr):
    """HxWx3 floats 0..1 -> a Blender image saved as PNG (packed on export)."""
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w = arr.shape[:2]
    arr = np.dstack((np.clip(arr, 0, 1), np.ones((h, w))))
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(arr).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEX_DIR, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def fill_polys(res, polys):
    """Rasterise polygons (lists of (u, v) in 0..1, v up) to a 0/1 mask, 2× supersampled."""
    n = res * 2
    yy, xx = np.mgrid[0:n, 0:n]
    u, v = (xx + 0.5) / n, 1 - (yy + 0.5) / n
    mask = np.zeros((n, n), bool)
    for poly in polys:
        inside = np.zeros((n, n), bool)
        for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
            cond = (y0 > v) != (y1 > v)
            with np.errstate(divide='ignore', invalid='ignore'):
                xi = x0 + (v - y0) * (x1 - x0) / (y1 - y0)
            inside ^= cond & (u < xi)
        mask |= inside
    return mask.reshape(res, 2, res, 2).mean(axis=(1, 3))


def jedi_crest():
    """The Jedi Order crest in 0..1 (v up): two wings sweeping up from the base,
    the blade standing between them, the star over its hilt."""
    wing = [(0.53, 0.14), (0.66, 0.17), (0.79, 0.27), (0.87, 0.42), (0.88, 0.58), (0.84, 0.74), (0.77, 0.88),
            (0.79, 0.7), (0.76, 0.6), (0.71, 0.72), (0.64, 0.83), (0.67, 0.64), (0.65, 0.5), (0.6, 0.38), (0.53, 0.3)]
    wing2 = [(1 - u, v) for u, v in reversed(wing)]
    blade = [(0.48, 0.26), (0.5, 0.2), (0.52, 0.26), (0.52, 0.92), (0.48, 0.92)]
    star = []
    for i in range(16):
        a = i * math.pi / 8
        r = 0.13 if i % 2 == 0 else 0.04
        star.append((0.5 + math.sin(a) * r, 0.36 + math.cos(a) * r))
    return [wing, wing2, blade, star]


def make_textures():
    """Greyscale detail (multiplied by each material's colour) + normal map per surface kind."""
    yy, xx = np.mgrid[0:RES, 0:RES] / RES
    tex = {}
    # linen: a plain weave of slubby threads, soft mottling, faint fold shading
    wx = 0.5 + 0.5 * np.sin(xx * TAU * 110 + fbm(RES, 32, 2, 1) * 3)
    wy = 0.5 + 0.5 * np.sin(yy * TAU * 110 + fbm(RES, 32, 2, 2) * 3)
    weave = np.where((np.floor(xx * 110) + np.floor(yy * 110)) % 2 == 0, wx, wy)
    mott = fbm(RES, 4, 4, 3)
    alb = 0.8 + 0.1 * weave + 0.2 * (mott - 0.5)
    tex['linen'] = (save_png('linen_a', np.dstack([alb] * 3)), save_png('linen_n', normal_map(weave * 0.7 + fbm(RES, 16, 2, 4) * 0.3, 1.4)))
    # knit: fine vertical ribs
    rib = 0.5 + 0.5 * np.sin(xx * TAU * 64)
    tex['knit'] = (save_png('knit_a', np.dstack([0.85 + 0.15 * rib] * 3)), save_png('knit_n', normal_map(rib, 1.2)))
    # leather: pebbled grain, creases, scuffs
    grain = fbm(RES, 48, 3, 11)
    crease = (np.abs(fbm(RES, 6, 4, 12) - 0.5) < 0.018).astype(float)
    scuff = fbm(RES, 5, 3, 13)
    alb = 0.82 + 0.22 * (scuff - 0.5) + 0.08 * (grain - 0.5) - crease * 0.14
    tex['leather'] = (save_png('leather_a', np.dstack([alb] * 3)), save_png('leather_n', normal_map(grain * 0.8 - crease * 0.6, 2.2)))
    # metal: grime, scratches, worn lighter edges of chipped paint
    grime = fbm(RES, 4, 5, 21)
    scr = np.zeros((RES, RES))
    for _ in range(220):
        x0, y0 = rng.random(2) * RES
        ang = rng.random() * math.pi
        ln = rng.random() * 36 + 6
        for t in np.linspace(0, 1, int(ln)):
            scr[int(y0 + math.sin(ang) * ln * t) % RES, int(x0 + math.cos(ang) * ln * t) % RES] = 1
    chips = (fbm(RES, 20, 2, 22) > 0.7).astype(float)
    alb = 0.8 + 0.3 * (grime - 0.5) + scr * 0.07 + chips * 0.05 + 0.05 * (fbm(RES, 48, 2, 25) - 0.5)
    tex['metal'] = (save_png('metal_a', np.dstack([np.clip(alb, 0, 1)] * 3)), save_png('metal_n', normal_map(fbm(RES, 32, 2, 23) * 0.3 - scr * 0.15 - chips * 0.12, 1.2)))
    # skin: very soft variation
    tex['skin'] = (save_png('skin_a', np.dstack([0.95 + 0.06 * (fbm(RES, 8, 3, 31) - 0.5)] * 3)), None)
    # hair: fine strands along V, lighter and darker locks
    strands = np.sin(xx * TAU * 150 + fbm(RES, 6, 2, 41) * 8) * 0.5 + 0.5
    alb = 0.78 + 0.12 * strands + 0.3 * (fbm(RES, 6, 3, 42) - 0.5)
    tex['hair'] = (save_png('hair_a', np.dstack([alb] * 3)), save_png('hair_n', normal_map(strands, 1.0)))
    # the pauldron: its own colour map — weathered teal-grey plate with the crest
    base = np.array([0x55, 0x66, 0x68]) / 255
    red = np.array([0x8e, 0x2b, 0x2a]) / 255
    crest = fill_polys(RES, jedi_crest())
    worn = 1 + 0.3 * (grime - 0.5) + scr * 0.06
    col = (base[None, None, :] * (1 - crest[..., None]) + red[None, None, :] * crest[..., None] * (0.9 + 0.2 * (fbm(RES, 16, 2, 24)[..., None] - 0.5))) * worn[..., None]
    tex['pauldron'] = save_png('pauldron_c', col)
    return tex


TEX = make_textures()
MATS = {}


def srgb_to_linear(color):
    c = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def material(name, color, kind=None, rough=0.6, metal=0.0, emit=None, nstrength=0.8):
    """Principled material: colour × detail texture, normal map, roughness / metalness."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    lin = srgb_to_linear(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
        bsdf.inputs['Emission Color'].default_value = (*lin, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    elif kind:
        alb, nrm = TEX[kind]
        ti = nt.nodes.new('ShaderNodeTexImage')
        ti.image = alb
        mix = nt.nodes.new('ShaderNodeMix')  # glTF: baseColorFactor × baseColorTexture
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
            nm.inputs['Strength'].default_value = nstrength
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
    MATS[name] = m
    return m


def pauldron_material():
    m = bpy.data.materials.new('pauldron')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    ti = nt.nodes.new('ShaderNodeTexImage')
    ti.image = TEX['pauldron']
    ti.extension = 'EXTEND'
    nt.links.new(ti.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.45
    bsdf.inputs['Metallic'].default_value = 0.35
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = TEX['metal'][1]
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = 0.6
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


# colours picked off the reference photos
M = dict(
    skin=material('skin', 0xdfab8b, 'skin', 0.55),
    lip=material('lip', 0xb8786a, None, 0.5),
    brow=material('brow', 0x4a3220, None, 0.8),
    eye=material('eye', 0x31465a, None, 0.25),
    scar=material('scar', 0xc48a74, None, 0.6),
    hair=material('hair', 0x75502f, 'hair', 0.55),
    hairLight=material('hairLight', 0x93693f, 'hair', 0.5),
    hairDark=material('hairDark', 0x4d3420, 'hair', 0.6),
    crimson=material('crimson', 0x7e1f2b, 'linen', 0.85),
    navy=material('navy', 0x34467a, 'linen', 0.9, nstrength=1.0),
    knit=material('knit', 0x3c3f42, 'knit', 0.95),
    plate=material('plate', 0x535c5d, 'metal', 0.42, 0.35),
    plateEdge=material('plateEdge', 0x6c7576, 'metal', 0.35, 0.4),
    pauldron=pauldron_material(),
    belt=material('belt', 0x5c3a25, 'leather', 0.5),
    beltDark=material('beltDark', 0x3e2717, 'leather', 0.55),
    glove=material('glove', 0x5f4535, 'leather', 0.55),
    gloveDark=material('gloveDark', 0x46322a, 'leather', 0.6),
    boot=material('boot', 0x3f2a1e, 'leather', 0.45),
    bootDark=material('bootDark', 0x2d1e15, 'leather', 0.5),
    sole=material('sole', 0x161412, None, 0.85),
    silver=material('silver', 0xc6cacd, 'metal', 0.25, 1.0),
    black=material('black', 0x17171a, None, 0.45),
    blade=material('blade', 0xdcefff, None, 0.5, 0, emit=8.0),
)

# ----------------------------------------------------------------------------
# Geometry: parametric surfaces, skinned to the armature


def box_uv(bm, scale):
    """World-size box-projected UVs, so the detail textures have an even density."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = [(co.y * scale, co.z * scale), (co.x * scale, co.z * scale), (co.x * scale, co.y * scale)][ax]


def side_uv(bm, center, size):
    """Planar UVs seen from the model's left (+Y): for the pauldron's crest."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (0.5 - (co.x - center[0]) / size, 0.5 + (co.z - center[1]) / size)


def make(name, bm, mat, weights, smooth=True, subsurf=0, solidify=0.0, bevel=0.0, uvscale=3.0, uv=None, parent=None):
    """bmesh -> a mesh object skinned to the armature. `weights(co)` -> {bone: w}
    (or a bone name for a rigid part). `parent` (an object) instead of skinning."""
    bm.normal_update()
    if uv:
        uv(bm)
    else:
        box_uv(bm, uvscale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
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
        md.levels = md.render_levels = subsurf
    if parent is not None:
        o.parent = parent
        return o
    o.parent = arm
    groups = {}
    for v in me.vertices:
        w = weights if isinstance(weights, str) else weights(v.co)
        if isinstance(w, str):
            w = {w: 1.0}
        tot = sum(x for x in w.values() if x > 1e-4)
        for b, x in w.items():
            if x <= 1e-4:
                continue
            g = groups.get(b) or groups.setdefault(b, o.vertex_groups.new(name=b))
            g.add([v.index], x / tot, 'REPLACE')
    md = o.modifiers.new('rig', 'ARMATURE')
    md.object = arm
    return o


def surface(name, mat, weights, nu, nv, fn, closed=True, cap0=False, cap1=False, **kw):
    """A grid surface: fn(u, v) -> Vector, u round (0..1, closed or open), v along."""
    bm = bmesh.new()
    cols = nu if closed else nu + 1
    grid = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(cols)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            i2 = (i + 1) % cols
            bm.faces.new((grid[j][i], grid[j][i2], grid[j + 1][i2], grid[j + 1][i]))
    if closed and cap0:
        bm.faces.new(list(reversed(grid[0])))
    if closed and cap1:
        bm.faces.new(grid[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)  # pinched poles
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return make(name, bm, mat, weights, **kw)


def tube(name, mat, weights, pts, radii, segs=8, **kw):
    """A tube along a polyline (hair locks, straps, cables), a radius per point."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    rings, prev = [], None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = prev if prev is not None else t.orthogonal().normalized()
        n = (n - t * n.dot(t)).normalized()
        b = t.cross(n)
        prev = n
        rings.append([bm.verts.new(p + (n * math.cos(TAU * k / segs) + b * math.sin(TAU * k / segs)) * radii[i]) for k in range(segs)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return make(name, bm, mat, weights, **kw)


def ellipsoid(name, mat, weights, center, radii, segs=20, rings=12, cut=None, deform=None, **kw):
    """A UV sphere scaled to an ellipsoid; `cut(co)` -> True deletes that vertex,
    `deform(co)` -> co reshapes it (both in the sphere's local, unscaled frame)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        v.co = deform(co) if deform else co
    if cut:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if cut(v.co)], context='VERTS')
    for v in bm.verts:
        v.co += Vector(center)
    return make(name, bm, mat, weights, **kw)


def rbox(name, mat, weights, size, center, rot=None, bevel=0.006, subsurf=0, **kw):
    """A box with rounded edges (buckles, pouches, soles)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.LocRotScale(Vector(center), rot or Quaternion(), Vector(size))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return make(name, bm, mat, weights, smooth=bool(subsurf), bevel=bevel, subsurf=subsurf, **kw)


# --- skin weights -------------------------------------------------------------

def blend(base, extra, k):
    """Mix `extra` (one bone) into a weight dict by k."""
    if k <= 0:
        return base
    out = {b: w * (1 - k) for b, w in base.items()}
    out[extra] = out.get(extra, 0) + k
    return out


def torso_w(co):
    z = co.z
    wc = sstep(1.2, 1.36, z)
    wp = 1 - sstep(0.99, 1.12, z)
    w = {'pelvis': wp, 'spine': max(0.0, 1 - wc - wp), 'chest': wc}
    # the tops of the shoulders follow the arms a little
    k = 0.45 * sstep(0.13, 0.2, abs(co.y)) * sstep(1.42, 1.52, z)
    return blend(w, 'shL' if co.y > 0 else 'shR', k)


def arm_w(s):
    def f(co):
        z = co.z
        e = sstep(1.19, 1.31, z)  # above the elbow
        h = 1 - sstep(0.975, 1.035, z)  # the hand
        w = {'sh' + s: e * (1 - h), 'el' + s: (1 - e) * (1 - h), 'ha' + s: h}
        return blend(w, 'chest', 0.35 * sstep(1.5, 1.6, z))
    return f


def leg_w(s):
    def f(co):
        z = co.z
        k = sstep(0.41, 0.56, z)  # above the knee
        a = 1 - sstep(0.06, 0.13, z)  # the foot
        w = {'hip' + s: k * (1 - a), 'kn' + s: (1 - k) * (1 - a), 'an' + s: a}
        return blend(w, 'pelvis', 0.55 * sstep(0.86, 1.0, z))
    return f


def skirt_w(co):
    """Cloth below the belt: the half over each leg follows that thigh, more
    the lower it hangs (nearly all of it at the hem, so the legs never poke
    through); the front and back middles share both legs. The tunic and the
    tabard over it use the same weights, so one stays inside the other."""
    t = clamp((SKIRT_TOP - co.z) / (SKIRT_TOP - SKIRT_HEM))
    L = sstep(-0.07, 0.07, co.y)
    k = 0.93 * t ** 0.55
    return {'pelvis': 1 - k, 'hipL': k * L, 'hipR': k * (1 - L)}


SKIRT_TOP, SKIRT_HEM = 1.03, 0.47


def neck_w(co):
    z = co.z
    h = sstep(1.64, 1.7, z)
    c = 1 - sstep(1.56, 1.62, z)
    return {'chest': c, 'neck': max(0.0, 1 - h - c), 'head': h}


SIDES = (('L', 1), ('R', -1))  # his left is Blender +Y

# --- torso: the crimson tunic, the navy tabard over it ------------------------
# (z, depth radius, width radius) of the body under the clothes
TORSO = [
    (0.95, 0.104, 0.15), (1.0, 0.104, 0.148), (1.08, 0.099, 0.141), (1.2, 0.108, 0.149), (1.32, 0.118, 0.158),
    (1.42, 0.121, 0.166), (1.5, 0.111, 0.17), (1.55, 0.09, 0.15), (1.585, 0.062, 0.088), (1.6, 0.052, 0.056),
]


def torso_pt(u, z, grow=0.0, p=2.4, gap=0.0):
    """A point on the torso at height z; u runs round from the front (0) via
    his left; `gap` leaves an opening of that half-width at the front."""
    rx, ry = lerp_table(TORSO, z)
    rx, ry = rx + grow, ry + grow
    a0 = math.atan2(gap, rx) if gap else 0.0
    a = a0 + (TAU - 2 * a0) * u
    x, y = superellipse(a, rx, ry, p)
    return Vector((x + 0.004, y, z))


def armor_garments():
    """The Clone Wars look (the Hot Toys figure): tunic, tabard, plate, gloves, boots, belt."""
    surface('tunicTorso', M['crimson'], torso_w, 32, 18, lambda u, v: torso_pt(u, 0.96 + 0.64 * v), cap1=True, uvscale=5)
    # the tabard over the torso: open down the middle, the crimson tunic showing
    surface('tabardTorso', M['navy'], torso_w, 30, 14,
            lambda u, v: torso_pt(u, 0.985 + 0.545 * v, grow=0.011, gap=0.024), closed=False, solidify=0.005, uvscale=5)

    # --- the chest plate: a boxy bib to just under the chest, sloping in over the
    # shoulders to a raised neck ring; its lower edge rises a little at the sides
    PLATE = [
        (1.31, 0.146, 0.188), (1.36, 0.151, 0.193), (1.44, 0.151, 0.199), (1.51, 0.139, 0.206),
        (1.555, 0.115, 0.196), (1.59, 0.09, 0.13), (1.612, 0.079, 0.085),
    ]


    def plate_pt(u, v):
        a = TAU * u
        zb = 1.312 + 0.05 * math.sin(a) ** 2  # the lower edge, higher under the arms
        z = zb + (1.612 - zb) * v
        rx, ry = lerp_table(PLATE, z)
        x, y = superellipse(a, rx, ry, 3.0)
        # a soft centre ridge down the front, a slight bulge over the pectorals
        x += 0.006 * math.exp(-(a if a < math.pi else a - TAU) ** 2 / 0.01) * (1 - v) + 0.004 * math.sin(v * math.pi) * max(0, math.cos(a))
        return Vector((x + 0.004, y, z))


    surface('plate', M['plate'], 'chest', 40, 14, plate_pt, solidify=0.012, subsurf=1, uvscale=3)
    # the rolled lower rim and the raised neck ring
    surface('plateRim', M['plateEdge'], 'chest', 40, 2, lambda u, v: plate_pt(u, 0) * 1.0 + Vector((0, 0, 0.012 * v)) + Vector((math.cos(TAU * u), math.sin(TAU * u), 0)) * 0.006 * math.sin(v * math.pi), uvscale=3)
    surface('neckRing', M['plateEdge'], 'chest', 32, 4, lambda u, v: Vector((0.004 + math.cos(TAU * u) * (0.083 + 0.007 * math.sin(v * math.pi)), math.sin(TAU * u) * (0.088 + 0.007 * math.sin(v * math.pi)), 1.6 + 0.032 * v)), uvscale=3)
    # the knit collar inside it
    surface('collar', M['knit'], neck_w, 28, 6, lambda u, v: Vector((0.006 + math.cos(TAU * u) * 0.064, math.sin(TAU * u) * 0.066, 1.57 + 0.085 * v)), cap1=False, uvscale=8)
    surface('collarFold', M['knit'], neck_w, 28, 2, lambda u, v: Vector((0.006 + math.cos(TAU * u) * (0.066 + 0.005 * math.sin(v * math.pi)), math.sin(TAU * u) * (0.068 + 0.005 * math.sin(v * math.pi)), 1.645 + 0.016 * v)), uvscale=8)


    def cap_pt(cy, zc, r, rz, th0, th1, sector, out=1, grow=0.0):
        """A rounded shoulder cap: part of an ellipsoid centred over the shoulder
        (y = cy, height zc; radius r across, rz up), from polar angle th0 (0 = the
        top) down to its rim at th1, over the outward-facing sector (half-angle)."""
        def fn(u, v):
            a = (u - 0.5) * 2 * sector
            th = th0 + (th1 - th0) * v
            s = math.sin(th) * (r + grow)
            return Vector((math.sin(a) * s * 1.08, cy + out * math.cos(a) * s, zc + math.cos(th) * (rz + grow)))
        return fn


    R118, R100 = math.radians(118), math.radians(100)
    # his right shoulder: the plate's own shoulder piece, a second step under it
    surface('shoulderR0', M['plate'], lambda co: {'chest': 0.4, 'shR': 0.6}, 18, 10,
            cap_pt(-0.198, 1.51, 0.074, 0.08, 0.0, R100, 1.7, out=-1), closed=False, solidify=0.01, subsurf=1)
    surface('shoulderR1', M['plate'], lambda co: {'chest': 0.15, 'shR': 0.85}, 18, 4,
            cap_pt(-0.2, 1.51, 0.08, 0.086, math.radians(92), R118, 1.6, out=-1), closed=False, solidify=0.01, subsurf=1)
    # his left shoulder: the separate pauldron with the crest, strapped to the arm
    surface('pauldron', M['pauldron'], 'shL', 22, 14, cap_pt(0.203, 1.505, 0.08, 0.098, 0.0, R118, 1.9), closed=False,
            solidify=0.011, subsurf=1, uv=lambda bm: side_uv(bm, (0.0, 1.5), 0.16))
    surface('pauldronRim', M['plateEdge'], 'shL', 22, 2, cap_pt(0.203, 1.505, 0.08, 0.098, R118 - 0.06, R118 + 0.02, 1.9, grow=0.006),
            closed=False, solidify=0.004)

    # --- arms: crimson sleeves, long gloves with flared cuffs, fists ----------------
    SLEEVE = [(0.99, 0.038), (1.1, 0.044), (1.2, 0.051), (1.25, 0.053), (1.32, 0.057), (1.45, 0.061), (1.52, 0.063), (1.56, 0.05), (1.578, 0.02)]
    GLOVE = [(0.985, 0.042), (1.0, 0.043), (1.03, 0.044), (1.1, 0.05), (1.15, 0.058), (1.185, 0.068), (1.195, 0.071)]
    for s, sy in SIDES:
        cy = sy * 0.2
        surface('sleeve' + s, M['crimson'], arm_w(s), 18, 22,
                lambda u, v, cy=cy: (lambda z, r: Vector((math.cos(TAU * u) * r, cy + math.sin(TAU * u) * r * (1 + 0.04 * math.sin(TAU * u * 3 + z * 30)), z)))(1.06 + 0.522 * v, lerp_table(SLEEVE, 1.06 + 0.522 * v)[0]),
                cap1=True, uvscale=6)
        # the glove: soft creases round the wrist, the cuff flaring out
        surface('glove' + s, M['glove'], arm_w(s), 20, 12,
                lambda u, v, cy=cy: (lambda z, r: Vector((math.cos(TAU * u) * r * 1.04, cy + math.sin(TAU * u) * r, z)))(0.985 + 0.21 * v, lerp_table(GLOVE, 0.985 + 0.21 * v)[0] * (1 + 0.03 * math.sin(TAU * u * 5 + v * 12) * (1 - v))),
                closed=True, solidify=0.004, uvscale=6)
        surface('gloveCuff' + s, M['gloveDark'], arm_w(s), 20, 2,
                lambda u, v, cy=cy: Vector((math.cos(TAU * u) * 0.073 * 1.04, cy + math.sin(TAU * u) * 0.073, 1.185 + 0.012 * v)), uvscale=6)
        for i, z in enumerate((1.005, 1.022)):  # stitched wrist bands
            surface(f'wristBand{s}{i}', M['gloveDark'], arm_w(s), 20, 1,
                    lambda u, v, cy=cy, z=z: Vector((math.cos(TAU * u) * 0.0455 * 1.04, cy + math.sin(TAU * u) * 0.0455, z + 0.008 * v)), uvscale=6)
        # the fist: a rounded block of knuckles closed on the grip, the thumb over it
        rbox('fist' + s, M['glove'], 'ha' + s, (0.085, 0.056, 0.088), (0.012, cy, 0.94), bevel=0.0, subsurf=2, uvscale=6)
        ellipsoid('thumb' + s, M['glove'], 'ha' + s, (0.04, cy - sy * 0.03, 0.952), (0.03, 0.016, 0.018), segs=12, rings=8, uvscale=6)
        ellipsoid('knuckles' + s, M['gloveDark'], 'ha' + s, (0.05, cy, 0.93), (0.012, 0.03, 0.04), segs=12, rings=8, uvscale=6)

    # --- legs: crimson trousers, tall strapped boots ----------------------------------
    LEG = [(0.38, 0.055), (0.47, 0.058), (0.55, 0.062), (0.7, 0.068), (0.85, 0.077), (0.97, 0.088), (1.04, 0.094)]
    BOOT = [(0.07, 0.057), (0.09, 0.055), (0.13, 0.054), (0.22, 0.06), (0.33, 0.068), (0.42, 0.069), (0.455, 0.074), (0.485, 0.08)]
    surface('hips', M['crimson'], lambda co: blend({'pelvis': 1.0}, 'hipL' if co.y > 0 else 'hipR', 0.5 * (1 - sstep(0.85, 0.98, co.z))), 28, 6,
            lambda u, v: (lambda z: (lambda xy: Vector((xy[0] + 0.004, xy[1], z)))(superellipse(TAU * u, 0.1, 0.146, 2.4)))(1.0 - 0.14 * v), cap1=True, uvscale=6)
    for s, sy in SIDES:
        cy = sy * 0.1
        surface('leg' + s, M['crimson'], leg_w(s), 18, 20,
                lambda u, v, cy=cy, sy=sy: (lambda z, r: Vector((math.cos(TAU * u) * r * 1.05, cy - sy * 0.012 * sstep(0.8, 1.04, z) + math.sin(TAU * u) * r * (1 + 0.04 * math.sin(TAU * u * 3 + z * 20)), z)))(1.04 - 0.66 * v, lerp_table(LEG, 1.04 - 0.66 * v)[0]),
                uvscale=6)
        # the boot shaft: calf bulging behind, a folded top, open at the top
        boot_pt = lambda u, z, grow=0.0, cy=cy: (lambda r: Vector((math.cos(TAU * u) * r * 1.06 - 0.008 * sstep(0.2, 0.33, z) * (1 - sstep(0.33, 0.45, z)), cy + math.sin(TAU * u) * r, z)))(lerp_table(BOOT, z)[0] + grow)
        surface('boot' + s, M['boot'], leg_w(s), 22, 16, lambda u, v, bp=boot_pt: bp(u, 0.07 + 0.415 * v), solidify=0.006, uvscale=6)
        surface('bootFold' + s, M['bootDark'], leg_w(s), 22, 3, lambda u, v, bp=boot_pt: bp(u, 0.425 + 0.06 * v, 0.008 + 0.004 * math.sin(v * math.pi)), solidify=0.005, uvscale=6)
        # two straps round the shaft (sloping down towards the front) and one at the ankle, buckled outside
        for i, (z, tilt) in enumerate(((0.37, 0.016), (0.27, 0.016), (0.115, 0.0))):
            surface(f'strap{s}{i}', M['bootDark'], leg_w(s), 22, 1,
                    lambda u, v, bp=boot_pt, z=z, tilt=tilt: bp(u, z - tilt * math.cos(TAU * u) + 0.024 * v, 0.006), uvscale=6)
            r = lerp_table(BOOT, z)[0] + 0.009
            rbox(f'buckle{s}{i}', M['silver'], leg_w(s), (0.018, 0.006, 0.03), (0.0, cy + sy * r, z + 0.012), bevel=0.002)
        # the foot: a rounded toe box on a chunky sole with a heel
        ellipsoid('foot' + s, M['boot'], 'an' + s, (0.045, cy, 0.03), (0.12, 0.052, 0.075), segs=20, rings=12, cut=lambda co: co.z < -0.001,
                  deform=lambda co: Vector((co.x, co.y * (1 - 0.15 * max(0, co.x) / 0.12), co.z * (1 - 0.35 * max(0, co.x) / 0.12))), uvscale=6)
        rbox('sole' + s, M['sole'], 'an' + s, (0.25, 0.108, 0.026), (0.05, cy, 0.017), bevel=0.008)
        rbox('heel' + s, M['sole'], 'an' + s, (0.075, 0.1, 0.02), (-0.03, cy, 0.006), bevel=0.004)

    # --- below the belt: the crimson tunic skirt and the navy tabard over it ----------
    surface('tunicSkirt', M['crimson'], skirt_w, 32, 14,
            lambda u, v: (lambda z, t: (lambda xy: Vector((xy[0] + 0.004, xy[1], z)))(superellipse(TAU * u, 0.108 + 0.04 * t, 0.15 + 0.045 * t, 2.2)))(1.0 - 0.47 * v, v),
            closed=True, solidify=0.005, uvscale=5)


    def tabard_skirt(u, v):
        z = 1.03 - 0.56 * v
        t = v
        rx, ry = 0.118 + 0.065 * t ** 0.9, 0.162 + 0.055 * t ** 0.9
        gap = 0.026 + 0.04 * t  # the front opening widens towards the hem
        a0 = math.atan2(gap, rx)
        a = a0 + (TAU - 2 * a0) * u
        x, y = superellipse(a, rx, ry, 2.3)
        k = 1 + (0.035 * math.sin(a * 14) + 0.012 * math.sin(a * 31 + 1)) * (0.25 + 0.75 * t)  # heavy linen: long pleats
        return Vector((x * k + 0.004, y * k, z))


    surface('tabardSkirt', M['navy'], skirt_w, 44, 16, tabard_skirt, closed=False, solidify=0.007, uvscale=5)

    # --- the belt: wide brown leather, silver buckle (his right), black clip (his left), pouches
    BELT_Z = (0.99, 1.058)


    def belt_pt(u, z, grow=0.0):
        rx, ry = lerp_table(TORSO, z)
        x, y = superellipse(TAU * u, rx + 0.024 + grow, ry + 0.022 + grow, 2.4)
        return Vector((x + 0.004, y, z))


    surface('belt', M['belt'], 'pelvis', 40, 3, lambda u, v: belt_pt(u, BELT_Z[0] + (BELT_Z[1] - BELT_Z[0]) * v), solidify=0.006, uvscale=6)
    for i, z in enumerate((BELT_Z[0] + 0.007, BELT_Z[1] - 0.009)):  # stitched edges
        surface(f'beltStitch{i}', M['beltDark'], 'pelvis', 40, 1, lambda u, v, z=z: belt_pt(u, z + 0.003 * v, 0.0065), uvscale=6)


    def on_belt(a, out=0.0):
        p = belt_pt(a / TAU % 1, sum(BELT_Z) / 2, out)
        return p, Quaternion(Vector((0, 0, 1)), math.atan2(p.y, p.x))


    p, q = on_belt(-0.3, 0.012)
    rbox('buckle', M['silver'], 'pelvis', (0.012, 0.075, 0.056), p, q, bevel=0.004)
    rbox('buckleBar', M['black'], 'pelvis', (0.014, 0.012, 0.042), p + q @ Vector((0.002, 0.012, 0)), q, bevel=0.002)
    p, q = on_belt(0.28, 0.014)
    rbox('clip', M['black'], 'pelvis', (0.02, 0.05, 0.06), p, q, bevel=0.007)
    rbox('clipCatch', M['silver'], 'pelvis', (0.022, 0.024, 0.01), p + q @ Vector((0, 0, 0.012)), q, bevel=0.002)
    for i, a in enumerate((1.2, -1.25, 2.3, -2.25)):
        p, q = on_belt(a, 0.026)
        rbox(f'pouch{i}', M['beltDark'], 'pelvis', (0.042, 0.064, 0.074), p - Vector((0, 0, 0.006)), q, bevel=0.009)
        rbox(f'pouchFlap{i}', M['belt'], 'pelvis', (0.046, 0.068, 0.024), p + q @ Vector((0.003, 0, 0.024)), q, bevel=0.006)

# --- Episode III, the night of Order 66 (after the studio photo): a black
# leather tunic with a high collar and leather tabards down the front, a wide
# black sash under a brown belt with a plain metal buckle, dark trousers, tall
# black boots, a black glove on the mechanical right hand; over it all the
# near-black brown Jedi cloak — open down the front, falling in heavy folds to
# the ankles, wide bell sleeves hanging past the wrists, and the deep hood,
# either raised over the head (Lord Vader) or lying on the shoulders.

DARK = dict(
    cloak=material('cloak', 0x33231b, 'linen', 0.95, nstrength=1.3),
    cloakDark=material('cloakDark', 0x24170f, 'linen', 0.95, nstrength=1.3),
    hoodInner=material('hoodInner', 0x0d0806, None, 1.0),
    tunic=material('tunicBlack', 0x26201d, 'linen', 0.9),
    leather=material('leatherBlack', 0x1b1b1e, 'leather', 0.5, nstrength=0.5),
    sash=material('sash', 0x1c191a, 'linen', 0.9, nstrength=1.2),
    belt=material('beltBrown', 0x553524, 'leather', 0.45),
    knit=material('knitBlack', 0x1a1819, 'knit', 0.95),
    trousers=material('trousers', 0x201b1a, 'linen', 0.9),
    boot=material('bootBlack', 0x19171a, 'leather', 0.45, nstrength=0.5),
    bootDark=material('bootBlackDark', 0x111012, 'leather', 0.4),
    glove=material('gloveBlack', 0x161417, 'leather', 0.38),
)

# the Jedi Knight's tunic (after the Hot Toys figure): dark brown wool, near-black
# leather tabards, a wide dark brown belt, a black pouch, the gauntlet
KNIGHT = dict(
    DARK,
    tunic=material('tunicWool', 0x3f2e25, 'linen', 0.95, nstrength=1.3),
    tunicDark=material('tunicWoolDark', 0x2c1f19, 'linen', 0.95, nstrength=1.3),
    lapel=material('tunicLapel', 0x33241d, 'linen', 0.95),
    knit=material('underTunic', 0x4e3528, 'knit', 0.95),
    leather=material('tabardLeather', 0x2a2a2e, 'leather', 0.4, nstrength=0.6),
    sash=material('sashBrown', 0x35271f, 'linen', 0.9),
    belt=material('beltDark', 0x2f221b, 'leather', 0.45),
    pouch=material('pouchBlack', 0x1c1b1d, 'leather', 0.45),
)

ROBE_TOP, ROBE_HEM = 1.08, 0.05


def robe_w(co):
    """The cloak: like the torso above the waist (its shoulders following the
    arms), below it like a skirt reaching the ankles — each half follows that
    thigh, more the lower it hangs."""
    z = co.z
    t = clamp((ROBE_TOP - z) / (ROBE_TOP - ROBE_HEM))
    L = sstep(-0.09, 0.09, co.y)
    k = 0.9 * t ** 0.6
    low = {'pelvis': 1 - k, 'hipL': k * L, 'hipR': k * (1 - L)}
    up = torso_w(co)
    up = blend(up, 'shL' if co.y > 0 else 'shR', 0.35 * sstep(0.15, 0.23, abs(co.y)) * sstep(1.3, 1.45, z))
    m = sstep(1.0, 1.14, z)
    out = {b: w * (1 - m) for b, w in low.items()}
    for b, w in up.items():
        out[b] = out.get(b, 0) + w * m
    return out


def hood_w(co):
    """The raised hood: its crown turns with the head, the cowl round the neck
    and the drape on the shoulders stay with the chest."""
    z = co.z
    h = sstep(1.6, 1.68, z)
    up = {'head': h}
    rest_ = torso_w(co) if z < 1.6 else {'chest': 1.0}
    for b, w in rest_.items():
        up[b] = up.get(b, 0) + w * (1 - h)
    return up


def strip(name, mat, weights, a0, a1, z0, z1, grow, nu=6, nv=10, table=None, **kw):
    """A panel on the torso between angles a0..a1 (0 = the front, + towards his left), z0 (bottom) .. z1."""
    def fn(u, v):
        z = z0 + (z1 - z0) * v
        rx, ry = lerp_table(table or TORSO, z)
        a = a0 + (a1 - a0) * u
        x, y = superellipse(a, rx + grow, ry + grow, 2.4)
        return Vector((x + 0.004, y, z))
    return surface(name, mat, weights, nu, nv, fn, closed=False, **kw)


# the cloak body: (z, depth radius, width radius, half-width of the front opening)
CLOAK = [
    (0.04, 0.27, 0.33, 0.15), (0.3, 0.245, 0.305, 0.125), (0.6, 0.215, 0.275, 0.1), (0.95, 0.172, 0.228, 0.085),
    (1.12, 0.158, 0.21, 0.08), (1.3, 0.162, 0.218, 0.075), (1.44, 0.163, 0.24, 0.07), (1.51, 0.15, 0.25, 0.064),
    (1.56, 0.12, 0.215, 0.06), (1.6, 0.082, 0.12, 0.056),
]


def cloak_pt(u, v, grow=0.0):
    z = 0.04 + 1.56 * v
    rx, ry, gap = lerp_table(CLOAK, z)
    rx, ry = rx + grow, ry + grow
    a0 = math.atan2(gap, rx)
    a = a0 + (TAU - 2 * a0) * u
    x, y = superellipse(a, rx, ry, 2.2)
    deep = sstep(1.45, 0.3, z)  # the folds deepen towards the hem
    k = 1 + (0.022 + 0.05 * deep) * (0.6 * math.sin(a * 9 + 0.6) + 0.4 * math.sin(a * 16 + 2.1)) * (0.3 + 0.7 * sstep(1.6, 1.2, z))
    # the front edges hang a little forward and heavy; the back a little behind
    return Vector((x * k + 0.004 - 0.02 * deep * (x < 0), y * k, z))


# hood raised: (z, centre x, depth radius, width radius, half-angle of the opening)
HOOD = [
    (1.42, -0.01, 0.195, 0.255, 0.4), (1.5, -0.01, 0.175, 0.228, 0.42), (1.58, -0.006, 0.14, 0.16, 0.48),
    (1.64, 0.0, 0.15, 0.143, 0.6), (1.72, 0.002, 0.168, 0.138, 0.76), (1.8, -0.004, 0.164, 0.133, 0.72),
    (1.87, -0.015, 0.145, 0.118, 0.52), (1.925, -0.03, 0.104, 0.088, 0.3), (1.96, -0.042, 0.05, 0.042, 0.16),
    (1.972, -0.046, 0.008, 0.008, 0.1),
]


def hood_pt(u, v, shrink=0.0):
    z = 1.42 + 0.552 * v
    cx, rx, ry, a0 = lerp_table(HOOD, z)
    a = a0 + (TAU - 2 * a0) * u
    x, y = superellipse(a, rx - shrink, ry - shrink, 2.1)
    low = sstep(1.66, 1.45, z)  # heavy folds in the drape, light ones over the head
    k = 1 + (0.012 + 0.04 * low) * (0.6 * math.sin(a * 8 + 1.0) + 0.4 * math.sin(a * 13 + 0.3))
    return Vector((cx + x * k, y * k, z))


def bell_sleeve(name, s, sy, mat, cuff_mat, scale=1.0, z_top=1.53, cuff=0.955):
    """A wide sleeve, folded, hanging past the wrist and longer behind (so it
    hangs down under the arm when the arm is raised)."""
    cy = sy * 0.2

    def sleeve_pt(u, v):
        a = TAU * u
        back = 0.5 - 0.5 * math.cos(a)  # 1 at the back (-x)
        zc = cuff - 0.06 * back  # the cuff, slanting down behind
        z = z_top + (zc - z_top) * v
        # closed over the shoulder (tucked under the cloak or the tabard), widening to the bell
        r = (0.03 + 0.05 * sstep(0.0, 0.12, v) + 0.075 * v ** 1.6 * scale + 0.02 * back * v ** 2 * scale)
        k = 1 + 0.06 * v * math.sin(a * 6 + v * 3) + 0.03 * math.sin(a * 11)
        return Vector((math.cos(a) * r * k - 0.012 * v, cy + sy * 0.012 * v + math.sin(a) * r * k, z))

    def sleeve_w(co):
        z = co.z
        e = sstep(1.19, 1.31, z)
        return blend({'sh' + s: e, 'el' + s: 1 - e}, 'chest', 0.4 * sstep(z_top - 0.07, z_top, z))
    surface(name, mat, sleeve_w, 24, 18, sleeve_pt, solidify=0.007, uvscale=4)
    surface(name + 'Cuff', cuff_mat, sleeve_w, 24, 1, lambda u, v: sleeve_pt(u, 0.985 + 0.015 * v), uvscale=4)


def knight_sleeves(K):
    """The knight's wide tunic sleeves: the left hanging past the wrist, the
    right pushed up to the elbow over a black gauntlet with three clasps."""
    bell_sleeve('tunicBellL', 'L', 1, K['tunic'], K['tunicDark'], scale=0.8)
    bell_sleeve('tunicBellR', 'R', -1, K['tunic'], K['tunicDark'], scale=0.7, cuff=1.2)
    cy = -0.2
    arm = arm_w('R')
    surface('gauntlet', K['glove'], arm, 20, 8, lambda u, v: Vector((math.cos(TAU * u) * (0.05 + 0.008 * v) * 1.05, cy + math.sin(TAU * u) * (0.05 + 0.008 * v), 1.0 + 0.2 * v)), solidify=0.004, uvscale=6)
    for i, z in enumerate((1.04, 1.1, 1.16)):  # the clasps, on the outside of the forearm
        rbox(f'clasp{i}', M['silver'], arm, (0.022, 0.008, 0.03), (0.0, cy - 0.057, z), None, bevel=0.002)


def robe_garments(hood_up, cloak=True, K=DARK):
    """The Episode III costume: the tunic, tabards, sash and belt; with `cloak`
    the cloak and its hood over them (`hood_up`: raised, else lying on the back);
    without it the Jedi Knight's tunic as worn in battle — wide tunic sleeves,
    the right one pushed up over a gauntlet (palette `K`)."""
    wide = 0.85 if not cloak else 0.62  # the knight's tabards cover more of the chest
    # the tunic, its high collar, the leather tabards over it front and back
    surface('tunicTorso', K['tunic'], torso_w, 32, 18, lambda u, v: torso_pt(u, 0.96 + 0.64 * v), cap1=True, uvscale=5)
    surface('collar', K['knit'], neck_w, 28, 6, lambda u, v: Vector((0.006 + math.cos(TAU * u) * 0.062, math.sin(TAU * u) * 0.064, 1.57 + 0.09 * v)), uvscale=8)
    for s, a0, a1 in (('L', 0.1, wide), ('R', TAU - wide, TAU - 0.1)):
        strip('tabard' + s, K['leather'], torso_w, a0, a1, 1.0, 1.585, 0.012, solidify=0.004, uvscale=5)
    if not cloak:  # the tabards run over the shoulders
        for s_, sy in SIDES:
            rbox('tabardShoulder' + s_, K['leather'], 'chest', (0.25, 0.1, 0.012), (-0.005, sy * 0.115, 1.592), None, bevel=0.003)
    strip('tabardBack', K['leather'], torso_w, math.pi - 0.75, math.pi + 0.75, 1.0, 1.57, 0.012, nu=10, solidify=0.004, uvscale=5)
    # the crossed front: the right flap over the left, from the collar down into the sash
    for s_, sy in SIDES:
        a = math.atan2(-sy * 0.075, -0.45)
        rbox('lapel' + s_, K.get('lapel', K['leather']), torso_w, (0.006, 0.03, 0.46), (0.131, sy * 0.012, 1.36), Quaternion(Vector((1, 0, 0)), a), bevel=0.002)
    # sash and belt with a plain buckle and a small pouch on his right
    def waist_pt(u, z, grow):
        rx, ry = lerp_table(TORSO, z)
        x, y = superellipse(TAU * u, rx + grow, ry + grow, 2.4)
        return Vector((x + 0.004, y, z))
    surface('sash', K['sash'], 'pelvis', 40, 6, lambda u, v: waist_pt(u, 0.955 + 0.17 * v, 0.02 + 0.004 * math.sin(v * math.pi * 3)), solidify=0.006, uvscale=6)
    bz0, bz1 = (1.02, 1.056) if cloak else (1.0, 1.075)  # the knight's belt is wide
    surface('belt', K['belt'], 'pelvis', 40, 2, lambda u, v: waist_pt(u, bz0 + (bz1 - bz0) * v, 0.03), solidify=0.005, uvscale=6)
    p = waist_pt(0, 1.038, 0.036)
    rbox('buckle', M['silver'], 'pelvis', (0.01, 0.06, 0.04), p, None, bevel=0.003)
    rbox('buckleInset', M['black'], 'pelvis', (0.012, 0.038, 0.02), p + Vector((0.002, 0, 0)), None, bevel=0.002)
    p = waist_pt(-0.17, 1.03, 0.05)
    rbox('pouch', K.get('pouch', K['belt']), 'pelvis', (0.04, 0.05, 0.075 if not cloak else 0.06), p, Quaternion(Vector((0, 0, 1)), math.atan2(p.y, p.x)), bevel=0.008)
    # below the sash: the tunic skirt to the knee, the tabards over it
    surface('tunicSkirt', K['tunic'], skirt_w, 32, 12,
            lambda u, v: (lambda z, t: (lambda xy: Vector((xy[0] + 0.004, xy[1], z)))(superellipse(TAU * u, 0.112 + 0.035 * t, 0.152 + 0.04 * t, 2.2)))(0.97 - 0.47 * v, v),
            solidify=0.005, uvscale=5)
    for s, a0, a1 in (('L', 0.08, 0.6), ('R', TAU - 0.6, TAU - 0.08)):
        surface('tabardSkirt' + s, K['leather'], skirt_w, 6, 10,
                lambda u, v, a0=a0, a1=a1: (lambda z, t, a: (lambda xy: Vector((xy[0] + 0.006, xy[1], z)))(superellipse(a, 0.124 + 0.04 * t, 0.162 + 0.045 * t, 2.2)))(0.97 - (0.42 if cloak else 0.47) * v, v, a0 + (a1 - a0) * u),
                closed=False, solidify=0.004, uvscale=5)
    # trousers, tall black boots
    LEG = [(0.38, 0.055), (0.47, 0.058), (0.55, 0.062), (0.7, 0.068), (0.85, 0.077), (0.97, 0.088), (1.04, 0.094)]
    BOOT = [(0.07, 0.057), (0.09, 0.055), (0.13, 0.054), (0.22, 0.06), (0.33, 0.067), (0.44, 0.069), (0.5, 0.074)]
    surface('hips', K['trousers'], lambda co: blend({'pelvis': 1.0}, 'hipL' if co.y > 0 else 'hipR', 0.5 * (1 - sstep(0.85, 0.98, co.z))), 28, 6,
            lambda u, v: (lambda z: (lambda xy: Vector((xy[0] + 0.004, xy[1], z)))(superellipse(TAU * u, 0.1, 0.146, 2.4)))(1.0 - 0.14 * v), cap1=True, uvscale=6)
    for s, sy in SIDES:
        cy = sy * 0.1
        surface('leg' + s, K['trousers'], leg_w(s), 18, 20,
                lambda u, v, cy=cy, sy=sy: (lambda z, r: Vector((math.cos(TAU * u) * r * 1.05, cy - sy * 0.012 * sstep(0.8, 1.04, z) + math.sin(TAU * u) * r, z)))(1.04 - 0.66 * v, lerp_table(LEG, 1.04 - 0.66 * v)[0]),
                uvscale=6)
        boot_pt = lambda u, z, grow=0.0, cy=cy: (lambda r: Vector((math.cos(TAU * u) * r * 1.06, cy + math.sin(TAU * u) * r, z)))(lerp_table(BOOT, z)[0] + grow)
        surface('boot' + s, K['boot'], leg_w(s), 22, 16, lambda u, v, bp=boot_pt: bp(u, 0.07 + 0.43 * v), solidify=0.006, uvscale=6)
        surface('bootTop' + s, K['bootDark'], leg_w(s), 22, 2, lambda u, v, bp=boot_pt: bp(u, 0.48 + 0.022 * v, 0.006), uvscale=6)
        ellipsoid('foot' + s, K['boot'], 'an' + s, (0.045, cy, 0.03), (0.12, 0.052, 0.075), segs=20, rings=12, cut=lambda co: co.z < -0.001,
                  deform=lambda co: Vector((co.x, co.y * (1 - 0.15 * max(0, co.x) / 0.12), co.z * (1 - 0.35 * max(0, co.x) / 0.12))), uvscale=6)
        rbox('sole' + s, M['sole'], 'an' + s, (0.25, 0.108, 0.026), (0.05, cy, 0.017), bevel=0.008)
        rbox('heel' + s, M['sole'], 'an' + s, (0.075, 0.1, 0.02), (-0.03, cy, 0.006), bevel=0.004)
    # arms: tunic sleeves, the black glove on the right, the bare left hand
    SLEEVE = [(0.99, 0.04), (1.1, 0.046), (1.2, 0.052), (1.32, 0.057), (1.45, 0.061), (1.52, 0.063), (1.56, 0.05), (1.578, 0.02)]
    for s, sy in SIDES:
        cy = sy * 0.2
        surface('sleeve' + s, K['tunic'], arm_w(s), 18, 22,
                lambda u, v, cy=cy: (lambda z, r: Vector((math.cos(TAU * u) * r, cy + math.sin(TAU * u) * r, z)))(1.0 + 0.578 * v, lerp_table(SLEEVE, 1.0 + 0.578 * v)[0]),
                cap1=True, uvscale=6)
        hand = K['glove'] if s == 'R' else M['skin']
        if s == 'R':
            surface('glove' + s, K['glove'], arm_w(s), 18, 8, lambda u, v, cy=cy: Vector((math.cos(TAU * u) * 0.046 * 1.04, cy + math.sin(TAU * u) * 0.046, 0.985 + 0.17 * v)),
                    solidify=0.003, uvscale=6)
        rbox('fist' + s, hand, 'ha' + s, (0.085, 0.056, 0.088), (0.012, cy, 0.94), bevel=0.0, subsurf=2, uvscale=6)
        ellipsoid('thumb' + s, hand, 'ha' + s, (0.04, cy - sy * 0.03, 0.952), (0.03, 0.016, 0.018), segs=12, rings=8, uvscale=6)
    if not cloak:
        knight_sleeves(K)
        return
    # the cloak: open front, heavy folds, to the ankles
    surface('cloak', K['cloak'], robe_w, 64, 40, cloak_pt, closed=False, solidify=0.008, uvscale=4)
    # its front edges: a rolled hem down each side
    for s, side in (('L', 0.0), ('R', 1.0)):
        tube('cloakEdge' + s, K['cloakDark'], robe_w, [cloak_pt(side, j / 16, 0.002) for j in range(17)], [0.009] * 17, segs=6, uvscale=6)
    # bell sleeves: wide, folded, hanging past the wrist
    for s_, sy in SIDES:
        bell_sleeve('robeSleeve' + s_, s_, sy, K['cloak'], K['cloakDark'])
    if hood_up:
        # the deep hood: crown over the head, its rim framing the face in shadow,
        # the cowl falling onto the shoulders and the chest
        surface('hood', K['cloak'], hood_w, 48, 30, hood_pt, closed=False, solidify=0.01, uvscale=4)
        surface('hoodInner', K['hoodInner'], hood_w, 40, 20, lambda u, v: hood_pt(u, 0.25 + 0.75 * v, 0.012), closed=False, uvscale=4)
        rim = [hood_pt(0.0, j / 24) for j in range(25)] + [hood_pt(1.0, 1 - j / 24) for j in range(1, 25)]
        tube('hoodRim', K['cloakDark'], hood_w, rim, [0.012] * len(rim), segs=6, uvscale=6)
    else:
        # lowered: a loose cowl round the neck, the hood lying folded on the back
        def cowl(u, v):
            z = 1.5 + 0.12 * v
            a0 = 0.62
            a = a0 + (TAU - 2 * a0) * u
            rx, ry = 0.16 - 0.06 * v, 0.24 - 0.12 * v
            k = 1 + 0.05 * math.sin(a * 8 + v * 2)
            return Vector((math.cos(a) * rx * k - 0.01, math.sin(a) * ry * k, z + 0.02 * math.sin(v * math.pi)))
        surface('cowl', K['cloak'], 'chest', 40, 8, cowl, closed=False, solidify=0.01, uvscale=4)

        def bag(co):  # a scoop of cloth hanging behind the shoulders, the opening upwards
            x, y, z = co.x, co.y, co.z
            return Vector((x - 0.25 * max(0.0, z) * 0.4 + 0.02 * math.sin(y * 30), y * (1 - 0.2 * max(0.0, -z) / 0.13), z))
        ellipsoid('hoodDown', K['cloak'], 'chest', (-0.175, 0, 1.42), (0.06, 0.15, 0.14), segs=24, rings=14,
                  cut=lambda co: co.z > 0.12 and co.x > -0.02, deform=bag, solidify=0.008, uvscale=4)
        ellipsoid('hoodDownFold', K['cloakDark'], 'chest', (-0.16, 0, 1.55), (0.05, 0.14, 0.035), segs=20, rings=8, uvscale=4)


OUTFIT = argv[2] if len(argv) > 2 else 'armor'  # armor | vader (hood raised) | robe (hood down) | tunic
if OUTFIT == 'armor':
    armor_garments()
elif OUTFIT == 'tunic':
    robe_garments(False, cloak=False, K=KNIGHT)
else:
    robe_garments(OUTFIT == 'vader')

# --- head: a longer face, the hair -------------------------------------------------
HC = Vector((0.012, 0, 1.745))  # head centre
HR = (0.097, 0.083, 0.115)  # head radii


def skull(co):
    """Shape a unit-ish ellipsoid into the head: a flatter, narrower face, a
    jaw tapering to the chin, a fuller back of the skull."""
    x, y, z = co.x / HR[0], co.y / HR[1], co.z / HR[2]
    low = max(0.0, -z)
    y *= 1 - 0.3 * low ** 1.4  # the jaw narrows
    if x > 0:
        x = x ** 0.8 * (1 - 0.12 * low)  # a flatter face, the chin a little back
    else:
        x *= 1.06  # the back of the head
    z = z if z > 0 else z * (1 + 0.08 * max(0, x))
    return Vector((x * HR[0], y * HR[1], z * HR[2]))


head = ellipsoid('head', M['skin'], 'head', HC, HR, segs=32, rings=22, deform=lambda co: skull(Vector((co.x, co.y, co.z))), uvscale=8)
neck = surface('neck', M['skin'], neck_w, 16, 6, lambda u, v: Vector((0.01 + math.cos(TAU * u) * 0.047, math.sin(TAU * u) * 0.05, 1.6 + 0.1 * v)), uvscale=8)
# features, set onto the face by casting at it from the front
_bm = bmesh.new()
_bm.from_mesh(head.data)
bvh = BVHTree.FromBMesh(_bm)


def face(y, z, out=0.0):
    hit = bvh.ray_cast(Vector((0.4, y, z)), Vector((-1, 0, 0)))
    return (hit[0] if hit[0] else Vector((HC.x + HR[0], y, z))) + Vector((out, 0, 0))


bm = bmesh.new()  # the nose: a straight bridge to a rounded tip
tip = face(0, 1.708, 0.024)
bridge = face(0, 1.76, -0.004)
nv = [bm.verts.new(v) for v in (bridge, face(0, 1.703, -0.004), tip, face(0.017, 1.708, -0.004), face(-0.017, 1.708, -0.004))]
for f in ((0, 2, 3), (0, 4, 2), (0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4)):
    bm.faces.new([nv[i] for i in f])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
make('nose', bm, M['skin'], 'head', smooth=False, subsurf=1)
for sgn in (1, -1):
    ellipsoid(f'eye{sgn}', M['eye'], 'head', face(sgn * 0.033, 1.752, -0.004), (0.006, 0.012, 0.007), segs=10, rings=6)
    # level brows, or drawn down into a scowl at the inner ends (Lord Vader)
    brow_tilt = sgn * 0.42 if OUTFIT == 'vader' else sgn * 0.12
    rbox(f'brow{sgn}', M['brow'], 'head', (0.008, 0.036, 0.007), face(sgn * 0.034, 1.766 if OUTFIT == 'vader' else 1.772, 0.001), Quaternion(Vector((1, 0, 0)), brow_tilt), bevel=0.002)
    ellipsoid(f'ear{sgn}', M['skin'], 'head', (HC.x - 0.004, sgn * (HR[1] - 0.002), 1.738), (0.014, 0.008, 0.026), segs=10, rings=8)
rbox('mouth', M['lip'], 'head', (0.006, 0.032, 0.006), face(0, 1.672, 0.0), bevel=0.002)
rbox('scar', M['scar'], 'head', (0.003, 0.0025, 0.026), face(-0.038, 1.752, 0.001), Quaternion(Vector((1, 0, 0)), -0.15), bevel=0.0)


def hair_point(alpha, beta, lift):
    """A point on the hair surface: alpha runs from the forehead (≈0.5) up over
    the crown (π/2) to the nape (≈3.8); beta is the side angle; lift adds volume."""
    R = (HR[0] + 0.006 + lift, HR[1] + 0.008 + lift * 0.6, HR[2] + 0.006 + lift)
    cb = math.cos(beta)
    return HC + Vector((-0.004 + R[0] * cb * math.cos(alpha), R[1] * math.sin(beta), R[2] * cb * math.sin(alpha)))


def hairline(beta):
    """Where the hair starts at side angle beta: the forehead, the temples, over the ears."""
    b = min(1.0, abs(beta) / 1.3)
    return 0.95 - 0.95 * b ** 1.4


def nape(beta):
    """Where it ends behind: down to the collar at the back, over the tops of the
    ears at the sides (Episode III: longer, over the ears to the jaw)."""
    b = min(1.0, abs(beta) / 1.3)
    return 4.05 - (0.12 if OUTFIT != 'armor' else 0.45) * b ** 1.6


bm = bmesh.new()  # the shell under the locks
NA, NB = 40, 28
grid = []
for i in range(NB + 1):
    beta = -1.38 + 2.76 * i / NB
    a0, a1 = hairline(beta), nape(beta)
    # (under hair curves the shell lies tight on the scalp, under the strands' roots)
    grid.append([bm.verts.new(hair_point(a0 + (a1 - a0) * j / NA, beta, (0.008 + 0.02 * math.sin(math.pi * j / NA) ** 0.7) if OUTFIT == 'armor' else -0.005)) for j in range(NA + 1)])
for i in range(NB):
    for j in range(NA):
        bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
# (under hair curves: the colour of the hair's mass, so gaps between strands read as hair)
make('hairShell', bm, M['hairDark'] if OUTFIT == 'armor' else material('hairBase', 0x5a3a22, 'hair', 0.6), 'head', solidify=0.008, uvscale=6)
# wavy locks swept back off the forehead: volume on top, lying closer at the sides
hr = np.random.default_rng(8)
# (the Episode III outfits get hair curves instead — build_hair.py, attached at render time)
for i in range(130 if OUTFIT == 'armor' else 0):
    beta = hr.uniform(-1.36, 1.36)
    a0, a1 = hairline(beta), nape(beta)
    front = 1 - min(1, abs(beta) / 1.1)
    start = a0 + hr.uniform(-0.04, 0.12)
    end = a1 - hr.uniform(0.0, 0.45)
    phase = hr.uniform(0, TAU)
    pts, rad = [], []
    for k in range(14):
        t = k / 13
        al = start + (end - start) * t
        lift = 0.03 * front * math.sin(min(1.0, t * 2.2) * math.pi) * (1 - 0.5 * t) + 0.02 * math.sin(t * math.pi) ** 0.7 + 0.006
        b = beta + 0.07 * math.sin(t * math.pi * 3 + phase) * (0.3 + t)  # the waves
        pts.append(hair_point(al, b, lift))
        rad.append((0.012 + 0.006 * front) * (1 - 0.65 * t ** 1.5) + 0.002)
    mat = M['hair'] if hr.random() < 0.6 else M['hairLight'] if hr.random() < 0.6 else M['hairDark']
    tube(f'lock{i}', mat, 'head', pts, rad, segs=7, uvscale=10)
# a wave falling forward over his right temple, curling at the end (as on the figure)
if OUTFIT == 'armor':
    tube('forelock', M['hairLight'], 'head', [hair_point(0.9, -0.25, 0.024), hair_point(0.62, -0.38, 0.03), hair_point(0.42, -0.5, 0.018), hair_point(0.36, -0.42, 0.01)], [0.011, 0.01, 0.008, 0.005], segs=7, uvscale=10)

# --- the lightsaber (its own node, held by the game's IK) and the belt hilt ----------


def hilt(parent, prefix):
    """Anakin's hilt along local +Z: pommel, black ridged grip, neck, emitter shroud."""
    def lathe(name, mat, prof, z0, z1, segs=14, cap0=False, cap1=False, wob=None):
        return surface(prefix + name, mat, None, segs, max(2, int((z1 - z0) * 80)),
                       lambda u, v: (lambda z, r: Vector((math.cos(TAU * u) * r, math.sin(TAU * u) * r, z)))(z0 + (z1 - z0) * v, prof(v) * (wob(v) if wob else 1)),
                       cap0=cap0, cap1=cap1, parent=parent, uvscale=20)
    lathe('pommel', M['silver'], lambda t: 0.024 - 0.004 * t, 0.0, 0.03, cap0=True)
    lathe('grip', M['black'], lambda t: 0.021, 0.03, 0.15, wob=lambda t: 1 + 0.12 * (math.sin(t * math.pi * 14) > 0.4))
    lathe('neck', M['silver'], lambda t: 0.023, 0.15, 0.19)
    lathe('shroud', M['silver'], lambda t: 0.024 + 0.008 * t, 0.19, 0.25, cap1=True)
    rbox(prefix + 'switch', M['black'], None, (0.012, 0.012, 0.025), (0.023, 0, 0.17), bevel=0.002, parent=parent)


def empty(name, parent, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.05
    coll.objects.link(o)
    o.parent = parent
    o.location = loc
    o.rotation_mode = 'QUATERNION'
    return o


saber = empty('saber', arm)
saber_ax = empty('saberAxis', saber, (-0.13, 0, 0))  # the hilt is modelled along +Z; the game's saber points along +X
saber_ax.rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.pi / 2)
hilt(saber_ax, 'hilt_')
surface('blade', M['blade'], None, 10, 12, lambda u, v: Vector((math.cos(TAU * u) * (0.022 - 0.004 * v), math.sin(TAU * u) * (0.022 - 0.004 * v), 0.26 + v)), cap1=True, parent=saber_ax)
empty('saberBase', saber, (0.14, 0, 0))
empty('saberTip', saber, (1.13, 0, 0))
# with the blade off the hilt hangs straight down from a clip on the front of
# the belt, just to his left of the buckle, emitter down (as on the figure)
belt_hilt = empty('beltHilt', arm)
belt_hilt.parent_type = 'BONE'
belt_hilt.parent_bone = 'pelvis'
pel_tail = arm_data.bones['pelvis'].tail_local
belt_hilt.location = REST['pelvis'] + (G(0.205, -0.07, -0.06) if OUTFIT == 'armor' else G(0.07, -0.08, 0.2)) - pel_tail  # relative to the bone's tail
belt_hilt.rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.pi / 2)  # the hilt's +X (emitter) points down
bh = empty('beltHiltAxis', belt_hilt, (-0.13, 0, 0))
bh.rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.pi / 2)
hilt(bh, 'belt_')
rbox('beltClip', M['black'], None, (0.03, 0.04, 0.03), (-0.14, 0, 0), bevel=0.004, parent=belt_hilt)

# ----------------------------------------------------------------------------
# Animations: one action per game animation, keying every bone, the saber
# and the belt hilt (visibility by scale)

anim_ids = [arm, saber, belt_hilt]
for o in anim_ids:
    o.animation_data_create()
for name, a in data['anims'].items():
    act = bpy.data.actions.new(name)
    for o in anim_ids:
        o.animation_data.action = act
    for f, fr in enumerate(a['frames']):
        for jn, v in fr['j'].items():
            pb = arm.pose.bones[jn]
            pb.location = G(v[0], v[1], v[2]) - G(*JOINTS[jn]['pos'])
            pb.rotation_quaternion = GQ(v[3], v[4], v[5], v[6])
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('rotation_quaternion', frame=f)
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
    for o in anim_ids:
        tr = o.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        o.animation_data.action = None

# the rest pose for the export's base state
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
saber.rotation_quaternion = (1, 0, 0, 0)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,
    # keep every channel of every animation, constant ones too: a pose that
    # holds a joint still must still set it (or it keeps the previous pose)
    export_optimize_animation_size=False,
    export_optimize_animation_keep_anim_object=True,
    export_apply=True,  # modifiers (subdivision, thickness, bevels) baked in; the armature stays a skin
    export_yup=True,
)
meshes = [o for o in coll.objects if o.type == 'MESH']
print(f'exported {OUT}: {len(meshes)} meshes, {sum(len(o.data.polygons) for o in meshes)} base faces, {len(data["anims"])} animations')
