// The Mustafar rebuild's duel director (docs/MUSTAFAR_REBUILD.md). It extends the Movie Duel rules (duel.js: Anakin's
// kit, composure, the guard, saber locks, cutscenes, the result screen) rather than duplicating them, and adds the
// film's order of places: STAGES, one zone each (world/mustafarStage.js), with the events between them to come.
//
// This step is STAGE 01's floor only: Anakin alone on the landing pad, free to walk and swing. No foe, no cutscene,
// no trigger yet — the stage's actors and events arrive with its later steps, and the next stage only once this one
// is approved.
import { Duel } from '../duel.js';

/** The film's places, in order (each its zone file, public/maps/mustafar_v2/<zone>.json). */
export const STAGES = [{ id: 'stage01', zone: 'stage01', title: '무스타파 · 착륙장' }];

export class MustafarDirector extends Duel {
  constructor(game) {
    super(game); // (equips Anakin, then setup())
    this.stage = STAGES[0];
    this.locked = this.cine = false; // nothing scripted yet: the controls are the player's from the start
  }

  /** Anakin where the zone puts him; nobody else yet. */
  setup() {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    p.sprite = 'anakin_tunic';
    p.x = w.spawn.x;
    p.y = w.spawn.y;
    if (w.spawnFace) p.faceTo(w.spawnFace.x, w.spawnFace.y);
    this.foe = null;
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파의 결투',
      name: '',
      sub: '',
      marks: [],
      win: '',
      lose: '',
    };
  }

  start() {
    this.started = true;
    this.locked = this.cine = false;
    this.game.emit('place', this.stage.title);
  }

  /** Per frame: the shared upkeep (waits, composure) — no foe, so no phases and no ending yet. */
  update(dt) {
    const g = this.game;
    const p = g.player;
    for (const w of this.waits || []) w.t -= dt;
    for (const w of (this.waits || []).filter((x) => x.t <= 0)) w.res();
    this.waits = (this.waits || []).filter((x) => x.t > 0);
    if (this.over) return;
    if (this.started) this.stats.t += dt;
    if (this.lock) this.updateLock(dt);
    if (p.composure < 0) p.composure = 0;
    if (p.composure < 100 && g.time - (p.composureT || 0) > 1.6 && !p.blocking) p.composure = Math.min(100, p.composure + dt * 14);
  }

  /** The title's music until the stage's own score is set (the film's cues come with the duel itself). */
  music() {
    return 'title';
  }
}
