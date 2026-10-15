// The Mustafar rebuild's zones (docs/MUSTAFAR_REBUILD.md): a zone file (public/maps/mustafar_v2/<id>.json, written
// by its generator in tools/maps/mustafar_v2) laid into a World. The file keeps each concern in its own layer —
// floor, surround, walk, collision, structures, decor, backdrop, actors, triggers, camera, lights, regions — and this
// only reads them into what the engine uses: the tile maps (biome: what the ground is; blocked: where one may not
// walk), the lights, the spawn, the camera box. The look of the floor is the terrain's (gfx/padFloor.js, from
// `padFloors`); the walking is the tile maps', never the picture's.
import { World, segDist } from './worldgen.js';
import { BIOME } from './biome.js';
import { RNG, dist } from '../core/math.js';
import { groundBackdrop } from '../gfx/assetManifest.js';
import { blockoutName } from '../gfx/blockout.js';

// the zone's data (main.js loads it before the world is made: World's constructor calls generate()), with `art`: its
// delivered external assets by manifest id (gfx/assetManifest.js loadAsset data) and `missingArt`: what it waits for
let ZONE = null;
const EDIT_FORMAT = 'mustafar-v2-edit'; // (the map editor's edit file: toMap)
export function setMustafarZone(z) {
  ZONE = z;
}

