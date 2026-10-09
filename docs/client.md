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
| `home` | `renderHome` | Booster du jour, niveau et missions, deck joué, boutique, parties. |
| `collection` | `renderCollection` | Toutes les cartes, par famille, celles qui manquent grisées. |
| `shop` | `renderShop` | Cartes du jour et boosters de chaque set. |
| `decks`, `deck` | `renderDecks`, `renderDeck` | Liste des decks ; création en trois étapes (général, terrains, cartes). |
| `profile` | `renderProfile` | Pseudo, image, titre, cadre, dos, stats, succès, familles. |
| `lobby`, `game` | `renderLobby`, `renderGame` | Attente de l'adversaire ; plateau. |

## Parties

Une partie est pilotée par un « contrôleur » qui offre `submit(plan)`, `rematch()` et `leave()`, et appelle les `handlers` de `main.js` (`onView`, `onLobby`, `onError`…) :

- `net.js` (`connectOnline`) : partie en ligne. Ouvre le WebSocket, envoie le premier message (`create`, `join` ou `rejoin`) et se reconnecte seul après une coupure (`rejoin` avec le jeton de siège).
- `solo.js` (`startSolo`) : partie contre l'IA dans la page, avec le même moteur ; l'IA (`aiPlan`, 250 essais) prépare son tour quand le joueur valide le sien.

Pendant la préparation, l'appli refait les calculs simples pour guider le joueur (sceaux restants, emplacements libres) ; le serveur refait tout de son côté.

À chaque nouvelle vue, `viewEffects(avant, après)` compare les deux et prépare les animations (carte révélée, détruite, déplacée, puissance qui monte ou baisse, terrain révélé) et les bruitages (`sfx.js`, synthétisés avec Web Audio). Le glisser-déposer d'une carte vers une zone s'ajoute au toucher (sélectionner, puis toucher la zone).

## Catalogue côté appli

Au démarrage puis chaque fois que la version change (`account.catalog`), l'appli charge `GET /api/catalog` et l'applique au moteur (`applyCatalog`) : noms, coûts et textes affichés, et partie contre l'IA, suivent ce qui a été publié.

## Hors ligne et cache

`public/sw.js` (service worker) rend l'appli installable sur téléphone. Les fichiers de `/assets/` (leur nom contient une empreinte, ils ne changent jamais) sont servis depuis le cache ; les pages et les illustrations passent par le réseau, avec le cache en secours. Un changement de la constante `CACHE` efface les anciens caches. L'API et le WebSocket ne passent jamais par le cache.

`localStorage` garde la session (`jeu-auth`), le salon en cours (`jeu-session`, pour reprendre après un rechargement) et le son coupé (`jeu-muted`).

## Illustrations

`public/art/<id>.webp` (432 × 640, WebP) ; l'identifiant de la carte doit aussi être ajouté à `ART` dans `src/art.js`.

## Page `/admin` (`admin.js`)

Protégée par `ADMIN_KEY`, saisie une fois et gardée dans le navigateur le temps de la session (`sessionStorage`). Envoyée dans l'en-tête `X-Admin-Key`.

| Onglet | Fichier | Rôle |
| --- | --- | --- |
| Comptes | `admin.js` | Créer un compte ; fiche complète : pseudo, mot de passe, Éclats, niveau, collection, deck de départ, booster, offres, sessions, désactivation, remise à zéro, suppression. |
| Stats | `admin-stats.js` | Taux de victoire par joueur et par général, cartes les plus jouées, dernières parties. |
| Cartes, Sets | `admin-cards.js` | Brouillon du catalogue : retoucher ou créer une carte, ranger les cartes en sets, publier. |
| Boutique | `admin.js` | Prix, taille des boosters, Éclats par doublon, cartes du jour, renouvellement des offres. |
| Récompenses | `admin-rewards.js` | Courbe d'XP, gains des parties et niveaux, missions, complétions, succès. |

Chaque onglet séparé est une fonction (`statsTab`, `cardsTab`, `rewardsTab`) qui reçoit les outils de la page (`call`, `render`, `say`, `esc`, `notice`) et renvoie de quoi s'afficher et réagir aux clics.

## Utilitaires partagés

`common.js` : `famStyle(famille)` (variable CSS de couleur de la famille) et `esc(texte)` (échappement HTML, à utiliser pour tout texte venant d'un joueur ou de l'administration : pseudo, nom de deck, carte retouchée).
