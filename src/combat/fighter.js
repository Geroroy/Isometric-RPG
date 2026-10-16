// 결투자 한 명의 상태 기계 (docs/COMBAT.md "상태"). 플레이어와 AI가 똑같이 이 클래스를 쓴다: 둘 다 같은 명령
// ({ move, attack, heavy, guard, guardPressed, dodge }) 을 넣고, 같은 시간·자원·제약을 받는다.
//
// 상태: ready(자유) · guard(방어 유지) · attack(windup→active→recovery) · dodge · blockstun(막으며 밀림, 방어 유지됨)
//       · parried(쳐내짐) · clash(동시 공격 튕김) · overpowered(강공격에 밀림) · broken(균형 붕괴) · hitstun(피격) · dead
// 판정(맞았는가·막았는가)은 rules.js가 정하고, 여기서는 그 결과에 따라 상태만 바꾼다.
import { TUNING as T, DT } from './tuning.js';
import { angleDiff, clamp } from '../core/math.js';

const TIMED = new Set(['blockstun', 'parried', 'clash', 'overpowered', 'broken', 'hitstun']);
const NO_MOVE = { x: 0, y: 0 };

/** 공격·회피 입력이 지금 막혀 있는 이유 (막혀 있지 않으면 null) — HUD와 디버그에 그대로 보인다. */
const REASON = {
  windup: '공격 준비 중 — 취소 불가',
  active: '공격 판정 중',
  locked: (s) => `공격 회복 중 (${Math.max(0.01, s).toFixed(2)}s 남음)`,
  blockstun: '막으며 밀리는 중',
  parried: '쳐내져 경직',
  clash: '검이 맞부딪혀 튕김',
  overpowered: '강공격에 밀림',
  broken: '균형 붕괴 — 방어 불가',
  hitstun: '피격 경직',
  dodge: '회피 중',
  dodgeCd: '회피 재사용 대기',
  noChain: '연속 공격 끝 — 회복 후 다시',
  noHeavyChain: '이 베기에서는 강공격으로 못 이음',
  dead: '쓰러짐',
};

let ATTACK_SEQ = 1;

export class Fighter {
  /** `cast`: tuning.js CAST의 항목, `side`: 0 | 1 (sim의 순서) */
  constructor(id, cast, side) {
    this.id = id;
    this.cast = cast;
    this.name = cast.name;
    this.side = side;
    this.radius = T.body.radius;
    this.reset(0, 0, 0);
  }

  reset(x, y, facing) {
    this.x = x;
    this.y = y;
    this.vx = this.vy = 0; // 걷기 속도
    this.kx = this.ky = 0; // 밀려남 속도
    this.facing = facing;
    this.hp = T.body.hp;
    this.bal = T.body.balance;
    this.state = 'ready';
    this.st = 0; // 현재 상태에 들어온 뒤 시간
    this.dur = 0; // TIMED 상태의 길이
    this.atk = null;
    this.lastAtk = null; // 끝난 공격 (자세 이어 그리기용)
    this.dodge = null;
    this.moveIn = NO_MOVE;
    this.guardHeld = false;
    this.press = null; // 마지막 방어 입력 { t, granted, used }
    this.lastPressT = -99;
    this.parryUntil = -1; // 쳐내기 판정 창이 열려 있는 시각까지
    this.actLockUntil = -1; // 이 시각까지 공격·회피 불가 (쳐내진 뒤 방어만 먼저 올린 경우)
    this.buffer = null; // { type: 'light' | 'heavy' | 'dodge', t, dir, reason }
    this.reject = null; // 마지막으로 버려진 입력과 이유 { type, reason, t }
    this.dodgeReadyT = 0;
    this.balLossT = -99;
    this.shakenUntil = -1;
    this.contact = null; // 마지막 접촉 (자세: 막힌 검이 멈춘 자리 등) { kind, at, t, role }
    this.walked = 0; // 걸은 거리 (발 애니메이션)
    this.koT = 0;
    this.guardAfter = Infinity; // (parried: 이 시간 뒤 방어 가능)
    this.blend = null; // (그리기: 상태가 바뀌기 전 손·검 — pose.js)
    this.combatOver = false; // 승부가 났다 (sim.endCombat): 입력을 받지 않는다
    this.gpose = null; // (그리기: 방어 손·검 — sim.js updateGuard)
  }

