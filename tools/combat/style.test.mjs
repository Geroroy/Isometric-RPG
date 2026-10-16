// 검술 v1 자동 검증 (docs/COMBAT.md "검술 v1"): 아나킨·오비완의 캐릭터별 동작이 같은 입력에서 다르게 나오고, 연결 규칙이
// 효과와 약점을 함께 갖고, 자세가 몸에 붙어 있는가 (발 미끄러짐·손과 검 분리·궤적과 사거리 불일치 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, Script, run } from './harness.mjs';
import { TUNING as T } from '../../src/combat/tuning.js';
import { AIController } from '../../src/combat/ai.js';
import { poseOf, bladeReach, ARM, LEG, v3 } from '../../src/combat/pose.js';

const STYLES = ['anakin', 'obiwan'];
const KINDS = ['light1', 'light2', 'light3', 'heavy', 'riposte'];
const only = (sim, type) => sim.log.filter((e) => e.type === type);
const other = (s) => (s === 'anakin' ? 'obiwan' : 'anakin');
/** 0번 자리에 `style`을 세운 결투 (상대는 다른 캐릭터) */
const as = (style, opts) => duel({ ...opts, cast: [style, other(style)] });

test('궤적과 사거리가 같다: 판정 순간(MID) 검끝이 닿는 앞 거리 + 몸 반경 = reach (두 캐릭터, 모든 공격)', () => {
  for (const s of STYLES)
    for (const k of KINDS) {
      const r = bladeReach(s, k);
      assert.ok(Math.abs(r - T.styles[s].attacks[k].reach) <= 0.01, `${s}.${k}: 궤적 ${r.toFixed(3)} / reach ${T.styles[s].attacks[k].reach}`);
    }
});

test('같은 입력, 다른 검술: 내디딤 거리·검 궤적·회수(방어 복귀) 시간이 캐릭터마다 다르다', () => {
  const rec = {};
  for (const s of STYLES) {
    // 막는 상대에게 0.3 s에 한 번 클릭
    const sim = as(s, { dist: 2.0, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([], { guard: [[0, 3]] }) });
    const f = sim.fighters[0];
    const x0 = f.x;
    const yaws = [];
    let guardAt = null;
    let frontStep = 0;
    sim.on((e) => e.type === 'block' && (rec[s] = { ...rec[s], blockT: e.t }));
    for (let i = 0; i < 1.6 * 120; i++) {
      sim.step();
      const p = poseOf(f, sim.fighters[1], sim.time);
      if (f.state === 'attack' && f.atk.phase !== 'recovery') yaws.push(Math.atan2(p.dir[1], p.dir[0]));
      if (guardAt === null && f.state === 'attack' && f.atk.phase === 'recovery' && f.canGuard()) guardAt = sim.time;
      // (내딛는 걸음: 휘두르는 동안 앞발이 내디딘 자리 — 떠 있는 발은 착지할 자리)
      const ft = f.gait.feet[0];
      if (f.state === 'attack' && f.atk.phase !== 'recovery') frontStep = Math.max(frontStep, (ft.step ? ft.step.to[0] : ft.p[0]) - x0);
    }
    rec[s] = { ...rec[s], lunge: f.atk ? f.atk.lunged : f.lastAtk.lunged, moved: f.x - x0, sweep: Math.max(...yaws) - Math.min(...yaws), guardAfter: guardAt - rec[s].blockT, frontStep, name: (f.atk || f.lastAtk).def.name };
  }
  const [a, o] = [rec.anakin, rec.obiwan];
  assert.ok(a.lunge - o.lunge >= 0.15, `아나킨이 더 깊게 내디딘다: ${a.lunge.toFixed(2)} / ${o.lunge.toFixed(2)}`);
  assert.ok(a.frontStep - o.frontStep >= 0.1, `앞발이 실제로 더 멀리 나간다: ${a.frontStep.toFixed(2)} / ${o.frontStep.toFixed(2)}`);
  assert.ok(a.sweep > o.sweep + 0.3, `아나킨의 대각 베기가 더 크게 돈다 (rad): ${a.sweep.toFixed(2)} / ${o.sweep.toFixed(2)}`);
  assert.ok(o.guardAfter < a.guardAfter - 0.04, `오비완의 검이 더 빨리 방어로 돌아온다: ${o.guardAfter.toFixed(2)} / ${a.guardAfter.toFixed(2)}`);
  assert.notEqual(a.name, o.name);
});

