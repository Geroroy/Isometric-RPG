"""Pack each Mustafar set sprite's body and neon layer into one image (the body over the neon, the same size), so
the artifact holds one file less per glowing piece (it allows at most 512). Run after the bakers:

    python3 tools/sprites/mustafar_console/bake.py && python3 tools/sprites/mustafar_corridor/bake.py \\
      && python3 tools/sprites/mustafar_set/bake.py && python3 tools/sprites/mustafar_set/pack.py

The JSON's layers become {"sheet": "<name>.png", "split": h} (gfx/mustafarFloor.js reads both forms).
"""
import json
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[3] / 'public/sprites/mustafar'

for j in sorted(OUT.glob('mf*.json')):
    meta = json.loads(j.read_text())
    L = meta.get('layers', {})
    if 'neon' not in L:
        continue
    body, neon = Image.open(OUT / L['body']), Image.open(OUT / L['neon'])
    assert body.size == neon.size, j.name
    sheet = Image.new('RGBA', (body.width, body.height * 2))
    sheet.paste(body, (0, 0))
    sheet.paste(neon, (0, body.height))
    name = j.stem + '.png'
    sheet.save(OUT / name, optimize=True)
    (OUT / L['body']).unlink()
    (OUT / L['neon']).unlink()
    meta['layers'] = {'sheet': name, 'split': body.height}
    j.write_text(json.dumps(meta))
    print(f'{name}: {body.width}x{body.height * 2}')
