// Historique des parties et statistiques pour /admin.
// JcJ : enregistré par le serveur en fin de partie. JcE : la partie tourne dans l'appli, qui envoie son résultat.
import { CARDS, GENERALS, DECKS, TERRAINS, gameDetail } from '@jeu/engine';
import { ARTS } from '@jeu/engine/arts';
import { HttpError, activeDeck } from './accounts.js';

const MAX_CARDS = 40;
// Historique des joueurs : parties renvoyées (les plus récentes), tours au plus d'une partie.
const HISTORY_GAMES = 100, MAX_TURNS = 12;
const gameId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Cartes les plus jouées montrées sur un profil ; places du classement qui montrent l'image de profil.
const TOP_CARDS = 5, LADDER_AVATARS = 10;
// Une main de joueur telle qu'enregistrée : qui, avec quel deck, et les cartes jouées (révélées) pendant la partie.
const sideOf = (P, login, deckCards) => ({ login: login || null, name: P.name, general: P.general, deck: P.deckName, cards: deckCards.slice(), played: P.played.slice() });
// Détail d'une partie (gameDetail du moteur) : tours, puissance des zones à chaque fin de tour, et pour chaque joueur puissance finale,
// terrains, découpage de ses cartes révélées par tour et compteurs. Celui d'une partie contre l'IA vient de l'appli : relu et borné.
const num = (v, lo = -999, hi = 999) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : 0);
const nums = (v, n, lo, hi) => (Array.isArray(v) ? v.slice(0, n).map(x => num(x, lo, hi)) : []);
function cleanDetail(d) {
  if (!d || typeof d !== 'object') return null;
  const turns = num(d.turns, 0, MAX_TURNS);
  return {
    turns, trace: (Array.isArray(d.trace) ? d.trace.slice(0, MAX_TURNS) : []).map(t => [0, 1].map(p => nums(t?.[p], 3))),
    sides: [0, 1].map(p => { const S = d.sides?.[p] || {}; return {
      pow: nums(S.pow, 3), terrains: (Array.isArray(S.terrains) ? S.terrains.slice(0, 3) : []).map(t => (TERRAINS[t] ? t : null)),
      cut: nums(S.cut, MAX_TURNS, 0, MAX_CARDS * 4), treasure: num(S.treasure, 0), perfect: num(S.perfect, 0, MAX_TURNS), spells: num(S.spells, 0),
      lost: num(S.lost, 0), gen: !!S.gen, genFired: num(S.genFired, 0),
    }; }),
  };
}
// Ce qu'un joueur a gagné à la fin de la partie (écran de fin) : XP, Éclats, étoiles en classé.
const gainOf = r => (r ? { xp: r.xp || 0, shards: r.shards || 0, ...(r.ranked ? { stars: r.ranked.delta } : {}) } : null);
// Partie enregistrée : champs de base (stats de /admin) plus le détail pour l'historique des joueurs.
function withDetail(game, detail, { kind, ms, rewards = [], result = {} } = {}) {
  const d = detail && cleanDetail(detail);
  return { id: gameId(), ...game, kind, ...(ms > 0 ? { ms: Math.round(ms) } : {}), ...(result.forfeit ? { forfeit: true } : {}),
    ...(Array.isArray(result.zones) ? { zones: result.zones.slice(0, 3).map(z => ([0, 1, -1].includes(z) ? z : -1)) } : {}),
    ...(d ? { turns: d.turns, trace: d.trace } : {}),
    players: game.players.map((P, i) => ({ ...P, ...(d ? (({ pow, terrains, cut, treasure, perfect, spells, lost, gen, genFired }) => ({ pow, terrains, cut, treasure, perfect, spells, lost, gen, genFired }))(d.sides[i]) : {}),
      ...(rewards[i] ? { gain: gainOf(rewards[i]) } : {}) })) };
}

