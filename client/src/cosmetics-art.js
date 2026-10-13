// Dessins des cosmétiques avec PixiJS : icônes des monnaies, dos de carte et cadres de profil, dans la patte « BD encrée »
// des cartes (encrage noir épais, aplats, ombre franche décalée, trame de points). Tout est vectoriel : cosmetics.js rend
// chaque dessin une fois en image, à la définition de l'écran, et la pose sur les classes existantes (.ico-…, .back-…, .frame-…).
// Chaque fonction rend un Container de taille fixe (BACK_W × BACK_H, (FRAME_S + 2 × FRAME_PAD)², ICON_S²), ou null pour un identifiant inconnu
// (le dessin CSS de style.css reste alors en place).
import { BlurFilter, Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import { ART_THEME_FRAMES } from '@jeu/engine/rewards';

export const BACK_W = 240, BACK_H = 336, FRAME_S = 256, ICON_S = 64;
// Le cadre déborde du portrait : l'image fait 1 + 2 × FRAME_OUT fois la taille du portrait encadré (cosmetics.js).
// Trou central : rayon FRAME_HOLE × FRAME_S, un peu plus petit que le portrait pour que l'anneau en morde le bord.
// Couronnes, flammes, ailes et lueurs dépassent du carré FRAME_S : l'image a une marge vide de FRAME_PAD tout autour pour
// qu'aucun ornement ne soit coupé (le plus haut, la lune du Crépuscule, monte à 34 au-dessus du carré).
export const FRAME_OUT = 0.14, FRAME_HOLE = 0.33, FRAME_PAD = 40;
const INK = 0x170d08, TAU = Math.PI * 2;

// ---- Outils ----
const grad = (stops, type = 'linear', [x0, y0, x1, y1] = [0, 0, 0, 1]) => new FillGradient(type === 'radial'
  ? { type, center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, colorStops: stops.map(([offset, color]) => ({ offset, color })), textureSpace: 'local' }
  : { type, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, colorStops: stops.map(([offset, color]) => ({ offset, color })), textureSpace: 'local' });
const ink = (w = 4, color = INK) => ({ width: w, color, join: 'round', cap: 'round' });
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
// Hasard reproductible : même dessin à chaque rendu.
const seeded = s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
// Arc seul, sans trait qui le relie au tracé précédent.
const arc = (g, cx, cy, r, a0, a1) => g.moveTo(...pt(cx, cy, r, a0)).arc(cx, cy, r, a0, a1);
const G = c => add(c, new Graphics());
const add = (parent, ...kids) => { kids.forEach(k => parent.addChild(k)); return kids[0]; };
// Feuille à calques : on y trace comme dans un Graphics ; un enfant ajouté (addChild) se pose par-dessus ce qui est déjà tracé,
// et la suite se trace au-dessus de lui. « root » est le Container qui porte le tout.
function layers() {
  const root = new Container(); let cur = add(root, new Graphics());
  const g = new Proxy({}, { get(_, k) {
    if (k === 'root') return root;
    if (k === 'addChild') return (...kids) => { kids.forEach(x => root.addChild(x)); cur = add(root, new Graphics()); return kids[0]; };
    const v = cur[k]; return typeof v === 'function' ? (...a) => { const r = v.apply(cur, a); return r === cur ? g : r; } : v;
  } });
  return g;
}
const R = x => x.root || x;
// Ombre franche : le même dessin, tout en encre, décalé en bas à droite.
function shadowed(draw, dx = 3, dy = 4, alpha = 0.55) {
  const c = new Container(), s = R(draw()); s.tint = INK; s.alpha = alpha; s.position.set(dx, dy);
  c.addChild(s, R(draw())); return c;
}
// Halo flou derrière un dessin (cosmétiques rares).
function glow(draw, color, strength = 10, alpha = 0.8) {
  const g = draw(); g.tint = color; g.alpha = alpha; g.filters = [new BlurFilter({ strength, quality: 4 })]; return g;
}
const star = (g, x, y, r, n = 4, inner = 0.32, rot = -Math.PI / 2) => {
  const p = []; for (let i = 0; i < n * 2; i++) p.push(...pt(x, y, i % 2 ? r * inner : r, rot + i * Math.PI / n)); return g.poly(p);
};
// Trame BD : points d'encre, plus gros loin du centre. Dessinée une fois en 2D (des milliers de points) et partagée par tous les dos.
let halftoneTex = null;
function halftone(w, h, step, rMax, alpha = 0.3, from = 0.25) {
  if (!halftoneTex) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d'), cx = w / 2, cy = h / 2, far = Math.hypot(cx, cy);
    g.scale(2, 2); g.fillStyle = '#170d08'; g.beginPath();
    for (let y = step / 2, row = 0; y < h; y += step * 0.87, row++) for (let x = (row % 2 ? step / 2 : 0); x < w + step; x += step) {
      const k = (Math.hypot(x - cx, y - cy) / far - from) / (1 - from); if (k <= 0) continue;
      const r = rMax * Math.min(1, k); g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    g.fill(); halftoneTex = Texture.from(c);
  }
  const s = new Sprite(halftoneTex); s.width = w; s.height = h; s.alpha = alpha; return s;
}

// ---- Icônes des monnaies (64 × 64) ----
// Cristaux magiques : objets lumineux, halo et étincelles, sans contour d'encre pour rester nets en tout petit.
const glint = (g, x, y, r, color = 0xffffff) => { const p = []; for (let i = 0; i < 8; i++) p.push(...pt(x, y, i % 2 ? r * 0.18 : r, -Math.PI / 2 + i * Math.PI / 4)); return g.poly(p).fill(color); };
const group = (...kids) => { const c = new Container(); kids.forEach(k => c.addChild(k)); return c; };
const ICONS = {
  // Éclat : grappe de cristaux d'ambre qui luit.
  shard: () => { const g = new Graphics();
    const cr = (x, y, h, w, a, c1, c2) => { const s = new Graphics(); s.poly([0, -h, w, -h * 0.55, w * 0.8, 0, -w * 0.8, 0, -w, -h * 0.55]).fill(grad([[0, c1], [1, c2]], 'linear', [0, 0, 1, 0]));
      s.poly([0, -h, -w, -h * 0.55, -w * 0.8, 0, 0, 0]).fill({ color: 0xffffff, alpha: 0.35 }); s.position.set(x, y); s.rotation = a; return s; };
    const c = group(glow(() => new Graphics().ellipse(32, 38, 22, 24).fill(0xffffff), 0xffa020, 10, 0.75),
      cr(19, 56, 30, 8, -0.45, 0xffd060, 0xc06000), cr(45, 56, 28, 8, 0.45, 0xffd060, 0xc06000), cr(32, 58, 52, 11, 0, 0xfff0a0, 0xd87a00), g);
    g.ellipse(32, 58, 22, 4).fill({ color: 0x5a2a00, alpha: 0.6 }); glint(g, 50, 12, 7); glint(g, 14, 22, 5, 0xfff0a0); return c; },
  // Prisme : gemme violette qui flotte, entourée d'étincelles.
  prism: () => { const g = new Graphics();
    g.poly([32, 4, 48, 26, 32, 58, 16, 26]).fill(grad([[0, 0xf0e0ff], [0.45, 0xa070ff], [1, 0x4a1aa0]], 'linear', [0, 0, 1, 1]));
    g.poly([32, 4, 48, 26, 32, 58]).fill({ color: 0x3a0a90, alpha: 0.45 }); g.poly([32, 4, 16, 26, 32, 26]).fill({ color: 0xffffff, alpha: 0.5 });
    g.moveTo(16, 26).lineTo(48, 26).stroke({ width: 1.2, color: 0xffffff, alpha: 0.6 });
    glint(g, 52, 10, 7); glint(g, 10, 44, 5, 0xe0c8ff); glint(g, 50, 50, 4, 0xe0c8ff);
    return group(glow(() => new Graphics().poly([32, 4, 48, 26, 32, 58, 16, 26]).fill(0xffffff), 0xa060ff, 12, 0.85), g); },
  // Coffre d'arts : entrouvert, la lumière en jaillit.
  chest: () => { const g = new Graphics();
    // coffre entrouvert, lumière qui jaillit
    const beam = new Graphics().poly([20, 30, 44, 30, 58, 2, 6, 2]).fill(0xfff0a0); beam.alpha = 0.7; beam.blendMode = 'add'; beam.filters = [new BlurFilter({ strength: 4 })];
    g.roundRect(8, 32, 48, 26, 5).fill(grad([[0, 0xb06a30], [1, 0x6a3410]]));
    g.rect(8, 44, 48, 3).fill(0x5a2a08); for (const x of [16, 42]) g.rect(x, 32, 6, 26).fill(grad([[0, 0xfff0a0], [1, 0xc08a20]], 'linear', [0, 0, 1, 0]));
    g.poly([6, 30, 58, 30, 54, 16, 10, 12]).fill(grad([[0, 0xd88a40], [1, 0xa05a20]])); g.poly([6, 30, 58, 30, 57, 27, 7, 27]).fill(0xf0c040);
    g.rect(10, 30, 44, 3).fill(0xfff6c0); g.roundRect(28, 33, 8, 10, 2).fill(0xf0c040); g.circle(32, 38, 2.5).fill(0xd0103a);
    glint(g, 32, 12, 7); glint(g, 18, 18, 4, 0xfff0a0); glint(g, 47, 20, 5, 0xfff0a0);
    return group(glow(() => new Graphics().rect(10, 26, 44, 8).fill(0xffffff), 0xffd060, 8, 0.9), beam, g); },
};
// Écu de clan : pièce d'or frappée d'un écu héraldique, la monnaie du magasin de clan.
ICONS.ecu = () => { const g = new Graphics();
  g.circle(32, 34, 25).fill(0x9a6a1c); g.circle(32, 32, 25).fill(grad([[0, 0xfff0a0], [0.5, 0xe3b552], [1, 0xa8741e]], 'linear', [0, 0, 1, 1]));
  g.circle(32, 32, 19).stroke({ width: 2, color: 0x9a6a1c });
  g.moveTo(22, 21).lineTo(42, 21).lineTo(42, 32).quadraticCurveTo(42, 42, 32, 46).quadraticCurveTo(22, 42, 22, 32).closePath().fill(0xb0282a);
  g.moveTo(32, 21).lineTo(42, 21).lineTo(42, 32).quadraticCurveTo(42, 42, 32, 46).closePath().fill(0x2a5fa8);
  g.moveTo(22, 21).lineTo(42, 21).lineTo(42, 32).quadraticCurveTo(42, 42, 32, 46).quadraticCurveTo(22, 42, 22, 32).closePath().stroke({ width: 2, color: 0x5a3a08 });
  star(g, 32, 31, 6, 5, 0.45).fill(0xfff0a0);
  glint(g, 50, 12, 6); glint(g, 13, 46, 4, 0xfff0a0);
  return group(glow(() => new Graphics().circle(32, 32, 26).fill(0xffffff), 0xffc040, 8, 0.6), g); };
// Insigne du boss mondial : écu de fer marqué de trois griffures de braise, la monnaie du magasin du boss.
ICONS.insigne = () => { const g = new Graphics();
  const shield = k => k.moveTo(12, 8).lineTo(52, 8).lineTo(52, 30).quadraticCurveTo(52, 50, 32, 60).quadraticCurveTo(12, 50, 12, 30).closePath();
  shield(g).fill(grad([[0, 0x8a8a96], [0.5, 0x4a4a56], [1, 0x24242c]], 'linear', [0, 0, 1, 1])); shield(g).stroke(ink(3));
  g.moveTo(16, 12).lineTo(48, 12).stroke({ width: 2, color: 0xd8dde4, alpha: 0.7 });
  for (const [x, y] of [[23, 0], [32, -2], [41, 0]]) g.moveTo(x - 5, 20 + y).quadraticCurveTo(x - 1, 34 + y, x + 4, 48 + y).lineTo(x + 1, 49 + y).quadraticCurveTo(x - 4, 34 + y, x - 7, 21 + y).closePath().fill(0xffa030).stroke(ink(1.5));
  glint(g, 50, 10, 6); glint(g, 14, 44, 4, 0xffd080);
  return group(glow(() => new Graphics().circle(32, 34, 26).fill(0xffffff), 0xff8a2a, 8, 0.6), g); };
export function drawIcon(kind) {
  const f = ICONS[kind]; if (!f) return null;
  const c = new Container(); c.addChild(f()); return c;
}

// ---- Emblèmes des dos (dessinés autour de 0,0, rayon utile ~60) ----
const EMBLEMS = {
  // Sceau du jeu : trois gemmes, les trois zones du plateau, autour d'une étoile.
  sceau: () => { const g = new Graphics();
    star(g, 0, 0, 58, 4, 0.22, 0).fill(0x8f5f1c).stroke(ink(3));
    g.circle(0, 0, 38).stroke(ink(9)).circle(0, 0, 38).stroke({ width: 4.5, color: 0xe3b552 });
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3, [x, y] = pt(0, 0, 38, a), [lx, ly] = pt(x, y, 17, a - Math.PI / 2), [rx, ry] = pt(x, y, 17, a + Math.PI / 2),
      [ox, oy] = pt(x, y, 22, a), [ix, iy] = pt(x, y, 18, a + Math.PI);
      g.poly([ox, oy, rx, ry, ix, iy, lx, ly]).fill(0xf5d27a).stroke(ink(3.5)); g.poly([ox, oy, rx, ry, ix, iy]).fill(0xb8812a); g.poly([ox, oy, rx, ry, ix, iy, lx, ly]).stroke(ink(3.5)); }
    g.circle(0, 0, 13).fill(0xfff3cf).stroke(ink(3.5)); star(g, 0, 0, 8, 4, 0.35).fill(0xe3b552);
    return g; },
  // Ange : auréole et ailes de plumes.
  ailes: () => { const g = new Graphics();
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const a = s < 0 ? Math.PI + 0.55 - i * 0.32 : -0.55 + i * 0.32, len = 58 - i * 7;
      g.poly(featherPoly(s * 8, 6, a, len, 11 - i)).fill(i % 2 ? 0xe9dcb4 : 0xfff6d6).stroke(ink(3)); }
    g.ellipse(0, -40, 24, 7).stroke(ink(9)).ellipse(0, -40, 24, 7).stroke({ width: 4.5, color: 0xf3d27a });
    g.poly([0, -16, 10, 6, 0, 30, -10, 6]).fill(0xf3d27a).stroke(ink(3.5)); g.poly([0, -16, 10, 6, 0, 30]).fill(0xc99a1e); g.poly([0, -16, 10, 6, 0, 30, -10, 6]).stroke(ink(3.5));
    return g; },
  // Démon : pentacle et cornes.
  cornes: () => { const g = new Graphics();
    for (const s of [-1, 1]) {
      g.moveTo(s * 16, -18).bezierCurveTo(s * 30, -36, s * 46, -44, s * 44, -68).bezierCurveTo(s * 60, -46, s * 52, -20, s * 34, -6).closePath().fill(0xe8d8b8).stroke(ink(3.5));
      g.moveTo(s * 40, -12).bezierCurveTo(s * 52, -26, s * 54, -44, s * 46, -62).stroke({ width: 4, color: 0x9a8a6a, cap: 'round' });
    }
    g.circle(0, 12, 40).fill(0x2a0606).stroke(ink(8)).circle(0, 12, 40).stroke({ width: 3.5, color: 0xff5a3a });
    const p = []; for (let i = 0; i < 5; i++) p.push(pt(0, 12, 38, -Math.PI / 2 + i * TAU / 5));
    const path = [0, 2, 4, 1, 3, 0].map(i => p[i]);
    g.moveTo(...path[0]); path.slice(1).forEach(q => g.lineTo(...q)); g.stroke(ink(8));
    g.moveTo(...path[0]); path.slice(1).forEach(q => g.lineTo(...q)); g.stroke({ width: 3.5, color: 0xff7a52, join: 'round' });
    return g; },
  // Gobelin : dagues croisées sur un bouclier clouté.
  dagues: () => { const g = layers();
    g.circle(0, 0, 40).fill(0x7a5a2a).stroke(ink(4)); g.circle(0, 0, 30).stroke({ width: 3, color: 0x5a3e1a });
    for (let i = 0; i < 8; i++) { const [x, y] = pt(0, 0, 35, i * TAU / 8); g.circle(x, y, 3).fill(0xc9a24a).stroke(ink(1.5)); }
    for (const s of [-1, 1]) { const d = new Graphics();
      d.poly([0, -62, 8, -48, 6, 14, -6, 14, -8, -48]).fill(0xd8dde4).stroke(ink(3.5)); d.poly([0, -62, 8, -48, 6, 14, 0, 14]).fill(0x9aa3ae); d.poly([0, -62, 8, -48, 6, 14, -6, 14, -8, -48]).stroke(ink(3.5));
      d.roundRect(-18, 14, 36, 8, 3).fill(0xc9a24a).stroke(ink(3)); d.roundRect(-5, 22, 10, 24, 3).fill(0x6a3a1a).stroke(ink(3)); d.circle(0, 50, 6).fill(0xc9a24a).stroke(ink(3));
      d.rotation = s * 0.62; g.addChild(d); }
    return g; },
  // Elfe : feuille sous un croissant de lune.
  feuille: () => { const g = layers();
    for (const s of [-1, 1]) { const l = leaf(0.7, 0x4fbcad, 0x1f6b61); l.rotation = s * 0.9; l.position.set(s * 8, 18); g.addChild(l); }
    const main = leaf(1, 0x8fe0cf, 0x2a8a7e); main.position.set(0, 4); g.addChild(main);
    const m = new Graphics(); m.circle(0, -52, 14).fill(0xfff3cf).stroke(ink(3)); m.circle(6, -56, 12).fill(0x1f6b61); g.addChild(m);
    return g; },
  // Dragon : œil fendu sous une crête d'écailles.
  oeil: () => { const g = new Graphics();
    for (let i = -2; i <= 2; i++) g.poly([i * 18 - 9, -22, i * 18, -46 + Math.abs(i) * 9, i * 18 + 9, -22]).fill(0x8a3a10).stroke(ink(3));
    g.moveTo(-60, 4).quadraticCurveTo(0, -42, 60, 4).quadraticCurveTo(0, 46, -60, 4).closePath().fill(grad([[0, 0xfff07a], [0.6, 0xffb02a], [1, 0xd0500c]], 'radial')).stroke(ink(4.5));
    g.ellipse(0, 4, 8, 26).fill(INK); g.circle(-10, -6, 5).fill(0xffffff);
    g.moveTo(-60, 4).quadraticCurveTo(0, -42, 60, 4).stroke(ink(6));
    return g; },
  // Mort-vivant : crâne couronné sur deux os croisés.
  crane: () => { const g = layers();
    for (const s of [-1, 1]) { const b = new Graphics();
      b.roundRect(-6, -52, 12, 104, 6).fill(0xe9e2cc).stroke(ink(3));
      for (const y of [-52, 52]) b.circle(-6, y, 8).circle(6, y, 8).fill(0xe9e2cc).stroke(ink(3));
      b.rotation = s * 0.8; g.addChild(b); }
    const k = new Graphics();
    k.poly([-26, -36, -20, -58, -10, -42, 0, -62, 10, -42, 20, -58, 26, -36]).fill(0xb8a060).stroke(ink(3));
    k.circle(0, -8, 32).fill(0xe9e2cc).stroke(ink(4)); k.roundRect(-18, 14, 36, 22, 6).fill(0xe9e2cc).stroke(ink(4));
    k.moveTo(-28, 0).bezierCurveTo(-30, 18, -16, 22, -14, 14).lineTo(-14, 30).lineTo(-26, 26).closePath().fill(0xb8b098);
    k.ellipse(-12, -6, 9, 10).ellipse(12, -6, 9, 10).fill(INK); k.circle(-12, -5, 3).circle(12, -5, 3).fill(0x9effa0);
    k.poly([0, 6, 5, 14, -5, 14]).fill(INK);
    for (const x of [-9, -3, 3, 9]) k.moveTo(x, 20).lineTo(x, 34); k.stroke(ink(2.5));
    g.addChild(k); return g; },
  // Vampire : goutte de sang entre deux ailes de chauve-souris.
  goutte: () => { const g = new Graphics();
    for (const s of [-1, 1]) {
      g.moveTo(s * 10, -8).lineTo(s * 30, -30).lineTo(s * 64, -22).lineTo(s * 58, 6).quadraticCurveTo(s * 50, -2, s * 44, 10).quadraticCurveTo(s * 36, 0, s * 28, 14).quadraticCurveTo(s * 20, 6, s * 12, 18).closePath()
        .fill(0x2a0a14).stroke(ink(3.5));
      g.moveTo(s * 30, -30).lineTo(s * 44, 10).moveTo(s * 30, -30).lineTo(s * 28, 14).stroke({ width: 2, color: 0x6a1a34 });
    }
    g.moveTo(0, -54).bezierCurveTo(10, -30, 32, -8, 32, 16).arc(0, 16, 32, 0, Math.PI).bezierCurveTo(-32, -8, -10, -30, 0, -54).closePath().fill(0xd0203a).stroke(ink(4));
    g.moveTo(0, -54).bezierCurveTo(10, -30, 32, -8, 32, 16).arc(0, 16, 32, 0, Math.PI / 2).lineTo(0, -20).closePath().fill(0x8a0c20);
    g.moveTo(0, -54).bezierCurveTo(10, -30, 32, -8, 32, 16).arc(0, 16, 32, 0, Math.PI).bezierCurveTo(-32, -8, -10, -30, 0, -54).closePath().stroke(ink(4));
    g.ellipse(-14, 14, 5, 10).fill(0xffd0d8);
    return g; },
  // Halloween : citrouille sculptée qui luit.
  citrouille: () => { const g = new Graphics();
    g.moveTo(0, -36).quadraticCurveTo(4, -50, 14, -56).stroke({ width: 8, color: INK, cap: 'round' }).moveTo(0, -36).quadraticCurveTo(4, -50, 14, -56).stroke({ width: 4, color: 0x3a7a2a, cap: 'round' });
    for (const [x, rx, c] of [[-24, 30, 0xd0661a], [24, 30, 0xd0661a], [0, 32, 0xf08a24]]) g.ellipse(x, 6, rx, 42).fill(c).stroke(ink(4));
    g.ellipse(0, 6, 32, 42).stroke(ink(4));
    g.poly([-22, -8, -8, -8, -15, -22]).poly([22, -8, 8, -8, 15, -22]).fill(0xffd25a).stroke(ink(2.5));
    g.poly([-30, 14, -20, 22, -10, 14, 0, 22, 10, 14, 20, 22, 30, 14, 20, 34, 0, 38, -20, 34]).fill(0xffd25a).stroke(ink(2.5));
    return g; },
  // Circuit : puce néon.
  puce: () => { const g = new Graphics();
    for (let i = -2; i <= 2; i++) for (const [x0, y0, x1, y1] of [[i * 12, -34, i * 12, -50], [i * 12, 34, i * 12, 50], [-34, i * 12, -50, i * 12], [34, i * 12, 50, i * 12]]) {
      g.moveTo(x0, y0).lineTo(x1, y1); }
    g.stroke({ width: 4, color: 0x19c8e6, cap: 'round' });
    for (let i = -2; i <= 2; i++) g.circle(i * 12, -52, 3).circle(i * 12, 52, 3).circle(-52, i * 12, 3).circle(52, i * 12, 3); g.fill(0x7cffff);
    g.roundRect(-36, -36, 72, 72, 8).fill(0x0b1530).stroke(ink(5)).roundRect(-36, -36, 72, 72, 8).stroke({ width: 3, color: 0x19c8e6 });
    g.roundRect(-20, -20, 40, 40, 4).stroke({ width: 3, color: 0xd42bb8 }); g.circle(0, 0, 9).fill(0x7cffff);
    return g; },
  // Hacker : terminal qui affiche une invite, sous un masque de pirate.
  terminal: () => { const g = new Graphics();
    g.roundRect(-58, -42, 116, 80, 8).fill(0x0a1a14).stroke(ink(5)).roundRect(-58, -42, 116, 80, 8).stroke({ width: 3, color: 0x3ad7ff });
    g.moveTo(-40, -18).lineTo(-24, -4).lineTo(-40, 10).stroke({ width: 6, color: 0x3ad7ff, cap: 'round', join: 'round' });
    g.rect(-14, 6, 26, 6).fill(0x3ad7ff);
    for (const [y, w] of [[-26, 60], [-14, 40], [20, 70]]) g.rect(-8 + (70 - w) / 2, y, w * 0.5, 3).fill(0x1d6b80);
    g.roundRect(-22, 38, 44, 10, 3).fill(0x1d2a3a).stroke(ink(3)).moveTo(-34, 56).lineTo(34, 56).stroke({ width: 6, color: INK, cap: 'round' });
    return g; },
  // Cyborg : engrenage chromé autour d'un œil rouge.
  engrenage: () => { const g = new Graphics();
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10, [x, y] = pt(0, 0, 50, a); g.circle(x, y, 10); }
    g.fill(0xb8c0cc).stroke(ink(3.5));
    g.circle(0, 0, 48).fill(grad([[0, 0xe8edf2], [1, 0x7a8494]])).stroke(ink(4.5));
    g.circle(0, 0, 26).fill(0x1a1d24).stroke(ink(4)); g.circle(0, 0, 14).fill(0xff4fbf); g.circle(-5, -5, 4).fill(0xffd6f0);
    g.moveTo(-48, 0).lineTo(-26, 0).moveTo(26, 0).lineTo(48, 0).stroke({ width: 3, color: 0x4a5260 });
    return g; },
};
// Plume : forme effilée qui part du centre de l'aile.
function featherPoly(x, y, a, len, w) {
  const [tx, ty] = pt(x, y, len, a), [mx, my] = pt(x, y, len * 0.55, a), n = a + Math.PI / 2;
  return [x, y, mx + Math.cos(n) * w, my + Math.sin(n) * w, tx, ty, mx - Math.cos(n) * w * 0.6, my - Math.sin(n) * w * 0.6];
}
function leaf(k, light, dark) {
  const g = new Graphics(), h = 58 * k, w = 26 * k;
  g.moveTo(0, -h).bezierCurveTo(w * 1.5, -h * 0.4, w, h * 0.6, 0, h).bezierCurveTo(-w, h * 0.6, -w * 1.5, -h * 0.4, 0, -h).closePath().fill(light).stroke(ink(3.5));
  g.moveTo(0, -h).bezierCurveTo(w * 1.5, -h * 0.4, w, h * 0.6, 0, h).closePath().fill(dark);
  g.moveTo(0, -h).bezierCurveTo(w * 1.5, -h * 0.4, w, h * 0.6, 0, h).bezierCurveTo(-w, h * 0.6, -w * 1.5, -h * 0.4, 0, -h).closePath().stroke(ink(3.5));
  g.moveTo(0, -h * 0.8).lineTo(0, h * 1.1).stroke(ink(2.5));
  for (let i = 1; i <= 3; i++) { const y = -h * 0.5 + i * h * 0.3; g.moveTo(0, y).lineTo(w * 0.6, y - h * 0.18).moveTo(0, y).lineTo(-w * 0.6, y - h * 0.18); }
  return g.stroke(ink(1.8));
}

