// Serveur de parties : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées.
// Sert aussi l'appli web compilée (client/dist) pour n'avoir qu'un seul service à héberger.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { DECKS, newGame, startTurn, runTurn, viewFor, aiPlan, pick, forfeitGame } from '@jeu/engine';
import { tierOf } from '@jeu/engine/ranked';
import { deckError } from '@jeu/engine/collection';
import { openStore } from './store.js';
import { createAccounts, apiHandler, activeDeck } from './accounts.js';
import { createGames } from './games.js';
import { createCatalog } from './cards.js';
import { createFriends } from './friends.js';
import { createMail } from './mail.js';
import { NOTES_MAJ } from './notes-maj.js';

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
const api = apiHandler(accounts, process.env.ADMIN_KEY || '', { ...catalog.routes, ...games.routes, ...friends.routes, ...mail.routes }, catalog.public);

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

// Niveaux et arts alternatifs des cartes de l'adversaire : seulement ceux de son général et des cartes qu'il a déjà révélées, pour ne rien dire de son deck.
function shownBadge(b, P) {
  if (!b) return b;
  const ids = new Set([P.general, ...P.played]), only = o => Object.fromEntries(Object.entries(o || {}).filter(([id]) => ids.has(id)));
  return { ...b, looks: only(b.looks), arts: only(b.arts) };
}
function broadcast(room, flash = null) {
  room.seats.forEach((s, i) => {
    if (!s || !room.st) return;
    const ready = room.plans.map(Boolean);
    send(s.ws, { t: 'state', room: room.code, view: viewFor(room.st, i, { flash, ready: { me: ready[i], foe: ready[1 - i] },
      names: room.seats.map(x => x && x.name), connected: room.seats.map(x => !!(x && (x.ai || (x.ws && x.ws.readyState === 1)))),
      badges: room.seats.map((x, j) => x && (j === i ? x.badge : shownBadge(x.badge, room.st.p[j]))),
      away: room.seats.map(x => (x && x.forfeitAt ? Math.max(0, x.forfeitAt - Date.now()) : null)), reward: room.rewards ? room.rewards[i] : null, ranked: room.ranked || null,
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
  const decks = room.seats.map(s => { if (s.ai) return pick(Object.keys(DECKS));
    const acc = accounts.byToken(s.auth), d = acc && deckOf(acc, s.deckId); return d && !deckError(d, acc) ? d : s.deck; });
  room.decks = decks.map(d => (typeof d === 'string' ? DECKS[d].cards : d.cards));
  room.st = newGame(decks[0], decks[1], room.seats.map(s => s.name), { generals: decks.map(d => (typeof d === 'string' ? null : d.general)) });
  startTurn(room.st); room.st.phase = 'plan';
  room.plans = [null, null]; room.rematch = [false, false]; room.rewards = null;
  room.seats.forEach((s, i) => { const acc = accounts.byToken(s.auth); if (acc) { s.badge = accounts.progress.badge(acc, decks[i]); s.avatar = acc.avatar || null; } s.avatarsSent = false; });
  broadcast(room);
}
async function resolve(room) {
  room.busy = true;
  const plans = room.plans; room.plans = [null, null];
  await runTurn(room.st, plans, flash => broadcast(room, flash), ms => new Promise(r => setTimeout(r, ms)));
  room.busy = false;
  await endMatch(room);
}
// Partie terminée (fin du dernier tour ou forfait) : enregistrée une seule fois, avec les récompenses de chacun, puis diffusée.
async function endMatch(room) {
  if (room.st.over && !room.st.recorded) {
    room.seats.forEach(s => s && stopAway(s));
    room.st.recorded = true;
    const mode = room.ranked === 'ai' ? 'pve' : 'pvp';
    games.recordPvp(room.st, room.seats.map(s => s.login), room.decks, { mode, ranked: !!room.ranked });
    // Récompenses de fin de partie (et rang en classé), affichées à chacun sur l'écran de fin.
    const { winner, zones } = room.st.result;
    const result = i => (winner === i ? 'win' : winner < 0 ? 'draw' : 'loss');
    const ranks = room.ranked ? rankedResults(room, result) : [null, null];
    room.rewards = await Promise.all(room.seats.map(async (s, i) => {
      const acc = accounts.byToken(s.auth); if (!acc) return null;
      const reward = await accounts.recordGame(acc, { mode, result: result(i), played: room.st.p[i].played,
        general: room.st.p[i].general, sweep: !room.st.result.forfeit && winner === i && zones.every(z => z === i), friend: !!room.invite, ranked: !!room.ranked }).catch(e => { console.error('Récompenses non enregistrées :', e); return null; });
      return reward && ranks[i] ? { ...reward, ranked: ranks[i] } : reward;
    }));
  }
  broadcast(room);
}

// ---- Mode classé ----
// Partie classée contre l'IA : le serveur joue l'IA, dont la force dépend du palier du joueur. Défi classé : salon d'un défi marqué « friend ».
function aiSeat(acc) {
  const t = tierOf(accounts.progress.ranked(acc).r);
  return { ai: true, tries: t.ai, name: `IA ${t.name}`, login: null };
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
    forfeitGame(room.st, i, 'forfait après une déconnexion de plus de 60 secondes');
    room.plans = [null, null];
    endMatch(room).catch(e => console.error('Forfait non enregistré :', e));
  };
  s.awayTimer = setTimeout(fire, AWAY_FORFEIT_MS);
}
// Un joueur entre dans un salon avec son compte et le deck demandé (msg.deck), ou à défaut son deck joué.
const deckOf = (acc, id) => (id && (acc.decks || []).find(d => d.id === id)) || activeDeck(acc);
function seatFor(ws, msg) {
  const acc = accounts.byToken(msg.auth);
  if (!acc) { send(ws, { t: 'error', msg: 'Session expirée : reconnectez-vous.' }); return null; }
  const deck = deckOf(acc, msg.deck);
  const err = deck ? deckError(deck, acc) : 'Choisissez d\'abord votre deck de départ.';
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
  for (const other of room.invite) if (other !== login) friends.notify(other, { t: 'challenge-gone', room: room.code, msg: `${name} a annulé la partie.` });
  rooms.delete(room.code); seatsChanged(room);
}
function abortInvite(code, login) {
  const room = rooms.get(code);
  if (room && room.invite && room.invite.includes(login) && !room.st) closeInvite(room, login);
}
function handle(ws, msg) {
  // Ping de l'appli : lui permet de repérer une connexion morte sans fermeture (changement de réseau, veille).
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
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
  if (msg.t === 'join') {
    const room = rooms.get(String(msg.room || '').toUpperCase());
    if (!room) return send(ws, { t: 'error', msg: 'Aucune partie avec ce code.' });
    // Salon d'un défi : chacun a sa place gardée, la partie commence quand les deux sont entrés.
    const i = room.invite ? room.invite.indexOf(accounts.byToken(msg.auth)?.login) : 1;
    if (i < 0) return send(ws, { t: 'error', msg: 'Cette partie est réservée à deux amis.' });
    if (room.seats[i]) return send(ws, { t: 'error', msg: 'Cette partie est déjà complète.' });
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
    if (ai >= 0) room.plans[ai] = aiPlan(room.st, ai, room.seats[ai].tries);
    if (room.plans[0] && room.plans[1]) resolve(room); else broadcast(room);
    return;
  }
  if (msg.t === 'rematch') {
    if (!room.st || !room.st.over) return;
    room.rematch[ws.seat] = true;
    room.seats.forEach((s, i) => { if (s.ai) room.rematch[i] = true; });
    if (room.rematch[0] && room.rematch[1]) startMatch(room); else broadcast(room);
    return;
  }
  if (msg.t === 'leave') {
    ws.room = null;
    if (room.invite && !room.st) return closeInvite(room, room.seats[ws.seat].login);
    forfeit(room, ws.seat);
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
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.lastActive <= ROOM_TTL_MS) continue;
    const gone = r.seats.map(away);
    if (gone[0] !== gone[1]) forfeit(r, gone[0] ? 0 : 1);
    rooms.delete(code);
  }
}, 60_000);

server.listen(PORT, () => console.log(`Serveur de parties sur http://localhost:${PORT}`));
