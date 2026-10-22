// 결투 공방 측정 (수정 전후 비교용): 같은 조건(시드·시나리오)에서 판정 분포·연속 공격 헛침·주도권·자세 연결을 잰다.
//   node tools/combat/bench.mjs [out.json]
// 시나리오의 '플레이어'는 시뮬레이션 상태를 직접 보는 시험용 컨트롤러다 (AI는 그렇지 않다 — ai.js).
import fs from 'fs';
import { duel, run } from './harness.mjs';
import { AIController } from '../../src/combat/ai.js';
import { TUNING as T, DT } from '../../src/combat/tuning.js';
import { poseOf, closestSeg, v3 } from '../../src/combat/pose.js';

const SEEDS = 12;
const toward = (me, foe, k = 1) => {
  const d = Math.hypot(foe.x - me.x, foe.y - me.y) || 1;
  return { x: ((foe.x - me.x) / d) * k, y: ((foe.y - me.y) / d) * k };
};
const ctrl = (fn) => ({ prev: false, command(sim, me, foe) {
  const c = fn(sim, me, foe, this) || {};
  c.move ||= { x: 0, y: 0 };
  if (c.guard && !this.prev) c.guardPressed = true;
  this.prev = !!c.guard;
  return c;
} });

// 플레이어 역할들
const SCEN = {
  // 방어 유지: 가까이 서서 계속 막기만
  guardHold: () => ctrl((s, me, foe) => ({ guard: true, move: Math.hypot(foe.x - me.x, foe.y - me.y) > 2.2 ? toward(me, foe, 1) : null })),
  // 공격 반복: 다가가서 0.35 s마다 클릭
  attackSpam: () => ctrl((s, me, foe, c) => {
    const d = Math.hypot(foe.x - me.x, foe.y - me.y);
    const click = s.time - (c.last || 0) > 0.35 && d < 2.2;
    if (click) c.last = s.time;
    return { attack: click, move: d > 1.8 ? toward(me, foe, 1) : null };
  }),
  // 쳐내기 후 반격: 상대 휘두르기를 보고 판정 0.05 s 전에 새로 누르고, 쳐내면 바로 반격
  parryCounter: () => ctrl((s, me, foe, c) => {
    const d = Math.hypot(foe.x - me.x, foe.y - me.y);
    const a = foe.atk;
    let guard = d < 2.6;
    if (a && a.phase === 'windup' && a.def.windup - a.t <= 0.06 && c.tapFor !== a.id) {
      c.tapFor = a.id;
      c.tapT = s.time;
      guard = false; // (한 틱 놓았다가 다음 틱에 누름 = 새 입력)
    } else if (c.tapT && s.time - c.tapT < DT * 1.5) guard = false;
    const counter = foe.state === 'parried' && c.cFor !== foe.lastAtk.id;
    if (counter) (c.cFor = foe.lastAtk.id), (guard = false);
    return { guard: guard && !counter, attack: counter, move: d > 2.2 ? toward(me, foe, 1) : null };
  }),
  // 후퇴로 헛치기 유도: 상대가 휘두르기 시작하면 뒤로 걷고, 아니면 사거리 끝 근처로 다가감
  retreatBait: () => ctrl((s, me, foe, c) => {
    const d = Math.hypot(foe.x - me.x, foe.y - me.y);
    const a = foe.state === 'attack' && foe.atk.phase !== 'recovery';
    if (a) c.backUntil = s.time + 0.35;
    if (s.time < (c.backUntil || 0)) return { move: toward(me, foe, -1) };
    return { move: d > 2.1 ? toward(me, foe, 1) : d < 1.7 ? toward(me, foe, -1) : null };
  }),
};

