"""
Retarget: the swordsmanship's poses (export_clips.mjs — the very joint positions src/combat/pose.js draws) onto the
character's MakeHuman skeleton, and one Blender action per clip for render_sprites.py.

Per frame (all points body-local, Blender axes: X forward, Y the model's left, Z up):
  pelvis   at the pose's hips (heights × the model's hip height / the pose's 0.92 m), turned by the hip line
  spine    the turn from the pelvis to the chest frame (spine = hips→chest, shoulder line incl. the torso twist),
           spread over the five spine bones; neck and head follow halfway and keep the face forward
  arms     two-bone IK from the model's shoulders: the right hand's grip centre exactly on the pose's `hand`, the left
           on `handL` (the two hands on the hilt), each hand turned so the hilt runs along the blade direction `dir`;
           the pose's elbows are the poles, the forearm twist bones take the hand's turn
  legs     two-bone IK to the pose's feet (ankles above them), the pose's knees as poles, feet flat (toes down while
           a foot is in the air), the rear foot turned out
  fingers  closed round the hilt
The hilt hangs on the right hand with the markers render_sprites.py projects: saberBase (the emitter, where the
blade starts) and saberTip (1 m further) — the blade itself is drawn by the game.

  python pose_hero.py model.blend clips.json style out.blend     (adds the hilt, the markers and the actions)
"""
import hashlib
import json
import math
import os
import sys

import bpy  # noqa: I001
from mathutils import Matrix, Quaternion, Vector

POSE_HIP = 0.92  # pose.js: the hips' height standing (0.92 − crouch)
HIP_SCALE = 0.45  # how much of the model's extra hip height the pose takes (1: same knee bend as the pose's figure)
CLAV_MAX = 0.09  # (m) how far the shoulder may come forward for a far grip
HILT = (-0.155, 0.135)  # the hilt along the blade direction from the right hand's grip centre (pose.js: base − 0.1 … bladeBase)

V = lambda a: Vector((a[0], a[1], a[2]))  # noqa: E731


def frame(y, z_hint):
    """A rotation with Y along `y` and Z as close as possible to `z_hint` (X = Y × Z)."""
    y = y.normalized()
    z = z_hint - y * z_hint.dot(y)
    if z.length < 1e-6:
        z = Vector((1, 0, 0)) - y * y.x
        if z.length < 1e-6:
            z = Vector((0, 0, 1)) - y * y.z
    z.normalize()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed()


