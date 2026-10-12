"""
How close is the hair to the reference's? The hair's silhouette from the front, his right, his
left and the back (orthographic, eye level, rest pose), against the reference's hair
(reference/anakin_hair/sketchfab_s7_*.png, picked out by colour) mapped onto our head by its
landmarks (hair_match_ref.json): the eye line and the chin set the height, the face width (front)
or the nose tip (sides) the breadth — so it is the reference's hair *on our head*, whose
proportions differ. Prints the overlap (IoU) per view and their mean, and writes an overlay per
view (reference red, ours cyan, both white) and one sheet.
  python hair_match.py model.glb out_dir [label]
"""
import builtins
import functools
import json
import math
import os
import sys

import bpy  # noqa: I001
import numpy as np
from mathutils import Vector
from PIL import Image, ImageDraw

print = functools.partial(builtins.print, flush=True)  # noqa: A001
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..', '..')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
GLB, OUT = argv[0], argv[1]
LABEL = argv[2] if len(argv) > 2 else os.path.splitext(os.path.basename(GLB))[0]
REF = json.load(open(os.path.join(HERE, 'hair_match_ref.json')))
N, SCALE, TZ = 400, 0.42, 1.72  # pixels, metres across the frame, the frame's centre height
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
for o in sc.objects:  # the rest pose: no animation
    ad = o.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
        ad.action = None
for o in sc.objects:  # and the bones back at rest (clearing the action leaves the last pose)
    if o.type == 'ARMATURE':
        for pb in o.pose.bones:
            pb.matrix_basis.identity()
sc.frame_set(0)
bpy.context.view_layer.update()
HAIR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('hairV2')]


def verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]


# our landmarks
eye_z = sum(p.z for p in verts(sc.objects['eye1'])) / len(sc.objects['eye1'].data.vertices)
nose = max(verts(sc.objects['nose']), key=lambda p: p.x)
chin_z = min(p.z for p in verts(sc.objects['head']) if p.x > 0.03)  # the jaw's lowest point (front view's chin line)
# the chin tip seen from the side: the front-most point low on the face
chin = max((p for p in verts(sc.objects['head']) if p.z < chin_z + 0.02), key=lambda p: p.x)
eye_x = sum(p.x for p in verts(sc.objects['eye1'])) / len(sc.objects['eye1'].data.vertices)
print(f'OURS eye ({eye_x:.3f}, {eye_z:.3f})  nose ({nose.x:.3f}, {nose.z:.3f})  chin ({chin.x:.3f}, {chin_z:.3f})')

# the silhouettes: hair white, everything else black, flat
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
sc.display.shading.color_type = 'OBJECT'
sc.render.film_transparent = False
sc.render.resolution_x = sc.render.resolution_y = N
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w')
sc.world = w
w.color = (0, 0, 0)
for o in sc.objects:
    if o.type == 'MESH':
        o.color = (1, 1, 1, 1) if o in HAIR else (0.25, 0.25, 0.25, 1)
        if o.name.startswith(('blade', 'Icosphere')):
            o.hide_render = True
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = SCALE
VIEWS = {'front': 0, 'right': -90, 'left': 90, 'back': 180}
RIGHT = {'front': Vector((0, 1, 0)), 'right': Vector((1, 0, 0)), 'left': Vector((-1, 0, 0)), 'back': Vector((0, -1, 0))}


