# Moteur de règles (`packages/engine`)

Le moteur est du JavaScript pur : pas de DOM, pas de réseau, pas de dépendance. Le serveur l'utilise pour les parties en ligne, l'appli pour l'affichage et les parties contre l'IA (solo, quêtes, casino, tutoriel), les tests (`npm test`) pour vérifier les mécaniques, et les scripts `sim`, `eco`, `empreinte` et `equilibrage` pour l'équilibrage. Les autres modules de `src/` sont des données et des règles partagées par le serveur et l'appli (collection, récompenses, passe, classé, histoire, événements, casino, clans, boss…), exportés sous les noms de `package.json` (`@jeu/engine/collection`, `@jeu/engine/casino`…).

## Règles en bref

7 tours (`TURNS` ; une partie plus courte avec `newGame(…, { turns })`, pour le tutoriel), 3 zones, 4 emplacements par joueur et par zone (`SLOTS`). Chaque joueur commence avec 3 cartes (`START_HAND`), pioche 1 carte par tour, main limitée à 7 (`HAND_MAX`, une carte en trop part à la défausse). Au tour n, on dispose de n sceaux (plus les bonus). Les deux joueurs préparent leur tour en secret, puis tout est révélé. Gagne celui qui remporte 2 zones sur 3 ; sinon la puissance totale départage.

## Données des cartes (`engine.js`)

Quatre objets décrivent tout le contenu :

| Objet | Clé | Contenu |
| --- | --- | --- |
| `CARDS` | `cherubin`, `goule`… | Créatures (`type: 'C'`) et sorts (`type: 'S'`), jetons et cartes de récompense compris. |
| `GENERALS` | `seraphine`, `morgrath`… | Généraux, avec famille (`fam`, `null` pour un neutre) et type d'effet affiché (`kind`), plus les boss mondiaux et de clan (`boss: true`). |
| `TERRAINS` | `prairie`, `bois`… | Terrains, avec famille éventuelle (`fam: null` pour un neutre). |
| `DECKS` | `ange`, `demon`… | 22 decks préconstruits (15 cartes, 5 terrains, un général ; `set` s'il vient d'un set à venir) : decks de départ, IA, recettes, adversaires des quêtes et du casino, simulations. |

`FAMILIES` liste les 9 familles (Ange, Démon, Gobelin, Elfe, Dragon, Mort-vivant, Vampire, Hacker, Cyborg).

Sets (champ `set` des cartes, généraux, terrains et decks) :

| `set` | Nom | Contenu |
| --- | --- | --- |
| absent (`base`) | Set de base | Ange, Démon, Gobelin, Elfe, Dragon et neutres. |
| `set2` | Crépuscule | Mort-vivant (Défausse, Relève, Exhumation), Vampire (Drain), et un soutien par famille : Festin, Inspiration, Œufs, Échange, Sortilège. |
| `tapis` | Faites vos jeux (mini-set 2.5) | Neutres du casino (Pari, dés pipés, triche, Sept et Jackpot), soutien Ange, Gobelin et Démon, généraux Velours et Fortuna, deck `tapis`. |
| `set3` | Cité Néon | Hacker (Malware, Piratage), Cyborg (Implant, Surcharge), et un soutien néon par famille. |
| `recompense` | | Cartes de famille et de set complétés (`rewards.js`) et de quêtes (`story.js`) : jamais en booster. |
| `saison` | | Cartes du passe de saison (`pass.js`), au Set de base quelques mois après leur saison. |

Les sets eux-mêmes (nom, date de sortie, boutique) sont dans `collection.js`.

Champs d'une carte : `name`, `type`, `cost`, `power`, `kw` (la famille, ex. `['Elfe']`, vide pour une neutre), `text` (affiché tel quel), et selon les cas :

| Champ | Effet |
| --- | --- |
| `x` | Coût X : la carte prend tous les sceaux restants (`c.xPaid`). |
| `sacrifice` | Nombre de vos créatures (les plus faibles de la zone) détruites à la révélation ; s'il en manque, la carte est détruite. |
| `mobile` | Déplaçable par le joueur pendant la préparation (aussi sur Bois mouvant ou avec la Reine sylvestre en jeu : `isMobile`). |
| `token` | Jeton : créé par un effet, jamais en collection, disparaît sans aller à la défausse. |
| `raise` | Relève : défaussée depuis la main, la carte entre en jeu avec +1. |
| `egg` | Œuf : éclôt selon son propre effet (`hatch`). |
| `firewall` | Pare-feu : vos créatures dans sa zone (elle comprise) ne peuvent pas être piratées. |
| `malware(st, p)` | Malware (jeton) : la fonction s'exécute quand le joueur `p` pioche la carte, qui disparaît sans être remplacée. |
| `seven` | Sept : les 3 Sept d'un joueur en jeu déclenchent son Jackpot. |
| `effigy` | Famille dont le Sept porte les couleurs (visuel seulement, sans effet de jeu). |
| `floor3` | Tant que la carte est en jeu (et pas piratée), vos dés font au moins 3. |

