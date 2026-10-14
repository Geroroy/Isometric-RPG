// The remastered ground built in workers (gfx/terrainWorker.js): a chunk at 2-3× the density takes 0.4-1 s to
// build, too long for the main thread even a few ms a frame — so a few workers build them side by side while the
// classic chunks stand in (terrain.js draw). Each frame the terrain hands over the chunks it wants, the ones in
// view first; an idle worker takes the first not built or under way. A result for another density or another
// place is dropped. Without workers or OffscreenCanvas the terrain builds them itself, a few ms a frame.
import { TEXTURE_INPUTS } from './terrain.js';

let gens = 0;

export class TerrainPool {
  static supported() {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmap !== 'undefined';
  }

  constructor(terrain) {
    this.terrain = terrain;
    this.gen = ++gens;
    this.failed = false;
    this.inflight = new Set(); // 'cx,cy@S'
    const w = terrain.world;
    const world = { w: w.w, h: w.h, biome: w.biome, blocked: w.blocked, road: w.road, floorPlan: w.floorPlan || null, craters: w.craters || [], city: !!w.city, ashLit: w.ashLit || null, upper: w.upper || null, cliff: w.cliff || 0 };
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    this.workers = [];
    try {
      for (let i = 0; i < n; i++) {
        const wk = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
        wk.busy = null;
        wk.onmessage = (e) => this.done(wk, e.data);
        wk.onerror = (e) => {
          console.warn('지형 워커: ' + (e.message || 'error'));
          this.failed = true;
        };
        wk.postMessage({ type: 'init', world, tex: TEXTURE_INPUTS });
        this.workers.push(wk);
      }
    } catch (e) {
      console.warn('지형 워커 없음: ' + e.message);
      this.failed = true;
    }
  }

  /** Hand the idle workers the first of `list` ([cx, cy] in order of need) not built or under way, at density S. */
  want(list, S) {
    const t = this.terrain;
    let i = 0;
    for (const wk of this.workers) {
      if (wk.busy) continue;
      while (i < list.length) {
        const [cx, cy] = list[i++];
        const key = cx + ',' + cy;
        if (t.cache.has(key) || this.inflight.has(key + '@' + S)) continue;
        wk.busy = key + '@' + S;
        this.inflight.add(wk.busy);
        wk.postMessage({ type: 'build', gen: this.gen, cx, cy, S });
        break;
      }
    }
  }

  done(wk, m) {
    this.inflight.delete(wk.busy);
    wk.busy = null;
    if (m.error) {
      console.warn('지형 워커: ' + m.error);
      this.failed = true;
      return;
    }
    const t = this.terrain;
    if (m.gen !== this.gen || m.S !== t.S || t.cache.has(m.key)) {
      m.bmp.close();
      return;
    }
    t.insert(m.key, { canvas: m.bmp, sx: m.sx, sy: m.sy });
  }

  close() {
    for (const wk of this.workers) wk.terminate();
    this.workers = [];
  }
}
