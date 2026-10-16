// 광선검 결투 규칙 자동 검증 — node --test tools/combat/   (npm run test:combat)
// 시나리오는 docs/COMBAT.md "검증 시나리오"와 같은 순서.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, Script, run } from './harness.mjs';
import { TUNING as T } from '../../src/combat/tuning.js';
import { AIController } from '../../src/combat/ai.js';

const L1 = T.attacks.light1;
const contactAt = (start, def = L1) => start + def.windup; // (사거리 안이면 active 첫 틱에 판정)
const only = (sim, type) => sim.log.filter((e) => e.type === type);

test('사거리 밖 공격은 헛치고, 헛친 공격은 회복이 길다', () => {
  const sim = duel({ dist: 3.0, c0: new Script([{ at: 0.1, attack: true }]) });
  run(sim, 0.1 + L1.windup + L1.active + 0.02);
  const [A, B] = sim.fighters;
  const w = only(sim, 'whiff');
  assert.equal(w.length, 1);
  assert.equal(w[0].why, 'range');
  assert.equal(B.hp, 100);
  assert.equal(B.bal, 100);
  // 회복 잠김 = chainAt + whiffExtra
  assert.ok(Math.abs(A.actionableIn(sim.time) - (L1.chainAt + L1.whiffExtra - 0.02)) < 0.02, `actionable ${A.actionableIn(sim.time)}`);
});

test('정상 방어: 체력 대신 균형이 줄고, 막은 쪽이 밀려난다', () => {
  const sim = duel({ dist: 1.8, c0: new Script([{ at: 0.6, attack: true }]), c1: new Script([], { guard: [[0, 5]] }) });
  run(sim, 1.5);
  const [, B] = sim.fighters;
  const b = only(sim, 'block');
  assert.equal(b.length, 1);
  assert.equal(only(sim, 'hit').length, 0);
  assert.equal(B.hp, 100);
  assert.ok(B.bal <= 100 - L1.blockBal + 0.5, `bal ${B.bal}`);
  assert.ok(Math.hypot(sim.fighters[0].x - B.x, sim.fighters[0].y - B.y) > 1.8 - L1.lunge + 0.2, '밀려남');
  // 접촉 위치는 몸 중심이 아니라 검 높이 (z > 0.9)
  assert.ok(b[0].at[2] > 0.9, `contact z ${b[0].at[2]}`);
});

test('방어 유지·연타로는 쳐내기가 반복 발동하지 않는다', () => {
  // 처음에 한 번 누르고 계속 유지: 이후 공격 두 번 모두 막기
  let sim = duel({ dist: 1.8, c0: new Script([{ at: 0.6, attack: true }, { at: 1.6, attack: true }]), c1: new Script([], { guard: [[0, 5]] }) });
  run(sim, 2.5);
  assert.equal(only(sim, 'parry').length, 0);
  assert.equal(only(sim, 'block').length, 2);
  // 0.1초마다 놓았다 누르기 (연타): 직전 입력에서 parryRearm이 안 지나 창이 열리지 않는다
  const taps = [];
  for (let t = 0.05; t < 2; t += 0.1) taps.push([t, t + 0.07]);
  sim = duel({ dist: 1.8, c0: new Script([{ at: 0.6, attack: true }, { at: 1.4, attack: true }]), c1: new Script([], { guard: taps }) });
  run(sim, 2.2);
  assert.equal(only(sim, 'parry').length, 0, '연타 쳐내기');
});

