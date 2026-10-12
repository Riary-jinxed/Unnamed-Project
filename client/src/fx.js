// Effets visuels de la partie posés par-dessus la table (bandeaux, nombres, lueurs, confettis).
// Ils vivent dans <body>, hors de #app : le rendu suivant (une vue toutes les 600 ms pendant la révélation) ne les coupe pas.
import './fx.css';

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plateau PixiJS (stage.js) : chargé à la première partie, seulement avec WebGL et sans « réduire les animations ».
// Tant qu'il n'est pas prêt, ou s'il ne peut pas l'être, chaque effet garde sa version en CSS ci-dessous.
let stage = null, inGame = false;
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const staged = () => stage?.active() ? stage : null;
// Appelé à chaque rendu : la table PixiJS apparaît en partie et disparaît dans les menus.
export function setInGame(app, on) {
  if (on === inGame) return; inGame = on;
  if (!on) { stage?.leave(); return; }
  if (reduceMotion() || !webgl()) return;
  import('./stage.js').then(m => m.enter(app).then(ok => { if (!ok) return; stage = m; if (!inGame) m.leave(); })).catch(err => console.warn('Plateau PixiJS indisponible', err));
}
const famOf = el => el && getComputedStyle(el).getPropertyValue('--fam').trim();

// Calque fixe posé sur un rectangle de l'écran, retiré après `ms`.
function layer(rect, cls, html = '', ms = 1000) {
  const d = document.createElement('div');
  d.className = `fxl ${cls}`; d.setAttribute('aria-hidden', 'true'); d.innerHTML = html;
  Object.assign(d.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  document.body.append(d); setTimeout(() => d.remove(), ms);
  return d;
}

// Bandeau d'annonce au milieu du plateau : « Tour 3 », « Révélation », « Dernier tour ».
export function banner(board, title, sub = '', tone = '') {
  if (!board) return;
  for (const old of document.querySelectorAll('.fxl.fxbanner')) old.remove();
  const r = board.getBoundingClientRect(), h = 64;
  layer({ left: r.left, top: r.top + r.height / 2 - h / 2, width: r.width, height: h }, `fxbanner ${tone}`,
    `<div class="fxb-in"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`, 2100);
}

// Nombre qui s'envole au-dessus d'un élément : +2 en vert, −1 en rouge, ou la couleur d'un camp (`me`, `foe`).
export function floatNum(el, delta, tone = delta > 0 ? 'up' : 'down', delay = 0) {
  if (!el || !delta || reduceMotion()) return;
  const r = el.getBoundingClientRect();
  const d = layer({ left: r.left, top: r.top, width: r.width, height: r.height }, `fxnum ${tone}`, `<span>${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>`, 1100 + delay);
  if (delay) d.style.animationDelay = d.firstChild.style.animationDelay = `${delay}ms`;
}

// Lueur sur une zone : la zone change de camp, ou est gagnée en fin de partie.
export function zoneGlow(el, side, delay = 0, strong = false) {
  if (!el || reduceMotion()) return;
  const st = staged(); if (st) { setTimeout(() => st.zone(el, side, strong), delay); return; }
  const d = layer(el.getBoundingClientRect(), `fxzone ${side} ${strong ? 'strong' : ''}`, '', (strong ? 1800 : 900) + delay);
  if (delay) d.style.animationDelay = `${delay}ms`;
}

// Le général entre en action : anneau et éclat à la couleur de sa famille.
export function generalFire(el) {
  if (!el || reduceMotion()) return;
  const st = staged(); if (st) { st.general(el, famOf(el)); return; }
  const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height);
  const d = layer(r, 'fxgen', '<i></i><i></i>', 1100);
  d.style.setProperty('--s', `${s}px`);
  const fam = getComputedStyle(el).getPropertyValue('--fam').trim(); if (fam) d.style.setProperty('--fam', fam);
}

// Dos de carte qui se retourne avant que sa face apparaisse (carte révélée de l'adversaire).
export function backFlip(el) {
  if (!el || reduceMotion()) return;
  const r = el.getBoundingClientRect(), g = el.cloneNode(true);
  g.removeAttribute('data-hid'); g.classList.add('fxghost', 'backflip');
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(g); setTimeout(() => g.remove(), 400);
}

// La carte part de `from` (rectangle de l'écran) et glisse jusqu'à sa place actuelle.
export function flyFrom(el, from, { lift = 1.08, ms = 380 } = {}) {
  if (!el || !from || !el.animate || reduceMotion()) return;
  const r = el.getBoundingClientRect(); if (!r.width) return;
  const dx = from.left - r.left, dy = from.top - r.top, sx = from.width / r.width, sy = from.height / r.height;
  el.animate([
    { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, zIndex: 3, opacity: 1 },
    { transformOrigin: '0 0', transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(${lift})`, zIndex: 3, offset: 0.6 },
    { transformOrigin: '0 0', transform: 'none', zIndex: 3 },
  ], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// Victoire : pluie de confettis aux couleurs du joueur et de l'accent.
export function confetti() {
  if (reduceMotion()) return;
  const st = staged(); if (st) { st.confetti(); return; }
  const colors = ['var(--mine)', 'var(--accent)', 'var(--up)', '#fff'];
  const bits = Array.from({ length: 46 }, (_, i) => {
    const x = Math.random() * 100, drift = (Math.random() - 0.5) * 120, rot = Math.round(Math.random() * 720 - 360);
    const delay = Math.round(Math.random() * 500), dur = 1400 + Math.round(Math.random() * 900);
    return `<i style="left:${x}%;--dx:${drift}px;--rot:${rot}deg;animation-delay:${delay}ms;animation-duration:${dur}ms;background:${colors[i % colors.length]}"></i>`;
  }).join('');
  layer({ left: 0, top: 0, width: innerWidth, height: innerHeight }, 'fxconfetti', bits, 2900);
}

// Effets sans équivalent CSS, joués seulement sur le plateau PixiJS : étincelles d'une carte révélée,
// éclats d'une carte détruite (en plus de son animation CSS).
export function sparkle(el) { const st = staged(); if (st && el) st.reveal(el, famOf(el) || null); }
export function shards(rect) { const st = staged(); if (st && rect) st.shatter(rect); }
