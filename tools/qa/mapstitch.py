"""Stitch tools/qa/mapshot.mjs's tiles into one picture by their camera offsets (game px x the shot's scale).

    python3 tools/qa/mapstitch.py <tiles.json> <out.png> [max_w]
"""
import json
import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1])
out = Path(sys.argv[2])
max_w = int(sys.argv[3]) if len(sys.argv) > 3 else 0
d = json.loads(src.read_text())
s = d['scale']
tiles = d['tiles']
x0 = min(t['cam']['x'] for t in tiles)
y0 = min(t['cam']['y'] for t in tiles)
x1 = max(t['cam']['x'] + t['w'] for t in tiles)
y1 = max(t['cam']['y'] + t['h'] for t in tiles)
W, H = int((x1 - x0) * s) + 2, int((y1 - y0) * s) + 2
im = Image.new('RGB', (W, H), (0, 0, 0))
for t in tiles:
    tile = Image.open(t['file']).convert('RGB')
    im.paste(tile, (int((t['cam']['x'] - x0) * s), int((t['cam']['y'] - y0) * s)))
if max_w and W > max_w:
    im = im.resize((max_w, int(H * max_w / W)), Image.LANCZOS)
im.save(out)
print(out, im.size, 'origin(game px)', x0, y0, 'scale', s)