test('정확한 쳐내기: 공격자 균형·경직, 쳐낸 쪽이 주도권을 얻는다 (확정 피해는 아님)', () => {
  const start = 0.5;
  const press = contactAt(start) - 0.05;
  // 쳐낸 뒤 바로 반격, 공격자는 방어를 다시 올리지 않음 → 반격이 들어간다
  let sim = duel({ dist: 1.8, c0: new Script([{ at: start, attack: true }]), c1: new Script([{ at: contactAt(start) + 0.01, attack: true }], { guard: [[press, contactAt(start) + 0.01]] }) });
  let atParry = null;
  sim.on((e, s) => e.type === 'parry' && (atParry = s.initiative()));
  run(sim, contactAt(start) + 0.02);
  const p = only(sim, 'parry');
  assert.equal(p.length, 1);
  const [A, B] = sim.fighters;
  assert.equal(A.state, 'parried');
  assert.ok(A.bal <= 100 - L1.parryBal - L1.selfBlockBal + 0.5 || A.bal <= 100 - L1.parryBal + 0.5);
  assert.equal(atParry.leader, B, '쳐낸 쪽 주도권');
  assert.ok(Math.abs(atParry.adv - L1.parried) < 0.02, `주도권 ${atParry.adv}`);
  // 반격이 나가는 중: 쳐내진 쪽은 그 판정 전에 방어를 올릴 수 있다 (작은 기회 — 확정 피해 아님)
  const ini = sim.initiative();
  assert.equal(ini.swing.by, B);
  assert.equal(ini.swing.canGuard, true, JSON.stringify({ eta: ini.swing.eta, g: ini.swing.guardIn }));
  run(sim, 0.6);
  assert.equal(only(sim, 'hit').length, 1, '방어하지 않은 공격자는 반격에 맞는다');
  // 공격자가 방어를 다시 올리면: 반격은 막히지만 (확정 피해 없음) 균형을 더 잃는다 (shaken)
  sim = duel({ dist: 1.8, c0: new Script([{ at: start, attack: true }], { guard: [[contactAt(start) + 0.05, 3]] }), c1: new Script([{ at: contactAt(start) + 0.01, attack: true }], { guard: [[press, contactAt(start) + 0.01]] }) });
  run(sim, 1.2);
  assert.equal(only(sim, 'parry').length, 1);
  assert.equal(only(sim, 'hit').length, 0, '쳐내기 한 번으로 확정 피해가 나면 안 됨');
  const b = only(sim, 'block');
  assert.equal(b.length, 1);
  assert.ok(b[0].shaken, '쳐내진 직후의 방어는 균형을 더 잃는다');
});

test('연속 공격의 약점: 끝까지 막힌 3타는 반격당하고, 2타는 다시 누른 방어로 쳐낼 수 있다', () => {
  // A: 1-2-3타 (각 타의 이어치기 가능 시각 조금 전에 눌러 버퍼로), B: 방어 유지 후 3타가 막히자마자 공격
  const L2 = T.attacks.light2;
  const s0 = 0.5;
  const c1 = s0 + L1.windup; // 1타 판정
  const c2 = c1 + L1.chainAt + L2.windup; // 2타 판정 (막히면 그 자리에서 회복으로)
  const presses = [s0, c1 + L1.chainAt - 0.06, c2 + L2.chainAt - 0.06].map((at) => ({ at, attack: true }));
  let sim = duel({ dist: 1.8, c0: new Script(presses), c1: new Script([], { guard: [[0, 3]] }) });
  let punishAt = null;
  sim.on((e) => {
    if (e.type === 'block' && e.kind === 'light3') punishAt = e.t;
  });
  const c1c = sim.controllers[1];
  const orig = c1c.command.bind(c1c);
  c1c.command = (s, me, foe) => {
    const cmd = orig(s, me, foe);
    if (punishAt !== null) cmd.guard = false;
    if (punishAt !== null && s.time >= punishAt + T.attacks.light3.blockstun - 0.05 && !c1c.fired) {
      c1c.fired = true;
      cmd.attack = true;
    }
    return cmd;
  };
  run(sim, 3);
  const kinds = only(sim, 'block').map((e) => e.kind);
  assert.deepEqual(kinds, ['light1', 'light2', 'light3']);
  const hits = only(sim, 'hit');
  assert.equal(hits.length, 1, '3타 뒤 반격: ' + sim.log.map((e) => e.type + ':' + e.kind + ':' + (e.why || '')).join(' '));
  assert.equal(hits[0].by, sim.fighters[1]);
  // 2타를 쳐내기: 1타를 막은 뒤 방어를 잠깐 놓았다가 2타 직전에 다시 누름
  sim = duel({ dist: 1.8, c0: new Script(presses.slice(0, 2)), c1: new Script([], { guard: [[0, c2 - 0.1], [c2 - 0.07, 3]] }) });
  run(sim, 2);
  const seq = sim.log.map((e) => e.type + ':' + e.kind);
  assert.deepEqual(seq.slice(0, 2), ['block:light1', 'parry:light2'], seq.join(' '));
});

