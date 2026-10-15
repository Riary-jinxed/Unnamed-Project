// Tutoriel : des leçons, chacune une partie contre l'IA jouée dans la page, avec des decks, des pioches et des terrains fixés,
// et des étapes de guidage affichées au-dessus de la main (bulle du guide, et sur PixiJS l'écran assombri autour de l'élément
// à toucher, avec une main qui montre le geste : stage-coach.js). Pas de statistiques ; chaque leçon finie pour la première fois
// rapporte des Éclats, et la dernière un booster offert (main.js, POST /api/tuto).
import { CARDS, newGame, startTurn, runTurn, viewFor } from '@jeu/engine';
import { t, tp } from '@jeu/engine/i18n';

// Sélecteurs partagés par les étapes.
const card = id => `[data-hand][data-id="${id}"]`;
const zone = z => `.board > .zone[data-z="${z}"]`;
const ZONES = '.board > .zone';
const GO = '[data-act="go"]';

// ---- Initiation : premier lancement guidé ----
// Une partie de 4 tours, sans terrain ni général, avec une seule idée par tour : poser une carte, gagner 2 zones,
// dépenser ses sceaux, frapper fort au dernier tour. L'adversaire joue peu, pour que le joueur gagne s'il suit le guide.
const INITIATION = {
  title: t('Initiation'), turns: 4, noGeneral: true, noTerrain: true,
  me: { general: 'erudit', hand: 3, order: ['cherubin', 'mercenaire', 'chevalier', 'golem', 'eclaireuse', 'barde', 'archere', 'gardien'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'barde', 'chevalier', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 1]], 3: [['barde', 2]], 4: [['chevalier', 0]] } },
  steps: [
    { info: true, hl: '.board', text: t('Bienvenue ! Je suis Séraphine, je vais vous guider. Pour gagner, remportez **2 zones sur 3** à la fin du dernier tour.') },
    { hl: t => [card('cherubin'), ZONES], drag: () => [card('cherubin'), zone(1)], done: t => t.pend('cherubin'),
      text: t('Faites glisser le Chérubin sur une zone. Son coût est en haut à gauche, sa puissance en haut à droite.') },
    { go: true, text: t('Votre carte reste cachée jusqu\'à la révélation. Validez le tour.') },

    { info: true, turn: 2, hl: '.board .score', text: t('Les chiffres de chaque zone : la puissance de l\'adversaire, puis la vôtre. Le plus fort gagne la zone.') },
    { hl: t => [card('mercenaire'), ...t.zonesWithout('cherubin').map(zone)], drag: t => [card('mercenaire'), zone(t.zonesWithout('cherubin')[0])],
      done: t => t.apart('mercenaire', 'cherubin'),
      text: u => (u.pend('mercenaire') ? t('Il vous faut 2 zones : touchez le Mercenaire pour le reprendre, puis posez-le ailleurs.')
        : t('Chaque tour donne un sceau de plus. Posez le Mercenaire dans une **autre zone** que le Chérubin.')) },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: () => ['#hand', '.dock .tseals'], done: t => t.sealsLeft() === 0,
      text: u => (u.ui.pending.length ? tp(u.sealsLeft(), 'Il vous reste {n} sceau : posez une autre carte.', 'Il vous reste {n} sceaux : posez une autre carte.')
        : t('3 sceaux ce tour : posez **une ou plusieurs cartes**, jusqu\'à ne plus avoir de sceau.')) },
    { go: true, text: t('Tous vos sceaux sont dépensés. Validez le tour.') },

    { turn: 4, hl: t => [card('golem'), zone(t.weakest())], drag: t => [card('golem'), zone(t.weakest())], done: t => t.pend('golem'),
      text: t('Dernier tour ! Le Golem frappe fort : posez-le dans la zone **la plus disputée**.') },
    { go: true, text: t('Validez : celui qui gagne 2 zones sur 3 remporte la partie.') },
  ],
  end: t('Initiation terminée : vous savez jouer ! Les leçons, dans « Apprendre » sur l\'accueil, vous montreront les effets, les déplacements et les généraux.'),
};

// ---- Effets et sorts : Révélation, jetons, sorts, et lire une carte en grand ----
const EFFECTS = {
  title: t('Effets et sorts'), turns: 4, noGeneral: true, noTerrain: true,
  me: { general: 'erudit', hand: 3, order: ['eclaireur', 'recruteur', 'mercenaire', 'potion', 'golem', 'chevalier', 'barde', 'gardien'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 2]], 3: [['chevalier', 0]], 4: [['barde', 1]] } },
  steps: [
    { hl: card('eclaireur'), tap: () => card('eclaireur'), taps: 2, done: t => t.ui.sheet === 'zoom' || t.pend('eclaireur'),
      text: t('Beaucoup de cartes ont un **effet**, écrit sous leur nom. Touchez **deux fois** l\'Éclaireur pour le lire en grand.') },
    { hl: () => [card('eclaireur'), zone(1)], drag: () => [card('eclaireur'), zone(1)], done: t => t.pend('eclaireur'),
      text: t('Posez l\'Éclaireur. **Révélation** : son effet se déclenche quand la carte est retournée.') },
    { go: true, text: t('Validez le tour, et regardez ce qui se passe à la révélation.') },

    { info: true, turn: 2, hl: '.mc[data-id="horde"]', text: t('L\'Éclaireur a créé une **Horde** : c\'est un jeton, une créature créée par un effet.') },
    { hl: t => [card('recruteur'), zone(t.zoneOf('horde'))], drag: t => [card('recruteur'), zone(t.zoneOf('horde'))], done: t => t.together('recruteur', 'horde'),
      text: u => (u.pend('recruteur') ? t('Reprenez le Recruteur et posez-le dans la zone de la Horde.') : t('Posez le Recruteur dans la zone de la Horde : son effet la renforcera.')) },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: t => [card('mercenaire'), ...t.zonesWithout('horde').map(zone)], drag: t => [card('mercenaire'), zone(t.zonesWithout('horde')[1])],
      done: t => t.pend('mercenaire') && t.zoneOf('mercenaire') !== t.zoneOf('horde'),
      text: u => (u.pend('mercenaire') ? t('Gardez la Horde seule : posez le Mercenaire dans une autre zone.') : t('Posez le Mercenaire dans une autre zone que la Horde.')) },
    { hl: t => [card('potion'), zone(t.zoneOf('mercenaire'))], drag: t => [card('potion'), zone(t.zoneOf('mercenaire'))], done: t => t.together('potion', 'mercenaire'),
      text: t('Posez la **Potion de force** avec le Mercenaire. Un sort agit à la révélation, puis disparaît.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 4, hl: t => [card('golem'), zone(t.weakest())], drag: t => [card('golem'), zone(t.weakest())], done: t => t.pend('golem'),
      text: t('Dernier tour ! Posez le Golem dans la zone **la plus disputée**.') },
    { go: true, text: t('Validez le dernier tour.') },
  ],
  end: t('Leçon finie : vous savez lire les effets, et les sorts et les jetons n\'ont plus de secret pour vous.'),
};

