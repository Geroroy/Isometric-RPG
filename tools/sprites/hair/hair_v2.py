"""
Anakin's hair as a mesh, after The Clone Wars Season 7 (reference/anakin_hair/), for the
Episode III outfits (tunic, robe — build_anakin.py), replacing the render-time hair curves
(build_hair.py); the Clone Wars armour keeps its own hair. Thick wavy clumps
layered over each other — the sides and back down to the jaw and mid-neck, the outer layer's
ends flicking out, volume on the crown and the back of the head narrowing downwards, a parting
on his left with a big wave swept across the forehead to his right and a lock or two falling
onto it. Cel-shaded look: chunky clumps, no strands.

  python hair_v2.py IN.glb OUT.glb [params.json] [backup.blend]

Opens IN.glb (an outfit of build_anakin.py), saves its hair meshes (hairShell — and lock*,
forelock where there are any) to backup.blend and removes them, then builds the new hair from guide curves on the
scalp: each group of hair_v2_params.json spreads n clumps between root and end ranges; every
clump is a tube with a lens-shaped section (convex on top, flat below) along its guide, wide in
the middle and tapering to a point, with a wave, a volume lift and a flick at the end. Under the
clumps a tight dark shell hides the scalp between them. The hair is skinned to the 'head' bone
(weight 1), like the rest of the head. Everything else in the file is exported unchanged.
Prints the triangle counts (the old hair mesh, the new hair). The outfits' old hair is mostly
render-time curves (~10,000 strands) over a 4,752-triangle shell, so the budget is taken against
the heaviest hair mesh of the set, the Clone Wars armour's (29,764 triangles; limit 1.5x).
"""
import builtins
import functools
import json
import math
import os
import random
import sys

import bpy  # noqa: I001
from mathutils import Vector

print = functools.partial(builtins.print, flush=True)  # noqa: A001
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, DST = argv[0], argv[1]
PARAMS = argv[2] if len(argv) > 2 else os.path.join(HERE, 'hair_v2_params.json')
BACKUP = argv[3] if len(argv) > 3 else os.path.splitext(SRC)[0] + '_hair_v1_backup.blend'
P = json.load(open(PARAMS))
TAU = math.tau

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


# --- 1. back up and remove the old hair ----------------------------------------------
old = [o for o in scene.objects if o.type == 'MESH' and (o.name.startswith(('hairShell', 'lock', 'forelock')))]
old_tris = sum(tris(o) for o in old)
data = set(old) | {o.data for o in old} | {m for o in old for m in o.data.materials if m}
bpy.data.libraries.write(BACKUP, data, fake_user=True)
print(f'HAIR old: {len(old)} objects, {old_tris} triangles -> backup {BACKUP}')
for o in old:
    bpy.data.objects.remove(o, do_unlink=True)

# --- 2. the head's frame --------------------------------------------------------------
C = Vector(P['head']['centre'])
R = Vector(P['head']['radii'])
TH_H = P['hang_theta']


def env(th, ph, lift):
    """A point of the hair envelope round the head (theta from the crown, phi round)."""
    return C + Vector(((R.x + lift) * math.sin(th) * math.cos(ph), (R.y + lift) * math.sin(th) * math.sin(ph), (R.z + lift) * math.cos(th)))


def guide(th, ph, lift):
    """The envelope above the hang line; below it the hair falls straight down, tucking in a little."""
    if th <= TH_H:
        return env(th, ph, lift)
    top = env(TH_H, ph, lift)
    d = (th - TH_H) * R.z
    rad = Vector((top.x - C.x, top.y - C.y, 0))
    k = 1 - P['hang_taper'] * min(1.0, d / 0.12) * 0.5
    return Vector((C.x + rad.x * k, C.y + rad.y * k, top.z - d))


def smooth(t):
    return t * t * (3 - 2 * t)


# --- 3. the texture: dark base, a warm highlight along the top of each clump ---------
def hexrgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


