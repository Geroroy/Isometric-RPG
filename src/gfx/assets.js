// Load-time asset pipeline: bakes every character animation and world prop
// into sprite atlases, reporting progress for the loading screen.
import { Baker } from './baker.js';
import * as M from './models/characters.js';
import * as A from './models/anims.js';
import { PROPS, buildPropVariants, buildLaat } from './models/props.js';
import { RNG } from '../core/math.js';

const CHARACTERS = {
  anakin: () => ({ model: M.buildAnakin(), dirs: 16, frame: [160, 150, 80, 115], anims: A.ANAKIN_ANIMS, markers: ['saberBase', 'saberTip'] }),
  clone: () => ({ model: M.buildClone(), dirs: 8, frame: [120, 110, 60, 90], anims: A.CLONE_ANIMS, markers: [] }),
  rex: () => ({ model: M.buildClone({ rex: true }), dirs: 8, frame: [120, 110, 60, 90], anims: A.REX_ANIMS, markers: [] }),
  b1: () => ({ model: M.buildB1(), dirs: 8, frame: [120, 110, 60, 90], anims: A.B1_ANIMS, markers: [] }),
  b2: () => ({ model: M.buildB2(), dirs: 8, frame: [140, 130, 70, 105], anims: A.B2_ANIMS, markers: [] }),
  r2: () => ({ model: M.buildR2(), dirs: 8, frame: [60, 60, 30, 45], anims: A.R2_ANIMS, markers: [] }),
};

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export async function bakeAssets(onProgress) {
  const baker = new Baker();
  const specs = Object.fromEntries(Object.entries(CHARACTERS).map(([k, f]) => [k, f()]));
  let total = 0;
  for (const s of Object.values(specs)) for (const a of Object.values(s.anims)) total += a.frames * s.dirs;
  const propNames = Object.keys(PROPS);
  for (const n of propNames) total += PROPS[n].variants * (PROPS[n].angles || [0]).length;
  total += 8;
  let done = 0;
  let lastYield = performance.now();
  const tick = async (label) => {
    done++;
    if (performance.now() - lastYield > 30) {
      onProgress(done / total, label);
      await nextFrame();
      lastYield = performance.now();
    }
  };

  const sprites = {};
  for (const [name, spec] of Object.entries(specs)) {
    const gen = baker.bakeAnimated(spec);
    let r;
    while (!(r = gen.next()).done) await tick(`스프라이트 렌더링: ${name}`);
    sprites[name] = r.value;
  }

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
  return { baker, sprites, props, laatFly };
}
