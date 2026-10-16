// 결투자의 자세: 몸·손·광선검의 3D 위치 (월드 좌표 x, y 바닥 + z 높이, m). 그리기(view.js)와 접촉 위치 계산
// (rules.js — 효과를 두 검이 만난 자리에 띄움)이 같이 쓴다. 판정 자체는 이것을 보지 않는다: 맞았는지·막았는지는
// rules.js의 명시적인 규칙(거리·각도·상태·시간)으로 정하고, 자세는 그 결과에 맞춰 움직인다.
//
// 지역 좌표: f = 바라보는 방향, r = 오른쪽 (이 투영에서 각도 +90°), u = 위. 검 방향은 yaw(오른쪽 +)·pitch(위 +)로.
import { TUNING as T } from './tuning.js';
import { clamp, lerp } from '../core/math.js';

const RAD = Math.PI / 180;
// 휘두르기의 보이는 구간: windup 끝 LEAD 초 전부터 active 끝 FOLLOW 초 뒤까지 (s = 0..1)
const LEAD = T.swingLead;
const FOLLOW = 0.07;
const MID = 0.42; // s의 이 지점에서 검이 정면 (판정이 active 시작에서 나면 s ≈ LEAD/(LEAD+active+FOLLOW) 근처)

// 자세 키: h = 손 [f, r, u], yaw, pitch (도), lean = 상체 기울기 (m, +앞)
const K = (f, r, u, yaw, pitch, lean = 0) => ({ h: [f, r, u], yaw, pitch, lean });

const STANCE = {
  anakin: K(0.3, 0.1, 1.05, 14, 55, 0.04), // 정면에서 검을 세운 공격적 자세
  obiwan: K(0.32, 0.02, 1.12, 2, 28, -0.02), // 소레수: 검끝을 상대에게
};
const GUARD = K(0.34, 0.04, 1.24, -78, 38, -0.03); // 기본 방어: 몸 앞을 가로지르는 사선

// 공격마다 [S0 젖힘, S1 정면, S2 끝까지 휘두름]
const SWING = {
  light1: [K(0.1, 0.3, 1.42, 72, 68, -0.06), K(0.4, 0.05, 1.2, 4, 8, 0.1), K(0.4, -0.28, 0.98, -62, -18, 0.08)], // 오른쪽 위 → 왼쪽 아래
  light2: [K(0.18, -0.3, 1.02, -78, 6, -0.04), K(0.4, -0.02, 1.15, -4, 12, 0.1), K(0.38, 0.26, 1.34, 60, 40, 0.06)], // 왼쪽 아래 → 오른쪽 위 (역베기)
  light3: [K(0.02, 0.06, 1.72, 4, 118, -0.1), K(0.36, 0.02, 1.42, 0, 22, 0.14), K(0.46, 0.0, 0.92, 0, -28, 0.16)], // 내려베기
  heavy: [K(-0.06, 0.38, 1.3, 142, 26, -0.12), K(0.38, 0.12, 1.22, 8, 8, 0.16), K(0.36, -0.34, 1.12, -88, -2, 0.12)], // 크게 휘두르기
};
const KNOCKED = K(0.04, 0.28, 1.5, 112, 66, -0.16); // 쳐내진 검
const HURT = K(0.14, 0.22, 1.04, 52, 18, -0.2);
const BROKEN = K(0.28, 0.2, 0.8, 26, -40, 0.15);

const mix = (a, b, k) => ({ h: [lerp(a.h[0], b.h[0], k), lerp(a.h[1], b.h[1], k), lerp(a.h[2], b.h[2], k)], yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), lean: lerp(a.lean, b.lean, k) });
const ease = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

/** 휘두르기 위치 s (0..1)의 자세 */
function swingKey(kind, s) {
  const [a, b, c] = SWING[kind];
  return s <= MID ? mix(a, b, ease(s / MID)) : mix(b, c, ease((s - MID) / (1 - MID)));
}

