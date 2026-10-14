// Cartes du plateau, sur la toile des effets de stage.js : chargé avec lui, seulement avec WebGL et sans « réduire les animations ».
// - Pose : une carte posée face cachée, ou déplacée vers une autre zone pendant la préparation, joue l'effet de pose du joueur
//   quand elle arrive dans sa case (board.js du moteur : poussière par défaut, étincelles, pétales, givre, flammes, foudre…).
//   L'effet de l'adversaire se joue quand ses cartes se révèlent (poseAt, appelé par fx.js).
// - État : une créature renforcée (puissance au-dessus de l'imprimée) dégage de temps en temps une étincelle à la couleur de
//   sa famille ; une créature affaiblie, une fumée sombre qui retombe. Peu de particules : cela se lit sans couvrir les cartes.
// Rien ne s'affiche sous une feuille ouverte, et rien ne tourne hors partie.
import { Graphics } from 'pixi.js';
import { kit, active } from './stage.js';

let started = false, last = 0;
const seen = new Map(); // carte posée ou déplacée → zone où elle a déjà eu son effet de pose

function shown(el) {
  const r = el.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return null;
  return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) ? r : null;
}
const famTint = (el, toNum, fallback) => { const c = getComputedStyle(el).getPropertyValue('--fam').trim(); return c ? toNum(c) : fallback; };

