// Petits utilitaires d'affichage partagés par l'appli et la page /admin.
import { getLang } from '@jeu/engine/i18n';

// Couleur de famille : variable CSS --fam, définie dans style.css (--f-neutre pour une carte sans famille).
const FAM_VARS = { 'Ange': '--f-ange', 'Démon': '--f-demon', 'Gobelin': '--f-gobelin', 'Elfe': '--f-elfe', 'Dragon': '--f-dragon', 'Mort-vivant': '--f-mortvivant', 'Vampire': '--f-vampire', 'Hacker': '--f-hacker', 'Cyborg': '--f-cyborg' };
// Police du nom de la carte sur son illustration : --famfont, une par famille (style.css).
const FAM_FONTS = { 'Ange': '--ff-ange', 'Démon': '--ff-demon', 'Gobelin': '--ff-gobelin', 'Elfe': '--ff-elfe', 'Dragon': '--ff-dragon', 'Mort-vivant': '--ff-mortvivant', 'Vampire': '--ff-vampire', 'Hacker': '--ff-hacker', 'Cyborg': '--ff-cyborg' };
export const famStyle = fam => `--fam: var(${FAM_VARS[fam] || '--f-neutre'}); --famfont: var(${FAM_FONTS[fam] || '--display'})`;

// Échappe un texte avant de l'insérer dans du HTML.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ESC[c]);

// Mots-clés des effets, mis en gras dans les textes de cartes, de généraux et de terrains (avec leur nombre : « Horde 2 », « Drain 1 »).
const KEYWORDS = ['Révélation', 'Persistant', 'Grâce', 'Destruction', 'Déplacement', 'Déplaçables?', 'Sortilège', 'Inspiration', 'Éclosion', 'Œufs?',
  'Relève', 'Exhumation', 'Échange', 'Jeton', 'Activable', 'Trésor', 'Magot', 'Coût X',
  'Fin de tour', 'Début de tour', 'Début du tour \\d+', 'Début de partie', 'Fin de partie',
  'Sacrifice(?: \\d+)?', 'Hordes?(?: (?:\\d+|X))?', 'Drain(?: \\d+)?', 'Festins?(?: \\d+)?', 'Défausse(?: \\d+)?',
  'Malwares?(?: \\d+)?', 'Piratage', 'Implants?(?: \\d+)?', 'Surcharges?(?: \\d+)?', 'Pare-feu',
  'Pari', 'Sept', 'Jackpot', 'Drop', 'Tempo(?: \\d+)?'];
// Les mêmes en anglais (lexique de docs/traduction.md), ajoutés quand l'appli est en anglais.
const KEYWORDS_EN = ['Reveal', 'Ongoing', 'Grace', 'Death', 'Move', 'Movable', 'Spellcast', 'Inspire', 'Hatch', 'Eggs?',
  'Rise', 'Exhume', 'Swap', 'Token', 'Activate', 'Treasure', 'Hoard', 'X cost',
  'End of turn', 'Start of turn \\d+', 'Start of turn', 'Start of game', 'End of game',
  'Sacrifice(?: \\d+)?', 'Hordes?(?: (?:\\d+|X))?', 'Drain(?: \\d+)?', 'Feasts?(?: \\d+)?', 'Discard(?: \\d+)?',
  'Malwares?(?: \\d+)?', 'Hack', 'Implants?(?: \\d+)?', 'Overloads?(?: \\d+)?', 'Firewall',
  'Bet', 'Seven', 'Jackpot', 'Drop', 'Tempo(?: \\d+)?'];
// Filtre « Mot-clé » de la collection : nom affiché (traduit avec t) et ce qui le repère dans le texte d'une carte, en français
// ou en anglais (un texte retouché depuis /admin reste en français). Même découpage que KEYWORDS, les variantes regroupées.
export const KW_FILTERS = [
  ['Révélation', 'Révélation|Reveal'], ['Persistant', 'Persistant|Ongoing'], ['Début de tour', 'Début d(?:e|u) tour|Start of turn'],
  ['Fin de tour', 'Fin de tour|End of turn'], ['Début de partie', 'Début de partie|Start of game'], ['Fin de partie', 'Fin de partie|End of game'],
  ['Destruction', 'Destruction|Death'], ['Activable', 'Activable|Activate'], ['Grâce', 'Grâce|Grace'], ['Sacrifice', 'Sacrifice'],
  ['Horde', 'Hordes?'], ['Déplaçable', 'Déplaçables?|Movable'], ['Déplacement', 'Déplacement|Move'], ['Trésor', 'Trésor|Treasure'],
  ['Magot', 'Magot|Hoard'], ['Sortilège', 'Sortilège|Spellcast'], ['Inspiration', 'Inspiration|Inspire'], ['Éclosion', 'Éclosion|Hatch'],
  ['Œuf', 'Œufs?|Eggs?'], ['Relève', 'Relève|Rise'], ['Exhumation', 'Exhumation|Exhume'], ['Échange', 'Échange|Swap'],
  ['Drain', 'Drain'], ['Festin', 'Festins?|Feasts?'], ['Défausse', 'Défausse|Discard'], ['Jeton', 'Jetons?|Tokens?'],
  ['Malware', 'Malwares?'], ['Piratage', 'Piratage|Hack'], ['Implant', 'Implants?'], ['Surcharge', 'Surcharges?|Overloads?'],
  ['Pare-feu', 'Pare-feu|Firewall'], ['Pari', 'Pari|Bet'], ['Sept', 'Sept|Seven'], ['Jackpot', 'Jackpot'],
  ['Drop', 'Drop'], ['Tempo', 'Tempo'],
].map(([name, re]) => ({ name, re: new RegExp(`(?<!\\p{L})(?:${re})(?!\\p{L})`, 'u') }));
const kwRe = list =>new RegExp(`(?<!\\p{L})(?:${list.join('|')})(?!\\p{L})`, 'gu');
const KW_RE = { fr: kwRe(KEYWORDS), en: kwRe([...KEYWORDS_EN, ...KEYWORDS]) };
// Texte d'effet échappé, mots-clés en gras.
export const rich = s => esc(s).replace(KW_RE[getLang()] || KW_RE.fr, '<b class="kw">$&</b>');
