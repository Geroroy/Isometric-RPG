// The Mustafar blank map (the main menu's '무스타파 빈 맵', '#duel-mustafar-blank'): the rebuild's lava and nothing
// else (public/maps/mustafar_v2/blank.json), a map built by hand in the map editor (ui/mapEditor.js: it opens on
// start). Anakin alone — no Obi-Wan, no scenes, no end: a duel only so the editor, the HUD and the play-test work as
// they do on the duel's map.
import { Duel } from './duel.js';

export class BlankDuel extends Duel {
  setup() {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    p.sprite = 'anakin_tunic';
    p.x = w.spawn.x;
    p.y = w.spawn.y;
    this.foe = null; // (nobody to fight: the duel HUD leaves out the boss's bar)
    this.hud = { kicker: 'MAP EDITOR', title: '무스타파 빈 맵', name: '', sub: '', marks: [], win: '', lose: '' };
  }

  start() {
    this.started = true;
    this.locked = this.cine = false;
  }

  /** The lava's sound alone (no duel score over the building). */
  music() {
    return 'silence';
  }

  update(dt) {
    const p = this.game.player;
    if (p.composure < 100) p.composure = Math.min(100, p.composure + dt * 14);
  }
}
