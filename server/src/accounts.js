// Comptes joueurs : pas d'inscription, l'administrateur crée les identifiants et les communique.
// API JSON sous /api : connexion, profil, choix du deck de départ, booster quotidien, deck du joueur, boutique, administration.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { STARTERS, starterKit, openBooster, today, deckError, SHARDS_PER_DUPLICATE, SHOP, SETS, setById, dailyOffers, setBooster } from '@jeu/engine/collection';

const MAX_SESSIONS = 10;
const hashPass = (pass, salt = randomBytes(16).toString('hex')) => ({ salt, hash: scryptSync(pass, salt, 32).toString('hex') });
const checkPass = (pass, p) => timingSafeEqual(Buffer.from(scryptSync(pass, p.salt, 32).toString('hex')), Buffer.from(p.hash));
const cleanLogin = s => String(s || '').trim().toLowerCase();
const LOGIN_RE = /^[a-z0-9._-]{2,24}$/;

// Ce que le joueur voit de son compte (jamais le mot de passe ni les sessions).
export const publicAccount = a => ({ login: a.login, name: a.name, starter: a.starter, cards: a.cards, shards: a.shards || 0, deck: a.deck, boosterReady: a.starter !== null && a.lastBooster !== today() });

// Ajoute des cartes à la collection : la première copie est gardée, chaque doublon devient des Éclats.
function addCards(a, ids) {
  let shards = 0;
  const fresh = ids.map(id => { if (!a.cards[id]) { a.cards[id] = 1; return true; } shards += SHARDS_PER_DUPLICATE; return false; });
  a.shards = (a.shards || 0) + shards;
  return { fresh, shards };
}
// Convertit en Éclats les doublons gardés avant la boutique. Renvoie true si le compte a changé.
function convertDuplicates(a) {
  let changed = false;
  for (const [id, n] of Object.entries(a.cards || {})) if (n > 1) { a.shards = (a.shards || 0) + (n - 1) * SHARDS_PER_DUPLICATE; a.cards[id] = 1; changed = true; }
  return changed;
}

