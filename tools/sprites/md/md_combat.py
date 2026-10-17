"""
Movie Duels Anakin in the duel: every clip of the swordsmanship (export_clips.mjs --md — the very joint positions
src/combat/pose.js draws) retargeted onto the MD model's own skeleton, one Blender action per clip, for render_sprites.py.
The combat connection's baseline (docs/characters/MD_ANAKIN.md "전투 연결 기준", the user's choice 2026-10-17): the
candidate of diagnostic 02 — grip 1.20 m, upper body 5° forward, the feet's line 22.5°, the new hands 'v1', the blade
58° up / 14° right — now lives in the combat data itself (src/combat/moves.js MOVES.anakin.stance / feet), so the clips
carry it; this script only moves the model's bones to the clips' joints. Nothing of the mesh or its weights changes.

  .bvenv/bin/python tools/sprites/md/md_combat.py <pack> <clips.json> <out dir>

Per frame (all points body-local, Blender axes: X forward, Y the model's left, Z up — the clips' frame):
  pelvis   turned by the clip's hip line, its head on the clip's hips (the model's pelvis sits HIP_DZ below them: the
           MD figure's hips are 0.94 m standing, the clip's 0.92 m)
  spine    the turn from the pelvis to the chest frame (hips→chest = up, the shoulder line = the torso's twist) split
           half and half over the two lumbar bones; the neck turned back by half of it (the face stays forward)
  legs     two-bone IK (md_ready.solve_ik) to the clip's feet (the ankle above each), the clip's knee as the bend; the
           rear foot turned out 30°, a lifted foot's toes down
  arms     md_ready's hands 'v1': the right hand's grip on the clip's `hand`, the left's on `handL`, the hand rolled
           about the blade for the least wrist bend and twist, half the twist in the forearm's twist bone, the bend
           toward the clip's elbow; the fingers fitted on the hilt once (the hilt is the same line in the hand's frame)
  fall     the `dead` clip: the standing frame, the whole body turned back about the feet (view.js fallen's angle)
The hilt (tools/sprites/hero/pose_hero.py hilt_parts('anakin')) hangs on the right hand with the markers saberBase /
saberTip render_sprites.py projects; the game draws the blade from them.

Writes in <out dir>: md_anakin_posed.blend (whole body: attacks, reactions, dodge, fall, parry), md_anakin_upper.blend /
md_anakin_lower.blend (the layered sprites of standing and walking — src/combat/sprites.js: the upper layer the torso,
arms, head and hilt, the lower the tunic's skirt, trousers and boots; the belt in both covers the seam), each with its
.src.json (render_sprites.py's hashes), md_anakin_posed_meta.json (fps, loop, hit frame) and md_anakin_combat_report.json
(per frame the grip's reach error, the wrist bend / twist; the blade against the clip's).
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'hero'))
import md_lib  # noqa: E402
from pose_hero import HILT, hilt_parts, frame_xz  # noqa: E402  (the duel sheets' hilt: the same parts and markers)
import materials  # noqa: E402

PACK, CLIPS, OUT = (Path(a).resolve() for a in sys.argv[1:4])
OUT.mkdir(parents=True, exist_ok=True)
NAME = 'md_anakin'
RAD = math.pi / 180
HILT_R = 0.017  # (m) the grip section's radius (hilt_parts('anakin'))
HIP_DZ = -0.012  # (m) the model's pelvis below the clip's hips (MD 0.938 m standing − the clip's 0.92 + the stance's knee bend)
REAR_YAW, FRONT_YAW = -30, 0  # (deg) the feet's turn (md_ready V0)
UPPER = ('torso_0', 'l_shoulder_0', 'r_shoulder_0', 'l_arm_0', 'r_arm_0', 'l_hand_0', 'r_hand_0', 'head_0', 'head_hair_0',
         'hair_alpha_0', 'l_hand_cap_l_arm_off_0')
LOWER = ('hips_0', 'hips_legs_0', 'l_leg_0', 'r_leg_0')  # (hips_belt_0 is in both)

clips_all = json.loads(CLIPS.read_text())
STYLE = clips_all['styles']['anakin']
C = STYLE['clips']

S = md_lib.build(PACK)
arm = S.arm
AW = arm.matrix_world
AWi = AW.inverted()
Q = AW.to_3x3().normalized()
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'


def W(p):  # armature space → world
    return AW @ p


def rest_head(name):
    return W(arm.data.bones[name].head_local)


def update():
    bpy.context.view_layer.update()


def V(a):
    return Vector((a[0], a[1], a[2]))


# ---------------------------------------------------------------------------------------------------- bones (md_ready)
def aim(name, pivot_joint, from_joint, to_point):
    a = (W(arm.pose.bones[from_joint].head) - pivot_joint).normalized()
    b = (to_point - pivot_joint).normalized()
    R = a.rotation_difference(b).to_matrix()
    pb = arm.pose.bones[name]
    m = ((Q.inverted() @ R @ Q) @ pb.matrix.to_3x3()).to_4x4()
    m.translation = pb.matrix.translation.copy()
    pb.matrix = m
    update()


def solve_ik(upper, lower, effector, target, pole):
    """md_ready.solve_ik: two-bone IK by hand (the root joint stays, the middle joint bends toward `pole`)."""
    H = W(arm.pose.bones[upper].head)
    K0 = W(arm.pose.bones[lower].head)
    E0 = W(arm.pose.bones[effector].head)
    L1, L2 = (K0 - H).length, (E0 - K0).length
    d = min((target - H).length, L1 + L2 - 1e-4)
    u = (target - H).normalized()
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, L1 * L1 - a * a))
    n = (pole - H) - u * (pole - H).dot(u)
    if n.length < 1e-6:
        n = Vector((0, 0, -1)) - u * (-u.z)
    n.normalize()
    K = H + u * a + n * h
    aim(upper, H, lower, K)
    aim(lower, W(arm.pose.bones[lower].head), effector, H + u * d)
    return (W(arm.pose.bones[effector].head) - target).length


def turn_bone_world(name, R_world):
    pb = arm.pose.bones[name]
    m = ((Q.inverted() @ R_world @ Q) @ pb.bone.matrix_local.to_3x3()).to_4x4()
    m.translation = pb.head.copy()
    pb.matrix = m
    update()


def rotate_bone_world(name, R_world):
    pb = arm.pose.bones[name]
    m = ((Q.inverted() @ R_world @ Q) @ pb.matrix.to_3x3()).to_4x4()
    m.translation = pb.matrix.translation.copy()
    pb.matrix = m
    update()


def reset_pose():
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    update()


# ---------------------------------------------------------------------------------------------------- hands 'v1' (md_ready)
pos0 = md_lib.evaluated(S.meshes)


def palm_normal():
    b = arm.data.bones['r_d2_j1']
    m = b.matrix_local.to_3x3()
    move = Q @ (m.col[0].cross(b.tail_local - b.head_local))
    i, l, w = rest_head('r_d2_j1'), rest_head('r_d4_j1'), rest_head('rhand')
    g = (i - l).normalized()
    pl = ((i + l) / 2 - w)
    pl = (pl - g * pl.dot(g)).normalized()
    n = move - g * move.dot(g) - pl * move.dot(pl)
    n.normalize()
    return {'r': n, 'l': Vector((n.x, -n.y, n.z))}


PALM = palm_normal()


def grip_frame(s):
    """The hand's grip at rest (world): in front of the palm, 1.5 cm back from the knuckles (md_ready 'v1')."""
    i, l = rest_head(f'{s}_d2_j1'), rest_head(f'{s}_d4_j1')
    wrist = rest_head(f'{s}hand')
    g = (i - l).normalized()
    mid = (i + l) / 2
    palm = (mid - wrist)
    n = PALM[s]
    pu = (palm - g * palm.dot(g)).normalized()
    front = max((v - mid).dot(n) for v in pos0[f'{s}_hand_0'] if -0.06 < (v - mid).dot(pu) < 0.005 and abs((v - mid).dot(g)) < 0.05)
    return mid - pu * 0.015 + n * (front + HILT_R), g, wrist


