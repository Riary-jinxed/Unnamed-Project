# Serveur (`server`)

Un seul processus Node : `server/src/index.js` sert l'appli compilée, l'API JSON sous `/api` et les parties en ligne sur `/ws`. Il dépend de `ws` (WebSocket), `pg` (PostgreSQL) et `web-push` (notifications).

Au démarrage, dans l'ordre : ouverture du stockage, chargement des comptes (avec mises à niveau des anciens comptes), application du catalogue publié, vérification des complétions et succès déjà atteints (`syncAll`), envoi des notes de mise à jour nouvelles (`notes-maj.js`) et des annonces nouvelles (`news-seed.js`), premier passage des notifications planifiées, création des autres modules, puis écoute du port.

Tâches de fond : chaque minute (`index.js`), rafraîchissement du catalogue (`catalog.refresh`), clôture de la saison classée (`progress.closeSeason`) et de la semaine du boss mondial (`boss.closeWeek`), annonce du boss de la semaine (`boss.announce`), parution des annonces programmées (`news.announce`), fermeture des boss de clan (`clanBoss.tick`) et ménage des salons. Toutes les 30 secondes, ping des WebSockets ; toutes les 5 minutes, notifications planifiées (`push.tick`).

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `PORT` | Port d'écoute (8787 par défaut). |
| `DATABASE_URL` | Base PostgreSQL. Absente : fichiers JSON (voir « Stockage »). |
| `DATA_FILE` | Mode fichier : chemin de `comptes.json` (par défaut `server/data/comptes.json`) ; `reglages.json` et `parties.json` sont rangés à côté. |
| `ADMIN_KEY` | Clé de l'administration (`X-Admin-Key`). Absente : tout `/api/admin/` répond 503. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Clés des notifications. Absentes : créées une fois et rangées dans le document `push`. |
| `VAPID_SUBJECT` | Contact VAPID (Apple en exige un valable). Sinon `RENDER_EXTERNAL_URL`, sinon `mailto:notifications@example.com`. |
| `RENDER` | Posée par Render. Sans `DATABASE_URL`, le serveur avertit que les comptes seront perdus au prochain déploiement. |
| `RENDER_EXTERNAL_URL` | Posée par Render : contact VAPID par défaut. |
| `RENDER_GIT_COMMIT` | Posée par Render : commit (7 caractères) joint à chaque signalement de bug. |

## Stockage

`store.js` choisit le support :

- **`DATABASE_URL` défini** (production, Neon) : PostgreSQL, pool de 3 connexions, SSL sauf en local. Trois tables, créées si elles manquent :

  | Table | Colonnes | Contenu |
  | --- | --- | --- |
  | `comptes` | `login` (clé), `data` (jsonb), `updated_at` | Un compte entier par ligne. |
  | `reglages` | `cle` (clé), `data` (jsonb), `updated_at` | Documents de réglages, voir ci-dessous. |
  | `parties` | `id`, `data` (jsonb), `created_at` | Une partie terminée par ligne (stats de `/admin`, historique des joueurs : voir « Partie enregistrée »). |

- **Sinon** (développement) : fichiers `comptes.json`, `reglages.json` et `parties.json`, réécrits en entier à chaque changement (écriture dans un fichier temporaire puis renommage, une écriture à la fois par fichier).

Tout est chargé en mémoire au démarrage, documents de réglages et parties compris. Le reste du serveur ne voit que l'interface du store : `get(login)`, `all()`, `put(compte)`, `remove(login)`, `doc(clé)`, `putDoc(clé, data)`, `removeDoc(clé)`, `games()`, `addGame(partie)`. Chaque modification est écrite aussitôt.

Documents de la table `reglages` :

| Clé | Écrit par | Contenu |
| --- | --- | --- |
| `jeu` | onglet Boutique | Réglages de la boutique (`DEFAULT_SETTINGS`, `accounts.js`) : prix, cartes par booster, Éclats par doublon, cartes du jour, doublons du jour (`dupOffers`, `dupPrice`), arts (`artOffers`, `chestPrice`, `artPrice_<rareté>`), change (`prismShards`), rayon Essence (`essArtPrice_<rareté>`, `essFramePrice`), `rotation`. |
| `recompenses` | onglet Récompenses | Valeurs qui remplacent `DEFAULT_REWARDS` (dont le calendrier : `loginShards`, `loginChests`, `loginPrisms` ; le passe de saison : `pass…`), missions, Éclats, Prismes et coffres des succès, objectifs des missions du passe (`passPool`) et missions de saison (`passMissions`). |
| `brouillon` | onglets Cartes et Sets | Catalogue en cours de modification. |
| `catalogue` | « Publier dans le jeu » | Catalogue publié, appliqué au moteur. |
| `evenements` | onglet Événements | `{ list }` : événements temporaires (`events.js` du moteur). Absent ou vide : `DEFAULT_EVENTS`. |
| `classement` | `progress.closeSeason` | `{ [saison]: { closed, top } }` : classement classé figé de chaque saison. |
| `clans`, `classement-clans` | `clans.js`, `clan-boss.js` | `{ [id]: clan }` (boss de clan compris) ; `{ [saison]: { closed, top } }` : classement des clans figé chaque mois. |
| `boss` | onglet Boss mondial | Réglages du boss mondial (vide : `DEFAULT_BOSS`). |
| `boss-classement`, `boss-annonce` | `boss.js` | `{ [semaine]: { closed, boss, n, top } }` : classement figé de chaque semaine ; `{ week }` : semaine dont l'arrivée a déjà été notifiée. |
| `quetes` | onglet Quêtes | Réglages des quêtes d'histoire (ouverture, dates, récompenses). Les dates de la quête `casino` sont aussi celles de l'événement du casino. |
| `courrier`, `codes` | `mail.js` | `{ messages, notes }` : messages de `/admin` et notes de mise à jour déjà envoyées ; `{ codes }` : codes cadeaux. |
| `nouveautes` | `news.js` | `{ posts, seeded }` : annonces, et identifiants de `news-seed.js` déjà publiés. |
| `signalements`, `signalement-img-<id>` | `bugs.js` | `{ reports }` : les 300 derniers signalements ; `{ data }` : la capture d'un signalement. |
| `compteurs` | `activity.js` | Par jour (`AAAA-MM-JJ`, heure de Paris, 400 jours au plus), une clé par compteur. Onglet Stats (`COUNTERS`) : boosters du jour, achetés et offerts ouverts, cartes du jour et doublons du jour achetés, coffres d'arts ouverts, arts achetés, changes de Prismes en Éclats, échanges d'essence universelle. Onglet Suivi : `bossRuns`, `bossBuys`, `clanBossOpened`, `clanBossRuns`, `storyChapters`, `emotesOnline`, `emotesSolo` et `emote:<id>`, `emotesBought`, `themesBought` et `theme:<id>`, `deckShared`, `deckImported`, `deckRecipe`, `pushSent:<sorte>` (une par joueur) et `pushOpened:<sorte>`. |
| `push` | `push.js` | `keys` : clés VAPID (sauf si les variables sont définies) ; `sent` : envois planifiés déjà faits (`ev-<événement>-<premier jour>`, `saison-<AAAA-MM>`), 60 jours. |

## Compte joueur

Un compte est un objet JSON (colonne `data`) :

