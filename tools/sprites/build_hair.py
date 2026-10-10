"""
Anakin's Revenge of the Sith hair as Blender hair curves, after the Hot Toys
figure photos: shoulder-length, layered, loose thick waves, an off-centre
parting on his right, long tousled bangs swept across the forehead to his
left, full sides over the ears, the ends flicking out at the collar; warm
medium brown with caramel highlights and darker roots.

  python build_hair.py out/anakin_hair.blend [ep3|hood]

Built the procedural way: about a hundred and forty guide curves are laid on
a scalp mesh (the head of build_anakin.py), then the Essentials hair node
groups run as a modifier stack — Interpolate Hair Curves (thousands of
children between the guides), Clump (strand clumps), Curl (the waves), Frizz
(very slight), Set Hair Curve Profile (thickness, tapered tips). The
procedural object is kept in the file ('hairGN', with its guides and scalp);
'hair' is the same stack applied — plain curves, no surface to follow, so a
render can parent it to the head bone (render_sprites.py --hair) and it moves
with every animation. `hood`: the hair tucked inside a raised hood (shorter,
closer to the head).

Material: Principled Hair BSDF (Cycles), melanin-based, the roots darker and
one strand in three lighter; a Principled BSDF stand-in on the EEVEE output.
"""
import math
import os
import random
import sys

import bpy  # noqa: I001
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = argv[0] if argv else os.path.join(os.path.dirname(__file__), 'out', 'anakin_hair.blend')
STYLE = argv[1] if len(argv) > 1 else 'ep3'
HOOD = STYLE == 'hood'
TAU = math.tau

