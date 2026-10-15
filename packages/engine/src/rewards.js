// Récompenses du compte : niveau, missions quotidiennes, succès, complétion de famille et de set, titres, cadres et dos de carte.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche). Les nombres se règlent depuis /admin (document « recompenses »).
import { CARDS, GENERALS, FAMILIES } from './engine.js';
import { TIERS, PLACES } from './ranked.js';
import { SEASON_TITLES, SEASON_FRAMES, SEASON_BACKS } from './pass.js';
import { ARTS, ART_THEMES, MAX_FAV_ARTS } from './arts.js';
import { CLAN_TITLES, CLAN_FRAMES, CLAN_BACKS, CLAN_LEVELS } from './clans.js';
import { DEFAULT_SETS, setOf } from './collection.js';
import { BOSS_TITLES, BOSS_FRAMES, BOSS_BACKS } from './boss.js';
import { STORY_TITLES } from './story.js';
import { t, tp } from './i18n.js';

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
  // Missions de la semaine (hors passe, WEEKLY_MISSIONS) : nombre par semaine, et bonus quand elles sont toutes accomplies
  // (coffres d'arts et Prismes). Leurs objectifs, XP et Éclats se règlent avec ceux des missions quotidiennes.
  weeklyMissions: 3, weeklyBonusChests: 1, weeklyBonusPrisms: 3,
  // Complétion : famille d'un set (avec carte unique, titre et dos), set entier.
  familyShards: 200, setShards: 1000, setBoosters: 3,
  // Niveaux de carte : essence de la carte gagnée par doublon, puis essence et Éclats pour passer au niveau n (2 à 5).
  essencePerDuplicate: 10,
  // Essence universelle : une carte est au plafond quand son essence suffit à la monter jusqu'au niveau maximum (montée ou non) ;
  // l'essence d'un doublon au-delà du plafond devient de l'essence universelle (uniPerDuplicate pour essencePerDuplicate) ;
  // uniPerEssence d'essence universelle s'échangent contre 1 essence d'une autre carte (boutique, rayon Essence, ou carte ouverte en grand).
  uniPerDuplicate: 10, uniPerEssence: 2,
  lvl2Essence: 5, lvl2Shards: 50, lvl3Essence: 10, lvl3Shards: 100, lvl4Essence: 15, lvl4Shards: 200, lvl5Essence: 20, lvl5Shards: 400,
  // Mode classé : Éclats de fin de saison selon le meilleur palier atteint (ranked.js).
  rankShardsBronze: 50, rankShardsArgent: 100, rankShardsOr: 200, rankShardsPlatine: 350, rankShardsDiamant: 500, rankShardsMaitre: 800,
  // Prismes (monnaie rare des arts alternatifs, arts.js) de fin de saison selon le meilleur palier atteint.
  rankPrismsBronze: 0, rankPrismsArgent: 5, rankPrismsOr: 10, rankPrismsPlatine: 20, rankPrismsDiamant: 30, rankPrismsMaitre: 50,
  // Classement final de la saison (PLACES de ranked.js) : Éclats et Prismes en plus pour le top 10, le podium et la 1re place,
  // réservés aux joueurs qui ont joué au moins rankPlaceGames parties classées dans la saison.
  rankPlaceShardsTop10: 300, rankPlaceShardsTop3: 600, rankPlaceShardsTop1: 1000,
  rankPlacePrismsTop10: 20, rankPlacePrismsTop3: 40, rankPlacePrismsTop1: 80, rankPlaceGames: 10,
  // Calendrier de connexion du mois (loginReward) : Éclats en semaine, coffres d'arts le dimanche, Prismes les 2e et 4e dimanches.
  loginShards: 15, loginChests: 1, loginPrisms: 5,
  // Bienvenue des nouveaux comptes (welcomeReward) : 7 récompenses, une par jour de connexion distinct (pas forcément consécutifs),
  // à récupérer dans les welcomeWindow jours qui suivent la création du compte. Le 7e jour donne aussi le cadre et le titre de bienvenue.
  welcomeWindow: 14, welcomeShards1: 200, welcomeBoosters2: 1, welcomePrisms3: 10, welcomeChests4: 1, welcomeShards5: 300, welcomeBoosters6: 2, welcomePrisms7: 20,
  // Passe de saison (pass.js) : XP de saison par palier, missions du jour et de la semaine (nombre et XP), prix du premium en Prismes,
  // récompenses des paliers (gratuits : Éclats, Prismes, coffres ; premium : Prismes, coffres), mois avant que les cartes de saison
  // rejoignent le Set de base. Objectifs des missions et XP des missions de saison : passPool et passMissions.
  // Parties : XP de saison par victoire et par défaite (dans la limite des parties récompensées du jour).
  // Passe fini : un coffre de fin de passe tous les passBonusXp d'XP de saison, avec au hasard des Éclats, des Prismes ou de l'essence
  // d'une carte (montants fixes).
  passTierXp: 400, passXpWin: 60, passXpLoss: 30, passBonusXp: 800, passBonusShards: 100, passBonusPrisms: 6, passBonusEssence: 10, passDaily: 2, passWeekly: 4, passXpDaily: 150, passXpWeekly: 500, passPrice: 100,
  passShards: 40, passPrisms: 10, passChests: 1, passPremiumPrisms: 4, passPremiumChests: 1, passCardMonths: 3,
  // Tutoriel : Éclats pour chaque leçon finie la première fois, boosters offerts quand toutes le sont (TUTO_LESSONS).
  tutoShards: 25, tutoBoosters: 1,
};
export const REWARD_LIMITS = {
  xpBase: [10, 100000], xpStep: [0, 100000], xpCap: [10, 1000000], levelShards: [0, 100000], boosterEvery: [0, 100],
  xpPvpWin: [0, 10000], xpPvpLoss: [0, 10000], xpPveWin: [0, 10000], xpPveLoss: [0, 10000],
  shardsPvpWin: [0, 10000], shardsPveWin: [0, 10000], shardsLoss: [0, 10000], gamesPerDay: [0, 100],
  xpNewCard: [0, 10000], missionsPerDay: [0, 6], missionRerolls: [0, 10], weeklyMissions: [0, 6], weeklyBonusChests: [0, 10], weeklyBonusPrisms: [0, 10000],
  familyShards: [0, 100000], setShards: [0, 1000000], setBoosters: [0, 20],
  essencePerDuplicate: [0, 1000], uniPerDuplicate: [0, 1000], uniPerEssence: [1, 1000],
  lvl2Essence: [0, 10000], lvl2Shards: [0, 100000], lvl3Essence: [0, 10000], lvl3Shards: [0, 100000],
  lvl4Essence: [0, 10000], lvl4Shards: [0, 100000], lvl5Essence: [0, 10000], lvl5Shards: [0, 100000],
  rankShardsBronze: [0, 100000], rankShardsArgent: [0, 100000], rankShardsOr: [0, 100000], rankShardsPlatine: [0, 100000], rankShardsDiamant: [0, 100000], rankShardsMaitre: [0, 100000],
  rankPrismsBronze: [0, 10000], rankPrismsArgent: [0, 10000], rankPrismsOr: [0, 10000], rankPrismsPlatine: [0, 10000], rankPrismsDiamant: [0, 10000], rankPrismsMaitre: [0, 10000],
  rankPlaceShardsTop10: [0, 100000], rankPlaceShardsTop3: [0, 100000], rankPlaceShardsTop1: [0, 100000],
  rankPlacePrismsTop10: [0, 10000], rankPlacePrismsTop3: [0, 10000], rankPlacePrismsTop1: [0, 10000], rankPlaceGames: [0, 1000],
  loginShards: [0, 10000], loginChests: [0, 10], loginPrisms: [0, 10000],
  welcomeWindow: [7, 90], welcomeShards1: [0, 100000], welcomeBoosters2: [0, 20], welcomePrisms3: [0, 10000], welcomeChests4: [0, 10],
  welcomeShards5: [0, 100000], welcomeBoosters6: [0, 20], welcomePrisms7: [0, 10000],
  passTierXp: [10, 100000], passXpWin: [0, 10000], passXpLoss: [0, 10000], passBonusXp: [10, 100000], passBonusShards: [0, 100000], passBonusPrisms: [0, 10000], passBonusEssence: [0, 10000],
  passDaily: [0, 6], passWeekly: [0, 10], passXpDaily: [0, 100000], passXpWeekly: [0, 100000], passPrice: [0, 100000],
  passShards: [0, 100000], passPrisms: [0, 10000], passChests: [0, 10], passPremiumPrisms: [0, 10000], passPremiumChests: [0, 10], passCardMonths: [0, 60],
  tutoShards: [0, 10000], tutoBoosters: [0, 20],
};

