// Load-time asset pipeline: bakes every character animation and world prop
// into sprite atlases, reporting progress for the loading screen.
import { Baker } from './baker.js';
import * as M from './models/characters.js';
import * as A from './models/anims.js';
import { PROPS, buildPropVariants, buildLaat } from './models/props.js';
import { RNG } from '../core/math.js';
import { loadBundle, saveBundle } from './assetCache.js';

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
};

/** Baked only when a Movie Duel starts. */
export const DUEL_CHARACTERS = {
  anakinDual: () => ({ model: M.buildAnakin({ dual: true }), dirs: 16, frame: [170, 160, 85, 120], anims: A.ANAKIN_DUAL_ANIMS, markers: SABERS, ss: 2 }),
  dooku: () => ({ model: M.buildDooku(), dirs: 16, frame: [180, 170, 90, 125], anims: A.DOOKU_ANIMS, markers: SABER, ss: 2 }),
};

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function progress(onProgress, total) {
  let done = 0;
  let lastYield = performance.now();
  return async (label, w = 1) => {
    done += w;
    if (performance.now() - lastYield > 30) {
      onProgress(Math.min(1, done / total), label);
      await nextFrame();
      lastYield = performance.now();
    }
  };
}

async function bakeCharacters(baker, specs, tick) {
  const sprites = {};
  for (const [name, spec] of Object.entries(specs)) {
    const gen = baker.bakeAnimated(spec);
    let r;
    while (!(r = gen.next()).done) await tick(`스프라이트 렌더링: ${name}`, Math.max(1, spec.dirs / 4));
    sprites[name] = r.value;
  }
  return sprites;
}

const frameCost = (specs) => {
  let total = 0;
  for (const s of Object.values(specs)) for (const a of Object.values(s.anims)) total += a.frames * Math.max(1, s.dirs / 4);
  return total;
};

/** Everything the open world needs; cached on the device after the first run. */
export async function bakeAssets(onProgress) {
  const cached = await loadBundle('core');
  if (cached) {
    onProgress(1, '저장된 스프라이트 불러옴');
    return cached;
  }
  const baker = new Baker();
  const specs = Object.fromEntries(Object.entries(CHARACTERS).map(([k, f]) => [k, f()]));
  const propNames = Object.keys(PROPS);
  let total = frameCost(specs) + 8;
  for (const n of propNames) total += PROPS[n].variants * (PROPS[n].angles || [0]).length;
  const tick = progress(onProgress, total);

  const sprites = await bakeCharacters(baker, specs, tick);
  const props = {};
  for (const name of propNames) {
    const def = PROPS[name];
    const models = buildPropVariants(name);
    const frames = [];
    for (const m of models) {
      for (const f of baker.bakeStatic(m, { angles: def.angles || [0] })) {
        frames.push(f);
        await tick(`지형 오브젝트: ${name}`);
      }
    }
    props[name] = frames;
  }

  const laat = buildLaat(new RNG(3));
  const laatFly = baker.bakeStatic(laat, { angles: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (-i * Math.PI) / 4) });
  onProgress(1, '완료');
  const assets = { sprites, props, laatFly };
  saveBundle('core', assets); // in the background
  baker.dispose();
  return assets;
}

/** Sprites for the Movie Duel (Dooku, dual-wielding Anakin), baked on demand. */
export async function bakeDuelAssets(onProgress) {
  const cached = await loadBundle('duel');
  if (cached) return cached;
  const baker = new Baker();
  const specs = Object.fromEntries(Object.entries(DUEL_CHARACTERS).map(([k, f]) => [k, f()]));
  const tick = progress(onProgress, frameCost(specs));
  const sprites = await bakeCharacters(baker, specs, tick);
  const assets = { sprites };
  saveBundle('duel', assets);
  baker.dispose();
  return assets;
}
