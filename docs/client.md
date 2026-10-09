# Appli et administration (`client`)

Deux pages compilées par Vite : `index.html` (l'appli des joueurs, `src/main.js`) et `admin.html` (`src/admin.js`). Pas de framework : chaque écran est une fonction qui renvoie du HTML.

## Boucle de l'appli (`main.js`)

Tout l'état de l'interface tient dans un objet `ui` : écran affiché (`ui.screen`), session (`ui.auth`), compte (`ui.account`), feuille ouverte par-dessus l'écran (`ui.sheet` : carte en grand, booster, journal, fin de partie, récompenses…), et pendant une partie la vue reçue (`ui.view`) avec la préparation en cours (`ui.pending`, `ui.moves`, `ui.genZone`).

Le principe est toujours le même : **modifier `ui`, puis appeler `render()`**. `render()` choisit la fonction de l'écran (`renderHome`, `renderGame`…), remplace le contenu de `#app`, rétablit le défilement de la main et du journal, puis lance les animations préparées (`applyFx`).

Les interactions passent par quelques écouteurs posés une fois sur `#app` (délégation) : un clic lit les attributs `data-*` de l'élément touché (`data-act="shop"`, `data-hand`, `data-zoom`, `data-z`…) et agit en conséquence. Ajouter un bouton revient donc à écrire `<button data-act="mon-action">` dans le HTML et une ligne `else if (a === 'mon-action') …` dans l'écouteur de clic.

`call(méthode, chemin, corps)` appelle l'API avec la session, garde le compte renvoyé (`setAccount`), affiche l'erreur éventuelle et renvoie à l'écran de connexion si la session a expiré.

## Écrans

| `ui.screen` | Fonction | Contenu |
| --- | --- | --- |
| `loading`, `login` | `renderLoading`, `renderLogin` | Démarrage, connexion. |
| `starter` | `renderStarter` | Choix du deck de départ (première connexion). |
| `home` | `renderHome` | Booster du jour, niveau et missions, deck joué, boutique, rang classé, parties, tutoriel et codex. |
| `collection` | `renderCollection` | Toutes les cartes, par famille, celles qui manquent grisées ; niveau de chaque carte. Une carte ouverte en grand y monte de niveau (`upgradeHTML`). |
| `shop` | `renderShop` | Cartes du jour et boosters de chaque set. |
| `decks`, `deck` | `renderDecks`, `renderDeck` | Liste des decks ; création en trois étapes (général, terrains, cartes). |
| `profile` | `renderProfile` | Pseudo, image, titre, cadre, dos, stats, succès, familles. |
| `friends` | `friends.screen` (`friends.js`) | Ajouter un ami, demandes reçues et envoyées, amis avec leur statut, défier (normal ou classé), retirer. |
| `ranked` | `renderRanked` | Mode classé : rang et saison, partie classée contre l'IA, classement de la saison (`GET /api/ranked`), récompenses de fin de saison, règles. |
| `lobby`, `game` | `renderLobby`, `renderGame` | Attente de l'adversaire (code à donner, ou ami qui choisit son deck) ; plateau. |

### Plateau (`renderGame`)

De haut en bas : barre du haut (type de partie et tour), bandeau de l'adversaire, les trois zones, votre bandeau, l'encadré d'info, la main, puis une barre collée en bas de l'écran (`.dock`) avec Quitter, les sceaux et le bouton Valider.

L'écran de partie tient sur la hauteur du téléphone (`#app.ingame`, à partir de 640 px de haut) : le plateau prend la place libre et ses cases s'agrandissent ou rétrécissent avec elle. L'encadré d'info a une hauteur fixe (`.infoslot`) : la fiche d'une carte touchée déborde vers le haut par-dessus le plateau au lieu de pousser la main, et une touche dessus la referme (`unfocus`).

- Bandeau d'un joueur (`pbar`) : image de profil dans son cadre, nom, niveau et titre sur une ligne, compteurs (sceaux de l'adversaire, main, deck, Trésor, Grâce), et à droite l'emplacement de la carte du général (`genSlot`). Toucher deux fois le général l'ouvre en grand ; le sien s'y active (zone à choisir s'il en demande une) et s'y annule. Il brille quand il peut être activé.
- Images de profil en ligne : le serveur les envoie dans `view.avatars` une seule fois par connexion et par partie, l'appli les garde dans `ui.avatars`. Contre l'IA, seule la vôtre s'affiche.
- Tour (`turnHTML`, dans la barre du haut) et sceaux (`sealsHTML`, dans `.dock`) : un point par tour, un jeton par sceau ; les jetons déjà engagés sont vides, ceux que coûterait la carte sélectionnée clignotent.
- Les cartes de la main montrent leur effet (trois lignes). Dans tous les textes d'effet, `rich(texte)` (`common.js`) échappe le texte et met les mots-clés en gras ; la liste des mots-clés est `KEYWORDS`, à compléter quand une nouvelle mécanique apparaît.

