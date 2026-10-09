// Service worker minimal : permet l'installation et garde l'appli disponible si le réseau tousse.
// Les fichiers de /assets/ ont une empreinte dans leur nom (ils ne changent jamais) : servis d'abord depuis le cache.
// Le reste (pages, illustrations) passe par le réseau, avec le cache en secours hors ligne.
const CACHE = 'jeu-v3';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const fetchAndKeep = req => fetch(req).then(res => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url), path = url.pathname;
  if (req.method !== 'GET' || url.origin !== location.origin || path.startsWith('/ws') || path.startsWith('/api/')) return;
  if (path.startsWith('/assets/')) e.respondWith(caches.match(req).then(hit => hit || fetchAndKeep(req)));
  else e.respondWith(fetchAndKeep(req).catch(() => caches.match(req)));
});
