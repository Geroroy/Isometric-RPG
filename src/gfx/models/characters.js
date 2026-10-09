// Character models: Anakin Skywalker (Clone Wars armor), clone troopers of the
// 501st, Captain Rex, B1 / B2 battle droids and R2-D2.
import * as THREE from 'three';
import { Rig } from './rig.js';
import { mat, glow, box, cyl, cylX, sph, group, at, rot, scl, marker, sector, cloth } from './parts.js';

// --- Palette ----------------------------------------------------------------
const C = {
  skin: 0xe2b28c,
  hair: 0x6e4a2c,
  hairDark: 0x4e3320,
  maroon: 0x7a1f26,
  maroonDark: 0x5c161c,
  navy: 0x2b3b6b,
  navyDark: 0x1f2b52,
  plate: 0x5a6066,
  plateDark: 0x3d4247,
  leather: 0x5b3a27,
  leatherDark: 0x3e2719,
  glove: 0x4a3326,
  silver: 0xc9ccd2,
  black: 0x1b1b1f,
  republicRed: 0xb3262b,
  bladeBlue: 0xc8ecff,
  armorWhite: 0xe6e6e2,
  armorShade: 0xbfc1c0,
  legion: 0x2f5fbf,
  bodyglove: 0x23242a,
  b1Tan: 0xc4ad7f,
  b1Dark: 0x7d6b4c,
  b2Metal: 0x56606b,
  b2Dark: 0x363d45,
  r2Blue: 0x2f5ba8,
};

// ----------------------------------------------------------------------------
// Lightsaber: hilt + blade along the weapon holder's +X axis.

export function buildSaber(bladeLen = 1.0, second = false, bladeColor = C.bladeBlue) {
  const g = new THREE.Group();
  g.add(cylX(0.023, 0.023, 0.06, mat(C.silver), -0.13));
  g.add(cylX(0.021, 0.021, 0.12, mat(C.black), -0.07));
  g.add(cylX(0.025, 0.027, 0.08, mat(C.silver), 0.05));
  const blade = new THREE.Group();
  blade.name = 'blade';
  blade.add(cylX(0.024, 0.02, bladeLen, glow(bladeColor), 0.13, 0, 0, 6));
  g.add(blade);
  const k = second ? 'saber2' : 'saber';
  g.add(marker(k + 'Base', 0.14, 0, 0));
  g.add(marker(k + 'Tip', 0.13 + bladeLen, 0, 0));
  g.userData.blade = blade;
  return g;
}

// ----------------------------------------------------------------------------
// Anakin Skywalker — Clone Wars armor (after the reference photos): gunmetal
// chest & back plate joined over the shoulders, left pauldron with the Jedi
// crest, dark blue tabard open at the front over a long maroon tunic, brown
// gauntlets to the elbow, tall strapped boots. The saber is held through IK.

const ANAKIN_COL = {
  skin: 0xd9a582,
  hair: 0x6f4a2b,
  hairDark: 0x4a301c,
  maroon: 0x7e1f27,
  maroonDark: 0x5c151c,
  navy: 0x2d3d70,
  navyDark: 0x1f2a52,
  plate: 0x5f676e,
  plateDark: 0x3c4248,
  leather: 0x5b3c28,
  leatherDark: 0x3a2619,
  glove: 0x4f3627,
  crest: 0xa8323a,
};

/** Skirt panel hanging from a pivot on the pelvis; returns the pivot. */
function skirtPanel(parent, rTop, rBot, h, t0, t1, material, y = 0.06) {
  const pivot = new THREE.Group();
  pivot.position.set(0, y, 0);
  pivot.add(sector(rTop, rBot, h, t0, t1, material, 0, -h / 2, 0, 5));
  parent.add(pivot);
  return pivot;
}

/** Long cloth skirt split in four panels that follow the thighs. */
export function addSkirt(rig, { outer, inner, len = 0.62, innerLen = 0.5, gap = 0.32, rTop = 0.165, rBot = 0.27 }) {
  const j = rig.j;
  const F = Math.PI / 2; // front (+X)
  const panels = [];
  if (inner) {
    // inner tunic: full circle, shorter
    const ip = [
      [F - 1.2, F + 0.0, 'R'], [F, F + 1.2, 'L'],
      [F + 1.2, F + Math.PI, 'BL'], [F + Math.PI, F + 2 * Math.PI - 1.2, 'BR'],
    ];
    for (const [a, b, side] of ip) panels.push({ g: skirtPanel(j.pelvis, rTop - 0.01, rBot - 0.03, innerLen, a, b, inner), side });
  }
  const op = [
    [F + gap / 2, F + 1.3, 'L'], [F - 1.3, F - gap / 2, 'R'],
    [F + 1.3, F + Math.PI, 'BL'], [F + Math.PI, F + 2 * Math.PI - 1.3, 'BR'],
  ];
  for (const [a, b, side] of op) panels.push({ g: skirtPanel(j.pelvis, rTop, rBot, len, a, b, outer), side });
  rig.hooks.push((r) => {
    const hl = r.j.hipL.rotation.z;
    const hr = r.j.hipR.rotation.z;
    const sl = r.j.hipL.rotation.x;
    const sr = r.j.hipR.rotation.x;
    for (const { g, side } of panels) {
      if (side === 'L') g.rotation.set(Math.max(0, sl) * 0.6, 0, Math.max(0, hl) * 0.85);
      else if (side === 'R') g.rotation.set(Math.min(0, sr) * 0.6, 0, Math.max(0, hr) * 0.85);
      else if (side === 'BL') g.rotation.set(Math.max(0, sl) * 0.5, 0, Math.min(0, hl) * 0.7 - 0.03);
      else g.rotation.set(Math.min(0, sr) * 0.5, 0, Math.min(0, hr) * 0.7 - 0.03);
    }
  });
}

