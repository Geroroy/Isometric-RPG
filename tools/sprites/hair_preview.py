"""Review renders of a character with its hair curves: a close-up of the head
(front, side, back, the game's isometric angle) at 512 px, and the whole
figure from the front, the side and the isometric angle at 128 px (rendered
at 512, Lanczos-downscaled — the sprites' size), in Cycles or EEVEE.
  python hair_preview.py model.glb hair.blend out_prefix [cycles|eevee] [anim] [frame]
writes out_prefix_head.png and out_prefix_128.png"""
import math
import os
import sys

import bpy  # noqa: I001
from mathutils import Vector
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hair_attach import attach_hair  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
glb, hair_path, prefix = argv[:3]
ENGINE = argv[3] if len(argv) > 3 else 'cycles'
ANIM = argv[4] if len(argv) > 4 else 'idleOff'
FRAME = int(argv[5]) if len(argv) > 5 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=glb)
attach_hair(hair_path, sc)
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
if ENGINE == 'eevee':
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 32
else:
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.27, 0.31, 1)
for d, e in (((-1, 1, 2), 3.5), ((1, -0.5, 0.6), 1.2)):  # the sprites' key (top left) and a fill
    lt = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN'))
    lt.data.energy = e
    sc.collection.objects.link(lt)
    lt.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'


def shot(az, el, center, size, res, path):
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
    cam.location = Vector(center) + d * 10
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = size
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return Image.open(path).convert('RGB')


# the game's view: from +X/−Y in this space (towards the camera), 30° down
ISO = (-45, 30)
views = [(0, 5), (90, 5), (180, 5), ISO]
heads = [shot(az, el, (0.0, 0, 1.7), 0.5, 512, f'/tmp/hp_h{i}.png') for i, (az, el) in enumerate(views)]
img = Image.new('RGB', (512 * 4, 512))
for i, t in enumerate(heads):
    img.paste(t, (i * 512, 0))
img.save(prefix + '_head.png')
smalls = [shot(az, el, (0.0, 0, 1.0), 2.3, 512, f'/tmp/hp_s{i}.png').resize((128, 128), Image.LANCZOS) for i, (az, el) in enumerate([(0, 5), (90, 5), ISO])]
img = Image.new('RGB', (128 * 3, 128))
for i, t in enumerate(smalls):
    img.paste(t, (i * 128, 0))
img.save(prefix + '_128.png')
