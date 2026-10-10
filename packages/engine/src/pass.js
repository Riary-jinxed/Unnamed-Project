// Passe de saison : une saison par mois (comme le mode classé, saison « AAAA-MM »), avec ses missions du jour, de la semaine
// et de la saison qui donnent l'XP de saison, et PASS_TIERS paliers de récompenses : une piste gratuite pour tous et une piste
// premium achetée en Prismes, qui rend son prix en Prismes au fil des paliers.
// Chaque saison a ses cartes uniques (elles rejoignent le Set de base quelques mois plus tard), ses cosmétiques (titre, cadre,
// dos de carte, en version gratuite et premium) et des arts Promo donnés pour les missions de saison accomplies.
// Partagé par le serveur (qui fait foi) et l'appli (qui affiche). Les nombres se règlent dans l'onglet Récompenses de /admin
// (réglages « pass… » de DEFAULT_REWARDS dans rewards.js, plus passPool et passMissions).

export const PASS_TIERS = 40;

// ---- Missions ----
// Sortes de mission et ce qui les fait avancer (voir onPass dans server/src/progress.js).
// daily, weekly : objectif dans les missions du jour et de la semaine (null : jamais tirée là). Réglables dans /admin.
const s = n => (n === 1 ? '' : 's');
export const PASS_KINDS = {
  play:      { label: n => `Jouer ${n} partie${s(n)}`, daily: 3, weekly: 15 },
  win:       { label: n => `Gagner ${n} partie${s(n)}`, daily: 2, weekly: 8 },
  ranked:    { label: n => `Jouer ${n} partie${s(n)} classée${s(n)}`, daily: 2, weekly: 8 },
  pvp:       { label: n => `Gagner ${n === 1 ? 'une partie' : `${n} parties`} en ligne`, daily: null, weekly: null },
  spells:    { label: n => `Jouer ${n} sort${s(n)}`, daily: 4, weekly: 15 },
  creatures: { label: n => `Jouer ${n} créature${s(n)}`, daily: 10, weekly: 40 },
  fam:       { label: (n, f) => `Jouer ${n} carte${s(n)} ${f}`, daily: 8, weekly: 30 },
  sweep:     { label: n => `Gagner ${n === 1 ? 'une partie' : `${n} parties`} en remportant les 3 zones`, daily: 1, weekly: 3 },
  booster:   { label: () => 'Ouvrir le booster du jour', daily: 1, weekly: null },
  missions:  { label: n => `Accomplir ${n} mission${s(n)} du jour`, daily: 2, weekly: 10 },
  login:     { label: n => `Récupérer ${n} récompense${s(n)} du calendrier`, daily: null, weekly: 5 },
  season:    { label: n => `Jouer ${n === 1 ? 'une fois' : `${n} fois`} une carte de la saison`, daily: null, weekly: null },
};
export const passMissionLabel = m => PASS_KINDS[m.kind]?.label(m.target, m.fam) || m.kind;

// ---- Saisons ----
// id : mois de la saison (« AAAA-MM »). cards : 2 ou 3 cartes uniques (set « saison » dans engine.js).
// fams : familles des missions « Jouer des cartes … » de la saison. promo : arts Promo (arts.js) donnés quand le joueur a
// accompli « after » missions de saison. missions : id unique, sorte, objectif, XP de saison (objectif et XP réglables).
// Cosmétiques : [id, nom] ; leur style est dans client/src/style.css (.frame-<id>, .mc.back.back-<id>).
const M = (id, kind, target, xp, extra = {}) => ({ id, kind, target, xp, ...extra });
export const SEASONS = [
  { id: '2026-10', name: 'Nuit des citrouilles', theme: 'halloween',
    blurb: 'Les lanternes s\'allument, les citrouilles ricanent et le sabbat se prépare : un mois d\'Halloween pour gagner deux cartes uniques, des cosmétiques de saison et deux arts Promo.',
    fams: ['Démon', 'Gobelin'],
    cards: ['citrouille', 'sorciere_sabbat'],
    title: 'Chasseur de citrouilles', titlePremium: 'Roi des citrouilles',
    frame: ['halloween', 'Cadre des lanternes'], framePremium: ['halloween_p', 'Cadre du sabbat'],
    back: ['halloween', 'Dos de la citrouille'], backPremium: ['halloween_p', 'Dos de la nuit hantée'],
    promo: [{ art: 'morgrath_citrouilles', after: 4 }, { art: 'grisk_farce', after: 8 }],
    missions: [
      M('h_play', 'play', 60, 2000), M('h_win', 'win', 30, 2000), M('h_demon', 'fam', 100, 1500, { fam: 'Démon' }), M('h_sweep', 'sweep', 10, 1500),
      M('h_ranked', 'ranked', 15, 1500), M('h_missions', 'missions', 40, 2000), M('h_cards', 'season', 10, 1500), M('h_login', 'login', 20, 1500),
    ] },
  // Préparée : il reste à dessiner les arts Promo et à relire les cartes avant novembre.
  { id: '2026-11', name: 'Néon 2099', theme: 'cyber',
    blurb: 'La ville ne dort jamais : drones, netrunners et néons envahissent le champ de bataille pour une saison futuriste.',
    fams: ['Elfe', 'Dragon'],
    cards: ['drone', 'netrunner'],
    title: 'Fantôme du réseau', titlePremium: 'Légende chromée',
    frame: ['cyber', 'Cadre néon'], framePremium: ['cyber_p', 'Cadre holographique'],
    back: ['cyber', 'Dos du circuit'], backPremium: ['cyber_p', 'Dos de la mégapole'],
    promo: [{ art: 'lirael_neon', after: 4 }, { art: 'vaelthar_chrome', after: 8 }],
    missions: [
      M('c_play', 'play', 60, 2000), M('c_win', 'win', 30, 2000), M('c_elfe', 'fam', 100, 1500, { fam: 'Elfe' }), M('c_spells', 'spells', 80, 1500),
      M('c_ranked', 'ranked', 15, 1500), M('c_missions', 'missions', 40, 2000), M('c_cards', 'season', 10, 1500), M('c_login', 'login', 20, 1500),
    ] },
];
export const seasonById = id => SEASONS.find(x => x.id === id) || null;
// Saisons déjà commencées (month : mois courant, « AAAA-MM »). Les suivantes restent cachées dans l'appli.
export const seasonStarted = (id, month) => id <= month;
export const SEASON_CARDS = Object.fromEntries(SEASONS.flatMap(x => x.cards.map(c => [c, x.id])));
export const seasonOfCard = id => seasonById(SEASON_CARDS[id]);
export const SEASON_MISSIONS = Object.fromEntries(SEASONS.flatMap(x => x.missions.map(m => [m.id, m])));

