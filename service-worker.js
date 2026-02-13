// service-worker.js - v3.0 - WORKING VERSION
const CACHE_NAME = 'discipline-tracker-v3.8';
const urlsToCache = [
  './index.html',
  './style.css',
  './admin.html',
  './history.html',
  './stats.html',
  './notifications.html'
  // app.js NOT cached - always fetch fresh
];

self.addEventListener('install', event => {
  console.log('[SW v3.0] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW v3.0] Caching pages');
        return cache.addAll(urlsToCache).catch(err => {
          console.error('[SW v3.0] Cache failed:', err);
          // Don't fail install if cache fails
          return Promise.resolve();
        });
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW v3.0] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW v3.0] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // ALWAYS fetch app.js fresh - NEVER cache it
  if (url.pathname.includes('app.js')) {
    console.log('[SW v3.0] Fetching app.js from network');
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('console.error("Offline - app.js failed");', {
          headers: { 'Content-Type': 'application/javascript' }
        });
      })
    );
    return;
  }
  
  // For HTML/CSS: Network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone and cache the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});





