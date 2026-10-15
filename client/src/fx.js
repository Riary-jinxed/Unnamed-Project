// Effets visuels de la partie posés par-dessus la table (bandeaux, nombres, lueurs, confettis).
// Ils vivent dans <body>, hors de #app : le rendu suivant (une vue toutes les 850 ms pendant la révélation) ne les coupe pas.
import './fx.css';
import { reduceMotion } from './motion.js';

export { reduceMotion };

// Plateau PixiJS (stage.js) : chargé au premier écran, seulement avec WebGL et sans les animations réduites ou coupées (motion.js).
// Tant qu'il n'est pas prêt, ou s'il ne peut pas l'être, chaque effet garde sa version en CSS ci-dessous.
let stage = null, gens = null, coach = null, coachWant = null, scene = null, entering = Promise.resolve(false);
// WebGL disponible ? Testé une seule fois pour toute l'appli, et le contexte d'essai est aussitôt rendu : chaque essai en
// créait un que le navigateur ne libère qu'au ramasse-miettes, et au-delà de 16 il retire les plus anciens, ceux des décors.
let glOk = null;
export const webgl = () => glOk ??= (() => { try { const c = document.createElement('canvas'), x = c.getContext('webgl2') || c.getContext('webgl');
  x?.getExtension('WEBGL_lose_context')?.loseContext(); return !!x; } catch { return false; } })();
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
    entering = Promise.all([import('./stage.js'), import('./stage-generals.js'), import('./stage-menu.js'), import('./stage-cards.js'), import('./stage-coach.js')])
      .then(([m, g, mm, mc, co]) => m.enter(app, scene).then(ok => { if (!ok) return; stage = m; gens = g; coach = co; g.start(); mm.start(); mc.start(); if (scene !== want) m.enter(app, scene); coachGuide(coachWant); }))
      .catch(err => { console.warn('Plateau PixiJS indisponible', err); return false; });
  };
  if (stage || on) go(); else (window.requestIdleCallback || (f => setTimeout(f, 1200)))(go, { timeout: 2500 });
}
// Le réglage des animations vient de changer : le plateau PixiJS s'en va (réduites, aucune) ou revient (complètes).
export function motionChanged(app) {
  const was = scene; scene = null;
  if (was) setInGame(app, was === 'game');
}
// Guide du tutoriel (stage-coach.js) : { hl, drag, tap, text } de tutorial.js, ou null. Appelé après chaque rendu.
// En partie comme dans les menus (guide « Améliorer une carte »). Sans PixiJS, rien : le contour CSS des cibles (.coach-hl)
// reste seul ; avec, il laisse la place au liseré PixiJS.
export function coachGuide(c) {
  coachWant = c;
  const on = !!(c && stage?.scene() && coach);
  coach?.set(on ? c : null);
  document.body.classList.toggle('coached', on);
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
// (gardé pour les lecteurs d'écran). Sans WebGL ou avec les animations réduites ou coupées (motion.js), le bloc HTML reste affiché.
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

// Faites vos jeux : un dé roule sur la carte (ou la zone) qui parie et tombe sur `v`. tone : 'me' ou 'foe'.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const face = v => Array.from({ length: 9 }, (_, i) => `<i${PIPS[v].includes(i) ? ' class="on"' : ''}></i>`).join('');
export function diceRoll(el, v, tone = 'me', delay = 0) {
  if (!el) return;
  const r = el.getBoundingClientRect(), s = Math.min(46, Math.max(30, r.width * 0.55));
  const d = layer({ left: r.left + r.width / 2 - s / 2, top: r.top + r.height / 2 - s / 2, width: s, height: s },
    `fxdice ${tone} ${v === 6 ? 'six' : v <= 2 ? 'low' : ''}`, `<div class="die">${face(reduceMotion() ? v : 1 + Math.floor(Math.random() * 6))}</div>`, 1250 + delay);
  d.style.animationDelay = d.firstChild.style.animationDelay = `${delay}ms`;
  if (reduceMotion()) return;
  // Pendant qu'il roule, le dé change de face ; il se pose sur le résultat aux deux tiers de sa course.
  const die = d.firstChild; let k = 0;
  setTimeout(() => { const iv = setInterval(() => {
    if (++k >= 7) { clearInterval(iv); die.innerHTML = face(v); d.classList.add('landed'); return; }
    die.innerHTML = face(1 + ((v + k) % 6)); }, 70); }, delay);
}

// Jackpot : une machine à sous s'allume au-dessus du plateau, ses trois rouleaux tournent et s'arrêtent sur 7 7 7.
const REEL = ['★', '♦', 'BAR', '♣', '♥', '7'];
export function slotMachine(board, tone = 'me', title = 'Jackpot !') {
  if (!board) return;
  const r = board.getBoundingClientRect(), w = Math.min(300, r.width - 24), h = 150;
  const strip = Array.from({ length: 3 }, () => REEL.concat(REEL, REEL).map(x => `<b class="${x === '7' ? 'seven' : ''}">${x}</b>`).join('')).map((x, i) => `<div class="reel"><div class="strip r${i}">${x}</div></div>`).join('');
  layer({ left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h }, `fxslot ${tone}${reduceMotion() ? ' still' : ''}`,
    `<div class="cab"><div class="lights"></div><div class="reels">${strip}</div><div class="win">${title}</div></div>`, 2600);
}
