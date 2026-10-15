# Architecture

## Les trois paquets

Le dépôt est un monorepo npm (`workspaces` dans le `package.json` racine) :

```
packages/engine   @jeu/engine   Règles, cartes, IA, collection, catalogue, récompenses. Aucune dépendance.
server            @jeu/server   Serveur HTTP + WebSocket (ws), stockage (pg). Sert aussi l'appli compilée.
client            @jeu/client   Appli web (Vite, sans framework) et page /admin.
```

Le moteur est importé par les deux autres sous ces noms (voir `exports` dans `packages/engine/package.json`) :

| Import | Fichier | Contenu |
| --- | --- | --- |
| `@jeu/engine` | `engine.js` | Cartes, généraux, terrains, decks préconstruits, règles, IA, vue d'une partie. |
| `@jeu/engine/collection` | `collection.js` | Deck de départ, boosters, règles de deck, sets, boutique, jour courant. |
| `@jeu/engine/catalog` | `catalog.js` | Catalogue modifiable depuis `/admin` (retouches, nouvelles cartes, sets). |
| `@jeu/engine/rewards` | `rewards.js` | Niveaux, missions, succès, récompenses de complétion, titres, cadres, dos. |
| `@jeu/engine/arts` | `arts.js` | Arts alternatifs : catalogue, raretés, arts Promo, offres du jour, coffre, prix en Prismes. |
| `@jeu/engine/events` | `events.js` | Événements temporaires : bonus (XP, points de classé, Éclats, XP de saison), périodes (week-end, dernier week-end, dernière semaine du mois, dates), multiplicateur du jour. |
| `@jeu/engine/emotes` | `emotes.js` | Émotes en partie : catalogue (offertes, boutique, succès), taille du sélecteur, limites d'envoi, réponses de l'IA. |
| `@jeu/engine/pass` | `pass.js` | Passe de saison : saisons (cartes, cosmétiques, missions, arts Promo), paliers gratuits et premium, missions du jour et de la semaine. |
| `@jeu/engine/themes` | `themes.js` | Thèmes de l'interface : ceux des saisons et ceux à l'effigie d'un général (prix, ou succès qui le donne). |

## Carte des fichiers

| Fichier | Lignes | Rôle |
| --- | ---: | --- |
| `packages/engine/src/engine.js` | ~1000 | Moteur de règles complet et données de toutes les cartes. |
| `packages/engine/src/collection.js` | ~110 | Collection d'un joueur, boosters, validation des decks, sets et boutique par défaut. |
| `packages/engine/src/catalog.js` | ~100 | Validation et application du catalogue publié depuis `/admin`. |
| `packages/engine/src/rewards.js` | ~130 | Données et formules de progression (partagées par serveur et appli). |
| `packages/engine/src/sim.js` | 40 | `npm run sim` : taux de victoire IA contre IA, par deck ou par général. |
| `packages/engine/src/eco.js` | ~100 | `npm run eco` : jours nécessaires pour compléter un set selon le profil de joueur. |
| `packages/engine/src/empreinte.js` | ~30 | `npm run empreinte` : empreinte de parties à hasard fixé, pour vérifier qu'un nettoyage ne change pas le jeu. |
| `server/src/index.js` | ~165 | Point d'entrée : fichiers statiques, API, salons en ligne (WebSocket). |
| `server/src/store.js` | ~80 | Stockage : PostgreSQL si `DATABASE_URL`, sinon fichiers JSON. |
| `server/src/accounts.js` | ~410 | Comptes, sessions, deck de départ, boosters, boutique, decks, profil, administration, routeur de l'API. |
| `server/src/progress.js` | ~235 | XP, niveaux, missions, succès, complétions, cosmétiques. |
| `server/src/games.js` | ~90 | Historique des parties, statistiques admin et profil. |
| `server/src/friends.js` | ~170 | Amis, présence en ligne et défis entre amis. |
| `server/src/arts.js` | ~75 | Arts alternatifs : offres du jour, coffre, choix de l'art d'une carte, dons depuis `/admin`. |
| `server/src/cards.js` | ~50 | Brouillon et publication du catalogue de cartes. |
| `client/src/main.js` | ~1000 | Toute l'appli joueur : état, écrans, partie, animations, interactions. |
| `client/src/net.js` | 75 | Connexion WebSocket avec reconnexion automatique. |
| `client/src/friends.js` | ~180 | Écran des amis, bandeau de défi, choix du deck pour une partie entre amis. |
| `client/src/solo.js` | 25 | Partie contre l'IA, entièrement dans le navigateur. |
| `client/src/history.js` | ~170 | Onglet Historique du profil : bilan du joueur, dernières parties et détail de chacune (pas de replay). |
| `client/src/api.js` | 10 | Appel JSON à l'API avec la session. |
| `client/src/common.js` | 10 | Couleur de famille et échappement HTML, partagés par l'appli et `/admin`. |
| `client/src/sfx.js` | ~70 | Bruitages synthétisés (Web Audio). |
| `client/src/opening.js` | ~200 | Ouverture d'un booster (paquet à déchirer, cartes retournées une à une) et d'un coffre d'arts (coffre à frapper), avec `opening.css`. |
| `client/src/opening-stage.js` | ~210 | Effets PixiJS de ces ouvertures (étincelles, rayons, lumière), seulement avec WebGL. |
| `client/src/end-stage.js` | ~300 | Écran de fin de partie sur PixiJS : récompenses qui défilent, barre de niveau, étoiles du classé, seulement avec WebGL. |
| `client/src/shop.js` | ~65 | Étal de la boutique (boosters, coffre), vitrines des sélections du jour, chargement de leurs décors PixiJS. |
| `client/src/shop-stage.js` | ~290 | Décors PixiJS de la boutique : étal (auvent, lanternes, rayons) et vitrines (velours, projecteurs), poussière, éclats au toucher. |
| `client/src/admin*.js` | ~720 | Page `/admin` : comptes, boutique, stats, cartes et sets, récompenses. |
| `client/src/style.css` | | Styles de l'appli et de `/admin` (thème clair et sombre). |
| `client/public/` | | Icône, manifeste PWA, service worker. |