// Clan : étendard fendu sur sa hampe, et tour de forteresse crénelée.
EMBLEMS.etendard = () => { const g = new Graphics();
  g.rect(-30, -62, 7, 124).fill(0x8a5a2a).stroke(ink(3)); g.circle(-26.5, -64, 7).fill(0xe3b552).stroke(ink(3));
  g.moveTo(-23, -54).bezierCurveTo(0, -62, 22, -46, 46, -54).lineTo(40, -16).lineTo(48, 22).bezierCurveTo(24, 30, 4, 14, -23, 22).closePath().fill(0xb0282a).stroke(ink(3.5));
  g.moveTo(-23, -54).bezierCurveTo(0, -62, 22, -46, 46, -54).lineTo(40, -16).lineTo(-23, -16).closePath().fill(0x2a5fa8).stroke(ink(3));
  star(g, 10, -18, 15, 5, 0.45).fill(0xf5d27a).stroke(ink(2.5));
  return g; };
EMBLEMS.tour = () => { const g = new Graphics();
  g.poly([-34, 60, -30, -30, 30, -30, 34, 60]).fill(0x8a8a90).stroke(ink(3.5));
  for (let i = 0; i < 4; i++) g.rect(-36 + i * 20, -48, 12, 20).fill(0x9a9aa0).stroke(ink(3));
  g.rect(-38, -32, 76, 8).fill(0x6a6a72).stroke(ink(3));
  for (const [x, y] of [[-16, -10], [8, 14], [-10, 34], [14, -12]]) g.rect(x, y, 14, 7).fill({ color: 0x5a5a62, alpha: 0.7 });
  g.moveTo(-12, 60).lineTo(-12, 32).quadraticCurveTo(0, 18, 12, 32).lineTo(12, 60).closePath().fill(0x2a1a10).stroke(ink(3));
  g.rect(-3, -76, 4, 30).fill(0x6a4a2a).stroke(ink(2)); g.poly([1, -76, 30, -68, 1, -58]).fill(0xb0282a).stroke(ink(2.5));
  return g; };

