// Arts alternatifs : d'autres illustrations pour une carte ou un général, purement cosmétiques (la carte joue pareil).
// Partagé par le serveur (ventes, sélection) et l'appli (boutique, collection, partie). Ils se paient en Prismes, une monnaie
// à part et rare (fin de saison classée, succès ; plus tard événements et passe de saison), jamais en Éclats.
// Les images se rangent dans client/src/art/alt/<id de l'art>/ (decor.webp, perso.webp) ; tant qu'elles manquent,
// l'appli affiche un art provisoire, et l'art reste vendable.
import { CARDS, GENERALS } from './engine.js';
import { today } from './collection.js';

// Raretés. price : prix par défaut en Prismes (réglable dans /admin) ; weight : chance relative de sortir
// dans les offres du jour et dans le coffre. D'autres raretés pourront s'ajouter ici.
export const ART_RARITIES = {
  rare: { name: 'Rare', price: 40, weight: 70 },
  epique: { name: 'Épique', price: 80, weight: 25 },
  legendaire: { name: 'Légendaire', price: 150, weight: 5 },
};
export const RARITY_IDS = Object.keys(ART_RARITIES);
// Édition Promo : jamais en vente ; donnée par un code, un événement, un succès (aujourd'hui, depuis /admin). Garde sa rareté.
export function rarityName(art) {
  const name = ART_RARITIES[art.rarity]?.name || art.rarity;
  return art.edition === 'promo' ? `Promo ${name.toLowerCase()}` : name;
}
// Classe CSS de la rareté (style.css, « .rar-… »).
export const rarityKey = art => art.rarity;

// Catalogue. Un art = { card, name, rarity } ; Promo : edition, how (comment l'obtenir).
// Ajouter un art : une ligne ici, puis ses images dans client/src/art/alt/<id>/ quand elles sont prêtes.
const A = (id, card, name, rarity, extra = {}) => [id, { id, card, name, rarity, ...extra }];
export const ARTS = Object.fromEntries([
  // Anges
  A('seraphine_zenith', 'seraphine', 'Séraphine au zénith', 'rare'),
  A('aurelia_vitrail', 'aurelia', 'Aurélia, vitrail du Serment', 'epique'),
  A('cherubin_nuage', 'cherubin', 'Chérubin des nuées', 'rare'),
  A('archange_jugement', 'archange', 'Archange du Jugement dernier', 'legendaire'),
  // Démons
  A('morgrath_braises', 'morgrath', 'Morgrath dans les braises', 'rare'),
  A('vorgoth_cercle', 'vorgoth', 'Vorgoth et le cercle pourpre', 'epique'),
  A('diablotin_farceur', 'diablotin', 'Diablotin farceur', 'rare'),
  A('archidemon_couronne', 'archidemon', 'Archidémon couronné', 'epique'),
  // Gobelins
  A('grisk_butin', 'grisk', 'Grisk sur son butin', 'rare'),
  A('snagg_festin', 'snagg', 'Snagg au grand festin', 'rare'),
  A('pyromane_feu_artifice', 'pyromane', 'Pyromane, nuit des feux', 'rare'),
  A('grand_chef_totem', 'grand_chef', 'Grand-chef du totem', 'epique'),
  // Elfes
  A('sylvaen_automne', 'sylvaen', 'Sylvaën d\'automne', 'rare'),
  A('lirael_tempete', 'lirael', 'Lirael dans la tempête', 'epique'),
  A('feu_follet_lanterne', 'feu_follet', 'Feu follet des lanternes', 'rare'),
  A('reine_couronne_fleurs', 'reine', 'Reine aux mille fleurs', 'legendaire'),
  // Dragons
  A('vaelthar_glacier', 'vaelthar', 'Vael\'Thar des glaciers', 'rare'),
  A('ignaroth_eclipse', 'ignaroth', 'Ignaroth sous l\'éclipse', 'epique'),
  A('dragonnet_tresor', 'dragonnet', 'Dragonnet sur le trésor', 'rare'),
  A('dragon_or_soleil', 'dragon_or', 'Dragon d\'or, soleil levant', 'legendaire'),
  // Neutres
  A('golem_mousse', 'golem', 'Golem moussu', 'rare'),
  A('barde_taverne', 'barde', 'Barde de la taverne', 'rare'),
  // Promo
  A('seraphine_pionniere', 'seraphine', 'Séraphine des pionniers', 'rare', { edition: 'promo', how: 'Offert aux premiers joueurs.' }),
  // Promo des passes de saison (pass.js) : season = mois de la saison ; cachés dans l'appli avant le début de leur saison.
  A('morgrath_citrouilles', 'morgrath', 'Morgrath, nuit des citrouilles', 'epique', { edition: 'promo', season: '2026-10', how: 'Passe de saison Nuit des citrouilles : 4 missions de saison accomplies.' }),
  A('grisk_farce', 'grisk', 'Grisk, farce ou friandise', 'legendaire', { edition: 'promo', season: '2026-10', how: 'Passe de saison Nuit des citrouilles : toutes les missions de saison accomplies.' }),
  A('lirael_neon', 'lirael', 'Lirael sous les néons', 'epique', { edition: 'promo', season: '2026-11', how: 'Passe de saison Néon 2099 : 4 missions de saison accomplies.' }),
  A('vaelthar_chrome', 'vaelthar', 'Vael\'Thar chromé', 'legendaire', { edition: 'promo', season: '2026-11', how: 'Passe de saison Néon 2099 : toutes les missions de saison accomplies.' }),
]);

// Les arts dont la carte existe (le catalogue publié depuis /admin peut en avoir retiré).
export const artExists = id => { const a = ARTS[id]; return !!a && !!(CARDS[a.card] || GENERALS[a.card]); };
// Les arts Promo d'une saison pas encore commencée ne se montrent pas.
export const artVisible = a => !a.season || a.season <= today().slice(0, 7);
export const artsOf = card => Object.values(ARTS).filter(a => a.card === card && artExists(a.id) && artVisible(a));
// Vendable dans les offres du jour et le coffre : les raretés classiques hors Promo.
export const isClassic = a => !a.edition && !!ART_RARITIES[a.rarity];
// Prix d'un art en Prismes, avec les réglages de la boutique (artPrice_<rareté>).
export const artPrice = (a, cfg = {}) => cfg[`artPrice_${a.rarity}`] ?? ART_RARITIES[a.rarity]?.price ?? 0;

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
