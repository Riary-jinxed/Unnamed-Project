// Serveur de parties : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées.
// Sert aussi l'appli web compilée (client/dist) pour n'avoir qu'un seul service à héberger.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { DECKS, GENERALS, newGame, startTurn, runTurn, viewFor, aiPlan, pick, forfeitGame, interruptGame, bossStep } from '@jeu/engine';
import { newBossGame, bossScore } from '@jeu/engine/boss';
import { tierOf } from '@jeu/engine/ranked';
import { EMOTE_COOLDOWN_MS, EMOTE_MAX, aiReply } from '@jeu/engine/emotes';
import { deckError, aiDeckKeys } from '@jeu/engine/collection';
import { addStrings, tr, msg } from '@jeu/engine/i18n';
import engineEn from '@jeu/engine/lang/en';
import { langOf, validLang, withLang } from './i18n.js';
import { openStore } from './store.js';
import { createAccounts, apiHandler, activeDeck, HttpError } from './accounts.js';
import { createGames } from './games.js';
import { createCatalog } from './cards.js';
import { createFriends } from './friends.js';
import { createMail } from './mail.js';
import { createNews } from './news.js';
import { createClans } from './clans.js';
import { createBoss } from './boss.js';
import { createStory } from './story.js';
import { createPush } from './push.js';
import { createFollow } from './follow.js';
import { NOTES_MAJ } from './notes-maj.js';

// Traductions anglaises (moteur et serveur) : messages d'erreur, notifications et textes envoyés aux joueurs dans leur langue.
addStrings('en', engineEn);

const PORT = +process.env.PORT || 8787;
const DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url));
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
// Joueur déconnecté en pleine partie : au-delà de ce délai sans revenir, il perd par forfait.
const AWAY_FORFEIT_MS = 60_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };

const store = await openStore();
const accounts = createAccounts(store);
await accounts.ready;
const catalog = createCatalog(store, accounts), games = createGames(store, accounts);
await accounts.syncAll();
// Les amis voient qui est en partie et peuvent ouvrir un salon réservé à eux deux (défi accepté).
const friends = createFriends(store, accounts, { playing, inviteRoom, abortInvite });
// Courrier : un joueur connecté voit aussitôt arriver un nouveau message (par sa connexion de présence).
const mail = createMail(store, accounts, { notify: logins => logins.forEach(l => friends.notify(l, { t: 'mail' })) });
await mail.publishNotes(NOTES_MAJ);
// Nouveautés : annonces des mises à jour majeures et des sets ; la pastille de l'accueil se met à jour dès qu'une annonce paraît.
const news = createNews(store, accounts, { notify: logins => logins.forEach(l => friends.notify(l, { t: 'news' })) });
// Notifications push : rien n'est envoyé à un joueur qui a l'appli ouverte (sa connexion de présence le prévient déjà).
const push = createPush(store, accounts, { isOnline: friends.online, events: accounts.progress.events });
friends.setPush(push);
news.setPush(push);
push.start();
// Clans : les parties font avancer les missions du clan ; la fin du mois fige aussi le classement des clans.
const clans = createClans(store, accounts, push);
accounts.setGameHook((a, info) => clans.onGame(a, info));
accounts.progress.setSeasonHook(id => clans.closeSeason(id));
// Le profil public d'un joueur montre aussi son clan.
const playerRoute = games.routes['GET /api/player'];
games.routes['GET /api/player'] = (...x) => { const r = playerRoute(...x); r.player.clan = clans.badge(r.player.login); return r; };
// Boss mondial : tentatives jouées dans un salon du serveur (message « boss »), classement de la semaine, magasin.
const boss = createBoss(store, accounts);
accounts.setBossTile(a => boss.tile(a));
// Quêtes d'histoire : combats joués dans la page, progression et récompenses des chapitres, quêtes à durée limitée.
const story = createStory(store, accounts, { onChange: () => catalog.refresh() });
catalog.setExtraCards(() => story.releasedCards());
accounts.setStoryTile(a => story.tile(a));
// Onglet Suivi de /admin : rétention et suivi du nouveau contenu.
const follow = createFollow(store, accounts, { boss, events: accounts.progress.events });
const api = apiHandler(accounts, process.env.ADMIN_KEY || '', { ...catalog.routes, ...games.routes, ...friends.routes, ...mail.routes, ...news.routes, ...accounts.progress.events.routes, ...clans.routes, ...push.routes, ...boss.routes, ...story.routes, ...follow.routes }, catalog.public);

