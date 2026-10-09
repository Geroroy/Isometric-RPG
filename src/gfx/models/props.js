// Static world props (pre-rendered once at load). Each entry describes how to
// build the model, how many random variants to bake, collision footprint and
// optional light emission.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../../core/math.js';
import { mat, glow, box, cyl, cylX, sph, cone, rot, scl } from './parts.js';

function lumpy(geo, rng, amt) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (1 + rng.range(-amt, amt)), p.getY(i) * (1 + rng.range(-amt, amt)), p.getZ(i) * (1 + rng.range(-amt, amt)));
  }
  g.computeVertexNormals();
  return g;
}

function rockMesh(rng, r, color) {
  const geo = lumpy(new THREE.DodecahedronGeometry(r, 2), rng, 0.22); // finer facets read as rugged rock
  const m = new THREE.Mesh(geo, mat(color, { tex: 'rock' }));
  m.scale.set(rng.range(0.9, 1.3), rng.range(0.55, 0.9), rng.range(0.9, 1.3));
  m.position.y = r * m.scale.y * 0.6;
  m.rotation.y = rng.range(0, 6.28);
  return m;
}

// ----------------------------------------------------------------------------

function rock(rng) {
  const g = new THREE.Group();
  const cols = [0x77706a, 0x6b6560, 0x837b70, 0x5f5b58];
  g.add(rockMesh(rng, rng.range(0.35, 0.6), rng.pick(cols)));
  if (rng.chance(0.6)) {
    const m = rockMesh(rng, rng.range(0.15, 0.3), rng.pick(cols));
    m.position.x = rng.range(-0.5, 0.5);
    m.position.z = rng.range(0.3, 0.55);
    g.add(m);
  }
  return g;
}

function boulder(rng) {
  const g = new THREE.Group();
  const cols = [0x6e6862, 0x5d5853, 0x7a7168];
  for (let i = 0; i < 4; i++) {
    const m = rockMesh(rng, rng.range(0.6, 1.1), rng.pick(cols));
    m.position.x = rng.range(-0.7, 0.7);
    m.position.z = rng.range(-0.7, 0.7);
    m.scale.y *= rng.range(1.0, 1.8);
    m.position.y *= m.scale.y;
    g.add(m);
  }
  return g;
}

function crystal(rng) {
  const g = new THREE.Group();
  const hues = [
    [0x7fe3ff, 0x2a7ec9],
    [0x9fb8ff, 0x4a52c9],
    [0x8ff5e6, 0x1e8f8a],
  ];
  const [light, dark] = rng.pick(hues);
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.6, 1.9) * (i === 0 ? 1.3 : 1);
    const r = rng.range(0.1, 0.22);
    const shard = new THREE.Group();
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(i % 2 ? light : dark, { emissive: dark, emissiveIntensity: 0.55 }));
    m.scale.set(r, h / 2, r);
    m.position.y = h / 2 * 0.85;
    shard.add(m);
    shard.position.set(rng.range(-0.35, 0.35), 0, rng.range(-0.35, 0.35));
    shard.rotation.set(rng.range(-0.45, 0.45), rng.range(0, 3), rng.range(-0.45, 0.45));
    g.add(shard);
  }
  g.add(rockMesh(rng, 0.3, 0x4d4a5a));
  return g;
}

function crystalSpire(rng) {
  const g = crystal(rng);
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(0xa8f0ff, { emissive: 0x3a8fd0, emissiveIntensity: 0.6 }));
  m.scale.set(0.35, 2.4, 0.35);
  m.position.y = 2.0;
  m.rotation.z = rng.range(-0.15, 0.15);
  g.add(m);
  return g;
}

function scrub(rng) {
  const g = new THREE.Group();
  const cols = [0x6f7440, 0x5d6236, 0x847d4a];
  for (let i = 0; i < rng.int(3, 6); i++) {
    const c = cone(rng.range(0.08, 0.16), rng.range(0.3, 0.6), mat(rng.pick(cols)), rng.range(-0.25, 0.25), 0.15, rng.range(-0.25, 0.25), 5);
    c.rotation.set(rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5));
    g.add(c);
  }
  return g;
}

function deadTree(rng) {
  const g = new THREE.Group();
  const wood = mat(0x5a4636);
  const trunkH = rng.range(1.6, 2.4);
  g.add(cyl(0.07, 0.13, trunkH, wood, 0, trunkH / 2, 0, 6));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.add(cyl(0.02, 0.05, 0.9, wood, 0, 0.45, 0, 5));
    b.position.y = trunkH * rng.range(0.5, 0.95);
    b.rotation.set(rng.range(-1, 1), rng.range(0, 6), rng.range(0.5, 1.1));
    g.add(b);
  }
  return g;
}

// --- Christophsis ruins ----------------------------------------------------
// The crystal city of the Clone Wars film: faceted pale-blue glass towers on
// silver frames, shattered by the siege.

const GLASS = [0x8fd2e6, 0x7ec0dc, 0xa4dcec];
const FRAME = 0xb8c0cc;
const glassMat = (c) => mat(c, { emissive: 0x2a6f95, emissiveIntensity: 0.35 });

