"""Cut the Coruscant underworld sprites out of the two concept sheets (reference/unsorted/
coruscant_underworld_tileset_A/B.png) into game sprites: public/sprites/underworld/<name>_body.png
(the flat grey keyed to alpha, the cast shadow kept as translucent black), a JSON per sprite in the
city-sprite format (gfx/citySprites.js: anchor, footprint, layers, neon) with a scale k, an
index.json, and the ground tiles as square world-space textures (ground/<name>.png, ground.json).
   python3 tools/sprites/underworld/extract.py [--contact out.png]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

# sheet 'B' (six columns, CATEGORY 2 header) is the file ..._A.png; sheet 'A' (the panel layout) is ..._B.png
B = Image.open('reference/unsorted/coruscant_underworld_tileset_A.png').convert('RGB')
A = Image.open('reference/unsorted/coruscant_underworld_tileset_B.png').convert('RGB')
OUT = 'public/sprites/underworld'

# cells: (sheet, x0, y0, x1, y1), the label strip at the bottom and the number at the top-left are
# masked; k: draw scale (game px per sheet px); fp: footprint — ('box', a, b) half-sizes in tiles
# at the anchor (an iso box a along x, b along y), ('round', r), or ('flat', a, b) (no collision)
CELLS = {
  # --- buildings (sheet B is the larger render)
  'aptModuleA':   ('B', 23, 253, 261, 445, 1.0, ('box', 1.9, 1.9)),
  'aptStackB':    ('B', 261, 253, 496, 445, 1.0, ('box', 1.9, 1.9)),
  'aptBalconyC':  ('B', 496, 253, 738, 445, 1.0, ('box', 1.9, 1.9)),
  'ramenStand':   ('B', 738, 253, 920, 445, 0.9, ('box', 1.5, 1.2)),
  'pawnShop':     ('B', 920, 253, 1082, 445, 1.0, ('box', 1.5, 1.4)),
  'marketStall':  ('B', 1082, 253, 1245, 445, 1.0, ('box', 1.6, 1.6)),
  'aptModuleC':   ('A', 430, 445, 617, 637, 1.25, ('box', 1.9, 1.9)),
  'buildingBlock':('A', 276, 445, 428, 637, 1.35, ('box', 2.2, 1.9)),
  'tradeKiosk':   ('A', 617, 445, 738, 637, 1.1, ('box', 1.3, 1.1)),
  'pawnShopE':    ('A', 738, 445, 858, 637, 1.15, ('box', 1.4, 1.2)),
  'denseMarket':  ('A', 858, 445, 985, 637, 1.25, ('box', 1.6, 1.5)),
  # --- stalls and carts (sheet A)
  'skewerCart':   ('A', 188, 253, 326, 445, 0.9, ('box', 1.1, 0.8)),
  'dumplingStall':('A', 332, 253, 497, 445, 0.9, ('box', 1.3, 1.0)),
  'skewerCartB':  ('A', 497, 253, 617, 445, 0.9, ('box', 1.0, 0.8)),
  'blueMilkStand':('A', 617, 253, 762, 445, 0.9, ('box', 1.2, 1.0)),
  'groguWagon':   ('A', 768, 253, 978, 445, 0.9, ('box', 1.5, 1.1)),
  # --- props
  'verticalPipes':('B', 23, 445, 261, 637, 0.85, ('box', 0.9, 0.7)),
  'conduitBundle':('B', 261, 445, 496, 637, 0.8, ('flat', 1.6, 1.0)),
  'steamVent':    ('B', 496, 445, 738, 637, 0.75, ('box', 1.0, 0.8)),
  'crateStack':   ('B', 738, 445, 920, 637, 0.5, ('box', 0.9, 0.8)),
  'barrelPile':   ('B', 920, 445, 1082, 637, 0.5, ('box', 0.8, 0.7)),
  'scrapHeap':    ('B', 1082, 445, 1245, 637, 0.55, ('box', 0.9, 0.8)),
  'tradeTerminal':('B', 23, 637, 261, 830, 0.45, ('box', 0.9, 0.5)),
  'trashCompactor':('B', 261, 637, 496, 830, 0.5, ('box', 1.0, 0.8)),
  'lightPost':    ('B', 496, 637, 738, 830, 0.9, ('round', 0.3)),
  'abandonedSpeeder':('B', 738, 637, 980, 830, 0.75, ('box', 1.8, 0.7)),
  'neonSignSet':  ('B', 980, 637, 1245, 830, 0.8, ('box', 1.0, 0.4)),
  'lightPostHolo':('A', 23, 637, 140, 830, 1.0, ('round', 0.3)),
  'compactorUnit':('A', 140, 637, 262, 830, 0.6, ('box', 0.9, 0.7)),
  'ventStack':    ('A', 267, 637, 380, 830, 0.85, ('box', 0.7, 0.6)),
  'conduitArray': ('A', 386, 637, 497, 830, 0.8, ('box', 0.8, 0.7)),
  'crateBarrels': ('A', 497, 637, 617, 830, 0.55, ('box', 0.9, 0.7)),
  'speederBike':  ('A', 617, 637, 738, 830, 0.7, ('box', 1.3, 0.6)),
  'signPost':     ('A', 738, 637, 858, 830, 0.9, ('round', 0.3)),
  'barSign':      ('A', 858, 637, 979, 830, 0.8, ('box', 0.9, 0.4)),
}
GROUND = {  # (sheet, box): square world-space textures
  'metalPlatePlain': ('B', 62, 150, 134, 222), # the lettered plate's lower-left corner: no text
  'metalPlateAurebesh': ('B', 62, 80, 225, 222), 'metalPlateGrate': ('B', 300, 80, 462, 222), 'metalPlateVent': ('B', 535, 80, 697, 222),
  'swamp': ('B', 748, 84, 900, 222), 'mudConduit': ('B', 930, 84, 1073, 222), 'dirtTiles': ('B', 1094, 84, 1240, 222),
  # (the neon mosaic tiles 03/04 were dropped by the user)
}

def key(cell, bg):
  a = np.asarray(cell).astype(np.float32)
  lum = a.mean(axis=2)
  bgl = float(np.mean(bg))
  chroma = a.max(axis=2) - a.min(axis=2)
  d = np.abs(a - bg).max(axis=2)
  alpha = np.clip((d - 10) / 18, 0, 1)
  # the cast shadow: grey, darker than the background -> translucent black
  shadow = (chroma < 14) & (lum < bgl - 8) & (lum > bgl - 70)
  out = a.copy()
  sa = np.clip((bgl - lum) / 70, 0, 0.8)
  out[shadow] = 0
  alpha = np.where(shadow, sa, alpha)
  rgba = np.dstack([out, alpha * 255]).astype(np.uint8)
  return Image.fromarray(rgba, 'RGBA')

def trim(img):
  a = np.asarray(img)[:, :, 3]
  ys, xs = np.nonzero(a > 24)
  if len(xs) == 0: return img, (0, 0)
  x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
  return img.crop((x0, y0, x1, y1)), (x0, y0)

index = {}
contact = []
for name, (sh, x0, y0, x1, y1, k, fp) in CELLS.items():
  S = A if sh == 'A' else B
  cell = S.crop((x0 + 3, y0 + 3, x1 - 3, y1 - 3))
  arr = np.asarray(cell).astype(np.float32)
  # the sheet's flat grey: the cell's most common colour (quantised), never a sprite's
  q = (arr // 6).astype(np.int32)
  keys = q[:, :, 0] * 10000 + q[:, :, 1] * 100 + q[:, :, 2]
  vals, counts = np.unique(keys, return_counts=True)
  mode = vals[counts.argmax()]
  bg = arr[keys == mode].mean(axis=0)
  img = key(cell, bg)
  # mask the label strip and the cell number
  d = ImageDraw.Draw(img)
  lab = 40 if (sh == 'A' and y0 >= 445) else 26 # the panel sheet's lower rows carry two-line labels
  d.rectangle([0, img.height - lab, img.width, img.height], fill=(0, 0, 0, 0))
  d.rectangle([0, 0, 34, 18], fill=(0, 0, 0, 0))
  d.rectangle([img.width - 70, 0, img.width, 18], fill=(0, 0, 0, 0)) # the next cell's number, when the line runs through
  img, _ = trim(img)
  w, h = img.size
  body = f'{name}_body.png'
  img.save(f'{OUT}/{body}')
  blank = Image.new('RGBA', (w, h), (0, 0, 0, 0))
  blank.save(f'{OUT}/{name}_neon.png'); blank.save(f'{OUT}/{name}_reflect.png')
  # the anchor: the ground centre — the bottom of the sprite less the base diamond's half height
  kind = fp[0]
  if kind in ('box', 'flat'):
    a_, b_ = fp[1], fp[2]
    ax, ay = w / 2, h - (a_ + b_) * 14 / k
    poly = [[-a_, -b_], [a_, -b_], [a_, b_], [-a_, b_]]
  else:
    r = fp[1]
    ax, ay = w / 2, h - 6 / k
    poly = [[r * np.cos(t), r * np.sin(t)] for t in np.linspace(0, 2 * np.pi, 8, endpoint=False)]
    poly = [[round(x, 3), round(y, 3)] for x, y in poly]
  meta = {
    'name': name, 'size': w, 'window': float(w), 'k': k, 'anchor': [round(ax, 1), round(ay, 1)], 'sort': [round(ax, 1), round(h - 2, 1)],
    'footprint': poly, 'flat': kind == 'flat',
    'layers': {'body': body, 'neon': f'{name}_neon.png', 'reflect': f'{name}_reflect.png'},
    'neon': {'base': 1.0, 'hum': 0.05, 'speed': 9, 'flicker': {'rate': 0.12, 'dur': [0.04, 0.22], 'level': 0.12}},
    'source': f'sheet {sh} cell ({x0},{y0})-({x1},{y1})',
  }
  json.dump(meta, open(f'{OUT}/{name}.json', 'w'), indent=1)
  index[name] = f'{name}.json'
  contact.append((name, img, k))
json.dump(index, open(f'{OUT}/index.json', 'w'), indent=1)

gi = {}
for name, (sh, x0, y0, x1, y1) in GROUND.items():
  S = A if sh == 'A' else B
  S.crop((x0, y0, x1, y1)).resize((128, 128), Image.LANCZOS).save(f'{OUT}/ground/{name}.png')
  gi[name] = f'{name}.png'
json.dump(gi, open(f'{OUT}/ground/ground.json', 'w'), indent=1)

if '--contact' in sys.argv:
  out = sys.argv[sys.argv.index('--contact') + 1]
  cols = 7
  cw, ch = 230, 230
  sheet = Image.new('RGB', (cols * cw, ((len(contact) + cols - 1) // cols) * ch), (40, 44, 52))
  d = ImageDraw.Draw(sheet)
  for i, (name, img, k) in enumerate(contact):
    x, y = (i % cols) * cw, (i // cols) * ch
    im = img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS)
    sheet.paste(im, (x + (cw - im.width) // 2, y + ch - 24 - im.height), im)
    d.text((x + 4, y + ch - 20), f'{name} k{k} {im.width}x{im.height}', fill=(255, 255, 255))
  sheet.save(out)
print('sprites', len(index), 'ground', len(gi))