def frame_xz(x_axis, z_axis):
    """Rotation whose columns are (X, Y, Z) from X and Z (made orthonormal round Z)."""
    z = z_axis.normalized()
    x = (x_axis - z * x_axis.dot(z)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def two_bone(a, b, l1, l2, pole):
    """Joint between a and b (lengths l1, l2), bent towards `pole`. Unreachable -> straight towards b."""
    ab = b - a
    d = ab.length
    if d < 1e-6:
        return a + Vector((0, 0, -l1))
    ax = ab / d
    if d >= l1 + l2 - 1e-5:
        return a + ax * l1
    d = max(d, abs(l1 - l2) + 1e-4)
    x = (d * d + l1 * l1 - l2 * l2) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    n = (pole - a) - ax * (pole - a).dot(ax)
    if n.length < 1e-6:
        n = Vector((0, 0, -1)) - ax * (-ax.z)
    n.normalize()
    return a + ax * x + n * h


class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.bones = arm.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in self.bones}
        self.order = []

        def walk(b):
            self.order.append(b.name)
            for c in b.children:
                walk(c)

        for b in self.bones:
            if b.parent is None:
                walk(b)
        R = self.rest
        h = lambda n: R[n].translation.copy()  # noqa: E731
        self.hip_h = (h('upperleg01.L').z + h('upperleg01.R').z) / 2
        self.kz = 1 + (self.hip_h / POSE_HIP - 1) * HIP_SCALE
        self.spine = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01']
        self.neck = ['neck01', 'neck02', 'neck03']
        self.len = {}
        for s in 'LR':
            self.len['arm' + s] = ((h('lowerarm01.' + s) - h('upperarm01.' + s)).length, (h('wrist.' + s) - h('lowerarm01.' + s)).length)
            self.len['leg' + s] = ((h('lowerleg01.' + s) - h('upperleg01.' + s)).length, (h('foot.' + s) - h('lowerleg01.' + s)).length)
        # the hand: the grip axis (little finger → index knuckle: the blade side) and the grip centre (in front of
        # the palm, inside the closed fingers), in the wrist bone's rest frame
        self.grip = {}
        for s in 'LR':
            w = R['wrist.' + s]
            k2, k5 = h('finger2-1.' + s), h('finger5-1.' + s)
            mid = (k2 + h('finger3-1.' + s) + h('finger4-1.' + s) + k5) / 4
            axis = (mid - w.translation).normalized()
            g = (k2 - k5).normalized()
            palm = g.cross(axis) if s == 'R' else axis.cross(g)
            # (the palm side: away from the back of the hand — check against the thumb, which is on the palm side)
            th = h('finger1-2.' + s) - w.translation
            if palm.dot(th) < 0:
                palm = -palm
            centre = w.translation.lerp(mid, 0.78) + palm * 0.028 + g * 0.004
            wi = w.inverted()
            self.grip[s] = {'g': (wi.to_3x3() @ g).normalized(), 'axis': (wi.to_3x3() @ axis).normalized(), 'c': wi @ centre, 'palm': (wi.to_3x3() @ palm).normalized()}
        self.ankle = (h('foot.L').z + h('foot.R').z) / 2 + 0.014  # (garments.SOLE: the boots stand on their soles)
        self.foot_rest = {s: R['foot.' + s].copy() for s in 'LR'}

    # ------------------------------------------------------------------------------------------------ solve
    def solve(self, P):
        """{bone: armature-space posed matrix} for the driven bones of pose P."""
        R = self.rest
        kz = self.kz
        S = lambda p: Vector((p[0], p[1], p[2] * kz))  # noqa: E731  (body points: heights scaled to the model)
        M = {}
        hips = S(P['hips'])
        hipL, hipR = S(P['hipL']), S(P['hipR'])
        left = hipL - hipR
        left.z = 0
        pel = frame_xz(left.cross(Vector((0, 0, 1))), Vector((0, 0, 1)))  # X forward, Z up, Y = left
        # the root bone: its head on the hips, the rest frame turned by the pelvis turn
        root_rest = R['root']
        root_off = root_rest.translation - (R['upperleg01.L'].translation + R['upperleg01.R'].translation) / 2
        rot = pel
        M['root'] = Matrix.Translation(hips + rot @ Vector((root_off.x, root_off.y, root_off.z))) @ (rot @ root_rest.to_3x3()).to_4x4()
        self._fk_into(M, 'spine05', None)
        # chest frame: up along hips→chest, left along the shoulder line
        chest = S(P['chest'])
        shL, shR = S(P['shL']), S(P['shR'])
        up = (chest - hips).normalized()
        ch = frame_xz((shL - shR).cross(up), up)
        delta = (ch @ pel.transposed()).to_quaternion()
        ident = Quaternion()
        n = len(self.spine)
        for i, b in enumerate(self.spine):
            q = ident.slerp(delta, (i + 1) / n)
            par = self.arm.data.bones[b].parent.name
            head = self._head(M, b, par)
            M[b] = Matrix.Translation(head) @ (q.to_matrix() @ pel @ R[b].to_3x3()).to_4x4()
        # neck and head: half of the chest's lean back towards upright, face forward
        hq = delta.slerp(ident, 0.5)
        for b in self.neck + ['head']:
            par = self.arm.data.bones[b].parent.name
            M[b] = Matrix.Translation(self._head(M, b, par)) @ (hq.to_matrix() @ pel @ R[b].to_3x3()).to_4x4()
        for s in 'LR':
            for b in ('clavicle.' + s, 'shoulder01.' + s):
                par = self.arm.data.bones[b].parent.name
                M[b] = Matrix.Translation(self._head(M, b, par)) @ (delta.to_matrix() @ pel @ R[b].to_3x3()).to_4x4()
        # arms
        dirv = V(P['dir']).normalized()
        for s, hand_key, elbow_key in (('R', 'hand', 'elbowR'), ('L', 'handL', 'elbowL')):
            self._arm(M, s, V(P[hand_key]), dirv, S(P[elbow_key]))
        # legs (front foot = left)
        for s, foot_key, knee_key in (('L', 'footL', 'kneeL'), ('R', 'footR', 'kneeR')):
            self._leg(M, s, S(P[foot_key]), S(P[knee_key]), pel)
        return M

    def _head(self, M, b, par):
        """Where bone b's head goes: its rest offset from the parent, carried by the parent's posed matrix."""
        R = self.rest
        return (M[par] @ (R[par].inverted() @ R[b])).translation

    def _fk_into(self, M, b, _):
        par = self.arm.data.bones[b].parent.name
        M[b] = M[par] @ (self.rest[par].inverted() @ self.rest[b])

    def _arm(self, M, s, hand, dirv, elbow_hint):
        R = self.rest
        l1, l2 = self.len['arm' + s]
        gp = self.grip[s]
        # reach: when the grip is beyond the arm, the shoulder girdle comes forward (the clavicle turns towards the
        # hand, up to CLAV_MAX of shoulder travel) — as a reaching arm does
        sh = self._head(M, 'upperarm01.' + s, 'shoulder01.' + s)
        over = (hand - sh).length - (l1 + l2 + 0.07)
        if over > 0:
            cb = 'clavicle.' + s
            c0 = M[cb].translation
            arm_v = sh - c0
            want = (hand - sh).normalized()
            axis = arm_v.cross(want)
            if axis.length > 1e-6:
                ang = min(over, CLAV_MAX) / max(0.05, arm_v.length)
                rot = Matrix.Rotation(ang, 4, axis.normalized())
                M[cb] = Matrix.Translation(c0) @ rot @ Matrix.Translation(-c0) @ M[cb]
                self._fk_into(M, 'shoulder01.' + s, None)
                sh = self._head(M, 'upperarm01.' + s, 'shoulder01.' + s)
        # forearm direction guess: from the pose's elbow to the hand
        fa = (hand - elbow_hint).normalized()
        for _ in range(2):
            h_t = fa - dirv * fa.dot(dirv)
            if h_t.length < 1e-4:
                h_t = Vector((0, 0, -1)) - dirv * (-dirv.z)
            h_t.normalize()
            # hand rotation: rest grip axis -> blade direction, rest hand axis -> along the forearm
            rest3 = R['wrist.' + s].to_3x3()
            g_r, a_r = rest3 @ gp['g'], rest3 @ gp['axis']
            a_r = (a_r - g_r * a_r.dot(g_r)).normalized()
            A = Matrix((g_r, a_r, g_r.cross(a_r))).transposed()
            B = Matrix((dirv, h_t, dirv.cross(h_t))).transposed()
            rot = B @ A.transposed()
            hand3 = rot @ rest3
            wrist = hand - hand3 @ gp['c']
            elbow = two_bone(sh, wrist, l1, l2, elbow_hint)
            fa = (wrist - elbow).normalized()
        elbow = two_bone(sh, wrist, l1, l2, elbow_hint)
        line = sh + (wrist - sh).normalized() * (elbow - sh).dot((wrist - sh).normalized())
        inner = line - elbow  # the inside of the bend (biceps side = the bones' rest Z, which faces forward)
        if inner.length < 1e-4:
            inner = Vector((1, 0, 0))
        up3 = frame(elbow - sh, inner)
        M['upperarm01.' + s] = Matrix.Translation(sh) @ (up3 @ self._roll_fix('upperarm01.' + s)).to_4x4()
        self._fk_into(M, 'upperarm02.' + s, None)
        lo3 = frame(wrist - elbow, inner)
        # forearm twist towards the hand's turn (palm), spread over the two forearm bones
        hz = (hand3 @ Vector((0, 0, 1)))
        y = (wrist - elbow).normalized()
        a = lo3 @ Vector((0, 0, 1))
        b = hz - y * hz.dot(y)
        tw = 0.0
        if b.length > 1e-4:
            b.normalize()
            tw = math.atan2(a.cross(b).dot(y), a.dot(b))
        lo1 = Matrix.Rotation(tw * 0.35, 3, y) @ lo3
        lo2 = Matrix.Rotation(tw * 0.8, 3, y) @ lo3
        M['lowerarm01.' + s] = Matrix.Translation(elbow) @ (lo1 @ self._roll_fix('lowerarm01.' + s)).to_4x4()
        mid = self._head(M, 'lowerarm02.' + s, 'lowerarm01.' + s)
        M['lowerarm02.' + s] = Matrix.Translation(mid) @ (lo2 @ self._roll_fix('lowerarm02.' + s)).to_4x4()
        M['wrist.' + s] = Matrix.Translation(self._head(M, 'wrist.' + s, 'lowerarm02.' + s)) @ hand3.to_4x4()
        self.reach_err = getattr(self, 'reach_err', {})
        got = M['wrist.' + s] @ gp['c']
        self.reach_err[s] = (got - hand).length

    def _roll_fix(self, b):
        """The bone's rest frame relative to `frame(Y, Z_rest)` (identity when the rest Z is exactly its roll axis)."""
        r = self.rest[b].to_3x3()
        f = frame(r @ Vector((0, 1, 0)), r @ Vector((0, 0, 1)))
        return f.transposed() @ r

    def _leg(self, M, s, foot, knee_hint, pel):
        R = self.rest
        hip = self._head(M, 'upperleg01.' + s, 'pelvis.' + s) if ('pelvis.' + s) in M else None
        if hip is None:
            self._fk_into(M, 'pelvis.' + s, None)
            hip = self._head(M, 'upperleg01.' + s, 'pelvis.' + s)
        l1, l2 = self.len['leg' + s]
        lift = foot.z
        ankle = Vector((foot.x, foot.y, foot.z + self.ankle))
        knee = two_bone(hip, ankle, l1, l2, knee_hint)
        line = hip + (ankle - hip).normalized() * (knee - hip).dot((ankle - hip).normalized())
        front = knee - line  # the knee points forward (the bones' rest Z)
        if front.length < 1e-4:
            front = pel @ Vector((1, 0, 0))
        th = frame(knee - hip, front)
        M['upperleg01.' + s] = Matrix.Translation(hip) @ (th @ self._roll_fix('upperleg01.' + s)).to_4x4()
        self._fk_into(M, 'upperleg02.' + s, None)
        sn = frame(ankle - knee, front)
        M['lowerleg01.' + s] = Matrix.Translation(knee) @ (sn @ self._roll_fix('lowerleg01.' + s)).to_4x4()
        self._fk_into(M, 'lowerleg02.' + s, None)
        # foot: the rest foot turned about Z to the stance's heading (front foot a little in, rear foot turned out),
        # toes down while it is in the air
        yaw = math.radians(8 if s == 'L' else -48)
        heading = pel @ Vector((math.cos(yaw), math.sin(yaw), 0))
        rest3 = R['foot.' + s].to_3x3()
        rf = rest3 @ Vector((0, 1, 0))
        rf_flat = Vector((rf.x, rf.y, 0)).normalized()
        turn = rf_flat.rotation_difference(Vector((heading.x, heading.y, 0)).normalized()).to_matrix()
        pitch = Matrix.Rotation(-min(0.6, lift * 6.0), 3, (turn @ rest3) @ Vector((1, 0, 0)))
        M['foot.' + s] = Matrix.Translation(self._head(M, 'foot.' + s, 'lowerleg02.' + s)) @ (pitch @ turn @ rest3).to_4x4()

    # ------------------------------------------------------------------------------------------------ apply
    def basis(self, M):
        """Posed matrices of the driven bones -> matrix_basis of every bone (others keep their rest relation)."""
        R = self.rest
        out = {}
        full = {}
        for b in self.order:
            bone = self.bones[b]
            par = bone.parent.name if bone.parent else None
            if b in M:
                full[b] = M[b]
                rel = R[b] if par is None else R[par].inverted() @ R[b]
                pm = Matrix.Identity(4) if par is None else full[par]
                L = rel.inverted() @ pm.inverted() @ M[b]
                if par is not None:
                    L.translation = Vector((0, 0, 0)) if bone.use_connect else L.translation
                out[b] = L
            else:
                full[b] = (full[par] if par else Matrix.Identity(4)) @ ((R[par].inverted() @ R[b]) if par else R[b])
                out[b] = Matrix.Identity(4)
        return out