// Leçons du tutoriel (client/src/tutorial.js, mêmes identifiants), dans l'ordre d'« Apprendre ». Chacune récompensée une fois.
// advanced : tutoriel avancé (une mécanique de famille par leçon), qui ne compte pas pour les boosters offerts.
// set : leçon d'un set, cachée et refusée avant sa sortie.
// Une nouvelle mécanique de famille mérite sa leçon : voir docs/recettes.md.
export const TUTO_LESSONS = [
  { id: 'initiation', name: 'Initiation' }, { id: 'effets', name: 'Effets et sorts' }, { id: 'terrains', name: 'Terrains et déplacements' },
  { id: 'generaux', name: 'Généraux' }, { id: 'complet', name: 'Partie complète' },
  { id: 'sceaux', name: 'Sceaux et Trésor', advanced: true }, { id: 'sacrifice', name: 'Sacrifice et Destruction', advanced: true },
  { id: 'releve', name: 'Défausse et Relève', advanced: true }, { id: 'drain', name: 'Drain et Échange', advanced: true },
  { id: 'sorts', name: 'Sortilège et Inspiration', advanced: true },
  { id: 'pari', name: 'Dés, triche et Jackpot', advanced: true, set: 'tapis' },
];

// XP pour passer du niveau `level` au suivant.
export const xpToNext = (level, r = DEFAULT_REWARDS) => Math.min(r.xpCap, r.xpBase + r.xpStep * (level - 1));

