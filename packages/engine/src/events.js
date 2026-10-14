// Événements temporaires : un bonus (XP doublée, points de classé doublés…) actif pendant une période qui revient
// (chaque week-end, dernière semaine du mois) ou entre deux dates. Partagé par le serveur (qui applique les bonus)
// et l'appli (qui les annonce). La liste se règle depuis /admin (document « evenements », server/src/events.js).
// Les jours sont ceux du jeu (heure de Paris, « AAAA-MM-JJ ») : un événement commence à minuit et finit à minuit.
import { today } from './collection.js';
import { t, getLang, locale } from './i18n.js';

// Ce que l'événement multiplie (chip : pastille de l'accueil, short : écran de fin, what : explication au joueur, hint : /admin). Pour en ajouter un : une entrée ici, puis appliquer `multiplier(…, id)` là où le gain se calcule.
export const EVENT_EFFECTS = {
  xp: { name: 'XP', chip: 'XP', short: 'XP', what: 'XP des parties, des missions et des nouvelles cartes', hint: 'XP des parties, des missions du jour et des nouvelles cartes.' },
  ranked: { name: 'Points de classé', chip: 'PC', short: 'étoiles en classé', what: 'étoiles gagnées en classé', hint: 'Étoiles (et points en Maître) gagnées par victoire classée. Les défaites ne changent pas.' },
  shards: { name: 'Éclats des parties', chip: 'Éclats', short: 'Éclats', what: 'Éclats des parties', hint: 'Éclats gagnés à chaque partie.' },
  passXp: { name: 'XP de saison', chip: 'XP saison', short: 'XP de saison', what: 'XP de saison des parties', hint: 'XP du passe de saison gagnée à chaque partie.' },
};
// Quand l'événement a lieu.
export const EVENT_WHEN = {
  weekend: 'Chaque week-end (samedi et dimanche)',
  lastWeekend: 'Dernier week-end du mois',
  lastWeek: 'Dernière semaine du mois (7 derniers jours)',
  dates: 'Entre deux dates',
};
export const MAX_EVENTS = 20, MULTS = [1.5, 2, 3];

// Événements de départ, tant que /admin n'a rien enregistré.
export const DEFAULT_EVENTS = [
  { id: 'weekend-xp', name: 'Week-end double XP', effect: 'xp', mult: 2, when: 'weekend', on: true },
  { id: 'semaine-classee', name: 'Semaine double points de classé', effect: 'ranked', mult: 2, when: 'lastWeek', on: true },
];

// ---- Jours ----
const parse = d => { const [y, m, j] = d.split('-').map(Number); return Date.UTC(y, m - 1, j); };
const fmt = t => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => fmt(parse(d) + n * 86400000);
const weekday = d => new Date(parse(d)).getUTCDay(); // 0 dimanche … 6 samedi
const monthEnd = d => { const [y, m] = d.split('-').map(Number); return fmt(Date.UTC(y, m, 0)); };
const nextMonth = d => { const [y, m] = d.split('-').map(Number); return fmt(Date.UTC(y, m, 1)); };
const lastSaturday = d => { const e = monthEnd(d); return addDays(e, -((weekday(e) + 1) % 7)); };

// Période de l'événement qui contient le jour `day`, ou à défaut la prochaine : { from, to } (jours compris), null s'il n'y en a plus.
export function occurrence(ev, day = today()) {
  if (ev.when === 'dates') return ev.from && ev.to && day <= ev.to ? { from: ev.from, to: ev.to } : null;
  if (ev.when === 'weekend') {
    const w = weekday(day);
    if (w === 6) return { from: day, to: addDays(day, 1) };
    if (w === 0) return { from: addDays(day, -1), to: day };
    const sat = addDays(day, 6 - w); return { from: sat, to: addDays(sat, 1) };
  }
  // Une période par mois : celle du mois précédent (un dernier week-end peut finir le 1er), de ce mois, puis du suivant.
  const month = day.slice(0, 7) + '-01', months = [addDays(month, -1), month, nextMonth(month)];
  const monthly = ev.when === 'lastWeekend' ? m => { const sat = lastSaturday(m); return { from: sat, to: addDays(sat, 1) }; }
    : ev.when === 'lastWeek' ? m => ({ from: addDays(monthEnd(m), -6), to: monthEnd(m) }) : null;
  return monthly ? months.map(monthly).find(o => o.to >= day) : null;
  return null;
}
export const isLive = (ev, day = today()) => { if (!ev.on) return false; const o = occurrence(ev, day); return !!o && day >= o.from && day <= o.to; };

// Événements en cours ce jour-là.
export const liveEvents = (events, day = today()) => events.filter(ev => isLive(ev, day));
// Multiplicateur d'un effet : le plus fort des événements en cours (deux événements « XP ×2 » ne font pas ×4).
export function multiplier(events, effect, day = today()) {
  return liveEvents(events, day).filter(ev => ev.effect === effect).reduce((m, ev) => Math.max(m, ev.mult), 1);
}
// Gain multiplié, arrondi à l'entier (un gain positif reste au moins égal au gain de base).
export const boost = (n, mult) => (n > 0 && mult !== 1 ? Math.max(n, Math.round(n * mult)) : n);

// Jours restants d'une période, aujourd'hui compris.
export const daysLeft = (o, day = today()) => Math.round((parse(o.to) - parse(day)) / 86400000) + 1;
// Décimale à la façon de la langue (« ×1,5 » en français, « ×1.5 » en anglais).
export const multLabel = m => `×${getLang() === 'fr' ? String(m).replace('.', ',') : Number(m).toLocaleString(locale(), { maximumFractionDigits: 10 })}`;
// Fin du jour `day` (minuit suivant, heure de Paris) : l'instant où un événement qui finit ce jour-là s'arrête.
export function dayEnd(day) {
  const next = addDays(day, 1), t = parse(next);
  return new Date([t - 7200000, t - 3600000].find(x => today(new Date(x)) === next && today(new Date(x - 1)) === day) ?? t - 3600000).toISOString();
}
// « du samedi 17 au dimanche 18 octobre » (ou « le samedi 17 octobre » sur un seul jour).
// Noms traduits à l'appel (le serveur change de langue par requête).
const DAYS = () => [t('dimanche'), t('lundi'), t('mardi'), t('mercredi'), t('jeudi'), t('vendredi'), t('samedi')];
const MONTHS = () => [t('janvier'), t('février'), t('mars'), t('avril'), t('mai'), t('juin'), t('juillet'), t('août'), t('septembre'), t('octobre'), t('novembre'), t('décembre')];
const dayName = (d, month = true) => { const [, m, j] = d.split('-').map(Number), vars = { day: DAYS()[weekday(d)], j: j === 1 ? t('1er') : j };
  return month ? t('{day} {j} {month}', { ...vars, month: MONTHS()[m - 1] }) : t('{day} {j}', vars); };
export const periodLabel = o => (o.from === o.to ? t('le {d}', { d: dayName(o.from) }) : t('du {from} au {to}', { from: dayName(o.from, o.from.slice(0, 7) !== o.to.slice(0, 7)), to: dayName(o.to) }));
