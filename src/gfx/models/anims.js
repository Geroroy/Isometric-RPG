// Animation sets (pose functions) for each character model.
import { pose, keyframes, legCycle, easeInOut } from './rig.js';

const { sin, PI } = Math;
const TAU = PI * 2;

// ----------------------------------------------------------------------------
// Anakin — Form V (Djem So / Shien) guard: saber raised two-handed in front.

const GUARD = {
  pelvisY: -0.05,
  spine: [0, 0.25, -0.05],
  chest: [0, 0.15, -0.05],
  head: [0, -0.35, 0],
  neck: [0, 0, 0.05],
  shR: [0.35, -0.2, 0.75],
  elR: [0, 0, 1.15],
  wpn: [0.2, 0, -0.55],
  haR: [0, 0, 0],
  shL: [-0.45, 0.1, 0.65],
  elL: [0, 0, 1.25],
  hipL: [0.22, 0, 0.3],
  knL: [0, 0, -0.35],
  anL: [0, 0, 0.05],
  hipR: [-0.22, 0, -0.25],
  knR: [0, 0, -0.25],
  anR: [0, 0, 0.25],
};

const anakinIdle = (t) => {
  const b = sin(t * TAU);
  return pose(GUARD, {
    pelvisY: -0.05 + b * 0.008,
    chest: [0, 0.15, -0.05 + b * 0.02],
    shR: [0.35, -0.2, 0.75 + b * 0.03],
    wpn: [0.2 + b * 0.03, 0, -0.55],
  });
};

const anakinRun = (t) => {
  const a = t * TAU;
  const s = sin(a);
  return pose(legCycle(t, 0.75, 1.15), {
    spine: [0, 0, -0.18],
    chest: [0, -s * 0.12, -0.05],
    head: [0, s * 0.1, 0.12],
    // saber held low and trailing behind
    shR: [-0.25, 0, -0.35 - s * 0.35],
    elR: [0, 0, 0.45],
    wpn: [0.3, 0, -2.75],
    shL: [0.25, 0, s * 0.7],
    elL: [0, 0, 0.9],
  });
};

// Horizontal slash: wind up to the right, sweep across to the left.
const SLASH_A = pose(GUARD, {
  spine: [0, -0.55, -0.05],
  chest: [0, -0.45, -0.05],
  head: [0, 0.4, 0],
  shR: [-1.25, -0.4, 0.4],
  elR: [0, 0, 0.6],
  wpn: [-1.35, 0, -0.35],
  shL: [-0.2, 0, 0.3],
  elL: [0, 0, 0.8],
});
const SLASH_B = pose(GUARD, {
  spine: [0, 0.35, -0.15],
  chest: [0, 0.55, -0.1],
  head: [0, -0.5, 0],
  shR: [-1.3, 0.9, 1.35],
  elR: [0, 0, 0.15],
  wpn: [-1.4, 0, 0.1],
  shL: [0.6, 0, -0.2],
  elL: [0, 0, 0.5],
  hipL: [0.22, 0, 0.5],
  knL: [0, 0, -0.55],
});
const SLASH_C = pose(SLASH_B, {
  chest: [0, 0.75, -0.08],
  shR: [-1.1, 1.3, 1.1],
  wpn: [-1.2, 0, 0.3],
});
const anakinAttack1 = keyframes(
  [
    { t: 0, p: GUARD },
    { t: 0.3, p: SLASH_A },
    { t: 0.65, p: SLASH_B },
    { t: 1, p: SLASH_C },
  ],
  easeInOut,
);

// Overhead Djem So strike.
const OVER_A = pose(GUARD, {
  spine: [0, 0.1, 0.12],
  chest: [0, 0.1, 0.12],
  head: [0, -0.1, -0.1],
  shR: [0.2, 0, 2.9],
  elR: [0, 0, 0.6],
  wpn: [0, 0, 1.0],
  shL: [-0.25, 0, 2.7],
  elL: [0, 0, 0.7],
});
const OVER_B = pose(GUARD, {
  pelvisY: -0.16,
  spine: [0, 0.05, -0.35],
  chest: [0, 0.05, -0.2],
  head: [0, 0, 0.2],
  shR: [0.25, 0, 1.05],
  elR: [0, 0, 0.05],
  wpn: [0, 0, -0.5],
  shL: [-0.3, 0, 0.95],
  elL: [0, 0, 0.15],
  hipL: [0.25, 0, 0.75],
  knL: [0, 0, -0.95],
  hipR: [-0.25, 0, -0.45],
  knR: [0, 0, -0.5],
});
const anakinAttack2 = keyframes(
  [
    { t: 0, p: GUARD },
    { t: 0.35, p: OVER_A },
    { t: 0.7, p: OVER_B },
    { t: 1, p: OVER_B },
  ],
  easeInOut,
);

