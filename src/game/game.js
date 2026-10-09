// Game simulation: world, units, projectiles, combat rules, camps, loot.
import { World } from '../world/worldgen.js';
import { PathFinder } from '../world/pathfind.js';
import { Effects } from '../gfx/fx.js';
import { Player, Soldier, R2Unit } from './units.js';
import { SKILLS } from './skills.js';
import { dist, rand, chance, angleDiff } from '../core/math.js';
import { LINES } from './lines.js';
import { NPC, NPC_DEFS, TALK_RANGE } from './npc.js';
import { QuestLog } from './quests.js';
import { BASE_POS, Arena, ARENA, MustafarArena } from '../world/worldgen.js';
import { Duel } from './duel.js';
import { MustafarDuel } from './duelMustafar.js';

const ELITE_NAMES = ['OOM 지휘관 드로이드', '전투 드로이드 분대장', '전술 사령 드로이드 T-7', '돌격 지휘 드로이드'];

export class Game {
  constructor(assets, audio, mode = 'campaign', duel = 'geonosis') {
    this.assets = assets;
    this.audio = audio;
    this.mode = mode;
    this.world = mode !== 'duel' ? new World(501) : duel === 'mustafar' ? new MustafarArena(66) : new Arena(77);
    this.pathfinder = new PathFinder(this.world);
    this.fx = new Effects();
    this.units = [];
    this.activeUnits = [];
    this.bolts = [];
    this.throws = [];
    this.pickups = [];
    this.strikes = [];
    this.time = 0;
    this.mouseWorld = null;
    this.hover = null;
    this.listeners = {};
    this.cheats = { god: false, force: false, cd: false }; // debug panel toggles
    this.region = '';
    this.exploreT = 0;
    this.campT = 0;

    const sp = this.world.spawn;
    this.player = new Player(this, sp.x, sp.y);
    this.units.push(this.player);
    this.audio.listener = this.player;
    this.quests = new QuestLog(this);
    this.talkingTo = null;
    if (mode === 'duel' && duel === 'mustafar') {
      this.duel = new MustafarDuel(this);
      this.updateActive();
      return;
    }
    if (mode === 'duel') {
      // Obi-Wan lies wounded by the wall, as in the film
      const ob = new NPC(this, 'obiwan', ARENA.x - 4.5, ARENA.y - 4.5);
      ob.restAnim = 'down';
      ob.npc = false;
      this.units.push(ob);
      this.duel = new Duel(this);
      this.updateActive();
      return;
    }
    for (const gd of this.world.guards) {
      this.units.push(new Soldier(this, 'guard', gd.x, gd.y, { facing: gd.facing }));
    }
    for (const camp of this.world.camps) this.spawnCamp(camp);
    // the small camp just west of the base is the tutorial target
    const tut = this.world.camps.filter((c) => !c.boss).sort((a, b) => dist(a.x, a.y, BASE_POS.x, BASE_POS.y) - dist(b.x, b.y, BASE_POS.x, BASE_POS.y))[0];
    if (tut) tut.tutorial = true;
    for (const [id, d] of Object.entries(NPC_DEFS)) {
      const f = this.pathfinder.nearestFree(Math.floor(BASE_POS.x + d.pos[0]), Math.floor(BASE_POS.y + d.pos[1]), 4);
      this.units.push(new NPC(this, id, f[0] + 0.5, f[1] + 0.5));
    }
    this.updateActive();
  }

