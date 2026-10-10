// Anakin's animations, remade from the Episode III Mustafar duel and his
// signature moves (the Coruscant training bout of Obi-Wan Kenobi, the World
// Between Worlds in Ahsoka):
//   - a low, wide Djem So stance, weight forward, the blade high beside the
//     right shoulder and tilted back, both hands on the hilt
//   - big full-body cuts that step in and follow through, with a wind-up
//   - the signature: the blade dropped low and out to the right, the free arm
//     spread, a fast rising flick up the front, the blade looped over the head
//     and brought down in a diagonal cut; then down onto one knee for a low
//     sweep and back up into the guard
//   - the close bind: blades crossed between the faces, elbows up, pressing
// Poses are authored as specs (feet on the ground, pelvis drop and shift,
// torso, hilt) and solved per frame: the legs reach the feet with IK, so the
// feet stay planted while the body lunges.
import { mixPose, easeInOut } from './rig.js';

const { sin, cos, PI, atan2, hypot, acos, min, max } = Math;
const TAU = PI * 2;

// ---------------------------------------------------------------------------
// Legs: two-bone IK from the hip to an ankle target on the ground.

const HIP = 0.98; // pelvis height (rig dims)
const THIGH = 0.45;
const SHIN = 0.45;
const ANKLE = 0.03; // ankle height when standing
const clamp = (x, a, b) => max(a, min(b, x));

/** Hip / knee / ankle angles that put the ankle on [x, z] (+ lift, toe pitch). */
function leg(hx, hy, hz, f) {
  const dx = f[0] - hx;
  const dy = ANKLE + (f[2] || 0) - hy;
  const dz = f[1] - hz;
  const phi = atan2(-dz, -dy); // out to the side
  const w = hypot(dy, dz);
  const L = clamp(hypot(dx, w), 0.05, THIGH + SHIN - 0.002);
  const knee = -(PI - acos(clamp((THIGH * THIGH + SHIN * SHIN - L * L) / (2 * THIGH * SHIN), -1, 1)));
  const th = atan2(dx, w) + acos(clamp((THIGH * THIGH + L * L - SHIN * SHIN) / (2 * THIGH * L), -1, 1));
  return [[phi, 0, th], [0, 0, knee], [-phi, 0, -(th + knee) + (f[3] || 0)]];
}

const FL = [0.3, -0.24]; // the Djem So stance: left foot forward
const FR = [-0.3, 0.26];

/**
 * A spec -> a rig pose. d: pelvis drop, x: forward shift of the body (the
 * feet stay where they are), fL/fR: feet [x, z, lift, toe]; the hilt (sab)
 * is given relative to the body and moves with x.
 */
function P(s) {
  const { d = 0, x = 0, fL = FL, fR = FR, ...rest } = s;
  const hy = HIP + d - 0.05;
  const [hipL, knL, anL] = leg(x, hy, -0.1, fL);
  const [hipR, knR, anR] = leg(x, hy, 0.1, fR);
  const out = { ...rest, hipL, knL, anL, hipR, knR, anR, pelvisY: d, bodyX: x };
  if (s.sab) out.sab = [s.sab[0] + x, s.sab[1], s.sab[2], s.sab[3], s.sab[4]];
  if (s.sab2) out.sab2 = [s.sab2[0] + x, s.sab2[1], s.sab2[2], s.sab2[3], s.sab2[4]];
  return out;
}
const S = (...parts) => Object.assign({}, ...parts); // merge specs

// easings: into a cut (accelerating), out of one (decelerating)
const io = easeInOut;
const inn = (u) => u * u * u;
const out = (u) => 1 - (1 - u) ** 3;
const lin = (u) => u;

/** Keyed specs -> pose function; each key's `e` eases the way into it. */
function seq(keys) {
  return (t) => {
    if (t <= keys[0].t) return P(keys[0].s);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t <= b.t) return P(mixPose(a.s, b.s, (b.e || io)((t - a.t) / (b.t - a.t))));
    }
    return P(keys[keys.length - 1].s);
  };
}

