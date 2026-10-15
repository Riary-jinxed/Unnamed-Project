# Recettes

## Vérifier qu'un changement ne casse rien

Selon ce qui a changé :

1. **Les tests du moteur passent** (après toute modification du moteur ou d'une carte) : `npm test`. Ils tournent aussi sur GitHub à chaque pull request et à chaque push sur `main` (`.github/workflows/tests.yml`).
2. **Le moteur joue toujours pareil** (après un nettoyage ou une optimisation qui ne doit pas changer le jeu) :
   ```bash
   git stash && npm run empreinte && git stash pop && npm run empreinte
   ```
   Les deux empreintes doivent être identiques. Elles changent normalement après une modification de règle ou de carte : c'est voulu, et c'est le moment de lancer `npm run sim` (ou `npm run equilibrage`).
3. **L'appli se compile** (après toute modification de `client/`) : `npm run build`.
4. **Les textes sont traduits** (après l'ajout d'un texte affiché) : `npm run i18n`, voir [Traduction](traduction.md).
5. **Le parcours marche** : `ADMIN_KEY=test npm run dev`, créer deux comptes sur http://localhost:5173/admin.html, puis avec chacun (deux navigateurs, ou une fenêtre privée) : choisir un deck de départ, ouvrir le booster, la boutique, jouer une partie en ligne et une contre l'IA.

Les données locales sont dans `server/data/` : supprimez ce dossier pour repartir de zéro.

## Ajouter une carte

1. Dans `packages/engine/src/engine.js`, ajoutez une entrée à `CARDS`, près des cartes de sa famille :
   ```js
   sentinelle: { set: 'set3', name: 'Sentinelle', type: 'C', cost: 3, power: 3, kw: ['Elfe'], mobile: true,
                 text: 'Déplaçable. Révélation : piochez une carte.',
                 onReveal: (c, st) => draw(st, c.owner, 1, true) },
   ```
   Sans `set`, la carte appartient au Set de base. Le texte est affiché tel quel : il doit dire exactement ce que fait le code.
2. Son nom et son texte anglais dans `packages/engine/src/lang/en/cards.js` (`npm run i18n` les signale).
3. Rien d'autre n'est obligatoire : la carte rejoint son set (boutique, boosters, collection), y compris quand un catalogue a déjà été publié depuis `/admin`. `cartes.test.js` vérifie tout seul ses données et que ses effets ne plantent pas.
4. Facultatif : l'ajouter à un deck préconstruit (`DECKS`) pour que l'IA la joue.
5. Lancez `npm test`, puis `npm run sim -- 40` pour voir l'effet sur l'équilibre.

Une carte qui reprend simplement l'effet d'une carte existante avec d'autres chiffres peut aussi se créer depuis `/admin` (onglet Cartes), sans toucher au code.

Une nouvelle mécanique demande en plus :

- un test dans `mecaniques.test.js` (voir plus bas) ;
- sa description dans le codex (`client/src/codex.js`) et son mot-clé dans `KEYWORDS` et `KEYWORDS_EN` (`client/src/common.js`) ;
- pour une mécanique de famille, sa leçon dans le tutoriel avancé : une entrée `advanced: true` dans `LESSONS` (`client/src/tutorial.js`, sur le modèle des leçons existantes : quelques tours, decks et pioches fixés, adversaire qui joue toujours pareil) et la même dans `TUTO_LESSONS` (`packages/engine/src/rewards.js`), puis ses textes anglais (`npm run i18n`). Rejouez la leçon en suivant le guide pour vérifier que chaque consigne correspond à ce qui se passe. La leçon d'un set porte `set: '<id du set>'` (dans `LESSONS` et `TUTO_LESSONS`) : elle reste cachée, et sa récompense refusée, jusqu'à la sortie du set. Une mécanique au hasard se fixe pour la leçon avec `dice` (résultats des prochains dés).

Une carte ne doit jamais être retirée du code tant que des joueurs la possèdent : leurs collections et leurs decks la référencent par son identifiant.

## Tester une mécanique

Les tests sont dans `packages/engine/test/` et se lancent avec `npm test` (`node --test`, sans dépendance). Un test de mécanique va dans `mecaniques.test.js`, dans le `describe` de sa famille, avec les outils de `aide.js` :

```js
test('Sentinelle : pioche une carte à la révélation', () => {
  const st = partie();                    // partie vide : mains, decks et plateaux vides, 10 sceaux, généraux sans effet
  const g = enDeck(st, 0, 'golem');       // aussi enMain(st, joueur, id) et enJeu(st, joueur, id, zone, bonus)
  jouer(st, 0, 'sentinelle', 1);          // posée face cachée puis révélée, comme pendant un tour
  assert.ok(st.p[0].hand.includes(g));
});
```

- `pw(st, carte)` et `zp(st, joueur, zone)` donnent la puissance d'une carte et d'une zone ; `ids(liste)` les identifiants d'une liste de cartes.
- `partie({ seals, generals, turn })` change les sceaux, les généraux ou le tour ; un terrain se pose avec `st.p[0].terrains[zone] = 'id'`.
- Les dés se fixent avec `st.dice = [6, 1]` (prochains résultats) ; `startTurn(st)` et `endTurn(st)` (importés de `engine.js`) déclenchent début et fin de tour.

## Ajouter un général ou un terrain

- **Général** : entrée dans `GENERALS` avec `name`, `fam` (ou `null`), `kind` (texte court affiché : « Persistant », « Activable »…), `text`, et ses crochets (voir [Moteur](moteur.md#crochets)). Les généraux du Set de base de la famille de départ (et les neutres) sont donnés avec le deck de départ. Pour son portrait en partie, la position de son visage dans `FACES` (voir `client/src/art/LISEZMOI.md`).
- **Terrain** : entrée dans `TERRAINS` avec `name`, `fam`, `text` et ses crochets. Un terrain de famille n'est jouable que si le joueur possède un général de cette famille.

Dans les deux cas, nom et texte anglais dans `lang/en/cards.js`.

## Ajouter un set

1. Cartes et généraux avec `set: 'set4'` dans `engine.js`.
2. Une entrée à la fin de `DEFAULT_SETS` (`packages/engine/src/collection.js`) : nom, `open: false` tant qu'il n'est pas en vente, `daily`, présentation (`teaser`), `boosterExtra` (Éclats ajoutés au prix d'un booster pour ce set : 50 pour Crépuscule et Cité Néon), et `reveal: 'AAAA-MM-JJ'` pour le dévoiler à une date (heure de Paris) : avant, ses cartes, généraux, terrains, decks d'IA, récompenses et entrées du codex restent cachés et le set n'est pas en vente, même ouvert. La date se règle aussi dans l'onglet Sets de `/admin` (« Sortie le »). En boutique, les sets ouverts vont du plus récent (le dernier de la liste) au plus ancien, et le plus récent porte « Nouveau ». Une fois un catalogue publié, l'ouverture du set et son supplément se règlent dans l'onglet Sets de `/admin`.
   Ses cartes montrent un visuel provisoire tant que leurs illustrations manquent (voir `client/src/art/LISEZMOI.md`).
   Un mini-set (une poignée de cartes entre deux sets, comme « Faites vos jeux ») prend `mini: true` : seul le set complet est récompensé, pas chaque famille.
3. Récompenses de complétion (`packages/engine/src/rewards.js`) : une ligne par famille du set dans `FAMILY_REWARDS` (carte unique avec `set: 'recompense'`, titre, dos de carte), une entrée dans `SET_REWARDS` (carte Dieu, titre, cadre), et les nouveaux noms dans `BACKS` et `FRAMES`. Les dos et cadres se dessinent dans `client/src/cosmetics-art.js` (augmentez alors `VERSION` dans `cosmetics.js`) ; sans dessin, ils gardent leur rendu CSS de `client/src/style.css` (`.mc.back.back-<id>`, `.frame-<id>`).
4. Noms et présentation en anglais (`lang/en/cards.js`, `lang/en/data.js`), et une annonce dans les Nouveautés (voir plus bas).

## Ajouter un art alternatif

1. Une ligne `A(id, carte, nom, rareté, { theme })` dans `ARTS` (`packages/engine/src/arts.js`), `theme` étant sa famille d'arts (`ART_THEMES`). Promo : `{ edition: 'promo', how }`, puis le donner depuis la fiche du joueur dans `/admin`. Son nom anglais dans `lang/en/data.js`.
2. Les images dans `client/src/art/alt/<id>/` (`decor.webp`, `perso.webp`, même gabarit que les cartes). Sans elles, l'appli montre un art provisoire et l'art reste vendable.

Une nouvelle rareté s'ajoute dans `ART_RARITIES` (nom, prix, poids) avec sa couleur dans `style.css` (`.rar-<id>`). Les prix des raretés, le nombre d'arts du jour et le prix du coffre se règlent dans l'onglet Boutique de `/admin`.

## Ajouter un thème de l'interface

1. Une entrée dans `EXTRA_THEMES` (`packages/engine/src/themes.js`) : `name`, `card` (le général montré en fond des menus), `art` (facultatif : un de ses arts alternatifs), et ce qui le donne :
   - `price` (Éclats) ou `prisms` (Prismes) : rayon Thèmes de la boutique ;
   - `essence` (essence universelle) : rayon Essence ;
   - `boss: true` et un article `theme:<id>` dans `BOSS_SHOP` (`boss.js`) : magasin du boss mondial, en Insignes ;
   - `event: 'casino'` et un article dans `CASINO_SHOP` (`casino.js`) : boutique de l'événement, en Jetons ;
   - rien de tout ça : `theme: '<id>'` sur un succès d'`ACHIEVEMENTS` (`rewards.js`).

   `reveal: 'AAAA-MM-JJ'` le cache jusqu'à la sortie d'un set.
2. Son habillage dans `client/src/themes.css` : un bloc `body[data-season="<id>"]` avec ses couleurs (variables `--bg`, `--gold`…, `--th-…`), l'identifiant ajouté à chaque liste `body:is([data-season=…])` des règles communes, et son aperçu `.theme-<id>.theme-swatch`.
3. Les couleurs des décors PixiJS (braises, table, boutique) dans `PALETTE`, `TABLE` et `SHOP` de `client/src/season.js` ; sans elles, ceux du thème de base.
4. Facultatif : ses musiques `menu-<id>.mp3` et `partie-<id>.mp3` (voir [Musiques](musique.md)), et son nom anglais dans `lang/en/data.js`.

## Préparer une saison du passe

1. Les cartes uniques (2 ou 3) dans `engine.js` avec `set: 'saison'` : elles ne sortent d'aucun booster et rejoignent le Set de base `passCardMonths` mois après le début de leur saison (onglet Récompenses de `/admin`, 3 par défaut).
2. Une entrée dans `SEASONS` (`packages/engine/src/pass.js`) : `id` (le mois, `AAAA-MM`), `start` (jour de dévoilement, le 1er du mois si absent), nom, `theme`, présentation, familles des missions, cartes, titres, cadres et dos (gratuits et premium), arts Promo (avec leur palier sur la piste gratuite, à choisir parmi les paliers à Éclats) et missions de saison.
3. Les arts Promo dans `ARTS` (`arts.js`) avec `edition: 'promo'` et `season` : ils restent cachés avant la saison.
4. L'habillage du thème dans une feuille à son nom, importée par `main.js` (comme `halloween.css` et `cyber.css`) : `body[data-season="<theme>"]` et l'aperçu `.theme-<theme>.theme-swatch` ; ses deux couleurs `.theme-<theme>` (`--sa`, `--sb`) dans `style.css` ; les couleurs des décors dans `season.js` ; les dessins des cadres et dos dans `cosmetics-art.js`.
5. Ses musiques, nommées d'après son `theme` (voir [Musiques](musique.md)), et ses textes anglais (`lang/en/data.js`).

Une saison sans entrée dans `SEASONS` n'a pas de passe : l'accueil ne le montre pas ce mois-là.

## Ajouter un événement temporaire

Un bonus du type « week-end double XP » ne demande pas de code : il se crée dans l'onglet Événements de `/admin` (bonus, multiplicateur ×1,5, ×2 ou ×3, période : chaque week-end, dernier week-end du mois, dernière semaine du mois ou entre deux dates). Le serveur l'applique aussitôt ; l'accueil, le courrier, les notifications et l'onglet À venir des Nouveautés l'annoncent tout seuls. `DEFAULT_EVENTS` (`packages/engine/src/events.js`) ne sert que tant que `/admin` n'a rien enregistré.

Un nouveau type de bonus : une entrée dans `EVENT_EFFECTS` (`events.js`), puis `boost(gain, events.mult('<id>'))` là où le gain se calcule (`server/src/progress.js`), et ses textes anglais.

## Annoncer une nouveauté

- **Annonce des Nouveautés** (nouveau set, mise à jour majeure, grand événement) : depuis l'onglet Nouveautés de `/admin`, programmable à l'avance. Pour qu'elle parte avec un déploiement, ajoutez-la à la fin de `NEWS_SEED` (`server/src/news-seed.js`) avec un identifiant nouveau : `from` (jour de parution), `kind` (`update`, `set`, `teaser` ou `event`), `set`, `date` (jour annoncé, pour le compte à rebours), `title`, `summary`, `body` et `en: { title, summary, body }`. Elle paraît une seule fois, au premier démarrage du serveur qui la contient ; modifiez-la ensuite depuis `/admin`.
- **Note de mise à jour** (équilibrage, correctifs) : à la fin de `NOTES_MAJ` (`server/src/notes-maj.js`), avec un identifiant nouveau. Elle est envoyée une seule fois dans le courrier de tous les joueurs ; ne modifiez pas une note déjà partie.

## Ajouter une mission ou un succès

- **Mission** : entrée dans `MISSIONS` (`rewards.js`) avec son libellé, son objectif, son XP et ses Éclats. Une mission qui compte des cartes jouées a `count(mission, jouées)` ; une mission qui demande une famille ou une carte a `pick(compte)`, qui la tire parmi les cartes du joueur et renvoie null s'il n'en a pas assez (la mission n'est alors pas proposée) ; `group` évite deux missions semblables le même jour ; `retired` retire une mission des tirages sans casser celles déjà tirées. Les autres avancent avec `stat` (une ligne de la table de fin de partie de `onGame` : `play`, `win`, `ranked`, `zones`…) ou `on` (un événement hors partie, signalé par `progress.act(compte, 'clé')` : `boss`, `clanDon`, `booster` ; `missions` est compté par `progress.js` lui-même). `need` réserve la mission aux joueurs qui ont accès à un mode (`clan`, ou `boss`, donné par `progress.setNeed` dans `boss.js`). Une mission de la semaine va dans `WEEKLY_MISSIONS` (identifiant en `w_`), avec les mêmes champs ; une sorte de mission du passe dans `PASS_KINDS` (`pass.js`), qui avance avec la même clé que `on`.
- **Succès** : une ligne `A(...)` dans `ACHIEVEMENTS` avec la statistique suivie (`level`, `wins`, `cards`, `famWins.Elfe`…, voir `statsOf` dans `progress.js`), l'objectif, les Éclats, et éventuellement des Prismes, des coffres offerts (`chests`), un titre, un cadre, une émote ou un thème. Les comptes qui remplissent déjà la condition le reçoivent au prochain démarrage du serveur.
- **Compteur tenu hors de `progress.js`** (clans…) : `progress.count(compte, 'stat', n)` ajoute n, `progress.best(compte, 'stat', valeur)` garde la plus grande ; les succès suivent aussitôt.
- **Famille d'arts qui grandit** : rien à faire. Quand un set apporte des arts à une famille (arts sur des cartes de ce set), `themeTiers` (`rewards.js`) ajoute tout seul un palier qui débloque un cadre `art_<famille>_<set>`. Les paliers comptent les arts de la famille d'où qu'ils viennent : le premier en demande autant qu'en avait la famille à sa création, le dernier toute la famille. Son nom vient de `ART_FRAME_NAMES` ; son dessin de `ART_FRAME_DRAW` (`cosmetics-art.js`), sinon un rendu provisoire aux couleurs de `ART_FRAME_TINTS`. Un succès déjà gagné reste acquis.
- **Cadre animé** : l'anneau se dessine comme les autres (`FRAMES` de `cosmetics-art.js`). Ajoutez l'identifiant à `ANIMATED_FRAMES` (`rewards.js`) : le portrait reçoit alors un calque `.ffx` dont `::before` et `::after` portent le mouvement, dans `client/src/frames-anim.css`. N'y animez que `transform` et `opacity` (léger sur téléphone) ; `z-index: 1` pose le calque sur l'anneau, `-1` derrière (lueurs). Augmentez `VERSION` dans `cosmetics.js` quand vous ajoutez un dessin.

Les nombres (XP, Éclats, Prismes, objectifs) se règlent ensuite depuis l'onglet Récompenses de `/admin`, sans redéploiement.

## Ajouter une route d'API

Dans le module concerné, ajoutez une entrée `'POST /api/ma-route': (compte, corps) => …` à ses `routes` (celles de `accounts.js` sont dans `apiHandler`). Un nouveau module renvoie ses `routes` et les ajoute à la liste passée à `apiHandler` dans `server/src/index.js`. La fonction reçoit le compte connecté (déjà vérifié), le corps JSON, la session, l'URL et la langue ; elle renvoie un objet (envoyé en JSON) ou lance une `HttpError(code, msg('message'))`, traduite dans la langue du joueur. Pensez à `await store.put(compte)` après une modification et à renvoyer `account: accounts.me(compte)` pour que l'appli se mette à jour. Une route qui commence par `/api/admin/` demande automatiquement la clé d'administration.

## Changer la base de données

Le schéma est volontairement minimal : chaque compte, réglage ou partie est un document JSON. Ajouter un champ à un compte ne demande aucune migration SQL : donnez-lui une valeur par défaut à la lecture (`a.champ || 0`), ou initialisez-le au démarrage comme le fait `progress.init`.
