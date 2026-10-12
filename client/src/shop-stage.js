// Décors PixiJS (WebGL) de la boutique, chargés par shop.js au premier passage en boutique. Une petite toile par décor,
// posée derrière les objets HTML (qui restent cliquables, lisibles au clavier et par les lecteurs d'écran) :
// - Étal (`.stall`) : mur de planches et comptoir de bois cerclé d'or avec deux piles de pièces (dessinés une fois dans un
//   canevas 2D), auvent rayé dont le bord festonné ondule, deux lanternes qui se balancent et dont la flamme vacille, rayons
//   qui tournent derrière chaque paquet ou coffre, flaque de lumière dessous.
// - Vitrine des sélections du jour (`.vitrine`) : velours plissé, un projecteur au-dessus de chaque offre qui oscille
//   doucement, un halo à sa couleur (famille de la carte, rareté de l'art), une flaque de lumière dessous ; une offre vendue
//   ou déjà possédée reste dans la pénombre.
// Partout : poussière dorée dans la lumière, de temps en temps un reflet en étoile sur un objet en vente, et une gerbe
// d'éclats avec une onde dorée quand on touche un objet ou son prix. Saison (season.js) : à Halloween, auvent violet et
// orange, lanternes et velours violets.
// Léger sur téléphone : définition plafonnée à 1,5, 45 images par seconde au plus, chaque boucle arrêtée hors de la
// boutique ou quand son décor sort de l'écran. Les toiles sont gardées d'un rendu à l'autre et reposées dans les nouveaux
// éléments (main.js reconstruit la page à chaque rendu).
import { Application, Color, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { season, palette } from './season.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const toNum = c => { try { return new Color(c).toNumber(); } catch { return 0xf0c454; } };
const spooky = () => season() === 'halloween';
let tex = null;
const scenes = [];

function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => grd.addColorStop(at, col)); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return Texture.from(c); };

// Textures communes aux toiles, dessinées une fois.
function textures() {
  if (tex) return tex;
  tex = {
    glow: radial(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]),
    spark: radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]),
    // étoile à quatre branches, pour les reflets sur les objets
    star: canvasTex(64, 64, g => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, '#fff'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(32, 0); g.quadraticCurveTo(35, 29, 64, 32); g.quadraticCurveTo(35, 35, 32, 64); g.quadraticCurveTo(29, 35, 0, 32); g.quadraticCurveTo(29, 29, 32, 0); g.fill(); }),
    rays: canvasTex(256, 256, g => { g.translate(128, 128);
      for (let i = 0; i < 14; i++) { g.rotate(TAU / 14); const grd = g.createLinearGradient(0, 0, 128, 0);
        grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(128, -12); g.lineTo(128, 12); g.closePath(); g.fill(); } }),
    // cône de projecteur : étroit en haut, large en bas, qui s'efface vers le bas et sur les bords
    cone: canvasTex(128, 256, g => {
      const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(255,255,255,.95)'); v.addColorStop(0.7, 'rgba(255,255,255,.35)'); v.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = v; g.beginPath(); g.moveTo(54, 0); g.lineTo(74, 0); g.lineTo(128, 256); g.lineTo(0, 256); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-in';
      const h = g.createLinearGradient(0, 0, 128, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.3, 'rgba(0,0,0,1)'); h.addColorStop(0.7, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = h; g.fillRect(0, 0, 128, 256); }),
  };
  return tex;
}

// ---- Fonds peints une fois par taille ----

// Étal : mur de planches, comptoir, pièces, vignette.
function paintStall(W, H) {
  const r = Math.min(devicePixelRatio || 1, 1.5), shelf = 52;
  return canvasTex(Math.round(W * r), Math.round(H * r), g => {
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
    grd = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });
}