// ---- API et fichiers statiques ----
// Les fichiers de client/dist ne changent pas pendant que le serveur tourne : chacun est lu et compressé une seule fois.
// Les fichiers de /assets/ portent une empreinte dans leur nom (Vite) : le navigateur peut les garder un an.
const files = new Map();
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);
async function staticFile(path) {
  if (files.has(path)) return files.get(path);
  let body;
  try { body = await readFile(join(DIST, path)); } catch { return null; }
  const ext = extname(path);
  const file = { body, gz: COMPRESSIBLE.has(ext) && body.length > 1024 ? gzipSync(body) : null, type: MIME[ext] || 'application/octet-stream',
    cache: path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : path.startsWith('music/') ? 'public, max-age=86400' : 'no-cache' };
  files.set(path, file);
  return file;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.end('ok'); return; }
  if (await api(req, res, url)) return;
  if (url.pathname === '/admin') url.pathname = '/admin.html';
  let path;
  try { path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ''); } catch { path = '..'; }
  if (path.includes('..')) { res.writeHead(400); res.end(); return; }
  // Adresse inconnue : l'appli (index.html) s'en charge. Sauf une musique absente : l'appli passe au morceau suivant.
  const music = path.startsWith('music/');
  const file = await staticFile(path || 'index.html') || (music ? null : await staticFile('index.html'));
  if (!file) { res.writeHead(404); res.end(music ? '' : 'Appli non compilée : lancez « npm run build ».'); return; }
  // Le lecteur audio lit les musiques par morceaux (Safari l'exige) : requête « Range: bytes=début-fin ».
  const range = file.type.startsWith('audio/') && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    const size = file.body.length, start = range[1] ? +range[1] : Math.max(0, size - +range[2]), end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return; }
    res.writeHead(206, { 'content-type': file.type, 'cache-control': file.cache, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}` });
    res.end(file.body.subarray(start, end + 1)); return;
  }
  const gz = file.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { 'content-type': file.type, 'cache-control': file.cache, vary: 'accept-encoding', ...(file.type.startsWith('audio/') ? { 'accept-ranges': 'bytes' } : {}), ...(gz ? { 'content-encoding': 'gzip' } : {}) });
  res.end(gz ? file.gz : file.body);
});

// ---- Salons ----
const rooms = new Map();
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
// Langue d'une connexion : champ lang du premier message (create, join, rejoin…), français sans lui.
const wsLang = ws => ws.lang || 'fr';

// Niveaux et arts alternatifs des cartes de l'adversaire : seulement ceux de son général et des cartes qu'il a déjà révélées, pour ne rien dire de son deck.
function shownBadge(b, P) {
  if (!b) return b;
  const ids = new Set([P.general, ...P.played]), only = o => Object.fromEntries(Object.entries(o || {}).filter(([id]) => ids.has(id)));
  return { ...b, looks: only(b.looks), arts: only(b.arts), borders: only(b.borders) };
}
function broadcast(room, flash = null) {
  room.seats.forEach((s, i) => {
    if (!s || !room.st) return;
    const ready = room.plans.map(Boolean);
    send(s.ws, { t: 'state', room: room.code, view: viewFor(room.st, i, { flash, ready: { me: ready[i], foe: ready[1 - i] },
      names: room.seats.map(x => x && x.name), connected: room.seats.map(x => !!(x && (x.ai || (x.ws && x.ws.readyState === 1)))),
      badges: room.seats.map((x, j) => x && (j === i ? x.badge : shownBadge(x.badge, room.st.p[j]))),
      away: room.seats.map(x => (x && x.forfeitAt ? Math.max(0, x.forfeitAt - Date.now()) : null)), reward: room.rewards ? room.rewards[i] : null, ranked: room.ranked || null,
      // Boss mondial : le boss, son action de ce tour et le score du moment.
      boss: room.boss ? { id: room.boss, step: bossStep(room.st), score: bossScore(room.st, boss.cfg()) } : undefined,
      // Images de profil : lourdes, envoyées une seule fois par connexion et par partie.
      avatars: s.avatarsSent ? undefined : room.seats.map(x => (x && x.avatar) || null) }) });
    if (s.ws && s.ws.readyState === 1) s.avatarsSent = true;
  });
}
function lobby(room) {
  room.seats.forEach((s, i) => s && send(s.ws, { t: 'lobby', room: room.code, seat: i, token: s.token, names: room.seats.map(x => x && x.name) }));
}
// Chaque joueur joue le deck choisi en entrant (son deck joué par défaut), relu sur son compte quand la partie (ou la revanche) commence.
// L'IA d'une partie classée prend un deck préconstruit au hasard, et sa force suit le rang actuel du joueur.
function startMatch(room) {
  if (room.ranked === 'ai') { const acc = accounts.byToken(room.seats[0].auth); if (acc) room.seats[1] = aiSeat(acc); }
  const decks = room.seats.map(s => { if (s.boss) return null; if (s.ai) return pick(aiDeckKeys());
    const acc = accounts.byToken(s.auth), d = acc && ((room.boss && boss.deckFor(acc, room.boss)) || deckOf(acc, s.deckId)); return d && !deckError(d, acc) ? d : s.deck; });
  room.decks = decks.map(d => (!d ? [] : typeof d === 'string' ? DECKS[d].cards : d.cards));
  room.st = room.boss ? newBossGame(decks[0], room.boss, room.seats[0].name)
    : newGame(decks[0], decks[1], room.seats.map(s => s.name), { generals: decks.map(d => (typeof d === 'string' ? null : d.general)) });
  startTurn(room.st); room.st.phase = 'plan';
  room.plans = [null, null]; room.rematch = [false, false]; room.rewards = null; room.startedAt = Date.now();
  room.seats.forEach((s, i) => { const acc = accounts.byToken(s.auth); if (acc) { s.badge = accounts.progress.badge(acc, decks[i]); s.avatar = acc.avatar || null; } s.avatarsSent = false; s.emotes = 0; });
  // Le boss se montre avec son art (portrait).
  if (room.boss) room.seats[1].badge = { boss: true, arts: { [room.boss]: GENERALS[room.boss].art }, looks: {}, borders: {} };
  broadcast(room);
}
// Une erreur pendant le tour ou l'enregistrement est notée sans arrêter le serveur (toutes les parties en cours tomberaient avec lui).
async function resolve(room) {
  room.busy = true;
  const plans = room.plans; room.plans = [null, null];
  try {
    await runTurn(room.st, plans, flash => broadcast(room, flash), ms => new Promise(r => setTimeout(r, ms)));
  } catch (e) { console.error('Tour en erreur :', e); }
  room.busy = false;
  await endMatch(room).catch(e => console.error('Fin de partie en erreur :', e));
}
// Partie terminée (fin du dernier tour ou forfait) : enregistrée une seule fois, avec les récompenses de chacun, puis diffusée.
async function endMatch(room) {
  if (room.st.over && !room.st.recorded && room.boss) {
    // Boss mondial : le score de la tentative, ses paliers et le total de la semaine (pas de victoire ni de défaite).
    room.seats.forEach(s => s && stopAway(s));
    room.st.recorded = true;
    const acc = accounts.byToken(room.seats[0].auth);
    const r = acc ? boss.finish(acc, room.st, { abandoned: !!room.st.result?.forfeit }) : null;
    if (acc) await store.put(acc).catch(e => console.error('Tentative non enregistrée :', e));
    room.rewards = [r ? { boss: r, account: accounts.me(acc) } : null, null];
  } else if (room.st.over && !room.st.recorded) {
    room.seats.forEach(s => s && stopAway(s));
    room.st.recorded = true;
    const mode = room.ranked === 'ai' ? 'pve' : 'pvp';
    // Récompenses de fin de partie (et rang en classé), affichées à chacun sur l'écran de fin.
    const { winner, zones } = room.st.result;
    const result = i => (winner === i ? 'win' : winner < 0 ? 'draw' : 'loss');
    const ranks = room.ranked ? rankedResults(room, result) : [null, null];
    room.rewards = await Promise.all(room.seats.map(async (s, i) => {
      const acc = accounts.byToken(s.auth); if (!acc) return null;
      const reward = await accounts.recordGame(acc, { mode, result: result(i), played: room.st.p[i].played,
        general: room.st.p[i].general, sweep: !room.st.result.forfeit && winner === i && zones.every(z => z === i),
        zones: room.st.result.forfeit ? 0 : zones.filter(z => z === i).length, friend: !!room.invite, ranked: !!room.ranked }).catch(e => { console.error('Récompenses non enregistrées :', e); return null; });
      return reward && ranks[i] ? { ...reward, ranked: ranks[i] } : reward;
    }));
    // Enregistrée avec ce que chacun a gagné, pour l'historique des joueurs.
    const kind = room.ranked === 'ai' ? 'classe-ia' : room.ranked === 'friend' ? 'defi-classe' : room.invite ? 'defi' : 'salon';
    games.recordPvp(room.st, room.seats.map(s => s.login), room.decks, { mode, ranked: !!room.ranked, kind, ms: Date.now() - (room.startedAt || Date.now()), rewards: room.rewards });
  }
  broadcast(room);
}

// ---- Mode classé ----
// Partie classée contre l'IA : le serveur joue l'IA, dont la force dépend du palier du joueur. Défi classé : salon d'un défi marqué « friend ».
// Son nom (« IA Bronze ») est dans la langue du joueur.
function aiSeat(acc) {
  const tier = tierOf(accounts.progress.ranked(acc).r), lang = langOf(acc);
  return { ai: true, tries: tier.ai, name: tr(lang, 'IA {tier}', { tier: tr(lang, tier.name) }), login: null };
}
// Rangs après la partie, pour chaque siège ; chaque ami est comparé au rang de l'autre avant la partie.
function rankedResults(room, result) {
  const accs = room.seats.map(s => (s.ai ? null : accounts.byToken(s.auth)));
  const before = accs.map(a => (a ? accounts.progress.ranked(a).r : null));
  return accs.map((a, i) => (a ? accounts.progress.onRanked(a, { result: result(i), foeR: room.ranked === 'friend' ? before[1 - i] : null }) : null));
}
// Quitter une partie classée en cours, ou la laisser expirer, compte comme une défaite (et une victoire pour l'ami resté).
function forfeit(room, seat) {
  if (!room.ranked || !room.st || room.st.over || room.forfeited) return;
  room.forfeited = true;
  rankedResults(room, i => (i === seat ? 'loss' : 'win'));
  room.seats.forEach(s => { const acc = !s.ai && accounts.byToken(s.auth); if (acc) store.put(acc).catch(e => console.error('Rang non enregistré :', e)); });
}

// Tentative contre le boss quittée ou expirée en cours de partie : elle compte avec le plateau du moment.
function abandonBoss(room) {
  if (!room.boss || !room.st || room.st.over) return;
  // Le joueur est déjà parti : plus rien ne lui est envoyé.
  room.seats.forEach(s => { if (s) s.ws = null; });
  forfeitGame(room.st, 0, msg('tentative abandonnée'));
  endMatch(room).catch(e => console.error('Tentative non enregistrée :', e));
}

// Déconnexion en pleine partie : le joueur a AWAY_FORFEIT_MS pour revenir, sinon il perd par forfait et l'autre gagne
// (contre l'IA classée, l'IA gagne). Si les deux sont partis, personne ne gagne : le compte à rebours reprend pour celui
// qui manque encore quand l'autre revient.
const isAway = s => s && !s.ai && !(s.ws && s.ws.readyState === 1);
function stopAway(s) { clearTimeout(s.awayTimer); s.awayTimer = null; s.forfeitAt = null; }
function startAway(room, i) {
  const s = room.seats[i];
  if (!room.st || room.st.over || !isAway(s) || s.awayTimer) return;
  s.forfeitAt = Date.now() + AWAY_FORFEIT_MS;
  const fire = () => {
    // Révélation en cours : le forfait attend qu'elle se termine.
    if (room.busy) { s.awayTimer = setTimeout(fire, 1000); return; }
    stopAway(s);
    if (rooms.get(room.code) !== room || !room.st || room.st.over || !isAway(s) || isAway(room.seats[1 - i])) return;
    forfeitGame(room.st, i, msg('forfait après une déconnexion de plus de 60 secondes'));
    room.plans = [null, null];
    endMatch(room).catch(e => console.error('Forfait non enregistré :', e));
  };
  s.awayTimer = setTimeout(fire, AWAY_FORFEIT_MS);
}
// Un joueur entre dans un salon avec son compte et le deck demandé (msg.deck), ou à défaut son deck joué.
const deckOf = (acc, id) => (id && (acc.decks || []).find(d => d.id === id)) || activeDeck(acc);
// Contre le boss mondial : son deck préparé s'il est complet (boss.deckFor), sinon le deck joué.
function seatFor(ws, msg, bossId = null) {
  const acc = accounts.byToken(msg.auth), lang = wsLang(ws);
  if (!acc) { send(ws, { t: 'error', msg: tr(lang, 'Session expirée : reconnectez-vous.') }); return null; }
  // La langue de l'appli est rangée sur le compte (notifications, nom de l'IA).
  if (ws.lang) accounts.setLang(acc, ws.lang);
  const deck = (bossId && boss.deckFor(acc, bossId)) || deckOf(acc, msg.deck);
  const err = deck ? withLang(lang, () => deckError(deck, acc)) : tr(lang, 'Choisissez d\'abord votre deck de départ.');
  if (err) { send(ws, { t: 'error', msg: err }); return null; }
  return { name: acc.name, login: acc.login, auth: msg.auth, deck, deckId: deck.id, token: randomBytes(12).toString('hex'), ws };
}
// Statut vu par les amis : un joueur est « en partie » s'il est assis et connecté dans un salon.
function playing(login) {
  for (const r of rooms.values()) if (r.seats.some(s => s && s.login === login && s.ws && s.ws.readyState === 1)) return true;
  return false;
}
const seatsChanged = room => room.seats.forEach(s => s && friends.changed(s.login));
// Défi accepté : salon réservé aux deux amis, chacun prend la place qui lui est gardée en entrant.
function inviteRoom(logins, { ranked = false } = {}) {
  const room = { code: newCode(), seats: [null, null], plans: [null, null], st: null, busy: false, lastActive: Date.now(), invite: logins.slice(), ranked: ranked ? 'friend' : null };
  rooms.set(room.code, room);
  return room.code;
}
// Un des deux renonce (avant ou après être entré) : le salon disparaît et l'autre est prévenu.
function closeInvite(room, login) {
  const name = accounts.nameOf(login) || login;
  room.seats.forEach(s => { if (s && s.login !== login) send(s.ws, { t: 'left' }); });
  for (const other of room.invite) if (other !== login) friends.notify(other, { t: 'challenge-gone', room: room.code, msg: msg('{name} a annulé la partie.', { name }) });
  rooms.delete(room.code); seatsChanged(room);
}
function abortInvite(code, login) {
  const room = rooms.get(code);
  if (room && room.invite && room.invite.includes(login) && !room.st) closeInvite(room, login);
}
function handle(ws, msg) {
  // Ping de l'appli : lui permet de repérer une connexion morte sans fermeture (changement de réseau, veille).
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
  if (msg.lang && validLang(msg.lang)) ws.lang = validLang(msg.lang);
  if (friends.handle(ws, msg)) return;
  if (msg.t === 'create') {
    const seat = seatFor(ws, msg); if (!seat) return;
    const room = { code: newCode(), seats: [null, null], plans: [null, null], st: null, busy: false, lastActive: Date.now() };
    room.seats[0] = seat;
    rooms.set(room.code, room); ws.room = room; ws.seat = 0; lobby(room); friends.changed(seat.login); return;
  }
  if (msg.t === 'ranked') {
    const seat = seatFor(ws, msg); if (!seat) return;
    const room = { code: newCode(), seats: [seat, aiSeat(accounts.byToken(msg.auth))], plans: [null, null], st: null, busy: false, lastActive: Date.now(), ranked: 'ai' };
    rooms.set(room.code, room); ws.room = room; ws.seat = 0;
    lobby(room); startMatch(room); friends.changed(seat.login); return;
  }
  // Boss mondial : une tentative contre le boss de la semaine, comptée dès que la partie commence.
  if (msg.t === 'boss') {
    const seat = seatFor(ws, msg, boss.weekBoss()); if (!seat) return;
    const acc = accounts.byToken(msg.auth);
    let id; try { id = boss.start(acc); } catch (e) { return send(ws, { t: 'error', msg: e instanceof HttpError ? e.text(wsLang(ws)) : e.message }); }
    const room = { code: newCode(), seats: [seat, { ai: true, boss: true, name: tr(langOf(acc), GENERALS[id].name), login: null }], plans: [null, null], st: null, busy: false, lastActive: Date.now(), boss: id };
    rooms.set(room.code, room); ws.room = room; ws.seat = 0;
    lobby(room); startMatch(room); friends.changed(seat.login); return;
  }
  if (msg.t === 'join') {
    const room = rooms.get(String(msg.room || '').toUpperCase());
    if (!room) return send(ws, { t: 'error', msg: tr(wsLang(ws), 'Aucune partie avec ce code.') });
    // Salon d'un défi : chacun a sa place gardée, la partie commence quand les deux sont entrés.
    const i = room.invite ? room.invite.indexOf(accounts.byToken(msg.auth)?.login) : 1;
    if (i < 0) return send(ws, { t: 'error', msg: tr(wsLang(ws), 'Cette partie est réservée à deux amis.') });
    if (room.seats[i]) return send(ws, { t: 'error', msg: tr(wsLang(ws), 'Cette partie est déjà complète.') });
    const seat = seatFor(ws, msg); if (!seat) return;
    room.seats[i] = seat;
    ws.room = room; ws.seat = i; lobby(room); friends.changed(seat.login);
    if (room.seats[0] && room.seats[1]) startMatch(room);
    return;
  }
  if (msg.t === 'rejoin') {
    const room = rooms.get(String(msg.room || '').toUpperCase());
    const i = room ? room.seats.findIndex(s => s && s.token === msg.token) : -1;
    if (i < 0) return send(ws, { t: 'gone' });
    // L'ancienne connexion du joueur, peut-être encore ouverte côté serveur, ne parle plus pour lui.
    const old = room.seats[i].ws;
    if (old && old !== ws) { old.room = null; old.terminate(); }
    room.seats[i].ws = ws; room.seats[i].avatarsSent = false; ws.room = room; ws.seat = i;
    stopAway(room.seats[i]); startAway(room, 1 - i);
    if (room.st) broadcast(room); else lobby(room);
    friends.changed(room.seats[i].login);
    return;
  }
  const room = ws.room; if (!room) return;
  room.lastActive = Date.now();
  if (msg.t === 'plan') {
    if (!room.st || room.busy || room.st.over || room.plans[ws.seat]) return;
    // Tour renvoyé après une reconnexion : ignoré s'il date d'un tour déjà joué.
    if (msg.turn != null && msg.turn !== room.st.turn) return;
    room.plans[ws.seat] = { cards: Array.isArray(msg.cards) ? msg.cards.slice(0, 12) : [], moves: Array.isArray(msg.moves) ? msg.moves.slice(0, 12) : [], general: msg.general ?? null };
    const ai = room.seats.findIndex(s => s && s.ai);
    if (ai >= 0) room.plans[ai] = room.seats[ai].boss ? { cards: [], moves: [], general: null } : aiPlan(room.st, ai, room.seats[ai].tries);
    if (room.plans[0] && room.plans[1]) resolve(room); else broadcast(room);
    return;
  }
  // Émote : seulement une émote possédée, pendant la partie (fin comprise), une toutes les EMOTE_COOLDOWN_MS et EMOTE_MAX par partie.
  // Elle part aux deux joueurs ; chacun peut couper celles de l'adversaire dans l'appli. L'IA répond parfois aux politesses.
  if (msg.t === 'emote') {
    const s = room.seats[ws.seat], id = String(msg.id || ''), now = Date.now();
    if (!room.st || !s || !accounts.progress.canEmote(accounts.byToken(s.auth), id)) return;
    if (now - (s.emoteAt || 0) < EMOTE_COOLDOWN_MS || (s.emotes || 0) >= EMOTE_MAX) return;
    s.emoteAt = now; s.emotes = (s.emotes || 0) + 1;
    accounts.activity.count(['emotesOnline', `emote:${id}`]);
    const say = (seat, e) => room.seats.forEach(x => x && send(x.ws, { t: 'emote', seat, id: e }));
    say(ws.seat, id);
    const ai = room.seats.findIndex(x => x && x.ai && !x.boss), reply = ai >= 0 ? aiReply(id) : null;
    if (reply) setTimeout(() => { if (rooms.get(room.code) === room) say(ai, reply); }, 1200 + Math.random() * 800);
    return;
  }
  if (msg.t === 'rematch') {
    if (!room.st || !room.st.over) return;
    if (room.boss) {
      // Nouvelle tentative contre le boss de la semaine (il peut avoir changé depuis lundi minuit).
      const acc = accounts.byToken(room.seats[0].auth); if (!acc) return;
      try { room.boss = boss.start(acc); } catch (e) { return send(ws, { t: 'error', msg: e instanceof HttpError ? e.text(wsLang(ws)) : e.message }); }
      room.seats[1].name = tr(langOf(acc), GENERALS[room.boss].name);
      return startMatch(room);
    }
    room.rematch[ws.seat] = true;
    room.seats.forEach((s, i) => { if (s.ai) room.rematch[i] = true; });
    if (room.rematch[0] && room.rematch[1]) startMatch(room); else broadcast(room);
    return;
  }
  if (msg.t === 'leave') {
    ws.room = null;
    if (room.invite && !room.st) return closeInvite(room, room.seats[ws.seat].login);
    forfeit(room, ws.seat);
    abandonBoss(room);
    room.seats.forEach((s, i) => i !== ws.seat && s && send(s.ws, { t: 'left' }));
    rooms.delete(room.code); seatsChanged(room);
  }
}

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', data => { ws.alive = true; try { handle(ws, JSON.parse(data)); } catch (e) { console.error(e); } });
  ws.on('close', () => {
    friends.gone(ws);
    const room = ws.room; if (!room) return;
    if (room.seats[ws.seat]?.ws === ws) startAway(room, ws.seat);
    if (room.st) broadcast(room);
    if (rooms.has(room.code)) friends.changed(room.seats[ws.seat]?.login);
  });
});
// Partie classée abandonnée sans « leave » : celui qui n'est plus connecté perd (contre l'IA, le joueur ; entre amis, seulement si l'autre est resté).
// Connexion qui ne répond plus aux pings depuis 30 secondes : fermée, pour que l'adversaire et les amis voient le joueur déconnecté.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 30_000);
const away = s => s && !s.ai && !(s.ws && s.ws.readyState === 1);
setInterval(() => {
  catalog.refresh();
  // Fin du mois : le classement de la saison finie est figé tout de suite, sans attendre qu'un joueur revienne.
  accounts.progress.closeSeason();
  // Fin de semaine : le classement du boss mondial est figé et ses récompenses données.
  boss.closeWeek();
  boss.announce(push);
  news.announce().catch(e => console.error('Nouveautés en erreur :', e));
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.lastActive <= ROOM_TTL_MS) continue;
    const gone = r.seats.map(away);
    if (gone[0] !== gone[1]) forfeit(r, gone[0] ? 0 : 1);
    abandonBoss(r);
    rooms.delete(code);
  }
}, 60_000);

server.listen(PORT, () => console.log(`Serveur de parties sur http://localhost:${PORT}`));

// Arrêt du serveur (mise à jour sur Render : SIGTERM, puis arrêt forcé ~30 s plus tard). Les parties en cours vivent en mémoire :
// elles sont enregistrées dans l'historique comme interrompues (sans victoire, défaite, récompense ni changement de rang),
// et les joueurs voient l'écran de fin avec la raison. Les tentatives contre le boss sont laissées telles quelles.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return; stopping = true;
  console.log(`${signal} : arrêt du serveur, parties en cours enregistrées comme interrompues.`);
  const saves = [];
  for (const room of rooms.values()) {
    const st = room.st; if (!st || st.over || st.recorded || room.boss) continue;
    try {
      room.seats.forEach(s => s && stopAway(s));
      interruptGame(st, msg('interrompue par une mise à jour du jeu'));
      st.recorded = true; room.plans = [null, null];
      const kind = room.ranked === 'ai' ? 'classe-ia' : room.ranked === 'friend' ? 'defi-classe' : room.invite ? 'defi' : 'salon';
      saves.push(games.recordPvp(st, room.seats.map(s => s && s.login), room.decks, { mode: room.ranked === 'ai' ? 'pve' : 'pvp', ranked: !!room.ranked, kind, ms: Date.now() - (room.startedAt || Date.now()) }));
      broadcast(room);
    } catch (e) { console.error('Partie interrompue non enregistrée :', e); }
  }
  await Promise.race([Promise.allSettled(saves), new Promise(r => setTimeout(r, 15_000))]);
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { shutdown(signal); });