// ---- Terrains et déplacements ----
const TERRAINS_LESSON = {
  title: t('Terrains et déplacements'), turns: 4, noGeneral: true,
  me: { general: 'erudit', hand: 3, order: ['eclaireuse', 'feu_follet', 'mercenaire', 'archere', 'chevalier', 'cerf', 'golem', 'barde'],
    terrains: [{ t: 'sanctuaire', z: 1, turn: 1 }, { t: 'champ', z: 0, turn: 2 }, { t: 'ruines', z: 2, turn: 3 }] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'],
    terrains: [{ t: 'sanctuaire', z: 2, turn: 2 }],
    plays: { 1: [['eclaireuse', 1]], 2: [['mercenaire', 0]], 3: [['chevalier', 2]], 4: [['barde', 1]] } },
  steps: [
    { info: true, hl: '.terrain.set.me', text: t('Aux tours 1 à 3, chaque camp révèle un **terrain**. Le vôtre, le Sanctuaire, donne +2 à votre zone Centre.') },
    { hl: () => [card('eclaireuse'), zone(0)], drag: () => [card('eclaireuse'), zone(0)], done: t => t.pend('eclaireuse'),
      text: t('Posez l\'Éclaireuse à Gauche. Elle est **Déplaçable** : une fois en jeu, elle pourra changer de zone.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 2, hl: t => ['.mc[data-mobile]', ...t.zonesWithout('eclaireuse').map(zone)], drag: t => ['.mc[data-mobile]', zone(t.zonesWithout('eclaireuse').includes(1) ? 1 : t.zonesWithout('eclaireuse')[0])],
      done: t => t.ui.moves.length > 0,
      text: u => (u.ui.moveSel !== null ? t('Touchez maintenant la zone où l\'envoyer.') : t('Faites glisser l\'Éclaireuse vers une autre zone : une créature ⇄ change de zone aussitôt.')) },
    { hl: card('feu_follet'), drag: t => [card('feu_follet'), zone(t.zoneOf('eclaireuse') === 0 ? 2 : 0)], done: t => t.pend('feu_follet'),
      text: t('Posez le Feu follet. Il est Déplaçable lui aussi, et gagne +1 à chaque **Déplacement**.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: '.mc[data-id="feu_follet"]', drag: t => ['.mc[data-id="feu_follet"]', zone(t.zoneOf('feu_follet') === 1 ? 2 : 1)],
      done: t => t.ui.moves.some(m => t.ui.view.me.board.flat().find(c => c.uid === m.uid)?.id === 'feu_follet'),
      text: t('Déplacez le Feu follet : il gagnera +1.') },
    { hl: card('archere'), done: t => t.pend('archere'), text: t('Posez l\'Archère des cimes où vous voulez : elle aussi est Déplaçable.') },
    { go: true, text: t('Validez le tour.') },

    { free: true, turn: 4, text: t('Dernier tour ! Déplacez vos créatures ⇄ et posez vos cartes là où elles feront gagner une zone.') },
  ],
  end: t('Leçon finie : vous savez jouer avec les terrains et déplacer vos créatures.'),
};

// ---- Généraux : lire son général et l'activer ----
// Vorgoth détruit la créature la plus faible (le Diablotin, qui donne alors +2 à sa zone) et invoque à sa place le Golem,
// la première créature du deck à ce moment-là.
const GENERALS_LESSON = {
  title: t('Généraux'), turns: 4, noTerrain: true,
  me: { general: 'vorgoth', hand: 3, order: ['diablotin', 'mercenaire', 'chevalier', 'cherubin', 'barde', 'eclaireuse', 'golem', 'archere', 'gardien'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 1]], 2: [['mercenaire', 0]], 3: [['chevalier', 2]], 4: [['barde', 1]] } },
  steps: [
    { info: true, hl: '.pbar.me .gencard', text: t('Voici votre **général**, Vorgoth. Chaque deck en a un, avec son propre effet. Touchez-le deux fois pour le lire.') },
    { hl: () => [card('diablotin'), zone(0)], drag: () => [card('diablotin'), zone(0)], done: t => t.pend('diablotin'),
      text: t('Posez le Diablotin à Gauche. Son effet : quand il est **détruit**, sa zone gagne +2.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 2, hl: () => [card('mercenaire'), zone(1)], drag: () => [card('mercenaire'), zone(1)], done: t => t.pend('mercenaire') && t.zoneOf('mercenaire') !== t.zoneOf('diablotin'),
      text: t('Posez le Mercenaire au Centre.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: () => ['.pbar.me .gencard', '[data-act="zgen"]'], tap: () => '.pbar.me .gencard', taps: 2, done: t => t.ui.genZone !== null,
      text: t('Vorgoth s\'active une fois par partie. Touchez-le **deux fois**, puis Activer : il détruira votre créature la plus faible et invoquera la première créature de votre deck.') },
    { hl: card('chevalier'), drag: () => [card('chevalier'), zone(2)], done: t => t.pend('chevalier'), text: t('Posez aussi le Chevalier, à Droite par exemple.') },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 4, hl: '.mc[data-id="golem"]', text: t('Vorgoth a détruit le Diablotin, qui a donné +2 à sa zone, et a invoqué le **Golem** à sa place.') },
    { free: true, text: t('Dernier tour : jouez vos cartes comme vous voulez, puis validez.') },
  ],
  end: t('Leçon finie : vous savez lire et activer un général. Chaque deck a le sien, à choisir dans l\'éditeur de deck.'),
};

// ---- Partie guidée : les règles en entier, sur 7 tours ----
const FULL = {
  title: t('Partie guidée'), turns: 7,
  // Joueur : cartes dans l'ordre de pioche (les premières forment la main de départ, Érudit compris).
  me: {
    general: 'erudit', hand: 4,
    order: ['cherubin', 'mercenaire', 'recruteur', 'potion', 'archere', 'golem', 'feu_follet', 'chevalier', 'barde', 'gardien', 'archange', 'messagere', 'heraut', 'juge', 'eclaireuse'],
    terrains: [{ t: 'sanctuaire', z: 1, turn: 1 }, { t: 'ruines', z: 2, turn: 2 }, { t: 'champ', z: 0, turn: 3 }],
  },
  // Adversaire : il joue toujours les mêmes cartes, dans les mêmes zones, pour que chaque leçon se passe comme prévu.
  foe: {
    general: 'cartographe', hand: 3,
    order: ['eclaireuse', 'mercenaire', 'chevalier', 'golem', 'barde', 'potion', 'archere', 'sylvain', 'cerf', 'garde_pont', 'titan', 'dominion'],
    terrains: [{ t: 'forteresse', z: 0, turn: 1 }, { t: 'sanctuaire', z: 2, turn: 2 }],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 2]], 3: [['chevalier', 1]], 4: [['golem', 0]], 5: [['archere', 2], ['barde', 1]], 6: [['sylvain', 1], ['potion', 1]], 7: [['cerf', 0], ['garde_pont', 2]] },
  },
  steps: [
    { info: true, hl: '.board', text: t('Bienvenue ! Une partie dure 7 tours, sur 3 zones : Gauche, Centre et Droite. Pour gagner, remportez au moins 2 zones sur 3 à la fin du tour 7.') },
    { info: true, hl: '.board .score', text: t('Dans chaque zone, l\'adversaire joue en haut et vous en bas. Les deux chiffres au milieu sont la puissance totale de chaque camp : le plus fort gagne la zone.') },
    { info: true, hl: '.terrain.set.me', text: t('Aux tours 1, 2 et 3, chacun révèle un terrain. Le vôtre, le Sanctuaire, donne +2 à votre zone Centre. Touchez deux fois un terrain pour lire son effet.') },
    { info: true, hl: '.dock .tseals', text: t('Chaque tour vous donne des sceaux pour poser des cartes : 1 au tour 1, 2 au tour 2, et ainsi de suite. Vos sceaux sont en bas de l\'écran.') },
    { hl: card('cherubin'), tap: () => card('cherubin'), done: t => t.sel('cherubin') || t.pend('cherubin'),
      text: t('Touchez le Chérubin dans votre main. Son coût, 1 sceau, est en haut à gauche ; sa puissance, 1, en haut à droite.') },
    { hl: () => ['[data-act="zplay"]', '.zone.target'], tap: () => zone(1), done: t => t.pend('cherubin'),
      text: u => (u.sel('cherubin') ? t('Choisissez la zone où le poser, le Centre par exemple.') : t('Touchez le Chérubin dans votre main, puis une zone.')) },
    { go: true,
      text: t('Votre carte est posée face cachée : l\'adversaire ne la verra qu\'à la révélation, comme vous ne voyez pas les siennes. Touchez Valider le tour.') },

    { info: true, turn: 2, hl: '.mc[data-id="cherubin"]',
      text: t('Votre Chérubin est passé à 2. « Grâce » est un mot-clé : en fin de tour, si vous avez dépensé tous vos sceaux, il gagne +1. Le Codex, sur l\'accueil, explique tous les mots-clés.') },
    { hl: card('mercenaire'), drag: t => [card('mercenaire'), zone(t.zonesWithout('cherubin')[0])], done: t => t.apart('mercenaire', 'cherubin'),
      text: u => (u.pend('mercenaire') ? t('Le Mercenaire est dans la même zone que le Chérubin. Touchez-le pour le reprendre en main, puis posez-le ailleurs.')
        : t('Tour 2 : vous avez pioché une carte et vous avez 2 sceaux. Posez le Mercenaire, de puissance 3, dans une autre zone que le Chérubin : il faut gagner 2 zones.')) },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: card('recruteur'), done: t => t.pend('recruteur'),
      text: t('Tour 3, 3 sceaux : vous pouvez poser plusieurs cartes tant qu\'il vous reste des sceaux. Posez le Recruteur. Son effet « Révélation » se déclenchera quand il sera révélé.') },
    { hl: card('potion'), drag: t => [card('potion'), zone(t.zoneOf('recruteur'))], done: t => t.together('potion', 'recruteur'),
      text: u => (u.pend('potion') ? t('Posez la Potion dans la même zone que le Recruteur : touchez-la pour la reprendre en main.')
        : t('Il vous reste 1 sceau : posez la Potion de force dans la zone du Recruteur. Un sort agit à la révélation, puis part à la défausse.')) },
    { go: true, text: t('Vous avez dépensé tous vos sceaux. Validez le tour.') },

    { info: true, turn: 4, hl: '.mc[data-id="horde"]',
      text: t('Le Recruteur a créé une Horde de puissance 2 : c\'est un jeton, une créature créée par un effet. La Potion a donné +2 à votre créature la plus forte de sa zone.') },
    { hl: () => [card('archere'), card('feu_follet')], done: t => t.pend('archere') && t.pend('feu_follet'),
      text: t('Tour 4. L\'Archère des cimes et le Feu follet sont « Déplaçables » : une fois en jeu, ils pourront changer de zone. Posez-les tous les deux.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 5, hl: '.mc[data-mobile]', done: t => t.ui.moves.length > 0,
      text: u => (u.ui.moveSel !== null ? t('Touchez maintenant la zone où l\'envoyer.')
        : t('Tour 5. Vos créatures marquées ⇄ peuvent changer de zone. Touchez-en une, puis une autre zone : elle y passe aussitôt et libère sa place pour une nouvelle carte.')) },
    { info: true, hl: '.pbar.me .gencard',
      text: t('Votre général est à droite de votre bandeau : touchez-le deux fois pour lire son effet. L\'Érudit vous a fait piocher une carte de plus en début de partie ; d\'autres s\'activent une fois par partie.') },
    { free: true, text: t('À vous de jouer : posez d\'autres cartes si vous voulez, puis validez. Le Journal raconte tout ce qui s\'est passé.') },
    { free: true, turn: 6, text: t('Plus que deux tours. Regardez où vous perdez et renforcez les zones que vous pouvez encore gagner.') },
    { free: true, turn: 7, text: t('Dernier tour : à la fin, celui qui gagne 2 zones sur 3 remporte la partie.') },
  ],
  end: t('Tutoriel terminé : vous connaissez les bases. Le codex, dans « Apprendre » sur l\'accueil, explique tous les autres mots-clés.'),
};

