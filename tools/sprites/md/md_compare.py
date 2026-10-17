"""
Comparison sheets for the Movie Duels Anakin (docs/characters/MD_ANAKIN.md), all at the game's own size and drawn the
way the game draws a sheet frame (gfx/renderer.js: the frame at its anchor scaled by the sheet's k, the rendered
shadow in black at SHADOW_ALPHA 0.75, the blade from the frame's saberBase / saberTip markers):

  rows      the game's current Anakin (anakin_tunic, idle) · the self-made duel model v1 (hero_anakin: upper
            `up_stance` over lower `low_stance`) · Movie Duels bind pose · Movie Duels ready pose (a production choice)
  columns   the 8 directions render_sprites.py's 8-direction sheets have: direction i faces i·45° (game angle, y down);
            the 16-direction sheets give their direction 2i (the same facing)

  python3 tools/sprites/md/md_compare.py <md sheets dir> <out dir> [pad.png pad.json [current,hero,bind,ready _dirs8.png strips]]

Writes compare_1x.png (game px), compare_4x.png (the same, nearest-neighbour ×4), and with a pad shot
(tools/sprites/md/padshot.mjs) pad_compare_1x.png / pad_compare_4x.png: the characters pasted on STAGE 01's floor (raw
sheet colours — no level grade), and with the four padshot --dirs8 strips pad8_1x.png / pad8_4x.png: each model drawn BY
THE GAME on the pad (its renderer, lighting and grade), turned to the 8 facings.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SHADOW_ALPHA = 0.75
CELL = 128  # game px: render_sprites' window
AX, AY = 64, 96
FONT = None
for f in (ROOT / 'node_modules/pretendard/dist/public/static/Pretendard-Medium.otf',):
    if f.exists():
        FONT = str(f)


def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()


class Sheet:
    def __init__(self, json_path):
        p = Path(json_path)
        self.d = json.loads(p.read_text())
        self.dir = p.parent
        self.pages = [Image.open(self.dir / n).convert('RGBA') for n in self.d['pages']]
        self.spages = [Image.open(self.dir / n).convert('RGBA') for n in self.d.get('shadowPages', [])]
        self.k = self.d['k']

    def frame(self, anim, f, d):
        return self.d['anims'][anim]['frames'][f][d]

    def draw(self, canvas, x, y, anim, f, d, shadow=True, blade=True):
        """The frame's feet at canvas (x, y) (game px), as the game draws it."""
        fr = self.frame(anim, f, d)
        if fr is None:
            return
        k = self.k
        s = fr.get('s')
        if shadow and s and self.spages:
            im = self.spages[s.get('p', 0)].crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
            im = im.resize((max(1, round(s['w'] * k)), max(1, round(s['h'] * k))), Image.BILINEAR)
            a = im.getchannel('A').point(lambda v: int(v * SHADOW_ALPHA))
            black = Image.new('RGBA', im.size, (0, 0, 0, 255))
            black.putalpha(a)
            canvas.alpha_composite(black, (round(x - s['ox'] * k), round(y - s['oy'] * k)))
        im = self.pages[fr.get('p', 0)].crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
        if k != 1:
            im = im.resize((max(1, round(fr['w'] * k)), max(1, round(fr['h'] * k))), Image.LANCZOS)
        canvas.alpha_composite(im, (round(x - fr['ox'] * k), round(y - fr['oy'] * k)))
        m = fr.get('m') or {}
        if blade and 'saberBase' in m and 'saberTip' in m:
            b, t = m['saberBase'], m['saberTip']
            dr = ImageDraw.Draw(canvas)
            seg = [(x + b[0], y + b[1]), (x + t[0], y + t[1])]
            dr.line(seg, fill=(80, 150, 255, 150), width=3)
            dr.line(seg, fill=(235, 246, 255, 255), width=1)


def rows():
    tunic = Sheet(ROOT / 'public/sprites/anakin_tunic_128.json')
    up = Sheet(ROOT / 'public/sprites/duel/hero_anakin_up_256.json')
    low = Sheet(ROOT / 'public/sprites/duel/hero_anakin_low_256.json')
    bind = Sheet(MD / 'md_anakin_bind_128.json')
    ready = Sheet(MD / 'md_anakin_ready_128.json')

    def hero(c, x, y, d16):
        low.draw(c, x, y, 'low_stance', 0, d16, blade=False)
        up.draw(c, x, y, 'up_stance', 0, d16)

    return [
        ('게임 현재 아나킨 (anakin_tunic · idle)', lambda c, x, y, i: tunic.draw(c, x, y, 'idle', 0, 2 * i)),
        ('자체 제작 v1 (hero_anakin · stance)', lambda c, x, y, i: hero(c, x, y, 2 * i)),
        ('Movie Duels · 원본 바인드 포즈', lambda c, x, y, i: bind.draw(c, x, y, 'bind', 0, i)),
        ('Movie Duels · 준비 자세 (제작 판단)', lambda c, x, y, i: ready.draw(c, x, y, 'ready', 0, i)),
    ]


