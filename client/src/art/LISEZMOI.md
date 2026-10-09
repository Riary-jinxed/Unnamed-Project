# Illustrations des cartes

Un dossier par carte, nommé par son identifiant (clé de `CARDS` ou de `GENERALS` dans `packages/engine/src/engine.js`) :

```
art/<id>/decor.webp   scène complète
art/<id>/perso.webp   personnage détouré, fond transparent, aligné pixel pour pixel sur le décor
```

Gabarit des deux images : 960x1424 px. La fenêtre de la carte est le rectangle 832x1168 placé à (64, 192).
Le décor est coupé à cette fenêtre ; le personnage en sort (192 px en haut, 64 px sur les côtés et en bas)
à partir du niveau de carte qui le débloque (`pop` dans `CARD_LEVELS`, `packages/engine/src/rewards.js`).

Une carte sans dossier s'affiche sans illustration. Rien d'autre à déclarer : `client/src/art.js` trouve les fichiers tout seul.