// ---- Missions quotidiennes ----
// Cible, XP et Éclats se règlent dans /admin. label(objectif, famille, nom de la carte).
// count(mission, cartes jouées) : de combien la mission avance en fin de partie (les autres avancent dans progress.js).
// pick(compte) : ce que la mission demande (famille, carte), tiré parmi les cartes que le joueur possède,
// ou null s'il n'en a pas assez pour la faire : la mission n'est alors pas tirée.
// group : deux missions du même groupe ne sont pas tirées le même jour. retired : n'est plus tirée (gardée pour les missions déjà tirées).
// stat : ce qui la fait avancer en fin de partie, parmi play, win, win_pvp, win_pve, ranked, sweep, zones (son id par défaut).
// on : ce qui la fait avancer hors partie (progress.act) : booster, boss (tentative du boss mondial menée au bout),
// clanDon (don au clan), missions (mission du jour accomplie).
// need : mode auquel le joueur doit avoir accès pour qu'elle soit tirée (progress.js, needs) : clan, boss.
// Objectifs des missions de cartes : environ trois parties (une partie pose 8 à 10 cartes, dont 6 à 8 de la famille du deck).
const plays = test => (m, played) => played.filter(id => CARDS[id] && test(CARDS[id], id, m)).length;
// Cartes possédées (hors généraux et jetons) qui vérifient test.
const ownedCards = (a, test = () => true) => Object.keys(a.cards || {}).filter(id => a.cards[id] && CARDS[id] && !CARDS[id].token && test(CARDS[id], id));
const rnd = list => list[Math.floor(Math.random() * list.length)];
// Une famille dont le joueur possède au moins min cartes qui vérifient test ; plus il en a, plus elle a de chances d'être tirée.
function ownedFam(a, min, test) {
  const by = {};
  for (const id of ownedCards(a, test)) { const f = familyOf(id); if (f) by[f] = (by[f] || 0) + 1; }
  const pool = Object.entries(by).filter(([, n]) => n >= min).flatMap(([fam, n]) => Array(n).fill(fam));
  return pool.length ? { fam: rnd(pool) } : null;
}
const enough = (min, test) => a => (ownedCards(a, test).length >= min ? {} : null);
const isC = d => d.type === 'C', isS = d => d.type === 'S', big = d => d.cost >= 4, cheap = d => d.cost <= 1 && !d.x;
const sameFam = (d, id, m) => familyOf(id) === m.fam;
export const MISSIONS = {
  play:    { label: n => tp(n, 'Jouer {n} partie', 'Jouer {n} parties'), target: 3, xp: 100, shards: 25 },
  win:     { label: n => tp(n, 'Gagner {n} partie', 'Gagner {n} parties'), target: 2, xp: 150, shards: 35 },
  win_pvp: { label: n => tp(n, 'Gagner une partie en ligne', 'Gagner {n} parties en ligne'), target: 1, xp: 150, shards: 35 },
  win_pve: { label: n => t('Battre l\'IA {n} fois', { n }), target: 2, xp: 100, shards: 25 },
  fam:     { label: (n, f) => t('Jouer {n} cartes {f}', { n, f: t(f) }), target: 20, xp: 120, shards: 30, group: 'fam', pick: a => ownedFam(a, 5), count: plays(sameFam) },
  spells:  { label: n => t('Jouer {n} sorts', { n }), target: 6, xp: 100, shards: 25, pick: enough(2, isS), count: plays(isS) },
  creatures: { label: n => t('Jouer {n} créatures', { n }), target: 24, xp: 100, shards: 25, pick: enough(5, isC), count: plays(isC) },
  fam_creatures: { label: (n, f) => t('Jouer {n} créatures {f}', { n, f: t(f) }), target: 15, xp: 110, shards: 25, group: 'fam', pick: a => ownedFam(a, 4, isC), count: plays((d, id, m) => isC(d) && sameFam(d, id, m)) },
  fam_spells: { label: (n, f) => tp(n, 'Jouer {n} sort {f}', 'Jouer {n} sorts {f}', { f: t(f) }), target: 4, xp: 110, shards: 25, group: 'fam', pick: a => ownedFam(a, 2, isS), count: plays((d, id, m) => isS(d) && sameFam(d, id, m)) },
  big:     { label: n => tp(n, 'Jouer {n} carte coûtant 4 sceaux ou plus', 'Jouer {n} cartes coûtant 4 sceaux ou plus'), target: 7, xp: 110, shards: 25, pick: enough(3, big), count: plays(big) },
  cheap:   { label: n => tp(n, 'Jouer {n} carte coûtant 1 sceau ou moins', 'Jouer {n} cartes coûtant 1 sceau ou moins'), target: 8, xp: 100, shards: 25, pick: enough(3, cheap), count: plays(cheap) },
  // Une carte précise : de préférence une carte d'un de ses decks.
  card:    { label: (n, f, c) => tp(n, 'Jouer {c} une fois', 'Jouer {c} {n} fois', { c }), target: 2, xp: 100, shards: 25,
    pick: a => { const owned = ownedCards(a), inDecks = owned.filter(id => (a.decks || []).some(d => d.cards?.includes(id)));
      return owned.length ? { card: rnd(inDecks.length ? inDecks : owned) } : null; },
    count: (m, played) => played.filter(id => id === m.card).length },
  // Zones remportées en fin de partie, gagnée ou non : remplace « gagner en remportant les 3 zones », trop rare (une partie sur vingt).
  zones:   { label: n => tp(n, 'Remporter {n} zone', 'Remporter {n} zones'), target: 4, xp: 120, shards: 30 },
  sweep:   { label: () => t('Gagner une partie en remportant les 3 zones'), target: 1, xp: 150, shards: 35, retired: true },
  booster: { label: () => t('Ouvrir le booster du jour'), target: 1, xp: 50, shards: 10, on: 'booster' },
  // Modes arrivés depuis : classé, boss mondial, clan.
  ranked:  { label: n => tp(n, 'Jouer {n} partie classée', 'Jouer {n} parties classées'), target: 2, xp: 120, shards: 30 },
  boss:    { label: n => tp(n, 'Affronter le boss mondial', 'Affronter le boss mondial {n} fois'), target: 1, xp: 100, shards: 25, need: 'boss', on: 'boss' },
  clan_don: { label: () => t('Faire un don à votre clan'), target: 1, xp: 60, shards: 15, need: 'clan', on: 'clanDon' },
};

