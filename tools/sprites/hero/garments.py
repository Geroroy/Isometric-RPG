"""
The Jedi costume of Revenge of the Sith, built round the character's morphed body and skinned to its skeleton:

  trousers      the legs from the hips to the boots
  boots         tall boots to under the knee (the toes smoothed into the boot's shape, a sole under it)
  under-tunic   the crossed neckline showing in the tunic's V and a standing collar
  tunic         the torso and long sleeves to the wrists, with folds at the elbows and wrists
  skirt         the tunic's skirt from the waist to above the knee, open at the front, falling in irregular folds
  tabards       two strips over the shoulders, down the chest and back, hanging below the belt over the skirt
  obi           the wide sash round the waist
  belt          a narrower leather belt over the sash: buckle, pouches, capsules
  glove         Anakin's black glove on his right (artificial) hand

Shells (trousers, boots, tunic, under-tunic) are the body's own surface lifted off it: smoothed (no anatomy shows
through cloth), pushed out to at least their offset above the skin, keeping the body's skin weights, so they bend
exactly with it. Hanging parts (skirt, tabards below the belt) are generated round the body and weighted between
the pelvis and the thighs. Folds are geometry (displacement along the normal) plus the materials' bump.
Colours: cast.py COSTUME.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

import materials as MAT

COSTUME = {
    'anakin': {  # Mustafar: near-black brown tunic, black leather tabards / sash / glove, black trousers and boots
        'tunic': ('cloth', (40, 30, 24), dict(rough=0.86, sheen=0.3, folds=0.5, color2=(30, 23, 19))),
        'under': ('cloth', (26, 21, 18), dict(rough=0.9, sheen=0.25)),
        'skirt': ('cloth', (40, 30, 24), dict(rough=0.86, sheen=0.3, folds=0.9, color2=(30, 23, 19))),
        'tabard': ('leather', (22, 18, 16), dict(rough=0.4, crease=0.45, shine=0.2)),
        'obi': ('leather', (24, 19, 16), dict(rough=0.42, crease=0.5, shine=0.18)),
        'belt': ('leather', (44, 30, 20), dict(rough=0.38, crease=0.3, shine=0.2)),
        'pouch': ('leather', (36, 25, 18), dict(rough=0.4, crease=0.3, shine=0.2)),
        'trousers': ('cloth', (30, 25, 22), dict(rough=0.88, sheen=0.25, folds=0.6)),
        'boots': ('leather', (16, 14, 13), dict(rough=0.55, crease=0.35, shine=0.06, spec=0.3)),
        'glove_mat': ('leather', (14, 13, 13), dict(rough=0.32, crease=0.4, shine=0.3)),
        'metal': ('metal', (150, 150, 154), dict(rough=0.3)),
        'skirt_len': 0.60,  # hem height as a fraction of the knee's height above it (1 = at the knee)
        'tabard_w': 0.085,
        'tabard_hem': 0.70,  # (×knee height): how far the tabards hang
        'glove': 'R',
    },
    'obiwan': {  # oatmeal linen tunic and tabards, cream under-tunic, light sash, brown leather belt and boots
        'tunic': ('cloth', (192, 170, 134), dict(rough=0.9, sheen=0.35, folds=0.5, color2=(172, 150, 116), wear=0.1)),
        'under': ('cloth', (214, 198, 166), dict(rough=0.9, sheen=0.3)),
        'skirt': ('cloth', (192, 170, 134), dict(rough=0.9, sheen=0.35, folds=0.9, color2=(172, 150, 116), wear=0.1)),
        'tabard': ('cloth', (176, 150, 112), dict(rough=0.9, sheen=0.35, folds=0.4, color2=(160, 134, 98))),
        'obi': ('cloth', (184, 160, 124), dict(rough=0.9, sheen=0.3, folds=0.3)),
        'belt': ('leather', (84, 54, 34), dict(rough=0.4, crease=0.35, shine=0.15)),
        'pouch': ('leather', (78, 50, 32), dict(rough=0.42, crease=0.3, shine=0.15)),
        'trousers': ('cloth', (168, 146, 112), dict(rough=0.9, sheen=0.3, folds=0.6)),
        'boots': ('leather', (60, 40, 28), dict(rough=0.58, crease=0.4, shine=0.05, spec=0.3)),
        'metal': ('metal', (160, 160, 164), dict(rough=0.32)),
        'skirt_len': 0.48,
        'tabard_w': 0.09,
        'tabard_hem': 0.62,
        'glove': None,
    },
}


def material(spec, name):
    kind, col, kw = spec
    if kind == 'cloth':
        return MAT.cloth(name, col, **kw)
    if kind == 'leather':
        return MAT.leather(name, col, **kw)
    return MAT.metal(name, col, **kw)


# ---------------------------------------------------------------------------------------------------- helpers
class Body:
    """The body at rest: BVH (for offsets), the vertex weights, the landmarks."""

    def __init__(self, B):
        self.B = B
        ob = B.body_ob
        me = ob.data
        self.ob = ob
        self.names = [g.name for g in ob.vertex_groups]
        self.co = np.array([v.co[:] for v in me.vertices])
        self.w = []
        for v in me.vertices:
            self.w.append({self.names[g.group]: g.weight for g in v.groups if g.weight > 1e-4})
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.normal_update()
        self.bvh = BVHTree.FromBMesh(bm)
        self.normals = np.array([v.normal[:] for v in bm.verts])
        bm.free()
        # torso + legs only (no arms): the skirt's and the sash's cross-sections
        keep = [i for i in range(len(self.co)) if self.arm_w(i) < 0.3]
        bm = bmesh.new()
        bm.from_mesh(me)
        drop = [v for v in bm.verts if v.index not in set(keep)]
        bmesh.ops.delete(bm, geom=drop, context='VERTS')
        self.trunk = BVHTree.FromBMesh(bm)
        bm.free()
        J = B.joint_b
        z = lambda n: float(J[n][0][2])  # noqa: E731
        self.knee = (z('lowerleg01.L') + z('lowerleg01.R')) / 2
        self.ankle = (z('foot.L') + z('foot.R')) / 2
        self.hip = (z('upperleg01.L') + z('upperleg01.R')) / 2
        self.neck = z('neck01')
        self.chest = z('spine01')
        self.waist = self.hip + (self.chest - self.hip) * 0.22  # where the belt and sash sit (just under the navel)
        self.top = float(self.co[:, 2].max())
        self.wrist = {s: Vector(J['wrist.' + s][0]) for s in 'LR'}
        self.elbow = {s: Vector(J['lowerarm01.' + s][0]) for s in 'LR'}
        self.shoulder = {s: Vector(J['upperarm01.' + s][0]) for s in 'LR'}

    def arm_w(self, i):
        w = self.w[i]
        return sum(x for k, x in w.items() if k.startswith(('upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal')))

    def bones_w(self, i, prefixes):
        return sum(x for k, x in self.w[i].items() if k.startswith(prefixes))

    def outer(self, z, ang, bvh=None, cx=0.0):
        """The outermost body surface at height z in the horizontal direction `ang` (0 = front, +90° = left)."""
        d = Vector((math.cos(ang), math.sin(ang), 0))
        o = Vector((cx, 0, z)) + d * 1.2
        hit = (bvh or self.trunk).ray_cast(o, -d, 1.3)
        if hit[0] is None:
            return None
        return (hit[0] - Vector((cx, 0, z))).dot(d)


def new_object(name, me, B, mat_list):
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in mat_list:
        me.materials.append(m)
    ob.parent = B.arm
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = B.arm
    return ob


def set_weights(ob, weights):
    """weights: per vertex {bone: w} (normalised here)"""
    groups = {}
    for i, w in enumerate(weights):
        tot = sum(w.values()) or 1
        for bn, x in w.items():
            if x <= 1e-4:
                continue
            g = groups.get(bn) or ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn)
            groups[bn] = g
            g.add([i], x / tot, 'REPLACE')


def shell(body, name, keep, offset, mat, smooth=8, solid=0.003, fold=None, subsurf=0, edge_smooth=12):
    """A garment lifted off the body: the faces whose vertices all pass keep(i), smoothed, pushed out to at least
    offset(co) above the skin (at the nearest body point), displaced by fold(co, i) along the normal."""
    B = body.B
    src = body.ob.data
    keep_set = {i for i in range(len(body.co)) if keep(i)}
    bm = bmesh.new()
    bm.from_mesh(src)
    bm.verts.ensure_lookup_table()
    orig_index = bm.verts.layers.int.new('orig')
    for v in bm.verts:
        v[orig_index] = v.index
    drop = [v for v in bm.verts if v.index not in keep_set]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    # smooth (the boundary is kept: it is where the garment meets the next one)
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    # the garment's edges (neckline, cuffs, hems): the cut follows the body's faces, so relax each edge loop along
    # itself (each boundary vertex towards the mean of its two boundary neighbours) — a clean line, not a staircase
    for _ in range(edge_smooth):
        moves = {}
        for v in bm.verts:
            if not v.is_boundary:
                continue
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                moves[v] = (nb[0].co + nb[1].co) / 2
        for v, c in moves.items():
            v.co = v.co.lerp(c, 0.6)
    # push out to the offset above the skin
    for _ in range(3):
        for v in bm.verts:
            off = offset(v.co)
            q, n, _, _ = body.bvh.find_nearest(v.co)
            if q is None:
                continue
            d = (v.co - q).dot(n)
            if d < off:
                v.co = v.co + n * (off - d)
        bm.normal_update()
    if fold:
        for v in bm.verts:
            v.co = v.co + v.normal * fold(v.co, v[orig_index])
    dl = bm.verts.layers.deform.active  # (the body's group indices: set_weights writes this garment's own)
    if dl is not None:
        bm.verts.layers.deform.remove(dl)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    origs = [v[orig_index] for v in bm.verts]
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = new_object(name, me, B, [mat])
    set_weights(ob, [body.w[i] for i in origs])
    if solid:
        so = ob.modifiers.new('thick', 'SOLIDIFY')
        so.thickness = solid
        so.offset = -1
        so.use_even_offset = True
        ob.modifiers.move(len(ob.modifiers) - 1, 0)
    if subsurf:
        ss = ob.modifiers.new('smooth', 'SUBSURF')
        ss.levels = ss.render_levels = subsurf
    return ob


def grid_object(name, B, rows, mat, weights, closed=True, smooth=True, subsurf=0, solid=0.003):
    """rows: list of rings/rows of Vector points (same length) -> a quad grid mesh."""
    verts = [p for r in rows for p in r]
    n = len(rows[0])
    faces = []
    for i in range(len(rows) - 1):
        for j in range(n if closed else n - 1):
            a = i * n + j
            b = i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = new_object(name, me, B, [mat])
    set_weights(ob, [weights(v) for v in verts])
    if solid:
        so = ob.modifiers.new('thick', 'SOLIDIFY')
        so.thickness = solid
        so.offset = 0
        ob.modifiers.move(len(ob.modifiers) - 1, 0)
    if subsurf:
        ss = ob.modifiers.new('smooth', 'SUBSURF')
        ss.levels = ss.render_levels = subsurf
    return ob


def nearest_weights(ob_src, max_n=3):
    """A function point -> {bone: w}: inverse-distance mix of the source object's nearest vertices' weights."""
    me = ob_src.data
    names = [g.name for g in ob_src.vertex_groups]
    kd = KDTree(len(me.vertices))
    W = []
    for v in me.vertices:
        kd.insert(v.co, v.index)
        W.append({names[g.group]: g.weight for g in v.groups})
    kd.balance()

    def f(p):
        acc = {}
        tot = 0
        for co, i, d in kd.find_n(p, max_n):
            k = 1 / (d + 1e-3)
            tot += k
            for bn, w in W[i].items():
                acc[bn] = acc.get(bn, 0) + w * k
        return {bn: w / tot for bn, w in acc.items()}

    return f


def noise1(x, seed):
    """Smooth 1-D value noise (deterministic)."""
    i = math.floor(x)
    f = x - i
    h = lambda k: (math.sin((k + seed * 17.3) * 12.9898) * 43758.5453) % 1.0  # noqa: E731
    u = f * f * (3 - 2 * f)
    return h(i) * (1 - u) + h(i + 1) * u


# ---------------------------------------------------------------------------------------------------- garments
def dress(B):
    C = COSTUME[B.C['costume']]
    body = Body(B)
    B.arm['waist'] = body.waist  # (pose_hero.layer_blend: where the upper and lower sprite layers part)
    M = {k: material(C[k], f'{B.name}_{k}') for k in ('tunic', 'under', 'skirt', 'tabard', 'obi', 'belt', 'pouch', 'trousers', 'boots', 'metal')}
    if C.get('glove'):
        M['glove'] = material(C['glove_mat'], f'{B.name}_glove')
    knee, ankle, waist, neck = body.knee, body.ankle, body.waist, body.neck
    boot_top = knee - 0.06
    arm = lambda i: body.arm_w(i)  # noqa: E731
    hand = lambda i: body.bones_w(i, ('wrist', 'finger', 'metacarpal')) > 0.35  # noqa: E731
    head = lambda i: body.bones_w(i, ('head', 'neck02', 'neck03', 'jaw', 'eye', 'special', 'tongue', 'levator', 'oris', 'temporalis', 'risorius', 'orbicularis', 'oculi')) > 0.25  # noqa: E731
    z = lambda i: body.co[i][2]  # noqa: E731
    x = lambda i: body.co[i][0]  # noqa: E731
    y = lambda i: body.co[i][1]  # noqa: E731

    # --- boots: a shaft round each calf to under the knee + a shoe on the foot (flat sole, rigid on the foot bone)
    for side in 'LR':
        boot(B, body, side, boot_top, M['boots'])
    # --- trousers: hips to inside the boots
    def tr_fold(co, i):
        t = (co.z - boot_top) / max(0.05, waist - boot_top)
        return 0.006 * (noise1(co.z * 22 + co.x * 9, 5) - 0.5) + (0.004 if t < 0.1 else 0)

    shell(body, f'{B.name}_trousers', lambda i: boot_top - 0.08 < z(i) < waist + 0.04 and arm(i) < 0.2, lambda co: 0.008, M['trousers'], smooth=10, fold=tr_fold)

    # --- tunic body and sleeves (V neckline in front), under-tunic below it
    def v_cut(i):
        # front V: from the neck base down to the breastbone
        return x(i) > 0.02 and z(i) > neck - 0.21 + abs(y(i)) * 1.55

    def tunic_keep(i):
        if hand(i) or head(i):
            return False
        if z(i) < waist - 0.06 or z(i) > neck + 0.03:
            return False
        if arm(i) > 0.3:
            return True
        return not v_cut(i)

    def sleeve_fold(co, i):
        if body.arm_w(i) < 0.4:
            return 0.0
        s = 'L' if co.y > 0 else 'R'
        sh, el, wr = body.shoulder[s], body.elbow[s], body.wrist[s]
        t_el = (co - el).length
        t_wr = (co - wr).length
        a = math.atan2(co.z - el.z, co.x - el.x)
        bunch = 0.007 * math.exp(-(t_el / 0.07) ** 2) * (0.6 + 0.8 * noise1(a * 3 + co.y * 30, 7))
        wrist = 0.006 * math.exp(-(t_wr / 0.06) ** 2) * (0.5 + noise1(a * 4, 9))
        drape = 0.004 * (noise1((co - sh).length * 25 + a * 2, 11) - 0.5)
        return bunch + wrist + drape

    tunic = shell(body, f'{B.name}_tunic', tunic_keep, lambda co: 0.016, M['tunic'], smooth=12, fold=sleeve_fold)
    # sleeve: wider towards the wrist (the knight tunic's sleeve), pushed out a little more
    under = shell(body, f'{B.name}_under', lambda i: (not hand(i)) and (not head(i)) and z(i) > neck - 0.26 and arm(i) < 0.3 and z(i) < neck + 0.035,
                  lambda co: 0.012, M['under'], smooth=10)

    # --- skirt: from the waist to the hem, round the hips and thighs
    hem = knee + 0.05 + (1 - C['skirt_len']) * 0.25  # (skirt_len 1: just above the knee)
    top = waist + 0.02
    NA = 64
    NZ = 9
    rows = []
    prev = [0.0] * NA
    slit = math.radians(10)
    for k in range(NZ):
        zz = top - (top - hem) * k / (NZ - 1)
        t = k / (NZ - 1)
        row = []
        for j in range(NA):
            ang = (j + 0.5) / NA * math.tau  # 0 = front
            r = body.outer(zz, ang)
            r = (r if r is not None else 0.15) + 0.03 + 0.012 * t
            r = max(r, prev[j] + 0.004 * (k > 0))  # it hangs: never in under the cloth above
            prev[j] = r
            # folds: irregular, deeper towards the hem
            fold = (0.004 + 0.022 * t * t) * (noise1(ang * 7.0, 13) - 0.4) + 0.010 * t * t * (noise1(ang * 15.0, 17) - 0.5)
            # the front opening: the two edges overlap a little
            rr = r + fold + 0.012 * t * t
            row.append(Vector((math.cos(ang) * rr, math.sin(ang) * rr, zz)))
        rows.append(row)

    def skirt_w(p):
        t = max(0.0, min(1.0, (top - p.z) / (top - hem)))
        legs = 0.88 * t ** 0.85
        side = max(0.0, min(1.0, 0.5 + p.y / 0.22))
        w = {'root': 1 - legs}
        lg = 'upperleg02' if t > 0.55 else 'upperleg01'
        w[lg + '.L'] = legs * side
        w[lg + '.R'] = legs * (1 - side)
        return w

    skirt = grid_object(f'{B.name}_skirt', B, rows, M['skirt'], skirt_w, closed=True, solid=0.004)
    # open the front: delete the faces round angle 0 below the upper third
    bm = bmesh.new()
    bm.from_mesh(skirt.data)
    kill = [f for f in bm.faces if f.calc_center_median().x > 0 and abs(math.atan2(f.calc_center_median().y, f.calc_center_median().x)) < slit
            and f.calc_center_median().z < top - (top - hem) * 0.3]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(skirt.data)
    bm.free()

    # --- obi (sash) and belt round the waist, over the tunic
    def band(name, z0, z1, extra, mat, n=48, nz=3):
        rows = []
        for k in range(nz):
            zz = z0 + (z1 - z0) * k / (nz - 1)
            row = []
            for j in range(n):
                ang = j / n * math.tau
                r = body.outer(zz, ang)
                r = (r if r is not None else 0.15) + extra
                row.append(Vector((math.cos(ang) * r, math.sin(ang) * r, zz)))
            rows.append(row)
        return grid_object(name, B, rows, mat, nearest_weights(tunic), closed=True, solid=0.006)

    obi = band(f'{B.name}_obi', waist - 0.045, waist + 0.085, 0.034, M['obi'], nz=4)
    belt = band(f'{B.name}_belt', waist - 0.012, waist + 0.04, 0.046, M['belt'])

    # --- tabards: over the shoulders, down the front and back (over the tunic), hanging below the sash
    tab_hem = knee + (waist - knee) * (1 - C['tabard_hem'])
    tabards(B, body, tunic, skirt, M['tabard'], C['tabard_w'], waist, neck, tab_hem)

    # --- buckle and pouches on the belt
    belt_bits(B, body, belt, M, waist)
    # --- the skin under the clothes goes (nothing can poke through a garment in a bent pose): only the head, the
    # neck above the collar and the hands stay
    # (faces only — every vertex keeps its index, the glove below still reads them)
    cover = {i for i in range(len(body.co)) if z(i) < neck + 0.02 and not hand(i) and not head(i)}
    bm = bmesh.new()
    bm.from_mesh(B.body_ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in cover for v in f.verts)], context='FACES_ONLY')
    bm.to_mesh(B.body_ob.data)
    bm.free()
    # --- glove (material on the body's hand)
    if C.get('glove'):
        s = C['glove']
        me = B.body_ob.data
        me.materials.append(M['glove'])
        gi = len(me.materials) - 1
        wr = body.wrist[s]
        el = body.elbow[s]
        for p in me.polygons:
            vs = list(p.vertices)
            c = Vector(np.mean([body.co[v] for v in vs], 0))
            hw = np.mean([body.bones_w(v, ('wrist.' + s, 'finger', 'metacarpal')) if body.co[v][1] * (1 if s == 'L' else -1) > 0 else 0 for v in vs])
            near_wrist = (c - wr).dot((wr - el).normalized()) > -0.07 and c.y * (1 if s == 'L' else -1) > 0.3
            if hw > 0.3 or near_wrist:
                p.material_index = gi


def tabards(B, body, tunic, skirt, mat, width, waist, neck, hem):
    """Two strips (left, right): back hem → back → over the shoulder beside the neck → chest → front hem."""
    tbvh = obj_bvh(tunic)
    sbvh = obj_bvh(skirt)
    tw = nearest_weights(tunic)
    sw = nearest_weights(skirt)
    for side in (1, -1):
        yc = side * 0.075
        # the centre line in (x, z) with y = yc: sampled along the body's outline
        path = []
        zs_front = np.linspace(hem, neck + 0.02, 22)
        # front: from the hem up to the shoulder top
        for zz in zs_front:
            path.append(('f', zz))
        for zz in zs_front[::-1]:
            path.append(('b', zz))
        rows = []
        for face, zz in path:
            d = Vector((1, 0, 0)) if face == 'f' else Vector((-1, 0, 0))
            row = []
            for k in (-1, -0.33, 0.33, 1):
                yy = yc + side * 0.0 + k * width / 2
                o = Vector((0, yy, zz)) + d * 0.6
                hit = None
                for bvh, extra in ((tbvh, 0.006), (sbvh, 0.006)):
                    h = bvh.ray_cast(o, -d, 0.8)
                    if h[0] is not None and (hit is None or (h[0] - o).length < (hit[0] - o).length):
                        hit = (h[0], extra)
                if hit is None:
                    h = body.bvh.ray_cast(o, -d, 0.8)
                    hit = (h[0] if h[0] is not None else Vector((0, yy, zz)), 0.03)
                p = hit[0] + d * hit[1]
                if zz < waist - 0.05:  # hanging: falls straight, a little off the skirt
                    p = p + d * 0.004
                row.append(p)
            rows.append(row)
        # over the shoulder: join the front's top row to the back's top row (they are the two middle rows)
        def w(p):
            return sw(p) if p.z < waist - 0.06 else tw(p)

        grid_object(f'{B.name}_tabard_{"L" if side > 0 else "R"}', B, rows, mat, w, closed=False, solid=0.004)


def belt_bits(B, body, belt, M, waist):
    bw = nearest_weights(belt, 1)
    zc = waist + 0.014
    items = [(0.0, 'buckle', (0.012, 0.06, 0.045), M['metal'])]
    for a in (35, 62, 118, 145, -35, -62, -118, -145):
        items.append((a, 'pouch', (0.032, 0.05, 0.06), M['pouch']))
    for a in (90, -90):
        items.append((a, 'capsule', (0.022, 0.022, 0.07), M['metal']))
    for k, (a, kind, size, mat) in enumerate(items):
        ang = math.radians(a)
        r = body.outer(zc, ang)
        r = (r if r is not None else 0.15) + 0.05 + size[0] / 2
        c = Vector((math.cos(ang) * r, math.sin(ang) * r, zc - (0.01 if kind == 'pouch' else 0)))
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(size) * 0.3, segments=2, affect='EDGES')
        rot = Matrix.Rotation(ang, 4, 'Z')
        for v in bm.verts:
            v.co = rot @ v.co + c
        me = bpy.data.meshes.new(f'{B.name}_{kind}{k}')
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        ob = new_object(me.name, me, B, [mat])
        set_weights(ob, [bw(c)] * len(me.vertices))


def obj_bvh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    # (at rest: the armature has no pose yet)
    eo = ob.evaluated_get(dg)
    me = eo.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(ob.matrix_world)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    eo.to_mesh_clear()
    return t


SOLE = 0.014  # (m) the boot sole under the foot: pose_hero lifts the ankles by this much


def boot(B, body, side, top, mat):
    """Shaft: rings round the calf (the leg's own cross-section + 1.2 cm, flaring a little at the top) from above the
    ankle to `top`. Shoe: superellipse sections along the foot from the heel to the toe, sole flat at −SOLE."""
    J = B.joint_b
    knee = Vector(J['lowerleg01.' + side][0])
    ank = Vector(J['foot.' + side][0])
    leg_ix = [i for i in range(len(body.co)) if body.bones_w(i, ('lowerleg01.' + side, 'lowerleg02.' + side, 'foot.' + side, 'toe')) > 0.5
              and (body.co[i][1] > 0) == (side == 'L')]
    bm = bmesh.new()
    vmap = {}
    me = body.ob.data
    for i in leg_ix:
        vmap[i] = bm.verts.new(me.vertices[i].co)
    for p in me.polygons:
        if all(v in vmap for v in p.vertices):
            try:
                bm.faces.new([vmap[v] for v in p.vertices])
            except ValueError:
                pass
    leg_bvh = BVHTree.FromBMesh(bm)
    bm.free()
    axis = (knee - ank).normalized()
    ref = Vector((1, 0, 0))
    u = (ref - axis * ref.dot(axis)).normalized()
    v = axis.cross(u)
    rows = []
    NA = 24
    z0 = ank.z + 0.05
    zs = list(np.linspace(z0, top, 10))
    prev = None
    for zz in zs:
        t = (zz - ank.z) / (knee.z - ank.z)
        c = ank + (knee - ank) * t
        row = []
        for j in range(NA):
            a = j / NA * math.tau
            d = u * math.cos(a) + v * math.sin(a)
            hit = leg_bvh.ray_cast(c + d * 0.3, -d, 0.3)
            r = (hit[0] - c).dot(d) if hit[0] is not None else 0.05
            r += 0.012 + 0.012 * max(0.0, (zz - (top - 0.06)) / 0.06)
            row.append(c + d * r)
        rows.append(row)
    lw = nearest_weights(body.ob, 2)
    grid_object(f'{B.name}_bootshaft_{side}', B, rows, mat, lambda p: {k: w for k, w in lw(p).items() if k.startswith(('lowerleg', 'foot', 'upperleg'))} or {'lowerleg02.' + side: 1}, closed=True, solid=0.004)
    # the shoe, in the foot's own frame (forward along the foot's length on the ground)
    fi = [i for i in range(len(body.co)) if body.bones_w(i, ('foot.' + side, 'toe')) > 0.5 and (body.co[i][1] > 0) == (side == 'L')]
    P = body.co[fi]
    xy = P[:, :2] - P[:, :2].mean(0)
    w_, vecs = np.linalg.eigh(xy.T @ xy)
    fwd = Vector((vecs[0, 1], vecs[1, 1], 0)).normalized()
    if fwd.x < 0:
        fwd = -fwd
    lat = Vector((0, 0, 1)).cross(fwd)
    proj = (P - np.array(ank[:])) @ np.array(fwd[:])
    plat = (P - np.array(ank[:])) @ np.array(lat[:])
    heel, toe = proj.min() - 0.012, proj.max() + 0.02
    half_w = (plat.max() - plat.min()) / 2 + 0.012
    lat_c = (plat.max() + plat.min()) / 2
    rows = []
    NS = 16
    for k in range(NS):
        t = k / (NS - 1)
        along = heel + (toe - heel) * t
        # width: narrow heel, widest at the ball, rounded toe; height: up to the ankle at the heel, low at the toe
        wv = half_w * (0.72 + 0.28 * math.sin(math.pi * min(1, t / 0.75) * 0.5 + (0.0 if t < 0.75 else 0)))
        if t > 0.8:
            wv *= math.sqrt(max(0.0, 1 - ((t - 0.8) / 0.2) ** 2)) * 0.9 + 0.1
        hv = (ank.z + 0.06) * (1 - t) ** 1.2 + 0.055 * (1 - (1 - t) ** 1.2)
        if t > 0.85:
            hv *= 0.6 + 0.4 * math.sqrt(max(0.0, 1 - ((t - 0.85) / 0.15) ** 2))
        if k == 0:
            wv *= 0.5
            hv *= 0.95
        row = []
        for j in range(20):
            a = j / 20 * math.tau
            ca, sa = math.cos(a), math.sin(a)
            # superellipse section: flat sole, rounded upper
            sx = math.copysign(abs(ca) ** 0.6, ca) * wv
            sz = (math.copysign(abs(sa) ** 0.7, sa) * 0.5 + 0.5) * (hv + SOLE) - SOLE
            row.append(ank + fwd * along + lat * (lat_c + sx) + Vector((0, 0, sz - ank.z)))
        rows.append(row)
    rows.insert(0, [rows[0][0].lerp(sum(rows[0], Vector()) / len(rows[0]), 1.0)] * 20)
    rows.append([sum(rows[-1], Vector()) / len(rows[-1])] * 20)
    grid_object(f'{B.name}_shoe_{side}', B, rows, mat, lambda p: {'foot.' + side: 1.0}, closed=True, solid=0, subsurf=2)