export function createAccounts(store) {
  const sessions = new Map();
  for (const a of store.all()) for (const t of a.tokens || []) sessions.set(t, a.login);
  const byToken = token => { const login = sessions.get(String(token || '')); return login ? store.get(login) : null; };
  const ready = Promise.all(store.all().filter(convertDuplicates).map(a => { console.log(`Doublons de ${a.login} convertis en Éclats.`); return store.put(a); }));

  async function login({ login, password }) {
    const a = store.get(cleanLogin(login));
    if (!a || !checkPass(String(password || ''), a.pass)) throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    const token = randomBytes(24).toString('hex');
    a.tokens = [...(a.tokens || []), token].slice(-MAX_SESSIONS);
    sessions.clear(); for (const x of store.all()) for (const t of x.tokens || []) sessions.set(t, x.login);
    await store.put(a);
    return { token, account: publicAccount(a) };
  }
  async function logout(a, token) { a.tokens = (a.tokens || []).filter(t => t !== token); sessions.delete(token); await store.put(a); return { ok: true }; }

  async function chooseStarter(a, { starter }) {
    if (a.starter) throw new HttpError(409, 'Le deck de départ est déjà choisi.');
    if (!STARTERS.includes(starter)) throw new HttpError(400, 'Deck de départ inconnu.');
    const kit = starterKit(starter);
    Object.assign(a, { starter, cards: kit.cards, deck: kit.deck });
    await store.put(a);
    return { account: publicAccount(a) };
  }
  async function booster(a) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    if (a.lastBooster === today()) throw new HttpError(409, 'Booster du jour déjà ouvert. Revenez demain.');
    const cards = openBooster();
    const got = addCards(a, cards);
    a.lastBooster = today();
    await store.put(a);
    return { title: 'Booster du jour', cards, ...got, account: publicAccount(a) };
  }

  // Boutique : pour chaque set ouvert, 3 cartes du jour propres au joueur et un booster du set, payés en Éclats.
  function shopDay(a, set) {
    a.shop = a.shop || {};
    const day = a.shop[set.id];
    if (day && day.date === today()) return day;
    return (a.shop[set.id] = { date: today(), offers: dailyOffers(set, a.cards), bought: [] });
  }
  function shopView(a) {
    return { shards: a.shards || 0, prices: SHOP, sets: SETS.map(set => ({ id: set.id, name: set.name, open: set.open, teaser: set.teaser || '', size: set.cards.length,
      offers: set.open ? shopDay(a, set).offers.map(id => ({ id, bought: shopDay(a, set).bought.includes(id), owned: !!a.cards[id] })) : [] })) };
  }
  function openSet(a, id) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const set = setById(id); if (!set || !set.open) throw new HttpError(400, 'Ce set n\'est pas encore en vente.');
    return set;
  }
  function pay(a, price) {
    if ((a.shards || 0) < price) throw new HttpError(409, `Il vous faut ${price} Éclats (vous en avez ${a.shards || 0}).`);
    a.shards -= price;
  }
  async function shop(a) { const view = shopView(a); await store.put(a); return { shop: view, account: publicAccount(a) }; }
  async function buyCard(a, { set: setId, card }) {
    const set = openSet(a, setId), day = shopDay(a, set);
    if (!day.offers.includes(card)) throw new HttpError(400, 'Cette carte n\'est plus en vente aujourd\'hui.');
    if (day.bought.includes(card) || a.cards[card]) throw new HttpError(409, 'Vous possédez déjà cette carte.');
    pay(a, SHOP.cardPrice);
    day.bought.push(card);
    const got = addCards(a, [card]);
    await store.put(a);
    return { title: 'Achat', cards: [card], ...got, shop: shopView(a), account: publicAccount(a) };
  }
  async function buyBooster(a, { set: setId }) {
    const set = openSet(a, setId);
    pay(a, SHOP.boosterPrice);
    const cards = setBooster(set), got = addCards(a, cards);
    await store.put(a);
    return { title: `Booster ${set.name}`, cards, ...got, shop: shopView(a), account: publicAccount(a) };
  }
  async function saveDeck(a, deck) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const d = { name: String(deck?.name || 'Mon deck').trim().slice(0, 30) || 'Mon deck', cards: deck?.cards, terrains: deck?.terrains, general: deck?.general };
    const err = deckError(d, a); if (err) throw new HttpError(400, err);
    a.deck = { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: d.general };
    await store.put(a);
    return { account: publicAccount(a) };
  }

  // Administration : créer un compte, ou changer le mot de passe d'un compte existant.
  async function adminUpsert({ login, password, name }) {
    login = cleanLogin(login);
    if (!LOGIN_RE.test(login)) throw new HttpError(400, 'Identifiant : 2 à 24 caractères parmi a-z, 0-9, point, tiret, tiret bas.');
    if (String(password || '').length < 4) throw new HttpError(400, 'Mot de passe : 4 caractères au moins.');
    const old = store.get(login);
    const a = old || { login, name: '', starter: null, cards: {}, shards: 0, deck: null, lastBooster: null, tokens: [], created: new Date().toISOString() };
    a.name = String(name || a.name || login).trim().slice(0, 20) || login;
    a.pass = hashPass(String(password));
    if (old) { for (const t of a.tokens || []) sessions.delete(t); a.tokens = []; }
    await store.put(a);
    return { created: !old, account: adminView(a) };
  }
  const adminView = a => ({ login: a.login, name: a.name, starter: a.starter, cards: Object.values(a.cards).reduce((s, n) => s + n, 0), shards: a.shards || 0, lastBooster: a.lastBooster, created: a.created });

  return { ready, byToken, login, logout, chooseStarter, booster, saveDeck, shop, buyCard, buyBooster, adminUpsert, adminList: () => store.all().map(adminView) };
}

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// Routeur de l'API. Renvoie false si l'adresse n'est pas une route de l'API.
export function apiHandler(accounts, adminKey) {
  const routes = {
    'POST /api/login': (_, body) => accounts.login(body),
    'GET /api/me': a => ({ account: publicAccount(a) }),
    'POST /api/logout': (a, _, token) => accounts.logout(a, token),
    'POST /api/starter': (a, body) => accounts.chooseStarter(a, body),
    'POST /api/booster': a => accounts.booster(a),
    'PUT /api/deck': (a, body) => accounts.saveDeck(a, body),
    'GET /api/shop': a => accounts.shop(a),
    'POST /api/shop/card': (a, body) => accounts.buyCard(a, body),
    'POST /api/shop/booster': (a, body) => accounts.buyBooster(a, body),
    'GET /api/admin/accounts': () => ({ accounts: accounts.adminList() }),
    'POST /api/admin/accounts': (_, body) => accounts.adminUpsert(body),
  };
  return async (req, res, url) => {
    const key = `${req.method} ${url.pathname}`;
    if (!url.pathname.startsWith('/api/')) return false;
    const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const route = routes[key]; if (!route) throw new HttpError(404, 'Route inconnue.');
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      let acc = null;
      if (url.pathname.startsWith('/api/admin/')) {
        if (!adminKey) throw new HttpError(503, 'Administration désactivée : définissez ADMIN_KEY sur le serveur.');
        const given = Buffer.from(String(req.headers['x-admin-key'] || '')), want = Buffer.from(adminKey);
        if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, 'Clé d\'administration incorrecte.');
      } else if (key !== 'POST /api/login') {
        acc = accounts.byToken(token); if (!acc) throw new HttpError(401, 'Session expirée : reconnectez-vous.');
      }
      let body = {};
      if (req.method !== 'GET') {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) throw new HttpError(413, 'Requête trop grande.'); }
        try { body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'JSON invalide.'); }
      }
      json(200, await route(acc, body, token));
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      json(e.status || 500, { error: e instanceof HttpError ? e.message : 'Erreur du serveur.' });
    }
    return true;
  };
}
