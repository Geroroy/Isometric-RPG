"""
A single pre-rendered isometric portrait of a character GLB (character-select / UI art):
orthographic camera at the classic isometric angle (35.26° down) from the character's
front-right, soft studio lighting (large key, fill and rim area lights), Cycles with denoising,
transparent background, square image.
  python iso_portrait.py model.glb out.png [size=2048] [samples=128] [anim=idleOff] [frame=0] [head_lift=0] [axis=X]
head_lift: radians the head bone turns up for the portrait (this render only; the model is untouched).
"""
import builtins
import functools
import math
import os
import sys

import bpy  # noqa: I001
from mathutils import Vector

print = functools.partial(builtins.print, flush=True)  # noqa: A001
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
glb, out = argv[0], argv[1]
SIZE = int(argv[2]) if len(argv) > 2 else 2048
SAMPLES = int(argv[3]) if len(argv) > 3 else 128
ANIM = argv[4] if len(argv) > 4 else 'idleOff'
FRAME = int(argv[5]) if len(argv) > 5 else 0
HEAD_LIFT = float(argv[6]) if len(argv) > 6 else 0.0
AXIS = argv[7] if len(argv) > 7 else 'X'
HEAD_ONLY = len(argv) > 8 and argv[8] == 'head'  # a close-up of the head, for checking the pose
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=glb)
act = bpy.data.actions.get(ANIM)
for o in sc.objects:
    ad = o.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
        slot = act and next((x for x in act.slots if x.identifier == 'OB' + o.name), None)
        ad.action = act if slot else None
        if slot:
            ad.action_slot = slot
    if o.name.startswith('blade') or o.name.startswith('Icosphere'):  # the blade off; the importer's bone-display sphere
        o.hide_render = True
sc.frame_set(FRAME)
if HEAD_LIFT:
    # the head up a little for the portrait: the action is unlinked from the head after the frame is set
    arm = next(o for o in sc.objects if o.type == 'ARMATURE')
    pb = arm.pose.bones['head']
    pb.rotation_mode = 'XYZ'
    q = pb.rotation_quaternion.copy() if pb.rotation_mode == 'QUATERNION' else None
    arm.animation_data.action = None
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    import mathutils
    mats = {b.name: b.matrix_basis.copy() for b in arm.pose.bones}
    act2 = bpy.data.actions.get(ANIM)
    arm.animation_data.action = act2
    slot = next((x for x in act2.slots if x.identifier == 'OB' + arm.name), None)
    if slot:
        arm.animation_data.action_slot = slot
    sc.frame_set(FRAME)
    mats = {b.name: b.matrix_basis.copy() for b in arm.pose.bones}
    arm.animation_data.action = None
    for b in arm.pose.bones:
        b.matrix_basis = mats[b.name]
    rot = mathutils.Matrix.Rotation(HEAD_LIFT, 4, AXIS)
    pb.matrix_basis = pb.matrix_basis @ rot
bpy.context.view_layer.update()

# the figure's bounds in this pose
pts = []
dg = bpy.context.evaluated_depsgraph_get()
for o in sc.objects:
    if o.type != 'MESH' or o.hide_render:
        continue
    e = o.evaluated_get(dg)
    m = e.to_mesh()
    pts += [e.matrix_world @ v.co for v in m.vertices]
    e.to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
centre = (lo + hi) / 2

sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.color_depth = '16'
sc.render.image_settings.compression = 15
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.44, 0.48, 1)  # soft ambient (not seen: film is transparent)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55

# the camera: isometric (35.26° down) from his front-right (he faces +X, his right is −Y)
EL = math.atan(1 / math.sqrt(2))
AZ = math.radians(-45)
d = Vector((math.cos(AZ) * math.cos(EL), math.sin(AZ) * math.cos(EL), math.sin(EL)))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.location = centre + d * 12
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
# frame the figure with a margin: its extent seen through the camera
inv = cam.matrix_world.inverted()
bpy.context.view_layer.update()
inv = cam.matrix_world.inverted()
cp = [inv @ p for p in pts]
ext = max(max(p.x for p in cp) - min(p.x for p in cp), max(p.y for p in cp) - min(p.y for p in cp))
cam.data.ortho_scale = ext * 1.12
if HEAD_ONLY:
    arm0 = next(o for o in sc.objects if o.type == 'ARMATURE')
    hp = arm0.matrix_world @ arm0.pose.bones['head'].head + Vector((0, 0, 0.1))
    cp = [inv @ hp, inv @ hp]
    cam.data.ortho_scale = 0.5
mid = Vector(((max(p.x for p in cp) + min(p.x for p in cp)) / 2, (max(p.y for p in cp) + min(p.y for p in cp)) / 2, 0))
cam.data.shift_x = mid.x / cam.data.ortho_scale
cam.data.shift_y = mid.y / cam.data.ortho_scale


def area(name, direction, energy, size, color=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    l.data.energy = energy
    l.data.size = size
    l.data.color = color
    dv = Vector(direction).normalized()
    l.location = centre + dv * 6
    l.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(l)


# soft studio light: a big key above the camera's left, a fill from the right, a cool rim behind
area('key', (0.6, 0.55, 0.9), 1100, 4.5)
area('fill', (0.5, -1.0, 0.25), 420, 5.0, (0.9, 0.94, 1.0))
area('rim', (-0.9, 0.3, 0.6), 700, 3.0, (0.82, 0.9, 1.0))
area('top', (0, 0, 1), 300, 4.0)
# the tabards in dark blue-black (the Season 7 look; this render only)
for o in sc.objects:
    if o.type == 'MESH' and o.name.startswith('tabard'):
        for m in o.data.materials:
            if m and m.use_nodes:
                b = m.node_tree.nodes.get('Principled BSDF')
                mix = next((n for n in m.node_tree.nodes if n.type == 'MIX'), None)
                navy = (0.018, 0.02, 0.045, 1)
                if mix:
                    mix.inputs[6].default_value = navy
                elif b:
                    b.inputs['Base Color'].default_value = navy
# the hair a touch cooler and darker than the sprite palette: the studio key is far brighter than the game's sun
for m in bpy.data.materials:
    if m.name.startswith('hairV2') and m.use_nodes:
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF')
        src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].links else None
        hs = nt.nodes.new('ShaderNodeHueSaturation')
        hs.inputs['Saturation'].default_value = 0.95
        hs.inputs['Value'].default_value = 0.6
        if src:
            nt.links.new(src, hs.inputs['Color'])
        else:
            hs.inputs['Color'].default_value = b.inputs['Base Color'].default_value
        nt.links.new(hs.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.55
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('PORTRAIT', out, SIZE)
os._exit(0)