export function buildAnakin({ dual = false } = {}) {
  const K = ANAKIN_COL;
  const rig = new Rig({ shW: 0.2, uarm: 0.29, farm: 0.27, chest: 0.31 });
  const j = rig.j;
  const d = rig.dims;
  const skin = mat(K.skin, { tex: 'none' });

  // Legs: maroon trousers, tall strapped boots with a flared cuff.
  for (const side of ['L', 'R']) {
    const hip = j['hip' + side];
    const kn = j['kn' + side];
    const an = j['an' + side];
    hip.add(cyl(0.085, 0.066, d.thigh, mat(K.maroon), 0, -d.thigh / 2, 0, 8));
    kn.add(cyl(0.068, 0.058, d.shin, mat(K.leather), 0, -d.shin / 2 + 0.01, 0, 8));
    kn.add(cyl(0.088, 0.072, 0.09, mat(K.leatherDark), 0.004, 0.0, 0, 8)); // cuff
    for (const y of [-0.13, -0.25, -0.36]) kn.add(cyl(0.066, 0.064, 0.026, mat(K.leatherDark), 0, y, 0, 8));
    an.add(box(0.24, 0.085, 0.105, mat(K.leather), 0.055, -0.035, 0));
    an.add(box(0.26, 0.03, 0.115, mat(0x1a1512), 0.055, -0.08, 0)); // sole
  }

  // Pelvis + belt with buckle, pouches and the saber clip.
  j.pelvis.add(cyl(0.15, 0.16, 0.18, mat(K.maroon), 0, -0.03, 0, 8));
  j.pelvis.add(scl(cyl(0.175, 0.175, 0.065, mat(K.leather), 0, 0.06, 0, 10), 0.85, 1, 1.05));
  j.pelvis.add(box(0.03, 0.05, 0.08, mat(0xc9ccd2), 0.15, 0.06, 0));
  j.pelvis.add(box(0.06, 0.07, 0.06, mat(K.leatherDark), 0.07, 0.04, 0.16));
  j.pelvis.add(box(0.06, 0.07, 0.06, mat(K.leatherDark), 0.07, 0.04, -0.16));
  j.pelvis.add(box(0.06, 0.07, 0.06, mat(K.leatherDark), -0.1, 0.04, 0.13));
  addSkirt(rig, { outer: cloth(K.navy), inner: cloth(K.maroon), len: 0.6, innerLen: 0.52, gap: 0.5 });

  // Torso: maroon tunic, navy tabard over it, gunmetal yoke.
  j.spine.add(scl(cyl(0.15, 0.155, 0.27, mat(K.maroon), 0, 0.12, 0, 8), 0.78, 1, 1));
  j.spine.add(sector(0.158, 0.163, 0.27, Math.PI / 2 + 0.35, Math.PI / 2 + 2 * Math.PI - 0.35, cloth(K.navy), 0, 0.12, 0, 9));
  const chestCol = scl(cyl(0.175, 0.155, 0.31, mat(K.maroon), 0, 0.15, 0, 8), 0.74, 1, 1);
  j.chest.add(chestCol);
  const vest = sector(0.183, 0.163, 0.3, Math.PI / 2 + 0.42, Math.PI / 2 + 2 * Math.PI - 0.42, cloth(K.navy), 0, 0.14, 0, 9);
  vest.scale.set(0.8, 1, 1);
  j.chest.add(vest);
  // chest plate (front) and back plate: curved shells over the upper torso
  const plateF = sector(0.19, 0.178, 0.19, Math.PI / 2 - 1.05, Math.PI / 2 + 1.05, mat(K.plate, { side: THREE.DoubleSide }), 0, 0.22, 0, 6);
  plateF.scale.set(0.82, 1, 1);
  j.chest.add(plateF);
  const plateB = sector(0.19, 0.178, 0.2, Math.PI / 2 + Math.PI - 1.0, Math.PI / 2 + Math.PI + 1.0, mat(K.plate, { side: THREE.DoubleSide }), 0, 0.21, 0, 6);
  plateB.scale.set(0.82, 1, 1);
  j.chest.add(plateB);
  j.chest.add(box(0.03, 0.05, 0.2, mat(K.plateDark), 0.15, 0.12, 0)); // lower plate rim
  j.chest.add(scl(cyl(0.17, 0.19, 0.05, mat(K.plateDark), 0, 0.31, 0, 10), 0.8, 1, 1)); // yoke over shoulders
  j.chest.add(cyl(0.07, 0.085, 0.06, mat(K.plateDark), 0, 0.34, 0, 8)); // collar
  j.chest.add(cyl(0.06, 0.07, 0.05, mat(K.maroonDark), 0, 0.37, 0, 8)); // undershirt collar

  // Left pauldron with the Jedi crest; small plate on the right shoulder.
  const paul = group(
    scl(sph(0.105, mat(K.plate), 0, 0, 0, 9, 6), 1.1, 0.8, 1.0),
    scl(sph(0.03, mat(K.crest), 0.0, -0.01, -0.1, 6, 4), 1.2, 1.2, 0.4),
  );
  at(paul, 0, 0.01, -0.025);
  j.shL.add(paul);
  j.shR.add(scl(sph(0.08, mat(K.plateDark), 0, 0.02, 0.015, 8, 5), 1.05, 0.7, 1.0));

  // Arms: maroon sleeves, long brown gauntlets with flared cuffs.
  for (const side of ['L', 'R']) {
    j['sh' + side].add(cyl(0.06, 0.05, d.uarm, mat(K.maroon), 0, -d.uarm / 2, 0, 8));
    j['el' + side].add(cyl(0.062, 0.048, d.farm, mat(K.glove), 0, -d.farm / 2 + 0.005, 0, 8));
    j['el' + side].add(cyl(0.074, 0.064, 0.06, mat(K.leatherDark), 0, -0.02, 0, 8));
    j['ha' + side].add(scl(sph(0.05, mat(K.glove), 0.0, -0.045, 0, 7, 5), 0.9, 1.15, 0.8));
  }

  // Head: face, ears hidden under wavy shoulder-length hair parted in the middle.
  j.neck.add(cyl(0.042, 0.048, 0.08, skin, 0, 0.03, 0, 7));
  j.head.add(scl(sph(0.096, skin, 0.01, 0.1, 0, 10, 8), 0.98, 1.16, 0.88));
  j.head.add(scl(sph(0.05, skin, 0.05, 0.035, 0, 7, 5), 1.0, 0.8, 1.2)); // jaw
  j.head.add(box(0.02, 0.028, 0.02, skin, 0.1, 0.09, 0)); // nose
  const hm = mat(K.hair, { tex: 'cloth' });
  const hd = mat(K.hairDark, { tex: 'cloth' });
  j.head.add(scl(sph(0.108, hm, -0.018, 0.15, 0, 10, 7), 1.04, 0.82, 1.02)); // crown
  j.head.add(scl(sph(0.075, hd, -0.07, 0.07, 0, 8, 6), 0.9, 1.2, 1.25)); // back, to the nape
  for (const zs of [1, -1]) {
    j.head.add(scl(sph(0.05, hm, 0.0, 0.07, 0.085 * zs, 7, 5), 1.0, 1.4, 0.7)); // side locks over the ears
    j.head.add(sph(0.045, hm, 0.065, 0.19, 0.045 * zs, 7, 5)); // fringe
    j.head.add(scl(sph(0.04, hd, -0.05, 0.02, 0.06 * zs, 6, 4), 1, 1.3, 1)); // tips
  }

  // the hilt clipped to the belt while the blade is off
  const belt = group(cylX(0.022, 0.022, 0.26, mat(0xc9ccd2), -0.13, 0, 0, 6), cylX(0.024, 0.024, 0.1, mat(0x1b1b1f), -0.05, 0, 0, 6));
  belt.rotation.z = -1.35;
  belt.position.set(0.02, 0.0, 0.19);
  j.pelvis.add(belt);
  rig.beltHilt = belt;
  const saber = buildSaber(1.0);
  if (dual) {
    const saber2 = buildSaber(1.0, true);
    rig.enableSaberIK(saber, saber2);
  } else rig.enableSaberIK(saber);
  return rig;
}

