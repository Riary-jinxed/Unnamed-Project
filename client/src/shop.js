// Étal et vitrines de la boutique. Étal : en haut de chaque rayon, les boosters des sets ouverts (ou le coffre d'arts) posés sur un comptoir,
// sous un auvent, entre deux lanternes. Toucher un paquet l'achète ou ouvre un booster offert, comme ses boutons plus bas.
// Les paquets et le coffre restent en HTML (dessins d'opening.js) : toucher, clavier et lecteurs d'écran ne changent pas.
// Le décor animé (auvent qui ondule, lanternes qui se balancent, rayons, poussière dorée, éclats au toucher) est dessiné
// avec PixiJS par shop-stage.js, chargé au premier passage en boutique, seulement avec WebGL et sans les animations réduites ou coupées (motion.js).
// Sans lui, le décor reste en CSS (shop.css). Les sélections du jour (cartes, arts) ont la même mise en scène : voir vitrineHTML.
import './shop.css';
import { reduceMotion, webgl } from './fx.js';
import { packSVG, chestSVG, warmOpening } from './opening.js';
import { t } from '@jeu/engine/i18n';

// items : [{ kind: 'pack' | 'chest', act, set, setName, n, tag, free, fresh, off, label }] ; fresh : ruban « Nouveau » (set le plus récent).
// title : enseigne centrée au-dessus des objets ; info : action d'un bouton « i » dans le coin du comptoir (ce que contient le coffre,
// ou les boosters), infoLabel : son nom pour les lecteurs d'écran.
export function stallHTML(items, { title = '', info = '', infoLabel = '' } = {}) {
  const item = (x, i) => `<button class="stall-item is-${x.kind} pk-${x.set || 'base'}${x.free ? ' free' : ''}" data-act="${x.act}"${x.set ? ` data-set="${x.set}"` : ''} ${x.off ? 'disabled' : ''} aria-label="${x.label}" style="--i:${i}">
      <span class="stall-obj" data-px>${x.kind === 'chest' ? chestSVG(`shc${i}`) : packSVG(x.setName, x.n, `shp${i}`)}</span>
      ${x.free ? `<span class="stall-free num">${t('Offert')}${x.free > 1 ? ` ×${x.free}` : ''}</span>` : ''}${x.fresh ? `<span class="stall-new">${t('Nouveau')}</span>` : ''}
      <span class="stall-tag">${x.tag}</span></button>`;
  return `<div class="stall" data-scene="stall-${items[0]?.kind || ''}" aria-label="${t('Étal')}"><div class="stall-wall"></div><div class="stall-awning"></div><div class="stall-shelf"></div>
    ${title ? `<span class="stall-sign">${title}</span>` : ''}
    ${info ? `<button class="stall-info" data-act="${info}" aria-haspopup="dialog" aria-label="${infoLabel || (title ? t('{title} : ce qu\'il contient', { title }) : t('ce qu\'il contient'))}">i</button>` : ''}
    <div class="stall-items">${items.map(item).join('')}</div></div>`;
}

