// 발 디딤 (그리기 전용, 판정과 무관): 두 발은 바닥에 디딘 자리에 그대로 있다가 한 걸음씩 옮겨 딛는다 — 디딘 발은 몸이
// 움직여도 바닥 위로 미끄러지지 않는다. 시뮬레이션 틱마다 돌아서(sim.js) 프레임 속도와 무관하고 결정적이다.
//
// 발이 가려는 자리 = 몸이 곧 갈 자리의 기본 자세 발 (moves.js feet). 공격의 내딛기 중에는 앞발이 내딛기가 끝날 자리로 먼저
// 크게 나가고(아나킨의 깊은 걸음 · 오비완의 짧은 걸음) 뒷발은 디딘 채 남았다가 따라온다. 회피는 두 발이 함께 뜨는 짧은 도약.
// 목표에서 THRESH 넘게 벗어난 발을, 다른 발이 디뎌 있을 때 옮긴다 (번갈아 걷기). 다리가 닿는 범위를 벗어나려는 발은 반드시 옮긴다.
import { DT, TUNING as T } from './tuning.js';
import { movesOf } from './moves.js';
import { standFeet, poseOf } from './pose.js';

const THRESH = 0.1; // (m) 목표에서 이만큼 벗어나면 옮겨 딛는다
const LEG = 0.97; // (m) 엉덩이에서 발까지 닿는 길이 (허벅지 + 정강이, pose.js limbJoint 0.48 + 0.48 + 여유)
// 디딘 발이 엉덩이에서 다리가 닿는 거리(엉덩이 높이에 따라: 무릎을 굽혀 낮을수록 넓게) 밖으로 나가려 하면 다른 발이 떠 있어도 옮긴다
const reachOf = (hipZ) => Math.sqrt(Math.max(0.04, LEG * LEG - hipZ * hipZ));

/** 결투자의 발을 기본 자세로 세운다 (재시작) */
export function resetGait(f) {
  const ft = standFeet(f, f.x, f.y, f.facing);
  f.gait = { feet: ft.map((p) => ({ p: [p[0], p[1]], z: 0, step: null })), px: f.x, py: f.y, hopFor: null, steps: 0, slid: 0 };
}

/** 앞발·뒷발이 가려는 자리 (lead 초 뒤의 몸 위치 예상) — 다리가 닿는 범위(엉덩이 hips[i] 둘레 reach) 안으로 */
function targets(f, vx, vy, lead, hips, reach) {
  const t = rawTargets(f, vx, vy, lead);
  return t.map((p, i) => {
    const h = hips[i];
    const dx = p[0] - h[0];
    const dy = p[1] - h[1];
    const d = Math.hypot(dx, dy);
    const r = reach - 0.03;
    return d > r ? [h[0] + (dx / d) * r, h[1] + (dy / d) * r, 0] : p;
  });
}

function rawTargets(f, vx, vy, lead) {
  const x = f.x + vx * lead;
  const y = f.y + vy * lead;
  const a = f.atk;
  const M = movesOf(f);
  if (f.state === 'attack' && a && a.phase !== 'recovery' && a.def.lunge - a.lunged > 0.04 && a.t > a.def.windup * 0.3) {
    // 내딛는 중: 앞발은 내딛기가 끝날 자리로(조금 더 깊게), 뒷발은 디딘 채
    const rest = Math.min(0.42, a.def.lunge - a.lunged + (M.feet.lunge || 0)); // (긴 돌진은 한 걸음에 다 가지 않는다: 다시 딛는다)
    const front = standFeet(f, f.x + Math.cos(f.facing) * rest, f.y + Math.sin(f.facing) * rest, f.facing)[0];
    const rear = standFeet(f, f.x, f.y, f.facing)[1];
    return [front, rear];
  }
  return standFeet(f, x, y, f.facing);
}

