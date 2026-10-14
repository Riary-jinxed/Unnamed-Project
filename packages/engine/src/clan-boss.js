// Boss de clan : données partagées par le serveur (server/src/clan-boss.js) et l'appli (client/src/clan-boss.js).
// Le Maître ou un adjoint ouvre un boss pour tout le clan, au niveau de son choix (jusqu'au niveau du clan). Il reste ouvert
// CLAN_BOSS_DAYS jours ; chaque membre a CLAN_BOSS_TRIES tentatives. Une tentative est une partie de 7 tours contre lui (un
// général clan: true de engine.js, propre aux clans, avec son script). En face, le boss tient à lui seul les trois zones :
// sa barre de PV. Les points de vos 3 zones à la fin de la partie lui sont retirés. À la fermeture (PV à zéro ou fin du temps),
// chaque membre reçoit la récompense du pourcentage de PV retiré, avec un minimum même à 0 %. Chaque boss a ses récompenses.
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

// Récompenses à la fermeture, propres à chaque boss, selon la part des PV retirés (pct : au moins ce pourcentage). La première vaut
// même à 0 %. Seule celle du palier atteint est donnée. Écus (coins), Éclats, Prismes et essence universelle sont multipliés par le
// niveau du boss ; coffres d'arts (chests), boosters et titre (à 100 %) ne le sont pas. clanXp : XP de clan, donnée une fois au clan.
// Wyrm du trésor : les Écus. Chevalier de la mort : les Prismes et les coffres d'arts. Reine sylvestre : les Éclats, l'essence et les boosters.
const XP = [0, 25, 50, 100, 150], PCTS = [0, 25, 50, 75, 100];
const tiers = list => list.map((r, i) => ({ pct: PCTS[i], clanXp: XP[i], ...r }));
export const CLAN_BOSS_REWARDS = {
  clan_wyrm: tiers([
    { coins: 20, shards: 20 },
    { coins: 45, shards: 40 },
    { coins: 80, shards: 60 },
    { coins: 120, shards: 80 },
    { coins: 180, shards: 100, title: 'clanboss:wyrm' },
  ]),
  clan_chevalier: tiers([
    { coins: 10, prisms: 1 },
    { coins: 20, prisms: 3 },
    { coins: 30, prisms: 5 },
    { coins: 40, prisms: 8, chests: 1 },
    { coins: 50, prisms: 12, chests: 1, title: 'clanboss:chevalier' },
  ]),
  clan_reine: tiers([
    { coins: 10, shards: 50 },
    { coins: 20, shards: 100, uniEssence: 10 },
    { coins: 30, shards: 160, uniEssence: 20 },
    { coins: 40, shards: 220, uniEssence: 30, boosters: 1 },
    { coins: 50, shards: 300, uniEssence: 40, boosters: 2, title: 'clanboss:reine' },
  ]),
};
// Titres gagnés en venant à bout de chaque boss (ajoutés à TITLES, rewards.js).
export const CLAN_BOSS_TITLES = [['clanboss:wyrm', 'Pilleur de la montagne d\'or'], ['clanboss:chevalier', 'Chasseur du soleil noir'], ['clanboss:reine', 'Élagueur de ronces']];
export const clanBossRewards = id => CLAN_BOSS_REWARDS[id] || CLAN_BOSS_REWARDS.clan_wyrm;
// Part des PV retirés, de 0 à 100 (arrondie vers le bas : 100 seulement si le boss est vaincu).
export const clanBossPct = (hp, max) => (max > 0 ? Math.max(0, Math.min(100, Math.floor(100 * (max - hp) / max))) : 0);
export const clanBossTier = (pct, id) => clanBossRewards(id).reduce((x, r, i) => (pct >= r.pct ? i : x), 0);
// Récompense d'un palier d'un boss au niveau donné : Écus (clanCoins), Éclats, Prismes, essence, coffre, booster, titre ; et l'XP du clan.
export function clanBossReward(id, i, level) {
  const r = clanBossRewards(id)[i], m = clanBossLevel(level).mult, out = {};
  if (r.coins) out.clanCoins = Math.round(r.coins * m);
  for (const k of ['shards', 'prisms', 'uniEssence']) if (r[k]) out[k] = Math.round(r[k] * m);
  for (const k of ['chests', 'boosters', 'title']) if (r[k]) out[k] = r[k];
  return { reward: out, clanXp: Math.round((r.clanXp || 0) * m) };
}
