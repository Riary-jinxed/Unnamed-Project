# Jeu de cartes

Jeu de cartes à jouer et à collectionner : 7 tours, 3 zones, gagnez 2 zones sur 3.
Cette version sert à tester le jeu entre amis : une appli web installable sur téléphone, des parties en ligne avec un code, et un mode contre l'IA.

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `packages/engine` | Le moteur de règles et le set 1 (5 familles, 60 cartes, 12 généraux, 15 terrains, 5 decks de départ). `collection.js` : deck de départ, booster quotidien, règles de deck. Il ne dépend de rien. |
| `server` | Le serveur de parties et des comptes : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées à l'adversaire, API des comptes. Il sert aussi l'appli compilée. |
| `client` | L'appli web (PWA) : connexion, collection, deck, booster, salon, plateau, partie contre l'IA. Plus la page `/admin` : comptes et réglages de la boutique. |

Les cartes se modifient dans `packages/engine/src/engine.js` (objets `CARDS`, `GENERALS`, `TERRAINS`, `DECKS`).

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

La table `comptes` est créée toute seule au premier démarrage. Sans `DATABASE_URL`, le serveur écrit dans un fichier local et l'indique dans ses journaux.

## Jouer

- **Se connecter** avec l'identifiant et le mot de passe donnés par l'administrateur (pas d'inscription).
- À la première connexion, **choisir son deck de départ** : Grande Horde (Gobelin), Vents sylvestres (Elfe) ou Pacte infernal (Démon). Ses 15 cartes forment la collection. Le choix est définitif.
- **Booster du jour** : 3 cartes tirées parmi les 60 du set, dont au moins une que le joueur n'a pas encore, une fois par jour (minuit, heure de Paris).
- **Doublons** : un deck ne prend qu'un exemplaire de chaque carte, donc chaque doublon obtenu devient 10 Éclats.
- **Boutique** : un espace par set, payé en Éclats. Pour le Set de base : 3 cartes du jour propres à chaque joueur (300 Éclats l'une) et un booster de 3 cartes au hasard (200 Éclats). Le prochain set y a déjà sa place, marquée « bientôt disponible ». Prix et sets se règlent dans `packages/engine/src/collection.js` (`SHOP`, `SETS`).
- **Modifier le deck** : 15 cartes différentes de la collection, 5 terrains et un général. Généraux et terrains accessibles : les neutres et ceux de la famille de départ. C'est ce deck qui est joué, en ligne comme contre l'IA.
- **Créer une partie** donne un code de 4 lettres et un lien à envoyer.
- **Rejoindre** avec ce code : la partie démarre aussitôt.
- Pendant votre tour, une créature marquée ⇄ (Déplaçable) peut changer de zone : touchez-la, puis touchez la zone d'arrivée.
- Une page rechargée ou une connexion perdue reprend la partie automatiquement.

## Prochaines étapes prévues

- Inscription libre, plusieurs decks par joueur, échanges ou recyclage des doublons.
- Publication sur les stores avec Capacitor.
