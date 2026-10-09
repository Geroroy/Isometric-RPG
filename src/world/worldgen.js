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
  MUSTAFAR: 8, // the mining facility's metal decks
  LAVA: 9,
  ASH: 10, // black volcanic sand
  CITY_UP: 11, // the city hub's upper level: polished stone
  CITY_LOW: 12, // the lower level: grimy duracrete
  VOID: 13, // the drop between the levels / off the platforms
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
  8: '무스타파 · 채굴 시설',
  9: '무스타파 · 용암 강',
  10: '무스타파 · 검은 모래 언덕',
  11: '코러산트 · 상층 플라자',
  12: '코러산트 · 언더시티',
  13: '코러산트 · 끝없는 낭떠러지',
};

export const BASE_POS = { x: 150, y: 152 };
export const FACTORY_POS = { x: 36, y: 40 };
// Mos Eisley-style cantina north of the base; its door faces the north gate
export const CANTINA_POS = { x: BASE_POS.x + 1, y: BASE_POS.y - 24 };
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
      if (dist(x, y, CANTINA_POS.x, CANTINA_POS.y) < 18) continue;
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
      dist(x, y, CANTINA_POS.x, CANTINA_POS.y) < 9 ||
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
    for (const [dx, dy] of [[-4, -3], [3, 2], [-4, 3], [3, -11], [-11, -9], [12, 5.5]]) this.addProp('lamp', bx + dx, by + dy);
    for (const [dx, dy] of [[-4, -10], [-3, -10], [-5, 9.5], [-6, 9.5], [8, -11], [9, -11], [2, 11]]) this.addProp('crate', bx + dx + 0.5, by + dy + 0.5);
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
      this.addProp('geoPillar', px, py);
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

// ----------------------------------------------------------------------------
// Movie Duel #2 arena: Mustafar, laid out in the order the film's duel moves
// through it. One walkable route, everything else lava:
//   deck → hallway → conference room → door → control room (its east side
//   open on the lava behind the failed shield) → balcony catwalk running
//   south → the collector arm reaching east over the lava falls.
// Downstream, the lava river: the collector platform (Obi-Wan) and a mining
// droid's hover platform (Anakin) drift east along it towards the black sand
// bank — the high ground.

export const MUSTAFAR = {
  deck: { x: 38, y: 46, hw: 8, hh: 6 }, // the landing platform (tile half-sizes)
  hallway: { x: 54, y: 46, hw: 8, hh: 1.6 }, // into the facility
  hall: { x: 70, y: 46, hw: 8, hh: 5 }, // the Separatist conference room
  door: { x: 80.5, y: 46, hw: 2.5, hh: 1.4 },
  control: { x: 90, y: 46, hw: 7, hh: 5 }, // the control room
  balcony: { x: 90, y: 58, hw: 1.8, hh: 7 }, // the catwalk outside
  arm: { x: 112, y: 64, hw: 20, hh: 1.2 }, // the collector arm
  river: { x0: 122, x1: 166, y: 90 }, // where the platforms drift
  raft: { hw: 2.5, hh: 1.8 }, // Obi-Wan's collector platform (north)
  droid: { hw: 1.2, hh: 1.0 }, // Anakin's hover platform (south, touching)
  bank: { x: 171, y: 99 }, // the high ground
};

