// Comptes joueurs : pas d'inscription, l'administrateur crée les identifiants et les communique.
// API JSON sous /api : connexion, profil, choix du deck de départ, booster quotidien, deck du joueur, boutique, administration.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { STARTERS, COLLECTIBLE, starterKit, openBooster, today, deckError, SHARDS_PER_DUPLICATE, SHOP, SETS, setById, dailyOffers } from '@jeu/engine/collection';
import { pick, CARDS } from '@jeu/engine';

const MAX_SESSIONS = 10;
const hashPass = (pass, salt = randomBytes(16).toString('hex')) => ({ salt, hash: scryptSync(pass, salt, 32).toString('hex') });
const checkPass = (pass, p) => timingSafeEqual(Buffer.from(scryptSync(pass, p.salt, 32).toString('hex')), Buffer.from(p.hash));
const cleanLogin = s => String(s || '').trim().toLowerCase();
const LOGIN_RE = /^[a-z0-9._-]{2,24}$/;

// Réglages de la boutique modifiables depuis /admin. « rotation » change à chaque renouvellement forcé des offres du jour.
export const DEFAULT_SETTINGS = { cardPrice: SHOP.cardPrice, boosterPrice: SHOP.boosterPrice, dailyCards: SHOP.dailyCards, boosterSize: SHOP.boosterSize, shardsPerDuplicate: SHARDS_PER_DUPLICATE, rotation: 0 };
const SETTING_LIMITS = { cardPrice: [0, 100000], boosterPrice: [0, 100000], dailyCards: [1, 10], boosterSize: [1, 10], shardsPerDuplicate: [0, 10000] };

// Ce que le joueur voit de son compte (jamais le mot de passe ni les sessions).
export const publicAccount = (a, cfg = DEFAULT_SETTINGS) => ({ login: a.login, name: a.name, starter: a.starter, cards: a.cards, shards: a.shards || 0, deck: a.deck,
  boosterReady: a.starter !== null && a.lastBooster !== today(), shardRate: cfg.shardsPerDuplicate });

// Ajoute des cartes à la collection : la première copie est gardée, chaque doublon devient des Éclats.
function addCards(a, ids, rate) {
  let shards = 0;
  const fresh = ids.map(id => { if (!a.cards[id]) { a.cards[id] = 1; return true; } shards += rate; return false; });
  a.shards = (a.shards || 0) + shards;
  return { fresh, shards };
}
// Convertit en Éclats les doublons gardés avant la boutique. Renvoie true si le compte a changé.
function convertDuplicates(a, rate) {
  let changed = false;
  for (const [id, n] of Object.entries(a.cards || {})) if (n > 1) { a.shards = (a.shards || 0) + (n - 1) * rate; a.cards[id] = 1; changed = true; }
  return changed;
}

