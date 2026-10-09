# Serveur (`server`)

Un seul processus Node : `server/src/index.js` sert l'appli compilée, l'API JSON sous `/api` et les parties en ligne sur `/ws`. Il dépend de `ws` (WebSocket) et `pg` (PostgreSQL).

Au démarrage, dans l'ordre : ouverture du stockage, chargement des comptes (avec mises à niveau des anciens comptes), application du catalogue publié, vérification des complétions et succès déjà atteints (`syncAll`), puis écoute du port.

## Stockage

`store.js` choisit le support :

- **`DATABASE_URL` défini** (production, Neon) : PostgreSQL, pool de 3 connexions, SSL sauf en local. Trois tables, créées si elles manquent :

  | Table | Colonnes | Contenu |
  | --- | --- | --- |
  | `comptes` | `login` (clé), `data` (jsonb), `updated_at` | Un compte entier par ligne. |
  | `reglages` | `cle` (clé), `data` (jsonb), `updated_at` | Documents de réglages, voir ci-dessous. |
  | `parties` | `id`, `data` (jsonb), `created_at` | Une partie terminée par ligne (stats). |

- **Sinon** (développement) : fichiers `server/data/comptes.json`, `reglages.json` et `parties.json`, réécrits en entier à chaque changement (écriture dans un fichier temporaire puis renommage).

Tout est chargé en mémoire au démarrage. Le reste du serveur ne voit que l'interface du store : `get(login)`, `all()`, `put(compte)`, `remove(login)`, `doc(clé)`, `putDoc(clé, data)`, `games()`, `addGame(partie)`. Chaque modification est écrite aussitôt.

Documents de la table `reglages` :

| Clé | Écrit par | Contenu |
| --- | --- | --- |
| `jeu` | onglet Boutique | Prix, cartes par booster, Éclats par doublon, cartes du jour, `rotation`. |
| `recompenses` | onglet Récompenses | Valeurs qui remplacent `DEFAULT_REWARDS`, missions, Éclats des succès. |
| `brouillon` | onglets Cartes et Sets | Catalogue en cours de modification. |
| `catalogue` | « Publier dans le jeu » | Catalogue publié, appliqué au moteur. |

## Compte joueur

Un compte est un objet JSON (colonne `data`) :

| Champ | Contenu |
| --- | --- |
| `login`, `name`, `avatar` | Identifiant, pseudo, image de profil (data URL de 160 px, 60 Ko au plus). |
| `pass` | `{ salt, hash }` (scrypt). Jamais envoyé à l'appli. |
| `tokens` | Sessions ouvertes (10 au plus ; la plus ancienne est fermée au-delà). |
| `disabled`, `created` | Compte désactivé, date de création. |
| `starter` | Deck de départ choisi (`null` avant le premier choix). |
| `cards` | Collection : `{ id: 1 }` (un exemplaire ; les doublons deviennent des Éclats). |
| `shards` | Éclats. |
| `decks`, `active` | Jusqu'à 5 decks `{ id, name, general, terrains, cards }` ; identifiant du deck joué. |
| `lastBooster` | Jour du dernier booster quotidien ouvert. |
| `shop` | Par set : `{ date, rotation, offers, bought }`, les cartes du jour du joueur. |
| `level`, `xp`, `freeBoosters` | Niveau, XP vers le niveau suivant, boosters offerts à ouvrir. |
| `stats` | Compteurs des succès : parties, victoires, séries, missions, victoires par famille, parties du jour. |
| `missions` | `{ date, rerolls, list }` : les missions du jour. |
| `achievements`, `completed` | Succès obtenus ; familles (`set:famille`) et sets complétés, avec leur date. |
| `cosmetics`, `title`, `frame`, `back` | Titres, cadres et dos débloqués ; ceux qui sont portés. |
| `inbox` | Récompenses gagnées à montrer au joueur (40 au plus), vidée quand il les a vues. |

Les anciens comptes sont mis à niveau au démarrage (`accounts.js` : `convertDuplicates`, `migrateDecks`, `grantStarterGenerals`, `progress.init`) ; rien n'est jamais supprimé de la base par ces mises à niveau.

## Modules

