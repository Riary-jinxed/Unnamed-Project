// Saison en cours (thème du passe du mois, par exemple « halloween »), écrite par main.js dans <body data-season>.
// Les décors PixiJS (lobby-stage.js, stage-menu.js) la lisent à chaque image : changer de saison ne demande pas de recharger.
export const season = () => document.body.dataset.season || '';

// Couleurs des décors : thème de base (braises dorées) et Halloween (citrouille, violet, feux follets verts).
export const PALETTE = {
  // embers : braises de la table et des menus (stage.js) ; sparks : braises de la vitrine (lobby-stage.js), plus foncées pour un décor clair.
  '': { embers: [0xffa040, 0xffa040, 0xffe0a0], sparks: [0xff6a1a, 0xff6a1a, 0xffb040], hearth: 0xff7a2a, spark: [0xffd070, 0xfff2c0], fog: [0xa0b0c0, 0xd8b890] },
  halloween: { embers: [0xff8a2a, 0xb070ff, 0x7dffb0], sparks: [0xff6a10, 0x8a3cff, 0x40d080], hearth: 0x8a3cff, spark: [0xff8a2a, 0xc890ff], fog: [0x6a4a9a, 0x3a7a5a] },
};
export const palette = () => PALETTE[season()] || PALETTE[''];

// Chauve-souris : deux silhouettes (ailes hautes, ailes basses) dessinées dans des canevas 2D, en blanc pour être teintées.
// Chaque appel dessine de nouveaux canevas : chaque toile PixiJS en fait ses propres textures.
export function batCanvases() {
  return [1, -0.35].map(up => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 48; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.translate(48, 26);
    for (const s of [1, -1]) {
      g.beginPath(); g.moveTo(0, -2);
      g.quadraticCurveTo(s * 18, -18 * up, s * 44, -14 * up);
      // bord de l'aile festonné
      g.quadraticCurveTo(s * 38, -4 * up + 4, s * 32, 2 + 2 * up);
      g.quadraticCurveTo(s * 26, -2 * up + 2, s * 20, 6);
      g.quadraticCurveTo(s * 14, 0, s * 8, 7);
      g.lineTo(0, 4); g.closePath(); g.fill();
    }
    g.beginPath(); g.ellipse(0, 2, 5, 8, 0, 0, Math.PI * 2); g.fill();
    // oreilles
    g.beginPath(); g.moveTo(-4, -4); g.lineTo(-3, -11); g.lineTo(0, -5); g.lineTo(3, -11); g.lineTo(4, -4); g.fill();
    return c;
  });
}
