// Character models: Anakin Skywalker (Clone Wars armor), clone troopers of the
// 501st, Captain Rex, B1 / B2 battle droids and R2-D2.
import * as THREE from 'three';
import { Rig } from './rig.js';
import { mat, glow, box, cyl, cylX, sph, group, at, rot, scl, marker } from './parts.js';

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

export function buildSaber(bladeLen = 1.0) {
  const g = new THREE.Group();
  g.add(cylX(0.022, 0.022, 0.08, mat(C.silver), -0.12));
  g.add(cylX(0.02, 0.02, 0.1, mat(C.black), -0.04));
  g.add(cylX(0.024, 0.026, 0.07, mat(C.silver), 0.06));
  const blade = new THREE.Group();
  blade.add(cylX(0.024, 0.022, bladeLen, glow(C.bladeBlue), 0.13, 0, 0, 6));
  g.add(blade);
  g.add(marker('saberBase', 0.14, 0, 0));
  g.add(marker('saberTip', 0.13 + bladeLen, 0, 0));
  g.userData.blade = blade;
  return g;
}

// ----------------------------------------------------------------------------
// Anakin Skywalker — Clone Wars armor: gunmetal chest plate & left pauldron
// with the Republic crest, dark blue tabard over a maroon tunic, long brown
// gauntlets, tall strapped boots.

