// service-worker.js - FIXED FOR APK
const CACHE_NAME = 'discipline-tracker-v2.0'; // ✅ Changed version to force update
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json'
  // ❌ REMOVED app.js from cache - it was causing stale code issues
];

// Install - cache core files only
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker v2.0');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching core files');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting(); // Force immediate activation
});

// Activate - clear old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker v2.0');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control immediately
});

// Fetch - NETWORK FIRST for app.js, cache for others
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // ✅ CRITICAL: Always fetch app.js fresh from network
  if (url.pathname.endsWith('app.js')) {
    console.log('[SW] Fetching app.js from network (no cache)');
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.log('[SW] Network failed for app.js');
          return new Response('alert("App offline - please connect to internet");', {
            headers: { 'Content-Type': 'application/javascript' }
          });
        })
    );
    return;
  }
  
  // For other files, try cache first, then network
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        console.log('[SW] Serving from cache:', url.pathname);
        return response;
      }
      console.log('[SW] Fetching from network:', url.pathname);
      return fetch(event.request);
    })
  );
});
