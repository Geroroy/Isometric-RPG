// Movie Duel #2 — Anakin vs Obi-Wan, Mustafar (Episode III), rebuilt to
// follow the film's duel set by set. The fight is one continuous walk
// through the mining facility (worldgen.js MUSTAFAR); Obi-Wan's health
// decides when the film moves on, and each move is a short scene staged the
// way the film stages it:
//
//   opening    the landing platform (on the film's audio): Padmé, the
//              choke, "You will try."; robes off, both ignite, the backflip
//   100–88%    the landing platform
//   88%        they fight down the hallway into the facility, cutting pipes
//   88–76%     the conference room, among the Separatist leaders
//   76%        up on the council table and off it; in the control room their
//              Force pushes meet and throw them apart; a blade opens the
//              shield controls — the alarm, lava sprays in through the window
//   76–62%     the control room (lava sprays: watch the glow)
//   62%        out onto the balcony: "I have failed you, Anakin." … "From my
//              point of view the Jedi are evil!" … "This is the end for you,
//              my master."
//   62–50%     the balcony catwalk
//   50%        over the rail onto the collector arm
//   50–38%     the collector arm (the lava falls pour down on it)
//   38%        the blades lock; the arm gives way, Obi-Wan swings clear on a
//              cable, the tower falls into the river
//   38–12%     the lava river: Obi-Wan on the collector platform, Anakin on a
//              mining droid's hover platform, both drifting downstream
//   ending     Obi-Wan leaps onto the bank: the high ground. The film's
//              ending plays out on its audio.
import { Dooku, Duel, Extra } from './duel.js';
import { Unit } from './units.js';
import { Cinema } from './cinema.js';
import { MUSTAFAR } from '../world/worldgen.js';
import { dist, rand } from '../core/math.js';

const M = MUSTAFAR;
const { deck, hallway, hall, control, balcony, arm, river, bank } = M;

/** The film's beats, reached at these fractions of Obi-Wan's health. */
const BEATS = [
  { at: 0.88, run: 'toHall', phase: 1 },
  { at: 0.76, run: 'toControl', phase: 2 },
  { at: 0.62, run: 'toBalcony', phase: 2 },
  { at: 0.5, run: 'toArm', phase: 2 },
  { at: 0.38, run: 'toRiver', phase: 3 },
];
const END_AT = 0.12;
const DRIFT = 0.45; // tiles per second down the river

// ----------------------------------------------------------------------------

class ObiWan extends Dooku {
  constructor(game, x, y) {
    super(game, x, y, 'obiwan3');
    this.name = '오비완 케노비';
    this.maxHp = this.hp = 950;
    this.saberColor = [60, 130, 255];
    this.saberCore = 'rgba(230,242,255,0.95)';
    this.blockChance = [0, 0.7, 0.62, 0.55]; // Soresu: hard to get through
  }

  /** Instead of Dooku's lightning: a Force push to break Anakin's rhythm. */
  startLightning() {
    this.set('cast', 0.9);
    this.pushed = false;
    this.setAnim('cast', 1, true);
  }
}

/** A deck drifting on the lava river (the panning droid, the repulsor platform). */
class Float extends Unit {
  constructor(game, kind, x, y, r) {
    super(game, kind, x, y);
    this.r = r; // walkable radius
    this.untargetable = true;
    this.scripted = true;
    this.noCollide = true; // a deck, not a body: nobody is shoved off it
    this.depthBias = -2.4; // drawn under whoever stands on it
    this.shadowR = kind === 'collector' ? 34 : 26;
    this.hidden = true;
    this.saberColor = null;
  }

  update(dt) {
    this.baseUpdate(dt);
  }
}

// ----------------------------------------------------------------------------

