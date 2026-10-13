// Saison en cours (thème du passe du mois, par exemple « halloween »), écrite par main.js dans <body data-season>.
// Les décors PixiJS (lobby-stage.js, stage-menu.js) la lisent à chaque image : changer de saison ne demande pas de recharger.
export const season = () => document.body.dataset.season || '';

// Couleurs des décors : thème de base (braises dorées), Halloween (citrouille, violet, feux follets verts)
// et Néon 2099 (étincelles cyan, magenta et jaune signalétique, foyer cyan).
export const PALETTE = {
  // embers : braises de la table et des menus (stage.js) ; sparks : braises de la vitrine (lobby-stage.js), plus foncées pour un décor clair.
  '': { embers: [0xffa040, 0xffa040, 0xffe0a0], sparks: [0xff6a1a, 0xff6a1a, 0xffb040], hearth: 0xff7a2a, spark: [0xffd070, 0xfff2c0], fog: [0xa0b0c0, 0xd8b890] },
  halloween: { embers: [0xff8a2a, 0xb070ff, 0x7dffb0], sparks: [0xff6a10, 0x8a3cff, 0x40d080], hearth: 0x8a3cff, spark: [0xff8a2a, 0xc890ff], fog: [0x6a4a9a, 0x3a7a5a] },
  cyber: { embers: [0x19e6ff, 0xff2bd6, 0xfcee0a], sparks: [0x0aa0c0, 0xd42bb8, 0xc8b800], hearth: 0x19e6ff, spark: [0xfcee0a, 0x60f0ff], fog: [0x1a3a7a, 0x6a1a6a] },
};
export const palette = () => PALETTE[season()] || PALETTE[''];

// Table de partie (stage.js) : sol, planches (deux teintes et joint), lampe au-dessus du plateau et seconde lueur en bas,
// grille néon (cyber), police et couleurs des annonces et du titre de fin.
const TABLE = {
  '': { ground: 0x140e0a, planks: [0x1c140e, 0x19110c], seam: 0x0a0604, lamp: 0xffc070, low: null, grid: null,
    font: 'Cinzel, Alegreya SC, serif', text: 0xffe8b0, stroke: 0x2a1606, band: 0x0c0806, edge: null },
  halloween: { ground: 0x120a16, planks: [0x1c1222, 0x170e1c], seam: 0x08040a, lamp: 0xff8a2a, low: 0x8a3cff, grid: null,
    font: 'Cinzel, Alegreya SC, serif', text: 0xffd8a0, stroke: 0x2a0e30, band: 0x10081a, edge: 0xff8a2a },
  cyber: { ground: 0x05070f, planks: null, seam: null, lamp: 0x19e6ff, low: 0xff2bd6, grid: 0x19e6ff,
    font: 'Orbitron, Rajdhani, sans-serif', text: 0xfcee0a, stroke: 0x05070f, band: 0x060a16, edge: 0x19e6ff },
};
export const tableLook = () => TABLE[season()] || TABLE[''];

// Boutique (shop-stage.js) : velours de la vitrine (haut, bas), bandes de l'auvent, lueur de l'étal, flamme des lanternes, lueur de la vitrine.
const SHOP = {
  '': { velvet: ['#6a1a2a', '#1e060c'], awning: [0x8e1f1f, 0xe9d6a8], warm: 0xffb050, flame: 0xfff0c0, glow: 0xffd8a0 },
  halloween: { velvet: ['#4a1c70', '#14061f'], awning: [0x4b1f6b, 0xd8701e], warm: 0xb070ff, flame: 0xd8b0ff, glow: 0xc8a0ff },
  cyber: { velvet: ['#0e1c40', '#03050b'], awning: [0x05070f, 0xfcee0a], warm: 0x19e6ff, flame: 0xb0f8ff, glow: 0xff2bd6 },
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

// Néon 2099 : voiture volante vue de profil (carrosserie sombre, vitre et néon cyan dessous, feu arrière rouge), tournée vers la droite.
// Dessinée en couleurs (pas de teinte), dans un canevas 2D ; chaque appel en dessine un nouveau.
export function spinnerCanvas() {
  const c = document.createElement('canvas'); c.width = 160; c.height = 56; const g = c.getContext('2d');
  // halo du néon sous la caisse
  const glow = g.createRadialGradient(80, 40, 2, 80, 40, 60); glow.addColorStop(0, 'rgb(25 230 255 / .55)'); glow.addColorStop(1, 'rgb(25 230 255 / 0)');
  g.fillStyle = glow; g.fillRect(0, 20, 160, 36);
  // caisse
  g.fillStyle = '#0a0f1c'; g.beginPath(); g.moveTo(14, 34); g.lineTo(40, 22); g.lineTo(70, 14); g.lineTo(108, 14); g.lineTo(130, 24); g.lineTo(150, 30);
  g.lineTo(148, 38); g.lineTo(18, 40); g.closePath(); g.fill();
  // vitre
  g.fillStyle = '#163a5a'; g.beginPath(); g.moveTo(72, 17); g.lineTo(106, 17); g.lineTo(122, 25); g.lineTo(62, 25); g.closePath(); g.fill();
  // néon sous la caisse et filet magenta
  g.fillStyle = '#19e6ff'; g.fillRect(26, 39, 112, 2);
  g.fillStyle = '#ff2bd6'; g.fillRect(44, 29, 80, 1.5);
  // phare (avant, à droite) et feu arrière (à gauche)
  g.fillStyle = '#fff6b0'; g.fillRect(144, 30, 6, 3);
  g.fillStyle = '#ff003c'; g.fillRect(12, 32, 6, 4);
  return c;
}
