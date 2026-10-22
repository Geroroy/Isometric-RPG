// Files kept on the device by content hash (IndexedDB), so a new build downloads
// only what changed — whatever the host does with URLs, cache headers or the
// service worker. (An artifact host re-serves the whole build every version;
// its pages cannot always register a worker, so the sprite sheets came down
// again on each update.) The build's asset-manifest.json (vite.config.js) gives
// every file that keeps its name between builds a short hash of its content: a
// file whose stored hash matches is read from the device, the rest is fetched
// and kept. The big pages go through here — sprite sheets, the baked bundle,
// the city's sprites, the sound bank — not the page's own hashed assets/ nor
// the streamed music.
const DB = 'cw-files';
const STORE = 'files';
const BASE = import.meta.env.BASE_URL;

let dbP = null;
let manifestP = null;
/** What this session did: files read from the device, files downloaded. */
export const stats = { hit: 0, miss: 0 };

function open() {
  dbP ||= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  }).catch((e) => {
    dbP = null;
    throw e;
  });
  return dbP;
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

/** The build's file hashes: { 'sprites/anakin_128.png': 'abc…', … } (empty without a manifest). */
export function manifest() {
  manifestP ||= fetch(BASE + 'asset-manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((m) => (m && m.files) || {});
  return manifestP;
}

const relOf = (url) => (url.startsWith(BASE) ? url.slice(BASE.length) : url).replace(/^\.?\//, '');

async function fetchOk(url) {
  // straight to the network: the service worker (public/sw.js) leaves these to this cache
  const r = await fetch(url, { headers: { 'X-CW-Direct': '1' } });
  if (!r.ok) throw new Error(`불러오지 못했습니다: ${url} (${r.status})`);
  return r;
}

/** The file's bytes: from the device when its content hash matches the build's, else fetched (and kept). */
export async function cachedBlob(url) {
  const rel = relOf(url);
  const h = (await manifest())[rel];
  if (!h) return (await fetchOk(url)).blob();
  let db = null;
  try {
    db = await open();
  } catch {
    db = null; // private mode, blocked storage: plain downloads
  }
  if (db) {
    try {
      const rec = await tx(db, 'readonly', (s) => s.get(rel));
      if (rec && rec.hash === h && rec.blob) {
        stats.hit++;
        return rec.blob;
      }
    } catch {
      /* a broken record: fetched below */
    }
  }
  const blob = await (await fetchOk(url)).blob();
  stats.miss++;
  if (db) tx(db, 'readwrite', (s) => s.put({ hash: h, blob }, rel)).catch(() => {});
  return blob;
}

export async function cachedJSON(url) {
  return JSON.parse(await (await cachedBlob(url)).text());
}

export async function cachedBuffer(url) {
  return (await cachedBlob(url)).arrayBuffer();
}

/** An <img> of the file (decoded from the cached bytes). */
export async function cachedImage(url) {
  const blob = await cachedBlob(url);
  const src = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다: ' + url));
      img.src = src;
    });
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Drop what this build no longer has (or has changed): called once the game is up. */
export async function prune() {
  try {
    const files = await manifest();
    if (!Object.keys(files).length) return;
    const db = await open();
    const keys = await tx(db, 'readonly', (s) => s.getAllKeys());
    const stale = [];
    for (const k of keys) {
      const rec = await tx(db, 'readonly', (s) => s.get(k));
      if (!files[k] || !rec || rec.hash !== files[k]) stale.push(k);
    }
    for (const k of stale) await tx(db, 'readwrite', (s) => s.delete(k));
  } catch {
    /* nothing to tidy */
  }
}
