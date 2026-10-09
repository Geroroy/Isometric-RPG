// Animation sets (pose functions) for each character model.
import { pose, keyframes, legCycle, easeInOut } from './rig.js';

const { sin, PI } = Math;
const TAU = PI * 2;

// ----------------------------------------------------------------------------
// Sabers are animated by hilt position + blade direction (`sab`, `sab2`:
// [x, y, z, yaw, pitch] in model space; the model faces +X, +Z is its right)
// and the arms follow through IK — see Rig.enableSaberIK. Swings interpolate
// the angles, so blades sweep in arcs instead of cutting through the body.

const STANCE = {
  pelvisY: -0.05,
  hipL: [0.24, 0, 0.36],
  knL: [0, 0, -0.42],
  anL: [0, 0, 0.06],
  hipR: [-0.24, 0, -0.3],
  knR: [0, 0, -0.22],
  anR: [0, 0, 0.3],
};
const LUNGE = {
  pelvisY: -0.14,
  hipL: [0.24, 0, 0.75],
  knL: [0, 0, -0.85],
  anL: [0, 0, 0.1],
  hipR: [-0.24, 0, -0.5],
  knR: [0, 0, -0.3],
  anR: [0, 0, 0.45],
};

// Djem So high guard (Revenge of the Sith): both hands on the hilt beside the
// right shoulder, blade upright and tilted slightly back. (yaw 0 / pitch past
// vertical so swings into the overhead chop stay in one vertical plane.)
const GUARD = pose(STANCE, {
  spine: [0, 0.3, -0.05],
  chest: [0, 0.12, -0.04],
  neck: [0, 0, 0.04],
  head: [0, -0.38, 0],
  sab: [0.3, 1.36, 0.22, 0, 1.79],
  two: 1,
});

const wobble = (base, t, amt) => {
  const b = sin(t * TAU);
  return pose(base, {
    pelvisY: (base.pelvisY || 0) + b * 0.008,
    chest: [base.chest[0], base.chest[1], base.chest[2] + b * 0.02],
    ...(base.sab ? { sab: [base.sab[0], base.sab[1] + b * 0.012, base.sab[2], base.sab[3] + b * amt * 0.5, base.sab[4] + b * amt] } : {}),
    ...(base.sab2 ? { sab2: [base.sab2[0], base.sab2[1] - b * 0.01, base.sab2[2], base.sab2[3] - b * amt * 0.5, base.sab2[4] + b * amt] } : {}),
  });
};

// Djem So combo, as against Dooku and Obi-Wan in Episode III:
// 1) diagonal cut from high right down to low left
const SLASH_A = pose(GUARD, {
  spine: [0, -0.35, -0.02],
  chest: [0, -0.3, 0],
  head: [0, 0.3, 0],
  sab: [0.15, 1.6, 0.3, 2.6, 1.0],
});
const SLASH_B = pose(GUARD, LUNGE, {
  spine: [0, 0.35, -0.16],
  chest: [0, 0.4, -0.1],
  head: [0, -0.5, 0.05],
  sab: [0.5, 1.12, 0.02, -0.5, -0.35],
});
const SLASH_C = pose(SLASH_B, {
  spine: [0, 0.6, -0.14],
  chest: [0, 0.55, -0.1],
  head: [0, -0.65, 0.05],
  sab: [0.3, 0.92, -0.3, -1.6, -0.75],
});

// 2) the return cut from high left down to low right (the X)
const BACK_A = pose(GUARD, {
  spine: [0, 0.55, -0.04],
  chest: [0, 0.42, -0.02],
  head: [0, -0.6, 0],
  sab: [0.25, 1.55, -0.15, -2.4, 1.0],
  poleR: [0.2, -0.6, 1],
});
const BACK_B = pose(GUARD, LUNGE, {
  spine: [0, -0.2, -0.16],
  chest: [0, -0.3, -0.1],
  head: [0, 0.1, 0.05],
  sab: [0.5, 1.12, 0.05, 0.5, -0.35],
});
const BACK_C = pose(BACK_B, {
  spine: [0, -0.45, -0.12],
  chest: [0, -0.5, -0.08],
  head: [0, 0.3, 0.05],
  sab: [0.25, 0.92, 0.32, 1.6, -0.75],
});

// 3) straight overhead chop (also the Djem So Overhead skill)
const OVER_A = pose(GUARD, {
  spine: [0, 0.08, 0.14],
  chest: [0, 0.02, 0.1],
  head: [0, -0.15, -0.1],
  sab: [0.02, 1.86, 0.05, 0, 2.3],
  poleR: [0.1, -0.3, 1],
  poleL: [0.1, -0.3, -1],
});
const OVER_B = pose(GUARD, LUNGE, {
  pelvisY: -0.17,
  spine: [0, 0.08, -0.36],
  chest: [0, 0.04, -0.2],
  head: [0, -0.1, 0.22],
  sab: [0.56, 1.0, 0.0, 0, -0.45],
});
const OVER_C = pose(OVER_B, { sab: [0.5, 0.82, 0.0, 0, -0.85] });