/** Faceted crystal prism, optionally with a sheared (broken) top. */
function crystalPrism(r, h, color, broken, rng) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r * 0.82, r, h, 6, 1);
  if (broken) {
    // shear the top ring so the tower ends in a jagged break
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) - rng.range(0, h * 0.35));
    geo.computeVertexNormals();
  } else {
    g.add(cone(r * 0.82, r * 1.6, glassMat(color), 0, h + r * 0.8, 0, 6)); // crystal spire tip
  }
  const m = new THREE.Mesh(geo, glassMat(color));
  m.position.y = h / 2;
  g.add(m);
  return g;
}

function ruinWall(rng) {
  // shattered crystal facade on a silver plinth
  const g = new THREE.Group();
  g.add(box(3.0, 0.3, 0.6, mat(FRAME), 0, 0.15, 0));
  for (let i = 0; i < 5; i++) {
    const h = rng.chance(0.3) ? rng.range(0.4, 0.9) : rng.range(1.2, 2.6);
    const x = -1.2 + i * 0.6;
    const pane = box(0.55, h, 0.18, glassMat(rng.pick(GLASS)), x, 0.3 + h / 2, 0);
    pane.rotation.z = rng.range(-0.08, 0.08);
    g.add(pane);
    g.add(box(0.06, h + 0.1, 0.24, mat(FRAME), x + 0.29, 0.3 + h / 2, 0)); // mullion
  }
  for (let i = 0; i < 3; i++) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glassMat(rng.pick(GLASS)));
    shard.position.set(rng.range(-1.3, 1.3), 0.1, rng.range(0.35, 0.6));
    shard.rotation.set(rng.range(0, 3), rng.range(0, 3), 1.2);
    g.add(shard);
  }
  return g;
}

function ruinTower(rng) {
  // crystal skyscraper stump: framed glass prism, broken top, smaller
  // crystal spires growing off its shoulders
  const g = new THREE.Group();
  const h = rng.range(4, 6.5);
  g.add(box(2.0, 0.35, 2.0, mat(FRAME), 0, 0.17, 0));
  g.add(crystalPrism(0.95, h, rng.pick(GLASS), true, rng));
  for (let y = 0.9; y < h * 0.6; y += 1.2) g.add(cyl(0.98, 0.98, 0.08, mat(FRAME), 0, y, 0, 6)); // floor bands (below the break)
  for (let i = 0; i < 2; i++) {
    const side = crystalPrism(0.32, rng.range(1.8, 3), rng.pick(GLASS), false, rng);
    const a = rng.range(0, 6.28);
    side.position.set(Math.cos(a) * 0.95, 0.3, Math.sin(a) * 0.95);
    side.rotation.set(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15));
    g.add(side);
  }
  return g;
}

function ruinPillar(rng) {
  // free-standing crystal obelisk on a silver base
  const g = new THREE.Group();
  g.add(cyl(0.42, 0.5, 0.25, mat(FRAME), 0, 0.12, 0, 6));
  g.add(crystalPrism(0.3, rng.range(1.4, 3.0), rng.pick(GLASS), rng.chance(0.4), rng));
  return g;
}

function geoPillar(rng) {
  // Geonosian rock column (for the Geonosis hangar)
  const g = new THREE.Group();
  const geo = lumpy(new THREE.CylinderGeometry(0.32, 0.5, 2.8, 8, 4), rng, 0.12);
  const m = new THREE.Mesh(geo, mat(0xa25a34, { tex: 'rock' }));
  m.position.y = 1.4;
  g.add(m);
  g.add(cyl(0.45, 0.32, 0.4, mat(0x7c4226), 0, 2.9, 0, 8));
  return g;
}

// --- Republic forward base --------------------------------------------------
// Clone Wars prefab garrison: angular grey-white modules with chamfered roofs,
// red Republic markings and the eight-spoked Republic crest.

const REP_WHITE = 0xd9dad6;
const REP_GRAY = 0x8f9499;
const REP_RED = 0xa8292e;

/** Republic crest (eight-spoke cog) facing +X, centred at the origin. */
function crest(size, material, flat = false) {
  const g = new THREE.Group();
  const t = size * 0.14;
  g.add(cylX(size * 0.22, size * 0.22, 0.03, material, 0, 0, 0, 8));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = box(0.03, t * (i % 2 ? 1 : 1.6), size * 0.5, material, 0, Math.sin(a) * size * 0.32, Math.cos(a) * size * 0.32);
    spoke.rotation.x = -a;
    g.add(spoke);
  }
  g.add(cylX(size * 0.5, size * 0.5, 0.02, mat(0x202326), -0.02, 0, 0, 16)); // dark disc behind
  if (flat) g.rotation.z = Math.PI / 2; // lay it on the ground
  return g;
}

/** Garrison module: walls, chamfered roof edges, red band. */
function garrison(w, h, d) {
  const g = new THREE.Group();
  g.add(box(w, h, d, mat(REP_WHITE), 0, h / 2, 0));
  g.add(box(w - 0.6, 0.35, d - 0.6, mat(0xc6c8c4), 0, h + 0.17, 0)); // roof deck
  for (const sz of [-1, 1]) g.add(rot(box(w, 0.25, 0.55, mat(0xc6c8c4), 0, h + 0.05, sz * (d / 2 - 0.2)), sz * 0.55, 0, 0));
  for (const sx of [-1, 1]) g.add(rot(box(0.55, 0.25, d, mat(0xc6c8c4), sx * (w / 2 - 0.2), h + 0.05, 0), 0, 0, -sx * 0.55));
  g.add(box(w + 0.04, 0.22, d + 0.04, mat(REP_RED), 0, h * 0.72, 0));
  g.add(box(w + 0.2, 0.15, d + 0.2, mat(REP_GRAY), 0, 0.075, 0));
  return g;
}

