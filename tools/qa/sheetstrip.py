# One animation of a sprite sheet as a strip: every frame, a few directions, on a dark ground.
#   python3 tools/qa/sheetstrip.py public/sprites/anakin_128.json sig out.png [dirs=2,6] [scale=2]
import json
import os
import sys

from PIL import Image, ImageDraw

path, anim, out = sys.argv[1:4]
dirs = [int(x) for x in (sys.argv[4] if len(sys.argv) > 4 else '2,6').split(',')]
scale = int(sys.argv[5]) if len(sys.argv) > 5 else 2
d = json.load(open(path))
base = os.path.dirname(path)
pages = [Image.open(os.path.join(base, p)).convert('RGBA') for p in d['pages']]
spages = [Image.open(os.path.join(base, p)).convert('RGBA') for p in d['shadowPages']]
frames = d['anims'][anim]['frames']
S = d['size']
W, H = S, S
img = Image.new('RGBA', (len(frames) * W, len(dirs) * H + 14), (38, 40, 48, 255))
dr = ImageDraw.Draw(img)
for i, fr in enumerate(frames):
    dr.text((i * W + 3, len(dirs) * H + 2), str(i), fill=(200, 200, 200, 255))
    for j, dd in enumerate(dirs):
        r = fr[dd]
        ax, ay = d['anchor'][0] / d['k'], d['anchor'][1] / d['k']
        s = r['s']
        sh = spages[s['p']].crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
        img.alpha_composite(sh, (int(i * W + ax - s['ox']), int(j * H + ay - s['oy'])))
        sp = pages[r['p']].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        img.alpha_composite(sp, (int(i * W + ax - r['ox']), int(j * H + ay - r['oy'])))
img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
img.save(out)
print(out, img.size)
