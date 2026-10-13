// Illustrations des cartes : deux calques par carte, dans art/<id>/ (decor.webp et perso.webp).
// Une carte sans dossier montre un visuel provisoire aux couleurs de sa famille (provHTML) ; il suffit d'ajouter ses fichiers pour qu'elle ait son illustration.
// Arts alternatifs (@jeu/engine/arts) : mêmes calques dans art/alt/<id de l'art>/. Tant qu'ils manquent, un art provisoire
// s'affiche à la place : l'illustration d'origine (ou un fond) teintée de la couleur de la rareté, avec le nom de l'art.
// Gabarit des images : 960x1424 px. La fenêtre de la carte est le rectangle 832x1168 placé à (64, 192) ;
// le personnage peut en sortir de 192 px par le haut et de 64 px par les côtés et le bas.
import { esc } from './common.js';
import { CARDS, GENERALS, TERRAINS } from '@jeu/engine';
import { CARD_LEVELS } from '@jeu/engine/rewards';
import { ARTS, rarityKey, rarityName } from '@jeu/engine/arts';

const files = import.meta.glob(['./art/*/*.webp', './art/alt/*/*.webp'], { eager: true, query: '?url', import: 'default' });
const ART = {}, ALT = {};
for (const [path, url] of Object.entries(files)) {
  const [, alt, id, layer] = path.match(/^\.\/art\/(alt\/)?([^/]+)\/(decor|perso)\.webp$/) || [];
  if (id) ((alt ? ALT : ART)[id] ||= {})[layer] = url;
}
export const hasArt = id => !!ART[id]?.decor;

// Visuels des terrains : une image par terrain, art/terrain/<id>.webp, en 832x1168 (le ratio de la fenêtre des cartes),
// sans personnage ni débordement. Sur le plateau, elle est recadrée au centre en fond de la moitié de zone de son joueur.
const TERRAIN_ART = Object.fromEntries(Object.entries(import.meta.glob('./art/terrain/*.webp', { eager: true, query: '?url', import: 'default' }))
  .map(([path, url]) => [path.match(/([^/]+)\.webp$/)[1], url]));
// Fond d'une moitié de zone (side : « foe » en haut, « me » en bas).
export const terrainBg = (id, side) => TERRAIN_ART[id] ? `<span class="tbg ${side}" style="background-image:url('${TERRAIN_ART[id]}')" aria-hidden="true"></span>` : '';
// Illustration d'un terrain en grand (carte de terrain, vue en grand), avec son nom en bas.
// Sans image : le visuel provisoire de sa famille (provHTML, plus bas).
export const terrainHTML = (id, name, cls = '') => TERRAIN_ART[id] ? `<div class="art tart ${cls}" aria-hidden="true">
  <div class="art-clip"><img class="art-terrain" src="${TERRAIN_ART[id]}" alt="" loading="lazy" decoding="async"></div>
  <span class="art-name">${esc(name)}</span></div>` : provHTML(id, name, `tart ${cls}`, TERRAINS[id]?.fam || null);
// Un art alternatif a-t-il déjà ses images ?
export const altReady = artId => !!ALT[artId]?.decor;

// Le personnage sort du cadre à partir du premier niveau de carte qui le débloque (rewards.js, « pop »),
// seulement dans la vue en grand (style.css, .zoomart.pop) : en vignette, il reste dans le cadre.
// Les sorts ne débordent jamais : leur illustration reste dans le cadre, sans calque personnage.
export const POP_LEVEL = CARD_LEVELS.findIndex(l => l?.pop);
const pops = lvl => POP_LEVEL > 0 && lvl >= POP_LEVEL;
// Cartes vivantes (holo.js, holo.css) : reflet holographique qui suit l'inclinaison du téléphone (ou la souris),
// sur les arts alternatifs et sur les cartes rares, c'est-à-dire montées au niveau Or ou plus.
const HOLO_LEVEL = CARD_LEVELS.findIndex(l => l?.look === 'or');
const holoLv = lvl => HOLO_LEVEL > 0 && lvl >= HOLO_LEVEL ? `holo holo-${CARD_LEVELS[lvl].look}` : '';
const FOIL = '<span class="foil"></span>';
// Le joueur peut couper le reflet carte par carte (compte : holoOff) ; main.js fournit la liste.
let holoOff = () => ({});
export const setHoloOff = f => { holoOff = f; };
// La carte a-t-elle un reflet à couper ou rallumer, avec ce niveau et cet art ?
export const holoCard = (lvl, artId) => !!(artId && ARTS[artId]) || !!holoLv(lvl);
// Débordement du personnage : le joueur peut aussi le couper carte par carte (compte : popOff).
let popOff = () => ({});
export const setPopOff = f => { popOff = f; };
// La carte a-t-elle un personnage qui déborde, avec ce niveau et cet art ? (illustration avec personnage, hors sorts)
export const popCard = (id, lvl, artId) => pops(lvl) && !isSpell(id) && !!(artId && ALT[artId]?.decor ? ALT[artId] : ART[id])?.perso;
const isSpell = id => CARDS[id]?.type === 'S';