test('플레이어(스크립트 입력)와 AI가 같은 캐릭터별 동작을 쓴다: 쳐낸 뒤 누른 공격은 그 캐릭터의 반격', () => {
  for (const s of STYLES) {
    // 상대가 0.4 s에 베고, s가 판정 직전에 방어를 새로 눌러 쳐낸 뒤 바로 클릭
    const foeDef = T.styles[other(s)].attacks.light1;
    const contact = 0.4 + foeDef.windup;
    const sim = as(s, { dist: 1.9, c0: new Script([{ at: contact + 0.02, attack: true }], { guard: [[contact - 0.05, contact + 0.02]] }), c1: new Script([{ at: 0.4, attack: true }]) });
    run(sim, contact + 0.8);
    assert.equal(only(sim, 'parry').length, 1, s);
    const sw = sim.events.filter((e) => e.type === 'swing' && e.by === sim.fighters[0]);
    assert.equal(sw.length, 1);
    assert.equal(sw[0].kind, 'riposte', `${s}: 쳐낸 뒤의 클릭은 반격 동작`);
  }
  // AI도: AI 대 AI에서 두 캐릭터 모두 자기 반격 동작을 쓴다 (이름이 그 캐릭터의 것)
  const names = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const sim = duel({ dist: 3, c0: new AIController('anakin', seed), c1: new AIController('obiwan', seed + 100) });
    sim.on((e) => e.type === 'swing' && e.kind === 'riposte' && names.add(`${e.by.style}:${e.by.atk.def.name}`));
    run(sim, 30);
  }
  assert.ok(names.has(`anakin:${T.styles.anakin.attacks.riposte.name}`) && names.has(`obiwan:${T.styles.obiwan.attacks.riposte.name}`), [...names].join(', '));
});

test('반격은 확정이 아니다: 쳐내진 쪽이 바로 방어를 다시 올리면 막히고, 올리지 않으면 맞는다 (두 캐릭터)', () => {
  for (const s of STYLES) {
    const foeDef = T.styles[other(s)].attacks.light1;
    const contact = 0.4 + foeDef.windup;
    const me = () => new Script([{ at: contact + 0.01, attack: true }], { guard: [[contact - 0.05, contact + 0.01]] });
    // 쳐내진 쪽(1번)이 parriedGuard가 지나자마자 방어 (0.4 s 공격 → 판정 → 경직 중 방어 누름 유지)
    let sim = as(s, { dist: 1.9, c0: me(), c1: new Script([{ at: 0.4, attack: true }], { guard: [[contact + 0.02, 3]] }) });
    run(sim, contact + 1);
    assert.equal(only(sim, 'hit').length, 0, `${s}: 다시 든 방어에 막혀야 함 — ${sim.log.map((e) => e.type).join(' ')}`);
    assert.ok(only(sim, 'block').length >= 1);
    sim = as(s, { dist: 1.9, c0: me(), c1: new Script([{ at: 0.4, attack: true }]) });
    run(sim, contact + 1);
    assert.equal(only(sim, 'hit').length, 1, `${s}: 방어하지 않으면 반격에 맞음`);
  }
});

