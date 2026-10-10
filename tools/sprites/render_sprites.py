"""
Render a .glb character into isometric sprite sheets for the game.

  python render_sprites.py model.glb out_dir [options]          (bpy module, no window)
  blender -b -P render_sprites.py -- model.glb out_dir [options]  (Blender in background)

  --name NAME          output file prefix (default: the .glb's name)
  --engine cycles      cycles (path traced; the fastest without a GPU) or
                       eevee (the fastest with one; bloom, AO from its settings)
  --dirs 8             facing directions (game convention: direction i faces
                       i·360/dirs degrees, turning like the game's units)
  --mirror 0           1: render only the directions that are not a mirror
                       image of another (5 of 8) and flip those for the rest
                       (an asymmetric model swaps sides there); 0: render all
  --render 256         render resolution of one direction (square)
  --sizes 128          output frame sizes; each is a downscale of the render
                       (one sheet + JSON per size; the game draws 128, where
                       one sheet pixel is one game pixel)
  --shadow-render 128  render resolution of one direction's shadow
  --window 128         game pixels the frame covers (1 game px = 1 px at 128)
  --anchor 64,96       where the model's feet are inside the frame (game px)
  --anims a,b          only these animations (default: every one in the .glb)
  --frames N           only the first N frames of each animation (previews)
  --only-dirs 0,2      only these directions (previews)
  --samples N          Cycles: samples, adaptive and denoised (default 16);
                       EEVEE: anti-aliasing samples (default 16)
  --shadow-samples N   samples for the shadow pass (Cycles 4, EEVEE 8)
  --sharpen 0.5        unsharp mask after the downscale (0 = off): crisp edges at 128 px
  --view standard      colour view transform: standard or agx (softer highlights)
  --bloom 1            EEVEE: a soft bloom on the brightest highlights (compositor glare)
  --hair FILE.blend    hair curves from build_hair.py, attached to the head bone
  --meta FILE.json     timing per animation (fps, loop, hit frame) — e.g. the
                       export_rig_anims.mjs output; default 10 fps, looping
  --hide blade         objects whose name starts with these are not rendered
                       (the game draws saber blades itself) but still give
                       blade occlusion

Camera: orthographic, 30° above the ground, looking along the game's view
diagonal — the projection the game's tiles use (28.28 px per unit, 2:1). The
lights stay fixed to the camera: a soft key light from the upper left that
casts shadows, a cool rim light from behind on the right, a dim sky for
ambient light, plus ambient occlusion (an AO term multiplied into every
material's colour, and the engine's fast-GI AO for the ambient light).

Speed: every direction is its own copy of the model (linked duplicates,
sharing the meshes and the animation), turned to that direction and set out
on the ground so that it lands in its own tile of one wide image. A frame of
animation is then two renders — every direction at once, then every shadow
at once — instead of two per direction: the fixed cost of a render (scene
sync, BVH, denoising, shader setup) is paid twice per frame, not sixteen
times. Each tile is cut out afterwards.

Mirroring (--mirror 1): the camera looks along the screen's vertical, so a
model facing angle a looks, mirrored left–right, like one facing 90° − a;
with 8 directions, 2, 6, 7 are 0, 4, 3 flipped. Shadows are always rendered
for the real direction.

Shadows: Cycles renders them on an invisible shadow-catcher ground; EEVEE
(no shadow catcher) on a white floor lit only by the key light, the shadow's
alpha being how much darker the floor is there. In both the character is
invisible to the camera but casts its shadow. Both passes are downscaled
with Lanczos (premultiplied alpha), trimmed, and packed into sheet pages:

  NAME_SIZE.png / NAME_SIZE_shadow.png (+ _1, _2… pages if needed)
  NAME_SIZE.json:
    { name, dirs, size, window, k (game px per sheet px), anchor,
      pages: [...], shadowPages: [...],
      anims: { anim: { fps, loop, hit, frames: [ [ per direction:
        { p, x, y, w, h, ox, oy,               // sheet rect + anchor in it
          m: { saberBase: [x, y], saberTip },  // game px from the feet
          b: { saber: [[s0, s1], …] },         // blade stretches in front
          s: { p, x, y, w, h, ox, oy } }       // the shadow's rect
      ] ] } } }

Animation: every glTF animation of the .glb (an action with a slot per
node) is played frame by frame; frames are the action's whole keyframes.

The run prints how long the setup, the character renders and the shadow
renders took.
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


def parse(argv):
    pos, opt = [], {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--'):
            opt[a[2:]] = argv[i + 1]
            i += 2
        else:
            pos.append(a)
            i += 1
    return pos, opt


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
pos, opt = parse(argv)
GLB, OUT = pos[0], pos[1]
NAME = opt.get('name', os.path.splitext(os.path.basename(GLB))[0])
ENGINE = opt.get('engine', 'cycles')
EEVEE = ENGINE == 'eevee'
DIRS = int(opt.get('dirs', 8))
MIRROR = opt.get('mirror', '0') == '1'
RES = int(opt.get('render', 256))
SH_RES = int(opt.get('shadow-render', 128))
SIZES = [int(x) for x in opt.get('sizes', '128').split(',')]
WINDOW = float(opt.get('window', 128))
AX, AY = [float(x) for x in opt.get('anchor', '64,96').split(',')]
ONLY = opt.get('anims', '').split(',') if opt.get('anims') else None
MAXF = int(opt['frames']) if 'frames' in opt else None
SAMPLES = int(opt.get('samples', 16))
SH_SAMPLES = int(opt.get('shadow-samples', 8 if EEVEE else 4))
SHARPEN = float(opt.get('sharpen', 0.5))
VIEW = opt.get('view', 'standard')
BLOOM = opt.get('bloom', '1') == '1' and EEVEE
EEVEE_RT = opt.get('eevee-raytrace', '1') == '1'
HIDE = opt.get('hide', 'blade').split(',')
META = json.load(open(opt['meta']))['anims'] if 'meta' in opt else {}
ONLY_DIRS = [int(x) for x in opt['only-dirs'].split(',')] if 'only-dirs' in opt else None
os.makedirs(OUT, exist_ok=True)

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

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
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
    c.device = 'CPU'
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.denoising_prefilter = 'FAST'
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.03
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
    ground.is_shadow_catcher = True

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
        shadow_mode(False)
        img = render(os.path.join(tmp, 'c.png'), SAMPLES, RES)
        dt = time.time() - ts
        first = first if first is not None else dt
        t_char += dt
        ts = time.time()
        shadow_mode(True)
        sh = render(os.path.join(tmp, 's.png'), SH_SAMPLES, SH_RES)
        shadow_mode(False)
        t_shadow += time.time() - ts
        for d in WANTED:
            src = d if d in RENDERED else mirror_of(d)
            ci = tile(img, src, RES)
            mk, bl = mks[src]
            flipped = src != d
            if flipped:
                ci, mk = ImageOps.mirror(ci), flip_markers(mk)
            st = tile(sh, d, SH_RES)
            if EEVEE:
                sa = shadow_alpha(st)
            else:
                sa = np.asarray(st)[:, :, 3].copy()
                sa[sa < 10] = 0  # stray noise of the shadow catcher
            frames.append((act.name, f, d, ci, sa, mk, bl, flipped))
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
    anims = {}
    for (an, f, d, img, sa, mk, bl, flipped) in frames:
        tm = META.get(an, {})
        A = anims.setdefault(an, {'fps': tm.get('fps', 10), 'loop': tm.get('loop', True), 'hit': tm.get('hit'), 'frames': [[None] * DIRS for _ in range(meta[an])]})
        ci, cx, cy = trimmed(img, size, SHARPEN)
        fx = size - ax if flipped else ax  # a flipped frame's feet sit mirrored in it
        sa_arr = np.asarray(Image.fromarray(sa).resize((size, size), Image.LANCZOS))
        shimg = Image.fromarray(np.dstack([np.zeros_like(sa_arr)] * 3 + [sa_arr]).astype(np.uint8), 'RGBA')
        si, sx, sy = trimmed(shimg, size) if sa_arr.max() > 2 else (shimg.crop((0, 0, 1, 1)), 0, 0)
        p, x, y = cp.add(ci)
        q, x2, y2 = sp.add(si)
        A['frames'][f][d] = {
            'p': p, 'x': x, 'y': y, 'w': ci.size[0], 'h': ci.size[1], 'ox': round(fx - cx, 2), 'oy': round(ay - cy, 2),
            'm': mk, 'b': bl,
            's': {'p': q, 'x': x2, 'y': y2, 'w': si.size[0], 'h': si.size[1], 'ox': round(ax - sx, 2), 'oy': round(ay - sy, 2)},
        }
    prefix = f'{NAME}_{size}'
    out = {
        'name': NAME, 'dirs': DIRS, 'size': size, 'window': WINDOW, 'k': k, 'anchor': [AX, AY],
        'pages': cp.save(prefix), 'shadowPages': sp.save(prefix + '_shadow'), 'anims': anims,
    }
    with open(os.path.join(OUT, prefix + '.json'), 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print(f'wrote {prefix}.json: {len(out["pages"])} page(s), {len(frames)} frames')

total = time.time() - T_START
print(f'TIMING engine={ENGINE} render={RES}px tiles={COLS}x{ROWS} dirs rendered={len(RENDERED)}/{len(WANTED)} frames={nframes} renders={nframes * 2}')
print(f'TIMING setup {t_setup:.1f}s, first render {first or 0:.1f}s, character {t_char:.1f}s ({t_char / max(1, nframes):.2f}s/frame), '
      f'shadow {t_shadow:.1f}s ({t_shadow / max(1, nframes):.2f}s/frame), render loop {t_render:.1f}s, total {total:.1f}s')
