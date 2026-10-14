// Traductions anglaises du moteur : cartes, généraux et terrains (cards.js), journal de partie (log.js),
// récompenses, émotes, saisons, arts, clans, boss, sets et decks (data.js), quêtes d'histoire (story.js),
// textes du serveur (server.js).
import cards from './cards.js';
import log from './log.js';
import data from './data.js';
import story from './story.js';
import server from './server.js';

export default { ...server, ...data, ...story, ...log, ...cards };
