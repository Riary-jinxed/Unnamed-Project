// Activité pour l'onglet Stats de /admin : jours où chaque joueur est venu, et compteurs du jour (boosters, achats, coffres).
// Compte : activeDays = derniers jours (« AAAA-MM-JJ ») où le joueur a utilisé l'appli. Document « compteurs » : { jour: { clé: n } }.
import { today } from '@jeu/engine/collection';

const KEEP_DAYS = 90, KEEP_COUNTERS = 400;
export const COUNTERS = { boosterDaily: 'Booster du jour', boosterBought: 'Booster acheté', boosterFree: 'Booster offert', cardsBought: 'Cartes du jour achetées', chests: 'Coffres d\'arts', artsBought: 'Arts achetés', exchanges: 'Changes Prismes → Éclats', dupsBought: 'Doublons du jour achetés', essenceConverted: 'Échanges d\'essence universelle', boosterFamily: 'Booster de famille' };
const dayOf = (ms = Date.now()) => today(new Date(ms));

export function createActivity(store) {
  // Première requête du jour d'un joueur : le jour est ajouté à son compte (une écriture par joueur et par jour).
  function seen(a) {
    const d = today(), days = a.activeDays ||= [];
    if (days.at(-1) === d) return;
    days.push(d); if (days.length > KEEP_DAYS) days.splice(0, days.length - KEEP_DAYS);
    store.put(a).catch(e => console.error('Activité non enregistrée :', e));
  }
  // key : une clé, ou plusieurs comptées ensemble (une seule écriture).
  function count(key, n = 1) {
    if (!n) return;
    const doc = { ...store.doc('compteurs') }, d = today();
    doc[d] = { ...doc[d] };
    for (const k of [].concat(key)) doc[d][k] = (doc[d][k] || 0) + n;
    for (const k of Object.keys(doc).sort().slice(0, -KEEP_COUNTERS)) delete doc[k];
    store.putDoc('compteurs', doc).catch(e => console.error('Compteur non enregistré :', e));
  }

  // Joueurs actifs et compteurs sur les `days` derniers jours (0 : les 90 derniers jours pour la courbe, tout pour les totaux).
  // Les jours de partie enregistrés avant le suivi de l'activité comptent aussi comme jours actifs.
  function stats(days = 0) {
    const now = Date.now(), day = n => dayOf(now - n * 86_400_000);
    const span = days > 0 ? days : KEEP_DAYS, series = Array.from({ length: span }, (_, i) => day(span - 1 - i));
    const since = days > 0 ? series[0] : '';
    const byLogin = new Map();
    for (const a of store.all()) byLogin.set(a.login, new Set(a.activeDays || []));
    for (const g of store.games()) for (const P of g.players) if (P.login && byLogin.has(P.login)) byLogin.get(P.login).add(dayOf(Date.parse(g.at)));
    const activeSince = d0 => [...byLogin.values()].filter(s => [...s].some(d => d >= d0)).length;
    const perDay = Object.fromEntries(series.map(d => [d, 0]));
    for (const s of byLogin.values()) for (const d of s) if (d in perDay) perDay[d]++;
    const doc = store.doc('compteurs') || {}, totals = Object.fromEntries(Object.keys(COUNTERS).map(k => [k, 0]));
    for (const [d, c] of Object.entries(doc)) if (d >= since) for (const k in totals) totals[k] += c[k] || 0;
    const boosters = c => (c?.boosterDaily || 0) + (c?.boosterBought || 0) + (c?.boosterFree || 0) + (c?.boosterFamily || 0);
    const accounts = store.all();
    return {
      accounts: accounts.length, started: accounts.filter(a => a.starter).length,
      newAccounts: accounts.filter(a => a.created && dayOf(Date.parse(a.created)) >= since).length,
      active: { today: activeSince(day(0)), week: activeSince(day(6)), month: activeSince(day(29)) },
      totals, labels: COUNTERS, since: Object.keys(doc).sort()[0] || null,
      days: series.map(d => ({ day: d, active: perDay[d], boosters: boosters(doc[d]) })),
    };
  }
  return { seen, count, stats };
}
