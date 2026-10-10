// Arts alternatifs : d'autres illustrations pour une carte ou un général, purement cosmétiques (la carte joue pareil).
// Partagé par le serveur (ventes, stock des éditions Limited, sélection) et l'appli (boutique, collection, partie).
// Les images se rangent dans client/src/art/alt/<id de l'art>/ (decor.webp, perso.webp) ; tant qu'elles manquent,
// l'appli affiche un art provisoire, et l'art reste vendable.
import { CARDS, GENERALS } from './engine.js';

// Raretés classiques. price : prix par défaut en Éclats (réglable dans /admin) ; weight : chance relative de sortir
// dans les offres du jour et dans le coffre.
export const ART_RARITIES = {
  commun: { name: 'Commun', price: 100, weight: 40 },
  peu_commun: { name: 'Peu commun', price: 200, weight: 28 },
  rare: { name: 'Rare', price: 400, weight: 16 },
  super_rare: { name: 'Super-rare', price: 700, weight: 9 },
  epique: { name: 'Épique', price: 1100, weight: 5 },
  legendaire: { name: 'Légendaire', price: 1600, weight: 2 },
};
export const RARITY_IDS = Object.keys(ART_RARITIES);
// Éditions à part :
// - limited : rareté unique, un nombre fixe d'exemplaires numérotés, en vente entre deux dates (from, until, jour de Paris inclus) ;
//   chaque art a son prix et son stock. Il ne sort jamais du coffre ni des offres du jour.
// - promo : jamais en vente ; donné par un code, un événement, un succès (aujourd'hui, depuis /admin). Garde une rareté classique.
export const LIMITED = { name: 'Limited', price: 2500 };
export function rarityName(art) {
  const name = ART_RARITIES[art.rarity]?.name || art.rarity;
  return art.edition === 'limited' ? LIMITED.name : art.edition === 'promo' ? `Promo ${name.toLowerCase()}` : name;
}
// Classe CSS de la rareté (style.css, « .rar-… »).
export const rarityKey = art => (art.edition === 'limited' ? 'limited' : art.rarity);

// Catalogue. Un art = { card, name, rarity } ; Limited : edition, stock, from, until, price ; Promo : edition, how (comment l'obtenir).
// Ajouter un art : une ligne ici, puis ses images dans client/src/art/alt/<id>/ quand elles sont prêtes.
const A = (id, card, name, rarity, extra = {}) => [id, { id, card, name, rarity, ...extra }];
export const ARTS = Object.fromEntries([
  // Anges
  A('seraphine_zenith', 'seraphine', 'Séraphine au zénith', 'rare'),
  A('aurelia_vitrail', 'aurelia', 'Aurélia, vitrail du Serment', 'super_rare'),
  A('cherubin_nuage', 'cherubin', 'Chérubin des nuées', 'commun'),
  A('archange_jugement', 'archange', 'Archange du Jugement dernier', 'legendaire'),
  // Démons
  A('morgrath_braises', 'morgrath', 'Morgrath dans les braises', 'rare'),
  A('vorgoth_cercle', 'vorgoth', 'Vorgoth et le cercle pourpre', 'epique'),
  A('diablotin_farceur', 'diablotin', 'Diablotin farceur', 'commun'),
  A('archidemon_couronne', 'archidemon', 'Archidémon couronné', 'super_rare'),
  // Gobelins
  A('grisk_butin', 'grisk', 'Grisk sur son butin', 'peu_commun'),
  A('snagg_festin', 'snagg', 'Snagg au grand festin', 'rare'),
  A('pyromane_feu_artifice', 'pyromane', 'Pyromane, nuit des feux', 'peu_commun'),
  A('grand_chef_totem', 'grand_chef', 'Grand-chef du totem', 'epique'),
  // Elfes
  A('sylvaen_automne', 'sylvaen', 'Sylvaën d\'automne', 'peu_commun'),
  A('lirael_tempete', 'lirael', 'Lirael dans la tempête', 'super_rare'),
  A('feu_follet_lanterne', 'feu_follet', 'Feu follet des lanternes', 'commun'),
  A('reine_couronne_fleurs', 'reine', 'Reine aux mille fleurs', 'legendaire'),
  // Dragons
  A('vaelthar_glacier', 'vaelthar', 'Vael\'Thar des glaciers', 'rare'),
  A('ignaroth_eclipse', 'ignaroth', 'Ignaroth sous l\'éclipse', 'epique'),
  A('dragonnet_tresor', 'dragonnet', 'Dragonnet sur le trésor', 'commun'),
  A('dragon_or_soleil', 'dragon_or', 'Dragon d\'or, soleil levant', 'super_rare'),
  // Neutres
  A('golem_mousse', 'golem', 'Golem moussu', 'commun'),
  A('barde_taverne', 'barde', 'Barde de la taverne', 'peu_commun'),
  // Éditions à part
  A('aurvax_eclipse', 'dieu_base', 'Aurvax, trésor de l\'éclipse', 'legendaire', { edition: 'limited', stock: 50, from: '2026-10-01', until: '2026-12-31', price: 2500 }),
  A('seraphine_pionniere', 'seraphine', 'Séraphine des pionniers', 'rare', { edition: 'promo', how: 'Offert aux premiers joueurs.' }),
]);