const LINES = {
  parry: [['obiwan', '그만둬, 아나킨!'], ['obiwan', '아직 늦지 않았다.'], ['obiwan', '분노로는 날 이길 수 없다.']],
  broken: [['obiwan', '크윽…!'], ['obiwan', '아나킨…!']],
  push: [['obiwan', '물러서라!']],
};
const SPEAKERS = { anakin: '아나킨', obiwan: '오비완', padme: '파드메' };
const S = (who) => SPEAKERS[who];
const say = (t, who, text, d) => ({ t, say: [S(who), text, d] });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class MustafarDuel extends Duel {
  constructor(game) {
    super(game);
    this.lines = LINES;
    this.speakers = SPEAKERS;
    this.ch = 0; // beats passed
    this.hazards = [];
    this.hazard = null; // what the current set throws at Anakin: 'spray' | 'fall' | 'splash'
    this.hazardT = 3;
    this.drift = null; // the river platforms while they float
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파의 결투',
      name: '오비완 케노비',
      sub: '제다이 마스터 · 소레수',
      marks: [...BEATS.map((b) => b.at), END_AT],
      win: '오비완은 높은 곳에서 아나킨을 내려다보았다. 선택받은 자는 무스타파의 용암 강가에 쓰러졌고, 그 불길 속에서 다스 베이더가 태어난다.',
      lose: '아나킨은 끝내 스승의 수비를 뚫지 못했다. 오비완은 쓰러진 제자를 두고 파드메를 실은 우주선으로 걸어간다.',
    };
    this.beats = [
      { t: 34, run: () => this.sceneDoor() },
      { t: 62, run: () => this.sceneHall() },
      { t: 82, run: () => this.scenePush() },
      { t: 148, run: () => this.sceneConsole() },
      { t: 209, run: () => this.sceneBlast() },
      { t: 234, run: () => this.sceneCollapse() },
      { t: 311, run: () => this.sceneFailed() },
      { t: 340, run: () => !this.lock && this.startLock(true) },
      { t: 351, run: () => this.sceneEnd() },
      { t: FIGHT_LENGTH, run: () => this.ending() },
    ];
  }

  setup() {
    const g = this.game;
    const p = g.player;
    const D = M.deck;
    p.sprite = 'anakinHood';
    p.saberLit = false;
    p.x = D.x - 1.5;
    p.y = D.y - 0.8;
    const ob = (this.foe = new ObiWan(g, D.x + 2.6, D.y - 5.2));
    ob.sprite = 'obiwan3Robe';
    const pd = (this.padme = new Extra(g, 'padme', D.x + 0.4, D.y - 4.2));
    p.faceTo(pd.x, pd.y);
    pd.faceTo(p.x, p.y);
    ob.faceTo(p.x, p.y);
    // the river's decks, hidden until the arm falls
    this.droid = new Float(g, 'collector', M.river.x - 2, M.river.y, 1.15);
    this.platform = new Float(g, 'platform', M.river.x + 1, M.river.y + 1.4, 0.9);
    g.units.push(ob, pd, this.droid, this.platform);
  }

  /** Music: the cutscene's own sound track, else the fight's. */
  music() {
    if (this.game.cinema && this.game.cinema.track) return this.game.cinema.track;
    if (this.over) return 'silence';
    return this.started ? 'mustafar' : 'title';
  }

  start() {
    this.started = true;
    this.intro().then(() => {
      this.enterSet(0);
      this.fight();
    });
  }

  /** Where the film is: the fight audio's clock, or our own when it isn't playing. */
  clock(dt) {
    const m = this.game.music;
    if (m && m.cur && m.cur.situation === 'mustafar' && m.cur.url) {
      const el = m.track(m.cur.url).el;
      if (!el.paused && el.currentTime > 0.05) {
        this.filmT = Math.max(this.filmT, el.currentTime);
        return;
      }
    }
    this.filmT += dt;
  }

  /** Put both duellists somewhere, facing each other. */
  place(px, py, ox, oy) {
    const p = this.game.player;
    const ob = this.foe;
    p.x = px;
    p.y = py;
    ob.x = ox;
    ob.y = oy;
    p.z = ob.z = 0;
    p.airborne = ob.airborne = false;
    p.kx = p.ky = ob.kx = ob.ky = 0;
    p.faceTo(ob.x, ob.y);
    ob.faceTo(p.x, p.y);
    p.setAnim('idle');
    ob.setAnim('idle');
  }

  /** A trade of blows for a scene: alternating swings, clashes and sparks. */
  exchange(c, t0, n, gap = 0.42) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const cues = [];
    for (let i = 0; i < n; i++) {
      const t = t0 + i * gap;
      const a = i % 2 ? p : ob;
      cues.push({
        t,
        do: () => {
          a.setAnim('attack' + (1 + (i % 3)), 1.15, true);
          (a === p ? ob : p).setAnim('parry', 1, true);
          g.clash((p.x + ob.x) / 2, (p.y + ob.y) / 2, 1.2, 10);
          g.audio.play('clash', ob);
        },
      });
    }
    return cues;
  }

  // --- the opening (on the film's audio: 0:00 – 1:11) ---------------------

  intro() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const pd = this.padme;
    this.hold();
    p.setAnim('idle');
    ob.setAnim('idle');
    pd.setAnim('talk');
    const anim = (u, name) => () => u.setAnim(name, 1, true);
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      { t: 0.05, fade: 0, fadeDur: 2.5, cam: { ...mid(p, pd), zoom: 1.6 } },
      { t: 3.6, do: anim(p, 'choke') },
      { t: 3.9, do: () => pd.setAnim('choked') },
      say(4.6, 'padme', '아나킨…!', 1.6),
      { t: 6.2, cam: { ...mid(p, ob), dur: 1.4 } },
      say(6.8, 'obiwan', '그녀를 놔줘, 아나킨.', 1.6),
      say(8.5, 'obiwan', '놔주라고!', 1.2),
      { t: 10.2, do: () => (p.setAnim('idle'), pd.setAnim('collapse', 1, true)) },
      { t: 11.4, do: anim(p, 'hoodOff'), cam: { x: p.x + 0.4, y: p.y - 0.6, dur: 1.2 } },
      { t: 12.6, do: () => p.setAnim('idleBare') },
      { t: 13.2, do: () => pd.setAnim('down') },
      say(14.0, 'anakin', '당신이 그녀를 내게서 돌아서게 만들었어!', 1.9),
      { t: 14.0, do: () => (p.faceTo(ob.x, ob.y), p.setAnim('talkBare')) },
      say(16.0, 'obiwan', '그건 네가 스스로 한 짓이다.', 1.6),
      { t: 16.0, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')) },
      say(17.8, 'anakin', '그녀를 데려가게 두진 않아!', 1.8),
      { t: 17.8, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')) },
      { t: 19.8, do: () => p.setAnim('idleBare'), cam: { ...mid(p, ob), dur: 2.5 } },
      say(20.8, 'obiwan', '네 분노와 권력욕이 이미 그렇게 만들었다.', 3.6),
      { t: 20.8, do: () => ob.setAnim('talk') },
      say(25.2, 'obiwan', '넌 그 암흑 군주에게 마음을 내주었고… 네가 무찌르겠다고 맹세했던 바로 그 존재가 되어 버렸어.', 7.6),
      say(33.4, 'anakin', '설교하지 마요, 오비완. 제다이의 거짓말은 다 꿰뚫어 봤어.', 3.4),
      { t: 33.4, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')), cam: { x: p.x + 0.5, y: p.y - 0.8, dur: 1.0 } },
      say(36.6, 'anakin', '난 당신처럼 어둠의 힘을 두려워하지 않아.', 2.4),
      say(39.2, 'anakin', '난 나의 새 제국에 평화와 자유, 정의, 그리고 안전을 가져다줬어!', 4.6),
      say(44.0, 'obiwan', '네 새 제국?', 1.8),
      { t: 44.0, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')), cam: { ...mid(p, ob), dur: 0 } },
      say(46.3, 'anakin', '날, 당신을 죽이게 만들지 마요.', 2.0),
      { t: 46.3, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')) },
      say(48.8, 'obiwan', '아나킨, 내 충성은 공화국에… 민주주의에 있다!', 4.2),
      { t: 48.8, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')) },
      say(53.0, 'anakin', '나와 함께하지 않는다면, 당신은 내 적이야.', 2.9),
      { t: 53.0, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')), cam: { x: p.x + 0.3, y: p.y - 0.5, dur: 1.2 } },
      say(56.3, 'obiwan', '극단을 따지는 건 시스뿐이다.', 2.2),
      { t: 56.3, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')), cam: { x: ob.x - 0.3, y: ob.y + 0.5, dur: 1.2 } },
      say(58.7, 'obiwan', '난 해야 할 일을 하겠다.', 1.6),
      say(60.4, 'anakin', '어디 해 보시죠.', 1.8),
      { t: 60.4, do: () => ob.setAnim('idle'), cam: { x: p.x, y: p.y, dur: 0.6 } },
      // robes off — Obi-Wan first, then Anakin throws down his cloak
      { t: 62.6, do: () => this.throwRobe(ob, g.world.robe) },
      { t: 64.4, do: () => this.throwRobe(p, g.world.cloak), cam: { ...mid(p, ob), zoom: 1.0, dur: 1.2 } },
      // both ignite as the music rises; Anakin flips back into his guard
      { t: 68.6, do: () => this.ignite(ob) },
      { t: 69.2, do: () => this.ignite(p) },
      { t: 69.9, do: (c) => (p.setAnim('backflip', 1, true), c.move(p, p.x - 1.6, p.y + 1.2, 0.8)) },
      { t: 70.8, do: () => p.setAnim('idle'), cam: { x: p.x - 1.6, y: p.y + 1.2, dur: 0.6 } },
    ];
    return new Cinema(g, { track: 'mustafarIntro', length: 71.4, cues }).play();
  }

  throwRobe(u, pile) {
    const g = this.game;
    u.sprite = u === g.player ? 'anakinMustafar' : 'obiwan3';
    u.setAnim('idle', 1, true);
    u.saberLit = false;
    pile.x = u.x - Math.cos(u.facing) * 0.7;
    pile.y = u.y - Math.sin(u.facing) * 0.7;
    if (g.renderer) g.renderer.placeProp(pile);
    pile.hidden = false;
    g.fx.dust(pile.x, pile.y, 5);
  }

  ignite(u) {
    u.saberLit = true;
    u.saberIgnite = true;
    this.game.audio.play('ignite', u);
  }

  // --- the film's beats -------------------------------------------------------

  phases(k) {
    const g = this.game;
    if (g.cinema || this.cine || this.lock || this.over || this.afterLock) return;
    const next = BEATS[this.ch];
    if (next && k <= next.at) {
      this.ch++;
      this.phase = next.phase; // Obi-Wan presses harder as the film goes on
      this.hazard = null;
      this.hazards = [];
      this[next.run]();
    } else if (!next && k <= END_AT) {
      this.over = true;
      this.ending();
    }
  }

  /** Obi-Wan never drops below the next beat before the film reaches it. */
  filter(src, tgt, amount, opts) {
    const a = this.filterHit(src, tgt, amount, opts);
    if (tgt !== this.foe) return a;
    const floor = (this.ch < BEATS.length ? BEATS[this.ch].at - 0.004 : END_AT - 0.02) * this.foe.maxHp;
    return Math.min(a, Math.max(0, this.foe.hp - floor));
  }

  /** Run a scene, then back to the fight with the set's hazard. */
  scene(cues, length, hazard = null, track = null) {
    this.hold();
    this.foe.set('circle', 99);
    this.game.player.airborne = this.foe.airborne = true; // the scene sets their heights
    return new Cinema(this.game, { length, cues, track }).play().then(() => {
      for (const u of [this.game.player, this.foe]) {
        u.airborne = false;
        u.z = 0;
      }
      this.hazard = hazard;
      this.hazardT = 2.5;
      this.fight();
    });
  }

  /** 88%: down the hallway into the facility, into the conference room. */
  toHall() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const hx0 = hallway.x - hallway.hw + 0.8;
    const hx1 = hall.x - hall.hw + 2.2;
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.4 },
      { t: 0.45, do: () => this.place(hx0 - 1.3, hallway.y + 0.3, hx0 + 0.2, hallway.y - 0.3), cam: { follow: ob, x: hx0, y: hallway.y, zoom: 1.5 } },
      { t: 0.5, fade: 0, fadeDur: 0.5 },
      // Obi-Wan gives ground step by step down the hallway; Anakin drives on
      { t: 0.8, do: (c) => (c.move(ob, hx1, hallway.y - 0.3, 4.2), c.move(p, hx1 - 1.4, hallway.y + 0.3, 4.2)) },
      ...this.exchange(null, 0.9, 10, 0.4),
      // a wild cut opens the pipes along the wall
      ...[1.6, 2.7, 3.8].map((t, i) => ({ t, do: () => (g.fx.sparks(hallway.x - 4 + i * 4, hallway.y - hallway.hh, 1.6, '#ffd27a', 16, 4), g.fx.smoke(hallway.x - 4 + i * 4, hallway.y - hallway.hh + 0.3, 1.2, 3), g.audio.play('zap')) })),
      { t: 5.2, do: (c) => (c.move(ob, hall.x - 2, hall.y + 1.5, 1.0), c.move(p, hall.x - 4.6, hall.y + 2.2, 1.0)), cam: { x: hall.x - 3, y: hall.y + 1.5, dur: 1.0 } },
      { t: 5.6, do: () => g.emit('place', '무스타파 · 분리주의 회의실') },
      { t: 6.3, do: () => this.place(hall.x - 4.6, hall.y + 2.2, hall.x - 2, hall.y + 1.5) },
    ];
    return this.scene(cues, 6.6);
  }

  /** 76%: the council table, the Force pushes, the shield controls. */
  toControl() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const tx = hall.x;
    const ty = hall.y - 0.5;
    const sc = g.world.shieldConsole;
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.4 },
      { t: 0.45, do: () => this.place(tx - 3.5, ty + 1.8, tx + 1.5, ty + 1.6), cam: { x: tx - 0.5, y: ty, zoom: 1.5 } },
      { t: 0.5, fade: 0, fadeDur: 0.5 },
      // up onto the table, Obi-Wan first
      { t: 0.9, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, tx + 1.2, ty, 0.5)) },
      { t: 1.0, do: (c) => (c.onFrame = () => (ob.z = Math.min(0.85, ob.z + 0.06))) },
      { t: 1.4, do: (c) => (p.setAnim('leap', 1, true), c.move(p, tx - 1.2, ty, 0.5)) },
      { t: 1.5, do: (c) => (c.onFrame = () => ((ob.z = Math.min(0.85, ob.z + 0.06)), (p.z = Math.min(0.85, p.z + 0.06)))) },
      ...this.exchange(null, 2.1, 6, 0.38),
      // a kick throws Anakin off the table; Obi-Wan drops after him
      { t: 4.5, do: (c) => (ob.setAnim('attack1', 1, true), p.setAnim('hurt', 0.7, true), c.move(p, tx - 3.6, ty + 2.4, 0.45), (c.onFrame = (dt) => (p.z = Math.max(0, p.z - dt * 3)))) },
      { t: 5.2, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, tx - 1.2, ty + 2, 0.5), (c.onFrame = (dt) => ((p.z = Math.max(0, p.z - dt * 3)), (ob.z = Math.max(0, ob.z - dt * 2.5))))) },
      { t: 6.0, fade: 1, fadeDur: 0.4 },
      // the control room: both reach for the Force at once
      {
        t: 6.5,
        do: (c) => {
          c.onFrame = null;
          this.place(control.x - 2.6, control.y + 1.2, control.x + 1.8, control.y - 0.4);
          g.emit('place', '무스타파 · 제어실');
        },
        cam: { x: control.x, y: control.y, zoom: 1.4 },
      },
      { t: 6.6, fade: 0, fadeDur: 0.5 },
      ...this.exchange(null, 7.1, 4, 0.36),
      { t: 8.7, do: () => (p.setAnim('cast', 1, true), ob.setAnim('cast', 1, true)) },
      {
        t: 9.2,
        do: (c) => {
          g.fx.shockwave((p.x + ob.x) / 2, (p.y + ob.y) / 2, 2.2, '#bfe0ff', 0.6);
          g.fx.shake(10);
          g.audio.play('push', p);
          c.move(p, control.x - 4.2, control.y + 2.4, 0.4);
          c.move(ob, sc.x + 0.6, sc.y + 1.3, 0.4);
          p.setAnim('hurt', 0.6, true);
          ob.setAnim('hurt', 0.6, true);
        },
      },
      // Obi-Wan crashes into the shield controls: sparks, then the alarm
      { t: 9.6, do: () => (g.fx.sparks(sc.x, sc.y, 1, '#9fd8ff', 20, 4), g.audio.play('zap')) },
      { t: 10.2, do: () => (g.fx.explosion(sc.x, sc.y, 0.6), g.audio.play('explode', ob)) },
      {
        t: 10.6,
        do: (c) => {
          g.fx.text(control.x, control.y, '경고 · 집하기 보호막 해제', '#ff5040', 1.2, 2.6, 2.4);
          let k = 0;
          c.onFrame = (dt) => {
            k += dt;
            if ((k * 2) % 1 < dt * 2) g.fx.light(control.x, control.y, 2.5, [255, 40, 30], 260, 0.25); // the red alarm light
            if (Math.random() < 0.5) this.spray(control.x + control.hw - Math.random() * 1.5, control.y + rand(-control.hh, control.hh), true);
          };
        },
        cam: { x: control.x + 3, y: control.y, dur: 1.2 },
      },
      { t: 12.8, do: (c) => ((c.onFrame = null), p.setAnim('idle'), ob.setAnim('idle')) },
      { t: 12.9, do: () => this.place(control.x - 3, control.y + 1.5, control.x + 0.5, control.y - 1) },
    ];
    return this.scene(cues, 13.2, 'spray');
  }

  /** 62%: out onto the balcony — the words before the end. */
  toBalcony() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const bx = balcony.x;
    const by0 = balcony.y - balcony.hh + 1;
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.4 },
      { t: 0.45, do: () => this.place(bx - 0.3, by0, bx + 0.3, by0 + 2.2), cam: { x: bx, y: by0 + 1.5, zoom: 1.5 } },
      { t: 0.5, do: () => g.emit('place', '무스타파 · 발코니') },
      { t: 0.5, fade: 0, fadeDur: 0.5 },
      { t: 0.9, do: (c) => (c.move(ob, bx + 0.3, by0 + 4.4, 1.6), c.move(p, bx - 0.3, by0 + 2.6, 1.6)) },
      ...this.exchange(null, 0.9, 4, 0.4),
      { t: 2.7, do: () => (p.setAnim('idle'), ob.setAnim('idle')), cam: { x: bx, y: by0 + 3.5, dur: 0.8 } },
      say(3.0, 'obiwan', '내가 너를 저버렸구나, 아나킨… 내가 실패했어.', 3.0),
      { t: 3.0, do: () => ob.setAnim('cast', 0.4) },
      say(6.2, 'anakin', '제다이가 권력을 노린다는 걸 진작 알았어야 했어!', 3.0),
      { t: 6.2, do: () => (ob.setAnim('idle'), p.setAnim('cast', 0.4)) },
      say(9.4, 'obiwan', '아나킨, 팰퍼틴 의장은 악이야!', 2.4),
      { t: 9.4, do: () => (p.setAnim('idle'), ob.setAnim('cast', 0.4)) },
      say(12.0, 'anakin', '내가 보기엔 제다이가 악이야!', 2.4),
      { t: 12.0, do: () => (ob.setAnim('idle'), p.setAnim('cast', 0.4)), cam: () => ({ x: p.x + 0.2, y: p.y - 0.3, dur: 0.6 }) },
      say(14.6, 'obiwan', '그렇다면 넌 길을 잃은 거다!', 2.2),
      { t: 14.6, do: () => (p.setAnim('idle'), ob.setAnim('cast', 0.4)), cam: () => ({ x: ob.x, y: ob.y - 0.3, dur: 0.6 }) },
      say(17.0, 'anakin', '이걸로 끝이에요, 마스터.', 2.4),
      { t: 17.0, do: () => (ob.setAnim('idle'), p.setAnim('cast', 0.4)), cam: () => ({ ...mid(p, ob), dur: 0.8 }) },
      { t: 19.5, do: () => (p.setAnim('attack3', 1, true), ob.setAnim('parry', 1, true), g.audio.play('clash', ob), g.clash((p.x + ob.x) / 2, (p.y + ob.y) / 2, 1.3, 14)) },
    ];
    return this.scene(cues, 20.0);
  }

  /** 50%: over the rail onto the collector arm. */
  toArm() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const ax = arm.x - arm.hw + 2;
    const cues = [
      { t: 0, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, ax + 3.5, arm.y, 0.8)), cam: { x: ax + 1, y: arm.y - 1, dur: 0.8, zoom: 1.4 } },
      { t: 0.1, do: (c) => (c.onFrame = (dt) => (ob.z = c.t < 0.5 ? ob.z + dt * 3 : Math.max(0, ob.z - dt * 3))) },
      { t: 0.9, do: (c) => (p.setAnim('leap', 1, true), c.move(p, ax + 0.8, arm.y, 0.8), (c.onFrame = (dt) => ((ob.z = 0), (p.z = c.t < 1.3 ? p.z + dt * 3 : Math.max(0, p.z - dt * 3))))) },
      { t: 1.8, do: (c) => ((c.onFrame = null), this.place(ax + 0.8, arm.y, ax + 3.5, arm.y)) },
      { t: 1.9, do: () => g.emit('place', '무스타파 · 집하기 팔') },
      ...this.exchange(null, 2.0, 4, 0.4),
      // the falls hammer the arm
      ...[2.4, 3.1].map((t) => ({ t, do: () => this.fall(ax + rand(0, 6), arm.y + rand(-0.6, 0.6), true) })),
    ];
    return this.scene(cues, 3.8, 'fall');
  }

  /** 38%: the blades lock on the arm; it gives way under them. */
  toRiver() {
    this.hold();
    this.afterLock = () => this.collapse();
    this.fight();
    this.startLock(true);
  }

  collapse() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const w = g.world;
    const tw = w.armTower;
    const r0 = river.x0;
    const cues = [
      { t: 0, do: () => (g.fx.shake(12), g.audio.play('explode', p), g.fx.explosion(arm.x + arm.hw - 3, arm.y, 1)) },
      { t: 0.5, do: () => g.fx.explosion(p.x + 2, p.y, 0.8) },
      { t: 0.9, do: () => g.fx.explosion(p.x - 2, p.y, 0.8), cam: () => ({ x: p.x, y: p.y, dur: 0.6 }) },
      // the arm tilts and slides; they ride it down towards the falls
      { t: 1.0, do: (c) => (p.setAnim('hurt', 0.5, true), ob.setAnim('hurt', 0.5, true), (c.onFrame = (dt) => Math.random() < dt * 8 && g.fx.sparks(p.x + rand(-2, 2), p.y + rand(-1, 1), 0.3, '#ffb040', 4, 4))) },
      { t: 1.0, do: (c) => (c.move(p, p.x + 3, p.y + 1, 1.6), c.move(ob, ob.x + 3, ob.y + 1, 1.6)) },
      // Obi-Wan swings clear on a cable; the tower topples into the river
      { t: 2.0, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, ob.x + 4, ob.y + 4, 1.4)) },
      { t: 2.2, do: () => (g.fx.explosion(tw.x, tw.y, 1.2), g.fx.shake(14), g.audio.play('explode', ob)) },
      { t: 2.6, fade: 1, fadeDur: 0.6 },
      {
        t: 3.3,
        do: (c) => {
          c.onFrame = null;
          tw.hidden = true; // gone into the lava
          this.startRiver();
          // Obi-Wan on the collector platform, Anakin falling with the tower
          this.place(r0 + 0.8, river.y + M.droid.hh, r0 - 0.6, river.y - M.raft.hh - 0.3);
          p.z = 3;
          p.setAnim('leap', 1, true);
          ob.setAnim('idle');
          g.emit('place', '무스타파 · 용암 강');
        },
        cam: { x: r0 + 1.5, y: river.y, zoom: 1.3 },
      },
      { t: 3.4, fade: 0, fadeDur: 0.9 },
      { t: 3.4, do: (c) => (c.onFrame = (dt) => ((p.z = Math.max(0, p.z - dt * 4)), g.fx.sparks(p.x, p.y, p.z + 0.3, '#ff8030', 1, 2))) },
      // a mining droid sweeps under him: he lands on its platform
      { t: 4.3, do: (c) => ((c.onFrame = null), (p.z = 0), p.setAnim('idle'), g.fx.dust(p.x, p.y, 6), p.faceTo(ob.x, ob.y)) },
    ];
    return this.scene(cues, 5.0, 'splash');
  }

  // --- the river platforms ----------------------------------------------------

  /** Show the two platforms at the head of the river and start them drifting. */
  startRiver() {
    const w = this.game.world;
    for (const pr of [w.raft, w.droid, w.raftTower]) pr.hidden = false;
    this.drift = { x: river.x0, lights: [] };
    for (const dx of [-2, 2]) {
      const l = { x: 0, y: river.y, z: 0.4, r: 255, g: 120, b: 40, rad: 150, flicker: 0.15, dx };
      w.lights.push(l);
      this.drift.lights.push(l);
    }
    this.moveRiver(0);
  }

  /** Move the platforms (and whoever stands on them) to drift.x + dx. */
  moveRiver(dx) {
    const g = this.game;
    const w = g.world;
    const d = this.drift;
    d.x += dx;
    const x = d.x;
    const raft = { x, y: river.y - M.raft.hh, hw: M.raft.hw, hh: M.raft.hh };
    const droid = { x: x + 0.6, y: river.y + M.droid.hh, hw: M.droid.hw, hh: M.droid.hh };
    for (const [pr, r] of [[w.raft, raft], [w.droid, droid], [w.raftTower, { x: x - 2, y: raft.y - 1.4 }]]) {
      pr.x = r.x;
      pr.y = r.y;
      if (g.renderer) g.renderer.placeProp(pr);
    }
    for (const l of d.lights) l.x = x + l.dx;
    if (dx) for (const u of [g.player, this.foe]) if (Math.abs(u.y - river.y) < 4 && Math.abs(u.x - x) < 4) u.x += dx;
    w.setFloating([raft, droid]);
  }

  // --- the sets' dangers --------------------------------------------------------

  /** Lava spraying in through the control room's open window. */
  spray(x, y, quiet = false) {
    this.addHazard(x, y, quiet ? 0 : 0.85, 1.0, 11, '#ff8a30');
  }

  /** A gout from the lava falls landing on the arm. */
  fall(x, y, quiet = false) {
    this.addHazard(x, y, quiet ? 0 : 1.0, 1.2, 15, '#ffb040');
  }

  addHazard(x, y, warn, r, dmg, color) {
    this.hazards.push({ x, y, warn, r, dmg, color, t: 0 });
  }

  /** Telegraphed danger: a growing glow, then the blast. Only Anakin is hurt. */
  updateHazards(dt) {
    const g = this.game;
    const p = g.player;
    if (this.hazard && !this.cine && !this.lock) {
      this.hazardT -= dt;
      if (this.hazardT <= 0) {
        this.hazardT = rand(1.6, 2.8) * (this.phase === 3 ? 0.85 : 1);
        // near Anakin most of the time, so standing still is never safe
        const near = Math.random() < 0.7;
        if (this.hazard === 'spray') {
          const x = near ? p.x + rand(-1.5, 1.5) : control.x + rand(0, control.hw - 0.5);
          this.spray(Math.min(control.x + control.hw - 0.5, x), near ? p.y + rand(-1.2, 1.2) : control.y + rand(-control.hh, control.hh));
        } else if (this.hazard === 'fall') {
          this.fall(near ? p.x + rand(-1.5, 1.5) : arm.x + rand(-arm.hw, arm.hw), arm.y + rand(-0.5, 0.5));
        } else if (this.hazard === 'splash' && this.drift) {
          const edge = Math.random() < 0.5 ? -1 : 1;
          this.addHazard(near ? p.x + rand(-1.2, 1.2) : this.drift.x + edge * M.raft.hw, near ? p.y : river.y + edge * 2.2, 1.0, 1.1, 12, '#ff7a20');
        }
      }
    }
    for (const h of this.hazards) {
      h.t += dt;
      if (h.t < h.warn) {
        // the warning: a glow on the floor that grows until it bursts
        if (Math.random() < dt * 14) g.fx.sparks(h.x + rand(-h.r, h.r) * 0.6, h.y + rand(-h.r, h.r) * 0.3, 0.1, h.color, 1, 1.2);
        if ((h.t * 6) % 1 < dt * 6) g.fx.ring(h.x, h.y, h.r * (0.4 + (h.t / h.warn) * 0.6), h.color, 0.25);
        continue;
      }
      if (h.done) continue;
      h.done = true;
      g.fx.explosion(h.x, h.y, 0.5);
      g.fx.sparks(h.x, h.y, 0.6, h.color, 14, 5);
      if (!this.cine && !this.lock && !p.dead && dist(p.x, p.y, h.x, h.y) < h.r + 0.3) {
        g.damage(null, p, h.dmg, { type: 'duel', knock: { ang: Math.atan2(p.y - h.y, p.x - h.x), power: 2.5 } });
        p.stun = Math.max(p.stun, 0.3);
        p.setAnim('hurt', 0.8, true);
      }
    }
    this.hazards = this.hazards.filter((h) => !h.done);
  }

  update(dt) {
    super.update(dt);
    const g = this.game;
    if (this.drift && !this.over && !g.cinema && !this.lock) {
      const left = river.x1 - this.drift.x;
      if (left > 0) this.moveRiver(Math.min(left, DRIFT * dt));
    }
    if (this.afterLock && !this.lock && !this.over) {
      const next = this.afterLock;
      this.afterLock = null;
      next();
    }
    if (!this.over) this.updateHazards(dt);
  }

  /** Phase changes by the foe's remaining health `k` — here, by the clock. */
  phases() {
    const g = this.game;
    if (g.cinema || this.over) return;
    const b = this.beats[this.beatI];
    if (b && this.filmT >= b.t && !this.lock) {
      this.beatI++;
      b.run();
    }
    // the sets' marks follow the clock too (a skipped scene still arrives)
    for (let i = this.setI + 1; i < SETS.length; i++) if (this.filmT >= SETS[i].t) this.enterSet(i);
  }

  update(dt) {
    if (this.started && !this.over && !(this.game.cinema && this.game.cinema.track !== 'mustafar')) this.clock(dt);
    super.update(dt);
    if (this.over) return;
    if (this.rain && !this.game.cinema) this.updateRain(dt);
    if (this.onRiver) this.updateRiver(dt);
  }

  /** Damage to Obi-Wan stops at the set's mark; reaching it counts. */
  filterHit(src, tgt, amount, opts) {
    const g = this.game;
    const ob = this.foe;
    this.lock = null;
    this.hazard = null;
    this.hazards = [];
    g.emit('lock', false);
    this.hold();
    p.airborne = ob.airborne = true;
    const hg = { x: bank.x - 1.8, y: bank.y - 2.2 }; // the high ground
    const foot = { x: bank.x - 3.6, y: bank.y - 4.6 }; // where Anakin falls, at the edge of the bank
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.5 },
      {
        t: 0.6,
        do: () => {
          // the platforms reach the bend of the river by the bank
          if (this.drift) this.moveRiver(river.x1 - this.drift.x);
          this.place(river.x1 + 0.6, river.y + M.droid.hh, river.x1 - 0.4, river.y - M.raft.hh);
        },
        cam: { x: river.x1 + 1, y: river.y + 2, zoom: 1.3 },
      },
      { t: 0.7, fade: 0, fadeDur: 1.6 },
      // Obi-Wan leaps from the platform onto the bank
      { t: 3.2, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, hg.x, hg.y, 0.9)) },
      { t: 3.3, do: (c) => (c.onFrame = (dt) => (ob.z = c.t < 3.75 ? ob.z + dt * 4 : Math.max(0, ob.z - dt * 4))) },
      { t: 4.3, do: (c) => ((c.onFrame = null), (ob.z = 0), ob.setAnim('idle'), ob.faceTo(p.x, p.y), p.faceTo(ob.x, ob.y)), cam: () => ({ ...mid(p, hg), dur: 1.5 }) },
      say(8.7, 'obiwan', '끝났다, 아나킨. 내가 더 높은 곳에 있다.', 3.2),
      say(12.2, 'anakin', '내 힘을 얕보지 마!', 2.8),
      say(17.5, 'obiwan', '그러지 마라.', 2.2),
      // the leap and the cut
      { t: 21.6, do: (c) => (p.setAnim('leap', 1, true), c.move(p, foot.x, foot.y, 0.7)) },
      { t: 21.7, do: (c) => (c.onFrame = (dt) => (p.z = c.t < 22.0 ? p.z + dt * 5 : Math.max(0, p.z - dt * 6))) },
      { t: 22.1, do: () => ob.setAnim('attack2', 1.2, true) },
      {
        t: 22.4,
        do: (c) => {
          c.onFrame = (dt) => (p.z = Math.max(0, p.z - dt * 6));
          g.fx.sparks(p.x, p.y, 1.1, '#ffe0b0', 22, 4);
          g.fx.shake(10);
          g.audio.play('clash', p, { heavy: true });
          p.saberLit = false;
          p.setAnim('death', 0.6, true);
        },
      },
      { t: 22.6, fade: 0.85, fadeDur: 0.05 },
      { t: 22.8, fade: 0, fadeDur: 1.2, cam: { x: foot.x, y: foot.y - 0.4, zoom: 1.6, dur: 3 } },
      { t: 26, do: (c) => ((c.onFrame = null), (p.z = 0), ob.setAnim('idle')) },
      say(43.3, 'obiwan', '넌 선택받은 자였다!', 3.2),
      { t: 43.3, cam: { ...mid(foot, hg), dur: 2 } },
      say(47.5, 'obiwan', '시스를 멸할 거라 했지, 그들과 손잡는 게 아니라!', 4.0),
      say(53.0, 'obiwan', '포스에 균형을 가져와야 했다… 어둠 속에 버려두는 게 아니라!', 4.6),
      say(70.8, 'anakin', '당신이 미워!', 2.6),
      { t: 70.8, cam: { x: foot.x, y: foot.y - 0.3, dur: 0.4 } },
      say(76.0, 'obiwan', '넌 내 형제였다, 아나킨… 널 사랑했다.', 4.2),
      { t: 76.0, cam: { x: hg.x, y: hg.y, dur: 1.5 } },
      // the lava catches him; Obi-Wan takes his saber and walks away
      {
        t: 79.4,
        do: (c) => {
          c.onFrame = () => {
            if (Math.random() < 0.6) g.fx.sparks(p.x + rand(-0.3, 0.3), p.y + rand(-0.3, 0.3), 0.4 + Math.random() * 0.6, Math.random() < 0.5 ? '#ffb040' : '#ff5a20', 2, 1.6);
          };
          g.world.lights.push({ x: p.x, y: p.y, z: 0.5, r: 255, g: 120, b: 40, rad: 160, flicker: 0.3 });
        },
        cam: { x: foot.x, y: foot.y, dur: 2 },
      },
      { t: 81.4, do: (c) => (ob.setAnim('walk'), ob.faceTo(bank.x + 6, bank.y + 3), c.move(ob, bank.x + 6, bank.y + 3, 3)) },
      { t: 83.0, fade: 1, fadeDur: 1.4 },
    ];
    new Cinema(g, { track: 'mustafarEnd', length: 84.5, cues }).play().then(() => {
      this.over = false; // finish() sets it again and reports
      this.finish(true);
    });
  }

  /** Force push (Obi-Wan's "cast"): pushes Anakin back, can't be blocked. */
  lightning(dk) {
    if (dk.pushed || dk.stateT > 0.45) return;
    dk.pushed = true;
    const g = this.game;
    const p = g.player;
    const a = Math.atan2(p.y - dk.y, p.x - dk.x);
    g.fx.shockwave(dk.x + Math.cos(a) * 0.8, dk.y + Math.sin(a) * 0.8, 1.3, '#bfe0ff', 0.4);
    g.fx.ripple(dk.x, dk.y, 4.5, 0.4, 3.5, a, 0.7);
    g.audio.play('push', dk);
    if (Math.hypot(p.x - dk.x, p.y - dk.y) > 4.5) return;
    p.knock(a, this.onRiver ? 2 : 7);
    p.stun = Math.max(p.stun, 0.6);
    p.blocking = false;
    p.composure -= 22;
    p.composureT = g.time;
    if (p.composure <= 0) this.breakGuard(p);
    p.setAnim('hurt', 0.8, true);
    g.damage(dk, p, 8, { type: 'duel' });
    if (Math.random() < 0.4) this.line('obiwan', 'push');
  }

  /** A scene inside the fight: its clock is the fight's music from `at`. */
  scene(at, length, cues) {
    this.hold();
    this.foe.set('circle', 99);
    return new Cinema(this.game, { track: 'mustafar', at, length, cues }).play().then(() => this.fight());
  }

  /** Both duellists walk to new spots, trading blows on the way. */
  travel(c, pTo, obTo, dur) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    ob.faceTo(p.x, p.y);
    p.faceTo(ob.x, ob.y);
    ob.setAnim('walk', 1.1);
    p.setAnim('walk', 1.1);
    c.move(ob, obTo.x, obTo.y, dur);
    c.move(p, pTo.x, pTo.y, dur);
  }

  clash(c, who = this.foe) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const other = who === p ? ob : p;
    who.setAnim(Math.random() < 0.5 ? 'attack1' : 'attack2', 1, true);
    other.setAnim('parry', 1, true);
    g.fx.sparks((p.x + ob.x) / 2, (p.y + ob.y) / 2, 1.2, '#fff2c8', 10, 3);
    g.audio.play('clash', ob);
    p.clashFlash = ob.clashFlash = 0.15;
  }

  // 0:34 — down the walkway and through the facility door
  sceneDoor() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const y = M.walk.y;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: 108.5, y: y + 0.3 }, { x: 106, y: y - 0.3 }, 2.2), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 2.2, do: (c) => (this.clash(c, p), this.travel(c, { x: 102.5, y }, { x: 100.5, y }, 2.0)) },
      { t: 3.6, do: (c) => this.clash(c) },
      { t: 4.2, do: (c) => (this.travel(c, { x: 99.2, y }, { x: 96.8, y }, 1.4), g.emit('place', '무스타파 · 입구 복도')) },
      { t: 5.6, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(34, 5.8, cues).then(() => this.enterSet(1));
  }

  // 1:02 — into the conference room
  sceneHall() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const y = M.hall.y;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: 85.5, y }, { x: 83.5, y }, 1.4), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 1.5, do: (c) => (this.travel(c, { x: 81.5, y: y + 0.4 }, { x: 78.5, y: y - 1.2 }, 1.8), g.emit('place', '무스타파 · 분리주의 회의실')) },
      { t: 3.3, do: (c) => (this.clash(c, p), p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(62, 3.8, cues).then(() => this.enterSet(2));
  }

  // 1:22 — the junction corridor: both reach for the Force at once
  scenePush() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const J = M.junction;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: J.x, y: J.y + 7 }, { x: J.x, y: J.y + 4 }, 1.8), cam: { follow: p, zoom: 1.35, dur: 0.8 } },
      { t: 1.2, do: (c) => this.clash(c) },
      { t: 1.8, do: (c) => this.travel(c, { x: J.x, y: J.y + 2.4 }, { x: J.x, y: J.y - 0.6 }, 1.2) },
      { t: 3.1, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)), cam: { x: J.x, y: J.y + 1, dur: 0.6 } },
      { t: 3.4, do: () => (p.setAnim('cast', 1, true), ob.setAnim('cast', 1, true)) },
      {
        t: 3.85,
        do: (c) => {
          const mx = (p.x + ob.x) / 2;
          const my = (p.y + ob.y) / 2;
          g.fx.shockwave(mx, my, 2.2, '#bfe0ff', 0.6);
          g.fx.ring(mx, my, 1.2, '#e8f4ff', 0.5);
          g.fx.shake(10);
          g.audio.play('push', p);
          g.audio.play('push', ob);
          p.setAnim('hurt', 0.5, true);
          ob.setAnim('hurt', 0.5, true);
          c.move(p, J.x, J.y + 7.2, 0.55);
          c.move(ob, J.x, J.y - 5.6, 0.55);
        },
      },
      { t: 4.4, do: () => (g.fx.dust(p.x, p.y, 8), g.fx.dust(ob.x, ob.y, 8), g.audio.play('slam', p)) },
      { t: 4.5, do: () => (p.setAnim('death', 0.9, true), ob.setAnim('death', 0.9, true)) },
      { t: 6.6, do: () => (p.setAnim('idle', 1, true), ob.setAnim('idle', 1, true)) },
      { t: 7.4, do: (c) => (ob.setAnim('walk'), ob.faceTo(J.x, J.y - 9), c.move(ob, M.control.x + 2, M.control.y + 3.5, 2.6), g.emit('place', '무스타파 · 제어실')) },
      { t: 8.2, do: (c) => (p.setAnim('run'), p.faceTo(J.x, J.y - 9), c.move(p, J.x, M.control.y + 6, 2.2)), cam: { follow: p, dur: 0.5 } },
      { t: 10.4, do: () => (p.setAnim('idle'), ob.setAnim('idle'), ob.faceTo(p.x, p.y), p.faceTo(ob.x, ob.y)) },
    ];
    this.scene(82, 10.8, cues).then(() => this.enterSet(3));
  }

  // 2:28 — the control room: Anakin's cut opens the shield generator
  sceneConsole() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const core = { x: M.control.x - 3.5, y: M.control.y - 4 };
    const w = g.world;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: core.x + 0.8, y: core.y + 2.9 }, { x: core.x + 1.6, y: core.y + 1.6 }, 1.6), cam: { x: core.x + 1, y: core.y + 2, zoom: 1.35, dur: 0.8 } },
      { t: 1.2, do: (c) => this.clash(c) },
      { t: 1.9, do: () => (p.faceTo(core.x, core.y), p.setAnim('attack3', 1, true)) },
      { t: 2.1, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, core.x + 3.6, core.y + 3.4, 0.5)) },
      {
        t: 2.3,
        do: (c) => {
          g.fx.sparks(core.x + 0.4, core.y + 0.6, 1.4, '#9fd8ff', 26, 5);
          g.fx.explosion(core.x + 0.3, core.y + 0.5, 0.7);
          g.audio.play('zap');
          g.audio.play('explode', p);
          g.fx.shake(7);
          w.alarm.rad = 260; // the alarm light: the shields are failing
          c.onFrame = () => {
            if (Math.random() < 0.5) g.fx.sparks(core.x + rand(-0.6, 0.6), core.y + rand(-0.6, 0.6), 1.2 + Math.random(), Math.random() < 0.5 ? '#9fd8ff' : '#ffb040', 2, 3);
            if (Math.random() < 0.3) g.fx.flame(core.x + 0.3, core.y + 0.4, 1.2, 2, 1.2);
          };
        },
      },
      { t: 2.9, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: 3.4, do: (c) => this.clash(c) },
      // out through the east door onto the balcony
      { t: 4.2, do: (c) => this.travel(c, { x: M.door4.x - 2.2, y: M.door4.y }, { x: M.door4.x + 0.6, y: M.door4.y }, 2.2), cam: { follow: p, dur: 0.6 } },
      { t: 5.6, do: (c) => this.clash(c, p) },
      { t: 6.4, do: (c) => (this.travel(c, { x: M.door4.x + 1.6, y: M.door4.y }, { x: M.door4.x + 4.8, y: M.door4.y }, 2.0), g.emit('place', '무스타파 · 외부 발코니')) },
      { t: 8.4, do: (c) => (c.onFrame = null, p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(148, 8.8, cues).then(() => this.enterSet(4));
  }

  // 3:29 — the shields fail: the lava falls burst and lava rains onto the catwalk
  sceneBlast() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const B = M.balcony;
    const cues = [
      { t: 0, do: () => (p.setAnim('idle'), ob.setAnim('idle')), cam: { x: B.x + 2, y: B.y - 4, zoom: 1.1, dur: 1.0 } },
      {
        t: 0.8,
        do: (c) => {
          g.fx.explosion(95, 88, 2.2);
          g.fx.explosion(102, 89, 1.6);
          g.audio.play('explode', p);
          g.fx.shake(14);
          g.world.lights.push({ x: 97, y: 88, z: 2, r: 255, g: 150, b: 60, rad: 320, flicker: 0.25 });
          c.onFrame = () => {
            if (Math.random() < 0.8) g.fx.lavaSplash(B.x + rand(-B.hw, B.hw), B.y + rand(-2.5, 2.5), 0.6);
          };
        },
      },
      { t: 1.6, do: () => (p.setAnim('block', 1, true), ob.setAnim('block', 1, true), g.fx.text(B.x, B.y, '용암이 쏟아진다!', '#ff9a50', 1.2, 2.6)) },
      { t: 2.0, cam: { follow: p, zoom: 1.3, dur: 1.0 } },
      { t: 4.6, do: (c) => (c.onFrame = null, this.clash(c)) },
      { t: 5.8, do: () => (p.setAnim('idle'), ob.setAnim('idle'), (this.rain = true)) },
    ];
    this.scene(209, 6.2, cues);
  }

  /** Lava raining on the balcony: a glow, then a splash that burns whoever stands in it. */
  updateRain(dt) {
    const g = this.game;
    const B = M.balcony;
    this.rainT = (this.rainT || 0) - dt;
    if (this.rainT <= 0) {
      this.rainT = rand(0.35, 0.7);
      const d = { x: B.x + rand(-B.hw, B.hw + 2), y: B.y + rand(-0.8, 0.8), t: 0 };
      this.drops.push(d);
      g.fx.ring(d.x, d.y, 0.55, '#ff8a30', 0.65);
    }
    if (Math.random() < 0.5) g.fx.sparks(B.x + rand(-B.hw - 2, B.hw + 3), B.y + rand(-3, 3), 2.4 + Math.random() * 1.5, '#ff7a30', 1, 1.5);
    for (const d of this.drops) {
      d.t += dt;
      if (d.t < 0.65) continue;
      d.done = true;
      g.fx.lavaSplash(d.x, d.y, 1);
      g.audio.play('explode', { x: d.x, y: d.y }, { volume: 0.3 });
      for (const u of [g.player, this.foe]) {
        if (u.dead || dist(u.x, u.y, d.x, d.y) > 0.8) continue;
        if (u === g.player) {
          g.damage(null, u, 9, { type: 'lava' });
          u.stun = Math.max(u.stun, 0.3);
          u.setAnim('hurt', 0.8, true);
          g.fx.text(u.x, u.y, '용암!', '#ff8a50', 0.9);
        } else g.damage(null, u, 9, { type: 'lava' });
      }
    }
    this.drops = this.drops.filter((d) => !d.done);
  }

  // 3:54 — the catwalk gives way; hanging from the arm's cables; the arm
  sceneCollapse() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = M.arm;
    const cy = A.y - 0.95;
    const cab = { p: 44, ob: 36 };
    const cues = [
      { t: 0, do: () => (g.fx.shake(10), g.audio.play('explode', p), p.setAnim('hurt', 0.6, true), ob.setAnim('hurt', 0.6, true)), cam: { follow: p, zoom: 1.2, dur: 0.4 } },
      { t: 0.6, do: (c) => (c.onFrame = () => (g.fx.shake(4), Math.random() < 0.6 && g.fx.sparks(p.x + rand(-3, 3), p.y + rand(-2, 2), 0.3, '#ffb040', 3, 4)), g.fx.text(p.x, p.y, '발코니가 무너진다!', '#ff9a50', 1.2, 2.6)) },
      { t: 1.2, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
      { t: 2.4, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, ob.x - 2, ob.y, 0.6)) },
      { t: 3.0, do: (c) => (p.setAnim('leap', 1, true), c.move(p, p.x - 2, p.y, 0.6)) },
      { t: 3.6, fade: 1, fadeDur: 0.7 },
      // hanging from the collector arm's cables over the lava
      {
        t: 4.6,
        do: (c) => {
          c.onFrame = null;
          this.rain = false;
          this.drops = [];
          p.x = cab.p;
          p.y = cy + 0.25;
          ob.x = cab.ob;
          ob.y = cy + 0.25;
          p.z = ob.z = 1.35;
          p.airborne = ob.airborne = true;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          p.setAnim('hang', 1, true);
          ob.setAnim('hang', 1, true);
          p.kx = p.ky = ob.kx = ob.ky = 0;
          g.emit('place', '무스타파 · 집하기 팔');
          c.onFrame = () => {
            const k = c.t - 4.6;
            // the cables swing them towards each other and apart
            p.x = cab.p - 1.2 * Math.max(0, Math.sin(k * 1.4)) - Math.min(1.6, k * 0.12);
            ob.x = cab.ob + 1.2 * Math.max(0, Math.sin(k * 1.4 + 0.3)) + Math.min(1.6, k * 0.12);
            p.z = 1.35 + Math.sin(k * 2.8) * 0.08;
            ob.z = 1.35 + Math.cos(k * 2.8) * 0.08;
          };
        },
        cam: { x: (cab.p + cab.ob) / 2, y: cy, zoom: 1.35 },
      },
      { t: 4.7, fade: 0, fadeDur: 1.0 },
      ...[6.8, 9.0, 11.3, 13.6].map((t) => ({ t, do: () => (g.fx.sparks((p.x + ob.x) / 2, cy, 1.9, '#fff2c8', 12, 3), g.audio.play('clash', ob), (p.clashFlash = ob.clashFlash = 0.15)) })),
      { t: 15.6, do: (c) => (c.onFrame = null) },
      // they drop onto the arm, Obi-Wan first
      { t: 16.0, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, ob.x - 1.2, A.y + 0.2, 0.6), (ob.z = 0), (ob.airborne = false)) },
      { t: 16.6, do: () => (ob.setAnim('idle', 1, true), g.fx.dust(ob.x, ob.y, 5)) },
      { t: 17.4, do: (c) => (p.setAnim('leap', 1, true), c.move(p, p.x + 1.2, A.y + 0.2, 0.6), (p.z = 0), (p.airborne = false)), cam: { follow: p, dur: 1.0 } },
      { t: 18.0, do: () => (p.setAnim('idle', 1, true), g.fx.dust(p.x, p.y, 5), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    this.scene(234, 18.4, cues).then(() => {
      p.z = ob.z = 0;
      this.enterSet(5);
    });
  }

  // 5:11 — "I have failed you, Anakin."
  sceneFailed() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const mid = () => ({ x: (p.x + ob.x) / 2, y: (p.y + ob.y) / 2 });
    const cues = [
      { t: 0, do: () => (p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y), p.setAnim('idle'), ob.setAnim('talk', 1, true)), cam: { ...mid(), zoom: 1.5, dur: 1.0 } },
      say(1.5, 'obiwan', '난 널 실망시켰다, 아나킨. 내가 널 실망시켰어.', 3.4),
      say(5.0, 'anakin', '제다이가 권력을 잡으려 음모를 꾸민다는 걸 진작 알았어야 했어!', 2.6),
      { t: 5.0, do: () => (ob.setAnim('idle'), p.setAnim('talk', 1, true)) },
      say(7.5, 'obiwan', '아나킨, 팰퍼틴 의장은 악이다!', 2.2),
      { t: 7.5, do: () => (p.setAnim('idle'), ob.setAnim('talk', 1, true)) },
      say(9.6, 'anakin', '내 관점에서는, 제다이가 악이야!', 2.4),
      { t: 9.6, do: () => (ob.setAnim('idle'), p.setAnim('talk', 1, true)) },
      say(12.1, 'obiwan', '그렇다면… 넌 길을 잃었구나!', 2.4),
      { t: 12.1, do: () => (p.setAnim('idle'), ob.setAnim('talk', 1, true)) },
      { t: 14.4, do: () => (ob.setAnim('idle'), p.setAnim('idle')) },
    ];
    this.scene(311, 14.8, cues).then(() => this.enterSet(6));
  }

  // 5:51 — "This is the end for you, my master." The tower falls, and the arm.
  sceneEnd() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = M.arm;
    const T = M.armTower;
    const w = g.world;
    this.lock = null;
    g.emit('lock', false);
    const cues = [
      { t: 0, do: () => (p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y), p.setAnim('talk', 1, true), ob.setAnim('idle')), cam: { follow: p, zoom: 1.4, dur: 0.8 } },
      say(0.8, 'anakin', '이걸로 끝이에요, 마스터.', 2.6),
      { t: 3.4, do: () => p.setAnim('sigF', 1, true) },
      { t: 3.8, do: (c) => this.clash(c, p) },
      { t: 4.8, do: (c) => this.clash(c) },
      { t: 5.6, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
      // the collector tower at the arm's end groans and goes
      { t: 6.6, do: (c) => (g.fx.shake(6), g.audio.play('explode', p), (c.onFrame = () => (g.fx.shake(3), Math.random() < 0.5 && g.fx.sparks(T.x + rand(-1.5, 1.5), T.y + rand(-1.5, 1.5), rand(0.5, 6), '#ffb040', 3, 4)))), cam: { x: T.x - 3, y: T.y, zoom: 1.1, dur: 1.2 } },
      { t: 8.8, do: () => (g.fx.explosion(T.x, T.y, 2.4), g.fx.explosion(T.x - 1, T.y + 1, 1.4), (w.tower.hidden = true), g.audio.play('explode', p), g.fx.text(T.x - 2, T.y, '집하기 탑이 무너진다!', '#ff9a50', 1.2, 2.6)) },
      { t: 9.4, do: (c) => (g.fx.shake(12), p.setAnim('hurt', 0.5, true), ob.setAnim('hurt', 0.5, true), c.move(p, Math.min(A.x + A.hw - 1, p.x + 3), A.y + 0.4, 2.2), c.move(ob, Math.min(A.x + A.hw - 2, ob.x + 3), A.y - 0.3, 2.2)), cam: { follow: p, dur: 1.0 } },
      { t: 11.6, do: () => (p.setAnim('leap', 1, true), ob.setAnim('leap', 1, true)) },
      { t: 12.2, fade: 1, fadeDur: 0.6 },
      // the arm comes down into the lava; the two decks
      {
        t: 13.4,
        do: (c) => {
          c.onFrame = null;
          this.river();
          this.onRiver = true;
          g.emit('place', '무스타파 · 용암 강');
        },
        cam: { x: M.river.x + 4, y: M.river.y + 1, zoom: 1.35 },
      },
      { t: 13.5, fade: 0, fadeDur: 1.0 },
      { t: 14.2, do: () => (ob.setAnim('leap', 1, true), p.setAnim('leap', 1, true)) },
      { t: 14.9, do: () => (ob.setAnim('idle', 1, true), p.setAnim('idle', 1, true), g.fx.dust(ob.x, ob.y, 4), g.fx.dust(p.x, p.y, 4)) },
      { t: 20.0, do: (c) => this.clash(c) },
      { t: 22.4, do: (c) => this.clash(c, p) },
      { t: 23.4, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(351, 23.8, cues).then(() => this.enterSet(7));
  }

  /** The lava river: Obi-Wan on the repulsor platform, Anakin on the panning droid. */
  river() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const w = g.world;
    const R = M.river;
    this.riverT = 0;
    this.platform.hidden = this.droid.hidden = false;
    this.platform.x = R.x + 1.5;
    this.platform.y = R.y + 1.4;
    this.droid.x = R.x - 1.4;
    this.droid.y = R.y;
    w.floats = [this.platform, this.droid];
    this.floatLights = [
      { x: this.platform.x, y: this.platform.y, z: 0.2, r: 120, g: 220, b: 255, rad: 90, flicker: 0.05 },
      { x: this.droid.x, y: this.droid.y, z: 0.2, r: 255, g: 150, b: 60, rad: 90, flicker: 0.1 },
    ];
    w.lights.push(...this.floatLights);
    ob.x = this.platform.x;
    ob.y = this.platform.y;
    p.x = this.droid.x;
    p.y = this.droid.y;
    p.kx = p.ky = ob.kx = ob.ky = 0;
    p.z = ob.z = 0;
    p.faceTo(ob.x, ob.y);
    ob.faceTo(p.x, p.y);
    g.updateActive();
  }

  /** The decks drift downstream, a little apart and together; their riders go with them. */
  updateRiver(dt) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const R = M.river;
    this.riverT += dt;
    const k = this.riverT;
    const px = this.platform.x;
    const py = this.platform.y;
    const dx0 = this.droid.x;
    const dy0 = this.droid.y;
    this.platform.x = Math.min(R.x + 7, R.x + 1.5 + k * 0.22);
    this.platform.y = R.y + 1.4 + Math.sin(k * 0.7) * 0.2;
    this.droid.x = this.platform.x - 2.7 - Math.max(0, Math.sin(k * 0.9)) * 0.5;
    this.droid.y = R.y + Math.cos(k * 0.8) * 0.3;
    const carry = (u, f, ox, oy) => {
      u.x += f.x - ox;
      u.y += f.y - oy;
      // nobody leaves his deck: the lava is right there
      const d = dist(u.x, u.y, f.x, f.y);
      if (d > f.r - 0.1) {
        const a = Math.atan2(u.y - f.y, u.x - f.x);
        u.x = f.x + Math.cos(a) * (f.r - 0.1);
        u.y = f.y + Math.sin(a) * (f.r - 0.1);
        u.kx = u.ky = 0;
      }
    };
    carry(p, this.droid, dx0, dy0);
    carry(ob, this.platform, px, py);
    if (this.floatLights) {
      this.floatLights[0].x = this.platform.x;
      this.floatLights[0].y = this.platform.y;
      this.floatLights[1].x = this.droid.x;
      this.floatLights[1].y = this.droid.y;
    }
  }

  // --- the ending (on the film's audio: 7:42 – 9:06) ------------------------

  ending() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.over = true;
    this.lock = null;
    g.emit('lock', false);
    this.hold();
    this.onRiver = false;
    const bank = { x: this.platform.x + 1.6, y: M.bank.y - 2.2 }; // where Obi-Wan lands: the slope above the river
    const foot = { x: bank.x - 2.0, y: bank.y - 1.1 }; // where Anakin falls, at the lava's edge below him
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      {
        t: 0.3,
        do: () => {
          p.setAnim('idle');
          ob.setAnim('idle');
          p.kx = p.ky = ob.kx = ob.ky = 0;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          g.world.lights.push({ x: foot.x, y: foot.y + 0.3, z: 0.4, r: 255, g: 140, b: 60, rad: 160, flicker: 0.15 }); // the river's glow on the slope
        },
        cam: { x: (p.x + bank.x) / 2, y: (p.y + bank.y) / 2, zoom: 1.3 },
      },
      { t: 0.4, fade: 0, fadeDur: 1.4 },
      { t: 3.2, do: () => ob.faceTo(bank.x, bank.y) },
      { t: 4.4, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, bank.x, bank.y, 0.8), g.audio.play('leap', ob)) },
      { t: 5.2, do: () => (ob.setAnim('idle', 1, true), ob.faceTo(p.x, p.y), g.fx.dust(ob.x, ob.y, 6)) },
      say(8.0, 'obiwan', '끝났다, 아나킨!', 3.0),
      say(11.6, 'obiwan', '내가 더 높은 곳에 있다.', 3.0),
      say(16.4, 'anakin', '내 힘을 얕보지 마!', 2.4),
      { t: 16.4, do: () => p.setAnim('talk', 1, true) },
      say(19.0, 'obiwan', '그러지 마라.', 2.0),
      { t: 19.0, do: () => p.setAnim('idle', 1, true) },
      // the leap and the cut
      { t: 21.4, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.airborne = true), c.move(p, bank.x - 0.6, bank.y + 0.2, 0.9), (c.onFrame = () => (p.z = Math.sin(Math.min(1, (c.t - 21.4) / 0.9) * Math.PI) * 1.6))) },
      { t: 22.0, do: () => ob.setAnim('attack2', 1.3, true) },
      {
        t: 22.3,
        do: (c) => {
          c.onFrame = null;
          g.fx.sparks(p.x, p.y, 1.2, '#ffe0b0', 26, 4);
          g.fx.shake(10);
          g.audio.play('clash', p, { heavy: true });
          g.audio.play('hit', p, { crit: true });
          p.saberLit = false;
          p.airborne = false;
          p.setAnim('fall', 1, true);
          c.move(p, foot.x, foot.y, 1.2); // down the slope to the lava's edge
          g.slowT = 0.4;
        },
      },
      { t: 22.5, fade: 0.85, fadeDur: 0.05 },
      { t: 22.7, fade: 0, fadeDur: 1.2, cam: { x: foot.x + 0.6, y: foot.y - 0.4, zoom: 1.6, dur: 3 } },
      { t: 23.6, do: () => (p.z = 0, p.setAnim('crawl'), p.faceTo(ob.x, ob.y)) },
      { t: 25.5, do: () => (ob.setAnim('idle'), ob.faceTo(p.x, p.y)) },
      // Obi-Wan switches off, picks up his fallen student's saber
      { t: 30.0, do: () => ((ob.saberLit = false), g.audio.play('retract', ob), ob.setAnim('idleOff', 1, true)) },
      { t: 34.0, do: (c) => (ob.setAnim('walkOff'), ob.faceTo(foot.x + 0.9, foot.y + 0.4), c.move(ob, foot.x + 0.9, foot.y + 0.5, 2.2)) },
      { t: 36.3, do: () => (ob.setAnim('idleOff', 1, true), ob.faceTo(p.x, p.y)) },
      { t: 38.2, do: () => ob.setAnim('pick', 1, true) },
      { t: 39.6, do: () => g.fx.sparks(ob.x + 0.3, ob.y + 0.2, 0.3, '#c8d8ff', 4, 1.5) },
      { t: 40.0, do: () => ob.setAnim('grieve', 1, true) },
      say(43.0, 'obiwan', '넌 선택받은 자였다!', 2.8),
      { t: 43.0, cam: { x: (foot.x + ob.x) / 2, y: (foot.y + ob.y) / 2, dur: 2 } },
      say(46.2, 'obiwan', '시스를 멸할 거라고 했지, 그들과 손잡는 게 아니라!', 4.2),
      say(52.4, 'obiwan', '포스에 균형을 가져오는 것이지… 어둠 속에 버려두는 게 아니라!', 4.6),
      { t: 60.0, do: () => p.setAnim('crawl', 1.3) },
      say(69.5, 'anakin', '당신이 미워!!', 2.6),
      { t: 69.5, do: () => p.setAnim('burn', 0.7, true), cam: { x: foot.x, y: foot.y - 0.3, dur: 0.4 } },
      say(73.4, 'obiwan', '넌 내 형제였다, 아나킨.', 2.8),
      { t: 73.4, cam: { x: ob.x, y: ob.y, dur: 1.5 } },
      say(76.3, 'obiwan', '널 사랑했다.', 2.4),
      // the lava catches him; Obi-Wan turns away
      {
        t: 78.8,
        do: (c) => {
          p.setAnim('burn', 1, true);
          c.onFrame = () => {
            if (Math.random() < 0.8) g.fx.flame(p.x + rand(-0.35, 0.35), p.y + rand(-0.3, 0.3), 0.15, 2, 1);
            if (Math.random() < 0.3) g.fx.sparks(p.x, p.y, 0.4, '#ff8a30', 2, 2);
          };
          g.world.lights.push({ x: p.x, y: p.y, z: 0.5, r: 255, g: 120, b: 40, rad: 170, flicker: 0.3 });
          g.audio.play('explode', p, { volume: 0.4 });
        },
        cam: { x: foot.x, y: foot.y, dur: 2 },
      },
      { t: 80.6, do: (c) => (ob.setAnim('walkOff'), ob.faceTo(ob.x + 6, ob.y + 2.5), c.move(ob, ob.x + 6, ob.y + 2.5, 3.2)) },
      { t: 82.6, fade: 1, fadeDur: 1.6 },
    ];
    new Cinema(g, { track: 'mustafarEnd', length: 84.5, cues }).play().then(() => {
      this.over = false; // finish() sets it again and reports
      this.finish(true);
    });
  }

  finish(won) {
    // the rating: time pressed on him, sets whose mark was reached, damage taken
    this.stats.sets = this.pressed.length;
    super.finish(won);
    if (won) {
      const s = this.stats;
      const p = this.game.player;
      const score = 40 + s.sets * 7 + s.parries * 4 + s.locksWon * 5 - (s.taken / p.maxHp) * 30;
      this.result.rank = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 52 ? 'B' : 'C';
    }
  }
}