export class MustafarArena extends World {
  generate() {
    this.rng = new RNG(this.seed);
    const M = MUSTAFAR;
    const { deck, hallway, hall, door, control, balcony, arm, river, bank } = M;
    this.ambient = [150, 86, 70];
    this.pois.push({ x: deck.x, y: deck.y, r: 12, name: BIOME_NAMES[BIOME.MUSTAFAR] });
    this.pois.push({ x: hall.x, y: hall.y, r: 9, name: '무스타파 · 분리주의 회의실' });
    this.pois.push({ x: control.x, y: control.y, r: 8, name: '무스타파 · 제어실' });
    this.pois.push({ x: balcony.x, y: balcony.y, r: 7, name: '무스타파 · 발코니' });
    this.pois.push({ x: arm.x, y: arm.y, r: arm.hw + 1, name: '무스타파 · 집하기 팔' });
    this.pois.push({ x: (river.x0 + river.x1) / 2, y: river.y, r: 26, name: BIOME_NAMES[BIOME.LAVA] });
    const walk = [deck, hallway, hall, door, control, balcony, arm];
    const inRect = (x, y, r) => Math.abs(x - r.x) <= r.hw && Math.abs(y - r.y) <= r.hh;
    const rooms = [hall, control].map((r) => ({ ...r, hw: r.hw + 1.6, hh: r.hh + 1.6 }));
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const cx = x + 0.5;
        const cy = y + 0.5;
        let b = BIOME.LAVA;
        if (walk.some((r) => inRect(cx, cy, r))) b = BIOME.MUSTAFAR;
        else if (rooms.some((r) => inRect(cx, cy, r)) && cx < control.x + control.hw) b = BIOME.ASH; // the rooms' rock; the control room opens east on the lava
        else if (cy > bank.y - 4 + (fbm(x / 5, 3, 11) - 0.5) * 3 && Math.abs(cx - bank.x) < 16 + (bank.y - cy) * -0.8) b = BIOME.ASH; // the black sand bank
        this.biome[i] = b;
        this.blocked[i] = b === BIOME.MUSTAFAR ? 0 : 2; // only the facility is walkable; the river platforms open their own tiles
        this.explored[i] = 1;
      }
    }

    // the landing platform: collector towers, Padmé's skiff
    for (const [dx, dy] of [[-7, -5], [7, -5], [-7, 5]]) this.addProp('mustafarTower', deck.x + dx, deck.y + dy);
    this.addProp('skiff', deck.x - 1, deck.y - 9.6, { noBlock: true });
    this.cloak = this.addProp('cloakPile', deck.x - 2.2, deck.y + 1.6);
    this.robe = this.addProp('robePile', deck.x + 3.4, deck.y - 1.8);
    this.cloak.hidden = this.robe.hidden = true;
    // the hallway: a wall on the north side, rails over the lava to the south
    for (let x = -hallway.hw + 1; x <= hallway.hw - 1; x += 2) {
      this.addProp('mustafarWall', hallway.x + x, hallway.y - hallway.hh - 0.9, { angleIdx: 0, noBlock: true });
      this.addProp('catwalkRail', hallway.x + x, hallway.y + hallway.hh + 0.2, { angleIdx: 0, noBlock: true });
    }
    // the conference room: the council's table, the leaders Anakin killed
    this.walls(hall, true);
    this.addProp('confTable', hall.x, hall.y - 0.5);
    for (const [dx, dy] of [[-3, -2.6], [2.5, -2.4], [-1, 2.3], [4.5, 1.8], [-5.5, 0.6]]) this.addProp('sepBody', hall.x + dx, hall.y + dy, { noBlock: true });
    // the control room: consoles, the shield controls in the middle of the north wall
    this.walls(control, true);
    for (const [dx, dy, ai] of [[-5, -2.5, 1], [-5, 2.5, 1], [-2.5, -4.2, 0], [2.5, -4.2, 0]]) this.addProp('mustafarConsole', control.x + dx, control.y + dy, { angleIdx: ai });
    this.shieldConsole = this.addProp('mustafarConsole', control.x, control.y - 4.2, { angleIdx: 0 });
    // the balcony and the collector arm: railings, the great pipe, the end tower
    for (let y = -balcony.hh + 1; y <= balcony.hh - 1; y += 2) {
      this.addProp('catwalkRail', balcony.x - balcony.hw - 0.1, balcony.y + y, { angleIdx: 1, noBlock: true });
      if (y < balcony.hh - 3) this.addProp('catwalkRail', balcony.x + balcony.hw + 0.1, balcony.y + y, { angleIdx: 1, noBlock: true });
    }
    for (let x = -arm.hw + 1; x <= arm.hw - 1; x += 2) {
      this.addProp('collectorPipe', arm.x + x, arm.y - arm.hh - 0.7, { angleIdx: 0, noBlock: true });
      this.addProp('catwalkRail', arm.x + x, arm.y + arm.hh + 0.15, { angleIdx: 0, noBlock: true });
    }
    this.armTower = this.addProp('mustafarTower', arm.x + arm.hw + 1.6, arm.y, { noBlock: true });
    // the lava falls pouring past the arm
    this.falls = [];
    for (let x = -arm.hw + 3; x <= arm.hw - 2; x += 5) {
      const f = { x: arm.x + x + this.rng.range(-1, 1), y: arm.y - 4 };
      this.falls.push(f);
      this.lights.push({ x: f.x, y: f.y, z: 3, r: 255, g: 130, b: 40, rad: 170, flicker: 0.2 });
    }
    // the river platforms (shown when the fight reaches the river)
    this.raft = this.addProp('collectorRaft', river.x0, river.y - M.raft.hh, { noBlock: true });
    this.droid = this.addProp('droidPlatform', river.x0, river.y + M.droid.hh, { noBlock: true });
    this.raftTower = this.addProp('mustafarTower', river.x0 - 2, river.y - M.raft.hh - 1.2, { noBlock: true });
    this.raft.hidden = this.droid.hidden = this.raftTower.hidden = true;
    // the bank: black rock above the lava
    for (const [dx, dy] of [[-6, 2], [5, 1.5], [9, 4], [-10, 5], [2, 6]]) this.addProp('boulder', bank.x + dx, bank.y + dy, { noBlock: true });
    // light: the rooms, lava glow along the route and the river
    for (const r of [hall, control]) this.lights.push({ x: r.x, y: r.y, z: 2.5, r: 255, g: 150, b: 90, rad: 220, flicker: 0.03 });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) this.lights.push({ x: deck.x + Math.cos(a) * (deck.hw + 2.5), y: deck.y + Math.sin(a) * (deck.hh + 2.5), z: 0.2, r: 255, g: 120, b: 40, rad: 150, flicker: 0.12 });
    for (let x = hallway.x - hallway.hw; x <= hallway.x + hallway.hw; x += 5) this.lights.push({ x, y: hallway.y + 4, z: 0.2, r: 255, g: 110, b: 30, rad: 130, flicker: 0.12 });
    for (let y = balcony.y - balcony.hh; y <= balcony.y + balcony.hh; y += 5) this.lights.push({ x: balcony.x + 4, y, z: 0.2, r: 255, g: 120, b: 40, rad: 140, flicker: 0.12 });
    for (let x = river.x0 - 4; x <= river.x1 + 8; x += 6) {
      this.lights.push({ x, y: river.y - 5, z: 0.2, r: 255, g: 110, b: 30, rad: 150, flicker: 0.12 });
      this.lights.push({ x, y: river.y + 5, z: 0.2, r: 255, g: 110, b: 30, rad: 150, flicker: 0.12 });
    }
    this.spawn = { x: deck.x - 1.5, y: deck.y + 1.5 };
    this.roadSegs = [];
    this.props.sort((a, b) => a.x + a.y - (b.x + b.y));
  }

  /** The far walls of a room (north and west, a gap for the door); the near sides stay open so the fight is visible, as in Fallout. */
  walls(r, westDoor = false) {
    const edge = (x, y, ai) => this.addProp('mustafarWall', x, y, { angleIdx: ai, noBlock: true });
    for (let x = -r.hw + 1; x <= r.hw - 1; x += 2) edge(r.x + x, r.y - r.hh - 0.9, 0);
    for (let y = -r.hh + 1; y <= r.hh - 1; y += 2) if (!westDoor || Math.abs(y) > 1.5) edge(r.x - r.hw - 0.9, r.y + y, 1);
  }

  /**
   * Open the tiles under a moving platform (and close those it left).
   * `rects` are the platforms' current { x, y, hw, hh }.
   */
  setFloating(rects) {
    for (const i of this.floating || []) this.blocked[i] = 2;
    const open = [];
    for (const r of rects) {
      for (let ty = Math.floor(r.y - r.hh + 0.01); ty < Math.ceil(r.y + r.hh - 0.01); ty++)
        for (let tx = Math.floor(r.x - r.hw + 0.01); tx < Math.ceil(r.x + r.hw - 0.01); tx++) {
          if (!this.inBounds(tx, ty)) continue;
          const i = ty * MAP_W + tx;
          this.blocked[i] = 0;
          open.push(i);
        }
    }
    this.floating = open;
  }
}

