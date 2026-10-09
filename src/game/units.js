// Units: the player (Anakin), Separatist droids and Republic allies.
import { dist, angleDiff, rand, clamp } from '../core/math.js';
import { dirIndex } from '../core/iso.js';
import { SKILLS, isActive } from './skills.js';
import { StarCards } from './perks.js';

export const UNIT_DEFS = {
  player: { name: '아나킨 스카이워커', sprite: 'anakin', team: 'rep', radius: 0.35 },
  b1: { name: 'B1 전투 드로이드', sprite: 'b1', team: 'cis', hp: 22, dmg: [3, 5], range: 7, fireCd: [1.6, 2.6], speed: 2.3, xp: 10, radius: 0.32, burst: 1, droid: true, knockRes: 1 },
  b2: { name: 'B2 슈퍼 배틀 드로이드', sprite: 'b2', team: 'cis', hp: 75, dmg: [4, 7], range: 6, fireCd: [2.0, 2.8], speed: 1.8, xp: 30, radius: 0.42, burst: 3, droid: true, knockRes: 0.5 },
  clone: { name: '클론 트루퍼', sprite: 'clone', team: 'rep', hp: 60, dmg: [4, 6], range: 8, fireCd: [0.9, 1.4], speed: 4.0, radius: 0.33, burst: 1, knockRes: 1 },
  guard: { name: '501군단 경비병', sprite: 'clone', team: 'rep', hp: 140, dmg: [6, 9], range: 9, fireCd: [0.9, 1.3], speed: 3.5, radius: 0.33, burst: 1, knockRes: 1 },
  rex: { name: '렉스 대위', sprite: 'rex', team: 'rep', hp: 200, dmg: [8, 10], range: 8, fireCd: [0.3, 0.45], speed: 4.6, radius: 0.34, burst: 1, knockRes: 0.6 },
  r2: { name: 'R2-D2', sprite: 'r2', team: 'rep', hp: 150, speed: 4.6, radius: 0.3, knockRes: 0.3 },
  npc: { name: '', sprite: 'clone', team: 'rep', hp: 100, radius: 0.34, knockRes: 0 },
  dooku: { name: '두쿠 백작', sprite: 'dooku', team: 'cis', hp: 900, radius: 0.36, knockRes: 0.35 },
};

let NEXT_ID = 1;

export class Unit {
  constructor(game, kind, x, y, opts = {}) {
    const def = UNIT_DEFS[kind];
    this.game = game;
    this.id = NEXT_ID++;
    this.kind = kind;
    this.def = def;
    this.name = opts.name || def.name;
    this.sprite = def.sprite;
    this.team = def.team;
    this.x = x;
    this.y = y;
    this.z = 0;
    this.kx = 0; // knockback velocity
    this.ky = 0;
    this.radius = def.radius;
    this.facing = opts.facing ?? Math.random() * Math.PI * 2;
    this.level = opts.level || 1;
    this.maxHp = opts.hp || def.hp || 100;
    this.hp = this.maxHp;
    this.anim = 'idle';
    this.animT = Math.random() * 3;
    this.animSpeed = 1;
    this.stun = 0;
    this.flash = 0;
    this.dead = false;
    this.deathT = 0;
    this.remove = false;
    this.choke = null;
    this.elite = !!opts.elite;
    this.path = null;
    this.repath = 0;
    this.sleep = false;
  }

  get sprites() {
    return this.game.assets.sprites[this.sprite];
  }

  setAnim(name, speed = 1, restart = false) {
    if (this.anim !== name || restart) {
      this.anim = name;
      this.animT = 0;
    }
    this.animSpeed = speed;
  }

  animInfo() {
    const a = this.sprites.anims[this.anim];
    const raw = this.animT * a.fps * this.animSpeed;
    return { a, raw, done: !a.loop && raw >= a.frames, hit: raw >= (a.hit ?? a.frames / 2) };
  }

  frame() {
    const set = this.sprites;
    const a = set.anims[this.anim];
    const raw = this.animT * a.fps * this.animSpeed;
    const f = a.loop ? Math.floor(raw) % a.frames : Math.min(a.frames - 1, Math.floor(raw));
    return a.data[dirIndex(this.facing, set.dirs)][f];
  }

  faceTo(x, y) {
    if (x === this.x && y === this.y) return;
    this.facing = Math.atan2(y - this.y, x - this.x);
  }