// Anakin's signature (as in the Coruscant duel with Obi-Wan): from the high
// guard he lifts the hilt beside his ear and whips the blade one-handed round
// behind his neck like a halo, out of the wrap into a flat cut across the
// front; then the backhand drops low on the right and rises back up the front
// into the guard — back and forth, driving forward, the left arm out for
// balance. (Blade yaw runs on past a full turn so the wrap goes the right way.)
const SIG_ARM = { two: 0, shL: [0.85, 0, 0.35], elL: [0, 0, 0.35], haL: [0, 0, 0.3] };
const SIG_WRAP1 = pose(GUARD, SIG_ARM, { spine: [0, -0.25, 0.02], chest: [0, -0.3, 0], head: [0, 0.1, 0], sab: [0.06, 1.72, 0.22, 3.0, 0.25] });
const SIG_WRAP2 = pose(GUARD, SIG_ARM, { spine: [0, -0.1, 0], chest: [0, -0.15, 0], head: [0, 0, 0], sab: [0.02, 1.66, 0.12, 4.4, 0.05] });
const SIG_CUT = pose(GUARD, LUNGE, SIG_ARM, { spine: [0, 0.35, -0.12], chest: [0, 0.4, -0.08], head: [0, -0.35, 0.05], sab: [0.36, 1.42, -0.12, 6.0, -0.05] });
const SIG_CUT_END = pose(SIG_CUT, { spine: [0, -0.3, -0.12], chest: [0, -0.35, -0.08], head: [0, 0.2, 0.05], sab: [0.42, 1.3, 0.18, 7.2, -0.2] });
const SIG_LOW = pose(GUARD, LUNGE, SIG_ARM, { spine: [0, -0.35, -0.16], chest: [0, -0.3, -0.1], head: [0, 0.2, 0.08], sab: [0.4, 1.0, 0.26, 0.6, -0.9] });
const SIG_RISE = pose(GUARD, SIG_ARM, { spine: [0, 0.2, -0.08], chest: [0, 0.2, -0.05], head: [0, -0.2, 0.04], sab: [0.45, 1.18, -0.04, -0.4, 0.4] });
const SIG_WRAP = keyframes([{ t: 0, p: GUARD }, { t: 0.25, p: SIG_WRAP1 }, { t: 0.45, p: SIG_WRAP2 }, { t: 0.72, p: SIG_CUT }, { t: 1, p: SIG_CUT_END }], easeInOut);
const SIG_BACK = keyframes([{ t: 0, p: pose(SIG_CUT_END, { sab: [0.42, 1.3, 0.18, 1.0, -0.2] }) }, { t: 0.4, p: SIG_LOW }, { t: 0.7, p: SIG_RISE }, { t: 1, p: GUARD }], easeInOut);

const swing = (a, b, c, d = c) =>
  keyframes(
    [
      { t: 0, p: a },
      { t: 0.34, p: b },
      { t: 0.6, p: c },
      { t: 1, p: d },
    ],
    easeInOut,
  );

// Force push: saber held back in the right hand, left palm thrust forward.
const CAST_A = pose(GUARD, {
  spine: [0, -0.35, 0.05],
  chest: [0, -0.3, 0],
  head: [0, 0.2, 0],
  sab: [-0.04, 1.02, 0.33, 2.7, -0.35],
  two: 0,
  shL: [-0.2, 0, 0.3],
  elL: [0, 0, 2.0],
});
const CAST_B = pose(GUARD, LUNGE, {
  spine: [0, 0.35, -0.12],
  chest: [0, 0.3, -0.08],
  head: [0, -0.3, 0.05],
  sab: [0.0, 1.0, 0.34, 2.8, -0.4],
  two: 0,
  shL: [-0.05, 0, 1.55],
  elL: [0, 0, 0.0],
  haL: [0, 0, 1.3],
});

// Saber throw: wind back, hurl, the saber leaves the hand (catch pose after).
const THROW_A = pose(GUARD, {
  spine: [0, -0.6, 0.05],
  chest: [0, -0.4, 0.05],
  head: [0, 0.3, 0],
  sab: [-0.15, 1.55, 0.36, 2.6, 0.5],
  two: 0,
  shL: [-0.3, 0, 1.0],
  elL: [0, 0, 0.3],
});
const THROW_B = pose(GUARD, LUNGE, {
  spine: [0, 0.5, -0.12],
  chest: [0, 0.45, -0.1],
  head: [0, -0.4, 0],
  sab: [0.52, 1.42, 0.12, 0, 0.3],
  two: 0,
  shL: [0.4, 0, -0.3],
  elL: [0, 0, 0.6],
  hide: ['saber'],
});

const LEAP_CROUCH = pose(GUARD, {
  pelvisY: -0.26,
  spine: [0, 0, -0.38],
  hipL: [0.2, 0, 0.95],
  knL: [0, 0, -1.45],
  anL: [0, 0, 0.5],
  hipR: [-0.2, 0, 0.5],
  knR: [0, 0, -1.25],
  anR: [0, 0, 0.6],
  sab: [0.08, 0.92, 0.3, 2.4, -0.3],
  two: 0,
  shL: [-0.3, 0, -0.4],
  elL: [0, 0, 0.5],
});
const LEAP_AIR = pose(OVER_A, {
  pelvisY: 0,
  hipL: [0.15, 0, 1.2],
  knL: [0, 0, -1.8],
  hipR: [-0.15, 0, 0.4],
  knR: [0, 0, -1.6],
});

