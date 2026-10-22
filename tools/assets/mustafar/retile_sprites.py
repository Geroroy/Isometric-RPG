"""Retile a zone's large set sprites: cut each one into tiles, trim each tile to its opaque pixels, drop the
empty ones, and pack the tiles into new atlas pages.

Why: the Movie Duels whole map (md_full) is drawn as 424 occlusion "bands" — every piece of scenery 1 m deep
in sort order, cut by the bounding box of all its pixels across the whole map. A band is mostly transparent
(up to ~1900 game px wide, a few thin walls in it), so the picture drew ~47-54× the screen's area in sprite
pixels a frame and held 8 atlas pages of 4096² (512 MB decoded) — the lag on the Mustafar map. Tiled and
trimmed, the same pixels fit ~10-20% of the area, and only the tiles on screen are drawn.

Every tile keeps its band's structure position (x, y) and all its manifest fields (layer, occlusion, sort
offset, density); only file, rect, size and anchor change, so the depth order and the look are the same
(tiles of one band tie in sort order and are listed in the band's place: a stable sort keeps them so).
A band's occlusion fade (fadeOverActors) now fades the tiles over the player rather than the whole band.

    python3 tools/assets/mustafar/retile_sprites.py <assets/mustafar> <zone.json> [--prefix mf.mdfull.]
        [--tile 256] [--out-pages md_full/sprites_tiled] [--quality 92]

Rewrites <assets/mustafar>/manifest.json and <zone.json> in place (the old pages are left for removal).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
PAGE = 4096
PAD = 2  # transparent px between tiles in a page (smooth sampling never reaches a neighbour)
KEEP = ('kind', 'status', 'density', 'layer', 'footprint', 'occlusion', 'sortOffset', 'lighting')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root', help='the assets/mustafar folder (manifest.json and its files)')
    ap.add_argument('zone', help='the zone json whose structures use the sprites')
    ap.add_argument('--prefix', default='mf.mdfull.')
    ap.add_argument('--tile', type=int, default=256)
    ap.add_argument('--out-pages', default='md_full/sprites_tiled')
    ap.add_argument('--quality', type=int, default=92)
    a = ap.parse_args()

    man_path = os.path.join(a.root, 'manifest.json')
    man = json.load(open(man_path, encoding='utf-8'))
    zone = json.load(open(a.zone, encoding='utf-8'))
    by_id = {e['id']: e for e in man['assets']}
    used = [s['asset'] for s in zone['structures']]
    todo = [i for i in dict.fromkeys(used) if i.startswith(a.prefix) and by_id[i].get('kind') == 'sprite' and by_id[i].get('rect')]
    if not todo:
        raise SystemExit('nothing to retile')

    pages = {}

    def page(f):
        if f not in pages:
            pages[f] = np.asarray(Image.open(os.path.join(a.root, f)).convert('RGBA'))
        return pages[f]

    T = a.tile
    tiles = {}  # asset id -> [(new id, rgba array, x0, y0 in the sprite)]
    src_px = out_px = 0
    for aid in todo:
        e = by_id[aid]
        x, y, w, h = e['rect']
        img = page(e['file'])[y:y + h, x:x + w]
        src_px += w * h
        alpha = img[..., 3] > 0
        out = []
        for ty in range(0, h, T):
            for tx in range(0, w, T):
                m = alpha[ty:ty + T, tx:tx + T]
                if not m.any():
                    continue
                rows = np.nonzero(m.any(1))[0]
                cols = np.nonzero(m.any(0))[0]
                # the opaque bbox, one px wider where the sprite has it (the smooth edge samples its neighbour)
                x0 = max(0, tx + cols[0] - 1)
                x1 = min(w, tx + cols[-1] + 2)
                y0 = max(0, ty + rows[0] - 1)
                y1 = min(h, ty + rows[-1] + 2)
                out.append((f'{aid}~{len(out)}', img[y0:y1, x0:x1], x0, y0))
                out_px += (x1 - x0) * (y1 - y0)
        tiles[aid] = out

    # shelf-pack, tallest first
    allt = [t for aid in todo for t in tiles[aid]]
    order = sorted(range(len(allt)), key=lambda i: -allt[i][1].shape[0])
    sheets = [np.zeros((PAGE, PAGE, 4), np.uint8)]
    place = {}
    cx = cy = rowh = 0
    for i in order:
        t = allt[i][1]
        th, tw = t.shape[:2]
        if cx + tw > PAGE:
            cx, cy, rowh = 0, cy + rowh + PAD, 0
        if cy + th > PAGE:
            sheets.append(np.zeros((PAGE, PAGE, 4), np.uint8))
            cx = cy = rowh = 0
        sheets[-1][cy:cy + th, cx:cx + tw] = t
        place[allt[i][0]] = (len(sheets) - 1, cx, cy, tw, th)
        cx += tw + PAD
        rowh = max(rowh, th)
    # the last page cut to its used height (rounded up to 4)
    used_h = cy + rowh
    files = []
    for n, s in enumerate(sheets):
        if n == len(sheets) - 1:
            s = s[: min(PAGE, (used_h + 3) // 4 * 4)]
        f = f'{a.out_pages}_{n}.webp'
        os.makedirs(os.path.dirname(os.path.join(a.root, f)), exist_ok=True)
        Image.fromarray(s, 'RGBA').save(os.path.join(a.root, f), quality=a.quality, method=6, alpha_quality=100)
        files.append(f)

    # manifest: each retiled sprite becomes its tiles (same fields, own file/rect/size/anchor)
    new_assets = []
    for e in man['assets']:
        if e['id'] not in tiles:
            new_assets.append(e)
            continue
        for tid, t, x0, y0 in tiles[e['id']]:
            p, px, py, tw, th = place[tid]
            # (the fields the game reads; the band's name, source and notes stay with its tileOf id)
            n = {k: e[k] for k in KEEP if k in e}
            n.update(id=tid, file=files[p], rect=[px, py, tw, th], size=[tw, th], anchor=[e['anchor'][0] - x0, e['anchor'][1] - y0], tileOf=e['id'])
            new_assets.append(n)
    man['assets'] = new_assets
    # zone: each structure using a retiled sprite becomes one structure per tile, in its place
    st = []
    for s in zone['structures']:
        if s['asset'] in tiles:
            st.extend({**s, 'asset': tid} for tid, *_ in tiles[s['asset']])
        else:
            st.append(s)
    zone['structures'] = st
    json.dump(man, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(zone, open(a.zone, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(todo)} sprites -> {len(allt)} tiles; {src_px / 1e6:.1f} -> {out_px / 1e6:.1f} Mpx; '
          f'{len(set(by_id[i]["file"] for i in todo))} pages -> {len(files)} ({", ".join(files)})')


if __name__ == '__main__':
    main()
