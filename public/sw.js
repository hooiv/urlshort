const CACHE = 'quicklink-shell-v1';
const PRECACHE = ['/', '/404', '/503', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', event => {
  // Cache each shell asset independently: cache.addAll() rejects atomically
  // when a single asset fails, which would prevent the worker from ever
  // installing (e.g. one route 500s during deploy).
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(PRECACHE.map(url => cache.add(url).catch(() => undefined)))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // Drop caches from previous shell versions so stale markup never survives
  // an upgrade, then take control of open pages.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
function isCacheableResponse(response) {
  if (response.type === 'opaqueredirect') return false;
  const control = (response.headers.get('cache-control') || '').toLowerCase();
  // The redirect tier marks per-visitor markup `private, no-store`. Caching it
  // would serve one visitor's destination to everyone (cache poisoning), so
  // only responses safe for a shared cache are stored.
  if (control.includes('no-store') || control.includes('private')) return false;
  return true;
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Personalized API payloads must never be served from the shared cache. The
  // old exact-match check (`pathname !== '/api/'`) cached every /api/* GET.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && isCacheableResponse(response)) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined);
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('/503').then(fallback => fallback || caches.match('/')))));
});