// Mois « AAAA-MM » décalé de n mois.
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number), t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
// Cartes de saison qui ont rejoint le Set de base : « months » mois après le début de leur saison.
export const releasedCards = (month, months) => SEASONS.filter(x => addMonths(x.id, months) <= month).flatMap(x => x.cards);
export const releaseMonth = (id, months) => addMonths(seasonOfCard(id)?.id || '9999-12', months);

// Titres, cadres et dos de toutes les saisons, pour TITLES, FRAMES et BACKS (rewards.js).
export const SEASON_TITLES = SEASONS.flatMap(x => [[`saison:${x.id}`, x.title], [`saison:${x.id}:p`, x.titlePremium]]);
export const SEASON_FRAMES = SEASONS.flatMap(x => [x.frame, x.framePremium]);
export const SEASON_BACKS = SEASONS.flatMap(x => [x.back, x.backPremium]);

// ---- Paliers ----
// Piste gratuite : des Éclats à chaque palier, sauf les paliers spéciaux (titre, cartes uniques, Prismes, coffres d'arts, dos, cadre).
// Piste premium : des Prismes à chaque palier (c'est ce qui rembourse le passe), un coffre d'arts tous les 10 paliers, et ses cosmétiques.
// r : réglages (DEFAULT_REWARDS complété par /admin).
const CARD_TIERS = [10, 30, 22];
export function passTrack(season, r) {
  const free = {
    5: { title: `saison:${season.id}` }, 15: { prisms: r.passPrisms }, 20: { chests: r.passChests }, 25: { back: season.back[0] },
    35: { prisms: r.passPrisms }, 40: { chests: r.passChests, frame: season.frame[0] },
  };
  season.cards.forEach((card, i) => { free[CARD_TIERS[i]] = { card }; });
  const premium = { 1: { frame: season.framePremium[0] }, 25: { back: season.backPremium[0] } };
  for (let t = 10; t <= PASS_TIERS; t += 10) premium[t] = { chests: r.passPremiumChests };
  premium[PASS_TIERS] = { ...premium[PASS_TIERS], title: `saison:${season.id}:p` };
  return Array.from({ length: PASS_TIERS }, (_, i) => {
    const t = i + 1;
    return { tier: t, free: free[t] || { shards: r.passShards }, premium: premium[t] || { prisms: r.passPremiumPrisms } };
  });
}
// Palier où les Prismes de la piste premium ont rendu le prix du passe (null : jamais avec ces réglages).
export function refundTier(season, r) {
  let got = 0;
  for (const t of passTrack(season, r)) { got += t.premium.prisms || 0; if (got >= r.passPrice) return t.tier; }
  return null;
}
// Palier atteint avec xp d'XP de saison (0 à PASS_TIERS), et XP dans le palier en cours.
export function tierOf(xp, r) {
  const per = Math.max(1, r.passTierXp), tier = Math.min(PASS_TIERS, Math.floor(xp / per));
  return { tier, xp: tier >= PASS_TIERS ? per : xp - tier * per, next: per };
}

// Semaine du jeu : lundi (« AAAA-MM-JJ ») de la semaine du jour donné (journées à l'heure de Paris, voir today()).
export function weekOf(day) {
  const d = new Date(`${day}T12:00:00Z`), back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}
