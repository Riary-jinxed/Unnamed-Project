// Plateau de partie dessiné avec PixiJS (WebGL), chargé au premier écran (menus) ou à la première partie.
// Dans les menus, les mêmes toiles montrent seulement la brume, les braises et la lampe (plus les effets de stage-menu.js).
// Deux toiles : la table, sous le plateau (bois éclairé, braises qui montent, lumière de la zone que chaque camp mène),
// et les effets, par-dessus (étincelles d'une carte révélée, éclats d'une carte détruite, colonne de lumière d'une zone gagnée,
// onde du général, confettis). Les cartes et les zones restent en HTML (main.js) : toucher, glisser-déposer, tutoriel et
// lecteurs d'écran ne changent pas ; PixiJS lit leur place à l'écran (getBoundingClientRect) pour s'y caler.
// Sans WebGL ou avec « réduire les animations », rien n'est chargé et fx.js garde ses effets en CSS.
import { Application, Color, Container, Graphics, Sprite, Text, Texture, UPDATE_PRIORITY } from 'pixi.js';
import { palette, tableLook, season } from './season.js';
import { t } from '@jeu/engine/i18n';

let table = null, over = null, root = null, ready = null, embers = null, pools = [], parts = [], glowTex = null, sparkTex = null, shardTex = null, gameBg = null;
let mode = null;
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
// Toile plein écran. La table n'a que des lueurs floues et des planches sombres : elle est dessinée en définition 1, sans lissage,
// ce qui divise par quatre les pixels à remplir sur un téléphone (écran de définition 2 ou 3) sans différence visible.
async function makeApp(z, sharp = true) {
  const a = new Application();
  await a.init({ backgroundAlpha: 0, resizeTo: window, antialias: sharp, autoDensity: true, resolution: sharp ? Math.min(devicePixelRatio || 1, 2) : 1, preference: 'webgl' });
  Object.assign(a.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: z, pointerEvents: 'none' });
  a.canvas.setAttribute('aria-hidden', 'true'); a.canvas.className = 'stage';
  document.body.append(a.canvas);
  return a;
}