  // ---------------------------------------------------------------- 질의

  get dead() {
    return this.state === 'dead';
  }

  /** 방어가 서 있는가 (막을 수 있는 상태). blockstun도 방어가 유지된 상태다. */
  guardActive() {
    return this.state === 'guard' || this.state === 'blockstun';
  }

  parryActive(now) {
    return this.guardActive() && now <= this.parryUntil;
  }

  /** 회피 무적 구간인가 */
  invulnerable() {
    if (this.state !== 'dodge') return false;
    const [a, b] = T.dodge.iframes;
    return this.st >= a && this.st <= b;
  }

  /** 지금 회복 잠김이 끝나는 공격 시간 (recovery 기준) */
  lockEnd() {
    const a = this.atk;
    return a.def.chainAt + (a.outcome === 'whiff' ? a.def.whiffExtra : 0);
  }

  /** 공격·강공격·회피가 지금 불가능한 이유 (가능하면 null) */
  blockReason(type, now) {
    const s = this.state;
    if (s === 'dead') return REASON.dead;
    if (TIMED.has(s)) return REASON[s];
    if (s === 'dodge') return REASON.dodge;
    if (now < this.actLockUntil) return REASON.parried;
    if (type === 'dodge' && now < this.dodgeReadyT) return REASON.dodgeCd;
    if (s === 'attack') {
      const a = this.atk;
      if (a.phase === 'windup') return REASON.windup;
      if (a.phase === 'active') return REASON.active;
      const left = this.lockEnd() - a.recT;
      if (left > 1e-9) return REASON.locked(left);
      if (type === 'light' && !a.def.next) return REASON.noChain;
      if (type === 'heavy' && !a.def.heavyChain) return REASON.noHeavyChain;
    }
    return null;
  }

  /** 방어를 올릴 수 있는가 (붙잡고 있는 버튼이 실제 방어가 되는 상태) */
  canGuard() {
    const s = this.state;
    if (s === 'ready' || s === 'guard') return true;
    if (s === 'attack') return this.atk.phase === 'recovery' && this.atk.recT >= this.lockEnd() - 1e-9;
    if (s === 'parried') return this.st >= this.guardAfter - 1e-9;
    return false;
  }

  /** 방어를 올릴 수 있을 때까지 남은 시간 (이미 서 있으면 0) — 주도권 표시: 상대가 먼저 쳐도 막을 수 있는가 */
  guardableIn(now) {
    const s = this.state;
    if (s === 'dead') return Infinity;
    if (s === 'ready' || s === 'guard' || s === 'blockstun') return 0;
    if (s === 'parried') return Math.max(0, this.guardAfter - this.st);
    if (TIMED.has(s)) return Math.max(0, this.dur - this.st);
    if (s === 'dodge') return Math.max(0, T.dodge.dur - this.st);
    if (s === 'attack') {
      const a = this.atk;
      if (a.phase === 'recovery') return Math.max(0, this.lockEnd() - a.recT);
      return this.actionableIn(now);
    }
    return 0;
  }

  /** 휘두르는 중인 공격이 판정에 이르기까지 (휘두르는 중이 아니면 null) */
  swingEta() {
    if (this.state !== 'attack' || this.atk.phase === 'recovery') return null;
    return Math.max(0, this.atk.def.windup - this.atk.t);
  }

