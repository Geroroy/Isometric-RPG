"""
The undercity street: a seamless top-down floor texture the game's terrain
samples in world coordinates (so it lies flat in the isometric view and
tiles with no seams).

  python city_floor.py out.png [tiles=8] [px_per_tile=64]

Worn duracrete slabs (one tile each, every other row offset by half) with
dark joints, cracks and chipped corners, metal drainage grates, oil stains,
scattered debris, and wet patches that hold a faint purple / teal sheen of
the neon. Shaded by its own relief with the light from the upper left, like
the sprites. Every noise is periodic over the texture, so it tiles.
"""
import sys

import numpy as np
from PIL import Image

OUT = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 8
P = int(sys.argv[3]) if len(sys.argv) > 3 else 64
R = N * P
rng = np.random.default_rng(21)


def periodic_noise(cells, seed):
    r = np.random.default_rng(seed)
    lat = r.random((cells, cells))
    t = np.linspace(0, cells, R, endpoint=False)
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    fx, fy = f[None, :], f[:, None]
    return (lat[np.ix_(i0, i0)] * (1 - fx) + lat[np.ix_(i0, i1)] * fx) * (1 - fy) + (lat[np.ix_(i1, i0)] * (1 - fx) + lat[np.ix_(i1, i1)] * fx) * fy


def fbm(base, octaves, seed):
    out, amp, tot = np.zeros((R, R)), 1.0, 0.0
    for o in range(octaves):
        out += periodic_noise(base * 2 ** o, seed + o) * amp
        tot += amp
        amp *= 0.5
    return out / tot


yy, xx = np.mgrid[0:R, 0:R] / P  # in tiles
row = np.floor(yy).astype(int)
sx = xx + (row % 2) * 0.5  # running bond: every other row offset by half a slab
col = np.floor(sx).astype(int) % N
fx, fy = sx % 1, yy % 1
# joints between slabs, slightly irregular
jw = 0.035 + 0.015 * fbm(8, 2, 1)
joint = np.minimum.reduce([fx, 1 - fx, fy, 1 - fy]) < jw
# per-slab tone, tilt (a slab sunk at one corner) and wear
slab_id = (row % N) * N + col
tone = np.random.default_rng(2).normal(0, 1, N * N)[slab_id]
tilt = np.random.default_rng(3).uniform(-1, 1, (N * N, 2))[slab_id]
height = (fx - 0.5) * tilt[..., 0] * 0.06 + (fy - 0.5) * tilt[..., 1] * 0.06
grain = fbm(32, 3, 4)
height = height + grain * 0.05 - joint * 0.25
# cracks: thin ridges of a noise, mostly across the slabs
crack = ((np.abs(fbm(5, 4, 5) - 0.5) < 0.006) | (np.abs(fbm(7, 3, 6) - 0.5) < 0.005)) & (fbm(3, 2, 12) > 0.58)
height = height - crack * 0.15
# chipped corners
corner = np.hypot(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy)) < 0.09 * (fbm(16, 2, 7) > 0.55)
height = height - corner * 0.12
# drainage grates: two per texture, on whole slabs
grate = np.zeros((R, R), bool)
for gx, gy in ((1, 0), (5, 3), (2, 6)):
    m = (row == gy) & (np.floor(sx).astype(int) % N == gx)
    inner = (fx > 0.18) & (fx < 0.82) & (fy > 0.25) & (fy < 0.75)
    grate |= m & inner
bars = grate & (((fx - 0.18) * 14) % 1 < 0.4)
height = np.where(grate, -0.2 + bars * 0.16, height)

# colour: duracrete grey with a warm cast, stains, debris
base = np.array([92, 88, 82]) / 255
col_ = np.ones((R, R, 3)) * base
col_ *= (1 + 0.06 * tone[..., None] + 0.18 * (fbm(6, 4, 8)[..., None] - 0.5))
col_ = np.where(joint[..., None], col_ * 0.55, col_)
col_ = np.where(crack[..., None], col_ * 0.6, col_)
# oil stains: dark rings with a faint rainbow edge
oil = fbm(4, 3, 9)
stain = np.clip((oil - 0.62) * 6, 0, 1)
col_ *= 1 - 0.45 * stain[..., None]
col_ += (np.clip(1 - np.abs(oil - 0.62) * 40, 0, 1) * 0.04)[..., None] * np.array([0.6, -0.2, 0.8])
# grates: dark metal over a black drain with a faint warm glow far down
metal = np.array([60, 62, 66]) / 255
col_ = np.where(grate[..., None], np.where(bars[..., None], metal * (1.1 + 0.2 * grain[..., None]), np.array([0.05, 0.04, 0.035])), col_)
# debris specks
spk = rng.random((R, R))
col_ = np.where((spk > 0.996)[..., None], col_ * 1.5, col_)
col_ = np.where((spk < 0.006)[..., None], col_ * 0.5, col_)
# wet patches: darker, smoother, with a sheen of the neon (magenta and teal)
wet = np.clip((fbm(3, 3, 10) - 0.52) * 5, 0, 1)
sheen = fbm(2, 2, 11)
neon = np.array([0.55, 0.18, 0.6]) * sheen[..., None] + np.array([0.1, 0.5, 0.55]) * (1 - sheen[..., None])
col_ = col_ * (1 - 0.35 * wet[..., None]) + neon * (0.12 * wet[..., None])
height = height * (1 - 0.6 * wet)

# relief shading, light from the upper left (−x, −y in the texture), wrapping
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * P * 0.5
gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * P * 0.5
shade = 1 + np.clip((-gx * 0.7 - gy * 0.7) * 0.35, -0.35, 0.35)
col_ *= shade[..., None]
Image.fromarray((np.clip(col_, 0, 1) * 255).astype(np.uint8), 'RGB').save(OUT, optimize=True)
print('wrote', OUT, f'{R}x{R} px, {N}x{N} tiles')
