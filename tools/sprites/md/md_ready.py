"""
Movie Duels Anakin: held combat-ready poses (PRODUCTION CHOICES — not animations from the original game), on a separate
copy of the prepared model, with the game's existing lightsaber hilt in both hands.

  .bvenv/bin/python tools/sprites/md/md_ready.py <pack> <out dir> [v0 | variants | cand] [--gains Arms=1.35,Torso=0.9]
                                                 [--name <blend name>]

  v0        (default) the first diagnostic's pose, unchanged: one action `ready` → md_anakin_ready.blend
  variants  one action per entry of VARIANTS (1 frame each): the grip height / upper-body lean / blade angle / feet /
            hands comparisons of diagnostic 02 → md_anakin_var.blend
  cand      the candidate pose CAND as `ready` (1 frame), `idle` (4 frames, breathing) and `walk` (6 frames: the legs of
            the game's own guard-less stance walk, tools/sprites/out/hero_clips.json anakin walk_f) → md_anakin_cand.blend
  --gains   a material's texture value scaled in the shader (a comparison; the pack's images are not changed)

The base pose is the game's own Anakin stance (src/combat/moves.js MOVES.anakin.stance and feet): the grip at 0.30 m
forward, 0.10 m right, 1.08 m up; the blade yawed 14° to the right and pitched 58° up; both hands on the hilt (the left
0.11 m below the right, pose.js handL); the left foot forward (0.22 m forward, 0.13 m left), the right foot back (0.20 m
back, 0.17 m right); the hips 0.06 m lower. A variant overrides some of these (P below). The model's own bones are posed:
two-bone IK computed by hand (solve_ik — Blender's IK constraint reaches for the shin / forearm bone's tail, which in this
skeleton sits 1–5 cm off the ankle / wrist, and stalled on the legs) for the arms (wrist) and the legs (ankle), the hands
turned so their grip runs along the blade, the fingers closed. Nothing of the mesh or its weights changes.

Hands: 'v0' (diagnostic 01) picks the hand's roll about the blade by "wrist toward the shoulder" and closes every finger
by a fixed curl about the bone's X. 'v1' (diagnostic 02) picks the roll with the least wrist bend and twist against the
forearm, puts half the remaining twist into the forearm's twist bone (`*radiusX`, weighted to the wrist), and fits each
finger joint's curl (sign and angle, j1 then j2) so the finger lies on the hilt's surface without going into it — the
left hand's fingers stayed open in v0 (the curl about +X opens them on that side).

The hilt: tools/sprites/hero/pose_hero.py's (HILT, hilt_parts — Anakin's), its markers saberBase / saberTip on the hilt's
axis (render_sprites.py projects them; the game draws the blade), the hilt parented to the right hand bone. In the hand's
own frame the hilt is always the same line (through the grip centre along the knuckle line), so one parenting serves
every pose and every frame.

Writes <name>.blend (+ .src.json, _meta.json) and <name>_report.json: per action the grip contact (each hand's palm to
the hilt axis), the wrist bend / twist, the finger fit, the blade axis against the wanted direction, the IK reach errors
and the two legs' overlap on screen in each of the 8 directions (render_sprites.py's camera).
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
from pose_hero import HILT, hilt_parts  # noqa: E402  (the game's hilt: the same parts and markers as the duel sheets)
import materials  # noqa: E402

args = sys.argv[1:]
PACK, OUT = Path(args[0]).resolve(), Path(args[1]).resolve()
MODE = args[2] if len(args) > 2 and not args[2].startswith('--') else 'v0'
opt = {args[i][2:]: args[i + 1] for i in range(len(args) - 1) if args[i].startswith('--')}
GAINS = {k: float(v) for k, v in (kv.split('=') for kv in opt['gains'].split(','))} if opt.get('gains') else {}
NAME = opt.get('name', {'v0': 'md_anakin_ready', 'variants': 'md_anakin_var', 'cand': 'md_anakin_cand'}[MODE])
OUT.mkdir(parents=True, exist_ok=True)
RAD = math.pi / 180
HILT_R = 0.017  # (m) the grip section's radius (hilt_parts('anakin'))

# the pose parameters (game frame: f forward, r right, u up → Blender x = f, y = -r, z = u); V0 = diagnostic 01
V0 = dict(grip=(0.30, 0.10, 1.08), yaw=14, pitch=58, left=0.11, lean=0, hip_drop=0.06, turn=0,
          foot_l=(0.22, 0.13), foot_r=(-0.20, -0.17), front_yaw=0, rear_yaw=-30, knee_l=0, knee_r=0, rear_heel=0, hands='v0')


def var(**k):
    return {**V0, 'hands': 'v1', **k}


# diagnostic 02 (docs/characters/MD_ANAKIN.md "진단 02"): one change at a time against `a_v0h1` (= v0 with the new hands)
B = dict(grip=(0.30, 0.10, 1.20), lean=5)  # the height / lean the angle and feet rows are compared on
LINE = dict(foot_l=(0.248, 0.079), foot_r=(-0.228, -0.119))  # (see CAND)
VARIANTS = {  # (v0 itself: the `v0` mode's sheet — one blend holds one way of holding the hilt, its hilt parented once)
    'a_v0h1': var(),
    'b_h118': var(grip=(0.30, 0.10, 1.18)),
    'd_line': var(**B, **LINE),
    'd_lineknee': var(**B, **LINE, knee_l=12, knee_r=25),
    'b_h118l5': var(grip=(0.30, 0.10, 1.18), lean=5),
    'b_h120l5': var(**B),
    'b_h123l5': var(grip=(0.30, 0.10, 1.23), lean=5),
    'c_p48': var(**B, pitch=48),
    'c_p53': var(**B, pitch=53),
    'c_p63': var(**B, pitch=63),
    'c_p68': var(**B, pitch=68),
    'c_y4': var(**B, yaw=4),
    'c_y24': var(**B, yaw=24),
    'd_knee': var(**B, knee_l=12, knee_r=25),
    'd_heel': var(**B, rear_heel=0.05, rear_yaw=-45),
    'd_turn': var(**B, turn=15),
    'd_all': var(**B, knee_l=12, knee_r=25, rear_heel=0.05, rear_yaw=-45),
}
# the candidate (MD_ANAKIN.md "진단 02"): B with the feet's line turned to 22.5° from forward — the same 0.52 m between
# the feet and the same midpoint, the line half-way between two of the 8 views' sight lines (it lay 9.5° off one)
CAND = var(**B, **LINE)


def clip_frames(name):
    clips = json.loads((HERE.parent / 'out' / 'hero_clips.json').read_text())['styles']['anakin']['clips']
    return clips[name]


def actions_for(mode):
    """{action: [P per frame]}, {action: timing for the meta file}"""
    if mode == 'v0':
        return {'ready': [dict(V0)]}, {'ready': {'fps': 1, 'loop': True, 'hit': None, 'frames': 1}}
    if mode == 'variants':
        return {k: [v] for k, v in VARIANTS.items()}, {k: {'fps': 1, 'loop': True, 'hit': None, 'frames': 1} for k in VARIANTS}
    acts, meta = {'ready': [dict(CAND)]}, {'ready': {'fps': 1, 'loop': True, 'hit': None, 'frames': 1}}
    # idle: a slow breath (production choice): the hips sink a little and the hands rise a little, 4 frames over 1.6 s
    breath = [0, 0.5, 1, 0.5]
    acts['idle'] = [{**CAND, 'hip_drop': CAND['hip_drop'] + 0.008 * b, 'grip': (CAND['grip'][0], CAND['grip'][1], CAND['grip'][2] + 0.006 * b)} for b in breath]
    meta['idle'] = {'fps': 2.5, 'loop': True, 'hit': None, 'frames': 4}
    # walk: the stance walk's legs (walk_f, guard off: 6 frames over its period) under the candidate's upper body. The
    # clip's feet are the game skeleton's (stand hips 0.95 m); its hips' drop is kept as a drop
    wf = clip_frames('walk_f')
    acts['walk'] = []
    for fr in wf['frames']:
        fl, frr = fr['footL'], fr['footR']
        acts['walk'].append({**CAND, 'hip_drop': CAND['hip_drop'] + (0.89 - fr['hips'][2]), 'foot_l': (fl[0], fl[1]), 'lift_l': fl[2],
                             'foot_r': (frr[0], frr[1]), 'lift_r': frr[2], 'rear_heel': 0 if frr[2] > 0.01 else CAND['rear_heel']})
    meta['walk'] = {'fps': round(len(wf['frames']) / wf['period'], 3), 'loop': True, 'hit': None, 'frames': len(wf['frames']), 'speed': wf['speed'], 'stride': wf['stride']}
    return acts, meta


ACTS, META = actions_for(MODE)
assert len({P['hands'] for fr in ACTS.values() for P in fr}) == 1, 'one hands mode per blend (the hilt is parented once)'
S = md_lib.build(PACK, gains=GAINS)
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


def grip_frame(s, hands='v0'):
    """The hand's grip at rest (world): centre c and axis g (from the little-finger knuckle to the index knuckle: the line
    a closed fist holds a hilt along), plus the wrist.
    'v0': the centre a little back from the knuckle line toward the wrist and toward the thumb — inside the hand, so the
    fingers had nothing to close round. 'v1': in front of the palm (the hilt's radius beyond the palm's surface, on the
    side the fingers close to), 1.5 cm back from the knuckles: a fist's grip across the palm's crease."""
    i, l = rest_head(f'{s}_d2_j1'), rest_head(f'{s}_d4_j1')
    wrist = rest_head(f'{s}hand')
    g = (i - l).normalized()
    mid = (i + l) / 2
    palm = (mid - wrist)
    if hands == 'v0':
        thumb = rest_head(f'{s}_d1_j1')
        side = (thumb - mid)
        side -= g * side.dot(g)
        c = mid - palm * 0.15 + side.normalized() * 0.012
        return c, g, wrist
    n = PALM[s]
    pu = (palm - g * palm.dot(g)).normalized()
    front = max((v - mid).dot(n) for v in pos0[f'{s}_hand_0'] if -0.06 < (v - mid).dot(pu) < 0.005 and abs((v - mid).dot(g)) < 0.05)
    c = mid - pu * 0.015 + n * (front + HILT_R)
    return c, g, wrist


def aim(name, pivot_joint, from_joint, to_point):
    """Turn bone `name` about its head (the world rotation that takes the line pivot→from_joint onto pivot→to_point)."""
    a = (W(arm.pose.bones[from_joint].head) - pivot_joint).normalized()
    b = (to_point - pivot_joint).normalized()
    R = a.rotation_difference(b).to_matrix()
    pb = arm.pose.bones[name]
    m = ((Q.inverted() @ R @ Q) @ pb.matrix.to_3x3()).to_4x4()
    m.translation = pb.matrix.translation.copy()
    pb.matrix = m
    update()


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
    return (W(arm.pose.bones[effector].head) - target).length


def turn_bone_world(name, R_world):
    """Set bone `name` to its rest orientation turned by the world rotation R_world, at its current head."""
    pb = arm.pose.bones[name]
    Ra = Q.inverted() @ R_world @ Q
    m = (Ra @ pb.bone.matrix_local.to_3x3()).to_4x4()
    m.translation = pb.head.copy()
    pb.matrix = m
    update()


def rotate_bone_world(name, R_world):
    """Turn bone `name` (and so its children) by the world rotation R_world about its head, from where it is now."""
    pb = arm.pose.bones[name]
    m = ((Q.inverted() @ R_world @ Q) @ pb.matrix.to_3x3()).to_4x4()
    m.translation = pb.matrix.translation.copy()
    pb.matrix = m
    update()


def blade_dir(P):
    y, p = P['yaw'] * RAD, P['pitch'] * RAD
    return Vector((math.cos(-y) * math.cos(p), math.sin(-y) * math.cos(p), math.sin(p)))


def grips(P):
    g = Vector((P['grip'][0], -P['grip'][1], P['grip'][2]))
    D = blade_dir(P)
    return g, g - D * P['left'], D


# --- the feet: the ball of each boot at rest (the sole's front part: the heel lifts about it)
pos0 = md_lib.evaluated(S.meshes)
BALL = {}
for s in 'lr':
    vs = pos0[f'{s}_leg_0']
    zmin = min(p.z for p in vs)
    low = [p for p in vs if p.z < zmin + 0.02]
    x0, x1 = min(p.x for p in low), max(p.x for p in low)
    BALL[s] = Vector((x0 + 0.72 * (x1 - x0), sum(p.y for p in low) / len(low), 0))


def palm_normal():
    """The side the fingers close to (the right hand: its index knuckle turned about +X closes — md_deform.py "finger"),
    square to the knuckle line and to the hand's length; the left hand the mirror image (the skeleton is symmetric)."""
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


