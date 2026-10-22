"""
Review sheet of the duel characters: for each character, idle (stance) · guard · the first slash (windup, swing, the
hit frame at s = MID, follow-through) in the representative directions — enlarged (the sheet rendered at 8 px per game
px) and at the sizes the game shows them: 1 game px = 1 px (native) and the arena's zoom (3 CSS px per game px), the
blade drawn from the frame's markers like the game does.

  .bvenv/bin/python tools/sprites/hero/compose_review.py SHEET_DIR out.png [anakin,obiwan]
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
CHARS = (sys.argv[3] if len(sys.argv) > 3 else 'anakin,obiwan').split(',')
BLADE = {'anakin': (70, 140, 255), 'obiwan': (90, 190, 255)}
BG = (34, 30, 30, 255)
FONT = None
for f in (os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../node_modules/pretendard/dist/public/static/Pretendard-Medium.otf'),
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
    if os.path.exists(f):
        FONT = ImageFont.truetype(f, 15)
        break
FONT = FONT or ImageFont.load_default()


LIB = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../public/sprites/duel/hero_poses.json')))['styles']


def sheet(name, size):
    """The character's sheets of this size merged (whole body + upper layer + lower layer, those that exist)."""
    out = None
    for suffix in ('', '_up', '_low'):
        f = os.path.join(SRC, f'hero_{name}{suffix}_{size}.json')
        if not os.path.exists(f):
            continue
        j, pages, shadows = sheet1(f)
        if out is None:
            out = (j, pages, shadows)
        else:
            base = len(out[1])
            sbase = len(out[2])
            for a, x in j['anims'].items():
                for row in x['frames']:
                    for fr in row:
                        if fr:
                            fr['p'] += base
                            fr['s']['p'] += sbase
                out[0]['anims'][a] = x
            out[1].extend(pages)
            out[2].extend(shadows)
    return out


def sheet1(path):
    j = json.load(open(path))
    d = os.path.dirname(path)
    pages = [Image.open(os.path.join(d, p)).convert('RGBA') for p in j['pages']]
    shadows = [Image.open(os.path.join(d, p)).convert('RGBA') for p in j['shadowPages']]
    return j, pages, shadows


def frame(j, pages, anim, i, d):
    f = j['anims'][anim]['frames'][i][d]
    return pages[f['p']].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), f


