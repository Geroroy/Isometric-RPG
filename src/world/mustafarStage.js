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
    for (const l of z.lights) this.lights.push({ ...l });
    for (const r of z.regions) this.pois.push({ ...r });
    this.triggers = z.triggers.map((t) => ({ ...t }));
    // structures and dressing: sprite assets where they stand (an asset not delivered yet is left out — its
    // placeholder is the zone's walk/collision data, which holds without it)
    this.named = {}; // (structures with an `id`: the director's to show, hide or move — a door that opens)
    // the blockout's raised tops (a gallery, a deck over the lava, the high ground): whoever stands there stands at z
    this.surfaces = (z.surfaces || []).map((t) => ({ ...t }));
    // the river's moving decks, walkable lines over the lava (the director's: duelMustafar.js Float, its pipe)
    this.floats = [];
    this.strips = (z.strips || []).map((q) => ({ ...q })); // (the service pipe: stage04)
    this.pipes = [];
    // the blockout (docs/MUSTAFAR_REBUILD.md "블록아웃"): grey boxes for the walls, furniture and set pieces of a stage
    // whose art is not requested yet (gfx/blockout.js made their sprites: main.js)
    for (const b of z.blockout || []) {
      if (b.art && art[b.art]) continue; // (its art is here: the box it stood in for goes)
      const p = this.addSheetProp(blockoutName(b), b.x, b.y, { noBlock: !b.block, flat: b.flat });
      if (p && b.id) this.named[b.id] = p;
      if (p && b.hidden) p.hidden = true; // (the director shows it: the fallen arm, a door)
    }
    for (const e of [...z.structures, ...z.decor]) {
      const a = art[e.asset];
      const p = a ? this.addSheetProp(e.asset, e.x, e.y, { noBlock: !e.block, flat: a.meta.flat }) : null;
      if (p && e.z) p.z = e.z; // (standing on a raised floor: a console on the gallery — renderer.js placeProp lifts it)
      if (p && e.hidden) p.hidden = true; // (the director shows it: the conference room's wall with its door open)
      if (p && e.id) this.named[e.id] = p;
      if (p && a.meta.top) p.top = true; // (drawn over everyone: renderer.js)
      if (p && a.meta.order) p.order = a.meta.order; // (its depth point moved: metres farther along x + y)
    }
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
