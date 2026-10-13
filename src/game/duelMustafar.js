// Movie Duel #2 — Anakin vs Obi-Wan, Mustafar (Episode III), told exactly
// the way the film tells it, scored scene by scene with the film's music
// (no film dialogue: the lines are subtitles). The cue sheet — which span of
// which track plays over which scene, and why — is docs/MUSTAFAR_SCORE.md;
// the clips are cut by tools/cut_music.py. The opening and the ending are
// cutscenes timed to their track; the fight in between runs on a film clock
// (SCORE maps it onto four clips): the sets change and the film's beats play
// when the clock reaches them, or as soon as the player drives Obi-Wan down
// to the set's mark — then the clock and the music jump ahead to that scene.
//
//   intro     the landing platform: Anakin chokes Padmé, "You will try."
//   0:00      the platform — Battle of the Heroes
//   0:34      through the door and down the walkway into the entry corridor
//   1:02      the Separatist conference room, the council's bodies
//   1:22      the junction north of it: both reach for the Force, the pushes
//             meet and throw them apart
//   1:33      the control room
//   2:28      Anakin's cut opens the shield generator; the alarm; outside
//   2:38      the balcony catwalk over the lava falls
//   3:29      the shields fail — lava rains onto the catwalk (a hazard)
//   3:54      the catwalk gives way; hanging from the cables over the lava
//   4:12      down onto a service pipe: inching along it, blade to blade
//             (a mining droid hovers by)
//   4:28      onto the collector arm; lava bombs fall round them (a hazard)
//   5:11      "I have failed you, Anakin." … "Then you are lost!"
//   5:26      the arm again; the blades bind
//   5:48      "This is the end for you, my master." The tower falls and the
//             arm with it — into the river; the fight goes on aboard the arm
//             adrift
//   6:13      the arm sinks: Obi-Wan leaps to the repulsor platform, Anakin
//             to the panning droid, then across onto the platform — the two
//             clash on one deck
//   6:28      the bank: the high ground (A Path I Can't Follow, reprised)
//
// (the film's beats, after the visual guide's Mustafar duel spread:
// reference/mustafar_set/mustafar_duel_visual_guide.jpg)
import { Dooku, Duel, Extra } from './duel.js';
import { Unit } from './units.js';
import { Cinema } from './cinema.js';
import { MUSTAFAR as M } from '../world/worldgen.js';
import { dist, rand } from '../core/math.js';
import { HITFEEL, applyFeel } from './hitfeel.js';

// the sets the fight passes through, in order, with the mark on Obi-Wan's bar
// each one ends at (the film moves on at the next beat whatever the player did).
// Driving Obi-Wan down to the set's mark plays the next beat at once (the film's
// music jumps ahead to it) — the beats inside a set too (the lava rain, the forced
// bind), so nothing of the film is skipped; otherwise the music gets there in its
// own time. `footing`: how fast one walks here (a pipe over the lava: inching).
const SETS = [
  { key: 'deck', t: 0, floor: 0.92, place: '착륙장' },
  { key: 'corridor', t: 40, floor: 0.84, place: '입구 복도' },
  { key: 'hall', t: 66, floor: 0.76, place: '분리주의 회의실' },
  { key: 'control', t: 93, floor: 0.64, place: '제어실' },
  { key: 'balcony', t: 158, floor: 0.5, place: '외부 발코니' },
  { key: 'pipe', t: 252, floor: 0.44, place: '배관 위', footing: 0.5 },
  { key: 'arm', t: 272, floor: 0.4, place: '집하기 팔', bombs: true },
  { key: 'arm2', t: 326, floor: 0.3, place: '집하기 팔', bombs: true },
  { key: 'raft', t: 363, floor: 0.26, place: '용암 강 · 떠내려가는 팔', bombs: true },
  { key: 'river', t: 382, floor: 0.22, place: '용암 강' },
];
const FIGHT_LENGTH = 388; // the ending takes over here
// The fight's music (docs/MUSTAFAR_SCORE.md): film time [start, end) -> a clip (music
// situation), played from its top at `start`. Each clip runs a little past its end so
// the crossfade into the next has music under it.
const SCORE = [
  { sit: 'mustafarA', start: 0, end: 231 }, // Anakin vs. Obi-Wan 0:00– : the duel begins, through the shield blast
  { sit: 'mustafarB', start: 231, end: 311 }, // Battle of the Heroes 0:00– : the catwalk falls, the cables, the pipe, the arm
  { sit: 'mustafarC', start: 311, end: 348 }, // Battle of the Heroes 3:04– : "I have failed you", the bind
  { sit: 'mustafarD', start: 348, end: FIGHT_LENGTH + 2 }, // Battle of the Heroes 2:30– : the tower, the arm adrift, the decks
];
// the service pipe the cables drop them onto (world coordinates: over the lava east of the arm, its
// south end at the rock under the collector tower); the cable hook hangs over it
const PIPE = { x: 109.5, y0: 30, y1: 44.5, z: 0.35, r: 0.45 };
const scoreAt = (t) => SCORE.find((c) => t < c.end) || SCORE[SCORE.length - 1];

// ----------------------------------------------------------------------------

