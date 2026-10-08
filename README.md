# Jeu de cartes

Jeu de cartes à jouer et à collectionner : 7 tours, 3 zones, gagnez 2 zones sur 3.
Cette version sert à tester le jeu entre amis : une appli web installable sur téléphone, des parties en ligne avec un code, et un mode contre l'IA.

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `packages/engine` | Le moteur de règles et le set 1 (5 familles, 60 cartes, 12 généraux, 15 terrains, 5 decks de départ). Il ne dépend de rien. |
| `server` | Le serveur de parties : salons à code, règles appliquées côté serveur, cartes cachées jamais envoyées à l'adversaire. Il sert aussi l'appli compilée. |
| `client` | L'appli web (PWA) : accueil, salon, plateau, partie contre l'IA. |

Les cartes se modifient dans `packages/engine/src/engine.js` (objets `CARDS`, `GENERALS`, `TERRAINS`, `DECKS`).

## Lancer en local

Il faut Node 20 ou plus.

```bash
npm install
npm run dev
```

- Appli : http://localhost:5173 (sur le même Wi-Fi, un téléphone peut ouvrir `http://<ip-de-l-ordinateur>:5173`)
- Serveur de parties : port 8787

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

## Jouer

- **Créer une partie** donne un code de 4 lettres et un lien à envoyer.
- **Rejoindre** avec ce code : la partie démarre aussitôt.
- Avant de jouer, choisissez un deck de départ et, si vous voulez, un autre général : le deck n'est pas limité à la famille du général.
- Pendant votre tour, une créature marquée ⇄ (Déplaçable) peut changer de zone : touchez-la, puis touchez la zone d'arrivée.
- Une page rechargée ou une connexion perdue reprend la partie automatiquement.

## Prochaines étapes prévues

- Comptes et collections avec Supabase (connexion, cartes possédées, boosters).
- Construction de deck libre à partir de la collection.
- Publication sur les stores avec Capacitor.
