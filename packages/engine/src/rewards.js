// Récompenses du compte : niveau, missions quotidiennes, succès, complétion de famille et de set, titres, cadres et dos de carte.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche). Les nombres se règlent depuis /admin (document « recompenses »).
import { CARDS, GENERALS, FAMILIES } from './engine.js';
import { TIERS } from './ranked.js';
import { SEASON_TITLES, SEASON_FRAMES, SEASON_BACKS } from './pass.js';

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
  // Complétion : famille d'un set (avec carte unique, titre et dos), set entier.
  familyShards: 200, setShards: 1000, setBoosters: 3,
  // Niveaux de carte : essence de la carte gagnée par doublon, puis essence et Éclats pour passer au niveau n (2 à 5).
  essencePerDuplicate: 10,
  lvl2Essence: 5, lvl2Shards: 50, lvl3Essence: 10, lvl3Shards: 100, lvl4Essence: 15, lvl4Shards: 200, lvl5Essence: 20, lvl5Shards: 400,
  // Mode classé : Éclats de fin de saison selon le meilleur palier atteint (ranked.js).
  rankShardsBronze: 50, rankShardsArgent: 100, rankShardsOr: 200, rankShardsPlatine: 350, rankShardsDiamant: 500, rankShardsMaitre: 800,
  // Prismes (monnaie rare des arts alternatifs, arts.js) de fin de saison selon le meilleur palier atteint.
  rankPrismsBronze: 0, rankPrismsArgent: 5, rankPrismsOr: 10, rankPrismsPlatine: 20, rankPrismsDiamant: 30, rankPrismsMaitre: 50,
  // Calendrier de connexion du mois (loginReward) : Éclats en semaine, coffres d'arts le dimanche, Prismes les 2e et 4e dimanches.
  loginShards: 15, loginChests: 1, loginPrisms: 5,
  // Passe de saison (pass.js) : XP de saison par palier, missions du jour et de la semaine (nombre et XP), prix du premium en Prismes,
  // récompenses des paliers (gratuits : Éclats, Prismes, coffres ; premium : Prismes, coffres), mois avant que les cartes de saison
  // rejoignent le Set de base. Objectifs des missions et XP des missions de saison : passPool et passMissions.
  // Parties : XP de saison par victoire et par défaite (dans la limite des parties récompensées du jour).
  // Passe fini : un coffre de fin de passe tous les passBonusXp d'XP de saison, avec au hasard des Éclats, des Prismes ou de l'essence
  // d'une carte (montants fixes).
  passTierXp: 400, passXpWin: 60, passXpLoss: 30, passBonusXp: 800, passBonusShards: 100, passBonusPrisms: 6, passBonusEssence: 10, passDaily: 2, passWeekly: 4, passXpDaily: 150, passXpWeekly: 500, passPrice: 100,
  passShards: 40, passPrisms: 10, passChests: 1, passPremiumPrisms: 4, passPremiumChests: 1, passCardMonths: 3,
};
export const REWARD_LIMITS = {
  xpBase: [10, 100000], xpStep: [0, 100000], xpCap: [10, 1000000], levelShards: [0, 100000], boosterEvery: [0, 100],
  xpPvpWin: [0, 10000], xpPvpLoss: [0, 10000], xpPveWin: [0, 10000], xpPveLoss: [0, 10000],
  shardsPvpWin: [0, 10000], shardsPveWin: [0, 10000], shardsLoss: [0, 10000], gamesPerDay: [0, 100],
  xpNewCard: [0, 10000], missionsPerDay: [0, 6], missionRerolls: [0, 10],
  familyShards: [0, 100000], setShards: [0, 1000000], setBoosters: [0, 20],
  essencePerDuplicate: [0, 1000],
  lvl2Essence: [0, 10000], lvl2Shards: [0, 100000], lvl3Essence: [0, 10000], lvl3Shards: [0, 100000],
  lvl4Essence: [0, 10000], lvl4Shards: [0, 100000], lvl5Essence: [0, 10000], lvl5Shards: [0, 100000],
  rankShardsBronze: [0, 100000], rankShardsArgent: [0, 100000], rankShardsOr: [0, 100000], rankShardsPlatine: [0, 100000], rankShardsDiamant: [0, 100000], rankShardsMaitre: [0, 100000],
  rankPrismsBronze: [0, 10000], rankPrismsArgent: [0, 10000], rankPrismsOr: [0, 10000], rankPrismsPlatine: [0, 10000], rankPrismsDiamant: [0, 10000], rankPrismsMaitre: [0, 10000],
  loginShards: [0, 10000], loginChests: [0, 10], loginPrisms: [0, 10000],
  passTierXp: [10, 100000], passXpWin: [0, 10000], passXpLoss: [0, 10000], passBonusXp: [10, 100000], passBonusShards: [0, 100000], passBonusPrisms: [0, 10000], passBonusEssence: [0, 10000],
  passDaily: [0, 6], passWeekly: [0, 10], passXpDaily: [0, 100000], passXpWeekly: [0, 100000], passPrice: [0, 100000],
  passShards: [0, 100000], passPrisms: [0, 10000], passChests: [0, 10], passPremiumPrisms: [0, 10000], passPremiumChests: [0, 10], passCardMonths: [0, 60],
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
  platine: 'Cadre de platine', diamant: 'Cadre de diamant', maitre: 'Cadre du grand maître',
  // Cadres des passes de saison (pass.js).
  ...Object.fromEntries(SEASON_FRAMES),
};
const FAM_KEY = { 'Ange': 'ange', 'Démon': 'demon', 'Gobelin': 'gobelin', 'Elfe': 'elfe', 'Dragon': 'dragon', 'Mort-vivant': 'mortvivant', 'Vampire': 'vampire' };
export const famKey = fam => FAM_KEY[fam] || 'neutre';
// Dos de carte : celui par défaut, puis un par famille complétée dans chaque set. Il se voit sur vos cartes cachées, côté adversaire.
export const BACKS = { classique: 'Dos classique', ange: 'Dos céleste', demon: 'Dos infernal', gobelin: 'Dos de la horde', elfe: 'Dos sylvestre',
  dragon: 'Dos d\'écailles', mortvivant: 'Dos funéraire', vampire: 'Dos écarlate',
  ange_set2: 'Dos céleste du Crépuscule', demon_set2: 'Dos infernal du Crépuscule', gobelin_set2: 'Dos du banquet', elfe_set2: 'Dos des arcanes',
  dragon_set2: 'Dos des couvées', ...Object.fromEntries(SEASON_BACKS) };

