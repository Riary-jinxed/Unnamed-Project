// Progression du compte : XP et niveau, missions quotidiennes, succès, complétion de famille et de set, titres, cadres et dos de carte,
// rang du mode classé et saisons, passe de saison.
// Les nombres viennent du document « recompenses » (réglé depuis /admin), complété par les valeurs par défaut de rewards.js.
// Chaque récompense gagnée est aussi rangée dans la boîte « inbox » du compte, que l'appli affiche puis vide.
import { DEFAULT_REWARDS, REWARD_LIMITS, MISSIONS, ACHIEVEMENTS, familyReward, SET_REWARDS, TITLES, FRAMES, BACKS,
  xpToNext, familyOf, statValue, missionLabel, MAX_CARD_LEVEL, levelCost, essenceToMax, loginCalendar, loginReward, monthDays, welcomeReward, welcomeRewards, WELCOME_STEPS } from '@jeu/engine/rewards';
import { SETS, OWNABLE, today, setRevealed, setById } from '@jeu/engine/collection';
import { CARDS, GENERALS, DECKS, shuffle } from '@jeu/engine';
import { TIERS, PLACES, rankOf, applyResult, seasonId, seasonName, seasonDaysLeft, seasonReset, seasonShardsKey, seasonPrismsKey, seasonCosmetics,
  placeOf, placeShardsKey, placePrismsKey, placeTitles } from '@jeu/engine/ranked';
import { ARTS, artExists, THEME_IDS, MAX_FAV_ARTS, isEssenceArt } from '@jeu/engine/arts';
import { PASS_KINDS, PASS_TIERS, BONUS_ODDS, SEASON_MISSIONS, SEASON_CARDS, seasonById, passTrack, refundTier, tierOf as passTierOf, weekOf, passMissionLabel, releasedCards, addMonths,
  currentSeason, THEME_TIER, SEASON_THEMES } from '@jeu/engine/pass';
import { boost } from '@jeu/engine/events';
import { EMOTES, EMOTE_SLOTS, ownsEmote, ownedEmotes, emoteSet } from '@jeu/engine/emotes';
import { HttpError } from './accounts.js';
import { createEvents } from './events.js';

const INBOX_MAX = 40;
// Art alternatif choisi pour chacune de ces cartes, s'il est toujours possédé (arts.js).
const shownArts = (a, ids) => Object.fromEntries(ids.filter(id => id && a.artSel?.[id] && a.arts?.[a.artSel[id]] && artExists(a.artSel[id])).map(id => [id, a.artSel[id]]));
const newStats = () => ({ games: 0, wins: 0, pvpWins: 0, pveWins: 0, streak: 0, bestStreak: 0, missions: 0, famWins: {}, day: null, dayGames: 0,
  chests: 0, rankedWins: 0, bestTier: 0, friendWins: 0, loginDays: 0, perfectMonths: 0 });
const bump = (s, k, n = 1) => { s[k] = (s[k] || 0) + n; };

