// Movie Duel #1 — Anakin vs Count Dooku, Geonosis hangar (Episode II). The
// Duel class holds the shared rules; duelMustafar.js extends it.
//
// Rules on top of the normal combat:
//   composure   both duellists have it; blocking costs it, at 0 the guard
//               breaks (stunned, takes extra damage)
//   block       hold RMB (touch: 막기). Blocking just before a strike lands
//               is a perfect parry: Dooku staggers and opens up for a riposte
//   saber lock  strikes that meet mid-swing bind the blades — mash attack
//   phases      60%: Obi-Wan throws Anakin his saber (dual wield)
//               25%: Dooku forces a saber lock, then fights desperately
import { Unit } from './units.js';
import { dist, angleDiff, rand } from '../core/math.js';
import { ARENA } from '../world/worldgen.js';
import { Cinema } from './cinema.js';

const PERFECT_WINDOW = 0.25;

/** Anakin's kit for the duel: level 12 with a fixed set of skills. */
export function equip(p) {
  p.level = 12;
  p.xp = 0;
  p.xpNext = 1e9; // no experience in the duel
  p.attr = { str: 45, agi: 42, vit: 44, for: 39 };
  p.attrPoints = 0;
  p.skillPoints = 0;
  p.skills = { flurry: 4, djemso: 4, signature: 4, push: 4, throw: 3, speed: 3, choke: 2, shien: 5, precog: 3 };
  p.hotbar = ['signature', 'flurry', 'djemso', 'push', 'throw', 'choke'];
  p.bacta = 0;
  p.recalc(true);
}

// ----------------------------------------------------------------------------

export class Dooku extends Unit {
  constructor(game, x, y, kind = 'dooku') {
    super(game, kind, x, y);
    this.name = '두쿠 백작';
    this.maxHp = this.hp = 900;
    this.saberColor = [255, 50, 40];
    this.saberCore = 'rgba(255,225,220,0.95)';
    this.composure = 100;
    this.state = 'idle';
    this.stateT = 1.2;
    this.combo = 0;
    this.lastHurtT = -9;
    this.blockChance = [0, 0.62, 0.5, 0.42]; // per phase
  }

  get duel() {
    return this.game.duel;
  }

  set(state, t) {
    this.state = state;
    this.stateT = t;
  }

  /** Begin a strike; `n` = 1 lunge, 2 flick, 3 backhand. */
  strike(n) {
    this.set('attack', 0);
    this.strikeN = n;
    this.struck = false;
    this.setAnim('attack' + n, 1, true);
    this.game.audio.play('swing', this, { heavy: n === 3 });
  }

