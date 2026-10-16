// 결투자의 자세: 몸·손·광선검의 3D 위치 (월드 좌표 x, y 바닥 + z 높이, m). 그리기(view.js)와 접촉 위치 계산
// (rules.js — 효과를 두 검이 만난 자리에 띄움)이 같이 쓴다. 판정 자체는 이것을 보지 않는다: 맞았는지·막았는지는
// rules.js의 명시적인 규칙(거리·각도·상태·시간)으로 정하고, 자세는 그 결과에 맞춰 움직인다.
//
// 지역 좌표: f = 바라보는 방향, r = 오른쪽 (이 투영에서 각도 +90°), u = 위. 검 방향은 yaw(오른쪽 +)·pitch(위 +)로.
import { TUNING as T } from './tuning.js';
import { clamp, lerp } from '../core/math.js';
import { movesOf, REACT } from './moves.js';

const RAD = Math.PI / 180;
// 휘두르기의 보이는 구간: windup 끝 LEAD 초 전부터 active 끝 FOLLOW 초 뒤까지 (s = 0..1). s = MID(검이 정면)는 정확히
// windup이 끝나는 순간 = 판정이 날 수 있는 첫 틱: 막힘·쳐내짐의 접촉점이 두 사람 사이, 검이 상대를 향한 자리에 생긴다
const LEAD = T.swingLead;
const FOLLOW = 0.07;
const MID = 0.42;
// 상태가 바뀔 때 손·검을 이어 붙이는 시간 (s): 전 자세에서 새 자세로 섞는다 (판정과 무관, sim.js가 순간 자세를 넘겨줌)
export const BLEND = { attack: 0.1, guard: 0.12, ready: 0.14, dodge: 0.06, hitstun: 0.06, broken: 0.08, buffer: 0.08 };

// 자세 키 (moves.js K): h = 손 [f, r, u], yaw, pitch (도), lean = 상체 기울기 (m, +앞), tw = 몸통 비틀기 (도), cr = 무릎 굽힘 (m).
// 캐릭터별 기본 자세·방어 자세·공격 궤적은 moves.js MOVES (f.style), 반응 자세는 REACT.
const { knocked: KNOCKED, hurt: HURT, broken: BROKEN } = REACT;
export const ARM = 0.32; // 위팔·아래팔 길이 (m): 어깨에서 손잡이까지 최대 0.64
export const LEG = 0.48; // 허벅지·정강이

const mix = (a, b, k) => ({ h: [lerp(a.h[0], b.h[0], k), lerp(a.h[1], b.h[1], k), lerp(a.h[2], b.h[2], k)], yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), lean: lerp(a.lean, b.lean, k), tw: lerp(a.tw || 0, b.tw || 0, k), cr: lerp(a.cr || 0, b.cr || 0, k) });
const ease = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

/** 결투자 `f`의 공격 `kind` 궤적 [S0, S1, S2] */
const swingOf = (f, kind) => movesOf(f).swings[kind];
/** 회수가 돌아가는 자세 (아나킨: 기본 자세, 오비완: 방어 자세) */
const homeOf = (f) => (movesOf(f).home === 'guard' ? movesOf(f).guard : movesOf(f).stance);

/** 휘두르기 위치 s (0..1)의 자세 */
function swingKey(f, kind, s) {
  const [a, b, c] = swingOf(f, kind);
  return s <= MID ? mix(a, b, ease(s / MID)) : mix(b, c, ease((s - MID) / (1 - MID)));
}

/** 공격 시각 t (공격 시작부터)의 휘두르기 위치 */
export function swingS(def, t) {
  if (t <= def.windup) return clamp((t - (def.windup - LEAD)) / LEAD, 0, 1) * MID;
  return MID + clamp((t - def.windup) / (def.active + FOLLOW), 0, 1) * (1 - MID);
}

// --- 벡터 -------------------------------------------------------------------------------------------------------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)],
};