// Force push: left palm thrust forward, saber held back.
const CAST_A = pose(GUARD, {
  spine: [0, -0.35, 0.05],
  chest: [0, -0.3, 0],
  shL: [-0.2, 0, 0.3],
  elL: [0, 0, 2.0],
  shR: [-0.3, 0, -0.5],
  elR: [0, 0, 0.4],
  wpn: [0.2, 0, -2.6],
});
const CAST_B = pose(GUARD, {
  spine: [0, 0.35, -0.12],
  chest: [0, 0.3, -0.08],
  head: [0, -0.3, 0.05],
  shL: [-0.05, 0, 1.55],
  elL: [0, 0, 0.0],
  haL: [0, 0, 1.3],
  shR: [-0.35, 0, -0.6],
  elR: [0, 0, 0.35],
  wpn: [0.2, 0, -2.7],
  hipL: [0.22, 0, 0.55],
  knL: [0, 0, -0.5],
  hipR: [-0.22, 0, -0.45],
});
const anakinCast = keyframes(
  [
    { t: 0, p: GUARD },
    { t: 0.35, p: CAST_A },
    { t: 0.6, p: CAST_B },
    { t: 1, p: CAST_B },
  ],
  easeInOut,
);

// Saber throw: wind back, hurl, saber leaves the hand.
const THROW_A = pose(GUARD, {
  spine: [0, -0.6, 0.05],
  chest: [0, -0.4, 0.05],
  shR: [-0.8, 0, -0.6],
  elR: [0, 0, 0.9],
  wpn: [-1.4, 0, 0],
  shL: [-0.3, 0, 1.0],
  elL: [0, 0, 0.3],
});
const THROW_B = pose(GUARD, {
  spine: [0, 0.5, -0.12],
  chest: [0, 0.45, -0.1],
  shR: [-0.9, 0.6, 1.5],
  elR: [0, 0, 0.1],
  shL: [0.4, 0, -0.3],
  elL: [0, 0, 0.6],
  hide: ['saber'],
});
const anakinThrow = keyframes(
  [
    { t: 0, p: GUARD },
    { t: 0.4, p: THROW_A },
    { t: 0.6, p: THROW_B },
    { t: 1, p: pose(THROW_B, { shR: [-0.5, 0.3, 0.9] }) },
  ],
  easeInOut,
);

// Leap: crouch → airborne tuck with saber raised → landing strike.
const LEAP_CROUCH = pose(GUARD, {
  pelvisY: -0.25,
  spine: [0, 0, -0.35],
  hipL: [0.2, 0, 0.9],
  knL: [0, 0, -1.4],
  anL: [0, 0, 0.5],
  hipR: [-0.2, 0, 0.5],
  knR: [0, 0, -1.2],
  anR: [0, 0, 0.6],
});
const LEAP_AIR = pose(OVER_A, {
  pelvisY: 0,
  hipL: [0.15, 0, 1.2],
  knL: [0, 0, -1.8],
  hipR: [-0.15, 0, 0.4],
  knR: [0, 0, -1.6],
});
const anakinLeap = keyframes(
  [
    { t: 0, p: LEAP_CROUCH },
    { t: 0.3, p: LEAP_AIR },
    { t: 0.7, p: LEAP_AIR },
    { t: 1, p: OVER_B },
  ],
  easeInOut,
);

const DEAD = {
  bodyRot: 0,
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
  wpn: [0, 0, -1.5],
  hide: ['saber'],
};
const anakinDeath = keyframes(
  [
    { t: 0, p: GUARD },
    { t: 0.3, p: pose(GUARD, { pelvisY: -0.3, spine: [0, 0.2, 0.4], knL: [0, 0, -1.2], hipL: [0.2, 0, 0.8], knR: [0, 0, -1.0], hipR: [0, 0, 0.6] }) },
    { t: 1, p: DEAD },
  ],
  easeInOut,
);

export const ANAKIN_ANIMS = {
  idle: { frames: 6, fps: 6, loop: true, pose: anakinIdle },
  run: { frames: 10, fps: 15, loop: true, pose: anakinRun },
  attack1: { frames: 7, fps: 16, loop: false, hit: 4, pose: anakinAttack1 },
  attack2: { frames: 7, fps: 14, loop: false, hit: 4, pose: anakinAttack2 },
  cast: { frames: 6, fps: 14, loop: false, hit: 3, pose: anakinCast },
  throw: { frames: 6, fps: 16, loop: false, hit: 3, pose: anakinThrow },
  leap: { frames: 6, fps: 10, loop: false, pose: anakinLeap },
  death: { frames: 7, fps: 9, loop: false, pose: anakinDeath },
};

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
