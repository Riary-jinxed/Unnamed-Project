// Quêtes d'histoire : des suites de combats contre l'IA, avec des decks préconstruits, un peu de récit et une petite carte.
// Partagé par le serveur (server/src/story.js : progression, récompenses, réglages de /admin) et l'appli (client/src/story.js :
// carte, dialogues ; client/src/story-game.js : la partie, jouée dans la page comme contre l'IA).
//
// Deux sortes de quêtes :
// - les campagnes (une par deck de départ : Gobelin, Elfe, Démon), ouvertes à tous et sans limite de temps ;
// - les quêtes à durée limitée (Halloween, Éclipse, novembre), ouvertes entre deux dates (réglables dans /admin) ; leurs récompenses
//   (carte, art Promo, titre) ne s'obtiennent que pendant ce temps, et restent acquises ensuite.
//
// Une quête = des chapitres, joués dans l'ordre. Un chapitre = un adversaire (deck préconstruit, général, force de l'IA, bonus de zone),
// un récit avant (intro) et après la victoire (outro), un lieu sur la carte (at : [x, y] en % de la carte) et une récompense,
// donnée à la première victoire. Le joueur joue le deck de la quête, que des alliés renforcent au fil des chapitres (join).
import { DECKS, GENERALS, CARDS } from './engine.js';

// L'univers en quelques lignes : montré en tête de l'écran des quêtes (« Le monde d'Éclats »).
export const LORE = {
  title: 'Les Terres d\'Aube',
  text: [
    'Avant la Fracture, il n\'y avait qu\'un monde. Quand il s\'est brisé, ses morceaux se sont dispersés dans l\'Interstice : les Éclats. Chacun est un univers à part, et certains dérivent encore les uns vers les autres.',
    'Le plus ancien, les Terres d\'Aube, tient debout grâce à sept Sceaux gravés sous ses champs de bataille. À chaque tour d\'un combat, un Sceau de plus s\'ouvre et prête sa force à qui sait la prendre ; celui qui tient deux fronts sur trois les lie à sa cause.',
    'Mais le Septième Sceau se fissure. Gobelins, Elfes et Démons l\'ont senti, chacun à sa façon.',
  ],
};

// Personnages qui parlent sans être un général : la narration.
export const NARRATOR = 'recit';

const deckOf = key => ({ name: DECKS[key].name, general: DECKS[key].general, cards: DECKS[key].cards.slice(), terrains: DECKS[key].terrains.slice() });
// Un deck préconstruit avec quelques cartes changées (in remplace out, dans l'ordre).
const tweak = (key, out = [], add = [], extra = {}) => {
  const d = deckOf(key); out.forEach((id, i) => { const k = d.cards.indexOf(id); if (k >= 0 && add[i]) d.cards[k] = add[i]; });
  return { ...d, ...extra };
};
// Adversaire : nom affiché, général (son portrait et son pouvoir), deck (clé de DECKS ou deck complet), force de l'IA
// (essais de plans : 250 contre l'IA habituelle) et bonus de départ de ses zones (forteresse, repaire…).
const foe = (name, general, deck, tries, bonus = null, art = null) => ({ name, general, deck, tries, bonus, art });
// Récompense d'un chapitre. Les nombres (Éclats, XP, Prismes, boosters, coffres) se règlent dans /admin ; carte, art et titre restent ceux-ci.
const R = (x = {}) => ({ shards: 0, xp: 0, prisms: 0, boosters: 0, chests: 0, ...x });
const C = (id, name, place, at, f, reward, intro, outro, extra = {}) => ({ id, name, place, at, foe: f, reward, intro, outro, ...extra });

// Titres des quêtes (ajoutés aux titres de rewards.js).
export const STORY_TITLES = [
  ['histoire:razzia', 'Pillard de légende'], ['histoire:racines', 'Voix des racines'], ['histoire:pacte', 'Briseur de sceaux'],
  ['quete:halloween', 'Briseur de sabbat'], ['quete:eclipse', 'Porteur d\'aube'], ['quete:neon', 'Passe-mondes'],
];

