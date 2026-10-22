"""
Render a building .glb into the game's three-layer building sprite.

  python render_building.py building.glb out_dir [options]       (bpy module)
  blender -b -P render_building.py -- building.glb out_dir [options]

  --name NAME        output prefix (default: the .glb's name)
  --render 1024      render resolution (square)
  --sizes N          output sizes (default: the window, one image pixel per
                     game pixel); one set of files each
  --rotate 0         turn the model this many degrees about the vertical first
                     (90: what faced game +y faces game +x)
  --light 1.0        brightness of the key / rim / fill lights and the sky
  --neon JSON        the neon's flicker settings in the JSON (default: a slow
                     hum with rare dropouts), e.g. '{"rate": 2, "level": 0}'
                     for blinking lights
  --window 260       game pixels the image covers
  --anchor 130,210   where the model's origin (its ground centre) sits, game px
  --samples 48       Cycles samples
  --neon-glow 6      blur radius of the neon halo (render px)

Layers (each NAME_SIZE_*.png, all the same size and alignment):
  body        the building with its neon switched off (tubes dark glass),
              lit by the same rig as the characters (upper-left key with
              shadows, cool rim, dim sky, ambient occlusion)
  neon        what the neon adds: the glowing tubes, the colour they throw on
              the walls around them, and a soft halo — the difference between
              a render with the neon on and one with it off. Drawn with
              globalCompositeOperation 'lighter', so it can flicker without
              the body changing.
  reflect     the neon's reflection in the wet street in front of the building
              (a glossy floor, rendered with the building invisible to the
              camera but still reflected), also additive, also flickering

NAME_SIZE.json:
  { name, size, window, k (game px per image px),
    anchor: [x, y]          image px of the model's origin (on the ground)
    sort: [x, y]            image px of the front-most footprint point — sort
                            buildings and characters by this ground y
    footprint: [[x, y], …]  the ground outline in tiles from the origin (game
                            world axes), for collision
    layers: { body, neon, reflect },
    neon: { base, hum, speed, flicker: { rate, dur: [a, b], level } } }

Neon parts are found by material: emissive, or unlit (KHR_materials_unlit,
which is how the game's glowing MeshBasicMaterials export). Materials whose
name starts with `lit` (lit windows, lamps, a doorway's light) glow too but
never flicker: they stay in the body layer.
"""
import json
import math
import os
import sys
import tempfile

import bpy  # noqa: I001
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from PIL import Image, ImageFilter

HALF_W = 20  # src/core/iso.js
PX_PER_UNIT = HALF_W / math.sqrt(0.5)
ELEV = math.radians(30)


def parse(argv):
    pos, opt, i = [], {}, 0
    while i < len(argv):
        if argv[i].startswith('--'):
            opt[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            pos.append(argv[i])
            i += 1
    return pos, opt


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_cfg  # noqa: E402
B = render_cfg.CFG['building']  # samples, light, denoiser (render_config.json)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
force = '--force' in argv
adopt = '--adopt' in argv  # stamp the existing sprite as made from the current inputs (no render)
check = '--check' in argv  # only print UNCHANGED / CHANGED
argv = [a for a in argv if a not in ('--force', '--adopt', '--check')]
pos, opt = parse(argv)
GLB, OUT = pos[0], pos[1]
NAME = opt.get('name', os.path.splitext(os.path.basename(GLB))[0])
RES = int(opt.get('render', 1024))
WINDOW = float(opt.get('window', 260))
SIZES = [int(x) for x in opt.get('sizes', str(int(WINDOW))).split(',')]
NEON_OPT = json.loads(opt.get('neon', '{}'))
LIGHT = float(opt.get('light', B['light']))
ROTATE = math.radians(float(opt.get('rotate', 0)))
AX, AY = [float(x) for x in opt.get('anchor', '130,210').split(',')]
GLOW = float(opt.get('neon-glow', 6))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
GPU = render_cfg.setup_gpu(bpy)
SAMPLES = int(opt.get('samples', B['samples']['gpu' if GPU else 'cpu']))
# change detection: the model, these options, the settings (+ the pipeline version)
SOURCE = render_cfg.source_hash([GLB],
                                [render_cfg.effective(B, ('samples',)), opt, SAMPLES, GPU])
if check:
    print('UNCHANGED' if render_cfg.up_to_date([os.path.join(OUT, f'{NAME}_{s_}.json') for s_ in SIZES], SOURCE) else 'CHANGED', NAME, flush=True)
    sys.exit(0)
if adopt:
    for s_ in SIZES:
        p_ = os.path.join(OUT, f'{NAME}_{s_}.json')
        m_ = json.load(open(p_))
        m_['source'] = SOURCE
        json.dump(m_, open(p_, 'w'), indent=1)
    print('ADOPTED', NAME, SOURCE, flush=True)
    sys.exit(0)
if not force and render_cfg.up_to_date([os.path.join(OUT, f'{NAME}_{s}.json') for s in SIZES], SOURCE):
    print(f'UNCHANGED {NAME}: up to date (source {SOURCE})', flush=True)
    sys.exit(0)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)
