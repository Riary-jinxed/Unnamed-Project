// Point d'entrée de l'appli : la langue d'abord (lang.js, qui ne télécharge l'anglais que si besoin), puis main.js.
// main.js est préchargé par la page (vite.config.js) : son téléchargement n'attend pas celui des traductions.
import { loadLang } from './lang.js';

// Traductions injoignables (réseau) : l'appli démarre quand même, en français.
loadLang().catch(() => {}).then(() => import('./main.js'));
