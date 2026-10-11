"""
Does the hair sit on the head and move with it? For a model with hair_v2.py's hair, over every
frame of every animation (every `step`-th frame):

  follow  — the hair's vertices in the head bone's space: how far any of them drifts from where it
            is in the first frame (0 = rigid on the head, as it must be);
  gap     — how far the hair shell's inner side is from the scalp (the head and ears): everywhere, and along the
            hairline (the shell's open edge, where a gap shows as hair floating off the head);
  clip    — hair vertices inside the neck, collar, yoke, torso or tabard meshes (how many, and
            how deep the deepest one is), per animation.

  python hair_fit.py model.glb [step=2] [out.json]
Prints one line per animation and a summary; FAIL lines name what is over the limits below.
"""
import builtins
import functools
import json
import math
import os
import sys

import bpy  # noqa: I001
from mathutils import Vector
from mathutils.bvhtree import BVHTree

print = functools.partial(builtins.print, flush=True)  # noqa: A001
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
GLB = argv[0]
STEP = int(argv[1]) if len(argv) > 1 else 2
OUT = argv[2] if len(argv) > 2 else None
LIMIT = {'follow': 0.0005, 'gap_edge': 0.006, 'clip_depth': 0.004}  # metres

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
HAIR = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('hairV2')]
SHELL = next(o for o in HAIR if o.name.startswith('hairV2Shell'))
SCALP = [o for o in sc.objects if o.type == 'MESH' and (o.name == 'head' or o.name.startswith('ear'))]


def HEAD_BVH(dg):
    vs, fs = [], []
    for o in SCALP:
        e = o.evaluated_get(dg)
        m = e.to_mesh()
        n0 = len(vs)
        vs += [e.matrix_world @ v.co for v in m.vertices]
        fs += [tuple(n0 + i for i in p.vertices) for p in m.polygons]
        e.to_mesh_clear()
    return BVHTree.FromPolygons(vs, fs)


BODY_PREFIX = ('neck', 'collar', 'yoke', 'tunicTorso', 'tabardTorso', 'tabardShoulder', 'tabardBack', 'tabardL', 'tabardR', 'lapel', 'sash', 'hood', 'cloak')
BODY = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith(BODY_PREFIX)]
print('HAIR', [o.name for o in HAIR], 'BODY', len(BODY), [o.name for o in BODY][:12])

# the shell's open edge: the hairline
sm = SHELL.data
edge_count = {}
for p in sm.polygons:
    for k in p.edge_keys:
        edge_count[k] = edge_count.get(k, 0) + 1
EDGE_V = sorted({v for k, c in edge_count.items() if c == 1 for v in k})
# the shell's UVs say where a vertex is: u round the head from the back (u = 0.5 the front), v from the
# crown (0) to the edge (1). The hairline proper — the front and the temples, where the hair grows out of
# the skin — must touch the scalp; the edge behind hangs (its gap is reported, not limited).
uv = sm.uv_layers.active.data
vuv = {}
for lp in sm.loops:
    vuv[lp.vertex_index] = uv[lp.index].uv
HAIRLINE = [i for i in EDGE_V if vuv[i][1] > 0.5 and math.cos(-math.pi + math.tau * vuv[i][0]) > 0.25]
HANG = [i for i in EDGE_V if vuv[i][1] > 0.5 and i not in set(HAIRLINE)]
print('EDGE', len(EDGE_V), 'hairline', len(HAIRLINE), 'hanging', len(HANG))


def world_verts(o, dg):
    e = o.evaluated_get(dg)
    m = e.to_mesh()
    pts = [e.matrix_world @ v.co for v in m.vertices]
    e.to_mesh_clear()
    return pts


def bvh_of(o, dg):
    e = o.evaluated_get(dg)
    m = e.to_mesh()
    vs = [e.matrix_world @ v.co for v in m.vertices]
    fs = [tuple(p.vertices) for p in m.polygons]
    e.to_mesh_clear()
    return BVHTree.FromPolygons(vs, fs) if fs else None


