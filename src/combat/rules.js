// 접촉 판정 규칙 (docs/COMBAT.md "판정 규칙과 우선순위"). 화면에서 검 그림이 겹쳤는지는 보지 않는다: 결과는 여기의
// 명시적인 조건(공격 단계·거리·각도·방어 상태·시각)으로 정하고, 자세와 효과가 그 결과에 맞춰진다.
//
// 한 틱의 순서 (sim.js):
//   1. 두 결투자의 명령 반영 (방어 누름 포함) → 2. 상태 진행·이동 → 3. 이 파일의 판정 → 4. 타격 정지
//   즉 같은 틱에 누른 방어는 그 틱의 공격 판정보다 먼저 선다.
// 공격 한 번의 판정은 단 한 번: active 동안 상대가 사거리·각도 안에 처음 들어온 틱에 결과가 나고 (resolved),
// 그 뒤로는 같은 공격이 피해·균형을 다시 주지 않는다. 끝까지 닿지 않으면 헛침 (fighter.js).
//
// 우선순위 (한 공격이 닿았을 때 방어자 쪽):
//   1. 회피 무적 구간       → 이 틱은 닿지 않음 (active가 남아 있으면 그 뒤에 닿을 수 있음)
//   2. 쳐내기 창 + 정면      → 쳐내기 (공격자 균형 손실·경직, 방어자는 주도권)
//   3. 방어 + 정면 + 균형>0  → 막기 (방어자 균형 손실·밀림; 균형이 0이 되면 균형 붕괴)
//   4. 그 밖 (방어 안 함, 측면·후방, 균형 붕괴, 공격 준비 중) → 몸에 맞음
// 두 공격이 같은 틱에 서로 닿으면 (둘 다 active·사거리·각도 안), 또는 닿는 순간 상대도 이미 휘두르기 시작했으면
// (windup의 마지막 swingLead 초): 같은 무게면 맞부딪힘(둘 다 튕김), 강공격 대 기본 공격이면 강공격이 이김 (기본
// 공격 쪽이 밀림). 두 공격이 tradeWindow(0.12 s) 안에 거의 같이 시작했어도 맞부딪힘(같은 무게로). 그보다 늦게
// 시작해 아직 준비 중(검을 젖히는 중)인 상대를 베면 그건 4 — 분명히 먼저 휘두른 쪽이 이긴다.
import { TUNING as T } from './tuning.js';
import { angleDiff } from '../core/math.js';
import { contactPoint, swingS } from './pose.js';

const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const distOf = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** 공격자 `f`의 공격이 지금 `o`에게 닿는가 (active · 미판정 · 사거리 · 정면 각도) */
export function reaches(f, o) {
  const a = f.atk;
  if (f.state !== 'attack' || !a || a.phase !== 'active' || a.resolved || o.dead) return false;
  return distOf(f, o) <= a.def.reach && Math.abs(angleDiff(f.facing, angleTo(f, o))) <= a.def.arc;
}

/** `f`가 `o`를 향해 휘두르기 시작했는가 (windup 마지막 swingLead 초 ~ active, 사거리·각도 안, 미판정) */
export function swinging(f, o) {
  const a = f.atk;
  if (f.state !== 'attack' || !a || a.resolved || a.phase === 'recovery') return false;
  if (a.phase === 'windup' && a.t < a.def.windup - T.swingLead) return false;
  return distOf(f, o) <= a.def.reach + 0.1 && Math.abs(angleDiff(f.facing, angleTo(f, o))) <= a.def.arc;
}

/** `f`의 공격이 닿는 순간, `o`도 tradeWindow 안에 늦게 시작한 공격으로 `f`를 향하고 있는가 */
export function traded(f, o) {
  const a = o.atk;
  if (o.state !== 'attack' || !a || a.resolved || a.phase !== 'windup') return false;
  if (f.atk.t - a.t > T.tradeWindow + 1e-9) return false;
  return distOf(f, o) <= a.def.reach + 0.1 && Math.abs(angleDiff(o.facing, angleTo(o, f))) <= a.def.arc;
}

/** 방어자 `o`가 공격자 `f`를 정면으로 보고 있는가 (방어가 받아내는 각도) */
export function inGuardArc(o, f) {
  return Math.abs(angleDiff(o.facing, angleTo(o, f))) <= T.guard.arc;
}

/** 한 틱의 접촉 판정 */
export function resolveContacts(sim) {
  const [A, B] = sim.fighters;
  const ra = reaches(A, B);
  const rb = reaches(B, A);
  if (ra && rb && !A.invulnerable() && !B.invulnerable()) return clash(sim, A, B);
  // 상대도 이미 휘두르기 시작했다 (준비의 마지막 swingLead 초: 검이 나와 있음) → 몸이 아니라 검끼리 맞부딪힘
  if (ra && swinging(B, A)) return clash(sim, A, B);
  if (rb && swinging(A, B)) return clash(sim, A, B);
  // 거의 같이 시작한 두 공격 (tradeWindow 안): 먼저 닿은 쪽이 상대 몸을 베는 게 아니라 마주 나온 검끼리 부딪힌다 (같은 무게로)
  if (ra && traded(A, B)) return clash(sim, A, B, true);
  if (rb && traded(B, A)) return clash(sim, A, B, true);
  if (ra) strike(sim, A, B);
  if (rb && B.state === 'attack') strike(sim, B, A); // (A의 판정으로 B의 공격이 취소됐을 수 있다)
}

