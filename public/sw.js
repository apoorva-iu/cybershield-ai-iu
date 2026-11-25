const CACHE_NAME = 'cs-shell-v1';
const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache same-origin /api/* routes
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Never cache login, signup, auth, payment, checkout, or billing requests
  const pathLower = url.pathname.toLowerCase();
  const searchLower = url.search.toLowerCase();
  if (
    pathLower.includes('login') ||
    pathLower.includes('signup') ||
    pathLower.includes('auth') ||
    pathLower.includes('payment') ||
    pathLower.includes('checkout') ||
    pathLower.includes('billing') ||
    pathLower.includes('razorpay') ||
    searchLower.includes('login') ||
    searchLower.includes('razorpay')
  ) {
    return;
  }

  // Never cache external third-party origins
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation: network first, fall back to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // Static assets: cache first, falling back to network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') {
          return res;
        }
        const toCache = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, toCache));
        return res;
      });
    })
  );
});
