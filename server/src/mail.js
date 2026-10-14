// Courrier et codes cadeaux. L'administration écrit des messages (annonces, événements, cadeaux) à tous les joueurs ou à quelques-uns,
// avec une récompense facultative à récupérer ; elle crée aussi des codes cadeaux que les joueurs saisissent dans l'appli.
// Document « courrier » : { messages: [{ id, at, kind, title, body, reward, to (null : tous, sinon des identifiants), until (AAAA-MM-JJ ou null),
// newcomers (message à tous : aussi pour les comptes créés après l'envoi) }], notes: identifiants des notes de mise à jour déjà envoyées }.
// Document « codes » : { codes: [{ code, label, reward, max (0 : sans limite), uses, until, at, off }] }.
// Compte : mail = { read, got, hidden } (identifiants de messages lus, récompenses récupérées, messages supprimés), redeemed = codes déjà utilisés.
import { randomBytes } from 'node:crypto';
import { OWNABLE, today } from '@jeu/engine/collection';
import { CARDS, GENERALS } from '@jeu/engine';
import { ARTS } from '@jeu/engine/arts';
import { HttpError } from './accounts.js';
import { msg, tr } from '@jeu/engine/i18n';
import { langOf, inLang } from './i18n.js';

const KINDS = { news: msg('Annonce'), event: msg('Événement'), gift: msg('Cadeau') };
// Ce qu'une récompense peut donner, avec le plafond accepté par /admin.
const AMOUNTS = { shards: 1_000_000, prisms: 100_000, xp: 1_000_000, boosters: 100, chests: 100 };
const MAX_MESSAGES = 200, MAX_CODES = 500;
// Codes faux : au-delà de MAX_TRIES en une heure, le joueur doit attendre.
const MAX_TRIES = 10, TRY_WINDOW_MS = 60 * 60 * 1000;
const CODE_RE = /^[A-Z0-9-]{3,24}$/;
const cleanCode = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const live = x => !x.until || today() <= x.until;

// Récompense envoyée par /admin : seuls les champs non nuls sont gardés. Renvoie null si elle ne donne rien.
function cleanReward(r = {}) {
  const out = {};
  for (const [k, max] of Object.entries(AMOUNTS)) {
    if (r[k] === undefined || r[k] === null || r[k] === '' || Number(r[k]) === 0) continue;
    const n = Number(r[k]);
    if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, `Récompense ${k} : un entier entre 0 et ${max}.`);
    out[k] = n;
  }
  if (r.card) { if (!OWNABLE.includes(r.card)) throw new HttpError(400, 'Carte inconnue.'); out.card = r.card; }
  if (r.art) { if (!ARTS[r.art]) throw new HttpError(400, 'Art inconnu.'); out.art = r.art; }
  return Object.keys(out).length ? out : null;
}
const cleanUntil = u => {
  if (!u) return null;
  if (!DATE_RE.test(String(u))) throw new HttpError(400, 'Date de fin : AAAA-MM-JJ.');
  return String(u);
};
const rewardLabel = r => [r.shards && `${r.shards} Éclats`, r.prisms && `${r.prisms} Prismes`, r.xp && `${r.xp} XP`,
  r.boosters && `${r.boosters} booster${r.boosters > 1 ? 's' : ''}`, r.chests && `${r.chests} coffre${r.chests > 1 ? 's' : ''} d'arts`,
  r.card && (CARDS[r.card] || GENERALS[r.card])?.name, r.art && `art ${ARTS[r.art].name}`].filter(Boolean).join(', ');

