// 결투 AI (docs/COMBAT.md "AI"). 플레이어와 같은 명령(fighter.js ingest)만 내고, 같은 시간·균형·회복을 받는다 —
// 무적·무한 균형·회복 무시 없음. 플레이어의 입력은 읽지 않는다: 상대의 '보이는 모습'(Fighter.observe — 자세·위치·
// 공격 단계)을 반응 시간만큼 늦게 보고(history), 그 관측과 거리로 판단한다. 판단은 think 간격마다, 실수와 타이밍
// 오차가 있다 (persona).
import { TUNING as T } from './tuning.js';
import { RNG, angleDiff } from '../core/math.js';

/**
 * 성향. 수치는 가설값 (tuning.js와 같은 취지: 시험장에서 맞춘다).
 *   reaction   관측 지연 범위 (s) — 상대의 공격을 '보는' 데 걸리는 시간
 *   think      판단 간격 (s)
 *   pref       선호 거리 [가까이, 멀리] (m)
 *   engage     이보다 멀면 다가간다, attackRange: 중립에서 공격을 시작하는 거리 (사거리보다 조금 안: 물러나는 상대에 헛치지 않게)
 *   aggression 중립에서 사거리 안일 때 공격을 시작하는 빈도 (초당, 판단 간격으로 환산)
 *   strings    연속 공격 길이 가중치 [1타, 2타, 3타]
 *   heavy      공격 시작 때 강공격을 고를 확률 (상대가 방어를 많이 할수록 heavyVsGuard 더함)
 *   overcommit 막혀도 연속 공격을 계속할 확률
 *   defend     공격을 보았을 때 [쳐내기, 막기, 회피, 맞받아치기] 가중치
 *   timing     쳐내기·회피 타이밍 오차 (s, 표준편차 비슷)
 *   mistake    공격을 보고도 아무것도 안 할 확률
 *   punish     상대의 빈틈(헛침·쳐내짐·균형 붕괴)을 보았을 때 파고들 확률
 *   retreatBal 균형이 이 아래면 물러나 자세를 정비
 *   strafe     거리 유지 중 옆걸음 비율, guardIdle: 가까이서 기다릴 때 방어를 들 확률
 *   holdAfterBlock 막은 뒤 방어를 더 들고 있는 시간 (다음 베기는 보고 반응하기엔 빠르다: 예상해서 든다)
 *   readParry  막은 뒤 다음 베기를 '읽고' 그 타이밍에 쳐내기를 노릴 확률 (빗나가면 방어로 남음)
 *   riposte    막은 뒤 밀림이 끝나자마자 되받아 칠 확률 (확정이 아닌 읽기: 상대가 이어 치면 부딪히거나 맞는다)
 *   patience   거리를 재며 기다리는 시간 범위 (s): 지나면 스스로 파고들어 압박한다 (상대가 가만히 있어도 공방이 생기게)
 */
export const PERSONAS = {
  anakin: {
    label: '아나킨 성향: 전진·연속 압박·강공격 돌파',
    reaction: [0.17, 0.26],
    think: [0.06, 0.11],
    pref: [1.45, 1.85],
    engage: 2.3,
    attackRange: 1.85,
    aggression: 2.2,
    strings: [0.2, 0.45, 0.35],
    heavy: 0.16,
    heavyVsGuard: 0.3,
    overcommit: 0.5,
    defend: [0.28, 0.42, 0.12, 0.18],
    timing: 0.055,
    mistake: 0.13,
    punish: 0.7,
    retreatBal: 22,
    strafe: 0.3,
    guardIdle: 0.25,
    holdAfterBlock: 0.32,
    readParry: 0.12,
    riposte: 0.35,
    patience: [0.6, 1.4],
  },
  obiwan: {
    label: '오비완 성향: 거리 조절·방어·빈틈 응징',
    reaction: [0.16, 0.24],
    think: [0.06, 0.1],
    pref: [2.15, 2.65],
    engage: 3.0,
    attackRange: 1.98,
    aggression: 1.2,
    strings: [0.55, 0.4, 0.05],
    heavy: 0.06,
    heavyVsGuard: 0.08,
    overcommit: 0.12,
    defend: [0.42, 0.4, 0.13, 0.05],
    timing: 0.045,
    mistake: 0.1,
    punish: 0.85,
    retreatBal: 42,
    strafe: 0.6,
    guardIdle: 0.6,
    holdAfterBlock: 0.55,
    readParry: 0.3,
    riposte: 0.4,
    patience: [1.6, 3.2],
  },
};

