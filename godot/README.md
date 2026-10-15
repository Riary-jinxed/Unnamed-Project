# Prototype Godot

Première étape du passage du jeu sur Godot 4 : le plateau d'une partie, branché sur le serveur du jeu. Le jeu en ligne n'est pas touché : ce dossier n'est ni compilé ni déployé par Render.

Godot ne contient pas les règles. Il se connecte au serveur avec les mêmes messages que l'appli web (`/api/login`, puis `ranked` sur le WebSocket `/ws`), affiche chaque vue reçue (`state`) et envoie le plan du tour (`plan`). Le moteur JavaScript reste la seule source de vérité.

## Lancer

1. À la racine du dépôt : `npm install`, puis `npm run godot:data`. Le script écrit `godot/data/catalog.json` (cartes, généraux, terrains, tirés de `@jeu/engine`) et copie les illustrations en 640 px dans `godot/art/`. Ces deux dossiers ne sont pas suivis par git ; relancez le script quand une carte ou une illustration change.
2. Lancez un serveur local : `npm start` (port 8787). Il faut un compte avec son deck de départ, créé depuis `/admin`.
3. Ouvrez le dossier `godot/` dans Godot 4.7 (le premier import des illustrations prend quelques secondes), puis lancez le projet (F5).

Options après `--` sur la ligne de commande :

| Option | Effet |
| --- | --- |
| `--server=URL` | Serveur à joindre (`http://localhost:8787` par défaut). |
| `--login=… --password=…` | Connexion automatique. |
| `--auto` | Joue seul : pose les cartes qu'il peut payer dans la zone où il est le plus en retard. |
| `--shots=DOSSIER` | Captures au plan des tours 1 et 4, pendant une révélation et à la fin. |
| `--frames=DOSSIER` | Une image toutes les 0,1 s. |
| `--quit` | Quitte après la fin de la partie. |

Vidéo d'une partie sans écran (Linux) : `xvfb-run godot --path godot --rendering-driver opengl3 --resolution 720x1280 --write-movie partie.avi --fixed-fps 24 -- --login=… --password=… --auto --quit`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `project.godot` | Format portrait 720x1280 étiré à l'écran, rendu Compatibilité (OpenGL ES 3, le plus sûr sur téléphone et pour un export web). |
| `scripts/data.gd` | Catalogue et illustrations ; `render_log`, même règle que `renderLog` du moteur (français seulement). |
| `scripts/net.gd` | API JSON et WebSocket, ping toutes les 10 s comme l'appli web. |
| `scripts/main.gd` | Connexion, lancement d'une partie classée contre l'IA, captures. |
| `scripts/board.gd` | Plateau : place les cartes (main et zones) sur un calque commun pour les animer d'une place à l'autre, prépare le plan (pose, déplacements, général), effets de révélation. |
| `scripts/card_view.gd` | Une carte dessinée : décor et personnage recadrés dans la fenêtre du gabarit 960x1424, nom, cadre de la famille, coût, puissance ; le dos. |
| `scripts/zone_view.gd` | Une zone : terrains des deux joueurs, puissances au milieu. |
| `scripts/gfx.gd` | Dessin partagé : rectangles arrondis texturés, pastilles, portraits cadrés sur le visage (`FACES` de `client/src/art.js`). |
| `shaders/fond.gdshader` | Fond du plateau. |
| `fonts/` | Cinzel et Alegreya Sans (licence SIL OFL), comme l'appli web. |

## Pas encore là

Sons et vibrations, journal complet, émotes, reconnexion (`rejoin`), récompenses de fin de partie, textes anglais, arts alternatifs et niveaux des cartes, export Android. Ce sont les étapes suivantes du plan.