// Onde aplatie au sol, sous la carte.
function ring(x, y, r, tint, alpha = 0.55, ms = 380, grow = 0.7) {
  const { over, tween, ease } = kit();
  const g = new Graphics().ellipse(0, 0, r.width * 0.55, r.width * 0.16).stroke({ width: 2, color: 0xffffff });
  g.position.set(x, y); g.tint = tint; g.blendMode = 'add'; g.alpha = 0; over.stage.addChild(g);
  tween(ms, k => { g.scale.set(0.5 + ease(k) * grow); g.alpha = alpha * (1 - k); }, () => g.destroy());
}
// Effets de pose : r est le rectangle de la carte arrivée. Chacun reste court (moins d'une seconde) et ne couvre pas la carte longtemps.
const POSE_FX = {
  // Poussière : quelques grains qui s'écartent au ras du sol.
  poussiere(r, x, y, { spawn, sparkTex, glowTex, rnd }) {
    ring(x, y, r, 0xe8d0a0);
    for (let i = 0; i < 8; i++) { const s = Math.random() < 0.5 ? -1 : 1;
      spawn(i % 3 ? sparkTex : glowTex, x + s * rnd(0, r.width * 0.3), y - rnd(0, 4), { tint: 0xc8b090, blend: 'normal', alpha: 0.5, vx: s * rnd(0.6, 1.6), vy: -rnd(0.1, 0.6), g: 0.02, drag: 0.93, scale: i % 3 ? rnd(0.15, 0.3) : rnd(0.05, 0.09), grow: 0.08, ttl: rnd(22, 34) }); }
  },
  // Étincelles : une gerbe dorée qui jaillit et retombe.
  etincelles(r, x, y, { spawn, sparkTex, rnd }) {
    ring(x, y, r, 0xffd070, 0.7);
    for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + rnd(-1, 1), v = rnd(1.5, 3.6);
      spawn(sparkTex, x + rnd(-r.width * 0.3, r.width * 0.3), y - 2, { tint: i % 4 ? 0xffc850 : 0xffffff, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.12, drag: 0.97, scale: rnd(0.18, 0.36), ttl: rnd(26, 42) }); }
  },
  // Pétales : ils s'envolent en tournoyant puis redescendent doucement.
  petales(r, x, y, { spawn, shardTex, rnd, TAU }) {
    ring(x, y, r, 0xffa8c8, 0.45);
    for (let i = 0; i < 12; i++) spawn(shardTex, x + rnd(-r.width * 0.4, r.width * 0.4), y - rnd(0, r.height * 0.3),
      { tint: [0xffb0cc, 0xff80a8, 0xfff0f4][i % 3], blend: 'normal', vx: rnd(-1.6, 1.6), vy: -rnd(1, 2.4), g: 0.04, drag: 0.97, spin: rnd(-0.15, 0.15), rot: rnd(0, TAU), scale: rnd(0.4, 0.7), ttl: rnd(40, 60) });
  },
  // Givre : éclats de glace projetés à plat et halo bleu.
  givre(r, x, y, { spawn, shardTex, glowTex, rnd, TAU }) {
    ring(x, y, r, 0x9ad8ff, 0.8, 300, 0.9);
    spawn(glowTex, x, y - r.height * 0.3, { tint: 0x8ad0ff, scale: r.width / 140, ttl: 18, grow: 0.2, alpha: 0.4 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, v = rnd(1.6, 2.8);
      spawn(shardTex, x, y - 4, { tint: i % 3 ? 0xc8ecff : 0xffffff, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v * 0.4, drag: 0.9, rot: a + Math.PI / 2, scale: rnd(0.35, 0.6), ttl: rnd(22, 30) }); }
  },
  // Flammes : langues de feu qui montent du sol et se dissipent en fumée.
  flammes(r, x, y, { spawn, glowTex, sparkTex, rnd }) {
    ring(x, y, r, 0xff7a2a, 0.7);
    for (let i = 0; i < 14; i++) spawn(glowTex, x + rnd(-r.width * 0.4, r.width * 0.4), y - rnd(0, 6),
      { tint: i % 3 ? 0xff6a1a : 0xffc040, vx: rnd(-0.3, 0.3), vy: -rnd(1.2, 2.4), drag: 0.97, scale: rnd(0.08, 0.14), grow: -0.06, ttl: rnd(24, 36), alpha: 0.85 });
    for (let i = 0; i < 6; i++) spawn(sparkTex, x + rnd(-r.width * 0.3, r.width * 0.3), y, { tint: 0xffe0a0, vx: rnd(-0.6, 0.6), vy: -rnd(2, 3.5), scale: rnd(0.12, 0.22), ttl: rnd(30, 44) });
  },
  // Foudre : un éclair zébré tombe sur la carte, avec un flash et des étincelles blanches.
  foudre(r, x, y, { over, tween, spawn, sparkTex, glowTex, rnd }) {
    const bolt = new Graphics(), top = Math.max(0, r.top - r.height * 1.2);
    let bx = x + rnd(-10, 10); bolt.moveTo(bx, top);
    for (let k = 1; k <= 7; k++) { bx = x + rnd(-14, 14) * (1 - k / 8); bolt.lineTo(bx, top + (y - top) * (k / 7)); }
    bolt.stroke({ width: 3, color: 0xffffff }); bolt.tint = 0xd8e8ff; bolt.blendMode = 'add'; over.stage.addChild(bolt);
    tween(260, k => { bolt.alpha = k < 0.2 ? 1 : (1 - k) * (Math.random() < 0.3 ? 0.3 : 1); }, () => bolt.destroy());
    spawn(glowTex, x, y - r.height * 0.4, { tint: 0xa8c8ff, scale: r.width / 110, ttl: 14, grow: 0.3, alpha: 0.6 });
    ring(x, y, r, 0xc8d8ff, 0.9, 300, 1);
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + rnd(-1.4, 1.4), v = rnd(2, 4.5);
      spawn(sparkTex, x, y - 2, { tint: i % 2 ? 0xffffff : 0x9ab8ff, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.1, scale: rnd(0.15, 0.3), ttl: rnd(16, 26) }); }
  },
  // Ombres (succès) : une fumée violette sombre rampe au sol, quelques braises violettes.
  ombres(r, x, y, { spawn, glowTex, sparkTex, rnd }) {
    for (let i = 0; i < 10; i++) { const s = i % 2 ? -1 : 1;
      spawn(glowTex, x + s * rnd(0, r.width * 0.2), y - rnd(0, 6), { tint: 0x1a0a24, blend: 'normal', alpha: 0.55, vx: s * rnd(0.8, 1.8), vy: -rnd(0, 0.3), drag: 0.95, scale: rnd(0.07, 0.11), grow: 0.12, ttl: rnd(36, 50) }); }
    for (let i = 0; i < 6; i++) spawn(sparkTex, x + rnd(-r.width * 0.4, r.width * 0.4), y - rnd(0, r.height * 0.2), { tint: 0xb070ff, vy: -rnd(0.4, 1), scale: rnd(0.15, 0.25), ttl: rnd(30, 45) });
  },
  // Couronne de lumière (succès) : un anneau d'or monte le long de la carte, entouré d'étincelles en cercle.
  couronne(r, x, y, { over, tween, ease, spawn, sparkTex, glowTex, TAU }) {
    const g = new Graphics().ellipse(0, 0, r.width * 0.55, r.width * 0.16).stroke({ width: 3, color: 0xffffff });
    g.tint = 0xffd070; g.blendMode = 'add'; g.position.set(x, y); over.stage.addChild(g);
    tween(620, k => { g.y = y - ease(k) * r.height * 0.9; g.scale.set(1 - k * 0.35); g.alpha = k < 0.7 ? 1 : (1 - k) / 0.3; }, () => g.destroy());
    spawn(glowTex, x, y - r.height / 2, { tint: 0xffe0a0, scale: r.width / 120, ttl: 30, grow: 0.15, alpha: 0.35 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU;
      spawn(sparkTex, x + Math.cos(a) * r.width * 0.55, y + Math.sin(a) * r.width * 0.16, { tint: i % 2 ? 0xffd070 : 0xffffff, vy: -1.4, drag: 0.98, scale: 0.22, ttl: 36 }); }
  },
};
function land(r, style) {
  const tools = kit();
  (POSE_FX[style] || POSE_FX.poussiere)(r, r.left + r.width / 2, r.bottom - 3, tools);
}
// Effet de pose d'une carte déjà à l'écran (carte adverse révélée) ; rien sous une feuille ouverte.
export function poseAt(el, style) {
  if (!active() || !el || !POSE_FX[style] || kit().root?.querySelector('.sheet')) return;
  const r = shown(el); if (r) land(r, style);
}
// Effet de pose du joueur, écrit par main.js dans <body data-pose>.
const myPose = () => document.body.dataset.pose || 'poussiere';

