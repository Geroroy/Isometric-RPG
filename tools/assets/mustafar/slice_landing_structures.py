"""Cut the delivered STAGE 01 structures sheet (tools/assets/mustafar/src/landing_structures_sheet.png, made externally
for docs/asset_requests/chatgpt_stage01_structures.md) — key its painted checker background (key_checker.py) and crop.
Nothing is resampled or recoloured; the sheet's scale is taken into the manifest as each piece's `density` instead.

    python3 tools/assets/mustafar/slice_landing_structures.py

Measured on the sheet (screen slope of a piece's long ground edge; the game's 2:1 axes slope 0.5):
  railings ~0.63, corridor deck and walls ~1.0 -> not at the game's projection: NOT exported (they would not line up
  with the pad's edges or join end to end; fixing them means warping, which needs the user's approval)
  ship: axis slope ~0.38 — a valid ground heading in 2:1 (nose toward +x, a little toward −y), nothing to line up:
  exported. Length along its axis 1512 px for about 29 m -> density 2.16; anchor = the midpoint of its rear and nose
  landing feet (322, 789) and (1325, 1009) on the sheet.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from key_checker import key_checker  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'tools/assets/mustafar/src/landing_structures_sheet.png'
SHIP_BOX = (23, 310, 1461, 1014)  # (the ship's bounds on the sheet, 4 px of margin)
FEET = ((322, 789), (1325, 1009))

def largest(mask):
    """The largest 8-connected region of a boolean mask (the piece itself, not a neighbour's stray corner)."""
    from collections import deque

    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    best, best_n, n = 0, 0, 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q, cnt = deque([(y0, x0)]), 0
        while q:
            y, x = q.popleft()
            cnt += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
        if cnt > best_n:
            best, best_n = n, cnt
    return lab == best


if __name__ == '__main__':
    keyed = key_checker(np.asarray(Image.open(SRC).convert('RGB')))
    x0, y0, x1, y1 = SHIP_BOX
    ship = Image.fromarray(keyed, 'RGBA').crop(SHIP_BOX)
    # (only the ship: other pieces' stray pixels inside its box cleared)
    a = np.asarray(ship).copy()
    a[..., 3] = np.where(largest(a[..., 3] > 0), a[..., 3], 0)  # (the corridor deck's foot reaches into the box)
    out = ROOT / 'public/assets/mustafar/props/padme_skiff.png'
    Image.fromarray(a, 'RGBA').save(out, optimize=True)
    ax = round((FEET[0][0] + FEET[1][0]) / 2 - x0)
    ay = round((FEET[0][1] + FEET[1][1]) / 2 - y0)
    print(out, ship.size, 'anchor', (ax, ay))