GRIP = {s: grip_frame(s) for s in 'lr'}


def twist_swing(s):
    rad, hand = arm.pose.bones[f'{s}radius'], arm.pose.bones[f'{s}hand']
    rel_pose = (rad.matrix.to_3x3().inverted() @ hand.matrix.to_3x3()).to_quaternion()
    rel_rest = (rad.bone.matrix_local.to_3x3().inverted() @ hand.bone.matrix_local.to_3x3()).to_quaternion()
    d = rel_pose @ rel_rest.inverted()
    if d.w < 0:
        d = -d
    tw = 2 * math.atan2(d.y, d.w)
    swing = d @ Quaternion((0, 1, 0), tw).inverted()
    return math.degrees(tw), math.degrees(swing.angle if swing.angle <= math.pi else 2 * math.pi - swing.angle)


ARM_BONES = {s: (f'{s}humerus', f'{s}humerusX', f'{s}radius', f'{s}radiusX', f'{s}hand') for s in 'lr'}


def place_hand(s, point, D, bend):
    """The grip centre of hand `s` on `point`, its grip axis along D, the roll (about D) with the least wrist bend and
    twist (searched 10° apart, then ±5°), the elbow toward `bend` (a direction from the shoulder)."""
    c0, g0, w0 = GRIP[s]
    R1 = g0.rotation_difference(D).to_matrix()
    sh = W(arm.pose.bones[f'{s}humerus'].head)
    pole = sh + bend * 0.6

    def fresh():
        for b in ARM_BONES[s]:
            arm.pose.bones[b].matrix_basis = Matrix.Identity(4)
        update()

    def trial(deg):
        R = Matrix.Rotation(deg * RAD, 3, D) @ R1
        wrist = point + R @ (w0 - c0)
        if (wrist - point).normalized().dot((sh - point).normalized()) < 0.1:
            return None
        fresh()
        solve_ik(f'{s}humerus', f'{s}radius', f'{s}hand', wrist, pole)
        turn_bone_world(f'{s}hand', R)
        tw, sw = twist_swing(s)
        return sw + 0.35 * abs(tw)

    best = min(((sc, k) for k in range(0, 360, 10) if (sc := trial(k)) is not None), default=(0, 0))
    best = min([best] + [(sc, k) for k in (best[1] - 5, best[1] + 5) if (sc := trial(k)) is not None])
    R = Matrix.Rotation(best[1] * RAD, 3, D) @ R1
    wrist = point + R @ (w0 - c0)
    fresh()
    err = solve_ik(f'{s}humerus', f'{s}radius', f'{s}hand', wrist, pole)
    turn_bone_world(f'{s}hand', R)
    tw, sw = twist_swing(s)
    arm.pose.bones[f'{s}radiusX'].rotation_quaternion = Quaternion((0, 1, 0), math.radians(tw) * 0.5)
    update()
    return err, dict(twist=round(tw, 1), bend=round(sw, 1))


