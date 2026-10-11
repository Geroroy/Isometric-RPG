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
  hoverBlueMilk: 'hoverBlueMilk_160.json',
  hoverBlueMilk_r: 'hoverBlueMilk_r_160.json',
  hoverGorg: 'hoverGorg_160.json',
  hoverFruit: 'hoverFruit_160.json',
  hoverFruit_r: 'hoverFruit_r_160.json',
  roasterRonto: 'roasterRonto_192.json',
  roasterNuna: 'roasterNuna_192.json',
  roasterNuna_r: 'roasterNuna_r_192.json',
  podSpotchka: 'podSpotchka_160.json',
  podJawaJuice: 'podJawaJuice_160.json',
  dinerNerf: 'dinerNerf_192.json',
  dinerBantha: 'dinerBantha_192.json',
  dinerBantha_r: 'dinerBantha_r_192.json',
  cargoMeat: 'cargoMeat_192.json',
  cargoBread: 'cargoBread_192.json',
  cargoBread_r: 'cargoBread_r_192.json',
  cargoMilk: 'cargoMilk_192.json',
  tentStew: 'tentStew_176.json',
  tentGorg: 'tentGorg_176.json',
  skiffFruit: 'skiffFruit_192.json',
  skiffAle: 'skiffAle_192.json',
  skiffAle_r: 'skiffAle_r_192.json',
  seatsA: 'seatsA_128.json',
  seatsB: 'seatsB_128.json',
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

// The Coruscant underworld set (tools/sprites/underworld/extract.py, cut from the concept sheets
// in reference/): the same per-sprite JSON format, listed by index.json, plus square ground
// textures sampled in world space by the terrain (ground/ground.json)
const UW_DIR = 'sprites/underworld/';

/** Every city sprite, the underworld set, the floor texture and the ground textures (ImageData). */
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
  const ub = import.meta.env.BASE_URL + UW_DIR;
  try {
    const index = await (await fetch(ub + 'index.json')).json();
    const un = Object.keys(index);
    for (let i = 0; i < un.length; i++) {
      onProgress(i / un.length, `코러산트 언더월드: ${un[i]}`);
      try {
        out[un[i]] = await loadOne(ub, index[un[i]]);
      } catch (e) {
        console.warn(e.message);
      }
    }
    const gi = await (await fetch(ub + 'ground/ground.json')).json();
    out.ground = {};
    for (const [name, file] of Object.entries(gi)) {
      const img = await loadImg(ub + 'ground/' + file);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      out.ground[name] = x.getImageData(0, 0, img.width, img.height);
    }
  } catch (e) {
    console.warn('언더월드 스프라이트: ' + e.message);
  }
  try {
    const img = await loadImg(base + FLOOR_TEXTURE);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    out.floor = { data: x.getImageData(0, 0, img.width, img.height), tiles: FLOOR_TILES };
  } catch (e) {
    console.warn(e.message); // the old street floor: the underworld set's plates cover the undercity
    out.floor = null;
  }
  return out;
}

/** Neon level over time for one placed sprite: a hum plus random dropouts (the JSON's settings). */
export function neonLevel(state, n, t, dt) {
  const f = n.flicker;
  if (state.until > t) return f.level;
  if (Math.random() < f.rate * dt) state.until = t + f.dur[0] + Math.random() * (f.dur[1] - f.dur[0]);
  return n.base * (1 - n.hum + n.hum * Math.sin(t * n.speed * Math.PI * 2 + state.phase));
}