// ----------------------------------------------------------------------------
// Clone trooper (Phase II, 501st blue markings). `rex` adds a kama, extra
// markings and dual DC-17 pistols.

function buildBlaster(len, color = C.black) {
  // DC-15A / E-5 style: receiver, barrel shroud, scope, grip, stock
  const g = new THREE.Group();
  const m = mat(color);
  g.add(box(len * 0.55, 0.06, 0.045, m, len * 0.2, 0.02, 0));
  g.add(cylX(0.02, 0.018, len * 0.45, mat(C.plateDark), len * 0.45, 0.03, 0, 6));
  g.add(box(0.12, 0.03, 0.03, mat(0x55585c), len * 0.25, 0.07, 0)); // scope
  g.add(box(0.05, 0.1, 0.035, m, -0.02, -0.04, 0)); // grip
  g.add(box(0.14, 0.05, 0.035, m, -0.12, 0.0, 0)); // stock
  g.add(marker('muzzle', len, 0.03, 0));
  return g;
}

export function buildClone({ rex = false, marks = null } = {}) {
  // Phase II clone trooper armour (501st): T-visor helmet with flared cheeks,
  // bell pauldrons, shaped chest and ab plates, thigh and shin plates, black
  // body glove at the joints, pouch belt, blue legion markings.
  const rig = new Rig();
  const j = rig.j;
  const d = rig.dims;
  const W = mat(C.armorWhite);
  const S = mat(C.armorShade);
  const B = mat(C.bodyglove, { tex: 'cloth' });
  const L = mat(marks ?? C.legion);
  const K = mat(C.black);

  for (const side of ['L', 'R']) {
    const zs = side === 'L' ? -1 : 1;
    // legs: glove, thigh plate front + side, knee gap, shin plate, boot
    j['hip' + side].add(cyl(0.068, 0.058, d.thigh, B, 0, -d.thigh / 2, 0, 8));
    j['hip' + side].add(box(0.14, 0.27, 0.14, W, 0.01, -0.2, 0)); // thigh plates wrap the leg
    j['hip' + side].add(box(0.03, 0.18, 0.1, S, 0.075, -0.2, 0));
    j['kn' + side].add(sph(0.058, B, 0, 0, 0, 6, 4));
    j['kn' + side].add(box(0.06, 0.06, 0.1, W, 0.06, -0.02, 0)); // knee cap
    j['kn' + side].add(box(0.13, 0.3, 0.13, W, 0.01, -0.21, 0));
    j['kn' + side].add(box(0.035, 0.26, 0.05, L, 0.075, -0.21, 0));
    j['an' + side].add(box(0.25, 0.09, 0.12, W, 0.055, -0.035, 0));
    j['an' + side].add(box(0.26, 0.025, 0.125, K, 0.055, -0.08, 0));
    // arms: glove, bell pauldron, bicep plate, bracer with blue band, glove
    j['sh' + side].add(cyl(0.052, 0.046, d.uarm, B, 0, -d.uarm / 2, 0, 8));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 8, 1), W);
    bell.position.set(0, -0.03, zs * 0.015);
    j['sh' + side].add(bell);
    j['sh' + side].add(box(0.09, 0.12, 0.09, W, 0.0, -0.17, zs * 0.005));
    j['el' + side].add(box(0.095, 0.2, 0.095, W, 0, -0.13, 0));
    j['el' + side].add(box(0.1, 0.04, 0.1, L, 0, -0.06, 0));
    j['ha' + side].add(scl(sph(0.045, B, 0.0, -0.045, 0, 6, 4), 0.9, 1.15, 0.8));
  }
  j.shL.add(box(0.05, 0.035, 0.012, L, 0.0, -0.03, -0.1)); // pauldron stripe

  // hips, belt with pouches, codpiece; ab plates; chest and back plates
  j.pelvis.add(box(0.2, 0.15, 0.3, B, 0, -0.02, 0));
  j.pelvis.add(box(0.23, 0.06, 0.33, mat(0x9fa3a6), 0, 0.05, 0));
  for (const z of [-0.12, -0.04, 0.04, 0.12]) j.pelvis.add(box(0.05, 0.06, 0.06, W, 0.12, 0.05, z));
  j.pelvis.add(box(0.06, 0.1, 0.16, W, 0.12, -0.06, 0));
  j.pelvis.add(box(0.06, 0.08, 0.2, S, -0.12, 0.02, 0)); // rear plate
  j.spine.add(box(0.17, 0.24, 0.27, W, 0, 0.12, 0));
  j.spine.add(box(0.172, 0.02, 0.272, B, 0, 0.12, 0)); // ab plate gap
  j.spine.add(box(0.05, 0.1, 0.2, W, 0.08, 0.06, 0));
  j.spine.add(box(0.05, 0.1, 0.22, W, 0.08, 0.17, 0));
  j.chest.add(box(0.21, 0.3, 0.33, W, 0, 0.14, 0));
  const chestPlate = sector(0.19, 0.17, 0.24, Math.PI / 2 - 1.05, Math.PI / 2 + 1.05, mat(C.armorWhite, { side: THREE.DoubleSide }), 0, 0.17, 0, 6);
  chestPlate.scale.set(0.8, 1, 1);
  j.chest.add(chestPlate);
  j.chest.add(box(0.08, 0.26, 0.3, W, -0.1, 0.16, 0)); // back plate
  j.chest.add(box(0.12, 0.14, 0.22, S, -0.18, 0.13, 0)); // backpack
  j.chest.add(box(0.06, 0.05, 0.24, mat(0x55585c), -0.24, 0.13, 0));
  j.chest.add(box(0.02, 0.18, 0.04, L, 0.15, 0.16, 0.09));
  j.chest.add(box(0.02, 0.18, 0.04, L, 0.15, 0.16, -0.09));
  j.chest.add(cyl(0.06, 0.07, 0.05, B, 0, 0.31, 0, 8)); // neck seal

  // Phase II helmet
  j.neck.add(cyl(0.045, 0.05, 0.08, B, 0, 0.03, 0, 6));
  j.head.add(scl(sph(0.125, W, -0.005, 0.13, 0, 10, 8), 1.05, 0.95, 0.94)); // dome
  j.head.add(box(0.13, 0.1, 0.19, W, 0.05, 0.03, 0)); // face plate
  for (const zs of [-1, 1]) j.head.add(rot(box(0.1, 0.06, 0.05, W, 0.06, -0.01, zs * 0.105), zs * -0.35, 0, 0)); // flared cheeks
  j.head.add(box(0.02, 0.035, 0.17, K, 0.12, 0.12, 0)); // T visor
  j.head.add(box(0.02, 0.09, 0.045, K, 0.12, 0.06, 0));
  j.head.add(box(0.015, 0.03, 0.06, mat(0x3a3d40), 0.12, -0.01, 0)); // vocoder
  j.head.add(box(0.06, 0.02, 0.2, W, 0.09, 0.155, 0)); // brow
  j.head.add(box(0.24, 0.025, 0.04, L, -0.01, 0.245, 0)); // crest stripe
  j.head.add(box(0.02, 0.05, 0.05, L, 0.12, 0.2, 0));

  if (rex) {
    // Rex: kama, Jaig-eye blue on the helmet, twin DC-17 pistols
    const kama = new THREE.Group();
    kama.add(box(0.27, 0.38, 0.36, mat(0x2a2a2e, { tex: 'cloth' }), -0.02, -0.2, 0));
    at(kama, 0, 0.03, 0);
    j.pelvis.add(kama);
    j.head.add(box(0.12, 0.05, 0.2, L, 0.03, 0.19, 0));
    j.chest.add(box(0.03, 0.06, 0.3, L, 0.125, 0.04, 0));
    j.wpn.add(buildBlaster(0.24, 0x2a2a2a));
    j.wpnL.add(buildBlaster(0.24, 0x2a2a2a));
  } else {
    j.wpn.add(buildBlaster(0.62));
  }
  return rig;
}

