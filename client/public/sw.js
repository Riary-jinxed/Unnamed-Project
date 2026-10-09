// Service worker minimal : permet l'installation et garde l'appli disponible si le réseau tousse.
const CACHE = 'jeu-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  const path = new URL(req.url).pathname;
  if (req.method !== 'GET' || path.startsWith('/ws') || path.startsWith('/api/')) return;
  e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
    .catch(() => caches.match(req)));
});
