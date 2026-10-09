// Illustrations des cartes : deux calques par carte, dans art/<id>/ (decor.webp et perso.webp).
// Une carte sans dossier s'affiche sans illustration ; il suffit d'ajouter ses fichiers pour qu'elle en ait une.
// Gabarit des images : 960x1424 px. La fenêtre de la carte est le rectangle 832x1168 placé à (64, 192) ;
// le personnage peut en sortir de 192 px par le haut et de 64 px par les côtés et le bas.
import { esc } from './common.js';
import { CARDS } from '@jeu/engine';
import { CARD_LEVELS } from '@jeu/engine/rewards';

const files = import.meta.glob('./art/*/*.webp', { eager: true, query: '?url', import: 'default' });
const ART = {};
for (const [path, url] of Object.entries(files)) {
  const [, id, layer] = path.match(/^\.\/art\/([^/]+)\/(decor|perso)\.webp$/) || [];
  if (id) (ART[id] ||= {})[layer] = url;
}
export const hasArt = id => !!ART[id]?.decor;

// Le personnage sort du cadre à partir du premier niveau de carte qui le débloque (rewards.js, « pop »),
// seulement dans la vue en grand (style.css, .zoomart.pop) : en vignette, il reste dans le cadre.
// Les sorts ne débordent jamais : leur illustration reste dans le cadre, sans calque personnage.
export const POP_LEVEL = CARD_LEVELS.findIndex(l => l?.pop);
const pops = lvl => POP_LEVEL > 0 && lvl >= POP_LEVEL;
const isSpell = id => CARDS[id]?.type === 'S';

// Illustration avec le nom de la carte en bas, dans la police de sa famille (style.css, --famfont).
export function artHTML(id, name, lvl = 1, cls = '') {
  const a = ART[id]; if (!a?.decor) return '';
  const perso = !isSpell(id) && a.perso;
  return `<div class="art ${pops(lvl) && perso ? 'pop' : ''} ${cls}" aria-hidden="true">
    <div class="art-clip"><img class="art-decor" src="${a.decor}" alt="" loading="lazy" decoding="async"></div>
    ${perso ? `<img class="art-perso" src="${a.perso}" alt="" loading="lazy" decoding="async">` : ''}
    <span class="art-name">${esc(name)}</span></div>`;
}
