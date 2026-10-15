# Jeu de cartes

Jeu de cartes à jouer et à collectionner : 7 tours, 3 zones, gagnez 2 zones sur 3.
Cette version sert à tester le jeu entre amis : une appli web installable sur téléphone, en français ou en anglais, des parties en ligne avec un code, et des modes contre l'IA.

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `packages/engine` | Le moteur de règles et les données du jeu : cartes, généraux, terrains et decks préconstruits (`engine.js`), collection, boutique et règles de deck (`collection.js`), récompenses, succès et missions (`rewards.js`), passe de saison (`pass.js`), classé (`ranked.js`), arts alternatifs (`arts.js`), émotes (`emotes.js`), thèmes de l'interface (`themes.js`), événements temporaires (`events.js`), boss (`boss.js`, `clan-boss.js`), clans (`clans.js`), quêtes d'histoire (`story.js`), casino (`casino.js`), traduction anglaise (`lang/en`). Il ne dépend de rien. |
| `server` | Le serveur de parties et des comptes : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées à l'adversaire, API des comptes, amis, clans, courrier, notifications push. Il sert aussi l'appli compilée. |
| `client` | L'appli web (PWA) : accueil, collection, decks, boutique, social, plateau, modes contre l'IA, profil et réglages. Plus la page `/admin` (comptes, réglages et contenus du jeu). |

Les sets du jeu (décompte tiré de `engine.js`, sans les jetons) :

| Set | Sortie | Cartes | Généraux | Terrains | Familles |
| --- | --- | --- | --- | --- | --- |
| Set de base | dès le début | 60 | 12 | 15 | Ange, Démon, Gobelin, Elfe et Dragon (11 cartes chacune), 5 neutres |
| Crépuscule (set 2) | sorti | 57 | 10 | 11 | Mort-vivant et Vampire (11 chacune), 6 cartes de soutien pour chacune des 5 familles de base, 5 neutres |
| Faites vos jeux (mini-set 2.5, casino) | 23 octobre 2026 | 24 | 2 | 3 | 15 neutres (Pari au dé, triche, les trois Sept du Jackpot), 3 cartes chacune pour Ange, Gobelin et Démon |
| Cité Néon (set 3) | 2 novembre 2026 | 57 | 12 | 13 | Hacker et Cyborg (12 chacune), soutien des 7 autres familles, 5 neutres |

S'y ajoutent 29 cartes de récompense (familles et sets complétés, jamais en booster), 5 cartes uniques des passes de saison, et 22 decks préconstruits (12 du Set de base, 1 de Faites vos jeux, 9 de Cité Néon). Un set daté reste caché aux joueurs, à l'IA et à la boutique jusqu'à sa sortie.

Les cartes se modifient dans `packages/engine/src/engine.js` (objets `CARDS`, `GENERALS`, `TERRAINS`, `DECKS`), les sets et les prix dans `packages/engine/src/collection.js` (`SETS`, `SHOP`).

La documentation du code (architecture, moteur, serveur et API, appli, traduction, musique, recettes pour ajouter une carte ou un set) est dans [`docs/`](docs/README.md).

## Lancer en local

Il faut Node 20 ou plus.

```bash
npm install
npm run dev
```

- Appli : http://localhost:5173 (sur le même Wi-Fi, un téléphone peut ouvrir `http://<ip-de-l-ordinateur>:5173`)
- Serveur de parties : port 8787
- Comptes : sans `DATABASE_URL`, ils sont rangés dans `server/data/comptes.json` (les réglages dans `server/data/reglages.json`, les parties dans `server/data/parties.json`). Lancez le serveur avec `ADMIN_KEY=un-secret npm run dev` pour ouvrir http://localhost:5173/admin.html et créer des comptes.

Version de production en local :

```bash
npm run build
npm start   # tout sur http://localhost:8787
```

## Tests des mécaniques

```bash
npm test                     # règles, effets des cartes et parties complètes, environ 1 s
```

Les tests sont dans `packages/engine/test` : `cartes.test.js` (données cohérentes et aucun effet qui plante), `mecaniques.test.js` (Défausse, Pari, Jackpot, Horde, terrains…) et `parties.test.js` (une partie IA contre IA par deck préconstruit). Ils tournent aussi sur GitHub à chaque pull request et à chaque push sur `main` (`.github/workflows/tests.yml`), sans rien ajouter au déploiement sur Render. Un nouvel effet se teste dans `mecaniques.test.js` avec les outils de `aide.js` : `partie()`, `enJeu`, `enMain`, `enDeck`, `jouer`, et `st.dice = [6]` pour fixer les dés.

