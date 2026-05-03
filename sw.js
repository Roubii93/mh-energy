// Service Worker — Energetika PWA
// Cache strategy: network-first for API/data, cache-first for static assets

const CACHE_NAME = 'energetika-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ── Install: pre-cache static assets ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for assets ─────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — always network, no cache
  if (url.pathname.startsWith('/api/') || url.pathname === '/data.json') {
    event.respondWith(fetch(event.request));
    return;
  }

  // External URLs (CDN, VRM, OTE-CR) — pass through
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets — cache-first, fallback to network then cache update
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});

// ── Messages from app: handle NOTIFY ─────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type !== 'NOTIFY') return;
  const { title, body, tag } = event.data;
  self.registration.showNotification(title, {
    body,
    tag,
    icon: '/manifest.json', // fallback — manifest ikona je data URI, SW nemůže použít /icons/
    badge: '/manifest.json',
    renotify: false,
  });
});