// Boss mondial : un croc de bête, fendu et cerclé de fer.
EMBLEMS.croc = () => { const g = new Graphics();
  g.moveTo(-30, -56).quadraticCurveTo(0, -70, 30, -56).quadraticCurveTo(26, 10, 0, 64).quadraticCurveTo(-26, 10, -30, -56).closePath().fill(0xf4ead2).stroke(ink(4));
  g.moveTo(-18, -50).quadraticCurveTo(-14, 0, 0, 44).stroke({ width: 5, color: 0xd8c8a0, cap: 'round' });
  g.moveTo(8, -40).lineTo(2, -10).lineTo(10, 6).stroke(ink(3));
  g.rect(-38, -62, 76, 14).fill(0x4a4a56).stroke(ink(3.5)); for (const x of [-26, 0, 26]) g.circle(x, -55, 3.5).fill(0xd8dde4).stroke(ink(1.5));
  return g; };

// ---- Dos de carte (240 × 336) ----
// bg : dégradé du fond (haut, bas) ; ray : rayons ; rim : filet ; med : fond du médaillon ; pattern : motif sous la trame ; night : voile du Crépuscule.
const FAMILY_BACKS = {
  classique: { bg: [0x3a281a, 0x150d08], ray: 0x5a3e24, rim: 0xe3b552, med: 0x24170e, emblem: 'sceau' },
  ange: { bg: [0x8cc4ee, 0x2f5f9a], ray: 0xc8e8ff, rim: 0xf3d27a, med: 0x4a7fb8, emblem: 'ailes' },
  demon: { bg: [0x8e2420, 0x2a0606], ray: 0xb8322a, rim: 0xff7a52, med: 0x3a0808, emblem: 'cornes' },
  gobelin: { bg: [0x6c9a3e, 0x1f3d16], ray: 0x8cba52, rim: 0xe0c060, med: 0x2c4a1e, emblem: 'dagues' },
  elfe: { bg: [0x2a8a7e, 0x0f3a34], ray: 0x4fbcad, rim: 0xd8f0c0, med: 0x14463f, emblem: 'feuille' },
  dragon: { bg: [0xd0702a, 0x4a1c06], ray: 0xe08a3a, rim: 0xffd25a, med: 0x5a2208, emblem: 'oeil', pattern: 'scales' },
  mortvivant: { bg: [0x6f8a7a, 0x1e2a24], ray: 0x8aa492, rim: 0xc8d8b0, med: 0x2a3a32, emblem: 'crane' },
  vampire: { bg: [0x8c2350, 0x24040f], ray: 0xa8325f, rim: 0xff8aac, med: 0x3a0818, emblem: 'goutte' },
  halloween: { bg: [0x3a2050, 0x140b1d], ray: 0x5a2f70, rim: 0xf08a24, med: 0x1d1028, emblem: 'citrouille' },
  cyber: { bg: [0x12244a, 0x060c1c], ray: 0x1a3060, rim: 0x19c8e6, med: 0x081022, emblem: 'puce', pattern: 'circuit', glow: 0x19c8e6 },
};
// Familles vues au Crépuscule : même emblème, voile violet nocturne, filet argent lavande.
for (const f of ['ange', 'demon', 'gobelin', 'elfe', 'dragon']) FAMILY_BACKS[`${f}_set2`] = { ...FAMILY_BACKS[f], bg: [0x4a3470, 0x120a24], ray: 0x5a4288, rim: 0xd8c8ff, med: 0x1d1236, night: true, pattern: null };
// Cité Néon : les deux nouvelles familles, puis les autres sous la nuit bleue de la mégapole, filet néon et circuits.
FAMILY_BACKS.hacker = { bg: [0x0f2a3a, 0x04090f], ray: 0x16405a, rim: 0x3ad7ff, med: 0x061218, emblem: 'terminal', pattern: 'circuit', glow: 0x3ad7ff };
FAMILY_BACKS.cyborg = { bg: [0x3a1238, 0x0c040e], ray: 0x5a1f56, rim: 0xff4fbf, med: 0x18081a, emblem: 'engrenage', pattern: 'circuit', glow: 0xff4fbf };
for (const f of ['ange', 'demon', 'gobelin', 'elfe', 'dragon', 'mortvivant', 'vampire']) FAMILY_BACKS[`${f}_set3`] = { ...FAMILY_BACKS[f], bg: [0x12244a, 0x060c1c], ray: 0x1a3060, rim: 0x19c8e6, med: 0x081022, pattern: 'circuit', glow: 0xd42bb8 };

