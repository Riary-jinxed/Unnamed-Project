// Passage d'un menu à l'autre sans coupure : l'ancien écran ne disparaît pas d'un coup, il glisse et s'efface
// pendant que le nouveau arrive du côté opposé (habillage.css : .screen-ghost, #app.screen-in). Une feuille qui se ferme
// redescend de même au lieu de s'évanouir. render() (main.js) déplace les anciens éléments dans un calque fixe posé
// exactement à leur place, puis remplace le contenu de #app : rien n'est recopié, les toiles PixiJS gardent leur image.

// Ordre des onglets de la barre du bas : aller vers la droite fait glisser l'écran vers la gauche, et inversement.
// casino : seulement pendant l'événement du casino (main.js, tabbar).
export const TABS = ['home', 'collection', 'decks', 'casino', 'shop', 'friends'];
// Écrans hors barre ouverts depuis un autre : on y entre en avançant, on en revient en reculant.
const DEPTH = { login: 0, starter: 1, home: 1, collection: 1, decks: 1, shop: 1, friends: 1, casino: 1, profile: 2, ranked: 2, pass: 2, mail: 2, clan: 1, deck: 2 };

// Sens du glissement : 1 vers l'avant (le nouvel écran vient de la droite), -1 en arrière.
export function screenDir(from, to) {
  const a = TABS.indexOf(from), b = TABS.indexOf(to);
  if (a >= 0 && b >= 0) return Math.sign(b - a) || 1;
  return (DEPTH[to] ?? 2) >= (DEPTH[from] ?? 2) ? 1 : -1;
}
// Écrans entre lesquels on glisse : les menus, pas l'ouverture, ni la partie et son salon d'attente (le voile s'en charge).
export const slides = screen => screen in DEPTH;

const ghost = (el, ms) => { el.setAttribute('aria-hidden', 'true'); el.inert = true; document.body.append(el); setTimeout(() => el.remove(), ms); };

// L'écran affiché part dans un calque fixe, à sa place exacte, et s'efface en glissant vers `-dir`.
export function ghostScreen(app, dir) {
  const kids = [...app.children].filter(el => !el.matches('.sheet, .tabbar, .fbanner'));
  if (!kids.length) return;
  const r = app.getBoundingClientRect(), cs = getComputedStyle(app);
  const g = document.createElement('div');
  g.className = 'screen-ghost';
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, paddingTop: cs.paddingTop, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, gap: cs.rowGap });
  g.style.setProperty('--dir', dir);
  g.append(...kids);
  // La vitrine de l'accueil rend sa toile PixiJS au rendu suivant : son illustration fixe reprend sa place le temps du fondu.
  for (const a of g.querySelectorAll('.hero-art')) { a.style.visibility = ''; for (const i of a.querySelectorAll('img')) i.decoding = 'sync'; }
  ghost(g, 300);
}

// La feuille qui se ferme reste un instant par-dessus : son voile s'éclaircit et le panneau redescend.
export function ghostSheet(sheet) {
  if (!sheet) return;
  sheet.classList.remove('sheet-in'); sheet.classList.add('sheet-out');
  ghost(sheet, 240);
}
