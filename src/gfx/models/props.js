// Static world props (pre-rendered once at load). Each entry describes how to
// build the model, how many random variants to bake, collision footprint and
// optional light emission.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../../core/math.js';
import { mat, glow, box, cyl, cylX, sph, cone, rot } from './parts.js';

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
  const geo = lumpy(new THREE.DodecahedronGeometry(r, 1), rng, 0.28);
  const m = new THREE.Mesh(geo, mat(color));
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

const STONE = [0x9aa3b0, 0x8a93a2, 0xa8afba];

function ruinWall(rng) {
  const g = new THREE.Group();
  const len = 3;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const h = rng.chance(0.25) ? rng.range(0.2, 0.6) : rng.range(1.0, 2.6);
    g.add(box(len / segs + 0.01, h, 0.35, mat(rng.pick(STONE)), -len / 2 + (i + 0.5) * (len / segs), h / 2, 0));
  }
  g.add(box(len, 0.15, 0.45, mat(0x7b8290), 0, 0.075, 0));
  for (let i = 0; i < 3; i++) {
    const r = rockMesh(rng, rng.range(0.12, 0.25), rng.pick(STONE));
    r.position.set(rng.range(-1.4, 1.4), 0.1, rng.range(0.3, 0.6));
    g.add(r);
  }
  return g;
}

function ruinTower(rng) {
  const g = new THREE.Group();
  const h = rng.range(3.5, 6);
  const c = rng.pick(STONE);
  g.add(box(1.8, h, 1.8, mat(c), 0, h / 2, 0));
  g.add(box(2.0, 0.3, 2.0, mat(0x7b8290), 0, 0.15, 0));
  // window slits
  for (let y = 1; y < h - 0.5; y += 1.1) {
    g.add(box(0.05, 0.6, 0.3, mat(0x2d3340), 0.91, y, 0));
    g.add(box(0.3, 0.6, 0.05, mat(0x2d3340), 0, y, 0.91));
  }
  // broken jagged top
  for (let i = 0; i < 4; i++) {
    const bh = rng.range(0.2, 1.1);
    g.add(box(0.9, bh, 0.9, mat(c), (i % 2 ? 0.45 : -0.45), h + bh / 2, (i < 2 ? 0.45 : -0.45)));
  }
  // embedded crystal
  if (rng.chance(0.6)) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(0x9fe8ff, { emissive: 0x2a7ec9, emissiveIntensity: 0.6 }));
    m.scale.set(0.25, 0.9, 0.25);
    m.position.set(0.9, h * 0.5, 0.5);
    m.rotation.z = -0.6;
    g.add(m);
  }
  return g;
}

function ruinPillar(rng) {
  const g = new THREE.Group();
  const h = rng.range(1.2, 3.2);
  g.add(cyl(0.28, 0.32, h, mat(rng.pick(STONE)), 0, h / 2, 0, 8));
  g.add(box(0.8, 0.2, 0.8, mat(0x7b8290), 0, 0.1, 0));
  if (h > 2.5) g.add(box(0.75, 0.2, 0.75, mat(rng.pick(STONE)), 0, h + 0.1, 0));
  return g;
}

// --- Republic forward base --------------------------------------------------

const REP_WHITE = 0xd9dad6;
const REP_GRAY = 0x8f9499;
const REP_RED = 0xa8292e;

function barracks() {
  const g = new THREE.Group();
  g.add(box(4.2, 2.2, 3.0, mat(REP_WHITE), 0, 1.1, 0));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.3, 10, 1, false, 0, Math.PI), mat(0xc4c6c2));
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 2.2;
  roof.scale.set(0.45, 1, 1);
  g.add(roof);
  g.add(box(4.25, 0.25, 3.05, mat(REP_RED), 0, 1.75, 0));
  g.add(box(0.05, 1.5, 1.0, mat(0x3a3d42), 2.11, 0.75, 0));
  g.add(box(0.06, 0.4, 0.6, mat(0x9ad6ff, { emissive: 0x2a5d8a }), 2.12, 1.7, -1.0));
  g.add(box(0.06, 0.4, 0.6, mat(0x9ad6ff, { emissive: 0x2a5d8a }), 2.12, 1.7, 1.0));
  g.add(box(4.4, 0.15, 3.2, mat(REP_GRAY), 0, 0.075, 0));
  return g;
}

