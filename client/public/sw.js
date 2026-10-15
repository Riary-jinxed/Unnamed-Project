// Service worker minimal : permet l'installation et garde l'appli disponible si le réseau tousse.
// Le code et les styles de /assets/ ont une empreinte dans leur nom (ils ne changent jamais) : servis d'abord depuis le cache.
// Les images de /assets/ (près de 200 Mo en tout) et les musiques (/music/) passent directement par le réseau et le cache
// HTTP du navigateur (gardées un an) : les copier aussi ici remplissait le téléphone, sans jamais rien effacer.
// Chaque version de l'appli laisse ses anciens fichiers de code : au-delà de MAX_ASSETS, les plus anciens sont retirés.
// Le reste (pages, icône, manifeste) passe par le réseau, avec le cache en secours hors ligne.
const CACHE = 'jeu-v4', MAX_ASSETS = 120;
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  // Seuls les anciens caches du service worker (« jeu-… ») : celui des cosmétiques dessinés (cosmetics.js) reste.
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('jeu-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Cache Storage rend ses clés dans l'ordre d'ajout : les premières sont les plus anciennes.
const trim = c => c.keys().then(keys => {
  const assets = keys.filter(k => new URL(k.url).pathname.startsWith('/assets/'));
  return Promise.all(assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map(k => c.delete(k)));
});
const fetchAndKeep = (req, asset = false) => fetch(req).then(res => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy).then(() => asset && trim(c))); }
  return res;
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url), path = url.pathname;
  if (req.method !== 'GET' || url.origin !== location.origin || path.startsWith('/ws') || path.startsWith('/api/')) return;
  // Musiques : lues par morceaux (requêtes Range) par le lecteur audio, que le cache ne sait pas rejouer.
  if (path.startsWith('/music/')) return;
  if (path.startsWith('/assets/')) { if (/\.(js|css)$/.test(path)) e.respondWith(caches.match(req).then(hit => hit || fetchAndKeep(req, true))); return; }
  e.respondWith(fetchAndKeep(req).catch(() => caches.match(req)));
});

// Notifications push (server/src/push.js) : { title, body, tag, open }. open : l'écran que l'appli ouvre quand on touche la notification.
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(msg.title || 'Jeu de cartes', { body: msg.body || '', tag: msg.tag, renotify: !!msg.tag,
    icon: '/icon-192.png', badge: '/badge-96.png', lang: 'fr', data: { open: msg.open || 'home', kind: msg.kind || null } }));
});
// Toucher la notification : l'appli déjà ouverte passe au premier plan et va à l'écran voulu ; sinon elle s'ouvre directement dessus.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const open = e.notification.data?.open || 'home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => new URL(c.url).origin === location.origin);
    const kind = e.notification.data?.kind || '';
    if (win) { win.postMessage({ t: 'notif-open', open, kind }); return win.focus(); }
    return self.clients.openWindow(`/?ouvrir=${encodeURIComponent(open)}${kind ? `&notif=${encodeURIComponent(kind)}` : ''}`);
  }));
});