## Partie en ligne

```
Appli A ──ws──┐                         ┌──ws── Appli B
              │   server/src/index.js   │
   create ───►│  salon { code, seats,   │◄─── join (code)
              │    st, plans, rematch } │
   plan ─────►│  quand les 2 plans sont │◄──── plan
              │  là : runTurn(st, …)    │
   ◄── state ─┤  viewFor(st, siège)     ├─ state ──►
```

1. Le joueur A envoie `create` avec sa session : le serveur crée un salon avec un code de 4 lettres et lui renvoie `lobby` (code, siège, jeton de reconnexion).
2. B envoie `join` avec le code : la partie démarre avec le deck joué de chaque compte (`startMatch`).
3. Chaque joueur prépare son tour dans l'appli, puis envoie `plan` (cartes posées, déplacements, général). Quand les deux plans sont arrivés, le serveur résout le tour avec `runTurn` et diffuse chaque étape de révélation (`state`) avec une petite pause pour l'animation.
4. Chaque joueur ne reçoit que `viewFor(st, siège)` : jamais la main ni les cartes cachées de l'adversaire.
5. En fin de partie, le serveur enregistre la partie et les récompenses de chaque compte, puis les envoie avec l'état final.

Reprise après une coupure réseau : le siège reste gardé au joueur. Une page rechargée, ou une connexion perdue, renvoie `rejoin` avec le jeton gardé dans `localStorage` (`net.js` réessaie après 1 s, 2 s, 4 s puis toutes les 8 s, et tout de suite quand le réseau revient ou que l'appli repasse au premier plan). Une connexion morte sans fermeture est repérée des deux côtés : l'appli envoie `ping` toutes les 10 s et se reconnecte sans réponse depuis 25 s ; le serveur ferme les connexions qui ne répondent plus à ses pings WebSocket (30 s), pour que l'adversaire voie le joueur déconnecté. Un tour validé pendant la coupure (ou perdu avec elle) est renvoyé au premier état reçu après la reconnexion. Pendant la coupure, un bandeau le dit au joueur et à son adversaire. Un joueur qui ne revient pas dans les 60 secondes perd par forfait (`forfeitGame`) et l'autre gagne, avec ses récompenses habituelles ; contre l'IA classée, c'est l'IA qui gagne. Si les deux sont déconnectés, personne ne gagne, et le compte à rebours reprend pour celui qui manque encore quand l'autre revient. Un salon inactif depuis 2 heures est supprimé.

## Partie contre l'IA

Elle tourne entièrement dans le navigateur (`client/src/solo.js`) avec le même moteur : l'IA choisit son plan avec `aiPlan`, puis `runTurn` résout le tour. Seuls le résultat et le détail de la partie pour l'historique (`gameDetail`) sont envoyés au serveur (`POST /api/games/solo`), qui l'enregistre et calcule les récompenses à partir du deck enregistré sur le compte.

## Appels d'API

L'appli appelle `/api/...` en JSON avec l'en-tête `Authorization: Bearer <session>` (`client/src/api.js`). Le routeur (`apiHandler` dans `server/src/accounts.js`) vérifie la session ou la clé d'administration, lit le corps, appelle la route et renvoie `{ ... }` ou `{ error }` avec le bon code HTTP. La plupart des routes renvoient aussi `account`, le compte à jour, que l'appli garde tel quel.

## Hébergement

- **Render** (`render.yaml`) : un seul service web gratuit. `npm install && npm run build` compile l'appli dans `client/dist`, puis `npm start` lance `server/src/index.js`, qui sert l'appli, l'API et les WebSockets sur le même port. `/health` sert au contrôle de santé.
- **Neon** : la base PostgreSQL gratuite donnée par `DATABASE_URL`. Les trois tables sont créées au démarrage si elles manquent (voir [Serveur](serveur.md#stockage)).
- **Variables d'environnement** : `DATABASE_URL` (base), `ADMIN_KEY` (clé de `/admin`), `PORT` (fourni par Render), `DATA_FILE` (fichier local des comptes, facultatif), `RENDER` (posée par Render : avertit si la base manque).
- **En local** : `npm run dev` lance le serveur (port 8787, rechargé à chaque modification) et Vite (port 5173), qui renvoie `/api` et `/ws` vers le serveur.

## Performances

Ce qui a été mesuré et réglé :

- **IA** : chaque essai de plan copie l'état de la partie pour le simuler. La copie ne prend plus le journal et n'utilise plus `structuredClone`, et le calcul de puissance ne crée plus de tableaux intermédiaires : l'IA est environ 2,4 fois plus rapide (même résultat au coup près, vérifié avec `npm run empreinte`). C'est sensible sur téléphone, où l'IA tourne dans la page.
- **Fichiers de l'appli** : les textes (HTML, JS, CSS) sont lus et compressés (brotli et gzip) une seule fois par le serveur et gardés en mémoire ; les images et musiques sont lues sur le disque à chaque demande. Les fichiers de `/assets/` (nom avec empreinte) sont gardés un an par le navigateur ; le code et les styles sont aussi servis depuis le cache du service worker.
- **API** : les réponses de plus de 2 Ko sont compressées ; la vérification des mots de passe (scrypt) ne bloque plus les parties en cours.
