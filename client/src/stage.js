// Plateau de partie dessiné avec PixiJS (WebGL), chargé seulement quand une partie commence.
// Deux toiles : la table, sous le plateau (bois éclairé, braises qui montent, lumière de la zone que chaque camp mène),
// et les effets, par-dessus (étincelles d'une carte révélée, éclats d'une carte détruite, colonne de lumière d'une zone gagnée,
// onde du général, confettis). Les cartes et les zones restent en HTML (main.js) : toucher, glisser-déposer, tutoriel et
// lecteurs d'écran ne changent pas ; PixiJS lit leur place à l'écran (getBoundingClientRect) pour s'y caler.
// Sans WebGL ou avec « réduire les animations », rien n'est chargé et fx.js garde ses effets en CSS.
import { Application, Color, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

let table = null, over = null, root = null, ready = null, embers = null, pools = [], parts = [], glowTex = null, sparkTex = null, shardTex = null;
const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const cssColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#e3b552';
let COL = {}, anims = [], fog = [], cine = null;
// Animation libre : update(k) avec k de 0 à 1 sur `ms` millisecondes, puis done().
const tween = (ms, update, done) => anims.push({ t: 0, ms, update, done });
const ease = k => 1 - Math.pow(1 - k, 3);

// Texture ronde et floue (halo) dessinée une fois dans un canevas 2D.
function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => grd.addColorStop(at, col)); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}
async function makeApp(z) {
  const a = new Application();
  await a.init({ backgroundAlpha: 0, resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl' });
  Object.assign(a.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: z, pointerEvents: 'none' });
  a.canvas.setAttribute('aria-hidden', 'true'); a.canvas.className = 'stage';
  document.body.append(a.canvas);
  return a;
}

async function init() {
  // Table sous tout le contenu de la page (z-index négatif), effets sous les feuilles (z-index 10) : panneau de fin, carte en grand.
  table = await makeApp('-1'); over = await makeApp('9');
  COL = { me: cssColor('--mine'), foe: cssColor('--foe'), gold: cssColor('--accent') };
  glowTex = radial(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  sparkTex = radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  shardTex = Texture.from((() => { const c = document.createElement('canvas'); c.width = 12; c.height = 18; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(12, 7); g.lineTo(7, 18); g.lineTo(0, 9); g.closePath(); g.fill(); return c; })());

  // Table : bois sombre éclairé par une lampe au-dessus du plateau, vignette sur les bords.
  const wood = new Graphics(); table.stage.addChild(wood);
  const lamp = new Sprite(glowTex); lamp.anchor.set(0.5); lamp.tint = 0xffc070; lamp.alpha = 0.22; lamp.blendMode = 'add'; table.stage.addChild(lamp);
  // Lumière de la zone : un halo par zone, à la couleur du camp qui la mène.
  pools = [0, 1, 2].map(() => { const s = new Sprite(glowTex); s.anchor.set(0.5); s.alpha = 0; s.blendMode = 'add'; table.stage.addChild(s); return s; });
  // Brume : deux nappes de nuages très pâles qui dérivent lentement au-dessus des planches.
  const cloud = cloudTexture();
  fog = [0, 1].map(i => { const f = new Sprite(cloud); f.anchor.set(0.5); f.alpha = 0.09; f.tint = i ? 0xd8b890 : 0xa0b0c0; table.stage.addChild(f); return Object.assign(f, { phase: i * 3, speed: i ? 0.00011 : 0.00007 }); });
  embers = new Container(); table.stage.addChild(embers);
  const drawTable = () => {
    const w = innerWidth, h = innerHeight; wood.clear().rect(0, 0, w, h).fill({ color: 0x140e0a });
    // planches : bandes verticales à peine plus claires
    for (let x = 0, i = 0; x < w; x += 46, i++) wood.rect(x, 0, 45, h).fill({ color: i % 2 ? 0x1c140e : 0x19110c });
    for (let x = 46; x < w; x += 46) wood.rect(x - 1, 0, 1, h).fill({ color: 0x0a0604, alpha: 0.8 });
    lamp.position.set(w / 2, h * 0.42); lamp.width = w * 1.6; lamp.height = h * 1.1;
  };
  drawTable(); addEventListener('resize', drawTable);
  for (let i = 0; i < 26; i++) { const e = new Sprite(sparkTex); e.anchor.set(0.5); e.blendMode = 'add'; embers.addChild(ember(e, true)); }

  table.ticker.add(t => {
    const dt = t.deltaTime;
    for (const e of embers.children) { e.y -= e.vy * dt; e.x += Math.sin((e.y + e.seed) / 40) * 0.3 * dt; e.alpha = Math.min(1, e.life) * 0.7; e.life -= 0.003 * dt;
      if (e.y < -10 || e.life <= 0) ember(e, false); }
    const now = performance.now();
    fog.forEach(f => { f.width = innerWidth * 2.2; f.height = innerHeight * 0.9; f.x = innerWidth / 2 + Math.sin(now * f.speed + f.phase) * innerWidth * 0.35; f.y = innerHeight * (0.3 + 0.35 * f.phase / 3) + Math.cos(now * f.speed * 1.3) * 30; });
    const zones = root?.querySelectorAll('.board > .zone') || [];
    pools.forEach((p, z) => {
      const el = zones[z]; if (!el) { p.alpha = 0; return; }
      const r = el.getBoundingClientRect(), lead = el.querySelector('.v.lead.me') ? 'me' : el.querySelector('.v.lead.foe') ? 'foe' : null;
      p.position.set(r.left + r.width / 2, lead === 'me' ? r.bottom - r.height * 0.25 : r.top + r.height * 0.25);
      p.width = r.width * 1.9; p.height = r.height * 0.9;
      if (lead) p.tint = COL[lead];
      p.alpha += ((lead ? 0.32 : 0) - p.alpha) * 0.05 * dt;
    });
  });
  over.ticker.add(t => {
    const dt = t.deltaTime;
    // Une animation dont l'objet a été retiré entre-temps (bandeau remplacé, sortie de partie) s'arrête sans bloquer les autres.
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += t.deltaMS; const k = Math.min(1, a.t / a.ms);
      try { a.update(k); if (k >= 1) { anims.splice(i, 1); a.done?.(); } } catch { anims.splice(i, 1); } }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt;
      if (p.age >= p.ttl) { p.s.destroy(); parts.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
      const k = p.age / p.ttl; p.s.alpha = p.fade ? (1 - k) * p.a0 : p.a0; if (p.grow) p.s.scale.set(p.sc0 + p.grow * k);
    }
  });
}
// Nuage : quelques halos superposés dans un canevas 2D, flou et sans bord.
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 18; i++) { const x = rnd(80, 432), y = rnd(80, 176), r = rnd(40, 110), grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256); }
  return Texture.from(c);
}
// Braise : repart du bas de l'écran (ou de n'importe où, au début) et monte en ondulant.
function ember(s, anywhere) {
  s.tint = Math.random() < 0.7 ? 0xffa040 : 0xffe0a0; s.scale.set(rnd(0.12, 0.35));
  return Object.assign(s, { x: rnd(0, innerWidth), y: anywhere ? rnd(0, innerHeight) : innerHeight + 10, vy: rnd(0.15, 0.6), life: rnd(0.6, 1), seed: rnd(0, 500) });
}

