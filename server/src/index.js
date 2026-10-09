// Serveur de parties : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées.
// Sert aussi l'appli web compilée (client/dist) pour n'avoir qu'un seul service à héberger.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { newGame, startTurn, runTurn, viewFor } from '@jeu/engine';
import { deckError } from '@jeu/engine/collection';
import { openStore } from './store.js';
import { createAccounts, apiHandler } from './accounts.js';

const PORT = +process.env.PORT || 8787;
const DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url));
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const accounts = createAccounts(await openStore());
await accounts.ready;
const api = apiHandler(accounts, process.env.ADMIN_KEY || '');

// ---- API et fichiers statiques ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.end('ok'); return; }
  if (await api(req, res, url)) return;
  if (url.pathname === '/admin') url.pathname = '/admin.html';
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) { res.writeHead(400); res.end(); return; }
  for (const candidate of [path || 'index.html', 'index.html']) {
    try {
      const body = await readFile(join(DIST, candidate));
      res.writeHead(200, { 'content-type': MIME[extname(candidate)] || 'application/octet-stream' });
      res.end(body); return;
    } catch { /* essai suivant */ }
  }
  res.writeHead(404); res.end('Appli non compilée : lancez « npm run build ».');
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
      names: room.seats.map(x => x && x.name), connected: room.seats.map(x => !!(x && x.ws && x.ws.readyState === 1)) }) });
  });
}
function lobby(room) {
  room.seats.forEach((s, i) => s && send(s.ws, { t: 'lobby', room: room.code, seat: i, token: s.token, names: room.seats.map(x => x && x.name) }));
}
// Chaque joueur joue le deck enregistré sur son compte au moment où la partie (ou la revanche) commence.
function startMatch(room) {
  const decks = room.seats.map(s => accounts.byToken(s.auth)?.deck || s.deck);
  room.st = newGame(decks[0], decks[1], room.seats.map(s => s.name), { generals: decks.map(d => d.general) });
  startTurn(room.st); room.st.phase = 'plan';
  room.plans = [null, null]; room.rematch = [false, false];
  broadcast(room);
}
async function resolve(room) {
  room.busy = true;
  const plans = room.plans; room.plans = [null, null];
  await runTurn(room.st, plans, flash => broadcast(room, flash), ms => new Promise(r => setTimeout(r, ms)));
  room.busy = false;
  broadcast(room);
}

// Un joueur entre dans un salon avec son compte et le deck qui y est enregistré.
function seatFor(ws, msg) {
  const acc = accounts.byToken(msg.auth);
  if (!acc) { send(ws, { t: 'error', msg: 'Session expirée : reconnectez-vous.' }); return null; }
  const err = acc.deck ? deckError(acc.deck, acc) : 'Choisissez d\'abord votre deck de départ.';
  if (err) { send(ws, { t: 'error', msg: err }); return null; }
  return { name: acc.name, auth: msg.auth, deck: acc.deck, token: randomBytes(12).toString('hex'), ws };
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
