// Récompenses du compte : niveau, missions quotidiennes, succès, complétion de famille et de set, titres, cadres et dos de carte.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche). Les nombres se règlent depuis /admin (document « recompenses »).
import { CARDS, GENERALS, FAMILIES } from './engine.js';

// ---- Réglages chiffrés ----
// Les valeurs par défaut sont justifiées dans la proposition d'économie (recompenses/economie.md).
export const DEFAULT_REWARDS = {
  // Niveau : XP pour passer du niveau n au suivant = min(xpCap, xpBase + xpStep × (n − 1)).
  xpBase: 400, xpStep: 100, xpCap: 1500,
  // Chaque niveau gagné : des Éclats ; tous les « boosterEvery » niveaux, un booster offert (à ouvrir dans le set de son choix).
  levelShards: 25, boosterEvery: 5,
  // Parties : XP et Éclats par résultat (un match nul compte comme une défaite), pour les « gamesPerDay » premières parties du jour.
  xpPvpWin: 100, xpPvpLoss: 50, xpPveWin: 60, xpPveLoss: 30,
  shardsPvpWin: 10, shardsPveWin: 5, shardsLoss: 2, gamesPerDay: 10,
  // XP pour chaque nouvelle carte ou nouveau général ajouté à la collection.
  xpNewCard: 15,
  // Missions quotidiennes : nombre par jour, et missions qu'on peut remplacer par jour.
  missionsPerDay: 3, missionRerolls: 1,
  // Complétion : famille dans son set d'origine (avec carte unique, titre et dos), part d'une famille dans un autre set, set entier.
  familyShards: 200, supportShards: 100, setShards: 1000, setBoosters: 3,
};
export const REWARD_LIMITS = {
  xpBase: [10, 100000], xpStep: [0, 100000], xpCap: [10, 1000000], levelShards: [0, 100000], boosterEvery: [0, 100],
  xpPvpWin: [0, 10000], xpPvpLoss: [0, 10000], xpPveWin: [0, 10000], xpPveLoss: [0, 10000],
  shardsPvpWin: [0, 10000], shardsPveWin: [0, 10000], shardsLoss: [0, 10000], gamesPerDay: [0, 100],
  xpNewCard: [0, 10000], missionsPerDay: [0, 6], missionRerolls: [0, 10],
  familyShards: [0, 100000], supportShards: [0, 100000], setShards: [0, 1000000], setBoosters: [0, 20],
};

// XP pour passer du niveau `level` au suivant.
export const xpToNext = (level, r = DEFAULT_REWARDS) => Math.min(r.xpCap, r.xpBase + r.xpStep * (level - 1));

// ---- Missions quotidiennes ----
// event : ce qui fait avancer la mission (voir progressMission). Cible, XP et Éclats se règlent dans /admin.
export const MISSIONS = {
  play:    { label: n => `Jouer ${n} partie${n > 1 ? 's' : ''}`, target: 3, xp: 100, shards: 25 },
  win:     { label: n => `Gagner ${n} partie${n > 1 ? 's' : ''}`, target: 2, xp: 150, shards: 35 },
  win_pvp: { label: n => `Gagner ${n > 1 ? `${n} parties` : 'une partie'} en ligne`, target: 1, xp: 150, shards: 35 },
  win_pve: { label: n => `Battre l'IA ${n} fois`, target: 2, xp: 100, shards: 25 },
  fam:     { label: (n, f) => `Jouer ${n} cartes ${f}`, target: 8, xp: 120, shards: 30 },
  spells:  { label: n => `Jouer ${n} sorts`, target: 4, xp: 100, shards: 25 },
  sweep:   { label: () => 'Gagner une partie en remportant les 3 zones', target: 1, xp: 150, shards: 35 },
  booster: { label: () => 'Ouvrir le booster du jour', target: 1, xp: 50, shards: 10 },
};
export const missionLabel = m => MISSIONS[m.id]?.label(m.target, m.fam) || m.id;

