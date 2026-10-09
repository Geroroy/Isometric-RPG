// Open-world generation: the outskirts of Christophsis during the Clone Wars.
// Republic forward base in the south, Separatist droid camps scattered across
// dusty plains, crystal fields, rocky highlands, scorched battlefields and the
// ruins of an old crystal city; a droid factory stronghold far to the north.
import { RNG, fbm, dist, distToSegment, clamp } from '../core/math.js';
import { PROPS } from '../gfx/models/props.js';

export const MAP_W = 192;
export const MAP_H = 192;

export const BIOME = {
  DUST: 0,
  ROCK: 1,
  CRYSTAL: 2,
  SCORCH: 3,
  RUIN: 4,
  BASE: 5,
  GRASS: 6,
  HANGAR: 7,
};

export const BIOME_NAMES = {
  0: '먼지 평원',
  1: '잿빛 고원',
  2: '수정 평원',
  3: '격전지',
  4: '고대 도시 폐허',
  5: '공화국 전진 기지',
  6: '마른 초원',
  7: '지오노시스 · 비밀 격납고',
};

export const BASE_POS = { x: 150, y: 152 };
export const FACTORY_POS = { x: 36, y: 40 };
const RUIN_CENTERS = [
  { x: 62, y: 128, r: 17, name: '은빛 첨탑 폐허' },
  { x: 118, y: 62, r: 15, name: '수정 성채 폐허' },
];

export class World {
  constructor(seed = 501) {
    this.seed = seed;
    this.w = MAP_W;
    this.h = MAP_H;
    const n = MAP_W * MAP_H;
    this.biome = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.road = new Float32Array(n).fill(99);
    this.explored = new Uint8Array(n);
    this.props = [];
    this.camps = [];
    this.craters = [];
    this.lights = [];
    this.guards = [];
    this.pois = [];
    this.generate();
  }

  idx(x, y) {
    return y * MAP_W + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }
  isBlocked(x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return true;
    return this.blocked[ty * MAP_W + tx] !== 0;
  }
  biomeAt(x, y) {
    const tx = clamp(Math.floor(x), 0, MAP_W - 1);
    const ty = clamp(Math.floor(y), 0, MAP_H - 1);
    return this.biome[ty * MAP_W + tx];
  }

  regionName(x, y) {
    for (const p of this.pois) if (dist(x, y, p.x, p.y) < p.r) return p.name;
    return BIOME_NAMES[this.biomeAt(x, y)];
  }

  // --------------------------------------------------------------------------

