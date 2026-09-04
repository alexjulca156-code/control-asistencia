const CACHE_NAME = 'asistencia-v1';
const urlsToCache = [
  '/login.html',
  '/Index.html',
  '/admin.html',
  '/css/login.css',
  '/css/Index.css',
  '/css/admin.css',
  '/manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activación
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Estrategia de respuesta
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});