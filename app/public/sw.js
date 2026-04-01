// Service Worker for NAS Shipping Estimator PWA
// Cache-first strategy for all app assets to enable full offline functionality.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `nas-ship-estimator-${CACHE_VERSION}`;

// Assets to pre-cache on install (static shell).
// Vite-built assets use hashed filenames and are cached at runtime on first fetch.
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/NAS_Icon.png',
  '/NAS_Logo.png',
  '/pdf.worker.min.mjs',
];

// Install: pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

// Activate: clean up old caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => (key.startsWith('nas-ship-estimator-') || key.startsWith('naseco-ship-estimator-')) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// Fetch: cache-first for same-origin requests, network-only for cross-origin
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache same-origin GET requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached version, and update cache in the background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Network failed — cached version is already being returned
        });
        // Don't await fetchPromise — just fire it for background update
        event.waitUntil(fetchPromise);
        return cached;
      }

      // Not in cache — fetch from network and cache the response
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Handle messages from the app (e.g., skip waiting)
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