function markContact(sim, f, kind, at, role) {
  f.contact = { kind, at, t: sim.time, role, from: [f.x, f.y] };
}

function clash(sim, A, B, even = false) {
  const now = sim.time;
  const ha = A.atk.kind === 'heavy' && !even;
  const hb = B.atk.kind === 'heavy' && !even;
  const at = contactPoint('clash', A, B, now);
  for (const f of [A, B]) f.atk.contactS = swingS(f.atk.def, f.atk.t);
  if (ha === hb) {
    // 같은 무게: 둘 다 튕기고 균형을 조금씩
    const R = T.reactions;
    for (const [f, o] of [
      [A, B],
      [B, A],
    ]) {
      f.atk.resolved = true;
      f.atk.outcome = 'clash';
      const broke = f.loseBal(R.clashBal, now);
      if (broke) breakBalance(sim, f);
      else {
        f.setTimed('clash', R.clash);
        f.actLockUntil = now + R.clash;
      }
      f.push(f.x - o.x, f.y - o.y, 0.28);
      markContact(sim, f, 'clash', at, 'clash');
    }
    sim.emit({ type: 'clash', by: A, target: B, at, heavy: ha });
    sim.hitstop(T.hitstop.clash);
    return;
  }
  // 강공격이 기본 공격을 누른다
  const [W, L] = ha ? [A, B] : [B, A];
  L.atk.resolved = true;
  L.atk.outcome = 'overpowered';
  W.toRecovery('clashWin');
  const broke = L.loseBal(T.reactions.overpoweredBal, now);
  if (broke) breakBalance(sim, L);
  else {
    L.setTimed('overpowered', T.reactions.overpowered);
    L.actLockUntil = now + T.reactions.overpowered;
  }
  L.push(L.x - W.x, L.y - W.y, 0.5);
  markContact(sim, L, 'clash', at, 'loser');
  markContact(sim, W, 'clash', at, 'winner');
  sim.emit({ type: 'clash', by: W, target: L, at, heavy: true, winner: W });
  sim.hitstop(T.hitstop.blockHeavy);
}

/** 균형 붕괴: 짧고 분명한 빈틈 (방어·공격 불가). 가까이 와서 베어야 피해가 된다. */
export function breakBalance(sim, f, cause = 'guard') {
  f.bal = 0;
  f.setTimed('broken', T.reactions.broken);
  f.parryUntil = -1;
  f.actLockUntil = -1;
  f.riposteUntil = -1;
  sim.emit({ type: 'break', target: f, cause, dur: T.reactions.broken });
}

