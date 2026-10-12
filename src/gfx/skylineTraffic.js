// Coruscant's air traffic (docs/SKYLINE_TRAFFIC.md): the craft of the two eight-view vehicle sheets
// (tools/sprites/traffic/extract.py — eight craft, every one in eight views, background and ground
// shadow cut away, scaled to game size offline) flying
//   - the level's own air lanes (LaneTraffic, where streaks of light used to run): the lanes through
//     the drop just under the platforms' rim, moved off any walkway they crossed, depth-sorted with the
//     props; the lanes high over the undercity's streets above everything, each craft casting its
//     sheet's soft ground shadow on the street straight below it — without that a craft over a
//     walkway reads as standing on it in this view;
//   - far off over the city (SkylineTraffic): smaller craft between the backdrop's tower layers.
// Drawn as pre-rendered sprites at their own pixels (the far ones from the atlas halved offline) —
// never resampled or tinted at run time, no drawn-in light. Every craft flies a straight line along
// an isometric axis, placed on exact 2:1 pixel steps from its distance along the line, so it moves
// without shimmer or zigzag, and shows the view of the sheet whose nose points the way it is going
// (down-right SE, down-left SW, up-left NW, up-right NE). It enters and leaves off-screen.
import { RNG } from '../core/math.js';
import { worldToScreen, HALF_H } from '../core/iso.js';

const BASE = import.meta.env.BASE_URL;
const VOID = 13; // world BIOME.VOID: the drop between the levels / off the platforms

// classes: pace (× the lane's speed) and how often they fly
const CLASSES = {
  swoop: { pace: 1.35, weight: 0.24 },
  cruiser: { pace: 1.12, weight: 0.36 },
  commuter: { pace: 1, weight: 0.22 },
  cargo: { pace: 0.68, weight: 0.18 },
};

let meta = null;
let full = null;
let halfImg = null;
let quarterImg = null;
let shadowImg = null;
let loading = false;
function load() {
  if (loading) return;
  loading = true;
  const img = (src) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = BASE + src;
    });
  Promise.all([fetch(BASE + 'sprites/traffic/traffic.json').then((r) => r.json()), img('sprites/traffic/traffic.png'), img('sprites/traffic/traffic_half.png'), img('sprites/traffic/traffic_shadow.png'), img('sprites/traffic/traffic_quarter.png')])
    .then(([m, a, b, sh, q]) => {
      meta = m;
      full = a;
      halfImg = b;
      shadowImg = sh;
      quarterImg = q;
    })
    .catch((e) => console.warn('air traffic: no sprites', e));
}

/** A craft by its class's weight: { cls, views }. */
function pickCraft(rng, cache) {
  let u = rng.next();
  let cls = 'commuter';
  for (const [k, c] of Object.entries(CLASSES)) {
    if (u < c.weight) {
      cls = k;
      break;
    }
    u -= c.weight;
  }
  const all = Object.values(meta.craft);
  const list = (cache.byClass ||= Object.fromEntries(Object.keys(CLASSES).map((k) => [k, all.filter((c) => c.cls === k)])))[cls];
  return rng.pick(list.length ? list : all);
}

/** The view whose nose points along a screen step (sx, sy) of a 2:1 diagonal. */
const viewOf = (sx, sy) => (sy > 0 ? (sx > 0 ? 'SE' : 'SW') : sx > 0 ? 'NE' : 'NW');

