// Planning de l'onglet « À venir » des Nouveautés : ce qui est en cours et ce qui arrive dans les semaines qui viennent, calculé depuis
// les réglages réels (dates des sets et des quêtes de /admin, événements, rotation du Boss mondial, saisons du passe) et les annonces
// qui donnent un jour annoncé. Les textes sont composés par l'appli (news.js) à partir des identifiants, dans la langue du joueur.
// Une entrée : { kind, id, day (premier jour), to (dernier jour, facultatif), now (en cours aujourd'hui), ...détails }.
import { today, SETS, setRevealed } from '@jeu/engine/collection';
import { SEASONS, seasonStart } from '@jeu/engine/pass';
import { addDays, occurrence } from '@jeu/engine/events';
import { QUESTS, isLimited, questCfg } from '@jeu/engine/story';
import { bossWeek, bossOfWeek, addWeeks } from '@jeu/engine/boss';

// Jusqu'où regarder devant (en jours).
export const HORIZON = 45;
const monthEnd = d => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// events : events.js du serveur (liste réglée), boss : boss.js (réglages et rotation), posts : annonces parues.
export function planning({ store, events, boss, posts = () => [] }, day = today()) {
  const until = addDays(day, HORIZON), soon = d => d > day && d <= until, out = [];
  // Sets : jour de sortie.
  for (const s of SETS) if (s.reveal && !setRevealed(s, day) && soon(s.reveal)) out.push({ kind: 'set', id: s.id, day: s.reveal });
  // Saison du mois (classé et passe) : sa fin ; les saisons suivantes : leur début.
  const end = monthEnd(day);
  out.push({ kind: 'seasonEnd', id: day.slice(0, 7), day: `${day.slice(0, 7)}-01`, to: end, now: true, pass: SEASONS.find(x => x.id === day.slice(0, 7) && seasonStart(x) <= day)?.id || null });
  for (const x of SEASONS) if (soon(seasonStart(x))) out.push({ kind: 'season', id: x.id, day: seasonStart(x) });
  // Quêtes limitées : leur ouverture, ou leur fin si elles sont en cours.
  const qdoc = store.doc('quetes') || {};
  for (const q of QUESTS.filter(isLimited)) {
    const c = questCfg(q.id, qdoc);
    if (!c.on || !c.from || !c.to) continue;
    if (soon(c.from)) out.push({ kind: 'quest', id: q.id, day: c.from, to: c.to });
    else if (c.from <= day && c.to >= day) out.push({ kind: 'quest', id: q.id, day: c.from, to: c.to, now: true });
  }
  // Événements : la période en cours, sinon la prochaine.
  for (const ev of events.list().filter(e => e.on)) {
    const o = occurrence(ev, day);
    if (!o) continue;
    const now = o.from <= day && o.to >= day;
    if (now || soon(o.from)) out.push({ kind: 'event', id: ev.id, name: ev.name, effect: ev.effect, mult: ev.mult, day: o.from, to: o.to, now });
  }
  // Boss mondial : celui de la semaine et le suivant.
  const c = boss.cfg();
  if (c.on) {
    const week = bossWeek(), next = addWeeks(week, 1), id = bossOfWeek(week, c.rotation), nid = bossOfWeek(next, c.rotation);
    if (id) out.push({ kind: 'boss', id, day: week, to: addDays(week, 6), now: true });
    if (nid && soon(next)) out.push({ kind: 'boss', id: nid, day: next, to: addDays(next, 6) });
  }
  // Annonces parues qui donnent un jour à venir (sortie d'une mise à jour…), sauf celles qui annoncent un set déjà listé.
  for (const p of posts()) if (p.date && soon(p.date) && !(p.set && out.some(x => x.kind === 'set' && x.id === p.set))) out.push({ kind: 'news', id: p.id, day: p.date, newsKind: p.kind });
  return out.sort((a, b) => (b.now ? 1 : 0) - (a.now ? 1 : 0) || (a.now ? (a.to || a.day).localeCompare(b.to || b.day) : a.day.localeCompare(b.day)));
}
