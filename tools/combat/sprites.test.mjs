// 결투자 스프라이트 프레임 고르기 (src/combat/sprites.js, docs/CHARACTERS.md): 동작 라이브러리(같은 전투 코드에서 뽑은 자세 —
// 아나킨은 Movie Duels 모델의 public/sprites/duel/md_poses.json, 오비완은 v1의 hero_poses.json)로 고른 프레임이 판정 타이밍과 실제
// 자세에 맞는가. 시트 그림은 보지 않는다(브라우저 QA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duel, Script } from './harness.mjs';
import { CombatSim } from '../../src/combat/sim.js';
import { ArenaGround } from '../../src/combat/world.js';
import { AIController } from '../../src/combat/ai.js';
import { TUNING as T } from '../../src/combat/tuning.js';
import { poseOf } from '../../src/combat/pose.js';
import { FighterSprites } from '../../src/combat/sprites.js';

const read = (f) => JSON.parse(readFileSync(new URL('../../public/sprites/duel/' + f, import.meta.url)));
const LIB = { styles: { anakin: read('md_poses.json').styles.anakin, obiwan: read('hero_poses.json').styles.obiwan } };
const DIRS = { anakin: 8, obiwan: 16 };
// 시트 대신 프레임 수만 맞춘 가짜 세트 (pick이 돌려주는 프레임 = { clip, i })
const fakeSets = Object.fromEntries(
  Object.entries(LIB.styles).map(([s, clips]) => [s, { dirs: DIRS[s], anims: Object.fromEntries(Object.entries(clips).map(([n, c]) => [n, { data: Array.from({ length: DIRS[s] }, () => c.frames.map((_, i) => ({ clip: n, i }))) }])) }]),
);
const sprites = () => new FighterSprites(LIB, fakeSets);
const KINDS = ['light1', 'light2', 'light3', 'heavy'];

test('타격 프레임: 공격이 판정을 시작하는 틱(windup 끝 = s MID)에 그 동작의 hit 프레임이 나온다 (두 캐릭터, 기본 3타·강공격)', () => {
  for (const style of ['anakin', 'obiwan']) {
    for (const kind of KINDS) {
      const steps = kind === 'heavy' ? [{ at: 0.3, heavy: true }] : [];
      const holds = kind === 'heavy' ? {} : { attack: [[0.3, 3, 0.05]] };
      const c0 = new Script(steps, holds);
      if (holds.attack) c0.command = ((orig) => (sim) => {
        const cmd = orig.call(c0, sim);
        const t = sim.time;
        if (t >= 0.3 && Math.round(t * 120) % 6 === 0) cmd.attack = true;
        return cmd;
      })(c0.command);
      const sim = new CombatSim({ ground: new ArenaGround(0, 0, 9), spawns: [{ x: -7, y: 0 }, { x: 5, y: 0 }], cast: [style, style === 'anakin' ? 'obiwan' : 'anakin'], controllers: [c0, null] });
      const f = sim.fighters[0];
      const sp = sprites();
      let seen = false;
      for (let i = 0; i < 4 * 120 && !seen; i++) {
        sim.step();
        if (f.state === 'attack' && f.atk.kind === kind && f.atk.phase === 'active' && Math.abs(f.atk.t - f.atk.def.windup) < 1 / 120 + 1e-9) {
          const pk = sp.pick(f, poseOf(f, sim.fighters[1], sim.time), 1 / 60);
          assert.equal(pk.parts.length, 1);
          assert.equal(pk.blade.clip, kind);
          assert.equal(pk.blade.i, LIB.styles[style][kind].hit, `${style}.${kind}: 판정 첫 틱의 프레임 ${pk.blade.i} / hit ${LIB.styles[style][kind].hit}`);
          seen = true;
        }
      }
      assert.ok(seen, `${style}.${kind}: 공격이 나오지 않음`);
    }
  }
});