VG = {}
for s in 'lr':
    o = bpy.data.objects[f'{s}_hand_0']
    names = {g.index: g.name for g in o.vertex_groups}
    VG[s] = [max(((names[g.group], g.weight) for g in v.groups), key=lambda t: t[1])[0] if v.groups else None for v in o.data.vertices]


def hand_verts(s):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = bpy.data.objects[f'{s}_hand_0'].evaluated_get(deps)
    me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def axis_dist(p, a, d):
    v = p - a
    return (v - d * v.dot(d)).length


def fit_fingers(s, a, d):
    """md_ready.fit_fingers: each finger's two joints closed toward the palm only, the pair of angles that lays both
    segments on the hilt's surface."""
    angles = {}
    hand = arm.pose.bones[f'{s}hand']
    Rh = hand.matrix.to_3x3() @ hand.bone.matrix_local.to_3x3().inverted()
    n = (Q @ Rh @ Q.inverted()) @ PALM[s]

    def flex_sign(pb):
        t0 = W(pb.tail)
        pb.rotation_quaternion = Quaternion((1, 0, 0), 10 * RAD)
        update()
        sg = 1 if (W(pb.tail) - t0).dot(n) > 0 else -1
        pb.rotation_quaternion = Quaternion()
        update()
        return sg

    for f in (f'{s}_d2', f'{s}_d4', f'{s}_d1'):
        j1, j2 = arm.pose.bones[f + '_j1'], arm.pose.bones[f + '_j2']
        g1, g2 = flex_sign(j1), flex_sign(j2)
        i1 = [i for i, g in enumerate(VG[s]) if g == j1.name]
        i2 = [i for i, g in enumerate(VG[s]) if g == j2.name]

        def cost(idx, pts):
            ds = [axis_dist(pts[i], a, d) for i in idx]
            return sum(abs(x - (HILT_R + 0.008)) for x in ds) / len(ds) + 4 * sum(max(0, (HILT_R - 0.002) - x) for x in ds) / len(ds) if ds else 0

        best = None
        top = 71 if f.endswith('d1') else 111
        for t1 in range(0, top, 10):
            for t2 in range(0, top, 10):
                j1.rotation_quaternion = Quaternion((1, 0, 0), g1 * t1 * RAD)
                j2.rotation_quaternion = Quaternion((1, 0, 0), g2 * t2 * RAD)
                update()
                pts = hand_verts(s)
                c = cost(i1, pts) + cost(i2, pts)
                if best is None or c < best[0]:
                    best = (c, t1, t2)
        angles[j1.name], angles[j2.name] = g1 * best[1], g2 * best[2]
        j1.rotation_quaternion = Quaternion((1, 0, 0), angles[j1.name] * RAD)
        j2.rotation_quaternion = Quaternion((1, 0, 0), angles[j2.name] * RAD)
        update()
    return angles


