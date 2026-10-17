"""
Close looks at a prepared Movie Duels Anakin .blend (diagnostics, not game sprites): the body from several sides and the
hands on the hilt. Cycles at a few samples; this container has no EGL for Workbench / EEVEE.

  .bvenv/bin/python tools/sprites/md/md_look.py <blend> <out prefix> [action]
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

blend, prefix = sys.argv[1], sys.argv[2]
action = sys.argv[3] if len(sys.argv) > 3 else None
bpy.ops.wm.open_mainfile(filepath=str(Path(blend).resolve()))
sc = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if action:
    arm.animation_data_create().action = bpy.data.actions[action]
    arm.animation_data.action_slot = bpy.data.actions[action].slots[0]
    sc.frame_set(0)
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.cycles.use_denoising = False
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('look')
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.57, 0.6, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.7
sc.world = w
sun = bpy.data.objects.new('look_key', bpy.data.lights.new('look_key', 'SUN'))
sun.data.energy = 3.0
sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
cam = bpy.data.objects.new('look_cam', bpy.data.cameras.new('look_cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'


def shot(point, az, size, elev, name, res=420):
    sc.render.resolution_x = sc.render.resolution_y = res
    cam.data.ortho_scale = size
    a, e = math.radians(az), math.radians(elev)
    d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    cam.location = point + d * 10
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{prefix}_{name}.png'
    bpy.ops.render.render(write_still=True)


bpy.context.view_layer.update()
for az in (0, 60, 90, 180, 270, 315):
    shot(Vector((0.05, 0, 1.0)), az, 2.3, 12, f'body_{az:03d}')
grip = bpy.data.objects.get('hilt')
if grip:
    g = grip.matrix_world.translation
    for az in (0, 90, 270, 30):
        shot(g, az, 0.42, 15, f'grip_{az:03d}', 360)
