// Vitrine de l'accueil dessinée avec PixiJS (WebGL), chargée par lobby.js au premier passage sur l'accueil.
// Le général du deck joué y respire : son illustration (décor et personnage, qui bougent toujours ensemble) se soulève doucement
// et avance très lentement, une lueur à la couleur de sa famille bat au rythme de son souffle, et des braises montent d'un foyer
// en bas, les unes derrière le personnage, les autres devant. Effet de profondeur (parallaxe) : braises, lueur et illustration
// glissent plus ou moins selon l'inclinaison du téléphone, la souris sur ordinateur, ou à défaut une lente dérive ;
// l'illustration traîne un peu quand on fait défiler.
// Une seule petite toile, à la taille de la vitrine, posée dans `.sc-art` par-dessus l'illustration HTML (qui est masquée une
// fois la toile dessinée). Pour rester léger sur téléphone : définition plafonnée à 1,5, 45 images par seconde au plus, et la
// boucle s'arrête hors de l'accueil ou quand la vitrine sort de l'écran.
import { Application, Assets, Color, Container, Sprite, Texture } from 'pixi.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const BREATH_MS = 4600, MARGIN = 18;
let app = null, ready = null, host = null, cur = null, pending = null, ro = null, io = null, seen = true;
let world, glow, hearth, decor, perso, back, front, sparkTex;
const par = { x: 0, y: 0 }, aim = { tilt: null, mouse: null }, textures = new Map();

// Texture ronde et floue (halo, braise) dessinée une fois dans un canevas 2D.
function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => grd.addColorStop(at, col)); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}
const load = url => { if (!url) return Promise.resolve(null); if (!textures.has(url)) textures.set(url, Assets.load(url)); return textures.get(url); };

async function boot() {
  app = new Application();
  await app.init({ backgroundAlpha: 0, width: 300, height: 300, antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 1.5), preference: 'webgl' });
  Object.assign(app.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  app.canvas.setAttribute('aria-hidden', 'true'); app.canvas.className = 'sc-live';
  app.ticker.maxFPS = 45;
  const glowTex = radial(256, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  sparkTex = radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  world = new Container(); app.stage.addChild(world);
  decor = new Sprite(); decor.anchor.set(0.5, 1);
  glow = new Sprite(glowTex); glow.anchor.set(0.5); glow.blendMode = 'add';
  hearth = new Sprite(glowTex); hearth.anchor.set(0.5); hearth.blendMode = 'add'; hearth.tint = 0xff7a2a;
  back = new Container(); front = new Container();
  perso = new Sprite(); perso.anchor.set(0.5, 1);
  world.addChild(decor, glow, hearth, back, perso, front);
  for (let i = 0; i < 22; i++) back.addChild(ember(new Sprite(sparkTex), true, false));
  for (let i = 0; i < 7; i++) front.addChild(ember(new Sprite(sparkTex), true, true));

  ro = new ResizeObserver(() => fit());
  io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); });
  // Inclinaison du téléphone (Android ; sur iPhone elle demande une permission, la dérive automatique prend le relais).
  let beta0 = null;
  addEventListener('deviceorientation', e => { if (e.gamma == null || e.beta == null) return; beta0 ??= e.beta;
    aim.tilt = { x: clamp(e.gamma / 25, -1, 1), y: clamp((e.beta - beta0) / 25, -1, 1) }; });
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') aim.mouse = { x: e.clientX / innerWidth * 2 - 1, y: e.clientY / innerHeight * 2 - 1 }; });
  app.ticker.add(tick);
}

// Braise : repart du foyer, en bas de la vitrine (ou de n'importe où, au début) et monte en ondulant.
// Celles de devant sont plus grosses, plus rapides et plus rares.
function ember(s, anywhere, near = s.near) {
  const w = app.screen.width, h = app.screen.height;
  // Mélange normal, pas additif : sur un décor clair, une braise additive disparaîtrait.
  s.anchor.set(0.5); s.tint = Math.random() < 0.65 ? 0xff6a1a : 0xffb040;
  s.scale.set(near ? rnd(0.4, 0.7) : rnd(0.14, 0.32));
  return Object.assign(s, { near, x: rnd(-10, w + 10), y: anywhere ? rnd(0, h) : h + rnd(4, 30), vy: near ? rnd(0.7, 1.4) : rnd(0.2, 0.7),
    life: rnd(0.6, 1), seed: rnd(0, 500), a: near ? 0.7 : 0.9 });
}

// Calage des images comme l'illustration HTML (object-fit: cover, cadrée à 12 % du haut), avec une marge pour la parallaxe.
let lay = null;
function fit() {
  if (!host || !cur) return;
  const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
  if (app.screen.width !== W || app.screen.height !== H) app.renderer.resize(W, H);
  const iw = cur.decor.width, ih = cur.decor.height, s = Math.max((W + MARGIN * 2) / iw, (H + MARGIN * 2) / ih);
  const left = (W - iw * s) / 2, top = -MARGIN + (H + MARGIN * 2 - ih * s) * 0.12;
  lay = { W, H, s, cx: left + iw * s / 2, cy: top + ih * s / 2, bottom: top + ih * s };
  glow.width = W * 1.3; glow.height = H * 1.1; hearth.width = W * 1.4; hearth.height = H * 0.5;
  tick();
}