def twist_swing(s):
    """The hand against the forearm, compared with rest (degrees): the twist about the forearm's axis and the swing (bend)."""
    rad, hand = arm.pose.bones[f'{s}radius'], arm.pose.bones[f'{s}hand']
    rel_pose = (rad.matrix.to_3x3().inverted() @ hand.matrix.to_3x3()).to_quaternion()
    rel_rest = (rad.bone.matrix_local.to_3x3().inverted() @ hand.bone.matrix_local.to_3x3()).to_quaternion()
    d = rel_pose @ rel_rest.inverted()
    if d.w < 0:
        d = -d
    tw = 2 * math.atan2(d.y, d.w)
    swing = d @ Quaternion((0, 1, 0), tw).inverted()
    return math.degrees(tw), math.degrees(swing.angle if swing.angle <= math.pi else 2 * math.pi - swing.angle)


def place_hand(s, P_point, D, hands):
    c0, g0, w0 = grip_frame(s, hands)
    sh = rest_head(f'{s}humerus')
    R1 = g0.rotation_difference(D).to_matrix()
    pole_of = lambda w: w + Vector((-0.4, 0.5 if s == 'l' else -0.5, -0.6))  # noqa: E731  (elbow down, back, out)

    def fresh():  # (every try from the arm's rest: the IK's result does not depend on the tries before it)
        for b in (f'{s}humerus', f'{s}radius', f'{s}radiusX', f'{s}hand'):
            arm.pose.bones[b].matrix_basis = Matrix.Identity(4)
        update()
    if hands == 'v0':
        best = None
        for k in range(72):
            R = Matrix.Rotation(k * 5 * RAD, 3, D) @ R1
            wrist = P_point + R @ (w0 - c0)
            score = (wrist - P_point).normalized().dot((sh - P_point).normalized()) - 0.6 * max(0, (wrist - P_point).normalized().z)
            if best is None or score > best[0]:
                best = (score, R)
        R = best[1]
    else:
        # the roll with the least wrist bend and twist (the wrist still on the shoulder's side of the grip)
        best = None
        for k in range(72):
            R = Matrix.Rotation(k * 5 * RAD, 3, D) @ R1
            wrist = P_point + R @ (w0 - c0)
            side = (wrist - P_point).normalized().dot((sh - P_point).normalized())
            if side < 0.1:
                continue
            fresh()
            solve_ik(f'{s}humerus', f'{s}radius', f'{s}hand', wrist, pole_of(wrist))
            turn_bone_world(f'{s}hand', R)
            tw, sw = twist_swing(s)
            score = sw + 0.35 * abs(tw)
            if best is None or score < best[0]:
                best = (score, R)
        R = best[1]
    wrist = P_point + R @ (w0 - c0)
    fresh()
    err = solve_ik(f'{s}humerus', f'{s}radius', f'{s}hand', wrist, pole_of(wrist))
    turn_bone_world(f'{s}hand', R)
    tw, sw = twist_swing(s)
    out = dict(wrist_twist_deg=round(tw, 1), wrist_bend_deg=round(sw, 1))
    if hands != 'v0':
        # half the twist into the forearm's twist bone (weighted to the wrist): the wrist does not wring
        x = arm.pose.bones[f'{s}radiusX']
        x.rotation_quaternion = Quaternion((0, 1, 0), math.radians(tw) * 0.5)
        update()
        out['forearm_twist_bone_deg'] = round(tw * 0.5, 1)
    return err, out