// ---- Missions de la semaine ----
// Hors passe : tirées chaque lundi (semaine du jeu, weekOf dans pass.js), plus longues et mieux payées que celles du jour,
// avec un bonus quand elles sont toutes accomplies (weeklyBonusChests, weeklyBonusPrisms). Mêmes champs que MISSIONS ;
// leurs réglages sont rangés avec ceux des missions quotidiennes (identifiants en « w_ »).
export const WEEKLY_MISSIONS = {
  w_play:   { label: MISSIONS.play.label, stat: 'play', target: 15, xp: 400, shards: 100 },
  w_win:    { label: MISSIONS.win.label, stat: 'win', target: 8, xp: 500, shards: 120, group: 'win' },
  w_win_pvp: { label: MISSIONS.win_pvp.label, stat: 'win_pvp', target: 3, xp: 500, shards: 120, group: 'win' },
  w_ranked: { label: MISSIONS.ranked.label, stat: 'ranked', target: 8, xp: 500, shards: 120 },
  w_zones:  { label: MISSIONS.zones.label, stat: 'zones', target: 12, xp: 450, shards: 110 },
  w_sweep:  { label: n => tp(n, 'Gagner une partie en remportant les 3 zones', 'Gagner {n} parties en remportant les 3 zones'), stat: 'sweep', target: 1, xp: 500, shards: 120 },
  w_fam:    { label: MISSIONS.fam.label, target: 60, xp: 450, shards: 110, group: 'cards', pick: a => ownedFam(a, 5), count: plays(sameFam) },
  w_spells: { label: MISSIONS.spells.label, target: 20, xp: 400, shards: 100, group: 'cards', pick: enough(2, isS), count: plays(isS) },
  w_boss:   { label: MISSIONS.boss.label, target: 5, xp: 450, shards: 110, need: 'boss', on: 'boss' },
  w_missions: { label: n => tp(n, 'Accomplir {n} mission du jour', 'Accomplir {n} missions du jour'), target: 10, xp: 500, shards: 120, on: 'missions' },
};
// Toutes les missions (du jour et de la semaine), par identifiant.
export const ALL_MISSIONS = { ...MISSIONS, ...WEEKLY_MISSIONS };
export const missionLabel = m => ALL_MISSIONS[m.id]?.label(m.target, m.fam, CARDS[m.card]?.name || m.card) || m.id;

