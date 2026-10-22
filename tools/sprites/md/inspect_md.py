"""
Movie Duels Anakin (private pack, tools/sprites/out/md_anakin/pack): what Blender makes of the FBX — objects, parents,
the armature, the skin (modifiers, vertex groups, weights), UVs, materials and images. Read-only; prints JSON.

  .bvenv/bin/python tools/sprites/md/inspect_md.py tools/sprites/out/md_anakin/pack [out.json]
"""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

PACK = Path(sys.argv[1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(PACK / 'source' / 'Anakin.fbx'), use_anim=False)
objs = list(bpy.data.objects)
arm = next(o for o in objs if o.type == 'ARMATURE')
out = {'objects': [], 'armature': {}, 'meshes': {}, 'images': {}}
for o in objs:
    out['objects'].append(dict(name=o.name, type=o.type, parent=o.parent.name if o.parent else None, parent_type=o.parent_type,
                               parent_bone=o.parent_bone or None, loc=[round(v, 4) for v in o.location], rot=[round(v, 4) for v in o.rotation_euler],
                               scale=[round(v, 4) for v in o.scale]))
bones = arm.data.bones
out['armature'] = dict(name=arm.name, bones=len(bones), matrix_world=[[round(v, 4) for v in r] for r in arm.matrix_world],
                       roots=[b.name for b in bones if not b.parent],
                       tree={b.name: dict(parent=b.parent.name if b.parent else None, head=[round(v, 3) for v in b.head_local], tail=[round(v, 3) for v in b.tail_local],
                                          length=round(b.length, 3)) for b in bones})
for o in objs:
    if o.type != 'MESH':
        continue
    me = o.data
    mods = [dict(type=m.type, object=getattr(m, 'object', None) and m.object.name, groups=getattr(m, 'use_vertex_groups', None)) for m in o.modifiers]
    gnames = [g.name for g in o.vertex_groups]
    unweighted = 0
    sums = []
    for v in me.vertices:
        s = sum(g.weight for g in v.groups if gnames[g.group] in bones)
        if s <= 1e-6:
            unweighted += 1
        else:
            sums.append(s)
    uv = me.uv_layers.active
    us = [d.uv for d in uv.data] if uv else []
    ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = [min(p[i] for p in ws) for i in range(3)]
    hi = [max(p[i] for p in ws) for i in range(3)]
    out['meshes'][o.name] = dict(verts=len(me.vertices), polys=len(me.polygons), materials=[s.material.name if s.material else None for s in o.material_slots],
                                 modifiers=mods, groups=len(gnames), groups_not_bones=[g for g in gnames if g not in bones][:8],
                                 unweighted_verts=unweighted, weight_sum=[round(min(sums), 3), round(max(sums), 3)] if sums else None,
                                 uv_range=[[round(min(u[0] for u in us), 3), round(max(u[0] for u in us), 3)], [round(min(u[1] for u in us), 3), round(max(u[1] for u in us), 3)]] if us else None,
                                 world_bounds=[[round(v, 3) for v in lo], [round(v, 3) for v in hi]])
for m in bpy.data.materials:
    nt = m.node_tree
    out.setdefault('materials', {})[m.name] = [dict(node=n.type, image=n.image.name if getattr(n, 'image', None) else None, path=n.image.filepath if getattr(n, 'image', None) else None)
                                               for n in (nt.nodes if nt else []) if n.type == 'TEX_IMAGE']
for im in bpy.data.images:
    out['images'][im.name] = dict(path=im.filepath, has_data=im.has_data, size=list(im.size), channels=im.channels, alpha_mode=im.alpha_mode)
for name in sorted((PACK / 'textures').iterdir()):
    im = bpy.data.images.load(str(name), check_existing=False)
    px = list(im.pixels[:]) if im.channels == 4 else []
    a = px[3::4] if px else []
    out['images']['pack:' + name.name] = dict(size=list(im.size), channels=im.channels, depth=im.depth,
                                              alpha=[round(min(a), 3), round(max(a), 3), round(sum(1 for x in a if x < 0.5) / max(1, len(a)), 3)] if a else None)
s = json.dumps(out, indent=1, ensure_ascii=False)
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(s)
print(s[:200])
