// Effets PixiJS (WebGL) de l'ouverture d'un booster ou d'un coffre (opening.js), chargés à la première ouverture.
// Deux toiles posées dans le calque de l'ouverture : l'une derrière le paquet, les cartes et le coffre (lumière ambiante,
// poussière, halo d'une carte qui va briller, rayons qui tournent selon la rareté), l'autre devant (étincelles, éclats de papier,
// copeaux de bois, ondes de choc, éclair). Le paquet, les cartes et le coffre restent en HTML : toucher, clavier et lecteurs
// d'écran ne changent pas ; PixiJS lit leur place à l'écran (getBoundingClientRect) pour s'y caler.
// Sans WebGL, opening.js garde ses effets en CSS.
// Sans eval : la politique de contenu du site (CSP) l'interdit.
import 'pixi.js/unsafe-eval';
import { Application, Color, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { guardGL } from './gl-guard.js';

let back = null, front = null, ready = null, glowTex = null, sparkTex = null, shardTex = null, flakeTex = null;
let parts = [], anims = [], loops = [], dust = null;
const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const ease = k => 1 - Math.pow(1 - k, 3);
// Hauteur de la fente du coffre dans son dessin (opening.js, viewBox 200×200 : couvercle fermé sur le corps à y = 100).
const SEAM = 0.5;
const toNum = c => { try { return new Color(c).toNumber(); } catch { return 0xffe7a3; } };
const tween = (ms, update, done) => anims.push({ t: 0, ms, update, done });

function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => grd.addColorStop(at, col)); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}
const shape = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; draw(g); return Texture.from(c); };

