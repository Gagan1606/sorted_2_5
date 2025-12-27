const CACHE_NAME = 'photo-share-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/home.html',
  '/group.html',
  '/signup.html',
  '/css/login.css',
  '/css/signup.css',
  '/css/home.css',
  '/css/group.css',
  '/js/login.js',
  '/js/signup.js',
  '/js/home.js',
  '/js/group.js'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Activate
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