test('방어 유지의 약점: 계속 막으면 균형이 무너지고, 강공격은 크게 깎는다', () => {
  const presses = [];
  for (let t = 0.4; t < 6; t += 0.7) presses.push({ at: t, attack: true }, { at: t + 0.3, attack: true });
  const sim = duel({ dist: 1.8, c0: new Script(presses, { move: [[0, 9, { x: 1, y: 0 }]] }), c1: new Script([], { guard: [[0, 9]] }) });
  run(sim, 7);
  const br = sim.log.find((e) => e.type === 'break');
  assert.ok(br, '균형 붕괴가 나야 함');
  assert.equal(br.target, sim.fighters[1]);
  // 강공격 막기
  const h = duel({ dist: 1.9, c0: new Script([{ at: 0.4, heavy: true }]), c1: new Script([], { guard: [[0, 3]] }) });
  run(h, 1.5);
  assert.ok(h.fighters[1].bal <= 100 - T.attacks.heavy.blockBal + 0.5);
});

test('측면 회피와 후퇴로 공격을 피한다 (공격은 도중에 돌아서 따라오지 않는다)', () => {
  const start = 0.4;
  // 옆으로 (공격자 기준 오른쪽, 월드 +y) 회피
  let sim = duel({ dist: 1.8, c0: new Script([{ at: start, attack: true }]), c1: new Script([{ at: contactAt(start) - 0.08, dodge: true, dir: { x: 0, y: 1 } }]) });
  const facings = [];
  sim.on((e, s) => e.type === 'active' && facings.push(s.fighters[0].facing));
  run(sim, 1.2);
  assert.equal(only(sim, 'hit').length, 0);
  assert.equal(only(sim, 'whiff').length, 1);
  assert.equal(sim.fighters[1].hp, 100);
  // 뒤로 회피 (방향 없이 Space = 뒷걸음)
  sim = duel({ dist: 1.8, c0: new Script([{ at: start, attack: true }]), c1: new Script([{ at: contactAt(start) - 0.1, dodge: true }]) });
  run(sim, 1.2);
  assert.equal(only(sim, 'hit').length, 0);
  assert.equal(only(sim, 'whiff')[0].why === 'range' || only(sim, 'whiff')[0].why === 'evade', true);
  // 공격 도중 회전 보정 한도: 상대가 등 뒤로 돌아가도 active·recovery 동안 방향은 고정
  sim = duel({ dist: 1.8, c0: new Script([{ at: 0.2, heavy: true }]), c1: new Script([], { move: [[0.2, 2, { x: -1, y: 1 }]] }) });
  let f0 = null;
  let maxTurn = 0;
  sim.on((e, s) => e.type === 'active' && (f0 = s.fighters[0].facing));
  for (let i = 0; i < 120; i++) {
    run(sim, 1 / 120);
    const A = sim.fighters[0];
    if (f0 !== null && A.state === 'attack') maxTurn = Math.max(maxTurn, Math.abs(A.facing - f0));
  }
  assert.ok(maxTurn < 1e-9, `active 뒤 회전 ${maxTurn}`);
});

test('균형 붕괴 뒤에는 다가가 베어야 피해가 된다 (멀면 놓친다)', () => {
  const c = 0.3 + L1.windup; // 1타 판정 = 균형 붕괴
  const free = c + L1.recovery; // A가 다시 움직일 수 있는 시각
  const setup = (approach) => {
    // B의 균형을 낮춰 두고 기본 공격 한 번으로 무너뜨림 → A는 다가가서(또는 물러났다가) 공격
    const steps = [{ at: 0.3, attack: true }, { at: free + (approach ? 0.08 : 0.25), attack: true }];
    const move = approach ? [[free, free + 0.08, { x: 1, y: 0 }]] : [[free, free + 0.25, { x: -1, y: 0 }]];
    const sim = duel({ dist: 1.8, c0: new Script(steps, { move }), c1: new Script([], { guard: [[0, c + 0.05]] }) });
    sim.fighters[1].bal = 5;
    sim.fighters[1].balLossT = 0;
    run(sim, 2.2);
    return sim;
  };
  let sim = setup(true);
  assert.ok(sim.log.find((e) => e.type === 'break'));
  const h = only(sim, 'hit');
  assert.equal(h.length, 1, sim.log.map((e) => e.type).join(' '));
  assert.ok(h[0].punish && Math.abs(h[0].dmg - L1.dmg * T.reactions.brokenPunishMult) < 1e-9, '붕괴 응징 배율');
  sim = setup(false);
  assert.ok(sim.log.find((e) => e.type === 'break'));
  assert.equal(only(sim, 'hit').length, 0);
  assert.equal(only(sim, 'whiff').length, 1);
});

