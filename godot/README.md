# Prototype Godot

Passage du jeu sur Godot 4, étapes 1 et 2 : le plateau d'une partie, branché sur le serveur du jeu, avec bruitages, musique et vibrations, et une version Android. Le jeu en ligne n'est pas touché : ce dossier n'est ni compilé ni déployé par Render.

Godot ne contient pas les règles. Il se connecte au serveur avec les mêmes messages que l'appli web (`/api/login`, puis `ranked` sur le WebSocket `/ws`), affiche chaque vue reçue (`state`) et envoie le plan du tour (`plan`). Le moteur JavaScript reste la seule source de vérité.

## Lancer

1. À la racine du dépôt : `npm install`, puis `npm run godot:data`. Le script écrit `godot/data/catalog.json` (cartes, généraux, terrains, tirés de `@jeu/engine`), copie les illustrations en 640 px dans `godot/art/` et les musiques de partie et de menu dans `godot/music/`. Ces dossiers ne sont pas suivis par git ; relancez le script quand une carte ou une illustration change.
2. Lancez un serveur local : `npm start` (port 8787). Il faut un compte avec son deck de départ, créé depuis `/admin`.
3. Ouvrez le dossier `godot/` dans Godot 4.7 (le premier import des illustrations prend quelques secondes), puis lancez le projet (F5).

Options après `--` sur la ligne de commande :

| Option | Effet |
| --- | --- |
| `--server=URL` | Serveur à joindre (par défaut `http://localhost:8787` sur ordinateur, `https://jeu-de-cartes.onrender.com` sur téléphone). |
| `--login=… --password=…` | Connexion automatique. |
| `--auto` | Joue seul : pose les cartes qu'il peut payer dans la zone où il est le plus en retard. |
| `--drag-test` | Avec `--auto` : pose une carte par tour en la glissant (vrais événements de souris), et écrit le résultat dans la console. |
| `--shots=DOSSIER` | Captures au plan des tours 1 et 4, pendant une révélation et à la fin. |
| `--frames=DOSSIER` | Une image toutes les 0,1 s. |
| `--quit` | Quitte après la fin de la partie. |

Vidéo d'une partie sans écran (Linux) : `xvfb-run godot --path godot --rendering-driver opengl3 --resolution 720x1280 --write-movie partie.avi --fixed-fps 24 -- --login=… --password=… --auto --quit`.

L'adresse du serveur, l'identifiant et la session sont gardés sur l'appareil (`user://reglages.cfg`) : on ne se connecte qu'une fois.

## Android

L'export « Android » (`export_presets.cfg`) fait un APK arm64 sans Gradle, signé avec la clé donnée par les variables `GODOT_ANDROID_KEYSTORE_RELEASE_PATH`, `_USER` et `_PASSWORD` (aucune clé dans le dépôt). Il faut dans Godot les modèles d'export Android 4.7.2, un JDK et, dans les réglages de l'éditeur, un dossier Android SDK avec `platform-tools/adb` et `build-tools/<version>/apksigner`.

```
godot --headless --path godot --export-release "Android" build/jeu-de-cartes.apk
```

Les illustrations sont importées en WebP avec perte et mipmaps (`[importer_defaults]` de `project.godot`) : l'APK reste sous 100 Mo et les cartes restent nettes en petit.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `project.godot` | Format portrait 720x1280 étiré à l'écran, rendu Compatibilité (OpenGL ES 3, le plus sûr sur téléphone et pour un export web). |
| `scripts/data.gd` | Catalogue et illustrations ; `render_log`, même règle que `renderLog` du moteur (français seulement). |
| `scripts/net.gd` | API JSON et WebSocket, ping toutes les 10 s comme l'appli web. |
| `scripts/main.gd` | Accueil et connexion (session gardée), partie classée contre l'IA, reconnexion à la partie (`rejoin`) si la connexion tombe, captures. |
| `scripts/sfx.gd` | Bruitages de l'appli web (`client/src/sfx.js`) recalculés en tampons au démarrage, musique, vibrations ; réglages Son et Vibrations. |
| `scripts/board.gd` | Plateau : place les cartes (main et zones) sur un calque commun pour les animer d'une place à l'autre, prépare le plan (toucher ou glisser-déposer, déplacements, général), effets de révélation et de destruction, journal (toucher la ligne du journal), braises du fond. |
| `scripts/card_view.gd` | Une carte dessinée : décor et personnage recadrés dans la fenêtre du gabarit 960x1424, nom, cadre de la famille, coût, puissance ; le dos. |
| `scripts/zone_view.gd` | Une zone : terrains des deux joueurs, puissances au milieu. |
| `scripts/gfx.gd` | Dessin partagé : rectangles arrondis texturés, pastilles, portraits cadrés sur le visage (`FACES` de `client/src/art.js`). |
| `shaders/fond.gdshader` | Fond du plateau. |
| `fonts/` | Cinzel et Alegreya Sans (licence SIL OFL), comme l'appli web. |

## Pas encore là

Émotes, récompenses de fin de partie, textes anglais, arts alternatifs et niveaux des cartes, partie solo, menus (collection, decks, boutique…), iOS. Ce sont les étapes suivantes du plan.
