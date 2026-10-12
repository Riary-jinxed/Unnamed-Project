// Étal de la boutique dessiné avec PixiJS (WebGL), chargé par shop.js au premier passage en boutique.
// Une toile à la taille de l'étal, posée derrière les paquets et le coffre (qui restent en HTML) :
// - mur de planches et comptoir de bois cerclé d'or, avec deux piles de pièces (dessinés une fois dans un canevas 2D) ;
// - auvent rayé dont le bord festonné ondule, deux lanternes qui se balancent au bout de leur chaîne et dont la flamme vacille ;
// - derrière chaque objet, des rayons qui tournent lentement et une flaque de lumière ; de la poussière dorée qui flotte ;
// - de temps en temps une étincelle en étoile sur un objet ; le toucher fait jaillir des éclats et une onde dorée.
// Saison (season.js) : à Halloween, auvent violet et orange, lanternes violettes.
// Léger sur téléphone : définition plafonnée à 1,5, 45 images par seconde au plus, boucle arrêtée hors de la boutique
// ou quand l'étal sort de l'écran.
import { Application, Color, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { season, palette } from './season.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const toNum = c => { try { return new Color(c).toNumber(); } catch { return 0xf0c454; } };
let app = null, ready = null, host = null, ro = null, io = null, seen = true, lay = null;
let wall, warm, raysLayer, awning, lanterns, dust, fx, glowTex, sparkTex, starTex, raysTex;
let objs = [], parts = [], nextStar = 0;

function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => grd.addColorStop(at, col)); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return Texture.from(c); };

// Mur, comptoir et pièces : redessinés seulement quand l'étal change de taille.
function paintWall(W, H) {
  const r = Math.min(devicePixelRatio || 1, 1.5), shelf = 52;
  const tex = canvasTex(Math.round(W * r), Math.round(H * r), (g, w, h) => {
    g.scale(r, r);
    let grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#3a2010'); grd.addColorStop(1, '#1a0c05');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // planches : joints sombres, veines claires, quelques clous
    for (let x = 0, i = 0; x < W; x += 44, i++) {
      g.fillStyle = `rgba(255,220,170,${0.03 + (i % 3) * 0.02})`; g.fillRect(x + 2, 0, 42, H);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 2, H);
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const vx = x + 10 + k * 11; g.beginPath(); g.moveTo(vx, 0); g.bezierCurveTo(vx + 4, H * 0.3, vx - 4, H * 0.6, vx + 2, H); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x + 22, 48, 1.6, 0, TAU); g.arc(x + 22, H - shelf - 14, 1.6, 0, TAU); g.fill();
    }
    // comptoir : plateau verni cerclé d'or, façade sombre
    const top = H - shelf;
    g.fillStyle = '#f0c454'; g.fillRect(0, top - 2, W, 3);
    grd = g.createLinearGradient(0, top, 0, top + 10); grd.addColorStop(0, '#d79a4c'); grd.addColorStop(1, '#8a4c1c');
    g.fillStyle = grd; g.fillRect(0, top + 1, W, 9);
    grd = g.createLinearGradient(0, top + 10, 0, H); grd.addColorStop(0, '#4a250c'); grd.addColorStop(1, '#2a1406');
    g.fillStyle = grd; g.fillRect(0, top + 10, W, shelf - 10);
    g.fillStyle = 'rgba(0,0,0,.4)'; for (let x = 30; x < W; x += 60) g.fillRect(x, top + 12, 2, shelf - 12);
    g.fillStyle = '#a26a1a'; g.fillRect(0, top + 10, W, 2);
    // piles de pièces aux deux bouts du comptoir
    const coins = (cx, n) => { for (let k = 0; k < n; k++) { const y = top + 2 - k * 3.2;
      g.fillStyle = '#7a4a10'; g.beginPath(); g.ellipse(cx, y + 1.5, 11, 4, 0, 0, TAU); g.fill();
      g.fillStyle = k === n - 1 ? '#ffe07a' : '#e0a530'; g.beginPath(); g.ellipse(cx, y, 11, 4, 0, 0, TAU); g.fill(); } };
    coins(W * 0.08 + 6, 5); coins(W * 0.08 + 24, 3); coins(W * 0.92 - 10, 4);
    // vignette
    grd = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });
  wall.texture?.destroy(true); wall.texture = tex; wall.width = W; wall.height = H;
}