  nearestNpc(range = TALK_RANGE) {
    const p = this.player;
    let best = null;
    let bd = range;
    for (const u of this.activeUnits) {
      if (!u.npc) continue;
      const d = dist(u.x, u.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  talkTo(npc) {
    if (this.player.dead) return;
    this.talkingTo = npc;
    this.emit('dialogue', npc);
  }

  endTalk() {
    this.talkingTo = null;
  }

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
  }
  emit(evt, ...args) {
    for (const fn of this.listeners[evt] || []) fn(...args);
  }

  /**
   * Anakin speaks: a voice clip from the user's sound bank if one exists for
   * this key (its own subtitle text wins), otherwise a subtitle-only line.
   */
  say(key) {
    const list = LINES[key];
    const clip = this.audio.voice(key);
    if (!clip && !list) return;
    const text = (clip && clip.text) || (list ? list[Math.floor(Math.random() * list.length)] : '');
    this.nextChatter = this.time + 7;
    if (text) this.emit('say', text, key, clip ? clip.duration : null);
  }

  /** Optional ambient remark: rate-limited and random, never interrupts. */
  chatter(key, chance = 1) {
    if (this.time < (this.nextChatter || 0) || Math.random() > chance) return;
    this.say(key);
  }

  // ------------------------------------------------------------------ spawning

  spawnCamp(camp) {
    camp.alive = [];
    camp.cleared = false;
    const place = () => {
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = rand(0.5, camp.radius + 1.5);
        const x = camp.x + Math.cos(a) * r;
        const y = camp.y + Math.sin(a) * r;
        if (!this.world.isBlocked(x, y)) return { x, y };
      }
      const f = this.pathfinder.nearestFree(Math.floor(camp.x), Math.floor(camp.y), 8);
      return f ? { x: f[0] + 0.5, y: f[1] + 0.5 } : { x: camp.x, y: camp.y };
    };
    const eliteIdx = camp.level >= 2 || camp.boss ? Math.floor(Math.random() * (camp.b1 + camp.b2)) : -1;
    let n = 0;
    for (const [kind, count] of [['b1', camp.b1], ['b2', camp.b2]]) {
      for (let i = 0; i < count; i++) {
        const p = place();
        const elite = n === eliteIdx;
        const opts = { level: camp.level, camp, elite };
        if (elite) opts.name = camp.boss ? '드로이드 공장 수호자' : ELITE_NAMES[Math.floor(Math.random() * ELITE_NAMES.length)];
        const u = new Soldier(this, kind, p.x, p.y, opts);
        if (elite && camp.boss) {
          u.maxHp *= 2;
          u.hp = u.maxHp;
        }
        this.units.push(u);
        camp.alive.push(u);
        n++;
      }
    }
  }

  spawnAlly(kind, x, y, opts) {
    const u = kind === 'r2' ? new R2Unit(this, x, y, opts) : new Soldier(this, kind, x, y, opts);
    u.facing = this.player.facing;
    this.units.push(u);
    this.activeUnits.push(u);
    return u;
  }

  spawnBolt(owner, x, y, ang, dmg) {
    const speed = owner.team === 'cis' ? 13 : 17;
    this.bolts.push({
      x, y, z: 1.15, ang, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      team: owner.team, owner, dmg, life: 1.4, deflected: false,
      color: owner.team === 'cis' ? 'red' : 'blue',
    });
  }

  spawnSaberThrow(p, tx, ty, range, mult) {
    const ang = Math.atan2(ty - p.y, tx - p.x);
    p.saberOut = true;
    this.throws.push({ x: p.x, y: p.y, z: 1.1, ang, travelled: 0, range, out: true, mult, hit: new Set(), spin: 0, owner: p });
    this.audio.play('swing', p, { heavy: true, rate: 0.85 });
  }

  callGunship(p, tx, ty, dmg) {
    const ang = Math.atan2(ty - p.y, tx - p.x) + rand(-0.3, 0.3);
    const missiles = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 3.5;
      missiles.push({ t: 1.6 + i * 0.1 + rand(0, 0.05), x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, done: false });
    }
    this.strikes.push({ t: 0, tx, ty, ang, dmg, owner: p, missiles, life: 3.6 });
    this.audio.play('gunship');
  }

  dropLoot(u) {
    const r = Math.random();
    const drop = (type) => this.pickups.push({ type, x: u.x + rand(-0.3, 0.3), y: u.y + rand(-0.3, 0.3), t: 0 });
    if (u.elite) {
      drop('holocron');
      drop('bacta');
      return;
    }
    if (r < 0.1) drop('bacta');
    else if (r < 0.26) drop('forceShard');
  }

