"""
Clean up a character .glb in Blender, step by step, with a check after each.

  python fix_mesh.py model.glb out_dir

Stages (each writes out_dir/stageN.glb, front / side / isometric renders at
128 px and a diagnosis, see diagnose_mesh.py):
  1  merge duplicate vertices and recalculate normals (sharp edges kept by
     angle, so boxes stay crisp)
  2  armour fitted to the body: the chest plate and the shoulder lames are
     reduced to their outer skin, Shrinkwrapped onto the torso (each lame a
     little further out than the one under it), then given an even
     thickness with Solidify; the left pauldron onto the upper arm, the
     crest onto the pauldron
  3  arms and torso: the shoulder caps tucked under the lames, the sleeves'
     tops tapered into them, and every arm part set a little out from the
     body so the joins don't show
  4  torso shape: a narrower waist and rounded shoulders (the torso, the
     tabard and the armour on it deform together)

Everything is done in the bind pose with the animation switched off; the
animations are exported again unchanged.
"""
import math
import os
import subprocess
import sys

import bpy  # noqa: I001
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

GLB, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
objs = {o.name: o for o in sc.objects}
meshes = [o for o in sc.objects if o.type == 'MESH']


def bind_pose(on):
    """Animation off (bind pose) for editing, back on for export."""
    for o in sc.objects:
        ad = o.animation_data
        if not ad:
            continue
        for t in ad.nla_tracks:
            t.mute = on
        if on:
            ad.action = None
    bpy.context.view_layer.update()


def find(prefix):
    return [o for o in meshes if o.name.startswith(prefix)]


def one(name):
    return next((o for o in meshes if o.name == name or o.name.split('.')[0] == name), None)


def apply_mods(o):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def world_bvh(parts):
    """One BVH (plus vertex list) of several parts, in world space."""
    bm = bmesh.new()
    for o in parts:
        t = bmesh.new()
        t.from_mesh(o.data)
        t.transform(o.matrix_world)
        tmp = bpy.data.meshes.new('tmp')
        t.to_mesh(tmp)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        t.free()
    bm.normal_update()
    return BVHTree.FromBMesh(bm), bm


def proxy(parts, name, voxel=0.012, smooth=12):
    """A Shrinkwrap target: a world-space copy of several overlapping parts,
    voxel-remeshed into one closed outer surface and smoothed — so plates
    wrap onto a single clean skin, not onto the bumps and inner layers of
    the separate parts."""
    _, bm = world_bvh(parts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    rm = o.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    sm = o.modifiers.new('smooth', 'SMOOTH')
    sm.factor = 0.8
    sm.iterations = smooth
    apply_mods(o)
    return o


def export(path):
    bind_pose(False)
    for h in helpers:  # the Shrinkwrap targets stay out of the model
        h.hide_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_visible=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_optimize_animation_size=False, export_optimize_animation_keep_anim_object=True, export_apply=True, export_yup=True,
    )
    bind_pose(True)


def check(stage):
    path = os.path.join(OUT, f'stage{stage}.glb')
    export(path)
    subprocess.run([PY, os.path.join(HERE, 'diagnose_mesh.py'), path, os.path.join(OUT, f'diagnosis-{stage}.md')], check=True)
    subprocess.run([PY, os.path.join(HERE, 'stage_views.py'), path, os.path.join(OUT, f'views-{stage}.png')], check=True)
    print(f'stage {stage} done', flush=True)


helpers = []
bind_pose(True)

# --- 1: merge duplicates, recalculate normals ---------------------------------
merged = 0
for o in meshes:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    merged += n0 - len(bm.verts)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)  # zero-area faces have no direction to fix
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # a closed part must enclose positive volume: normals outwards
    if bm.faces and all(len(e.link_faces) == 2 for e in bm.edges) and bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:  # crisp where the surface folds sharply
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(40))
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
print(f'stage 1: merged {merged} duplicate vertices (glTF splits vertices again along UV / shading seams on export)', flush=True)
check(1)

# --- 2: armour onto the body: Shrinkwrap, then Solidify -------------------------


def on_line(p, a, b):
    """Closest point to p on the line through a and b."""
    d = (b - a).normalized()
    return a + d * (p - a).dot(d)


