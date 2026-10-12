// Open-world generation: the outskirts of Christophsis during the Clone Wars.
// Republic forward base in the south, Separatist droid camps scattered across
// dusty plains, crystal fields, rocky highlands, scorched battlefields and the
// ruins of an old crystal city; a droid factory stronghold far to the north.
import { RNG, fbm, dist, distToSegment, clamp } from '../core/math.js';
import { PROPS } from '../gfx/models/props.js';
import { SHEET_PROPS, cityFootprint, inPoly } from './cityProps.js';
import UNDERCITY_V1 from '../data/undercity.json';
import UNDERCITY_V2 from '../data/undercity_v2.json';
import { MAP_V2 } from './mapVersion.js';
// the rebuilt city (?map=v2, docs/CORUSCANT_REBUILD.md) has its own layout
const UNDERCITY = MAP_V2 ? UNDERCITY_V2 : UNDERCITY_V1;
if (typeof window !== 'undefined') window.__undercity = UNDERCITY; // QA (tools/qa/undercity_ascii.mjs)

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
  CITY_MOSAIC: 14, // the undercity plaza's pavement: cracked mosaic with neon veins
  CITY_MUD: 15, // the undercity's wet alleys: mud over conduits, puddles (slow)
  CITY_SWAMP: 16, // the undercity's sump: standing water and moss (slow)
  CITY_DIRT: 17, // the undercity's packed dirt (the residential court)
  GRATE: 18, // Mustafar catwalk grating
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
  14: '코러산트 · 네온 시장 광장',
  15: '코러산트 · 진흙 골목',
  16: '코러산트 · 하수 웅덩이',
  17: '코러산트 · 흙바닥 안뜰',
  18: '무스타파 · 채굴 시설',
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

  /**
   * A Blender-rendered city sprite (world/cityProps.js): blocks the tiles
   * inside its footprint, adds its lights; steam vents and sound sources are
   * collected for the renderer and the ambience.
   */
  addSheetProp(name, x, y, opts = {}) {
    const def = SHEET_PROPS[name];
    if (!cityFootprint(name)) return null; // its sprite did not load: leave it out
    const p = { type: 'sheet', sheet: name, x, y, flat: !!def.flat, phase: this.rng.next() * 10, neon: { until: 0, phase: this.rng.next() * 7 } };
    const fp = cityFootprint(name);
    if (fp && !opts.noBlock && !def.flat) {
      const xs = fp.map((q) => q[0]);
      const ys = fp.map((q) => q[1]);
      let any = false;
      for (let ty = Math.floor(y + Math.min(...ys)); ty <= Math.floor(y + Math.max(...ys)); ty++)
        for (let tx = Math.floor(x + Math.min(...xs)); tx <= Math.floor(x + Math.max(...xs)); tx++)
          if (this.inBounds(tx, ty) && inPoly(tx + 0.5 - x, ty + 0.5 - y, fp)) {
            this.blocked[ty * MAP_W + tx] = 1;
            any = true;
          }
      if (!any && this.inBounds(Math.floor(x), Math.floor(y))) this.blocked[Math.floor(y) * MAP_W + Math.floor(x)] = 1;
      p.rect = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    }
    for (const [dx, dy, z, r, g, b, rad, flicker] of def.lights || []) this.lights.push(calmLight({ x: x + dx, y: y + dy, z, r, g, b, rad, flicker }, name));
    for (const [dx, dy, z] of def.steam || []) (this.steam ||= []).push({ x: x + dx, y: y + dy, z, t: this.rng.next() * 3 });
    if (def.sound) (this.sounds ||= []).push({ ...def.sound, x: x + def.sound.at[0], y: y + def.sound.at[1] });
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
    this.grade = 'geonosis'; // post.js colour grade
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

// Movie Duel #2 arena: Mustafar — the Klegger Corp. mining facility, laid out
// after the LEGO Skywalker Saga "Duel on Mustafar" level so the fight can
// travel through the film's sets in order, most of them joined up so the
// duellists walk from one into the next:
//
//   deck        the landing platform: Padmé's skiff, girder pylons, crates
//   walk        a railed walkway to the facility door
//   corridor    the entry corridor, hazard-striped walls
//   hall        the Separatist conference room (the council's bodies)
//   junction    the corridor north out of the hall — where the pushes meet
//   control     the control room: wall screens, chrome consoles, the shield core
//   balcony     the exterior grate catwalk east of it, over the lava falls
//   arm         the collector arm with its tower, far to the west
//   river       the lava river: the collector droid and the repulsor platform
//   bank        the black sand slope south of it — the high ground

export const MUSTAFAR = {
  deck: { x: 118, y: 118, rx: 9.5, ry: 6.5 },
  pad: { x: 117, y: 109.5, hw: 4.5, hh: 2.5 }, // the skiff's parking apron
  walk: { x: 104.5, y: 118, hw: 4.5, hh: 1.5 },
  door1: { x: 100, y: 118 },
  corridor: { x: 91.5, y: 118, hw: 8.5, hh: 1.5 },
  door2: { x: 83, y: 118 },
  hall: { x: 74, y: 118, hw: 9, hh: 6 },
  junction: { x: 79, y: 104.5, hw: 1.5, hh: 7.5 },
  control: { x: 76, y: 90, hw: 8, hh: 7 },
  door4: { x: 84, y: 94 },
  balcony: { x: 92.5, y: 94, hw: 8.5, hh: 1 },
  balconyEnd: { x: 102, y: 94, hw: 1.5, hh: 2.5 },
  arm: { x: 40, y: 104, hw: 11, hh: 1.5 },
  armTower: { x: 53, y: 104 },
  river: { x: 106, y: 142, hw: 24, hh: 4 },
  bank: { x: 112, y: 150 },
};

export class MustafarArena extends World {
  generate() {
    this.rng = new RNG(this.seed);
    const M = MUSTAFAR;
    this.ambient = [150, 86, 70];
    this.grade = 'mustafar'; // post.js colour grade
    this.floats = []; // moving decks on the lava river: { x, y, r }
    this.pois.push({ x: M.deck.x, y: M.deck.y, r: 13, name: '무스타파 · 착륙장' });
    this.pois.push({ x: M.corridor.x, y: M.corridor.y, r: 9, name: '무스타파 · 입구 복도' });
    this.pois.push({ x: M.hall.x, y: M.hall.y, r: 10, name: '무스타파 · 분리주의 회의실' });
    this.pois.push({ x: M.control.x, y: M.control.y, r: 10, name: '무스타파 · 제어실' });
    this.pois.push({ x: M.balcony.x, y: M.balcony.y, r: 9, name: '무스타파 · 외부 발코니' });
    this.pois.push({ x: M.arm.x, y: M.arm.y, r: 13, name: '무스타파 · 집하기 팔' });
    this.pois.push({ x: M.river.x, y: M.river.y, r: 10, name: BIOME_NAMES[BIOME.LAVA] });
    const inRect = (x, y, r) => Math.abs(x - r.x) <= r.hw && Math.abs(y - r.y) <= r.hh;
    const inEll = (x, y, e) => ((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 <= 1;
    const floors = [M.pad, M.walk, M.corridor, M.hall, M.junction, M.control, M.balconyEnd];
    // the interior's floor as in the film (terrain.js filmFloor; photos of the sets in reference/color_rots):
    // pale bands outlining big long hexagons, their long axis across the room, in rows along it, a hexagon on
    // the room's centre (under the conference table, the control room's holo-table); fields of dark slab, grey
    // slab and pale speckled stone set out symmetrically from the middle. A raised rim of the texture's seam
    // bars along the walls (a light slot to each hexagon), the control room's centre sunk a step inside a
    // walkway. `cell`: a hexagon's width along the room, `elong`: its stretch across, `band`: the bands' width
    // (tiles; rects as above, first match wins)
    this.floorPlan = [
      { ...M.hall, axis: 'x', rim: 1, cell: 3.2, elong: 1.6, band: 0.46 },
      { ...M.control, axis: 'x', rim: 1, pit: 2.6, cell: 3, elong: 1.6, band: 0.44 },
      { ...M.corridor, axis: 'x', rim: 0.4, cell: 2, elong: 1.4, band: 0.36 },
      { ...M.junction, axis: 'y', rim: 0.4, cell: 2, elong: 1.4, band: 0.36 },
    ];
    const grates = [M.balcony, M.arm];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const cx = x + 0.5;
        const cy = y + 0.5;
        let b = BIOME.LAVA;
        const bankEdge = M.bank.y - 3.5 + (fbm(x / 5, 3, 11) - 0.5) * 3;
        if (inEll(cx, cy, M.deck) || floors.some((r) => inRect(cx, cy, r))) b = BIOME.MUSTAFAR;
        else if (grates.some((r) => inRect(cx, cy, r))) b = BIOME.GRATE;
        else if (inRect(cx, cy, { ...M.hall, hw: M.hall.hw + 2, hh: M.hall.hh + 2 }) || inRect(cx, cy, { ...M.control, hw: M.control.hw + 2, hh: M.control.hh + 2 }) || inRect(cx, cy, { ...M.corridor, hw: M.corridor.hw + 1, hh: M.corridor.hh + 2 }) || inRect(cx, cy, { ...M.junction, hw: M.junction.hw + 2, hh: M.junction.hh })) b = BIOME.ASH; // the building's rock footing
        else if (cy > bankEdge && Math.abs(cx - M.bank.x) < 24) b = BIOME.ASH;
        this.biome[i] = b;
        this.blocked[i] = b === BIOME.MUSTAFAR || b === BIOME.GRATE ? 0 : 2;
        this.explored[i] = 1;
      }
    }

    // --- the landing platform: pylons, crates, Padmé's skiff -----------------
    const D = M.deck;
    this.addProp('skiff', M.pad.x, M.pad.y);
    for (const [dx, dy] of [[-8.5, -5.5], [8, -6], [-9.5, 4.5], [8.5, 5.5], [0, 7.5]]) this.addProp('pylon', D.x + dx, D.y + dy);
    for (const [dx, dy] of [[6, -2], [6.8, -1.2], [-6.5, 3.5]]) this.addProp('crate', D.x + dx, D.y + dy);
    // the robes thrown off before the fight (shown by the opening scene)
    this.cloak = this.addProp('cloakPile', D.x - 2.2, D.y + 1.6);
    this.robe = this.addProp('robePile', D.x + 3.4, D.y - 1.8);
    this.cloak.hidden = this.robe.hidden = true;
    // walkway rails and the facility door
    for (let x = M.walk.x - 3; x <= M.walk.x + 3; x += 2) for (const y of [M.walk.y - 2.0, M.walk.y + 2.0]) this.addProp('catRail', x, y, { angleIdx: 0, noBlock: true });
    this.door(M.door1, 0);

    // --- entry corridor ---------------------------------------------------
    this.walls(M.corridor, 'hazardWall', { west: false });
    this.door(M.door2, 0);

    // --- the conference room ---------------------------------------------
    const H = M.hall;
    // the film's screen consoles (tools/sprites/mustafar_console): along the long wall between the two doors,
    // a pair centred on the table; on the end wall a sealed door in the middle with one either side
    this.walls(H, 'hazardWall', { west: false, gaps: [[M.junction.x - 2, M.junction.x + 2], [67.5, 70.5], [H.x - 3, H.x + 3]] });
    this.addProp('blastDoor', H.x - 5, H.y - H.hh - 0.9, { angleIdx: 0, noBlock: true });
    for (const dx of [-1.5, 1.5]) this.console(H, 'north', dx);
    for (const dy of [-4, 4]) this.console(H, 'west', dy);
    this.addProp('blastDoor', H.x - H.hw - 0.9, H.y, { angleIdx: 1, noBlock: true });
    this.door({ x: M.junction.x, y: H.y - H.hh }, 1);
    this.addProp('confTable', H.x, H.y);
    for (const dx of [-1.6, 0, 1.6]) {
      this.addProp('confChair', H.x + dx, H.y - 1.5, { angleIdx: 3 });
      this.addProp('confChair', H.x + dx, H.y + 1.5, { angleIdx: 1 });
    }
    this.addProp('confChair', H.x - 3.6, H.y, { angleIdx: 0 });
    this.addProp('confChair', H.x + 3.6, H.y, { angleIdx: 2 });
    for (const [dx, dy] of [[-4, -3.2], [3.2, -3.6], [-1.2, 3.4], [5.2, 2.4], [-6.2, 1.2], [6.5, -1.6]]) this.addProp('sepBody', H.x + dx, H.y + dy, { noBlock: true });

    // --- the junction corridor (north out of the hall) --------------------
    this.walls({ ...M.junction, hh: M.junction.hh - 0.5 }, 'hazardWall', { north: false });

    // --- the control room --------------------------------------------------
    const C = M.control;
    // the film's control room: its walls lined with screen consoles side by side, the back wall's middle one red
    for (const dx of [-6, -3, 0, 3, 6]) this.console(C, 'north', dx, dx === 0);
    for (const dy of [-4.5, -1.5, 1.5, 4.5]) this.console(C, 'west', dy);
    this.addProp('shieldCore', C.x - 3.5, C.y - 4);
    this.addProp('consoleDesk', C.x + 2, C.y + 2.5, { angleIdx: 0 });
    this.door(M.door4, 0);
    for (const [dx, dy] of [[-3, -2], [3, 2], [5, -3], [-4, 4]]) this.lights.push({ x: C.x + dx, y: C.y + dy, z: 3.2, r: 235, g: 240, b: 255, rad: 150, flicker: 0.02 }); // the white light bars
    for (const [dx, dy] of [[0, 0], [-5, 3]]) this.lights.push({ x: C.x + dx, y: C.y + dy, z: 0.1, r: 90, g: 210, b: 255, rad: 110, flicker: 0.05 }); // cyan floor glow
    this.alarm = { x: C.x, y: C.y, z: 2.5, r: 255, g: 40, b: 30, rad: 0, flicker: 0.5 }; // lit by the duel when the shields fail
    this.lights.push(this.alarm);

    // --- the balcony: a railed grate catwalk over the lava falls -----------
    const B = M.balcony;
    for (let x = B.x - 7; x <= B.x + 7; x += 2) {
      this.addProp('catRail', x, B.y - 1.4, { angleIdx: 0, noBlock: true });
      this.addProp('catRail', x, B.y + 1.4, { angleIdx: 0, noBlock: true });
    }
    for (const y of [M.balconyEnd.y - 2, M.balconyEnd.y + 2]) this.addProp('catRail', M.balconyEnd.x + 0.5, y, { angleIdx: 0, noBlock: true });
    this.addProp('catRail', M.balconyEnd.x + 2.0, M.balconyEnd.y - 1, { angleIdx: 1, noBlock: true });
    this.addProp('catRail', M.balconyEnd.x + 2.0, M.balconyEnd.y + 1, { angleIdx: 1, noBlock: true });
    for (const [x, y] of [[88, 87], [95, 86.5], [102, 87.5], [108, 92], [106, 100]]) this.addProp('lavaFall', x, y);
    for (const [x, y] of [[86, 101], [97, 101.5]]) this.addProp('pylon', x, y);

    // --- the collector arm ---------------------------------------------------
    const A = M.arm;
    this.tower = this.addProp('armTower', M.armTower.x, M.armTower.y);
    for (let x = A.x - 8; x <= A.x + 8; x += 4) this.addProp('cable', x, A.y - 1.1, { noBlock: true });
    for (const [x, y] of [[33, 97.5], [42, 97], [50, 97.5], [27, 104]]) this.addProp('lavaFall', x, y);
    for (let x = -A.hw; x <= A.hw; x += 4) this.lights.push({ x: A.x + x, y: A.y, z: 0.2, r: 255, g: 120, b: 40, rad: 140, flicker: 0.15 });

    // --- the river bank: black sand and rock ---------------------------------
    for (let k = 0; k < 14; k++) this.addProp('lavaRock', M.bank.x + this.rng.range(-20, 20), M.bank.y + this.rng.range(-1, 9), { noBlock: true });

    // warm light from the lava all round the sets
    for (const r of [M.hall, M.control]) this.lights.push({ x: r.x, y: r.y, z: 2.5, r: 255, g: 150, b: 90, rad: 220, flicker: 0.03 });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) this.lights.push({ x: D.x + Math.cos(a) * (D.rx + 2.5), y: D.y + Math.sin(a) * (D.ry + 2.5), z: 0.2, r: 255, g: 120, b: 40, rad: 150, flicker: 0.12 });
    for (let x = B.x - 8; x <= B.x + 8; x += 4) for (const dy of [-3, 3]) this.lights.push({ x, y: B.y + dy, z: 0.2, r: 255, g: 120, b: 40, rad: 130, flicker: 0.12 });
    for (let x = -22; x <= 22; x += 6) this.lights.push({ x: M.river.x + x, y: M.river.y, z: 0.2, r: 255, g: 110, b: 30, rad: 150, flicker: 0.12 });
    this.spawn = { x: D.x - 1.5, y: D.y + 1.5 };
    this.roadSegs = [];
    this.props.sort((a, b) => a.x + a.y - (b.x + b.y));
  }

  /**
   * A screen console of the film (gfx/mustafarFloor.js, a sheet sprite) against a room's far wall: `side`
   * 'north' (facing +y) or 'west' (facing +x), `at` along the wall from the room's middle; its feet on the
   * floor's edge. Left out when its sprite did not load.
   */
  console(r, side, at, red = false) {
    const name = (red ? 'mfConsoleRed' : 'mfConsole') + (side === 'west' ? '_r' : '');
    if (side === 'north') return this.addSheetProp(name, r.x + at, r.y - r.hh - 0.3, { noBlock: true });
    return this.addSheetProp(name, r.x - r.hw - 0.3, r.y + at, { noBlock: true });
  }

  /** The far walls of a room (north and west); the near sides stay open so the fight is visible, as in Fallout. */
  walls(r, type, { north = true, west = true, gaps = [] } = {}) {
    const edge = (x, y, ai) => this.addProp(type, x, y, { angleIdx: ai, noBlock: true });
    if (north) for (let x = -r.hw + 1; x <= r.hw - 1; x += 2) if (!gaps.some(([a, b]) => r.x + x > a - 1 && r.x + x < b + 1)) edge(r.x + x, r.y - r.hh - 0.9, 0);
    if (west) for (let y = -r.hh + 1; y <= r.hh - 1; y += 2) edge(r.x - r.hw - 0.9, r.y + y, 1);
  }

  /** A doorway: hazard pillars either side of a two-tile opening (`ai` 0: passage along x, 1: along y). */
  door(d, ai) {
    this.addProp('doorFrame', d.x, d.y, { angleIdx: ai, noBlock: true });
    for (const s of [-1.25, 1.25]) {
      const tx = Math.floor(ai ? d.x + s : d.x);
      const ty = Math.floor(ai ? d.y : d.y + s);
      if (this.inBounds(tx, ty)) this.blocked[ty * MAP_W + tx] = 1;
    }
  }

  /** The river's moving decks are walkable wherever they are. */
  isBlocked(x, y) {
    for (const f of this.floats) if (dist(x, y, f.x, f.y) <= f.r) return false;
    return super.isBlocked(x, y);
  }
}

