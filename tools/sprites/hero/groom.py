"""
Short groomed hair as Blender hair curves (Obi-Wan's swept-back short hair and trimmed beard): strands grown from a
surface (a MakeHuman hair / beard proxy, which stays underneath as the dense base so no skin shows between strands)
along a comb direction, lying on the head with a little lift, tapered, with a slight wave. Principled Hair BSDF like
tools/sprites/build_hair.py's. The curves hang on the head bone.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def hair_material(name, melanin, redness, root=0.15, streak=0.1, rough=0.36):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    info = nt.nodes.new('ShaderNodeHairInfo')
    ph = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    ph.parametrization = 'MELANIN'
    ph.inputs['Melanin Redness'].default_value = redness
    ph.inputs['Roughness'].default_value = rough
    ph.inputs['Radial Roughness'].default_value = 0.45
    ph.inputs['Coat'].default_value = 0.1
    ph.inputs['Random Roughness'].default_value = 0.15
    ph.inputs['Random Color'].default_value = 0.12
    st = nt.nodes.new('ShaderNodeMath')
    st.operation = 'GREATER_THAN'
    st.inputs[1].default_value = 0.7
    nt.links.new(info.outputs['Random'], st.inputs[0])
    rt = nt.nodes.new('ShaderNodeMapRange')
    rt.inputs['From Max'].default_value = 0.3
    rt.inputs['To Min'].default_value = 1.0
    rt.inputs['To Max'].default_value = 0.0
    nt.links.new(info.outputs['Intercept'], rt.inputs['Value'])
    m1 = nt.nodes.new('ShaderNodeMath')
    m1.operation = 'MULTIPLY_ADD'
    nt.links.new(st.outputs[0], m1.inputs[0])
    m1.inputs[1].default_value = -streak
    m1.inputs[2].default_value = melanin
    m2 = nt.nodes.new('ShaderNodeMath')
    m2.operation = 'MULTIPLY_ADD'
    nt.links.new(rt.outputs['Result'], m2.inputs[0])
    m2.inputs[1].default_value = root
    nt.links.new(m1.outputs[0], m2.inputs[2])
    nt.links.new(m2.outputs[0], ph.inputs['Melanin'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(ph.outputs[0], out.inputs['Surface'])
    return mat


def sample_surface(ob, n, rng, keep=None):
    """n points (+ normals) spread over the object's faces by area (rest pose, world space)."""
    me = ob.data
    mw = ob.matrix_world
    faces = []
    for p in me.polygons:
        c = mw @ p.center
        if keep and not keep(c):
            continue
        faces.append((p, p.area))
    tot = sum(a for _, a in faces) or 1
    out = []
    for p, a in faces:
        k = a / tot * n
        m = int(k) + (1 if rng.random() < k - int(k) else 0)
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        nrm = (mw.to_3x3() @ p.normal).normalized()
        for _ in range(m):
            # a random point in the polygon (fan triangles by area is overkill at this density: random barycentric
            # in a random fan triangle)
            j = rng.randrange(1, len(vs) - 1)
            a_, b_ = rng.random(), rng.random()
            if a_ + b_ > 1:
                a_, b_ = 1 - a_, 1 - b_
            q = vs[0] + (vs[j] - vs[0]) * a_ + (vs[j + 1] - vs[0]) * b_
            out.append((q, nrm))
    return out


