// Exports a character's animations from the game's own rig and pose code as
// per-frame joint transforms (JSON) for the Blender model builder.
//   node tools/sprites/export_rig_anims.mjs anakin > tools/sprites/anakin_anims.json
// Frames are sampled exactly as the in-browser baker samples them.
import * as THREE from 'three';
import * as M from '../../src/gfx/models/characters.js';
import * as A from '../../src/gfx/models/anims.js';

const CHARS = { anakin: () => ({ model: M.buildAnakin(), anims: A.ANAKIN_ANIMS }) };
const which = process.argv[2] || 'anakin';
const { model, anims } = CHARS[which]();
const JOINTS = Object.keys(model.j);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const q = new THREE.Quaternion();
const out = { character: which, dims: model.dims, joints: {}, anims: {} };
// rest layout: parent and position of every joint (model space: +X forward, +Y up, +Z right)
for (const name of JOINTS) {
  const g = model.j[name];
  out.joints[name] = { parent: g.parent && g.parent.name ? g.parent.name : null, pos: g.position.toArray().map(r4) };
}
for (const [name, a] of Object.entries(anims)) {
  const frames = [];
  for (let f = 0; f < a.frames; f++) {
    const t = a.loop ? f / a.frames : a.frames > 1 ? f / (a.frames - 1) : 0;
    const p = a.pose(t);
    model.applyPose(p);
    model.root.updateMatrixWorld(true);
    const fr = { j: {} };
    for (const jn of JOINTS) {
      const g = model.j[jn];
      fr.j[jn] = [...g.position.toArray().map(r4), ...q.copy(g.quaternion).toArray().map(r4)];
    }
    const s = model.ik && model.ik.saber;
    if (s) fr.saber = s.visible ? [...s.position.toArray().map(r4), ...s.quaternion.toArray().map(r4)] : null;
    fr.beltHilt = model.beltHilt ? model.beltHilt.visible : false;
    fr.hide = p.hide || [];
    frames.push(fr);
  }
  out.anims[name] = { fps: a.fps, loop: !!a.loop, hit: a.hit ?? null, frames };
}
process.stdout.write(JSON.stringify(out));