FINGER_FIT = {}


# ---------------------------------------------------------------------------------------------------- one frame
def pose(P, fall=0.0):
    """Pose the armature for clip frame P (from rest); `fall` (0..1) turns the body back about the feet. Returns the
    frame's report."""
    reset_pose()
    rep = {}
    hips, hipL, hipR = V(P['hips']), V(P['hipL']), V(P['hipR'])
    # 1. pelvis: turned by the hip line, its head on the clip's hips
    left = hipL - hipR
    left.z = 0
    Rp = frame_xz(left.cross(Vector((0, 0, 1))), Vector((0, 0, 1)))
    rotate_bone_world('pelvis', Rp)
    pel = arm.pose.bones['pelvis']
    rest = rest_head('pelvis')
    m = pel.matrix.copy()
    m.translation = AWi @ Vector((rest.x + hips.x, rest.y + hips.y, hips.z + HIP_DZ))
    pel.matrix = m
    update()
    # 2. spine: pelvis → chest frame over the two lumbar bones, the neck back by half
    up = (V(P['chest']) - hips).normalized()
    Rc = frame_xz((V(P['shL']) - V(P['shR'])).cross(up), up)
    delta = (Rc @ Rp.transposed()).to_quaternion()
    half = Quaternion().slerp(delta, 0.5).to_matrix()
    for b in ('lower_lumbar', 'upper_lumbar'):
        rotate_bone_world(b, half)
    rotate_bone_world('cervical', half.inverted())
    # 3. legs: ankles over the clip's feet, knees toward the clip's knees, the rear foot turned out, lifted toes down
    errs = {}
    for s, fk, kk, yaw in (('l', 'footL', 'kneeL', FRONT_YAW), ('r', 'footR', 'kneeR', REAR_YAW)):
        foot, knee = V(P[fk]), V(P[kk])
        ankle_rest = rest_head(f'{s}talus')
        target = Vector((foot.x, foot.y, ankle_rest.z + foot.z))
        errs[f'{s}_leg'] = round(solve_ik(f'{s}femurYZ', f'{s}tibia', f'{s}talus', target, target + (knee - foot) * 2), 4)
        th = min(0.6, foot.z * 6.0)
        Rf = Matrix.Rotation(yaw * RAD, 3, 'Z') @ Matrix.Rotation(th, 3, 'Y')
        pb = arm.pose.bones[f'{s}talus']
        mm = (Q.inverted() @ Rf @ Q @ arm.data.bones[f'{s}talus'].matrix_local.to_3x3()).to_4x4()
        mm.translation = pb.head.copy()
        pb.matrix = mm
        update()
    # 4. hands on the hilt: the right on `hand`, the left on `handL`, elbows toward the clip's
    D = V(P['dir']).normalized()
    for s, hk, ek, sk in (('r', 'hand', 'elbowR', 'shR'), ('l', 'handL', 'elbowL', 'shL')):
        bend = (V(P[ek]) - V(P[sk])).normalized()
        e, rep[f'{s}_wrist'] = place_hand(s, V(P[hk]), D, bend)
        errs[f'{s}_arm'] = round(e, 4)
        if s not in FINGER_FIT:
            FINGER_FIT[s] = fit_fingers(s, V(P[hk]), D)
        for f, deg in FINGER_FIT[s].items():
            arm.pose.bones[f].rotation_quaternion = Quaternion((1, 0, 0), deg * RAD)
        update()
    rep['reach_m'] = errs
    # 5. the fall: the whole body back about the feet (view.js fallen: the angle k·π/2.2), lifted a little off the floor
    if fall:
        ang = fall * math.pi / 2.2
        rotate_bone_world('model_root', Matrix.Rotation(-ang, 3, 'Y'))
        rb = arm.pose.bones['model_root']
        m = rb.matrix.copy()
        m.translation = AWi @ (W(m.translation) + Vector((0, 0, 0.1 * math.sin(ang))))
        rb.matrix = m
        update()
    return rep