const INTENT = {
  approach: '접근',
  spacing: '거리 유지',
  pressure: '압박',
  guard: '방어',
  parry: '쳐내기 시도',
  dodge: '회피',
  counter: '맞받아치기',
  punish: '빈틈 응징',
  retreat: '후퇴 (균형 회복)',
  advance: '제한된 전진 (이어 베기엔 멂)',
  abort: '공격 중단 (상대가 빠짐)',
  press: '방어하며 밀고 들어감 (유도 읽음)',
  chase: '추격 (균형 붕괴)',
  idle: '대기',
};

export class AIController {
  constructor(persona, seed = 1) {
    this.p = typeof persona === 'string' ? PERSONAS[persona] : persona;
    this.seed = seed;
    this.reset();
  }

  reset(sim) {
    this.rng = new RNG(this.seed + (sim ? sim.round * 7919 : 0));
    this.hist = []; // 상대 관측 기록 (반응 시간만큼 늦게 꺼내 본다)
    this.nextThink = 0;
    this.delay = this.p.reaction[0];
    this.intent = 'idle';
    this.move = { x: 0, y: 0 };
    this.guard = false;
    this.guardPrev = false;
    this.tapRelease = false;
    this.presses = []; // 예약된 누름 { type: 'attack'|'heavy'|'dodge'|'tap', at, dir }
    this.handled = 0; // 이미 대응을 정한 상대 공격 id
    this.guardUntil = -1;
    this.string = null; // 진행 중인 연속 공격 { left, heavyEnd }
    this.side = this.rng.chance(0.5) ? 1 : -1;
    this.sideT = 0;
    this.seen = null;
    this.foeGuards = 0; // 최근 상대가 막은 횟수 (강공격 돌파 판단)
    this.lastOutcomeId = 0;
    this.idleGuardT = 0;
    this.idleGuard = false;
    this.waitUntil = this.rng.range(...this.p.patience);
    this.advanceUntil = -1;
    this.baited = 0; // 첫 베기가 물러나는 상대에게 사거리 밖으로 헛친 횟수 (시간이 지나면 줄어듦): 많을수록 더 다가가서 친다
    this.seenWhiffId = 0;
    this.decisions = { chain: 0, advance: 0, abort: 0, stopBlocked: 0 }; // (이어 베기 판단 기록: 검증용)
    this.lastJudge = null; // 최근 이어 베기 판단 { what, dPred, reach, t } (디버그 표시)
  }

  /**
   * 관측한 상대의 바닥 속도 (지연된 관측 두 개의 차이 — 실제 입력이 아니라 보이는 움직임)
   */
  observedVel(o) {
    let prev = null;
    for (const h of this.hist) {
      if (h.t > o.t - 0.08 + 1e-9) break;
      prev = h;
    }
    if (!prev || o.t - prev.t < 0.02) return { x: 0, y: 0 };
    return { x: (o.x - prev.x) / (o.t - prev.t), y: (o.y - prev.y) / (o.t - prev.t) };
  }

