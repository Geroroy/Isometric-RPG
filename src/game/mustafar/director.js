// The Mustafar rebuild's duel director (docs/MUSTAFAR_REBUILD.md). It extends the Movie Duel rules (duel.js: Anakin's
// kit, composure, the guard, saber locks, cutscenes, the result screen) and borrows the old Mustafar duel's film
// staging (duelMustafar.js: the opening's choke and dialogue on the film's audio, the poses, ignition, Obi-Wan's
// Force push, the set marks on his health, the travel-and-clash scenes) rather than duplicating them. Only what
// depends on the place is its own: who stands where on the zone (world/mustafarStage.js), and how the fight moves on.
//
// STAGE 01 — the landing platform:
//   arrival     Padmé at the foot of her ship's ramp; Anakin comes out of the facility to her; their words; Obi-Wan
//               appears on the ramp ("You brought him here to kill me!")
//   choke       the old duel's opening on the film's audio: the Force grip, Padmé collapses, the confrontation, robes
//               off, both ignite (MustafarDuel.intro)
//   the pad     the playable duel against the existing Obi-Wan AI, his health held at the pad's mark
//   corridor    at the mark (or the film's 0:34) the two fight their way into the facility corridor; the fight goes on
//               inside it; at its far door (or the corridor's mark, or its time) the stage ends — STAGE 02 (the
//               Separatist conference room) is the next zone, not built yet
import { Duel, Extra } from '../duel.js';
import { MustafarDuel, ObiWan } from '../duelMustafar.js';
import { Cinema } from '../cinema.js';

/** The film's places, in order (each its zone file, public/maps/mustafar_v2/<zone>.json). */
export const STAGES = [{ id: 'stage01', zone: 'stage01', title: '무스타파 · 착륙장' }];

// the old duel's staging, borrowed as it is (it reads only this director's units and state)
const FILM = MustafarDuel.prototype;
const BORROW = ['intro', 'pose', 'hoodDown', 'ignite', 'travel', 'clash', 'lightning', 'filterHit', 'reachMark', 'card'];

const LINES = {
  parry: [['obiwan', '그만둬, 아나킨!'], ['obiwan', '아직 늦지 않았다.'], ['obiwan', '분노로는 날 이길 수 없다.']],
  broken: [['obiwan', '크윽…!'], ['obiwan', '아나킨…!']],
  push: [['obiwan', '물러서라!']],
};
const SPEAKERS = { anakin: '아나킨', obiwan: '오비완', padme: '파드메' };
const say = (t, who, text, d) => ({ t, say: [SPEAKERS[who], text, d] });

// STAGE 01's marks on Obi-Wan's health (the pad, then the corridor), and when the film moves on regardless (s)
const PAD = { floor: 0.9, filmT: 34 };
const CORRIDOR = { floor: 0.84, time: 30 };