class ObiWan extends Dooku {
  constructor(game, x, y) {
    super(game, x, y, 'obiwan3');
    this.name = '오비완 케노비';
    // the Master: a long fight (each set's mark takes several exchanges), a guard that
    // turns most blows (Soresu), cuts that hurt, and a faster tempo than Dooku's
    this.maxHp = this.hp = 3000;
    this.saberColor = [60, 130, 255];
    this.saberCore = 'rgba(230,242,255,0.95)';
    this.blockChance = [0, 0.62, 0.56, 0.5]; // per phase (Dooku: 0.62 / 0.5 / 0.42)
    this.power = 2; // strike damage and guard wear (duel.js resolveStrike)
    this.tempo = 1.3; // attacks, follow-ups and ripostes (Dooku.update)
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
// a missing pose -> [the sheet frame that stands in for it, held at this frame (-1: the last)]
const POSE_FALLBACK = {
  choke: ['cast', 5], // the hand thrust out, held: the Force grip on Padmé
  idleBare: ['idleOff'],
  talkBare: ['idleOff'],
  backflip: ['leap'],
  talk: ['idle'],
  hang: ['leap', 3], // mid-air, held: hanging from the cable
  fall: ['death'],
  crawl: ['death', -1], // down on the slope
  burn: ['death', -1],
  idleOff: ['idle'],
  walkOff: ['walk'],
  pick: ['death', -1], // Obi-Wan's crouch: bending to the fallen saber
  grieve: ['idle'],
};
const SPEAKERS = { anakin: '아나킨', obiwan: '오비완', padme: '파드메' };
const S = (who) => SPEAKERS[who];
const say = (t, who, text, d) => ({ t, say: [S(who), text, d] });

export class MustafarDuel extends Duel {
  constructor(game) {
    super(game);
    this.lines = LINES;
    this.speakers = SPEAKERS;
    this.filmT = 0; // seconds into the fight's music
    this.beatI = 0;
    this.setI = -1;
    this.floor = 1; // Obi-Wan can't be driven below this fraction in the current set
    this.pressed = []; // sets whose mark the player reached
    this.rain = false;
    this.drops = [];
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파의 결투',
      name: '오비완 케노비',
      sub: '제다이 마스터 · 소레수',
      marks: SETS.map((s) => s.floor),
      win: '오비완은 높은 곳에서 아나킨을 내려다보았다. 선택받은 자는 무스타파의 용암 강가에 쓰러졌고, 그 불길 속에서 다스 베이더가 태어난다.',
      lose: '아나킨은 끝내 스승의 수비를 뚫지 못했다. 오비완은 쓰러진 제자를 두고 파드메를 실은 우주선으로 걸어간다.',
    };
    this.beats = [
      { key: 'door', t: 34, run: () => this.sceneDoor() },
      { key: 'hall', t: 62, run: () => this.sceneHall() },
      { key: 'push', t: 82, run: () => this.scenePush() },
      { key: 'console', t: 148, run: () => this.sceneConsole() },
      { key: 'blast', t: 209, run: () => this.sceneBlast(), inSet: true },
      { key: 'collapse', t: 234, run: () => this.sceneCollapse() },
      { key: 'ontoArm', t: 268, run: () => this.sceneOntoArm() },
      { key: 'failed', t: 311, run: () => this.sceneFailed() },
      { key: 'lock', t: 340, run: () => !this.lock && this.startLock(true), inSet: true },
      { key: 'end', t: 348, run: () => this.sceneEnd() },
      { key: 'decks', t: 373, run: () => this.sceneDecks() },
      { key: 'ending', t: FIGHT_LENGTH, run: () => this.ending() },
    ];
    this.bombs = []; // lava bombs in flight (fx.lavaBomb), burning whoever they land on
    this.ropes = null; // the cables (renderer.js drawRopes) while they hang
  }

  setup() {
    const g = this.game;
    const p = g.player;
    const D = M.deck;
    p.sprite = 'anakin_vader'; // the film's arrival: the cloak, hood raised (the campaign's Blender Anakin)
    p.saberLit = false;
    p.x = D.x - 0.8;
    p.y = D.y - 1.5;
    // Obi-Wan: not there yet — he appears in the door of Padmé's skiff (the opening)
    const ob = (this.foe = new ObiWan(g, 110.9, 118.9));
    ob.sprite = 'obiwan3Robe';
    ob.hidden = true;
    const pd = (this.padme = new Extra(g, 'padme', D.x - 4.2, D.y + 0.4));
    p.faceTo(pd.x, pd.y);
    pd.faceTo(p.x, p.y);
    ob.faceTo(p.x, p.y);
    // the river's decks, hidden until the arm falls
    this.droid = new Float(g, 'collector', M.river.x, M.river.y - 2, 1.15);
    this.platform = new Float(g, 'platform', M.river.x + 1.4, M.river.y + 1, 1.15);
    // the collector arm adrift on the river, after its fall: the map's arm sprite as a deck
    const arm = g.assets.city && g.assets.city.mfArm_y;
    if (arm) {
      g.assets.sprites.armRaft = { dirs: 1, anims: { idle: { frames: 1, fps: 1, loop: true, data: [[arm.body]] } }, markers: [] };
      this.raft = new Float(g, 'armRaft', M.river.x, M.river.y - 10, 1.4);
      this.raft.noShadow = true;
      this.raft.depthBias = -40; // under everyone on the river
      this.raft.half = 10.5; // its half length, along y
    }
    g.units.push(ob, pd, this.droid, this.platform);
    if (this.raft) g.units.push(this.raft);
    // the service pipe (the cables drop them onto it): drawn over the lava, walkable, a little above it
    g.world.pipes.push({ x0: PIPE.x, y0: PIPE.y0 - 1.5, x1: PIPE.x, y1: PIPE.y1 + 1.2, z: PIPE.z, r: PIPE.r });
    g.world.strips.push({ x0: PIPE.x, y0: PIPE.y0, x1: PIPE.x, y1: PIPE.y1, r: PIPE.r });
    g.world.surfaces.push({ x0: PIPE.x - 0.6, y0: PIPE.y0 - 1, x1: PIPE.x + 0.6, y1: PIPE.y1 + 1, z: PIPE.z });
  }

  /** Music: the cutscene's track, else the fight's clip for the film clock. */
  music() {
    if (this.game.cinema && this.game.cinema.track) return this.game.cinema.track;
    if (this.over) return 'silence';
    return this.started ? scoreAt(this.filmT).sit : 'title';
  }

  start() {
    this.started = true;
    this.intro().then(() => {
      this.enterSet(0);
      this.fight();
    });
  }

  /**
   * The film clock follows the fight's music while it plays (so the beats stay on
   * the score), and runs on its own when it doesn't (no audio, a clip's tail). When
   * the clock has jumped (a scene played early) or a clip has just started at the
   * wrong place, the music is moved to the clock instead — with a short dip.
   */
  clock(dt) {
    const c = scoreAt(this.filmT);
    const m = this.game.music;
    if (m && m.cur && m.cur.situation === c.sit && m.cur.url) {
      const tr = m.track(m.cur.url);
      const el = tr.el;
      if (!el.paused && el.currentTime > 0.05) {
        const want = this.filmT - c.start;
        if (Math.abs(el.currentTime - want) > 1.5) {
          el.currentTime = Math.max(0, want);
          const gg = tr.gain.gain;
          const now = m.audio.ctx.currentTime;
          gg.cancelScheduledValues(now);
          gg.setValueAtTime(0.15, now);
          gg.linearRampToValueAtTime(1, now + 0.6);
          return;
        }
        this.filmT = Math.max(this.filmT, c.start + el.currentTime);
        return;
      }
    }
    this.filmT += dt;
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
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const anim = (u, name) => () => u.setAnim(name, 1, true);
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      { t: 0.05, fade: 0, fadeDur: 2.5, cam: { ...mid(p, pd), zoom: 1.6 } },
      { t: 3.6, do: () => this.pose(p, 'choke') },
      { t: 3.9, do: () => pd.setAnim('choked') },
      say(4.6, 'padme', '아나킨…!', 1.6),
      // Obi-Wan appears in the skiff's door: a cut to him, then back to the two of them
      { t: 5.4, do: () => ((ob.hidden = false), ob.faceTo(p.x, p.y), ob.setAnim('idle', 1, true)), cam: { x: ob.x + 0.4, y: ob.y - 0.2, zoom: 1.7, dur: 0 } },
      { t: 6.2, cam: { ...mid(p, ob), zoom: 1.5, dur: 1.4 } },
      say(6.8, 'obiwan', '그녀를 놔줘, 아나킨.', 1.6),
      say(8.5, 'obiwan', '놔주라고!', 1.2),
      { t: 10.2, do: () => (p.setAnim('idle'), pd.setAnim('collapse', 1, true)) },
      { t: 11.4, do: () => this.hoodDown(), cam: { x: p.x - 0.6, y: p.y + 0.4, dur: 1.2 } },
      { t: 12.6, do: () => this.pose(p, 'idleBare') },
      { t: 13.2, do: () => pd.setAnim('down') },
      say(14.0, 'anakin', '당신이 그녀를 내게서 돌아서게 만들었어!', 1.9),
      { t: 14.0, do: () => (p.faceTo(ob.x, ob.y), this.pose(p, 'talkBare')) },
      say(16.0, 'obiwan', '그건 네가 스스로 한 짓이다.', 1.6),
      { t: 16.0, do: () => (this.pose(p, 'idleBare'), this.pose(ob, 'talk')) },
      say(17.8, 'anakin', '그녀를 데려가게 두진 않아!', 1.8),
      { t: 17.8, do: () => (ob.setAnim('idle'), this.pose(p, 'talkBare')) },
      { t: 19.8, do: () => this.pose(p, 'idleBare'), cam: { ...mid(p, ob), dur: 2.5 } },
      say(20.8, 'obiwan', '네 분노와 권력욕이 이미 그렇게 만들었다.', 3.6),
      { t: 20.8, do: () => this.pose(ob, 'talk') },
      say(25.2, 'obiwan', '넌 그 암흑 군주에게 마음을 내주었고… 네가 무찌르겠다고 맹세했던 바로 그 존재가 되어 버렸어.', 7.6),
      say(33.4, 'anakin', '설교하지 마요, 오비완. 제다이의 거짓말은 다 꿰뚫어 봤어.', 3.4),
      { t: 33.4, do: () => (ob.setAnim('idle'), this.pose(p, 'talkBare')), cam: { x: p.x - 0.8, y: p.y + 0.5, dur: 1.0 } },
      say(36.6, 'anakin', '난 당신처럼 어둠의 힘을 두려워하지 않아.', 2.4),
      say(39.2, 'anakin', '난 나의 새 제국에 평화와 자유, 정의, 그리고 안전을 가져다줬어!', 4.6),
      say(44.0, 'obiwan', '네 새 제국?', 1.8),
      { t: 44.0, do: () => (this.pose(p, 'idleBare'), this.pose(ob, 'talk')), cam: { ...mid(p, ob), dur: 0 } },
      say(46.3, 'anakin', '날, 당신을 죽이게 만들지 마요.', 2.0),
      { t: 46.3, do: () => (ob.setAnim('idle'), this.pose(p, 'talkBare')) },
      say(48.8, 'obiwan', '아나킨, 내 충성은 공화국에… 민주주의에 있다!', 4.2),
      { t: 48.8, do: () => (this.pose(p, 'idleBare'), this.pose(ob, 'talk')) },
      say(53.0, 'anakin', '나와 함께하지 않는다면, 당신은 내 적이야.', 2.9),
      { t: 53.0, do: () => (ob.setAnim('idle'), this.pose(p, 'talkBare')), cam: { x: p.x - 0.5, y: p.y + 0.3, dur: 1.2 } },
      say(56.3, 'obiwan', '극단을 따지는 건 시스뿐이다.', 2.2),
      { t: 56.3, do: () => (this.pose(p, 'idleBare'), this.pose(ob, 'talk')), cam: { x: ob.x + 0.5, y: ob.y - 0.3, dur: 1.2 } },
      say(58.7, 'obiwan', '난 해야 할 일을 하겠다.', 1.6),
      say(60.4, 'anakin', '어디 해 보시죠.', 1.8),
      { t: 60.4, do: () => ob.setAnim('idle'), cam: { x: p.x, y: p.y, dur: 0.6 } },
      // robes off — Obi-Wan first, then Anakin throws down his cloak
      { t: 62.6, do: () => this.throwRobe(ob, g.world.robe) },
      { t: 64.4, do: () => this.throwRobe(p, g.world.cloak), cam: { ...mid(p, ob), zoom: 1.0, dur: 1.2 } },
      // both ignite as the music rises; Anakin flips back into his guard
      { t: 68.6, do: () => this.ignite(ob) },
      { t: 69.2, do: () => this.ignite(p) },
      { t: 69.9, do: (c) => (this.pose(p, 'backflip'), c.move(p, p.x + 1.2, p.y - 1.6, 0.8)) },
      { t: 70.8, do: () => p.setAnim('idle'), cam: { x: p.x + 1.2, y: p.y - 1.6, dur: 0.6 } },
    ];
    return new Cinema(g, { track: 'mustafarIntro', length: 71.4, cues }).play();
  }

