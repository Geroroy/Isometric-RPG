"""Draws pose_preview.mjs output: one block per animation, a row per view
(side seen from the right, front, the game's isometric angle), a column per
frame; the hit frame is marked red. Bones grey (left limbs darker), blade blue.
  python pose_preview.py poses.json out.png [cell px]"""
import json
import math
import sys

from PIL import Image, ImageDraw

data = json.load(open(sys.argv[1]))
CELL = int(sys.argv[3]) if len(sys.argv) > 3 else 150
S = CELL / 2.6  # px per metre
BONES = [('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'head'),
         ('chest', 'shL'), ('shL', 'elL'), ('elL', 'haL'), ('chest', 'shR'), ('shR', 'elR'), ('elR', 'haR'),
         ('pelvis', 'hipL'), ('hipL', 'knL'), ('knL', 'anL'), ('pelvis', 'hipR'), ('hipR', 'knR'), ('knR', 'anR')]


def views(p):
    x, y, z = p
    side = (x, y)
    front = (-z, y)
    # the game camera: 45° round, 30° down
    a = math.radians(45)
    rx, rz = x * math.cos(a) - z * math.sin(a), x * math.sin(a) + z * math.cos(a)
    iso = (rx, y * math.cos(math.radians(30)) - rz * math.sin(math.radians(30)))
    return [side, front, iso]


cols = max(len(a['frames']) for a in data.values())
H = (3 * CELL + 24) * len(data)
img = Image.new('RGB', (cols * CELL + 90, H), (34, 36, 42))
d = ImageDraw.Draw(img)
oy = 0
for name, a in data.items():
    d.text((4, oy + 4), f"{name} ({a['fps']}fps{' loop' if a['loop'] else ''})", fill=(230, 220, 160))
    for f, fr in enumerate(a['frames']):
        for vi in range(3):
            cx = 90 + f * CELL + CELL // 2
            cy = oy + 20 + vi * CELL + int(CELL * 0.86)
            d.rectangle([cx - CELL // 2 + 1, cy - int(CELL * 0.86) + 1, cx + CELL // 2 - 1, cy + int(CELL * 0.14) - 1],
                        outline=(200, 60, 60) if a['hit'] == f else (60, 63, 72))
            d.line([cx - CELL // 2 + 4, cy, cx + CELL // 2 - 4, cy], fill=(80, 84, 96))
            P = lambda p: (cx + views(p)[vi][0] * S, cy - views(p)[vi][1] * S)  # noqa: E731
            for b0, b1 in BONES:
                col = (120, 124, 136) if b1.endswith('L') or b0 in ('shL', 'elL', 'hipL', 'knL') else (215, 215, 225)
                d.line([P(fr['j'][b0]), P(fr['j'][b1])], fill=col, width=3)
            hx, hy = P(fr['j']['head'])
            d.ellipse([hx - 5, hy - 9, hx + 5, hy + 1], outline=(215, 215, 225), width=2)
            for b in fr['blades']:
                d.line([P(b[0]), P(b[1])], fill=(170, 170, 170), width=3)
                d.line([P(b[1]), P(b[2])], fill=(110, 170, 255), width=3)
            if f == 0:
                d.text((4, cy - CELL // 2), ['side', 'front', 'iso'][vi], fill=(150, 150, 160))
    oy += 3 * CELL + 24
img.save(sys.argv[2])