export const QUESTS = [
  // ---- Campagne Gobelin ----
  { id: 'razzia', kind: 'campagne', fam: 'Gobelin', hero: 'grisk', name: 'La Grande Razzia', map: 'razzia',
    tagline: 'Grisk, Roi des Pillards, part chercher le plus beau butin du monde.',
    prologue: 'Dans les Terriers, on raconte que le Septième Sceau chante sous l\'or. Grisk, Roi des Pillards, a décidé d\'aller le chercher. Encore faut-il que la Horde le suive.',
    deck: deckOf('gobelin'),
    chapters: [
      C('terriers', 'Le défi de Snagg', 'Les Terriers', [12, 74], foe('Snagg', 'snagg', 'gobelin', 12), R({ shards: 60, xp: 40 }),
        [['snagg', 'Roi ? Toi ? La Horde suit le plus gros bâton, Grisk. Et c\'est moi qui l\'ai.'], ['grisk', 'Alors je vais te le prendre, ton bâton. Et ta Horde avec.']],
        [['snagg', 'Bon… bon. La Horde est à toi. Mais je garde le bâton.'], ['grisk', 'Garde-le. On part piller.']]),
      C('bourg', 'Razzia au bourg', 'Le Bourg-aux-Moutons', [33, 52], foe('Milice du bourg', 'intendant', 'ange', 50), R({ shards: 80, xp: 50 }),
        [[NARRATOR, 'Le bourg dort. Ses greniers sont pleins, sa chapelle prie l\'Aube et sa milice ronfle.'], ['grisk', 'Pas de feu tant que je n\'ai pas dit « feu ». … Feu !']],
        [[NARRATOR, 'Le bourg est vidé de ses moutons, de ses tonneaux et de sa fierté. Sous la place du marché, Grisk trouve une vieille carte gravée : un chemin vers les Monts d\'Or.']]),
      C('tablee', 'Le festin de Gorbag', 'La Grande Tablée', [52, 70], foe('Gorbag le Ripailleur', 'gorbag', 'festin', 30), R({ boosters: 1, xp: 60 }),
        [['gorbag', 'Du butin ? Ici, tout ce qui entre finit dans la marmite. Toi compris.'], ['grisk', 'On a faim aussi, Gorbag. Mais on mange après la bagarre.']],
        [['gorbag', 'Belle bagarre ! Prends mon Boss de la Horde : une horde qui mange bien pille mieux.']],
        { join: { card: 'boss_horde', out: 'potion' } }),
      C('bois', 'La forêt qui chante', 'Bois de Sylvaën', [70, 42], foe('Lirael Pas-de-Vent', 'lirael', 'elfe', 140), R({ shards: 120, xp: 70 }),
        [['lirael', 'Les Gobelins ne traversent pas nos bois. Ils les contournent, ou ils y restent.'], ['grisk', 'On ne fait que passer ! Bon, et peut-être deux ou trois arbres.']],
        [['lirael', 'Le chant que tu suis… je l\'entends aussi. Il vient des Monts d\'Or, et ce n\'est pas une chanson. C\'est un appel au secours.']]),
      C('monts', 'Le magot de Vael\'Thar', 'Les Monts d\'Or', [88, 18], foe('Vael\'Thar, l\'Aîné', 'vaelthar', 'dragon', 220, [1, 1, 1]), R({ shards: 150, prisms: 10, xp: 100, art: 'grisk_razzia', title: 'histoire:razzia' }),
        [['vaelthar', 'Mille ans que je dors sur cet or, petit roi. Mille ans qu\'aucun voleur n\'en est reparti.'], ['grisk', 'Mille ans que t\'attends le bon, alors.'],
          [NARRATOR, 'Vael\'Thar se bat dans son repaire : ses trois zones commencent avec +1.']],
        [[NARRATOR, 'Sous la montagne d\'or, Grisk trouve un éclat de pierre qui brille d\'une lumière qui n\'est pas celle de l\'or : un morceau du Septième Sceau.'],
          ['grisk', 'Le plus beau butin du monde. Et quelqu\'un va venir le réclamer.']]),
    ] },

  // ---- Campagne Elfe ----
  { id: 'racines', kind: 'campagne', fam: 'Elfe', hero: 'sylvaen', name: 'Le Chant des Racines', map: 'racines',
    tagline: 'Sylvaën suit le chant mourant de l\'Arbre-Mère jusqu\'à sa source.',
    prologue: 'L\'Arbre-Mère se tait. Ses feuilles noircissent et ses racines brûlent sous la terre. Sylvaën, Voix des Bois, est la seule à entendre encore son chant, chaque jour plus faible.',
    deck: deckOf('elfe'),
    chapters: [
      C('lisiere', 'La lisière pillée', 'La Lisière', [10, 30], foe('Grisk, Roi des Pillards', 'grisk', 'gobelin', 12), R({ shards: 60, xp: 40 }),
        [['sylvaen', 'Des haches dans la lisière. Encore les Gobelins.'], ['grisk', 'On passait ! Le plus court chemin vers l\'or, c\'est tout droit.']],
        [['grisk', 'D\'accord, d\'accord, on fait le tour ! Mais ta forêt sent le brûlé, l\'Elfe. Et ça, c\'est pas nous.']]),
      C('clairiere', 'La clairière silencieuse', 'Clairière des Murmures', [30, 58], foe('Ossa la Nécromancienne', 'ossa', tweak('mortvivant', ['seigneur_os', 'chevalier_mort'], ['barde', 'potion'], { name: 'Os de la clairière' }), 25), R({ shards: 80, xp: 50 }),
        [[NARRATOR, 'Dans la clairière, les feux follets se sont éteints. À leur place, des os qui marchent.'], ['ossa', 'Les arbres meurent, la Voix. Les morts, eux, ne se fatiguent jamais.']],
        [['ossa', 'Ce n\'est pas moi qui tue ta forêt. Je ramasse seulement ce qui tombe. Cherche plus bas, sous les racines.']]),
      C('cercle', 'Le cercle d\'Elyndra', 'Cercle des Arcanes', [50, 32], foe('Elyndra, Tisseuse de sorts', 'elyndra', tweak('arcanes', ['sylvain', 'grand_druide'], ['barde', 'potion']), 90), R({ boosters: 1, xp: 60 }),
        [['elyndra', 'Ton chant ne sauvera rien, Sylvaën. Il faut des sorts. Des sorts puissants, même interdits.'], ['sylvaen', 'Un sort qui brûle la forêt pour la sauver ? Non.']],
        [['elyndra', 'Tu as raison… pour cette fois. Emmène ma Gardienne des sentiers : elle connaît les chemins sous la terre.']],
        { join: { card: 'gardienne_sentiers', out: 'potion' } }),
      C('racines', 'Les racines brûlées', 'Les Racines', [68, 66], foe('Ignaroth le Dévoreur', 'ignaroth', 'dragon', 200), R({ shards: 120, xp: 70 }),
        [['ignaroth', 'Les racines de ton arbre descendent jusqu\'à mon antre. Elles sont tendres. Elles brûlent bien.'], ['sylvaen', 'Alors je te ferai remonter, Dévoreur.']],
        [['ignaroth', 'Ce n\'est pas mon feu qui ronge ton arbre, petite Voix. C\'est le pacte, tout en bas, dans les Fosses.']]),
      C('fosses', 'Le cœur des Fosses', 'Les Fosses', [88, 82], foe('Morgrath, Seigneur des Fosses', 'morgrath', 'demon', 220, [1, 1, 1]), R({ shards: 150, prisms: 10, xp: 100, art: 'sylvaen_racines', title: 'histoire:racines' }),
        [['morgrath', 'Ton arbre boit à la même source que mes Fosses, l\'Elfe. Le Septième Sceau. Et je ne partage pas.'], ['sylvaen', 'Il n\'est à personne. Rends-le à la terre.'],
          [NARRATOR, 'Morgrath se bat chez lui : ses trois zones commencent avec +1.']],
        [[NARRATOR, 'Les racines de l\'Arbre-Mère se referment autour du Sceau fissuré. La forêt respire à nouveau, pour un temps.'],
          ['sylvaen', 'Il chante encore. Mais ce n\'est plus une berceuse : c\'est une mise en garde.']]),
    ] },

  // ---- Campagne Démon ----
  { id: 'pacte', kind: 'campagne', fam: 'Démon', hero: 'morgrath', name: 'Le Pacte des Fosses', map: 'pacte',
    tagline: 'Morgrath veut briser le Septième Sceau et ouvrir les Fosses pour de bon.',
    prologue: 'Sous les Terres d\'Aube, les Fosses grondent. Le Septième Sceau, qui les tient fermées, se fissure, et Morgrath, Seigneur des Fosses, compte bien l\'achever.',
    deck: deckOf('demon'),
    chapters: [
      C('cercle_pourpre', 'La révolte de Vorgoth', 'Le Cercle pourpre', [12, 22], foe('Vorgoth l\'Invocateur', 'vorgoth', 'demon', 12), R({ shards: 60, xp: 40 }),
        [['vorgoth', 'Tes Fosses, Morgrath, je les ouvrirai moi-même. Mon cercle est prêt.'], ['morgrath', 'Ton cercle est à moi, Invocateur. Comme toi.']],
        [['vorgoth', 'Je m\'incline… pour l\'instant. Mon cercle invoquera pour vous.']]),
      C('foire', 'Le marché des dupes', 'La Foire aux âmes', [34, 46], foe('Belzharoth, Marchand d\'âmes', 'belzharoth', 'contrat', 50), R({ shards: 80, xp: 50 }),
        [['belzharoth', 'Un Sceau à briser ? J\'ai ce qu\'il vous faut. Le prix : une âme. La vôtre, de préférence.'], ['morgrath', 'Je n\'achète pas, marchand. Je prends.']],
        [['belzharoth', 'Marché conclu, puisqu\'il le faut. Mon Héritier des abysses vous servira… à crédit.']],
        { join: { card: 'heritier_abysses', out: 'potion' } }),
      C('chateau', 'Le bal de Valdric', 'Château Valdric', [56, 24], foe('Comte Valdric', 'valdric', 'vampire', 90), R({ boosters: 1, xp: 60 }),
        [['valdric', 'Les Fosses ouvertes, la nuit serait éternelle. Charmant… si je n\'étais pas déjà le maître de la nuit.'], ['morgrath', 'Danse, Comte. Pendant que tu danses, tu ne mords pas.']],
        [['valdric', 'Allez donc briser votre Sceau. La nuit qui suivra… je la boirai.']]),
      C('serment', 'La Porte de l\'Aube', 'Le Serment', [72, 56], foe('Aurélia, Gardienne du Serment', 'aurelia', 'ange', 140), R({ shards: 120, xp: 70 }),
        [['aurelia', 'J\'ai juré de garder ce Sceau. Un serment ne se rompt pas.'], ['morgrath', 'Tout se rompt, Gardienne. Les serments, les sceaux, les ailes.']],
        [['aurelia', 'Séraphine… elle viendra. Elle vient toujours.']]),
      C('septieme', 'Séraphine, Main de l\'Aube', 'Le Septième Sceau', [90, 80], foe('Séraphine, Main de l\'Aube', 'seraphine', 'oracle', 90, [1, 1, 1]), R({ shards: 150, prisms: 10, xp: 100, art: 'morgrath_pacte', title: 'histoire:pacte' }),
        [['seraphine', 'Morgrath. Encore toi. Encore ici.'], ['morgrath', 'Pour la dernière fois, Main de l\'Aube. Ce soir, l\'Aube se couche.'],
          [NARRATOR, 'Séraphine garde le Sceau : ses trois zones commencent avec +1.']],
        [[NARRATOR, 'Le Septième Sceau se brise dans un cri de lumière. Au-dessus des Terres d\'Aube, le soleil s\'assombrit, et un dragon noir déploie ses ailes devant lui.'],
          ['morgrath', '… Ce n\'est pas ce que j\'avais prévu.']]),
    ] },

  // ---- Quêtes à durée limitée ----
  // Halloween : jusqu'à la fin de la saison Nuit des citrouilles.
  { id: 'halloween', kind: 'limitee', fam: 'Gobelin', hero: 'grisk', name: 'La Nuit des citrouilles', map: 'halloween', from: '2026-10-14', to: '2026-10-31',
    arts: { grisk: 'grisk_farce', morgrath: 'morgrath_citrouilles' },
    tagline: 'Les citrouilles ricanent, la Sorcière du sabbat allume ses lanternes.',
    prologue: 'Une nuit par an, la Sorcière du sabbat allume ses lanternes et les citrouilles se réveillent. Cette année, elles ont volé les âmes du bourg pour les mettre dans leurs bougies. Grisk, déguisé (mal) en fantôme, a flairé une farce plus grosse que les siennes.',
    deck: tweak('gobelin', ['potion', 'mercenaire'], ['citrouille', 'sorciere_sabbat'], { name: 'Farce ou friandise' }),
    chapters: [
      C('bourg_fete', 'Les lanternes s\'allument', 'Le Bourg en fête', [14, 70], foe('Citrouilles farceuses', 'snagg', tweak('gobelin', ['potion'], ['citrouille'], { name: 'Citrouilles farceuses' }), 40), R({ shards: 100, xp: 50 }),
        [[NARRATOR, 'Les rues du bourg sont pleines de lanternes… et les lanternes ont des dents.'], ['grisk', 'Farce ou friandise ? … Farce, hein. J\'aurais dû m\'en douter.']],
        [['grisk', 'Elles filent vers le cimetière. Évidemment, le cimetière.']]),
      C('cimetiere', 'Le cimetière qui ricane', 'Le Cimetière', [38, 40], foe('Ossa la Nécromancienne', 'ossa', tweak('mortvivant', ['pilleur', 'seigneur_os'], ['citrouille', 'barde'], { name: 'Os et citrouilles' }), 25), R({ card: 'epouvantail', xp: 60 }),
        [['ossa', 'Des âmes dans des citrouilles ! Quel gâchis. J\'en aurais fait de si beaux squelettes.'], ['grisk', 'Personne ne les aura. Surtout pas toi.']],
        [['ossa', 'La Sorcière danse au château de Valdric ce soir. Un bal masqué. Tu n\'as pas besoin de masque, toi.']]),
      C('bal', 'Le bal masqué', 'Château Valdric', [62, 62], foe('Dame Carmilla', 'carmilla', tweak('vampire', ['potion'], ['sorciere_sabbat'], { name: 'Bal masqué' }), 120), R({ prisms: 10, shards: 100, xp: 70 }),
        [['carmilla', 'Un Gobelin à mon bal ? Quelle audace. Quel mauvais goût. Dansons.'], ['grisk', 'Je danse très mal. Je cogne très bien.']],
        [['carmilla', 'Ta sorcière est partie à sa clairière, le sabbat va commencer. Le Seigneur des Fosses y préside, déguisé en citrouille. Si, si.']]),
      C('sabbat', 'Le Sabbat', 'La Clairière du sabbat', [86, 24], foe('Le Roi Citrouille', 'morgrath', tweak('demon', ['potion', 'mercenaire'], ['citrouille', 'sorciere_sabbat'], { name: 'Sabbat des Fosses' }), 200, [1, 1, 1]),
        R({ shards: 150, xp: 100, art: 'citrouille_lanterne', title: 'quete:halloween' }),
        [['morgrath', 'Bienvenue au sabbat, petit roi. Les âmes du bourg brûlent si joliment dans mes lanternes.'], ['grisk', 'Morgrath ?! T\'as une citrouille sur la tête.'],
          [NARRATOR, 'Le sabbat protège le Roi Citrouille : ses trois zones commencent avec +1.']],
        [[NARRATOR, 'Les lanternes s\'éteignent une à une et les âmes rentrent au bourg en ricanant. Il reste une citrouille, la plus grosse, qui suit Grisk partout.'],
          ['grisk', 'Bon. Tu t\'appelles Lanterne, et tu ne manges pas les moutons.']]),
    ] },

  // Éclipse : quelques semaines, à la suite de la campagne Démon.
  { id: 'eclipse', kind: 'limitee', fam: 'Ange', hero: 'seraphine', name: 'L\'Éclipse noire', map: 'eclipse', from: '2026-10-19', to: '2026-11-08',
    arts: { ignaroth: 'ignaroth_eclipse', vorgoth: 'vorgoth_cercle' },
    tagline: 'Le soleil s\'éteint au-dessus des Terres d\'Aube. Séraphine part le rallumer.',
    prologue: 'Le Septième Sceau s\'est brisé, et de ses morceaux est sorti un soleil noir. Ignaroth le Dévoreur s\'est posé devant l\'astre et en boit la lumière. Tant que dure l\'éclipse, les Terres d\'Aube n\'ont plus d\'aube. Séraphine, elle, n\'a jamais su attendre le matin.',
    deck: tweak('ange', ['potion'], ['voix_aube'], { name: 'Aube rebelle' }),
    chapters: [
      C('hauts', 'Le ciel s\'assombrit', 'Les Hauts de l\'Aube', [12, 76], foe('Rôdeuses de l\'éclipse', 'lirael', 'elfe', 25), R({ shards: 100, xp: 50 }),
        [[NARRATOR, 'Dans le noir, les Elfes ne reconnaissent plus amis ni ennemis. Leurs flèches volent vers tout ce qui brille.'], ['seraphine', 'Je brille. Tant pis pour moi.']],
        [['lirael', 'Pardon, Main de l\'Aube. Sans soleil, nos yeux nous trahissent. Le cercle pourpre s\'est rallumé, à l\'est.']]),
      C('cercle_noir', 'Le cercle pourpre', 'Le Cercle pourpre', [36, 46], foe('Vorgoth l\'Invocateur', 'vorgoth', 'demon', 90), R({ card: 'pretre_eclipse', xp: 60 }),
        [['vorgoth', 'L\'éclipse nourrit mon cercle. Chaque minute sans soleil, mes invocations grandissent.'], ['seraphine', 'Alors je vais faire vite.']],
        [['vorgoth', 'Le dragon noir ne boit pas seul la lumière… sa couvée aussi a faim. Va voir Ysmera, si tu oses.']]),
      C('cendres', 'La pluie de cendres', 'Le Nid des cendres', [62, 28], foe('Ysmera, Mère des couvées', 'ysmera', 'couvee', 140), R({ boosters: 1, shards: 100, xp: 70 }),
        [['ysmera', 'Mes œufs éclosent dans l\'ombre, Séraphine. Ils n\'ont jamais vu le jour. Ils ne le verront jamais.'], ['seraphine', 'Ils le verront. Tous.']],
        [[NARRATOR, 'Le nid se tait. Là-haut, devant le soleil noir, une silhouette immense ouvre un œil rouge.']]),
      C('soleil_noir', 'Ignaroth sous l\'éclipse', 'Devant le soleil noir', [88, 12], foe('Ignaroth sous l\'éclipse', 'ignaroth', 'dragon', 220, [1, 1, 1], 'ignaroth_eclipse'),
        R({ shards: 150, prisms: 15, xp: 100, art: 'seraphine_eclipse', title: 'quete:eclipse' }),
        [['ignaroth', 'Ta lumière, Main de l\'Aube… elle a le goût du matin. Je la garde pour la fin.'], ['seraphine', 'Il n\'y aura pas de fin. Il y aura une aube.'],
          [NARRATOR, 'Ignaroth plane devant le soleil noir : ses trois zones commencent avec +1.']],
        [[NARRATOR, 'Ignaroth recule, aveuglé, et le soleil noir se fend comme une coquille. La première lumière depuis des jours tombe sur les Terres d\'Aube.'],
          ['seraphine', 'Le Sceau est brisé, mais l\'Aube tient. Il faudra bien plus qu\'un dragon pour l\'éteindre.'],
          [NARRATOR, 'Au loin, à l\'endroit où le soleil s\'est fendu, quelque chose clignote. Une lumière bleue et rose, qui ne ressemble à rien de ce monde…']]),
    ] },

  // Novembre : la saison Néon 2099 et le set 3 Cité Néon (2 novembre). La brèche de l'éclipse laisse passer un Éclat futuriste.
  { id: 'neon', kind: 'limitee', fam: 'Cyborg', hero: 'kaia', name: 'Signal perdu', map: 'neon', from: '2026-11-02', to: '2026-11-30',
    tagline: 'Un Éclat venu d\'ailleurs s\'écrase sur les Terres d\'Aube. Il émet un signal.',
    prologue: 'Par la fente du soleil noir, un Éclat s\'est détaché de l\'Interstice : Cité Néon, une ville qui ne dort jamais, sous une pluie de lumière. Kaïa Lame-d\'acier y capte un signal impossible, qui vient d\'un monde de dragons et d\'anges. Quelqu\'un, là-bas, a brisé un Sceau. Et quelqu\'un, ici, veut le revendre.',
    deck: deckOf('cyborg'),
    chapters: [
      C('pluie', 'La pluie de néon', 'Bas-quartiers', [12, 72], foe('Zéro, l\'Intrus', 'zero', 'hacker', 50), R({ shards: 100, xp: 50 }),
        [['zero', 'Ton signal, Lame-d\'acier, je l\'ai capté avant toi. Et je l\'ai déjà mis aux enchères.'], ['kaia', 'Alors j\'enchéris. Avec ça.']],
        [['zero', 'L\'acheteur ? Mammon. Il paie en âmes numériques. Bonne chance.']]),
      C('darknet', 'Daemons du réseau', 'Le Darknet', [36, 40], foe('Mammon, Daemon du réseau', 'mammon', 'daemons', 50), R({ card: 'coursier_neon', xp: 60 }),
        [['mammon', 'Un Sceau d\'un autre monde. Quelle merveille. Imagine ce qu\'Arcadia paierait pour ça.'], ['kaia', 'J\'imagine surtout ce que tu vas perdre.']],
        [['mammon', 'Trop tard, de toute façon. Aurum a déjà envoyé ses dragons de la holding récupérer le colis.']]),
      C('tour', 'Arcadia Corp', 'La Tour d\'Arcadia', [62, 60], foe('Aurum, PDG d\'Arcadia', 'aurum', tweak('arcadia', ['dragon_or', 'ancien'], ['barde', 'potion']), 60), R({ boosters: 1, shards: 100, xp: 70 }),
        [['aurum', 'Tout a un prix, mercenaire. Même un morceau de monde. Surtout un morceau de monde.'], ['kaia', 'Celui-là n\'est pas à vendre.']],
        [['aurum', 'Le fragment ? Il n\'est plus dans mes coffres. Quelque chose l\'a… absorbé. Quelque chose qui était mort.']]),
      C('fantome', 'Le fantôme du Sceau', 'Le Serveur mort', [88, 22], foe('Spectre, l\'IA défunte', 'spectre_ia', 'fantomes', 100, [1, 1, 1]),
        R({ shards: 150, prisms: 15, xp: 100, art: 'kaia_signal', title: 'quete:neon' }),
        [['spectre_ia', 'J\'ÉTAIS MORTE. LE SCEAU M\'A RENDU LA VIE. JE NE LE RENDRAI PAS.'], ['kaia', 'Tu vas le rendre. À son monde.'],
          [NARRATOR, 'Spectre a pris le serveur : ses trois zones commencent avec +1.']],
        [[NARRATOR, 'Le fragment du Sceau s\'échappe du serveur dans une gerbe de lumière dorée et file vers la brèche. Pour un instant, Cité Néon et les Terres d\'Aube se touchent.'],
          ['kaia', 'Des dragons. Des anges. Et un gobelin qui me fait coucou. … Il va falloir que j\'aille voir ça de plus près.']]),
    ] },
];

