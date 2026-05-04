const CACHE_NAME = 'sjp-mis-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network-First for index.html to ensure users get the new consolidated version
  if (event.request.mode === 'navigate' || event.request.url.includes('index.html')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  } else {
    event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
  }
});
