// Primitive helpers. Flat shaded, bevelled boxes and procedural surface
// detail (panel seams, rivets, grime, weave) give the baked sprites the dense,
// worn, pre-rendered look of Fallout 1/2 and late-90s RTS / ARPG art.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cache = new Map();

// Remaster detail (StarCraft: Remastered's approach — the same units, redrawn
// finer): models built while it is on get twice the curve segments and
// smooth-shaded Phong materials with a soft specular sheen on metal and
// armour instead of flat Lambert facets. The baker renders them at 2×.
let HD = false;
export function setDetail(hd) {
  HD = !!hd;
}
const segs = (n) => (HD ? n * 2 : n); // curve segments

/**
 * Lambert material (Phong in remaster detail). `tex` picks the surface
 * detail applied at bake time: 'metal' (default: seams, rivets, scratches,
 * grime), 'cloth', 'rock' or 'none' (skin, hair, glass). Emissive materials
 * never get one.
 */
export function mat(color, opts = {}) {
  const key = `${HD ? 'h' : 'l'}:${color}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    const { tex = 'metal', ...rest } = opts;
    let m;
    if (HD) {
      const shine = { metal: [34, 0x3a3a3a], none: [16, 0x202020], cloth: [4, 0x080808], rock: [4, 0x0a0a0a] }[tex] || [10, 0x141414];
      m = new THREE.MeshPhongMaterial({ color, shininess: shine[0], specular: shine[1], flatShading: false, ...rest });
    } else m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...rest });
    m.userData.tex = rest.emissive ? 'none' : tex;
    cache.set(key, m);
  }
  return cache.get(key);
}

// ----------------------------------------------------------------------------
// Surface detail: small greyscale tiles that multiply the material colour.

const TILE = 64;
const PANEL = 0.55; // world units per texture tile
const textures = {};

function surfaceTexture(kind) {
  if (textures[kind]) return textures[kind];
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const img = g.createImageData(TILE, TILE);
  const d = img.data;
  let seed = kind.length * 977;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blot = new Float32Array(TILE * TILE);
  for (let k = 0; k < 6; k++) {
    // low-frequency stains / wear patches
    const cx = rnd() * TILE, cy = rnd() * TILE, r = 6 + rnd() * 14, a = (rnd() - 0.6) * 30;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const dx = Math.min(Math.abs(x - cx), TILE - Math.abs(x - cx));
      const dy = Math.min(Math.abs(y - cy), TILE - Math.abs(y - cy));
      const f = Math.max(0, 1 - Math.hypot(dx, dy) / r);
      blot[y * TILE + x] += a * f * f;
    }
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let v = 238 + (rnd() - 0.5) * 12 + blot[y * TILE + x];
      if (kind === 'metal') {
        // panel seams with a lit lip, offset half panel, rivets along seams
        const seam = x === 0 || y === 0 || (y === TILE / 2 && x < TILE / 2) || (x === TILE / 2 && y > TILE / 2);
        const lip = x === 1 || y === 1 || (y === TILE / 2 + 1 && x < TILE / 2);
        if (seam) v = 168;
        else if (lip) v = 244;
        if ((y === 4 || x === 4) && (x + y) % 8 === 0) v = 150;
        if ((y === 4 || x === 4) && (x + y) % 8 === 1) v = 252;
      } else if (kind === 'cloth') {
        v = 222 + ((x + y) & 1 ? 5 : -5) + Math.sin(x * 0.55 + Math.sin(y * 0.2) * 2) * 9 + blot[y * TILE + x] * 0.5;
      } else if (kind === 'rock') {
        v = 210 + (rnd() - 0.5) * 30 + blot[y * TILE + x] * 1.4;
      } else {
        v = 240 + (rnd() - 0.5) * 12 + blot[y * TILE + x] * 0.4;
      }
      const i = (y * TILE + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  if (kind === 'metal') {
    // scratches
    for (let k = 0; k < 7; k++) {
      let x = rnd() * TILE, y = rnd() * TILE;
      const dx = rnd() - 0.5, dy = rnd() - 0.5;
      for (let s = 0; s < 6; s++, x += dx * 2, y += dy * 2) {
        const i = ((Math.floor(y + TILE) % TILE) * TILE + (Math.floor(x + TILE) % TILE)) * 4;
        d[i] = d[i + 1] = d[i + 2] = 246;
      }
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return (textures[kind] = t);
}

/** Box-projected UVs in world-sized units so detail density is uniform. */
function projectUVs(geo, sx, sy, sz) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i) * sx, y = pos.getY(i) * sy, z = pos.getZ(i) * sz;
    let u, v;
    if (nx >= ny && nx >= nz) [u, v] = [z, y];
    else if (ny >= nz) [u, v] = [x, z];
    else [u, v] = [x, y];
    uv[i * 2] = u / PANEL + 0.5;
    uv[i * 2 + 1] = v / PANEL + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Give every mesh under `root` its surface detail (called once by the baker).
 * Small parts get only fine grain so seams don't smear them.
 */
export function detail(root) {
  root.traverse((m) => {
    if (!m.isMesh || m.userData.detailed) return;
    m.userData.detailed = true;
    const base = m.material;
    let kind = base.userData && base.userData.tex;
    if (!kind || kind === 'none' || !(base.isMeshLambertMaterial || base.isMeshPhongMaterial)) return;
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox;
    const size = Math.max((b.max.x - b.min.x) * m.scale.x, (b.max.y - b.min.y) * m.scale.y, (b.max.z - b.min.z) * m.scale.z);
    if (size < 0.4 && kind !== 'cloth') kind = 'fine';
    if (!geo.attributes.normal) geo.computeVertexNormals();
    projectUVs(geo, m.scale.x, m.scale.y, m.scale.z);
    const variants = (base.userData.variants ||= {});
    if (!variants[kind]) {
      const v = base.clone();
      v.map = surfaceTexture(kind);
      v.userData = { tex: 'none' };
      variants[kind] = v;
    }
    m.material = variants[kind];
  });
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

/** Box; larger ones get chamfered edges that catch the light. */
export function box(w, h, d, material, x, y, z) {
  const m = Math.min(w, h, d);
  const geo = m >= 0.12 ? new RoundedBoxGeometry(w, h, d, segs(1), m * 0.16) : new THREE.BoxGeometry(w, h, d);
  return place(new THREE.Mesh(geo, material), x, y, z);
}

/** Vertical cylinder (along Y). */
export function cyl(rTop, rBot, h, material, x, y, z, seg = 8) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs(seg)), material), x, y, z);
}

/** Cylinder lying along +X, starting at x0. */
export function cylX(r0, r1, len, material, x0 = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, segs(seg)), material);
  m.rotation.z = -Math.PI / 2;
  m.position.set(x0 + len / 2, y, z);
  return m;
}

export function sph(r, material, x, y, z, ws = 8, hs = 6) {
  return place(new THREE.Mesh(new THREE.SphereGeometry(r, segs(ws), segs(hs)), material), x, y, z);
}

export function cone(r, h, material, x, y, z, seg = 6) {
  return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, segs(seg)), material), x, y, z);
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
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs(seg), 1, true, t0, t1 - t0);
  return place(new THREE.Mesh(geo, material), x, y, z);
}

/** Two-sided variant of `mat` for thin cloth. */
export function cloth(color) {
  return mat(color, { side: THREE.DoubleSide, tex: 'cloth' });
}
