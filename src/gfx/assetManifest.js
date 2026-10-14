// External art (CLAUDE.md "역할 분리", docs/ASSETS.md): the final images are made outside the project and only placed
// here. Each asset folder has a manifest (public/assets/<set>/manifest.json) that says, per asset, what the image is
// and how it sits in the game's world — the same projection and scale for every asset (src/core/iso.js: 2:1, a tile =
// 1 m, 20 px a metre along an axis on screen, 24.49 px a metre up). This module reads a manifest, checks each image
// against it (an image whose size or proportions differ is refused, never stretched or recoloured) and turns it into
// what the engine already draws:
//   groundTiles  top-down textures the terrain samples in world space (gfx/padFloor.js) -> { tiles: { key: ImageData } }
//   groundImage  one pre-rendered 2:1 picture of a piece of ground       -> a world backdrop (terrain.js `backdrop`)
//   sprite       a pre-rendered 2:1 cut-out standing in the world         -> a sheet sprite (renderer.js placeProp)
//   wallElevation  a wall seen straight on (flat, no angle)               -> stood up on its base line by the
//                game's projection here, then a sheet sprite like the others (its footprint a thin strip)
// An entry whose `status` is not "delivered" is not loaded: the zone shows its placeholder and names what it waits for.
import { cachedImage, cachedJSON } from './fileCache.js';
import { HALF_W, HALF_H } from '../core/iso.js';

export const ASSET_FORMAT = 'cw-assets';
const KINDS = new Set(['groundTiles', 'groundImage', 'sprite', 'wallElevation']);
const RATIO_TOL = 0.02; // (an image's width : height against the world size it claims, before it is refused)

/** The manifest at `path` (under the site's base): { root, raw, byId }. */
export async function loadManifest(path) {
  const raw = await cachedJSON(import.meta.env.BASE_URL + path);
  if (raw.format !== ASSET_FORMAT || raw.version !== 1) throw new Error(`${path}: ${ASSET_FORMAT} v1 가 아님`);
  const root = path.replace(/[^/]*$/, '');
  return { root, raw, byId: new Map(raw.assets.map((e) => [e.id, e])) };
}

async function image(man, file, size, label) {
  const img = await cachedImage(import.meta.env.BASE_URL + man.root + file);
  if (size && (img.width !== size[0] || img.height !== size[1])) throw new Error(`${label}: 이미지 ${img.width}×${img.height}, 매니페스트 ${size[0]}×${size[1]}`);
  return img;
}

function imageData(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, img.width, img.height);
}

/**
 * One asset by id: { entry, data } when it is delivered and checks out, else { entry, missing: reason }.
 * data by kind — groundTiles: { tiles: { key: ImageData }, spec: { key: { metres, outer } } }; groundImage: { img, url, w, h, density, anchor };
 * sprite: a sheet sprite ({ meta, body, neon, reflect }) as the city's and the Mustafar set's are.
 */
export async function loadAsset(man, id) {
  const e = man.byId.get(id);
  if (!e) return { entry: null, missing: '매니페스트에 없음' };
  if (e.status !== 'delivered') return { entry: e, missing: `에셋 대기 (${e.status || 'requested'})` };
  try {
    if (!KINDS.has(e.kind)) throw new Error(`알 수 없는 kind ${e.kind}`);
    if (e.kind === 'groundTiles') {
      const tiles = {};
      for (const [k, t] of Object.entries(e.tiles)) {
        const img = await image(man, t.file, t.size, `${id}.${k}`);
        const want = t.metres[0] / t.metres[1];
        if (Math.abs(img.width / img.height / want - 1) > RATIO_TOL) throw new Error(`${id}.${k}: 비율 ${img.width}:${img.height} ≠ ${t.metres[0]}:${t.metres[1]} m`);
        tiles[k] = imageData(img);
      }
      // (each tile's layout facts, without its file: `metres`, `outer` — for the painter, gfx/padFloor.js)
      const spec = Object.fromEntries(Object.entries(e.tiles).map(([k, t]) => [k, { metres: t.metres, outer: t.outer || 'top' }]));
      return { entry: e, data: { tiles, spec } };
    }
    const img = await image(man, e.file, e.size, id);
    if (e.kind === 'wallElevation') {
      const want = e.metres[0] / e.metres[1];
      if (Math.abs(img.width / img.height / want - 1) > RATIO_TOL) throw new Error(`${id}: 비율 ${img.width}:${img.height} ≠ ${e.metres[0]}:${e.metres[1]} m`);
      return { entry: e, data: standWall(img, e) };
    }
    if (e.kind === 'groundImage') return { entry: e, data: { img, url: new URL(import.meta.env.BASE_URL + man.root + e.file, location.href).href, w: img.width, h: img.height, density: e.density || 1, anchor: e.anchor } };
    // sprite: a frame as the sheet sprites' (k: game px an image px), its emissive layer drawn after the light map
    const k = 1 / (e.density || 1);
    const frame = (page) => ({ page, sx: 0, sy: 0, w: page.width, h: page.height, ox: e.anchor[0], oy: e.anchor[1], k });
    const em = e.lighting && e.lighting.emissive ? await image(man, e.lighting.emissive, e.size, id + '.emissive') : null;
    const meta = {
      anchor: e.anchor,
      k,
      layers: { body: e.file, ...(em ? { neon: e.lighting.emissive } : {}) },
      footprint: e.footprint || [],
      lights: (e.lighting && e.lighting.lights) || [],
      flat: e.layer === 'flat',
      top: e.layer === 'top',
      order: e.sortOffset || 0,
      occlusion: e.occlusion || null,
      asset: id,
    };
    return { entry: e, data: { meta, body: frame(img), neon: em && frame(em), reflect: null } };
  } catch (err) {
    console.warn(`에셋 ${id}: ${err.message}`);
    return { entry: e, missing: err.message };
  }
}