export const questById = id => QUESTS.find(q => q.id === id) || null;
export const QUEST_IDS = QUESTS.map(q => q.id);
export const isLimited = q => q.kind === 'limitee';

// Deck joué au chapitre i : celui de la quête, avec les alliés rejoints aux chapitres précédents (join, gagné à la fin du chapitre).
export function chapterDeck(q, i) {
  const d = { ...q.deck, cards: q.deck.cards.slice(), terrains: q.deck.terrains.slice() };
  for (const ch of q.chapters.slice(0, i)) {
    if (!ch.join) continue;
    const k = d.cards.indexOf(ch.join.out); if (k >= 0 && !d.cards.includes(ch.join.card)) d.cards[k] = ch.join.card;
  }
  return d;
}
// Deck de l'adversaire d'un chapitre : un deck complet, avec son général.
export function foeDeck(ch) {
  const d = typeof ch.foe.deck === 'string' ? DECKS[ch.foe.deck] : ch.foe.deck;
  return { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: ch.foe.general };
}
// Portrait d'un personnage dans une quête : l'art choisi pour la quête (arts), sinon celui du chapitre, sinon l'original.
export const castArt = (q, gen, ch = null) => (ch && ch.foe.general === gen && ch.foe.art) || q.arts?.[gen] || null;
export const castName = gen => GENERALS[gen]?.name || 'Récit';