function barracks() {
  const g = garrison(4.2, 2.2, 3.0);
  g.add(box(0.06, 1.6, 1.1, mat(0x30343a), 2.11, 0.8, 0)); // blast door
  g.add(box(0.07, 0.12, 1.2, mat(0xd0a020), 2.12, 1.66, 0));
  for (const z of [-1.0, 1.0]) g.add(box(0.06, 0.35, 0.5, mat(0x9ad6ff, { emissive: 0x2a5d8a }), 2.12, 1.25, z));
  const c = crest(0.9, mat(REP_RED));
  c.rotation.y = -Math.PI / 2;
  c.position.set(0, 1.25, 1.52);
  g.add(c);
  g.add(box(0.5, 0.3, 0.5, mat(REP_GRAY), -1.0, 2.6, 0.4)); // roof vent
  return g;
}

function commandPost() {
  // two-storey tactical command centre with a comm mast and dish
  const g = garrison(4.6, 2.4, 3.6);
  const up = garrison(2.6, 1.3, 2.2);
  up.position.set(-0.6, 2.55, 0);
  g.add(up);
  g.add(box(0.06, 1.6, 1.2, mat(0x30343a), 2.31, 0.8, 0));
  g.add(box(0.06, 0.3, 2.6, mat(0x9ad6ff, { emissive: 0x2a5d8a }), 2.32, 1.8, 0)); // command windows
  const c = crest(1.1, mat(REP_RED));
  c.position.set(0.71, 3.2, 0);
  g.add(c);
  g.add(cyl(0.05, 0.07, 2.6, mat(REP_GRAY), -1.4, 5.0, -0.6, 6));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.5), mat(0xe0e0dc, { side: THREE.DoubleSide }));
  dish.position.set(-0.2, 4.6, 0.6);
  dish.rotation.x = 2.4;
  g.add(dish);
  g.add(sph(0.08, glow(0xff4040), -1.4, 6.35, -0.6, 5, 4));
  return g;
}

function crate(rng) {
  // Republic supply containers: grey, red stripe, stencilled crest
  const g = new THREE.Group();
  const cols = [0xb9bcb8, 0x9ea3a6, 0x7d8388];
  g.add(box(0.85, 0.6, 0.62, mat(rng.pick(cols)), 0, 0.3, 0));
  g.add(box(0.87, 0.1, 0.64, mat(REP_RED), 0, 0.45, 0));
  g.add(box(0.9, 0.06, 0.66, mat(0x4a4f55), 0, 0.03, 0));
  const c = crest(0.28, mat(REP_RED));
  c.position.set(0.43, 0.22, 0);
  g.add(c);
  if (rng.chance(0.6)) {
    g.add(box(0.6, 0.42, 0.5, mat(rng.pick(cols)), rng.range(-0.1, 0.1), 0.81, 0));
    g.add(box(0.62, 0.06, 0.52, mat(0xd0a020), 0, 0.98, 0));
  }
  return g;
}

function barricade() {
  // durasteel barrier with an angled face and Republic red stripe
  const g = new THREE.Group();
  g.add(box(2.0, 0.85, 0.4, mat(REP_GRAY), 0, 0.42, 0));
  g.add(rot(box(2.0, 0.5, 0.25, mat(0xa4a9ad), 0, 0.75, 0.12), -0.45, 0, 0));
  g.add(box(2.02, 0.1, 0.42, mat(REP_RED), 0, 0.55, 0));
  g.add(box(1.9, 0.15, 0.62, mat(0x6e7378), 0, 0.075, 0));
  return g;
}

function sensorTower() {
  // Republic comm/sensor mast: lattice legs, sensor head, twin antennae
  const g = new THREE.Group();
  for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) g.add(strut([x, 0, z], [x * 0.3, 3.4, z * 0.3], 0.07, mat(REP_GRAY)));
  for (const y of [1.0, 2.0, 2.9]) g.add(box(0.5 - y * 0.1, 0.05, 0.5 - y * 0.1, mat(REP_GRAY), 0, y, 0));
  g.add(box(0.7, 0.45, 0.7, mat(REP_WHITE), 0, 3.6, 0));
  g.add(box(0.72, 0.1, 0.72, mat(REP_RED), 0, 3.5, 0));
  for (const z of [-0.25, 0.25]) g.add(cyl(0.035, 0.035, 1.1, mat(0x555a60), 0, 4.35, z, 4));
  g.add(sph(0.08, glow(0x60b0ff), 0, 4.95, 0.25, 5, 4));
  g.add(sph(0.08, glow(0xff5050), 0, 4.95, -0.25, 5, 4));
  return g;
}

function lamp() {
  // twin-head floodlight
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.08, 2.4, mat(REP_GRAY), 0, 1.2, 0, 6));
  g.add(box(0.1, 0.1, 0.6, mat(REP_GRAY), 0, 2.4, 0));
  for (const z of [-0.28, 0.28]) {
    g.add(box(0.3, 0.2, 0.22, mat(0x55595e), 0.08, 2.42, z));
    g.add(box(0.04, 0.14, 0.17, glow(0xfff2c0), 0.24, 2.42, z));
  }
  g.add(box(0.4, 0.1, 0.4, mat(0x6e7378), 0, 0.05, 0));
  return g;
}

