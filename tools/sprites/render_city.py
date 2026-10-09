"""
Build and render every Coruscant undercity asset into the game's layered
building sprites (body / neon / reflect + JSON), one image pixel per game
pixel, into public/sprites/city.

  python render_city.py [name …]

Each asset's window (game px the image covers) and anchor (where its ground
centre sits) are set so the model fits with a small margin; small blinking
parts get faster flicker settings.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GLB = os.path.join(HERE, 'out', 'city')
OUT = os.path.join(ROOT, 'public', 'sprites', 'city')
PY = sys.executable

# name: (window, anchor x, anchor y, neon settings)
ASSETS = {
    'cantina': (340, 180, 252, None),
    'tenement0': (500, 250, 438, None),
    'tenement1': (500, 250, 438, None),
    'tenement2': (500, 250, 438, None),
    'stall0': (128, 70, 100, None),
    'stall1': (128, 70, 100, None),
    'stall2': (128, 70, 100, None),
    'billboard': (160, 80, 140, None),
    'speeder0': (96, 50, 76, '{"rate": 0.05}'),
    'speeder1': (96, 50, 76, '{"rate": 0.05}'),
    'crates': (96, 48, 68, None),
    'barrels': (96, 52, 70, None),
    'ventGrate': (64, 32, 40, '{"rate": 0.02, "hum": 0.2, "speed": 2}'),
    'droidParts': (64, 32, 44, '{"rate": 0.6, "dur": [0.05, 0.4], "level": 0}'),
    'trashBin': (64, 32, 50, None),
    'junctionBox': (96, 44, 76, '{"rate": 2.5, "dur": [0.1, 0.5], "level": 0}'),
}

only = sys.argv[1:]
names = [n for n in ASSETS if not only or n in only]
subprocess.run([PY, os.path.join(HERE, 'build_city_assets.py'), GLB, *names], check=True)
for n in names:
    win, ax, ay, neon = ASSETS[n]
    args = [PY, os.path.join(HERE, 'render_building.py'), os.path.join(GLB, n + '.glb'), OUT,
            '--window', str(win), '--anchor', f'{ax},{ay}', '--render', str(min(1200, win * 3)), '--samples', '32', '--light', '2.4']
    if neon:
        args += ['--neon', neon]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    print('rendered', n, flush=True)
