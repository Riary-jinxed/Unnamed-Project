# Recettes

## Vérifier qu'un changement ne casse rien

Il n'y a pas de tests automatiques ; trois vérifications couvrent l'essentiel :

1. **Le moteur joue toujours pareil** (après un nettoyage ou une optimisation qui ne doit pas changer le jeu) :
   ```bash
   git stash && npm run empreinte && git stash pop && npm run empreinte
   ```
   Les deux empreintes doivent être identiques. Elles changent normalement après une modification de règle ou de carte : c'est voulu, et c'est le moment de lancer `npm run sim`.
2. **L'appli se compile** : `npm run build`.
3. **Le parcours marche** : `ADMIN_KEY=test npm run dev`, créer deux comptes sur http://localhost:5173/admin.html, puis avec chacun (deux navigateurs, ou une fenêtre privée) : choisir un deck de départ, ouvrir le booster, la boutique, jouer une partie en ligne et une contre l'IA.

Les données locales sont dans `server/data/` : supprimez ce dossier pour repartir de zéro.

## Ajouter une carte

1. Dans `packages/engine/src/engine.js`, ajoutez une entrée à `CARDS`, près des cartes de sa famille :
   ```js
   sentinelle: { set: 'set2', name: 'Sentinelle', type: 'C', cost: 3, power: 3, kw: ['Elfe'], mobile: true,
                 text: 'Déplaçable. Révélation : piochez une carte.',
                 onReveal: (c, st) => draw(st, c.owner, 1, true) },
   ```
   Sans `set`, la carte appartient au Set de base. Le texte est affiché tel quel : il doit dire exactement ce que fait le code.
2. Rien d'autre n'est obligatoire : la carte rejoint son set (boutique, boosters, collection), y compris quand un catalogue a déjà été publié depuis `/admin`.
3. Facultatif : l'ajouter à un deck préconstruit (`DECKS`) pour que l'IA la joue.
4. Lancez `npm run sim -- 40` pour voir l'effet sur l'équilibre.

Une carte qui reprend simplement l'effet d'une carte existante avec d'autres chiffres peut aussi se créer depuis `/admin` (onglet Cartes), sans toucher au code.

Une nouvelle mécanique se décrit aussi dans le codex (`client/src/codex.js`) et dans `KEYWORDS` (`client/src/common.js`).

Une carte ne doit jamais être retirée du code tant que des joueurs la possèdent : leurs collections et leurs decks la référencent par son identifiant.

## Ajouter un général ou un terrain

- **Général** : entrée dans `GENERALS` avec `name`, `fam` (ou `null`), `kind` (texte court affiché : « Persistant », « Activable »…), `text`, et ses crochets (voir [Moteur](moteur.md#crochets)). Les généraux du Set de base de la famille de départ sont donnés avec le deck de départ.
- **Terrain** : entrée dans `TERRAINS` avec `name`, `fam`, `text` et ses crochets. Un terrain de famille n'est jouable que si le joueur possède un général de cette famille.

## Ajouter un set

1. Cartes et généraux avec `set: 'set3'` dans `engine.js`.
2. Une entrée dans `DEFAULT_SETS` (`packages/engine/src/collection.js`) : nom, `open: false` tant qu'il n'est pas en vente, `daily`, présentation (`teaser`). Une fois un catalogue publié, l'ouverture du set se règle dans l'onglet Sets de `/admin`.
3. Récompenses de complétion (`packages/engine/src/rewards.js`) : une ligne par famille du set dans `FAMILY_REWARDS` (carte unique avec `set: 'recompense'`, titre, dos de carte), une entrée dans `SET_REWARDS` (carte Dieu, titre, cadre), et les nouveaux noms dans `BACKS` et `FRAMES`. Les dos et cadres ont leur style dans `client/src/style.css` (`.mc.back.back-<id>`, `.frame-<id>`).

## Ajouter un art alternatif

1. Une ligne `A(id, carte, nom, rareté)` dans `ARTS` (`packages/engine/src/arts.js`). Promo : `{ edition: 'promo', how }`, puis le donner depuis la fiche du joueur dans `/admin`.
2. Les images dans `client/src/art/alt/<id>/` (`decor.webp`, `perso.webp`, même gabarit que les cartes). Sans elles, l'appli montre un art provisoire et l'art reste vendable.

Une nouvelle rareté s'ajoute dans `ART_RARITIES` (nom, prix, poids) avec sa couleur dans `style.css` (`.rar-<id>`). Les prix des raretés, le nombre d'arts du jour et le prix du coffre se règlent dans l'onglet Boutique de `/admin`.

## Ajouter une mission ou un succès

- **Mission** : entrée dans `MISSIONS` (`rewards.js`) avec son libellé, son objectif, son XP et ses Éclats, puis ce qui la fait avancer dans `progress.js` : la table passée à `advance` dans `onGame` (fin de partie) ou un appel à `advance` ailleurs (comme `onBooster`).
- **Succès** : une ligne `A(...)` dans `ACHIEVEMENTS` avec la statistique suivie (`level`, `wins`, `cards`, `famWins.Elfe`…, voir `statsOf` dans `progress.js`), l'objectif, les Éclats, et éventuellement un titre ou un cadre. Les comptes qui remplissent déjà la condition le reçoivent au prochain démarrage du serveur.

Les nombres (XP, Éclats, objectifs) se règlent ensuite depuis l'onglet Récompenses de `/admin`, sans redéploiement.

## Ajouter une route d'API

Dans le module concerné (`accounts.js`, `games.js` ou `cards.js`), ajoutez une entrée `'POST /api/ma-route': (compte, corps) => …` à ses routes. La fonction reçoit le compte connecté (déjà vérifié), le corps JSON, la session et l'URL ; elle renvoie un objet (envoyé en JSON) ou lance une `HttpError(code, 'message')`. Pensez à `await store.put(compte)` après une modification et à renvoyer `account: me(compte)` pour que l'appli se mette à jour. Une route qui commence par `/api/admin/` demande automatiquement la clé d'administration.

## Changer la base de données

Le schéma est volontairement minimal : chaque compte, réglage ou partie est un document JSON. Ajouter un champ à un compte ne demande aucune migration SQL : donnez-lui une valeur par défaut à la lecture (`a.champ || 0`), ou initialisez-le au démarrage comme le fait `progress.init`.