FIST = {  # finger curl (degrees about each segment's X): a closed grip round a 3.5 cm hilt
    'finger2': (62, 72, 48), 'finger3': (66, 76, 50), 'finger4': (70, 78, 50), 'finger5': (74, 78, 50),
}
THUMB = (12, 28, 30)


def fist_basis(arm, side):
    out = {}
    for f, angs in FIST.items():
        for i, a in enumerate(angs):
            n = f'{f}-{i + 1}.{side}'
            if n in arm.data.bones:
                out[n] = Matrix.Rotation(math.radians(a), 4, 'X')
    for i, a in enumerate(THUMB):
        n = f'finger1-{i + 1}.{side}'
        if n in arm.data.bones:
            out[n] = Matrix.Rotation(math.radians(a), 4, 'X')
    return out


def apply_basis(arm, L):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        m = L.get(pb.name)
        pb.matrix_basis = m if m is not None else Matrix.Identity(4)


def pose_frame(rig, P, fist_sign=1):
    M = rig.solve(P)
    L = rig.basis(M)
    for s in 'LR':
        for n, m in fist_basis(rig.arm, s).items():
            L[n] = m if fist_sign > 0 else m.inverted()
    return L


def apply_frame(clips_path, clip, i, style=None):
    """review.py: pose the armature in the open .blend at one frame of a clip."""
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    data = json.load(open(clips_path))
    style = style or arm.get('style') or next(iter(data['styles']))
    P = data['styles'][style]['clips'][clip]['frames'][i]
    rig = Rig(arm)
    apply_basis(arm, pose_frame(rig, P))
    bpy.context.view_layer.update()
    return rig


