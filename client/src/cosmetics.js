// Cosmétiques dessinés avec PixiJS (cosmetics-art.js) : icônes des monnaies, dos de carte et cadres de profil.
// Rien ne change dans le HTML : chaque dessin est rendu une fois en image, puis une feuille de style ajoutée ici le pose sur
// les classes existantes (style.css : « .ico-… », « .mc.back.back-… », « .frame-… »). Un identifiant sans dessin garde son
// rendu CSS, et tout reste en CSS sans WebGL.
// Pour ne pas ralentir le démarrage : PixiJS arrive après le premier rendu, et les images sont gardées dans le cache du
// navigateur, si bien que les visites suivantes les posent tout de suite sans rien redessiner. Changer un dessin : augmenter VERSION.
import { webgl } from './fx.js';
const VERSION = 8, CACHE = 'cosmetiques', DPR = () => Math.min(2, Math.max(1, devicePixelRatio || 1));
const key = (kind, id) => `/__cosmetiques/v${VERSION}/x${DPR()}/${kind}/${id}.png`;

// Toutes les images, en URL : { icon: { shard: … }, back: { … }, frame: { … } }.
export async function renderAll() {
  const [{ autoDetectRenderer, Rectangle }, art] = await Promise.all([import('pixi.js'), import('./cosmetics-art.js')]);
  const renderer = await autoDetectRenderer({ preference: 'webgl', backgroundAlpha: 0, width: 8, height: 8, antialias: true });
  const jobs = [['icon', art.ICON_IDS, art.drawIcon, art.ICON_S, art.ICON_S, 0.75], ['back', art.BACK_IDS, art.drawBack, art.BACK_W, art.BACK_H, 1],
    ['frame', art.FRAME_IDS, art.drawFrame, art.FRAME_S + 2 * art.FRAME_PAD, art.FRAME_S + 2 * art.FRAME_PAD, 0.5]];
  const out = { icon: {}, back: {}, frame: {} }, blobs = [];
  for (const [kind, ids, draw, w, h, scale] of jobs) for (const id of ids) {
    const c = draw(id); if (!c) continue;
    const canvas = renderer.extract.canvas({ target: c, frame: new Rectangle(0, 0, w, h), resolution: scale * DPR(), antialias: true });
    c.destroy({ children: true });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) continue;
    out[kind][id] = URL.createObjectURL(blob); blobs.push([key(kind, id), blob]);
  }
  renderer.destroy();
  return { urls: out, blobs };
}

// En % du portrait : l'anneau déborde de FRAME_OUT de chaque côté, et l'image ajoute sa marge FRAME_PAD (cosmetics-art.js),
// soit 40 / 256 du carré du dessin, lequel vaut 1 + 2 × 14 % du portrait.
const FRAME_OUT = 14 + 40 / 256 * (100 + 2 * 14);
const cssId = id => String(id).replace(/[^a-z0-9_-]/gi, '');
function apply({ icon, back, frame }) {
  const rules = [
    ...Object.entries(icon).map(([id, url]) => `.ico-${cssId(id)} { background-image: url('${url}'); }`),
    ...Object.entries(back).map(([id, url]) => `.mc.back.back-${cssId(id)} { background: url('${url}') center / cover no-repeat, #170d08; border-color: #170d08; }`),
    // Le cadre est un anneau posé par-dessus le portrait ; son trou rond laisse voir l'image de profil.
    ...Object.entries(frame).flatMap(([id, url]) => [
      `.frame.frame-${cssId(id)} { position: relative; background: #170d08; box-shadow: none; }`,
      `.frame.frame-${cssId(id)}::after { content: ""; position: absolute; inset: -${FRAME_OUT}%; background: url('${url}') center / 100% 100% no-repeat; pointer-events: none; }`,
    ]),
  ];
  const s = document.createElement('style'); s.dataset.cosmetics = ''; s.textContent = rules.join('\n');
  document.querySelector('style[data-cosmetics]')?.remove(); document.head.append(s);
}

// Images déjà rendues lors d'une visite précédente (même VERSION, même définition d'écran).
async function fromCache(art) {
  const cache = await caches.open(CACHE), out = { icon: {}, back: {}, frame: {} };
  for (const [kind, ids] of Object.entries(art)) for (const id of ids) {
    const r = await cache.match(key(kind, id)); if (!r) return null;
    out[kind][id] = URL.createObjectURL(await r.blob());
  }
  return out;
}
const IDS_KEY = `/__cosmetiques/v${VERSION}/ids.json`;

async function start() {
  if (typeof document === 'undefined' || !webgl()) return;
  try {
    const cache = 'caches' in window ? await caches.open(CACHE).catch(() => null) : null;
    const ids = cache && await (await cache.match(IDS_KEY))?.json();
    const hit = ids && await fromCache(ids);
    if (hit) { apply(hit); return; }
    const { urls, blobs } = await renderAll();
    apply(urls);
    if (!cache) return;
    // Les anciennes versions sont remplacées.
    for (const req of await cache.keys()) await cache.delete(req);
    for (const [k, blob] of blobs) await cache.put(k, new Response(blob, { headers: { 'content-type': 'image/png' } }));
    await cache.put(IDS_KEY, new Response(JSON.stringify(Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, Object.keys(v)])))));
  } catch (err) { console.warn('Cosmétiques PixiJS indisponibles', err); }
}
// Après le premier rendu de l'appli, quand le navigateur souffle.
if (typeof window !== 'undefined' && !window.__noCosmetics) {
  const go = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
  document.readyState === 'complete' ? go() : addEventListener('load', go, { once: true });
}