export function createProgress(store) {
  // Événements temporaires (week-end double XP…) : multiplient certains gains tant qu'ils durent.
  const events = createEvents(store);
  // Réglages : valeurs par défaut, puis celles enregistrées depuis /admin.
  function cfg() {
    const doc = store.doc('recompenses') || {};
    const missions = Object.fromEntries(Object.entries(MISSIONS).map(([id, m]) => [id, { target: m.target, xp: m.xp, shards: m.shards, on: true, ...(doc.missions || {})[id] }]));
    const achievements = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, (doc.achievements || {})[x.id] ?? x.shards]));
    const achievementPrisms = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, (doc.achievementPrisms || {})[x.id] ?? x.prisms]));
    const achievementChests = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, (doc.achievementChests || {})[x.id] ?? x.chests]));
    // Passe de saison : objectifs des missions du jour et de la semaine par sorte, objectif et XP de chaque mission de saison.
    const passPool = Object.fromEntries(Object.entries(PASS_KINDS).map(([k, x]) => [k, { daily: x.daily, weekly: x.weekly, ...(doc.passPool || {})[k] }]));
    const passMissions = Object.fromEntries(Object.values(SEASON_MISSIONS).map(m => [m.id, { target: m.target, xp: m.xp, ...(doc.passMissions || {})[m.id] }]));
    return { ...DEFAULT_REWARDS, ...doc, missions, achievements, achievementPrisms, achievementChests, passPool, passMissions };
  }

  // ---- Champs du compte ----
  // Renvoie true si le compte a changé. Un compte d'avant les récompenses reçoit ses statistiques et l'XP de ses parties passées.
  function init(a) {
    if (a.level) return false;
    Object.assign(a, { level: 1, xp: 0, freeBoosters: a.freeBoosters || 0, stats: newStats(), achievements: {}, completed: {},
      cosmetics: { titles: [], frames: [], backs: ['classique'] }, title: null, frame: null, back: 'classique', inbox: [] });
    if (!a.starter) return true;
    const c = cfg(), s = a.stats;
    let xp = 0;
    for (const g of store.games()) {
      const i = g.players.findIndex(P => P.login === a.login); if (i < 0) continue;
      const win = g.winner === i, pvp = g.mode === 'pvp';
      countGame(s, win, pvp, g.players[i].general);
      xp += win ? (pvp ? c.xpPvpWin : c.xpPveWin) : (pvp ? c.xpPvpLoss : c.xpPveLoss);
    }
    const starterSize = Object.keys(DECKS[a.starter] ? DECKS[a.starter].cards : {}).length + 4;
    xp += Math.max(0, Object.keys(a.cards || {}).length - starterSize) * c.xpNewCard;
    if (xp) { push(a, { kind: 'catchup', label: 'Rattrapage de vos parties et cartes passées', xp }); addXp(a, xp); }
    return true;
  }
  function countGame(s, win, pvp, general) {
    s.games++;
    if (win) {
      s.wins++; s[pvp ? 'pvpWins' : 'pveWins']++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
      const fam = GENERALS[general]?.fam; if (fam) s.famWins[fam] = (s.famWins[fam] || 0) + 1;
    } else s.streak = 0;
  }
  const push = (a, entry) => { a.inbox = [...(a.inbox || []), { at: new Date().toISOString(), ...entry }].slice(-INBOX_MAX); };

  // ---- XP, niveau et récompenses ----
  function addXp(a, xp) {
    const c = cfg();
    a.xp += xp;
    while (a.xp >= xpToNext(a.level, c)) {
      a.xp -= xpToNext(a.level, c); a.level++;
      const booster = c.boosterEvery > 0 && a.level % c.boosterEvery === 0 ? 1 : 0;
      a.shards = (a.shards || 0) + c.levelShards; a.freeBoosters = (a.freeBoosters || 0) + booster;
      push(a, { kind: 'level', label: `Niveau ${a.level} atteint`, shards: c.levelShards, boosters: booster });
    }
    checkAchievements(a);
  }
  // Donne une récompense (Éclats, Prismes, XP, boosters et coffres d'arts offerts, carte, titre, cadre, dos, émote) et la range dans la boîte du compte
  // (sauf silent : le calendrier montre lui-même ce qu'il donne).
  function grant(a, r, { silent = false } = {}) {
    if (r.shards) a.shards = (a.shards || 0) + r.shards;
    if (r.prisms) a.prisms = (a.prisms || 0) + r.prisms;
    if (r.clanCoins) a.clanCoins = (a.clanCoins || 0) + r.clanCoins;
    if (r.bossCoins) a.bossCoins = (a.bossCoins || 0) + r.bossCoins;
    if (r.chests) a.freeChests = (a.freeChests || 0) + r.chests;
    if (r.boosters) a.freeBoosters = (a.freeBoosters || 0) + r.boosters;
    if (r.card && !a.cards[r.card]) a.cards[r.card] = 1;
    if (r.title && !a.cosmetics.titles.includes(r.title)) a.cosmetics.titles.push(r.title);
    if (r.frame && !a.cosmetics.frames.includes(r.frame)) a.cosmetics.frames.push(r.frame);
    if (r.back && !a.cosmetics.backs.includes(r.back)) a.cosmetics.backs.push(r.back);
    if (r.theme && !(a.cosmetics.themes ||= []).includes(r.theme)) a.cosmetics.themes.push(r.theme);
    if (r.emote && !ownsEmote(a.cosmetics.emotes, r.emote)) (a.cosmetics.emotes ||= []).push(r.emote);
    if (r.art && ARTS[r.art] && !a.arts?.[r.art]) a.arts = { ...(a.arts || {}), [r.art]: { at: new Date().toISOString(), gift: true } };
    if (!silent) push(a, r);
    if (r.xp) addXp(a, r.xp);
  }

  // ---- Succès ----
  function statsOf(a) {
    const owned = Object.keys(a.cards || {}).filter(id => a.cards[id]).length;
    const families = Object.keys(a.completed || {}).filter(k => k.includes(':')).length;
    const arts = Object.keys(a.arts || {}).filter(artExists), levels = Object.values(a.cardLevels || {});
    return { ...a.stats, level: a.level, cards: owned, families, arts: arts.length, artThemes: Object.fromEntries(THEME_IDS.map(t => [t, arts.filter(id => ARTS[id].theme === t).length])), legendArts: arts.filter(id => ARTS[id].rarity === 'legendaire').length,
      essenceArts: arts.filter(id => isEssenceArt(ARTS[id])).length, favArts: favArts(a).length, bordersChosen: Object.keys(a.lvLook || {}).length,
      upgraded: levels.filter(l => l >= 2).length, maxCards: levels.filter(l => l >= MAX_CARD_LEVEL).length, friends: (a.friends || []).length,
      bestTier: Math.max(a.stats?.bestTier || 0, a.ranked?.games ? rankOf(a.ranked.best).tier : 0),
      // Comptes d'avant ces succès : un clan déjà rejoint, l'essence universelle déjà en réserve.
      clanJoins: Math.max(a.stats?.clanJoins || 0, a.clan ? 1 : 0), uniGained: Math.max(a.stats?.uniGained || 0, a.uniEssence || 0) };
  }
  // Compteurs tenus ailleurs (clans) : count ajoute n, best garde le plus grand ; les succès suivent.
  function count(a, k, n = 1) { if (!a.level || !n) return; bump(a.stats, k, n); checkAchievements(a); }
  function best(a, k, v) { if (!a.level || v <= (a.stats[k] || 0)) return false; a.stats[k] = v; checkAchievements(a); return true; }
  function checkAchievements(a) {
    const s = statsOf(a), c = cfg();
    for (const x of ACHIEVEMENTS) {
      // Succès obtenu avant que son émote existe : l'émote est donnée sans bruit.
      if (a.achievements[x.id] && x.emote && !ownsEmote(a.cosmetics.emotes, x.emote)) (a.cosmetics.emotes ||= []).push(x.emote);
      if (a.achievements[x.id] || statValue(s, x.stat) < x.goal) continue;
      a.achievements[x.id] = new Date().toISOString();
      grant(a, { kind: 'achievement', label: `Succès : ${x.label}`, shards: c.achievements[x.id], prisms: c.achievementPrisms[x.id], chests: c.achievementChests[x.id],
        title: x.title ? x.id : undefined, frame: x.frame, emote: x.emote });
    }
  }

  // ---- Collection : nouvelles cartes, familles et sets complétés ----
  function onCards(a, fresh) {
    const n = fresh.filter(Boolean).length, xp = boost(n * cfg().xpNewCard, events.mult('xp'));
    if (xp) addXp(a, xp);
    checkCollection(a);
    return xp;
  }
  function checkCollection(a) {
    if (!a.level) return;
    const c = cfg();
    for (const set of SETS) {
      if (!set.cards.length || !setRevealed(set)) continue;
      for (const fam of new Set(set.cards.map(familyOf).filter(Boolean))) {
        const key = `${set.id}:${fam}`;
        if (a.completed[key] || !set.cards.filter(id => familyOf(id) === fam).every(id => a.cards[id])) continue;
        a.completed[key] = new Date().toISOString();
        const r = familyReward(set.id, fam);
        grant(a, { kind: 'family', label: `Famille ${fam} complétée (${set.name})`, shards: c.familyShards, ...(r ? { card: r.card, title: `fam:${set.id}:${fam}`, back: r.back } : {}) });
      }
      if (a.completed[set.id] || !set.cards.every(id => a.cards[id])) continue;
      a.completed[set.id] = new Date().toISOString();
      const r = SET_REWARDS[set.id];
      grant(a, { kind: 'set', label: `Set ${set.name} complété`, shards: c.setShards, boosters: c.setBoosters, ...(r ? { card: r.card, title: `set:${set.id}`, frame: r.frame } : {}) });
    }
    checkAchievements(a);
  }

  // ---- Missions quotidiennes ----
  function missions(a) {
    const c = cfg(), day = today();
    if (a.missions?.date === day) return a.missions;
    a.missions = { date: day, rerolls: 0, list: draw(a, Object.keys(MISSIONS).filter(id => c.missions[id].on && !MISSIONS[id].retired), c.missionsPerDay) };
    return a.missions;
  }
  // n missions au hasard parmi ids, sans celles que le joueur ne peut pas faire avec sa collection
  // ni deux d'un même groupe (en comptant celles de keep, déjà là).
  function draw(a, ids, n, keep = []) {
    const list = [], group = id => MISSIONS[id].group || id, taken = new Set(keep.map(m => group(m.id)));
    for (const id of shuffle(ids)) {
      if (list.length >= n) break;
      if (taken.has(group(id))) continue;
      const m = newMission(a, id); if (m) { list.push(m); taken.add(group(id)); }
    }
    return list;
  }
  // Famille ou carte demandée : tirée parmi les cartes du joueur (pick, rewards.js) ; null s'il n'en a pas assez.
  function newMission(a, id) {
    const m = cfg().missions[id], pick = MISSIONS[id].pick ? MISSIONS[id].pick(a) : {};
    if (!pick) return null;
    return { id, target: m.target, xp: m.xp, shards: m.shards, n: 0, done: false, ...pick };
  }
  function advance(a, test) {
    for (const m of missions(a).list) {
      if (m.done) continue;
      m.n = Math.min(m.target, m.n + test(m));
      if (m.n < m.target) continue;
      m.done = true; a.stats.missions++;
      grant(a, { kind: 'mission', label: `Mission : ${missionLabel(m)}`, xp: boost(m.xp, events.mult('xp')), shards: m.shards });
      passAdvance(a, x => (x.kind === 'missions' ? 1 : 0));
    }
  }
  async function reroll(a, { index }) {
    const ms = missions(a), c = cfg(), m = ms.list[index];
    if (!m || m.done) throw new HttpError(400, 'Cette mission ne peut pas être remplacée.');
    if (ms.rerolls >= c.missionRerolls) throw new HttpError(409, 'Plus de remplacement possible aujourd\'hui.');
    const [next] = draw(a, Object.keys(MISSIONS).filter(id => c.missions[id].on && !MISSIONS[id].retired && !ms.list.some(x => x.id === id)), 1, ms.list.filter(x => x !== m));
    if (!next) throw new HttpError(409, 'Aucune autre mission disponible.');
    ms.list[index] = next; ms.rerolls++;
  }

  // ---- Parties ----
  // info : mode « pvp » ou « pve », result « win », « loss » ou « draw », cartes jouées, général, zones remportées toutes les trois.
  // Renvoie ce que la partie a rapporté, pour l'écran de fin de partie.
  // friend : défi contre un ami.
  // ranked : partie classée (contre l'IA ou défi classé).
  function onGame(a, { mode, result, played = [], general, sweep, zones = 0, friend, ranked = false }) {
    if (!a.level) init(a);
    const c = cfg(), s = a.stats, pvp = mode === 'pvp', win = result === 'win';
    const passBefore = pass(a)?.xp || 0;
    if (friend && win) bump(s, 'friendWins');
    const before = { level: a.level, shards: a.shards || 0, xp: a.xp || 0, xpNext: xpToNext(a.level, c) };
    if (s.day !== today()) { s.day = today(); s.dayGames = 0; }
    countGame(s, win, pvp, general);
    if (events.view().live.length) bump(s, 'eventGames');
    const rewarded = s.dayGames < c.gamesPerDay; s.dayGames++;
    // Événements en cours : leur multiplicateur s'applique aux gains de la partie (montrés tels quels à l'écran de fin, avec l'événement).
    const xpMult = events.mult('xp'), shardMult = events.mult('shards'), passMult = events.mult('passXp');
    const xp = rewarded ? boost(win ? (pvp ? c.xpPvpWin : c.xpPveWin) : (pvp ? c.xpPvpLoss : c.xpPveLoss), xpMult) : 0;
    const shards = rewarded ? boost(win ? (pvp ? c.shardsPvpWin : c.shardsPveWin) : c.shardsLoss, shardMult) : 0;
    a.shards = (a.shards || 0) + shards;
    const doneBefore = missions(a).list.filter(m => m.done).length;
    advance(a, m => (MISSIONS[m.id]?.count ? MISSIONS[m.id].count(m, played) : {
      play: 1, win: win ? 1 : 0, win_pvp: win && pvp ? 1 : 0, win_pve: win && !pvp ? 1 : 0, sweep: win && sweep ? 1 : 0, zones,
    }[m.id] || 0));
    addXp(a, xp);
    const P = pass(a);
    if (P && rewarded) gainPassXp(a, boost(win ? c.passXpWin : c.passXpLoss, passMult));
    passAdvance(a, m => ({
      play: 1, win: win ? 1 : 0, pvp: win && pvp ? 1 : 0, ranked: ranked ? 1 : 0, sweep: win && sweep ? 1 : 0,
      spells: played.filter(id => CARDS[id]?.type === 'S').length, creatures: played.filter(id => CARDS[id]?.type === 'C').length,
      fam: played.filter(id => CARDS[id] && familyOf(id) === m.fam).length, season: played.filter(id => P && SEASON_CARDS[id] === P.season).length,
    }[m.kind] || 0));
    return { xp, shards, rewarded, passXp: (pass(a)?.xp || 0) - passBefore, gamesLeft: Math.max(0, c.gamesPerDay - s.dayGames), levelUp: a.level > before.level,
      missions: missions(a).list.filter(m => m.done).length - doneBefore, progress: levelView(a), totalShards: a.shards - before.shards,
      events: Object.fromEntries([['xp', xpMult], ['shards', shardMult], ['passXp', passMult]].filter(([, m]) => rewarded && m !== 1)),
      // Niveau d'avant la partie : la barre de l'écran de fin part de là.
      progressBefore: { level: before.level, xp: before.xp, xpNext: before.xpNext } };
  }
  const onBooster = a => { advance(a, m => (m.id === 'booster' ? 1 : 0)); passAdvance(a, m => (m.kind === 'booster' ? 1 : 0)); };

  // ---- Mode classé ----
  // Compte : ranked = { season, r (étoiles, voir ranked.js), best (meilleur rang de la saison), games, wins, streak }.
  // La saison change au premier passage après la fin du mois : récompenses du meilleur palier atteint et de la place au classement
  // final, puis on redescend d'un palier.
  function syncSeason(a) {
    const season = seasonId(), R = a.ranked;
    if (R && R.season === season) return;
    if (!a.level) init(a);
    if (R && R.games) {
      closeSeason(R.season);
      const best = rankOf(R.best), t = TIERS[best.tier], c = cfg();
      // Titres et cadres des paliers en dessous, débloqués sans bruit ; celui du palier atteint est annoncé avec les Éclats.
      for (const x of seasonCosmetics(best.tier)) {
        if (x.title && !a.cosmetics.titles.includes(x.title)) a.cosmetics.titles.push(x.title);
        if (x.frame && !a.cosmetics.frames.includes(x.frame)) a.cosmetics.frames.push(x.frame);
      }
      grant(a, { kind: 'season', label: `Saison ${seasonName(R.season)} terminée : ${best.label}`, shards: c[seasonShardsKey(best.tier)] || 0, prisms: c[seasonPrismsKey(best.tier)] || 0,
        title: t.title ? `rang:${t.id}` : undefined, frame: t.frame });
      // Place au classement final : ses Éclats et Prismes, son titre (annoncé) et ceux des places en dessous (sans bruit).
      const pos = finalLadder(R.season)?.top.find(x => x.login === a.login)?.pos, i = placeOf(pos);
      if (i >= 0) {
        for (const id of placeTitles(i).slice(1)) if (!a.cosmetics.titles.includes(id)) a.cosmetics.titles.push(id);
        grant(a, { kind: 'season', label: `Saison ${seasonName(R.season)} : ${pos === 1 ? '1re' : `${pos}e`} place du classement final`,
          shards: c[placeShardsKey(i)] || 0, prisms: c[placePrismsKey(i)] || 0, title: `rang:${PLACES[i].id}` });
      }
    }
    const r = R ? seasonReset(R.r) : 0;
    a.ranked = { season, r, best: r, games: 0, wins: 0, streak: 0 };
    store.put(a).catch(e => console.error('Saison non enregistrée :', e));
  }
  // Classement final : figé une fois la saison finie, avant que le premier compte ne passe à la suivante (document « classement »,
  // { [saison]: { closed, top } }). Seule la saison précédente peut être figée : pour une plus ancienne, trop de comptes ont déjà changé.
  // top : les places qui ont une récompense (PLACES), parmi les joueurs qui ont joué au moins rankPlaceGames parties classées.
  const finalLadder = id => (store.doc('classement') || {})[id] || null;
  // seasonHook(id) : le classement des clans (clans.js) est figé au même moment, avant que les rangs ne repartent.
  let seasonHook = () => {};
  function closeSeason(id = addMonths(seasonId(), -1)) {
    if (id !== addMonths(seasonId(), -1) || finalLadder(id)) return;
    seasonHook(id);
    const min = cfg().rankPlaceGames, max = PLACES[PLACES.length - 1].max;
    const top = ladder(id).filter(x => x.games >= min).slice(0, max).map((x, i) => ({ ...x, pos: i + 1 }));
    store.putDoc('classement', { ...(store.doc('classement') || {}), [id]: { closed: new Date().toISOString(), top } })
      .catch(e => console.error('Classement final non enregistré :', e));
    if (top.length) console.log(`Classement final de ${seasonName(id)} figé : ${top.map(x => `${x.pos}. ${x.login}`).join(', ')}.`);
  }
  const ranked = a => { syncSeason(a); return a.ranked; };
  // Partie classée terminée. foeR : rang de l'ami affronté avant la partie (null contre l'IA).
  // Renvoie le rang avant et après, pour l'écran de fin de partie.
  function onRanked(a, { result, foeR = null }) {
    const R = ranked(a), before = rankOf(R.r);
    R.games++;
    if (result === 'win') { R.wins++; R.streak++; bump(a.stats, 'rankedWins'); } else R.streak = 0;
    const mult = events.mult('ranked');
    if (result === 'win' && mult !== 1) bump(a.stats, 'eventRankedWins');
    const { r, bonus } = applyResult(R.r, { result, streak: R.streak, foeR, mult });
    R.r = r; R.best = Math.max(R.best, r);
    a.stats.bestTier = Math.max(a.stats.bestTier || 0, rankOf(R.best).tier);
    const after = rankOf(r);
    checkAchievements(a);
    return { before, after, delta: after.r - before.r, bonus, ...(mult !== 1 && result === 'win' ? { mult } : {}), promoted: after.tier > before.tier || (after.division !== before.division && after.r > before.r) };
  }
  // Ce que voit le joueur de son rang (accueil, écran classé).
  function rankedView(a) {
    const R = ranked(a);
    return { season: R.season, seasonName: seasonName(R.season), daysLeft: seasonDaysLeft(), rank: rankOf(R.r), best: rankOf(R.best),
      games: R.games, wins: R.wins, streak: R.streak, ai: TIERS[rankOf(R.r).tier].name, mult: events.mult('ranked') };
  }
  // Classement d'une saison (la saison en cours par défaut) : les joueurs qui y ont joué au moins une partie classée.
  function ladder(season = seasonId()) {
    return store.all().filter(x => !x.disabled && x.ranked?.season === season && x.ranked.games)
      .sort((x, y) => y.ranked.r - x.ranked.r || y.ranked.wins - x.ranked.wins || x.ranked.games - y.ranked.games)
      .map((x, i) => ({ pos: i + 1, login: x.login, name: x.name, level: x.level || 1, title: x.title ? TITLES[x.title] || null : null, frame: x.frame || null,
        rank: rankOf(x.ranked.r), games: x.ranked.games, wins: x.ranked.wins }));
  }
  // Récompenses de fin de saison de chaque palier, pour l'écran classé.
  const seasonRewards = () => { const c = cfg();
    return TIERS.map((t, i) => ({ id: t.id, name: t.name, ai: t.ai, shards: c[seasonShardsKey(i)] || 0, prisms: c[seasonPrismsKey(i)] || 0, title: t.title || null, frame: t.frame ? FRAMES[t.frame] : null })); };
  // Récompenses des places au classement final, et le podium figé de la saison précédente, pour l'écran classé.
  const placeRewards = () => { const c = cfg();
    return { games: c.rankPlaceGames, list: PLACES.map((p, i) => ({ id: p.id, name: p.name, max: p.max, shards: c[placeShardsKey(i)] || 0, prisms: c[placePrismsKey(i)] || 0, title: p.title })) }; };
  function lastSeason() {
    const id = addMonths(seasonId(), -1), f = finalLadder(id);
    return f ? { season: id, seasonName: seasonName(id), top: f.top.slice(0, 3) } : null;
  }

  // ---- Calendrier de connexion du mois ----
  // Compte : calendar = { month: « AAAA-MM », days: [jours récupérés] }. Remis à zéro chaque mois ; un jour manqué est perdu.
  function calendar(a) {
    const month = seasonId();
    if (a.calendar?.month !== month) a.calendar = { month, days: [] };
    return a.calendar;
  }
  const dayOfMonth = () => Number(today().slice(8));
  function calendarView(a) {
    const cal = calendar(a), day = dayOfMonth();
    return { month: cal.month, name: seasonName(cal.month), today: day, ready: !cal.days.includes(day), got: cal.days.length,
      days: loginCalendar(cal.month, cfg()).map(d => ({ ...d, got: cal.days.includes(d.day), missed: d.day < day && !cal.days.includes(d.day) })) };
  }
  // Récupère la récompense du jour. Renvoie ce qu'elle a donné.
  function claimDay(a) {
    if (!a.level) init(a);
    const cal = calendar(a), day = dayOfMonth();
    if (cal.days.includes(day)) throw new HttpError(409, 'Récompense du jour déjà récupérée. Revenez demain.');
    cal.days.push(day);
    bump(a.stats, 'loginDays');
    if (cal.days.length === monthDays(cal.month)) bump(a.stats, 'perfectMonths');
    const { sunday, ...r } = loginReward(cal.month, day, cfg());
    grant(a, { kind: 'login', label: `Connexion du ${day}${day === 1 ? 'er' : ''} ${seasonName(cal.month)}`, ...r }, { silent: true });
    passAdvance(a, m => (m.kind === 'login' ? 1 : 0));
    checkAchievements(a);
    return { day, ...r };
  }

  // ---- Bienvenue des nouveaux comptes ----
  // Compte : welcome = { start (création du compte), days: [dates « AAAA-MM-JJ » des récompenses prises] }. Seuls les comptes créés
  // depuis cette fonction l'ont (ou ceux à qui /admin l'offre) : les comptes plus anciens n'y ont pas droit.
  // Une récompense par jour de connexion distinct, jusqu'à WELCOME_STEPS, tant que le délai (welcomeWindow jours, jour de création compris) court.
  const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
  function welcomeView(a) {
    const W = a.welcome; if (!W) return null;
    const c = cfg(), day = today(), last = addDays(today(new Date(W.start)), c.welcomeWindow - 1);
    const done = W.days.length >= WELCOME_STEPS, expired = !done && day > last, claimed = W.days.includes(day);
    return { got: W.days.length, steps: WELCOME_STEPS, ready: !done && !expired && !claimed, claimed, done, expired, last, left: Math.max(0, daysBetween(day, last) + 1),
      list: welcomeRewards(c).map(x => ({ ...x, got: x.n <= W.days.length, today: x.n === W.days.length + (claimed ? 0 : 1) && !expired })) };
  }
  // Récupère la récompense de bienvenue suivante. Renvoie ce qu'elle a donné.
  function claimWelcome(a) {
    if (!a.level) init(a);
    const v = welcomeView(a);
    if (!v) throw new HttpError(409, 'Ce compte n\'a pas de récompenses de bienvenue.');
    if (v.done) throw new HttpError(409, 'Toutes les récompenses de bienvenue sont déjà récupérées.');
    if (v.expired) throw new HttpError(409, 'Le délai des récompenses de bienvenue est passé.');
    if (v.claimed) throw new HttpError(409, 'Récompense de bienvenue du jour déjà récupérée. Revenez demain pour la suivante.');
    a.welcome.days.push(today());
    const n = a.welcome.days.length, r = welcomeReward(n, cfg());
    grant(a, { kind: 'welcome', label: `Bienvenue, jour ${n} sur ${WELCOME_STEPS}`, ...r }, { silent: true });
    checkAchievements(a);
    return { n, ...r };
  }
  // Nouveau compte (ou offert depuis /admin) : la bienvenue commence maintenant.
  const startWelcome = a => { a.welcome = { start: new Date().toISOString(), days: [] }; };

  // ---- Passe de saison ----
  // Compte : seasonPass = { season (« AAAA-MM »), xp (XP de saison), premium, free et prem (derniers paliers donnés sur chaque piste),
  // day = { date, list } et week = { week, list } (missions du jour et de la semaine), sm = { id: avancement } et done (missions de saison),
  // bonus (coffres de fin de passe ouverts) }. Tout repart à zéro à chaque saison ; les paliers sont donnés dès qu'ils sont atteints.
  // Renvoie null s'il n'y a pas de saison ce mois-ci.
  function pass(a) {
    const season = currentSeason(today());
    if (!season || !a.level) return null;
    if (a.seasonPass?.season !== season.id) a.seasonPass = { season: season.id, xp: 0, premium: false, free: 0, prem: 0, bonus: 0, day: null, week: null, sm: {}, done: [] };
    const P = a.seasonPass, c = cfg(), day = today(), week = weekOf(day);
    if (P.day?.date !== day) P.day = { date: day, list: drawPass(season, 'daily', c.passDaily, c) };
    if (P.week?.week !== week) P.week = { week, list: drawPass(season, 'weekly', c.passWeekly, c) };
    // Réglages changés depuis /admin (moins d'XP par palier) : les paliers atteints sont donnés tout de suite.
    const t = passTierOf(P.xp, c);
    // Arts Promo d'un palier déjà passé quand ils se gagnaient avec les missions de saison : donnés aussi.
    if (t.tier > P.free || (P.premium && t.tier > P.prem) || t.bonus > (P.bonus || 0) || season.promo.some(p => p.tier <= P.free && ARTS[p.art] && !a.arts?.[p.art])
      || (P.free >= THEME_TIER && !a.cosmetics.themes?.includes(season.theme))) payTiers(a);
    return P;
  }
  // Missions du jour ou de la semaine : n sortes différentes, tirées parmi celles qui ont un objectif à cette échelle.
  function drawPass(season, scale, n, c) {
    const kinds = shuffle(Object.keys(PASS_KINDS).filter(k => c.passPool[k][scale] > 0)).slice(0, n);
    const xp = scale === 'daily' ? c.passXpDaily : c.passXpWeekly;
    return kinds.map(kind => ({ kind, target: c.passPool[kind][scale], xp, n: 0, done: false, ...(kind === 'fam' ? { fam: shuffle(season.fams.slice())[0] } : {}) }));
  }
  // Fait avancer les missions du passe : test(mission) dit de combien.
  function passAdvance(a, test) {
    const P = pass(a); if (!P) return;
    const season = seasonById(P.season), c = cfg();
    let xp = 0;
    for (const m of [...P.day.list, ...P.week.list]) {
      if (m.done) continue;
      m.n = Math.min(m.target, m.n + test(m));
      if (m.n >= m.target) { m.done = true; xp += m.xp; }
    }
    for (const def of season.missions) {
      if (P.done.includes(def.id)) continue;
      const m = { ...def, ...c.passMissions[def.id] };
      P.sm[def.id] = Math.min(m.target, (P.sm[def.id] || 0) + test(m));
      if (P.sm[def.id] < m.target) continue;
      P.done.push(def.id); xp += m.xp;
      push(a, { kind: 'pass', label: `Mission de saison : ${passMissionLabel(m)}`, passXp: m.xp });
    }
    gainPassXp(a, xp);
  }
  function gainPassXp(a, xp) { if (!xp) return; a.seasonPass.xp += xp; payTiers(a); }
  // Donne les récompenses des paliers atteints (et, avec le premium, celles de la piste premium).
  // Une récompense avec une carte, un art Promo ou un cosmétique a sa ligne dans la boîte ; les Éclats, Prismes et coffres sont regroupés.
  function payTiers(a) {
    const P = a.seasonPass, season = seasonById(P.season), c = cfg(), tier = passTierOf(P.xp, c).tier, track = passTrack(season, c);
    const sum = { shards: 0, prisms: 0, chests: 0 };
    const give = (t, r, premium) => {
      if (r.card || r.art || r.title || r.frame || r.back || r.theme) grant(a, { kind: 'pass', label: `${season.name} : palier ${t}${premium ? ' premium' : ''}`, ...r });
      else { grant(a, r, { silent: true }); for (const k in sum) sum[k] += r[k] || 0; }
    };
    const from = Math.min(P.free, P.premium ? P.prem : P.free), onlyPremium = P.free >= tier;
    for (; P.free < tier; P.free++) give(P.free + 1, track[P.free].free, false);
    if (P.premium) for (; P.prem < tier; P.prem++) give(P.prem + 1, track[P.prem].premium, true);
    for (const p of season.promo) if (p.tier <= P.free && ARTS[p.art] && !a.arts?.[p.art]) give(p.tier, { art: p.art }, false);
    // Thème de l'interface, pour qui avait passé son palier avant qu'il ne s'y gagne (octobre 2026).
    if (P.free >= THEME_TIER && !a.cosmetics.themes?.includes(season.theme)) give(THEME_TIER, { theme: season.theme }, false);
    if (sum.shards || sum.prisms || sum.chests) push(a, { kind: 'pass', label: `${season.name}${onlyPremium ? ', premium' : ''} : ${tier - from > 1 ? `paliers ${from + 1} à ${tier}` : `palier ${tier}`}`, ...sum });
    for (const bonus = passTierOf(P.xp, c).bonus; (P.bonus || 0) < bonus; P.bonus = (P.bonus || 0) + 1) openBonus(a, season, c);
    checkAchievements(a);
  }
  // Coffre de fin de passe : un prix au hasard (BONUS_ODDS), au montant fixe réglé dans /admin.
  // L'essence va à une carte possédée qui n'est pas au plafond d'essence ; si toutes le sont, elle devient de l'essence universelle.
  function openBonus(a, season, c) {
    let roll = Math.random() * 100, kind = 'shards';
    for (const [k, p] of Object.entries(BONUS_ODDS)) { if (roll < p) { kind = k; break; } roll -= p; }
    const label = `${season.name} : coffre de fin de passe`;
    if (kind === 'essence') {
      const mine = OWNABLE.filter(id => a.cards?.[id]), open = mine.filter(id => essenceRoom(a, id) > 0);
      const card = shuffle(open)[0], n = c.passBonusEssence;
      if (card) {
        const got = giveEssence(a, card, n);
        return push(a, { kind: 'pass', label, essence: got.essence, essenceCard: card, uniEssence: got.universal });
      }
      if (mine.length) { a.uniEssence = (a.uniEssence || 0) + n; return push(a, { kind: 'pass', label, uniEssence: n }); }
      kind = 'shards';
    }
    grant(a, { kind: 'pass', label, [kind]: kind === 'shards' ? c.passBonusShards : c.passBonusPrisms });
  }
  // Achat du premium : pay(a, prix) prend les Prismes (accounts.js). Les paliers déjà atteints donnent aussitôt leur récompense premium.
  function buyPass(a, pay) {
    const P = pass(a);
    if (!P) throw new HttpError(409, 'Pas de passe de saison en ce moment.');
    if (P.premium) throw new HttpError(409, 'Vous avez déjà le passe premium de cette saison.');
    pay(a, cfg().passPrice);
    P.premium = true; P.paid = cfg().passPrice;
    payTiers(a);
  }
  // Ce que l'accueil montre du passe.
  function passSummary(a) {
    const P = pass(a); if (!P) return null;
    const season = seasonById(P.season), c = cfg(), t = passTierOf(P.xp, c);
    const todo = [...P.day.list, ...P.week.list].filter(m => !m.done).length + season.missions.filter(m => !P.done.includes(m.id)).length;
    return { id: season.id, name: season.name, theme: season.theme, tier: t.tier, tiers: PASS_TIERS, xp: t.xp, next: t.next, bonus: t.bonus, premium: P.premium, todo, daysLeft: seasonDaysLeft() };
  }
  // Écran du passe : paliers, missions, arts Promo, prix du premium.
  function passView(a) {
    const P = pass(a); if (!P) return { pass: null };
    const season = seasonById(P.season), c = cfg();
    const mission = m => ({ label: passMissionLabel(m), n: m.n, target: m.target, xp: m.xp, done: m.done });
    const week = new Date(`${P.week.week}T12:00:00Z`); week.setUTCDate(week.getUTCDate() + 7);
    return { pass: { ...passSummary(a), blurb: season.blurb, cards: season.cards, price: c.passPrice, refund: refundTier(season, c), total: P.xp,
      track: passTrack(season, c), got: { free: P.free, premium: P.prem },
      cosmetics: { title: [`saison:${season.id}`, season.title], titlePremium: [`saison:${season.id}:p`, season.titlePremium], frame: season.frame, framePremium: season.framePremium, back: season.back, backPremium: season.backPremium },
      daily: P.day.list.map(mission), weekly: P.week.list.map(mission), weekEnds: week.toISOString().slice(0, 10),
      seasonal: season.missions.map(def => { const m = { ...def, ...c.passMissions[def.id] }; return { ...mission({ ...m, n: P.sm[def.id] || 0, done: P.done.includes(def.id) }) }; }),
      promo: season.promo.map(p => ({ art: p.art, tier: p.tier, got: p.tier <= P.free })), cardMonths: c.passCardMonths,
      bonusChest: { every: c.passBonusXp, shards: c.passBonusShards, prisms: c.passBonusPrisms, essence: c.passBonusEssence, odds: BONUS_ODDS }, xpWin: c.passXpWin, xpLoss: c.passXpLoss } };
  }
  // Cartes de saison déjà arrivées dans le Set de base.
  const seasonCards = () => releasedCards(seasonId(), cfg().passCardMonths);

  // ---- Cosmétiques ----
  // theme : thème de l'interface ; null suit la saison en cours, « base » garde le thème de base, sinon un thème débloqué.
  // favArts : jusqu'à MAX_FAV_ARTS arts possédés, montrés sur le profil public (dans l'ordre choisi).
  // emotes : les émotes du sélecteur en partie, EMOTE_SLOTS au plus parmi celles possédées (dans l'ordre choisi).
  async function equip(a, { title, frame, back, theme, favArts, emotes }) {
    if (theme !== undefined) { if (theme !== null && theme !== 'base' && !a.cosmetics.themes?.includes(theme)) throw new HttpError(400, 'Thème non débloqué.'); a.uiTheme = theme; }
    if (title !== undefined) { if (title !== null && !a.cosmetics.titles.includes(title)) throw new HttpError(400, 'Titre non débloqué.'); a.title = title; }
    if (frame !== undefined) { if (frame !== null && !a.cosmetics.frames.includes(frame)) throw new HttpError(400, 'Cadre non débloqué.'); a.frame = frame; }
    if (back !== undefined) { if (!a.cosmetics.backs.includes(back)) throw new HttpError(400, 'Dos de carte non débloqué.'); a.back = back; }
    if (favArts !== undefined) {
      if (!Array.isArray(favArts) || favArts.length > MAX_FAV_ARTS || new Set(favArts).size !== favArts.length
        || favArts.some(id => typeof id !== 'string' || !a.arts?.[id] || !artExists(id))) throw new HttpError(400, `Arts préférés : ${MAX_FAV_ARTS} de vos arts au plus.`);
      a.favArts = favArts;
    }
    if (emotes !== undefined) {
      if (!Array.isArray(emotes) || !emotes.length || emotes.length > EMOTE_SLOTS || new Set(emotes).size !== emotes.length
        || emotes.some(id => typeof id !== 'string' || !ownsEmote(a.cosmetics.emotes, id))) throw new HttpError(400, `Émotes : de 1 à ${EMOTE_SLOTS} de vos émotes.`);
      a.emoteSet = emotes;
    }
  }
  // Émotes : achat en boutique (Éclats ou Prismes), droit d'en envoyer une en partie.
  function buyEmote(a, { emote } = {}) {
    const e = EMOTES[emote];
    if (!e || !(e.price || e.prisms)) throw new HttpError(400, 'Cette émote n\'est pas en vente.');
    if (!a.cosmetics) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    if (ownsEmote(a.cosmetics.emotes, emote)) throw new HttpError(409, 'Vous avez déjà cette émote.');
    const [k, cost, name] = e.prisms ? ['prisms', e.prisms, 'Prismes'] : ['shards', e.price, 'Éclats'];
    if ((a[k] || 0) < cost) throw new HttpError(409, `Il vous faut ${cost} ${name} (vous en avez ${a[k] || 0}).`);
    a[k] = (a[k] || 0) - cost;
    (a.cosmetics.emotes ||= []).push(emote);
    // Le sélecteur n'est pas plein : la nouvelle émote y prend place.
    const set = emoteSet(a.cosmetics.emotes, a.emoteSet);
    if (set.length < EMOTE_SLOTS) a.emoteSet = [...set, emote];
    return emote;
  }
  const canEmote = (a, id) => !!a?.cosmetics && ownsEmote(a.cosmetics.emotes, id);
  // Arts préférés encore possédés (un art retiré du jeu disparaît de la liste).
  const favArts = a => (a.favArts || []).filter(id => a.arts?.[id] && artExists(id)).slice(0, MAX_FAV_ARTS);

  // ---- Niveaux de carte (cosmétiques) ----
  // Essence gagnée par doublon, propre à la carte. Le serveur la donne avec les Éclats du doublon (accounts.js).
  const essenceRate = () => cfg().essencePerDuplicate;
  // Monte une carte possédée d'un niveau, contre son essence et des Éclats.
  async function upgradeCard(a, { card }) {
    if (!OWNABLE.includes(card) || !a.cards?.[card]) throw new HttpError(400, 'Vous ne possédez pas cette carte.');
    const lvl = a.cardLevels?.[card] || 1;
    if (lvl >= MAX_CARD_LEVEL) throw new HttpError(409, 'Cette carte est déjà au niveau maximum.');
    const cost = levelCost(lvl + 1, cfg()), have = a.essence?.[card] || 0;
    if (have < cost.essence) throw new HttpError(409, `Il vous faut ${cost.essence} essence de cette carte (vous en avez ${have}).`);
    if ((a.shards || 0) < cost.shards) throw new HttpError(409, `Il vous faut ${cost.shards} Éclats (vous en avez ${a.shards || 0}).`);
    a.essence[card] = have - cost.essence; a.shards = (a.shards || 0) - cost.shards;
    a.cardLevels = { ...(a.cardLevels || {}), [card]: lvl + 1 };
    return lvl + 1;
  }
  // Bordure montrée sur une carte : celle d'un niveau qu'elle a atteint (compte : lvLook). Sans choix, ou en choisissant
  // son niveau actuel, la carte suit son niveau (et prend la bordure suivante quand elle monte). Le niveau reste celui de la carte,
  // quel que soit l'art choisi : seule la bordure change, pas le reflet ni le débordement.
  function chooseBorder(a, { card, level }) {
    if (!OWNABLE.includes(card) || !a.cards?.[card]) throw new HttpError(400, 'Vous ne possédez pas cette carte.');
    const lvl = a.cardLevels?.[card] || 1, n = Number(level);
    if (!Number.isInteger(n) || n < 1 || n > lvl) throw new HttpError(409, 'Cette carte n\'a pas encore cette bordure.');
    const looks = { ...(a.lvLook || {}) };
    if (n === lvl) delete looks[card]; else looks[card] = n;
    a.lvLook = looks;
  }
  // Niveau de la bordure montrée (lvLook, borné au niveau atteint).
  const borderOf = (a, id) => { const lvl = a.cardLevels?.[id] || 1, b = a.lvLook?.[id]; return b >= 1 && b < lvl ? b : lvl; };
  // Essence universelle : une carte est au plafond quand son essence en réserve suffit à la monter jusqu'au niveau maximum
  // (montée ou non). L'essence qu'elle reçoit au-delà ne lui sert plus et devient de l'essence universelle.
  const essenceRoom = (a, id) => essenceToMax(a.cardLevels?.[id] || 1, a.essence?.[id] || 0, cfg());
  // Donne n essence d'une carte : ce qui tient sous le plafond va à la carte, le reste en essence universelle
  // (uniPerDuplicate pour essencePerDuplicate d'essence, soit une pour une par défaut). Renvoie { essence, universal }.
  function giveEssence(a, id, n) {
    const c = cfg(), toCard = Math.min(n, essenceRoom(a, id));
    if (toCard) a.essence = { ...(a.essence || {}), [id]: (a.essence?.[id] || 0) + toCard };
    const universal = n > toCard && c.essencePerDuplicate ? Math.round((n - toCard) * c.uniPerDuplicate / c.essencePerDuplicate) : 0;
    if (universal) { a.uniEssence = (a.uniEssence || 0) + universal; if (a.stats) bump(a.stats, 'uniGained', universal); }
    return { essence: toCard, universal };
  }
  // Au démarrage (anciens comptes) : l'essence en réserve au-delà du plafond devient de l'essence universelle, une pour une.
  // Renvoie l'essence convertie.
  function settleCapped(a) {
    let n = 0;
    for (const [id, e] of Object.entries(a.essence || {})) {
      const over = e - essenceToMax(a.cardLevels?.[id] || 1, 0, cfg());
      if (over > 0) { n += over; a.essence[id] = e - over; if (!a.essence[id]) delete a.essence[id]; }
    }
    if (n) { a.uniEssence = (a.uniEssence || 0) + n; if (a.stats) bump(a.stats, 'uniGained', n); }
    return n;
  }
  // Essence universelle échangée contre `amount` essence d'une carte possédée qui peut encore monter, au taux uniPerEssence,
  // sans dépasser ce qui manque à la carte pour atteindre le niveau maximum.
  function convertEssence(a, { card, amount }) {
    if (!OWNABLE.includes(card) || !a.cards?.[card]) throw new HttpError(400, 'Vous ne possédez pas cette carte.');
    const lvl = a.cardLevels?.[card] || 1, c = cfg();
    if (lvl >= MAX_CARD_LEVEL) throw new HttpError(409, 'Cette carte est déjà au niveau maximum.');
    const n = Number(amount), room = essenceToMax(lvl, a.essence?.[card] || 0, c);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Quantité d\'essence invalide.');
    if (n > room) throw new HttpError(409, `Cette carte n'a plus besoin que de ${room} essence pour atteindre le niveau maximum.`);
    const price = n * c.uniPerEssence, have = a.uniEssence || 0;
    if (have < price) throw new HttpError(409, `Il vous faut ${price} essence universelle (vous en avez ${have}).`);
    a.uniEssence = have - price;
    a.essence = { ...(a.essence || {}), [card]: (a.essence?.[card] || 0) + n };
    if (a.level) { bump(a.stats, 'essenceConverts'); checkAchievements(a); }
    return { card, essence: n, price };
  }
  const levelsView = () => { const c = cfg();
    return { essenceRate: c.essencePerDuplicate, uniRate: c.uniPerDuplicate, uniPerEssence: c.uniPerEssence, max: MAX_CARD_LEVEL,
      costs: Object.fromEntries(Array.from({ length: MAX_CARD_LEVEL - 1 }, (_, i) => [i + 2, levelCost(i + 2, c)])) }; };

  // ---- Vues ----
  const levelView = a => ({ level: a.level || 1, xp: a.xp || 0, xpNext: xpToNext(a.level || 1, cfg()) });
  // Ce qu'un adversaire voit du joueur pendant une partie. looks : niveau des cartes du deck joué et de son général (niveau 2 et plus) ;
  // le serveur n'envoie à l'adversaire que ceux des cartes déjà révélées (index.js).
  // arts : art alternatif choisi pour ces mêmes cartes, filtré de la même façon.
  // borders : bordure choisie quand elle n'est pas celle du niveau (chooseBorder), filtrée de la même façon.
  const badge = (a, deck = null) => ({ title: a.title ? TITLES[a.title] || null : null, frame: a.frame || null, back: a.back || 'classique', level: a.level || 1,
    looks: deck ? Object.fromEntries([...deck.cards, deck.general].filter(id => id && (a.cardLevels?.[id] || 1) > 1).map(id => [id, a.cardLevels[id]])) : {},
    arts: deck ? shownArts(a, [...deck.cards, deck.general]) : {},
    borders: deck ? Object.fromEntries([...deck.cards, deck.general].filter(id => id && borderOf(a, id) !== (a.cardLevels?.[id] || 1)).map(id => [id, borderOf(a, id)])) : {} });
  function view(a) {
    if (!a.level) return { ...levelView(a), freeBoosters: 0, missions: [], rerollsLeft: 0, inbox: [], badge: badge(a), cosmetics: { titles: [], frames: [], backs: [], themes: [], emotes: [] }, emotes: [], cardLevels: levelsView(), pass: null };
    const ms = missions(a), c = cfg();
    return { ...levelView(a), freeBoosters: a.freeBoosters || 0,
      missions: ms.list.map(m => ({ label: missionLabel(m), n: m.n, target: m.target, done: m.done, xp: m.xp, shards: m.shards })),
      rerollsLeft: Math.max(0, c.missionRerolls - ms.rerolls), inbox: a.inbox || [], badge: badge(a), cardLevels: levelsView(), ranked: rankedView(a),
      freeChests: a.freeChests || 0, calendar: calendarView(a), welcome: welcomeView(a), pass: passSummary(a), events: events.view(),
      title: a.title, frame: a.frame, back: a.back, theme: a.uiTheme ?? null, favArts: favArts(a), emotes: emoteSet(a.cosmetics.emotes, a.emoteSet),
      cosmetics: { titles: a.cosmetics.titles.map(id => ({ id, label: TITLES[id] || id })), frames: a.cosmetics.frames.map(id => ({ id, label: FRAMES[id] || id })),
        backs: a.cosmetics.backs.map(id => ({ id, label: BACKS[id] || id })), themes: (a.cosmetics.themes || []).map(id => ({ id, label: SEASON_THEMES[id] || id })),
        emotes: ownedEmotes(a.cosmetics.emotes) } };
  }
  // Succès et complétions avec leur avancement, pour la page de profil.
  function achievementsView(a) {
    const s = statsOf(a), c = cfg();
    return ACHIEVEMENTS.filter(x => !x.set || setRevealed(setById(x.set))).map(x => ({ id: x.id, group: x.group, label: x.label, goal: x.goal, value: Math.min(x.goal, statValue(s, x.stat)), done: !!a.achievements?.[x.id],
      shards: c.achievements[x.id], prisms: c.achievementPrisms[x.id], chests: c.achievementChests[x.id], title: x.title || null, frame: x.frame ? FRAMES[x.frame] : null, frameId: x.frame || null, emote: x.emote || null }));
  }
  function collectionView(a) {
    return SETS.filter(s => s.cards.length && setRevealed(s)).map(set => ({ id: set.id, name: set.name, done: !!a.completed?.[set.id], reward: SET_REWARDS[set.id] || null,
      families: [...new Set(set.cards.map(familyOf).filter(Boolean))].map(fam => {
        const ids = set.cards.filter(id => familyOf(id) === fam), r = familyReward(set.id, fam);
        return { fam, owned: ids.filter(id => a.cards[id]).length, total: ids.length, done: !!a.completed?.[`${set.id}:${fam}`], card: r?.card || null, title: r?.title || null };
      }) }));
  }

  // ---- Réglages depuis /admin ----
  async function saveSettings(body) {
    const doc = { ...(store.doc('recompenses') || {}) };
    const int = (v, [min, max], label) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} : un entier entre ${min} et ${max}.`); return n; };
    for (const [k, lim] of Object.entries(REWARD_LIMITS)) if (body[k] !== undefined) doc[k] = int(body[k], lim, `Réglage ${k}`);
    if (body.missions) {
      doc.missions = { ...(doc.missions || {}) };
      for (const [id, m] of Object.entries(body.missions)) {
        if (!MISSIONS[id]) continue;
        doc.missions[id] = { target: int(m.target, [1, 100], `Mission ${id}, objectif`), xp: int(m.xp, [0, 10000], `Mission ${id}, XP`), shards: int(m.shards, [0, 10000], `Mission ${id}, Éclats`), on: !!m.on };
      }
    }
    if (body.achievements) {
      doc.achievements = { ...(doc.achievements || {}) };
      for (const [id, n] of Object.entries(body.achievements)) if (ACHIEVEMENTS.some(x => x.id === id)) doc.achievements[id] = int(n, [0, 100000], `Succès ${id}`);
    }
    if (body.achievementPrisms) {
      doc.achievementPrisms = { ...(doc.achievementPrisms || {}) };
      for (const [id, n] of Object.entries(body.achievementPrisms)) if (ACHIEVEMENTS.some(x => x.id === id)) doc.achievementPrisms[id] = int(n, [0, 10000], `Succès ${id}, Prismes`);
    }
    if (body.achievementChests) {
      doc.achievementChests = { ...(doc.achievementChests || {}) };
      for (const [id, n] of Object.entries(body.achievementChests)) if (ACHIEVEMENTS.some(x => x.id === id)) doc.achievementChests[id] = int(n, [0, 10], `Succès ${id}, coffres`);
    }
    if (body.passPool) {
      doc.passPool = { ...(doc.passPool || {}) };
      for (const [k, m] of Object.entries(body.passPool)) if (PASS_KINDS[k]) doc.passPool[k] = { daily: int(m.daily, [0, 1000], `Passe, ${k} du jour`), weekly: int(m.weekly, [0, 1000], `Passe, ${k} de la semaine`) };
    }
    if (body.passMissions) {
      doc.passMissions = { ...(doc.passMissions || {}) };
      for (const [id, m] of Object.entries(body.passMissions)) if (SEASON_MISSIONS[id]) doc.passMissions[id] = { target: int(m.target, [1, 10000], `Mission de saison ${id}, objectif`), xp: int(m.xp, [0, 100000], `Mission de saison ${id}, XP`) };
    }
    if (body.reset) for (const k of Object.keys(doc)) delete doc[k];
    await store.putDoc('recompenses', doc);
    return settings();
  }
  const settings = () => ({ rewards: cfg(), defaults: { ...DEFAULT_REWARDS, missions: Object.fromEntries(Object.entries(MISSIONS).map(([id, m]) => [id, { target: m.target, xp: m.xp, shards: m.shards, on: true }])),
    achievements: Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, x.shards])), achievementPrisms: Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, x.prisms])),
    achievementChests: Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, x.chests])),
    passPool: Object.fromEntries(Object.entries(PASS_KINDS).map(([k, x]) => [k, { daily: x.daily, weekly: x.weekly }])),
    passMissions: Object.fromEntries(Object.values(SEASON_MISSIONS).map(m => [m.id, { target: m.target, xp: m.xp }])) } });

  return { init, grant, cfg, events, count, best, onCards, passView, buyPass, seasonCards, check: a => { if (a.level) checkAchievements(a); }, favArts, claimDay, calendarView, claimWelcome, welcomeView, startWelcome, checkCollection, onGame, onBooster, reroll, equip, view, badge, ranked, onRanked, rankedView, ladder, seasonRewards, placeRewards, lastSeason, closeSeason, essenceRate, essenceRoom, giveEssence, upgradeCard, chooseBorder, borderOf, settleCapped, convertEssence, achievementsView, collectionView, saveSettings, settings, buyEmote, canEmote,
    seen: a => { a.inbox = []; }, setSeasonHook: f => { seasonHook = f; } };
}
