// Chunked per-pixel terrain renderer. Ground colors are blended smoothly
// between tiles (no diamond seams), then textured with grain / pebbles,
// paving patterns, roads and craters and finally ordered-dithered to a
// reduced palette for an old-school look. Remaster graphics (density 2) build
// chunks at twice the pixel density in full colour with a finer grain.
//
// Commandos graphics (`painted`) go further, after Commandos 2's hand-painted
// maps: layered colour variation and brush-stroke texture, lit pebbles, and
// the world's static props — buildings, rocks, crates, pads — baked straight
// into the ground chunks together with their soft cast shadows and contact
// darkening, so the map reads as one painted background. The renderer then
// redraws a prop over a unit only where the prop hides it (occlusion masks).
import { HALF_W, HALF_H } from '../core/iso.js';
import { BIOME } from '../world/worldgen.js';
import { valueNoise, hash2, clamp } from '../core/math.js';

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
};
const ROAD = [128, 108, 84];
const EDGE = [62, 57, 54];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

// Cast shadow shape (Commandos): x' = x - SHEAR·y, y' = SQUASH·y, y up < 0.
const SHEAR = 0.8;
const SQUASH = 0.36;

/** Screen rectangle a baked prop paints: its sprite plus its cast shadow. */
function paintRect(p) {
  const f = p.frame;
  const k = f.k || 1;
  const x = p.sx - f.ox * k;
  const y = p.sy - f.oy * k;
  const w = f.w * k;
  const h = f.h * k;
  const up = Math.max(0, f.oy * k); // height above the foot
  return [x - 8, y - 8, w + up * SHEAR + 16, h + 16];
}

const silhouettes = new WeakMap();
const SIL_PAD = 4;
/**
 * A frame's shape in solid black, softened by a small box blur done once
 * here (canvas filters are slow or missing on some phones). Cached per frame;
 * the canvas is padded by SIL_PAD frame pixels on every side.
 */
function silhouette(f) {
  let c = silhouettes.get(f);
  if (c) return c;
  const P = SIL_PAD;
  const w = Math.max(1, f.w) + P * 2;
  const h = Math.max(1, f.h) + P * 2;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(f.page, f.sx, f.sy, f.w, f.h, P, P, f.w, f.h);
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  const R = f.k ? 3 : 2;
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        let sum = 0;
        let n = 0;
        for (let k = -R; k <= R; k++) {
          const q = xx + k;
          if (q < 0 || q >= w) continue;
          sum += a[y * w + q];
          n++;
        }
        tmp[y * w + xx] = sum / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        let sum = 0;
        let n = 0;
        for (let k = -R; k <= R; k++) {
          const q = y + k;
          if (q < 0 || q >= h) continue;
          sum += tmp[q * w + xx];
          n++;
        }
        a[y * w + xx] = sum / n;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = 12;
    d[i * 4 + 1] = 9;
    d[i * 4 + 2] = 7;
    d[i * 4 + 3] = a[i];
  }
  x.putImageData(img, 0, 0);
  silhouettes.set(f, c);
  return c;
}

/**
 * Lit pebble at a screen point (game px): + on the sunlit upper left of a
 * stone, − on its shaded side and in the small shadow it drops. 0 elsewhere.
 */
function pebble(sx, sy) {
  const C = 7;
  const cx = Math.floor(sx / C);
  const cy = Math.floor(sy / C);
  const h = hash2(cx, cy, 91);
  if (h < 0.72) return 0;
  const r = 0.8 + hash2(cx, cy, 92) * 1.6;
  const ox = cx * C + 2 + hash2(cx, cy, 93) * (C - 4);
  const oy = cy * C + 2 + hash2(cx, cy, 94) * (C - 4);
  const dx = sx - ox;
  const dy = (sy - oy) * 1.5;
  const d = Math.hypot(dx, dy);
  if (d < r) return 26 * (1 - d / r) * (-(dx + dy) / (r * 1.4)) + 4;
  const sdx = dx - 0.9;
  const sdy = dy - 0.7;
  if (Math.hypot(sdx, sdy) < r) return -16;
  return 0;
}

/**
 * Grass tuft at a screen point: short upright blades, light at the tip and
 * dark at the root, scattered in small cells. Brightness offset, 0 if none.
 */