// ---- Cosmétiques ----
export const FRAMES = {
  bronze: 'Cadre de bronze', argent: 'Cadre d\'argent', or: 'Cadre d\'or', legende: 'Cadre légendaire',
  flamme: 'Cadre de flammes', duel: 'Cadre du duelliste', tresor: 'Cadre du trésor', etoile: 'Cadre étoilé',
  base: 'Couronne du Set de base', set2: 'Couronne du Crépuscule', set3: 'Couronne de la Cité Néon', tapis: 'Cadre du casino',
  platine: 'Cadre de platine', diamant: 'Cadre de diamant', maitre: 'Cadre du grand maître',
  // Bienvenue des nouveaux comptes : 7e jour (welcomeReward).
  bienvenue: 'Cadre de bienvenue',
  // Cadres des passes de saison (pass.js).
  ...Object.fromEntries(SEASON_FRAMES),
  // Cadres du magasin de clan (clans.js).
  ...Object.fromEntries(CLAN_FRAMES),
  // Cadres des paliers des familles d'arts : ajoutés plus bas (ART_THEME_FRAMES).
  // Cadres du magasin du boss mondial (boss.js).
  ...Object.fromEntries(BOSS_FRAMES),
  // Cadre du rayon Essence (ESSENCE_FRAME).
  essence_nebuleuse: 'Cadre de la nébuleuse',
};
// Cadre vendu au rayon Essence de la boutique, en essence universelle (prix réglable dans /admin : essFramePrice).
export const ESSENCE_FRAME = { id: 'essence_nebuleuse', price: 500 };
// Cadres animés : un calque en mouvement s'ajoute à l'anneau (client/src/frames-anim.css).
export const ANIMATED_FRAMES = new Set(['boss_comete', 'boss_brasier', 'essence_nebuleuse', 'set2', 'halloween_p', 'cyber_p', 'maitre', 'legende']);
const FAM_KEY = { 'Ange': 'ange', 'Démon': 'demon', 'Gobelin': 'gobelin', 'Elfe': 'elfe', 'Dragon': 'dragon', 'Mort-vivant': 'mortvivant', 'Vampire': 'vampire', 'Hacker': 'hacker', 'Cyborg': 'cyborg' };
export const famKey = fam => FAM_KEY[fam] || 'neutre';
// Dos de carte : celui par défaut, puis un par famille complétée dans chaque set. Il se voit sur vos cartes cachées, côté adversaire.
export const BACKS = { classique: 'Dos classique', ange: 'Dos céleste', demon: 'Dos infernal', gobelin: 'Dos de la horde', elfe: 'Dos sylvestre',
  dragon: 'Dos d\'écailles', mortvivant: 'Dos funéraire', vampire: 'Dos écarlate',
  ange_set2: 'Dos céleste du Crépuscule', demon_set2: 'Dos infernal du Crépuscule', gobelin_set2: 'Dos du banquet', elfe_set2: 'Dos des arcanes',
  dragon_set2: 'Dos des couvées',
  hacker: 'Dos du réseau', cyborg: 'Dos chromé', ange_set3: 'Dos de la Grille', demon_set3: 'Dos des daemons', gobelin_set3: 'Dos survolté',
  elfe_set3: 'Dos technomancien', dragon_set3: 'Dos corporatiste', mortvivant_set3: 'Dos fantôme', vampire_set3: 'Dos néon rouge',
  ...Object.fromEntries(SEASON_BACKS), ...Object.fromEntries(CLAN_BACKS), ...Object.fromEntries(BOSS_BACKS) };

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
// Essence qui manque encore à une carte pour atteindre le niveau maximum (niveau actuel, essence en réserve).
export const essenceToMax = (level, have, r = DEFAULT_REWARDS) => {
  let need = 0; for (let n = level + 1; n <= MAX_CARD_LEVEL; n++) need += levelCost(n, r).essence;
  return Math.max(0, need - have);
};

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
  F('set3', 'Hacker', 'architecte_chaos', 'Maître du réseau', 'hacker'),
  F('set3', 'Cyborg', 'chrome_absolu', 'Chrome intégral', 'cyborg'),
  F('set3', 'Ange', 'ange_grille', 'Ange de la Grille', 'ange_set3'),
  F('set3', 'Démon', 'daemon_racine', 'Daemon racine', 'demon_set3'),
  F('set3', 'Gobelin', 'surchauffeur', 'Grand surchauffeur', 'gobelin_set3'),
  F('set3', 'Elfe', 'archi_techno', 'Technomancien', 'elfe_set3'),
  F('set3', 'Dragon', 'dragon_holding', 'Actionnaire majoritaire', 'dragon_set3'),
  F('set3', 'Mort-vivant', 'revenant_binaire', 'Spectre binaire', 'mortvivant_set3'),
  F('set3', 'Vampire', 'baronne_donnees', 'Buveur de données', 'vampire_set3'),
];
export const familyReward = (set, fam) => FAMILY_REWARDS.find(r => r.set === set && r.fam === fam) || null;
// Set complété : Éclats, boosters offerts, une carte Dieu (pour le deck le plus faible du moment), un titre et un cadre.
export const SET_REWARDS = {
  base: { card: 'dieu_base', title: 'Gardien du Set de base', frame: 'base' },
  set2: { card: 'dieu_set2', title: 'Gardien du Crépuscule', frame: 'set2' },
  set3: { card: 'dieu_set3', title: 'Gardien de la Cité Néon', frame: 'set3' },
  // Mini-set : une carte de casino au lieu d'un Dieu.
  tapis: { card: 'as_pique', title: 'Flambeur', frame: 'tapis' },
};
// Cartes qu'on ne trouve dans aucun booster : elles ne s'obtiennent qu'en récompense.
export const REWARD_CARDS = [...FAMILY_REWARDS.map(f => f.card), ...Object.values(SET_REWARDS).map(s => s.card)];
export const rewardSourceOf = id => {
  const f = FAMILY_REWARDS.find(r => r.card === id);
  if (f) return { kind: 'family', fam: f.fam, set: f.set };
  const s = Object.entries(SET_REWARDS).find(([, r]) => r.card === id);
  return s ? { kind: 'set', set: s[0] } : null;
};

// ---- Paliers des familles d'arts ----
// Une famille d'arts (arts.js) grandit quand un nouveau set apporte des arts sur ses cartes : chaque set qui l'agrandit ajoute un palier.
// Un palier demande un nombre d'arts de la famille, d'où qu'ils viennent : le premier, autant d'arts qu'en avait la famille à sa création
// (le titre de la famille, acquis pour de bon) ; le dernier, tous ses arts. Chaque palier au-delà du premier débloque un cadre de la famille
// (cosmetics-art.js le dessine, ou un rendu provisoire à ses couleurs). Les arts d'une carte de récompense comptent avec le set qui la donne.
const SET_ORDER = DEFAULT_SETS.map(s => s.id);
const artSetIndex = a => Math.max(0, SET_ORDER.indexOf(rewardSourceOf(a.card)?.set || setOf(a.card)));
export function themeTiers(t) {
  const arts = Object.values(ARTS).filter(a => a.theme === t), steps = [...new Set(arts.map(artSetIndex))].sort((x, y) => x - y);
  return steps.map((i, n) => ({ n: n + 1, set: SET_ORDER[i], setName: DEFAULT_SETS[i].name, arts: arts.filter(a => artSetIndex(a) <= i).map(a => a.id) }));
}
export const ART_FRAME_NAMES = { vitraux: 'Cadre du vitrail', saisons: 'Cadre des saisons', eclipse: 'Cadre de l\'Éclipse', tresors: 'Cadre du butin',
  taverne: 'Cadre de la taverne', astral: 'Cadre astral', bannieres: 'Cadre aux bannières', bal: 'Cadre du bal masqué' };
export const artFrameId = (t, set) => `art_${t}_${set}`;
// [identifiant, nom] des cadres de familles d'arts : un par palier au-delà du premier (le deuxième porte le nom de la famille seul).
export const ART_THEME_FRAMES = Object.entries(ART_THEMES).flatMap(([t, x]) => themeTiers(t).slice(1).map((tier, i) => {
  const name = ART_FRAME_NAMES[t] || `Cadre ${x.name}`;
  return [artFrameId(t, tier.set), i ? `${name} · ${tier.setName}` : name];
}));
Object.assign(FRAMES, Object.fromEntries(ART_THEME_FRAMES));

