// Illustrations des cartes : deux calques par carte, dans art/<id>/ (decor.webp et perso.webp).
// Une carte sans dossier s'affiche sans illustration ; il suffit d'ajouter ses fichiers pour qu'elle en ait une.
// Arts alternatifs (@jeu/engine/arts) : mêmes calques dans art/alt/<id de l'art>/. Tant qu'ils manquent, un art provisoire
// s'affiche à la place : l'illustration d'origine (ou un fond) teintée de la couleur de la rareté, avec le nom de l'art.
// Gabarit des images : 960x1424 px. La fenêtre de la carte est le rectangle 832x1168 placé à (64, 192) ;
// le personnage peut en sortir de 192 px par le haut et de 64 px par les côtés et le bas.
import { esc } from './common.js';
import { CARDS } from '@jeu/engine';
import { CARD_LEVELS } from '@jeu/engine/rewards';
import { ARTS, rarityKey, rarityName } from '@jeu/engine/arts';

const files = import.meta.glob(['./art/*/*.webp', './art/alt/*/*.webp'], { eager: true, query: '?url', import: 'default' });
const ART = {}, ALT = {};
for (const [path, url] of Object.entries(files)) {
  const [, alt, id, layer] = path.match(/^\.\/art\/(alt\/)?([^/]+)\/(decor|perso)\.webp$/) || [];
  if (id) ((alt ? ALT : ART)[id] ||= {})[layer] = url;
}
export const hasArt = id => !!ART[id]?.decor;
// Un art alternatif a-t-il déjà ses images ?
export const altReady = artId => !!ALT[artId]?.decor;

// Le personnage sort du cadre à partir du premier niveau de carte qui le débloque (rewards.js, « pop »),
// seulement dans la vue en grand (style.css, .zoomart.pop) : en vignette, il reste dans le cadre.
// Les sorts ne débordent jamais : leur illustration reste dans le cadre, sans calque personnage.
export const POP_LEVEL = CARD_LEVELS.findIndex(l => l?.pop);
const pops = lvl => POP_LEVEL > 0 && lvl >= POP_LEVEL;
const isSpell = id => CARDS[id]?.type === 'S';

// Illustration avec le nom de la carte en bas, dans la police de sa famille (style.css, --famfont).
// artId : art alternatif à montrer à la place de l'illustration d'origine (null : l'origine).
export function artHTML(id, name, lvl = 1, cls = '', artId = null) {
  const alt = artId && ARTS[artId];
  if (alt) return altHTML(alt, name, lvl, cls);
  const a = ART[id]; if (!a?.decor) return '';
  return layers(a, name, lvl, cls, isSpell(id));
}
const layers = (a, name, lvl, cls, spell) => { const perso = !spell && a.perso;
  return `<div class="art ${pops(lvl) && perso ? 'pop' : ''} ${cls}" aria-hidden="true">
    <div class="art-clip"><img class="art-decor" src="${a.decor}" alt="" loading="lazy" decoding="async"></div>
    ${perso ? `<img class="art-perso" src="${a.perso}" alt="" loading="lazy" decoding="async">` : ''}
    <span class="art-name">${esc(name)}</span></div>`; };
// Art alternatif : ses images avec un liseré de rareté, ou l'art provisoire.
function altHTML(alt, name, lvl, cls) {
  const rar = `rar rar-${rarityKey(alt)}`;
  if (ALT[alt.id]?.decor) return layers(ALT[alt.id], name, lvl, `${rar} ${cls}`, isSpell(alt.card));
  const base = ART[alt.card]?.decor;
  return `<div class="art ph ${rar} ${cls}" aria-hidden="true">
    <div class="art-clip">${base ? `<img class="art-decor" src="${base}" alt="" loading="lazy" decoding="async">` : ''}<span class="ph-veil"></span></div>
    <span class="ph-tag">${esc(rarityName(alt))}</span><span class="ph-title">${esc(alt.name)}</span>
    <span class="art-name">${esc(name)}</span></div>`;
}
