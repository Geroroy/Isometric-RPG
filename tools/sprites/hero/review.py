"""
Model review renders (no animation): close-ups of the head and full figure from the front, the side, three quarters
and the game's isometric view, Cycles. Optionally after posing a frame of a clip (pose_hero.py).

  .bvenv/bin/python tools/sprites/hero/review.py model.blend out.png [--pose clips.json clip:frame] [--samples 32]
"""
import math
import os
import sys

import bpy  # noqa: I001
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
src, out = argv[0], argv[1]
opt = {argv[i][2:]: argv[i + 1] for i in range(2, len(argv) - 1) if argv[i].startswith('--')}
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(src))
scene = bpy.context.scene
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
if 'pose' in opt:
    import pose_hero
    clip, fr = opt['frame'].split(':') if 'frame' in opt else opt['pose-frame'].split(':')
    pose_hero.apply_frame(opt['pose'], clip, int(fr))

scene.render.engine = 'CYCLES'
scene.cycles.samples = int(opt.get('samples', 32))
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.36, 0.38, 0.44, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55


def sun(direction, e, col):
    l = bpy.data.lights.new('s', 'SUN')
    l.energy = e
    l.color = col
    l.angle = math.radians(6)
    o = bpy.data.objects.new('s', l)
    scene.collection.objects.link(o)
    o.rotation_euler = (-Vector(direction).normalized()).to_track_quat('-Z', 'Y').to_euler()
    return o


cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
H = float(opt.get('height', 1.95))
views = [('front', 0), ('3/4', 45), ('side', 90), ('back', 180)]
shots = []
for label, az in views:
    shots.append((label, az, 0, 0.5 * H, H * 1.05, 'full'))
for label, az in views[:3]:
    shots.append((label, az, 0, H - 0.17, 0.42, 'head'))
shots.append(('iso', 45 + 180 - 45, 30, 0.5 * H, 2.6, 'iso'))
res = int(opt.get('res', 512))
from PIL import Image  # noqa: E402
tiles = []
key = sun((0.6, 0.6, 1.0), 4.0, (1, 0.95, 0.88))
rim = sun((-0.8, -0.3, 0.6), 2.5, (0.72, 0.84, 1))
for i, (label, az, elev, cz, size, kind) in enumerate(shots):
    a = math.radians(az)
    e = math.radians(elev)
    d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
    cam.location = Vector((0, 0, cz)) + d * 20
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = size
    key.rotation_euler = (-(d + Vector((0, 0, 1.0)) + d.cross(Vector((0, 0, 1))) * 0.8).normalized()).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    p = os.path.join(os.path.dirname(os.path.abspath(out)), f'_rv{i}.png')
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    tiles.append((label + ' ' + kind, Image.open(p).convert('RGBA')))
    os.remove(p)
cols = 4
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * res, rows * res), (58, 60, 66, 255))
for i, (lab, im) in enumerate(tiles):
    sheet.alpha_composite(im, ((i % cols) * res, (i // cols) * res))
sheet.save(out)
print('REVIEW', out)
