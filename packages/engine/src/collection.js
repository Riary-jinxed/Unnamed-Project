// Collection d'un joueur : deck de départ, booster quotidien et règles de construction de deck.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche et prévient avant d'envoyer).
import { CARDS, GENERALS, TERRAINS, DECKS, pick, shuffle } from './engine.js';
import { t, tp } from './i18n.js';

export const STARTERS = ['gobelin', 'elfe', 'demon'];
export const DECK_SIZE = 15, DECK_TERRAINS = 5, MAX_COPIES = 1, BOOSTER_SIZE = 3;
// Cartes à collectionner (hors jetons). Le catalogue publié depuis /admin peut en ajouter : ces tableaux sont mis à jour sur place.
export const COLLECTIBLE = Object.keys(CARDS).filter(k => !CARDS[k].token);
// Les généraux se collectionnent comme les cartes : même collection, mêmes boosters, mêmes doublons.
// Les boss mondiaux (boss: true) n'en font pas partie.
export const GENERAL_IDS = Object.keys(GENERALS).filter(g => !GENERALS[g].boss);
export const isGeneral = id => !!GENERALS[id];
// Tout ce qui peut sortir d'un booster : cartes et généraux.
export const OWNABLE = [...COLLECTIBLE, ...GENERAL_IDS];
// Booster quotidien : les cartes et généraux des sets marqués « daily », tous avec la même chance de sortir.
// Set d'origine d'une carte ou d'un général (« base » par défaut ; « recompense » : jamais dans un booster).
export const setOf = id => (CARDS[id] || GENERALS[id])?.set || 'base';
export const BOOSTER_POOL = OWNABLE.filter(id => setOf(id) === 'base');

// Généraux donnés par le deck de départ : les 2 de sa famille et les neutres du Set de base.
const famOf = starter => (DECKS[starter] ? DECKS[starter].fam : undefined);
export const starterGenerals = starter => GENERAL_IDS.filter(k => setOf(k) === 'base' && (GENERALS[k].fam === null || GENERALS[k].fam === famOf(starter)));
// Généraux jouables : ceux de la collection. Terrains jouables : les neutres et ceux des familles dont on possède un général,
// sauf ceux d'un set pas encore sorti (un général d'une famille existante ne doit pas les dévoiler).
export const allowedGenerals = ({ cards = {} } = {}) => GENERAL_IDS.filter(k => cards[k]);
export function allowedTerrains(account) {
  const fams = new Set(allowedGenerals(account).map(k => GENERALS[k].fam).filter(Boolean));
  return Object.keys(TERRAINS).filter(k => !unrevealed(k) && (TERRAINS[k].fam === null || fams.has(TERRAINS[k].fam)));
}
// Ajoute à un compte les généraux de son deck de départ qui lui manquent. Renvoie true si le compte a changé.
export function grantStarterGenerals(a) {
  if (!a.starter) return false;
  const miss = starterGenerals(a.starter).filter(k => !a.cards?.[k]);
  if (!miss.length) return false;
  a.cards = a.cards || {}; for (const k of miss) a.cards[k] = 1;
  return true;
}

// Collection et deck de départ : les 15 cartes du deck préconstruit choisi et ses généraux, une fois chacun.
export function starterKit(starter) {
  const d = DECKS[starter];
  return {
    cards: Object.fromEntries([...d.cards, ...starterGenerals(starter)].map(id => [id, 1])),
    deck: { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: d.general },
  };
}

// Booster quotidien : 3 cartes au hasard, dont au moins une que le joueur n'a pas (tant qu'il lui en manque).
export function openBooster(owned = {}, rand = pick) {
  const missing = BOOSTER_POOL.filter(id => !owned[id]);
  const cards = [missing.length ? rand(missing) : rand(BOOSTER_POOL), ...Array.from({ length: BOOSTER_SIZE - 1 }, () => rand(BOOSTER_POOL))];
  return shuffle(cards);
}

// Jour courant à Paris (AAAA-MM-JJ) : le booster quotidien revient à minuit, heure française.
// Le format est créé une fois : en créer un à chaque appel coûtait cher (unrevealed() le demande pour chaque carte affichée).
const PARIS_DAY = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' });
export const today = (d = new Date()) => PARIS_DAY.format(d);

