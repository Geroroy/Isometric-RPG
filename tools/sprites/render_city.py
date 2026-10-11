"""
Build and render every Coruscant undercity asset (an `_r` name: the same
model turned 90°, so what faced game +y faces game +x) into the game's layered
building sprites (body / neon / reflect + JSON), one image pixel per game
pixel, into public/sprites/city.

  python render_city.py [name …]

Each asset's window (game px the image covers) and anchor (where its ground
centre sits) are set so the model fits with a small margin; small blinking
parts get faster flicker settings.
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GLB = os.path.join(HERE, 'out', 'city')
OUT = os.path.join(ROOT, 'public', 'sprites', 'city')
PY = sys.executable
sys.path.insert(0, HERE)
import render_cfg  # noqa: E402
B = render_cfg.CFG['building']  # render scale, samples, light (render_config.json)

# name: (window, anchor x, anchor y, neon settings)
ASSETS = {
    'cantina': (340, 180, 252, None),
    'tenement0': (500, 250, 438, None),
    'tenement1': (500, 250, 438, None),
    'tenement2': (500, 250, 438, None),
    'billboard': (160, 80, 140, None),
    'speeder0': (96, 50, 76, '{"rate": 0.05}'),
    'speeder1': (96, 50, 76, '{"rate": 0.05}'),
    'crates': (96, 48, 68, None),
    'barrels': (96, 52, 70, None),
    'ventGrate': (64, 32, 40, '{"rate": 0.02, "hum": 0.2, "speed": 2}'),
    'droidParts': (64, 32, 44, '{"rate": 0.6, "dur": [0.05, 0.4], "level": 0}'),
    'trashBin': (64, 32, 50, None),
    'junctionBox': (96, 44, 76, '{"rate": 2.5, "dur": [0.1, 0.5], "level": 0}'),
    # street food in the Star Wars manner (build_city_assets.py); `_r`: turned 90°
    'hoverBlueMilk': (160, 80, 120, None),
    'hoverBlueMilk_r': (160, 80, 120, None),
    'hoverGorg': (160, 80, 120, None),
    'hoverFruit': (160, 80, 120, None),
    'hoverFruit_r': (160, 80, 120, None),
    'roasterRonto': (192, 96, 140, '{"rate": 0.3, "dur": [0.1, 0.3], "level": 0.7, "hum": 0.12, "speed": 4}'),
    'roasterNuna': (192, 96, 140, '{"rate": 0.3, "dur": [0.1, 0.3], "level": 0.7, "hum": 0.12, "speed": 4}'),
    'roasterNuna_r': (192, 96, 140, '{"rate": 0.3, "dur": [0.1, 0.3], "level": 0.7, "hum": 0.12, "speed": 4}'),
    'podSpotchka': (160, 80, 124, None),
    'podJawaJuice': (160, 80, 124, None),
    'dinerNerf': (192, 96, 140, None),
    'dinerBantha': (192, 96, 140, None),
    'dinerBantha_r': (192, 96, 140, None),
    'cargoMeat': (192, 96, 136, None),
    'cargoBread': (192, 96, 136, None),
    'cargoBread_r': (192, 96, 136, None),
    'cargoMilk': (192, 96, 136, None),
    'tentStew': (176, 88, 136, '{"rate": 0.2, "level": 0.6, "hum": 0.1, "speed": 3}'),
    'tentGorg': (176, 88, 136, None),
    'skiffFruit': (192, 96, 132, None),
    'skiffAle': (192, 96, 132, None),
    'skiffAle_r': (192, 96, 132, None),
    'seatsA': (128, 64, 96, '{"rate": 0.1, "hum": 0.1, "speed": 2}'),
    'seatsB': (128, 64, 96, '{"rate": 0.1, "hum": 0.1, "speed": 2}'),
}

flags = [a for a in sys.argv[1:] if a in ('--force', '--adopt')]  # passed on; up-to-date assets are skipped
YES = '--yes' in sys.argv
only = [a for a in sys.argv[1:] if not a.startswith('--')]
names = [n for n in ASSETS if not only or n in only]
models = sorted({n[:-2] if n.endswith('_r') else n for n in names})
subprocess.run([PY, os.path.join(HERE, 'build_city_assets.py'), GLB, *models], check=True, stdout=subprocess.DEVNULL)


def args_of(n):
    win, ax, ay, neon = ASSETS[n]
    turned = n.endswith('_r')
    args = [PY, os.path.join(HERE, 'render_building.py'), os.path.join(GLB, (n[:-2] if turned else n) + '.glb'), OUT, '--name', n,
            '--window', str(win), '--anchor', f'{ax},{ay}', '--render', str(min(1200, int(win * B['render_scale'])))]  # samples, light: render_config.json
    if turned:
        args += ['--rotate', '90']
    if neon:
        args += ['--neon', neon]
    return args


if '--adopt' in flags:  # the existing sprites become the current inputs' result (those that exist)
    for n in names:
        if os.path.exists(os.path.join(OUT, f'{n}_{ASSETS[n][0]}.json')):
            print(subprocess.run(args_of(n) + ['--adopt'], capture_output=True, text=True).stdout.strip().splitlines()[-1], flush=True)
    sys.exit(0)
# only what changed; first the estimate (seconds per asset measured before, else 30 s)
todo = names if '--force' in flags else [n for n in names if 'UNCHANGED' not in subprocess.run(args_of(n) + ['--check'], capture_output=True, text=True).stdout]
TIMES = os.path.join(HERE, 'out', 'render_times.json')
hist = json.load(open(TIMES)) if os.path.exists(TIMES) else {}
minutes = sum(hist.get('city:' + n, {}).get('seconds', 30) for n in todo) / 60
print(f'ESTIMATE {len(todo)} of {len(names)} city assets, about {minutes:.0f} min', flush=True)
if minutes > render_cfg.CFG['estimate']['ask_minutes'] and not YES:
    print(f'ASK: over {render_cfg.CFG["estimate"]["ask_minutes"]} min — confirm first, then run again with --yes', flush=True)
    sys.exit(3)
for n in todo:
    t = time.time()
    subprocess.run(args_of(n) + flags, check=True, stdout=subprocess.DEVNULL)
    hist['city:' + n] = {'seconds': round(time.time() - t, 1)}
    json.dump(hist, open(TIMES, 'w'), indent=1, sort_keys=True)
    print('rendered', n, flush=True)