test('한 공격은 한 번만 판정한다 (여러 틱·타격 정지에도 중복 피해·균형 소모 없음)', () => {
  const sim = duel({ dist: 1.2, c0: new Script([{ at: 0.3, heavy: true }]) });
  const hp = [];
  for (let i = 0; i < 240; i++) {
    run(sim, 1 / 120);
    hp.push(sim.fighters[1].hp);
  }
  const drops = hp.filter((v, i) => i && v < hp[i - 1]).length;
  assert.equal(drops, 1);
  assert.equal(sim.fighters[1].hp, 100 - T.attacks.heavy.dmg);
  assert.equal(only(sim, 'hit').length, 1);
});

test('동시 공격: 같은 무게는 맞부딪히고, 강공격은 기본 공격을 누른다', () => {
  let sim = duel({ dist: 1.8, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([{ at: 0.3, attack: true }]) });
  run(sim, 1);
  assert.equal(only(sim, 'clash').length, 1);
  assert.equal(only(sim, 'hit').length, 0);
  assert.equal(sim.fighters[0].hp + sim.fighters[1].hp, 200);
  // 강공격의 active에 기본 공격이 맞물림
  const hv = T.attacks.heavy;
  sim = duel({ dist: 1.9, c0: new Script([{ at: 0.3, heavy: true }]), c1: new Script([{ at: 0.3 + hv.windup - L1.windup, attack: true }]) });
  run(sim, 1.5);
  const c = only(sim, 'clash');
  assert.equal(c.length, 1);
  assert.equal(c[0].winner, sim.fighters[0]);
});

test('방어는 전방위가 아니다: 등 뒤에서 온 공격은 막지 못한다', () => {
  const sim = duel({ dist: 1.6, c0: new Script([{ at: 0.02, attack: true }]), c1: new Script([], { guard: [[0, 2]] }) });
  sim.fighters[1].facing = 0; // (A를 등지고 서 있음: A는 -x 쪽)
  run(sim, 0.8);
  const h = only(sim, 'hit');
  assert.equal(h.length, 1);
  assert.equal(h[0].why, 'flank');
});

test('입력 버퍼는 한 칸·짧게: 여러 번 클릭해도 긴 대기열이 되지 않고, 버려진 입력은 이유가 남는다', () => {
  // 헛친 light1(0.3 시작, 이어치기 가능 = 0.3 + windup + active + chainAt + whiffExtra)의 회복 중 다섯 번 클릭 → 이어지는 건 light2 하나뿐
  const clicks = [0.55, 0.6, 0.66, 0.7, 0.74].map((at) => ({ at, attack: true }));
  clicks.unshift({ at: 0.3, attack: true });
  let sim = duel({ dist: 3.5, c0: new Script(clicks) });
  run(sim, 2);
  const swings = sim.events.filter((e) => e.type === 'swing').map((e) => e.kind);
  assert.deepEqual(swings, ['light1', 'light2']);
  // 회복 잠김 훨씬 전에 누른 입력은 버려지고 이유가 남는다
  sim = duel({ dist: 3.5, c0: new Script([{ at: 0.3, heavy: true }, { at: 0.4, attack: true }]) });
  run(sim, 0.7);
  assert.equal(sim.events.filter((e) => e.type === 'swing').length, 1);
  const rj = sim.fighters[0].reject;
  assert.ok(rj && rj.type === 'light' && /준비|판정|회복|강공격/.test(rj.reason), JSON.stringify(rj));
});

test('방어 중에는 느리게 움직이고, 회피 거리와 무적 시간은 따로 조정된다', () => {
  const sim = duel({ dist: 4, c0: new Script([], { guard: [[0, 2]], move: [[0, 2, { x: 0, y: 1 }]] }) });
  run(sim, 1);
  const v = Math.hypot(sim.fighters[0].vx, sim.fighters[0].vy);
  assert.ok(v <= T.body.guardMoveSpeed + 1e-9 && v > 0.5, `guard speed ${v}`);
  const d = duel({ dist: 4, c0: new Script([{ at: 0.2, dodge: true, dir: { x: 0, y: 1 } }]) });
  const y0 = d.fighters[0].y;
  run(d, 0.2 + T.dodge.dur + 0.05);
  assert.ok(Math.abs(d.fighters[0].y - y0 - T.dodge.dist) < 0.05, `dodge dist ${d.fighters[0].y - y0}`);
});

