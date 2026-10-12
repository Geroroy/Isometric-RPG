"""
Every character of the game through the Blender pipeline, without a window:
export_characters.mjs turns each spec of src/gfx/specs.js into a .glb with
its animations, render_sprites.py renders it (every direction of a frame in
one image, two renders per frame), and the sheets land in public/sprites/chars
with an index.json the game reads — a character listed there is drawn from
its sheet instead of being baked in the browser at load time.

  python render_characters.py [name …] [--force] [--yes] [--preview]

Settings come from render_config.json (engine, samples, render scale,
passes, parallel jobs). Characters whose sheets are up to date (the hash of
their model, timing, settings and the render script, stored in the sheet)
are skipped; before rendering the rest it prints how many sprites that is
and how long it should take, and above render_config's ask_minutes it stops
unless run with --yes. --preview renders one direction, two frames each, to
tools/sprites/out/preview. The frame window and the feet come from the
spec's frame [width, height, feet x, feet y] (windows capped at 136 px — the
game draws the blades); a tile renders at render_scale × the window,
downscaled to one pixel per game pixel and sharpened.
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GLB = os.path.join(HERE, 'out', 'chars')
OUT = os.path.join(ROOT, 'public', 'sprites', 'chars')
PY = sys.executable

CFG = json.load(open(os.path.join(ROOT, 'render_config.json')))
args = sys.argv[1:]
FORCE = '--force' in args
ADOPT = '--adopt' in args  # stamp existing sheets as current instead of rendering
YES = '--yes' in args
PREVIEW = '--preview' in args
ESTIMATE_ONLY = '--estimate' in args  # print what would render and how long, render nothing
# --passes color,shadow: the passes of sheets made before the normal pass, so an animation merged into
# them matches the rest (passed on to render_sprites.py)
PASS_OPT = ['--passes', args[args.index('--passes') + 1]] if '--passes' in args else []
if PASS_OPT:
    args = [a for i, a in enumerate(args) if a != '--passes' and (i == 0 or args[i - 1] != '--passes')]
if '--only-anims' in args:  # render just these animations into the existing sheets (render_sprites.py --only-anims)
    PASS_OPT += ['--only-anims', args[args.index('--only-anims') + 1]]
    args = [a for i, a in enumerate(args) if a != '--only-anims' and (i == 0 or args[i - 1] != '--only-anims')]
VERIFY = '--verify' in args  # compare the sheets with a render of each animation's middle frame (render_sprites.py --verify)
names = [a for a in args if not a.startswith('--')]
HAS_GPU = CFG['device']['prefer'] == 'gpu' or (CFG['device']['prefer'] == 'auto' and (os.path.exists('/dev/nvidia0') or os.path.exists('/dev/kfd')))
jobs = CFG['parallel']['jobs_gpu' if HAS_GPU else 'jobs_cpu']

CAP = 136  # largest window for a character whose blade the game draws
UNCAPPED = {'fighter'}  # vehicles fill their frame
IDX = os.path.join(OUT, 'index.json')  # the index the game reads: every sheet rendered so far
LOCK = threading.Lock()
t0 = time.time()
os.makedirs(OUT, exist_ok=True)
subprocess.run(['node', os.path.join(HERE, 'export_characters.mjs'), GLB, *names], check=True, cwd=ROOT,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BLENDER = {k for k in CFG['sprites'] if not k.startswith('_')}  # modelled in Blender: render_anakin.py
metas = {n[:-5]: json.load(open(os.path.join(GLB, n))) for n in os.listdir(GLB)
         if n.endswith('.json') and not n.endswith('.meta.json') and n[:-5] not in BLENDER and (not names or n[:-5] in names)}
print(f'exported {len(metas)} characters in {time.time() - t0:.0f}s', flush=True)


def window(name):
    m = metas[name]
    fw, fh, ax, ay = m['frame']
    win = max(fw, fh)
    AX = ax + (win - fw) / 2
    AY = ay + (win - fh)
    if win > CAP and fh < 200 and name not in UNCAPPED:
        AY = CAP - (win - AY)
        AX = CAP / 2
        win = CAP
    return win, AX, AY


def args_of(name):
    """render_sprites.py's options for a character: its directions, frame window and feet."""
    m = metas[name]
    win, AX, AY = window(name)
    return ['--dirs', str(m['dirs']), '--window', str(win), '--anchor', f'{AX},{AY}', '--sizes', str(win), '--meta', os.path.join(GLB, name + '.meta.json'), *PASS_OPT]


