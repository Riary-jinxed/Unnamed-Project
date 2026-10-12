// Écran de fin de partie dessiné avec PixiJS (WebGL), chargé par fx.js à la première fin de partie avec des récompenses.
// Une toile posée dans le panneau de fin, à la place du bloc des récompenses (main.js, endRewardHTML), qui reste dans la page
// pour les lecteurs d'écran. Les récompenses défilent l'une après l'autre : XP, Éclats, XP de saison, missions, chacune
// avec son compteur qui monte ; la barre de niveau se remplit (niveau gagné : elle déborde, le médaillon change de nombre,
// « Niveau 13 ! » tombe dessus) ; en classé, les étoiles s'allument ou s'éteignent une à une, et une promotion est tamponnée.
// Or et étincelles pour une victoire, tons éteints et poussière pour une défaite.
// Vibrations (sfx.js, buzz, coupées dans le profil) : niveau gagné, étoile gagnée ou perdue, promotion.
// Toucher la toile passe l'animation. Tout l'affichage est calculé à partir du temps écoulé : passer, redimensionner ou
// redessiner la page (render de main.js) ne fait que recaler la même scène au même instant.
import { Application, Color, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { play, buzz } from './sfx.js';

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = k => 1 - Math.pow(1 - k, 3);
const back = k => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const seg = (t, a, d) => clamp((t - a) / d, 0, 1);
const cssColor = (name, dflt) => { try { return new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || dflt).toNumber(); } catch { return new Color(dflt).toNumber(); } };
const C = { ink: 0xf1e6cf, muted: 0xb29f80, line: 0x5a4530, sunk: 0x0d0907, gold: 0xe3b552, up: 0x6cc583, down: 0xf07a66, xp: 0xbfe0ff, shard: 0xe0a530 };
const DISPLAY = 'Cinzel, Alegreya SC, serif', SANS = 'Alegreya Sans, sans-serif';
// Rythme : une récompense toutes les 420 ms, son compteur monte en 520 ms ; la barre met 900 ms pour un niveau entier.
const ROW_EVERY = 420, COUNT_MS = 520, BAR_MS = 900, LEVEL_PAUSE = 450, STAR_EVERY = 300;
// Les halos restent dans la toile : coupés par son bord, ils dessineraient un rectangle.
const LEVEL_H = 66, ROW_H = 36, RANK_H = 50, NOTE_H = 40;

let app = null, ready = null, host = null, cur = null, ro = null;
let glowTex = null, sparkTex = null, flakeTex = null, scene = null, fxLayer = null, parts = [];

function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => grd.addColorStop(at, col)); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

