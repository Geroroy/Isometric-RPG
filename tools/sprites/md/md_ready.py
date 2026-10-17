"""
Movie Duels Anakin: one held combat-ready pose (a PRODUCTION CHOICE — not an animation from the original game), on a
separate copy of the prepared model, with the game's existing lightsaber hilt in both hands.

  .bvenv/bin/python tools/sprites/md/md_ready.py <pack> <out dir>

The pose is the game's own Anakin stance (src/combat/moves.js MOVES.anakin.stance and feet): the grip at 0.30 m
forward, 0.10 m right, 1.08 m up; the blade yawed 14° to the right and pitched 58° up; both hands on the hilt (the left
0.11 m below the right, pose.js handL); the left foot forward (0.22 m forward, 0.13 m left), the right foot back (0.20 m
back, 0.17 m right); the hips 0.06 m lower. The model's own bones are posed: two-bone IK computed by hand (solve_ik — Blender's IK constraint
reaches for the shin / forearm bone's tail, which in this skeleton sits 1–5 cm off the ankle / wrist, and stalled on the
legs) for the arms (wrist) and the legs (ankle), the hands turned so their grip runs along the blade, the fingers closed by
a fixed curl. Nothing of the mesh or its weights changes.

The hilt: tools/sprites/hero/pose_hero.py's (HILT, hilt_parts — Anakin's), its markers saberBase / saberTip on the hilt's
axis (render_sprites.py projects them; the game draws the blade), the hilt parented to the right hand bone.

Writes md_anakin_ready.blend (+ .src.json, _meta.json: one action `ready`) and ready_report.json: the grip contact
(each hand's palm to the hilt axis), the blade axis against the wanted direction, the IK reach errors.
"""
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'hero'))
import md_lib  # noqa: E402
from pose_hero import HILT, hilt_parts  # noqa: E402  (the game's hilt: the same parts and markers as the duel sheets)
import materials  # noqa: E402

PACK, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
RAD = math.pi / 180

# the stance (src/combat/moves.js MOVES.anakin), game frame: f forward, r right, u up → Blender (x = f, y = -r, z = u)
GRIP = Vector((0.30, -0.10, 1.08))
YAW, PITCH = 14, 58  # (deg) blade: yaw to the right +, pitch up +
D = Vector((math.cos(-YAW * RAD) * math.cos(PITCH * RAD), math.sin(-YAW * RAD) * math.cos(PITCH * RAD), math.sin(PITCH * RAD)))
GRIP_L = GRIP - D * 0.11
FOOT = {'l': Vector((0.22, 0.13, 0)), 'r': Vector((-0.20, -0.17, 0))}
HIP_DROP = 0.06
CURL = {'j1': 55, 'j2': 45, 'thumb': 25}  # (deg about each finger bone's X: +X closes, md_deform.py "finger")

S = md_lib.build(PACK)
arm = S.arm
AW = arm.matrix_world
AWi = AW.inverted()
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')


def W(p):  # armature space → world
    return AW @ p


def head(name):
    return W(arm.pose.bones[name].head)


def rest_head(name):
    return W(arm.data.bones[name].head_local)


def grip_frame(s):
    """The hand's grip at rest (world): centre c and axis g (from the little-finger knuckle to the index knuckle: the line
    a closed fist holds a hilt along), plus the wrist."""
    i, l = rest_head(f'{s}_d2_j1'), rest_head(f'{s}_d4_j1')
    wrist = rest_head(f'{s}hand')
    g = (i - l).normalized()
    mid = (i + l) / 2
    palm = (mid - wrist)
    # the hilt sits in the curled fingers: from the knuckle line a little back toward the wrist and toward the thumb
    thumb = rest_head(f'{s}_d1_j1')
    side = (thumb - mid)
    side -= g * side.dot(g)
    c = mid - palm * 0.15 + side.normalized() * 0.012
    return c, g, wrist


def aim(name, pivot_joint, from_joint, to_point):
    """Turn bone `name` about its head (the world rotation that takes the line pivot→from_joint onto pivot→to_point)."""
    a = (W(arm.pose.bones[from_joint].head) - pivot_joint).normalized()
    b = (to_point - pivot_joint).normalized()
    R = a.rotation_difference(b).to_matrix()
    pb = arm.pose.bones[name]
    Q = AW.to_3x3().normalized()
    m = ((Q.inverted() @ R @ Q) @ pb.matrix.to_3x3()).to_4x4()
    m.translation = pb.matrix.translation.copy()
    pb.matrix = m
    bpy.context.view_layer.update()


