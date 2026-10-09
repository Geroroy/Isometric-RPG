// Service worker: makes the game installable and playable offline.
// Pages are network-first (updates arrive as soon as you're online);
// hashed build assets and fonts are cache-first.
const CACHE = 'clone-wars-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const put = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
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
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then(put)));
});
