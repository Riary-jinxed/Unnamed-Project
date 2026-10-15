# Documentation du code

Ce dossier explique comment le jeu est construit, pour pouvoir le modifier sans tout relire. Le [README principal](../README.md) reste le guide d'installation, de mise en ligne et de jeu.

| Page | Contenu |
| --- | --- |
| [Architecture](architecture.md) | Vue d'ensemble : les trois paquets, qui fait quoi, comment une partie et un appel d'API circulent, l'hébergement, les tests sur GitHub, les performances. |
| [Moteur de règles](moteur.md) | `packages/engine` : état d'une partie, déroulé d'un tour, crochets des cartes, IA, collection, catalogue, récompenses, outils d'équilibrage. |
| [Serveur](serveur.md) | `server` : stockage (Neon ou fichier), comptes et sessions, routes de l'API, salons en ligne et protocole WebSocket, progression, statistiques. |
| [Appli et administration](client.md) | `client` : rendu de l'appli, écrans, partie en ligne et contre l'IA, animations, service worker, page `/admin`. |
| [Traduction](traduction.md) | Français et anglais : écrire un texte traduisible, dictionnaires, `npm run i18n`, lexique anglais. |
| [Musiques](musique.md) | Musiques d'ambiance : fichiers attendus, ordre de préférence, lecture. |
| [Prompts Suno](prompts-suno.md) | Prompts prêts à coller pour créer chaque musique. |
| [Recettes](recettes.md) | Vérifier qu'un changement ne casse rien (tests, empreinte, compilation, traductions) ; ajouter une carte, un test, un général, un terrain, un set, un art, un thème, une saison, un événement, une annonce, une mission, un succès, une route. |
| [Illustrations](../client/src/art/LISEZMOI.md) | Gabarit et rangement des images des cartes, des terrains et des arts alternatifs. |

## En deux minutes

- **Un seul langage, un seul moteur.** Tout est en JavaScript (modules ES, Node 20+). Les règles vivent dans `packages/engine/src/engine.js`, utilisé tel quel par le serveur (parties en ligne) et par le navigateur (partie contre l'IA).
- **Le serveur fait foi.** Collections, Éclats, decks, récompenses et résultats des parties en ligne sont calculés côté serveur ; l'appli affiche et prévient avant d'envoyer.
- **Pas de framework côté client.** L'appli reconstruit l'écran en HTML à chaque changement (`render()` dans `client/src/main.js`) ; c'est simple et assez rapide pour ce jeu. PixiJS (WebGL) ne sert qu'aux décors et aux effets, chargé à la demande.
- **Les tests portent sur le moteur.** `npm test` rejoue les mécaniques, contrôle toutes les cartes et joue une partie par deck ; GitHub les lance à chaque pull request.
- **Tout tient en mémoire côté serveur.** Comptes, réglages et historique des parties sont chargés au démarrage puis chaque modification est écrite aussitôt dans PostgreSQL (Neon) ou, en local, dans des fichiers JSON.

## Vocabulaire

| Mot | Sens dans le code |
| --- | --- |
| Sceau | Ressource d'un tour (`P.seals`), égale au numéro du tour plus les bonus. |
| Zone | Une des 3 colonnes du plateau (`0` gauche, `1` centre, `2` droite), 4 emplacements par joueur (`SLOTS`). |
| Général | Carte de commandement du deck, avec un effet persistant ou activable une fois (`GENERALS`). |
| Terrain | 5 par deck ; 3 sont révélés aux tours 1 à 3, un par zone (`TERRAINS`, `terrainPlan`). |
| Jeton | Créature créée par un effet (Horde, Chèvre, Magot, Festin) : `token: true`, jamais dans une collection (rien à voir avec les Jetons du casino). |
| Éclats | Monnaie de la boutique (`account.shards`). Chaque doublon obtenu est converti en Éclats. |
| Prismes | Monnaie rare des arts alternatifs (`account.prisms`) : fin de saison classée, succès, calendrier du mois. Se change en Éclats par offres fixes (`exchangeOffers` : 10, 30, 60 ou 120 Prismes à `prismShards` Éclats l'unité, avec 0, 10, 20 ou 30 % de bonus), jamais l'inverse. |
| Jetons | Monnaie de l'événement du casino (`account.casino.chips`, `casino.js`) : gagnée avec la quête, la machine à sous et Quitte ou double, dépensée à la boutique du casino ; perdue quand la boutique ferme. |
| Insignes | Monnaie du boss mondial (`account.bossCoins`), gagnées avec les paliers des tentatives et le classement de la semaine, dépensées au magasin du boss. |
| Écus | Monnaie du clan (`account.clanCoins`), gagnée avec les missions de clan et les dons, dépensée au magasin du clan. |
| Coffre offert | Coffre d'arts ouvert sans Prismes (`account.freeChests`) : succès rares (`chests` dans `ACHIEVEMENTS`), dimanches du calendrier. |
| Calendrier | Récompenses de connexion du mois (`account.calendar = { month, days }`, `loginReward`) : un jour manqué est perdu, remis à zéro chaque mois. |
| Bienvenue | Sept cadeaux des nouveaux comptes (`account.welcome = { start, days }`, `welcomeReward`) : un par jour de connexion distinct, pas forcément consécutif, dans les `welcomeWindow` jours qui suivent la création ; le 7e donne le Cadre de bienvenue et le titre « Recrue prometteuse ». Les comptes créés avant n'y ont pas droit (sauf si /admin l'offre). |
| Essence, niveau de carte | Chaque doublon donne aussi de l'essence de cette carte (`account.essence`) ; essence et Éclats font monter la carte de niveau (`account.cardLevels`, 1 à 5), purement cosmétique : bordure, puis effet de mise en jeu. Le niveau vaut pour tous les arts de la carte ; sa bordure se choisit parmi celles des niveaux atteints (`account.lvLook`). |
| Points de classé (PC) | Étoiles du mode classé (`ranked.r` du compte, `ranked.js`) : 3 par division, 3 divisions par palier, puis des points sans plafond en Maître. « PC » est le nom court du bonus d'événement `ranked`. |
| Thème | Habillage de toute l'appli (`<body data-season>`) : celui de la saison du passe ou un thème à l'effigie d'un général (`themes.js`). Débloqués dans `account.cosmetics.themes`, porté dans `account.uiTheme`. |
| Événement | Bonus temporaire réglé dans `/admin` (`events.js` : XP, PC, Éclats ou XP de saison multipliés sur une période). Ne pas confondre avec les quêtes d'événement (`story.js`, à durée limitée) ni avec l'événement du casino. |
| Catalogue | Retouches de cartes et sets publiés depuis `/admin`, appliqués au moteur sur le serveur et dans l'appli. |
| JcJ / JcE | Partie en ligne (`pvp`) / contre l'IA (`pve`). |
