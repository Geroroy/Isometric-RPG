// The Mustafar rebuild's zones (docs/MUSTAFAR_REBUILD.md): a zone file (public/maps/mustafar_v2/<id>.json, written
// by its generator in tools/maps/mustafar_v2) laid into a World. The file keeps each concern in its own layer —
// floor, surround, walk, collision, structures, decor, backdrop, actors, triggers, camera, lights, regions — and this
// only reads them into what the engine uses: the tile maps (biome: what the ground is; blocked: where one may not
// walk), the lights, the spawn, the camera box. The look of the floor is the terrain's (gfx/padFloor.js, from
// `padFloors`); the walking is the tile maps', never the picture's.
import { World } from './worldgen.js';
import { BIOME } from './biome.js';
import { RNG } from '../core/math.js';
import { groundBackdrop } from '../gfx/assetManifest.js';

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
      if (f.kind === 'landingPad') this.padFloors.push({ ...f, bays: [...f.bays] });
      else if (f.kind === 'groundImage' && art[f.asset] && !this.backdrop) this.backdrop = groundBackdrop(art[f.asset], f.at.x, f.at.y);
      if (f.x1 !== undefined) this.rect(f.x0, f.y0, f.x1, f.y1, (i) => (this.biome[i] = BIOME.MUSTAFAR));
    }
    // where one may walk, then what stands in the way inside it — an entry with `needs` (asset ids) only once those
    // assets are delivered (a corridor's floor, the railings standing on the rim: no invisible ground or walls before)
    const has = (e) => !e.needs || e.needs.every((id) => art[id]);
    for (const a of z.walk) if (has(a)) this.rect(...a.rect, (i) => (this.blocked[i] = 0));
    for (const c of z.collision) if (has(c)) this.rect(...c.rect, (i) => (this.blocked[i] = 1));
    // who starts where (only Anakin in this step)
    const an = z.actors.anakin;
    this.spawn = { x: an.x, y: an.y };
    this.spawnFace = an.faceTo ? { ...an.faceTo } : null;
    this.camRegions = [{ ...z.camera }]; // the view held over the zone (renderer.js camRegion)
    for (const l of z.lights) this.lights.push({ ...l });
    for (const r of z.regions) this.pois.push({ ...r });
    this.triggers = z.triggers.map((t) => ({ ...t }));
    // structures and dressing: sprite assets where they stand (an asset not delivered yet is left out — its
    // placeholder is the zone's walk/collision data, which holds without it)
    for (const e of [...z.structures, ...z.decor]) {
      const a = art[e.asset];
      const p = a ? this.addSheetProp(e.asset, e.x, e.y, { noBlock: !e.block, flat: a.meta.flat }) : null;
      if (p && a.meta.top) p.top = true; // (drawn over everyone: renderer.js)
      if (p && a.meta.order) p.order = a.meta.order; // (its depth point moved: metres farther along x + y)
    }
  }

  /** Every tile whose centre lies in the world rectangle [x0, x1) × [y0, y1). */
  rect(x0, y0, x1, y1, f) {
    for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y < Math.min(this.h, Math.ceil(y1 - 0.5)); y++)
      for (let x = Math.max(0, Math.ceil(x0 - 0.5)); x < Math.min(this.w, Math.ceil(x1 - 0.5)); x++) f(y * this.w + x);
  }
}
