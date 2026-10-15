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
  // Thèmes à l'effigie d'un général (themes.js du moteur, themes.css) : braises de l'éclipse, lucioles des bois, poussière d'aube.
  eclipse: { embers: [0xff5a1a, 0xff9a3a, 0xc81e1e], sparks: [0xd83a10, 0xff7a2a, 0x8a1010], hearth: 0xff4a1a, spark: [0xffb050, 0xffe0b0], fog: [0x5a1a1a, 0x3a1020] },
  sylve: { embers: [0xc8ff80, 0x7dffb0, 0xfff0a0], sparks: [0x6ac040, 0x30a070, 0xc8c040], hearth: 0x8ae060, spark: [0xe0ffa0, 0xffffd0], fog: [0x3a6a4a, 0x7a9a5a] },
  aube: { embers: [0xffd890, 0xffb0c8, 0xffffff], sparks: [0xffa040, 0xff7aa0, 0xffd060], hearth: 0xffb860, spark: [0xfff0c0, 0xffd0e0], fog: [0xc898b8, 0xffd8a0] },
  // poussière d'étoiles dorée et bleue sous la voûte d'Elyndra ; vermillon et encre sur le papier de l'estampe.
  astral: { embers: [0xfff2b0, 0xa8c8ff, 0xffffff], sparks: [0xe8b830, 0x5a78e0, 0xc8a0ff], hearth: 0x6a8aff, spark: [0xffe8a0, 0xd8e4ff], fog: [0x3a2a8a, 0x1a4a9a] },
  // or des jetons et rouge de la roulette au-dessus du tapis vert.
  casino: { embers: [0xffd860, 0xff3a4a, 0xfff2c0], sparks: [0xe0a020, 0xc8101e, 0xf2c14e], hearth: 0xf2c14e, spark: [0xffd860, 0xfff6d0], fog: [0x1a6a40, 0x6a5a20] },
  estampe: { embers: [0xd8301c, 0xf0a0a8, 0x3a8a9a], sparks: [0xc8281a, 0xe88a98, 0x2a6a7a], hearth: 0xd8301c, spark: [0xd8301c, 0xf0b0b8], fog: [0x6aa0aa, 0xd8c8a8] },
};
export const palette = () => PALETTE[season()] || PALETTE[''];

// Table de partie (stage.js) : sol, planches (deux teintes et joint), lampe au-dessus du plateau et seconde lueur en bas,
// grille néon (cyber), pleine lune (Halloween), police et couleurs des annonces et du titre de fin.
const TABLE = {
  '': { ground: 0x140e0a, planks: [0x1c140e, 0x19110c], seam: 0x0a0604, lamp: 0xffc070, low: null, grid: null,
    font: 'Cinzel, Alegreya SC, serif', text: 0xffe8b0, stroke: 0x2a1606, band: 0x0c0806, edge: null },
  halloween: { ground: 0x120a16, planks: [0x1c1222, 0x170e1c], seam: 0x08040a, lamp: 0xff8a2a, low: 0x8a3cff, grid: null,
    font: 'Creepster, Cinzel, serif', text: 0xff9a3a, stroke: 0x1a0612, band: 0x10081a, edge: 0x8a3cff, moon: true },
  cyber: { ground: 0x05070f, planks: null, seam: null, lamp: 0x19e6ff, low: 0xff2bd6, grid: 0x19e6ff,
    font: 'Orbitron, Rajdhani, sans-serif', text: 0xfcee0a, stroke: 0x05070f, band: 0x060a16, edge: 0x19e6ff },
  eclipse: { ground: 0x0e0606, planks: [0x170a09, 0x130807], seam: 0x050202, lamp: 0xff6a2a, low: 0xb01a10, grid: null,
    font: 'MedievalSharp, Cinzel, serif', text: 0xffb070, stroke: 0x1a0402, band: 0x0c0404, edge: 0xff4a1a, sun: true },
  sylve: { ground: 0x08120c, planks: [0x0f1d13, 0x0c1810], seam: 0x040904, lamp: 0xe0ffb0, low: 0x2a8a5a, grid: null,
    font: 'Uncial Antiqua, Cinzel, serif', text: 0xe8ffc0, stroke: 0x061006, band: 0x06100a, edge: 0x9ad860, forest: true },
  aube: { ground: 0x140e1a, planks: [0x1e1624, 0x1a1220], seam: 0x0a060c, lamp: 0xffd8a0, low: 0xff7aa0, grid: null,
    font: 'Cinzel Decorative, Cinzel, serif', text: 0xfff0d0, stroke: 0x2a1020, band: 0x140a16, edge: 0xffc860, dawn: true },
  astral: { ground: 0x060818, planks: null, seam: null, lamp: 0x6a7aff, low: 0x9a4ad8, grid: null,
    font: 'Marcellus SC, Cinzel, serif', text: 0xffe8a0, stroke: 0x0a0a2a, band: 0x080a20, edge: 0xffd870, stars: true },
  estampe: { ground: 0xefe2c4, planks: null, seam: null, lamp: 0xffe0b0, low: null, grid: null,
    font: 'Shojumaru, Cinzel, serif', text: 0xc8281a, stroke: 0x1a1410, band: 0x1a1410, edge: 0xc8281a, waves: true },
  casino: { ground: 0x0a3a24, planks: null, seam: null, lamp: 0xfff0c0, low: null, grid: null,
    font: 'Limelight, Cinzel, serif', text: 0xffd860, stroke: 0x2a0606, band: 0x041a10, edge: 0xf2c14e, felt: true },
};
export const tableLook = () => TABLE[season()] || TABLE[''];

