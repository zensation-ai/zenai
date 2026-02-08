/**
 * ZenAI Service Worker v2
 *
 * Provides offline caching and background sync capabilities.
 *
 * Strategies:
 * - Navigation requests (HTML): Network-First (always get latest after deployment)
 * - API requests: Network-First with cache fallback
 * - Hashed assets (/assets/*): Cache-First (immutable, Vite content-hashes)
 * - Other static assets: Network-First
 *
 * @version 2.0.0
 */

const STATIC_CACHE = 'zenai-static-v2';
const DYNAMIC_CACHE = 'zenai-dynamic-v2';

// Old cache names to clean up
const VALID_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/manifest.json',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v2...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up ALL old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v2...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !VALID_CACHES.includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - route requests to appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests (HTML pages) - ALWAYS Network-First
  // This ensures users get the latest index.html after deployments
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // API requests - Network-First with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
    return;
  }

  // Hashed assets (Vite bundles with content hashes) - Cache-First
  // These are immutable: filename changes when content changes
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstImmutable(request));
    return;
  }

  // All other requests - Network-First
  event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
});

/**
 * Cache-First for immutable hashed assets
 * Safe because Vite changes the filename hash when content changes
 */
async function cacheFirstImmutable(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Asset not available offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Network-First Strategy
 * Try network first, fall back to cache
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    // For navigation, return a basic offline page
    if (request.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head>' +
        '<body style="font-family:system-ui;text-align:center;padding:4rem">' +
        '<h1>Offline</h1><p>Bitte pr\u00fcfe deine Internetverbindung.</p>' +
        '<button onclick="location.reload()">Erneut versuchen</button></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'Diese Anfrage ist offline nicht verf\u00fcgbar',
    }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-ideas') {
    event.waitUntil(syncIdeas());
  }
});

/**
 * Sync pending ideas when back online
 */
async function syncIdeas() {
  console.log('[SW] Syncing ideas...');
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Neue Benachrichtigung',
    icon: '/zenai-brain.svg',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: '\u00d6ffnen' },
      { action: 'close', title: 'Schlie\u00dfen' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ZenAI', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

console.log('[SW] Service Worker v2 loaded');