/** A foot moving between two spots (planted at both ends, lifted between). */
const step = (a, b, u, lift = 0.1) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, sin(u * PI) * lift];

// ---------------------------------------------------------------------------
// Stances

// Djem So high guard: low and wide, the hilt beside the right shoulder in both
// hands, the blade up and leaning back over the shoulder.
const GUARD = {
  d: -0.12,
  spine: [0, 0.24, -0.08],
  chest: [0, 0.1, -0.04],
  neck: [0, 0, 0.04],
  head: [0, -0.32, 0.02],
  sab: [0.2, 1.3, 0.18, 0.3, 1.92],
  two: 1,
};
// the signature's ready position: blade hanging low and forward on the right,
// one hand, the left arm spread wide, chin down
const LOW_HANG = S(GUARD, {
  d: -0.1,
  spine: [0, 0.05, -0.1],
  chest: [0, -0.05, -0.04],
  head: [0, -0.1, 0.16],
  sab: [0.24, 1.0, 0.44, 0.55, -0.8],
  two: 0,
  shL: [0.85, 0, 0.3],
  elL: [0, 0, 0.3],
  haL: [0, 0, 0.2],
});
const ARM_OUT = { shL: [0.85, 0, 0.3], elL: [0, 0, 0.3], haL: [0, 0, 0.2] };

// ---------------------------------------------------------------------------
// Basic three-cut combo

// 1) wind up over the right shoulder, step in, diagonal down to low left
const A1_WIND = S(GUARD, { x: -0.04, spine: [0, -0.2, -0.02], chest: [0, -0.25, 0], head: [0, 0.15, 0], sab: [0.02, 1.62, 0.3, 2.3, 1.15] });
const A1_HIT = S(GUARD, {
  x: 0.14,
  d: -0.18,
  fL: [0.46, -0.24],
  spine: [0, 0.35, -0.22],
  chest: [0, 0.3, -0.1],
  head: [0, -0.45, 0.06],
  sab: [0.5, 1.12, 0.06, -0.35, -0.25],
});
const A1_FOLLOW = S(A1_HIT, { spine: [0, 0.6, -0.24], chest: [0, 0.5, -0.1], head: [0, -0.7, 0.08], sab: [0.24, 0.84, -0.32, -1.75, -0.7] });

// 2) coil left, backhand flat across the chest, out to the right
const A2_WIND = S(GUARD, { x: -0.03, spine: [0, 0.55, -0.06], chest: [0, 0.45, -0.02], head: [0, -0.65, 0], sab: [0.1, 1.15, -0.26, -2.5, 0.35], poleR: [0.3, -0.8, 1] });
const A2_HIT = S(GUARD, {
  x: 0.13,
  d: -0.17,
  fL: [0.44, -0.24],
  spine: [0, -0.05, -0.18],
  chest: [0, -0.1, -0.06],
  head: [0, -0.1, 0.05],
  sab: [0.55, 1.2, 0.04, 0.1, 0.06],
});
const A2_FOLLOW = S(A2_HIT, { spine: [0, -0.45, -0.16], chest: [0, -0.4, -0.04], head: [0, 0.25, 0.04], sab: [0.3, 1.36, 0.42, 1.6, 0.4] });

// 3) both hands up, the blade dropped behind the back, then the hammer blow
const A3_WIND = S(GUARD, {
  d: -0.07,
  x: -0.05,
  spine: [0, 0.06, 0.12],
  chest: [0, 0.02, 0.08],
  head: [0, -0.12, -0.08],
  sab: [0.0, 1.9, 0.1, 0, 2.6],
  poleR: [0.2, -0.3, 1],
  poleL: [0.2, -0.3, -1],
});
const A3_HIT = S(GUARD, {
  x: 0.2,
  d: -0.24,
  fL: [0.52, -0.24],
  spine: [0, 0.06, -0.38],
  chest: [0, 0.03, -0.18],
  head: [0, -0.08, 0.2],
  sab: [0.58, 1.0, 0.02, 0, -0.45],
});
const A3_FOLLOW = S(A3_HIT, { d: -0.26, sab: [0.52, 0.84, 0.02, 0, -0.8] });