  // ------------------------------------------------------------------ queries

  hostilesInRadius(src, x, y, r) {
    const out = [];
    for (const u of this.activeUnits) {
      if (u.dead || u.team === src.team || u.untargetable) continue;
      if (dist(x, y, u.x, u.y) <= r + u.radius) out.push(u);
    }
    return out;
  }

  findLandingSpot(x, y) {
    if (!this.world.isBlocked(x, y)) return { x, y };
    const f = this.pathfinder.nearestFree(Math.floor(x), Math.floor(y), 4);
    return f ? { x: f[0] + 0.5, y: f[1] + 0.5 } : null;
  }

  // ------------------------------------------------------------------ combat

  damage(src, tgt, amount, opts = {}) {
    if (!tgt || tgt.dead || amount <= 0) return 0;
    if (this.duel) {
      amount = this.duel.filter(src, tgt, amount, opts);
      if (amount <= 0) return 0;
    }
    const p = this.player;
    if (tgt === p && this.cheats.god) return 0; // debug: invincible
    let crit = false;
    if (tgt === p && (opts.type === 'blaster' || opts.type === 'melee') && chance(p.dodgeChance())) {
      this.fx.text(tgt.x, tgt.y, '회피', '#c8e4ff', 0.9);
      return 0;
    }
    if (src === p) {
      if (opts.type === 'saber' && chance(p.critChance())) {
        amount *= 1.75;
        crit = true;
      }
      if (tgt.def.droid) {
        amount *= 1 + p.cards.value('droidSlayer') / 100;
        const ml = p.skillLevel('mechanic');
        if (ml) {
          amount *= 1 + SKILLS.mechanic.bonus(ml) / 100;
          if (chance(SKILLS.mechanic.sc(ml) / 100)) {
            tgt.stun = Math.max(tgt.stun, 1.5);
            this.fx.lightning(tgt.x - 0.3, tgt.y, 1.4, tgt.x + 0.3, tgt.y, 0.6);
            this.fx.text(tgt.x, tgt.y, '회로 과부하!', '#9fdcff', 0.85, 2.3);
          }
        }
      }
    } else if (src && src.team === 'rep' && src !== p) {
      const cl = p.skillLevel('command');
      if (cl) amount *= 1 + SKILLS.command.dmg(cl) / 100;
      if (src.owner === p) amount *= 1 + p.cards.value('legionBond') / 100;
    }
    if (tgt === p) amount *= 1 - p.damageReduction();
    else if (tgt.team === 'rep') {
      const cl = p.skillLevel('command');
      if (cl) amount *= 1 - SKILLS.command.dr(cl) / 100;
    }
    amount = Math.max(1, Math.round(amount));
    tgt.hp -= amount;
    tgt.flash = 0.12;
    if (src && src !== tgt) {
      tgt.lastAttacker = src;
      if (tgt.camp) for (const u of tgt.camp.alive) u.alert = 6;
    }
    if (opts.stun) tgt.stun = Math.max(tgt.stun, opts.stun);
    if (opts.knock && !opts.noKnock) {
      tgt.knock(opts.knock.ang, opts.knock.power);
      if (opts.wallBonus) tgt.wallBonus = { src, amount: amount * opts.wallBonus };
    }
    if (opts.type === 'saber') {
      this.fx.sparks(tgt.x, tgt.y, 1.0, tgt.def.droid ? '#ffcf70' : '#ff9a6a', crit ? 12 : 6);
      this.audio.play('hit', tgt, { crit });
    }
    if (!opts.quiet) {
      if (src === p || (src && src.owner === p)) this.fx.text(tgt.x, tgt.y, String(amount), crit ? '#ffe060' : src === p ? '#ffffff' : '#d0d8e8', crit ? 1.3 : src === p ? 1 : 0.75);
      else if (tgt === p) this.fx.text(tgt.x, tgt.y, String(amount), '#ff5a4a', 0.9);
    }
    if (tgt === p || src === p) this.lastCombatT = this.time;
    if (tgt === p) {
      this.emit('hurt', amount);
      if (p.hp < p.maxHp * 0.25 && !this.lowHpSaid) {
        this.lowHpSaid = true;
        this.say('lowHp');
      }
    }
    if (tgt.hp <= 0) {
      if (src === p && tgt.team === 'cis') p.addMight();
      this.kill(tgt);
    }
    return amount;
  }