// Clan : l'étendard sur fond de gueules et d'azur, la forteresse sous un ciel de pierre.
FAMILY_BACKS.clan_etendard = { bg: [0x8a2024, 0x1a2a5a], ray: 0xc0403a, rim: 0xf5d27a, med: 0x1a1a3a, emblem: 'etendard' };
FAMILY_BACKS.clan_forteresse = { bg: [0x5a6070, 0x16181e], ray: 0x7a8090, rim: 0xe3b552, med: 0x22242c, emblem: 'tour', glow: 0xf5d27a };

// Boss mondial : le croc du trophée sur fond de braises.
FAMILY_BACKS.boss_trophee = { bg: [0x6a1e10, 0x140504], ray: 0x9a3418, rim: 0xffb04a, med: 0x2a0806, emblem: 'croc', glow: 0xff7a2a };

function panelShape(g, inset, r) { return g.roundRect(inset, inset, BACK_W - inset * 2, BACK_H - inset * 2, r); }
function backFrame(c, t, inner) {
  const W = BACK_W, H = BACK_H;
  add(c, new Graphics().roundRect(0, 0, W, H, 16).fill(INK));
  const body = add(c, new Container()), mask = panelShape(new Graphics(), 7, 11).fill(0xffffff);
  c.addChild(mask); body.mask = mask;
  add(body, panelShape(new Graphics(), 0, 0).rect(0, 0, W, H).fill(grad([[0, t.bg[0]], [1, t.bg[1]]])));
  inner(body);
  // trame BD par-dessus le fond, plus dense vers les bords
  add(body, halftone(W, H, 9, 3.2, 0.35, 0.2));
  const f = add(c, new Graphics());
  panelShape(f, 15, 8).stroke(ink(6)); panelShape(f, 15, 8).stroke({ width: 2.5, color: t.rim });
  for (const [x, y] of [[15, 15], [W - 15, 15], [15, H - 15], [W - 15, H - 15]]) f.poly([x, y - 9, x + 9, y, x, y + 9, x - 9, y]).fill(t.rim).stroke(ink(2.5));
  for (const y of [15, H - 15]) star(f, W / 2, y, 11, 4, 0.4).fill(t.rim).stroke(ink(2.5));
}
function rays(g, t, n = 22) {
  const cx = BACK_W / 2, cy = BACK_H / 2;
  for (let i = 0; i < n; i += 2) g.poly([cx, cy, ...pt(cx, cy, 400, i * TAU / n), ...pt(cx, cy, 400, (i + 1) * TAU / n)]);
  return g.fill({ color: t.ray, alpha: 0.45 });
}
function pattern(body, t) {
  const g = add(body, new Graphics()), rnd = seeded(7);
  if (t.pattern === 'scales') {
    for (let y = -10, r = 0; y < BACK_H + 20; y += 14, r++) for (let x = r % 2 ? 0 : 12; x < BACK_W + 24; x += 24) arc(g, x, y, 12, 0, Math.PI).stroke({ width: 2.5, color: 0x6a2808, alpha: 0.7 });
  } else if (t.pattern === 'circuit') {
    for (let i = 0; i < 26; i++) { let x = Math.round(rnd() * 12) * 20, y = Math.round(rnd() * 17) * 20; g.moveTo(x, y);
      for (let s = 0; s < 3; s++) { rnd() < 0.5 ? (x += (rnd() < 0.5 ? -1 : 1) * 40) : (y += (rnd() < 0.5 ? -1 : 1) * 40); g.lineTo(x, y); }
      g.stroke({ width: 2, color: 0x19c8e6, alpha: 0.45 }); g.circle(x, y, 3.5).fill({ color: 0x7cffff, alpha: 0.7 }); }
  } else rays(g, t);
  if (t.night) {
    for (let i = 0; i < 40; i++) { const x = rnd() * BACK_W, y = rnd() * BACK_H, r = 0.8 + rnd() * 1.6; g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.5 + rnd() * 0.5 }); }
    star(g, 52, 70, 7, 4, 0.3).star(188, 268, 6, 4, 0.3).fill(0xfff3cf);
    g.circle(184, 66, 20).fill(0xfff3cf).stroke(ink(3)); g.circle(194, 60, 18).fill(t.bg[0]);
  }
}
function medallion(c, t, emblem) {
  const cx = BACK_W / 2, cy = BACK_H / 2, m = add(c, new Container()); m.position.set(cx, cy);
  if (t.glow) add(m, glow(() => new Graphics().circle(0, 0, 70).fill(0xffffff), t.glow, 14, 0.6));
  add(m, new Graphics().circle(0, 0, 76).fill(t.med).stroke(ink(7)).circle(0, 0, 69).stroke({ width: 3, color: t.rim }));
  const rg = add(m, new Graphics()); for (let i = 0; i < 16; i += 2) rg.poly([0, 0, ...pt(0, 0, 66, i * TAU / 16), ...pt(0, 0, 66, (i + 1) * TAU / 16)]); rg.fill({ color: t.ray, alpha: 0.35 });
  add(m, shadowed(EMBLEMS[emblem]));
}
// Scènes pleine carte des passes de saison premium.
const SCENES = {
  // Nuit hantée : pleine lune, château et chauves-souris.
  halloween_p: { rim: 0xc8a0ff, bg: [0x5a2a86, 0x12081d], draw(body) {
    const g = add(body, new Graphics()), W = BACK_W, rnd = seeded(3);
    for (let i = 0; i < 30; i++) g.circle(rnd() * W, rnd() * 200, 0.8 + rnd() * 1.4).fill({ color: 0xffffff, alpha: 0.7 });
    add(body, glow(() => new Graphics().circle(W / 2, 128, 66).fill(0xffffff), 0xffd27a, 24, 0.7));
    g.circle(W / 2, 128, 62).fill(0xffe9a8).stroke(ink(5)); g.circle(W / 2 - 18, 112, 12).circle(W / 2 + 22, 146, 9).circle(W / 2 + 14, 104, 6).fill(0xe8c878);
    const s = add(body, new Graphics()), base = 262;
    s.poly([0, base, 40, base - 18, 80, base - 6, 120, base - 22, 160, base - 6, 200, base - 18, W, base, W, 336, 0, 336]).fill(0x12081d);
    for (const [x, w, h] of [[78, 22, 70], [104, 32, 96], [140, 22, 70]]) { s.rect(x, base - h, w, h).fill(0x12081d); s.poly([x - 4, base - h, x + w / 2, base - h - 30, x + w + 4, base - h]).fill(0x12081d); }
    for (const [x, y] of [[88, 214], [118, 190], [148, 214], [118, 222]]) s.rect(x - 3, y - 5, 6, 10).fill(0xffd25a);
    for (const [x, y, k] of [[60, 70, 1], [180, 210, 0.8], [44, 200, 0.7], [196, 96, 0.9]]) bat(s, x, y, k);
  } },
  // Mégapole : soleil néon, gratte-ciel et sol quadrillé.
  cyber_p: { rim: 0xff5ad8, bg: [0x2a0d4a, 0x060818], glow: 0xd42bb8, draw(body) {
    const W = BACK_W, H = BACK_H, hz = 214;
    add(body, glow(() => new Graphics().circle(W / 2, 150, 70).fill(0xffffff), 0xff5ad8, 26, 0.8));
    const g = add(body, new Graphics());
    g.circle(W / 2, 150, 66).fill(grad([[0, 0xfff05a], [0.55, 0xff7a6a], [1, 0xd42bb8]]));
    for (let i = 0; i < 6; i++) g.rect(W / 2 - 70, 160 + i * 9, 140, 2 + i * 0.9).fill(0x2a0d4a);
    const rnd = seeded(11), city = add(body, new Graphics());
    for (let x = -4; x < W; ) { const w = 14 + rnd() * 18, h = 30 + rnd() * 70 * (1 - Math.abs(x + w / 2 - W / 2) / W);
      city.rect(x, hz - h, w, h).fill(0x0b0a24).stroke({ width: 1.5, color: 0x19c8e6, alpha: 0.6 });
      for (let wy = hz - h + 6; wy < hz - 4; wy += 8) for (let wx = x + 4; wx < x + w - 3; wx += 6) if (rnd() < 0.45) city.rect(wx, wy, 2.5, 3).fill(rnd() < 0.5 ? 0x7cffff : 0xff8ae0);
      x += w + 2; }
    const f = add(body, new Graphics()); f.rect(0, hz, W, H - hz).fill(0x0b0620);
    for (let i = -8; i <= 8; i++) f.moveTo(W / 2 + i * 6, hz).lineTo(W / 2 + i * 60, H);
    for (let k = 0; k < 7; k++) { const y = hz + Math.pow(k / 6, 1.8) * (H - hz); f.moveTo(0, y).lineTo(W, y); }
    f.stroke({ width: 2, color: 0xff5ad8, alpha: 0.8 }); f.moveTo(0, hz).lineTo(W, hz).stroke({ width: 3, color: 0x7cffff });
  } },
};
function bat(g, x, y, k) {
  g.moveTo(x, y).quadraticCurveTo(x - 10 * k, y - 10 * k, x - 22 * k, y - 4 * k).quadraticCurveTo(x - 16 * k, y, x - 14 * k, y + 6 * k).quadraticCurveTo(x - 8 * k, y + 1 * k, x, y + 6 * k)
    .quadraticCurveTo(x + 8 * k, y + 1 * k, x + 14 * k, y + 6 * k).quadraticCurveTo(x + 16 * k, y, x + 22 * k, y - 4 * k).quadraticCurveTo(x + 10 * k, y - 10 * k, x, y).closePath().fill(0x12081d);
}
export function drawBack(id) {
  const scene = SCENES[id], t = scene || FAMILY_BACKS[id]; if (!t) return null;
  const c = new Container();
  backFrame(c, { ray: 0, med: 0, ...t }, body => (scene ? scene.draw(body) : pattern(body, t)));
  if (!scene) medallion(c, t, t.emblem);
  return c;
}

