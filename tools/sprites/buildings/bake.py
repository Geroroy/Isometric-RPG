"""Bake the night-graded background buildings (assets/backgrounds/buildings/night/) into the atlases
the city backdrop draws (gfx/cityBackdrop.js), one per mode, every building at its depth layer's
size with that layer's air already in it — nothing is scaled or tinted at run time:

  public/sprites/backdrop/buildings_<mode>.png   (mode: up = the plaza's dusk, low = the undercity)
  public/sprites/backdrop/buildings.json         per mode, per layer: the buildings' rects in the
                                                 atlas, base point (the footprint's centre), width

Layers (far → near), by kind: far = landmarks, a sparse skyline; mid = city high-rises, dense blocks;
near = industrial plant, small, just under the platforms. Per layer: SCALE (sheet px → game px),
DARK (× colour), HAZE (mix toward the mode's air colour) — farther is smaller, darker, hazier. Every
sprite also sinks into the air at its foot (the lower FOOT of its height fades to the air colour and
then out), so a building rises from the depth instead of standing on nothing.
The sheets' footprint edges run at ~24.8° (tools/sprites/buildings/extract.py); the game's tiles at
26.57°: the sprites are stretched ×YFIX vertically to sit on the game's grid.
   python3 tools/sprites/buildings/bake.py
"""
import json
import os

import numpy as np
from PIL import Image

SRC = 'assets/backgrounds/buildings/night'
IDX = 'assets/backgrounds/buildings/cut/index.json'
OUT = 'public/sprites/backdrop'
YFIX = 1.08
AIR = {'up': (70, 54, 74), 'low': (20, 28, 34)}
# the undercity's air is near black: there the layers keep more of their own light (haze × LOW_HAZE,
# colour × LOW_GAIN) so the city shows as lit silhouettes instead of sinking out of sight
LOW_HAZE = 0.6
LOW_GAIN = 1.3
LAYERS = [
    {'name': 'far', 'kinds': ['landmark'], 'scale': 0.15, 'dark': 0.78, 'haze': 0.6},
    {'name': 'mid', 'kinds': ['city'], 'scale': 0.21, 'dark': 0.9, 'haze': 0.38},
    {'name': 'near', 'kinds': ['industrial'], 'scale': 0.27, 'dark': 1.0, 'haze': 0.18},
]
FOOT = 0.38


def resize(img, w, h):
    """Premultiplied Lanczos resize of a float RGBA array."""
    a = img[..., 3:4] / 255
    pm = np.concatenate([img[..., :3] * a, img[..., 3:4]], 2)
    chans = [np.asarray(Image.fromarray(pm[..., i].astype(np.float32), 'F').resize((w, h), Image.LANCZOS)) for i in range(4)]
    q = np.dstack(chans)
    aa = np.clip(q[..., 3:4], 0, 255)
    rgb = np.where(aa > 1, q[..., :3] / np.maximum(aa / 255, 1e-3), 0)
    out = np.concatenate([rgb, aa], 2)
    out[aa[..., 0] < 10] = 0
    return out.clip(0, 255)


def layer_sprite(img, L, air, mode):
    h0, w0 = img.shape[:2]
    w, h = max(1, round(w0 * L['scale'])), max(1, round(h0 * L['scale'] * YFIX))
    s = resize(img.astype(float), w, h)
    low = mode == 'low'
    rgb = s[..., :3] * L['dark'] * (LOW_GAIN if low else 1)
    air = np.array(air, float)
    rgb = rgb + (air - rgb) * L['haze'] * (LOW_HAZE if low else 1)
    # the foot sinks into the air: colour to the air, then out
    y = (np.arange(h) / max(1, h - 1))[:, None]
    f = np.clip((y - (1 - FOOT)) / FOOT, 0, 1)
    rgb = rgb + (air - rgb) * (f ** 1.2)[..., None] * 0.85
    a = s[..., 3] * (1 - 0.9 * f ** 1.6)
    out = np.dstack([rgb, a]).clip(0, 255).astype(np.uint8)
    out[a < 6] = 0
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    index = json.load(open(IDX))
    meta = {'yfix': YFIX, 'modes': {}}
    for mode, air in AIR.items():
        sprites = []
        for L in LAYERS:
            for bid, v in sorted(index.items()):
                if v['kind'] not in L['kinds']:
                    continue
                img = np.asarray(Image.open(f'{SRC}/{bid}.png').convert('RGBA'))
                sp = layer_sprite(img, L, air, mode)
                k = L['scale']
                sprites.append({'layer': L['name'], 'id': bid, 'size': v['size'], 'img': sp,
                                'base': [round(v['base'][0] * k), round(v['base'][1] * k * YFIX)],
                                'footW': round(v['footW'] * k)})
        # shelf packing, tallest first, 1024 wide
        AW = 1024
        order = sorted(range(len(sprites)), key=lambda i: -sprites[i]['img'].shape[0])
        x = y = rowh = 0
        for i in order:
            h, w = sprites[i]['img'].shape[:2]
            if x + w + 1 > AW:
                x, y, rowh = 0, y + rowh + 1, 0
            sprites[i]['xy'] = (x, y)
            x += w + 1
            rowh = max(rowh, h)
        AH = y + rowh
        atlas = np.zeros((AH, AW, 4), np.uint8)
        layers = {L['name']: [] for L in LAYERS}
        for s in sprites:
            h, w = s['img'].shape[:2]
            ax, ay = s['xy']
            atlas[ay:ay + h, ax:ax + w] = s['img']
            layers[s['layer']].append({'id': s['id'], 'size': s['size'], 'rect': [ax, ay, w, h], 'base': s['base'], 'footW': s['footW']})
        Image.fromarray(atlas, 'RGBA').save(f'{OUT}/buildings_{mode}.png', optimize=True)
        meta['modes'][mode] = {'atlas': f'buildings_{mode}.png', 'air': list(air), 'layers': layers}
        print(f'{mode}: {len(sprites)} sprites, atlas {AW}x{AH}, {os.path.getsize(f"{OUT}/buildings_{mode}.png") // 1024} KB')
    json.dump(meta, open(f'{OUT}/buildings.json', 'w'), indent=1)


main()
