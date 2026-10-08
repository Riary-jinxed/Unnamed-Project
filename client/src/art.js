// Illustrations des cartes : un fichier client/public/art/<id>.webp par carte (432×640, WebP).
// Pour ajouter une illustration, déposez le fichier et ajoutez l'identifiant de la carte ici.
export const ART = new Set(['dragonnet', 'gardien_magot', 'oeuf', 'drake', 'souffle', 'wyverne', 'cavernes', 'rouge', 'ancien', 'dragon_or']);
export const hasArt = id => ART.has(id);
export const artVar = id => ART.has(id) ? `;--art: url(/art/${id}.webp)` : '';
