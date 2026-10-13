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
// Elles avancent avec les parties de tous les membres. L'objectif suit la taille du clan à chaque instant (per × membres,
// au moins CLAN_MIN_MEMBERS) : un clan qui grandit voit ses missions grandir avec lui. Pour que tout le clan participe,
// un membre ne peut pas faire plus de CLAN_SHARE fois sa part (objectif ÷ membres) : à 10, il faut au moins 4 joueurs.
// Chaque mission accomplie donne son XP au clan et ses Écus à chaque membre qui y a contribué.
export const CLAN_MISSION_KINDS = {
  games: { label: n => `Jouer ${n} parties`, daily: 3, weekly: 15 },
  wins: { label: n => `Gagner ${n} parties`, daily: 2, weekly: 8 },
  cards: { label: n => `Jouer ${n} cartes`, daily: 15, weekly: 75 },
  spells: { label: n => `Jouer ${n} sorts`, daily: 4, weekly: 20 },
  creatures: { label: n => `Jouer ${n} créatures`, daily: 8, weekly: 40 },
  ranked: { label: n => `Jouer ${n} parties classées`, weekly: 6 },
  dons: { label: n => `Gagner ${n} Écus en dons`, weekly: 25 },
};
export const CLAN_DAILY = 3, CLAN_WEEKLY = 3, CLAN_MIN_MEMBERS = 5, CLAN_SHARE = 2.5;
export const CLAN_MISSION_REWARDS = { daily: { xp: 25, coins: 10 }, weekly: { xp: 100, coins: 40 } };
export const clanTarget = (kind, scope, members) => CLAN_MISSION_KINDS[kind][scope] * Math.max(CLAN_MIN_MEMBERS, members);
// Part qu'un membre peut faire au plus d'une mission d'objectif target dans un clan de members membres.
export const clanShare = (target, members) => Math.min(target, Math.ceil(CLAN_SHARE * target / Math.max(1, members)));
export const clanMissionLabel = m => CLAN_MISSION_KINDS[m.kind]?.label(m.target) || m.kind;
export const clanDay = (d = new Date()) => today(d);
export const clanWeek = (d = new Date()) => weekOf(today(d));

// ---- Dons ----
// Ressources données au clan contre des Écus : rate unités pour 1 Écu (ou coins Écus), au plus cap unités par jour.
export const DONATIONS = {
  shards: { name: 'Éclats', rate: 10, cap: 500 },
  prisms: { name: 'Prismes', rate: 1, coins: 3, cap: 10 },
  uniEssence: { name: 'essence universelle', rate: 5, cap: 100 },
};
// Écus gagnés pour amount unités d'une ressource.
export const donationCoins = (res, amount) => { const d = DONATIONS[res]; return d ? Math.floor(amount / d.rate) * (d.coins || 1) : 0; };

// ---- Rôles ----
// Maître : le fondateur (ou celui à qui il confie le clan). Adjoint : nommé par le Maître, mêmes droits que lui sauf nommer
// des adjoints et confier le clan ; il peut prendre la tête du clan si le Maître ne vient plus depuis CLAN_INACTIVE_DAYS jours.
// Sous-chef : accepte les demandes et exclut les simples membres. Membre : le rôle de base.
export const CLAN_ROLES = { maitre: 'Maître', adjoint: 'Adjoint', souschef: 'Sous-chef', membre: 'Membre' };
export const ROLE_RANK = { maitre: 3, adjoint: 2, souschef: 1, membre: 0 };
export const CLAN_ROLE_MAX = { adjoint: 2, souschef: 4 };
export const CLAN_INACTIVE_DAYS = 7;
// Ce que chaque rôle peut faire : accepter les demandes, exclure (seulement plus bas que soi), nommer (sous-chefs et membres ;
// les adjoints, seul le Maître), régler le clan, dépenser le trésor.
export const CLAN_RIGHTS = {
  requests: 1, kick: 1, roles: 2, edit: 2, treasury: 2,
};
export const canDo = (role, right) => (ROLE_RANK[role] || 0) >= CLAN_RIGHTS[right];

// ---- Trésor du clan ----
// Les ressources données vont au trésor du clan. Le Maître et les adjoints les dépensent en projets pour tout le clan.
// cost : par membre (au moins CLAN_MIN_MEMBERS comptés). days : durée de l'effet ; un projet en cours ne se relance pas.
export const CLAN_PROJECTS = {
  festin: { name: 'Festin du clan', desc: 'Écus des missions de clan ×1,5 pendant 7 jours', cost: { shards: 600 }, days: 7, coins: 1.5 },
  etendard: { name: 'Étendard levé', desc: 'XP de clan des missions ×1,5 pendant 7 jours', cost: { shards: 400, prisms: 3 }, days: 7, xp: 1.5 },
  coffre: { name: 'Coffre du clan', desc: 'Un booster offert à chaque membre (une fois par semaine)', cost: { prisms: 4, uniEssence: 30 }, days: 7, boosters: 1 },
};
export const projectCost = (id, members) => Object.fromEntries(Object.entries(CLAN_PROJECTS[id].cost).map(([r, n]) => [r, n * Math.max(CLAN_MIN_MEMBERS, members)]));

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