test('아나킨의 압박: 막혀도 균형·거리가 유리하면 다음 베기가 더 빨리 이어지고, 불리하면 보통 잠김', () => {
  const at = (balA) => {
    const sim = as('anakin', { dist: 1.9, c0: new Script([0.3, 0.42, 0.54, 0.66, 0.78].map((t) => ({ at: t, attack: true }))), c1: new Script([], { guard: [[0, 3]] }) });
    sim.fighters[0].bal = balA;
    run(sim, 1.4);
    const b = only(sim, 'block')[0];
    const sw = sim.events.filter((e) => e.type === 'swing' && e.combo === 2)[0];
    return { gap: sw.t - b.t, press: b.press };
  };
  const good = at(100);
  const bad = at(40); // (상대 균형 89보다 낮다)
  assert.equal(good.press, true);
  assert.equal(bad.press, false);
  assert.ok(bad.gap - good.gap >= 0.04, `압박 유지 ${good.gap.toFixed(3)} s / 보통 ${bad.gap.toFixed(3)} s`);
  // 오비완은 압박 연결이 없다
  const sim = as('obiwan', { dist: 1.7, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([], { guard: [[0, 3]] }) });
  run(sim, 1);
  assert.equal(only(sim, 'block')[0].press, false);
});

test('아나킨의 약점: 깊이 들어간 3타를 헛치면 회수가 길어 반격에 맞는다 — 오비완의 3타는 물러서며 방어로 돌아와 막는다', () => {
  const res = {};
  for (const s of STYLES) {
    const A = T.styles[s].attacks;
    // 0번: 3연타를 버퍼로 / 1번: 휘두르는 것을 보면 물러나고, 3타가 헛치면 다가와 벤다. 0번은 내내 방어 버튼을 누르고 있다(돌아오면 바로 방어)
    const presses = [];
    for (let t = 0.3; t < 1.7; t += 0.12) presses.push({ at: t, attack: true });
    const c1 = {
      command(sim, me, foe) {
        const a = foe.atk;
        const cmd = { move: { x: 0, y: 0 } };
        if (this.punish) {
          if (!this.hit && Math.hypot(foe.x - me.x, foe.y - me.y) < me.attacks.light1.reach + me.attacks.light1.lunge * 0.6) (this.hit = true), (cmd.attack = true);
          else if (!this.hit) cmd.move = { x: Math.sign(foe.x - me.x), y: 0 };
          return cmd;
        }
        if (foe.state === 'attack' && a && a.kind === 'light3' && a.outcome === 'whiff') this.punish = true;
        if (foe.state === 'attack' && a && a.phase !== 'recovery') cmd.move = { x: Math.sign(me.x - foe.x), y: 0 };
        return cmd;
      },
    };
    const sim = as(s, { dist: 2.4, c0: new Script(presses, { guard: [[0, 9]] }), c1 });
    run(sim, 3.5);
    const w = only(sim, 'whiff').find((e) => e.kind === 'light3');
    assert.ok(w, `${s}: 3타가 헛쳐야 시나리오가 성립 — ${sim.log.map((e) => e.type + ':' + e.kind).join(' ')}`);
    res[s] = { hit: only(sim, 'hit').filter((e) => e.target === sim.fighters[0]).length, block: only(sim, 'block').filter((e) => e.by === sim.fighters[0]).length, recover: A.light3.recovery + A.light3.whiffExtra };
  }
  assert.equal(res.anakin.hit, 1, `아나킨: 헛친 3타의 회수 중 맞음 ${JSON.stringify(res)}`);
  assert.equal(res.obiwan.hit, 0, `오비완: 막거나 피함 ${JSON.stringify(res)}`);
});

test('오비완의 약점: 내딛기가 짧아 아나킨이 닿는 거리에서 헛친다 · 오비완의 막기는 옆으로 디뎌 각도를 바꾼다 (밀리는 거리는 같다)', () => {
  const out = {};
  for (const s of STYLES) {
    const sim = as(s, { dist: 2.35, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([], { guard: [[0, 3]] }) });
    run(sim, 1);
    out[s] = sim.log[0] && sim.log[0].type;
  }
  assert.deepEqual(out, { anakin: 'block', obiwan: 'whiff' });
  // 막는 쪽의 밀림 방향: 아나킨이 막으면 곧장 뒤, 오비완이 막으면 뒤·옆
  const side = {};
  for (const s of STYLES) {
    const sim = as(other(s), { dist: 1.9, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([], { guard: [[0, 3]] }) });
    const B = sim.fighters[1];
    const [x0, y0] = [B.x, B.y];
    run(sim, 1);
    side[s] = { side: Math.abs(B.y - y0), back: B.x - x0 };
  }
  assert.ok(side.obiwan.side > 0.12 && side.anakin.side < 0.02, JSON.stringify(side));
  const len = (v) => Math.hypot(v.side, v.back);
  assert.ok(Math.abs(len(side.obiwan) - len(side.anakin)) < 0.06, `같은 거리만큼 밀린다: ${JSON.stringify(side)}`);
});