model = [o for o in scene.objects if o.type == 'MESH']
if ROTATE:
    from mathutils import Matrix
    turn = Matrix.Rotation(ROTATE, 4, 'Z')
    for o in [o for o in scene.objects if o.parent is None]:
        o.matrix_world = turn @ o.matrix_world
    bpy.context.view_layer.update()

# ----------------------------------------------------------------------------
# Neon: find the glowing materials, prepare an on / off switch for each


def is_neon(m):
    if not m or not m.node_tree or m.name.startswith('lit'):
        return False
    nt = m.node_tree
    if any(n.type in ('EMISSION', 'BACKGROUND') for n in nt.nodes):  # the importer's unlit setup
        return True
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    return bool(b and b.inputs['Emission Strength'].default_value > 0 and any(b.inputs['Emission Color'].default_value[:3]))


def neon_color(m):
    nt = m.node_tree
    for n in nt.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            c = n.inputs['Base Color'].default_value
            return tuple(c[:3])
        if n.type in ('EMISSION', 'BACKGROUND') and 'Color' in n.inputs:
            return tuple(n.inputs['Color'].default_value[:3])
    return (1, 1, 1)


neon_mats = [m for m in bpy.data.materials if is_neon(m)]
switch = {}
for m in neon_mats:
    col = neon_color(m)
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*col, 1)
    glass = nt.nodes.new('ShaderNodeBsdfPrincipled')  # the tube switched off: dark glass
    glass.inputs['Base Color'].default_value = (*(c * 0.12 + 0.02 for c in col), 1)
    glass.inputs['Roughness'].default_value = 0.25
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(glass.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    switch[m.name] = em
print(f'neon materials: {len(neon_mats)}')


def neon(on):
    for em in switch.values():
        em.inputs['Strength'].default_value = 6.0 if on else 0.0


# ----------------------------------------------------------------------------
# Camera and lights (the same rig as render_sprites.py)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = WINDOW / PX_PER_UNIT
back = Vector((math.cos(ELEV) * math.sqrt(0.5), -math.cos(ELEV) * math.sqrt(0.5), math.sin(ELEV)))
cam.location = back * 60
cam.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_start = 1
cam.data.clip_end = 200
cam.data.shift_x = -(AX / WINDOW - 0.5)
cam.data.shift_y = AY / WINDOW - 0.5
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
up = Vector((0, 0, 1))


def sun(name, d, strength, color, angle, shadow=True):
    li = bpy.data.lights.new(name, 'SUN')
    li.energy = strength * LIGHT
    li.color = color
    li.angle = math.radians(angle)
    li.use_shadow = shadow
    o = bpy.data.objects.new(name, li)
    scene.collection.objects.link(o)
    o.rotation_euler = (-d.normalized()).to_track_quat('-Z', 'Y').to_euler()


# the city at night: a dim key, a cool rim, a dark sky — the neon does the rest
sun('key', -right * 0.9 + up * 1.35 + back * 0.55, 1.6, (0.85, 0.9, 1.0), 6)
sun('rim', right * 0.7 + up * 0.55 - back * 1.0, 1.2, (0.6, 0.75, 1.0), 3)
sun('fill', right * 0.6 + up * 0.3 + back * 1.0, 0.35, (0.8, 0.85, 1.0), 20, shadow=False)
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.2, 0.22, 0.3, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6 * LIGHT
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU' if GPU else 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.denoiser = B['denoiser']
scene.cycles.max_bounces = 4

# ambient occlusion in every non-neon material, as for the characters
for m in bpy.data.materials:
    if m in neon_mats or not m.node_tree:
        continue
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b:
        continue
    src = b.inputs['Base Color']
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value = 0.25
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.85
    if src.links:
        nt.links.new(src.links[0].from_socket, mix.inputs[6])
    else:
        mix.inputs[6].default_value = src.default_value
    nt.links.new(ao.outputs['AO'], mix.inputs[7])
    nt.links.new(mix.outputs[2], src)

# the wet street: a dark glossy floor, used only for the reflection layer
bpy.ops.mesh.primitive_plane_add(size=80)
floor = bpy.context.object
fm = bpy.data.materials.new('wet')
fm.use_nodes = True
fb = fm.node_tree.nodes['Principled BSDF']
fb.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1)
fb.inputs['Roughness'].default_value = 0.22
fb.inputs['Specular IOR Level'].default_value = 0.8
floor.data.materials.append(fm)
floor.hide_render = True