  kill(u) {
    u.hp = 0;
    u.dead = true;
    u.stun = 0;
    u.choke = null;
    u.dieAnim();
    const p = this.player;
    if (u === p) {
      this.say('death');
      for (const a of this.units) if (a.owner === p) a.remove = true;
      this.emit('death');
      return;
    }
    if (u === (this.duel && this.duel.foe)) return;
    if (u.team === 'cis') {
      p.kills++;
      this.streak = this.time - (this.lastKillT ?? -99) < 4 ? (this.streak || 0) + 1 : 1;
      this.lastKillT = this.time;
      if (this.streak === 4) this.chatter('streak', 0.9);
      p.credits += u.elite ? 40 : u.kind === 'b2' ? 8 : 3;
      p.cards.parts += u.elite ? 12 : u.kind === 'b2' ? 2 : 1; // salvaged crafting parts
      this.quests.onKill(u);
      if (dist(u.x, u.y, p.x, p.y) < 40) p.gainXp(u.xp);
      this.fx.debris(u.x, u.y, u.kind === 'b2' ? 10 : 6, u.kind === 'b2' ? '#56606b' : '#b39f74');
      this.fx.smoke(u.x, u.y, 0.8, 3);
      this.fx.sparks(u.x, u.y, 1.0, '#9fdcff', 6);
      this.audio.play('droidDie', u);
      this.dropLoot(u);
      if (u.elite) this.fx.text(u.x, u.y, `${u.name} 파괴!`, '#ffcc55', 1.1, 2.4);
    }
  }

  deflect(p, b) {
    this.deflects = (this.deflects || 0) + 1;
    if (this.deflects % 8 === 0) this.chatter('deflect', 0.7);
    const redirect = chance(p.redirectChance()) && b.owner && !b.owner.dead;
    let ang;
    if (redirect) ang = Math.atan2(b.owner.y - b.y, b.owner.x - b.x) + rand(-0.05, 0.05);
    else ang = b.ang + Math.PI + rand(-0.9, 0.9);
    const speed = 18;
    b.ang = ang;
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed;
    b.team = p.team;
    b.owner = p;
    b.dmg = b.dmg * 1.3 + p.weaponDamage() * 0.25;
    b.life = 1.2;
    b.deflected = true;
    this.fx.sparks(b.x, b.y, b.z, '#bfe8ff', 6, 3);
    this.audio.play('deflect', p, { heavy: redirect });
    p.deflectFlash = 0.15;
    if (Math.random() < 0.2) this.fx.text(p.x, p.y, redirect ? '반격!' : '반사', '#9fd8ff', 0.8, 2.2);
  }

  reflectBoltsInCone(src, x, y, ang, range, half) {
    for (const b of this.bolts) {
      if (b.team === src.team) continue;
      const d = dist(x, y, b.x, b.y);
      if (d > range) continue;
      if (Math.abs(angleDiff(ang, Math.atan2(b.y - y, b.x - x))) > half) continue;
      b.team = src.team;
      b.owner = src;
      b.ang = Math.atan2(b.y - y, b.x - x);
      b.vx = Math.cos(b.ang) * 18;
      b.vy = Math.sin(b.ang) * 18;
      b.deflected = true;
      b.life = 1;
    }
  }

  reflectBoltsInRadius(src, x, y, r) {
    for (const b of this.bolts) {
      if (b.team === src.team || dist(x, y, b.x, b.y) > r) continue;
      this.deflect(src, b);
    }
  }

