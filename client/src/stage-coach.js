// Guide du tutoriel sur PixiJS, chargé avec le plateau (fx.js) : l'écran s'assombrit sauf ce qu'il faut toucher et la bulle
// de Séraphine, un liseré d'or pulse autour de la cible, et une main montre le geste : glisser une carte de la main vers une
// zone, ou toucher un élément. Les cibles restent en HTML (main.js) : leur place est relue quelques fois par seconde.
// Sans WebGL ou avec « réduire les animations », ce module n'est pas chargé : le contour qui clignote (.coach-hl) suffit.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { kit } from './stage.js';

let root = null, veil = null, rims = null, hand = null, ghost = null, ring = null, want = null, rects = null, readIn = 0, t0 = 0;
const PAD = 6, DIM = 0x05030a;

// Main qui pointe de l'index, dessinée une fois dans un canevas 2D (gant blanc cerné de sombre). Le bout du doigt est l'ancre.
// Un seul contour, comme le curseur « main » des ordinateurs : l'index tendu, les trois autres doigts repliés à sa droite
// et le pouce collé sur le côté gauche. Elle penche un peu (TILT).
const TILT = -0.35;
function handTexture() {
  const s = 2, c = document.createElement('canvas'); c.width = 64 * s; c.height = 84 * s;
  const g = c.getContext('2d'); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  const hand = p => {
    p.moveTo(14, 42); p.lineTo(14, 9); p.arc(20, 9, 6, Math.PI, 0); p.lineTo(26, 31);
    p.arc(31, 31, 5, Math.PI, 0); p.arc(40.5, 33, 4.5, Math.PI, 0); p.arc(49.5, 36, 4.5, Math.PI, 0);
    p.lineTo(54, 56); p.quadraticCurveTo(54, 66, 45, 66); p.lineTo(25, 66); p.quadraticCurveTo(15, 66, 13, 57);
    p.lineTo(6, 47); p.quadraticCurveTo(2, 41, 7, 39); p.quadraticCurveTo(10, 38, 14, 42); p.closePath();
  };
  const cuff = p => p.roundRect(20, 63, 31, 15, 4);
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
  g.fillStyle = '#1a1208'; g.strokeStyle = '#1a1208'; g.lineWidth = 6;
  for (const f of [hand, cuff]) { g.beginPath(); f(g); g.stroke(); g.fill(); }
  g.shadowColor = 'transparent'; g.fillStyle = '#fbf3e2';
  for (const f of [hand, cuff]) { g.beginPath(); f(g); g.fill(); }
  g.strokeStyle = 'rgba(120,90,50,.65)'; g.lineWidth = 1.4;
  for (const [x, y] of [[26, 33], [36, 35], [45, 38]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
  g.beginPath(); g.moveTo(14, 44); g.quadraticCurveTo(17, 50, 22, 50); g.stroke(); // pli du pouce
  g.beginPath(); g.moveTo(23, 65); g.lineTo(48, 65); g.stroke();
  return Texture.from(c);
}

function build() {
  const { over } = kit();
  root = new Container(); root.keep = true; root.label = 'coach'; root.alpha = 0;
  veil = new Graphics(); rims = new Graphics(); rims.blendMode = 'add';
  ghost = new Graphics(); ring = new Graphics(); ring.blendMode = 'add';
  hand = new Sprite(handTexture()); hand.anchor.set(20 / 64, 3 / 84); hand.scale.set(0.5);
  root.addChild(veil, rims, ghost, ring, hand);
  over.ticker.add(tick);
}

// Ce que le guide montre : { hl: [sélecteurs], drag: [d'où, vers où], tap: sélecteur } ou null pour tout retirer.
export function set(c) {
  const key = c ? JSON.stringify([c.hl, c.drag, c.tap, c.taps, c.text]) : null;
  if (key === want?.key) return;
  if (key && !root) build();
  if (want?.gesture !== JSON.stringify([c?.drag, c?.tap])) t0 = performance.now();
  want = c && c.hl?.length ? { ...c, key, gesture: JSON.stringify([c.drag, c.tap]) } : null;
  readIn = 0;
}

// La carte qu'on glisse est un clone (.dragghost) qui garde les attributs de l'original : il ne compte jamais comme cible,
// sinon le liseré suivrait le doigt.
const live = sel => [...document.querySelectorAll(sel)].filter(el => !el.closest('.dragghost'));
const rectOf = sel => { if (!sel) return null; const el = live(sel)[0]; if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
const rectsOf = sels => sels.flatMap(live).map(el => el.getBoundingClientRect()).filter(r => r.width);
// Deux trous qui se chevauchent s'annuleraient : on les fond en un seul rectangle.
function merge(list) {
  const out = [];
  for (const r of list) {
    let m = { l: r.left - PAD, t: r.top - PAD, r: r.right + PAD, b: r.bottom + PAD };
    for (let i = out.length - 1; i >= 0; i--) { const o = out[i];
      if (o.l < m.r && m.l < o.r && o.t < m.b && m.t < o.b) { m = { l: Math.min(o.l, m.l), t: Math.min(o.t, m.t), r: Math.max(o.r, m.r), b: Math.max(o.b, m.b) }; out.splice(i, 1); } }
    out.push(m);
  }
  return out.map(o => ({ x: Math.max(0, o.l), y: Math.max(0, o.t), w: Math.min(innerWidth, o.r) - Math.max(0, o.l), h: Math.min(innerHeight, o.b) - Math.max(0, o.t) }));
}
function read() {
  if (!want) { rects = null; return; }
  const targets = rectsOf(want.hl), bubble = rectOf('.coach');
  if (!targets.length) { rects = null; return; }
  const from = want.drag ? rectOf(want.drag[0]) : null, to = want.drag ? rectOf(want.drag[1]) : null, tap = rectOf(want.tap);
  rects = { targets: merge(targets), holes: merge(bubble ? [...targets, bubble] : targets), from, to, tap };
  veil.clear().rect(0, 0, innerWidth, innerHeight).fill({ color: DIM, alpha: 0.62 });
  for (const h of rects.holes) veil.roundRect(h.x, h.y, h.w, h.h, 10).cut();
}

function tick(tk) {
  const { over } = kit();
  if (!root) return;
  if (want && !root.parent) over.stage.addChild(root);
  if ((readIn -= tk.deltaMS) <= 0) { readIn = 120; read(); }
  // Fondu d'entrée et de sortie du voile ; retiré de la scène une fois invisible (la toile des effets peut alors se reposer).
  const on = !!(want && rects);
  root.alpha += ((on ? 1 : 0) - root.alpha) * Math.min(1, 0.12 * tk.deltaTime);
  if (!on && root.alpha < 0.02) { if (root.parent) root.parent.removeChild(root); return; }
  if (!rects) return;
  const now = performance.now(), pulse = 0.5 + 0.5 * Math.sin(now / 260);
  // Liseré d'or autour des cibles (pas autour de la bulle) : un trait net et un halo large qui respire.
  rims.clear();
  for (const h of rects.targets) rims.roundRect(h.x, h.y, h.w, h.h, 10).stroke({ width: 7, color: 0xffc860, alpha: 0.1 + 0.15 * pulse })
    .roundRect(h.x, h.y, h.w, h.h, 10).stroke({ width: 2, color: 0xffd98a, alpha: 0.55 + 0.45 * pulse });
  gesture(now);
}

// La main : glisser (de la carte à la zone, avec un reflet de la carte qui suit) ou toucher (appui et onde d'or).
function gesture(now) {
  const { from, to, tap } = rects, ease = k => 1 - Math.pow(1 - k, 3);
  ghost.clear(); ring.clear();
  // Pendant que le joueur glisse lui-même une carte, la main s'efface pour ne pas le gêner.
  if (document.querySelector('.dragghost')) { hand.visible = false; return; }
  if (from && to) {
    const k = ((now - t0) % 2400) / 2400;
    const ax = from.left + from.width / 2, ay = from.top + from.height * 0.55, bx = to.left + to.width / 2, by = to.top + to.height * 0.72;
    const m = k < 0.18 ? 0 : k > 0.72 ? 1 : ease((k - 0.18) / 0.54), x = ax + (bx - ax) * m, y = ay + (by - ay) * m - Math.sin(m * Math.PI) * 40;
    const press = k < 0.18 ? k / 0.18 : k > 0.72 && k < 0.82 ? 1 - (k - 0.72) / 0.1 : k >= 0.82 ? 0 : 1;
    const alpha = k < 0.06 ? k / 0.06 : k > 0.9 ? (1 - k) / 0.1 : 1;
    hand.visible = true; hand.alpha = alpha; hand.rotation = TILT; hand.position.set(x, y + 4 * press); hand.scale.set(0.5 - 0.05 * press);
    if (k > 0.14 && k < 0.8) { const w = from.width * 0.8, h = from.height * 0.8;
      ghost.roundRect(x - w / 2, y - h / 2, w, h, 6).fill({ color: 0xffe6b0, alpha: 0.16 * alpha }).stroke({ width: 2, color: 0xffd98a, alpha: 0.8 * alpha }); }
    if (k > 0.72 && k < 0.95) { const r = (k - 0.72) / 0.23; ring.circle(bx, by, 10 + r * 34).stroke({ width: 3, color: 0xffd070, alpha: 1 - r }); }
  } else if (tap) {
    // Une touche, ou deux rapprochées (double touche : ouvrir une carte en grand).
    const k = ((now - t0) % 1500) / 1500, x = tap.left + tap.width / 2, y = tap.top + tap.height / 2, two = want.taps === 2;
    const bump = (a, b) => (k >= a && k < b ? Math.sin((k - a) / (b - a) * Math.PI) : 0);
    const press = two ? Math.max(bump(0.1, 0.25), bump(0.3, 0.45)) : k < 0.25 ? ease(k / 0.25) : k < 0.4 ? 1 - (k - 0.25) / 0.15 : 0;
    // Près du bas de l'écran (bouton Valider), la main arrive d'en haut, retournée, pour rester visible.
    const up = y > innerHeight - 90, d = up ? -1 : 1;
    hand.visible = true; hand.alpha = 1; hand.rotation = up ? Math.PI + TILT : TILT;
    hand.position.set(x + 6 * d, y + d * (6 + 10 * (1 - press))); hand.scale.set(0.5 - 0.05 * press);
    for (const at of two ? [0.18, 0.38] : [0.25]) if (k > at && k < at + 0.5) { const r = (k - at) / 0.5; ring.circle(x, y, 8 + r * 30).stroke({ width: 3, color: 0xffd070, alpha: 1 - r }); }
  } else hand.visible = false;
}