// Renvoie un message d'erreur, ou null si le deck est jouable avec cette collection.
export function deckError(deck, account) {
  const owned = account.cards || {};
  if (!deck || !Array.isArray(deck.cards) || !Array.isArray(deck.terrains)) return t('Deck invalide.');
  if (!deck.general) return t('Choisissez un général.');
  if (deck.cards.length !== DECK_SIZE) return t('Le deck doit contenir {n} cartes (il en a {have}).', { n: DECK_SIZE, have: deck.cards.length });
  const count = {};
  for (const id of deck.cards) {
    if (!COLLECTIBLE.includes(id)) return t('Carte inconnue dans le deck.');
    count[id] = (count[id] || 0) + 1;
    if (count[id] > MAX_COPIES) return tp(MAX_COPIES, '{card} ne peut être qu\'en {n} exemplaire.', '{card} ne peut être qu\'en {n} exemplaires.', { card: CARDS[id].name });
    if (count[id] > (owned[id] || 0)) return t('Vous ne possédez pas {card}.', { card: CARDS[id].name });
  }
  if (deck.terrains.length !== DECK_TERRAINS || new Set(deck.terrains).size !== DECK_TERRAINS) return t('Choisissez {n} terrains différents.', { n: DECK_TERRAINS });
  if (!allowedGenerals(account).includes(deck.general)) return t('Vous ne possédez pas ce général.');
  const terrains = allowedTerrains(account), early = deck.terrains.find(t => unrevealed(t));
  if (early) return t('Le terrain {name} n\'est pas encore sorti : remplacez-le.', { name: TERRAINS[early].name });
  if (deck.terrains.some(t => !terrains.includes(t))) return t('Ce terrain demande un général de sa famille dans votre collection.');
  return null;
}

// Plusieurs decks par joueur. Un deck en cours de création peut être incomplet : il n'est jouable qu'une fois complet.
export const MAX_DECKS = 10;
// Renvoie un message d'erreur, ou null si ce deck (complet ou non) respecte la collection et les règles.
export function draftError(deck, account) {
  const owned = account.cards || {};
  if (!deck || !Array.isArray(deck.cards) || !Array.isArray(deck.terrains)) return t('Deck invalide.');
  if (deck.cards.length > DECK_SIZE) return t('Le deck contient {n} cartes au plus.', { n: DECK_SIZE });
  if (new Set(deck.cards).size !== deck.cards.length) return t('Une carte ne peut être qu\'en un exemplaire.');
  for (const id of deck.cards) {
    if (!COLLECTIBLE.includes(id)) return t('Carte inconnue dans le deck.');
    if (!owned[id]) return t('Vous ne possédez pas {card}.', { card: CARDS[id].name });
  }
  if (deck.terrains.length > DECK_TERRAINS || new Set(deck.terrains).size !== deck.terrains.length) return t('Choisissez {n} terrains différents au plus.', { n: DECK_TERRAINS });
  if (deck.terrains.some(t => unrevealed(t))) return t('Ce terrain n\'est pas encore sorti.');
  if (deck.terrains.some(t => !allowedTerrains(account).includes(t))) return t('Ce terrain demande un général de sa famille dans votre collection.');
  if (deck.general !== null && deck.general !== undefined && !allowedGenerals(account).includes(deck.general)) return t('Vous ne possédez pas ce général.');
  return null;
}

