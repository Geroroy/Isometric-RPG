"""Before | after sheets from two tools/qa/lookshot.mjs runs: every pose as a pair, labelled,
plus a head close-up row (nearest-neighbour, so the game's pixels show as they are).
  python3 tools/qa/lookcompare.py <before_dir> <after_dir> <out_dir> [before_sheet.json after_sheet.json]
With the two sheets it also lays out their frames themselves (idleOff and run, all directions, ×4)."""
import glob
import os
import sys

from PIL import Image, ImageDraw

bdir, adir, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
BG = (20, 22, 26)
GOLD = (255, 220, 120)


def pose_names():
    return [os.path.basename(p)[len('before_'):-4] for p in sorted(glob.glob(os.path.join(bdir, 'before_*.png')))]


def pair(name):
    return Image.open(os.path.join(bdir, f'before_{name}.png')).convert('RGB'), Image.open(os.path.join(adir, f'after_{name}.png')).convert('RGB')


def grid(names, path, scale=1, crop=None, cols=4):
    cells = []
    for n in names:
        b, a = pair(n)
        if crop:
            b, a = b.crop(crop), a.crop(crop)
        b = b.resize((b.width * scale, b.height * scale), Image.NEAREST)
        a = a.resize((a.width * scale, a.height * scale), Image.NEAREST)
        c = Image.new('RGB', (b.width * 2 + 6, b.height + 22), BG)
        c.paste(b, (0, 22))
        c.paste(a, (b.width + 6, 22))
        d = ImageDraw.Draw(c)
        d.text((4, 5), f'{n} · BEFORE', fill=(200, 200, 200))
        d.text((b.width + 10, 5), f'{n} · AFTER (hair v2)', fill=GOLD)
        cells.append(c)
    W, H = cells[0].size
    rows = (len(cells) + cols - 1) // cols
    S = Image.new('RGB', (W * cols + 12 * (cols - 1), H * rows + 12 * (rows - 1)), (8, 9, 11))
    for i, c in enumerate(cells):
        S.paste(c, ((i % cols) * (W + 12), (i // cols) * (H + 12)))
    S.save(path)
    print(path, S.size)


names = pose_names()
idle = [n for n in names if n.startswith('idleOff')]
action = [n for n in names if not n.startswith('idleOff') and n != 'scene']
grid(idle, os.path.join(out, 'compare_idle_8dirs.png'), cols=2)
grid(action, os.path.join(out, 'compare_actions.png'), cols=2)
# the head: the crop around the player's head in the zoomed shots, ×2
grid(idle, os.path.join(out, 'compare_heads.png'), scale=2, crop=(100, 20, 240, 170), cols=2)
if 'scene' in names:
    b, a = pair('scene')
    S = Image.new('RGB', (b.width, b.height * 2 + 50), BG)
    S.paste(b, (0, 24))
    S.paste(a, (0, b.height + 50))
    d = ImageDraw.Draw(S)
    d.text((6, 6), 'BEFORE', fill=(200, 200, 200))
    d.text((6, b.height + 32), 'AFTER (hair v2)', fill=GOLD)
    S.save(os.path.join(out, 'compare_scene.png'))


def sheet_frames(path, anim, frame):
    d = json.load(open(path))
    pages = [Image.open(os.path.join(os.path.dirname(path), n)).convert('RGBA') for n in d['pages']]
    out = []
    for f in d['anims'][anim]['frames'][frame]:  # frames[frame][direction]
        out.append((pages[f['p']].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), f['ox'], f['oy']))
    return out


if len(sys.argv) > 5:
    import json
    K, CW, CH = 4, 40, 64
    for anim, frame in (('idleOff', 0), ('run', 1)):
        rows = [('BEFORE', sheet_frames(sys.argv[4], anim, frame)), ('AFTER (hair v2)', sheet_frames(sys.argv[5], anim, frame))]
        n = len(rows[0][1])
        S = Image.new('RGBA', (n * CW * K, len(rows) * (CH * K + 24)), (74, 78, 86, 255))
        d = ImageDraw.Draw(S)
        for r, (label, frs) in enumerate(rows):
            y0 = r * (CH * K + 24)
            d.text((6, y0 + 6), f'{label} · {anim} frame {frame} · 16 directions · x{K}', fill=GOLD if r else (220, 220, 220))
            for i, (im, ox, oy) in enumerate(frs):
                big = im.resize((im.width * K, im.height * K), Image.NEAREST)
                ax, ay = i * CW * K + CW * K // 2, y0 + 24 + (CH - 6) * K
                S.alpha_composite(big, (int(ax - ox * K), int(ay - oy * K)))
        S.convert('RGB').save(os.path.join(out, f'compare_sheet_{anim}.png'))
        print('sheet', anim, S.size)
