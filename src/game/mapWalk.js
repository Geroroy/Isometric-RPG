// The Mustafar maps walked without a fight ('#duel-mustafar' and the other map hashes: main.js). The lightsaber duel
// that used to run here (duel.js, duelMustafar.js, mustafar/director.js…) was removed: the duel is its own system now —
// src/combat, played in its test arena (arena.html, docs/COMBAT.md) — and joins the map later through the small
// interface there (src/combat/world.js groundFromTiles). What is left is the scene holder the HUD, the music, the map
// editor and the play-test read as `game.duel`: Anakin on the map, the camera, nothing to fight.
export class MapWalk {
  constructor(game) {
    this.game = game;
    this.locked = false; // (the map editor's play-test reads and restores it)
    this.started = false;
    this.over = false;
    this.foe = null;
    const p = game.player;
    const w = game.world;
    p.sprite = game.assets.sprites.anakin_tunic ? 'anakin_tunic' : p.sprite;
    const a = w.zone && w.zone.actors && (w.zone.actors.anakin || w.zone.actors.anakinMeet);
    const at = a || w.spawn;
    p.x = at.x;
    p.y = at.y;
    p.saberLit = false;
  }

  start() {
    this.started = true;
  }

  /** (no clicks taken over: the left button walks) */
  press() {
    return false;
  }

  /** The place's own sound (no duel score) */
  music() {
    return 'silence';
  }

  update() {}
}
