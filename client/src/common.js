// Petits utilitaires d'affichage partagés par l'appli et la page /admin.

// Couleur de famille : variable CSS --fam, définie dans style.css (--f-neutre pour une carte sans famille).
const FAM_VARS = { 'Ange': '--f-ange', 'Démon': '--f-demon', 'Gobelin': '--f-gobelin', 'Elfe': '--f-elfe', 'Dragon': '--f-dragon', 'Mort-vivant': '--f-mortvivant', 'Vampire': '--f-vampire' };
export const famStyle = fam => `--fam: var(${FAM_VARS[fam] || '--f-neutre'})`;

// Échappe un texte avant de l'insérer dans du HTML.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ESC[c]);