const combo = (wind, hit, follow, hitAt = 0.6) =>
  seq([
    { t: 0, s: GUARD },
    { t: hitAt - 0.3, s: wind, e: out },
    { t: hitAt, s: hit, e: inn },
    { t: hitAt + 0.2, s: follow, e: out },
    { t: 1, s: GUARD },
  ]);

// ---------------------------------------------------------------------------
// Signature onslaught: sigF (the twirl and diagonal cut) and sigB (the kneeling
// sweep back up into the guard), alternating.

const SIG_RISE = S(LOW_HANG, { d: -0.12, spine: [0, 0.15, -0.06], chest: [0, 0.1, -0.02], head: [0, -0.2, 0.06], sab: [0.36, 1.32, 0.06, 0.35, 1.5] });
const SIG_LOOP = S(GUARD, ARM_OUT, { two: 0, d: -0.1, spine: [0, -0.15, 0.04], chest: [0, -0.2, 0.04], head: [0, 0.0, -0.04], sab: [0.06, 1.78, -0.02, -2.4, 0.55], poleR: [0.2, -0.2, 1] });
const SIG_CUT = S(GUARD, {
  x: 0.16,
  d: -0.2,
  fL: [0.48, -0.24],
  spine: [0, 0.3, -0.24],
  chest: [0, 0.32, -0.1],
  head: [0, -0.4, 0.08],
  sab: [0.55, 1.12, 0.1, 0.4, -0.3],
});
const SIG_END = S(SIG_CUT, { spine: [0, -0.3, -0.2], chest: [0, -0.3, -0.08], head: [0, 0.2, 0.08], sab: [0.3, 0.86, 0.44, 1.45, -0.75], two: 0, ...ARM_OUT });
const SIG_F = seq([
  { t: 0, s: GUARD },
  { t: 0.2, s: LOW_HANG, e: out },
  { t: 0.42, s: SIG_RISE, e: inn },
  { t: 0.58, s: SIG_LOOP, e: lin },
  { t: 0.73, s: SIG_CUT, e: inn },
  { t: 1, s: SIG_END, e: out },
]);

const KNEEL = {
  x: 0.12,
  d: -0.44,
  fL: [0.44, -0.2],
  fR: [-0.52, 0.24, 0.06, 0.9],
};
const SIG_KWIND = S(SIG_END, KNEEL, { spine: [0, -0.5, -0.24], chest: [0, -0.45, -0.1], head: [0, 0.35, 0.1], sab: [0.02, 0.72, 0.46, 2.2, -0.12], shL: [0.4, 0, 1.0], elL: [0, 0, 0.2] });
const SIG_KHIT = S(SIG_KWIND, { spine: [0, 0.2, -0.28], chest: [0, 0.2, -0.1], head: [0, -0.2, 0.1], sab: [0.58, 0.62, 0.02, -0.15, -0.12], shL: [0.9, 0, 0.0] });
const SIG_KFOLLOW = S(SIG_KHIT, { spine: [0, 0.6, -0.24], chest: [0, 0.5, -0.08], head: [0, -0.6, 0.1], sab: [0.26, 0.68, -0.46, -1.6, 0.06], shL: [1.1, 0, -0.4] });
const SIG_B = seq([
  { t: 0, s: SIG_END },
  { t: 0.3, s: SIG_KWIND, e: out },
  { t: 0.55, s: SIG_KHIT, e: inn },
  { t: 0.74, s: SIG_KFOLLOW, e: out },
  { t: 1, s: GUARD, e: io },
]);

