// Collection d'un joueur : deck de départ, booster quotidien et règles de construction de deck.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche et prévient avant d'envoyer).
import { CARDS, GENERALS, TERRAINS, DECKS, pick, shuffle } from './engine.js';

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
// Généraux jouables : ceux de la collection. Terrains jouables : les neutres et ceux des familles dont on possède un général.
export const allowedGenerals = ({ cards = {} } = {}) => GENERAL_IDS.filter(k => cards[k]);
export function allowedTerrains(account) {
  const fams = new Set(allowedGenerals(account).map(k => GENERALS[k].fam).filter(Boolean));
  return Object.keys(TERRAINS).filter(k => (TERRAINS[k].fam === null && !unrevealed(k)) || fams.has(TERRAINS[k].fam));
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
export const today = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

// Renvoie un message d'erreur, ou null si le deck est jouable avec cette collection.
export function deckError(deck, account) {
  const owned = account.cards || {};
  if (!deck || !Array.isArray(deck.cards) || !Array.isArray(deck.terrains)) return 'Deck invalide.';
  if (!deck.general) return 'Choisissez un général.';
  if (deck.cards.length !== DECK_SIZE) return `Le deck doit contenir ${DECK_SIZE} cartes (il en a ${deck.cards.length}).`;
  const count = {};
  for (const id of deck.cards) {
    if (!COLLECTIBLE.includes(id)) return 'Carte inconnue dans le deck.';
    count[id] = (count[id] || 0) + 1;
    if (count[id] > MAX_COPIES) return `${CARDS[id].name} ne peut être qu'en ${MAX_COPIES} exemplaire.`;
    if (count[id] > (owned[id] || 0)) return `Vous ne possédez pas ${CARDS[id].name}.`;
  }
  if (deck.terrains.length !== DECK_TERRAINS || new Set(deck.terrains).size !== DECK_TERRAINS) return `Choisissez ${DECK_TERRAINS} terrains différents.`;
  if (!allowedGenerals(account).includes(deck.general)) return 'Vous ne possédez pas ce général.';
  const terrains = allowedTerrains(account);
  if (deck.terrains.some(t => !terrains.includes(t))) return 'Ce terrain demande un général de sa famille dans votre collection.';
  return null;
}

// Plusieurs decks par joueur. Un deck en cours de création peut être incomplet : il n'est jouable qu'une fois complet.
export const MAX_DECKS = 5;
// Renvoie un message d'erreur, ou null si ce deck (complet ou non) respecte la collection et les règles.
export function draftError(deck, account) {
  const owned = account.cards || {};
  if (!deck || !Array.isArray(deck.cards) || !Array.isArray(deck.terrains)) return 'Deck invalide.';
  if (deck.cards.length > DECK_SIZE) return `Le deck contient ${DECK_SIZE} cartes au plus.`;
  if (new Set(deck.cards).size !== deck.cards.length) return 'Une carte ne peut être qu\'en un exemplaire.';
  for (const id of deck.cards) {
    if (!COLLECTIBLE.includes(id)) return 'Carte inconnue dans le deck.';
    if (!owned[id]) return `Vous ne possédez pas ${CARDS[id].name}.`;
  }
  if (deck.terrains.length > DECK_TERRAINS || new Set(deck.terrains).size !== deck.terrains.length) return `Choisissez ${DECK_TERRAINS} terrains différents au plus.`;
  if (deck.terrains.some(t => !allowedTerrains(account).includes(t))) return 'Ce terrain demande un général de sa famille dans votre collection.';
  if (deck.general !== null && deck.general !== undefined && !allowedGenerals(account).includes(deck.general)) return 'Vous ne possédez pas ce général.';
  return null;
}

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
