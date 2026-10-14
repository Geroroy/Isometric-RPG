// Service worker: makes the game installable, playable offline, and quick to
// reopen — after the first visit everything comes from the device.
// Pages are network-first (updates arrive as soon as you're online). Hashed
// build files (assets/) never change: cached once, kept while the build uses them.
// Everything else (sprite sheets, audio, fonts, the baked bundle) keeps its name
// between builds, so it is cached by its content: the build's asset-manifest.json
// (vite.config.js) gives each file a hash, the cache key carries it, and a new
// build (sw.js?v=<build>, main.js) re-downloads only the files whose hash changed —
// never a new sheet's JSON with an old cached PNG, and never the whole game again.
const BUILD = new URL(self.location).searchParams.get('v') || 'dev';
const PAGE = 'clone-wars-' + BUILD; // this build's page, manifest and the files it does not list
const STATIC = 'clone-wars-static'; // assets/ (hashed names)
const FILES = 'clone-wars-files'; // the rest, by content hash, kept across builds
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const SCOPE = new URL(self.registration.scope);

let manifest = null;
async function getManifest() {
  if (manifest) return manifest;
  const url = new URL('asset-manifest.json?v=' + BUILD, SCOPE).href;
  const c = await caches.open(PAGE);
  let r = await c.match(url);
  if (!r) {
    try {
      r = await fetch(url, { cache: 'no-store' });
      if (r.ok) await c.put(url, r.clone());
    } catch {
      r = null;
    }
  }
  manifest = r && r.ok ? await r.json() : { files: {}, assets: [] };
  return manifest;
}
// a file's cache key: its path and content hash (not its URL, so a host that moves the build
// to another path between versions still finds it)
const keyOf = (rel, h) => new URL('/__cw-file/' + h + '/' + rel, self.location.origin).href;
const relOf = (url) => (url.pathname.startsWith(SCOPE.pathname) ? decodeURIComponent(url.pathname.slice(SCOPE.pathname.length)) : null);

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(Promise.all([caches.open(PAGE).then((c) => c.addAll(CORE)), getManifest()]));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const m = await getManifest();
      await self.clients.claim(); // serve the open page at once; the tidying below can follow
      // other builds' page caches go; the shared caches keep only what this build uses
      for (const k of await caches.keys()) if (k !== PAGE && k !== STATIC && k !== FILES) await caches.delete(k);
      const want = new Set(Object.entries(m.files).map(([rel, h]) => keyOf(rel, h)));
      const files = await caches.open(FILES);
      for (const req of await files.keys()) if (!want.has(req.url)) await files.delete(req);
      if (m.assets.length) {
        const keep = new Set(m.assets);
        const st = await caches.open(STATIC);
        for (const req of await st.keys()) if (!keep.has(relOf(new URL(req.url)))) await st.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.headers.has('x-cw-direct')) return; // the game's own file cache (src/gfx/fileCache.js) keeps these by hash
  const rel0 = relOf(url);
  // audio elements ask for byte ranges: answered from the whole file in the cache (fetched whole
  // once), so the music is not downloaded again on every visit
  if (req.headers.has('range')) {
    e.respondWith(
      (async () => {
        const h = rel0 && (await getManifest()).files[rel0];
        if (!h) return fetch(req);
        const key = keyOf(rel0, h);
        const c = await caches.open(FILES);
        let whole = await c.match(key);
        if (!whole) {
          const r = await fetch(req.url);
          if (!(r.ok && r.status === 200)) return fetch(req);
          await c.put(key, r.clone());
          whole = r;
        }
        const buf = await whole.arrayBuffer();
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
        const n = buf.byteLength;
        let a = m && m[1] !== '' ? +m[1] : 0;
        let b = m && m[2] !== '' ? +m[2] : n - 1;
        if (m && m[1] === '' && m[2] !== '') [a, b] = [n - +m[2], n - 1]; // the last N bytes
        b = Math.min(b, n - 1);
        if (a > b)
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${n}` },
          });
        return new Response(buf.slice(a, b + 1), {
          status: 206,
          headers: {
            'Content-Type': whole.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Range': `bytes ${a}-${b}/${n}`,
            'Content-Length': String(b - a + 1),
            'Accept-Ranges': 'bytes',
          },
        });
      })(),
    );
    return;
  }
  const keep = (store, key) => (res) => {
    if (res.ok && res.status === 200) {
      const copy = res.clone();
      caches.open(store).then((c) => c.put(key, copy));
    }
    return res;
  };
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(keep(PAGE, req))
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  const rel = rel0;
  if (rel && /^assets\/[^/]+$/.test(rel)) {
    // (Vite's hashed build files; external art in assets/<set>/ keeps its names: cached by content, below)
    e.respondWith(
      caches
        .open(STATIC)
        .then((c) => c.match(req))
        .then((r) => r || fetch(req).then(keep(STATIC, req))),
    );
    return;
  }
  e.respondWith(
    (async () => {
      const h = rel && (await getManifest()).files[rel];
      if (h) {
        const key = keyOf(rel, h);
        const hit = await (await caches.open(FILES)).match(key);
        return hit || fetch(req).then(keep(FILES, key));
      }
      const hit = await (await caches.open(PAGE)).match(req);
      return hit || fetch(req).then(keep(PAGE, req));
    })(),
  );
});