# ----------------------------------------------------------------------------
# Render the passes

tmp = tempfile.mkdtemp()


def render(name):
    p = os.path.join(tmp, name + '.png')
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255


neon(False)
body = render('body')
neon(True)
lit = render('lit')
# the floor alone: the building hidden from the camera but still reflected
floor.hide_render = False
for o in model:
    o.visible_camera = False
neon(True)
refl_on = render('refl_on')
neon(False)
refl_off = render('refl_off')


def additive(rgb):
    """An additive layer as RGBA: alpha = brightest channel, colour un-premultiplied."""
    a = np.clip(rgb.max(axis=2), 0, 1)
    c = np.where(a[..., None] > 1e-4, rgb / np.maximum(a[..., None], 1e-4), 0)
    return np.dstack((np.clip(c, 0, 1), a))


# neon: what switching it on adds (straight-alpha premultiplied by coverage), plus a halo
diff = np.clip(lit[..., :3] * lit[..., 3:] - body[..., :3] * body[..., 3:], 0, 1)
halo = np.asarray(Image.fromarray((diff * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(GLOW))).astype(np.float32) / 255
neon_rgb = np.clip(diff + halo * 0.8, 0, 1)
# reflection: what the neon adds to the wet floor
rdiff = np.clip(refl_on[..., :3] * refl_on[..., 3:] - refl_off[..., :3] * refl_off[..., 3:], 0, 1)
# ...as streaks: wet streets smear reflections vertically
rimg = Image.fromarray((rdiff * 255).astype(np.uint8))
rimg = rimg.resize((RES, RES // 4), Image.BILINEAR).resize((RES, RES), Image.BILINEAR)
refl_rgb = np.asarray(rimg).astype(np.float32) / 255
# ...fading out before the image's edges (no hard cut where the render ends)
yy, xx = np.mgrid[0:RES, 0:RES] / RES
edge = np.clip(np.minimum.reduce([xx, 1 - xx, 1 - yy]) / 0.14, 0, 1) ** 1.5
refl_rgb = np.clip(refl_rgb * edge[..., None] * 0.9, 0, 1)

# ----------------------------------------------------------------------------
# The footprint (collision) and the sort point


def to_px(co):
    u, v, _ = world_to_camera_view(scene, cam, co)
    return [u * WINDOW, (1 - v) * WINDOW]  # game px in the image window


ground = []
for o in model:
    mw = o.matrix_world
    for v in o.data.vertices:
        w = mw @ v.co
        if w.z < 0.35:
            ground.append((w.x, w.y))
pts = np.array(ground)


def hull(p):
    p = sorted(set(map(tuple, np.round(p, 3))))
    if len(p) < 3:
        return p
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for q in p:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], q) <= 0:
            hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]


fp = hull(pts)
# game world: tile x = Blender x, tile y = −Blender y
footprint = [[round(x, 3), round(-y, 3)] for x, y in fp]
# the front-most ground point (largest x + y in game tiles): where it sorts
front = max(footprint, key=lambda p: p[0] + p[1])
sort_px = to_px(Vector((front[0], -front[1], 0)))

# ----------------------------------------------------------------------------
# Write each size

for size in SIZES:
    k = WINDOW / size
    prefix = f'{NAME}_{size}'

    def save(arr, layer):
        img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)
        name = f'{prefix}_{layer}.png'
        img.save(os.path.join(OUT, name), optimize=True)
        return name

    layers = {'body': save(body, 'body'), 'neon': save(additive(neon_rgb), 'neon'), 'reflect': save(additive(refl_rgb), 'reflect')}
    meta = {
        'name': NAME, 'size': size, 'window': WINDOW, 'k': k,
        'anchor': [round(AX / k, 2), round(AY / k, 2)],
        'sort': [round(sort_px[0] / k, 2), round(sort_px[1] / k, 2)],
        'footprint': footprint,
        'layers': layers,
        'neon': {'base': 1.0, 'hum': 0.05, 'speed': 9, 'flicker': {'rate': 0.12, 'dur': [0.04, 0.22], 'level': 0.12, **NEON_OPT}},
        'source': SOURCE,
    }
    with open(os.path.join(OUT, prefix + '.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    print(f'wrote {prefix}.json')