/** 지역 (f, r, u) → 월드 */
function local(f, x, y, [lf, lr, lu]) {
  const c = Math.cos(f);
  const s = Math.sin(f);
  return [x + c * lf - s * lr, y + s * lf + c * lr, lu];
}

function dirOf(f, yawDeg, pitchDeg) {
  const y = f + yawDeg * RAD; // (오른쪽 = 각도 +)
  const p = pitchDeg * RAD;
  return [Math.cos(y) * Math.cos(p), Math.sin(y) * Math.cos(p), Math.sin(p)];
}

/** 점 p에서 가장 가까운 선분 a→b 위의 매개변수 (0..1) */
export function closestT(a, b, p) {
  const ab = v3.sub(b, a);
  const l2 = v3.dot(ab, ab) || 1;
  return clamp(v3.dot(v3.sub(p, a), ab) / l2, 0, 1);
}

/** 두 선분 사이의 가장 가까운 두 점 */
export function closestSeg(p1, q1, p2, q2) {
  const d1 = v3.sub(q1, p1);
  const d2 = v3.sub(q2, p2);
  const r = v3.sub(p1, p2);
  const a = v3.dot(d1, d1);
  const e = v3.dot(d2, d2);
  const f = v3.dot(d2, r);
  const c = v3.dot(d1, r);
  const b = v3.dot(d1, d2);
  const den = a * e - b * b;
  let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) (t = 0), (s = clamp(-c / a, 0, 1));
  else if (t > 1) (t = 1), (s = clamp((b - c) / a, 0, 1));
  return [v3.add(p1, v3.mul(d1, s)), v3.add(p2, v3.mul(d2, t))];
}

// --- 자세 ---------------------------------------------------------------------------------------------------------

/** 공격 중(또는 막 끝난 공격의 반동) 손·검 자세 키 */
function attackKey(f) {
  const a = f.atk;
  const def = a.def;
  const pre = def.windup - LEAD;
  const S = swingOf(f, a.kind);
  const stance = homeOf(f);
  if (a.phase !== 'recovery') {
    // 젖히기 (보고 대응할 수 있는 준비 동작). 이어 베기는 앞 베기의 회수가 이미 젖힌 자리까지 와 있다: 거기서 버틴다
    const from = a.combo > 1 ? mix(stance, S[0], 0.7) : stance;
    if (a.t < pre) return mix(from, S[0], easeOut(a.t / pre));
    return swingKey(f, a.kind, swingS(def, a.t));
  }
  // 회복: 결과에 따라 — 헛침: 끝까지 휘두르고 돌아옴, 막힘: 튕겨 되돌아옴, 맞힘: 베고 지나감. 돌아가는 곳은 다음 행동:
  // 이어 베기를 눌러 두었으면 그 베기의 젖힌 자세로(회수가 곧 다음 준비), 아니면 기본 자세
  const total = def.recovery + (a.outcome === 'whiff' ? def.whiffExtra : 0);
  const sc = a.contactS ?? swingS(def, def.windup + def.active);
  const b = f.buffer;
  const next = b && b.type === 'light' && def.next ? swingOf(f, def.next)[0] : b && b.type === 'heavy' && def.heavyChain ? swingOf(f, 'heavy')[0] : null;
  const lock = f.lockEnd();
  const home = next ? mix(stance, next, 0.7) : stance;
  if (a.outcome === 'blocked' || a.outcome === 'clashWin') {
    // 막힌 검: 접촉한 자리에 잠깐 머물렀다가(맞물림) 조금 튕겨 나오고, 다음 행동 자세로 회수
    // (압박을 이어 가면 — pressOn — 머무는 시간 없이 바로 다음 베기 자세로)
    const at = swingKey(f, a.kind, sc);
    const back = mix(at, S[0], 0.3);
    const hold = next && a.pressOn ? 0.02 : 0.05;
    const bounce = next && a.pressOn ? 0.05 : 0.14;
    if (a.recT < hold) return at;
    if (a.recT < bounce) return mix(at, back, easeOut((a.recT - hold) / (bounce - hold)));
    return mix(back, home, ease(clamp((a.recT - bounce) / Math.max(0.03, (next ? lock : total) - bounce), 0, 1)));
  }
  const follow = 0.1;
  const s1 = Math.min(1, sc + (a.recT / follow) * (1 - sc));
  if (a.recT < follow) return swingKey(f, a.kind, s1);
  // (검이 돌아오는 시간: 다음 베기를 눌렀으면 잠김 끝까지, 짧게 회수되는 검(guardAt)은 방어를 올릴 수 있는 때쯤까지, 아니면
  //  회복 전체에 걸쳐)
  const back = next ? Math.max(lock, follow + 0.05) : def.guardAt !== undefined ? Math.min(total, Math.max(f.guardEnd() + 0.1, follow + 0.12)) : total;
  return mix(S[2], home, ease(clamp((a.recT - follow) / Math.max(0.05, back - follow), 0, 1)));
}

