// A free duel with Obi-Wan on the painted Mustafar map (public/maps/mustafar_art.json, built by
// tools/maps/mustafar_art_build.py from the lava fortress picture): no film to follow — he waits in the doorway
// behind the landing pad, a word each, then the fight by the duel's own rules (duel.js), his Force push for Dooku's
// lightning (as on the film's map, duelMustafar.js). The decks are the picture's: the pad, the bridge over the
// falls, the refinery's decks, the catwalks out to the collector arms.
import { Duel } from './duel.js';
import { ObiWan } from './duelMustafar.js';
import { Cinema } from './cinema.js';

const LINES = {
  parry: [['obiwan', '그만둬, 아나킨!'], ['obiwan', '아직 늦지 않았다.'], ['obiwan', '분노로는 날 이길 수 없다.']],
  broken: [['obiwan', '크윽…!'], ['obiwan', '아나킨…!']],
  push: [['obiwan', '물러서라!']],
  lightning: [['obiwan', '물러서라!']],
};
const SPEAKERS = { anakin: '아나킨', obiwan: '오비완' };

export class ArtDuel extends Duel {
  constructor(game) {
    super(game);
    this.lines = LINES;
    this.speakers = SPEAKERS;
  }

  setup() {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    p.sprite = 'anakin_tunic';
    p.x = w.spawn.x;
    p.y = w.spawn.y;
    const at = w.foeSpawn || { x: p.x + 2, y: p.y - 2 };
    const ob = (this.foe = new ObiWan(g, at.x, at.y));
    ob.maxHp = ob.hp = 1800; // (a free fight: shorter than the film's three sets)
    ob.faceTo(p.x, p.y);
    p.faceTo(ob.x, ob.y);
    g.units.push(ob);
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파 용암 요새',
      name: '오비완 케노비',
      sub: '제다이 마스터 · 소레수',
      marks: [0.6, 0.25, 0.1],
      win: '오비완이 무릎을 꿇었다. 용암 요새의 착륙장 위로 재가 내리고, 아나킨은 스승을 뒤로한 채 돌아섰다.',
      lose: '아나킨은 착륙장에 쓰러졌다. 오비완은 쓰러진 제자를 내려다보다, 말없이 스키프로 걸어갔다.',
    };
  }

  /** The opening: a word each across the pad, then the fight. */
  intro() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.hold();
    const say = (t, who, text, d) => ({ t, say: [this.speakers[who], text, d] });
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      { t: 0.05, fade: 0, fadeDur: 1.6, cam: { x: (p.x + ob.x) / 2, y: (p.y + ob.y) / 2, zoom: 1.3 } },
      say(1.0, 'obiwan', '여기까지 따라오게 될 줄은 몰랐다, 아나킨.', 2.6),
      say(3.8, 'anakin', '막을 수 없어요, 마스터. 이젠 아무도.', 2.4),
      { t: 6.0, do: (c) => (ob.setAnim('walk', 1), c.move(ob, p.x + 2.2, p.y - 1.4, 1.2)) },
      { t: 7.3, do: () => (ob.setAnim('idle'), ob.faceTo(p.x, p.y), p.faceTo(ob.x, ob.y)) },
    ];
    return new Cinema(g, { length: 7.6, cues }).play();
  }

  /** Force push (Obi-Wan's "cast"): pushes Anakin back, can't be blocked (as duelMustafar.js). */
  lightning(dk) {
    if (dk.pushed || dk.stateT > 0.45) return;
    dk.pushed = true;
    const g = this.game;
    const p = g.player;
    const a = Math.atan2(p.y - dk.y, p.x - dk.x);
    g.fx.shockwave(dk.x + Math.cos(a) * 0.8, dk.y + Math.sin(a) * 0.8, 1.3, '#bfe0ff', 0.4);
    g.audio.play('push', dk);
    if (Math.hypot(p.x - dk.x, p.y - dk.y) > 4.5) return;
    p.knock(a, 5);
    p.stun = Math.max(p.stun, 0.6);
    p.blocking = false;
    p.composure -= 22;
    p.composureT = g.time;
    p.setAnim('hurt', 0.8, true);
    g.damage(dk, p, 8, { type: 'duel' });
    if (Math.random() < 0.4) this.line('obiwan', 'push');
  }

  /** The fight's beats by his health: he quickens, then a saber lock; the end is his fall (duel.js update). */
  phases(k) {
    if (this.game.cinema || this.cine || this.lock) return;
    if (this.phase === 1 && k <= 0.6) {
      this.phase = 2;
      this.foe.set('circle', 1.2);
      this.game.fx.text(this.foe.x, this.foe.y, '오비완이 자세를 바꾼다', '#bfe0ff', 1.0, 2.2);
    } else if (this.phase === 2 && k <= 0.25) {
      this.phase = 3;
      this.startLock(true);
    }
  }
}