// Djem So block: blade angled across the front, both hands, ready to
// shove the opponent's blade aside and strike back.
const BLOCK = pose(STANCE, {
  spine: [0, 0.2, 0.02],
  chest: [0, 0.08, 0],
  head: [0, -0.25, 0.06],
  sab: [0.4, 1.3, 0.1, -0.9, 0.9],
  two: 1,
  poleR: [-0.1, -1, 1],
});
const PARRY = pose(BLOCK, LUNGE, {
  spine: [0, -0.15, -0.1],
  chest: [0, -0.2, -0.05],
  sab: [0.48, 1.42, 0.2, 0.6, 1.1],
});
const HURT = pose(STANCE, {
  pelvisY: -0.1,
  spine: [0, -0.2, 0.28],
  chest: [0, -0.1, 0.12],
  head: [0, 0.2, -0.25],
  sab: [0.1, 1.2, 0.4, 1.9, 0.45],
  two: 0,
  shL: [-0.9, 0, 0.5],
  elL: [0, 0, 0.6],
  hipL: [0.24, 0, 0.2],
  knL: [0, 0, -0.5],
});
// Saber lock: blades bound together, pressing forward.
const LOCK = pose(LUNGE, {
  spine: [0, 0.12, -0.26],
  chest: [0, 0.05, -0.1],
  head: [0, -0.1, 0.1],
  sab: [0.42, 1.3, 0.02, -0.12, 1.0],
  two: 1,
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
const FALLING = pose(GUARD, {
  pelvisY: -0.3,
  spine: [0, 0.2, 0.4],
  knL: [0, 0, -1.2],
  hipL: [0.2, 0, 0.8],
  knR: [0, 0, -1.0],
  hipR: [0, 0, 0.6],
  sab: [0.3, 0.8, 0.4, 1.5, -0.9],
  two: 0,
  shL: [-0.6, 0, 0.6],
});

function runPose(t, sab, sab2) {
  const s = sin(t * TAU);
  return pose(legCycle(t, 0.75, 1.15), {
    spine: [0, 0, -0.2],
    chest: [0, -s * 0.12, -0.05],
    head: [0, s * 0.1, 0.14],
    sab: [sab[0] + s * 0.08, sab[1] + Math.abs(s) * 0.02, sab[2], sab[3] - s * 0.1, sab[4]],
    ...(sab2 ? { sab2: [sab2[0] - s * 0.08, sab2[1], sab2[2], sab2[3] - s * 0.1, sab2[4]] } : { shL: [0.25, 0, s * 0.7], elL: [0, 0, 0.9] }),
    two: 0,
  });
}

function guardWalk(base) {
  return (t) => pose(wobble(base, t, 0.02), legCycle(t, 0.42, 0.8), { spine: [0, base.spine[1] * 0.7, -0.08] });
}

function bake(base, set) {
  return {
    idle: { frames: 8, fps: 7, loop: true, pose: (t) => wobble(base, t, 0.03) },
    walk: { frames: 10, fps: 12, loop: true, pose: guardWalk(base) },
    ...set,
  };
}

// Blade off: relaxed walk and stance, hilt on the belt.
const OFF = {
  fk: 1,
  off: 1,
  hide: ['saber'],
  shR: [-0.12, 0, 0.12],
  elR: [0, 0, 0.3],
  shL: [0.12, 0, 0.1],
  elL: [0, 0, 0.35],
  head: [0, -0.1, 0],
};
const idleOff = (t) => pose(OFF, { pelvisY: sin(t * TAU) * 0.006, chest: [0, 0.05, sin(t * TAU) * 0.015], hipL: [0.06, 0, 0.08], hipR: [-0.06, 0, -0.05], knL: [0, 0, -0.08] });
const runOff = (t) => {
  const s = sin(t * TAU);
  return pose(OFF, legCycle(t, 0.75, 1.15), { spine: [0, 0, -0.16], chest: [0, -s * 0.12, -0.04], head: [0, s * 0.08, 0.1], shR: [-0.15, 0, -s * 0.75], shL: [0.15, 0, s * 0.75], elR: [0, 0, 0.8], elL: [0, 0, 0.8] });
};

export const ANAKIN_ANIMS = bake(GUARD, {
  idleOff: { frames: 8, fps: 6, loop: true, pose: idleOff },
  runOff: { frames: 12, fps: 18, loop: true, pose: runOff },
  run: { frames: 12, fps: 18, loop: true, pose: (t) => runPose(t, [0.02, 0.98, 0.3, 2.5, -0.5]) },
  attack1: { frames: 9, fps: 20, loop: false, hit: 5, pose: swing(GUARD, SLASH_A, SLASH_B, SLASH_C) },
  attack2: { frames: 9, fps: 20, loop: false, hit: 5, pose: swing(GUARD, BACK_A, BACK_B, BACK_C) },
  attack3: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(GUARD, OVER_A, OVER_B, OVER_C) },
  sigF: { frames: 10, fps: 24, loop: false, hit: 7, pose: SIG_WRAP },
  sigB: { frames: 7, fps: 24, loop: false, hit: 3, pose: SIG_BACK },
  cast: { frames: 8, fps: 18, loop: false, hit: 4, pose: swing(GUARD, CAST_A, CAST_B) },
  throw: { frames: 8, fps: 20, loop: false, hit: 4, pose: swing(GUARD, THROW_A, THROW_B, pose(THROW_B, { sab: [0.45, 1.36, 0.16, 0, 0.2] })) },
  leap: { frames: 8, fps: 12, loop: false, pose: keyframes([{ t: 0, p: LEAP_CROUCH }, { t: 0.3, p: LEAP_AIR }, { t: 0.7, p: LEAP_AIR }, { t: 1, p: OVER_B }], easeInOut) },
  block: { frames: 4, fps: 8, loop: true, pose: (t) => wobble(BLOCK, t, 0.02) },
  parry: { frames: 6, fps: 20, loop: false, hit: 2, pose: keyframes([{ t: 0, p: BLOCK }, { t: 0.35, p: PARRY }, { t: 1, p: GUARD }], easeInOut) },
  hurt: { frames: 6, fps: 14, loop: false, pose: keyframes([{ t: 0, p: GUARD }, { t: 0.3, p: HURT }, { t: 1, p: GUARD }], easeInOut) },
  lock: { frames: 4, fps: 10, loop: true, pose: (t) => wobble(LOCK, t, 0.04) },
  death: { frames: 8, fps: 9, loop: false, pose: keyframes([{ t: 0, p: GUARD }, { t: 0.35, p: FALLING }, { t: 0.36, p: pose(DEAD, { pelvisY: -0.4, spine: [0, 0.2, 0.6] }) }, { t: 1, p: DEAD }], easeInOut) },
});

// ----------------------------------------------------------------------------
// Anakin with Obi-Wan's saber in the left hand (Geonosis duel, phase 2).

const GUARD2 = pose(STANCE, {
  spine: [0, 0.2, -0.05],
  chest: [0, 0.08, -0.04],
  head: [0, -0.3, 0],
  sab: [0.25, 1.2, 0.14, 0.3, 1.2],
  sab2: [0.27, 0.98, -0.22, -0.5, 0.15],
});
const D_SLASH_A = pose(SLASH_A, { two: 0, sab2: [-0.05, 1.0, -0.3, -2.6, -0.3] });
const D_SLASH_B = pose(SLASH_B, { two: 0, sab2: [0.05, 1.0, -0.33, -2.4, -0.4] });
const D_SLASH_C = pose(SLASH_C, { two: 0, sab2: [0.1, 0.98, -0.36, -2.6, -0.45] });
const D_LEFT_A = pose(GUARD2, {
  spine: [0, 0.55, -0.04],
  chest: [0, 0.4, -0.04],
  head: [0, -0.6, 0],
  sab: [0.0, 1.45, 0.33, 2.4, 0.9],
  sab2: [0.05, 1.4, -0.38, -2.3, 0.6],
});
const D_LEFT_B = pose(D_LEFT_A, LUNGE, {
  spine: [0, -0.3, -0.16],
  chest: [0, -0.4, -0.1],
  head: [0, 0.3, 0],
  sab2: [0.5, 1.15, -0.04, 0, 0.05],
});
const D_LEFT_C = pose(D_LEFT_B, {
  spine: [0, -0.55, -0.12],
  chest: [0, -0.55, -0.08],
  sab2: [0.25, 1.05, 0.33, 2.0, -0.25],
  poleL: [-0.2, -1, 0.2],
});
const D_X_A = pose(GUARD2, {
  spine: [0, 0.05, 0.14],
  chest: [0, 0, 0.1],
  head: [0, -0.15, -0.1],
  sab: [0.04, 1.8, 0.14, 0.3, 2.3],
  sab2: [0.04, 1.8, -0.14, -0.3, 2.3],
  poleR: [0.1, -0.3, 1],
  poleL: [0.1, -0.3, -1],
});
const D_X_B = pose(D_X_A, LUNGE, {
  spine: [0, 0.05, -0.36],
  chest: [0, 0.03, -0.2],
  head: [0, -0.1, 0.2],
  sab: [0.52, 1.05, 0.1, -0.45, -0.4],
  sab2: [0.52, 1.05, -0.1, 0.45, -0.4],
});
const D_X_C = pose(D_X_B, { sab: [0.48, 0.92, -0.05, -0.8, -0.7], sab2: [0.48, 0.92, 0.05, 0.8, -0.7] });
const BLOCK2 = pose(STANCE, {
  spine: [0, 0.1, 0.02],
  chest: [0, 0.05, 0],
  head: [0, -0.2, 0.06],
  sab: [0.38, 1.3, 0.14, -0.9, 0.9],
  sab2: [0.38, 1.3, -0.14, 0.9, 0.9],
  poleR: [-0.1, -1, 1],
  poleL: [-0.1, -1, -1],
});
const PARRY2 = pose(BLOCK2, { sab: [0.42, 1.44, 0.25, 0.9, 1.05], spine: [0, -0.15, 0.04] });
const HURT2 = pose(HURT, { sab2: [0.05, 1.05, -0.38, -2.0, 0.2] });
const LOCK2 = pose(LOCK, { two: 0, sab2: [0.1, 1.0, -0.35, -2.4, -0.3] });
const CAST2_A = pose(CAST_A, { sab2: [-0.05, 1.0, -0.33, -2.7, -0.35] });
const CAST2_B = pose(CAST_B, { sab2: [0.5, 1.25, -0.1, -0.2, 0.4] });

export const ANAKIN_DUAL_ANIMS = bake(GUARD2, {
  run: { frames: 12, fps: 18, loop: true, pose: (t) => runPose(t, [0.02, 0.98, 0.3, 2.5, -0.5], [0.02, 0.98, -0.3, -2.5, -0.5]) },
  attack1: { frames: 9, fps: 22, loop: false, hit: 5, pose: swing(GUARD2, D_SLASH_A, D_SLASH_B, D_SLASH_C) },
  attack2: { frames: 9, fps: 22, loop: false, hit: 5, pose: swing(GUARD2, D_LEFT_A, D_LEFT_B, D_LEFT_C) },
  attack3: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(GUARD2, D_X_A, D_X_B, D_X_C) },
  cast: { frames: 8, fps: 18, loop: false, hit: 4, pose: swing(GUARD2, CAST2_A, CAST2_B) },
  block: { frames: 4, fps: 8, loop: true, pose: (t) => wobble(BLOCK2, t, 0.02) },
  parry: { frames: 6, fps: 20, loop: false, hit: 2, pose: keyframes([{ t: 0, p: BLOCK2 }, { t: 0.35, p: PARRY2 }, { t: 1, p: GUARD2 }], easeInOut) },
  hurt: { frames: 6, fps: 14, loop: false, pose: keyframes([{ t: 0, p: GUARD2 }, { t: 0.3, p: HURT2 }, { t: 1, p: GUARD2 }], easeInOut) },
  lock: { frames: 4, fps: 10, loop: true, pose: (t) => wobble(LOCK2, t, 0.04) },
  // skills also used while dual-wielding: Obi-Wan's saber stays low in the left hand
  throw: { ...ANAKIN_ANIMS.throw, pose: (t) => pose(ANAKIN_ANIMS.throw.pose(t), { sab2: [0.05, 1.0, -0.33, -2.5, -0.35] }) },
  leap: { ...ANAKIN_ANIMS.leap, pose: (t) => pose(ANAKIN_ANIMS.leap.pose(t), { two: 0, sab2: [0.1, 1.2, -0.35, -2.2, 0.2] }) },
  sigF: { ...ANAKIN_ANIMS.sigF, pose: (t) => pose(ANAKIN_ANIMS.sigF.pose(t), { two: 0, sab2: [0.1, 1.0, -0.35, -2.4, -0.3] }) },
  sigB: { ...ANAKIN_ANIMS.sigB, pose: (t) => pose(ANAKIN_ANIMS.sigB.pose(t), { two: 0, sab2: [0.1, 1.0, -0.35, -2.4, -0.3] }) },
  death: ANAKIN_ANIMS.death,
});

