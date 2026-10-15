// Boss mondial : données partagées par le serveur (server/src/boss.js) et l'appli (client/src/boss.js).
// Chaque semaine (du lundi au dimanche, heure de Paris), un boss de la rotation est ouvert à tous. Une tentative est une partie
// de 7 tours contre lui : le boss (un général boss: true de engine.js) n'a ni carte ni terrain, mais agit à chaque tour selon son
// script, sur votre plateau, votre main ou votre deck. Le score de la tentative vient de la puissance de vos 3 zones à la fin.
// Chaque tentative rapporte ses paliers de points atteints ; le total de la semaine fait le classement, récompensé à sa clôture.
// Les Insignes, gagnées ainsi, se dépensent au magasin du boss. Tous les chiffres se règlent dans l'onglet Boss de /admin.
import { GENERALS, CARDS, newGame, zonePower, SLOTS } from './engine.js';
import { today } from './collection.js';
import { weekOf } from './pass.js';
import { t } from './i18n.js';

// Les boss de clan (clan: true, clan-boss.js) n'entrent pas dans la rotation du boss mondial.
export const BOSS_IDS = Object.keys(GENERALS).filter(g => GENERALS[g].boss && !GENERALS[g].clan);
export const isBoss = id => !!GENERALS[id]?.boss && !GENERALS[id].clan;
// Ce que l'appli montre d'un boss : son script tour par tour et les cartes qu'il renforce.
export function bossInfo(id) {
  const g = GENERALS[id]; if (!g?.boss) return null;
  return { id, name: g.name, fam: g.fam, art: g.art, text: g.text, boost: g.boost,
    script: g.script.map((s, i) => ({ turn: i + 1, when: s.when, name: s.name, text: s.text })) };
}
export const bossBoostLabel = b => [...Object.entries(b.fams).map(([f, n]) => `${t(f)} +${n}`), ...Object.entries(b.cards).map(([id, n]) => `${CARDS[id]?.name || id} +${n}`)];

// ---- Semaine et rotation ----
// La semaine du jeu : son lundi (AAAA-MM-JJ). Le boss d'une semaine : la rotation, à partir de la semaine de référence.
export const bossWeek = (d = new Date()) => weekOf(today(d));
const REF_WEEK = '2026-10-12';
export const addWeeks = (week, n) => new Date(Date.parse(`${week}T12:00:00Z`) + n * 7 * 86400000).toISOString().slice(0, 10);
export const weekIndex = week => Math.round((Date.parse(`${week}T12:00:00Z`) - Date.parse(`${REF_WEEK}T12:00:00Z`)) / (7 * 86400000));
export function bossOfWeek(week, rotation = BOSS_IDS) {
  const list = rotation.filter(isBoss); if (!list.length) return null;
  return list[((weekIndex(week) % list.length) + list.length) % list.length];
}
// Dernier jour de la semaine (dimanche) et jours qui restent, aujourd'hui compris.
export const weekLast = week => new Date(Date.parse(`${week}T12:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
export const weekDaysLeft = (week, day = today()) => Math.max(1, Math.round((Date.parse(`${weekLast(week)}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000) + 1);

// ---- Partie ----
// Le boss joue en siège 1 : deck et terrains vides, son général porte le script.
export function newBossGame(deck, boss, name = 'Vous') {
  return newGame(deck, { name: GENERALS[boss].name, cards: [], terrains: [], general: boss }, [name, GENERALS[boss].name], { generals: [deck.general, boss] });
}
// Score d'une tentative : chaque point de puissance d'une zone (au moins 0) vaut perPower points ; une zone pleine (4 créatures)
// en ajoute fullZone, et une zone où vous dépassez la puissance du boss, beatZone.
export function bossScore(st, cfg = DEFAULT_BOSS) {
  const zones = [0, 1, 2].map(z => {
    const raw = zonePower(st, 0, z), power = Math.max(0, raw), full = st.p[0].board[z].filter(c => c.revealed && CARDS[c.id].type === 'C').length >= SLOTS;
    const beat = raw > zonePower(st, 1, z);
    return { power, full, beat, points: power * cfg.perPower + (full ? cfg.fullZone : 0) + (beat ? cfg.beatZone : 0) };
  });
  return { zones, total: zones.reduce((s, z) => s + z.points, 0) };
}