export class MustafarDirector extends Duel {
  constructor(game) {
    super(game); // (equips Anakin, then setup())
    this.lines = LINES;
    this.speakers = SPEAKERS;
    this.stage = STAGES[0];
    this.part = 'arrival'; // arrival -> choke -> pad -> corridor -> done
    this.setI = 0;
    this.floor = 1;
    this.pressed = [];
    this.partT = 0; // seconds of play in the current part
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파의 결투',
      name: '오비완 케노비',
      sub: '제다이 마스터 · 소레수',
      marks: [PAD.floor, CORRIDOR.floor],
      win: 'STAGE 01 착륙장 완료 — 아나킨은 오비완을 쫓아 시설 안으로 들어섰다. 다음 장소: 분리주의 회의실 (STAGE 02, 개발 중).',
      lose: '아나킨은 착륙장에서 쓰러졌다. 오비완은 쓰러진 파드메를 안아 우주선으로 걸어간다.',
    };
  }

  /** Who stands where (the zone's places for the scene; positions keep clear of the ship's hull). */
  setup() {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    const Z = w.zone;
    // the scene's places: the zone's `actors` (tools/maps/mustafar_v2/stage01.py)
    const pt = (k) => ({ x: Z.actors[k].x, y: Z.actors[k].y });
    this.at = { anakin0: pt('anakin'), anakin: pt('anakinMeet'), padme: pt('padme'), obiwanRamp: pt('obiwanRamp'), obiwan: pt('obiwan'), door: pt('door') };
    p.sprite = 'anakin_vader'; // the film's arrival: the cloak, hood raised (the old duel's progression)
    p.saberLit = false;
    p.x = this.at.anakin0.x;
    p.y = this.at.anakin0.y;
    const ob = (this.foe = new ObiWan(g, this.at.obiwanRamp.x, this.at.obiwanRamp.y));
    ob.sprite = 'obiwan3Robe';
    ob.hidden = true;
    ob.saberLit = false;
    const pd = (this.padme = new Extra(g, 'padme', this.at.padme.x, this.at.padme.y));
    pd.hidden = true;
    p.faceTo(pd.x, pd.y);
    pd.faceTo(p.x, p.y);
    ob.faceTo(p.x, p.y);
    g.units.push(ob, pd);
  }

  // --- music: silence under the arrival (the lava's ambience), the film's tracks from the choke -----------------
  music() {
    const g = this.game;
    if (g.cinema && g.cinema.track) return g.cinema.track;
    if (this.over) return 'silence';
    if (['pad', 'toCorridor', 'corridor', 'done'].includes(this.part)) return 'mustafarA'; // (Anakin vs. Obi-Wan, from the duel's start)
    return this.started ? 'silence' : 'title';
  }

  start() {
    this.started = true;
    this.arrival()
      .then(() => ((this.part = 'choke'), this.intro()))
      .then(() => this.beginPad());
  }

  // --- 1–3: the arrival ------------------------------------------------------------------------------------------
  arrival() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const pd = this.padme;
    const A = this.at;
    this.hold();
    p.setAnim('idle');
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const cues = [
      { t: 0, fade: 1, fadeDur: 0, cam: { x: A.padme.x + 1, y: A.padme.y - 1.5, zoom: 1.35, dur: 0 } },
      { t: 0.05, fade: 0, fadeDur: 1.8 },
      // her ship has landed: she is at the foot of its ramp
      { t: 0.6, do: () => ((pd.hidden = false), pd.setAnim('idle'), g.fx.dust(pd.x, pd.y, 4)) },
      say(1.4, 'padme', '아나킨!', 1.2),
      // he comes out of the facility to her
      { t: 2.0, do: (c) => (p.faceTo(A.anakin.x, A.anakin.y), p.setAnim('walk'), c.move(p, A.anakin.x, A.anakin.y, 4.2)), cam: { ...mid(A.anakin0, A.padme), zoom: 1.25, dur: 2.0 } },
      { t: 6.2, do: () => (p.setAnim('idle'), p.faceTo(pd.x, pd.y), pd.faceTo(p.x, p.y)), cam: { ...mid(A.anakin, A.padme), zoom: 1.6, dur: 1.2 } },
      { t: 6.6, do: () => pd.setAnim('talk') },
      say(6.6, 'padme', '당신 우주선을 보고 왔어요… 오비완이 무서운 이야기를 했어요.', 3.2),
      say(10.0, 'anakin', '오비완이 뭐라고 했든, 이제 당신을 지킬 수 있소.', 2.8),
      say(13.0, 'padme', '아나킨, 그건 내가 따라갈 수 없는 길이에요.', 2.8),
      say(16.0, 'anakin', '우린 함께 은하를 다스릴 수 있어. 원하는 대로 만들 수 있다고!', 3.2),
      say(19.4, 'padme', '당신은 변했어요… 오비완 말이 맞았어요.', 2.8),
      // Obi-Wan in the ship's door, on the ramp
      { t: 22.4, do: () => ((ob.hidden = false), ob.setAnim('idle', 1, true), ob.faceTo(p.x, p.y), pd.setAnim('idle')), cam: { x: A.obiwanRamp.x, y: A.obiwanRamp.y, zoom: 1.7, dur: 0 } },
      { t: 23.4, do: (c) => (ob.setAnim('walk'), c.move(ob, A.obiwan.x, A.obiwan.y, 1.4)) },
      { t: 23.6, do: () => p.faceTo(ob.x, ob.y), cam: { ...mid(A.anakin, A.obiwan), zoom: 1.45, dur: 1.2 } },
      say(23.8, 'anakin', '거짓말쟁이!', 1.4),
      { t: 24.8, do: () => (ob.setAnim('idle'), ob.faceTo(p.x, p.y), p.faceTo(pd.x, pd.y)) },
      say(25.4, 'anakin', '그와 한편이군. 날 죽이라고 그를 데려왔어!', 2.6),
      say(28.2, 'padme', '아니에요…!', 1.2),
      { t: 29.2, fade: 1, fadeDur: 0.5 }, // (a cut: the choke opens on the film's audio)
    ];
    return new Cinema(g, { length: 29.8, cues }).play();
  }

  /** Robes off before the duel (the old map's discarded robes were set props; here they just come off). */
  throwRobe(u) {
    const g = this.game;
    u.sprite = u === g.player ? 'anakin_tunic' : 'obiwan3';
    u.setAnim('idle', 1, true);
    u.saberLit = false;
    g.fx.dust(u.x - Math.cos(u.facing) * 0.7, u.y - Math.sin(u.facing) * 0.7, 5);
  }

  // --- 5: the playable duel on the pad -------------------------------------------------------------------------
  beginPad() {
    const g = this.game;
    this.unstick(g.player);
    this.unstick(this.foe);
    this.padme.setAnim('down'); // (where she fell)
    this.part = 'pad';
    this.partT = 0;
    this.setI = 0;
    this.floor = PAD.floor;
    this.advanceAt = 0;
    this.card('착륙장');
    this.fight();
  }

  /** A unit the staging left on a blocked tile (the ship's hull, the railings) stepped onto the nearest free one. */
  unstick(u) {
    const g = this.game;
    if (!g.world.isBlocked(u.x, u.y)) return;
    const f = g.pathfinder.nearestFree(Math.floor(u.x), Math.floor(u.y), 6);
    if (f) (u.x = f[0] + 0.5), (u.y = f[1] + 0.5);
  }

  // --- 6: into the facility corridor, toward STAGE 02 ------------------------------------------------------------
  toCorridor() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.part = 'toCorridor';
    this.hold();
    ob.set('circle', 99);
    const y = 98;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: 80.5, y: y + 0.6 }, { x: 78, y }, 2.4), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.2, do: (c) => this.clash(c) },
      { t: 2.4, do: (c) => (this.clash(c, p), this.travel(c, { x: 75.5, y }, { x: 72.5, y: y - 0.3 }, 1.8)) },
      { t: 3.6, do: (c) => this.clash(c) },
      { t: 4.2, do: (c) => (this.travel(c, { x: 72.5, y: y + 0.3 }, { x: 69.5, y }, 1.4), this.card('입구 복도')) },
      { t: 5.6, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    return new Cinema(g, { length: 6.0, cues }).play().then(() => {
      // the corridor's mark: the fight goes on inside it
      if (ob.hp > PAD.floor * ob.maxHp) ob.hp = PAD.floor * ob.maxHp; // (the film moved on: he is where the pad left him)
      this.part = 'corridor';
      this.partT = 0;
      this.setI = 1;
      this.floor = CORRIDOR.floor;
      this.advanceAt = 0;
      this.unstick(p);
      this.unstick(ob);
      this.fight();
    });
  }

  /** The far door: the two reach it, the fight moves on into the facility — STAGE 01 is done. */
  toDoor() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const D = this.at.door;
    this.part = 'done';
    this.hold();
    ob.set('circle', 99);
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: D.x + 2.6, y: D.y + 0.4 }, { x: D.x, y: D.y }, 1.6), cam: { x: D.x + 1.5, y: D.y, zoom: 1.4, dur: 1.0 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 1.8, do: (c) => (this.clash(c, p), p.setAnim('idle'), ob.setAnim('idle')) },
      { t: 2.2, fade: 1, fadeDur: 1.2 },
      { t: 2.6, do: () => g.emit('place', '무스타파 · 분리주의 회의실 — STAGE 02 (개발 중)') },
    ];
    return new Cinema(g, { length: 3.6, cues })
      .play()
      .then(() => {
        g.emit('fade', 0, 0.8);
        this.finish(true);
      });
  }

  /** Per frame: the duel's upkeep (duel.js), then how the stage moves on. */
  update(dt) {
    super.update(dt);
    const g = this.game;
    if (this.over || g.cinema || this.lock || !this.started) return;
    if (this.part !== 'pad' && this.part !== 'corridor') return;
    this.partT += dt;
    const pressed = this.advanceAt && g.time >= this.advanceAt;
    if (this.part === 'pad' && (pressed || this.partT >= PAD.filmT)) this.toCorridor();
    else if (this.part === 'corridor' && (pressed || this.partT >= CORRIDOR.time || g.player.x < this.at.door.x + 0.5)) this.toDoor();
  }

  /** (The duel's phases by health are this stage's marks: the progression above.) */
  phases() {}
}
for (const k of BORROW) MustafarDirector.prototype[k] = FILM[k];
