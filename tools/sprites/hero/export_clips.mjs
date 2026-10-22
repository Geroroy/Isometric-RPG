// 결투 캐릭터 스프라이트의 동작 원본: 실제 전투 코드(src/combat — sim·fighter·pose·gait·moves·tuning)를 스크립트 입력으로 돌려
// 결투자의 자세(골반·가슴·머리·어깨·팔꿈치·두 손·검 방향·엉덩이·무릎·발, 몸통 비틀기·기울기·무릎 굽힘)를 틱마다 기록하고,
// 스프라이트 프레임으로 쓸 순간을 고른다. pose_hero.py가 이 관절 위치를 모델 리그에 그대로 옮긴다 (리타깃).
// 검술 v1의 동작을 따로 그리지 않는다 — 게임이 그리는 자세 그 자체다.
//
//   node tools/sprites/hero/export_clips.mjs [out.json] [--styles anakin] [--lib <동작 라이브러리.json>] [--md]
//     (기본 tools/sprites/out/hero_clips.json, public/sprites/duel/hero_poses.json, 두 캐릭터)
//     --md   Movie Duels 아나킨 시트용 (tools/sprites/md/md_combat.py, docs/characters/MD_ANAKIN.md "전투 연결"): 쳐내기 `parry`와
//            맵의 먼 이동 걸음 `run_f`(4.6 m/s, sim travel)를 더한다
//
// 좌표: 몸 기준 (몸 중심 바닥 = 원점), Blender 축 — X 앞(바라보는 방향), Y 몸의 왼쪽, Z 위, m.
// 동작(clip)마다 프레임 목록과, 게임이 프레임을 고르는 데 쓰는 값(m: 상태·공격 위치 s·시각 비율 k·걷기 위상)을 둔다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CombatSim } from '../../../src/combat/sim.js';
import { ArenaGround } from '../../../src/combat/world.js';
import { TUNING as T, DT } from '../../../src/combat/tuning.js';
import { poseOf, swingS, MID, LEAD, FOLLOW } from '../../../src/combat/pose.js';
import { movesOf } from '../../../src/combat/moves.js';
import { AIController } from '../../../src/combat/ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const opt = (k) => (ARGV.includes(k) ? ARGV[ARGV.indexOf(k) + 1] : null);
const OUT = resolve(ARGV[0] && !ARGV[0].startsWith('--') ? ARGV[0] : resolve(HERE, '../out/hero_clips.json'));
const STYLES = opt('--styles') ? opt('--styles').split(',') : ['anakin', 'obiwan'];
const MD = ARGV.includes('--md');
const other = (s) => (s === 'anakin' ? 'obiwan' : 'anakin');
const r4 = (x) => Math.round(x * 1e4) / 1e4;

/** 시간표 컨트롤러 (tools/combat/harness.mjs Script와 같은 형식) */
class Script {
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
    for (const k of ['attack', 'heavy']) for (const [a, b, every] of this.holds[k] || []) if (t >= a && t < b && Math.round((t - a) / DT) % Math.round(every / DT) === 0) cmd[k] = true;
    for (const s of this.steps) {
      if (s.done || t < s.at - 1e-9) continue;
      s.done = true;
      for (const k of ['attack', 'heavy', 'dodge', 'guardPressed']) if (s[k]) cmd[k] = true;
      if (s.dir) cmd.move = s.dir;
    }
    return cmd;
  }
}

function duel(style, { dist = 1.8, c0 = null, c1 = null, x0, half = 9, travel = false } = {}) {
  const a = x0 ?? -dist / 2;
  return new CombatSim({ ground: new ArenaGround(0, 0, half), spawns: [{ x: a, y: 0 }, { x: a + dist, y: 0 }], cast: [style, other(style)], controllers: [c0, c1], travel });
}