// ----------------------------------------------------------------------------
// B1 battle droid: spindly tan frame, long snouted head, power pack, E-5.

export function buildB1() {
  const rig = new Rig({ hip: 0.94, thigh: 0.44, shin: 0.43, shW: 0.17, uarm: 0.29, farm: 0.28, spine: 0.22, chest: 0.3 });
  const j = rig.j;
  const d = rig.dims;
  const T = mat(C.b1Tan);
  const D = mat(C.b1Dark);
  const K = mat(0x3a3328);
  for (const side of ['L', 'R']) {
    j['hip' + side].add(sph(0.035, D, 0, 0, 0, 6, 4));
    j['hip' + side].add(cyl(0.028, 0.024, d.thigh, T, 0, -d.thigh / 2, 0, 6));
    j['kn' + side].add(sph(0.038, D, 0, 0, 0, 6, 4));
    j['kn' + side].add(cyl(0.026, 0.03, d.shin, T, 0, -d.shin / 2, 0, 6));
    j['kn' + side].add(box(0.03, 0.12, 0.05, D, 0.02, -0.12, 0)); // shin servo
    j['an' + side].add(box(0.18, 0.035, 0.07, T, 0.05, -0.02, 0));
    j['an' + side].add(box(0.06, 0.04, 0.09, D, -0.02, -0.02, 0));
    j['sh' + side].add(sph(0.04, D, 0, 0, 0, 6, 4));
    j['sh' + side].add(cyl(0.024, 0.022, d.uarm, T, 0, -d.uarm / 2, 0, 6));
    j['el' + side].add(sph(0.03, D, 0, 0, 0, 6, 4));
    j['el' + side].add(cyl(0.022, 0.02, d.farm, T, 0, -d.farm / 2, 0, 6));
    j['ha' + side].add(box(0.05, 0.07, 0.035, T, 0, -0.035, 0));
  }
  j.pelvis.add(box(0.1, 0.07, 0.22, T, 0, 0, 0));
  j.pelvis.add(cyl(0.04, 0.04, 0.08, D, 0, 0.05, 0, 6));
  j.spine.add(cyl(0.028, 0.028, d.spine, D, 0, d.spine / 2, 0, 6));
  j.spine.add(box(0.06, 0.04, 0.12, T, 0.0, d.spine * 0.6, 0)); // rib frame
  // torso: flat chest plate with a vent grille, big power pack on the back
  j.chest.add(box(0.13, 0.25, 0.25, T, 0.01, 0.14, 0));
  for (let i = 0; i < 4; i++) j.chest.add(box(0.012, 0.018, 0.13, K, 0.08, 0.08 + i * 0.035, 0));
  j.chest.add(box(0.13, 0.22, 0.2, D, -0.12, 0.17, 0));
  j.chest.add(box(0.03, 0.18, 0.16, T, -0.19, 0.17, 0));
  j.chest.add(sph(0.045, D, 0, 0.27, 0.15, 6, 4));
  j.chest.add(sph(0.045, D, 0, 0.27, -0.15, 6, 4));
  j.neck.add(cyl(0.02, 0.02, 0.16, D, 0, 0.06, 0, 5));
  // head: elongated snout angled down, eye sockets, flattened top
  const head = group(
    rot(cylX(0.055, 0.026, 0.32, T, -0.06, 0, 0, 7), 0, 0, -0.38),
    box(0.1, 0.035, 0.09, T, -0.02, 0.05, 0),
    sph(0.022, K, 0.02, 0.035, 0.045, 5, 4),
    sph(0.022, K, 0.02, 0.035, -0.045, 5, 4),
    box(0.03, 0.03, 0.05, D, -0.07, -0.02, 0),
  );
  at(head, 0, 0.14, 0);
  j.head.add(head);
  j.wpn.add(buildBlaster(0.5, 0x2b2d30));
  return rig;
}