// Lanterne : anse, toit, verre lumineux, socle ; pivote autour de son point d'accroche (en haut de la chaîne).
function lantern() {
  const c = new Container(), chain = new Graphics(), body = new Graphics(), flame = new Sprite(glowTex), halo = new Sprite(glowTex);
  for (let y = 0; y < 26; y += 6) chain.ellipse(0, y + 3, 2, 3).stroke({ width: 1.4, color: 0x8a6a2a });
  body.moveTo(-9, 30).lineTo(0, 24).lineTo(9, 30).closePath().fill(0x2a1406).stroke({ width: 1.5, color: 0xf0c454 });
  body.roundRect(-8, 30, 16, 22, 3).fill({ color: 0xffd27a, alpha: 0.9 }).stroke({ width: 2, color: 0x2a1406 });
  body.moveTo(0, 30).lineTo(0, 52).stroke({ width: 1.5, color: 0x2a1406 });
  body.roundRect(-10, 51, 20, 5, 2).fill(0x2a1406).stroke({ width: 1, color: 0xf0c454 });
  halo.anchor.set(0.5); halo.blendMode = 'add'; halo.position.set(0, 41); halo.scale.set(0.9);
  flame.anchor.set(0.5); flame.blendMode = 'add'; flame.position.set(0, 42); flame.scale.set(0.12);
  c.addChild(halo, chain, body, flame);
  return Object.assign(c, { halo, flame, seed: rnd(0, 6) });
}

async function boot() {
  app = new Application();
  await app.init({ backgroundAlpha: 0, width: 300, height: 200, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 1.5), preference: 'webgl' });
  app.canvas.setAttribute('aria-hidden', 'true'); app.canvas.className = 'stall-live';
  app.ticker.maxFPS = 45;
  glowTex = radial(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  sparkTex = radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  // étoile à quatre branches, pour les reflets sur les objets
  starTex = canvasTex(64, 64, g => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, '#fff'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(32, 0); g.quadraticCurveTo(35, 29, 64, 32); g.quadraticCurveTo(35, 35, 32, 64); g.quadraticCurveTo(29, 35, 0, 32); g.quadraticCurveTo(29, 29, 32, 0); g.fill(); });
  raysTex = canvasTex(256, 256, g => { g.translate(128, 128);
    for (let i = 0; i < 14; i++) { g.rotate(TAU / 14); const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(128, -12); g.lineTo(128, 12); g.closePath(); g.fill(); } });
  wall = new Sprite(Texture.EMPTY);
  warm = new Sprite(glowTex); warm.anchor.set(0.5); warm.blendMode = 'add'; warm.tint = 0xffb050;
  raysLayer = new Container(); awning = new Graphics(); lanterns = new Container(); dust = new Container(); fx = new Container();
  lanterns.addChild(lantern(), lantern());
  app.stage.addChild(wall, warm, raysLayer, dust, lanterns, awning, fx);
  for (let i = 0; i < 26; i++) dust.addChild(mote(new Sprite(sparkTex), true));

  ro = new ResizeObserver(() => fit());
  io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); });
  // Toucher un objet de l'étal : éclats et onde dorée (l'achat lui-même est fait par main.js, comme pour ses boutons).
  document.addEventListener('pointerdown', e => {
    const it = e.target.closest?.('.stall-item'); if (!it || it.disabled || !host?.contains(it)) return;
    const o = objs.find(x => x.el === it.querySelector('.stall-obj')); if (o) burst(o);
  }, true);
  app.ticker.add(tick);
}