/** One craft centred on screen point (x, y), from the full atlas (k = 1), the halved (0.5) or the quartered one (0.25). */
function drawCraft(ctx, v, x, y, k) {
  const img = k === 1 ? full : k === 0.5 ? halfImg : quarterImg;
  ctx.globalCompositeOperation = 'source-over'; // (the overhead pass comes straight after the additive effects)
  ctx.globalAlpha = 1;
  const w = Math.ceil(v.w * k);
  const h = Math.ceil(v.h * k);
  ctx.drawImage(img, v.x * k, v.y * k, w, h, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

// --- far off over the city (docs/prompts/sky_traffic_movie.md) ----------------------------------
//
// As the night skyline of Attack of the Clones (reference/motion/coruscant_skyline_traffic.gif): the
// sky is threaded with skyways — bundles of 3-4 parallel lanes stacked a few pixels apart, the
// neighbouring lanes flowing opposite ways — and steep ramps where streams climb or sink between them;
// four depth tiers, each with its own parallax, size (headlight dots, quarter, half, full), pace and
// axis (the tiers alternate \ and /, so streams at different depths cross). Each lane carries a fixed,
// seeded train of craft repeating every PERIOD px, all at the lane's one speed: positions come from the
// clock alone, so the same sky continues whatever the view does — no craft is ever spawned or dropped
// in sight, none overtakes, none jitters. A bright blue-white headlight sits on every nose.

/**
 * The tiers, far → near: parallax f; sprite scale k (0 = a headlight and a dash); axis (+1: lanes run
 * \ on screen, -1: /); skyways every B px of tier space, `lanes` lanes `gap` px apart; speed range
 * (tier px a second along x); craft per 1000 px of lane; ramps every `ramp` skyways (0: none), their
 * extra slope. `after`: the backdrop tower layer it flies after (gfx/cityBackdrop.js).
 */
export const TIERS = [
  { f: 0.07, k: 0, axis: -1, B: 44, lanes: 4, gap: 5, speed: [7, 10], per1000: 1.8, ramp: 3, slope: 0.7, after: 0 },
  { f: 0.11, k: 0.25, axis: 1, B: 70, lanes: 3, gap: 8, speed: [11, 15], per1000: 2.6, ramp: 4, slope: 0.6, after: 0 },
  { f: 0.17, k: 0.5, axis: -1, B: 120, lanes: 3, gap: 13, speed: [18, 26], per1000: 2.2, ramp: 0, slope: 0, after: 1 },
  { f: 0.3, k: 1, axis: 1, B: 460, lanes: 2, gap: 26, speed: [40, 55], per1000: 1.3, ramp: 0, slope: 0, after: 2 },
];
const PERIOD = 2400; // a lane's train of craft repeats every this many px (longer than any view)
const MARGIN = 70; // beyond the view's edge, tier px

const hash = (...k) => {
  let h = 2166136261;
  for (const v of k) h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let glow = null;
/** The headlight's soft halo (a small pre-drawn sprite). */
function glowSprite() {
  if (glow) return glow;
  glow = document.createElement('canvas');
  glow.width = glow.height = 9;
  const g = glow.getContext('2d');
  const r = g.createRadialGradient(4.5, 4.5, 0, 4.5, 4.5, 4.5);
  r.addColorStop(0, 'rgba(210,235,255,0.9)');
  r.addColorStop(0.35, 'rgba(150,200,255,0.35)');
  r.addColorStop(1, 'rgba(120,170,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 9, 9);
  return glow;
}

/** The sky's traffic in tiers of lanes (the clock drives it; the view only picks what shows). */
export class SkylineTraffic {
  constructor(seed = 7) {
    this.seed = seed;
    this.time = 0;
    this.craftCache = {};
    this.lanes = new Map();
  }

  update(dt) {
    if (!meta) return load();
    this.time += Math.min(dt, 0.1);
  }

  /** A lane's settings, from its tier, skyway and lane index (seeded; made once, kept). */
  lane(ti, j, i, ramp) {
    const key = ((ti * 2 + (ramp ? 1 : 0)) * 64 + i) * 100000 + j;
    let L = this.lanes.get(key);
    if (!L) {
      if (this.lanes.size > 4000) this.lanes.clear();
      L = this.makeLane(ti, j, i, ramp);
      this.lanes.set(key, L);
    }
    return L;
  }

  makeLane(ti, j, i, ramp) {
    const T = TIERS[ti];
    const h = (n) => hash(this.seed, ti, j, i, ramp ? 7 : 3, n);
    const dir = ramp ? (h(1) < 0.5 ? 1 : -1) : (i + j) % 2 ? 1 : -1; // neighbours flow opposite ways
    const vx = T.speed[0] + h(2) * (T.speed[1] - T.speed[0]);
    const slope = T.axis / 2 + (ramp ? (h(3) < 0.5 ? -1 : 1) * T.slope : 0);
    // the train: seeded gaps, at least a craft's length and a half apart
    const n = Math.max(1, Math.round((T.per1000 * PERIOD) / 1000 * (0.6 + h(4) * 0.8) * (ramp ? 0.7 : 1)));
    const minGap = T.k ? 120 * T.k : 14;
    const offs = [];
    let x = h(5) * PERIOD;
    for (let k = 0; k < n; k++) {
      offs.push(x % PERIOD);
      x += minGap + (-Math.log(1 - h(10 + k) * 0.999) * (PERIOD / n - minGap));
      if (x - offs[0] > PERIOD - minGap) break;
    }
    return { dir, vx, slope, offs, h };
  }

  /** Draw tier ti for the view (game px): every lane through it, top lanes first. */
  draw(ctx, ti, cam, W, H, mode = 'up') {
    if (!meta) return;
    const T = TIERS[ti];
    const vx = cam.x * T.f;
    const vy = cam.y * T.f;
    const x0 = vx - MARGIN;
    const x1 = vx + W + MARGIN;
    const busy = mode === 'low' ? 0.6 : 1;
    const t = this.time;
    const glowImg = glowSprite();
    const items = [];
    for (const ramp of T.ramp ? [false, true] : [false]) {
      const B = ramp ? T.B * T.ramp : T.B;
      const nl = ramp ? 1 : T.lanes;
      // the intercepts c (y = slope·x + c) of the lanes crossing the view
      const sl = T.axis / 2 + (ramp ? T.slope : 0);
      const sl2 = T.axis / 2 - (ramp ? T.slope : 0);
      const ys = [vy - MARGIN, vy + H + MARGIN];
      let cmin = Infinity;
      let cmax = -Infinity;
      for (const q of [sl, sl2]) for (const xx of [x0, x1]) for (const yy of ys) (cmin = Math.min(cmin, yy - q * xx)), (cmax = Math.max(cmax, yy - q * xx));
      const ph = ramp ? B * 0.37 : 0;
      for (let j = Math.floor((cmin - ph) / B) - 1; j <= Math.ceil((cmax - ph) / B); j++)
        for (let i = 0; i < nl; i++) {
          const L = this.lane(ti, j, i, ramp);
          if (L.h(9) > busy + 0.15) continue; // the undercity's sky is quieter
          const c = j * B + ph + i * T.gap;
          for (let k = 0; k < L.offs.length; k++) {
            const base = (((L.offs[k] + L.dir * L.vx * t) % PERIOD) + PERIOD) % PERIOD;
            for (let X = base + PERIOD * Math.ceil((x0 - base) / PERIOD); X <= x1; X += PERIOD) {
              const Y = L.slope * X + c;
              if (Y < vy - MARGIN || Y > vy + H + MARGIN) continue;
              const rep = Math.round((X - L.offs[k] - L.dir * L.vx * t) / PERIOD); // which repeat of the train (a stable id)
              items.push([c, X, Y, L, k, `${ti}:${ramp ? 'r' : 'l'}${j}.${i}:${k}:${rep}`]);
            }
          }
        }
    }
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // higher lanes behind lower ones
    // the bodies first, then every headlight in one additive pass and their cores (two composite
    // switches a tier, not two a craft)
    const lights = [];
    ctx.fillStyle = 'rgba(14,14,22,0.85)';
    for (const [, X, Y, L, k, id] of items) {
      // whole pixels on the line: x first, y from it (no shimmer)
      const sx = Math.round(X - vx);
      const sy = Math.round(L.slope * Math.round(X) + (Y - L.slope * X)) - Math.round(vy);
      const view = L.dir > 0 ? (T.axis > 0 ? 'SE' : 'NE') : T.axis > 0 ? 'NW' : 'SW';
      if (this.log) this.log.push([id, sx, sy, view, L.dir, T.k]); // (tools/qa/skytraffic.mjs)
      if (T.k === 0) {
        // a far craft: a dark dash along its heading and its headlight
        ctx.fillRect(sx - 2, sy, 4, 1);
        lights.push(sx + L.dir * 2 - 3, sy - 3, 7, sx + L.dir * 2, sy);
        continue;
      }
      const craft = this.craftOf(L, k);
      const v = craft.views[view];
      drawCraft(ctx, v, sx, sy, T.k);
      // the headlight on its nose
      const fx = sx - Math.ceil(v.w * T.k) / 2 + v.front[0] * T.k;
      const fy = sy - Math.ceil(v.h * T.k) / 2 + v.front[1] * T.k;
      const gs = T.k >= 1 ? 13 : T.k >= 0.5 ? 9 : 7;
      lights.push(Math.round(fx - gs / 2), Math.round(fy - gs / 2), gs, Math.round(fx), Math.round(fy));
    }
    if (!lights.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lights.length; i += 5) ctx.drawImage(glowImg, 0, 0, 9, 9, lights[i], lights[i + 1], lights[i + 2], lights[i + 2]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = T.k === 0 ? '#e4f0ff' : '#eef6ff'; // the bright cores
    for (let i = 0; i < lights.length; i += 5) ctx.fillRect(lights[i + 3], lights[i + 4], 1, 1);
  }

  /** The craft of a lane's k-th place (seeded, by the classes' weights). */
  craftOf(L, k) {
    let u = L.h(40 + k);
    let cls = 'commuter';
    for (const [name, c] of Object.entries(CLASSES)) {
      if (u < c.weight) {
        cls = name;
        break;
      }
      u -= c.weight;
    }
    const all = Object.values(meta.craft);
    const list = (this.craftCache[cls] ||= all.filter((c) => c.cls === cls));
    const pool = list.length ? list : all;
    return pool[Math.floor(L.h(60 + k) * pool.length)];
  }
}

// --- the level's air lanes -----------------------------------------------------------------------

const EXT = 30; // lanes run on this far past the level's ends: craft come in and go out off-screen
const POOL = 260; // every lane's cars at once
const LEN = 4.5; // a craft's length along its lane, world units (no closer than this)
// the overhead lanes' heights, tiles (the shadow sits z × 24.5 px below): east-west lanes lower than
// north-south ones, so where two cross the craft pass well above and below each other
const OVER_Z = { x: [4.5, 5.5], y: [6.5, 7.5] };

/**
 * The craft along the level's air lanes (world.traffic, worldgen.js: (x0, y0) -> (x1, y1) at height z,
 * a lane speed, a mean gap; `over`: high over the undercity's streets). A lane is straightened onto its
 * main axis, keeps its direction and is carried on past both ends of the level. A lane through the drop
 * is lowered under the platforms' rim and moved sideways off any walkway (and 1.5 tiles from the lanes
 * beside it; one that finds no clear line stays empty); an overhead lane keeps its line, at OVER_Z
 * over the street, its craft drawn above everything with their shadows on the ground below. Each car
 * has its class's pace with its own spread, brakes for a slower car ahead, and enters at irregular
 * (exponential) gaps once the one before has moved on.
 */
export class LaneTraffic {
  constructor(lanes, world = null, seed = 11) {
    this.rng = new RNG(seed);
    this.src = lanes;
    // a lane through the drop flies under the platforms' rim, so it must not cross a platform: one
    // that does is moved sideways to the nearest line clear of them over the level (world.biome VOID)
    const clear = (alongX, other, lo, hi) => {
      if (!world) return true;
      for (let a = lo; a <= hi; a += 0.5) if (world.biomeAt(alongX ? a : other, alongX ? other : a) !== VOID) return false;
      return true;
    };
    this.pool = Array.from({ length: POOL }, () => ({ active: false }));
    const placed = [];
    this.lanes = lanes.map((L) => {
      const alongX = Math.abs(L.x1 - L.x0) >= Math.abs(L.y1 - L.y0);
      const sgn = (alongX ? L.x1 - L.x0 : L.y1 - L.y0) >= 0 ? 1 : -1;
      const lo = alongX ? Math.min(L.x0, L.x1) : Math.min(L.y0, L.y1);
      const hi = alongX ? Math.max(L.x0, L.x1) : Math.max(L.y0, L.y1);
      const kind = L.over ? 'over' : 'drop';
      let other = alongX ? (L.y0 + L.y1) / 2 : (L.x0 + L.x1) / 2;
      // and kept 1.5 tiles from the parallel lanes already placed (craft on two lanes never overlap)
      const free = (o) => clear(alongX, o, lo, hi) && !placed.some((p) => p.alongX === alongX && p.kind === kind && Math.abs(p.other - o) < 1.5);
      if (kind === 'drop' && !free(other)) {
        const off = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20].flatMap((o) => [o, -o]).find((o) => free(other + o));
        if (off !== undefined) other += off;
      }
      // no room anywhere near: the lane is left empty rather than fly over a walkway
      const dead = kind === 'drop' && !clear(alongX, other, lo, hi);
      if (!dead && kind === 'drop') placed.push({ alongX, kind, other });
      // screen step per pixel row of travel: +x down-right, -x up-left, +y down-left, -y up-right
      const sx = alongX ? 2 * sgn : -2 * sgn;
      const sy = sgn;
      return {
        L,
        alongX,
        sgn,
        start: sgn > 0 ? lo - EXT : hi + EXT,
        inLo: EXT, // the part of the run over the level: d in [inLo, inHi]
        inHi: EXT + hi - lo,
        len: hi - lo + 2 * EXT,
        other,
        // the drop's just under the rim (a little deeper for the higher lanes); the overhead ones up high
        z: kind === 'over' ? ((r) => r[0] + (r[1] - r[0]) * Math.min(1, Math.max(0, (L.z - 9) / 3)))(OVER_Z[alongX ? 'x' : 'y']) : -0.5 - Math.min(L.z, 8) * 0.4,
        kind,
        sx,
        sy,
        view: viewOf(sx, sy),
        dead,
        next: 0,
        cars: [],
      };
    });
    this.time = 0;
    this.warm = false;
  }

  spawn(ln, d) {
    const c = this.pool.find((p) => !p.active);
    if (!c) return;
    const rng = this.rng;
    const craft = pickCraft(rng, this);
    c.active = true;
    c.v0 = craft.views[ln.view];
    c.view = ln.view;
    c.d = d;
    c.want = ln.L.speed * CLASSES[craft.cls].pace * (0.9 + rng.next() * 0.2);
    c.v = c.want;
    ln.cars.push(c);
  }

  update(dt) {
    if (!meta) return load();
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const rng = this.rng;
    for (const ln of this.lanes) {
      if (ln.dead) continue;
      const mean = ln.L.gap / ln.L.speed;
      if (!this.warm) {
        // flowing already when the level opens
        for (let d = ln.len - rng.next() * ln.L.gap; d > 0; d -= LEN + ln.L.gap * (0.4 + rng.next() * 1.2)) this.spawn(ln, d);
        ln.next = rng.next() * mean;
      }
      // front to back (cars[0] is the front): each eases to its pace, or no faster than the car ahead
      for (let i = 0; i < ln.cars.length; i++) {
        const c = ln.cars[i];
        let target = c.want;
        const ahead = ln.cars[i - 1];
        if (ahead && ahead.d - c.d < LEN * 2) target = Math.min(target, ahead.v * (ahead.d - c.d < LEN * 1.3 ? 0.8 : 1));
        c.v += (target - c.v) * Math.min(1, dt * 1.2);
        c.d = Math.min(c.d + c.v * dt, ahead ? ahead.d - LEN : Infinity);
      }
      while (ln.cars.length && ln.cars[0].d > ln.len) ln.cars.shift().active = false;
      ln.next -= dt;
      const last = ln.cars[ln.cars.length - 1];
      if (ln.next <= 0 && (!last || last.d > LEN * 1.5)) {
        this.spawn(ln, 0);
        ln.next = mean * (0.4 + -Math.log(1 - rng.next() * 0.999) * 0.8);
      }
    }
    this.warm = true;
  }

  /** A car's world point (x, y, z). */
  world(ln, c) {
    const a = ln.start + ln.sgn * c.d;
    return ln.alongX ? [a, ln.other, ln.z] : [ln.other, a, ln.z];
  }

  /** Every car's world position of a kind. */
  *positions(kind) {
    for (const ln of this.lanes) if (ln.kind === kind) for (const c of ln.cars) yield this.world(ln, c);
  }

  /**
   * The cars of a kind in view: [depth (x + y), screen x, y, lane, car], the screen point on whole
   * 2:1 pixel steps from the lane's start (so it never shimmers); they go into the renderer's
   * depth-sorted list with the props and units.
   */
  visible(kind, cam, W, H) {
    const list = [];
    if (!meta) return list;
    for (const ln of this.lanes) {
      if (ln.kind !== kind) continue;
      const o = ln.alongX ? worldToScreen(ln.start, ln.other, ln.z) : worldToScreen(ln.other, ln.start, ln.z);
      const g = ln.alongX ? worldToScreen(ln.start, ln.other, 0) : worldToScreen(ln.other, ln.start, 0);
      const drop = Math.round(g.y) - Math.round(o.y); // the shadow, this far below the craft (whole pixels)
      const ox = Math.round(o.x) - cam.x;
      const oy = Math.round(o.y) - cam.y;
      for (const c of ln.cars) {
        const k = Math.round(c.d * HALF_H); // pixel rows along the lane; x moves two per row
        const sx = ox + ln.sx * k;
        const sy = oy + ln.sy * k;
        // off the view only when the craft and its shadow both are (an overhead craft can be in view
        // with its shadow below the bottom edge, or the other way round)
        const out = (y) => y < -120 || y > H + 120;
        if (sx < -120 || sx > W + 120 || (out(sy) && out(sy + drop))) continue;
        const [wx, wy] = this.world(ln, c);
        list.push([wx + wy, sx, sy, ln, c, drop]);
      }
    }
    return list;
  }

  /** Draw one car from visible(). */
  drawItem(ctx, item) {
    drawCraft(ctx, item[4].v0, item[1], item[2], 1);
  }

  /**
   * The overhead craft's shadows on the street below them (before the props, so a prop covers its
   * part): the sheet's soft shadow of that view, centred on the ground point, faded over the drop
   * (by how much ground there is round it, so it thins out at a platform's edge rather than vanishing).
   */
  drawShadows(ctx, cam, W, H, world) {
    if (!meta || !shadowImg) return;
    ctx.globalCompositeOperation = 'source-over';
    for (const it of this.visible('over', cam, W, H)) {
      const [, sx, sy, ln, c, drop] = it;
      const s = c.v0.shadow;
      if (!s) continue;
      const [wx, wy] = this.world(ln, c);
      let ground = 1;
      if (world) {
        let n = 0;
        for (const [dx, dy] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) if (world.biomeAt(wx + dx, wy + dy) !== VOID) n++;
        ground = n / 5;
      }
      if (!ground) continue;
      ctx.globalAlpha = ground;
      ctx.drawImage(shadowImg, s.x, s.y, s.w, s.h, Math.round(sx - s.w / 2), Math.round(sy + drop - s.h / 2), s.w, s.h);
    }
    ctx.globalAlpha = 1;
  }

  /** Draw every car of a kind, farther first. */
  draw(ctx, cam, W, H, kind) {
    const list = this.visible(kind, cam, W, H).sort((a, b) => a[0] - b[0]);
    for (const it of list) this.drawItem(ctx, it);
  }
}
