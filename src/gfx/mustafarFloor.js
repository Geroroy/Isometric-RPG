// The Mustafar facility's floor texture (tools/sprites/mustafar_floor/bake.py: one seamless repeat of the
// film's interior floor), as ImageData for the terrain (terrain.js setFacilityFloor). Through the device's
// file cache (fileCache.js).
import { cachedImage, cachedJSON } from './fileCache.js';

export async function loadMustafarFloor() {
  const img = await cachedImage(import.meta.env.BASE_URL + 'sprites/mustafar/floor.png');
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, img.width, img.height);
}

// The film's wall consoles (tools/sprites/mustafar_console/bake.py): city-sheet sprites (renderer.js draws a
// prop with `sheet` from assets.city: body, then the neon layer after the light map), one per wall direction
// and screen colour
export const MUSTAFAR_CONSOLES = ['mfConsole', 'mfConsole_r', 'mfConsoleRed', 'mfConsoleRed_r'];
export async function loadMustafarConsoles() {
  const base = import.meta.env.BASE_URL + 'sprites/mustafar/';
  const out = {};
  for (const name of MUSTAFAR_CONSOLES) {
    try {
      const meta = await cachedJSON(base + name + '.json');
      const [body, neon] = await Promise.all([cachedImage(base + meta.layers.body), cachedImage(base + meta.layers.neon)]);
      const frame = (page) => ({ page, sx: 0, sy: 0, w: page.width, h: page.height, ox: meta.anchor[0], oy: meta.anchor[1], k: meta.k });
      out[name] = { meta, body: frame(body), neon: frame(neon), reflect: null };
    } catch (e) {
      console.warn('무스타파 콘솔: ' + e.message); // left out of the rooms (addSheetProp skips it)
    }
  }
  return out;
}
