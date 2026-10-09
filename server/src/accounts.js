// Comptes joueurs : pas d'inscription, l'administrateur crée les identifiants et les communique.
// API JSON sous /api : connexion, profil, choix du deck de départ, booster quotidien, deck du joueur, boutique, administration.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { STARTERS, OWNABLE, grantStarterGenerals, starterKit, openBooster, today, deckError, draftError, MAX_DECKS, SHARDS_PER_DUPLICATE, SHOP, SETS, setById, dailyOffers } from '@jeu/engine/collection';
import { pick, CARDS, GENERALS } from '@jeu/engine';
import { createProgress } from './progress.js';

const MAX_SESSIONS = 10;
// scrypt en asynchrone : le calcul (volontairement lent) ne bloque pas les parties en cours pendant une connexion.
const scryptHex = (pass, salt) => new Promise((ok, ko) => scrypt(pass, salt, 32, (e, key) => (e ? ko(e) : ok(key.toString('hex')))));
const hashPass = async (pass, salt = randomBytes(16).toString('hex')) => ({ salt, hash: await scryptHex(pass, salt) });
const checkPass = async (pass, p) => timingSafeEqual(Buffer.from(await scryptHex(pass, p.salt)), Buffer.from(p.hash));
const cleanLogin = s => String(s || '').trim().toLowerCase();
const LOGIN_RE = /^[a-z0-9._-]{2,24}$/;

// Réglages de la boutique modifiables depuis /admin. « rotation » change à chaque renouvellement forcé des offres du jour.
export const DEFAULT_SETTINGS = { cardPrice: SHOP.cardPrice, boosterPrice: SHOP.boosterPrice, dailyCards: SHOP.dailyCards, boosterSize: SHOP.boosterSize, shardsPerDuplicate: SHARDS_PER_DUPLICATE, rotation: 0 };
const SETTING_LIMITS = { cardPrice: [0, 100000], boosterPrice: [0, 100000], dailyCards: [1, 10], boosterSize: [1, 10], shardsPerDuplicate: [0, 10000] };

// Decks du joueur : jusqu'à MAX_DECKS, chacun avec un identifiant ; « active » désigne celui qui est joué.
const newDeckId = () => randomBytes(4).toString('hex');
export const activeDeck = a => (a.decks || []).find(d => d.id === a.active) || (a.decks || [])[0] || null;
const cleanDeck = d => ({ id: d.id, name: d.name, general: d.general || null, terrains: d.terrains.slice(), cards: d.cards.slice() });
// Anciens comptes : le deck unique devient le premier des decks. Renvoie true si le compte a changé.
function migrateDecks(a) {
  if (Array.isArray(a.decks)) return false;
  a.decks = a.deck ? [{ id: newDeckId(), ...a.deck }] : [];
  a.active = a.decks[0]?.id || null;
  delete a.deck;
  return true;
}
// Image de profil : petite image (data URL) déjà redimensionnée par l'appli.
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, AVATAR_MAX = 60_000;

// Ce que le joueur voit de son compte (jamais le mot de passe ni les sessions).
export const publicAccount = (a, cfg = DEFAULT_SETTINGS) => ({ login: a.login, name: a.name, avatar: a.avatar || null, starter: a.starter, cards: a.cards, shards: a.shards || 0,
  deck: activeDeck(a), decks: (a.decks || []).map(cleanDeck), active: activeDeck(a)?.id || null, maxDecks: MAX_DECKS,
  boosterReady: a.starter !== null && a.lastBooster !== today(), shardRate: cfg.shardsPerDuplicate,
  // Niveaux de carte (cosmétiques) : essence de chaque carte et niveau atteint (1 si absent).
  essence: a.essence || {}, cardLevels: a.cardLevels || {} });
// Champs de progression remis à zéro avec le compte.
const PROGRESS_FIELDS = ['level', 'xp', 'freeBoosters', 'stats', 'achievements', 'completed', 'cosmetics', 'title', 'frame', 'back', 'inbox', 'missions', 'essence', 'cardLevels'];

