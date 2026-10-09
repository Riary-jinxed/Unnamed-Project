// Petits utilitaires d'affichage partagés par l'appli et la page /admin.

// Couleur de famille : variable CSS --fam, définie dans style.css (--f-neutre pour une carte sans famille).
const FAM_VARS = { 'Ange': '--f-ange', 'Démon': '--f-demon', 'Gobelin': '--f-gobelin', 'Elfe': '--f-elfe', 'Dragon': '--f-dragon', 'Mort-vivant': '--f-mortvivant', 'Vampire': '--f-vampire' };
export const famStyle = fam => `--fam: var(${FAM_VARS[fam] || '--f-neutre'})`;

// Échappe un texte avant de l'insérer dans du HTML.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ESC[c]);

// Mots-clés des effets, mis en gras dans les textes de cartes, de généraux et de terrains (avec leur nombre : « Horde 2 », « Drain 1 »).
const KEYWORDS = ['Révélation', 'Persistant', 'Grâce', 'Destruction', 'Déplacement', 'Déplaçables?', 'Sortilège', 'Inspiration', 'Éclosion', 'Œufs?',
  'Relève', 'Exhumation', 'Échange', 'Jeton', 'Activable', 'Trésor', 'Magot', 'Coût X',
  'Fin de tour', 'Début de tour', 'Début du tour \\d+', 'Début de partie', 'Fin de partie',
  'Sacrifice(?: \\d+)?', 'Hordes?(?: (?:\\d+|X))?', 'Drain(?: \\d+)?', 'Festins?(?: \\d+)?', 'Défausse(?: \\d+)?'];
const KW_RE = new RegExp(`(?<!\\p{L})(?:${KEYWORDS.join('|')})(?!\\p{L})`, 'gu');
// Texte d'effet échappé, mots-clés en gras.
export const rich = s => esc(s).replace(KW_RE, '<b class="kw">$&</b>');
