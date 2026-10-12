// Étal et vitrines de la boutique. Étal : en haut de chaque rayon, les boosters des sets ouverts (ou le coffre d'arts) posés sur un comptoir,
// sous un auvent, entre deux lanternes. Toucher un paquet l'achète ou ouvre un booster offert, comme ses boutons plus bas.
// Les paquets et le coffre restent en HTML (dessins d'opening.js) : toucher, clavier et lecteurs d'écran ne changent pas.
// Le décor animé (auvent qui ondule, lanternes qui se balancent, rayons, poussière dorée, éclats au toucher) est dessiné
// avec PixiJS par shop-stage.js, chargé au premier passage en boutique, seulement avec WebGL et sans « réduire les animations ».
// Sans lui, le décor reste en CSS (shop.css). Les sélections du jour (cartes, arts) ont la même mise en scène : voir vitrineHTML.
import './shop.css';
import { reduceMotion } from './fx.js';
import { packSVG, chestSVG } from './opening.js';

// items : [{ kind: 'pack' | 'chest', act, set, setName, n, tag, free, off, label }]
export function stallHTML(items) {
  const item = (x, i) => `<button class="stall-item is-${x.kind} pk-${x.set || 'base'}${x.free ? ' free' : ''}" data-act="${x.act}"${x.set ? ` data-set="${x.set}"` : ''} ${x.off ? 'disabled' : ''} aria-label="${x.label}" style="--i:${i}">
      <span class="stall-obj" data-px>${x.kind === 'chest' ? chestSVG(`shc${i}`) : packSVG(x.setName, x.n, `shp${i}`)}</span>
      ${x.free ? `<span class="stall-free num">Offert${x.free > 1 ? ` ×${x.free}` : ''}</span>` : ''}
      <span class="stall-tag">${x.tag}</span></button>`;
  return `<div class="stall" aria-label="Étal"><div class="stall-wall"></div><div class="stall-awning"></div><div class="stall-shelf"></div>
    <div class="stall-items">${items.map(item).join('')}</div></div>`;
}

// Sélection du jour : une vitrine tendue de velours où les offres du jour sont exposées côte à côte sous des projecteurs,
// chacune avec son prix sur une étiquette dorée ; « Vendue » en travers une fois achetée. Toucher l'illustration l'agrandit.
// slots : [{ art, zoom, style (avec --glow, la couleur de sa lumière), cls, badge, cost, price, act, id, set, state: 'sale' | 'sold' | 'owned', off, label, name, sub }]
export function vitrineHTML({ title, sub, slots }) {
  const slot = (x, i) => `<div class="vit-slot ${x.state}${x.cls ? ` ${x.cls}` : ''}" style="--i:${i};${x.style}">
      <button class="vit-card" data-px data-zoom="${x.zoom}" aria-label="Voir ${x.name} en grand">${x.art}
        ${x.cost != null ? `<span class="vit-cost num">${x.cost}</span>` : ''}${x.badge ? `<span class="vit-badge">${x.badge}</span>` : ''}
        ${x.state === 'sold' ? '<span class="vit-stamp">Vendue</span>' : ''}</button>
      ${x.caption === false ? '' : `<span class="vit-name">${x.name}</span>`}${x.sub ? `<span class="vit-sub">${x.sub}</span>` : ''}
      ${x.state === 'sale' ? `<button class="vit-buy" data-act="${x.act}" data-id="${x.id}"${x.set ? ` data-set="${x.set}"` : ''} ${x.off ? 'disabled' : ''} aria-label="${x.label}">${x.price}</button>`
        : `<span class="vit-done">${x.state === 'sold' ? 'Achetée' : 'Possédée'}</span>`}</div>`;
  return `<div class="vitrine"><div class="vit-velvet"></div>
    <div class="vit-head"><div><span class="eyebrow">${sub}</span><h3 class="vit-title">${title}</h3></div>
      <span class="vit-timer" title="Nouvelle sélection à minuit"><i aria-hidden="true"></i><span data-reset>${resetIn()}</span></span></div>
    <div class="vit-row">${slots.map(slot).join('')}</div></div>`;
}
// Temps restant avant minuit à Paris, l'heure à laquelle le serveur renouvelle les offres (today() du moteur).
export function resetIn(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, +x.value]));
  const left = Math.max(60, 86400 - (p.hour * 3600 + p.minute * 60 + p.second)), h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
setInterval(() => { for (const el of document.querySelectorAll('[data-reset]')) el.textContent = resetIn(); }, 30000);

let mod = null, loading = false, want = null, able = null;
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

// Appelé à chaque rendu : `app` contient la boutique (étal, vitrines) ou un autre écran.
export function setShop(app) {
  want = [...app.querySelectorAll('.stall, .vitrine')];
  if (mod) { mod.show(want); return; }
  if (!want.length || loading) return;
  able ??= !reduceMotion() && webgl();
  if (!able) return;
  loading = true;
  import('./shop-stage.js').then(m => { mod = m; m.show(want.filter(el => el.isConnected)); })
    .catch(err => console.warn('Étal animé indisponible', err));
}
