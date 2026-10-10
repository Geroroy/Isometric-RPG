// Exports the game's characters (src/gfx/specs.js) to .glb for the Blender
// sprite pipeline: the model, built at full detail (smooth curves), and every
// animation sampled from the game's own pose code frame by frame — the
// frames the in-browser baker would draw. Each animation is a glTF
// animation keying every node that moves anywhere, at one frame per 1/24 s
// (the render script plays them frame by frame); a part a pose hides
// (sheathed saber, the belt hilt) is keyed to scale 0.
//
// Materials become PBR by the surface the game gives them: metal and armour
// a little glossy, cloth and skin matt; glowing parts stay unlit (the
// renderer treats them as light). Saber blades are named `blade…` so the
// render leaves them out (the game draws blades itself), hilts `hilt…`.
//
//   node tools/sprites/export_characters.mjs out_dir [name …]
// writes out_dir/NAME.glb and out_dir/NAME.json ({ dirs, frame, anims: { fps, loop, hit } }).
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CHARACTERS, DUELS, SKINS } from '../../src/gfx/specs.js';
import { setDetail } from '../../src/gfx/models/parts.js';

// sprites modelled in Blender by build_anakin.py (its outfits), not exported from the game's models
const BLENDER_MODELS = new Set(['anakin', 'anakin_vader', 'anakin_robe', 'anakin_tunic']);

// GLTFExporter reads its binary output through FileReader (not in Node)
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend && this.onloadend();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64');
      this.onloadend && this.onloadend();
    });
  }
};

const FPS = 24;
const [out = 'tools/sprites/out/chars', ...only] = process.argv.slice(2);
const ALL = { ...CHARACTERS, ...Object.assign({}, ...Object.values(DUELS)), ...SKINS };
fs.mkdirSync(out, { recursive: true });

// surface -> roughness, metalness
const SURF = { metal: [0.42, 0.35], cloth: [0.92, 0], rock: [0.9, 0], none: [0.6, 0] };

function pbr(m) {
  if (m.isMeshBasicMaterial) return m; // glow: exported unlit
  const tex = (m.userData && m.userData.tex) || 'metal';
  const [roughness, metalness] = SURF[tex] || SURF.metal;
  const s = new THREE.MeshStandardMaterial({
    color: m.color,
    roughness,
    metalness,
    emissive: m.emissive || new THREE.Color(0),
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
  });
  s.name = m.name || tex;
  return s;
}

async function exportOne(name) {
  setDetail(true); // full detail: smooth curves and finer shapes
  let spec;
  try {
    spec = ALL[name]();
  } finally {
    setDetail(false);
  }
  const { model, anims } = spec;
  const root = model.root;
  root.name = name;
  // unique names (animation tracks bind by name); blades and hilts recognisable
  const seen = new Map();
  const mats = new Map();
  root.traverse((o) => {
    let inBlade = false;
    let inSaber = false;
    for (let p = o; p; p = p.parent) {
      if (p.name === 'blade') inBlade = true;
      if (p.userData && p.userData.blade) inSaber = true;
    }
    let base = o.name || o.type.toLowerCase();
    if (inBlade && !base.startsWith('blade')) base = 'blade_' + base;
    else if (inSaber && !inBlade && o.isMesh) base = 'hilt_' + base;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    o.name = n ? `${base}_${n}` : base;
    if (o.isMesh) {
      const conv = (m) => mats.get(m) || mats.set(m, pbr(m)).get(m);
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    }
  });
  const nodes = [];
  root.traverse((o) => o !== root && nodes.push(o));
  // sample every frame of every animation
  const samples = {}; // anim -> [frame][node] = [px,py,pz, qx,qy,qz,qw, s]
  for (const [an, a] of Object.entries(anims)) {
    samples[an] = [];
    for (let f = 0; f < a.frames; f++) {
      const t = a.loop ? f / a.frames : a.frames > 1 ? f / (a.frames - 1) : 0;
      model.applyPose(a.pose(t));
      root.updateMatrixWorld(true);
      // position, rotation, scale (a hidden part: scale ~0)
      samples[an].push(nodes.map((o) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray().map((x) => (o.visible ? x : x * 1e-4))]));
    }
  }
  // the nodes that move anywhere are keyed in every animation
  const ref = samples[Object.keys(samples)[0]][0];
  const moving = nodes.map((_, i) => Object.values(samples).some((fr) => fr.some((v) => v[i].some((x, k) => Math.abs(x - ref[i][k]) > 1e-5))));
  // the rest state the glb stores is the first frame
  nodes.forEach((o, i) => {
    o.position.fromArray(ref[i], 0);
    o.quaternion.fromArray(ref[i], 3);
    o.scale.fromArray(ref[i], 7);
    o.visible = true;
  });
  const clips = [];
  for (const [an, frs] of Object.entries(samples)) {
    const times = frs.map((_, f) => f / FPS);
    const tracks = [];
    nodes.forEach((o, i) => {
      if (!moving[i]) return;
      tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.position`, times, frs.flatMap((v) => v[i].slice(0, 3))));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, times, frs.flatMap((v) => v[i].slice(3, 7))));
      tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.scale`, times, frs.flatMap((v) => v[i].slice(7, 10))));
    });
    // a still animation still needs a track to exist
    if (!tracks.length) tracks.push(new THREE.VectorKeyframeTrack(`${nodes[0].name}.position`, times, frs.flatMap((v) => v[0].slice(0, 3))));
    clips.push(new THREE.AnimationClip(an, -1, tracks));
  }
  const scene = new THREE.Scene();
  scene.add(root);
  // userData holding objects (a blade kept for the game) would be written as extras with
  // fresh random UUIDs, so every export would differ: the render's change detection needs the same bytes
  scene.traverse((o) => {
    for (const k of Object.keys(o.userData)) if (o.userData[k]?.isObject3D) delete o.userData[k];
  });
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips, onlyVisible: false });
  fs.writeFileSync(`${out}/${name}.glb`, Buffer.from(glb));
  const meta = { dirs: spec.dirs, frame: spec.frame, markers: spec.markers, anims: Object.fromEntries(Object.entries(anims).map(([k, a]) => [k, { fps: a.fps, loop: !!a.loop, hit: a.hit ?? null, frames: a.frames }])) };
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(meta));
  console.log(`${name}: ${(glb.byteLength / 1024).toFixed(0)} KB, ${Object.keys(anims).length} animations, ${moving.filter(Boolean).length}/${nodes.length} moving nodes`);
}

for (const name of only.length ? only : Object.keys(ALL)) {
  if (BLENDER_MODELS.has(name)) continue; // these have their own Blender model (build_anakin.py)
  await exportOne(name);
}