function atte() {
  // AT-TE (Episode II / The Clone Wars), parked. Faces +X. Two armoured hulls
  // joined by a concertina section, six legs with the knees above the hull,
  // mass-driver cannon on the roof with an open gunner seat, four
  // anti-personnel lasers around the cockpit and two at the stern.
  const g = new THREE.Group();
  const W = mat(0xcfd0cb);
  const G = mat(0x9a9e9f);
  const D = mat(0x4b5055);
  const K = mat(0x2a2d31);
  const R = mat(0x8e2a2a);
  const body = new THREE.Group();
  body.position.y = 1.3;
  // front hull with a sloped nose and the cockpit window band
  body.add(box(2.2, 1.35, 2.0, W, 1.5, 0.55, 0));
  body.add(box(0.6, 1.0, 1.9, W, 2.75, 0.4, 0));
  // chamfered edges: sloped brow over the cockpit, bevelled roof sides
  body.add(rot(box(0.75, 0.3, 1.9, W, 2.72, 1.0, 0), 0, 0, -0.55));
  for (const z of [-0.95, 0.95]) {
    body.add(rot(box(2.2, 0.25, 0.3, G, 1.5, 1.15, z * 0.92), z * 0.6, 0, 0));
    body.add(rot(box(2.1, 0.22, 0.28, G, -1.45, 1.03, z * 0.9), z * 0.6, 0, 0));
  }
  body.add(box(0.06, 0.18, 1.5, K, 3.06, 0.7, 0)); // cockpit viewports
  body.add(box(0.5, 0.06, 1.95, R, 2.4, 1.23, 0)); // red bow stripe
  // rear hull, slightly lower, with the stern hatch
  body.add(box(2.1, 1.2, 1.9, W, -1.45, 0.5, 0));
  body.add(box(0.06, 0.8, 1.0, D, -2.52, 0.45, 0));
  // concertina joint
  for (let i = 0; i < 4; i++) body.add(box(0.1, 1.0, 1.6, i % 2 ? G : D, -0.25 + i * 0.12, 0.5, 0));
  // belly plates
  body.add(box(4.9, 0.18, 1.7, G, 0.1, -0.15, 0));
  // side detail: vent grilles, access hatches, hand rails, roof hatch
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 4; i++) body.add(box(0.08, 0.35, 0.03, K, 0.9 + i * 0.16, 0.45, sz * 1.01));
    body.add(box(0.7, 0.55, 0.03, G, -1.5, 0.45, sz * 0.96));
    body.add(box(1.6, 0.04, 0.04, D, 1.4, 0.95, sz * 1.03));
    body.add(box(1.5, 0.04, 0.04, D, -1.45, 0.85, sz * 0.98));
  }
  body.add(box(0.5, 0.06, 0.5, G, -1.4, 1.12, 0));
  body.add(cyl(0.03, 0.03, 0.5, D, 2.2, 1.45, 0.6, 5)); // antenna
  // anti-personnel lasers: four around the bow, two at the stern
  for (const [x, y, z, dir] of [[2.9, 1.05, 0.85, 1], [2.9, 1.05, -0.85, 1], [2.95, 0.05, 0.8, 1], [2.95, 0.05, -0.8, 1], [-2.5, 0.95, 0.7, -1], [-2.5, 0.95, -0.7, -1]]) {
    body.add(sph(0.13, D, x, y, z, 6, 4));
    body.add(cylX(0.035, 0.03, 0.45, K, dir > 0 ? x : x - 0.45, y, z, 5));
  }
  // mass-driver cannon on its rail, open gunner seat behind it
  body.add(box(1.8, 0.12, 0.5, D, 0.6, 1.3, 0));
  body.add(box(0.7, 0.45, 0.6, G, 0.5, 1.55, 0));
  body.add(cylX(0.11, 0.09, 2.6, K, 0.8, 1.62, 0, 7));
  body.add(box(0.3, 0.35, 0.35, D, 0.05, 1.5, 0));
  g.add(body);
  // legs: thick armoured thigh from the hull side up to a raised knee, shin
  // splayed out to a broad foot pad
  for (const x of [1.9, 0.0, -1.9]) {
    for (const sz of [-1, 1]) {
      const out = x > 0 ? 0.45 : x < 0 ? -0.45 : 0;
      const hip = [x, 1.6, sz * 0.95];
      const knee = [x + out, 2.75, sz * 1.45];
      const foot = [x + out * 2.6, 0.2, sz * 2.0];
      g.add(strut(hip, knee, 0.34, G));
      g.add(strut(knee, foot, 0.26, W));
      g.add(strut([knee[0], knee[1] - 0.3, knee[2]], [foot[0], 0.9, foot[2] - sz * 0.15], 0.3, W)); // shin armour
      g.add(sph(0.26, D, ...knee, 7, 5));
      g.add(box(0.85, 0.24, 0.7, D, foot[0], 0.12, foot[2]));
    }
  }
  return g;
}

/** Box-section beam between two points (legs, struts). */
function strut(a, b, t, material) {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), material);
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
  return m;
}