// Fond illustré des petites cartes (main, plateau) : le décor seul, recadré sur le haut de la fenêtre de la carte.
// artId : art alternatif choisi ; tant que ses images manquent, l'illustration d'origine. Sans illustration : le visuel provisoire.
export const artBg = (id, artId = null) => { const a = (artId && ALT[artId]?.decor ? ALT[artId] : null) || ART[id];
  return a?.decor ? `<span class="cart" style="background-image:url('${a.decor}')" aria-hidden="true"></span>`
    : provFor(id) ? `<span class="cart prov" aria-hidden="true">${emblem(famOfId(id))}</span>` : ''; };

// Visuel provisoire d'une carte, d'un général ou d'un terrain dont l'illustration n'est pas encore arrivée (set 2 au départ) :
// un fond aux couleurs de sa famille (--fam, posé par la carte), l'emblème de la famille et « Illustration à venir ».
// Rien à retirer ensuite : dès que art/<id>/decor.webp (ou art/terrain/<id>.webp) existe, la vraie illustration le remplace.
// Emblèmes dessinés dans un carré 100x100 (les trous en evenodd).
const EMBLEMS = {
  'Mort-vivant': '<path fill-rule="evenodd" d="M50 12C31 12 19 25 19 42c0 10 4 18 11 22v10c0 3 2 5 5 5h4v-7h6v7h10v-7h6v7h4c3 0 5-2 5-5V64c7-4 11-12 11-22 0-17-12-30-31-30Zm-12 27a8 9 0 1 1 0 18 8 9 0 1 1 0-18Zm24 0a8 9 0 1 1 0 18 8 9 0 1 1 0-18ZM50 58l5 9h-10Z"/>',
  Vampire: '<path fill-rule="evenodd" d="M50 8S24 40 24 60a26 26 0 0 0 52 0C76 40 50 8 50 8ZM38 54c-2 8 0 16 7 21-9-1-14-9-12-18Z"/>',
  Ange: '<ellipse cx="50" cy="20" rx="15" ry="5" fill="none" stroke="currentColor" stroke-width="4"/><path d="M46 44C34 30 14 28 6 36c9 0 15 3 18 8-7-1-13 1-15 6 8-1 14 1 17 5-5 1-9 4-10 8 11-3 22-5 30-19Z"/><path d="M54 44c12-14 32-16 40-8-9 0-15 3-18 8 7-1 13 1 15 6-8-1-14 1-17 5 5 1 9 4 10 8-11-3-22-5-30-19Z"/><circle cx="50" cy="52" r="9"/><path d="M42 64h16l6 26H36Z"/>',
  'Démon': '<path d="M37 50C24 46 14 33 16 12c5 14 14 22 27 26Z"/><path d="M63 50c13-4 23-17 21-38-5 14-14 22-27 26Z"/><path fill-rule="evenodd" d="M50 36c-13 0-22 10-22 24 0 13 10 26 22 30 12-4 22-17 22-30 0-14-9-24-22-24Zm-12 18 9 4-3 5Zm24 0-9 4 3 5Z"/>',
  Gobelin: '<g transform="rotate(35 50 50)"><path d="M47 8h6l3 52H44Z"/><path d="M36 60h28v6H36Z"/><path d="M46 66h8v16h-8Z"/><circle cx="50" cy="86" r="5"/></g><g transform="rotate(-35 50 50)"><path d="M47 8h6l3 52H44Z"/><path d="M36 60h28v6H36Z"/><path d="M46 66h8v16h-8Z"/><circle cx="50" cy="86" r="5"/></g>',
  Elfe: '<path fill-rule="evenodd" d="M50 6C22 28 20 64 50 94 80 64 78 28 50 6Zm-1 20h2v62h-2ZM36 52l13 9v3L35 55Zm28 0-13 9v3l14-9ZM39 38l10 8v3L38 41Zm22 0-10 8v3l11-8Z"/>',
  Dragon: '<path fill-rule="evenodd" d="M6 50C22 24 78 24 94 50 78 76 22 76 6 50Zm44-22c-7 8-7 36 0 44 7-8 7-36 0-44Z"/>',
  Hacker: '<path fill-rule="evenodd" d="M10 18h80v54H10Zm6 6v42h68V24Zm8 10 14 11-14 11-4-5 8-6-8-6Zm22 18h20v6H46ZM36 78h28l4 8H32Z"/>',
  Cyborg: '<path fill-rule="evenodd" d="M44 6h12l2 10 8 3 8-6 8 8-6 8 3 8 10 2v12l-10 2-3 8 6 8-8 8-8-6-8 3-2 10H44l-2-10-8-3-8 6-8-8 6-8-3-8-10-2V44l10-2 3-8-6-8 8-8 8 6 8-3Zm6 24a20 20 0 1 0 0 40 20 20 0 0 0 0-40Zm0 12a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"/>',
  neutre: '<path d="M50 6l9 29 30-6-21 21 21 21-30-6-9 29-9-29-30 6 21-21-21-21 30 6Z"/>',
};
const famOfId = id => CARDS[id]?.kw?.find(k => EMBLEMS[k]) || GENERALS[id]?.fam || TERRAINS[id]?.fam || null;
const emblem = fam => `<svg class="prov-emb" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${EMBLEMS[fam] || EMBLEMS.neutre}</svg>`;
const provHTML = (id, name, cls, fam = famOfId(id)) => `<div class="art prov ${cls}" aria-hidden="true">
  <div class="art-clip"><span class="prov-ring"></span>${emblem(fam)}<span class="prov-tag">Illustration à venir</span></div>
  <span class="art-name">${esc(name)}</span></div>`;