/** 결투자 f의 자세를 몸 기준(Blender 축)으로 */
function localPose(f, foe, now, fall = 0) {
  const p = poseOf(f, foe, now);
  const c = Math.cos(f.facing);
  const s = Math.sin(f.facing);
  const back = [-c, -s];
  const ang = (fall * Math.PI) / 2.2;
  const L = (q) => {
    let [x, y, z] = q;
    if (fall) {
      // (쓰러짐: view.js fallen과 같은 변환 — 뒤로 넘어간다)
      x += back[0] * Math.sin(ang) * z;
      y += back[1] * Math.sin(ang) * z;
      z = Math.max(0.05, z * Math.cos(ang));
    }
    const dx = x - f.x;
    const dy = y - f.y;
    return [r4(dx * c + dy * s), r4(-(-dx * s + dy * c)), r4(z)];
  };
  const D = (v) => [r4(v[0] * c + v[1] * s), r4(-(-v[0] * s + v[1] * c)), r4(v[2])];
  let dir = D(p.dir);
  if (fall) {
    const t = L([f.x + p.tip[0] - f.x, p.tip[1], p.tip[2]]);
    const h = L(p.hand);
    const v = [t[0] - h[0], t[1] - h[1], t[2] - h[2]];
    const l = Math.hypot(...v) || 1;
    dir = v.map((x) => r4(x / l));
  }
  return {
    hips: L(p.hips), chest: L(p.chest), head: L(p.head), shL: L(p.shL), shR: L(p.shR),
    elbowL: L(p.elbows[0]), elbowR: L(p.elbows[1]), hand: L(p.hand), handL: L(p.handL), dir, tip: L(p.tip), bladeBase: L(p.bladeBase),
    hipL: L(p.hipL), hipR: L(p.hipR), kneeL: L(p.knees[0]), kneeR: L(p.knees[1]), footL: L(p.feet[0]), footR: L(p.feet[1]),
    tw: r4(p.tw), lean: r4(p.lean), cr: r4(p.cr + (p.crouch || 0)),
  };
}

/** sim을 sec초 돌리며 0번 결투자를 틱마다 기록 */
function record(sim, sec, idx = 0) {
  const f = sim.fighters[idx];
  const foe = sim.fighters[1 - idx];
  const out = [];
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    sim.step();
    const a = f.atk;
    out.push({
      t: sim.time, state: f.state, st: f.st, dur: f.dur,
      atk: a ? { kind: a.kind, phase: a.phase, t: a.t, recT: a.recT, outcome: a.outcome, s: swingS(a.def, a.t), id: a.id ?? a.seq ?? null } : null,
      speed: Math.hypot(f.vx, f.vy), vel: [f.vx, f.vy], facing: f.facing, steps: f.gait ? f.gait.steps : 0, koT: f.koT,
      pose: localPose(f, foe, sim.time),
      f, foe,
    });
  }
  return out;
}

const strip = (r, extra = {}) => ({ ...r.pose, m: extra });

// ------------------------------------------------------------------------------------------------- 공격
/** 한 공격(start → 회복 끝)의 틱 기록에서 스프라이트 프레임을 고른다: 젖히기 3 · 휘두르기 8 (s = MID 포함) · 회수 4 */
function attackFrames(recs, def) {
  const pre = def.windup - LEAD;
  const out = [];
  const near = (pred, key) => recs.filter(pred).reduce((b, r) => (!b || key(r) < key(b) ? r : b), null);
  // 젖히기: 공격 시각 a.t = pre × 1/3, 2/3, 1
  for (const k of [1 / 3, 2 / 3, 1]) {
    const r = near((r) => r.atk.phase !== 'recovery', (r) => Math.abs(r.atk.t - pre * k));
    out.push(strip(r, { phase: 'windup', k: r4(r.atk.t / pre) }));
  }
  // 휘두르기 s (MID는 판정이 날 수 있는 첫 순간 = 타격 프레임)
  const S = [0.08, 0.2, 0.31, MID, 0.53, 0.66, 0.8, 1.0];
  let hit = -1;
  for (const s of S) {
    const r = near((r) => r.atk.phase !== 'recovery' || r.atk.recT < FOLLOW, (r) => Math.abs((r.atk.phase === 'recovery' ? swingS(def, def.windup + def.active + r.atk.recT) : r.atk.s) - s));
    if (Math.abs(s - MID) < 1e-9) hit = out.length;
    out.push(strip(r, { phase: 'swing', s }));
  }
  // 회수: 회복 시간 비율
  const recs2 = recs.filter((r) => r.atk.phase === 'recovery');
  const total = recs2.length ? recs2[recs2.length - 1].atk.recT : def.recovery;
  for (const k of [0.3, 0.55, 0.8, 1.0]) {
    const r = near((r) => r.atk.phase === 'recovery', (r) => Math.abs(r.atk.recT - total * k));
    out.push(strip(r, { phase: 'recovery', k }));
  }
  return { frames: out, hit };
}