async function boot() {
  app = new Application();
  await app.init({ backgroundAlpha: 0, width: 300, height: 200, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl' });
  Object.assign(app.canvas.style, { display: 'block', width: '100%', height: '100%', cursor: 'pointer', touchAction: 'manipulation' });
  app.canvas.setAttribute('aria-hidden', 'true'); app.canvas.className = 'endreel-cv';
  app.canvas.addEventListener('pointerdown', skip);
  glowTex = radial(128, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  sparkTex = radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
  flakeTex = (() => { const c = document.createElement('canvas'); c.width = 10; c.height = 14; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(5, 0); g.lineTo(10, 6); g.lineTo(6, 14); g.lineTo(0, 7); g.closePath(); g.fill(); return Texture.from(c); })();
  app.ticker.add(tick);
}

// ---- Ce qui est montré ----
// Les lignes de récompense, dans l'ordre où elles arrivent ; la ligne XP lance la barre de niveau.
function rowsOf(r) {
  const rows = [];
  if (!r.rewarded) rows.push({ kind: 'note', text: 'Plus de récompense de partie aujourd\'hui ; les missions avancent toujours.' });
  if (r.xp) rows.push({ kind: 'xp', label: 'Expérience', n: r.xp, fmt: n => `+${n} XP` });
  if (r.shards) rows.push({ kind: 'shard', label: 'Éclats', n: r.shards, fmt: n => `+${n}` });
  if (r.prisms) rows.push({ kind: 'prism', label: 'Prismes', n: r.prisms, fmt: n => `+${n}` });
  if (r.passXp) rows.push({ kind: 'pass', label: 'XP de saison', n: r.passXp, fmt: n => `+${n}` });
  if (r.missions) rows.push({ kind: 'mission', label: r.missions > 1 ? 'Missions accomplies' : 'Mission accomplie', n: r.missions, fmt: n => `${n}` });
  if (r.rewarded && !rows.length) rows.push({ kind: 'note', text: 'Pas de gain pour cette partie.' });
  if (r.ranked) rows.push({ kind: 'rank', k: r.ranked });
  return rows;
}
// Barre de niveau : morceaux à remplir l'un après l'autre (de, à, en fraction de la barre), un par niveau traversé.
function barPlan(r) {
  const p = r.progress, b = r.progressBefore || (r.levelUp ? { level: p.level - 1, xp: 0, xpNext: p.xpNext } : { level: p.level, xp: Math.max(0, p.xp - (r.xp || 0)), xpNext: p.xpNext });
  const parts = [];
  if (p.level === b.level) parts.push({ level: p.level, from: b.xp / b.xpNext, to: p.xp / p.xpNext, xpNext: p.xpNext, xp0: b.xp, xp1: p.xp });
  else {
    parts.push({ level: b.level, from: b.xp / b.xpNext, to: 1, xpNext: b.xpNext, xp0: b.xp, xp1: b.xpNext, up: true });
    // Plusieurs niveaux d'un coup (rare) : les niveaux du milieu se remplissent en entier.
    for (let l = b.level + 1; l < p.level; l++) parts.push({ level: l, from: 0, to: 1, xpNext: p.xpNext, xp0: 0, xp1: p.xpNext, up: true });
    parts.push({ level: p.level, from: 0, to: p.xp / p.xpNext, xpNext: p.xpNext, xp0: 0, xp1: p.xp });
  }
  return parts;
}
// Minutage : à quel instant (ms) chaque chose commence, et la fin de tout.
function timeline(rows, bar) {
  let t = 0, barAt = 260;
  const at = rows.map(row => { const a = t; t += row.kind === 'rank' ? 0 : ROW_EVERY; if (row.kind === 'xp') barAt = a + COUNT_MS; return a; });
  const bars = []; let b = barAt;
  for (const p of bar) { const d = Math.max(260, BAR_MS * (p.to - p.from)); bars.push({ ...p, a: b, d }); b += d + (p.up ? LEVEL_PAUSE : 0); }
  let end = Math.max(t + COUNT_MS, b);
  const rank = rows.find(x => x.kind === 'rank');
  if (rank) { rank.a = at[rows.indexOf(rank)] = Math.max(t, b - 200); end = Math.max(end, rank.a + 500 + STAR_EVERY * (Math.abs(rank.k.delta) + 1) + 400); }
  return { at, bars, end };
}

// ---- Construction de la scène (à chaque changement de taille) ----
const txt = (text, size, fill, o = {}) => new Text({ text, style: { fontFamily: o.font || SANS, fontWeight: o.weight || '700', fontSize: size, fill,
  letterSpacing: o.ls || 0, ...(o.wrap ? { wordWrap: true, wordWrapWidth: o.wrap, lineHeight: size * 1.25 } : {}),
  ...(o.stroke ? { stroke: { color: 0x1a0c04, width: o.stroke } } : {}) } });
function star(g, x, y, r, inner = 0.45) {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * inner : r; pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  return g.poly(pts);
}
// Icône d'une ligne, dessinée en traits simples à la taille 20.
function icon(kind) {
  const g = new Graphics();
  if (kind === 'xp') { star(g, 0, 0, 10, 0.32).fill({ color: C.xp }); g.circle(0, 0, 2.5).fill({ color: 0xffffff }); }
  else if (kind === 'shard') g.poly([0, -10, 6, -3, 0, 9, -6, -3]).fill({ color: C.shard }).stroke({ color: 0x8a5a10, width: 1.2, join: 'round' })
    .moveTo(-6, -3).lineTo(6, -3).stroke({ color: 0x8a5a10, width: 0.9 }).poly([-2, -3, 0, -10, -4, -4]).fill({ color: 0xfff3c4, alpha: 0.8 });
  else if (kind === 'prism') g.poly([0, -9, 8.5, 7, -8.5, 7]).fill({ color: 0x9b6ee8 }).stroke({ color: 0x4a2590, width: 1.2, join: 'round' }).poly([0, -9, 3, 7, 8.5, 7]).fill({ color: 0x6a3fc0 });
  else if (kind === 'pass') g.poly([-6, -10, 6, -10, 6, 9, 0, 4, -6, 9]).fill({ color: cssColor('--sa', '#9b6ee8') }).stroke({ color: 0x1a0c04, width: 1, alpha: 0.6 })
    .moveTo(-3, -5).lineTo(3, -5).stroke({ color: 0xffffff, width: 1.4, alpha: 0.7 });
  else if (kind === 'mission') g.circle(0, 0, 9).fill({ color: C.up }).moveTo(-4.5, 0).lineTo(-1, 3.5).lineTo(5, -3.5).stroke({ color: 0x0d2a14, width: 2.2, cap: 'round', join: 'round' });
  return g;
}

function build() {
  scene?.destroy({ children: true }); fxLayer?.destroy({ children: true }); parts = [];
  const W = Math.max(240, host.clientWidth), { rows, tint } = cur;
  scene = new Container(); fxLayer = new Container(); app.stage.addChild(scene, fxLayer);
  const S = cur.s = { W, rows: [] };
  // Médaillon du niveau, barre et son texte.
  const lv = new Container(); lv.position.set(0, 0); scene.addChild(lv); S.lv = lv;
  const halo = new Sprite(glowTex); halo.anchor.set(0.5); halo.position.set(30, 33); halo.width = halo.height = 64; halo.tint = tint; halo.alpha = 0;
  const medal = new Container(); medal.position.set(30, 33);
  medal.addChild(new Graphics().circle(0, 0, 25).fill({ color: 0x1a120c }).stroke({ color: tint, width: 3 }).circle(0, 0, 20).stroke({ color: tint, width: 1, alpha: 0.5 }));
  const num = txt('', 22, C.ink, { font: DISPLAY, weight: '900', stroke: 3 }); num.anchor.set(0.5); medal.addChild(num);
  const x0 = 64, bw = W - x0 - 6, by = 34;
  const cap = txt('NIVEAU', 11, C.muted, { ls: 2 }); cap.position.set(x0, 10);
  const xpT = txt('', 13, C.ink); xpT.anchor.set(1, 0); xpT.position.set(W - 6, 8);
  const track = new Graphics().roundRect(x0, by, bw, 12, 6).fill({ color: C.sunk }).stroke({ color: C.line, width: 1 });
  const fill = new Graphics(); const shine = new Sprite(glowTex); shine.anchor.set(0.5); shine.height = 26; shine.width = 40; shine.alpha = 0;
  const stamp = txt('', 20, 0xfff0c0, { font: DISPLAY, weight: '900', stroke: 4, ls: 2 }); stamp.anchor.set(0.5); stamp.position.set(x0 + bw / 2, by + 6); stamp.alpha = 0;
  lv.addChild(halo, track, fill, shine, cap, xpT, medal, stamp);
  Object.assign(S, { halo, medal, num, xpT, fill, shine, stamp, x0, bw, by });
  // Lignes de récompense.
  let y = LEVEL_H;
  for (const row of rows) {
    const c = new Container(); c.position.set(0, y); scene.addChild(c);
    const r = { row, c, y };
    if (row.kind === 'note') {
      const t = txt(row.text, 13, C.muted, { weight: '400', wrap: W - 12 }); t.position.set(6, 10); c.addChild(t); r.h = Math.max(NOTE_H, t.height + 18);
    } else if (row.kind === 'rank') {
      r.h = RANK_H; buildRank(r, W);
    } else {
      r.h = ROW_H;
      const ic = icon(row.kind); ic.position.set(16, ROW_H / 2); const lab = txt(row.label, 14, C.ink); lab.anchor.set(0, 0.5); lab.position.set(36, ROW_H / 2);
      const val = txt('', 18, row.kind === 'mission' ? C.up : tint === C.gold ? 0xffe2a0 : C.ink, { font: DISPLAY, weight: '700' }); val.anchor.set(1, 0.5); val.position.set(W - 6, ROW_H / 2);
      const glow = new Sprite(glowTex); glow.anchor.set(0.5); glow.position.set(W - 52, ROW_H / 2); glow.width = 92; glow.height = 34; glow.tint = tint; glow.alpha = 0;
      c.addChild(new Graphics().rect(0, 0, W, 1).fill({ color: C.line, alpha: 0.6 }), glow, ic, lab, val);
      Object.assign(r, { ic, val, glow });
    }
    y += r.h; S.rows.push(r);
  }
  S.H = y + 4;
  host.style.height = `${S.H}px`;
  if (app.screen.width !== W || app.screen.height !== S.H) app.renderer.resize(W, S.H);
  // Les événements déjà passés ne se rejouent pas (redessin de la page, changement de taille).
  draw(true);
}
// Ligne du classé : palier, étoiles (ou points au Maître), et ce que la partie a changé.
function buildRank(r, W) {
  const k = r.row.k, c = r.c, after = k.after, before = k.before || after;
  c.addChild(new Graphics().rect(0, 0, W, 1).fill({ color: C.line, alpha: 0.6 }));
  const cap = txt('CLASSÉ', 11, C.muted, { ls: 2 }); cap.position.set(6, 8);
  const lab = txt(before.label, 16, C.ink, { font: DISPLAY }); lab.position.set(6, 22);
  const d = k.delta > 0 ? `+${k.delta} étoile${k.delta > 1 ? 's' : ''}${k.bonus ? ' (bonus)' : ''}` : k.delta < 0 ? `${k.delta} étoile` : 'Rang inchangé';
  const sub = txt(d, 12, k.delta > 0 ? C.up : k.delta < 0 ? C.down : C.muted); sub.anchor.set(1, 0); sub.position.set(W - 6, 8);
  const stars = new Container(); stars.position.set(W - 6, 34);
  const promo = txt('PROMOTION !', 18, 0xfff0c0, { font: DISPLAY, weight: '900', stroke: 4, ls: 2 }); promo.anchor.set(0.5); promo.position.set(W / 2, 30); promo.alpha = 0;
  c.addChild(cap, lab, sub, stars, promo);
  // Étoiles : à quel instant chacune change. Montée : celles gagnées s'allument une à une ; descente : la dernière s'éteint.
  // Si le rang change (division, palier), le nom bascule au moment du changement.
  const max = after.max || 0, plan = [];
  if (max) {
    const lit0 = k.delta > 0 ? Math.max(0, after.stars - k.delta) : k.delta < 0 && before.max && before.label === after.label ? after.stars + 1 : after.stars;
    for (let i = 0; i < max; i++) {
      const g = new Graphics(); star(g, 0, 0, 9).fill({ color: 0xffffff }); g.x = -(max - 1 - i) * 22 - 9; stars.addChild(g);
      const s = { g, on0: i < lit0, on1: i < after.stars };
      plan.push(s);
    }
    let n = 0; for (const s of plan) if (s.on0 !== s.on1) s.at = 500 + STAR_EVERY * n++;
  } else {
    const pts = txt(after.label.split('·')[1]?.trim() || '', 16, 0xffe2a0, { font: DISPLAY }); pts.anchor.set(1, 0.5); stars.addChild(pts);
  }
  Object.assign(r, { lab, sub, stars, promo, plan, swapAt: before.label !== after.label ? 500 + STAR_EVERY * Math.max(0, Math.abs(k.delta) - 1) : null });
}

// ---- Animation ----
// Dessine la scène à l'instant cur.t. quiet : n'émet ni son ni étincelles pour les événements franchis (rattrapage).
function draw(quiet = false) {
  const S = cur.s; if (!S) return;
  const t = cur.t, { tl, win, tint } = cur, fire = (key, fn) => { if (cur.fired.has(key)) return; cur.fired.add(key); if (!quiet) fn(); };
  // Barre : le morceau en cours, la fraction remplie, et l'XP affichée.
  const bars = tl.bars; let b = bars[0], k = 0;
  for (const p of bars) { if (t >= p.a) { b = p; k = ease(seg(t, p.a, p.d)); } }
  const frac = b.from + (b.to - b.from) * k, xp = Math.round(b.xp0 + (b.xp1 - b.xp0) * k);
  S.num.text = String(b.level); S.xpT.text = `${xp} / ${b.xpNext} XP`;
  S.fill.clear(); if (frac > 0.005) S.fill.roundRect(S.x0, S.by, Math.max(12, S.bw * frac), 12, 6).fill({ color: tint }).roundRect(S.x0 + 3, S.by + 2, Math.max(6, S.bw * frac - 6), 3, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
  const moving = t >= b.a && t < b.a + b.d;
  S.shine.alpha = moving ? 0.8 : Math.max(0, S.shine.alpha - 0.05); S.shine.position.set(S.x0 + S.bw * frac, S.by + 6); S.shine.tint = tint;
  S.lv.alpha = ease(seg(t, 0, 250));
  // Niveau gagné : le médaillon rebondit, le halo s'allume, « Niveau N ! » tombe sur la barre.
  let pop = 0, lastUp = null;
  bars.forEach((p, i) => { if (!p.up) return; const at = p.a + p.d; if (t >= at) { lastUp = { at, level: bars[i + 1]?.level ?? p.level + 1 };
    fire(`up${i}`, () => { play('levelup'); buzz([20, 30, 20, 30, 60]); burst(30, 33, tint, 34, 4.5); ring(30, 33, tint); burst(S.x0 + S.bw, S.by + 6, tint, 16, 3); }); } });
  if (lastUp) { const e = t - lastUp.at; pop = e < 500 ? Math.sin(Math.PI * clamp(e / 500, 0, 1)) : 0;
    // Le tampon reste 1,6 s puis s'efface ; le médaillon garde son halo.
    S.stamp.text = `NIVEAU ${lastUp.level} !`; const ks = seg(t, lastUp.at, 380); S.stamp.alpha = Math.min(1, ks * 2) * (1 - seg(t, lastUp.at + 1600, 400)); S.stamp.scale.set(2.2 - 1.2 * back(ks));
    S.halo.alpha = 0.3 + 0.1 * Math.sin(performance.now() / 420); }
  S.medal.scale.set(1 + 0.25 * pop);
  // Lignes : glissent depuis la gauche, le compteur monte, une gerbe quand il s'arrête.
  S.rows.forEach((r, i) => {
    const a = tl.at[i], kin = ease(seg(t, a, 320));
    r.c.alpha = kin; r.c.x = (1 - kin) * -26;
    if (!r.val) return;
    if (r.row.kind === 'rank') return;
    const kc = seg(t, a + 120, COUNT_MS), n = Math.round(r.row.n * ease(kc));
    r.val.text = r.row.fmt(n);
    const done = kc >= 1, g = t - (a + 120 + COUNT_MS);
    r.glow.alpha = done && g < 600 ? 0.6 * (1 - g / 600) : 0;
    r.val.scale.set(done && g < 300 ? 1 + 0.18 * Math.sin(Math.PI * g / 300) : 1);
    if (t >= a) fire(`in${i}`, () => play('pick'));
    if (done) fire(`ok${i}`, () => { const x = S.W - 30, y = r.y + ROW_H / 2; if (win) burst(x, y, tint, 14, 2.6); else dust(x, y, 6); if (r.row.kind === 'xp' || i === 0) play('shimmer'); });
  });
  const R = S.rows.find(r => r.row.kind === 'rank'); if (R) drawRank(R, t, fire);
}
function drawRank(r, t, fire) {
  const a = r.row.a ?? 0, k = r.row.k, rel = t - a, after = k.after;
  r.c.alpha = ease(seg(t, a, 320)); r.c.x = (1 - r.c.alpha) * -26;
  if (r.swapAt !== null && rel >= r.swapAt) {
    r.lab.text = after.label;
    fire('swap', () => burst(r.lab.x + r.lab.width / 2, r.y + 32, k.delta > 0 ? C.gold : C.down, 18, 2.5));
  }
  r.plan.forEach((s, i) => {
    const on = s.at === undefined ? s.on1 : rel >= s.at ? s.on1 : s.on0;
    const e = s.at === undefined ? 1e9 : rel - s.at;
    s.g.tint = on ? C.gold : 0x3a2c1e;
    s.g.scale.set(e >= 0 && e < 400 ? 1 + 0.5 * Math.sin(Math.PI * e / 400) : 1);
    s.g.alpha = r.c.alpha;
    if (s.at !== undefined && rel >= s.at) fire(`star${i}`, () => {
      const x = r.stars.x + s.g.x, y = r.y + r.stars.y;
      if (s.on1) { play('up'); buzz(15); burst(x, y, C.gold, 18, 3); ring(x, y, C.gold, 0.6); } else { play('down'); buzz([40, 30, 15]); shatterAt(x, y); }
    });
  });
  if (k.promoted && k.delta > 0) {
    const pa = (r.swapAt ?? 500) + 200, kp = seg(rel, pa, 380);
    r.promo.alpha = rel < pa ? 0 : rel < pa + 1400 ? Math.min(1, kp * 2) : Math.max(0, 1 - (rel - pa - 1400) / 400);
    r.promo.scale.set(2.2 - 1.2 * back(kp));
    if (rel >= pa) fire('promo', () => { play('fresh'); buzz([30, 40, 30, 40, 90]); burst(r.promo.x, r.y + 30, C.gold, 30, 4); ring(r.promo.x, r.y + 30, C.gold, 1.4); });
  }
}

// ---- Particules (dans la toile seulement) ----
// Mélange normal : sur cette toile transparente, le mélange additif laisserait un rectangle clair autour de chaque halo.
function spawn(tex, x, y, o) {
  if (parts.length >= 140) return;
  const s = new Sprite(tex); s.anchor.set(0.5); s.position.set(x, y); s.tint = o.tint ?? 0xffffff;  s.scale.set(o.scale ?? 0.4); s.rotation = o.rot ?? 0;
  fxLayer.addChild(s); parts.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, spin: o.spin ?? 0, ttl: o.ttl ?? 40, age: 0, grow: o.grow ?? 0, sc0: s.scale.x, a0: o.alpha ?? 1 });
}
function burst(x, y, tint, n, v) {
  for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(0.4, 1) * v;
    spawn(sparkTex, x, y, { tint: i % 3 ? tint : 0xffffff, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, g: 0.06, scale: rnd(0.2, 0.45), ttl: rnd(28, 50) }); }
  spawn(glowTex, x, y, { tint, scale: 0.5, grow: 0.4, ttl: 22, alpha: 0.7 });
}
function ring(x, y, tint, size = 1) {
  const g = new Graphics().circle(0, 0, 20).stroke({ width: 3, color: 0xffffff }); g.position.set(x, y); g.tint = tint; fxLayer.addChild(g);
  parts.push({ s: g, vx: 0, vy: 0, g: 0, spin: 0, ttl: 34, age: 0, grow: 2.2 * size, sc0: 0.4, a0: 1 }); g.scale.set(0.4);
}
// Défaite : un peu de poussière grise qui retombe au lieu d'étincelles.
function dust(x, y, n) {
  for (let i = 0; i < n; i++) spawn(flakeTex, x + rnd(-14, 14), y + rnd(-6, 6), { tint: 0x8a7a66, vx: rnd(-0.5, 0.5), vy: rnd(-1.2, -0.2), g: 0.05, spin: rnd(-0.1, 0.1), rot: rnd(0, TAU), scale: rnd(0.4, 0.8), ttl: rnd(30, 50), alpha: 0.8 });
}
// Étoile perdue : elle se brise en éclats qui tombent.
function shatterAt(x, y) {
  for (let i = 0; i < 10; i++) spawn(flakeTex, x, y, { tint: C.gold, vx: rnd(-2, 2), vy: rnd(-2.5, 0), g: 0.2, spin: rnd(-0.3, 0.3), rot: rnd(0, TAU), scale: rnd(0.5, 0.9), ttl: rnd(30, 45) });
}

function tick(tk) {
  if (!cur?.s) return;
  const now = performance.now();
  // Après une longue pause (appli en arrière-plan), la scène saute à l'instant présent sans rejouer d'un coup les sons manqués.
  if (now >= cur.startAt) { cur.t = now - cur.startAt; draw(tk.deltaMS > 250); }
  const dt = tk.deltaTime;
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt;
    if (p.age >= p.ttl) { p.s.destroy(); parts.splice(i, 1); continue; }
    p.vy += p.g * dt; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.s.rotation += p.spin * dt;
    const k = p.age / p.ttl; p.s.alpha = (1 - k) * p.a0; if (p.grow) p.s.scale.set(p.sc0 + p.grow * k); }
  // Tout est joué et plus rien ne bouge : la boucle s'arrête, ou ralentit si le halo d'un niveau gagné respire encore.
  const idle = cur.t > cur.tl.end + 200 && !parts.length;
  app.ticker.maxFPS = idle ? 20 : 0;
  if (idle && !cur.tl.bars.some(b => b.up)) app.ticker.stop();
}
// Toucher : tout se met en place d'un coup, sans rejouer les sons.
function skip() {
  if (!cur?.s || cur.t >= cur.tl.end) return;
  cur.startAt = performance.now() - cur.tl.end - 1; cur.t = cur.tl.end + 1; draw(true); app.ticker.start();
}

