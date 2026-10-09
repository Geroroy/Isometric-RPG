// Coruscant undercity assets rendered in Blender (tools/sprites/render_city.py):
// each a body image, a neon layer (the glow the signs add, drawn additively and
// flickering) and the neon's reflection on the wet street, with a JSON of the
// anchor, the footprint and the flicker settings. Also the street's floor
// texture, which the terrain samples in world coordinates.

const DIR = 'sprites/city/';

/** Asset name -> its JSON (one image pixel per game pixel). */
export const CITY_SPRITES = {
  cantina: 'cantina_340.json',
  tenement0: 'tenement0_500.json',
  tenement1: 'tenement1_500.json',
  tenement2: 'tenement2_500.json',
  cartHotdog: 'cartHotdog_128.json',
  cartHotdog_r: 'cartHotdog_r_128.json',
  grillTrike: 'grillTrike_128.json',
  grillTrike_r: 'grillTrike_r_128.json',
  roundKiosk: 'roundKiosk_128.json',
  tableSet: 'tableSet_128.json',
  yatai: 'yatai_144.json',
  yatai_r: 'yatai_r_144.json',
  containerKiosk: 'containerKiosk_192.json',
  containerKiosk_r: 'containerKiosk_r_192.json',
  containerKiosk2: 'containerKiosk2_192.json',
  foodTruck: 'foodTruck_176.json',
  foodTruck_r: 'foodTruck_r_176.json',
  stackShop: 'stackShop_224.json',
  billboard: 'billboard_160.json',
  speeder0: 'speeder0_96.json',
  speeder1: 'speeder1_96.json',
  crates: 'crates_96.json',
  barrels: 'barrels_96.json',
  ventGrate: 'ventGrate_64.json',
  droidParts: 'droidParts_64.json',
  trashBin: 'trashBin_64.json',
  junctionBox: 'junctionBox_96.json',
};
export const FLOOR_TEXTURE = 'floor_low.png';
export const FLOOR_TILES = 8; // world tiles the floor texture covers per side

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('도시 스프라이트를 불러오지 못했습니다: ' + src));
    img.src = src;
  });

async function loadOne(base, file) {
  const res = await fetch(base + file);
  if (!res.ok) throw new Error('도시 스프라이트 JSON을 불러오지 못했습니다: ' + file);
  const meta = await res.json();
  const [body, neon, reflect] = await Promise.all(['body', 'neon', 'reflect'].map((k) => loadImg(base + meta.layers[k])));
  const k = meta.k !== 1 ? meta.k : undefined;
  // frames in the shape the renderer draws: the anchor is the model's ground centre
  const frame = (page) => ({ page, sx: 0, sy: 0, w: page.width, h: page.height, ox: meta.anchor[0], oy: meta.anchor[1], k });
  return { meta, body: frame(body), neon: frame(neon), reflect: frame(reflect) };
}

/** Every city sprite and the floor texture (as ImageData). */
export async function loadCitySprites(onProgress) {
  const base = import.meta.env.BASE_URL + DIR;
  const out = {};
  const names = Object.keys(CITY_SPRITES);
  for (let i = 0; i < names.length; i++) {
    onProgress(i / names.length, `코러산트 언더시티: ${names[i]}`);
    try {
      out[names[i]] = await loadOne(base, CITY_SPRITES[names[i]]);
    } catch (e) {
      console.warn(e.message); // that prop is left out of the map
    }
  }
  const img = await loadImg(base + FLOOR_TEXTURE);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  out.floor = { data: x.getImageData(0, 0, img.width, img.height), tiles: FLOOR_TILES };
  return out;
}

/** Neon level over time for one placed sprite: a hum plus random dropouts (the JSON's settings). */
export function neonLevel(state, n, t, dt) {
  const f = n.flicker;
  if (state.until > t) return f.level;
  if (Math.random() < f.rate * dt) state.until = t + f.dur[0] + Math.random() * (f.dur[1] - f.dur[0]);
  return n.base * (1 - n.hum + n.hum * Math.sin(t * n.speed * Math.PI * 2 + state.phase));
}
