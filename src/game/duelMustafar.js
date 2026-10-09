// Movie Duel #2 — Anakin vs Obi-Wan, Mustafar (Episode III), told the way
// the film tells it. Cutscenes run on the film's own audio (a fan edit of the
// duel, see tools/cut_music.py) with Korean subtitles timed to its voices:
//
//   opening   the landing platform: Anakin chokes Padmé, lets her fall,
//             lowers his hood and faces Obi-Wan ("You will try."); both
//             throw off their robes, ignite, and Anakin backflips into the
//             fight as Battle of the Heroes begins
//   fight     on the platform; Obi-Wan fights Soresu — patient guard, sharp
//             ripostes, a Force push to break Anakin's rhythm
//   55%       the exchange from the film ("From my point of view the Jedi
//             are evil!") — the fight moves onto a collector platform on
//             the lava river
//   25%       the blades lock over the lava
//   ending    Obi-Wan leaps onto the bank: the high ground. The film's
//             ending plays out on its audio.
import { Dooku, Duel } from './duel.js';
import { Unit } from './units.js';
import { Cinema } from './cinema.js';
import { MUSTAFAR } from '../world/worldgen.js';

const { deck, raft, bank } = MUSTAFAR;

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

/** A figure the cutscenes move (Padmé). */
class Extra extends Unit {
  constructor(game, kind, x, y) {
    super(game, kind, x, y);
    this.untargetable = true;
    this.scripted = true;
  }

  update(dt) {
    this.baseUpdate(dt);
  }
}

// ----------------------------------------------------------------------------

const LINES = {
  parry: [['obiwan', '그만둬, 아나킨!'], ['obiwan', '넌 내 가르침을 잊지 않았구나.'], ['obiwan', '분노로는 날 이길 수 없다.']],
  broken: [['obiwan', '크윽…!'], ['obiwan', '아나킨…!']],
  push: [['obiwan', '물러서라!']],
};
const SPEAKERS = { anakin: '아나킨', obiwan: '오비완', padme: '파드메' };
const S = (who) => SPEAKERS[who];

