# Architecture

## Les trois paquets

Le dépôt est un monorepo npm (`workspaces` dans le `package.json` racine) :

```
packages/engine   @jeu/engine   Règles, cartes, IA et toutes les données du jeu partagées. Aucune dépendance.
server            @jeu/server   Serveur HTTP + WebSocket (ws), stockage (pg), notifications (web-push). Sert aussi l'appli compilée.
client            @jeu/client   Appli web (Vite, sans framework, PixiJS pour les décors et effets) et page /admin.
```

Le moteur est importé par les deux autres sous ces noms (voir `exports` dans `packages/engine/package.json`) :

| Import | Fichier | Contenu |
| --- | --- | --- |
| `@jeu/engine` | `engine.js` | Cartes, généraux, terrains, decks préconstruits, règles, IA, vue d'une partie. |
| `@jeu/engine/collection` | `collection.js` | Deck de départ, boosters, règles de deck, sets (date de sortie, mini-sets), boutique, jour courant. |
| `@jeu/engine/catalog` | `catalog.js` | Catalogue modifiable depuis `/admin` (retouches, nouvelles cartes, sets). |
| `@jeu/engine/rewards` | `rewards.js` | Niveaux, missions, succès, récompenses de complétion, titres, cadres, dos, niveaux de carte, leçons du tutoriel. |
| `@jeu/engine/ranked` | `ranked.js` | Mode classé : paliers, divisions, étoiles, force de l'IA, saisons mensuelles. |
| `@jeu/engine/arts` | `arts.js` | Arts alternatifs : catalogue, raretés, familles d'arts, arts Promo, offres du jour, coffre, prix en Prismes. |
| `@jeu/engine/events` | `events.js` | Événements temporaires : bonus (XP, points de classé, Éclats, XP de saison), périodes, multiplicateur du jour. |
| `@jeu/engine/emotes` | `emotes.js` | Émotes en partie : catalogue, taille du sélecteur, limites d'envoi, réponses de l'IA. |
| `@jeu/engine/pass` | `pass.js` | Passe de saison : saisons, paliers gratuits et premium, missions du jour et de la semaine. |
| `@jeu/engine/themes` | `themes.js` | Thèmes de l'interface : ceux des saisons et ceux à l'effigie d'un général (prix, boutique, succès). |
| `@jeu/engine/clans` | `clans.js` | Clans : niveaux, missions de clan, dons contre des Écus, magasin. |
| `@jeu/engine/boss` | `boss.js` | Boss mondial : rotation, score, paliers, classement, magasin en Insignes. |
| `@jeu/engine/clan-boss` | `clan-boss.js` | Boss de clan : niveaux, PV communs, récompenses. |
| `@jeu/engine/story` | `story.js` | Quêtes d'histoire : campagnes et quêtes du moment, chapitres, decks adverses, récompenses. |
| `@jeu/engine/casino` | `casino.js` | Événement du casino : Jetons, machine à sous, Quitte ou double, boutique. |
| `@jeu/engine/i18n` | `i18n.js` | Traductions (`t`, `tp`, `msg`…), voir [Traduction](traduction.md). |
| `@jeu/engine/lang/en` | `lang/en/` | Dictionnaires anglais du moteur et du serveur. |

## Carte des fichiers

