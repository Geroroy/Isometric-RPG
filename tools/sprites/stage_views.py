"""Front / side / isometric renders of a character .glb at 128 px (rendered at
512, Lanczos-downscaled), standing (idleOff frame 0), lit like the sprites.
  python stage_views.py model.glb out.png [size]
out.png holds the three side by side (front, his left side, isometric)."""
import math
import os
import sys
import tempfile

import bpy  # noqa: I001
from mathutils import Vector
from PIL import Image

glb, out = sys.argv[1], sys.argv[2]
SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 128
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
act = bpy.data.actions.get('idleOff')
for o in sc.objects:
    ad = o.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
        slot = act and next((x for x in act.slots if x.identifier == 'OB' + o.name), None)
        ad.action = act if slot else None
        if slot:
            ad.action_slot = slot
    if o.name.startswith('blade'):
        o.hide_render = True
sc.frame_set(0)
sc.render.engine = 'CYCLES'
sc.cycles.samples = 24
sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('sky')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.36, 0.38, 0.44, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
lights = []
for name, e, c, a in (('key', 4.2, (1, 0.95, 0.88), 6), ('rim', 3.0, (0.72, 0.84, 1), 3), ('fill', 0.7, (0.85, 0.9, 1), 20)):
    li = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
    li.data.energy, li.data.color, li.data.angle = e, c, math.radians(a)
    sc.collection.objects.link(li)
    lights.append(li)
lights[2].data.use_shadow = False
iso_back = Vector((math.cos(math.radians(30)) * math.sqrt(0.5), -math.cos(math.radians(30)) * math.sqrt(0.5), math.sin(math.radians(30))))
views = [('front', Vector((1, 0, 0.0)), 2.05, 0.98), ('side', Vector((0, 1, 0.0)), 2.05, 0.98), ('iso', iso_back, 2.3, 0.95)]
tiles = []
tmp = tempfile.mkdtemp()
for name, back, ortho, cz in views:
    back = back.normalized()
    cam.location = Vector((0, 0, cz)) + back * 20
    cam.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = ortho
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    up = Vector((0, 0, 1))
    for li, d in zip(lights, (-right * 0.9 + up * 1.35 + back * 0.55, right * 0.7 + up * 0.55 - back, right * 0.6 + up * 0.3 + back)):
        li.rotation_euler = (-d.normalized()).to_track_quat('-Z', 'Y').to_euler()
    p = os.path.join(tmp, name + '.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    tiles.append(Image.open(p).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS))
img = Image.new('RGBA', (SIZE * 3, SIZE), (0, 0, 0, 0))
for i, t in enumerate(tiles):
    img.paste(t, (i * SIZE, 0))
img.save(out)