/** A groundImage placed with its anchor pixel on world point (x, y): the terrain's backdrop for it. */
export function groundBackdrop(a, x, y) {
  const s = 1 / a.density; // (screen px an image px)
  const sx = (x - y) * HALF_W - a.anchor[0] * s;
  const sy = (x + y) * HALF_H - a.anchor[1] * s;
  // the world point at the picture's top-left pixel (terrain.js draws the picture from there)
  return { url: a.url, img: a.img, w: a.w, h: a.h, scale: s, x: (sx / HALF_W + sy / HALF_H) / 2, y: (sy / HALF_H - sx / HALF_W) / 2 };
}

const D = 2; // (a stood-up wall's density: the remastered 2x)
const Z_PX = 24.49;
/**
 * A wall picture seen straight on, stood up on its base line: the base line runs `metres[0]` m along world x
 * (`along: "x"`, the picture's left end at −x) or along y (`along: "y"`, its left end at +y, so it reads the same way
 * on screen), the picture `metres[1]` m tall — each picture pixel goes where the game's projection puts that point of
 * the wall (src/core/iso.js: x -> (+20, +10) px a metre, y -> (−20, +10), up -> 24.49), an affine map drawn once at
 * density 2. The anchor is the middle of its base line; the footprint a strip `e.thick` m (0.4) either side of it.
 */
function standWall(img, e) {
  const [L, h] = e.metres;
  const alongX = e.along !== 'y';
  const pad = 4;
  const w = Math.ceil(D * 20 * L) + pad * 2;
  const hh = Math.ceil(D * (10 * L + Z_PX * h)) + pad * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  const ox = w / 2; // (the base line's middle)
  const oy = pad + D * (5 * L + Z_PX * h);
  // picture (u, v) px -> canvas: along the base line by u, up by (1 − v / H) of h
  const su = (D * L) / img.width; // canvas px a picture px along the line, per screen unit of the axis
  if (alongX) x.setTransform(20 * su, 10 * su, 0, (D * Z_PX * h) / img.height, ox - D * 10 * L, oy - D * 5 * L - D * Z_PX * h);
  else x.setTransform(20 * su, -10 * su, 0, (D * Z_PX * h) / img.height, ox - D * 10 * L, oy + D * 5 * L - D * Z_PX * h);
  x.drawImage(img, 0, 0);
  const t = e.thick ?? 0.4;
  const footprint = alongX ? [[-L / 2, -t], [L / 2, -t], [L / 2, t], [-L / 2, t]] : [[-t, -L / 2], [t, -L / 2], [t, L / 2], [-t, L / 2]];
  const frame = { page: c, sx: 0, sy: 0, w, h: hh, ox, oy, k: 1 / D };
  const meta = { anchor: [ox, oy], k: 1 / D, layers: { body: e.file }, footprint, lights: [], flat: false, top: false, order: e.sortOffset || 0, occlusion: e.occlusion || null, asset: e.id };
  return { meta, body: frame, neon: null, reflect: null };
}