// notify(logins) : prévient les joueurs connectés qu'un message est arrivé (connexion de présence des amis).
export function createMail(store, accounts, { notify = () => {} } = {}) {
  const messages = () => store.doc('courrier')?.messages || [];
  // Messages des événements temporaires en cours (events.js), ajoutés à ceux de l'administration le temps de l'événement.
  const withEvents = () => [...messages(), ...accounts.progress.events.mails()];
  const codes = () => store.doc('codes')?.codes || [];
  const box = a => (a.mail ||= { read: [], got: [], hidden: [] });

  // Messages que voit un joueur : à tous ou à lui, pas encore expirés ni supprimés, du plus récent au plus ancien.
  // newcomers false : un message à tous ne va qu'aux comptes qui existaient à l'envoi.
  const reaches = (a, m) => (m.to ? m.to.includes(a.login) : m.newcomers !== false || !a.created || a.created <= m.at);
  const mine = a => withEvents().filter(m => reaches(a, m) && live(m) && !box(a).hidden.includes(m.id)).reverse();
  const pending = (a, m) => !!m.reward && !box(a).got.includes(m.id);
  const count = a => (a.starter ? mine(a).filter(m => !box(a).read.includes(m.id) || pending(a, m)).length : 0);
  accounts.setMailCount(count);
  // Messages du jeu (événements) : titleMsg et bodyMsg traduits par l'appli (tField) ; notes de mise à jour traduites par leur texte.
  // Les messages écrits depuis /admin restent tels quels. Rédigés dans la langue du joueur (période des événements).
  const view = a => inLang(a, () => mine(a).map(m => ({ id: m.id, at: m.at, kind: m.kind, kindName: tr(langOf(a), KINDS[m.kind]), title: m.title, body: m.body,
    ...(m.titleMsg ? { titleMsg: m.titleMsg } : {}), ...(m.bodyMsg ? { bodyMsg: m.bodyMsg } : {}), reward: m.reward, until: m.until,
    read: box(a).read.includes(m.id), got: box(a).got.includes(m.id) })));
  const reply = (a, extra = {}) => ({ ...extra, mail: view(a), account: accounts.me(a) });
  const find = (a, id) => { const m = mine(a).find(x => x.id === id); if (!m) throw new HttpError(404, msg('Ce message n\'existe plus.')); return m; };

  async function read(a, { id }) {
    const m = find(a, id);
    if (!box(a).read.includes(m.id)) { box(a).read.push(m.id); await store.put(a); }
    return reply(a);
  }
  // Récupère la récompense d'un message (ou de tous) : renvoie la liste de ce qui a été donné.
  function take(a, m) {
    const card = accounts.giveReward(a, m.reward);
    box(a).got.push(m.id);
    if (!box(a).read.includes(m.id)) box(a).read.push(m.id);
    return { label: m.title, ...(m.titleMsg ? { labelMsg: m.titleMsg } : {}), ...m.reward, ...(card ? { cardShards: card.shards, cardFresh: card.fresh[0] } : {}) };
  }
  async function claim(a, { id }) {
    const m = find(a, id);
    if (!m.reward) throw new HttpError(400, msg('Ce message n\'a pas de récompense.'));
    if (!pending(a, m)) throw new HttpError(409, msg('Récompense déjà récupérée.'));
    const got = [take(a, m)];
    await store.put(a);
    return reply(a, { got });
  }
  async function claimAll(a) {
    const list = mine(a).filter(m => pending(a, m));
    if (!list.length) throw new HttpError(409, msg('Aucune récompense à récupérer.'));
    const got = list.map(m => take(a, m));
    await store.put(a);
    return reply(a, { got });
  }
  // Supprimer un message de sa boîte : seulement une fois sa récompense récupérée.
  async function hide(a, { id }) {
    const m = find(a, id);
    if (pending(a, m)) throw new HttpError(409, msg('Récupérez d\'abord la récompense de ce message.'));
    box(a).hidden.push(m.id);
    await store.put(a);
    return reply(a);
  }

  // ---- Codes cadeaux ----
  const tries = new Map(); // identifiant → dates des codes faux de la dernière heure
  async function redeem(a, { code }) {
    if (!a.starter) throw new HttpError(409, msg('Choisissez d\'abord votre deck de départ.'));
    const now = Date.now(), recent = (tries.get(a.login) || []).filter(t => now - t < TRY_WINDOW_MS);
    if (recent.length >= MAX_TRIES) throw new HttpError(429, msg('Trop de codes incorrects : réessayez dans une heure.'));
    const c = cleanCode(code), all = codes(), x = all.find(k => k.code === c);
    const wrong = m => { tries.set(a.login, [...recent, now]); return new HttpError(404, m); };
    if (!c) throw new HttpError(400, msg('Entrez un code.'));
    if (!x || x.off) throw wrong(msg('Ce code n\'existe pas.'));
    if (!live(x)) throw wrong(msg('Ce code a expiré.'));
    if ((a.redeemed || []).includes(x.code)) throw new HttpError(409, msg('Vous avez déjà utilisé ce code.'));
    if (x.max && x.uses >= x.max) throw new HttpError(409, msg('Ce code a déjà été utilisé autant de fois que prévu.'));
    const card = accounts.giveReward(a, x.reward);
    a.redeemed = [...(a.redeemed || []), x.code];
    x.uses = (x.uses || 0) + 1;
    await store.putDoc('codes', { codes: all });
    await store.put(a);
    return { got: { label: x.label || `Code ${x.code}`, ...(x.label ? {} : { labelMsg: msg('Code {code}', { code: x.code }) }), ...x.reward, ...(card ? { cardShards: card.shards, cardFresh: card.fresh[0] } : {}) }, account: accounts.me(a) };
  }

  // ---- Administration ----
  // Messages avec combien de joueurs les ont lus et ont pris leur récompense ; codes avec leurs utilisations.
  function adminView() {
    const all = store.all().filter(a => a.starter);
    const stat = (m, k) => all.filter(a => a.mail?.[k]?.includes(m.id)).length;
    return {
      messages: messages().slice().reverse().map(m => ({ ...m, kindName: KINDS[m.kind], rewardLabel: m.reward ? rewardLabel(m.reward) : '',
        reach: all.filter(a => reaches(a, m)).length, read: stat(m, 'read'), got: stat(m, 'got'), live: live(m) })),
      codes: codes().slice().reverse().map(c => ({ ...c, rewardLabel: rewardLabel(c.reward), live: live(c) })),
      kinds: KINDS,
    };
  }
  async function send(body) {
    const title = String(body.title || '').trim().slice(0, 80), text = String(body.body || '').trim().slice(0, 2000);
    if (!title) throw new HttpError(400, 'Donnez un titre au message.');
    const kind = KINDS[body.kind] ? body.kind : 'news';
    let to = null;
    if (String(body.to || '').trim()) {
      to = [...new Set(String(body.to).split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))];
      const unknown = to.filter(l => !store.get(l));
      if (unknown.length) throw new HttpError(400, `Compte introuvable : ${unknown.join(', ')}.`);
    }
    const m = { id: randomBytes(6).toString('hex'), at: new Date().toISOString(), kind, title, body: text, reward: cleanReward(body.reward), to, until: cleanUntil(body.until), newcomers: to ? false : body.newcomers !== false };
    await store.putDoc('courrier', { ...store.doc('courrier'), messages: [...messages(), m].slice(-MAX_MESSAGES) });
    notify(to || store.all().map(a => a.login));
    return adminView();
  }
  async function remove({ id }) {
    await store.putDoc('courrier', { ...store.doc('courrier'), messages: messages().filter(m => m.id !== id) });
    return adminView();
  }
  async function createCode(body) {
    const all = codes();
    if (all.length >= MAX_CODES) throw new HttpError(409, `${MAX_CODES} codes au plus : supprimez-en d'abord.`);
    const code = cleanCode(body.code) || randomBytes(5).toString('hex').toUpperCase();
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Code : 3 à 24 caractères parmi A-Z, 0-9 et tiret.');
    if (all.some(c => c.code === code)) throw new HttpError(409, 'Ce code existe déjà.');
    const reward = cleanReward(body.reward);
    if (!reward) throw new HttpError(400, 'Le code doit donner quelque chose.');
    const max = Number(body.max || 0);
    if (!Number.isInteger(max) || max < 0 || max > 1_000_000) throw new HttpError(400, 'Utilisations : un entier positif (0 : sans limite).');
    const c = { code, label: String(body.label || '').trim().slice(0, 60), reward, max, uses: 0, until: cleanUntil(body.until), at: new Date().toISOString(), off: false };
    await store.putDoc('codes', { codes: [...all, c] });
    return { ...adminView(), created: code };
  }
  async function editCode({ code, off, remove: drop }) {
    const all = codes(), c = all.find(k => k.code === code);
    if (!c) throw new HttpError(404, 'Code introuvable.');
    if (off !== undefined) c.off = !!off;
    await store.putDoc('codes', { codes: drop ? all.filter(k => k !== c) : all });
    return adminView();
  }

  // Notes de mise à jour (notes-maj.js) : envoyées à tous une seule fois, au premier démarrage du serveur qui les contient.
  // Seuls les comptes déjà créés les reçoivent ; les identifiants envoyés sont retenus dans le document « courrier ».
  async function publishNotes(notes) {
    const doc = store.doc('courrier') || {}, sent = doc.notes || [];
    const fresh = notes.filter(n => !sent.includes(n.id));
    if (!fresh.length) return;
    const at = new Date().toISOString();
    const added = fresh.map(n => ({ id: n.id, at, kind: 'news', title: n.title, body: n.body.slice(0, 2000), reward: null, to: null, until: null, newcomers: false }));
    await store.putDoc('courrier', { ...doc, messages: [...messages(), ...added].slice(-MAX_MESSAGES), notes: [...sent, ...fresh.map(n => n.id)] });
    console.log(`Notes de mise à jour envoyées : ${fresh.map(n => n.id).join(', ')}.`);
  }

  return {
    publishNotes,
    routes: {
      'GET /api/mail': a => reply(a),
      'POST /api/mail/read': (a, body) => read(a, body || {}),
      'POST /api/mail/claim': (a, body) => claim(a, body || {}),
      'POST /api/mail/claim-all': a => claimAll(a),
      'POST /api/mail/hide': (a, body) => hide(a, body || {}),
      'POST /api/redeem': (a, body) => redeem(a, body || {}),
      'GET /api/admin/mail': () => adminView(),
      'POST /api/admin/mail': (_, body) => send(body || {}),
      'POST /api/admin/mail/delete': (_, body) => remove(body || {}),
      'POST /api/admin/codes': (_, body) => createCode(body || {}),
      'POST /api/admin/codes/edit': (_, body) => editCode(body || {}),
    },
  };
}