/**
 * 자유 자세(ready)의 손·검: 성향의 기본 자세에서 검끝을 상대 검 쪽으로 (가까이 있을 때 — 서로 겨눈 결투 자세).
 * 방어(가로지른 사선)와 달리 손은 낮게, 검은 앞으로 뻗어 있다.
 */
function stanceTarget(f, foe) {
  const st = movesOf(f).stance;
  const hand = local(f.facing, f.x, f.y, st.h);
  let dir = dirOf(f.facing, st.yaw, st.pitch);
  if (foe && !foe.dead && Math.hypot(foe.x - f.x, foe.y - f.y) < 3) {
    const [h, d] = rawHandDir(foe);
    const to = v3.norm(v3.sub(v3.add(h, v3.mul(d, T.saber.blade * 0.6)), hand));
    dir = v3.norm(v3.lerp(dir, to, 0.65));
  }
  return { rel: [hand[0] - f.x, hand[1] - f.y, hand[2]], dir };
}

/**
 * 방어가 겨눌 점: 들어오는 공격이 지날 자리(예측 접촉점), 공격이 없으면 상대 검의 끝 쪽(맞물린 결투 자세),
 * 멀면 없음(기본 방어 자세). 막는 중(blockstun)이면 실제 접촉점.
 */
export function guardAimTarget(f, foe, now) {
  // (막는 중: 접촉점을 몸과 함께 — 밀려나는 동안 검이 몸에서 떨어져 늘어나지 않게)
  if (f.state === 'blockstun' && f.contact) return f.contact.from ? [f.contact.at[0] + f.x - f.contact.from[0], f.contact.at[1] + f.y - f.contact.from[1], f.contact.at[2]] : f.contact.at;
  if (!foe || foe.dead) return null;
  if (foe.state === 'attack' && foe.atk.phase !== 'recovery') return predictContact(foe, f, now);
  if (Math.hypot(foe.x - f.x, foe.y - f.y) >= 3) return null;
  const [h, d] = rawHandDir(foe);
  return v3.add(h, v3.mul(d, T.saber.blade * 0.7));
}

/** 블렌드·방어 겨눔 없이 자세 키만으로 본 손·검 (상대 쪽 계산용: 서로를 겨누는 재귀를 피한다) */
function rawHandDir(f) {
  const M = movesOf(f);
  const key = f.state === 'attack' ? attackKey(f) : f.state === 'guard' || f.state === 'blockstun' ? M.guard : M.stance;
  return [local(f.facing, f.x, f.y, key.h), dirOf(f.facing, key.yaw, key.pitch)];
}

