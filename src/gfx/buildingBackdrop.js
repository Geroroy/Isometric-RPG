// PROTOTYPE (?proto=bg): Coruscant's buildings beyond the platforms from the building sheets
// (assets/backgrounds/buildings → tools/sprites/buildings/{extract,grade,bake}.py → the atlases in
// public/sprites/backdrop/, night-graded and hazed per depth layer offline). Three layers, far → near:
//   far  — landmarks, sparse: a skyline;   mid — city high-rises in dense blocks (avenues between);
//   near — industrial plant, small, under the platforms' edges.
// Each layer is placed once on an isometric lattice (seeded, no building beside its twin), sorted by
// depth (the base's screen y), and drawn into one tileable offscreen canvas; a frame then draws a
// layer as a few copies of its canvas at its parallax offset.
import { RNG } from '../core/math.js';

import { cachedJSON, cachedImage } from './fileCache.js';
const BASE = import.meta.env.BASE_URL;
// on with ?proto=bg, or in a build made with VITE_PROTO_BG=1 (a test build for review)
export const BUILDING_PROTO = import.meta.env.VITE_PROTO_BG === '1' || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('proto') === 'bg');

// lattice cell (CX × CY, 2:1), periods M × N cells (the tile: M·CX × N·CY, at least 1920 × 1080 —
// the widest view, docs/GAME_DESIGN.md 2.1.1 — so no pattern shows twice on a screen), fill share, avenues
// every `ave` cells (0: none), how many lattice steps apart twins stand at least, parallax factor
export const BLAYERS = {
  far: { CX: 96, CY: 48, M: 20, N: 23, fill: 0.26, ave: 0, apart: 2, f: 0.16, seed: 11 },
  mid: { CX: 48, CY: 24, M: 40, N: 45, fill: 0.9, ave: 5, apart: 1, f: 0.25, seed: 23 },
  near: { CX: 80, CY: 40, M: 24, N: 27, fill: 0.36, ave: 0, apart: 2, f: 0.4, seed: 37 },
};

let meta = null;
const atlas = {};
let loading = false;
function load() {
  if (loading) return;
  loading = true;
  cachedJSON(BASE + 'sprites/backdrop/buildings.json')
    .then((m) => Promise.all(Object.entries(m.modes).map(([mode, md]) => cachedImage(BASE + 'sprites/backdrop/' + md.atlas).then((i) => (atlas[mode] = i)))).then(() => (meta = m))) // kept on the device (fileCache.js)
    .catch((e) => console.warn('backdrop buildings: none', e));
}
if (BUILDING_PROTO) load();

const tiles = new Map();
/** One layer's tileable canvas for a mode (built on first use). */
export function layerTile(mode, name) {
  const key = mode + name;
  if (tiles.has(key)) return tiles.get(key);
  if (!meta) return null;
  const L = BLAYERS[name];
  const list = meta.modes[mode].layers[name];
  const img = atlas[mode];
  const TW = L.M * L.CX;
  const TH = L.N * L.CY;
  const rng = new RNG(L.seed + (mode === 'low' ? 101 : 0));
  const placed = new Map(); // "a,b" -> index into list
  const items = [];
  // every lattice point of the torus once: p = a − b in [0, 2M), q = a + b in [0, 2N), same parity
  for (let q = 0; q < 2 * L.N; q++)
    for (let p = q % 2; p < 2 * L.M; p += 2) {
      const a = (p + q) / 2;
      const b = (q - p) / 2;
      if (L.ave && (((a % L.ave) + L.ave) % L.ave === 0 || ((b % L.ave) + L.ave) % L.ave === 0)) continue;
      if (rng.next() > L.fill) continue;
      // a building unlike any placed within `apart` lattice steps (the dense blocks: next door only)
      const near = new Set();
      const R = L.apart;
      for (let da = -R; da <= R; da++) for (let db = -R; db <= R; db++) near.add(placed.get(a + da + ',' + (b + db)));
      let k = 0;
      for (let t = 0; t < 16; t++) {
        k = Math.floor(rng.next() * list.length);
        if (!near.has(k)) break;
      }
      placed.set(a + ',' + b, k);
      const x = (p * L.CX) / 2 + (rng.next() - 0.5) * L.CX * 0.36;
      const y = (q * L.CY) / 2 + (rng.next() - 0.5) * L.CY * 0.36;
      items.push({ x, y, s: list[k] });
    }
  // the copies across the tile's edges, then back to front by the base's screen y
  const draws = [];
  for (const it of items) {
    const [, , w, h] = it.s.rect;
    const [bx, by] = it.s.base;
    for (const dx of [-TW, 0, TW])
      for (const dy of [-TH, 0, TH]) {
        const x0 = Math.round(it.x + dx - bx);
        const y0 = Math.round(it.y + dy - by);
        if (x0 + w < 0 || x0 > TW || y0 + h < 0 || y0 > TH) continue;
        draws.push({ y: it.y + dy, x: it.x + dx, x0, y0, s: it.s });
      }
  }
  draws.sort((u, v) => u.y - v.y || u.x - v.x);
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const x = c.getContext('2d');
  for (const d of draws) {
    const [sx, sy, w, h] = d.s.rect;
    x.drawImage(img, sx, sy, w, h, d.x0, d.y0, w, h);
  }
  tiles.set(key, c);
  return c;
}