// Une particule d'effet : position, vitesse (px par image à 60 i/s), durée de vie en images.
const MAX_PARTS = 160;
function spawn(tex, x, y, o) {
  // Plafond : quand trop d'effets se chevauchent, les nouvelles particules sont simplement omises.
  if (parts.length >= MAX_PARTS) return;
  const s = new Sprite(tex); s.anchor.set(0.5); s.position.set(x, y); s.tint = o.tint ?? 0xffffff; s.blendMode = o.blend ?? 'add';
  s.scale.set(o.scale ?? 1); s.rotation = o.rot ?? 0; s.alpha = o.alpha ?? 1; over.stage.addChild(s);
  parts.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, drag: o.drag ?? 0.96, spin: o.spin ?? 0, ttl: o.ttl ?? 40, age: 0, fade: o.fade ?? true, a0: s.alpha, grow: o.grow ?? 0, sc0: s.scale.x });
}
const centerOf = el => { const r = el.getBoundingClientRect(); return { r, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const toNum = c => { try { return new Color(c).toNumber(); } catch { return 0xe3b552; } };

// ---- API utilisée par fx.js ----
// Charge PixiJS pour la durée de la partie et pose la table sous #app. Renvoie false si ce n'est pas possible.
export function enter(app) {
  root = app;
  ready ||= init().then(() => true, err => { console.warn('Plateau PixiJS indisponible', err); return false; });
  return ready.then(ok => { if (ok) { table.canvas.style.display = over.canvas.style.display = ''; table.start(); over.start(); document.body.classList.add('staged'); } return ok; });
}
// Retour aux menus : les toiles sont cachées et leurs boucles arrêtées (rien ne tourne hors partie).
export function leave() {
  document.body.classList.remove('staged');
  if (!table) return;
  table.stop(); over.stop(); table.canvas.style.display = over.canvas.style.display = 'none';
  for (const p of parts) p.s.destroy(); parts = [];
  anims = []; over.stage.removeChildren().forEach(c => c.destroy()); cine = null; root?.style.removeProperty('transform');
}
export const active = () => !!table && document.body.classList.contains('staged');

// Carte révélée : gerbe d'étincelles à la couleur de sa famille (ou de son camp) et éclair blanc.
export function reveal(el, color) {
  if (!active() || !el) return;
  const { r, x, y } = centerOf(el), tint = toNum(color || COL.gold);
  spawn(glowTex, x, y, { tint, scale: Math.max(r.width, r.height) / 130, ttl: 20, grow: 0.3, alpha: 0.6 });
  for (let i = 0; i < 12; i++) { const a = rnd(0, TAU), v = rnd(1.2, 3.5);
    spawn(sparkTex, x + rnd(-r.width / 3, r.width / 3), y + rnd(-r.height / 3, r.height / 3), { tint: i % 3 ? tint : 0xffffff, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.08, scale: rnd(0.25, 0.6), ttl: rnd(30, 55) }); }
}
// Carte détruite : elle vole en éclats qui retombent.
export function shatter(rect, color) {
  if (!active() || !rect) return;
  const tint = toNum(color || '#c9b28a');
  for (let i = 0; i < 18; i++) spawn(shardTex, rect.left + rnd(0, rect.width), rect.top + rnd(0, rect.height),
    { tint, blend: 'normal', vx: rnd(-3, 3), vy: rnd(-4, -1), g: 0.22, drag: 0.99, spin: rnd(-0.25, 0.25), rot: rnd(0, TAU), scale: rnd(0.6, 1.3), ttl: rnd(40, 60) });
  for (let i = 0; i < 10; i++) spawn(sparkTex, rect.left + rnd(0, rect.width), rect.top + rnd(0, rect.height), { tint: 0xffb060, vx: rnd(-2, 2), vy: rnd(-3, 0), scale: rnd(0.2, 0.4), ttl: 30 });
  shake(4);
}
// Zone qui change de camp, ou gagnée en fin de partie : colonne de lumière qui monte, poussière dorée.
export function zone(el, side, strong = false) {
  if (!active() || !el) return;
  const { r, x } = centerOf(el), tint = toNum(COL[side] || COL.gold);
  spawn(glowTex, x, r.top + r.height / 2, { tint, scale: r.width / 120, ttl: strong ? 70 : 40, grow: 0.25, alpha: strong ? 0.6 : 0.35 });
  for (let i = 0; i < (strong ? 22 : 8); i++) spawn(sparkTex, r.left + rnd(0, r.width), r.bottom - rnd(0, r.height * 0.3),
    { tint: i % 4 ? tint : 0xffffff, vx: rnd(-0.3, 0.3), vy: rnd(-3, -1), drag: 0.985, scale: rnd(0.15, 0.35), ttl: rnd(35, strong ? 70 : 50) });
}
// Le général entre en action : deux ondes de choc et des étincelles à la couleur de sa famille.
export function general(el, color) {
  if (!active() || !el) return;
  const { r, x, y } = centerOf(el), tint = toNum(color || COL.gold);
  for (const [d, w] of [[0, 4], [8, 2]]) setTimeout(() => {
    const g = new Graphics().circle(0, 0, 40).stroke({ width: w, color: 0xffffff }); g.position.set(x, y); g.tint = tint; g.blendMode = 'add'; over.stage.addChild(g);
    parts.push({ s: g, vx: 0, vy: 0, g: 0, drag: 1, spin: 0, ttl: 45, age: 0, fade: true, a0: 1, grow: Math.max(r.width, r.height) / 30, sc0: 0.4 });
  }, d * 16);
  for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), v = rnd(2, 6); spawn(sparkTex, x, y, { tint, vx: Math.cos(a) * v, vy: Math.sin(a) * v, scale: rnd(0.25, 0.5), ttl: rnd(30, 50) }); }
}
// Victoire : confettis qui tombent du haut de l'écran en tournoyant.
export function confetti() {
  if (!active()) return;
  const tints = [COL.me, COL.gold, '#6cc583', '#ffffff'].map(toNum);
  for (let i = 0; i < 90; i++) setTimeout(() => spawn(shardTex, rnd(0, innerWidth), -20,
    { tint: tints[i % 4], blend: 'normal', vx: rnd(-1.5, 1.5), vy: rnd(1, 3), g: 0.05, drag: 0.995, spin: rnd(-0.2, 0.2), rot: rnd(0, TAU), scale: rnd(0.6, 1.1), ttl: rnd(120, 170), fade: false }), rnd(0, 600));
}

