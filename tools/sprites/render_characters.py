"""
Every character of the game through the Blender pipeline, without a window:
export_characters.mjs turns each spec of src/gfx/specs.js into a .glb with
its animations, render_sprites.py renders it (every direction of a frame in
one image, two renders per frame), and the sheets land in public/sprites/chars
with an index.json the game reads — a character listed there is drawn from
its sheet instead of being baked in the browser at load time.

  python render_characters.py [name …] [--jobs 2] [--engine cycles]

Two renders run side by side by default (a render's fixed costs are partly
single-threaded, so two keep the CPU busier). The frame window and the feet
come from the spec's frame [width, height, feet x, feet y]; a tile renders at
twice the window (1.75× for the 16-direction duellists; windows capped at 136 px — the game draws the blades), downscaled to
one pixel per game pixel and sharpened. Prints the time per character and
the total.
"""
import json
import os
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

args = sys.argv[1:]
jobs = 2
FORCE = False
engine = 'cycles'
names = []
i = 0
while i < len(args):
    if args[i] == '--jobs':
        jobs = int(args[i + 1])
        i += 2
    elif args[i] == '--force':
        FORCE = True
        i += 1
    elif args[i] == '--engine':
        engine = args[i + 1]
        i += 2
    else:
        names.append(args[i])
        i += 1

CAP = 136  # largest window for a character whose blade the game draws
UNCAPPED = {'fighter'}  # vehicles fill their frame
IDX = os.path.join(OUT, 'index.json')  # the index the game reads: every sheet rendered so far
LOCK = threading.Lock()
t0 = time.time()
os.makedirs(OUT, exist_ok=True)
subprocess.run(['node', os.path.join(HERE, 'export_characters.mjs'), GLB, *names], check=True, cwd=ROOT,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
metas = {n[:-5]: json.load(open(os.path.join(GLB, n))) for n in os.listdir(GLB) if n.endswith('.json') and not n.endswith('.meta.json') and (not names or n[:-5] in names)}
print(f'exported {len(metas)} characters in {time.time() - t0:.0f}s', flush=True)


def render(name):
    m = metas[name]
    fw, fh, ax, ay = m['frame']
    win = max(fw, fh)
    AX = ax + (win - fw) / 2
    AY = ay + (win - fh)
    # the baker's frames leave room for the saber blade, which the game draws
    # itself: the body fits a smaller window (rendering empty pixels costs);
    # the feet keep their distance from the bottom edge
    if win > CAP and fh < 200 and name not in UNCAPPED:
        AY = CAP - (win - AY)
        AX = CAP / 2
        win = CAP
    scale = 1.75 if m['dirs'] > 8 else 2.0
    res = int(round(win * scale / 4)) * 4
    timing = os.path.join(GLB, name + '.meta.json')
    json.dump({'anims': m['anims']}, open(timing, 'w'))
    ts = time.time()
    r = subprocess.run([PY, os.path.join(HERE, 'render_sprites.py'), os.path.join(GLB, name + '.glb'), OUT,
                        '--engine', engine, '--dirs', str(m['dirs']), '--window', str(win), '--anchor', f'{AX},{AY}',
                        '--render', str(res), '--shadow-render', str(win), '--sizes', str(win), '--samples', '8',
                        '--meta', timing], capture_output=True, text=True)
    line = next((ln for ln in r.stdout.splitlines() if ln.startswith('TIMING setup')), r.stderr[-400:])
    print(f'{name}: {time.time() - ts:.0f}s — {line}', flush=True)
    if r.returncode == 0:
        with LOCK:
            index = json.load(open(IDX)) if os.path.exists(IDX) else {}
            index[name] = f'{name}_{win}.json'
            json.dump(dict(sorted(index.items())), open(IDX, 'w'), indent=1)
    return name, win, r.returncode == 0


# 8-direction characters first (the city and the field), then the duellists;
# what the index already lists is skipped unless named (or --force)
done = json.load(open(IDX)) if os.path.exists(IDX) else {}
order = sorted((n for n in metas if FORCE or names or n not in done), key=lambda n: (metas[n]['dirs'], sum(a['frames'] for a in metas[n]['anims'].values())))
with ThreadPoolExecutor(jobs) as ex:
    results = list(ex.map(render, order))
print(f'TOTAL {time.time() - t0:.0f}s for {sum(ok for *_, ok in results)}/{len(results)} characters', flush=True)