  update(dt) {
    this.baseUpdate(dt);
    if (this.scripted) return;
    const g = this.game;
    const d = this.duel;
    const p = g.player;
    if (this.dead) return;
    if (this.composure < 100 && g.time - this.lastHurtT > 1.5) this.composure = Math.min(100, this.composure + dt * 10);
    if (d.locked || p.dead) {
      if (this.state !== 'lock') this.setAnim('idle');
      return;
    }
    this.stateT -= dt;
    const dd = dist(this.x, this.y, p.x, p.y);
    const face = () => this.faceTo(p.x, p.y);
    const aggression = d.phase === 3 ? 1.5 : d.phase === 2 ? 1.25 : 1;

    switch (this.state) {
      case 'broken':
      case 'stagger':
        this.setAnim('hurt', 0.35);
        if (this.stateT <= 0) {
          if (this.state === 'broken') this.composure = 60;
          this.set('idle', 0.4);
        }
        return;
      case 'parry':
        face();
        if (this.animInfo().done || this.stateT <= 0) {
          // Makashi riposte
          if (dd < 2.2 && Math.random() < 0.45 * aggression) this.strike(Math.random() < 0.5 ? 2 : 3);
          else this.set('idle', 0.3);
        }
        return;
      case 'attack': {
        face();
        const info = this.animInfo();
        if (this.strikeN === 1 && !this.struck) {
          // the lunge carries him forward
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          if (dd > 1.1) this.move(Math.cos(a) * dt * 3.2, Math.sin(a) * dt * 3.2);
        }
        if (info.hit && !this.struck) {
          this.struck = true;
          d.resolveStrike(this);
        }
        if (info.done && this.state === 'attack') {
          this.combo--;
          if (this.combo > 0 && dd < 2.4) this.strike(1 + Math.floor(Math.random() * 3));
          else this.set('circle', rand(0.5, 1.2) / aggression);
        }
        return;
      }
      case 'cast':
        face();
        this.setAnim('cast');
        d.lightning(this, dt, this.stateT > 1.6);
        if (this.stateT <= 0) this.set('circle', 0.8);
        return;
      default:
        break;
    }

    // Neutral: approach, circle, pick the next move.
    face();
    if (this.stateT > 0 && this.state === 'circle') {
      const a = Math.atan2(this.y - p.y, this.x - p.x) + dt * 0.9 * (this.circleDir || 1);
      const want = 2.4;
      const tx = p.x + Math.cos(a) * want;
      const ty = p.y + Math.sin(a) * want;
      this.move((tx - this.x) * Math.min(1, dt * 2.5), (ty - this.y) * Math.min(1, dt * 2.5));
      this.setAnim('walk', 0.8);
      return;
    }
    if (dd > 2.0) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.move(Math.cos(a) * dt * 2.8 * aggression, Math.sin(a) * dt * 2.8 * aggression);
      this.setAnim('walk', aggression);
      if (dd > 5.5 && d.phase >= 2 && Math.random() < dt * 0.6) this.startLightning();
      return;
    }
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    const r = Math.random();
    if (d.phase >= 2 && r < 0.14) this.startLightning();
    else if (r < 0.82) {
      this.combo = 1 + Math.floor(Math.random() * (d.phase === 1 ? 2 : 3));
      this.strike(dd > 1.7 ? 1 : 2 + Math.floor(Math.random() * 2));
    } else this.set('circle', rand(0.6, 1.4));
  }

  startLightning() {
    this.set('cast', 2.3); // 0.7 s wind-up, 1.6 s channel
    this.game.fx.text(this.x, this.y, '포스 번개!', '#c8a0ff', 1.1, 2.4);
    this.game.duel.line('dooku', 'lightning');
  }

  dieAnim() {
    this.setAnim('death', 1, true);
  }
}

/** A figure the cutscenes move (Padmé, Master Vael). */
export class Extra extends Unit {
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
  intro: [
    ['dooku', '혈기만 앞서는군, 젊은 제다이.'],
    ['obiwan', '아나킨, 혼자서는 안 돼! 함께 상대해야—'],
    ['anakin', '아뇨, 지금 끝장을 내겠습니다!'],
  ],
  lightning: [['dooku', '포스의 진정한 힘을 보여주지.']],
  phase2: [
    ['obiwan', '아나킨!'],
    ['anakin', '…좋아. 이제 두 자루다.'],
    ['dooku', '흥미롭군. 하지만 검이 하나 늘었다고 실력이 느는 건 아니지.'],
  ],
  phase3: [
    ['dooku', '장난은 여기까지다!'],
    ['anakin', '이번엔… 안 놓쳐!'],
  ],
  parry: [['dooku', '제법이군.'], ['dooku', '오비완에게서 배운 건가?'], ['dooku', '나쁘지 않아.']],
  broken: [['dooku', '크윽…!'], ['dooku', '이럴 수가…']],
};

const SPEAKERS = { anakin: '아나킨', dooku: '두쿠 백작', obiwan: '오비완', master: '세렌 베일' };

export class Duel {
  constructor(game) {
    this.game = game;
    this.lines = LINES;
    this.speakers = SPEAKERS;
    this.phase = 1;
    this.locked = true; // controls locked during cinematics
    this.cine = true;
    this.lock = null; // saber lock state
    this.stats = { t: 0, taken: 0, parries: 0, locksWon: 0 };
    this.over = false;
    const p = game.player;
    equip(p);
    p.composure = 100;
    this.setup();
  }