# ---------------------------------------------------------------------------------------------------- every clip
keyed, reports = {}, {}
for name, clip in C.items():
    keyed[name] = []
    reports[name] = []
    base = clip['frames'][0]
    for P in clip['frames']:
        if name == 'dead':  # (the clip's frames are the standing frame fallen by k: the model falls rigidly instead)
            r = pose(base, P['m']['k'])
        else:
            r = pose(P)
        reports[name].append(r)
        keyed[name].append({pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones})
    worst = max(max(r['reach_m'].values()) for r in reports[name])
    print(f'POSED {name}: {len(clip["frames"])} frames, worst reach error {worst * 100:.1f} cm', flush=True)

# --- the hilt on the right hand (placed at a frame's grip along its blade; the same line in the hand's frame always)
first = 'up_stance'
P0 = C[first]['frames'][0]
for pb in arm.pose.bones:
    pb.rotation_quaternion, pb.location = keyed[first][0][pb.name]
update()
G0, D0 = V(P0['hand']), V(P0['dir']).normalized()
bpy.ops.object.mode_set(mode='OBJECT')
hilt = bpy.data.objects.new('hilt', None)
bpy.context.scene.collection.objects.link(hilt)
x = D0.cross(Vector((0, 0, 1)))
x = x.normalized() if x.length > 1e-3 else Vector((1, 0, 0))
hilt.matrix_world = Matrix.Translation(G0) @ Matrix((x, D0.cross(x), D0)).transposed().to_4x4()  # local Z = the blade
mats = {'metal': materials.metal('hilt_metal', (190, 192, 196), 0.25), 'grip': materials.plain('hilt_grip', (24, 24, 26), 0.55),
        'dark': materials.metal('hilt_dark', (60, 60, 64), 0.4)}
for k, (z0, z1, r, mat) in enumerate(hilt_parts('anakin')):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r, depth=z1 - z0)
    ob = bpy.context.object
    ob.name = f'hiltpart{k}'
    ob.data.materials.append(mats[mat])
    ob.parent = hilt
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = (0, 0, (z0 + z1) / 2)
    for p in ob.data.polygons:
        p.use_smooth = True
for nm, z in (('saberBase', HILT[1]), ('saberTip', HILT[1] + 1.0)):
    e = bpy.data.objects.new(nm, None)
    bpy.context.scene.collection.objects.link(e)
    e.parent = hilt
    e.matrix_parent_inverse = Matrix.Identity(4)
    e.location = (0, 0, z)
