const CACHE_NAME = 'gis-cache-v10';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/data_v2.js',
  './js/auth_v2.js',
  './js/stock.js',
  './js/caisse.js',
  './js/invoices.js',
  './js/app_v2.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Network-first strategy
  event.respondWith(
    fetch(event.request).then(response => {
      // Garder uniquement les ressources de l'application, jamais les réponses cloud.
      const url = new URL(event.request.url);
      if (response && response.ok && url.origin === self.location.origin) {
        return caches.open(CACHE_NAME).then(cache =>
          cache.put(event.request, response.clone()).then(() => response)
        ).catch(error => {
          console.warn('[GIS] Mise en cache impossible :', error);
          return response;
        });
      }
      return response;
    }).catch(() => {
      return new URL(event.request.url).origin === self.location.origin
        ? caches.match(event.request)
        : Promise.reject(new Error('Ressource réseau indisponible.'));
    })
  );
});
