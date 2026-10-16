// 전투 자동 검증용 도구: 시험장 시뮬레이션과 시간표대로 누르는 컨트롤러.
import { CombatSim } from '../../src/combat/sim.js';
import { ArenaGround } from '../../src/combat/world.js';
import { DT } from '../../src/combat/tuning.js';

/**
 * 시간표 컨트롤러. steps: [{ at, attack | heavy | dodge | guardPressed: true, dir }] (누르는 순간),
 * holds: { guard: [[from, to], …], move: [[from, to, {x, y}], …] } (누르고 있음).
 */
export class Script {
  constructor(steps = [], holds = {}) {
    this.steps = steps.map((s) => ({ ...s }));
    this.holds = holds;
  }
  reset() {
    for (const s of this.steps) s.done = false;
  }
  command(sim) {
    const t = sim.time;
    const cmd = { move: { x: 0, y: 0 } };
    const g = (this.holds.guard || []).some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9);
    cmd.guard = g;
    if (g && !this.prevGuard) cmd.guardPressed = true;
    this.prevGuard = g;
    for (const [a, b, v] of this.holds.move || []) if (t >= a && t < b) cmd.move = v;
    for (const s of this.steps) {
      if (s.done || t < s.at - 1e-9) continue;
      s.done = true;
      for (const k of ['attack', 'heavy', 'dodge', 'guardPressed']) if (s[k]) cmd[k] = true;
      if (s.dir) cmd.move = s.dir;
    }
    return cmd;
  }
}

/** 두 결투자를 dist m 떨어뜨려 x축 위에 세운 시험장 */
export function duel({ dist = 1.8, c0 = null, c1 = null, cast } = {}) {
  const sim = new CombatSim({ ground: new ArenaGround(0, 0, 7), spawns: [{ x: -dist / 2, y: 0 }, { x: dist / 2, y: 0 }], cast, controllers: [c0, c1] });
  return sim;
}

/** sim을 sec초(시뮬레이션 시간) 동안 돌린다 — 실제 dt 조각 `frame`으로 (프레임 속도 시험) */
export function run(sim, sec, frame = 1 / 60) {
  const end = sim.time + sec;
  let guard = 0;
  while (sim.time < end - 1e-9 && guard++ < 1e6) sim.advance(typeof frame === 'function' ? frame() : frame);
  return sim;
}

export const types = (sim, filter) => sim.events.filter((e) => !filter || filter.includes(e.type)).map((e) => e.type);
export { DT };
