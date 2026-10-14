# Moteur de règles (`packages/engine`)

Le moteur est du JavaScript pur : pas de DOM, pas de réseau, pas de dépendance. Le serveur l'utilise pour les parties en ligne, l'appli pour l'affichage et la partie contre l'IA, et les scripts `sim`, `eco` et `empreinte` pour l'équilibrage.

## Règles en bref

7 tours (`TURNS`), 3 zones, 4 emplacements par joueur et par zone (`SLOTS`). Chaque joueur commence avec 3 cartes (`START_HAND`), pioche 1 carte par tour, main limitée à 7 (`HAND_MAX`, une carte en trop part à la défausse). Au tour n, on dispose de n sceaux (plus les bonus). Les deux joueurs préparent leur tour en secret, puis tout est révélé. Gagne celui qui remporte 2 zones sur 3 ; sinon la puissance totale départage.

## Données des cartes (`engine.js`)

Quatre objets décrivent tout le contenu :

| Objet | Clé | Contenu |
| --- | --- | --- |
| `CARDS` | `cherubin`, `goule`… | Créatures (`type: 'C'`) et sorts (`type: 'S'`), jetons et cartes de récompense compris. |
| `GENERALS` | `seraphine`, `morgrath`… | Généraux, avec famille (`fam`) et type d'effet affiché (`kind`). |
| `TERRAINS` | `prairie`, `bois`… | Terrains, avec famille éventuelle (`fam: null` pour un neutre). |
| `DECKS` | `ange`, `demon`… | 12 decks préconstruits (15 cartes, 5 terrains, un général) : decks de départ, IA et simulations. |

Champs d'une carte : `name`, `type`, `cost`, `power`, `kw` (la famille, ex. `['Elfe']`, vide pour une neutre), `text` (affiché tel quel), et selon les cas :

| Champ | Effet |
| --- | --- |
| `set` | Set d'origine : absent (= `base`), `set2`, ou `recompense` (jamais dans un booster). |
| `x` | Coût X : la carte prend tous les sceaux restants (`c.xPaid`). |
| `sacrifice` | Nombre de vos créatures (les plus faibles de la zone) détruites à la révélation. |
| `mobile` | Déplaçable par le joueur pendant la préparation. |
| `token` | Jeton : créé par un effet, jamais en collection, disparaît sans aller à la défausse. |
| `raise` | Relève : défaussée depuis la main, la carte entre en jeu. |
| `firewall` | Pare-feu : vos créatures dans sa zone (elle comprise) ne peuvent pas être piratées. |
| `malware(st, p)` | Malware (jeton) : la fonction s'exécute quand le joueur `p` pioche la carte, qui disparaît sans être remplacée. |
| `egg` | Œuf : éclôt selon son propre effet. |

### Crochets