/** 공격 시각 t (공격 시작부터)의 휘두르기 위치 */
export function swingS(def, t) {
  return clamp((t - (def.windup - LEAD)) / (LEAD + def.active + FOLLOW), 0, 1);
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
function attackKey(f, stance) {
  const a = f.atk;
  const def = a.def;
  const pre = def.windup - LEAD;
  if (a.phase !== 'recovery') {
    if (a.t < pre) return mix(stance, SWING[a.kind][0], easeOut(a.t / pre)); // 젖히기 (보고 대응할 수 있는 준비 동작)
    return swingKey(a.kind, swingS(def, a.t));
  }
  // 회복: 결과에 따라 — 헛침: 끝까지 휘두르고 돌아옴, 막힘: 튕겨 되돌아옴, 맞힘: 베고 지나감
  const total = def.recovery + (a.outcome === 'whiff' ? def.whiffExtra : 0);
  const sc = a.contactS ?? swingS(def, def.windup + def.active);
  if (a.outcome === 'blocked' || a.outcome === 'clashWin') {
    const at = swingKey(a.kind, sc);
    const back = mix(at, SWING[a.kind][0], 0.45);
    if (a.recT < 0.1) return mix(at, back, easeOut(a.recT / 0.1));
    return mix(back, stance, ease(clamp((a.recT - 0.1) / Math.max(0.05, total - 0.1), 0, 1)));
  }
  const follow = 0.1;
  const s1 = Math.min(1, sc + (a.recT / follow) * (1 - sc));
  if (a.recT < follow) return swingKey(a.kind, s1);
  return mix(SWING[a.kind][2], stance, ease(clamp((a.recT - follow) / Math.max(0.05, total - follow), 0, 1)));
}

/**
 * 결투자 `f`의 자세 (now: sim 시각). 반환: { hand, dir (검 방향 단위), tip, base, hips, chest, head, shL, shR, feet[2],
 * crouch, lean, guardAim }.
 */
export function poseOf(f, foe, now) {
  const stance = STANCE[f.cast.persona] || STANCE.anakin;
  let key = stance;
  let crouch = 0;
  let side = 0; // 옆 기울기 (m, +오른쪽)
  let aimAt = null; // 방어가 겨누는 점 (검이 그 점을 지나게)
  const s = f.state;
  const c = f.contact;
  if (s === 'attack') key = attackKey(f, stance);
  else if (s === 'guard' || s === 'blockstun') {
    key = GUARD;
    if (s === 'blockstun' && c) aimAt = c.at;
    else if (foe && foe.state === 'attack' && foe.atk.phase !== 'recovery') aimAt = predictContact(foe, f, now);
    if (s === 'blockstun') crouch = 0.05 * (1 - f.st / Math.max(0.05, f.dur));
  } else if (s === 'parried' || s === 'overpowered' || s === 'clash') {
    const from = f.lastAtk ? swingKey(f.lastAtk.kind, f.lastAtk.contactS ?? MID) : stance;
    const to = s === 'clash' ? mix(from, SWING[f.lastAtk ? f.lastAtk.kind : 'light1'][0], 0.5) : KNOCKED;
    const k = f.st / Math.max(0.05, f.dur);
    key = k < 0.25 ? mix(from, to, easeOut(k / 0.25)) : k < 0.7 ? to : mix(to, stance, ease((k - 0.7) / 0.3));
    if (s !== 'clash') crouch = 0.04;
  } else if (s === 'hitstun') {
    const k = f.st / Math.max(0.05, f.dur);
    key = k < 0.6 ? HURT : mix(HURT, stance, ease((k - 0.6) / 0.4));
    crouch = 0.06;
  } else if (s === 'broken') {
    const k = f.st / Math.max(0.05, f.dur);
    key = k < 0.8 ? BROKEN : mix(BROKEN, stance, ease((k - 0.8) / 0.2));
    crouch = 0.14 * (k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2);
    side = Math.sin(f.st * 11) * 0.05; // 휘청
  } else if (s === 'dodge') {
    const k = f.st / T.dodge.dur;
    crouch = 0.13 * Math.sin(Math.PI * Math.min(1, k));
    key = mix(stance, GUARD, 0.3);
  }

  const fc = f.facing;
  const lean = key.lean;
  const up = (z) => z - crouch;
  const hips = local(fc, f.x, f.y, [lean * 0.15, side * 0.4, up(0.92)]);
  const chest = local(fc, f.x, f.y, [lean, side, up(1.36)]);
  const head = local(fc, f.x, f.y, [lean * 1.3, side * 1.2, up(1.62)]);
  const shL = local(fc, f.x, f.y, [lean, side - 0.17, up(1.4)]);
  const shR = local(fc, f.x, f.y, [lean, side + 0.17, up(1.4)]);
  let hand = local(fc, f.x, f.y, [key.h[0], key.h[1] + side, up(key.h[2])]);
  let dir = dirOf(fc, key.yaw, key.pitch);
  // 방어: 검이 겨눈 점(들어오는 공격이 닿을 자리, 막는 중이면 실제 접촉점)을 지나도록
  if (aimAt) [hand, dir] = guardThrough(f, chest, aimAt, foe);
  // 쳐낸 직후: 검을 바깥으로 쳐 올린다
  if (c && c.role === 'parrier' && now - c.t < 0.16 && (s === 'guard' || s === 'ready')) {
    const k = 1 - (now - c.t) / 0.16;
    dir = v3.norm(v3.add(dir, v3.mul(dirOf(fc, 60, 50), k * 1.4)));
  }
  const base = v3.add(hand, v3.mul(dir, -0.06));
  const tip = v3.add(hand, v3.mul(dir, T.saber.hilt * 0.5 + T.saber.blade));
  const bladeBase = v3.add(hand, v3.mul(dir, T.saber.hilt * 0.5));
  // 발: 펜싱 자세(앞발·뒷발) + 걸음
  const vl = Math.hypot(f.vx, f.vy);
  const ph = (f.walked / 0.62) * Math.PI;
  const stride = Math.min(1, vl / 2) * 0.17;
  const mvx = vl > 0.05 ? f.vx / vl : 0;
  const mvy = vl > 0.05 ? f.vy / vl : 0;
  const footA = local(fc, f.x, f.y, [0.14, -0.13, 0]);
  const footB = local(fc, f.x, f.y, [-0.12, 0.15, 0]);
  footA[0] += mvx * Math.sin(ph) * stride;
  footA[1] += mvy * Math.sin(ph) * stride;
  footA[2] = Math.max(0, Math.cos(ph)) * stride * 0.4;
  footB[0] -= mvx * Math.sin(ph) * stride;
  footB[1] -= mvy * Math.sin(ph) * stride;
  footB[2] = Math.max(0, -Math.cos(ph)) * stride * 0.4;
  return { hand, dir, base, bladeBase, tip, hips, chest, head, shL, shR, feet: [footA, footB], crouch, lean, aimAt };
}

/** 방어 손·검: 검이 점 `p`를 날 중간쯤에서 지나고, 공격자의 검과 엇갈리게 */
function guardThrough(f, chest, p, foe) {
  const n = foe ? v3.norm([foe.x - f.x, foe.y - f.y, 0]) : [Math.cos(f.facing), Math.sin(f.facing), 0];
  // 상대 검의 방향 (없으면 가로)
  let ad = [-n[1], n[0], 0];
  if (foe) {
    const fp = foe.state === 'attack' || foe.lastAtk ? rawBlade(foe) : null;
    if (fp) ad = fp;
  }
  let d = v3.cross(ad, n);
  if (v3.len(d) < 0.2) d = [0, 0, 1];
  d = v3.norm(d);
  if (d[2] < 0) d = v3.mul(d, -1);
  d = v3.norm(v3.add(d, v3.mul(n, 0.3)));
  const reachC = v3.add(chest, v3.mul(n, 0.12));
  let hand = v3.sub(p, v3.mul(d, 0.5));
  const off = v3.sub(hand, reachC);
  const ol = v3.len(off);
  if (ol > 0.55) hand = v3.add(reachC, v3.mul(off, 0.55 / ol));
  if (hand[2] < 0.7) hand[2] = 0.7;
  const to = v3.sub(p, hand);
  const dir = v3.len(to) > 0.25 ? v3.norm(to) : d;
  return [hand, dir];
}

/** 공격자 검의 방향만 (방어 자세 계산용, 재귀 없이) */
function rawBlade(f) {
  const stance = STANCE[f.cast.persona] || STANCE.anakin;
  const key = f.state === 'attack' ? attackKey(f, stance) : f.lastAtk ? swingKey(f.lastAtk.kind, f.lastAtk.contactS ?? MID) : stance;
  return dirOf(f.facing, key.yaw, key.pitch);
}

/** 공격자 `att`의 휘두르기가 정면(MID)에 올 때, 방어자 `def` 앞에서 검이 지날 점 (방어가 미리 겨눔) */
export function predictContact(att, def, now) {
  const key = swingKey(att.atk.kind, MID);
  const hand = local(att.facing, att.x, att.y, key.h);
  const dir = dirOf(att.facing, key.yaw, key.pitch);
  const tip = v3.add(hand, v3.mul(dir, T.saber.blade + T.saber.hilt * 0.5));
  const guardPt = local(def.facing, def.x, def.y, [0.35, 0, 1.2]);
  const t = clamp(closestT(hand, tip, guardPt), 0.4, 0.95);
  return v3.lerp(hand, tip, t);
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

export { swingKey, LEAD, FOLLOW, MID };