// Famille d'une carte ou d'un général (null pour les neutres).
export const familyOf = id => (GENERALS[id] ? GENERALS[id].fam : CARDS[id]?.kw.find(k => FAMILIES.includes(k))) || null;

// ---- Succès ----
// stat : compteur du compte comparé à goal. Éclats et Prismes se règlent dans /admin ; titres, cadres et émotes (emotes.js) sont fixes.
// prisms : Prismes (monnaie des arts alternatifs), surtout pour les succès difficiles ; un peu pour les faciles.
// chests : coffres d'arts offerts, réservés aux succès les plus rares.
const A = (id, group, label, stat, goal, shards, extra = {}) => ({ id, group, label, stat, goal, shards, prisms: 0, chests: 0, ...extra });
export const ACHIEVEMENTS = [
  A('lvl5', 'Niveau', 'Atteindre le niveau 5', 'level', 5, 100, { prisms: 2, title: 'Apprenti' }),
  A('lvl10', 'Niveau', 'Atteindre le niveau 10', 'level', 10, 200, { prisms: 5, frame: 'bronze' }),
  A('lvl20', 'Niveau', 'Atteindre le niveau 20', 'level', 20, 400, { prisms: 10, frame: 'argent', title: 'Vétéran', emote: 'patience' }),
  A('lvl30', 'Niveau', 'Atteindre le niveau 30', 'level', 30, 600, { prisms: 20, frame: 'or' }),
  A('lvl50', 'Niveau', 'Atteindre le niveau 50', 'level', 50, 1000, { prisms: 40, frame: 'legende', title: 'Légende vivante' }),
  A('win1', 'Victoires', 'Remporter une première victoire', 'wins', 1, 50, { prisms: 2, title: 'Recrue' }),
  A('win10', 'Victoires', 'Remporter 10 victoires', 'wins', 10, 100, { prisms: 3, title: 'Combattant' }),
  A('win50', 'Victoires', 'Remporter 50 victoires', 'wins', 50, 300, { prisms: 10, title: 'Champion' }),
  A('win200', 'Victoires', 'Remporter 200 victoires', 'wins', 200, 600, { prisms: 30, title: 'Seigneur de guerre', frame: 'flamme' }),
  A('pvp5', 'Victoires', 'Gagner 5 parties en ligne', 'pvpWins', 5, 150, { prisms: 5, title: 'Duelliste' }),
  A('pvp25', 'Victoires', 'Gagner 25 parties en ligne', 'pvpWins', 25, 400, { prisms: 20, title: 'Maître duelliste', frame: 'duel', emote: 'garde' }),
  A('pve10', 'Victoires', 'Battre l\'IA 10 fois', 'pveWins', 10, 100, { prisms: 3, title: 'Fléau des automates' }),
  A('streak3', 'Victoires', 'Gagner 3 parties d\'affilée', 'bestStreak', 3, 150, { prisms: 3, title: 'Inarrêtable' }),
  A('streak5', 'Victoires', 'Gagner 5 parties d\'affilée', 'bestStreak', 5, 300, { prisms: 10, title: 'Invaincu', emote: 'feu' }),
  A('games50', 'Parties', 'Jouer 50 parties', 'games', 50, 200, { prisms: 5, title: 'Infatigable' }),
  A('games200', 'Parties', 'Jouer 200 parties', 'games', 200, 500, { prisms: 20, title: 'Pilier de la taverne', emote: 'tournee' }),
  A('missions10', 'Parties', 'Accomplir 10 missions', 'missions', 10, 150, { prisms: 3, title: 'Assidu' }),
  A('missions50', 'Parties', 'Accomplir 50 missions', 'missions', 50, 400, { prisms: 15, frame: 'etoile' }),
  A('cards50', 'Collection', 'Posséder 50 cartes', 'cards', 50, 150, { prisms: 5, title: 'Collectionneur' }),
  A('cards100', 'Collection', 'Posséder 100 cartes', 'cards', 100, 300, { prisms: 15, frame: 'tresor' }),
  A('families3', 'Collection', 'Compléter 3 familles', 'families', 3, 300, { prisms: 15, title: 'Généalogiste' }),
  ...[
    ['Ange', 'Voix des cieux'], ['Démon', 'Signataire du pacte'], ['Gobelin', 'Meneur de horde'], ['Elfe', 'Gardien des bois'],
    ['Dragon', 'Dompteur de dragons'], ['Mort-vivant', 'Nécromant'], ['Vampire', 'Enfant de la nuit'], ['Hacker', 'Netrunner', 'set3'], ['Cyborg', 'Augmenté', 'set3'],
  ].map(([fam, title, set]) => A(`fam_${famKey(fam)}`, 'Familles', `Gagner 10 parties avec un général ${fam}`, `famWins.${fam}`, 10, 150, { title, prisms: 5, ...(set ? { set } : {}) })),
  A('art1', 'Arts alternatifs', 'Obtenir un premier art alternatif', 'arts', 1, 50, { title: 'Esthète' }),
  A('art10', 'Arts alternatifs', 'Posséder 10 arts alternatifs', 'arts', 10, 300, { prisms: 10 }),
  A('art20', 'Arts alternatifs', 'Posséder 20 arts alternatifs', 'arts', 20, 600, { chests: 1, title: 'Mécène' }),
  A('artLeg', 'Arts alternatifs', 'Obtenir un art légendaire', 'legendArts', 1, 200, { prisms: 10, title: 'Œil d\'or' }),
  // Familles d'arts (arts.js) : palier par palier (themeTiers), un nombre d'arts de la famille quelle que soit leur provenance ;
  // le dernier palier demande toute la famille. Le premier donne le titre de la famille, les suivants un cadre.
  ...Object.entries(ART_THEMES).flatMap(([t, x]) => { const tiers = themeTiers(t);
    return tiers.map((tier, i) => {
      const n = tier.arts.length, label = i === tiers.length - 1 ? `Compléter la famille d'arts ${x.name}` : `Réunir ${n} arts de la famille ${x.name}`;
      return i ? A(`theme_${t}_${tier.set}`, 'Arts alternatifs', label, `artThemes.${t}`, n, 400, { prisms: 15, frame: artFrameId(t, tier.set), set: tier.set })
        : A(`theme_${t}`, 'Arts alternatifs', label, `artThemes.${t}`, n, 300, { prisms: 10, title: x.title, ...(tier.set !== SET_ORDER[0] ? { set: tier.set } : {}) });
    }); }),
  A('chest10', 'Arts alternatifs', 'Ouvrir 10 coffres d\'arts', 'chests', 10, 200, { prisms: 10 }),
  A('up1', 'Niveaux de carte', 'Monter une carte au niveau 2', 'upgraded', 1, 50, { prisms: 1 }),
  A('up10', 'Niveaux de carte', 'Monter 10 cartes au niveau 2 ou plus', 'upgraded', 10, 200, { prisms: 5 }),
  A('max1', 'Niveaux de carte', 'Monter une carte au niveau maximum', 'maxCards', 1, 300, { prisms: 10, title: 'Orfèvre' }),
  A('max10', 'Niveaux de carte', 'Monter 10 cartes au niveau maximum', 'maxCards', 10, 800, { chests: 1, title: 'Maître artisan' }),
  A('rk1', 'Classé', 'Gagner une partie classée', 'rankedWins', 1, 50, { prisms: 2 }),
  A('rk50', 'Classé', 'Gagner 50 parties classées', 'rankedWins', 50, 400, { prisms: 15, title: 'Habitué de l\'arène' }),
  A('tier_or', 'Classé', 'Atteindre le palier Or', 'bestTier', 2, 200, { prisms: 5 }),
  A('tier_diamant', 'Classé', 'Atteindre le palier Diamant', 'bestTier', 4, 600, { prisms: 15, chests: 1 }),
  A('tier_maitre', 'Classé', 'Atteindre le palier Maître', 'bestTier', 5, 1000, { prisms: 25, chests: 2, emote: 'admire' }),
  A('friend1', 'Amis', 'Ajouter un ami', 'friends', 1, 50, { prisms: 1 }),
  A('friend5', 'Amis', 'Avoir 5 amis', 'friends', 5, 150, { prisms: 3, title: 'Âme de la taverne' }),
  A('friendWin', 'Amis', 'Gagner un défi contre un ami', 'friendWins', 1, 100, { prisms: 2 }),
  A('friendWin25', 'Amis', 'Gagner 25 défis contre des amis', 'friendWins', 25, 400, { prisms: 10, title: 'Rival redouté', emote: 'attendais' }),
  // Boss mondial (boss.js) : tentatives, meilleur score d'une tentative, boss différents affrontés, top 10 d'une semaine.
  A('boss1', 'Boss mondial', 'Affronter un boss mondial', 'bossRuns', 1, 50, { prisms: 2 }),
  A('boss25', 'Boss mondial', 'Faire 25 tentatives contre les boss mondiaux', 'bossRuns', 25, 300, { prisms: 10, title: 'Traqueur' }),
  A('boss100', 'Boss mondial', 'Faire 100 tentatives contre les boss mondiaux', 'bossRuns', 100, 800, { prisms: 20, chests: 1 }),
  A('bossKinds', 'Boss mondial', 'Affronter 3 boss mondiaux différents', 'bossKinds', 3, 200, { prisms: 5 }),
  A('boss650', 'Boss mondial', 'Marquer 650 points en une tentative', 'bossBest', 650, 200, { prisms: 5 }),
  A('boss1000', 'Boss mondial', 'Marquer 1000 points en une tentative', 'bossBest', 1000, 500, { prisms: 15, title: 'Briseur de boss' }),
  A('bossTop10', 'Boss mondial', 'Finir une semaine dans le top 10 d\'un boss mondial', 'bossTop10', 1, 500, { prisms: 15, chests: 1 }),
  // Quêtes d'histoire (story.js) : chapitres gagnés pour la première fois, campagnes finies, quêtes à durée limitée finies.
  A('story1', 'Histoire', 'Gagner un premier chapitre d\'histoire', 'storyChapters', 1, 50, { prisms: 2 }),
  A('storyCamp1', 'Histoire', 'Finir une campagne d\'histoire', 'storyCampaigns', 1, 200, { prisms: 5, title: 'Conteur' }),
  A('storyCamp3', 'Histoire', 'Finir les trois campagnes des Terres d\'Aube', 'storyCampaigns', 3, 500, { prisms: 15, chests: 1, title: 'Chroniqueur de l\'Aube' }),
  A('storyLimited', 'Histoire', 'Finir une quête à durée limitée', 'storyLimited', 1, 200, { prisms: 5 }),
  A('login7', 'Connexion', 'Se connecter 7 jours', 'loginDays', 7, 100, { prisms: 2 }),
  A('login30', 'Connexion', 'Se connecter 30 jours', 'loginDays', 30, 300, { prisms: 10, title: 'Habitué' }),
  A('login100', 'Connexion', 'Se connecter 100 jours', 'loginDays', 100, 800, { prisms: 20, chests: 1 }),
  A('perfect1', 'Connexion', 'Ne manquer aucun jour d\'un mois', 'perfectMonths', 1, 500, { chests: 1, title: 'Fidèle' }),
  A('perfect6', 'Connexion', 'Ne manquer aucun jour pendant 6 mois', 'perfectMonths', 6, 1500, { prisms: 30, chests: 3, title: 'Gardien du calendrier' }),
  // Clans (clans.js) : comptés par le serveur des clans (progress.count et progress.best).
  A('clan1', 'Clans', 'Rejoindre un clan', 'clanJoins', 1, 50, { prisms: 2 }),
  A('clanMis10', 'Clans', 'Contribuer à 10 missions de clan accomplies', 'clanMissions', 10, 200, { prisms: 5, title: 'Pilier du clan' }),
  A('clanMis50', 'Clans', 'Contribuer à 50 missions de clan accomplies', 'clanMissions', 50, 500, { prisms: 15 }),
  A('clanDon500', 'Clans', 'Rapporter 500 Écus en dons au trésor du clan', 'clanDonated', 500, 300, { prisms: 10, title: 'Bienfaiteur' }),
  A('clanLvlMax', 'Clans', `Faire partie d'un clan de niveau ${CLAN_LEVELS.length}`, 'bestClanLevel', CLAN_LEVELS.length, 600, { prisms: 20, chests: 1, title: 'Bâtisseur de clan' }),
  // Événements temporaires (events.js) : parties jouées pendant qu'un événement a lieu.
  A('event1', 'Événements', 'Jouer une partie pendant un événement', 'eventGames', 1, 50, { prisms: 2 }),
  A('event25', 'Événements', 'Jouer 25 parties pendant des événements', 'eventGames', 25, 300, { prisms: 10, title: 'Toujours de la fête' }),
  A('eventRk10', 'Événements', 'Gagner 10 parties classées pendant une semaine double points', 'eventRankedWins', 10, 300, { prisms: 10 }),
  // Essence universelle et rayon Essence.
  A('uni100', 'Essence', 'Recueillir 100 essence universelle', 'uniGained', 100, 100, { prisms: 3 }),
  A('uni1000', 'Essence', 'Recueillir 1 000 essence universelle', 'uniGained', 1000, 500, { prisms: 15, title: 'Distillateur' }),
  A('uniConv1', 'Essence', 'Échanger de l\'essence universelle contre l\'essence d\'une carte', 'essenceConverts', 1, 50, { prisms: 2 }),
  A('essArt1', 'Essence', 'Obtenir un art de l\'édition Essence', 'essenceArts', 1, 100, { prisms: 5 }),
  // Profil public et bordures de niveau.
  A('fav3', 'Profil', `Choisir ${MAX_FAV_ARTS} arts préférés pour son profil public`, 'favArts', MAX_FAV_ARTS, 100, { prisms: 3, title: 'Galeriste' }),
  A('border1', 'Profil', 'Choisir la bordure d\'une carte', 'bordersChosen', 1, 50, { prisms: 2 }),
];