| Fichier | Rôle |
| --- | --- |
| `accounts.js` | `createAccounts(store)` : sessions, connexion, deck de départ, booster quotidien, boutique, decks, profil, administration des comptes et de la boutique. `apiHandler` : le routeur de l'API. |
| `progress.js` | `createProgress(store)` : XP et niveaux, missions, succès, complétions, cosmétiques, réglages des récompenses. Appelé par `accounts.js` (nouvelles cartes, booster, fin de partie). |
| `games.js` | `createGames(store, accounts)` : enregistre les parties (JcJ par le serveur, JcE envoyées par l'appli), calcule les stats de `/admin` et du profil. |
| `cards.js` | `createCatalog(store, accounts)` : brouillon du catalogue, publication (refusée si elle retire une carte qu'un joueur possède), catalogue public. |
| `index.js` | Assemble le tout, sert les fichiers, gère les salons et les WebSockets. |

Chaque module renvoie ses routes sous la forme `{ 'MÉTHODE /chemin': (compte, corps, session, url) => réponse }`, ajoutées au routeur.

## API

Toutes les routes répondent en JSON. Une erreur renvoie `{ error: "message lisible" }` avec un code HTTP (`HttpError` dans le code). Les réponses de plus de 2 Ko sont compressées si le navigateur l'accepte.

**Sans session** : `POST /api/login` (`{ login, password }` → `{ token, account }`), `GET /api/catalog`.

**Avec session** (`Authorization: Bearer <token>`) :

| Route | Effet |
| --- | --- |
| `GET /api/me` | Compte du joueur (`account`), avec sa progression et la version du catalogue. |
| `POST /api/logout` | Ferme la session. |
| `POST /api/starter` | Choisit le deck de départ (`{ starter }`), une seule fois. |
| `POST /api/booster` | Ouvre le booster du jour. |
| `PUT /api/decks` | Crée (sans `id`) ou enregistre un deck, même incomplet ; `play: true` le rend joué s'il est complet. |
| `POST /api/decks/rename`, `/play`, `/reset`, `/delete` | Renomme, joue, vide ou supprime un deck (`{ id }`). |
| `PUT /api/deck` | Ancienne route : enregistre le deck joué. |
| `PUT /api/profile` | Pseudo et/ou image de profil. |
| `GET /api/profile` | Stats du joueur, succès, avancement des familles et des sets. |
| `GET /api/shop` | Boutique : prix et offres du jour par set. |
| `POST /api/shop/card`, `/api/shop/booster` | Achète une carte du jour ou un booster (`free: true` : booster offert). |
| `POST /api/missions/reroll` | Remplace une mission (`{ index }`). |
| `POST /api/rewards/seen` | Vide la boîte de récompenses. |
| `PUT /api/cosmetics` | Change le titre, le cadre ou le dos de carte porté. |
| `POST /api/games/solo` | Résultat d'une partie contre l'IA → récompenses. |

**Administration** (en-tête `X-Admin-Key: <ADMIN_KEY>`, comparé en temps constant ; sans `ADMIN_KEY` sur le serveur, tout `/api/admin/` répond 503) :

| Route | Effet |
| --- | --- |
| `GET /api/admin/accounts`, `POST /api/admin/accounts` | Liste des comptes ; création ou changement de mot de passe. |
| `GET /api/admin/account?login=` | Fiche complète d'un compte. |
| `POST /api/admin/account/update`, `/cards`, `/starter`, `/reset`, `/booster`, `/shop`, `/logout`, `/delete` | Modifier un compte (pseudo, Éclats, niveau, boosters offerts, désactivation), sa collection, son deck de départ ; le remettre à zéro ; rendre le booster du jour ; renouveler ses offres ; fermer ses sessions ; le supprimer. |
| `GET/POST /api/admin/settings` | Réglages de la boutique (`renew: true` renouvelle les offres de tous). |
| `GET/POST /api/admin/rewards` | Réglages des récompenses (`reset: true` revient aux valeurs par défaut). |
| `GET /api/admin/stats?mode=&days=` | Stats des parties (`all`, `pvp`, `pve` ; sur N jours, 0 = tout). |
| `GET/PUT /api/admin/catalog`, `POST …/publish`, `POST …/discard` | Brouillon du catalogue, publication, abandon du brouillon. |

## Parties en ligne (WebSocket `/ws`)

Messages JSON, champ `t` pour le type.

| De l'appli | Contenu | Réponse |
| --- | --- | --- |
| `create` | `{ auth }` (session) | `lobby` |
| `join` | `{ room, auth }` | `lobby` aux deux, puis `state` (la partie démarre) |
| `rejoin` | `{ room, token }` (jeton du `lobby`) | `state` ou `lobby` ; `gone` si le salon n'existe plus |
| `plan` | `{ cards: [{ uid, zone }], moves: [{ uid, zone }], general }` | `state` (attente de l'autre, puis chaque étape de la révélation) |
| `rematch` | | Nouvelle partie quand les deux l'ont demandée |
| `leave` | | `left` à l'adversaire, salon supprimé |

| Du serveur | Contenu |
| --- | --- |
| `lobby` | `{ room, seat, token, names }` |
| `state` | `{ room, view }` : `viewFor` + `flash` (carte à animer), `ready`, `names`, `connected`, `badges` (titre, cadre, dos, niveau), `reward` (fin de partie) |
| `error` | `{ msg }` (session expirée, deck injouable, code inconnu, salon complet) |
| `gone`, `left` | Salon expiré, adversaire parti |

Un salon (`rooms` dans `index.js`) garde ses deux sièges (compte, deck, jeton, socket), l'état de la partie `st`, les plans reçus et les demandes de revanche. Chaque joueur joue le deck enregistré sur son compte au début de chaque partie (revanche comprise). Les plans reçus sont nettoyés par `applyPlan` : une carte absente de la main, trop chère, ou posée dans une zone pleine est ignorée, de même qu'un déplacement impossible. Les salons inactifs depuis 2 heures sont supprimés chaque minute ; ils ne survivent pas à un redémarrage du serveur.

## Progression

- **Fin de partie** (`progress.onGame`) : statistiques, XP et Éclats selon le mode et le résultat (pour les `gamesPerDay` premières parties du jour), avancement des missions, montée de niveau (Éclats à chaque niveau, booster offert tous les `boosterEvery` niveaux), succès.
- **Nouvelles cartes** (`progress.onCards`) : XP par carte nouvelle, puis vérification des familles et sets complétés (carte unique, titre, dos ou cadre, Éclats, boosters offerts).
- **Missions** : tirées chaque jour parmi celles activées, une peut être remplacée par jour.
- Chaque récompense passe par `grant`, qui l'applique au compte et la range dans `inbox`.

## Sécurité

- Mots de passe hachés avec scrypt et un sel par compte ; vérification asynchrone (ne bloque pas les parties en cours).
- Sessions : jetons aléatoires de 24 octets, 10 par compte au plus. Désactiver un compte ou changer son mot de passe ferme ses sessions.
- Corps de requête limité à 100 Ko ; image de profil vérifiée (format et taille).
- L'adversaire ne reçoit jamais la main ni les cartes cachées ; toutes les règles sont appliquées côté serveur.
- La partie contre l'IA tourne chez le joueur : son résultat n'est pas vérifiable par le serveur, qui en limite l'effet (récompenses plafonnées par jour, deck du compte utilisé).