// Vitrine : velours plissé (bandes ombrées), tringle dorée en haut, vignette.
function paintVelvet(W, H) {
  const r = Math.min(devicePixelRatio || 1, 1.5), [hi, lo] = spooky() ? ['#4a1c70', '#14061f'] : ['#6a1a2a', '#1e060c'];
  return canvasTex(Math.round(W * r), Math.round(H * r), g => {
    g.scale(r, r);
    let grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, hi); grd.addColorStop(1, lo);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // plis : chaque pli a un côté éclairé et un côté dans l'ombre, de largeur un peu irrégulière
    for (let x = -10, k = 0; x < W + 10; k++) {
      const w = 22 + 8 * Math.sin(k * 1.7);
      grd = g.createLinearGradient(x, 0, x + w, 0);
      grd.addColorStop(0, 'rgba(0,0,0,.38)'); grd.addColorStop(0.45, 'rgba(255,255,255,.07)'); grd.addColorStop(0.6, 'rgba(255,255,255,.03)'); grd.addColorStop(1, 'rgba(0,0,0,.38)');
      g.fillStyle = grd; g.fillRect(x, 0, w, H); x += w;
    }
    // tringle et ombre du haut
    grd = g.createLinearGradient(0, 0, 0, 26); grd.addColorStop(0, 'rgba(0,0,0,.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, 26);
    grd = g.createLinearGradient(0, 2, 0, 7); grd.addColorStop(0, '#fff3c0'); grd.addColorStop(0.5, '#f0c454'); grd.addColorStop(1, '#8a5a14');
    g.fillStyle = grd; g.fillRect(0, 2, W, 5);
    grd = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });
}

// Lanterne de l'étal : anse, toit, verre lumineux, socle ; pivote autour de son point d'accroche (en haut de la chaîne).
function lantern() {
  const c = new Container(), chain = new Graphics(), body = new Graphics(), flame = new Sprite(tex.glow), halo = new Sprite(tex.glow);
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

// ---- Une toile ----
function makeScene(kind) {
  const sc = { kind, app: new Application(), host: null, lay: null, objs: [], parts: [], seen: true, nextStar: 0, frame: 0, spooky: null };
  sc.ready = sc.app.init({ backgroundAlpha: 0, width: 300, height: 200, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 1.5), preference: 'webgl' }).then(() => {
    const { app } = sc; textures();
    app.canvas.setAttribute('aria-hidden', 'true'); app.ticker.maxFPS = 45;
    sc.bg = new Sprite(Texture.EMPTY);
    sc.warm = new Sprite(tex.glow); sc.warm.anchor.set(0.5); sc.warm.blendMode = 'add';
    sc.lights = new Container(); sc.dust = new Container(); sc.fx = new Container();
    app.stage.addChild(sc.bg, sc.warm, sc.lights, sc.dust);
    if (kind === 'stall') {
      sc.awning = new Graphics(); sc.lanterns = new Container(); sc.lanterns.addChild(lantern(), lantern());
      app.stage.addChild(sc.lanterns, sc.awning);
    }
    app.stage.addChild(sc.fx);
    for (let i = 0; i < (kind === 'stall' ? 26 : 20); i++) sc.dust.addChild(mote(sc, new Sprite(tex.spark), true));
    sc.ro = new ResizeObserver(() => fit(sc));
    sc.io = new IntersectionObserver(([e]) => { sc.seen = e.isIntersecting; run(sc); });
    app.ticker.add(t => tick(sc, t));
  });
  scenes.push(sc);
  return sc;
}

