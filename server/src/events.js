// Événements temporaires (packages/engine/src/events.js) : la liste réglée depuis /admin (document « evenements » = { list }),
// les multiplicateurs appliqués par progress.js, ce que voit le joueur et les routes de l'administration.
import { DEFAULT_EVENTS, EVENT_EFFECTS, EVENT_WHEN, MAX_EVENTS, MULTS, occurrence, isLive, liveEvents, multiplier, daysLeft, dayEnd, periodLabel, multLabel } from '@jeu/engine/events';
import { today } from '@jeu/engine/collection';
import { HttpError } from './accounts.js';
import { msg } from '@jeu/engine/i18n';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function createEvents(store) {
  const list = () => (store.doc('evenements') || {}).list || DEFAULT_EVENTS;
  const mult = (effect, day = today()) => multiplier(list(), effect, day);

  // Pour l'appli : les événements en cours, avec leur période et l'instant où ils finissent (pastilles de l'accueil et leur pop-up).
  function view(day = today()) {
    return { live: liveEvents(list(), day).map(ev => { const o = occurrence(ev, day);
      return { id: ev.id, name: ev.name, effect: ev.effect, mult: ev.mult, from: o.from, to: o.to, period: periodLabel(o), ends: dayEnd(o.to), daysLeft: daysLeft(o, day) }; }) };
  }
  // Un message du courrier par événement en cours (mail.js) : il apparaît au début de la période et disparaît à sa fin.
  // Son identifiant change à chaque période : un week-end double XP lu reste lu, le suivant arrive comme un nouveau message.
  // titleMsg, bodyMsg : les mêmes textes à traduire par l'appli (nom de l'événement, multiplicateur et effet traduits par leur clé).
  const mails = (day = today()) => view(day).live.map(ev => { const fx = EVENT_EFFECTS[ev.effect], ranked = ev.effect === 'ranked', Name = `${ev.name[0].toUpperCase()}${ev.name.slice(1)}`;
    return { id: `ev-${ev.id}-${ev.from}`, at: `${ev.from}T06:00:00.000Z`,
      kind: 'event', title: `${ev.name} : ${multLabel(ev.mult)} ${fx.chip}`, until: ev.to, reward: null, to: null,
      body: `${Name} ${ev.period} : ${multLabel(ev.mult)} sur les ${fx.what}.${ev.effect === 'ranked' ? ' Les défaites ne retirent toujours qu\'une étoile.' : ''} Profitez-en !`,
      titleMsg: msg('{name} : {mult} {chip}', { name: [ev.name], mult: [multLabel(ev.mult)], chip: [fx.chip] }),
      bodyMsg: msg(ranked ? '{name} {period} : {mult} sur les {what}. Les défaites ne retirent toujours qu\'une étoile. Profitez-en !' : '{name} {period} : {mult} sur les {what}. Profitez-en !',
        { name: [Name], period: ev.period, mult: [multLabel(ev.mult)], what: [fx.what] }) }; });

  // ---- /admin ----
  const adminView = () => ({ list: list().map(ev => ({ ...ev, live: isLive(ev), period: occurrence(ev) })), defaults: DEFAULT_EVENTS,
    effects: EVENT_EFFECTS, when: EVENT_WHEN, mults: MULTS, today: today(), custom: !!store.doc('evenements')?.list });
  function clean(ev, i) {
    const where = `Événement ${i + 1}`;
    const name = String(ev.name || '').trim().slice(0, 60);
    if (!name) throw new HttpError(400, `${where} : il faut un nom.`);
    if (!EVENT_EFFECTS[ev.effect]) throw new HttpError(400, `${where} : bonus inconnu.`);
    if (!EVENT_WHEN[ev.when]) throw new HttpError(400, `${where} : période inconnue.`);
    const m = Number(ev.mult);
    if (!MULTS.includes(m)) throw new HttpError(400, `${where} : multiplicateur ${MULTS.join(', ')}.`);
    const out = { id: String(ev.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || `ev-${Date.now().toString(36)}-${i}`, name, effect: ev.effect, mult: m, when: ev.when, on: !!ev.on };
    if (ev.when === 'dates') {
      if (!DAY.test(ev.from || '') || !DAY.test(ev.to || '')) throw new HttpError(400, `${where} : dates de début et de fin requises.`);
      if (ev.to < ev.from) throw new HttpError(400, `${where} : la fin est avant le début.`);
      Object.assign(out, { from: ev.from, to: ev.to });
    }
    return out;
  }
  async function save(body) {
    if (body.reset) { await store.putDoc('evenements', {}); return adminView(); }
    if (!Array.isArray(body.list) || body.list.length > MAX_EVENTS) throw new HttpError(400, `Une liste de ${MAX_EVENTS} événements au plus.`);
    const out = body.list.map(clean);
    if (new Set(out.map(ev => ev.id)).size !== out.length) throw new HttpError(400, 'Deux événements ont le même identifiant.');
    await store.putDoc('evenements', { list: out });
    return adminView();
  }

  return { list, mult, view, mails,
    routes: { 'GET /api/admin/events': () => adminView(), 'POST /api/admin/events': (_, body) => save(body || {}) } };
}