function commandPost() {
  const g = barracks();
  g.scale.set(1.15, 1.1, 1.15);
  const w = new THREE.Group();
  w.add(g);
  w.add(cyl(0.05, 0.07, 3.0, mat(REP_GRAY), -1.2, 4.0, -0.8, 6));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.5), mat(0xe0e0dc, { side: THREE.DoubleSide }));
  dish.position.set(-1.2, 5.3, -0.8);
  dish.rotation.x = 2.4;
  w.add(dish);
  w.add(sph(0.08, glow(0xff4040), -1.2, 5.55, -0.8, 5, 4));
  return w;
}

function crate(rng) {
  const g = new THREE.Group();
  const cols = [0x6d7356, 0x7d7f78, 0x5b6170];
  const c = rng.pick(cols);
  g.add(box(0.8, 0.6, 0.6, mat(c), 0, 0.3, 0));
  g.add(box(0.82, 0.08, 0.62, mat(0x3f4246), 0, 0.5, 0));
  if (rng.chance(0.6)) g.add(box(0.6, 0.45, 0.5, mat(rng.pick(cols)), rng.range(-0.1, 0.1), 0.82, 0));
  g.add(box(0.04, 0.12, 0.2, mat(0xd9b030), 0.41, 0.3, 0));
  return g;
}

function barricade() {
  const g = new THREE.Group();
  g.add(box(2.0, 0.9, 0.45, mat(REP_GRAY), 0, 0.45, 0));
  g.add(box(2.02, 0.15, 0.47, mat(0xd0a020), 0, 0.75, 0));
  g.add(box(1.9, 0.15, 0.6, mat(0x6e7378), 0, 0.075, 0));
  return g;
}

function sensorTower() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.2, 3.6, mat(REP_GRAY), 0, 1.8, 0, 6));
  g.add(box(0.7, 0.4, 0.7, mat(REP_WHITE), 0, 3.6, 0));
  g.add(box(1.2, 0.08, 0.08, mat(REP_GRAY), 0, 3.95, 0));
  g.add(sph(0.08, glow(0x60b0ff), 0.6, 3.95, 0, 5, 4));
  g.add(sph(0.08, glow(0x60b0ff), -0.6, 3.95, 0, 5, 4));
  g.add(box(0.8, 0.2, 0.8, mat(0x6e7378), 0, 0.1, 0));
  return g;
}

function lamp() {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.08, 2.4, mat(REP_GRAY), 0, 1.2, 0, 6));
  g.add(box(0.35, 0.12, 0.25, mat(0x55595e), 0.12, 2.4, 0));
  g.add(box(0.25, 0.04, 0.18, glow(0xfff2c0), 0.15, 2.33, 0));
  g.add(box(0.4, 0.1, 0.4, mat(0x6e7378), 0, 0.05, 0));
  return g;
}

function atte() {
  // All Terrain Tactical Enforcer, parked. Model faces +X.
  const g = new THREE.Group();
  const W = mat(0xc9cac6);
  const G = mat(0x8b9096);
  const D = mat(0x4d5257);
  const body = new THREE.Group();
  body.position.y = 2.2;
  body.add(box(3.0, 1.3, 1.9, W, -0.6, 0, 0));
  body.add(box(1.6, 1.1, 1.6, W, 1.6, 0.05, 0));
  body.add(box(0.8, 0.8, 1.3, W, 2.7, -0.05, 0));
  body.add(box(0.1, 0.25, 1.0, mat(0x223344), 3.12, 0.15, 0));
  body.add(box(0.6, 0.5, 0.6, G, 0.2, 0.9, 0));
  body.add(cylX(0.08, 0.06, 2.0, D, 0.4, 1.0, 0, 6));
  body.add(box(3.05, 0.2, 1.95, mat(0x9b3a34), -0.6, -0.35, 0));
  for (const z of [-0.98, 0.98]) body.add(box(3.6, 0.12, 0.05, D, 0.4, 0.3, z));
  g.add(body);
  for (const x of [-1.6, -0.4, 0.8]) {
    for (const z of [-1.1, 1.1]) {
      const leg = new THREE.Group();
      leg.position.set(x, 2.0, z);
      const upper = box(0.35, 1.3, 0.3, G, 0.25, -0.2, 0);
      upper.rotation.z = -0.6;
      leg.add(upper);
      leg.add(box(0.3, 1.6, 0.28, W, 0.55, -1.25, 0));
      leg.add(box(0.7, 0.2, 0.55, D, 0.55, -2.0, 0));
      g.add(leg);
    }
  }
  return g;
}

