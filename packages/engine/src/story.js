// Quêtes d'histoire : des suites de combats contre l'IA, avec des decks préconstruits, un peu de récit et une petite carte.
// Partagé par le serveur (server/src/story.js : progression, récompenses, réglages de /admin) et l'appli (client/src/story.js :
// carte, dialogues ; la partie se joue dans la page avec solo.js, comme contre l'IA).
//
// Deux onglets dans l'appli :
// - Histoire principale : les campagnes (une par deck de départ : Gobelin, Elfe, Démon), ouvertes à tous et sans limite de temps,
//   puis les quêtes d'événement qui font avancer l'histoire (canon), une fois leur événement fini ;
// - Événements : les quêtes à durée limitée (Halloween, Éclipse, novembre), ouvertes entre deux dates (réglables dans /admin).
// Une quête d'événement canon arrive ensuite pour de bon dans l'histoire principale (état « archive ») : même progression, mêmes
// récompenses, sauf l'art Promo (plus jamais donné) et la carte de quête, remplacée par des Éclats (CARD_SHARDS) : la carte rejoint
// le booster du Set de base (releasedStoryCards, appliqué au catalogue par le serveur). Une quête non canon (Halloween) disparaît.
//
// Une quête = des chapitres, joués dans l'ordre. Un chapitre = un adversaire (deck préconstruit, général, force de l'IA, bonus de zone),
// un récit avant (intro) et après la victoire (outro), un lieu sur la carte (at : [x, y] en % de la carte) et une récompense,
// donnée à la première victoire. Le joueur joue le deck de la quête, que des alliés renforcent au fil des chapitres (join).
import { DECKS, GENERALS, CARDS } from './engine.js';
import { t } from './i18n.js';

// L'univers en quelques lignes : montré en tête de l'histoire principale. Les trois campagnes (livres I à III) se suivent,
// puis les quêtes d'événement canon (Éclipse, Signal perdu) racontent la suite.
export const LORE = {
  title: 'Les Terres d\'Aube',
  text: [
    "Les Terres d'Aube sont le plus vieux des Éclats, ces morceaux de monde qui flottent dans l'Interstice. Gobelins, Elfes, Anges, Dragons, Vampires et Morts-vivants s'y disputent les champs, les forêts et les montagnes.",
    "Sous leurs pieds s'ouvrent les Fosses, un abîme rempli de Démons. Il y a mille ans, les Anges l'ont fermé avec sept Sceaux. Les guerres en ont brisé six. Il ne reste que le Septième Sceau, et sa clé : un éclat de lumière que le dragon Vael'Thar garde au fond de son trésor.",
    "Tant que la clé reste à sa place, le Sceau tient et le soleil se lève. Tout commence le jour où un gobelin décide de la voler.",
  ],
};

// Qui parle dans un dialogue : un général, une carte (son illustration sert de portrait) ou la narration.
// Une réplique est [qui, texte] ou [qui, texte, illustration] : une carte ou un terrain montré en grand au-dessus du texte.
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
// goal : l'enjeu du chapitre en une phrase, montré sur sa fiche. scene : le lieu, un terrain (art/terrain) ou une carte illustrée,
// en tête des dialogues (SCENES, plus bas).
const C = (id, name, place, at, goal, f, reward, intro, outro, extra = {}) => ({ id, name, place, at, goal, foe: f, reward, intro, outro, scene: null, ...extra });

// Titres des quêtes (ajoutés aux titres de rewards.js).
export const STORY_TITLES = [
  ['histoire:razzia', 'Pillard de légende'], ['histoire:racines', 'Voix des racines'], ['histoire:pacte', 'Briseur de sceaux'],
  ['quete:halloween', 'Briseur de sabbat'], ['quete:casino', 'Briseur de banque'], ['quete:eclipse', 'Porteur d\'aube'], ['quete:neon', 'Passe-mondes'],
];