/**
 * 결투자 `f`의 자세 (now: sim 시각). 반환: { hand, handL (두 손으로 잡은 손잡이의 아래 손), dir (검 방향 단위), tip, base,
 * bladeBase, hips, chest, head, shL, shR, elbows[2], hipL, hipR, knees[2], feet[2] (앞발·뒷발), crouch, lean, tw, cr, guardAim }.
 * 손은 언제나 손잡이 위에 있고(검은 손에서 나온다), 발은 gait.js가 디딘 자리에 있다 (디딘 발은 미끄러지지 않는다).
 */
export function poseOf(f, foe, now) {
  const M = movesOf(f);
  const stance = M.stance;
  let key = stance;
  let crouch = 0;
  let side = 0; // 옆 기울기 (m, +오른쪽)
  let aimAt = null; // 방어가 겨누는 점 (검이 그 점을 지나게)
  const s = f.state;
  const c = f.contact;
  if (s === 'attack') key = attackKey(f);
  else if (s === 'guard' || s === 'blockstun') {
    key = M.guard;
    // (방어 손·검은 sim.js가 틱마다 목표 쪽으로 옮긴 f.gpose — 목표는 guardPoseTarget; 막는 순간엔 그대로)
    aimAt = guardAimTarget(f, foe, now);
    if (s === 'blockstun') crouch = 0.05 * (1 - f.st / Math.max(0.05, f.dur));
  } else if (s === 'parried' || s === 'overpowered' || s === 'clash') {
    const la = f.lastAtk;
    const from = la ? swingKey(f, la.kind, la.contactS ?? MID) : stance;
    const to = s === 'clash' ? mix(from, swingOf(f, la ? la.kind : 'light1')[0], 0.5) : KNOCKED;
    const k = f.st / Math.max(0.05, f.dur);
    key = k < 0.25 ? mix(from, to, easeOut(k / 0.25)) : k < 0.7 ? to : mix(to, homeOf(f), ease((k - 0.7) / 0.3));
    if (s !== 'clash') crouch = 0.04;
  } else if (s === 'hitstun') {
    const k = f.st / Math.max(0.05, f.dur);
    key = k < 0.6 ? HURT : mix(HURT, homeOf(f), ease((k - 0.6) / 0.4));
  } else if (s === 'broken') {
    const k = f.st / Math.max(0.05, f.dur);
    key = k < 0.8 ? BROKEN : mix(BROKEN, homeOf(f), ease((k - 0.8) / 0.2));
    side = Math.sin(f.st * 11) * 0.05; // 휘청
  } else if (s === 'dodge') {
    const k = f.st / T.dodge.dur;
    crouch = 0.13 * Math.sin(Math.PI * Math.min(1, k));
    key = mix(stance, M.guard, 0.3);
  }

  const fc = f.facing;
  let hand = local(fc, f.x, f.y, [key.h[0], key.h[1] + side, key.h[2] - crouch]);
  let dir = dirOf(fc, key.yaw, key.pitch);
  let lean = key.lean;
  let tw = key.tw || 0;
  let cr = key.cr || 0;
  // 방어: 검이 겨눈 점(들어오는 공격이 닿을 자리, 막는 중이면 실제 접촉점)을 지나도록
  if (s === 'guard' || s === 'blockstun' || (s === 'ready' && f.gpose)) {
    const g = f.gpose || guardPoseTarget(f, foe, now);
    hand = [f.x + g.rel[0], f.y + g.rel[1], g.rel[2]];
    dir = g.dir;
  }
  // 쳐낸 직후: 검을 바깥으로 쳐 올린다
  if (c && c.role === 'parrier' && now - c.t < 0.16 && (s === 'guard' || s === 'ready')) {
    const k = 1 - (now - c.t) / 0.16;
    dir = v3.norm(v3.add(dir, v3.mul(dirOf(fc, 60, 50), k * 1.4)));
  }
  // 상태가 바뀐 직후: 바뀌기 전 손·검·몸통에서 이어서 (sim.js가 바뀌는 순간의 자세를 f.blend에 남김)
  const bl = f.blend;
  if (bl && now - bl.t < bl.dur) {
    const k = ease(clamp((now - bl.t) / bl.dur, 0, 1));
    hand = v3.lerp([f.x + bl.rel[0], f.y + bl.rel[1], bl.rel[2]], hand, k); // (몸을 따라 움직이는 손에서)
    dir = v3.norm(v3.lerp(bl.dir, dir, k));
    if (bl.tw !== undefined) {
      tw = lerp(bl.tw, tw, k);
      cr = lerp(bl.cr, cr, k);
      lean = lerp(bl.lean, lean, k);
    }
  }
  // (몸이 내려간 양: 무릎이 굽는다 — 손은 자세 키의 높이 그대로. 빨리 걸을수록 조금 낮게: 보폭이 다리 길이 안에 들게)
  const walk = s === 'ready' || s === 'guard' ? Math.min(0.08, Math.hypot(f.vx, f.vy) * 0.024) : 0; // (내딛기는 자세 키의 cr로)
  const down = crouch + cr + walk;
  const hips = local(fc, f.x, f.y, [lean * 0.15, side * 0.4, 0.92 - down]);
  const chest = local(fc, f.x, f.y, [lean, side, 1.36 - down]);
  const head = local(fc, f.x, f.y, [lean * 1.3, side * 1.2, 1.62 - down]);
  // 몸통 비틀기: 오른쪽 어깨가 앞으로 (tw +)
  const twr = tw * RAD;
  const shoulder = (r) => local(fc, f.x, f.y, [lean + r * Math.sin(twr), side + r * Math.cos(twr), 1.4 - down]);
  const shL = shoulder(-0.17);
  const shR = shoulder(0.17);
  const hipTw = twr * 0.35;
  const hipL = local(fc, f.x, f.y, [lean * 0.15 - 0.09 * Math.sin(hipTw), side * 0.4 - 0.09 * Math.cos(hipTw), 0.92 - down]);
  const hipR = local(fc, f.x, f.y, [lean * 0.15 + 0.09 * Math.sin(hipTw), side * 0.4 + 0.09 * Math.cos(hipTw), 0.92 - down]);
  // 팔이 닿는 곳까지만: 손잡이를 쥔 두 손이 어깨에서 팔 길이(2 × ARM)를 넘으면 손(과 검)을 몸 쪽으로 당긴다 — 손이 팔에서 떨어지지 않게
  for (let it = 0; it < 2; it++) {
    for (const [sh, off] of [
      [shR, 0],
      [shL, -0.11],
    ]) {
      const h = v3.add(hand, v3.mul(dir, off));
      const v = v3.sub(h, sh);
      const l = v3.len(v);
      if (l > 2 * ARM - 0.005) hand = v3.sub(hand, v3.mul(v, (l - (2 * ARM - 0.005)) / l));
    }
  }
  const base = v3.add(hand, v3.mul(dir, -0.06));
  const tip = v3.add(hand, v3.mul(dir, T.saber.hilt * 0.5 + T.saber.blade));
  const bladeBase = v3.add(hand, v3.mul(dir, T.saber.hilt * 0.5));
  const handL = v3.add(hand, v3.mul(dir, -0.11)); // (두 손으로: 아래 손은 손잡이 끝 쪽)
  const fwd = [Math.cos(fc), Math.sin(fc), 0];
  const rgt = [-Math.sin(fc), Math.cos(fc), 0];
  const elbows = [limbJoint(shL, handL, ARM, ARM, v3.norm(v3.add([0, 0, -1], v3.mul(rgt, -0.6)))), limbJoint(shR, hand, ARM, ARM, v3.norm(v3.add([0, 0, -1], v3.mul(rgt, 0.6))))];
  // 발: 디딘 자리 (gait.js), 아직 없으면 기본 자세의 발
  const feet = f.gait ? f.gait.feet.map((q) => [q.p[0], q.p[1], q.z]) : standFeet(f, f.x, f.y, fc);
  const knees = [limbJoint(hipL, feet[0], LEG, LEG, fwd), limbJoint(hipR, feet[1], LEG, LEG, fwd)];
  return { hand, handL, dir, base, bladeBase, tip, hips, chest, head, shL, shR, elbows, hipL, hipR, knees, feet, crouch, lean, tw, cr, aimAt };
}