/** 한 틱: 떠 있는 발을 옮기고, 필요하면 새 걸음을 시작한다 */
export function stepGait(f, foe, now) {
  if (!f.gait) resetGait(f);
  const g = f.gait;
  const vx = (f.x - g.px) / DT;
  const vy = (f.y - g.py) / DT;
  g.px = f.x;
  g.py = f.y;
  if (f.dead) return; // (쓰러짐: 발은 그 자리)
  const M = movesOf(f);
  const P = poseOf(f, foe, now);
  const hips = [P.hipL, P.hipR];
  const reach = reachOf(P.hips[2]);
  // 회피: 두 발이 함께 뜨는 짧은 도약 (회피 시작에 착지 자리로)
  if (f.state === 'dodge' && f.dodge && g.hopFor !== f.dodge) {
    g.hopFor = f.dodge;
    const D = T.dodge.dur - T.dodge.lockTail;
    const ex = f.x + f.dodge.dx * T.dodge.dist;
    const ey = f.y + f.dodge.dy * T.dodge.dist;
    const land = standFeet(f, ex, ey, f.facing);
    // (뜬 발은 몸을 따라간다: 몸에 대한 자리를 처음 자리에서 착지 자리로 — 몸이 빨리 움직여도 다리가 늘어나지 않게)
    g.feet.forEach((q, i) => (q.step = { from: [q.p[0] - f.x, q.p[1] - f.y], to: [land[i][0] - ex, land[i][1] - ey], t: 0, dur: D - (i ? 0 : 0.03), lift: 0.09, hop: true }));
    g.steps += 2;
  }
  // 떠 있는 발
  for (let i = 0; i < 2; i++) {
    const q = g.feet[i];
    const s = q.step;
    if (!s) continue;
    s.t += DT;
    if (!s.hop) {
      // (공중에서 착지 자리를 몸의 지금 움직임에 맞춰 고쳐 잡는다: 떠 있는 동안이라 미끄러짐이 아니다)
      const left = Math.max(0, s.dur - s.t);
      const tg = targets(f, vx, vy, left + 0.04, hips, reach)[i];
      s.to = [s.to[0] + (tg[0] - s.to[0]) * 0.35, s.to[1] + (tg[1] - s.to[1]) * 0.35];
    }
    const k = Math.min(1, s.t / s.dur);
    const e = k * k * (3 - 2 * k);
    const ox = s.hop ? f.x : 0;
    const oy = s.hop ? f.y : 0;
    q.p = [ox + s.from[0] + (s.to[0] - s.from[0]) * e, oy + s.from[1] + (s.to[1] - s.from[1]) * e];
    q.z = s.lift * 4 * k * (1 - k);
    if (k >= 1) {
      q.p = [ox + s.to[0], oy + s.to[1]];
      q.z = 0;
      q.step = null;
    }
  }
  // 새 걸음
  const tg = targets(f, vx, vy, 0.1, hips, reach);
  const err = g.feet.map((q, i) => Math.hypot(q.p[0] - tg[i][0], q.p[1] - tg[i][1]));
  const far = g.feet.map((q, i) => Math.hypot(q.p[0] - hips[i][0], q.p[1] - hips[i][1]));
  for (const i of err[0] >= err[1] ? [0, 1] : [1, 0]) {
    const q = g.feet[i];
    if (q.step) continue;
    const other = g.feet[1 - i];
    const must = far[i] > reach - 0.02;
    if (!(must || (err[i] > THRESH && !other.step))) continue;
    const speed = Math.hypot(vx, vy);
    const dur = Math.max(0.08, Math.min(0.22, M.feet.step * (0.75 + err[i] * 1.1) - speed * 0.012));
    const to = targets(f, vx, vy, dur + 0.04, hips, reach)[i];
    q.step = { from: [...q.p], to: [to[0], to[1]], t: 0, dur, lift: M.feet.lift * Math.min(1, 0.45 + err[i] * 1.6), hop: false };
    g.steps++;
    if (!must) break; // (한 틱에 한 발만 — 번갈아)
  }
}