  clearBolts(x, y, r, team) {
    for (const b of this.bolts) {
      if (b.team !== team && dist(x, y, b.x, b.y) <= r) {
        b.life = 0;
        this.fx.sparks(b.x, b.y, b.z, '#ff8080', 3, 2);
      }
    }
  }

  // ------------------------------------------------------------------ update

  updateActive() {
    const p = this.player;
    this.activeUnits = this.units.filter((u) => Math.abs(u.x - p.x) < 34 && Math.abs(u.y - p.y) < 34);
  }

  respawnPlayer() {
    const p = this.player;
    const sp = this.world.spawn;
    p.x = sp.x;
    p.y = sp.y;
    p.dead = false;
    p.deathT = 0;
    p.recalc(true);
    p.action = null;
    p.darkness = 0;
    p.saberOut = false;
    p.setAnim('idle', 1, true);
    this.throws = [];
    this.lowHpSaid = false;
    this.say('respawn');
  }

  update(dt) {
    if (this.slowT > 0) {
      // brief slow motion after a perfect parry
      this.slowT -= dt;
      dt *= 0.35;
    }
    this.time += dt;
    const p = this.player;
    if (this.cinema) this.cinema.update(dt);
    if (this.duel) this.duel.update(dt);
    this.updateActive();
    for (const u of this.activeUnits) u.update(dt);

    // Unit separation (soft collisions).
    const act = this.activeUnits;
    for (let i = 0; i < act.length; i++) {
      const a = act[i];
      if (a.dead || a.z > 0.3) continue;
      for (let j = i + 1; j < act.length; j++) {
        const b = act[j];
        if (b.dead || b.z > 0.3) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min) {
          const push = (min - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          const wa = a.anchored ? 0 : a === p ? 0.3 : 1;
          const wb = b.anchored ? 0 : b === p ? 0.3 : 1;
          a.move(-nx * push * wa, -ny * push * wa);
          b.move(nx * push * wb, ny * push * wb);
        }
      }
    }

    this.updateBolts(dt);
    this.updateThrows(dt);
    this.updateStrikes(dt);
    this.updatePickups(dt);
    this.fx.update(dt);

    // Force Speed afterimages.
    if (p.buffs.speed && (p.moving || p.anim === 'run')) {
      this.ghostT = (this.ghostT || 0) - dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.06;
        this.fx.afterimage(p.x, p.y, p.frame(), 0.35);
      }
    }
    if (p.deflectFlash > 0) p.deflectFlash -= dt;

    this.units = this.units.filter((u) => !u.remove);

    // Exploration + region banner.
    this.exploreT -= dt;
    if (this.exploreT <= 0) {
      this.exploreT = 0.25;
      const w = this.world;
      const R = 13;
      for (let y = Math.floor(p.y - R); y <= p.y + R; y++)
        for (let x = Math.floor(p.x - R); x <= p.x + R; x++)
          if (w.inBounds(x, y) && (x - p.x) ** 2 + (y - p.y) ** 2 < R * R) w.explored[y * w.w + x] = 1;
      const reg = w.regionName(p.x, p.y);
      if (reg !== this.region) {
        this.region = reg;
        this.emit('region', reg);
        const rk = /공화국/.test(reg) ? 'regionBase' : /공장/.test(reg) ? 'regionFactory' : /폐허/.test(reg) ? 'regionRuins' : /수정/.test(reg) ? 'regionCrystal' : /격전지/.test(reg) ? 'regionBattle' : null;
        if (rk && this.time > 3) this.chatter(rk, 0.7);
      }
    }