## Parties

Une partie est pilotée par un « contrôleur » qui offre `submit(plan)`, `rematch()` et `leave()`, et appelle les `handlers` de `main.js` (`onView`, `onLobby`, `onError`…) :

- `net.js` (`connectOnline`) : partie en ligne. Ouvre le WebSocket, envoie le premier message (`create`, `join` ou `rejoin`) et se reconnecte seul après une coupure (`rejoin` avec le jeton de siège).
- `goRanked` : partie classée contre l'IA, par `connectOnline` avec le message `ranked` ; le serveur joue l'IA. Pas d'écran d'attente (`ui.rankedAi`). En partie classée, `view.ranked` vaut `ai` ou `friend` : le titre l'indique, quitter demande confirmation (c'est une défaite) et l'écran de fin montre le nouveau rang (`reward.ranked`).
- `solo.js` (`startSolo`) : partie contre l'IA dans la page, avec le même moteur ; l'IA (`aiPlan`, 250 essais) prépare son tour quand le joueur valide le sien.

Pendant la préparation, l'appli refait les calculs simples pour guider le joueur (sceaux restants, emplacements libres) ; le serveur refait tout de son côté.

À chaque nouvelle vue, `viewEffects(avant, après)` compare les deux et prépare les animations (carte révélée, détruite, déplacée, puissance qui monte ou baisse, terrain révélé) et les bruitages (`sfx.js`, synthétisés avec Web Audio). Niveaux de carte : `lvCls(niveau)` ajoute la bordure (`.lv-bronze` … `.lv-astral`, `style.css`) aux cartes de la main, du plateau, aux généraux et aux cartes de la collection ; `levelIn(siège, id)` lit son niveau dans le compte, celui de l'adversaire dans `badges[siège].looks`. Une carte de niveau 5 révélée joue en plus son effet de mise en jeu (`burstAt`, bruitage `astral`). Le glisser-déposer d'une carte vers une zone s'ajoute au toucher (sélectionner, puis toucher la zone). En partie, une touche sélectionne une carte de la main ou une créature ⇄ (une deuxième la désélectionne), une touche sur une carte posée ce tour la reprend en main, et une double touche (`doubleTap`) ouvre n'importe quelle carte en grand.

## Amis (`friends.js`)

`createFriends(outils)` reçoit l'état `ui` et quelques fonctions de `main.js`, et renvoie l'écran (`screen`), le bandeau (`banner`), la feuille de choix du deck (`deckSheet`) et ses gestionnaires (`click`, `input`, `submit`), branchés au début des écouteurs de `main.js`. Son état est dans `ui.friends`.

Dès que le compte est chargé, `start()` ouvre la connexion de présence (`hello`), rouverte seule après une coupure ; `stop()` la ferme à la déconnexion. Sur `friends`, la liste est rechargée ; les images de profil des amis ne sont redemandées que si leur empreinte change.

Un bandeau en bas de l'écran (hors partie) montre le défi reçu (Accepter, Refuser), le défi envoyé (Annuler) ou un message (demande reçue, défi refusé…). Défi accepté : la feuille `friend-deck` propose les decks jouables, puis `startFriendMatch` entre dans le salon réservé avec le deck choisi (`join` avec `deck`). En attendant l'ami, l'écran `lobby` dit qu'il choisit son deck (`ui.friendFoe`).

## Tutoriel et codex