// ---- Tutoriel avancé : une mécanique de famille par leçon ----
// Même principe que les leçons de base : 4 tours, decks et pioches fixés, un adversaire qui joue toujours pareil.

// Sceaux : tout dépenser (Grâce) ou garder (Trésor, Magot), et Coût X. Le Trésor arrive à 5 au tour 4 :
// 1 sceau gardé au tour 2, puis Thésauriser (+2) et 2 sceaux gardés au tour 3. Le Dragon des cavernes coûte alors 3.
const SEALS_LESSON = {
  title: t('Sceaux et Trésor'), turns: 4, noGeneral: true, noTerrain: true,
  me: { general: 'erudit', hand: 3, order: ['cherubin', 'gardien_magot', 'mercenaire', 'thesauriser', 'cavernes', 'priere', 'golem', 'barde', 'chevalier'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 2]], 3: [['chevalier', 2]], 4: [['barde', 1]] } },
  steps: [
    { hl: () => [card('cherubin'), zone(1)], drag: () => [card('cherubin'), zone(1)], done: t => t.pend('cherubin'),
      text: t('Tout se joue avec vos **sceaux**. Le Chérubin a **Grâce** : si vous dépensez tous vos sceaux ce tour, il gagne +1 en fin de tour. Posez-le au Centre.') },
    { go: true, text: t('Votre unique sceau est dépensé. Validez le tour.') },

    { info: true, turn: 2, hl: '.mc[data-id="cherubin"]', text: t('La Grâce s\'est déclenchée : le Chérubin est passé à 2. Mais garder ses sceaux a aussi du bon…') },
    { hl: () => [card('gardien_magot'), zone(0)], drag: () => [card('gardien_magot'), zone(0)], done: t => t.pend('gardien_magot') && t.sealsLeft() >= 1,
      text: u => (u.pend('gardien_magot') ? t('Gardez votre dernier sceau : touchez l\'autre carte posée pour la reprendre en main.')
        : t('Posez le Gardien du magot à Gauche, et **gardez votre autre sceau**. Il crée un **Magot** : en fin de tour, le Magot gagne autant de puissance que vos sceaux non dépensés.')) },
    { go: true, text: t('Validez en gardant 1 sceau : il ira aussi dans votre **Trésor**.') },

    { info: true, turn: 3, hl: '.pbar.me .pstats', text: t('Le sceau gardé est dans votre **Trésor** (dans votre bandeau), et le Magot a gagné +1. Le Trésor ne se dépense pas : il renforce les Dragons.') },
    { hl: t => [card('thesauriser'), zone(t.zoneOf('magot'))], drag: t => [card('thesauriser'), zone(t.zoneOf('magot'))], done: t => t.pend('thesauriser') && t.sealsLeft() >= 2,
      text: u => (u.pend('thesauriser') ? t('Gardez 2 sceaux : touchez l\'autre carte posée pour la reprendre en main.')
        : t('Posez Thésauriser : votre Trésor gagne +2. **Gardez vos 2 autres sceaux** : ils iront au Trésor, et au Magot.')) },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 4, hl: card('cavernes'), text: t('Votre Trésor est à 5. Le Dragon des cavernes coûte 1 de moins par tranche de 3 de Trésor : il ne coûte plus que 3 au lieu de 4.') },
    { hl: t => [card('cavernes'), zone(t.weakest())], drag: t => [card('cavernes'), zone(t.weakest())], done: t => t.pend('cavernes'),
      text: t('Posez le Dragon des cavernes où vous voulez.') },
    { hl: t => [card('priere'), zone(t.zoneOf('cherubin'))], drag: t => [card('priere'), zone(t.zoneOf('cherubin'))], done: t => t.pend('priere'),
      text: t('La Prière a **Coût X** : elle prend tous vos sceaux restants, et X est ce nombre. Posez-la **en dernier**, avec le Chérubin : il gagnera +X+1, et sa Grâce se déclenchera.') },
    { go: true, text: t('Tous vos sceaux sont dépensés. Validez le dernier tour.') },
  ],
  end: t('Leçon finie : tout dépenser déclenche la Grâce, garder ses sceaux nourrit le Trésor et le Magot. À vous de choisir à chaque tour !'),
};