  collides(x, y) {
    const r = this.radius * 0.85;
    const w = this.game.world;
    return w.isBlocked(x + r, y) || w.isBlocked(x - r, y) || w.isBlocked(x, y + r) || w.isBlocked(x, y - r);
  }

  /** Move by (dx, dy) with wall sliding. Returns true if blocked on any axis. */
  move(dx, dy) {
    let hit = false;
    if (!this.collides(this.x + dx, this.y)) this.x += dx;
    else hit = true;
    if (!this.collides(this.x, this.y + dy)) this.y += dy;
    else hit = true;
    return hit;
  }

  moveToward(tx, ty, speed, dt) {
    const d = dist(this.x, this.y, tx, ty);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    this.facing = Math.atan2(ty - this.y, tx - this.x);
    this.move(((tx - this.x) / d) * step, ((ty - this.y) / d) * step);
    return d <= speed * dt + 0.05;
  }

  /** Path-follow to (tx, ty). Returns true when arrived. */
  navigate(tx, ty, speed, dt, stopDist = 0.1) {
    const g = this.game;
    if (dist(this.x, this.y, tx, ty) <= stopDist) {
      this.path = null;
      return true;
    }
    this.repath -= dt;
    if (!this.path || this.repath <= 0 || !this.pathGoal || dist(this.pathGoal.x, this.pathGoal.y, tx, ty) > 1.5) {
      if (g.pathfinder.lineFree(this.x, this.y, tx, ty, this.radius * 0.8)) this.path = [{ x: tx, y: ty }];
      else this.path = g.pathfinder.find(this.x, this.y, tx, ty, 2500) || [{ x: tx, y: ty }];
      this.pathGoal = { x: tx, y: ty };
      this.repath = 0.6 + Math.random() * 0.4;
    }
    const wp = this.path[0];
    if (!wp) return true;
    const arrived = this.moveToward(wp.x, wp.y, speed, dt);
    if (arrived) {
      this.path.shift();
      if (!this.path.length) {
        this.path = null;
        return dist(this.x, this.y, tx, ty) <= stopDist + 0.3;
      }
    }
    return false;
  }

  knock(ang, power) {
    const res = this.def.knockRes ?? 1;
    this.kx += Math.cos(ang) * power * res;
    this.ky += Math.sin(ang) * power * res;
  }

  applyChoke(dur, dps, src) {
    this.choke = { t: dur, dps, src, acc: 0 };
    this.stun = Math.max(this.stun, dur);
  }

  physics(dt) {
    if (this.kx || this.ky) {
      const hit = this.move(this.kx * dt, this.ky * dt);
      if (hit && this.wallBonus && Math.hypot(this.kx, this.ky) > 3) {
        const wb = this.wallBonus;
        this.wallBonus = null;
        this.game.damage(wb.src, this, wb.amount, { type: 'force', noKnock: true });
        this.game.fx.dust(this.x, this.y, 6);
        this.game.fx.text(this.x, this.y, '충돌!', '#ffd27f');
      }
      const f = Math.pow(0.0025, dt);
      this.kx *= f;
      this.ky *= f;
      if (Math.abs(this.kx) < 0.05 && Math.abs(this.ky) < 0.05) {
        this.kx = this.ky = 0;
        this.wallBonus = null;
      }
    }
    if (this.choke) {
      const c = this.choke;
      c.t -= dt;
      c.acc += c.dps * dt;
      this.z += (0.9 - this.z) * Math.min(1, dt * 4);
      if (c.acc >= 4 || c.t <= 0) {
        this.game.damage(c.src, this, c.acc, { type: 'force', noKnock: true, quiet: c.t > 0 });
        c.acc = 0;
      }
      if (c.t <= 0 || this.dead) this.choke = null;
    } else if (this.z > 0 && !this.airborne) {
      this.z = Math.max(0, this.z - dt * 6);
    }
  }

  baseUpdate(dt) {
    this.animT += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.stun > 0) this.stun -= dt;
    this.physics(dt);
  }

  dieAnim() {
    this.setAnim('death', 1, true);
  }
}

// ----------------------------------------------------------------------------
// Ranged soldier AI shared by droids and clone troopers.

