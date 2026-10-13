# Illustrations des cartes

Un dossier par carte, nommé par son identifiant (clé de `CARDS` ou de `GENERALS` dans `packages/engine/src/engine.js`) :

```
art/<id>/decor.webp   scène complète
art/<id>/perso.webp   personnage détouré, fond transparent, aligné pixel pour pixel sur le décor
```

Gabarit des deux images : 960x1424 px. La fenêtre de la carte est le rectangle 832x1168 placé à (64, 192).
Le décor est coupé à cette fenêtre ; le personnage en sort (192 px en haut, 64 px sur les côtés et en bas)
à partir du niveau de carte qui le débloque (`pop` dans `CARD_LEVELS`, `packages/engine/src/rewards.js`).

Rien d'autre à fournir pour la galerie de la collection : la compilation en tire toute seule une vignette de 640 px de large
(`client/vignettes.js`), que le navigateur prend quand elle suffit à la taille affichée. Les originaux sont servis tels quels.

Une carte sans dossier (et un terrain sans image) montre un visuel provisoire : fond aux couleurs de sa famille, emblème de la famille et « Illustration à venir ». Rien d'autre à déclarer : `client/src/art.js` trouve les fichiers tout seul, et la vraie illustration remplace le visuel provisoire dès que ses fichiers sont là.

Généraux : en partie, leur carte montre un portrait recadré sur le visage. Pour un nouveau général, ajoutez la position du visage
(en % de la largeur et de la hauteur de l'image) dans `FACES`, en haut de `portraitHTML` (`client/src/art.js`) ; sans elle, le portrait est centré en haut de l'image.

## Arts alternatifs

Chaque art alternatif est déclaré dans `packages/engine/src/arts.js` (`ARTS` : carte, nom, rareté, édition Promo).
Ses images suivent le même gabarit, dans un dossier nommé par l'identifiant de l'art :

```
art/alt/<id de l'art>/decor.webp
art/alt/<id de l'art>/perso.webp
```

Tant que ce dossier manque, l'appli montre un art provisoire (l'illustration d'origine voilée de la couleur de la rareté, avec le nom de l'art)
et l'art reste en vente. Dès que les fichiers sont là, ils remplacent l'art provisoire, sans rien changer d'autre.