    // Camps: clear / respawn.
    this.campT -= dt;
    if (this.campT <= 0) {
      this.campT = 1;
      if (!p.dead && this.time - (this.lastCombatT ?? 0) > 45 && this.time - (this.lastIdleT ?? 0) > 75) {
        this.lastIdleT = this.time;
        this.chatter('idle', 0.6);
      }
      for (const c of this.world.camps) {
        if (!c.cleared && c.alive.every((u) => u.dead)) {
          c.cleared = true;
          c.respawnAt = this.time + 150;
          this.quests.onCampCleared(c);
          if (dist(c.x, c.y, p.x, p.y) < 30) {
            this.say('campClear');
            const bonus = Math.round(20 * c.level * c.level);
            p.gainXp(bonus);
            p.cards.parts += 8;
            this.fx.text(p.x, p.y, `거점 소탕 +${bonus} XP`, '#ffd27f', 1.1, 2.6);
          }
        } else if (c.cleared && this.time > c.respawnAt && dist(c.x, c.y, p.x, p.y) > 36) {
          this.spawnCamp(c);
        }
      }
    }

    this.updateSaberAuto(dt);
    this.audio.setHum(p.dead || p.saberOut || !p.saberLit ? 0 : p.moving ? 1 : 0.6);
  }

  /**
   * The blade ignites when a fight starts (a droid targets Anakin, or he is
   * hit or attacks) and goes out when it ends (6 s without combat). Only the
   * moments a fight starts or ends act, so the X key's choice otherwise stands.
   */
  updateSaberAuto(dt) {
    const p = this.player;
    this.combatCheckT = (this.combatCheckT || 0) - dt;
    if (this.combatCheckT > 0 || p.dead || this.duel) return;
    this.combatCheckT = 0.25;
    const engaged = this.activeUnits.some((u) => !u.dead && u.team === 'cis' && u.target === p && dist(u.x, u.y, p.x, p.y) < 12);
    if (engaged) this.lastCombatT = this.time;
    const was = this.inCombat;
    this.inCombat = engaged || this.time - (this.lastCombatT ?? -99) < 6;
    if (this.inCombat && !was) {
      this.retractPending = false;
      p.setSaber(true);
    } else if (!this.inCombat && was) this.retractPending = true;
    if (this.retractPending && !p.busy) {
      this.retractPending = false;
      p.setSaber(false);
    }
  }

  updateBolts(dt) {
    const w = this.world;
    for (const b of this.bolts) {
      b.life -= dt;
      if (b.life <= 0) continue;
      const steps = 3;
      for (let s = 0; s < steps && b.life > 0; s++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        const tx = Math.floor(b.x);
        const ty = Math.floor(b.y);
        if (!w.inBounds(tx, ty) || w.blocked[ty * w.w + tx] === 2) {
          b.life = 0;
          break;
        }
        if (w.blocked[ty * w.w + tx] === 1 && Math.random() < 0.6) {
          b.life = 0;
          this.fx.sparks(b.x, b.y, b.z, b.color === 'red' ? '#ff9080' : '#90c0ff', 4, 2);
          break;
        }
        for (const u of this.activeUnits) {
          if (u.dead || u.team === b.team || u.untargetable) continue;
          if (Math.abs(u.x - b.x) > 0.6 || Math.abs(u.y - b.y) > 0.6) continue;
          if (dist(u.x, u.y, b.x, b.y) > u.radius + 0.12) continue;
          if (u === this.player && u.canDeflect() && chance(u.deflectChance())) {
            this.deflect(u, b);
          } else {
            this.damage(b.owner, u, b.dmg, { type: 'blaster' });
            this.fx.sparks(b.x, b.y, b.z, b.color === 'red' ? '#ff9080' : '#90c0ff', 4, 2);
            b.life = 0;
          }
          break;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  updateThrows(dt) {
    for (const t of this.throws) {
      const o = t.owner;
      t.spin += dt * 22;
      const speed = 15;
      const step = speed * dt;
      if (t.out) {
        const nx = t.x + Math.cos(t.ang) * step;
        const ny = t.y + Math.sin(t.ang) * step;
        t.travelled += step;
        if (this.world.blocked[Math.floor(ny) * this.world.w + Math.floor(nx)] || t.travelled >= t.range) {
          t.out = false;
          t.hit.clear();
          if (t.travelled < t.range) this.fx.sparks(t.x, t.y, 1, '#bfe8ff', 5);
        } else {
          t.x = nx;
          t.y = ny;
        }
      } else {
        const d = dist(t.x, t.y, o.x, o.y);
        if (d < 0.6 || o.dead) {
          t.done = true;
          o.saberOut = false;
          continue;
        }
        t.x += ((o.x - t.x) / d) * Math.min(d, step * 1.1);
        t.y += ((o.y - t.y) / d) * Math.min(d, step * 1.1);
      }
      for (const e of this.hostilesInRadius(o, t.x, t.y, 0.7)) {
        if (t.hit.has(e)) continue;
        t.hit.add(e);
        this.damage(o, e, o.weaponDamage() * t.mult, { type: 'saber', knock: { ang: t.ang, power: 2 } });
      }
      this.reflectBoltsInRadius(o, t.x, t.y, 0.6);
    }
    this.throws = this.throws.filter((t) => !t.done);
  }

  updateStrikes(dt) {
    for (const s of this.strikes) {
      s.t += dt;
      for (const m of s.missiles) {
        if (!m.done && s.t >= m.t) {
          m.done = true;
          this.fx.explosion(m.x, m.y, 1);
          this.audio.play('explode', m);
          for (const e of this.hostilesInRadius(s.owner, m.x, m.y, 1.6)) {
            this.damage(s.owner, e, s.dmg * rand(0.85, 1.15), { type: 'explosive', knock: { ang: Math.atan2(e.y - m.y, e.x - m.x), power: 5 }, stun: 0.5 });
          }
        }
      }
    }
    this.strikes = this.strikes.filter((s) => s.t < s.life);
  }

  updatePickups(dt) {
    const p = this.player;
    for (const k of this.pickups) {
      k.t += dt;
      if (p.dead || dist(p.x, p.y, k.x, k.y) > 0.9) continue;
      k.taken = true;
      this.audio.play('pickup');
      if (k.type === 'bacta') {
        if (p.bacta < 5) {
          p.bacta++;
          this.fx.text(p.x, p.y, '박타 주사기 +1', '#ff8a8a', 0.9);
        } else {
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
          this.fx.text(p.x, p.y, '치유', '#7dff9a', 0.9);
        }
      } else if (k.type === 'forceShard') {
        const v = Math.round(p.maxForce * 0.3);
        p.force = Math.min(p.maxForce, p.force + v);
        this.fx.text(p.x, p.y, `포스 +${v}`, '#8fd0ff', 0.9);
      } else if (k.type === 'holocron') {
        const v = Math.round(p.xpNext * 0.25);
        p.gainXp(v);
        this.fx.text(p.x, p.y, `홀로크론의 지혜 +${v} XP`, '#9fdcff', 1.1, 2.4);
        this.say('holocron');
        this.quests.onHolocron();
      }
    }
    this.pickups = this.pickups.filter((k) => !k.taken && k.t < 90);
  }

  useBacta() {
    const p = this.player;
    if (p.dead || p.bacta <= 0 || p.hp >= p.maxHp) {
      this.audio.play('deny');
      return;
    }
    p.bacta--;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.45 * (1 + p.cards.value('bactaPack') / 100));
    this.lowHpSaid = false;
    this.fx.text(p.x, p.y, '박타 치료', '#7dff9a', 1);
    this.fx.ring(p.x, p.y, 0.8, '#7dff9a', 0.5);
    this.audio.play('pickup');
  }

  onLevelUp() {
    const p = this.player;
    this.fx.ring(p.x, p.y, 1.2, '#ffd27f', 1.0);
    this.fx.shockwave(p.x, p.y, 2, '#ffe2a0', 0.6);
    this.fx.text(p.x, p.y, `레벨 업! (${p.level})`, '#ffd27f', 1.4, 2.5);
    this.audio.play('levelup');
    this.say('levelup');
    this.emit('levelup', p.level);
  }

  /** Developer shortcut: grant levels for quickly testing skills. */
  devLevels(n = 5) {
    const p = this.player;
    for (let i = 0; i < n; i++) p.gainXp(p.xpNext - p.xp);
  }
}