function strike(sim, F, O) {
  const now = sim.time;
  const a = F.atk;
  const def = a.def;
  if (O.invulnerable()) {
    // 회피 무적: 이 틱엔 닿지 않는다 (판정은 남는다 — active 끝까지 피하면 헛침 'evade')
    if (!a.evaded) {
      a.evaded = true;
      sim.emit({ type: 'evade', by: O, target: F, kind: a.kind });
    }
    return;
  }
  a.contactS = swingS(def, a.t);
  const front = inGuardArc(O, F);
  const away = [O.x - F.x, O.y - F.y];

  // 2. 쳐내기
  if (front && O.parryActive(now)) {
    const at = contactPoint('parry', F, O, now);
    F.atk.resolved = true;
    F.atk.outcome = 'parried';
    O.parryUntil = -1; // (한 번의 창으로 한 번)
    markContact(sim, O, 'parry', at, 'parrier');
    markContact(sim, F, 'parry', at, 'parried');
    const broke = F.loseBal(def.parryBal, now);
    if (broke) breakBalance(sim, F, 'parry');
    else {
      F.setTimed('parried', def.parried, def.parriedGuard);
      F.actLockUntil = now + def.parried;
      F.shakenUntil = now + T.guard.shakenT;
    }
    F.push(-away[0], -away[1], 0.22);
    // 쳐낸 쪽: 이 창 안에 누른 기본 공격은 그 캐릭터의 반격 동작 (links.riposte — 확정 피해는 아니다: 쳐내진 쪽도 parriedGuard 뒤 방어 가능)
    if (O.links.riposte && O.links.riposte.parry) O.riposteUntil = now + O.links.riposte.parry;
    sim.emit({ type: 'parry', by: O, target: F, kind: a.kind, at, bal: def.parryBal, stun: def.parried, guardAfter: def.parriedGuard, broke });
    sim.hitstop(T.hitstop.parry);
    return;
  }

  // 3. 막기
  if (front && O.guardActive() && O.bal > 0) {
    const at = contactPoint('block', F, O, now);
    const mult = now < O.shakenUntil ? T.guard.shakenMult : 1;
    const cost = def.blockBal * mult;
    F.toRecovery('blocked');
    markContact(sim, O, 'block', at, 'blocker');
    markContact(sim, F, 'block', at, 'blocked');
    const broke = O.loseBal(cost, now);
    F.loseBal(def.selfBlockBal, now, 1); // (튕긴 검: 공격자도 조금 — 막기로는 공격자가 무너지지 않음)
    // 막은 쪽이 밀리는 방향: 보통은 곧장 뒤로, blockStep이 있는 검술은 뒤·옆으로 디디며 받아낸다 (거리는 같다 — 각도만)
    const bs = O.links.blockStep;
    let push = away;
    if (bs && !broke) {
      const l = Math.hypot(away[0], away[1]) || 1;
      const [bx, by] = [away[0] / l, away[1] / l];
      O.blockSide = -O.blockSide; // (번갈아: 한쪽으로만 돌아 나가지 않게)
      push = [bx * bs.back - by * bs.side * O.blockSide, by * bs.back + bx * bs.side * O.blockSide];
    }
    O.push(push[0], push[1], def.blockPush * (broke ? 1.3 : 1));
    F.push(-away[0], -away[1], 0.06);
    // 막혀도 압박을 이어 가는 검술 (links.pressOnBlock): 내 균형이 상대보다 낫고, 밀려난 뒤에도 다음 베기가 닿을 거리면 잠김이 짧다
    const po = F.links.pressOnBlock;
    if (po && def.next && !broke) {
      const nx = F.attacks[def.next];
      F.atk.pressOn = F.bal >= O.bal + po.balEdge && distOf(F, O) + def.blockPush <= nx.reach + nx.lunge * 0.6 + po.range; // (판정 순간까지 내딛는 몫 ≈ 0.6)
    }
    // 막은 쪽: 밀림이 끝난 뒤 창 안의 기본 공격은 반격 동작 (links.riposte.block)
    if (!broke && O.links.riposte && O.links.riposte.block) O.riposteUntil = now + def.blockstun + O.links.riposte.block;
    if (broke) {
      breakBalance(sim, O, 'guard');
      sim.emit({ type: 'block', by: O, target: F, kind: a.kind, at, bal: cost, broke: true });
      sim.hitstop(T.hitstop.break);
    } else {
      O.setTimed('blockstun', def.blockstun);
      sim.emit({ type: 'block', by: O, target: F, kind: a.kind, at, bal: cost, shaken: mult > 1, stun: def.blockstun, press: F.atk.pressOn });
      sim.hitstop(a.kind === 'heavy' ? T.hitstop.blockHeavy : T.hitstop.block);
    }
    return;
  }

  // 4. 몸에 맞음
  const at = contactPoint('hit', F, O, now);
  const wasBroken = O.state === 'broken';
  const counter = O.state === 'attack' && O.atk.phase === 'windup';
  const dmg = Math.min(O.hp, def.dmg * (wasBroken ? T.reactions.brokenPunishMult : 1)); // (실제로 깎인 만큼)
  F.toRecovery('hit');
  markContact(sim, O, 'hit', at, 'hurt');
  markContact(sim, F, 'hit', at, 'hitter');
  O.hp = Math.max(0, O.hp - dmg);
  // (왜 몸에 들어갔는가 — 디버그 표시·검증용)
  const why = wasBroken ? 'broken' : !front ? 'flank' : O.state === 'hitstun' ? 'combo' : counter ? 'counter' : O.state === 'attack' ? 'busy' : O.state === 'dodge' ? 'dodge' : O.state === 'parried' ? 'parried' : O.state === 'clash' || O.state === 'overpowered' ? 'staggered' : 'open';
  if (O.hp <= 0) {
    O.setState('dead');
    O.koT = 0;
    O.push(away[0], away[1], def.knock * 1.5);
    sim.emit({ type: 'hit', by: F, target: O, kind: a.kind, at, dmg, why, punish: wasBroken, ko: true });
    sim.emit({ type: 'ko', by: F, target: O });
    sim.hitstop(T.hitstop.ko);
    return;
  }
  O.setTimed('hitstun', def.hitstun + (counter ? T.reactions.counterHitStun : 0));
  O.parryUntil = -1;
  O.riposteUntil = -1;
  if (wasBroken) O.bal = T.balance.afterPunish;
  else O.loseBal(def.hitBal, now, 1);
  O.push(away[0], away[1], def.knock);
  sim.emit({ type: 'hit', by: F, target: O, kind: a.kind, at, dmg, why, punish: wasBroken });
  sim.hitstop(a.kind === 'heavy' || wasBroken ? T.hitstop.hitHeavy : T.hitstop.hit);
}