// ---- Niveaux de carte ----
// Purement cosmétiques : la carte joue pareil à tous les niveaux. Chaque doublon donne de l'essence propre à la carte (ou au général) ;
// l'essence et des Éclats font monter la carte de niveau. L'adversaire voit le niveau des cartes que vous révélez.
// look : classe CSS de la bordure (style.css, « .lv-… ») ; fx : effet joué quand la carte est révélée.
// Les arts alternatifs (arts.js) se rangent à côté (compte : « arts », « artSel ») sans toucher aux niveaux.
export const CARD_LEVELS = [
  null,
  { name: 'Base', look: null, perk: 'Aspect d\'origine' },
  { name: 'Bronze', look: 'bronze', perk: 'Bordure de bronze' },
  { name: 'Argent', look: 'argent', perk: 'Bordure d\'argent' },
  { name: 'Or', look: 'or', pop: true, perk: 'Bordure d\'or et personnage qui sort du cadre' },
  { name: 'Astral', look: 'astral', fx: 'astral', pop: true, perk: 'Bordure astrale et effet de mise en jeu' },
];
export const MAX_CARD_LEVEL = CARD_LEVELS.length - 1;
// Essence et Éclats pour passer du niveau level − 1 à level.
export const levelCost = (level, r = DEFAULT_REWARDS) => ({ essence: r[`lvl${level}Essence`], shards: r[`lvl${level}Shards`] });

