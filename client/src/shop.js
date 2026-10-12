// Étal de la boutique : en haut de chaque rayon, les boosters des sets ouverts (ou le coffre d'arts) posés sur un comptoir,
// sous un auvent, entre deux lanternes. Toucher un paquet l'achète ou ouvre un booster offert, comme ses boutons plus bas.
// Les paquets et le coffre restent en HTML (dessins d'opening.js) : toucher, clavier et lecteurs d'écran ne changent pas.
// Le décor animé (auvent qui ondule, lanternes qui se balancent, rayons, poussière dorée, éclats au toucher) est dessiné
// avec PixiJS par shop-stage.js, chargé au premier passage en boutique, seulement avec WebGL et sans « réduire les animations ».
// Sans lui, le décor reste en CSS (shop.css).
import './shop.css';
import { reduceMotion } from './fx.js';
import { packSVG, chestSVG } from './opening.js';

// items : [{ kind: 'pack' | 'chest', act, set, setName, n, tag, free, off, label }]
export function stallHTML(items) {
  const item = (x, i) => `<button class="stall-item is-${x.kind} pk-${x.set || 'base'}${x.free ? ' free' : ''}" data-act="${x.act}"${x.set ? ` data-set="${x.set}"` : ''} ${x.off ? 'disabled' : ''} aria-label="${x.label}" style="--i:${i}">
      <span class="stall-obj">${x.kind === 'chest' ? chestSVG(`shc${i}`) : packSVG(x.setName, x.n, `shp${i}`)}</span>
      ${x.free ? `<span class="stall-free num">Offert${x.free > 1 ? ` ×${x.free}` : ''}</span>` : ''}
      <span class="stall-tag">${x.tag}</span></button>`;
  return `<div class="stall" aria-label="Étal"><div class="stall-wall"></div><div class="stall-awning"></div><div class="stall-shelf"></div>
    <div class="stall-items">${items.map(item).join('')}</div></div>`;
}

let mod = null, loading = false, want = null, able = null;
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

// Appelé à chaque rendu : `app` contient la boutique (`.stall`) ou un autre écran.
export function setShop(app) {
  want = app.querySelector('.stall');
  if (mod) { want ? mod.show(want) : mod.hide(); return; }
  if (!want || loading) return;
  able ??= !reduceMotion() && webgl();
  if (!able) return;
  loading = true;
  import('./shop-stage.js').then(m => { mod = m; if (want?.isConnected) m.show(want); })
    .catch(err => console.warn('Étal animé indisponible', err));
}
