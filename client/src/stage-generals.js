// Généraux en partie, sur le plateau PixiJS (stage.js) : chargé avec lui, seulement avec WebGL et sans les animations réduites ou coupées (motion.js).
// - Portrait vivant : quelques poussières à la couleur de la famille montent (ou tombent) du portrait, sans arrêt mais rarement,
//   un peu plus souvent quand le général peut être activé, plus du tout une fois utilisé. La respiration du portrait est en CSS (style.css).
// - Pouvoir : quand le général agit, un effet court (moins d'une seconde) et propre à chacun, posé sur sa carte, sans tremblement ni éclair.
// Tout reste sobre : peu de particules, petites, et rien au-dessus d'une feuille ouverte ou d'un autre élément qui couvre le portrait.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { kit } from './stage.js';

let started = false, coinTex = null;
// Différé, sauf si la partie a été quittée entre-temps.
const later = (fn, ms) => setTimeout(() => { if (document.body.classList.contains('staged')) fn(); }, ms);
const last = { me: 0, foe: 0 };

// Poussières du portrait, par famille : teinte, texture, vitesse (px par image), gravité, taille, durée (images), intervalle (ms).
export const MOTES = {
  Ange:          { tint: 0xfff0c0, vy: -0.35, scale: [0.12, 0.2], ttl: 70, every: 1100 },
  'Démon':       { tint: 0xff6a3a, vy: -0.6, scale: [0.1, 0.18], ttl: 50, every: 900 },
  Gobelin:       { tint: 0xe6c060, vy: -1.1, g: 0.035, scale: [0.1, 0.16], ttl: 45, every: 1300 },
  Elfe:          { tint: 0x8fd07a, leaf: true, vy: 0.25, vx: 0.3, scale: [0.3, 0.4], ttl: 80, every: 1500 },
  Dragon:        { tint: 0xffa040, vy: -0.7, scale: [0.1, 0.2], ttl: 45, every: 900 },
  'Mort-vivant': { tint: 0x9fffc8, glow: true, vy: -0.3, scale: [0.04, 0.06], ttl: 80, every: 1300 },
  Vampire:       { tint: 0xd02040, vy: 0.3, scale: [0.12, 0.18], ttl: 60, every: 1300 },
  Hacker:        { tint: 0x3ad7ff, glow: true, vy: 0.6, scale: [0.04, 0.07], ttl: 55, every: 700 },
  Cyborg:        { tint: 0xff4fbf, glow: true, vy: -0.5, vx: 0.4, scale: [0.05, 0.08], ttl: 40, every: 900 },
  '':            { tint: 0xd8c8a0, vy: -0.15, vx: 0.2, scale: [0.1, 0.15], ttl: 80, every: 1700 },
};

// Le portrait est-il bien visible (ni couvert par une feuille, ni hors de l'écran) ?
function visible(el) {
  const p = el.querySelector('.gport') || el, r = p.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return null;
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.gencard') === el ? r : null;
}

// Appelé une fois, quand le plateau est prêt : la boucle des poussières tourne avec la toile des effets.
export function start() {
  if (started) return; started = true;
  const { over } = kit();
  over.ticker.add(() => {
    const { root, spawn, glowTex, sparkTex, shardTex, rnd } = kit(), now = performance.now();
    if (!root) return;
    for (const el of root.querySelectorAll('.pbar [data-general]')) {
      const side = el.dataset.side, m = MOTES[el.dataset.gfam] || MOTES[''];
      if (el.classList.contains('used')) continue;
      const every = el.classList.contains('ready') || el.classList.contains('armed') ? m.every * 0.6 : m.every;
      if (now - last[side] < every) continue;
      last[side] = now + rnd(-200, 200);
      const r = visible(el); if (!r) continue;
      const y = m.vy > 0 ? r.top + rnd(0, r.height * 0.3) : r.bottom - rnd(0, r.height * 0.3);
      spawn(m.leaf ? shardTex : m.glow ? glowTex : sparkTex, r.left + rnd(4, r.width - 4), y, { tint: m.tint, blend: m.leaf ? 'normal' : 'add',
        vx: rnd(-1, 1) * (m.vx ?? 0.15), vy: m.vy * rnd(0.7, 1.3), g: m.g ?? 0, drag: 1, spin: m.leaf ? rnd(-0.04, 0.04) : 0, rot: rnd(0, 6.3),
        scale: rnd(...m.scale), alpha: m.leaf ? 0.7 : 0.85, ttl: m.ttl });
    }
  });
}