FINGERS = {s: [f'{s}_d2_j1', f'{s}_d2_j2', f'{s}_d4_j1', f'{s}_d4_j2', f'{s}_d1_j1', f'{s}_d1_j2'] for s in 'lr'}
CURL_V0 = {'j1': 55, 'j2': 45, 'thumb': 25}  # (deg about each finger bone's X; diagnostic 01)


def curl_v0(s):
    for f, deg in ((f'{s}_d2_j1', CURL_V0['j1']), (f'{s}_d4_j1', CURL_V0['j1']), (f'{s}_d2_j2', CURL_V0['j2']), (f'{s}_d4_j2', CURL_V0['j2']), (f'{s}_d1_j1', CURL_V0['thumb'])):
        pb = arm.pose.bones[f]
        pb.matrix_basis = Matrix.Rotation(deg * RAD, 4, 'X') @ pb.matrix_basis
    update()


def hand_verts(s):
    """Evaluated world positions of the hand mesh's vertices, and each vertex's strongest bone."""
    deps = bpy.context.evaluated_depsgraph_get()
    o = bpy.data.objects[f'{s}_hand_0']
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


VG = {}
for s in 'lr':
    o = bpy.data.objects[f'{s}_hand_0']
    names = {g.index: g.name for g in o.vertex_groups}
    VG[s] = [max(((names[g.group], g.weight) for g in v.groups), key=lambda t: t[1])[0] if v.groups else None for v in o.data.vertices]