test('AI도 같은 규칙: 헛치고, 균형이 무너지고, 체력은 맞은 만큼만 준다', () => {
  const totals = { whiff: [0, 0], broken: [0, 0], hit: [0, 0], block: [0, 0], parry: [0, 0] };
  for (let seed = 1; seed <= 8; seed++) {
    const sim = duel({ dist: 4, c0: new AIController('anakin', seed), c1: new AIController('obiwan', seed + 50) });
    const dmg = [0, 0];
    sim.on((e) => e.type === 'hit' && (dmg[e.target.side] += e.dmg));
    run(sim, 40);
    for (const e of sim.log) {
      if (e.type === 'whiff') totals.whiff[e.by.side]++;
      if (e.type === 'break') totals.broken[e.target.side]++;
      if (e.type === 'hit') totals.hit[e.by.side]++;
      if (e.type === 'block') totals.block[e.by.side]++;
      if (e.type === 'parry') totals.parry[e.by.side]++;
    }
    for (const f of sim.fighters) assert.ok(Math.abs(100 - f.hp - dmg[f.side]) < 1e-9, '체력은 피격 사건으로만 준다');
  }
  for (const k of ['whiff', 'broken', 'block', 'parry']) for (const s of [0, 1]) assert.ok(totals[k][s] > 0, `${k}[${s}] = 0: ${JSON.stringify(totals)}`);
  // 공격은 몸보다 검에 더 자주 막힌다
  const blocked = totals.block[0] + totals.block[1] + totals.parry[0] + totals.parry[1];
  assert.ok(blocked > totals.hit[0] + totals.hit[1], JSON.stringify(totals));
});

test('AI는 상대 입력이 아니라 늦게 본 모습으로 반응한다 (공격 시작부터 대응 결정까지 반응 시간 이상)', () => {
  const lags = [];
  for (let seed = 1; seed <= 30; seed++) {
    const ai = new AIController('obiwan', seed);
    const sim = duel({ dist: 1.8, c0: new Script([{ at: 1, attack: true }]), c1: ai });
    let start = null;
    let id = 0;
    sim.on((e, s) => {
      if (e.type === 'swing' && e.by.side === 0 && start === null) (start = e.t), (id = s.fighters[0].atk.id);
    });
    for (let i = 0; i < 200; i++) {
      run(sim, 1 / 120);
      if (id && ai.handled === id) {
        lags.push(sim.time - start);
        break;
      }
    }
  }
  assert.ok(lags.length > 10, `반응 ${lags.length}`);
  for (const l of lags) assert.ok(l >= 0.16 - 1e-6, `반응 ${l}`);
});

test('재시작하면 판정·입력·AI 상태가 처음으로 돌아간다', () => {
  const ai = new AIController('obiwan', 3);
  const sim = duel({ dist: 3, c0: new AIController('anakin', 2), c1: ai });
  run(sim, 6);
  sim.fighters[0].buffer = { type: 'light', t: sim.time };
  sim.reset();
  for (const f of sim.fighters) {
    assert.equal(f.hp, 100);
    assert.equal(f.bal, 100);
    assert.equal(f.state, 'ready');
    assert.equal(f.buffer, null);
    assert.equal(f.atk, null);
    assert.equal(f.parryUntil, -1);
  }
  assert.equal(sim.time, 0);
  assert.equal(sim.freeze, 0);
  assert.equal(sim.log.length, 0);
  assert.equal(sim.over, null);
  assert.equal(ai.hist.length, 0);
  assert.equal(ai.presses.length, 0);
  assert.equal(ai.intent, 'idle');
});

test('프레임 속도가 달라도 공격 시간과 판정 결과가 같다', () => {
  const sig = (frame) => {
    const sim = duel({ dist: 3, c0: new AIController('anakin', 11), c1: new AIController('obiwan', 12) });
    run(sim, 20, frame);
    return sim.log.map((e) => `${e.tick}:${e.type}:${e.kind || ''}:${(e.dmg || 0).toFixed(3)}:${e.by ? e.by.side : e.target.side}`).join('|');
  };
  const base = sig(1 / 60);
  assert.ok(base.length > 50);
  assert.equal(sig(1 / 30), base, '30 fps');
  assert.equal(sig(1 / 144), base, '144 fps');
  let r = 7;
  const jitter = () => ((r = (r * 16807) % 2147483647) / 2147483647) * 0.04 + 0.002;
  assert.equal(sig(jitter), base, '불규칙한 프레임');
});

