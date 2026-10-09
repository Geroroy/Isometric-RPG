// Chunked per-pixel terrain renderer. Ground colors are blended smoothly
// between tiles (no diamond seams), then textured with grain / pebbles,
// paving patterns, roads and craters and finally ordered-dithered to a
// reduced palette for an old-school look.
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
};
const ROAD = [128, 108, 84];
const EDGE = [62, 57, 54];

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
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const i = y * world.w + x;
        const b = world.biome[i];
        let c = world.blocked[i] === 2 ? EDGE : PAL[b];
        const v = (valueNoise(x / 3.5, y / 3.5, 7) - 0.5) * 22 + (hash2(x, y, 3) - 0.5) * 8;
        this.R[i] = c[0] + v;
        this.G[i] = c[1] + v;
        this.B[i] = c[2] + v * 0.9;
        this.P[i] = b === BIOME.RUIN || b === BIOME.BASE || b === BIOME.HANGAR ? 1 : 0;
        this.Bs[i] = b === BIOME.BASE ? 1 : 0;
        this.K[i] = b === BIOME.CRYSTAL ? 1 : 0;
        const rd = world.road[i];
        this.Rd[i] = b === BIOME.BASE ? 0 : clamp(1.7 - rd, 0, 1);
      }
    }
    this.cache = new Map();
    this.frame = 0;
    this.maxChunks = 64;
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
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CHH;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(CW, CHH);
    const d = img.data;
    const x0 = cx * CH;
    const y0 = cy * CH;
    const sx0 = (x0 - (y0 + CH)) * HALF_W;
    const sy0 = (x0 + y0) * HALF_H;
    const q = 255 / 30;
    for (let py = 0; py < CHH; py++) {
      const sy = sy0 + py;
      for (let px = 0; px < CW; px++) {
        const sx = sx0 + px;
        const fx = (sx / HALF_W + sy / HALF_H) / 2;
        const fy = (sy / HALF_H - sx / HALF_W) / 2;
        if (fx < x0 || fx >= x0 + CH || fy < y0 || fy >= y0 + CH) continue;
        const u = fx - 0.5;
        const v = fy - 0.5;
        let r = this.sample(this.R, u, v);
        let g = this.sample(this.G, u, v);
        let b = this.sample(this.B, u, v);
        const paved = this.sample(this.P, u, v);
        const road = this.sample(this.Rd, u, v);
        const cry = this.sample(this.K, u, v);
        const base = this.sample(this.Bs, u, v);
        const grain = hash2(sx, sy, 99);
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
        // crystal sparkle
        if (cry > 0.5 && grain > 0.994 && blot > 0) {
          r = 150;
          g = 230;
          b = 255;
        }
        const t = BAYER[(py & 3) * 4 + (px & 3)] * q;
        const i = (py * CW + px) * 4;
        d[i] = clamp(Math.round((r + t) / q) * q, 0, 255);
        d[i + 1] = clamp(Math.round((g + t) / q) * q, 0, 255);
        d[i + 2] = clamp(Math.round((b + t) / q) * q, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Craters & scorch decals.
    ctx.save();
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
      c = this.buildChunk(cx, cy);
      this.cache.set(key, c);
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
    c.used = this.frame;
    return c;
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
        ctx.drawImage(c.canvas, Math.round(c.sx - vx), Math.round(c.sy - vy));
      }
    }
    // Prefetch one chunk just outside the view per frame to avoid hitches.
    if (!built) {
      for (let cy = Math.max(0, minY - 1); cy <= Math.min(nC - 1, maxY + 1) && !built; cy++) {
        for (let cx = Math.max(0, minX - 1); cx <= Math.min(nC - 1, maxX + 1); cx++) {
          if (this.cache.has(cx + ',' + cy) || visible(cx, cy)) continue;
          const pad = 160;
          const sx0 = (cx * CH - (cy * CH + CH)) * HALF_W;
          const sy0 = (cx * CH + cy * CH) * HALF_H;
          if (sx0 > vx + vw + pad || sx0 + CW < vx - pad || sy0 > vy + vh + pad || sy0 + CHH < vy - pad) continue;
          this.getChunk(cx, cy);
          built++;
          break;
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
