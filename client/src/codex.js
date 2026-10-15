// Codex : les règles de base et chaque mot-clé des cartes, avec son effet exact et des cartes d'exemple.
// À compléter quand une mécanique apparaît (avec KEYWORDS dans common.js, qui met les mots-clés en gras).
import { CARDS } from '@jeu/engine';
import { setById, setRevealed } from '@jeu/engine/collection';
import { esc, famStyle, rich } from './common.js';
import { t } from '@jeu/engine/i18n';

// fam : famille qui utilise surtout le mot-clé (couleur de la pastille) ; ex : cartes d'exemple (identifiants).
export const CODEX = [
  { id: 'regles', title: t('Règles de base'), items: [
    { name: t('Victoire'), text: t('Une partie dure 7 tours sur 3 zones : Gauche, Centre et Droite. À la fin du tour 7, le joueur le plus puissant dans au moins 2 zones gagne. Sinon, la puissance totale des trois zones départage.') },
    { name: t('Sceaux'), text: t('Au tour N, vous avez N sceaux, plus les bonus. Chaque carte coûte des sceaux ; vous pouvez en poser plusieurs par tour tant qu\'il vous en reste.') },
    { name: t('Préparation et révélation'), text: t('Les deux joueurs préparent leur tour en secret : leurs cartes sont posées face cachée. Quand les deux ont validé, tout est révélé, carte par carte.') },
    { name: t('Ordre de révélation'), text: t('Le joueur qui mène (le plus de zones gagnées, sinon la plus grande puissance totale) révèle en premier : son général, ses déplacements, puis ses cartes dans l\'ordre où il les a posées.') },
    { name: t('Puissance'), text: t('Chaque créature a une puissance. La puissance d\'une zone est la somme de vos créatures, plus les bonus de zone. Les sorts n\'ont pas de puissance : ils agissent à la révélation puis partent à la défausse.') },
    { name: t('Zones'), text: t('Chaque joueur a 4 emplacements par zone. Une carte ne peut pas être posée dans une zone pleine de votre côté.') },
    { name: t('Main et pioche'), text: t('Vous commencez avec 3 cartes et piochez 1 carte au début de chaque tour. La main est limitée à 7 cartes : une carte piochée en trop part à la défausse.') },
    { name: t('Général'), text: t('Chaque deck a un général, toujours visible à côté de son joueur. Son effet est persistant, se déclenche à un moment précis, ou s\'active une fois par partie.') },
    { name: t('Terrains'), text: t('Un deck a 5 terrains. Aux tours 1, 2 et 3, un terrain au hasard est révélé dans une de vos zones et y reste jusqu\'à la fin.') },
  ] },
  { id: 'moments', title: t('Moments'), items: [
    { name: t('Révélation'), text: t('Se déclenche quand la carte est révélée, ou quand elle entre en jeu par un effet (Relève, Exhumation, Éclosion, invocation).'), ex: ['barde', 'eclaireur'] },
    { name: t('Persistant'), text: t('Agit tant que la carte est en jeu : le bonus disparaît avec elle.'), ex: ['gardien', 'moissonneur'] },
    { name: t('Début de tour'), text: t('Se déclenche au début de chaque tour, après la pioche et le terrain du tour. Début du tour N : au début de ce tour-là seulement.'), ex: ['dragonnet', 'oeuf'] },
    { name: t('Fin de tour'), text: t('Se déclenche à la fin de chaque tour, après toutes les révélations.'), ex: ['chaman', 'canopee'] },
    { name: t('Début de partie'), text: t('Se déclenche une fois, avant le premier tour. Surtout chez les généraux.') },
    { name: t('Fin de partie'), text: t('Se déclenche une fois, à la fin du tour 7, juste avant de compter les zones.') },
    { name: t('Activable'), text: t('Effet de général à déclencher une fois par partie : pendant la préparation, touchez deux fois votre général pour l\'activer (certains coûtent un sceau ou demandent une zone). Il agit au début de votre révélation.') },
    { name: t('Destruction'), text: t('Se déclenche quand la créature est détruite, par l\'adversaire ou par un sacrifice.'), ex: ['diablotin', 'bombardier'] },
  ] },
  { id: 'base', title: t('Mots-clés du Set de base'), items: [
    { name: t('Grâce'), fam: 'Ange', text: t('Se déclenche en fin de tour si vous avez dépensé tous vos sceaux ce tour.'), ex: ['cherubin', 'juge'] },
    { name: t('Sacrifice'), fam: 'Démon', text: t('Sacrifice N : à sa révélation, la carte détruit vos N créatures les plus faibles de sa zone. S\'il n\'y en a pas assez, c\'est elle qui est détruite.'), ex: ['molosse', 'bete'] },
    { name: t('Horde'), fam: 'Gobelin', text: t('Horde N : crée dans la zone un jeton Horde de puissance N, ou donne +N à la Horde qui y est déjà. Une seule Horde par zone.'), ex: ['eclaireur', 'recruteur'] },
    { name: t('Déplaçable'), fam: 'Elfe', text: t('Une fois en jeu, la créature peut changer de zone pendant la préparation (marquée ⇄) : touchez-la puis une autre zone. Elle y apparaît aussitôt de votre côté et libère sa place : vous pouvez y poser une nouvelle carte le même tour, tant qu\'aucune zone ne dépasse 4 cartes en fin de tour. Elle se déplace vraiment à votre révélation, avant vos nouvelles cartes, une fois par tour.'), ex: ['eclaireuse', 'archere'] },
    { name: t('Déplacement'), fam: 'Elfe', text: t('Se déclenche quand la créature change de zone, par vous ou par un effet.'), ex: ['feu_follet', 'cerf'] },
    { name: t('Trésor'), fam: 'Dragon', text: t('Les sceaux que vous ne dépensez pas s\'ajoutent à votre Trésor à la fin de chaque tour. Des Dragons coûtent moins cher ou gagnent de la puissance selon votre Trésor.'), ex: ['drake', 'cavernes'] },
    { name: t('Magot'), fam: 'Dragon', text: t('Jeton Magot de dragon : en fin de tour, il gagne autant de puissance que vos sceaux non dépensés.'), ex: ['gardien_magot'] },
    { name: t('Coût X'), text: t('La carte prend tous vos sceaux restants quand vous la posez ; X est ce nombre. Posez-la en dernier.'), ex: ['priere'] },
    { name: t('Jeton'), text: t('Créature créée par un effet (Horde, Chèvre, Magot, Festin). Elle ne va jamais à la défausse ni dans une collection.'), ex: ['horde', 'chevre'] },
  ] },
  { id: 'set2', title: t('Mots-clés du Crépuscule'), items: [
    { name: t('Défausse'), fam: 'Mort-vivant', text: t('Défausse N : vous défaussez jusqu\'à N cartes avec Relève de votre main, les plus chères d\'abord. Les autres cartes restent en main.'), ex: ['goule', 'danse_macabre'] },
    { name: t('Relève'), fam: 'Mort-vivant', text: t('Quand cette carte est défaussée de votre main (par un effet ou main pleine), elle entre en jeu gratuitement avec +1 et son effet Révélation, dans la zone où vous êtes le plus en retard avec un emplacement libre.'), ex: ['squelette', 'zombie'] },
    { name: t('Exhumation'), fam: 'Mort-vivant', text: t('Ramène en jeu la créature la plus puissante de votre défausse, avec son effet Révélation.'), ex: ['necromancien', 'reanimation'] },
    { name: t('Drain'), fam: 'Vampire', text: t('Drain N : la cible perd N et le Vampire gagne N. La cible peut être une créature adverse en jeu, une carte de la main adverse ou du deck adverse (elle aura -N quand elle sera jouée).'), ex: ['novice', 'chauve_souris'] },
    { name: t('Festin'), fam: 'Gobelin', text: t('Festin N : crée dans la zone un jeton Festin de puissance N, ou donne +N à celui qui y est. En fin de tour, votre Gobelin le plus faible de la zone (une Horde compte) le dévore : il gagne sa puissance et le Festin disparaît.'), ex: ['marmiton', 'goinfre'] },
    { name: t('Inspiration'), fam: 'Ange', text: t('Se déclenche quand vous piochez une carte en dehors de la pioche du début de tour.'), ex: ['scribe', 'archiviste'] },
    { name: t('Œuf'), fam: 'Dragon', text: t('Créature qui attend d\'éclore. Éclosion : quand sa condition est remplie, l\'Œuf laisse sa place à une créature au hasard de votre deck qui coûte 5 ou plus, avec son effet Révélation. S\'il n\'y en a aucune, l\'Œuf gagne +3.'), ex: ['oeuf_braise', 'couveuse'] },
    { name: t('Échange'), fam: 'Démon', text: t('Votre créature de puissance négative la plus faible de la zone passe chez l\'adversaire, et vous prenez la créature adverse visée. Sans créature négative, rien ne se passe. La Chèvre (-1) compte.'), ex: ['tentateur', 'marche_dupes'] },
    { name: t('Sortilège'), fam: 'Elfe', text: t('Se déclenche quand vous révélez un sort, dans n\'importe quelle zone.'), ex: ['apprentie', 'mage_bois'] },
  ] },
  // set : groupe caché avant la sortie de son set.
  { id: 'tapis', set: 'tapis', title: t('Mots-clés de Rien ne va plus'), items: [
    { name: t('Pari'), text: t('Pari : à la révélation, on lance un dé à 6 faces. L\'effet dépend du résultat : 1-2, 3-5 ou 6. Le dé roule sur la carte qui parie.'), ex: ['joueuse_des', 'flambeur', 'quitte_double'] },
    { name: t('Dés pipés'), text: t('Certaines cartes pipent vos prochains dés : ils font 6 sans être lancés. D\'autres trichent sur le deck et vous font piocher la carte voulue.'), ex: ['des_pipes', 'croupier', 'cartes_biseautees'] },
    { name: t('Sept et Jackpot'), text: t('Il y a trois Sept, un par famille de départ : le Sept des Pillards (Gobelin), le Sept des Sylves (Elfe) et le Sept des Fosses (Démon). Tous les decks peuvent les jouer. La première fois que vos 3 Sept sont en jeu en même temps, c\'est le Jackpot : vos créatures gagnent +2, et les effets « Jackpot » de vos cartes se déclenchent. Une fois par partie.'), ex: ['sept_pillards', 'sept_sylves', 'sept_fosses'] },
  ] },
  { id: 'set3', set: 'set3', title: t('Mots-clés de la Cité Néon'), items: [
    { name: t('Malware'), fam: 'Hacker', text: t('Malware N : N Malwares sont glissés au hasard parmi les 6 premières cartes du deck adverse. Quand l\'adversaire en pioche un, il s\'exécute et disparaît sans être remplacé : le Virus fait perdre 1 à sa créature la plus puissante (1 sceau s\'il n\'en a pas), le Worm fait de même puis glisse un Virus dans son deck, le Ransomware fait coûter 1 de plus à la carte la plus chère de sa main.'), ex: ['script_kiddie', 'ver_polymorphe', 'casseuse'] },
    { name: t('Piratage'), fam: 'Hacker', text: t('La créature piratée perd tous ses effets (Persistant, Fin de tour, Grâce, Destruction, Déplaçable…) jusqu\'à ce qu\'elle quitte le jeu ; sa puissance et ses bonus déjà reçus restent. Un général piraté n\'agit plus jusqu\'à la fin du tour suivant, et ne peut pas être activé.'), ex: ['glitcheuse', 'brise_glace', 'coupe_circuit'] },
    { name: t('Pare-feu'), text: t('Pare-feu : vos créatures dans la zone d\'une carte avec Pare-feu (ou sur le terrain Pare-feu) ne peuvent pas être piratées.'), ex: ['garde_securite'] },
    { name: t('Surcharge'), fam: 'Cyborg', text: t('Surcharge N : à la révélation de la carte, s\'il vous reste au moins N sceaux, ils sont dépensés et l\'effet Surcharge s\'applique. Gardez des sceaux en préparant votre tour pour la déclencher.'), ex: ['samourai', 'bras_canon', 'ferrailleur'] },
    { name: t('Implant'), fam: 'Cyborg', text: t('Implant N : la créature gagne +N et un Implant. Des cartes comptent les Implants ou renforcent les créatures qui en ont.'), ex: ['charcudoc', 'chrome', 'legende_chrome'] },
  ] },
];