// ----------------------------------------------------------------------------
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
  low: { x: 98, y: 113.5, hw: 40, hh: 19.5 }, // the undercity (data/undercity.json: x 58-138, y 94-133)
  liftUp: { x: 82, y: 77.5 },
  liftLow: { x: 82, y: 97.5 },
  bar: { x: 117, y: 123 }, // the cantina ("녹슨 등불"): its ground centre
  barDoor: { x: 117.4, y: 127.6 }, // in front of its door, on the square
  shaft: { x: 98, y: 112 }, // the one place light reaches the street: the plaza's centre
};
// the rebuilt city (?map=v2): the fixed points moved with its layout
if (MAP_V2) Object.assign(CITY, UNDERCITY_V2.city);

/**
 * The rebuilt city's lights, calmer (?map=v2): the street set's stall and sign lights were saturated
 * neon pools at full strength — softened toward their grey, dimmed and shortened, with no flicker but
 * a trace. The 1:1 buildings' own lights are calm already (bake.py) and pass as they are.
 */
function calmLight(l, sheet) {
  if (!MAP_V2 || /^(shops|towers|plants)_/.test(sheet)) return l;
  const m = (l.r + l.g + l.b) / 3;
  const k = 0.62;
  l.r = Math.round((m + (l.r - m) * 0.5) * k);
  l.g = Math.round((m + (l.g - m) * 0.5) * k);
  l.b = Math.round((m + (l.b - m) * 0.5) * k);
  l.rad = Math.round(l.rad * 0.8);
  l.flicker = Math.min(l.flicker, 0.02);
  return l;
}

