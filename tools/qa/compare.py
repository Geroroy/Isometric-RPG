"""
Reference loop: put the game's screenshots next to reference images and
measure where they differ — lighting, colour, detail density, contrast and
effects — then list what to improve first.

  python3 tools/qa/compare.py [--shots tools/qa/out/shots] [--refs references] [--out docs/qa]

references/<place>/*.(png|jpg|webp) are compared with the shot of that place
(christophsis, coruscant, undercity, geonosis, mustafar); images directly in
references/ are compared with every shot. references/ is not committed
(film stills and concept art are someone else's work): each machine keeps
its own.

Writes <out>/reference_sheet.png (each shot beside its references, with a
row of numbers under each picture) and <out>/reference_report.md (the
measurements, the differences and a prioritised list).
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('--shots', default='tools/qa/out/shots')
ap.add_argument('--refs', default='references')
ap.add_argument('--out', default='docs/qa')
A = ap.parse_args()
EXT = ('.png', '.jpg', '.jpeg', '.webp')
W = 640  # every picture is measured at this width (detail counts per pixel)


def load(path):
    im = Image.open(path).convert('RGB')
    h = round(im.height * W / im.width)
    return im.resize((W, h), Image.LANCZOS)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lab(rgb):
    lin = srgb_to_lin(rgb)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    return L, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def measure(im):
    rgb = np.asarray(im).astype(np.float32) / 255
    L, a, b = lab(rgb)
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    gy, gx = np.gradient(L)
    grad = np.hypot(gx, gy)
    # local contrast: |L - blur(L)| (a box blur of 9 px)
    k = 9
    pad = np.pad(L, k // 2, mode='edge')
    cs = pad.cumsum(0).cumsum(1)
    cs = np.pad(cs, ((1, 0), (1, 0)))
    blur = (cs[k:, k:] - cs[:-k, k:] - cs[k:, :-k] + cs[:-k, :-k]) / (k * k)
    bright = L > 85
    glow = bright & (sat > 0.35)
    return {
        # lighting
        'brightness': float(L.mean()),
        'shadows_p5': float(np.percentile(L, 5)),
        'highlights_p95': float(np.percentile(L, 95)),
        'dark_share': float((L < 15).mean()),
        # colour
        'saturation': float(sat.mean()),
        'warmth': float(b.mean() + a.mean() * 0.5),  # + warm (yellow/red), − cool (blue)
        'tint_green_magenta': float(a.mean()),
        # contrast
        'contrast': float(L.std()),
        'local_contrast': float(np.abs(L - blur).mean()),
        # detail density
        'edge_density': float((grad > 6).mean()),
        'fine_detail': float(np.abs(np.diff(L, 2, axis=1)).mean()),
        # effects
        'glow_share': float(glow.mean()),
        'highlight_share': float(bright.mean()),
    }


GROUPS = {
    'lighting': ['brightness', 'shadows_p5', 'highlights_p95', 'dark_share'],
    'colour': ['saturation', 'warmth', 'tint_green_magenta'],
    'detail': ['edge_density', 'fine_detail'],
    'contrast': ['contrast', 'local_contrast'],
    'effects': ['glow_share', 'highlight_share'],
}
KO = {'lighting': '조명', 'colour': '색감', 'detail': '디테일 밀도', 'contrast': '대비', 'effects': '이펙트'}
# scale of a "noticeable" difference per metric (one unit = one step of priority)
STEP = {'brightness': 6, 'shadows_p5': 5, 'highlights_p95': 6, 'dark_share': 0.08, 'saturation': 0.05, 'warmth': 4,
        'tint_green_magenta': 3, 'contrast': 4, 'local_contrast': 1.2, 'edge_density': 0.04, 'fine_detail': 0.4,
        'glow_share': 0.01, 'highlight_share': 0.03}
# what to change in this project for each kind of difference (sign: game below / above the references)
FIX = {
    'brightness': ('어둡다: 장소 ambient(worldgen.js)·주광 세기를 올리거나 post.js GRADES gain을 올린다', '밝다: ambient를 내리거나 GRADES contrast로 중간톤을 누른다'),
    'shadows_p5': ('그림자가 더 깊다: SHADOW_ALPHA·AO를 줄이거나 ambient를 올린다', '그림자가 떠 있다: SHADOW_ALPHA(0.75)·shadow_gain·AO를 올린다'),
    'highlights_p95': ('하이라이트가 약하다: 주광(key 4.2)·네온 세기·블룸을 올린다', '하이라이트가 날아간다: 주광·블룸을 줄인다'),
    'dark_share': ('검은 영역이 적다: 그림자/비네팅을 강화한다', '검게 뭉개진 영역이 많다: ambient를 올리고 비네팅을 줄인다'),
    'saturation': ('채도가 낮다: GRADES sat을 올리거나 재질 색을 진하게', '채도가 높다: GRADES sat을 내린다 (ART_GUIDE 4절 "낮은 채도")'),
    'warmth': ('더 차갑다: GRADES gain을 붉게/노랗게, key 색을 따뜻하게', '더 따뜻하다: GRADES gain을 푸르게, 하늘·rim을 차갑게'),
    'tint_green_magenta': ('초록 기운: GRADES의 그림자 틴트에 마젠타를 더한다', '마젠타 기운: 그림자 틴트에 초록을 더한다'),
    'contrast': ('대비가 약하다: GRADES contrast를 올리고 ambient를 내린다', '대비가 세다: GRADES contrast를 내리고 fill을 올린다'),
    'local_contrast': ('면이 밋밋하다: AO·노멀 디테일·텍스처 대비를 올린다', '국부 대비가 과하다: sharpen(0.5)을 줄인다'),
    'edge_density': ('디테일이 성기다: 소품·데칼·바닥 텍스처 밀도를 올린다', '디테일이 과밀하다: 소품을 줄이고 큰 면을 남긴다'),
    'fine_detail': ('잔디테일이 부족하다: 텍스처 해상도/그레인을 올린다', '잔노이즈가 많다: 그레인·샘플 노이즈를 줄인다'),
    'glow_share': ('발광이 적다: 네온·광선검·이펙트 광원을 늘리고 블룸을 올린다', '발광이 과하다: 블룸·네온 세기를 줄인다'),
    'highlight_share': ('밝은 면이 좁다: 주광 각도·세기를 올린다', '밝은 면이 넓다: 주광을 줄이거나 노출을 내린다'),
}

shots = {os.path.splitext(os.path.basename(p))[0]: p for p in sorted(glob.glob(os.path.join(A.shots, '*.png')))}
if not shots:
    raise SystemExit(f'no game shots in {A.shots}: run node tools/qa/capture.mjs first')
common = [p for p in sorted(glob.glob(os.path.join(A.refs, '*'))) if p.lower().endswith(EXT)]
pairs = {}
for name in shots:
    refs = [p for p in sorted(glob.glob(os.path.join(A.refs, name, '*'))) if p.lower().endswith(EXT)] + common
    pairs[name] = refs
if not any(pairs.values()):
    raise SystemExit(f'no reference images in {A.refs}/ (put them in {A.refs}/<place>/ or {A.refs}/)')

os.makedirs(A.out, exist_ok=True)
font = None
for f in ('/usr/share/fonts/truetype/nanum/NanumGothic.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'node_modules/galmuri/dist/Galmuri11.ttf'):
    if os.path.exists(f):
        font = ImageFont.truetype(f, 13)
        break
font = font or ImageFont.load_default()

rows, report, issues = [], [], []
for name, refs in pairs.items():
    if not refs:
        continue
    g_im = load(shots[name])
    gm = measure(g_im)
    r_ims = [load(r) for r in refs]
    rms = [measure(r) for r in r_ims]
    ref_mean = {k: float(np.mean([m[k] for m in rms])) for k in gm}
    rows.append((name, g_im, gm, list(zip(refs, r_ims, rms))))
    report.append(f'## {name}\n\n레퍼런스 {len(refs)}장: ' + ', '.join(os.path.relpath(r, A.refs) for r in refs) + '\n')
    report.append('| 항목 | 지표 | 게임 | 레퍼런스 평균 | 차이(단계) |\n|---|---|---|---|---|')
    for grp, keys in GROUPS.items():
        for k in keys:
            d = (gm[k] - ref_mean[k]) / STEP[k]
            report.append(f'| {KO[grp]} | {k} | {gm[k]:.3f} | {ref_mean[k]:.3f} | {d:+.1f} |')
            if abs(d) >= 1:
                issues.append({'place': name, 'group': grp, 'metric': k, 'steps': d, 'fix': FIX[k][0 if d < 0 else 1]})
    report.append('')

# priorities: how far off, weighted by how much the eye notices each kind
WEIGHT = {'lighting': 1.3, 'contrast': 1.2, 'colour': 1.0, 'effects': 0.9, 'detail': 0.8}
issues.sort(key=lambda i: -abs(i['steps']) * WEIGHT[i['group']])
pr = ['# 레퍼런스 비교 리포트', '', f'게임 샷: `{A.shots}` · 레퍼런스: `{A.refs}` · 시트: `reference_sheet.png`', '',
      '## 개선 우선순위', '', '차이(단계)는 "눈에 띄는 차이" 하나를 1로 센 값이다(+: 게임이 더 큼). 가중치: 조명 1.3, 대비 1.2, 색감 1.0, 이펙트 0.9, 디테일 0.8.', '']
for n, i in enumerate(issues[:20], 1):
    pr.append(f"{n}. **{i['place']} · {KO[i['group']]}** (`{i['metric']}` {i['steps']:+.1f}) — {i['fix']}")
if not issues:
    pr.append('눈에 띄는 차이가 없다.')
pr += ['', '## 측정값', ''] + report
open(os.path.join(A.out, 'reference_report.md'), 'w').write('\n'.join(pr) + '\n')
json.dump(issues, open(os.path.join(A.out, 'reference_issues.json'), 'w'), ensure_ascii=False, indent=1)

# the sheet: a row per place — the game shot, then its references, numbers under each
TH = 300
LBL = 64
cols = max(1 + len(r[3]) for r in rows)
sheet = Image.new('RGB', (cols * (TH * 16 // 9 + 8) + 8, len(rows) * (TH + LBL + 8) + 8), (18, 20, 24))
dr = ImageDraw.Draw(sheet)
y = 8
for name, g_im, gm, refs in rows:
    x = 8
    for i, (title, im, m) in enumerate([('게임 · ' + name, g_im, gm)] + [(os.path.relpath(p, A.refs), im, m) for p, im, m in refs]):
        t = im.copy()
        t.thumbnail((TH * 16 // 9, TH))
        sheet.paste(t, (x, y))
        dr.text((x, y + TH + 4), title[:48], fill=(240, 168, 60) if i == 0 else (200, 210, 220), font=font)
        dr.text((x, y + TH + 22), f"밝기 {m['brightness']:.0f}  대비 {m['contrast']:.0f}  채도 {m['saturation']:.2f}  온도 {m['warmth']:+.0f}", fill=(190, 200, 210), font=font)
        dr.text((x, y + TH + 40), f"디테일 {m['edge_density']:.2f}  발광 {m['glow_share'] * 100:.1f}%  그림자 {m['shadows_p5']:.0f}", fill=(190, 200, 210), font=font)
        x += TH * 16 // 9 + 8
    y += TH + LBL + 8
sheet.save(os.path.join(A.out, 'reference_sheet.png'))
print(f'wrote {A.out}/reference_sheet.png, reference_report.md ({len(issues)} differences)')
