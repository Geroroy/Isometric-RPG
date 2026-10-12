"""Front / side / back / 3/4 orthographic views of a .glb in one frame of one
of its animations (default: idleOff frame 0 — standing, blade off), for
checking a model against references.
  python model_views.py model.glb out.png [zoom_center_z] [ortho_size] [anim] [frame]"""
import math
import sys

import bpy  # noqa: I001
from mathutils import Vector

glb, out = sys.argv[1], sys.argv[2]
cz = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
size = float(sys.argv[4]) if len(sys.argv) > 4 else 2.2
ANIM = sys.argv[5] if len(sys.argv) > 5 else 'idleOff'
FRAME = int(sys.argv[6]) if len(sys.argv) > 6 else 0
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
    if o.name.startswith('blade'):
        o.hide_render = True
sc.frame_set(FRAME)
sc.render.engine = 'CYCLES'
sc.cycles.samples = 12
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 520, 620
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.27, 0.31, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
for d, e in (((-1, 1, 2), 3.5), ((1, -0.5, 0.6), 1.2)):
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN'))
    l.data.energy = e
    sc.collection.objects.link(l)
    l.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = size
from PIL import Image  # noqa: E402

tiles = []
for i, az in enumerate((0, 90, 180, 35)):  # front (+X), his left (+Y), back, 3/4
    a = math.radians(az)
    d = Vector((math.cos(a), math.sin(a), 0.12))
    cam.location = Vector((0, 0, cz)) + d * 10
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'/tmp/mv{i}.png'
    bpy.ops.render.render(write_still=True)
    tiles.append(Image.open(f'/tmp/mv{i}.png').convert('RGB'))
W, H = tiles[0].size
img = Image.new('RGB', (W * 4, H))
for i, t in enumerate(tiles):
    img.paste(t, (i * W, 0))
img.save(out)