// ---------------------------------------------------------------------------
// Force push: the blade trails low in the right hand, the left hand gathers at
// the chest and is thrust out with a step.

const CAST_GATHER = S(GUARD, {
  x: -0.05,
  spine: [0, -0.4, 0.02],
  chest: [0, -0.35, 0.02],
  head: [0, 0.35, 0],
  sab: [-0.02, 1.0, 0.36, 2.6, -0.4],
  two: 0,
  shL: [0.3, 0, 0.55],
  elL: [0, 0, 2.15],
  haL: [0, 0, 0.5],
});
const CAST_PUSH = S(CAST_GATHER, {
  x: 0.12,
  d: -0.17,
  fL: [0.44, -0.24],
  spine: [0, 0.4, -0.16],
  chest: [0, 0.35, -0.08],
  head: [0, -0.4, 0.06],
  sab: [0.0, 1.0, 0.38, 2.75, -0.45],
  shL: [-0.05, 0, 1.5],
  elL: [0, 0, 0.04],
  haL: [0, 0, 1.35],
});
const CAST = seq([
  { t: 0, s: GUARD },
  { t: 0.35, s: CAST_GATHER, e: out },
  { t: 0.55, s: CAST_PUSH, e: inn },
  { t: 0.8, s: S(CAST_PUSH, { x: 0.14, shL: [-0.05, 0, 1.55] }), e: lin },
  { t: 1, s: GUARD },
]);

// ---------------------------------------------------------------------------
// Saber throw: the blade drawn back flat over the right shoulder, the left
// hand sighting the target, a side-arm hurl; caught again at the end.

const THROW_WIND = S(GUARD, {
  x: -0.06,
  spine: [0, -0.55, 0.04],
  chest: [0, -0.45, 0.04],
  head: [0, 0.5, 0],
  sab: [-0.16, 1.48, 0.38, 2.8, 0.25],
  two: 0,
  shL: [0.05, 0, 1.4],
  elL: [0, 0, 0.1],
});
const THROW_REL = S(THROW_WIND, {
  x: 0.12,
  d: -0.16,
  fL: [0.44, -0.24],
  spine: [0, 0.45, -0.14],
  chest: [0, 0.4, -0.08],
  head: [0, -0.45, 0.04],
  sab: [0.56, 1.36, 0.12, 0.2, 0.2],
  shL: [0.5, 0, -0.3],
  elL: [0, 0, 0.6],
  hide: ['saber'],
});
const THROW = seq([
  { t: 0, s: GUARD },
  { t: 0.38, s: THROW_WIND, e: out },
  { t: 0.56, s: THROW_REL, e: inn },
  { t: 0.85, s: S(THROW_REL, { sab: [0.5, 1.42, 0.16, 0, 0.3] }), e: out },
  { t: 1, s: GUARD },
]);

// ---------------------------------------------------------------------------
// Force leap: crouch, tuck in the air with the blade dropped behind the back,
// land in a deep hammer blow.

const LEAP_CROUCH = S(GUARD, {
  d: -0.32,
  spine: [0, 0, -0.42],
  chest: [0, 0, -0.1],
  head: [0, 0, 0.3],
  sab: [0.06, 0.92, 0.34, 2.4, -0.3],
  two: 0,
  shL: [-0.3, 0, -0.5],
  elL: [0, 0, 0.5],
});
const LEAP_AIR = S(A3_WIND, { d: -0.02, fL: [0.22, -0.15, 0.42, 0.3], fR: [-0.12, 0.17, 0.5, 0.4], spine: [0, 0.06, 0.02] });
const LEAP_LAND = S(A3_FOLLOW, { sab: [0.52, 0.86, 0.02, 0, -0.75], x: 0.05, d: -0.3, fL: [0.4, -0.18], fR: [-0.36, 0.2] });
const LEAP = seq([
  { t: 0, s: LEAP_CROUCH },
  { t: 0.3, s: LEAP_AIR, e: out },
  { t: 0.68, s: S(LEAP_AIR, { sab: [0.0, 1.95, 0.1, 0, 2.75] }), e: lin },
  { t: 1, s: LEAP_LAND, e: inn },
]);