  /** Place the duellists (each duel overrides this). */
  setup() {
    const g = this.game;
    const p = g.player;
    p.x = ARENA.x - 3.6;
    p.y = ARENA.y + 3.2;
    const dk = (this.foe = new Dooku(g, ARENA.x + 2.6, ARENA.y - 2.4));
    dk.faceTo(p.x, p.y);
    p.faceTo(dk.x, dk.y);
    g.units.push(dk);
    this.hud = {
      kicker: 'MOVIE DUEL · EPISODE II',
      title: '지오노시스의 결투',
      name: '두쿠 백작',
      sub: '다스 티라누스 · 마카시',
      marks: [0.6, 0.25, 0.1],
      win: '아나킨은 오른팔을 잃었다. 마스터 세렌 베일이 두쿠를 막아섰지만, 백작은 어둠 속으로 빠져나갔다. 전쟁이 시작된다.',
      lose: '두쿠의 일격에 아나킨은 쓰러졌다. 격납고 입구에 마스터 세렌 베일이 모습을 드러낸다.',
    };
  }

  line(who, key) {
    const list = this.lines[key];
    const [w, text] = list[Math.floor(Math.random() * list.length)];
    this.game.emit('say', text, key, null, this.speakers[w || who]);
  }

  /** Play a scripted exchange of lines as a short cutscene. */
  scene(key, extra) {
    this.hold();
    const cues = [];
    let t = 0.4;
    for (const [w, text] of this.lines[key]) {
      const d = Math.min(3.6, 1.4 + text.length * 0.06);
      cues.push({ t, say: [this.speakers[w], text, d] });
      t += d;
      if (extra && extra[w]) cues.push({ t: t - 0.2, do: extra[w] });
    }
    return new Cinema(this.game, { length: t + 0.2, cues }).play().then(() => this.fight());
  }

  /** Puts both duellists under the cutscene's control. */
  hold() {
    const p = this.game.player;
    this.locked = this.cine = true;
    p.action = null;
    p.blocking = false;
    p.scripted = this.foe.scripted = true;
    if (!this.lock) for (const u of [p, this.foe]) u.setAnim('idle');
  }

  /** Back to the fight. */
  fight() {
    const g = this.game;
    for (const u of [g.player, this.foe]) u.scripted = false;
    g.player.action = null;
    if (this.foe.state !== 'lock') this.foe.set('circle', 1.2);
    this.locked = this.cine = false;
  }

  wait(sec) {
    return new Promise((res) => (this.waits ||= []).push({ t: sec, res }));
  }

  start() {
    this.started = true;
    this.intro().then(() => this.fight());
  }

  // --- the film's opening: Dooku's hangar --------------------------------------

