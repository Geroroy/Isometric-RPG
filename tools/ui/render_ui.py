"""
Render the console's UI pieces in Blender, lit like everything else in the
game (ART_GUIDE.md §3, §9): the camera faces the panel, the key light comes
from the upper left, a cool rim, a dim fill and sky.

  .bvenv/bin/python tools/ui/render_ui.py [--preview] [--force] [--check] [--estimate]

All pieces sit side by side in one scene and come out of ONE render (an
atlas), which is then cut up, scaled down (render_config.json ui.render_scale)
and written to public/ui/:

  frame.png      the console's metal frame (9-slice; centre open)
  bezel.png      a monitor's recessed bezel (9-slice; screen open)
  gauge.png      the housing of a glowing gauge tube (9-slice; window open)
  key_off.png    a console key at rest, its lamp dark
  key_down.png   the key pressed in, its lamp lit amber
  key_on.png     the key's lamp lit blue (a switch that is on: the saber)
  ui.json        { source, pieces: { name: { w, h, slice: [top, right, bottom, left] } } }

Units: 1 Blender unit = 1 final pixel. Settings: render_config.json "ui".
"""
import json
import math
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'sprites'))
import render_cfg  # noqa: E402

CFG = render_cfg.CFG
C = CFG['ui']
ROOT = render_cfg.ROOT
OUT = os.path.join(ROOT, 'public', 'ui')
args = sys.argv[1:]
PREVIEW, FORCE, CHECK, ESTIMATE_ONLY = ('--preview' in args, '--force' in args, '--check' in args, '--estimate' in args)
UI_VERSION = 1  # bump when a change here changes the pictures

# piece: final size, 9-slice insets (top, right, bottom, left)
PIECES = {
    'frame': {'w': 120, 'h': 120, 'slice': [28, 28, 28, 28]},
    'bezel': {'w': 72, 'h': 72, 'slice': [16, 16, 16, 16]},
    'gauge': {'w': 200, 'h': 40, 'slice': [12, 26, 12, 26]},
    'key_off': {'w': 100, 'h': 36, 'slice': [10, 10, 10, 28]},
    'key_down': {'w': 100, 'h': 36, 'slice': [10, 10, 10, 28]},
    'key_on': {'w': 100, 'h': 36, 'slice': [10, 10, 10, 28]},
}
GAP = 24
# atlas layout: one row
x = GAP
for name, p in PIECES.items():
    p['x'] = x
    x += p['w'] + GAP
ATLAS_W = x
ATLAS_H = max(p['h'] for p in PIECES.values()) + GAP * 2
for p in PIECES.values():
    p['y'] = (ATLAS_H - p['h']) // 2

SCALE = 1.0 if PREVIEW else C['render_scale']
SAMPLES_KEY = 'gpu' if render_cfg.CFG['device']['prefer'] == 'gpu' else 'cpu'
settings = {'ui': render_cfg.effective(C), 'pieces': PIECES, 'rig': C['rig'], 'version': UI_VERSION, 'scale': SCALE}
SOURCE = render_cfg.source_hash([], settings)
INDEX = os.path.join(OUT, 'ui.json')

if not FORCE and not PREVIEW and render_cfg.up_to_date([INDEX], SOURCE):
    print('UNCHANGED ui', flush=True)
    sys.exit(0)
if CHECK:
    print('CHANGED ui', flush=True)
    sys.exit(0)
px = ATLAS_W * ATLAS_H * SCALE * SCALE / 1e6
minutes = px * C['estimate_seconds_per_mpx'] / 60
print(f'ESTIMATE 1 render ({ATLAS_W * SCALE:.0f}x{ATLAS_H * SCALE:.0f} px, {len(PIECES)} pieces), about {minutes:.1f} min', flush=True)
if ESTIMATE_ONLY:
    sys.exit(0)
if minutes > CFG['estimate']['ask_minutes'] and '--yes' not in args:
    print(f'ASK: over {CFG["estimate"]["ask_minutes"]} min — confirm first, then run again with --yes', flush=True)
    sys.exit(3)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from PIL import Image, ImageFilter  # noqa: E402

