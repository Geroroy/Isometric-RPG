"""Mustafar rebuild — the BLANK map (the main menu's '무스타파 빈 맵'): the zones' lava and nothing else, for building a
map by hand in the map editor (F2: floors, props, the way, lights; src/ui/mapEditor.js). Asked by the user.

    python3 tools/maps/mustafar_v2/blank.py  ->  public/maps/mustafar_v2/blank.json

The same zone format and lava as STAGE 01 (stage01.py), every other layer empty: no floor, no walkable ground (the
editor's floors open the tiles they cover; the way brush paints the rest), no structures, no lights but the lava's
glow, no actors but Anakin standing in the middle of the world map. What is built is the editor's edit
(mustafar_blank_edit.json), kept in the browser and handed over with ⬇ — this file stays empty.
"""
from pathlib import Path

from _zone import write

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/maps/mustafar_v2/blank.json'

MID = 96  # (the 192 × 192 world map's middle)

m = {
    'format': 'mustafar-zone',
    'version': 1,
    'id': 'blank',
    'stage': 0,
    'title': '무스타파 · 빈 맵',
    'ambient': [150, 86, 70],
    'grade': 'mustafar',
    'surround': {'biome': 'LAVA', 'asset': 'mf.lava.surface', 'note': 'the delivered lava tile, as the stages have it'},
    'floor': [],
    'walk': [],
    'collision': [],
    'structures': [],
    'decor': [],
    'backdrop': None,
    'actors': {'anakin': {'x': MID + 0.5, 'y': MID + 0.5}},
    'triggers': [],
    'camera': {'x0': 4, 'y0': 4, 'x1': 188, 'y1': 188},
    'lights': [],
    'regions': [{'x': MID, 'y': MID, 'r': 90, 'name': '무스타파 · 빈 맵'}],
}

if __name__ == '__main__':
    write(OUT, m)
    print('wrote', OUT.relative_to(ROOT))