  /** 다음 행동(공격)을 시작할 수 있을 때까지 남은 시간 */
  actionableIn(now) {
    const s = this.state;
    if (s === 'dead') return Infinity;
    if (s === 'ready' || s === 'guard') return Math.max(0, this.actLockUntil - now);
    if (TIMED.has(s)) return Math.max(this.dur - this.st, this.actLockUntil - now, 0);
    if (s === 'dodge') return Math.max(0, T.dodge.dur - this.st);
    if (s === 'attack') {
      const a = this.atk;
      // (이어 갈 공격이 없는 베기는 회복이 다 끝나야 새 행동)
      const lock = a.def.next || a.def.heavyChain ? this.lockEnd() : a.def.recovery + (a.outcome === 'whiff' ? a.def.whiffExtra : 0);
      if (a.phase === 'windup') return a.def.windup - a.t + a.def.active + lock;
      if (a.phase === 'active') return a.def.windup + a.def.active - a.t + lock;
      return Math.max(0, lock - a.recT);
    }
    return 0;
  }

  // ---------------------------------------------------------------- 입력

  /**
   * 한 틱의 명령을 받는다 (타격 정지 중에도 불림: 누른 입력은 이렇게 기억되고, 시간은 멈춰 있으므로 만료되지 않는다).
   * cmd: { move: {x,y} 월드 단위 벡터, attack, heavy, dodge: 누른 순간(edge), guard: 누르고 있음, guardPressed: 누른 순간 }
   */
  ingest(cmd, now) {
    if (this.combatOver) return; // (승부가 난 뒤: 아무 입력도 받지 않는다)
    this.moveIn = cmd.move || NO_MOVE;
    this.guardHeld = !!cmd.guard;
    if (cmd.guardPressed) {
      // 쳐내기 창은 '새로 누른' 입력에만, 그리고 직전 입력에서 parryRearm이 지났을 때만 (연타·유지로는 반복되지 않음)
      const granted = now - this.lastPressT >= T.guard.parryRearm;
      this.lastPressT = now;
      this.press = { t: now, granted, used: false };
      if (this.guardActive()) this.openParry(now); // (이미 방어가 서 있으면 — blockstun 중 다시 누른 경우 — 바로)
    }
    const dir = cmd.move && (cmd.move.x || cmd.move.y) ? { x: cmd.move.x, y: cmd.move.y } : null;
    for (const type of ['attack', 'heavy', 'dodge']) {
      if (!cmd[type]) continue;
      // 버퍼는 한 칸: 마지막 입력만 남는다 (여러 번 누른 공격이 긴 대기열로 쌓이지 않음)
      const was = this.buffer && this.buffer.type;
      this.buffer = { type: type === 'attack' ? 'light' : type, t: now, dir, reason: null };
      // (회복 중 이어 베기를 누르면 회수가 다음 베기 준비 쪽으로 바뀐다: 그 자세로 이어 붙임)
      if (this.cutPose && this.state === 'attack' && this.atk.phase === 'recovery' && was !== this.buffer.type) this.cutPose('buffer');
    }
  }

  /**
   * 승부가 났다 (sim.endCombat): 버퍼·방어 입력·쳐내기 창을 지우고, 휘두르는 중이던 공격은 판정 없이 회복으로 돌린다
   * (outcome 'ended' — 헛침도 아니다). 그 뒤 ingest는 아무것도 받지 않는다. 회복·쓰러짐 같은 동작은 그대로 끝까지 간다.
   */
  endCombat() {
    this.combatOver = true;
    this.buffer = null;
    this.reject = null;
    this.press = null;
    this.parryUntil = -1;
    this.guardHeld = false;
    this.moveIn = NO_MOVE;
    if (this.state === 'attack' && this.atk.phase !== 'recovery') this.toRecovery('ended');
  }

  openParry(now) {
    const p = this.press;
    if (!p || p.used || !p.granted || now - p.t > T.input.buffer) return;
    p.used = true;
    this.parryUntil = now + T.guard.parryWindow;
  }

  // ---------------------------------------------------------------- 한 틱

