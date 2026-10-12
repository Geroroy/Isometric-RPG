"""Compose a review image from a render_sprites.py output: one animation frame,
every rendered direction side by side on a grey ground, scaled up.
  python preview.py out_dir name size anim frame out.png [height]"""
import json
import sys

from PIL import Image

out_dir, name, size, anim, frame, dst = sys.argv[1:7]
H = int(sys.argv[7]) if len(sys.argv) > 7 else 640
d = json.load(open(f'{out_dir}/{name}_{size}.json'))
pages = [Image.open(f'{out_dir}/{p}') for p in d['pages']]
row = [r for r in d['anims'][anim]['frames'][int(frame)] if r]
W = int(H * 0.56)
img = Image.new('RGBA', (W * len(row), H), (58, 62, 72, 255))
for i, r in enumerate(row):
    im = pages[r['p']].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    s = (H - 20) / max(r['h'], 1)
    im = im.resize((max(1, int(r['w'] * s)), int(r['h'] * s)), Image.LANCZOS)
    img.alpha_composite(im, (i * W + (W - im.size[0]) // 2, H - 10 - im.size[1]))
img.save(dst)
