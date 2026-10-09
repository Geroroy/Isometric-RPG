// Persistent cache for baked sprite atlases (IndexedDB). Baking every model
// takes a while on phones, so the result is stored per device and reused on
// the next launch. The key is a hash of the model/animation/baker sources, so
// any change to how sprites look invalidates it automatically.
import charSrc from './models/characters.js?raw';
import animSrc from './models/anims.js?raw';
import anakinAnimSrc from './models/anakinAnims.js?raw';
import rigSrc from './models/rig.js?raw';
import partSrc from './models/parts.js?raw';
import propSrc from './models/props.js?raw';
import bakerSrc from './baker.js?raw';
import assetSrc from './assets.js?raw';
import specSrc from './specs.js?raw';

const DB = 'cw-sprites';
const STORE = 'bundles';

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const SOURCE_HASH = fnv([charSrc, animSrc, anakinAnimSrc, rigSrc, partSrc, propSrc, bakerSrc, assetSrc, specSrc].join('\u0000'));

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Replace every frame's `page` (a canvas) with an index into `pages`. */
function encode(value, pages) {
  if (Array.isArray(value)) return value.map((v) => encode(v, pages));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'page') {
        let i = pages.indexOf(v);
        if (i < 0) i = pages.push(v) - 1;
        out.page = i;
      } else out[k] = encode(v, pages);
    }
    return out;
  }
  return value;
}

function decode(value, pages) {
  if (Array.isArray(value)) return value.map((v) => decode(v, pages));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'page' ? pages[v] : decode(v, pages);
    return out;
  }
  return value;
}

const toBlob = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));

export async function saveBundle(name, data) {
  try {
    const pages = [];
    const json = encode(data, pages);
    const blobs = await Promise.all(pages.map(toBlob));
    const db = await open();
    await tx(db, 'readwrite', (s) => s.put({ hash: SOURCE_HASH, json, blobs }, name));
    db.close();
  } catch (e) {
    console.warn('sprite cache: save failed', e);
  }
}

export async function loadBundle(name) {
  try {
    const db = await open();
    const rec = await tx(db, 'readonly', (s) => s.get(name));
    db.close();
    if (!rec || rec.hash !== SOURCE_HASH) return null;
    const pages = await Promise.all(rec.blobs.map((b) => createImageBitmap(b)));
    return decode(rec.json, pages);
  } catch (e) {
    console.warn('sprite cache: load failed', e);
    return null;
  }
}
