"""The art guide's accent colours for Coruscant's signs and lamps (ART_GUIDE.md, 행성별 팔레트), applied
offline to the sprites that carry painted neon: the rebuilt city's buildings (undercity_buildings/bake.py)
and the underworld street props (underworld/extract.py).
"""
import numpy as np
from PIL import Image, ImageFilter


def emissive(rgb, a, soft=False):
    """The signs and lamps: bright and strongly coloured (0..1). `soft`: also the dimmer painted signs
    (the underworld street props: their walls are grey, so what is clearly coloured is signage)."""
    mx = rgb.max(2) / 255
    mn = rgb.min(2) / 255
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-3), 0)
    if soft:
        lit = np.clip((mx - 0.35) / 0.15, 0, 1) * np.clip((sat - 0.3) / 0.1, 0, 1)
    else:
        lit = np.clip((mx - 0.78) / 0.15, 0, 1) * np.clip((sat - 0.5) / 0.25, 0, 1)
    return lit * (a > (30 if soft else 200))  # (a lamp's painted halo is half transparent)


# The art guide's accent colours (ART_GUIDE.md, 행성별 팔레트): the sheets' signs come in every hue at
# saturation ~0.8 (red-orange, orange, pink, teal, green); each sign and lamp is moved to the nearest
# accent of the level it stands on — its own light and shade kept, saturation held to the guide's ~0.7.
ACCENTS = {
    'low': {'magenta': 315.0, 'cyan': 189.0, 'amber': 36.0},  # 네온 마젠타 #ff46d2, 시안 #50e6ff, 호박 #ffb446
    # 공화국 적색 #b3262b, 홀로 청록 #50e6ff; and warm lamplight (a shop's lit interior is light, not a sign:
    # turned red it read as a fire)
    'up': {'republic red': 358.0, 'holo cyan': 189.0, 'lamplight': 36.0},
}
SAT_MAX = 0.7


def rgb_hsv(rgb):
    r, g, b = rgb[..., 0] / 255, rgb[..., 1] / 255, rgb[..., 2] / 255
    mx = np.max([r, g, b], 0)
    mn = np.min([r, g, b], 0)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    return h * 60, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx


def hsv_rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,))
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m] = np.stack([a[m], b[m], c[m]], -1)
    return out * 255


def regrade(rgb, a, lit, level):
    """The signs and lamps (the emissive parts and the coloured glow painted round them) in the level's
    accents: hue to the nearest accent, saturation capped; elsewhere the pixels are left alone."""
    h, sat, v = rgb_hsv(rgb)
    anchors = np.array(list(ACCENTS[level].values()))
    dist = np.abs(((h[..., None] - anchors) + 180) % 360 - 180)
    target = anchors[np.argmin(dist, -1)]
    # the signs, and their painted glow: lit, or strongly coloured and bright next to something lit
    near = np.asarray(Image.fromarray((lit * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))).astype(float) / 255
    glow = np.clip((sat - 0.35) / 0.25, 0, 1) * np.clip((v - 0.35) / 0.25, 0, 1) * near
    wgt = np.clip(np.maximum(lit, glow), 0, 1) * (a > 8)
    dh = ((target - h) + 180) % 360 - 180
    # the hue moves all the way once a pixel is clearly part of a sign (half way is off the palette too)
    nh = h + dh * np.clip(wgt * 3, 0, 1)
    ns = sat - np.clip(sat - SAT_MAX, 0, None) * wgt
    out = hsv_rgb(nh, ns, v)
    return np.where(wgt[..., None] > 0, out, rgb)