// ---------------------------------------------------------------------------
// Defence, hits, the bind, death

// block: the blade angled across the front at head height, both hands
const BLOCK = S(GUARD, { d: -0.14, spine: [0, 0.2, -0.04], chest: [0, 0.08, 0], head: [0, -0.25, 0.04], sab: [0.38, 1.38, 0.14, -1.15, 0.65], poleR: [-0.1, -1, 1] });
// parry: take the blow, then shove the other blade aside and up to the right
const PARRY_TAKE = S(BLOCK, { x: -0.05, sab: [0.33, 1.36, 0.14, -1.15, 0.6] });
const PARRY_SHOVE = S(BLOCK, { x: 0.08, d: -0.16, fL: [0.38, -0.24], spine: [0, -0.15, -0.12], chest: [0, -0.2, -0.04], sab: [0.5, 1.46, 0.24, 0.6, 1.05] });
const HURT = S(GUARD, {
  x: -0.12,
  d: -0.09,
  spine: [0, -0.2, 0.26],
  chest: [0, -0.1, 0.12],
  head: [0, 0.2, -0.25],
  sab: [0.08, 1.18, 0.42, 1.9, 0.45],
  two: 0,
  shL: [-0.9, 0, 0.5],
  elL: [0, 0, 0.6],
});
// the bind: close in, blades crossed upright between the faces, pressing
const LOCK = S(GUARD, {
  x: 0.1,
  d: -0.17,
  fL: [0.44, -0.24],
  spine: [0, 0.1, -0.24],
  chest: [0, 0.04, -0.1],
  head: [0, -0.12, 0.1],
  sab: [0.38, 1.46, 0.06, -0.15, 1.15],
  poleR: [-0.2, 0.2, 1],
  poleL: [-0.2, 0.2, -1],
});
const DEAD = {
  fk: 1,
  pelvisY: -0.85,
  spine: [0, 0.2, 1.3],
  chest: [0, 0, 0.2],
  head: [0, 0.6, 0.3],
  shR: [-1.2, 0, 0.6],
  elR: [0, 0, 0.3],
  shL: [1.4, 0, 0.3],
  elL: [0, 0, 0.5],
  hipL: [0.3, 0, 1.3],
  knL: [0, 0, -0.5],
  hipR: [-0.2, 0, 1.4],
  knR: [0, 0, -0.2],
  hide: ['saber', 'saber2'],
};
const STAGGER = S(HURT, { x: -0.16, d: -0.18 });
// down on both knees, the blade gone from the hand
const KNEES = {
  fk: 1,
  hide: ['saber', 'saber2'],
  x: -0.1,
  d: -0.5,
  fL: [-0.42, -0.12, 0.02, 1.4],
  fR: [-0.42, 0.14, 0.02, 1.4],
  spine: [0, 0.1, 0.15],
  chest: [0, 0, 0.1],
  head: [0, 0.2, -0.3],
  shR: [-0.2, 0, 0.1],
  elR: [0, 0, 0.3],
  shL: [0.2, 0, 0.1],
  elL: [0, 0, 0.3],
};
const DEATH = (() => {
  const a = seq([
    { t: 0, s: GUARD },
    { t: 0.3, s: STAGGER, e: out },
  ]);
  const kneel = P(KNEES);
  return (t) => {
    if (t <= 0.3) return a(t);
    if (t <= 0.36) return mixPose(a(0.3), kneel, io((t - 0.3) / 0.06));
    if (t <= 0.6) return kneel;
    return mixPose(kneel, DEAD, io((t - 0.6) / 0.4));
  };
})();

