// Stick-figure review of a character's animations, straight from the game's
// pose code (no rendering): every joint and the blade per frame, as JSON for
// pose_preview.py, which draws them from the side, the front and the game's
// isometric angle.
//   node tools/sprites/pose_preview.mjs anakin attack1,sigF > poses.json
//   python tools/sprites/pose_preview.py poses.json out.png
import * as THREE from 'three';
import * as M from '../../src/gfx/models/characters.js';
import * as A from '../../src/gfx/models/anims.js';

const SETS = {
  anakin: () => ({ model: M.buildAnakin(), anims: A.ANAKIN_ANIMS }),
  anakinDual: () => ({ model: M.buildAnakin({ dual: true }), anims: A.ANAKIN_DUAL_ANIMS }),
  anakinMustafar: () => ({ model: M.buildAnakin({ outfit: 'robe' }), anims: A.ANAKIN_MUSTAFAR_ANIMS }),
};
const [which = 'anakin', only = ''] = process.argv.slice(2);
const { model, anims } = SETS[which]();
const names = only ? only.split(',') : Object.keys(anims);
const v = new THREE.Vector3();
const out = {};
for (const name of names) {
  const a = anims[name];
  if (!a) throw new Error('no animation ' + name);
  const frames = [];
  for (let f = 0; f < a.frames; f++) {
    const t = a.loop ? f / a.frames : a.frames > 1 ? f / (a.frames - 1) : 0;
    model.applyPose(a.pose(t));
    model.root.updateMatrixWorld(true);
    const j = {};
    for (const [k, g] of Object.entries(model.j)) j[k] = g.getWorldPosition(v).toArray();
    const blades = [];
    for (const s of [model.ik?.saber, model.ik?.saber2]) {
      if (!s || !s.visible) continue;
      blades.push([s.localToWorld(v.set(-0.12, 0, 0)).toArray(), s.localToWorld(v.set(0.13, 0, 0)).toArray(), s.localToWorld(v.set(1.13, 0, 0)).toArray()]);
    }
    frames.push({ j, blades });
  }
  out[name] = { fps: a.fps, loop: !!a.loop, hit: a.hit ?? null, frames };
}
process.stdout.write(JSON.stringify(out));