  /** The hood comes down: the same cloak, hood on the back. */
  hoodDown() {
    const p = this.game.player;
    const set = p.sprites.anims;
    if (set.hoodOff) return p.setAnim('hoodOff', 1, true); // (a sheet with the pose)
    p.sprite = 'anakin_robe';
    this.pose(p, 'idleBare');
  }

  throwRobe(u, pile) {
    const g = this.game;
    u.sprite = u === g.player ? 'anakin_tunic' : 'obiwan3';
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
    this.game.audio.play('ignite', u);
  }

  // --- the fight: sets and beats on the film's clock -------------------------

  /** The fight has moved into set `i`: its mark becomes Obi-Wan's floor. */
  enterSet(i) {
    if (i <= this.setI) return;
    this.advanceAt = 0;
    const ob = this.foe;
    const prev = this.setI >= 0 ? SETS[this.setI] : null;
    this.setI = i;
    const st = SETS[i];
    // the film moves on: whatever the player managed, Obi-Wan is where the previous set left him
    if (prev) ob.hp = Math.min(ob.hp, Math.max(1, prev.floor * ob.maxHp));
    this.floor = st.floor;
    this.phase = i >= 6 ? 3 : i >= 3 ? 2 : 1; // Obi-Wan presses harder as the film goes on
    this.footing = st.footing || 0; // (a pipe over the lava: inching along)
    this.bombsOn = !!st.bombs; // (the arm: lava bombs out of the river)
    this.bombT = 2.4;
    this.card(st.place);
  }

  /** The location card, once per set (a scene may have shown it already). */
  card(place) {
    if (this.lastPlace === place) return;
    this.lastPlace = place;
    this.game.emit('place', `무스타파 · ${place}`);
  }

  /** Phase changes by the foe's remaining health `k` — here, by the clock. */
  phases() {
    const g = this.game;
    if (g.cinema || this.over) return;
    if (this.advanceAt && g.time >= this.advanceAt && !this.lock) {
      this.advanceAt = 0;
      this.advance();
    }
    const b = this.beats[this.beatI];
    if (b && this.filmT >= b.t && !this.lock) {
      this.beatI++;
      b.run();
    }
    // the sets' marks follow the clock too (a skipped scene still arrives)
    for (let i = this.setI + 1; i < SETS.length; i++) if (this.filmT >= SETS[i].t) this.enterSet(i);
  }

  update(dt) {
    if (this.started && !this.over && !(this.game.cinema && !this.game.cinema.fight)) this.clock(dt);
    super.update(dt);
    if (this.over) return;
    if (this.rain && !this.game.cinema) this.updateRain(dt);
    if (this.footing && !this.game.cinema) this.balance();
    if (this.onRaft) this.updateRaft(dt);
    if (this.onRiver) this.updateRiver(dt);
    this.updateBombs(dt);
  }

  /** On the pipe: both keep to its line (a step sideways is a step into the lava), within its ends. */
  balance() {
    for (const u of [this.game.player, this.foe]) {
      if (u.airborne) continue;
      u.x += (PIPE.x - u.x) * 0.5;
      u.y = Math.max(PIPE.y0 + 0.4, Math.min(PIPE.y1 - 0.2, u.y));
      u.kx = 0;
      u.ky *= 0.6;
    }
  }

