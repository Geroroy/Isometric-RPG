// Chunked per-pixel terrain renderer. Ground colors are blended smoothly
// between tiles (no diamond seams), then textured with grain / pebbles,
// paving patterns, roads and craters and finally ordered-dithered to a
// reduced palette for an old-school look. Remastered graphics (gfx/remaster.js) build
// chunks at 2-3× the pixel density in full colour with a finer grain, in workers
// (gfx/terrainWorker.js) while the classic chunks stand in.
import { HALF_W, HALF_H, Z_PX } from '../core/iso.js';
import { BIOME } from '../world/biome.js';
import { valueNoise, hash2, clamp } from '../core/math.js';
import { BUILDING_PROTO } from './buildingBackdrop.js';

const CH = 16; // tiles per chunk side
const CW = CH * 2 * HALF_W; // chunk canvas width (640)
const CHH = CH * 2 * HALF_H; // chunk canvas height (320)

const PAL = {
  [BIOME.DUST]: [172, 156, 128],
  [BIOME.ROCK]: [112, 106, 101],
  [BIOME.CRYSTAL]: [104, 106, 124],
  [BIOME.SCORCH]: [80, 72, 67],
  [BIOME.RUIN]: [146, 152, 164],
  [BIOME.BASE]: [138, 140, 138],
  [BIOME.GRASS]: [134, 132, 82],
  [BIOME.HANGAR]: [150, 108, 74],
  [BIOME.MUSTAFAR]: [88, 84, 82],
  [BIOME.LAVA]: [70, 30, 18],
  [BIOME.ASH]: [52, 46, 44],
  [BIOME.CITY_UP]: [186, 180, 166],
  [BIOME.CITY_LOW]: [70, 66, 62],
  [BIOME.VOID]: [10, 12, 22],
  [BIOME.CITY_MOSAIC]: [84, 86, 98],
  [BIOME.CITY_MUD]: [58, 50, 42],
  [BIOME.CITY_SWAMP]: [46, 54, 36],
  [BIOME.CITY_DIRT]: [92, 82, 66],
  [BIOME.GRATE]: [44, 42, 40],
};
const NEON_VEIN = [[255, 79, 168], [79, 230, 255]]; // the plaza's veins: pink or blue by cell
const ROAD = [128, 108, 84];
const EDGE = [62, 57, 54];