// Boutique (shop-stage.js) : velours de la vitrine (haut, bas), bandes de l'auvent, lueur de l'étal, flamme des lanternes, lueur de la vitrine.
const SHOP = {
  '': { velvet: ['#6a1a2a', '#1e060c'], awning: [0x8e1f1f, 0xe9d6a8], warm: 0xffb050, flame: 0xfff0c0, glow: 0xffd8a0 },
  halloween: { velvet: ['#4a1c70', '#14061f'], awning: [0x4b1f6b, 0xd8701e], warm: 0xb070ff, flame: 0xd8b0ff, glow: 0xc8a0ff },
  cyber: { velvet: ['#0e1c40', '#03050b'], awning: [0x05070f, 0xfcee0a], warm: 0x19e6ff, flame: 0xb0f8ff, glow: 0xff2bd6 },
  eclipse: { velvet: ['#5a0e0e', '#140303'], awning: [0x1a0606, 0xd8401a], warm: 0xff6a2a, flame: 0xffc080, glow: 0xff8a50 },
  sylve: { velvet: ['#1a4a2a', '#06140a'], awning: [0x2a5a2a, 0xd8d090], warm: 0xc8f080, flame: 0xf0ffd0, glow: 0xd0f0a0 },
  aube: { velvet: ['#6a2a5a', '#1e0a1c'], awning: [0xd890a8, 0xfff0d8], warm: 0xffc070, flame: 0xfff4d8, glow: 0xffd8b0 },
  astral: { velvet: ['#1a1a5a', '#05061a'], awning: [0x10124a, 0xe8c050], warm: 0x8aa0ff, flame: 0xfff4c0, glow: 0xb8a0ff },
  casino: { velvet: ['#0e5a34', '#03140b'], awning: [0xb8101e, 0x111111], warm: 0xffd860, flame: 0xfff6d0, glow: 0xf2c14e },
  estampe: { velvet: ['#a8201a', '#3a0a08'], awning: [0x1a1410, 0xc8281a], warm: 0xffc890, flame: 0xfff0d0, glow: 0xffd8b0 },
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

// Estampe : pétale de cerisier, en blanc pour être teinté (rose pâle), avec l'encoche du bout.
export function petalCanvas() {
  const c = document.createElement('canvas'); c.width = 24; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(12, 31); g.bezierCurveTo(-2, 22, 0, 6, 8, 2); g.lineTo(12, 6); g.lineTo(16, 2);
  g.bezierCurveTo(24, 6, 26, 22, 12, 31); g.fill();
  return c;
}
// Bois de Sylvaën : feuille en amande avec sa nervure (creusée), en blanc pour être teintée.
export function leafCanvas() {
  const c = document.createElement('canvas'); c.width = 22; c.height = 40; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(11, 1); g.bezierCurveTo(24, 12, 22, 30, 11, 38); g.bezierCurveTo(0, 30, -2, 12, 11, 1); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(11, 6); g.lineTo(11, 36); for (let y = 12; y < 32; y += 6) { g.moveTo(11, y); g.lineTo(5, y - 4); g.moveTo(11, y); g.lineTo(17, y - 4); } g.stroke();
  return c;
}
// Aube de Séraphine : plume, tige fine et barbes en éventail, en blanc pour être teintée.
export function featherCanvas() {
  const c = document.createElement('canvas'); c.width = 28; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgb(255 255 255 / .92)'; g.beginPath(); g.moveTo(14, 2); g.bezierCurveTo(28, 14, 26, 40, 15, 56); g.lineTo(13, 56); g.bezierCurveTo(2, 40, 0, 14, 14, 2); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1;
  for (let y = 14; y < 52; y += 7) { g.beginPath(); g.moveTo(26, y - 6); g.lineTo(20, y); g.moveTo(2, y - 4); g.lineTo(8, y + 1); g.stroke(); }
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(14, 4); g.lineTo(14, 63); g.stroke();
  return c;
}
// Roue de Fortuna : jetons de casino vus de face (disque, encoches blanches sur la tranche, anneau et cœur), un canevas par couleur.
export function chipCanvases() {
  return [['#c8101e', '#fff'], ['#151515', '#f2c14e'], ['#1a4ab8', '#fff'], ['#f2c14e', '#7a1010']].map(([body, mark]) => {
    const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d');
    g.fillStyle = body; g.beginPath(); g.arc(20, 20, 19, 0, Math.PI * 2); g.fill();
    g.fillStyle = mark; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.arc(20, 20, 19, a - 0.18, a + 0.18); g.arc(20, 20, 14, a + 0.18, a - 0.18, true); g.fill(); }
    g.strokeStyle = mark; g.lineWidth = 1.2; g.setLineDash([2, 2]); g.beginPath(); g.arc(20, 20, 11, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.fillStyle = body; g.beginPath(); g.arc(20, 20, 9.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgb(0 0 0 / .35)'; g.lineWidth = 1; g.beginPath(); g.arc(20, 20, 18.5, 0, Math.PI * 2); g.stroke();
    return c;
  });
}
// Roue de Fortuna : cartes à jouer vues de face (le Sept des trois couleurs du set, et l'As de pique), un canevas par carte.
export function playingCardCanvases() {
  return [['7', '♠', '#111'], ['7', '♣', '#111'], ['7', '♦', '#c8101e'], ['A', '♠', '#111'], ['7', '♥', '#c8101e']].map(([v, s, col]) => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 56; const g = c.getContext('2d');
    g.fillStyle = '#fbf6e8'; g.strokeStyle = '#8a6a20'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(1, 1, 38, 54, 4); g.fill(); g.stroke();
    g.fillStyle = col; g.font = 'bold 11px serif'; g.textAlign = 'center'; g.fillText(v, 7, 12); g.fillText(s, 7, 22);
    g.font = '24px serif'; g.fillText(s, 21, 38);
    g.save(); g.translate(33, 44); g.rotate(Math.PI); g.font = 'bold 11px serif'; g.fillText(v, 0, 0); g.restore();
    return c;
  });
}
// Astral : étoile filante, une traîne qui s'éteint vers la gauche et une tête vive à droite.
export function streakCanvas() {
  const c = document.createElement('canvas'); c.width = 160; c.height = 12; const g = c.getContext('2d');
  const tail = g.createLinearGradient(0, 0, 150, 0); tail.addColorStop(0, 'rgb(255 255 255 / 0)'); tail.addColorStop(1, 'rgb(255 255 255 / .9)');
  g.fillStyle = tail; g.beginPath(); g.moveTo(0, 6); g.lineTo(150, 3.5); g.lineTo(150, 8.5); g.closePath(); g.fill();
  const head = g.createRadialGradient(150, 6, 0, 150, 6, 6); head.addColorStop(0, '#fff'); head.addColorStop(1, 'rgb(255 255 255 / 0)');
  g.fillStyle = head; g.fillRect(140, 0, 20, 12);
  return c;
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