DIRNAME = ['0 · 0° 오른쪽 아래', '1 · 45° 아래 (카메라 쪽)', '2 · 90° 왼쪽 아래', '3 · 135° 왼쪽', '4 · 180° 왼쪽 위', '5 · 225° 위 (등)', '6 · 270° 오른쪽 위', '7 · 315° 오른쪽']


def compare():
    R = rows()
    LW = 0  # (labels go on the 4x sheet; the 1x is the pure game-pixel grid)
    W, H = LW + CELL * 8, CELL * len(R)
    c = Image.new('RGBA', (W, H), (58, 61, 66, 255))
    dr = ImageDraw.Draw(c)
    for r, (_, fn) in enumerate(R):
        for i in range(8):
            x0, y0 = LW + i * CELL, r * CELL
            dr.rectangle([x0, y0, x0 + CELL - 1, y0 + CELL - 1], outline=(72, 76, 82, 255))
            fn(c, x0 + AX, y0 + AY, i)
    c.save(OUT / 'compare_1x.png')
    big = c.resize((W * 4, H * 4), Image.NEAREST)
    lab = Image.new('RGBA', (W * 4 + 360, H * 4 + 60), (30, 32, 36, 255))
    lab.alpha_composite(big, (360, 60))
    d = ImageDraw.Draw(lab)
    for r, (name, _) in enumerate(R):
        d.multiline_text((14, 60 + r * CELL * 4 + 200), name.replace(' (', '\n('), font=font(26), fill=(235, 238, 242, 255), spacing=6)
    for i in range(8):
        d.text((360 + i * CELL * 4 + 12, 16), '방향 ' + DIRNAME[i], font=font(24), fill=(200, 206, 214, 255))
    lab.save(OUT / 'compare_4x.png')
    return c


def pad(pad_png, pad_json):
    info = json.loads(Path(pad_json).read_text())
    bg = Image.open(pad_png).convert('RGBA')
    R = rows()
    fx, fy = info['feet']['x'], info['feet']['y']
    # (the game's own Anakin is already on the shot at fx, fy: the other three stand beside him on the open floor,
    #  all facing the camera — direction 1 of 8)
    spots = [(fx - 70, fy + 30), (fx, fy + 66), (fx + 70, fy + 40)]
    for (x, y), (_, fn) in zip(spots, R[1:]):
        fn(bg, x, y, 1)
    bg.save(OUT / 'pad_compare_1x.png')
    x0, y0 = max(0, fx - 150), max(0, fy - 90)
    crop = bg.crop((x0, y0, x0 + 300, y0 + 200)).resize((1200, 800), Image.NEAREST)
    lab = Image.new('RGBA', (1200, 860), (30, 32, 36, 255))
    lab.alpha_composite(crop, (0, 60))
    d = ImageDraw.Draw(lab)
    names = ['게임 현재', '자체 제작 v1', 'MD 바인드', 'MD 준비 자세']
    pts = [(fx, fy)] + spots
    for n, (x, y) in zip(names, pts):
        d.text(((x - x0) * 4 - 50, (y - y0) * 4 + 60 + 14), n, font=font(22), fill=(255, 236, 190, 255), stroke_width=3, stroke_fill=(0, 0, 0, 255))
    d.text((14, 16), 'STAGE 01 착륙장 — 실제 게임 화면(배율 1)에 같은 크기로 합성, 최근접 ×4. 게임 현재 아나킨은 게임이 직접 그린 것', font=font(22), fill=(230, 233, 238, 255))
    lab.save(OUT / 'pad_compare_4x.png')