| Champ | Contenu |
| --- | --- |
| `login`, `name`, `avatar` | Identifiant, pseudo, image de profil (data URL de 160 px, 60 Ko au plus). |
| `pass` | `{ salt, hash }` (scrypt). Jamais envoyé à l'appli. |
| `tokens` | Sessions ouvertes (10 au plus ; la plus ancienne est fermée au-delà). |
| `disabled`, `created` | Compte désactivé, date de création. |
| `lang` | Langue de l'appli (`fr` si absente), rangée à la connexion et à chaque changement de l'en-tête `X-Lang` ou du champ `lang` d'un message WebSocket. Sert aux notifications, au nom de l'IA et aux textes composés par le moteur. |
| `starter` | Deck de départ choisi (`null` avant le premier choix). |
| `cards` | Collection : `{ id: 1 }` (un exemplaire ; les doublons deviennent des Éclats). |
| `shards` | Éclats. |
| `essence`, `cardLevels` | Essence de chaque carte (gagnée avec ses doublons) et niveau cosmétique atteint (`{ id: 2..5 }`, 1 si absent), le même pour tous les arts de la carte. |
| `lvLook` | Bordure choisie, quand ce n'est pas celle du niveau (`{ id: 1..niveau − 1 }`). L'adversaire la voit (`badge.borders`) ; le reflet et le débordement restent ceux du niveau. |
| `holoOff`, `popOff` | Cartes dont le joueur a coupé le reflet holographique ou le débordement du personnage (`{ id: true }`). |
| `uniEssence` | Essence universelle : l'essence des doublons au-delà du plafond d'une carte (de quoi la monter jusqu'au niveau maximum). |
| `dupShop` | Doublons du jour : `{ date, rotation, n, offers, bought }`. |
| `decks`, `active` | Jusqu'à 10 decks `{ id, name, general, terrains, cards }` ; identifiant du deck joué. |
| `lastBooster` | Jour du dernier booster quotidien ouvert. |
| `shop` | Par set : `{ date, rotation, offers, bought }`, les cartes du jour du joueur. |
| `level`, `xp`, `freeBoosters` | Niveau, XP vers le niveau suivant, boosters offerts à ouvrir. |
| `stats` | Compteurs des succès : parties, victoires, séries, missions, victoires par famille, parties du jour, coffres ouverts, victoires classées, meilleur palier, défis gagnés contre un ami, jours de connexion, mois parfaits, boss, chapitres et quêtes. |
| `missions` | `{ date, rerolls, list }` : les missions du jour. |
| `weekly` | `{ week, bonus, list }` : les missions de la semaine (hors passe), `week` le lundi, `bonus` vrai une fois le bonus de fin donné. |
| `calendar` | `{ month, days }` : jours du mois dont la récompense de connexion est prise (remis à zéro chaque mois). |
| `freeChests` | Coffres d'arts offerts à ouvrir (succès rares, dimanches du calendrier). |
| `welcome` | Bienvenue des 7 jours : `{ start, days }` (création, dates des cadeaux pris). Posé à la création du compte ; absent des comptes plus anciens. Gardé par la remise à zéro, qui vide seulement `days`. |
| `achievements`, `completed` | Succès obtenus ; familles (`set:famille`) et sets complétés, avec leur date. |
| `cosmetics.emotes`, `emoteSet` | Émotes gagnées ou achetées (les émotes offertes de `emotes.js` ne sont pas listées : tout le monde les a) ; émotes du sélecteur en partie, dans l'ordre choisi (absent : les émotes offertes). |
| `cosmetics`, `title`, `frame`, `back`, `uiTheme` | Titres, cadres, dos et thèmes de l'interface débloqués (`cosmetics.themes`, un par passe de saison, au palier `THEME_TIER`) ; ceux qui sont portés. `uiTheme` : `null` suit la saison en cours, `base` garde le thème de base, sinon un thème débloqué. |
| `inbox` | Récompenses gagnées à montrer au joueur (40 au plus), vidée quand il les a vues. |
| `friends`, `friendsIn`, `friendsOut` | Identifiants des amis, des demandes reçues et des demandes envoyées (100 amis au plus). |
| `seasonPass` | Passe de saison du mois : `{ season, xp, premium, free, prem, day, week, sm, done }` (XP de saison, premium acheté, derniers paliers donnés sur chaque piste, missions du jour et de la semaine, avancement et missions de saison accomplies, `bonus` : coffres de fin de passe ouverts). Repart à zéro chaque saison. |
| `ranked` | Mode classé : `{ season, r, best, games, wins, streak }` (saison `AAAA-MM`, rang en étoiles, meilleur rang de la saison, parties, victoires et série en classé). |
| `tuto`, `tutoGift` | Leçons du tutoriel déjà récompensées (identifiants de `TUTO_LESSONS`) ; cadeau d'amélioration reçu (absent : l'appli le propose sur l'accueil, anciens comptes compris). |
| `activeDays` | Derniers jours (90 au plus) où le joueur a utilisé l'appli connecté, ajoutés à sa première requête du jour. Pour les onglets Stats et Suivi ; jamais remis à zéro. |

Les modules rangent aussi leurs propres champs, décrits avec eux (voir « Modules ») : `prisms`, `arts`, `artSel`, `artShop` (arts), `mail`, `redeemed` (courrier), `newsRead` (nouveautés), `push`, `clan`, `clanCoins`, `clanReq`, `clanDon`, `boss`, `bossCoins`, `bossBuys`, `bossDecks`, `story`, `casino`.

Les anciens comptes sont mis à niveau au démarrage (`accounts.js` : `convertDuplicates`, `migrateDecks`, `grantStarterGenerals`, `progress.init`, `progress.settleCapped`, et `retireArts` qui retire les arts de `RETIRED_ARTS` et rembourse leurs Prismes par la boîte de récompenses) ; rien n'est jamais supprimé de la base par ces mises à niveau.

## Partie enregistrée

Une ligne de `parties` (`store.addGame`), écrite à la fin de la partie, après les récompenses :

| Champ | Contenu |
| --- | --- |
| `id`, `at` | Identifiant, date de fin. |
| `mode`, `ranked`, `kind` | `pvp` ou `pve` ; partie classée ; type vu par le joueur : `salon` (code), `defi`, `defi-classe`, `classe-ia`, `ia` (dans l'appli). |
| `winner`, `reason`, `forfeit` | Siège gagnant (0, 1, −1 pour un nul), raison, partie arrêtée par un abandon. |
| `zones`, `turns`, `ms` | Gagnant de chaque zone, tours joués, durée. |
| `trace` | Pour chaque fin de tour : puissance des 3 zones de chaque siège (`gameDetail` du moteur). |
| `players` | Par siège : `login` (`null` pour l'IA), `name`, `general`, `deck`, `cards` (deck complet), `played` (cartes révélées), `pow` (puissance finale des zones), `terrains`, `cut` (nombre de cartes de `played` à la fin de chaque tour), `treasure`, `perfect`, `spells`, `lost`, `gen`, `genFired`, `gain` (`{ xp, shards, stars }`). |

Les parties enregistrées avant l'historique n'ont que `mode`, `ranked`, `at`, `winner`, `reason` et, par siège, `login` à `played` : l'historique les montre sans détail. Pour une partie contre l'IA, l'appli envoie le détail (`detail`, `ms`) avec le résultat ; le serveur le relit et le borne (`cleanDetail`). Les tentatives contre un boss ne sont pas enregistrées ici.

## Modules

| Fichier | Rôle |
| --- | --- |
| `index.js` | Assemble le tout, sert les fichiers, gère les salons, les WebSockets et les tâches de fond. |
| `store.js` | `openStore()` : stockage (voir « Stockage »). |
| `i18n.js` | Langue du joueur côté serveur : `langOf(compte)`, `validLang` (en-tête `X-Lang`, champ `lang` d'un message WebSocket), `withLang` et `inLang` pour produire les textes du moteur dans sa langue (voir `docs/traduction.md`). |
| `accounts.js` | `createAccounts(store)` : sessions, connexion, deck de départ, booster quotidien, boutique, decks, profil, administration des comptes et de la boutique ; crée `progress`, `arts` et `activity`. `apiHandler` : le routeur de l'API. |
| `progress.js` | `createProgress(store)` : XP et niveaux, missions, succès, complétions, cosmétiques, calendrier, bienvenue, passe de saison, rang classé et saisons, réglages des récompenses. Crée `events` (`progress.events`). Appelé par `accounts.js` (nouvelles cartes, booster, fin de partie). |
| `arts.js` | `createArts(store, cfg)` : arts alternatifs (arts du jour, coffre, rayon Essence, art choisi, reflet holographique et débordement coupés carte par carte), et leur administration. |
| `games.js` | `createGames(store, accounts)` : enregistre les parties (JcJ par le serveur, JcE envoyées par l'appli), calcule les stats de `/admin` et du profil, et l'historique de chaque joueur (`playerHistory`). |
| `cards.js` | `createCatalog(store, accounts)` : brouillon du catalogue, publication (refusée si elle retire une carte qu'un joueur possède), catalogue public (plus les cartes de saison et de quête arrivées dans le Set de base). |
| `activity.js` | `createActivity(store)` : jours d'activité des joueurs (`seen`, appelé par le routeur), compteurs du jour (`count`, une clé ou une liste de clés), et leur synthèse pour l'onglet Stats (`stats`). |
| `follow.js` | `createFollow(store, accounts, { boss, events })` : onglet Suivi de `/admin`, calculé à la demande à partir des comptes, des parties, des documents `clans`, `boss-classement`, `quetes` et des compteurs ; et `POST /api/track`, ce que l'appli signale et que le serveur ne voit pas passer (40 par minute et par joueur au plus). |
| `friends.js` | `createFriends(store, accounts, salons)` : amis et demandes, présence (qui est connecté, qui est en partie), défis entre amis, et `notify` (message à un joueur connecté, par sa connexion de présence). |
| `events.js` | `createEvents(store)` : liste des événements temporaires (document `evenements`), multiplicateur du jour (`mult`), ce qu'en voit le joueur (`view` : événements en cours avec période et fin), un message du courrier par événement en cours (`mails`, ajouté par `mail.js` le temps de l'événement, identifiant `ev-<événement>-<premier jour>`) et routes `/api/admin/events`. `progress.js` multiplie ainsi l'XP des parties, des missions et des nouvelles cartes, les Éclats et l'XP de saison des parties, et les étoiles d'une victoire classée. |
| `mail.js` | `createMail(store, accounts, { notify })` : courrier (messages de `/admin` à tous ou à quelques joueurs, avec récompense facultative, document `courrier`), notes de mise à jour (`publishNotes`) et codes cadeaux (document `codes`, 10 codes faux par heure au plus). Un nouveau message envoie `mail` aux joueurs connectés. Comptes : `mail = { read, got, hidden }`, `redeemed`. |
| `notes-maj.js` | `NOTES_MAJ` : notes de mise à jour, envoyées une seule fois dans le courrier de tous les comptes existants au premier démarrage du serveur qui les contient (identifiants retenus dans `courrier.notes`). Pour une nouvelle note : l'ajouter en fin de liste avec un identifiant nouveau. |
| `bugs.js` | `createBugs(store)` : signalements de bugs envoyés depuis le courrier (document `signalements`, 300 derniers ; chaque capture à part dans `signalement-img-<id>`, envoyée à `/admin` seulement quand on l'ouvre), 5 par joueur et par heure au plus. Contexte joint par l'appli (version, appareil, écran, dernières erreurs) et commit du serveur (`RENDER_GIT_COMMIT`). |
| `news.js` | `createNews(store, accounts, { notify })` : Nouveautés, le journal des annonces (mises à jour majeures, nouveaux sets, annonce du prochain set, événements ; document `nouveautes`, 100 annonces). Une annonce paraît à son jour de parution (`from`, heure de Paris : programmable à l'avance), avec un jour annoncé facultatif pour le compte à rebours, un set, une version anglaise et une notification push facultative (sorte `news`, dès 10 h). À sa parution, `news` part aux joueurs connectés. Compte : `newsRead` ; `account.news = { unread, top, last }` pour l'accueil. |
| `news-seed.js` | `NEWS_SEED` : annonces écrites dans le code, publiées une seule fois chacune au premier démarrage qui les contient (`publishSeed`, identifiants dans `nouveautes.seeded`) ; ensuite, elles se modifient depuis `/admin`. |
| `preview.js` | Zone de test : un compte testeur a un jour d'aperçu (`a.preview`, réglé dans la fiche du compte sur `/admin`). Ses requêtes (`usePreview` dans `apiHandler`) et ses messages WebSocket (`atPreview`) tournent à ce jour-là grâce à `AsyncLocalStorage` : `today()` du moteur le rend, donc sets, decks, terrains, événements, saisons du passe, quêtes et annonces de ce jour sont visibles et jouables pour lui seul. Ce qui est partagé reste au vrai jour : classé, Boss mondial et clans (dates passées explicitement), compteurs de Stats et cartes de quête du catalogue (`realToday()`). Le classé, les défis classés et les Boss lui sont fermés tant que le jour est réglé. L'appli fait de même côté navigateur (`setPreviewDay` dans `main.js`) et affiche « Aperçu au … » en haut de l'écran. |
| `planning.js` | `planning({ store, events, boss, posts })` : ce qui est en cours et ce qui arrive dans les 45 jours (sorties de sets, saisons du passe et du classé, quêtes limitées avec les dates de `/admin`, événements (chaque période sur 31 jours : tous les week-ends double XP, la semaine double classé), Boss mondial de la semaine et du suivant, annonces avec un jour annoncé), pour l'onglet À venir des Nouveautés. |
| `push.js` | `createPush(store, accounts, { isOnline, events })` : notifications push (Web Push). Comptes : `push = { subs, off, daily }` (abonnements des appareils, 5 au plus ; sortes coupées ; jour du dernier rappel). Sortes (`PUSH_KINDS`) : `daily` (rappel à 18 h, heure de Paris, si la récompense de connexion du jour n'est pas récupérée, joueurs venus ces 14 derniers jours), `events` (début d'un événement à 10 h ; arrivée du Boss mondial à 10 h, par `boss.announce`), `social` (demandes d'ami et de clan, envoyées par `friends.js` et `clans.js`), `news` (annonce parue, par `news.js`), `season` (dernier jour du mois à 12 h). Rien n'est envoyé à un joueur qui a l'appli ouverte. Un appareil appartient au dernier compte qui s'y abonne ; la déconnexion le retire. Vérification toutes les 5 minutes : le serveur endormi (Render gratuit) envoie au réveil. |
| `clans.js` | `createClans(store, accounts, push)` : clans (document `clans`), missions de clan avancées à chaque fin de partie (`accounts.setGameHook`), dons contre des Écus, magasin du clan, classement des clans figé à la fin du mois en même temps que le classement classé (`progress.setSeasonHook`, document `classement-clans`) avec ses récompenses et bannières. Comptes : `clan`, `clanCoins`, `clanReq`, `clanDon`. Rôles (`roles` : `adjoint`, `souschef` ; Maître = `leader`) avec leurs droits (`CLAN_RIGHTS` du moteur), trésor (`bank`) et projets (`boosts`, `chest`). |
| `boss.js` | `createBoss(store, accounts)` : boss mondial (`packages/engine/src/boss.js`). Tentatives du jour (`start`, comptée dès que la partie commence), score et paliers d'une tentative (`finish`, appelé à la fin de la partie ou à l'abandon), classement de la semaine figé chaque lundi à minuit avec les récompenses de chaque tranche (`closeWeek`, appelé chaque minute et quand un joueur passe à la semaine suivante ; document `boss-classement`), notification d'arrivée (`announce`, document `boss-annonce`), magasin du boss, tuile de l'accueil (`tile`, dans `accounts.me`), decks préparés contre un boss (`deckFor`), réglages de `/admin` (document `boss`). Comptes : `boss` (`{ week, boss, total, best, runs, day, used, last }`), `bossCoins` (Insignes), `bossBuys`, `bossDecks`. |
| `clan-boss.js` | `createClanBoss(store, accounts, clans)` : boss de clan (`packages/engine/src/clan-boss.js`). Ouverture par le Maître ou un adjoint (`open`, un par semaine, niveau jusqu'à celui du clan), tentatives des membres (`start`, comptée dès que la partie commence ; `finish` retire les dégâts aux PV, et ferme le boss à zéro), fermeture à la fin du temps (`tick`, appelé chaque minute, qui attend 20 minutes les tentatives commencées avant la fin) avec les récompenses de chaque membre selon la part des PV retirés et l'XP du clan. Rangé sur le clan (document `clans`) : `raid`, `raidLast`, `raidWeek`. Résumé dans la vue du clan (`clans.setRaidView`). |
| `story.js` | `createStory(store, accounts, { onChange, onChapter })` : quêtes d'histoire (`packages/engine/src/story.js`). Vue du joueur (`view` : quêtes ouvertes, et quêtes limitées qui commencent dans 7 jours ou moins, nom et date seulement), tuile de l'accueil (`tile`, dans `accounts.me` sous `storyTile`), victoire d'un chapitre (`win`) : la quête doit être ouverte et le chapitre le suivant (ou un chapitre déjà gagné, rejoué sans récompense) ; la récompense (`chapterReward`) n'est donnée qu'une fois, plus ce qu'y ajoute `onChapter` (Jetons du casino). Le combat se joue dans la page, comme une partie contre l'IA : le résultat est cru sur parole, comme `POST /api/games/solo`. Comptes : `story` (`{ [quête]: chapitres gagnés }`). Statistiques des succès : `storyChapters`, `storyCampaigns`, `storyLimited`. Une quête d'événement canon finie reste jouable dans l'histoire principale (`archive`, sans art Promo, Éclats à la place de la carte) ; sa carte rejoint le booster du Set de base (`releasedCards`, joint au catalogue par `cards.js` avec `setExtraCards`, comme les cartes de saison ; `onChange` rafraîchit le catalogue quand `/admin` change les dates). Réglages de `/admin` dans le document `quetes`. |
| `casino.js` | `createCasino(store, accounts)` : événement du casino du Sept d'or (`packages/engine/src/casino.js`), aux dates de la quête `casino` (document `quetes`). Phases (`casinoPhase`) : `soon`, `open`, `shop` (boutique seule, `SHOP_GRACE` jours après la fin), `over`. Jetons gagnés aux chapitres de la quête (première victoire pendant l'événement), à la machine à sous (`SLOT_PULLS` tirages par jour, tirés par le serveur) et au Quitte ou double (`TABLE_RUNS` montées par jour, une fois la quête finie : le serveur tire l'adversaire et la règle de chaque table et tient le pot ; la partie se joue dans la page et son résultat est cru sur parole ; une défaite perd le pot et donne `CONSOLATION` Jetons). Boutique en Jetons (`CASINO_SHOP`). Un nouvel événement repart de zéro, Jetons compris. Compte : `casino = { ev, chips, spin, runs, run, buys }`. Tuile de l'accueil (`casino`, dans `accounts.me`). |

Chaque module renvoie ses routes sous la forme `{ 'MÉTHODE /chemin': (compte, corps, session, url, langue) => réponse }`, ajoutées au routeur.

## API

Toutes les routes répondent en JSON, sans cache. Une erreur renvoie `{ error: "message lisible" }` avec un code HTTP (`HttpError` dans le code). Les réponses de plus de 2 Ko sont compressées si le navigateur l'accepte. Le corps d'une requête est limité à 100 Ko (413 au-delà).

**Langue** : l'appli envoie l'en-tête `X-Lang`. Les messages d'erreur sont traduits dans cette langue (français sans en-tête : `/admin` et anciennes versions de l'appli), et la langue est rangée sur le compte (`lang`) quand elle change.

**Sans session** : `POST /api/login` (`{ login, password }` → `{ token, account }`), `GET /api/catalog` (catalogue publié, plus `seasonCards` : cartes de saison et de quête arrivées dans le Set de base, et `stamp`, qui change avec l'un ou l'autre). Hors API : `GET /health` répond `ok`.

**Avec session** (`Authorization: Bearer <token>`) :

| Route | Effet |
| --- | --- |
| `GET /api/me` | Compte du joueur (`account`), avec sa progression, la version du catalogue et les tuiles de l'accueil (`mail`, `boss`, `storyTile`, `casino`, `news`). |
| `POST /api/logout` | Ferme la session. |
| `POST /api/starter` | Choisit le deck de départ (`{ starter }`), une seule fois. |
| `POST /api/booster` | Ouvre le booster du jour. |
| `PUT /api/decks` | Crée (sans `id`) ou enregistre un deck, même incomplet ; `play: true` le rend joué s'il est complet. `from: 'code'` ou `'recipe'` : nouveau deck repris d'un code ou d'une recette (compté pour l'onglet Suivi). |
| `POST /api/decks/rename`, `/play`, `/reset`, `/delete` | Renomme, joue, vide ou supprime un deck (`{ id }`). |
| `PUT /api/deck` | Ancienne route : enregistre le deck joué. |
| `POST /api/track` | `{ what, id }` : `deckShare` (code de deck copié), `emote` (émote `id` envoyée contre l'IA), `pushOpen` (notification de la sorte `id` touchée). Compteurs de l'onglet Suivi. |
| `PUT /api/profile` | Pseudo et/ou image de profil. |
| `GET /api/profile` | Stats du joueur (dont ses 5 cartes les plus jouées, `cards`), succès, avancement des familles et des sets. |
| `GET /api/history` | Historique du joueur (onglet Historique du profil) : ses 100 dernières parties vues de son côté (`games` : type, résultat, durée, zones, puissance à chaque fin de tour, cartes révélées tour par tour, compteurs, gains ; de l'adversaire, seulement les cartes révélées) et un bilan sur toutes ses parties (`summary` : taux, série en cours et record, forme des 10 dernières, zones gagnées en moyenne, victoires 3 zones, durée moyenne, par type, par deck, contre chaque général). |
| `GET /api/player?login=…` | Profil public d'un joueur (pop-up du classement) : image, cadre, titre, niveau, victoires, général et cartes les plus joués, arts préférés, rang de la saison, clan, lien d'ami avec vous (`friend`). |
| `GET /api/shop` | Boutique : prix et offres du jour par set. |
| `POST /api/shop/card`, `/api/shop/booster` | Achète une carte du jour ou un booster (`free: true` : booster offert). |
| `POST /api/shop/art`, `/api/shop/chest` | Arts alternatifs (`arts.js`) : payés en Prismes. `{ art }` achète un art du jour ; le coffre donne un art classique pas encore possédé, au hasard selon sa rareté (`{ free: true }` : avec un coffre offert). Renvoie `art` et la boutique à jour. |
| `POST /api/shop/convert` | `{ offer }` : change des Prismes en Éclats par une offre fixe (`exchangeOffers` du moteur, bâties sur le taux `prismShards` ; 0 : fermé). Jamais l'inverse ni au détail. |
| `POST /api/shop/dup` | `{ card }` : achète un doublon du jour (`dupPrice` Éclats) ; il donne `essencePerDuplicate` essence de la carte (au-delà du plafond, de l'essence universelle), sans Éclats. |
| `POST /api/shop/essence-art` | `{ art }` : achète un art de l'édition Essence avec l'essence universelle (`essArtPrice_<rareté>`). Renvoie `art`, la boutique et le compte. |
| `POST /api/shop/essence-frame` | Achète le cadre de la nébuleuse (`ESSENCE_FRAME`) avec l'essence universelle (`essFramePrice`), une fois. |
| `POST /api/shop/emote` | `{ emote }` : achète une émote du rayon Émotes (`price` en Éclats ou `prisms` en Prismes, `emotes.js`). Si le sélecteur n'est pas plein, elle y prend place. |
| `POST /api/shop/theme` | `{ theme }` : achète un thème de l'interface (`themes.js`) du rayon Thèmes (`price` en Éclats ou `prisms` en Prismes) ou du rayon Essence (`essence` en essence universelle), et le choisit. Ceux du boss mondial passent par `POST /api/boss/buy` (`theme:…`), ceux du casino par `POST /api/casino/buy` ; ceux gagnés avec un succès ne sont pas en vente. |
| `POST /api/essence/convert` | `{ card, amount }` : `amount` essence d'une carte possédée qui peut encore monter, contre `amount × uniPerEssence` essence universelle, sans dépasser ce qui lui manque pour le niveau maximum (`progress.convertEssence`). Renvoie `essence`, `price`, la boutique et le compte. |
| `POST /api/cards/upgrade` | `{ card }` : monte une carte possédée d'un niveau contre son essence et des Éclats (`progress.upgradeCard`). |
| `PUT /api/cards/border` | `{ card, level }` : bordure montrée sur la carte, parmi celles des niveaux atteints (`progress.chooseBorder`, compte : `lvLook`) ; son niveau actuel la fait suivre son niveau. |
| `PUT /api/arts/select` | `{ card, art }` : art affiché pour cette carte (`art: null` : l'illustration d'origine). |
| `PUT /api/arts/holo`, `/api/arts/pop` | `{ card, on }` : allume ou coupe, pour cette carte, le reflet holographique (`holoOff`) ou le débordement du personnage (`popOff`). |
| `PUT /api/cosmetics` | Change le titre, le cadre, le dos de carte porté ou le thème de l'interface (`theme`), les 3 arts préférés du profil public (`favArts`) et les émotes du sélecteur en partie (`emotes` : de 1 à `EMOTE_SLOTS` émotes possédées). |
| `POST /api/missions/reroll` | Remplace une mission (`{ index }`). |
| `POST /api/rewards/seen` | Vide la boîte de récompenses. |
| `GET /api/pass` | Passe de saison du mois (`pass`, `null` sans saison) : paliers gratuits et premium, missions du jour, de la semaine et de la saison, arts Promo (palier de la piste gratuite), prix du premium et palier où il est remboursé. |
| `POST /api/pass/premium` | Achète le premium en Prismes ; les récompenses premium des paliers déjà atteints sont données aussitôt. |
| `POST /api/calendar/claim` | Récompense du jour du calendrier du mois (409 si déjà prise). Renvoie `got`. |
| `POST /api/welcome/claim` | Cadeau de bienvenue suivant (409 sans bienvenue, si déjà pris aujourd'hui, fini ou délai passé). Renvoie `got`. |
| `POST /api/tuto` | `{ lesson }` : leçon du tutoriel finie (`TUTO_LESSONS` du moteur). La première fois, donne `tutoShards` Éclats ; quand toutes les leçons de base sont finies (pas celles du tutoriel avancé, marquées `advanced`), `tutoBoosters` boosters offerts. Renvoie `reward` (`kind: 'tuto'`, `shards`, `boosters`, `all`) et le compte. |
| `POST /api/tuto/gift` | Cadeau d'amélioration, une seule fois après le deck de départ (`tutoGift === false`) : un doublon du général du deck joué, et de quoi le monter au niveau 2 (Éclats et essence complétés jusqu'au coût). Renvoie `card`, `shards` et le compte. |
| `POST /api/games/solo` | Résultat d'une partie contre l'IA (non classée) → récompenses. |
| `GET /api/ranked` | Mode classé : rang du joueur (`ranked`), classement de la saison (`ladder`, avec l'image de profil du top 10), récompenses de fin de saison par palier (`rewards`) et par place au classement final (`places`), podium figé de la saison précédente (`last`, ou `null`). |
| `GET /api/mail` | Courrier du joueur (`mail` : messages visibles, lus, récompense récupérée). `account.mail` compte les messages non lus ou à récupérer. |
| `POST /api/mail/read`, `/claim`, `/claim-all`, `/hide` | `{ id }` : marque lu, récupère une récompense (ou toutes), supprime un message (récompense déjà récupérée). |
| `POST /api/redeem` | Utilise un code cadeau `{ code }`, une fois par compte. |
| `POST /api/bugs` | Signale un bug `{ kind, text, shot, context }` : `text` de 10 à 2000 caractères, `shot` capture facultative (data URL, 90 000 caractères au plus). |
| `GET /api/news` | Nouveautés parues (`news` : épinglées d'abord, puis de la plus récente à la plus ancienne), dans la langue du joueur, et `upcoming` : le planning de l'onglet À venir (`planning.js`). |
| `POST /api/news/seen` | Marque toutes les annonces parues comme vues et les renvoie (l'écran Nouveautés l'appelle en s'ouvrant). |
| `GET /api/push` | Notifications : clé publique VAPID, nombre d'appareils abonnés, sortes avec leur état. |
| `POST /api/push/subscribe`, `/unsubscribe` | `{ sub }` (abonnement du navigateur) : abonne l'appareil ; `{ endpoint }` : le retire. |
| `POST /api/push/kinds` | `{ kinds: { sorte: vrai ou faux } }` : sortes reçues. |
| `POST /api/push/test` | Notification d'essai, même appli ouverte (409 sans appareil, 502 si rien n'est parti). |
| `GET /api/friends` | Amis (avec statut `online`, `game` ou `off`, niveau, titre, cadre, empreinte de l'image), demandes reçues et envoyées, défi en cours. |
| `GET /api/friends/avatars` | Images de profil des amis et des demandes (l'appli ne les redemande que si leur empreinte change). |
| `POST /api/friends/add` | Demande d'ami (`{ name }` : identifiant, ou pseudo s'il n'est porté que par un joueur). Si l'autre avait déjà demandé, vous devenez amis. |
| `POST /api/friends/accept`, `/remove` | Accepte une demande ; refuse une demande, annule la sienne ou retire un ami (`{ login }`, des deux côtés). |
| `GET /api/clan` | Écran du clan : le clan du joueur (`clan`, ou `null`), ses Écus, ses dons du jour et le magasin. `GET /api/clan/avatars` : images des membres. |
| `GET /api/clans?q=`, `GET /api/clans/ladder` | Clans à rejoindre (recherche par nom ou étiquette) ; classement des clans du mois, récompenses et podium du mois précédent. |
| `POST /api/clan/create`, `/join`, `/cancel`, `/leave` | Créer un clan (`CLAN_PRICE` : 50 Prismes), le rejoindre (ou demander si sur demande, `{ id }`), annuler sa demande, le quitter. |
| `POST /api/clan/accept`, `/refuse`, `/kick` | `{ login }` : demandes et exclusion (sous-chef et au-dessus ; exclure seulement plus bas que soi). |
| `POST /api/clan/role`, `/promote`, `/claim` | `{ login, role }` : nommer adjoint, sous-chef ou membre (adjoint et au-dessus ; les adjoints, seul le Maître) ; `{ login }` : le Maître passe la main et devient adjoint ; un adjoint prend la tête si le Maître n'est pas venu depuis `CLAN_INACTIVE_DAYS` jours. |
| `POST /api/clan/edit`, `/fund` | Blason, description et accès ; `{ id }` : financer un projet avec le trésor (adjoint et au-dessus). |
| `POST /api/clan/donate`, `/buy` | `{ res, amount }` : don contre des Écus ; `{ item }` : achat au magasin du clan. |
| `GET /api/clan/boss` | Onglet Boss du clan : boss ouvert (PV, niveau, fin, tentatives qui restent, dégâts des membres) ou, sinon, boss et niveaux qu'on peut ouvrir ; récompenses par part de PV, barème des dégâts, dernier boss fermé. `POST /api/clan/boss/open` `{ boss, level }` : ouvrir (Maître et adjoints). |
| `GET /api/boss` | Écran du boss mondial : boss de la semaine (script, cartes renforcées), tentatives du jour, total, meilleure tentative et place, barème, paliers, tranches, Insignes, magasin, boss de la semaine suivante et podium de la semaine passée. `GET /api/boss/ladder` : classement de la semaine ; `GET /api/boss/avatars` : images du top 10. |
| `PUT /api/boss/deck`, `POST /api/boss/deck/reset` | `{ boss, name, general, terrains, cards }` : deck préparé contre un boss mondial ou de clan (compte : `bossDecks`, un par boss, même incomplet) ; complet, il remplace le deck joué pendant les tentatives contre lui. `{ boss }` : le supprimer. |
| `POST /api/boss/buy` | `{ item }` : achat au magasin du boss, en Insignes (ressources limitées par semaine, cosmétiques une fois). |
| `GET /api/story` | Quêtes d'histoire du joueur : pour chaque quête ouverte, ses dates, jours restants, chapitres gagnés et récompense de chaque chapitre ; les quêtes limitées à venir dans 7 jours (`state: 'soon'`). |
| `POST /api/story/win` | `{ quest, chapter }` : chapitre gagné. Renvoie `{ reward, done, story, account }` ; `reward` est `null` pour un chapitre déjà gagné. 409 si la quête n'est pas ouverte ou si un chapitre précédent manque. |
| `GET /api/casino` | `casino` : phase, dates, Jetons, tirages et montées qui restent, montée en cours, boutique. |
| `POST /api/casino/spin` | Un tirage de la machine à sous. Renvoie `spin` (`reels`, `pay`, `name`, `chips`). |
| `POST /api/casino/table` | Commence une montée du Quitte ou double (ou renvoie celle en cours). |
| `POST /api/casino/table/result` | `{ win }` : résultat de la table en cours. Victoire : pot de la table, puis choix (à la dernière table, pot encaissé) ; défaite : pot perdu, Jetons de consolation. Renvoie `outcome`. |
| `POST /api/casino/table/choice` | `{ go }` : table suivante, ou encaisser le pot. |
| `POST /api/casino/buy` | `{ item }` : achat à la boutique du casino (pendant l'événement et `SHOP_GRACE` jours après). |

**Administration** (en-tête `X-Admin-Key: <ADMIN_KEY>`, comparé en temps constant ; sans `ADMIN_KEY` sur le serveur, tout `/api/admin/` répond 503) :

| Route | Effet |
| --- | --- |
| `GET /api/admin/accounts`, `POST /api/admin/accounts` | Liste des comptes ; création ou changement de mot de passe. |
| `GET /api/admin/account?login=` | Fiche complète d'un compte. |
| `POST /api/admin/account/update`, `/cards`, `/starter`, `/reset`, `/booster`, `/shop`, `/logout`, `/delete` | Modifier un compte (pseudo, Éclats, Prismes, essence universelle, niveau, boosters et coffres offerts, désactivation), sa collection, son deck de départ ; le remettre à zéro ; rendre le booster du jour ; renouveler ses offres ; fermer ses sessions ; le supprimer. |
| `POST /api/admin/account/welcome` | Offre ou relance la bienvenue des 7 jours d'un compte : le délai repart d'aujourd'hui. |
| `GET /api/admin/arts`, `POST /api/admin/account/art` | Catalogue des arts avec le nombre de joueurs qui les ont ; donner (`give: true`, pour les Promo) ou retirer un art à un compte. |
| `POST /api/admin/account/theme` | Donner (`give: true`) ou retirer un thème de l'interface à un compte (tests, geste commercial). Retiré, le joueur revient au thème du moment s'il l'avait choisi. |
| `GET/POST /api/admin/settings` | Réglages de la boutique (document `jeu`) ; `renew: true` renouvelle les offres de tous. |
| `GET/POST /api/admin/rewards` | Réglages des récompenses (`reset: true` revient aux valeurs par défaut). |
| `GET/POST /api/admin/events` | Événements temporaires : liste avec leur état (`live`, `period`), effets et périodes possibles. `POST { list }` remplace la liste (20 au plus), `{ reset: true }` revient aux événements par défaut. |
| `GET/POST /api/admin/boss` | Réglages du boss mondial (ouverture, tentatives par jour, barème, rotation, paliers, tranches, prix et limites du magasin) ; `{ reset: true }` revient aux valeurs par défaut. |
| `GET/POST /api/admin/story` | Réglages des quêtes d'histoire (et donc des dates du casino) : ouverte ou non, dates des quêtes limitées, nombres de chaque récompense ; `{ reset: true }` revient aux valeurs par défaut. |
| `GET /api/admin/clans`, `POST /api/admin/clans/delete` | Liste des clans ; dissolution `{ id }`. |
| `GET/POST /api/admin/mail`, `POST /api/admin/mail/delete` | Courrier et codes cadeaux : messages (avec lecteurs et récompenses prises) et codes (avec utilisations) ; envoi `{ title, body, kind, reward, to, until, newcomers }` ; suppression `{ id }`. |
| `POST /api/admin/codes`, `/api/admin/codes/edit` | Crée un code cadeau `{ code, label, reward, max, until }` (sans `code` : tiré au hasard ; 500 codes au plus) ; `{ code, off, remove }` le coupe ou le supprime. |
| `GET/POST /api/admin/news`, `POST /api/admin/news/delete` | Nouveautés : annonces avec leur nombre de lecteurs ; création, ou modification avec `id` (reprogrammée plus tard, elle repart, notification comprise) ; suppression `{ id }`. |
| `GET /api/admin/bugs`, `GET /api/admin/bugs/shot?id=` | Signalements, du plus récent au plus ancien, avec le nombre de nouveaux ; capture d'un signalement. |
| `POST /api/admin/bugs/edit`, `/delete` | `{ id, status, note }` : état (`new`, `seen`, `done`) et note ; `{ id }` : suppression (capture comprise). |
| `GET /api/admin/stats?mode=&days=` | Stats des parties (`all`, `pvp`, `pve` ; sur N jours, 0 = tout), plus `activity` : comptes, joueurs actifs (aujourd'hui, 7 et 30 jours), compteurs de la période et courbe par jour (joueurs actifs, boosters ouverts). |
| `GET /api/admin/follow?days=` | Onglet Suivi (sur N jours, 0 = 90 jours pour le parcours et tout pour les compteurs) : `retention` (`d1`, `d7`, `d30` : comptes revenus N jours ou plus après leur création ; `cohorts` : 8 semaines ; `sticky` ; `churn` : venus ces 30 jours mais pas ces 7), `funnel` (comptes créés sur la période), `welcome`, `clans`, `boss`, `story` (par quête, joueurs arrivés à chaque chapitre), `events` (actifs et parties par jour pendant et hors de chaque événement, 90 jours), `emotes`, `decks`, `push`, `seasons`, `series` (courbes par jour). |
| `GET/PUT /api/admin/catalog`, `POST …/publish`, `POST …/discard` | Brouillon du catalogue, publication, abandon du brouillon. |

## Fichiers statiques

Le reste est servi depuis `client/dist`, lu et compressé (gzip au-delà de 1 Ko) une seule fois par fichier. `/admin` sert `admin.html` ; une adresse inconnue sert `index.html`, sauf une musique absente (404). Cache : un an pour `assets/` (noms à empreinte de Vite), un jour pour `music/`, `no-cache` pour le reste. Les musiques acceptent les requêtes `Range` (Safari).

## Parties en ligne (WebSocket `/ws`)

Messages JSON, champ `t` pour le type. N'importe quel message peut porter `lang` : la langue de la connexion, pour les messages d'erreur et le nom de l'IA (rangée aussi sur le compte).

| De l'appli | Contenu | Réponse |
| --- | --- | --- |
| `create` | `{ auth }` (session) | `lobby` |
| `ranked` | `{ auth, deck? }` | `lobby` puis `state` : partie classée contre l'IA, jouée par le serveur |
| `boss` | `{ auth }` | `lobby` puis `state` : tentative contre le boss mondial de la semaine, jouée par le serveur (`error` s'il ne reste plus de tentative). `rematch` y lance aussitôt une nouvelle tentative ; `leave` en cours de partie la termine avec le plateau du moment. La vue porte `boss` (`{ id, step, score }`) et, à la fin, `reward.boss` (score, paliers, gains, total de la semaine). |
| `clanboss` | `{ auth }` | Comme `boss`, contre le boss ouvert du clan du joueur (`error` sans boss ouvert ou sans tentative). La vue porte `boss` (`{ id, step, score, clan: { hp, max } }` : `score` donne les dégâts du moment, `clan` les PV au début de la tentative) et, à la fin, `reward.boss` (`clan: true`, dégâts, PV restants, tentatives qui restent). |
| `join` | `{ room, auth, deck? }` (`deck` : identifiant du deck à jouer, sinon le deck joué) | `lobby` aux deux, puis `state` (la partie démarre) |
| `rejoin` | `{ room, token }` (jeton du `lobby`) | `state` ou `lobby` ; `gone` si le salon n'existe plus. L'ancienne connexion du siège est fermée. |
| `plan` | `{ cards: [{ uid, zone }], moves: [{ uid, zone }], general, turn }` (12 de chaque au plus ; `turn` : tour visé, un plan renvoyé après une reconnexion pour un tour déjà joué est ignoré) | `state` (attente de l'autre, puis chaque étape de la révélation) |
| `rematch` | | Nouvelle partie quand les deux l'ont demandée |
| `leave` | | `left` à l'adversaire, salon supprimé |
| `ping` | | `pong` (toutes les 10 s : l'appli repère ainsi une connexion morte sans fermeture) |
| `emote` | `{ id }` (émote possédée) | `emote` `{ seat, id }` aux deux joueurs. Ignorée sans partie, si l'émote n'est pas possédée, moins de `EMOTE_COOLDOWN_MS` après la précédente du même joueur ou au-delà de `EMOTE_MAX` par partie. Contre l'IA classée (pas contre un boss), l'IA répond parfois aux politesses (`aiReply`). Couper les émotes de l'adversaire se fait dans l'appli. |

| Du serveur | Contenu |
| --- | --- |
| `lobby` | `{ room, seat, token, names }` |
| `state` | `{ room, view }` : `viewFor` + `flash` (carte à animer), `ready`, `names`, `connected`, `badges` (titre, cadre, dos, niveau, et `looks` : niveau des cartes du deck joué ; pour l'adversaire, seulement son général et les cartes qu'il a déjà révélées, voir `shownBadge`), `away` (par siège : millisecondes avant le forfait d'un joueur déconnecté, sinon `null`), `avatars` (images de profil, seulement dans le premier message de la partie ou après une reconnexion), `ranked`, `boss`, `reward` (fin de partie) |
| `error` | `{ msg }` (session expirée, deck injouable, code inconnu, salon complet ou réservé, plus de tentative) |
| `gone`, `left` | Salon expiré, adversaire parti |

Présence et défis passent par la même adresse, sur une connexion que l'appli garde ouverte tant que le joueur est connecté :

| De l'appli | Contenu | Effet |
| --- | --- | --- |
| `hello` | `{ auth }` | Le joueur est « en ligne » pour ses amis ; `hello` en retour, puis le défi reçu en attente s'il y en a un. `bye` si la session a expiré. |
| `challenge` | `{ to, ranked? }` (identifiant d'un ami ; `ranked` : défi classé) | `challenge` à l'ami, `challenge-sent` au joueur ; `challenge-error` si l'ami n'est pas connecté, est en partie ou a déjà un défi. |
| `challenge-answer` | `{ id, accept }` | Refus : `challenge-gone` aux deux. Accord : salon réservé aux deux, `challenge-ready` `{ room, foe }` aux deux. |
| `challenge-cancel` | `{ id }` | Celui qui a lancé le défi le retire. |
| `challenge-abort` | `{ room }` | Un des deux renonce pendant le choix du deck : salon supprimé, l'autre reçoit `challenge-gone` (ou `left` s'il est déjà entré). |

Le serveur envoie aussi sur cette connexion `friends` (avec parfois `msg`) quand la liste d'un joueur change : demande reçue ou acceptée, ami qui se connecte, se déconnecte, entre en partie ou en sort ; `mail` quand un message arrive dans son courrier ; `news` quand une annonce paraît. Un défi sans réponse expire au bout de 2 minutes. `challenge`, `challenge-sent` et `challenge-ready` portent `ranked` pour un défi classé. Un salon de défi (`invite`) garde une place à chacun des deux amis, qui y entrent avec `join` et le deck choisi ; la partie démarre quand les deux sont là, ensuite tout se passe comme dans un salon à code.

Un salon (`rooms` dans `index.js`) garde ses deux sièges (compte, deck, jeton, socket), l'état de la partie `st`, les plans reçus et les demandes de revanche. Chaque joueur joue le deck enregistré sur son compte au début de chaque partie (revanche comprise). Les plans reçus sont nettoyés par `applyPlan` : une carte absente de la main, trop chère, ou posée dans une zone pleine est ignorée, de même qu'un déplacement impossible.

Déconnexion en pleine partie : le joueur a 60 secondes pour revenir (`rejoin`), sinon il perd par forfait et l'autre gagne (l'IA, contre l'IA classée ; contre un boss, la tentative compte avec le plateau du moment). Si les deux sont partis, personne ne gagne ; le compte à rebours reprend pour celui qui manque encore quand l'autre revient. Une connexion qui ne répond plus aux pings depuis 30 secondes est fermée. Les salons inactifs depuis 2 heures sont supprimés chaque minute ; ils ne survivent pas à un redémarrage du serveur.

Arrêt du serveur (`SIGTERM` d'un redéploiement, ou `SIGINT`) : les parties en cours (hors boss) s'arrêtent avec `interruptGame` du moteur, sont enregistrées dans l'historique avec `interrupted: true` (sans gagnant, récompense ni changement de rang, hors des bilans et des statistiques) et un dernier `state` montre l'écran « Partie interrompue » aux joueurs. Le serveur attend ces enregistrements 15 secondes au plus.

## Progression

- **Fin de partie** (`progress.onGame`) : statistiques, XP et Éclats selon le mode et le résultat (pour les `gamesPerDay` premières parties du jour), avancement des missions, montée de niveau (Éclats à chaque niveau, booster offert tous les `boosterEvery` niveaux), succès. Puis les missions de clan (`clans.onGame`).
- **Nouvelles cartes** (`progress.onCards`) : XP par carte nouvelle, puis vérification des familles et sets complétés (carte unique, titre, dos ou cadre, Éclats, boosters offerts).
- **Missions** : tirées chaque jour parmi celles activées que la collection du joueur permet de faire (famille ou carte demandée tirée parmi ses cartes, une seule mission de famille par jour ; missions « boss mondial » seulement quand il est ouvert, `progress.setNeed`), une peut être remplacée par jour.
- **Calendrier du mois** (`progress.claimDay`, `POST /api/calendar/claim`) : la récompense du jour (`loginReward`) est donnée par `grant` sans passer par la boîte de récompenses (l'appli l'affiche dans le calendrier). Compte aussi `loginDays` et, quand tous les jours du mois sont pris, `perfectMonths`.
- **Succès des fonctions récentes** : `statsOf` calcule arts possédés et légendaires, cartes montées de niveau, amis, meilleur palier classé ; `progress.check(a)` les vérifie après un achat d'art, un coffre, une montée de niveau, un ami accepté ou un don depuis `/admin`. `grant` ajoute les coffres (`chests`) à `freeChests`.
- **Arts alternatifs** (`server/src/arts.js`) : le compte garde `prisms` (monnaie des arts, donnée par `grant` avec les succès et la fin de saison classée), `arts` (arts possédés), `artSel` (art choisi par carte) et `artShop` (arts du jour, renouvelés à minuit ou avec la rotation de la boutique). Le badge de partie porte `arts` comme `looks`, et l'adversaire ne reçoit que ceux du général et des cartes révélées (`shownBadge`, `index.js`).
- **Niveaux de carte** (`progress.upgradeCard`) : chaque doublon donne `essencePerDuplicate` essence de la carte (`addCards`, `accounts.js`) ; passer au niveau n coûte `lvlNEssence` essence et `lvlNShards` Éclats. Les niveaux et leur aspect sont dans `CARD_LEVELS` (`rewards.js`).
- **Essence universelle** (`progress.giveEssence`) : une carte est au plafond quand son essence en réserve suffit à la monter jusqu'au niveau maximum, montée ou non (`essenceToMax`). L'essence qu'elle reçoit au-delà (doublons, doublons du jour, coffre de fin de passe) devient de l'essence universelle, `uniPerDuplicate` pour `essencePerDuplicate`. Elle s'échange contre l'essence d'une autre carte depuis la carte ouverte en grand (`uniPerEssence` pour 1, `progress.convertEssence`), contre un art de l'édition Essence ou le cadre de la nébuleuse au rayon Essence. Au démarrage, l'essence en réserve au-delà du plafond est convertie une pour une (`settleCapped`).
- **Doublons du jour** (`dupDay`, `accounts.js`) : `dupOffers` cartes possédées qui ne sont pas au plafond d'essence (celles des decks d'abord, `dupOffers` de `collection.js`), au prix de `dupPrice` Éclats, renouvelées à minuit ou avec les autres offres.
- Chaque récompense passe par `grant`, qui l'applique au compte et la range dans `inbox` (sauf `silent`).

## Mode classé

Paliers, divisions, étoiles et saisons sont décrits dans `packages/engine/src/ranked.js` (voir `docs/moteur.md`). Côté serveur :

- **Contre l'IA** (`ranked` sur `/ws`, `index.js`) : le salon a un siège IA (`aiSeat` : nom « IA Or »… dans la langue du joueur, `tries` selon le palier du joueur, deck préconstruit au hasard). Quand le joueur envoie son plan, le serveur calcule celui de l'IA (`aiPlan`) et joue le tour. La force de l'IA est relue à chaque revanche. La partie est enregistrée en `pve` avec `ranked: true`.
- **Entre amis** : un défi `ranked` ouvre un salon `ranked: 'friend'` ; la partie est enregistrée en `pvp` avec `ranked: true`.
- **Fin de partie** (`rankedResults`) : `progress.onRanked` met à jour le rang de chaque joueur (le rang de l'ami avant la partie sert au bonus) ; le résultat (`before`, `after`, `delta`, `bonus`, `mult` pendant un événement « points de classé », `promoted`) est ajouté à `reward.ranked`, affiché sur l'écran de fin. Les récompenses habituelles (XP, Éclats, missions) s'appliquent comme pour une partie non classée.
- **Abandon** (`forfeit`) : quitter (`leave`) une partie classée en cours compte comme une défaite, et une victoire pour l'ami resté. Un salon classé qui expire compte comme une défaite pour le seul joueur déconnecté.
- **Saisons** (`progress.syncSeason`) : au premier passage du joueur dans une nouvelle saison, il reçoit les récompenses de son meilleur palier de la saison précédente (Éclats `rankShards…`, réglables dans l'onglet Récompenses ; titre et cadre du palier et de ceux en dessous), puis celles de sa place s'il a fini dans le top 10 du classement final, puis redescend d'un palier.
- **Classement** (`progress.ladder`) : les comptes qui ont joué au moins une partie classée cette saison, par rang, puis victoires.
- **Classement final** (`progress.closeSeason`) : à la fin du mois, le classement de la saison finie est figé dans le document `classement` (les 10 premiers parmi ceux qui ont joué au moins `rankPlaceGames` parties classées), par la tâche de chaque minute ou, au plus tard, avant que le premier compte ne passe à la nouvelle saison. `syncSeason` y lit la place du joueur et ajoute ses récompenses (`PLACES` de `ranked.js`). Seule la saison précédente peut être figée. Le classement des clans est figé en même temps (`setSeasonHook`).

## Sécurité

- Mots de passe hachés avec scrypt et un sel par compte ; vérification asynchrone (ne bloque pas les parties en cours).
- Sessions : jetons aléatoires de 24 octets, 10 par compte au plus. Désactiver un compte ou changer son mot de passe ferme ses sessions.
- Corps de requête limité à 100 Ko ; image de profil et capture d'un signalement vérifiées (format et taille).
- Limites par joueur, gardées en mémoire : 10 codes cadeaux faux par heure, 5 signalements par heure, 40 `POST /api/track` par minute.
- L'adversaire ne reçoit jamais la main ni les cartes cachées ; toutes les règles sont appliquées côté serveur.
- La partie contre l'IA, les chapitres d'histoire et les tables du casino tournent chez le joueur : leur résultat n'est pas vérifiable par le serveur, qui en limite l'effet (récompenses plafonnées par jour ou données une seule fois, deck du compte utilisé, montées du casino comptées par jour). C'est pourquoi la partie classée contre l'IA et les tentatives contre les boss sont jouées par le serveur.