## Tester l'équilibrage

```bash
npm run sim -- 60            # 60 parties IA contre IA par duel de decks
npm run sim -- 20 generaux   # chaque général avec le deck de sa famille, contre tous les decks
npm run equilibrage -- decks 150     # matrice des decks sur tous les cœurs (300 parties par paire)
npm run equilibrage -- generaux 60   # apport de chaque général face au même deck sans général (Cartographe)
npm run equilibrage -- cartes 60     # apport de chaque carte face à une créature sans effet du même coût
npm run equilibrage -- tout 60       # les trois à la suite
# Par défaut, seuls les decks et généraux des sets déjà sortis jouent (comme l'IA du jeu) ; ajoutez « tous » (ou une date AAAA-MM-JJ) après le nombre de parties pour inclure les sets à venir.
npm run eco                  # jours pour compléter un set selon la façon de jouer (npm run eco -- 300 reglages.json pour d'autres réglages)
npm run empreinte            # empreinte de parties à hasard fixé : identique avant et après un nettoyage du moteur
npm run i18n                 # textes sans traduction anglaise (-- --all pour tout lister, -- --strict pour échouer s'il en manque)
```

`equilibrage` écrit aussi ses résultats bruts dans `equilibrage-resultats.json` (dossier courant).

## Mettre en ligne pour jouer entre amis