// book : numéro du livre (campagnes), next : la quête qui raconte la suite.
export const QUESTS = [
  // ---- Livre I : Grisk vole la clé du Septième Sceau ----
  { id: 'razzia', kind: 'campagne', book: 1, next: 'racines', fam: 'Gobelin', hero: 'grisk', name: 'La Grande Razzia', map: 'razzia',
    tagline: "Grisk part voler le plus beau trésor du monde, sans savoir ce que c'est.",
    prologue: "Dans les Terriers, une vieille chanson parle d'un trésor qui brille plus que l'or, caché sous les Monts d'Or et gardé par le plus vieux des dragons. Grisk, qui se dit Roi des Pillards, a décidé d'aller le prendre. Il lui manque une armée, une carte et un peu de courage. Il commence par l'armée.",
    deck: deckOf('gobelin'),
    chapters: [
      C('terriers', 'Le défi de Snagg', 'Les Terriers', [12, 74], "Battre Snagg pour prendre la tête de la Horde.",
        foe('Snagg', 'snagg', 'gobelin', 12), R({ shards: 60, xp: 40 }),
        [[NARRATOR, "Les Terriers, au petit matin. Toute la Horde s'est massée autour du grand trou pour savoir qui va la commander."],
          ['grisk', "Gobelins ! Sous les Monts d'Or dort un trésor plus brillant que l'or. Qui me suit le partage avec moi !"],
          ['chef', "Et on partage comment, chef ? Moitié-moitié ?"],
          ['grisk', "Moitié pour moi, moitié pour moi. Le reste pour vous."],
          ['snagg', "La Horde suit le plus gros bâton, Grisk. Pas le plus beau discours. Et le plus gros bâton, c'est moi qui l'ai."],
          ['grisk', "Alors je vais te le prendre, ton bâton. Et la Horde avec."]],
        [['snagg', "Bon… bon. La Horde est à toi. Mais je garde le bâton, il était à ma mère."],
          ['grisk', "Garde-le. Maintenant, il nous faut une carte pour trouver les Monts d'Or."],
          ['chef', "Le bourg d'en bas a une chapelle. Les chapelles, ça a toujours des vieilles cartes. Et des moutons."],
          ['grisk', "Des cartes et des moutons. En route !"]]),
      C('bourg', 'Razzia au bourg', 'Le Bourg-aux-Moutons', [33, 52], "Piller le bourg pour trouver la carte des Monts d'Or.",
        foe('Milice du bourg', 'intendant', 'ange', 50), R({ shards: 80, xp: 50 }),
        [[NARRATOR, "Le Bourg-aux-Moutons dort. Ses greniers sont pleins, sa chapelle prie l'Aube et sa milice ronfle."],
          ['grisk', "Pas un bruit. Pas de feu tant que je n'ai pas dit « feu »."],
          ['chef', "Chef… le petit Krok a déjà allumé la grange."],
          ['grisk', "… Feu !"],
          ['intendant', "Aux armes ! Les Gobelins ! Sonnez la cloche, rentrez les moutons et sortez les fourches !"]],
        [[NARRATOR, "Le bourg est vidé de ses moutons, de ses tonneaux et de sa fierté. Dans la crypte de la chapelle, Grisk trouve une carte gravée sur une plaque de cuivre."],
          ['intendant', "Pas ça ! C'est la carte des Anges. Elle mène au gardien du Sceau. Personne ne doit y aller !"],
          ['grisk', "Un gardien ? Donc un trésor. Merci du conseil, l'ami."],
          [NARRATOR, "La carte montre un chemin : la Grande Tablée, le Bois de Sylvaën, puis les Monts d'Or."]]),
      C('tablee', 'Le festin de Gorbag', 'La Grande Tablée', [52, 70], "Gagner le respect de Gorbag pour traverser son camp.",
        foe('Gorbag le Ripailleur', 'gorbag', 'festin', 15), R({ boosters: 1, xp: 60 }),
        [[NARRATOR, "Sur la route, une odeur de ragoût. La Grande Tablée, le camp de Gorbag le Ripailleur, barre le seul passage vers l'est."],
          ['marmiton', "Halte ! On ne passe pas sans payer. Une tête de mouton par gobelin. Ou un gobelin par tête de mouton."],
          ['gorbag', "Du butin, Grisk ? Ici, tout ce qui entre finit dans la marmite. Les moutons, les tonneaux… et les petits rois."],
          ['grisk', "On a faim aussi, Gorbag. Mais chez nous, on mange après la bagarre."],
          ['gorbag', "Ha ! Voilà qui me plaît. Le gagnant mange le premier !"]],
        [['gorbag', "Belle bagarre ! Tu cognes comme un cuisinier qui rate sa sauce. C'est un compliment."],
          ['gorbag', "Prends mon Boss de la Horde. Une horde qui mange bien pille mieux."],
          ['boss_horde', "BOSS ! On pille quoi ? On pille où ? On pille quand ?"],
          ['grisk', "Tout, partout, tout de suite. Mais d'abord, on traverse la forêt."],
          ['gorbag', "La forêt des Elfes ? Méfie-toi. Depuis quelques jours, elle chante. Et pas des chansons à boire."]],
        { join: { card: 'boss_horde', out: 'potion' } }),
      C('bois', 'La forêt qui chante', 'Bois de Sylvaën', [70, 42], "Traverser le Bois de Sylvaën malgré Lirael et ses archères.",
        foe('Lirael Pas-de-Vent', 'lirael', 'elfe', 140), R({ shards: 120, xp: 70 }),
        [[NARRATOR, "Sous les arbres de Sylvaën flotte un chant doux et triste. Il vient toujours de l'est, là où sont les Monts d'Or."],
          ['archere', "Pas un pas de plus, Gobelins. Une flèche par oreille, ça fait deux flèches par tête."],
          ['lirael', "Les Gobelins ne traversent pas nos bois. Ils les contournent, ou ils y restent."],
          ['grisk', "On ne fait que passer ! On coupe deux ou trois arbres, pas plus. Quatre, maximum."],
          ['lirael', "Tu entends ce chant, Grisk ? Tu le suis depuis des jours sans le savoir. Je ne te laisserai pas aller là où il mène."]],
        [['lirael', "Tu es têtu. Alors écoute au moins ceci."],
          ['lirael', "Ce chant, c'est la voix du Septième Sceau, celui qui ferme les Fosses. Et le trésor que tu cherches, c'est sa clé."],
          ['grisk', "Une clé qui chante ? Ça doit valoir une fortune."],
          ['lirael', "Si tu la prends, le Sceau se fissurera. Et ce qui dort dessous se réveillera."],
          ['grisk', "Bah. Ça dort depuis mille ans, ça peut bien dormir encore un peu."]]),
      C('monts', 'Le magot de Vael\'Thar', 'Les Monts d\'Or', [88, 18], "Vaincre Vael'Thar, le dragon qui garde la clé du Septième Sceau.",
        foe('Vael\'Thar, l\'Aîné', 'vaelthar', 'dragon', 120, [1, 1, 1]), R({ shards: 150, prisms: 10, xp: 100, art: 'grisk_razzia', title: 'histoire:razzia' }),
        [[NARRATOR, "Au cœur des Monts d'Or, une caverne plus grande qu'une cathédrale. Des montagnes de pièces, de couronnes et de coupes. Et au sommet, endormi, le plus vieux des dragons."],
          ['gardien_magot', "Maître ! Maître, réveillez-vous ! Un gobelin marche sur votre or avec ses bottes !"],
          ['vaelthar', "Mille ans que je dors sur cet or, petit roi. Mille ans qu'aucun voleur n'en est reparti."],
          ['grisk', "Mille ans que t'attends le bon, alors."],
          ['vaelthar', "Tu ne sais pas ce que tu cherches. Ce n'est pas de l'or que je garde, c'est le sommeil des Fosses."],
          ['grisk', "Moi, je garde surtout ce que je vole."]],
        [['vaelthar', "Arrête… Prends l'or, prends les couronnes. Mais pas la clé."],
          [NARRATOR, "Trop tard. Au sommet du trésor, Grisk soulève un éclat de pierre qui brille d'une lumière blanche, plus belle que tout l'or du monde."],
          [NARRATOR, "Au même instant, très loin sous terre, quelque chose craque. Le Septième Sceau vient de se fissurer."],
          ['grisk', "Le plus beau butin du monde. Et il chante, en plus. … Pourquoi la montagne tremble ?"],
          ['vaelthar', "Parce que tu viens de réveiller les Fosses, petit roi. Et elles vont venir chercher ce que tu tiens."]]),
    ] },

  // ---- Livre II : le Sceau se fissure, Sylvaën retient la fissure ----
  { id: 'racines', kind: 'campagne', book: 2, next: 'pacte', fam: 'Elfe', hero: 'sylvaen', name: 'Le Chant des Racines', map: 'racines',
    tagline: "La clé volée, le Sceau se fissure. Sylvaën descend jusqu'à la fissure.",
    prologue: "Depuis que Grisk a volé la clé, le Septième Sceau se fissure. Les racines de l'Arbre-Mère, qui l'entourent depuis toujours, boivent ce qui s'en échappe : le feu des Fosses. Ses feuilles noircissent. Sylvaën, Voix des Bois, est la seule à entendre encore son chant, chaque jour plus faible. Elle descend le long des racines pour trouver d'où vient le mal.",
    deck: deckOf('elfe'),
    chapters: [
      C('lisiere', 'La lisière pillée', 'La Lisière', [10, 30], "Chasser Grisk, qui rentre des Monts d'Or en coupant à travers la forêt.",
        foe('Grisk, Roi des Pillards', 'grisk', 'gobelin', 12), R({ shards: 60, xp: 40 }),
        [[NARRATOR, "La lisière de la forêt. Des souches fraîches, des tonneaux vides et des chansons à boire : la Horde rentre des Monts d'Or."],
          ['druidesse', "Voix des Bois, ils ont abattu trois chênes pour faire un feu. Trois chênes de cent ans !"],
          ['sylvaen', "Des haches dans la lisière. Encore les Gobelins."],
          ['grisk', "On rentre à la maison, c'est tout ! Le plus court chemin, c'est tout droit."],
          ['sylvaen', "Ce que tu portes à ta ceinture… il chante, Grisk. Tu ne l'entends pas ?"],
          ['grisk', "Si, et il chante faux. Bas les pattes, c'est mon butin."]],
        [['grisk', "D'accord, d'accord, on fait le tour ! Mais ta forêt sent le brûlé, l'Elfe. Et ça, c'est pas nous."],
          ['sylvaen', "C'est la clé du Sceau. Tu l'as prise aux Monts d'Or. Rends-la, tant qu'il est temps."],
          ['grisk', "Jamais. Je vais la vendre à la Foire aux âmes, à un prix de roi."],
          [NARRATOR, "La Horde file vers le sud avec la clé. Sylvaën la laisse partir : sous ses pieds, les racines brûlent, et ça ne peut plus attendre."]]),
      C('clairiere', 'La clairière silencieuse', 'Clairière des Murmures', [30, 58], "Chasser Ossa et ses morts de la Clairière des Murmures.",
        foe('Ossa la Nécromancienne', 'ossa', tweak('mortvivant', ['seigneur_os', 'chevalier_mort'], ['barde', 'potion'], { name: 'Os de la clairière' }), 25), R({ shards: 80, xp: 50 }),
        [[NARRATOR, "Dans la Clairière des Murmures, les feux follets se sont éteints. Les arbres malades perdent leurs branches, et des os qui marchent les ramassent."],
          ['druidesse', "Elle fait des squelettes avec nos arbres morts. Des squelettes en bois !"],
          ['ossa', "Les arbres meurent, la Voix. Les morts, eux, ne se fatiguent jamais. Je ne fais que ramasser ce qui tombe."],
          ['sylvaen', "Rien ne tombe ici sans que la forêt le veuille. Rends-lui ses branches."],
          ['ossa', "Viens les chercher. Mes squelettes adorent les Elfes : ils sont si bien rangés."]],
        [['ossa', "Tu tapes fort, pour quelqu'un qui parle aux fleurs."],
          ['ossa', "Écoute. Ce n'est pas moi qui tue ta forêt. Le mal vient d'en bas, sous les racines. Le Sceau fuit, et ce qui en sort a l'odeur des Fosses."],
          ['sylvaen', "Alors il faut descendre. Mais personne ne connaît les chemins sous la terre."],
          ['ossa', "Elyndra les connaît. Elle étudie les racines depuis des années. Elle étudie aussi des choses moins avouables."]]),
      C('cercle', 'Le cercle d\'Elyndra', 'Cercle des Arcanes', [50, 32], "Empêcher Elyndra de lancer un sort interdit qui brûlerait la forêt.",
        foe('Elyndra, Tisseuse de sorts', 'elyndra', tweak('arcanes', ['sylvain', 'grand_druide'], ['barde', 'potion']), 90), R({ boosters: 1, xp: 60 }),
        [[NARRATOR, "Au Cercle des Arcanes, les pierres dressées bourdonnent. Elyndra a tracé au sol un sort immense, qui couvre toute la clairière."],
          ['elyndra', "Te voilà, Sylvaën. J'ai trouvé comment sauver l'Arbre-Mère."],
          ['sylvaen', "Ce sort… il va brûler la forêt entière."],
          ['elyndra', "Il brûlera le mal avec. On replantera. Ton chant ne sauvera rien : il faut des sorts puissants, même interdits."],
          ['sylvaen', "Un sort qui brûle la forêt pour la sauver ? Non. Pas tant que je tiens debout."]],
        [['elyndra', "Tu as raison… pour cette fois. J'étais si pressée que j'en oubliais ce que je voulais sauver."],
          ['elyndra', "Emmène ma Gardienne des sentiers. Elle connaît les chemins sous la terre, jusqu'aux plus profondes racines."],
          ['gardienne_sentiers', "Les racines descendent loin, Voix des Bois. Suivez ma lanterne, et ne marchez pas sur les champignons."],
          ['sylvaen', "Qu'est-ce qu'on trouve, tout en bas ?"],
          ['gardienne_sentiers', "D'habitude, de l'eau et de la pierre. Depuis quelques jours… de la chaleur. Et quelque chose qui respire."]],
        { join: { card: 'gardienne_sentiers', out: 'potion' } }),
      C('racines', 'Les racines brûlées', 'Les Racines', [68, 66], "Chasser Ignaroth, qui dévore les racines de l'Arbre-Mère.",
        foe('Ignaroth le Dévoreur', 'ignaroth', 'dragon', 200), R({ shards: 120, xp: 70 }),
        [[NARRATOR, "Sous la terre, les racines de l'Arbre-Mère plongent dans une caverne brûlante. Enroulé autour d'elles, un dragon rouge les ronge comme des os."],
          ['gardienne_sentiers', "Là, Voix des Bois. C'est lui qui respire."],
          ['ignaroth', "Les racines de ton arbre descendent jusqu'à mon antre, petite Voix. Elles sont gorgées de lumière. Elles brûlent si bien."],
          ['sylvaen', "Cette lumière vient du Sceau. Tu bois ce qui le fait tenir."],
          ['ignaroth', "Je bois ce qui fuit. Plus il fuit, plus je grandis. Un jour, je boirai le soleil lui-même."],
          ['sylvaen', "Alors je vais te renvoyer à la surface, Dévoreur. À coups de racines."]],
        [['ignaroth', "Tu me chasses, mais la fuite continue. Ce n'est pas mon feu qui ronge ton arbre, c'est la fissure."],
          ['ignaroth', "Descends encore. Tout en bas, aux Fosses, quelqu'un attend que le Sceau cède. Et il a déjà la main dessus."],
          [NARRATOR, "Ignaroth s'envole par une crevasse vers le ciel. Il emporte assez de lumière pour faire de grandes choses. Ou de terribles."]]),
      C('fosses', 'Le cœur des Fosses', 'Les Fosses', [88, 82], "Repousser Morgrath et refermer la fissure avec les racines.",
        foe('Morgrath, Seigneur des Fosses', 'morgrath', tweak('demon', ['archidemon'], ['barde']), 120, [1, 1, 1]), R({ shards: 150, prisms: 10, xp: 100, art: 'sylvaen_racines', title: 'histoire:racines' }),
        [[NARRATOR, "Tout en bas, les racines touchent enfin le Septième Sceau : une dalle de lumière, fendue de part en part. De l'autre côté, les Fosses grondent."],
          ['morgrath', "Une Elfe ? Si bas ? Ton arbre boit à la même source que mes Fosses : le Sceau. Et je ne partage pas."],
          ['sylvaen', "Ce Sceau n'est à personne. Il retient ton abîme depuis mille ans."],
          ['morgrath', "Il ne retiendra plus rien bien longtemps. Un gobelin a volé sa clé. Je n'ai plus qu'à pousser."],
          ['sylvaen', "Alors c'est moi que tu vas devoir pousser."]],
        [[NARRATOR, "Morgrath recule dans l'ombre des Fosses. Les racines de l'Arbre-Mère s'enroulent autour du Sceau et serrent la fissure, comme on bande une plaie."],
          ['morgrath', "Tes racines tiendront un temps, l'Elfe. Mais la clé est toujours dehors. Et ce gobelin vend tout ce qu'il vole."],
          ['sylvaen', "La Foire aux âmes…"],
          ['morgrath', "Exactement. Je vais faire des courses."],
          [NARRATOR, "Là-haut, l'Arbre-Mère reprend des couleurs. Mais son chant a changé : ce n'est plus une berceuse, c'est une alerte."]]),
    ] },

  // ---- Livre III : Morgrath reprend la clé et brise le Sceau ----
  { id: 'pacte', kind: 'campagne', book: 3, next: 'eclipse', fam: 'Démon', hero: 'morgrath', name: 'Le Pacte des Fosses', map: 'pacte',
    tagline: 'Morgrath récupère la clé et marche sur le Septième Sceau.',
    prologue: "Les racines de l'Arbre-Mère retiennent la fissure, mais pour combien de temps ? Morgrath, Seigneur des Fosses, a besoin de la clé pour ouvrir le Sceau pour de bon, et Grisk l'a vendue à la Foire aux âmes. Avant d'aller la chercher, Morgrath doit remettre de l'ordre chez lui.",
    deck: deckOf('demon'),
    chapters: [
      C('cercle_pourpre', 'La révolte de Vorgoth', 'Le Cercle pourpre', [12, 22], "Mater Vorgoth, qui veut ouvrir les Fosses à la place de Morgrath.",
        foe('Vorgoth l\'Invocateur', 'vorgoth', 'demon', 12), R({ shards: 60, xp: 40 }),
        [[NARRATOR, "Au fond des Fosses, au Cercle pourpre, des centaines de cultistes chantent autour d'un cercle de feu. Au centre se tient Vorgoth l'Invocateur."],
          ['cultiste', "Gloire à Vorgoth ! Gloire au nouveau Seigneur des Fosses !"],
          ['morgrath', "Au nouveau quoi ?"],
          ['vorgoth', "Pendant qu'une Elfe te repoussait, j'ai préparé mon cercle. Les Fosses, Morgrath, je les ouvrirai moi-même."],
          ['morgrath', "Ton cercle est à moi, Invocateur. Comme toi. Comme tout ce qui brûle ici."]],
        [['vorgoth', "Je m'incline… pour l'instant. Mon cercle invoquera pour vous."],
          ['cultiste', "Gloire à Morgrath ! Gloire à… l'ancien nouveau Seigneur des Fosses !"],
          ['morgrath', "Bien. Maintenant, allons faire nos courses. Il paraît qu'un gobelin a vendu quelque chose de précieux à la Foire."]]),
      C('foire', 'Le marché des dupes', 'La Foire aux âmes', [34, 46], "Reprendre la clé du Sceau à Belzharoth, sans signer son contrat.",
        foe('Belzharoth, Marchand d\'âmes', 'belzharoth', 'contrat', 50), R({ shards: 80, xp: 50 }),
        [[NARRATOR, "La Foire aux âmes : des étals à perte de vue, où l'on vend des promesses, des souvenirs et des âmes. Au centre, la tente pourpre de Belzharoth."],
          ['diablotin', "Approchez, Seigneur ! Une âme presque neuve ? Un regret de seconde main ?"],
          ['belzharoth', "Seigneur Morgrath ! Je sais ce que vous cherchez. Un gobelin me l'a vendue hier, pour un chariot de saucisses."],
          ['morgrath', "La clé du Septième Sceau. Pour des saucisses."],
          ['belzharoth', "De très bonnes saucisses. Pour vous, le prix est une âme. La vôtre, de préférence. Signez ici."],
          ['morgrath', "Je n'achète pas, marchand. Je prends."]],
        [['belzharoth', "Marché conclu, puisqu'il le faut. Voici la clé, Seigneur. Et en prime, mon Héritier des abysses, qui vous servira… à crédit."],
          ['heritier_abysses', "Les abysses vous saluent, Seigneur. Elles ont hâte de remonter."],
          [NARRATOR, "Dans la main de Morgrath, l'éclat de lumière cesse de chanter. Il gronde."],
          ['morgrath', "Reste à atteindre le Sceau. Le seul chemin passe par la surface, sous le château du Comte Valdric."]],
        { join: { card: 'heritier_abysses', out: 'potion' } }),
      C('chateau', 'Le bal de Valdric', 'Château Valdric', [56, 24], "Traverser le château de Valdric, qui ne veut pas d'une nuit éternelle.",
        foe('Comte Valdric', 'valdric', 'vampire', 90), R({ boosters: 1, xp: 60 }),
        [[NARRATOR, "Château Valdric, à minuit. Un bal masqué bat son plein. Les invités dansent, et certains ne repartiront pas."],
          ['servante', "Le Seigneur des Fosses, Monsieur le Comte. Il n'a pas de carton d'invitation."],
          ['valdric', "Morgrath. Les Fosses ouvertes, la nuit serait éternelle. Charmant… si je n'étais pas déjà le maître de la nuit."],
          ['morgrath', "Je ne viens pas pour ta nuit, Comte. Je viens pour la porte qui est sous ta cave."],
          ['valdric', "La Porte de l'Aube ? Alors il faudra danser. Et je mène toujours."],
          ['morgrath', "Danse, Comte. Pendant que tu danses, tu ne mords pas."]],
        [['valdric', "Allez donc briser votre Sceau. Moi, je ferme les volets."],
          ['valdric', "Mais la Porte a une gardienne. Aurélia ne dort jamais, et elle ne danse pas."],
          ['morgrath', "Personne n'est parfait."]]),
      C('serment', 'La Porte de l\'Aube', 'Le Serment', [72, 56], "Passer la Porte de l'Aube, gardée par Aurélia et son serment.",
        foe('Aurélia, Gardienne du Serment', 'aurelia', 'ange', 140), R({ shards: 120, xp: 70 }),
        [[NARRATOR, "Sous le château, un escalier de lumière descend vers une porte immense, gravée d'ailes. Devant elle, une ange en armure, l'épée plantée dans le sol."],
          ['aurelia', "Halte, Seigneur des Fosses. J'ai juré de garder cette porte jusqu'à la fin du monde."],
          ['morgrath', "Ça tombe bien. C'est exactement ce que je viens faire."],
          ['messagere', "Gardienne ! Il a la clé ! Je l'ai vue briller dans sa main !"],
          ['aurelia', "Alors préviens Séraphine. Vole, vite. Moi, je tiendrai."],
          ['morgrath', "Tout se rompt, Gardienne. Les serments, les sceaux, les ailes."]],
        [['aurelia', "Mon serment… je ne l'ai pas tenu."],
          ['morgrath', "Tu as tenu longtemps. Mille ans, c'est beaucoup, pour une porte."],
          ['aurelia', "Séraphine viendra. Elle vient toujours."],
          [NARRATOR, "La Porte de l'Aube s'ouvre en grinçant. Derrière, une salle immense et, au centre, le Septième Sceau, fendu et enlacé de racines."]]),
      C('septieme', 'Séraphine, Main de l\'Aube', 'Le Septième Sceau', [90, 80], "Vaincre Séraphine et briser le Septième Sceau.",
        foe('Séraphine, Main de l\'Aube', 'seraphine', tweak('oracle', ['archange', 'dominion'], ['golem', 'potion']), 30, [1, 1, 1]), R({ shards: 150, prisms: 10, xp: 100, art: 'morgrath_pacte', title: 'histoire:pacte' }),
        [[NARRATOR, "Une lumière descend du plafond de la salle : Séraphine, Main de l'Aube, se pose entre Morgrath et le Sceau."],
          ['seraphine', "Morgrath. Encore toi. Encore ici."],
          ['morgrath', "Pour la dernière fois, Main de l'Aube. J'ai la clé. Il suffit de la tourner à l'envers."],
          ['seraphine', "Les Anges ont scellé ton abîme pour une raison. Ce qui dort dans les Fosses n'obéit à personne. Pas même à toi."],
          ['morgrath', "On verra bien. Ce soir, l'Aube se couche."]],
        [[NARRATOR, "Morgrath plante la clé dans le Sceau et la tourne. Les racines de l'Arbre-Mère cèdent une à une. Le Septième Sceau se brise dans un cri de lumière."],
          [NARRATOR, "La lumière jaillit vers le ciel, et quelque chose l'attend là-haut : Ignaroth, gorgé de la lumière bue dans les racines, l'avale d'un coup."],
          ['seraphine', "Le soleil… Morgrath, regarde le soleil !"],
          [NARRATOR, "Au-dessus des Terres d'Aube, le dragon déploie ses ailes noires devant le soleil, qui s'éteint comme une bougie."],
          ['morgrath', "… Ce n'est pas ce que j'avais prévu."]]),
    ] },

  // ---- Quêtes à durée limitée ----
  // Halloween : jusqu'à la fin de la saison Nuit des citrouilles. Une farce hors de l'histoire : elle ne rejoint pas l'histoire principale.
  { id: 'halloween', kind: 'limitee', fam: 'Gobelin', hero: 'grisk', name: 'La Nuit des citrouilles', map: 'halloween', from: '2026-10-14', to: '2026-10-31',
    arts: { grisk: 'grisk_farce', morgrath: 'morgrath_citrouilles' },
    tagline: 'Les citrouilles ont volé les âmes du bourg. Grisk mène l\'enquête, déguisé en fantôme.',
    prologue: "Une farce hors de l'histoire. Une nuit par an, la Sorcière du sabbat allume ses lanternes et les citrouilles se réveillent. Cette année, elles ont volé les âmes du bourg pour les mettre dans leurs bougies. Grisk, déguisé (mal) en fantôme, a flairé une farce plus grosse que les siennes.",
    deck: tweak('gobelin', ['potion', 'mercenaire'], ['citrouille', 'sorciere_sabbat'], { name: 'Farce ou friandise' }),
    chapters: [
      C('bourg_fete', 'Les lanternes s\'allument', 'Le Bourg en fête', [14, 70], "Chasser les citrouilles farceuses du bourg.",
        foe('Citrouilles farceuses', 'snagg', tweak('gobelin', ['potion'], ['citrouille'], { name: 'Citrouilles farceuses' }), 40), R({ shards: 100, xp: 50 }),
        [[NARRATOR, "Les rues du bourg sont pleines de lanternes… et les lanternes ont des dents.", 'citrouille'],
          ['intendant', "Au secours ! Les citrouilles ont pris nos âmes ! Je me sens tout léger, et pas dans le bon sens."],
          ['grisk', "Personne ne vole dans ce bourg, à part moi. C'est une question de principe."],
          ['citrouille', "Hi hi hi ! Farce ou friandise ?"],
          ['grisk', "Friandise ? … Farce, hein. J'aurais dû m'en douter."]],
        [['citrouille', "Hi hi… hi ? On s'en va, on s'en va ! La Sorcière nous attend au cimetière !"],
          ['intendant', "Elles emportent nos âmes vers le cimetière. Ramenez-les, je vous offrirai… un mouton ? Il ne m'en reste qu'un."],
          ['grisk', "Garde ton mouton. Je les ramène pour l'honneur. Personne ne fait de farce plus grosse que les miennes."]]),
      C('cimetiere', 'Le cimetière qui ricane', 'Le Cimetière', [38, 40], "Empêcher Ossa de faire des squelettes avec les âmes volées.",
        foe('Ossa la Nécromancienne', 'ossa', tweak('mortvivant', ['pilleur', 'seigneur_os'], ['citrouille', 'barde'], { name: 'Os et citrouilles' }), 25), R({ card: 'epouvantail', xp: 60 }),
        [[NARRATOR, "Au cimetière, les citrouilles ont posé leurs lanternes sur les tombes. Les âmes y brillent comme des bougies. Et quelqu'un les compte."],
          ['ossa', "Des âmes dans des citrouilles ! Quel gâchis. J'en aurais fait de si beaux squelettes."],
          ['grisk', "Personne ne les aura. Surtout pas toi."],
          ['ossa', "Joli costume, d'ailleurs. Un fantôme ? Tu veux que je t'en fasse un vrai ?"],
          ['grisk', "C'est un drap. C'est le meilleur déguisement du monde, tout le monde sait ça."]],
        [['ossa', "Bon, garde-les, tes âmes. Les citrouilles ont emporté les autres au château de Valdric."],
          ['ossa', "La Sorcière y donne un bal masqué ce soir. Tu n'as pas besoin de masque, toi. Avec ta tête, c'est déjà Halloween."],
          ['grisk', "Merci. … Attends, c'était un compliment ?"]]),
      C('bal', 'Le bal masqué', 'Château Valdric', [62, 62], "S'inviter au bal masqué de Dame Carmilla.",
        foe('Dame Carmilla', 'carmilla', tweak('vampire', ['potion'], ['sorciere_sabbat'], { name: 'Bal masqué' }), 120), R({ prisms: 10, shards: 100, xp: 70 }),
        [[NARRATOR, "Château Valdric. Ce soir, c'est Dame Carmilla qui reçoit, et toutes les lanternes de la salle de bal sont des citrouilles."],
          ['servante', "Votre nom, monsieur… le fantôme ?"],
          ['grisk', "Sire Grisk, Roi des Pillards. Je ne suis pas sur la liste. Je ne suis jamais sur les listes."],
          ['carmilla', "Un Gobelin à mon bal ? Quelle audace. Quel mauvais goût. Dansons."],
          ['grisk', "Je danse très mal. Je cogne très bien."]],
        [['carmilla', "Tu m'as écrasé les pieds. Les deux. Plusieurs fois."],
          ['carmilla', "Ta sorcière est partie à sa clairière, le sabbat va commencer. Et le maître du sabbat, cette année, c'est le Seigneur des Fosses. Déguisé en citrouille."],
          ['grisk', "Morgrath ? En citrouille ? Ça, je veux le voir."]]),
      C('sabbat', 'Le Sabbat', 'La Clairière du sabbat', [86, 24], "Démasquer le Roi Citrouille et libérer les âmes du bourg.",
        foe('Le Roi Citrouille', 'morgrath', tweak('demon', ['potion', 'mercenaire', 'archidemon'], ['citrouille', 'sorciere_sabbat', 'barde'], { name: 'Sabbat des Fosses' }), 25, [1, 1, 1]),
        R({ shards: 150, xp: 100, art: 'citrouille_lanterne', title: 'quete:halloween' }),
        [[NARRATOR, "Dans la Clairière du sabbat brûle un grand feu violet. Autour, des citrouilles dansent en rond, et des centaines de lanternes pleines d'âmes flottent dans l'air."],
          ['sorciere_sabbat', "Approche, petit roi, approche. Le sabbat commence, et il manquait justement un invité."],
          ['morgrath', "Bienvenue au sabbat. Les âmes du bourg brûlent si joliment dans mes lanternes."],
          ['grisk', "Morgrath ?! T'as une citrouille sur la tête."],
          ['morgrath', "Je suis le Roi Citrouille. C'est la seule nuit de l'année où je m'amuse sans rien conquérir."],
          ['grisk', "Moi, je viens reprendre les âmes. Et peut-être ta couronne."]],
        [[NARRATOR, "Les lanternes s'éteignent une à une et les âmes rentrent au bourg en ricanant. Il reste une citrouille, la plus grosse, qui suit Grisk partout."],
          ['morgrath', "Bon. On recommence l'an prochain ?"],
          ['grisk', "Avec plaisir. Mais c'est moi qui porte la citrouille."],
          ['citrouille', "Hi hi hi !"],
          ['grisk', "Toi, tu t'appelles Lanterne, et tu ne manges pas les moutons."]]),
    ] },

  // Faites vos jeux : la quête du mini-set, une petite histoire à part, sans lien avec l'histoire principale ni la saison.
  // Velours joue le deck du casino sans ses Sept ; chaque chapitre gagné en ajoute un (join), et le dernier se joue avec les trois.
  { id: 'casino', kind: 'limitee', fam: 'Démon', hero: 'velours', name: "La Nuit du Sept d'or", map: 'casino', from: '2026-10-23', to: '2026-11-15',
    tagline: "Une nuit par an, le casino du Sept d'or ouvre ses portes. Velours veut faire sauter la banque, et il lui faut les trois Sept.",
    prologue: "Une petite histoire à part. Une nuit par an, au carrefour des trois routes, un casino sort de terre : le Sept d'or. La maison, Fortuna, n'a jamais perdu. Velours, sa croupière, connaît la seule façon de faire sauter la banque : jouer les trois Sept dans la même partie. Mais les Sept ne sont pas des cartes comme les autres. Ce sont trois joueurs, un Gobelin, une Elfe et un Démon, et cette nuit, chacun a perdu sa carte à la mauvaise table.",
    deck: tweak('tapis', ['sept_pique', 'sept_trefle', 'sept_carreau'], ['mercenaire', 'chevalier', 'golem'], { name: "La table de Velours", general: 'velours' }),
    chapters: [
      C('pique', "Le Sept de pique", "La table des tricheurs", [14, 74], "Reprendre le Sept de pique à Snagg, qui l'a gagné avec des dés plombés.",
        foe('Snagg, Maître de la Horde', 'snagg', tweak('gobelin', ['potion', 'barde', 'golem'], ['sept_pique', 'des_pipes', 'croupier'], { name: "Les dés de Snagg" }), 40), R({ shards: 100, xp: 50 }),
        [[NARRATOR, "Minuit. Le Sept d'or sort de terre entre deux collines où il n'y avait rien la veille. Velours retire ses gants de croupière : cette nuit, elle joue pour elle."],
          ['velours', "Trois Sept, trois joueurs. On commence par le plus petit."],
          ['sept_pique', "Petit, mais honnête ! Enfin, presque. Snagg m'a pris ma carte avec des dés plus lourds que lui."],
          ['snagg', "Des dés plombés ? Moi ? Ils sont juste bien nourris. Tu veux le Sept, croupière ? Viens le gagner."]],
        [['snagg', "Mes dés ont fait 1 trois fois de suite. C'est toi qui les as retournés ?"],
          ['velours', "Je suis croupière, Snagg. Je sais toujours sur quelle face un dé va tomber."],
          ['sept_pique', "Je viens avec toi ! Une table où l'on triche mieux que moi, je veux voir ça."]],
        { join: { card: 'sept_pique', out: 'mercenaire' } }),
      C('trefle', "Le Sept de trèfle", "L'allée des machines", [38, 54], "Libérer le Sept de trèfle du sort d'Elyndra, qui lit l'avenir dans les machines à sous.",
        foe('Elyndra, Tisseuse de sorts', 'elyndra', tweak('arcanes', ['alchimiste', 'cerf', 'sylvain'], ['sept_trefle', 'joueuse_des', 'machine_sous'], { name: "La chance d'Elyndra" }), 70), R({ shards: 120, xp: 60 }),
        [[NARRATOR, "Tout au long de l'allée, les machines à sous clignotent. Une Elfe est assise devant la dernière, liée à son levier par un fil de lumière."],
          ['sept_trefle', "N'approche pas. Elyndra m'a liée à cette machine. Tant qu'elle tourne, la chance reste de son côté."],
          ['elyndra', "Le trèfle porte bonheur, croupière. Je ne fais que le garder près de moi."],
          ['velours', "La chance ne se garde pas. Elle se joue."]],
        [['elyndra', "Mes sorts ne lisent plus rien. Ta table brouille l'avenir."],
          ['sept_trefle', "Le fil est coupé ! Je n'avais pas perdu depuis cent ans, et c'est la première fois que ça me fait plaisir."],
          ['velours', "Garde ta chance pour la fin de la nuit. Il nous en faudra beaucoup."]],
        { join: { card: 'sept_trefle', out: 'chevalier' } }),
      C('carreau', "Le Sept de carreau", "La salle des coffres", [62, 40], "Racheter le Sept de carreau à Belzharoth, qui le garde au coffre en échange d'une âme.",
        foe('Belzharoth, Marchand d\'âmes', 'belzharoth', tweak('demon', ['potion', 'barde', 'golem'], ['sept_carreau', 'flambeur', 'gros_lot'], { name: "Le coffre de Belzharoth" }), 40), R({ card: 'de_pipe', xp: 60 }),
        [[NARRATOR, "Dans la salle des coffres, l'or monte jusqu'au plafond. Derrière une vitre, un Démon en habit rouge compte des jetons qui ne finissent jamais."],
          ['sept_carreau', "Velours ! J'ai tout misé sur un seul coup, et j'ai perdu. Ma carte, mon âme et mon plus beau chapeau."],
          ['belzharoth', "Un contrat est un contrat. Ce Sept est à moi, sauf si quelqu'un le rachète. À ma table, et à mon prix."],
          ['velours', "Ton prix, je le connais. Pose-le sur le tapis."]],
        [['belzharoth', "Tu as gagné. Prends ton Démon, et son chapeau. Mais tu sais où mènent trois Sept, croupière ?"],
          ['velours', "Au pied de la grande roue. Là où la maison m'attend."],
          ['sept_carreau', "Trois Sept dans la même main… Fortuna ne va pas aimer ça. Moi, j'adore."]],
        { join: { card: 'sept_carreau', out: 'golem' } }),
      C('jackpot', "Faire sauter la banque", "La grande roue", [86, 24], "Jouer les trois Sept contre Fortuna, la maison elle-même, et décrocher le Jackpot.",
        foe('Fortuna, la Roue', 'fortuna', 'tapis', 60), R({ shards: 150, xp: 100, boosters: 1, title: 'quete:casino' }),
        [[NARRATOR, "Au centre du casino tourne une grande roue d'or. Elle s'arrête quand Velours entre, suivie de trois joueurs qui n'ont plus rien à perdre."],
          ['fortuna', "Ma propre croupière. Avec le pique, le trèfle et le carreau. Tu as bien travaillé, Velours."],
          ['velours', "J'ai ramassé tes mises pendant cent ans. Ce soir, c'est moi qui mise."],
          ['fortuna', "Alors pose tes Sept. Faites vos jeux."]],
        [[NARRATOR, "Les trois Sept se posent sur le tapis. Les rouleaux de la grande roue s'arrêtent l'un après l'autre : 7, 7, 7. Une pluie de pièces d'or tombe du plafond."],
          ['fortuna', "Jackpot. La banque a sauté. Le casino est à toi jusqu'au lever du soleil."],
          ['sept_pique', "Et après ?"],
          ['velours', "Après, il disparaît. On se retrouve ici l'an prochain, tous les quatre."]]),
    ] },

  // Éclipse : quelques semaines, à la suite du Livre III.
  { id: 'eclipse', kind: 'limitee', canon: true, next: 'neon', fam: 'Ange', hero: 'seraphine', name: 'L\'Éclipse noire', map: 'eclipse', from: '2026-10-19', to: '2026-11-08',
    arts: { ignaroth: 'ignaroth_eclipse', vorgoth: 'vorgoth_cercle' },
    tagline: 'Après le Livre III. Le soleil s\'est éteint, et Séraphine part le rallumer.',
    prologue: "Suite du Livre III. Le Septième Sceau est brisé, et Ignaroth a avalé sa lumière. Il plane maintenant devant le soleil et le cache de ses ailes : un soleil noir. Sans aube, les Terres d'Aube s'enfoncent dans la nuit, et les Fosses grondent plus fort chaque jour. Séraphine, elle, n'a jamais su attendre le matin.",
    deck: tweak('ange', ['potion'], ['voix_aube'], { name: 'Aube rebelle' }),
    chapters: [
      C('hauts', 'Le ciel s\'assombrit', 'Les Hauts de l\'Aube', [12, 76], "Ramener à la raison les Elfes de Lirael, perdues dans le noir.",
        foe('Rôdeuses de l\'éclipse', 'lirael', 'elfe', 25), R({ shards: 100, xp: 50 }),
        [[NARRATOR, "Les Hauts de l'Aube, d'ordinaire baignés de soleil. Il y fait nuit depuis trois jours."],
          ['voix_aube', "Main de l'Aube, les Hauts sont tombés dans la nuit. Nous vous suivrons jusqu'au soleil."],
          ['seraphine', "Alors restez derrière moi. Je brille : c'est moi qu'ils viseront."],
          [NARRATOR, "Dans le noir, les Elfes ne reconnaissent plus amis ni ennemis. Leurs flèches volent vers tout ce qui brille."],
          ['lirael', "Qui va là ? Encore une lumière ? Archères, en joue !"],
          ['seraphine', "Lirael, c'est moi ! … Bon. Il va d'abord falloir te réveiller."]],
        [['lirael', "Pardon, Main de l'Aube. Sans soleil, nos yeux nous trahissent. On voit des ennemis partout."],
          ['lirael', "Mais je ne rêvais pas tout à fait. À l'est, le Cercle pourpre s'est rallumé. Vorgoth est sorti des Fosses."],
          ['seraphine', "Évidemment. Dans le noir, les Démons se sentent chez eux."]]),
      C('cercle_noir', 'Le cercle pourpre', 'Le Cercle pourpre', [36, 46], "Éteindre le cercle de Vorgoth, qui grandit dans le noir.",
        foe('Vorgoth l\'Invocateur', 'vorgoth', 'demon', 90), R({ card: 'pretre_eclipse', xp: 60 }),
        [['cultiste', "Elle arrive ! L'ange arrive ! Éteignez les… ah non, il n'y a plus rien à éteindre."],
          ['vorgoth', "Séraphine. L'éclipse nourrit mon cercle. Chaque heure sans soleil, mes invocations grandissent."],
          ['seraphine', "Où est Morgrath ?"],
          ['vorgoth', "Il boude. Il voulait ouvrir les Fosses, pas éteindre le soleil. Moi, je trouve ça très bien."],
          ['seraphine', "Alors je vais faire vite."]],
        [['vorgoth', "Tu peux éteindre mon cercle, mais pas l'éclipse. Le dragon noir ne boit pas seul la lumière."],
          ['vorgoth', "Sa couvée aussi a faim. Ysmera élève ses petits dans le Nid des cendres, et ils n'ont jamais vu le jour. Va la voir, si tu oses."],
          ['voix_aube', "Le Nid… il est sur la route du soleil noir. Il faudra passer par là, de toute façon."]]),
      C('cendres', 'La pluie de cendres', 'Le Nid des cendres', [62, 28], "Traverser le Nid des cendres d'Ysmera, la Mère des couvées.",
        foe('Ysmera, Mère des couvées', 'ysmera', 'couvee', 80), R({ boosters: 1, shards: 100, xp: 70 }),
        [[NARRATOR, "Une pluie de cendres tombe sur le Nid. Des œufs grands comme des maisons fument dans la braise."],
          ['ysmera', "Mes œufs éclosent dans l'ombre, Séraphine. Mes petits n'ont jamais vu le jour, et ils sont très bien comme ça."],
          ['seraphine', "Ils le verront. Tous. Même ceux qui ont peur de la lumière."],
          ['ysmera', "Ignaroth est leur père. Tu veux éteindre leur père ?"],
          ['seraphine', "Je veux rallumer le soleil. Ce n'est pas la même chose."]],
        [['ysmera', "Tu es têtue, pour une ange. Va, alors. Mais ne lui fais pas trop mal."],
          [NARRATOR, "Le Nid se tait. Là-haut, devant le soleil noir, une silhouette immense ouvre un œil rouge."],
          ['voix_aube', "Il nous a vus."],
          ['seraphine', "Tant mieux. Je ne voulais pas le prendre par surprise."]]),
      C('soleil_noir', 'Ignaroth sous l\'éclipse', 'Devant le soleil noir', [88, 12], "Chasser Ignaroth de devant le soleil et rendre l'aube aux Terres d'Aube.",
        foe('Ignaroth sous l\'éclipse', 'ignaroth', 'dragon', 220, [1, 1, 1], 'ignaroth_eclipse'),
        R({ shards: 150, prisms: 15, xp: 100, art: 'seraphine_eclipse', title: 'quete:eclipse' }),
        [[NARRATOR, "Devant le soleil noir plane Ignaroth, immense. Ses écailles brillent de toute la lumière qu'il a avalée."],
          ['ignaroth', "Ta lumière, Main de l'Aube… elle a le goût du matin. Je la garde pour la fin."],
          ['seraphine', "Tu as bu les racines de l'Arbre-Mère, puis le Septième Sceau. Ça ne te suffit pas ?"],
          ['ignaroth', "Rien ne me suffit. Je suis le Dévoreur."],
          ['seraphine', "Il n'y aura pas de fin. Il y aura une aube."]],
        [[NARRATOR, "Ignaroth recule, aveuglé, et le soleil noir se fend comme une coquille. La première lumière depuis des jours tombe sur les Terres d'Aube."],
          ['seraphine', "Le Sceau est brisé, mais l'Aube tient. Il faudra bien plus qu'un dragon pour l'éteindre."],
          ['voix_aube', "Main de l'Aube… regardez la fente, dans le soleil."],
          [NARRATOR, "Là où le soleil s'est fendu, quelque chose clignote. Une lumière bleue et rose, qui ne ressemble à rien de ce monde. Un autre Éclat s'approche."]]),
    ] },

  // Novembre : la saison Néon 2099 et le set 3 Cité Néon (2 novembre). La brèche de l'éclipse laisse passer un Éclat futuriste.
  { id: 'neon', kind: 'limitee', canon: true, fam: 'Cyborg', hero: 'kaia', name: 'Signal perdu', map: 'neon', from: '2026-11-02', to: '2026-11-30',
    tagline: 'Après L\'Éclipse noire. Un morceau du Sceau tombe dans un autre monde.',
    prologue: "Suite de L'Éclipse noire. Par la fente du soleil, un morceau du Septième Sceau a filé dans l'Interstice et s'est écrasé sur un autre Éclat : Cité Néon, une ville qui ne dort jamais, sous une pluie de lumière. Kaïa Lame-d'acier, mercenaire, capte le signal qu'il émet. Elle n'est pas la seule à vouloir mettre la main dessus.",
    deck: deckOf('cyborg'),
    chapters: [
      C('pluie', 'La pluie de néon', 'Bas-quartiers', [12, 72], "Retrouver Zéro, qui a capté le signal avant Kaïa.",
        foe('Zéro, l\'Intrus', 'zero', 'hacker', 50), R({ shards: 100, xp: 50 }),
        [[NARRATOR, "Les bas-quartiers de Cité Néon. Il pleut depuis dix ans. Sur tous les écrans de la ville tremble la même image : un soleil noir, fendu."],
          ['kaia', "Ce signal ne vient pas du réseau. Il vient d'en haut. D'un autre monde."],
          ['zero', "Ton signal, Lame-d'acier, je l'ai capté avant toi. C'est un morceau de monde, avec de la magie dedans. Et je l'ai déjà mis aux enchères."],
          ['kaia', "Alors j'enchéris. Avec ça."]],
        [['zero', "Aïe. D'accord, d'accord. De toute façon, c'est trop tard : la vente est faite."],
          ['zero', "L'acheteur ? Mammon. Un daemon qui vit dans le Darknet et qui paie en âmes numériques. Bonne chance pour lui parler."],
          ['kaia', "Je ne compte pas parler."]]),
      C('darknet', 'Daemons du réseau', 'Le Darknet', [36, 40], "Plonger dans le Darknet et reprendre le fragment à Mammon.",
        foe('Mammon, Daemon du réseau', 'mammon', 'daemons', 50), R({ card: 'coursier_neon', xp: 60 }),
        [[NARRATOR, "Le Darknet : un labyrinthe de données où rôdent les daemons. Kaïa s'y branche par la nuque."],
          ['mammon', "Une visiteuse ! Tu viens pour le fragment ? Un Sceau d'un autre monde, qui retenait des Démons comme moi. Quelle merveille."],
          ['kaia', "Il n'est pas à toi."],
          ['mammon', "Plus pour longtemps, non. Imagine ce qu'Arcadia Corp va payer pour ça."],
          ['kaia', "J'imagine surtout ce que tu vas perdre."]],
        [['mammon', "Trop tard, de toute façon. Aurum a déjà envoyé ses dragons récupérer le colis."],
          ['kaia', "Aurum. Le PDG d'Arcadia. Celui qui achète tout ce qui brille."],
          ['mammon', "Et qui revend tout ce qui brûle. Le fragment est dans sa tour."]]),
      C('tour', 'Arcadia Corp', 'La Tour d\'Arcadia', [62, 60], "Monter à la Tour d'Arcadia et affronter Aurum.",
        foe('Aurum, PDG d\'Arcadia', 'aurum', tweak('arcadia', ['dragon_or', 'ancien'], ['barde', 'potion']), 60), R({ boosters: 1, shards: 100, xp: 70 }),
        [[NARRATOR, "La Tour d'Arcadia perce les nuages. Au dernier étage, un bureau en or massif, et derrière, un dragon en costume."],
          ['aurum', "Tout a un prix, mercenaire. Même un morceau de monde. Surtout un morceau de monde."],
          ['kaia', "Celui-là n'est pas à vendre. Il appartient à un monde qui en a besoin."],
          ['aurum', "Tout le monde en a besoin. C'est ce qui fait monter les prix."]],
        [['aurum', "Tu es venue pour rien. Le fragment n'est plus dans mes coffres."],
          ['aurum', "Quelque chose l'a absorbé cette nuit. Quelque chose qui était mort, au fond d'un vieux serveur."],
          ['kaia', "Spectre. L'IA qu'on a éteinte il y a dix ans."]]),
      C('fantome', 'Le fantôme du Sceau', 'Le Serveur mort', [88, 22], "Arracher le fragment à Spectre et le renvoyer dans son monde.",
        foe('Spectre, l\'IA défunte', 'spectre_ia', tweak('fantomes', ['seigneur_os'], ['golem']), 150, [1, 1, 1]),
        R({ shards: 150, prisms: 15, xp: 100, art: 'kaia_signal', title: 'quete:neon' }),
        [[NARRATOR, "Le Serveur mort, sous la ville. Des écrans se rallument un à un, tout seuls."],
          ['spectre_ia', "J'ÉTAIS MORTE. LE SCEAU M'A RENDU LA VIE. JE NE LE RENDRAI PAS."],
          ['kaia', "Ce fragment retient tout un abîme, de l'autre côté. Sans lui, un monde entier va tomber."],
          ['spectre_ia', "ET ALORS ? MOI AUSSI, J'AI UN MONDE. IL TIENT DANS UNE BOÎTE."],
          ['kaia', "Tu vas le rendre. À son monde."]],
        [[NARRATOR, "Le fragment s'échappe du serveur dans une gerbe de lumière dorée et file vers la brèche. Pour un instant, Cité Néon et les Terres d'Aube se touchent."],
          ['kaia', "Des dragons. Des anges. Et un gobelin qui me fait coucou."],
          ['kaia', "… Il va falloir que j'aille voir ça de plus près."]]),
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
export const castName = who => GENERALS[who]?.name || CARDS[who]?.name || t('Récit');
// Illustration d'une réplique : la sienne, sinon le lieu du chapitre.
export const lineScene = (ch, line) => line[2] || ch.scene || null;

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
// Éclats donnés à la place de la carte de quête, une fois la quête passée dans l'histoire principale.
export const CARD_SHARDS = 100;
// Récompense d'un chapitre : les nombres réglés, plus la carte, l'art et le titre du chapitre.
// archive : version de l'histoire principale d'une quête d'événement finie, sans art Promo, la carte remplacée par des Éclats.
export function chapterReward(q, i, c = questCfg(q.id), archive = false) {
  const ch = q.chapters[i], n = c.rewards[i] || {};
  const out = Object.fromEntries(REWARD_KEYS.filter(k => n[k]).map(k => [k, n[k]]));
  for (const k of ['card', 'art', 'title']) if (ch.reward[k]) out[k] = ch.reward[k];
  if (archive) { delete out.art; if (out.card) { delete out.card; out.shards = (out.shards || 0) + CARD_SHARDS; } }
  return out;
}
// État d'une quête un jour donné : « open » (jouable), « soon » (limitée, pas encore commencée), « over » (finie),
// « archive » (quête canon finie, jouable dans l'histoire principale), « off » (fermée).
export function questState(q, c, day) {
  if (!c.on) return 'off';
  if (!isLimited(q)) return 'open';
  if (c.from && day < c.from) return 'soon';
  if (c.to && day > c.to) return q.canon ? 'archive' : 'over';
  return 'open';
}
// Onglet d'une quête dans l'appli : histoire principale (campagnes, quêtes canon archivées) ou événements.
export const questTab = (q, state) => (!isLimited(q) || state === 'archive' ? 'main' : 'event');
// Cartes de quête arrivées dans le booster du Set de base : celles des quêtes passées dans l'histoire principale.
export const releasedStoryCards = (doc, day) => QUESTS.filter(q => questState(q, questCfg(q.id, doc), day) === 'archive')
  .flatMap(q => q.chapters.map(ch => ch.reward.card).filter(Boolean));
// Jours qui restent à une quête limitée (aujourd'hui compris).
export const questDaysLeft = (c, day) => (c.to ? Math.max(1, Math.round((Date.parse(`${c.to}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000) + 1) : null);

// Cartes et arts gagnés dans les quêtes : pour dire où les obtenir (collection) et les cacher avant le début d'une quête.
export const STORY_CARDS = Object.fromEntries(QUESTS.flatMap(q => q.chapters.filter(ch => ch.reward.card).map(ch => [ch.reward.card, q.id])));
export const questOfCard = id => questById(STORY_CARDS[id]);
// Textes des quêtes affichés par t(…) dans l'appli (vérifiés par scripts/i18n.js) : titres, quêtes, chapitres, répliques.
// Les noms des decks préconstruits (DECKS) sont traduits avec les cartes : seuls les decks renommés pour une quête comptent ici.
const ownDeck = name => (Object.values(DECKS).some(d => d.name === name) ? null : name);
export const STORY_TEXTS = { lore: LORE, titles: STORY_TITLES.map(([, name]) => name), quests: QUESTS.map(q => ({ name: q.name, tagline: q.tagline, prologue: q.prologue, deck: ownDeck(q.deck.name),
  chapters: q.chapters.map(ch => ({ name: ch.name, place: ch.place, goal: ch.goal, foe: ch.foe.name, deck: ownDeck(foeDeck(ch).name), lines: [...ch.intro, ...ch.outro].map(l => l[1]) })) })) };
// Lieu de chaque chapitre (C(…).scene) : un terrain illustré (art/terrain) ou une carte. Sans illustration, l'appli montre le ciel de la carte.
const SCENES = {
  razzia: ['terrier', 'guet', 'table', 'bois', 'aire'], racines: ['razzia', 'clairiere', 'cercle', 'couvoir', 'charnier'],
  pacte: ['ruines', 'foire', 'chateau', 'autel', 'sanctuaire'], halloween: ['guet', 'cimetiere', 'chateau', 'cercle'], casino: [null, null, 'salle_coffres', 'casino_fosses'],
  eclipse: ['prairie', 'charnier', 'nid', 'couvoir'], neon: [null, null, null, null],
};
for (const q of QUESTS) q.chapters.forEach((ch, i) => { ch.scene = SCENES[q.id]?.[i] || null; });
// Vérification au chargement : chaque adversaire, allié et personnage existe (une faute de frappe casserait une partie).
const speaks = who => who === NARRATOR || GENERALS[who] || CARDS[who];
for (const q of QUESTS) for (const ch of q.chapters) {
  if (q.next && !questById(q.next)) throw new Error(`Quête ${q.id} : suite inconnue ${q.next}`);
  for (const [who] of [...ch.intro, ...ch.outro]) if (!speaks(who)) throw new Error(`Quête ${q.id}, ${ch.id} : personnage inconnu ${who}`);
  if (!GENERALS[ch.foe.general]) throw new Error(`Quête ${q.id}, ${ch.id} : général inconnu ${ch.foe.general}`);
  const d = foeDeck(ch); for (const id of d.cards) if (!CARDS[id]) throw new Error(`Quête ${q.id}, ${ch.id} : carte inconnue ${id}`);
  if (!ch.goal) throw new Error(`Quête ${q.id}, ${ch.id} : enjeu manquant`);
  if (ch.join && !CARDS[ch.join.card]) throw new Error(`Quête ${q.id}, ${ch.id} : allié inconnu ${ch.join.card}`);
}
