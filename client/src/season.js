// Saison en cours (thème du passe du mois, par exemple « halloween »), écrite par main.js dans <body data-season>.
// Les décors PixiJS (lobby-stage.js, stage-menu.js) la lisent à chaque image : changer de saison ne demande pas de recharger.
export const season = () => document.body.dataset.season || '';

// Couleurs des décors : thème de base (braises dorées), Halloween (citrouille, violet, feux follets verts)
// et Néon 2099 (étincelles cyan et magenta, foyer cyan).
export const PALETTE = {
  // embers : braises de la table et des menus (stage.js) ; sparks : braises de la vitrine (lobby-stage.js), plus foncées pour un décor clair.
  '': { embers: [0xffa040, 0xffa040, 0xffe0a0], sparks: [0xff6a1a, 0xff6a1a, 0xffb040], hearth: 0xff7a2a, spark: [0xffd070, 0xfff2c0], fog: [0xa0b0c0, 0xd8b890] },
  halloween: { embers: [0xff8a2a, 0xb070ff, 0x7dffb0], sparks: [0xff6a10, 0x8a3cff, 0x40d080], hearth: 0x8a3cff, spark: [0xff8a2a, 0xc890ff], fog: [0x6a4a9a, 0x3a7a5a] },
  cyber: { embers: [0x19c8e6, 0xff4ad8, 0xb0fff0], sparks: [0x0aa0c0, 0xd42bb8, 0x40c8a0], hearth: 0x19c8e6, spark: [0x60f0ff, 0xff8ae8], fog: [0x2a4a8a, 0x6a2a7a] },
};
export const palette = () => PALETTE[season()] || PALETTE[''];

// Boutique (shop-stage.js) : velours de la vitrine (haut, bas), bandes de l'auvent, lueur de l'étal, flamme des lanternes, lueur de la vitrine.
const SHOP = {
  '': { velvet: ['#6a1a2a', '#1e060c'], awning: [0x8e1f1f, 0xe9d6a8], warm: 0xffb050, flame: 0xfff0c0, glow: 0xffd8a0 },
  halloween: { velvet: ['#4a1c70', '#14061f'], awning: [0x4b1f6b, 0xd8701e], warm: 0xb070ff, flame: 0xd8b0ff, glow: 0xc8a0ff },
  cyber: { velvet: ['#14285a', '#050a1c'], awning: [0x0b1530, 0x19c8e6], warm: 0x19c8e6, flame: 0xb0f8ff, glow: 0xff8ae8 },
};
export const shopColors = () => SHOP[season()] || SHOP[''];

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
