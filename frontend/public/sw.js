/**
 * ZenAI Service Worker v3
 *
 * Provides offline caching, background sync, and offline mutation queue.
 *
 * Strategies:
 * - Navigation requests (HTML): Network-First (always get latest after deployment)
 * - API requests: Network-First with cache fallback
 * - Hashed assets (/assets/*): Cache-First (immutable, Vite content-hashes)
 * - Other static assets: Network-First
 *
 * Phase 62 additions:
 * - Offline mutation queue (POST/PUT/DELETE stored in IndexedDB when offline)
 * - Background sync registration for offline queue
 * - Improved cache versioning
 * - Offline indicator data to clients
 *
 * @version 3.0.0
 */

const STATIC_CACHE = 'zenai-static-v3';
const DYNAMIC_CACHE = 'zenai-dynamic-v3';
const OFFLINE_QUEUE_DB = 'zenai-offline-queue';
const OFFLINE_QUEUE_STORE = 'mutations';

// Old cache names to clean up
const VALID_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/manifest.json',
];

// ===========================================
// IndexedDB helpers for offline mutation queue
// ===========================================

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addToOfflineQueue(mutation) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    store.add({
      url: mutation.url,
      method: mutation.method,
      headers: mutation.headers,
      body: mutation.body,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => {
      resolve();
      notifyClientsOfPendingCount();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getOfflineQueue() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readonly');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromOfflineQueue(id) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingCount() {
  try {
    const queue = await getOfflineQueue();
    return queue.length;
  } catch {
    return 0;
  }
}

async function notifyClientsOfPendingCount() {
  const count = await getPendingCount();
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({ type: 'PENDING_SYNC_COUNT', count });
  });
}

// ===========================================
// Install event - cache essential assets
// ===========================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v3...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ===========================================
// Activate event - clean up ALL old caches
// ===========================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v3...');
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
      .then(() => {
        // Notify all clients of the update
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATE_AVAILABLE' });
        });
      })
  );
});

// ===========================================
// Fetch event - route requests to appropriate strategy
// ===========================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Handle non-GET requests (mutations) - queue if offline
  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(handleMutation(request));
    }
    return;
  }

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

// ===========================================
// Mutation handler - queue when offline
// ===========================================

async function handleMutation(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Network failed - queue the mutation for later
    try {
      const body = await request.clone().text();
      const headers = {};
      request.headers.forEach((value, key) => {
        // Skip host and content-length headers
        if (key !== 'host' && key !== 'content-length') {
          headers[key] = value;
        }
      });

      await addToOfflineQueue({
        url: request.url,
        method: request.method,
        headers,
        body,
      });

      // Register background sync
      if (self.registration.sync) {
        await self.registration.sync.register('sync-mutations');
      }

      return new Response(JSON.stringify({
        success: true,
        queued: true,
        message: 'Request queued for sync when online',
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (queueError) {
      return new Response(JSON.stringify({
        error: 'Offline',
        message: 'Request failed and could not be queued',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}

// ===========================================
// Cache strategies
// ===========================================

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

// ===========================================
// Background sync - replay offline mutations
// ===========================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-mutations') {
    event.waitUntil(replayOfflineMutations());
  }
  if (event.tag === 'sync-ideas') {
    event.waitUntil(syncIdeas());
  }
});

async function replayOfflineMutations() {
  console.log('[SW] Replaying offline mutations...');
  try {
    const queue = await getOfflineQueue();
    console.log(`[SW] ${queue.length} mutations to replay`);

    for (const mutation of queue) {
      try {
        const response = await fetch(mutation.url, {
          method: mutation.method,
          headers: mutation.headers,
          body: mutation.body || undefined,
        });

        if (response.ok || response.status < 500) {
          // Success or client error (don't retry client errors)
          await removeFromOfflineQueue(mutation.id);
          console.log(`[SW] Replayed mutation: ${mutation.method} ${mutation.url}`);
        }
        // Server errors will be retried on next sync
      } catch {
        console.log(`[SW] Failed to replay mutation: ${mutation.method} ${mutation.url}`);
        // Network still down, will retry on next sync
        break;
      }
    }

    await notifyClientsOfPendingCount();
  } catch (error) {
    console.error('[SW] Error replaying mutations:', error);
  }
}

/**
 * Sync pending ideas when back online (legacy)
 */
async function syncIdeas() {
  console.log('[SW] Syncing ideas...');
}

// ===========================================
// Message handling
// ===========================================

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

  if (event.data && event.data.type === 'GET_PENDING_SYNC_COUNT') {
    getPendingCount().then((count) => {
      event.source?.postMessage({ type: 'PENDING_SYNC_COUNT', count });
    });
  }
});

// ===========================================
// Push notification handling
// ===========================================

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

console.log('[SW] Service Worker v3 loaded');