def axis_dist(p, a, d):
    v = p - a
    return (v - d * v.dot(d)).length


def fit_fingers(s, a, d):
    """Each finger (index, ring, thumb) closed at both joints, each about its own X toward the palm only (the side a small
    turn moves the bone's tip to the palm; no joint bends backward): the pair of angles (0…110°, thumb 0…70°, 10° steps)
    that lays both segments on the hilt's surface (per segment the mean |distance to the axis − (radius + 8 mm)|, going
    into the hilt counted 4×; the two segments weigh the same, so the tip does not curl past the hilt). Returns the
    angles per bone."""
    angles = {}
    hand = arm.pose.bones[f'{s}hand']
    Rh = hand.matrix.to_3x3() @ hand.bone.matrix_local.to_3x3().inverted()
    n = (Q @ Rh @ Q.inverted()) @ PALM[s]  # (the palm's side, posed)

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


def finger_report(s, a, d):
    pts = hand_verts(s)
    out = {}
    for f in FINGERS[s]:
        idx = [i for i, g in enumerate(VG[s]) if g == f]
        if idx:
            ds = [axis_dist(pts[i], a, d) for i in idx]
            out[f] = dict(mean_gap_mm=round(1000 * (sum(ds) / len(ds) - HILT_R), 1), inside=sum(1 for x in ds if x < HILT_R - 0.002))
    return out