// Démons : la Chèvre sacrifiée rend un sceau au tour 3 ; le Marché des âmes détruit le Diablotin (sa zone +2, le Bourreau +2).
const SACRIFICE_LESSON = {
  title: t('Sacrifice et Destruction'), turns: 4, noGeneral: true, noTerrain: true,
  me: { general: 'erudit', hand: 3, order: ['cultiste', 'molosse', 'diablotin', 'bourreau', 'pacte', 'bete', 'golem', 'mercenaire', 'chevalier'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 1]], 3: [['chevalier', 2]], 4: [['barde', 2]] } },
  steps: [
    { hl: () => [card('cultiste'), zone(0)], drag: () => [card('cultiste'), zone(0)], done: t => t.pend('cultiste'),
      text: t('Les Démons jouent avec la destruction. Posez le Cultiste à Gauche : à sa révélation, il crée une **Chèvre**, un jeton de puissance -1.') },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 2, hl: '.mc[data-id="chevre"]', text: t('Une Chèvre de puissance -1 affaiblit votre zone… mais elle est faite pour être **sacrifiée**.') },
    { hl: t => [card('molosse'), zone(t.zoneOf('chevre'))], drag: t => [card('molosse'), zone(t.zoneOf('chevre'))], done: t => t.together('molosse', 'chevre'),
      text: u => (u.pend('molosse') ? t('Seul dans sa zone, le Molosse se détruirait lui-même : reprenez-le et posez-le avec la Chèvre.')
        : t('Le Molosse infernal a **Sacrifice** : à sa révélation, il détruit votre créature la plus faible de sa zone. Posez-le avec la Chèvre.')) },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 3, hl: '.dock .tseals', text: t('La Chèvre sacrifiée vous donne **+1 sceau** ce tour : vous en avez 4 au lieu de 3.') },
    { hl: () => [card('diablotin'), zone(1)], drag: () => [card('diablotin'), zone(1)], done: t => t.pend('diablotin'),
      text: t('Posez le Diablotin au Centre. **Destruction** : quand il est détruit, sa zone gagne +2.') },
    { hl: t => [card('bourreau'), zone(t.zoneOf('diablotin'))], drag: t => [card('bourreau'), zone(t.zoneOf('diablotin'))], done: t => t.together('bourreau', 'diablotin'),
      text: t('Ajoutez le Bourreau dans la même zone : il gagne +2 quand une autre de vos créatures y est détruite.') },
    { hl: t => [card('pacte'), zone(t.zoneOf('diablotin'))], drag: t => [card('pacte'), zone(t.zoneOf('diablotin'))], done: t => t.together('pacte', 'diablotin'),
      text: t('Le Marché des âmes détruit votre créature la plus faible de sa zone, puis vous fait piocher. Posez-le avec eux.') },
    { go: true, text: t('Vos cartes se révèlent dans l\'ordre où vous les avez posées : le Diablotin, le Bourreau, puis le sort. Validez le tour.') },

    { info: true, turn: 4, hl: '.mc[data-id="bourreau"]', text: t('Le Diablotin détruit a donné +2 à sa zone, et le Bourreau a gagné +2.') },
    { free: true, text: t('Dernier tour. La Bête des abysses a **Sacrifice 2** : elle détruit vos 2 créatures les plus faibles de sa zone. S\'il n\'y en a pas assez, c\'est elle qui est détruite ! Choisissez bien, puis validez.') },
  ],
  end: t('Leçon finie : sacrifier ses créatures faibles rend les Démons plus forts, et Destruction tire profit de chaque perte.'),
};

