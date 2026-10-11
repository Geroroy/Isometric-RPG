// Coruscant's sky traffic (docs/SKYLINE_TRAFFIC.md), in three depths: the far traffic over the
// distant city (SkylineTraffic, below), the speeders in the level's own air lanes through the drop
// between the platforms, and those crossing high overhead (LaneTraffic, at the end) — the craft
// that replaced the streaks of light that used to run along those lanes.
//
// The far traffic: speeders streaming across the city beyond the platforms' edges, in two
// altitude tiers drawn into the backdrop (gfx/cityBackdrop.js) — the deeper between its middle and
// nearest tower layers, the other in front of them all (the towers cover most of the sky: traffic
// behind two layers was hardly seen) — before the terrain, so never over the map or its props. The sprites are the vehicle sheet's (tools/sprites/traffic/extract.py), all drawn facing
// down-left; the down-right lanes mirror them. Each vehicle flies a cubic Bézier along an isometric
// diagonal, bent a little so lanes weave instead of ruling straight lines, at its class's speed
// (racers and sedans quick, freighters sluggish) with a slow surge and a hover bob; the near tier
// trails pink or blue engine wake. Vehicles come from a fixed pool per tier: spawned off-screen at
// random (Poisson) times in lanes kept apart, recycled when they leave the view.
import { RNG } from '../core/math.js';
import { worldToScreen } from '../core/iso.js';

const BASE = import.meta.env.BASE_URL;

// vehicle classes: speed range (tier px/s at the near tier's pace) and how often they fly
const CLASSES = {
  swoop: { speed: [190, 260], weight: 0.16, trail: 1 },
  cruiser: { speed: [140, 190], weight: 0.26, trail: 0.8 },
  commuter: { speed: [95, 135], weight: 0.42, trail: 0.5 },
  cargo: { speed: [45, 70], weight: 0.16, trail: 0.15 },
};

/**
 * Altitude tiers, far → near. `after`: drawn after that backdrop tower layer; `f`: parallax (the
 * backdrop's layers are 0.1 / 0.22 / 0.38); `scale` of the sheet's size; `haze` mixed into the
 * colours; `max` vehicles in the pool; `rate` new ones a second; `band`: the screen heights
 * (fraction of the view) their lanes cross the middle of the view at; `pace` × the class speed;
 * `trail` × the class's chance of an engine wake; `beacon`: blinking running lights; `glow`: a faint
 * neon underglow (the far tiers', where the sprites alone sink into the haze).
 */
export const TIERS = [
  { name: 'deep', after: 1, f: 0.16, scale: 0.34, haze: 0.4, max: 30, rate: 2.4, band: [0.04, 0.5], pace: 0.32, trail: 0, beacon: 1, glow: 0.5 },
  { name: 'mid', after: 2, f: 0.3, scale: 0.6, haze: 0.2, max: 14, rate: 0.9, band: [0.0, 0.55], pace: 0.62, trail: 0.45, beacon: 0.6, glow: 0.3 },
];
const MARGIN = 90; // off-screen spawn / recycle margin, tier px
// underglow colours: the plaza's warm dusk, the undercity's neon
const NEON = { up: ['255,200,140', '200,220,255', '255,150,110'], low: ['255,90,190', '90,230,255', '140,255,170', '255,170,80'] };

let meta = null;
let atlas = null;
let loading = false;
function load() {
  if (loading) return;
  loading = true;
  const img = new Image();
  Promise.all([
    fetch(BASE + 'sprites/traffic/traffic.json').then((r) => r.json()),
    new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = BASE + 'sprites/traffic/traffic.png';
    }),
  ])
    .then(([m]) => {
      meta = m;
      atlas = img;
    })
    .catch((e) => console.warn('skyline traffic: no sprites', e));
}

