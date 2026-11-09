// Preflight service worker: offline app shell, stale-while-revalidate.
const CACHE = 'preflight-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'logic.js', 'app.js', 'plan.json', 'manifest.webmanifest',
  'fonts/fraunces-400.woff2', 'fonts/fraunces-500.woff2',
  'fonts/instrument-400.woff2', 'fonts/instrument-500.woff2',
  'fonts/plex-mono-400.woff2', 'fonts/plex-mono-500.woff2',
  'icons/icon-192.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