// ----------------------------------------------------------------------------
// Count Dooku — Makashi: upright side-on stance, one hand on the curved hilt,
// blade levelled at the opponent, free hand tucked behind the back.

const D_STANCE = {
  pelvisY: -0.02,
  hipL: [0.08, 0, 0.36],
  knL: [0, 0, -0.22],
  anL: [0, 0, 0.0],
  hipR: [-0.06, 0, -0.3],
  knR: [0, 0, -0.12],
  anR: [0, 0, 0.28],
};
const MAKASHI = pose(D_STANCE, {
  spine: [0, 0.6, 0.02],
  chest: [0, 0.18, 0.02],
  head: [0, -0.72, 0.02],
  sab: [0.44, 1.16, 0.1, -0.12, 0.28],
  two: 0,
  poleR: [-0.6, -1, 0.5],
  shL: [0.15, 0, -0.55],
  elL: [0, 0, 1.7],
  haL: [0, 0, 0.3],
});
const DK_LUNGE_A = pose(MAKASHI, { spine: [0, 0.65, 0.06], sab: [0.12, 1.28, 0.26, 0.0, 0.35] });
const DK_LUNGE_B = pose(MAKASHI, {
  pelvisY: -0.16,
  bodyX: 0.22,
  spine: [0, 0.55, -0.18],
  head: [0, -0.62, 0.1],
  hipL: [0.08, 0, 1.0],
  knL: [0, 0, -0.95],
  hipR: [-0.06, 0, -0.75],
  knR: [0, 0, -0.1],
  anR: [0, 0, 0.5],
  sab: [0.78, 1.1, 0.04, -0.05, 0.02],
  shL: [0.6, 0, -1.0],
  elL: [0, 0, 0.3],
});
const DK_FLICK_A = pose(MAKASHI, { spine: [0, 0.3, 0.05], sab: [0.26, 1.58, 0.3, 0.6, 1.5], poleR: [0, -0.5, 1] });
const DK_FLICK_B = pose(MAKASHI, { spine: [0, 0.7, -0.12], bodyX: 0.1, hipL: [0.08, 0, 0.7], knL: [0, 0, -0.6], sab: [0.58, 1.0, -0.12, -0.6, -0.4] });
const DK_FLICK_C = pose(DK_FLICK_B, { sab: [0.36, 0.95, -0.3, -1.4, -0.6] });
const DK_BACK_A = pose(MAKASHI, { spine: [0, 0.9, 0.0], chest: [0, 0.4, 0], sab: [0.2, 1.3, -0.3, -2.0, 0.4] });
const DK_BACK_B = pose(MAKASHI, { spine: [0, 0.2, -0.12], chest: [0, -0.1, 0], bodyX: 0.1, hipL: [0.08, 0, 0.7], knL: [0, 0, -0.6], sab: [0.56, 1.2, 0.05, 0.0, 0.1] });
const DK_BACK_C = pose(DK_BACK_B, { spine: [0, -0.1, -0.1], chest: [0, -0.3, 0], sab: [0.3, 1.15, 0.36, 1.9, 0.0] });
const DK_BLOCK = pose(D_STANCE, {
  spine: [0, 0.5, 0.02],
  chest: [0, 0.1, 0],
  head: [0, -0.6, 0.04],
  sab: [0.4, 1.42, 0.05, -1.4, 0.4],
  two: 0,
  poleR: [-0.2, -1, 1],
  shL: [0.15, 0, -0.55],
  elL: [0, 0, 1.7],
});
const DK_PARRY = pose(DK_BLOCK, { sab: [0.42, 1.45, 0.2, 0.8, 1.1] });
const DK_HURT = pose(MAKASHI, {
  spine: [0, 0.4, 0.3],
  chest: [0, 0.1, 0.1],
  head: [0, -0.4, -0.25],
  sab: [0.1, 1.2, 0.42, 1.8, 0.5],
  shL: [-0.9, 0, 0.4],
  elL: [0, 0, 0.5],
});
const DK_LOCK = pose(D_STANCE, LUNGE, {
  spine: [0, 0.2, -0.24],
  chest: [0, 0.05, -0.1],
  head: [0, -0.2, 0.1],
  sab: [0.42, 1.32, 0.0, 0.12, 1.0],
  two: 1,
});
// Force lightning: saber drawn back, left hand clawed forward.
const DK_CAST = pose(MAKASHI, {
  spine: [0, -0.1, -0.06],
  chest: [0, -0.2, -0.04],
  head: [0, 0.0, 0.05],
  hipL: [0.08, 0, 0.6],
  knL: [0, 0, -0.5],
  sab: [-0.02, 1.0, 0.33, 2.6, -0.45],
  shL: [-0.05, 0, 1.5],
  elL: [0, 0, 0.1],
  haL: [0, 0, 0.6],
});
const DK_KNEEL = pose(MAKASHI, {
  fk: 1,
  pelvisY: -0.42,
  spine: [0, 0.1, -0.3],
  chest: [0, 0, -0.2],
  head: [0, -0.1, 0.4],
  hipL: [0, 0, 1.4],
  knL: [0, 0, -1.4],
  anL: [0, 0, 0.0],
  hipR: [0, 0, -0.15],
  knR: [0, 0, -1.9],
  anR: [0, 0, 0.6],
  shR: [0, 0, 0.3],
  elR: [0, 0, 0.3],
  shL: [0, 0, 0.6],
  elL: [0, 0, 0.6],
  hide: ['saber'],
});