// ---- Complétion de famille et de set ----
// Chaque famille complétée dans chaque set : Éclats, une carte unique qui soutient la famille, un titre et un dos de carte.
// Un nouveau set ajoute ici une ligne par famille qu'il contient.
const F = (set, fam, card, title, back) => ({ set, fam, card, title, back });
export const FAMILY_REWARDS = [
  F('base', 'Ange', 'voix_aube', 'Héraut de l\'Aube', 'ange'),
  F('base', 'Démon', 'heritier_abysses', 'Prince des abysses', 'demon'),
  F('base', 'Gobelin', 'boss_horde', 'Grand chef de guerre', 'gobelin'),
  F('base', 'Elfe', 'gardienne_sentiers', 'Sage sylvestre', 'elfe'),
  F('base', 'Dragon', 'wyrm_tresor', 'Seigneur des dragons', 'dragon'),
  F('set2', 'Mort-vivant', 'faucheur', 'Maître des tombes', 'mortvivant'),
  F('set2', 'Vampire', 'reine_ecarlate', 'Prince de la nuit', 'vampire'),
  F('set2', 'Ange', 'prophetesse', 'Oracle du Crépuscule', 'ange_set2'),
  F('set2', 'Démon', 'prince_dupes', 'Marchand d\'âmes', 'demon_set2'),
  F('set2', 'Gobelin', 'maitre_banquet', 'Grand ripailleur', 'gobelin_set2'),
  F('set2', 'Elfe', 'archimage', 'Arcaniste des sylves', 'elfe_set2'),
  F('set2', 'Dragon', 'doyenne_couvees', 'Gardien des couvées', 'dragon_set2'),
];
export const familyReward = (set, fam) => FAMILY_REWARDS.find(r => r.set === set && r.fam === fam) || null;
// Set complété : Éclats, boosters offerts, une carte Dieu (pour le deck le plus faible du moment), un titre et un cadre.
export const SET_REWARDS = {
  base: { card: 'dieu_base', title: 'Gardien du Set de base', frame: 'base' },
  set2: { card: 'dieu_set2', title: 'Gardien du Crépuscule', frame: 'set2' },
};
// Cartes qu'on ne trouve dans aucun booster : elles ne s'obtiennent qu'en récompense.
export const REWARD_CARDS = [...FAMILY_REWARDS.map(f => f.card), ...Object.values(SET_REWARDS).map(s => s.card)];
export const rewardSourceOf = id => {
  const f = FAMILY_REWARDS.find(r => r.card === id);
  if (f) return { kind: 'family', fam: f.fam, set: f.set };
  const s = Object.entries(SET_REWARDS).find(([, r]) => r.card === id);
  return s ? { kind: 'set', set: s[0] } : null;
};

// Famille d'une carte ou d'un général (null pour les neutres).
export const familyOf = id => (GENERALS[id] ? GENERALS[id].fam : CARDS[id]?.kw.find(k => FAMILIES.includes(k))) || null;