function laat() {
  // LAAT/i gunship as flown by the 501st. Faces +X. Hunched cockpit over a
  // chin gunner station, open troop bay with sliding doors, drooping wings
  // with rockets underneath, two ball turrets on arms from the troop cabin,
  // twin mass-driver missile launchers on the spine, tail fin and engines.
  const g = new THREE.Group();
  const W = mat(0xc4c8bd);
  const G = mat(0x8f968c);
  const D = mat(0x3b3f3c);
  const R = mat(0x9e2b2b);
  const B = mat(0x2f5fbf); // 501st blue
  const glass = mat(0x2f6a55, { emissive: 0x0b2a1e });
  const body = new THREE.Group();
  // troop compartment with the open bay and doors slid back
  body.add(box(2.8, 1.15, 1.35, W, -0.4, 0, 0));
  for (const z of [-0.68, 0.68]) {
    body.add(box(1.5, 0.75, 0.04, mat(0x1c1f1e), -0.2, -0.05, z)); // dark open bay
    body.add(box(0.7, 0.8, 0.05, G, -1.2, -0.05, z * 1.04)); // slid-back door
  }
  // nose: chin gunner station, hunched pilot cockpit above and behind it
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.72, 1.5, 4), W);
  nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2);
  nose.position.set(1.7, -0.12, 0);
  body.add(nose);
  body.add(box(0.35, 0.3, 0.55, glass, 2.35, -0.2, 0)); // forward gunner window
  body.add(scl(sph(0.42, W, 1.25, 0.6, 0, 8, 6), 1.3, 0.75, 0.9)); // the hunch
  body.add(box(0.45, 0.22, 0.6, glass, 1.6, 0.68, 0)); // pilot canopy
  body.add(box(0.6, 0.08, 0.9, R, 1.9, 0.18, 0)); // red nose marking
  body.add(box(0.5, 0.06, 1.37, B, 0.6, 0.35, 0)); // 501st band
  for (const z of [-0.18, 0.18]) body.add(cylX(0.03, 0.03, 0.35, D, 2.35, -0.42, z, 5)); // chin lasers
  // wings: high-mounted, drooping, rockets underneath
  for (const sz of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(-0.3, 0.55, sz * 0.6);
    wing.rotation.set(sz * 0.22, sz * 0.12, 0);
    wing.add(box(1.25, 0.1, 2.5, G, 0, 0, sz * 1.25));
    wing.add(box(0.25, 0.12, 2.5, R, 0.55, 0.01, sz * 1.25));
    wing.add(box(0.7, 0.3, 0.3, W, -0.1, -0.05, sz * 2.45)); // wingtip pod
    for (let i = 0; i < 3; i++) wing.add(cylX(0.05, 0.05, 0.6, D, -0.2, -0.12, sz * (0.9 + i * 0.4), 5));
    body.add(wing);
  }
  // ball turrets on short arms from the troop cabin, below the wings
  for (const sz of [-1, 1]) {
    body.add(box(0.15, 0.15, 0.4, D, -0.9, 0.1, sz * 0.82));
    body.add(sph(0.3, mat(0x6b7d74), -0.9, 0.1, sz * 1.12, 8, 6));
    body.add(sph(0.18, glass, -0.75, 0.12, sz * 1.22, 6, 4));
    body.add(cylX(0.03, 0.03, 0.4, D, -0.65, 0.05, sz * 1.15, 5));
  }
  // hull detail: door rails, vents, antenna, landing skids
  for (const z of [-0.69, 0.69]) {
    body.add(box(1.7, 0.04, 0.03, D, -0.3, 0.35, z * 1.01));
    body.add(box(1.7, 0.04, 0.03, D, -0.3, -0.45, z * 1.01));
    for (let i = 0; i < 3; i++) body.add(box(0.05, 0.2, 0.02, D, -1.65 + i * 0.1, 0.15, z * 1.02));
  }
  body.add(cyl(0.02, 0.02, 0.5, D, 0.9, 0.95, 0.3, 4));
  for (const z of [-0.5, 0.5]) body.add(box(1.6, 0.06, 0.08, D, -0.4, -0.62, z));
  // hull detail: door rails, vents, antenna, landing skids
  for (const z of [-0.69, 0.69]) {
    body.add(box(1.7, 0.04, 0.03, D, -0.3, 0.35, z * 1.01));
    body.add(box(1.7, 0.04, 0.03, D, -0.3, -0.45, z * 1.01));
    for (let i = 0; i < 3; i++) body.add(box(0.05, 0.2, 0.02, D, -1.65 + i * 0.1, 0.15, z * 1.02));
  }
  body.add(cyl(0.02, 0.02, 0.5, D, 0.9, 0.95, 0.3, 4));
  for (const z of [-0.5, 0.5]) body.add(box(1.6, 0.06, 0.08, D, -0.4, -0.62, z));
  // twin mass-driver missile launchers on the spine
  for (const z of [-0.25, 0.25]) body.add(box(1.0, 0.25, 0.25, D, -0.6, 0.72, z));
  // rear: raised tail section, fin and engines
  body.add(box(0.9, 0.9, 1.1, W, -2.15, 0.15, 0));
  body.add(box(0.9, 1.0, 0.1, W, -2.25, 1.0, 0));
  body.add(box(0.45, 0.12, 0.12, R, -2.2, 1.42, 0));
  for (const z of [-0.35, 0.35]) body.add(cylX(0.22, 0.26, 0.5, D, -3.0, 0.0, z, 8));
  body.position.y = 1.0;
  g.add(body);
  g.userData.body = body;
  return g;
}