// ----------------------------------------------------------------------------
// B2 super battle droid: hunched armoured torso with a recessed head, heavy
// shoulder plates, massive forearms with wrist blasters, armoured shins.

export function buildB2() {
  const rig = new Rig({ hip: 1.02, thigh: 0.46, shin: 0.48, shW: 0.33, shY: 0.3, uarm: 0.33, farm: 0.34, spine: 0.2, chest: 0.42, hipW: 0.14 });
  const j = rig.j;
  const d = rig.dims;
  const M = mat(0x8c98a5);
  const M2 = mat(0x75818d);
  const D = mat(0x4f5862);
  const K = mat(0x1b1f23);
  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.075, 0.065, d.thigh, D, 0, -d.thigh / 2, 0, 8));
    j['hip' + side].add(box(0.14, 0.2, 0.15, M2, 0.02, -0.12, 0)); // thigh plate
    j['kn' + side].add(sph(0.08, D, 0, 0, 0, 7, 5));
    j['kn' + side].add(box(0.2, 0.44, 0.17, M, -0.01, -0.25, 0));
    j['kn' + side].add(box(0.06, 0.16, 0.14, M2, 0.1, -0.08, 0)); // knee guard
    j['an' + side].add(box(0.3, 0.09, 0.17, M, 0.05, -0.03, 0));
    j['an' + side].add(box(0.31, 0.03, 0.18, K, 0.05, -0.08, 0));
    // shoulder plate, upper arm, massive forearm with wrist blaster
    j['sh' + side].add(box(0.2, 0.12, 0.2, M, 0, 0.03, 0));
    j['sh' + side].add(box(0.17, 0.08, 0.17, M2, 0, -0.05, 0));
    j['sh' + side].add(cyl(0.06, 0.06, d.uarm, D, 0, -d.uarm / 2, 0, 8));
    j['el' + side].add(sph(0.07, D, 0, 0, 0, 7, 5));
    j['el' + side].add(box(0.17, d.farm, 0.18, M, 0.0, -d.farm / 2 - 0.02, 0));
    j['el' + side].add(box(0.18, 0.06, 0.19, M2, 0.0, -0.06, 0));
    j['el' + side].add(box(0.07, 0.07, 0.08, K, 0.1, -d.farm + 0.02, 0));
    j['el' + side].add(cylX(0.02, 0.02, 0.06, K, 0.12, -d.farm + 0.02, 0, 5));
    j['el' + side].add(marker('muzzle' + side, 0.12, -d.farm + 0.02, 0));
    j['ha' + side].add(box(0.12, 0.08, 0.13, D, 0, -0.05, 0));
  }
  j.pelvis.add(box(0.2, 0.14, 0.34, D, 0, 0, 0));
  j.pelvis.add(box(0.06, 0.12, 0.24, M2, 0.11, -0.02, 0));
  j.spine.add(box(0.2, 0.24, 0.28, D, 0, 0.1, 0));
  for (let i = 0; i < 3; i++) j.spine.add(box(0.03, 0.03, 0.22, M2, 0.1, 0.03 + i * 0.07, 0)); // ab cables
  // hunched torso: big forward chest block, back armour, power pack
  j.chest.add(box(0.36, 0.42, 0.58, M, 0.02, 0.22, 0));
  j.chest.add(rot(box(0.3, 0.12, 0.56, M2, 0.08, 0.44, 0), 0, 0, -0.35)); // sloped top
  j.chest.add(box(0.05, 0.26, 0.38, M2, 0.2, 0.18, 0)); // chest plate
  j.chest.add(box(0.12, 0.3, 0.4, D, -0.2, 0.22, 0)); // back pack
  for (const z of [-0.12, 0.12]) j.chest.add(cyl(0.025, 0.025, 0.3, K, -0.27, 0.22, z, 5));
  // recessed head with sensor slit
  j.head.add(box(0.15, 0.1, 0.17, M2, 0.08, 0.0, 0));
  j.head.add(box(0.02, 0.025, 0.12, K, 0.16, 0.01, 0));
  j.neck.position.set(0.12, d.chest - 0.04, 0);
  return rig;
}