// ---- Succès ----
// stat : compteur du compte comparé à goal. Éclats et Prismes se règlent dans /admin ; titres et cadres sont fixes.
// prisms : Prismes (monnaie des arts alternatifs), surtout pour les succès difficiles ; un peu pour les faciles.
// chests : coffres d'arts offerts, réservés aux succès les plus rares.
const A = (id, group, label, stat, goal, shards, extra = {}) => ({ id, group, label, stat, goal, shards, prisms: 0, chests: 0, ...extra });
export const ACHIEVEMENTS = [
  A('lvl5', 'Niveau', 'Atteindre le niveau 5', 'level', 5, 100, { prisms: 2, title: 'Apprenti' }),
  A('lvl10', 'Niveau', 'Atteindre le niveau 10', 'level', 10, 200, { prisms: 5, frame: 'bronze' }),
  A('lvl20', 'Niveau', 'Atteindre le niveau 20', 'level', 20, 400, { prisms: 10, frame: 'argent', title: 'Vétéran' }),
  A('lvl30', 'Niveau', 'Atteindre le niveau 30', 'level', 30, 600, { prisms: 20, frame: 'or' }),
  A('lvl50', 'Niveau', 'Atteindre le niveau 50', 'level', 50, 1000, { prisms: 40, frame: 'legende', title: 'Légende vivante' }),
  A('win1', 'Victoires', 'Remporter une première victoire', 'wins', 1, 50, { prisms: 2, title: 'Recrue' }),
  A('win10', 'Victoires', 'Remporter 10 victoires', 'wins', 10, 100, { prisms: 3, title: 'Combattant' }),
  A('win50', 'Victoires', 'Remporter 50 victoires', 'wins', 50, 300, { prisms: 10, title: 'Champion' }),
  A('win200', 'Victoires', 'Remporter 200 victoires', 'wins', 200, 600, { prisms: 30, title: 'Seigneur de guerre', frame: 'flamme' }),
  A('pvp5', 'Victoires', 'Gagner 5 parties en ligne', 'pvpWins', 5, 150, { prisms: 5, title: 'Duelliste' }),
  A('pvp25', 'Victoires', 'Gagner 25 parties en ligne', 'pvpWins', 25, 400, { prisms: 20, title: 'Maître duelliste', frame: 'duel' }),
  A('pve10', 'Victoires', 'Battre l\'IA 10 fois', 'pveWins', 10, 100, { prisms: 3, title: 'Fléau des automates' }),
  A('streak3', 'Victoires', 'Gagner 3 parties d\'affilée', 'bestStreak', 3, 150, { prisms: 3, title: 'Inarrêtable' }),
  A('streak5', 'Victoires', 'Gagner 5 parties d\'affilée', 'bestStreak', 5, 300, { prisms: 10, title: 'Invaincu' }),
  A('games50', 'Parties', 'Jouer 50 parties', 'games', 50, 200, { prisms: 5, title: 'Infatigable' }),
  A('games200', 'Parties', 'Jouer 200 parties', 'games', 200, 500, { prisms: 20, title: 'Pilier de la taverne' }),
  A('missions10', 'Parties', 'Accomplir 10 missions', 'missions', 10, 150, { prisms: 3, title: 'Assidu' }),
  A('missions50', 'Parties', 'Accomplir 50 missions', 'missions', 50, 400, { prisms: 15, frame: 'etoile' }),
  A('cards50', 'Collection', 'Posséder 50 cartes', 'cards', 50, 150, { prisms: 5, title: 'Collectionneur' }),
  A('cards100', 'Collection', 'Posséder 100 cartes', 'cards', 100, 300, { prisms: 15, frame: 'tresor' }),
  A('families3', 'Collection', 'Compléter 3 familles', 'families', 3, 300, { prisms: 15, title: 'Généalogiste' }),
  ...[
    ['Ange', 'Voix des cieux'], ['Démon', 'Signataire du pacte'], ['Gobelin', 'Meneur de horde'], ['Elfe', 'Gardien des bois'],
    ['Dragon', 'Dompteur de dragons'], ['Mort-vivant', 'Nécromant'], ['Vampire', 'Enfant de la nuit'],
  ].map(([fam, title]) => A(`fam_${famKey(fam)}`, 'Familles', `Gagner 10 parties avec un général ${fam}`, `famWins.${fam}`, 10, 150, { title, prisms: 5 })),
  A('art1', 'Arts alternatifs', 'Obtenir un premier art alternatif', 'arts', 1, 50, { title: 'Esthète' }),
  A('art10', 'Arts alternatifs', 'Posséder 10 arts alternatifs', 'arts', 10, 300, { prisms: 10 }),
  A('art20', 'Arts alternatifs', 'Posséder 20 arts alternatifs', 'arts', 20, 600, { chests: 1, title: 'Mécène' }),
  A('artLeg', 'Arts alternatifs', 'Obtenir un art légendaire', 'legendArts', 1, 200, { prisms: 10, title: 'Œil d\'or' }),
  A('chest10', 'Arts alternatifs', 'Ouvrir 10 coffres d\'arts', 'chests', 10, 200, { prisms: 10 }),
  A('up1', 'Niveaux de carte', 'Monter une carte au niveau 2', 'upgraded', 1, 50, { prisms: 1 }),
  A('up10', 'Niveaux de carte', 'Monter 10 cartes au niveau 2 ou plus', 'upgraded', 10, 200, { prisms: 5 }),
  A('max1', 'Niveaux de carte', 'Monter une carte au niveau maximum', 'maxCards', 1, 300, { prisms: 10, title: 'Orfèvre' }),
  A('max10', 'Niveaux de carte', 'Monter 10 cartes au niveau maximum', 'maxCards', 10, 800, { chests: 1, title: 'Maître artisan' }),
  A('rk1', 'Classé', 'Gagner une partie classée', 'rankedWins', 1, 50, { prisms: 2 }),
  A('rk50', 'Classé', 'Gagner 50 parties classées', 'rankedWins', 50, 400, { prisms: 15, title: 'Habitué de l\'arène' }),
  A('tier_or', 'Classé', 'Atteindre le palier Or', 'bestTier', 2, 200, { prisms: 5 }),
  A('tier_diamant', 'Classé', 'Atteindre le palier Diamant', 'bestTier', 4, 600, { prisms: 15, chests: 1 }),
  A('tier_maitre', 'Classé', 'Atteindre le palier Maître', 'bestTier', 5, 1000, { prisms: 25, chests: 2 }),
  A('friend1', 'Amis', 'Ajouter un ami', 'friends', 1, 50, { prisms: 1 }),
  A('friend5', 'Amis', 'Avoir 5 amis', 'friends', 5, 150, { prisms: 3, title: 'Âme de la taverne' }),
  A('friendWin', 'Amis', 'Gagner un défi contre un ami', 'friendWins', 1, 100, { prisms: 2 }),
  A('friendWin25', 'Amis', 'Gagner 25 défis contre des amis', 'friendWins', 25, 400, { prisms: 10, title: 'Rival redouté' }),
  A('login7', 'Connexion', 'Se connecter 7 jours', 'loginDays', 7, 100, { prisms: 2 }),
  A('login30', 'Connexion', 'Se connecter 30 jours', 'loginDays', 30, 300, { prisms: 10, title: 'Habitué' }),
  A('login100', 'Connexion', 'Se connecter 100 jours', 'loginDays', 100, 800, { prisms: 20, chests: 1 }),
  A('perfect1', 'Connexion', 'Ne manquer aucun jour d\'un mois', 'perfectMonths', 1, 500, { chests: 1, title: 'Fidèle' }),
  A('perfect6', 'Connexion', 'Ne manquer aucun jour pendant 6 mois', 'perfectMonths', 6, 1500, { prisms: 30, chests: 3, title: 'Gardien du calendrier' }),
];
export const statValue = (stats, stat) => stat.split('.').reduce((o, k) => (o ? o[k] : 0), stats) || 0;