  intro() {
    const g = this.game;
    const p = g.player;
    const dk = this.foe;
    const A = ARENA;
    // Obi-Wan stands beside Anakin at first; he ends up wounded by the wall
    const ob = (this.obiwan = g.units.find((u) => u.npcId === 'obiwan'));
    const obRest = { x: ob.x, y: ob.y };
    ob.scripted = true;
    ob.x = A.x - 2.4;
    ob.y = A.y + 2.2;
    ob.faceTo(dk.x, dk.y);
    ob.setAnim('idle');
    this.hold();
    const say = (t, who, text, d) => ({ t, say: [this.speakers[who], text, d] });
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      { t: 0.05, fade: 0, fadeDur: 1.6, cam: { x: A.x - 0.6, y: A.y + 0.6, zoom: 1.3 } },
      say(1.0, 'obiwan', '서두르지 마라. 둘이서 양쪽으로 몰아붙인다.', 2.4),
      say(3.3, 'anakin', '기다릴 시간 없어요. 먼저 갑니다!', 1.8),
      { t: 3.6, do: (c) => (p.setAnim('run', 1.2), c.move(p, A.x + 0.4, A.y - 0.4, 0.9)) },
      {
        t: 4.3,
        do: (c) => {
          dk.setAnim('cast');
          c.onFrame = () => g.fx.lightning(dk.x + Math.cos(dk.facing) * 0.5, dk.y + Math.sin(dk.facing) * 0.5, 1.2, p.x, p.y, 1.1);
          g.audio.play('zap');
        },
      },
      { t: 4.7, do: (c) => (p.setAnim('hurt', 0.6, true), c.move(p, A.x - 7.2, A.y + 5.2, 0.5), g.fx.shake(6)) },
      { t: 5.3, do: (c) => (c.onFrame = null, p.setAnim('death', 1, true), dk.setAnim('idle'), g.fx.dust(p.x, p.y, 8)) },
      say(6.4, 'dooku', '혈기만으로는 날 막을 수 없다. 물러서라, 케노비.', 3.0),
      { t: 6.4, cam: { x: (dk.x + ob.x) / 2, y: (dk.y + ob.y) / 2, dur: 1.2 } },
      say(9.6, 'obiwan', '그건 겨뤄 봐야 알겠지.', 1.6),
      // Obi-Wan's duel with Dooku, heard in the dark
      { t: 10.6, fade: 1, fadeDur: 0.4 },
      ...[11.1, 11.5, 12.0, 12.4].map((t) => ({ t, do: () => g.audio.play('clash', dk) })),
      {
        t: 12.9,
        do: () => {
          ob.x = obRest.x;
          ob.y = obRest.y;
          ob.setAnim('down');
          ob.restAnim = 'down';
          dk.x = obRest.x + 1.3;
          dk.y = obRest.y + 1.0;
          dk.faceTo(ob.x, ob.y);
        },
        cam: { x: obRest.x + 0.6, y: obRest.y + 1.2 },
      },
      { t: 13.0, fade: 0, fadeDur: 0.6 },
      { t: 14.0, do: () => dk.setAnim('attack3', 0.5, true) },
      { t: 14.2, do: (c) => (p.setAnim('leap', 1, true), p.faceTo(dk.x, dk.y), c.move(p, dk.x - 0.9, dk.y + 0.9, 0.6)) },
      {
        t: 14.8,
        do: () => {
          g.clash((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.3, 16);
          g.audio.play('lockStart', dk);
          p.setAnim('lock');
          dk.setAnim('lock');
        },
      },
      say(15.4, 'dooku', '쓰러진 스승을 지키러 왔나? 갸륵하지만 무모하군.', 3.6),
      say(19.2, 'anakin', '무모한 건 제 특기라서요.', 2.4),
      { t: 21.6, do: (c) => (g.audio.play('lockEnd', dk), c.move(dk, dk.x + 1.8, dk.y - 0.8, 0.4)) },
      { t: 22.1, do: () => (ob.scripted = false) },
    ];
    return new Cinema(g, { length: 22.2, cues }).play();
  }

  // --- the ending: Anakin's arm, then Master Vael ----------------------------

  ending() {
    const g = this.game;
    const p = g.player;
    const dk = this.foe;
    const A = ARENA;
    this.lock = null;
    g.emit('lock', false);
    this.hold();
    const master = new Extra(g, 'master', A.x + 9, A.y + 1);
    master.faceTo(A.x, A.y);
    master.setAnim('walk');
    g.units.push(master);
    g.updateActive();
    const say = (t, who, text, d) => ({ t, say: [this.speakers[who], text, d] });
    const cues = [
      { t: 0, fade: 1, fadeDur: 0.4 },
      {
        t: 0.5,
        do: () => {
          p.x = A.x - 0.9;
          p.y = A.y + 0.9;
          dk.x = A.x + 0.9;
          dk.y = A.y - 0.9;
          p.faceTo(dk.x, dk.y);
          dk.faceTo(p.x, p.y);
        },
        cam: { x: A.x, y: A.y, zoom: 1.4 },
      },
      { t: 0.6, fade: 0, fadeDur: 0.8 },
      { t: 1.4, do: () => dk.setAnim('attack1', 1, true) },
      {
        t: 1.75,
        do: () => {
          g.fx.sparks(p.x, p.y, 1.1, '#ffd0b0', 20, 4);
          g.fx.shake(9);
          g.audio.play('hit', p, { crit: true });
          p.saberLit = false;
          p.setAnim('death', 0.7, true);
        },
      },
      { t: 1.8, fade: 0.8, fadeDur: 0.05 },
      { t: 2.0, fade: 0, fadeDur: 1.0 },
      { t: 3.0, do: (c) => c.move(master, A.x + 5.2, A.y + 0.6, 2.5), cam: { x: A.x + 3, y: A.y + 0.2, dur: 2.5 } },
      { t: 5.5, do: () => (master.setAnim('idle'), dk.faceTo(master.x, master.y)) },
      say(5.6, 'dooku', '세렌 베일… 평의회가 직접 나섰나.', 2.2),
      say(7.8, 'master', '물러나라, 백작. 여기서 끝이다.', 2.2),
      say(10.2, 'dooku', '끝은 내가 정한다.', 3.0),
      {
        t: 13.6,
        do: (c) => {
          dk.setAnim('cast');
          master.setAnim('absorb');
          g.audio.play('zap');
          c.onFrame = () => g.fx.lightning(dk.x + Math.cos(dk.facing) * 0.5, dk.y + Math.sin(dk.facing) * 0.5, 1.2, master.x - 0.3, master.y, 0.5);
        },
      },
      { t: 15.4, do: (c) => (c.onFrame = null, dk.setAnim('idle')) },
      say(15.8, 'master', '분노로 쥔 힘은 오래가지 못한다.', 2.6),
      { t: 18.6, fade: 1, fadeDur: 1.4 },
    ];
    new Cinema(g, { length: 20.2, cues }).play().then(() => {
      this.over = false; // finish() reports
      this.finish(true);
    });
  }