test('주도권 표시는 실제로 행동할 수 있는 시간과 같다 (막기·3타 막기·강공격 막기·쳐내기·헛침)', () => {
  const L3 = T.attacks.light3;
  const H = T.attacks.heavy;
  // 장면: [이름, A의 입력, B의 방어 구간, 기다릴 사건]
  const c1 = 0.4 + L1.windup;
  const scenes = [
    ['베기 막기', [{ at: 0.4, attack: true }], [[0, 9]], 'block'],
    ['3타 막기', [0.4, c1 + L1.chainAt - 0.05, c1 + L1.chainAt + T.attacks.light2.windup + T.attacks.light2.chainAt - 0.05].map((at) => ({ at, attack: true })), [[0, 9]], (e) => e.type === 'block' && e.kind === 'light3'],
    ['강공격 막기', [{ at: 0.4, heavy: true }], [[0, 9]], 'block'],
    ['쳐내기', [{ at: 0.4, attack: true }], [[c1 - 0.05, 9]], 'parry'],
    ['베기 헛침', [{ at: 0.4, attack: true }], [], 'whiff', 3.2],
    ['강공격 헛침', [{ at: 0.4, heavy: true }], [], 'whiff', 3.6],
  ];
  void L3;
  void H;
  for (const [name, steps, guard, until, dist = 1.8] of scenes) {
    const match = typeof until === 'function' ? until : (e) => e.type === until;
    // 1) 사건이 난 틱의 표시 값
    let at = null;
    let ini = null;
    const probe = duel({ dist, c0: new Script(steps), c1: new Script([], { guard }) });
    probe.on((e, s) => {
      if (!at && match(e)) (at = e.t), (ini = s.initiative());
    });
    run(probe, 3);
    assert.ok(at !== null, name);
    // 2) 같은 장면을 다시: 사건 뒤부터 한쪽이 매 틱 공격을 누르면 실제로 언제 공격이 나가는가
    for (const side of [0, 1]) {
      const spam = { command: (s) => (s.time >= at - 1e-9 ? { attack: true, guard: false, move: { x: 0, y: 0 } } : null) };
      const base = [new Script(steps), new Script([], { guard })];
      const ctl = base.map((b, i) => ({ command: (s, me, foe) => (i === side && spam.command(s)) || b.command(s, me, foe) }));
      const sim = duel({ dist, c0: ctl[0], c1: ctl[1] });
      let swingAt = null;
      sim.on((e) => e.type === 'swing' && e.by.side === side && e.t >= at - 1e-9 && swingAt === null && (swingAt = e.t));
      run(sim, at + 1.6);
      const shown = side === 0 ? ini.a : ini.b;
      assert.ok(swingAt !== null, `${name}: ${side}`);
      assert.ok(Math.abs(swingAt - at - shown) <= 1.5 / 120, `${name} side ${side}: 표시 ${shown.toFixed(3)} 실제 ${(swingAt - at).toFixed(3)}`);
    }
  }
});

test('거의 같이 시작한 공격은 검끼리 부딪히고, 분명히 먼저 친 쪽은 준비 중인 상대를 벤다', () => {
  // B가 tradeWindow 안에 늦게 시작: 맞부딪힘 (몸 피해 없음)
  let sim = duel({ dist: 1.8, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([{ at: 0.3 + T.tradeWindow - 0.03, attack: true }]) });
  run(sim, 1);
  assert.equal(only(sim, 'clash').length, 1, sim.log.map((e) => e.type).join(' '));
  assert.equal(only(sim, 'hit').length, 0);
  // B가 그보다 늦게 (준비 초반): A가 B를 벤다 — 준비 중에 끊김
  sim = duel({ dist: 1.8, c0: new Script([{ at: 0.3, attack: true }]), c1: new Script([{ at: 0.3 + T.tradeWindow + 0.04, attack: true }]) });
  run(sim, 1);
  const h = only(sim, 'hit');
  assert.equal(h.length, 1);
  assert.equal(h[0].why, 'counter');
});