function attach(h) {
  if (host !== h) { host = h; ro?.disconnect(); ro = new ResizeObserver(() => { if (cur && host && Math.abs(host.clientWidth - cur.s?.W) > 1) build(); }); ro.observe(h); }
  if (app.canvas.parentNode !== h) h.append(app.canvas);
  h.closest('.panel')?.classList.add('reel');
  build(); app.ticker.start();
}

// ---- API utilisée par fx.js ----
// w : { host, key, reward, result ('win', 'lose' ou 'tie'), delay (ms avant que les lignes arrivent) }.
export function show(w) {
  ready ||= boot();
  return ready.then(() => {
    if (!w.host.isConnected) return;
    if (!cur || cur.key !== w.key) {
      const rows = rowsOf(w.reward), win = w.result === 'win';
      cur = { key: w.key, rows, win, tint: win ? C.gold : w.result === 'lose' ? 0xc8b49a : 0xb8c0cc, tl: timeline(rows, barPlan(w.reward)), t: 0, startAt: performance.now() + (w.delay || 0), fired: new Set() };
    }
    attach(w.host);
  });
}
// Plus de panneau de fin : la toile est retirée et sa boucle arrêtée.
export function hide() {
  if (!app) return;
  ro?.disconnect(); ro = null; host = null; app.canvas.remove(); app.ticker.stop();
}
