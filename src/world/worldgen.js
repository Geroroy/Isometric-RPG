// Open-world generation: the outskirts of Christophsis during the Clone Wars.
// Republic forward base in the south, Separatist droid camps scattered across
// dusty plains, crystal fields, rocky highlands, scorched battlefields and the
// ruins of an old crystal city; a droid factory stronghold far to the north.
import { RNG, fbm, dist, distToSegment, clamp } from '../core/math.js';
import { HALF_W, HALF_H } from '../core/iso.js';
import { PROPS } from '../gfx/models/props.js';
import { SHEET_PROPS, cityFootprint, citySize, inPoly } from './cityProps.js';
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

// The facility in design coordinates: the sets in the film's order along −x (deck → corridor → hall), north
// (junction → control room), east (the balcony), the arm far west, the river south. The map is built here and then
// transposed (x ↔ y: MustafarArena.transpose) so that on screen it reads as the film's wide shot and the concept
// art (reference/color_rots): the landing platform on the left, the collector arms on the right
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
const distToPolyline = (x, y, pts) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return d;
};
const tpRect = (r) => {
  const o = { ...r, x: r.y, y: r.x };
  if ('hw' in r) [o.hw, o.hh] = [r.hh, r.hw];
  if ('rx' in r) [o.rx, o.ry] = [r.ry, r.rx];
  return o;
};
/** The facility as it lies in the world (design coordinates transposed): what the duel works in. */
export const MUSTAFAR = Object.fromEntries(Object.entries(MUSTAFAR_D).map(([k, v]) => [k, Array.isArray(v) ? v.map(([x, y]) => [y, x]) : tpRect(v)]));
// the set sprites' mirrored twins (a sprite flipped left-right is its transpose): design name -> world name
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
};
// the pairs, for the loader (gfx/mustafarFloor.js: one of each is shipped, the other flipped from it)
export const MUSTAFAR_SHEETS = { mirror: MIRROR_SHEET };

// Mustafar's rock sprites (tools/sprites/mustafar_rocks) in place of the model rocks: by size class
const ROCKS = {
  land: [...Array(9).keys()].map((i) => 'rk1_' + i), // landforms 12-15 m across: deep in the mountain
  wall: [...Array(6).keys()].map((i) => 'rk4_' + i), // cliff walls
  crag: [...Array(8).keys()].map((i) => 'rk2_' + i), // crags and slabs
  pile: [...Array(6).keys()].map((i) => 'rk3_' + i), // boulder piles: the rock's rim, under the blocks, the bank
};

// the rooms' far corners cut across (MustafarArena.cornerSet: a corridor out of the corner between two console
// banks, as the set's, reference/color_rots image_11..13, image_29), metres along each wall: the diagonal 4 m, the
// corridor's portal
const HALL_CUT = 2.12; // (the conference room's: one head-on console across it, 3 m, cornerConsole)
const CONTROL_CUT = 2.83;
const CORNER_BANK = 4; // m: each console bank along its wall from the cut's end

export class MustafarArena extends World {
  /** The model rocks become the rock sprites when they loaded: a cliff a wall (now and then a landform), a boulder a crag, a lava rock a pile. */
  addProp(type, x, y, opts = {}) {
    const cls = type === 'cliff' ? (this.rng.next() < 0.3 ? 'land' : 'wall') : type === 'boulder' ? 'crag' : type === 'lavaRock' ? 'pile' : null;
    if (cls && cityFootprint(ROCKS[cls][0])) {
      // the biggest that keeps clear of the sets: a smaller class when its picture would lie over a deck or room
      const order = ['land', 'wall', 'crag', 'pile'];
      for (const c of order.slice(order.indexOf(cls))) {
        const list = ROCKS[c];
        const name = list[Math.floor(this.rng.next() * list.length)];
        if (this.rockClear(name, x, y)) return this.addSheetProp(name, x, y, { noBlock: true });
      }
      return null; // no room for any: the bare rock
    }
    return super.addProp(type, x, y, opts);
  }

