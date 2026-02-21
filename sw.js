// KJFC Dashboard Service Worker
// Strategy: network-first for HTML (always fresh), cache-first for assets
// Version bump this string to force cache refresh on deploy
const CACHE_VERSION = 'kjfc-v1.0.1';
const CACHE_NAME    = `kjfc-cache-${CACHE_VERSION}`;

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ── Install: pre-cache core assets ───────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: clear old caches ───────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('kjfc-cache-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // take control immediately
  );
});

// ── Fetch: network-first for HTML, cache-first for everything else ────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always bypass service worker for Apps Script API calls
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Network-first for HTML — always get fresh app shell
  if (event.request.mode === 'navigate' ||
      event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Update cache with fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
    return;
  }

  // Cache-first for other assets (fonts, icons etc)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ── Push Notifications ───────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: 'KJFC Dashboard', body: event.data.text() };
  }

  const options = {
    body:    data.body    || '',
    icon:    data.icon    || '/icons/icon-192.png',
    badge:   data.badge   || '/icons/icon-192.png',
    tag:     data.tag     || 'kjfc-notification',
    data:    data.url     ? { url: data.url } : {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'KJFC Dashboard', options)
  );
});

// ── Notification click: open/focus the app ───────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // If app already open, focus it
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
