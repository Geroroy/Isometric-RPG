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
  Promise.all([fetch(BASE + 'sprites/traffic/traffic.json').then((r) => r.json()), img('sprites/traffic/traffic.png'), img('sprites/traffic/traffic_half.png'), img('sprites/traffic/traffic_shadow.png')])
    .then(([m, a, b, sh]) => {
      meta = m;
      full = a;
      halfImg = b;
      shadowImg = sh;
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

/** One craft centred on screen point (x, y), from the full atlas (k = 1) or the halved one (k = 0.5). */
function drawCraft(ctx, v, x, y, k) {
  const img = k === 1 ? full : halfImg;
  ctx.globalCompositeOperation = 'source-over'; // (the overhead pass comes straight after the additive effects)
  ctx.globalAlpha = 1;
  const w = Math.ceil(v.w * k);
  const h = Math.ceil(v.h * k);
  ctx.drawImage(img, v.x * k, v.y * k, w, h, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

// --- far off over the city -----------------------------------------------------------------------

/** The far traffic: drawn after this backdrop tower layer, with this parallax. */
export const TIERS = [{ after: 1, f: 0.16, max: 24, rate: 1.2, band: [0.06, 0.7], speed: [9, 18] }];
const MARGIN = 60; // beyond the view's edge, tier px

/** Small craft crossing the distant city on straight iso diagonals (tier space = parallax space). */
export class SkylineTraffic {
  constructor(seed = 7) {
    this.rng = new RNG(seed);
    this.pool = Array.from({ length: TIERS[0].max }, () => ({ active: false }));
    this.next = 0;
    this.time = 0;
    this.warm = false;
  }

  spawn(cam, W, H, t0 = 0, isSky = null) {
    const T = TIERS[0];
    const c = this.pool.find((p) => !p.active);
    if (!c) return;
    const rng = this.rng;
    const vx = cam.x * T.f;
    const vy = cam.y * T.f;
    c.sx = rng.next() < 0.5 ? -2 : 2; // screen step per row: x two, y one, down or up
    c.sy = rng.next() < 0.5 ? -1 : 1;
    // a line through a point in the middle band, run from one side of the view to the other — a
    // point where the sky shows (isSky: the drop past the platforms' walls), when there is one
    let px = 0;
    let py = 0;
    for (let n = 0; n < 16; n++) {
      px = W * (0.04 + rng.next() * 0.92);
      py = H * (T.band[0] + rng.next() * (T.band[1] - T.band[0]));
      if (!isSky || isSky(px, py)) break;
    }
    const cx = vx + px;
    const cy = vy + py;
    c.rows = (W + 2 * MARGIN) / 2; // rows it takes to cross the whole view and then some
    c.x0 = Math.round(cx - (c.sx * c.rows) / 2);
    c.y0 = Math.round(cy - (c.sy * c.rows) / 2);
    c.v = T.speed[0] + rng.next() * (T.speed[1] - T.speed[0]); // rows a second
    c.k = t0 * c.rows;
    c.view = pickCraft(rng, this).views[viewOf(c.sx, c.sy)];
    c.active = true;
  }

  update(dt, cam, W, H, mode, isSky = null) {
    if (!meta) return load();
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const T = TIERS[0];
    const busy = mode === 'low' ? 0.6 : 1;
    // a new view (the title's wide shot → the game's, a zoom step, the other level): the sky starts
    // over, already full, for this view — not the craft spread over the last one's
    const key = W + 'x' + H + mode;
    if (this.key !== key) {
      this.key = key;
      for (const c of this.pool) c.active = false;
      this.warm = false;
    }
    if (!this.warm) {
      // already flying when the level opens
      this.warm = true;
      for (let i = 0; i < Math.round(T.max * 0.6 * busy); i++) this.spawn(cam, W, H, this.rng.next(), isSky);
    }
    for (const c of this.pool) {
      if (!c.active) continue;
      c.k += c.v * dt;
      if (c.k > c.rows) c.active = false; // across and off the far side: back to the pool
    }
    this.next -= dt;
    if (this.next <= 0) {
      this.spawn(cam, W, H, 0, isSky);
      this.next = -Math.log(1 - this.rng.next() * 0.999) / (T.rate * busy);
    }
  }

  draw(ctx, ti, cam) {
    if (!meta) return;
    const T = TIERS[ti];
    const vx = Math.round(cam.x * T.f);
    const vy = Math.round(cam.y * T.f);
    const list = this.pool.filter((c) => c.active).sort((a, b) => a.y0 + a.sy * a.k - (b.y0 + b.sy * b.k));
    for (const c of list) {
      const k = Math.round(c.k); // whole rows: x moves exactly two per row
      drawCraft(ctx, c.view, c.x0 - vx + c.sx * k, c.y0 - vy + c.sy * k, 0.5);
    }
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
