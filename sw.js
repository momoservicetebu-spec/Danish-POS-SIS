// sw.js - Service Worker untuk Caching Aset Offline-First (Network-First Update)
const CACHE_NAME = 'danish-pos-sis-v3.6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './kasir.html',
  './display.html',
  './admin.html',
  './CSS/css_global.css',
  './CSS/css_thermal.css',
  './JS/js_db.js',
  './JS/js_api.js',
  './JS/js_promo.js',
  './JS/js_kasir.js',
  './JS/js_display.js',
  './JS/js_admin.js',
  './JS/js_security.js',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Jangan cache request POST ke Google Apps Script
  if (event.request.method !== 'GET') return;

  // Network-First: Ambil versi terbaru dari server jika online, fallback ke cache jika offline
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});