// ----------------------------------------------------------------------------
// R2-D2: not a humanoid; returns a tiny rig-like object with `applyPose`.

export function buildR2() {
  const root = new THREE.Group();
  const W = mat(0xe8eaee);
  const Bl = mat(C.r2Blue);
  const S = mat(0xb8bfc8);
  const body = new THREE.Group();
  root.add(body);
  body.add(cyl(0.17, 0.17, 0.42, W, 0, 0.46, 0, 10));
  body.add(box(0.03, 0.2, 0.1, Bl, 0.165, 0.5, 0));
  body.add(box(0.03, 0.08, 0.06, Bl, 0.155, 0.32, 0.08));
  body.add(cyl(0.15, 0.17, 0.08, S, 0, 0.21, 0, 10));
  const dome = new THREE.Group();
  dome.position.y = 0.67;
  dome.add(sph(0.172, S, 0, 0, 0, 10, 5));
  dome.add(box(0.06, 0.05, 0.08, Bl, 0.14, 0.05, 0));
  dome.add(box(0.05, 0.05, 0.05, Bl, 0.06, 0.12, 0.1));
  dome.add(sph(0.025, glow(0xff3a3a), 0.16, 0.06, 0.05, 5, 4));
  dome.add(sph(0.03, mat(0x111111), 0.15, 0.1, -0.03, 5, 4));
  body.add(dome);
  for (const z of [-0.2, 0.2]) {
    body.add(box(0.1, 0.55, 0.05, W, 0, 0.42, z));
    body.add(box(0.06, 0.4, 0.04, Bl, 0.0, 0.42, z * 1.08));
    body.add(box(0.2, 0.08, 0.1, S, 0.0, 0.04, z));
  }
  body.add(box(0.12, 0.1, 0.1, S, 0.0, 0.06, 0));
  // detail: dome panel ring, radar eye, body vents and shoulder hubs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    dome.add(box(0.04, 0.035, 0.05, Bl, Math.cos(a) * 0.15, 0.02, Math.sin(a) * 0.15));
  }
  dome.add(cyl(0.04, 0.04, 0.02, mat(0x1a1a1a), 0.0, 0.17, 0.0, 8));
  for (let i = 0; i < 3; i++) body.add(box(0.02, 0.025, 0.12, mat(0x8890a0), 0.168, 0.38 + i * 0.04, -0.04));
  for (const z of [-0.23, 0.23]) {
    const hub = cyl(0.06, 0.06, 0.04, Bl, 0, 0.62, z, 8);
    hub.rotation.x = Math.PI / 2;
    body.add(hub);
  }
  return {
    root,
    toggles: {},
    applyPose(p) {
      dome.rotation.y = p.dome || 0;
      body.rotation.z = p.tilt || 0;
      body.position.y = p.bob || 0;
    },
  };
}

// ----------------------------------------------------------------------------
// Count Dooku: tall and lean, swept-back white hair and beard, dark tunic,
// long brown cape with a silver chain clasp, curved-hilt red saber.

function buildCurvedSaber() {
  const g = new THREE.Group();
  // the grip bends down from the emitter (Makashi hilt)
  const grip = new THREE.Group();
  grip.add(cylX(0.022, 0.024, 0.15, mat(0x2d2a26), -0.15));
  grip.add(cylX(0.026, 0.026, 0.03, mat(C.silver), -0.17));
  grip.rotation.z = -0.35;
  g.add(grip);
  g.add(cylX(0.026, 0.028, 0.08, mat(C.silver), -0.02));
  g.add(cylX(0.03, 0.03, 0.03, mat(0xb08a3a), 0.05));
  const blade = new THREE.Group();
  blade.name = 'blade';
  blade.add(cylX(0.024, 0.02, 1.0, glow(0xffd2c8), 0.08, 0, 0, 6));
  g.add(blade);
  g.add(marker('saberBase', 0.09, 0, 0));
  g.add(marker('saberTip', 1.08, 0, 0));
  return g;
}

