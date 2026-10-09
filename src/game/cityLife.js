// The city hub's life director: puts the people of data/cityLife.json in
// their places, keeps the steam vents breathing, and every 30 s – 2 min
// (the JSON's `events.interval`) starts a random event near Anakin:
//   pickpocket — a thief bumps a passer-by and runs; catch him (walk into
//                him) and the wallet comes back (credits for Anakin)
//   brawl      — two locals square up and trade punches, a crowd gathers;
//                it ends when Anakin walks up, a guard arrives, or they tire
//   ID check   — a guard stops someone and asks for papers
// Events take their people over (`unit.event`) and give them back after.
import { Citizen } from './citizens.js';
import { dist, rand, chance } from '../core/math.js';
import LIFE from '../data/cityLife.json';
import { SHEET_PROPS } from '../world/cityProps.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const levelOf = (y) => (y > 90 ? 'low' : 'up');

export class CityLife {
  constructor(game) {
    this.game = game;
    this.people = [];
    this.eventT = rand(...LIFE.events.interval) * 0.5; // the first one comes sooner
    this.current = null;
  }

  /** Everyone of the JSON, already somewhere along their routine. */
  populate() {
    const g = this.game;
    const w = g.world;
    // vendors stand at the carts and kiosks that have a vendor's spot
    const stalls = w.props.filter((p) => p.sheet && SHEET_PROPS[p.sheet].vendor).sort(() => Math.random() - 0.5);
    let si = 0;
    for (const def of LIFE.residents) {
      for (let k = 0; k < def.n; k++) {
        const u = new Citizen(g, def, 0, 0);
        if (def.kind === 'vendor') {
          const st = stalls[si++ % Math.max(1, stalls.length)];
          const v = st && SHEET_PROPS[st.sheet].vendor;
          if (st) u.stall = u.pickPoint({ at: [st.x + v[0], st.y + v[1]], r: 0 });
        }
        const step = def.routine[u.step];
        const at = u.resolve(step.go);
        u.x = at.x;
        u.y = at.y;
        u.step = (u.step + 1) % def.routine.length;
        u.stay(rand(2, step.stay[1]), step.do || 'idle');
        this.add(u);
      }
    }
    for (const def of LIFE.patrols) {
      const u = new Citizen(g, { ...def, patrol: true }, def.route[0][0], def.route[0][1]);
      u.leg = 1 % def.route.length;
      u.stay(rand(0, 3), 'idle');
      this.add(u);
    }
  }

  add(u) {
    this.people.push(u);
    this.game.units.push(u);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    // steam from the vents near Anakin
    for (const s of g.world.steam || []) {
      if (Math.abs(s.x - p.x) > 22 || Math.abs(s.y - p.y) > 22) continue;
      s.t -= dt;
      if (s.t <= 0) {
        s.t = rand(0.22, 0.5);
        g.fx.steam(s.x, s.y, s.z);
      }
    }
    // random events
    if (this.current) {
      if (this.current.update(dt) === false) this.end();
      return;
    }
    if (g.cinema || g.talkingTo || p.dead) return;
    this.eventT -= dt;
    if (this.eventT > 0) return;
    this.eventT = rand(...LIFE.events.interval);
    const kinds = [Pickpocket, Brawl, IdCheck];
    for (const K of kinds.sort(() => Math.random() - 0.5)) {
      const ev = K.start(this);
      if (ev) {
        this.current = ev;
        return;
      }
    }
  }

  end() {
    for (const u of this.current.actors) {
      u.event = null;
      u.path = null;
      u.stay(rand(2, 5), 'idle');
    }
    this.current = null;
  }

  /** Free locals near Anakin on his level, nearest first. */
  locals(kinds, r = 12) {
    const p = this.game.player;
    const lv = levelOf(p.y);
    return this.people
      .filter((u) => !u.event && u.level === lv && kinds.includes(u.kind) && u.state !== 'flee' && dist(u.x, u.y, p.x, p.y) < r)
      .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
  }

  log(text, cls = 'sys') {
    this.game.emit('log', text, cls);
  }
}

/** Base for events: the people it holds, how each is driven. */
class CityEvent {
  constructor(life) {
    this.life = life;
    this.game = life.game;
    this.actors = [];
    this.t = 0;
  }

  take(u, role) {
    u.event = this;
    u.role = role;
    u.path = null;
    this.actors.push(u);
  }

  /** Per-actor driving (called from Citizen.update). */
  drive(u, dt) {
    if (u.path && u.path.length) u.walk(dt, u.runK || 1);
    else this.pose(u, dt);
  }

  pose(u) {
    u.setAnim('idle');
  }
}

class Pickpocket extends CityEvent {
  static start(life) {
    const thieves = life.locals(['drifter', 'worker', 'citizen'], 13);
    const thief = thieves[thieves.length - 1];
    if (!thief) return null;
    const victim = life.locals(['worker', 'citizen', 'noble', 'aide', 'vendor'], 13).find((u) => u !== thief && dist(u.x, u.y, thief.x, thief.y) < 10);
    if (!victim) return null;
    return new Pickpocket(life, thief, victim);
  }

