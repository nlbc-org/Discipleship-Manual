const VERSION = 'v1';
const CORE_CACHE = 'discipleship-core-' + VERSION;
const RUNTIME_CACHE = 'discipleship-runtime-' + VERSION;

const CORE = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

// Batch photos: cached one by one so a missing file never breaks the install.
const PHOTOS = ['2_2nd_ Batch.jpg', '3_1st_Batch.jpg', '2_1st_Batch.jpg', '1_2nd_ Batch.jpg'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(CORE);
    await Promise.all(PHOTOS.map(p => cache.add(encodeURI('./' + p)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [CORE_CACHE, RUNTIME_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request) || (fallbackUrl && await caches.match(fallbackUrl));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bible verses: save each verse after it loads once, so it opens offline later.
  if (url.hostname === 'bible-api.com') {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  if (url.origin !== location.origin) return;

  // The app page: always try for the newest version, fall back to the saved copy.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, CORE_CACHE, './index.html'));
    return;
  }

  event.respondWith(cacheFirst(req));
});