// Poussière dorée : flotte doucement dans la lumière.
function mote(sc, s, anywhere) {
  const W = sc.lay?.W || 300, H = sc.lay?.H || 200, low = sc.kind === 'stall' ? H - 50 : H - 10;
  s.anchor.set(0.5); s.blendMode = 'add'; s.tint = Math.random() < 0.7 ? 0xffd070 : 0xfff2c0; s.scale.set(rnd(0.08, 0.2));
  return Object.assign(s, { x: rnd(0, W), y: anywhere ? rnd(40, low) : low, vx: rnd(-0.12, 0.12), vy: rnd(-0.25, -0.08), seed: rnd(0, 500), life: rnd(0.6, 1), a: rnd(0.35, 0.8) });
}
function spark(sc, t, x, y, o) {
  const s = new Sprite(t); s.anchor.set(0.5); s.blendMode = 'add'; s.position.set(x, y); s.tint = o.tint ?? 0xffe7a3; s.scale.set(o.scale ?? 0.3);
  sc.fx.addChild(s); sc.parts.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, age: 0, ttl: o.ttl ?? 40, sc0: s.scale.x, grow: o.grow ?? 0, spin: o.spin ?? 0, pop: !!o.pop });
}
function burst(sc, o) {
  const { x, y } = o;
  for (let i = 0; i < 26; i++) { const a = rnd(0, TAU), v = rnd(2, 6);
    spark(sc, tex.spark, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.12, ttl: rnd(30, 55), scale: rnd(0.2, 0.45), tint: Math.random() < 0.5 ? o.tint : 0xfff2c0 }); }
  spark(sc, tex.glow, x, y, { ttl: 22, scale: 0.3, grow: 1.4, tint: o.tint });
  const ring = new Graphics().circle(0, 0, 30).stroke({ width: 3, color: 0xffe7a3 }); ring.position.set(x, y); ring.blendMode = 'add';
  sc.fx.addChild(ring); sc.parts.push({ s: ring, vx: 0, vy: 0, g: 0, age: 0, ttl: 26, sc0: 1, grow: 2.2, spin: 0 });
}

// Place des objets HTML (`[data-px]`) dans le décor. Leurs lumières sont recréées quand leur nombre change ; sinon on
// ne fait que les déplacer (les cartes de la vitrine arrivent en glissant, l'étal remue à chaque rendu).
function measure(sc) {
  const hr = sc.host.getBoundingClientRect(), els = [...sc.host.querySelectorAll('[data-px]')];
  if (els.length !== sc.objs.length) {
    sc.lights.removeChildren().forEach(c => c.destroy());
    sc.objs = els.map((el, i) => {
      const o = { i, ray: new Sprite(sc.kind === 'stall' ? tex.rays : tex.cone), halo: new Sprite(tex.glow), pool: new Sprite(tex.glow), seed: rnd(0, 6) };
      for (const s of [o.pool, o.halo, o.ray]) { s.blendMode = 'add'; s.anchor.set(0.5); sc.lights.addChild(s); }
      if (sc.kind !== 'stall') o.ray.anchor.set(0.5, 0);
      return o;
    });
  }
  els.forEach((el, k) => {
    const o = sc.objs[k], r = el.getBoundingClientRect(), slot = el.closest('.stall-item, .vit-slot');
    Object.assign(o, { el, x: r.left - hr.left + r.width / 2, y: r.top - hr.top + r.height / 2, w: r.width, h: r.height,
      off: slot?.disabled || (slot?.classList.contains('vit-slot') && !slot.classList.contains('sale')),
      tint: toNum(getComputedStyle(el).getPropertyValue('--glow').trim() || '#f0c454') });
    o.ray.tint = o.tint; o.halo.tint = o.tint; o.pool.tint = sc.kind === 'stall' ? 0xffc060 : o.tint;
  });
}

function fit(sc) {
  if (!sc.host) return;
  const W = sc.host.clientWidth, H = sc.host.clientHeight; if (!W || !H) return;
  if (!sc.lay || sc.lay.W !== W || sc.lay.H !== H || sc.spooky !== spooky()) {
    sc.app.renderer.resize(W, H); sc.lay = { W, H }; sc.spooky = spooky();
    sc.bg.texture?.destroy(true); sc.bg.texture = sc.kind === 'stall' ? paintStall(W, H) : paintVelvet(W, H); sc.bg.width = W; sc.bg.height = H;
  }
  if (sc.kind === 'stall') {
    sc.warm.width = W * 1.2; sc.warm.height = H * 1.1; sc.warm.position.set(W / 2, H * 0.62);
    sc.lanterns.children[0].position.set(Math.max(22, W * 0.07), 26); sc.lanterns.children[1].position.set(Math.min(W - 22, W * 0.93), 26);
  } else { sc.warm.width = W * 1.4; sc.warm.height = H * 0.7; sc.warm.position.set(W / 2, 0); }
  measure(sc); tick(sc);
}

