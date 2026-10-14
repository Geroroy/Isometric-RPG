"""Turn an externally made sheet whose 'transparent' background is a painted grey/white checkerboard into real alpha,
without touching the art (CLAUDE.md: crop and key only): the checker is the light, colourless pixels reached from the
sheet's border, plus enclosed patches that show both checker tones (the gaps between railing bars); a light patch of
one tone only (a chrome highlight, a painted band) stays. The edge gets a 1 px soft fringe.

    keyed = key_checker(rgb_array)  -> RGBA uint8 array
"""
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def _flood(mask, seeds):
    H, W = mask.shape
    out = np.zeros_like(mask)
    q = deque()
    for y, x in seeds:
        if mask[y, x] and not out[y, x]:
            out[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    return out


def key_checker(a):
    a = a.astype(int)
    H, W = a.shape[:2]
    mx, mn = a.max(2), a.min(2)
    light = (mx - mn <= 16) & (mn >= 150)
    border = [(y, x) for x in range(W) for y in (0, H - 1)] + [(y, x) for y in range(H) for x in (0, W - 1)]
    bg = _flood(light, border)
    # enclosed light patches with the checker's two tones
    seen = bg.copy()
    for y0 in range(H):
        for x0 in range(W):
            if light[y0, x0] and not seen[y0, x0]:
                reg = _flood(light & ~seen, [(y0, x0)])
                seen |= reg
                v = mn[reg]
                lo = ((v > 165) & (v < 200)).mean()
                hi = (v > 235).mean()
                if reg.sum() >= 12 and lo >= 0.04 and 0.2 <= hi <= 0.85:
                    bg |= reg
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # a 1 px soft fringe (the anti-aliased edge was blended with the checker)
    soft = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7)))
    alpha = np.minimum(alpha, np.maximum(soft, 0)).astype(np.uint8)
    return np.dstack([a.astype(np.uint8), alpha])
