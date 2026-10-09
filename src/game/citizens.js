// The city hub's people. Each follows a routine from data/cityLife.json — a
// loop of places with a stay and an activity at each (work at the factory
// gate, sell at their stall, sit in an alley, chat on the cantina square) —
// walking between them by path. Coruscant Guard troopers walk patrol routes
// and stop to check Anakin when he comes close. Everyone but the guards runs
// from a lit lightsaber and murmurs about it from further off. Random events
// (game/cityLife.js) take people over for a while: a pickpocket and his
// victim, a brawl and the crowd it draws. Lines appear as speech bubbles.
import { Unit } from './units.js';
import { dist, rand, chance } from '../core/math.js';
import LIFE from '../data/cityLife.json';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FLEE_R = 6.5; // a lit saber this close sends people running
const WHISPER_R = 11; // ...and gets them talking this far off

export class Citizen extends Unit {
  /**
   * def: { sprite, name, level, speed, kind, routine } (a resident) or
   *      { name, level, route, wait, patrol: true } (a guard).
   */
  constructor(game, def, x, y) {
    super(game, 'citizen', x, y);
    this.sprite = def.patrol ? 'cguard' : def.sprite;
    this.name = def.name;
    this.def2 = def;
    this.kind = def.patrol ? 'patrol' : def.kind || 'citizen';
    this.level = def.level;
    this.untargetable = true;
    this.speed = (def.speed || 1.6) * rand(0.85, 1.15);
    this.step = def.routine ? Math.floor(Math.random() * def.routine.length) : 0;
    this.leg = 0; // patrol: index into the route
    this.state = 'stay';
    this.t = rand(0, 6);
    this.doing = 'idle';
    this.sayT = rand(4, 12);
    this.checkT = 0;
    this.checking = 0;
    this.event = null; // set by a random event while it lasts
  }

  /** Say a line in a speech bubble (one at a time, a pause between). */
  say(text, dur = 3) {
    this.game.bubble(this, text, dur);
    this.sayT = rand(12, 24);
  }

  /** Where this person's place `name` is: a point near it on a free tile. */
  resolve(name) {
    const g = this.game;
    if (name === '@stall') return this.stall || this.resolve('marketStreet');
    if (name === '@home') {
      if (!this.home) this.home = this.pickPoint(LIFE.places.homesLow);
      return this.home;
    }
    return this.pickPoint(LIFE.places[name]) || { x: this.x, y: this.y };
  }

  pickPoint(pl) {
    if (!pl) return null;
    const at = typeof pl.at[0] === 'number' ? pl.at : pick(pl.at);
    const r = pl.r || 0;
    const x = at[0] + rand(-r, r);
    const y = at[1] + rand(-r, r);
    const f = this.game.pathfinder.nearestFree(Math.floor(x), Math.floor(y), 3);
    return f ? { x: f[0] + 0.5 + (x % 1) * 0.6 - 0.3, y: f[1] + 0.5 + (y % 1) * 0.6 - 0.3, face: pl.face } : null;
  }

  /** Walk (by path) to `to`; `then` when there. */
  goTo(to, then, speedK = 1) {
    const g = this.game;
    const path = g.pathfinder.lineFree(this.x, this.y, to.x, to.y, this.radius * 0.8) ? [to] : g.pathfinder.find(this.x, this.y, to.x, to.y, 3000);
    if (!path) {
      this.state = 'stay';
      this.t = rand(1, 3);
      return false;
    }
    this.path = path.slice();
    this.dest = to;
    this.state = 'go';
    this.then = then;
    this.speedK = speedK;
    this.stuck = 0;
    this.goT = 40;
    return true;
  }

  /** The next routine step (or patrol point). */
  next() {
    const d = this.def2;
    if (this.kind === 'patrol') {
      const p = d.route[this.leg];
      this.leg = (this.leg + 1) % d.route.length;
      return this.goTo({ x: p[0], y: p[1] }, () => this.stay(rand(...d.wait), 'idle'));
    }
    const st = d.routine[this.step];
    this.step = (this.step + 1) % d.routine.length;
    const to = this.resolve(st.go);
    this.goTo(to, () => {
      if (to.face) this.facing = Math.atan2(to.face[1], to.face[0]);
      this.stay(rand(...st.stay), st.do || 'idle');
    });
  }

  stay(t, doing) {
    this.state = 'stay';
    this.t = t;
    this.doing = doing;
    this.path = null;
    if (doing === 'sit' && this.sprites.anims.sit) this.setAnim('sit');
  }

