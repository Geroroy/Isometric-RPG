"""Guides and canvas numbers for the 2nd-pass asset requests (docs/asset_requests/phase2_review.md: the art worth
replacing or adding once the whole duel was playable). Same projection and density as route_requests.py
(docs/ASSETS.md); a guide is a development aid, not game art.

    python3 tools/assets/mustafar/phase2_requests.py   -> docs/asset_requests/guides/*_guide.png, numbers printed as JSON
"""
import json
from pathlib import Path

from canvas import guide

ROOT = Path(__file__).resolve().parents[3]
G = ROOT / 'docs/asset_requests/guides'

# piece -> world box in metres round its anchor (0, 0) on the lava's surface: x0, y0, z0, x1, y1, z1
PIECES = {
    # rocks standing in the lava off the fighting decks (the film's basalt outcrops and spires), and rock faces that
    # close the view at the map's far edges and the ends of the high-ground bank
    'rock_low': (-1.25, -1, 0, 1.25, 1, 1.6),
    'rock_mid': (-2, -1.5, 0, 2, 1.5, 3.0),
    'rock_spire': (-0.8, -0.8, 0, 0.8, 0.8, 5.0),
    'cliff_x': (-5, -1, 0, 5, 1, 6.0),  # 10 m of rock face along world x
    'cliff_y': (-1, -5, 0, 1, 5, 6.0),  # the same along world y (its own lighting: not a mirror of cliff_x)
}


def main():
    out = {name: guide(G / f'{name}_guide.png', box, (0, 0)) for name, box in PIECES.items()}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
