// Thèmes de l'interface : ceux des saisons (pass.js, débloqués au palier THEME_TIER du passe) et des thèmes à l'effigie d'un
// général, vendus en boutique (rayon Thèmes) ou gagnés avec un succès (champ theme des succès, rewards.js).
// Un thème change l'habillage de toute l'appli (themes.css côté appli, couleurs des décors dans season.js) ; card et art :
// illustration du général montrée en fond des menus (art alternatif s'il est donné).
// Comme les émotes : price en Éclats, prisms en Prismes (rayon Thèmes) ; essence en essence universelle (rayon Essence) ; boss : au
// magasin du boss mondial, en Insignes (BOSS_SHOP de boss.js) ; event : à la boutique d'un événement (casino : en Jetons, casino.js) ;
// sans rien de tout ça, il se gagne. Un thème obtenu n'est jamais retiré.
// reveal (AAAA-MM-JJ, heure de Paris) : thème lié à un set, caché de la boutique et de la personnalisation avant la sortie du set.
import { SEASON_THEMES } from './pass.js';
import { today } from './collection.js';

export const EXTRA_THEMES = {
  eclipse: { name: 'Éclipse d\'Ignaroth', card: 'ignaroth', art: 'ignaroth_eclipse', boss: true },
  sylve: { name: 'Bois de Sylvaën', card: 'sylvaen', price: 2500 },
  astral: { name: 'Ciel d\'Elyndra', card: 'elyndra', art: 'elyndra_astral', essence: 800 },
  estampe: { name: 'Estampe d\'Ysmera', card: 'ysmera', art: 'ysmera_estampe', price: 3000 },
  // Mini-set casino de mi-octobre : sort avec lui, seulement à la boutique de son événement (event), en monnaie de l'événement.
  casino: { name: 'Roue de Fortuna', card: 'fortuna', event: 'casino', reveal: '2026-10-23' },
  // Succès (rewards.js) : finir les trois campagnes d'histoire.
  aube: { name: 'Aube de Séraphine', card: 'seraphine' },
};
// Tous les thèmes : { identifiant: nom }.
export const THEMES = { ...SEASON_THEMES, ...Object.fromEntries(Object.entries(EXTRA_THEMES).map(([id, x]) => [id, x.name])) };
export const SHOP_THEMES = Object.keys(EXTRA_THEMES).filter(id => EXTRA_THEMES[id].price || EXTRA_THEMES[id].prisms);
// Où se trouve un thème : 'themes' (rayon Thèmes), 'essence' (rayon Essence), 'boss' (magasin du boss mondial), 'casino' (boutique
// de l'événement du casino), ou null (succès).
export const themeShop = id => { const x = EXTRA_THEMES[id]; return !x ? null : x.event ? x.event : x.boss ? 'boss' : x.essence ? 'essence' : x.price || x.prisms ? 'themes' : null; };
// Le thème est-il sorti (reveal passé, ou pas de date) ?
export const themeOut = (id, day = today()) => { const r = EXTRA_THEMES[id]?.reveal; return !r || day >= r; };
