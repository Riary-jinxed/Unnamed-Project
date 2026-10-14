# Musiques d'ambiance

La musique tourne en boucle selon l'écran : `menu` partout hors partie, `partie` sur le plateau. Avec un thème de saison affiché (celui de la saison en cours, ou celui choisi dans la personnalisation), sa version passe avant (`menu-halloween`, `partie-halloween`…, d'après le `theme` de la saison dans `packages/engine/src/pass.js`). Un fichier absent est ignoré : la version normale prend le relais, et sans aucun fichier c'est le silence.

## Ajouter un morceau

1. Déposer le fichier MP3 dans `client/public/music/`, avec exactement le nom attendu :

   | Fichier | Joué |
   | --- | --- |
   | `menu.mp3` | Accueil, collection, boutique, decks, profil… |
   | `partie.mp3` | Pendant une partie (tutoriel compris) |
   | `menu-halloween.mp3`, `partie-halloween.mp3` | Pareil, pendant la saison Nuit des citrouilles (octobre) |
   | `menu-cyber.mp3`, `partie-cyber.mp3` | Pareil, pendant la saison Néon 2099 (novembre) : « Neon City Menu » et « Protocol Breach » |

2. Compiler et déployer comme d'habitude. Une saison future n'a besoin que de ses deux fichiers nommés d'après son `theme`.

Conseils : 2 à 3 minutes par morceau, MP3 à 128 kbit/s (3 Mo environ), début et fin coupés net pour que la boucle s'entende peu, volume proche des autres morceaux. Avec ffmpeg :

```sh
ffmpeg -i source.mp3 -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-18" -b:a 128k menu.mp3
```

## Lecture (`client/src/music.js`)

- `render()` (`main.js`) donne à chaque affichage la liste des morceaux voulus (`musicFor`) ; `setMusic` ne change de morceau que si le premier fichier disponible change, avec un fondu enchaîné entre deux lecteurs.
- La musique passe par le contexte Web Audio des bruitages (`audioContext()` de `sfx.js`) : elle démarre au premier geste du joueur, s'arrête avec « Couper le son » et quand l'appli passe en arrière-plan.
- Volume : curseur « Volume de la musique » dans l'onglet Profil, gardé dans `localStorage` (`jeu-music`, entre 0 et 1, 0,5 par défaut).
- Le serveur sert les MP3 par morceaux (requêtes `Range`, exigées par Safari) et répond 404 pour une musique absente ; le service worker ne les met pas en cache.

## Prompts Suno

Les prompts prêts à coller sont dans [prompts-suno.md](prompts-suno.md).
