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
      const x = va || [0, 0, 0];
      const y = vb || [0, 0, 0];
      out[k] = [0, 1, 2].map((i) => (x[i] || 0) + ((y[i] || 0) - (x[i] || 0)) * t);
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
