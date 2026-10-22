"""
Movie Duels Anakin: the prepared bind-pose scene for the game's sprite renderer, and the import diagnostics.

  .bvenv/bin/python tools/sprites/md/md_prepare.py <pack> <out dir>

Writes (all private, under tools/sprites/out — the pack's model and textures never go into Git):
  md_anakin_bind.blend (+ .src.json)   the model on the game's ground (md_lib.build: feet at the origin, facing +X,
                                       1.85 m, pack textures, finger bones under the hand, caps hidden) with one
                                       action `bind` (the bind pose, 1 frame) — what render_sprites.py renders
  prepare_report.json                  materials, fixes, scale, hair alpha, normals, caps
  diag_*.png                           close looks: head front/back (hair alpha on light and dark), the wrist caps
                                       shown / hidden, the whole body from four sides at 4 cm/px
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import md_lib  # noqa: E402

PACK, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
HERE = Path(__file__).resolve().parent


def pack_digest():
    h = hashlib.sha256()
    for f in sorted((PACK / 'source').iterdir()) + sorted((PACK / 'textures').iterdir()):
        h.update(f.name.encode() + f.read_bytes())
    for f in ('md_lib.py', 'md_prepare.py'):
        h.update((HERE / f).read_bytes())
    return h.hexdigest()[:16]


def hair_alpha_report():
    """The hair card image: how dark its colour is where it fades out (a dark fringe if so)."""
    im = bpy.data.images.load(str(PACK / 'textures' / 'hair_alpha.tga.png'), check_existing=True)
    px = list(im.pixels[:])
    edge, solid = [0.0, 0], [0.0, 0]
    for i in range(0, len(px), 4 * 7):  # (every 7th pixel: enough for a mean)
        a = px[i + 3]
        lum = (px[i] + px[i + 1] + px[i + 2]) / 3
        if 0.05 < a < 0.6:
            edge[0] += lum
            edge[1] += 1
        elif a > 0.95:
            solid[0] += lum
            solid[1] += 1
    return dict(image='hair_alpha.tga.png', size=list(im.size), channels=im.channels,
                colour_where_fading=round(edge[0] / max(1, edge[1]), 3), colour_where_opaque=round(solid[0] / max(1, solid[1]), 3),
                note='straight alpha; fading pixels keep hair-coloured RGB (no black matte) if the two are close')


def normals_report(meshes):
    """Faces whose normal points into the body (towards the vertical axis through the nearest bone head): flipped faces."""
    out = {}
    for o in md_lib.visible(meshes):
        mw = o.matrix_world
        n3 = mw.to_3x3().inverted().transposed()
        inward = 0
        for p in o.data.polygons:
            c = mw @ p.center
            nrm = (n3 @ p.normal).normalized()
            axis = Vector((0, 0, c.z)) if not o.name.startswith(('l_', 'r_')) else None
            if axis is None:
                continue  # (limbs: no simple inside — skipped)
            d = c - axis
            d.z = 0
            if d.length > 0.02 and nrm.dot(d.normalized()) < -0.3:
                inward += 1
        out[o.name] = dict(faces=len(o.data.polygons), inward=inward)
    return out


def setup(res, samples=32):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    w = bpy.data.worlds.new('diag')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.52, 0.56, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    sc.world = w
    if 'diag_key' not in bpy.data.objects:
        sun = bpy.data.objects.new('diag_key', bpy.data.lights.new('diag_key', 'SUN'))
        sun.data.energy = 3.0
        sc.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(45), 0, math.radians(-30))


def cam(point, azimuth, size, elev=10):
    c = bpy.data.objects.get('diag_cam') or bpy.data.objects.new('diag_cam', bpy.data.cameras.new('diag_cam'))
    if c.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(c)
    bpy.context.scene.camera = c
    c.data.type = 'ORTHO'
    c.data.ortho_scale = size
    a, e = math.radians(azimuth), math.radians(elev)
    d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    c.location = point + d * 10
    c.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def shot(name, bg=None):
    sc = bpy.context.scene
    if bg is not None:
        sc.render.film_transparent = False
        sc.world.node_tree.nodes['Background'].inputs[0].default_value = bg
    sc.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)
    sc.render.film_transparent = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.52, 0.56, 1)
    return name


S = md_lib.build(PACK)
rep = S.report
rep['hair_alpha'] = hair_alpha_report()
rep['normals'] = normals_report(S.meshes)
lo, hi = md_lib.bounds(S.meshes)
rep['facing'] = '+X (render_sprites direction 0); the FBX faced -Y'
rep['diagnostics'] = []
setup(512)
head = Vector((0, 0, hi.z - 0.13))
for az, nm in ((0, 'front'), (180, 'back'), (90, 'left')):  # (the model faces +X: azimuth 0 looks at its face)
    cam(head, az, 0.45)
    rep['diagnostics'].append(shot(f'diag_head_{nm}_light.png', (0.85, 0.85, 0.85, 1)))
    rep['diagnostics'].append(shot(f'diag_head_{nm}_dark.png', (0.03, 0.03, 0.035, 1)))
# the caps: the left wrist, shown and hidden
caps = [o for o in S.meshes if '_cap_' in o.name]
wrist = sum((caps[0].matrix_world @ Vector(c) for c in caps[0].bound_box), Vector()) / 8
for show in (True, False):
    for o in caps:
        o.hide_render = not show
    for az in (0, 90, 200):
        cam(wrist, az, 0.3, 15)
        rep['diagnostics'].append(shot(f'diag_cap_{"shown" if show else "hidden"}_{az:03d}.png', (0.6, 0.62, 0.66, 1)))
for o in caps:
    o.hide_render = True
# whole body, four sides (4 cm / px at 512 px over 2 m)
setup(512, 48)
for az in (0, 90, 180, 270):
    cam(Vector((0, 0, 0.95)), az, 2.05, 8)
    rep['diagnostics'].append(shot(f'diag_body_{az:03d}.png', (0.5, 0.52, 0.56, 1)))

# the bind action: every pose bone at rest, frame 0 (render_sprites.py renders actions)
arm = S.arm
act = bpy.data.actions.new('bind')
act.use_fake_user = True
arm.animation_data_create().action = act
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
    pb.keyframe_insert('rotation_quaternion', frame=0)
    pb.keyframe_insert('location', frame=0)
arm.animation_data.action = None
for o in [o for o in bpy.data.objects if o.name.startswith('diag_')]:
    bpy.data.objects.remove(o)
for im in bpy.data.images:  # (the pack's textures inside the .blend: it opens anywhere without the pack folder)
    if im.source == 'FILE' and not im.packed_file:
        im.pack()
blend = OUT / 'md_anakin_bind.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
digest = pack_digest()
(OUT / 'md_anakin_bind.blend.src.json').write_text(json.dumps({'model': digest, 'anims': {'bind': 'rest'}}, indent=1))
(OUT / 'md_anakin_bind_meta.json').write_text(json.dumps({'anims': {'bind': {'fps': 1, 'loop': True, 'hit': None, 'frames': 1}}}, indent=1))
rep['blend'] = str(blend)
(OUT / 'prepare_report.json').write_text(json.dumps(rep, indent=1, ensure_ascii=False))
print('PREPARED', blend)