- `tutorial.js` (`startTutorial`) : partie guidée contre l'IA, sur le même modèle que `solo.js`, avec des decks, des pioches et des terrains fixés (`ME`, `FOE`) et un adversaire qui joue toujours les mêmes cartes (`FOE.plays`), pour que chaque leçon se passe comme prévu. Ni statistiques ni récompenses. Le contrôleur offre en plus `coach(ui)` (texte de l'étape et élément à mettre en valeur, affichés à la place de l'encadré d'info), `next()` (bouton Suivant) et `canSubmit(ui)` (le bouton Valider reste bloqué tant que l'étape du tour n'est pas faite). Les étapes sont dans `STEPS` ; changer une carte du tutoriel demande de relire les textes et de rejouer la partie.
- Le tutoriel est proposé une fois par compte et par appareil, à l'accueil ou au choix du deck de départ (`localStorage` `jeu-tuto-<identifiant>`), et se relance depuis « Apprendre », dans la barre du bas de l'accueil (`ui.sheet = 'learn'`).
- `codex.js` : règles de base et mots-clés (Set de base et Crépuscule) avec leur effet exact et des cartes d'exemple (`CODEX`). Ouvert depuis « Apprendre » sur l'accueil (`ui.sheet = 'codex'`) et depuis « Cartes » (bouton Mots-clés), donc aussi en partie. Une nouvelle mécanique s'y ajoute en même temps qu'à `KEYWORDS` (`common.js`).

## Catalogue côté appli

Au démarrage puis chaque fois que la version change (`account.catalog`), l'appli charge `GET /api/catalog` et l'applique au moteur (`applyCatalog`) : noms, coûts et textes affichés, et partie contre l'IA, suivent ce qui a été publié.

## Hors ligne et cache

`public/sw.js` (service worker) rend l'appli installable sur téléphone. Les fichiers de `/assets/` (leur nom contient une empreinte, ils ne changent jamais) sont servis depuis le cache ; les pages passent par le réseau, avec le cache en secours. Un changement de la constante `CACHE` efface les anciens caches. L'API et le WebSocket ne passent jamais par le cache.

`localStorage` garde la session (`jeu-auth`), le salon en cours (`jeu-session`, pour reprendre après un rechargement), le son coupé (`jeu-muted`) et le tutoriel déjà proposé (`jeu-tuto-<identifiant>`).

## Page `/admin` (`admin.js`)

Protégée par `ADMIN_KEY`, saisie une fois et gardée dans le navigateur le temps de la session (`sessionStorage`). Envoyée dans l'en-tête `X-Admin-Key`.

| Onglet | Fichier | Rôle |
| --- | --- | --- |
| Comptes | `admin.js` | Créer un compte ; fiche complète : pseudo, mot de passe, Éclats, niveau, collection, deck de départ, booster, offres, sessions, désactivation, remise à zéro, suppression. |
| Stats | `admin-stats.js` | Taux de victoire par joueur et par général, cartes les plus jouées, dernières parties. |
| Cartes, Sets | `admin-cards.js` | Brouillon du catalogue : retoucher ou créer une carte, ranger les cartes en sets, publier. |
| Boutique | `admin.js` | Prix, taille des boosters, Éclats par doublon, cartes du jour, renouvellement des offres. |
| Récompenses | `admin-rewards.js` | Courbe d'XP, gains des parties et niveaux, missions, complétions, niveaux de carte (essence par doublon, coûts de chaque niveau), succès. |

Chaque onglet séparé est une fonction (`statsTab`, `cardsTab`, `rewardsTab`) qui reçoit les outils de la page (`call`, `render`, `say`, `esc`, `notice`) et renvoie de quoi s'afficher et réagir aux clics.

## Utilitaires partagés

`common.js` : `famStyle(famille)` (variable CSS de couleur de la famille), `rich(texte)` (texte d'effet avec les mots-clés en gras) et `esc(texte)` (échappement HTML, à utiliser pour tout texte venant d'un joueur ou de l'administration : pseudo, nom de deck, carte retouchée).

Accueil (`renderHome`) : en haut, le booster à ouvrir s'il y en a un, puis un bloc « Jouer » (deck joué, partie classée, contre l'IA, avec un ami : `ui.sheet = 'play-friend'` pour créer une partie ou rejoindre avec un code), puis la progression avec les missions repliables. Le reste passe par la barre du bas (`.tabbar`) : Collection, Decks, Boutique, Amis, Apprendre. La déconnexion est dans le profil.
