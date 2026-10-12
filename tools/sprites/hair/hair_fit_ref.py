"""
Fits the hair's parameters to the reference's silhouettes: a coordinate search over a few knobs
(lengths, volumes, how far forward the side hair falls, how low the bangs come, widths, volume
by direction), each step
building the hair (hair_v2.py) and scoring it against the reference (hair_match.py, the mean IoU
over the views). Starts from params.json, writes the best to out.json, a log beside it.
  python3 hair_fit_ref.py base.glb params.json out.json [rounds=3]
(run with the system python; it calls the bpy venv for the builds)
"""
import copy
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.join(HERE, '..', '..', '..', '.bvenv', 'bin', 'python')
GLB, BASE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ROUNDS = int(sys.argv[4]) if len(sys.argv) > 4 else 3
TMP = tempfile.mkdtemp(prefix='hairfit_')
LOG = open(os.path.splitext(OUT)[0] + '_log.txt', 'w')

SIDES = ('sideOuterR', 'sideOuterL', 'sideUnderR', 'sideUnderL')
FALLS = ('bangsRightFall', 'leftSweep')
BACK = ('backCentre', 'backUnder')
CORNERS = ('backSideL', 'backSideR')


def groups(P, names):
    return [g for g in P['groups'] if g['name'] in names]


def add_end(names):
    def f(P, d):
        for g in groups(P, names):
            g['end_theta'] = [x + d for x in g['end_theta']]
    return f


def mul(names, keys):
    def f(P, d):
        for g in groups(P, names):
            for k in keys:
                g[k] = max(0.0, g[k] * (1 + d))
    return f


def side_back(P, d):
    """The side hair's roots and ends moved round towards the back (d > 0), away from the face."""
    for g in groups(P, SIDES):
        s = 1 if g['root_phi'][0] > 0 else -1
        g['root_phi'] = [x + s * d for x in g['root_phi']]
    for g in groups(P, FALLS):
        s = 1 if g['end_phi'][0] > 0 else -1
        g['end_phi'] = [x + s * d for x in g['end_phi']]


def lift_shape(key):
    def f(P, d):
        P.setdefault('lift_shape', {})
        P['lift_shape'][key] = P['lift_shape'].get(key, 0.0) + d
    return f


# knob -> (apply(P, value), step)
KNOBS = {
    'len_side': (add_end(SIDES + FALLS), 0.1),
    'len_back': (add_end(BACK), 0.1),
    'len_corner': (add_end(CORNERS), 0.1),
    'len_crown': (add_end(('crown',)), 0.1),
    'vol_top': (mul(('crown',), ('lift', 'volume')), 0.3),
    'vol_back': (mul(BACK + CORNERS, ('lift', 'volume')), 0.3),
    'vol_bangs': (mul(('bangsAcross', 'leftSweep'), ('lift', 'volume')), 0.3),
    'bangs_low': (add_end(('bangsAcross', 'forelock')), 0.08),
    'side_back': (side_back, 0.12),
    'wid_side': (mul(SIDES + FALLS, ('width',)), 0.15),
    'flick': (mul(SIDES + FALLS + BACK + CORNERS, ('flick',)), 0.4),
    'ls_back': (lift_shape('back'), 0.008),
    'ls_side': (lift_shape('side'), 0.004),
    'ls_top': (lift_shape('top'), 0.004),
}


def build(values):
    P = json.load(open(BASE))
    for k, v in values.items():
        if v:
            KNOBS[k][0](P, v)
    return P


def score(values, tag):
    P = build(values)
    pj = os.path.join(TMP, 'p.json')
    json.dump(P, open(pj, 'w'))
    glb = os.path.join(TMP, 'h.glb')
    subprocess.run([PY, os.path.join(HERE, 'hair_v2.py'), GLB, glb, pj, os.path.join(TMP, 'b.blend')], capture_output=True)
    r = subprocess.run([PY, os.path.join(HERE, 'hair_match.py'), glb, TMP, 'fit'], capture_output=True, text=True)
    m = re.search(r'MEAN IoU ([\d.]+)', r.stdout)
    s = float(m.group(1)) if m else 0.0
    views = ' '.join(re.findall(r'VIEW (\w+) +IoU ([\d.]+)', r.stdout) and [f'{a}:{b}' for a, b in re.findall(r'VIEW (\w+) +IoU ([\d.]+)', r.stdout)])
    line = f'{tag:28s} {s:.4f}  {views}  ' + ' '.join(f'{k}={v:+.3f}' for k, v in values.items() if v)
    print(line, flush=True)
    LOG.write(line + '\n')
    LOG.flush()
    return s


vals = {k: 0.0 for k in KNOBS}
best = score(vals, 'start')
for rnd in range(ROUNDS):
    improved = False
    for k, (_, step) in KNOBS.items():
        st = step / (1 + rnd)  # finer each round
        for direction in (1, -1):
            moved = False
            while True:
                trial = dict(vals, **{k: vals[k] + direction * st})
                s = score(trial, f'r{rnd} {k} {"+" if direction > 0 else "-"}')
                if s > best + 0.002:
                    best, vals, moved, improved = s, trial, True, True
                else:
                    break
            if moved:
                break  # this direction helped: don't try the other
    print(f'ROUND {rnd} best {best:.4f}', flush=True)
    if not improved:
        break
P = build(vals)
json.dump(P, open(OUT, 'w'), indent=1)
print('BEST', round(best, 4), {k: round(v, 3) for k, v in vals.items() if v}, flush=True)
LOG.write(f'BEST {best:.4f} {vals}\n')
