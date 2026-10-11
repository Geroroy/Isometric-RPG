// Coruscant's air traffic (docs/SKYLINE_TRAFFIC.md): the craft of the attached vehicle sheet
// (tools/sprites/traffic/extract.py — hovering craft only, ground shadow cut away) flying
//   - the level's own air lanes (LaneTraffic): through the drop between the platforms, below the rim,
//     and high over the undercity's streets — where streaks of light used to run;
//   - far off over the city (SkylineTraffic): small craft between the backdrop's tower layers.
// Drawn as pre-rendered sprites at their own pixels (the near craft 1:1, the far ones from the
// atlas halved offline) — never resampled or tinted at run time. Every craft flies a straight line
// along an isometric axis, placed on exact 2:1 pixel steps from its distance along the line, so it
// moves without shimmer or zigzag; it enters and leaves off-screen. The sheet draws its craft facing
// down-left; down-right lanes mirror them, and no lane runs away from the camera (there are no rear
// views). Engine wakes are the sheet's pink and blue streaks, set on each craft's rear.
import { RNG } from '../core/math.js';
import { worldToScreen, HALF_H } from '../core/iso.js';

const BASE = import.meta.env.BASE_URL;

// classes: pace (× the lane's speed), how often they fly, the chance of an engine wake
const CLASSES = {
  swoop: { pace: 1.35, weight: 0.25, trail: 0.9 },
  cruiser: { pace: 1.12, weight: 0.35, trail: 0.7 },
  commuter: { pace: 1, weight: 0.25, trail: 0.45 },
  cargo: { pace: 0.7, weight: 0.15, trail: 0.25 },
};

let meta = null;
let full = null;
let halfImg = null;
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
  Promise.all([fetch(BASE + 'sprites/traffic/traffic.json').then((r) => r.json()), img('sprites/traffic/traffic.png'), img('sprites/traffic/traffic_half.png')])
    .then(([m, a, b]) => {
      meta = m;
      full = a;
      halfImg = b;
    })
    .catch((e) => console.warn('air traffic: no sprites', e));
}

function pickSprite(rng, cache) {
  let u = rng.next();
  let cls = 'commuter';
  for (const [k, c] of Object.entries(CLASSES)) {
    if (u < c.weight) {
      cls = k;
      break;
    }
    u -= c.weight;
  }
  const list = (cache.byClass ||= Object.fromEntries(Object.keys(CLASSES).map((k) => [k, meta.vehicles.filter((v) => v.cls === k)])))[cls];
  return [cls, rng.pick(list.length ? list : meta.vehicles)];
}

/**
 * One craft at screen point (x, y) (its centre), from the full atlas (k = 1) or the halved one
 * (k = 0.5; the atlas keeps every sprite at even coordinates so halving maps it exactly): the wake
 * first, its head on the rear, then the hull, then a blinking red running light on the rear.
 */
