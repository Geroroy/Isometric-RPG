"""Guides and canvas numbers for the film pass 1 requests (docs/asset_requests/chatgpt_film_pass1.md: the pieces the
film comparison of the landing pad, the entry corridor, the control room and the conference room needs). Same
projection and density as phase2_requests.py (docs/ASSETS.md); a guide is a development aid, not game art.

    python3 tools/assets/mustafar/film_pass1_requests.py   -> docs/asset_requests/guides/*_guide.png, numbers as JSON
"""
import json
from pathlib import Path

from canvas import guide

ROOT = Path(__file__).resolve().parents[3]
G = ROOT / 'docs/asset_requests/guides'

# piece -> world box in metres round its anchor (0, 0) on the floor: x0, y0, z0, x1, y1, z1 (the zone files place each
# by that anchor: tools/maps/mustafar_v2/stage01.py, stage02.py, stage03.py)
PIECES = {
    'ctl_long_table': (-3.5, -1, 0, 3.5, 1, 1.0),  # the control room's central holo-table, long along world x
    'corr_frame_far': (-0.175, -0.25, 0, 0.175, 0.25, 3.3),  # a slanted frame against the corridor's far wall
    'corr_frame_near': (-0.175, -0.25, 0, 0.175, 0.25, 0.9),  # its base on the near side, cut low
    'ctl_door_pillar': (-0.4, -0.45, 0, 0.4, 0.45, 1.3),  # a door pillar at the control room's entry, cut low
    'conf_table_long': (-6, -1, 0, 6, 1, 0.8),  # the conference table in one piece, 12 m along world x
    'guide_light': (-0.2, -0.2, 0, 0.2, 0.2, 0.1),  # a small lamp set in the landing pad
}


def main():
    out = {name: guide(G / f'{name}_guide.png', box, (0, 0)) for name, box in PIECES.items()}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
