// Cosmétiques illustrés : dos de carte, cadres de profil et fond de l'appli, rangés dans cosmetiques/ (voir cosmetiques/LISEZMOI.md).
// Chaque image trouvée remplace le dessin CSS du même identifiant (style.css, « .back-… » et « .frame-… ») ; sans image, le dessin CSS reste.
// Rien à changer dans le rendu : les classes existantes reçoivent leur image par une feuille de style ajoutée ici.
const urls = glob => Object.fromEntries(Object.entries(glob).map(([path, url]) => [path.match(/([^/]+)\.webp$/)[1], url]));
const BACK_IMG = urls(import.meta.glob('./cosmetiques/dos/*.webp', { eager: true, query: '?url', import: 'default' }));
const FRAME_IMG = urls(import.meta.glob('./cosmetiques/cadres/*.webp', { eager: true, query: '?url', import: 'default' }));
const BG_IMG = urls(import.meta.glob('./cosmetiques/fond/*.webp', { eager: true, query: '?url', import: 'default' }));

export const hasBackImage = id => !!BACK_IMG[id];
export const hasFrameImage = id => !!FRAME_IMG[id];

const cssId = id => String(id).replace(/[^a-z0-9_-]/gi, '');
const rules = [
  ...Object.entries(BACK_IMG).map(([id, url]) => `.mc.back.back-${cssId(id)} { background: url('${url}') center / cover no-repeat, #0c0f15; border-top-color: transparent; }`),
  // Cadre illustré : un anneau posé par-dessus l'image de profil, dont le trou rond épouse le portrait, un peu réduit
  // pour que l'anneau ne déborde pas trop sur ses voisins (réglages --ring-hole et --ring-fit dans theme.css).
  ...Object.entries(FRAME_IMG).flatMap(([id, url]) => [
    `.frame.frame-${cssId(id)} { position: relative; background: none; box-shadow: none; padding: 0; }`,
    `.frame.frame-${cssId(id)} > .avatar { transform: scale(var(--ring-fit)); border-color: var(--sunk); }`,
    `.frame.frame-${cssId(id)}::after { content: ""; position: absolute; inset: var(--ring-out); background: url('${url}') center / contain no-repeat; pointer-events: none; z-index: 1; }`,
  ]),
];
// Fonds de l'appli : sombre.webp et clair.webp, chacun pour son thème (style.css, --fond).
if (BG_IMG.sombre) rules.push(`:root { --fond-sombre: url('${BG_IMG.sombre}'); }`);
if (BG_IMG.clair) rules.push(`:root { --fond-clair: url('${BG_IMG.clair}'); }`);

if (rules.length && typeof document !== 'undefined') {
  const s = document.createElement('style');
  s.dataset.cosmetics = '';
  s.textContent = rules.join('\n');
  document.head.append(s);
}