def reset_pose():
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    update()


FINGER_FIT = {}  # (side → angles): the hilt is the same line in the hand's frame in every pose, so fitted once


def pose(P):
    """Pose the armature for P (from rest). Returns the per-pose report."""
    reset_pose()
    rep = {}
    G, GL, D = grips(P)
    # 1. hips down
    pel = arm.pose.bones['pelvis']
    m = pel.matrix.copy()
    m.translation = AWi @ (W(m.translation) - Vector((0, 0, P['hip_drop'])))
    pel.matrix = m
    update()
    # 2. the hips turned (the lead hip forward; a bladed stance), the chest turned back by most of it; the upper body
    #    leaned forward from the lumbar bones, the neck turned back by most of it
    if P['turn']:
        rotate_bone_world('pelvis', Matrix.Rotation(-P['turn'] * RAD, 3, 'Z'))
        rotate_bone_world('upper_lumbar', Matrix.Rotation(P['turn'] * 0.7 * RAD, 3, 'Z'))
    if P['lean']:
        fwd = Matrix.Rotation(-P['turn'] * RAD, 3, 'Z') @ Vector((0, 1, 0))  # (the hips' left: the lean's axis)
        for b in ('lower_lumbar', 'upper_lumbar'):
            rotate_bone_world(b, Matrix.Rotation(P['lean'] / 2 * RAD, 3, fwd))
        rotate_bone_world('cervical', Matrix.Rotation(-P['lean'] * 0.7 * RAD, 3, fwd))
    # 3. legs: the ankle (talus head) where the foot is placed, + its rest height; knees forward (and out by knee_*);
    #    the rear heel lifted about the ball of the foot
    errs = {}
    for s in 'lr':
        fx, fy = P[f'foot_{s}']
        lift = P.get(f'lift_{s}', 0)
        ankle_rest = rest_head(f'{s}talus')
        yaw = P['front_yaw'] if s == 'l' else P['rear_yaw']
        heel = P['rear_heel'] if s == 'r' else 0
        Rz = Matrix.Rotation(yaw * RAD, 3, 'Z')
        flat_ankle = Vector((fx, fy, ankle_rest.z + lift))
        if heel:
            ball_rel = BALL[s] - Vector((ankle_rest.x, ankle_rest.y, 0)) - Vector((0, 0, ankle_rest.z))  # (ankle → ball, rest)
            th = math.asin(min(0.9, heel / max(0.05, ball_rel.x + 0.07)))  # (heel ≈ 7 cm behind the ankle)
            Rf = Rz @ Matrix.Rotation(th, 3, 'Y')
            ball = flat_ankle + Rz @ ball_rel
            target = ball - Rf @ ball_rel
        else:
            Rf = Rz
            target = flat_ankle
        out = 1 if s == 'l' else -1
        pole = target + Matrix.Rotation(out * P[f'knee_{s}'] * RAD, 3, 'Z') @ Matrix.Rotation(-P['turn'] * RAD, 3, 'Z') @ Vector((1.0, 0, 0.5))
        errs[f'{s}_leg'] = round(solve_ik(f'{s}femurYZ', f'{s}tibia', f'{s}talus', target, pole), 4)
        talus_rest_rot = Q @ arm.data.bones[f'{s}talus'].matrix_local.to_3x3()
        pb = arm.pose.bones[f'{s}talus']
        mm = (Q.inverted() @ Rf @ talus_rest_rot).to_4x4()
        mm.translation = pb.head.copy()
        pb.matrix = mm
        update()
    # 4. hands on the hilt
    for s, Pp in (('r', G), ('l', GL)):
        errs[f'{s}_arm'], rep[f'{s}_wrist'] = place_hand(s, Pp, D, P['hands'])
        errs[f'{s}_arm'] = round(errs[f'{s}_arm'], 4)
        if P['hands'] == 'v0':
            curl_v0(s)
        else:
            if s not in FINGER_FIT:
                FINGER_FIT[s] = fit_fingers(s, Pp, D)
            for f, deg in FINGER_FIT[s].items():
                arm.pose.bones[f].rotation_quaternion = Quaternion((1, 0, 0), deg * RAD)
            update()
        rep[f'{s}_fingers'] = finger_report(s, Pp, D)
    rep['ik_reach_error_m'] = errs
    return rep


