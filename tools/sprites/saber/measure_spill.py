"""The colour a lightsaber blade throws on what is near it, measured in film frames
(docs/prompts/saber_light_palette_movie.md): for each frame the blade cores (very bright, long and thin),
the distance of every pixel from them in blade lengths, and per distance band
  bloom   — smooth pixels (the camera's glow round the blade): their own colour
  surface — textured pixels (faces, cloth, metal, rock): the colour the blade ADDS, i.e. the band's mean
            surface colour less the same frame's surfaces far from any blade (2-4 blade lengths)
Hue / saturation / value of each, weighted medians over the frames, and the near / far tint for the game.
   python3 tools/sprites/saber/measure_spill.py <frames_dir> [more dirs...]
"""
import colorsys
import glob
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

BANDS = {'near': (0.08, 0.3), 'far': (0.3, 0.8), 'base': (2.0, 4.0)}


def hsv(rgb):
    r, g, b = [max(0.0, float(v)) for v in rgb]
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return h * 360, s, v


def wmed(vals, w):
    o = np.argsort(vals)
    c = np.cumsum(np.asarray(w)[o])
    return float(np.asarray(vals)[o][np.searchsorted(c, c[-1] / 2)])


def frame(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    core = (im.min(2) > 215) & (b >= r - 5)
    lab, n = nd.label(core)
    blade = np.zeros_like(core)
    L = 0
    for i, sl in enumerate(nd.find_objects(lab), 1):
        ys, xs = np.nonzero(lab[sl] == i)
        if len(ys) < 25:
            continue
        pts = np.stack([xs, ys], 1).astype(float)
        ev = np.linalg.eigvalsh(np.cov(pts.T)) if len(pts) > 2 else [0, 0]
        if ev[0] <= 0 or ev[1] / max(ev[0], 1e-3) < 12:
            continue  # not long and thin (sky, a lamp, a spark burst)
        length = 4 * np.sqrt(ev[1])
        if length < 40:
            continue
        blade[sl] |= lab[sl] == i
        L = max(L, length)
    if not blade.any():
        return None
    d = nd.distance_transform_edt(~blade) / L
    tex = nd.generic_filter(lum, np.std, size=5) if False else np.sqrt(np.maximum(nd.uniform_filter(lum ** 2, 5) - nd.uniform_filter(lum, 5) ** 2, 0))
    out = {}
    for k, (a, z) in BANDS.items():
        m = (d >= a) & (d < z)
        out[k + '_surf'] = im[m & (tex > 6) & (lum > 12) & (lum < 230)]
        out[k + '_bloom'] = im[m & (tex < 2.5) & (lum > 25)]
        # surfaces the blade visibly lights: blue the strongest channel, clearly so
        out[k + '_lit'] = im[m & (tex > 4) & (b > r + 18) & (b >= g) & (lum > 15) & (lum < 235)]
    return out


def main():
    files = [f for d in sys.argv[1:] for f in sorted(glob.glob(d + '/*.png'))]
    rows = {'near_bloom': [], 'far_bloom': [], 'near_add': [], 'far_add': [], 'near_lit': [], 'far_lit': []}
    used = 0
    for f in files:
        o = frame(f)
        if not o or len(o['base_surf']) < 200:
            continue
        base = o['base_surf'].mean(0)
        for k in ('near', 'far'):
            s = o[k + '_surf']
            if len(s) > 150:
                add = s.mean(0) - base
                mag = np.linalg.norm(add)
                if mag > 4:
                    rows[k + '_add'].append((add - add.min(), mag))
            lt = o[k + '_lit']
            if len(lt) > 80:
                rows[k + '_lit'].append((np.median(lt, 0), len(lt)))
            bl = o[k + '_bloom']
            if len(bl) > 150:
                rows[k + '_bloom'].append((np.median(bl, 0), len(bl)))
        used += 1
    print(f'{used} frames with a blade of {len(files)}')
    res = {}
    for k, v in rows.items():
        if not v:
            print(k, 'none')
            continue
        hs = [hsv(c) for c, _ in v]
        w = [m for _, m in v]
        h = wmed([x[0] for x in hs], w)
        s = wmed([x[1] for x in hs], w)
        val = wmed([x[2] for x in hs], w)
        q = np.percentile([x[0] for x in hs], [25, 75])
        res[k] = (h, s, val)
        c = np.median(np.array([c for c, _ in v]), 0)
        print(f'{k:11s} n={len(v):3d}  hue {h:5.1f}° (IQR {q[0]:.0f}-{q[1]:.0f})  sat {s:.2f}  val {val:.2f}  median #{int(c[0]):02x}{int(c[1]):02x}{int(c[2]):02x}' + ('' if k.endswith('_add') else ''))
    return res


if __name__ == '__main__':
    main()