Le plus simple est [Render](https://render.com), en offre gratuite :

1. Créez un compte Render et reliez-le à ce dépôt GitHub.
2. « New » puis « Blueprint » : Render lit `render.yaml` et crée le service.
3. Partagez l'adresse obtenue (`https://jeu-de-cartes-xxxx.onrender.com`). Sur téléphone, « Ajouter à l'écran d'accueil » installe l'appli.

Sur l'offre gratuite, le serveur s'endort après 15 minutes sans visite : la première connexion prend alors environ 30 secondes.

### Comptes et base de données

Le disque d'un service Render gratuit est effacé à chaque déploiement : les comptes et collections sont donc rangés dans une base PostgreSQL externe et gratuite.

1. Créez une base sur [Neon](https://neon.tech) (offre gratuite, sans expiration) et copiez sa chaîne de connexion (`postgresql://…?sslmode=require`). Supabase marche aussi. Évitez la base PostgreSQL gratuite de Render : elle est supprimée au bout de 30 jours.
2. Sur Render, dans le service, onglet « Environment » : ajoutez `DATABASE_URL` avec cette chaîne. Vérifiez qu'`ADMIN_KEY` existe (sinon ajoutez-la avec un long mot de passe) et notez sa valeur.
3. Ouvrez `https://<votre-adresse>/admin`, entrez `ADMIN_KEY`, puis créez un compte par joueur (identifiant, pseudo, mot de passe) et communiquez-leur.

Les tables sont créées toutes seules au premier démarrage. Sans `DATABASE_URL`, le serveur écrit dans un fichier local et l'indique dans ses journaux (un avertissement de plus sur Render, où ce fichier serait perdu).

Pour tester du contenu avant sa sortie (set, deck, événement, saison, quête, annonce programmée), ouvrez un compte sur `/admin` et réglez son « jour d'aperçu » dans la carte « Zone de test » : ce compte voit et joue le jeu en ligne comme à cette date, sans rien changer pour les autres joueurs (le classé et les Boss lui sont fermés pendant ce temps). Videz le jour pour le ramener au présent.

### Autres variables d'environnement (facultatives)

| Variable | Rôle |
| --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Clés des notifications push. Sans elles, le serveur en crée une paire au premier démarrage et la garde dans la base : rien à faire, sauf pour imposer ses propres clés. |
| `VAPID_SUBJECT` | Contact des notifications (`mailto:…` ou adresse du site), exigé par Apple. Par défaut, l'adresse donnée par Render. |
| `PORT` | Port du serveur (8787 par défaut ; Render le fixe lui-même). |
| `DATA_FILE` | Fichier des comptes sans base de données (`server/data/comptes.json` par défaut). |

### La page `/admin`

Ses onglets :

- **Comptes** : créer un compte ; en cliquant dessus, changer le pseudo, le mot de passe et les Éclats, cocher les cartes de la collection, changer le deck de départ, donner un art ou un thème, rendre le booster du jour, tirer de nouvelles cartes du jour en boutique, relancer la bienvenue des 7 jours, fermer les sessions, désactiver, remettre à zéro ou supprimer le compte.
- **Stats** : taux de victoire en JcJ et contre l'IA (par joueur et par général), cartes les plus jouées.
- **Suivi** : rétention (retours, cohortes, parcours des nouveaux comptes, joueurs à relancer) et suivi du nouveau contenu (bienvenue, clans, boss, quêtes, événements, émotes, decks partagés, notifications, passe et classé).
- **Cartes** et **Sets** : un brouillon pour retoucher une carte (nom, coût, puissance, famille, texte), créer une carte qui reprend l'effet d'une carte existante, ranger les cartes dans des sets ouverts ou non en boutique et dans le booster quotidien, régler le supplément du booster d'un set. Rien ne change pour les joueurs avant « Publier dans le jeu ». Un effet vraiment nouveau se code dans `engine.js`.
- **Boutique** : prix, cartes par booster, Éclats par doublon, cartes et doublons du jour, prix des arts, change des Prismes ; peut renouveler les offres de tous les joueurs.
- **Récompenses** : XP et niveaux, missions, calendrier, bienvenue, niveaux de carte, essence, familles et sets complétés, succès, fin de saison classée, passe de saison, tutoriel.
- **Événements** : bonus temporaires (voir plus bas).
- **Boss** : boss mondial (rotation, tentatives, score, paliers, classement, magasin).
- **Quêtes** : quêtes d'histoire ouvertes ou non, dates des quêtes à durée limitée (celle du casino fixe aussi les dates de l'événement) et récompenses de chaque chapitre.
- **Courrier** : annonces, événements et cadeaux, codes cadeaux.
- **Signalements** : bugs envoyés par les joueurs, avec leur contexte et leur capture ; à marquer vus ou réglés, ou à qui répondre par courrier.
- **Nouveautés** : le journal du jeu.

Ces réglages sont gardés dans la table `reglages` de la base, les parties dans la table `parties`.

## Jouer

Pas d'inscription : on se connecte avec l'identifiant et le mot de passe donnés par l'administrateur. Au premier lancement, l'appli demande la langue (français ou anglais, à changer ensuite dans les réglages du profil).

### Premiers pas

- **Tutoriel** : à la première connexion, une initiation de 4 tours guidée par Séraphine (écran assombri autour de ce qu'il faut toucher, main qui montre le geste), puis le choix du deck de départ : Grande Horde (Gobelin), Vents sylvestres (Elfe) ou Pacte infernal (Démon). Ses 15 cartes, ses 2 généraux de famille et les 2 généraux neutres du Set de base forment la collection ; le choix est définitif. Un doublon offert de son général apprend ensuite à améliorer une carte.
- **Apprendre** (en bas de l'accueil) : cinq leçons à rejouer (initiation, effets et sorts, terrains, généraux, partie complète), qui rapportent des Éclats la première fois, et un booster quand toutes sont finies. Le tutoriel avancé montre une mécanique de famille par leçon (Trésor, Sacrifice, Relève, Drain, Sortilège, et les dés du casino avec Faites vos jeux). Le codex, ici et dans « Cartes », explique les règles et chaque mot-clé.
- **Bienvenue des 7 jours** : un nouveau compte reçoit 7 récompenses, une par jour de connexion (pas forcément de suite), dans les 14 jours après sa création : Éclats, boosters, Prismes, un coffre d'arts, et au 7e jour un cadre et le titre « Recrue prometteuse ».

### Collection et decks

- **Collection** : cartes, généraux et terrains, filtrables par famille, coût, mot-clé et set ; l'onglet Arts par famille, set d'art et rareté.
- **Généraux** : ils se collectionnent comme les cartes. Un deck prend un général de sa collection ; ses terrains sont les neutres et ceux des familles dont on possède un général.
- **Mes decks** : jusqu'à 10 decks, chacun fait d'un général, de 5 terrains et de 15 cartes différentes. Un deck incomplet est gardé mais pas jouable ; « Jouer ce deck » choisit celui qui est joué partout. Chaque deck se partage par un **code** à copier, et un code collé crée un deck avec ce que la collection permet. L'onglet **Recettes** reconstruit les decks préconstruits, l'onglet **Boss mondial** prépare un deck par boss.
- **Doublons** : un deck ne prend qu'un exemplaire de chaque carte, donc chaque doublon devient 10 Éclats et 10 essence de cette carte.
- **Niveaux de carte** (cosmétiques) : une carte ouverte en grand monte de niveau avec son essence et des Éclats (bordure de bronze, d'argent, d'or, puis astrale et effet de mise en jeu au niveau 5). La carte joue pareil à tous les niveaux ; l'adversaire voit la bordure des cartes révélées.
- **Essence universelle** : dès qu'une carte a toute l'essence qu'il lui faut jusqu'au niveau 5 (50 avec les réglages par défaut), l'essence de ses doublons devient de l'essence universelle (10 par doublon). Elle complète l'essence d'une autre carte (2 pour 1) ou s'échange au rayon Essence de la boutique.
- **Arts alternatifs** (cosmétiques) : d'autres illustrations pour une carte ou un général, rares, épiques ou légendaires, plus des arts Promo jamais en vente. L'art se choisit sur la carte ouverte en grand ; l'adversaire le voit quand la carte est révélée. Catalogue dans `packages/engine/src/arts.js`, images dans `client/src/art/alt/<id>/`.

### Économie et boutique

Trois monnaies principales : les **Éclats** (parties, missions, niveaux, doublons), les **Prismes**, rares (succès, calendrier, bienvenue, passe, fin de saison classée), qui se changent en Éclats et jamais l'inverse, et l'**essence universelle**. Les modes ont aussi leur monnaie : Écus (clan), Insignes (boss mondial), Jetons (casino).

- **Booster du jour** : 3 cartes tirées parmi les cartes et généraux des sets du booster quotidien (72 pour le Set de base), dont au moins une que le joueur n'a pas encore, une fois par jour (minuit, heure de Paris).
- **Boutique**, en rayons :
  - **Sets** : un espace par set sorti, le plus récent en premier. Pour chacun, 3 cartes du jour propres à chaque joueur (300 Éclats l'une) et un booster de 3 cartes (250 Éclats, 300 pour Crépuscule et Cité Néon). Plus 3 doublons du jour de cartes que l'on possède et qui manquent encore d'essence (100 Éclats, 10 essence chacun).
  - **Arts** : 3 arts du jour et un coffre qui donne un art pas encore possédé (chances affichées), payé en Prismes ou ouvert avec un **coffre offert**.
  - **Essence** : les arts de l'édition Essence (150, 300 ou 600 essence universelle selon la rareté), un cadre et le thème « Ciel d'Elyndra ».
  - **Change** : Prismes en Éclats, par offres fixes (plus l'offre est grosse, plus le bonus l'est).
  - **Émotes** et **Thèmes** : en Éclats ou en Prismes.
  - **Clan** et **Boss** : les magasins du clan (en Écus, verrouillé sans clan) et du boss mondial (en Insignes).
- **Codes cadeaux** : à saisir dans le courrier ou en bas de la boutique, une fois par compte.

Prix et sets se règlent dans `packages/engine/src/collection.js` (`SHOP`, `SETS`) et dans l'onglet Boutique de `/admin`. `npm run eco` estime le temps pour compléter un set avec les réglages par défaut.

### Progression

- **Niveau de compte** : les parties (10 premières du jour), les nouvelles cartes et les missions donnent de l'XP. Chaque niveau rapporte des Éclats, et tous les 5 niveaux un booster offert à ouvrir dans le set de son choix.
- **Missions** : 3 missions du jour (une peut être changée par jour) et 3 missions de la semaine, plus longues, avec un coffre d'arts et des Prismes quand toutes sont faites.
- **Calendrier du mois** : une récompense par jour de connexion, à prendre le jour même : des Éclats en semaine, un coffre d'arts chaque dimanche, et des Prismes en plus les 2e et 4e dimanches. Un jour manqué est perdu, tout repart le 1er du mois.
- **Passe de saison** : une saison par mois (octobre 2026 : « Nuit des citrouilles », Halloween ; novembre 2026 : « Néon 2099 », cyberpunk, dévoilée le 2 novembre). Les parties et les missions du passe donnent l'XP de saison ; 40 paliers donnent Éclats, Prismes, coffres d'arts, 2 ou 3 cartes uniques (qui rejoignent le Set de base 3 mois plus tard), deux arts Promo (paliers 18 et 38), un titre, un dos, un cadre et, au palier 12, le thème de l'interface de la saison. Le **premium**, payé en Prismes, ajoute une seconde piste dont les Prismes rendent son prix vers le palier 29. Le passe fini, un coffre (Éclats, Prismes ou essence) tombe tous les 800 XP de saison.
- **Succès** (page profil) : niveau, victoires, parties, collection, familles, arts, niveaux de carte, classé, amis, boss, histoire, connexion, clans, événements, essence et profil. Ils donnent des Éclats, des Prismes, des titres, des cadres, et pour les plus rares des coffres d'arts, des émotes ou un thème.
- **Familles et sets complétés** : chaque famille complétée dans un set donne une carte unique, un titre et un dos de carte ; un set complet donne des Éclats, des boosters offerts et une carte Dieu. Un mini-set comme Faites vos jeux ne récompense que le set complet.

Presque tous ces montants se règlent dans l'onglet Récompenses de `/admin` (`packages/engine/src/rewards.js`, `pass.js`).

### Modes de jeu

- **En ligne** : « Créer une partie » donne un code de 4 lettres et un lien à envoyer ; « Rejoindre » avec ce code lance la partie aussitôt. Une page rechargée ou une connexion perdue reprend la partie automatiquement.
- **Contre l'IA**, avec le deck joué.
- **Classé** : contre une IA d'autant plus forte que le rang est haut, ou en défi classé entre amis. Six paliers (Bronze, Argent, Or, Platine, Diamant, Maître), de 3 divisions de 3 étoiles chacun ; une victoire donne une étoile (une de plus en série de 3, ou contre un ami mieux classé), une défaite en retire une sans jamais faire descendre de palier. Une saison par mois : récompenses du meilleur palier atteint (Éclats, Prismes, titres et cadres) et du top 10, puis on redescend d'un palier.
- **Boss mondial** : chaque semaine, un boss de la rotation (Ignaroth, Vorgoth, Vael'Thar) ouvert à tous, 3 tentatives par jour de 7 tours. Le boss pose ses Sbires puis agit selon son script, et certaines familles et cartes sont renforcées contre lui. Le score vient des trois zones à la fin ; ses paliers donnent des **Insignes**, des Éclats et de l'XP, et le classement de la semaine récompense chaque participant selon sa place. Insignes à dépenser au magasin du boss (ressources, arts de l'édition Boss, dos, cadres, titre, thème « Éclipse d'Ignaroth »). Données dans `packages/engine/src/boss.js`.
- **Quêtes d'histoire** (tuile « Histoire » ou « Événement ») : le lore des Terres d'Aube en suites de combats contre l'IA avec des decks de héros, indépendants de la collection. Une campagne de 5 chapitres par deck de départ (La Grande Razzia, Le Chant des Racines, Le Pacte des Fosses) et des quêtes à durée limitée de 4 chapitres (La Nuit des citrouilles jusqu'au 31 octobre, L'Éclipse noire du 19 octobre au 8 novembre, La Nuit du Sept d'or du 23 octobre au 15 novembre, Signal perdu en novembre). Chaque chapitre a ses dialogues et une récompense à la première victoire. Données dans `packages/engine/src/story.js`.
- Pendant votre tour, une créature marquée ⇄ (Déplaçable) peut changer de zone : touchez-la, puis touchez la zone d'arrivée.

### Social

- **Amis** (onglet « Social » de la barre du bas) : demandes par pseudo ou identifiant (100 amis au plus), statut en ligne, défis en partie normale ou classée. Le classement ouvre le profil public d'un joueur, avec une demande d'ami.
- **Clans** : créer un clan coûte 50 Prismes (nom, étiquette, blason, ouvert ou sur demande). Missions de clan du jour et de la semaine, avancées par les parties de tous ; elles donnent de l'XP au clan (niveaux 1 à 5) et des **Écus** à ceux qui y ont participé. Les **dons** (Éclats, Prismes, essence) remplissent le trésor, que le Maître et ses adjoints dépensent en projets. Rôles : Maître, Adjoint, Sous-chef, Membre. Magasin du clan en Écus, classement mensuel des clans par étoiles classées. Données dans `packages/engine/src/clans.js`.
- **Boss de clan** : le Maître ou un adjoint ouvre un boss pour tout le clan (un par semaine, au niveau de son choix jusqu'à celui du clan, de 6 000 à 28 000 PV). Il reste ouvert 3 jours, chaque membre a 3 tentatives, et sa barre de PV est commune. À la fermeture, chacun reçoit la récompense de la part de PV retirée. Données dans `packages/engine/src/clan-boss.js`.
- **Émotes** : en partie, toucher son portrait ouvre le sélecteur ; toucher celui de l'adversaire coupe ou rétablit les siennes. Six offertes, les autres en boutique ou par les succès ; le profil choisit les 8 du sélecteur. Contre l'IA, elle répond parfois aux politesses.
- **Courrier** (enveloppe de l'accueil) : annonces, événements et cadeaux à récupérer (Éclats, Prismes, XP, boosters, coffres, carte, art), codes cadeaux, et le bouton **Signaler un bug** (type de problème, description, capture facultative ; l'appli joint la version, l'appareil et les dernières erreurs).
- **Notifications push** : à activer dans le profil, appareil par appareil, en choisissant les sortes reçues (rappel du jour, événements et boss, amis et clan, nouveautés, fin de saison). Rien n'est envoyé quand l'appli est ouverte. Sur iPhone et iPad, il faut l'appli ajoutée à l'écran d'accueil (iOS 16.4 ou plus).

### Événements et saisons

- **Événements temporaires** : des bonus qui reviennent, affichés par une médaille sur l'accueil et annoncés au courrier. Par défaut, **double XP chaque week-end** et **double points de classé** la dernière semaine du mois. L'onglet Événements de `/admin` en crée d'autres (XP, points de classé, Éclats des parties ou XP de saison, ×1,5, ×2 ou ×3, chaque week-end, dernier week-end, dernière semaine du mois ou entre deux dates). Données dans `packages/engine/src/events.js`.
- **Faites vos jeux** (casino du Sept d'or, avec le mini-set du 23 octobre) : une monnaie à part, les **Jetons**, gagnés avec la quête « La Nuit du Sept d'or », la **machine à sous** (3 tirages par jour) et **Quitte ou double** (débloqué à la fin de la quête) : une montée de 5 tables contre l'IA, chacune avec sa règle de la maison, où l'on encaisse le pot ou le remet en jeu, 2 montées par jour. Les Jetons se dépensent à la **boutique du casino** : thème « Roue de Fortuna », cadre du Jackpot, trois arts, titre « Roi du tapis », et des ressources en quantité limitée. Pendant l'événement, le casino a son onglet dans la barre du bas ; la boutique reste ouverte 3 jours après la fin, puis les Jetons restants disparaissent. Données dans `packages/engine/src/casino.js`.
- **Nouveautés** : le journal du jeu (mises à jour majeures, nouveaux sets) avec un onglet « À venir ». La dernière annonce pas encore vue s'affiche « À la une » sur l'accueil.

### Personnalisation et réglages

- **Profil** (votre image en haut de l'accueil) : pseudo, image de profil (recadrée en carré), titre, cadre, sets complétés et statistiques (en ligne, contre l'IA, par général, cartes les plus jouées, 3 arts préférés).
- **Historique** : ses dernières parties, filtrables (en ligne, classées, contre l'IA), chacune détaillée : zones, puissance tour par tour, cartes révélées, gains.
- **Thèmes de l'interface** : ils habillent toute l'appli (menus, table de partie, portrait du général en fond). Les thèmes de saison (Halloween, Néon) se débloquent au palier 12 du passe. Cinq thèmes de généraux : « Bois de Sylvaën » (2 500 Éclats) et « Estampe d'Ysmera » (3 000 Éclats) au rayon Thèmes, « Ciel d'Elyndra » au rayon Essence, « Éclipse d'Ignaroth » au magasin du boss mondial, « Aube de Séraphine » avec le succès des trois campagnes. Plus « Roue de Fortuna », à la boutique du casino. Données dans `packages/engine/src/themes.js` et `client/src/themes.js`.
- **Cosmétiques** : dos de carte (vu par l'adversaire sur vos cartes cachées), cadres, dont des cadres animés, titres et émotes, choisis dans l'onglet Personnalisation du profil.
- **Réglages** : langue (français ou anglais), volume des bruitages et de la **musique** (morceaux propres aux menus, aux parties, aux boss et à chaque thème, voir `docs/musique.md`), vibrations, et **animations** complètes, réduites ou aucune (par défaut, celles du système).

## Prochaines étapes prévues

- Inscription libre, échanges de cartes entre joueurs.
- Publication sur les stores avec Capacitor.