// Auvent de l'étal : bandes alternées, bord festonné qui ondule comme une toile au vent.
function drawAwning(sc, now) {
  const { W } = sc.lay, cols = spooky() ? [0x4b1f6b, 0xd8701e] : [0x8e1f1f, 0xe9d6a8], a = sc.awning;
  const band = 26, depth = 30, wave = k => Math.sin(now / 700 + k * 0.9) * 2.2 + Math.sin(now / 1300 + k * 0.4) * 1.2;
  a.clear(); a.rect(0, 0, W, 6).fill(0x2a1406);
  for (let k = 0, x = 0; x < W; k++, x += band) {
    const y = depth + wave(k);
    a.moveTo(x, 4).lineTo(x + band, 4).lineTo(x + band, y).quadraticCurveTo(x + band / 2, y + 12, x, y).closePath().fill(cols[k % 2]);
    a.moveTo(x + band, 4).lineTo(x + band, y).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
  }
  a.rect(0, 4, W, 3).fill({ color: 0xf0c454, alpha: 0.85 });
  for (let k = 0, x = 0; x < W; k++, x += band) a.moveTo(x, depth + wave(k) + 2).quadraticCurveTo(x + band / 2, depth + wave(k) + 16, x + band, depth + wave(k + 1) + 2).stroke({ width: 3, color: 0x000000, alpha: 0.18 });
}

function tick(sc, t) {
  if (!sc.lay || !sc.host) return;
  const dt = t?.deltaTime ?? 0, now = performance.now(), { W } = sc.lay, stall = sc.kind === 'stall';
  if (++sc.frame % 20 === 0) measure(sc);
  const flick = 0.82 + 0.1 * Math.sin(now / 90) * Math.sin(now / 230) + 0.08 * Math.sin(now / 610);
  if (stall) {
    drawAwning(sc, now);
    sc.warm.alpha = 0.18 * flick; sc.warm.tint = spooky() ? 0xb070ff : 0xffb050;
    for (const l of sc.lanterns.children) {
      l.rotation = Math.sin(now / 1100 + l.seed) * 0.09;
      l.halo.alpha = 0.5 * flick; l.halo.tint = palette().hearth; l.flame.alpha = flick; l.flame.tint = spooky() ? 0xd8b0ff : 0xfff0c0;
    }
  } else { sc.warm.alpha = 0.22; sc.warm.tint = spooky() ? 0xc8a0ff : 0xffd8a0; }
  for (const o of sc.objs) {
    if (o.x == null) continue;
    const pulse = 0.5 + 0.5 * Math.sin(now / 900 + o.seed);
    if (stall) {
      o.ray.position.set(o.x, o.y); o.ray.rotation = now / 9000 + o.i; o.ray.alpha = o.off ? 0.06 : 0.2 + 0.06 * Math.sin(now / 800 + o.i);
      o.ray.width = o.ray.height = Math.max(o.w, o.h) * 2.1;
      o.halo.visible = false;
      o.pool.position.set(o.x, o.y + o.h / 2 + 6); o.pool.width = o.w * 1.8; o.pool.height = 26; o.pool.alpha = o.off ? 0.15 : 0.4 * flick;
    } else {
      // projecteur accroché à la tringle, qui oscille un peu ; son faisceau couvre la carte et s'étale dessous
      o.ray.position.set(o.x, 4); o.ray.rotation = Math.sin(now / 2300 + o.seed) * 0.05;
      o.ray.width = o.w * 2.2; o.ray.height = o.y + o.h * 0.75; o.ray.alpha = o.off ? 0.06 : 0.16 + 0.04 * pulse; o.ray.tint = 0xfff0d0;
      o.halo.position.set(o.x, o.y); o.halo.width = o.w * 2.1; o.halo.height = o.h * 1.7; o.halo.alpha = o.off ? 0.05 : 0.28 + 0.14 * pulse;
      o.pool.position.set(o.x, o.y + o.h / 2 + 4); o.pool.width = o.w * 1.7; o.pool.height = 22; o.pool.alpha = o.off ? 0.1 : 0.45;
    }
  }
  // reflet en étoile sur un objet en vente, toutes les 1 à 2,5 secondes
  if (now > sc.nextStar) {
    const live = sc.objs.filter(o => !o.off && o.x != null), o = live[Math.floor(Math.random() * live.length)];
    if (o) spark(sc, tex.star, o.x + rnd(-0.4, 0.4) * o.w, o.y + rnd(-0.4, 0.4) * o.h, { ttl: 34, scale: 0.05, grow: rnd(0.35, 0.55), spin: 0.02, pop: true });
    sc.nextStar = now + rnd(1000, 2500);
  }
  for (const m of sc.dust.children) {
    m.x += (m.vx + Math.sin((now + m.seed * 40) / 1500) * 0.1) * dt; m.y += m.vy * dt; m.life -= 0.0018 * dt;
    m.alpha = Math.min(1, m.life * 2, Math.max(0, (m.y - 20) / 40)) * m.a * flick;
    if (m.y < 16 || m.life <= 0 || m.x < -5 || m.x > W + 5) mote(sc, m, false);
  }
  for (let i = sc.parts.length - 1; i >= 0; i--) {
    const p = sc.parts[i]; p.age += dt;
    if (p.age >= p.ttl) { p.s.destroy(); sc.parts.splice(i, 1); continue; }
    const k = p.age / p.ttl; p.vy += p.g * dt; p.vx *= 0.97; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
    p.s.scale.set(p.sc0 + p.grow * (p.pop ? Math.sin(Math.PI * k) : k)); p.s.alpha = p.pop ? Math.sin(Math.PI * k) : 1 - k;
  }
}

