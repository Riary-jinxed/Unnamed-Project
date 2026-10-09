// Amis : demandes par pseudo ou identifiant, statut en ligne, défis entre amis.
// Les listes sont rangées dans les comptes (friends, friendsIn, friendsOut : identifiants). La présence et les défis
// passent par une connexion WebSocket que l'appli garde ouverte tant que le joueur est connecté (message « hello »).
import { createHash, randomBytes } from 'node:crypto';
import { deckError } from '@jeu/engine/collection';
import { HttpError } from './accounts.js';

const MAX_FRIENDS = 100;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const STATUS_ORDER = { online: 0, game: 1, off: 2 };
const list = (a, k) => (a[k] ||= []);
const drop = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

// rooms : ce que index.js offre des salons. playing(login) : assis dans un salon et connecté ;
// inviteRoom(logins) : crée un salon réservé à ces deux joueurs et renvoie son code ; abortInvite(code, login) : l'annule.
export function createFriends(store, accounts, rooms) {
  const online = new Map(); // identifiant → connexions de présence ouvertes
  const challenges = new Map(); // id → { id, from, to, at }
  const notify = (login, msg) => { for (const ws of online.get(login) || []) send(ws, msg); };
  const status = login => (rooms.playing(login) ? 'game' : online.has(login) ? 'online' : 'off');
  // Les images de profil sont lourdes : la liste n'en donne qu'une empreinte, l'appli les demande quand elle change.
  const avatarKey = a => (a.avatar ? createHash('sha1').update(a.avatar).digest('hex').slice(0, 12) : null);
  const player = login => {
    const a = store.get(login); if (!a) return null;
    const b = accounts.progress.badge(a);
    return { login, name: a.name, level: b.level, title: b.title, frame: b.frame, avatar: avatarKey(a), status: status(login) };
  };
  const nameOf = login => store.get(login)?.name || login;
  const challengeView = c => ({ id: c.id, from: { login: c.from, name: nameOf(c.from) }, to: { login: c.to, name: nameOf(c.to) } });
  function view(a) {
    const players = k => list(a, k).map(player).filter(Boolean);
    const friends = players('friends').sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || x.name.localeCompare(y.name, 'fr'));
    const mine = [...challenges.values()];
    return { friends, incoming: players('friendsIn'), outgoing: players('friendsOut'),
      challengeIn: mine.filter(c => c.to === a.login).map(challengeView)[0] || null, challengeOut: mine.filter(c => c.from === a.login).map(challengeView)[0] || null };
  }

  // Un ami se trouve par son identifiant ou par son pseudo (s'il n'est porté que par un joueur).
  function find(me, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) throw new HttpError(400, 'Entrez le pseudo ou l\'identifiant de votre ami.');
    let b = store.get(q);
    if (!b) {
      const same = store.all().filter(x => !x.disabled && String(x.name || '').trim().toLowerCase() === q);
      if (same.length > 1) throw new HttpError(409, 'Plusieurs joueurs portent ce pseudo : demandez-lui son identifiant.');
      b = same[0];
    }
    if (!b || b.disabled) throw new HttpError(404, 'Aucun joueur avec ce pseudo ou cet identifiant.');
    if (b.login === me.login) throw new HttpError(400, 'C\'est votre propre compte.');
    return b;
  }
  async function save(...accs) { await Promise.all(accs.filter(Boolean).map(x => store.put(x))); }

  async function add(a, { name }) {
    const b = find(a, name);
    if (list(a, 'friends').includes(b.login)) throw new HttpError(409, `${b.name} est déjà dans vos amis.`);
    if (list(a, 'friendsOut').includes(b.login)) throw new HttpError(409, `Demande déjà envoyée à ${b.name}.`);
    // Il vous avait déjà demandé : vous devenez amis.
    if (list(a, 'friendsIn').includes(b.login)) return accept(a, { login: b.login });
    if (a.friends.length + a.friendsOut.length >= MAX_FRIENDS) throw new HttpError(409, `${MAX_FRIENDS} amis au plus.`);
    a.friendsOut.push(b.login); list(b, 'friendsIn').push(a.login);
    await save(a, b);
    notify(b.login, { t: 'friends', msg: `${a.name} vous demande en ami.` });
    return { ...view(a), msg: `Demande envoyée à ${b.name}.` };
  }
  async function accept(a, { login }) {
    const b = store.get(String(login || ''));
    if (!b || !list(a, 'friendsIn').includes(b.login)) throw new HttpError(404, 'Cette demande n\'existe plus.');
    for (const [x, y] of [[a, b], [b, a]]) {
      drop(list(x, 'friendsIn'), y.login); drop(list(x, 'friendsOut'), y.login);
      if (!list(x, 'friends').includes(y.login)) x.friends.push(y.login);
    }
    await save(a, b);
    notify(b.login, { t: 'friends', msg: `${a.name} a accepté votre demande d'ami.` });
    return { ...view(a), msg: `${b.name} est maintenant votre ami.` };
  }
  // Refuser une demande, annuler la sienne ou retirer un ami : le lien disparaît des deux côtés.
  async function remove(a, { login }) {
    login = String(login || '');
    const b = store.get(login);
    for (const k of ['friends', 'friendsIn', 'friendsOut']) { drop(list(a, k), login); if (b) drop(list(b, k), a.login); }
    for (const c of challenges.values()) if ([c.from, c.to].includes(a.login) && [c.from, c.to].includes(login)) endChallenge(c);
    await save(a, b);
    if (b) notify(b.login, { t: 'friends' });
    return view(a);
  }
  // Images de profil des amis et des demandes, pour l'affichage de la liste.
  function avatars(a) {
    const out = {};
    for (const login of [...list(a, 'friends'), ...list(a, 'friendsIn'), ...list(a, 'friendsOut')]) { const b = store.get(login); if (b?.avatar) out[login] = b.avatar; }
    return { avatars: out };
  }

  // ---- Présence ----
  // Les amis d'un joueur sont prévenus quand il se connecte, se déconnecte, entre en partie ou en sort.
  function changed(login) { for (const f of store.get(login)?.friends || []) notify(f, { t: 'friends' }); }
  function hello(ws, auth) {
    const a = accounts.byToken(auth);
    if (!a) { send(ws, { t: 'bye' }); return; }
    if (ws.presence) return;
    ws.presence = a.login;
    let set = online.get(a.login);
    if (!set) { online.set(a.login, set = new Set()); changed(a.login); }
    set.add(ws);
    send(ws, { t: 'hello' });
    for (const c of challenges.values()) if (c.to === a.login) send(ws, { t: 'challenge', ...challengeView(c) });
  }
  function gone(ws) {
    const login = ws.presence, set = login && online.get(login); if (!set) return;
    set.delete(ws);
    if (!set.size) { online.delete(login); changed(login); }
  }

  // ---- Défis ----
  // Un défi attend la réponse de l'ami ; accepté, il ouvre un salon réservé aux deux, où chacun entre avec le deck de son choix.
  function endChallenge(c, toFrom, toTo) {
    challenges.delete(c.id);
    notify(c.from, { t: 'challenge-gone', id: c.id, ...(toFrom ? { msg: toFrom } : {}) });
    notify(c.to, { t: 'challenge-gone', id: c.id, ...(toTo ? { msg: toTo } : {}) });
  }
  const hasPlayableDeck = a => (a.decks || []).some(d => !deckError(d, a));
  function challenge(ws, to) {
    const a = store.get(ws.presence); if (!a) return;
    const b = store.get(String(to || '')), pending = [...challenges.values()];
    const err = !b || !list(a, 'friends').includes(b.login) ? 'Ce joueur n\'est pas dans vos amis.'
      : rooms.playing(a.login) ? 'Vous êtes déjà dans une partie.'
      : !hasPlayableDeck(a) ? 'Aucun de vos decks n\'est jouable.'
      : !online.has(b.login) ? `${b.name} n'est pas connecté.`
      : rooms.playing(b.login) ? `${b.name} est déjà en partie.`
      : pending.some(c => c.from === a.login) ? 'Vous avez déjà lancé un défi : attendez la réponse ou annulez-le.'
      : pending.some(c => c.to === b.login || c.from === b.login) ? `${b.name} a déjà un défi en cours.`
      : null;
    if (err) { send(ws, { t: 'challenge-error', msg: err }); return; }
    const c = { id: randomBytes(6).toString('hex'), from: a.login, to: b.login, at: Date.now() };
    challenges.set(c.id, c);
    notify(b.login, { t: 'challenge', ...challengeView(c) });
    notify(a.login, { t: 'challenge-sent', ...challengeView(c) });
  }
  function answer(ws, { id, accept: yes }) {
    const c = challenges.get(id);
    if (!c || c.to !== ws.presence) { send(ws, { t: 'challenge-gone', id, msg: 'Ce défi n\'est plus valable.' }); return; }
    const a = store.get(c.from), b = store.get(c.to);
    if (!yes) { endChallenge(c, `${nameOf(c.to)} a refusé votre défi.`); return; }
    if (!a || !online.has(c.from) || rooms.playing(c.from)) { endChallenge(c, null, `${nameOf(c.from)} n'est plus disponible.`); return; }
    if (!hasPlayableDeck(b)) { send(ws, { t: 'challenge-error', msg: 'Aucun de vos decks n\'est jouable : complétez-en un d\'abord.' }); return; }
    challenges.delete(c.id);
    const room = rooms.inviteRoom([c.from, c.to]);
    notify(c.from, { t: 'challenge-ready', id: c.id, room, foe: b.name });
    notify(c.to, { t: 'challenge-ready', id: c.id, room, foe: a.name });
  }
  function cancel(ws, { id }) {
    const c = challenges.get(id);
    if (c && c.from === ws.presence) endChallenge(c, null, `${nameOf(c.from)} a annulé son défi.`);
  }
  setInterval(() => {
    const now = Date.now();
    for (const c of challenges.values()) if (now - c.at > CHALLENGE_TTL_MS) endChallenge(c, `${nameOf(c.to)} n'a pas répondu à votre défi.`, 'Le défi a expiré.');
  }, 10_000).unref();

  // Messages WebSocket de présence et de défi. Renvoie true si le message a été traité ici.
  function handle(ws, msg) {
    if (msg.t === 'hello') hello(ws, msg.auth);
    else if (!ws.presence && String(msg.t).startsWith('challenge')) return true;
    else if (msg.t === 'challenge') challenge(ws, msg.to);
    else if (msg.t === 'challenge-answer') answer(ws, msg);
    else if (msg.t === 'challenge-cancel') cancel(ws, msg);
    else if (msg.t === 'challenge-abort') rooms.abortInvite(String(msg.room || ''), ws.presence);
    else return false;
    return true;
  }

  return {
    handle, gone, changed, notify,
    routes: {
      'GET /api/friends': a => view(a),
      'GET /api/friends/avatars': a => avatars(a),
      'POST /api/friends/add': (a, body) => add(a, body || {}),
      'POST /api/friends/accept': (a, body) => accept(a, body || {}),
      'POST /api/friends/remove': (a, body) => remove(a, body || {}),
    },
  };
}
