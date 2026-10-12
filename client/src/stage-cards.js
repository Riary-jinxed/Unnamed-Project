// Cartes du plateau, sur la toile des effets de stage.js : chargé avec lui, seulement avec WebGL et sans « réduire les animations ».
// - Pose : une carte posée face cachée, ou déplacée vers une autre zone pendant la préparation, soulève un petit nuage de
//   poussière et une onde au sol quand elle arrive dans sa case.
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

// Poussière de pose : onde aplatie sous la carte et quelques grains qui s'écartent au ras du sol.
function land(r) {
  const { over, spawn, sparkTex, glowTex, tween, ease, rnd } = kit();
  const x = r.left + r.width / 2, y = r.bottom - 3;
  const g = new Graphics().ellipse(0, 0, r.width * 0.55, r.width * 0.16).stroke({ width: 2, color: 0xffffff });
  g.position.set(x, y); g.tint = 0xe8d0a0; g.blendMode = 'add'; g.alpha = 0; over.stage.addChild(g);
  tween(380, k => { g.scale.set(0.5 + ease(k) * 0.7); g.alpha = 0.55 * (1 - k); }, () => g.destroy());
  for (let i = 0; i < 8; i++) { const s = Math.random() < 0.5 ? -1 : 1;
    spawn(i % 3 ? sparkTex : glowTex, x + s * rnd(0, r.width * 0.3), y - rnd(0, 4), { tint: 0xc8b090, blend: 'normal', alpha: 0.5, vx: s * rnd(0.6, 1.6), vy: -rnd(0.1, 0.6), g: 0.02, drag: 0.93, scale: i % 3 ? rnd(0.15, 0.3) : rnd(0.05, 0.09), grow: 0.08, ttl: rnd(22, 34) }); }
}

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
      setTimeout(() => { const now2 = root.querySelector(`.board .mc[data-card="${uid}"]`); const r = now2 && active() && shown(now2); if (r) land(r); }, 320);
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