export function createGames(store, accounts) {
  // Partie jouée par le serveur terminée : decks = listes de cartes de chaque siège. mode « pve » pour une partie classée contre l'IA
  // (siège sans compte) ; ranked : partie classée.
  // kind : « salon » (code), « defi » (défi entre amis), « defi-classe », « classe-ia » ; ms : durée ; rewards : gains de chaque siège.
  function recordPvp(st, logins, decks, { mode = 'pvp', ranked = false, kind = 'salon', ms = 0, rewards = [] } = {}) {
    return store.addGame(withDetail({ mode, ...(ranked ? { ranked: true } : {}), at: new Date().toISOString(), winner: st.result.winner, reason: st.result.reason,
      players: [0, 1].map(p => sideOf(st.p[p], logins[p], decks[p])) }, gameDetail(st), { kind, ms, rewards, result: st.result }))
      .catch(e => console.error('Partie non enregistrée :', e));
  }
  // Partie contre l'IA terminée dans l'appli. Le joueur joue toujours le deck enregistré sur son compte.
  async function recordSolo(a, body) {
    const ids = v => (Array.isArray(v) ? v.slice(0, MAX_CARDS).filter(id => typeof id === 'string' && CARDS[id]) : []);
    const winner = [0, 1, -1].includes(body?.winner) ? body.winner : null;
    const deck = activeDeck(a);
    if (winner === null || !deck) throw new HttpError(400, 'Résultat invalide.');
    const ai = DECKS[body.ai?.deckKey] ? body.ai.deckKey : null;
    const zones = Array.isArray(body.zones) && body.zones.length === 3 ? body.zones.filter(z => z === 0).length : 0;
    const reward = await accounts.recordGame(a, { mode: 'pve', result: winner === 0 ? 'win' : winner < 0 ? 'draw' : 'loss', played: ids(body.played), general: deck.general,
      sweep: winner === 0 && zones === 3, zones });
    await store.addGame(withDetail({ mode: 'pve', at: new Date().toISOString(), winner, reason: String(body.reason || '').slice(0, 120), players: [
      { login: a.login, name: a.name, general: deck.general, deck: deck.name, cards: deck.cards.slice(), played: ids(body.played) },
      { login: null, name: 'IA', general: GENERALS[body.ai?.general] ? body.ai.general : (ai && DECKS[ai].general), deck: ai ? DECKS[ai].name : 'IA',
        cards: ai ? DECKS[ai].cards.slice() : [], played: ids(body.ai?.played) },
    ] }, body.detail, { kind: 'ia', ms: num(body.ms, 0, 6 * 3_600_000), rewards: [reward], result: { zones: body.zones } }));
    return { ok: true, reward, account: accounts.me(a) };
  }

  // Statistiques : mode « all », « pvp » ou « pve », sur les `days` derniers jours (0 = tout l'historique).
  function stats({ mode = 'all', days = 0 } = {}) {
    const since = days > 0 ? Date.now() - days * 86_400_000 : 0;
    const games = store.games().filter(g => (mode === 'all' || g.mode === mode) && Date.parse(g.at) >= since);
    const score = (g, i) => (g.winner === i ? 1 : g.winner < 0 ? 0.5 : 0);
    const rec = () => ({ games: 0, wins: 0, losses: 0, draws: 0 });
    const tally = (r, s) => { r.games++; if (s === 1) r.wins++; else if (s === 0) r.losses++; else r.draws++; };
    const players = {}, generals = {}, cards = {}, vsAi = rec();
    for (const g of games) g.players.forEach((P, i) => {
      const s = score(g, i);
      if (P.login) {
        const pl = players[P.login] ||= { login: P.login, name: accounts.nameOf(P.login) || P.name, pvp: rec(), pve: rec() };
        tally(pl[g.mode], s);
        if (g.mode === 'pve') tally(vsAi, s);
      }
      if (P.general) tally(generals[P.general] ||= { id: P.general, name: GENERALS[P.general]?.name || P.general, fam: GENERALS[P.general]?.fam || null, ...rec() }, s);
      const card = id => (cards[id] ||= { id, name: CARDS[id]?.name || id, plays: 0, playedScore: 0, decks: 0, deckScore: 0 });
      for (const id of P.played) { const c = card(id); c.plays++; c.playedScore += s; }
      for (const id of P.cards) { const c = card(id); c.decks++; c.deckScore += s; }
    });
    const pct = (n, d) => (d ? Math.round(100 * n / d) : null);
    const rate = r => pct(r.wins + r.draws / 2, r.games);
    return {
      total: games.length, pvp: games.filter(g => g.mode === 'pvp').length, pve: games.filter(g => g.mode === 'pve').length,
      vsAi: { ...vsAi, rate: rate(vsAi) },
      players: Object.values(players).map(p => ({ ...p, pvp: { ...p.pvp, rate: rate(p.pvp) }, pve: { ...p.pve, rate: rate(p.pve) } }))
        .sort((a, b) => b.pvp.games + b.pve.games - (a.pvp.games + a.pve.games)),
      generals: Object.values(generals).map(g => ({ ...g, rate: rate(g) })).sort((a, b) => b.games - a.games),
      cards: Object.values(cards).map(c => ({ id: c.id, name: c.name, plays: c.plays, playedRate: pct(c.playedScore, c.plays), decks: c.decks, deckRate: pct(c.deckScore, c.decks) }))
        .sort((a, b) => b.plays - a.plays || b.decks - a.decks),
      recent: games.slice(-20).reverse().map(g => ({ at: g.at, mode: g.mode, winner: g.winner, reason: g.reason, players: g.players.map(P => ({ name: P.name, login: P.login, deck: P.deck })) })),
    };
  }

  // Statistiques d'un joueur pour sa page de profil : bilan en ligne et contre l'IA, par général, cartes les plus jouées
  // (TOP_CARDS, jetons à part), dernières parties.
  function playerStats(a) {
    const rec = () => ({ games: 0, wins: 0, losses: 0, draws: 0 });
    const out = { pvp: rec(), pve: rec(), all: rec() }, gens = {}, cards = {}, recent = [];
    for (const g of store.games()) {
      const i = g.players.findIndex(P => P.login === a.login); if (i < 0) continue;
      const k = g.winner === i ? 'wins' : g.winner < 0 ? 'draws' : 'losses', P = g.players[i], foe = g.players[1 - i];
      for (const r of [out[g.mode], out.all, P.general && (gens[P.general] ||= { id: P.general, name: GENERALS[P.general]?.name || P.general, ...rec() })]) if (r) { r.games++; r[k]++; }
      for (const id of P.played) if (CARDS[id] && !CARDS[id].token) cards[id] = (cards[id] || 0) + 1;
      recent.push({ at: g.at, mode: g.mode, result: k, deck: P.deck, foe: g.mode === 'pve' ? 'IA' : (accounts.nameOf(foe.login) || foe.name) });
    }
    const rate = r => ({ ...r, rate: r.games ? Math.round(100 * (r.wins + r.draws / 2) / r.games) : null });
    return { pvp: rate(out.pvp), pve: rate(out.pve), all: rate(out.all),
      generals: Object.values(gens).map(rate).sort((x, y) => y.games - x.games), recent: recent.slice(-10).reverse(),
      cards: Object.entries(cards).sort((x, y) => y[1] - x[1] || CARDS[x[0]].name.localeCompare(CARDS[y[0]].name, 'fr')).slice(0, TOP_CARDS).map(([id, plays]) => ({ id, plays })) };
  }
  // Historique détaillé d'un joueur (écran Historique du profil, pas de replay) : ses HISTORY_GAMES dernières parties vues de son côté,
  // et un bilan sur toutes ses parties. L'adversaire n'y montre que les cartes qu'il a révélées, jamais son deck complet.
  function playerHistory(a) {
    const mine = store.games().map(g => [g, g.players.findIndex(P => P.login === a.login)]).filter(([, i]) => i >= 0);
    const rec = () => ({ games: 0, wins: 0, losses: 0, draws: 0 });
    const resOf = (g, i) => (g.winner === i ? 'wins' : g.winner < 0 ? 'draws' : 'losses');
    const kindOf = g => g.kind || (g.mode === 'pve' ? (g.ranked ? 'classe-ia' : 'ia') : g.ranked ? 'defi-classe' : 'salon');
    const side = (P, me) => {
      const out = { name: me ? P.name : (P.login && accounts.nameOf(P.login)) || P.name, login: P.login || null, general: P.general || null, deck: P.deck || null, played: P.played.slice() };
      for (const k of ['pow', 'terrains', 'cut', 'treasure', 'perfect', 'spells', 'lost', 'gen', 'genFired']) if (P[k] !== undefined) out[k] = P[k];
      if (me && P.gain) out.gain = P.gain;
      return out;
    };
    // Bilan : par type de partie, par deck joué, contre chaque général adverse, séries, zones gagnées.
    const total = rec(), byKind = {}, byDeck = {}, vsGen = {};
    let best = 0, run = 0, zonesWon = 0, zonesGames = 0, sweeps = 0, time = 0, timed = 0;
    for (const [g, i] of mine) {
      const k = resOf(g, i), P = g.players[i], foe = g.players[1 - i];
      const deckKey = `${P.deck || ''}|${P.general || ''}`;
      for (const r of [total, byKind[kindOf(g)] ||= rec(), byDeck[deckKey] ||= { deck: P.deck || null, general: P.general || null, ...rec() },
        foe.general && (vsGen[foe.general] ||= { id: foe.general, name: GENERALS[foe.general]?.name || foe.general, ...rec() })]) if (r) { r.games++; r[k]++; }
      run = k === 'wins' ? run + 1 : 0; best = Math.max(best, run);
      if (Array.isArray(g.zones)) { const n = g.zones.filter(z => z === i).length; zonesWon += n; zonesGames++; if (n === 3) sweeps++; }
      if (g.ms) { time += g.ms; timed++; }
    }
    const rate = r => ({ ...r, rate: r.games ? Math.round(100 * (r.wins + r.draws / 2) / r.games) : null });
    const games = mine.slice(-HISTORY_GAMES).reverse().map(([g, i]) => ({
      id: g.id || `${g.at}-${i}`, at: g.at, kind: kindOf(g), mode: g.mode, ranked: !!g.ranked, result: resOf(g, i), reason: g.reason || '',
      ...(g.forfeit ? { forfeit: true } : {}), ...(g.ms ? { ms: g.ms } : {}), ...(g.turns ? { turns: g.turns } : {}),
      // Zones et trace vues du joueur : « me », « foe » ou « tie » ; puissance [à moi, à l'adversaire].
      ...(Array.isArray(g.zones) ? { zones: g.zones.map(z => (z === i ? 'me' : z < 0 ? 'tie' : 'foe')) } : {}),
      ...(g.trace ? { trace: g.trace.map(t => [t[i], t[1 - i]]) } : {}),
      me: side(g.players[i], true), foe: side(g.players[1 - i], false),
    }));
    return {
      games,
      summary: { ...rate(total), streak: run, best, form: mine.slice(-10).map(([g, i]) => resOf(g, i)[0]).join(''),
        zones: zonesGames ? Math.round(10 * zonesWon / zonesGames) / 10 : null, sweeps, avgMs: timed ? Math.round(time / timed) : null,
        kinds: Object.fromEntries(Object.entries(byKind).map(([k, r]) => [k, rate(r)])),
        decks: Object.values(byDeck).map(rate).sort((x, y) => y.games - x.games).slice(0, 10),
        foes: Object.values(vsGen).map(rate).sort((x, y) => y.games - x.games) },
    };
  }

  // Profil public d'un joueur (pop-up depuis le classement) : image, cadre, titre, niveau, victoires, cartes et général
  // les plus joués, arts préférés et rang de la saison. Jamais ses dernières parties. friend : où en est le lien avec vous
  // (« me », « friend », « out » : demande envoyée, « in » : il vous a demandé, null).
  function publicProfile(me, login) {
    const b = store.get(String(login || '').trim().toLowerCase());
    if (!b || b.disabled) throw new HttpError(404, 'Joueur introuvable.');
    const st = playerStats(b), gen = st.generals[0] || null, L = accounts.progress.ladder().find(x => x.login === b.login);
    // Niveau et art choisi de ses cartes les plus jouées et de son général, comme les voit un adversaire.
    const badge = accounts.progress.badge(b, { cards: st.cards.map(c => c.id), general: gen?.id }), look = id => ({ level: badge.looks[id] || 1, border: badge.borders[id] || badge.looks[id] || 1, art: badge.arts[id] || null });
    const has = k => (me[k] || []).includes(b.login);
    return { player: {
      login: b.login, name: b.name, avatar: b.avatar || null, frame: badge.frame, title: badge.title, level: badge.level,
      stats: { all: st.all, pvp: st.pvp, pve: st.pve }, cards: st.cards.map(c => ({ ...c, ...look(c.id) })), general: gen && { ...gen, ...look(gen.id) },
      favArts: accounts.progress.favArts(b).map(id => ({ id, level: b.cardLevels?.[ARTS[id].card] || 1, border: accounts.progress.borderOf(b, ARTS[id].card) })),
      ranked: L ? { pos: L.pos, rank: L.rank } : null,
      friend: b.login === me.login ? 'me' : has('friends') ? 'friend' : has('friendsOut') ? 'out' : has('friendsIn') ? 'in' : null,
    } };
  }

  return {
    recordPvp,
    routes: {
      'GET /api/profile': a => ({ stats: playerStats(a), achievements: accounts.progress.achievementsView(a), collection: accounts.progress.collectionView(a) }),
      'POST /api/games/solo': (a, body) => recordSolo(a, body),
      'GET /api/history': a => playerHistory(a),
      'GET /api/player': (a, _, __, url) => publicProfile(a, url.searchParams.get('login')),
      // Mode classé : le top 10 du classement porte l'image de profil de chaque joueur.
      'GET /api/ranked': a => ({ ranked: accounts.progress.rankedView(a), rewards: accounts.progress.seasonRewards(),
        ladder: accounts.progress.ladder().map(p => (p.pos <= LADDER_AVATARS ? { ...p, avatar: store.get(p.login)?.avatar || null } : p)),
        places: accounts.progress.placeRewards(), last: accounts.progress.lastSeason() }),
      'GET /api/admin/stats': (_, __, ___, url) => {
        const days = +url.searchParams.get('days') || 0;
        return { ...stats({ mode: url.searchParams.get('mode') || 'all', days }), activity: accounts.activity.stats(days) };
      },
    },
  };
}