def outer_skin(o, axis):
    """Keep only the faces looking away from the plate's axis (the line it curves
    round: the body's centre line, a shoulder, the upper arm) — that drops the
    inner layer and the rims of a baked thickness."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    mw = o.matrix_world
    rot = mw.to_3x3()
    drop = []
    for f in bm.faces:
        c = mw @ f.calc_center_median()
        away = (c - on_line(c, *axis)).normalized()
        if (rot @ f.normal).normalized().dot(away) < 0.3:
            drop.append(f)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    # no slivers or stray bits: they make Solidify throw spikes
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_area() < 2e-6], context='FACES')
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)
    # keep the plate itself: drop fragments (stray bevel strips) much smaller than the main piece
    pieces, seen = [], set()
    for f in bm.faces:
        if f.index in seen:
            continue
        group, stack = [], [f]
        while stack:
            g = stack.pop()
            if g.index in seen:
                continue
            seen.add(g.index)
            group.append(g)
            stack.extend(h for e in g.edges for h in e.link_faces if h.index not in seen)
        pieces.append((sum(x.calc_area() for x in group), group))
    if pieces:
        big = max(a for a, _ in pieces)
        bmesh.ops.delete(bm, geom=[f for a, g in pieces if a < 0.4 * big for f in g], context='FACES')  # one plate: keep the main piece
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()


def fit(o, target, offset, thickness, smooth=2):
    md = o.modifiers.new('wrap', 'SHRINKWRAP')
    md.target = target
    md.wrap_method = 'NEAREST_SURFACEPOINT'  # onto the smooth skin
    md.wrap_mode = 'OUTSIDE_SURFACE'
    md.offset = offset
    if smooth:
        sm = o.modifiers.new('smooth', 'SMOOTH')  # soften the projection's creases
        sm.factor = 0.5
        sm.iterations = smooth
    so = o.modifiers.new('solid', 'SOLIDIFY')
    so.thickness = thickness
    so.offset = -1.0  # inwards, into the gap the offset left
    so.use_even_offset = False  # even offset spikes at thin corners
    so.use_quality_normals = True
    so.thickness_clamp = 0.6  # never thicker than the faces allow (no spikes)
    so.use_rim = True
    apply_mods(o)


torso = [one(n) for n in ('tunicChest', 'tabardChest', 'tunicWaist', 'tabardWaist') if one(n)]
deltoids = find('deltoid')
body = proxy(torso + deltoids + find('sleeve'), 'bodyProxy')
helpers.append(body)
body_bvh, _ = world_bvh([body])
J = {n: objs[n].matrix_world.translation.copy() for n in ('chest', 'neck', 'shL', 'shR', 'elL', 'elR') if n in objs}
chest_axis = (J['chest'], J['neck'])  # the body's centre line
plates = [one('plastron'), one('plastronRim')]
for o in plates:
    if o:
        outer_skin(o, chest_axis)
        fit(o, body, 0.02 if o.name.startswith('plastron') and 'Rim' not in o.name else 0.026, 0.012)
# the lames: over the body and the plate, each further out than the one under it
over = proxy(torso + deltoids + [one('plastron')], 'plateProxy')
helpers.append(over)
over_bvh, _ = world_bvh([over])
for o in sorted(find('lame'), key=lambda x: x.name):
    k = int(o.name[5]) if o.name[5].isdigit() else 0
    sh = J['shL' if o.name[4] == 'L' else 'shR']
    c = Vector((sh.x, J['chest'].y + (sh.y - J['chest'].y) * 0.62, sh.z - 0.03))
    outer_skin(o, (c, c + Vector((1, 0, 0))))  # the line over the shoulder, front to back
    fit(o, over, 0.008 + 0.012 * (2 - k), 0.01)
# the pauldron round the left upper arm, the crest onto it
arm = proxy([x for x in find('sleeveL') + find('deltoidL')], 'armProxy')
helpers.append(arm)
arm_bvh, _ = world_bvh([arm])
paul = one('pauldron')
if paul:
    outer_skin(paul, (J['shL'], J['elL']))  # the upper arm
    fit(paul, arm, 0.022, 0.011)
    for c in find('crest'):
        outer_skin(c, (J['shL'], J['elL']))
        fit(c, paul, 0.0015, 0.002, smooth=0)
check(2)

# --- 3: arms and torso: hide the joins --------------------------------------------
for o in deltoids:  # the shoulder caps, smaller and tucked under the lames
    o.scale *= 0.88
    o.location.z -= 0.012
for o in find('sleeve'):  # the sleeve's top tapers into the cap
    bm = bmesh.new()
    bm.from_mesh(o.data)
    top = max(v.co.z for v in bm.verts)
    for v in bm.verts:
        t = max(0.0, (v.co.z - (top - 0.06)) / 0.06)
        v.co.x *= 1 - 0.18 * t
        v.co.y *= 1 - 0.18 * t
    bm.to_mesh(o.data)
    bm.free()
# every arm part a little out from the body (in the shoulder's own frame)
for side, sgn in (('L', 1), ('R', -1)):
    for j in ('sh', 'el', 'ha'):
        node = objs.get(j + side)
        if not node:
            continue
        for ch in node.children:
            if ch.type == 'MESH' or ch.name.startswith('pauldron'):
                ch.location.y += sgn * 0.014
        for gch in [c for c in node.children if c.type == 'EMPTY' and not c.name.startswith(('el', 'ha', 'wpn'))]:
            for m in gch.children:
                if m.type == 'MESH':
                    m.location.y += sgn * 0.014
check(3)

# --- 4: torso shape: a narrower waist, rounded shoulders ------------------------
chest = objs.get('chest')
spine = objs.get('spine')
axis = chest.matrix_world.translation.copy()
z_waist = spine.matrix_world.translation.z + 0.12
z_sh = chest.matrix_world.translation.z + 0.27


def shape(p):
    """New world position for a torso point: waist pinched, shoulder corners rounded."""
    d = Vector((p.x - axis.x, p.y - axis.y, 0))
    w = math.exp(-((p.z - z_waist) / 0.13) ** 2)  # the waist
    k = 1 - 0.1 * w
    side = min(1.0, max(0.0, (abs(d.y) - 0.1) / 0.1))
    up = min(1.0, max(0.0, (p.z - (z_sh - 0.1)) / 0.12))
    k_y = 1 - 0.12 * side * up  # the shoulder corner pulled in…
    dz = -0.03 * side * up * side  # …and down, a rounder slope
    return Vector((axis.x + d.x * k, axis.y + d.y * k * k_y, p.z + dz))


targets = torso + plates + find('lame') + find('tabardEdge') + [o for o in (one('neckRim'),) if o]
for o in targets:
    if not o:
        continue
    mw = o.matrix_world
    inv = mw.inverted()
    for v in o.data.vertices:
        v.co = inv @ shape(mw @ v.co)
    o.data.update()
check(4)

for h in helpers:
    bpy.data.objects.remove(h)
helpers.clear()
export(os.path.join(OUT, 'fixed.glb'))
print('done')
