# Prompts Suno pour les musiques du jeu

Pour chaque morceau, dans Suno : mode **Custom**, **Instrumental** activé (pas de paroles), coller le **Style** (en anglais, Suno le comprend mieux), et si le champ existe, coller **Exclure** dans « Exclude styles ». Mettre le **Titre** indiqué : il deviendra le nom à donner au fichier.

Suno propose deux versions à chaque fois : garder celle qui reste la plus égale du début à la fin (la musique tourne en boucle derrière le jeu, elle ne doit pas attirer l'attention). Télécharger en MP3 et me l'envoyer dans le projet : je coupe les silences, j'égalise le volume et je l'ajoute au jeu.

Exclure (le même pour tous) :

```
vocals, singing, choir lyrics, spoken word, EDM drop, dubstep, heavy distorted guitar, abrupt ending
```

## 1. Menus (`menu`)

Accueil, collection, boutique, decks. Chaleureux, accueillant, on doit pouvoir l'écouter 20 minutes sans s'en lasser.

```
instrumental fantasy tavern ambience for a card game menu, warm medieval folk orchestra, fingerpicked lute, celtic harp, soft pizzicato strings, wooden flute melody, gentle hand drum, cozy and inviting, magical, light celesta sparkles, 90 bpm, steady mood without big build-ups, seamless loop, background music, no vocals
```

## 2. Partie (`partie`)

Pendant une partie. Un peu de tension et de concentration, sans jamais couvrir les bruitages des cartes.

```
instrumental tactical fantasy battle ambience for a card game match, low cello ostinato, soft taiko and frame drums, staccato violas, distant french horn motif, subtle harp arpeggios, focused and strategic, quiet tension, mid tempo 100 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

## 3. Menus d'Halloween (`menu-halloween`)

Saison Nuit des citrouilles. Espiègle plutôt que vraiment effrayant : citrouilles qui ricanent, sorcières, farce ou friandise.

```
instrumental whimsical halloween fantasy theme, mischievous and playful spooky, harpsichord and celesta melody, plucked pizzicato strings, bassoon and tuba bounce, music box, eerie theremin glides, light tambourine and chimes, pumpkins and witches, magical night festival, 3/4 waltz feel, 110 bpm, seamless loop, background game music, no vocals
```

## 4. Partie d'Halloween (`partie-halloween`)

La partie pendant Halloween : plus sombre, sabbat de sorcières, mais toujours discret derrière le jeu.

```
instrumental dark halloween battle ambience for a card game, witches' sabbath, low pipe organ drones, wordless ghostly choir pads, staccato low strings, deep taiko hits, tolling church bells, creepy music box motif, harpsichord accents, sinister but restrained, 100 bpm, steady tension without climax, seamless loop, background game music, no vocals
```

## 5. Novembre : Néon 2099 (`menu-cyber`, `partie-cyber`)

Saison de novembre (drones, netrunners, méchas, néons), même principe. Fichiers à déposer avant le 1er novembre.

Menus :

```
instrumental cyberpunk synthwave ambience for a card game menu, neon city at night, warm analog synth pads, arpeggiated synth bass, soft gated drums, glassy bell leads, chill and futuristic, rain atmosphere, 95 bpm, steady mood, seamless loop, background game music, no vocals
```

Partie :

```
instrumental cyberpunk tactical battle ambience for a card game match, pulsing dark synth bass ostinato, glitchy percussion, tense string synth pads, digital blips and data sounds, focused hacking mood, 110 bpm, restrained dynamics, no drop, seamless loop, background game music, no vocals
```

## 6. Boss final (`boss-final`)

Le dernier chapitre de chaque quête : Vael'Thar dans les Monts d'Or, Morgrath au fond des Fosses, Séraphine devant le Septième Sceau, puis les boss des quêtes d'événement. Ici, et seulement ici, la musique a le droit de monter : c'est l'affrontement qu'on attendait depuis le début de la quête. Elle doit rester épique sans couvrir les bruitages, et tourner en boucle pendant toute la partie. Titre : « Le Septième Sceau ».

```
instrumental epic dark fantasy final boss battle theme for a card game, apocalyptic and heroic, full orchestra, driving low strings ostinato, massive taiko and war drums, pounding timpani, brass fanfare motif in minor key, wordless epic choir pads (aah, ooh, no lyrics), pipe organ swells, tolling bells, celestial harp glints against demonic low brass, rising tension, relentless, 140 bpm, constant intensity without a final ending, seamless loop, background game music, no vocals
```

Si Suno chante malgré tout : retirer `wordless epic choir pads` et ajouter `choir` à Exclure.

## 7. Boss mondial (`boss-mondial`, facultatif)

Le boss de la semaine. Sans ce morceau, le boss mondial joue le boss final : ne le faire que pour les distinguer. Plus menaçant que dramatique : une créature immense qui frappe à chaque tour. Titre : « Le Colosse de la semaine ».

```
instrumental ominous colossal monster battle theme for a card game, heavy and menacing, deep brass stabs, low cello and contrabass riffs, booming taiko and anvil hits, dissonant horn calls, dark synth sub drones, tribal war drums, relentless pulse, 128 bpm, steady intensity without climax or drop, seamless loop, background game music, no vocals
```

## Si un morceau ne plaît pas

- Boss pas assez épique : ajouter `cinematic trailer intensity, huge percussion` ; trop chargé, ajouter `fewer layers, clear melody`.
- Trop agité : ajouter `calm, sparse, minimal percussion` au début du style.
- Trop triste : ajouter `hopeful, major key`.
- Trop « film » : ajouter `lo-fi, intimate, small ensemble`.
- Une version avec chant pour une bande-annonce ou l'écran de saison est possible : demandez-moi des paroles.
