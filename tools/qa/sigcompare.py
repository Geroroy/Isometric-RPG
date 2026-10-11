"""
Side-by-side contact sheet: the reference film frames (top) over the game's
signature frames at the same moment (bottom), for one or more facing
directions out of a tools/qa/spritedump.mjs sheet.

  python3 tools/qa/sigcompare.py <dump.png> <dump_dirs e.g. 2,6,10,14> <show_dir> <out.png> [label]

Reference: tools/qa/out/ref/kt30/a_###.png — the pillar duel at 30 fps from
16.50 s (ffmpeg -ss 16.5 -t 2.0 -vf fps=30); the move runs from frame 20
(17.17 s, the guard) to 47 (18.07 s, still kneeling).
"""
import glob
import sys

from PIL import Image, ImageDraw

dump_path, dump_dirs, show, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
label = sys.argv[5] if len(sys.argv) > 5 else ''
dirs = [int(d) for d in dump_dirs.split(',')]
shows = [int(d) for d in show.split(',')]
dump = Image.open(dump_path).convert('RGB')
scale = round(dump.height / (len(dirs) * 110 + 16))
ref = sorted(glob.glob('tools/qa/out/ref/kt30/a_*.png'))
SIG_LEN, FRAMES = 1.2, 30
CELL = 150
frames = [f for f in range(FRAMES) if f * SIG_LEN / (FRAMES - 1) <= 0.95]
H = 18 + 110 + len(shows) * CELL
S = Image.new('RGB', (len(frames) * CELL, H), (20, 22, 26))
d = ImageDraw.Draw(S)
d.text((4, 3), f'TOP: reference (TCW pillar duel, 30 fps)   BELOW: game, dirs {show}   {label}', fill=(255, 220, 120))
for i, f in enumerate(frames):
    t = f * SIG_LEN / (FRAMES - 1)
    rf = 20 + round(t * 30)
    im = Image.open(ref[min(rf, len(ref) - 1)])
    # the reference duellists: left 2/3 of the frame, top cropped
    w, h = im.size
    crop = im.crop((int(w * 0.03), int(h * 0.08), int(w * 0.03) + int(h * 0.9 * CELL / 110), int(h * 0.98)))
    crop = crop.resize((CELL, 110))
    x = i * CELL
    S.paste(crop, (x, 18))
    d.text((x + 3, 20), f'ref #{rf} {t:.2f}s', fill=(255, 230, 140))
    for k, sd in enumerate(shows):
        row = dirs.index(sd)
        x0 = (40 + f * 120) * scale
        y0 = (16 + row * 110) * scale
        cell = dump.crop((x0, y0, x0 + 120 * scale, y0 + 110 * scale)).resize((CELL, int(CELL * 110 / 120)), Image.NEAREST)
        S.paste(cell, (x, 18 + 110 + k * CELL))
        d.text((x + 3, 18 + 110 + k * CELL + 12), f'game #{f} d{sd}', fill=(200, 210, 230))
S.save(out)
print(out, S.size)