def hero_combined(out):
    """QA only: the self-made v1 model's stance as ONE sheet (its lower layer `low_stance` under its upper `up_stance`
    in a single frame per direction, shadows merged) — the main renderer draws one frame per unit, so this lets
    padshot.mjs --sheet show it on the pad drawn by the game. Not a game asset (written next to the comparisons)."""
    up = Sheet(ROOT / 'public/sprites/duel/hero_anakin_up_256.json')
    low = Sheet(ROOT / 'public/sprites/duel/hero_anakin_low_256.json')
    S = 256  # sheet px per frame window (k = 0.5)
    ax, ay = AX * 2, AY * 2  # (sheet px)
    import numpy as np
    col = Image.new('RGBA', (S * 16, S), (0, 0, 0, 0))
    sha = Image.new('RGBA', (S * 16, S), (0, 0, 0, 0))
    frames = []
    for d in range(16):
        for sh, anim in ((low, 'low_stance'), (up, 'up_stance')):
            fr = sh.frame(anim, 0, d)
            im = sh.pages[fr.get('p', 0)].crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
            col.alpha_composite(im, (round(d * S + ax - fr['ox']), round(ay - fr['oy'])))
            s_ = fr['s']
            sk = s_.get('k', sh.k) / sh.k  # (half-resolution shadow pages: their own scale)
            si = sh.spages[s_.get('p', 0)].crop((s_['x'], s_['y'], s_['x'] + s_['w'], s_['y'] + s_['h']))
            si = si.resize((max(1, round(s_['w'] * sk)), max(1, round(s_['h'] * sk))), Image.BILINEAR)
            cur = sha.crop((d * S, 0, d * S + S, S))
            layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
            layer.alpha_composite(si, (round(ax - s_['ox'] * sk), round(ay - s_['oy'] * sk)))
            sha.paste(Image.fromarray(np.maximum(np.asarray(cur), np.asarray(layer))), (d * S, 0))
        m = up.frame('up_stance', 0, d).get('m', {})
        frames.append({'p': 0, 'x': d * S, 'y': 0, 'w': S, 'h': S, 'ox': ax, 'oy': ay, 'm': m, 's': {'p': 0, 'x': d * S, 'y': 0, 'w': S, 'h': S, 'ox': ax, 'oy': ay}})
    col.save(out / 'qa_hero_stance_256.png')
    sha.save(out / 'qa_hero_stance_256_shadow.png')
    meta = {'name': 'qa_hero_stance', 'dirs': 16, 'size': S, 'window': 128, 'k': 0.5, 'anchor': [AX, AY], 'pages': ['qa_hero_stance_256.png'],
            'shadowPages': ['qa_hero_stance_256_shadow.png'], 'anims': {'stance': {'fps': 1, 'loop': True, 'hit': None, 'frames': [frames]}}}
    (out / 'qa_hero_stance_256.json').write_text(json.dumps(meta))


if __name__ != '__main__':  # (md_grid.py borrows Sheet, font, DIRNAME)
    pass
else:
    MD, OUT = Path(sys.argv[1]), Path(sys.argv[2])
    OUT.mkdir(parents=True, exist_ok=True)
    compare()
    hero_combined(OUT)
if __name__ == '__main__' and len(sys.argv) > 4:
    pad(sys.argv[3], sys.argv[4])
if __name__ == '__main__' and len(sys.argv) > 5:
    strips = [Image.open(p).convert('RGBA') for p in sys.argv[5].split(',')]
    names = ['게임 현재 아나킨', '자체 제작 v1', 'MD 바인드 포즈', 'MD 준비 자세(제작 판단)']
    w, h = strips[0].size
    one = Image.new('RGBA', (w, h * len(strips)))
    for i, st in enumerate(strips):
        one.alpha_composite(st, (0, i * h))
    one.save(OUT / 'pad8_1x.png')
    big = one.resize((w * 4, h * 4 * len(strips) // len(strips)), Image.NEAREST) if False else one.resize((w * 4, h * 4 * len(strips)), Image.NEAREST)
    lab = Image.new('RGBA', (big.width + 300, big.height + 50), (30, 32, 36, 255))
    lab.alpha_composite(big, (300, 50))
    d = ImageDraw.Draw(lab)
    for i, n in enumerate(names):
        d.text((14, 50 + i * h * 4 + h * 2 - 14), n, font=font(24), fill=(235, 238, 242, 255))
    for i in range(8):
        d.text((300 + i * 96 * 4 + 10, 12), '방향 ' + DIRNAME[i], font=font(22), fill=(200, 206, 214, 255))
    lab.save(OUT / 'pad8_4x.png')
if __name__ == '__main__':
    print('COMPARE', OUT)