// ---- Briques des effets de pouvoir ----
// Anneau qui s'ouvre (ou se referme, from > to) en s'effaçant. ellipse < 1 l'aplatit (onde au sol).
function ring(x, y, tint, { r = 26, w = 2, ms = 600, from = 0.4, to = 1.5, ellipse = 1, alpha = 0.9, delay = 0 } = {}) {
  const { over, tween, ease } = kit();
  const go = () => { const g = new Graphics().ellipse(0, 0, r, r * ellipse).stroke({ width: w, color: 0xffffff }); g.position.set(x, y); g.tint = tint; g.blendMode = 'add'; g.alpha = 0;
    over.stage.addChild(g); tween(ms, k => { g.scale.set(from + (to - from) * ease(k)); g.alpha = alpha * Math.min(1, k * 5) * (1 - k); }, () => g.destroy()); };
  delay ? later(go, delay) : go();
}
// Halo doux qui gonfle et s'efface.
const glow = (x, y, tint, size = 60, ttl = 30, alpha = 0.5) => { const { spawn, glowTex } = kit(); spawn(glowTex, x, y, { tint, scale: size / 256, grow: size / 512, ttl, alpha }); };
// Gerbe : n particules dans un éventail d'angles (radians), à une vitesse donnée.
function burst(x, y, n, tint, { a = [0, Math.PI * 2], v = [1, 3], tex = 'spark', scale = [0.2, 0.4], ttl = [30, 45], ...o } = {}) {
  const k = kit(), t = { spark: k.sparkTex, glow: k.glowTex, shard: k.shardTex, coin: coinTex }[tex];
  for (let i = 0; i < n; i++) { const an = k.rnd(...a), sp = k.rnd(...v);
    k.spawn(t, x, y, { tint: Array.isArray(tint) ? tint[i % tint.length] : tint, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, scale: k.rnd(...scale), ttl: k.rnd(...ttl), ...o }); }
}
// Objet dessiné (Graphics ou Container) animé par une fonction de k (0 à 1), puis retiré.
function anim(obj, ms, update, delay = 0) {
  const { over, tween } = kit();
  const go = () => { over.stage.addChild(obj); update(obj, 0); tween(ms, k => update(obj, k), () => obj.destroy({ children: true })); };
  delay ? later(go, delay) : go();
}
function coin() {
  if (coinTex) return;
  const c = document.createElement('canvas'); c.width = c.height = 20; const g = c.getContext('2d');
  g.fillStyle = '#ffd34a'; g.beginPath(); g.arc(10, 10, 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a8740e'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff2b0'; g.fillRect(8, 5, 3, 9);
  coinTex = Texture.from(c);
}

// ---- Effet propre à chaque général ----
// x, y : centre du portrait ; r : son rectangle ; dir : vers le plateau (-1 pour le joueur, en bas ; +1 pour l'adversaire, en haut) ; fam : couleur de la famille.
const UP = -Math.PI / 2;
const POWERS = {
  // Main de l'Aube : un soleil qui se lève, ses rayons s'ouvrent en éventail vers le plateau.
  seraphine({ x, y, dir }) {
    glow(x, y, 0xffd890, 90, 40, 0.55);
    const c = new Container(); c.position.set(x, y);
    for (let i = 0; i < 7; i++) { const a = (dir < 0 ? UP : -UP) + (i - 3) * 0.32;
      const ray = new Graphics().poly([0, 0, Math.cos(a - 0.05) * 70, Math.sin(a - 0.05) * 70, Math.cos(a + 0.05) * 70, Math.sin(a + 0.05) * 70]).fill({ color: 0xffe6a8, alpha: 0.55 });
      ray.blendMode = 'add'; c.addChild(ray); }
    anim(c, 900, (o, k) => { o.scale.set(0.2 + 0.8 * kit().ease(Math.min(1, k * 2))); o.alpha = k < 0.5 ? 1 : 2 - k * 2; });
  },
  // Gardienne du Serment : deux sceaux d'or se referment sur elle.
  aurelia({ x, y }) {
    ring(x, y, 0xffd070, { r: 30, from: 1.8, to: 0.7, ms: 650 }); ring(x, y, 0xfff0c0, { r: 30, from: 1.8, to: 0.7, ms: 650, delay: 160, w: 1.5 });
    later(() => glow(x, y, 0xffd070, 70, 28, 0.5), 600);
  },
  // Voix des Cieux : un rai de lumière descend sur lui, quelques plumes tombent.
  ophaniel({ x, y, r, dir }) {
    const { glowTex, rnd } = kit(), beam = new Sprite(glowTex); beam.anchor.set(0.5); beam.tint = 0xfff4d0; beam.blendMode = 'add'; beam.width = 22; beam.height = 120;
    anim(beam, 800, (o, k) => { o.position.set(x, y + dir * 70 * (1 - kit().ease(Math.min(1, k * 2)))); o.alpha = 0.7 * (k < 0.6 ? 1 : (1 - k) / 0.4); });
    for (let i = 0; i < 5; i++) later(() => burst(x + rnd(-r.width / 2, r.width / 2), y - r.height / 2, 1, 0xffffff,
      { tex: 'shard', blend: 'normal', a: [Math.PI / 2 - 0.3, Math.PI / 2 + 0.3], v: [0.3, 0.7], g: 0.01, drag: 0.99, spin: rnd(-0.06, 0.06), scale: [0.6, 0.9], ttl: [60, 80] }), i * 90);
  },
  // Seigneur des Fosses : des braises jaillissent d'une fosse rougeoyante.
  morgrath({ x, r }) {
    const b = r.bottom - 4; ring(x, b, 0xc02010, { r: 28, ellipse: 0.3, ms: 700, w: 3 });
    burst(x, b, 14, [0xff4020, 0xff8a30, 0xffd060], { a: [UP - 0.5, UP + 0.5], v: [1.5, 3.5], drag: 0.97, scale: [0.15, 0.35], ttl: [35, 55] });
  },
  // L'Invocateur : un cercle de runes tourne en se resserrant, puis l'invocation éclate.
  vorgoth({ x, y }) {
    const c = new Graphics().circle(0, 0, 34).stroke({ width: 1.5, color: 0xffffff });
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.circle(Math.cos(a) * 34, Math.sin(a) * 34, 3).fill({ color: 0xffffff }); }
    c.position.set(x, y); c.tint = 0xb050ff; c.blendMode = 'add';
    anim(c, 700, (o, k) => { const e = kit().ease(k); o.rotation = e * Math.PI; o.scale.set(1.3 - 0.8 * e); o.alpha = Math.min(1, k * 4) * (1 - k * 0.5); });
    later(() => { burst(x, y, 10, [0xb050ff, 0xff4060], { v: [1.5, 3.5] }); glow(x, y, 0xb050ff, 60, 24, 0.5); }, 650);
  },
  // Marchand d'âmes : deux âmes tournent l'une autour de l'autre et échangent leur place.
  belzharoth({ x, y }) {
    for (const [tint, ph] of [[0xffd070, 0], [0xa040ff, Math.PI]]) {
      const s = new Sprite(kit().glowTex); s.anchor.set(0.5); s.tint = tint; s.blendMode = 'add'; s.scale.set(0.09);
      anim(s, 800, (o, k) => { const a = ph + kit().ease(k) * Math.PI * 2; o.position.set(x + Math.cos(a) * 26, y + Math.sin(a) * 12); o.alpha = k < 0.8 ? 1 : (1 - k) * 5;
        if (Math.random() < 0.15) kit().spawn(kit().sparkTex, o.x, o.y, { tint, scale: 0.15, ttl: 20 }); });
    }
  },
  // Roi des Pillards : une poignée de pièces d'or jaillit.
  grisk({ x, y, dir }) {
    coin(); burst(x, y, 9, 0xffffff, { tex: 'coin', blend: 'normal', fade: false, a: dir < 0 ? [UP - 0.7, UP + 0.7] : [0.3, Math.PI - 0.3], v: dir < 0 ? [3, 5] : [1, 2.5],
      g: 0.18, drag: 0.99, spin: 0.2, scale: [0.5, 0.75], ttl: [40, 50] });
  },
  // Maître de la Horde : la horde frappe le sol, sa force se répartit de part et d'autre.
  snagg({ x, r, dir }) {
    const b = r.bottom - 4; ring(x, b, 0x9acd32, { r: 30, ellipse: 0.3, ms: 600, w: 3 });
    for (const a of [Math.PI, dir < 0 ? UP : -UP, 0]) burst(x, b - 6, 4, [0xd8e070, 0x9acd32], { a: [a - 0.15, a + 0.15], v: [2.5, 4], drag: 0.94, ttl: [25, 35] });
  },
  // Le Ripailleur : bulles et miettes du festin qui montent.
  gorbag({ x, y, r }) {
    const { rnd } = kit();
    for (let i = 0; i < 8; i++) later(() => burst(x + rnd(-r.width / 2.5, r.width / 2.5), r.bottom - 4, 1, [0xffc060, 0xffe0a0],
      { tex: 'glow', a: [UP - 0.2, UP + 0.2], v: [0.8, 1.6], drag: 0.99, scale: [0.04, 0.07], grow: 0.03, ttl: [40, 55] }), i * 60);
    glow(x, y, 0xffb040, 50, 25, 0.35);
  },
  // Voix des Bois : des feuilles tournoient autour de lui en montant.
  sylvaen({ x, y, dir }) {
    const { rnd, spawn, shardTex } = kit();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, v = rnd(1.5, 2.5);
      spawn(shardTex, x + Math.cos(a) * 18, y + Math.sin(a) * 10, { tint: i % 2 ? 0x6cc583 : 0xa8d86a, blend: 'normal', vx: Math.cos(a + Math.PI / 2) * v, vy: Math.sin(a + Math.PI / 2) * v + dir * 0.8,
        drag: 0.95, spin: rnd(-0.15, 0.15), rot: rnd(0, 6.3), scale: rnd(0.5, 0.8), ttl: rnd(45, 60), alpha: 0.85 }); }
  },
  // Pas-de-Vent : trois souffles traversent sa carte, le dernier revient sur ses pas.
  lirael({ x, y }) {
    [[-1, 0], [-1, 120], [1, 260]].forEach(([d, delay], i) => {
      const g = new Graphics().arc(0, 0, 22, -2.3, -0.8).stroke({ width: 2, color: 0xffffff }); g.tint = 0xbfe8ff; g.blendMode = 'add';
      anim(g, 500, (o, k) => { o.position.set(x + d * (-40 + 80 * kit().ease(k)), y + (i - 1) * 8 + 10); o.scale.x = d; o.alpha = Math.sin(k * Math.PI) * 0.9; }, delay);
    });
  },
  // Tisseuse de sorts : un fil de lumière dessine un huit, maille après maille.
  elyndra({ x, y }) {
    for (let i = 0; i < 16; i++) later(() => { const t = (i / 16) * Math.PI * 2, d = 1 + Math.sin(t) ** 2;
      kit().spawn(kit().sparkTex, x + 30 * Math.cos(t) / d, y + 30 * Math.sin(t) * Math.cos(t) / d, { tint: i % 3 ? 0x7fe0d0 : 0xffffff, scale: 0.28, ttl: 36 }); }, i * 28);
    later(() => glow(x, y, 0x7fe0d0, 60, 26, 0.4), 450);
  },
  // L'Aîné : l'or de son magot luit, quelques pièces retombent sur lui.
  vaelthar({ x, y, r }) {
    coin(); glow(x, y, 0xffc040, 80, 36, 0.5); ring(x, y, 0xffc040, { r: 28, ms: 700 });
    const { rnd } = kit();
    for (let i = 0; i < 6; i++) later(() => burst(x + rnd(-r.width / 2, r.width / 2), r.top - 10, 1, 0xffffff,
      { tex: 'coin', blend: 'normal', fade: false, a: [Math.PI / 2, Math.PI / 2], v: [0.5, 1], g: 0.15, spin: 0.15, scale: [0.4, 0.55], ttl: [26, 30] }), i * 70);
  },
  // Le Dévoreur : un souffle de feu vers le plateau.
  ignaroth({ x, y, dir }) {
    const a = dir < 0 ? UP : -UP;
    for (let i = 0; i < 16; i++) later(() => burst(x, y + dir * 10, 1, [0xffd060, 0xff8a30, 0xe03a1a][i % 3],
      { tex: 'glow', a: [a - 0.3, a + 0.3], v: [4, 6.5], drag: 0.93, scale: [0.04, 0.07], grow: 0.12, ttl: [26, 36], alpha: 0.8 }), i * 22);
  },
  // Mère des couvées : un œuf de braise bat deux fois, puis éclot.
  ysmera({ x, y }) {
    const egg = new Graphics().ellipse(0, 0, 10, 14).stroke({ width: 2, color: 0xffffff }).ellipse(0, 0, 10, 14).fill({ color: 0xffffff, alpha: 0.25 }); egg.position.set(x, y); egg.tint = 0xff8030; egg.blendMode = 'add';
    anim(egg, 650, (o, k) => { o.scale.set(1 + 0.18 * Math.abs(Math.sin(k * Math.PI * 2))); o.alpha = 0.9 * (k < 0.85 ? 1 : (1 - k) / 0.15); });
    later(() => { burst(x, y, 12, [0xffd060, 0xff8030], { v: [1.5, 3.5], g: 0.06 }); glow(x, y, 0xff8030, 60, 24, 0.5); }, 620);
  },
  // Roi-liche : des âmes pâles montent en spirale.
  mordrek({ x, y }) {
    ring(x, y, 0x8fffc0, { r: 24, w: 1.5, ms: 700 });
    const { rnd, spawn, glowTex } = kit();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2;
      spawn(glowTex, x + Math.cos(a) * 14, y + Math.sin(a) * 8, { tint: 0x8fffc0, vx: Math.cos(a + Math.PI / 2) * 0.9, vy: -rnd(0.6, 1.1), drag: 0.99, scale: 0.06, ttl: rnd(55, 75), alpha: 0.8 }); }
  },
  // Nécromancienne : des ossements remontent d'une lueur verte au sol.
  ossa({ x, r }) {
    const b = r.bottom - 4; ring(x, b, 0x6fe0a0, { r: 26, ellipse: 0.3, ms: 700 });
    burst(x, b, 8, [0xe8e0c8, 0xd0c8a8], { tex: 'shard', blend: 'normal', a: [UP - 0.4, UP + 0.4], v: [2.5, 4], g: 0.12, drag: 0.99, spin: 0.2, scale: [0.5, 0.8], ttl: [35, 45] });
  },
  // Comte Valdric : des gouttes de sang convergent vers lui (Drain).
  valdric({ x, y }) { drain(x, y, 10, 60); },
  // Dame Carmilla : un cercle carmin se referme, des pétales tombent.
  carmilla({ x, y, r }) {
    ring(x, y, 0xd0304a, { r: 30, from: 1.8, to: 0.6, ms: 600, w: 2 }); drain(x, y, 6, 50, 200);
    const { rnd } = kit();
    for (let i = 0; i < 5; i++) later(() => burst(x + rnd(-r.width / 2, r.width / 2), r.top, 1, 0xc02040,
      { tex: 'shard', blend: 'normal', a: [Math.PI / 2 - 0.3, Math.PI / 2 + 0.3], v: [0.4, 0.8], g: 0.015, drag: 0.99, spin: rnd(-0.08, 0.08), scale: [0.5, 0.7], ttl: [55, 70] }), 300 + i * 80);
  },
  // Le Cartographe : une rose des vents tourne d'un quart et s'efface.
  cartographe({ x, y }) {
    const c = new Graphics().circle(0, 0, 26).stroke({ width: 1.5, color: 0xffffff });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.poly([Math.cos(a) * 34, Math.sin(a) * 34, Math.cos(a + 0.25) * 18, Math.sin(a + 0.25) * 18, Math.cos(a - 0.25) * 18, Math.sin(a - 0.25) * 18]).fill({ color: 0xffffff }); }
    c.position.set(x, y); c.tint = 0xe8d6a8; c.blendMode = 'add';
    anim(c, 900, (o, k) => { o.rotation = kit().ease(k) * Math.PI / 2; o.scale.set(0.7 + 0.3 * kit().ease(k)); o.alpha = 0.8 * Math.sin(k * Math.PI); });
  },
  // L'Érudit : trois pages s'envolent en se retournant.
  erudit({ x, y, dir }) {
    for (let i = 0; i < 3; i++) {
      const p = new Graphics().rect(-6, -8, 12, 16).fill({ color: 0xf3ead2 }).rect(-4, -4, 8, 1).rect(-4, 0, 8, 1).fill({ color: 0x9a8a68 });
      const dx = (i - 1) * 16;
      anim(p, 800, (o, k) => { const e = kit().ease(k); o.position.set(x + dx * e, y + dir * 36 * e); o.scale.x = Math.cos(k * Math.PI * 3); o.alpha = 1 - k; }, i * 90);
    }
  },
  // L'Intendant : deux sceaux d'or apparaissent l'un après l'autre (+1 sceau).
  intendant({ x, y, dir }) {
    for (let i = 0; i < 2; i++) {
      const s = new Graphics().circle(0, 0, 8).fill({ color: 0xe3b552 }).circle(0, 0, 8).stroke({ width: 1.5, color: 0x7a5418 }).circle(0, 0, 4).stroke({ width: 1, color: 0xfff0c0 });
      anim(s, 650, (o, k) => { const e = kit().ease(k); o.position.set(x + (i ? 12 : -12), y + dir * 26 * e); o.scale.set(0.5 + 0.5 * e); o.alpha = k < 0.7 ? 1 : (1 - k) / 0.3; }, i * 160);
    }
  },
};
// Drain : des gouttes partent d'un cercle autour du portrait et convergent vers lui.
function drain(x, y, n, d, delay = 0) {
  const { rnd, spawn, sparkTex } = kit();
  for (let i = 0; i < n; i++) later(() => { const a = rnd(0, Math.PI * 2), ttl = 28;
    spawn(sparkTex, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, { tint: i % 3 ? 0xc0182a : 0xff6070, vx: -Math.cos(a) * d / ttl, vy: -Math.sin(a) * d * 0.6 / ttl, drag: 1, scale: 0.3, ttl, fade: false }); }, delay + i * 35);
  later(() => glow(x, y, 0xc0182a, 50, 22, 0.45), delay + 35 * n + 300);
}

// Le général agit : son effet propre, ou à défaut un anneau et une gerbe à la couleur de sa famille.
export function power(el) {
  const k = kit(); if (!k.root || !el) return;
  const p = (el.querySelector('.gport') || el).getBoundingClientRect(); if (!p.width) return;
  const fam = getComputedStyle(el).getPropertyValue('--fam').trim(), tint = k.toNum(fam || k.COL.gold);
  const at = { x: p.left + p.width / 2, y: p.top + p.height / 2, r: p, dir: el.dataset.side === 'foe' ? 1 : -1, tint };
  const fx = POWERS[el.dataset.general];
  if (fx) fx(at); else { ring(at.x, at.y, tint); burst(at.x, at.y, 10, tint, { v: [1.5, 3] }); }
}