export function buildAnakin() {
  const rig = new Rig();
  const j = rig.j;
  const d = rig.dims;

  // Legs: maroon trousers + tall brown boots with straps.
  for (const side of ['L', 'R']) {
    const hip = j['hip' + side];
    const kn = j['kn' + side];
    const an = j['an' + side];
    hip.add(cyl(0.078, 0.07, d.thigh, mat(C.maroon), 0, -d.thigh / 2, 0, 7));
    kn.add(cyl(0.074, 0.068, d.shin + 0.02, mat(C.leather), 0, -d.shin / 2 + 0.02, 0, 7));
    kn.add(cyl(0.082, 0.082, 0.07, mat(C.leatherDark), 0, -0.02, 0, 7)); // boot cuff
    kn.add(cyl(0.077, 0.077, 0.035, mat(C.leatherDark), 0, -0.2, 0, 7)); // strap
    kn.add(cyl(0.076, 0.076, 0.035, mat(C.leatherDark), 0, -0.32, 0, 7)); // strap
    an.add(box(0.25, 0.09, 0.11, mat(C.leather), 0.05, -0.04, 0));
    an.add(box(0.26, 0.025, 0.12, mat(C.black), 0.05, -0.08, 0));
  }

  // Pelvis + belt with buckle and pouches.
  j.pelvis.add(box(0.2, 0.16, 0.3, mat(C.maroon), 0, -0.02, 0));
  j.pelvis.add(box(0.25, 0.07, 0.34, mat(C.leather), 0, 0.06, 0));
  j.pelvis.add(box(0.03, 0.05, 0.07, mat(C.silver), 0.13, 0.06, 0));
  j.pelvis.add(box(0.06, 0.07, 0.06, mat(C.leatherDark), 0.08, 0.04, 0.17));
  j.pelvis.add(box(0.06, 0.07, 0.06, mat(C.leatherDark), -0.02, 0.04, -0.18));

  // Tabard panels hanging from the belt (they follow the legs a bit).
  const panel = (x, z, w) => {
    const g = new THREE.Group();
    g.position.set(x, 0.05, z);
    g.add(box(0.025, 0.56, w, mat(C.navy), 0, -0.28, 0));
    j.pelvis.add(g);
    return g;
  };
  const tabFL = panel(0.125, -0.085, 0.15);
  const tabFR = panel(0.125, 0.085, 0.15);
  const tabB = panel(-0.125, 0, 0.32);
  const tabSL = panel(0, -0.165, 0.2);
  tabSL.rotation.y = Math.PI / 2;
  const tabSR = panel(0, 0.165, 0.2);
  tabSR.rotation.y = Math.PI / 2;
  rig.hooks.push((r) => {
    const hl = r.j.hipL.rotation.z;
    const hr = r.j.hipR.rotation.z;
    tabFL.rotation.z = Math.max(0, hl) * 0.9 + 0.04;
    tabFR.rotation.z = Math.max(0, hr) * 0.9 + 0.04;
    tabB.rotation.z = Math.min(0, Math.min(hl, hr)) * 0.8 - 0.04;
    tabSL.rotation.x = 0.05;
    tabSR.rotation.x = -0.05;
  });

  // Torso: maroon tunic, blue vest/tabard top, gunmetal chest & back plate.
  j.spine.add(box(0.19, 0.26, 0.29, mat(C.maroon), 0, 0.12, 0));
  j.spine.add(box(0.2, 0.26, 0.1, mat(C.navy), 0.01, 0.12, 0.11));
  j.spine.add(box(0.2, 0.26, 0.1, mat(C.navy), 0.01, 0.12, -0.11));
  j.chest.add(box(0.22, 0.3, 0.34, mat(C.maroon), 0, 0.14, 0));
  j.chest.add(box(0.235, 0.24, 0.11, mat(C.navy), 0, 0.1, 0.12));
  j.chest.add(box(0.235, 0.24, 0.11, mat(C.navy), 0, 0.1, -0.12));
  j.chest.add(box(0.05, 0.2, 0.34, mat(C.plate), 0.12, 0.2, 0)); // chest plate
  j.chest.add(box(0.03, 0.08, 0.28, mat(C.plateDark), 0.14, 0.08, 0)); // lower plate
  j.chest.add(box(0.05, 0.22, 0.32, mat(C.plate), -0.12, 0.19, 0)); // back plate
  j.chest.add(cyl(0.085, 0.1, 0.07, mat(C.plateDark), 0, 0.31, 0, 8)); // collar
  j.chest.add(box(0.22, 0.04, 0.38, mat(C.plateDark), 0, 0.29, 0)); // shoulder strap

  // Left pauldron with the Republic crest.
  const paul = group(
    scl(sph(0.1, mat(C.plate), 0, 0, 0, 8, 5), 1.15, 0.75, 1.0),
    box(0.06, 0.06, 0.012, mat(C.republicRed), 0.01, -0.02, -0.1),
  );
  at(paul, 0, 0.02, -0.03);
  j.shL.add(paul);

  // Arms: maroon sleeves, long brown gauntlets.
  for (const side of ['L', 'R']) {
    j['sh' + side].add(cyl(0.058, 0.052, d.uarm, mat(C.maroon), 0, -d.uarm / 2, 0, 7));
    j['el' + side].add(cyl(0.068, 0.055, d.farm, mat(C.glove), 0, -d.farm / 2 + 0.01, 0, 7));
    j['el' + side].add(cyl(0.072, 0.072, 0.05, mat(C.leatherDark), 0, -0.02, 0, 7));
    j['ha' + side].add(box(0.085, 0.1, 0.07, mat(C.glove), 0.01, -0.045, 0));
  }

  // Head: skin, wavy brown hair.
  j.neck.add(cyl(0.045, 0.05, 0.08, mat(C.skin), 0, 0.03, 0, 6));
  j.head.add(scl(sph(0.105, mat(C.skin), 0.005, 0.1, 0, 8, 7), 1.0, 1.12, 0.92));
  j.head.add(box(0.03, 0.03, 0.03, mat(C.skin), 0.105, 0.09, 0));
  const hm = mat(C.hair);
  const hd = mat(C.hairDark);
  j.head.add(scl(sph(0.118, hm, -0.025, 0.14, 0, 8, 6), 1.0, 0.85, 1.0));
  j.head.add(sph(0.06, hd, -0.07, 0.07, 0.07));
  j.head.add(sph(0.06, hd, -0.07, 0.07, -0.07));
  j.head.add(sph(0.065, hm, -0.09, 0.1, 0));
  j.head.add(sph(0.05, hm, 0.06, 0.18, 0.05));
  j.head.add(sph(0.05, hm, 0.05, 0.19, -0.05));
  j.head.add(sph(0.04, hd, 0.0, 0.08, 0.1));
  j.head.add(sph(0.04, hd, 0.0, 0.08, -0.1));

  // Lightsaber in the right hand.
  const saber = buildSaber(1.0);
  j.wpn.add(saber);
  rig.toggles.saber = saber;

  return rig;
}

// ----------------------------------------------------------------------------
// Clone trooper (Phase II, 501st blue markings). `rex` adds a kama, extra
// markings and dual DC-17 pistols.

function buildBlaster(len, color = C.black) {
  const g = new THREE.Group();
  g.add(box(len, 0.05, 0.04, mat(color), len / 2 - 0.08, 0.02, 0));
  g.add(box(0.06, 0.09, 0.03, mat(color), -0.02, -0.03, 0));
  g.add(cylX(0.015, 0.015, 0.08, mat(C.plateDark), len - 0.08, 0.03, 0, 5));
  g.add(marker('muzzle', len, 0.03, 0));
  return g;
}

