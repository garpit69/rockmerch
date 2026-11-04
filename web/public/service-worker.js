const CACHE_NAME = 'rockmerch-preview-v1';
const scopeUrl = new URL(self.registration.scope);
const offlineUrl = new URL('offline.html', scopeUrl).href;
const shellUrls = [
  new URL('/', scopeUrl).href,
  offlineUrl,
  new URL('manifest.webmanifest', scopeUrl).href,
  new URL('assets/pwa/icon-192.png', scopeUrl).href,
  new URL('assets/pwa/icon-512.png', scopeUrl).href,
  new URL('assets/brand/rockmerch-wordmark.png', scopeUrl).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(shellUrls))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('rockmerch-preview-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scopeUrl.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (
      await caches.match(request) || await caches.match(offlineUrl)
    )));
    return;
  }

  if (!url.pathname.includes('/assets/')) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).then(() => response);
    }
    return response;
  })));
});
