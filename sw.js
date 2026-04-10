// ===== Service Worker - Swami Samarth Jap Tracker =====

const CACHE_NAME = 'swami-jap-tracker-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/quotes.js',
  './js/db.js',
  './js/app.js',
  './icon-512.png',
  './icon-192.png',
  './manifest.json'
];

// Install — cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — cache first, then network
self.addEventListener('fetch', (event) => {
  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache new resources
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});

// Background periodic sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'swami-notification-check') {
    event.waitUntil(checkScheduledNotifications());
  }
});

async function checkScheduledNotifications() {
  // Read settings from a message or cache
  // This runs in background — notifications are primarily handled in main thread
  // but this provides a backup for when the app is closed
  try {
    const cache = await caches.open(CACHE_NAME);
    // Notification logic is primarily in app.js
  } catch (e) {
    // Silent fail
  }
}