// ---- Cadres de profil (256 × 256 plus la marge FRAME_PAD, trou rond au centre) ----
const C = FRAME_S / 2, RH = FRAME_HOLE * FRAME_S, RB = RH + 20;
// Anneau de métal BD : aplat, reflet franc en haut à gauche, ombre franche en bas à droite, deux traits d'encre.
function ring(g, { base, hi, lo }, r0 = RH, r1 = RB) {
  const m = (r0 + r1) / 2, w = r1 - r0;
  g.circle(C, C, m).stroke({ width: w, color: base });
  arc(g, C, C, m, Math.PI * 1.05, Math.PI * 1.55).stroke({ width: w * 0.4, color: hi, cap: 'round' });
  arc(g, C, C, m + w * 0.18, Math.PI * 0.05, Math.PI * 0.7).stroke({ width: w * 0.4, color: lo, cap: 'round' });
  g.circle(C, C, r1).stroke(ink(4.5)); g.circle(C, C, r0).stroke(ink(4.5));
  return g;
}
const beads = (g, n, r, color, size = 4, from = 0) => { for (let i = 0; i < n; i++) { const [x, y] = pt(C, C, r, from + i * TAU / n); g.circle(x, y, size).fill(color).stroke(ink(2)); } return g; };
const gem = (g, x, y, r, color, light = 0xffffff) => { g.poly([x, y - r, x + r, y, x, y + r, x - r, y]).fill(color).stroke(ink(2.5)); g.poly([x, y - r, x + r, y, x, y]).fill({ color: light, alpha: 0.45 }); return g.poly([x, y - r, x + r, y, x, y + r, x - r, y]).stroke(ink(2.5)); };
const roundGem = (g, x, y, r, color) => g.circle(x, y, r).fill(color).stroke(ink(2.5)).circle(x - r * 0.3, y - r * 0.3, r * 0.3).fill({ color: 0xffffff, alpha: 0.85 });
// Fleuron : trois lobes et une pointe, posé sur l'anneau à l'angle a.
function fleuron(g, a, color, size = 1) {
  const f = new Graphics(), s = size;
  f.circle(0, -14 * s, 6 * s).circle(-9 * s, -6 * s, 5 * s).circle(9 * s, -6 * s, 5 * s).fill(color).stroke(ink(2.5));
  f.poly([0, -30 * s, 6 * s, -16 * s, 0, -4 * s, -6 * s, -16 * s]).fill(color).stroke(ink(2.5));
  const [x, y] = pt(C, C, RB - 2, a); f.position.set(x, y); f.rotation = a + Math.PI / 2; g.addChild(f);
}
function crown(g, color, gems, y = C - RB + 6) {
  const k = new Graphics(), w = 76, h = 40;
  k.poly([-w / 2, 0, -w / 2 - 6, -h, -w / 4, -h * 0.45, 0, -h - 8, w / 4, -h * 0.45, w / 2 + 6, -h, w / 2, 0]).fill(color).stroke(ink(3.5));
  k.rect(-w / 2, -8, w, 10).fill(color).stroke(ink(3));
  [[-w / 2 - 6, -h], [0, -h - 8], [w / 2 + 6, -h]].forEach(([x, yy]) => k.circle(x, yy, 4.5).fill(0xfff3cf).stroke(ink(2)));
  gems.forEach((c, i) => roundGem(k, -w / 2 + 8 + i * (w - 16) / Math.max(1, gems.length - 1), -3, 4.5, c));
  k.position.set(C, y); g.addChild(k);
}
function laurel(g, color, dark) {
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + s * (0.35 + i * 0.22), [x, y] = pt(C, C, RB + 4, a), l = new Graphics();
    l.ellipse(0, 0, 5, 11).fill(i % 2 ? color : dark).stroke(ink(2)); l.position.set(x, y); l.rotation = a + s * 0.6; g.addChild(l); }
}
const sparkle = (g, x, y, r) => star(g, x, y, r, 4, 0.25).fill(0xffffff).stroke(ink(1.5));
const METAL = {
  bronze: { base: 0xc07a3a, hi: 0xf0b27a, lo: 0x7a4218 }, argent: { base: 0xc8ced6, hi: 0xffffff, lo: 0x7d8794 },
  or: { base: 0xe3b552, hi: 0xfff0b0, lo: 0x9a6a1c }, platine: { base: 0xa8d4ce, hi: 0xf4fffd, lo: 0x5f8e88 },
  diamant: { base: 0x8cc8f0, hi: 0xffffff, lo: 0x3a7fd0 }, fer: { base: 0x4a3a34, hi: 0x8a6a5a, lo: 0x24180f },
  nuit: { base: 0x2a3a7a, hi: 0x6a7ad0, lo: 0x141c44 }, violet: { base: 0x6a3a9a, hi: 0xb08ae0, lo: 0x3a1a5a },
  maitre: { base: 0x9a4ad0, hi: 0xf08ad8, lo: 0x4a1a7a }, neon: { base: 0x0b1530, hi: 0x19c8e6, lo: 0x050a18 },
};
// Tube néon : contour d'encre, couleur, puis cœur clair ; path(k) trace le chemin sur le Graphics k et le renvoie.
function neon(g, path, color, w = 3) {
  add(g, glow(() => path(new Graphics()).stroke({ width: w + 6, color: 0xffffff, cap: 'round', join: 'round' }), color, 6, 0.8));
  for (const [ww, c, a] of [[w + 4, INK, 1], [w, color, 1], [w * 0.4, 0xffffff, 0.8]]) path(add(g, new Graphics())).stroke({ width: ww, color: c, alpha: a, cap: 'round', join: 'round' });
}
// Bougie qui coule, flamme et halo, posée sur (x, y).
function candle(g, x, y, h) {
  add(g, glow(() => new Graphics().circle(x, y - h - 10, 9).fill(0xffffff), 0xffb02a, 8, 0.9));
  const k = add(g, new Graphics());
  k.moveTo(x - 6, y).lineTo(x - 6, y - h).quadraticCurveTo(x, y - h - 3, x + 6, y - h).lineTo(x + 6, y - h + 9).quadraticCurveTo(x + 8, y - h + 14, x + 6, y - h + 15).lineTo(x + 6, y).closePath().fill(0xf0e6d0).stroke(ink(2.5));
  k.moveTo(x, y - h - 1).lineTo(x, y - h - 5).stroke(ink(2));
  k.moveTo(x, y - h - 21).quadraticCurveTo(x + 7, y - h - 10, x, y - h - 5).quadraticCurveTo(x - 7, y - h - 10, x, y - h - 21).closePath().fill(0xffb02a).stroke(ink(1.5));
  k.moveTo(x, y - h - 15).quadraticCurveTo(x + 3, y - h - 9, x, y - h - 7).quadraticCurveTo(x - 3, y - h - 9, x, y - h - 15).closePath().fill(0xfff3a0);
}
// Chapeau de sorcière : bord, cône à pointe recourbée, ruban et boucle d'or ; (x, y) est le milieu du bord.
function witchHat(g, x, y, rot = 0) {
  const k = new Graphics();
  k.ellipse(0, 0, 50, 11).fill(0x2a1640).stroke(ink(3.5));
  k.moveTo(-30, -2).quadraticCurveTo(-18, -34, -6, -52).quadraticCurveTo(10, -66, 30, -60).quadraticCurveTo(14, -56, 8, -44).quadraticCurveTo(20, -20, 30, -2).closePath().fill(0x3a1d5a).stroke(ink(3.5));
  k.moveTo(-26, -6).quadraticCurveTo(-18, -26, -8, -42).stroke({ width: 4, color: 0x6a3a9a, cap: 'round' });
  k.moveTo(-28, -4).quadraticCurveTo(0, -12, 28, -4).lineTo(26, -14).quadraticCurveTo(0, -22, -25, -14).closePath().fill(0x7cff6a).stroke(ink(2.5));
  k.rect(-7, -18, 14, 13).fill(0xffd45a).stroke(ink(2.5)); k.rect(-3, -14, 6, 5).fill(0x3a1d5a);
  k.position.set(x, y); k.rotation = rot; g.addChild(k);
}
// Croissant de lune : le disque (x, y, r) privé du disque (x + dx, y + dy, r2), en polygone (contour d'encre propre).
function crescent(x, y, r, dx, dy, r2, n = 48) {
  const inCut = (px, py) => Math.hypot(px - x - dx, py - y - dy) < r2, out = [], inner = [];
  for (let i = 0; i < n; i++) { const p = pt(x, y, r, i * TAU / n); if (!inCut(...p)) out.push(p); }
  for (let i = 0; i < n; i++) { const p = pt(x + dx, y + dy, r2, i * TAU / n); if (Math.hypot(p[0] - x, p[1] - y) < r) inner.push(p); }
  // Mettre le contour extérieur dans l'ordre (il peut commencer au milieu de l'arc), puis revenir par l'arc intérieur.
  const gap = out.findIndex((p, i) => i && Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 2 * TAU * r / n);
  const arcOut = gap > 0 ? [...out.slice(gap), ...out.slice(0, gap)] : out;
  const gi = inner.findIndex((p, i) => i && Math.hypot(p[0] - inner[i - 1][0], p[1] - inner[i - 1][1]) > 2 * TAU * r2 / n);
  const arcIn = gi > 0 ? [...inner.slice(gi), ...inner.slice(0, gi)] : inner;
  return [...arcOut, ...arcIn.reverse()].flat();
}
// Langue de feu posée sur (x, y), haute de h, large de 2w, pointe déportée de lean.
function flameTongue(g, x, y, h, w, lean, color) {
  g.moveTo(x - w, y).bezierCurveTo(x - w * 1.3, y - h * 0.45, x + lean * 0.3 - w * 0.5, y - h * 0.7, x + lean, y - h)
    .bezierCurveTo(x + lean * 0.5 + w * 0.2, y - h * 0.6, x + w * 1.2, y - h * 0.4, x + w, y).closePath().fill(color).stroke(ink(color === 0xc0261a ? 3 : 0.01));
}
const FAM_GEMS = [0xe2b93e, 0xd0443a, 0x4f8c3a, 0x2a8a7e, 0xe07a2a];
const FRAMES = {
  bronze: g => { ring(g, METAL.bronze); beads(g, 4, (RH + RB) / 2, 0x7a4218, 4.5, Math.PI / 4); },
  argent: g => { ring(g, METAL.argent); beads(g, 8, (RH + RB) / 2, 0xffffff, 3.5, Math.PI / 8); fleuron(g, -Math.PI / 2, 0xdfe4ea, 0.8); },
  or: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 2).stroke({ width: 10, color: 0xffffff }), 0xffd45a, 8, 0.6));
    ring(g, METAL.or); beads(g, 16, (RH + RB) / 2, 0xfff0b0, 2.5, TAU / 32); [0, 1, 2, 3].forEach(i => fleuron(g, -Math.PI / 2 + i * Math.PI / 2, 0xffd45a, i ? 0.75 : 1)); },
  platine: g => { add(g, glow(() => new Graphics().circle(C, C, RB).stroke({ width: 10, color: 0xffffff }), 0x7fd8cf, 8, 0.6));
    laurel(g, 0xd4ece8, 0x7fb7b0); ring(g, METAL.platine); beads(g, 12, (RH + RB) / 2, 0xf4fffd, 2.5); gem(g, C, C - RB + 2, 12, 0x7fd8cf); },
  diamant: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 4).stroke({ width: 14, color: 0xffffff }), 0x5aa8e6, 12, 0.85));
    ring(g, METAL.diamant); [0, 1, 2, 3].forEach(i => { const [x, y] = pt(C, C, RB, -Math.PI / 2 + i * Math.PI / 2); gem(g, x, y, i ? 12 : 17, 0xbfe9ff); });
    [[C + 70, C - 92, 9], [C - 96, C - 60, 7], [C + 98, C + 60, 7], [C - 66, C + 98, 8]].forEach(([x, y, r]) => sparkle(g, x, y, r)); },
  // Grand maître : grandes ailes déployées, étoile d'or à huit branches au sommet, ruban sous l'anneau (pas de couronne : ce sont les sets).
  maitre: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 4).stroke({ width: 16, color: 0xffffff }), 0xc060e0, 14, 0.9));
    for (const s of [-1, 1]) { const [x, y] = pt(C, C, RB - 16, s < 0 ? Math.PI + 0.3 : -0.3), dir = a => (s < 0 ? Math.PI + a : -a);
      for (let i = 6; i >= 0; i--) g.poly(featherPoly(x, y, dir(0.02 + i * 0.2), 68 - i * 3, 15)).fill(i % 2 ? 0xe3a83a : 0xffd45a).stroke(ink(2.5));
      for (let i = 4; i >= 0; i--) g.poly(featherPoly(x, y, dir(0.16 + i * 0.24), 44 - i * 2, 13)).fill(i % 2 ? 0xc060e0 : 0xf08ad8).stroke(ink(2.5)); }
    ring(g, METAL.maitre); beads(g, 12, (RH + RB) / 2, 0xffd45a, 3);
    const r = new Graphics(), y = C + RB + 4;
    for (const s of [-1, 1]) r.poly([C + s * 40, y - 12, C + s * 66, y - 10, C + s * 56, y + 2, C + s * 68, y + 14, C + s * 40, y + 12]).fill(0x9a4ad0).stroke(ink(3));
    r.moveTo(C - 46, y - 14).quadraticCurveTo(C, y - 4, C + 46, y - 14).lineTo(C + 46, y + 10).quadraticCurveTo(C, y + 20, C - 46, y + 10).closePath().fill(0xf08ad8).stroke(ink(3));
    r.moveTo(C - 40, y - 6).quadraticCurveTo(C, y + 4, C + 40, y - 6).stroke({ width: 2, color: 0xffd45a });
    g.addChild(r);
    add(g, glow(() => star(new Graphics(), C, C - RB - 4, 36, 8, 0.45).fill(0xffffff), 0xffd45a, 8, 0.8));
    star(g, C, C - RB - 4, 36, 8, 0.45).fill(0xffd45a).stroke(ink(3)); star(g, C, C - RB - 4, 21, 8, 0.5, -Math.PI / 2 + Math.PI / 8).fill(0xfff0b0).stroke(ink(2));
    roundGem(g, C, C - RB - 4, 9, 0xf08ad8); },
  legende: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 2).stroke({ width: 12, color: 0xffffff }), 0xfff0d0, 10, 0.7));
    ring(g, METAL.or); [0xd0547f, 0xe2b93e, 0x4fbcad, 0x77a3e6, 0xa585e6, 0xff7a52, 0x7cd05a, 0x5ad2ff].forEach((c, i) => { const [x, y] = pt(C, C, (RH + RB) / 2, -Math.PI / 2 + i * TAU / 8); roundGem(g, x, y, 8, c); }); },
  // Flammes : anneau d'obsidienne fendu de lave, flammes qui montent vers le haut (plus hautes au sommet), braises en bas.
  flamme: g => { add(g, glow(() => new Graphics().circle(C, C - 10, RB + 10).fill(0xffffff), 0xff6a1f, 16, 0.75));
    const rnd = seeded(7);
    for (const [k, color] of [[1, 0xc0261a], [0.72, 0xf06a1f], [0.44, 0xffd24a]]) for (let i = 0; i <= 12; i++) {
      const a = Math.PI + i * Math.PI / 12, up = Math.sin(-a), [x, y] = pt(C, C, RB - 8, a), h = (22 + 44 * up * up + rnd() * 10) * k, w = (13 + 4 * up) * Math.max(0.55, k);
      flameTongue(g, x, y, h + (k < 1 ? 4 : 0), w, (i - 6) * 1.6 * k, color); }
    ring(g, METAL.fer);
    // Bord intérieur en fusion : la lave luit entre l'anneau et le portrait.
    add(g, glow(() => new Graphics().circle(C, C, RH + 4).stroke({ width: 6, color: 0xffffff }), 0xff8a2a, 6, 1));
    arc(g, C, C, RB - 5, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 3, color: 0xffcf4a, alpha: 0.9, cap: 'round' });
    g.circle(C, C, RH + 3).stroke({ width: 3, color: 0xffb02a });
    for (const [a, r, z] of [[0.35, 14, 3], [0.6, 22, 2.2], [0.9, 10, 2.6], [2.25, 12, 3], [2.5, 22, 2], [2.8, 15, 2.4], [1.57, 18, 2.2]]) { const [x, y] = pt(C, C, RB + r, a); g.circle(x, y, z).fill(0xffcf4a).stroke(ink(1.2)); } },
  duel: g => { for (const s of [-1, 1]) { const w = new Graphics();
      w.poly([0, -196, 7, -182, 6, 30, -6, 30, -7, -182]).fill(0xe4e8ee).stroke(ink(3)); w.poly([0, -196, 7, -182, 6, 30, 0, 30]).fill(0xa8b0ba); w.poly([0, -196, 7, -182, 6, 30, -6, 30, -7, -182]).stroke(ink(3));
      w.roundRect(-20, 30, 40, 9, 3).fill(0xe3b552).stroke(ink(3)); w.roundRect(-5, 39, 10, 22, 3).fill(s < 0 ? 0x2d5a9c : 0xa23f2d).stroke(ink(3)); w.circle(0, 64, 6).fill(0xe3b552).stroke(ink(2.5));
      w.position.set(C + s * 54, C + 64); w.rotation = s * -0.62; g.addChild(w); }
    const r = add(g, new Graphics()), m = (RH + RB) / 2, w = RB - RH;
    arc(r, C, C, m, Math.PI / 2, Math.PI * 1.5).stroke({ width: w, color: 0x2d5a9c }); arc(r, C, C, m, -Math.PI / 2, Math.PI / 2).stroke({ width: w, color: 0xa23f2d });
    arc(r, C, C, m, Math.PI * 1.05, Math.PI * 1.45).stroke({ width: w * 0.4, color: 0x7aa0e0, cap: 'round' }); arc(r, C, C, m, Math.PI * 1.6, Math.PI * 1.9).stroke({ width: w * 0.4, color: 0xe07a5a, cap: 'round' });
    r.circle(C, C, RB).stroke(ink(4.5)).circle(C, C, RH).stroke(ink(4.5)); r.moveTo(C, C - RB).lineTo(C, C - RH).moveTo(C, C + RH).lineTo(C, C + RB).stroke(ink(4)); },
  tresor: g => { ring(g, METAL.or);
    const rnd = seeded(9); for (let i = 0; i < 9; i++) { const a = Math.PI / 2 + (i - 4) * 0.2, [x, y] = pt(C, C, RB + 4 + rnd() * 8, a);
      g.circle(x, y, 11).fill(0xf2c94a).stroke(ink(2.5)).circle(x, y, 6.5).stroke({ width: 2, color: 0xb8862a }); }
    [[-Math.PI / 2, 0xe0405a], [-Math.PI / 2 - 0.8, 0x5ad27a], [-Math.PI / 2 + 0.8, 0x5ab4ff], [Math.PI, 0xa585e6], [0, 0xe0405a]].forEach(([a, c]) => { const [x, y] = pt(C, C, (RH + RB) / 2, a); gem(g, x, y, 10, c); }); },
  etoile: g => { ring(g, METAL.nuit); const rnd = seeded(2);
    for (let i = 0; i < 26; i++) { const [x, y] = pt(C, C, RH + 3 + rnd() * (RB - RH - 6), rnd() * TAU); g.circle(x, y, 0.8 + rnd() * 1.5).fill(0xffffff); }
    star(g, C, C - RB + 2, 22, 5, 0.45).fill(0xffd45a).stroke(ink(3)); [[C - 92, C - 66, 8], [C + 94, C - 62, 7], [C + 76, C + 92, 6], [C - 82, C + 86, 7]].forEach(([x, y, r]) => star(g, x, y, r, 4, 0.3).fill(0xfff3cf).stroke(ink(1.5))); },
  base: g => { ring(g, METAL.or); FAM_GEMS.forEach((c, i) => { const [x, y] = pt(C, C, (RH + RB) / 2, Math.PI / 2 + (i - 2) * 0.45); roundGem(g, x, y, 6.5, c); }); crown(g, 0xe3b552, FAM_GEMS); },
  set2: g => { add(g, glow(() => new Graphics().circle(C, C, RB).stroke({ width: 10, color: 0xffffff }), 0x8c2350, 10, 0.7));
    ring(g, METAL.violet); beads(g, 10, (RH + RB) / 2, 0x8c2350, 3.5); crown(g, 0xd8c8ff, [0x8c2350, 0x5f7a6a, 0x8c2350]);
    g.circle(C, C - RB - 44, 12).fill(0xfff3cf).stroke(ink(2.5)); g.circle(C + 6, C - RB - 48, 10).fill(0x4a3470); },
  set3: g => { add(g, glow(() => new Graphics().circle(C, C, RB).stroke({ width: 10, color: 0xffffff }), 0x3ad7ff, 10, 0.8));
    ring(g, METAL.neon); beads(g, 12, (RH + RB) / 2, 0xff4fbf, 3.5); crown(g, 0x3ad7ff, [0x3ad7ff, 0xff4fbf, 0x3ad7ff]);
    g.circle(C, C, RB - 3).stroke({ width: 2.5, color: 0x3ad7ff }).circle(C, C, RH + 3).stroke({ width: 2.5, color: 0xff4fbf }); },
  halloween: g => { const r = add(g, new Graphics()), m = (RH + RB) / 2, w = RB - RH;
    for (let i = 0; i < 12; i++) arc(r, C, C, m, i * TAU / 12, (i + 1) * TAU / 12).stroke({ width: w, color: i % 2 ? 0x1d1226 : 0xe8741c });
    r.circle(C, C, RB).stroke(ink(4.5)).circle(C, C, RH).stroke(ink(4.5));
    for (const s of [-1, 1]) { const p = new Container(); p.position.set(C + s * 70, C + 92); p.scale.set(0.42); p.addChild(R(EMBLEMS.citrouille())); g.addChild(p); }
    bat(g, C, C - RB - 4, 1.4); },
  // Sabbat : chapeau de sorcière penché sur l'anneau, croissant de lune derrière, runes vertes gravées, bougies qui coulent.
  halloween_p: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 2).stroke({ width: 12, color: 0xffffff }), 0x7cff6a, 12, 0.55));
    g.poly(crescent(C + 58, C - RB - 16, 19, 9, -6, 16)).fill(0xfff3cf).stroke(ink(2.5));
    ring(g, METAL.violet);
    // Runes : traits verts lumineux gravés sur l'anneau, entre les bougies et le chapeau.
    const m = (RH + RB) / 2, GLYPHS = [[[0, -6, 0, 6], [0, -2, 5, -6], [0, 2, -5, -2]], [[0, -6, 0, 6], [0, -1, -5, -6], [0, -1, 5, -6]], [[-4, -6, -4, 6], [-4, -5, 4, 0], [4, 0, -4, 5]]];
    const runes = () => { const k = new Graphics();
      [0.88, 1.1, 1.32, 1.68, 1.9, 2.12].forEach((t, i) => { const a = Math.PI * t, [x, y] = pt(C, C, m, a), c = Math.cos(a + Math.PI / 2), sn = Math.sin(a + Math.PI / 2);
        for (const [x0, y0, x1, y1] of GLYPHS[i % 3]) k.moveTo(x + x0 * c - y0 * sn, y + x0 * sn + y0 * c).lineTo(x + x1 * c - y1 * sn, y + x1 * sn + y1 * c); });
      return k.stroke({ width: 2.4, color: 0xffffff, cap: 'round', join: 'round' }); };
    add(g, glow(runes, 0x7cff6a, 4, 1)); add(g, Object.assign(runes(), { tint: 0xc8ffb0 }));
    for (const sd of [-1, 1]) for (const [dx, h] of [[0, 40], [sd * 15, 28]]) candle(g, C + sd * 78 + dx, C + 100, h);
    witchHat(g, C - 4, C - RB + 10, -0.14); },
  // Néon : plaques de métal sombre séparées par des fentes, tube néon le long de l'anneau, crochets de viseur aux diagonales.
  cyber: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 6).stroke({ width: 16, color: 0xffffff }), 0x19c8e6, 14, 0.85));
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, r = RB + 17, w = 0.36, col = i % 2 ? 0xd42bb8 : 0x19c8e6;
      neon(g, k => k.moveTo(...pt(C, C, r - 11, a - w)).lineTo(...pt(C, C, r, a - w)).arc(C, C, r, a - w, a + w).lineTo(...pt(C, C, r - 11, a + w)), col, 5); }
    const plates = add(g, new Graphics()), m = (RH + RB) / 2, w = RB - RH;
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2; arc(plates, C, C, m, a + 0.09, a + Math.PI / 2 - 0.09).stroke({ width: w, color: 0x18284e }); }
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2;
      arc(plates, C, C, RB - 3, a + 0.09, a + Math.PI / 2 - 0.09).stroke({ width: 4, color: 0x2a3e6a });
      plates.moveTo(...pt(C, C, RH, a + 0.09)).lineTo(...pt(C, C, RB, a + 0.09)).moveTo(...pt(C, C, RH, a - 0.09)).lineTo(...pt(C, C, RB, a - 0.09)); }
    plates.stroke(ink(3)); plates.circle(C, C, RB).stroke(ink(4.5)).circle(C, C, RH).stroke(ink(4.5));
    neon(g, k => arc(k, C, C, m, Math.PI * 0.62, Math.PI * 1.38), 0x19c8e6, 4); neon(g, k => arc(k, C, C, m, -Math.PI * 0.38, Math.PI * 0.38), 0xd42bb8, 4);
    // Diodes dans les fentes, et puce au sommet.
    for (let i = 0; i < 4; i++) { const [x, y] = pt(C, C, m, -Math.PI / 2 + i * Math.PI / 2); g.roundRect(x - 6, y - 6, 12, 12, 3).fill(0x0b1530).stroke(ink(2.5)).circle(x, y, 3).fill(i % 2 ? 0xff7ae0 : 0x7cffff); }
    g.roundRect(C - 20, C - RB - 20, 40, 22, 4).fill(0x0e1a36).stroke(ink(3));
    for (let i = 0; i < 4; i++) g.rect(C - 15 + i * 8, C - RB - 24, 3, 5).fill(0x8ea2c8).stroke(ink(1));
    g.circle(C, C - RB - 9, 5).fill(0x7cffff).stroke(ink(2)); },
  // Holographique : anneau de facettes irisées et éclats de prisme en orbite, reflet arc-en-ciel.
  cyber_p: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 4).stroke({ width: 16, color: 0xffffff }), 0xd42bb8, 14, 0.8));
    add(g, glow(() => new Graphics().circle(C, C, RB + 4).stroke({ width: 10, color: 0xffffff }), 0x19c8e6, 10, 0.6));
    const PAL = [0x7cffff, 0xa0b4ff, 0xe08aff, 0xff9ad8, 0xfff09a, 0x9affc8], N = 18, f = add(g, new Graphics());
    for (let i = 0; i < N; i++) { const a0 = -Math.PI / 2 + i * TAU / N, a1 = a0 + TAU / N, mid = (RH + RB) / 2;
      f.poly([...pt(C, C, RB, a0), ...pt(C, C, RB, a1), ...pt(C, C, mid, a1), ...pt(C, C, mid, a0)]).fill(PAL[i % 6]);
      f.poly([...pt(C, C, mid, a0), ...pt(C, C, mid, a1), ...pt(C, C, RH, a1), ...pt(C, C, RH, a0)]).fill(PAL[(i + 2) % 6]); }
    for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + i * TAU / N; f.moveTo(...pt(C, C, RH, a)).lineTo(...pt(C, C, RB, a)); }
    f.stroke({ width: 1.5, color: 0x3a2050, alpha: 0.7 });
    arc(f, C, C, (RH + RB) / 2 + 3, Math.PI * 1.08, Math.PI * 1.42).stroke({ width: 6, color: 0xffffff, alpha: 0.8, cap: 'round' });
    f.circle(C, C, RB).stroke(ink(4.5)).circle(C, C, RH).stroke(ink(4.5));
    // Éclats de prisme : losanges à deux faces pointés vers l'extérieur.
    for (const [a, len, w, c] of [[-Math.PI / 2, 44, 15, 0xe08aff], [-Math.PI / 2 - 0.7, 30, 11, 0x7cffff], [-Math.PI / 2 + 0.7, 30, 11, 0xfff09a],
      [Math.PI * 0.1, 26, 10, 0xff9ad8], [Math.PI * 0.9, 26, 10, 0x9affc8], [Math.PI / 2, 24, 10, 0xa0b4ff]]) {
      const [bx, by] = pt(C, C, RB - 2, a), [tx, ty] = pt(C, C, RB + len, a), [mx, my] = pt(C, C, RB + len * 0.45, a), n = a + Math.PI / 2,
        l = [mx + Math.cos(n) * w, my + Math.sin(n) * w], r = [mx - Math.cos(n) * w, my - Math.sin(n) * w];
      g.poly([bx, by, ...l, tx, ty]).fill(0xffffff).poly([bx, by, ...r, tx, ty]).fill(c).poly([bx, by, ...l, tx, ty, ...r]).stroke(ink(2.5)); }
    [[C + 84, C - 82, 7], [C - 90, C - 70, 6], [C + 92, C + 74, 6], [C - 70, C + 94, 7]].forEach(([x, y, r]) => sparkle(g, x, y, r)); },
};
// Cadres du magasin de clan. Blason : anneau de fer, écu de gueules et d'azur au sommet, deux épées croisées en bas.
// Héraut : anneau d'or, deux bannières qui pendent de chaque côté et une trompette de héraut au sommet.
FRAMES.clan_blason = g => {
  for (const s of [-1, 1]) { const k = new Graphics();
    k.rect(-4, -70, 8, 96).fill(0xd8dde4).stroke(ink(2.5)); k.rect(-14, 22, 28, 7).fill(0xe3b552).stroke(ink(2.5)); k.rect(-3.5, 29, 7, 18).fill(0x6a3a1a).stroke(ink(2)); k.circle(0, 50, 5).fill(0xe3b552).stroke(ink(2));
    k.position.set(C + s * 30, C + RB + 10); k.rotation = s * 2.4; g.addChild(k); }
  ring(g, METAL.fer); beads(g, 8, (RH + RB) / 2, 0xc8ced6, 3.5, Math.PI / 8);
  const sh = new Graphics(), w = 30;
  sh.moveTo(-w, -34).lineTo(w, -34).lineTo(w, 0).quadraticCurveTo(w, 28, 0, 40).quadraticCurveTo(-w, 28, -w, 0).closePath().fill(0xb0282a).stroke(ink(3.5));
  sh.moveTo(0, -34).lineTo(w, -34).lineTo(w, 0).quadraticCurveTo(w, 28, 0, 40).closePath().fill(0x2a5fa8);
  sh.moveTo(-w, -34).lineTo(w, -34).lineTo(w, 0).quadraticCurveTo(w, 28, 0, 40).quadraticCurveTo(-w, 28, -w, 0).closePath().stroke(ink(3.5));
  sh.moveTo(-w + 5, -29).lineTo(w - 5, -29).stroke({ width: 3, color: 0xf5d27a });
  star(sh, 0, 0, 13, 5, 0.45).fill(0xf5d27a).stroke(ink(2.5));
  sh.position.set(C, C - RB + 2); g.addChild(sh); };
