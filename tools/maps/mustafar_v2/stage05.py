"""Mustafar rebuild, STAGE 05 — the lava river and the moving platforms (docs/MUSTAFAR_REBUILD.md). BLOCKOUT.

    python3 tools/maps/mustafar_v2/stage05.py  ->  public/maps/mustafar_v2/stage05.json

The film (5:48 – 6:28): the collector arm comes down into the lava river and floats — the fight goes on aboard it as it
drifts; it begins to sink: Obi-Wan leaps to a repulsor platform, Anakin to a panning droid, then across onto the
platform; the two clash on one small deck carried downstream to the bank (STAGE 06).

Laid out south of the collector (1 tile = 1 m): the river runs east (+x, downstream) between y 147 and 166, from the
fallen arm (x ≈ 78) to the bank (x ≈ 124, STAGE 06 on its −y side). The river is the zone's surround (lava, blocked);
only the decks are walkable, wherever they drift (world/mustafarStage.js floats and strips, moved by the director):
  the arm adrift   the collector arm, 3 × 22 m along y as it stood (a strip 1.25 m either side of its line)
  the droid        2 m (radius 1.0)
  the platform     3.2 m (radius 1.55: the route test found the film's ~2.4 m too cramped for the fight)
Their sizes and paths are here (`river`); their pictures are the manifest's (`asset`: the droid, the platform; the arm adrift
is the collector arm's), blockout boxes until delivered (gfx/blockout.js, made by the director).
"""
from pathlib import Path
from _zone import light, plate, write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/stage05.json'

Y0, Y1 = 147, 172  # the river's banks
X0, X1 = 70, 140
MID = 159.5  # its middle line, where the decks drift
FAR_TOWERS = [(86, 142.5), (101, 141.5)]  # (clear of the high-ground bank: x 112..136, y 134..147)


def main():
    m = {
        'format': 'mustafar-zone',
        'version': 1,
        'id': 'stage05',
        'stage': 5,
        'title': '무스타파 · 용암 강 · 이동 플랫폼',
        'blockoutNote': 'BLOCKOUT: grey boxes stand in for the art (not requested yet)',
        'floor': [],
        'walk': [],
        'collision': [],
        # the film's row of collectors along the river: more of the collector's tower (the delivered sprite, reused),
        # standing in the lava on the far (−y) side — behind the decks, so never in front of the fighters
        'structures': [{'asset': 'mf.collector.collector_tower', 'x': x, 'y': y} for x, y in FAR_TOWERS],
        'decor': [],
        # signs on the lava (flat: the river is the surround's lava texture, a placeholder)
        'blockout': [{**plate(x, MID + 4.5, 5, 1.2, '용암 강 · 흐름 →'), 'art': 'mf.lava.surface'} for x in (82, 100, 118)],
        'river': {
            'y0': Y0,
            'y1': Y1,
            'raft': {'w': 3, 'd': 22, 'h': 0.35, 'r': 1.25, 'from': {'x': 78, 'y': MID}, 'speed': 0.55},  # the arm adrift: the collector arm itself, along y as it stood (its sprite: mf.collector.arm)
            'droid': {'w': 2, 'd': 2, 'h': 0.6, 'r': 1.0, 'asset': 'mf.river.mining_droid', 'deckZ': 0.12},  # (its cap's top: 0.12 m over the lava)
            'platform': {'w': 3.2, 'd': 3.2, 'h': 0.5, 'r': 1.55, 'speed': 0.7, 'asset': 'mf.river.repulsor_platform', 'deckZ': 0},  # (3.2 m, not the film's ~2.4: the route test found 2.4 too cramped to fight on)
            'end': {'x': 124, 'y': 149.0},  # where the platform comes alongside the bank (STAGE 06)
        },
        'actors': {},
        'triggers': [],
        'camera': {'x0': X0, 'y0': Y0 - 6, 'x1': X1, 'y1': Y1},
        'lights': [light(x, y, 0.2, (255, 130, 50), 200, 0.15) for x in range(76, 140, 9) for y in (Y0 + 3, Y1 - 4)],
        'regions': [{'x': 104, 'y': MID, 'r': 36, 'name': '무스타파 · 용암 강'}],
    }
    write(OUT, m)
    print(f'{OUT}: river x {X0}..{X1}, y {Y0}..{Y1}')


if __name__ == '__main__':
    main()
