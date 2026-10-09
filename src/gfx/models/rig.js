// Generic humanoid skeleton made of nested THREE.Groups. Character modules
// attach meshes to the joints; animation modules produce "poses" (joint ->
// [rx, ry, rz]) that are applied before each baked frame is rendered.
//
// Conventions (model faces +X, up is +Y, its right hand side is +Z):
//   shoulder/hip  rz > 0 swings the limb forward
//   elbow         rz > 0 bends the forearm forward/up
//   knee          rz < 0 bends the shin backward
//   shoulderR rx < 0 / shoulderL rx > 0 raises the arm out sideways
//   spine/chest   ry > 0 twists towards the model's left, rz < 0 leans forward
import * as THREE from 'three';

export const DEFAULT_DIMS = {
  hip: 0.98,
  thigh: 0.45,
  shin: 0.45,
  hipW: 0.1,
  spine: 0.24,
  chest: 0.32,
  shW: 0.21,
  shY: 0.27,
  uarm: 0.3,
  farm: 0.27,
  neck: 0.06,
};

const JOINTS = [
  'body', 'pelvis', 'spine', 'chest', 'neck', 'head',
  'shL', 'elL', 'haL', 'wpnL', 'shR', 'elR', 'haR', 'wpn',
  'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR',
];

export class Rig {
  constructor(dims = {}) {
    const d = (this.dims = { ...DEFAULT_DIMS, ...dims });
    this.root = new THREE.Group();
    const j = (this.j = {});
    const mk = (name, parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      (parent || this.root).add(g);
      j[name] = g;
      return g;
    };
    mk('body', this.root);
    mk('pelvis', j.body, 0, d.hip, 0);
    mk('hipL', j.pelvis, 0, -0.05, -d.hipW);
    mk('knL', j.hipL, 0, -d.thigh, 0);
    mk('anL', j.knL, 0, -d.shin, 0);
    mk('hipR', j.pelvis, 0, -0.05, d.hipW);
    mk('knR', j.hipR, 0, -d.thigh, 0);
    mk('anR', j.knR, 0, -d.shin, 0);
    mk('spine', j.pelvis, 0, 0.05, 0);
    mk('chest', j.spine, 0, d.spine, 0);
    mk('neck', j.chest, 0, d.chest, 0);
    mk('head', j.neck, 0, d.neck, 0);
    mk('shL', j.chest, 0, d.shY, -d.shW);
    mk('elL', j.shL, 0, -d.uarm, 0);
    mk('haL', j.elL, 0, -d.farm, 0);
    mk('wpnL', j.haL, 0, -0.05, 0);
    mk('shR', j.chest, 0, d.shY, d.shW);
    mk('elR', j.shR, 0, -d.uarm, 0);
    mk('haR', j.elR, 0, -d.farm, 0);
    mk('wpn', j.haR, 0, -0.05, 0);
    this.toggles = {}; // name -> Object3D whose visibility a pose may flip
    this.hooks = [];
  }

  applyPose(p) {
    const d = this.dims;
    for (const name of JOINTS) {
      const r = p[name];
      const g = this.j[name];
      if (r) g.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
      else g.rotation.set(0, 0, 0);
    }
    this.j.body.position.set(p.bodyX || 0, p.bodyY || 0, p.bodyZ || 0);
    this.j.pelvis.position.y = d.hip + (p.pelvisY || 0);
    for (const [name, obj] of Object.entries(this.toggles)) {
      obj.visible = !(p.hide && p.hide.includes(name));
    }
    for (const h of this.hooks) h(this, p);
    if (this.ik) solveSaberIK(this, p);
  }

  /**
   * Hand-driven sabers: poses give the hilt position and blade direction
   * (`sab: [x, y, z, yaw, pitch]` in model space; yaw > 0 turns towards the
   * model's right, pitch > 0 raises the blade) and the arms reach for it with
   * two-bone IK, so the hands always sit on the grip. `two` > 0.5 puts the
   * left hand on the pommel; `sab2` drives a second saber in the left hand.
   * `fk` > 0.5 falls back to plain joint angles (saber hidden); `off` > 0.5
   * shows the hilt on the belt instead (blade switched off).
   */
  enableSaberIK(saber, saber2 = null) {
    this.ik = { saber, saber2 };
    this.root.add(saber);
    if (saber2) this.root.add(saber2);
    this.toggles.saber = saber;
    if (saber2) this.toggles.saber2 = saber2;
  }
}

// ----------------------------------------------------------------------------
// Two-bone IK

const _t = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _ma = new THREE.Matrix4();
const _mb = new THREE.Matrix4();
const _a1 = new THREE.Vector3();
const _a2 = new THREE.Vector3();
const _a3 = new THREE.Vector3();
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();
const _b3 = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const GRIP = 0.05; // grip point below the wrist

/** Unit vector for a blade pointing at yaw / pitch in model space. */
export function bladeDir(yaw, pitch, out = new THREE.Vector3()) {
  return out.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
}

/**
 * Rotate shoulder `sh` (child of chest) and bend elbow `el` so the grip point
 * reaches `targetW` (world). `poleW` (world direction) is where the elbow points.
 */