// Morts-vivants : la Goule défausse le Zombie, la Danse macabre le Chevalier de la mort, qui défausse le Squelette en se relevant,
// et le Fossoyeur le Spectre hurlant. Mordrek donne +1 à la zone la plus faible à chaque carte défaussée.
const RISE_LESSON = {
  title: t('Défausse et Relève'), turns: 4, noTerrain: true,
  me: { general: 'mordrek', hand: 3, order: ['goule', 'zombie', 'danse_macabre', 'squelette', 'chevalier_mort', 'fossoyeur', 'spectre', 'golem', 'mercenaire', 'chevalier', 'barde'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 2]], 2: [['mercenaire', 0]], 3: [['chevalier', 2]], 4: [['golem', 1]] } },
  steps: [
    { info: true, hl: '.pbar.me .gencard', text: t('Votre général, Mordrek, mène les Morts-vivants : chaque carte **défaussée** de votre main donne +1 à votre zone la plus faible.') },
    { hl: () => [card('goule'), zone(1)], drag: () => [card('goule'), zone(1)], done: t => t.pend('goule'),
      text: t('Posez la Goule affamée au Centre. **Révélation : Défausse 1** : elle défausse une carte avec **Relève** de votre main, la plus chère d\'abord.') },
    { go: true, text: t('Validez le tour, et regardez votre main à la révélation.') },

    { info: true, turn: 2, hl: '.mc[data-id="zombie"]', text: t('Le Zombie a **Relève** : défaussé, il est entré en jeu gratuitement avec +1, dans la zone où vous étiez le plus en retard.') },
    { hl: card('danse_macabre'), drag: () => [card('danse_macabre'), zone(1)], done: t => t.pend('danse_macabre'),
      text: t('La Danse macabre défausse jusqu\'à 2 cartes avec Relève, puis vous fait piocher 2 cartes. Posez-la où vous voulez.') },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 3, hl: '.mc[data-id="chevalier_mort"]', text: t('Le Chevalier de la mort, qui coûte 4, s\'est relevé gratuitement, et sa Révélation a défaussé le Squelette, qui s\'est relevé à son tour !') },
    { hl: card('fossoyeur'), drag: t => [card('fossoyeur'), zone(t.weakest())], done: t => t.pend('fossoyeur'),
      text: t('Le Fossoyeur défausse 1 carte avec Relève, puis vous fait piocher. Posez-le : le Spectre hurlant de votre main se relèvera.') },
    { go: true, text: t('Validez le tour.') },

    { free: true, turn: 4, text: t('Dernier tour : jouez vos cartes comme vous voulez. Une carte avec Relève peut aussi se poser normalement.') },
  ],
  end: t('Leçon finie : défausser des cartes avec Relève les met en jeu gratuitement. Le Codex explique aussi l\'Exhumation, qui ramène une créature de la défausse.'),
};

