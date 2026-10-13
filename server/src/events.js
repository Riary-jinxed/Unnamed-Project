// Événements temporaires (packages/engine/src/events.js) : la liste réglée depuis /admin (document « evenements » = { list }),
// les multiplicateurs appliqués par progress.js, ce que voit le joueur et les routes de l'administration.
import { DEFAULT_EVENTS, EVENT_EFFECTS, EVENT_WHEN, MAX_EVENTS, MULTS, occurrence, isLive, liveEvents, multiplier, daysLeft } from '@jeu/engine/events';
import { today } from '@jeu/engine/collection';
import { HttpError } from './accounts.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function createEvents(store) {
  const list = () => (store.doc('evenements') || {}).list || DEFAULT_EVENTS;
  const mult = (effect, day = today()) => multiplier(list(), effect, day);

  // Pour l'appli : les événements en cours (avec leur dernier jour) et le prochain à venir dans les 14 jours.
  function view(day = today()) {
    const live = liveEvents(list(), day).map(ev => { const o = occurrence(ev, day);
      return { id: ev.id, name: ev.name, effect: ev.effect, mult: ev.mult, to: o.to, daysLeft: daysLeft(o, day) }; });
    const next = list().filter(ev => ev.on && !isLive(ev, day)).map(ev => ({ ev, o: occurrence(ev, day) }))
      .filter(x => x.o && x.o.from > day && daysLeft({ to: x.o.from }, day) <= 15).sort((x, y) => x.o.from.localeCompare(y.o.from))[0];
    return { live, next: next ? { id: next.ev.id, name: next.ev.name, effect: next.ev.effect, mult: next.ev.mult, from: next.o.from } : null };
  }

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

  return { list, mult, view,
    routes: { 'GET /api/admin/events': () => adminView(), 'POST /api/admin/events': (_, body) => save(body || {}) } };
}