def contact(P):
    G, _, D = grips(P)
    pos = md_lib.evaluated(S.meshes)
    a0, a1 = G + D * HILT[0], G + D * HILT[1]

    def seg(p):
        t = max(0.0, min(1.0, (p - a0).dot(a1 - a0) / (a1 - a0).length_squared))
        return (p - (a0 + (a1 - a0) * t)).length, t

    out = {}
    for s in 'lr':
        vs = pos[f'{s}_hand_0']
        near = [p for p in vs if seg(p)[0] < 0.035]
        out[s] = dict(closest_m=round(min(seg(p)[0] for p in vs), 4), verts_within_35mm=len(near), verts_inside_hilt=sum(1 for p in vs if seg(p)[0] < 0.016),
                      along_hilt=[round(min(seg(p)[1] for p in near), 2), round(max(seg(p)[1] for p in near), 2)] if near else None)
    return out, pos


# the screen of render_sprites.py's camera: orthographic, 30° down, from the +X −Y side; direction i turns the model by
# −i·45° about Z. Game px: 1 m along the image plane = 28.28 px (an axis step 20 px across, 10 down)
PX = 20 / math.sqrt(0.5)
RIGHT = Vector((1, 1, 0)).normalized()
UP = Vector((-0.5 / math.sqrt(2), 0.5 / math.sqrt(2), math.sqrt(3) / 2))


def leg_overlap(pos):
    """The two lower legs (shin + boot meshes) on screen in each of the 8 directions: the overlap of their silhouettes
    as a share of the smaller one (0 = apart, 1 = one hides the other), at 4 samples per game px."""
    from PIL import Image, ImageDraw
    import numpy as np
    tris = {}
    deps = bpy.context.evaluated_depsgraph_get()
    for s in 'lr':
        o = bpy.data.objects[f'{s}_leg_0'].evaluated_get(deps)
        me = o.to_mesh()
        me.calc_loop_triangles()
        tris[s] = [[pos[f'{s}_leg_0'][i] for i in t.vertices] for t in me.loop_triangles]
        o.to_mesh_clear()
    res = []
    for i in range(8):
        R = Matrix.Rotation(-i * math.pi / 4, 3, 'Z')
        masks = []
        for s in 'lr':
            im = Image.new('L', (400, 400), 0)
            dr = ImageDraw.Draw(im)
            for t in tris[s]:
                dr.polygon([(200 + 4 * PX * (R @ p).dot(RIGHT), 330 - 4 * PX * (R @ p).dot(UP)) for p in t], fill=255)
            masks.append(np.asarray(im) > 0)
        inter = (masks[0] & masks[1]).sum()
        res.append(round(float(inter / max(1, min(masks[0].sum(), masks[1].sum()))), 3))
    return res


