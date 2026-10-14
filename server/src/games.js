// Historique des parties et statistiques pour /admin.
// JcJ : enregistré par le serveur en fin de partie. JcE : la partie tourne dans l'appli, qui envoie son résultat.
import { CARDS, GENERALS, DECKS } from '@jeu/engine';
import { ARTS } from '@jeu/engine/arts';
import { HttpError, activeDeck } from './accounts.js';

const MAX_CARDS = 40;
// Cartes les plus jouées montrées sur un profil ; places du classement qui montrent l'image de profil.
const TOP_CARDS = 5, LADDER_AVATARS = 10;
// Une main de joueur telle qu'enregistrée : qui, avec quel deck, et les cartes jouées (révélées) pendant la partie.
const sideOf = (P, login, deckCards) => ({ login: login || null, name: P.name, general: P.general, deck: P.deckName, cards: deckCards.slice(), played: P.played.slice() });

export function createGames(store, accounts) {
  // Partie jouée par le serveur terminée : decks = listes de cartes de chaque siège. mode « pve » pour une partie classée contre l'IA
  // (siège sans compte) ; ranked : partie classée.
  function recordPvp(st, logins, decks, { mode = 'pvp', ranked = false } = {}) {
    return store.addGame({ mode, ...(ranked ? { ranked: true } : {}), at: new Date().toISOString(), winner: st.result.winner, reason: st.result.reason,
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
    const zones = Array.isArray(body.zones) && body.zones.length === 3 ? body.zones.filter(z => z === 0).length : 0;
    const reward = await accounts.recordGame(a, { mode: 'pve', result: winner === 0 ? 'win' : winner < 0 ? 'draw' : 'loss', played: ids(body.played), general: deck.general,
      sweep: winner === 0 && zones === 3, zones });
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