export class MustafarStage extends World {
  generate() {
    const z = ZONE;
    if (!z || z.format !== 'mustafar-zone') throw new Error('무스타파 구역 데이터가 없다 (public/maps/mustafar_v2)');
    this.zone = z;
    this.rng = new RNG(this.seed); // (addSheetProp's phases)
    this.ambient = [...z.ambient];
    this.grade = z.grade; // post.js colour grade
    // the ground round the zone (a placeholder for now: the lava texture), blocked
    const around = BIOME[z.surround.biome] ?? BIOME.LAVA;
    this.biome.fill(around);
    this.blocked.fill(1);
    this.explored.fill(1);
    // the floors: their tiles take the deck's biome (footsteps, the minimap); the terrain draws them from their art
    // (a landing pad: textures laid by its bay grid; a ground image: one picture, its anchor on world point `at`)
    const art = z.art || {};
    this.padFloors = [];
    this.backdrop = null;
    for (const f of z.floor) {
      if (f.art && art[f.art]) continue; // (a blockout floor whose art is here: the art's own deck, the lava under it)
      // a floor whose picture is not here yet: left out (STAGE 01's corridor), or the debug grid where the zone is in
      // blockout (`fallback: "grid"`, docs/MUSTAFAR_REBUILD.md "블록아웃")
      if (f.kind === 'texturedRect' && !art[f.asset]) {
        if (f.fallback === 'grid') this.padFloors.push({ ...f, kind: 'blockout', asset: null });
        if (f.x1 !== undefined && f.fallback === 'grid' && !f.z) this.rect(f.x0, f.y0, f.x1, f.y1, (i) => (this.biome[i] = BIOME.MUSTAFAR));
        continue;
      }
      if (f.kind === 'landingPad') this.padFloors.push({ ...f, bays: [...f.bays] });
      else if (f.kind === 'texturedRect' || f.kind === 'blockout') this.padFloors.push({ ...f }); // (one picture over the rectangle; a blockout's: the grid)
      else if (f.kind === 'groundImage' && art[f.asset] && !this.backdrop) this.backdrop = groundBackdrop(art[f.asset], f.at.x, f.at.y);
      if (f.x1 !== undefined) this.rect(f.x0, f.y0, f.x1, f.y1, (i) => (this.biome[i] = BIOME.MUSTAFAR));
    }
    this.padFloors.sort((a, b) => (b.z || 0) - (a.z || 0)); // (a raised floor before the ground's: it hides what is behind it)
    // where one may walk, then what stands in the way inside it — an entry with `needs` (asset ids) only once those
    // assets are delivered (a corridor's floor, the railings standing on the rim: no invisible ground or walls before)
    const has = (e) => !e.needs || e.needs.every((id) => art[id]);
    for (const a of z.walk) if (has(a)) this.rect(...a.rect, (i) => (this.blocked[i] = 0));
    this.doors = {}; // (a collision with `door`: shut until open(id))
    for (const c of z.collision)
      if (has(c)) {
        this.rect(...c.rect, (i) => (this.blocked[i] = 1));
        if (c.door) this.doors[c.id] = c.rect;
      }
    // who starts where (only Anakin in this step)
    const an = z.actors.anakin;
    this.spawn = { x: an.x, y: an.y };
    this.spawnFace = an.faceTo ? { ...an.faceTo } : null;
    this.camRegions = (z.cameras || [z.camera]).map((c) => ({ ...c })); // the view held over each zone (renderer.js camRegion: the nearest)
    // the map editor's saved edit over the zone files (main.js, world/mapStore.js pickEdit): its props, lights, raised
    // tops and painted way in place of the zones' (the rest — the floors, the way's rectangles, the doors, the places —
    // stays the zones')
    const E = z.edit && z.edit.format === EDIT_FORMAT ? z.edit : null;
    this.edited = !!E;
    this.floorPlan = []; // (the old map's rooms: none here — the editor's room and tile modes are the old map's)
    for (const l of E ? E.lights : z.lights) this.lights.push(this.mapLight({ ...l }));
    for (const r of z.regions) this.pois.push({ ...r });
    this.triggers = z.triggers.map((t) => ({ ...t }));
    // structures and dressing: sprite assets where they stand (an asset not delivered yet is left out — its
    // placeholder is the zone's walk/collision data, which holds without it)
    this.named = {}; // (structures with an `id`: the director's to show, hide or move — a door that opens)
    // the blockout's raised tops (a gallery, a deck over the lava, the high ground): whoever stands there stands at z
    this.surfaces = ((E && E.surfaces) || z.surfaces || []).map((t) => ({ ...t }));
    this.homeSurfaces = this.surfaces.slice(); // (the map's own: the director adds and takes some away as it plays)
    // the river's moving decks, walkable lines over the lava (the director's: duelMustafar.js Float, its pipe)
    this.floats = [];
    this.strips = (z.strips || []).map((q) => ({ ...q })); // (the service pipe: stage04)
    this.pipes = [];
    // the blockout (docs/MUSTAFAR_REBUILD.md "블록아웃"): grey boxes for the walls, furniture and set pieces of a stage
    // whose art is not requested yet (gfx/blockout.js made their sprites: main.js)
    if (E) for (const e of E.props) this.putEdited(e);
    else {
      for (const b of z.blockout || []) {
        if (b.art && art[b.art]) continue; // (its art is here: the box it stood in for goes)
        const p = this.addSheetProp(blockoutName(b), b.x, b.y, { noBlock: !b.block, flat: b.flat });
        if (p && b.id) this.named[b.id] = p;
        if (p && b.hidden) p.hidden = true; // (the director shows it: the fallen arm, a door)
      }
      for (const e of [...z.structures, ...z.decor]) {
        if (e.replacedBy && art[e.replacedBy]) continue; // (a stand-in made of delivered pieces, its own picture here: the conference room's two tables)
        const a = art[e.asset];
        const p = a ? this.addSheetProp(e.asset, e.x, e.y, { noBlock: !e.block, flat: a.meta.flat }) : null;
        if (p && e.z) p.z = e.z; // (standing on a raised floor: a console on the gallery — renderer.js placeProp lifts it)
        if (p && e.hidden) p.hidden = true; // (the director shows it: the conference room's wall with its door open)
        if (p && e.id) this.named[e.id] = p;
        if (p && a.meta.top) p.top = true; // (drawn over everyone: renderer.js)
        if (p && a.meta.order) p.order = a.meta.order; // (its depth point moved: metres farther along x + y)
      }
    }
    // a raised top goes with the piece standing over its middle (the conference table's: moved with it in the editor)
    for (const t of this.surfaces) {
      const p = this.props.find((q) => !q.flat && Math.abs(q.x - (t.x0 + t.x1) / 2) < 0.05 && Math.abs(q.y - (t.y0 + t.y1) / 2) < 0.05);
      if (p) Object.defineProperty(p, 'surface', { value: t, configurable: true, writable: true });
    }
    // the named ones as the map has them (the director moves, shows and hides them: toMap writes these)
    for (const o of Object.values(this.named)) this.keepHome(o);
    // the way painted in the editor (its tiles: walkable 0 / blocked 1), over everything above
    this.paintLog = new Map(E && E.paint ? E.paint.map(([x, y, v]) => [y * this.w + x, v]) : []);
    for (const [i, v] of this.paintLog) this.blocked[i] = v;
  }