| Fichiers | Rôle |
| --- | --- |
| `packages/engine/src/engine.js` | Moteur de règles complet et données de toutes les cartes (pur : ni DOM ni réseau). |
| `packages/engine/src/*.js` | Données et formules partagées (tableau ci-dessus), voir [Moteur](moteur.md). |
| `packages/engine/src/sim.js`, `equilibrage.js`, `eco.js`, `empreinte.js` | Outils : `npm run sim`, `npm run equilibrage` (IA contre IA), `npm run eco` (jours pour compléter un set), `npm run empreinte` (le moteur joue-t-il toujours pareil). |
| `packages/engine/test/` | Tests du moteur (`npm test`) : données des cartes, mécaniques, parties complètes ; outils dans `aide.js`. |
| `server/src/index.js` | Point d'entrée : fichiers statiques, assemblage des routes, salons en ligne (WebSocket). |
| `server/src/*.js` | Un module par domaine (comptes, progression, parties, amis, clans, boss, quêtes, casino, courrier, Nouveautés, notifications…), voir [Serveur](serveur.md#modules). |
| `client/src/main.js` | L'appli joueur : état, écrans, partie, interactions. |
| `client/src/<écran>.js` | Écrans à part : `friends`, `clan`, `clan-boss`, `boss`, `story`, `casino`, `mail`, `news`, `history`, `tutorial`, `codex`, `themes`, `shop`, `opening`. |
| `client/src/*-stage.js`, `stage*.js` | Décors et effets PixiJS (plateau, accueil, boutique, ouvertures, fin de partie), chargés à la demande et seulement avec WebGL. |
| `client/src/*.css` | `style.css` (mise en page), `habillage.css` (apparence), une feuille par écran ou par thème (`halloween.css`, `cyber.css`, `themes.css`…). |
| `client/src/admin*.js` | Page `/admin` : un fichier par onglet. |
| `client/src/art/` | Illustrations des cartes, des arts alternatifs et des terrains (voir `client/src/art/LISEZMOI.md`). |
| `client/public/` | Icônes, manifeste PWA, service worker (cache, notifications), musiques (`music/`). |
| `client/vignettes.js` | Réduit les illustrations en vignettes de 640 px à la compilation. |
| `scripts/i18n.js` | `npm run i18n` : textes sans traduction. |

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
2. B envoie `join` avec le code : la partie démarre avec le deck demandé par chacun (`deck`), sinon son deck joué (`startMatch`).
3. Chaque joueur prépare son tour dans l'appli, puis envoie `plan` (cartes posées, déplacements, général). Quand les deux plans sont arrivés, le serveur résout le tour avec `runTurn` et diffuse chaque étape de révélation (`state`) avec une petite pause pour l'animation.
4. Chaque joueur ne reçoit que `viewFor(st, siège)` : jamais la main ni les cartes cachées de l'adversaire.
5. En fin de partie, le serveur enregistre la partie et les récompenses de chaque compte, puis les envoie avec l'état final.

Reprise après une coupure réseau : le siège reste gardé au joueur. Une page rechargée, ou une connexion perdue, renvoie `rejoin` avec le jeton gardé dans `localStorage` (`net.js` réessaie après 1 s, 2 s, 4 s puis toutes les 8 s, et tout de suite quand le réseau revient ou que l'appli repasse au premier plan). Une connexion morte sans fermeture est repérée des deux côtés : l'appli envoie `ping` toutes les 10 s et se reconnecte sans réponse depuis 25 s ; le serveur ferme les connexions qui ne répondent plus à ses pings WebSocket (30 s), pour que l'adversaire voie le joueur déconnecté. Un tour validé pendant la coupure (ou perdu avec elle) est renvoyé au premier état reçu après la reconnexion. Pendant la coupure, un bandeau le dit au joueur et à son adversaire. Un joueur qui ne revient pas dans les 60 secondes perd par forfait (`forfeitGame`) et l'autre gagne, avec ses récompenses habituelles ; contre l'IA classée, c'est l'IA qui gagne. Si les deux sont déconnectés, personne ne gagne, et le compte à rebours reprend pour celui qui manque encore quand l'autre revient. Un salon inactif depuis 2 heures est supprimé.

## Partie contre l'IA

Deux cas :

- **Dans le navigateur** : partie libre contre l'IA (`client/src/solo.js`), tutoriel, chapitres des quêtes d'histoire et tables de Quitte ou double (casino). Le même moteur tourne dans la page : l'IA choisit son plan avec `aiPlan`, puis `runTurn` résout le tour. Seul le résultat est envoyé au serveur (`POST /api/games/solo` avec le détail pour l'historique, `POST /api/story/win`, `POST /api/casino/table/result`), qui calcule les récompenses de son côté.
- **Sur le serveur** : partie classée, boss mondial et boss de clan (messages WebSocket `ranked`, `boss`, `clanboss`). Le serveur y tient le siège de l'IA comme celui d'un joueur, pour que le résultat fasse foi.

## Appels d'API

L'appli appelle `/api/...` en JSON avec les en-têtes `Authorization: Bearer <session>` et `X-Lang` (sa langue) (`client/src/api.js`) ; `/admin` envoie `X-Admin-Key`. Le routeur (`apiHandler` dans `server/src/accounts.js`) vérifie la session ou la clé d'administration, lit le corps, appelle la route et renvoie `{ ... }` ou `{ error }` avec le bon code HTTP. La plupart des routes renvoient aussi `account`, le compte à jour, que l'appli garde tel quel.

## Hébergement

- **Render** (`render.yaml`) : un seul service web gratuit. `npm install && npm run build` compile l'appli dans `client/dist`, puis `npm start` lance `server/src/index.js`, qui sert l'appli, l'API et les WebSockets sur le même port. `/health` sert au contrôle de santé.
- **Neon** : la base PostgreSQL gratuite donnée par `DATABASE_URL`. Les trois tables sont créées au démarrage si elles manquent (voir [Serveur](serveur.md#stockage)).
- **Variables d'environnement** : `DATABASE_URL` (base), `ADMIN_KEY` (clé de `/admin`), `PORT` (fourni par Render), `DATA_FILE` (fichier local des comptes, facultatif), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` (notifications push, facultatives : sans elles le serveur crée ses clés et les garde dans la base). Render pose aussi `RENDER` (avertit si la base manque), `RENDER_EXTERNAL_URL` (contact des notifications) et `RENDER_GIT_COMMIT` (version jointe aux signalements de bugs).
- **GitHub Actions** (`.github/workflows/tests.yml`) : `npm test` à chaque pull request et à chaque push sur `main`, sans installation (le moteur n'a aucune dépendance). Le déploiement Render n'en dépend pas.
- **En local** : `npm run dev` lance le serveur (port 8787, rechargé à chaque modification) et Vite (port 5173), qui renvoie `/api` et `/ws` vers le serveur.

## Performances

Ce qui a été mesuré et réglé :

- **IA** : chaque essai de plan copie l'état de la partie pour le simuler. La copie ne prend plus le journal et n'utilise plus `structuredClone`, et le calcul de puissance ne crée plus de tableaux intermédiaires : l'IA est environ 2,4 fois plus rapide (même résultat au coup près, vérifié avec `npm run empreinte`). C'est sensible sur téléphone, où l'IA tourne dans la page.
- **Fichiers de l'appli** : les textes (HTML, JS, CSS) sont lus et compressés (brotli et gzip) une seule fois par le serveur et gardés en mémoire ; les images et musiques sont lues sur le disque à chaque demande. Les fichiers de `/assets/` (nom avec empreinte) sont gardés un an par le navigateur ; le code et les styles sont aussi servis depuis le cache du service worker.
- **API** : les réponses de plus de 2 Ko sont compressées ; la vérification des mots de passe (scrypt) ne bloque plus les parties en cours.
- **Appli** : PixiJS et les décors ne se chargent qu'au premier besoin (et jamais sans WebGL) ; la collection prend des vignettes de 640 px (`client/vignettes.js`) et ne dessine que les cartes visibles (`content-visibility`) ; un écran qui ne change pas n'est pas reconstruit quand seule une fenêtre s'ouvre ou se ferme par-dessus (`render()`) ; les cosmétiques dessinés (`cosmetics.js`) sont gardés en cache d'une visite à l'autre.
