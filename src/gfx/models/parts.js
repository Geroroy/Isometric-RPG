// Low-poly primitive helpers. Everything is flat shaded so the baked sprites
// get the faceted, pre-rendered look of late-90s RTS / ARPG art.
import * as THREE from 'three';

const cache = new Map();

export function mat(color, opts = {}) {
  const key = `l:${color}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return cache.get(key);
}

/** Unlit material for glowing parts (saber blades, lights, eyes). */
export function glow(color, opts = {}) {
  const key = `b:${color}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
  return cache.get(key);
}

function place(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}

export function box(w, h, d, material, x, y, z) {
  return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), x, y, z);
}

/** Vertical cylinder (along Y). */
export function cyl(rTop, rBot, h, material, x, y, z, seg = 8) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material), x, y, z);
}

/** Cylinder lying along +X, starting at x0. */
export function cylX(r0, r1, len, material, x0 = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), material);
  m.rotation.z = -Math.PI / 2;
  m.position.set(x0 + len / 2, y, z);
  return m;
}

export function sph(r, material, x, y, z, ws = 8, hs = 6) {
  return place(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), material), x, y, z);
}

export function cone(r, h, material, x, y, z, seg = 6) {
  return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material), x, y, z);
}

export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

export function at(obj, x = 0, y = 0, z = 0) {
  obj.position.set(x, y, z);
  return obj;
}

export function rot(obj, x = 0, y = 0, z = 0) {
  obj.rotation.set(x, y, z);
  return obj;
}

export function scl(obj, x = 1, y = x, z = x) {
  obj.scale.set(x, y, z);
  return obj;
}

/** Marker used by the baker to record 2D positions (e.g. saber base / tip). */
export function marker(name, x = 0, y = 0, z = 0) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

/** Open cylinder sector (skirts, tabards, curved plates). theta 0 = +Z, π/2 = +X. */
export function sector(rTop, rBot, h, t0, t1, material, x = 0, y = 0, z = 0, seg = 6) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true, t0, t1 - t0);
  return place(new THREE.Mesh(geo, material), x, y, z);
}

/** Two-sided variant of `mat` for thin cloth. */
export function cloth(color) {
  return mat(color, { side: THREE.DoubleSide });
}