// ----------------------------------------------------------------------------
// The city hub (Coruscant, an original layout). Two levels of the same city
// stacked over a drop with no visible bottom: the bright upper plaza with
// its stone, brass, planted trees, white light and the Jedi landing pad, and
// the lower level reached by a turbolift — cramped blocks, a market street
// under neon, steam vents, rubbish and people living in the half-dark. Air
// traffic streams through the drop between them.

export const CITY = {
  up: { x: 98, y: 64, hw: 26, hh: 15 }, // upper plaza (tile half-sizes)
  pad: { x: 117, y: 62 }, // Jedi landing pad
  low: { x: 96, y: 113, hw: 32, hh: 18 }, // lower level
  liftUp: { x: 82, y: 77.5 },
  liftLow: { x: 82, y: 97.5 },
  bar: { x: 108, y: 123 }, // the bar ("녹슨 등불")
  shaft: { x: 96, y: 112 }, // the one place light reaches the street
};

export class CityHub extends World {
  generate() {
    this.rng = new RNG(this.seed);
    const rng = this.rng;
    const { up, low, pad, liftUp, liftLow, bar, shaft } = CITY;
    this.ambient = [96, 100, 128];
    this.city = true;
    const inRect = (x, y, r) => Math.abs(x - r.x) <= r.hw && Math.abs(y - r.y) <= r.hh;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const cx = x + 0.5;
        const cy = y + 0.5;
        let b = BIOME.VOID;
        if (inRect(cx, cy, up)) b = BIOME.CITY_UP;
        else if (inRect(cx, cy, low)) b = BIOME.CITY_LOW;
        this.biome[i] = b;
        this.blocked[i] = b === BIOME.VOID ? 2 : 0;
        this.explored[i] = 1;
      }
    }
    this.pois.push({ ...pad, r: 6, name: '코러산트 · 제다이 착륙장' });
    this.pois.push({ ...bar, r: 5, name: '코러산트 · 녹슨 등불 바' });
    this.pois.push({ x: low.x, y: 106.5, r: 9, name: '코러산트 · 언더시티 시장' });
    this.pois.push({ ...shaft, r: 3.5, name: '코러산트 · 빛이 드는 골목' });

    // --- upper plaza ------------------------------------------------------
    this.addProp('landingPad', pad.x, pad.y);
    // skyline: towers along the north edge and out in the drop
    for (let x = up.x - up.hw + 2; x <= up.x + up.hw - 2; x += 5) this.addProp('spire', x + rng.range(-0.6, 0.6), up.y - up.hh + 1.5);
    for (const [x, y] of [[66, 48], [70, 62], [130, 50], [134, 70], [60, 76], [138, 84], [76, 40], [120, 38]]) this.addProp('spire', x, y, { noBlock: true });
    // a ring of planters and lamps round the plaza's centre
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.addProp(k % 2 ? 'plazaLamp' : 'planter', 94 + Math.cos(a) * 6, 66 + Math.sin(a) * 4.5);
    }
    for (const [x, y] of [[80, 56], [86, 72], [104, 72], [108, 54], [76, 68]]) this.addProp('planter', x, y);
    for (const [x, y] of [[100, 58], [88, 60], [110, 70], [122, 56], [122, 68], [78, 62]]) this.addProp('plazaLamp', x, y);
    // the railing along the edge over the drop (south side)
    for (let x = up.x - up.hw + 1; x <= up.x + up.hw - 1; x += 2) if (Math.abs(x - liftUp.x) > 1.5) this.addProp('railing', x, up.y + up.hh + 0.2, { angleIdx: 0 });
    this.addProp('turbolift', liftUp.x, liftUp.y);

    // --- lower level ------------------------------------------------------
    // blocks of dwellings with streets between them; the market street runs
    // east–west through the middle
    const blocks = [];
    for (const bx of [70, 84, 100, 116]) for (const by of [100, 117, 126]) blocks.push([bx, by]);
    for (const [bx, by] of blocks) {
      if (Math.abs(bx - shaft.x) < 6 && Math.abs(by - shaft.y) < 7) continue; // the square under the light
      if (bx === 84 && by === 100) continue; // the lift's landing
      this.addProp('slumBlock', bx, by);
    }
    this.addProp('turbolift', liftLow.x, liftLow.y);
    // market street: stalls both sides, neon over them
    for (let x = low.x - low.hw + 3; x <= low.x + low.hw - 3; x += 4.5) {
      this.addProp('stall', x, 104.2);
      if (rng.chance(0.7)) this.addProp('stall', x + 2, 110.6);
      if (rng.chance(0.6)) this.addProp('neonSign', x + 1.2, 103.6);
    }
    for (const [x, y] of [[64.5, 112], [127, 108], [92, 121], [124, 121], [76, 129], [112, 96.5]]) this.addProp('ventStack', x, y);
    for (let k = 0; k < 14; k++) this.addProp('trashPile', rng.range(low.x - low.hw + 1, low.x + low.hw - 1), rng.pick([108.5, 112.5, 121.5, 130, 96.5]), { noBlock: true });
    // the bar: a block with two signs and a warm doorway
    this.addProp('neonSign', bar.x - 2.6, bar.y - 2.6, { variant: 0 });
    this.addProp('neonSign', bar.x + 2.6, bar.y - 2.6, { variant: 2 });
    // light: warm windows and neon pockets; one cold shaft from above
    const neon = [[255, 80, 170], [80, 230, 255], [255, 180, 70], [160, 120, 255]];
    for (let k = 0; k < 26; k++) {
      const [r, g, b] = rng.pick(neon);
      this.lights.push({ x: rng.range(low.x - low.hw + 2, low.x + low.hw - 2), y: rng.pick([104, 108.5, 112, 121.5, 96.5, 130]), z: 2.2, r, g, b, rad: rng.range(70, 120), flicker: rng.chance(0.3) ? 0.2 : 0.04 });
    }
    this.lights.push({ x: shaft.x, y: shaft.y, z: 6, r: 200, g: 225, b: 255, rad: 150, flicker: 0.01 });
    this.lights.push({ x: bar.x, y: bar.y - 3, z: 1.5, r: 255, g: 170, b: 90, rad: 120, flicker: 0.05 });
    // the upper plaza is lit like day
    for (let x = up.x - up.hw + 4; x <= up.x + up.hw - 4; x += 9) for (const y of [up.y - 7, up.y + 6]) this.lights.push({ x, y, z: 6, r: 255, g: 246, b: 228, rad: 300, flicker: 0 });

    // walkable spots for the crowd, per level
    this.walk = { up: [], low: [] };
    for (let y = 0; y < MAP_H; y += 2) {
      for (let x = 0; x < MAP_W; x += 2) {
        if (this.blocked[y * MAP_W + x]) continue;
        const b = this.biome[y * MAP_W + x];
        if (b === BIOME.CITY_UP && dist(x, y, pad.x, pad.y) > 5) this.walk.up.push({ x: x + 0.5, y: y + 0.5 });
        else if (b === BIOME.CITY_LOW) this.walk.low.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    // turbolifts between the levels
    this.lifts = [
      { x: liftUp.x, y: liftUp.y + 1.4, to: { x: liftLow.x, y: liftLow.y + 1.6 }, label: '언더시티로 내려간다' },
      { x: liftLow.x, y: liftLow.y + 1.4, to: { x: liftUp.x, y: liftUp.y - 1.6 }, label: '상층 플라자로 올라간다' },
    ];
    // air traffic through the drop: lanes of moving lights (x0, y0) → (x1, y1) at height z
    this.traffic = [];
    for (let k = 0; k < 7; k++) {
      const y = rng.range(82, 93);
      const dir = k % 2 ? 1 : -1;
      this.traffic.push({ x0: dir > 0 ? 50 : 146, y0: y, x1: dir > 0 ? 146 : 50, y1: y + rng.range(-3, 3), z: rng.range(1, 6), speed: rng.range(5, 11), gap: rng.range(6, 14) });
    }
    for (let k = 0; k < 4; k++) {
      const x = rng.pick([60, 66, 132, 138]);
      this.traffic.push({ x0: x, y0: 30, x1: x + rng.range(-4, 4), y1: 150, z: rng.range(3, 8), speed: rng.range(6, 10), gap: rng.range(8, 16) });
    }
    this.spawn = { x: pad.x - 5, y: pad.y + 1.5 };
    this.roadSegs = [];
    this.props.sort((a, b) => a.x + a.y - (b.x + b.y));
  }
}

