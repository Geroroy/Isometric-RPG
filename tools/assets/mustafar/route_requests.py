"""Canvas sizes, anchors and projection guides for the STAGE 01–06 sprite requests that follow the blockout
(docs/asset_requests/chatgpt_route_*.md; the geometry: tools/maps/mustafar_v2/stage0N.py). Every piece is drawn by the
artist inside its guide at the game's 2:1 projection and density 2 (docs/ASSETS.md); the guide is a development aid,
not game art.

    python3 tools/assets/mustafar/route_requests.py   -> docs/asset_requests/guides/*.png, numbers printed as JSON
"""
import json
import math
from pathlib import Path

from canvas import ZPX, canvas, guide, screen

ROOT = Path(__file__).resolve().parents[3]
G = ROOT / 'docs/asset_requests/guides'

# piece -> (world box in metres round its anchor (0, 0, 0): x0, y0, z0, x1, y1, z1)
PIECES = {
    # STAGE 01: the robes thrown down before the duel (flat on the deck)
    'robe_obiwan': (-0.7, -0.5, 0, 0.7, 0.5, 0.25),
    'cloak_anakin': (-0.8, -0.55, 0, 0.8, 0.55, 0.25),
    # STAGE 03: the control room
    'ctl_stairs': (-2, -1, 0, 2, 1, 0.6),  # 4 m wide, 2 m deep, rising 0.6 m toward −y (the gallery)
    'ctl_shield_generator': (-0.7, -1.4, 0, 0.7, 1.4, 1.8),  # against the −x wall, its face to +x
    'ctl_holo_table': (-0.8, -0.8, 0, 0.8, 0.8, 0.9),
    # STAGE 04: the walkway and the lava collector
    'catwalk_segment': (-3, -1, -0.6, 3, 1, 1.1),  # 6 m of catwalk along x, its deck at z 0, girders hanging below
    'catwalk_broken': (-3, -1, -0.6, 3, 1, 1.1),  # the same, torn off at its +x end
    'lava_fall': (-3, -0.5, 0, 3, 0.5, 8),  # a cliff with lava falling, 6 m along x
    'pipe_segment': (-0.45, -3.5, -0.45, 0.45, 3.5, 0.35),  # 7 m of service pipe along y, half sunk in the lava
    'collector_arm': (-1.5, -11, -0.5, 1.5, 11, 0.3),  # 22 m along y, its deck top at z 0.3
    'collector_tower': (-2, -2, 0, 2, 2, 8),
    # STAGE 05: the river's decks (deck tops at the lava's level, z 0)
    'mining_droid': (-1, -1, -0.5, 1, 1, 0.15),
    'repulsor_platform': (-1.6, -1.6, -0.4, 1.6, 1.6, 1.2),
}


def bank_guide(path, density=2, margin=16):
    """STAGE 06's bank as one pre-rendered ground picture (a `groundImage`): x 112..136, y 134..147 — the top 1.4 m up
    (y 134..141), the slope down to the shore (y 141..145), the shore at the lava's level (y 145..147), a rock face
    behind rising to 4.4 m. Guide lines: the footprint at the lava's level (cyan), the top's outline (orange), the
    slope's foot and the rock face's crest (grey), the anchor (red: world (112, 147), the near-left corner at the lava)."""
    from PIL import Image, ImageDraw

    X0, X1, Y0, Y1, TOP, FOOT = 112, 136, 134, 147, 141, 145
    pts = [screen(x, y, z) for x in (X0, X1) for y in (Y0, Y1) for z in (0, 4.4)]
    lo = (min(p[0] for p in pts) - margin / density, min(p[1] for p in pts) - margin / density)
    hi = (max(p[0] for p in pts) + margin / density, max(p[1] for p in pts) + margin / density)
    w = math.ceil((hi[0] - lo[0]) * density / 8) * 8
    h = math.ceil((hi[1] - lo[1]) * density / 8) * 8
    P = lambda x, y, z=0.0: ((screen(x, y, z)[0] - lo[0]) * density, (screen(x, y, z)[1] - lo[1]) * density)  # noqa: E731
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for gx in range(X0, X1 + 1):
        d.line([P(gx, Y0), P(gx, Y1)], fill=(120, 120, 120, 90))
    for gy in range(Y0, Y1 + 1):
        d.line([P(X0, gy), P(X1, gy)], fill=(120, 120, 120, 90))
    d.line([P(X0, Y0), P(X1, Y0), P(X1, Y1), P(X0, Y1), P(X0, Y0)], fill=(0, 220, 255, 255), width=2)
    d.line([P(X0, Y0, 1.4), P(X1, Y0, 1.4), P(X1, TOP, 1.4), P(X0, TOP, 1.4), P(X0, Y0, 1.4)], fill=(255, 160, 40, 255), width=2)
    d.line([P(X0, FOOT), P(X1, FOOT)], fill=(200, 200, 200, 255), width=2)  # the slope's foot
    d.line([P(X0, Y0, 4.4), P(X1, Y0, 4.4)], fill=(200, 200, 200, 255), width=2)  # the rock face's crest
    for x in (X0, X1):
        d.line([P(x, Y0, 0), P(x, Y0, 4.4)], fill=(200, 200, 200, 160))
        d.line([P(x, TOP, 0), P(x, TOP, 1.4)], fill=(200, 200, 200, 160))
    ax, ay = P(X0, Y1)
    d.line([(ax - 8, ay), (ax + 8, ay)], fill=(255, 40, 40, 255), width=2)
    d.line([(ax, ay - 8), (ax, ay + 8)], fill=(255, 40, 40, 255), width=2)
    im.save(path)
    return {'size': [w, h], 'anchor': [round(ax), round(ay)], 'density': density, 'anchorWorld': [X0, Y1]}


def main():
    out = {}
    for name, box in PIECES.items():
        out[name] = guide(G / f'{name}_guide.png', box, (0, 0))
    out['highground_bank'] = bank_guide(G / 'highground_bank_guide.png')
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
