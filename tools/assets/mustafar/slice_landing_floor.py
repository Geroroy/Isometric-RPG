"""Cut the delivered landing floor sheet (mf.landing.floor, made externally: docs/asset_requests/mf.landing.floor.md)
into the manifest's tiles. Crop only — no resampling, no colour change (CLAUDE.md "역할 분리").

    python3 tools/assets/mustafar/slice_landing_floor.py  ->  public/assets/mustafar/landing/floor_*.png

The sheet (tools/assets/mustafar/src/landing_floor_sheet.png, 1312 × 1199): six bays in two rows on black gutters,
then the rim strip (its upper part the edge beam's top seen from above, its lower part the beam's truss side face seen
from the front) and a corner drawn at an angle (not top-down: not used — the game mitres the rim at the corners).
Boxes measured on the sheet (the panels' tight bounds against the black gutters).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'tools/assets/mustafar/src/landing_floor_sheet.png'
OUT = ROOT / 'public/assets/mustafar/landing'
BOXES = {
    'floor_bay_A.png': (26, 18, 427, 415),  # plates in a cross, chamfered corners
    'floor_bay_A2.png': (458, 18, 861, 416),  # long plates along x
    'floor_bay_B.png': (894, 21, 1290, 415),  # access hatch
    'floor_bay_C.png': (25, 443, 426, 842),  # two vent grilles
    'floor_bay_D.png': (457, 443, 861, 842),  # cable trench along x
    'floor_bay_E.png': (894, 444, 1290, 843),  # four tie-down rings
    'floor_rim.png': (26, 875, 977, 1033),  # the beam's top: the deck side up, the outer (lava) edge at the bottom
    'floor_side.png': (26, 1033, 977, 1124),  # the beam's truss face, seen from the front, top edge at the deck
}

def trim(lum, box, most=4):
    """A bay's box with the black gutter's anti-aliased fringe taken off: up to `most` px a side while that side's
    line is much darker than the bay (a crop, nothing resampled)."""
    x0, y0, x1, y1 = box
    ref = lum[y0:y1, x0:x1].mean()
    dark = lambda line: line.mean() < 0.6 * ref  # noqa: E731
    for _ in range(most):
        if dark(lum[y0, x0:x1]): y0 += 1
        if dark(lum[y1 - 1, x0:x1]): y1 -= 1
        if dark(lum[y0:y1, x0]): x0 += 1
        if dark(lum[y0:y1, x1 - 1]): x1 -= 1
    return x0, y0, x1, y1


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC).convert('RGB')
    sizes = {}
    lum = np.asarray(sheet.convert('L')).astype(float)
    for name, box in BOXES.items():
        if 'bay' in name:
            box = trim(lum, box)
        tile = sheet.crop(box)
        tile.save(OUT / name, optimize=True)
        sizes[name] = tile.size
    print(json.dumps(sizes))
