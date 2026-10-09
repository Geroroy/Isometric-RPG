"""Front / side / back / 3/4 orthographic views of a .glb in its rest pose
(the joints' bind pose: arms down), for checking a model against references.
  python model_views.py model.glb out.png [zoom_center_z] [ortho_size]"""
import math
import sys

import bpy  # noqa: I001
from mathutils import Vector

glb, out = sys.argv[1], sys.argv[2]
cz = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
size = float(sys.argv[4]) if len(sys.argv) > 4 else 2.2
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=glb)
for o in sc.objects:
    if o.animation_data:
        for t in o.animation_data.nla_tracks:
            t.mute = True
        o.animation_data.action = None
    if o.rotation_mode == 'QUATERNION' and o.type == 'EMPTY' and not o.name.startswith(('saber', 'beltHilt', 'skirt_')):
        o.rotation_quaternion = (1, 0, 0, 0)
    if o.name.startswith('blade'):
        o.hide_render = True
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
