# Jeu de cartes

Jeu de cartes à jouer et à collectionner : 7 tours, 3 zones, gagnez 2 zones sur 3.
Cette version sert à tester le jeu entre amis : une appli web installable sur téléphone, des parties en ligne avec un code, et un mode contre l'IA.

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `packages/engine` | Le moteur de règles, le Set de base (5 familles, 60 cartes, 12 généraux, 15 terrains) et le set 2 « Crépuscule » (Mort-vivant et Vampire, support des 5 familles : 57 cartes, 10 généraux, 11 terrains), plus 12 decks préconstruits. `collection.js` : deck de départ, boosters, règles de deck. Il ne dépend de rien. |
| `server` | Le serveur de parties et des comptes : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées à l'adversaire, API des comptes. Il sert aussi l'appli compilée. |
| `client` | L'appli web (PWA) : connexion, collection, deck, booster, salon, plateau, partie contre l'IA. Plus la page `/admin` : comptes et réglages de la boutique. |

Les cartes se modifient dans `packages/engine/src/engine.js` (objets `CARDS`, `GENERALS`, `TERRAINS`, `DECKS`).

La documentation du code (architecture, moteur, serveur et API, appli, recettes pour ajouter une carte ou un set) est dans [`docs/`](docs/README.md).

## Lancer en local

Il faut Node 20 ou plus.

```bash
npm install
npm run dev
```

- Appli : http://localhost:5173 (sur le même Wi-Fi, un téléphone peut ouvrir `http://<ip-de-l-ordinateur>:5173`)
- Serveur de parties : port 8787
- Comptes : sans `DATABASE_URL`, ils sont rangés dans `server/data/comptes.json` (et les réglages de la boutique dans `server/data/reglages.json`). Lancez le serveur avec `ADMIN_KEY=un-secret npm run dev` pour ouvrir http://localhost:5173/admin.html et créer des comptes.

Version de production en local :

```bash
npm run build
npm start   # tout sur http://localhost:8787
```

## Tester l'équilibrage

```bash
npm run sim -- 60            # 60 parties IA contre IA par duel de decks
npm run sim -- 20 generaux   # chaque général avec le deck de sa famille, contre tous les decks
npm run eco                  # jours pour compléter un set selon la façon de jouer
npm run empreinte            # empreinte de parties à hasard fixé : identique avant et après un nettoyage du moteur
```

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

La page `/admin` permet aussi, en cliquant sur un compte : changer le pseudo, le mot de passe et les Éclats, cocher les cartes de la collection, changer le deck de départ, rendre le booster du jour, tirer de nouvelles cartes du jour en boutique, fermer les sessions, désactiver, remettre à zéro ou supprimer le compte. L'onglet « Boutique » règle les prix, le nombre de cartes par booster, les Éclats par doublon et le nombre de cartes du jour, et peut renouveler les offres de tous les joueurs. Ces réglages sont gardés dans la table `reglages` de la base.

L'onglet « Stats » donne les taux de victoire en JcJ et contre l'IA (par joueur et par général) et les cartes les plus jouées ; les parties sont gardées dans la table `parties`. Les onglets « Cartes » et « Sets » modifient un brouillon : retoucher une carte (nom, coût, puissance, famille, texte), créer une carte qui reprend l'effet d'une carte existante, ranger les cartes dans des sets ouverts ou non en boutique et dans le booster quotidien. Rien ne change pour les joueurs avant « Publier dans le jeu ». Les effets restent du code dans `engine.js` : un effet vraiment nouveau se code là.

La table `comptes` est créée toute seule au premier démarrage. Sans `DATABASE_URL`, le serveur écrit dans un fichier local et l'indique dans ses journaux.

## Jouer

