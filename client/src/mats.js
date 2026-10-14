// Tapis de jeu (board.js du moteur) : ce que chacun change à la table de partie dessinée par stage.js.
// table : champs de la table du thème remplacés (sol, planches, lampe, seconde lueur…), draw(g, w, h) : motif du tapis dessiné
// par-dessus le sol, dans un Graphics de PixiJS ; palette : braises et brume de la table.
// Pas d'import de PixiJS ici : season.js lit ce fichier dans les menus aussi, avant que PixiJS soit chargé.
// Les tapis restent sombres : cartes, zones et textes du plateau sont faits pour un fond foncé.
const seeded = s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const SURFACE = { planks: null, seam: null, grid: null, moon: false };

export const MAT_LOOKS = {
  // Feutre vert de table de jeu, cadre doré à deux filets et coins en losange.
  feutre: { table: { ...SURFACE, ground: 0x0e2a1c, lamp: 0xfff0c0, low: null },
    palette: { embers: [0xffe0a0, 0xffd070, 0xffffff], fog: [0x80a090, 0xd8c890] },
    draw(g, w, h) {
      const rnd = seeded(5);
      for (let i = 0; i < 900; i++) g.rect(rnd() * w, rnd() * h, 1, 1).fill({ color: rnd() < 0.5 ? 0x1a4030 : 0x08180f, alpha: 0.7 });
      const m = Math.min(w, h) * 0.03;
      g.rect(m, m, w - 2 * m, h - 2 * m).stroke({ width: 2, color: 0xe3b552, alpha: 0.45 });
      g.rect(m + 6, m + 6, w - 2 * m - 12, h - 2 * m - 12).stroke({ width: 1, color: 0xe3b552, alpha: 0.3 });
      for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) g.poly([x, y - 9, x + 9, y, x, y + 9, x - 9, y]).fill({ color: 0xe3b552, alpha: 0.6 });
    } },
  // Marbre noir veiné d'or et de blanc.
  marbre: { table: { ...SURFACE, ground: 0x141418, lamp: 0xf0e8ff, low: 0xe3b552 },
    palette: { embers: [0xfff3cf, 0xe3b552, 0xffffff], fog: [0xb0b0c8, 0xd8c8a0] },
    draw(g, w, h) {
      const rnd = seeded(9);
      for (let i = 0; i < 14; i++) {
        let x = rnd() * w, y = rnd() < 0.5 ? -10 : rnd() * h, a = rnd() * Math.PI;
        const gold = i % 4 === 0; g.moveTo(x, y);
        for (let s = 0; s < 40; s++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 18; y += Math.abs(Math.sin(a)) * 18 + 4; g.lineTo(x, y); }
        g.stroke({ width: gold ? 1.6 : 1 + rnd(), color: gold ? 0xe3b552 : 0xe8e8f0, alpha: gold ? 0.35 : 0.08 + rnd() * 0.08 });
      }
    } },
  // Clairière : mousse sombre, feuilles éparses, lucioles vertes et rayon de soleil pâle.
  sylve: { table: { ...SURFACE, ground: 0x0c1a10, lamp: 0xe0ffb0, low: 0x2a8a5a },
    palette: { embers: [0xb0ff90, 0x7dffb0, 0xfff0a0], fog: [0x4a7a5a, 0x9ab070] },
    draw(g, w, h) {
      const rnd = seeded(13);
      for (let i = 0; i < 40; i++) g.circle(rnd() * w, rnd() * h, 30 + rnd() * 70).fill({ color: rnd() < 0.5 ? 0x13281a : 0x0a160d, alpha: 0.5 });
      for (let i = 0; i < 60; i++) {
        const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI * 2, l = 8 + rnd() * 10, c = Math.cos(a), s = Math.sin(a);
        g.poly([x - c * l, y - s * l, x - s * l * 0.4, y + c * l * 0.4, x + c * l, y + s * l, x + s * l * 0.4, y - c * l * 0.4]).fill({ color: rnd() < 0.5 ? 0x2a5a2a : 0x4a6a1a, alpha: 0.35 });
      }
    } },
  // Lac gelé : glace bleu nuit, fissures blanches en étoile, givre sur les bords.
  givre: { table: { ...SURFACE, ground: 0x0a1826, lamp: 0xb0e8ff, low: 0x4aa0ff },
    palette: { embers: [0xffffff, 0xb0e8ff, 0x80c8ff], fog: [0xa0d0ff, 0xe0f0ff] },
    draw(g, w, h) {
      const rnd = seeded(21);
      for (let k = 0; k < 6; k++) {
        const cx = rnd() * w, cy = rnd() * h;
        for (let b = 0; b < 5 + rnd() * 4; b++) {
          let x = cx, y = cy, a = rnd() * Math.PI * 2; g.moveTo(x, y);
          for (let s = 0; s < 6 + rnd() * 8; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * (14 + rnd() * 20); y += Math.sin(a) * (14 + rnd() * 20); g.lineTo(x, y); }
          g.stroke({ width: 1, color: 0xe0f4ff, alpha: 0.18 });
        }
      }
      for (let i = 0; i < 26; i++) { const y = (i / 26) * h; for (const x of [0, w]) g.circle(x, y + rnd() * 20, 30 + rnd() * 40).fill({ color: 0xc8ecff, alpha: 0.035 }); }
    } },
  // Voûte céleste : nuit violette, nébuleuses, étoiles et deux constellations.
  astral: { table: { ...SURFACE, ground: 0x07081a, lamp: 0xc0b0ff, low: 0x6a3cff },
    palette: { embers: [0xffffff, 0xc8b0ff, 0x80c0ff], fog: [0x5a3a9a, 0x2a4a9a] },
    draw(g, w, h) {
      const rnd = seeded(33);
      for (let i = 0; i < 9; i++) g.circle(rnd() * w, rnd() * h, 80 + rnd() * 140).fill({ color: [0x3a1a6a, 0x1a2a6a, 0x5a1a5a][i % 3], alpha: 0.12 });
      for (let i = 0; i < 260; i++) g.circle(rnd() * w, rnd() * h, rnd() < 0.9 ? 0.7 : 1.6).fill({ color: rnd() < 0.8 ? 0xffffff : 0xffe0a0, alpha: 0.3 + rnd() * 0.6 });
      for (let c = 0; c < 2; c++) {
        const pts = []; let x = w * (0.15 + c * 0.6), y = h * (0.15 + rnd() * 0.6);
        for (let i = 0; i < 5; i++) { pts.push([x, y]); x += (rnd() - 0.3) * 70; y += (rnd() - 0.5) * 60; }
        g.moveTo(...pts[0]); pts.slice(1).forEach(p => g.lineTo(...p)); g.stroke({ width: 1, color: 0xc8b0ff, alpha: 0.25 });
        for (const p of pts) g.circle(...p, 2.4).fill({ color: 0xffffff, alpha: 0.9 });
      }
    } },
  // Forge ardente (succès) : dalles de pierre aux joints rougeoyants, lueur de braise en bas.
  forge: { table: { ...SURFACE, ground: 0x1a1210, lamp: 0xffa050, low: 0xff3a10 },
    palette: { embers: [0xff6a1a, 0xffa040, 0xffe0a0], fog: [0x6a4a3a, 0x8a5a3a] },
    draw(g, w, h) {
      const rnd = seeded(41), T = 64;
      for (let y = 0, r = 0; y < h; y += T, r++) for (let x = r % 2 ? -T / 2 : 0; x < w; x += T) {
        g.rect(x + 2, y + 2, T - 4, T - 4).fill({ color: rnd() < 0.5 ? 0x231814 : 0x1d1410 });
        const hot = Math.max(0, y / h - 0.4) * 1.4;
        g.rect(x, y, T, T).stroke({ width: 2, color: 0xff5a1a, alpha: 0.05 + hot * 0.3 });
      }
    } },
  // Abysses (succès) : fond marin turquoise, reflets ondulants, bulles.
  abysse: { table: { ...SURFACE, ground: 0x03121a, lamp: 0x60e0d0, low: 0x1a5aa0 },
    palette: { embers: [0xa0fff0, 0x60e0d0, 0xffffff], fog: [0x1a6a7a, 0x2a4a8a] },
    draw(g, w, h) {
      const rnd = seeded(55);
      for (let i = 0; i < 18; i++) {
        const y0 = rnd() * h, amp = 6 + rnd() * 10, f = 0.01 + rnd() * 0.02, ph = rnd() * 6;
        g.moveTo(0, y0); for (let x = 0; x <= w; x += 12) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp);
        g.stroke({ width: 1.5, color: 0x60e0d0, alpha: 0.06 + rnd() * 0.05 });
      }
      for (let i = 0; i < 50; i++) g.circle(rnd() * w, rnd() * h, 1.5 + rnd() * 4).stroke({ width: 1, color: 0xa0fff0, alpha: 0.18 });
    } },
};