// Poussière dorée : flotte doucement dans la lumière, au-dessus du comptoir.
function mote(s, anywhere) {
  const W = lay?.W || 300, H = lay?.H || 200;
  s.anchor.set(0.5); s.blendMode = 'add'; s.tint = Math.random() < 0.7 ? 0xffd070 : 0xfff2c0; s.scale.set(rnd(0.08, 0.2));
  return Object.assign(s, { x: rnd(0, W), y: anywhere ? rnd(40, H - 50) : H - 50, vx: rnd(-0.12, 0.12), vy: rnd(-0.25, -0.08), seed: rnd(0, 500), life: rnd(0.6, 1), a: rnd(0.35, 0.8) });
}
function spark(tex, x, y, o) {
  const s = new Sprite(tex); s.anchor.set(0.5); s.blendMode = 'add'; s.position.set(x, y); s.tint = o.tint ?? 0xffe7a3; s.scale.set(o.scale ?? 0.3);
  fx.addChild(s); parts.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, age: 0, ttl: o.ttl ?? 40, sc0: s.scale.x, grow: o.grow ?? 0, spin: o.spin ?? 0, pop: !!o.pop });
}
function burst(o) {
  const cx = o.x, cy = o.y;
  for (let i = 0; i < 26; i++) { const a = rnd(0, TAU), v = rnd(2, 6);
    spark(sparkTex, cx, cy, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.12, ttl: rnd(30, 55), scale: rnd(0.2, 0.45), tint: Math.random() < 0.5 ? o.tint : 0xfff2c0 }); }
  spark(glowTex, cx, cy, { ttl: 22, scale: 0.3, grow: 1.4, tint: o.tint });
  const ring = new Graphics().circle(0, 0, 30).stroke({ width: 3, color: 0xffe7a3 }); ring.position.set(cx, cy); ring.blendMode = 'add';
  fx.addChild(ring); parts.push({ s: ring, vx: 0, vy: 0, g: 0, age: 0, ttl: 26, sc0: 1, grow: 2.2, spin: 0 });
}

// Place des objets HTML dans l'étal (rayons et flaques de lumière se calent dessus).
function measure() {
  if (!host) return;
  const hr = host.getBoundingClientRect(), els = [...host.querySelectorAll('.stall-obj')];
  raysLayer.removeChildren().forEach(c => c.destroy());
  objs = els.map((el, i) => {
    const r = el.getBoundingClientRect(), item = el.closest('.stall-item'), cs = getComputedStyle(item);
    const tint = toNum(cs.getPropertyValue(item.classList.contains('is-chest') ? '--rar' : '--pk2').trim() || '#f0c454');
    const rays = new Sprite(raysTex); rays.anchor.set(0.5); rays.blendMode = 'add'; rays.tint = tint;
    const pool = new Sprite(glowTex); pool.anchor.set(0.5); pool.blendMode = 'add'; pool.tint = 0xffc060;
    raysLayer.addChild(pool, rays);
    return { el, i, tint, rays, pool, off: item.disabled, x: r.left - hr.left + r.width / 2, y: r.top - hr.top + r.height / 2, w: r.width, h: r.height };
  });
}

function fit() {
  if (!host) return;
  const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
  if (!lay || lay.W !== W || lay.H !== H) { app.renderer.resize(W, H); lay = { W, H }; paintWall(W, H); }
  warm.width = W * 1.2; warm.height = H * 1.1; warm.position.set(W / 2, H * 0.62);
  lanterns.children[0].position.set(Math.max(22, W * 0.07), 26); lanterns.children[1].position.set(Math.min(W - 22, W * 0.93), 26);
  measure(); tick();
}

// Auvent : bandes alternées, bord festonné qui ondule comme une toile au vent.
function drawAwning(now) {
  const { W } = lay, spooky = season() === 'halloween', cols = spooky ? [0x4b1f6b, 0xd8701e] : [0x8e1f1f, 0xe9d6a8];
  const band = 26, depth = 30, wave = k => Math.sin(now / 700 + k * 0.9) * 2.2 + Math.sin(now / 1300 + k * 0.4) * 1.2;
  awning.clear();
  awning.rect(0, 0, W, 6).fill(0x2a1406);
  for (let k = 0, x = 0; x < W; k++, x += band) {
    const y = depth + wave(k);
    awning.moveTo(x, 4).lineTo(x + band, 4).lineTo(x + band, y).quadraticCurveTo(x + band / 2, y + 12, x, y).closePath().fill(cols[k % 2]);
    awning.moveTo(x + band, 4).lineTo(x + band, y).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
  }
  awning.rect(0, 4, W, 3).fill({ color: 0xf0c454, alpha: 0.85 });
  // ombre douce sous l'auvent
  for (let k = 0, x = 0; x < W; k++, x += band) awning.moveTo(x, depth + wave(k) + 2).quadraticCurveTo(x + band / 2, depth + wave(k) + 16, x + band, depth + wave(k + 1) + 2).stroke({ width: 3, color: 0x000000, alpha: 0.18 });
}