# ---------------------------------------------------------------------------------------------------- saber
def add_saber(arm, style, mat_metal, mat_grip, mat_dark):
    """The hilt (on the right hand's grip, along its grip axis) and the blade markers."""
    rig = Rig(arm)
    gp = rig.grip['R']
    w = rig.rest['wrist.R']
    c = w @ gp['c']
    g = (w.to_3x3() @ gp['g']).normalized()
    hilt = bpy.data.objects.new('hilt', None)
    bpy.context.scene.collection.objects.link(hilt)
    # the hilt's frame: Z along the blade
    hilt.matrix_world = Matrix.Translation(c) @ frame_xz(Vector((0, 0, 1)).cross(g) if abs(g.z) < 0.95 else Vector((1, 0, 0)), g).to_4x4()  # local Z = g
    parts = hilt_parts(style)
    for k, (z0, z1, r, mat) in enumerate(parts):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r, depth=z1 - z0)
        ob = bpy.context.object
        ob.name = f'hiltpart{k}'
        ob.data.materials.append({'metal': mat_metal, 'grip': mat_grip, 'dark': mat_dark}[mat])
        ob.parent = hilt
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.location = (0, 0, (z0 + z1) / 2)
        for p in ob.data.polygons:
            p.use_smooth = True
    for name, z in (('saberBase', HILT[1]), ('saberTip', HILT[1] + 1.0)):
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.parent = hilt
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.location = (0, 0, z)
    # the hilt rides the right hand bone
    mw = hilt.matrix_world.copy()
    hilt.parent = arm
    hilt.parent_type = 'BONE'
    hilt.parent_bone = 'wrist.R'
    bpy.context.view_layer.update()
    hilt.matrix_world = mw
    return hilt


