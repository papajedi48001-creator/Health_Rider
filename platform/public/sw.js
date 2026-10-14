// Health Rider service worker: keeps the rider app shell available without signal.
// API responses are never cached; patient data stays in the encrypted IndexedDB store.
const shellCache = 'health-rider-shell-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== shellCache) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/icon.svg') {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate' && url.pathname.startsWith('/rider/')) {
    event.respondWith(networkFirst(request));
  }
});

// Rider pages opened by in-app navigation (for example straight after claiming a job) never pass
// through the navigate handler, so the page asks for its own URL to be stored while online.
self.addEventListener('message', (event) => {
  const path = event.data && event.data.cachePage;
  if (typeof path !== 'string' || !path.startsWith('/rider/')) return;
  event.waitUntil(cachePage(new URL(path, self.location.origin).href));
});

async function cachePage(url) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok && !response.redirected) await (await caches.open(shellCache)).put(url, response);
  } catch {
    // Offline or the server is unreachable; the page is stored on a later visit.
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(shellCache)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Only signed-in rider pages are kept; a redirect to login is not.
    if (response.ok && !response.redirected) (await caches.open(shellCache)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true }) ?? await caches.match('/rider/scan');
    if (cached) return cached;
    throw error;
  }
}