// the undercity street's floor texture (gfx/citySprites.js), sampled in world
// coordinates so it lies flat and tiles: { data: ImageData, tiles }
let FLOOR = null;
// the underworld's ground (gfx/citySprites.js: square textures cut from the concept sheets),
// sampled in world space per biome: a list of variants per biome, picked per cell, `tiles`
// world tiles per repeat
let GROUND = null;
// what the setters were given, for the terrain workers to be set up the same (gfx/terrainPool.js)
export const TEXTURE_INPUTS = {};
/** A canvas here or in a worker (OffscreenCanvas). */
const makeCanvas = (w, h) => {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
};
export function setGroundTextures(g) {
  if (!g) return;
  TEXTURE_INPUTS.ground = g;
  // variants with weights (the plain plate carries most of the floor; grates, vents and the
  // lettered plate are accents), the cell size in tiles; every cell also turns, mirrors and
  // shifts its tone by its own hash, so no two neighbours read the same
  const pick = (entries, tiles) => {
    const list = [];
    for (const [n, w] of entries) if (g[n]) list.push({ T: g[n], w });
    const sum = list.reduce((a, e) => a + e.w, 0);
    let acc = 0;
    for (const e of list) e.upto = acc += e.w / sum;
    return { list, tiles };
  };
  GROUND = {
    [BIOME.CITY_UP]: { ...pick([['metalPlatePlain', 0.6], ['metalPlateAurebesh', 0.25], ['metalPlateVent', 0.15]], 2), gain: 1.22 }, // the terrace: cleaner, lit like day
    [BIOME.CITY_LOW]: pick([['metalPlatePlain', 0.55], ['metalPlateAurebesh', 0.1], ['metalPlateGrate', 0.2], ['metalPlateVent', 0.15]], 2),
    [BIOME.CITY_MOSAIC]: pick([['metalPlatePlain', 0.5], ['metalPlateGrate', 0.3], ['metalPlateVent', 0.2]], 2), // the plaza: more grates
    [BIOME.CITY_MUD]: pick([['mudConduit', 1]], 3),
    [BIOME.CITY_SWAMP]: pick([['swamp', 1]], 3),
    [BIOME.CITY_DIRT]: pick([['dirtTiles', 1]], 3),
  };
  for (const k of Object.keys(GROUND)) if (!GROUND[k].list.length) delete GROUND[k];
}
export function setFloorTexture(f) {
  if (!f) return;
  TEXTURE_INPUTS.floor = f;
  FLOOR = f;
}
// the Mustafar facility's floor tiles (gfx/mustafarFloor.js: { field, edge, corner, trim }, ImageData each, from the
// set's texture sheets), laid out per room by the world's floorPlan (worldgen.js MustafarArena)
let FACILITY = null;
export function setFacilityFloor(t) {
  TEXTURE_INPUTS.facility = t || null;
  FACILITY = t || null;
}
// The landing platform and the outside decks (the facility's floor outside its rooms): big irregular plates cut by
// long straight joints, as the platform in the film and the set photos (reference/color_rots) — four families of
// lines at their own angles, each line nudged off an even spacing; a plate is the cell between them, light worn
// stone or dark slab by its own hash; the joints dark with a lit lip on the side towards the key light
const PLATE_FAMILIES = [
  [0.0, 4.6, 1],
  [Math.PI / 2, 5.4, 2],
  [0.62, 6.8, 3],
  [2.2, 7.6, 4],
].map(([a, sp, seed]) => ({ c: Math.cos(a), s: Math.sin(a), sp, seed }));
const PLATE_LIGHT = [92, 86, 78];
const PLATE_DARK = [46, 42, 39];
function plateFloor(fx, fy, o) {
  let key = 0;
  let joint = Infinity;
  let lip = false;
  for (const f of PLATE_FAMILIES) {
    const t = fx * f.c + fy * f.s;
    const k0 = Math.floor(t / f.sp);
    // the lines near t: k·sp nudged by up to ±0.3 sp
    let k = k0 - 1;
    let pos = (k + (hash2(k, f.seed, 91) - 0.5) * 0.6) * f.sp;
    for (let j = k0; j <= k0 + 2; j++) {
      const pj = (j + (hash2(j, f.seed, 91) - 0.5) * 0.6) * f.sp;
      if (pj <= t) [k, pos] = [j, pj];
      const d = Math.abs(t - pj);
      if (d < joint) [joint, lip] = [d, t > pj];
    }
    key = key * 131 + k;
  }
  const dark = hash2(key, 7, 92) < 0.42;
  const base = dark ? PLATE_DARK : PLATE_LIGHT;
  const tone = 0.9 + 0.2 * hash2(key, 11, 93);
  const mott = 1 + (valueNoise(fx * 1.3, fy * 1.3, 94) - 0.5) * 0.22 + (valueNoise(fx * 4.5, fy * 4.5, 95) - 0.5) * 0.1;
  const sp = hash2(Math.floor(fx * 24), Math.floor(fy * 24), 96);
  let k = tone * mott * (sp > 0.97 ? 0.62 : sp < 0.03 ? 1.18 : 1);
  // weathered as the facility's tiles are (tools/sprites/mustafar_floor: grit, soot, rust, worn joints):
  // the grit, a fine grain over the plate
  k *= 1 + (valueNoise(fx * 13, fy * 13, 97) - 0.5) * 0.2;
  // grime packed along the joints, fading out over a third of a metre
  if (joint < 0.33) k *= 0.74 + 0.26 * (joint / 0.33) ** 0.7;
  // scuffs: fine scratches across each plate at its own angle, in worn bands (boots, crates dragged)
  const sa = hash2(key, 13, 98) * Math.PI;
  const st = (fx * Math.cos(sa) + fy * Math.sin(sa)) * 7 + hash2(key, 17, 99) * 7;
  const scr = Math.abs(st - Math.round(st));
  const worn = valueNoise(fx * 0.9 + key * 0.37, fy * 0.9, 100);
  if (scr < 0.07 && worn > 0.55 && valueNoise(fx * 3, fy * 3 + key, 101) > 0.45) k *= dark ? 1.3 : 1.12;
  // a hairline crack in some plates: a short jagged line from a point near the plate's middle, dark
  if (hash2(key, 19, 102) < 0.45) {
    const ca = hash2(key, 41, 103) * Math.PI;
    const tx = Math.cos(ca);
    const ty = Math.sin(ca);
    const ccx = Math.round(fx / 4) * 4 + (hash2(key, 43, 104) - 0.5) * 2;
    const ccy = Math.round(fy / 4) * 4 + (hash2(key, 47, 104) - 0.5) * 2;
    const along = (fx - ccx) * tx + (fy - ccy) * ty;
    const across = -(fx - ccx) * ty + (fy - ccy) * tx + (valueNoise(along * 2.5, key & 63, 105) - 0.5) * 0.5;
    const len = 0.8 + hash2(key, 53, 104) * 1.4;
    if (Math.abs(along) < len && Math.abs(across) < 0.022 * (1 - Math.abs(along) / len) + 0.006) k *= 0.5;
  }
  // soot: broad soft patches of ash blown off the lava
  const soot = valueNoise(fx * 0.16, fy * 0.16, 115) * 0.65 + valueNoise(fx * 0.7, fy * 0.7, 106) * 0.35;
  if (soot > 0.5) k *= 1 - Math.min(0.42, (soot - 0.5) * 1.6);
  // oil: now and then a dark round spot on a plate
  if (hash2(key, 23, 107) < 0.3) {
    const ox = (hash2(key, 29, 108) - 0.5) * 3;
    const oy = (hash2(key, 31, 109) - 0.5) * 3;
    const cx = Math.round(fx / 4) * 4 + ox;
    const cy = Math.round(fy / 4) * 4 + oy;
    const r = Math.hypot(fx - cx, (fy - cy) * 1.2) / (0.35 + hash2(key, 37, 110) * 0.5) + (valueNoise(fx * 6, fy * 6, 111) - 0.5) * 0.5;
    if (r < 1) k *= 0.62 + 0.38 * r * r;
  }
  if (joint < 0.045) k *= 0.32;
  else if (joint < 0.085 && lip) k *= 1.14;
  // bolts along the joints: a dark head with a lit rim, every 0.8 m beside the line
  else if (joint > 0.12 && joint < 0.2) {
    const bx = fx * 1.25;
    const by = fy * 1.25;
    const d = Math.hypot(bx - Math.round(bx), by - Math.round(by));
    if (d < 0.07) k *= d < 0.045 ? 0.55 : 1.25;
  }
  for (let c = 0; c < 3; c++) o[c] = base[c] * k;
  // rust: warm stains where the damp sat, bleeding from the joints
  const rust = valueNoise(fx * 0.45, fy * 0.45, 112) * valueNoise(fx * 2.1, fy * 2.1, 113) * (joint < 0.5 ? 1.25 : 1);
  if (rust > 0.32) {
    const m = Math.min(0.55, (rust - 0.32) * 2.2);
    const l = (o[0] + o[1] + o[2]) / 3;
    o[0] += (l * 1.45 - o[0]) * m;
    o[1] += (l * 0.92 - o[1]) * m;
    o[2] += (l * 0.6 - o[2]) * m;
  }
}

// Mustafar's lava (tools/sprites/mustafar_lava: an isometric lava tile unprojected to a seamless square), laid in
// world space at two scales mixed by a slow noise so the repeat does not read
let LAVA_TEX = null;
export function setLavaTexture(t) {
  TEXTURE_INPUTS.lava = t || null;
  LAVA_TEX = t || null;
}
const lavaA = [0, 0, 0];
const lavaB = [0, 0, 0];
/** Bilinear, wrapping texel of an ImageData at (u, v) in repeats; writes [r, g, b] to `o`. */
function texel(T, u, v, o) {
  const W = T.width;
  const H = T.height;
  const x = (((u % 1) + 1) % 1) * W - 0.5;
  const y = (((v % 1) + 1) % 1) * H - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const ax = x - x0;
  const ay = y - y0;
  const i00 = (((y0 + H) % H) * W + ((x0 + W) % W)) * 4;
  const i10 = (((y0 + H) % H) * W + ((x0 + 1) % W)) * 4;
  const i01 = (((y0 + 1) % H) * W + ((x0 + W) % W)) * 4;
  const i11 = (((y0 + 1) % H) * W + ((x0 + 1) % W)) * 4;
  const d = T.data;
  for (let c = 0; c < 3; c++) o[c] = (d[i00 + c] * (1 - ax) + d[i10 + c] * ax) * (1 - ay) + (d[i01 + c] * (1 - ax) + d[i11 + c] * ax) * ay;
}

/**
 * The facility floor at a world point inside room `R` (worldgen.js floorPlan), laid out of the set's floor tiles as
 * the film's rooms are: a border `R.edge` tiles wide along the walls of the edge tile (its trim strip to the wall),
 * the corner tile where two walls meet (its stone in the corner), and inside it the chevron field in cells of about
 * `R.cell` tiles, mirrored about the room's middle so the chevrons point inwards from both ends; a
 * corridor (`R.runner`) one runner of the trim tile down its length. In a room with a `pit` its sunken centre behind
 * a step — the step's face showing on the far sides (the camera looks from +x+y), a dark line on the near ones.
 * Writes [r, g, b] to `o`.
 */