def hilt_parts(style):
    """(z0, z1, radius, material) along the hilt from the pommel (HILT[0]) to the emitter (HILT[1]), m."""
    a, b = HILT
    if style == 'anakin':  # Anakin's ROTS saber: ribbed black grip, silver body, flared emitter shroud
        return [(a, a + 0.02, 0.018, 'metal'), (a + 0.02, a + 0.035, 0.016, 'dark'), (a + 0.035, a + 0.15, 0.017, 'grip'),
                (a + 0.15, a + 0.2, 0.0175, 'metal'), (a + 0.2, a + 0.225, 0.016, 'dark'), (a + 0.225, b, 0.021, 'metal')]
    return [(a, a + 0.03, 0.017, 'metal'), (a + 0.03, a + 0.12, 0.0165, 'grip'), (a + 0.12, a + 0.18, 0.018, 'metal'),
            (a + 0.18, a + 0.205, 0.0155, 'dark'), (a + 0.205, b, 0.0195, 'metal')]


# ---------------------------------------------------------------------------------------------------- actions
def build_actions(arm, clips, style):
    """One action per clip: every bone keyed at every frame (frame i = clip frame i), named after the clip."""
    rig = Rig(arm)
    errs = []
    for name, clip in clips['styles'][style]['clips'].items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ad = arm.animation_data or arm.animation_data_create()
        ad.action = act
        for i, P in enumerate(clip['frames']):
            L = pose_frame(rig, P)
            errs.append(max(rig.reach_err.values()))
            for pb in arm.pose.bones:
                m = L.get(pb.name, Matrix.Identity(4))
                pb.rotation_mode = 'QUATERNION'
                pb.matrix_basis = m
                pb.keyframe_insert('rotation_quaternion', frame=i)
                pb.keyframe_insert('location', frame=i)
        for fc in act.fcurves if hasattr(act, 'fcurves') else []:
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'
    arm.animation_data.action = None
    return errs