function drawCraft(ctx, s, x, y, mirror, trail, k, phase, now) {
  const img = k === 1 ? full : halfImg;
  const sw = Math.ceil(s.w * k);
  const sh = Math.ceil(s.h * k);
  const sx = s.x * k;
  const sy = s.y * k;
  const x0 = Math.round(x - sw / 2);
  const y0 = Math.round(y - sh / 2);
  const rx = mirror ? x0 + sw - Math.round(s.rear[0] * k) : x0 + Math.round(s.rear[0] * k);
  const ry = y0 + Math.round(s.rear[1] * k);
  if (trail) {
    const t = meta.trails[trail];
    const tw = Math.ceil(t.w * k);
    const th = Math.ceil(t.h * k);
    const hx = Math.round(t.head[0] * k);
    const hy = Math.round(t.head[1] * k);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8 + 0.12 * Math.sin(now * 19 + phase);
    if (mirror) {
      ctx.setTransform(-1, 0, 0, 1, rx + hx, 0);
      ctx.drawImage(img, t.x * k, t.y * k, tw, th, 0, ry - hy, tw, th);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else ctx.drawImage(img, t.x * k, t.y * k, tw, th, rx - hx, ry - hy, tw, th);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (mirror) {
    ctx.setTransform(-1, 0, 0, 1, x0 + sw, y0);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else ctx.drawImage(img, sx, sy, sw, sh, x0, y0, sw, sh);
  if (Math.sin(now * 4.5 + phase * 3) > 0.6) {
    ctx.fillStyle = 'rgba(255,70,60,0.95)';
    ctx.fillRect(rx, ry, 1, 1);
  }
}

// --- far off over the city -----------------------------------------------------------------------

/** The far traffic's tier: drawn after this backdrop tower layer, with this parallax. */
export const TIERS = [{ after: 1, f: 0.16, max: 18, rate: 0.9, band: [-0.45, 0.25], speed: [10, 22] }];
const MARGIN = 70; // spawn / leave beyond the view's edge, tier px

/** Small craft crossing the distant city on straight iso diagonals (tier space = parallax space). */
export class SkylineTraffic {
  constructor(seed = 7) {
    this.rng = new RNG(seed);
    this.pool = Array.from({ length: TIERS[0].max }, () => ({ active: false }));
    this.next = 0;
    this.time = 0;
    this.warm = false;
  }

  spawn(cam, W, H, t0 = 0) {
    const T = TIERS[0];
    const c = this.pool.find((p) => !p.active);
    if (!c) return;
    const rng = this.rng;
    const vx = cam.x * T.f;
    const vy = cam.y * T.f;
    c.dir = rng.next() < 0.5 ? -1 : 1; // screen x: -1 down-left (as drawn), 1 down-right (mirrored)
    c.x0 = c.dir < 0 ? vx + W + MARGIN : vx - MARGIN;
    c.y0 = vy + H * (T.band[0] + rng.next() * (T.band[1] - T.band[0]));
    c.v = T.speed[0] + rng.next() * (T.speed[1] - T.speed[0]); // px of descent a second (x moves twice that)
    c.span = (W + 2 * MARGIN) / 2; // the descent that takes it across the view
    c.k = t0 * c.span;
    const [cls, s] = pickSprite(rng, this);
    c.s = s;
    c.trail = rng.next() < CLASSES[cls].trail * 0.5 ? (rng.next() < 0.5 ? 'blue' : 'pink') : null;
    c.phase = rng.next() * 6.283;
    c.active = true;
  }

  update(dt, cam, W, H, mode) {
    if (!meta) return load();
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const T = TIERS[0];
    const busy = mode === 'low' ? 0.6 : 1;
    if (!this.warm) {
      // already flying when the level opens
      this.warm = true;
      for (let i = 0; i < Math.round(T.max * 0.6 * busy); i++) this.spawn(cam, W, H, this.rng.next());
    }
    const vx = cam.x * T.f;
    const vy = cam.y * T.f;
    for (const c of this.pool) {
      if (!c.active) continue;
      c.k += c.v * dt;
      const x = c.x0 + c.dir * 2 * c.k;
      const y = c.y0 + c.k;
      // gone past the far side (or the camera moved on): back to the pool
      if (c.k > c.span || x < vx - MARGIN * 3 || x > vx + W + MARGIN * 3 || y > vy + H + MARGIN * 2) c.active = false;
    }
    this.next -= dt;
    if (this.next <= 0) {
      this.spawn(cam, W, H);
      this.next = -Math.log(1 - this.rng.next() * 0.999) / (T.rate * busy);
    }
  }

  draw(ctx, ti, cam) {
    if (!meta) return;
    const T = TIERS[ti];
    const vx = Math.round(cam.x * T.f);
    const vy = Math.round(cam.y * T.f);
    const list = this.pool.filter((c) => c.active).sort((a, b) => a.y0 + a.k - (b.y0 + b.k));
    for (const c of list) {
      const k = Math.round(c.k); // whole pixel rows: x moves exactly two per row
      drawCraft(ctx, c.s, Math.round(c.x0) - vx + c.dir * 2 * k, Math.round(c.y0) - vy + k, c.dir > 0, c.trail, 0.5, c.phase, this.time);
    }
  }
}

// --- the level's air lanes -----------------------------------------------------------------------

const EXT = 30; // lanes run on this far past the level's ends: craft come in and go out off-screen
const POOL = 260; // every lane's cars at once (about 170 when the lanes are full)
const LEN = 4.5; // a craft's length along its lane, world units (no closer than this)

/**
 * The craft along the level's air lanes (world.traffic, worldgen.js: (x0, y0) -> (x1, y1) at height z,
 * a lane speed, a mean gap; `over`: high over the undercity's streets). A lane is straightened onto
 * its main axis, flown towards the camera, and carried on past both ends of the level. Lanes through
 * the drop ('drop') are lowered under the platforms' rim (z below 0), so the craft cross the cliff
 * faces, never the walkways. Each car has its class's pace with its own spread, brakes for a slower
 * car ahead, and enters at irregular (exponential) gaps once the one before has moved on.
 */
export class LaneTraffic {
  constructor(lanes, seed = 11) {
    this.rng = new RNG(seed);
    this.src = lanes;
    this.pool = Array.from({ length: POOL }, () => ({ active: false }));
    this.lanes = lanes.map((L) => {
      const alongX = Math.abs(L.x1 - L.x0) >= Math.abs(L.y1 - L.y0);
      const a0 = alongX ? Math.min(L.x0, L.x1) : Math.min(L.y0, L.y1);
      const a1 = alongX ? Math.max(L.x0, L.x1) : Math.max(L.y0, L.y1);
      const other = alongX ? (L.y0 + L.y1) / 2 : (L.x0 + L.x1) / 2;
      const kind = L.over ? 'over' : 'drop';
      const z = kind === 'over' ? L.z : -0.5 - L.z * 0.5; // the drop's lanes just under the rim
      return { L, alongX, a0: a0 - EXT, len: a1 - a0 + 2 * EXT, other, z, kind, next: 0, cars: [] };
    });
    this.time = 0;
    this.warm = false;
  }

  spawn(ln, d) {
    const c = this.pool.find((p) => !p.active);
    if (!c) return;
    const rng = this.rng;
    const [cls, s] = pickSprite(rng, this);
    const C = CLASSES[cls];
    c.active = true;
    c.s = s;
    c.d = d;
    c.want = ln.L.speed * C.pace * (0.9 + rng.next() * 0.2);
    c.v = c.want;
    c.trail = rng.next() < (ln.kind === 'over' ? 1 : C.trail) ? (rng.next() < 0.5 ? 'blue' : 'pink') : null;
    c.phase = rng.next() * 6.283;
    ln.cars.push(c);
  }

  update(dt) {
    if (!meta) return load();
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const rng = this.rng;
    for (const ln of this.lanes) {
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
    const a = ln.a0 + c.d;
    return ln.alongX ? [a, ln.other, ln.z] : [ln.other, a, ln.z];
  }

  /** Every car's world position of a kind (the overhead craft's light sweeps the street). */
  *positions(kind) {
    for (const ln of this.lanes) if (ln.kind === kind) for (const c of ln.cars) yield this.world(ln, c);
  }

  /**
   * The cars of a kind in view: [depth (x + y), screen x, y, lane, car], the screen point on whole
   * 2:1 pixel steps from the lane's start (so it never shimmers). The drop's go into the renderer's
   * depth-sorted list with the props and units; the overhead ones are drawn last.
   */
  visible(kind, cam, W, H) {
    const list = [];
    if (!meta) return list;
    for (const ln of this.lanes) {
      if (ln.kind !== kind) continue;
      const o = ln.alongX ? worldToScreen(ln.a0, ln.other, ln.z) : worldToScreen(ln.other, ln.a0, ln.z);
      const ox = Math.round(o.x) - cam.x;
      const oy = Math.round(o.y) - cam.y;
      for (const c of ln.cars) {
        const k = Math.round(c.d * HALF_H); // pixel rows down the lane; x moves two per row
        const sx = ox + (ln.alongX ? 2 * k : -2 * k);
        const sy = oy + k;
        if (sx < -100 || sy < -100 || sx > W + 100 || sy > H + 100) continue;
        list.push([ln.a0 + c.d + ln.other, sx, sy, ln, c]);
      }
    }
    return list;
  }

  /** Draw one car from visible(): world +x lanes run down-right (mirrored), +y down-left (as drawn). */
  drawItem(ctx, item) {
    const [, sx, sy, ln, c] = item;
    drawCraft(ctx, c.s, sx, sy, ln.alongX, c.trail, 1, c.phase, this.time);
  }

  /** Draw every car of a kind, farther first ('over': after everything else). */
  draw(ctx, cam, W, H, kind) {
    const list = this.visible(kind, cam, W, H).sort((a, b) => a[0] - b[0]);
    for (const it of list) this.drawItem(ctx, it);
  }
}