function reach(rig, sh, el, targetW, poleW) {
  const d = rig.dims;
  const a = d.uarm;
  const b = d.farm + GRIP;
  const parent = sh.parent;
  _m.copy(parent.matrixWorld).invert();
  _t.copy(targetW).applyMatrix4(_m).sub(sh.position); // shoulder → target, parent space
  _pole.copy(poleW).transformDirection(_m);
  let dist = _t.length();
  dist = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-4, dist));
  const cosE = (a * a + b * b - dist * dist) / (2 * a * b);
  const theta = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosE)));
  // chain in shoulder space with the elbow bent by theta
  _a1.set(b * Math.sin(theta), -a - b * Math.cos(theta), 0).normalize();
  _a3.set(0, 0, 1);
  _a2.crossVectors(_a3, _a1);
  const sgn = -a * _a2.y >= 0 ? 1 : -1; // which side of the line the elbow is on
  _b1.copy(_t).normalize();
  _b2.copy(_pole).addScaledVector(_b1, -_pole.dot(_b1));
  if (_b2.lengthSq() < 1e-6) _b2.set(0, -1, 0).addScaledVector(_b1, _b1.y);
  _b2.normalize().multiplyScalar(sgn);
  _b3.crossVectors(_b1, _b2);
  _ma.makeBasis(_a1, _a2, _a3).transpose();
  _mb.makeBasis(_b1, _b2, _b3).multiply(_ma);
  sh.quaternion.setFromRotationMatrix(_mb);
  el.rotation.set(0, 0, theta);
  sh.updateMatrixWorld(true);
}

const _grip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _poleR = new THREE.Vector3();

function placeSaber(rig, saber, hand, yaw, pitch) {
  const root = rig.root;
  hand.localToWorld(_grip.set(0, -GRIP, 0));
  root.worldToLocal(_grip);
  saber.position.copy(_grip);
  bladeDir(yaw, pitch, _dir);
  _q.setFromUnitVectors(X_AXIS, _dir);
  saber.quaternion.copy(_q);
  saber.updateMatrixWorld(true);
}

function solveSaberIK(rig, p) {
  const { saber, saber2 } = rig.ik;
  const j = rig.j;
  const root = rig.root;
  if (rig.beltHilt) rig.beltHilt.visible = (p.off || 0) > 0.5;
  const fk = (p.fk || 0) > 0.5 || !p.sab;
  saber.visible = !fk && !(p.hide && p.hide.includes('saber'));
  if (saber2) saber2.visible = !fk && !!p.sab2 && !(p.hide && p.hide.includes('saber2'));
  if (fk) return;
  root.updateMatrixWorld(true);
  const s = p.sab;
  const toW = (x, y, z, out) => root.localToWorld(out.set(x, y, z));
  const dirW = (x, y, z, out) => out.set(x, y, z).transformDirection(root.matrixWorld);
  const pr = p.poleR || [-0.4, -1, 0.75];
  reach(rig, j.shR, j.elR, toW(s[0], s[1], s[2], new THREE.Vector3()), dirW(pr[0], pr[1], pr[2], _poleR));
  placeSaber(rig, saber, j.haR, s[3], s[4]);
  const pl = p.poleL || [-0.4, -1, -0.75];
  if (p.sab2 && saber2) {
    const s2 = p.sab2;
    reach(rig, j.shL, j.elL, toW(s2[0], s2[1], s2[2], new THREE.Vector3()), dirW(pl[0], pl[1], pl[2], _poleR));
    placeSaber(rig, saber2, j.haL, s2[3], s2[4]);
  } else if ((p.two || 0) > 0.5) {
    // left hand just below the right one on the hilt
    const g = saber.position.clone().addScaledVector(bladeDir(s[3], s[4], _dir), -0.1);
    reach(rig, j.shL, j.elL, root.localToWorld(g), dirW(pl[0], pl[1], pl[2], _poleR));
  }
}

// ----------------------------------------------------------------------------
// Pose helpers

/** Merge pose objects; later poses override earlier ones per joint. */
export function pose(...parts) {
  return Object.assign({}, ...parts);
}

/** Linear interpolation between two poses (all numeric channels). */
export function mixPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'hide') {
      out.hide = t < 0.5 ? a.hide : b.hide;
      continue;
    }
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) || Array.isArray(vb)) {
      // missing channels (e.g. a saber target only one key has) hold the other key
      const x = va || vb;
      const y = vb || va;
      out[k] = x.map((_, i) => (x[i] || 0) + ((y[i] || 0) - (x[i] || 0)) * t);
    } else {
      out[k] = (va || 0) + ((vb || 0) - (va || 0)) * t;
    }
  }
  return out;
}

/** Build a pose function from keyframes [{t, p}] with optional easing. */
export function keyframes(keys, ease = (x) => x) {
  return (t) => {
    if (t <= keys[0].t) return keys[0].p;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t <= b.t) return mixPose(a.p, b.p, ease((t - a.t) / (b.t - a.t)));
    }
    return keys[keys.length - 1].p;
  };
}

export const easeInOut = (x) => x * x * (3 - 2 * x);

/** Standard walk/run cycle for legs; phase in [0,1). */
export function legCycle(phase, stride = 0.6, knee = 1.0) {
  const a = phase * Math.PI * 2;
  const s = Math.sin(a);
  const kL = -0.15 - knee * Math.max(0, Math.sin(a + 0.9)) * 0.9;
  const kR = -0.15 - knee * Math.max(0, Math.sin(a + 0.9 + Math.PI)) * 0.9;
  return {
    hipL: [0, 0, s * stride],
    hipR: [0, 0, -s * stride],
    knL: [0, 0, kL],
    knR: [0, 0, kR],
    anL: [0, 0, -kL * 0.3],
    anR: [0, 0, -kR * 0.3],
    bodyY: -0.04 * Math.abs(Math.cos(a)),
  };
}
