"""
Deformation checks of the Movie Duels Anakin's skin (docs/characters/MD_ANAKIN.md): one bone turned at a time — the
upper arm, the elbow, the wrist, a finger, the knee, the coat tails — measured and pictured, then put back.

  .bvenv/bin/python tools/sprites/md/md_deform.py <pack> <out dir>

Per test and per skeleton variant (the FBX's own bone parents / HIER in md_lib):
  moved      the largest vertex displacement (m) — 0 means the bone deforms nothing
  seam       the largest gap (m) the turn opens between vertices that touch at rest (< 2 mm) across separate pieces
             (hand/arm, arm/shoulder, hips/legs …): the body coming apart at its seams
  stretch    the largest edge length ratio after/before, and how many edges stretch past 1.5× (tearing, collapse)
  restored   the largest vertex difference after putting the bone back (must be ~0)
Pictures: rest | turned, Cycles at a few samples (no EGL here for Workbench), a close orthographic view on the bone.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector, kdtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import md_lib  # noqa: E402

PACK, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

# (label, bone, axis in the bone's own frame, degrees, what it checks). Axes: the bone's X and Z are across it (bends),
# Y along it (twist). Both bends are tried where the anatomical one is not known; the report keeps each.
TESTS = [
    ('arm_x', 'rhumerus', 'X', 45, '오른 위팔 (어깨) — 제공 스크립트의 단일 팔뼈 검사를 크게'),
    ('arm_z', 'rhumerus', 'Z', 45, '오른 위팔 (어깨) — 다른 축'),
    ('elbow_x', 'rradius', 'X', 70, '오른 팔꿈치'),
    ('elbow_z', 'rradius', 'Z', 70, '오른 팔꿈치 — 다른 축'),
    ('wrist', 'rhand', 'X', 45, '오른 손목 — 손가락이 손을 따라오는가'),
    ('finger', 'r_d2_j1', 'X', 60, '오른 손가락 (d2 첫 마디)'),
    ('thumb', 'r_d1_j1', 'X', 50, '오른 엄지 (d1)'),
    ('lelbow', 'lradius', 'X', 70, '왼 팔꿈치'),
    ('knee_x', 'rtibia', 'X', 70, '오른 무릎 — 정강이를 앞으로 (반대 방향: 과신전 시험)'),
    ('knee_back', 'rtibia', 'X', -70, '오른 무릎 — 정강이를 뒤로 (해부학적 굽힘)'),
    ('knee_z', 'rtibia', 'Z', 70, '오른 무릎 — 다른 축'),
    ('hip', 'rfemurYZ', 'X', 40, '오른 엉덩이 (넓적다리)'),
    ('tail_l', 'ltail', 'X', 35, '옷자락 (왼쪽 뒤)'),
    ('tail_r', 'rtail', 'X', 35, '옷자락 (오른쪽 뒤)'),
    ('spine', 'upper_lumbar', 'X', 25, '허리 (상체 숙임)'),
]


def seams(rest):
    """Vertex pairs of different pieces (objects) that touch at rest (< 2 mm)."""
    allv = [(n, i, p) for n, ps in rest.items() for i, p in enumerate(ps)]
    kd = kdtree.KDTree(len(allv))
    for k, (_, _, p) in enumerate(allv):
        kd.insert(p, k)
    kd.balance()
    pairs = set()
    for k, (n, i, p) in enumerate(allv):
        for _, j, d in kd.find_range(p, 0.002):
            if j > k and allv[j][0] != n:
                pairs.add((n, i, allv[j][0], allv[j][1]))
    return sorted(pairs)


def edges(meshes):
    return {o.name: [tuple(e.vertices) for e in o.data.edges] for o in md_lib.visible(meshes)}


def metrics(rest, now, pairs, E):
    moved = max((now[n][i] - rest[n][i]).length for n in rest for i in range(len(rest[n])))
    seam = max(((now[a][i] - now[b][j]).length for a, i, b, j in pairs), default=0.0)
    worst, over = 1.0, 0
    for n, es in E.items():
        for a, b in es:
            l0 = (rest[n][a] - rest[n][b]).length
            if l0 < 1e-5:
                continue
            r = (now[n][a] - now[n][b]).length / l0
            worst = max(worst, r, 1 / max(r, 1e-6))
            over += r > 1.5 or r < 1 / 1.5
    return dict(moved=round(moved, 4), seam=round(seam, 4), stretch=round(worst, 3), stretched_edges=over)


def camera_on(point, size):
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size
    d = Vector((math.cos(math.radians(30)) * math.cos(math.radians(-30)), math.cos(math.radians(30)) * math.sin(math.radians(-30)), math.sin(math.radians(30))))
    cam.location = point + d * 10  # three-quarter front-right view from above (the model faces +X)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def setup_render():
    """Cycles at a few samples (this container has no EGL: no Workbench / EEVEE), a key sun and a grey sky."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 10
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = 360
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new('grey')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.45, 0.46, 0.5, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sc.world = w
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(40), 0, math.radians(-20))


def shot(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def run(variant, fix):
    S = md_lib.build(PACK, fix_hierarchy=fix, hide_caps=False)
    setup_render()
    arm = S.arm
    rest = md_lib.evaluated(S.meshes)
    pairs = seams(rest)
    E = edges(S.meshes)
    out = dict(variant=variant, fixes=S.report['fixes'], seam_pairs=len(pairs), tests=[])
    for label, bone, axis, deg, what in TESTS:
        pb = arm.pose.bones.get(bone)
        if pb is None:
            out['tests'].append(dict(test=label, bone=bone, status='bone missing'))
            continue
        head = arm.matrix_world @ pb.head
        camera_on(head, 0.9 if 'tail' in label or label in ('spine', 'hip') else 0.55)
        a = Path(OUT, f'{label}_{variant}_rest.png')
        shot(a)
        keep = pb.matrix_basis.copy()
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis = Matrix.Rotation(math.radians(deg), 4, axis) @ keep
        now = md_lib.evaluated(S.meshes)
        m = metrics(rest, now, pairs, E)
        b = Path(OUT, f'{label}_{variant}_posed.png')
        shot(b)
        pb.matrix_basis = keep
        back = md_lib.evaluated(S.meshes)
        restored = max((back[n][i] - rest[n][i]).length for n in rest for i in range(len(rest[n])))
        verdict = 'FAIL: no deformation' if m['moved'] < 1e-4 else 'FAIL: seam opens' if m['seam'] > 0.01 else 'check: edges stretched' if m['stretched_edges'] else 'pass'
        out['tests'].append(dict(test=label, what=what, bone=bone, axis=axis, degrees=deg, **m, restored=round(restored, 6), verdict=verdict,
                                 images=[a.name, b.name]))
        print(variant, label, m, 'restored', f'{restored:.2e}', verdict, flush=True)
    return out


report = dict(blender=bpy.app.version_string, note='Single-bone turns of the bind pose; not an animation QA.', variants=[run('fbx', False), run('fixed', True)])
Path(OUT, 'deform_report.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
print('DEFORM', Path(OUT, 'deform_report.json'))