  /** 상태를 한 틱 진행한다 (이동 적분과 판정은 sim이 이어서 한다). */
  step(foe, sim) {
    const now = sim.time;
    this.st += DT;
    if (this.state === 'dead') {
      this.koT += DT;
      this.vx = this.vy = 0;
      return;
    }
    // 끝난 시간 상태 → ready (같은 틱에 ready 처리까지: 방어·버퍼 입력이 한 틱 늦지 않게)
    if (TIMED.has(this.state) && this.st >= this.dur - 1e-9) this.endTimed(now);
    this.regenBalance(foe, now);
    this.expireBuffer(now);

    switch (this.state) {
      case 'ready':
      case 'guard':
        this.stepFree(foe, sim, now);
        break;
      case 'attack':
        this.stepAttack(foe, sim, now);
        break;
      case 'dodge':
        this.stepDodge(foe, sim, now);
        break;
      case 'blockstun':
        this.turnTo(foe, T.body.turnBlockstun);
        this.brake();
        break;
      case 'parried':
        // 방어는 parriedGuard 뒤부터 다시 올릴 수 있다 (공격·회피는 actLockUntil까지 불가)
        if (this.guardHeld && this.st >= this.guardAfter - 1e-9) {
          this.setState('guard');
          this.openParry(now);
        }
        this.brake();
        break;
      default:
        this.brake();
    }
  }

  endTimed(now) {
    if (this.state === 'broken') this.bal = Math.max(this.bal, T.balance.brokenRestore);
    this.setState('ready');
  }

  setState(s, dur = 0) {
    if (this.cutPose && s !== this.state) this.cutPose(s); // (자세 이어 붙이기: sim.js — 그리기만, 판정과 무관)
    if (s !== 'attack' && this.atk) {
      this.lastAtk = this.atk;
      this.atk = null;
    }
    if (s !== 'dodge') this.dodge = null;
    this.state = s;
    this.st = 0;
    this.dur = dur;
  }

  /** 시간 상태(경직)로: 공격 중이었으면 그 공격은 취소된다 */
  setTimed(s, dur, guardAfter = Infinity) {
    this.setState(s, dur);
    this.guardAfter = guardAfter;
  }

  expireBuffer(now) {
    const b = this.buffer;
    if (!b) return;
    // (만료되는 틱에 마침 가능해졌으면 버리지 않는다: 이 틱의 tryBuffered가 실행)
    if (now - b.t > T.input.buffer + 1e-9 && this.blockReason(b.type, now)) {
      this.reject = { type: b.type, reason: b.reason || this.blockReason(b.type, now) || '입력 시간 초과', t: now };
      this.buffer = null;
    }
  }

  /** 버퍼의 행동이 지금 가능하면 시작한다. 가능하지 않으면 이유를 남긴다. */
  tryBuffered(foe, sim, now) {
    const b = this.buffer;
    if (!b) return false;
    const why = this.blockReason(b.type, now);
    if (why) {
      b.reason = why;
      return false;
    }
    this.buffer = null;
    this.reject = null;
    if (b.type === 'dodge') this.startDodge(b.dir, foe, sim, now);
    else {
      const chainFrom = this.state === 'attack' ? this.atk : null;
      const kind = b.type === 'heavy' ? 'heavy' : chainFrom ? chainFrom.def.next : 'light1';
      this.startAttack(kind, foe, sim, now, chainFrom ? chainFrom.combo + 1 : 1);
    }
    return true;
  }

  stepFree(foe, sim, now) {
    if (this.tryBuffered(foe, sim, now)) return;
    if (this.guardHeld && this.state !== 'guard') {
      this.setState('guard');
      this.openParry(now);
    } else if (!this.guardHeld && this.state === 'guard') this.setState('ready');
    const guard = this.state === 'guard';
    this.turnTo(foe, guard ? T.body.turnGuard : T.body.turnFree);
    this.locomote(foe, guard ? T.body.guardMoveSpeed : T.body.moveSpeed);
  }

  startAttack(kind, foe, sim, now, combo) {
    const def = T.attacks[kind];
    this.setState('attack');
    this.atk = { id: ATTACK_SEQ++, kind, def, t: 0, recT: 0, phase: 'windup', resolved: false, outcome: null, evaded: false, combo, lunged: 0 };
    this.parryUntil = -1;
    sim.emit({ type: 'swing', by: this, kind, combo });
  }

