"""
Mesh diagnostics for a character .glb (Blender).

  python diagnose_mesh.py model.glb report.md [anim] [frame]

The model is posed (default idleOff frame 0) and every mesh is checked in
world space:
  islands         disconnected pieces inside one object (loose parts)
  flipped         faces whose winding disagrees with their neighbours, and
                  closed parts whose normals point inwards (negative volume)
  zero thickness  open shells (boundary edges: a surface with no back),
                  degenerate faces (no area), duplicate vertices
  intersections   pairs of parts whose triangles cross each other (BVH
                  overlap), with the number of crossing triangle pairs

Writes a Markdown report and the same data as JSON next to it.
"""
import json
import sys
from collections import defaultdict

import bpy  # noqa: I001
import bmesh
from mathutils.bvhtree import BVHTree

glb, out = sys.argv[1], sys.argv[2]
ANIM = sys.argv[3] if len(sys.argv) > 3 else 'idleOff'
FRAME = int(sys.argv[4]) if len(sys.argv) > 4 else 0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
act = bpy.data.actions.get(ANIM)
for o in sc.objects:
    ad = o.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
        slot = act and next((x for x in act.slots if x.identifier == 'OB' + o.name), None)
        ad.action = act if slot else None
        if slot:
            ad.action_slot = slot
sc.frame_set(FRAME)
deps = bpy.context.evaluated_depsgraph_get()


def visible(o):
    """Hidden by animation (scale ~0: the saber with the blade off, etc.)?"""
    return o.matrix_world.to_scale().length > 0.05


meshes = [o for o in sc.objects if o.type == 'MESH' and visible(o)]
report = {'anim': ANIM, 'frame': FRAME, 'parts': {}, 'intersections': []}
bvh = {}
for o in meshes:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.transform(o.matrix_world)
    # true duplicates: same place AND same UV — the vertices glTF splits along
    # UV / shading seams are not duplicates (the format needs them)
    uv = bm.loops.layers.uv.active
    seen_k = set()
    dup = 0
    for v in bm.verts:
        lp = v.link_loops[0] if v.link_loops else None
        k = (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5),
             tuple(round(c, 4) for c in lp[uv].uv) if (lp and uv) else (), tuple(round(c, 3) for c in v.normal))
        if k in seen_k:
            dup += 1
        seen_k.add(k)
    # the rest is measured on a welded copy: the real pieces, holes and windings
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    # islands
    seen = set()
    islands = 0
    for v in bm.verts:
        if v.index in seen:
            continue
        islands += 1
        stack = [v]
        while stack:
            w = stack.pop()
            if w.index in seen:
                continue
            seen.add(w.index)
            stack.extend(e.other_vert(w) for e in w.link_edges)
    # flipped: neighbouring faces that traverse their shared edge the same way
    flipped = 0
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        f1, f2 = e.link_faces
        l1 = next(lp for lp in f1.loops if lp.edge == e)
        l2 = next(lp for lp in f2.loops if lp.edge == e)
        if l1.vert == l2.vert:  # both run the edge in the same direction: inconsistent winding
            flipped += 1
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    closed = boundary == 0 and nonmanifold == 0
    vol = bm.calc_volume(signed=True) if closed else None
    degenerate = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    report['parts'][o.name] = {
        'verts': len(bm.verts), 'faces': len(bm.faces), 'islands': islands,
        'flipped_edges': flipped, 'inverted': bool(vol is not None and vol < 0),
        'open_edges': boundary, 'nonmanifold_edges': nonmanifold, 'degenerate_faces': degenerate, 'duplicate_verts': dup,
        'parent': o.parent.name if o.parent else None,
    }
    bvh[o.name] = BVHTree.FromBMesh(bm)
    bm.free()

# intersections between parts (skip a part with its own pieces)
names = sorted(bvh)
for i, a in enumerate(names):
    for b in names[i + 1:]:
        n = len(bvh[a].overlap(bvh[b]))
        if n:
            report['intersections'].append({'a': a, 'b': b, 'tris': n})
report['intersections'].sort(key=lambda r: -r['tris'])

# ----------------------------------------------------------------------------
P = report['parts']
groups = defaultdict(list)
for n in P:
    groups[''.join(c for c in n if not c.isdigit()).rstrip('LR.') or n].append(n)
lines = [f'# 메쉬 진단: {glb.split("/")[-1]} ({ANIM} {FRAME}프레임 자세)', '',
         f'파트 {len(P)}개, 면 {sum(p["faces"] for p in P.values())}개.', '']
multi = [(n, p['islands']) for n, p in P.items() if p['islands'] > 1]
lines += ['## 1. 분리된 조각 (한 오브젝트 안의 떨어진 덩어리)', '']
lines += [f'- `{n}`: {k}조각' for n, k in sorted(multi, key=lambda x: -x[1])] or ['- 없음']
flip = [(n, p['flipped_edges'], p['inverted']) for n, p in P.items() if p['flipped_edges'] or p['inverted']]
lines += ['', '## 2. 뒤집힌 노멀', '']
lines += [f'- `{n}`: ' + ', '.join(x for x in (f'이웃과 방향이 어긋난 모서리 {fe}개' if fe else '', '안쪽을 향함(부피 음수)' if inv else '') if x) for n, fe, inv in flip] or ['- 없음']
thin = [(n, p['open_edges'], p['degenerate_faces']) for n, p in P.items() if p['open_edges'] or p['degenerate_faces']]
lines += ['', '## 3. 두께 없는 면 (열린 껍데기 · 넓이 0인 면)', '']
lines += [f'- `{n}`: 열린 가장자리 {oe}개' + (f', 넓이 0인 면 {dg}개' if dg else '') for n, oe, dg in sorted(thin, key=lambda x: -x[1])] or ['- 없음']
dups = [(n, p['duplicate_verts']) for n, p in P.items() if p['duplicate_verts']]
lines += ['', '## 3b. 중복 버텍스 (같은 자리에 겹친 점)', '']
lines += [f'- `{n}`: {k}개' for n, k in sorted(dups, key=lambda x: -x[1])] or ['- 없음']
fam = lambda n: ''.join(c for c in n if not c.isdigit() and c != '-').rstrip('LR') or n
pairs = defaultdict(lambda: [0, 0, set()])
for r in report['intersections']:
    k = tuple(sorted((fam(r['a']), fam(r['b']))))
    pairs[k][0] += 1
    pairs[k][1] += r['tris']
    pairs[k][2].update((r['a'], r['b']))
lines += ['', f'## 4. 서로 관통하는 부품 ({len(report["intersections"])}쌍 — 같은 종류끼리 묶음, 전체 목록은 JSON)', '',
          '| 부품 종류 A | 부품 종류 B | 쌍 | 교차 삼각형 | 예 |', '| --- | --- | --- | --- | --- |']
for (a, b), (n, t, ex) in sorted(pairs.items(), key=lambda kv: -kv[1][1]):
    lines.append(f'| `{a}` | `{b}` | {n} | {t} | {", ".join(sorted(ex)[:4])} |')
open(out, 'w').write('\n'.join(lines) + '\n')
json.dump(report, open(out.rsplit('.', 1)[0] + '.json', 'w'), indent=1)
print(f'{len(P)} parts: {len(multi)} with loose pieces, {len(flip)} with flipped normals, {len(thin)} open/thin, {len(dups)} with duplicate verts, {len(report["intersections"])} intersecting pairs')
