// Réglage des animations (Profil › Réglages) : complètes, réduites ou aucune.
// Sans choix du joueur, on suit le système (« réduire les animations » du téléphone ou de l'ordinateur).
// <html> porte data-motion (full, reduced, none) et la classe « calm » dès que les animations sont réduites ou coupées :
// les feuilles de style en tirent leurs versions calmes (.calm …), et « aucune » coupe tout le reste (style.css).
// index.html pose déjà l'attribut avant le premier affichage, pour que le voile de chargement le respecte.
const KEY = 'jeu-motion';
export const MOTION_LEVELS = ['full', 'reduced', 'none'];
const os = matchMedia('(prefers-reduced-motion: reduce)');
const stored = () => { try { const v = localStorage.getItem(KEY); return MOTION_LEVELS.includes(v) ? v : null; } catch { return null; } };

let chosen = stored();
// Niveau en vigueur : celui du joueur, sinon celui du système.
export const motionLevel = () => chosen || (os.matches ? 'reduced' : 'full');
// Choix du joueur, ou null quand il suit le système.
export const motionChoice = () => chosen;
// Animations réduites ou coupées : les effets JS gardent leur version immobile.
export const reduceMotion = () => motionLevel() !== 'full';

function apply() {
  const root = document.documentElement, level = motionLevel();
  root.dataset.motion = level;
  root.classList.toggle('calm', level !== 'full');
}
export function setMotion(level) {
  chosen = MOTION_LEVELS.includes(level) ? level : null;
  try { if (chosen) localStorage.setItem(KEY, chosen); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
  apply();
}
os.addEventListener?.('change', apply);
apply();