update()
mw = hilt.matrix_world.copy()
hilt.parent = arm
hilt.parent_type = 'BONE'
hilt.parent_bone = 'rhand'
update()
hilt.matrix_world = mw
update()

# --- the drawn blade against the clip's (each frame: the hilt follows the hand; the reach error moves it)
blade_err = {}
for name, frames in keyed.items():
    errs = []
    for i, vals in enumerate(frames):
        for pb in arm.pose.bones:
            pb.rotation_quaternion, pb.location = vals[pb.name]
        update()
        if name == 'dead':
            continue
        P = C[name]['frames'][i]
        b = bpy.data.objects['saberBase'].matrix_world.translation
        t = bpy.data.objects['saberTip'].matrix_world.translation
        errs.append(((b - V(P['bladeBase'])).length, (t - V(P['tip'])).length))
    if errs:
        blade_err[name] = dict(base_max_m=round(max(e[0] for e in errs), 3), tip_max_m=round(max(e[1] for e in errs), 3))

# --- the actions: every pose bone keyed per frame
ad = arm.animation_data_create()
for name, frames in keyed.items():
    a = bpy.data.actions.new(name)
    a.use_fake_user = True
    ad.action = a
    for f, vals in enumerate(frames):
        for pb in arm.pose.bones:
            pb.rotation_quaternion, pb.location = vals[pb.name]
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
ad.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion, pb.location = keyed[first][0][pb.name]
for im in bpy.data.images:  # (the pack's textures inside the .blend)
    if im.source == 'FILE' and not im.packed_file:
        im.pack()
posed = OUT / f'{NAME}_posed.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(posed))
src_model = hashlib.sha256(b''.join((HERE / f).read_bytes() for f in ('md_combat.py', 'md_lib.py')) + (HERE.parent / 'hero' / 'pose_hero.py').read_bytes()).hexdigest()[:16]
anims = {n: hashlib.sha256(json.dumps(c, sort_keys=True).encode()).hexdigest()[:16] for n, c in C.items()}
(OUT / f'{NAME}_posed.blend.src.json').write_text(json.dumps({'model': src_model, 'anims': anims}, indent=1))
(OUT / f'{NAME}_posed_meta.json').write_text(json.dumps({'anims': {n: {'fps': 24, 'loop': bool(c.get('loop')), 'hit': c.get('hit'), 'frames': len(c['frames'])} for n, c in C.items()}}, indent=1))

# --- the layers: the other layer's meshes removed (neither hides nor shadows the other), the belt in both
for which, drop in (('upper', LOWER), ('lower', UPPER)):
    bpy.ops.wm.open_mainfile(filepath=str(posed))
    for ob in list(bpy.data.objects):
        if ob.name in drop or (which == 'lower' and ob.name.startswith('hiltpart')):
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{NAME}_{which}.blend'))
    (OUT / f'{NAME}_{which}.blend.src.json').write_text(json.dumps({'model': hashlib.sha256((src_model + which).encode()).hexdigest()[:16], 'anims': anims}, indent=1))

rs = [max(r['reach_m'].values()) for v in reports.values() for r in v]
rs.sort()
summary = dict(frames=len(rs), reach_median_cm=round(rs[len(rs) // 2] * 100, 1), reach_95_cm=round(rs[int(len(rs) * 0.95)] * 100, 1), reach_max_cm=round(rs[-1] * 100, 1))
(OUT / f'{NAME}_combat_report.json').write_text(json.dumps(dict(
    note='제작 판단: 원본 애니메이션이 아니다 — 게임 검술(pose.js)의 관절 위치를 이 모델 뼈대에 옮긴 것',
    summary=summary, finger_fit_deg=FINGER_FIT, blade_vs_clip=blade_err,
    frames={n: v for n, v in reports.items()}), indent=1, ensure_ascii=False))
print('SUMMARY', json.dumps(summary), flush=True)
print('BLADE', json.dumps(blade_err), flush=True)
print('READY', posed, flush=True)