export function start() {
  if (started) return; started = true;
  const { over } = kit();
  over.ticker.add(() => {
    if (!active()) { seen.clear(); return; }
    const { root, spawn, sparkTex, glowTex, rnd, toNum } = kit(), now = performance.now();
    if (!root || root.querySelector('.sheet')) return;

    // Pose et déplacement : une fois par carte et par zone d'arrivée, une fois la carte arrivée (après son vol depuis la main).
    const here = new Set();
    for (const el of root.querySelectorAll('.board .mc.pending[data-card], .board .mc.moving[data-card]')) {
      const uid = el.dataset.card, z = el.closest('.zone')?.dataset.z; here.add(uid);
      if (seen.get(uid) === z) continue;
      seen.set(uid, z);
      setTimeout(() => { const now2 = root.querySelector(`.board .mc[data-card="${uid}"]`); const r = now2 && active() && shown(now2); if (r) land(r, myPose()); }, 320);
    }
    for (const uid of seen.keys()) if (!here.has(uid)) seen.delete(uid);

    // Créatures renforcées ou affaiblies : une particule toutes les 250 ms, sur l'une d'elles au hasard.
    if (now - last < 250) return; last = now;
    const marked = [...root.querySelectorAll('.board .mc:has(> .p.up), .board .mc:has(> .p.down)')];
    const el = marked[Math.floor(rnd(0, marked.length))]; if (!el) return;
    const r = shown(el); if (!r) return;
    if (el.querySelector(':scope > .p.up')) {
      spawn(sparkTex, r.left + rnd(4, r.width - 4), r.bottom - rnd(0, r.height * 0.4), { tint: famTint(el, toNum, 0xffd070), vy: -rnd(0.4, 0.8), vx: rnd(-0.15, 0.15), drag: 1, scale: rnd(0.15, 0.26), ttl: rnd(36, 50) });
    } else {
      spawn(glowTex, r.left + rnd(6, r.width - 6), r.top + rnd(0, r.height * 0.3), { tint: 0x2a1a30, blend: 'normal', alpha: 0.35, vy: rnd(0.2, 0.4), drag: 1, scale: rnd(0.06, 0.1), grow: 0.08, ttl: 55 });
    }
  });
}
