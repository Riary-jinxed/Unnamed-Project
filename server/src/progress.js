// Progression du compte : XP et niveau, missions quotidiennes, succès, complétion de famille et de set, titres, cadres et dos de carte.
// Les nombres viennent du document « recompenses » (réglé depuis /admin), complété par les valeurs par défaut de rewards.js.
// Chaque récompense gagnée est aussi rangée dans la boîte « inbox » du compte, que l'appli affiche puis vide.
import { DEFAULT_REWARDS, REWARD_LIMITS, MISSIONS, ACHIEVEMENTS, FAMILY_REWARDS, SET_REWARDS, TITLES, FRAMES, BACKS,
  xpToNext, familyOf, statValue, missionLabel, famKey } from '@jeu/engine/rewards';
import { SETS, STARTERS, allowedGenerals, today } from '@jeu/engine/collection';
import { CARDS, GENERALS, DECKS, shuffle } from '@jeu/engine';
import { HttpError } from './accounts.js';

const INBOX_MAX = 40;
const newStats = () => ({ games: 0, wins: 0, pvpWins: 0, pveWins: 0, streak: 0, bestStreak: 0, missions: 0, famWins: {}, day: null, dayGames: 0 });

export function createProgress(store) {
  // Réglages : valeurs par défaut, puis celles enregistrées depuis /admin.
  function cfg() {
    const doc = store.doc('recompenses') || {};
    const missions = Object.fromEntries(Object.entries(MISSIONS).map(([id, m]) => [id, { target: m.target, xp: m.xp, shards: m.shards, on: true, ...(doc.missions || {})[id] }]));
    const achievements = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, (doc.achievements || {})[x.id] ?? x.shards]));
    return { ...DEFAULT_REWARDS, ...doc, missions, achievements };
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
  // Donne une récompense (Éclats, XP, boosters offerts, carte, titre, cadre, dos) et la range dans la boîte du compte.
  function grant(a, r) {
    if (r.shards) a.shards = (a.shards || 0) + r.shards;
    if (r.boosters) a.freeBoosters = (a.freeBoosters || 0) + r.boosters;
    if (r.card && !a.cards[r.card]) a.cards[r.card] = 1;
    if (r.title && !a.cosmetics.titles.includes(r.title)) a.cosmetics.titles.push(r.title);
    if (r.frame && !a.cosmetics.frames.includes(r.frame)) a.cosmetics.frames.push(r.frame);
    if (r.back && !a.cosmetics.backs.includes(r.back)) a.cosmetics.backs.push(r.back);
    push(a, r);
    if (r.xp) addXp(a, r.xp);
  }

  // ---- Succès ----
  function statsOf(a) {
    const owned = Object.keys(a.cards || {}).filter(id => a.cards[id]).length;
    const families = Object.keys(a.completed || {}).filter(k => k.includes(':') && FAMILY_REWARDS[k.split(':')[1]]?.set === k.split(':')[0]).length;
    return { ...a.stats, level: a.level, cards: owned, families };
  }
  function checkAchievements(a) {
    const s = statsOf(a), c = cfg();
    for (const x of ACHIEVEMENTS) {
      if (a.achievements[x.id] || statValue(s, x.stat) < x.goal) continue;
      a.achievements[x.id] = new Date().toISOString();
      grant(a, { kind: 'achievement', label: `Succès : ${x.label}`, shards: c.achievements[x.id], title: x.title ? x.id : undefined, frame: x.frame });
    }
  }

  // ---- Collection : nouvelles cartes, familles et sets complétés ----
  function onCards(a, fresh) {
    const n = fresh.filter(Boolean).length;
    if (n) addXp(a, n * cfg().xpNewCard);
    checkCollection(a);
    return n * cfg().xpNewCard;
  }
  function checkCollection(a) {
    if (!a.level) return;
    const c = cfg();
    for (const set of SETS) {
      if (!set.cards.length) continue;
      for (const fam of new Set(set.cards.map(familyOf).filter(Boolean))) {
        const key = `${set.id}:${fam}`;
        if (a.completed[key] || !set.cards.filter(id => familyOf(id) === fam).every(id => a.cards[id])) continue;
        a.completed[key] = new Date().toISOString();
        const home = FAMILY_REWARDS[fam]?.set === set.id ? FAMILY_REWARDS[fam] : null;
        grant(a, home ? { kind: 'family', label: `Famille ${fam} complétée (${set.name})`, shards: c.familyShards, card: home.card, title: `fam:${fam}`, back: famKey(fam) }
          : { kind: 'family', label: `Cartes ${fam} du set ${set.name} complétées`, shards: c.supportShards });
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
    const ids = shuffle(Object.keys(MISSIONS).filter(id => c.missions[id].on)).slice(0, c.missionsPerDay);
    a.missions = { date: day, rerolls: 0, list: ids.map(id => newMission(a, id)) };
    return a.missions;
  }
  // Mission « famille » : une famille dont le joueur possède un général.
  function newMission(a, id) {
    const m = cfg().missions[id], mission = { id, target: m.target, xp: m.xp, shards: m.shards, n: 0, done: false };
    if (id === 'fam') {
      const fams = [...new Set(allowedGenerals(a).map(k => GENERALS[k].fam).filter(Boolean))];
      mission.fam = shuffle(fams.length ? fams : [DECKS[a.starter || STARTERS[0]].fam])[0];
    }
    return mission;
  }
  function advance(a, test) {
    for (const m of missions(a).list) {
      if (m.done) continue;
      m.n = Math.min(m.target, m.n + test(m));
      if (m.n < m.target) continue;
      m.done = true; a.stats.missions++;
      grant(a, { kind: 'mission', label: `Mission : ${missionLabel(m)}`, xp: m.xp, shards: m.shards });
    }
  }
  async function reroll(a, { index }) {
    const ms = missions(a), c = cfg(), m = ms.list[index];
    if (!m || m.done) throw new HttpError(400, 'Cette mission ne peut pas être remplacée.');
    if (ms.rerolls >= c.missionRerolls) throw new HttpError(409, 'Plus de remplacement possible aujourd\'hui.');
    const pool = Object.keys(MISSIONS).filter(id => c.missions[id].on && !ms.list.some(x => x.id === id));
    if (!pool.length) throw new HttpError(409, 'Aucune autre mission disponible.');
    ms.list[index] = newMission(a, shuffle(pool)[0]); ms.rerolls++;
  }

  // ---- Parties ----
  // info : mode « pvp » ou « pve », result « win », « loss » ou « draw », cartes jouées, général, zones remportées toutes les trois.
  // Renvoie ce que la partie a rapporté, pour l'écran de fin de partie.
  function onGame(a, { mode, result, played = [], general, sweep }) {
    if (!a.level) init(a);
    const c = cfg(), s = a.stats, pvp = mode === 'pvp', win = result === 'win';
    const before = { level: a.level, shards: a.shards || 0 };
    if (s.day !== today()) { s.day = today(); s.dayGames = 0; }
    countGame(s, win, pvp, general);
    const rewarded = s.dayGames < c.gamesPerDay; s.dayGames++;
    const xp = rewarded ? (win ? (pvp ? c.xpPvpWin : c.xpPveWin) : (pvp ? c.xpPvpLoss : c.xpPveLoss)) : 0;
    const shards = rewarded ? (win ? (pvp ? c.shardsPvpWin : c.shardsPveWin) : c.shardsLoss) : 0;
    a.shards = (a.shards || 0) + shards;
    const doneBefore = missions(a).list.filter(m => m.done).length;
    advance(a, m => ({
      play: 1, win: win ? 1 : 0, win_pvp: win && pvp ? 1 : 0, win_pve: win && !pvp ? 1 : 0, sweep: win && sweep ? 1 : 0,
      fam: played.filter(id => CARDS[id] && familyOf(id) === m.fam).length, spells: played.filter(id => CARDS[id]?.type === 'S').length,
    }[m.id] || 0));
    addXp(a, xp);
    return { xp, shards, rewarded, gamesLeft: Math.max(0, c.gamesPerDay - s.dayGames), levelUp: a.level > before.level,
      missions: missions(a).list.filter(m => m.done).length - doneBefore, progress: levelView(a), totalShards: a.shards - before.shards };
  }
  const onBooster = a => advance(a, m => (m.id === 'booster' ? 1 : 0));

  // ---- Cosmétiques ----
  async function equip(a, { title, frame, back }) {
    if (title !== undefined) { if (title !== null && !a.cosmetics.titles.includes(title)) throw new HttpError(400, 'Titre non débloqué.'); a.title = title; }
    if (frame !== undefined) { if (frame !== null && !a.cosmetics.frames.includes(frame)) throw new HttpError(400, 'Cadre non débloqué.'); a.frame = frame; }
    if (back !== undefined) { if (!a.cosmetics.backs.includes(back)) throw new HttpError(400, 'Dos de carte non débloqué.'); a.back = back; }
  }

  // ---- Vues ----
  const levelView = a => ({ level: a.level || 1, xp: a.xp || 0, xpNext: xpToNext(a.level || 1, cfg()) });
  // Ce qu'un adversaire voit du joueur pendant une partie.
  const badge = a => ({ title: a.title ? TITLES[a.title] || null : null, frame: a.frame || null, back: a.back || 'classique', level: a.level || 1 });
  function view(a) {
    if (!a.level) return { ...levelView(a), freeBoosters: 0, missions: [], rerollsLeft: 0, inbox: [], badge: badge(a), cosmetics: { titles: [], frames: [], backs: [] } };
    const ms = missions(a), c = cfg();
    return { ...levelView(a), freeBoosters: a.freeBoosters || 0,
      missions: ms.list.map(m => ({ label: missionLabel(m), n: m.n, target: m.target, done: m.done, xp: m.xp, shards: m.shards })),
      rerollsLeft: Math.max(0, c.missionRerolls - ms.rerolls), inbox: a.inbox || [], badge: badge(a),
      title: a.title, frame: a.frame, back: a.back,
      cosmetics: { titles: a.cosmetics.titles.map(id => ({ id, label: TITLES[id] || id })), frames: a.cosmetics.frames.map(id => ({ id, label: FRAMES[id] || id })),
        backs: a.cosmetics.backs.map(id => ({ id, label: BACKS[id] || id })) } };
  }
  // Succès et complétions avec leur avancement, pour la page de profil.
  function achievementsView(a) {
    const s = statsOf(a), c = cfg();
    return ACHIEVEMENTS.map(x => ({ id: x.id, group: x.group, label: x.label, goal: x.goal, value: Math.min(x.goal, statValue(s, x.stat)), done: !!a.achievements?.[x.id],
      shards: c.achievements[x.id], title: x.title || null, frame: x.frame ? FRAMES[x.frame] : null }));
  }
  function collectionView(a) {
    return SETS.filter(s => s.cards.length).map(set => ({ id: set.id, name: set.name, done: !!a.completed?.[set.id], reward: SET_REWARDS[set.id] || null,
      families: [...new Set(set.cards.map(familyOf).filter(Boolean))].map(fam => {
        const ids = set.cards.filter(id => familyOf(id) === fam), home = FAMILY_REWARDS[fam]?.set === set.id;
        return { fam, owned: ids.filter(id => a.cards[id]).length, total: ids.length, done: !!a.completed?.[`${set.id}:${fam}`], card: home ? FAMILY_REWARDS[fam].card : null, title: home ? FAMILY_REWARDS[fam].title : null };
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
    if (body.reset) for (const k of Object.keys(doc)) delete doc[k];
    await store.putDoc('recompenses', doc);
    return settings();
  }
  const settings = () => ({ rewards: cfg(), defaults: { ...DEFAULT_REWARDS, missions: Object.fromEntries(Object.entries(MISSIONS).map(([id, m]) => [id, { target: m.target, xp: m.xp, shards: m.shards, on: true }])),
    achievements: Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, x.shards])) } });

  return { init, onCards, checkCollection, onGame, onBooster, reroll, equip, view, badge, achievementsView, collectionView, saveSettings, settings,
    seen: a => { a.inbox = []; } };
}