Une carte en jeu ou en main est un objet `{ uid, id, owner, zone, buff, revealed, pending, order, … }` ; s'y ajoutent selon les effets `costMod` (coût, sans passer sous 1), `discount` (réduction, jusqu'à 0), `implants`, `hacked`, `hatched`, `xPaid`, `mobile`, `enteredTurn`, `movedTurn`, `playerMoved`, `turnStartZone`. `fresh(c)` les efface quand une carte revient de la défausse.

### Crochets

Un effet est une fonction attachée à la carte. Arguments : `c` (la carte en jeu), `st` (l'état de la partie), puis selon le crochet.

| Crochet de carte | Quand |
| --- | --- |
| `onReveal(c, st)` | La carte est révélée (ou entre en jeu par un effet : Relève, Exhumation, invocation). |
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
| `onJackpot(c, st)` | Votre Jackpot se déclenche (une fois par partie). |

Une carte piratée (`c.hacked`, posé par `hack(st, c)`) perd tous ses effets jusqu'à ce qu'elle quitte le jeu : ses crochets ne passent plus que par `fx(c)`, et `self`/`aura` sont ignorés. Un Pare-feu (`firewall`, ou le terrain Pare-feu) l'en protège.

Les généraux ont `activate` (+ `needsZone`, `activateCost`) pour un effet activable une fois par partie, `aura`, `preview` (voit ses terrains à venir), `reroll` (relance un dé de 1 ou 2) et les crochets `onStart`, `onStartTurn`, `onEndTurn`, `onEndGame`, `onDraw`, `onDiscard`, `onSpell`, `onAllyDestroyed`, `onMalware` (un de vos Malwares s'exécute chez l'adversaire), `onHack(p, st, carte)`, `onOverload(p, st, zone, carte)` (Surcharge payée), `onRaise` (une carte se relève), `onRoll(p, st, zone, valeur)` (vous lancez un dé), `onJackpot`, qui reçoivent le numéro du joueur (`p`) au lieu d'une carte. Ces crochets passent par `genHook` : s'il a écrit au journal, le général a agi, et `P.genFired` compte un déclenchement de plus (envoyé dans la vue, `genFired`, pour que l'appli joue son effet). Un général piraté (`hackGeneral`, `genHacked(st, p)`) est muet jusqu'à la fin du tour suivant : ni crochets, ni aura, ni activation. Les boss (`boss: true`, `clan: true` pour ceux de clan) ajoutent `script` (une étape par tour, `bossStep`), `boost` (bonus de vos familles et cartes contre eux, `bossBoost`) et `art`.

Les terrains ont `flat` (bonus de zone), `aura(p, cible, st)`, `onReveal`, `onStartTurn`, `onEndTurn` (avec `p` et la zone), `onAllyDestroyed(p, st, morte, zone, zoneDuTerrain)`, `onCardReveal(p, st, carte, zone)`, `onSpellHere(p, st, zone, sort)`, `onFoeReveal(p, st, carte, zone)` (une créature adverse est révélée ici). Quelques terrains n'ont pas de crochet et sont lus directement par le moteur : Forteresse (`zonePower`), Bois mouvant (`isMobile`), Cimetière et Serveur fantôme (`raise`), Centrale et Décharge (`overload`), Pare-feu (`hack`), Casino des Fosses (`roll`).

### Mécaniques

Les effets s'écrivent avec les petites fonctions du moteur : `buff(st, carte, n)`, `addZone`, `draw(st, p, n, extra)` (`extra` : pioche d'un effet, qui déclenche Inspiration), `summon`, `move`, `destroy(st, carte, par)` (par son propriétaire : un sacrifice), et les sélecteurs `creaturesAt(st, p, zone)`, `mine(st, p)`, `weakest`, `strongest`, `bestZone` (la zone où l'on est le plus en retard, avec une place libre). Puis, mécanique par mécanique :

| Mécanique | Fonction | Ce qu'elle fait |
| --- | --- | --- |
| Horde | `horde(st, p, z, x)` | Crée une Horde de puissance X, ou fait grandir celle de la zone (une par zone). |
| Festin | `feast(st, p, z, x)` | Même principe ; en fin de tour, votre Gobelin le plus faible ici le dévore (`devour`). |
| Défausse, Relève | `discardFromHand(st, p, n)` | Défausse les cartes avec Relève de la main, les plus chères d'abord ; elles se relèvent (`raise`). |
| Exhumation | `exhume(st, p, z, coûtMax)` | La créature la plus puissante de la défausse revient en jeu ici. |
| Drain | `drain(st, source, cible, n, où)`, `drainHand` | La cible perd n (en jeu, en main ou dans le deck), la source gagne n (`P.stolen`). |
| Échange | `swap(st, p, z, choix)` | Votre créature négative la plus faible ici passe chez l'adversaire contre la créature choisie. |
| Œuf | `hatch(st, œuf)` | Une créature à 5 sceaux ou plus du deck prend sa place ; sinon l'Œuf gagne +3. |
| Malware | `malware(st, p, n, sorte)` | N Malwares (`virus`, `ver`, `rancon` ou `mix`) glissés parmi les 6 premières cartes du deck adverse. |
| Piratage | `hack(st, carte)`, `hackGeneral(st, p)` | Coupe les effets d'une créature, ou le général jusqu'à la fin du tour suivant. |
| Implant | `implant(st, carte, n)` | +N et un Implant de plus (`c.implants`). |
| Surcharge | `overload(st, carte, n)` | Dépense N sceaux gardés (1 de moins sur Centrale) ; renvoie `true` si c'est payé. |
| Pari | `pari(st, c, bas, milieu, haut)` | Lance le dé de la carte (`roll`) et appelle la fonction de sa tranche : 1-2, 3-5 ou 6. |
| Dés pipés | `load(st, p, n)` | Les n prochains dés du joueur font 6 sans être lancés (`P.loaded`). |
| Triche | `tutor(st, p, test)` | Met sur le deck la première carte qui passe le test, puis la pioche (une pioche d'effet). |
| Jackpot | `checkJackpot(st, p)` | Appelé quand un Sept entre en jeu : voir plus bas. |

### Dés et Jackpot (Faites vos jeux)

`roll(st, p, z, c, id)` lance un dé pour le joueur `p` dans la zone `z` (`c` : la carte, `null` pour un terrain) et renvoie le résultat. Un dé pipé fait 6 tout de suite. Sinon : `d6` (les valeurs de `st.dice` d'abord, puis le hasard), relance d'un 1 ou d'un 2 si le général a `reroll` (Fortuna), +1 sur le Casino des Fosses (au plus 6), et 3 au moins si une carte `floor3` est en jeu. Chaque dé compte dans `P.sixes` (6) ou `P.lows` (1 ou 2), s'ajoute à `P.rolls` (les 8 derniers : `{ n, v, uid, z }`, que l'appli anime), allonge `st.pause` de 450 ms et appelle `onRoll` du général.

Le Jackpot se déclenche la première fois que les 3 Sept d'un joueur sont en jeu en même temps, qu'ils soient révélés ou entrés par un effet : `P.jackpot` note le tour, ses créatures gagnent +2, puis les `onJackpot` de ses cartes en jeu et de son général se déclenchent, et `st.pause` s'allonge de 2,2 s pour l'animation. Une fois par partie.

## État d'une partie

`newGame(deck0, deck1, noms, { generals, turns })` renvoie un objet simple (sérialisable en JSON). Un deck est la clé d'un deck préconstruit ou un objet `{ name, cards, terrains, general }`.

```js
st = {
  turn, phase, turns,     // numéro du tour ; 'plan' | 'reveal' | 'over' ; nombre de tours s'il diffère de TURNS
  leader,                 // joueur qui résout en premier (celui qui mène)
  p: [P0, P1],            // les deux joueurs
  log: [{ turn, msg, kind, vars }],
  nextUid, order,         // compteurs : identifiant des jetons, ordre de pose
  over, result,           // fin de partie : { winner (0, 1 ou -1), reason, zones, tot, forfeit?, interrupted? }
  trace,                  // à chaque fin de tour : { pow: puissance des zones de chaque joueur, n: cartes révélées } (historique)
  sim,                    // true dans les copies simulées par l'IA (pas de journal ni de trace)
  dice, pause,            // dés imposés (tutoriel, tests) ; attente en plus après l'étape en cours (ms)
}
P = {
  name, deckName, deckKey, general, generalUsed, generalUses, genFired, genHacked,
  deck: [carte], hand: [carte], discard: [carte], board: [[carte], [carte], [carte]],
  terrains: [id|null ×3], terrainPlan: [{ t, z, turn }], zoneBonus: [n ×3],
  seals, bonusSeals, treasure, lastUnspent, perfectTurns, lost, stolen, feasts, spells,
  malwareRun, overloads, loaded, sixes, lows, rolls, rollCount, jackpot,
  moves: [{ uid, zone, from }], played: [id],   // déplacements prévus ; cartes révélées (stats)
}
```

`generalUses` compte les déclenchements limités d'un général (Valdric, Mammon, Lysandre…) ; `angelBoost` et `returnMoves` notent le tour où Séraphine ou Lirael ont été activées.

La puissance d'une créature n'est jamais stockée : `power(st, c)` la recalcule (puissance imprimée + `buff` + `self` + auras des créatures, des généraux et des terrains). `zonePower(st, p, z)` additionne la zone avec `zoneBonus`, `flat` et la Forteresse. `costOf(st, c)` donne le coût du moment (`null` pour un coût X).

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
doStep      résout une étape : révélation, sacrifice, onReveal, Jackpot, terrain (onCardReveal, onFoeReveal adverse),
            réactions aux sorts (un sort part ensuite à la défausse).
endTurn     onEndTurn et Grâce des cartes ; Festins dévorés ; effets de fin de tour des terrains et généraux ;
            sceaux non dépensés ajoutés au Trésor ; trace. Au dernier tour : finish (fin de partie, gagnant).
```

`runTurn(st, plans, emit, wait)` enchaîne tout cela : `emit(uid)` est appelé après chaque étape visible (le serveur diffuse alors l'état), `wait(ms)` laisse le temps à l'animation (850 ms par étape, plus `st.pause` ; instantané en simulation). Un effet qui plante est noté dans la console et sauté (`guard`) : la partie va jusqu'au bout. `forfeitGame` (forfait) et `interruptGame` (serveur arrêté) terminent une partie en cours, même pendant la révélation.

L'ordre de résolution compte : le joueur qui mène résout d'abord, zones de gauche à droite, puis dans l'ordre de pose (`ordered(st)`).

## Journal

Une ligne du journal est un modèle français et ses variables : `log(st, '⟦{p}⟧ ⟦{p}|révèle|révélez⟧ {card} ({z}).', 'reveal', { p, card: nm(id), z: zn(z) })`. Les marqueurs `⟦0⟧` (nom du joueur 0, ou « Vous ») et `⟦0|révèle|révélez⟧` (forme selon qui regarde) se résolvent par siège ; `⟪c:id⟫`, `⟪g:id⟫`, `⟪t:id⟫` et `⟪z:n⟫` (`nm`, `gn`, `tn`, `zn`) deviennent le nom d'une carte, d'un général, d'un terrain ou d'une zone dans la langue du lecteur. `renderLog(ligne, siège, noms)` traduit le modèle (`i18n.js`) puis remplace les marqueurs ; les traductions anglaises sont dans `lang/en/log.js` (voir [Traduction](traduction.md)). Dans une simulation (`st.sim`), rien n'est écrit.

## Détail d'une partie

`gameDetail(st)` résume une partie terminée pour l'historique des joueurs (pas de replay) : tours joués, `trace` (puissance des 3 zones de chaque joueur à chaque fin de tour, avant les effets de fin de partie) et, par joueur, puissance finale des zones, terrains, `cut` (nombre de cartes révélées à la fin de chaque tour, pour découper `played` tour par tour), Trésor, tours parfaits, sorts, créatures perdues, général activé et ses déclenchements (`genFired`). `endTurn` remplit `st.trace` hors simulation ; la copie de l'IA (`clone`) et `npm run empreinte` la laissent de côté.

## Vue d'un joueur

`viewFor(st, siège, extra)` construit ce qu'un joueur a le droit de voir : sa main avec les coûts du moment, ses cartes cachées, la puissance des cartes révélées, le nombre de cartes de l'adversaire, ses cartes cachées sous forme `{ hidden: true }`, les dés de chacun (`loaded`, `sixes`, `rolls`, `jackpot`), le nombre de tours (`turns`) et les 80 derniers messages du journal. C'est la seule chose envoyée à l'appli.

## IA (`aiPlan`)

`aiPlan(st, p, essais)` tire au hasard `essais` plans possibles (cartes jouables, zones, déplacements, général parfois ; 3 plans sur 10 gardent 1 ou 2 sceaux pour une Surcharge ou le Trésor), simule chacun sur une copie de l'état (ses propres révélations puis la fin de tour) et garde le plan le mieux noté par `evalFor` : avance dans chaque zone (lissée par `tanh`), plus la valeur future du Trésor (Dragon), des tours parfaits (Ange), des Malwares glissés dans le deck adverse, des dés pipés en réserve et des Sept déjà en jeu. Le plan de l'adversaire n'est pas deviné ; un plan dont la simulation plante est écarté. `aiSearch(st, p, essais)` fait la même recherche et renvoie aussi la note du meilleur plan (`{ plan, value }`) : on peut ainsi la découper en tranches et garder le meilleur de toutes (partie contre l'IA dans la page, `client/src/solo.js`).

Réglages : 250 essais contre un joueur (`solo.js`), de 15 (Bronze) à 500 (Maître) en partie classée (`TIERS`, `ranked.js`), ceux de chaque chapitre de quête (`story.js`) et de chaque table du casino (`casino.js`), 80 dans `npm run sim` et `equilibrage`, 60 dans `npm run empreinte`, 20 dans les tests. La copie de l'état (`clone`) laisse de côté le journal et la trace ; c'est la partie la plus coûteuse de l'IA.

## Collection (`collection.js`)

- `STARTERS` : les 3 decks de départ (`gobelin`, `elfe`, `demon`) ; `starterKit` donne leurs 15 cartes et leurs généraux.
- `COLLECTIBLE` (cartes hors jetons), `OWNABLE` (cartes et généraux hors boss), `BOOSTER_POOL` (contenu du booster quotidien) : tableaux mis à jour sur place quand un catalogue est appliqué.
- `openBooster(collection)` : 3 cartes dont au moins une nouvelle tant qu'il en manque.
- `deckError(deck, compte)` : message d'erreur ou `null` si le deck est jouable (15 cartes différentes possédées, 5 terrains autorisés, un général possédé). `draftError` accepte un deck incomplet (`MAX_DECKS` decks par joueur).
- `allowedTerrains` : terrains neutres et ceux des familles dont le joueur possède un général, sauf ceux d'un set pas encore sorti.
- `deckCode(deck)` / `readDeckCode(code)` : code de deck à partager (`DK1-` puis nom, général, terrains et cartes en base64url) ; il ne dépend pas de la collection. `fitDeck(deck, compte)` ramène un deck (code ou recette) à la collection : `deck` avec ce que le joueur possède, `missing` (général, terrains, cartes ; `unknown` compte les identifiants inconnus ou d'un set pas sorti, sans les nommer), `complete`. `recipeKeys()` : decks préconstruits proposés en recettes (ceux des sets sortis).
- `SETS` / `DEFAULT_SETS` : sets dans l'ordre du code (`base`, `set2`, `tapis`, `set3`) avec leurs cartes, `open` (en boutique), `daily` (booster quotidien), `teaser`, `boosterExtra` (Éclats ajoutés au prix du booster), `reveal` (date de sortie) et `mini` (mini-set : seul le set complet est récompensé, `isMini`).
- `unrevealed(id, jour)` : carte, général, terrain ou deck d'un set pas encore sorti (`setRevealed`), caché de la boutique, de la collection et de l'IA ; `aiDeckKeys(jour)` : decks que l'IA peut jouer.
- Boutique : `SHOP` (prix et tailles), `dailyOffers` (cartes du jour), `dupOffers` (doublons du jour), `setBooster`, `setBoosterPrice`, `shopOrder`, `SHARDS_PER_DUPLICATE`.
- `EXCHANGE_TIERS`, `exchangeOffers(rate)`, `exchangeFor(rate, need)` : offres fixes du change de Prismes en Éclats (bonus pour les grosses offres), et celle à proposer quand il manque `need` Éclats (la plus petite qui suffit, sinon la plus grosse).
- `today()` : le jour à Paris (`AAAA-MM-JJ`) ; tout ce qui est quotidien bascule à minuit, heure française.

## Catalogue (`catalog.js`)

Le catalogue publié depuis `/admin` retouche des cartes (`CARD_FIELDS` : nom, type, coût, puissance, famille, texte, déplaçable, coût X, sacrifice) et en crée de nouvelles qui reprennent l'effet d'une carte existante (`effect`, parmi `EFFECT_SOURCES`). `applyCatalog(cat)` repart des cartes d'origine (`BASE_CARDS`), applique les retouches et met à jour `CARDS`, `COLLECTIBLE`, `OWNABLE`, `SETS` et `BOOSTER_POOL` sur place, si bien que le reste du code n'a rien à faire de plus ; il range aussi au Set de base les cartes de saison et de quête sorties (`cat.seasonCards`, joint par le serveur). `catalogError` refuse un catalogue invalide (on repart alors du catalogue vide) ; `withNewcomers` range dans leur set d'origine les cartes, généraux et sets ajoutés au code après l'enregistrement d'un catalogue (`known`, `knownIds`).

## Récompenses (`rewards.js`)

Données partagées par le serveur (qui calcule) et l'appli (qui affiche) : réglages chiffrés par défaut (`DEFAULT_REWARDS`, bornes dans `REWARD_LIMITS`), courbe d'XP (`xpToNext`), missions du jour et de la semaine (`MISSIONS`, `WEEKLY_MISSIONS`), leçons du tutoriel (`TUTO_LESSONS`), succès (`ACHIEVEMENTS`), récompenses de famille et de set (`FAMILY_REWARDS`, `SET_REWARDS` : un Dieu par set, l'As de pique pour le mini-set), titres, cadres et dos de carte, niveaux de carte (`CARD_LEVELS` : nom, bordure `look`, effet `fx` ; `levelCost(n)` lit les coûts dans les réglages), calendrier du mois (`loginReward`, `loginCalendar`) et bienvenue des nouveaux comptes (`welcomeReward`). Les choix chiffrés sont justifiés dans la proposition d'économie (`recompenses/economie.md`, dans les fichiers du projet Claude, pas dans ce dépôt).

## Passe de saison (`pass.js`)

Une saison par mois (`SEASONS` : `2026-10` Nuit des citrouilles, `2026-11` Néon 2099), dévoilée à `start` (le 1er par défaut, `currentSeason`). Chacune a 2 ou 3 cartes uniques (set `saison`), des familles pour ses missions, ses cosmétiques gratuits et premium, son thème d'interface et des arts Promo. `passTrack(saison, réglages)` donne les `PASS_TIERS` (40) paliers des deux pistes ; `tierOf(xp)` le palier atteint ; `refundTier` le palier où la piste premium a rendu son prix. `PASS_KINDS` décrit les sortes de mission ; `releasedCards(mois, n)` les cartes de saison arrivées au Set de base ; `weekOf(jour)` le lundi de la semaine du jeu (aussi utilisé par les boss et les clans).

## Arts alternatifs (`arts.js`)

Catalogue des arts (`ARTS` : carte, nom, rareté, famille d'arts `theme`), trois raretés (rare, épique, légendaire) avec leur prix par défaut en Prismes et leur poids de tirage (`ART_RARITIES`), prix d'un art selon les réglages (`artPrice`), arts du jour d'un joueur (`artOffers` : pondérés par rareté, ceux de ses cartes trois fois plus souvent), contenu et chances du coffre (`chestPool`, `chestRates`). Les éditions à part ne sont jamais au coffre ni dans les arts du jour : Promo (donnée, avec `how`), Essence (rayon Essence, `essenceArtPrice`), Clan, Boss et Casino (vendues dans leur magasin). Les coffres offerts viennent des succès rares (`chests` dans `ACHIEVEMENTS`) et des dimanches du calendrier du mois. Les Prismes se gagnent avec les succès et en fin de saison classée (réglages `rankPrisms…`, voir `seasonPrismsKey`, `ranked.js`). Purement cosmétique : le moteur de partie ne les lit pas.

## Mode classé (`ranked.js`)

Le rang d'un joueur tient en un nombre d'étoiles `r` : 3 étoiles par division, 3 divisions par palier (III, II, I), paliers `TIERS` Bronze, Argent, Or, Platine, Diamant, puis Maître où les étoiles deviennent des points sans plafond (`MASTER`). `rankOf(r)` donne palier, division, étoiles, plancher et libellé.

- `applyResult(r, { result, streak, foeR, mult })` : victoire +1 étoile, plus 1 pour une série de 3 victoires ou plus (jusqu'au Diamant) et plus 1 pour avoir battu un ami mieux classé, le tout multiplié par `mult` (événement « points de classé », `events.js`) ; défaite −1, jamais sous le début du palier ; nul sans effet.
- Chaque palier règle la force de l'IA (`ai` : essais d'`aiPlan`) et ses récompenses de fin de saison (`title`, `frame` ; Éclats dans les réglages `rankShards…` de `rewards.js`, voir `seasonShardsKey`).
- Saisons : une par mois, heure de Paris (`seasonId`, `seasonName`, `seasonDaysLeft`) ; `seasonReset(r)` fait redescendre d'un palier au début de la suivante.
- Classement final : `PLACES` (1re place, podium, top 10) donne en plus des Éclats et Prismes (réglages `rankPlaceShards…` et `rankPlacePrisms…`, voir `placeShardsKey`, `placePrismsKey`) et un titre (`rang:top1`, `rang:top3`, `rang:top10`, avec ceux des places en dessous : `placeTitles`), aux joueurs qui ont joué au moins `rankPlaceGames` parties classées dans la saison.

## Quêtes d'histoire (`story.js`)

Le lore (`LORE`) et les quêtes (`QUESTS`) : trois campagnes, une par deck de départ, qui se suivent comme les livres I à III d'une même histoire (`book` ; `razzia` : Grisk vole la clé du Septième Sceau ; `racines` : Sylvaën retient la fissure ; `pacte` : Morgrath brise le Sceau), toujours ouvertes, et des quêtes à durée limitée (`kind: 'limitee'`, dates par défaut `from`, `to` : `halloween`, `casino`, `eclipse`, `neon`). Chaque quête a son héros, son deck (un deck de départ, parfois retouché), le thème de sa carte, un prologue, la quête qui raconte la suite (`next`, proposée à la fin) et ses chapitres (`C(...)`) : lieu et place sur la carte, enjeu en une phrase (`goal`, sur la fiche du chapitre et avant le combat), adversaire (`foe(nom, général, deck, essais, bonus de zone)`), récompense de la première victoire, dialogues d'avant et d'après, et parfois un allié qui rejoint le deck (`join : { card, out }`, appliqué aux chapitres suivants par `chapterDeck`).

Le dernier chapitre donne en général un art Promo (`arts.js`) et un titre (`STORY_TITLES`) ; les quêtes limitées donnent aussi une carte de récompense (`STORY_CARDS` : `epouvantail`, `de_pipe` pour la quête du casino, `pretre_eclipse`, `coursier_neon` ; set `recompense`, jamais en booster). Réglages de `/admin` (`questCfg`, `DEFAULT_STORY`, `STORY_LIMITS`) : ouverte ou non, dates, nombres de chaque récompense ; `questState` dit si une quête est `open`, `soon`, `over`, `archive` ou `off`. Une quête d'événement qui fait avancer l'histoire (`canon` : Éclipse, Signal perdu) passe à sa fin dans l'histoire principale (`archive`, `questTab`) : même progression, mais `chapterReward(…, archive)` retire l'art Promo et remplace la carte de quête par `CARD_SHARDS` Éclats, et `releasedStoryCards` met sa carte dans le booster du Set de base (le serveur la joint au catalogue). Une quête non canon (Halloween, casino) disparaît à sa fin.

Dialogues : une réplique est `[qui, texte]` ou `[qui, texte, illustration]` ; `qui` est un général, une carte (son illustration sert de portrait) ou `NARRATOR` ; chaque chapitre a un lieu illustré (`scene`, table `SCENES` : un terrain ou une carte), montré en tête des dialogues (`lineScene`). Les essais de l'IA et les decks adverses ont été réglés par simulation : environ 60 à 80 % de victoires au premier chapitre et 55 à 75 % au dernier. Une quête de plus : une entrée dans `QUESTS` (avec ses arts dans `arts.js` et son titre dans `STORY_TITLES`), son décor dans `DECOR` et `SKY` (`client/src/story.js`) ; le chargement vérifie que chaque général et chaque carte existe.

## Événements temporaires (`events.js`)

Un événement multiplie un gain (`EVENT_EFFECTS` : `xp`, `ranked`, `shards`, `passXp`) par `mult` (`MULTS` : ×1,5, ×2 ou ×3) pendant une période (`EVENT_WHEN`) : chaque week-end, dernier week-end du mois (le dernier samedi et le lendemain), dernière semaine du mois (les 7 derniers jours) ou entre deux dates (`from`, `to`). Les jours sont ceux du jeu (heure de Paris), de minuit à minuit.

- `DEFAULT_EVENTS` : week-end double XP et semaine double points de classé, tant que `/admin` n'a rien enregistré.
- `occurrence(ev, jour)` : la période qui contient ce jour, ou la prochaine ; `isLive`, `liveEvents`, `daysLeft`, `dayEnd`, `periodLabel`.
- `multiplier(events, effet, jour)` : le plus fort des événements en cours sur cet effet (ils ne se cumulent pas) ; `boost(n, mult)` arrondit le gain.
- Nouvel effet : une entrée dans `EVENT_EFFECTS`, puis `events.mult('<effet>')` là où le gain se calcule (`server/src/progress.js`).

## Casino du Sept d'or (`casino.js`)

L'événement du mini-set « Faites vos jeux », aux dates de la quête `casino` (`CASINO_QUEST`). On y gagne des Jetons, une monnaie qui ne vit que le temps de l'événement :

- quête : `QUEST_CHIPS` Jetons par chapitre, à la première victoire ;
- machine à sous : `SLOT_PULLS` tirages par jour, `spinReels()` tire 3 rouleaux pondérés (`REEL`), `slotPay(rouleaux)` donne le meilleur gain de `SLOT_PAYS` (de 10 Jetons de consolation à 300 pour 7 7 7) ;
- Quitte ou double : `TABLE_RUNS` montées par jour sur les `TABLES` (pot, essais de l'IA, bonus de zone adverses ; la dernière contre le deck `tapis` et Fortuna). Chaque table gagnée met un pot sur le tapis, à encaisser ou à remettre en jeu ; une défaite fait tout perdre sauf `CONSOLATION`. `drawTable(i, decks)` tire l'adversaire et une règle de la maison (`RULES` : `setup(st)` modifie la partie, `pot` le gain, voir `tablePot`) ; `tableGame(table)` donne le deck adverse, les essais et la préparation à passer à la partie.

Les Jetons se dépensent à la boutique (`CASINO_SHOP` : thème, cadre, arts de l'édition Casino, titre, puis ressources limitées par événement ; `itemReady` cache ce qui n'existe pas encore). `casinoPhase(cfg, jour)` vaut `soon`, `open`, `shop` (la boutique reste ouverte `SHOP_GRACE` jours après la quête) ou `over`. Le serveur (`server/src/casino.js`) fait foi, l'appli joue les parties.

## Thèmes et émotes (`themes.js`, `emotes.js`)

`EXTRA_THEMES` : thèmes de l'interface à l'effigie d'un général (`card`, `art`), vendus en Éclats ou Prismes (`price`, `prisms`), en essence (`essence`), au magasin du boss (`boss`), à la boutique d'un événement (`event`) ou gagnés par un succès. `THEMES` les réunit avec ceux des saisons ; `themeShop(id)` dit où le trouver, `themeOut(id)` s'il est sorti (`reveal`).

`EMOTES` : icône et phrase, offertes (`free`), vendues (`price`, `prisms`) ou gagnées par un succès. `emoteSet` donne le sélecteur d'un compte (`EMOTE_SLOTS` au plus), `EMOTE_COOLDOWN_MS` et `EMOTE_MAX` limitent l'envoi, `aiReply` fait répondre l'IA aux politesses.

## Boss et clans (`boss.js`, `clan-boss.js`, `clans.js`)

Boss mondial : un boss par semaine (`bossOfWeek`, rotation des généraux `boss: true` hors clan). `newBossGame(deck, boss)` lance la partie : le boss joue en siège 1, sans deck ni terrain, avec un Sbire par zone, et applique son script. `bossScore` compte les points (puissance, zones pleines, zones gagnées), `tiersReached` et `rankBracket` donnent les récompenses ; `BOSS_SHOP` vend contre des Insignes ; `DEFAULT_BOSS` et `BOSS_LIMITS` pour `/admin`.

Boss de clan : ouvert par le clan au niveau choisi (`CLAN_BOSS_LEVELS` : PV, multiplicateur), `CLAN_BOSS_TRIES` tentatives par membre pendant `CLAN_BOSS_DAYS` jours ; `clanBossDamage` retire les points des zones à ses PV, `clanBossReward` donne la récompense du palier atteint.

Clans : niveaux (`CLAN_LEVELS`), missions de clan (`CLAN_MISSION_KINDS`, `clanTarget`, `clanShare`), dons (`DONATIONS`), rôles et droits (`CLAN_ROLES`, `canDo`), projets du trésor (`CLAN_PROJECTS`), magasin en Écus (`CLAN_SHOP`) et classement mensuel (`CLAN_PLACES`). Le fonctionnement côté serveur est dans [Serveur](serveur.md).

## Traduction (`i18n.js`, `lang/en`)

`t`, `tp`, `msg`, `tMsg` traduisent les textes français du code ; `lang/en` contient le dictionnaire anglais du moteur (cartes, journal, données, histoire, serveur). Tout est expliqué dans [Traduction](traduction.md).

## Tests

`npm test` lance `node --test packages/engine/test/*.test.js` (une seconde environ, sans installation), aussi sur GitHub à chaque pull request et à chaque push sur `main` (`.github/workflows/tests.yml`).

| Fichier | Ce qu'il vérifie |
| --- | --- |
| `cartes.test.js` | Données cohérentes (champs des cartes, decks de 15 cartes, exactement 3 Sept) ; chaque carte jouable, chaque terrain et chaque général (hors boss) joués sur un plateau garni, sans erreur. |
| `mecaniques.test.js` | Une petite situation par règle : bases (coût, emplacements, sacrifice, sorts, main pleine, Surcharge), Défausse et Relève, Pari et dés, Jackpot, Horde et Festin, terrains, Drain, Échange, Piratage, Malware, Œuf, Grâce, fin de partie. |
| `parties.test.js` | Parties complètes IA contre IA (20 essais) pour chaque deck préconstruit, dans les deux sièges : elles finissent au 7e tour, sans effet en erreur, sans dépasser la main, les emplacements ni passer sous 0 sceau. |

`aide.js` monte des parties contrôlées :

- `partie({ seals, generals, turn })` : deux joueurs sans main, sans deck ni terrain prévu, avec 10 sceaux et le Cartographe (sans effet) par défaut ;
- `enJeu(st, p, id, z, buff)` : une carte déjà en jeu, face visible, sans son effet Révélation ;
- `enMain`, `enDeck` : une carte dans la main ou au bout du deck ;
- `jouer(st, p, id, z)` : pose la carte face cachée puis résout la révélation comme pendant un tour ;
- `pw`, `zp`, `ids` : puissance d'une carte, d'une zone, identifiants d'une liste.

Pour un Pari, `st.dice` impose les prochains dés :

```js
test('Joueuse de dés : un 6 donne +4', () => {
  const st = partie(); st.dice = [6];
  const c = jouer(st, 0, 'joueuse_des', 0);
  assert.equal(pw(st, c), 5);
});
```

Une nouvelle mécanique mérite son test dans `mecaniques.test.js` ; une nouvelle carte est déjà couverte par `cartes.test.js` (elle ne plante pas) et `parties.test.js` (si elle est dans un deck).

## Outils

```bash
npm test                     # tests du moteur (voir Tests)
npm run sim -- 60            # taux de victoire de chaque deck contre chaque deck (60 parties par duel), tous les decks
npm run sim -- 20 generaux   # chaque général avec le deck de sa famille, contre tous les decks
npm run equilibrage -- decks 150     # matrice des decks sur tous les cœurs (300 parties par paire)
npm run equilibrage -- generaux 60   # apport de chaque général face au même deck sans général (Cartographe)
npm run equilibrage -- cartes 60     # apport de chaque carte face à une créature sans effet du même coût
# equilibrage : seuls les decks et généraux des sets déjà sortis jouent (comme l'IA du jeu) ; ajoutez « tous » après le nombre
# de parties pour inclure les sets à venir, ou une date (AAAA-MM-JJ) pour les sets sortis ce jour-là.
npm run eco                  # jours pour compléter un set selon la façon de jouer, puis niveaux de carte atteints
npm run empreinte            # empreinte de 484 parties à hasard fixé, chaque deck contre chaque deck (voir Recettes)
```
