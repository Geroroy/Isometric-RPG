"""One review sheet for the Clone Wars season 1 outfit: the reference (reference/color_clonewars/image.jpg)
beside the model's full-body views, its head close-ups beside the reference's head, and the game-size
isometric views (x2, nearest), with the iteration's note.
  python3 s1_sheet.py <iter_dir> <label> "note" """
import os
import sys

from PIL import Image, ImageDraw

d, label, note = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ''
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
ref = Image.open(os.path.join(ROOT, 'reference', 'color_clonewars', 'image.jpg')).convert('RGB')
H = 560
body_ref = ref.crop((205, 0, 535, 405)).resize((int(330 * H / 405), H), Image.LANCZOS)
head_ref = ref.crop((322, 0, 412, 90)).resize((420, 420), Image.LANCZOS)
im = lambda n: Image.open(os.path.join(d, f'{label}_{n}.png')).convert('RGB')
bodies = [im(n) for n in ('body_front', 'body_q34', 'body_right', 'body_left', 'body_back')]
heads = [im(n) for n in ('front', 'q34', 'right', 'left', 'back')]
isos = [im(n).resize((256, 256), Image.NEAREST) for n in ('iso_front', 'iso_q34', 'iso_back')]
W = body_ref.width + sum(b.width for b in bodies) + 6 * 8
S = Image.new('RGB', (W, 30 + H + 8 + 420 + 8 + 256 + 8), (18, 19, 22))
dr = ImageDraw.Draw(S)
dr.text((8, 8), f'{label} — {note}', fill=(255, 220, 120))
x = 0
for i, b in enumerate([body_ref] + bodies):
    S.paste(b, (x, 30))
    x += b.width + 8
x = 0
for h in [head_ref] + heads:
    S.paste(h, (x, 30 + H + 8))
    x += h.width + 8
x = 0
for b in isos:
    S.paste(b, (x, 30 + H + 8 + 420 + 8))
    x += 264
dr.text((4, 34), 'REFERENCE', fill=(255, 120, 120))
dr.text((4, 30 + H + 12), 'REFERENCE', fill=(255, 120, 120))
dr.text((4, 30 + H + 8 + 420 + 12), 'game size (128 px, x2)', fill=(200, 200, 200))
out = os.path.join(d, f'{label}_sheet.png')
S.save(out)
print(out, S.size)