  /** A prop of the editor's saved edit (toMap), placed as the zones' are. */
  putEdited(e) {
    const p = this.addSheetProp(e.sheet, e.x, e.y, { noBlock: !e.block, flat: !!e.flat });
    if (!p) return; // (its picture is not here: a sprite this build does not have)
    if (e.z) p.z = e.z;
    if (e.hidden) p.hidden = true;
    if (e.top) p.top = true;
    if (e.order) p.order = e.order;
    if (e.id) this.named[e.id] = p;
  }

  // --- the map editor (ui/mapEditor.js: F2) — the same hooks as the old map's world (worldgen.js MustafarArena) ----

  addSheetProp(name, x, y, opts = {}) {
    const n = this.lights.length;
    const p = super.addSheetProp(name, x, y, opts);
    if (p) p.block = !opts.noBlock && !p.flat; // (for the editor and toMap)
    for (let i = n; i < this.lights.length; i++) Object.defineProperty(this.lights[i], 'of', { value: p, configurable: true });
    return p;
  }

  own(put, opts) {
    const p = put();
    if (p) p.block = !opts.noBlock && !p.flat;
    return p;
  }

  /** A light of the map's (written by toMap; one the director adds while it plays — the alarm, the decks' — is not). */
  mapLight(l) {
    Object.defineProperty(l, 'map', { value: true, configurable: true });
    return l;
  }

  /** A named prop's state as the map has it (`home`): the director moves, shows and hides them as it plays. */
  keepHome(o) {
    const keys = 'sheet' in o ? ['x', 'y', 'hidden'] : ['x', 'y', 'z', 'r', 'g', 'b', 'rad', 'flicker'];
    Object.defineProperty(o, 'home', { value: Object.fromEntries(keys.map((k) => [k, o[k]])), configurable: true, writable: true });
  }

  /**
   * The editor's edit as its file (mapStore / ⬇: mustafar_v2_edit.json): every prop (sprite, place, flags, the
   * director's names), the map's lights, the raised tops and the tiles painted in the editor — what generate() lays
   * in place of the zones' when it was made from the same zone files. The zones stay the source: the edit is carried
   * into their generators (tools/maps/mustafar_v2) when it is kept.
   */
  toMap() {
    const n6 = (v) => Math.round(v * 1e6) / 1e6;
    const ids = new Map(Object.entries(this.named || {}).map(([k, v]) => [v, k]));
    const prop = (q) => {
      const p = q.home ? { ...q, ...q.home } : q;
      const o = { sheet: p.sheet, x: n6(p.x), y: n6(p.y) };
      if (p.z) o.z = n6(p.z);
      if (p.flat) o.flat = true;
      if (p.top) o.top = true;
      if (p.block) o.block = true;
      if (p.order) o.order = n6(p.order);
      if (ids.has(q)) o.id = ids.get(q);
      if (p.hidden) o.hidden = true;
      return o;
    };
    const light = (q) => Object.fromEntries(['x', 'y', 'z', 'r', 'g', 'b', 'rad', 'flicker'].map((k) => [k, n6(q[k])]));
    return {
      format: EDIT_FORMAT,
      version: 1,
      note: 'map editor edit over public/maps/mustafar_v2/stage01..06.json (props, lights, raised tops, painted tiles [x, y, 0 walkable / 1 blocked])',
      props: this.props.filter((q) => q.sheet).map(prop),
      lights: this.lights.filter((l) => l.map && !l.of).map(light),
      surfaces: this.homeSurfaces.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'number' ? n6(v) : v]))),
      paint: [...this.paintLog].map(([i, v]) => [i % this.w, Math.floor(i / this.w), v]),
    };
  }

  /** The river's moving decks, and the strips (a pipe), are walkable wherever they are (worldgen.js MustafarArena's). */
  isBlocked(x, y) {
    for (const f of this.floats) if (dist(x, y, f.x, f.y) <= f.r) return false;
    for (const q of this.strips) if (segDist(x, y, q) <= q.r) return false;
    return super.isBlocked(x, y);
  }

  /** A door's way through opened (its collision rectangle walkable from now on). */
  open(id) {
    const r = this.doors[id];
    if (!r) return;
    this.rect(...r, (i) => (this.blocked[i] = 0));
    delete this.doors[id];
  }

  /** Every tile whose centre lies in the world rectangle [x0, x1) × [y0, y1). */
  rect(x0, y0, x1, y1, f) {
    for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y < Math.min(this.h, Math.ceil(y1 - 0.5)); y++)
      for (let x = Math.max(0, Math.ceil(x0 - 0.5)); x < Math.min(this.w, Math.ceil(x1 - 0.5)); x++) f(y * this.w + x);
  }
}
