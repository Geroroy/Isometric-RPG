"""
Stack game shots into one labelled comparison (docs/characters/MD_ANAKIN.md "진단 02"): each row an image (a padshot.mjs
--dirs8 strip, or a whole view), nearest ×k, with its label on the left and an optional title / column heads.

  python3 tools/sprites/md/md_stack.py <out.png> <k> <title> [--dirs8] <label>=<image>[|<note>] ...
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from md_compare import DIRNAME, font  # noqa: E402

out, k, title = sys.argv[1], int(sys.argv[2]), sys.argv[3]
args = sys.argv[4:]
heads = '--dirs8' in args
rows = []
for a in args:
    if a == '--dirs8':
        continue
    label, rest = a.split('=', 1)
    path, note = (rest.split('|', 1) + [''])[:2]
    rows.append((label, note, Image.open(path).convert('RGBA')))
LW, TH = 300, 70 if heads else 44
w = max(im.width for *_, im in rows) * k
h = sum(im.height for *_, im in rows) * k
c = Image.new('RGBA', (w + LW, h + TH), (30, 32, 36, 255))
d = ImageDraw.Draw(c)
d.text((14, 10), title, font=font(22), fill=(240, 242, 246, 255))
if heads:
    for i in range(8):
        d.text((LW + i * 96 * k + 8, 42), '방향 ' + DIRNAME[i], font=font(18), fill=(200, 206, 214, 255))
y = TH
for label, note, im in rows:
    c.alpha_composite(im.resize((im.width * k, im.height * k), Image.NEAREST), (LW, y))
    d.multiline_text((14, y + 16), label, font=font(22), fill=(235, 238, 242, 255), spacing=5)
    if note:
        d.multiline_text((14, y + 16 + 34 * (label.count('\n') + 1)), note.replace(';', '\n'), font=font(16), fill=(190, 198, 208, 255), spacing=4)
    y += im.height * k
c.save(out)
print('STACK', out)
