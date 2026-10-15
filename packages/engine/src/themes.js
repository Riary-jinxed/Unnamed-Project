// Thèmes de l'interface : ceux des saisons (pass.js, débloqués au palier THEME_TIER du passe) et des thèmes à l'effigie d'un
// général, vendus en boutique (rayon Thèmes) ou gagnés avec un succès (champ theme des succès, rewards.js).
// Un thème change l'habillage de toute l'appli (themes.css côté appli, couleurs des décors dans season.js) ; card et art :
// illustration du général montrée en fond des menus (art alternatif s'il est donné).
// Comme les émotes : price en Éclats, prisms en Prismes ; sans prix, il se gagne. Un thème obtenu n'est jamais retiré.
import { SEASON_THEMES } from './pass.js';

export const EXTRA_THEMES = {
  eclipse: { name: 'Éclipse d\'Ignaroth', card: 'ignaroth', art: 'ignaroth_eclipse', prisms: 40 },
  sylve: { name: 'Bois de Sylvaën', card: 'sylvaen', price: 2500 },
  // Succès (rewards.js) : finir les trois campagnes d'histoire.
  aube: { name: 'Aube de Séraphine', card: 'seraphine' },
};
// Tous les thèmes : { identifiant: nom }.
export const THEMES = { ...SEASON_THEMES, ...Object.fromEntries(Object.entries(EXTRA_THEMES).map(([id, x]) => [id, x.name])) };
export const SHOP_THEMES = Object.keys(EXTRA_THEMES).filter(id => EXTRA_THEMES[id].price || EXTRA_THEMES[id].prisms);
