# Traduction (français, anglais)

Le jeu est écrit en français ; l'anglais passe par des dictionnaires « texte français → texte anglais ». Le texte français
écrit dans le code sert de clé : un texte sans traduction s'affiche simplement en français. Un nouveau texte marche donc
tout de suite, il reste à l'ajouter au dictionnaire anglais.

La langue se choisit au premier lancement (proposée d'après celle de l'appareil), puis dans les réglages du profil ; elle est gardée
sur l'appareil (`localStorage`, `jeu-lang`) et en changer recharge la page (`client/src/lang.js`). La page `/admin` reste en français.

## Écrire un texte

```js
import { t, tp, msg } from '@jeu/engine/i18n';

t('Booster du jour')                                   // « Daily booster »
t('Il vous faut {n} Éclats (vous en avez {have}).', { n: price, have })
tp(n, '{n} carte', '{n} cartes')                       // singulier/pluriel selon la langue ({n} vaut n)
tp(n, '{n} coffre d\'arts', '{n} coffres d\'arts', { x })  // d'autres variables en plus de {n}
```

- Le premier argument est **toujours un texte littéral** entre `'…'` (ou `` `…` `` sans `${}`) : c'est ce que relève `npm run i18n`.
  Les valeurs qui changent passent par `{nom}` et l'objet de variables, jamais par `${}` dans le texte.
- Une phrase reste entière dans un seul `t()` : l'ordre des mots change d'une langue à l'autre. Pas de `t('Vous avez') + n + t('cartes')`.
- Le HTML peut rester dans le texte quand il fait partie de la phrase (`t('Touchez <b>Valider</b> pour finir le tour.')`) ;
  les variables sont insérées telles quelles : échappez-les avant (`esc(nom)`) comme avant.
- Pluriel : `tp(n, un, plusieurs)`. En français 0 et 1 sont au singulier, en anglais seul 1 l'est.
  Les anciennes formes `${n > 1 ? 's' : ''}` deviennent `tp(n, '{n} carte', '{n} cartes')`.
- Données (noms de cartes, de titres, d'émotes…) : `t(x.name)` à l'affichage. Les cartes, généraux, terrains, decks et sets
  sont traduits une fois pour toutes au démarrage de l'appli (`localizeCatalog`, `client/src/lang.js`) : `CARDS[id].name`
  est déjà dans la bonne langue. Une table du moteur affichée par `t(x.champ)` s'ajoute à `scripts/i18n-tables.js`.
  Un nouveau mot-clé de carte s'ajoute aussi à `KEYWORDS_EN` (`client/src/common.js`), qui le met en gras en anglais.
- Un texte calculé au chargement d'un module (`const LABELS = { a: t('…') }`) marche aussi : la langue est fixée avant
  le chargement des autres modules (premier import de `main.js`), et changer de langue recharge la page.
- Attention aux variables locales nommées `t` (élément touché, temps…) : elles masquent la fonction. Renommez la variable locale.
- Dates et nombres : `toLocaleDateString(locale(), …)`, `locale()` venant de `@jeu/engine/i18n`.

## Textes rédigés ailleurs que dans l'appli

Un texte rangé ou envoyé par le serveur (journal de partie, journal du clan, courrier du jeu) est gardé sous la forme
`msg('modèle français', { variables })`, soit `['modèle', { … }]`, et traduit au moment de l'afficher par `tMsg(m)`.
Une variable peut elle-même être un `['modèle', { … }]`.

Un texte composé par le serveur et rangé dans un objet (courrier, journal du clan…) garde son champ en français (`title`)
et, s'il contient des variables, y ajoute `titleMsg: msg('modèle', { … })`. L'appli l'affiche par `tField(objet, 'title')` :
le `…Msg` traduit s'il existe, sinon le texte français traduit tel quel (textes fixes, notes de mise à jour).
Une annonce des Nouveautés porte sa version anglaise avec elle (`en: { title, summary, body }`, écrite dans `/admin` ou dans `server/src/news-seed.js`).

Journal de partie (`engine.js`) : `log(st, 'modèle', genre, variables)`, affiché par `renderLog`. Marqueurs :
`⟦{p}⟧` nom du joueur p (« Vous » pour celui qui regarde), `⟦{p}|il pioche|vous piochez⟧` une forme ou l'autre selon qui
regarde (`@` y vaut le nom du joueur), `⟪c:id⟫` `⟪g:id⟫` `⟪t:id⟫` noms de carte, de général, de terrain, `⟪z:n⟫` nom de zone.

Serveur : l'appli envoie sa langue (en-tête `X-Lang` des appels à l'API, champ `lang` du premier message WebSocket) ;
le serveur traduit ses messages d'erreur avec `tr(langue, …)`, et les textes composés par le moteur (`deckError`…)
avec `withLang(langue, () => …)` (fonction synchrone seulement).