export const DOOKU_ANIMS = bake(MAKASHI, {
  idle: { frames: 8, fps: 6, loop: true, pose: (t) => pose(wobble(MAKASHI, t, 0.02), { sab: [0.44 + sin(t * TAU) * 0.02, 1.16, 0.1, -0.12 + Math.cos(t * TAU) * 0.08, 0.28 + sin(t * TAU) * 0.06] }) },
  attack1: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(MAKASHI, DK_LUNGE_A, DK_LUNGE_B) },
  attack2: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(MAKASHI, DK_FLICK_A, DK_FLICK_B, DK_FLICK_C) },
  attack3: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(MAKASHI, DK_BACK_A, DK_BACK_B, DK_BACK_C) },
  cast: { frames: 4, fps: 10, loop: true, pose: (t) => pose(DK_CAST, { haL: [0, sin(t * TAU) * 0.2, 0.6], elL: [0, 0, 0.1 + sin(t * TAU * 2) * 0.05] }) },
  block: { frames: 4, fps: 8, loop: true, pose: (t) => wobble(DK_BLOCK, t, 0.02) },
  parry: { frames: 6, fps: 20, loop: false, hit: 2, pose: keyframes([{ t: 0, p: DK_BLOCK }, { t: 0.35, p: DK_PARRY }, { t: 1, p: MAKASHI }], easeInOut) },
  hurt: { frames: 6, fps: 14, loop: false, pose: keyframes([{ t: 0, p: MAKASHI }, { t: 0.3, p: DK_HURT }, { t: 1, p: MAKASHI }], easeInOut) },
  lock: { frames: 4, fps: 10, loop: true, pose: (t) => wobble(DK_LOCK, t, 0.04) },
  death: { frames: 7, fps: 8, loop: false, pose: keyframes([{ t: 0, p: pose(DK_HURT, { fk: 1, hide: ['saber'] }) }, { t: 1, p: DK_KNEEL }], easeInOut) },
});

// ----------------------------------------------------------------------------
// Soldiers (clones, droids): rifle carried at the chest.

