"""
Render a .glb character into isometric sprite sheets for the game.

  python render_sprites.py model.glb out_dir [options]          (bpy module)
  blender -b -P render_sprites.py -- model.glb out_dir [options]

  --name NAME          output file prefix (default: the .glb's name)
  --dirs 8             facing directions (game convention: direction i faces
                       i·360/dirs degrees, turning like the game's units)
  --render 512         render resolution (square, transparent PNG)
  --sizes 128,256      output frame sizes; each is a downscale of the render
                       (one sheet + JSON per size: 128 for Original graphics,
                       256 for Remaster)
  --window 128         game pixels the frame covers (1 game px = 1 px at 128)
  --anchor 64,96       where the model's feet are inside the frame (game px)
  --anims a,b          only these animations (default: every one in the .glb)
  --frames N           only the first N frames of each animation (previews)
  --only-dirs 0,2      only these directions (previews)
  --samples 24         Cycles samples for the character (denoised)
  --shadow-samples 12  Cycles samples for the shadow pass
  --hide blade         objects whose name starts with these are not rendered
                       (the game draws saber blades itself) but still give
                       blade occlusion

Camera: orthographic, 30° above the ground, looking along the game's view
diagonal — the projection the game's tiles use (28.28 px per unit, 2:1). The
model turns under it for each direction; the lights stay fixed to the
camera: a soft key light from the upper left that casts shadows, a cool rim
light from behind on the right, a dim sky for ambient light, plus ambient
occlusion (an AO term multiplied into every material's colour, and Cycles'
fast-GI AO for the ambient light), so creases and contacts darken.

Each frame is rendered twice: the character alone (transparent background),
then its shadow alone on an invisible shadow-catcher ground — so the game
can draw shadows under everything else. Both are downscaled with Lanczos
(premultiplied alpha), trimmed, and packed into sheet pages:

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
"""
import json
import math
import os
import sys
import tempfile
import time

import bpy  # noqa: I001 (bpy first: it makes mathutils / bpy_extras importable)
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from PIL import Image

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
DIRS = int(opt.get('dirs', 8))
RES = int(opt.get('render', 512))
SIZES = [int(x) for x in opt.get('sizes', '128,256').split(',')]
WINDOW = float(opt.get('window', 128))
AX, AY = [float(x) for x in opt.get('anchor', '64,96').split(',')]
ONLY = opt.get('anims', '').split(',') if opt.get('anims') else None
MAXF = int(opt['frames']) if 'frames' in opt else None
SAMPLES = int(opt.get('samples', 24))
SH_SAMPLES = int(opt.get('shadow-samples', 12))
HIDE = opt.get('hide', 'blade').split(',')
ONLY_DIRS = [int(x) for x in opt['only-dirs'].split(',')] if 'only-dirs' in opt else None
os.makedirs(OUT, exist_ok=True)

# the game's projection: PX_PER_UNIT = HALF_W / √½ (src/core/iso.js, HALF_W = 20 → 28.28 px per unit)
HALF_W = 20
PX_PER_UNIT = HALF_W / math.sqrt(0.5)

# ----------------------------------------------------------------------------
# Scene: the model on a turntable

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
bpy.ops.import_scene.gltf(filepath=GLB)
model_objs = list(scene.objects)
turn = bpy.data.objects.new('turntable', None)
scene.collection.objects.link(turn)
for o in model_objs:
    if o.parent is None:
        o.parent = turn
hidden = [o for o in model_objs if any(o.name.startswith(h) for h in HIDE)]
for o in hidden:
    o.hide_render = True
blade_like = {o.name for o in hidden}

# ----------------------------------------------------------------------------
# Camera: orthographic, 30° elevation, the game's view diagonal

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = WINDOW / PX_PER_UNIT
# the game's camera sits towards +X / +Z (three.js) = +X / −Y here
back = Vector((math.cos(ELEV) * math.sqrt(0.5), -math.cos(ELEV) * math.sqrt(0.5), math.sin(ELEV)))
cam.location = back * 30
cam.rotation_euler = (-back).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_start = 1
cam.data.clip_end = 80
# put the feet (the origin) at the anchor
cam.data.shift_x = -(AX / WINDOW - 0.5)
cam.data.shift_y = AY / WINDOW - 0.5
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

# camera-relative directions for the lights
right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
up = Vector((0, 0, 1))
toward = back.copy()


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
sun('key', -right * 0.9 + up * 1.35 + toward * 0.55, 4.2, (1.0, 0.95, 0.88), 6)
# rim: behind, on the right — a cool edge on the silhouette
sun('rim', right * 0.7 + up * 0.55 - toward * 1.0, 3.0, (0.72, 0.84, 1.0), 3)
# fill: a weak front light so the shadowed side keeps its detail
fill = sun('fill', right * 0.6 + up * 0.3 + toward * 1.0, 0.7, (0.85, 0.9, 1.0), 20)
fill.data.use_shadow = False
# ambient: a dim sky
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.36, 0.38, 0.44, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
world.light_settings.distance = 0.35  # ambient-occlusion distance (fast GI)

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.cycles.use_fast_gi = True
scene.cycles.fast_gi_method = 'REPLACE'
scene.cycles.ao_bounces_render = 1
world.light_settings.ao_factor = 1.0
scene.render.use_persistent_data = False  # it would keep the shadow catcher between passes

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
    ao.samples = 12
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