def solve_ik(upper, lower, effector, target, pole):
    """Two-bone IK by hand (deterministic; no constraint): the root joint stays, the middle joint goes where the bend
    toward `pole` puts it for the bones' lengths, the effector joint (ankle / wrist) onto `target`.
    upper: thigh / upper arm, lower: shin / forearm, effector: the bone whose head is the end joint."""
    H = W(arm.pose.bones[upper].head)
    K0 = W(arm.pose.bones[lower].head)
    E0 = W(arm.pose.bones[effector].head)
    L1, L2 = (K0 - H).length, (E0 - K0).length
    d = min((target - H).length, L1 + L2 - 1e-4)
    u = (target - H).normalized()
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, L1 * L1 - a * a))
    n = (pole - H) - u * (pole - H).dot(u)
    n.normalize()
    K = H + u * a + n * h
    aim(upper, H, lower, K)
    aim(lower, W(arm.pose.bones[lower].head), effector, H + u * d)
    return (W(arm.pose.bones[effector].head) - target).length, round(math.degrees(math.acos(max(-1, min(1, (K - H).normalized().dot((H + u * d - K).normalized()))))), 1)


def turn_bone_world(name, R_world):
    """Set bone `name` to its rest orientation turned by the world rotation R_world, at its current head."""
    pb = arm.pose.bones[name]
    Q = AW.to_3x3().normalized()
    Ra = Q.inverted() @ R_world @ Q
    rest = pb.bone.matrix_local.to_3x3()
    m = (Ra @ rest).to_4x4()
    m.translation = pb.head.copy()
    pb.matrix = m
    bpy.context.view_layer.update()


rep = dict(note='제작 판단: 원본 애니메이션이 아니다 — 게임 검술의 아나킨 기본 자세(moves.js)를 이 모델 뼈대에 옮긴 정지 자세', stance=dict(
    grip=list(GRIP), blade_dir=[round(v, 4) for v in D], yaw=YAW, pitch=PITCH, left_grip=list(GRIP_L), feet={k: list(v) for k, v in FOOT.items()}, hip_drop=HIP_DROP))
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'

# 1. hips down
pel = arm.pose.bones['pelvis']
m = pel.matrix.copy()
m.translation = AWi @ (W(m.translation) - Vector((0, 0, HIP_DROP)))
pel.matrix = m
bpy.context.view_layer.update()

# 2. legs: the ankle (talus head) to the foot's place + its rest height; knees forward
errs = {}
for s in 'lr':
    ankle_rest = rest_head(f'{s}talus')
    target = FOOT[s] + Vector((0, 0, ankle_rest.z))
    talus_rest_rot = (AW.to_3x3().normalized() @ arm.data.bones[f'{s}talus'].matrix_local.to_3x3())
    errs[f'{s}_leg'], ang = solve_ik(f'{s}femurYZ', f'{s}tibia', f'{s}talus', target, target + Vector((1.0, 0, 0.5)))  # (knee forward)
    # the foot flat as at rest (its world rotation kept), turned like the stance (rear foot out 30°)
    yaw = 0 if s == 'l' else -30
    pb = arm.pose.bones[f'{s}talus']
    Q = AW.to_3x3().normalized()
    want = Matrix.Rotation(yaw * RAD, 3, 'Z') @ talus_rest_rot
    mm = (Q.inverted() @ want).to_4x4()
    mm.translation = pb.head.copy()
    pb.matrix = mm
    bpy.context.view_layer.update()

# 3. hands: the hand turned so its grip axis runs along the blade (roll: the wrist toward the shoulder), then the wrist
#    placed so the grip centre lands on its point (IK on the arm), fingers closed
for s, P in (('r', GRIP), ('l', GRIP_L)):
    c0, g0, w0 = grip_frame(s)
    sh = rest_head(f'{s}humerus')
    R1 = g0.rotation_difference(D).to_matrix()
    best = None
    for k in range(72):
        R = Matrix.Rotation(k * 5 * RAD, 3, D) @ R1
        wrist = P + R @ (w0 - c0)
        score = (wrist - P).normalized().dot((sh - P).normalized()) - 0.6 * max(0, (wrist - P).normalized().z)
        if best is None or score > best[0]:
            best = (score, R)
    R = best[1]
    wrist_target = P + R @ (w0 - c0)
    errs[f'{s}_arm'], _ = solve_ik(f'{s}humerus', f'{s}radius', f'{s}hand', wrist_target, wrist_target + Vector((-0.4, 0.5 if s == 'l' else -0.5, -0.6)))  # (elbow down, back, out)
    turn_bone_world(f'{s}hand', R)
    for f, deg in ((f'{s}_d2_j1', CURL['j1']), (f'{s}_d4_j1', CURL['j1']), (f'{s}_d2_j2', CURL['j2']), (f'{s}_d4_j2', CURL['j2']), (f'{s}_d1_j1', CURL['thumb'])):
        pb = arm.pose.bones[f]
        pb.matrix_basis = Matrix.Rotation(deg * RAD, 4, 'X') @ pb.matrix_basis
    bpy.context.view_layer.update()