  /** `lead` 초 뒤 상대와의 거리 예상 (관측 위치 + 관측 속도, 내 내딛기 `lunge`만큼 줄여서) */
  predictDist(me, o, now, lead, lunge = 0) {
    const v = this.observedVel(o);
    const ahead = Math.min(0.5, now - o.t + lead); // (관측 지연만큼과 앞으로 lead만큼: 0.5 s 넘게 내다보지는 않음)
    const x = o.x + v.x * ahead;
    const y = o.y + v.y * ahead;
    return Math.hypot(x - me.x, y - me.y) - lunge;
  }

  /** 지연된 관측: 지금 - delay 시각의 상대 모습 */
  observed(now) {
    const want = now - this.delay;
    let o = this.hist[0];
    for (const h of this.hist) {
      if (h.t > want + 1e-9) break;
      o = h;
    }
    return o;
  }

  command(sim, me, foe) {
    const now = sim.time;
    if (!this.hist.length || this.hist[this.hist.length - 1].t < now) this.hist.push(foe.observe(now));
    while (this.hist.length > 2 && this.hist[1].t < now - 0.6) this.hist.shift();
    const o = this.observed(now);
    this.seen = o;
    if (now >= this.nextThink && !sim.over) {
      this.thinkDt = this.rng.range(...this.p.think);
      this.nextThink = now + this.thinkDt;
      this.delay = this.rng.range(...this.p.reaction);
      this.think(sim, me, o, now);
    }
    this.afterBlock(me, o, now);
    this.learnBait(me, now);
    this.continueString(me, now);
    return this.emit(me, o, now);
  }

  // ---------------------------------------------------------------------------- 판단

