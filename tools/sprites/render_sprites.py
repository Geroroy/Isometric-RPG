"""
Render a .glb character into isometric sprite sheets for the game.

  python render_sprites.py model.glb out_dir [options]          (bpy module, no window)
  blender -b -P render_sprites.py -- model.glb out_dir [options]  (Blender in background)

Settings (engine, samples, render scale, passes, mirroring, …) come from
render_config.json at the repository root; the options below choose the
asset and override a setting only for experiments.

  --name NAME          output file prefix (default: the .glb's name)
  --dirs 8             facing directions (game convention: direction i faces
                       i·360/dirs degrees, turning like the game's units)
  --window 128         game pixels the frame covers (1 game px = 1 px at 128)
  --anchor 64,96       where the model's feet are inside the frame (game px)
  --sizes 128          output frame sizes (one sheet + JSON per size)
  --anims a,b          only these animations (default: every one in the .glb)
  --hair FILE.blend    hair curves from build_hair.py, attached to the head bone
  --meta FILE.json     timing per animation (fps, loop, hit frame) — e.g. the
                       export_rig_anims.mjs output; default 10 fps, looping
  --preview            one direction (facing the camera), two frames of each
                       animation, to render_config's preview folder
  --force              render even if the sheets are up to date
  --check              only print UNCHANGED / CHANGED
  --adopt              stamp the existing sheets as made from the current inputs
  --yes                go ahead even if the estimate is over ask_minutes
  (experiments: --engine, --samples, --render, --frames, --only-dirs, --mirror,
   --passes, --sharpen, --view, --hide)

Before rendering it prints the number of sprites and the expected time
(ESTIMATE), and stops (exit 3, ASK) above render_config's ask_minutes unless
--yes. Each sheet's JSON carries `source`: a hash of the model, the hair, the
timing, the settings and render_cfg.PIPELINE_VERSION; when it matches, the
render is skipped.

Camera: orthographic, 30° above the ground, looking along the game's view
diagonal — the projection the game's tiles use (28.28 px per unit, 2:1). The
lights stay fixed to the camera: a soft key light from the upper left that
casts shadows, a cool rim light from behind on the right, a dim sky for
ambient light, plus ambient occlusion (an AO term multiplied into every
material's colour, and the engine's fast-GI AO for the ambient light).

Speed: every direction is its own copy of the model (linked duplicates,
sharing the meshes and the animation), turned to that direction and set out
on the ground so that it lands in its own tile of one wide image. A frame of
animation is then one render — every direction at once, every pass at once:
the fixed cost of a render (scene sync, BVH) is paid once per frame, not once
per direction and layer (rendering one direction at a time by turning the
camera measured 2.8x slower). Each tile is cut out afterwards.

Mirroring (--mirror 1): the camera looks along the screen's vertical, so a
model facing angle a looks, mirrored left–right, like one facing 90° − a;
with 8 directions, 2, 6, 7 are 0, 4, 3 flipped. Shadows are always rendered
for the real direction.

Shadows and other layers: in Cycles the shadow is the Shadow Catcher pass of
the same render — the catcher is a disc under each direction, where shadows
fall (a whole floor would send every background pixel through the path
tracer); the rim light is linked away from it, so the shadow is the key
light's. Normal and depth come out of the same render when listed in
render_config's passes. All passes leave through the compositor's File
Output (EXR) and are read back. EEVEE (no shadow catcher) still needs a
second render: a white floor lit only by the key light, the shadow's alpha
being how much darker the floor is there. Every layer is downscaled with
Lanczos (premultiplied alpha), trimmed, and packed into sheet pages:

  NAME_SIZE.png / NAME_SIZE_shadow.png (+ _1, _2… pages if needed)
  NAME_SIZE.json:
    { name, dirs, size, window, k (game px per sheet px), anchor,
      pages: [...], shadowPages: [...],
      anims: { anim: { fps, loop, hit, frames: [ [ per direction:
        { p, x, y, w, h, ox, oy,               // sheet rect + anchor in it
          m: { saberBase: [x, y], saberTip },  // game px from the feet
          b: { saber: [[s0, s1], …] },         // blade stretches in front
          s: { p, x, y, w, h, ox, oy } }       // the shadow's rect
      ] ] } } ,
      source, passes, normalPages?, depthPages? }   // normal / depth: the colour's rects

Animation: every glTF animation of the .glb (an action with a slot per
node) is played frame by frame; frames are the action's whole keyframes.

The run prints how long the setup and the renders took, and keeps the time
per frame in tools/sprites/out/render_times.json for the next estimates.
"""
import json
import math
import os
import sys
import tempfile
import time

T_START = time.time()

import bpy  # noqa: I001,E402 (bpy first: it makes mathutils / bpy_extras importable)
import numpy as np  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402
from PIL import Image, ImageFilter, ImageOps  # noqa: E402

