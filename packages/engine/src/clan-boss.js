// Boss de clan : données partagées par le serveur (server/src/clan-boss.js) et l'appli (client/src/clan-boss.js).
// Le Maître ou un adjoint ouvre un boss pour tout le clan, au niveau de son choix (jusqu'au niveau du clan). Il reste ouvert
// CLAN_BOSS_DAYS jours ; chaque membre a CLAN_BOSS_TRIES tentatives. Une tentative est une partie de 7 tours contre lui (un
// général clan: true de engine.js : le script d'un boss mondial, sans Sbire). En face, le boss ne tient qu'une seule zone :
// sa barre de PV. Les points de vos 3 zones à la fin de la partie lui sont retirés. À la fermeture (PV à zéro ou fin du temps),
// chaque membre reçoit la récompense du pourcentage de PV retiré, avec un minimum même à 0 %.
import { GENERALS, CARDS, zonePower, SLOTS } from './engine.js';
import { clanWeek } from './clans.js';

export const CLAN_BOSS_IDS = Object.keys(GENERALS).filter(g => GENERALS[g].boss && GENERALS[g].clan);
export const isClanBoss = id => !!GENERALS[id]?.boss && !!GENERALS[id].clan;
export const CLAN_BOSS_DAYS = 3, CLAN_BOSS_TRIES = 3;
// Un boss de clan par semaine (du lundi au dimanche, heure de Paris), compté à son ouverture.
export const clanBossWeek = clanWeek;

// Niveaux : PV du boss, et multiplicateur des récompenses. Le niveau n se débloque au niveau n du clan.
export const CLAN_BOSS_LEVELS = [
  { level: 1, hp: 6000, mult: 1 },
  { level: 2, hp: 10000, mult: 1.25 },
  { level: 3, hp: 15000, mult: 1.5 },
  { level: 4, hp: 21000, mult: 1.75 },
  { level: 5, hp: 28000, mult: 2 },
];
export const clanBossLevel = n => CLAN_BOSS_LEVELS[Math.max(1, Math.min(n, CLAN_BOSS_LEVELS.length)) - 1];

// Dégâts d'une tentative : chaque point de puissance d'une de vos zones (au moins 0) retire perPower PV ; une zone pleine
// (4 créatures) en retire fullZone de plus.
export const CLAN_BOSS_SCORING = { perPower: 10, fullZone: 30 };
export function clanBossDamage(st, cfg = CLAN_BOSS_SCORING) {
  const zones = [0, 1, 2].map(z => {
    const power = Math.max(0, zonePower(st, 0, z)), full = st.p[0].board[z].filter(c => c.revealed && CARDS[c.id].type === 'C').length >= SLOTS;
    return { power, full, beat: false, points: power * cfg.perPower + (full ? cfg.fullZone : 0) };
  });
  return { zones, total: zones.reduce((s, z) => s + z.points, 0) };
}

// Récompenses à la fermeture, selon la part des PV retirés (pct : au moins ce pourcentage). La première vaut même à 0 %.
// Multipliées par le niveau du boss (sauf le booster). clanXp : XP de clan, donnée une fois au clan.
export const CLAN_BOSS_REWARDS = [
  { pct: 0, coins: 10, shards: 30, clanXp: 0 },
  { pct: 25, coins: 25, shards: 60, clanXp: 25 },
  { pct: 50, coins: 45, shards: 100, prisms: 2, clanXp: 50 },
  { pct: 75, coins: 70, shards: 150, prisms: 4, clanXp: 100 },
  { pct: 100, coins: 100, shards: 200, prisms: 8, boosters: 1, clanXp: 150 },
];
// Part des PV retirés, de 0 à 100 (arrondie vers le bas : 100 seulement si le boss est vaincu).
export const clanBossPct = (hp, max) => (max > 0 ? Math.max(0, Math.min(100, Math.floor(100 * (max - hp) / max))) : 0);
export const clanBossTier = pct => CLAN_BOSS_REWARDS.reduce((x, r, i) => (pct >= r.pct ? i : x), 0);
// Récompense d'un palier au niveau donné : Écus (clanCoins), Éclats, Prismes, booster ; et l'XP du clan.
export function clanBossReward(i, level) {
  const r = CLAN_BOSS_REWARDS[i], m = clanBossLevel(level).mult, out = {};
  if (r.coins) out.clanCoins = Math.round(r.coins * m);
  if (r.shards) out.shards = Math.round(r.shards * m);
  if (r.prisms) out.prisms = Math.round(r.prisms * m);
  if (r.boosters) out.boosters = r.boosters;
  return { reward: out, clanXp: Math.round((r.clanXp || 0) * m) };
}