// ---- Codes de deck et recettes ----
// Un code de deck se copie et se colle pour partager un deck : « DK1- » puis le nom, le général, les terrains et les cartes
// (leurs identifiants), en base64url. Il ne dépend pas de la collection : chacun l'importe avec ce qu'il possède.
const DECK_CODE = 'DK1-';
const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
export const deckCode = d => DECK_CODE + b64([String(d.name || '').replace(/\|/g, ' ').trim().slice(0, 30), d.general || '', (d.terrains || []).join(','), (d.cards || []).join(',')].join('|'));
// Renvoie { name, general, terrains, cards }, ou null si le code est illisible. Les identifiants ne sont pas vérifiés ici (fitDeck le fait).
export function readDeckCode(code) {
  const m = String(code || '').trim().match(/^DK1-([A-Za-z0-9_-]{1,3000})$/); if (!m) return null;
  let parts; try { parts = unb64(m[1]).split('|'); } catch { return null; }
  if (parts.length !== 4) return null;
  const ids = s => (s ? s.split(',') : []).filter(id => /^[a-z0-9_]{1,30}$/.test(id));
  return { name: parts[0].trim().slice(0, 30), general: /^[a-z0-9_]{1,30}$/.test(parts[1]) ? parts[1] : null, terrains: ids(parts[2]).slice(0, DECK_TERRAINS), cards: ids(parts[3]).slice(0, DECK_SIZE) };
}
// Deck (code importé ou recette) ramené à une collection : ce que le joueur peut mettre dans un deck, et ce qui lui manque.
// Les cartes, généraux et terrains d'un set pas encore sorti, ou inconnus, sont comptés à part (« unknown ») sans être nommés.
export function fitDeck(d, account) {
  const own = account.cards || {}, gens = allowedGenerals(account), known = id => (CARDS[id] || GENERALS[id] || TERRAINS[id]) && !unrevealed(id);
  const missing = { general: null, terrains: [], cards: [], unknown: 0 };
  let general = null;
  if (d.general && known(d.general) && GENERALS[d.general]) { if (gens.includes(d.general)) general = d.general; else missing.general = d.general; }
  else if (d.general) missing.unknown++;
  // Terrains : ceux qu'autorisent les généraux possédés.
  const allowed = allowedTerrains(account), terrains = [];
  for (const t of new Set(d.terrains)) {
    if (!TERRAINS[t] || !known(t)) missing.unknown++;
    else if (allowed.includes(t)) terrains.push(t); else missing.terrains.push(t);
  }
  const cards = [];
  for (const id of new Set(d.cards)) {
    if (!COLLECTIBLE.includes(id) || !known(id)) missing.unknown++;
    else if (own[id]) cards.push(id); else missing.cards.push(id);
  }
  return { deck: { name: d.name, general, terrains: terrains.slice(0, DECK_TERRAINS), cards: cards.slice(0, DECK_SIZE) }, missing,
    complete: !!general && terrains.length === DECK_TERRAINS && cards.length === DECK_SIZE };
}
// Recettes : les decks préconstruits des sets sortis, à reconstruire avec sa collection.
export const recipeKeys = (day = today()) => aiDeckKeys(day).filter(k => DECKS[k].cards?.length === DECK_SIZE && DECKS[k].terrains?.length === DECK_TERRAINS && !DECKS[k].boss);

// ---- Doublons, sets et boutique ----
// Un deck ne prend qu'un exemplaire de chaque carte : chaque doublon obtenu devient des Éclats.
export const SHARDS_PER_DUPLICATE = 10;
export const SHOP = { dailyCards: 3, cardPrice: 300, boosterPrice: 250, boosterSize: 3 };
// Chaque set a son espace dans la boutique. Un set fermé (open: false) y apparaît comme « bientôt disponible ».
// daily : ses cartes sortent aussi du booster quotidien.
// boosterExtra : Éclats ajoutés au prix d'un booster (réglage boosterPrice de /admin) pour ce set ; une nouveauté coûte un peu plus.
export const DEFAULT_SETS = [
  { id: 'base', name: 'Set de base', cards: OWNABLE.filter(id => setOf(id) === 'base'), open: true, daily: true, teaser: '', boosterExtra: 0 },
  { id: 'set2', name: 'Crépuscule', cards: OWNABLE.filter(id => setOf(id) === 'set2'), open: true, daily: false, boosterExtra: 50,
    teaser: 'Morts-vivants et Vampires rejoignent la bataille, avec de nouveaux généraux pour chaque famille. Ses cartes arriveront d\'abord ici, en boosters et à l\'unité, avant de rejoindre le booster quotidien.' },
  // Mini-set (mini : pas de récompense par famille, seulement le set complet) : quelques cartes pour relancer la construction de decks.
  { id: 'tapis', name: 'Tapis vert', cards: OWNABLE.filter(id => setOf(id) === 'tapis'), open: true, daily: false, boosterExtra: 0, reveal: '2026-10-23', mini: true,
    teaser: 'Le casino des Fosses ouvre ses tables : des Paris au dé, des cartes pour tricher, trois Sept pour décrocher le Jackpot, et un coup de pouce pour les Anges et les Démons.' },
  { id: 'set3', name: 'Cité Néon', cards: OWNABLE.filter(id => setOf(id) === 'set3'), open: true, daily: false, boosterExtra: 50, reveal: '2026-11-02',
    teaser: 'Hackers et Cyborgs envahissent la mégapole : Malwares glissés dans le deck adverse, Piratage, Implants et Surcharge, avec un soutien néon pour chaque famille.' },
];
export const SETS = structuredClone(DEFAULT_SETS);
export const setById = id => SETS.find(s => s.id === id);
// Date de sortie d'un set (reveal, AAAA-MM-JJ heure de Paris) : avant, il n'existe pas pour les joueurs (boutique, collection, IA).
export const setRevealed = (set, day = today()) => !set?.reveal || day >= set.reveal;
// Un identifiant (carte, général, terrain, deck) dont le set d'origine n'est pas encore sorti. Les cartes de récompense suivent le set qui les donne.
export function unrevealed(id, day = today()) {
  const set = (CARDS[id] || GENERALS[id] || TERRAINS[id])?.set;
  if (!set || set === 'base') return false;
  const s = SETS.find(x => x.id === set) || DEFAULT_SETS.find(x => x.id === set);
  return !!s && !setRevealed(s, day);
}
// Decks préconstruits que l'IA peut jouer : ceux des sets déjà sortis.
export const aiDeckKeys = (day = today()) => Object.keys(DECKS).filter(k => { const s = DECKS[k].set && (SETS.find(x => x.id === DECKS[k].set) || DEFAULT_SETS.find(x => x.id === DECKS[k].set)); return !s || setRevealed(s, day); });
// Mini-set : seul le set complet est récompensé (pas de récompense par famille). Réglage du code, gardé si le catalogue l'a perdu.
export const isMini = set => !!(set?.mini ?? DEFAULT_SETS.find(d => d.id === set?.id)?.mini);
// Supplément du booster d'un set : celui du catalogue, sinon celui du set par défaut (catalogue publié avant le réglage).
export const boosterExtraOf = set => Math.max(0, Math.round(+(set.boosterExtra ?? DEFAULT_SETS.find(d => d.id === set.id)?.boosterExtra ?? 0) || 0));
export const setBoosterPrice = (set, price = SHOP.boosterPrice) => price + boosterExtraOf(set);
// Ordre de la boutique : les sets en vente du plus récent au plus ancien, puis ceux à venir.
export const shopOrder = sets => [...sets].reverse().sort((a, b) => !!b.open - !!a.open);