  think(sim, me, o, now) {
    const P = this.p;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (o.state === 'dead' || me.dead) {
      this.intent = 'idle';
      this.move = { x: 0, y: 0 };
      this.guard = false;
      return;
    }
    // 상대가 막는 걸 본 횟수 (강공격으로 돌파할지)
    if (o.state === 'blockstun') this.foeGuards = Math.min(6, this.foeGuards + 0.5);
    else this.foeGuards = Math.max(0, this.foeGuards - 0.02);

    // 1. 공격이 들어온다
    const threat = this.threat(me, o, d);
    if (threat) {
      if (this.handled !== o.atkId) {
        this.handled = o.atkId;
        this.respond(me, o, d, threat, now);
      }
      return;
    }
    if (now > this.guardUntil && this.intent !== 'guard') this.guard = false;

    // 2. 상대의 빈틈
    const def = (k) => T.attacks[k];
    const lockLeft = o.atkPhase === 'recovery' ? def(o.atkKind).chainAt + (o.atkOutcome === 'whiff' ? def(o.atkKind).whiffExtra : 0) - o.atkRecT - (now - o.t) : 0;
    const openLeft = o.state === 'broken' || o.state === 'parried' || o.state === 'overpowered' || o.state === 'hitstun' ? o.dur - o.st - (now - o.t) : o.state === 'attack' && o.atkPhase === 'recovery' ? lockLeft : 0;
    const myWind = def('light1').windup;
    if (openLeft > 0.04 && me.state !== 'attack') {
      const reachable = d <= def('light1').reach + 0.15;
      if (o.state === 'broken') {
        this.intent = 'chase';
        this.guard = false;
        if (reachable && this.rng.chance(P.punish)) {
          const heavy = openLeft > def('heavy').windup + 0.08 && this.rng.chance(0.55);
          this.attack(me, now, heavy ? 'heavy' : 'attack', heavy ? 0 : 2);
        } else this.moveToward(me, o, 1);
        return;
      }
      if (reachable && openLeft > myWind * 0.6 && this.rng.chance(P.punish)) {
        this.intent = 'punish';
        this.guard = false;
        this.attack(me, now, 'attack', this.rng.chance(0.5) ? 2 : 1);
        return;
      }
    }
    if (me.state === 'attack' && this.string) return; // (연속 공격 중: continueString)
    if (now < this.advanceUntil) {
      // 제한된 전진: 이어 베기엔 멀어 몇 걸음 다가간 뒤 다시 판단 (방어는 내린 채 — 다가가는 동안이 빈틈)
      this.intent = 'advance';
      this.guard = false;
      this.moveToward(me, o, 1);
      return;
    }

    // 3. 균형이 낮다: 물러나 자세 정비
    if (me.bal < P.retreatBal || (this.intent === 'retreat' && me.bal < P.retreatBal + 25)) {
      this.intent = 'retreat';
      this.moveAway(me, o, 1);
      this.guard = d < 2.6;
      if (d < 2.4 && me.bal > 8 && this.rng.chance(0.08)) this.press(now, 'dodge', this.awayDir(me, o));
      return;
    }

    // 4. 중립: 거리와 성향
    const [near, far] = P.pref;
    if (d > P.engage) {
      this.intent = 'approach';
      this.guard = false;
      this.moveToward(me, o, 1);
      return;
    }
    // 공격을 시작할지: 지금 거리가 아니라 판정 시점(준비 시간 뒤)의 예상 거리로 — 물러나는 상대에게 헛치지 않게
    const dHit = this.predictDist(me, o, now, T.attacks.light1.windup, T.attacks.light1.lunge * 0.6);
    const closer = Math.min(0.45, this.baited * 0.18); // (유도에 걸린 만큼 더 붙어서)
    const inReach = d <= P.attackRange + 0.25 - closer && dHit <= T.attacks.light1.reach - 0.12 - closer;
    if (!inReach && this.baited >= 1.5 && d < P.engage && this.rng.chance(0.35)) {
      // 유도를 읽음: 방어를 든 채 밀고 들어가 상대가 물러날 자리를 줄인다
      this.intent = 'press';
      this.guard = true;
      this.guardUntil = now + 0.25;
      this.moveToward(me, o, 1);
      return;
    }
    // 오래 기다렸다: 스스로 파고든다
    if (this.intent !== 'spacing' && this.intent !== 'pressure') this.waitUntil = Math.max(this.waitUntil, now + this.rng.range(...P.patience) * 0.5);
    if (now > this.waitUntil && !inReach) {
      this.intent = 'pressure';
      this.guard = false;
      this.moveToward(me, o, 1);
      return;
    }
    if (inReach && (now > this.waitUntil || this.rng.chance(1 - Math.exp(-P.aggression * this.thinkDt)))) {
      this.waitUntil = now + this.rng.range(...P.patience);
      const heavy = this.rng.chance(P.heavy + (this.foeGuards > 2 ? P.heavyVsGuard : 0));
      this.intent = 'pressure';
      this.guard = false;
      this.attack(me, now, heavy ? 'heavy' : 'attack', heavy ? 0 : this.pickLen() - 1);
      return;
    }
    this.intent = 'spacing';
    if (now > this.sideT) {
      this.sideT = now + this.rng.range(0.6, 1.6);
      if (this.rng.chance(0.4)) this.side = -this.side;
    }
    const strafe = this.rng.chance(P.strafe);
    if (d < near) this.moveAway(me, o, 0.8, strafe ? 0.6 : 0);
    else if (d > far) this.moveToward(me, o, 0.9, strafe ? 0.6 : 0);
    else this.moveSide(me, o, strafe ? 1 : 0.3);
    // (기다리며 방어를 들지는 잠깐씩 정해 둔다: 판단마다 바꾸면 방어가 깜빡여 우연한 쳐내기가 생긴다)
    if (now > this.idleGuardT) {
      this.idleGuardT = now + this.rng.range(0.5, 1.3);
      this.idleGuard = this.rng.chance(P.guardIdle);
    }
    this.guard = d < 2.5 && this.idleGuard;
  }