- **Tutoriel et codex** : à la première connexion, l'appli propose un tutoriel, une partie guidée contre l'IA avec un deck prêt à jouer ; il se relance depuis l'accueil. Le codex, sur l'accueil et dans « Cartes », explique les règles et chaque mot-clé.
- **Se connecter** avec l'identifiant et le mot de passe donnés par l'administrateur (pas d'inscription).
- À la première connexion, **choisir son deck de départ** : Grande Horde (Gobelin), Vents sylvestres (Elfe) ou Pacte infernal (Démon). Ses 15 cartes, ses 2 généraux de famille et les 2 généraux neutres forment la collection. Le choix est définitif.
- **Généraux** : ils se collectionnent comme les cartes et sortent des boosters (quotidien, de set, cartes du jour). Un deck prend un général de sa collection ; ses terrains sont les neutres et ceux des familles dont on possède un général.
- **Booster du jour** : 3 cartes tirées parmi les cartes et généraux des sets du booster quotidien (72 pour le Set de base), dont au moins une que le joueur n'a pas encore, une fois par jour (minuit, heure de Paris).
- **Doublons** : un deck ne prend qu'un exemplaire de chaque carte, donc chaque doublon obtenu devient 10 Éclats et 10 essence de cette carte.
- **Niveaux de carte** (cosmétiques) : dans la collection, une carte ouverte en grand monte de niveau avec son essence et des Éclats : bordure de bronze, d'argent, d'or, puis bordure astrale et effet de mise en jeu au niveau 5. La carte joue pareil à tous les niveaux ; l'adversaire voit la bordure et l'effet des cartes que vous révélez. Les coûts se règlent dans l'onglet Récompenses de `/admin`.
- **Boutique** : un espace par set, payé en Éclats. Pour le Set de base : 3 cartes du jour propres à chaque joueur (300 Éclats l'une) et un booster de 3 cartes au hasard (200 Éclats). Le set 2 « Crépuscule » y a déjà sa place, marquée « bientôt disponible » : il s'ouvre depuis l'onglet « Sets » de `/admin`. Prix et sets se règlent dans `packages/engine/src/collection.js` (`SHOP`, `SETS`).
- **Profil** : touchez votre image en haut de l'accueil. On y change son pseudo et son image de profil (recadrée en carré, réduite à 160 px et affichée en cercle), on voit les sets complétés et ses statistiques de victoire (en ligne, contre l'IA, par général, dernières parties).
- **Mes decks** : jusqu'à 5 decks. Le deck de départ est le premier. Chaque deck se crée en trois étapes : le général, puis 5 terrains, puis 15 cartes différentes de la collection. Généraux et terrains accessibles : les neutres et ceux de la famille de départ. Un deck peut être renommé, modifié, remis à zéro ou supprimé (il en reste toujours un). Un deck incomplet est gardé mais pas jouable ; « Jouer ce deck » choisit celui qui est joué, en ligne comme contre l'IA.
- **Niveau de compte** : les parties (10 premières du jour), les nouvelles cartes et les missions donnent de l'XP. Chaque niveau rapporte des Éclats, et tous les 5 niveaux un booster offert à ouvrir en boutique dans le set de son choix.
- **Missions du jour** : 3 missions sur l'accueil, renouvelées à minuit ; une peut être changée par jour.
- **Succès** (page profil) : des Éclats, des titres à afficher sous son pseudo et des cadres autour de son image.
- **Familles et sets complétés** : chaque famille complétée dans chaque set donne une carte unique (une par famille et par set), un titre et un dos de carte (vu par l'adversaire sur vos cartes cachées) ; un set complet donne des Éclats, des boosters offerts et une carte Dieu. Tout se règle dans l'onglet « Récompenses » de `/admin` ; `npm run eco` estime le temps pour compléter un set avec les réglages par défaut.
- **Créer une partie** donne un code de 4 lettres et un lien à envoyer.
- **Rejoindre** avec ce code : la partie démarre aussitôt.
- Pendant votre tour, une créature marquée ⇄ (Déplaçable) peut changer de zone : touchez-la, puis touchez la zone d'arrivée.
- Une page rechargée ou une connexion perdue reprend la partie automatiquement.

## Prochaines étapes prévues

- Inscription libre, échanges ou recyclage des doublons.
- Publication sur les stores avec Capacitor.
