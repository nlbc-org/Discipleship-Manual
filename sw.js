const VERSION = 'v4';
const CORE_CACHE = 'discipleship-core-' + VERSION;
const RUNTIME_CACHE = 'discipleship-runtime-' + VERSION;
const NETWORK_TIMEOUT = 3500; // ms to wait for the network before using the saved copy

const CORE = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './kjv.json'];

// Batch photos: cached one by one so a missing file never breaks the install.
const PHOTOS = ['2_2nd_ Batch.jpg', '3_1st_Batch.jpg', '2_1st_Batch.jpg', '1_2nd_ Batch.jpg'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    // Each file is cached separately, so one missing file never cancels the whole install.
    await Promise.all(CORE.map(u => cache.add(u).catch(() => {})));
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

// Network first, but never wait forever: on a weak or fake connection,
// fall back to the saved copy after NETWORK_TIMEOUT.
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);

  const fromCache = async () =>
    (await cache.match(request, { ignoreSearch: true })) ||
    (fallbackUrl ? await caches.match(fallbackUrl) : undefined);

  const networkFetch = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  });

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT));
    return await Promise.race([networkFetch, timeout]);
  } catch (err) {
    const cached = await fromCache();
    if (cached) {
      networkFetch.catch(() => {}); // let the slow request finish quietly and refresh the cache
      return cached;
    }
    // Nothing saved: wait for the network as a last resort.
    return networkFetch;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bible verses from the online fallback: save each one after it loads once.
  if (url.hostname === 'bible-api.com') {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  if (url.origin !== location.origin) return;

  // The app page: try for the newest version, fall back to the saved copy.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, CORE_CACHE, './index.html'));
    return;
  }

  event.respondWith(cacheFirst(req));
});