function soldierSet({ stiff = 0, rifle = true, dual = false } = {}) {
  const AIM = rifle
    ? {
        shR: [0.1, 0, 0.55],
        elR: [0, 0, 0.9],
        wpn: [0, 0, -1.45],
        shL: [-0.5, 0.2, 1.1],
        elL: [0, 0, 0.5],
        chest: [0, 0.15, 0],
        head: [0, -0.15, 0],
      }
    : dual
      ? {
          shR: [-0.05, 0, 1.45],
          elR: [0, 0, 0.1],
          wpn: [0, 0, -1.5],
          shL: [0.05, 0, 1.45],
          elL: [0, 0, 0.1],
        }
      : {
          shR: [-0.1, 0, 1.45],
          elR: [0, 0, 0.1],
          shL: [0.1, 0, 1.45],
          elL: [0, 0, 0.1],
        };
  const REST = rifle
    ? { ...AIM, shR: [0.15, 0, 0.3], elR: [0, 0, 1.2], wpn: [0, 0, -1.2], shL: [-0.45, 0.2, 0.75], elL: [0, 0, 0.95] }
    : dual
      ? { shR: [-0.1, 0, 0.2], elR: [0, 0, 0.5], wpn: [0, 0, -0.6], shL: [0.1, 0, 0.2], elL: [0, 0, 0.5], wpnL: [0, 0, -0.6] }
      : { shR: [-0.1, 0, 0.15], elR: [0, 0, 0.3], shL: [0.1, 0, 0.15], elL: [0, 0, 0.3] };
  const idle = (t) => pose(REST, { pelvisY: sin(t * TAU) * 0.01 * (1 - stiff), head: [0, sin(t * TAU) * 0.15, 0] });
  const walk = (t) => {
    const s = sin(t * TAU);
    return pose(REST, legCycle(t, 0.55 - stiff * 0.15, 0.9 - stiff * 0.3), {
      spine: [0, 0, -0.08],
      chest: [0, -s * 0.08, 0],
      ...(rifle ? {} : { shR: [-0.1, 0, -s * 0.5 + 0.1], shL: [0.1, 0, s * 0.5 + 0.1] }),
    });
  };
  const shoot = keyframes([
    { t: 0, p: AIM },
    { t: 0.3, p: pose(AIM, { chest: [0, 0.15, 0.12], shR: [(AIM.shR?.[0] ?? 0), 0, (AIM.shR?.[2] ?? 0) + 0.15] }) },
    { t: 1, p: AIM },
  ]);
  const FALL = {
    ...REST,
    pelvisY: -0.82,
    spine: [0, 0.1, 1.35],
    chest: [0, 0, 0.15],
    head: [0.3, 0, 0.3],
    hipL: [0.2, 0, 1.3],
    knL: [0, 0, -0.3],
    hipR: [-0.2, 0, 1.45],
    knR: [0, 0, -0.1],
    shR: [-1.0, 0, 0.6],
    shL: [1.0, 0, 0.6],
  };
  const death = keyframes(
    [
      { t: 0, p: REST },
      { t: 0.35, p: pose(REST, { pelvisY: -0.3, spine: [0, 0.3, 0.5], knL: [0, 0, -1.1], hipL: [0, 0, 0.7], knR: [0, 0, -0.9], hipR: [0, 0, 0.5] }) },
      { t: 1, p: FALL },
    ],
    easeInOut,
  );
  return {
    idle: { frames: 4, fps: 4, loop: true, pose: idle },
    walk: { frames: 8, fps: 12, loop: true, pose: walk },
    shoot: { frames: 4, fps: 12, loop: false, hit: 1, pose: shoot },
    death: { frames: 6, fps: 10, loop: false, pose: death },
  };
}

export const CLONE_ANIMS = soldierSet({});
export const REX_ANIMS = soldierSet({ rifle: false, dual: true });
export const B1_ANIMS = soldierSet({ stiff: 0.5 });
export const B2_ANIMS = soldierSet({ rifle: false, stiff: 0.6 });

export const R2_ANIMS = {
  idle: { frames: 4, fps: 3, loop: true, pose: (t) => ({ dome: sin(t * TAU) * 0.8 }) },
  walk: { frames: 4, fps: 10, loop: true, pose: (t) => ({ tilt: -0.08, bob: Math.abs(sin(t * TAU)) * 0.02, dome: 0 }) },
};

// ----------------------------------------------------------------------------
// Friendly NPCs (base camp): relaxed idle, walk, talking gesture.

const NPC_REST = {
  shR: [-0.12, 0, 0.08],
  elR: [0, 0, 0.3],
  shL: [0.12, 0, 0.08],
  elL: [0, 0, 0.3],
};
function npcSet({ rest = NPC_REST, down = null } = {}) {
  const idle = (t) => pose(rest, { pelvisY: sin(t * TAU) * 0.006, chest: [0, 0, sin(t * TAU) * 0.015], head: [0, sin(t * TAU) * 0.12, 0] });
  const walk = (t) => {
    const s = sin(t * TAU);
    return pose(rest, legCycle(t, 0.5, 0.85), { spine: [0, 0, -0.06], chest: [0, -s * 0.08, 0], shR: [-0.1, 0, -s * 0.45], shL: [0.1, 0, s * 0.45], elR: [0, 0, 0.35], elL: [0, 0, 0.35] });
  };
  const talk = (t) => {
    const s = sin(t * TAU);
    return pose(rest, { chest: [0, 0.1 + s * 0.05, 0], head: [0, -0.1 + s * 0.08, 0.04 * s], shR: [-0.2, 0, 0.75 + s * 0.15], elR: [0, 0, 1.0 - s * 0.2], haR: [0, 0, 0.4] });
  };
  const set = {
    idle: { frames: 6, fps: 5, loop: true, pose: idle },
    walk: { frames: 8, fps: 11, loop: true, pose: walk },
    talk: { frames: 6, fps: 6, loop: true, pose: talk },
  };
  if (down) set.down = { frames: 4, fps: 3, loop: true, pose: (t) => pose(down, { chest: [down.chest[0], down.chest[1], down.chest[2] + sin(t * TAU) * 0.03] }) };
  return set;
}

// Obi-Wan wounded on the hangar floor, propped on one arm.
const OBI_DOWN = {
  pelvisY: -0.82,
  spine: [0, 0, 0.75],
  chest: [0, 0.1, 0.25],
  head: [0, 0.3, -0.5],
  hipL: [0.1, 0, 1.4],
  knL: [0, 0, -0.9],
  hipR: [-0.1, 0, 1.2],
  knR: [0, 0, -0.3],
  shL: [0.4, 0, -0.4],
  elL: [0, 0, 0.4],
  shR: [-0.3, 0, 0.7],
  elR: [0, 0, 0.8],
};

