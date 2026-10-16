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
import { poseOf, BLEND, guardPoseTarget, v3 } from './pose.js';

const AIM_RATE = 24; // (1/s) 방어 손·검이 목표로 붙는 빠르기: 예측 접촉 자세까지 ~0.12 s — 가장 빠른 베기 준비(0.24 s) 안
const GUARD_SPEED = 3; // (m/s) 방어 손의 최고 속도
const GUARD_TURN = (600 * Math.PI) / 180; // (rad/s) 방어 검의 최고 회전

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
    // 상태가 바뀌는 순간의 손·검을 남겨 다음 자세로 섞는다 (그리기 전용). 막는 순간(blockstun)과 경직 반응 중
    // 접촉에서 시작하는 것(parried·clash·overpowered)은 이어 붙이지 않는다: 타격 정지 화면에 실제 접촉 자세가 보이게
    for (const f of this.fighters) {
      const foe = () => this.fighters[1 - f.side];
      f.cutPose = (to) => {
        const dur = BLEND[to] || 0;
        if (!dur) return (f.blend = null);
        const p = poseOf(f, foe(), this.time);
        f.blend = { rel: [p.hand[0] - f.x, p.hand[1] - f.y, p.hand[2]], dir: p.dir, t: this.time, dur };
      };
    }
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

  /**
   * 승부가 났다: 전투를 끝낸다. 두 결투자의 입력 버퍼·쳐내기 창·휘두르는 중인 공격(판정 없이 회복으로)을 지우고 더는
   * 입력을 받지 않게 하며, 컨트롤러(AI의 예약된 누름·연속 공격·의도)도 멈춘다. 쓰러지는 동작·불꽃 같은 그리기는 계속된다.
   */
  endCombat() {
    for (const f of this.fighters) f.endCombat();
    for (const c of this.controllers) if (c && c.endCombat) c.endCombat(this);
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
    // (승부가 난 뒤엔 컨트롤러에 묻지 않는다: 플레이어 입력도 AI 명령도 더 없음 — endCombat)
    const cmds = this.controllers.map((c, i) => (c && !this.over ? c.command(this, this.fighters[i], this.fighters[1 - i]) : {}));
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
    this.updateGuard(A, B);
    this.updateGuard(B, A);
    if (this.over) return; // (승부가 난 뒤: 서 있는 쪽은 동작을 마치고 쓰러진 쪽은 쓰러짐을 마친다 — 판정·통계는 더 없다)
    resolveContacts(this);
    this.updateLead();
    for (const f of this.fighters) {
      if (f.dead && !this.over) {
        const w = f === A ? B : A;
        this.over = { winner: w, loser: f, t: this.time };
        this.endCombat();
        this.emit({ type: 'over', winner: w, loser: f });
      }
    }
  }

  /**
   * 방어(와 자유 자세)의 손·검을 틱마다 목표 쪽으로 (그리기 전용, 틱 단위라 프레임 속도와 무관). 방어를 막 올렸으면 그 자리에서 시작
   * (f.blend가 앞 자세에서 이어 줌), 막는 순간(blockstun)엔 접촉 자세로 바로.
   */
  updateGuard(f, foe) {
    if (!f.guardActive() && f.state !== 'ready') return (f.gpose = null);
    const tgt = guardPoseTarget(f, foe, this.time);
    if (f.state === 'blockstun' || !f.gpose) return (f.gpose = tgt);
    // 목표 쪽으로 지수적으로, 단 손은 GUARD_SPEED m/s, 검은 GUARD_TURN rad/s를 넘지 않게 (겨눌 곳이 바뀌어도 튀지 않음)
    const k = 1 - Math.exp(-AIM_RATE * DT);
    let dr = v3.mul(v3.sub(tgt.rel, f.gpose.rel), k);
    const dl = v3.len(dr);
    if (dl > GUARD_SPEED * DT) dr = v3.mul(dr, (GUARD_SPEED * DT) / dl);
    const want = v3.norm(v3.lerp(f.gpose.dir, tgt.dir, k));
    const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(want, f.gpose.dir))));
    const dir = ang > GUARD_TURN * DT ? v3.norm(v3.lerp(f.gpose.dir, want, (GUARD_TURN * DT) / ang)) : want;
    f.gpose = { rel: v3.add(f.gpose.rel, dr), dir };
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
   * 주도권: 둘 중 누가 먼저 새 행동(공격·회피)을 시작할 수 있는가 — 강제 턴이 아니라 회복·경직의 차이. 표시되는 값은
   * Fighter.actionableIn 그대로라, 그 시간에 실제로 공격이 나간다 (tools/combat/rules.test.mjs "주도권 표시").
   * 한쪽이 휘두르는 중이면 주도권 대신 그 공격(swing: 누가, 판정까지)과 상대가 그 전에 방어를 올릴 수 있는지를 준다.
   * 반환: { leader, adv, a, b (각자 행동 가능까지), ga, gb (각자 방어 가능까지), swing, dist }
   */
  initiative() {
    const [A, B] = this.fighters;
    const now = this.time;
    // (승부가 났으면 주도권 대신 승패 — HUD가 일반 공방 문구보다 먼저 보여 준다)
    if (this.over) return { over: this.over, leader: null, swing: null, adv: 0, a: Infinity, b: Infinity, ga: Infinity, gb: Infinity, dist: Math.hypot(A.x - B.x, A.y - B.y) };
    const a = A.actionableIn(now);
    const b = B.actionableIn(now);
    const ga = A.guardableIn(now);
    const gb = B.guardableIn(now);
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    const ea = A.swingEta();
    const eb = B.swingEta();
    let swing = null;
    if (ea !== null || eb !== null) {
      const by = eb === null || (ea !== null && ea <= eb) ? A : B;
      const eta = by === A ? ea : eb;
      const guard = by === A ? gb : ga;
      swing = { by, eta, kind: by.atk.kind, canGuard: guard <= eta + 1e-9, guardIn: guard };
    }
    const adv = b - a;
    const leader = swing || d > 3.4 || Math.abs(adv) < 0.06 || !isFinite(adv) ? null : adv > 0 ? A : B;
    return { leader, adv: Math.abs(adv), a, b, ga, gb, swing, dist: d };
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
