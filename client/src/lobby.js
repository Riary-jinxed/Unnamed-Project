// Accueil animé : le général du deck joué respire dans la vitrine de l'accueil, devant des braises, avec un effet de profondeur.
// Ce fichier ne fait que charger lobby-stage.js (et PixiJS) au premier passage sur l'accueil, puis lui confier la vitrine à
// chaque rendu. Sans WebGL, avec « réduire les animations » ou si le chargement échoue, l'illustration en HTML reste telle quelle.
import { reduceMotion } from './fx.js';

let mod = null, loading = false, want = null;
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
let able = null;

// Appelé à chaque rendu : `app` contient l'accueil (`.showcase`) ou un autre écran.
export function setHome(app) {
  const host = app.querySelector('.showcase .sc-art'), imgs = host ? [...host.querySelectorAll('.hero-art img')] : [];
  want = imgs.length ? { host, decor: imgs[0].src, perso: imgs[1]?.src || null, fam: getComputedStyle(host).getPropertyValue('--fam').trim() } : null;
  if (mod) { want ? mod.show(want) : mod.hide(); return; }
  if (!want || loading) return;
  able ??= !reduceMotion() && webgl();
  if (!able) return;
  loading = true;
  // Un court délai : l'accueil s'affiche d'abord avec son image fixe, PixiJS arrive ensuite sans retarder le premier rendu.
  setTimeout(() => import('./lobby-stage.js').then(m => { mod = m; if (want) m.show(want); })
    .catch(err => console.warn('Accueil animé indisponible', err)), 400);
}
