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

only = sys.argv[1:]
names = [n for n in ASSETS if not only or n in only]
models = sorted({n[:-2] if n.endswith('_r') else n for n in names})
subprocess.run([PY, os.path.join(HERE, 'build_city_assets.py'), GLB, *models], check=True)
for n in names:
    win, ax, ay, neon = ASSETS[n]
    turned = n.endswith('_r')
    args = [PY, os.path.join(HERE, 'render_building.py'), os.path.join(GLB, (n[:-2] if turned else n) + '.glb'), OUT, '--name', n,
            '--window', str(win), '--anchor', f'{ax},{ay}', '--render', str(min(1200, int(win * 2.5))), '--samples', '24', '--light', '2.4']
    if turned:
        args += ['--rotate', '90']
    if neon:
        args += ['--neon', neon]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    print('rendered', n, flush=True)