// Vampires et Démons du Crépuscule : Drain sur la main puis sur le plateau, et Échange de l'Âme damnée contre le Mercenaire adverse.
const DRAIN_LESSON = {
  title: t('Drain et Échange'), turns: 4, noGeneral: true, noTerrain: true,
  me: { general: 'erudit', hand: 3, order: ['chauve_souris', 'novice', 'ame_damnee', 'corrupteur', 'mercenaire', 'golem', 'chevalier', 'barde', 'potion'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 1]], 3: [['chevalier', 2]], 4: [['barde', 2]] } },
  steps: [
    { hl: () => [card('chauve_souris'), zone(2)], drag: () => [card('chauve_souris'), zone(2)], done: t => t.pend('chauve_souris'),
      text: t('Les Vampires volent la puissance : c\'est le **Drain**. La Chauve-souris draine 1 sur une créature de la main adverse : elle aura -1 quand elle sera jouée, et la Chauve-souris +1. Posez-la à Droite.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 2, hl: () => [card('novice'), zone(0)], drag: () => [card('novice'), zone(0)], done: t => t.pend('novice') && t.zoneOf('novice') === 0,
      text: t('Le Vampire novice draine la créature adverse la plus faible de sa zone. Posez-le à Gauche, face à l\'Éclaireuse.') },
    { hl: () => [card('ame_damnee'), zone(1)], drag: () => [card('ame_damnee'), zone(1)], done: t => t.pend('ame_damnee') && t.zoneOf('ame_damnee') === 1,
      text: t('Posez l\'Âme damnée au Centre. Une puissance de -2 ? C\'est voulu : avec l\'**Échange**, vos créatures négatives passent chez l\'adversaire.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: t => [card('corrupteur'), zone(t.zoneOf('ame_damnee'))], drag: t => [card('corrupteur'), zone(t.zoneOf('ame_damnee'))], done: t => t.together('corrupteur', 'ame_damnee'),
      text: t('Le Corrupteur fait un **Échange** : votre créature négative la plus faible de sa zone passe chez l\'adversaire, et vous prenez sa créature la plus puissante (4 ou moins). Posez-le avec l\'Âme damnée.') },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 4, hl: '.board > .zone[data-z="1"]', text: t('Échange fait : le Mercenaire adverse se bat pour vous, et l\'Âme damnée affaiblit maintenant son camp.') },
    { free: true, text: t('Dernier tour : jouez vos cartes comme vous voulez, puis validez.') },
  ],
  end: t('Leçon finie : le Drain affaiblit l\'adversaire jusque dans sa main, et l\'Échange lui refile vos créatures négatives.'),
};

// Sorts : l'Apprentie gagne +1 par sort révélé (Sortilège), le Scribe +1 par carte piochée hors du début de tour (Inspiration).
const SPELLS_LESSON = {
  title: t('Sortilège et Inspiration'), turns: 4, noGeneral: true, noTerrain: true,
  me: { general: 'erudit', hand: 3, order: ['apprentie', 'lueur', 'potion', 'scribe', 'ecritures', 'benediction', 'eclaireuse', 'golem', 'mercenaire', 'barde', 'chevalier', 'archere'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 1]], 2: [['mercenaire', 2]], 3: [['chevalier', 0]], 4: [['barde', 2]] } },
  steps: [
    { hl: () => [card('apprentie'), zone(1)], drag: () => [card('apprentie'), zone(1)], done: t => t.pend('apprentie'),
      text: t('L\'Apprentie arcaniste a **Sortilège** : elle gagne +1 chaque fois que vous révélez un sort, dans n\'importe quelle zone. Posez-la au Centre.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 2, hl: () => [card('lueur'), zone(0)], drag: () => [card('lueur'), zone(0)], done: t => t.pend('lueur'),
      text: t('Posez la Lueur des sylves à Gauche : votre zone y gagne +3. C\'est un sort : l\'Apprentie gagnera +1, même d\'une autre zone.') },
    { hl: t => [card('potion'), zone(t.zoneOf('apprentie'))], drag: t => [card('potion'), zone(t.zoneOf('apprentie'))], done: t => t.together('potion', 'apprentie'),
      text: t('Posez la Potion de force avec l\'Apprentie : deuxième sort, deuxième Sortilège, et +2 pour votre créature la plus forte de la zone.') },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 3, hl: '.mc[data-id="apprentie"]', text: t('Deux sorts révélés : l\'Apprentie a gagné +1 deux fois, et +2 avec la Potion.') },
    { hl: () => [card('scribe'), zone(2)], drag: () => [card('scribe'), zone(2)], done: t => t.pend('scribe'),
      text: t('Le Scribe céleste a **Inspiration** : il gagne +1 chaque fois que vous piochez une carte en dehors de la pioche du début de tour. Posez-le à Droite.') },
    { hl: t => [card('benediction'), zone(t.zoneOf('scribe'))], drag: t => [card('benediction'), zone(t.zoneOf('scribe'))], done: t => t.together('benediction', 'scribe'),
      text: t('Il vous reste 1 sceau : posez la Bénédiction avec le Scribe. Vos créatures de sa zone gagnent +1, et c\'est encore un sort pour l\'Apprentie.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 4, hl: card('ecritures'), drag: t => [card('ecritures'), zone(t.weakest())], done: t => t.pend('ecritures'),
      text: t('Les Écritures saintes font piocher 2 cartes : 2 Inspirations pour le Scribe, et un Sortilège de plus pour l\'Apprentie. Posez-les où vous voulez.') },
    { free: true, text: t('Il vous reste 1 sceau : posez une autre carte si vous voulez, puis validez.') },
  ],
  end: t('Leçon finie : les sorts et la pioche renforcent vos créatures avec Sortilège et Inspiration.'),
};