PAL = {k: hexrgb(v) for k, v in P['palette'].items() if not k.startswith('_')}
TW, TH = 64, 256
img = bpy.data.images.new('hairV2_albedo', TW, TH)
px = [0.0] * (TW * TH * 4)
rnd = random.Random(7)
streak = [rnd.uniform(-1, 1) for _ in range(TW)]
for y in range(TH):
    v = y / (TH - 1)  # 0 = the root, 1 = the tip
    for x in range(TW):
        u = x / TW  # round the section: 0.25 = the top of the clump, 0.75 = underneath
        top = max(0.0, math.cos((u - 0.25) * TAU))  # 1 on top, 0 on the flanks and below
        hl = top ** 3 * (0.35 + 0.65 * math.sin(math.pi * min(1, v * 1.3)) ** 0.8)  # the sheen, strongest mid-length
        s = 0.06 * streak[x] + 0.04 * math.sin(v * 40 + streak[x] * 3)  # faint strand streaks
        c = [PAL['base'][i] + (PAL['mid'][i] - PAL['base'][i]) * top * 0.8 for i in range(3)]
        c = [c[i] + (PAL['highlight'][i] - c[i]) * hl * 0.85 for i in range(3)]
        under = max(0.0, -math.cos((u - 0.25) * TAU))
        c = [c[i] + (PAL['shadow'][i] - c[i]) * under * 0.7 for i in range(3)]
        rt = max(0.0, 1 - v / 0.18)  # darker roots
        c = [c[i] + (PAL['root'][i] - c[i]) * rt * 0.6 for i in range(3)]
        c = [min(1, max(0, ci * (1 + s))) for ci in c]
        o = (y * TW + x) * 4
        px[o:o + 4] = [c[0], c[1], c[2], 1.0]
img.pixels = px
img.pack()