export class Soldier extends Unit {
  constructor(game, kind, x, y, opts = {}) {
    super(game, kind, x, y, opts);
    const def = this.def;
    const L = this.level;
    const scale = 1 + 0.38 * (L - 1);
    this.maxHp = Math.round((opts.hp || def.hp) * (def.team === 'cis' ? scale : 1) * (this.elite ? 2.6 : 1));
    this.hp = this.maxHp;
    const dScale = def.team === 'cis' ? 1 + 0.28 * (L - 1) : 1;
    this.dmg = opts.dmg ? [opts.dmg * 0.85, opts.dmg * 1.15] : [def.dmg[0] * dScale, def.dmg[1] * dScale];
    if (this.elite) this.dmg = this.dmg.map((v) => v * 1.5);
    this.home = { x, y };
    this.owner = opts.owner || null;
    this.guardPost = kind === 'guard' ? { x, y, facing: opts.facing ?? 0 } : null;
    this.fireT = rand(0.5, 1.5);
    this.burstLeft = 0;
    this.target = null;
    this.thinkT = Math.random() * 0.3;
    this.wanderT = rand(2, 6);
    this.wanderTo = null;
    this.camp = opts.camp || null;
    this.life = opts.life ?? null;
    this.formation = Math.random() * Math.PI * 2;
    this.alert = 0;
  }

  get xp() {
    return Math.round((this.def.xp || 0) * this.level * (this.elite ? 3 : 1));
  }

  pickTarget() {
    const g = this.game;
    const aggro = this.def.team === 'cis' ? (this.alert > 0 ? 16 : 10) : 10;
    let best = null;
    let bd = Infinity;
    for (const u of g.activeUnits) {
      if (u.dead || u.team === this.team || u.untargetable) continue;
      const d = dist(this.x, this.y, u.x, u.y);
      if (d > aggro) continue;
      if (this.owner && dist(u.x, u.y, this.owner.x, this.owner.y) > 14) continue;
      if (this.guardPost && dist(u.x, u.y, this.guardPost.x, this.guardPost.y) > 14) continue;
      const score = d - (u.kind === 'player' ? 2 : 0);
      if (score < bd) {
        bd = score;
        best = u;
      }
    }
    return best;
  }