# the ground: a shadow catcher, used only for the shadow pass
bpy.ops.mesh.primitive_plane_add(size=40)
ground = bpy.context.object
ground.name = 'ground'
ground.is_shadow_catcher = True
ground.hide_render = True

# ----------------------------------------------------------------------------
# Animations


def actions():
    acts = [a for a in bpy.data.actions if (not ONLY or a.name in ONLY)]
    return sorted(acts, key=lambda a: a.name)


def play(act):
    """Assign the action to every node that has a slot in it."""
    for o in model_objs:
        ad = o.animation_data or o.animation_data_create()
        for tr in ad.nla_tracks:
            tr.mute = True
        slot = next((s for s in act.slots if s.identifier == 'OB' + o.name), None)
        if slot:
            ad.action = act
            ad.action_slot = slot
        else:
            ad.action = None


def find(name):
    return next((o for o in model_objs if o.name == name or o.name.startswith(name + '.')), None)


markers = {n: find(n) for n in ('saberBase', 'saberTip', 'saber2Base', 'saber2Tip')}
markers = {k: v for k, v in markers.items() if v}


def to_game(co):
    """World point -> game px from the feet (+x right, +y down)."""
    u, v, _ = world_to_camera_view(scene, cam, co)
    return [round(u * WINDOW - AX, 2), round((1 - v) * WINDOW - AY, 2)]


def visible_scale(o):
    m = o.matrix_world
    return m.to_scale().length > 0.05


def blade_segments(base, tip, deps):
    """Stretches (0..1 from base to tip) of the blade not hidden behind the body."""
    toc = back.normalized()
    segs, start, N = [], -1, 14
    for i in range(N + 1):
        f = i / N
        p = base.lerp(tip, f)
        hit, loc, nrm, idx, obj, mat = scene.ray_cast(deps, p + toc * 0.004, toc)
        hidden = bool(hit) and obj is not None and obj.name not in blade_like and not obj.name.startswith('hilt')
        if not hidden and start < 0:
            start = f
        if (hidden or i == N) and start >= 0:
            segs.append([round(start, 3), round((i - 0.5) / N if hidden else 1, 3)])
            start = -1
    return segs


# ----------------------------------------------------------------------------
# Render

tmp = tempfile.mkdtemp()


def render(path, samples):
    scene.cycles.samples = samples
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return Image.open(path).convert('RGBA')


def shadow_mode(on):
    ground.hide_render = not on
    for o in model_objs:
        if o.type == 'MESH' and o.name not in blade_like:
            o.visible_camera = not on  # still casts its shadow


frames = []  # (anim, f, dir, char_img, shadow_img, markers, blades)
acts = actions()
total = sum(min(int(a.frame_range[1]) + 1, MAXF or 1e9) for a in acts) * (len(ONLY_DIRS) if ONLY_DIRS else DIRS)
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
        for d in range(DIRS):
            if ONLY_DIRS is not None and d not in ONLY_DIRS:
                continue
            turn.rotation_euler = (0, 0, -(d * math.tau / DIRS))
            bpy.context.view_layer.update()
            deps = bpy.context.evaluated_depsgraph_get()
            mk, bl = {}, {}
            for k in ('saber', 'saber2'):
                b, t = markers.get(k + 'Base'), markers.get(k + 'Tip')
                if b and t and visible_scale(b):
                    wb, wt = b.matrix_world.translation.copy(), t.matrix_world.translation.copy()
                    mk[k + 'Base'] = to_game(wb)
                    mk[k + 'Tip'] = to_game(wt)
                    bl[k] = blade_segments(wb, wt, deps)
            shadow_mode(False)
            img = render(os.path.join(tmp, 'c.png'), SAMPLES)
            shadow_mode(True)
            sh = render(os.path.join(tmp, 's.png'), SH_SAMPLES)
            shadow_mode(False)
            frames.append((act.name, f, d, img, sh, mk, bl))
            done += 1
            if done % 8 == 0 or done == total:
                el = time.time() - t0
                print(f'[{done}/{total}] {act.name} f{f} — {el:.0f}s, ~{el / done * (total - done):.0f}s left', flush=True)

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
        self.h = 0

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


def trimmed(img, size):
    """Downscale (Lanczos, premultiplied alpha), trim to the visible pixels."""
    small = img.resize((size, size), Image.LANCZOS)
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
    for (an, f, d, img, sh, mk, bl) in frames:
        act = next(a for a in acts if a.name == an)
        A = anims.setdefault(an, {'frames': [[None] * DIRS for _ in range(meta[an])]})
        ci, cx, cy = trimmed(img, size)
        # the shadow: black with the catcher's alpha
        sa = np.asarray(sh.resize((size, size), Image.LANCZOS))[:, :, 3]
        shimg = Image.fromarray(np.dstack([np.zeros_like(sa)] * 3 + [sa]).astype(np.uint8), 'RGBA')
        si, sx, sy = trimmed(shimg, size) if sa.max() > 2 else (shimg.crop((0, 0, 1, 1)), 0, 0)
        p, x, y = cp.add(ci)
        q, x2, y2 = sp.add(si)
        A['frames'][f][d] = {
            'p': p, 'x': x, 'y': y, 'w': ci.size[0], 'h': ci.size[1], 'ox': round(ax - cx, 2), 'oy': round(ay - cy, 2),
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