  update(dt) {
    this.baseUpdate(dt);
    const g = this.game;
    const p = g.player;
    this.t -= dt;
    this.sayT -= dt;
    this.checkT -= dt;
    const near = dist(this.x, this.y, p.x, p.y);
    if (this.event) return this.event.drive(this, dt); // a random event has this one

    // a lit saber: everyone but the guards runs, and those further off murmur
    const lit = p.saberLit && !p.saberOut && !p.dead && !g.cinema;
    if (this.kind !== 'patrol' && lit) {
      if (near < FLEE_R && this.state !== 'flee') return this.flee();
      if (near < WHISPER_R && !this.whispered && this.sayT <= 0 && chance(0.4)) {
        this.whispered = true;
        this.faceTo(p.x, p.y);
        this.say(pick(LIFE.lines.whisper), 2.4);
      }
    }
    if (!lit && this.whispered) this.whispered = false;
    // a guard stops Anakin when he comes close, walking or not: turns, checks, a word
    if (this.kind === 'patrol' && near < 3.4 && this.checkT <= 0 && !g.cinema && !p.dead) {
      const n = this.def2.route.length;
      if (this.state === 'go') this.leg = (this.leg + n - 1) % n; // then on to the same point
      this.checkT = rand(45, 70);
      this.checking = 3.2;
      this.stay(3.4, 'check');
      this.say(pick(LIFE.lines.check), 3.2);
      return;
    }

    if (this.state === 'flee') {
      if (this.walk(dt, 2.3)) {
        this.stay(rand(3, 6), 'cower');
        this.calmLine = true;
      }
      return;
    }
    if (this.state === 'go') {
      if (this.walk(dt, this.speedK)) this.then && this.then();
      return;
    }
    // staying: the activity, then on to the next step
    this.act(dt, near);
    if (this.t <= 0) {
      if (this.calmLine && !lit) {
        this.calmLine = false;
        if (chance(0.5)) this.say(pick(LIFE.lines.calmDown), 2.2);
      }
      if (this.kind !== 'patrol' && lit && near < FLEE_R + 3) this.t = 1.5; // keep clear while it burns
      else this.next();
    }
  }

  /** Follow the path; true when arrived. */
  walk(dt, k = 1) {
    const wp = this.path && this.path[0];
    if (!wp) return true;
    const sp = this.speed * k;
    const bx = this.x;
    const by = this.y;
    if (this.moveToward(wp.x, wp.y, sp, dt)) this.path.shift();
    this.setAnim('walk', sp / 1.8);
    this.stuck = dist(bx, by, this.x, this.y) < sp * dt * 0.2 ? this.stuck + dt : 0;
    this.goT -= dt;
    if (this.stuck > 1.5 || this.goT <= 0) {
      this.path = null;
      return true; // close enough: carry on from here
    }
    return !this.path.length;
  }

  /** What someone staying does: the activity's pose, and a word for Anakin passing by. */
  act(dt, near) {
    const g = this.game;
    const p = g.player;
    const lines = LIFE.lines;
    const d = this.doing;
    if (d === 'sit' && this.anim === 'sit') return;
    if (this.kind === 'patrol') {
      if (this.checking > 0) {
        this.checking -= dt;
        this.faceTo(p.x, p.y);
        this.setAnim('talk');
      } else this.setAnim('idle');
      return;
    }
    if (d === 'sell') {
      // vendors call out to Anakin walking by, facing him
      if (near < 5) this.faceTo(p.x, p.y);
      this.setAnim(near < 5 ? 'talk' : 'idle');
      if (near < 5.5 && this.sayT <= 0 && p.moving) this.say(pick(lines.vendor), 3);
      return;
    }
    if (d === 'chat' || d === 'work') {
      // chat with someone close by, or busy at the gate
      if (!this.partner || this.partner.state !== 'stay' || dist(this.partner.x, this.partner.y, this.x, this.y) > 1.8) {
        this.partner = g.activeUnits.find((u) => u !== this && u instanceof Citizen && u.state === 'stay' && u.kind !== 'patrol' && dist(u.x, u.y, this.x, this.y) < 1.8) || null;
      }
      if (this.partner) this.faceTo(this.partner.x, this.partner.y);
      this.setAnim(d === 'work' || this.partner ? 'talk' : 'idle');
    } else if (d === 'cower') this.setAnim('idle', 2.5);
    else this.setAnim('idle');
    if (near < 3 && this.sayT <= 0 && !g.cinema && chance(dt * 2)) {
      const pool = lines[this.kind] || lines[this.level];
      this.say(pick(pool && chance(0.6) ? pool : lines[this.level]), 2.8);
    }
  }

  /** Run from the blade: the free point furthest from Anakin within reach. */
  flee() {
    const p = this.game.player;
    const pts = this.game.world.walk[this.level];
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const c = pick(pts);
      const dSelf = dist(c.x, c.y, this.x, this.y);
      if (dSelf > 14) continue;
      const dp = dist(c.x, c.y, p.x, p.y);
      if (dp > bestD) {
        bestD = dp;
        best = c;
      }
    }
    if (chance(0.45)) this.say(pick(LIFE.lines.flee), 1.8);
    if (!best || !this.goTo(best, null, 2.3)) return;
    this.state = 'flee';
  }
}