  update(dt) {
    this.baseUpdate(dt);
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > (this.team === 'cis' ? 14 : 4)) this.remove = true;
      return;
    }
    if (this.life !== null) {
      this.life -= dt;
      if (this.life <= 0) {
        this.game.fx.dust(this.x, this.y, 8);
        this.remove = true;
        return;
      }
    }
    if (this.alert > 0) this.alert -= dt;
    if (this.stun > 0 || this.choke) {
      if (this.anim !== 'death') this.setAnim('idle', 0.3);
      return;
    }
    const g = this.game;
    this.fireT -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.3;
      if (!this.target || this.target.dead || dist(this.x, this.y, this.target.x, this.target.y) > 18) this.target = this.pickTarget();
      if (this.elite && !this.announced && this.target && this.target.kind === 'player') {
        this.announced = true;
        g.chatter('elite', 0.9);
      }
      if (this.lastAttacker && !this.lastAttacker.dead && this.lastAttacker.team !== this.team && !this.target) this.target = this.lastAttacker;
    }
    // Owner leash for summons.
    if (this.owner) {
      if (this.owner.dead) {
        this.remove = true;
        return;
      }
      const od = dist(this.x, this.y, this.owner.x, this.owner.y);
      if (od > 13) this.target = null;
    }

    // Shooting animation in progress.
    if (this.anim === 'shoot') {
      const info = this.animInfo();
      if (this.target && !this.target.dead) this.faceTo(this.target.x, this.target.y);
      if (info.hit && !this.shotFired) {
        this.shotFired = true;
        if (this.target && !this.target.dead) this.fireAt(this.target);
      }
      if (info.done) {
        if (this.burstLeft > 0 && this.target && !this.target.dead) {
          this.burstLeft--;
          this.setAnim('shoot', 1.6, true);
          this.shotFired = false;
        } else this.setAnim('idle');
      }
      return;
    }

    const speed = this.def.speed * (this.owner && dist(this.x, this.y, this.owner.x, this.owner.y) > 6 ? 1.5 : 1);
    if (this.target && !this.target.dead) {
      const t = this.target;
      const d = dist(this.x, this.y, t.x, t.y);
      const los = d < this.def.range && g.pathfinder.lineFree(this.x, this.y, t.x, t.y, 0.05);
      if (!los) {
        this.navigate(t.x, t.y, speed, dt, this.def.range * 0.7);
        this.setAnim('walk', speed / this.def.speed);
      } else if (this.fireT <= 0) {
        this.faceTo(t.x, t.y);
        this.setAnim('shoot', 1.3, true);
        this.shotFired = false;
        this.burstLeft = (this.def.burst || 1) - 1;
        this.fireT = rand(...this.def.fireCd);
      } else {
        this.faceTo(t.x, t.y);
        this.setAnim('idle');
      }
      return;
    }

    // No target: follow owner / return to post / wander around camp.
    if (this.owner) {
      const o = this.owner;
      const fx = o.x + Math.cos(this.formation) * 2.2;
      const fy = o.y + Math.sin(this.formation) * 2.2;
      if (dist(this.x, this.y, fx, fy) > 1.2) {
        this.navigate(fx, fy, speed, dt, 0.6);
        this.setAnim('walk', speed / this.def.speed);
      } else {
        this.setAnim('idle');
        this.facing += angleDiff(this.facing, o.facing) * Math.min(1, dt * 2);
      }
      return;
    }
    if (this.guardPost) {
      const p = this.guardPost;
      if (dist(this.x, this.y, p.x, p.y) > 0.4) {
        this.navigate(p.x, p.y, speed, dt, 0.3);
        this.setAnim('walk');
      } else {
        this.setAnim('idle');
        this.facing += angleDiff(this.facing, p.facing) * Math.min(1, dt * 3);
      }
      return;
    }
    this.wanderT -= dt;
    if (this.wanderTo) {
      if (this.navigate(this.wanderTo.x, this.wanderTo.y, speed * 0.5, dt, 0.3)) this.wanderTo = null;
      this.setAnim('walk', 0.6);
    } else {
      this.setAnim('idle');
      if (this.wanderT <= 0) {
        this.wanderT = rand(3, 8);
        const r = this.camp ? this.camp.radius + 2 : 3;
        const a = Math.random() * Math.PI * 2;
        const tx = this.home.x + Math.cos(a) * rand(0, r);
        const ty = this.home.y + Math.sin(a) * rand(0, r);
        if (!g.world.isBlocked(tx, ty)) this.wanderTo = { x: tx, y: ty };
      }
    }
  }

  fireAt(t) {
    const g = this.game;
    let dmg = rand(this.dmg[0], this.dmg[1]);
    const lead = 0.25 * (Math.random() - 0.5);
    const ang = Math.atan2(t.y - this.y, t.x - this.x) + lead * (this.team === 'cis' ? 1 : 0.4);
    const ox = this.x + Math.cos(this.facing) * 0.45;
    const oy = this.y + Math.sin(this.facing) * 0.45;
    if (this.kind === 'rex') {
      this.side = !this.side;
      const s = this.side ? 1 : -1;
      g.spawnBolt(this, ox + Math.cos(this.facing + Math.PI / 2) * 0.18 * s, oy + Math.sin(this.facing + Math.PI / 2) * 0.18 * s, ang, dmg);
    } else g.spawnBolt(this, ox, oy, ang, dmg);
    g.audio.play(this.team === 'cis' ? 'blasterCis' : 'blasterRep', this);
  }
}

// ----------------------------------------------------------------------------