# ---------------------------------------------------------------------------------------------------- layers
BOTH = ('obi', 'belt', 'pouch', 'buckle', 'capsule')  # in both layers: they cover the seam at the waist


def layer_blend(src, out, which, src_json):
    """The upper (belt and above, the arms, the head, the hilt) or lower (belt and below) layer of the posed model, for
    the layered sprites of standing and walking (src/combat/sprites.js): the faces of the other layer are deleted —
    so neither occludes nor shadows the other — the sash, belt and pouches stay in both. Parted at the rest pose:
    a vertex is upper above the waist or when it follows the arms."""
    import bmesh
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(src))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    waist = arm['waist']
    ARM = ('upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal', 'clavicle', 'shoulder')
    for ob in list(bpy.data.objects):
        if ob.type == 'CURVES' or ob.name.startswith('hiltpart'):
            if which == 'lower':
                bpy.data.objects.remove(ob, do_unlink=True)
            continue
        if ob.type != 'MESH' or any(k in ob.name for k in BOTH):
            continue
        names = [g.name for g in ob.vertex_groups]
        up = []
        for v in ob.data.vertices:
            aw = sum(g.weight for g in v.groups if names[g.group].startswith(ARM))
            up.append(v.co.z > waist or aw > 0.3)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        drop = [f for f in bm.faces if all((up[v.index] if which == 'lower' else not up[v.index]) for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(ob.data)
        bm.free()
        if not ob.data.polygons:
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    d = json.load(open(src_json))
    d['model'] = hashlib.sha256((d['model'] + which).encode()).hexdigest()[:16]
    json.dump(d, open(os.path.abspath(out) + '.src.json', 'w'), indent=1)
    print('LAYER', which, out)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    src, clips_path, style, out = argv[:4]
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(src))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import materials
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm['style'] = style
    add_saber(arm, style, materials.metal('hilt_metal', (190, 192, 196), 0.25), materials.plain('hilt_grip', (24, 24, 26), 0.55),
              materials.metal('hilt_dark', (60, 60, 64), 0.4))
    clips = json.load(open(clips_path))
    errs = build_actions(arm, clips, style)
    # what render_sprites.py hashes (render_cfg.blend_split) and its timing file (--meta: fps, loop, hit frame)
    here = os.path.dirname(os.path.abspath(__file__))
    h = hashlib.sha256()
    for f in ('mh.py', 'build_hero.py', 'cast.py', 'garments.py', 'materials.py', 'pose_hero.py'):
        h.update(open(os.path.join(here, f), 'rb').read())
    h.update(b'makehuman-data@0.0.2 ' + style.encode())
    C = clips['styles'][style]['clips']
    anims = {n: hashlib.sha256(json.dumps(c, sort_keys=True).encode()).hexdigest()[:16] for n, c in C.items()}
    json.dump({'model': h.hexdigest()[:16], 'anims': anims}, open(os.path.abspath(out) + '.src.json', 'w'), indent=1)
    meta = {'anims': {n: {'fps': 24, 'loop': bool(c.get('loop')), 'hit': c.get('hit'), 'frames': len(c['frames'])} for n, c in C.items()}}
    json.dump(meta, open(os.path.abspath(out)[:-len('.blend')] + '_meta.json', 'w'), indent=1)
    errs.sort()
    print(f'REACH grip error: median {errs[len(errs) // 2] * 100:.1f} cm, 95% {errs[int(len(errs) * 0.95)] * 100:.1f} cm, max {errs[-1] * 100:.1f} cm')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    print('POSED', out)
    for which in ('upper', 'lower'):
        layer_blend(out, out[:-len('_posed.blend')] + f'_{which}.blend', which, os.path.abspath(out) + '.src.json')