/** 기본 자세의 두 발 (몸 중심 x, y, 바라보는 방향 fc): [앞발(왼발), 뒷발(오른발)] */
export function standFeet(f, x, y, fc) {
  const F = movesOf(f).feet;
  const a = local(fc, x, y, [F.front[0], F.front[1], 0]);
  const b = local(fc, x, y, [F.rear[0], F.rear[1], 0]);
  return [a, b];
}

/** 두 마디 관절 (어깨→팔꿈치→손, 엉덩이→무릎→발): a에서 b까지, 마디 길이 l1·l2, 굽는 쪽 bend. 닿지 않으면 곧게 편다 */
function limbJoint(a, b, l1, l2, bend) {
  const ab = v3.sub(b, a);
  const d = v3.len(ab);
  if (d >= l1 + l2 - 1e-6 || d < 1e-6) return v3.add(a, v3.mul(ab, l1 / (l1 + l2))); // (펴진 팔·다리: 마디 비율 자리)
  const ax = v3.mul(ab, 1 / d);
  const x = (d * d + l1 * l1 - l2 * l2) / (2 * d); // (a에서 축을 따라)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let n = v3.sub(bend, v3.mul(ax, v3.dot(bend, ax)));
  if (v3.len(n) < 1e-4) n = [0, 0, 1];
  n = v3.norm(n);
  return v3.add(v3.add(a, v3.mul(ax, x)), v3.mul(n, h));
}

