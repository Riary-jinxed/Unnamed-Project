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

## Thèmes de l'interface

Chaque thème de l'interface peut avoir sa musique : `menu-<thème>` pour les menus et `partie-<thème>` pour le plateau, comme Halloween et Néon 2099. Il suffit de déposer les fichiers, sans rien changer au code. Un thème peut n'avoir que son menu : la partie garde alors la musique normale. Même règle que pour les autres : discret derrière le jeu, sans montée finale.

### Éclipse d'Ignaroth (`menu-eclipse`, `partie-eclipse`)

Le soleil noir, en plus calme que le boss : gothique, solennel, mélancolique.

Menus :

```
instrumental dark gothic fantasy ambience for a card game menu, eclipse and black sun, slow mournful cello melody, soft harp arpeggios, distant wordless choir pads, low string drones, faint tolling bell, melancholic and majestic, 70 bpm, steady mood without big build-ups, seamless loop, background game music, no vocals
```

Partie :

```
instrumental dark gothic battle ambience for a card game match, eclipse, low staccato strings ostinato, deep frame drums, dark harp ostinato, sustained choir pads in the distance, ominous horn motif, focused tension, 100 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

### Ciel d'Elyndra (`menu-astral`, `partie-astral`)

Le ciel étoilé : céleste, flottant, émerveillé.

Menus :

```
instrumental celestial fantasy ambience for a card game menu, starry night sky, shimmering celesta and glockenspiel, soft harp, warm string pads, airy flute melody, gentle synth sparkles, dreamy and wondrous, 80 bpm, steady mood without big build-ups, seamless loop, background game music, no vocals
```

Partie :

```
instrumental celestial tactical ambience for a card game match, constellations and astral magic, pulsing harp and celesta ostinato, soft taiko, airy string pads, crystalline bells, light woodwind motif, focused and luminous, 100 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

### Bois de Sylvaën (`menu-sylve`, `partie-sylve`)

La forêt des Elfes : boisée, vivante, ancienne.

Menus :

```
instrumental elven forest fantasy ambience for a card game menu, ancient enchanted woods, wooden flute and recorder melody, fingerpicked nylon guitar, celtic harp, soft hand percussion, birdsong-like woodwind trills, warm string pads, peaceful and magical, 85 bpm, steady mood without big build-ups, seamless loop, background game music, no vocals
```

Partie :

```
instrumental elven forest battle ambience for a card game match, hunters in the deep woods, plucked strings ostinato, frame drums and shakers, wooden flute motif, low cello pulse, rustling textures, focused and alert, 100 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

### Aube de Séraphine (`menu-aube`, `partie-aube`)

L'aube des Anges : lumineux, sacré, plein d'espoir.

Menus :

```
instrumental angelic dawn fantasy ambience for a card game menu, sunrise over the clouds, warm string pads, soft harp glissandi, gentle french horn melody, light wordless choir pads, chimes, hopeful and serene, major key, 75 bpm, steady mood without big build-ups, seamless loop, background game music, no vocals
```

Partie :

```
instrumental holy fantasy battle ambience for a card game match, angels at dawn, bright string ostinato, noble brass motif, soft timpani, harp arpeggios, distant choir pads, determined and radiant, 100 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

### Estampe d'Ysmera (`menu-estampe`, `partie-estampe`)

L'estampe japonaise : koto, shakuhachi, calme d'un jardin.

Menus :

```
instrumental japanese ukiyo-e inspired ambience for a card game menu, koto melody, shakuhachi flute, soft shamisen plucks, light taiko, wind chimes, cherry blossoms and ink painting, calm and elegant, pentatonic, 80 bpm, steady mood without big build-ups, seamless loop, background game music, no vocals
```

Partie :