def set_action(act):
    for o in sc.objects:
        ad = o.animation_data
        if not ad:
            continue
        for t in ad.nla_tracks:
            t.mute = True
        slot = next((x for x in act.slots if x.identifier == 'OB' + o.name), None)
        ad.action = act if slot else None
        if slot:
            ad.action_slot = slot


def head_inv():
    return (arm.matrix_world @ arm.pose.bones['head'].matrix).inverted()


report = {}
worst = {'follow': 0.0, 'gap_edge': 0.0, 'clip_depth': 0.0}
ref_local = None
for act in sorted(bpy.data.actions, key=lambda a: a.name):
    set_action(act)
    f0, f1 = (int(x) for x in act.frame_range)
    r = {'frames': 0, 'follow': 0.0, 'gap_mean': 0.0, 'gap_edge_max': 0.0, 'clip_verts': 0, 'clip_depth': 0.0, 'clip_with': {}}
    gaps = []
    for f in range(f0, f1 + 1, STEP):
        sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        inv = head_inv()
        hair = [p for o in HAIR for p in world_verts(o, dg)]
        local = [inv @ p for p in hair]
        if ref_local is None:
            ref_local = local
        r['follow'] = max(r['follow'], max((a - b).length for a, b in zip(local, ref_local)))
        # the gap: the shell to the scalp
        hb = HEAD_BVH(dg)
        shell = world_verts(SHELL, dg)
        d = [hb.find_nearest(p)[3] for p in shell]
        gaps.append(sum(d) / len(d))
        r['gap_edge_max'] = max(r['gap_edge_max'], max(d[i] for i in HAIRLINE))
        r['gap_hang_max'] = max(r.get('gap_hang_max', 0.0), max(d[i] for i in HANG))
        # clipping: hair vertices behind the surface of a body mesh (nearest point, its normal)
        for o in BODY:
            b = bvh_of(o, dg)
            if not b:
                continue
            n_in, deep = 0, 0.0
            for p in hair:
                loc, nrm, _, dist = b.find_nearest(p, 0.03)
                if loc is not None and (p - loc).dot(nrm) < -1e-4:
                    n_in += 1
                    deep = max(deep, dist)
            if n_in:
                r['clip_verts'] = max(r['clip_verts'], n_in)
                r['clip_depth'] = max(r['clip_depth'], deep)
                r['clip_with'][o.name] = max(r['clip_with'].get(o.name, 0.0), round(deep, 4))
        r['frames'] += 1
    r['gap_mean'] = sum(gaps) / len(gaps)
    report[act.name] = r
    worst['follow'] = max(worst['follow'], r['follow'])
    worst['gap_edge'] = max(worst['gap_edge'], r['gap_edge_max'])
    worst['clip_depth'] = max(worst['clip_depth'], r['clip_depth'])
    print(f"ANIM {act.name:10s} frames {r['frames']:3d}  follow {r['follow'] * 1000:6.2f} mm  gap mean {r['gap_mean'] * 1000:5.1f} mm  "
          f"hairline max {r['gap_edge_max'] * 1000:5.1f} mm  hanging edge max {r['gap_hang_max'] * 1000:5.1f} mm  clip {r['clip_verts']:4d} verts, {r['clip_depth'] * 1000:5.1f} mm  {r['clip_with']}")
print('WORST', {k: round(v * 1000, 2) for k, v in worst.items()}, 'mm')
for k, lim in LIMIT.items():
    print(('FAIL' if worst[k] > lim else 'OK  '), k, f'{worst[k] * 1000:.2f} mm (limit {lim * 1000:.1f} mm)')
if OUT:
    json.dump({'model': os.path.basename(GLB), 'step': STEP, 'worst_mm': {k: v * 1000 for k, v in worst.items()}, 'anims': report}, open(OUT, 'w'), indent=1)
os._exit(0)