function tuft(sx, sy) {
  const cx = Math.floor(sx / 3);
  const cy = Math.floor(sy / 4);
  const h = hash2(cx, cy, 95);
  if (h < 0.45) return -3;
  const bx = cx * 3 + Math.floor(hash2(cx, cy, 96) * 3);
  if (Math.floor(sx) !== bx) return 0;
  const len = 1.5 + h * 2.5;
  const y = sy - cy * 4;
  if (y > len) return 0;
  return y < len * 0.45 ? 18 : -12;
}

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
    this.Gr = new Float32Array(n); // grass (painted tufts)
    this.Rk = new Float32Array(n); // bare rock (painted cracks)
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const i = y * world.w + x;
        const b = world.biome[i];
        let c = world.blocked[i] === 2 && b !== BIOME.LAVA && b !== BIOME.ASH && b !== BIOME.VOID ? EDGE : PAL[b];
        const v = (valueNoise(x / 3.5, y / 3.5, 7) - 0.5) * 22 + (hash2(x, y, 3) - 0.5) * 8;
        this.R[i] = c[0] + v;
        this.G[i] = c[1] + v;
        this.B[i] = c[2] + v * 0.9;
        this.P[i] = b === BIOME.RUIN || b === BIOME.BASE || b === BIOME.HANGAR || b === BIOME.MUSTAFAR || b === BIOME.CITY_UP || b === BIOME.CITY_LOW ? 1 : 0;
        this.V[i] = b === BIOME.VOID ? 1 : 0;
        this.U[i] = b === BIOME.CITY_UP ? 1 : 0;
        if (b === BIOME.VOID) {
          // no grain in the drop
          this.R[i] = c[0];
          this.G[i] = c[1];
          this.B[i] = c[2];
        }
        this.L[i] = b === BIOME.LAVA ? 1 : 0;
        this.Bs[i] = b === BIOME.BASE ? 1 : 0;
        this.K[i] = b === BIOME.CRYSTAL ? 1 : 0;
        this.Gr[i] = b === BIOME.GRASS ? 1 : 0;
        this.Rk[i] = b === BIOME.ROCK || b === BIOME.SCORCH || b === BIOME.MUSTAFAR ? 1 : 0;
        const rd = world.road[i];
        this.Rd[i] = b === BIOME.BASE ? 0 : clamp(1.7 - rd, 0, 1);
      }
    }
    this.cache = new Map();
    this.frame = 0;
    this.maxChunks = 64;
    this.S = 1; // pixels per game pixel
    this.painted = false;
    this.baked = null; // props painted into the chunks (commandos)
  }

  setDensity(S) {
    this.setStyle(S, false, null);
  }

  /**
   * Pixel density, painted (Commandos) ground, and the props to bake into
   * it: [{ frame, sx, sy, sortDepth, rect, flat }] in world-screen pixels.
   */
  setStyle(S, painted = false, baked = null) {
    if (S === this.S && painted === this.painted && baked === this.baked) return;
    this.S = S;
    this.painted = painted;
    this.baked = painted ? baked : null;
    if (this.baked) for (const p of this.baked) p.paintRect = paintRect(p);
    this.cache.clear();
    this.job = null;
  }

  /** A baked prop moved or appeared: rebuild the chunks under it. */
  invalidate(p) {
    if (!this.baked) return;
    const rects = [p.paintRect, (p.paintRect = paintRect(p))].filter(Boolean);
    for (const key of [...this.cache.keys()]) {
      const [cx, cy] = key.split(',').map(Number);
      const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
      const sy0 = (cx * CH + cy * CH) * HALF_H;
      if (rects.some(([x, y, w, h]) => x < sx0 + CW && x + w > sx0 && y < sy0 + CHH && y + h > sy0)) this.cache.delete(key);
    }
    if (this.job) this.job = null;
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

  buildChunk(cx, cy) {
    const gen = this.buildGen(cx, cy);
    let r;
    while (!(r = gen.next()).done);
    return r.value;
  }

  /** Builds a chunk, yielding every few rows (prefetch spreads it over frames). */
  *buildGen(cx, cy) {
    const S = this.S;
    const hd = S > 1;
    const PW = CW * S;
    const PH = CHH * S;
    const canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = PH;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(PW, PH);
    const d = img.data;
    const x0 = cx * CH;
    const y0 = cy * CH;
    const sx0 = (x0 - (y0 + CH)) * HALF_W;
    const sy0 = (x0 + y0) * HALF_H;
    const q = 255 / 30;
    const painted = this.painted;
    const ov = painted ? 0.07 : 0;
    for (let py = 0; py < PH; py++) {
      const sy = sy0 + py / S;
      for (let px = 0; px < PW; px++) {
        const sx = sx0 + px / S;
        const fx = (sx / HALF_W + sy / HALF_H) / 2;
        const fy = (sy / HALF_H - sx / HALF_W) / 2;
        // painted chunks overlap their neighbours by a pixel, so smooth
        // (fractional) scaling never opens a seam between them
        if (fx < x0 - ov || fx >= x0 + CH + ov || fy < y0 - ov || fy >= y0 + CH + ov) continue;
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
        const drop = this.sample(this.V, u, v);
        const upper = this.sample(this.U, u, v);
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
        if (painted) {
          // Commandos 2-style painting: broad warm/cool patches, then
          // diagonal brush strokes, then lit pebbles with a contact shadow
          const macro = valueNoise(fx * 0.23, fy * 0.23, 61) - 0.5;
          const hue = valueNoise(fx * 0.5 + 9, fy * 0.5, 62) - 0.5;
          r += macro * 22 + hue * 10;
          g += macro * 20 + hue * 4;
          b += macro * 14 - hue * 8;
          const stroke = valueNoise((fx - fy) * 5.5, (fx + fy) * 1.3, 63) - 0.5;
          const fine2 = valueNoise(sx * 0.9, sy * 1.8, 64) - 0.5;
          const sk = (paved > 0.3 ? 5 : 11) * (1 - drop) * (1 - lava * 0.6);
          r += stroke * sk + fine2 * sk * 0.6;
          g += stroke * sk + fine2 * sk * 0.6;
          b += stroke * sk * 0.85 + fine2 * sk * 0.5;
          const grass = this.sample(this.Gr, u, v) * (1 - road) * (1 - paved);
          if (grass > 0.15) {
            const t = tuft(sx, sy) * grass;
            r += t * 0.8;
            g += t;
            b += t * 0.5;
          }
          const rock = this.sample(this.Rk, u, v) * (1 - paved);
          if (rock > 0.2) {
            // ridged noise: hairline cracks with a lit lower lip
            const n = valueNoise(fx * 2.2, fy * 2.2, 66);
            const ridge = Math.abs(n - 0.5);
            if (ridge < 0.025) {
              r -= 30 * rock;
              g -= 30 * rock;
              b -= 26 * rock;
            } else if (ridge < 0.045 && n > 0.5) {
              r += 10 * rock;
              g += 10 * rock;
              b += 9 * rock;
            }
          }
          if (paved < 0.5 && drop < 0.1 && lava < 0.3) {
            const pb = pebble(sx, sy);
            r += pb * (pb > 0 ? 0.9 : 1);
            g += pb * (pb > 0 ? 0.85 : 1);
            b += pb * (pb > 0 ? 0.75 : 0.9);
          }
        }
        // pebbles / grit
        if (painted) {
          /* replaced by the lit pebbles above */
        } else if (grain > 0.94) {
          const k = cry > 0.5 ? 0.4 : 1;
          r += 22 * k;
          g += 20 * k;
          b += 18 * k;
        } else if (grain < 0.07) {
          r -= 24;
          g -= 24;
          b -= 20;
        }
        // lava: dark crust plates split by glowing molten veins
        if (lava > 0.35) {
          const n1 = valueNoise(fx * 0.9, fy * 0.9, 51);
          const n2 = valueNoise(fx * 2.6, fy * 2.6, 52);
          const vein = 1 - Math.abs(n1 - 0.5) * 2; // ridges of the noise
          const hot = clamp((vein * 0.75 + n2 * 0.4 - 0.45) * 3, 0, 1) * clamp((lava - 0.35) * 2, 0, 1);
          r += (255 - r) * hot;
          g += (150 * hot + 60 * hot * hot - g) * hot;
          b += (30 - b) * hot;
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
        // the drop: near black, the far-below city as scattered warm and cold
        // lights, a faint haze at the platform edges
        if (drop > 0.02) {
          const k = clamp(drop, 0, 1);
          const haze = (1 - k) * 40;
          r = r * (1 - k) + (10 + haze) * k;
          g = g * (1 - k) + (12 + haze) * k;
          b = b * (1 - k) + (24 + haze * 1.2) * k;
          if (k > 0.9) {
            const spark = hash2(Math.floor(fx * 6), Math.floor(fy * 6), 77);
            if (spark > 0.985) {
              const warm = hash2(Math.floor(fx * 6), Math.floor(fy * 6), 78) > 0.4;
              r = warm ? 230 : 140;
              g = warm ? 170 : 190;
              b = warm ? 90 : 255;
            } else if (spark > 0.97) {
              r += 30;
              g += 26;
              b += 30;
            }
          }
        }
        // crystal sparkle
        if (cry > 0.5 && grain > 0.994 && blot > 0) {
          r = 150;
          g = 230;
          b = 255;
        }
        const i = (py * PW + px) * 4;
        if (painted) {
          // muted, slightly warm grade with lifted shadows
          const l = r * 0.3 + g * 0.59 + b * 0.11;
          const fine = (hash2(px + sx0 * S, py + sy0 * S, 7) - 0.5) * 4;
          d[i] = clamp(6 + l + (r - l) * 0.86 + fine, 0, 255);
          d[i + 1] = clamp(5 + l + (g - l) * 0.86 + fine, 0, 255);
          d[i + 2] = clamp(4 + l + (b - l) * 0.82 + fine * 0.9, 0, 255);
          d[i + 3] = 255;
          continue;
        }
        if (hd) {
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
    if (this.baked) {
      yield;
      this.paintProps(ctx, sx0, sy0);
    }
    return { canvas, sx: sx0, sy: sy0 };
  }

  /**
   * Commandos: cast shadows, contact darkening and the props themselves,
   * painted into this chunk in depth order. They are drawn on a scratch
   * layer and laid over the ground with `source-atop`, so each chunk keeps
   * exactly its own diamond of the picture and neighbours never double up.
   */
  paintProps(ctx, sx0, sy0) {
    const S = this.S;
    const PW = CW * S;
    const PH = CHH * S;
    const list = this.baked.filter((p) => {
      if (p.hidden) return false;
      const [x, y, w, h] = p.paintRect;
      return x < sx0 + CW && x + w > sx0 && y < sy0 + CHH && y + h > sy0;
    });
    if (!list.length) return;
    list.sort((a, b) => a.sortDepth - b.sortDepth);
    const L = (this.layer ||= document.createElement('canvas'));
    if (L.width !== PW || L.height !== PH) {
      L.width = PW;
      L.height = PH;
    }
    const l = L.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, PW, PH);
    l.imageSmoothingEnabled = true;
    // 1. contact darkening (ambient occlusion) under standing props
    for (const p of list) {
      if (p.flat) continue;
      const f = p.frame;
      const k = f.k || 1;
      const rx = Math.max(6, f.w * k * 0.46);
      l.setTransform(S, 0, 0, S * 0.5, (p.sx - sx0) * S, (p.sy - sy0) * S);
      const g = l.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(18,14,10,0.42)');
      g.addColorStop(0.6, 'rgba(18,14,10,0.22)');
      g.addColorStop(1, 'rgba(18,14,10,0)');
      l.fillStyle = g;
      l.fillRect(-rx, -rx, rx * 2, rx * 2);
    }
    // 2. soft cast shadows from the sun at the upper left: the silhouette
    // folded back onto the ground, sheared to the right and squashed
    l.globalAlpha = 0.42;
    for (const p of list) {
      if (p.flat) continue;
      const f = p.frame;
      const k = f.k || 1;
      const P = SIL_PAD * k;
      l.setTransform(S, 0, -SHEAR * S, SQUASH * S, (p.sx - sx0) * S, (p.sy - sy0) * S);
      l.drawImage(silhouette(f), -f.ox * k - P, -f.oy * k - P, f.w * k + P * 2, f.h * k + P * 2);
    }
    l.globalAlpha = 1;
    // 3. the props
    l.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of list) {
      const f = p.frame;
      const k = f.k || 1;
      l.imageSmoothingEnabled = k !== 1;
      l.drawImage(f.page, f.sx, f.sy, f.w, f.h, Math.round((p.sx - f.ox * k - sx0) * S), Math.round((p.sy - f.oy * k - sy0) * S), f.w * k * S, f.h * k * S);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(L, 0, 0);
    ctx.restore();
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
        if (!this.cache.has(key)) built++;
        const c = this.getChunk(cx, cy);
        ctx.drawImage(c.canvas, Math.round(c.sx - vx), Math.round(c.sy - vy), CW, CHH);
      }
    }
    // Prefetch chunks just outside the view a few rows per frame (~4 ms) so
    // walking never stalls on building one.
    if (!built) {
      if (!this.job) {
        for (let cy = Math.max(0, minY - 1); cy <= Math.min(nC - 1, maxY + 1) && !this.job; cy++) {
          for (let cx = Math.max(0, minX - 1); cx <= Math.min(nC - 1, maxX + 1); cx++) {
            if (this.cache.has(cx + ',' + cy) || visible(cx, cy)) continue;
            const pad = 160;
            const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
            const sy0 = (cx * CH + cy * CH) * HALF_H;
            if (sx0 > vx + vw + pad || sx0 + CW < vx - pad || sy0 > vy + vh + pad || sy0 + CHH < vy - pad) continue;
            this.job = { key: cx + ',' + cy, gen: this.buildGen(cx, cy) };
            break;
          }
        }
      }
      if (this.job) {
        const end = performance.now() + 4;
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
