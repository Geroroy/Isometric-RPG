// Load-time asset pipeline: bakes every character animation and world prop
// into sprite atlases, reporting progress for the loading screen.
import { Baker } from './baker.js';
import { PROPS, buildPropVariants, buildLaat } from './models/props.js';
import { CHARACTERS, DUELS, SKINS } from './specs.js';
import { RNG } from '../core/math.js';
import { loadBundle, saveBundle } from './assetCache.js';
import { sheetIndex, loadSheets } from './sheet.js';

export { CHARACTERS, DUELS, DUEL_CHARACTERS, SKINS } from './specs.js';

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
  // characters with a Blender sprite sheet are loaded instead (main.js), not baked
  const idx = await sheetIndex();
  const specs = Object.fromEntries(Object.entries(CHARACTERS).filter(([k]) => !idx[k]).map(([k, f]) => [k, f()]));
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

/** Sprites for one Movie Duel, baked on demand. */
export async function bakeDuelAssets(onProgress, duel = 'geonosis') {
  const key = duel === 'geonosis' ? 'duel' : 'duel-' + duel;
  // the cast with a Blender sprite sheet loads it; the rest is baked (and cached)
  const sheets = await loadSheets(Object.keys(DUELS[duel]), onProgress);
  const rest = Object.entries(DUELS[duel]).filter(([k]) => !sheets[k]);
  if (!rest.length) return { sprites: sheets };
  const cached = await loadBundle(key);
  if (cached) return { sprites: { ...cached.sprites, ...sheets } };
  const baker = new Baker();
  const specs = Object.fromEntries(rest.map(([k, f]) => [k, f()]));
  const tick = progress(onProgress, frameCost(specs));
  const sprites = await bakeCharacters(baker, specs, tick);
  saveBundle(key, { sprites });
  baker.dispose();
  return { sprites: { ...sprites, ...sheets } };
}

/** Sprites for one of Anakin's appearances; cached on the device like the rest. */
export async function bakeSkin(name, onProgress) {
  const sheet = (await loadSheets([name], onProgress))[name];
  if (sheet) return sheet;
  const cached = await loadBundle(name);
  if (cached) return cached.sprites[name];
  const baker = new Baker();
  const specs = { [name]: SKINS[name]() };
  const sprites = await bakeCharacters(baker, specs, progress(onProgress, frameCost(specs)));
  saveBundle(name, { sprites });
  baker.dispose();
  return sprites[name];
}
