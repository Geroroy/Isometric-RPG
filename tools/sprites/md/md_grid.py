"""
Variant comparison grids for the Movie Duels Anakin (docs/characters/MD_ANAKIN.md "진단 02"): rows of sheet frames in the
8 directions, each drawn the way the game draws a sheet frame (md_compare.Sheet: anchor, k, rendered shadow at alpha
0.75, the blade from the saberBase / saberTip markers), on a flat grey, cropped round the feet (96 × 112 game px).

  python3 tools/sprites/md/md_grid.py <out.png> <title> <label>=<sheet.json>:<anim>[:<frame>][|<note>] ...

Writes <out> at 1 game px = 1 px and <out>_4x.png (nearest ×4, with the labels).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from md_compare import DIRNAME, Sheet, font  # noqa: E402

CW, CH, FX, FY = 96, 112, 48, 88  # cell, the feet in it
out, title = Path(sys.argv[1]), sys.argv[2]
rows = []
cache = {}
for spec in sys.argv[3:]:
    label, rest = spec.split('=', 1)
    rest, note = (rest.split('|', 1) + [''])[:2]
    parts = rest.split(':')
    path, anim, f = parts[0], parts[1], int(parts[2]) if len(parts) > 2 else 0
    if path not in cache:
        cache[path] = Sheet(path)
    rows.append((label, note, cache[path], anim, f))
c = Image.new('RGBA', (CW * 8, CH * len(rows)), (58, 61, 66, 255))
dr = ImageDraw.Draw(c)
for r, (_, _, sh, anim, f) in enumerate(rows):
    for i in range(8):
        x0, y0 = i * CW, r * CH
        dr.rectangle([x0, y0, x0 + CW - 1, y0 + CH - 1], outline=(72, 76, 82, 255))
        cell = Image.new('RGBA', (CW, CH), (58, 61, 66, 255))
        sh.draw(cell, FX, FY, anim, f, i)
        c.alpha_composite(cell, (x0, y0))
c.save(out)
LW, TH = 330, 64
big = c.resize((c.width * 4, c.height * 4), Image.NEAREST)
lab = Image.new('RGBA', (big.width + LW, big.height + TH), (30, 32, 36, 255))
lab.alpha_composite(big, (LW, TH))
d = ImageDraw.Draw(lab)
d.text((14, 8), title, font=font(24), fill=(240, 242, 246, 255))
for i in range(8):
    d.text((LW + i * CW * 4 + 8, 38), '방향 ' + DIRNAME[i], font=font(19), fill=(200, 206, 214, 255))
for r, (label, note, *_) in enumerate(rows):
    y = TH + r * CH * 4 + 24
    d.multiline_text((14, y), label, font=font(24), fill=(235, 238, 242, 255), spacing=6)
    if note:
        d.multiline_text((14, y + 70), note.replace(';', '\n'), font=font(17), fill=(190, 198, 208, 255), spacing=5)
lab.save(str(out).replace('.png', '_4x.png'))
print('GRID', out)