// ---------------------------------------------------------------------------
// Moving

/**
 * Feet over one gait cycle (phase t): planted feet slide back under the body
 * at ground speed, then swing forward lifted. `stance`: the share of the
 * cycle a foot is down.
 */
function gait(t, { stride, lift, stance, baseL = [0.04, -0.12], baseR = [0.0, 0.12] }) {
  const foot = (ph, base) => {
    ph = ((ph % 1) + 1) % 1;
    if (ph < stance) return [base[0] + stride / 2 - (ph / stance) * stride, base[1], 0, 0];
    const u = (ph - stance) / (1 - stance);
    return [base[0] - stride / 2 + stride * io(u), base[1], sin(u * PI) * lift, -0.4 * sin(u * PI)];
  };
  return { fL: foot(t, baseL), fR: foot(t + 0.5, baseR) };
}

// walk with the blade lit: a guarded stalk, low and short-stepped
const walk = (t) => {
  const s = sin(t * TAU);
  return P(
    S(GUARD, gait(t, { stride: 0.42, lift: 0.08, stance: 0.62, baseL: [0.12, -0.15], baseR: [-0.08, 0.17] }), {
      d: -0.12 - 0.012 * cos(t * TAU * 2),
      spine: [0, 0.2, -0.1],
      chest: [0, 0.1 - s * 0.05, -0.04],
      sab: [0.2, 1.3 + 0.012 * cos(t * TAU * 2), 0.18, 0.3 + s * 0.05, 1.92],
    }),
  );
};

// run with the blade lit: leaning in, the blade trailing low behind on the
// right, the left arm pumping
const run = (t) => {
  const s = sin(t * TAU);
  return P(
    S(gait(t, { stride: 0.95, lift: 0.24, stance: 0.4, baseL: [0.06, -0.1], baseR: [0.02, 0.1] }), {
      d: -0.1 + 0.03 * cos(t * TAU * 2),
      spine: [0, 0, -0.3],
      chest: [0, -s * 0.16, -0.06],
      head: [0, s * 0.1, 0.24],
      sab: [-0.04 + s * 0.07, 0.98 + Math.abs(s) * 0.02, 0.32, 2.65 - s * 0.1, -0.55],
      two: 0,
      shL: [0.22, 0, s * 0.85],
      elL: [0, 0, 1.15 + s * 0.2],
    }),
  );
};

// blade off: the hilt on the belt, at ease
const OFF = {
  fk: 1,
  off: 1,
  hide: ['saber'],
  shR: [-0.12, 0, 0.1],
  elR: [0, 0, 0.32],
  shL: [0.12, 0, 0.1],
  elL: [0, 0, 0.36],
};
// standing at ease: weight on the right leg, a slow sway, a look around,
// the mechanical right hand flexing
const idleOff = (t) => {
  const s = sin(t * TAU);
  const c = cos(t * TAU);
  return P(
    S(OFF, {
      d: -0.015 + 0.004 * c,
      x: 0.012 * s,
      fL: [0.1, -0.15],
      fR: [-0.06, 0.13],
      spine: [0, 0.06, -0.02 + 0.01 * c],
      chest: [0, 0.04 + 0.03 * s, 0.015 * c],
      head: [0, -0.1 + 0.28 * s, 0.03],
      shR: [-0.12, 0, 0.1 + 0.03 * c],
      elR: [0, 0, 0.32 + 0.05 * s],
      haR: [0, 0, 0.15 + 0.15 * max(0, s)],
      shL: [0.14, 0, 0.06 - 0.03 * c],
      elL: [0, 0, 0.4],
    }),
  );
};
const runOff = (t) => {
  const s = sin(t * TAU);
  return P(
    S(OFF, gait(t, { stride: 0.9, lift: 0.22, stance: 0.4 }), {
      d: -0.08 + 0.03 * cos(t * TAU * 2),
      spine: [0, 0, -0.2],
      chest: [0, -s * 0.14, -0.04],
      head: [0, s * 0.08, 0.14],
      shR: [-0.14, 0, -s * 0.8],
      shL: [0.14, 0, s * 0.8],
      elR: [0, 0, 1.0 - s * 0.2],
      elL: [0, 0, 1.0 + s * 0.2],
    }),
  );
};