  constructor(life, thief, victim) {
    super(life);
    this.thief = thief;
    this.victim = victim;
    this.phase = 'approach';
    this.take(thief, 'thief');
    this.take(victim, 'victim');
    victim.stay(99, 'idle');
    thief.goTo({ x: victim.x, y: victim.y }, null, 1.2);
    thief.runK = 1.2;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const { thief, victim } = this;
    this.t += dt;
    if (this.phase === 'approach') {
      if (dist(thief.x, thief.y, victim.x, victim.y) < 1.0 || this.t > 14) {
        this.phase = 'snatch';
        this.t = 0;
        victim.faceTo(thief.x, thief.y);
        victim.say('어? 내 지갑…!', 1.4);
      }
      return true;
    }
    if (this.phase === 'snatch') {
      if (this.t < 0.7) return true;
      this.phase = 'chase';
      this.t = 0;
      victim.say('소매치기야! 저놈 잡아 줘요!', 3);
      this.life.log('소매치기! 달아나는 도둑을 붙잡으세요.', 'gold');
      // run for the furthest reachable point away from the victim
      const pts = g.world.walk[thief.level];
      let best = null;
      for (let k = 0; k < 30; k++) {
        const c = pick(pts);
        if (dist(c.x, c.y, thief.x, thief.y) > 20) continue;
        if (!best || dist(c.x, c.y, victim.x, victim.y) > dist(best.x, best.y, victim.x, victim.y)) best = c;
      }
      thief.runK = 2.4;
      if (best) thief.goTo(best, null, 2.4);
      return true;
    }
    if (this.phase === 'chase') {
      if (dist(thief.x, thief.y, p.x, p.y) < 1.5) {
        thief.path = null;
        thief.faceTo(p.x, p.y);
        thief.say('알았어요, 알았어! 돌려줄게요!', 2.6);
        victim.say('고마워요, 장군님!', 2.6);
        p.credits = (p.credits || 0) + 20;
        this.life.log('지갑을 되찾아 주었다 (+20 크레딧)', 'gold');
        this.phase = 'done';
        this.t = 0;
        return true;
      }
      if (this.t > 16 || !thief.path || !thief.path.length) {
        victim.say('…역시 이 동네는.', 2.4);
        this.life.log('소매치기가 골목으로 사라졌다.', 'sys');
        this.phase = 'done';
        this.t = 0;
      }
      return true;
    }
    return this.t < 2.5;
  }

  pose(u) {
    if (u === this.victim && this.phase === 'chase') {
      u.faceTo(this.thief.x, this.thief.y);
      u.setAnim('talk');
    } else u.setAnim('idle');
  }
}

class Brawl extends CityEvent {
  static start(life) {
    const pool = life.locals(['worker', 'drifter', 'citizen'], 12);
    for (const a of pool) {
      const b = pool.find((u) => u !== a && dist(u.x, u.y, a.x, a.y) < 9);
      if (b) return new Brawl(life, a, b);
    }
    return null;
  }