// Une carte sans illustration a-t-elle un visuel provisoire ? Toutes, sauf les jetons (créés en partie, sans illustration prévue).
const provFor = id => !!(CARDS[id] && !CARDS[id].token || GENERALS[id]);

// Illustration avec le nom de la carte en bas, dans la police de sa famille (style.css, --famfont).
// artId : art alternatif à montrer à la place de l'illustration d'origine (null : l'origine).
export function artHTML(id, name, lvl = 1, cls = '', artId = null) {
  const alt = artId && ARTS[artId];
  if (alt) return altHTML(alt, name, lvl, cls);
  const a = ART[id]; if (!a?.decor) return provFor(id) ? provHTML(id, name, cls) : '';
  return layers(a, name, lvl, `${holoOff()[id] ? '' : holoLv(lvl)} ${cls}`, isSpell(id), id);
}
// Personnage qui sort du cadre : la partie hors de la fenêtre est redessinée par-dessus le contour de la carte (style.css, .perso-out),
// avec son propre reflet découpé à la silhouette du personnage (holo.css, .perso-foil, --perso) et l'ombre du bandeau du nom (.name-shade).
const layers = (a, name, lvl, cls, spell, card) => { const perso = !spell && a.perso, pop = pops(lvl) && perso && !popOff()[card], holo = cls.includes('holo');
  return `<div class="art ${pop ? 'pop' : ''} ${cls}"${pop ? ` style="--perso: url('${perso}')"` : ''} aria-hidden="true">
    <div class="art-clip"><img class="art-decor" src="${a.decor}" alt="" loading="lazy" decoding="async"></div>
    ${perso ? `<img class="art-perso" src="${a.perso}" alt="" loading="lazy" decoding="async">` : ''}
    ${holo ? FOIL : ''}${pop ? `<img class="art-perso perso-out" src="${a.perso}" alt="" loading="lazy" decoding="async">` : ''}
    ${pop && holo ? '<span class="foil perso-foil"></span>' : ''}${pop ? `<span class="art-name name-shade">${esc(name)}</span>` : ''}<span class="art-name">${esc(name)}</span></div>`; };