  /** 관측된 상대 공격이 나에게 닿을 것 같은가 → { kind, eta(남은 시간), def } */
  threat(me, o, d) {
    if (o.state !== 'attack' || (o.atkPhase !== 'windup' && o.atkPhase !== 'active')) return null;
    const def = T.attacks[o.atkKind];
    if (d > def.reach + def.lunge + 0.25) return null;
    const ang = Math.abs(angleDiff(o.facing, Math.atan2(me.y - o.y, me.x - o.x)));
    if (ang > def.arc + 0.5) return null;
    const eta = o.atkPhase === 'windup' ? def.windup - o.atkT : 0; // (관측 시각 기준)
    return { kind: o.atkKind, eta, def };
  }

  respond(me, o, d, th, now) {
    const P = this.p;
    const until = o.t + th.eta; // 그 공격이 닿는 시각 (추정)
    const left = until - now;
    this.string = null;
    if (this.rng.chance(P.mistake)) {
      this.intent = 'idle'; // (실수: 보고도 대응하지 않음)
      return;
    }
    let w = [...P.defend];
    if (me.bal < 30) w = [w[0] * 1.3, w[1] * 0.5, w[2] * 2, w[3] * 0.5]; // (균형이 없으면 막기보다 피하거나 쳐낸다)
    if (th.kind === 'heavy') w = [w[0] * 1.3, w[1] * 0.8, w[2] * 1.5, w[3] * 2.2];
    const myWind = T.attacks.light1.windup;
    const canCounter = me.state !== 'attack' && left > myWind + 0.05 && d <= T.attacks.light1.reach;
    if (!canCounter) w[3] = 0;
    if (me.state === 'attack' && me.atk.phase !== 'recovery') w = [0, 0, 0, 0]; // (이미 휘두르는 중: 운에 맡김)
    const pick = this.weighted(w);
    const noise = () => (this.rng.next() + this.rng.next() - 1) * P.timing * 1.6;
    if (pick === 0) {
      this.intent = 'parry';
      // 쳐내기 창(parryWindow)의 가운데에 닿도록 누른다 + 오차. 이미 방어 중이면 한 틱 놓았다 다시 누름
      this.press(Math.max(now, until - T.guard.parryWindow * 0.5 + noise()), 'tap');
      this.guardUntil = until + 0.25;
    } else if (pick === 1) {
      this.intent = 'guard';
      this.guard = true;
      this.guardUntil = until + 0.3;
    } else if (pick === 2) {
      this.intent = 'dodge';
      const back = this.rng.chance(th.kind === 'heavy' ? 0.7 : 0.35);
      const dir = back ? this.awayDir(me, o) : this.sideDir(me, o, this.rng.chance(0.5) ? 1 : -1);
      this.press(Math.max(now, until - 0.09 + noise()), 'dodge', dir);
    } else if (pick === 3) {
      this.intent = 'counter';
      this.attack(me, now, 'attack', 0);
    }
  }

  /**
   * 헛치기 유도에 대한 적응: 내 첫 베기가 사거리 밖으로 헛쳤으면 baited를 올린다 (상대가 휘두르는 걸 보고 물러난다).
   * baited가 높을수록 더 가까운 거리에서만 공격을 시작하고, 때로는 방어를 든 채 밀고 들어간다. 몇 초면 잊는다 — 유도는
   * 계속 통하지만 매번 같은 수에 같은 방식으로 걸리지는 않는다.
   */
  learnBait(me, now) {
    this.baited = Math.max(0, this.baited - (now - (this.baitT ?? now)) * 0.12);
    this.baitT = now;
    const a = me.atk;
    if (me.state === 'attack' && a && a.outcome === 'whiff' && a.id !== this.seenWhiffId) {
      this.seenWhiffId = a.id;
      if (a.combo === 1) this.baited = Math.min(3, this.baited + 1);
    }
  }