## Dictionnaires

| Fichier | Contenu |
| --- | --- |
| `packages/engine/src/lang/en/cards.js` | Cartes, généraux, terrains, familles, zones, mots-clés |
| `packages/engine/src/lang/en/log.js` | Journal de partie |
| `packages/engine/src/lang/en/data.js` | Récompenses, titres, émotes, saisons, arts, événements, clans, boss, sets et decks |
| `packages/engine/src/lang/en/story.js` | Quêtes d'histoire |
| `packages/engine/src/lang/en/server.js` | Textes du serveur (erreurs, notifications, courriers) |
| `client/src/lang/en/*.js` | Écrans de l'appli |

Tous les fichiers d'une langue sont fusionnés en un seul dictionnaire : peu importe où un texte est rangé, et un texte présent deux fois
n'a qu'une traduction (celle du fichier chargé en dernier dans `index.js`).

## Vérifier

```bash
npm run i18n          # textes sans traduction, par fichier, et variables qui ne correspondent pas
npm run i18n -- --all # la liste complète
npm run i18n -- --strict # code d'erreur s'il manque des textes
```

## Ajouter une langue

Ajouter la langue à `LANGS` et `LOCALES` (`packages/engine/src/i18n.js`), créer ses dictionnaires sur le modèle de `lang/en`, et les charger
dans `client/src/lang.js` (et `server/src/index.js` pour le serveur, `scripts/i18n.js` pour la vérification). `deviceLang` (`lang.js`)
ne propose que le français ou l'anglais d'après l'appareil, et les annonces des Nouveautés n'ont qu'une version anglaise (`en`).

## Lexique anglais

Anglais américain, ton de jeu de cartes, court et direct (« Draw a card. », « Your creatures here get +1. »).
Les noms propres (généraux, personnages) gardent leur nom ; leur titre se traduit (« Séraphine, Hand of Dawn »).

| Français | Anglais |
| --- | --- |
| Éclats, Prismes, essence (universelle) | Shards, Prisms, (universal) essence |
| Jetons, Insignes, Écus, points de classé | Chips, Insignia, Crowns, ranked points |
| sceau, sceaux | seal, seals |
| booster, booster du jour, coffre d'arts | booster, daily booster, art chest |
| carte, créature, sort, jeton, général, terrain | card, creature, spell, token, general, terrain |
| main, deck, pioche (piocher), défausse | hand, deck, draw, discard pile (discard) |
| puissance, coût, zone (Gauche, Centre, Droite) | power, cost, zone (Left, Center, Right) |
| Neutre, Générique | Neutral, Generic |
| Ange, Démon, Gobelin, Elfe, Dragon, Mort-vivant, Vampire, Hacker, Cyborg | Angel, Demon, Goblin, Elf, Dragon, Undead, Vampire, Hacker, Cyborg |
| Révélation, Persistant, Grâce, Destruction, Déplacement, Déplaçable | Reveal, Ongoing, Grace, Death, Move, Movable |
| Sortilège, Inspiration, Éclosion, Œuf, Relève, Exhumation, Échange | Spellcast, Inspire, Hatch, Egg, Rise, Exhume, Swap |
| Activable, Trésor, Magot, Coût X | Activate, Treasure, Hoard, X cost |
| Début de tour, Fin de tour, Début de partie, Fin de partie | Start of turn, End of turn, Start of game, End of game |
| Sacrifice, Horde, Drain, Festin, Défausse | Sacrifice, Horde, Drain, Feast, Discard |
| Malware, Piratage, Implant, Surcharge, Pare-feu | Malware, Hack, Implant, Overload, Firewall |
| Pari, dé pipé, Sept, Jackpot | Bet, loaded die, Seven, Jackpot |
| tour, Valider, Victoire, Défaite, Égalité, Match nul | turn, Confirm, Victory, Defeat, Tie, Draw |
| partie, partie classée, rang, saison, passe de saison, palier | match, ranked match, rank, season, season pass, tier |
| missions du jour, succès, titre, cadre, dos de carte, émote, thème | daily missions, achievements, title, frame, card back, emote, theme |
| art alternatif, rareté, niveau, bordure | alternate art, rarity, level, border |
| Accueil, Collection, Boutique, Change, Profil, Courrier, Amis, défi | Home, Collection, Shop, Exchange, Profile, Mail, Friends, challenge |
| clan, boss mondial, quêtes d'histoire, calendrier, Initiation, Codex | clan, world boss, story quests, calendar, Tutorial, Codex |