FRAMES.clan_heraut = g => { add(g, glow(() => new Graphics().circle(C, C, RB + 2).stroke({ width: 12, color: 0xffffff }), 0xffd45a, 10, 0.7));
  for (const s of [-1, 1]) { const b = new Graphics(), x = C + s * (RB + 8), top = C - 66;
    b.rect(x - 22, top - 6, 44, 6).fill(0x8a5a2a).stroke(ink(2.5));
    b.moveTo(x - 18, top).lineTo(x + 18, top).lineTo(x + 18, top + 104).lineTo(x, top + 88).lineTo(x - 18, top + 104).closePath().fill(s < 0 ? 0xb0282a : 0x2a5fa8).stroke(ink(3));
    b.moveTo(x - 12, top + 6).lineTo(x - 12, top + 86).stroke({ width: 2.5, color: 0xf5d27a });
    b.moveTo(x + 12, top + 6).lineTo(x + 12, top + 86).stroke({ width: 2.5, color: 0xf5d27a });
    star(b, x, top + 40, 10, 5, 0.45).fill(0xf5d27a).stroke(ink(2)); g.addChild(b); }
  ring(g, METAL.or); beads(g, 12, (RH + RB) / 2, 0xb0282a, 3);
  const t = new Graphics(), y = C - RB - 6;
  t.moveTo(C - 44, y + 4).lineTo(C + 20, y - 2).lineTo(C + 20, y + 6).lineTo(C - 44, y + 10).closePath().fill(0xe3b552).stroke(ink(2.5));
  t.moveTo(C + 18, y + 2).lineTo(C + 46, y - 14).lineTo(C + 46, y + 22).closePath().fill(0xffd45a).stroke(ink(3));
  t.moveTo(C - 30, y + 10).lineTo(C - 22, y + 30).lineTo(C + 4, y + 30).lineTo(C + 8, y + 8).closePath().fill(0xb0282a).stroke(ink(2.5));
  star(t, C - 9, y + 20, 6, 5, 0.45).fill(0xf5d27a);
  g.addChild(t); };