export const OBIWAN_ANIMS = npcSet({ rest: pose(NPC_REST, { shR: [-0.1, 0, 0.5], elR: [0, 0, 1.6], haR: [0, 0, 0.5] }), down: OBI_DOWN });
export const AHSOKA_ANIMS = npcSet({ rest: pose(NPC_REST, { shR: [-0.3, 0, -0.1], elR: [0, 0, 0.9], shL: [0.3, 0, -0.1], elL: [0, 0, 0.9], spine: [0, 0.15, 0], head: [0, -0.15, 0] }) });
export const NPC_CLONE_ANIMS = npcSet({ rest: { shR: [0.15, 0, 0.3], elR: [0, 0, 1.2], wpn: [0, 0, -1.2], shL: [-0.45, 0.2, 0.75], elL: [0, 0, 0.95] } });

// Figrin D'an playing the kloo horn: both hands on the horn below his mouth,
// swaying to the beat; when Anakin talks to him he lowers it a little.
const BITH_PLAY = { shR: [0.25, 0, 0.75], elR: [0, 0, 1.45], haR: [0, 0, 0.3], shL: [-0.25, 0, 0.45], elL: [0, 0, 1.2], haL: [0, 0, 0.3] };
export const BITH_ANIMS = {
  idle: {
    frames: 8,
    fps: 8,
    loop: true,
    pose: (t) => {
      const s = sin(t * TAU);
      return pose(BITH_PLAY, { pelvisY: Math.abs(s) * 0.012, spine: [0, s * 0.06, -0.04], chest: [0, s * 0.05, Math.abs(s) * 0.05], head: [0, 0, -0.08 + Math.abs(s) * 0.06], knL: [0, 0, -Math.max(0, s) * 0.12], hipL: [0, 0, Math.max(0, s) * 0.06] });
    },
  },
  talk: {
    frames: 6,
    fps: 6,
    loop: true,
    pose: (t) => pose(BITH_PLAY, { chest: [0, 0.08, -0.12], head: [0, sin(t * TAU) * 0.1, 0.05], shR: [0.25, 0, 0.55], elR: [0, 0, 1.3] }),
  },
};

// ----------------------------------------------------------------------------
// Mustafar (Episode III).

// Anakin in the hooded robe for the opening: blade off, hilt on the belt.
// Every pose names which hood mesh to hide (raised / lying on the back).
const HOODED = pose(OFF, { hide: ['saber', 'hoodDown'] });
const BARE = pose(OFF, { hide: ['saber', 'hoodUp'] });
// the Force choke: right hand raised towards Padmé, fingers closing
const CHOKE = pose(HOODED, {
  spine: [0, -0.15, 0],
  chest: [0, -0.1, -0.04],
  head: [0, 0.15, -0.08],
  shR: [-0.12, 0, 1.45],
  elR: [0, 0, 0.18],
  haR: [0, 0.3, -0.35],
});
const REACH = pose(HOODED, { shR: [-0.35, 0, 2.5], elR: [0, 0, 1.55], shL: [0.35, 0, 2.5], elL: [0, 0, 1.55], head: [0, 0, 0.12] });
const angry = (base) => (t) => {
  const s = sin(t * TAU);
  return pose(base, { chest: [0, 0.1 + s * 0.06, -0.05], head: [0, -0.1 + s * 0.1, -0.06], shR: [-0.25, 0, 0.6 + s * 0.25], elR: [0, 0, 0.9 - s * 0.2], haR: [0, 0, 0.3] });
};
export const ANAKIN_HOOD_ANIMS = {
  idle: { frames: 6, fps: 5, loop: true, pose: (t) => pose(HOODED, { pelvisY: sin(t * TAU) * 0.006, chest: [0, 0, sin(t * TAU) * 0.015] }) },
  walk: { frames: 8, fps: 10, loop: true, pose: (t) => pose(HOODED, legCycle(t, 0.42, 0.8), { spine: [0, 0, -0.05] }) },
  choke: { frames: 6, fps: 8, loop: true, pose: (t) => pose(CHOKE, { haR: [0, 0.3, -0.35 - sin(t * TAU) * 0.12], elR: [0, 0, 0.18 + sin(t * TAU * 2) * 0.03] }) },
  hoodOff: { frames: 10, fps: 9, loop: false, pose: keyframes([{ t: 0, p: HOODED }, { t: 0.45, p: REACH }, { t: 0.55, p: pose(REACH, { hide: BARE.hide }) }, { t: 1, p: BARE }], easeInOut) },
  idleBare: { frames: 6, fps: 5, loop: true, pose: (t) => pose(BARE, { pelvisY: sin(t * TAU) * 0.006, chest: [0, 0.05, sin(t * TAU) * 0.015] }) },
  walkBare: { frames: 8, fps: 10, loop: true, pose: (t) => pose(BARE, legCycle(t, 0.42, 0.8), { spine: [0, 0, -0.05] }) },
  talkBare: { frames: 6, fps: 6, loop: true, pose: angry(BARE) },
};

// The fight: Anakin's Djem So set plus the backflip that opens it.
const flip = (t) => {
  const h = 0.95;
  const u = Math.min(1, Math.max(0, (t - 0.15) / 0.65)); // airborne part
  const th = u * TAU;
  const tuck = sin(u * PI);
  const crouch = t < 0.15 ? t / 0.15 : t > 0.8 ? 1 - (t - 0.8) / 0.2 : 0;
  // the hilt turns with the body round the hips (blade stays in the hand)
  const lift = tuck * 0.95 - crouch * 0.12;
  const [hx, hy] = [0.25, 1.2 - tuck * 0.1];
  const c = Math.cos(th);
  const sn = sin(th);
  const sab = [hx * c - (hy - h) * sn, h + hx * sn + (hy - h) * c + lift, 0.32, 0.3, 1.2 + th];
  return pose(GUARD, {
    body: [0, 0, th],
    bodyX: h * sin(th),
    bodyY: h * (1 - Math.cos(th)) + lift,
    hipL: [0.2, 0, 0.36 + tuck * 1.5 + crouch * 0.6],
    knL: [0, 0, -0.42 - tuck * 1.9 - crouch * 0.8],
    hipR: [-0.2, 0, -0.3 + tuck * 1.6 + crouch * 0.6],
    knR: [0, 0, -0.22 - tuck * 1.9 - crouch * 0.8],
    spine: [0, 0.2, -0.05 - tuck * 0.35],
    sab,
    two: 0,
    shL: [0.3, 0, 0.4 + tuck * 0.8],
    elL: [0, 0, 1.2],
  });
};
export const ANAKIN_MUSTAFAR_ANIMS = { ...ANAKIN_ANIMS, backflip: { frames: 14, fps: 18, loop: false, pose: flip } };

