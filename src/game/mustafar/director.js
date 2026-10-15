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
//               inside it
// STAGE 02 — the Separatist conference room:
//   the door    at the corridor's far door (or its mark, or its time) the facility door opens and they fight into the room
//   the room    the duel round the council's table, his health held at the room's mark
//   the push    at the mark (or the room's time) both reach for the Force at once and are thrown apart
// STAGE 03–06 (BLOCKOUT — grey boxes, the art not requested yet): the control room, the walkway and the lava collector,
// the river's moving decks, the high ground and the film's ending — their parts and scenes are in ./route.js.
import { Duel, Extra } from '../duel.js';
import { MustafarDuel, ObiWan } from '../duelMustafar.js';
import { Cinema } from '../cinema.js';
import { ROUTE, ROUTE_FIGHTS } from './route.js';

/** The film's places, in order (each its zone file, public/maps/mustafar_v2/<zone>.json). */
export const STAGES = [
  { id: 'stage01', zone: 'stage01', title: '무스타파 · 착륙장' },
  { id: 'stage02', zone: 'stage02', title: '무스타파 · 분리주의 회의실' },
  { id: 'stage03', zone: 'stage03', title: '무스타파 · 제어실', blockout: true },
  { id: 'stage04', zone: 'stage04', title: '무스타파 · 산업 보행로 · 용암 집하 시설', blockout: true },
  { id: 'stage05', zone: 'stage05', title: '무스타파 · 용암 강 · 이동 플랫폼', blockout: true },
  { id: 'stage06', zone: 'stage06', title: '무스타파 · 고지대', blockout: true },
];

// the old duel's staging, borrowed as it is (it reads only this director's units and state)
const FILM = MustafarDuel.prototype;
const BORROW = ['intro', 'pose', 'hoodDown', 'ignite', 'travel', 'clash', 'lightning', 'reachMark', 'card', 'updateRain'];

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
// STAGE 02's: the conference room (the film's 1:02 – 1:22), then both reach for the Force at once
const ROOM = { floor: 0.76, time: 28 };
// How long a fight lasts when Anakin presses him the whole time: a part's stretch of Obi-Wan's bar (its floor up from the
// last part's) is sized so that a player attacking non-stop (REF_DPS, measured: about 65 a second with clicks on him and
// the guard when he swings, his broken guard and staggers included) needs PRESS_SHARE of the part's time to bring him to
// the mark. With the bar as it was, every
// part ended in 2–8 s and the whole duel had under a minute of fighting between its scenes. (Lava hurts his guard only.)
const REF_DPS = 65;
const PRESS_SHARE = 0.6;

/**
 * The playable parts in the film's order: Obi-Wan's health is held at the part's `floor` (the mark on his bar); the
 * part ends at the mark, at its `time` (s of play: the film moves on), or when `reach` says the fight got there —
 * then `next` (a scene) takes it on. `stage`: the zone the part is in; `score`: the film's music under it.
 */
const FIGHTS = {
  pad: { stage: 1, floor: PAD.floor, time: PAD.filmT, next: 'toCorridor', score: 'mustafarA' },
  corridor: { stage: 1, floor: CORRIDOR.floor, time: CORRIDOR.time, next: 'toRoom', score: 'mustafarA', reach: (d) => d.game.player.x < d.at.door.x + 0.5 },
  room: { stage: 2, floor: ROOM.floor, time: ROOM.time, next: 'toPush', score: 'mustafarA' },
  ...ROUTE_FIGHTS,
};
const ORDER = Object.keys(FIGHTS);
// Obi-Wan's tell (duel.js Dooku.strike): how long he holds the blade drawn back before a blow, the glint on it. The swing
// from there to the hit is another ~0.17 s; the perfect parry is the guard raised in the last 0.25 s before the hit. So an
// exchange he opens gives 0.6 s to see it coming (0.5 by the end: the film's pace quickens), a blow of a combo or a riposte
// a third of a second, and the heavy backhand a little more.
const WINDUP = { open: [0.45, 0.45, 0.38, 0.31], follow: [0.15, 0.15, 0.15, 0.15], riposte: [0.19, 0.19, 0.19, 0.19] };
const windup = (phase, n, kind) => (WINDUP[kind] || WINDUP.open)[phase] + (n === 3 ? 0.12 : 0);
/** What of Anakin's blows lands in part `F` (its stretch of the bar from `prevFloor` down to `floor`): REF_DPS above. */
const bandScale = (F, floor, prevFloor, maxHp) => Math.min(1, ((prevFloor - floor) * maxHp) / (REF_DPS * PRESS_SHARE * F.time));