def place(canvas, j, pages, shadows, anim, i, d, x, y, scale, name, blade=True):
    """Draw one picture: `anim` a clip name, or a list of (clip, frame) layers (lower first — the upper layer moved to the
    lower one's hip height, as src/combat/sprites.js does); feet at (x, y), `scale` canvas px per sheet px."""
    if isinstance(anim, list):
        (la, li), (ua, ui) = anim
        L = LIB[name]
        dz = (L[ua]['frames'][ui]['z'] - L[la]['frames'][li]['z']) * 24.49 / j['k'] * scale
        place(canvas, j, pages, shadows, la, li, d, x, y, scale, name, blade=False)
        place(canvas, j, pages, shadows, ua, ui, d, x, y + dz, scale, name, blade)
        return
    im, f = frame(j, pages, anim, i, d)
    k = j['k']  # game px per sheet px
    s = f['s']
    sh = shadows[s['p']].crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
    a = sh.split()[3].point(lambda v: int(v * 0.62))
    blk = Image.new('RGBA', sh.size, (0, 0, 0, 255))
    blk.putalpha(a)
    blk = blk.resize((max(1, round(sh.width * scale)), max(1, round(sh.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(blk, (round(x - s['ox'] * scale), round(y - s['oy'] * scale)))
    m = f.get('m', {})
    gs = scale / k  # canvas px per game px

    def bl(alpha_k=1.0, segs=None):
        if not (blade and 'saberBase' in m):
            return
        b = (x + m['saberBase'][0] * gs, y + m['saberBase'][1] * gs)
        t = (x + m['saberTip'][0] * gs, y + m['saberTip'][1] * gs)
        lay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        dr = ImageDraw.Draw(lay)
        r, g, bb = BLADE[name]
        for a0, a1 in segs or [[0, 1]]:
            p0 = (b[0] + (t[0] - b[0]) * a0, b[1] + (t[1] - b[1]) * a0)
            p1 = (b[0] + (t[0] - b[0]) * a1, b[1] + (t[1] - b[1]) * a1)
            for w, col in ((max(3, 0.2 * 22.4 * gs), (r, g, bb, 50)), (max(2, 0.1 * 22.4 * gs), (r, g, bb, 120)), (max(1, 0.032 * 22.4 * gs), (244, 251, 255, 255))):
                dr.line([p0, p1], fill=col, width=round(w))
        canvas.alpha_composite(lay)

    bl()
    big = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS if scale < 1 else Image.BICUBIC)
    canvas.alpha_composite(big, (round(x - f['ox'] * scale), round(y - f['oy'] * scale)))
    bl(segs=f.get('b', {}).get('saber'))


def label(canvas, x, y, text, color=(230, 220, 200, 255)):
    ImageDraw.Draw(canvas).text((x, y), text, fill=color, font=FONT)


def pick_frames(j):
    a = j['anims']
    hit = a['light1']['hit']
    return [([('low_stance', 0), ('up_stance', 0)], 0, '대기'), ([('low_guard', 0), ('up_guard', 2)], 0, '방어'), ('light1', 2, '베기 준비'), ('light1', 4, '휘두름'),
            ('light1', hit, '타격 (판정 프레임)'), ('light1', 9, '휘두름 끝'), ('light1', 13, '회수')]


rows = []
for name in CHARS:
    jz, pz, sz = sheet(name, 1024)
    j3, p3, s3 = sheet(name, 256)
    j1, p1, s1 = sheet(name, 128)
    dirs = [d for d in range(jz['dirs']) if jz['anims']['light1']['frames'][0][d]]
    picks = pick_frames(jz)
    # zoom row (direction 0)
    W = 360
    zoom = Image.new('RGBA', (W * len(picks), 520), BG)
    for k, (an, i, lab) in enumerate(picks):
        place(zoom, jz, pz, sz, an, i, dirs[0], W * k + W // 2, 470, 0.5, name)
        label(zoom, W * k + 10, 8, lab)
    label(zoom, 10, 494, f'{name} · 확대 (렌더 8 px = 게임 1 px를 절반으로: 화면 4배) · 방향 {dirs[0]}')
    rows.append(zoom)
    # second direction, zoomed less
    if len(dirs) > 1:
        z2 = Image.new('RGBA', (W * len(picks), 380), BG)
        for k, (an, i, lab) in enumerate(picks):
            place(z2, jz, pz, sz, an, i, dirs[1], W * k + W // 2, 340, 0.36, name)
        label(z2, 10, 356, f'{name} · 방향 {dirs[1]} (카메라를 보는 방향)')
        rows.append(z2)
    # game sizes: native 1x (128 sheet: 1 sheet px = 1 game px) and arena zoom (384 sheet = 3 px per game px, shown 1:1)
    g = Image.new('RGBA', (W * len(picks), 310), BG)
    for k, (an, i, lab) in enumerate(picks):
        for t, d in enumerate(dirs[:2]):
            place(g, j1, p1, s1, an, i, d, W * k + 40 + t * 50, 95, 1.0, name)
            place(g, j3, p3, s3, an, i, d, W * k + 110 + t * 125, 285, 1.75, name)
    label(g, 10, 6, f'{name} · 실제 게임 크기: 위 = 게임 1 px (본편 1배, 방향 {dirs[0]}·{dirs[1]}), 아래 = 결투 시험장 (게임 1 px = 화면 3.5 px, 화면 높이 760 px일 때)')
    rows.append(g)
H = sum(r.height for r in rows)
W = max(r.width for r in rows)
out = Image.new('RGBA', (W, H), BG)
y = 0
for r in rows:
    out.alpha_composite(r, (0, y))
    y += r.height
out.convert('RGB').save(OUT, quality=92)
print('wrote', OUT, out.size)
