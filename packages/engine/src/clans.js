// Clans : données partagées par le serveur (server/src/clans.js) et l'appli (client/src/clan.js).
// Un clan se crée contre des Prismes et monte du niveau 1 au niveau 5 avec les missions de clan accomplies. Ses membres gagnent
// des Écus (la monnaie du clan) avec ces missions et en donnant des ressources, et les dépensent au magasin du clan : arts
// alternatifs de l'édition Clan (arts.js), dos de carte, cadres et titres. Chaque mois, les 10 meilleurs clans (rangs classés
// de leurs membres cumulés) reçoivent des récompenses et une bannière.
import { today } from './collection.js';
import { weekOf } from './pass.js';

export const CLAN_PRICE = 50; // Prismes
export const CLAN_NAME_MAX = 24, CLAN_TAG_RE = /^[A-Z0-9]{2,4}$/, CLAN_DESC_MAX = 140;
// Demandes d'adhésion qu'un joueur peut avoir en attente, et qu'un clan peut recevoir.
export const MAX_REQUESTS = 3, MAX_CLAN_REQUESTS = 30;

// Niveaux : XP de clan à atteindre (cumulée) et nombre de membres au plus. L'XP vient des missions accomplies.
export const CLAN_LEVELS = [
  { level: 1, xp: 0, members: 10 },
  { level: 2, xp: 300, members: 15 },
  { level: 3, xp: 900, members: 20 },
  { level: 4, xp: 2000, members: 25 },
  { level: 5, xp: 4000, members: 30 },
];
export const MAX_CLAN_LEVEL = CLAN_LEVELS.length;
export const clanLevelOf = xp => CLAN_LEVELS.reduce((l, x) => (xp >= x.xp ? x.level : l), 1);
export const maxMembers = level => CLAN_LEVELS[Math.min(level, MAX_CLAN_LEVEL) - 1].members;
// Avancement vers le niveau suivant, pour la barre du clan.
export function clanLevelView(xp = 0) {
  const level = clanLevelOf(xp), cur = CLAN_LEVELS[level - 1], next = CLAN_LEVELS[level] || null;
  return { level, xp, from: cur.xp, next: next ? next.xp : null, members: cur.members };
}

// Blason choisi à la création : un symbole sur un écu de couleur.
export const CLAN_ICONS = { epee: 'Épée', couronne: 'Couronne', bouclier: 'Bouclier', etoile: 'Étoile', lune: 'Lune', flamme: 'Flamme', arbre: 'Arbre', crane: 'Crâne' };
export const CLAN_COLORS = { pourpre: '#7a2a8c', azur: '#2a5fa8', sinople: '#2f7a3a', gueules: '#b0282a', sable: '#2a2622', or: '#c8931e', orange: '#d0662a', ciel: '#2a8a9e' };

// ---- Missions de clan ----
// Elles avancent avec les parties de tous les membres. L'objectif suit la taille du clan au moment du tirage
// (per × membres, entre 3 et le maximum du niveau), pour qu'un petit clan puisse finir les siennes.
// Chaque mission accomplie donne son XP au clan et ses Écus à chaque membre qui y a contribué.
export const CLAN_MISSION_KINDS = {
  games: { label: n => `Jouer ${n} parties`, daily: 2, weekly: 10 },
  wins: { label: n => `Gagner ${n} parties`, daily: 1, weekly: 5 },
  cards: { label: n => `Jouer ${n} cartes`, daily: 10, weekly: 50 },
  spells: { label: n => `Jouer ${n} sorts`, daily: 3, weekly: 15 },
  creatures: { label: n => `Jouer ${n} créatures`, daily: 6, weekly: 30 },
  ranked: { label: n => `Jouer ${n} parties classées`, weekly: 4 },
  dons: { label: n => `Gagner ${n} Écus en dons`, weekly: 20 },
};
export const CLAN_DAILY = 3, CLAN_WEEKLY = 3;
export const CLAN_MISSION_REWARDS = { daily: { xp: 25, coins: 10 }, weekly: { xp: 100, coins: 40 } };
export const clanMissionLabel = m => CLAN_MISSION_KINDS[m.kind]?.label(m.target) || m.kind;
export const clanTarget = (kind, scope, members) => CLAN_MISSION_KINDS[kind][scope] * Math.max(3, members);
export const clanDay = (d = new Date()) => today(d);
export const clanWeek = (d = new Date()) => weekOf(today(d));