// Cadres des paliers des familles d'arts (rewards.js : art_<famille>_<set>). Éclipse : anneau d'ombre, soleil noir couronné de flammes
// d'or au sommet, croissants et étoiles. Butin : anneau d'or, coffre ouvert qui déborde de lumière au sommet, rang de perles, piles de pièces.
// Les autres familles ont un rendu provisoire à leurs couleurs, en attendant leur dessin.
const ART_FRAME_DRAW = {
  eclipse: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 4).stroke({ width: 14, color: 0xffffff }), 0xb0306a, 12, 0.8));
    ring(g, { base: 0x24182e, hi: 0x6a4a8a, lo: 0x0c0612 }); beads(g, 10, (RH + RB) / 2, 0xb0306a, 3, TAU / 20);
    for (const s of [-1, 1]) { g.poly(crescent(C + s * 92, C + 70, 11, s * 5, -4, 9)).fill(0xffe7a8).stroke(ink(2)); star(g, C + s * 100, C - 50, 6, 4, 0.3).fill(0xffe7a8).stroke(ink(1.5)); }
    const sy = C - RB - 2;
    add(g, glow(() => new Graphics().circle(C, sy, 30).fill(0xffffff), 0xffa42a, 12, 0.95));
    const k = add(g, new Graphics());
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16, l = i % 2 ? 38 : 46;
      k.poly([...pt(C, sy, 22, a - 0.16), ...pt(C, sy, l, a), ...pt(C, sy, 22, a + 0.16)]); }
    k.fill(0xffc94a).stroke(ink(2));
    g.circle(C, sy, 25).fill(0xffe7a8).stroke(ink(2.5)); g.circle(C, sy, 21).fill(0x0c0612).stroke(ink(2)); },
  tresors: g => { add(g, glow(() => new Graphics().circle(C, C, RB + 2).stroke({ width: 12, color: 0xffffff }), 0xffd45a, 10, 0.7));
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const x = C + s * (78 + (i % 2) * 6), y = C + 104 - i * 9;
      g.ellipse(x, y, 17, 6).fill(0xf2c94a).stroke(ink(2.5)); }
    ring(g, METAL.or); beads(g, 20, (RH + RB) / 2, 0xfff6e0, 3, TAU / 40);
    [[Math.PI / 2, 0xe0405a], [Math.PI * 0.15, 0x5ab4ff], [Math.PI * 0.85, 0x5ad27a]].forEach(([a, c]) => { const [x, y] = pt(C, C, (RH + RB) / 2, a); gem(g, x, y, 10, c); });
    const y = C - RB + 4;
    add(g, glow(() => new Graphics().ellipse(C, y - 26, 34, 18).fill(0xffffff), 0xfff0a0, 10, 1));
    const k = add(g, new Graphics());
    k.moveTo(C - 36, y - 22).lineTo(C - 30, y - 50).lineTo(C + 30, y - 50).lineTo(C + 36, y - 22).closePath().fill(0x8a4a1e).stroke(ink(3));
    k.rect(C - 36, y - 22, 72, 30).fill(0x9a5a26).stroke(ink(3));
    k.rect(C - 36, y - 22, 72, 7).fill(0xe3b552).stroke(ink(2.5)); k.rect(C - 26, y - 22, 8, 30).fill(0xe3b552).stroke(ink(2)); k.rect(C + 18, y - 22, 8, 30).fill(0xe3b552).stroke(ink(2));
    k.roundRect(C - 6, y - 14, 12, 12, 2).fill(0xffd45a).stroke(ink(2));
    for (const [dx, dy, c] of [[-16, -28, 0xf2c94a], [0, -32, 0xf2c94a], [14, -27, 0xf2c94a], [-6, -36, 0xe0405a], [8, -38, 0x5ab4ff]]) k.circle(C + dx, y + dy, 6).fill(c).stroke(ink(1.8));
    sparkle(g, C - 44, y - 50, 7); sparkle(g, C + 46, y - 44, 6); },
};
const ART_FRAME_TINTS = { vitraux: [0x2a6ab0, 0xd04a5a, 0xf0c040], saisons: [0x6aa84a, 0xe08a3a, 0x8ac8f0], taverne: [0x8a4a1e, 0xf0a030, 0xe0405a],
  astral: [0x1a2a6a, 0xf5d27a, 0x8ab4ff], bannieres: [0xb0282a, 0x2a5fa8, 0xf5d27a], bal: [0x5a1a4a, 0xc0306a, 0xf5d27a] };