def render(name):
    win = window(name)[0]
    ts = time.time()
    r = subprocess.run([PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(GLB, name + '.glb'), OUT, *args_of(name), '--yes',
                        *(['--force'] if FORCE else []), *(['--preview'] if PREVIEW else [])], capture_output=True, text=True)
    line = next((ln for ln in r.stdout.splitlines() if ln.startswith(('TIMING setup', 'UNCHANGED'))), r.stderr[-400:])
    print(f'{name}: {time.time() - ts:.0f}s — {line}', flush=True)
    if r.returncode == 0 and not PREVIEW:
        with LOCK:
            index = json.load(open(IDX)) if os.path.exists(IDX) else {}
            index[name] = f'{name}_{win}.json'
            json.dump(dict(sorted(index.items())), open(IDX, 'w'), indent=1)
    return name, win, r.returncode == 0


for n, m in metas.items():  # each character's timing, for render_sprites.py
    json.dump({'anims': m['anims']}, open(os.path.join(GLB, n + '.meta.json'), 'w'))

if '--blades-only' in args:  # no render: rewrite the blade stretches of the sheets that have a saber
    for n in metas:
        p = os.path.join(OUT, f'{n}_{window(n)[0]}.json')
        if not os.path.exists(p) or not metas[n].get('markers'):
            continue
        r = subprocess.run([PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(GLB, n + '.glb'), OUT, *args_of(n), '--blades-only'],
                           capture_output=True, text=True)
        print(next((ln for ln in r.stdout.splitlines() if ln.startswith('BLADES')), f'{n}: ' + r.stderr[-300:]), flush=True)
    sys.exit(0)


if VERIFY:
    def verify(n):
        r = subprocess.run([PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(GLB, n + '.glb'), OUT, *args_of(n), '--verify'], capture_output=True, text=True)
        return '\n'.join(ln for ln in r.stdout.splitlines() if ln.startswith('VERIF')) or f'{n}: ' + r.stderr[-600:]
    with ThreadPoolExecutor(jobs) as ex:
        for out in ex.map(verify, list(metas)):
            print(out, flush=True)
    sys.exit(0)


def changed(name):
    """Frames a render of this character would do (0: up to date) — only the changed
    animations when its model is the same (render_sprites.py keeps the rest of the sheet)."""
    allf = sum(a['frames'] for a in metas[name]['anims'].values())
    if FORCE or PREVIEW:
        return allf
    r = subprocess.run([PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(GLB, name + '.glb'), OUT, *args_of(name), '--check'],
                       capture_output=True, text=True)
    if 'UNCHANGED' in r.stdout:
        return 0
    m = re.search(r'frames=(\d+) anims=(\S+)', r.stdout)
    if os.environ.get('HASH_DEBUG'):
        print(r.stdout.strip())
    if m:
        print(f'{name}: {"every animation" if m[2] == "all" else "only " + m[2]} ({m[1]} frames)', flush=True)
    return int(m[1]) if m else allf


# only what changed since its sheet was rendered (8-direction characters first)
with ThreadPoolExecutor(4) as ex:
    need = dict(zip(metas, ex.map(changed, metas)))
todo = [n for n in metas if need[n]]
todo.sort(key=lambda n: (metas[n]['dirs'], sum(a['frames'] for a in metas[n]['anims'].values())))
skipped = sorted(set(metas) - set(todo))
if todo:
    print(f'changed: {", ".join(todo)}', flush=True)
if skipped:
    print(f'up to date, skipped: {", ".join(skipped)}', flush=True)

if ADOPT:  # the existing sheets become the current inputs' result, nothing is rendered
    for n in todo:
        r = subprocess.run([PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(GLB, n + '.glb'), OUT, *args_of(n), '--adopt'], capture_output=True, text=True)
        print((r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1], flush=True)
    sys.exit(0)
# the estimate: frames x directions, seconds per frame measured before (or the defaults)
TIMES = os.path.join(HERE, 'out', 'render_times.json')
hist = json.load(open(TIMES)) if os.path.exists(TIMES) else {}
table = CFG['estimate']['default_seconds_per_frame']
total_s = sprites = 0
for n in todo:
    frames = need[n]
    dirs = metas[n]['dirs']
    if PREVIEW:
        frames, dirs = sum(min(2, a['frames']) for a in metas[n]['anims'].values()), 1
    h = hist.get(n, {})
    per = h['seconds_per_frame'] if h.get('tiles') == dirs else table.get(str(dirs), table['16'] * dirs / 16)
    total_s += per * frames
    sprites += frames * dirs
minutes = total_s / max(1, min(jobs, len(todo))) / 60
print(f'ESTIMATE {len(todo)} characters, {sprites} sprites, about {minutes:.0f} min with {jobs} jobs', flush=True)
if ESTIMATE_ONLY:
    sys.exit(0)
if minutes > CFG['estimate']['ask_minutes'] and not YES:
    print(f'ASK: over {CFG["estimate"]["ask_minutes"]} min — confirm first, then run again with --yes', flush=True)
    sys.exit(3)
with ThreadPoolExecutor(jobs) as ex:
    results = list(ex.map(render, todo))
print(f'TOTAL {time.time() - t0:.0f}s for {sum(ok for *_, ok in results)}/{len(results)} characters', flush=True)