// ---- Dons ----
// Ressources données au clan contre des Écus : rate unités pour 1 Écu, au plus cap unités par jour.
export const DONATIONS = {
  shards: { name: 'Éclats', rate: 10, cap: 500 },
  prisms: { name: 'Prismes', rate: 1, coins: 3, cap: 10 },
  uniEssence: { name: 'essence universelle', rate: 5, cap: 100 },
};
// Écus gagnés pour amount unités d'une ressource.
export const donationCoins = (res, amount) => { const d = DONATIONS[res]; return d ? Math.floor(amount / d.rate) * (d.coins || 1) : 0; };

// ---- Magasin du clan ----
// Tout se paie en Écus. level : niveau de clan qu'il faut pour l'acheter. Ce qui est acheté reste au joueur s'il quitte son clan.
// kind : art (arts.js, édition Clan), back, frame ou title (identifiants de rewards.js).
const S = (id, kind, name, price, level, extra = {}) => ({ id, kind, name, price, level, ...extra });
export const CLAN_SHOP = [
  S('title:clan:frere', 'title', 'Titre « Frère d\'armes »', 60, 1),
  S('back:clan_etendard', 'back', 'Dos de l\'étendard', 150, 1),
  S('art:porte_etendard_clan', 'art', 'Porte-étendard du clan', 250, 1),
  S('title:clan:porte', 'title', 'Titre « Porte-étendard »', 150, 2),
  S('frame:clan_blason', 'frame', 'Cadre du blason', 250, 2),
  S('art:heraut_clan', 'art', 'Héraut des bannières', 250, 2),
  S('art:mercenaire_clan', 'art', 'Mercenaire sous serment', 450, 3),
  S('back:clan_forteresse', 'back', 'Dos de la forteresse', 300, 3),
  S('title:clan:pilier', 'title', 'Titre « Pilier du clan »', 300, 4),
  S('art:seigneur_guerre_clan', 'art', 'Seigneur de guerre, la grande bannière', 450, 4),
  S('frame:clan_heraut', 'frame', 'Cadre du héraut', 500, 5),
  S('art:cartographe_clan', 'art', 'Cartographe des conquêtes', 800, 5),
];
export const clanItem = id => CLAN_SHOP.find(x => x.id === id) || null;
// Cosmétiques du clan, ajoutés aux listes de rewards.js.
export const CLAN_TITLES = [['clan:frere', 'Frère d\'armes'], ['clan:porte', 'Porte-étendard'], ['clan:pilier', 'Pilier du clan'],
  ['clan:top1', 'Clan champion'], ['clan:top3', 'Clan du podium'], ['clan:top10', 'Clan d\'élite']];
export const CLAN_FRAMES = [['clan_blason', 'Cadre du blason'], ['clan_heraut', 'Cadre du héraut']];
export const CLAN_BACKS = [['clan_etendard', 'Dos de l\'étendard'], ['clan_forteresse', 'Dos de la forteresse']];

// ---- Classement des clans ----
// Score : somme des étoiles classées (rang r de ranked.js) des membres qui ont joué au moins une partie classée dans la saison.
// À la fin du mois, les 10 premiers sont figés ; chaque membre reçoit les récompenses de la place de son clan, et le clan
// garde une bannière de sa place.
export const CLAN_LADDER_SIZE = 10;
export const CLAN_PLACES = [
  { id: 'top1', max: 1, name: '1re place', banner: 'or', bannerName: 'Bannière d\'or', prisms: 60, coins: 300, title: 'clan:top1' },
  { id: 'top3', max: 3, name: 'Podium', banner: 'argent', bannerName: 'Bannière d\'argent', prisms: 35, coins: 200, title: 'clan:top3' },
  { id: 'top10', max: 10, name: 'Top 10', banner: 'bronze', bannerName: 'Bannière de bronze', prisms: 15, coins: 100, title: 'clan:top10' },
];
export const clanPlaceOf = pos => CLAN_PLACES.findIndex(p => pos && pos <= p.max);
