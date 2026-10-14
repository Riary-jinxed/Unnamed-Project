# Portraits des émotes de cartes

Une image par émote de carte (champ `card` dans `packages/engine/src/emotes.js`), nommée par l'identifiant de l'émote :

```
emotes/<id de l'émote>.webp   buste détouré, fond transparent, carré 256x256
```

Le portrait remplace l'icône de l'émote (bulle en partie, sélecteur, boutique). Tant que l'image manque, l'émote montre son icône.
Rien d'autre à déclarer : `client/src/main.js` trouve les fichiers tout seul.