def make_mat(name, image=None, color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.62
    if image:
        ti = nt.nodes.new('ShaderNodeTexImage')
        ti.image = image
        ti.interpolation = 'Linear'
        nt.links.new(ti.outputs['Color'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*color, 1)
    return m


MAT = make_mat('hairV2', img)
MAT_BASE = make_mat('hairV2Base', color=[c ** 2.2 for c in PAL['base']])  # the mass between the clumps reads as hair

# --- 4. the clumps --------------------------------------------------------------------
SEG = P['segments']
SIDES = P['sides']
verts, faces, uvs = [], [], []


def clump(root, end, g, rng, alt=0):
    """One clump from root (theta, phi) to end (theta, phi): its guide, then the section swept along it."""
    (t0, p0), (t1, p1) = root, end
    phase = rng.uniform(0, TAU)
    amp = g['wave_amp'] * rng.uniform(0.7, 1.3)
    wid = g['width'] * rng.uniform(0.82, 1.15)
    thk = g['thick'] * rng.uniform(0.85, 1.1)
    lift0 = g['lift'] * rng.uniform(0.85, 1.15) + alt * P.get('layer_step', 0.0)  # every other clump a step higher: clean overlaps
    pts = []
    for k in range(SEG + 1):
        t = k / SEG
        th = t0 + (t1 - t0) * t
        # the sideways sweep happens on the head; below the hang line it falls straight
        on_head = min(1.0, (th - t0) / max(1e-4, min(t1, TH_H) - t0)) if t1 > t0 else t
        ph = p0 + (p1 - p0) * smooth(min(1.0, on_head))
        vol = g['volume'] * math.sin(math.pi * min(1.0, t * 1.6)) * (1 - 0.6 * t)  # volume near the root, less down the length
        # the root is sunk into the scalp and the clump rises out of it over the first stretch, so no
        # open end shows where a lower layer starts under the one above
        rise = smooth(min(1.0, t / P.get('root_rise', 0.15)))
        pts.append(guide(th, ph, (lift0 + vol) * rise - thk * 0.7 * (1 - rise)))
    # wave and flick: offsets across the clump (on the surface) and outwards
    out = []
    for k, p in enumerate(pts):
        t = k / SEG
        tan = (pts[min(SEG, k + 1)] - pts[max(0, k - 1)]).normalized()
        radial = Vector((p.x - C.x, p.y - C.y, (p.z - C.z) if p.z > C.z - 0.03 else 0)).normalized()
        side = tan.cross(radial).normalized()
        w = amp * math.sin(TAU * g['wave_freq'] * t + phase) * math.sin(math.pi * t) ** 0.6
        f0 = 1 - g['flick_len']
        fl = g['flick'] * (max(0.0, t - f0) / g['flick_len']) ** 2 if t > f0 else 0.0
        out.append(p + side * w + radial * (fl + 0.4 * abs(w)) + Vector((0, 0, fl * P.get('flick_up', 0.5))))
    # the section along the guide
    base = len(verts)
    twist = rng.uniform(-0.25, 0.25)
    side = None
    for k, p in enumerate(out):
        t = k / SEG
        tan = (out[min(SEG, k + 1)] - out[max(0, k - 1)]).normalized()
        if side is None:
            radial = Vector((p.x - C.x, p.y - C.y, (p.z - C.z) if p.z > C.z - 0.03 else 0)).normalized()
            side = tan.cross(radial).normalized()
        else:
            # carried along the clump (parallel transport): where a flicked tip turns outwards the
            # tangent lines up with the radial and a fresh cross product would flip the section
            side = (side - tan * side.dot(tan)).normalized()
        up = side.cross(tan).normalized()
        # wide through the middle, a rounded end (tip_width of the widest) closed by a last small ring
        tw = P.get('tip_width', 0.0)
        rw = P.get('root_width', 0.62)  # the clump's width at the root, of its widest
        shape = (rw + (1 - rw) * math.sin(math.pi * min(1.0, t * 1.4))) * (tw + (1 - tw) * (1 - t ** 2.6) ** 0.85)
        if k == SEG:
            shape *= P.get('tip_close', 0.35)
        if k == 0:
            shape *= 0.5  # the sunk root, pinched
        W = wid * shape + 0.0015
        Th = thk * shape + 0.001
        a0 = twist * t
        for s in range(SIDES):
            a = TAU * s / SIDES + a0
            ca, sa = math.cos(a), math.sin(a)
            h = sa if sa > 0 else sa * 0.35  # convex on top, flatter underneath
            verts.append(p + side * (ca * W / 2) + up * (h * Th / 2))
            uvs.append((s / SIDES, t))
    for k in range(SEG):
        for s in range(SIDES):
            a = base + k * SIDES + s
            b = base + k * SIDES + (s + 1) % SIDES
            faces.append((a, b, b + SIDES, a + SIDES))


rng = random.Random(11)
for g in P['groups']:
    n = g['n']
    for i in range(n):
        f = (i + 0.5) / n
        jit = rng.uniform(-0.35, 0.35) / n
        rp = g['root_phi'][0] + (g['root_phi'][1] - g['root_phi'][0]) * min(1, max(0, f + jit))
        rt = rng.uniform(*g['root_theta'])
        if 'end_phi' in g:
            ep = g['end_phi'][0] + (g['end_phi'][1] - g['end_phi'][0]) * f + rng.uniform(-0.05, 0.05)
        else:
            ep = rp + g.get('sweep', 0.0) + rng.uniform(-0.06, 0.06)
        et = rng.uniform(*g['end_theta'])
        clump((rt, rp), (et, ep), g, rng, i % 2)


def mesh_object(name, vs, fs, uv, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in vs], [], fs)
    me.update()
    lay = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            lay.data[li].uv = uv[vi]
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    # skinned to the head bone, like the rest of the head
    o.parent = arm
    vg = o.vertex_groups.new(name='head')
    vg.add(list(range(len(vs))), 1.0, 'REPLACE')
    md = o.modifiers.new('arm', 'ARMATURE')
    md.object = arm
    return o


hair = mesh_object('hairV2', verts, faces, uvs, MAT)

# --- 5. the shell under the clumps: tight on the scalp, hanging a little at the back --
S = P['shell']
sv, sf, su = [], [], []
NU, NV = S['nu'], S['nv']
for i in range(NU + 1):
    ph = -math.pi + TAU * i / NU
    front = max(0.0, math.cos(ph))
    tmax = S.get('front_hairline', 1.05) + 0.6 * (1 - front) ** 0.8  # the hairline: high at the forehead, low behind
    for j in range(NV + 1):
        th = 0.02 + (tmax - 0.02) * j / NV
        p = guide(min(th, TH_H + S['hang'] * (1 - front) / R.z), ph, S['lift'])
        sv.append(p)
        su.append((i / NU, j / NV))
for i in range(NU):
    for j in range(NV):
        a = i * (NV + 1) + j
        b = (i + 1) * (NV + 1) + j
        sf.append((a, a + 1, b + 1, b))
shell = mesh_object('hairV2Shell', sv, sf, su, MAT_BASE)

new_tris = tris(hair) + tris(shell)
BUDGET = max(old_tris, P.get('budget_ref_tris', 29764))
print(f'HAIR new: {len(P["groups"])} groups, {sum(g["n"] for g in P["groups"])} clumps, {new_tris} triangles '
      f'({new_tris / BUDGET:.2f}x the reference hair mesh of {BUDGET}; limit 1.5x)')
if new_tris > BUDGET * 1.5:
    print('HAIR WARNING: over the polygon budget')

bpy.ops.export_scene.gltf(
    filepath=DST, export_format='GLB', export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_optimize_animation_size=False, export_optimize_animation_keep_anim_object=True,
    export_apply=True, export_yup=True)
print('HAIR wrote', DST)
os._exit(0)
