// Remaster characters: 2×-density sprites baked in the background, after the
// game has started. Units draw their original frames until their HD set is
// ready, then switch over (Unit#sprites). Baking the whole cast at 2× up
// front would take minutes on a phone and hold ~4× the atlas memory, so only
// the characters in play are wanted: the player first, then the nearest.
// A finished set is cached on the device like every other bundle.
import { Baker } from './baker.js';
import { CHARACTERS, DUEL_CHARACTERS, SKINS } from './assets.js';
import { loadBundle, saveBundle } from './assetCache.js';

const SPECS = { ...CHARACTERS, ...DUEL_CHARACTERS, ...SKINS };
const PAGE_BYTES = 2048 * 2048 * 4;
/** HD character atlas memory kept at most (sets not in play are dropped first). */
const BUDGET = { touch: 10 * PAGE_BYTES, desktop: 24 * PAGE_BYTES };

const pagesOf = (set) => {
  const s = new Set();
  for (const a of Object.values(set.anims)) for (const dir of a.data) for (const f of dir) s.add(f.page);
  return s;
};

export class HDCharacters {
  constructor(assets) {
    this.assets = assets;
    this.hd = assets.spritesHD ||= {};
    this.wanted = [];
    this.used = new Map(); // name → last time wanted
    this.job = null; // { name, gen } of the set being baked
    this.loading = null; // name being read from the device cache
    this.failed = new Set();
    this.baker = null;
    this.idleT = 0;
    this.touch = false;
  }

  /** Characters in play, most important first. */
  want(names) {
    const now = performance.now();
    this.wanted = names.filter((n) => SPECS[n] && !this.failed.has(n));
    for (const n of this.wanted) this.used.set(n, now);
  }

  get busy() {
    return !!(this.job || this.loading);
  }

  /** Bytes of HD atlas pages currently held. */
  bytes() {
    let n = 0;
    for (const set of Object.values(this.hd)) n += pagesOf(set).size;
    return n * PAGE_BYTES;
  }

  /** Drop the least recently wanted sets beyond the memory budget. */
  trim() {
    const budget = this.touch ? BUDGET.touch : BUDGET.desktop;
    const keep = new Set(this.wanted);
    const spare = Object.keys(this.hd)
      .filter((n) => !keep.has(n))
      .sort((a, b) => (this.used.get(a) || 0) - (this.used.get(b) || 0));
    while (spare.length && this.bytes() > budget) {
      const n = spare.shift();
      for (const p of pagesOf(this.hd[n])) if (p.close) p.close();
      delete this.hd[n];
    }
  }

  /**
   * Advance the background work. `budgetMs`: how long this frame may spend
   * baking (0: in combat — only cache reads run). Returns true if it baked.
   */
  step(budgetMs) {
    if (!this.job && !this.loading) {
      const name = this.wanted.find((n) => !this.hd[n]);
      if (!name) {
        // nothing left: let the WebGL context go after a while
        if (this.baker && (this.idleT += 1) > 600) {
          this.baker.dispose();
          this.baker = null;
        }
        return false;
      }
      this.idleT = 0;
      this.loading = name;
      loadBundle('hd-' + name).then((b) => {
        this.loading = null;
        if (b) {
          this.hd[name] = b.sprites[name];
          this.trim();
        } else this.job = { name, gen: null };
      });
      return false;
    }
    if (!this.job || budgetMs <= 0) return false;
    const job = this.job;
    try {
      if (!job.gen) {
        this.baker ||= new Baker();
        this.baker.newAtlas();
        job.gen = this.baker.bakeAnimated(SPECS[job.name](), { hd: true });
      }
      const end = performance.now() + budgetMs;
      let r;
      do r = job.gen.next();
      while (!r.done && performance.now() < end);
      if (r.done) {
        this.job = null;
        this.hd[job.name] = r.value;
        saveBundle('hd-' + job.name, { sprites: { [job.name]: r.value } }); // then pages become bitmaps
        this.trim();
      }
    } catch (e) {
      console.warn('HD sprites failed for', job.name, e);
      this.failed.add(job.name);
      this.job = null;
    }
    return true;
  }
}