Un effet est une fonction attachée à la carte. Arguments : `c` (la carte en jeu), `st` (l'état de la partie), puis selon le crochet.

| Crochet de carte | Quand |
| --- | --- |
| `onReveal(c, st)` | La carte est révélée (ou entre en jeu par un effet). |
| `self(c, st)` | Bonus persistant de puissance sur soi (renvoie un nombre). |
| `aura(source, cible, st)` | Bonus persistant sur une autre créature (renvoie un nombre). |
| `onStartTurn`, `onEndTurn` | Début ou fin de chaque tour. `onEndTurn` renvoie `false` s'il ne s'est rien passé. |
| `grace(c, st)` | Fin de tour, si son propriétaire a dépensé tous ses sceaux. |
| `onDestroyed(c, st, zone, sacrifiée)` | La carte est détruite. |
| `onAllyDestroyed(c, st, morte, zone)` | Une autre de vos créatures est détruite. |
| `onMove(c, st)` | La carte vient de changer de zone. |
| `costFn(st, joueur)` | Modifie le coût (renvoie un ajustement, ex. `-1`). |
| `onInspire(c, st, piochée)` | Vous piochez en dehors du début de tour. |
| `onSpell(c, st, zone, sort)` | Vous révélez un sort. |
| `onSwitch(c, st)` | La carte change de camp (Échange). |

Une carte piratée (`c.hacked`, posé par `hack(st, c)`) perd tous ses effets : ses crochets ne passent plus que par `fx(c)`, et `self`/`aura` sont ignorés. Un Pare-feu (`firewall`, ou le terrain Pare-feu) l'en protège.

Les généraux ont `activate` (+ `needsZone`, `activateCost`) pour un effet activable une fois par partie, `aura`, `preview` (voit ses terrains à venir) et les crochets `onStart`, `onStartTurn`, `onEndTurn`, `onEndGame`, `onDraw`, `onDiscard`, `onSpell`, `onAllyDestroyed`, `onMalware` (un de vos Malwares s'exécute chez l'adversaire), `onHack(p, st, carte)`, `onOverload(p, st, zone, carte)` (Surcharge payée), `onRaise` (une carte se relève), qui reçoivent le numéro du joueur (`p`) au lieu d'une carte. Ces crochets passent par `genHook` : s'il a écrit au journal, le général a agi, et `P.genFired` compte un déclenchement de plus (envoyé dans la vue, `genFired`, pour que l'appli joue son effet). Les terrains ont `flat` (bonus de zone), `aura`, `onReveal`, `onStartTurn`, `onEndTurn`, `onAllyDestroyed`, `onCardReveal`, `onSpellHere`, `onFoeReveal` (une créature adverse est révélée ici), avec `p` et la zone. Un général piraté (`hackGeneral`, `genHacked(st, p)`) est muet jusqu'à la fin du tour suivant : ni crochets, ni activation.

Les effets s'écrivent avec les petites fonctions du moteur : `buff(st, carte, n)`, `addZone`, `draw`, `summon`, `horde`, `feast`, `move`, `destroy`, `drain`, `exhume`, `discardFromHand`, `malware(st, p, n, type)` (type `virus`, `ver`, `rancon` ou `mix`), `hack`, `hackGeneral`, `implant(st, carte, n)`, `overload(st, carte, n)` (renvoie `true` si la Surcharge a été payée), et les sélecteurs `creaturesAt(st, p, zone)`, `mine(st, p)`, `weakest`, `strongest`, `bestZone`.

## État d'une partie

`newGame(deck0, deck1, noms, { generals })` renvoie un objet simple (sérialisable en JSON) :

```js
st = {
  turn, phase,            // numéro du tour ; 'plan' | 'reveal' | 'over'
  leader,                 // joueur qui résout en premier (celui qui mène)
  p: [P0, P1],            // les deux joueurs
  log: [{ turn, msg, kind }],
  nextUid, order,         // compteurs : identifiant des jetons, ordre de pose
  over, result,           // fin de partie : { winner (0, 1 ou -1), reason, zones, tot }
  trace,                  // à chaque fin de tour : { pow: puissance des zones de chaque joueur, n: cartes révélées } (historique)
  sim,                    // true dans les copies simulées par l'IA (pas de journal)
}
P = {
  name, deckName, deckKey, general, generalUsed, genFired,   // genFired : nombre de déclenchements du général
  deck: [carte], hand: [carte], discard: [carte], board: [[carte], [carte], [carte]],
  terrains: [id|null ×3], terrainPlan: [{ t, z, turn }], zoneBonus: [n ×3],
  seals, bonusSeals, treasure, lastUnspent, perfectTurns, lost, stolen, feasts, spells,
  moves: [{ uid, zone, from }], played: [id],   // déplacements prévus ; cartes révélées (stats)
}
carte = { uid, id, owner, zone, buff, revealed, pending, order, ... }
```

La puissance d'une créature n'est jamais stockée : `power(st, c)` la recalcule (puissance imprimée + `buff` + `self` + auras des créatures, du général et du terrain). `zonePower(st, p, z)` additionne la zone.

## Déroulé d'un tour

```
startTurn   tour +1 ; sceaux = tour + bonus ; chacun pioche 1 ; terrain du tour révélé (tours 1 à 3) ;
            calcul du meneur ; onStartTurn des cartes, des terrains et des généraux.
(plan)      chaque joueur prépare : applyPlan pose les cartes face cachée (placeHidden),
            note les déplacements et l'activation du général.
            Les places se comptent en fin de tour (4 par zone) : une carte qui part libère sa place
            pour une carte posée ou une autre arrivée le même tour. Une zone peut donc compter
            plus de 4 cartes le temps que ses déplacements se fassent pendant la révélation.
revealSteps liste des étapes : pour le meneur puis l'autre joueur, général, déplacements, cartes posées (dans l'ordre de pose).
doStep      résout une étape : révélation, sacrifice, onReveal, terrain, réactions aux sorts (un sort part ensuite à la défausse).
endTurn     onEndTurn et Grâce des cartes ; Festins dévorés ; effets de fin de tour des terrains et généraux ;
            sceaux non dépensés ajoutés au Trésor. Au tour 7 : finish (fin de partie, gagnant).
```

`runTurn(st, plans, emit, wait)` enchaîne tout cela : `emit(uid)` est appelé après chaque étape visible (le serveur diffuse alors l'état), `wait(ms)` laisse le temps à l'animation (instantané en simulation).

L'ordre de résolution compte : le joueur qui mène résout d'abord, zones de gauche à droite, puis dans l'ordre de pose (`ordered(st)`).

## Journal

Les messages du journal sont écrits une fois pour les deux joueurs avec des marqueurs : `⟦0⟧` (nom du joueur 0, ou « Vous ») et `⟦0|révèle|révélez⟧` (verbe conjugué). `renderLog(msg, siège, noms)` les remplace pour celui qui regarde.

## Détail d'une partie

`gameDetail(st)` résume une partie terminée pour l'historique des joueurs (pas de replay) : tours joués, `trace` (puissance des 3 zones de chaque joueur à chaque fin de tour, avant les effets de fin de partie) et, par joueur, puissance finale des zones, terrains, `cut` (nombre de cartes révélées à la fin de chaque tour, pour découper `played` tour par tour), Trésor, tours parfaits, sorts, créatures perdues, général activé. `endTurn` remplit `st.trace` hors simulation ; la copie de l'IA (`clone`) et `npm run empreinte` la laissent de côté.

## Vue d'un joueur

`viewFor(st, siège, extra)` construit ce qu'un joueur a le droit de voir : sa main avec les coûts du moment, ses cartes cachées, la puissance des cartes révélées, le nombre de cartes de l'adversaire, ses cartes cachées sous forme `{ hidden: true }`, et les 80 derniers messages du journal. C'est la seule chose envoyée à l'appli.

## IA (`aiPlan`)

`aiPlan(st, p, essais)` tire au hasard `essais` plans possibles (cartes jouables, zones, déplacements, général parfois), simule chacun sur une copie de l'état (ses propres révélations puis la fin de tour) et garde le plan le mieux noté par `evalFor` : avance dans chaque zone (lissée par `tanh`), plus la valeur future du Trésor (Dragon) et des tours parfaits (Ange). Le plan de l'adversaire n'est pas deviné. `aiSearch(st, p, essais)` fait la même recherche et renvoie aussi la note du meilleur plan (`{ plan, value }`) : on peut ainsi la découper en tranches et garder le meilleur de toutes (partie contre l'IA dans la page, `solo.js`).

Réglages : 250 essais contre un joueur (`client/src/solo.js`), de 15 (Bronze) à 500 (Maître) en partie classée (`TIERS`, `ranked.js`), 80 dans `npm run sim`, 60 dans `npm run empreinte`. La copie de l'état (`clone`) laisse de côté le journal ; c'est la partie la plus coûteuse de l'IA.

## Collection (`collection.js`)

- `STARTERS` : les 3 decks de départ (`gobelin`, `elfe`, `demon`) ; `starterKit` donne leurs 15 cartes et leurs généraux.
- `COLLECTIBLE` (cartes hors jetons), `OWNABLE` (cartes et généraux), `BOOSTER_POOL` (contenu du booster quotidien) : tableaux mis à jour sur place quand un catalogue est appliqué.
- `openBooster(collection)` : 3 cartes dont au moins une nouvelle tant qu'il en manque.
- `deckError(deck, compte)` : message d'erreur ou `null` si le deck est jouable (15 cartes différentes possédées, 5 terrains autorisés, un général possédé). `draftError` accepte un deck incomplet.
- `allowedTerrains` : terrains neutres et ceux des familles dont le joueur possède un général, sauf ceux d'un set pas encore sorti.
- `deckCode(deck)` / `readDeckCode(code)` : code de deck à partager (`DK1-` puis nom, général, terrains et cartes en base64url) ; il ne dépend pas de la collection. `fitDeck(deck, compte)` ramène un deck (code ou recette) à la collection : `deck` avec ce que le joueur possède, `missing` (général, terrains, cartes ; `unknown` compte les identifiants inconnus ou d'un set pas sorti, sans les nommer), `complete`. `recipeKeys()` : decks préconstruits proposés en recettes (ceux des sets sortis).
- `SETS` / `DEFAULT_SETS` : sets (cartes, ouvert en boutique, booster quotidien, présentation) ; `dailyOffers` : cartes du jour en boutique.
- `EXCHANGE_TIERS`, `exchangeOffers(rate)`, `exchangeFor(rate, need)` : offres fixes du change de Prismes en Éclats (bonus pour les grosses offres), et celle à proposer quand il manque `need` Éclats (la plus petite qui suffit, sinon la plus grosse).
- `today()` : le jour à Paris (`AAAA-MM-JJ`) ; tout ce qui est quotidien bascule à minuit, heure française.

## Catalogue (`catalog.js`)

Le catalogue publié depuis `/admin` retouche des cartes (nom, coût, puissance, famille, texte, déplaçable, coût X, sacrifice) et en crée de nouvelles qui reprennent l'effet d'une carte existante (`effect`). `applyCatalog(cat)` repart des cartes d'origine (`BASE_CARDS`), applique les retouches et met à jour `CARDS`, `COLLECTIBLE`, `OWNABLE`, `SETS` et `BOOSTER_POOL` sur place, si bien que le reste du code n'a rien à faire de plus. `catalogError` refuse un catalogue invalide ; `withNewcomers` range dans leur set d'origine les cartes ajoutées au code après l'enregistrement d'un catalogue.

## Récompenses (`rewards.js`)

Données partagées par le serveur (qui calcule) et l'appli (qui affiche) : réglages chiffrés par défaut (`DEFAULT_REWARDS`, bornes dans `REWARD_LIMITS`), courbe d'XP (`xpToNext`), missions (`MISSIONS`), succès (`ACHIEVEMENTS`), récompenses de famille et de set (`FAMILY_REWARDS`, `SET_REWARDS`), titres, cadres et dos de carte, niveaux de carte (`CARD_LEVELS` : nom, bordure `look`, effet `fx` ; `levelCost(n)` lit les coûts dans les réglages). Les choix chiffrés sont justifiés dans la proposition d'économie (`recompenses/economie.md`, dans les fichiers du projet Claude, pas dans ce dépôt).

## Arts alternatifs (`arts.js`)

Catalogue des arts (`ARTS` : carte, nom, rareté ; `edition: 'promo'` avec `how`), trois raretés (rare, épique, légendaire) avec leur prix par défaut en Prismes et leur poids de tirage (`ART_RARITIES`), prix d'un art selon les réglages (`artPrice`), arts du jour d'un joueur (`artOffers` : pondérés par rareté, ceux de ses cartes trois fois plus souvent), contenu et chances du coffre (`chestPool`, `chestRates`). Les coffres offerts viennent des succès rares (`chests` dans `ACHIEVEMENTS`) et des dimanches du calendrier du mois (`loginReward`, `loginCalendar`, `monthDays` dans `rewards.js`). Les Promo ne sont jamais en vente. Les Prismes se gagnent avec les succès (`prisms` dans `ACHIEVEMENTS`, `rewards.js`) et en fin de saison classée (réglages `rankPrisms…`, voir `seasonPrismsKey`, `ranked.js`). Purement cosmétique : le moteur de partie ne les lit pas.

## Mode classé (`ranked.js`)

Le rang d'un joueur tient en un nombre d'étoiles `r` : 3 étoiles par division, 3 divisions par palier (III, II, I), paliers `TIERS` Bronze, Argent, Or, Platine, Diamant, puis Maître où les étoiles deviennent des points sans plafond (`MASTER`). `rankOf(r)` donne palier, division, étoiles, plancher et libellé.

- `applyResult(r, { result, streak, foeR, mult })` : victoire +1 étoile, plus 1 pour une série de 3 victoires ou plus (jusqu'au Diamant) et plus 1 pour avoir battu un ami mieux classé, le tout multiplié par `mult` (événement « points de classé », `events.js`) ; défaite −1, jamais sous le début du palier ; nul sans effet.
- Chaque palier règle la force de l'IA (`ai` : essais d'`aiPlan`) et ses récompenses de fin de saison (`title`, `frame` ; Éclats dans les réglages `rankShards…` de `rewards.js`, voir `seasonShardsKey`).
- Saisons : une par mois, heure de Paris (`seasonId`, `seasonName`, `seasonDaysLeft`) ; `seasonReset(r)` fait redescendre d'un palier au début de la suivante.
- Classement final : `PLACES` (1re place, podium, top 10) donne en plus des Éclats et Prismes (réglages `rankPlaceShards…` et `rankPlacePrisms…`, voir `placeShardsKey`, `placePrismsKey`) et un titre (`rang:top1`, `rang:top3`, `rang:top10`, avec ceux des places en dessous : `placeTitles`), aux joueurs qui ont joué au moins `rankPlaceGames` parties classées dans la saison.

## Quêtes d'histoire (`story.js`)

Le lore (`LORE`) et les quêtes (`QUESTS`) : trois campagnes, une par deck de départ, qui se suivent comme les livres I à III d'une même histoire (`book` ; `razzia` : Grisk vole la clé du Septième Sceau ; `racines` : Sylvaën retient la fissure ; `pacte` : Morgrath brise le Sceau), toujours ouvertes, et des quêtes à durée limitée (`kind: 'limitee'`, dates par défaut `from`, `to` : `halloween`, `eclipse`, `neon`). Chaque quête a son héros, son deck (un deck de départ, parfois retouché), le thème de sa carte, un prologue, la quête qui raconte la suite (`next`, proposée à la fin) et ses chapitres (`C(...)`) : lieu et place sur la carte, enjeu en une phrase (`goal`, sur la fiche du chapitre et avant le combat), adversaire (`foe(nom, général, deck, essais, bonus de zone)`), récompense de la première victoire, dialogues d'avant et d'après (`[qui, texte]`, `NARRATOR` pour la narration), et parfois un allié qui rejoint le deck (`join : { card, out }`, appliqué aux chapitres suivants par `chapterDeck`). Le dernier chapitre donne un art Promo (`arts.js`) et un titre (`STORY_TITLES`) ; les quêtes limitées donnent aussi une carte de récompense (`STORY_CARDS` : `epouvantail`, `pretre_eclipse`, `coursier_neon`, set `recompense`, jamais en booster). Réglages de `/admin` (`questCfg`, `DEFAULT_STORY`, `STORY_LIMITS`) : ouverte ou non, dates, nombres de chaque récompense ; `questState` dit si une quête est `open`, `soon`, `over`, `archive` ou `off`. Une quête d'événement qui fait avancer l'histoire (`canon` : Éclipse, Signal perdu) passe à sa fin dans l'histoire principale (`archive`, `questTab`) : même progression, mais `chapterReward(…, archive)` retire l'art Promo et remplace la carte de quête par `CARD_SHARDS` Éclats, et `releasedStoryCards` met sa carte dans le booster du Set de base (le serveur la joint au catalogue). Une quête non canon (Halloween) disparaît à sa fin. Dialogues : une réplique est `[qui, texte]` ou `[qui, texte, illustration]` ; `qui` est un général, une carte (son illustration sert de portrait) ou `NARRATOR` ; chaque chapitre a un lieu illustré (`scene`, table `SCENES` : un terrain ou une carte), montré en tête des dialogues (`lineScene`). Les essais de l'IA et les decks adverses ont été réglés par simulation : environ 60 à 80 % de victoires au premier chapitre et 55 à 75 % au dernier, pour que le combat final ne soit pas frustrant. Une quête de plus : une entrée dans `QUESTS` (avec ses arts dans `arts.js` et son titre dans `STORY_TITLES`), son décor dans `DECOR` et `SKY` (`client/src/story.js`) ; le chargement vérifie que chaque général et chaque carte existe.

## Événements temporaires (`events.js`)

Un événement multiplie un gain (`EVENT_EFFECTS` : `xp`, `ranked`, `shards`, `passXp`) par `mult` (`MULTS` : ×1,5, ×2 ou ×3) pendant une période (`EVENT_WHEN`) : chaque week-end, dernier week-end du mois (le dernier samedi et le lendemain), dernière semaine du mois (les 7 derniers jours) ou entre deux dates (`from`, `to`). Les jours sont ceux du jeu (heure de Paris), de minuit à minuit.

- `DEFAULT_EVENTS` : week-end double XP et semaine double points de classé, tant que `/admin` n'a rien enregistré.
- `occurrence(ev, jour)` : la période qui contient ce jour, ou la prochaine ; `isLive`, `liveEvents`, `daysLeft`.
- `multiplier(events, effet, jour)` : le plus fort des événements en cours sur cet effet (ils ne se cumulent pas) ; `boost(n, mult)` arrondit le gain.
- Nouvel effet : une entrée dans `EVENT_EFFECTS`, puis `events.mult('<effet>')` là où le gain se calcule (`server/src/progress.js`).

## Outils

```bash
npm run sim -- 60            # taux de victoire de chaque deck contre chaque deck (60 parties par duel)
npm run sim -- 20 generaux   # chaque général avec le deck de sa famille, contre tous les decks
npm run equilibrage -- decks 150     # matrice des decks sur tous les cœurs (300 parties par paire)
npm run equilibrage -- generaux 60   # apport de chaque général face au même deck sans général (Cartographe)
npm run equilibrage -- cartes 60     # apport de chaque carte face à une créature sans effet du même coût
npm run eco                  # jours pour compléter un set selon la façon de jouer, puis niveaux de carte atteints
npm run empreinte            # empreinte de 144 parties à hasard fixé (voir Recettes)
```
