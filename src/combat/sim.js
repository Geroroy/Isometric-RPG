// 결투 시뮬레이션: 두 결투자, 바닥, 고정 틱, 타격 정지, 사건 기록 (docs/COMBAT.md).
//
// 화면 프레임 속도와 무관하다: advance(실제 dt)가 시간을 모아 TICK_HZ 고정 틱으로만 진행한다. 같은 입력이 같은 틱에
// 들어오면 30 fps든 144 fps든 결과(사건 기록)가 같다 (tools/combat/sim.test.mjs).
//
// 맵 연결 (docs/COMBAT.md "맵 연결"): `ground`는 { move(x, y, dx, dy, r) → { x, y } } 하나만 있으면 된다 —
// 시험장은 ArenaGround(world.js), 실제 맵은 groundFromTiles(world.js)로 타일 맵의 isBlocked를 감싼다.
import { TUNING as T, DT, CAST } from './tuning.js';
import { Fighter } from './fighter.js';
import { resolveContacts } from './rules.js';

export class CombatSim {
  /**
   * opts: { ground, spawns: [{x,y},{x,y}], cast: ['anakin', 'obiwan'], controllers: [c0, c1] }
   * 컨트롤러: { command(sim, me, foe) → cmd, reset?(sim) } — 플레이어(controls.js)와 AI(ai.js)가 같은 형식.
   */
  constructor(opts) {
    this.ground = opts.ground;
    this.spawns = opts.spawns;
    this.castIds = opts.cast || ['anakin', 'obiwan'];
    this.fighters = this.castIds.map((c, i) => new Fighter(i, CAST[c], i));
    this.controllers = opts.controllers || [null, null];
    this.listeners = [];
    this.round = 0;
    this.reset();
  }

  /** 재시작: 판정·입력·AI·사건 기록 모두 처음으로 */
  reset() {
    this.time = 0;
    this.tick = 0;
    this.freeze = 0; // 남은 타격 정지 (틱)
    this.acc = 0;
    this.events = [];
    this.log = []; // 판정 결과만 (디버그 표시)
    this.over = null; // { winner, loser, t }
    this.round++;
    this.stats = { swings: 0, whiff: 0, block: 0, parry: 0, clash: 0, break: 0, hit: 0, evade: 0, dodge: 0, leadChanges: 0 };
    this.lead = null;
    const [a, b] = this.spawns;
    const fa = Math.atan2(b.y - a.y, b.x - a.x);
    this.fighters[0].reset(a.x, a.y, fa);
    this.fighters[1].reset(b.x, b.y, fa + Math.PI);
    for (const c of this.controllers) if (c && c.reset) c.reset(this);
    this.emit({ type: 'reset' });
  }

  on(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  emit(e) {
    e.t = this.time;
    e.tick = this.tick;
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, 100);
    if (e.type in this.stats) this.stats[e.type]++;
    if (e.type === 'swing') this.stats.swings++;
    if (/^(whiff|block|parry|clash|break|hit|evade|ko)$/.test(e.type)) {
      this.log.push(e);
      if (this.log.length > 60) this.log.shift();
    }
    for (const fn of this.listeners) fn(e, this);
  }

  /** 타격 정지: 시뮬레이션 전체를 `sec` 동안 멈춘다 (겹치면 긴 쪽). 입력은 ingest로 계속 기억된다. */
  hitstop(sec) {
    this.freeze = Math.max(this.freeze, Math.round(sec * 60) * 2); // (60 fps 기준 프레임 수로 반올림 → 틱)
  }

  /** 실제 경과 시간만큼 고정 틱을 돌린다. 반환: 돈 틱 수 */
  advance(realDt) {
    this.acc = Math.min(this.acc + realDt, 0.25); // (멈췄던 탭이 돌아와도 한꺼번에 따라잡지 않음)
    let n = 0;
    while (this.acc >= DT - 1e-9) {
      this.acc -= DT;
      this.step();
      n++;
    }
    return n;
  }

  /** 한 틱 */
  step() {
    const [A, B] = this.fighters;
    const cmds = this.controllers.map((c, i) => (c ? c.command(this, this.fighters[i], this.fighters[1 - i]) : {}));
    A.ingest(cmds[0] || {}, this.time);
    B.ingest(cmds[1] || {}, this.time);
    if (this.freeze > 0) {
      // 타격 정지: 시간도 상태도 멈춘다 (누른 입력은 위에서 기억됨 — 만료되지 않고, 판정은 다시 나지 않는다)
      this.freeze--;
      return;
    }
    this.tick++;
    this.time = this.tick * DT;
    A.step(B, this);
    B.step(A, this);
    this.integrate(A);
    this.integrate(B);
    this.separate(A, B);
    if (this.over) return; // (승부가 난 뒤: 서 있는 쪽은 동작을 마치고, 판정은 더 없다)
    resolveContacts(this);
    this.updateLead();
    for (const f of this.fighters) {
      if (f.dead && !this.over) {
        const w = f === A ? B : A;
        this.over = { winner: w, loser: f, t: this.time };
        this.emit({ type: 'over', winner: w, loser: f });
      }
    }
  }

  integrate(f) {
    const dx = (f.vx + f.kx) * DT;
    const dy = (f.vy + f.ky) * DT;
    const k = Math.exp(-T.body.friction * DT);
    f.kx *= k;
    f.ky *= k;
    if (Math.abs(f.kx) < 1e-4) f.kx = 0;
    if (Math.abs(f.ky) < 1e-4) f.ky = 0;
    if (!dx && !dy) return;
    const p = this.ground.move(f.x, f.y, dx, dy, f.radius);
    f.walked += Math.hypot(p.x - f.x, p.y - f.y) * (f.state === 'ready' || f.state === 'guard' ? 1 : 0);
    f.x = p.x;
    f.y = p.y;
  }

  /** 몸끼리 겹치지 않게 (둘을 반씩 밀어냄) */
  separate(A, B) {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const min = A.radius + B.radius;
    if (d >= min || A.dead || B.dead) return;
    const push = (min - d) / 2;
    const nx = dx / d;
    const ny = dy / d;
    const pa = this.ground.move(A.x, A.y, -nx * push, -ny * push, A.radius);
    const pb = this.ground.move(B.x, B.y, nx * push, ny * push, B.radius);
    [A.x, A.y, B.x, B.y] = [pa.x, pa.y, pb.x, pb.y];
  }

  /**
   * 주도권: 둘 중 누가 먼저 다음 행동을 시작할 수 있는가 (강제 턴이 아니라 회복·경직의 차이에서 생긴다).
   * 반환: { leader: Fighter | null, adv: s, a, b } — 가까이(3.4 m) 있고 차이가 0.06 s 이상일 때만 leader.
   */
  initiative() {
    const [A, B] = this.fighters;
    const a = A.initiativeIn(this.time);
    const b = B.initiativeIn(this.time);
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    const adv = b - a;
    const leader = d > 3.4 || Math.abs(adv) < 0.06 || !isFinite(adv) ? null : adv > 0 ? A : B;
    return { leader, adv: Math.abs(adv), a, b, dist: d };
  }

  updateLead() {
    const { leader } = this.initiative();
    if (leader && leader !== this.lead) {
      if (this.lead) this.stats.leadChanges++;
      this.lead = leader;
      this.emit({ type: 'lead', by: leader });
    }
  }
}