```
instrumental japanese tactical battle ambience for a card game match, koto and shamisen ostinato, shakuhachi motif, taiko and kotsuzumi drums, low strings pulse, focused like a duel of samurai, pentatonic, 100 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

### Casino (`menu-casino`, `partie-casino`, `boss-casino`)

Le casino du Sept d'or (mini-set d'octobre) : tapis vert, dés, machine à sous. Le nom du thème est provisoire : si le thème du casino s'appelle autrement dans le jeu, renommer les fichiers d'après lui. `boss-casino` sert au boss de la quête du casino.

Menus :

```
instrumental fantasy casino lounge music for a card game menu, smooth swing jazz, walking upright bass, brushed drums, warm piano chords, muted trumpet melody, vibraphone, glamorous and playful, golden lights and green tables, 110 bpm, steady mood without big build-ups, seamless loop, background game music, no vocals
```

Partie :

```
instrumental casino heist jazz for a card game match, tense cool spy swing, walking bass ostinato, brushed snare, staccato piano stabs, muted brass hits, vibraphone motif, rolling dice and high stakes, focused and sly, 120 bpm, restrained dynamics, no climax, seamless loop, background game music, no vocals
```

Boss (le patron du casino) :

```
instrumental high stakes casino boss battle theme for a card game, big band jazz meets orchestra, driving walking bass, fast swing drums, punchy brass section stabs, wild piano runs, dramatic strings, jackpot tension, flashy and dangerous, 150 bpm, constant intensity without a final ending, seamless loop, background game music, no vocals
```

## 6. Boss mondial (`boss-mondial`)

Le boss de la semaine : une créature immense qui frappe à chaque tour, affrontée par tous les joueurs. C'est le morceau de boss principal, joué aussi par les autres boss tant qu'ils n'ont pas le leur. Ici, la musique a le droit de monter, sans couvrir les bruitages, et elle tourne en boucle toute la partie. Titre : « Le Colosse ».

```
instrumental epic dark fantasy boss battle theme for a card game, colossal monster raid, full orchestra, driving low strings ostinato, massive taiko and war drums, pounding timpani, heavy brass stabs and minor key horn fanfare, wordless epic choir pads (aah, ooh, no lyrics), anvil hits, rising tension, relentless and heroic, 135 bpm, constant intensity without a final ending, seamless loop, background game music, no vocals
```

Si Suno chante malgré tout : retirer `wordless epic choir pads` et ajouter `choir` à Exclure.

## 7. Boss d'histoire (`boss-histoire`)

Le dernier chapitre des campagnes : Vael'Thar dans les Monts d'Or, Morgrath au fond des Fosses, Séraphine devant le Septième Sceau. Plus narratif que le boss mondial : l'affrontement qu'on attend depuis le début du livre, entre la lumière des Anges et l'abîme des Démons. Titre : « Le Septième Sceau ».

```
instrumental epic fantasy final boss battle theme for a card game, climax of a legend, sweeping orchestra, heroic main theme on french horns, urgent string runs, celestial harp and bells against demonic low brass, pipe organ swells, wordless epic choir pads (aah, ooh, no lyrics), big taiko and timpani, dramatic but melodic, 130 bpm, constant intensity without a final ending, seamless loop, background game music, no vocals
```

## 8. Boss d'Halloween (`boss-halloween`)

Le Roi Citrouille, à la fin de la quête d'Halloween. Le sabbat dégénère : plus fou et plus menaçant que la partie d'Halloween, mais toujours un peu espiègle. Titre : « Le Roi Citrouille ».

```
instrumental halloween boss battle theme for a card game, the pumpkin king's mad sabbath, frantic pipe organ, wild pizzicato and col legno strings, galloping timpani, cackling bassoon and tuba, harpsichord runs, theremin glides, tolling bells, wordless spooky choir pads (ooh, no lyrics), danse macabre energy, sinister and playful, 150 bpm, constant intensity without a final ending, seamless loop, background game music, no vocals
```

## 9. Boss de l'Éclipse (`boss-eclipse`)

Ignaroth sous l'éclipse, dans le style du thème de Heolstor (Elden Ring Nightreign), lui-même proche de celui de Gael (Dark Souls III). Ce qui fait ce style : une ouverture à la harpe seule, belle et désolée ; des cordes qui montent en crescendo et installent le rythme ; puis des cordes bondissantes et frénétiques à trois temps, un grand chœur mixte majestueux et des cuivres, tragique plus que brutal. Pas d'orgue ni de cloches au premier plan, pas de percussions modernes. Ne pas écrire le nom des jeux dans Suno : il refuse les références à des œuvres existantes. Titre : « Soleil noir ».

Style :

```
tragic dark fantasy final boss orchestral theme, live symphony orchestra and large mixed choir, opens with a lonely solo harp and a mournful solo violin, beautiful and forlorn, slow strings crescendo building the rhythm, then a frantic galloping string ostinato in 6/8, prancing violins, majestic wordless choir in latin-like syllables, heroic horns and trombones, timpani rolls, melancholic minor key, sorrowful grandeur of a fallen god, cinematic, no electronic sounds, no modern drums, no guitar
```

Paroles (le champ des paroles sert ici à poser la structure ; Instrumental désactivé) :

```
[Intro: solo harp, soft violin, forlorn]

[Build: strings crescendo, choir enters softly]

[Main theme: frantic galloping strings, full choir, brass]

[Instrumental break: prancing violins, timpani]

[Climax: full orchestra and choir, tragic and majestic]

[Main theme: frantic galloping strings, full choir, brass]
```

Garder la version qui monte vite : l'intro à la harpe sera raccourcie au montage (au moment du découpage, je ne garde que 5 à 10 secondes avant la montée, et la boucle repart sur la partie rapide). Si Suno chante de vrais mots, ajouter `choir vowels only, aah ooh` au style. Trop lent : ajouter `fast tempo 160 bpm, relentless`.

## 10. Boss de Néon 2099 (`boss-neon`)

Spectre, l'IA défunte, à la fin de la quête de novembre. Électronique et agressif, le système qui se défend. Titre : « Spectre ».

```
instrumental cyberpunk boss battle theme for a card game, rogue AI ghost in the machine, aggressive darksynth, distorted analog bass ostinato, hard driving electronic drums, glitch stutters and corrupted data sounds, alarm-like synth leads, cinematic string synth hits, menacing and fast, 145 bpm, constant intensity without a drop or ending, seamless loop, background game music, no vocals
```

## 11. Boss de clan (`boss-clan`, facultatif)

Le boss affronté à plusieurs par un clan. Sans ce morceau, il joue le boss mondial : ne le faire que pour les distinguer. Plus fédérateur, comme une bataille menée ensemble. Titre : « Bannière du clan ».

```
instrumental epic fantasy war band battle theme for a card game, allies fighting a giant together, rousing celtic and nordic war drums, bagpipe-like brass melody, galloping strings, battle horns call and response, wordless warrior choir pads (no lyrics), heroic and united, 135 bpm, constant intensity without a final ending, seamless loop, background game music, no vocals
```

## Si un morceau ne plaît pas

- Boss pas assez épique : ajouter `cinematic trailer intensity, huge percussion` ; trop chargé, ajouter `fewer layers, clear melody`.
- Trop agité : ajouter `calm, sparse, minimal percussion` au début du style.
- Trop triste : ajouter `hopeful, major key`.
- Trop « film » : ajouter `lo-fi, intimate, small ensemble`.
- Une version avec chant pour une bande-annonce ou l'écran de saison est possible : demandez-moi des paroles.
