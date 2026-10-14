// Traductions côté serveur (voir packages/engine/src/i18n.js et docs/traduction.md).
// Les messages d'erreur sont traduits à l'envoi (tr / trMsg) ; les textes que le moteur compose avec t() (deckError…)
// sont produits dans la langue du joueur par withLang(langue, () => …), synchrone seulement (jamais à cheval sur un await).
import { isLang, withLang } from '@jeu/engine/i18n';

// Langue rangée sur le compte du joueur (a.lang, mise à jour par ses appels à l'API) ; français par défaut.
export const langOf = a => (a && isLang(a.lang) ? a.lang : 'fr');
// Langue d'un en-tête X-Lang ou du champ lang d'un message WebSocket, null s'il n'en donne pas une connue.
export const validLang = l => { const x = String(l || '').trim().toLowerCase().slice(0, 2); return isLang(x) ? x : null; };
// Exécute f (synchrone) avec la langue lang pour t(), puis remet la langue d'avant.
export { withLang };
// Même chose dans la langue d'un compte.
export const inLang = (a, f) => withLang(langOf(a), f);