function measure(sim, secs) {
  const out = { block: 0, parry: 0, clash: 0, whiff: 0, whiffRange: 0, chainWhiff: 0, hit: 0, break: 0, swings: 0, chains: 0, hitByAI: 0, blockedByAI: 0, counterHit: 0, counterBlocked: 0, counterParried: 0, leadChanges: 0, pops: 0, engagedAfterBlock: 0, afterBlockTicks: 0, closeTicks: 0, unrelated: 0 };
  let lastParryBy = null;
  sim.on((e) => {
    if (e.type === 'swing') {
      out.swings++;
      if (e.combo > 1) out.chains++;
      if (lastParryBy && e.by === lastParryBy.by && e.t - lastParryBy.t < 0.6) lastParryBy.counterId = e.by.atk && e.by.atk.id;
    }
    if (e.type in out) out[e.type]++;
    if (e.type === 'whiff' && e.why === 'range') {
      out.whiffRange++;
      if (e.by.lastAtk ? 0 : 0) void 0;
    }
    if (e.type === 'whiff' && (e.by.atk ? e.by.atk.combo : 1) > 1) out.chainWhiff++;
    if (e.type === 'parry') lastParryBy = { by: e.by, t: e.t };
    if ((e.type === 'hit' || e.type === 'block' || e.type === 'parry' || e.type === 'clash') && lastParryBy && e.t - lastParryBy.t < 0.9 && e.t > lastParryBy.t) {
      const counterOf = e.type === 'hit' ? e.by : e.type === 'clash' ? null : e.target;
      if (counterOf === lastParryBy.by) {
        if (e.type === 'hit') out.counterHit++;
        else if (e.type === 'block') out.counterBlocked++;
        else if (e.type === 'parry') out.counterParried++;
        lastParryBy = null;
      }
    }
  });
  // 자세 연결: 틱마다 몸에 대한 손 위치의 튐(1/60 s에 10 cm = 6 m/s 초과, 휘두르기·타격 반응 제외), 막은 뒤 0.35 s 동안 두 검이 가까이 맞물려 있는가
  const prevHand = [null, null];
  const prevSwing = [false, false];
  let blockT = -9;
  sim.on((e) => e.type === 'block' && !e.broke && (blockT = e.t));
  const end = sim.time + secs;
  let lastTick = -1;
  while (sim.time < end && !sim.over) {
    sim.advance(1 / 60);
    if (sim.tick === lastTick) continue;
    lastTick = sim.tick;
    const [A, B] = sim.fighters;
    const pa = poseOf(A, B, sim.time);
    const pb = poseOf(B, A, sim.time);
    [pa, pb].forEach((p, i) => {
      const f = sim.fighters[i];
      // (휘두르는 중, 맞힌·헛친 베기의 끝까지 휘두름 0.1 s, 맞거나 쳐내진 직후 0.12 s의 반응은 원래 빠른 동작: 빼고)
      const swinging = (f.state === 'attack' && (f.atk.phase !== 'recovery' || (f.atk.outcome !== 'blocked' && f.atk.recT < 0.1))) || (/^(parried|clash|overpowered|hitstun|broken)$/.test(f.state) && f.st < 0.12);
      const rel = v3.sub(p.hand, p.hips); // (몸에 대한 손: 회피·밀려남 같은 몸 전체의 이동은 빼고)
      // (1/60 s에 10 cm = 6 m/s 넘게 튐. 앞 프레임이 휘두르는 중이었으면 그 사이 움직임은 휘두르기 — 막힌 순간에 닿는 마지막 한 프레임)
      if (prevHand[i] && !swinging && !prevSwing[i] && v3.len(v3.sub(rel, prevHand[i])) > 0.1) out.pops++;
      prevHand[i] = rel;
      prevSwing[i] = swinging;
    });
    if (sim.time - blockT < 0.35 && sim.time > blockT) {
      out.afterBlockTicks++;
      const [p, q] = closestSeg(pa.bladeBase, pa.tip, pb.bladeBase, pb.tip);
      if (v3.len(v3.sub(p, q)) < 0.3) out.engagedAfterBlock++;
    }
    // 무관한 자세: 가까이(2.4 m 안) 있고 둘 다 휘두르는 중이 아닐 때, 두 검이 0.6 m 넘게 떨어져 서로 겨누지 않음
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    const idle = (f) => !(f.state === 'attack' && f.atk.phase !== 'recovery') && !f.dead;
    if (d < 2.4 && idle(A) && idle(B)) {
      out.closeTicks++;
      const [p, q] = closestSeg(pa.bladeBase, pa.tip, pb.bladeBase, pb.tip);
      if (v3.len(v3.sub(p, q)) > 0.6) out.unrelated++;
    }
  }
  out.leadChanges = sim.stats.leadChanges;
  out.secs = sim.time;
  return out;
}

const add = (acc, o) => {
  for (const k in o) acc[k] = (acc[k] || 0) + o[k];
  return acc;
};
const results = {};
// 1) 플레이어 역할 × AI 성향
for (const [name, mk] of Object.entries(SCEN)) {
  for (const persona of ['anakin', 'obiwan']) {
    const acc = {};
    for (let s = 1; s <= SEEDS; s++) {
      // (AI 쪽 캐릭터 = 그 성향의 캐릭터: 아나킨 성향은 아나킨의 검술로, 오비완 성향은 오비완의 검술로)
      const sim = duel({ dist: 3.2, cast: [persona === 'anakin' ? 'obiwan' : 'anakin', persona], c0: mk(), c1: new AIController(persona, s * 31) });
      sim.on((e) => {
        if (e.type === 'hit' && e.by.side === 1) acc.aiHits = (acc.aiHits || 0) + 1;
        if ((e.type === 'block' || e.type === 'parry') && e.target && e.target.side === 1) acc.aiBlocked = (acc.aiBlocked || 0) + 1;
        if (e.type === 'whiff' && e.by.side === 1) acc.aiWhiff = (acc.aiWhiff || 0) + 1;
        if (e.type === 'whiff' && e.by.side === 1 && e.by.atk && e.by.atk.combo > 1) acc.aiChainWhiff = (acc.aiChainWhiff || 0) + 1;
        if (e.type === 'swing' && e.by.side === 1) acc.aiSwings = (acc.aiSwings || 0) + 1;
      });
      add(acc, measure(sim, 20));
    }
    results[`${name}/${persona}`] = acc;
  }
}
// 2) AI 대 AI
{
  const acc = {};
  for (let s = 1; s <= SEEDS * 2; s++) {
    const sim = duel({ dist: 4, c0: new AIController('anakin', s), c1: new AIController('obiwan', s + 500) });
    add(acc, measure(sim, 30));
  }
  results['aiVsAi'] = acc;
}
const per = (o) => {
  const s = o.secs || 1;
  const r = {};
  for (const k in o) if (k !== 'secs' && k !== 'afterBlockTicks' && k !== 'engagedAfterBlock' && k !== 'unrelated') r[k] = +((o[k] * 30) / s).toFixed(1);
  r.engagedAfterBlock = o.afterBlockTicks ? +(o.engagedAfterBlock / o.afterBlockTicks).toFixed(2) : null;
  r.unrelated = o.closeTicks ? +(o.unrelated / o.closeTicks).toFixed(2) : null;
  delete r.closeTicks;
  return r;
};
const summary = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, per(v)]));
console.log('(30초당 평균. engagedAfterBlock = 막은 뒤 0.35 s 동안 두 검이 0.3 m 안에 있던 비율, unrelated = 가까이서 둘 다 휘두르지 않을 때 두 검이 0.6 m 넘게 떨어진 비율)');
for (const [k, v] of Object.entries(summary)) console.log(k.padEnd(20), JSON.stringify(v));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(summary, null, 1));
