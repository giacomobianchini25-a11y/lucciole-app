const VERSION = 'v1';
const SHELL = `lucciole-shell-${VERSION}`;
const ASSETS = `lucciole-assets-${VERSION}`;
const EXTERNAL = `lucciole-external-${VERSION}`;
const KEEP = [SHELL, ASSETS, EXTERNAL];
const SCOPE = self.registration.scope;
const EXTERNAL_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icon-192.png`]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function handleNavigate(req) {
  const cache = await caches.open(SHELL);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(SCOPE, res.clone());
    return res;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500));
  try {
    return await Promise.race([network, timeout]);
  } catch (e) {
    const cached = await cache.match(SCOPE);
    if (cached) { network.catch(() => {}); return cached; }
    return network;
  }
}

async function handleHashed(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) { cache.put(req, res.clone()); trim(ASSETS, 60); }
  return res;
}

async function handleStale(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') return event.respondWith(handleNavigate(req));
    if (url.pathname.includes('/assets/')) return event.respondWith(handleHashed(req));
    return event.respondWith(handleStale(req, SHELL));
  }
  if (EXTERNAL_HOSTS.includes(url.hostname)) return event.respondWith(handleStale(req, EXTERNAL));
});