  generate() {
    const rng = (this.rng = new RNG(this.seed));
    const S = this.seed;

    this.pois.push({ ...BASE_POS, r: 17, name: '공화국 전진 기지' });
    this.pois.push({ ...FACTORY_POS, r: 16, name: '분리주의 드로이드 공장' });
    for (const rc of RUIN_CENTERS) this.pois.push(rc);

    // 1) Biomes from layered noise + authored regions.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const e = fbm(x / 36, y / 36, S + 11);
        const c = fbm(x / 28, y / 28, S + 23);
        const g = fbm(x / 24, y / 24, S + 37);
        const sc = fbm(x / 22, y / 22, S + 51);
        let b = BIOME.DUST;
        if (e > 0.6) b = BIOME.ROCK;
        else if (c > 0.6) b = BIOME.CRYSTAL;
        else if (g > 0.62) b = BIOME.GRASS;
        if (b !== BIOME.ROCK && sc > 0.6 && dist(x, y, BASE_POS.x, BASE_POS.y) > 26) b = BIOME.SCORCH;
        for (const rc of RUIN_CENTERS) {
          const edge = rc.r + (fbm(x / 6, y / 6, S + 71) - 0.5) * 8;
          if (dist(x, y, rc.x, rc.y) < edge) b = BIOME.RUIN;
        }
        const dbx = Math.abs(x - BASE_POS.x);
        const dby = Math.abs(y - BASE_POS.y);
        if (Math.max(dbx, dby) < 14 + (fbm(x / 5, y / 5, S + 91) - 0.5) * 3) b = BIOME.BASE;
        const df = dist(x, y, FACTORY_POS.x, FACTORY_POS.y);
        if (df < 15 + (fbm(x / 5, y / 5, S + 93) - 0.5) * 5) b = BIOME.SCORCH;
        this.biome[y * MAP_W + x] = b;
      }
    }

    // 2) Camps (Separatist outposts), spaced out, harder further from base.
    const campSpots = [];
    let tries = 0;
    while (campSpots.length < 15 && tries++ < 4000) {
      const x = rng.range(14, MAP_W - 14);
      const y = rng.range(14, MAP_H - 14);
      const db = dist(x, y, BASE_POS.x, BASE_POS.y);
      if (db < 26) continue;
      if (dist(x, y, FACTORY_POS.x, FACTORY_POS.y) < 26) continue;
      if (campSpots.some((c) => dist(c.x, c.y, x, y) < 24)) continue;
      if (RUIN_CENTERS.some((r) => dist(r.x, r.y, x, y) < r.r - 4)) continue;
      campSpots.push({ x, y });
    }
    // The first camp close to the base acts as an easy tutorial camp.
    campSpots.unshift({ x: BASE_POS.x - 32, y: BASE_POS.y - 6 });

    // 3) Roads from the base to camps, ruins and the factory.
    const roadSegs = [];
    const addRoad = (ax, ay, bx, by) => {
      let px = ax;
      let py = ay;
      const steps = Math.max(2, Math.floor(dist(ax, ay, bx, by) / 12));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        let nx = ax + (bx - ax) * t;
        let ny = ay + (by - ay) * t;
        if (i < steps) {
          nx += rng.range(-4, 4);
          ny += rng.range(-4, 4);
        }
        roadSegs.push([px, py, nx, ny]);
        px = nx;
        py = ny;
      }
    };
    const hubs = [BASE_POS, ...RUIN_CENTERS, FACTORY_POS];
    addRoad(BASE_POS.x, BASE_POS.y, RUIN_CENTERS[0].x, RUIN_CENTERS[0].y);
    addRoad(BASE_POS.x, BASE_POS.y, RUIN_CENTERS[1].x, RUIN_CENTERS[1].y);
    addRoad(RUIN_CENTERS[0].x, RUIN_CENTERS[0].y, FACTORY_POS.x, FACTORY_POS.y);
    addRoad(RUIN_CENTERS[1].x, RUIN_CENTERS[1].y, FACTORY_POS.x, FACTORY_POS.y);
    for (const c of campSpots) {
      let best = hubs[0];
      for (const h of hubs) if (dist(h.x, h.y, c.x, c.y) < dist(best.x, best.y, c.x, c.y)) best = h;
      addRoad(best.x, best.y, c.x, c.y);
    }
    for (const [ax, ay, bx, by] of roadSegs) {
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - 4));
      const x1 = Math.min(MAP_W - 1, Math.ceil(Math.max(ax, bx) + 4));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - 4));
      const y1 = Math.min(MAP_H - 1, Math.ceil(Math.max(ay, by) + 4));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
          const i = y * MAP_W + x;
          if (d < this.road[i]) this.road[i] = d;
        }
      }
    }
    this.roadSegs = roadSegs;

    // 4) Map edge cliffs.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
        const lim = 3 + fbm(x / 7, y / 7, S + 5) * 4;
        if (edge < lim) {
          this.blocked[y * MAP_W + x] = 2;
          this.biome[y * MAP_W + x] = BIOME.ROCK;
        }
      }
    }
    for (let y = 1; y < MAP_H; y += 2) {
      for (let x = 1; x < MAP_W; x += 2) {
        const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
        const lim = 3 + fbm(x / 7, y / 7, S + 5) * 4;
        if (edge < lim && edge > lim - 3.5) this.addProp('cliff', x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), { noBlock: true });
      }
    }

    // 5) Authored areas.
    this.buildBase();
    this.buildFactory();
    for (const rc of RUIN_CENTERS) this.buildRuins(rng, rc);
    campSpots.forEach((c, i) => this.buildCamp(rng, c.x, c.y, i === 0 ? 1 : null));

    // 6) Scatter natural props.
    const reserved = (x, y) =>
      this.road[y * MAP_W + x] < 2.2 ||
      this.camps.some((c) => dist(c.x, c.y, x, y) < 7) ||
      dist(x, y, BASE_POS.x, BASE_POS.y) < 18 ||
      dist(x, y, FACTORY_POS.x, FACTORY_POS.y) < 13;
    for (let y = 2; y < MAP_H - 2; y++) {
      for (let x = 2; x < MAP_W - 2; x++) {
        const i = y * MAP_W + x;
        if (this.blocked[i] || reserved(x, y)) continue;
        const b = this.biome[i];
        const r = rng.next();
        const px = x + rng.range(0.25, 0.75);
        const py = y + rng.range(0.25, 0.75);
        const put = (type) => this.addProp(type, px, py);
        switch (b) {
          case BIOME.DUST:
            if (r < 0.014) put('rock');
            else if (r < 0.026) put('scrub');
            else if (r < 0.03) put('droidDebris');
            break;
          case BIOME.ROCK:
            if (r < 0.05) put('rock');
            else if (r < 0.072) put('boulder');
            else if (r < 0.078) put('deadTree');
            break;
          case BIOME.CRYSTAL:
            if (r < 0.05) put('crystal');
            else if (r < 0.056) put('crystalSpire');
            else if (r < 0.066) put('rock');
            break;
          case BIOME.SCORCH:
            if (r < 0.003) put('aatWreck');
            else if (r < 0.03) put('droidDebris');
            else if (r < 0.038) put('deadTree');
            else if (r < 0.046) put('rock');
            if (rng.chance(0.012)) this.craters.push({ x: px, y: py, r: rng.range(0.8, 2.2) });
            break;
          case BIOME.GRASS:
            if (r < 0.07) put('scrub');
            else if (r < 0.08) put('deadTree');
            else if (r < 0.09) put('rock');
            break;
          default:
            break;
        }
        if (b === BIOME.DUST && rng.chance(0.002)) this.craters.push({ x: px, y: py, r: rng.range(0.8, 1.6) });
      }
    }

    this.props.sort((a, b) => a.x + a.y - (b.x + b.y));
  }

  addProp(type, x, y, opts = {}) {
    const def = PROPS[type];
    const angles = def.angles || [0];
    const variant = opts.variant ?? Math.floor(this.rng.next() * def.variants);
    const angleIdx = opts.angleIdx ?? Math.floor(this.rng.next() * angles.length);
    const p = { type, x, y, variant, angleIdx, frameIdx: variant * angles.length + angleIdx, flat: !!def.flat };
    const rect = def.rectByAngle ? def.rectByAngle[angleIdx] : def.rect;
    if (!opts.noBlock) {
      if (rect) {
        const [w, h] = rect;
        for (let ty = Math.floor(y - h / 2 + 0.01); ty < Math.ceil(y + h / 2 - 0.01); ty++)
          for (let tx = Math.floor(x - w / 2 + 0.01); tx < Math.ceil(x + w / 2 - 0.01); tx++)
            if (this.inBounds(tx, ty)) this.blocked[ty * MAP_W + tx] = 1;
        p.rect = rect;
      } else if (def.block > 0) {
        const r = def.block;
        for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
          for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)
            if (this.inBounds(tx, ty) && dist(tx + 0.5, ty + 0.5, x, y) <= r + 0.2) this.blocked[ty * MAP_W + tx] = 1;
      }
    }
    if (def.light) {
      const [r, g, b, rad, z] = def.light;
      this.lights.push({ x, y, z, r, g, b, rad, flicker: type.startsWith('crystal') ? 0.08 : 0.03 });
    }
    // Large props also define a depth offset so units behind them sort correctly.
    p.depth = x + y;
    this.props.push(p);
    return p;
  }

  clearArea(x, y, r) {
    for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++)
        if (this.inBounds(tx, ty) && dist(tx + 0.5, ty + 0.5, x, y) <= r && this.blocked[ty * MAP_W + tx] !== 2)
          this.blocked[ty * MAP_W + tx] = 0;
  }

  buildBase() {
    const { x: bx, y: by } = BASE_POS;
    this.addProp('commandPost', bx - 1, by - 7);
    this.addProp('barracks', bx - 8, by - 2, { angleIdx: 1 });
    this.addProp('barracks', bx - 8, by + 5, { angleIdx: 1 });
    this.addProp('landingPad', bx + 6.5, by - 4.5);
    this.addProp('laat', bx + 6.5, by - 4.5);
    this.addProp('atte', bx + 6, by + 7);
    this.addProp('tent', bx - 1, by + 8);
    this.addProp('sensorTower', bx + 11, by - 11);
    this.addProp('sensorTower', bx - 11, by + 11);
    for (const [dx, dy] of [[-4, -3], [3, 2], [-4, 3], [3, -11], [-11, -9], [11, 3]]) this.addProp('lamp', bx + dx, by + dy);
    for (const [dx, dy] of [[-4, -10], [-3, -10], [-5, 9.5], [-6, 9.5], [10, -1], [10, 0], [2, 11]]) this.addProp('crate', bx + dx + 0.5, by + dy + 0.5);
    // Perimeter barricades with gates on each side.
    for (let i = -12; i <= 12; i += 2) {
      if (Math.abs(i) <= 2) continue;
      this.addProp('barricade', bx + i, by - 13, { angleIdx: 0 });
      this.addProp('barricade', bx + i, by + 13, { angleIdx: 0 });
      this.addProp('barricade', bx - 13, by + i, { angleIdx: 1 });
      this.addProp('barricade', bx + 13, by + i, { angleIdx: 1 });
    }
    // Clone guards at the gates.
    for (const [dx, dy, f] of [[-2.5, -14, -2.36], [2.5, -14, -2.36], [-14, -2.5, 2.36], [-14, 2.5, 2.36], [3, -1, 0.8], [-3, 0, 0], [14, 2.5, 0], [2.5, 14, 1.57]]) {
      this.guards.push({ x: bx + dx, y: by + dy, facing: f });
    }
    this.spawn = { x: bx + 0.5, y: by + 1.5 };
  }

  buildFactory() {
    const { x, y } = FACTORY_POS;
    this.addProp('droidFactory', x, y);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (i === 1) continue; // opening toward the road
      this.addProp('sepBarrier', x + Math.cos(a) * 11, y + Math.sin(a) * 11, { angleIdx: Math.abs(Math.cos(a)) > 0.7 ? 0 : 1 });
    }
    this.addProp('sepTower', x + 8, y - 8);
    this.addProp('sepTower', x - 8, y + 8);
    for (let i = 0; i < 8; i++) this.addProp('sepCrate', x + this.rng.range(-9, 9), y + this.rng.range(7, 9) * (this.rng.chance(0.5) ? 1 : -1));
    this.camps.push(this.makeCamp(x + 9, y + 9, 10, { boss: true, b1: 8, b2: 6, radius: 7 }));
  }

  buildRuins(rng, rc) {
    // City blocks on a rough grid with plazas and broken towers.
    for (let gy = -rc.r; gy <= rc.r; gy += 6) {
      for (let gx = -rc.r; gx <= rc.r; gx += 6) {
        const x = rc.x + gx + rng.range(-1, 1);
        const y = rc.y + gy + rng.range(-1, 1);
        if (dist(x, y, rc.x, rc.y) > rc.r - 2) continue;
        if (this.road[Math.floor(y) * MAP_W + Math.floor(x)] < 3) continue;
        const r = rng.next();
        if (r < 0.3) this.addProp('ruinTower', x, y);
        else if (r < 0.65) {
          this.addProp('ruinWall', x, y, { angleIdx: rng.int(0, 1) });
          if (rng.chance(0.5)) this.addProp('ruinPillar', x + 2.5, y + 2);
        } else if (r < 0.85) {
          for (let k = 0; k < 3; k++) this.addProp('ruinPillar', x + rng.range(-2, 2), y + rng.range(-2, 2));
        } else this.addProp('crystalSpire', x, y);
      }
    }
    this.camps.push(this.makeCamp(rc.x + 3, rc.y - 2, null, { radius: 6 }));
  }

  buildCamp(rng, x, y, forcedLevel) {
    this.clearArea(x, y, 6);
    this.addProp('sepTower', x, y);
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(3.5, 5);
      if (rng.chance(0.5)) this.addProp('sepCrate', x + Math.cos(a) * r, y + Math.sin(a) * r);
      else this.addProp('sepBarrier', x + Math.cos(a) * r, y + Math.sin(a) * r, { angleIdx: rng.int(0, 1) });
    }
    for (let i = 0; i < 4; i++) this.addProp('droidDebris', x + rng.range(-6, 6), y + rng.range(-6, 6));
    this.camps.push(this.makeCamp(x, y, forcedLevel));
  }

  makeCamp(x, y, forcedLevel, opts = {}) {
    const db = dist(x, y, BASE_POS.x, BASE_POS.y);
    const level = forcedLevel ?? clamp(1 + Math.floor((db - 20) / 15), 1, 9);
    const b1 = opts.b1 ?? 3 + Math.floor(level / 2) + (this.rng.chance(0.5) ? 1 : 0);
    const b2 = opts.b2 ?? (level >= 3 ? Math.floor((level - 1) / 2) : 0);
    return { x, y, level, b1, b2, radius: opts.radius ?? 4, boss: !!opts.boss, alive: [], cleared: false, respawnAt: 0 };
  }
}