/** 막힌 공격의 회수 4장 (phase 'blocked', 회복 시간 비율 k) */
function blockedFrames(recs) {
  const rs = recs.filter((r) => r.atk.phase === 'recovery' && r.atk.outcome === 'blocked');
  if (!rs.length) return [];
  const total = rs[rs.length - 1].atk.recT;
  return [0.12, 0.35, 0.65, 1.0].map((k) => {
    const r = rs.reduce((b, r) => (Math.abs(r.atk.recT - total * k) < Math.abs(b.atk.recT - total * k) ? r : b));
    return strip(r, { phase: 'blocked', k });
  });
}

/** 기록에서 공격 하나씩 (kind별 첫 번째) */
function splitAttacks(recs) {
  const by = {};
  let cur = null;
  for (const r of recs) {
    if (r.state === 'attack') {
      if (!cur || cur.kind !== r.atk.kind || (cur.last && r.atk.t < cur.last.atk.t)) {
        cur = { kind: r.atk.kind, recs: [] };
        if (!by[cur.kind]) by[cur.kind] = cur;
      }
      cur.recs.push(r);
      cur.last = r;
    } else cur = null;
  }
  return by;
}

function attackClips(style) {
  const A = T.styles[style].attacks;
  const clips = {};
  // 기본 연속 공격: 멀리 있는 상대에게 0.05 s마다 클릭 (1 → 2 → 3타, 모두 헛침: 끝까지 휘두르는 궤적)
  {
    const sim = duel(style, { dist: 12, x0: -7, c0: new Script([], { attack: [[0.3, 3.2, 0.05]] }) });
    const by = splitAttacks(record(sim, 3.4));
    for (const k of ['light1', 'light2', 'light3']) clips[k] = { ...attackFrames(by[k].recs, A[k]), kind: k };
  }
  // 막힌 공격의 회수 (검이 접촉점에 머물렀다 튕겨 나와 다음 자세로): 방어를 든 상대에게 같은 연속 공격 — 회수 프레임만 더한다
  {
    const sim = duel(style, { dist: 1.9, c0: new Script([], { attack: [[0.3, 3.2, 0.05]] }), c1: new Script([], { guard: [[0, 9]] }) });
    const by = splitAttacks(record(sim, 3.4));
    for (const k of ['light1', 'light2', 'light3']) if (by[k]) clips[k].frames.push(...blockedFrames(by[k].recs));
  }
  {
    const sim = duel(style, { dist: 12, x0: -7, c0: new Script([{ at: 0.3, heavy: true }]) });
    const by = splitAttacks(record(sim, 2.4));
    clips.heavy = { ...attackFrames(by.heavy.recs, A.heavy), kind: 'heavy' };
  }
  {
    // 반격: 상대의 베기를 판정 직전 새로 누른 방어로 쳐내고 곧바로 클릭 (style.test.mjs와 같은 장면)
    const foeDef = T.styles[other(style)].attacks.light1;
    const contact = 0.4 + foeDef.windup;
    const sim = duel(style, { dist: 1.9, c0: new Script([{ at: contact + 0.02, attack: true }], { guard: [[contact - 0.05, contact + 0.02]] }), c1: new Script([{ at: 0.4, attack: true }], { move: [[contact + 0.05, 3, { x: 1, y: 0 }]] }) });
    const by = splitAttacks(record(sim, 2.2));
    if (!by.riposte) throw new Error(style + ': no riposte recorded');
    clips.riposte = { ...attackFrames(by.riposte.recs, A.riposte), kind: 'riposte' };
  }
  return clips;
}