function laat() {
  // LAAT/i gunship (simplified). Faces +X. Used parked and for air strikes.
  const g = new THREE.Group();
  const W = mat(0xc9ccc4);
  const G = mat(0x8d958c);
  const D = mat(0x3a3d42);
  const R = mat(REP_RED);
  const glass = mat(0x3a5a4a, { emissive: 0x0a1a12 });
  const body = new THREE.Group();
  // fuselage + tapered nose with cockpit
  body.add(box(3.4, 1.1, 1.3, W, -0.2, 0, 0));
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.68, 1.6, 4), W);
  nose.rotation.z = -Math.PI / 2;
  nose.rotation.x = Math.PI / 4;
  nose.position.set(2.3, -0.05, 0);
  body.add(nose);
  body.add(box(0.9, 0.35, 0.7, glass, 2.0, 0.45, 0));
  body.add(box(0.5, 0.25, 0.5, glass, 2.7, 0.2, 0));
  body.add(box(0.5, 0.06, 1.32, R, 1.3, 0.3, 0));
  // troop doors
  body.add(box(1.4, 0.8, 0.04, D, -0.3, -0.05, 0.66));
  body.add(box(1.4, 0.8, 0.04, D, -0.3, -0.05, -0.66));
  // swept wings with red leading edge and missile pods
  for (const sz of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(-0.2, 0.45, sz * 0.6);
    wing.rotation.y = sz * 0.35;
    wing.rotation.x = sz * 0.08;
    wing.add(box(1.5, 0.1, 2.6, G, 0, 0, sz * 1.3));
    wing.add(box(0.25, 0.12, 2.6, R, 0.7, 0.02, sz * 1.3));
    wing.add(box(1.0, 0.25, 0.25, D, 0.1, -0.15, sz * 2.5));
    wing.add(sph(0.22, W, -0.2, 0.2, sz * 1.0, 6, 4));
    body.add(wing);
  }
  // ball turrets on the sides
  for (const z of [-0.7, 0.7]) body.add(sph(0.22, mat(0x6a7a72), 0.6, 0.35, z, 6, 4));
  // tail fin and rear engines
  body.add(box(1.0, 1.0, 0.1, W, -1.7, 0.85, 0));
  body.add(box(0.5, 0.12, 0.08, R, -1.6, 1.25, 0));
  body.add(box(0.5, 0.4, 0.5, D, -2.05, 0.1, 0.35));
  body.add(box(0.5, 0.4, 0.5, D, -2.05, 0.1, -0.35));
  body.position.y = 1.0;
  g.add(body);
  g.userData.body = body;
  return g;
}

function landingPad() {
  const g = new THREE.Group();
  g.add(cyl(3.6, 3.7, 0.12, mat(0x7c8186), 0, 0.06, 0, 16));
  g.add(cyl(3.0, 3.0, 0.13, mat(0x8d9297), 0, 0.065, 0, 16));
  g.add(box(3.0, 0.14, 0.25, mat(0xd0a020), 0, 0.07, 0));
  g.add(box(0.25, 0.14, 3.0, mat(0xd0a020), 0, 0.07, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(sph(0.08, glow(0xffd070), Math.cos(a) * 3.4, 0.14, Math.sin(a) * 3.4, 4, 3));
  }
  return g;
}

function tent() {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.4, 4, 1, true), mat(0x6b704e, { side: THREE.DoubleSide }));
  roof.position.y = 2.1;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  for (const [x, z] of [[1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]]) g.add(cyl(0.04, 0.04, 1.5, mat(REP_GRAY), x, 0.75, z, 4));
  g.add(box(1.4, 0.8, 0.7, mat(0x55595e), 0, 0.4, 0));
  g.add(box(1.0, 0.05, 0.5, glow(0x6ab8ff), 0, 0.83, 0));
  return g;
}

// --- Separatist -------------------------------------------------------------

const SEP_TAN = 0xa58f68;
const SEP_DARK = 0x4a4550;
const SEP_BLUE = 0x3e4f7a;

function sepCrate(rng) {
  const g = new THREE.Group();
  g.add(box(0.9, 0.7, 0.9, mat(SEP_DARK), 0, 0.35, 0));
  g.add(box(0.7, 0.72, 0.15, mat(SEP_TAN), 0, 0.36, 0.38));
  g.add(sph(0.06, glow(0xff5030), 0.46, 0.55, 0, 4, 3));
  if (rng.chance(0.5)) g.add(box(0.7, 0.5, 0.7, mat(SEP_TAN), 0.1, 0.95, 0));
  return g;
}

