// The Mustafar facility's floor texture (tools/sprites/mustafar_floor/bake.py: one seamless repeat of the
// film's interior floor) and the lava (tools/sprites/mustafar_lava, 'lava.png'), as ImageData for the terrain
// (terrain.js setFacilityFloor, setLavaTexture). Through the device's file cache (fileCache.js).
import { cachedImage, cachedJSON } from './fileCache.js';

export async function loadMustafarFloor(file = 'floor.png') {
  const img = await cachedImage(import.meta.env.BASE_URL + 'sprites/mustafar/' + file);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, img.width, img.height);
}

// The film's set pieces — wall consoles, the covered corridor, the table, chairs, window walls, the collector
// arm and the outside catwalk
// (tools/sprites/mustafar_console, mustafar_corridor, mustafar_set):
// city-sheet sprites (renderer.js draws a prop with `sheet` from assets.city: body, then the neon layer after
// the light map), one per wall direction (and screen colour)
// (the baked turns not placed anywhere yet — mfConsoleRed_r, mfCorridor_r, mfWindow_r, mfPassage_x — are left unloaded)
export const MUSTAFAR_CONSOLES = ['mfConsole', 'mfConsole_r', 'mfConsoleRed', 'mfCorridor', 'mfTable', 'mfWindow', 'mfChair', 'mfChair_x', 'mfPassage', 'mfArm', 'mfCatwalk'];
export async function loadMustafarConsoles() {
  const base = import.meta.env.BASE_URL + 'sprites/mustafar/';
  const out = {};
  for (const name of MUSTAFAR_CONSOLES) {
    try {
      const meta = await cachedJSON(base + name + '.json');
      const [body, neon] = await Promise.all([cachedImage(base + meta.layers.body), meta.layers.neon ? cachedImage(base + meta.layers.neon) : null]);
      const frame = (page) => ({ page, sx: 0, sy: 0, w: page.width, h: page.height, ox: meta.anchor[0], oy: meta.anchor[1], k: meta.k });
      out[name] = { meta, body: frame(body), neon: neon && frame(neon), reflect: null };
    } catch (e) {
      console.warn('무스타파 세트: ' + e.message); // left out of the rooms (addSheetProp skips it)
    }
  }
  return out;
}

// The droid Anakin rides down the lava river (tools/sprites/mustafar_set: mfDroid), as a unit's sprite set: one
// direction, one frame, the anchor on its deck's top (the river scene stands him there)
export async function loadMustafarDroid() {
  const base = import.meta.env.BASE_URL + 'sprites/mustafar/';
  const meta = await cachedJSON(base + 'mfDroid.json');
  const page = await cachedImage(base + meta.layers.body);
  const f = { page, sx: 0, sy: 0, w: page.width, h: page.height, ox: meta.anchor[0], oy: meta.anchor[1], k: meta.k };
  return { dirs: 1, anims: { idle: { frames: 1, fps: 1, loop: true, data: [[f]] } }, markers: [] };
}
