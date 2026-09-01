const CACHE = 'quicklink-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/','/404','/503','/manifest.webmanifest','/icon.svg'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && new URL(request.url).pathname !== '/api/') {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('/503'))));
});
