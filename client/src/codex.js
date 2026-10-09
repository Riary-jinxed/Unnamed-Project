// Codex : les règles de base et chaque mot-clé des cartes, avec son effet exact et des cartes d'exemple.
// À compléter quand une mécanique apparaît (avec KEYWORDS dans common.js, qui met les mots-clés en gras).
import { CARDS } from '@jeu/engine';
import { esc, famStyle, rich } from './common.js';

// fam : famille qui utilise surtout le mot-clé (couleur de la pastille) ; ex : cartes d'exemple (identifiants).
export const CODEX = [
  { id: 'regles', title: 'Règles de base', items: [
    { name: 'Victoire', text: 'Une partie dure 7 tours sur 3 zones : Gauche, Centre et Droite. À la fin du tour 7, le joueur le plus puissant dans au moins 2 zones gagne. Sinon, la puissance totale des trois zones départage.' },
    { name: 'Sceaux', text: 'Au tour N, vous avez N sceaux, plus les bonus. Chaque carte coûte des sceaux ; vous pouvez en poser plusieurs par tour tant qu\'il vous en reste.' },
    { name: 'Préparation et révélation', text: 'Les deux joueurs préparent leur tour en secret : leurs cartes sont posées face cachée. Quand les deux ont validé, tout est révélé, carte par carte.' },
    { name: 'Ordre de révélation', text: 'Le joueur qui mène (le plus de zones gagnées, sinon la plus grande puissance totale) révèle en premier : son général, ses déplacements, puis ses cartes dans l\'ordre où il les a posées.' },
    { name: 'Puissance', text: 'Chaque créature a une puissance. La puissance d\'une zone est la somme de vos créatures, plus les bonus de zone. Les sorts n\'ont pas de puissance : ils agissent à la révélation puis partent à la défausse.' },
    { name: 'Zones', text: 'Chaque joueur a 4 emplacements par zone. Une carte ne peut pas être posée dans une zone pleine de votre côté.' },
    { name: 'Main et pioche', text: 'Vous commencez avec 3 cartes et piochez 1 carte au début de chaque tour. La main est limitée à 7 cartes : une carte piochée en trop part à la défausse.' },
    { name: 'Général', text: 'Chaque deck a un général, toujours visible à côté de son joueur. Son effet est persistant, se déclenche à un moment précis, ou s\'active une fois par partie.' },
    { name: 'Terrains', text: 'Un deck a 5 terrains. Aux tours 1, 2 et 3, un terrain au hasard est révélé dans une de vos zones et y reste jusqu\'à la fin.' },
  ] },
  { id: 'moments', title: 'Moments', items: [
    { name: 'Révélation', text: 'Se déclenche quand la carte est révélée, ou quand elle entre en jeu par un effet (Relève, Exhumation, Éclosion, invocation).', ex: ['barde', 'eclaireur'] },
    { name: 'Persistant', text: 'Agit tant que la carte est en jeu : le bonus disparaît avec elle.', ex: ['gardien', 'moissonneur'] },
    { name: 'Début de tour', text: 'Se déclenche au début de chaque tour, après la pioche et le terrain du tour. Début du tour N : au début de ce tour-là seulement.', ex: ['dragonnet', 'oeuf'] },
    { name: 'Fin de tour', text: 'Se déclenche à la fin de chaque tour, après toutes les révélations.', ex: ['chaman', 'canopee'] },
    { name: 'Début de partie', text: 'Se déclenche une fois, avant le premier tour. Surtout chez les généraux.' },
    { name: 'Fin de partie', text: 'Se déclenche une fois, à la fin du tour 7, juste avant de compter les zones.' },
    { name: 'Activable', text: 'Effet de général à déclencher une fois par partie : pendant la préparation, touchez votre général pour l\'activer (certains coûtent un sceau ou demandent une zone). Il agit au début de votre révélation.' },
    { name: 'Destruction', text: 'Se déclenche quand la créature est détruite, par l\'adversaire ou par un sacrifice.', ex: ['diablotin', 'bombardier'] },
  ] },
  { id: 'base', title: 'Mots-clés du Set de base', items: [
    { name: 'Grâce', fam: 'Ange', text: 'Se déclenche en fin de tour si vous avez dépensé tous vos sceaux ce tour.', ex: ['cherubin', 'juge'] },
    { name: 'Sacrifice', fam: 'Démon', text: 'Sacrifice N : à sa révélation, la carte détruit vos N créatures les plus faibles de sa zone. S\'il n\'y en a pas assez, c\'est elle qui est détruite.', ex: ['molosse', 'bete'] },
    { name: 'Horde', fam: 'Gobelin', text: 'Horde N : crée dans la zone un jeton Horde de puissance N, ou donne +N à la Horde qui y est déjà. Une seule Horde par zone.', ex: ['eclaireur', 'recruteur'] },
    { name: 'Déplaçable', fam: 'Elfe', text: 'Une fois en jeu, la créature peut changer de zone pendant la préparation (marquée ⇄) : touchez-la puis une zone avec un emplacement libre. Elle se déplace à votre révélation, avant vos nouvelles cartes, une fois par tour.', ex: ['eclaireuse', 'archere'] },
    { name: 'Déplacement', fam: 'Elfe', text: 'Se déclenche quand la créature change de zone, par vous ou par un effet.', ex: ['feu_follet', 'cerf'] },
    { name: 'Trésor', fam: 'Dragon', text: 'Les sceaux que vous ne dépensez pas s\'ajoutent à votre Trésor à la fin de chaque tour. Des Dragons coûtent moins cher ou gagnent de la puissance selon votre Trésor.', ex: ['drake', 'cavernes'] },
    { name: 'Magot', fam: 'Dragon', text: 'Jeton Magot de dragon : en fin de tour, il gagne autant de puissance que vos sceaux non dépensés.', ex: ['gardien_magot'] },
    { name: 'Coût X', text: 'La carte prend tous vos sceaux restants quand vous la posez ; X est ce nombre. Posez-la en dernier.', ex: ['priere'] },
    { name: 'Jeton', text: 'Créature créée par un effet (Horde, Chèvre, Magot, Festin). Elle ne va jamais à la défausse ni dans une collection.', ex: ['horde', 'chevre'] },
  ] },
  { id: 'set2', title: 'Mots-clés du Crépuscule', items: [
    { name: 'Défausse', fam: 'Mort-vivant', text: 'Défausse N : vous défaussez jusqu\'à N cartes avec Relève de votre main, les plus chères d\'abord. Les autres cartes restent en main.', ex: ['goule', 'danse_macabre'] },
    { name: 'Relève', fam: 'Mort-vivant', text: 'Quand cette carte est défaussée de votre main (par un effet ou main pleine), elle entre en jeu gratuitement avec +1 et son effet Révélation, dans la zone où vous êtes le plus en retard avec un emplacement libre.', ex: ['squelette', 'zombie'] },
    { name: 'Exhumation', fam: 'Mort-vivant', text: 'Ramène en jeu la créature la plus puissante de votre défausse, avec son effet Révélation.', ex: ['necromancien', 'reanimation'] },
    { name: 'Drain', fam: 'Vampire', text: 'Drain N : la cible perd N et le Vampire gagne N. La cible peut être une créature adverse en jeu, une carte de la main adverse ou du deck adverse (elle aura -N quand elle sera jouée).', ex: ['novice', 'chauve_souris'] },
    { name: 'Festin', fam: 'Gobelin', text: 'Festin N : crée dans la zone un jeton Festin de puissance N, ou donne +N à celui qui y est. En fin de tour, votre Gobelin le plus faible de la zone (une Horde compte) le dévore : il gagne sa puissance et le Festin disparaît.', ex: ['marmiton', 'goinfre'] },
    { name: 'Inspiration', fam: 'Ange', text: 'Se déclenche quand vous piochez une carte en dehors de la pioche du début de tour.', ex: ['scribe', 'archiviste'] },
    { name: 'Œuf', fam: 'Dragon', text: 'Créature qui attend d\'éclore. Éclosion : quand sa condition est remplie, l\'Œuf laisse sa place à une créature au hasard de votre deck qui coûte 5 ou plus, avec son effet Révélation. S\'il n\'y en a aucune, l\'Œuf gagne +3.', ex: ['oeuf_braise', 'couveuse'] },
    { name: 'Échange', fam: 'Démon', text: 'Votre créature de puissance négative la plus faible de la zone passe chez l\'adversaire, et vous prenez la créature adverse visée. Sans créature négative, rien ne se passe. La Chèvre (-1) compte.', ex: ['tentateur', 'marche_dupes'] },
    { name: 'Sortilège', fam: 'Elfe', text: 'Se déclenche quand vous révélez un sort, dans n\'importe quelle zone.', ex: ['apprentie', 'mage_bois'] },
  ] },
];

const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Contenu du panneau : recherche, puis une section par groupe. Les cartes d'exemple s'ouvrent en grand (data-zoom).
export function codexHTML(query = '') {
  const q = norm(query.trim());
  const match = it => !q || norm(it.name).includes(q) || norm(it.text).includes(q);
  const ex = id => CARDS[id] ? `<button class="chip" data-zoom="card:${id}">${esc(CARDS[id].name)}</button>` : '';
  const item = it => `<div class="cx" style="${it.fam ? famStyle(it.fam) : ''}"><div class="cxh"><b>${esc(it.name)}</b>${it.fam ? `<span class="cxf">${esc(it.fam)}</span>` : ''}</div>
    <p>${rich(it.text)}</p>${it.ex ? `<div class="cxex"><small class="hint">Exemples :</small>${it.ex.map(ex).join('')}</div>` : ''}</div>`;
  const groups = CODEX.map(g => ({ ...g, items: g.items.filter(match) })).filter(g => g.items.length);
  return groups.length ? groups.map(g => `<div class="gal-h">${esc(g.title)}</div><div class="cxs">${g.items.map(item).join('')}</div>`).join('')
    : '<p class="hint" style="margin:0">Aucun mot-clé ne correspond.</p>';
}