export class CityHub extends World {
  /** The data's props (data/undercity.json): p = a sprite of the underworld set, m = a model prop. */
  placeProps(list) {
    for (const q of list) {
      if (q.p) this.addSheetProp(q.p, q.x, q.y, { noBlock: !!q.noBlock });
      else this.addProp(q.m, q.x, q.y, { angleIdx: q.a, noBlock: !!q.noBlock });
      if (q.steam) (this.steam ||= []).push({ x: q.x, y: q.y, z: 1.8, t: this.rng.next() * 3 });
    }
  }

  generate() {
    this.rng = new RNG(this.seed);
    const rng = this.rng;
    const { up, low, pad, liftUp, liftLow } = CITY;
    this.ambient = [96, 100, 128];
    this.grade = 'coruscant'; // the undercity below y 90 grades as 'undercity'
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

    // --- upper plaza (data/undercity.json "upper") -----------------------------------
    // the landing pad and the turbolift are the game's own; the terrace's dressing (office blocks
    // and stacks along the north edge, pipes, light posts and signs along the drop, terminals and
    // a kiosk round the centre, the quartermaster's depot by the pad) is the underworld set
    this.addProp('landingPad', pad.x, pad.y);
    this.placeProps(UNDERCITY.upper.props);
    this.addProp('turbolift', liftUp.x, liftUp.y);

    // --- lower level: the undercity (data/undercity.json, docs/UNDERCITY_MAP.md) --------
    // Zoned round a neon market plaza (mosaic pavement, the food stalls, trade terminals), with
    // muddy back alleys and a residential court to the west, a workshop alley to the north-east,
    // the cantina's square to the south-east and industrial vent zones in the corners; closed by
    // the mega-structure's pillars and pipe walls to the north, tenement stacks and clogged alley
    // ends to the sides, and the chasm (with guardrails) to the south.
    const U = UNDERCITY;
    const inP = (x, y, poly) => inPoly(x, y, poly);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        if (this.biome[i] !== BIOME.CITY_LOW) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        let b = BIOME.CITY_LOW;
        for (const c of U.ground.chasm) if (inP(cx, cy, c.poly)) b = BIOME.VOID;
        if (b === BIOME.CITY_LOW) for (const c of U.ground.mosaic) if (inP(cx, cy, c.poly)) b = BIOME.CITY_MOSAIC;
        if (b === BIOME.CITY_LOW) for (const c of U.ground.mud) if (inP(cx, cy, c.poly)) b = BIOME.CITY_MUD;
        if (b === BIOME.CITY_LOW) for (const c of U.ground.swamp || []) if (inP(cx, cy, c.poly)) b = BIOME.CITY_SWAMP;
        if (b === BIOME.CITY_LOW) for (const c of U.ground.dirt || []) if (inP(cx, cy, c.poly)) b = BIOME.CITY_DIRT;
        this.biome[i] = b;
        this.blocked[i] = b === BIOME.VOID ? 2 : 0;
      }
    }
    // the outermost ring stays off limits (the pillars and pipes stand on it; no one on the lip)
    const [rx0, ry0, rx1] = U.grid.region;
    for (let x = rx0; x < rx1; x++) if (this.biome[ry0 * MAP_W + x] !== BIOME.VOID) this.blocked[ry0 * MAP_W + x] = 1;
    const ry1 = U.grid.region[3];
    for (let y = ry0; y < ry1; y++) for (const x of [rx0, rx1 - 1]) if (this.biome[y * MAP_W + x] !== BIOME.VOID) this.blocked[y * MAP_W + x] = 1;
    this.addProp('turbolift', liftLow.x, liftLow.y);
    this.placeProps(U.props);
    // where a building would hide the player (the rebuilt map: data's `closed`, tools/maps/undercity_v2.py)
    for (const [x0, x1, y] of U.closed || []) for (let x = x0; x < x1; x++) if (!this.blocked[y * MAP_W + x]) this.blocked[y * MAP_W + x] = 1;
    for (const [x, y, z] of U.steam || []) this.steam.push({ x, y, z, t: rng.next() * 3 });
    this.puddles = U.puddles.map(([x, y, r]) => ({ x, y, r, drops: [] }));
    for (const [x, y, z, r, g, b, rad, flicker] of U.lights) this.lights.push(calmLight({ x, y, z, r, g, b, rad, flicker }, ''));
    for (const poi of U.pois) this.pois.push({ ...poi });
    // the upper plaza is lit like day
    for (let x = up.x - up.hw + 4; x <= up.x + up.hw - 4; x += 9) for (const y of [up.y - 7, up.y + 6]) this.lights.push({ x, y, z: 6, r: 255, g: 246, b: 228, rad: 300, flicker: 0 });

    // walkable spots for the crowd, per level
    this.walk = { up: [], low: [] };
    for (let y = 0; y < MAP_H; y += 2) {
      for (let x = 0; x < MAP_W; x += 2) {
        if (this.blocked[y * MAP_W + x]) continue;
        const b = this.biome[y * MAP_W + x];
        if (b === BIOME.CITY_UP && dist(x, y, pad.x, pad.y) > 5) this.walk.up.push({ x: x + 0.5, y: y + 0.5 });
        else if (b >= BIOME.CITY_LOW && b !== BIOME.VOID) this.walk.low.push({ x: x + 0.5, y: y + 0.5 });
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
    // speeders high over the undercity's streets: lights crossing overhead
    for (const y of [103, 116.5, 124.5]) this.traffic.push({ x0: 56, y0: y, x1: 136, y1: y + rng.range(-2, 2), z: rng.range(8, 11), speed: rng.range(7, 12), gap: rng.range(10, 18), over: true });
    for (const x of [76, 104, 121]) this.traffic.push({ x0: x, y0: 136, x1: x + rng.range(-3, 3), y1: 90, z: rng.range(9, 12), speed: rng.range(6, 10), gap: rng.range(12, 20), over: true });
    this.spawn = { x: pad.x - 5, y: pad.y + 1.5 };
    // the camera's regions (renderer: the view stays over the level it is on)
    this.camRegions = [
      { x0: up.x - up.hw, y0: up.y - up.hh, x1: up.x + up.hw, y1: up.y + up.hh },
      { x0: U.grid.region[0], y0: U.grid.region[1], x1: U.grid.region[2], y1: U.grid.region[3] - 1 },
    ];
    this.roadSegs = [];
    this.qaSpots = U.qa || null; // (tools/qa: the rebuilt map's own spots)
    this.props.sort((a, b) => a.x + a.y - (b.x + b.y));
  }
}