// Obi-Wan's Soresu ready stance: blade drawn back over the right shoulder,
// left hand extended open towards the opponent.
const SORESU = pose(STANCE, {
  spine: [0, 0.3, -0.02],
  chest: [0, 0.12, -0.02],
  head: [0, -0.35, 0],
  sab: [-0.02, 1.6, 0.28, 0.2, 2.65],
  two: 0,
  shL: [-0.1, 0, 1.25],
  elL: [0, 0, 0.35],
  haL: [0, 0, 0.9],
});
const OB_BLOCK = pose(BLOCK, { two: 0, shL: [-0.1, 0, 0.9], elL: [0, 0, 0.6], haL: [0, 0, 0.8] });
export const OBIWAN3_ANIMS = bake(SORESU, {
  attack1: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(SORESU, SLASH_A, SLASH_B, SLASH_C) },
  attack2: { frames: 9, fps: 18, loop: false, hit: 5, pose: swing(SORESU, BACK_A, BACK_B, BACK_C) },
  attack3: { frames: 9, fps: 16, loop: false, hit: 5, pose: swing(SORESU, OVER_A, OVER_B, OVER_C) },
  cast: { frames: 8, fps: 14, loop: false, hit: 4, pose: swing(SORESU, CAST_A, CAST_B) },
  block: { frames: 4, fps: 8, loop: true, pose: (t) => wobble(OB_BLOCK, t, 0.02) },
  parry: { frames: 6, fps: 20, loop: false, hit: 2, pose: keyframes([{ t: 0, p: OB_BLOCK }, { t: 0.35, p: pose(PARRY, { two: 0 }) }, { t: 1, p: SORESU }], easeInOut) },
  hurt: { frames: 6, fps: 14, loop: false, pose: keyframes([{ t: 0, p: SORESU }, { t: 0.3, p: HURT }, { t: 1, p: SORESU }], easeInOut) },
  lock: { frames: 4, fps: 10, loop: true, pose: (t) => wobble(LOCK, t, 0.04) },
  leap: { frames: 8, fps: 12, loop: false, pose: keyframes([{ t: 0, p: LEAP_CROUCH }, { t: 0.3, p: LEAP_AIR }, { t: 0.7, p: LEAP_AIR }, { t: 1, p: SORESU }], easeInOut) },
  death: { frames: 7, fps: 8, loop: false, pose: keyframes([{ t: 0, p: SORESU }, { t: 1, p: pose(SORESU, { pelvisY: -0.3, spine: [0, 0.2, -0.3] }) }], easeInOut) },
});
// in the robe before the fight: blade off, then lit
export const OBIWAN3_ROBE_ANIMS = {
  idle: { frames: 6, fps: 5, loop: true, pose: (t) => pose(OFF, { pelvisY: sin(t * TAU) * 0.006, head: [0, 0, sin(t * TAU) * 0.02] }) },
  talk: { frames: 6, fps: 6, loop: true, pose: (t) => pose(OFF, { chest: [0, 0.08, 0], head: [0, sin(t * TAU) * 0.08, 0.04], shL: [0.2, 0, 0.7 + sin(t * TAU) * 0.15], elL: [0, 0, 0.9] }) },
};

// Padmé: standing, choked (hands at her throat, rising onto her toes), collapse.
const PADME_REST = { shR: [-0.1, 0, 0.1], elR: [0, 0, 0.4], shL: [0.1, 0, 0.1], elL: [0, 0, 0.4] };
const CHOKED = {
  bodyY: 0.06,
  spine: [0, 0, 0.1],
  chest: [0, 0, 0.12],
  head: [0, 0, 0.4],
  shR: [-0.35, 0, 1.0],
  elR: [0, 0, 2.15],
  shL: [0.35, 0, 1.0],
  elL: [0, 0, 2.15],
  anL: [0, 0, -0.5],
  anR: [0, 0, -0.5],
  knL: [0, 0, -0.1],
};
const PADME_DOWN = pose(DEAD, { shR: [-1.0, 0, 0.9], elR: [0, 0, 0.6], shL: [0.6, 0, 0.4] });
export const PADME_ANIMS = {
  idle: { frames: 6, fps: 5, loop: true, pose: (t) => pose(PADME_REST, { pelvisY: sin(t * TAU) * 0.005, head: [0, sin(t * TAU) * 0.1, 0] }) },
  talk: { frames: 6, fps: 6, loop: true, pose: (t) => pose(PADME_REST, { head: [0, sin(t * TAU) * 0.08, 0.05], shR: [-0.2, 0, 0.6], elR: [0, 0, 1.2 + sin(t * TAU) * 0.2] }) },
  choked: { frames: 6, fps: 9, loop: true, pose: (t) => pose(CHOKED, { head: [0, sin(t * TAU) * 0.15, 0.4], bodyY: 0.06 + sin(t * TAU * 2) * 0.01 }) },
  collapse: { frames: 8, fps: 8, loop: false, pose: keyframes([{ t: 0, p: CHOKED }, { t: 0.4, p: pose(FALLING, { fk: 1, hide: [] }) }, { t: 1, p: PADME_DOWN }], easeInOut) },
  down: { frames: 2, fps: 2, loop: true, pose: () => PADME_DOWN },
};

// Master Seren Vael: upright, hands folded in her sleeves; raises an open hand
// to catch Dooku's lightning.
const MASTER_REST = { shL: [0.1, 0, 0.6], elL: [0, 0, 1.5], shR: [-0.1, 0, 0.6], elR: [0, 0, 1.5], haL: [0, 0, 0.2], haR: [0, 0, 0.2] };
export const MASTER_ANIMS = {
  idle: { frames: 6, fps: 5, loop: true, pose: (t) => pose(MASTER_REST, { pelvisY: sin(t * TAU) * 0.005, head: [0, sin(t * TAU) * 0.08, 0] }) },
  walk: { frames: 8, fps: 10, loop: true, pose: (t) => pose(MASTER_REST, legCycle(t, 0.45, 0.8)) },
  absorb: { frames: 4, fps: 8, loop: true, pose: (t) => pose(MASTER_REST, { spine: [0, 0, -0.1], hipL: [0, 0, 0.3], knL: [0, 0, -0.2], hipR: [0, 0, -0.25], shR: [-0.05, 0, 1.55], elR: [0, 0, 0.1 + sin(t * TAU) * 0.05], haR: [0, 0, -1.0] }) },
};
