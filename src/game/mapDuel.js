// The lightsaber duel on the Mustafar map ('#duel-mustafar', the artifact): the duel's own system (src/combat — the same
// CombatSim, rules, AI, poses and fighter sprites as its test arena, docs/COMBAT.md) played on the rebuilt map through
// the small interface there (src/combat/world.js groundFromTiles: the map's blocked tiles), drawn by the map's own
// renderer (gfx/renderer.js calls drawShadows / items / drawGlow here: src/combat/mapView.js), the duel's HUD over it
// (src/combat/hud.js). Anakin is the player (WASD, mouse, F, Space — controls.js), Obi-Wan the AI; far apart the
// fighters walk the map at its walking speed facing where they go (sim `travel`, tuning.js travelSpeed 4.6 m/s), close
// they square up. A KO ends the round (the HUD's result), R starts it again from the stage's places.
// It holds the scene the way MapWalk did (`game.duel`: the HUD, the music, the map editor and its play-test read it):
// the game's own player unit stands where Anakin is (the camera follows it), hidden and locked — the fight is the
// duel's, not the campaign's units'.
import '../combat/hud.css';
import { CombatSim } from '../combat/sim.js';
import { groundFromTiles } from '../combat/world.js';
import { AIController } from '../combat/ai.js';
import { PlayerController } from '../combat/controls.js';
import { CombatHUD } from '../combat/hud.js';
import { MapCombatView } from '../combat/mapView.js';
import { loadFighterSprites } from '../combat/sprites.js';

// the keys the duel takes from the game's own (core/input.js): heavy (F), dodge (Space), restart (R), and the campaign's
// skills, potions and panels that have no place in the duel
const KEYS = new Set(['f', ' ', 'r', '1', '2', '3', '4', '5', '6', 'q', 'x', 'e', 'k', 't', 'c', 'p', 'v']);

export class MapDuel {
  constructor(game) {
    this.game = game;
    this.locked = true; // (the player unit does not act: the map editor's play-test unlocks and restores it)
    this.started = false;
    this.over = false;
    this.keys = KEYS;
    const w = game.world;
    const A = (w.zone && w.zone.actors) || {};
    const a = A.anakin || w.spawn;
    const o = A.obiwan || A.anakinMeet || { x: a.x + 6, y: a.y };
    const blocked = (x, y) => w.isBlocked(x, y);
    this.player = new PlayerController(window);
    this.player.enabled = false;
    this.ai = new AIController('obiwan', 1);
    this.sim = new CombatSim({
      ground: groundFromTiles(blocked),
      spawns: [{ x: a.x, y: a.y }, { x: o.x, y: o.y }],
      cast: ['anakin', 'obiwan'],
      controllers: [this.player, this.ai],
      travel: true,
    });
    this.view = new MapCombatView(this.sim, null);
    const root = document.createElement('div');
    root.id = 'cb-hud';
    root.className = 'map-duel';
    document.body.appendChild(root);
    this.hud = new CombatHUD(root, this.sim, { playerSide: () => 0, watching: () => false, paused: () => false, speed: () => 1, ais: () => [null, this.ai], onMap: true });
    this.hud.setCharacters('loading');
    loadFighterSprites()
      .then((sp) => {
        this.view.sprites = sp;
        this.hud.setCharacters('sprites', sp.used);
      })
      .catch((e) => {
        console.warn('결투자 스프라이트를 불러오지 못해 단순한 몸으로 그립니다:', e);
        this.hud.setCharacters('fallback');
      });
    this.sim.on((e) => this.onEvent(e));
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && !e.repeat && this.started && this.active()) this.restart();
    });
    const p = game.player;
    p.saberLit = false;
    p.sprite = game.assets.sprites.anakin_tunic ? 'anakin_tunic' : p.sprite;
    this.follow();
  }

  /** the duel plays (not in the map editor or its play-test) */
  active() {
    const g = this.game;
    return !g.mapTest && !(g.renderer && g.renderer.editing);
  }

  start() {
    this.started = true;
  }

  restart() {
    this.sim.reset();
    this.player.reset();
    this.over = false;
  }

  music() {
    return 'silence';
  }

  /** the game's player unit on Anakin: the camera, the sound's listener and the map's exploration follow him */
  follow() {
    const p = this.game.player;
    const f = this.sim.fighters[0];
    p.x = f.x;
    p.y = f.y;
    p.hidden = true;
    p.action = null;
  }

  update(dt) {
    this.player.enabled = this.started && this.active();
    if (!this.started || !this.active()) return;
    this.sim.advance(dt);
    this.over = !!this.sim.over;
    this.follow();
    this.hud.update(dt, false);
  }

  // --- the renderer's calls (gfx/renderer.js)
  /** before the frame's drawing: the poses and frames (the camera already set) */
  frame(renderer, dt) {
    this.view.r = renderer;
    this.view.frame(this.started ? dt : 0);
  }

  drawShadows(ctx) {
    this.view.drawShadows(ctx);
  }

  items(depthOf) {
    return this.view.items(depthOf);
  }

  drawGlow(ctx, dt) {
    this.view.drawGlow(ctx, dt);
  }

  // --- sound: the game's own audio (core/audio.js), as the arena plays it
  onEvent(e) {
    const audio = this.game.audio;
    if (!audio || !audio.ctx) return;
    const at = (p) => (p ? { x: p[0], y: p[1] } : null);
    switch (e.type) {
      case 'active':
        audio.play('swing', e.by, { heavy: e.kind === 'heavy', rate: e.kind === 'heavy' ? 0.85 : 1.15 });
        break;
      case 'block':
        audio.play('clash', at(e.at), { heavy: e.kind === 'heavy' || e.broke });
        break;
      case 'parry':
        audio.play('clash', at(e.at), { perfect: true });
        break;
      case 'clash':
        audio.play('clash', at(e.at), { heavy: true });
        break;
      case 'hit':
        audio.play('hit', at(e.at), { crit: e.punish || e.kind === 'heavy' });
        break;
      case 'break':
        audio.play('slam', e.target);
        break;
      case 'reset':
        audio.play('ignite');
        break;
    }
  }
}