// idle in the guard: breathing, the weight rocking, the blade circling a little
const idle = (t) => {
  const s = sin(t * TAU);
  const c = cos(t * TAU);
  return P(
    S(GUARD, {
      d: -0.12 + 0.01 * c,
      x: 0.018 * s,
      chest: [0, 0.1 + 0.03 * s, -0.04 + 0.02 * c],
      head: [0, -0.32 - 0.05 * s, 0.02],
      sab: [0.2 + 0.012 * s, 1.3 + 0.014 * c, 0.18, 0.3 + 0.07 * s, 1.92 + 0.05 * c],
    }),
  );
};

const wob = (spec, amt, f = 1) => (t) => {
  const s = sin(t * TAU * f);
  const sab = spec.sab;
  return P(S(spec, { d: spec.d + 0.006 * s, sab: [sab[0] + 0.01 * s, sab[1] + 0.008 * s, sab[2], sab[3] + amt * s, sab[4] + amt * 0.6 * cos(t * TAU * f)] }));
};

export const ANAKIN_ANIMS = {
  idle: { frames: 12, fps: 8, loop: true, pose: idle },
  walk: { frames: 12, fps: 13, loop: true, pose: walk },
  run: { frames: 12, fps: 18, loop: true, pose: run },
  idleOff: { frames: 12, fps: 6, loop: true, pose: idleOff },
  runOff: { frames: 12, fps: 18, loop: true, pose: runOff },
  attack1: { frames: 11, fps: 23, loop: false, hit: 6, pose: combo(A1_WIND, A1_HIT, A1_FOLLOW) },
  attack2: { frames: 11, fps: 23, loop: false, hit: 6, pose: combo(A2_WIND, A2_HIT, A2_FOLLOW) },
  attack3: { frames: 12, fps: 22, loop: false, hit: 7, pose: combo(A3_WIND, A3_HIT, A3_FOLLOW, 0.62) },
  sigF: { frames: 11, fps: 26, loop: false, hit: 7, pose: SIG_F },
  sigB: { frames: 10, fps: 30, loop: false, hit: 5, pose: SIG_B },
  cast: { frames: 10, fps: 20, loop: false, hit: 5, pose: CAST },
  throw: { frames: 10, fps: 22, loop: false, hit: 5, pose: THROW },
  leap: { frames: 10, fps: 14, loop: false, pose: LEAP },
  block: { frames: 6, fps: 8, loop: true, pose: wob(BLOCK, 0.03) },
  parry: {
    frames: 7,
    fps: 20,
    loop: false,
    hit: 2,
    pose: seq([
      { t: 0, s: BLOCK },
      { t: 0.25, s: PARRY_TAKE, e: out },
      { t: 0.5, s: PARRY_SHOVE, e: inn },
      { t: 1, s: GUARD, e: io },
    ]),
  },
  hurt: { frames: 7, fps: 16, loop: false, pose: seq([{ t: 0, s: GUARD }, { t: 0.28, s: HURT, e: out }, { t: 1, s: GUARD, e: io }]) },
  lock: { frames: 6, fps: 12, loop: true, pose: (t) => P(S(LOCK, { x: 0.1 + 0.02 * sin(t * TAU), d: -0.17 + 0.008 * sin(t * TAU), sab: [0.38 + 0.025 * sin(t * TAU), 1.46 + 0.012 * sin(t * TAU * 2), 0.06, -0.15 + 0.05 * sin(t * TAU * 2), 1.15] })) },
  death: { frames: 12, fps: 10, loop: false, pose: DEATH },
};