function landingPad() {
  // octagonal landing platform with hazard ring, guide lights and the crest
  const g = new THREE.Group();
  g.add(cyl(3.7, 3.8, 0.12, mat(0x7c8186), 0, 0.06, 0, 8));
  g.add(cyl(3.2, 3.2, 0.13, mat(0x8d9297), 0, 0.065, 0, 8));
  g.add(cyl(3.3, 3.3, 0.125, mat(0xd0a020), 0, 0.062, 0, 8));
  const c = crest(3.0, mat(REP_RED), true);
  c.position.y = 0.15;
  g.add(c);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.add(sph(0.08, glow(0xffd070), Math.cos(a) * 3.45, 0.14, Math.sin(a) * 3.45, 4, 3));
  }
  return g;
}

function tent() {
  // field command station: angled canopy over a holotable showing a hologram
  const g = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.9, 6, 1, true), mat(0x9fa4a6, { side: THREE.DoubleSide }));
  roof.position.y = 2.2;
  g.add(roof);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(cyl(0.04, 0.04, 1.8, mat(REP_GRAY), Math.cos(a) * 1.75, 0.9, Math.sin(a) * 1.75, 4));
  }
  g.add(cyl(0.7, 0.8, 0.75, mat(0x3d4247), 0, 0.37, 0, 12)); // holotable
  g.add(cyl(0.62, 0.62, 0.04, glow(0x6ab8ff), 0, 0.77, 0, 12));
  const holo = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glow(0x8fd0ff, { transparent: true, opacity: 0.55 }));
  holo.position.y = 1.2;
  g.add(holo);
  return g;
}

// --- Separatist -------------------------------------------------------------
// Confederacy gear in Trade Federation tan and slate blue with the CIS
// hexagonal emblem; red sensor lights.

const SEP_TAN = 0xa58f68;
const SEP_DARK = 0x4a4550;
const SEP_BLUE = 0x3e4f7a;

/** CIS emblem: blue hexagon with a white hub and six spokes, facing +X. */
function cisEmblem(size) {
  const g = new THREE.Group();
  g.add(cylX(size * 0.5, size * 0.5, 0.03, mat(0x2f4f9a), 0, 0, 0, 6));
  g.add(cylX(size * 0.14, size * 0.14, 0.04, mat(0xe8e8e8), 0.01, 0, 0, 6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = box(0.04, size * 0.07, size * 0.36, mat(0xe8e8e8), 0.01, Math.sin(a) * size * 0.27, Math.cos(a) * size * 0.27);
    sp.rotation.x = -a;
    g.add(sp);
  }
  return g;
}

function sepCrate(rng) {
  const g = new THREE.Group();
  g.add(box(0.9, 0.7, 0.9, mat(SEP_BLUE), 0, 0.35, 0));
  g.add(box(0.92, 0.14, 0.92, mat(SEP_TAN), 0, 0.62, 0));
  g.add(box(0.94, 0.08, 0.94, mat(SEP_DARK), 0, 0.04, 0));
  const e = cisEmblem(0.4);
  e.position.set(0.46, 0.32, 0);
  g.add(e);
  g.add(sph(0.05, glow(0xff5030), 0.46, 0.55, 0.35, 4, 3));
  if (rng.chance(0.5)) g.add(box(0.7, 0.5, 0.7, mat(SEP_TAN), 0.1, 0.95, 0));
  return g;
}

function sepBarrier() {
  // ray-shield barrier: two pylons with a red energy field between them
  const g = new THREE.Group();
  for (const z of [-0.95, 0.95]) {
    g.add(box(0.4, 1.4, 0.35, mat(SEP_TAN), 0, 0.7, z));
    g.add(box(0.45, 0.2, 0.4, mat(SEP_DARK), 0, 1.45, z));
    g.add(box(0.1, 1.1, 0.06, glow(0xff6050), 0, 0.75, z * 0.86));
  }
  g.add(box(0.06, 1.1, 1.6, glow(0xff4a3a, { transparent: true, opacity: 0.4 }), 0, 0.75, 0));
  g.add(box(0.5, 0.15, 2.2, mat(SEP_DARK), 0, 0.075, 0));
  return g;
}

function sepTower() {
  // droid sentry / comm tower: tapered tan pylon, dark sensor pod, antenna
  const g = new THREE.Group();
  g.add(cone(0.9, 0.6, mat(SEP_DARK), 0, 0.3, 0, 6));
  g.add(cyl(0.18, 0.42, 4.2, mat(SEP_TAN), 0, 2.4, 0, 6));
  g.add(cyl(0.5, 0.35, 0.5, mat(SEP_DARK), 0, 4.5, 0, 6));
  g.add(cyl(0.62, 0.62, 0.12, mat(SEP_BLUE), 0, 4.78, 0, 6));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(box(0.06, 0.1, 0.06, glow(0xff3020), Math.cos(a) * 0.5, 4.5, Math.sin(a) * 0.5));
  }
  g.add(cyl(0.04, 0.04, 1.2, mat(0x333333), 0, 5.4, 0, 4));
  g.add(sph(0.1, glow(0xff3020), 0, 6.0, 0, 5, 4));
  const e = cisEmblem(0.6);
  e.position.set(0.36, 2.4, 0);
  e.rotation.z = 0.08;
  g.add(e);
  return g;
}

