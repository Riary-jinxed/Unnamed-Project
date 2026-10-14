// Cosmétiques du plateau : tapis de jeu, effets de pose et dos de carte vendus en boutique (rayon Plateau).
// - Tapis : la table dessinée sous le plateau (stage.js, mats.js côté appli). Le joueur seul le voit, sur son propre écran.
//   Sans tapis choisi, la table suit le thème de l'interface (planches de bois, Halloween, Néon 2099).
// - Effet de pose : ce qui jaillit quand une de vos cartes arrive dans sa case (stage-cards.js). L'adversaire le voit aussi,
//   quand vos cartes se révèlent (badge de partie, progress.js).
// Partagé par le serveur (qui vérifie qu'un objet est possédé et le vend) et l'appli (boutique, profil, partie).
// Comme les émotes : « free » est offert à tous, price en Éclats, prisms en Prismes ; sans prix, il se gagne (succès de rewards.js).
// Ne dépend de rien : rewards.js y fait référence par identifiant.

export const MATS = {
  // Boutique, rayon Plateau.
  feutre: { name: 'Feutre de tournoi', price: 600 },
  marbre: { name: 'Marbre du temple', price: 900 },
  sylve: { name: 'Clairière des elfes', price: 900 },
  givre: { name: 'Lac gelé', prisms: 20 },
  astral: { name: 'Voûte céleste', prisms: 30 },
  // Succès (rewards.js, champ mat).
  forge: { name: 'Forge ardente' },
  abysse: { name: 'Abysses' },
};
export const MAT_IDS = Object.keys(MATS);

export const POSES = {
  // Offert à tous : l'effet de pose d'origine.
  poussiere: { name: 'Nuage de poussière', icon: '💨', free: true },
  // Boutique, rayon Plateau.
  etincelles: { name: 'Gerbe d\'étincelles', icon: '✨', price: 400 },
  petales: { name: 'Pluie de pétales', icon: '🌸', price: 500 },
  givre: { name: 'Éclats de givre', icon: '❄️', price: 600 },
  flammes: { name: 'Flammes', icon: '🔥', prisms: 15 },
  foudre: { name: 'Foudre', icon: '⚡', prisms: 20 },
  // Succès (rewards.js, champ pose).
  ombres: { name: 'Ombres rampantes', icon: '🌑' },
  couronne: { name: 'Couronne de lumière', icon: '👑' },
};
export const POSE_IDS = Object.keys(POSES);
export const DEFAULT_POSE = 'poussiere';

// Dos de carte du rayon Plateau (dessinés dans cosmetics-art.js, nommés dans BACKS de rewards.js).
export const SHOP_BACKS = {
  velours: { name: 'Dos de velours', price: 700 },
  grimoire: { name: 'Dos du grimoire', price: 900 },
  vitrail: { name: 'Dos du vitrail', prisms: 25 },
};

const forSale = x => !!(x && (x.price || x.prisms));
// Tout ce que vend le rayon Plateau : [sorte, identifiant, objet].
export const BOARD_SHOP = [
  ...MAT_IDS.filter(id => forSale(MATS[id])).map(id => ['mat', id, MATS[id]]),
  ...POSE_IDS.filter(id => forSale(POSES[id])).map(id => ['pose', id, POSES[id]]),
  ...Object.entries(SHOP_BACKS).map(([id, x]) => ['back', id, x]),
];
export const boardItem = (kind, id) => BOARD_SHOP.find(([k, i]) => k === kind && i === id)?.[2] || null;

// owned : effets gagnés ou achetés du compte (cosmetics.poses) ; l'effet offert est toujours possédé.
export const ownsPose = (owned, id) => !!POSES[id] && (POSES[id].free || (owned || []).includes(id));
export const ownsMat = (owned, id) => !!MATS[id] && (owned || []).includes(id);
// Choix du compte encore valable (un objet retiré du jeu revient au défaut).
export const matOf = (owned, id) => (ownsMat(owned, id) ? id : null);
export const poseOf = (owned, id) => (ownsPose(owned, id) ? id : DEFAULT_POSE);