export class MustafarDirector extends Duel {
  constructor(game) {
    super(game); // (equips Anakin, then setup())
    this.lines = LINES;
    this.speakers = SPEAKERS;
    this.stage = STAGES[0];
    this.part = 'arrival'; // arrival -> choke -> pad -> toCorridor -> corridor -> toRoom -> room -> push -> … (FIGHTS) -> ending -> done
    this.fights = FIGHTS;
    this.setI = 0;
    this.floor = 1;
    this.pressed = [];
    this.partT = 0; // seconds of play in the current part
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파의 결투',
      name: '오비완 케노비',
      sub: '제다이 마스터 · 소레수',
      marks: ORDER.map((k) => FIGHTS[k].floor),
      win: '오비완은 높은 곳에서 아나킨을 내려다보았다. 선택받은 자는 무스타파의 용암 강가에 쓰러졌고, 그 불길 속에서 다스 베이더가 태어난다.',
      lose: '아나킨은 쓰러졌다. 오비완은 쓰러진 제자를 뒤로하고 파드메에게 돌아간다.',
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
    for (const k of ['roomAnakin', 'roomObiwan', 'pushAnakin', 'pushObiwan', 'pushAnakinTo', 'pushObiwanTo']) this.at[k] = pt(k);
    for (const [k, v] of Object.entries(Z.actors)) if (!this.at[k] && !(k in { anakin: 1, anakinMeet: 1 })) this.at[k] = { ...v }; // (STAGE 03–06's: route.js)
    p.sprite = 'anakin_vader'; // the film's arrival: the cloak, hood raised (the old duel's progression)
    p.saberLit = false;
    p.x = this.at.anakin0.x;
    p.y = this.at.anakin0.y;
    const ob = (this.foe = new ObiWan(g, this.at.obiwanRamp.x, this.at.obiwanRamp.y));
    ob.sprite = 'obiwan3Robe';
    ob.hidden = true;
    ob.windup = (n, kind) => windup(this.phase, n, kind);
    ob.saberLit = false;
    const pd = (this.padme = new Extra(g, 'padme', this.at.padme.x, this.at.padme.y));
    pd.hidden = true;
    p.faceTo(pd.x, pd.y);
    pd.faceTo(p.x, p.y);
    ob.faceTo(p.x, p.y);
    g.units.push(ob, pd);
    this.setupRoute(); // the river's decks (route.js)
  }

  // --- music: silence under the arrival (the lava's ambience), the film's tracks from the choke -----------------
  music() {
    const g = this.game;
    if (g.cinema && g.cinema.track) return g.cinema.track;
    if (this.over) return 'silence';
    if (this.score) return this.score; // (the fight's: the part's, kept through the scene that leaves it)
    return this.started ? 'silence' : 'title';
  }

