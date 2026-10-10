"""
Anakin's sheets from his own Blender model (build_anakin.py, one .glb per
outfit), as listed in render_config.json's "sprites" (model, directions,
hair): every animation, written to public/sprites/NAME_128.*

  python render_anakin.py [name …] [--force] [--yes] [--preview]

Outfits whose sheets are up to date (same model, hair, timing, settings and
scripts) are skipped. Before rendering the rest it prints the number of
sprites and the expected time; above render_config's ask_minutes it stops
unless run with --yes. --preview: one direction, two frames of each
animation, to tools/sprites/out/preview.
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_cfg  # noqa: E402

ROOT, CFG = render_cfg.ROOT, render_cfg.CFG
PY = sys.executable
OUT = os.path.join(ROOT, 'public', 'sprites')
META = os.path.join(HERE, 'anakin_anims.json')
args = sys.argv[1:]
FORCE, YES, PREVIEW = '--force' in args, '--yes' in args, '--preview' in args
ADOPT = '--adopt' in args  # stamp existing sheets as current instead of rendering
ESTIMATE_ONLY = '--estimate' in args  # print what would render and how long, render nothing
SPRITES = {k: v for k, v in CFG['sprites'].items() if not k.startswith('_')}
names = [a for a in args if not a.startswith('--')] or list(SPRITES)
GPU = CFG['device']['prefer'] == 'gpu' or (CFG['device']['prefer'] == 'auto' and (os.path.exists('/dev/nvidia0') or os.path.exists('/dev/kfd')))
jobs = CFG['parallel']['jobs_gpu' if GPU else 'jobs_cpu']


def cmd(name, *extra):
    s = SPRITES[name]
    c = [PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(ROOT, s['glb']), OUT, '--name', name, '--dirs', str(s['dirs']), '--meta', META]
    if s.get('hair'):
        c += ['--hair', os.path.join(ROOT, s['hair'])]
    return c + list(extra) + (['--force'] if FORCE else []) + (['--preview'] if PREVIEW else [])


def changed(name):
    if FORCE or PREVIEW:
        return True
    return 'UNCHANGED' not in subprocess.run(cmd(name, '--check'), capture_output=True, text=True).stdout


if '--blades-only' in args:  # no render: rewrite the blade stretches of the existing sheets
    for n in names:
        r = subprocess.run(cmd(n, '--blades-only'), capture_output=True, text=True)
        print(next((ln for ln in r.stdout.splitlines() if ln.startswith('BLADES')), f'{n}: ' + r.stderr[-300:]), flush=True)
    sys.exit(0)
with ThreadPoolExecutor(4) as ex:
    todo = [n for n, c in zip(names, ex.map(changed, names)) if c]
skipped = [n for n in names if n not in todo]
if skipped:
    print('up to date, skipped:', ', '.join(skipped), flush=True)
if ADOPT:  # the existing sheets become the current inputs' result, nothing is rendered
    for n in todo:
        r = subprocess.run(cmd(n, '--adopt'), capture_output=True, text=True)
        print((r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1], flush=True)
    sys.exit(0)
frames = sum(len(a['frames']) for a in json.load(open(META))['anims'].values())
hist = json.load(open(os.path.join(HERE, 'out', 'render_times.json'))) if os.path.exists(os.path.join(HERE, 'out', 'render_times.json')) else {}
table = CFG['estimate']['default_seconds_per_frame']
total = 0
for n in todo:
    dirs = 1 if PREVIEW else SPRITES[n]['dirs']
    f = sum(min(2, len(a['frames'])) for a in json.load(open(META))['anims'].values()) if PREVIEW else frames
    h = hist.get(n, {})
    total += (h['seconds_per_frame'] if h.get('tiles') == dirs else table.get(str(dirs), 5.0)) * f
minutes = total / max(1, min(jobs, len(todo))) / 60
print(f'ESTIMATE {len(todo)} outfit(s), {len(todo) * frames * (1 if PREVIEW else 16)} sprites, about {minutes:.0f} min with {jobs} jobs', flush=True)
if ESTIMATE_ONLY:
    sys.exit(0)
if minutes > CFG['estimate']['ask_minutes'] and not YES:
    print(f'ASK: over {CFG["estimate"]["ask_minutes"]} min — confirm first, then run again with --yes', flush=True)
    sys.exit(3)
t0 = time.time()


def run(name):
    ts = time.time()
    r = subprocess.run(cmd(name, '--yes'), capture_output=True, text=True)
    line = next((ln for ln in r.stdout.splitlines() if ln.startswith(('TIMING setup', 'UNCHANGED'))), r.stderr[-400:])
    print(f'{name}: {time.time() - ts:.0f}s — {line}', flush=True)
    return r.returncode == 0


with ThreadPoolExecutor(jobs) as ex:
    ok = list(ex.map(run, todo))
print(f'TOTAL {time.time() - t0:.0f}s for {sum(ok)}/{len(ok)} outfits', flush=True)
