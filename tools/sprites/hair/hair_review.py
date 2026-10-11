"""
Review renders for the hair (tools/sprites/hair/hair_v2.py): one model's head close-up from the
front, his right, his left, the back and 3/4, and the game's isometric view at the sprite's real
size (the character ~56 px tall: rendered at 2x, Lanczos-downscaled, as the sprite pipeline
does), front-on and 3/4 and from behind.
  python hair_review.py model.glb out_dir [label] [hair.blend]
(hair.blend: build_hair.py's curves, attached to the head bone as the sprite renders do)
writes out_dir/<label>_<view>.png
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
label = argv[2] if len(argv) > 2 else os.path.splitext(os.path.basename(glb))[0]
HAIR = argv[3] if len(argv) > 3 else None
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=glb)
if HAIR:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    from hair_attach import attach_hair  # noqa: E402
    attach_hair(HAIR, sc)
    sc.cycles_curves.shape = 'RIBBONS'
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
sc.cycles.samples = 16
sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.26, 0.27, 0.3, 1)
for d, e in (((-1, 1, 2), 3.4), ((1, -0.5, 0.6), 1.1), ((-0.4, -1, 0.3), 0.6)):
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN'))
    l.data.energy = e
    sc.collection.objects.link(l)
    l.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
# the head's centre in this pose (the head bone moves it a little from the rest pose)
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
hb = arm.pose.bones['head']
hc = arm.matrix_world @ hb.head + Vector((0.0, 0.0, 0.06))


def shot(name, az, el, target, scale, res, dist=6):
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
    cam.location = target + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = scale
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.filepath = os.path.join(out, f'{label}_{name}.png')
    bpy.ops.render.render(write_still=True)


# close-ups: front (+X), his right (−Y), his left (+Y), back, 3/4 front-right of the image
for name, az in (('front', 0), ('right', -90), ('left', 90), ('back', 180), ('q34', 35)):
    shot(name, az, 4, hc, 0.36, 420)
# the game's view: 30° elevation, the sprite's scale (~56 px for the whole figure), at 2x then downscaled
body = Vector((hc.x, hc.y, 0.95))
from PIL import Image  # noqa: E402

for name, az in (('iso_front', 0), ('iso_q34', 45), ('iso_back', 180)):
    shot(name, az, 30, body, 3.5, 256)
    p = os.path.join(out, f'{label}_{name}.png')
    Image.open(p).convert('RGB').resize((128, 128), Image.LANCZOS).save(p)
print('REVIEW done', label)
os._exit(0)