export const statValue = (stats, stat) => stat.split('.').reduce((o, k) => (o ? o[k] : 0), stats) || 0;

// Titre de bienvenue (7e jour, welcomeReward).
export const WELCOME_TITLE = 'bienvenue';
// Tous les titres : ceux des succès, des familles et des sets.
export const TITLES = Object.fromEntries([
  ...ACHIEVEMENTS.filter(a => a.title).map(a => [a.id, a.title]),
  ...FAMILY_REWARDS.map(r => [`fam:${r.set}:${r.fam}`, r.title]),
  ...Object.entries(SET_REWARDS).map(([set, r]) => [`set:${set}`, r.title]),
  ...TIERS.filter(t => t.title).map(t => [`rang:${t.id}`, t.title]),
  ...PLACES.map(p => [`rang:${p.id}`, p.title]),
  ...SEASON_TITLES,
  ...CLAN_TITLES,
  ...BOSS_TITLES,
  ...STORY_TITLES,
  [WELCOME_TITLE, 'Recrue prometteuse'],
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

// ---- Bienvenue des nouveaux comptes ----
// 7 récompenses, une par jour de connexion distinct, pas forcément consécutifs, dans les welcomeWindow jours qui suivent la création
// du compte ; distinct du calendrier du mois, qui continue à côté. Jour 7 : Prismes, cadre et titre de bienvenue.
export const WELCOME_STEPS = 7;
export function welcomeReward(n, r = DEFAULT_REWARDS) {
  return [null, { shards: r.welcomeShards1 }, { boosters: r.welcomeBoosters2 }, { prisms: r.welcomePrisms3 }, { chests: r.welcomeChests4 },
    { shards: r.welcomeShards5 }, { boosters: r.welcomeBoosters6 }, { prisms: r.welcomePrisms7, frame: 'bienvenue', title: WELCOME_TITLE }][n] || null;
}
export const welcomeRewards = (r = DEFAULT_REWARDS) => Array.from({ length: WELCOME_STEPS }, (_, i) => ({ n: i + 1, ...welcomeReward(i + 1, r) }));