  // --- combat resolution ---------------------------------------------------

  facing(a, b) {
    return Math.abs(angleDiff(a.facing, Math.atan2(b.y - a.y, b.x - a.x))) < 1.4;
  }

  /** Dooku's strike reaches its hit frame. */
  resolveStrike(dk) {
    const g = this.game;
    const p = g.player;
    const reach = dk.strikeN === 1 ? 2.6 : 2.0;
    if (p.dead || dist(dk.x, dk.y, p.x, p.y) > reach) return;
    // blades meet mid-swing → saber lock
    const a = p.action;
    if (a && a.type === 'melee' && a.phase === 'swing' && !a.fired && Math.random() < 0.55) return this.startLock();
    if (p.blocking && !p.busy && this.facing(p, dk)) {
      const perfect = g.time - p.blockT < PERFECT_WINDOW;
      g.clash((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.2, perfect ? 18 : 10);
      g.audio.play('clash', dk, { perfect });
      p.clashFlash = dk.clashFlash = 0.15;
      if (perfect) {
        this.stats.parries++;
        p.setAnim('parry', 1, true);
        p.blockT = -9;
        dk.composure -= 30;
        dk.lastHurtT = g.time;
        g.fx.text(p.x, p.y, '완벽한 흘리기!', '#ffe9a8', 1.1, 2.4);
        g.slowT = 0.35;
        if (dk.composure <= 0) this.breakGuard(dk);
        else {
          dk.set('stagger', 1.1);
          if (Math.random() < 0.35) this.line('dooku', 'parry');
        }
      } else {
        p.composure -= dk.strikeN === 1 ? 26 : 17;
        p.composureT = g.time;
        if (p.composure <= 0) this.breakGuard(p);
      }
      return;
    }
    const dmg = rand(13, 19) * (this.phase === 3 ? 1.25 : 1);
    g.damage(dk, p, dmg, { type: 'duel', knock: { ang: Math.atan2(p.y - dk.y, p.x - dk.x), power: dk.strikeN === 1 ? 3 : 1.5 } });
    if (!p.dead) {
      p.stun = Math.max(p.stun, 0.35);
      p.setAnim('hurt', 1, true);
    }
  }

  breakGuard(u) {
    const g = this.game;
    g.fx.text(u.x, u.y, '자세 붕괴!', '#ff9a6a', 1.25, 2.6);
    g.fx.shockwave(u.x, u.y, 1.2, '#ffd9a0', 0.4);
    g.audio.play('clash', u, { heavy: true });
    if (u === this.foe) {
      u.set('broken', 2.2);
      u.composure = 0;
      this.line('dooku', 'broken');
    } else {
      u.stun = 1.4;
      u.blocking = false;
      u.composure = 45;
      u.setAnim('hurt', 0.5, true);
    }
  }

  /** The foe never falls to a blow: the film's ending decides the duel. */
  filter(src, tgt, amount, opts) {
    const a = this.filterHit(src, tgt, amount, opts);
    return tgt === this.foe ? Math.min(a, Math.max(0, this.foe.hp - 1)) : a;
  }

  /** Damage dealt by anyone in the duel passes through here. */
  filterHit(src, tgt, amount, opts) {
    const g = this.game;
    const dk = this.foe;
    if (tgt === g.player) {
      this.stats.taken += amount;
      return amount;
    }
    if (tgt !== dk) return amount;
    dk.lastHurtT = g.time;
    if (dk.state === 'broken') return amount * 1.5;
    if (dk.state === 'stagger') return amount * 1.3;
    if (opts.type === 'force') {
      // Dooku shrugs off most Force attacks but they rattle him
      dk.choke = null;
      dk.stun = 0;
      dk.composure -= 18;
      if (dk.composure <= 0) this.breakGuard(dk);
      g.fx.text(dk.x, dk.y, '저항', '#c8a0ff', 0.8);
      return amount * 0.35;
    }
    if (dk.state === 'attack' && !dk.struck) {
      if (Math.random() < 0.4) {
        this.startLock();
        return 0;
      }
      return amount;
    }
    const blockChance = dk.blockChance[this.phase];
    if (dk.state !== 'cast' && Math.random() < blockChance) {
      dk.set('parry', 0.5);
      dk.setAnim('parry', 1, true);
      dk.composure -= Math.min(22, amount * 0.6) * (opts.pressure || 1); // the signature onslaught wears the guard down
      dk.clashFlash = 0.15;
      g.clash(dk.x + Math.cos(dk.facing) * 0.4, dk.y + Math.sin(dk.facing) * 0.4, 1.2, 9);
      g.audio.play('clash', dk);
      g.fx.text(dk.x, dk.y, '막음', '#d8dde4', 0.7);
      if (dk.composure <= 0) this.breakGuard(dk);
      return 0;
    }
    if (dk.state === 'cast') dk.set('circle', 0.6); // interrupts the lightning
    return amount;
  }

  /** Force lightning channel; blocked on the blade when guarding. */
  lightning(dk, dt, windup) {
    if (windup) return;
    const g = this.game;
    const p = g.player;
    dk.zapT = (dk.zapT || 0) - dt;
    if (dk.zapT > 0) return;
    dk.zapT = 0.09;
    const hx = dk.x + Math.cos(dk.facing) * 0.5;
    const hy = dk.y + Math.sin(dk.facing) * 0.5;
    if (p.blocking && !p.busy && this.facing(p, dk)) {
      g.fx.lightning(hx, hy, 1.2, p.x + Math.cos(p.facing) * 0.5, p.y + Math.sin(p.facing) * 0.5, 1.4);
      p.composure -= 2.4;
      p.composureT = g.time;
      p.clashFlash = 0.1;
      if (p.composure <= 0) this.breakGuard(p);
    } else {
      g.fx.lightning(hx, hy, 1.2, p.x, p.y, 1.1);
      g.damage(dk, p, 2.1, { type: 'duel', quiet: true });
      p.stun = Math.max(p.stun, 0.15);
      if (p.anim !== 'hurt') p.setAnim('hurt', 0.6, true);
    }
    g.audio.play('zap');
  }

  // --- saber lock ------------------------------------------------------------

  startLock(scripted = false) {
    const g = this.game;
    const p = g.player;
    const dk = this.foe;
    if (this.lock || p.dead) return;
    // bring them face to face
    const a = Math.atan2(dk.y - p.y, dk.x - p.x);
    const mx = (p.x + dk.x) / 2;
    const my = (p.y + dk.y) / 2;
    p.x = mx - Math.cos(a) * 0.55;
    p.y = my - Math.sin(a) * 0.55;
    dk.x = mx + Math.cos(a) * 0.55;
    dk.y = my + Math.sin(a) * 0.55;
    p.facing = a;
    dk.facing = a + Math.PI;
    p.action = null;
    p.blocking = false;
    p.setAnim('lock', 1, true);
    dk.set('lock', 99);
    dk.setAnim('lock', 1, true);
    this.lock = { v: 0.5, t: 0, push: scripted ? 0.34 : 0.26 + this.phase * 0.04 };
    this.locked = true;
    g.audio.play('lockStart', dk);
    g.emit('lock', true);
  }

  /** One mash press during a saber lock. */
  press() {
    if (!this.lock) return false;
    this.lock.v += 0.075;
    this.game.audio.play('lockPush', this.foe);
    return true;
  }

  updateLock(dt) {
    const L = this.lock;
    const g = this.game;
    const p = g.player;
    const dk = this.foe;
    L.t += dt;
    L.v -= L.push * dt;
    if ((L.t * 12) % 1 < 0.2) g.fx.sparks((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.45, '#ffe0c0', 1, 2);
    if (L.v < 1 && L.v > 0 && L.t < 6) return;
    const won = L.v >= 1 || (L.t >= 6 && L.v >= 0.5);
    this.lock = null;
    this.locked = false;
    g.emit('lock', false);
    g.fx.shockwave((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.6, '#ffe8c0', 0.45);
    g.audio.play('lockEnd', dk);
    const a = Math.atan2(dk.y - p.y, dk.x - p.x);
    if (won) {
      this.stats.locksWon++;
      dk.set('broken', 1.8);
      dk.knock(a, 5);
      g.fx.text(dk.x, dk.y, '칼날 겨루기 승리!', '#ffe9a8', 1.2, 2.4);
      g.damage(p, dk, 45, { type: 'duel' });
      p.setAnim('idle');
    } else {
      dk.set('circle', 0.5);
      p.knock(a + Math.PI, 6);
      p.stun = 0.8;
      p.setAnim('hurt', 0.6, true);
      g.damage(dk, p, 16, { type: 'duel' });
    }
  }

  // --- per frame -----------------------------------------------------------

  update(dt) {
    const g = this.game;
    const p = g.player;
    const dk = this.foe;
    for (const w of this.waits || []) w.t -= dt;
    for (const w of (this.waits || []).filter((x) => x.t <= 0)) w.res();
    this.waits = (this.waits || []).filter((x) => x.t > 0);
    if (this.over) return;
    if (!this.cine) this.stats.t += dt;
    if (this.lock) this.updateLock(dt);
    if (p.composure < 100 && g.time - (p.composureT || 0) > 1.6 && !p.blocking) p.composure = Math.min(100, p.composure + dt * 14);

    this.phases(dk.hp / dk.maxHp);
    if (dk.dead && !this.over) this.finish(true);
    else if (p.dead && !this.over) this.finish(false);
  }

  /** Phase changes by the foe's remaining health `k` (the film's beats). */
  phases(k) {
    if (this.game.cinema) return; // one scene at a time
    if (this.phase === 1 && k <= 0.6) {
      this.phase = 2;
      this.toPhase2();
    } else if (this.phase === 2 && k <= 0.25) {
      this.phase = 3;
      this.scene('phase3').then(() => this.startLock(true));
    } else if (this.phase === 3 && k <= 0.1 && !this.over && !this.lock) {
      this.over = true;
      this.ending();
    }
  }

  toPhase2() {
    const g = this.game;
    const p = g.player;
    const ob = g.units.find((u) => u.npcId === 'obiwan');
    p.action = null;
    p.blocking = false;
    this.foe.set('circle', 4);
    this.scene('phase2', {
      obiwan: () => {
        // Obi-Wan slides his saber across the floor to Anakin
        if (ob) g.fx.lightning(ob.x, ob.y, 0.3, p.x, p.y, 0.6);
        p.sprite = 'anakinDual';
        p.dual = true;
        g.fx.ring(p.x, p.y, 0.8, '#9fdcff', 0.5);
        g.audio.play('ignite');
      },
    });
  }

  finish(won) {
    this.over = true;
    this.locked = true;
    const g = this.game;
    const s = this.stats;
    const p = g.player;
    const score = 55 + s.parries * 6 + s.locksWon * 6 - (s.taken / p.maxHp) * 35 - Math.max(0, s.t - 100) / 3;
    this.result = { won, rank: !won ? '-' : score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 52 ? 'B' : 'C', ...s, hpLeft: Math.max(0, p.hp / p.maxHp) };
    setTimeout(() => g.emit('duelEnd', this.result), won ? 1800 : 2200);
  }
}