export function buildClone({ rex = false } = {}) {
  const rig = new Rig();
  const j = rig.j;
  const d = rig.dims;
  const W = mat(C.armorWhite);
  const S = mat(C.armorShade);
  const B = mat(C.bodyglove);
  const L = mat(C.legion);

  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.07, 0.06, d.thigh, B, 0, -d.thigh / 2, 0, 6));
    j['hip' + side].add(box(0.12, 0.26, 0.12, W, 0.01, -0.2, 0));
    j['kn' + side].add(box(0.12, 0.33, 0.12, W, 0.01, -0.2, 0));
    j['kn' + side].add(box(0.04, 0.33, 0.06, L, 0.065, -0.2, 0));
    j['an' + side].add(box(0.24, 0.09, 0.11, W, 0.05, -0.04, 0));
    j['sh' + side].add(cyl(0.055, 0.05, d.uarm, B, 0, -d.uarm / 2, 0, 6));
    j['sh' + side].add(box(0.13, 0.14, 0.13, W, 0, -0.06, 0));
    j['el' + side].add(box(0.1, 0.22, 0.1, W, 0, -0.13, 0));
    j['ha' + side].add(box(0.075, 0.09, 0.065, B, 0.01, -0.045, 0));
  }
  j.knL.add(box(0.06, 0.03, 0.125, L, 0.01, -0.06, 0));
  j.pelvis.add(box(0.2, 0.15, 0.3, B, 0, -0.02, 0));
  j.pelvis.add(box(0.22, 0.06, 0.32, mat(C.black), 0, 0.05, 0));
  j.pelvis.add(box(0.07, 0.1, 0.18, W, 0.12, -0.06, 0));
  j.spine.add(box(0.19, 0.26, 0.29, W, 0, 0.12, 0));
  j.chest.add(box(0.24, 0.32, 0.36, W, 0, 0.15, 0));
  j.chest.add(box(0.03, 0.2, 0.05, L, 0.125, 0.17, 0.12));
  j.chest.add(box(0.03, 0.2, 0.05, L, 0.125, 0.17, -0.12));
  j.chest.add(box(0.2, 0.12, 0.3, S, -0.13, 0.17, 0)); // backpack
  j.shL.add(scl(sph(0.095, W, 0, 0.02, 0, 7, 5), 1.1, 0.8, 1.1));
  j.shR.add(scl(sph(0.095, W, 0, 0.02, 0, 7, 5), 1.1, 0.8, 1.1));
  j.shL.add(box(0.08, 0.04, 0.012, L, 0, 0.02, -0.105));

  // Helmet with T visor and 501st blue stripe.
  j.neck.add(cyl(0.05, 0.055, 0.08, B, 0, 0.03, 0, 6));
  j.head.add(scl(sph(0.13, W, 0, 0.12, 0, 9, 7), 1.05, 1.0, 0.95));
  j.head.add(box(0.12, 0.08, 0.2, W, 0.06, 0.02, 0));
  j.head.add(box(0.02, 0.035, 0.17, mat(C.black), 0.135, 0.13, 0)); // visor
  j.head.add(box(0.02, 0.1, 0.04, mat(C.black), 0.135, 0.06, 0));
  j.head.add(box(0.24, 0.03, 0.04, L, -0.01, 0.23, 0)); // stripe
  j.head.add(box(0.02, 0.03, 0.08, L, 0.13, 0.17, 0));

  if (rex) {
    // Kama + extra jaig-eye style blue patches + pistols.
    const kama = new THREE.Group();
    kama.add(box(0.27, 0.38, 0.36, mat(0x2a2a2e), -0.02, -0.2, 0));
    at(kama, 0, 0.03, 0);
    j.pelvis.add(kama);
    j.head.add(box(0.12, 0.05, 0.2, L, 0.03, 0.19, 0));
    j.chest.add(box(0.03, 0.06, 0.3, L, 0.125, 0.04, 0));
    const p1 = buildBlaster(0.24, 0x2a2a2a);
    j.wpn.add(p1);
    const p2 = buildBlaster(0.24, 0x2a2a2a);
    j.wpnL.add(p2);
  } else {
    j.wpn.add(buildBlaster(0.62));
  }
  return rig;
}

// ----------------------------------------------------------------------------
// B1 battle droid: spindly tan frame, elongated head, E-5 blaster.