  start() {
    this.started = true;
    // (QA, and testing a blockout: ?mfPart=<part> starts the fight there — route.js jumpTo)
    const jump = new URLSearchParams(location.search).get('mfPart');
    if (jump && FIGHTS[jump]) return this.jumpTo(jump);
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

  /** Robes off before the duel: the robe (the zone's hidden `robe` / `cloak` prop) lands on the deck behind him. */
  throwRobe(u) {
    const g = this.game;
    u.sprite = u === g.player ? 'anakin_tunic' : 'obiwan3';
    u.setAnim('idle', 1, true);
    u.saberLit = false;
    const x = u.x - Math.cos(u.facing) * 0.7;
    const y = u.y - Math.sin(u.facing) * 0.7;
    const pile = g.world.named[u === g.player ? 'cloak' : 'robe'];
    if (pile) {
      pile.x = x;
      pile.y = y;
      if (g.renderer) g.renderer.placeProp(pile);
      pile.hidden = false;
    }
    g.fx.dust(x, y, 5);
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
    this.bandScale = bandScale(FIGHTS.pad, PAD.floor, 1, this.foe.maxHp);
    this.score = FIGHTS.pad.score;
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
    return new Cinema(g, { length: 6.0, cues }).play().then(() => this.enterPart('corridor', CORRIDOR.floor, PAD.floor)); // (the corridor's mark: the fight goes on inside it)
  }

  /** The far door: the two fight up to it, it opens, and the fight goes on into the conference room (STAGE 02). */
  toRoom() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const D = this.at.door;
    const A = this.at;
    this.part = 'toRoom';
    this.hold();
    ob.set('circle', 99);
    const door = g.world.named && g.world.named.facilityDoor;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: D.x + 2.6, y: D.y + 0.4 }, { x: D.x, y: D.y }, 1.6), cam: { x: D.x + 1.5, y: D.y, zoom: 1.4, dur: 1.0 } },
      { t: 1.0, do: (c) => this.clash(c) },
      // the facility door opens behind Obi-Wan
      { t: 1.8, do: () => (door && (door.hidden = true), g.world.open && g.world.open('facilityDoor'), g.fx.dust(D.x - 3.2, D.y, 6), g.audio.play('click')) },
      { t: 2.0, do: (c) => (this.clash(c, p), this.travel(c, { x: A.roomAnakin.x, y: A.roomAnakin.y }, { x: A.roomObiwan.x, y: A.roomObiwan.y }, 2.2)), cam: { follow: p, zoom: 1.3, dur: 1.2 } },
      { t: 3.2, do: (c) => (this.clash(c), this.card('분리주의 회의실')) },
      { t: 4.2, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    return new Cinema(g, { length: 4.6, cues }).play().then(() => this.enterPart('room', ROOM.floor, CORRIDOR.floor));
  }

  /** The fight moves on into `part`: Obi-Wan's health at least down to the previous mark, the new mark, play. */
  enterPart(part, floor, prevFloor) {
    const p = this.game.player;
    const ob = this.foe;
    const F = FIGHTS[part];
    floor ??= F.floor;
    prevFloor ??= FIGHTS[ORDER[ORDER.indexOf(part) - 1]]?.floor ?? 1;
    if (ob.hp > prevFloor * ob.maxHp) ob.hp = prevFloor * ob.maxHp; // (the film moved on: he is where the last place left him)
    // each place a round of its own: Anakin starts it whole, as the retry from it does (a part's fight runs long enough
    // that the hurt of the ones before would leave him none to fight with — the real-player run died by the third)
    p.hp = p.maxHp;
    this.part = part;
    this.partT = 0;
    this.setI = ORDER.indexOf(part);
    this.floor = floor;
    this.bandScale = bandScale(F, floor, prevFloor, ob.maxHp);
    this.score = F.score;
    this.phase = this.setI >= 6 ? 3 : this.setI >= 3 ? 2 : 1; // Obi-Wan presses harder as the film goes on (duelMustafar.js)
    // the place's hazards (route.js): the lava rain, the pipe's footing, the lava bombs
    this.rain = !!F.rain;
    this.footing = !!F.footing;
    this.bombsOn = !!F.bombs;
    this.bombT = 2.4;
    this.beatDone = false;
    this.advanceAt = 0;
    this.unstick(p);
    this.unstick(ob);
    this.fight();
  }

  /**
   * The end of the conference room (the film's 1:22): both reach for the Force at once; the pushes meet and throw them
   * apart across the room — then on to the control room (STAGE 03, not built yet). The staging is the old duel's
   * junction scene (duelMustafar.js scenePush) on this room's lane south of the table.
   */
  toPush() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = this.at;
    this.part = 'push';
    this.hold();
    ob.set('circle', 99);
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: A.pushAnakin.x + 1.2, y: A.pushAnakin.y }, { x: A.pushObiwan.x + 1.6, y: A.pushObiwan.y }, 1.6), cam: { follow: p, zoom: 1.35, dur: 0.8 } },
      { t: 1.1, do: (c) => this.clash(c) },
      { t: 1.6, do: (c) => this.travel(c, A.pushAnakin, A.pushObiwan, 1.0) },
      { t: 2.7, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)), cam: { x: (A.pushAnakin.x + A.pushObiwan.x) / 2, y: A.pushAnakin.y, dur: 0.6 } },
      { t: 3.0, do: () => (p.setAnim('cast', 1, true), ob.setAnim('cast', 1, true)) },
      {
        t: 3.45,
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
          c.move(p, A.pushAnakinTo.x, A.pushAnakinTo.y, 0.55);
          c.move(ob, A.pushObiwanTo.x, A.pushObiwanTo.y, 0.55);
        },
      },
      { t: 4.0, do: () => (g.fx.dust(p.x, p.y, 8), g.fx.dust(ob.x, ob.y, 8), g.audio.play('slam', p)) },
      { t: 4.1, do: () => (p.setAnim('death', 0.9, true), ob.setAnim('death', 0.9, true)) },
      { t: 6.2, do: () => (p.setAnim('idle', 1, true), ob.setAnim('idle', 1, true), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    return new Cinema(g, { length: 6.8, cues }).play().then(() => this.toControl()); // (STAGE 03: route.js)
  }

  /** Per frame: the duel's upkeep (duel.js), the places' own (route.js: the rain, the pipe, the decks), then how the fight moves on. */
  update(dt) {
    super.update(dt);
    const g = this.game;
    if (this.over) return;
    this.updateRoute(dt);
    if (g.cinema || this.lock || !this.started) return;
    const F = FIGHTS[this.part];
    if (!F) return;
    this.partT += dt;
    if (F.beat && !this.beatDone && this.partT >= F.beat.t) {
      this.beatDone = true; // (a beat inside the part: the forced bind on the arm)
      this[F.beat.run]();
      return;
    }
    const pressed = this.advanceAt && g.time >= this.advanceAt;
    if (pressed || this.partT >= F.time || (F.reach && F.reach(this))) {
      this.beatDone = false;
      this[F.next]();
    }
  }

  /** (The duel's phases by health are this stage's marks: the progression above.) */
  phases() {}

  /** The old duel's (the mark holds him, a blow at it lands on his guard), Anakin's blows scaled to the part's stretch. */
  filterHit(src, tgt, amount, opts) {
    if (tgt !== this.foe || opts.type === 'lava') return FILM.filterHit.call(this, src, tgt, amount, opts);
    // his guard still feels the whole blow (duel.js reads opts.weight); opts goes back as it came, but for what the
    // hit adds to it for game.damage (its feel)
    const own = 'weight' in opts;
    if (!own) opts.weight = amount;
    const a = FILM.filterHit.call(this, src, tgt, amount * (this.bandScale ?? 1), opts);
    if (!own) delete opts.weight;
    return a;
  }

  /** Lost: the retry starts at the fight he fell in, not back at the landing pad (the whole duel runs many minutes). */
  finish(won) {
    super.finish(won);
    if (!won && FIGHTS[this.part]) this.result.retryPart = this.part;
  }
}
for (const k of BORROW) MustafarDirector.prototype[k] = FILM[k];
Object.assign(MustafarDirector.prototype, ROUTE);