test('AI 대 AI: 모든 상태에서 유효한 프레임을 고르고, 날을 그리는 프레임의 손·검끝이 실제 자세(pose.js)와 가깝다', () => {
  const errs = [];
  const clips = new Set();
  for (const seed of [3, 7, 11]) {
    const sim = new CombatSim({ ground: new ArenaGround(0, 0, 7), spawns: [{ x: -1.5, y: 1.5 }, { x: 1.5, y: -1.5 }], cast: ['anakin', 'obiwan'], controllers: [new AIController('anakin', seed), new AIController('obiwan', seed + 100)] });
    const sp = sprites();
    for (let i = 0; i < 30 * 120; i++) {
      sim.step();
      if (i % 2) continue;
      for (const f of sim.fighters) {
        const foe = sim.fighters[1 - f.side];
        const p = poseOf(f, foe, sim.time);
        const pk = sp.pick(f, p, 1 / 60);
        for (const part of pk.parts) {
          const C = LIB.styles[f.style][part.clip];
          assert.ok(C, `${f.style}: 없는 동작 ${part.clip}`);
          assert.ok(part.i >= 0 && part.i < C.frames.length, `${part.clip} 프레임 ${part.i}`);
          clips.add(`${f.style}.${part.clip}`);
        }
        if (f.state === 'ready' || f.state === 'guard' || f.state === 'blockstun' || f.state === 'attack') {
          const c = Math.cos(f.facing);
          const s = Math.sin(f.facing);
          const L = (q) => [(q[0] - f.x) * c + (q[1] - f.y) * s, -(-(q[0] - f.x) * s + (q[1] - f.y) * c), q[2]];
          const fr = LIB.styles[f.style][pk.blade.clip].frames[pk.blade.i];
          // (위 겹은 아래 겹의 골반 높이로 옮겨 그린다: 그만큼 위아래로)
          const dz = pk.parts.length > 1 ? LIB.styles[f.style][pk.parts[0].clip].frames[pk.parts[0].i].z - fr.z : 0;
          const h = L(p.hand);
          const t = L(p.tip);
          errs.push([Math.hypot(h[0] - fr.h[0], h[1] - fr.h[1], h[2] - fr.h[2] - dz), Math.hypot(t[0] - fr.t[0], t[1] - fr.t[1], t[2] - fr.t[2] - dz)]);
        }
      }
    }
  }
  const hs = errs.map((e) => e[0]).sort((a, b) => a - b);
  const ts = errs.map((e) => e[1]).sort((a, b) => a - b);
  const q = (a, k) => a[Math.floor(a.length * k)];
  console.log(`  자유·방어·공격 중 손 차이: 중앙값 ${(q(hs, 0.5) * 100).toFixed(1)} cm, 90% ${(q(hs, 0.9) * 100).toFixed(1)} cm · 검끝: ${(q(ts, 0.5) * 100).toFixed(1)} / ${(q(ts, 0.9) * 100).toFixed(1)} cm (${errs.length}개, 쓰인 동작 ${clips.size})`);
  assert.ok(q(hs, 0.5) < 0.06 && q(hs, 0.9) < 0.16, '손');
  assert.ok(q(ts, 0.5) < 0.15 && q(ts, 0.9) < 0.4, '검끝');
  for (const k of ['up_stance', 'up_guard', 'low_stance', 'low_guard', 'light1', 'light2', 'walk_f']) assert.ok(clips.has('anakin.' + k) || clips.has('obiwan.' + k), k);
});

test('쳐내기: 정확히 쳐낸 직후 쳐내는 쪽은 쳐내기 동작(parry)을 시각 비율로, 쳐내진 쪽은 쳐내짐(parried)', () => {
  const contact = 0.4 + T.styles.obiwan.attacks.light1.windup;
  const sim = duel({ c0: new Script([], { guard: [[contact - 0.05, 2]] }), c1: new Script([{ at: 0.4, attack: true }]) });
  const [a, o] = sim.fighters;
  const sp = sprites();
  const seen = [];
  for (let i = 0; i < 1.2 * 120; i++) {
    sim.step();
    const pe = sim.events.find((e) => e.type === 'parry');
    if (!pe || sim.time > pe.t + 0.2) continue;
    const pa = sp.pick(a, poseOf(a, o, sim.time), 1 / 60, sim.time);
    if (sim.time - pe.t < 0.16) seen.push(pa.blade.clip);
    if (o.state === 'parried') assert.equal(sp.pick(o, poseOf(o, a, sim.time), 1 / 60, sim.time).blade.clip, 'parried');
  }
  assert.ok(seen.length > 5 && seen.every((c) => c === 'parry'), seen.join(','));
});

test('맵의 먼 이동 (sim travel): 상대가 멀면 가는 쪽을 보고 4.6 m/s, 먼 이동 걸음(run_f) — 시험장(travel 없음)은 그대로', () => {
  for (const travel of [true, false]) {
    const c0 = new Script([], { move: [[0, 3, { x: 0, y: 1 }]] });
    const sim = new CombatSim({ ground: new ArenaGround(0, 0, 40), spawns: [{ x: -10, y: -10 }, { x: 10, y: -10 }], cast: ['anakin', 'obiwan'], controllers: [c0, null], travel });
    const f = sim.fighters[0];
    const sp = sprites();
    for (let i = 0; i < 1.5 * 120; i++) sim.step();
    const speed = Math.hypot(f.vx, f.vy);
    const pk = sp.pick(f, poseOf(f, sim.fighters[1], sim.time), 1 / 60, sim.time);
    if (travel) {
      assert.ok(Math.abs(speed - 4.6) < 0.01, 'speed ' + speed);
      assert.ok(Math.abs(Math.sin(f.facing) - 1) < 0.01, 'facing ' + f.facing);
      assert.equal(pk.parts[0].clip, 'run_f');
    } else {
      assert.ok(speed < 3.5, 'speed ' + speed);
      assert.ok(Math.cos(f.facing) > 0.9, 'facing ' + f.facing);
      assert.equal(pk.parts[0].clip, 'walk_r');
    }
  }
});
