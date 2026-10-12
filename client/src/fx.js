// Effets visuels de la partie posés par-dessus la table (bandeaux, nombres, lueurs, confettis).
// Ils vivent dans <body>, hors de #app : le rendu suivant (une vue toutes les 850 ms pendant la révélation) ne les coupe pas.
import './fx.css';

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plateau PixiJS (stage.js) : chargé au premier écran, seulement avec WebGL et sans « réduire les animations ».
// Tant qu'il n'est pas prêt, ou s'il ne peut pas l'être, chaque effet garde sa version en CSS ci-dessous.
let stage = null, gens = null, scene = null, entering = Promise.resolve(false);
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const staged = () => stage?.active() ? stage : null;
// Appelé à chaque rendu : la table PixiJS en partie, le décor animé (brume, braises, étincelles, chauves-souris à Halloween) dans les menus.
// Dans les menus, le chargement attend que la page soit affichée et au repos, pour ne pas retarder l'ouverture de l'appli.
export function setInGame(app, on) {
  const want = on ? 'game' : 'menu';
  if (want === scene) return; scene = want;
  if (reduceMotion() || !webgl()) { stage?.leave(); return; }
  const go = () => {
    if (scene !== want) return;
    // Les généraux (portrait vivant, effet de pouvoir propre à chacun), les effets des cartes et le décor des menus viennent avec le plateau.
    entering = Promise.all([import('./stage.js'), import('./stage-generals.js'), import('./stage-menu.js'), import('./stage-cards.js')])
      .then(([m, g, mm, mc]) => m.enter(app, scene).then(ok => { if (!ok) return; stage = m; gens = g; g.start(); mm.start(); mc.start(); if (scene !== want) m.enter(app, scene); }))
      .catch(err => { console.warn('Plateau PixiJS indisponible', err); return false; });
  };
  if (stage || on) go(); else (window.requestIdleCallback || (f => setTimeout(f, 1200)))(go, { timeout: 2500 });
}
// Le plateau de la scène demandée est-il prêt ? Le voile d'entrée en partie (veil.js) l'attend avant de s'effacer.
export const stageReady = () => entering;
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
  if (staged()?.banner(board, title, sub, tone)) return;
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

// Le général entre en action : sur PixiJS, l'effet propre à ce général ; sinon anneau et éclat à la couleur de sa famille.
export function generalFire(el) {
  if (!el || reduceMotion()) return;
  const st = staged(); if (st) { if (gens) gens.power(el); else st.general(el, famOf(el)); return; }
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

// Effets sans équivalent CSS, joués seulement sur le plateau PixiJS : étincelles et impact d'une carte révélée
// (tremblement si sa puissance est grande), éclats d'une carte détruite, traînée d'une carte glissée, fin de partie.
export function sparkle(el, power = 0) { const st = staged(); if (st && el) { st.reveal(el, famOf(el) || null); st.impact(el, famOf(el) || null, power); } }
export function shards(rect) { const st = staged(); if (st && rect) st.shatter(rect); }
export function trail(x, y) { if (Math.random() < 0.5) staged()?.trail(x, y); }
export function ending(result) { staged()?.ending(result); }
export function clearEnding() { staged()?.clearEnding(); }

// Récompenses de fin de partie qui défilent sur PixiJS (end-stage.js), dans le panneau de fin, à la place du bloc HTML
// (gardé pour les lecteurs d'écran). Sans WebGL ou avec « réduire les animations », le bloc HTML reste affiché.
// w : { key, reward, result } quand le panneau de fin montre des récompenses, sinon null. Appelé après chaque rendu.
let endMod = null, endSince = null, endLoading = false, endWant = null, endGl = null;
export function setEnd(app, w) {
  // Les lignes arrivent une fois le grand titre posé (stage.js, ending), 1,5 s après l'ouverture du panneau.
  const panel = app.querySelector('.panel.end'), host = w && !reduceMotion() && (endGl ??= webgl()) && panel?.querySelector('.endreward');
  endSince = panel ? endSince ?? performance.now() : null;
  endWant = host ? { ...w, key: `${endSince}|${w.key}`, host: reelHost(host), delay: Math.max(150, endSince + 1500 - performance.now()) } : null;
  if (endMod) { endWant ? endMod.show(endWant) : endMod.hide(); return; }
  if (!endWant || endLoading) return;
  endLoading = true;
  import('./end-stage.js').then(m => { endMod = m; if (endWant?.host.isConnected) m.show(endWant); })
    .catch(err => console.warn('Écran de fin animé indisponible', err));
}
// Place de la toile : juste avant le bloc des récompenses.
function reelHost(block) {
  let h = block.previousElementSibling;
  if (!h?.classList.contains('endreel')) { h = document.createElement('div'); h.className = 'endreel'; h.setAttribute('aria-hidden', 'true'); block.before(h); }
  return h;
}
