# Cosmétiques illustrés

Images des dos de carte, des cadres de profil et du fond de l'appli. `client/src/cosmetics.js` les trouve tout seul :
une image présente remplace le dessin CSS du même identifiant (`style.css`, `.back-…` et `.frame-…`), une image absente le laisse en place.

```
cosmetiques/dos/<id>.webp      dos de carte (clé de BACKS, packages/engine/src/rewards.js)
cosmetiques/cadres/<id>.webp   cadre de profil (clé de FRAMES)
cosmetiques/fond/sombre.webp   fond du thème sombre
cosmetiques/fond/clair.webp    fond du thème clair
```

Gabarits :
- Dos : portrait 5:7, 400x560, sans texte. Il s'affiche en petit (44x60 dans le choix, la taille d'une carte sur le plateau).
- Cadre : carré 256x256, transparent. Un anneau dont le trou central, parfaitement rond, fait 70 % de l'image ;
  le portrait du joueur s'y place (réglages `--ring-hole`, `--ring-fit` dans `theme.css`). Rien d'opaque dans le trou.
- Fond : portrait 1080x1920, sombre et peu contrasté pour `sombre`, clair pour `clair`. Il est fixe, voilé à 50 % et fondu en haut et en bas.