// ---- Cosmétiques ----
export const FRAMES = {
  bronze: 'Cadre de bronze', argent: 'Cadre d\'argent', or: 'Cadre d\'or', legende: 'Cadre légendaire',
  flamme: 'Cadre de flammes', duel: 'Cadre du duelliste', tresor: 'Cadre du trésor', etoile: 'Cadre étoilé',
  base: 'Couronne du Set de base', set2: 'Couronne du Crépuscule',
};
const FAM_KEY = { 'Ange': 'ange', 'Démon': 'demon', 'Gobelin': 'gobelin', 'Elfe': 'elfe', 'Dragon': 'dragon', 'Mort-vivant': 'mortvivant', 'Vampire': 'vampire' };
export const famKey = fam => FAM_KEY[fam] || 'neutre';
// Dos de carte : celui par défaut, puis un par famille complétée. Il se voit sur vos cartes cachées, côté adversaire.
export const BACKS = { classique: 'Dos classique', ange: 'Dos céleste', demon: 'Dos infernal', gobelin: 'Dos de la horde', elfe: 'Dos sylvestre',
  dragon: 'Dos d\'écailles', mortvivant: 'Dos funéraire', vampire: 'Dos écarlate' };

// ---- Complétion de famille et de set ----
// Famille complétée dans son set d'origine : Éclats, une carte unique qui soutient la famille, un titre et un dos de carte.
export const FAMILY_REWARDS = {
  'Ange':        { set: 'base', card: 'voix_aube', title: 'Héraut de l\'Aube' },
  'Démon':       { set: 'base', card: 'heritier_abysses', title: 'Prince des abysses' },
  'Gobelin':     { set: 'base', card: 'boss_horde', title: 'Grand chef de guerre' },
  'Elfe':        { set: 'base', card: 'gardienne_sentiers', title: 'Sage sylvestre' },
  'Dragon':      { set: 'base', card: 'wyrm_tresor', title: 'Seigneur des dragons' },
  'Mort-vivant': { set: 'set2', card: 'faucheur', title: 'Maître des tombes' },
  'Vampire':     { set: 'set2', card: 'reine_ecarlate', title: 'Prince de la nuit' },
};
// Set complété : Éclats, boosters offerts, une carte Dieu (pour le deck le plus faible du moment), un titre et un cadre.
export const SET_REWARDS = {
  base: { card: 'dieu_base', title: 'Gardien du Set de base', frame: 'base' },
  set2: { card: 'dieu_set2', title: 'Gardien du Crépuscule', frame: 'set2' },
};
// Cartes qu'on ne trouve dans aucun booster : elles ne s'obtiennent qu'en récompense.
export const REWARD_CARDS = [...Object.values(FAMILY_REWARDS).map(f => f.card), ...Object.values(SET_REWARDS).map(s => s.card)];
export const rewardSourceOf = id => {
  const f = Object.entries(FAMILY_REWARDS).find(([, r]) => r.card === id);
  if (f) return { kind: 'family', fam: f[0], set: f[1].set };
  const s = Object.entries(SET_REWARDS).find(([, r]) => r.card === id);
  return s ? { kind: 'set', set: s[0] } : null;
};

// Famille d'une carte ou d'un général (null pour les neutres).
export const familyOf = id => (GENERALS[id] ? GENERALS[id].fam : CARDS[id]?.kw.find(k => FAMILIES.includes(k))) || null;