function tick(t) {
  if (!lay) return;
  const dt = t?.deltaTime ?? 0, now = performance.now(), { W } = lay, pal = palette(), spooky = season() === 'halloween';
  drawAwning(now);
  const flick = 0.82 + 0.1 * Math.sin(now / 90) * Math.sin(now / 230) + 0.08 * Math.sin(now / 610);
  warm.alpha = 0.18 * flick; warm.tint = spooky ? 0xb070ff : 0xffb050;
  for (const l of lanterns.children) {
    l.rotation = Math.sin(now / 1100 + l.seed) * 0.09;
    l.halo.alpha = 0.5 * flick; l.halo.tint = pal.hearth; l.flame.alpha = flick; l.flame.tint = spooky ? 0xd8b0ff : 0xfff0c0;
  }
  for (const o of objs) {
    o.rays.position.set(o.x, o.y); o.rays.rotation = now / 9000 + o.i; o.rays.alpha = o.off ? 0.06 : 0.2 + 0.06 * Math.sin(now / 800 + o.i);
    o.rays.width = o.rays.height = Math.max(o.w, o.h) * 2.1;
    o.pool.position.set(o.x, o.y + o.h / 2 + 6); o.pool.width = o.w * 1.8; o.pool.height = 26; o.pool.alpha = o.off ? 0.15 : 0.4 * flick;
  }
  // reflet en étoile sur un objet, toutes les 1 à 2,5 secondes
  if (now > nextStar && objs.length) {
    const live = objs.filter(o => !o.off), o = live[Math.floor(Math.random() * live.length)];
    if (o) spark(starTex, o.x + rnd(-0.4, 0.4) * o.w, o.y + rnd(-0.4, 0.4) * o.h, { ttl: 34, scale: 0.05, grow: rnd(0.35, 0.55), spin: 0.02, pop: true });
    nextStar = now + rnd(1000, 2500);
  }
  for (const m of dust.children) {
    m.x += (m.vx + Math.sin((now + m.seed * 40) / 1500) * 0.1) * dt; m.y += m.vy * dt; m.life -= 0.0018 * dt;
    m.alpha = Math.min(1, m.life * 2, Math.max(0, (m.y - 34) / 40)) * m.a * flick;
    if (m.y < 30 || m.life <= 0 || m.x < -5 || m.x > W + 5) mote(m, false);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt;
    if (p.age >= p.ttl) { p.s.destroy(); parts.splice(i, 1); continue; }
    const k = p.age / p.ttl; p.vy += p.g * dt; p.vx *= 0.97; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
    p.s.scale.set(p.sc0 + p.grow * (p.pop ? Math.sin(Math.PI * k) : k)); p.s.alpha = p.pop ? Math.sin(Math.PI * k) : 1 - k;
  }
}

function run() { if (!app) return; host && seen && !document.hidden ? app.ticker.start() : app.ticker.stop(); }
document.addEventListener('visibilitychange', () => run());

// Pose la toile dans l'étal du rendu courant ; masque alors le décor CSS.
function attach(el) {
  if (host !== el) {
    ro.disconnect(); io.disconnect(); host = el; seen = true;
    host.prepend(app.canvas); ro.observe(host); io.observe(host);
  }
  host.classList.add('px');
  fit(); app.render(); run();
}

// ---- API utilisée par shop.js ----
export function show(el) {
  ready ||= boot();
  ready.then(() => { if (el.isConnected) attach(el); }).catch(err => console.warn('Étal animé indisponible', err));
}
export function hide() {
  if (!app || !host) return;
  ro.disconnect(); io.disconnect(); app.canvas.remove(); host = null; objs = []; run();
}