const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Contenu du panneau : recherche, puis une section par groupe. Les cartes d'exemple s'ouvrent en grand (data-zoom).
export function codexHTML(query = '') {
  const q = norm(query.trim());
  const match = it => !q || norm(it.name).includes(q) || norm(it.text).includes(q);
  const ex = id => CARDS[id] ? `<button class="chip" data-zoom="card:${id}">${esc(CARDS[id].name)}</button>` : '';
  const item = it => `<div class="cx" style="${it.fam ? famStyle(it.fam) : ''}"><div class="cxh"><b>${esc(it.name)}</b>${it.fam ? `<span class="cxf">${esc(t(it.fam))}</span>` : ''}</div>
    <p>${rich(it.text)}</p>${it.ex ? `<div class="cxex"><small class="hint">${t('Exemples :')}</small>${it.ex.map(ex).join('')}</div>` : ''}</div>`;
  const groups = CODEX.filter(g => !g.set || setRevealed(setById(g.set))).map(g => ({ ...g, items: g.items.filter(match) })).filter(g => g.items.length);
  return groups.length ? groups.map(g => `<div class="gal-h">${esc(g.title)}</div><div class="cxs">${g.items.map(item).join('')}</div>`).join('')
    : `<p class="hint" style="margin:0">${t('Aucun mot-clé ne correspond.')}</p>`;
}