// Tremblement de l'écran : le plateau (HTML) est secoué quelques images, d'autant plus fort que le coup est grand.
export function shake(px = 3, ms = 260) {
  if (!active() || !root?.animate) return;
  const f = []; for (let i = 0; i < 7; i++) { const k = 1 - i / 7; f.push({ transform: `translate(${rnd(-px, px) * k}px, ${rnd(-px, px) * k}px)` }); }
  f.push({ transform: 'none' }); root.animate(f, { duration: ms, easing: 'linear' });
}
// Carte qui tombe sur le plateau : onde de choc au sol, et un léger tremblement si elle frappe fort.
export function impact(el, color, power = 0) {
  if (!active() || !el) return;
  const { r, x } = centerOf(el), tint = toNum(color || COL.gold);
  const ring = new Graphics().ellipse(0, 0, 40, 18).stroke({ width: 2, color: 0xffffff }); ring.position.set(x, r.bottom - 4); ring.tint = tint; ring.blendMode = 'add'; ring.alpha = 0; over.stage.addChild(ring);
  tween(360, k => { ring.scale.set(0.4 + ease(k) * (0.6 + r.width / 110)); ring.alpha = 0.8 * (1 - k); }, () => ring.destroy());
  if (power >= 5) shake(Math.min(5, power - 3));
}
// Traînée d'étincelles derrière une carte qu'on fait glisser.
export function trail(x, y) {
  if (!active()) return;
  spawn(sparkTex, x + rnd(-10, 10), y + rnd(-10, 10), { tint: toNum(COL.gold), vx: rnd(-0.4, 0.4), vy: rnd(-0.6, 0.2), scale: rnd(0.2, 0.4), ttl: rnd(18, 30) });
}
// Annonce au milieu du plateau (Tour 3, Révélation, Dernier tour) : bandeau sombre qui s'ouvre, filets d'or,
// titre qui glisse en se resserrant, reflet de lumière qui le traverse, puis tout s'efface vers le haut.
export function banner(board, title, sub = '', tone = '') {
  if (!active() || !board) return false;
  for (const c of over.stage.children.filter(c => c.label === 'banner')) c.destroy({ children: true });
  const r = board.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = innerWidth, h = 78;
  const edge = toNum(tone === 'reveal' ? COL.foe : tone === 'last' ? '#f07a66' : COL.gold);
  const c = new Container(); c.label = 'banner'; c.position.set(0, cy); over.stage.addChild(c);
  const band = new Graphics().rect(0, -h / 2, w, h).fill({ color: 0x0c0806, alpha: 0.82 })
    .rect(0, -h / 2, w, 2).fill({ color: edge }).rect(0, h / 2 - 2, w, 2).fill({ color: edge });
  const glow = new Sprite(glowTex); glow.anchor.set(0.5); glow.position.set(cx, 0); glow.width = w * 1.2; glow.height = h * 2.2; glow.tint = edge; glow.alpha = 0.35; glow.blendMode = 'add';
  const t = new Text({ text: title.toUpperCase(), style: { fontFamily: 'Cinzel, Alegreya SC, serif', fontWeight: '700', fontSize: 34, fill: tone === 'last' ? 0xffb0a0 : 0xffe8b0,
    stroke: { color: 0x2a1606, width: 4 }, dropShadow: { color: edge, blur: 12, distance: 0, alpha: 0.9 }, letterSpacing: 4 } });
  t.anchor.set(0.5); t.position.set(cx, sub ? -8 : 0);
  const st = sub ? new Text({ text: sub.toUpperCase(), style: { fontFamily: 'Alegreya Sans, sans-serif', fontWeight: '700', fontSize: 12, fill: edge, letterSpacing: 3 } }) : null;
  if (st) { st.anchor.set(0.5); st.position.set(cx, 22); }
  const sweep = new Sprite(glowTex); sweep.anchor.set(0.5); sweep.height = h * 1.4; sweep.width = 60; sweep.alpha = 0.7; sweep.blendMode = 'add';
  c.addChild(glow, band, t, sweep); if (st) c.addChild(st);
  if (tone === 'reveal') flash(edge, 0.18);
  tween(1400, k => {
    const open = Math.min(1, k / 0.12), out = k > 0.8 ? (k - 0.8) / 0.2 : 0;
    band.scale.y = ease(open); glow.alpha = 0.35 * ease(open) * (1 - out);
    t.x = cx + (1 - ease(Math.min(1, k / 0.2))) * -60; t.style.letterSpacing = 4 + (1 - ease(Math.min(1, k / 0.25))) * 18;
    sweep.x = -80 + (w + 160) * Math.min(1, Math.max(0, (k - 0.15) / 0.4));
    c.alpha = 1 - out; c.y = cy - out * 12;
  }, () => c.destroy({ children: true }));
  return true;
}
// Éclair plein écran, très bref.
export function flash(color = 0xffffff, alpha = 0.25) {
  if (!active()) return;
  const g = new Graphics().rect(0, 0, innerWidth, innerHeight).fill({ color }); g.alpha = alpha; g.blendMode = 'add'; over.stage.addChild(g);
  tween(260, k => { g.alpha = alpha * (1 - k); }, () => g.destroy());
}
// Fin de partie : rayons de lumière qui tournent derrière un grand titre, en haut de l'écran, au-dessus du résultat.
// Or pour une victoire, rouge sombre pour une défaite, gris pour une égalité. Ils restent jusqu'à la sortie de la partie.
export function ending(result) {
  if (!active()) return;
  cine?.destroy({ children: true });
  const tint = result === 'win' ? 0xffd070 : result === 'lose' ? 0xb03a2a : 0xa0a8b8, x = innerWidth / 2, y = Math.min(innerHeight * 0.2, 170);
  const c = cine = new Container(); over.stage.addChild(c);
  const rays = new Container(); rays.position.set(x, y);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, len = Math.max(innerWidth, innerHeight);
    rays.addChild(new Graphics().poly([0, 0, Math.cos(a - 0.09) * len, Math.sin(a - 0.09) * len, Math.cos(a + 0.09) * len, Math.sin(a + 0.09) * len]).fill({ color: 0xffffff, alpha: 0.13 })); }
  rays.tint = tint; rays.blendMode = 'add';
  const halo = new Sprite(glowTex); halo.anchor.set(0.5); halo.position.set(x, y); halo.width = halo.height = 360; halo.tint = tint; halo.blendMode = 'add'; halo.alpha = 0.7;
  const label = result === 'win' ? 'Victoire' : result === 'lose' ? 'Défaite' : 'Égalité';
  const t = new Text({ text: label.toUpperCase(), style: { fontFamily: 'Cinzel, Alegreya SC, serif', fontWeight: '900', fontSize: 52, fill: result === 'win' ? 0xfff0c0 : 0xf1e6cf,
    stroke: { color: 0x1a0c04, width: 6 }, dropShadow: { color: tint, blur: 18, distance: 0, alpha: 1 }, letterSpacing: 6 } });
  t.anchor.set(0.5); t.position.set(x, y);
  c.addChild(rays, halo, t);
  if (result === 'win') flash(0xffe0a0, 0.3);
  tween(900, k => { const e = ease(k); t.scale.set(1.8 - 0.8 * e); t.alpha = e; rays.alpha = e; halo.alpha = 0.7 * e; });
  over.ticker.add(function spin(tk) { if (c.destroyed) { over.ticker.remove(spin); return; } rays.rotation += 0.0025 * tk.deltaTime; halo.alpha = 0.55 + Math.sin(performance.now() / 500) * 0.15; });
  for (let i = 0; i < 40; i++) { const a = rnd(0, TAU), v = rnd(1, 4); spawn(sparkTex, x, y, { tint, vx: Math.cos(a) * v, vy: Math.sin(a) * v, scale: rnd(0.3, 0.6), ttl: rnd(50, 90) }); }
}
// Nouvelle partie (revanche) : la fin de partie s'efface.
export function clearEnding() { cine?.destroy({ children: true }); cine = null; }

// Outils partagés avec les effets des généraux (stage-generals.js), lus à chaque appel : la table peut être recréée.
export const kit = () => ({ over, root, COL, glowTex, sparkTex, shardTex, spawn, tween, ease, rnd, toNum, TAU });