  /**
   * Whether a rock sprite at (x, y) keeps off the sets: no walkable tile (a deck, a room, a catwalk) under any
   * part of its picture — the tiles behind it that its height covers and those beside it under its width — with
   * a tile of margin.
   */
  rockClear(name, x, y) {
    const sz = citySize(name);
    if (!sz) return true;
    const [w, h, ox, oy] = sz;
    const sx = (x - y) * HALF_W;
    const sy = (x + y) * HALF_H;
    const x0 = sx - ox - HALF_W * 2;
    const x1 = sx - ox + w + HALF_W * 2;
    const y0 = sy - oy - HALF_H * 2;
    const y1 = sy - oy + h + HALF_H * 2;
    // tiles whose ground point falls in that screen box: u = x - y in [x0, x1] / HALF_W, v = x + y in [y0, y1] / HALF_H
    for (let v = Math.floor(y0 / HALF_H); v <= Math.ceil(y1 / HALF_H); v++)
      for (let u = Math.floor(x0 / HALF_W); u <= Math.ceil(x1 / HALF_W); u++) {
        if ((u + v) & 1) continue;
        const tx = (u + v) / 2;
        const ty = (v - u) / 2;
        if (!this.inBounds(tx, ty)) continue;
        const b = this.biome[ty * MAP_W + tx];
        if (b === BIOME.MUSTAFAR || b === BIOME.GRATE) return false;
      }
    return true;
  }