  constructor(life, a, b) {
    super(life);
    const g = this.game;
    this.a = a;
    this.b = b;
    const f = g.pathfinder.nearestFree(Math.floor((a.x + b.x) / 2), Math.floor((a.y + b.y) / 2), 3);
    this.c = f ? { x: f[0] + 0.5, y: f[1] + 0.5 } : { x: a.x, y: a.y };
    this.phase = 'square';
    this.take(a, 'fighter');
    this.take(b, 'fighter');
    a.goTo({ x: this.c.x - 0.55, y: this.c.y }, null, 1.3);
    b.goTo({ x: this.c.x + 0.55, y: this.c.y }, null, 1.3);
    a.say(pick(['너 방금 뭐라고 했어?', '내 크레딧 내놔!', '또 너야?']), 2.4);
    this.hitT = 0;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const { a, b, c } = this;
    this.t += dt;
    if (this.phase === 'square') {
      if ((!a.path?.length && !b.path?.length) || this.t > 10) {
        this.phase = 'fight';
        this.t = 0;
        b.say(pick(['한번 해 보자는 거지?', '덤벼!', '오늘 끝장 보자.']), 2.2);
        this.life.log('하층에서 싸움이 났다.', 'sys');
        // a crowd gathers in a ring
        const watchers = this.life.locals(['worker', 'drifter', 'citizen', 'vendor'], 14).filter((u) => dist(u.x, u.y, c.x, c.y) < 9).slice(0, 4);
        watchers.forEach((u, i) => {
          this.take(u, 'watcher');
          const ang = (i / Math.max(1, watchers.length)) * Math.PI * 2 + 0.6;
          const f = g.pathfinder.nearestFree(Math.floor(c.x + Math.cos(ang) * 2.4), Math.floor(c.y + Math.sin(ang) * 2.4), 2);
          if (f) u.goTo({ x: f[0] + 0.5, y: f[1] + 0.5 }, null, 1.3);
          if (i < 2) setTimeout(() => u.event === this && u.say(pick(['싸움이다!', '한 대 더!', '누가 경비대 좀 불러!']), 2), 600 + i * 900);
        });
        // the nearest guard on this level heads over
        const lv = a.level;
        this.guard = this.life.people.filter((u) => u.kind === 'patrol' && !u.event && u.level === lv).sort((u, v) => dist(u.x, u.y, c.x, c.y) - dist(v.x, v.y, c.x, c.y))[0];
        if (this.guard && dist(this.guard.x, this.guard.y, c.x, c.y) < 30) {
          this.take(this.guard, 'guard');
          const f = g.pathfinder.nearestFree(Math.floor(c.x), Math.floor(c.y + 1.6), 3);
          this.guard.goTo(f ? { x: f[0] + 0.5, y: f[1] + 0.5 } : c, null, 1.6);
          this.guard.runK = 1.6;
        } else this.guard = null;
      }
      return true;
    }
    if (this.phase === 'fight') {
      // trading punches: one lands every so often
      this.hitT -= dt;
      if (this.hitT <= 0) {
        this.hitT = rand(0.5, 0.9);
        const [hitter, hit] = chance(0.5) ? [a, b] : [b, a];
        hitter.setAnim('punch', 1, true);
        hit.flash = 0.12;
        g.fx.dust(hit.x, hit.y, 3);
        g.audio.play('punch', hit);
      }
      const nearP = dist(p.x, p.y, c.x, c.y) < 2.8;
      const guardThere = this.guard && !this.guard.path?.length && dist(this.guard.x, this.guard.y, c.x, c.y) < 3;
      if (nearP || guardThere || this.t > 28) {
        if (nearP) {
          a.say('제다이다… 그만하자.', 2.4);
          b.say('흥, 다음에 보자.', 2.4);
          this.life.log('싸움을 말렸다.', 'sys');
        } else if (guardThere) {
          this.guard.say('해산! 둘 다 물러서!', 2.6);
          this.life.log('경비대가 싸움을 말렸다.', 'sys');
        } else {
          a.say('…헉, 헉. 오늘은 여기까지다.', 2.4);
        }
        this.phase = 'done';
        this.t = 0;
      }
      return true;
    }
    return this.t < 2.4;
  }

  pose(u) {
    const { a, b, c } = this;
    if (u.role === 'fighter') {
      const o = u === a ? b : a;
      u.faceTo(o.x, o.y);
      if (this.phase === 'fight') {
        if (u.anim !== 'punch' || u.animInfo().done) u.setAnim(u.sprites.anims.punch ? 'idle' : 'talk', 1.6);
      } else u.setAnim('talk');
    } else if (u.role === 'watcher' || u.role === 'guard') {
      u.faceTo(c.x, c.y);
      u.setAnim(u.role === 'guard' && this.phase === 'done' ? 'talk' : 'idle');
    } else u.setAnim('idle');
  }
}

class IdCheck extends CityEvent {
  static start(life) {
    const p = life.game.player;
    const guard = life.people.find((u) => u.kind === 'patrol' && !u.event && u.level === levelOf(p.y) && dist(u.x, u.y, p.x, p.y) < 14);
    if (!guard) return null;
    const who = life.locals(['worker', 'drifter', 'citizen', 'aide', 'noble'], 16).find((u) => dist(u.x, u.y, guard.x, guard.y) < 8);
    if (!who) return null;
    return new IdCheck(life, guard, who);
  }

  constructor(life, guard, who) {
    super(life);
    this.guard = guard;
    this.who = who;
    this.take(guard, 'guard');
    this.take(who, 'checked');
    who.stay(99, 'idle');
    guard.goTo({ x: who.x + 0.9, y: who.y + 0.3 }, null, 1.2);
    this.phase = 'walk';
  }

  update(dt) {
    const { guard, who } = this;
    this.t += dt;
    if (this.phase === 'walk' && (!guard.path?.length || this.t > 10)) {
      this.phase = 'talk';
      this.t = 0;
      guard.say('정지. 신분증 제시하십시오.', 2.4);
      setTimeout(() => this.phase === 'talk' && who.say(pick(['여, 여기 있습니다…', '또요? 어제도 보여 드렸잖아요.', '저는 그냥 지나가던 길인데요.']), 2.4), 1500);
      setTimeout(() => this.phase === 'talk' && guard.say(pick(['확인 완료. 가도 좋습니다.', '…좋아. 이동하십시오.']), 2.2), 3600);
    }
    return this.phase === 'walk' || this.t < 6;
  }

  pose(u) {
    const o = u === this.guard ? this.who : this.guard;
    u.faceTo(o.x, o.y);
    u.setAnim(this.phase === 'talk' ? 'talk' : 'idle');
  }
}