# --- pose every frame (no action assigned: the pose is the bones' own values), keep each frame's bone values
reports, keyed = {}, {}
for act, frames in ACTS.items():
    keyed[act] = []
    for fi, P in enumerate(frames):
        r = pose(P)
        if fi == 0:
            c, pos = contact(P)
            r['grip_contact'] = c
            r['leg_overlap_8dirs'] = leg_overlap(pos)
            r['params'] = {k: v for k, v in P.items()}
            reports[act] = r
        else:
            reports[act].setdefault('frames_ik_error_m', []).append(r['ik_reach_error_m'])
        keyed[act].append({pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones})
    print('POSED', act, json.dumps({k: reports[act][k] for k in ('ik_reach_error_m', 'leg_overlap_8dirs', 'r_wrist', 'l_wrist')}), flush=True)

# --- the hilt on the right hand, from the first action's first frame (the same line in the hand's frame in every pose)
first = next(iter(ACTS))
for pb in arm.pose.bones:
    pb.rotation_quaternion, pb.location = keyed[first][0][pb.name]
update()
P0 = ACTS[first][0]
G0, _, D0 = grips(P0)
bpy.ops.object.mode_set(mode='OBJECT')
hilt = bpy.data.objects.new('hilt', None)
bpy.context.scene.collection.objects.link(hilt)
x = D0.cross(Vector((0, 0, 1)))
x = x.normalized() if x.length > 1e-3 else Vector((1, 0, 0))
hilt.matrix_world = Matrix.Translation(G0) @ Matrix((x, D0.cross(x), D0)).transposed().to_4x4()  # local Z = D
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
update()
mw = hilt.matrix_world.copy()
hilt.parent = arm
hilt.parent_type = 'BONE'
hilt.parent_bone = 'rhand'
update()
hilt.matrix_world = mw
update()

# --- the blade against the wanted direction in each action's first frame (the hilt follows the hand)
for act, frames in ACTS.items():
    for pb in arm.pose.bones:
        pb.rotation_quaternion, pb.location = keyed[act][0][pb.name]
    update()
    D = blade_dir(frames[0])
    G = grips(frames[0])[0]
    b = bpy.data.objects['saberBase'].matrix_world.translation
    t = bpy.data.objects['saberTip'].matrix_world.translation
    reports[act]['blade'] = dict(base=[round(v, 3) for v in b], tip=[round(v, 3) for v in t], length_m=round((t - b).length, 4),
                                 angle_to_wanted_deg=round(math.degrees((t - b).angle(D)), 3), base_at_grip_plus_m=round((b - G).dot(D), 4),
                                 base_off_axis_mm=round(1000 * axis_dist(b, G, D), 2))

# --- the actions: every pose bone keyed per frame (values written straight, no evaluation in between)
ad = arm.animation_data_create()
for act, frames in keyed.items():
    a = bpy.data.actions.new(act)
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
for im in bpy.data.images:  # (the pack's textures inside the .blend: it opens anywhere without the pack folder)
    if im.source == 'FILE' and not im.packed_file:
        im.pack()
blend = OUT / f'{NAME}.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
src = json.loads((OUT / 'md_anakin_bind.blend.src.json').read_text()) if (OUT / 'md_anakin_bind.blend.src.json').exists() else {'model': 'unknown'}
me = hashlib.sha256((src['model'] + json.dumps(GAINS, sort_keys=True) + (HERE / 'md_ready.py').read_text() + (HERE / 'md_lib.py').read_text()).encode()).hexdigest()[:16]
(OUT / f'{NAME}.blend.src.json').write_text(json.dumps({'model': me if MODE != 'v0' else src['model'], 'anims': {
    a: hashlib.sha256((json.dumps(ACTS[a], sort_keys=True, default=str) + me).encode()).hexdigest()[:16] for a in ACTS}}, indent=1))
(OUT / f'{NAME}_meta.json').write_text(json.dumps({'anims': META}, indent=1))
(OUT / f'{NAME}_report.json').write_text(json.dumps(dict(mode=MODE, gains=GAINS, finger_fit_deg=FINGER_FIT, ball=dict((k, list(map(lambda v: round(v, 3), b))) for k, b in BALL.items()),
                                                        note='제작 판단: 원본 애니메이션이 아니다 — 게임 검술의 아나킨 기본 자세(moves.js)와 걷기(walk_f)를 이 모델 뼈대에 옮긴 것',
                                                        actions=reports), indent=1, ensure_ascii=False, default=str))
print('READY', blend, flush=True)
