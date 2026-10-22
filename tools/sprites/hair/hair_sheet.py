"""Lay the review renders (hair_review.py) beside the references: the close-ups of the old and the
new hair under the Season 7 references, and the isometric views at the sprite's real size (1x and
4x, nearest-neighbour).  python3 hair_sheet.py renders_dir old_label new_label out.png iter_note"""
import os
import sys

from PIL import Image, ImageDraw

d, old, new, out = sys.argv[1:5]
note = sys.argv[5] if len(sys.argv) > 5 else ''
REF = 'reference/anakin_hair'
T = 300


def tile(path, crop=None):
    im = Image.open(path).convert('RGB')
    if crop:
        W, H = im.size
        im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    s = T / max(im.size)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    c = Image.new('RGB', (T, T), (40, 42, 48))
    c.paste(im, ((T - im.width) // 2, (T - im.height) // 2))
    return c


head = (0.12, 0.1, 0.88, 0.55)  # the head in the Sketchfab captures
refs = [tile(f'{REF}/sketchfab_s7_front.png', head), tile(f'{REF}/sketchfab_s7_side_right.png', head), tile(f'{REF}/sketchfab_s7_side_left.png', head),
        tile(f'{REF}/sketchfab_s7_back.png', head), tile(f'{REF}/tcw_s7_still_front.jpg')]
views = ['front', 'right', 'left', 'back', 'q34']
rows = [('REFERENCE (S7 3D model / S7 still)', refs), ('OLD hair', [tile(f'{d}/{old}_{v}.png') for v in views]), ('NEW hair', [tile(f'{d}/{new}_{v}.png') for v in views])]
iso = ['iso_front', 'iso_q34', 'iso_back']
W = 5 * T + 4 * 6
H = len(rows) * (T + 24) + 2 * (128 * 2 + 24) + 40
sheet = Image.new('RGB', (W, H), (24, 25, 30))
dr = ImageDraw.Draw(sheet)
dr.text((6, 4), note, fill=(255, 220, 120))
y = 22
for lab, tiles in rows:
    dr.text((6, y), lab + '   front | his right | his left | back | 3/4 (ref: still)', fill=(230, 230, 230))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * (T + 6), y + 16))
    y += T + 24
for lab, name in (('OLD', old), ('NEW', new)):
    dr.text((6, y), f'{lab} in-game isometric, sprite size (1x and 4x): front | 3/4 | back', fill=(230, 230, 230))
    x = 0
    for v in iso:
        im = Image.open(f'{d}/{name}_{v}.png').convert('RGB')
        sheet.paste(im, (x, y + 16))
        z = im.crop((32, 0, 96, 64)).resize((256, 256), Image.NEAREST)  # the head and shoulders, 4x
        sheet.paste(z, (x + 132, y + 16))
        x += 132 + 256 + 12
    y += 128 * 2 + 24
sheet.save(out)
print('sheet', out, sheet.size)
