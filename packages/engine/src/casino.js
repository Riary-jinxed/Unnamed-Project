// Événement du casino du Sept d'or (mini-set « Faites vos jeux ») : une monnaie à part, les Jetons, qui ne vit que le temps de
// l'événement. On en gagne avec la quête « La Nuit du Sept d'or » (chaque chapitre gagné la première fois), la machine à sous
// (quelques tirages par jour) et Quitte ou double, le mode rejouable débloqué à la fin de la quête. On les dépense à la boutique
// du casino : thème, cadre, arts de l'édition Casino, titre et ressources. Les dates sont celles de la quête (réglables dans /admin) ;
// la boutique reste ouverte SHOP_GRACE jours de plus, puis les Jetons qui restent disparaissent.
// Partagé par le serveur (server/src/casino.js, qui fait foi) et l'appli (client/src/casino.js, qui affiche et joue les parties).
import { CARDS, DECKS } from './engine.js';
import { EXTRA_THEMES } from './themes.js';
import { ARTS } from './arts.js';

export const CASINO_QUEST = 'casino';
// Jours où la boutique reste ouverte après la fin de la quête, pour dépenser ses derniers Jetons.
export const SHOP_GRACE = 3;
// Jetons de chaque chapitre de la quête, à la première victoire.
export const QUEST_CHIPS = [100, 120, 150, 300];

// ---- Machine à sous ----
// Trois rouleaux tirés par le serveur. weight : chance relative de chaque symbole sur un rouleau.
export const SLOT_PULLS = 3;
export const REEL = [
  { s: '7', weight: 2 }, { s: 'BAR', weight: 2 },
  { s: '♠', weight: 3 }, { s: '♥', weight: 3 }, { s: '♦', weight: 3 }, { s: '♣', weight: 3 },
];
// Gains d'un tirage (le meilleur qui s'applique).
export const SLOT_PAYS = [
  { id: 'jackpot', name: 'Jackpot : 7 7 7', chips: 300, test: r => r.every(x => x === '7') },
  { id: 'bars', name: 'Trois BAR', chips: 150, test: r => r.every(x => x === 'BAR') },
  { id: 'triple', name: 'Trois fois la même couleur', chips: 80, test: r => r[0] === r[1] && r[1] === r[2] },
  { id: 'sevens', name: 'Deux 7', chips: 50, test: r => r.filter(x => x === '7').length === 2 },
  { id: 'pair', name: 'Une paire', chips: 20, test: r => r[0] === r[1] || r[1] === r[2] || r[0] === r[2] },
  { id: 'none', name: 'Lot de consolation', chips: 10, test: () => true },
];
export const slotPay = reels => SLOT_PAYS.find(p => p.test(reels));
export function spinReels(rand = Math.random) {
  const total = REEL.reduce((n, x) => n + x.weight, 0);
  return [0, 1, 2].map(() => { let v = rand() * total; for (const x of REEL) { v -= x.weight; if (v < 0) return x.s; } return REEL[REEL.length - 1].s; });
}

