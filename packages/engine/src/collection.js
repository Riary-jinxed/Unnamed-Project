// Collection d'un joueur : deck de départ, booster quotidien et règles de construction de deck.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche et prévient avant d'envoyer).
import { CARDS, GENERALS, TERRAINS, DECKS, pick } from './engine.js';

export const STARTERS = ['gobelin', 'elfe', 'demon'];
export const DECK_SIZE = 15, DECK_TERRAINS = 5, MAX_COPIES = 1, BOOSTER_SIZE = 5;
// Toutes les cartes du set (hors jetons) ont la même chance de sortir d'un booster.
export const BOOSTER_POOL = Object.keys(CARDS).filter(k => !CARDS[k].token);

// Généraux et terrains accessibles : les neutres et ceux de la famille du deck de départ.
const famOf = starter => (DECKS[starter] ? DECKS[starter].fam : undefined);
export const allowedGenerals = starter => Object.keys(GENERALS).filter(k => GENERALS[k].fam === null || GENERALS[k].fam === famOf(starter));
export const allowedTerrains = starter => Object.keys(TERRAINS).filter(k => TERRAINS[k].fam === null || TERRAINS[k].fam === famOf(starter));

// Collection et deck de départ : les 15 cartes du deck préconstruit choisi, une fois chacune.
export function starterKit(starter) {
  const d = DECKS[starter];
  return {
    cards: Object.fromEntries(d.cards.map(id => [id, 1])),
    deck: { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: d.general },
  };
}

export function openBooster(rand = pick) { return Array.from({ length: BOOSTER_SIZE }, () => rand(BOOSTER_POOL)); }

// Jour courant à Paris (AAAA-MM-JJ) : le booster quotidien revient à minuit, heure française.
export const today = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

// Renvoie un message d'erreur, ou null si le deck est jouable avec cette collection.
export function deckError(deck, { cards: owned, starter }) {
  if (!deck || !Array.isArray(deck.cards) || !Array.isArray(deck.terrains)) return 'Deck invalide.';
  if (deck.cards.length !== DECK_SIZE) return `Le deck doit contenir ${DECK_SIZE} cartes (il en a ${deck.cards.length}).`;
  const count = {};
  for (const id of deck.cards) {
    if (!BOOSTER_POOL.includes(id)) return 'Carte inconnue dans le deck.';
    count[id] = (count[id] || 0) + 1;
    if (count[id] > MAX_COPIES) return `${CARDS[id].name} ne peut être qu'en ${MAX_COPIES} exemplaire.`;
    if (count[id] > (owned[id] || 0)) return `Vous ne possédez pas ${CARDS[id].name}.`;
  }
  if (deck.terrains.length !== DECK_TERRAINS || new Set(deck.terrains).size !== DECK_TERRAINS) return `Choisissez ${DECK_TERRAINS} terrains différents.`;
  const terrains = allowedTerrains(starter);
  if (deck.terrains.some(t => !terrains.includes(t))) return 'Ce terrain n\'est pas accessible avec votre deck de départ.';
  if (!allowedGenerals(starter).includes(deck.general)) return 'Ce général n\'est pas accessible avec votre deck de départ.';
  return null;
}