  generate() {
    this.rng = new RNG(this.seed);
    const M = MUSTAFAR_D; // (built in design coordinates, transposed at the end)
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
    // the rooms' far corners cut across (pentagons, as the film's and the LEGO set's rooms): `cut` metres along
    // each wall from the corner, the corner set across it (cornerSet)
    const cutOf = (r) => (r === M.hall ? HALL_CUT : r === M.control ? CONTROL_CUT : 0);
    const inCut = (x, y, r) => x - (r.x - r.hw) + (y - (r.y - r.hh)) < cutOf(r);
    const inEll = (x, y, e) => ((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 <= 1;
    const floors = [M.pad, M.walk, M.corridor, M.hall, M.junction, M.control];
    // the interior's floor laid out of the set's floor tiles as in the film (terrain.js facilityFloor; the tiles:
    // tools/sprites/mustafar_floor): a border `edge` tiles wide of the edge tile along the walls, the corner tile
    // in the corners, the chevron field inside in cells of about `cell` tiles; the corridors one runner of the
    // trim tile down their length; the control room's centre sunk a step inside a walkway (rects as above, first
    // match wins)
    this.floorPlan = [
      { ...M.hall, axis: 'x', edge: 2, cell: 4.5, cut: HALL_CUT },
      { ...M.control, axis: 'x', edge: 2, cell: 4.5, pit: 2.6, cut: CONTROL_CUT },
      { ...M.corridor, axis: 'x', runner: true },
      { ...M.junction, axis: 'y', runner: true },
    ];
    const grates = [M.balcony, M.arm];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const cx = x + 0.5;
        const cy = y + 0.5;
        let b = BIOME.LAVA;
        const bankEdge = M.bank.y - 3.5 + (fbm(x / 5, 3, 11) - 0.5) * 3;
        if (inEll(cx, cy, M.deck) || floors.some((r) => inRect(cx, cy, r) && !inCut(cx, cy, r))) b = BIOME.MUSTAFAR;
        else if (grates.some((r) => inRect(cx, cy, r))) b = BIOME.GRATE;
        else if (inRect(cx, cy, { ...M.hall, hw: M.hall.hw + 2, hh: M.hall.hh + 2 }) || inRect(cx, cy, { ...M.control, hw: M.control.hw + 2, hh: M.control.hh + 2 }) || inRect(cx, cy, { ...M.corridor, hw: M.corridor.hw + 1, hh: M.corridor.hh + 2 }) || inRect(cx, cy, { ...M.junction, hw: M.junction.hw + 2, hh: M.junction.hh })) b = BIOME.ASH; // the building's rock footing
        else if (cy > bankEdge && Math.abs(cx - M.bank.x) < 24) b = BIOME.ASH;
        this.biome[i] = b;
        this.blocked[i] = b === BIOME.MUSTAFAR || b === BIOME.GRATE ? 0 : 2;
        this.explored[i] = 1;
      }
    }

    // --- the landing platform: crates, Padmé's skiff --------------------------
    const D = M.deck;
    // (the deck's stores: the cargo sprites, placed after the transpose — cargo(); these crates if they did not load)
    if (!cityFootprint('cgCrateL')) for (const [dx, dy] of [[6, -2], [6.8, -1.2], [-6.5, 3.5]]) this.addProp('crate', D.x + dx, D.y + dy);
    // the robes thrown off before the fight (shown by the opening scene)
    this.cloak = this.addProp('cloakPile', D.x - 2.2, D.y + 1.6);
    this.robe = this.addProp('robePile', D.x + 3.4, D.y - 1.8);
    this.cloak.hidden = this.robe.hidden = true;
    // (only the set sprites the film gives stand here: no model props — the walkway's rails, the door frames,
    // the pylons, walls, bodies and towers are left out)

    // --- entry corridor ---------------------------------------------------
    // its long wall windows on the lava, as in the film (tools/sprites/mustafar_set: three 5.5 m bays)
    const windows = [-5.5, 0, 5.5].map((dx) => this.addSheetProp('mfWindow', M.corridor.x + dx, M.corridor.y - M.corridor.hh - 0.5, { noBlock: true }));
    this.walls(M.corridor, 'hazardWall', { west: false, north: windows.includes(null) });

    // --- the conference room ---------------------------------------------
    const H = M.hall;
    // the film's screen consoles (tools/sprites/mustafar_console) lining the walls side by side, as the control
    // room's: the long wall's from the corner to the passage north and one past it, the end wall's its length
    // (from the corner set's bank: one to the passage north, one past it)
    for (const dx of [-5.2, -2.0, 1.3, 8.5]) this.console(H, 'north', dx);
    // the passage on to the control room (the film's sets, reference/color_rots): a covered corridor whose
    // pillared portal stands in the north wall, the consoles either side meeting its pillars
    // (its shell the junction's whole length, 15 m: the roof runs on to the control room; it clears round whoever is
    // in it or just behind it)
    if (!this.addSheetProp('mfCorridorL', M.junction.x, H.y - H.hh, { noBlock: true })) this.addSheetProp('mfCorridor', M.junction.x, H.y - H.hh, { noBlock: true });
    for (const dy of [-2.2, 1.0, 4.3]) this.console(H, 'west', dy); // (from the corner's console to the near corner)
    this.door({ x: M.junction.x, y: H.y - H.hh }, 1, false); // (the covered corridor's portal is its frame)
    // the film's long table, its pointed end to the passage; the high-backed chairs along its far side and
    // at its head (the near side left clear, as the near walls are); the model props if the sprites did not load.
    // The fight goes up onto it, as in the film: drawn with the floor, its top a surface 0.78 m up
    const table = this.addSheetProp('mfTable', H.x, H.y, { noBlock: true, flat: true });
    if (table) {
      this.surfaces.push({ x0: H.x - 4, y0: H.y - 0.8, x1: H.x + 4, y1: H.y + 0.8, z: 0.78 });
      // the chairs stand behind it (its far side and its head): drawn with the ground too, before it (the table
      // `over` the other flats), so its top covers their legs and seats as it is in front of them
      // (still in the way: a flat sprite blocks nothing, so each chair's tile is blocked here)
      const chair = (n, x, y) => this.addSheetProp(n, x, y, { flat: true }) && (this.blocked[Math.floor(y) * MAP_W + Math.floor(x)] = 1);
      for (const dx of [-3.2, -1.7, -0.2, 1.3, 2.8]) chair('mfChair', H.x + dx, H.y - 1.35);
      chair('mfChair_x', H.x - 4.7, H.y);
      table.over = true;
    } else {
      this.addProp('confTable', H.x, H.y);
      for (const dx of [-1.6, 0, 1.6]) {
        this.addProp('confChair', H.x + dx, H.y - 1.5, { angleIdx: 3 });
        this.addProp('confChair', H.x + dx, H.y + 1.5, { angleIdx: 1 });
      }
      this.addProp('confChair', H.x - 3.6, H.y, { angleIdx: 0 });
      this.addProp('confChair', H.x + 3.6, H.y, { angleIdx: 2 });
    }

    // --- the junction corridor (north out of the hall) --------------------
    // its inside the film's corridor, open to the camera (tools/sprites/mustafar_set: the far wall with its light
    // panels, a low near wall, a portal at either end), drawn with the ground so whoever walks it stays in view;
    // its hall end under the covered corridor's shell (which clears while anyone is inside)
    if (!this.addSheetProp('mfPassage', M.junction.x, M.junction.y, { noBlock: true, flat: true }))
      this.walls({ x: M.junction.x, y: (M.junction.y - M.junction.hh + 106) / 2, hw: M.junction.hw, hh: (106 - (M.junction.y - M.junction.hh)) / 2 }, 'hazardWall', { north: false });

    // --- the control room --------------------------------------------------
    const C = M.control;
    // the film's control room: its walls lined with screen consoles side by side, the back wall's middle one red
    // (the two rows meet in the far corner: the west row runs up to the north row's back, the north row starts at
    // the west row's desk front, its five spread a little to reach the room's east edge — the pillars meeting)
    // (the far corner: the corner set, placed in the world after the transpose; the rows on from its banks)
    for (const dx of [-0.45, 2.6, 5.65]) this.console(C, 'north', dx);
    for (const dy of [0.7, 3.8]) this.console(C, 'west', dy);
    // two holo-tables on the sunken floor, staggered across it as in the LEGO set (reference/color_rots image_10):
    // one towards the far corner, one towards the near; the model desk if the sprite did not load
    // (the two holo-tables: placed in the world after the transpose, holoTables())
    // the way out to the balcony (the film's sets, as the hall's to the junction): a covered corridor, its back on
    // the room's east edge, its portal on the catwalk; its inside the open corridor cut to the shell's 6 m, drawn
    // over the catwalk's first stretch (`over`), seen while the shell clears round whoever walks it. The old door
    // frame if the sprites did not load
    const vest = this.addSheetProp('mfPassageS_x', M.door4.x + 3, M.door4.y, { noBlock: true, flat: true });
    if (vest) {
      vest.over = true;
      this.addSheetProp('mfCorridor_r', M.door4.x + 6, M.door4.y, { noBlock: true });
    }
    this.door(M.door4, 0, !vest);
    for (const [dx, dy] of [[-3, -2], [3, 2], [5, -3], [-4, 4]]) this.lights.push({ x: C.x + dx, y: C.y + dy, z: 3.2, r: 235, g: 240, b: 255, rad: 150, flicker: 0.02 }); // the white light bars
    for (const [dx, dy] of [[0, 0], [-5, 3]]) this.lights.push({ x: C.x + dx, y: C.y + dy, z: 0.1, r: 90, g: 210, b: 255, rad: 110, flicker: 0.05 }); // cyan floor glow
    this.alarm = { x: C.x, y: C.y, z: 2.5, r: 255, g: 40, b: 30, rad: 0, flicker: 0.5 }; // lit by the duel when the shields fail
    this.lights.push(this.alarm);

    // --- the balcony: a railed grate catwalk over the lava falls -----------
    const B = M.balcony;
    // the film's outside catwalk (tools/sprites/mustafar_set: a grated deck, a rail on its far side), drawn with
    // the ground; the model rails if it did not load
    if (!this.addSheetProp('mfCatwalkL', B.x, B.y, { noBlock: true, flat: true }))
      for (let x = B.x - 7; x <= B.x + 7; x += 2) {
        this.addProp('catRail', x, B.y - 1.4, { angleIdx: 0, noBlock: true });
        this.addProp('catRail', x, B.y + 1.4, { angleIdx: 0, noBlock: true });
      }
    // the lava falls beyond the balcony (the film's): rock cliffs pouring into pools at the catwalk's side
    // (tools/sprites/mustafar_set mfFall; the model falls if the sprite did not load)
    // at the catwalk's far end the lifting arm (tools/sprites/mustafar_set mfLift: a grated beam into a cage of
    // curved vanes), its beam going on from the deck's end over the lava
    this.addSheetProp('mfLift', B.x + B.hw + 0.2, B.y, { noBlock: true });
    for (const dx of [5, 10]) this.lights.push({ x: B.x + B.hw + dx, y: B.y, z: 1.5, r: 255, g: 120, b: 40, rad: 170, flicker: 0.12 });
    if (!this.addSheetProp('mfFall_x', 89, 89, { noBlock: true }) | !this.addSheetProp('mfFall_x', 97.5, 88.5, { noBlock: true }) | !this.addSheetProp('mfFall_x', 106, 88.5, { noBlock: true }))
      for (const [x, y] of [[88, 87], [95, 86.5], [102, 87.5], [108, 92], [106, 100]]) this.addProp('lavaFall', x, y);

    // --- the collector arm ---------------------------------------------------
    const A = M.arm;
    // the film's collector arm (tools/sprites/mustafar_set: the vane head at its outer, west end, the grated arm,
    // the mast and its stays), drawn with the ground as it is walked on; the tower it hangs from stays (it falls)
    const arm = this.addSheetProp('mfArm', A.x, A.y, { noBlock: true, flat: true });
    // the falls behind the arm (they light the hanging scene); the model falls if the sprite did not load
    if (!this.addSheetProp('mfFall_x', 36, 98, { noBlock: true }) | !this.addSheetProp('mfFall_x', 46, 98.5, { noBlock: true }))
      for (const [x, y] of [[33, 97.5], [42, 97], [50, 97.5], ...(arm ? [] : [[27, 104]])]) this.addProp('lavaFall', x, y); // (the head stands where the last fall was)
    for (let x = -A.hw; x <= A.hw; x += 4) this.lights.push({ x: A.x + x, y: A.y, z: 0.2, r: 255, g: 120, b: 40, rad: 140, flicker: 0.15 });

    // --- the river bank: black sand and rock ---------------------------------
    for (let k = 0; k < 14; k++) this.addProp('lavaRock', M.bank.x + this.rng.range(-20, 20), M.bank.y + this.rng.range(-1, 9), { noBlock: true });

    // warm light from the lava all round the sets
    for (const r of [M.hall, M.control]) this.lights.push({ x: r.x, y: r.y, z: 2.5, r: 255, g: 150, b: 90, rad: 220, flicker: 0.03 });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) this.lights.push({ x: D.x + Math.cos(a) * (D.rx + 2.5), y: D.y + Math.sin(a) * (D.ry + 2.5), z: 0.2, r: 255, g: 120, b: 40, rad: 150, flicker: 0.12 });
    for (let x = B.x - B.hw + 1; x <= B.x + B.hw; x += 4) for (const dy of [-3, 3]) this.lights.push({ x, y: B.y + dy, z: 0.2, r: 255, g: 120, b: 40, rad: 130, flicker: 0.12 });
    for (let x = -22; x <= 22; x += 6) this.lights.push({ x: M.river.x + x, y: M.river.y, z: 0.2, r: 255, g: 110, b: 30, rad: 150, flicker: 0.12 });
    this.spawn = { x: D.x - 1.5, y: D.y + 1.5 };
    this.roadSegs = [];
    this.transpose();
    this.rockAndFall();
    this.cargo();
    this.holoTables();
    this.cornerConsole(MUSTAFAR.hall, HALL_CUT);
    this.cornerSet(MUSTAFAR.control, CONTROL_CUT);
    // Padmé's skiff on its apron, nose along it (the film's chrome skiff, tools/sprites/mustafar_set; the model if
    // the sprite did not load); placed in the world, after the transpose
    if (!this.addSheetProp('mfSkiff_y', MUSTAFAR.pad.x - 0.5, MUSTAFAR.pad.y - 0.5)) this.addProp('skiff', MUSTAFAR.pad.x - 0.5, MUSTAFAR.pad.y);
    // (a flat piece marked `over` is drawn after the other flats: the balcony's corridor over the catwalk)
    this.props.sort((a, b) => (a.over ? 1 : 0) - (b.over ? 1 : 0) || a.x + a.y - (b.x + b.y));
  }

  /**
   * The rock and the lava fall, laid in the world as the concept art and the film's wide shot show them
   * (reference/color_rots): the mountain behind the facility (up the screen), its blocks set into it, a rock
   * ledge under the landing platform; the lava fall pouring from a cleft in the mountain straight down the screen
   * between the left block (the landing side) and the right one (the arms' side), under the junction and the entry
   * corridor (they bridge it) into the river; lava streaks down the mountain's face; the second collector arm off
   * the right block, the tall finned spire over it and a lattice tower in front of the left one.
   */
  rockAndFall() {
    const W = MAP_W;
    const M = MUSTAFAR;
    const fall = [[80, 52], [86, 58], [92, 64], [100, 72], [108, 80], [118, 90], [128, 100], [140, 112]];
    const streaks = [
      [[70, 70], [76, 82], [80, 92]],
      [[112, 44], [120, 52], [126, 58]],
      [[96, 46], [100, 56]],
    ];
    const deck = M.deck;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.biome[i] !== BIOME.LAVA) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        const n = (fbm(cx / 9, cy / 9, 17) - 0.5) * 14 + (fbm(cx / 3, cy / 3, 23) - 0.5) * 4; // the rock's ragged edge
        const s = cx + cy;
        const d = cx - cy;
        const df = distToPolyline(cx, cy, fall);
        if (df < 1.8 + n * 0.05) continue; // the fall
        // the mountain behind and the rock the facility stands on, down to the walkway (the deck has its ledge)
        let rock = s > 118 + n && s < 214 + n && d > -34 + n && d < 66 + n;
        // a ledge under the landing platform, on its back side
        if (((cx - deck.x) / (deck.rx + 3)) ** 2 + ((cy - deck.y) / (deck.ry + 3)) ** 2 <= 1 && s < deck.x + deck.y + 4) rock = true;
        // the balcony stands out over open lava, and the fall keeps a gorge round it
        if (Math.abs(cx - M.balcony.x) < 6 + n * 0.15 && cy > M.balcony.y - M.balcony.hh - 4) rock = false;
        if (df < 3.4 + n * 0.08) rock = false;
        if (!rock) continue;
        this.biome[i] = streaks.some((l) => distToPolyline(cx, cy, l) < 0.65 + n * 0.05) ? BIOME.LAVA : BIOME.ASH;
        this.blocked[i] = 2;
      }
    // the fall's head: the film's lava fall out of the cleft (a cliff pouring into a pool), a pump house over it
    if (!this.addSheetProp('mfFall', fall[0][0] - 2, fall[0][1] + 1, { noBlock: true }))
      for (const [dx, dy] of [[-1.6, 1.6], [0, 0], [1.6, -1.6]]) this.addProp('lavaFall', fall[0][0] + dx, fall[0][1] + dy, { noBlock: true });
    for (const [x, y] of fall) this.lights.push({ x, y, z: 0.4, r: 255, g: 130, b: 40, rad: 190, flicker: 0.15 });
    // the right block's second collector arm (the first is the duel's, M.arm)
    this.addSheetProp('mfArm_y', M.hall.x + 8, M.hall.y - 21, { noBlock: true, flat: true });
    // the mountain's height: crags over the rock (tall ones deeper in, low ones at its edge and round the
    // facility), loose rock between
    const ash = (x, y) => this.biome[Math.floor(y) * W + Math.floor(x)] === BIOME.ASH;
    const edgeDist = (x, y) => {
      for (let r = 1; r <= 6; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!ash(x + dx, y + dy)) return r;
      return 7;
    };
    for (let gy = 10; gy < 150; gy += 3.2)
      for (let gx = 40; gx < 160; gx += 3.2) {
        const x = gx + this.rng.range(-1.2, 1.2);
        const y = gy + this.rng.range(-1.2, 1.2);
        if (!ash(x, y) || x > 134) continue; // (not on the river bank: the ending is played there)
        const e = edgeDist(x, y);
        if (x + y > 178) {
          // the rock under the facility: low, loose (the blocks stand on it)
          if (e >= 2 && this.rng.chance(0.5)) this.addProp('lavaRock', x, y, { noBlock: true });
          continue;
        }
        if (e >= 3) this.addProp('cliff', x, y, { noBlock: true });
        else if (e === 2) this.addProp('boulder', x, y, { noBlock: true });
        else this.addProp('lavaRock', x, y, { noBlock: true });
      }
  }

  /**
   * The facility's stores (tools/sprites/mustafar_cargo), in world coordinates: strapped crates, drums and caged
   * canisters unloaded beside the skiff and along the landing platform's far rim, as the film's sets keep their
   * cargo; a stack in the conference room's open corner and the control room's. Clear of the fights' lines (the
   * deck's middle, the walkway, the table, the sunken floor).
   */
  cargo() {
    const M = MUSTAFAR;
    const D = M.deck;
    const H = M.hall;
    const put = (n, x, y) => this.addSheetProp(n, x, y);
    // beside the skiff's tail and on the near rim
    put('cgCrateL', D.x - 4.5, D.y + 6.2);
    put('cgCrateS', D.x - 2.6, D.y + 7.4);
    put('cgDrum', D.x - 5.3, D.y + 4.6);
    put('cgCube', D.x - 1.2, D.y + 8.2);
    // the far rim, by the walkway
    put('cgTank', D.x + 4.4, D.y - 4.6);
    put('cgCanister', D.x + 2.8, D.y - 6.1);
    put('cgCageCap', D.x + 4.8, D.y - 1.8);
    // the conference room's near corner
    put('cgCage', H.x + H.hw - 1.4, H.y + H.hh - 1.6);
    put('cgCapsule', H.x + H.hw - 3.6, H.y + H.hh - 1.2);
    put('cgDrum', H.x + H.hw - 1.2, H.y + H.hh - 3.6);
    // (the control room's kept clear: the way out to the balcony is there)
  }

  /**
   * The design layout into the world: x ↔ y for every tile, prop, light and mark (a mirror across the screen's
   * vertical: the far walls stay the far walls). Props turn with it (a two-way prop swaps its angle, a four-way
   * one turns to π/2 − a); set sprites become their mirrored twins (MIRROR_SHEET).
   */
  transpose() {
    const W = MAP_W;
    const flip = (a) => {
      const b = new a.constructor(a.length);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) b[x * W + y] = a[y * W + x];
      return b;
    };
    this.biome = flip(this.biome);
    this.blocked = flip(this.blocked);
    this.explored = flip(this.explored);
    this.road = flip(this.road);
    const sw = (o) => ([o.x, o.y] = [o.y, o.x]);
    for (const p of this.props) {
      sw(p);
      if (p.rect) p.rect = [p.rect[1], p.rect[0]];
      if (p.sheet) {
        p.sheet = MIRROR_SHEET[p.sheet] || p.sheet;
        continue;
      }
      const angles = PROPS[p.type].angles || [0];
      if (angles.length > 1) {
        const want = Math.PI / 2 - angles[p.angleIdx];
        let best = p.angleIdx;
        let bd = Infinity;
        angles.forEach((a, i) => {
          const d = Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
          if (d < bd) [bd, best] = [d, i];
        });
        p.angleIdx = best;
        p.frameIdx = p.variant * angles.length + best;
        const def = PROPS[p.type];
        if (def.rectByAngle && p.rect) p.rect = def.rectByAngle[best];
      }
    }
    for (const l of this.lights) sw(l);
    for (const q of this.pois) sw(q);
    for (const q of this.steam || []) sw(q);
    for (const c of this.craters) sw(c);
    sw(this.spawn);
    this.surfaces = this.surfaces.map((t) => ({ x0: t.y0, y0: t.x0, x1: t.y1, y1: t.x1, z: t.z }));
    this.floorPlan = this.floorPlan.map((r) => ({ ...tpRect(r), axis: r.axis === 'x' ? 'y' : 'x' }));
  }

  /**
   * A screen console of the film (gfx/mustafarFloor.js, a sheet sprite) against a room's far wall: `side`
   * 'north' (facing +y) or 'west' (facing +x), `at` along the wall from the room's middle; its feet on the
   * floor's edge. Left out when its sprite did not load.
   */
  /**
   * The control room's two holo-tables, side by side on the sunken floor as in the LEGO set (reference/color_rots
   * image_10): each along the world's x (mfHoloX, its shadow baked for that way), one beside the other along y; in
   * world coordinates, after the transpose. The model desk if the sprite did not load.
   */
  holoTables() {
    const C = MUSTAFAR.control;
    // drawn with the ground and walked on, as the conference table: their tops a surface 1 m up (the fight goes up
    // onto them)
    const put = [-3.2, 1.4].map((dy) => {
      const t = this.addSheetProp('mfHoloX', C.x - 1.3, C.y + dy, { flat: true });
      if (!t) return null;
      t.over = true;
      this.surfaces.push({ x0: t.x - 2.0, y0: t.y - 0.8, x1: t.x + 2.0, y1: t.y + 0.8, z: 1.0 });
      return t;
    });
    if (!put[0]) this.addProp('consoleDesk', C.x - 1.3, C.y, { angleIdx: 0 });
  }

  /**
   * A room's cut far corner filled with the corner set (tools/sprites/mustafar_corner, image_29): the corridor's
   * portal across the diagonal (mfCornerC), a console bank on from it along each wall (mfCornerR down-right of the
   * corner on screen: along x; mfCornerL down-left: along y), their screens showing the lava. In world coordinates,
   * after the transpose (the pieces are baked for the world's own way round).
   */
  /** A room's cut far corner closed by the screen console seen head-on (mfConsoleD), its feet on the diagonal. */
  cornerConsole(r, cut) {
    const x0 = r.x - r.hw;
    const y0 = r.y - r.hh;
    this.addSheetProp('mfConsoleD', x0 + cut / 2 - 0.25, y0 + cut / 2 - 0.25, { noBlock: true });
  }

  cornerSet(r, cut) {
    const x0 = r.x - r.hw;
    const y0 = r.y - r.hh;
    const b = CORNER_BANK / 2;
    this.addSheetProp('mfCornerC', x0 + cut / 2, y0 + cut / 2, { noBlock: true });
    this.addSheetProp('mfCornerR', x0 + cut + b, y0 + 0.4, { noBlock: true });
    this.addSheetProp('mfCornerL', x0 + 0.4, y0 + cut + b, { noBlock: true });
  }

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

  /** A doorway: hazard pillars either side of a two-tile opening (`ai` 0: passage along x, 1: along y); `frame`: its door frame prop. */
  door(d, ai, frame = true) {
    if (frame) this.addProp('doorFrame', d.x, d.y, { angleIdx: ai, noBlock: true });
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