T0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ------------------------------------------------------------------ materials
def mat(name, base, metal=0.0, rough=0.5, emit=None, strength=0.0, bump=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if bump:
        # fine brushed / worn grain
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 0.35
        tex.inputs['Detail'].default_value = 8
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(tex.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
        # rough patches (grime)
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['To Min'].default_value = rough - 0.08
        ramp.inputs['To Max'].default_value = rough + 0.12
        nt.links.new(tex.outputs['Fac'], ramp.inputs['Value'])
        nt.links.new(ramp.outputs['Result'], b.inputs['Roughness'])
    return m


M = {
    'gunmetal': mat('gunmetal', (0.15, 0.16, 0.18), 0.6, 0.42, bump=0.25),
    'bezel': mat('bezel', (0.07, 0.075, 0.085), 0.35, 0.55, bump=0.15),
    'cap': mat('cap', (0.24, 0.25, 0.27), 0.3, 0.48, bump=0.15),
    'screw': mat('screw', (0.62, 0.64, 0.66), 1.0, 0.3),
    'slot': mat('slot', (0.02, 0.02, 0.02), 0.0, 0.8),
    'lens_off': mat('lens_off', (0.16, 0.05, 0.04), 0.0, 0.18),
    'lens_amber': mat('lens_amber', (1.0, 0.6, 0.2), 0.0, 0.2, emit=(1.0, 0.55, 0.15), strength=2.2),
    'lens_blue': mat('lens_blue', (0.3, 0.6, 1.0), 0.0, 0.2, emit=(0.25, 0.6, 1.0), strength=2.2),
    'red': mat('red', (0.48, 0.06, 0.07), 0.1, 0.45, bump=0.1),
}


# ------------------------------------------------------------------ shapes (1 unit = 1 final px; y up)
def to_world(px_x, px_y):
    """Atlas pixel (top-left origin) -> world XY."""
    return px_x - ATLAS_W / 2, ATLAS_H / 2 - px_y


def box(name, cx, cy, w, h, d, material, bevel=2.0, z=0.0, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, z + d / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (w, h, d)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    o.data.materials.append(material)
    return o


def cut(o, cx, cy, w, h, d, bevel=1.5, z=-1.0):
    """Boolean a rectangular hole through `o` (applied before its bevel)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, z + d / 2))
    c = bpy.context.object
    c.scale = (w, h, d)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        bm = c.modifiers.new('bevel', 'BEVEL')
        bm.width = bevel
        bm.segments = 3
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.modifier_apply(modifier='bevel')
    mod = o.modifiers.new('hole', 'BOOLEAN')
    mod.object = c
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    # the boolean runs before the bevel
    o.modifiers.move(len(o.modifiers) - 1, 0)
    c.hide_render = True
    c.hide_viewport = True
    return o


def screw(cx, cy, z, r=3.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(cx, cy, z), segments=20, ring_count=10)
    s = bpy.context.object
    s.scale = (1, 1, 0.45)
    s.data.materials.append(M['screw'])
    bpy.ops.object.shade_smooth()
    box('slot', cx, cy, r * 1.7, r * 0.35, 1.0, M['slot'], bevel=0, z=z + r * 0.2)
    s.rotation_euler.z = math.radians(30)


def piece_frame(p):
    cx, cy = to_world(p['x'] + p['w'] / 2, p['y'] + p['h'] / 2)
    s = p['slice'][0]
    o = box('frame', cx, cy, p['w'], p['h'], 8, M['gunmetal'], bevel=3.0)
    cut(o, cx, cy, p['w'] - 2 * s, p['h'] - 2 * s, 20, bevel=0)
    # a raised inner lip round the opening, and a red painted band along the top
    lip = box('lip', cx, cy, p['w'] - 2 * s + 8, p['h'] - 2 * s + 8, 10, M['gunmetal'], bevel=1.5)
    cut(lip, cx, cy, p['w'] - 2 * s, p['h'] - 2 * s, 20, bevel=0)
    tx, ty = to_world(p['x'] + p['w'] / 2, p['y'] + 7)
    box('band', tx, ty, p['w'] - 6, 4, 8.6, M['red'], bevel=0.6)
    for sx in (14, p['w'] - 14):
        for sy in (14, p['h'] - 14):
            wx, wy = to_world(p['x'] + sx, p['y'] + sy)
            screw(wx, wy, 8.2)


def piece_bezel(p):
    cx, cy = to_world(p['x'] + p['w'] / 2, p['y'] + p['h'] / 2)
    s = p['slice'][0]
    o = box('bezel', cx, cy, p['w'], p['h'], 6, M['bezel'], bevel=2.5)
    cut(o, cx, cy, p['w'] - 2 * s, p['h'] - 2 * s, 20, bevel=4)  # chamfered opening: a recessed screen


def piece_gauge(p):
    cx, cy = to_world(p['x'] + p['w'] / 2, p['y'] + p['h'] / 2)
    o = box('gauge', cx, cy, p['w'], p['h'], 7, M['gunmetal'], bevel=8, segments=6)
    cut(o, cx, cy, p['w'] - 2 * 22, p['h'] - 2 * 12, 20, bevel=4)
    for sx in (11, p['w'] - 11):
        wx, wy = to_world(p['x'] + sx, p['y'] + p['h'] / 2)
        screw(wx, wy, 7.2, r=3.2)


def piece_key(p, lens, pressed):
    cx, cy = to_world(p['x'] + p['w'] / 2, p['y'] + p['h'] / 2)
    # the well the key sits in, then the cap (lower when pressed)
    well = box('well', cx, cy, p['w'], p['h'], 3, M['bezel'], bevel=1.5)
    cut(well, cx, cy, p['w'] - 4, p['h'] - 4, 10, bevel=1)
    box('floor', cx, cy, p['w'] - 4, p['h'] - 4, 0.5, M['slot'], bevel=0)
    h = 3.0 if pressed else 6.0
    box('cap', cx, cy, p['w'] - 6, p['h'] - 6, h, M['cap'], bevel=2.2, z=0.5)
    lx, ly = to_world(p['x'] + 14, p['y'] + p['h'] / 2)
    box('lens', lx, ly, 13, 9, h + 0.9, M[lens], bevel=1.2, z=0.5)


piece_frame(PIECES['frame'])
piece_bezel(PIECES['bezel'])
piece_gauge(PIECES['gauge'])
piece_key(PIECES['key_off'], 'lens_off', False)
piece_key(PIECES['key_down'], 'lens_amber', True)
piece_key(PIECES['key_on'], 'lens_blue', False)

# ------------------------------------------------------------------ camera and rig (ART_GUIDE.md §3, camera space)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = ATLAS_W
cam.location = (0, 0, 200)
cam.data.clip_end = 1000
scene.render.resolution_x = round(ATLAS_W * SCALE)
scene.render.resolution_y = round(ATLAS_H * SCALE)
R = C['rig']
for name, L in R['lights'].items():
    d = Vector(L['dir']).normalized()  # right, up, toward the camera = +x, +y, +z here
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = L['strength']
    ld.color = L['color']
    ld.angle = math.radians(L.get('angle', 6))
    ld.use_shadow = L.get('shadow', True)
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*R['sky']['color'], 1)
bg.inputs['Strength'].default_value = R['sky']['strength']

scene.render.engine = 'CYCLES'
gpu = render_cfg.setup_gpu(bpy)
scene.cycles.device = 'GPU' if gpu else 'CPU'
scene.cycles.samples = C['samples']['gpu' if gpu else 'cpu'] if not PREVIEW else 8
scene.cycles.use_denoising = C['denoiser'] != 'none' and not PREVIEW
if scene.cycles.use_denoising:
    scene.cycles.denoiser = C['denoiser']
scene.render.threads_mode = 'AUTO'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
tmp = os.path.join(tempfile.mkdtemp(), 'atlas.png')
scene.render.filepath = tmp
t = time.time()
bpy.ops.render.render(write_still=True)
t_render = time.time() - t

# ------------------------------------------------------------------ cut, scale down, write
atlas = np.asarray(Image.open(tmp).convert('RGBA')).astype(np.float32) / 255
out_dir = os.path.join(ROOT, CFG['preview']['out'], 'ui') if PREVIEW else OUT
os.makedirs(out_dir, exist_ok=True)
for name, p in PIECES.items():
    x0, y0 = round(p['x'] * SCALE), round(p['y'] * SCALE)
    a = atlas[y0:y0 + round(p['h'] * SCALE), x0:x0 + round(p['w'] * SCALE)]
    pre = np.dstack((a[..., :3] * a[..., 3:], a[..., 3:]))  # premultiplied for the filter
    im = Image.fromarray((pre * 255).round().astype(np.uint8), 'RGBA').resize((p['w'], p['h']), Image.LANCZOS)
    q = np.asarray(im).astype(np.float32) / 255
    al = q[..., 3:]
    rgb = np.where(al > 0, q[..., :3] / np.maximum(al, 1e-6), 0)
    im = Image.fromarray((np.dstack((np.clip(rgb, 0, 1), al)) * 255).round().astype(np.uint8), 'RGBA')
    if C['sharpen']:
        im = im.filter(ImageFilter.UnsharpMask(radius=1, percent=int(C['sharpen'] * 100), threshold=0))
    im.save(os.path.join(out_dir, name + '.png'), optimize=True)
index = {'source': SOURCE, 'pieces': {n: {'w': p['w'], 'h': p['h'], 'slice': p['slice']} for n, p in PIECES.items()}}
with open(os.path.join(out_dir, 'ui.json'), 'w') as fh:
    json.dump(index, fh, indent=1)
print(f'TIMING render {t_render:.1f}s, total {time.time() - T0:.1f}s -> {out_dir}', flush=True)
