// Service worker: makes the game installable, playable offline, and quick to
// reopen — after the first visit everything comes from the device.
// Pages are network-first (updates arrive as soon as you're online). Hashed
// build files (assets/) never change, so they're cached once and kept across
// builds. Everything else (sprite sheets, audio, the baked bundle) keeps its
// name between builds, so it lives in a cache of this build only: a new build
// registers sw.js?v=<build> (main.js) and starts a fresh one, else a new
// sheet's JSON could be paired with the old cached PNG.
const BUILD = new URL(self.location).searchParams.get('v') || 'dev';
const STATIC = 'clone-wars-static';
const CACHE = 'clone-wars-' + BUILD;
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // audio elements ask for byte ranges; let the network (and HTTP cache) answer those
  if (req.headers.has('range')) return;
  const store = /\/assets\//.test(url.pathname) ? STATIC : CACHE;
  const put = (res) => {
    if (res.ok && res.status === 200) {
      const copy = res.clone();
      caches.open(store).then((c) => c.put(req, copy));
    }
    return res;
  };
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(put)
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  e.respondWith(
    caches
      .open(store)
      .then((c) => c.match(req))
      .then((r) => r || fetch(req).then(put)),
  );
});