// Les arts dont la carte existe (le catalogue publié depuis /admin peut en avoir retiré).
export const artExists = id => { const a = ARTS[id]; return !!a && !!(CARDS[a.card] || GENERALS[a.card]); };
export const artsOf = card => Object.values(ARTS).filter(a => a.card === card && artExists(a.id));
// Vendable dans les offres du jour et le coffre : les raretés classiques hors Promo.
export const isClassic = a => !a.edition && !!ART_RARITIES[a.rarity];
// Limited en vente ce jour-là (stock à vérifier à part).
export const limitedOpen = (a, day) => a.edition === 'limited' && (!a.from || day >= a.from) && (!a.until || day <= a.until);

// Prix d'un art avec les réglages de la boutique (artPrice_<rareté>), le prix propre d'une Limited sinon.
export const artPrice = (a, cfg = {}) => (a.edition === 'limited' ? a.price ?? LIMITED.price : cfg[`artPrice_${a.rarity}`] ?? ART_RARITIES[a.rarity]?.price ?? 0);

// Tirage pondéré par la rareté. bonus(art) multiplie la chance (offres : les arts des cartes possédées d'abord).
export function weightedPick(arts, rand = Math.random, bonus = () => 1) {
  const w = arts.map(a => (ART_RARITIES[a.rarity]?.weight || 0) * bonus(a)), total = w.reduce((s, x) => s + x, 0);
  if (!total) return null;
  let r = rand() * total;
  for (let i = 0; i < arts.length; i++) { r -= w[i]; if (r < 0) return arts[i]; }
  return arts[arts.length - 1];
}
// Offres du jour : n arts classiques différents, que le joueur n'a pas, ceux de ses cartes trois fois plus souvent.
export function artOffers(ownedArts = {}, ownedCards = {}, n = 4, rand = Math.random) {
  let pool = Object.values(ARTS).filter(a => isClassic(a) && artExists(a.id) && !ownedArts[a.id]);
  const out = [];
  while (out.length < n && pool.length) {
    const a = weightedPick(pool, rand, x => (ownedCards[x.card] ? 3 : 1));
    out.push(a.id); pool = pool.filter(x => x !== a);
  }
  return out;
}
// Coffre : un art classique que le joueur n'a pas, tiré selon sa rareté. Chances affichées dans la boutique.
export const chestPool = (ownedArts = {}) => Object.values(ARTS).filter(a => isClassic(a) && artExists(a.id) && !ownedArts[a.id]);
export function chestRates(ownedArts = {}) {
  const pool = chestPool(ownedArts), total = pool.reduce((s, a) => s + ART_RARITIES[a.rarity].weight, 0);
  return RARITY_IDS.map(r => { const n = pool.filter(a => a.rarity === r).length;
    return { rarity: r, name: ART_RARITIES[r].name, count: n, pct: total ? Math.round(1000 * n * ART_RARITIES[r].weight / total) / 10 : 0 }; }).filter(x => x.count);
}