function tick(t) {
  if (!lay) return;
  const dt = t?.deltaTime ?? 0, now = performance.now(), { W, H, s } = lay;
  // Souffle : inspiration un peu plus longue que l'expiration (sinus déformé), de 0 à 1.
  const ph = (now % BREATH_MS) / BREATH_MS, b = 0.5 - 0.5 * Math.cos(TAU * (ph < 0.55 ? ph / 0.55 * 0.5 : 0.5 + (ph - 0.55) / 0.45 * 0.5));
  // Parallaxe : inclinaison, souris, sinon une lente dérive en huit ; lissée pour ne jamais sauter.
  const goal = aim.tilt || aim.mouse || { x: Math.sin(now / 5200) * 0.6, y: Math.sin(now / 7300) * 0.4 };
  const k = Math.min(1, 0.06 * (dt || 1)); par.x += (goal.x - par.x) * k; par.y += (goal.y - par.y) * k;
  const scroll = clamp(scrollY * 0.12, 0, MARGIN);
  const at = (d, dx = 0, dy = 0) => [par.x * 10 * d + dx, par.y * 7 * d + dy];
  // Illustration : le décor contient déjà le personnage, et le calque perso est aligné pixel pour pixel dessus. Les deux
  // bougent donc ensemble (même échelle, même place), sinon le personnage apparaît en double (comme sur les cartes, art.js).
  // Très lent mouvement de caméra (zoom de 0 à 1,5 % sur 22 s), et le souffle soulève l'image depuis le bas.
  const zoom = 1 + 0.015 * (0.5 - 0.5 * Math.cos(TAU * now / 22000)), [ix, iy] = at(0.4, lay.cx, lay.bottom + scroll * 0.6 - 1.5 * b);
  for (const sp of [decor, perso]) { sp.scale.set(s * zoom * (1 + 0.003 * b), s * zoom * (1 + 0.008 * b)); sp.position.set(ix, iy); }
  glow.position.set(...at(0.2, W / 2, H * 0.4)); glow.alpha = 0.16 + 0.12 * b;
  // Foyer : lueur chaude en bas qui vacille (trois sinus de périodes différentes).
  hearth.position.set(...at(0.6, W / 2, H * 1.02));
  hearth.alpha = 0.22 + 0.06 * Math.sin(now / 130) * Math.sin(now / 370) + 0.04 * Math.sin(now / 910);
  for (const [layer, d] of [[back, 0.2], [front, 1.6]]) {
    layer.position.set(...at(d));
    for (const e of layer.children) {
      e.y -= e.vy * dt; e.x += Math.sin((e.y + e.seed) / (e.near ? 60 : 38)) * (e.near ? 0.5 : 0.3) * dt; e.life -= 0.0035 * dt;
      e.alpha = Math.min(1, e.life * 1.5, Math.max(0, e.y / (H * 0.35))) * e.a;
      if (e.y < -10 || e.life <= 0) ember(e, false);
    }
  }
}

// Boucle active seulement quand la vitrine est à l'accueil et visible.
function run() { if (!app) return; host && seen ? app.ticker.start() : app.ticker.stop(); }

// Pose la toile dans la vitrine du rendu courant ; masque l'illustration HTML une fois la toile dessinée par-dessus.
function attach(w) {
  if (host !== w.host) {
    ro.disconnect(); io.disconnect(); host = w.host; seen = true;
    host.append(app.canvas); ro.observe(host); io.observe(host);
  }
  fit(); app.render();
  const art = host.querySelector('.hero-art'); if (art) art.style.visibility = 'hidden';
  run();
}

// ---- API utilisée par lobby.js ----
export function show(w) {
  pending = w;
  if (cur && cur.key === w.decor + '|' + w.perso && app) { attach(w); return; }
  ready ||= boot();
  Promise.all([ready, load(w.decor), load(w.perso)]).then(([, d, p]) => {
    const now = pending; if (!now || now.decor !== w.decor || now.perso !== w.perso || !d) return;
    cur = { key: w.decor + '|' + w.perso, decor: d };
    decor.texture = d; perso.visible = !!p; if (p) perso.texture = p;
    let tint = 0xe3b552; try { if (w.fam) tint = new Color(w.fam).toNumber(); } catch { /* couleur illisible : or */ }
    glow.tint = tint;
    if (now.host.isConnected) attach(now);
  }).catch(err => console.warn('Accueil animé indisponible', err));
}
// Autre écran : la toile est retirée et sa boucle arrêtée.
export function hide() {
  pending = null;
  if (!app || !host) return;
  ro.disconnect(); io.disconnect(); app.canvas.remove(); host = null; run();
}