def render(view):
    a = math.radians(VIEWS[view])
    d = Vector((math.cos(a), math.sin(a), 0))
    cam.location = Vector((0, 0, TZ)) + d * 3
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    p = os.path.join(OUT, f'_{view}.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    a = np.asarray(Image.open(p).convert('RGB')).astype(int)
    if not os.environ.get('KEEP'):
        os.remove(p)
    return a[..., 0] > 200, a[..., 0] > 30  # hair, and the figure


def ref_mask(v):
    r = REF['views'][v]
    a = np.asarray(Image.open(os.path.join(ROOT, r['file'])).convert('RGB')).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = (R + G + B) / 3
    bg = (abs(R - 220) < 22) & (abs(G - 220) < 22) & (abs(B - 220) < 22)
    m = (~bg) & (lum < 118) & ((R - G) < 16) & ((R - B) > -3)
    m[r['cut']:] = False
    m[:r.get('top', 250)] = False
    return m


# our pixel grid -> world (h along the camera's right, z)
uu, vv = np.meshgrid(np.arange(N), np.arange(N))
H = (uu + 0.5 - N / 2) / N * SCALE
Z = TZ - (vv + 0.5 - N / 2) / N * SCALE


def sample(m, px, py):
    px, py = np.round(px).astype(int), np.round(py).astype(int)
    ok = (px >= 0) & (py >= 0) & (px < m.shape[1]) & (py < m.shape[0])
    out = np.zeros(px.shape, bool)
    out[ok] = m[py[ok], px[ok]]
    return out


def ref_on_grid(v, front_info=None):
    r = REF['views'][v]
    m = ref_mask(v)
    if v == 'front':
        sz = (chin_z - eye_z) / (r['chin_y'] - r['eye_y'])  # metres per pixel, downwards negative
        sx = REF['our_face_width'] / r['face_w']
        py = r['eye_y'] + (Z - eye_z) / sz
        px = r['centre_x'] + H / sx
        ys, xs = np.nonzero(m)
        info = {'crown_z': eye_z + (ys.min() - r['eye_y']) * sz, 'width': (xs.max() - xs.min()) * sx}
        return sample(m, px, py), info
    if v in ('right', 'left'):
        # a similarity from the reference's eye and chin onto ours (exact for two points; the nose is left
        # out: our face's proportions differ and would skew it), inverted
        sg = 1 if v == 'right' else -1
        dst = np.array([[sg * eye_x, eye_z], [sg * chin.x, chin.z]])
        src = np.array([[r[k][0], -r[k][1]] for k in ('eye', 'chin')], float)
        ms, md = src.mean(0), dst.mean(0)
        a, b = src - ms, dst - md
        U, S_, Vt = np.linalg.svd(b.T @ a)
        Rm = U @ Vt
        if np.linalg.det(Rm) < 0:
            Vt[-1] *= -1
            Rm = U @ Vt
        k = S_.sum() / (a ** 2).sum()
        # world (H, Z) -> reference: src = Rm^T (dst - md) / k + ms
        d0, d1 = H - md[0], Z - md[1]
        sx = (Rm[0, 0] * d0 + Rm[1, 0] * d1) / k + ms[0]
        sy = (Rm[0, 1] * d0 + Rm[1, 1] * d1) / k + ms[1]
        print(f'  {v}: scale {k * 1000:.3f} mm/px, rotation {math.degrees(math.atan2(Rm[1, 0], Rm[0, 0])):+.1f} deg')
        return sample(m, sx, -sy), None
    # the back: no face — its width to the front's hair width, its top to the front's crown
    ys, xs = np.nonzero(m)
    s = front_info['width'] / (xs.max() - xs.min())
    cx = (xs.max() + xs.min()) / 2
    py = ys.min() + (front_info['crown_z'] - Z) / s
    px = cx + H / s
    return sample(m, px, py), None


res, sheet = {}, []
_, finfo = ref_on_grid('front')
print(f"REF crown {finfo['crown_z']:.3f} m, hair width {finfo['width']:.3f} m (on our head)")
for v in VIEWS:
    ours, fig = render(v)
    ref, _ = ref_on_grid(v, finfo)
    inter, union = (ours & ref).sum(), (ours | ref).sum()
    iou = inter / max(1, union)
    # where they differ, as heights: the lowest hair of each (its length)
    low_o = Z[ours].min() if ours.any() else 0
    low_r = Z[ref].min() if ref.any() else 0
    res[v] = {'iou': round(float(iou), 3), 'ours_only': int((ours & ~ref).sum()), 'ref_only': int((ref & ~ours).sum()),
              'lowest_ours': round(float(low_o), 3), 'lowest_ref': round(float(low_r), 3)}
    img = np.zeros((N, N, 3), np.uint8)
    img[fig & ~ours] = (60, 60, 60)
    img[ref & ~ours] = (230, 40, 40)
    img[ours & ~ref] = (40, 200, 220)
    img[ours & ref] = (240, 240, 240)
    im = Image.fromarray(img)
    ImageDraw.Draw(im).text((6, 6), f'{v}  IoU {iou:.3f}', fill=(255, 220, 120))
    sheet.append(im)
    print(f"VIEW {v:5s} IoU {iou:.3f}  ours-only {res[v]['ours_only']:6d}  ref-only {res[v]['ref_only']:6d}  lowest: ours {low_o:.3f} ref {low_r:.3f}")
mean = sum(r['iou'] for r in res.values()) / len(res)
print(f'MEAN IoU {mean:.3f}')
S = Image.new('RGB', (N * 4 + 18, N + 26), (14, 15, 18))
ImageDraw.Draw(S).text((6, 6), f'{LABEL} - reference red, ours cyan, both white - mean IoU {mean:.3f}', fill=(255, 220, 120))
for i, im in enumerate(sheet):
    S.paste(im, (i * (N + 6), 26))
S.save(os.path.join(OUT, f'{LABEL}_match.png'))
json.dump({'label': LABEL, 'mean_iou': mean, 'views': res}, open(os.path.join(OUT, f'{LABEL}_match.json'), 'w'), indent=1)
os._exit(0)