# the head of build_anakin.py (Blender space: +X forward, +Y his left, +Z up)
C = Vector((0.008, 0, 1.745))  # centre
R = Vector((0.103, 0.09, 0.121))  # the scalp: skull radii plus skin
PART = -0.34  # the parting's azimuth (0 = the front, + towards his left): on his right


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def sstep(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def theta_max(phi):
    """The hairline: the forehead in front, over the ears, the nape behind."""
    b = (1 - math.cos(phi)) / 2  # 0 front .. 1 back
    return 0.78 + 1.32 * b ** 0.85


TH0 = 0.06


def scalp_pt(u, v, lift=0.0):
    """u round (0 = the back, via his right, 0.5 = the front), v from the crown to the hairline."""
    phi = -math.pi + TAU * u
    th = TH0 + (theta_max(phi) - TH0) * v
    return sph(th, phi, lift), th, phi


def sph(th, phi, lift=0.0):
    return C + Vector(((R.x + lift) * math.sin(th) * math.cos(phi), (R.y + lift) * math.sin(th) * math.sin(phi), (R.z + lift) * math.cos(th)))


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection

# --- the scalp: a grid in (u, v) with matching UVs, where the hair grows ------
NI, NJ = 48, 14
me = bpy.data.meshes.new('scalp')
verts, faces, uvs = [], [], []
for j in range(NJ + 1):
    for i in range(NI + 1):
        verts.append(scalp_pt(i / NI, j / NJ)[0])
for j in range(NJ):
    for i in range(NI):
        a = j * (NI + 1) + i
        faces.append((a, a + 1, a + NI + 2, a + NI + 1))
me.from_pydata(verts, [], faces)
uv = me.uv_layers.new(name='UVMap')
for poly in me.polygons:
    for li in poly.loop_indices:
        vi = me.loops[li].vertex_index
        uv.data[li].uv = ((vi % (NI + 1)) / NI, (vi // (NI + 1)) / NJ)
scalp = bpy.data.objects.new('scalp', me)
coll.objects.link(scalp)
scalp.hide_render = True

# --- guides ------------------------------------------------------------------
rng = random.Random(7)


def resample(pts, n):
    """Points evenly spaced along the polyline."""
    d = [0.0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + (b - a).length)
    out = []
    for k in range(n):
        s = d[-1] * k / (n - 1)
        i = max(0, min(len(pts) - 2, next((i for i in range(len(d) - 1) if d[i + 1] >= s), len(d) - 2)))
        t = (s - d[i]) / max(1e-9, d[i + 1] - d[i])
        out.append(pts[i].lerp(pts[i + 1], t))
    return out


def guide(u, v, bang=False):
    """One guide from its root on the scalp: across the head's surface, lifted
    for volume, to below the ears; then hanging to just above the shoulders,
    the end flicking out. Bangs instead sweep over the forehead to his left."""
    root, th0, phi0 = scalp_pt(u, v)
    front = max(0.0, math.cos(phi0))  # 1 at the front .. 0 at the sides and back
    vol = (0.022 if HOOD else 0.034) + 0.012 * rng.random()
    side = 1 if phi0 > PART else -1  # which way off the parting
    hairline = v > 0.55
    if bang:
        # the long bangs: down over the forehead, across to his left temple, past the eye to the cheek
        way = [(th0, phi0), (th0 + 0.32, phi0 + 0.16), (1.3 + 0.12 * rng.random(), phi0 + 0.42), (1.62, min(1.3, phi0 + 0.85))]
        th_hang, phi_hang = 1.6, min(1.3, phi0 + 0.85)
        lift = [0.006, vol * 0.8, 0.009, 0.022]
    else:
        th_hang = 1.78 + 0.08 * rng.random()
        if abs(phi0) < 1.35:
            # the front half: off the parting, over the top and down the side,
            # never in front of the face — the hair frames it
            phi_hang = side * max(abs(phi0) + 0.35, 1.3) + rng.uniform(-0.06, 0.06)
            th_mid = max(th0 + 0.15, 0.75)
            way = [(th0, phi0), (th_mid, phi0 + (phi_hang - phi0) * 0.45), (min(1.25, th_mid + 0.35), phi_hang * 0.92), (th_hang, phi_hang)]
        else:
            phi_hang = phi0 + rng.uniform(-0.08, 0.08)
            way = [(th0, phi0), (th0 + (th_hang - th0) * 0.35, phi0), (th0 + (th_hang - th0) * 0.75, phi_hang), (th_hang, phi_hang)]
        crown = 1 - sstep(0.15, 0.5, v)  # the crown's strands lie flatter over the top
        lift = [0.004, vol * (1 - 0.4 * crown), vol * 1.05, vol * 1.12]
    pts = []
    for k in range(len(way) - 1):  # along the head
        for s in range(6):
            t = s / 6
            th = way[k][0] + (way[k + 1][0] - way[k][0]) * t
            phi = way[k][1] + (way[k + 1][1] - way[k][1]) * t
            li = lift[k] + (lift[k + 1] - lift[k]) * (t * t * (3 - 2 * t))
            pts.append(sph(th, phi, li))
    top = sph(way[-1][0], way[-1][1], lift[-1])
    pts.append(top)
    # hanging: layered lengths (the crown's layers end higher), to just above the shoulders
    layer = 1 - v
    if HOOD:
        z_end = 1.64 + 0.03 * layer + 0.02 * rng.random()
    else:
        z_end = 1.565 + 0.07 * layer + 0.025 * rng.random() + 0.03 * front
    out = Vector((top.x - C.x, top.y, 0)).normalized()
    hang = max(0.0, top.z - z_end)
    for s in range(1, 9):
        t = s / 8
        flick = sstep(0.7, 1.0, t)  # the ends flip outwards
        drift = (0.012 if HOOD else 0.02) * t + (0.0 if HOOD else 0.018) * flick
        pts.append(top + out * drift - Vector((0, 0, hang * t - (0.012 * flick if not HOOD else 0))))
    return resample(pts, 18), (u, v)


guides = []
for k in range(20):  # the bangs: from the front of the crown, left of the parting
    phi = PART + 0.06 + 0.95 * k / 19
    u = (phi + math.pi) / TAU
    guides.append(guide(u, 0.6 + 0.35 * rng.random(), bang=True))
for j in range(6):
    v = 0.12 + 0.86 * j / 5
    n = 14 + 5 * j
    for i in range(n):
        u = (i + 0.5 * (j % 2) + rng.uniform(-0.2, 0.2)) / n
        guides.append(guide(u % 1.0, v))

hc = bpy.data.hair_curves.new('hairGuides')
hc.add_curves([len(g[0]) for g in guides])
flat = [c for g in guides for p in g[0] for c in p]
hc.position_data.foreach_set('vector', flat)
uvatt = hc.attributes.new('surface_uv_coordinate', 'FLOAT2', 'CURVE')
uvatt.data.foreach_set('vector', [c for g in guides for c in g[1]])
hc.surface_uv_map = 'UVMap'
hair = bpy.data.objects.new('hairGN', hc)
coll.objects.link(hair)
hc.surface = scalp

# --- the Essentials hair node groups, as a modifier stack ------------------------
LIB = os.path.join(bpy.utils.resource_path('LOCAL'), 'datafiles', 'assets', 'nodes', 'procedural_hair_node_assets.blend')
WANT = ['Interpolate Hair Curves', 'Clump Hair Curves', 'Curl Hair Curves', 'Frizz Hair Curves', 'Set Hair Curve Profile']
with bpy.data.libraries.load(LIB) as (src, dst):
    dst.node_groups = [n for n in src.node_groups if n in WANT]


def gn(name, group, **inputs):
    m = hair.modifiers.new(name, 'NODES')
    m.node_group = bpy.data.node_groups[group]
    ids = {it.name: it.identifier for it in m.node_group.interface.items_tree if it.item_type == 'SOCKET' and it.in_out == 'INPUT'}
    for k, val in inputs.items():
        getattr(m.properties.inputs, ids[k]).value = val  # (Blender 5: the modifier's inputs are typed properties)
    return m


gn('interpolate', 'Interpolate Hair Curves', **{'Resting Surface': False, 'Interpolation Guides': 4, 'Density': 170000.0 if not HOOD else 120000.0, 'Seed': 3})
gn('clump', 'Clump Hair Curves', **{'Factor': 0.4, 'Shape': 0.65, 'Tip Spread': 0.001, 'Existing Guide Map': False, 'Guide Distance': 0.012, 'Preserve Length': True, 'Seed': 4})
gn('curl', 'Curl Hair Curves', **{'Factor': 1.0, 'Subdivision': 1, 'Curl Start': 0.25, 'Radius': 0.012 if not HOOD else 0.007, 'Factor Start': 0.5, 'Factor End': 0.6,
                                   'Frequency': 2.3, 'Random Offset': 0.5, 'Existing Guide Map': False, 'Guide Distance': 0.014, 'Seed': 5})
gn('frizz', 'Frizz Hair Curves', **{'Factor': 0.2, 'Distance': 0.001, 'Shape': 0.6, 'Preserve Length': True, 'Seed': 6})
gn('profile', 'Set Hair Curve Profile', **{'Radius': 0.0016, 'Shape': 0.45, 'Factor Min': 0.3, 'Factor Max': 1.0})

# --- the material ---------------------------------------------------------------
mat = bpy.data.materials.new('hair')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
info = nt.nodes.new('ShaderNodeHairInfo')
# Cycles: Principled Hair BSDF (Chiang), melanin; darker at the roots, caramel streaks
ph = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
ph.parametrization = 'MELANIN'
ph.inputs['Melanin Redness'].default_value = 0.78
ph.inputs['Roughness'].default_value = 0.34
ph.inputs['Radial Roughness'].default_value = 0.42
ph.inputs['Coat'].default_value = 0.12
ph.inputs['Random Roughness'].default_value = 0.15
ph.inputs['Random Color'].default_value = 0.12
streak = nt.nodes.new('ShaderNodeMath')  # 1 for a third of the strands
streak.operation = 'GREATER_THAN'
streak.inputs[1].default_value = 0.66
nt.links.new(info.outputs['Random'], streak.inputs[0])
root = nt.nodes.new('ShaderNodeMapRange')  # 1 at the root .. 0 from a fifth of the way along
root.inputs['From Min'].default_value = 0.0
root.inputs['From Max'].default_value = 0.22
root.inputs['To Min'].default_value = 1.0
root.inputs['To Max'].default_value = 0.0
nt.links.new(info.outputs['Intercept'], root.inputs['Value'])
mel = nt.nodes.new('ShaderNodeMath')  # melanin = 0.6 − 0.17·streak + 0.22·root
mel.operation = 'MULTIPLY_ADD'
nt.links.new(streak.outputs[0], mel.inputs[0])
mel.inputs[1].default_value = -0.17
mel.inputs[2].default_value = 0.6
mel2 = nt.nodes.new('ShaderNodeMath')
mel2.operation = 'MULTIPLY_ADD'
nt.links.new(root.outputs['Result'], mel2.inputs[0])
mel2.inputs[1].default_value = 0.22
nt.links.new(mel.outputs[0], mel2.inputs[2])
nt.links.new(mel2.outputs[0], ph.inputs['Melanin'])
out_c = nt.nodes.new('ShaderNodeOutputMaterial')
out_c.target = 'CYCLES'
nt.links.new(ph.outputs[0], out_c.inputs['Surface'])
# EEVEE (no hair BSDF there): a Principled BSDF with the same colours by the same rules
ramp = nt.nodes.new('ShaderNodeMix')
ramp.data_type = 'RGBA'
ramp.inputs[6].default_value = (0.085, 0.046, 0.022, 1)  # medium brown (linear)
ramp.inputs[7].default_value = (0.19, 0.105, 0.045, 1)  # caramel
nt.links.new(streak.outputs[0], ramp.inputs[0])
dark = nt.nodes.new('ShaderNodeMix')
dark.data_type = 'RGBA'
nt.links.new(root.outputs['Result'], dark.inputs[0])
nt.links.new(ramp.outputs[2], dark.inputs[6])
dark.inputs[7].default_value = (0.045, 0.025, 0.014, 1)  # the roots
pb = nt.nodes.new('ShaderNodeBsdfPrincipled')
nt.links.new(dark.outputs[2], pb.inputs['Base Color'])
pb.inputs['Roughness'].default_value = 0.42
pb.inputs['Coat Weight'].default_value = 0.1
out_e = nt.nodes.new('ShaderNodeOutputMaterial')
out_e.target = 'EEVEE'
nt.links.new(pb.outputs[0], out_e.inputs['Surface'])
hc.materials.append(mat)

# --- applied copy: plain curves for the sprite renders ---------------------------
bpy.context.view_layer.update()
final = hair.copy()
final.data = hair.data.copy()
final.name = 'hair'
coll.objects.link(final)
bpy.context.view_layer.objects.active = final
for m in list(final.modifiers):
    with bpy.context.temp_override(object=final, active_object=final, selected_objects=[final]):
        bpy.ops.object.modifier_apply(modifier=m.name)
final.data.surface = None
hair.hide_render = True
n_curves = len(final.data.curves)
n_points = len(final.data.points)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
print(f'saved {OUT}: {len(guides)} guides -> {n_curves} strands, {n_points} points ({STYLE})')