ELEV = math.radians(30)


FLAGS = {'preview', 'force', 'yes', 'check', 'adopt'}  # options without a value


def parse(argv):
    pos, opt = [], {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--') and a[2:] in FLAGS:
            opt[a[2:]] = True
            i += 1
        elif a.startswith('--'):
            opt[a[2:]] = argv[i + 1]
            i += 2
        else:
            pos.append(a)
            i += 1
    return pos, opt


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_cfg  # noqa: E402
ROOT, CFG = render_cfg.ROOT, render_cfg.CFG
C = CFG['character']
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
pos, opt = parse(argv)
GLB, OUT = pos[0], pos[1]
NAME = opt.get('name', os.path.splitext(os.path.basename(GLB))[0])
PREVIEW = bool(opt.get('preview'))
FORCE = bool(opt.get('force'))
if PREVIEW:
    OUT = os.path.join(ROOT, CFG['preview']['out'])


bpy.ops.wm.read_factory_settings(use_empty=True)
GPU = render_cfg.setup_gpu(bpy)
ENGINE = opt.get('engine', C['engine']['gpu' if GPU else 'cpu'])
EEVEE = ENGINE == 'eevee'
DIRS = int(opt.get('dirs', C['dirs_default']))
MIRROR = str(opt.get('mirror', '1' if NAME in C['mirror_sprites'] or C['mirror_default'] else '0')) == '1'
SIZES = [int(x) for x in str(opt.get('sizes', C['size'])).split(',')]
WINDOW = float(opt.get('window', 128))
RES = int(opt.get('render', int(round(WINDOW * C['render_scale'] / 4)) * 4))  # twice the final size
SH_RES = int(opt.get('shadow-render', WINDOW))  # (EEVEE's separate shadow pass)
AX, AY = [float(x) for x in opt.get('anchor', '64,96').split(',')]
ONLY = opt.get('anims', '').split(',') if opt.get('anims') else None
MAXF = int(opt['frames']) if 'frames' in opt else (CFG['preview']['frames'] if PREVIEW else None)
SAMPLES = int(opt.get('samples', C['samples']['eevee' if EEVEE else 'cycles_gpu' if GPU else 'cycles_cpu']))
SH_SAMPLES = int(opt.get('shadow-samples', 8))  # (EEVEE's separate shadow pass)
SHARPEN = float(opt.get('sharpen', C['sharpen']))
VIEW = opt.get('view', C['view'])
BLOOM = opt.get('bloom', '1') == '1' and EEVEE
EEVEE_RT = opt.get('eevee-raytrace', '1') == '1'
HIDE = opt.get('hide', 'blade').split(',')
META = json.load(open(opt['meta']))['anims'] if 'meta' in opt else {}
PASSES = opt.get('passes', ','.join(C['passes'])).split(',')
FRONT = DIRS // 8  # the direction that faces the camera
ONLY_DIRS = [int(x) for x in opt['only-dirs'].split(',')] if 'only-dirs' in opt else ([FRONT] if PREVIEW else None)
os.makedirs(OUT, exist_ok=True)


HERE = os.path.dirname(os.path.abspath(__file__))
# what the output depends on: the model, the hair, the timing, these settings and the pipeline version
SOURCE = render_cfg.source_hash(
    [GLB, opt.get('hair'), opt.get('meta')],  # (+ render_cfg.PIPELINE_VERSION)
    [render_cfg.effective(C, ('engine', 'samples', 'mirror_sprites', 'mirror_default', 'dirs_default', 'optional_passes')),
     ENGINE, DIRS, MIRROR, SIZES, WINDOW, RES, AX, AY, ONLY, SAMPLES, SHARPEN, VIEW, PASSES, HIDE, ONLY_DIRS, MAXF])
if opt.get('adopt'):  # accept the existing sheets as rendered from these inputs (no render)
    for size in SIZES:
        p = os.path.join(OUT, f'{NAME}_{size}.json')
        d = json.load(open(p))
        d['source'] = SOURCE
        json.dump(d, open(p, 'w'), separators=(',', ':'))
    print('ADOPTED', NAME, SOURCE, flush=True)
    sys.exit(0)
if opt.get('check'):  # only say whether the sheets are up to date (for the batch scripts' estimates)
    fresh = render_cfg.up_to_date([os.path.join(OUT, f'{NAME}_{size}.json') for size in SIZES], SOURCE)
    print('UNCHANGED' if fresh and not FORCE else 'CHANGED', NAME, flush=True)
    sys.exit(0)
if not FORCE and not PREVIEW:
    if render_cfg.up_to_date([os.path.join(OUT, f'{NAME}_{size}.json') for size in SIZES], SOURCE):
        print(f'UNCHANGED {NAME}: its sheets are up to date (source {SOURCE}); --force renders anyway', flush=True)
        sys.exit(0)

# the game's projection: PX_PER_UNIT = HALF_W / √½ (src/core/iso.js, HALF_W = 20 → 28.28 px per unit)
HALF_W = 20
PX_PER_UNIT = HALF_W / math.sqrt(0.5)


def mirror_of(d):
    """The direction whose left–right mirror image direction d is (facing 90° − a)."""
    return (DIRS // 4 - d) % DIRS


# directions rendered; with --mirror the others are flipped from these
WANTED = ONLY_DIRS if ONLY_DIRS is not None else list(range(DIRS))
RENDERED = [d for d in range(DIRS) if (not MIRROR or d <= mirror_of(d)) and (d in WANTED or mirror_of(d) in WANTED)]
SHADOWED = WANTED

# ----------------------------------------------------------------------------
# Scene

scene = bpy.context.scene
scene.render.fps = 24
if CFG['device']['threads']:
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = CFG['device']['threads']
bpy.ops.import_scene.gltf(filepath=GLB)
if opt.get('hair'):  # hair curves (build_hair.py) on the head bone: glTF has no hair
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from hair_attach import attach_hair
    attach_hair(opt['hair'], scene)
model_objs = list(scene.objects)
hidden_names = {o.name for o in model_objs if any(o.name.startswith(h) for h in HIDE)}
for o in model_objs:
    o.hide_render = o.name in hidden_names

# ----------------------------------------------------------------------------
# Camera: orthographic, 30° elevation, the game's view diagonal; the tiles

TILES = sorted(set(RENDERED) | set(SHADOWED))  # one copy of the model per direction needed
COLS = min(4, len(TILES))
ROWS = math.ceil(len(TILES) / COLS)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = COLS * WINDOW / PX_PER_UNIT  # the image's width (COLS ≥ ROWS)
# the game's camera sits towards +X / +Z (three.js) = +X / −Y here
back = Vector((math.cos(ELEV) * math.sqrt(0.5), -math.cos(ELEV) * math.sqrt(0.5), math.sin(ELEV)))
cam.location = back * 60
cam.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_start = 1
cam.data.clip_end = 160
# the full image's size now: the markers are projected with its aspect before the first render
scene.render.resolution_x = COLS * RES
scene.render.resolution_y = ROWS * RES
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX' if VIEW == 'agx' else 'Standard'
scene.view_settings.look = 'None'
bpy.context.view_layer.update()
right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
cam_up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
up = Vector((0, 0, 1))
toward = back.copy()


def ground_at(tx, ty):
    """The ground point that shows at tile (tx, ty)'s anchor."""
    W = COLS * WINDOW
    H = ROWS * WINDOW
    sx = (tx * WINDOW + AX - W / 2) / PX_PER_UNIT
    sy = (H / 2 - (ty * WINDOW + AY)) / PX_PER_UNIT
    p = cam.location + right * sx + cam_up * sy
    t = p.z / back.z
    return p - back * t


# one copy per direction: the original for the first, linked duplicates for the rest
copies = {}  # direction -> {original name: object}
pivots = {}
for o in model_objs:
    o['orig'] = o.name  # copies carry it
for i, d in enumerate(TILES):
    piv = bpy.data.objects.new(f'pivot{d}', None)
    scene.collection.objects.link(piv)
    piv.location = ground_at(i % COLS, i // COLS)
    piv.rotation_euler = (0, 0, -(d * math.tau / DIRS))
    pivots[d] = (piv, i % COLS, i // COLS)
    if i == 0:
        objs = {o.name: o for o in model_objs}
    else:
        bpy.ops.object.select_all(action='DESELECT')
        for o in model_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = model_objs[0]
        before = set(scene.objects)
        bpy.ops.object.duplicate(linked=True)
        # duplicates keep the custom properties: each knows its original by the tag
        objs = {o['orig']: o for o in scene.objects if o not in before and 'orig' in o}
    for name, o in objs.items():
        if o.parent is None or o.parent.name.startswith('pivot'):
            o.parent = piv
            o.matrix_parent_inverse.identity()
    copies[d] = objs
ORIG = {o: name for d, objs in copies.items() for name, o in objs.items()}  # any copy -> its original's name


def sun(name, direction_from, strength, color, angle):
    light = bpy.data.lights.new(name, 'SUN')
    light.energy = strength
    light.color = color
    light.angle = math.radians(angle)
    o = bpy.data.objects.new(name, light)
    scene.collection.objects.link(o)
    o.rotation_euler = (-direction_from.normalized()).to_track_quat('-Z', 'Y').to_euler()
    return o


# key: upper left, a little in front — casts the soft shadows
key = sun('key', -right * 0.9 + up * 1.35 + toward * 0.55, 4.2, (1.0, 0.95, 0.88), 6)
# rim: behind, on the right — a cool edge on the silhouette
rim = sun('rim', right * 0.7 + up * 0.55 - toward * 1.0, 3.0, (0.72, 0.84, 1.0), 3)
# fill: a weak front light so the shadowed side keeps its detail
fill = sun('fill', right * 0.6 + up * 0.3 + toward * 1.0, 0.7, (0.85, 0.9, 1.0), 20)
fill.data.use_shadow = False
if VIEW == 'agx':  # AgX compresses highlights: a little more light keeps the same brightness
    for li, k in ((key, 1.35), (rim, 1.25), (fill, 1.3)):
        li.data.energy *= k
# ambient: a dim sky
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
sky = world.node_tree.nodes['Background']
sky.inputs['Color'].default_value = (0.36, 0.38, 0.44, 1)
sky.inputs['Strength'].default_value = 0.55 * (1.3 if VIEW == 'agx' else 1)
SKY = sky.inputs['Strength'].default_value
world.light_settings.distance = 0.35  # ambient-occlusion distance (fast GI)

if EEVEE:
    scene.render.engine = 'BLENDER_EEVEE'
    ee = scene.eevee
    ee.taa_render_samples = SAMPLES
    ee.use_shadows = True
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 6
    ee.use_raytracing = EEVEE_RT
    ee.ray_tracing_method = 'SCREEN'
    ee.use_fast_gi = True
    ee.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
    ee.fast_gi_distance = 0.35
    for li in (key, rim):
        if hasattr(li.data, 'use_shadow_jitter'):
            li.data.use_shadow_jitter = True
else:
    scene.render.engine = 'CYCLES'
    c = scene.cycles
    c.device = 'GPU' if GPU else 'CPU'
    c.use_denoising = C['denoiser'] != 'none'
    if c.use_denoising:
        c.denoiser = C['denoiser']
    c.denoising_prefilter = 'FAST'
    c.use_adaptive_sampling = True
    c.adaptive_threshold = C['adaptive_threshold']
    # keep the scene's data between the frames' renders (less to rebuild)
    scene.render.use_persistent_data = C['persistent_data']
    scene.cycles_curves.shape = C['hair_shape']  # hair curves: flat ribbons facing the camera (cheap, alike at 128 px)
    c.max_bounces = 3
    c.diffuse_bounces = 2
    c.glossy_bounces = 1
    c.transmission_bounces = 2
    c.transparent_max_bounces = 4
    c.use_fast_gi = True
    c.fast_gi_method = 'REPLACE'
    c.ao_bounces_render = 1
    world.light_settings.ao_factor = 1.0

# ambient occlusion in every material: base colour × AO (creases and contacts)
for m in bpy.data.materials:
    if not m.node_tree:
        continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf or bsdf.inputs['Emission Strength'].default_value > 0:
        continue
    src = bsdf.inputs['Base Color']
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 8
    ao.inputs['Distance'].default_value = 0.08
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

if BLOOM:
    ng = bpy.data.node_groups.new('bloom', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new('CompositorNodeRLayers')
    gl = ng.nodes.new('CompositorNodeGlare')
    gl.inputs['Type'].default_value = 'Bloom'
    gl.inputs['Threshold'].default_value = 0.9
    gl.inputs['Strength'].default_value = 0.35
    gl.inputs['Size'].default_value = 0.4
    go = ng.nodes.new('NodeGroupOutput')
    ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
    ng.links.new(gl.outputs['Image'], go.inputs['Image'])
    scene.compositing_node_group = ng
    scene.render.use_compositing = True

# the ground for the shadow pass, under every tile
bpy.ops.mesh.primitive_plane_add(size=200)
ground = bpy.context.object
ground.name = 'ground'
ground.hide_render = True
if EEVEE:
    gm = bpy.data.materials.new('shadowFloor')
    gm.use_nodes = True
    gb = gm.node_tree.nodes['Principled BSDF']
    gb.inputs['Base Color'].default_value = (1, 1, 1, 1)
    gb.inputs['Roughness'].default_value = 1.0
    gb.inputs['Specular IOR Level'].default_value = 0.0
    ground.data.materials.append(gm)
else:
    # the catcher only where shadows fall: a disc under each direction's copy,
    # shifted the way the key light throws them (a whole floor would put every
    # background pixel through the path tracer)
    import bmesh
    from mathutils import Matrix
    away = -(-right * 0.9 + up * 1.35 + toward * 0.55)
    away = Vector((away.x, away.y, 0)).normalized()
    bm = bmesh.new()
    for piv, _, _ in pivots.values():
        bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=C['shadow_patch_radius'],
                                matrix=Matrix.Translation(Vector((piv.location.x, piv.location.y, 0)) + away * 0.45))
    bm.to_mesh(ground.data)
    bm.free()
    ground.is_shadow_catcher = True
    # one render per frame: the character, and the shadow it casts on the
    # catcher as the Shadow Catcher pass (+ normal / depth passes if asked) —
    # written through the compositor's File Output, read back as EXR
    ground.hide_render = False
    vl = scene.view_layers[0]
    vl.cycles.use_pass_shadow_catcher = True
    vl.use_pass_normal = 'normal' in PASSES
    vl.use_pass_z = 'depth' in PASSES
    PASS_DIR = tempfile.mkdtemp()
    cg = bpy.data.node_groups.new('passes', 'CompositorNodeTree')
    cg.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = cg.nodes.new('CompositorNodeRLayers')
    cg.links.new(rl.outputs['Image'], cg.nodes.new('NodeGroupOutput').inputs['Image'])
    fo = cg.nodes.new('CompositorNodeOutputFile')
    fo.directory = PASS_DIR + os.sep
    fo.file_name = 'p_'
    fo.format.media_type = 'IMAGE'
    fo.format.file_format = 'OPEN_EXR'
    fo.format.color_depth = '16'
    for item, out_name, kind in (('shadow', 'Shadow Catcher', 'RGBA'), ('normal', 'Normal', 'VECTOR'), ('depth', 'Depth', 'FLOAT')):
        if item == 'shadow' or item in PASSES:
            fo.file_output_items.new(kind, item)
            cg.links.new(rl.outputs[out_name], fo.inputs[item])
    scene.compositing_node_group = cg
    scene.render.use_compositing = True
    # only the key light's shadow lands on the catcher (as in the old separate
    # shadow render): the rim light does not light the ground
    link = bpy.data.collections.new('rimReceivers')
    link.objects.link(ground)
    rim.light_linking.receiver_collection = link
    link.collection_objects[0].light_linking.link_state = 'EXCLUDE'

# ----------------------------------------------------------------------------
# Animations


def actions():
    acts = [a for a in bpy.data.actions if (not ONLY or a.name in ONLY)]
    return sorted(acts, key=lambda a: a.name)


all_objs = list(ORIG)
BASE = {o: (o.location.copy(), o.rotation_quaternion.copy(), o.rotation_euler.copy(), o.scale.copy()) for o in all_objs}


def play(act):
    """Assign the action to every copy of every node that has a slot in it
    (copies use their original's slot). Every node first returns to its base
    pose, so a channel an animation does not key never carries over."""
    slots = {s.identifier: s for s in act.slots}
    for o in all_objs:
        loc, q, e, sc = BASE[o]
        o.location, o.rotation_quaternion, o.rotation_euler, o.scale = loc, q, e, sc
        ad = o.animation_data or o.animation_data_create()
        for tr in ad.nla_tracks:
            tr.mute = True
        slot = slots.get('OB' + ORIG[o])
        if slot:
            ad.action = act
            ad.action_slot = slot
        else:
            ad.action = None


def find(objs, name):
    return next((o for n, o in objs.items() if n == name or n.startswith(name + '.')), None)


MARKERS = ('saberBase', 'saberTip', 'saber2Base', 'saber2Tip')


def to_game(co, d):
    """World point -> game px from direction d's feet (+x right, +y down)."""
    _, tx, ty = pivots[d]
    u, v, _ = world_to_camera_view(scene, cam, co)
    W = COLS * WINDOW
    H = ROWS * WINDOW
    return [round(u * W - (tx * WINDOW + AX), 2), round((1 - v) * H - (ty * WINDOW + AY), 2)]


def blade_segments(base, tip, deps):
    """Stretches (0..1 from base to tip) of the blade not hidden behind the body."""
    toc = back.normalized()
    segs, start, N = [], -1, 14
    for i in range(N + 1):
        f = i / N
        p = base.lerp(tip, f)
        hit, loc, nrm, idx, obj, mat = scene.ray_cast(deps, p + toc * 0.004, toc)
        name = ORIG.get(obj, obj.name if obj else '')
        hidden = bool(hit) and obj is not None and name not in hidden_names and not name.startswith('hilt') and obj is not ground
        if not hidden and start < 0:
            start = f
        if (hidden or i == N) and start >= 0:
            segs.append([round(start, 3), round((i - 0.5) / N if hidden else 1, 3)])
            start = -1
    return segs


# ----------------------------------------------------------------------------
# Render

tmp = tempfile.mkdtemp()
meshes = [o for o in all_objs if o.type == 'MESH' and ORIG[o] not in hidden_names]


def render(path, samples, res):
    if EEVEE:
        scene.eevee.taa_render_samples = samples
    else:
        scene.cycles.samples = samples
    scene.render.resolution_x = COLS * res
    scene.render.resolution_y = ROWS * res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return Image.open(path).convert('RGBA')


def shadow_mode(on):
    """The shadow pass: the ground shows, the characters only cast their shadows."""
    ground.hide_render = not on
    for o in meshes:
        o.visible_camera = not on
    # the shadow is the key light's: the other lights, the sky and the bounces only cost time
    rim.hide_render = fill.hide_render = on
    sky.inputs['Strength'].default_value = 0.0 if on else SKY
    if EEVEE:
        scene.render.film_transparent = not on
        scene.render.use_compositing = BLOOM and not on
    else:
        scene.cycles.max_bounces = 1 if on else 3
        scene.cycles.use_fast_gi = not on


def shadow_alpha(img):
    """EEVEE's shadow pass -> alpha: how much darker than the lit floor."""
    lum = np.asarray(img.convert('L')).astype(np.float32)
    lit = max(1.0, float(np.percentile(lum, 99.5)))
    a = np.clip(1 - lum / lit, 0, 1)
    a[a < 0.03] = 0
    return (a * 255).astype(np.uint8)


def read_pass(name):
    """A pass the compositor wrote this frame -> float array (rows top-down)."""
    path = os.path.join(PASS_DIR, f'p_{name}.exr')
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return np.flipud(a.reshape(h, w, 4))


CAM_R = None  # world -> camera rotation (for the normal pass)


def encode_normal(n, alpha):
    """World normals -> camera space, RGB = n·0.5 + 0.5, alpha = the colour's."""
    nc = n[..., :3] @ np.asarray(CAM_R).T
    rgb = np.clip(nc * 0.5 + 0.5, 0, 1) * 255
    return Image.fromarray(np.dstack((rgb, alpha)).astype(np.uint8), 'RGBA')


def encode_depth(z, d, alpha):
    """Depth round the feet of direction d: 128 = the feet's depth, ±depth_range units to 0 / 255."""
    feet = (pivots[d][0].location - cam.location).dot(-back.normalized())
    g = np.clip(0.5 + (z[..., 0] - feet) / (2 * C['depth_range']), 0, 1) * 255
    return Image.fromarray(np.dstack((g, g, g, alpha)).astype(np.uint8), 'RGBA')


def tile_arr(a, d, res):
    _, tx, ty = pivots[d]
    return a[ty * res:(ty + 1) * res, tx * res:(tx + 1) * res]


def tile(img, d, res):
    _, tx, ty = pivots[d]
    return img.crop((tx * res, ty * res, (tx + 1) * res, (ty + 1) * res))


def flip_markers(mk):
    off = WINDOW - 2 * AX
    return {k: [round(off - v[0], 2), v[1]] for k, v in mk.items()}


frames = []  # (anim, f, dir, char_img, shadow_alpha, markers, blades, flipped)
acts = actions()
nframes = sum(min(int(round(a.frame_range[1])) + 1, MAXF or 10 ** 9) for a in acts)
t_setup = time.time() - T_START
TIMES = os.path.join(ROOT, 'tools', 'sprites', 'out', 'render_times.json')


def estimate_seconds():
    hist = json.load(open(TIMES)) if os.path.exists(TIMES) else {}
    per = hist.get(NAME, {}).get('seconds_per_frame') if hist.get(NAME, {}).get('tiles') == len(TILES) else None
    if per is None:
        table = CFG['estimate']['default_seconds_per_frame']
        per = table.get(str(len(TILES))) or table['16'] * len(TILES) / 16
    return per * nframes


est = estimate_seconds()
print(f'ESTIMATE {NAME}: {nframes} frames × {len(WANTED)} directions = {nframes * len(WANTED)} sprites '
      f'(+ {len(PASSES) - 1} pass(es) each), {nframes * (2 if EEVEE else 1)} renders, about {est / 60:.1f} min', flush=True)
if est / 60 > CFG['estimate']['ask_minutes'] and not opt.get('yes') and not PREVIEW:
    print(f'ASK: over {CFG["estimate"]["ask_minutes"]} min — confirm first, then run again with --yes', flush=True)
    sys.exit(3)
CAM_R = [list(r) for r in cam.matrix_world.to_3x3().inverted()]
if MIRROR and not EEVEE:  # a mirrored direction's copy is only there for its shadow
    for d in TILES:
        if d not in RENDERED:
            for o in copies[d].values():
                if o.type in ('MESH', 'CURVES'):
                    o.visible_camera = False
t_char = t_shadow = 0.0
first = None
done = 0
t0 = time.time()
meta = {}
for act in acts:
    play(act)
    n = int(round(act.frame_range[1])) + 1
    if MAXF:
        n = min(n, MAXF)
    meta[act.name] = n
    for f in range(n):
        scene.frame_set(f)
        deps = bpy.context.evaluated_depsgraph_get()
        mks = {}
        for d in RENDERED:
            mk, bl = {}, {}
            objs = copies[d]
            for k in ('saber', 'saber2'):
                b, t = find(objs, k + 'Base'), find(objs, k + 'Tip')
                if b and t and b.matrix_world.to_scale().length > 0.05:
                    wb, wt = b.matrix_world.translation.copy(), t.matrix_world.translation.copy()
                    mk[k + 'Base'] = to_game(wb, d)
                    mk[k + 'Tip'] = to_game(wt, d)
                    bl[k] = blade_segments(wb, wt, deps)
            mks[d] = (mk, bl)
        ts = time.time()
        if EEVEE:  # two renders: the character, then its shadow on a white floor
            shadow_mode(False)
            img = render(os.path.join(tmp, 'c.png'), SAMPLES, RES)
            dt = time.time() - ts
            ts = time.time()
            shadow_mode(True)
            sh = render(os.path.join(tmp, 's.png'), SH_SAMPLES, SH_RES)
            shadow_mode(False)
            t_shadow += time.time() - ts
        else:  # one render, every pass
            img = render(os.path.join(tmp, 'c.png'), SAMPLES, RES)
            dt = time.time() - ts
            shp = read_pass('shadow')
            nrm = read_pass('normal') if 'normal' in PASSES else None
            dep = read_pass('depth') if 'depth' in PASSES else None
        first = first if first is not None else dt
        t_char += dt
        for d in WANTED:
            src = d if d in RENDERED else mirror_of(d)
            ci = tile(img, src, RES)
            mk, bl = mks[src]
            flipped = src != d
            if flipped:
                ci, mk = ImageOps.mirror(ci), flip_markers(mk)
            extra = {}
            if EEVEE:
                sa = shadow_alpha(tile(sh, d, SH_RES))
            else:
                sa = (np.clip((1 - tile_arr(shp, d, RES)[..., :3].mean(axis=2)) * C['shadow_gain'], 0, 1) * 255).astype(np.uint8)
                alpha = np.asarray(tile(img, src, RES))[..., 3]  # the unflipped tile's

                def flip(im, negate_x=False):
                    a = np.asarray(im)[:, ::-1].copy()
                    if negate_x:  # mirrored: the normal's sideways component turns round
                        a[..., 0] = 255 - a[..., 0]
                    return Image.fromarray(a, 'RGBA')
                if nrm is not None:
                    e = encode_normal(tile_arr(nrm, src, RES), alpha)
                    extra['normal'] = flip(e, True) if flipped else e
                if dep is not None:
                    e = encode_depth(tile_arr(dep, src, RES), src, alpha)
                    extra['depth'] = flip(e) if flipped else e
            sa[sa < C['shadow_threshold']] = 0  # stray noise of the catcher
            frames.append((act.name, f, d, ci, sa, mk, bl, flipped, extra))
        done += 1
        el = time.time() - t0
        print(f'[{done}/{nframes} frames] {act.name} f{f} — {el:.0f}s, ~{el / done * (nframes - done):.0f}s left', flush=True)

t_render = time.time() - t0

# ----------------------------------------------------------------------------
# Downscale, trim, pack, write


class Packer:
    def __init__(self, maxw=4096, maxh=4096):
        self.maxw, self.maxh = maxw, maxh
        self.pages = []
        self.new()

    def new(self):
        self.pages.append([])
        self.x = self.y = self.row = 0

    def add(self, img):
        w, h = img.size
        if self.x + w > self.maxw:
            self.x = 0
            self.y += self.row + 1
            self.row = 0
        if self.y + h > self.maxh:
            self.new()
        r = (len(self.pages) - 1, self.x, self.y)
        self.pages[-1].append((img, self.x, self.y))
        self.x += w + 1
        self.row = max(self.row, h)
        return r

    def save(self, prefix):
        names = []
        for i, items in enumerate(self.pages):
            W = max((x + im.size[0] for im, x, y in items), default=1)
            H = max((y + im.size[1] for im, x, y in items), default=1)
            sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            for im, x, y in items:
                sheet.paste(im, (x, y))
            name = f'{prefix}.png' if i == 0 else f'{prefix}_{i}.png'
            sheet.save(os.path.join(OUT, name), optimize=True)
            names.append(name)
        return names


def downscale(img, size, sharpen=0.0):
    """Lanczos on premultiplied alpha (no dark fringes), then an optional unsharp mask on the colour."""
    a = np.asarray(img).astype(np.float32) / 255
    pm = np.dstack((a[..., :3] * a[..., 3:], a[..., 3:]))
    chans = [np.asarray(Image.fromarray((pm[..., i] * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255 for i in range(4)]
    rgb = np.dstack(chans[:3])
    al = chans[3]
    rgb = np.where(al[..., None] > 1e-3, rgb / np.maximum(al[..., None], 1e-3), 0)
    out = Image.fromarray((np.dstack((np.clip(rgb, 0, 1), np.clip(al, 0, 1))) * 255).astype(np.uint8), 'RGBA')
    if sharpen > 0:
        c = out.convert('RGB').filter(ImageFilter.UnsharpMask(radius=0.8, percent=int(sharpen * 120), threshold=1))
        out = Image.merge('RGBA', (*c.split(), out.split()[3]))
    return out


def trimmed(img, size, sharpen=0.0):
    small = downscale(img, size, sharpen) if img.size[0] != size else img
    a = np.asarray(small)[:, :, 3]
    ys, xs = np.nonzero(a > 2)
    if not len(xs):
        return small.crop((0, 0, 1, 1)), 0, 0
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    return small.crop((x0, y0, x1, y1)), int(x0), int(y0)


for size in SIZES:
    k = WINDOW / size  # game px per sheet px
    ax, ay = AX / k, AY / k  # the feet, in frame px
    cp, sp = Packer(), Packer()
    xp = {name: Packer() for name in PASSES if name in ('normal', 'depth')}  # same layout as the colour
    anims = {}
    for (an, f, d, img, sa, mk, bl, flipped, extra) in frames:
        tm = META.get(an, {})
        A = anims.setdefault(an, {'fps': tm.get('fps', 10), 'loop': tm.get('loop', True), 'hit': tm.get('hit'), 'frames': [[None] * DIRS for _ in range(meta[an])]})
        ci, cx, cy = trimmed(img, size, SHARPEN)
        fx = size - ax if flipped else ax  # a flipped frame's feet sit mirrored in it
        sa_arr = np.asarray(Image.fromarray(sa).resize((size, size), Image.LANCZOS))
        shimg = Image.fromarray(np.dstack([np.zeros_like(sa_arr)] * 3 + [sa_arr]).astype(np.uint8), 'RGBA')
        si, sx, sy = trimmed(shimg, size) if sa_arr.max() > 2 else (shimg.crop((0, 0, 1, 1)), 0, 0)
        p, x, y = cp.add(ci)
        q, x2, y2 = sp.add(si)
        for name, pk in xp.items():  # the same crop of the same downscale, at the same place
            e = downscale(extra[name], size) if extra[name].size[0] != size else extra[name]
            pk.add(e.crop((cx, cy, cx + ci.size[0], cy + ci.size[1])))
        A['frames'][f][d] = {
            'p': p, 'x': x, 'y': y, 'w': ci.size[0], 'h': ci.size[1], 'ox': round(fx - cx, 2), 'oy': round(ay - cy, 2),
            'm': mk, 'b': bl,
            's': {'p': q, 'x': x2, 'y': y2, 'w': si.size[0], 'h': si.size[1], 'ox': round(ax - sx, 2), 'oy': round(ay - sy, 2)},
        }
    prefix = f'{NAME}_{size}'
    out = {
        'name': NAME, 'dirs': DIRS, 'size': size, 'window': WINDOW, 'k': k, 'anchor': [AX, AY],
        'pages': cp.save(prefix), 'shadowPages': sp.save(prefix + '_shadow'), 'anims': anims,
        'source': SOURCE, 'passes': PASSES,
    }
    for name, pk in xp.items():  # normal / depth: the colour's rects on their own pages
        out[name + 'Pages'] = pk.save(f'{prefix}_{name}')
    with open(os.path.join(OUT, prefix + '.json'), 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print(f'wrote {prefix}.json: {len(out["pages"])} page(s), {len(frames)} frames')

total = time.time() - T_START
renders = nframes * (2 if EEVEE else 1)
print(f'TIMING engine={ENGINE}{"/gpu" if GPU else ""} render={RES}px tiles={COLS}x{ROWS} dirs rendered={len(RENDERED)}/{len(WANTED)} frames={nframes} renders={renders} samples={SAMPLES} passes={",".join(PASSES)}')
if not PREVIEW and nframes:  # the measured time per frame, for later estimates
    try:
        hist = json.load(open(TIMES)) if os.path.exists(TIMES) else {}
        hist[NAME] = {'seconds_per_frame': round(t_render / nframes, 2), 'tiles': len(TILES), 'engine': ENGINE, 'gpu': GPU}
        json.dump(hist, open(TIMES, 'w'), indent=1, sort_keys=True)
    except OSError:
        pass
print(f'TIMING setup {t_setup:.1f}s, first render {first or 0:.1f}s, character {t_char:.1f}s ({t_char / max(1, nframes):.2f}s/frame), '
      f'shadow {t_shadow:.1f}s ({t_shadow / max(1, nframes):.2f}s/frame), render loop {t_render:.1f}s, total {total:.1f}s')
