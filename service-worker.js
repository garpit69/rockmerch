const CACHE_NAME = 'rockmerch-pwa-v1';
const scopeUrl = new URL(self.registration.scope);
const offlineUrl = new URL('offline.html', scopeUrl).href;
const shellUrls = [
  'offline.html',
  'manifest.webmanifest',
  'assets/style.css',
  'assets/brand.css',
  'assets/record-room.css',
  'assets/pwa.css',
  'assets/app.js',
  'assets/pwa/icon-192.png',
  'assets/pwa/icon-512.png',
  'assets/brand/rockmerch-wordmark.png'
].map(path => new URL(path, scopeUrl).href);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(shellUrls))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('rockmerch-pwa-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== scopeUrl.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(offlineUrl)));
    return;
  }

  const url = new URL(request.url);
  if (!url.pathname.includes('/assets/')) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        return caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => response);
      }
      return response;
    }))
  );
});