const provisional = t => g => { const [base, mid, hi] = ART_FRAME_TINTS[t] || [0x6a6a7a, 0xb0b0c0, 0xffffff];
  ring(g, { base, hi: mid, lo: INK }); beads(g, 12, (RH + RB) / 2, hi, 3);
  star(g, C, C - RB + 2, 18, 5, 0.45).fill(hi).stroke(ink(3)); };
for (const [id] of ART_THEME_FRAMES) { const t = id.split('_')[1]; FRAMES[id] = ART_FRAME_DRAW[t] || provisional(t); }
// Cadre du magasin du boss mondial : anneau de fer hérissé de crocs, une gemme de braise au sommet.
FRAMES.boss_crocs = g => { add(g, glow(() => new Graphics().circle(C, C, RB + 4).stroke({ width: 12, color: 0xffffff }), 0xff7a2a, 10, 0.7));
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i + 0.5) * TAU / 10, k = new Graphics();
    k.moveTo(-9, 0).quadraticCurveTo(-6, -22, 0, -34).quadraticCurveTo(6, -22, 9, 0).closePath().fill(0xf4ead2).stroke(ink(2.5));
    const [x, y] = pt(C, C, RB - 4, a); k.position.set(x, y); k.rotation = a + Math.PI / 2; g.addChild(k); }
  ring(g, METAL.fer); beads(g, 10, (RH + RB) / 2, 0xd8dde4, 3, -Math.PI / 2);
  gem(g, C, C - RB + 2, 15, 0xff6a1a, 0xffd080); };
export function drawFrame(id) {
  const f = FRAMES[id]; if (!f) return null;
  const c = new Container(), g = layers(); f(g); c.addChild(g.root);
  // Rien d'opaque dans le trou : le portrait du joueur s'y place.
  const hole = add(c, new Graphics().circle(C, C, RH - 1.5).fill(0xffffff)); hole.blendMode = 'erase';
  c.position.set(FRAME_PAD, FRAME_PAD);
  const out = new Container(); out.addChild(c);
  return out;
}
export const BACK_IDS = [...Object.keys(FAMILY_BACKS), ...Object.keys(SCENES)];
export const FRAME_IDS = Object.keys(FRAMES);
export const ICON_IDS = Object.keys(ICONS);