def grow(name, arm, surface, head_bvh, comb, length, n, mat, seed=1, segs=6, lift=0.004, wave=0.002, radius=0.0007, keep=None, bone='head'):
    """Strands from `surface` (an object): comb(p, n) -> direction, length(p) -> m. They keep at least `lift` (growing
    to 2× at the tips) off `head_bvh` (the head's skin), turning along it."""
    rng = random.Random(seed)
    roots = sample_surface(surface, n, rng, keep)
    strands = []
    for q, nrm in roots:
        L = length(q) * (0.8 + 0.4 * rng.random())
        if L <= 0.002:
            continue
        d = comb(q, nrm)
        d = (d - nrm * d.dot(nrm)).normalized() if (d - nrm * d.dot(nrm)).length > 1e-6 else d
        pts = [q + nrm * 0.0005]
        step = L / segs
        ph = rng.random() * math.tau
        side = nrm.cross(d).normalized()
        for k in range(1, segs + 1):
            p = pts[-1] + d * step
            hit = head_bvh.find_nearest(p)
            if hit[0] is not None:
                s_n = hit[1]
                want = lift * (1 + k / segs)
                dist = (p - hit[0]).dot(s_n)
                if dist < want:
                    p = p + s_n * (want - dist)
                # keep following the surface: turn the direction into its tangent plane
                d2 = d - s_n * d.dot(s_n) * 0.8
                if d2.length > 1e-6:
                    d = d2.normalized()
            p = p + side * wave * math.sin(ph + k * 1.7) * (k / segs)
            pts.append(p)
        strands.append(pts)
    hc = bpy.data.hair_curves.new(name)
    hc.add_curves([len(s) for s in strands])
    hc.position_data.foreach_set('vector', [c for s in strands for p in s for c in p])
    rad = hc.attributes.get('radius') or hc.attributes.new('radius', 'FLOAT', 'POINT')
    vals = []
    for s in strands:
        for k in range(len(s)):
            vals.append(radius * (1 - 0.65 * k / (len(s) - 1)))
    rad.data.foreach_set('value', vals)
    hc.materials.append(mat)
    ob = bpy.data.objects.new(name, hc)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = ob.matrix_world.__class__.Identity(4)
    return ob, len(strands)


def bvh_of(ob, keep=None):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    if keep:
        drop = [v for v in bm.verts if not keep(v.co)]
        bmesh.ops.delete(bm, geom=drop, context='VERTS')
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def obiwan(B, scalp_proxy, beard_proxies):
    """Obi-Wan (ROTS): short hair swept back and a little to his right from a parting on his left, shorter at the
    sides and the nape; a close full beard and moustache. Auburn brown."""
    head_w = [i for i, w in enumerate(B.base.skin_names()) if w.get('head', 0) > 0.5 or w.get('jaw', 0) > 0.5]
    hz = set(head_w)
    body = B.body_ob
    head_bvh = bvh_of(body, keep=lambda co: co.z > B.C['height'] - 0.32)
    cz = B.C['height'] - 0.12
    cx = float(B.co_b[head_w, 0].mean())
    hair = hair_material(B.name + '_strands', melanin=0.64, redness=0.72, root=0.1, streak=0.12)
    beard = hair_material(B.name + '_beard_strands', melanin=0.66, redness=0.7, root=0.05, streak=0.08, rough=0.42)

    def comb(p, n):
        r = p - Vector((cx, 0, cz))
        w = ((1 + math.cos(math.atan2(r.y, r.x))) / 2) ** 1.5  # 1 at the front .. 0 at the back
        front = Vector((-0.7, -0.18, 0.7))  # up from the forehead and back over the top, a little to his right
        top = max(0.0, min(1.0, (r.z - 0.03) / 0.06))
        rest = Vector((-0.45, 0, -1)) * (1 - top) + Vector((-1, 0, -0.2)) * top  # sides and back: down and back
        return (front * w + rest * (1 - w)).normalized()

    def length(p):
        r = p - Vector((cx, 0, cz))
        top = max(0.0, min(1.0, (r.z + 0.02) / 0.1))
        return 0.02 + 0.035 * top

    o1, n1 = grow(B.name + '_hair_strands', B.arm, scalp_proxy, head_bvh, comb, length, 9000, hair, seed=3, lift=0.006, wave=0.0025, radius=0.0007)

    def bcomb(p, n):
        return Vector((0.25, 0, -1)).normalized()

    def blen(p):
        return 0.014 if p.z < cz - 0.08 else 0.011

    out = [o1]
    for k, bp in enumerate(beard_proxies):
        o, _ = grow(f'{B.name}_beard_strands{k}', B.arm, bp, head_bvh, bcomb, blen, 4500 if k == 0 else 900, beard, seed=11 + k, segs=4, lift=0.003, wave=0.001, radius=0.0005)
        out.append(o)
    return out