// Tous les titres : ceux des succès, des familles et des sets.
export const TITLES = Object.fromEntries([
  ...ACHIEVEMENTS.filter(a => a.title).map(a => [a.id, a.title]),
  ...FAMILY_REWARDS.map(r => [`fam:${r.set}:${r.fam}`, r.title]),
  ...Object.entries(SET_REWARDS).map(([set, r]) => [`set:${set}`, r.title]),
  ...TIERS.filter(t => t.title).map(t => [`rang:${t.id}`, t.title]),
  ...SEASON_TITLES,
]);

// ---- Calendrier de connexion du mois ----
// Chaque jour du mois a sa récompense, à récupérer le jour même : un jour manqué est perdu, et tout repart le 1er.
// month : « AAAA-MM » (comme seasonId). Dimanche : coffre d'arts offert, plus des Prismes les 2e et 4e dimanches ; autres jours : Éclats.
export const monthDays = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export function loginReward(month, day, r = DEFAULT_REWARDS) {
  const [y, m] = month.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, day)).getUTCDay() !== 0) return { shards: r.loginShards };
  return { sunday: true, chests: r.loginChests, prisms: Math.ceil(day / 7) % 2 === 0 ? r.loginPrisms : 0 };
}
export const loginCalendar = (month, r = DEFAULT_REWARDS) => Array.from({ length: monthDays(month) }, (_, i) => ({ day: i + 1, ...loginReward(month, i + 1, r) }));
