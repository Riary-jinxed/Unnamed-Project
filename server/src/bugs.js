// Signalements de bugs : un joueur décrit un problème depuis son courrier, avec une capture d'écran facultative ;
// l'appli y joint d'elle-même la version, l'appareil, l'écran et les dernières erreurs. L'équipe les lit dans l'onglet Signalements de /admin.
// Document « signalements » : { reports: [{ id, at, login, name, kind, text, context, shot (capture jointe), status ('new', 'seen', 'done'), note }] }.
// Chaque capture est un document à part (« signalement-img-<id> » : { data }), lu seulement quand l'équipe l'ouvre.
import { randomBytes } from 'node:crypto';
import { HttpError } from './accounts.js';
import { msg } from '@jeu/engine/i18n';

export const BUG_KINDS = { bug: 'Bug ou plantage', display: 'Affichage', rules: 'Règles d\'une carte ou d\'une partie', account: 'Compte, achats ou récompenses', other: 'Autre' };
const STATUSES = { new: 'Nouveau', seen: 'Vu', done: 'Réglé' };
const MAX_REPORTS = 300, TEXT_MIN = 10, TEXT_MAX = 2000;
// Capture réduite par l'appli (JPEG ou WebP) : la requête entière reste sous la limite de 100 ko de l'API.
const SHOT_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/, SHOT_MAX = 90_000;
// Au plus MAX_PER_HOUR signalements par joueur et par heure.
const MAX_PER_HOUR = 5, HOUR_MS = 60 * 60 * 1000;
const shotKey = id => `signalement-img-${id}`;

// Contexte envoyé par l'appli : seuls des champs connus, en texte court.
const str = (v, n) => (v === undefined || v === null ? null : String(v).slice(0, n));
function cleanContext(c = {}) {
  const out = {
    version: str(c.version, 60), ua: str(c.ua, 300), platform: str(c.platform, 60), lang: str(c.lang, 12),
    screen: str(c.screen, 40), viewport: str(c.viewport, 40), dpr: Number.isFinite(+c.dpr) ? +c.dpr : null,
    touch: !!c.touch, standalone: !!c.standalone, online: c.online !== false, page: str(c.page, 40), theme: str(c.theme, 40),
    reducedMotion: !!c.reducedMotion,
    errors: Array.isArray(c.errors) ? c.errors.slice(-5).map(e => ({ at: str(e?.at, 30), text: str(e?.text, 400) })) : [],
  };
  return out;
}

export function createBugs(store) {
  const reports = () => store.doc('signalements')?.reports || [];
  const save = list => store.putDoc('signalements', { reports: list });
  const sent = new Map(); // identifiant → dates des signalements de la dernière heure

  async function report(a, body = {}) {
    const now = Date.now(), recent = (sent.get(a.login) || []).filter(x => now - x < HOUR_MS);
    if (recent.length >= MAX_PER_HOUR) throw new HttpError(429, msg('Vous avez déjà envoyé plusieurs signalements : réessayez dans une heure.'));
    const text = String(body.text || '').trim().slice(0, TEXT_MAX);
    if (text.length < TEXT_MIN) throw new HttpError(400, msg('Décrivez le problème en quelques mots.'));
    const shot = body.shot ? String(body.shot) : null;
    if (shot && (shot.length > SHOT_MAX || !SHOT_RE.test(shot))) throw new HttpError(400, msg('Capture d\'écran invalide ou trop lourde.'));
    const r = { id: randomBytes(6).toString('hex'), at: new Date().toISOString(), login: a.login, name: a.name, kind: Object.hasOwn(BUG_KINDS, String(body.kind)) ? String(body.kind) : 'bug',
      text, context: { ...cleanContext(body.context), server: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null }, shot: !!shot, status: 'new', note: '' };
    if (shot) await store.putDoc(shotKey(r.id), { data: shot });
    const list = [...reports(), r], dropped = list.slice(0, Math.max(0, list.length - MAX_REPORTS));
    await save(list.slice(-MAX_REPORTS));
    await Promise.all(dropped.filter(x => x.shot).map(x => store.removeDoc(shotKey(x.id))));
    sent.set(a.login, [...recent, now]);
    return { ok: true };
  }

  // ---- Administration ----
  const adminView = () => {
    const list = reports().slice().reverse();
    return { reports: list, kinds: BUG_KINDS, statuses: STATUSES, fresh: list.filter(r => r.status === 'new').length };
  };
  const find = id => { const r = reports().find(x => x.id === id); if (!r) throw new HttpError(404, 'Signalement introuvable.'); return r; };
  function shotOf(id) {
    const r = find(id);
    const doc = r.shot && store.doc(shotKey(id));
    if (!doc) throw new HttpError(404, 'Pas de capture pour ce signalement.');
    return { shot: doc.data };
  }
  async function edit({ id, status, note }) {
    const list = reports(), r = list.find(x => x.id === id);
    if (!r) throw new HttpError(404, 'Signalement introuvable.');
    if (status !== undefined) { if (!STATUSES[status]) throw new HttpError(400, 'État inconnu.'); r.status = status; }
    if (note !== undefined) r.note = String(note || '').trim().slice(0, 1000);
    await save(list);
    return adminView();
  }
  async function remove({ id }) {
    const r = find(id);
    await save(reports().filter(x => x.id !== id));
    if (r.shot) await store.removeDoc(shotKey(id));
    return adminView();
  }

  return {
    routes: {
      'POST /api/bugs': (a, body) => report(a, body || {}),
      'GET /api/admin/bugs': () => adminView(),
      'GET /api/admin/bugs/shot': (_, __, ___, url) => shotOf(url.searchParams.get('id')),
      'POST /api/admin/bugs/edit': (_, body) => edit(body || {}),
      'POST /api/admin/bugs/delete': (_, body) => remove(body || {}),
    },
  };
}