export function buildDooku() {
  const rig = new Rig({ hip: 1.03, thigh: 0.47, shin: 0.47, spine: 0.25, chest: 0.33, shW: 0.19, uarm: 0.31, farm: 0.29 });
  const j = rig.j;
  const d = rig.dims;
  const tunic = 0x35302b;
  const tunicDark = 0x24201d;
  const cape = 0x553b2a;
  const capeDark = 0x46301f;
  const boot = 0x17130f;
  const skin = mat(0xdcb7a0, { tex: 'none' });
  const hair = mat(0xd5d0c8, { tex: 'cloth' });
  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.08, 0.062, d.thigh, mat(tunicDark), 0, -d.thigh / 2, 0, 8));
    j['kn' + side].add(cyl(0.062, 0.054, d.shin, mat(boot), 0, -d.shin / 2, 0, 8));
    j['kn' + side].add(cyl(0.07, 0.066, 0.06, mat(boot), 0, -0.02, 0, 8));
    j['an' + side].add(box(0.25, 0.08, 0.1, mat(boot), 0.06, -0.035, 0));
    j['sh' + side].add(cyl(0.062, 0.052, d.uarm, mat(tunic), 0, -d.uarm / 2, 0, 8));
    j['el' + side].add(cyl(0.054, 0.044, d.farm, mat(tunic), 0, -d.farm / 2, 0, 8));
    j['el' + side].add(cyl(0.05, 0.046, 0.08, mat(0x14110f), 0, -d.farm + 0.04, 0, 8)); // gloves
    j['ha' + side].add(scl(sph(0.046, mat(0x14110f), 0, -0.045, 0, 7, 5), 0.9, 1.15, 0.8));
  }
  j.pelvis.add(cyl(0.15, 0.155, 0.18, mat(tunicDark), 0, -0.03, 0, 8));
  j.pelvis.add(scl(cyl(0.165, 0.165, 0.06, mat(0x3b2d22), 0, 0.06, 0, 10), 0.85, 1, 1.05));
  j.pelvis.add(box(0.03, 0.05, 0.06, mat(0xb08a3a), 0.145, 0.06, 0));
  addSkirt(rig, { outer: cloth(tunic), len: 0.72, gap: 0.22, rTop: 0.16, rBot: 0.25 });
  j.spine.add(scl(cyl(0.145, 0.15, 0.28, mat(tunic), 0, 0.12, 0, 8), 0.76, 1, 1));
  j.chest.add(scl(cyl(0.165, 0.15, 0.33, mat(tunic), 0, 0.16, 0, 8), 0.74, 1, 1));
  j.chest.add(box(0.02, 0.26, 0.05, mat(tunicDark), 0.125, 0.15, 0.03)); // crossed front
  j.chest.add(cyl(0.06, 0.075, 0.07, mat(tunicDark), 0, 0.35, 0, 8)); // high collar
  // cape: shoulder mantle + long back panels that flare when he moves
  j.chest.add(scl(cyl(0.18, 0.22, 0.1, cloth(cape), 0, 0.3, 0, 10), 0.85, 1, 1.05));
  const clasp = group(sph(0.022, mat(C.silver), 0.15, 0.3, 0.09, 6, 4), sph(0.022, mat(C.silver), 0.15, 0.3, -0.09, 6, 4), box(0.012, 0.012, 0.18, mat(C.silver), 0.155, 0.29, 0));
  j.chest.add(clasp);
  const capeL = new THREE.Group();
  const capeR = new THREE.Group();
  for (const [g, a0, a1] of [[capeL, Math.PI / 2 + 0.9, Math.PI / 2 + Math.PI], [capeR, Math.PI / 2 + Math.PI, Math.PI / 2 + 2 * Math.PI - 0.9]]) {
    g.position.set(0, 0.32, 0);
    g.add(sector(0.2, 0.33, 1.32, a0, a1, cloth(capeDark), 0, -0.66, 0, 5));
    j.chest.add(g);
  }
  rig.hooks.push((r) => {
    const sw = Math.max(Math.abs(r.j.hipL.rotation.z), Math.abs(r.j.hipR.rotation.z));
    const lean = r.j.spine.rotation.z;
    capeL.rotation.set(0.12 + sw * 0.15, 0, -0.06 - sw * 0.35 - Math.min(0, lean) * 0.8);
    capeR.rotation.set(-0.12 - sw * 0.15, 0, -0.06 - sw * 0.35 - Math.min(0, lean) * 0.8);
  });
  // head: long face, swept-back white hair, short white beard
  j.neck.add(cyl(0.042, 0.048, 0.08, skin, 0, 0.03, 0, 7));
  j.head.add(scl(sph(0.094, skin, 0.01, 0.11, 0, 10, 8), 0.98, 1.22, 0.86));
  j.head.add(box(0.022, 0.03, 0.02, skin, 0.1, 0.1, 0));
  j.head.add(scl(sph(0.098, hair, -0.03, 0.15, 0, 9, 6), 1.0, 0.85, 0.98));
  j.head.add(scl(sph(0.06, hair, -0.07, 0.06, 0, 7, 5), 0.9, 1.2, 1.25));
  j.head.add(scl(sph(0.055, hair, 0.065, 0.02, 0, 7, 5), 0.8, 1.1, 1.05)); // beard
  rig.enableSaberIK(buildCurvedSaber());
  return rig;
}

// ----------------------------------------------------------------------------
// Jedi in Clone Wars armor (Obi-Wan): tan tunic, white plates, auburn beard.

export function buildObiWan() {
  const rig = new Rig({ shW: 0.2 });
  const j = rig.j;
  const d = rig.dims;
  const tan = 0xc4ad85;
  const tanDark = 0x9b8460;
  const white = mat(0xe2ddd2);
  const pants = 0x5b4632;
  const boot = 0x231c16;
  const skin = mat(0xe0b394, { tex: 'none' });
  const hair = mat(0x9c5f35, { tex: 'cloth' });
  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.08, 0.064, d.thigh, mat(pants), 0, -d.thigh / 2, 0, 8));
    j['kn' + side].add(cyl(0.066, 0.056, d.shin, mat(boot), 0, -d.shin / 2, 0, 8));
    j['kn' + side].add(box(0.06, 0.2, 0.09, white, 0.06, -0.14, 0)); // shin guard
    j['an' + side].add(box(0.24, 0.08, 0.1, mat(boot), 0.055, -0.035, 0));
    j['sh' + side].add(cyl(0.06, 0.052, d.uarm, mat(tan), 0, -d.uarm / 2, 0, 8));
    j['sh' + side].add(scl(sph(0.085, white, 0, 0.0, 0, 8, 5), 1.05, 0.75, 1.05));
    j['el' + side].add(cyl(0.06, 0.05, d.farm, white, 0, -d.farm / 2, 0, 8));
    j['ha' + side].add(scl(sph(0.046, mat(0x2a2420), 0, -0.045, 0, 7, 5), 0.9, 1.15, 0.8));
  }
  j.pelvis.add(cyl(0.15, 0.16, 0.18, mat(tanDark), 0, -0.03, 0, 8));
  j.pelvis.add(scl(cyl(0.172, 0.172, 0.065, mat(0x4a3424), 0, 0.06, 0, 10), 0.85, 1, 1.05));
  addSkirt(rig, { outer: cloth(tan), len: 0.5, gap: 0.25 });
  j.spine.add(scl(cyl(0.15, 0.155, 0.27, mat(tan), 0, 0.12, 0, 8), 0.78, 1, 1));
  j.chest.add(scl(cyl(0.172, 0.155, 0.31, mat(tan), 0, 0.15, 0, 8), 0.74, 1, 1));
  const plate = sector(0.186, 0.175, 0.2, Math.PI / 2 - 1.0, Math.PI / 2 + 1.0, mat(0xe2ddd2, { side: THREE.DoubleSide }), 0, 0.2, 0, 6);
  plate.scale.set(0.82, 1, 1);
  j.chest.add(plate);
  j.chest.add(cyl(0.065, 0.08, 0.06, mat(0xd8cdb6), 0, 0.34, 0, 8));
  j.neck.add(cyl(0.042, 0.048, 0.08, skin, 0, 0.03, 0, 7));
  j.head.add(scl(sph(0.095, skin, 0.01, 0.1, 0, 10, 8), 0.98, 1.15, 0.88));
  j.head.add(scl(sph(0.104, hair, -0.02, 0.15, 0, 9, 6), 1.03, 0.8, 1.0));
  j.head.add(scl(sph(0.065, hair, -0.065, 0.08, 0, 7, 5), 0.9, 1.1, 1.2));
  j.head.add(scl(sph(0.062, hair, 0.055, 0.03, 0, 7, 5), 0.85, 1.05, 1.1)); // beard
  j.pelvis.add(at(rot(group(cylX(0.02, 0.02, 0.22, mat(C.silver), -0.11, 0, 0, 6)), 0, 0, -1.4), 0.05, 0.02, -0.17)); // saber on the belt
  return rig;
}