export class R2Unit extends Unit {
  constructor(game, x, y, opts) {
    super(game, 'r2', x, y, opts);
    this.owner = opts.owner;
    this.skillLv = opts.level || 1;
    this.zapT = 1.5;
    this.untargetable = false;
  }
  update(dt) {
    this.baseUpdate(dt);
    if (this.dead) {
      this.remove = true;
      return;
    }
    const o = this.owner;
    if (!o || o.dead) {
      this.remove = true;
      return;
    }
    const L = this.skillLv;
    this.zapT -= dt;
    if (this.zapT <= 0) {
      this.zapT = 3;
      const g = this.game;
      let best = null;
      let bd = 4.5;
      for (const u of g.activeUnits) {
        if (u.dead || u.team === this.team) continue;
        const d = dist(this.x, this.y, u.x, u.y);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (best) {
        g.fx.lightning(this.x, this.y, 0.6, best.x, best.y, 1.0);
        g.damage(this, best, SKILLS.r2.zap(L), { type: 'shock', stun: 0.6 });
        g.audio.play('zap');
      }
      for (const u of g.activeUnits) {
        if (u.dead || u.team !== this.team || u === this) continue;
        if (dist(this.x, this.y, u.x, u.y) < 5 && u.hp < u.maxHp) {
          const h = u.kind === 'player' ? SKILLS.r2.heal(L) * 0.5 : SKILLS.r2.heal(L);
          u.hp = Math.min(u.maxHp, u.hp + h);
          g.fx.text(u.x, u.y, '+' + Math.round(h), '#7dff9a', 0.7);
        }
      }
    }
    if (this.stun > 0) return;
    const fx = o.x + Math.cos(o.facing + 2.4) * 1.6;
    const fy = o.y + Math.sin(o.facing + 2.4) * 1.6;
    const d = dist(this.x, this.y, fx, fy);
    if (d > 0.8) {
      const sp = d > 6 ? 7 : this.def.speed;
      this.navigate(fx, fy, sp, dt, 0.5);
      this.setAnim('walk');
    } else this.setAnim('idle');
  }
}

// ----------------------------------------------------------------------------
// The player: Anakin Skywalker.

const XP_TABLE = (lvl) => Math.floor(90 * Math.pow(lvl, 1.55));

export class Player extends Unit {
  constructor(game, x, y) {
    super(game, 'player', x, y, { facing: 0.8 });
    this.level = 1;
    this.xp = 0;
    this.xpNext = XP_TABLE(1);
    this.attr = { str: 20, agi: 20, vit: 20, for: 25 };
    this.attrPoints = 0;
    this.skillPoints = 1;
    this.skills = {};
    this.hotbar = [null, null, null, null, null, null];
    this.rmbSlot = 0;
    this.cooldowns = {};
    this.buffs = {};
    this.darkness = 0;
    this.bacta = 3;
    this.action = null;
    this.saberOut = false;
    this.saberColor = [60, 130, 255];
    this.saberLit = true;
    this.credits = 0;
    this.upgrades = { lens: 0, plate: 0 };
    this.cards = new StarCards(this);
    this.kills = 0;
    this.recalc(true);
  }

  skillLevel(id) {
    return this.skills[id] || 0;
  }

  /** Ignite or switch off the blade (X key, or automatically around fights). */
  setSaber(on) {
    if (on === this.saberLit || this.dead || this.saberOut) return;
    if (!on && this.game.duel) return; // the duel is all blade
    this.saberLit = on;
    this.game.audio.play(on ? 'ignite' : 'retract');
    this.setAnim(this.anim.replace(/Off$/, ''), this.animSpeed);
  }

  /** Blade-off variants of the walk/stand cycles, when the sprite has them. */
  setAnim(name, speed = 1, restart = false) {
    if (!this.saberLit && (name === 'idle' || name === 'run') && this.sprites.anims[name + 'Off']) name += 'Off';
    super.setAnim(name, speed, restart);
  }

  learn(id) {
    this.skills[id] = (this.skills[id] || 0) + 1;
    this.skillPoints--;
    if (isActive(id) && !this.hotbar.includes(id)) {
      const free = this.hotbar.indexOf(null);
      if (free >= 0) this.hotbar[free] = id;
    }
    this.recalc();
  }

  recalc(full = false) {
    const a = this.attr;
    const oldMax = this.maxHp;
    this.maxHp = Math.round(50 + a.vit * 4 + (this.level - 1) * 6 + this.upgrades.plate * 15);
    this.maxForce = Math.round(30 + a.for * 2 + (this.level - 1) * 2);
    if (full) {
      this.hp = this.maxHp;
      this.force = this.maxForce;
    } else if (oldMax) this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
    this.force = Math.min(this.force ?? this.maxForce, this.maxForce);
  }

