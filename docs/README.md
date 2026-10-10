# Documentation du code

Ce dossier explique comment le jeu est construit, pour pouvoir le modifier sans tout relire. Le [README principal](../README.md) reste le guide d'installation, de mise en ligne et de jeu.

| Page | Contenu |
| --- | --- |
| [Architecture](architecture.md) | Vue d'ensemble : les trois paquets, qui fait quoi, comment une partie et un appel d'API circulent, l'hébergement. |
| [Moteur de règles](moteur.md) | `packages/engine` : état d'une partie, déroulé d'un tour, crochets des cartes, IA, collection, catalogue, récompenses, outils d'équilibrage. |
| [Serveur](serveur.md) | `server` : stockage (Neon ou fichier), comptes et sessions, routes de l'API, salons en ligne et protocole WebSocket, progression, statistiques. |
| [Appli et administration](client.md) | `client` : rendu de l'appli, écrans, partie en ligne et contre l'IA, animations, service worker, page `/admin`. |
| [Recettes](recettes.md) | Ajouter une carte, un général, un terrain, un set, une mission, un succès, une route ; vérifier qu'un changement ne casse rien. |

## En deux minutes

- **Un seul langage, un seul moteur.** Tout est en JavaScript (modules ES, Node 20+). Les règles vivent dans `packages/engine/src/engine.js`, utilisé tel quel par le serveur (parties en ligne) et par le navigateur (partie contre l'IA).
- **Le serveur fait foi.** Collections, Éclats, decks, récompenses et résultats des parties en ligne sont calculés côté serveur ; l'appli affiche et prévient avant d'envoyer.
- **Pas de framework côté client.** L'appli reconstruit l'écran en HTML à chaque changement (`render()` dans `client/src/main.js`) ; c'est simple et assez rapide pour ce jeu.
- **Tout tient en mémoire côté serveur.** Comptes, réglages et historique des parties sont chargés au démarrage puis chaque modification est écrite aussitôt dans PostgreSQL (Neon) ou, en local, dans des fichiers JSON.

## Vocabulaire

| Mot | Sens dans le code |
| --- | --- |
| Sceau | Ressource d'un tour (`P.seals`), égale au numéro du tour plus les bonus. |
| Zone | Une des 3 colonnes du plateau (`0` gauche, `1` centre, `2` droite), 4 emplacements par joueur (`SLOTS`). |
| Général | Carte de commandement du deck, avec un effet persistant ou activable une fois (`GENERALS`). |
| Terrain | 5 par deck ; 3 sont révélés aux tours 1 à 3, un par zone (`TERRAINS`, `terrainPlan`). |
| Jeton | Créature créée par un effet (Horde, Chèvre, Magot, Festin) : `token: true`, jamais dans une collection. |
| Éclats | Monnaie de la boutique (`account.shards`). Chaque doublon obtenu est converti en Éclats. |
| Prismes | Monnaie rare des arts alternatifs (`account.prisms`) : fin de saison classée, succès. Jamais convertie en Éclats ni l'inverse. |
| Essence, niveau de carte | Chaque doublon donne aussi de l'essence de cette carte (`account.essence`) ; essence et Éclats font monter la carte de niveau (`account.cardLevels`, 1 à 5), purement cosmétique : bordure, puis effet de mise en jeu. |
| Catalogue | Retouches de cartes et sets publiés depuis `/admin`, appliqués au moteur sur le serveur et dans l'appli. |
| JcJ / JcE | Partie en ligne (`pvp`) / contre l'IA (`pve`). |
