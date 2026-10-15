// Point d'entrée de l'appli : la langue d'abord (lang.js, qui ne télécharge l'anglais que si besoin), puis main.js.
// main.js est préchargé par la page (vite.config.js) : son téléchargement n'attend pas celui des traductions.
import { loadLang } from './lang.js';

// Traductions injoignables (réseau) : l'appli démarre quand même, en français.
loadLang().catch(() => {}).then(() => import('./main.js'));

// Après une mise à jour, une page restée ouverte peut demander un morceau de code qui n'existe plus sur le serveur :
// elle se recharge (une fois par minute au plus) pour prendre la nouvelle version.
window.addEventListener('vite:preloadError', e => {
  try { if (Date.now() - (+sessionStorage.getItem('jeu-reload') || 0) < 60000) return; sessionStorage.setItem('jeu-reload', Date.now()); } catch { return; }
  e.preventDefault();
  location.reload();
});