// Faites vos jeux : le dé tombe toujours pareil (dice : 4 pour la Joueuse). Le Croupier pipe le dé de Quitte ou double (6),
// les Cartes biseautées font piocher le Sept de carreau, et les 3 Sept en jeu au tour 5 déclenchent le Jackpot.
const BETS_LESSON = {
  title: t('Dés, triche et Jackpot'), turns: 5, noGeneral: true, noTerrain: true, dice: [4],
  me: { general: 'erudit', hand: 3, order: ['joueuse_des', 'croupier', 'sept_pique', 'quitte_double', 'sept_trefle', 'cartes_biseautees', 'chevalier', 'golem', 'sept_carreau'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'chevalier', 'barde', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 2]], 2: [['mercenaire', 0]], 3: [['chevalier', 1]], 4: [['barde', 2]], 5: [['golem', 0]] } },
  steps: [
    { hl: () => [card('joueuse_des'), zone(1)], drag: () => [card('joueuse_des'), zone(1)], done: t => t.pend('joueuse_des'),
      text: t('Au casino, on parie. La Joueuse de dés a **Pari** : à sa révélation, on lance un dé à 6 faces. 1-2 : rien, 3-5 : +2, 6 : +4. Posez-la au Centre.') },
    { go: true, text: t('Validez le tour, et regardez le dé rouler.') },

    { info: true, turn: 2, hl: '.mc[data-id="joueuse_des"]', text: t('4 : entre 3 et 5, la Joueuse gagne +2. Mais un dé, ça se pipe…') },
    { hl: () => [card('croupier'), zone(0)], drag: () => [card('croupier'), zone(0)], done: t => t.pend('croupier'),
      text: t('Le Croupier triche : à sa révélation, votre **prochain dé** fera 6, sans être lancé. Posez-le à Gauche.') },
    { go: true, text: t('Validez le tour.') },

    { turn: 3, hl: () => [card('sept_pique'), zone(2)], drag: () => [card('sept_pique'), zone(2)], done: t => t.pend('sept_pique'),
      text: t('Voici un **Sept**. Il y en a trois : pique, trèfle et carreau. Quand les 3 sont en jeu en même temps, c\'est le **Jackpot**, et chaque Sept a son effet Jackpot. Posez le Sept de pique à Droite.') },
    { hl: t => [card('quitte_double'), zone(t.zoneOf('joueuse_des'))], drag: t => [card('quitte_double'), zone(t.zoneOf('joueuse_des'))], done: t => t.together('quitte_double', 'joueuse_des'),
      text: t('Quitte ou double parie sur votre créature la plus puissante de sa zone. Grâce au Croupier, son dé fera 6 : la Joueuse doublera sa puissance. Posez-le avec la Joueuse.') },
    { go: true, text: t('Validez le tour.') },

    { info: true, turn: 4, hl: '.mc[data-id="joueuse_des"]', text: t('6 : la Joueuse est passée de 3 à 6. Le dé pipé ne rate jamais.') },
    { hl: () => [card('sept_trefle'), zone(0)], drag: () => [card('sept_trefle'), zone(0)], done: t => t.pend('sept_trefle'),
      text: t('Deuxième Sept : posez le Sept de trèfle à Gauche.') },
    { hl: () => [card('cartes_biseautees'), zone(0)], drag: () => [card('cartes_biseautees'), zone(0)], done: t => t.pend('cartes_biseautees'),
      text: t('On peut aussi tricher sur le deck : les Cartes biseautées vous font piocher un Sept, celui qui vous manque. Posez-les à Gauche.') },
    { go: true, text: t('Validez le tour : le Sept de carreau arrivera dans votre main.') },

    { turn: 5, hl: t => [card('sept_carreau'), zone(t.weakest())], drag: t => [card('sept_carreau'), zone(t.weakest())], done: t => t.pend('sept_carreau'),
      text: t('Le dernier Sept ! Posez le Sept de carreau où vous voulez : à sa révélation, vos 3 Sept seront en jeu et leurs effets Jackpot se déclencheront.') },
    { free: true, text: t('Il vous reste 1 sceau : posez une autre carte si vous voulez, puis validez et regardez la machine à sous.') },
  ],
  end: t('Leçon finie : un Pari, c\'est un dé à 6 faces. Les cartes qui trichent pipent le dé ou le deck, et vos 3 Sept en jeu déclenchent le Jackpot : vos créatures gagnent +2.'),
};

// Leçons proposées dans « Apprendre », dans l'ordre. L'initiation est lancée seule au premier lancement.
// advanced : leçon du tutoriel avancé, rangée à part dans « Apprendre ».
export const LESSONS = {
  initiation: { ...INITIATION, blurb: t('4 tours · poser ses cartes et gagner 2 zones') },
  effets: { ...EFFECTS, blurb: t('4 tours · Révélation, jetons et sorts') },
  terrains: { ...TERRAINS_LESSON, blurb: t('4 tours · terrains et créatures Déplaçables') },
  generaux: { ...GENERALS_LESSON, blurb: t('4 tours · lire et activer son général') },
  complet: { ...FULL, title: t('Partie complète'), blurb: t('7 tours · toutes les règles dans une vraie partie') },
  sceaux: { ...SEALS_LESSON, advanced: true, blurb: t('4 tours · Grâce, Trésor, Magot et Coût X') },
  sacrifice: { ...SACRIFICE_LESSON, advanced: true, blurb: t('4 tours · Chèvre, Sacrifice et Destruction') },
  releve: { ...RISE_LESSON, advanced: true, blurb: t('4 tours · défausser ses Morts-vivants pour les relever') },
  drain: { ...DRAIN_LESSON, advanced: true, blurb: t('4 tours · voler la puissance et échanger ses créatures') },
  sorts: { ...SPELLS_LESSON, advanced: true, blurb: t('4 tours · tirer profit des sorts et de la pioche') },
  // set : leçon cachée avant la sortie de son set.
  pari: { ...BETS_LESSON, advanced: true, set: 'tapis', blurb: t('5 tours · lancer les dés, tricher et décrocher le Jackpot') },
};
for (const l of Object.values(LESSONS)) l.steps.forEach((s, i) => { s.turn = s.turn || (i ? l.steps[i - 1].turn : 1); });