export function createAccounts(store) {
  const sessions = new Map();
  for (const a of store.all()) for (const t of a.tokens || []) sessions.set(t, a.login);
  // Un compte désactivé n'a plus de session valable.
  const byToken = token => { const login = sessions.get(String(token || '')); const a = login && store.get(login); return a && !a.disabled ? a : null; };
  const cfg = () => ({ ...DEFAULT_SETTINGS, ...store.doc('jeu') });
  // Version du catalogue de cartes publié : l'appli recharge les cartes quand elle change.
  let catalogVersion = 0;
  const me = a => ({ ...publicAccount(a, cfg()), catalog: catalogVersion });
  const add = (a, ids) => addCards(a, ids, cfg().shardsPerDuplicate);
  const ready = Promise.all(store.all().filter(a => convertDuplicates(a, cfg().shardsPerDuplicate)).map(a => { console.log(`Doublons de ${a.login} convertis en Éclats.`); return store.put(a); }));

  async function login({ login, password }) {
    const a = store.get(cleanLogin(login));
    if (!a || !checkPass(String(password || ''), a.pass)) throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    if (a.disabled) throw new HttpError(403, 'Ce compte est désactivé.');
    const token = randomBytes(24).toString('hex');
    a.tokens = [...(a.tokens || []), token].slice(-MAX_SESSIONS);
    sessions.clear(); for (const x of store.all()) for (const t of x.tokens || []) sessions.set(t, x.login);
    await store.put(a);
    return { token, account: me(a) };
  }
  async function logout(a, token) { a.tokens = (a.tokens || []).filter(t => t !== token); sessions.delete(token); await store.put(a); return { ok: true }; }

  async function chooseStarter(a, { starter }) {
    if (a.starter) throw new HttpError(409, 'Le deck de départ est déjà choisi.');
    if (!STARTERS.includes(starter)) throw new HttpError(400, 'Deck de départ inconnu.');
    const kit = starterKit(starter);
    Object.assign(a, { starter, cards: kit.cards, deck: kit.deck });
    await store.put(a);
    return { account: me(a) };
  }
  async function booster(a) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    if (a.lastBooster === today()) throw new HttpError(409, 'Booster du jour déjà ouvert. Revenez demain.');
    const cards = openBooster(a.cards);
    const got = add(a, cards);
    a.lastBooster = today();
    await store.put(a);
    return { title: 'Booster du jour', cards, ...got, account: me(a) };
  }

  // Boutique : pour chaque set ouvert, des cartes du jour propres au joueur et un booster du set, payés en Éclats.
  // Les offres changent chaque jour, ou plus tôt quand l'administrateur les renouvelle (rotation).
  function shopDay(a, set) {
    a.shop = a.shop || {};
    const day = a.shop[set.id], c = cfg();
    if (day && day.date === today() && (day.rotation || 0) === c.rotation && day.offers.every(id => set.cards.includes(id))) return day;
    return (a.shop[set.id] = { date: today(), rotation: c.rotation, offers: dailyOffers(set, a.cards, c.dailyCards), bought: [] });
  }
  function shopView(a) {
    const c = cfg();
    return { shards: a.shards || 0, prices: { dailyCards: c.dailyCards, cardPrice: c.cardPrice, boosterPrice: c.boosterPrice, boosterSize: c.boosterSize, shardsPerDuplicate: c.shardsPerDuplicate }, sets: SETS.map(set => ({ id: set.id, name: set.name, open: set.open, teaser: set.teaser || '', size: set.cards.length,
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
  async function shop(a) { const view = shopView(a); await store.put(a); return { shop: view, account: me(a) }; }
  async function buyCard(a, { set: setId, card }) {
    const set = openSet(a, setId), day = shopDay(a, set);
    if (!day.offers.includes(card)) throw new HttpError(400, 'Cette carte n\'est plus en vente aujourd\'hui.');
    if (day.bought.includes(card) || a.cards[card]) throw new HttpError(409, 'Vous possédez déjà cette carte.');
    pay(a, cfg().cardPrice);
    day.bought.push(card);
    const got = add(a, [card]);
    await store.put(a);
    return { title: 'Achat', cards: [card], ...got, shop: shopView(a), account: me(a) };
  }
  async function buyBooster(a, { set: setId }) {
    const set = openSet(a, setId);
    const c = cfg();
    pay(a, c.boosterPrice);
    const cards = Array.from({ length: c.boosterSize }, () => pick(set.cards)), got = add(a, cards);
    await store.put(a);
    return { title: `Booster ${set.name}`, cards, ...got, shop: shopView(a), account: me(a) };
  }
  async function saveDeck(a, deck) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const d = { name: String(deck?.name || 'Mon deck').trim().slice(0, 30) || 'Mon deck', cards: deck?.cards, terrains: deck?.terrains, general: deck?.general };
    const err = deckError(d, a); if (err) throw new HttpError(400, err);
    a.deck = { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: d.general };
    await store.put(a);
    return { account: me(a) };
  }

  // Administration : créer un compte, ou changer le mot de passe d'un compte existant.
  async function adminUpsert({ login, password, name, create }) {
    login = cleanLogin(login);
    if (!LOGIN_RE.test(login)) throw new HttpError(400, 'Identifiant : 2 à 24 caractères parmi a-z, 0-9, point, tiret, tiret bas.');
    if (String(password || '').length < 4) throw new HttpError(400, 'Mot de passe : 4 caractères au moins.');
    const old = store.get(login);
    if (old && create) throw new HttpError(409, 'Cet identifiant existe déjà : ouvrez le compte pour changer son mot de passe.');
    const a = old || { login, name: '', starter: null, cards: {}, shards: 0, deck: null, lastBooster: null, tokens: [], created: new Date().toISOString() };
    a.name = String(name || a.name || login).trim().slice(0, 20) || login;
    a.pass = hashPass(String(password));
    if (old) { for (const t of a.tokens || []) sessions.delete(t); a.tokens = []; }
    await store.put(a);
    return { created: !old, account: adminView(a) };
  }
  const adminView = a => ({ login: a.login, name: a.name, starter: a.starter, cards: Object.values(a.cards).reduce((s, n) => s + n, 0), shards: a.shards || 0,
    lastBooster: a.lastBooster, created: a.created, disabled: !!a.disabled, sessions: (a.tokens || []).length, deckName: a.deck?.name || null });
  const adminDetail = a => ({ ...adminView(a), owned: Object.keys(a.cards).filter(id => a.cards[id]), deck: a.deck,
    boosterReady: a.starter !== null && a.lastBooster !== today(), deckError: a.deck ? deckError(a.deck, a) : null });
  const target = login => { const a = store.get(cleanLogin(login)); if (!a) throw new HttpError(404, 'Compte introuvable.'); return a; };
  const closeSessions = a => { for (const t of a.tokens || []) sessions.delete(t); a.tokens = []; };
  const done = async a => { await store.put(a); return { account: adminDetail(a) }; };

  // Modifie un compte : pseudo, Éclats, désactivation. Seuls les champs présents changent.
  async function adminUpdate({ login, name, shards, disabled }) {
    const a = target(login);
    if (name !== undefined) a.name = String(name).trim().slice(0, 20) || a.login;
    if (shards !== undefined) {
      const n = Number(shards);
      if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new HttpError(400, 'Éclats : un nombre entier positif.');
      a.shards = n;
    }
    if (disabled !== undefined) { a.disabled = !!disabled; if (a.disabled) closeSessions(a); }
    return done(a);
  }
  // Remplace la collection. Une carte du deck enregistré ne peut pas être retirée.
  async function adminCards({ login, cards }) {
    const a = target(login);
    if (!Array.isArray(cards) || cards.some(id => !COLLECTIBLE.includes(id))) throw new HttpError(400, 'Carte inconnue.');
    const keep = new Set(cards), lost = (a.deck?.cards || []).filter(id => !keep.has(id));
    if (lost.length) throw new HttpError(409, `Ces cartes sont dans le deck du joueur et ne peuvent pas être retirées : ${lost.slice(0, 3).map(id => CARDS[id].name).join(', ')}${lost.length > 3 ? ` et ${lost.length - 3} autres` : ''}.`);
    a.cards = Object.fromEntries([...keep].map(id => [id, 1]));
    return done(a);
  }
  // Change le deck de départ : la collection est gardée, les cartes du nouveau deck y sont ajoutées et il devient le deck joué.
  async function adminStarter({ login, starter }) {
    const a = target(login);
    if (!STARTERS.includes(starter)) throw new HttpError(400, 'Deck de départ inconnu.');
    const kit = starterKit(starter);
    a.starter = starter; a.cards = { ...a.cards, ...kit.cards }; a.deck = kit.deck;
    return done(a);
  }
  // Remet le compte comme neuf (collection, Éclats, deck, boutique) ; l'identifiant et le mot de passe restent.
  async function adminReset({ login }) {
    const a = target(login);
    Object.assign(a, { starter: null, cards: {}, shards: 0, deck: null, lastBooster: null, shop: {} });
    return done(a);
  }
  async function adminBooster({ login }) { const a = target(login); a.lastBooster = null; return done(a); }
  async function adminShopReset({ login }) { const a = target(login); a.shop = {}; return done(a); }
  async function adminLogout({ login }) { const a = target(login); closeSessions(a); return done(a); }
  async function adminDelete({ login }) {
    const a = target(login); closeSessions(a);
    await store.remove(a.login);
    return { deleted: a.login };
  }

  // Réglages de la boutique. Changer le nombre de cartes du jour renouvelle aussitôt les offres.
  async function adminSettings(body) {
    const c = cfg(), next = { ...c };
    for (const [k, [min, max]] of Object.entries(SETTING_LIMITS)) {
      if (body[k] === undefined) continue;
      const n = Number(body[k]);
      if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Réglage ${k} : un entier entre ${min} et ${max}.`);
      next[k] = n;
    }
    if (body.renew || next.dailyCards !== c.dailyCards) next.rotation = c.rotation + 1;
    await store.putDoc('jeu', next);
    return { settings: next, defaults: DEFAULT_SETTINGS };
  }

  return { ready, byToken, me, login, logout, chooseStarter, booster, saveDeck, shop, buyCard, buyBooster, adminUpsert,
    adminList: () => store.all().map(adminView), adminGet: login => ({ account: adminDetail(target(login)) }),
    adminUpdate, adminCards, adminStarter, adminReset, adminBooster, adminShopReset, adminLogout, adminDelete,
    adminSettings, settings: () => ({ settings: cfg(), defaults: DEFAULT_SETTINGS }),
    nameOf: login => store.get(login)?.name, ownersOf: id => store.all().filter(a => a.cards[id]).map(a => a.login),
    setCatalogVersion: v => { catalogVersion = v; } };
}

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// Routeur de l'API. Renvoie false si l'adresse n'est pas une route de l'API.
// extra : routes d'autres modules ; open : routes accessibles sans session.
export function apiHandler(accounts, adminKey, extra = {}, open = []) {
  const routes = {
    'POST /api/login': (_, body) => accounts.login(body),
    'GET /api/me': a => ({ account: accounts.me(a) }),
    'POST /api/logout': (a, _, token) => accounts.logout(a, token),
    'POST /api/starter': (a, body) => accounts.chooseStarter(a, body),
    'POST /api/booster': a => accounts.booster(a),
    'PUT /api/deck': (a, body) => accounts.saveDeck(a, body),
    'GET /api/shop': a => accounts.shop(a),
    'POST /api/shop/card': (a, body) => accounts.buyCard(a, body),
    'POST /api/shop/booster': (a, body) => accounts.buyBooster(a, body),
    'GET /api/admin/accounts': () => ({ accounts: accounts.adminList() }),
    'POST /api/admin/accounts': (_, body) => accounts.adminUpsert(body),
    'GET /api/admin/account': (_, __, ___, url) => accounts.adminGet(url.searchParams.get('login')),
    'POST /api/admin/account/update': (_, body) => accounts.adminUpdate(body),
    'POST /api/admin/account/cards': (_, body) => accounts.adminCards(body),
    'POST /api/admin/account/starter': (_, body) => accounts.adminStarter(body),
    'POST /api/admin/account/reset': (_, body) => accounts.adminReset(body),
    'POST /api/admin/account/booster': (_, body) => accounts.adminBooster(body),
    'POST /api/admin/account/shop': (_, body) => accounts.adminShopReset(body),
    'POST /api/admin/account/logout': (_, body) => accounts.adminLogout(body),
    'POST /api/admin/account/delete': (_, body) => accounts.adminDelete(body),
    'GET /api/admin/settings': () => accounts.settings(),
    'POST /api/admin/settings': (_, body) => accounts.adminSettings(body),
    ...extra,
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
      } else if (key !== 'POST /api/login' && !open.includes(key)) {
        acc = accounts.byToken(token); if (!acc) throw new HttpError(401, 'Session expirée : reconnectez-vous.');
      }
      let body = {};
      if (req.method !== 'GET') {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) throw new HttpError(413, 'Requête trop grande.'); }
        try { body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'JSON invalide.'); }
      }
      json(200, await route(acc, body, token, url));
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      json(e.status || 500, { error: e instanceof HttpError ? e.message : 'Erreur du serveur.' });
    }
    return true;
  };
}