  // --- derived stats ---------------------------------------------------------
  weaponRange() {
    return [6 + this.level * 1.2, 12 + this.level * 2];
  }
  weaponDamage() {
    const [lo, hi] = this.weaponRange();
    const strMult = 1 + this.attr.str * 0.015;
    const dark = 1 + this.darkness * 0.003;
    const cmd = 1 + this.skillLevel('command') * 0.01;
    const card = 1 + this.cards.value('aggressive') / 100;
    return rand(lo, hi) * strMult * dark * cmd * (1 + this.upgrades.lens * 0.06) * card * this.angerMult();
  }
  forceMult() {
    return (1 + this.attr.for * 0.012) * (1 + this.darkness * 0.003) * (1 + this.cards.value('forceMastery') / 100) * this.angerMult();
  }
  /** Star Card "분노의 힘": extra damage while the dark meter is high. */
  angerMult() {
    return this.darkness >= 50 ? 1 + this.cards.value('darkAnger') / 100 : 1;
  }
  /** Star Card "영웅의 기세": attack speed stacks from kills. */
  addMight() {
    if (!this.cards.value('heroicMight')) return;
    const b = this.buffs.might;
    this.addBuff('might', 8, { n: Math.min(5, (b ? b.n : 0) + 1) });
  }
  attackSpeed() {
    const might = this.buffs.might ? (this.buffs.might.n * this.cards.value('heroicMight')) / 100 : 0;
    return (1 + this.attr.agi * 0.006) * (1 + (this.buffs.speed ? this.buffs.speed.atk : 0)) * (1 + (this.buffs.spar ? this.buffs.spar.atk : 0)) * (1 + might);
  }
  moveSpeed() {
    let s = 4.6 * (1 + (this.buffs.speed ? this.buffs.speed.move : 0));
    if (this.buffs.barrier) s *= 0.75;
    return s;
  }
  deflectChance() {
    if (this.buffs.barrier) return 1;
    return Math.min(0.9, 0.12 + this.attr.agi * 0.003 + SKILLS.shien.deflect(this.skillLevel('shien')) / 100 + this.cards.value('shienMaster') / 100);
  }
  redirectChance() {
    if (this.buffs.barrier) return 1;
    return SKILLS.shien.redirect(this.skillLevel('shien')) / 100;
  }
  dodgeChance() {
    return (SKILLS.precog.dodge(this.skillLevel('precog')) + this.cards.value('foresight')) / 100;
  }
  critChance() {
    return 0.05 + SKILLS.precog.crit(this.skillLevel('precog')) / 100;
  }
  damageReduction() {
    return 0.1 + (this.buffs.barrier ? this.buffs.barrier.dr : 0) + this.cards.value('tenacity') / 100;
  }
  forceRegen() {
    return (1.6 + this.attr.for * 0.06) * (1 - this.darkness * 0.004) * (1 + this.cards.value('forceAttune') / 100);
  }
  hpRegen() {
    let r = 0.4 + this.attr.vit * 0.02;
    if (this.game.units.some((u) => u.kind === 'r2' && !u.remove)) r += 0.5 + this.skillLevel('r2') * 0.2;
    return r;
  }

  addBuff(name, dur, data = {}) {
    this.buffs[name] = { t: dur, dur, ...data };
  }
  addDarkness(n) {
    const before = this.darkness;
    this.darkness = clamp(this.darkness + n, 0, 100);
    if (before < 60 && this.darkness >= 60) this.game.say('dark');
  }

  gainXp(n) {
    if (this.dead) return;
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = XP_TABLE(this.level);
      this.attrPoints += 5;
      this.skillPoints += 1;
      this.recalc(true);
      this.game.onLevelUp();
    }
  }

  // --- actions -----------------------------------------------------------------
  /** Walking (click-to-move or joystick steering) can be interrupted freely. */
  get moving() {
    return !!this.action && (this.action.type === 'move' || this.action.type === 'steer');
  }

  get busy() {
    return !!this.action && !this.moving;
  }

  canAct() {
    return !this.dead && this.stun <= 0 && !this.choke && !(this.game.duel && this.game.duel.locked);
  }

  commandMove(x, y) {
    if (!this.canAct() || this.saberOut) return;
    if (this.action && !this.moving && this.action.type !== 'melee') return;
    if (this.action && this.action.type === 'melee' && this.action.phase === 'swing') {
      this.queued = { type: 'move', x, y };
      return;
    }
    if (this.action && this.action.type === 'move') {
      this.action.x = x;
      this.action.y = y;
      return;
    }
    this.action = { type: 'move', x, y };
    this.path = null;
  }

  /** Walk up to a friendly NPC, then open the conversation. */
  commandTalk(npc) {
    if (!this.canAct() || this.busy) return;
    this.action = { type: 'talk', target: npc };
    this.path = null;
  }

  /** Joystick movement: walk in a world-space direction with wall sliding. */
  steer(dx, dy) {
    if (!this.canAct() || this.saberOut) return;
    if (this.action && !this.moving) return;
    this.action = { type: 'steer', dx, dy };
  }

  stopSteer() {
    if (this.action && this.action.type === 'steer') this.action = null;
  }

  basicAttack(target, inPlace = false) {
    if (!this.canAct() || this.saberOut) return;
    this.setSaber(true);
    if (this.action && !this.moving) {
      if (this.action.type === 'melee' && this.action.phase === 'swing') this.queued = { type: 'attack', target };
      return;
    }
    // three-swing combo: horizontal slash, overhead strike, rising backhand
    this.combo = ((this.combo || 0) % 3) + 1;
    this.startMelee(target, [{ anim: 'attack' + this.combo, speed: 1.15, mult: this.combo === 3 ? 1.15 : 1 }], inPlace);
  }

