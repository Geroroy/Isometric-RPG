"""
The duel characters' sheets for the browser: render_sprites.py writes PNG pages (colour, shadow, normal) into the raw
folder (tools/sprites/out/duel_sheets — kept for the incremental renders, which read the old pages back); this writes
what the game loads into public/sprites/duel:

  colour   WebP (quality 92, alpha 90) — the same rects
  shadow   half the resolution (a soft alpha mask: 1 sheet px = 1 game px), WebP; its rects halved and `k` on each
           shadow entry (gfx/sheet.js reads it)
  normal   left out (the arena does not relight; the raw folder keeps it)

  .bvenv/bin/python tools/sprites/hero/pack_web.py RAW_DIR OUT_DIR name [name ...]
"""
import json
import os
import sys

from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for name in sys.argv[3:]:
    j = json.load(open(os.path.join(RAW, name + '.json')))
    k = j['k']
    pages = []
    for p in j['pages']:
        im = Image.open(os.path.join(RAW, p)).convert('RGBA')
        q = p[:-4] + '.webp'
        im.save(os.path.join(OUT, q), 'WEBP', quality=92, alpha_quality=90, method=6)
        pages.append(q)
    spages = []
    for p in j['shadowPages']:
        im = Image.open(os.path.join(RAW, p)).convert('RGBA')
        a = im.split()[3].resize(((im.width + 1) // 2, (im.height + 1) // 2), Image.LANCZOS)
        out = Image.new('RGBA', a.size, (0, 0, 0, 0))
        out.putalpha(a)
        q = p[:-4] + '.webp'
        out.save(os.path.join(OUT, q), 'WEBP', quality=85, alpha_quality=85, method=6)
        spages.append(q)
    for a in j['anims'].values():
        for row in a['frames']:
            for f in row:
                if not f:
                    continue
                s = f['s']
                x0, y0 = s['x'] // 2, s['y'] // 2
                s.update(x=x0, y=y0, w=(s['x'] + s['w'] + 1) // 2 - x0, h=(s['y'] + s['h'] + 1) // 2 - y0, ox=round(s['ox'] / 2, 2), oy=round(s['oy'] / 2, 2), k=k * 2)
    j['pages'], j['shadowPages'] = pages, spages
    j.pop('normalPages', None)
    j['passes'] = [x for x in j.get('passes', []) if x != 'normal']
    json.dump(j, open(os.path.join(OUT, name + '.json'), 'w'), separators=(',', ':'))
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in pages + spages + [name + '.json'])
    print(f'PACKED {name}: {len(pages)} + {len(spages)} pages, {size / 1e6:.1f} MB')