test('자세가 몸에 붙어 있다 (AI 대 AI 4판 × 30 s): 디딘 발은 미끄러지지 않고, 손은 팔 길이 안·손잡이 위, 다리는 닿는 길이 안', () => {
  const M = { ticks: 0, slide: 0, legOver: 0, armOver: 0, hilt: 0, steps: 0 };
  for (let seed = 1; seed <= 4; seed++) {
    const sim = duel({ dist: 3, c0: new AIController('anakin', seed), c1: new AIController('obiwan', seed + 100) });
    let prev = null;
    let last = -1;
    for (let i = 0; i < 30 * 120 && !sim.over; i++) {
      sim.step();
      if (sim.tick === last) continue;
      last = sim.tick;
      const cur = sim.fighters.map((f) => f.gait.feet.map((q) => ({ p: [...q.p], down: !q.step && q.z === 0 })));
      if (prev) cur.forEach((fs, a) => fs.forEach((q, b) => prev[a][b].down && q.down && (M.slide += Math.hypot(q.p[0] - prev[a][b].p[0], q.p[1] - prev[a][b].p[1]))));
      prev = cur;
      sim.fighters.forEach((f, i) => {
        const p = poseOf(f, sim.fighters[1 - i], sim.time);
        M.ticks++;
        if (v3.len(v3.sub(p.hand, p.shR)) > 2 * ARM + 1e-6 || v3.len(v3.sub(p.handL, p.shL)) > 2 * ARM + 1e-6) M.armOver++;
        if (Math.abs(v3.len(v3.sub(p.bladeBase, p.hand)) - T.saber.hilt * 0.5) > 1e-9) M.hilt++;
        if (v3.len(v3.sub(p.feet[0], p.hipL)) > 2 * LEG + 0.03 || v3.len(v3.sub(p.feet[1], p.hipR)) > 2 * LEG + 0.03) M.legOver++;
      });
    }
    M.steps += sim.fighters[0].gait.steps + sim.fighters[1].gait.steps;
  }
  assert.equal(M.slide, 0, '디딘 발이 움직였다');
  assert.equal(M.hilt, 0, '손이 손잡이에서 떨어졌다');
  assert.equal(M.armOver, 0, '손이 팔 길이 밖');
  assert.ok(M.legOver / M.ticks < 0.002, `다리가 닿지 않는 틱 비율 ${(M.legOver / M.ticks).toFixed(4)}`);
  assert.ok(M.steps > 400, `발을 옮겨 디딘다 (${M.steps}걸음)`);
});

test('막힌 순간 두 검이 만난다: 공격자가 오비완이어도 (캐릭터별 방어 자세)', () => {
  for (const s of STYLES) {
    const sim = as(s, { dist: 1.8, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([], { guard: [[0, 3]] }) });
    let gap = null;
    sim.on((e, si) => {
      if (e.type !== 'block') return;
      const [A, B] = si.fighters;
      const pa = poseOf(A, B, si.time);
      const pb = poseOf(B, A, si.time);
      const segDist = (() => {
        let best = Infinity;
        for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) best = Math.min(best, v3.len(v3.sub(v3.lerp(pa.bladeBase, pa.tip, i / 20), v3.lerp(pb.bladeBase, pb.tip, j / 20))));
        return best;
      })();
      gap = segDist;
    });
    run(sim, 1);
    assert.ok(gap !== null && gap < 0.12, `${s} 공격: 막는 순간 두 검 사이 ${gap}`);
  }
});