rep['ik_reach_error_m'] = {k: round(v, 4) for k, v in errs.items()}
bpy.ops.object.mode_set(mode='OBJECT')

# 4. the hilt on the right hand (its axis = D through the right grip point), markers on it
hilt = bpy.data.objects.new('hilt', None)
bpy.context.scene.collection.objects.link(hilt)
x = D.cross(Vector((0, 0, 1)))
x = x.normalized() if x.length > 1e-3 else Vector((1, 0, 0))
hilt.matrix_world = Matrix.Translation(GRIP) @ Matrix((x, D.cross(x), D)).transposed().to_4x4()  # local Z = D
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
for name, z in (('saberBase', HILT[1]), ('saberTip', HILT[1] + 1.0)):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.parent = hilt
    e.matrix_parent_inverse = Matrix.Identity(4)
    e.location = (0, 0, z)
bpy.context.view_layer.update()
mw = hilt.matrix_world.copy()
hilt.parent = arm
hilt.parent_type = 'BONE'
hilt.parent_bone = 'rhand'
bpy.context.view_layer.update()
hilt.matrix_world = mw
bpy.context.view_layer.update()

# 5. checks: each hand's palm on the hilt axis; the blade along D; the markers 1 m apart
pos = md_lib.evaluated(S.meshes)
a0 = GRIP + D * HILT[0]
a1 = GRIP + D * HILT[1]


def seg_dist(p):
    t = max(0.0, min(1.0, (p - a0).dot(a1 - a0) / (a1 - a0).length_squared))
    return (p - (a0 + (a1 - a0) * t)).length, t


contact = {}
for s in 'lr':
    vs = pos[f'{s}_hand_0']
    ds = sorted(seg_dist(p)[0] for p in vs)
    near = [p for p in vs if seg_dist(p)[0] < 0.035]
    contact[s] = dict(closest_m=round(ds[0], 4), verts_within_35mm=len(near), verts_inside_hilt=sum(1 for p in vs if seg_dist(p)[0] < 0.016),
                      along_hilt=[round(min(seg_dist(p)[1] for p in near), 2), round(max(seg_dist(p)[1] for p in near), 2)] if near else None)
b = bpy.data.objects['saberBase'].matrix_world.translation
t = bpy.data.objects['saberTip'].matrix_world.translation
rep['grip_contact'] = contact
rep['blade'] = dict(base=[round(v, 3) for v in b], tip=[round(v, 3) for v in t], length_m=round((t - b).length, 4),
                    angle_to_wanted_deg=round(math.degrees((t - b).angle(D)), 3), base_at_grip_plus_m=round((b - GRIP).dot(D), 4))

# 6. the action `ready` (1 frame): every pose bone keyed as posed
act = bpy.data.actions.new('ready')
act.use_fake_user = True
arm.animation_data_create().action = act
for pb in arm.pose.bones:
    pb.keyframe_insert('rotation_quaternion', frame=0)
    pb.keyframe_insert('location', frame=0)
arm.animation_data.action = None
for im in bpy.data.images:  # (the pack's textures inside the .blend: it opens anywhere without the pack folder)
    if im.source == 'FILE' and not im.packed_file:
        im.pack()
blend = OUT / 'md_anakin_ready.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
src = json.loads((OUT / 'md_anakin_bind.blend.src.json').read_text()) if (OUT / 'md_anakin_bind.blend.src.json').exists() else {'model': 'unknown'}
import hashlib  # noqa: E402
(OUT / 'md_anakin_ready.blend.src.json').write_text(json.dumps({'model': src['model'], 'anims': {'ready': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:16]}}, indent=1))
(OUT / 'md_anakin_ready_meta.json').write_text(json.dumps({'anims': {'ready': {'fps': 1, 'loop': True, 'hit': None, 'frames': 1}}}, indent=1))
(OUT / 'ready_report.json').write_text(json.dumps(rep, indent=1, ensure_ascii=False))
print('READY', blend, json.dumps(rep, ensure_ascii=False))
