// Serveur de parties : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées.
// Sert aussi l'appli web compilée (client/dist) pour n'avoir qu'un seul service à héberger.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { newGame, startTurn, runTurn, viewFor } from '@jeu/engine';
import { deckError } from '@jeu/engine/collection';
import { openStore } from './store.js';
import { createAccounts, apiHandler, activeDeck } from './accounts.js';
import { createGames } from './games.js';
import { createCatalog } from './cards.js';

const PORT = +process.env.PORT || 8787;
const DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url));
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const store = await openStore();
const accounts = createAccounts(store);
await accounts.ready;
const catalog = createCatalog(store, accounts), games = createGames(store, accounts);
await accounts.syncAll();
const api = apiHandler(accounts, process.env.ADMIN_KEY || '', { ...catalog.routes, ...games.routes }, catalog.public);

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
    cache: path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
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
  // Adresse inconnue : l'appli (index.html) s'en charge.
  const file = await staticFile(path || 'index.html') || await staticFile('index.html');
  if (!file) { res.writeHead(404); res.end('Appli non compilée : lancez « npm run build ».'); return; }
  const gz = file.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { 'content-type': file.type, 'cache-control': file.cache, vary: 'accept-encoding', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
  res.end(gz ? file.gz : file.body);
});

// ---- Salons ----
const rooms = new Map();
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function broadcast(room, flash = null) {
  room.seats.forEach((s, i) => {
    if (!s || !room.st) return;
    const ready = room.plans.map(Boolean);
    send(s.ws, { t: 'state', room: room.code, view: viewFor(room.st, i, { flash, ready: { me: ready[i], foe: ready[1 - i] },
      names: room.seats.map(x => x && x.name), connected: room.seats.map(x => !!(x && x.ws && x.ws.readyState === 1)),
      badges: room.seats.map(x => x && x.badge), reward: room.rewards ? room.rewards[i] : null }) });
  });
}
function lobby(room) {
  room.seats.forEach((s, i) => s && send(s.ws, { t: 'lobby', room: room.code, seat: i, token: s.token, names: room.seats.map(x => x && x.name) }));
}
// Chaque joueur joue le deck enregistré sur son compte au moment où la partie (ou la revanche) commence.
function startMatch(room) {
  const decks = room.seats.map(s => { const acc = accounts.byToken(s.auth), d = acc && activeDeck(acc); return d && !deckError(d, acc) ? d : s.deck; });
  room.decks = decks.map(d => d.cards);
  room.st = newGame(decks[0], decks[1], room.seats.map(s => s.name), { generals: decks.map(d => d.general) });
  startTurn(room.st); room.st.phase = 'plan';
  room.plans = [null, null]; room.rematch = [false, false]; room.rewards = null;
  room.seats.forEach(s => { const acc = accounts.byToken(s.auth); if (acc) s.badge = accounts.progress.badge(acc); });
  broadcast(room);
}
async function resolve(room) {
  room.busy = true;
  const plans = room.plans; room.plans = [null, null];
  await runTurn(room.st, plans, flash => broadcast(room, flash), ms => new Promise(r => setTimeout(r, ms)));
  room.busy = false;
  if (room.st.over && !room.st.recorded) {
    room.st.recorded = true; games.recordPvp(room.st, room.seats.map(s => s.login), room.decks);
    // Récompenses de fin de partie, affichées à chacun sur l'écran de fin.
    const { winner, zones } = room.st.result;
    room.rewards = await Promise.all(room.seats.map(async (s, i) => {
      const acc = accounts.byToken(s.auth); if (!acc) return null;
      return accounts.recordGame(acc, { mode: 'pvp', result: winner === i ? 'win' : winner < 0 ? 'draw' : 'loss', played: room.st.p[i].played,
        general: room.st.p[i].general, sweep: winner === i && zones.every(z => z === i) }).catch(e => { console.error('Récompenses non enregistrées :', e); return null; });
    }));
  }
  broadcast(room);
}

// Un joueur entre dans un salon avec son compte et le deck qui y est enregistré.
function seatFor(ws, msg) {
  const acc = accounts.byToken(msg.auth);
  if (!acc) { send(ws, { t: 'error', msg: 'Session expirée : reconnectez-vous.' }); return null; }
  const deck = activeDeck(acc);
  const err = deck ? deckError(deck, acc) : 'Choisissez d\'abord votre deck de départ.';
  if (err) { send(ws, { t: 'error', msg: err }); return null; }
  return { name: acc.name, login: acc.login, auth: msg.auth, deck, token: randomBytes(12).toString('hex'), ws };
}
function handle(ws, msg) {
  if (msg.t === 'create') {
    const seat = seatFor(ws, msg); if (!seat) return;
    const room = { code: newCode(), seats: [null, null], plans: [null, null], st: null, busy: false, lastActive: Date.now() };
    room.seats[0] = seat;
    rooms.set(room.code, room); ws.room = room; ws.seat = 0; lobby(room); return;
  }
  if (msg.t === 'join') {
    const room = rooms.get(String(msg.room || '').toUpperCase());
    if (!room) return send(ws, { t: 'error', msg: 'Aucune partie avec ce code.' });
    if (room.seats[1]) return send(ws, { t: 'error', msg: 'Cette partie est déjà complète.' });
    const seat = seatFor(ws, msg); if (!seat) return;
    room.seats[1] = seat;
    ws.room = room; ws.seat = 1; lobby(room); startMatch(room); return;
  }
  if (msg.t === 'rejoin') {
    const room = rooms.get(String(msg.room || '').toUpperCase());
    const i = room ? room.seats.findIndex(s => s && s.token === msg.token) : -1;
    if (i < 0) return send(ws, { t: 'gone' });
    room.seats[i].ws = ws; ws.room = room; ws.seat = i;
    if (room.st) broadcast(room); else lobby(room);
    return;
  }
  const room = ws.room; if (!room) return;
  room.lastActive = Date.now();
  if (msg.t === 'plan') {
    if (!room.st || room.busy || room.st.over || room.plans[ws.seat]) return;
    room.plans[ws.seat] = { cards: Array.isArray(msg.cards) ? msg.cards.slice(0, 12) : [], moves: Array.isArray(msg.moves) ? msg.moves.slice(0, 12) : [], general: msg.general ?? null };
    if (room.plans[0] && room.plans[1]) resolve(room); else broadcast(room);
    return;
  }
  if (msg.t === 'rematch') {
    if (!room.st || !room.st.over) return;
    room.rematch[ws.seat] = true;
    if (room.rematch[0] && room.rematch[1]) startMatch(room); else broadcast(room);
    return;
  }
  if (msg.t === 'leave') {
    room.seats.forEach((s, i) => i !== ws.seat && s && send(s.ws, { t: 'left' }));
    rooms.delete(room.code); ws.room = null;
  }
}

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  ws.on('message', data => { try { handle(ws, JSON.parse(data)); } catch (e) { console.error(e); } });
  ws.on('close', () => { const room = ws.room; if (room && room.st) broadcast(room); });
});
setInterval(() => { const now = Date.now(); for (const [code, r] of rooms) if (now - r.lastActive > ROOM_TTL_MS) rooms.delete(code); }, 60_000);

server.listen(PORT, () => console.log(`Serveur de parties sur http://localhost:${PORT}`));