// the atlas per tier and backdrop: downscaled smoothly once (no shimmer from nearest-sampling a
// shrunken sprite), tinted toward that backdrop's haze
const tinted = new Map();
function tierAtlas(ti, mode, haze) {
  const key = mode + ti;
  let c = tinted.get(key);
  if (c) return c;
  const T = TIERS[ti];
  c = document.createElement('canvas');
  c.width = Math.ceil(atlas.width * T.scale);
  c.height = Math.ceil(atlas.height * T.scale);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(atlas, 0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = `rgba(${haze[0]},${haze[1]},${haze[2]},${T.haze})`;
  x.fillRect(0, 0, c.width, c.height);
  tinted.set(key, c);
  return c;
}

const bez = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/** One speeder: its route, pace and look; reused from the tier's pool. */
export class TrafficVehicle {
  constructor() {
    this.active = false;
  }

  /** Start a run across the view (tier space) from `p0` to `p3`, bent through p1, p2. */
  spawn(sprite, mirror, pts, speed, trail, beacon, rng, t0 = 0) {
    this.active = true;
    this.sprite = sprite;
    this.mirror = mirror;
    this.pts = pts;
    // arc length ~ the control polygon's mean with the chord
    const [a, b, c, d] = pts;
    const poly = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]) + Math.hypot(d[0] - c[0], d[1] - c[1]);
    const len = (poly + Math.hypot(d[0] - a[0], d[1] - a[1])) / 2;
    this.dur = len / speed;
    this.t = t0;
    this.trail = trail; // null | 'pink' | 'blue'
    this.beacon = beacon;
    this.phase = rng.next() * 6.283;
    this.surge = 0.04 + rng.next() * 0.06; // ± speed swell
    this.bob = 0.4 + rng.next() * 0.8; // hover, tier px
    this.age = 0;
  }

  /** Advance; false when the run is over (back to the pool). */
  update(dt) {
    this.age += dt;
    this.t += (dt / this.dur) * (1 + this.surge * Math.sin(this.age * 0.9 + this.phase));
    return this.t < 1;
  }

  pos() {
    const [a, b, c, d] = this.pts;
    const t = this.t;
    return [bez(a[0], b[0], c[0], d[0], t), bez(a[1], b[1], c[1], d[1], t) + this.bob * Math.sin(this.age * 2.1 + this.phase)];
  }

  /** Off the view (tier space) by more than the margin — the camera may have moved away. */
  outside(vx, vy, W, H) {
    const [x, y] = this.pos();
    return x < vx - MARGIN * 2 || x > vx + W + MARGIN * 2 || y < vy - MARGIN * 2 || y > vy + H + MARGIN * 2;
  }

  draw(ctx, img, k, vx, vy, now, wake, glow, neon) {
    const s = this.sprite;
    const [px, py] = this.pos();
    const w = Math.round(s.w * k);
    const h = Math.round(s.h * k);
    if (glow) {
      // repulsorlift underglow: a soft neon pool under the hull
      const gx = px - vx;
      const gy = py - vy + h * 0.25;
      const r = Math.max(4, w * 0.6);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(${neon},${glow})`);
      g.addColorStop(1, `rgba(${neon},0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.setTransform(1, 0, 0, 0.45, 0, gy * 0.55); // flattened: a pool, not a ball
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    // the sprite's top-left so that its centre sits on the route
    let x = Math.round(px - vx - w / 2);
    const y = Math.round(py - vy - h / 2);
    const rear = [s.rear[0] * k, s.rear[1] * k];
    const rx = this.mirror ? x + w - rear[0] : x + rear[0];
    const ry = y + rear[1];
    if (this.trail && wake) {
      const tr = meta.trails[this.trail];
      const tw = Math.round(tr.w * k * 1.6);
      const th = Math.round(tr.h * k * 1.6);
      const hx = tr.head[0] * k * 1.6;
      const hy = tr.head[1] * k * 1.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(now * 23 + this.phase);
      // the streak's head on the rear, its length running back up the lane
      const sx = Math.round(tr.x * k);
      const sy = Math.round(tr.y * k);
      const sw = Math.round(tr.w * k);
      const sh = Math.round(tr.h * k);
      if (this.mirror) {
        ctx.setTransform(-1, 0, 0, 1, Math.round(rx + hx), 0);
        ctx.drawImage(img, sx, sy, sw, sh, 0, Math.round(ry - hy), tw, th);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else ctx.drawImage(img, sx, sy, sw, sh, Math.round(rx - hx), Math.round(ry - hy), tw, th);
      // the engine's hot core
      const col = this.trail === 'pink' ? '255,120,220' : '120,190,255';
      const r = Math.max(2, 6 * k);
      const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, r);
      g.addColorStop(0, `rgba(${col},0.9)`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(rx - r, ry - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const sx = Math.round(s.x * k);
    const sy = Math.round(s.y * k);
    if (this.mirror) {
      ctx.setTransform(-1, 0, 0, 1, x + w, y);
      ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else ctx.drawImage(img, sx, sy, w, h, x, y, w, h);
    if (this.beacon) {
      // running lights: a red blink on the rear, a white one on the nose
      const on = Math.sin(now * 5 + this.phase * 3) > 0.55;
      if (on) {
        ctx.fillStyle = 'rgba(255,70,60,0.95)';
        ctx.fillRect(Math.round(rx), Math.round(ry), 1, 1);
      }
      const nose = [s.nose[0] * k, s.nose[1] * k];
      ctx.fillStyle = 'rgba(255,245,220,0.8)';
      ctx.fillRect(Math.round(this.mirror ? x + w - nose[0] : x + nose[0]), Math.round(y + nose[1]), 1, 1);
    }
  }
}

/** The manager: a pool per tier, spawning, routing, recycling, drawing between the tower layers. */
export class SkylineTraffic {
  constructor(seed = 7) {
    this.rng = new RNG(seed);
    this.pools = TIERS.map((T) => Array.from({ length: T.max }, () => new TrafficVehicle()));
    this.next = TIERS.map(() => 0); // seconds to the next spawn per tier
    this.lanes = TIERS.map(() => []); // recent lane starts per tier: { y, dir, at }
    this.time = 0;
    this.warm = false;
  }

  pickSprite(rng) {
    let u = rng.next();
    let cls = 'commuter';
    for (const [k, c] of Object.entries(CLASSES)) {
      if (u < c.weight) {
        cls = k;
        break;
      }
      u -= c.weight;
    }
    const list = (this.byClass ||= Object.fromEntries(Object.keys(CLASSES).map((k) => [k, meta.vehicles.filter((v) => v.cls === k)])))[cls];
    return [cls, rng.pick(list.length ? list : meta.vehicles)];
  }

  /** A lane across the view in tier space: an iso-ish diagonal, flattened a little, bent twice. */
  route(ti, vx, vy, W, H, dir, rng) {
    const T = TIERS[ti];
    const slope = 0.15 + rng.next() * 0.3; // 0.5 is the iso diagonal; flatter reads as cruising
    const span = W + 2 * MARGIN;
    // the lane crosses the middle of the view at its band's height (so it is on screen, over the drop)
    const y0 = vy + H * (T.band[0] + rng.next() * (T.band[1] - T.band[0])) - (span * slope) / 2;
    const x0 = dir < 0 ? vx + W + MARGIN : vx - MARGIN;
    const x3 = x0 + dir * span;
    const y3 = y0 + span * slope;
    // bends perpendicular to the chord, opposite at the two control points: a gentle S
    const len = Math.hypot(x3 - x0, y3 - y0);
    const nx = -(y3 - y0) / len;
    const ny = (x3 - x0) / len;
    const b1 = (rng.next() - 0.5) * len * 0.18;
    const b2 = (rng.next() - 0.5) * len * 0.18;
    return [
      [x0, y0],
      [x0 + (x3 - x0) / 3 + nx * b1, y0 + (y3 - y0) / 3 + ny * b1],
      [x0 + (2 * (x3 - x0)) / 3 + nx * b2, y0 + (2 * (y3 - y0)) / 3 + ny * b2],
      [x3, y3],
    ];
  }

  spawn(ti, cam, W, H, t0 = 0) {
    const T = TIERS[ti];
    const v = this.pools[ti].find((p) => !p.active);
    if (!v) return;
    const rng = this.rng;
    const vx = cam.x * T.f;
    const vy = cam.y * T.f;
    const dir = rng.next() < 0.5 ? -1 : 1; // -1: down-left (as drawn), 1: down-right (mirrored)
    // keep lanes apart: no start within 14 px (tier) of a lane opened the last 2.5 s the same way
    let pts = null;
    for (let tries = 0; tries < 4 && !pts; tries++) {
      const p = this.route(ti, vx, vy, W, H, dir, rng);
      const clash = this.lanes[ti].some((l) => l.dir === dir && this.time - l.at < 2.5 && Math.abs(l.y - (p[0][1] - vy)) < 14);
      if (!clash) pts = p;
    }
    if (!pts) return;
    this.lanes[ti].push({ y: pts[0][1] - vy, dir, at: this.time });
    if (this.lanes[ti].length > 12) this.lanes[ti].shift();
    const [cls, sprite] = this.pickSprite(rng);
    const C = CLASSES[cls];
    const speed = (C.speed[0] + rng.next() * (C.speed[1] - C.speed[0])) * T.pace;
    const trail = rng.next() < T.trail * C.trail ? (rng.next() < 0.55 ? 'blue' : 'pink') : null;
    v.spawn(sprite, dir > 0, pts, speed, trail, rng.next() < T.beacon, rng, t0);
    v.neon = rng.pick(NEON[this.mode] || NEON.up);
  }

  /** Advance the traffic: spawning on the tiers' Poisson clocks, recycling what has left. */
  update(dt, cam, W, H, mode) {
    if (!meta) return load();
    this.mode = mode;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const busy = mode === 'low' ? 0.7 : 1; // the undercity's smog: fewer craft that low
    if (!this.warm) {
      // the sky is already busy when the level opens: runs started at random points of their routes
      this.warm = true;
      TIERS.forEach((T, ti) => {
        const n = Math.round(T.max * 0.6 * busy);
        for (let i = 0; i < n; i++) this.spawn(ti, cam, W, H, this.rng.next());
      });
    }
    TIERS.forEach((T, ti) => {
      const vx = cam.x * T.f;
      const vy = cam.y * T.f;
      for (const v of this.pools[ti]) if (v.active && (!v.update(dt) || v.outside(vx, vy, W, H))) v.active = false;
      this.next[ti] -= dt;
      if (this.next[ti] <= 0) {
        this.spawn(ti, cam, W, H);
        this.next[ti] = -Math.log(1 - this.rng.next() * 0.999) / (T.rate * busy); // exponential gaps: no rhythm, no convoys
      }
    });
  }

  /** Draw one tier (after the backdrop's tower layer TIERS[ti].after). */
  draw(ctx, ti, cam, mode, haze) {
    if (!meta) return;
    const T = TIERS[ti];
    const img = tierAtlas(ti, mode, haze);
    const vx = Math.round(cam.x * T.f);
    const vy = Math.round(cam.y * T.f);
    const act = this.pools[ti].filter((v) => v.active);
    act.sort((a, b) => a.pos()[1] - b.pos()[1]); // higher (farther) first
    for (const v of act) v.draw(ctx, img, T.scale, vx, vy, this.time, T.trail > 0, T.glow, v.neon);
  }
}

// --- the level's air lanes ------------------------------------------------------------------------

const LANE_SCALE = { drop: 0.85, over: 1.05 }; // of the sheet's size: the drop's craft, the ones overhead
const LANE_HAZE = { drop: 0.12, over: 0 };
const POOL = 80;

/** A speeder on a lane: where along it, how fast it wants to go and goes, its look and its wobble. */
class LaneCar {
  constructor() {
    this.active = false;
  }
}

/**
 * The craft along the level's air lanes (world.traffic, worldgen.js: (x0, y0) -> (x1, y1) at height z,
 * a lane speed and a mean gap; `over`: high above the undercity's streets). Every lane is flown
 * towards the camera (down the screen) — the sheet draws its craft from the front only, so a lane
 * running away would show them reversing. Each car keeps its own pace around the lane's (a class
 * spread and a slow surge), brakes for a slower car ahead (no passing through each other), weaves
 * a little across the lane and bobs on its repulsors; new cars enter at random (exponential) gaps
 * once the one before has cleared the entry. One pool for all lanes.
 */
export class LaneTraffic {
  constructor(lanes, seed = 11) {
    this.rng = new RNG(seed);
    this.src = lanes;
    this.pool = Array.from({ length: POOL }, () => new LaneCar());
    this.lanes = lanes.map((L) => {
      // flown towards the camera: world +x (down-right) or +y (down-left) along the main axis
      const dx = L.x1 - L.x0;
      const dy = L.y1 - L.y0;
      const away = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0;
      const [x0, y0, x1, y1] = away ? [L.x1, L.y1, L.x0, L.y0] : [L.x0, L.y0, L.x1, L.y1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      return { L, x0, y0, z: L.z, ux: (x1 - x0) / len, uy: (y1 - y0) / len, len, mirror: Math.abs(x1 - x0) >= Math.abs(y1 - y0), kind: L.over ? 'over' : 'drop', next: 0, cars: [] };
    });
    this.time = 0;
    this.warm = false;
  }

  spawn(ln, d) {
    const c = this.pool.find((p) => !p.active);
    if (!c || !meta) return null;
    const rng = this.rng;
    const [cls, sprite] = SkylineTraffic.prototype.pickSprite.call(this, rng);
    const C = CLASSES[cls];
    // the class sets the pace around the lane's: racers quicker, freighters slower
    const k = { swoop: 1.3, cruiser: 1.15, commuter: 1, cargo: 0.72 }[cls];
    c.active = true;
    c.sprite = sprite;
    c.d = d;
    c.want = ln.L.speed * k * (0.88 + rng.next() * 0.24);
    c.v = c.want;
    c.phase = rng.next() * 6.283;
    c.surge = 0.05 + rng.next() * 0.07;
    c.weave = (0.15 + rng.next() * 0.35) * (rng.next() < 0.5 ? -1 : 1); // world units across the lane
    c.weaveF = 0.08 + rng.next() * 0.1;
    c.dz = (rng.next() - 0.5) * 1.2; // a little above or below the lane
    c.trail = rng.next() < C.trail * (ln.kind === 'over' ? 1 : 0.8) ? (rng.next() < 0.5 ? 'blue' : 'pink') : null;
    c.age = 0;
    ln.cars.push(c);
    return c;
  }

  update(dt) {
    if (!meta) return load();
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const rng = this.rng;
    for (const ln of this.lanes) {
      const mean = ln.L.gap / ln.L.speed; // seconds between cars on average
      if (!this.warm) {
        // the lanes are already flowing when the level opens
        for (let d = rng.next() * ln.L.gap; d < ln.len; d += ln.L.gap * (0.5 + rng.next())) this.spawn(ln, d);
        ln.cars.sort((a, b) => b.d - a.d);
        ln.next = rng.next() * mean;
      }
      // front to back: each car speeds up to its own pace, or brakes behind the one ahead
      for (let i = 0; i < ln.cars.length; i++) {
        const c = ln.cars[i];
        c.age += dt;
        let target = c.want * (1 + c.surge * Math.sin(c.age * 0.7 + c.phase));
        const ahead = ln.cars[i - 1];
        if (ahead) {
          const gap = ahead.d - c.d;
          if (gap < 3) target = Math.min(target, ahead.v * (gap < 1.8 ? 0.85 : 1));
        }
        c.v += (target - c.v) * Math.min(1, dt * 1.5);
        c.d += c.v * dt;
      }
      // recycle what has run off the lane's end
      while (ln.cars.length && ln.cars[0].d > ln.len) ln.cars.shift().active = false;
      ln.next -= dt;
      const last = ln.cars[ln.cars.length - 1];
      if (ln.next <= 0 && (!last || last.d > 3)) {
        this.spawn(ln, 0);
        ln.next = mean * (0.35 + -Math.log(1 - rng.next() * 0.999) * 0.75); // irregular: bunches and lulls
      }
    }
    this.warm = true;
  }

  /** Where a car is: along its lane, weaving across it, bobbing. */
  place(ln, c) {
    const w = c.weave * Math.sin(c.d * c.weaveF * 6.283 + c.phase);
    const x = ln.x0 + ln.ux * c.d - ln.uy * w;
    const y = ln.y0 + ln.uy * c.d + ln.ux * w;
    const z = ln.z + c.dz + 0.06 * Math.sin(c.age * 2.3 + c.phase);
    return [x, y, z];
  }

  /** Every car's world position (for the overhead craft's light sweeping the street). */
  *positions(kind) {
    for (const ln of this.lanes) if (ln.kind === kind) for (const c of ln.cars) yield this.place(ln, c);
  }

  laneAtlas(kind, haze) {
    const k = LANE_SCALE[kind];
    const key = 'lane' + kind + haze.join();
    let img = tinted.get(key);
    if (!img) {
      img = document.createElement('canvas');
      img.width = Math.ceil(atlas.width * k);
      img.height = Math.ceil(atlas.height * k);
      const x = img.getContext('2d');
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(atlas, 0, 0, img.width, img.height);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(${haze[0]},${haze[1]},${haze[2]},${LANE_HAZE[kind]})`;
      x.fillRect(0, 0, img.width, img.height);
      tinted.set(key, img);
    }
    return img;
  }

  /**
   * The cars of one kind in view: [depth (x + y), screen x, y, lane, car]. The drop's go into the
   * renderer's depth-sorted list with the props and the units (in front of the platform behind
   * them and its facade, behind whatever stands nearer); the overhead ones are drawn last.
   */
  visible(kind, cam, W, H) {
    const list = [];
    if (!meta) return list;
    for (const ln of this.lanes) {
      if (ln.kind !== kind) continue;
      for (const c of ln.cars) {
        const [x, y, z] = this.place(ln, c);
        const s = worldToScreen(x, y, z);
        const sx = s.x - cam.x;
        const sy = s.y - cam.y;
        if (sx < -120 || sy < -120 || sx > W + 120 || sy > H + 120) continue;
        list.push([x + y, sx, sy, ln, c]);
      }
    }
    return list;
  }

  /** Draw one car from visible(). */
  drawItem(ctx, item, kind, haze) {
    const [, sx, sy, ln, c] = item;
    drawCar(ctx, this.laneAtlas(kind, haze), LANE_SCALE[kind], sx, sy, c, ln.mirror, this.time);
  }

  /** Draw every car of a kind, farther first ('over': after everything else). */
  draw(ctx, cam, W, H, kind, haze) {
    const list = this.visible(kind, cam, W, H).sort((a, b) => a[0] - b[0]);
    for (const it of list) this.drawItem(ctx, it, kind, haze);
  }
}

const drawer = new TrafficVehicle();
function drawCar(ctx, img, k, sx, sy, c, mirror, now) {
  drawer.sprite = c.sprite;
  drawer.mirror = mirror;
  drawer.trail = c.trail;
  drawer.beacon = true;
  drawer.phase = c.phase;
  drawer.age = c.age;
  drawer.bob = 0;
  drawer.pts = [[sx, sy], [sx, sy], [sx, sy], [sx, sy]];
  drawer.t = 0;
  drawer.draw(ctx, img, k, 0, 0, now, true, 0, null);
}