// ----------------------------------------------------------------------------
// Movie Duel arena: Count Dooku's secret hangar on Geonosis — a round rock
// chamber with paved floor, Geonosian pillars and green work lights.

export const ARENA = { x: 96, y: 96, r: 10.5 };

export class Arena extends World {
  generate() {
    this.rng = new RNG(this.seed);
    const { x: cx, y: cy, r } = ARENA;
    this.ambient = [104, 118, 104];
    this.pois.push({ x: cx, y: cy, r: 30, name: BIOME_NAMES[BIOME.HANGAR] });
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const d = dist(x + 0.5, y + 0.5, cx, cy) + (fbm(x / 4, y / 4, 7) - 0.5) * 1.5;
        const i = y * MAP_W + x;
        this.biome[i] = d < r + 0.8 ? BIOME.HANGAR : BIOME.ROCK;
        if (d > r) this.blocked[i] = 2;
        this.explored[i] = 1;
      }
    }
    // rock walls around the floor
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2;
      this.addProp('cliff', cx + Math.cos(a) * (r + 1.4), cy + Math.sin(a) * (r + 1.4), { noBlock: true });
    }
    // pillars, crates and green floodlights at the edge
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const px = cx + Math.cos(a) * (r - 1.2);
      const py = cy + Math.sin(a) * (r - 1.2);
      this.addProp('ruinPillar', px, py);
      this.lights.push({ x: px, y: py, z: 2.6, r: 80, g: 255, b: 120, rad: 120, flicker: 0.05 });
    }
    this.addProp('sepCrate', cx - 7.5, cy + 4.5);
    this.addProp('sepCrate', cx + 6.5, cy - 6);
    this.addProp('sepCrate', cx + 7.2, cy - 5);
    this.spawn = { x: cx - 3, y: cy + 3 };
    this.roadSegs = [];
    this.props.sort((a, b) => a.x + a.y - (b.x + b.y));
  }
}