async function init() {
  // Table sous tout le contenu de la page (z-index négatif), effets sous les feuilles (z-index 10) : panneau de fin, carte en grand.
  table = await makeApp('-1', false); over = await makeApp('9');
  // La table ne bouge que lentement (braises, brume, lumière des zones) : 30 images par seconde lui suffisent.
  table.ticker.maxFPS = 30;
  // Les effets ne sont dessinés que quand il y a quelque chose à montrer (plus une dernière fois pour effacer la toile) :
  // la plupart du temps la toile est vide et le téléphone n'a rien à redessiner.
  let drawn = false;
  over.ticker.remove(over.render, over);
  // Un conteneur vide gardé d'une scène à l'autre (chauves-souris des menus) ne compte pas.
  const shows = c => c.visible && !(c.constructor === Container && !c.children.length);
  over.ticker.add(() => { const busy = over.stage.children.some(shows); if (busy || drawn) over.render(); drawn = busy; }, null, UPDATE_PRIORITY.LOW);
  COL = { me: cssColor('--mine'), foe: cssColor('--foe'), gold: cssColor('--accent') };
  glowTex = radial(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  sparkTex = radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  shardTex = Texture.from((() => { const c = document.createElement('canvas'); c.width = 12; c.height = 18; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(12, 7); g.lineTo(7, 18); g.lineTo(0, 9); g.closePath(); g.fill(); return c; })());

  // Table : bois sombre éclairé par une lampe au-dessus du plateau, vignette sur les bords (aux couleurs du thème : tableLook).
  // Planches et lumières des zones : seulement en partie.
  gameBg = new Container(); table.stage.addChild(gameBg);
  const wood = new Graphics(); gameBg.addChild(wood);
  const lamp = new Sprite(glowTex); lamp.anchor.set(0.5); lamp.alpha = 0.22; lamp.blendMode = 'add'; table.stage.addChild(lamp);
  // Seconde lueur, en bas (thèmes de saison : violet d'Halloween, magenta de Néon 2099).
  const low = new Sprite(glowTex); low.anchor.set(0.5); low.alpha = 0.16; low.blendMode = 'add'; gameBg.addChild(low);
  // Néon 2099 : ligne de balayage qui descend lentement sur la grille.
  const scan = new Graphics(); scan.blendMode = 'add'; gameBg.addChild(scan);
  // Lumière de la zone : un halo par zone, à la couleur du camp qui la mène.
  pools = [0, 1, 2].map(() => { const s = new Sprite(glowTex); s.anchor.set(0.5); s.alpha = 0; s.blendMode = 'add'; gameBg.addChild(s); return s; });
  // Brume : deux nappes de nuages très pâles qui dérivent lentement au-dessus des planches.
  const cloud = cloudTexture();
  fog = [0, 1].map(i => { const f = new Sprite(cloud); f.anchor.set(0.5); f.alpha = 0.09; f.tint = i ? 0xd8b890 : 0xa0b0c0; table.stage.addChild(f); return Object.assign(f, { phase: i * 3, speed: i ? 0.00011 : 0.00007 }); });
  embers = new Container(); table.stage.addChild(embers);
  // Éclipse d'Ignaroth : couronne de feu du soleil noir, qui respire lentement.
  const corona = new Sprite(glowTex); corona.anchor.set(0.5); corona.blendMode = 'add'; corona.visible = false; gameBg.addChild(corona);
  // Table du thème affiché (tableLook de season.js) : planches de bois, ou grille néon pour Néon 2099. Redessinée quand le thème change.
  let drawnLook = null;
  const drawTable = () => {
    const w = innerWidth, h = innerHeight, L = drawnLook = tableLook(); wood.clear().rect(0, 0, w, h).fill({ color: L.ground });
    if (L.planks) {
      // planches : bandes verticales à peine plus claires
      for (let x = 0, i = 0; x < w; x += 46, i++) wood.rect(x, 0, 45, h).fill({ color: L.planks[i % 2] });
      for (let x = 46; x < w; x += 46) wood.rect(x - 1, 0, 1, h).fill({ color: L.seam, alpha: 0.8 });
    }
    if (L.grid) {
      // grille holographique, plus serrée et plus vive vers le bas (comme vue en perspective)
      for (let y = 0, k = 0; y < h; k++, y += 18 + k * 1.5) wood.rect(0, h - y, w, 1).fill({ color: L.grid, alpha: 0.05 + 0.1 * (1 - y / h) });
      for (let x = (w / 2) % 32; x < w; x += 32) wood.rect(x, 0, 1, h).fill({ color: L.grid, alpha: 0.06 });
    }
    lamp.tint = L.lamp; lamp.position.set(w / 2, h * 0.42); lamp.width = w * 1.6; lamp.height = h * 1.1;
    low.visible = !!L.low; if (L.low) { low.tint = L.low; low.position.set(w / 2, h * 1.02); low.width = w * 1.8; low.height = h * 0.7; }
    corona.visible = !!L.sun;
    if (L.sun) {
      // soleil noir en haut à droite, cerclé de feu, et des failles de lave qui luisent entre les planches du bas
      const sx = w * 0.84, sy = h * 0.09, sr = Math.min(w, h) * 0.065;
      corona.position.set(sx, sy); corona.width = corona.height = sr * 7; corona.tint = 0xff4a1a;
      wood.circle(sx, sy, sr * 1.5).fill({ color: 0xff6a2a, alpha: 0.12 }).circle(sx, sy, sr * 1.12).fill({ color: 0xffb060, alpha: 0.5 })
        .circle(sx, sy, sr * 1.04).fill({ color: 0xffe0b0, alpha: 0.6 }).circle(sx, sy, sr).fill({ color: 0x000000 });
      for (const [x0, len, k] of [[0.08, 0.3, 1], [0.55, 0.22, -1], [0.78, 0.18, 1]]) {
        const pts = []; for (let i = 0; i <= 8; i++) pts.push(w * (x0 + len * i / 8), h - 6 - (i % 2 ? 10 : 2) * k - i * 1.5);
        wood.poly(pts, false).stroke({ width: 6, color: 0xff3a0a, alpha: 0.12 }).poly(pts, false).stroke({ width: 1.5, color: 0xff8a3a, alpha: 0.6 });
      }
    }
    if (L.stars) {
      // Ciel d'Elyndra : voie lactée en diagonale, champ d'étoiles fixe (même tirage à chaque dessin) et deux constellations reliées d'or
      let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 9; i++) { const k = i / 8; wood.circle(w * (0.1 + 0.8 * k), h * (0.85 - 0.7 * k), Math.max(w, h) * 0.16).fill({ color: i % 2 ? 0x3a2a8a : 0x1a3a8a, alpha: 0.07 }); }
      for (let i = 0; i < 160; i++) { const r = rand() < 0.9 ? 0.8 : 1.6; wood.circle(rand() * w, rand() * h, r).fill({ color: rand() < 0.2 ? 0xfff0b0 : 0xd8e4ff, alpha: 0.35 + rand() * 0.5 }); }
      for (const pts of [[[0.06, 0.08], [0.14, 0.05], [0.2, 0.11], [0.27, 0.07], [0.31, 0.14]], [[0.7, 0.9], [0.78, 0.86], [0.85, 0.92], [0.93, 0.87], [0.88, 0.97]]]) {
        const xy = pts.map(([x, y]) => [x * w, y * h]);
        wood.poly(xy.flat(), false).stroke({ width: 1, color: 0xe8c050, alpha: 0.35 });
        for (const [x, y] of xy) wood.circle(x, y, 2.2).fill({ color: 0xfff2c0, alpha: 0.9 }).circle(x, y, 6).fill({ color: 0xfff2c0, alpha: 0.12 });
      }
    }
    if (L.waves) {
      // Estampe d'Ysmera : papier, grand soleil rouge en haut à droite, et vagues seigaiha (écailles de cercles) le long du bas
      const sx = w * 0.82, sy = h * 0.1, sr = Math.min(w, h) * 0.09;
      wood.circle(sx, sy, sr).fill({ color: 0xc8281a, alpha: 0.85 });
      const R = 22;
      for (let row = 4; row >= 0; row--) for (let x = (row % 2) * R; x < w + R; x += R * 2) {
        const y = h - row * R * 0.5;
        for (let k = 4; k >= 1; k--) wood.circle(x, y, R * k / 4).fill({ color: k % 2 ? 0x2a5a7a : 0xefe2c4, alpha: 0.9 - row * 0.12 });
      }
    }
    if (L.forest) {
      // Bois de Sylvaën : rais de lumière qui tombent en biais à travers la canopée, mousse sur le sol, racines qui sortent des bords
      for (const [x0, wd] of [[0.12, 0.08], [0.38, 0.05], [0.62, 0.1], [0.86, 0.06]]) {
        const x = w * x0, b = w * wd; wood.poly([x, 0, x + b, 0, x + b + h * 0.35, h, x + h * 0.35, h]).fill({ color: 0xe8ffb0, alpha: 0.035 });
      }
      for (let i = 0; i < 14; i++) { const k = i / 13; wood.ellipse(w * k, h * (0.92 + 0.06 * Math.sin(i * 2.3)), w * 0.12, h * 0.05).fill({ color: i % 2 ? 0x1a3a1c : 0x224a22, alpha: 0.55 }); }
      for (const [side, y0] of [[0, 0.7], [1, 0.82], [0, 0.9], [1, 0.6]]) {
        const sx = side ? w : 0, d = side ? -1 : 1, pts = [];
        for (let i = 0; i <= 6; i++) pts.push(sx + d * i * w * 0.05, h * y0 + Math.sin(i * 1.3 + y0 * 9) * 10 + i * 4);
        wood.poly(pts, false).stroke({ width: 7, color: 0x2a1c10, alpha: 0.8 }).poly(pts, false).stroke({ width: 2, color: 0x4a3420, alpha: 0.7 });
      }
    }
    if (L.dawn) {
      // Aube de Séraphine : ciel qui s'éclaire vers le bas, soleil levant derrière une mer de nuages, rayons en éventail
      for (let i = 0; i < 12; i++) { const k = i / 11; wood.rect(0, h * k, w, h / 11 + 1).fill({ color: [0x140e1a, 0x241830, 0x3a2040, 0x5a2a48, 0x8a3a50][Math.min(4, Math.floor(k * 5))], alpha: 0.35 + k * 0.3 }); }
      const cx = w / 2, cy = h * 1.02;
      for (let i = 0; i < 16; i++) { const a = Math.PI + (i + 0.5) / 16 * Math.PI, len = Math.max(w, h) * 1.2;
        wood.poly([cx, cy, cx + Math.cos(a - 0.04) * len, cy + Math.sin(a - 0.04) * len, cx + Math.cos(a + 0.04) * len, cy + Math.sin(a + 0.04) * len]).fill({ color: 0xffe0a0, alpha: 0.04 }); }
      wood.circle(cx, cy, Math.min(w, h) * 0.22).fill({ color: 0xffd890, alpha: 0.25 }).circle(cx, cy, Math.min(w, h) * 0.14).fill({ color: 0xfff4d0, alpha: 0.5 });
      for (let i = 0; i < 12; i++) wood.circle(w * (i / 11), h * (0.97 + 0.03 * Math.sin(i * 1.7)), w * 0.1).fill({ color: 0xffe8f0, alpha: 0.35 });
    }
    if (L.moon) {
      // pleine lune pâle en haut à droite, avec son halo, et quelques pierres tombales penchées sur les bords du bas
      const mx = w * 0.82, my = h * 0.1, mr = Math.min(w, h) * 0.07;
      wood.circle(mx, my, mr * 2.6).fill({ color: 0xffe6a0, alpha: 0.04 }).circle(mx, my, mr * 1.6).fill({ color: 0xffe6a0, alpha: 0.07 })
        .circle(mx, my, mr).fill({ color: 0xf6ead0, alpha: 0.32 }).circle(mx - mr * 0.3, my - mr * 0.2, mr * 0.18).fill({ color: 0xc8b890, alpha: 0.25 });
      for (const [x, s, tilt] of [[0.04, 1, -0.12], [0.13, 0.7, 0.08], [0.9, 0.85, 0.1], [0.97, 1.1, -0.06]]) {
        const tw = 34 * s, th = 46 * s, bx = w * x, by = h + 4;
        const pts = [[-tw / 2, 0], [-tw / 2, -th + tw / 2], [0, -th], [tw / 2, -th + tw / 2], [tw / 2, 0]].map(([px, py]) => [bx + px * Math.cos(tilt) - py * Math.sin(tilt), by + px * Math.sin(tilt) + py * Math.cos(tilt)]);
        wood.poly(pts.flat()).fill({ color: 0x241830, alpha: 0.9 });
      }
    }
  };
  drawTable(); addEventListener('resize', drawTable);
  for (let i = 0; i < 26; i++) { const e = new Sprite(sparkTex); e.anchor.set(0.5); e.blendMode = 'add'; embers.addChild(ember(e, true)); }

  table.ticker.add(t => {
    const dt = t.deltaTime;
    if (drawnLook !== tableLook()) drawTable();
    if (corona.visible) corona.alpha = 0.32 + Math.sin(performance.now() / 900) * 0.1;
    // Éclipse : quelques cendres tombent aussi sur la partie, rares pour ne pas gêner la lecture des cartes.
    if (mode === 'game' && drawnLook.sun && Math.random() < 0.015 * dt) { const vy = rnd(0.5, 0.9), hot = Math.random() < 0.3;
      spawn(sparkTex, rnd(0, innerWidth), -8, { tint: hot ? 0xff6a2a : 0x7a6a66, blend: hot ? 'add' : 'normal', vx: rnd(-0.3, 0.1), vy, drag: 1, scale: rnd(0.06, 0.12), ttl: innerHeight / vy, alpha: rnd(0.35, 0.6) }); }
    scan.clear();
    if (drawnLook.grid) { const y = (performance.now() / 18) % (innerHeight + 120) - 60;
      scan.rect(0, y, innerWidth, 2).fill({ color: drawnLook.grid, alpha: 0.18 }).rect(0, y - 24, innerWidth, 24).fill({ color: drawnLook.grid, alpha: 0.025 }); }
    for (const e of embers.children) { e.y -= e.vy * dt; e.x += Math.sin((e.y + e.seed) / 40) * 0.3 * dt; e.alpha = Math.min(1, e.life) * 0.7; e.life -= 0.003 * dt;
      if (e.y < -10 || e.life <= 0) ember(e, false); }
    const now = performance.now();
    fog.forEach((f, i) => { f.tint = palette().fog[i]; f.width = innerWidth * 2.2; f.height = innerHeight * 0.9; f.x = innerWidth / 2 + Math.sin(now * f.speed + f.phase) * innerWidth * 0.35; f.y = innerHeight * (0.3 + 0.35 * f.phase / 3) + Math.cos(now * f.speed * 1.3) * 30; });
    // Place et camp de chaque zone relus quelques fois par seconde seulement (lire la page à chaque image force le navigateur à la remettre en page).
    if ((zoneRead -= t.deltaMS) <= 0) { zoneRead = 120; readZones(); }
    pools.forEach((p, z) => {
      const zs = zoneState[z]; if (!zs) { p.alpha = 0; return; }
      const { r, lead } = zs;
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
// Zones du plateau : rectangle à l'écran et camp qui la mène.
let zoneState = [], zoneRead = 0;
function readZones() {
  const zones = root?.querySelectorAll('.board > .zone') || [];
  zoneState = [0, 1, 2].map(z => { const el = zones[z]; if (!el) return null;
    return { r: el.getBoundingClientRect(), lead: el.querySelector('.v.lead.me') ? 'me' : el.querySelector('.v.lead.foe') ? 'foe' : null }; });
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
  const e = palette().embers; s.tint = e[Math.floor(Math.random() * e.length)]; s.scale.set(rnd(0.12, 0.35));
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
// Charge PixiJS et pose les toiles sous #app, pour une partie ('game') ou les menus ('menu'). Renvoie false si ce n'est pas possible.
// La table tourne toujours à 30 images par seconde ; les effets aussi dans les menus, pour ménager la batterie.
export function enter(app, scene = 'game') {
  root = app;
  ready ||= init().then(() => true, err => { console.warn('Plateau PixiJS indisponible', err); return false; });
  return ready.then(ok => {
    if (!ok) return ok;
    if (mode !== scene) clear();
    mode = scene; gameBg.visible = scene === 'game';
    for (const a of [table, over]) { a.ticker.maxFPS = scene === 'game' && a === over ? 0 : 30; a.canvas.style.display = ''; a.start(); }
    document.body.classList.toggle('staged', scene === 'game');
    return ok;
  });
}
// Retire les effets en cours (passage d'une partie aux menus et inversement).
function clear() {
  for (const p of parts) p.s.destroy(); parts = [];
  anims = []; over.stage.removeChildren().forEach(c => c.keep || c.destroy()); cine = null; root?.style.removeProperty('transform');
}
// Plus de toile du tout (« réduire les animations » activé en cours de route) : cachées et boucles arrêtées.
export function leave() {
  document.body.classList.remove('staged'); mode = null;
  if (!table) return;
  table.stop(); over.stop(); table.canvas.style.display = over.canvas.style.display = 'none';
  clear();
}
export const active = () => !!table && mode === 'game';
export const scene = () => mode;

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
  const L = tableLook(), edge = tone === 'reveal' ? toNum(COL.foe) : tone === 'last' ? toNum('#f07a66') : L.edge ?? toNum(COL.gold);
  const c = new Container(); c.label = 'banner'; c.position.set(0, cy); over.stage.addChild(c);
  const band = new Graphics().rect(0, -h / 2, w, h).fill({ color: L.band, alpha: 0.82 })
    .rect(0, -h / 2, w, 2).fill({ color: edge }).rect(0, h / 2 - 2, w, 2).fill({ color: edge });
  const glow = new Sprite(glowTex); glow.anchor.set(0.5); glow.position.set(cx, 0); glow.width = w * 1.2; glow.height = h * 2.2; glow.tint = edge; glow.alpha = 0.35; glow.blendMode = 'add';
  const t = new Text({ text: title.toUpperCase(), style: { fontFamily: L.font, fontWeight: '700', fontSize: 34, fill: tone === 'last' ? 0xffb0a0 : L.text,
    stroke: { color: L.stroke, width: 4 }, dropShadow: { color: edge, blur: 12, distance: 0, alpha: 0.9 }, letterSpacing: 4 } });
  t.anchor.set(0.5); t.position.set(cx, sub ? -8 : 0);
  const st = sub ? new Text({ text: sub.toUpperCase(), style: { fontFamily: 'Alegreya Sans, sans-serif', fontWeight: '700', fontSize: 12, fill: edge, letterSpacing: 3 } }) : null;
  if (st) { st.anchor.set(0.5); st.position.set(cx, 22); }
  const sweep = new Sprite(glowTex); sweep.anchor.set(0.5); sweep.height = h * 1.4; sweep.width = 60; sweep.alpha = 0.7; sweep.blendMode = 'add';
  c.addChild(glow, band, t, sweep); if (st) c.addChild(st);
  if (tone === 'reveal') flash(edge, 0.18);
  tween(1400, k => {
    const open = Math.min(1, k / 0.12), out = k > 0.8 ? (k - 0.8) / 0.2 : 0;
    band.scale.y = ease(open); glow.alpha = 0.35 * ease(open) * (1 - out);
    t.x = cx + (1 - ease(Math.min(1, k / 0.2))) * -60;
    // Changer l'espacement redessine tout le texte (et son ombre) puis le renvoie à la carte graphique : seulement quand il change vraiment.
    const ls = Math.round(4 + (1 - ease(Math.min(1, k / 0.25))) * 18); if (ls !== t.style.letterSpacing) t.style.letterSpacing = ls;
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
// Or pour une victoire (le titre frappe, onde de choc, poussière d'or), rouge sombre pour une défaite (le titre tombe et secoue l'écran,
// voile sombre, cendres), gris pour une égalité. Ils restent jusqu'à la sortie de la partie.
export function ending(result) {
  if (!active()) return;
  cine?.destroy({ children: true });
  const look = season(), tint = result === 'win' ? (look === 'cyber' ? 0x19e6ff : look === 'halloween' ? 0xff8a2a : look === 'eclipse' ? 0xff6a2a : look === 'astral' ? 0x8aa8ff : look === 'estampe' ? 0xd8301c : look === 'sylve' ? 0xb8f070 : look === 'aube' ? 0xfff0c0 : 0xffd070) : result === 'lose' ? (look === 'cyber' ? 0xff003c : 0xb03a2a) : 0xa0a8b8, x = innerWidth / 2, y = Math.min(innerHeight * 0.2, 170);
  const c = cine = new Container(); over.stage.addChild(c);
  const rays = new Container(); rays.position.set(x, y);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, len = Math.max(innerWidth, innerHeight);
    rays.addChild(new Graphics().poly([0, 0, Math.cos(a - 0.09) * len, Math.sin(a - 0.09) * len, Math.cos(a + 0.09) * len, Math.sin(a + 0.09) * len]).fill({ color: 0xffffff, alpha: 0.13 })); }
  rays.tint = tint; rays.blendMode = 'add';
  const halo = new Sprite(glowTex); halo.anchor.set(0.5); halo.position.set(x, y); halo.width = halo.height = 360; halo.tint = tint; halo.blendMode = 'add'; halo.alpha = 0.7;
  const label = result === 'win' ? t('Victoire') : result === 'lose' ? t('Défaite') : t('Égalité');
  const L = tableLook(), cyber = season() === 'cyber';
  const head = new Text({ text: label.toUpperCase(), style: { fontFamily: L.font, fontWeight: '900', fontSize: cyber ? 44 : 52, fill: result === 'win' ? (cyber ? 0xfcee0a : 0xfff0c0) : 0xf1e6cf,
    stroke: { color: cyber ? 0x05070f : 0x1a0c04, width: 6 }, letterSpacing: 6, ...(cyber ? { dropShadow: { color: 0x19e6ff, blur: 0, distance: 4, angle: Math.PI, alpha: 0.8 } } : {}) } });
  head.anchor.set(0.5); head.position.set(x, y);
  // Défaite : un voile rouge sombre gagne les bords de l'écran.
  const veil = result === 'lose' ? new Sprite(glowTex) : null;
  if (veil) { veil.anchor.set(0.5); veil.position.set(x, innerHeight / 2); veil.width = innerWidth * 2.4; veil.height = innerHeight * 2.4; veil.tint = 0x3a0804; veil.alpha = 0; c.addChild(veil); }
  c.addChild(rays, halo, head);
  if (result === 'win') {
    // Victoire : le titre frappe en grandissant, éclair doré et onde de choc.
    flash(0xffe0a0, 0.3);
    tween(900, k => { const e = ease(k); head.scale.set(1.8 - 0.8 * e); head.alpha = e; rays.alpha = e; halo.alpha = 0.7 * e; });
    setTimeout(() => { if (c.destroyed) return; const g = new Graphics().circle(0, 0, 60).stroke({ width: 5, color: 0xffffff }); g.position.set(x, y); g.tint = tint; g.blendMode = 'add'; c.addChild(g);
      tween(700, k => { g.scale.set(0.5 + ease(k) * 4); g.alpha = 1 - k; }, () => g.destroy()); }, 260);
  } else if (result === 'lose') {
    // Défaite : le titre tombe d'en haut, lourd, rebondit à peine et secoue l'écran ; les rayons s'allument lentement.
    tween(700, k => { const e = k < 0.7 ? Math.pow(k / 0.7, 2) : 1 - Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.06; head.y = y - 120 * (1 - e); head.alpha = Math.min(1, k * 3); head.rotation = (1 - Math.min(1, k / 0.7)) * -0.08; },
      () => { shake(5, 320); for (let i = 0; i < 16; i++) spawn(shardTex, x + rnd(-120, 120), y + 26, { tint: 0x6a5a4a, blend: 'normal', vx: rnd(-2, 2), vy: rnd(-2.5, -0.5), g: 0.15, spin: rnd(-0.2, 0.2), rot: rnd(0, TAU), scale: rnd(0.4, 0.8), ttl: rnd(30, 50) }); });
    tween(1600, k => { const e = ease(k); rays.alpha = e * 0.7; halo.alpha = 0.5 * e; veil.alpha = 0.55 * e; });
  } else tween(900, k => { const e = ease(k); head.alpha = e; head.scale.set(1.15 - 0.15 * e); rays.alpha = e; halo.alpha = 0.7 * e; });
  // Tant que le résultat reste à l'écran : poussière d'or qui monte du titre (victoire), cendres qui tombent (défaite).
  over.ticker.add(function spin(tk) {
    if (c.destroyed) { over.ticker.remove(spin); return; }
    rays.rotation += (result === 'lose' ? 0.001 : 0.0025) * tk.deltaTime; halo.alpha = (0.55 + Math.sin(performance.now() / 500) * 0.15) * rays.alpha;
    if (result === 'win' && Math.random() < 0.25 * tk.deltaTime) spawn(sparkTex, x + rnd(-150, 150), y + rnd(-10, 30), { tint: Math.random() < 0.3 ? 0xffffff : tint, vx: rnd(-0.2, 0.2), vy: rnd(-1.1, -0.4), drag: 1, scale: rnd(0.15, 0.35), ttl: rnd(50, 90) });
    if (result === 'lose' && Math.random() < 0.18 * tk.deltaTime) spawn(shardTex, rnd(0, innerWidth), -10, { tint: Math.random() < 0.5 ? 0x5a4a3c : 0x8a3020, blend: 'normal', vx: rnd(-0.4, 0.4), vy: rnd(0.5, 1.2), drag: 1, spin: rnd(-0.05, 0.05), rot: rnd(0, TAU), scale: rnd(0.3, 0.6), ttl: rnd(200, 320), alpha: 0.7 });
  });
  if (result !== 'lose') for (let i = 0; i < 40; i++) { const a = rnd(0, TAU), v = rnd(1, 4); spawn(sparkTex, x, y, { tint, vx: Math.cos(a) * v, vy: Math.sin(a) * v, scale: rnd(0.3, 0.6), ttl: rnd(50, 90) }); }
}
// Nouvelle partie (revanche) : la fin de partie s'efface.
export function clearEnding() { cine?.destroy({ children: true }); cine = null; }

// Outils partagés avec les effets des généraux (stage-generals.js), lus à chaque appel : la table peut être recréée.
export const kit = () => ({ over, root, COL, glowTex, sparkTex, shardTex, spawn, tween, ease, rnd, toNum, TAU });