// Cartes du jour d'un set : tirées au hasard, en priorité parmi celles que le joueur n'a pas.
export function dailyOffers(set, owned, n = SHOP.dailyCards, rand = Math.random) {
  const order = ids => ids.map(id => [rand(), id]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  return [...order(set.cards.filter(id => !owned[id])), ...order(set.cards.filter(id => owned[id]))].slice(0, n);
}
// Doublons du jour : n cartes ou généraux possédés qui peuvent encore recevoir de l'essence (canLevel : pas au plafond), ceux des decks d'abord.
// Acheter un doublon donne l'essence d'un doublon de la carte.
export function dupOffers(account, n, canLevel, rand = Math.random) {
  const order = ids => ids.map(id => [rand(), id]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const mine = OWNABLE.filter(id => account.cards?.[id] && !unrevealed(id) && canLevel(id));
  const inDecks = new Set((account.decks || []).flatMap(d => [...d.cards, d.general]));
  return [...order(mine.filter(id => inDecks.has(id))), ...order(mine.filter(id => !inDecks.has(id)))].slice(0, n);
}
export function setBooster(set, rand = pick) { return Array.from({ length: SHOP.boosterSize }, () => rand(set.cards)); }

// ---- Change de devises ----
// Prismes changés en Éclats par offres fixes, jamais l'inverse ni au détail : plus l'offre est grosse, plus le bonus l'est.
// rate : Éclats pour 1 Prisme (réglage prismShards de /admin ; 0 ferme le change). Les Prismes contre de l'argent viendront plus tard.
export const EXCHANGE_TIERS = [{ id: 'x10', prisms: 10, bonus: 0 }, { id: 'x30', prisms: 30, bonus: 10 }, { id: 'x60', prisms: 60, bonus: 20 }, { id: 'x120', prisms: 120, bonus: 30 }];
export const exchangeOffers = rate => (rate > 0 ? EXCHANGE_TIERS.map(t => ({ ...t, shards: Math.round(t.prisms * rate * (1 + t.bonus / 100)) })) : []);
// Offre à proposer quand il manque `need` Éclats : la plus petite qui suffit, sinon la plus grosse.
export const exchangeFor = (rate, need) => { const all = exchangeOffers(rate); return all.find(o => o.shards >= need) || all.at(-1) || null; };
