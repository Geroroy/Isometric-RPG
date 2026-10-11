"""
The head and shoulders in the animations' extreme poses, for checking by eye that the hair stays on
the head (no gap at the hairline, nothing lagging or floating, nothing cutting into the collar or
shoulders): a 3/4 close-up per pose, framed on the head wherever the pose puts it, in one sheet.
  python hair_poses.py model.glb out.png [anim:frame[:azimuth°] ...]   (azimuth: -40 = his front-right, 180 = behind)
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
GLB, OUT = argv[0], argv[1]
POSES = argv[2:] or ['idleOff:1', 'run:4', 'attack3:6', 'leap:5', 'hurt:3', 'death:6', 'sig:9', 'cast:5']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
for o in sc.objects:
    if o.name.startswith(('blade', 'Icosphere')):
        o.hide_render = True
sc.render.engine = 'CYCLES'
sc.cycles.samples = 12
sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x = sc.render.resolution_y = 360
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
cam.data.ortho_scale = 0.62
tmp = []
for pose in POSES:
    name, f, *az = pose.split(':')
    act = bpy.data.actions[name]
    for o in sc.objects:
        ad = o.animation_data
        if ad:
            for t in ad.nla_tracks:
                t.mute = True
            slot = next((x for x in act.slots if x.identifier == 'OB' + o.name), None)
            ad.action = act if slot else None
            if slot:
                ad.action_slot = slot
    sc.frame_set(int(f))
    bpy.context.view_layer.update()
    hm = arm.matrix_world @ arm.pose.bones['head'].matrix
    target = hm @ Vector((0, 0, 0)) + (hm.to_3x3() @ Vector((0, 0.06, 0)))  # a little up the head bone
    # 3/4 from his front-right, slightly above, whichever way the pose has turned him
    a, e = math.radians(float(az[0]) if az else -40), math.radians(18)
    d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
    cam.location = target + d * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    p = os.path.join(os.path.dirname(os.path.abspath(OUT)), f'_pose_{name}_{f}_{len(tmp)}.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    tmp.append((pose, p))
from PIL import Image, ImageDraw  # noqa: E402

S = Image.new('RGB', (len(tmp) * 364, 384), (14, 15, 18))
dr = ImageDraw.Draw(S)
for i, (pose, p) in enumerate(tmp):
    S.paste(Image.open(p).convert('RGB'), (i * 364, 24))
    dr.text((i * 364 + 6, 6), pose, fill=(255, 220, 120))
    os.remove(p)
S.save(OUT)
print('POSES', OUT, S.size)
os._exit(0)