// ------------------------------------------------------------------------------------------------- 반응
/** 상태 `state`의 기록을 시간 비율 k(= st / dur)로 n장 */
function timed(recs, state, ks, extra = {}) {
  // (--md: 반응이 시작하는 순간(k = 0 — 접촉한 자세)도 한 장: 타격 정지 화면에서 날이 접촉점에 있게)
  if (MD && ks[0] > 0) ks = [0, ...ks];
  const rs = recs.filter((r) => r.state === state);
  if (!rs.length) throw new Error('no ' + state);
  return ks.map((k) => {
    const r = rs.reduce((b, r) => (Math.abs(r.st / Math.max(1e-6, r.dur || rs[rs.length - 1].st) - k) < Math.abs(b.st / Math.max(1e-6, b.dur || rs[rs.length - 1].st) - k) ? r : b));
    return strip(r, { phase: state, k, ...extra });
  });
}

function reactionClips(style) {
  const clips = {};
  const foeA = T.styles[other(style)].attacks;
  const myA = T.styles[style].attacks;
  // 쳐내짐: 내 베기를 상대가 판정 직전 새로 누른 방어로 쳐냄
  {
    const contact = 0.4 + myA.light1.windup;
    const sim = duel(style, { dist: 1.9, c0: new Script([{ at: 0.4, attack: true }]), c1: new Script([], { guard: [[contact - 0.05, 2]] }) });
    clips.parried = { frames: timed(record(sim, 1.6), 'parried', [0.05, 0.2, 0.4, 0.6, 0.8, 1.0]) };
  }
  // 맞부딪힘: 같은 순간 서로 베기
  {
    const sim = duel(style, { dist: 1.9, c0: new Script([{ at: 0.4, attack: true }]), c1: new Script([{ at: 0.4 + myA.light1.windup - foeA.light1.windup, attack: true }]) });
    clips.clash = { frames: timed(record(sim, 1.4), 'clash', [0.1, 0.35, 0.65, 1.0]) };
  }
  // 강공격에 밀림: 내 베기와 상대 강공격이 맞부딪힘
  {
    const sim = duel(style, { dist: 1.9, c0: new Script([{ at: 0.6 + foeA.heavy.windup - myA.light1.windup, attack: true }]), c1: new Script([{ at: 0.6, heavy: true }]) });
    clips.overpowered = { frames: timed(record(sim, 2.0), 'overpowered', [0.1, 0.35, 0.65, 1.0]) };
  }
  // 피격: 방어하지 않은 몸에 상대 베기
  {
    const sim = duel(style, { dist: 1.9, c1: new Script([{ at: 0.4, attack: true }]) });
    clips.hitstun = { frames: timed(record(sim, 1.4), 'hitstun', [0.1, 0.3, 0.55, 0.8, 1.0]) };
  }
  // 균형 붕괴: 방어를 든 채 상대 강공격을 연달아 막음
  {
    const sim = duel(style, { dist: 1.9, c0: new Script([], { guard: [[0.1, 9]] }), c1: new Script([], { heavy: [[0.3, 9, 0.05]], move: [[0.3, 9, { x: -1, y: 0 }]] }) });
    clips.broken = { frames: timed(record(sim, 9), 'broken', [0.05, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0]) };
  }
  // 회피 (뒷걸음 — 방향 없는 회피)
  {
    const sim = duel(style, { dist: 3, c0: new Script([{ at: 0.4, dodge: true }]) });
    const recs = record(sim, 1.2);
    const rs = recs.filter((r) => r.state === 'dodge');
    clips.dodge = { frames: [0.05, 0.25, 0.45, 0.65, 0.85, 1.0].map((k) => strip(rs[Math.min(rs.length - 1, Math.round(k * (rs.length - 1)))], { phase: 'dodge', k })) };
  }
  // 쳐내기 (--md): 상대의 베기를 판정 직전 새로 누른 방어로 쳐낸 직후 0.16 s — 검을 바깥으로 쳐 올림 (pose.js 'parrier'), 시각 비율 k
  if (MD) {
    const foeDef = foeA.light1;
    const contact = 0.4 + foeDef.windup;
    const sim = duel(style, { dist: 1.9, c0: new Script([], { guard: [[contact - 0.05, 2]] }), c1: new Script([{ at: 0.4, attack: true }]) });
    const recs = record(sim, 1.2);
    // (쳐낸 시각은 사건으로: 기록의 f는 같은 객체라 그 contact는 마지막 값)
    const pe = sim.events.find((e) => e.type === 'parry');
    if (!pe) throw new Error(style + ': no parry');
    const win = recs.filter((r) => r.t >= pe.t - 1e-9 && r.t <= pe.t + 0.16 + 1e-9);
    clips.parry = { frames: [0, 0.25, 0.5, 0.75, 1].map((k) => strip(win.reduce((b, r) => (Math.abs(r.t - pe.t - 0.16 * k) < Math.abs(b.t - pe.t - 0.16 * k) ? r : b)), { phase: 'parry', k })) };
  }
  // 쓰러짐: 기본 자세에서 뒤로 넘어감 (view.js fallen: 0.5 s)
  {
    const sim = duel(style, { dist: 3 });
    for (let i = 0; i < 60; i++) sim.step();
    const f = sim.fighters[0];
    clips.dead = { frames: [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((k) => ({ ...localPose(f, sim.fighters[1], sim.time, k), m: { phase: 'dead', k } })), loop: false };
  }
  return clips;
}

// ------------------------------------------------------------------------------------------------- 걷기
/** 일정한 걷기 (상대를 바라본 채 dir 쪽으로: f 앞 · b 뒤 · l 왼쪽 · r 오른쪽): 걸음이 자리 잡은 뒤 두 걸음(한 주기)을 n장으로 */
function walkClip(style, guard, dir, n = 6, travel = false) {
  const v = { f: { x: 1, y: 0 }, b: { x: -1, y: 0 }, l: { x: 0, y: -1 }, r: { x: 0, y: 1 } }[dir];
  // (먼 이동: 상대가 travelDist 밖에 남도록 넓은 바닥에서)
  const sim = travel
    ? duel(style, { dist: 60, x0: -30, half: 40, travel: true, c0: new Script([], { move: [[0, 9, v]] }) })
    : duel(style, { dist: 14, x0: dir === 'b' ? -1 : -8, c0: new Script([], { move: [[0, 9, v]], guard: guard ? [[0, 9]] : [] }) });
  const recs = record(sim, 3.0).filter((r) => r.t > 1.0);
  // 한 주기 = 왼발이 디딘 순간부터 다음에 다시 디딘 순간까지
  const lands = [];
  for (let i = 1; i < recs.length; i++) {
    const a = recs[i - 1].f.gait; // (gait는 마지막 상태라 기록의 발 높이로 본다)
    if (recs[i - 1].pose.footL[2] > 0.001 && recs[i].pose.footL[2] <= 0.001) lands.push(i);
  }
  if (lands.length < 2) throw new Error(`${style} walk ${dir}: no cycle`);
  const [i0, i1] = [lands[0], lands[1]];
  const period = recs[i1].t - recs[i0].t;
  const speed = recs.slice(i0, i1).reduce((s, r) => s + r.speed, 0) / (i1 - i0);
  const frames = [];
  for (let k = 0; k < n; k++) {
    const r = recs[i0 + Math.round(((i1 - i0) * k) / n)];
    frames.push(strip(r, { phase: 'walk', k: k / n }));
  }
  return { layer: 'lower', frames, loop: true, period: r4(period), stride: r4(period * speed), speed: r4(speed), dir, guard, ...(travel ? { travel: true } : {}) };
}

// ------------------------------------------------------------------------------------------------- 서 있는 자세 (겹 스프라이트)
// 기본 자세와 방어 자세의 손·검은 상대에 따라 계속 겨눈다 (sim.updateGuard: 들어오는 공격의 접촉점, 상대 검끝). 그래서 서 있거나 걸을 때는
// 디아블로 2처럼 몸을 두 겹으로 그린다: 위 겹(허리띠 위 · 팔 · 검 — 실제 결투에서 나온 자세들의 대표) + 아래 겹(허리띠 아래 — 선 다리 또는
// 걷기). 허리띠·허리 장식은 두 겹에 다 있어 이음매를 덮는다 (pose_hero.py layer_blend).
/** AI 대 AI와 시험 장면에서 기본 자세·방어 자세의 표본을 모아 위 겹 대표 자세로 (k-평균 → 중심에 가장 가까운 실제 표본) */
function standClips(style) {
  const samples = { stance: [], guard: [] };
  const take = (f, foe, now) => {
    const st = f.state;
    if (st !== 'ready' && st !== 'guard' && st !== 'blockstun') return;
    const r = { f, pose: localPose(f, foe, now) };
    (st === 'ready' ? samples.stance : samples.guard).push(r);
  };
  for (const seed of [1, 2, 5, 8, 13, 21]) {
    const pair = style === 'anakin' ? ['anakin', 'obiwan'] : ['obiwan', 'anakin'];
    const sim = new CombatSim({ ground: new ArenaGround(0, 0, 7), spawns: [{ x: -1.5, y: 1.5 }, { x: 1.5, y: -1.5 }], cast: pair, controllers: [new AIController(pair[0], seed), new AIController(pair[1], seed + 100)] });
    for (let i = 0; i < 40 * 120; i++) {
      sim.step();
      if (i % 3 === 0) take(sim.fighters[0], sim.fighters[1], sim.time);
    }
  }
  for (const d of [1.5, 2.1, 2.9, 3.6]) {
    const sim = duel(style, { dist: d, c0: new Script([], { guard: [[0.4, 9]] }) });
    const recs = record(sim, 1.0);
    take(sim.fighters[0], sim.fighters[1], sim.time);
    void recs;
  }
  const key = (p) => [...p.hand, ...p.tip.map((x) => x * 0.6), ...p.shL.map((x) => x * 0.5), ...p.shR.map((x) => x * 0.5)];
  const cluster = (rs, k) => {
    const pts = rs.map((r) => key(r.pose));
    // (farthest-point start: the rare poses get a centre too)
    const cs = [pts[0]];
    while (cs.length < k) cs.push(pts.reduce((b, p) => (Math.min(...cs.map((c) => dist2(p, c))) > Math.min(...cs.map((c) => dist2(b, c))) ? p : b)));
    let cc = cs;
    for (let it = 0; it < 25; it++) {
      const g = cc.map(() => []);
      pts.forEach((p, i) => g[cc.reduce((b, c, j) => (dist2(p, c) < dist2(p, cc[b]) ? j : b), 0)].push(i));
      cc = g.map((ix, j) => (ix.length ? ix.reduce((s, i) => s.map((x, d) => x + pts[i][d] / ix.length), new Array(pts[0].length).fill(0)) : cc[j]));
    }
    const pick = cc.map((c) => rs[pts.reduce((b, p, i) => (dist2(p, c) < dist2(pts[b], c) ? i : b), 0)]);
    return pick.filter((r, i) => pick.indexOf(r) === i);
  };
  const stand = (style, pose) => {
    // (the legs of the upper frames do not show; the lower frames: the stance's own feet, knees by IK in pose_hero)
    const F = movesOf({ style }).feet;
    return { ...pose, footL: [F.front[0], -F.front[1], 0], footR: [F.rear[0], -F.rear[1], 0] };
  };
  const up = (rs, k, phase) => ({ layer: 'upper', loop: true, frames: cluster(rs, k).map((r) => ({ ...r.pose, m: { phase } })) });
  // 아래 겹의 서 있는 다리: 기본 자세·방어 자세의 골반 높이 그대로
  const lowStand = (moves) => {
    const sim = duel(style, { dist: 3.6, c0: new Script([], { guard: moves === 'guard' ? [[0.1, 9]] : [] }) });
    record(sim, 0.8);
    const f = sim.fighters[0];
    return { layer: 'lower', loop: true, frames: [{ ...stand(style, localPose(f, sim.fighters[1], sim.time)), m: { phase: 'stand' } }] };
  };
  console.log(`  ${style}: 표본 기본 ${samples.stance.length} · 방어 ${samples.guard.length}`);
  return {
    up_stance: up(samples.stance, 8, 'stance'),
    up_guard: up(samples.guard, 16, 'guard'),
    low_stance: lowStand('stance'),
    low_guard: lowStand('guard'),
  };
}
const dist2 = (a, b) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);

