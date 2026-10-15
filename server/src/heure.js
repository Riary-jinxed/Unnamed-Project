// Heure de Paris (0 à 23) d'une date : annonces des nouvelles, notifications push, arrivée du boss.
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' });
export const hourOf = (d = new Date()) => Number(PARIS.formatToParts(d).find(p => p.type === 'hour').value);