  stepAttack(foe, sim, now) {
    const a = this.atk;
    const def = a.def;
    a.t += DT;
    if (a.phase === 'windup') {
      // 회전 보정은 준비 동작 동안만, 한도 안에서: 이후엔 방향이 고정된다 (측면 회피·헛치기가 성립)
      this.turnTo(foe, def.turn);
      if (a.t >= def.windup - 1e-9) {
        a.phase = 'active';
        sim.emit({ type: 'active', by: this, kind: a.kind });
      }
    }
    // 내딛기: windup 후반부터 active 끝까지, 최대 lunge m, 상대에게 lungeStop보다 가까워지지 않음
    if (a.phase !== 'recovery') {
      const t0 = def.windup * 0.45;
      const t1 = def.windup + def.active;
      if (a.t > t0 && a.lunged < def.lunge) {
        const d = Math.hypot(foe.x - this.x, foe.y - this.y);
        const step = Math.min(def.lunge - a.lunged, (def.lunge / (t1 - t0)) * DT);
        if (d - step > T.lungeStop) {
          this.x += Math.cos(this.facing) * step;
          this.y += Math.sin(this.facing) * step;
          a.lunged += step;
        } else a.lunged = def.lunge;
      }
      this.vx = this.vy = 0;
    }
    if (a.phase === 'active' && !a.resolved && a.t >= def.windup + def.active - 1e-9) {
      // 판정 구간이 끝날 때까지 아무것도 맞히지 못했다: 헛침 (회복에 whiffExtra)
      const d = Math.hypot(foe.x - this.x, foe.y - this.y);
      const ang = Math.abs(angleDiff(this.facing, Math.atan2(foe.y - this.y, foe.x - this.x)));
      const why = a.evaded ? 'evade' : d > def.reach ? 'range' : ang > def.arc ? 'angle' : 'none';
      this.toRecovery('whiff');
      sim.emit({ type: 'whiff', by: this, target: foe, kind: a.kind, why, dist: d, extra: def.whiffExtra });
      return;
    }
    if (a.phase === 'recovery') {
      a.recT += DT;
      if (this.tryBuffered(foe, sim, now)) return;
      if (this.guardHeld && this.canGuard()) {
        this.setState('guard');
        this.openParry(now);
        return;
      }
      if (a.recT >= def.recovery + (a.outcome === 'whiff' ? def.whiffExtra : 0) - 1e-9) {
        this.setState('ready');
        this.stepFree(foe, sim, now); // (끝난 틱에 바로: 버퍼·방어가 한 틱 늦지 않게)
      }
    }
  }

  /** 판정이 났거나 헛친 공격을 회복 구간으로 */
  toRecovery(outcome) {
    const a = this.atk;
    a.resolved = true;
    a.outcome = outcome;
    a.phase = 'recovery';
    a.recT = 0;
  }

  startDodge(dir, foe, sim, now) {
    let dx, dy;
    if (dir) [dx, dy] = [dir.x, dir.y];
    else {
      // 방향 없음 = 뒷걸음
      const d = Math.hypot(this.x - foe.x, this.y - foe.y) || 1;
      [dx, dy] = [(this.x - foe.x) / d, (this.y - foe.y) / d];
    }
    const l = Math.hypot(dx, dy) || 1;
    this.setState('dodge');
    this.dodge = { dx: dx / l, dy: dy / l, moved: 0 };
    this.dodgeReadyT = now + T.dodge.cooldown;
    this.parryUntil = -1;
    this.loseBal(T.dodge.balCost, now, 1);
    sim.emit({ type: 'dodge', by: this, dir: this.dodge });
  }

  stepDodge(foe, sim, now) {
    const D = T.dodge.dur - T.dodge.lockTail;
    const dg = this.dodge;
    if (this.st <= D) {
      // 사인 곡선 속도: 적분하면 정확히 dist
      const v = ((T.dodge.dist * Math.PI) / (2 * D)) * Math.sin((Math.PI * Math.min(this.st, D)) / D);
      this.vx = dg.dx * v;
      this.vy = dg.dy * v;
    } else this.vx = this.vy = 0;
    if (this.st >= T.dodge.dur - 1e-9) {
      this.setState('ready');
      this.stepFree(foe, sim, now); // (끝난 틱에 바로: 버퍼·방어)
    }
  }