/** 방어 손·검: 검이 점 `p`를 날 중간쯤에서 지나고, 공격자의 검과 엇갈리게. 손은 가슴에서 guardReach 안 (오비완은 몸 가까이) */
function guardThrough(f, chest, p, foe, line) {
  const n = foe ? v3.norm([foe.x - f.x, foe.y - f.y, 0]) : [Math.cos(f.facing), Math.sin(f.facing), 0];
  // 막아 낼 검의 방향 (공격의 휘두르는 선; 없으면 가로) — 상대 검의 지금 방향이 아니라 예상되는 선이라 흔들리지 않는다
  const ad = line || [-n[1], n[0], 0];
  let d = v3.cross(ad, n);
  if (v3.len(d) < 0.2) d = [0, 0, 1];
  d = v3.norm(d);
  if (d[2] < 0) d = v3.mul(d, -1);
  d = v3.norm(v3.add(d, v3.mul(n, 0.3)));
  const reach = movesOf(f).guardReach;
  const reachC = v3.add(chest, v3.mul(n, 0.12));
  let hand = v3.sub(p, v3.mul(d, 0.5));
  const off = v3.sub(hand, reachC);
  const ol = v3.len(off);
  if (ol > reach) hand = v3.add(reachC, v3.mul(off, reach / ol));
  if (hand[2] < 0.7) hand[2] = 0.7;
  const to = v3.sub(p, hand);
  const dir = v3.len(to) > 0.25 ? v3.norm(to) : d;
  return [hand, dir];
}

/**
 * 방어 손·검의 목표 { rel: 몸 위치에 대한 손 [dx, dy, z], dir } — sim.js updateGuard가 틱마다 이쪽으로 옮긴다.
 * 들어오는 공격: 그 공격이 정면(MID)에서 지날 선과 엇갈리게, 막는 중: 실제 접촉점에서 막힌 검의 선과 엇갈리게,
 * 그 밖: 상대 검끝 쪽을 겨눈 사선.
 */