// ---- Réglages (/admin) ----
// Par quête : on (ouverte ou non), from et to (dates, quêtes limitées seulement : « AAAA-MM-JJ », jours de Paris compris)
// et les récompenses de chaque chapitre (les nombres ; carte, art et titre restent fixés ci-dessus).
export const REWARD_KEYS = ['shards', 'xp', 'prisms', 'boosters', 'chests'];
export const STORY_LIMITS = { shards: [0, 5000], xp: [0, 2000], prisms: [0, 500], boosters: [0, 10], chests: [0, 5] };
export const DEFAULT_STORY = Object.fromEntries(QUESTS.map(q => [q.id, { on: true, ...(isLimited(q) ? { from: q.from, to: q.to } : {}),
  rewards: q.chapters.map(ch => Object.fromEntries(REWARD_KEYS.map(k => [k, ch.reward[k] || 0]))) }]));
// Réglages d'une quête : ceux de /admin par-dessus les valeurs par défaut.
export function questCfg(id, doc = {}) {
  const d = DEFAULT_STORY[id], o = doc[id] || {};
  return { ...d, ...o, rewards: d.rewards.map((r, i) => ({ ...r, ...(o.rewards?.[i] || {}) })) };
}
// Récompense d'un chapitre : les nombres réglés, plus la carte, l'art et le titre du chapitre.
export function chapterReward(q, i, c = questCfg(q.id)) {
  const ch = q.chapters[i], n = c.rewards[i] || {};
  const out = Object.fromEntries(REWARD_KEYS.filter(k => n[k]).map(k => [k, n[k]]));
  for (const k of ['card', 'art', 'title']) if (ch.reward[k]) out[k] = ch.reward[k];
  return out;
}
// État d'une quête un jour donné : « open » (jouable), « soon » (limitée, pas encore commencée), « over » (finie), « off » (fermée).
export function questState(q, c, day) {
  if (!c.on) return 'off';
  if (!isLimited(q)) return 'open';
  if (c.from && day < c.from) return 'soon';
  if (c.to && day > c.to) return 'over';
  return 'open';
}
// Jours qui restent à une quête limitée (aujourd'hui compris).
export const questDaysLeft = (c, day) => (c.to ? Math.max(1, Math.round((Date.parse(`${c.to}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000) + 1) : null);

// Cartes et arts gagnés dans les quêtes : pour dire où les obtenir (collection) et les cacher avant le début d'une quête.
export const STORY_CARDS = Object.fromEntries(QUESTS.flatMap(q => q.chapters.filter(ch => ch.reward.card).map(ch => [ch.reward.card, q.id])));
export const questOfCard = id => questById(STORY_CARDS[id]);
// Vérification au chargement : chaque adversaire et chaque allié existe (une faute de frappe casserait une partie).
for (const q of QUESTS) for (const ch of q.chapters) {
  if (!GENERALS[ch.foe.general]) throw new Error(`Quête ${q.id}, ${ch.id} : général inconnu ${ch.foe.general}`);
  const d = foeDeck(ch); for (const id of d.cards) if (!CARDS[id]) throw new Error(`Quête ${q.id}, ${ch.id} : carte inconnue ${id}`);
  if (ch.join && !CARDS[ch.join.card]) throw new Error(`Quête ${q.id}, ${ch.id} : allié inconnu ${ch.join.card}`);
}