function run(sc) { sc.host && sc.seen && !document.hidden ? sc.app.ticker.start() : sc.app.ticker.stop(); }
document.addEventListener('visibilitychange', () => scenes.forEach(sc => sc.app.ticker && run(sc)));

// Toucher un objet de l'étal, ou le prix d'une offre : éclats et onde dorée (l'achat lui-même est fait par main.js).
document.addEventListener('pointerdown', e => {
  const slot = e.target.closest?.('.stall-item, .vit-slot'); if (!slot) return;
  if (slot.disabled || e.target.closest('button:disabled') || (slot.classList.contains('vit-slot') && !e.target.closest('.vit-buy'))) return;
  const sc = scenes.find(s => s.host?.contains(slot)), el = slot.querySelector('[data-px]');
  const o = sc?.objs.find(x => x.el === el); if (o) burst(sc, o);
}, true);

function attach(sc, el) {
  if (sc.host !== el) {
    sc.ro.disconnect(); sc.io.disconnect(); sc.host = el; sc.seen = true; sc.objs.forEach(o => { o.el = null; });
    el.prepend(sc.app.canvas); sc.ro.observe(el); sc.io.observe(el);
  }
  el.classList.add('px');
  fit(sc); sc.app.render(); run(sc);
}
function detach(sc) {
  if (!sc.host) return;
  sc.ro.disconnect(); sc.io.disconnect(); sc.app.canvas.remove(); sc.host = null; run(sc);
}

// ---- API utilisée par shop.js ----
// els : les décors du rendu courant (étal, vitrines), dans l'ordre de la page ; une toile par décor, gardées par type.
export function show(els) {
  const used = new Set();
  for (const el of els) {
    const kind = el.classList.contains('stall') ? 'stall' : 'vitrine';
    const sc = scenes.find(s => s.kind === kind && !used.has(s)) || makeScene(kind);
    used.add(sc);
    sc.ready.then(() => { if (el.isConnected) attach(sc, el); }).catch(err => console.warn('Décor de la boutique indisponible', err));
  }
  for (const sc of scenes) if (!used.has(sc)) sc.ready.then(() => detach(sc)).catch(() => {});
}