// ---- Récompenses ----
// Paliers d'une tentative : chaque palier atteint donne sa récompense (ils se cumulent), une fois par jour : les tentatives
// suivantes ne paient que les paliers pas encore atteints ce jour-là (server/src/boss.js, finish). xp : XP du compte.
// Classement de la semaine, à sa clôture : les places (top) d'abord, puis la part du classement (pct : dans les x % premiers).
// Tout joueur qui a fait au moins une tentative tombe dans une tranche (la dernière va jusqu'à 100 %).
export const DEFAULT_BOSS = {
  on: true, attempts: 3, perPower: 10, fullZone: 30, beatZone: 50, rotation: BOSS_IDS.slice(),
  tiers: [
    { points: 200, coins: 5, shards: 10, xp: 20 },
    { points: 350, coins: 8, shards: 15, xp: 30 },
    { points: 500, coins: 10, shards: 20, xp: 40 },
    { points: 650, coins: 12, shards: 25, xp: 50 },
    { points: 850, coins: 15, shards: 40, xp: 60 },
  ],
  ranks: [
    { id: 'top1', top: 1, name: '1re place', coins: 600, prisms: 50, title: 'boss:top1' },
    { id: 'top3', top: 3, name: 'Podium', coins: 450, prisms: 30, title: 'boss:top3' },
    { id: 'top10', top: 10, name: 'Top 10', coins: 300, prisms: 15, title: 'boss:top10' },
    { id: 'top50', top: 50, name: 'Top 50', coins: 200, prisms: 8 },
    { id: 'pct10', pct: 10, name: '10 % meilleurs', coins: 150, prisms: 5 },
    { id: 'pct25', pct: 25, name: '10 à 25 %', coins: 100, prisms: 2 },
    { id: 'pct50', pct: 50, name: '25 à 50 %', coins: 70 },
    { id: 'pct100', pct: 100, name: '50 à 100 %', coins: 40 },
  ],
  // Magasin : prix en Insignes ; limit : achats par semaine (0 : une seule fois, pour les cosmétiques).
  shop: {},
};
// Objets du magasin. kind : boosters, chests (coffres d'arts offerts), prisms, uniEssence, shards (ressources, n par achat),
// ou art, title, frame, back, theme (cosmétiques, une seule fois). price et limit par défaut, réglables dans /admin (cfg.shop[id]).
const S = (id, kind, name, price, limit, extra = {}) => ({ id, kind, name, price, limit, ...extra });
export const BOSS_SHOP = [
  // Un booster vaut le même prix que 300 Éclats.
  S('shards', 'shards', '300 Éclats', 100, 3, { n: 300 }),
  S('booster', 'boosters', 'Booster offert', 100, 2, { n: 1 }),
  S('essence', 'uniEssence', '30 essence universelle', 120, 3, { n: 30 }),
  S('prisms', 'prisms', '10 Prismes', 180, 2, { n: 10 }),
  S('chest', 'chests', 'Coffre d\'arts offert', 300, 1, { n: 1 }),
  S('title:boss:chasseur', 'title', 'Titre « Chasseur de boss »', 250, 0),
  S('back:boss_trophee', 'back', 'Dos du trophée', 500, 0),
  S('frame:boss_crocs', 'frame', 'Cadre des crocs', 700, 0),
  // Cadres animés (client/src/frames-anim.css).
  S('frame:boss_comete', 'frame', 'Cadre de la comète', 900, 0),
  S('frame:boss_brasier', 'frame', 'Cadre du brasier', 900, 0),
  S('art:chevalier_boss', 'art', 'Chevalier, tueur de boss', 500, 0),
  S('art:vaelthar_trophee', 'art', 'Vael\'Thar, trophée du glacier', 800, 0),
  S('art:vorgoth_trophee', 'art', 'Vorgoth, trophée du cercle', 800, 0),
  S('art:ignaroth_trophee', 'art', 'Ignaroth, vaincu sous l\'éclipse', 1200, 0),
  // Thème de l'interface (themes.js), choisi dès l'achat.
  S('theme:eclipse', 'theme', 'Thème « Éclipse d\'Ignaroth »', 1500, 0),
];
export const bossItem = id => BOSS_SHOP.find(x => x.id === id) || null;
// Prix et limite d'un objet avec les réglages de /admin.
export const itemPrice = (x, cfg = DEFAULT_BOSS) => cfg.shop?.[x.id]?.price ?? x.price;
export const itemLimit = (x, cfg = DEFAULT_BOSS) => cfg.shop?.[x.id]?.limit ?? x.limit;
// Cosmétiques du boss mondial, ajoutés aux listes de rewards.js.
export const BOSS_TITLES = [['boss:chasseur', 'Chasseur de boss'], ['boss:top1', 'Fléau des boss'], ['boss:top3', 'Terreur des boss'], ['boss:top10', 'Chasseur d\'élite']];
export const BOSS_FRAMES = [['boss_crocs', 'Cadre des crocs'], ['boss_comete', 'Cadre de la comète'], ['boss_brasier', 'Cadre du brasier']];
export const BOSS_BACKS = [['boss_trophee', 'Dos du trophée']];

// Paliers atteints par un score (indices dans tiers).
export const tiersReached = (score, tiers = DEFAULT_BOSS.tiers) => tiers.map((t, i) => (score >= t.points ? i : -1)).filter(i => i >= 0);
// Tranche du classement d'un joueur : sa place (1 = premier) parmi n joueurs.
export function rankBracket(pos, n, ranks = DEFAULT_BOSS.ranks) {
  if (!pos || !n) return null;
  return ranks.find(r => (r.top ? pos <= r.top : 100 * pos / n <= r.pct)) || ranks[ranks.length - 1] || null;
}

// Bornes des réglages de /admin.
export const BOSS_LIMITS = { attempts: [1, 10], perPower: [1, 100], fullZone: [0, 500], beatZone: [0, 500], points: [0, 100000], coins: [0, 100000], shards: [0, 100000], xp: [0, 10000], prisms: [0, 1000],
  top: [1, 1000], pct: [1, 100], price: [0, 100000], limit: [0, 100] };