// -------------------------------------------------------------------------------------------------
const out = { version: 1, tick: DT, mid: MID, lead: LEAD, follow: FOLLOW, saber: T.saber, styles: {} };
for (const style of STYLES) {
  const clips = { ...standClips(style), ...attackClips(style), ...reactionClips(style) };
  for (const g of [false, true]) for (const d of ['f', 'b', 'l', 'r']) clips[`${g ? 'gwalk' : 'walk'}_${d}`] = walkClip(style, g, d);
  if (MD) clips.run_f = walkClip(style, false, 'f', 6, true);
  for (const [k, c] of Object.entries(clips)) if (c.loop === undefined) c.loop = false;
  out.styles[style] = { clips, feet: movesOf({ style }).feet, attacks: Object.fromEntries(Object.entries(T.styles[style].attacks).map(([k, a]) => [k, { windup: a.windup, active: a.active, recovery: a.recovery, whiffExtra: a.whiffExtra, reach: a.reach }])) };
  const n = Object.values(clips).reduce((s, c) => s + c.frames.length, 0);
  console.log(style, Object.entries(clips).map(([k, c]) => `${k}:${c.frames.length}`).join(' '), '=', n, 'frames');
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT);
// 게임이 프레임을 고르는 데 쓰는 것만 (src/combat/sprites.js): 프레임마다 손·검끝(몸 기준)·골반 높이와 m, 동작마다 loop·hit·걷기 주기
const lib = { version: 1, mid: MID, styles: {} };
for (const [style, st] of Object.entries(out.styles)) {
  lib.styles[style] = {};
  for (const [name, c] of Object.entries(st.clips)) {
    const keep = { loop: c.loop, frames: c.frames.map((f) => ({ h: f.hand, t: f.tip, z: f.hips[2], m: f.m })) };
    for (const k of ['hit', 'period', 'stride', 'speed', 'dir', 'guard', 'kind', 'layer', 'travel']) if (c[k] !== undefined) keep[k] = c[k];
    lib.styles[style][name] = keep;
  }
}
const LIB = resolve(opt('--lib') || resolve(HERE, '../../../public/sprites/duel/hero_poses.json'));
mkdirSync(dirname(LIB), { recursive: true });
writeFileSync(LIB, JSON.stringify(lib));
console.log('wrote', LIB);