test('AI는 이어 베기 전에 거리를 다시 본다: 물러나는 상대에게 연속 공격을 헛치지 않는다', () => {
  // 시험용 상대: AI가 휘두르기 시작하면 뒤로 걷고, 아니면 사거리 끝으로 다가온다 (후퇴로 헛치기 유도)
  const bait = () => ({
    command(s, me, foe) {
      const d = Math.hypot(foe.x - me.x, foe.y - me.y);
      const to = { x: (foe.x - me.x) / d, y: (foe.y - me.y) / d };
      if (foe.state === 'attack' && foe.atk.phase !== 'recovery') this.back = s.time + 0.35;
      if (s.time < (this.back || 0)) return { move: { x: -to.x, y: -to.y } };
      return { move: d > 2.1 ? to : d < 1.7 ? { x: -to.x, y: -to.y } : { x: 0, y: 0 } };
    },
  });
  let chainWhiff = 0;
  let firstWhiff = 0;
  const dec = { chain: 0, advance: 0, abort: 0, stopBlocked: 0 };
  for (let seed = 1; seed <= 10; seed++) {
    const ai = new AIController('anakin', seed);
    const sim = duel({ dist: 3, c0: bait(), c1: ai });
    sim.on((e) => {
      if (e.type === 'whiff' && e.by.side === 1) e.by.atk && e.by.atk.combo > 1 ? chainWhiff++ : firstWhiff++;
    });
    run(sim, 20);
    for (const k in dec) dec[k] += ai.decisions[k];
  }
  // 첫 베기는 유도에 걸려 헛칠 수 있다 (플레이어의 후퇴가 통한다) — 이어 베기는 거의 헛치지 않는다
  assert.ok(firstWhiff > 20, `첫 베기 헛침 ${firstWhiff}`);
  assert.ok(chainWhiff <= firstWhiff * 0.15, `이어 베기 헛침 ${chainWhiff} / 첫 베기 ${firstWhiff}`);
  assert.ok(dec.advance + dec.abort > 0, JSON.stringify(dec));
});

test('막힌 순간 두 검은 접촉점에서 만나고, 잠깐 맞물린 채 머문다', async () => {
  const { poseOf, closestSeg, v3 } = await import('../../src/combat/pose.js');
  const sim = duel({ dist: 1.8, c0: new Script([{ at: 0.4, attack: true }]), c1: new Script([], { guard: [[0, 9]] }) });
  let at = null;
  sim.on((e) => e.type === 'block' && (at = e.at));
  const gaps = [];
  for (let i = 0; i < 160; i++) {
    sim.step();
    if (!at) continue;
    const [A, B] = sim.fighters;
    const pa = poseOf(A, B, sim.time);
    const pb = poseOf(B, A, sim.time);
    const [p, q] = closestSeg(pa.bladeBase, pa.tip, pb.bladeBase, pb.tip);
    gaps.push(v3.len(v3.sub(p, q)));
    if (gaps.length === 1) assert.ok(v3.len(v3.sub(p, at)) < 0.15, '공격자 검이 접촉점을 지남');
    if (gaps.length > 16) break;
  }
  assert.ok(gaps[0] < 0.05, `접촉 순간 두 검 사이 ${gaps[0]}`);
  // 타격 정지(틱이 멈춤) 뒤에도 몇 틱 동안 0.2 m 안에 맞물려 있다
  assert.ok(gaps.slice(0, 12).every((g) => g < 0.2), gaps.map((g) => g.toFixed(2)).join(' '));
});

// ---- 승부 확정과 재시작 (플레이 검수 2026-10-16: KO 뒤 남은 공격 판정, R 직후 상태) ----
import { CombatSim } from '../../src/combat/sim.js';
import { ArenaGround } from '../../src/combat/world.js';

/** 시험장(arena.js)과 똑같이: 같은 시작 위치, AI 시드, 시작 때 한 번 더 reset (round 2) */
function arenaWatch(seed) {
  const ais = [new AIController('anakin', seed), new AIController('obiwan', seed + 100)];
  const sim = new CombatSim({ ground: new ArenaGround(0, 0, 7), spawns: [{ x: -1.5, y: 1.5 }, { x: 1.5, y: -1.5 }], cast: ['anakin', 'obiwan'], controllers: ais });
  sim.reset();
  return { sim, ais };
}
const JUDGE = /^(swing|active|whiff|block|parry|clash|break|hit|evade|ko|dodge|lead)$/;

