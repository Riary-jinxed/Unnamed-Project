// Mode classé : paliers, divisions et étoiles, force de l'IA à chaque palier, saisons mensuelles.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche). Le rang d'un joueur tient en un nombre d'étoiles `r` :
// 3 étoiles par division, 3 divisions par palier (III, II puis I), puis Maître où les étoiles deviennent des points sans plafond.
import { today } from './collection.js';
import { t, tp } from './i18n.js';

// ai : essais de l'IA pour chercher son plan (aiPlan) ; plus il y en a, mieux elle joue. Hors classé, l'IA en fait 250.
// title, frame : récompenses de fin de saison quand ce palier est le meilleur atteint (avec celles des paliers en dessous).
export const TIERS = [
  { id: 'bronze', name: 'Bronze', ai: 15 },
  { id: 'argent', name: 'Argent', ai: 40 },
  { id: 'or', name: 'Or', ai: 90, title: 'Lame d\'or' },
  { id: 'platine', name: 'Platine', ai: 160, title: 'Stratège de platine', frame: 'platine' },
  { id: 'diamant', name: 'Diamant', ai: 250, title: 'Seigneur de diamant', frame: 'diamant' },
  { id: 'maitre', name: 'Maître', ai: 500, title: 'Grand maître', frame: 'maitre' },
];
export const STARS = 3, DIVISIONS = 3, TIER_STARS = STARS * DIVISIONS;
export const MASTER = (TIERS.length - 1) * TIER_STARS;
const ROMAN = ['III', 'II', 'I'];
// Une série de 3 victoires ou plus donne une étoile de plus, jusqu'au Diamant.
export const STREAK_BONUS = 3, STREAK_BONUS_BELOW = (TIERS.length - 2) * TIER_STARS;

// Palier, division et étoiles d'un rang. floor : on ne descend jamais sous le début de son palier.
export function rankOf(r = 0) {
  r = Math.max(0, Math.floor(r) || 0);
  if (r >= MASTER) { const ti = TIERS.length - 1;
    return { r, tier: ti, id: TIERS[ti].id, name: TIERS[ti].name, division: null, stars: r - MASTER, max: null, floor: MASTER, label: tp(r - MASTER, '{tier} · {n} pt', '{tier} · {n} pts', { tier: t(TIERS[ti].name) }) }; }
  const ti = Math.floor(r / TIER_STARS), d = Math.floor((r % TIER_STARS) / STARS);
  return { r, tier: ti, id: TIERS[ti].id, name: TIERS[ti].name, division: ROMAN[d], stars: r % STARS, max: STARS, floor: ti * TIER_STARS, label: `${t(TIERS[ti].name)} ${ROMAN[d]}` };
}
export const tierOf = r => TIERS[rankOf(r).tier];

// Nouveau rang après une partie classée. streak : victoires d'affilée en classé, celle-ci comprise.
// foeR : rang de l'ami battu (défi classé) ; battre mieux classé que soi rapporte une étoile de plus.
// mult : multiplicateur d'un événement « points de classé » (events.js), appliqué aux étoiles gagnées, bonus compris ; une défaite n'en tient pas compte.
export function applyResult(r, { result, streak = 0, foeR = null, mult = 1 }) {
  const now = rankOf(r);
  if (result === 'win') {
    const bonus = (streak >= STREAK_BONUS && r < STREAK_BONUS_BELOW ? 1 : 0) + (foeR !== null && foeR > r ? 1 : 0);
    return { r: r + Math.max(1, Math.round((1 + bonus) * mult)), bonus };
  }
  if (result === 'loss') return { r: Math.max(now.floor, r - 1), bonus: 0 };
  return { r, bonus: 0 };
}

// ---- Saisons ----
// Une saison par mois (heure de Paris, comme les journées du jeu). En fin de saison : récompenses du meilleur palier atteint, puis on redescend d'un palier.
export const seasonId = (d = new Date()) => today(d).slice(0, 7);
// Noms traduits à l'appel (le serveur change de langue par requête).
const MONTHS = () => [t('janvier'), t('février'), t('mars'), t('avril'), t('mai'), t('juin'), t('juillet'), t('août'), t('septembre'), t('octobre'), t('novembre'), t('décembre')];
export const seasonName = id => { const [y, m] = id.split('-').map(Number); return t('{month} {y}', { month: MONTHS()[m - 1], y }); };
// Jours avant la fin de la saison en cours, aujourd'hui compris.
export function seasonDaysLeft(d = new Date()) {
  const [y, m, day] = today(d).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - day + 1;
}
export const seasonReset = r => Math.max(0, rankOf(r).floor - TIER_STARS);
// Éclats de fin de saison par palier : réglages « rankShards… » du document « recompenses » (rewards.js).
export const seasonShardsKey = t => `rankShards${TIERS[t].id[0].toUpperCase()}${TIERS[t].id.slice(1)}`;
// Prismes de fin de saison par palier (monnaie des arts alternatifs) : réglages « rankPrisms… ».
export const seasonPrismsKey = t => `rankPrisms${TIERS[t].id[0].toUpperCase()}${TIERS[t].id.slice(1)}`;
// Titres et cadres de fin de saison, du palier atteint et de ceux en dessous.
export const seasonCosmetics = t => TIERS.slice(0, t + 1).filter(x => x.title || x.frame).map(x => ({ title: x.title ? `rang:${x.id}` : null, frame: x.frame || null }));

// ---- Classement final ----
// Le classement de la saison est figé à la fin du mois (doc « classement », server/src/progress.js). Les mieux placés reçoivent,
// en plus des récompenses de leur palier, celles de leur place, avec les titres des places en dessous. Seuls comptent les joueurs
// qui ont joué au moins « rankPlaceGames » parties classées dans la saison.
export const PLACES = [
  { id: 'top1', max: 1, name: '1re place', title: 'Champion de l\'arène' },
  { id: 'top3', max: 3, name: 'Podium', title: 'Gloire du podium' },
  { id: 'top10', max: 10, name: 'Top 10', title: 'Élite de l\'arène' },
];
export const placeOf = pos => PLACES.findIndex(p => pos && pos <= p.max);
// Réglages « rankPlaceShards… » et « rankPlacePrisms… » du document « recompenses » (rewards.js).
export const placeShardsKey = i => `rankPlaceShards${PLACES[i].id[0].toUpperCase()}${PLACES[i].id.slice(1)}`;
export const placePrismsKey = i => `rankPlacePrisms${PLACES[i].id[0].toUpperCase()}${PLACES[i].id.slice(1)}`;
// Titres de la place atteinte et de celles en dessous.
export const placeTitles = i => (i < 0 ? [] : PLACES.slice(i).map(p => `rang:${p.id}`));
