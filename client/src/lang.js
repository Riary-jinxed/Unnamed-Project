// Langue de l'appli : chargée avant tout le reste (premier import de main.js), pour que les textes calculés
// au chargement des modules soient déjà dans la bonne langue. Changer de langue recharge la page.
// Choix gardé sur l'appareil (localStorage « jeu-lang ») ; avant le premier choix, l'appli propose la langue du téléphone.
import { addStrings, setLang, getLang, isLang, t } from '@jeu/engine/i18n';
// catalog.js garde une copie des cartes d'origine : chargé avant la traduction, cette copie reste en français.
import '@jeu/engine/catalog';
import { CARDS, GENERALS, TERRAINS, DECKS } from '@jeu/engine';
import { SETS } from '@jeu/engine/collection';
import engineEn from '@jeu/engine/lang/en';
import clientEn from './lang/en/index.js';

addStrings('en', engineEn);
addStrings('en', clientEn);

const KEY = 'jeu-lang';
const saved = (() => { try { const v = JSON.parse(localStorage.getItem(KEY)); return isLang(v) ? v : null; } catch { return null; } })();
// Langue du téléphone ou de l'ordinateur : français s'il est en français, anglais sinon.
export const deviceLang = () => (/^fr\b/i.test(navigator.language || 'fr') ? 'fr' : 'en');
setLang(saved || deviceLang());
document.documentElement.lang = getLang();

// Vrai une fois la langue choisie sur cet appareil (sinon l'appli la demande au premier lancement).
export const langChosen = () => !!saved;
// Choisit la langue ; la page se recharge si elle change, pour tout réafficher dans la nouvelle langue.
export function chooseLang(l) {
  if (!isLang(l)) return;
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* stockage indisponible */ }
  if (l !== getLang() || !saved) location.reload();
}

// Noms et textes des cartes, généraux, terrains, decks et sets dans la langue de l'appli.
// À rappeler après applyCatalog, qui remet les cartes en français. Un texte retouché depuis /admin n'a pas
// de traduction : il reste en français.
export function localizeCatalog() {
  if (getLang() === 'fr') return;
  for (const d of [...Object.values(CARDS), ...Object.values(GENERALS), ...Object.values(TERRAINS)]) {
    d.name = t(d.name);
    if (d.text) d.text = t(d.text);
  }
  for (const d of Object.values(DECKS)) d.name = t(d.name);
  for (const s of SETS) { s.name = t(s.name); if (s.teaser) s.teaser = t(s.teaser); }
}
localizeCatalog();