function sepBarrier() {
  const g = new THREE.Group();
  g.add(box(0.35, 1.2, 2.2, mat(SEP_TAN), 0, 0.6, 0));
  g.add(box(0.4, 0.2, 2.25, mat(SEP_DARK), 0, 1.15, 0));
  g.add(box(0.4, 0.4, 0.4, mat(SEP_BLUE), 0, 0.6, 0.9));
  g.add(box(0.4, 0.4, 0.4, mat(SEP_BLUE), 0, 0.6, -0.9));
  return g;
}

function sepTower() {
  const g = new THREE.Group();
  g.add(cyl(0.15, 0.4, 4.5, mat(SEP_TAN), 0, 2.25, 0, 6));
  g.add(sph(0.55, mat(SEP_DARK), 0, 4.6, 0, 8, 6));
  g.add(cyl(0.02, 0.02, 1.2, mat(0x333333), 0, 5.5, 0, 4));
  g.add(sph(0.1, glow(0xff3020), 0, 6.1, 0, 5, 4));
  g.add(cone(0.9, 0.6, mat(SEP_DARK), 0, 0.3, 0, 6));
  return g;
}

function droidFactory() {
  const g = new THREE.Group();
  g.add(cyl(4.5, 5.2, 3.2, mat(SEP_TAN), 0, 1.6, 0, 8));
  g.add(cyl(3.5, 4.5, 1.6, mat(0x8f7b58), 0, 4.0, 0, 8));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(SEP_DARK));
  dome.position.y = 4.8;
  g.add(dome);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(box(0.6, 3.6, 0.6, mat(0x7b6a4c), Math.cos(a) * 5, 1.8, Math.sin(a) * 5));
    g.add(sph(0.12, glow(0xff5030), Math.cos(a) * 5.35, 3.0, Math.sin(a) * 5.35, 4, 3));
  }
  g.add(box(0.2, 2.2, 2.6, mat(0x1d1b22), 5.05, 1.1, 0)); // hangar door
  g.add(cyl(0.05, 0.05, 2.5, mat(0x333333), 0, 9.0, 0, 4));
  g.add(sph(0.18, glow(0xff3020), 0, 10.3, 0, 5, 4));
  return g;
}

function aatWreck(rng) {
  const g = new THREE.Group();
  const T = mat(0x8c7a5c);
  const D = mat(0x3d3a3a);
  const body = new THREE.Group();
  body.add(box(3.4, 0.8, 2.4, T, 0, 0.5, 0));
  body.add(box(1.6, 0.6, 2.0, T, 1.8, 0.35, 0));
  body.add(box(1.4, 0.6, 1.4, D, -0.2, 1.15, 0));
  body.add(cylX(0.1, 0.08, 2.4, D, 0.3, 1.25, 0, 6));
  body.add(box(0.8, 0.3, 0.5, mat(0x2b2b2b), 1.2, 0.95, 0.4));
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
  ruinTower: { build: ruinTower, variants: 4, rect: [2, 2], light: null },
  ruinPillar: { build: ruinPillar, variants: 4, block: 0.4 },
  barracks: { build: barracks, variants: 1, angles: [0, Math.PI / 2], rectByAngle: [[5, 4], [4, 5]] },
  commandPost: { build: commandPost, variants: 1, rect: [5, 4], light: [255, 80, 70, 30, 5.5] },
  crate: { build: crate, variants: 5, block: 0.5 },
  barricade: { build: barricade, variants: 1, angles: [0, Math.PI / 2], rectByAngle: [[2, 1], [1, 2]] },
  sensorTower: { build: sensorTower, variants: 1, block: 0.5, light: [110, 170, 255, 40, 4] },
  lamp: { build: lamp, variants: 1, block: 0.3, light: [255, 230, 170, 110, 2.3] },
  atte: { build: atte, variants: 1, angles: [Math.PI / 4], rect: [6, 6] },
  laat: { build: laat, variants: 1, angles: [-Math.PI / 4], rect: [4, 4] },
  landingPad: { build: landingPad, variants: 1, flat: true, light: [255, 210, 120, 120, 0.2] },
  tent: { build: tent, variants: 1, rect: [3, 3], light: [110, 180, 255, 50, 1] },
  sepCrate: { build: sepCrate, variants: 4, block: 0.6, light: [255, 90, 50, 22, 0.6] },
  sepBarrier: { build: sepBarrier, variants: 1, angles: [0, Math.PI / 2], rectByAngle: [[1, 2], [2, 1]] },
  sepTower: { build: sepTower, variants: 1, block: 0.7, light: [255, 60, 40, 60, 6] },
  droidFactory: { build: droidFactory, variants: 1, rect: [10, 10], light: [255, 90, 50, 150, 3] },
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