  startMelee(target, hits, inPlace = false) {
    this.action = { type: 'melee', target, hits, i: 0, phase: 'approach', inPlace };
  }

  playAction(anim, speed = 1, tx = null, ty = null, onHit = null, onEnd = null) {
    if (tx !== null) this.faceTo(tx, ty);
    this.setAnim(anim, speed * (anim === 'cast' || anim === 'throw' ? Math.min(1.5, this.attackSpeed()) : 1), true);
    this.action = { type: 'anim', onHit, onEnd, fired: false };
  }

  leapTo(x, y, onLand) {
    this.faceTo(x, y);
    const d = dist(this.x, this.y, x, y);
    this.action = { type: 'leap', sx: this.x, sy: this.y, tx: x, ty: y, t: 0, dur: 0.45 + d * 0.03, onLand };
    this.setAnim('leap', 1, true);
    this.airborne = true;
    this.game.audio.play('leap');
  }

  startSpin(dur, mult) {
    this.action = { type: 'spin', t: 0, dur, mult, tick: 0 };
    this.setAnim('attack1', 2.4, true);
  }

  tryCast(id, tx, ty, target) {
    if (!id || !this.canAct()) return false;
    const s = SKILLS[id];
    const l = this.skillLevel(id);
    if (!l || !isActive(id) || this.saberOut) return false;
    if (this.action && !this.moving && this.action.type !== 'melee') return false;
    if (this.action && this.action.type === 'melee' && this.action.phase === 'swing') return false;
    if ((this.cooldowns[id] || 0) > 0) return false;
    const cost = s.cost ? s.cost(l) : 0;
    if (this.force < cost) {
      this.game.say('noForce');
      return false;
    }
    if (s.target === 'enemy' && !target) return false;
    this.setSaber(true);
    this.action = null;
    const ok = s.cast(this.game, this, l, tx, ty, target);
    if (ok) {
      this.force -= cost;
      const cd = (s.cd ? s.cd(l) : 0) * (1 - this.cards.value('focus') / 100);
      if (cd) this.cooldowns[id] = cd;
    }
    return ok;
  }