async function makeApp() {
  const a = new Application();
  // Arrêtée tant qu'aucune ouverture n'est en cours : mount() la lance, unmount() l'arrête.
  await a.init({ backgroundAlpha: 0, resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl', autoStart: false });
  Object.assign(a.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none' });
  a.canvas.setAttribute('aria-hidden', 'true'); a.canvas.className = 'opstage'; guardGL(a.canvas);
  return a;
}
async function init() {
  back = await makeApp(); front = await makeApp();
  glowTex = radial(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  sparkTex = radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  shardTex = shape(12, 18, g => { g.beginPath(); g.moveTo(6, 0); g.lineTo(12, 7); g.lineTo(7, 18); g.lineTo(0, 9); g.closePath(); g.fill(); });
  // bout de papier déchiré : petit quadrilatère irrégulier
  flakeTex = shape(16, 10, g => { g.beginPath(); g.moveTo(0, 2); g.lineTo(9, 0); g.lineTo(16, 4); g.lineTo(12, 10); g.lineTo(3, 8); g.closePath(); g.fill(); });
  const step = t => {
    const dt = t.deltaTime;
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += t.deltaMS; const k = Math.min(1, a.t / a.ms);
      try { a.update(k); if (k >= 1) { anims.splice(i, 1); a.done?.(); } } catch { anims.splice(i, 1); } }
    for (const l of loops) { try { l(dt); } catch { /* objet déjà détruit */ } }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt;
      if (p.age >= p.ttl || p.s.destroyed) { if (!p.s.destroyed) p.s.destroy(); parts.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
      const k = p.age / p.ttl; p.s.alpha = p.fade ? (1 - k) * p.a0 : p.a0; if (p.grow) p.s.scale.set(p.sc0 + p.grow * k);
    }
  };
  front.ticker.add(step);
  // Une image hors écran avec un sprite, pour compiler les shaders maintenant plutôt qu'au premier geste de l'ouverture.
  for (const a of [back, front]) { const s = new Sprite(glowTex); a.stage.addChild(s); a.render(); s.destroy(); }
}
// Préparé à l'avance (boutique au repos, opening.js) : la première ouverture n'attend plus la création des deux toiles.
export function warm() {
  ready ||= init().then(() => true, err => { console.warn('Effets PixiJS de l\'ouverture indisponibles', err); return false; });
  return ready;
}
function spawn(app, tex, x, y, o = {}) {
  const s = new Sprite(tex); s.anchor.set(0.5); s.position.set(x, y); s.tint = o.tint ?? 0xffffff; s.blendMode = o.blend ?? 'add';
  s.scale.set(o.scale ?? 1); s.rotation = o.rot ?? 0; s.alpha = o.alpha ?? 1; app.stage.addChild(s);
  parts.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, drag: o.drag ?? 0.96, spin: o.spin ?? 0, ttl: o.ttl ?? 40, age: 0, fade: o.fade ?? true, a0: s.alpha, grow: o.grow ?? 0, sc0: s.scale.x });
  return s;
}
const box = el => { const r = el.getBoundingClientRect(); return { r, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
function ring(x, y, tint, { r = 40, width = 4, grow = 4, ttl = 40, app = front } = {}) {
  const g = new Graphics().circle(0, 0, r).stroke({ width, color: 0xffffff }); g.position.set(x, y); g.tint = tint; g.blendMode = 'add'; app.stage.addChild(g);
  parts.push({ s: g, vx: 0, vy: 0, g: 0, drag: 1, spin: 0, ttl, age: 0, fade: true, a0: 1, grow, sc0: 0.3 });
}
// Rayons de lumière qui tournent : un éventail de rayons fondus vers l'extérieur (texture dessinée une fois), derrière l'objet.
let raysTex = null;
function raysTexture() {
  if (raysTex) return raysTex;
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), m = S / 2;
  const grd = g.createRadialGradient(m, m, 0, m, m, m); grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  for (let i = 0, n = 18; i < n; i++) { const a = (i / n) * TAU, w = i % 2 ? 0.05 : 0.085;
    g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.cos(a - w) * m, m + Math.sin(a - w) * m); g.lineTo(m + Math.cos(a + w) * m, m + Math.sin(a + w) * m); g.closePath(); g.fill(); }
  return (raysTex = Texture.from(c));
}
function rays(x, y, tint, { size = 0, alpha = 0.5, speed = 0.004 } = {}) {
  const c = new Sprite(raysTexture()); c.anchor.set(0.5); c.position.set(x, y); c.tint = tint; c.blendMode = 'add'; c.alpha = 0; back.stage.addChild(c);
  const S = size || Math.max(innerWidth, innerHeight) * 1.3;
  const spin = dt => { c.rotation += speed * dt; }; loops.push(spin);
  tween(600, k => { c.alpha = alpha * ease(k); c.width = c.height = S * (0.4 + 0.6 * ease(k)); });
  return { c, stop(ms = 300) { const a0 = c.alpha; tween(ms, k => { c.alpha = a0 * (1 - k); }, () => { loops.splice(loops.indexOf(spin), 1); c.destroy(); }); } };
}

// ---- API utilisée par opening.js ----
// Pose les deux toiles dans le calque (derrière et devant son contenu). Renvoie false sans WebGL.
export function mount(root) {
  return warm().then(ok => {
    if (!ok || !root.isConnected) return false;
    back.canvas.style.zIndex = '0'; front.canvas.style.zIndex = '60';
    root.prepend(back.canvas); root.append(front.canvas); back.start(); front.start();
    // Poussière dorée qui flotte dans la lumière, et halo de lampe au-dessus de la scène.
    dust = new Container(); back.stage.addChild(dust);
    const lamp = new Sprite(glowTex); lamp.anchor.set(0.5); lamp.tint = 0xffc070; lamp.alpha = 0.18; lamp.blendMode = 'add'; dust.addChild(lamp);
    for (let i = 0; i < 34; i++) { const s = new Sprite(sparkTex); s.anchor.set(0.5); s.blendMode = 'add'; dust.addChild(mote(s, true)); }
    loops.push(dt => {
      lamp.position.set(innerWidth / 2, innerHeight * 0.42); lamp.width = innerWidth * 1.5; lamp.height = innerHeight;
      for (const s of dust.children) { if (s === lamp) continue; s.y -= s.vy * dt; s.x += Math.sin((s.y + s.seed) / 50) * 0.25 * dt; s.life -= 0.002 * dt;
        s.alpha = Math.min(1, s.life, (innerHeight - s.y) / 80) * 0.45; if (s.y < -10 || s.life <= 0) mote(s, false); }
    });
    return true;
  });
}
function mote(s, anywhere) {
  s.tint = Math.random() < 0.6 ? 0xffd38a : 0xffffff; s.scale.set(rnd(0.08, 0.26));
  return Object.assign(s, { x: rnd(0, innerWidth), y: anywhere ? rnd(0, innerHeight) : innerHeight + 10, vy: rnd(0.12, 0.45), life: rnd(0.7, 1.2), seed: rnd(0, 500) });
}
// Fin de l'ouverture : tout est effacé, les boucles s'arrêtent, les toiles sortent du calque (gardées pour la prochaine).
export function unmount(root) {
  if (!back || back.canvas.parentNode !== root) return;
  back.stop(); front.stop();
  for (const p of parts) if (!p.s.destroyed) p.s.destroy(); parts = []; anims = []; loops = []; dust = null;
  for (const a of [back, front]) { a.stage.removeChildren().forEach(c => c.destroy({ children: true })); a.canvas.remove(); }
}

// Le haut du paquet se déchire sous le doigt : quelques étincelles et miettes de papier au bord de la déchirure.
export function tear(x, y, color) {
  const tint = toNum(color);
  for (let i = 0; i < 3; i++) spawn(front, sparkTex, x, y, { tint: i ? 0xfff2c8 : tint, vx: rnd(-1.5, 1.5), vy: rnd(-2.5, -0.5), g: 0.1, scale: rnd(0.2, 0.4), ttl: rnd(18, 30) });
  spawn(front, flakeTex, x, y, { tint: toNum(color), blend: 'normal', vx: rnd(-1, 1), vy: rnd(-2, 0), g: 0.15, drag: 0.98, spin: rnd(-0.2, 0.2), rot: rnd(0, TAU), scale: rnd(0.4, 0.8), ttl: 40 });
}
// Le paquet s'ouvre : bouts de papier qui volent, lumière qui jaillit de l'ouverture, onde de choc.
export function rip(pack, color) {
  const { r, x } = box(pack), y = r.top + r.height * 0.13, tint = toNum(color);
  for (let i = 0; i < 26; i++) spawn(front, flakeTex, r.left + rnd(0, r.width), y, { tint: i % 3 ? tint : 0xe8e0c8, blend: 'normal', vx: rnd(-4, 4), vy: rnd(-7, -2), g: 0.25, drag: 0.985, spin: rnd(-0.3, 0.3), rot: rnd(0, TAU), scale: rnd(0.5, 1.1), ttl: rnd(45, 70) });
  for (let i = 0; i < 30; i++) spawn(front, sparkTex, r.left + rnd(0, r.width), y, { tint: i % 2 ? 0xfff0c0 : tint, vx: rnd(-2, 2), vy: rnd(-6, -1), g: 0.06, scale: rnd(0.25, 0.55), ttl: rnd(30, 55) });
  const beam = new Sprite(glowTex); beam.anchor.set(0.5, 1); beam.position.set(x, y + 20); beam.tint = 0xfff0c0; beam.blendMode = 'add'; back.stage.addChild(beam);
  tween(900, k => { beam.width = r.width * (1.4 + k); beam.height = r.height * 1.6 * ease(Math.min(1, k * 2)); beam.alpha = 0.9 * (1 - k); }, () => beam.destroy());
  ring(x, y, 0xfff0c0, { r: 30, width: 3, grow: r.width / 25, ttl: 35 });
}
// Carte nouvelle encore cachée : halo qui pulse derrière elle et lumière qui s'échappe par ses bords. Renvoie stop().
export function hint(card, strong) {
  const tint = strong ? 0xffb830 : 0xffe7a3, halo = new Sprite(glowTex); halo.anchor.set(0.5); halo.tint = tint; halo.blendMode = 'add'; back.stage.addChild(halo);
  let t = 0, alive = true;
  const pulse = dt => {
    if (!alive || !card.isConnected) return;
    t += dt; const { r, x, y } = box(card), k = 0.5 + Math.sin(t / 9) * 0.5;
    halo.position.set(x, y); halo.width = r.width * (1.9 + k * 0.4); halo.height = r.height * (1.6 + k * 0.3); halo.alpha = (strong ? 0.75 : 0.5) + k * 0.25;
    if (Math.random() < (strong ? 0.5 : 0.25)) { const side = Math.random() < 0.5, px = side ? (Math.random() < 0.5 ? r.left : r.right) : rnd(r.left, r.right), py = side ? rnd(r.top, r.bottom) : (Math.random() < 0.5 ? r.top : r.bottom);
      spawn(front, sparkTex, px, py, { tint, vx: (px - x) / r.width * rnd(0.5, 1.5), vy: rnd(-1.2, -0.3), scale: rnd(0.15, 0.35), ttl: rnd(25, 45) }); }
  };
  loops.push(pulse);
  return () => { if (!alive) return; alive = false; loops.splice(loops.indexOf(pulse), 1); tween(250, k => { halo.alpha *= 1 - k; }, () => halo.destroy()); };
}
// Carte retournée. level 0 : doublon (petite bouffée), 1 : nouvelle carte (rayons dorés, onde, gerbe),
// 2 : nouveau général (rayons or vif, deux ondes, éclair, pluie d'étincelles). Renvoie stop() pour les rayons.
export function reveal(card, level) {
  const { r, x, y } = box(card);
  if (!level) { for (let i = 0; i < 10; i++) { const a = rnd(0, TAU); spawn(front, sparkTex, x + Math.cos(a) * r.width * 0.45, y + Math.sin(a) * r.height * 0.45, { tint: 0xd8dce8, vx: Math.cos(a) * rnd(0.5, 1.5), vy: Math.sin(a) * rnd(0.5, 1.5), scale: rnd(0.15, 0.3), ttl: 25 }); } return () => {}; }
  const tint = level > 1 ? 0xffc23a : 0xffe7a3, rs = rays(x, y, tint, { size: r.height * (level > 1 ? 3.6 : 2.8), alpha: level > 1 ? 0.75 : 0.5, speed: level > 1 ? 0.006 : 0.004 });
  const halo = spawn(back, glowTex, x, y, { tint, scale: Math.max(r.width, r.height) / 70, ttl: 9999, fade: false, alpha: level > 1 ? 0.8 : 0.55 });
  ring(x, y, tint, { r: 50, width: 5, grow: r.width / 18, ttl: 40 });
  if (level > 1) { setTimeout(() => ring(x, y, 0xffffff, { r: 40, width: 3, grow: r.width / 14, ttl: 50 }), 140); flash(0xffe0a0, 0.35); }
  for (let i = 0; i < (level > 1 ? 70 : 34); i++) { const a = rnd(0, TAU), v = rnd(2, level > 1 ? 9 : 6);
    spawn(front, i % 5 ? sparkTex : shardTex, x, y, { tint: i % 3 ? tint : 0xffffff, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, g: 0.09, scale: rnd(0.25, 0.6), spin: rnd(-0.2, 0.2), ttl: rnd(35, 70) }); }
  if (level > 1) for (let i = 0; i < 40; i++) setTimeout(() => spawn(front, sparkTex, rnd(0, innerWidth), -10, { tint, vx: rnd(-0.5, 0.5), vy: rnd(2, 4), g: 0.03, drag: 0.995, scale: rnd(0.2, 0.45), ttl: rnd(120, 180) }), rnd(0, 900));
  return () => { rs.stop(); tween(300, k => { halo.alpha = (1 - k) * 0.6; }, () => halo.destroy()); };
}
// Carte jetée : traînée d'étincelles dans la direction du lancer.
export function toss(card, dir) {
  const { r, x, y } = box(card);
  for (let i = 0; i < 14; i++) spawn(front, sparkTex, x + rnd(-r.width / 3, r.width / 3), y + rnd(-r.height / 3, r.height / 3), { tint: 0xfff0c0, vx: dir * rnd(4, 10), vy: rnd(-1.5, 0.5), drag: 0.92, scale: rnd(0.15, 0.35), ttl: rnd(15, 28) });
}

// Coffre frappé : poussière au pied, copeaux de bois, étincelle sur la serrure, et la lumière de la fente qui grandit.
export function knock(chest, hits, color) {
  const { r, x } = box(chest), tint = toNum(color);
  for (let i = 0; i < 8 + hits * 4; i++) spawn(front, glowTex, x + rnd(-r.width / 2, r.width / 2), r.bottom - 4, { tint: 0x8a7458, blend: 'normal', vx: rnd(-2.5, 2.5), vy: rnd(-1.2, -0.2), drag: 0.93, scale: rnd(0.05, 0.1), grow: 0.15, alpha: 0.35, ttl: rnd(30, 50) });
  for (let i = 0; i < 4 + hits * 3; i++) spawn(front, shardTex, x + rnd(-r.width / 2, r.width / 2), r.top + r.height * rnd(0.4, 0.8), { tint: 0x7a4a22, blend: 'normal', vx: rnd(-4, 4), vy: rnd(-6, -2), g: 0.3, drag: 0.99, spin: rnd(-0.3, 0.3), rot: rnd(0, TAU), scale: rnd(0.5, 0.9), ttl: rnd(35, 55) });
  for (let i = 0; i < 6 + hits * 4; i++) spawn(front, sparkTex, x, r.top + r.height * SEAM, { tint: i % 2 ? tint : 0xffffff, vx: rnd(-4, 4), vy: rnd(-4, 0.5), g: 0.1, scale: rnd(0.2, 0.45), ttl: rnd(20, 40) });
}
// Lumière qui filtre par la fente du couvercle, de plus en plus forte. Rappelée à chaque coup avec la couleur du moment.
let seamGlow = null;
export function seam(chest, level, color) {
  const tint = toNum(color);
  if (!seamGlow || seamGlow.destroyed) {
    seamGlow = new Sprite(glowTex); seamGlow.anchor.set(0.5); seamGlow.blendMode = 'add'; seamGlow.alpha = 0; front.stage.addChild(seamGlow);
    const g = seamGlow; let t = 0;
    loops.push(dt => { if (g.destroyed || !chest.isConnected) return; t += dt; const { r, x } = box(chest);
      g.position.set(x, r.top + r.height * SEAM); g.width = r.width * (1 + g.lv * 0.35); g.height = r.height * (0.18 + g.lv * 0.12);
      g.alpha += ((0.35 + g.lv * 0.22 + Math.sin(t / 6) * 0.08) - g.alpha) * 0.12 * dt;
      if (Math.random() < g.lv * 0.12) spawn(front, sparkTex, x + rnd(-r.width / 2, r.width / 2), r.top + r.height * SEAM, { tint: g.tint, vx: rnd(-0.3, 0.3), vy: rnd(-2, -0.6), scale: rnd(0.15, 0.3), ttl: rnd(25, 45) }); });
  }
  seamGlow.lv = level; seamGlow.tint = tint;
}
// La lueur monte d'une rareté : onde de choc et éclair à la nouvelle couleur.
export function tierUp(chest, color) {
  const { r, x } = box(chest), y = r.top + r.height * SEAM, tint = toNum(color);
  ring(x, y, tint, { r: 40, width: 5, grow: r.width / 14, ttl: 40 }); flash(tint, 0.3);
  for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), v = rnd(2, 6); spawn(front, sparkTex, x, y, { tint: i % 3 ? tint : 0xffffff, vx: Math.cos(a) * v, vy: Math.sin(a) * v, scale: rnd(0.25, 0.5), ttl: rnd(25, 45) }); }
}
// Le couvercle saute : colonne de lumière, rayons qui tournent derrière l'art, fontaine d'étincelles, pièces d'or qui retombent.
export function chestOpen(chest, color, rarity) {
  const { r, x } = box(chest), y = r.top + r.height * SEAM, tint = toNum(color), big = rarity === 'legendaire' ? 2 : rarity === 'epique' ? 1 : 0;
  if (seamGlow && !seamGlow.destroyed) { const g = seamGlow; tween(500, k => { g.alpha = 1 - k; }, () => g.destroy()); seamGlow = null; }
  flash(tint, 0.45 + big * 0.1);
  ring(x, y, tint, { r: 50, width: 6, grow: r.width / 10, ttl: 45 }); setTimeout(() => ring(x, y, 0xffffff, { r: 40, width: 3, grow: r.width / 8, ttl: 55 }), 120);
  const pillar = new Sprite(glowTex); pillar.anchor.set(0.5, 0.9); pillar.position.set(x, y); pillar.tint = tint; pillar.blendMode = 'add'; back.stage.addChild(pillar);
  tween(1400, k => { pillar.width = r.width * (1.2 + k * 0.4); pillar.height = innerHeight * 1.1 * ease(Math.min(1, k * 2.5)); pillar.alpha = 0.85 * (1 - k * 0.7); }, () => {
    const p = pillar; loops.push(() => { if (!p.destroyed) p.alpha = 0.25 + Math.sin(performance.now() / 400) * 0.06; }); });
  // centrés sur l'art, qui finit de monter un peu au-dessus de la place du coffre (opening.css, rewardup)
  rays(x, r.top + r.height / 2 - r.width * 0.3 - 40, tint, { size: Math.max(innerWidth, innerHeight) * (1.1 + big * 0.2), alpha: 0.55 + big * 0.15, speed: 0.003 + big * 0.002 });
  for (let i = 0; i < 60 + big * 40; i++) setTimeout(() => spawn(front, i % 4 ? sparkTex : shardTex, x + rnd(-r.width / 3, r.width / 3), y,
    { tint: i % 3 ? tint : 0xffffff, vx: rnd(-4, 4), vy: rnd(-12, -5), g: 0.2, drag: 0.99, spin: rnd(-0.2, 0.2), scale: rnd(0.25, 0.6), ttl: rnd(50, 90) }), rnd(0, 500));
  // pièces d'or : petits disques qui tournent sur eux-mêmes et retombent
  for (let i = 0; i < 14 + big * 10; i++) setTimeout(() => {
    const c = new Graphics().circle(0, 0, 6).fill({ color: 0xf5c84a }).circle(0, 0, 4).stroke({ width: 1.5, color: 0xb8862a }); c.position.set(x + rnd(-20, 20), y); front.stage.addChild(c);
    let vx = rnd(-4.5, 4.5), vy = rnd(-11, -6), age = 0;
    const fall = dt => { if (c.destroyed) return; age += dt; vy += 0.35 * dt; c.x += vx * dt; c.y += vy * dt; c.scale.x = Math.cos(age / 3); if (age > 90 || c.y > innerHeight + 20) c.destroy(); };
    loops.push(fall);
  }, rnd(80, 500));
}
// Éclair plein écran, très bref.
export function flash(color = 0xffffff, alpha = 0.25) {
  const g = new Graphics().rect(0, 0, innerWidth, innerHeight).fill({ color: toNum(color) }); g.alpha = alpha; g.blendMode = 'add'; front.stage.addChild(g);
  tween(280, k => { g.alpha = alpha * (1 - k); }, () => g.destroy());
}
