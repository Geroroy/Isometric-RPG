"""Cut the delivered STAGE 01 structures sheet (tools/assets/mustafar/src/landing_structures_sheet.png, made externally
for docs/asset_requests/chatgpt_stage01_structures.md) — key its painted checker background (key_checker.py) and crop.
Nothing is resampled or recoloured; the sheet's scale is taken into the manifest as each piece's `density` instead.

    python3 tools/assets/mustafar/slice_landing_structures.py

Measured on the sheet (screen slope of a piece's long ground edge; the game's 2:1 axes slope 0.5):
  railings ~0.63, corridor deck and walls ~1.0 -> not at the game's projection: NOT exported (they would not line up
  with the pad's edges or join end to end; fixing them means warping, which needs the user's approval)
Second pass (src/landing_structures_sheet_v2.png, drawn over the projection guides):
  railing 1: long edge slope 0.53 (2:1 is 0.5) — close: exported as rail_x, as delivered. Its near ground edge spans
  557 px for 6 m -> density 4.64 (depth 0.37 m, height 1.1 m); anchor = that edge's middle moved half the depth back.
  railing 2: slope 0.55, the same direction again (no rail_y yet): not used. Corner post: free-standing, exported at
  the railing's density, anchor = its base's middle (the near base corner (1359, 372) moved up half the base).
  corridor (floor; walls with floor): long edges slope ~0.75, still not 2:1: not used.
Third pass (src/landing_structures_sheet_v3.png): rail_y — slope −0.526, the mirror of rail_x: exported; its sheet
  width 647 px = (6 m + 0.37 m depth) -> density 5.08, anchor = its footprint's middle (the near-left base corner
  (66, 473) moved by half the run and half the depth). The corridor as flat pictures, at one scale among them (with
  the corridor 6 m wide: floor 805 x 368 -> 13.1 m long; back wall 1046 x 283 -> 13.1 x 3.55 m; end wall 416 x 249
  -> 6 x 3.59 m; front wall 1505 x 119 -> 13.1 x 1.04 m): exported as cut, the engine stands the walls up
  (assetManifest.js wallElevation).
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
SRC2 = ROOT / 'tools/assets/mustafar/src/landing_structures_sheet_v2.png'
SRC3 = ROOT / 'tools/assets/mustafar/src/landing_structures_sheet_v3.png'
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
    # the second pass: railing 1 and the corner post
    keyed2 = Image.fromarray(key_checker(np.asarray(Image.open(SRC2).convert('RGB'))), 'RGBA')
    for name, box, anchor in (('landing/rail_x.png', (61, 15, 661, 430), (361, 268)), ('landing/rail_corner.png', (1234, 85, 1489, 377), (1359, 310))):
        piece = keyed2.crop(box)
        a = np.asarray(piece).copy()
        a[..., 3] = np.where(largest(a[..., 3] > 0), a[..., 3], 0)
        Image.fromarray(a, 'RGBA').save(ROOT / 'public/assets/mustafar' / name, optimize=True)
        print(name, piece.size, 'anchor', (anchor[0] - box[0], anchor[1] - box[1]))
    # the third pass: rail_y and the corridor's flat pictures
    keyed3 = Image.fromarray(key_checker(np.asarray(Image.open(SRC3).convert('RGB'))), 'RGBA')
    for name, box in (
        ('landing/rail_y.png', (18, 8, 673, 478)),
        ('corridors/landing_corridor_floor.png', (719, 73, 1524, 441)),
        ('corridors/landing_corridor_wall_back.png', (6, 511, 1052, 794)),
        ('corridors/landing_corridor_wall_end.png', (1106, 525, 1522, 774)),
        ('corridors/landing_corridor_wall_front.png', (11, 859, 1516, 978)),
    ):
        piece = keyed3.crop(box)
        a = np.asarray(piece).copy()
        a[..., 3] = np.where(largest(a[..., 3] > 0), a[..., 3], 0)
        Image.fromarray(a, 'RGBA').save(ROOT / 'public/assets/mustafar' / name, optimize=True)
        print(name, piece.size)
