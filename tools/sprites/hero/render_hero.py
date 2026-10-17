"""
The duel characters end to end (docs/CHARACTERS.md):

  1. node export_clips.mjs           the swordsmanship's poses from the combat code (+ public/sprites/duel/hero_poses.json)
  2. build_hero.py NAME              the model: MakeHuman body + costume + hair, skinned
  3. pose_hero.py                    every clip as an action on that rig + the hilt and its markers; the upper / lower
                                     layer variants
  4. render_sprites.py (×3)          16 directions (PNG pages in tools/sprites/out/duel_sheets), packed for the browser
                                     by pack_web.py into public/sprites/duel:
                                       hero_NAME_256      attacks, reactions, dodge, fall (whole body)
                                       hero_NAME_up_256   upper layer: the stance and guard poses
                                       hero_NAME_low_256  lower layer: standing and walking legs

  .bvenv/bin/python tools/sprites/hero/render_hero.py [anakin,obiwan] [--skip-build] [--yes] [--preview]

Each render prints its ESTIMATE and stops above render_config's ask_minutes unless --yes (passed through).
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'sprites', 'out')
RAW = os.path.join(OUT, 'duel_sheets')  # render_sprites' PNG pages (the incremental renders read them back)
DEST = os.path.join(ROOT, 'public', 'sprites', 'duel')  # what the game loads (pack_web.py)
PY = sys.executable
SIZE, RENDER, WINDOW, ANCHOR = 256, 352, 128, '64,96'  # 2 sheet px per game px (ART_GUIDE.md §2: the remaster's 2x frames)

args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = {a for a in sys.argv[1:] if a.startswith('--')}
names = args[0].split(',') if args else ['anakin', 'obiwan']


def run(cmd):
    print('$', ' '.join(os.path.relpath(c, ROOT) if os.path.isabs(c) else c for c in cmd), flush=True)
    t = time.time()
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        sys.exit(f'failed ({r.returncode}): {cmd[1] if len(cmd) > 1 else cmd[0]}')
    print(f'  ({time.time() - t:.0f} s)', flush=True)


if '--skip-build' not in flags:
    run(['node', os.path.join(HERE, 'export_clips.mjs')])
clips = json.load(open(os.path.join(OUT, 'hero_clips.json')))
for nm in names:
    posed = os.path.join(OUT, f'hero_{nm}_posed.blend')
    if '--skip-build' not in flags:
        run([PY, os.path.join(HERE, 'build_hero.py'), nm])
        run([PY, os.path.join(HERE, 'pose_hero.py'), os.path.join(OUT, f'hero_{nm}.blend'), os.path.join(OUT, 'hero_clips.json'), nm, posed])
    C = clips['styles'][nm]['clips']
    groups = [
        (posed, f'hero_{nm}', [k for k, c in C.items() if not c.get('layer')]),
        (os.path.join(OUT, f'hero_{nm}_upper.blend'), f'hero_{nm}_up', [k for k, c in C.items() if c.get('layer') == 'upper']),
        (os.path.join(OUT, f'hero_{nm}_lower.blend'), f'hero_{nm}_low', [k for k, c in C.items() if c.get('layer') == 'lower']),
    ]
    for blend, sheet, anims in groups:
        cmd = [PY, os.path.join(ROOT, 'tools', 'sprites', 'render_sprites.py'), blend, RAW, '--name', sheet, '--dirs', '16', '--window', str(WINDOW),
               '--anchor', ANCHOR, '--sizes', str(SIZE), '--render', str(RENDER), '--meta', posed[:-len('.blend')] + '_meta.json', '--anims', ','.join(anims)]
        cmd += [f for f in ('--yes', '--preview', '--force') if f in flags]
        run(cmd)
    if '--preview' not in flags:
        run([PY, os.path.join(HERE, 'pack_web.py'), RAW, DEST] + [f'{g[1]}_{SIZE}' for g in groups])
print('DONE', ', '.join(names))