  update(dt) {
    this.baseUpdate(dt);
    if (this.dead) {
      this.deathT += dt;
      return;
    }
    const g = this.game;
    // regen, buffs, cooldowns, darkness decay
    this.hp = Math.min(this.maxHp, this.hp + this.hpRegen() * dt);
    this.force = Math.min(this.maxForce, this.force + this.forceRegen() * dt);
    this.darkness = Math.max(0, this.darkness - dt * 0.6);
    for (const [k, b] of Object.entries(this.buffs)) {
      b.t -= dt;
      if (b.t <= 0) delete this.buffs[k];
    }
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] -= dt;
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }
    if (this.stun > 0 || this.choke) {
      this.action = null;
      if (this.anim !== 'hurt' || this.animInfo().done) this.setAnim('idle', 0.3);
      return;
    }
    const duel = g.duel;
    if (duel && duel.lock) return this.setAnim('lock');
    if (duel && duel.locked && !this.action) {
      if (!(this.anim === 'hurt' && !this.animInfo().done)) this.setAnim('idle');
      return;
    }
    // duel guard: hold still behind the blade (a parry flourish plays through)
    if (this.blocking && !this.busy) {
      this.action = null;
      if (this.anim !== 'parry' || this.animInfo().done) this.setAnim('block');
      return;
    }

    const act = this.action;
    if (!act) {
      if (this.saberOut) {
        // hold the outstretched "catch" pose until the saber returns
        this.setAnim('throw');
        this.animT = 99;
      } else this.setAnim('idle');
      return;
    }
    switch (act.type) {
      case 'move': {
        const sp = this.moveSpeed();
        const arrived = this.navigate(act.x, act.y, sp, dt, 0.15);
        this.setAnim('run', sp / 4.6);
        if (arrived) {
          this.action = null;
          this.setAnim('idle');
        }
        break;
      }
      case 'talk': {
        const n = act.target;
        const sp = this.moveSpeed();
        if (this.navigate(n.x, n.y, sp, dt, 1.4)) {
          this.action = null;
          this.setAnim('idle');
          this.faceTo(n.x, n.y);
          g.talkTo(n);
        } else this.setAnim('run', sp / 4.6);
        break;
      }
      case 'steer': {
        const sp = this.moveSpeed();
        this.facing = Math.atan2(act.dy, act.dx);
        this.move(act.dx * sp * dt, act.dy * sp * dt);
        this.setAnim('run', sp / 4.6);
        break;
      }
      case 'melee': {
        const t = act.target;
        if (!t || t.dead) {
          if (act.phase !== 'swing') {
            this.action = null;
            break;
          }
        }
        const hit = act.hits[act.i];
        if (act.phase === 'approach') {
          const reach = this.radius + t.radius + 1.05;
          const d = dist(this.x, this.y, t.x, t.y);
          if (d > reach && !act.inPlace) {
            const sp = this.moveSpeed();
            this.navigate(t.x, t.y, sp, dt, reach * 0.9);
            this.setAnim('run', sp / 4.6);
          } else {
            this.faceTo(t.x, t.y);
            act.phase = 'swing';
            act.fired = false;
            this.setAnim(hit.anim, hit.speed * this.attackSpeed(), true);
            g.audio.play('swing');
          }
        } else {
          if (t && !t.dead) this.faceTo(t.x, t.y);
          const info = this.animInfo();
          if (info.hit && !act.fired) {
            act.fired = true;
            const reach = this.radius + (t ? t.radius : 0) + 1.5;
            if (t && !t.dead && dist(this.x, this.y, t.x, t.y) <= reach) {
              g.damage(this, t, this.weaponDamage() * hit.mult, { type: 'saber', stun: hit.stun });
              if (hit.onHit) hit.onHit(t);
            }
          }
          if (info.done) {
            act.i++;
            if (act.i < act.hits.length && t && !t.dead) {
              const nh = act.hits[act.i];
              act.fired = false;
              this.setAnim(nh.anim, nh.speed * this.attackSpeed(), true);
              g.audio.play('swing');
            } else {
              this.action = null;
              this.setAnim('idle');
              this.runQueued();
            }
          }
        }
        break;
      }
      case 'anim': {
        const info = this.animInfo();
        if (info.hit && !act.fired) {
          act.fired = true;
          if (act.onHit) act.onHit();
        }
        if (info.done) {
          this.action = null;
          if (act.onEnd) act.onEnd();
          if (!this.saberOut) this.setAnim('idle');
          this.runQueued();
        }
        break;
      }
      case 'leap': {
        act.t += dt;
        const k = Math.min(1, act.t / act.dur);
        this.x = act.sx + (act.tx - act.sx) * k;
        this.y = act.sy + (act.ty - act.sy) * k;
        this.z = Math.sin(k * Math.PI) * (1.4 + act.dur);
        const a = this.sprites.anims.leap;
        this.animT = (k * (a.frames - 0.01)) / a.fps;
        this.animSpeed = 1;
        if (k >= 1) {
          this.z = 0;
          this.airborne = false;
          this.action = null;
          act.onLand && act.onLand();
          this.setAnim('idle');
        }
        break;
      }
      case 'spin': {
        act.t += dt;
        act.tick -= dt;
        this.facing += dt * 16;
        const m = g.mouseWorld;
        if (m && dist(this.x, this.y, m.x, m.y) > 0.5) {
          const a = Math.atan2(m.y - this.y, m.x - this.x);
          const sp = this.moveSpeed() * 0.6 * dt;
          this.move(Math.cos(a) * sp, Math.sin(a) * sp);
        }
        if (this.anim !== 'attack1' || this.animInfo().done) this.setAnim('attack1', 2.4, true);
        if (act.tick <= 0) {
          act.tick = 0.25;
          g.audio.play('swing');
          for (const e of g.hostilesInRadius(this, this.x, this.y, 2.0)) {
            g.damage(this, e, this.weaponDamage() * act.mult, { type: 'saber', knock: { ang: Math.atan2(e.y - this.y, e.x - this.x), power: 2 } });
          }
          g.reflectBoltsInRadius(this, this.x, this.y, 1.6);
        }
        if (act.t >= act.dur) {
          this.action = null;
          this.setAnim('idle');
        }
        break;
      }
      default:
        this.action = null;
    }
  }

  runQueued() {
    const q = this.queued;
    this.queued = null;
    if (!q) return;
    if (q.type === 'move') this.commandMove(q.x, q.y);
    else if (q.type === 'attack' && q.target && !q.target.dead) this.basicAttack(q.target);
  }

  canDeflect() {
    if (this.dead || this.saberOut || !this.saberLit || this.stun > 0 || this.choke) return false;
    return true;
  }
}