  /**
   * Lava bombs (the film: the erupting river throws gobs of lava round the duellists on the arm). One every
   * few seconds, launched out of the river east of the arm, landing near them on the deck they fight on: a
   * warning ring, then the splash burns whoever stands in it (Obi-Wan's guard takes it as a blow).
   */
  updateBombs(dt) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    for (const b of this.bombs) {
      if (!b.done) continue;
      for (const u of [p, ob]) {
        if (u.dead || dist(u.x, u.y, b.x1, b.y1) > 1.0) continue;
        if (u === p) {
          g.damage(null, u, 14, { type: 'lava' });
          u.stun = Math.max(u.stun, 0.35);
          u.knock(Math.atan2(u.y - b.y1, u.x - b.x1), 2.5);
          u.setAnim('hurt', 0.8, true);
          g.fx.text(u.x, u.y, '용암!', '#ff8a50', 0.9);
        } else {
          g.damage(null, u, 14, { type: 'lava' });
          if (ob.state !== 'broken') ob.set('stagger', 0.6);
        }
      }
    }
    this.bombs = this.bombs.filter((b) => !b.done);
    if (!this.bombsOn || g.cinema || this.lock) return;
    this.bombT -= dt;
    if (this.bombT > 0) return;
    this.bombT = rand(2.4, 4.2);
    // where it lands: on the deck, near one of them
    const near = Math.random() < 0.6 ? ob : p;
    let x1;
    let y1;
    if (this.onRaft && this.raft) {
      x1 = this.raft.x + rand(-0.9, 0.9);
      y1 = Math.max(this.raft.y - this.raft.half + 1, Math.min(this.raft.y + this.raft.half - 1, near.y + rand(-2.5, 2.5)));
    } else {
      const A = M.arm;
      x1 = A.x + rand(-1.1, 1.1);
      y1 = Math.max(A.y - A.hh + 1, Math.min(A.y + A.hh - 1, near.y + rand(-2.5, 2.5)));
    }
    // thrown out of the lava to the east (the river side), in a high arc
    const b = g.fx.lavaBomb(x1 + rand(5, 8), y1 + rand(-3, 3), x1, y1, rand(1.4, 1.8), rand(4, 6));
    this.bombs.push(b);
    g.audio.play('explode', { x: x1 + 6, y: y1 }, { volume: 0.25 });
  }

  /**
   * Damage to Obi-Wan. Hits that land carry the duel's heavier hit feel. His
   * health stops at the set's mark; reaching it counts for the rating and plays
   * the scene that takes the fight on (advance). A hit that lands while he is at
   * the mark still strikes home — flash, sparks, hit stop — and costs him his guard.
   */
  filterHit(src, tgt, amount, opts) {
    const g = this.game;
    const ob = this.foe;
    if (tgt === ob && opts.type === 'lava') {
      ob.composure -= 12;
      ob.lastHurtT = g.time;
      return 0;
    }
    let a = super.filterHit(src, tgt, amount, opts);
    if (tgt !== ob || a <= 0) return a;
    if (opts.type === 'saber' && !opts.feel) opts.feel = 'duel'; // (gfx feel: game.damage reads it after this)
    const min = this.floor * ob.maxHp;
    const full = a;
    a = Math.min(a, Math.max(0, ob.hp - min));
    if (a <= 0) {
      // at the mark: the blow lands on his guard instead
      ob.flash = 0.1;
      g.fx.sparks(ob.x, ob.y, 1.1, '#ff9a6a', 8);
      g.audio.play('hit', ob);
      applyFeel(g, HITFEEL.duel, true);
      ob.composure -= Math.min(30, full * 0.5);
      ob.lastHurtT = g.time;
      if (ob.composure <= 0 && ob.state !== 'broken') this.breakGuard(ob);
      else if (ob.state !== 'broken') ob.set('stagger', 0.5);
      this.reachMark();
      return 0;
    }
    if (ob.hp - a <= min + 0.5) this.reachMark();
    return a;
  }

  /** Obi-Wan is down to this set's mark: counted once, then the film moves on. */
  reachMark() {
    const g = this.game;
    const ob = this.foe;
    if (!this.pressed.includes(this.setI)) {
      this.pressed.push(this.setI);
      g.fx.text(ob.x, ob.y, '몰아붙였다!', '#ffe9a8', 1.15, 2.4);
      if (ob.state !== 'broken') ob.set('stagger', 1.0);
    }
    if (!this.advanceAt) this.advanceAt = g.time + 0.7; // a beat to see him reel, then the next scene
  }

  /**
   * Play the film's next beat now (the one inside the set when there is one — the lava rain, the forced
   * bind — then the one that leaves it): the film's music jumps ahead to it.
   */
  advance() {
    const b = this.beats[this.beatI];
    if (!b) return;
    this.seekFilm(b.t);
  }

  /** Move the film clock forward to `t`; the music follows it there (clock). */
  seekFilm(t) {
    this.filmT = Math.max(this.filmT, t);
  }

  /** Force push (Obi-Wan's "cast"): pushes Anakin back, can't be blocked. */
  lightning(dk, dt) {
    if (dk.pushed || dk.stateT > 0.45) return;
    dk.pushed = true;
    const g = this.game;
    const p = g.player;
    const a = Math.atan2(p.y - dk.y, p.x - dk.x);
    g.fx.shockwave(dk.x + Math.cos(a) * 0.8, dk.y + Math.sin(a) * 0.8, 1.3, '#bfe0ff', 0.4);
    g.audio.play('push', dk);
    if (Math.hypot(p.x - dk.x, p.y - dk.y) > 4.5) return;
    p.knock(a, this.onRiver ? 2 : 7);
    p.stun = Math.max(p.stun, 0.6);
    p.blocking = false;
    p.composure -= 22;
    p.composureT = g.time;
    p.setAnim('hurt', 0.8, true);
    g.damage(dk, p, 8, { type: 'duel' });
    if (Math.random() < 0.4) this.line('obiwan', 'push');
  }

  /**
   * A pose by name. The cast is drawn from Blender sprite sheets; a sheet that
   * has not rendered one of the duel's new poses yet (tools/sprites/README.md,
   * `render_anakin.py` / `render_characters.py obiwan3 --only-anims …`) holds the
   * frame of its own that reads closest instead, so the scene still plays.
   */
  pose(u, name, speed = 1) {
    const set = u.sprites.anims;
    if (set[name]) return u.setAnim(name, speed, true);
    const fb = POSE_FALLBACK[name];
    const alt = fb && set[fb[0]] ? fb[0] : 'idle';
    u.setAnim(alt, speed, true);
    if (fb && alt === fb[0] && fb[1] !== undefined) {
      const a = set[alt];
      const f = fb[1] < 0 ? a.frames - 1 : Math.min(a.frames - 1, fb[1]);
      u.animT = (f + 0.5) / (a.fps * speed);
      u.animFreeze = true;
    }
  }

  /** A scene inside the fight, timed to the fight's music from film time `at`. */
  scene(at, length, cues) {
    this.hold();
    this.foe.set('circle', 99);
    // a scene that starts late (after a bind, say) starts where the music is, so its cues keep their spacing
    at = Math.max(at, this.filmT);
    const c = scoreAt(at);
    const cin = new Cinema(this.game, { track: c.sit, at: at - c.start, length, cues });
    cin.fight = true; // the film clock keeps running through it
    return cin.play().then(() => this.fight());
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
    g.clash((p.x + ob.x) / 2, (p.y + ob.y) / 2, 1.2, 10);
    g.audio.play('clash', ob);
    p.clashFlash = ob.clashFlash = 0.15;
  }

  // 0:34 — down the walkway and through the facility door
  sceneDoor() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const x = M.walk.x;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: x + 0.3, y: 108.5 }, { x: x - 0.3, y: 106 }, 2.2), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 2.2, do: (c) => (this.clash(c, p), this.travel(c, { x, y: 102.5 }, { x, y: 100.5 }, 2.0)) },
      { t: 3.6, do: (c) => this.clash(c) },
      { t: 4.2, do: (c) => (this.travel(c, { x, y: 99.2 }, { x, y: 96.8 }, 1.4), this.card('입구 복도')) },
      { t: 5.6, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(34, 5.8, cues).then(() => this.enterSet(1));
  }

  // 1:02 — into the conference room
  sceneHall() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const x = M.hall.x;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x, y: 85.5 }, { x, y: 83.5 }, 1.4), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 1.5, do: (c) => (this.travel(c, { x: x + 0.4, y: 81.5 }, { x: x - 1.2, y: 78.5 }, 1.8), this.card('분리주의 회의실')) },
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
      { t: 0, do: (c) => this.travel(c, { x: J.x + 7, y: J.y }, { x: J.x + 4, y: J.y }, 1.8), cam: { follow: p, zoom: 1.35, dur: 0.8 } },
      { t: 1.2, do: (c) => this.clash(c) },
      { t: 1.8, do: (c) => this.travel(c, { x: J.x + 2.4, y: J.y }, { x: J.x - 0.6, y: J.y }, 1.2) },
      { t: 3.1, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)), cam: { x: J.x + 1, y: J.y, dur: 0.6 } },
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
          c.move(p, J.x + 7.2, J.y, 0.55);
          c.move(ob, J.x - 5.6, J.y, 0.55);
        },
      },
      { t: 4.4, do: () => (g.fx.dust(p.x, p.y, 8), g.fx.dust(ob.x, ob.y, 8), g.audio.play('slam', p)) },
      { t: 4.5, do: () => (p.setAnim('death', 0.9, true), ob.setAnim('death', 0.9, true)) },
      { t: 6.6, do: () => (p.setAnim('idle', 1, true), ob.setAnim('idle', 1, true)) },
      { t: 7.4, do: (c) => (ob.setAnim('walk'), ob.faceTo(J.x - 9, J.y), c.move(ob, M.control.x + 3.5, M.control.y + 2, 2.6), this.card('제어실')) },
      { t: 8.2, do: (c) => (p.setAnim('run'), p.faceTo(J.x - 9, J.y), c.move(p, M.control.x + 6, J.y, 2.2)), cam: { follow: p, dur: 0.5 } },
      { t: 10.4, do: () => (p.setAnim('idle'), ob.setAnim('idle'), ob.faceTo(p.x, p.y), p.faceTo(ob.x, ob.y)) },
    ];
    this.scene(82, 10.8, cues).then(() => this.enterSet(3));
  }

  // 2:28 — the control room: Anakin's cut opens the shield generator
  sceneConsole() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const core = { x: M.control.x - 4, y: M.control.y - 3.5 };
    const w = g.world;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: core.x + 2.9, y: core.y + 0.8 }, { x: core.x + 1.6, y: core.y + 1.6 }, 1.6), cam: { x: core.x + 2, y: core.y + 1, zoom: 1.35, dur: 0.8 } },
      { t: 1.2, do: (c) => this.clash(c) },
      { t: 1.9, do: () => (p.faceTo(core.x, core.y), p.setAnim('attack3', 1, true)) },
      { t: 2.1, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, core.x + 3.4, core.y + 3.6, 0.5)) },
      {
        t: 2.3,
        do: (c) => {
          g.fx.sparks(core.x + 0.6, core.y + 0.4, 1.4, '#9fd8ff', 26, 5);
          g.fx.explosion(core.x + 0.5, core.y + 0.3, 0.7);
          g.audio.play('zap');
          g.audio.play('explode', p);
          g.fx.shake(7);
          w.alarm.rad = 260; // the alarm light: the shields are failing
          c.onFrame = () => {
            if (Math.random() < 0.5) g.fx.sparks(core.x + rand(-0.6, 0.6), core.y + rand(-0.6, 0.6), 1.2 + Math.random(), Math.random() < 0.5 ? '#9fd8ff' : '#ffb040', 2, 3);
            if (Math.random() < 0.3) g.fx.flame(core.x + 0.4, core.y + 0.3, 1.2, 2, 1.2);
          };
        },
      },
      { t: 2.9, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: 3.4, do: (c) => this.clash(c) },
      // out through the east door onto the balcony
      { t: 4.2, do: (c) => this.travel(c, { x: M.door4.x, y: M.door4.y - 2.2 }, { x: M.door4.x, y: M.door4.y + 0.6 }, 2.2), cam: { follow: p, dur: 0.6 } },
      { t: 5.6, do: (c) => this.clash(c, p) },
      { t: 6.4, do: (c) => (this.travel(c, { x: M.door4.x, y: M.door4.y + 1.6 }, { x: M.door4.x, y: M.door4.y + 4.8 }, 2.0), this.card('외부 발코니')) },
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
      { t: 0, do: () => (p.setAnim('idle'), ob.setAnim('idle')), cam: { x: B.x - 4, y: B.y + 2, zoom: 1.1, dur: 1.0 } },
      {
        t: 0.8,
        do: (c) => {
          g.fx.explosion(95, 88, 2.2);
          g.fx.explosion(102, 89, 1.6);
          g.audio.play('explode', p);
          g.fx.shake(14);
          g.world.lights.push({ x: 88, y: 97, z: 2, r: 255, g: 150, b: 60, rad: 320, flicker: 0.25 });
          c.onFrame = () => {
            if (Math.random() < 0.8) g.fx.lavaSplash(B.x + rand(-2.5, 2.5), B.y + rand(-B.hh, B.hh), 0.6);
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
      const d = { x: B.x + rand(-0.8, 0.8), y: B.y + rand(-B.hh, B.hh + 2), t: 0 };
      this.drops.push(d);
      g.fx.ring(d.x, d.y, 0.55, '#ff8a30', 0.65);
    }
    if (Math.random() < 0.5) g.fx.sparks(B.x + rand(-3, 3), B.y + rand(-B.hh - 2, B.hh + 3), 2.4 + Math.random() * 1.5, '#ff7a30', 1, 1.5);
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

  // 3:54 — the catwalk gives way; hanging from the cables over the lava; down onto a service pipe
  sceneCollapse() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const cx = PIPE.x + 0.2; // the cables hang over the pipe
    const cab = { p: 40.5, ob: 33.5 };
    const hook = { ax: cx, ay: 37, az: 8.5 }; // the crane hook high above: both cables come down from it
    const cues = [
      { t: 0, do: () => (g.fx.shake(10), g.audio.play('explode', p), p.setAnim('hurt', 0.6, true), ob.setAnim('hurt', 0.6, true)), cam: { follow: p, zoom: 1.2, dur: 0.4 } },
      { t: 0.6, do: (c) => (c.onFrame = () => (g.fx.shake(4), Math.random() < 0.6 && g.fx.sparks(p.x + rand(-2, 2), p.y + rand(-3, 3), 0.3, '#ffb040', 3, 4)), g.fx.text(p.x, p.y, '발코니가 무너진다!', '#ff9a50', 1.2, 2.6)) },
      { t: 1.2, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
      { t: 2.4, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, ob.x, ob.y - 2, 0.6)) },
      { t: 3.0, do: (c) => (p.setAnim('leap', 1, true), c.move(p, p.x, p.y - 2, 0.6)) },
      { t: 3.6, fade: 1, fadeDur: 0.7 },
      // hanging from the collector arm's cables over the lava
      {
        t: 4.6,
        do: (c) => {
          c.onFrame = null;
          c.tweens = c.tweens.filter((w) => w.u !== p && w.u !== ob); // (the leap's tween, if a frame was slow)
          this.rain = false;
          this.drops = [];
          p.y = cab.p;
          p.x = cx + 0.25;
          ob.y = cab.ob;
          ob.x = cx + 0.25;
          p.z = ob.z = 1.35;
          p.airborne = ob.airborne = true;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          this.pose(p, 'hang', 1);
          this.pose(ob, 'hang', 1);
          p.kx = p.ky = ob.kx = ob.ky = 0;
          this.card('용암 위의 케이블');
          this.ropes = [{ ...hook, u: p, sag: 4 }, { ...hook, u: ob, sag: -4 }];
          c.onFrame = () => {
            const k = c.t - 4.6;
            // the cables swing them towards each other and apart
            p.y = cab.p - 1.2 * Math.max(0, Math.sin(k * 1.4)) - Math.min(1.6, k * 0.12);
            ob.y = cab.ob + 1.2 * Math.max(0, Math.sin(k * 1.4 + 0.3)) + Math.min(1.6, k * 0.12);
            p.z = 1.35 + Math.sin(k * 2.8) * 0.08;
            ob.z = 1.35 + Math.cos(k * 2.8) * 0.08;
          };
        },
        cam: { x: cx, y: (cab.p + cab.ob) / 2, zoom: 1.35 },
      },
      { t: 4.7, fade: 0, fadeDur: 1.0 },
      ...[6.8, 9.0, 11.3, 13.6].map((t) => ({ t, do: () => (g.clash(cx, (p.y + ob.y) / 2, 1.9, 12), g.audio.play('clash', ob), (p.clashFlash = ob.clashFlash = 0.15)) })),
      { t: 15.6, do: (c) => (c.onFrame = null) },
      // they let go and drop onto the service pipe below, Obi-Wan first — then it is a balancing act
      { t: 16.0, do: (c) => ((this.ropes = this.ropes.filter((r) => r.u !== ob)), ob.setAnim('leap', 1, true), c.move(ob, PIPE.x, ob.y + 1.0, 0.6), (ob.z = PIPE.z), (ob.airborne = false)) },
      { t: 16.6, do: () => (ob.setAnim('idle', 1, true), g.fx.sparks(ob.x, ob.y, PIPE.z, '#c8c0b8', 4, 2), this.card('배관 위')) },
      { t: 17.4, do: (c) => ((this.ropes = null), p.setAnim('leap', 1, true), c.move(p, PIPE.x, p.y - 1.0, 0.6), (p.z = PIPE.z), (p.airborne = false)), cam: { follow: p, dur: 1.0 } },
      { t: 18.0, do: () => (p.setAnim('idle', 1, true), g.fx.sparks(p.x, p.y, PIPE.z, '#c8c0b8', 4, 2), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    this.scene(234, 18.4, cues).then(() => {
      this.ropes = null;
      p.z = ob.z = PIPE.z;
      this.enterSet(5);
    });
  }

  // 4:28 — to the pipe's end, and across onto the collector arm (the lava bombs begin)
  sceneOntoArm() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = M.arm;
    const end = PIPE.y1 - 0.3;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: PIPE.x, y: end - 2.0 }, { x: PIPE.x, y: end }, 1.6), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 2.0, do: (c) => (ob.setAnim('leap', 1, true), g.audio.play('leap', ob), c.move(ob, A.x + 0.4, A.y + A.hh - 4.5, 0.7)) },
      { t: 2.7, do: () => (ob.setAnim('idle', 1, true), (ob.z = 0), g.fx.dust(ob.x, ob.y, 5), ob.faceTo(p.x, p.y), this.card('집하기 팔')) },
      { t: 3.0, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), c.move(p, A.x + 0.4, A.y + A.hh - 7.5, 0.7)), cam: { follow: p, dur: 0.8 } },
      { t: 3.7, do: () => (p.setAnim('idle', 1, true), (p.z = 0), g.fx.dust(p.x, p.y, 5), p.faceTo(ob.x, ob.y)) },
    ];
    this.scene(268, 4.0, cues).then(() => {
      p.z = ob.z = 0;
      this.enterSet(6);
    });
  }

  // 5:11 — "I have failed you, Anakin."
  sceneFailed() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const mid = () => ({ x: (p.x + ob.x) / 2, y: (p.y + ob.y) / 2 });
    const cues = [
      { t: 0, do: () => (p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y), p.setAnim('idle'), this.pose(ob, 'talk', 1)), cam: { ...mid(), zoom: 1.5, dur: 1.0 } },
      say(1.5, 'obiwan', '난 널 실망시켰다, 아나킨. 내가 널 실망시켰어.', 3.4),
      say(5.0, 'anakin', '제다이가 권력을 잡으려 음모를 꾸민다는 걸 진작 알았어야 했어!', 2.6),
      { t: 5.0, do: () => (ob.setAnim('idle'), this.pose(p, 'talk', 1)) },
      say(7.5, 'obiwan', '아나킨, 팰퍼틴 의장은 악이다!', 2.2),
      { t: 7.5, do: () => (p.setAnim('idle'), this.pose(ob, 'talk', 1)) },
      say(9.6, 'anakin', '내 관점에서는, 제다이가 악이야!', 2.4),
      { t: 9.6, do: () => (ob.setAnim('idle'), this.pose(p, 'talk', 1)) },
      say(12.1, 'obiwan', '그렇다면… 넌 길을 잃었구나!', 2.4),
      { t: 12.1, do: () => (p.setAnim('idle'), this.pose(ob, 'talk', 1)) },
      { t: 14.4, do: () => (ob.setAnim('idle'), p.setAnim('idle')) },
    ];
    this.scene(311, 14.8, cues).then(() => this.enterSet(7));
  }

  // 5:48 — "This is the end for you, my master." A lava bomb takes the tower; the arm comes down into the river.
  sceneEnd() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = M.arm;
    const T = M.armTower;
    const w = g.world;
    this.lock = null;
    g.emit('lock', false);
    this.bombsOn = false;
    const armProp = w.props.find((q) => q.sheet === 'mfArm_y' && Math.abs(q.x - A.x) < 1.5);
    const cues = [
      { t: 0, do: () => (p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y), this.pose(p, 'talk', 1), ob.setAnim('idle')), cam: { follow: p, zoom: 1.4, dur: 0.8 } },
      say(0.8, 'anakin', '이걸로 끝이에요, 마스터.', 2.6),
      { t: 3.4, do: () => this.pose(p, 'sig') },
      { t: 3.8, do: (c) => this.clash(c, p) },
      { t: 4.8, do: (c) => this.clash(c) },
      { t: 5.6, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
      // a "cool lava" bomb out of the river strikes the collector tower at the arm's end: it groans and goes
      { t: 6.0, do: () => g.fx.lavaBomb(T.x + 7, T.y - 3, T.x + 0.5, T.y - 1.5, 1.4, 6), cam: { x: T.x, y: T.y - 3, zoom: 1.1, dur: 1.2 } },
      { t: 7.4, do: (c) => (g.fx.shake(6), g.audio.play('explode', p), (c.onFrame = () => (g.fx.shake(3), Math.random() < 0.5 && g.fx.sparks(T.x + rand(-1.5, 1.5), T.y + rand(-1.5, 1.5), rand(0.5, 6), '#ffb040', 3, 4)))) },
      { t: 8.8, do: () => (g.fx.explosion(T.x, T.y, 2.4), g.fx.explosion(T.x + 1, T.y - 1, 1.4), g.audio.play('explode', p), g.fx.text(T.x, T.y - 2, '집하기 탑이 무너진다!', '#ff9a50', 1.2, 2.6)) },
      { t: 9.4, do: (c) => (g.fx.shake(12), p.setAnim('hurt', 0.5, true), ob.setAnim('hurt', 0.5, true), c.move(p, A.x + 0.4, Math.min(A.y + A.hh - 1, p.y + 3), 2.2), c.move(ob, A.x - 0.3, Math.min(A.y + A.hh - 2, ob.y + 3), 2.2)), cam: { follow: p, dur: 1.0 } },
      { t: 11.6, do: () => (p.setAnim('block', 1, true), ob.setAnim('block', 1, true), g.fx.text(p.x, p.y, '팔이 기운다!', '#ff9a50', 1.2, 2.6)) },
      { t: 12.2, fade: 1, fadeDur: 0.6 },
      // the arm comes down into the lava river — and floats: the fight goes on aboard it
      {
        t: 13.4,
        do: (c) => {
          c.onFrame = null;
          if (armProp) armProp.hidden = true;
          this.raftLaunch();
          this.card('용암 강 · 떠내려가는 팔');
        },
        cam: { follow: p, zoom: 1.3 },
      },
      { t: 13.5, fade: 0, fadeDur: 1.0 },
      { t: 13.6, do: () => (g.fx.shake(8), g.audio.play('explode', p), g.fx.lavaSplash(p.x + 1.5, p.y, 2), g.fx.lavaSplash(ob.x - 1.5, ob.y, 2), g.fx.lavaSplash(p.x, p.y + 2.5, 1.5)) },
      { t: 14.2, do: () => (p.setAnim('idle', 1, true), ob.setAnim('idle', 1, true), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: 14.6, do: (c) => this.clash(c, p) },
      { t: 15.2, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(348, 15.4, cues).then(() => this.enterSet(8));
  }

  /** The fallen arm hits the river and drifts: the raft deck, both duellists aboard. */
  raftLaunch() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const w = g.world;
    const R = M.river;
    const raft = this.raft;
    this.raftT = 0;
    this.onRaft = true;
    if (raft) {
      raft.hidden = false;
      raft.alpha = 1;
      raft.x = R.x - 0.5;
      raft.y = R.y - 11;
      raft.z = 0;
      w.strips.push((this.raftStrip = { x0: raft.x, y0: raft.y - raft.half, x1: raft.x, y1: raft.y + raft.half, r: 1.25 }));
      this.raftLights = [
        { x: raft.x, y: raft.y - 5, z: 0.2, r: 255, g: 140, b: 60, rad: 120, flicker: 0.12 },
        { x: raft.x, y: raft.y + 5, z: 0.2, r: 255, g: 140, b: 60, rad: 120, flicker: 0.12 },
      ];
      w.lights.push(...this.raftLights);
      p.x = raft.x + 0.2;
      p.y = raft.y + 2.6;
      ob.x = raft.x - 0.2;
      ob.y = raft.y - 1.4;
    } else {
      // (no arm sprite: the decks straight away)
      this.river();
      this.onRiver = true;
    }
    p.kx = p.ky = ob.kx = ob.ky = 0;
    p.z = ob.z = 0;
    p.airborne = ob.airborne = false;
    p.faceTo(ob.x, ob.y);
    ob.faceTo(p.x, p.y);
    g.updateActive();
  }

  /** The arm drifts downstream, swaying; its riders go with it and never leave it (the lava is right there). */
  updateRaft(dt) {
    const raft = this.raft;
    if (!raft) return;
    const g = this.game;
    const R = M.river;
    this.raftT += dt;
    const k = this.raftT;
    const ox = raft.x;
    const oy = raft.y;
    raft.y = Math.min(R.y - 2, R.y - 11 + k * 0.2);
    raft.x = R.x - 0.5 + Math.sin(k * 0.5) * 0.25;
    if (this.raftSink) {
      // going under: it fades into the lava, splashing along its length
      raft.alpha = Math.max(0, (raft.alpha ?? 1) - dt * 0.45);
      if (Math.random() < 0.5) g.fx.lavaSplash(raft.x + rand(-1, 1), raft.y + rand(-raft.half, raft.half), 0.8);
      if (raft.alpha <= 0) {
        raft.hidden = true;
        this.onRaft = false;
        g.world.strips = g.world.strips.filter((q) => q !== this.raftStrip);
        return;
      }
    }
    const st = this.raftStrip;
    st.x0 = st.x1 = raft.x;
    st.y0 = raft.y - raft.half;
    st.y1 = raft.y + raft.half;
    for (const u of [g.player, this.foe]) {
      if (u.deck && u.deck !== raft) continue; // (already leapt to a deck)
      u.x += raft.x - ox;
      u.y += raft.y - oy;
      if (u.airborne) continue;
      u.x = raft.x + Math.max(-1.1, Math.min(1.1, u.x - raft.x));
      u.y = raft.y + Math.max(-raft.half + 1, Math.min(raft.half - 1, u.y - raft.y));
    }
    if (this.raftLights) {
      this.raftLights[0].x = this.raftLights[1].x = raft.x;
      this.raftLights[0].y = raft.y - 5;
      this.raftLights[1].y = raft.y + 5;
    }
  }

  // 6:13 — the arm goes under: Obi-Wan to the repulsor platform, Anakin to the panning droid — and across
  sceneDecks() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const raft = this.raft;
    this.bombsOn = false;
    const cues = [
      { t: 0, do: () => (p.setAnim('idle'), ob.setAnim('idle'), g.fx.shake(6), g.audio.play('explode', p), g.fx.text(p.x, p.y, '팔이 가라앉는다!', '#ff9a50', 1.2, 2.6)), cam: { follow: p, zoom: 1.25, dur: 0.8 } },
      // the decks come alongside: the repulsor platform on the far side, the panning droid on the near
      {
        t: 0.8,
        do: () => {
          this.river();
          this.onRiver = true;
          if (raft) this.raftSink = true;
        },
      },
      { t: 1.6, do: (c) => (ob.setAnim('leap', 1, true), g.audio.play('leap', ob), (ob.airborne = true), c.move(ob, this.platform.x, this.platform.y, 0.7)) },
      { t: 2.3, do: () => (ob.setAnim('idle', 1, true), (ob.airborne = false), (ob.deck = this.platform), g.fx.dust(ob.x, ob.y, 4), ob.faceTo(p.x, p.y)) },
      { t: 2.8, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.airborne = true), c.move(p, this.droid.x, this.droid.y, 0.7)), cam: { follow: p, dur: 0.6 } },
      { t: 3.5, do: () => (p.setAnim('idle', 1, true), (p.airborne = false), (p.deck = this.droid), g.fx.dust(p.x, p.y, 4), p.faceTo(ob.x, ob.y), this.card('용암 강')) },
      say(4.4, 'obiwan', '…', 0.1),
      // Anakin will not let him go: across onto the platform, and the two clash on one deck
      { t: 5.6, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.airborne = true), c.move(p, this.platform.x + 0.6, this.platform.y + 0.5, 0.7)), cam: { follow: this.platform, zoom: 1.4, dur: 0.8 } },
      { t: 6.3, do: () => (p.setAnim('idle', 1, true), (p.airborne = false), (p.deck = this.platform), g.fx.dust(p.x, p.y, 4), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: 6.6, do: (c) => this.clash(c, p) },
      { t: 7.6, do: (c) => this.clash(c) },
      { t: 8.4, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    this.scene(373, 8.8, cues).then(() => {
      p.z = ob.z = 0;
      p.deck = ob.deck = this.platform;
      this.enterSet(9);
    });
  }

  /** The lava river's decks come alongside the sinking arm: the repulsor platform, the panning droid. */
  river() {
    const g = this.game;
    const w = g.world;
    const R = M.river;
    const raft = this.raft;
    this.riverT = 0;
    this.platform.hidden = this.droid.hidden = false;
    this.platform.x = R.x + 2.2;
    this.platform.y = raft ? raft.y + 2.4 : R.y + 1.5;
    this.droid.x = R.x - 1.8;
    this.droid.y = raft ? raft.y - 0.8 : R.y - 1.4;
    this.riverY0 = this.platform.y;
    w.floats = [this.platform, this.droid];
    this.floatLights = [
      { x: this.platform.x, y: this.platform.y, z: 0.2, r: 255, g: 140, b: 70, rad: 90, flicker: 0.08 }, // (its lamps glow orange)
      { x: this.droid.x, y: this.droid.y, z: 0.2, r: 255, g: 150, b: 60, rad: 90, flicker: 0.1 },
    ];
    w.lights.push(...this.floatLights);
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
    // (downstream is +y: the river runs along y)
    this.platform.y = Math.min(R.y + 7, (this.riverY0 ?? R.y + 1.5) + k * 0.22);
    this.platform.x = R.x + 2.2 + Math.sin(k * 0.7) * 0.2;
    this.droid.y = this.platform.y - 3.0 - Math.max(0, Math.sin(k * 0.9)) * 0.5;
    this.droid.x = R.x - 1.8 + Math.cos(k * 0.8) * 0.3;
    const carry = (u, f, ox, oy) => {
      if (u.deck !== f || u.airborne) return; // (not aboard this one; mid-leap)
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
    carry(p, this.platform, px, py);
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
    const bank = { x: M.bank.x - 2.2, y: this.platform.y + 1.6 }; // where Obi-Wan lands: the slope above the river
    const foot = { x: bank.x - 1.1, y: bank.y - 2.0 }; // where Anakin falls, at the lava's edge below him
    // the high ground: the bank stands a metre over the river (a raised top: he lands up on it, Anakin rolls
    // down off it)
    g.world.surfaces.push({ x0: bank.x - 0.5, y0: bank.y - 6, x1: bank.x + 14, y1: bank.y + 12, z: 1.0 });
    this.raftSink = false;
    this.onRaft = false;
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
          g.world.lights.push({ x: foot.x + 0.6, y: foot.y - 0.4, z: 0.5, r: 255, g: 150, b: 70, rad: 230, flicker: 0.12 }); // the river's glow on the slope
          g.world.lights.push({ x: foot.x - 0.8, y: foot.y + 1.2, z: 0.3, r: 255, g: 120, b: 50, rad: 150, flicker: 0.2 });
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
      { t: 16.4, do: () => this.pose(p, 'talk', 1) },
      say(19.0, 'obiwan', '그러지 마라.', 2.0),
      { t: 19.0, do: () => p.setAnim('idle', 1, true) },
      // the leap and the cut
      { t: 21.4, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.airborne = true), c.move(p, bank.x + 0.2, bank.y - 0.6, 0.9), (c.onFrame = () => (p.z = Math.sin(Math.min(1, (c.t - 21.4) / 0.9) * Math.PI) * 1.6))) },
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
          this.pose(p, 'fall', 1);
          c.move(p, foot.x, foot.y, 1.2); // down the slope to the lava's edge
          g.slowT = 0.4;
        },
      },
      { t: 22.5, fade: 0.85, fadeDur: 0.05 },
      { t: 22.7, fade: 0, fadeDur: 1.2, cam: { x: foot.x - 0.4, y: foot.y + 0.6, zoom: 1.6, dur: 3 } },
      { t: 23.6, do: () => (p.z = 0, this.pose(p, 'crawl'), p.faceTo(ob.x, ob.y)) },
      { t: 25.5, do: () => (ob.setAnim('idle'), ob.faceTo(p.x, p.y)) },
      // Obi-Wan switches off, picks up his fallen student's saber
      { t: 30.0, do: () => ((ob.saberLit = false), g.audio.play('retract', ob), this.pose(ob, 'idleOff', 1)) },
      { t: 34.0, do: (c) => (this.pose(ob, 'walkOff'), ob.faceTo(foot.x + 0.4, foot.y + 0.9), c.move(ob, foot.x + 0.5, foot.y + 0.9, 2.2)) },
      { t: 36.3, do: () => (this.pose(ob, 'idleOff', 1), ob.faceTo(p.x, p.y)) },
      { t: 38.2, do: () => this.pose(ob, 'pick', 1) },
      { t: 39.6, do: () => g.fx.sparks(ob.x + 0.2, ob.y + 0.3, 0.3, '#c8d8ff', 4, 1.5) },
      { t: 40.0, do: () => this.pose(ob, 'grieve', 1) },
      say(43.0, 'obiwan', '넌 선택받은 자였다!', 2.8),
      { t: 43.0, cam: { x: (foot.x + ob.x) / 2, y: (foot.y + ob.y) / 2, dur: 2 } },
      say(46.2, 'obiwan', '시스를 멸할 거라고 했지, 그들과 손잡는 게 아니라!', 4.2),
      say(52.4, 'obiwan', '포스에 균형을 가져오는 것이지… 어둠 속에 버려두는 게 아니라!', 4.6),
      { t: 60.0, do: () => this.pose(p, 'crawl', 1.3) },
      say(69.5, 'anakin', '당신이 미워!!', 2.6),
      { t: 69.5, do: () => this.pose(p, 'burn', 0.7), cam: { x: foot.x - 0.3, y: foot.y, dur: 0.4 } },
      say(73.4, 'obiwan', '넌 내 형제였다, 아나킨.', 2.8),
      { t: 73.4, cam: { x: ob.x, y: ob.y, dur: 1.5 } },
      say(76.3, 'obiwan', '널 사랑했다.', 2.4),
      // the lava catches him; Obi-Wan turns away
      {
        t: 78.8,
        do: (c) => {
          this.pose(p, 'burn', 1);
          c.onFrame = () => {
            if (Math.random() < 0.8) g.fx.flame(p.x + rand(-0.3, 0.3), p.y + rand(-0.35, 0.35), 0.15, 2, 1);
            if (Math.random() < 0.3) g.fx.sparks(p.x, p.y, 0.4, '#ff8a30', 2, 2);
          };
          g.world.lights.push({ x: p.x, y: p.y, z: 0.5, r: 255, g: 120, b: 40, rad: 170, flicker: 0.3 });
          g.audio.play('explode', p, { volume: 0.4 });
        },
        cam: { x: foot.x, y: foot.y, dur: 2 },
      },
      { t: 80.6, do: (c) => (this.pose(ob, 'walkOff'), ob.faceTo(ob.x + 2.5, ob.y + 6), c.move(ob, ob.x + 2.5, ob.y + 6, 3.2)) },
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
      const score = 40 + s.sets * 5.5 + s.parries * 4 + s.locksWon * 5 - (s.taken / p.maxHp) * 30;
      this.result.rank = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 52 ? 'B' : 'C';
    }
  }
}
