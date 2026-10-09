// The game's characters as bake specs: the model, its animations, how many
// facing directions, the frame (width, height and the feet's x, y in game px)
// and the marker objects (saber hilt and tip). The in-browser baker
// (gfx/baker.js) and the Blender pipeline (tools/sprites/export_characters.mjs)
// both read these. No browser-only imports here: Node loads this module too.
import * as M from './models/characters.js';
import * as A from './models/anims.js';
import { buildFighter } from './models/props.js';

const SABER = ['saberBase', 'saberTip'];
const SABERS = ['saberBase', 'saberTip', 'saber2Base', 'saber2Tip'];

export const CHARACTERS = {
  anakin: () => ({ model: M.buildAnakin(), dirs: 16, frame: [170, 160, 85, 120], anims: A.ANAKIN_ANIMS, markers: SABER, ss: 2 }),
  clone: () => ({ model: M.buildClone(), dirs: 8, frame: [120, 110, 60, 90], anims: A.CLONE_ANIMS, markers: [] }),
  rex: () => ({ model: M.buildClone({ rex: true }), dirs: 8, frame: [120, 110, 60, 90], anims: A.REX_ANIMS, markers: [] }),
  b1: () => ({ model: M.buildB1(), dirs: 8, frame: [120, 110, 60, 90], anims: A.B1_ANIMS, markers: [] }),
  b2: () => ({ model: M.buildB2(), dirs: 8, frame: [140, 130, 70, 105], anims: A.B2_ANIMS, markers: [] }),
  r2: () => ({ model: M.buildR2(), dirs: 8, frame: [60, 60, 30, 45], anims: A.R2_ANIMS, markers: [] }),
  // base camp NPCs
  obiwan: () => ({ model: M.buildObiWan(), dirs: 8, frame: [120, 110, 60, 90], anims: A.OBIWAN_ANIMS, markers: [], ss: 2 }),
  ahsoka: () => ({ model: M.buildAhsoka(), dirs: 8, frame: [120, 110, 60, 90], anims: A.AHSOKA_ANIMS, markers: [], ss: 2 }),
  quartermaster: () => ({ model: M.buildClone({ marks: 0xd99a2b }), dirs: 8, frame: [120, 110, 60, 90], anims: A.NPC_CLONE_ANIMS, markers: [] }),
  // the Coruscant Guard: red-marked clones patrolling the city
  cguard: () => ({ model: M.buildClone({ marks: 0xb3262b }), dirs: 8, frame: [120, 110, 60, 90], anims: A.NPC_CLONE_ANIMS, markers: [] }),
  bith: () => ({ model: M.buildBith(), dirs: 8, frame: [120, 110, 60, 90], anims: A.BITH_ANIMS, markers: [], ss: 2 }),
  // city hub crowd (original designs)
  citNoble: () => citizen('noble', 0, A.NOBLE_ANIMS),
  citNoble2: () => citizen('noble', 1, A.NOBLE_ANIMS),
  citAide: () => citizen('aide', 0, A.CITIZEN_ANIMS),
  citWorker: () => citizen('worker', 0, A.CITIZEN_ANIMS),
  citWorker2: () => citizen('worker', 1, A.CITIZEN_ANIMS),
  citDrifter: () => citizen('drifter', 0, A.DRIFTER_ANIMS),
  citVendor: () => citizen('vendor', 0, A.CITIZEN_ANIMS),
  citOfficer: () => citizen('officer', 0, A.CITIZEN_ANIMS),
  citAlien: () => citizen('alien', 0, A.CITIZEN_ANIMS),
  // Anakin's starfighter: a unit so it can take off and land
  fighter: () => ({ model: { root: buildFighter(), applyPose() {} }, dirs: 8, frame: [240, 170, 120, 120], anims: { idle: { frames: 1, fps: 1, loop: true, pose: () => ({}) } }, markers: [], ss: 2 }),
};

function citizen(kind, palette, anims) {
  return { model: M.buildCitizen({ kind, palette }), dirs: 8, frame: [120, 120, 60, 100], anims, markers: [] };
}

/** Baked only when that Movie Duel starts. */
export const DUELS = {
  geonosis: {
    anakinDual: () => ({ model: M.buildAnakin({ dual: true }), dirs: 16, frame: [170, 160, 85, 120], anims: A.ANAKIN_DUAL_ANIMS, markers: SABERS, ss: 2 }),
    dooku: () => ({ model: M.buildDooku(), dirs: 16, frame: [180, 170, 90, 125], anims: A.DOOKU_ANIMS, markers: SABER, ss: 2 }),
    master: () => ({ model: M.buildMaster(), dirs: 8, frame: [120, 110, 60, 90], anims: A.MASTER_ANIMS, markers: [], ss: 2 }),
  },
  mustafar: {
    anakinHood: () => ({ model: M.buildAnakin({ outfit: 'hood' }), dirs: 8, frame: [170, 160, 85, 120], anims: A.ANAKIN_HOOD_ANIMS, markers: [], ss: 2 }),
    anakinMustafar: () => ({ model: M.buildAnakin({ outfit: 'tunic' }), dirs: 16, frame: [200, 220, 100, 170], anims: A.ANAKIN_MUSTAFAR_ANIMS, markers: SABER, ss: 2 }),
    obiwan3: () => ({ model: M.buildObiWan3(), dirs: 16, frame: [170, 160, 85, 120], anims: A.OBIWAN3_ANIMS, markers: SABER, ss: 2 }),
    obiwan3Robe: () => ({ model: M.buildObiWan3({ robe: true }), dirs: 8, frame: [170, 160, 85, 120], anims: A.OBIWAN3_ROBE_ANIMS, markers: [], ss: 2 }),
    padme: () => ({ model: M.buildPadme(), dirs: 8, frame: [140, 130, 70, 100], anims: A.PADME_ANIMS, markers: [], ss: 2 }),
  },
};
export const DUEL_CHARACTERS = Object.assign({}, ...Object.values(DUELS));

/** Anakin's alternative appearances (sprite name `anakin_<id>`), baked when equipped. */
export const SKINS = {
  anakin_tunic: () => ({ model: M.buildAnakin({ outfit: 'tunic' }), dirs: 16, frame: [170, 160, 85, 120], anims: A.ANAKIN_ANIMS, markers: SABER, ss: 2 }),
  anakin_robe: () => ({ model: M.buildAnakin({ outfit: 'robe' }), dirs: 16, frame: [170, 160, 85, 120], anims: A.ANAKIN_ANIMS, markers: SABER, ss: 2 }),
};

