// The Mustafar rebuild's landing pad floor (STAGE 01, docs/MUSTAFAR_REBUILD.md), drawn by the terrain (terrain.js)
// per pixel in world coordinates from EXTERNAL textures (CLAUDE.md: the art is made outside, this only places it).
// The textures are a `groundTiles` asset of the manifest (public/assets/mustafar/manifest.json, docs/ASSETS.md):
// top-down, square-on, no directional light baked in — so the engine's projection lays them exactly at the game's
// 2:1 angle, and a rim piece may be turned to any side. The layout is the zone file's floor entry
// (public/maps/mustafar_v2/stage01.json, world/mustafarStage.js):
//   { x0, y0, x1, y1 }  the pad's top in world metres (its walking plane is the ground, z = 0)
//   rim                 the perimeter band's width (m)
//   bay                 a bay's side (m): the interior is a grid of bays from (x0 + rim, y0 + rim)
//   bays                rows of variant letters, one row per bay along y, one letter per bay along x
//   asset               the manifest id of its textures
// Texture orientation (the asset request, docs/asset_requests/mf.landing.floor.md): a bay's image columns run along
// world +x, rows along +y, its top-left pixel the bay's −x −y corner; the rim strip's columns run along the edge, its
// top row the outer (lava) edge; the corner's top and left edges are the outer ones.
// Without its textures (not delivered yet) the pad shows a DEBUG GRID — a placeholder, never the final look.
import { clamp } from '../core/math.js';

// { [asset id]: { tiles: { bay_A: ImageData, …, rim, corner } } } (gfx/assetManifest.js)
let SETS = {};
export function setPadTextures(t) {
  SETS = t || {};
}

/** Bilinear texel of ImageData `I` at (u, v) in 0..1, clamped to its edges; writes [r, g, b] to `o`. */
function texel(I, u, v, o) {
  const W = I.width;
  const H = I.height;
  const x = clamp(u * W - 0.5, 0, W - 1.001);
  const y = clamp(v * H - 0.5, 0, H - 1.001);
  const x0 = x | 0;
  const y0 = y | 0;
  const ax = x - x0;
  const ay = y - y0;
  const d = I.data;
  const i00 = (y0 * W + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + W * 4;
  const i11 = i01 + 4;
  for (let c = 0; c < 3; c++) o[c] = (d[i00 + c] * (1 - ax) + d[i10 + c] * ax) * (1 - ay) + (d[i01 + c] * (1 - ax) + d[i11 + c] * ax) * ay;
}

const BAY_KEY = { A: 'bay_A', a: 'bay_A2', B: 'bay_B', C: 'bay_C', D: 'bay_D', E: 'bay_E' };
const frac = (v) => ((v % 1) + 1) % 1;

/** Whether pad `F` has its textures (else padAt draws the debug grid). */
export const padHasArt = (F) => !!(F.asset && SETS[F.asset]);

/** The pad's top at world point (fx, fy), if it is on pad `F`: writes [r, g, b] to `o` and returns true. */
export function padAt(F, fx, fy, o) {
  if (fx < F.x0 || fy < F.y0 || fx >= F.x1 || fy >= F.y1) return false;
  const set = F.asset && SETS[F.asset];
  const lx = fx - F.x0;
  const ly = fy - F.y0;
  const W = F.x1 - F.x0;
  const H = F.y1 - F.y0;
  const R = F.rim;
  const B = F.bay;
  // distances from the outer edges (the rim band is where one of them is under R)
  const dx = Math.min(lx, W - lx);
  const dy = Math.min(ly, H - ly);
  if (!set) return debugGrid(F, lx, ly, dx, dy, o);
  const T = set.tiles;
  if (dx < R && dy < R) texel(T.corner, dx / R, dy / R, o);
  else if (dy < R) texel(T.rim, frac((lx - R) / B), dy / R, o); // (a side along x: its strip runs along x)
  else if (dx < R) texel(T.rim, frac((ly - R) / B), dx / R, o); // (a side along y)
  else {
    const bx = Math.floor((lx - R) / B);
    const by = Math.floor((ly - R) / B);
    const row = F.bays[by] || '';
    texel(T[BAY_KEY[row[bx]]] || T.bay_A, (lx - R) / B - bx, (ly - R) / B - by, o);
  }
  return true;
}

/**
 * The placeholder until the floor's art arrives: flat grey, a line every metre, the bays' borders and the rim in a
 * debug cyan, the bays' variant letters' places marked — plainly a development grid, not a floor.
 */
function debugGrid(F, lx, ly, dx, dy, o) {
  const R = F.rim;
  const B = F.bay;
  let r = 86;
  let g = 88;
  let b = 92;
  const m = Math.min(frac(lx), 1 - frac(lx), frac(ly), 1 - frac(ly));
  if (m < 0.025) (r = 62), (g = 64), (b = 68); // every metre
  const inside = dx >= R && dy >= R;
  const bxm = Math.min(frac((lx - R) / B), 1 - frac((lx - R) / B)) * B;
  const bym = Math.min(frac((ly - R) / B), 1 - frac((ly - R) / B)) * B;
  if (!inside) (r = 70), (g = 72), (b = 78); // the rim band
  if ((inside && (bxm < 0.06 || bym < 0.06)) || Math.abs(Math.min(dx, dy) - R) < 0.06) (r = 40), (g = 150), (b = 170); // bay borders, the rim's line
  if (Math.min(dx, dy) < 0.06) (r = 220), (g = 60), (b = 200); // the pad's outer edge
  o[0] = r;
  o[1] = g;
  o[2] = b;
  return true;
}
