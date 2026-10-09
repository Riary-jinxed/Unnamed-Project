// Mode classé : paliers, divisions et étoiles, force de l'IA à chaque palier, saisons mensuelles.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche). Le rang d'un joueur tient en un nombre d'étoiles `r` :
// 3 étoiles par division, 3 divisions par palier (III, II puis I), puis Maître où les étoiles deviennent des points sans plafond.
import { today } from './collection.js';

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
  if (r >= MASTER) { const t = TIERS.length - 1;
    return { r, tier: t, id: TIERS[t].id, name: TIERS[t].name, division: null, stars: r - MASTER, max: null, floor: MASTER, label: `${TIERS[t].name} · ${r - MASTER} pt${r - MASTER > 1 ? 's' : ''}` }; }
  const t = Math.floor(r / TIER_STARS), d = Math.floor((r % TIER_STARS) / STARS);
  return { r, tier: t, id: TIERS[t].id, name: TIERS[t].name, division: ROMAN[d], stars: r % STARS, max: STARS, floor: t * TIER_STARS, label: `${TIERS[t].name} ${ROMAN[d]}` };
}
export const tierOf = r => TIERS[rankOf(r).tier];

// Nouveau rang après une partie classée. streak : victoires d'affilée en classé, celle-ci comprise.
// foeR : rang de l'ami battu (défi classé) ; battre mieux classé que soi rapporte une étoile de plus.
export function applyResult(r, { result, streak = 0, foeR = null }) {
  const now = rankOf(r);
  if (result === 'win') {
    const bonus = (streak >= STREAK_BONUS && r < STREAK_BONUS_BELOW ? 1 : 0) + (foeR !== null && foeR > r ? 1 : 0);
    return { r: r + 1 + bonus, bonus };
  }
  if (result === 'loss') return { r: Math.max(now.floor, r - 1), bonus: 0 };
  return { r, bonus: 0 };
}

// ---- Saisons ----
// Une saison par mois (heure de Paris, comme les journées du jeu). En fin de saison : récompenses du meilleur palier atteint, puis on redescend d'un palier.
export const seasonId = (d = new Date()) => today(d).slice(0, 7);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const seasonName = id => { const [y, m] = id.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
// Jours avant la fin de la saison en cours, aujourd'hui compris.
export function seasonDaysLeft(d = new Date()) {
  const [y, m, day] = today(d).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - day + 1;
}
export const seasonReset = r => Math.max(0, rankOf(r).floor - TIER_STARS);
// Éclats de fin de saison par palier : réglages « rankShards… » du document « recompenses » (rewards.js).
export const seasonShardsKey = t => `rankShards${TIERS[t].id[0].toUpperCase()}${TIERS[t].id.slice(1)}`;
// Titres et cadres de fin de saison, du palier atteint et de ceux en dessous.
export const seasonCosmetics = t => TIERS.slice(0, t + 1).filter(x => x.title || x.frame).map(x => ({ title: x.title ? `rang:${x.id}` : null, frame: x.frame || null }));
