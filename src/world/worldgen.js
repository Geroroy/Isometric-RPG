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
import { BIOME } from './biome.js';
// the rebuilt city (?map=v2, docs/CORUSCANT_REBUILD.md) has its own layout
const UNDERCITY = MAP_V2 ? UNDERCITY_V2 : UNDERCITY_V1;
if (typeof window !== 'undefined') window.__undercity = UNDERCITY; // QA (tools/qa/undercity_ascii.mjs)

export const MAP_W = 192;
export const MAP_H = 192;

export { BIOME }; // (its own module, src/world/biome.js: the terrain worker imports it without the rest)

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

// The cargo sprites (tools/sprites/mustafar_cargo) in place of the old model crates, one picked per crate: the
// Republic's supplies grey and strapped, the droid army's rust-red capsules, cages and tanks
const CARGO_SWAP = {
  crate: ['cgCrateS', 'cgCube', 'cgCrateL', 'cgDrum'],
  sepCrate: ['cgCage', 'cgTank', 'cgCageCap', 'cgCanister', 'cgCapsule'],
};
// …and the undercity's pile sprites, each a small stack of them within the pile's own footprint (offsets in tiles)
const CARGO_CLUSTERS = {
  crateStack: [['cgCrateS', -0.1, -0.2], ['cgCube', 0.45, 0.55]],
  barrelPile: [['cgDrum', -0.35, -0.25], ['cgCanister', 0.35, -0.2], ['cgDrum', 0.1, 0.45]],
  crateBarrels: [['cgCrateS', -0.25, -0.15], ['cgDrum', 0.55, 0.45]],
  'crateBarrels@up': [['cgCrateS', -0.25, -0.15], ['cgDrum', 0.55, 0.45]],
};

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
    this.surfaces = []; // raised walkable tops (a table): { x0, y0, x1, y1, z } — whoever stands there stands at z
    this.generate();
  }

  idx(x, y) {
    return y * MAP_W + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  }
  /** The ground's height at a point: a raised surface's top, else 0. */
  groundAt(x, y) {
    let z = 0;
    for (const t of this.surfaces) if (x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1 && t.z > z) z = t.z;
    return z;
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
    const swap = CARGO_SWAP[type];
    if (swap && cityFootprint(swap[0])) return this.addSheetProp(swap[Math.floor(this.rng.next() * swap.length)], x, y, { noBlock: opts.noBlock });
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
    const flat = !!(def.flat || opts.flat); // drawn with the ground, under everyone (a corridor's open inside)
    const p = { type: 'sheet', sheet: name, x, y, flat, phase: this.rng.next() * 10, neon: { until: 0, phase: this.rng.next() * 7 } };
    const fp = cityFootprint(name);
    if (fp && !opts.noBlock && !flat) {
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
    for (const [dx, dy] of [[-4, -10.9], [-2.6, -10.9], [-5, 9.5], [-6.3, 9.5], [8, -11], [9.3, -11], [2, 11]]) this.addProp('crate', bx + dx + 0.5, by + dy + 0.5); // (behind the command post, clear of its box: the cargo sprites are bigger than the old crates)
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
//   deck        the landing platform: Padmé's skiff, crates
//   walk        a walkway to the facility door
//   corridor    the entry corridor, hazard-striped walls
//   hall        the Separatist conference room (the council's bodies)
//   junction    the corridor north out of the hall — where the pushes meet
//   control     the control room: wall screens, chrome consoles, the shield core
//   balcony     the exterior grate catwalk east of it, over the lava falls
//   arm         the collector arm with its tower, far to the west
//   river       the lava river: the collector droid and the repulsor platform
//   bank        the black sand slope south of it — the high ground

// The facility's sets, in design coordinates: the sets in the film's order along −x (deck → corridor → hall), north
// (junction → control room), east (the balcony), the arm far west, the river south; transposed into the world
// (x ↔ y) so that on screen it reads as the film's wide shot and the concept art (reference/color_rots): the landing
// platform on the left, the collector arms on the right. The map itself is its file (public/maps/mustafar.json):
// these are the sets' boxes the duel works in (MUSTAFAR)
const MUSTAFAR_D = {
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
  balcony: { x: 97, y: 94, hw: 13, hh: 1 }, // (out to the lifting arm at its end, x 110)
  arm: { x: 40, y: 104, hw: 11, hh: 1.5 },
  armTower: { x: 53, y: 104 },
  river: { x: 106, y: 142, hw: 24, hh: 4 },
  bank: { x: 112, y: 150 },
};
const tpRect = (r) => {
  const o = { ...r, x: r.y, y: r.x };
  if ('hw' in r) [o.hw, o.hh] = [r.hh, r.hw];
  if ('rx' in r) [o.rx, o.ry] = [r.ry, r.rx];
  return o;
};
/** The facility as it lies in the world (design coordinates transposed): what the duel works in. */
export const MUSTAFAR = Object.fromEntries(Object.entries(MUSTAFAR_D).map(([k, v]) => [k, Array.isArray(v) ? v.map(([x, y]) => [y, x]) : tpRect(v)]));
// the rooms' near walls' bay lengths, pillar to pillar (tools/sprites/mustafar_set/lowwall.py LENGTHS)
const WALL_BAYS = [1, 2.5, 3, 3.5, 4, 4.5, 5];
// the set sprites' mirrored twins (a sprite flipped left-right is its transpose: the same piece the other way round)
const MIRROR_SHEET = {
  mfConsole: 'mfConsole_r',
  mfConsole_r: 'mfConsole',
  mfConsoleRed: 'mfConsoleRed_r',
  mfConsoleRed_r: 'mfConsoleRed',
  mfCorridor: 'mfCorridor_r',
  mfCorridor_r: 'mfCorridor',
  mfCorridorL: 'mfCorridorL_r',
  mfCorridorL_r: 'mfCorridorL',
  mfWindow: 'mfWindow_r',
  mfPassage: 'mfPassage_x',
  mfPassageS_x: 'mfPassageS',
  mfChair: 'mfChair_x',
  mfChair_x: 'mfChair',
  mfTable: 'mfTable_y',
  mfArm: 'mfArm_y',
  mfArm_y: 'mfArm',
  mfCatwalkL: 'mfCatwalkL_y',
  mfLift: 'mfLift_y',
  mfFall: 'mfFall_x',
  mfFall_x: 'mfFall',
  // the near walls' bays (lowwall.py: both ways round in the atlas)
  ...Object.fromEntries(WALL_BAYS.flatMap((L) => [[`mfWall${L}`, `mfWall${L}_y`], [`mfWall${L}_y`, `mfWall${L}`]])),
};
// the pairs, for the loader (gfx/mustafarFloor.js: one of each is shipped, the other flipped from it)
export const MUSTAFAR_SHEETS = { mirror: MIRROR_SHEET };

// a map file's characters (MustafarArena.toMap): a biome each, and the way — walkable, a prop's footprint, the
// ground's own edge (a wall, the lava, the rock)
const BIOME_CHAR = { DUST: 'd', ROCK: 'r', CRYSTAL: 'c', SCORCH: 's', RUIN: 'u', BASE: 'b', GRASS: 'g', HANGAR: 'h', MUSTAFAR: 'M', LAVA: '~', ASH: ':', CITY_UP: 'U', CITY_LOW: 'L', VOID: 'v', CITY_MOSAIC: 'm', CITY_MUD: 'w', CITY_SWAMP: 'p', CITY_DIRT: 't', GRATE: '#' };
const BLOCKED_KEY = { '.': 'walkable', o: 'blocked (a prop)', '#': 'blocked (the ground: lava, rock, a wall)' };
const BLOCKED_CHAR = ['.', 'o', '#'];

/** A map file as text (public/maps/*.json): its rows, props and lights one a line, so a change reads as a line's. */
export function mapText(m) {
  const one = (v) => JSON.stringify(v);
  const field = ([k, v]) => (Array.isArray(v) && v.length && typeof v[0] !== 'number' ? `  ${one(k)}: [\n${v.map((e) => '    ' + one(e)).join(',\n')}\n  ]` : `  ${one(k)}: ${one(v)}`);
  return `{\n${Object.entries(m).map(field).join(',\n')}\n}\n`;
}

// the map's data (public/maps/mustafar.json, the map editor's file): main.js loads it before the world is made
let MUSTAFAR_MAP = null;
export function setMustafarMap(m) {
  MUSTAFAR_MAP = m;
}

export class MustafarArena extends World {
  /** The map laid out from its file (public/maps/mustafar.json: MustafarArena.toMap), in world coordinates. */
  generate() {
    const m = MUSTAFAR_MAP;
    if (!m) throw new Error('무스타파 맵 데이터가 없다 (public/maps/mustafar.json)');
    this.rng = new RNG(this.seed);
    this.ambient = [...m.ambient];
    this.grade = m.grade; // post.js colour grade
    this.floats = []; // moving decks on the lava river: { x, y, r } (the duel's)
    this.roadSegs = [];
    this.spawn = { ...m.spawn };
    this.pois = m.pois.map((q) => ({ ...q }));
    // the interior's floor laid out of the set's floor tiles per room (terrain.js facilityFloor)
    this.floorPlan = m.floorPlan.map((r) => ({ ...r }));
    this.surfaces = m.surfaces.map((t) => ({ ...t })); // raised tops walked on (the tables)
    // the ground and the way, a character a tile (the way as laid: a prop's footprint, the chairs', the door jambs')
    const bk = Object.fromEntries(Object.entries(m.biomeKey).map(([c, n]) => [c, BIOME[n]]));
    const wk = Object.fromEntries(BLOCKED_CHAR.map((c, i) => [c, i]));
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        this.biome[i] = bk[m.biome[y][x]];
        this.blocked[i] = wk[m.blocked[y][x]];
        this.explored[i] = 1;
      }
    // the props (their footprints are in the way above) and the lights; the named ones the duel uses: the robes
    // thrown off before the fight, the control room's alarm light
    this.named = {};
    for (const e of m.props) {
      const p = e.sheet ? this.addSheetProp(e.sheet, e.x, e.y, { noBlock: true, flat: e.flat }) : this.addProp(e.type, e.x, e.y, { noBlock: true, variant: e.variant, angleIdx: e.angleIdx });
      if (!p) continue; // its sprite did not load
      p.block = !!e.block;
      if (e.over) p.over = true;
      if (e.cut) p.cut = [...e.cut];
      if (e.hidden) p.hidden = true;
      if (e.id) this.named[e.id] = p;
    }
    for (const l of m.lights) {
      const o = { x: l.x, y: l.y, z: l.z, r: l.r, g: l.g, b: l.b, rad: l.rad, flicker: l.flicker };
      this.lights.push(o);
      if (l.id) this.named[l.id] = o;
    }
    this.cloak = this.named.cloak;
    this.robe = this.named.robe;
    this.alarm = this.named.alarm; // lit by the duel when the shields fail
    // (a flat piece marked `over` is drawn after the other flats: the balcony's corridor over the catwalk)
    this.props.sort((a, b) => (a.over ? 1 : 0) - (b.over ? 1 : 0) || a.x + a.y - (b.x + b.y));
  }

  addProp(type, x, y, opts = {}) {
    return this.own(() => super.addProp(type, x, y, opts), opts);
  }

  addSheetProp(name, x, y, opts = {}) {
    return this.own(() => super.addSheetProp(name, x, y, opts), opts);
  }

  /**
   * A prop placed by `put`: whether it blocks its footprint (`block`, for the map file and the editor), and the
   * lights its definition brings tied to it (`of`, not written: the prop brings them again when it is placed).
   */
  own(put, opts) {
    const n = this.lights.length;
    const p = put();
    if (p) p.block = !opts.noBlock && !p.flat;
    for (let i = n; i < this.lights.length; i++) Object.defineProperty(this.lights[i], 'of', { value: p, configurable: true });
    return p;
  }

  /**
   * The map as its file (public/maps/mustafar.json, mapText): what generate() reads back and the map editor saves —
   * the ground (`biome`) and the way (`blocked`) a row of characters a tile row (their keys `biomeKey`,
   * `blockedKey`), the props and the placed lights one a line, in world coordinates. A prop's own lights (its
   * definition's) are not written: placing it brings them.
   */
  toMap() {
    const W = this.w;
    const n6 = (v) => Math.round(v * 1e6) / 1e6;
    const rows = (a, ch) => Array.from({ length: this.h }, (_, y) => Array.from(a.subarray(y * W, y * W + W), ch).join(''));
    const names = Object.fromEntries(Object.entries(BIOME).map(([k, v]) => [v, k]));
    const used = [...new Set(this.biome)].sort((a, b) => a - b);
    const ids = new Map(Object.entries(this.named || {}).map(([k, v]) => [v, k]));
    const prop = (p) => {
      const o = p.sheet ? { sheet: p.sheet } : { type: p.type };
      o.x = n6(p.x);
      o.y = n6(p.y);
      if (!p.sheet) [o.variant, o.angleIdx] = [p.variant, p.angleIdx];
      if (p.flat) o.flat = true;
      if (p.over) o.over = true;
      if (p.block) o.block = true;
      if (p.cut) o.cut = p.cut.map(n6);
      if (ids.has(p)) o.id = ids.get(p);
      if (p.hidden) o.hidden = true;
      return o;
    };
    const light = (l) => {
      const o = {};
      for (const k of ['x', 'y', 'z', 'r', 'g', 'b', 'rad', 'flicker']) o[k] = n6(l[k]);
      if (ids.has(l)) o.id = ids.get(l);
      return o;
    };
    return {
      format: 'cw-map',
      version: 1,
      w: W,
      h: this.h,
      ambient: this.ambient,
      grade: this.grade,
      spawn: { x: n6(this.spawn.x), y: n6(this.spawn.y) },
      pois: this.pois.map((q) => ({ ...q, x: n6(q.x), y: n6(q.y) })),
      floorPlan: this.floorPlan.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? n6(v) : v]))),
      surfaces: this.surfaces.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, n6(v)]))),
      biomeKey: Object.fromEntries(used.map((b) => [BIOME_CHAR[names[b]], names[b]])),
      biome: rows(this.biome, (b) => BIOME_CHAR[names[b]]),
      blockedKey: BLOCKED_KEY,
      blocked: rows(this.blocked, (b) => BLOCKED_CHAR[b]),
      props: this.props.map(prop),
      lights: this.lights.filter((l) => !l.of).map(light),
    };
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
      const cl = q.p && CARGO_CLUSTERS[q.p];
      if (cl && cityFootprint(cl[0][0])) for (const [n, dx, dy] of cl) this.addSheetProp(n, q.x + dx, q.y + dy, { noBlock: !!q.noBlock });
      else if (q.p) this.addSheetProp(q.p, q.x, q.y, { noBlock: !!q.noBlock });
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