  /** 막고 밀리는 중 (내 상태는 정확히 안다): 이어지는 베기를 예상해 방어를 유지하고, 때로는 그 타이밍에 쳐내기 */
  afterBlock(me, o, now) {
    const c = me.contact;
    if (!c || c.t === this.lastBlockT) return;
    if (me.state === 'parried' || me.state === 'hitstun' || me.state === 'overpowered' || me.state === 'clash') {
      // 밀렸다: 상대가 파고들 것이다 — 방어를 다시 올린다 (가끔은 잊는다: mistake)
      this.lastBlockT = c.t;
      this.string = null;
      if (!this.rng.chance(this.p.mistake)) {
        this.guardUntil = Math.max(this.guardUntil, now + me.dur - me.st + this.p.holdAfterBlock);
        this.intent = 'guard';
      }
      return;
    }
    if (me.state !== 'blockstun') return;
    this.lastBlockT = c.t;
    this.guardUntil = Math.max(this.guardUntil, now + this.p.holdAfterBlock);
    const def = o.atkKind && T.attacks[o.atkKind];
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < T.attacks.light1.reach + 0.4 && this.rng.chance(this.p.riposte)) {
      // 밀림이 끝나는 순간 되받아 치기 (버퍼 안에 미리 누름)
      this.press(now + Math.max(0, me.dur - me.st - 0.05), 'attack');
      this.string = this.rng.chance(0.4) ? { left: 1, id: 0 } : null;
      this.guardUntil = now + Math.max(0, me.dur - me.st - 0.02);
      this.intent = 'counter';
      return;
    }
    if (def && def.next && this.rng.chance(this.p.readParry)) {
      const eta = def.chainAt + T.attacks[def.next].windup;
      this.press(now + eta - T.guard.parryWindow * 0.5 + (this.rng.next() - 0.5) * this.p.timing * 2, 'tap');
      this.intent = 'parry';
    } else this.intent = 'guard';
  }

  pickLen() {
    return this.weighted(this.p.strings) + 1;
  }

  weighted(w) {
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum <= 0) return -1;
    let r = this.rng.next() * sum;
    for (let i = 0; i < w.length; i++) if ((r -= w[i]) <= 0) return i;
    return w.length - 1;
  }

  /** 공격 시작 (+ 이어 칠 횟수 more) */
  attack(me, now, type, more) {
    this.press(now, type);
    this.string = more > 0 ? { left: more, id: 0 } : null;
    this.move = { x: 0, y: 0 };
  }

  /**
   * 연속 공격: 다음 베기를 누르기 직전(이어치기 가능 0.07 s 전)에 다시 판단한다 — 그 사이 상대가 물러났거나 밀려났을 수
   * 있다. 관측한 상대 위치·속도로 다음 베기가 닿을 때의 거리를 예상해:
   *   이어 베기  예상 거리가 다음 베기의 사거리 안 (내딛기 포함)
   *   제한된 전진 조금 멀다 (사거리 + 0.9 m 안): 연속 공격을 접고 0.25 s 다가간 뒤 다시 판단
   *   중단      더 멀다: 연속 공격을 접고 방어
   * 막혔으면 성향대로(overcommit) 그만두기도 한다. 쳐내졌으면 이미 끝났다.
   */
  continueString(me, now) {
    const s = this.string;
    if (!s || me.state !== 'attack') {
      if (s && me.state !== 'attack' && me.state !== 'ready' && me.state !== 'guard') this.string = null;
      return;
    }
    const a = me.atk;
    if (a.phase !== 'recovery' || s.id === a.id) return;
    if (!a.def.next) {
      this.string = null;
      return;
    }
    if (a.recT < a.def.chainAt - 0.07 - 1e-9) return; // (아직: 누르기 직전에 판단)
    s.id = a.id;
    const o = this.seen;
    if (a.outcome === 'blocked' && !this.rng.chance(this.p.overcommit)) {
      this.string = null;
      this.decisions.stopBlocked++;
      this.lastJudge = { what: '막힘 → 그만둠', t: now };
      this.guard = true; // (그만두고 방어)
      this.guardUntil = now + 0.4;
      return;
    }
    const heavyEnd = s.left === 1 && a.def.heavyChain && this.rng.chance(this.p.heavy + (this.foeGuards > 2 ? this.p.heavyVsGuard : 0));
    const next = T.attacks[heavyEnd ? 'heavy' : a.def.next];
    const lead = Math.max(0, a.def.chainAt - a.recT) + next.windup;
    const dPred = o ? this.predictDist(me, o, now, lead, next.lunge * 0.85) : 0;
    const judge = (what) => (this.lastJudge = { what, dPred, reach: next.reach, t: now });
    if (dPred <= next.reach - 0.08) {
      s.left--;
      this.decisions.chain++;
      judge('이어 베기');
      this.press(now + Math.max(0, a.def.chainAt - a.recT - 0.03), heavyEnd ? 'heavy' : 'attack');
      if (s.left <= 0) this.string = null;
      return;
    }
    this.string = null;
    if (dPred <= next.reach + 0.9) {
      this.decisions.advance++;
      judge('제한된 전진');
      this.intent = 'advance';
      this.advanceUntil = now + Math.max(0, a.def.recovery - a.recT) + 0.25;
      this.move = this.dirTo(me, o);
    } else {
      this.decisions.abort++;
      judge('공격 중단');
      this.intent = 'abort';
      this.guard = true;
      this.guardUntil = now + 0.35;
    }
  }

  press(at, type, dir = null) {
    // (같은 종류의 예약은 하나만)
    this.presses = this.presses.filter((p) => p.type !== type);
    this.presses.push({ at, type, dir });
  }

  // ---------------------------------------------------------------------------- 이동

  dirTo(me, o) {
    const d = Math.hypot(o.x - me.x, o.y - me.y) || 1;
    return { x: (o.x - me.x) / d, y: (o.y - me.y) / d };
  }
  awayDir(me, o) {
    const t = this.dirTo(me, o);
    return { x: -t.x, y: -t.y };
  }
  sideDir(me, o, s) {
    const t = this.dirTo(me, o);
    return { x: -t.y * s, y: t.x * s };
  }
  moveToward(me, o, k, side = 0) {
    const t = this.dirTo(me, o);
    const sd = this.sideDir(me, o, this.side);
    this.move = norm({ x: t.x * k + sd.x * side, y: t.y * k + sd.y * side });
  }
  moveAway(me, o, k, side = 0) {
    const t = this.awayDir(me, o);
    const sd = this.sideDir(me, o, this.side);
    this.move = norm({ x: t.x * k + sd.x * side, y: t.y * k + sd.y * side });
  }
  moveSide(me, o, k) {
    const sd = this.sideDir(me, o, this.side);
    this.move = { x: sd.x * k, y: sd.y * k };
  }

  // ---------------------------------------------------------------------------- 명령

  emit(me, o, now) {
    const cmd = { move: this.move, guard: this.guard || now < this.guardUntil };
    for (const p of this.presses) {
      if (now < p.at - 1e-9) continue;
      p.fired = true;
      if (p.type === 'tap') {
        // 새로 누른 방어: 이미 들고 있으면 이번 틱 놓고 다음 틱에 누른다
        if (this.guardPrev && !this.tapRelease) {
          this.tapRelease = true;
          p.fired = false;
          cmd.guard = false;
          continue;
        }
        this.tapRelease = false;
        cmd.guard = true;
        this.guard = true;
      } else {
        cmd[p.type] = true;
        if (p.dir) cmd.move = p.dir;
      }
    }
    this.presses = this.presses.filter((p) => !p.fired);
    if (cmd.guard && !this.guardPrev) cmd.guardPressed = true;
    this.guardPrev = cmd.guard;
    return cmd;
  }

  get intentLabel() {
    return INTENT[this.intent] || this.intent;
  }
}

function norm(v) {
  const l = Math.hypot(v.x, v.y);
  return l > 1 ? { x: v.x / l, y: v.y / l } : v;
}