test('승부가 나면 전투가 끝난다: KO 뒤 공격·방어·피격·헛침 판정과 통계가 더 생기지 않는다 (seed 3·7·11 관전)', () => {
  let kos = 0;
  for (const seed of [3, 7, 11]) {
    const { sim, ais } = arenaWatch(seed);
    const late = [];
    let stats = null;
    sim.on((e, s) => {
      if (e.type === 'over') stats = JSON.stringify(s.stats);
      else if (s.over && JUDGE.test(e.type)) late.push(`${e.t.toFixed(2)} ${e.type}`);
    });
    while (sim.time < 60 && !(sim.over && sim.time > sim.over.t + 5)) sim.advance(1 / 60);
    if (!sim.over) continue; // (seed 7은 60 s 안에 승부가 나지 않는다)
    kos++;
    assert.deepEqual(late, [], `seed ${seed} KO 뒤 사건`);
    assert.equal(JSON.stringify(sim.stats), stats, `seed ${seed} KO 뒤 통계`);
    for (const f of sim.fighters) {
      assert.equal(f.buffer, null);
      assert.ok(!(f.state === 'attack' && f.atk.phase !== 'recovery'), '휘두르는 중인 공격이 남음');
    }
    for (const a of ais) {
      assert.equal(a.presses.length, 0);
      assert.equal(a.intent, 'over');
    }
    const ini = sim.initiative();
    assert.ok(ini.over && ini.over.winner === sim.over.winner, '주도권 대신 승패');
    assert.equal(ini.leader, null);
    // 쓰러짐 동작(그리기용)은 계속 진행된다
    assert.ok(sim.over.loser.koT > 4, `koT ${sim.over.loser.koT}`);
  }
  assert.ok(kos >= 2, `KO가 난 판 ${kos}`);
});

test('KO 순간 눌러 둔 이어 베기·예약된 공격은 나가지 않는다 (스크립트)', () => {
  // A가 1타로 B를 쓰러뜨림 — 그 직후 A의 버퍼에 이어 베기, 이어서 강공격 입력
  const c = 0.3 + L1.windup;
  const sim = duel({ dist: 1.8, c0: new Script([{ at: 0.3, attack: true }, { at: c - 0.02, attack: true }, { at: c + 0.2, heavy: true }, { at: c + 0.5, dodge: true }]) });
  sim.fighters[1].hp = 5;
  run(sim, 2);
  assert.ok(sim.over && sim.over.winner === sim.fighters[0]);
  const after = sim.events.filter((e) => e.t > sim.over.t && JUDGE.test(e.type));
  assert.deepEqual(after.map((e) => e.type), []);
  assert.equal(sim.events.filter((e) => e.type === 'swing').length, 1);
});

test('R(재시작)는 어떤 순간에도 판정·입력·AI·통계·위치를 처음으로 되돌린다 (진행 중·공격 중·피격 중·타격 정지 중·KO 뒤)', () => {
  const moments = {
    진행중: (s) => s.time > 2,
    공격중: (s) => s.fighters.some((f) => f.state === 'attack' && f.atk.phase === 'windup'),
    피격중: (s) => s.fighters.some((f) => f.state === 'hitstun'),
    타격정지중: (s) => s.freeze > 0,
    KO뒤: (s) => s.over && s.time > s.over.t + 0.5,
  };
  for (const [name, when] of Object.entries(moments)) {
    const { sim, ais } = arenaWatch(11);
    let n = 0;
    while (!when(sim) && n++ < 120 * 80) sim.step();
    assert.ok(when(sim), `${name} 상황에 이르지 못함`);
    sim.reset();
    assert.equal(sim.time, 0, name);
    assert.equal(sim.tick, 0, name);
    assert.equal(sim.freeze, 0, name);
    assert.equal(sim.over, null, name);
    assert.equal(sim.log.length, 0, name);
    assert.ok(Object.values(sim.stats).every((v) => v === 0), name);
    const sp = sim.spawns;
    sim.fighters.forEach((f, i) => {
      assert.equal(f.hp, 100, name);
      assert.equal(f.bal, 100, name);
      assert.equal(f.state, 'ready', name);
      assert.equal(f.atk, null, name);
      assert.equal(f.buffer, null, name);
      assert.equal(f.combatOver, false, name);
      assert.ok(f.x === sp[i].x && f.y === sp[i].y && f.kx === 0 && f.vx === 0, name);
    });
    for (const a of ais) {
      assert.equal(a.hist.length, 0, name);
      assert.equal(a.presses.length, 0, name);
      assert.equal(a.intent, 'idle', name);
    }
    // 재시작한 결투가 다시 정상으로 싸운다 (막기·쳐내기 등 판정이 다시 난다)
    while (sim.time < 12) sim.advance(1 / 60);
    assert.ok(sim.log.length > 0, `${name}: 재시작 뒤 판정 없음`);
  }
});
