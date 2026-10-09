// Movie Duel #1 — Anakin vs Count Dooku, Geonosis hangar (Episode II).
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

const PERFECT_WINDOW = 0.25;

/** Anakin's kit for the duel: level 12 with a fixed set of skills. */
function equip(p) {
  p.level = 12;
  p.xp = 0;
  p.xpNext = 1e9; // no experience in the duel
  p.attr = { str: 45, agi: 42, vit: 44, for: 39 };
  p.attrPoints = 0;
  p.skillPoints = 0;
  p.skills = { flurry: 4, djemso: 4, push: 4, throw: 3, speed: 3, choke: 2, shien: 5, precog: 3 };
  p.hotbar = ['flurry', 'djemso', 'push', 'throw', 'speed', 'choke'];
  p.bacta = 0;
  p.recalc(true);
}

// ----------------------------------------------------------------------------

export class Dooku extends Unit {
  constructor(game, x, y) {
    super(game, 'dooku', x, y);
    this.name = '두쿠 백작';
    this.maxHp = this.hp = 900;
    this.saberColor = [255, 50, 40];
    this.saberCore = 'rgba(255,225,220,0.95)';
    this.composure = 100;
    this.state = 'idle';
    this.stateT = 1.2;
    this.combo = 0;
    this.lastHurtT = -9;
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
    this.game.audio.play('swing');
  }

  update(dt) {
    this.baseUpdate(dt);
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

// ----------------------------------------------------------------------------

const LINES = {
  intro: [
    ['dooku', '용감하군, 젊은 제다이. 하지만 어리석어. 진작 배웠어야 할 텐데.'],
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

const SPEAKERS = { anakin: '아나킨', dooku: '두쿠 백작', obiwan: '오비완' };

export class Duel {
  constructor(game) {
    this.game = game;
    this.phase = 1;
    this.locked = true; // controls locked during cinematics
    this.cine = true;
    this.lock = null; // saber lock state
    this.stats = { t: 0, taken: 0, parries: 0, locksWon: 0 };
    this.over = false;
    const p = game.player;
    equip(p);
    p.composure = 100;
    p.x = ARENA.x - 2.2;
    p.y = ARENA.y + 2.2;
    p.faceTo(ARENA.x, ARENA.y);
    const dk = (this.dooku = new Dooku(game, ARENA.x + 2.2, ARENA.y - 2.2));
    dk.faceTo(p.x, p.y);
    game.units.push(dk);
  }

  line(who, key) {
    const list = LINES[key];
    const [w, text] = list[Math.floor(Math.random() * list.length)];
    this.game.emit('say', text, key, null, SPEAKERS[w || who]);
  }

  /** Play a scripted exchange of lines; controls stay locked meanwhile. */
  async scene(key, extra) {
    this.locked = this.cine = true;
    this.game.emit('cine', true);
    for (const [w, text] of LINES[key]) {
      this.game.emit('say', text, key, null, SPEAKERS[w]);
      await this.wait(Math.min(3.6, 1.4 + text.length * 0.06));
      if (extra && extra[w]) extra[w]();
    }
    this.locked = this.cine = false;
    this.game.emit('cine', false);
  }

  wait(sec) {
    return new Promise((res) => (this.waits ||= []).push({ t: sec, res }));
  }

  start() {
    this.started = true;
    this.scene('intro');
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
      g.fx.sparks((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.2, '#fff2c8', perfect ? 18 : 9, 3);
      g.audio.play('clash');
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
    g.audio.play('clash');
    if (u === this.dooku) {
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

  /** Damage dealt by anyone in the duel passes through here. */
  filter(src, tgt, amount, opts) {
    const g = this.game;
    const dk = this.dooku;
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
    const blockChance = [0, 0.62, 0.5, 0.42][this.phase];
    if (dk.state !== 'cast' && Math.random() < blockChance) {
      dk.set('parry', 0.5);
      dk.setAnim('parry', 1, true);
      dk.composure -= Math.min(22, amount * 0.6);
      dk.clashFlash = 0.15;
      g.fx.sparks(dk.x, dk.y, 1.2, '#ffd8c8', 7, 2.5);
      g.audio.play('clash');
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
    const dk = this.dooku;
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
    g.audio.play('clash');
    g.emit('lock', true);
  }

  /** One mash press during a saber lock. */
  press() {
    if (!this.lock) return false;
    this.lock.v += 0.075;
    this.game.audio.play('swing');
    return true;
  }

  updateLock(dt) {
    const L = this.lock;
    const g = this.game;
    const p = g.player;
    const dk = this.dooku;
    L.t += dt;
    L.v -= L.push * dt;
    if ((L.t * 12) % 1 < 0.2) g.fx.sparks((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.45, '#ffe0c0', 1, 2);
    if (L.v < 1 && L.v > 0 && L.t < 6) return;
    const won = L.v >= 1 || (L.t >= 6 && L.v >= 0.5);
    this.lock = null;
    this.locked = false;
    g.emit('lock', false);
    g.fx.shockwave((p.x + dk.x) / 2, (p.y + dk.y) / 2, 1.6, '#ffe8c0', 0.45);
    g.audio.play('clash');
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
    const dk = this.dooku;
    for (const w of this.waits || []) w.t -= dt;
    for (const w of (this.waits || []).filter((x) => x.t <= 0)) w.res();
    this.waits = (this.waits || []).filter((x) => x.t > 0);
    if (this.over) return;
    if (!this.cine) this.stats.t += dt;
    if (this.lock) this.updateLock(dt);
    if (p.composure < 100 && g.time - (p.composureT || 0) > 1.6 && !p.blocking) p.composure = Math.min(100, p.composure + dt * 14);

    const k = dk.hp / dk.maxHp;
    if (this.phase === 1 && k <= 0.6) {
      this.phase = 2;
      this.toPhase2();
    } else if (this.phase === 2 && k <= 0.25) {
      this.phase = 3;
      this.scene('phase3').then(() => this.startLock(true));
    }
    if (dk.dead && !this.over) this.finish(true);
    else if (p.dead && !this.over) this.finish(false);
  }

  toPhase2() {
    const g = this.game;
    const p = g.player;
    const ob = g.units.find((u) => u.npcId === 'obiwan');
    p.action = null;
    p.blocking = false;
    this.dooku.set('circle', 4);
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