function droidFactory() {
  // Geonosian droid foundry (Episode II): a cluster of organic red-rock
  // spires on a walled mound, oval vents glowing with the furnaces inside.
  const rng = new RNG(4242);
  const g = new THREE.Group();
  const rock = [0xa65b35, 0x9a5230, 0xb3683e];
  const dark = mat(0x22150f);
  const fire = glow(0xff8a3a);
  const mound = new THREE.Mesh(lumpy(new THREE.CylinderGeometry(4.2, 5.3, 2.2, 12, 2), rng, 0.06), mat(0x8e4c2c, { tex: 'rock' }));
  mound.position.y = 1.1;
  g.add(mound);
  const spire = (x, z, r, h) => {
    const s = new THREE.Group();
    // stacked, slightly bulging segments like Geonosian termite towers
    let y = 0;
    let rr = r;
    for (let i = 0; i < 4; i++) {
      const sh = h / 4;
      const m = new THREE.Mesh(lumpy(new THREE.CylinderGeometry(rr * 0.78, rr, sh, 9, 2), rng, 0.08), mat(rng.pick(rock), { tex: 'rock' }));
      m.position.y = y + sh / 2;
      s.add(m);
      y += sh;
      rr *= 0.78;
    }
    s.add(cone(rr, h * 0.12, mat(rng.pick(rock)), 0, y + h * 0.06, 0, 8));
    // oval openings up the spire
    for (let k = 0; k < 3; k++) {
      const oy = h * (0.25 + k * 0.22);
      const rad = r * (1 - (oy / h) * 0.75);
      const a = rng.range(0, 6.28);
      const o = scl(sph(0.22, k === 0 ? fire : dark, Math.cos(a) * rad, oy, Math.sin(a) * rad, 6, 4), 0.5, 1.3, 1);
      o.rotation.y = -a;
      s.add(o);
    }
    s.position.set(x, 2.0, z);
    g.add(s);
  };
  spire(0, 0, 2.0, 8.5);
  spire(2.6, 1.6, 1.0, 4.5);
  spire(-2.4, 2.0, 1.1, 5.2);
  spire(-1.8, -2.6, 0.9, 4.0);
  spire(2.2, -2.4, 0.8, 3.4);
  // foundry gate facing the road (+X) with molten glow
  g.add(scl(sph(1.2, dark, 4.6, 1.0, 0, 8, 6), 0.4, 1.0, 1.2));
  g.add(box(0.1, 0.5, 1.6, fire, 4.95, 0.35, 0));
  // smoke stacks
  for (const [x, z] of [[3.2, -0.6], [-0.4, 3.4]]) {
    g.add(cyl(0.25, 0.3, 2.4, mat(0x5a3020), x, 3.3, z, 7));
    g.add(cyl(0.2, 0.2, 0.05, fire, x, 4.52, z, 7));
  }
  return g;
}

function aatWreck(rng) {
  // Trade Federation AAT hover tank, knocked out. Split prow with the
  // projectile launchers between the two forward hull "jaws", lateral
  // lasers on the jaws, domed turret with the long heavy laser cannon.
  const g = new THREE.Group();
  const T = mat(0x9a8763);
  const Td = mat(0x6e6048);
  const D = mat(0x34312f);
  const burnt = mat(0x2a2522);
  const body = new THREE.Group();
  body.add(box(2.6, 0.75, 2.5, T, -0.3, 0.55, 0)); // main hull
  body.add(box(2.4, 0.3, 2.2, Td, -0.4, 1.05, 0)); // upper deck
  for (const sz of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 1.6, 4), T);
    jaw.rotation.set(Math.PI / 4, 0, -Math.PI / 2);
    jaw.position.set(1.65, 0.5, sz * 0.75);
    body.add(jaw);
    body.add(cylX(0.06, 0.05, 0.7, D, 1.7, 0.85, sz * 0.75, 5)); // lateral laser
  }
  body.add(box(0.6, 0.5, 0.8, D, 1.2, 0.45, 0)); // launcher bay between the jaws
  for (const z of [-0.22, 0, 0.22]) body.add(cylX(0.08, 0.08, 0.35, mat(0x1c1a19), 1.4, 0.45, z, 6));
  const turret = scl(sph(0.7, Td, -0.6, 1.3, 0, 9, 5), 1.25, 0.55, 1.0);
  body.add(turret);
  body.add(cylX(0.1, 0.08, 2.6, D, -0.2, 1.4, 0, 7)); // heavy laser cannon
  body.add(box(0.6, 0.5, 2.0, D, -1.75, 0.6, 0)); // engine block
  // scorch marks and a blown-open hatch
  body.add(box(0.9, 0.05, 0.8, burnt, -0.2, 1.21, 0.5));
  body.add(box(0.5, 0.06, 0.5, burnt, 0.6, 0.94, -0.7));
  body.rotation.set(rng.range(-0.15, 0.15), rng.range(0, 3), rng.range(-0.2, 0.1));
  g.add(body);
  return g;
}

function droidDebris(rng) {
  const g = new THREE.Group();
  const T = mat(0xb39f74);
  for (let i = 0; i < 5; i++) {
    const p = rng.chance(0.5)
      ? cyl(0.025, 0.025, rng.range(0.25, 0.45), T, 0, 0.03, 0, 4)
      : box(rng.range(0.1, 0.22), 0.08, rng.range(0.1, 0.2), T, 0, 0.04, 0);
    p.position.x = rng.range(-0.5, 0.5);
    p.position.z = rng.range(-0.5, 0.5);
    p.rotation.set(Math.PI / 2, rng.range(0, 3), rng.range(0, 3));
    g.add(p);
  }
  const head = rot(cylX(0.05, 0.03, 0.26, T, 0, 0.05, 0, 6), 0, rng.range(0, 3), 0);
  g.add(head);
  return g;
}