  // ---------------------------------------------------------------- 이동·자원

  turnTo(foe, rate) {
    const want = Math.atan2(foe.y - this.y, foe.x - this.x);
    const d = angleDiff(this.facing, want);
    const m = rate * DT;
    this.facing += clamp(d, -m, m);
  }

  locomote(foe, speed) {
    const m = this.moveIn;
    let tx = 0;
    let ty = 0;
    const l = Math.hypot(m.x, m.y);
    if (l > 0.01) {
      const ux = m.x / l;
      const uy = m.y / l;
      // 상대 기준 방향에 따라: 다가가기 1, 옆걸음 sideFactor, 물러나기 backFactor
      const fd = Math.hypot(foe.x - this.x, foe.y - this.y) || 1;
      const dot = (ux * (foe.x - this.x) + uy * (foe.y - this.y)) / fd;
      const k = dot >= 0 ? 1 + (T.body.sideFactor - 1) * (1 - dot) : T.body.sideFactor + (T.body.backFactor - T.body.sideFactor) * -dot;
      tx = ux * speed * k;
      ty = uy * speed * k;
    }
    const a = T.body.accel * DT;
    const dx = tx - this.vx;
    const dy = ty - this.vy;
    const dl = Math.hypot(dx, dy);
    if (dl <= a) [this.vx, this.vy] = [tx, ty];
    else [this.vx, this.vy] = [this.vx + (dx / dl) * a, this.vy + (dy / dl) * a];
  }

  brake() {
    const a = T.body.accel * DT;
    const l = Math.hypot(this.vx, this.vy);
    if (l <= a) this.vx = this.vy = 0;
    else [this.vx, this.vy] = [this.vx * (1 - a / l), this.vy * (1 - a / l)];
  }

  /** 균형 손실. `floor` 아래로는 내려가지 않는다 (피격·회피로는 균형 붕괴가 나지 않게). 0이 되면 true. */
  loseBal(n, now, floor = 0) {
    if (n <= 0) return false;
    this.bal = Math.max(floor, this.bal - n);
    this.balLossT = now;
    return this.bal <= 0;
  }

  /**
   * 균형 회복: 마지막 손실에서 regenDelay가 지나고, 자유롭게 서 있을 때만. 상대와 가까우면 거의 없고(nearMult),
   * 방어를 들고 있으면 guardMult배 — 방어만 유지해서는 압박을 상쇄하지 못한다.
   */
  regenBalance(foe, now) {
    if (this.bal >= T.body.balance) return;
    if (this.state !== 'ready' && this.state !== 'guard') return;
    if (now - this.balLossT < T.balance.regenDelay) return;
    const B = T.balance;
    const d = Math.hypot(foe.x - this.x, foe.y - this.y);
    const far = clamp((d - B.nearDist) / (B.farDist - B.nearDist), 0, 1);
    const k = (B.nearMult + (1 - B.nearMult) * far) * (this.state === 'guard' ? B.guardMult : 1);
    this.bal = Math.min(T.body.balance, this.bal + B.regenRate * k * DT);
  }

  /** 밀어내기: `dist` m를 (마찰로 줄어드는) 속도로 */
  push(dx, dy, distance) {
    const l = Math.hypot(dx, dy) || 1;
    const v = distance * T.body.friction;
    this.kx += (dx / l) * v;
    this.ky += (dy / l) * v;
  }

  /** 관측 가능한 모습 (AI는 상대의 이것만, 그것도 반응 시간만큼 늦게 본다: ai.js) */
  observe(now) {
    const a = this.atk;
    return {
      t: now,
      x: this.x,
      y: this.y,
      facing: this.facing,
      state: this.state,
      st: this.st,
      dur: this.dur,
      atkId: a ? a.id : 0,
      atkKind: a ? a.kind : null,
      atkPhase: a ? a.phase : null,
      atkT: a ? a.t : 0,
      atkRecT: a ? a.recT : 0,
      atkOutcome: a ? a.outcome : null,
      guarding: this.guardActive(),
      hp: this.hp,
      bal: this.bal,
    };
  }
}