function facilityFloor(R, fx, fy, o) {
  const T = FACILITY;
  const x0 = R.x - R.hw;
  const y0 = R.y - R.hh;
  const W = R.hw * 2;
  const H = R.hh * 2;
  const alongX = R.axis === 'x';
  if (R.runner) {
    // the strips run along the corridor: the tile's v along it, u across it
    const across = alongX ? (fy - y0) / H : (fx - x0) / W;
    const along = alongX ? (fx - x0) / H : (fy - y0) / W;
    texel(T.trim, across, along, o);
    return;
  }
  // the border: a band `R.edge` tiles wide along the walls (edge tiles, square, one after another), corner tiles
  // where two meet; inside it the field in cells fitted to about `R.cell`
  const E = R.edge;
  const lx = fx - x0;
  const ly = fy - y0;
  const ex = lx < E ? -1 : lx > W - E ? 1 : 0;
  const ey = ly < E ? -1 : ly > H - E ? 1 : 0;
  if (ex && ey) {
    // the corner tile: its walls are its −u and −v sides
    const a = ex < 0 ? lx / E : (W - lx) / E;
    const b = ey < 0 ? ly / E : (H - ly) / E;
    texel(T.corner, a, b, o);
  } else if (ex) {
    // the edge tile: its wall is its +u side, the band running along v, a whole number of tiles along the wall
    const n = Math.max(1, Math.round((H - 2 * E) / E));
    texel(T.edge, ex > 0 ? 1 - (W - lx) / E : 1 - lx / E, ((ly - E) / (H - 2 * E)) * n, o);
  } else if (ey) {
    const n = Math.max(1, Math.round((W - 2 * E) / E));
    texel(T.edge, ey > 0 ? 1 - (H - ly) / E : 1 - ly / E, ((lx - E) / (W - 2 * E)) * n, o);
  } else {
    const iw = W - 2 * E;
    const ih = H - 2 * E;
    const nx = Math.max(1, Math.round(iw / R.cell));
    const ny = Math.max(1, Math.round(ih / R.cell));
    const gx = ((lx - E) / iw) * nx;
    const gy = ((ly - E) / ih) * ny;
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    const a = gx - cx;
    const b = gy - cy;
    // the chevrons point along the room, towards its middle from either end
    const mid = alongX ? cx < nx / 2 : cy < ny / 2;
    const u = alongX ? b : a;
    const v = alongX ? a : b;
    texel(T.field, u, mid ? v : 1 - v, o);
  }
  if (R.pit) {
    const dA = (alongX ? R.hw : R.hh) - Math.abs(alongX ? fx - R.x : fy - R.y);
    const dC = (alongX ? R.hh : R.hw) - Math.abs(alongX ? fy - R.y : fx - R.x);
    const far = dC <= dA ? (alongX ? fy < R.y : fx < R.x) : alongX ? fx < R.x : fy < R.y;
    const p = Math.min(dA, dC) - R.pit;
    let m = 1;
    if (p >= 0) {
      m = 0.88; // the sunken centre, a little darker
      if (far && p < 0.3) m *= p < 0.06 ? 1.6 : 0.8 + p; // the step's face, its lit lip at the top
    } else if (!far && p > -0.07) m = 0.55;
    o[0] *= m;
    o[1] *= m;
    o[2] *= m;
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

export class Terrain {
  constructor(world) {
    this.world = world;
    const n = world.w * world.h;
    this.R = new Float32Array(n);
    this.G = new Float32Array(n);
    this.B = new Float32Array(n);
    this.P = new Float32Array(n); // paved weight
    this.Rd = new Float32Array(n); // road weight
    this.K = new Float32Array(n); // crystal weight (sparkles)
    this.Bs = new Float32Array(n); // base weight (hazard pattern)
    this.L = new Float32Array(n); // lava weight
    this.V = new Float32Array(n); // the city's drop (dark, far lights)
    this.U = new Float32Array(n); // city upper level (inlaid stone)
    this.Lw = new Float32Array(n); // city lower level (the floor texture)
    this.Mo = new Float32Array(n); // the undercity plaza's neon mosaic
    this.Mu = new Float32Array(n); // the undercity's mud alleys
    this.Gt = new Float32Array(n); // Mustafar catwalk grating
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const i = y * world.w + x;
        const b = world.biome[i];
        let c = world.blocked[i] === 2 && b !== BIOME.LAVA && b !== BIOME.ASH && b !== BIOME.VOID && b !== BIOME.GRATE ? EDGE : PAL[b];
        const v = (valueNoise(x / 3.5, y / 3.5, 7) - 0.5) * 22 + (hash2(x, y, 3) - 0.5) * 8;
        this.R[i] = c[0] + v;
        this.G[i] = c[1] + v;
        this.B[i] = c[2] + v * 0.9;
        this.P[i] = b === BIOME.RUIN || b === BIOME.BASE || b === BIOME.HANGAR || b === BIOME.MUSTAFAR || b === BIOME.CITY_UP || (b === BIOME.CITY_LOW && !FLOOR) ? 1 : 0;
        this.Lw[i] = b === BIOME.CITY_LOW && FLOOR ? 1 : 0;
        this.V[i] = b === BIOME.VOID ? 1 : 0;
        this.U[i] = b === BIOME.CITY_UP ? 1 : 0;
        this.Mo[i] = b === BIOME.CITY_MOSAIC ? 1 : 0;
        this.Mu[i] = b === BIOME.CITY_MUD || b === BIOME.CITY_SWAMP || b === BIOME.CITY_DIRT ? 1 : 0;
        this.Gt[i] = b === BIOME.GRATE ? 1 : 0;
        if (b === BIOME.VOID) {
          // no grain in the drop
          this.R[i] = c[0];
          this.G[i] = c[1];
          this.B[i] = c[2];
        }
        this.L[i] = b === BIOME.LAVA ? 1 : 0;
        this.Bs[i] = b === BIOME.BASE ? 1 : 0;
        this.K[i] = b === BIOME.CRYSTAL ? 1 : 0;
        const rd = world.road[i];
        this.Rd[i] = b === BIOME.BASE ? 0 : clamp(1.7 - rd, 0, 1);
      }
    }
    // the Mustafar interior's room per tile (index into world.floorPlan, −1 none)
    this.room = null;
    if (world.floorPlan) {
      this.room = new Int8Array(n).fill(-1);
      for (let y = 0; y < world.h; y++)
        for (let x = 0; x < world.w; x++) {
          if (world.biome[y * world.w + x] !== BIOME.MUSTAFAR) continue;
          const k = world.floorPlan.findIndex((R) => Math.abs(x + 0.5 - R.x) <= R.hw && Math.abs(y + 0.5 - R.y) <= R.hh);
          this.room[y * world.w + x] = k;
        }
    }
    this.cache = new Map();
    this.frame = 0;
    this.maxChunks = 96; // (0.8 MB each: the view, its edges, the next zoom step out and a lift's far end)
    this.warm = null; // view rectangles (world-screen px) to make ready ahead (renderer.warmTerrain)
    this.warmHurry = false; // a bigger budget a frame (a lift's doors are closing)
    this.S = 1; // pixels per game pixel
    this.low = new Map(); // at a finer density (remastered): the classic chunks shown while the fine ones are built
    this.pool = null; // remastered: the workers building the fine chunks (terrainPool.js; set by the renderer)
  }

  /**
   * The ground's pixels per game pixel (gfx/remaster.js). Going finer, the classic chunks are kept to stand in
   * (draw) while the fine ones are built a few ms a frame — the switch is at once, the detail arrives over a
   * moment; going back, they are the cache again.
   */
  setDensity(S) {
    if (S === this.S) return;
    for (const c of S === 1 ? this.cache.values() : []) if (c.canvas.close) c.canvas.close();
    if (this.S === 1) this.low = this.cache;
    else if (S === 1) this.cache = this.low;
    if (S === 1) this.low = new Map();
    else this.cache = new Map();
    this.S = S;
    this.job = null;
  }

  /** The classic (1×) chunk, built at once if need be (cheap): the stand-in for a fine one not built yet. */
  lowChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.low.get(key);
    if (!c) {
      c = this.buildChunk(cx, cy, 1);
      this.low.set(key, c);
      if (this.low.size > 48) {
        let oldK = null;
        let oldT = Infinity;
        for (const [k, v] of this.low) if (v.used < oldT) [oldT, oldK] = [v.used, k];
        this.low.delete(oldK);
      }
    }
    c.used = this.frame;
    return c;
  }

  sample(arr, u, v) {
    const W = this.world.w;
    const H = this.world.h;
    let i0 = Math.floor(u);
    let j0 = Math.floor(v);
    const tx = u - i0;
    const ty = v - j0;
    const i1 = Math.min(W - 1, Math.max(0, i0 + 1));
    const j1 = Math.min(H - 1, Math.max(0, j0 + 1));
    i0 = Math.min(W - 1, Math.max(0, i0));
    j0 = Math.min(H - 1, Math.max(0, j0));
    const a = arr[j0 * W + i0];
    const b = arr[j0 * W + i1];
    const c = arr[j1 * W + i0];
    const d = arr[j1 * W + i1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  buildChunk(cx, cy, S = this.S) {
    const gen = this.buildGen(cx, cy, S);
    let r;
    while (!(r = gen.next()).done);
    return r.value;
  }

  /**
   * The side of a platform seen below its rim from a pixel over the drop (docs/MAP_EDGES.md):
   * from the pixel's ground point step back up the screen (the −x, −y diagonal) to the first
   * platform tile; the distance k there is the depth D below the rim (D = k·2·HALF_H / Z_PX).
   * Coruscant's platforms are the tops of towers: the face is a facade — durasteel panels, a
   * bright lip, floor bands, lit windows, red warning beacons under the rim — fading into the
   * haze and then to clear. Writes [r, g, b, a] to `out`; false when no platform is close.
   */
  facade(fx, fy, out) {
    const w = this.world;
    const W = w.w;
    let tx = Math.floor(fx);
    let ty = Math.floor(fy);
    let k = 0;
    let face = 0;
    for (let n = 0; n < 40; n++) {
      const kx = fx - tx;
      const ky = fy - ty;
      if (kx < ky) {
        k = kx;
        tx--;
        face = 0; // entered through the tile's +x face (faces the lower right: in shade)
      } else {
        k = ky;
        ty--;
        face = 1; // through its +y face (faces the lower left: lit)
      }
      if (k > 11 || tx < 0 || ty < 0) return false;
      if (w.biome[ty * W + tx] !== BIOME.VOID) break;
      if (n === 39) return false;
    }
    const D = (k * 2 * HALF_H) / Z_PX; // world units below the rim
    const s = face ? fx - k : fy - k; // along the face
    const upper = fy - k < 90; // the upper plaza's tower or the undercity's
    if (BUILDING_PROTO && GROUND) return this.facadePlated(D, s, face, upper, out);
    const lit = face ? 0.92 : 0.62;
    let r = 64;
    let g = 66;
    let b = 76;
    // the tower's floors: pilasters every 1.5 tiles along the face, a slab line every 0.55 units
    // down, and between them a ribbon of windows in segments (lit or dark, warm or cold)
    const ps = (s / 1.5) % 1;
    const fl = (D - 0.5) / 0.55;
    const ff = fl - Math.floor(fl);
    if (ps < 0.08) {
      r += 10;
      g += 10;
      b += 10;
    }
    if (D > 0.5 && ff < 0.16) {
      r -= 20;
      g -= 20;
      b -= 18;
    }
    r += (hash2(Math.floor(s / 1.5), Math.floor(fl / 6), 83) - 0.5) * 10;
    r *= lit;
    g *= lit;
    b *= lit;
    // the lip and the shadow under it
    if (D < 0.09) {
      r = 168 * lit;
      g = 160 * lit;
      b = 146 * lit;
    } else if (D < 0.5) {
      const t = (0.5 - D) / 0.41;
      r *= 1 - 0.55 * t;
      g *= 1 - 0.55 * t;
      b *= 1 - 0.55 * t;
    }
    let wr = 0;
    let wg = 0;
    let wb = 0;
    if (D > 0.6 && ff > 0.42 && ff < 0.7 && ps > 0.1) {
      const seg = Math.floor(s / 0.375);
      const us = s / 0.375 - seg;
      if (us > 0.08) {
        const row = Math.floor(fl);
        const h = hash2(seg, row, 84 + face);
        if (h > (upper ? 0.55 : 0.72)) {
          const c = hash2(seg >> 1, row, 86);
          if (upper) [wr, wg, wb] = c > 0.35 ? [255, 210, 145] : [200, 222, 255];
          else [wr, wg, wb] = c > 0.8 ? [255, 90, 180] : c > 0.5 ? [140, 255, 170] : [255, 170, 80];
          const k2 = (0.45 + 0.4 * hash2(seg, row, 87)) * Math.exp(-D / 6);
          wr *= k2;
          wg *= k2;
          wb *= k2;
        }
      }
    }
    // red warning beacons just under the rim, every few tiles
    if (D > 0.18 && D < 0.42) {
      const cb = Math.floor(s / 3);
      if (hash2(cb, face, 88) > 0.45) {
        const bs = s / 3 - cb;
        if (bs > 0.48 && bs < 0.56) {
          wr = 255;
          wg = 50;
          wb = 40;
        }
      }
    }
    // haze: the facade sinks into the city's air, then clears for the backdrop
    const hz = 1 - Math.exp(-D / 3.2);
    const H = upper ? [70, 54, 74] : [20, 28, 34];
    r += (H[0] - r) * hz + wr;
    g += (H[1] - g) * hz + wg;
    b += (H[2] - b) * hz + wb;
    out[0] = clamp(r, 0, 255);
    out[1] = clamp(g, 0, 255);
    out[2] = clamp(b, 0, 255);
    out[3] = 255 * clamp(1 - (D - 4.5) / 3.5, 0, 1);
    return out[3] > 0;
  }

  /**
   * PROTOTYPE (?proto=bg): the facade built of the ground's tile sprites (the concept sheets'
   * metal plates, public/sprites/underworld/ground): each wall panel is one whole tile stood
   * upright, 2 × 2 units — the floor's own texel size (2 units per tile) — picked, mirrored and
   * toned per panel with the floor's weights, lit as a wall (the lower-left face lit, the
   * lower-right in shade), a bright lip at the top and its shadow; deeper down the panels sink into
   * the city's air as before. No drawn windows: the plates are the wall.
   */
  facadePlated(D, s, face, upper, out) {
    const gt = GROUND[upper ? BIOME.CITY_UP : BIOME.CITY_LOW] || GROUND[BIOME.CITY_LOW];
    const P = 2;
    const cx = Math.floor(s / P);
    const cy = Math.floor(D / P);
    let u = s / P - cx;
    const v = D / P - cy;
    const pickN = hash2(cx, cy + 1000 * face, 71);
    let T = gt.list[gt.list.length - 1].T;
    for (const e of gt.list) if (pickN <= e.upto) { T = e.T; break; }
    if (hash2(cx, cy, 73) > 0.5) u = 1 - u;
    const tx = Math.min(T.width - 1, Math.floor(u * T.width));
    const ty = Math.min(T.height - 1, Math.floor(v * T.height));
    const j = (ty * T.width + tx) * 4;
    const lit = face ? 0.95 : 0.64;
    const tone = (0.86 + 0.26 * hash2(cx, cy, 74)) * lit * (gt.gain || 1);
    let r = T.data[j] * tone;
    let g = T.data[j + 1] * tone;
    let b = T.data[j + 2] * tone;
    const wr = 0;
    const wg = 0;
    const wb = 0;
    // the lip, and the shadow it throws on the first plates
    if (D < 0.09) {
      r = r * 1.6 + 40;
      g = g * 1.55 + 38;
      b = b * 1.5 + 34;
    } else if (D < 0.5) {
      const t = (0.5 - D) / 0.41;
      r *= 1 - 0.5 * t;
      g *= 1 - 0.5 * t;
      b *= 1 - 0.5 * t;
    }
    const hz = 1 - Math.exp(-Math.max(0, D - 1) / 3);
    const H = upper ? [70, 54, 74] : [20, 28, 34];
    r += (H[0] - r) * hz + wr;
    g += (H[1] - g) * hz + wg;
    b += (H[2] - b) * hz + wb;
    out[0] = clamp(r, 0, 255);
    out[1] = clamp(g, 0, 255);
    out[2] = clamp(b, 0, 255);
    out[3] = 255 * clamp(1 - (D - 4.5) / 3.5, 0, 1);
    return out[3] > 0;
  }

  /** The floor's own brightness at a world point, 0..1 (its tile colour before the light map). */
  lumAt(x, y) {
    const w = this.world;
    const tx = Math.max(0, Math.min(w.w - 1, Math.floor(x)));
    const ty = Math.max(0, Math.min(w.h - 1, Math.floor(y)));
    const i = ty * w.w + tx;
    return Math.max(0, Math.min(1, (this.R[i] + this.G[i] + this.B[i]) / 765));
  }

  /** Builds a chunk, yielding every few rows (prefetch spreads it over frames). */
  *buildGen(cx, cy, S = this.S) {
    const hd = S > 1;
    const PW = CW * S;
    const PH = CHH * S;
    const canvas = makeCanvas(PW, PH);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(PW, PH);
    const d = img.data;
    const x0 = cx * CH;
    const y0 = cy * CH;
    const sx0 = (x0 - (y0 + CH)) * HALF_W;
    const sy0 = (x0 + y0) * HALF_H;
    const q = 255 / 30;
    const city = !!this.world.city;
    const fc = [0, 0, 0, 0];
    for (let py = 0; py < PH; py++) {
      const sy = sy0 + py / S;
      for (let px = 0; px < PW; px++) {
        const sx = sx0 + px / S;
        const fx = (sx / HALF_W + sy / HALF_H) / 2;
        const fy = (sy / HALF_H - sx / HALF_W) / 2;
        if (fx < x0 || fx >= x0 + CH || fy < y0 || fy >= y0 + CH) continue;
        if (city && this.world.biome[Math.floor(fy) * this.world.w + Math.floor(fx)] === BIOME.VOID) {
          // the drop: the side of the platform above this pixel, if any is close enough, else
          // clear — the renderer's backdrop (gfx/cityBackdrop.js) shows through
          const i = (py * PW + px) * 4;
          if (this.facade(fx, fy, fc)) {
            d[i] = fc[0];
            d[i + 1] = fc[1];
            d[i + 2] = fc[2];
            d[i + 3] = fc[3];
          }
          continue;
        }
        const u = fx - 0.5;
        const v = fy - 0.5;
        let r = this.sample(this.R, u, v);
        let g = this.sample(this.G, u, v);
        let b = this.sample(this.B, u, v);
        const paved = this.sample(this.P, u, v);
        const road = this.sample(this.Rd, u, v);
        const cry = this.sample(this.K, u, v);
        const base = this.sample(this.Bs, u, v);
        const lava = this.sample(this.L, u, v);
        const drop = 0; // (the drop is drawn by facade() and the backdrop)
        const upper = this.sample(this.U, u, v);
        const grate = this.sample(this.Gt, u, v);
        const mosaic = this.sample(this.Mo, u, v);
        const mud = this.sample(this.Mu, u, v);
        const grain = hd ? hash2(Math.floor(sx * S), Math.floor(sy * S), 99) : hash2(sx, sy, 99);
        const blot = valueNoise(fx * 1.7, fy * 1.7, 13) - 0.5;
        // blotchy mid-frequency variation
        r += blot * 16;
        g += blot * 15;
        b += blot * 13;
        // roads: packed dirt with tracks
        if (road > 0.01) {
          const w = Math.min(1, road * 1.4) * (0.75 + blot * 0.6);
          r += (ROAD[0] - r) * w;
          g += (ROAD[1] - g) * w;
          b += (ROAD[2] - b) * w;
        }
        // paving slabs (ruins / base)
        if (paved > 0.3) {
          const slab = base > 0.5 ? 2 : 1.5;
          const gx = (((fx / slab) % 1) + 1) % 1;
          const gy = (((fy / slab) % 1) + 1) % 1;
          const line = gx < 0.05 || gy < 0.05;
          const crackN = valueNoise(fx * 4, fy * 4, 29);
          if (line) {
            r -= 26 * paved;
            g -= 26 * paved;
            b -= 22 * paved;
          } else if (crackN > 0.78 && base < 0.5) {
            r -= 20;
            g -= 20;
            b -= 18;
          }
          // tile-to-tile tone variation
          const tv = (hash2(Math.floor(fx / slab), Math.floor(fy / slab), 41) - 0.5) * 14 * paved;
          r += tv;
          g += tv;
          b += tv;
          // hazard stripes on base pad edges
          if (base > 0.4 && base < 0.75 && ((Math.floor((fx + fy) * 2) & 1) === 0)) {
            r += (200 - r) * 0.55;
            g += (160 - g) * 0.55;
            b += (40 - b) * 0.55;
          }
        }
        // pebbles / grit
        if (grain > 0.94) {
          const k = cry > 0.5 ? 0.4 : 1;
          r += 22 * k;
          g += 20 * k;
          b += 18 * k;
        } else if (grain < 0.07) {
          r -= 24;
          g -= 24;
          b -= 20;
        }
        // lava: the texture where there is one (Mustafar), else dark crust plates split by glowing molten veins
        if (LAVA_TEX && lava > 0.3) {
          const k = Math.min(1, (lava - 0.3) * 2.5);
          texel(LAVA_TEX, fx / 8, fy / 8, lavaA);
          texel(LAVA_TEX, fx / 11.3 + 0.37, fy / 11.3 + 0.61, lavaB);
          const m = clamp((valueNoise(fx * 0.07, fy * 0.07, 57) - 0.5) * 3 + 0.5, 0, 1);
          r += (lavaA[0] + (lavaB[0] - lavaA[0]) * m - r) * k;
          g += (lavaA[1] + (lavaB[1] - lavaA[1]) * m - g) * k;
          b += (lavaA[2] + (lavaB[2] - lavaA[2]) * m - b) * k;
        } else if (lava > 0.35) {
          const n1 = valueNoise(fx * 0.9, fy * 0.9, 51);
          const n2 = valueNoise(fx * 2.6, fy * 2.6, 52);
          const vein = 1 - Math.abs(n1 - 0.5) * 2; // ridges of the noise
          const hot = clamp((vein * 0.75 + n2 * 0.4 - 0.45) * 3, 0, 1) * clamp((lava - 0.35) * 2, 0, 1);
          r += (255 - r) * hot;
          g += (150 * hot + 60 * hot * hot - g) * hot;
          b += (30 - b) * hot;
        }
        // catwalk grating: a tight mesh of dark bars, lava glowing up through the gaps
        if (grate > 0.5) {
          const gx = (((fx * 3) % 1) + 1) % 1;
          const gy = (((fy * 3) % 1) + 1) % 1;
          if (gx < 0.3 || gy < 0.3) {
            r += 18;
            g += 16;
            b += 14;
          } else {
            r += (120 - r) * 0.5;
            g += (40 - g) * 0.5;
            b += (10 - b) * 0.5;
          }
        }
        // upper city: polished stone with brass inlay lines every 4 tiles
        if (upper > 0.5) {
          const ix = (((fx / 4) % 1) + 1) % 1;
          const iy = (((fy / 4) % 1) + 1) % 1;
          if (ix < 0.02 || iy < 0.02) {
            r += (196 - r) * 0.55;
            g += (164 - g) * 0.55;
            b += (96 - b) * 0.55;
          }
          r += 6;
          g += 6;
          b += 6;
        }
        // the platform's rim (city): a bright lip on the edges over the drop that face the camera,
        // a thin light line on the far edges
        if (city) {
          const tx = Math.floor(fx);
          const ty = Math.floor(fy);
          const ax = fx - tx;
          const ay = fy - ty;
          const vd = (x, y) => this.world.biome[y * this.world.w + x] === BIOME.VOID;
          let lip = 0;
          if ((ax > 0.9 && vd(tx + 1, ty)) || (ay > 0.9 && vd(tx, ty + 1))) lip = 1;
          else if ((ax < 0.05 && vd(tx - 1, ty)) || (ay < 0.05 && vd(tx, ty - 1))) lip = 0.5;
          if (lip) {
            r += (176 - r) * 0.6 * lip;
            g += (168 - g) * 0.6 * lip;
            b += (150 - b) * 0.6 * lip;
          }
        }
        // the underworld's ground textures (the concept sheets' tiles), by the tile's biome:
        // the variant by cell, the texel by world position, shaded by the same blotches
        let texd = false;
        let painted = false; // a painted set texture (the Mustafar facility floor): drawn smooth like the set sprites on it
        if (GROUND) {
          const bi = this.world.biome[Math.floor(fy) * this.world.w + Math.floor(fx)];
          const gt = GROUND[bi];
          if (gt) {
            const cx = Math.floor(fx / gt.tiles);
            const cy = Math.floor(fy / gt.tiles);
            const pickN = hash2(cx, cy, 71);
            let T = gt.list[gt.list.length - 1].T;
            for (const e of gt.list) if (pickN <= e.upto) { T = e.T; break; }
            let u = (((fx / gt.tiles) % 1) + 1) % 1;
            let v = (((fy / gt.tiles) % 1) + 1) % 1;
            const rot = Math.floor(hash2(cx, cy, 72) * 4); // a quarter turn per cell
            if (rot === 1) [u, v] = [1 - v, u];
            else if (rot === 2) [u, v] = [1 - u, 1 - v];
            else if (rot === 3) [u, v] = [v, 1 - u];
            if (hash2(cx, cy, 73) > 0.5) u = 1 - u; // and a mirror
            const tx = Math.min(T.width - 1, Math.floor(u * T.width));
            const ty = Math.min(T.height - 1, Math.floor(v * T.height));
            const j = (ty * T.width + tx) * 4;
            // the cell's own tone, the blotches, and slow stains (oil, rust, damp) across cells
            const stain = valueNoise(fx * 0.33, fy * 0.33, 75) - 0.5;
            const sh = (0.86 + 0.26 * hash2(cx, cy, 74)) * (1 + blot * 0.22) * (1 + stain * 0.5) * (gt.gain || 1);
            r = T.data[j] * sh * (1 + stain * 0.25);
            g = T.data[j + 1] * sh;
            b = T.data[j + 2] * sh * (1 - stain * 0.2);
            texd = true;
          }
        }
        // the Mustafar facility's rooms: the film's floor, laid out per room (facilityFloor)
        if (FACILITY && this.room) {
          const k = this.room[Math.floor(fy) * this.world.w + Math.floor(fx)];
          if (k >= 0) {
            facilityFloor(this.world.floorPlan[k], fx, fy, fc);
            painted = true;
            // wear: the blotches and slow soot stains, faint
            const stain = valueNoise(fx * 0.33, fy * 0.33, 75) - 0.5;
            const sh = (1 + blot * 0.12) * (1 + stain * 0.18);
            r = fc[0] * sh;
            g = fc[1] * sh;
            b = fc[2] * sh;
            texd = true;
          } else if (this.world.biome[Math.floor(fy) * this.world.w + Math.floor(fx)] === BIOME.MUSTAFAR) {
            plateFloor(fx, fy, fc);
            const sh = 1 + blot * 0.1;
            r = fc[0] * sh;
            g = fc[1] * sh;
            b = fc[2] * sh;
            texd = true;
            painted = true;
          }
        }
        // the undercity plaza: cracked mosaic slabs, the cracks glowing neon (pink or blue by
        // cell), grout lines every tile (without the sheet's textures)
        if (mosaic > 0.05 && !texd) {
          const m = Math.min(1, mosaic * 1.3);
          const n1 = valueNoise(fx * 1.35, fy * 1.35, 61);
          const vein = 1 - Math.abs(n1 - 0.5) * 2;
          const crack = clamp((vein - 0.9) * 10, 0, 1) * m;
          const gx = ((fx % 1) + 1) % 1;
          const gy = ((fy % 1) + 1) % 1;
          if (gx < 0.06 || gy < 0.06) {
            r -= 18 * m;
            g -= 18 * m;
            b -= 16 * m;
          }
          if (crack > 0) {
            const c = NEON_VEIN[hash2(Math.floor(fx / 3), Math.floor(fy / 3), 62) > 0.5 ? 1 : 0];
            const k = crack * (0.4 + 0.4 * valueNoise(fx * 3.1, fy * 3.1, 64));
            r += (c[0] - r) * k;
            g += (c[1] - g) * k;
            b += (c[2] - b) * k;
          }
        }
        // the mud alleys: wet earth over conduits, a bluish sheen where it is wettest, ruts
        if (mud > 0.05 && !texd) {
          const m = Math.min(1, mud * 1.3);
          const wet = valueNoise(fx * 2.2, fy * 2.2, 63);
          if (wet > 0.58) {
            const k = clamp((wet - 0.58) * 6, 0, 1) * m;
            r += (70 - r) * k;
            g += (74 - g) * k;
            b += (96 - b) * k;
          }
          const rut = valueNoise(fx * 0.8, fy * 5.5, 65);
          if (rut > 0.72) {
            r -= 14 * m;
            g -= 12 * m;
            b -= 10 * m;
          }
        }
        // the undercity street: the floor texture, shaded by the same blotches
        const lowW = FLOOR && !texd ? this.sample(this.Lw, u, v) : 0;
        if (lowW > 0.01) {
          const T = FLOOR.data;
          const tx = Math.floor((((fx / FLOOR.tiles) % 1) + 1) % 1 * T.width);
          const ty = Math.floor((((fy / FLOOR.tiles) % 1) + 1) % 1 * T.height);
          const j = (ty * T.width + tx) * 4;
          const k = Math.min(1, lowW * 1.5) * (1 - drop);
          const sh = 1 + blot * 0.15;
          r += (T.data[j] * sh - r) * k;
          g += (T.data[j + 1] * sh - g) * k;
          b += (T.data[j + 2] * sh - b) * k;
        }
        // crystal sparkle
        if (cry > 0.5 && grain > 0.994 && blot > 0) {
          r = 150;
          g = 230;
          b = 255;
        }
        const i = (py * PW + px) * 4;
        if (hd || painted) {
          // full colour; a little fine grain in place of the dither
          const fine = (hash2(px + sx0 * S, py + sy0 * S, 7) - 0.5) * 6;
          d[i] = clamp(r + fine, 0, 255);
          d[i + 1] = clamp(g + fine, 0, 255);
          d[i + 2] = clamp(b + fine * 0.9, 0, 255);
          d[i + 3] = 255;
          continue;
        }
        const t = BAYER[(py & 3) * 4 + (px & 3)] * q;
        d[i] = clamp(Math.round((r + t) / q) * q, 0, 255);
        d[i + 1] = clamp(Math.round((g + t) / q) * q, 0, 255);
        d[i + 2] = clamp(Math.round((b + t) / q) * q, 0, 255);
        d[i + 3] = 255;
      }
      if ((py & 7) === 7) yield;
    }
    ctx.putImageData(img, 0, 0);

    // Craters & scorch decals.
    ctx.save();
    ctx.scale(S, S);
    ctx.beginPath();
    ctx.moveTo((x0 - y0) * HALF_W - sx0, 0);
    ctx.lineTo((x0 + CH - y0) * HALF_W - sx0, CH * HALF_H);
    ctx.lineTo((x0 + CH - y0 - CH) * HALF_W - sx0, CHH);
    ctx.lineTo((x0 - y0 - CH) * HALF_W - sx0, CH * HALF_H);
    ctx.closePath();
    ctx.clip();
    for (const c of this.world.craters) {
      if (c.x < x0 - 3 || c.x > x0 + CH + 3 || c.y < y0 - 3 || c.y > y0 + CH + 3) continue;
      const csx = (c.x - c.y) * HALF_W - sx0;
      const csy = (c.x + c.y) * HALF_H - sy0;
      const rx = c.r * HALF_W * 1.414;
      ctx.save();
      ctx.translate(csx, csy);
      ctx.scale(1, 0.5);
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, 'rgba(25,20,18,0.85)');
      grd.addColorStop(0.55, 'rgba(45,38,34,0.6)');
      grd.addColorStop(0.8, 'rgba(160,150,135,0.35)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return { canvas, sx: sx0, sy: sy0 };
  }

  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.cache.get(key);
    if (!c) {
      if (this.job && this.job.key === key) {
        // the prefetch was building this one: finish it now
        let r;
        while (!(r = this.job.gen.next()).done);
        c = r.value;
        this.job = null;
      } else c = this.buildChunk(cx, cy);
      this.insert(key, c);
    }
    c.used = this.frame;
    return c;
  }

  insert(key, c) {
    c.used = this.frame;
    this.cache.set(key, c);
    {
      if (this.cache.size > this.maxChunks) {
        let oldK = null;
        let oldT = Infinity;
        for (const [k, v] of this.cache) {
          if (v.used < oldT) {
            oldT = v.used;
            oldK = k;
          }
        }
        const old = this.cache.get(oldK);
        if (old.canvas.close) old.canvas.close(); // (a worker's ImageBitmap: its memory now)
        this.cache.delete(oldK);
      }
    }
  }

  /** Draw every chunk overlapping the view rectangle (in world-screen px). */
  draw(ctx, vx, vy, vw, vh) {
    this.frame++;
    const nC = Math.ceil(this.world.w / CH);
    // Screen → world for the corners gives the tile range to scan.
    const corners = [
      [vx, vy],
      [vx + vw, vy],
      [vx, vy + vh],
      [vx + vw, vy + vh],
    ].map(([sx, sy]) => [(sx / HALF_W + sy / HALF_H) / 2, (sy / HALF_H - sx / HALF_W) / 2]);
    const minX = Math.floor(Math.min(...corners.map((c) => c[0])) / CH) - 1;
    const maxX = Math.floor(Math.max(...corners.map((c) => c[0])) / CH) + 1;
    const minY = Math.floor(Math.min(...corners.map((c) => c[1])) / CH) - 1;
    const maxY = Math.floor(Math.max(...corners.map((c) => c[1])) / CH) + 1;
    let built = 0;
    const missing = []; // (finer density) chunks in view shown by their classic stand-ins this frame
    const visible = (cx, cy) => {
      const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
      const sy0 = (cx * CH + cy * CH) * HALF_H;
      return !(sx0 > vx + vw || sx0 + CW < vx || sy0 > vy + vh || sy0 + CHH < vy);
    };
    for (let cy = Math.max(0, minY); cy <= Math.min(nC - 1, maxY); cy++) {
      for (let cx = Math.max(0, minX); cx <= Math.min(nC - 1, maxX); cx++) {
        const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
        const sy0 = (cx * CH + cy * CH) * HALF_H;
        if (sx0 > vx + vw || sx0 + CW < vx || sy0 > vy + vh || sy0 + CHH < vy) continue;
        const key = cx + ',' + cy;
        let c = this.cache.get(key);
        if (c) c.used = this.frame;
        else if (this.S > 1) {
          c = this.lowChunk(cx, cy);
          missing.push([cx, cy]);
        } else {
          built++;
          c = this.getChunk(cx, cy);
        }
        ctx.drawImage(c.canvas, Math.round(c.sx - vx), Math.round(c.sy - vy), CW, CHH);
      }
    }
    // Prefetch a chunk a few ms per frame so walking never stalls on building one: those just outside
    // the view, then those of the views asked for ahead (warm: a lift's far end, the next zoom step out)
    if (!built && this.S > 1 && this.pool && !this.pool.failed) {
      // remastered, in workers (terrainPool.js): those in view, then those round it and those of the views
      // asked for ahead — no more than the cache holds
      const extra = [];
      for (let cy = Math.max(0, minY - 1); cy <= Math.min(nC - 1, maxY + 1); cy++)
        for (let cx = Math.max(0, minX - 1); cx <= Math.min(nC - 1, maxX + 1); cx++) if (!visible(cx, cy) && !this.cache.has(cx + ',' + cy)) extra.push([cx, cy]);
      for (const [wx, wy, ww, wh] of this.warm || [])
        for (let cy = 0; cy < nC; cy++)
          for (let cx = 0; cx < nC; cx++) {
            const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
            const sy0 = (cx * CH + cy * CH) * HALF_H;
            if (sx0 > wx + ww || sx0 + CW < wx || sy0 > wy + wh || sy0 + CHH < wy) continue;
            const c = this.cache.get(cx + ',' + cy);
            if (c) c.used = this.frame;
            else extra.push([cx, cy]);
          }
      const room = Math.max(0, this.maxChunks - 2 - this.cache.size - missing.length);
      this.pool.want(missing.concat(extra.slice(0, room)), this.S);
      return built;
    }
    if (!built) {
      const fresh = (cx, cy) => this.cache.has(cx + ',' + cy);
      const start = (cx, cy) => (this.job = { key: cx + ',' + cy, gen: this.buildGen(cx, cy) });
      // the fine chunks in view first (their stand-ins showing meanwhile), in a bigger budget
      if (!this.job && missing.length) start(...missing[0]);
      if (!this.job) {
        for (let cy = Math.max(0, minY - 1); cy <= Math.min(nC - 1, maxY + 1) && !this.job; cy++) {
          for (let cx = Math.max(0, minX - 1); cx <= Math.min(nC - 1, maxX + 1); cx++) {
            if (fresh(cx, cy) || visible(cx, cy)) continue;
            const pad = 160;
            const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
            const sy0 = (cx * CH + cy * CH) * HALF_H;
            if (sx0 > vx + vw + pad || sx0 + CW < vx - pad || sy0 > vy + vh + pad || sy0 + CHH < vy - pad) continue;
            start(cx, cy);
            break;
          }
        }
      }
      if (this.warm) {
        // (the chunks already made there are kept as if in view: the cache does not drop and remake them)
        for (const [wx, wy, ww, wh] of this.warm)
          for (let cy = 0; cy < nC; cy++)
            for (let cx = 0; cx < nC; cx++) {
              const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
              const sy0 = (cx * CH + cy * CH) * HALF_H;
              if (sx0 > wx + ww || sx0 + CW < wx || sy0 > wy + wh || sy0 + CHH < wy) continue;
              const c = this.cache.get(cx + ',' + cy);
              if (c) c.used = this.frame;
              else if (!this.job) start(cx, cy);
            }
      }
      if (this.job) {
        const end = performance.now() + (this.warmHurry || missing.length ? 8 : 4);
        let r;
        do r = this.job.gen.next();
        while (!r.done && performance.now() < end);
        if (r.done) {
          this.insert(this.job.key, r.value);
          this.job = null;
        }
      }
    }
    return built;
  }

  /** Small RGB image of the whole map for the minimap (1px per tile). */
  minimapImage() {
    const W = this.world.w;
    const H = this.world.h;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      let r = this.R[i];
      let g = this.G[i];
      let b = this.B[i];
      if (this.Rd[i] > 0.5) {
        r = ROAD[0];
        g = ROAD[1];
        b = ROAD[2];
      }
      if (this.world.blocked[i] === 1) {
        r *= 0.6;
        g *= 0.6;
        b *= 0.6;
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