export function buildB1() {
  const rig = new Rig({ hip: 0.94, thigh: 0.44, shin: 0.43, shW: 0.17, uarm: 0.29, farm: 0.28, spine: 0.22, chest: 0.3 });
  const j = rig.j;
  const d = rig.dims;
  const T = mat(C.b1Tan);
  const D = mat(C.b1Dark);
  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.028, 0.028, d.thigh, T, 0, -d.thigh / 2, 0, 5));
    j['kn' + side].add(sph(0.04, D, 0, 0, 0, 5, 4));
    j['kn' + side].add(cyl(0.03, 0.026, d.shin, T, 0, -d.shin / 2, 0, 5));
    j['an' + side].add(box(0.2, 0.04, 0.08, T, 0.04, -0.02, 0));
    j['sh' + side].add(sph(0.04, D, 0, 0, 0, 5, 4));
    j['sh' + side].add(cyl(0.025, 0.025, d.uarm, T, 0, -d.uarm / 2, 0, 5));
    j['el' + side].add(cyl(0.025, 0.022, d.farm, T, 0, -d.farm / 2, 0, 5));
    j['ha' + side].add(box(0.06, 0.08, 0.04, T, 0, -0.04, 0));
  }
  j.pelvis.add(box(0.12, 0.08, 0.24, T, 0, 0, 0));
  j.spine.add(cyl(0.03, 0.03, d.spine, D, 0, d.spine / 2, 0, 5));
  j.chest.add(box(0.14, 0.26, 0.26, T, 0.01, 0.14, 0));
  j.chest.add(box(0.12, 0.2, 0.2, D, -0.11, 0.18, 0)); // backpack
  j.chest.add(box(0.02, 0.12, 0.12, D, 0.08, 0.15, 0));
  j.neck.add(cyl(0.022, 0.022, 0.16, D, 0, 0.06, 0, 5));
  const head = group(
    rot(cylX(0.055, 0.032, 0.3, T, -0.05, 0, 0, 6), 0, 0, -0.35),
    box(0.06, 0.04, 0.03, D, 0.0, 0.04, 0.05),
    box(0.06, 0.04, 0.03, D, 0.0, 0.04, -0.05),
  );
  at(head, 0, 0.14, 0);
  j.head.add(head);
  j.wpn.add(buildBlaster(0.5, 0x2b2d30));
  return rig;
}

// ----------------------------------------------------------------------------
// B2 super battle droid: bulky armored torso, wrist blasters.

export function buildB2() {
  const rig = new Rig({ hip: 1.02, thigh: 0.46, shin: 0.48, shW: 0.33, shY: 0.3, uarm: 0.33, farm: 0.34, spine: 0.2, chest: 0.42, hipW: 0.14 });
  const j = rig.j;
  const d = rig.dims;
  const M = mat(C.b2Metal);
  const D = mat(C.b2Dark);
  for (const side of ['L', 'R']) {
    j['hip' + side].add(cyl(0.07, 0.06, d.thigh, D, 0, -d.thigh / 2, 0, 6));
    j['kn' + side].add(box(0.18, 0.46, 0.15, M, -0.01, -0.24, 0));
    j['an' + side].add(box(0.28, 0.08, 0.16, M, 0.05, -0.03, 0));
    j['sh' + side].add(box(0.16, 0.16, 0.16, M, 0, -0.02, 0));
    j['sh' + side].add(cyl(0.06, 0.06, d.uarm, D, 0, -d.uarm / 2, 0, 6));
    j['el' + side].add(box(0.15, d.farm, 0.16, M, 0.0, -d.farm / 2, 0));
    j['el' + side].add(box(0.06, 0.06, 0.06, mat(0x15181b), 0.08, -d.farm + 0.02, 0));
    j['el' + side].add(marker('muzzle' + side, 0.12, -d.farm + 0.02, 0));
  }
  j.pelvis.add(box(0.2, 0.14, 0.34, D, 0, 0, 0));
  j.spine.add(box(0.2, 0.24, 0.3, D, 0, 0.1, 0));
  j.chest.add(box(0.34, 0.42, 0.56, M, 0, 0.22, 0));
  j.chest.add(box(0.06, 0.24, 0.4, D, 0.17, 0.2, 0));
  j.head.add(box(0.14, 0.1, 0.16, M, 0.08, 0.0, 0));
  j.head.add(box(0.02, 0.03, 0.12, mat(0x1b2025), 0.16, 0.0, 0));
  j.neck.position.set(0.06, d.chest - 0.04, 0);
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
