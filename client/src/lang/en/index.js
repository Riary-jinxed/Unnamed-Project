// Traductions anglaises de l'appli : main.js (main-1 à main-3), les autres écrans (screens-1, screens-2) et l'historique (history).
// Un nouveau texte peut aller dans n'importe lequel de ces fichiers ; npm run i18n dit ce qui manque.
import main1 from './main-1.js';
import main2 from './main-2.js';
import main3 from './main-3.js';
import screens1 from './screens-1.js';
import screens2 from './screens-2.js';
import history from './history.js';

export default { ...history, ...screens2, ...screens1, ...main3, ...main2, ...main1 };