function cliff(rng) {
  // Map-edge rock wall chunk.
  const g = new THREE.Group();
  const cols = [0x4f4a46, 0x5a5450, 0x46423f];
  for (let i = 0; i < 6; i++) {
    const m = rockMesh(rng, rng.range(0.8, 1.4), rng.pick(cols));
    m.position.x = rng.range(-0.8, 0.8);
    m.position.z = rng.range(-0.8, 0.8);
    m.scale.y *= rng.range(1.6, 3.0);
    m.position.y = m.scale.y * 0.5;
    g.add(m);
  }
  return g;
}

// --- Pickups ----------------------------------------------------------------

function bacta() {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.09, 0.32, mat(0xe8e8e8), 0, 0.16, 0, 8));
  g.add(cyl(0.07, 0.07, 0.2, glow(0xff5a5a), 0, 0.17, 0, 8));
  g.add(cyl(0.1, 0.1, 0.05, mat(0x888888), 0, 0.33, 0, 8));
  return g;
}

function forceShard() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), glow(0x7fd8ff));
  m.scale.y = 1.8;
  m.position.y = 0.3;
  g.add(m);
  return g;
}

function holocron() {
  const g = new THREE.Group();
  const m = box(0.22, 0.22, 0.22, mat(0x8fd0ff, { emissive: 0x3a7fd0 }), 0, 0.3, 0);
  m.rotation.set(0.6, 0.6, 0);
  g.add(m);
  return g;
}

// ----------------------------------------------------------------------------
// Registry. `block` is a collision radius in tiles (0 = walkable), `rect` a
// rectangular footprint [w, h] in tiles; `light` = [r, g, b, radiusPx, heightZ].

export const PROPS = {
  rock: { build: rock, variants: 8, block: 0.5 },
  boulder: { build: boulder, variants: 5, block: 1.2 },
  cliff: { build: cliff, variants: 6, block: 1.4 },
  crystal: { build: crystal, variants: 8, block: 0.5, light: [90, 200, 255, 46, 0.8] },
  crystalSpire: { build: crystalSpire, variants: 3, block: 0.7, light: [110, 210, 255, 80, 2] },
  scrub: { build: scrub, variants: 6, block: 0 },
  deadTree: { build: deadTree, variants: 4, block: 0.3 },
  ruinWall: { build: ruinWall, variants: 5, angles: [0, Math.PI / 2], rectByAngle: [[3, 1], [1, 3]] },
  ruinTower: { build: ruinTower, variants: 4, rect: [2, 2], light: [110, 200, 255, 60, 2.5] },
  ruinPillar: { build: ruinPillar, variants: 4, block: 0.4, light: [110, 200, 255, 36, 1.5] },
  geoPillar: { build: geoPillar, variants: 3, block: 0.4 },
  barracks: { build: barracks, variants: 1, angles: [0, Math.PI / 2], rectByAngle: [[5, 4], [4, 5]] },
  commandPost: { build: commandPost, variants: 1, rect: [5, 4], light: [255, 80, 70, 30, 5.5] },
  crate: { build: crate, variants: 5, block: 0.5 },
  barricade: { build: barricade, variants: 1, angles: [0, Math.PI / 2], rectByAngle: [[2, 1], [1, 2]] },
  sensorTower: { build: sensorTower, variants: 1, block: 0.5, light: [110, 170, 255, 40, 4] },
  lamp: { build: lamp, variants: 1, block: 0.3, light: [255, 230, 170, 110, 2.3] },
  atte: { build: atte, variants: 1, angles: [0], rect: [6, 6] },
  laat: { build: laat, variants: 1, angles: [0], rect: [4, 4] },
  landingPad: { build: landingPad, variants: 1, flat: true, light: [255, 210, 120, 120, 0.2] },
  tent: { build: tent, variants: 1, rect: [3, 3], light: [110, 180, 255, 50, 1] },
  sepCrate: { build: sepCrate, variants: 4, block: 0.6, light: [255, 90, 50, 22, 0.6] },
  sepBarrier: { build: sepBarrier, variants: 1, angles: [0, Math.PI / 2], rectByAngle: [[1, 2], [2, 1]] },
  sepTower: { build: sepTower, variants: 1, block: 0.7, light: [255, 60, 40, 60, 6] },
  droidFactory: { build: droidFactory, variants: 1, rect: [10, 10], light: [255, 120, 50, 160, 3] },
  aatWreck: { build: aatWreck, variants: 3, rect: [3, 3] },
  droidDebris: { build: droidDebris, variants: 5, block: 0, flat: true },
  bacta: { build: bacta, variants: 1, block: 0, outline: true },
  forceShard: { build: forceShard, variants: 1, block: 0 },
  holocron: { build: holocron, variants: 1, block: 0 },
};

export function buildPropVariants(name) {
  const def = PROPS[name];
  const out = [];
  for (let v = 0; v < def.variants; v++) {
    const rng = new RNG(1000 + v * 77 + name.length * 13);
    out.push(def.build(rng));
  }
  return out;
}

export { laat as buildLaat };
