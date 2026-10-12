// The Mustafar facility's floor tiles (tools/sprites/mustafar_floor/bake.py: field, edge, corner, trim, from the
// set's texture sheets) and the lava (tools/sprites/mustafar_lava, 'lava.png'), as ImageData for the terrain
// (terrain.js setFacilityFloor, setLavaTexture). Through the device's file cache (fileCache.js).
import { cachedImage, cachedJSON } from './fileCache.js';
import { MUSTAFAR_SHEETS } from '../world/worldgen.js';

export async function loadMustafarTexture(file) {
  const img = await cachedImage(import.meta.env.BASE_URL + 'sprites/mustafar/' + file);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, img.width, img.height);
}

export async function loadMustafarFloor() {
  const kinds = ['field', 'edge', 'corner', 'trim'];
  const tex = await Promise.all(kinds.map((k) => loadMustafarTexture(`floor_${k}.png`)));
  return Object.fromEntries(kinds.map((k, i) => [k, tex[i]]));
}

// The film's set pieces — wall consoles, the covered corridor, the table, chairs, window walls, the collector
// arm and the outside catwalk
// (tools/sprites/mustafar_console, mustafar_corridor, mustafar_set):
// city-sheet sprites (renderer.js draws a prop with `sheet` from assets.city: body, then the neon layer after
// the light map), one per wall direction (and screen colour)
// the set sprites as baked (one of each mirrored pair); the other of a pair is this one flipped (flipSheet)
const SHIPPED = ['mfConsole', 'mfConsoleRed', 'mfCorridor_r', 'mfWindow', 'mfPassage_x', 'mfChair_x', 'mfTable_y', 'mfArm', 'mfCatwalk', 'mfHolo_y', 'mfFall'];

/** A set sprite mirrored left-right: its transpose in the world (x ↔ y), as the bakers' mirrors were. */
function flipSheet(src) {
  const flip = (f) => {
    if (!f) return null;
    const c = document.createElement('canvas');
    c.width = f.w;
    c.height = f.h;
    const x = c.getContext('2d');
    x.translate(f.w, 0);
    x.scale(-1, 1);
    x.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    return { ...f, page: c, sx: 0, sy: 0, ox: f.w - f.ox };
  };
  const tp = (q) => [q[1], q[0], ...q.slice(2)];
  const m = src.meta;
  return { meta: { ...m, anchor: [src.body.w - m.anchor[0], m.anchor[1]], footprint: m.footprint.map(tp), lights: (m.lights || []).map(tp) }, body: flip(src.body), neon: flip(src.neon), reflect: null };
}

export async function loadMustafarConsoles() {
  const base = import.meta.env.BASE_URL + 'sprites/mustafar/';
  const out = {};
  for (const name of SHIPPED) {
    try {
      const meta = await cachedJSON(base + name + '.json');
      const frame = (page, sy = 0, h = page.height) => ({ page, sx: 0, sy, w: page.width, h, ox: meta.anchor[0], oy: meta.anchor[1], k: meta.k });
      if (meta.layers.sheet) {
        // body over neon in one image (tools/sprites/mustafar_set/pack.py)
        const page = await cachedImage(base + meta.layers.sheet);
        const h = meta.layers.split;
        out[name] = { meta, body: frame(page, 0, h), neon: frame(page, h, h), reflect: null };
      } else {
        const [body, neon] = await Promise.all([cachedImage(base + meta.layers.body), meta.layers.neon ? cachedImage(base + meta.layers.neon) : null]);
        out[name] = { meta, body: frame(body), neon: neon && frame(neon), reflect: null };
      }
    } catch (e) {
      console.warn('무스타파 세트: ' + e.message); // left out of the rooms (addSheetProp skips it)
    }
  }
  // every name the map uses (worldgen.js MIRROR_SHEET, both ways): the shipped one, else its twin flipped
  for (const [a, b] of Object.entries(MUSTAFAR_SHEETS.mirror)) for (const [n, t] of [[a, b], [b, a]]) if (!out[n] && out[t]) out[n] = flipSheet(out[t]);
  return out;
}

// The droid Anakin rides down the lava river and Obi-Wan's hover platform (tools/sprites/mustafar_set: mfDroid,
// mfPlatform), as a unit's sprite set: one direction, one frame, the anchor on the deck's top (the river scene
// stands them there)
export async function loadMustafarDroid(name = 'mfDroid') {
  const base = import.meta.env.BASE_URL + 'sprites/mustafar/';
  const meta = await cachedJSON(base + name + '.json');
  const page = await cachedImage(base + meta.layers.body);
  const f = { page, sx: 0, sy: 0, w: page.width, h: page.height, ox: meta.anchor[0], oy: meta.anchor[1], k: meta.k };
  return { dirs: 1, anims: { idle: { frames: 1, fps: 1, loop: true, data: [[f]] } }, markers: [] };
}