// ---- Succès ----
// stat : compteur du compte comparé à goal. Les Éclats se règlent dans /admin ; titres et cadres sont fixes.
const A = (id, group, label, stat, goal, shards, extra = {}) => ({ id, group, label, stat, goal, shards, ...extra });
export const ACHIEVEMENTS = [
  A('lvl5', 'Niveau', 'Atteindre le niveau 5', 'level', 5, 100, { title: 'Apprenti' }),
  A('lvl10', 'Niveau', 'Atteindre le niveau 10', 'level', 10, 200, { frame: 'bronze' }),
  A('lvl20', 'Niveau', 'Atteindre le niveau 20', 'level', 20, 400, { frame: 'argent', title: 'Vétéran' }),
  A('lvl30', 'Niveau', 'Atteindre le niveau 30', 'level', 30, 600, { frame: 'or' }),
  A('lvl50', 'Niveau', 'Atteindre le niveau 50', 'level', 50, 1000, { frame: 'legende', title: 'Légende vivante' }),
  A('win1', 'Victoires', 'Remporter une première victoire', 'wins', 1, 50, { title: 'Recrue' }),
  A('win10', 'Victoires', 'Remporter 10 victoires', 'wins', 10, 100, { title: 'Combattant' }),
  A('win50', 'Victoires', 'Remporter 50 victoires', 'wins', 50, 300, { title: 'Champion' }),
  A('win200', 'Victoires', 'Remporter 200 victoires', 'wins', 200, 600, { title: 'Seigneur de guerre', frame: 'flamme' }),
  A('pvp5', 'Victoires', 'Gagner 5 parties en ligne', 'pvpWins', 5, 150, { title: 'Duelliste' }),
  A('pvp25', 'Victoires', 'Gagner 25 parties en ligne', 'pvpWins', 25, 400, { title: 'Maître duelliste', frame: 'duel' }),
  A('pve10', 'Victoires', 'Battre l\'IA 10 fois', 'pveWins', 10, 100, { title: 'Fléau des automates' }),
  A('streak3', 'Victoires', 'Gagner 3 parties d\'affilée', 'bestStreak', 3, 150, { title: 'Inarrêtable' }),
  A('streak5', 'Victoires', 'Gagner 5 parties d\'affilée', 'bestStreak', 5, 300, { title: 'Invaincu' }),
  A('games50', 'Parties', 'Jouer 50 parties', 'games', 50, 200, { title: 'Infatigable' }),
  A('games200', 'Parties', 'Jouer 200 parties', 'games', 200, 500, { title: 'Pilier de la taverne' }),
  A('missions10', 'Parties', 'Accomplir 10 missions', 'missions', 10, 150, { title: 'Assidu' }),
  A('missions50', 'Parties', 'Accomplir 50 missions', 'missions', 50, 400, { frame: 'etoile' }),
  A('cards50', 'Collection', 'Posséder 50 cartes', 'cards', 50, 150, { title: 'Collectionneur' }),
  A('cards100', 'Collection', 'Posséder 100 cartes', 'cards', 100, 300, { frame: 'tresor' }),
  A('families3', 'Collection', 'Compléter 3 familles', 'families', 3, 300, { title: 'Généalogiste' }),
  ...[
    ['Ange', 'Voix des cieux'], ['Démon', 'Signataire du pacte'], ['Gobelin', 'Meneur de horde'], ['Elfe', 'Gardien des bois'],
    ['Dragon', 'Dompteur de dragons'], ['Mort-vivant', 'Nécromant'], ['Vampire', 'Enfant de la nuit'],
  ].map(([fam, title]) => A(`fam_${famKey(fam)}`, 'Familles', `Gagner 10 parties avec un général ${fam}`, `famWins.${fam}`, 10, 150, { title })),
];
export const statValue = (stats, stat) => stat.split('.').reduce((o, k) => (o ? o[k] : 0), stats) || 0;

// Tous les titres : ceux des succès, des familles et des sets.
export const TITLES = Object.fromEntries([
  ...ACHIEVEMENTS.filter(a => a.title).map(a => [a.id, a.title]),
  ...Object.entries(FAMILY_REWARDS).map(([fam, r]) => [`fam:${fam}`, r.title]),
  ...Object.entries(SET_REWARDS).map(([set, r]) => [`set:${set}`, r.title]),
]);
