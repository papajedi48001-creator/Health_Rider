// Health Rider service worker: keeps the rider app shell available without signal.
// API responses are never cached; patient data stays in the encrypted IndexedDB store.
const shellCache = 'health-rider-shell-v3';
// The app may be served under a path such as /health-rider; the worker's scope is that path.
const base = new URL(self.registration.scope).pathname.replace(/\/$/, '');

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
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith(`${base}/api/`)) return;

  const path = url.pathname.startsWith(`${base}/`) ? url.pathname.slice(base.length) : null;
  if (path === null) return;

  if (path.startsWith('/_next/static/') || path.startsWith('/brand/') || path === '/manifest.webmanifest' || path === '/icon.svg') {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate' && path.startsWith('/rider/')) {
    event.respondWith(networkFirst(request));
  }
});

// Rider pages opened by in-app navigation (for example straight after claiming a job) never pass
// through the navigate handler, so the page asks for its own URL to be stored while online.
self.addEventListener('message', (event) => {
  const path = event.data && event.data.cachePage;
  if (typeof path !== 'string' || !path.startsWith(`${base}/rider/`)) return;
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
    const cached = await caches.match(request, { ignoreSearch: true }) ?? await caches.match(`${base}/rider/scan`);
    if (cached) return cached;
    throw error;
  }
}