// Portrait du général en partie : l'illustration (décor et personnage) agrandie et centrée sur le visage.
// FACES : position du visage dans l'image, en % de sa largeur et de sa hauteur ; par défaut, en haut au centre.
// Le portrait montre environ 40 % de la largeur et 33 % de la hauteur de l'image : le centre est borné pour ne jamais sortir de l'image.
const FACES = { seraphine: [52, 44], aurelia: [48, 23], morgrath: [53, 29], vorgoth: [50, 25], grisk: [48, 39], snagg: [55, 46],
  sylvaen: [44, 24], lirael: [34, 25], vaelthar: [55, 8], ignaroth: [45, 13],
  // Arts alternatifs des généraux : le visage n'est pas au même endroit que sur l'illustration d'origine.
  seraphine_zenith: [49, 48], aurelia_vitrail: [47, 29], morgrath_citrouilles: [47, 23], vorgoth_cercle: [50, 26],
  grisk_butin: [44, 30], grisk_farce: [54, 40], snagg_festin: [22, 37], sylvaen_automne: [49, 20], lirael_vitrail: [41, 34],
  vaelthar_glacier: [39, 29], ignaroth_eclipse: [53, 20] };
// Illustration d'un général (art alternatif s'il a ses images) et position de son visage.
function generalArt(id, artId) {
  if (artId && ALT[artId]?.decor) return [ALT[artId], FACES[artId] || FACES[id] || [50, 25]];
  return ART[id]?.decor ? [ART[id], FACES[id] || [50, 25]] : [null];
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// artId : art alternatif choisi ; tant que ses images manquent, l'illustration d'origine. Sans illustration : rien.
export function portraitHTML(id, artId = null) {
  const [a, [fx, fy] = []] = generalArt(id, artId); if (!a) return '';
  const x = clamp(fx, 21, 79), y = clamp(fy, 17, 83);
  return `<span class="gport-art" style="--fx: ${x}; --fy: ${y}" aria-hidden="true"><img src="${a.decor}" alt="" decoding="async">${a.perso ? `<img src="${a.perso}" alt="" decoding="async">` : ''}</span>`;
}
// Général du deck joué, en grand sur l'accueil : décor et personnage entiers, sans cadre ni nom. Sans illustration : rien.
// Le cadrage suit le visage (style.css, .hero-art), quelle que soit la forme du bandeau (large sur ordinateur, haut sur téléphone).
export function heroHTML(id, artId = null) {
  const [a, [fx, fy] = []] = generalArt(id, artId); if (!a) return '';
  return `<span class="hero-art" style="--fx: ${fx / 100}; --fy: ${fy / 100}" aria-hidden="true"><img src="${a.decor}" alt="" decoding="async">${a.perso ? `<img src="${a.perso}" alt="" decoding="async">` : ''}</span>`;
}
// Art alternatif : ses images avec un liseré de rareté, ou l'art provisoire.
function altHTML(alt, name, lvl, cls) {
  const holo = !holoOff()[alt.card];
  const rar = `rar rar-${rarityKey(alt)}${holo ? ' holo' : ''}`;
  if (ALT[alt.id]?.decor) return layers(ALT[alt.id], name, lvl, `${rar} ${cls}`, isSpell(alt.card), alt.card);
  const base = ART[alt.card]?.decor;
  return `<div class="art ph ${rar} ${cls}" aria-hidden="true">
    <div class="art-clip">${base ? `<img class="art-decor" src="${base}" alt="" loading="lazy" decoding="async">` : ''}<span class="ph-veil"></span></div>
    ${holo ? FOIL : ''}<span class="ph-tag">${esc(rarityName(alt))}</span><span class="ph-title">${esc(alt.name)}</span>
    <span class="art-name">${esc(name)}</span></div>`;
}