// Ahsoka Tano (Clone Wars film look): orange Togruta skin with white
// markings, striped montrals and lekku, maroon tube top, slim frame.

export function buildAhsoka() {
  const rig = new Rig({ hip: 0.88, thigh: 0.41, shin: 0.41, hipW: 0.085, spine: 0.21, chest: 0.27, shW: 0.17, shY: 0.24, uarm: 0.26, farm: 0.24 });
  const j = rig.j;
  const d = rig.dims;
  const skin = mat(0xd8693b, { tex: 'none' });
  const white = mat(0xf2efe8, { tex: 'none' });
  const blue = mat(0x2f4f9a, { tex: 'none' });
  const top = 0x7a2e2a;
  const legs = 0x5b4a3f;
  const boot = 0x3a2a20;
  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.065, 0.05, d.thigh, mat(legs), 0, -d.thigh / 2, 0, 8));
    j['kn' + side].add(cyl(0.05, 0.045, d.shin, mat(boot), 0, -d.shin / 2, 0, 8));
    j['an' + side].add(box(0.2, 0.07, 0.085, mat(boot), 0.05, -0.03, 0));
    j['sh' + side].add(cyl(0.042, 0.038, d.uarm, skin, 0, -d.uarm / 2, 0, 7));
    j['el' + side].add(cyl(0.042, 0.036, d.farm, mat(0x3a2e28), 0, -d.farm / 2, 0, 7)); // arm sleeves
    j['ha' + side].add(scl(sph(0.038, skin, 0, -0.04, 0, 6, 4), 0.9, 1.1, 0.8));
  }
  j.pelvis.add(cyl(0.12, 0.13, 0.15, mat(legs), 0, -0.02, 0, 8));
  j.pelvis.add(scl(cyl(0.138, 0.14, 0.05, mat(0x3a2a20), 0, 0.05, 0, 10), 0.85, 1, 1.05));
  addSkirt(rig, { outer: cloth(top), len: 0.22, gap: 0.1, rTop: 0.135, rBot: 0.18 });
  j.spine.add(scl(cyl(0.11, 0.12, 0.24, skin, 0, 0.11, 0, 8), 0.78, 1, 1));
  j.chest.add(scl(cyl(0.135, 0.12, 0.2, mat(top), 0, 0.09, 0, 8), 0.76, 1, 1));
  j.chest.add(scl(cyl(0.1, 0.13, 0.08, skin, 0, 0.23, 0, 8), 0.76, 1, 1));
  j.neck.add(cyl(0.036, 0.04, 0.07, skin, 0, 0.03, 0, 7));
  j.head.add(scl(sph(0.085, skin, 0.01, 0.09, 0, 10, 8), 0.98, 1.12, 0.88));
  j.head.add(box(0.02, 0.02, 0.07, white, 0.085, 0.12, 0)); // brow markings
  j.head.add(box(0.02, 0.025, 0.04, white, 0.08, 0.04, 0)); // chin marking
  // montrals: curved white horns with blue stripes
  for (const zs of [1, -1]) {
    const m = new THREE.Group();
    m.position.set(0.0, 0.17, 0.05 * zs);
    m.rotation.set(-0.35 * zs, 0, -0.35);
    m.add(cyl(0.012, 0.045, 0.16, white, 0, 0.08, 0, 6));
    m.add(cyl(0.03, 0.035, 0.03, blue, 0, 0.06, 0, 6));
    j.head.add(m);
    // front lekku over the shoulders
    const l = new THREE.Group();
    l.position.set(0.0, 0.07, 0.065 * zs);
    l.rotation.set(0.1 * zs, 0, 0.25);
    l.add(cyl(0.04, 0.015, 0.3, white, 0, -0.15, 0, 6));
    l.add(cyl(0.034, 0.03, 0.04, blue, 0, -0.1, 0, 6));
    l.add(cyl(0.024, 0.02, 0.04, blue, 0, -0.2, 0, 6));
    j.head.add(l);
  }
  const back = new THREE.Group();
  back.position.set(-0.07, 0.08, 0);
  back.rotation.z = -0.2;
  back.add(cyl(0.045, 0.015, 0.32, white, 0, -0.16, 0, 6));
  back.add(cyl(0.038, 0.032, 0.04, blue, 0, -0.12, 0, 6));
  j.head.add(back);
  j.pelvis.add(at(rot(group(cylX(0.018, 0.018, 0.2, mat(C.silver), -0.1, 0, 0, 6)), 0, 0, -1.4), 0.04, 0.02, 0.15));
  return rig;
}