export function guardPoseTarget(f, foe, now) {
  if (f.state === 'ready') return stanceTarget(f, foe);
  const G = movesOf(f).guard;
  const crouch = f.state === 'blockstun' ? 0.05 * (1 - f.st / Math.max(0.05, f.dur)) : 0;
  const chest = local(f.facing, f.x, f.y, [G.lean, 0, 1.36 - crouch - (G.cr || 0)]);
  const aim = guardAimTarget(f, foe, now);
  let hand;
  let dir;
  if (!aim) {
    hand = local(f.facing, f.x, f.y, [G.h[0], G.h[1], G.h[2] - crouch]);
    dir = dirOf(f.facing, G.yaw, G.pitch);
  } else {
    let line = null;
    const atk = foe && (foe.state === 'attack' ? foe.atk : foe.lastAtk);
    if (atk && f.state === 'blockstun') {
      const k = swingKey(foe, atk.kind, atk.contactS ?? MID);
      line = dirOf(foe.facing, k.yaw, k.pitch);
    } else if (foe && foe.state === 'attack' && foe.atk.phase !== 'recovery') {
      const k = swingKey(foe, foe.atk.kind, MID);
      line = dirOf(foe.facing, k.yaw, k.pitch);
    }
    [hand, dir] = guardThrough(f, chest, aim, foe, line);
  }
  return { rel: [hand[0] - f.x, hand[1] - f.y, hand[2]], dir };
}

/** 공격자 `att`의 휘두르기가 정면(MID)에 올 때, 방어자 `def` 앞에서 검이 지날 점 (방어가 미리 겨눔) */
export function predictContact(att, def, now) {
  const key = swingKey(att, att.atk.kind, MID);
  const hand = local(att.facing, att.x, att.y, key.h);
  const dir = dirOf(att.facing, key.yaw, key.pitch);
  const tip = v3.add(hand, v3.mul(dir, T.saber.blade + T.saber.hilt * 0.5));
  const guardPt = local(def.facing, def.x, def.y, [0.35, 0, 1.2]);
  const t = clamp(closestT(hand, tip, guardPt), 0.4, 0.95);
  return v3.lerp(hand, tip, t);
}

/**
 * 공격 `kind`의 정면(MID) 자세에서 검끝이 몸 앞으로 닿는 거리 + 몸 반경 = 궤적이 실제로 닿는 사거리 (tuning reach와 같아야 한다)
 */
export function bladeReach(style, kind) {
  // (실제 자세 그대로: 판정이 날 수 있는 첫 순간 — windup 끝 = MID — 의 검끝. 팔 길이로 손을 당긴 것까지 포함)
  const def = T.styles[style].attacks[kind];
  const f = { style, state: 'attack', atk: { kind, def, t: def.windup, phase: 'active', combo: 1 }, x: 0, y: 0, vx: 0, vy: 0, facing: 0, st: 0 };
  return poseOf(f, null, 0).tip[0] + T.body.radius;
}

/** 판정이 난 순간의 접촉 위치 (rules.js): 막기·쳐내기 = 공격자 검 위, 피격 = 맞은 몸 위, 맞부딪힘 = 두 검 사이 */
export function contactPoint(kind, att, def, now) {
  const pa = poseOf(att, def, now);
  if (kind === 'hit') {
    const pd = poseOf(def, att, now);
    const [onBlade, onBody] = closestSeg(pa.bladeBase, pa.tip, pd.hips, pd.chest);
    return v3.lerp(onBody, onBlade, 0.3);
  }
  if (kind === 'clash') {
    const pd = poseOf(def, att, now);
    const [p, q] = closestSeg(pa.bladeBase, pa.tip, pd.bladeBase, pd.tip);
    return v3.lerp(p, q, 0.5);
  }
  const guardPt = local(def.facing, def.x, def.y, [0.35, 0, 1.2]);
  const t = clamp(closestT(pa.bladeBase, pa.tip, guardPt), 0.4, 0.95);
  return v3.lerp(pa.bladeBase, pa.tip, t);
}

export { swingKey, local, dirOf, LEAD, FOLLOW, MID };