const deckOf = (s, name) => ({ name, cards: s.order, terrains: s.terrains.map(x => x.t), general: s.general });
// Remet le deck dans l'ordre voulu (newGame mélange) et fixe la main de départ et les terrains.
function arrange(P, s) {
  const all = [...P.hand, ...P.deck];
  const cards = s.order.map(id => all.splice(all.findIndex(c => c.id === id), 1)[0]);
  P.hand = cards.slice(0, s.hand); P.deck = cards.slice(s.hand);
  P.terrainPlan = s.terrains.map(x => ({ ...x }));
}
export function tutorialGame(names, lesson = LESSONS.complet) {
  const st = newGame(deckOf(lesson.me, t('Tutoriel')), deckOf(lesson.foe, t('Entraînement')), names, { generals: [lesson.me.general, lesson.foe.general], turns: lesson.turns });
  arrange(st.p[0], lesson.me); arrange(st.p[1], lesson.foe);
  // Dé truqué pour la leçon : les Paris tombent toujours pareil.
  if (lesson.dice) st.dice = lesson.dice.slice();
  startTurn(st); st.phase = 'plan';
  return st;
}
// Plan de l'adversaire pour le tour en cours.
function foePlan(st, lesson) {
  const hand = st.p[1].hand.slice(), cards = [];
  for (const [id, z] of lesson.foe.plays[st.turn] || []) { const i = hand.findIndex(c => c.id === id); if (i >= 0) cards.push({ uid: hand.splice(i, 1)[0].uid, zone: z }); }
  return { cards, moves: [], general: null };
}

// ---- Étapes ----
// Chaque étape a un texte (ou une fonction qui le donne) et :
// - hl : ce qu'il faut mettre en valeur, un sélecteur CSS ou une fonction qui renvoie une liste de sélecteurs ;
// - drag (glisser une carte vers une zone) ou tap (toucher ; taps: 2 pour une double touche) : le geste que la main du guide montre ;
// - info : un bouton Suivant ;
// - done(t) : l'étape passe seule quand la condition est remplie ;
// - go : étape « Valider le tour », qui suit toujours l'étape d'action du tour (si celle-ci est défaite, le guide y revient) ;
// - free : jeu libre ;
// - turn : tour où commence l'étape (sinon celui de l'étape précédente).
// Le bouton Valider n'est ouvert qu'aux étapes go et free.
const REVEAL = t('Révélation : les cartes des deux camps se retournent une à une, le joueur qui mène d\'abord.');

// Contrôleur de partie (comme startSolo) et guide. handlers : ceux de main.js (onView).
export function startTutorial(handlers, { name, lesson: key = 'complet' }) {
  const lesson = LESSONS[key] || LESSONS.complet, STEPS = lesson.steps;
  const names = [name, t('Entraîneur')];
  let st, ready = false, stopped = false, step = 0;
  const emit = flash => !stopped && handlers.onView(viewFor(st, 0, { flash, ready: { me: ready, foe: true }, names, connected: [true, true], noGeneral: !!lesson.noGeneral, noTerrain: !!lesson.noTerrain }));
  function begin() { st = tutorialGame(names, lesson); ready = false; step = 0; emit(null); }
  begin();
  // Outils des conditions d'étape, à partir de l'état de l'appli.
  const tools = ui => {
    const v = ui.view, pending = id => ui.pending.find(p => p.id === id);
    // Zone d'une carte : posée ce tour, déplacée ce tour, ou déjà en jeu.
    const zoneOf = id => { const p = pending(id); if (p) return p.zone;
      const z = v.me.board.findIndex(col => col.some(c => c.id === id)), c = z >= 0 && v.me.board[z].find(x => x.id === id), m = c && ui.moves.find(x => x.uid === c.uid);
      return m ? m.zone : z; };
    return {
      ui, zoneOf,
      sel: id => ui.sel !== null && v.me.hand.find(c => c.uid === ui.sel)?.id === id,
      pend: id => !!pending(id),
      apart: (a, b) => !!pending(a) && zoneOf(a) !== zoneOf(b),
      together: (a, b) => !!pending(a) && zoneOf(a) === zoneOf(b),
      // Zones où la carte n'est pas (pour en poser une autre ailleurs).
      zonesWithout: id => [0, 1, 2].filter(z => z !== zoneOf(id)),
      // Zone où l'écart avec l'adversaire est le pire.
      weakest: () => [0, 1, 2].reduce((a, z) => (v.foe.zonePower[z] - v.me.zonePower[z] > v.foe.zonePower[a] - v.me.zonePower[a] ? z : a), 0),
      sealsLeft: () => v.me.seals - ui.pending.reduce((n, p) => n + (v.me.hand.find(c => c.uid === p.uid)?.cost || 0), 0),
    };
  };
  // Étape en cours : passe celles qui sont faites ou d'un tour déjà joué, revient à l'action du tour si elle a été défaite.
  function sync(ui) {
    const v = ui.view, t = tools(ui);
    for (;;) {
      const s = STEPS[step]; if (!s) return null;
      if (v.turn > s.turn) { step++; continue; }
      if (s.done && v.phase === 'plan' && s.done(t)) { step++; continue; }
      if (s.go && !STEPS[step - 1].done(t)) { step--; continue; }
      return s;
    }
  }
  const list = x => (x == null ? [] : typeof x === 'string' ? [x] : x);
  return {
    lesson: key,
    async submit(plan) {
      if (ready || st.over) return;
      ready = true; emit(null);
      await runTurn(st, [plan, foePlan(st, lesson)], emit, ms => new Promise(r => setTimeout(r, ms)));
      ready = false; emit(null);
    },
    rematch: begin,
    leave() { stopped = true; },
    // Ce que le guide affiche : { text, hl, info, drag, tap, step, steps } ou null.
    // hl : liste de sélecteurs ; drag : [d'où, vers où] ; tap : sélecteur.
    coach(ui) {
      const v = ui.view; if (!v || v.phase === 'over') return null;
      if (v.phase === 'reveal' || v.ready.me) return { text: REVEAL, hl: [] };
      const s = sync(ui); if (!s || s.turn > v.turn) return null;
      const t = tools(ui), val = x => (typeof x === 'function' ? x(t) : x);
      return {
        text: val(s.text), info: !!s.info, step: step + 1, steps: STEPS.length,
        hl: s.go ? [GO] : list(val(s.hl)), tap: s.go ? GO : val(s.tap) || null, taps: s.taps || 1, drag: s.go ? null : val(s.drag) || null,
      };
    },
    next() { if (STEPS[step]?.info) step++; },
    // Le bouton Valider n'est ouvert qu'aux étapes « Valider » et en jeu libre.
    canSubmit(ui) { const s = sync(ui); return !s || s.free || s.go; },
    endText: lesson.end,
  };
}