export class MustafarDuel extends Duel {
  constructor(game) {
    super(game);
    this.lines = LINES;
    this.speakers = SPEAKERS;
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE III',
      title: '무스타파의 결투',
      name: '오비완 케노비',
      sub: '제다이 마스터 · 소레수',
      marks: [0.55, 0.25],
      win: '오비완은 높은 곳에서 아나킨을 내려다보았다. 선택받은 자는 무스타파의 용암 강가에 쓰러졌고, 그 불길 속에서 다스 베이더가 태어난다.',
      lose: '아나킨은 끝내 스승의 수비를 뚫지 못했다. 오비완은 쓰러진 제자를 두고 파드메를 실은 우주선으로 걸어간다.',
    };
  }

  setup() {
    const g = this.game;
    const p = g.player;
    p.sprite = 'anakinHood';
    p.saberLit = false;
    p.x = deck.x - 1.5;
    p.y = deck.y - 0.8;
    const ob = (this.foe = new ObiWan(g, deck.x + 2.6, deck.y - 5.2));
    ob.sprite = 'obiwan3Robe';
    const pd = (this.padme = new Extra(g, 'padme', deck.x + 0.4, deck.y - 4.2));
    p.faceTo(pd.x, pd.y);
    pd.faceTo(p.x, p.y);
    ob.faceTo(p.x, p.y);
    g.units.push(ob, pd);
  }

  /** Music: the cutscene's own sound track, else the duel's music. */
  music() {
    if (this.game.cinema && this.game.cinema.track) return this.game.cinema.track;
    if (this.over) return 'silence';
    return this.started ? 'mustafar' : 'title';
  }

  start() {
    this.started = true;
    this.intro().then(() => this.fight());
  }

  fight() {
    const g = this.game;
    for (const u of [g.player, this.foe]) u.scripted = false;
    g.player.action = null;
    this.foe.set('circle', 1.2);
    this.locked = this.cine = false;
  }

  /** Puts both duellists under the cutscene's control. */
  hold() {
    const g = this.game;
    const p = g.player;
    this.locked = this.cine = true;
    p.action = null;
    p.blocking = false;
    p.scripted = this.foe.scripted = true;
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
    const say = (t, who, text, d) => ({ t, say: [S(who), text, d] });
    const anim = (u, name) => () => u.setAnim(name, 1, true);
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      { t: 0.05, fade: 0, fadeDur: 2.5, cam: { ...mid(p, pd), zoom: 1.6 } },
      { t: 3.6, do: anim(p, 'choke') },
      { t: 3.9, do: () => pd.setAnim('choked') },
      say(4.9, 'padme', '아나킨…! 그만…', 2.0),
      { t: 6.8, cam: { ...mid(p, ob), dur: 1.6 } },
      say(7.3, 'obiwan', '그녀를 놔줘, 아나킨.', 1.8),
      say(9.2, 'obiwan', '놔주라고!', 1.2),
      { t: 10.4, do: () => (p.setAnim('idle'), pd.setAnim('collapse', 1, true)) },
      { t: 11.4, do: anim(p, 'hoodOff'), cam: { x: p.x + 0.4, y: p.y - 0.6, dur: 1.2 } },
      { t: 12.6, do: () => p.setAnim('idleBare') },
      { t: 13.2, do: () => pd.setAnim('down') },
      say(14.3, 'anakin', '당신이 그녀를 내게서 돌아서게 만들었어!', 2.0),
      { t: 14.3, do: () => (p.faceTo(ob.x, ob.y), p.setAnim('talkBare')) },
      say(16.4, 'obiwan', '그건 네가 스스로 한 짓이다.', 1.3),
      { t: 16.4, do: () => ob.setAnim('talk') },
      say(17.7, 'anakin', '그녀를 데려가게 두진 않아!', 1.8),
      { t: 19.6, do: () => (p.setAnim('idleBare'), ob.setAnim('idle')), cam: { ...mid(p, ob), dur: 2.5 } },
      say(22.7, 'obiwan', '네 분노와 권력욕이 이미 그렇게 만들었다.', 3.4),
      { t: 22.7, do: () => ob.setAnim('talk') },
      say(26.3, 'obiwan', '넌 그 암흑 군주에게 마음을 내주었고… 네가 무찌르겠다던 바로 그 존재가 되어 버렸어.', 3.3),
      say(29.7, 'anakin', '설교하지 마요, 오비완! 제다이의 거짓말은 다 꿰뚫어 봤어.', 4.3),
      { t: 29.7, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')), cam: { x: p.x + 0.5, y: p.y - 0.8, dur: 1.0 } },
      say(34.2, 'anakin', '난 당신처럼 어둠의 힘을 두려워하지 않아.', 2.6),
      say(36.9, 'anakin', '난 나의 새 제국에 평화와 자유, 정의, 그리고 안전을 가져다줬어!', 4.4),
      say(41.8, 'obiwan', '네 새 제국?', 2.0),
      { t: 41.8, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')), cam: { ...mid(p, ob), dur: 0 } },
      say(44.8, 'anakin', '날, 당신을 죽이게 만들지 마요.', 2.6),
      { t: 44.8, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')) },
      say(48.4, 'obiwan', '아나킨, 내 충성은 공화국에… 민주주의에 있다!', 4.4),
      { t: 48.4, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')) },
      say(53.8, 'anakin', '나와 함께하지 않는다면, 당신은 내 적이야.', 2.8),
      { t: 53.8, do: () => (ob.setAnim('idle'), p.setAnim('talkBare')), cam: { x: p.x + 0.3, y: p.y - 0.5, dur: 1.2 } },
      say(56.8, 'obiwan', '극단을 따지는 건 시스뿐이다.', 1.8),
      say(58.6, 'obiwan', '난 해야 할 일을 하겠다.', 1.5),
      { t: 56.8, do: () => (p.setAnim('idleBare'), ob.setAnim('talk')), cam: { x: ob.x - 0.3, y: ob.y + 0.5, dur: 1.2 } },
      say(60.2, 'anakin', '어디 해 보시죠.', 2.2),
      { t: 60.2, do: () => ob.setAnim('idle'), cam: { x: p.x, y: p.y, dur: 0.6 } },
      // robes off — Obi-Wan first, then Anakin throws down his cloak
      { t: 62.6, do: () => this.throwRobe(ob, g.world.robe) },
      { t: 64.4, do: () => this.throwRobe(p, g.world.cloak), cam: { ...mid(p, ob), zoom: 1.0, dur: 1.2 } },
      // both ignite as the music rises; Anakin flips back into his guard
      { t: 69.0, do: () => this.ignite(ob) },
      { t: 69.4, do: () => this.ignite(p) },
      { t: 69.9, do: (c) => (p.setAnim('backflip', 1, true), c.move(p, p.x - 1.6, p.y + 1.2, 0.8)) },
      { t: 70.5, do: () => (this.introMusicDone = true) },
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
    const g = this.game;
    u.saberLit = true;
    g.audio.play('ignite', u);
  }

  // --- phase changes ---------------------------------------------------------

  /** The foe never falls to a blow: the film's ending decides it. */
  filter(src, tgt, amount, opts) {
    const a = super.filter(src, tgt, amount, opts);
    return tgt === this.foe ? Math.min(a, Math.max(0, this.foe.hp - 1)) : a;
  }

  phases(k) {
    if (this.game.cinema) return; // one scene at a time
    if (this.phase === 1 && k <= 0.55) {
      this.phase = 2;
      this.toRiver();
    } else if (this.phase === 2 && k <= 0.25) {
      this.phase = 3;
      this.startLock(true);
    } else if (this.phase === 3 && k <= 0.1 && !this.over) {
      this.over = true;
      this.ending();
    }
  }

  /** "From my point of view…": the fight moves onto the lava river. */
  toRiver() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.hold();
    ob.set('circle', 99);
    const say = (t, who, text, d) => ({ t, say: [S(who), text, d] });
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.6 },
      {
        t: 0.7,
        do: () => {
          p.x = raft.x - 1.4;
          p.y = raft.y + 0.9;
          ob.x = raft.x + 1.4;
          ob.y = raft.y - 0.9;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          p.setAnim('idle');
          ob.setAnim('idle');
          p.kx = p.ky = ob.kx = ob.ky = 0;
        },
        cam: { x: raft.x, y: raft.y, zoom: 1.5 },
      },
      { t: 0.8, fade: 0, fadeDur: 1.0 },
      say(1.6, 'obiwan', '내가 널 실망시켰구나, 아나킨. 내가 널 실망시켰어.', 3.2),
      say(5.0, 'anakin', '제다이가 권력을 노린다는 걸 진작 알았어야 했어!', 3.0),
      say(8.2, 'obiwan', '아나킨, 팰퍼틴 의장은 악이다!', 2.6),
      say(11.0, 'anakin', '내가 보기엔 제다이가 악이야!', 2.6),
      say(13.8, 'obiwan', '그렇다면 넌 길을 잃은 거다!', 2.4),
      say(16.4, 'anakin', '이걸로 끝이에요, 마스터.', 2.4),
      { t: 18.6, do: () => {} },
    ];
    new Cinema(g, { length: 18.8, cues }).play().then(() => this.fight());
  }

  // --- the ending (on the film's audio: 7:42 – 9:06) ------------------------

  ending() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.lock = null;
    g.emit('lock', false);
    this.hold();
    const say = (t, who, text, d) => ({ t, say: [S(who), text, d] });
    const foot = { x: bank.x - 0.4, y: bank.y - 3.4 }; // where Anakin falls, at the edge of the bank
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.5 },
      {
        t: 0.6,
        do: () => {
          ob.x = bank.x + 0.6;
          ob.y = bank.y - 0.6;
          p.x = raft.x;
          p.y = raft.y + 2.6;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          p.setAnim('idle');
          ob.setAnim('idle');
          p.kx = p.ky = ob.kx = ob.ky = 0;
        },
        cam: { x: (raft.x + bank.x) / 2, y: (raft.y + 2.6 + bank.y) / 2, zoom: 1.3 },
      },
      { t: 0.7, fade: 0, fadeDur: 1.6 },
      say(8.7, 'obiwan', '끝났다, 아나킨. 내가 더 높은 곳에 있다.', 3.2),
      say(12.2, 'anakin', '내 힘을 얕보지 마!', 2.8),
      say(17.5, 'obiwan', '그러지 마라.', 2.2),
      // the leap and the cut
      { t: 21.6, do: (c) => (p.setAnim('leap', 1, true), c.move(p, foot.x, foot.y, 0.7)) },
      { t: 22.1, do: () => ob.setAnim('attack2', 1.2, true) },
      {
        t: 22.4,
        do: () => {
          g.fx.sparks(p.x, p.y, 1.1, '#ffe0b0', 22, 4);
          g.fx.shake(10);
          g.audio.play('clash', p, { heavy: true });
          p.saberLit = false;
          p.setAnim('death', 0.6, true);
        },
      },
      { t: 22.6, fade: 0.85, fadeDur: 0.05 },
      { t: 22.8, fade: 0, fadeDur: 1.2, cam: { x: foot.x, y: foot.y - 0.4, zoom: 1.6, dur: 3 } },
      { t: 26, do: () => ob.setAnim('idle') },
      say(43.3, 'obiwan', '넌 선택받은 자였다!', 3.2),
      { t: 43.3, cam: { x: (foot.x + ob.x) / 2, y: (foot.y + ob.y) / 2, dur: 2 } },
      say(47.5, 'obiwan', '시스를 멸할 거라 했지, 그들과 손잡는 게 아니라!', 4.0),
      say(53.0, 'obiwan', '포스에 균형을 가져와야 했다… 어둠 속에 버려두는 게 아니라!', 4.6),
      say(70.8, 'anakin', '당신이 미워!', 2.6),
      { t: 70.8, cam: { x: foot.x, y: foot.y - 0.3, dur: 0.4 } },
      say(76.0, 'obiwan', '넌 내 형제였다, 아나킨… 널 사랑했다.', 4.2),
      { t: 76.0, cam: { x: ob.x, y: ob.y, dur: 1.5 } },
      // the lava catches him; Obi-Wan takes his saber and walks away
      {
        t: 79.4,
        do: (c) => {
          c.onFrame = () => {
            if (Math.random() < 0.6) g.fx.sparks(p.x + (Math.random() - 0.5) * 0.6, p.y + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, Math.random() < 0.5 ? '#ffb040' : '#ff5a20', 2, 1.6);
          };
          g.world.lights.push({ x: p.x, y: p.y, z: 0.5, r: 255, g: 120, b: 40, rad: 160, flicker: 0.3 });
        },
        cam: { x: foot.x, y: foot.y, dur: 2 },
      },
      { t: 81.4, do: (c) => (ob.setAnim('walk'), ob.faceTo(bank.x + 6, bank.y + 2), c.move(ob, bank.x + 6, bank.y + 2, 3)) },
      { t: 83.0, fade: 1, fadeDur: 1.4 },
    ];
    new Cinema(g, { track: 'mustafarEnd', length: 84.5, cues }).play().then(() => {
      this.over = false; // finish() sets it again and reports
      this.finish(true);
    });
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
    p.knock(a, 7);
    p.stun = Math.max(p.stun, 0.6);
    p.blocking = false;
    p.composure -= 22;
    p.composureT = g.time;
    p.setAnim('hurt', 0.8, true);
    g.damage(dk, p, 8, { type: 'duel' });
    if (Math.random() < 0.4) this.line('obiwan', 'push');
  }
}
