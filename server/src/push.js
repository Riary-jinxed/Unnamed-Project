// Notifications push (Web Push) : le joueur les active dans son profil, appareil par appareil, et choisit les sortes qu'il reçoit.
// Compte : push = { subs: [{ endpoint, keys: { p256dh, auth }, at }], off: [sortes coupées], daily (jour du dernier rappel envoyé) }.
// Clés VAPID : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY si elles sont définies, sinon créées une fois et rangées dans le document « push ».
// Le même document note les envois planifiés déjà faits (début d'événement, fin de saison), pour qu'ils ne partent qu'une fois.
// Un joueur qui a l'appli ouverte (connexion de présence, friends.js) ne reçoit rien : l'appli le prévient déjà.
import webpush from 'web-push';
import { today } from '@jeu/engine/collection';
import { seasonId, seasonDaysLeft } from '@jeu/engine/ranked';
import { EVENT_EFFECTS, multLabel } from '@jeu/engine/events';
import { HttpError } from './accounts.js';
import { msg, tr, trMsg } from '@jeu/engine/i18n';
import { langOf, withLang } from './i18n.js';
import { seasonMsg } from './progress.js';

export const PUSH_KINDS = {
  daily: { label: msg('Missions et récompenses du jour'), hint: msg('Un rappel en fin d\'après-midi si vous n\'êtes pas encore venu : nouvelles missions, récompense de connexion, coffres à ouvrir.') },
  events: { label: msg('Événements et Boss mondial'), hint: msg('Le début d\'un événement (double XP, bonus d\'Éclats…) ou l\'arrivée d\'un Boss mondial.') },
  social: { label: msg('Amis et clan'), hint: msg('Une demande d\'ami ou d\'entrée dans votre clan, une demande acceptée.') },
  news: { label: msg('Nouveautés du jeu'), hint: msg('Une mise à jour majeure, un nouveau set ou l\'annonce du prochain.') },
  season: { label: msg('Fin de saison'), hint: msg('Le dernier jour de la saison classée et du passe de saison.') },
};
// Heures (de Paris) des envois planifiés.
const HOUR = { events: 10, season: 12, daily: 18 };
const MAX_SUBS = 5;
// Rappel du jour : seulement aux joueurs venus ces derniers jours, pour ne pas relancer sans fin un compte abandonné.
const DAILY_ACTIVE_DAYS = 14;
const TICK_MS = 5 * 60 * 1000;
const hourOf = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).find(p => p.type === 'hour').value);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// isOnline(login) : le joueur a l'appli ouverte. events : les événements (server/src/events.js).
export function createPush(store, accounts, { isOnline = () => false, events } = {}) {
  let doc = store.doc('push') || {};
  const keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : doc.keys || webpush.generateVAPIDKeys();
  if (!process.env.VAPID_PUBLIC_KEY && !doc.keys) { doc = { ...doc, keys }; store.putDoc('push', doc).catch(e => console.error('Clés de notification non enregistrées :', e)); }
  // Le service de notifications d'Apple exige un contact valable : l'adresse du site (Render la donne) ou VAPID_SUBJECT.
  const subject = process.env.VAPID_SUBJECT || process.env.RENDER_EXTERNAL_URL || 'mailto:notifications@example.com';
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  const state = a => (a.push ||= { subs: [], off: [] });
  const wants = (a, kind) => !!a.push?.subs?.length && !a.push.off?.includes(kind) && !a.disabled;
  const view = a => { const p = state(a), lang = langOf(a);
    return { publicKey: keys.publicKey, devices: p.subs.length, kinds: Object.entries(PUSH_KINDS).map(([id, k]) => ({ id, label: tr(lang, k.label), hint: tr(lang, k.hint), on: !p.off.includes(id) })) }; };

  // Envoie une notification à tous les appareils du joueur. Un appareil que le service dit disparu (404, 410) est oublié.
  // note = { title, body, tag, open } ; open : l'écran que l'appli ouvre quand on touche la notification.
  // title et body : textes français ou msg(modèle, variables), traduits dans la langue du joueur (a.lang). note peut aussi être
  // une fonction (langue) => { … }, appelée pour chaque joueur dans sa langue (textes composés par le moteur).
  async function send(login, kind, note, { evenOnline = false } = {}) {
    const a = store.get(login);
    if (!a || !wants(a, kind) || (!evenOnline && isOnline(login))) return 0;
    const lang = langOf(a), m = typeof note === 'function' ? withLang(lang, () => note(lang)) : note;
    const payload = JSON.stringify({ kind, ...m, title: trMsg(lang, m.title), body: trMsg(lang, m.body) });
    // Sujet : une notification en attente est remplacée par la suivante du même sujet (32 caractères au plus, lettres, chiffres, - et _).
    const topic = String(m.tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined;
    let sent = 0, gone = false;
    await Promise.all(a.push.subs.map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 12 * 3600, urgency: 'normal', topic })
      .then(() => { sent++; })
      .catch(e => { if (e.statusCode === 404 || e.statusCode === 410) { s.gone = true; gone = true; } else console.error(`Notification non envoyée à ${login} :`, e.statusCode || e.message); })));
    if (gone) { a.push.subs = a.push.subs.filter(s => !s.gone); await store.put(a).catch(() => {}); }
    if (sent && PUSH_KINDS[kind]) accounts.activity.count(`pushSent:${kind}`);
    return sent;
  }
  const sendMany = (logins, kind, note) => Promise.all([...new Set(logins)].map(l => send(l, kind, note))).then(n => n.reduce((x, y) => x + y, 0));
  // Tous les joueurs qui ont activé cette sorte (début d'événement, Boss mondial, fin de saison).
  const broadcast = (kind, note) => sendMany(store.all().filter(a => wants(a, kind)).map(a => a.login), kind, note);

  // ---- Routes ----
  async function subscribe(a, { sub }) {
    const endpoint = String(sub?.endpoint || ''), p256dh = String(sub?.keys?.p256dh || ''), auth = String(sub?.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) throw new HttpError(400, msg('Abonnement aux notifications invalide.'));
    // Un appareil ne sert qu'à un compte : celui qui s'y est connecté en dernier.
    for (const b of store.all()) if (b !== a && b.push?.subs?.some(s => s.endpoint === endpoint)) { b.push.subs = b.push.subs.filter(s => s.endpoint !== endpoint); await store.put(b); }
    const p = state(a);
    p.subs = [...p.subs.filter(s => s.endpoint !== endpoint), { endpoint, keys: { p256dh, auth }, at: new Date().toISOString() }].slice(-MAX_SUBS);
    await store.put(a);
    return view(a);
  }
  async function unsubscribe(a, { endpoint }) {
    const p = state(a);
    p.subs = p.subs.filter(s => s.endpoint !== String(endpoint || ''));
    await store.put(a);
    return view(a);
  }
  async function setKinds(a, { kinds }) {
    if (!kinds || typeof kinds !== 'object') throw new HttpError(400, msg('Réglages invalides.'));
    const p = state(a);
    p.off = Object.keys(PUSH_KINDS).filter(id => (id in kinds ? !kinds[id] : p.off.includes(id)));
    await store.put(a);
    return view(a);
  }
  async function test(a) {
    if (!state(a).subs.length) throw new HttpError(409, msg('Activez d\'abord les notifications sur cet appareil.'));
    const n = await send(a.login, 'test', { title: msg('Notifications activées'), body: msg('Vous serez prévenu ici, même appli fermée.'), tag: 'test', open: 'home' }, { evenOnline: true });
    if (!n) throw new HttpError(502, msg('La notification n\'est pas partie : réessayez dans un moment.'));
    return { ...view(a), msg: tr(langOf(a), 'Notification envoyée.') };
  }

  // ---- Envois planifiés ----
  // Chaque envoi planifié a une clé, notée une fois fait ; les clés de plus de 60 jours sont oubliées.
  async function once(key, run) {
    if (doc.sent?.[key]) return;
    doc = { ...doc, sent: { ...Object.fromEntries(Object.entries(doc.sent || {}).filter(([, d]) => daysBetween(d, today()) < 60)), [key]: today() } };
    await store.putDoc('push', doc);
    const n = await run();
    console.log(`Notification « ${key} » envoyée à ${n} appareil(s).`);
  }
  // Rappel du jour : le joueur n'a pas encore récupéré la récompense de connexion du jour.
  function dailyMsg(a, day) {
    if (a.calendar?.month === seasonId() && (a.calendar.days || []).includes(Number(day.slice(8)))) return null;
    const last = (a.activeDays || []).at(-1);
    if (!last || daysBetween(last, day) > DAILY_ACTIVE_DAYS) return null;
    const chests = a.freeChests || 0;
    return { title: msg('Vos récompenses du jour vous attendent'), tag: 'daily', open: 'calendar',
      body: chests ? msg(chests > 1 ? 'Nouvelles missions et récompense de connexion à récupérer, et {n} coffres d\'arts à ouvrir.' : 'Nouvelles missions et récompense de connexion à récupérer, et {n} coffre d\'arts à ouvrir.', { n: chests })
        : msg('Nouvelles missions et récompense de connexion à récupérer.') };
  }
  async function tick(now = new Date()) {
    const day = today(now), hour = hourOf(now);
    if (events && hour >= HOUR.events) {
      for (const ev of events.view(day).live.filter(e => e.from === day))
        // Texte de chaque joueur dans sa langue : nom de l'événement, période et effet traduits (période composée par le moteur).
        await once(`ev-${ev.id}-${ev.from}`, () => broadcast('events', lang => { const name = tr(lang, ev.name), o = events.view(day).live.find(e => e.id === ev.id) || ev;
          return { title: msg('{name} : c\'est parti !', { name: `${name[0].toUpperCase()}${name.slice(1)}` }),
            body: msg('{mult} sur les {what}, {period}.', { mult: tr(lang, multLabel(ev.mult)), what: tr(lang, EVENT_EFFECTS[ev.effect].what), period: o.period }), tag: `ev-${ev.id}`, open: 'home' }; }));
    }
    if (hour >= HOUR.season && seasonDaysLeft(now) === 1) {
      const s = seasonId(now);
      await once(`saison-${s}`, () => broadcast('season', { title: msg('Dernier jour de la saison {season}', { season: seasonMsg(s) }),
        body: msg('Elle se termine ce soir à minuit : grimpez encore d\'un rang et finissez votre passe de saison.'), tag: 'season', open: 'ranked' }));
    }
    if (hour >= HOUR.daily) {
      for (const a of store.all()) {
        if (!wants(a, 'daily') || a.push.daily === day || isOnline(a.login)) continue;
        const note = dailyMsg(a, day);
        a.push.daily = day;
        await store.put(a);
        if (note) await send(a.login, 'daily', note);
      }
    }
  }
  function start() {
    const run = () => tick().catch(e => console.error('Notifications planifiées :', e));
    run(); setInterval(run, TICK_MS).unref();
  }

  return { send, sendMany, broadcast, tick, start, publicKey: keys.publicKey,
    routes: {
      'GET /api/push': a => view(a),
      'POST /api/push/subscribe': (a, body) => subscribe(a, body || {}),
      'POST /api/push/unsubscribe': (a, body) => unsubscribe(a, body || {}),
      'POST /api/push/kinds': (a, body) => setKinds(a, body || {}),
      'POST /api/push/test': a => test(a),
    } };
}