// Ajoute des cartes à la collection : la première copie est gardée, chaque doublon devient des Éclats et de l'essence de la carte.
function addCards(a, ids, rate, essenceRate) {
  let shards = 0, essence = 0;
  const fresh = ids.map(id => {
    if (!a.cards[id]) { a.cards[id] = 1; return true; }
    shards += rate; essence += essenceRate;
    if (essenceRate) { a.essence = a.essence || {}; a.essence[id] = (a.essence[id] || 0) + essenceRate; }
    return false;
  });
  a.shards = (a.shards || 0) + shards;
  return { fresh, shards, essence };
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
  const progress = createProgress(store);
  // Version du catalogue de cartes publié : l'appli recharge les cartes quand elle change.
  let catalogVersion = 0;
  const me = a => ({ ...publicAccount(a, cfg()), catalog: catalogVersion, progress: progress.view(a) });
  // Les nouvelles cartes rapportent de l'XP et peuvent compléter une famille ou un set.
  const add = (a, ids) => { const got = addCards(a, ids, cfg().shardsPerDuplicate, progress.essenceRate()); return { ...got, xp: progress.onCards(a, got.fresh) }; };
  const ready = Promise.all(store.all().filter(a => {
    const dup = convertDuplicates(a, cfg().shardsPerDuplicate), decks = migrateDecks(a), gens = grantStarterGenerals(a), prog = progress.init(a);
    if (dup) console.log(`Doublons de ${a.login} convertis en Éclats.`);
    if (decks) console.log(`Deck de ${a.login} rangé dans ses decks.`);
    if (gens) console.log(`Généraux du deck de départ ajoutés à la collection de ${a.login}.`);
    if (prog) console.log(`Progression de ${a.login} créée (niveau ${a.level}).`);
    return dup || decks || gens || prog;
  }).map(a => store.put(a)));
  // Une fois le catalogue appliqué : familles et sets déjà complétés, succès déjà atteints.
  async function syncAll() {
    for (const a of store.all()) {
      const before = JSON.stringify([a.completed, a.achievements]);
      progress.checkCollection(a);
      if (JSON.stringify([a.completed, a.achievements]) !== before) await store.put(a);
    }
  }

  async function login({ login, password }) {
    const a = store.get(cleanLogin(login));
    if (!a || !(await checkPass(String(password || ''), a.pass))) throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    if (a.disabled) throw new HttpError(403, 'Ce compte est désactivé.');
    const token = randomBytes(24).toString('hex');
    // Au-delà de MAX_SESSIONS, la plus ancienne session du compte est fermée.
    const all = [...(a.tokens || []), token];
    for (const t of all.slice(0, -MAX_SESSIONS)) sessions.delete(t);
    a.tokens = all.slice(-MAX_SESSIONS); sessions.set(token, a.login);
    await store.put(a);
    return { token, account: me(a) };
  }
  async function logout(a, token) { a.tokens = (a.tokens || []).filter(t => t !== token); sessions.delete(token); await store.put(a); return { ok: true }; }

  async function chooseStarter(a, { starter }) {
    if (a.starter) throw new HttpError(409, 'Le deck de départ est déjà choisi.');
    if (!STARTERS.includes(starter)) throw new HttpError(400, 'Deck de départ inconnu.');
    const kit = starterKit(starter);
    const deck = { id: newDeckId(), ...kit.deck };
    Object.assign(a, { starter, cards: kit.cards, decks: [deck], active: deck.id });
    progress.init(a);
    await store.put(a);
    return { account: me(a) };
  }
  async function booster(a) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    if (a.lastBooster === today()) throw new HttpError(409, 'Booster du jour déjà ouvert. Revenez demain.');
    const cards = openBooster(a.cards);
    const got = add(a, cards);
    a.lastBooster = today();
    progress.onBooster(a);
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
    return { shards: a.shards || 0, freeBoosters: a.freeBoosters || 0, prices: { dailyCards: c.dailyCards, cardPrice: c.cardPrice, boosterPrice: c.boosterPrice, boosterSize: c.boosterSize, shardsPerDuplicate: c.shardsPerDuplicate }, sets: SETS.map(set => ({ id: set.id, name: set.name, open: set.open, teaser: set.teaser || '', size: set.cards.length,
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
  // free : booster offert (niveau, set complété), ouvert dans le set choisi.
  async function buyBooster(a, { set: setId, free }) {
    const set = openSet(a, setId);
    const c = cfg();
    if (free) {
      if (!(a.freeBoosters > 0)) throw new HttpError(409, 'Aucun booster offert à ouvrir.');
      a.freeBoosters--;
    } else pay(a, c.boosterPrice);
    const cards = Array.from({ length: c.boosterSize }, () => pick(set.cards)), got = add(a, cards);
    await store.put(a);
    return { title: `${free ? 'Booster offert' : 'Booster'} ${set.name}`, cards, ...got, shop: shopView(a), account: me(a) };
  }
  // Decks : créer (sans id) ou enregistrer un deck, même incomplet ; seul un deck complet peut être joué.
  const deckName = (name, fallback) => String(name ?? '').trim().slice(0, 30) || fallback;
  function ownDeck(a, id) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const d = (a.decks || []).find(x => x.id === id); if (!d) throw new HttpError(404, 'Deck introuvable.');
    return d;
  }
  async function saveDeck(a, body) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const old = body?.id ? ownDeck(a, body.id) : null;
    if (!old && a.decks.length >= MAX_DECKS) throw new HttpError(409, `${MAX_DECKS} decks au plus : supprimez-en un d'abord.`);
    const d = { id: old ? old.id : newDeckId(), name: deckName(body?.name, old?.name || `Deck ${a.decks.length + 1}`),
      general: body?.general || null, terrains: body?.terrains, cards: body?.cards };
    const err = draftError(d, a); if (err) throw new HttpError(400, err);
    const deck = cleanDeck(d);
    if (old) a.decks[a.decks.indexOf(old)] = deck; else a.decks.push(deck);
    // Le deck joué reste jouable : un nouveau deck complet ne le remplace que si on le demande.
    if (body?.play && !deckError(deck, a)) a.active = deck.id;
    if (!a.active) a.active = deck.id;
    keepPlayable(a);
    await store.put(a);
    return { id: deck.id, account: me(a) };
  }
  async function renameDeck(a, { id, name }) {
    const d = ownDeck(a, id); d.name = deckName(name, d.name);
    await store.put(a); return { account: me(a) };
  }
  async function playDeck(a, { id }) {
    const d = ownDeck(a, id), err = deckError(d, a);
    if (err) throw new HttpError(409, `Ce deck n'est pas jouable : ${err}`);
    a.active = d.id; await store.put(a); return { account: me(a) };
  }
  // Remet un deck à zéro : il garde son nom, sans général, terrain ni carte.
  async function resetDeck(a, { id }) {
    const d = ownDeck(a, id); Object.assign(d, { general: null, terrains: [], cards: [] });
    keepPlayable(a);
    await store.put(a); return { account: me(a) };
  }
  async function deleteDeck(a, { id }) {
    const d = ownDeck(a, id);
    if (a.decks.length <= 1) throw new HttpError(409, 'Gardez au moins un deck : remettez-le à zéro plutôt.');
    a.decks = a.decks.filter(x => x !== d);
    if (a.active === d.id) a.active = (a.decks.find(x => !deckError(x, a)) || a.decks[0]).id;
    await store.put(a); return { account: me(a) };
  }
  // Si le deck joué n'est plus jouable, un autre deck complet prend sa place.
  function keepPlayable(a) {
    const cur = activeDeck(a); if (cur && !deckError(cur, a)) return;
    const ok = a.decks.find(d => !deckError(d, a)); if (ok) a.active = ok.id;
  }
  // Ancienne route : enregistre le deck joué.
  const saveActiveDeck = (a, body) => saveDeck(a, { ...body, id: activeDeck(a)?.id });

  // Profil : pseudo et image de profil (null pour la retirer). Seuls les champs présents changent.
  async function saveProfile(a, { name, avatar }) {
    if (name !== undefined) {
      const n = String(name).trim();
      if (!n || n.length > 20) throw new HttpError(400, 'Pseudo : 1 à 20 caractères.');
      a.name = n;
    }
    if (avatar !== undefined) {
      if (avatar !== null && (typeof avatar !== 'string' || avatar.length > AVATAR_MAX || !AVATAR_RE.test(avatar))) throw new HttpError(400, 'Image de profil invalide ou trop lourde.');
      a.avatar = avatar || null;
    }
    await store.put(a);
    return { account: me(a) };
  }

  // Progression : partie terminée, missions, boîte de récompenses, titre, cadre et dos de carte.
  async function recordGame(a, info) { const reward = progress.onGame(a, info); await store.put(a); return reward; }
  async function reroll(a, body) { await progress.reroll(a, body); await store.put(a); return { account: me(a) }; }
  async function seen(a) { progress.seen(a); await store.put(a); return { account: me(a) }; }
  async function equip(a, body) { await progress.equip(a, body || {}); await store.put(a); return { account: me(a) }; }
  async function upgradeCard(a, body) { const level = await progress.upgradeCard(a, body || {}); await store.put(a); return { level, account: me(a) }; }

  // Administration : créer un compte, ou changer le mot de passe d'un compte existant.
  async function adminUpsert({ login, password, name, create }) {
    login = cleanLogin(login);
    if (!LOGIN_RE.test(login)) throw new HttpError(400, 'Identifiant : 2 à 24 caractères parmi a-z, 0-9, point, tiret, tiret bas.');
    if (String(password || '').length < 4) throw new HttpError(400, 'Mot de passe : 4 caractères au moins.');
    const old = store.get(login);
    if (old && create) throw new HttpError(409, 'Cet identifiant existe déjà : ouvrez le compte pour changer son mot de passe.');
    const a = old || { login, name: '', starter: null, cards: {}, shards: 0, decks: [], active: null, lastBooster: null, tokens: [], created: new Date().toISOString() };
    a.name = String(name || a.name || login).trim().slice(0, 20) || login;
    a.pass = await hashPass(String(password));
    if (old) { for (const t of a.tokens || []) sessions.delete(t); a.tokens = []; }
    await store.put(a);
    return { created: !old, account: adminView(a) };
  }
  const adminView = a => ({ login: a.login, name: a.name, starter: a.starter, cards: Object.values(a.cards).reduce((s, n) => s + n, 0), shards: a.shards || 0, level: a.level || 1,
    xp: a.xp || 0, freeBoosters: a.freeBoosters || 0,
    lastBooster: a.lastBooster, created: a.created, disabled: !!a.disabled, sessions: (a.tokens || []).length, deckName: activeDeck(a)?.name || null });
  // inDecks : cartes présentes dans au moins un deck du joueur (elles ne peuvent pas être retirées de sa collection).
  const adminDetail = a => ({ ...adminView(a), owned: Object.keys(a.cards).filter(id => a.cards[id]), deck: activeDeck(a), decks: (a.decks || []).length,
    inDecks: [...new Set((a.decks || []).flatMap(d => [...d.cards, d.general].filter(Boolean)))],
    boosterReady: a.starter !== null && a.lastBooster !== today(), deckError: activeDeck(a) ? deckError(activeDeck(a), a) : null });
  const target = login => { const a = store.get(cleanLogin(login)); if (!a) throw new HttpError(404, 'Compte introuvable.'); return a; };
  const closeSessions = a => { for (const t of a.tokens || []) sessions.delete(t); a.tokens = []; };
  const done = async a => { await store.put(a); return { account: adminDetail(a) }; };

  // Modifie un compte : pseudo, Éclats, désactivation. Seuls les champs présents changent.
  async function adminUpdate({ login, name, shards, level, freeBoosters, disabled }) {
    const a = target(login);
    if (name !== undefined) a.name = String(name).trim().slice(0, 20) || a.login;
    const int = (v, max, label) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, `${label} : un nombre entier positif.`); return n; };
    if (shards !== undefined) a.shards = int(shards, 10_000_000, 'Éclats');
    if (freeBoosters !== undefined) a.freeBoosters = int(freeBoosters, 1000, 'Boosters offerts');
    // Changer le niveau ne donne pas les récompenses des niveaux sautés ; les succès de niveau, si.
    if (level !== undefined && a.level) { const n = int(level, 1000, 'Niveau'); if (n !== a.level) { a.level = Math.max(1, n); a.xp = 0; progress.checkCollection(a); } }
    if (disabled !== undefined) { a.disabled = !!disabled; if (a.disabled) closeSessions(a); }
    return done(a);
  }
  // Remplace la collection. Une carte du deck enregistré ne peut pas être retirée.
  async function adminCards({ login, cards }) {
    const a = target(login);
    if (!Array.isArray(cards) || cards.some(id => !OWNABLE.includes(id))) throw new HttpError(400, 'Carte inconnue.');
    const keep = new Set(cards), lost = [...new Set((a.decks || []).flatMap(d => [...d.cards, d.general].filter(Boolean)))].filter(id => !keep.has(id));
    if (lost.length) throw new HttpError(409, `Ces cartes sont dans un deck du joueur et ne peuvent pas être retirées : ${lost.slice(0, 3).map(id => (CARDS[id] || GENERALS[id]).name).join(', ')}${lost.length > 3 ? ` et ${lost.length - 3} autres` : ''}.`);
    a.cards = Object.fromEntries([...keep].map(id => [id, 1]));
    progress.checkCollection(a);
    return done(a);
  }
  // Change le deck de départ : la collection est gardée, les cartes du nouveau deck y sont ajoutées et il devient le deck joué.
  // Il remplace le deck joué ; les autres decks qui ne respectent plus la nouvelle famille sont remis à zéro.
  async function adminStarter({ login, starter }) {
    const a = target(login);
    if (!STARTERS.includes(starter)) throw new HttpError(400, 'Deck de départ inconnu.');
    const kit = starterKit(starter), cur = activeDeck(a), deck = { id: cur?.id || newDeckId(), ...kit.deck };
    a.starter = starter; a.cards = { ...a.cards, ...kit.cards };
    a.decks = cur ? a.decks.map(d => (d === cur ? deck : d)) : [deck];
    for (const d of a.decks) if (draftError(d, a)) Object.assign(d, { general: null, terrains: [], cards: [] });
    a.active = deck.id;
    return done(a);
  }
  // Remet le compte comme neuf (collection, Éclats, deck, boutique) ; l'identifiant et le mot de passe restent.
  async function adminReset({ login }) {
    const a = target(login);
    Object.assign(a, { starter: null, cards: {}, shards: 0, decks: [], active: null, lastBooster: null, shop: {} });
    for (const k of PROGRESS_FIELDS) delete a[k];
    progress.init(a);
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

  return { ready, syncAll, progress, recordGame, reroll, seen, equip, upgradeCard, byToken, me, login, logout, chooseStarter, booster, saveDeck, saveActiveDeck, renameDeck, playDeck, resetDeck, deleteDeck, saveProfile, shop, buyCard, buyBooster, adminUpsert,
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
    'PUT /api/deck': (a, body) => accounts.saveActiveDeck(a, body),
    'PUT /api/decks': (a, body) => accounts.saveDeck(a, body),
    'POST /api/decks/rename': (a, body) => accounts.renameDeck(a, body),
    'POST /api/decks/play': (a, body) => accounts.playDeck(a, body),
    'POST /api/decks/reset': (a, body) => accounts.resetDeck(a, body),
    'POST /api/decks/delete': (a, body) => accounts.deleteDeck(a, body),
    'PUT /api/profile': (a, body) => accounts.saveProfile(a, body),
    'GET /api/shop': a => accounts.shop(a),
    'POST /api/shop/card': (a, body) => accounts.buyCard(a, body),
    'POST /api/shop/booster': (a, body) => accounts.buyBooster(a, body),
    'POST /api/missions/reroll': (a, body) => accounts.reroll(a, body),
    'POST /api/rewards/seen': a => accounts.seen(a),
    'PUT /api/cosmetics': (a, body) => accounts.equip(a, body),
    'POST /api/cards/upgrade': (a, body) => accounts.upgradeCard(a, body),
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
    'GET /api/admin/rewards': () => accounts.progress.settings(),
    'POST /api/admin/rewards': (_, body) => accounts.progress.saveSettings(body || {}),
    ...extra,
  };
  return async (req, res, url) => {
    const key = `${req.method} ${url.pathname}`;
    if (!url.pathname.startsWith('/api/')) return false;
    // Les réponses un peu lourdes (catalogue, statistiques, comptes) sont compressées si le navigateur l'accepte.
    const json = (status, data) => {
      let body = Buffer.from(JSON.stringify(data));
      const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'accept-encoding' };
      if (body.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = gzipSync(body); headers['content-encoding'] = 'gzip'; }
      res.writeHead(status, headers); res.end(body);
    };
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
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new HttpError(413, 'Requête trop grande.'); }
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
