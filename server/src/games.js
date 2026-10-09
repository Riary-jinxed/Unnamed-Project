// Historique des parties et statistiques pour /admin.
// JcJ : enregistré par le serveur en fin de partie. JcE : la partie tourne dans l'appli, qui envoie son résultat.
import { CARDS, GENERALS, DECKS } from '@jeu/engine';
import { HttpError, activeDeck } from './accounts.js';

const MAX_CARDS = 40;
// Une main de joueur telle qu'enregistrée : qui, avec quel deck, et les cartes jouées (révélées) pendant la partie.
const sideOf = (P, login, deckCards) => ({ login: login || null, name: P.name, general: P.general, deck: P.deckName, cards: deckCards.slice(), played: P.played.slice() });

export function createGames(store, accounts) {
  // Partie en ligne terminée : decks = listes de cartes jouées par chaque siège.
  function recordPvp(st, logins, decks) {
    return store.addGame({ mode: 'pvp', at: new Date().toISOString(), winner: st.result.winner, reason: st.result.reason,
      players: [0, 1].map(p => sideOf(st.p[p], logins[p], decks[p])) }).catch(e => console.error('Partie non enregistrée :', e));
  }
  // Partie contre l'IA terminée dans l'appli. Le joueur joue toujours le deck enregistré sur son compte.
  async function recordSolo(a, body) {
    const ids = v => (Array.isArray(v) ? v.slice(0, MAX_CARDS).filter(id => typeof id === 'string' && CARDS[id]) : []);
    const winner = [0, 1, -1].includes(body?.winner) ? body.winner : null;
    const deck = activeDeck(a);
    if (winner === null || !deck) throw new HttpError(400, 'Résultat invalide.');
    const ai = DECKS[body.ai?.deckKey] ? body.ai.deckKey : null;
    await store.addGame({ mode: 'pve', at: new Date().toISOString(), winner, reason: String(body.reason || '').slice(0, 120), players: [
      { login: a.login, name: a.name, general: deck.general, deck: deck.name, cards: deck.cards.slice(), played: ids(body.played) },
      { login: null, name: 'IA', general: GENERALS[body.ai?.general] ? body.ai.general : (ai && DECKS[ai].general), deck: ai ? DECKS[ai].name : 'IA',
        cards: ai ? DECKS[ai].cards.slice() : [], played: ids(body.ai?.played) },
    ] });
    const sweep = winner === 0 && Array.isArray(body.zones) && body.zones.length === 3 && body.zones.every(z => z === 0);
    const reward = await accounts.recordGame(a, { mode: 'pve', result: winner === 0 ? 'win' : winner < 0 ? 'draw' : 'loss', played: ids(body.played), general: deck.general, sweep });
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

  // Statistiques d'un joueur pour sa page de profil : bilan en ligne et contre l'IA, par général, dernières parties.
  function playerStats(a) {
    const rec = () => ({ games: 0, wins: 0, losses: 0, draws: 0 });
    const out = { pvp: rec(), pve: rec(), all: rec() }, gens = {}, recent = [];
    for (const g of store.games()) {
      const i = g.players.findIndex(P => P.login === a.login); if (i < 0) continue;
      const k = g.winner === i ? 'wins' : g.winner < 0 ? 'draws' : 'losses', P = g.players[i], foe = g.players[1 - i];
      for (const r of [out[g.mode], out.all, P.general && (gens[P.general] ||= { id: P.general, name: GENERALS[P.general]?.name || P.general, ...rec() })]) if (r) { r.games++; r[k]++; }
      recent.push({ at: g.at, mode: g.mode, result: k, deck: P.deck, foe: g.mode === 'pve' ? 'IA' : (accounts.nameOf(foe.login) || foe.name) });
    }
    const rate = r => ({ ...r, rate: r.games ? Math.round(100 * (r.wins + r.draws / 2) / r.games) : null });
    return { pvp: rate(out.pvp), pve: rate(out.pve), all: rate(out.all),
      generals: Object.values(gens).map(rate).sort((x, y) => y.games - x.games), recent: recent.slice(-10).reverse() };
  }

  return {
    recordPvp,
    routes: {
      'GET /api/profile': a => ({ stats: playerStats(a), achievements: accounts.progress.achievementsView(a), collection: accounts.progress.collectionView(a) }),
      'POST /api/games/solo': (a, body) => recordSolo(a, body),
      'GET /api/admin/stats': (_, __, ___, url) => stats({ mode: url.searchParams.get('mode') || 'all', days: +url.searchParams.get('days') || 0 }),
    },
  };
}
