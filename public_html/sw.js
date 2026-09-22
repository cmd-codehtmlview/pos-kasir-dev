const CACHE_NAME = 'snackpos-cache-v108';
const STATIC_ASSETS = [
  './',
  './index.html',
  './products-data.js',
  './data/merchants-data.js',
  './data/fmcg_catalog.json',
  './style.css',
  './manifest.json',
  './manifest-dev.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/favicon.png',
  './js/html5-qrcode.min.js',
  './js/db.js',
  './js/store.js',
  './js/license.js',
  './js/sync.js',
  './js/scanner.js',
  './js/cart.js',
  './js/checkout.js',
  './js/member.js',
  './js/returns.js',
  './js/stock-opname.js',
  './js/klerk.js',
  './js/inventory.js',
  './js/import-products.js',
  './js/repack.js',
  './js/reports.js',
  './js/settings.js',
  './js/employees.js',
  './js/printer.js',
  './js/sis-logistics.js',
  './js/sis-cashier-ops.js',
  './js/sis-store-crm.js',
  './js/sis-analytics.js',
  './js/app.js'
];

// Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean Old Caches & Purge any residual order/owner pages
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return caches.open(CACHE_NAME).then((cache) => {
        return Promise.all([
          cache.delete('./owner.html'),
          cache.delete('/owner.html'),
          cache.delete('owner.html'),
          cache.delete('./order.html'),
          cache.delete('/order.html'),
          cache.delete('/order'),
          cache.delete('order.html')
        ]);
      });
    })
  );
  self.clients.claim();
});

// Fetch Event: Network-First with Cache Fallback for maximum freshness & offline reliability
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const path = url.pathname.toLowerCase();

  // JANGAN PERNAH intercept atau cache halaman order, owner monitoring, mockup, dan Supabase API
  // Hal ini memastikan pengguna selalu mendapatkan data & tampilan live server terbaru
  if (path.includes('order') || path.includes('owner') || path.includes('mockup') || path.includes('v-portal') || url.hostname.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});