// ---- Quitte ou double ----
// Une montée de tables contre l'IA. Chaque table gagnée met un pot sur le tapis : on l'encaisse, ou on le remet en jeu à la table
// suivante, plus dure et mieux payée. Une défaite fait tout perdre (sauf CONSOLATION). TABLE_RUNS montées par jour.
// L'adversaire de chaque table est tiré parmi les decks préconstruits sortis, la dernière table est celle de Fortuna.
// bonus : bonus de départ des zones adverses ; tries : force de l'IA.
export const TABLE_RUNS = 2;
export const CONSOLATION = 10;
export const TABLES = [
  { name: 'Table verte', pot: 40, tries: 30 },
  { name: 'Table rouge', pot: 90, tries: 70 },
  { name: 'Table d\'or', pot: 160, tries: 120, bonus: [0, 1, 0] },
  { name: 'Salon privé', pot: 260, tries: 180, bonus: [1, 0, 1] },
  { name: 'Table de Fortuna', pot: 400, tries: 250, bonus: [1, 1, 1], foe: 'tapis', general: 'fortuna' },
];
// Règle de la maison : une par table, tirée au hasard, pour que deux montées ne se ressemblent pas.
// setup(st) prépare la partie (joueur 0 : vous, joueur 1 : la maison) ; pot : multiplie le pot de la table.
export const RULES = {
  pipes: { name: 'Dés pipés', text: 'Les deux joueurs commencent avec 2 dés pipés : leurs 2 premiers dés font 6.',
    setup: st => { st.p[0].loaded += 2; st.p[1].loaded += 2; } },
  mise: { name: 'Mise de départ', text: 'Vous avez 1 sceau de plus au premier tour.',
    setup: st => { st.p[0].bonusSeals++; } },
  main: { name: 'Main chanceuse', text: 'Vous commencez avec 1 carte de plus en main.',
    setup: st => { const P = st.p[0]; if (P.deck.length) P.hand.push(P.deck.shift()); } },
  maison: { name: 'La maison triche', text: 'Les zones adverses commencent avec 1 de plus, mais le pot de cette table est augmenté de moitié.', pot: 1.5,
    setup: st => { for (let z = 0; z < 3; z++) st.p[1].zoneBonus[z]++; } },
  haute: { name: 'Carte haute', text: 'La carte la plus chère de votre deck commence dans votre main.',
    setup: st => { const P = st.p[0]; if (!P.deck.length) return; const k = P.deck.reduce((b, c, i) => ((CARDS[c.id]?.cost ?? 0) > (CARDS[P.deck[b].id]?.cost ?? 0) ? i : b), 0); P.hand.push(...P.deck.splice(k, 1)); } },
};
export const RULE_IDS = Object.keys(RULES);
export const tablePot = (i, rule) => Math.round(TABLES[i].pot * (RULES[rule]?.pot || 1));
// Adversaire d'une table : un deck préconstruit (pool : decks sortis), sauf à la dernière table.
export function drawTable(i, pool, rand = Math.random) {
  const T = TABLES[i], keys = pool.filter(k => DECKS[k] && k !== 'tapis');
  const deck = T.foe || keys[Math.floor(rand() * keys.length)];
  const rule = RULE_IDS[Math.floor(rand() * RULE_IDS.length)];
  return { i, deck, general: T.general || DECKS[deck].general, rule };
}
// Partie d'une table pour le moteur : le deck adverse et la préparation (bonus de zone et règle de la maison).
export function tableGame(table) {
  const d = DECKS[table.deck], T = TABLES[table.i];
  return { foe: { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: table.general }, tries: T.tries,
    setup: st => { (T.bonus || []).forEach((n, z) => { st.p[1].zoneBonus[z] += n; }); RULES[table.rule]?.setup(st); } };
}

// ---- Boutique ----
// kind : theme, frame, art, title (cosmétiques, une fois) ; shards, prisms, boosters, uniEssence (ressources, limit fois par événement).
// Un thème ou un art absent du catalogue n'est pas montré (le thème casino arrive avec sa propre mise à jour).
export const CASINO_FRAME = 'jackpot';
export const CASINO_TITLE = 'roi_tapis';
export const CASINO_SHOP = [
  { id: 'theme:casino', kind: 'theme', name: 'Thème Roue de Fortuna', price: 2500 },
  { id: `frame:${CASINO_FRAME}`, kind: 'frame', name: 'Cadre du Jackpot', price: 1200 },
  { id: 'art:fortuna_grande_roue', kind: 'art', name: 'Fortuna, la grande roue d\'or', price: 1500 },
  { id: 'art:velours_sept_or', kind: 'art', name: 'Velours, la nuit du Sept d\'or', price: 1000 },
  { id: 'art:joueuse_des_mise', kind: 'art', name: 'Joueuse de dés, mise gagnante', price: 600 },
  { id: `title:${CASINO_TITLE}`, kind: 'title', name: 'Titre « Roi du tapis »', price: 400 },
  { id: 'boosters', kind: 'boosters', n: 1, name: 'Booster offert', price: 125, limit: 6 },
  { id: 'shards', kind: 'shards', n: 300, name: '300 Éclats', price: 150, limit: 10 },
  { id: 'prisms', kind: 'prisms', n: 10, name: '10 Prismes', price: 300, limit: 5 },
  { id: 'uniEssence', kind: 'uniEssence', n: 100, name: '100 essence universelle', price: 250, limit: 5 },
];
export const casinoItem = id => CASINO_SHOP.find(x => x.id === id) || null;
export const isCasinoCosmetic = x => ['theme', 'frame', 'art', 'title'].includes(x.kind);
export const itemKey = x => x.id.slice(x.kind.length + 1);
// L'objet existe-t-il dans cette version du jeu (thème et arts) ?
export const itemReady = x => x.kind === 'theme' ? EXTRA_THEMES[itemKey(x)]?.event === CASINO_QUEST : x.kind === 'art' ? !!ARTS[itemKey(x)] : true;

// ---- Calendrier ----
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Phase de l'événement un jour donné, d'après les dates de la quête : 'soon', 'open' (on gagne et on dépense), 'shop' (on dépense
// seulement) ou 'over'.
export function casinoPhase(cfg, day) {
  if (!cfg?.on || !cfg.from || !cfg.to) return 'over';
  if (day < cfg.from) return 'soon';
  if (day <= cfg.to) return 'open';
  return day <= addDays(cfg.to, SHOP_GRACE) ? 'shop' : 'over';
}
export const shopUntil = cfg => addDays(cfg.to, SHOP_GRACE);