// Sélection du jour : une vitrine tendue de velours où les offres du jour sont exposées côte à côte sous des projecteurs,
// chacune avec son prix sur une étiquette dorée ; « Vendue » en travers une fois achetée. Toucher l'illustration l'agrandit.
// slots : [{ art, zoom, style (avec --glow, la couleur de sa lumière), cls, badge, cost, price, act, id, set, state: 'sale' | 'sold' | 'owned', done, off, label, name, sub }]
// done : ce qui remplace « Possédée » sous une offre qui n'est plus en vente (« Niveau max » pour un doublon).
// Sans zoom, l'illustration ne s'agrandit pas (offres de change). timer : false pour une vitrine qui ne change pas à minuit.
// key : nom de son décor animé (shop-stage.js), qui le retrouve d'un rendu à l'autre ; par défaut cls, sinon le titre.
export function vitrineHTML({ title, sub, slots, timer = true, cls = '', key = '' }) {
  const slot = (x, i) => `<div class="vit-slot ${x.state}${x.cls ? ` ${x.cls}` : ''}" style="--i:${i};${x.style}">
      ${x.zoom ? `<button class="vit-card" data-px data-zoom="${x.zoom}" aria-label="${t('Voir {name} en grand', { name: x.name })}">` : '<div class="vit-card still" data-px>'}${x.art}
        ${x.cost != null ? `<span class="vit-cost num">${x.cost}</span>` : ''}${x.badge ? `<span class="vit-badge">${x.badge}</span>` : ''}
        ${x.state === 'sold' ? `<span class="vit-stamp">${t('Vendue')}</span>` : ''}${x.zoom ? '</button>' : '</div>'}
      ${x.caption === false ? '' : `<span class="vit-name">${x.name}</span>`}${x.sub ? `<span class="vit-sub">${x.sub}</span>` : ''}
      ${x.state === 'sale' ? `<button class="vit-buy" data-act="${x.act}" data-id="${x.id}"${x.set ? ` data-set="${x.set}"` : ''} ${x.off ? 'disabled' : ''} aria-label="${x.label}">${x.price}</button>`
        : `<span class="vit-done">${x.state === 'sold' ? t('Achetée') : x.done || t('Possédée')}</span>`}</div>`;
  return `<div class="vitrine${cls ? ` ${cls}` : ''}" data-scene="vit-${String(key || cls || title).replace(/[^\w-]/g, '')}"><div class="vit-velvet"></div>
    <div class="vit-head"><div><span class="eyebrow">${sub}</span><h3 class="vit-title">${title}</h3></div>
      ${timer ? `<span class="vit-timer" title="${t('Nouvelle sélection à minuit')}"><i aria-hidden="true"></i><span data-reset>${resetIn()}</span></span>` : ''}</div>
    <div class="vit-row">${slots.map(slot).join('')}</div></div>`;
}
// Bourse d'Éclats d'une offre de change : un tas de cristaux ambrés sur un coussin, plus haut à chaque offre (step : 0 à 3).
const CRYSTALS = [[60, 70, 1.25, 0], [40, 80, 1, -16], [80, 80, 1, 16], [60, 50, .9, 4], [26, 92, .8, -28], [94, 92, .8, 26], [46, 58, .8, -10], [74, 58, .8, 12],
  [60, 32, .8, 0], [34, 70, .7, -20], [86, 70, .7, 20], [60, 88, .9, 0]];
export function shardPileSVG(step, id = 'sp') {
  const n = [3, 6, 9, 12][step] ?? 12, crystal = ([x, y, k, r]) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${k})">
      <path d="M0-17 10-6 0 15-10-6Z" fill="url(#${id}g)" stroke="#6a400a" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M-10-6h20M0-17-3-6 0 15 3-6Z" fill="none" stroke="#8a5a10" stroke-width="1" stroke-linejoin="round"/>
      <path d="M-3-6 0-17-7-8Z" fill="#fff3c4" opacity=".85"/></g>`;
  return `<svg class="shardpile" viewBox="0 0 120 120" aria-hidden="true"><defs>
      <radialGradient id="${id}h" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="#ffcf6a" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf6a" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#e0a530"/><stop offset="1" stop-color="#a86a14"/></linearGradient></defs>
    <circle cx="60" cy="66" r="58" fill="url(#${id}h)"/>
    <ellipse cx="60" cy="104" rx="50" ry="11" fill="#5a1624" stroke="#c88a20" stroke-width="2"/>
    ${CRYSTALS.slice(0, n).sort((a, b) => a[1] - b[1]).map(crystal).join('')}</svg>`;
}
// Temps restant avant minuit à Paris, l'heure à laquelle le serveur renouvelle les offres (today() du moteur).
export function resetIn(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, +x.value]));
  const left = Math.max(60, 86400 - (p.hour * 3600 + p.minute * 60 + p.second)), h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60);
  return h ? t('{h} h {m}', { h, m: String(m).padStart(2, '0') }) : t('{m} min', { m });
}
setInterval(() => { for (const el of document.querySelectorAll('[data-reset]')) el.textContent = resetIn(); }, 30000);

let mod = null, loading = false, want = null, able = null;

// Appelé à chaque rendu : `app` contient la boutique (étal, vitrines) ou un autre écran.
export function setShop(app) {
  want = [...app.querySelectorAll('.stall, .vitrine')];
  if (mod) { mod.show(reduceMotion() ? [] : want); return; }
  if (!want.length || loading) return;
  able ??= webgl();
  if (!able || reduceMotion()) return;
  loading = true;
  import('./shop-stage.js').then(m => { mod = m; m.show(want.filter(el => el.isConnected));
    // Puis, la boutique affichée et au repos, les effets de l'ouverture des boosters et des coffres.
    (window.requestIdleCallback || (f => setTimeout(f, 1500)))(warmOpening, { timeout: 4000 }); })
    .catch(err => console.warn('Étal animé indisponible', err));
}
