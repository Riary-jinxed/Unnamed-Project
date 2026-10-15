// Tests des mécaniques du moteur : chaque test monte une petite situation et vérifie le résultat attendu des règles.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTurn, endTurn, placeHidden, isMobile } from '../src/engine.js';
import { partie, enJeu, enMain, enDeck, jouer, pw, zp, ids } from './aide.js';

describe('Bases', () => {
  test('poser une carte coûte ses sceaux, et une zone a 4 emplacements', () => {
    const st = partie({ seals: 3 });
    const c = enMain(st, 0, 'golem');
    assert.equal(placeHidden(st, 0, c.uid, 0), false, 'golem coûte 4 : pas assez de sceaux');
    const m = enMain(st, 0, 'mercenaire');
    assert.ok(placeHidden(st, 0, m.uid, 0));
    assert.equal(st.p[0].seals, 1);
    const full = partie();
    for (let i = 0; i < 4; i++) enJeu(full, 0, 'mercenaire', 1);
    assert.equal(placeHidden(full, 0, enMain(full, 0, 'mercenaire').uid, 1), false, 'zone pleine');
  });

  test('puissance des créatures et des zones', () => {
    const st = partie();
    jouer(st, 0, 'mercenaire', 0); jouer(st, 0, 'golem', 0);
    assert.equal(zp(st, 0, 0), 9);
    assert.equal(zp(st, 1, 0), 0);
  });

  test('Sacrifice : la créature la plus faible ici est sacrifiée', () => {
    const st = partie();
    const m = enJeu(st, 0, 'mercenaire', 0); enJeu(st, 0, 'golem', 0);
    const mol = jouer(st, 0, 'molosse', 0);
    assert.deepEqual(ids(st.p[0].board[0]).sort(), ['golem', 'molosse']);
    assert.ok(st.p[0].discard.includes(m));
    assert.equal(pw(st, mol), 5);
  });

  test('Sacrifice impossible : la carte est détruite', () => {
    const st = partie();
    const mol = jouer(st, 0, 'molosse', 0);
    assert.equal(st.p[0].board[0].length, 0);
    assert.ok(st.p[0].discard.includes(mol));
  });

  test('un sort agit puis part à la défausse', () => {
    const st = partie();
    const g = enJeu(st, 0, 'golem', 2); enJeu(st, 0, 'mercenaire', 2);
    const s = jouer(st, 0, 'potion', 2);
    assert.equal(pw(st, g), 8);
    assert.ok(st.p[0].discard.includes(s));
    assert.equal(st.p[0].board[2].length, 2);
    assert.equal(st.p[0].spells, 1);
  });

  test('main pleine : la carte piochée part à la défausse', () => {
    const st = partie();
    for (let i = 0; i < 7; i++) enMain(st, 0, 'mercenaire');
    const g = enDeck(st, 0, 'golem');
    jouer(st, 0, 'barde', 0);
    assert.equal(st.p[0].hand.length, 7);
    assert.ok(st.p[0].discard.includes(g));
  });

  test('Surcharge : dépense les sceaux gardés, sinon rien', () => {
    const st = partie({ seals: 3 });
    const a = jouer(st, 0, 'gamin_augmente', 0);
    assert.equal(pw(st, a), 4); assert.equal(st.p[0].seals, 1);
    const st2 = partie({ seals: 1 });
    const b = jouer(st2, 0, 'gamin_augmente', 0);
    assert.equal(pw(st2, b), 2);
  });
});

describe('Défausse et Relève (Morts-vivants)', () => {
  test('Défausse 1 : la carte avec Relève la plus chère part, se relève avec +1', () => {
    const st = partie();
    enMain(st, 0, 'squelette'); const z = enMain(st, 0, 'zombie'); enMain(st, 0, 'mercenaire');
    jouer(st, 0, 'goule', 0);
    assert.deepEqual(ids(st.p[0].hand).sort(), ['mercenaire', 'squelette'], 'les autres cartes restent en main');
    assert.ok(z.revealed && z.zone >= 0, 'le Zombie est en jeu');
    assert.equal(pw(st, z), 5);
  });

  test('Défausse sans carte avec Relève : les cartes de la main partent au hasard', () => {
    const st = partie();
    enMain(st, 0, 'mercenaire'); enMain(st, 0, 'golem'); enMain(st, 0, 'chevalier');
    jouer(st, 0, 'goule', 0);
    assert.equal(st.p[0].hand.length, 2, 'une seule carte part');
    assert.equal(st.p[0].discard.length, 1);
  });

  test('Défausse : Relève d\'abord, puis au hasard pour le reste', () => {
    const st = partie();
    const z = enMain(st, 0, 'zombie'); enMain(st, 0, 'mercenaire'); enMain(st, 0, 'golem');
    enDeck(st, 0, 'barde'); enDeck(st, 0, 'potion');
    jouer(st, 0, 'danse_macabre', 0);
    assert.ok(z.zone >= 0, 'le Zombie s\'est relevé');
    assert.equal(st.p[0].discard.filter(c => ['mercenaire', 'golem'].includes(c.id)).length, 1, 'une autre carte part au hasard');
    assert.equal(st.p[0].hand.length, 3, '1 carte restée + 2 piochées');
  });

  test('Défausse avec la main trop courte : le reste vient du dessus du deck', () => {
    const st = partie();
    enMain(st, 0, 'mercenaire');
    const sq = enDeck(st, 0, 'squelette'); enDeck(st, 0, 'golem'); enDeck(st, 0, 'barde');
    jouer(st, 0, 'danse_macabre', 0);
    assert.ok(st.p[0].discard.some(c => c.id === 'mercenaire'));
    assert.ok(sq.zone >= 0, 'le Squelette pris sur le deck se relève');
    assert.deepEqual(ids(st.p[0].hand), ['golem', 'barde']);
  });

  test('Défausse avec main et deck vides : rien ne se passe', () => {
    const st = partie();
    jouer(st, 0, 'goule', 0);
    assert.equal(st.p[0].discard.length, 0);
  });

  test('Fossoyeur : Défausse 1, puis pioche 1', () => {
    const st = partie();
    enMain(st, 0, 'squelette'); enDeck(st, 0, 'golem');
    jouer(st, 0, 'fossoyeur', 0);
    assert.deepEqual(ids(st.p[0].hand), ['golem']);
    assert.equal(st.p[0].board.flat().filter(c => c.id === 'squelette').length, 1);
  });

  test('Cimetière : la carte se relève dans sa zone avec +1 de plus', () => {
    const st = partie();
    st.p[0].terrains[2] = 'cimetiere';
    const z = enMain(st, 0, 'zombie');
    jouer(st, 0, 'goule', 0);
    assert.equal(z.zone, 2);
    assert.equal(pw(st, z), 6);
  });

  test('Relève sans emplacement libre : la carte reste à la défausse', () => {
    const st = partie();
    for (const z of [0, 1, 2]) for (let i = 0; i < 4; i++) enJeu(st, 0, 'mercenaire', z);
    const zb = enMain(st, 0, 'zombie');
    st.p[0].discard = [];
    // La Goule ne peut pas être posée : on déclenche la Défausse par le terrain Crypte en fin de tour.
    st.p[0].terrains[0] = 'crypte';
    endTurn(st);
    assert.ok(st.p[0].discard.includes(zb));
    assert.ok(!st.p[0].hand.includes(zb));
  });

  test('Liche : +1 par tranche de 2 cartes dans la défausse', () => {
    const st = partie();
    const l = enJeu(st, 0, 'liche', 0);
    for (let i = 0; i < 5; i++) st.p[0].discard.push({ uid: st.nextUid++, id: 'mercenaire', owner: 0, zone: -1, buff: 0 });
    assert.equal(pw(st, l), 7);
  });

  test('Nécromancien : Exhumation de la plus puissante à 4 sceaux ou moins', () => {
    const st = partie();
    for (const id of ['mercenaire', 'golem', 'colosse']) st.p[0].discard.push({ uid: st.nextUid++, id, owner: 0, zone: -1, buff: 0 });
    jouer(st, 0, 'necromancien', 1);
    assert.deepEqual(ids(st.p[0].board[1]).sort(), ['golem', 'necromancien']);
  });
});

describe('Pari et dés', () => {
  for (const [de, attendu] of [[1, 1], [2, 1], [3, 3], [5, 3], [6, 5]]) {
    test(`Joueuse de dés : un ${de} donne ${attendu}`, () => {
      const st = partie(); st.dice = [de];
      const c = jouer(st, 0, 'joueuse_des', 0);
      assert.equal(pw(st, c), attendu);
      assert.equal(st.p[0].rolls.at(-1).v, de);
    });
  }

  test('les 6 et les 1-2 sont comptés (Videur, Usurier)', () => {
    const st = partie(); st.dice = [6, 6, 1];
    const v = enJeu(st, 0, 'videur', 1); const u = enJeu(st, 0, 'usurier', 2);
    for (let i = 0; i < 3; i++) jouer(st, 0, 'joueuse_des', 0);
    assert.equal(st.p[0].sixes, 2); assert.equal(st.p[0].lows, 1);
    assert.equal(pw(st, v), 6); assert.equal(pw(st, u), 4);
  });

  test('Croupier : le prochain dé fait 6 sans lancer', () => {
    const st = partie(); st.dice = [1];
    jouer(st, 0, 'croupier', 1);
    const c = jouer(st, 0, 'joueuse_des', 0);
    assert.equal(pw(st, c), 5);
    assert.deepEqual(st.dice, [1], 'aucun dé lancé');
    assert.equal(st.p[0].loaded, 0);
  });

  test('Dés pipés : les 2 prochains dés font 6', () => {
    const st = partie(); st.dice = [1, 1];
    jouer(st, 0, 'des_pipes', 1);
    const a = jouer(st, 0, 'joueuse_des', 0), b = jouer(st, 0, 'joueuse_des', 0), c = jouer(st, 0, 'joueuse_des', 0);
    assert.deepEqual([pw(st, a), pw(st, b), pw(st, c)], [5, 5, 1]);
  });

  test('Casino des Fosses : +1 au dé, au plus 6', () => {
    const st = partie(); st.dice = [5, 6];
    st.p[0].terrains[0] = 'casino_fosses';
    const a = jouer(st, 0, 'joueuse_des', 0), b = jouer(st, 0, 'joueuse_des', 0);
    assert.deepEqual(st.p[0].rolls.map(r => r.v), [6, 6]);
    assert.equal(pw(st, a), 5); assert.equal(pw(st, b), 5);
  });

  test('Fortuna : un 1 ou un 2 est relancé une fois', () => {
    const st = partie({ generals: ['fortuna', 'cartographe'] }); st.dice = [2, 4, 1, 1];
    const a = jouer(st, 0, 'joueuse_des', 0), b = jouer(st, 0, 'joueuse_des', 0);
    assert.equal(pw(st, a), 3, '2 relancé en 4');
    assert.equal(pw(st, b), 1, '1 relancé en 1 : pas de seconde relance');
  });

  test('Archange du hasard : vos dés font au moins 3', () => {
    const st = partie(); st.dice = [1];
    enJeu(st, 0, 'archange_hasard', 2);
    const c = jouer(st, 0, 'joueuse_des', 0);
    assert.equal(pw(st, c), 3);
  });

  test('Diable joueur : sur 1-2, il est sacrifié', () => {
    const st = partie(); st.dice = [2];
    const d = jouer(st, 0, 'diable_joueur', 0);
    assert.equal(st.p[0].board[0].length, 0);
    assert.ok(st.p[0].discard.includes(d));
  });

  test('Quitte ou double : sur 6, double la puissance, au plus +8', () => {
    const st = partie(); st.dice = [6, 6];
    const g = enJeu(st, 0, 'golem', 0), t = enJeu(st, 0, 'titan', 1);
    jouer(st, 0, 'quitte_double', 0); jouer(st, 0, 'quitte_double', 1);
    assert.equal(pw(st, g), 12); assert.equal(pw(st, t), 19);
  });

  test('Roulette gobeline : un Pari par zone', () => {
    const st = partie(); st.dice = [1, 4, 6];
    jouer(st, 0, 'roulette_gobeline', 0);
    const h = st.p[0].board.map(z => z.find(c => c.id === 'horde'));
    assert.equal(h[0], undefined); assert.equal(pw(st, h[1]), 1); assert.equal(pw(st, h[2]), 2);
  });

  test('Velours : un 1 ou un 2 donne +2 à votre zone la plus faible', () => {
    const st = partie({ generals: ['velours', 'cartographe'] }); st.dice = [1];
    enJeu(st, 0, 'golem', 1); enJeu(st, 0, 'golem', 2);
    jouer(st, 0, 'joueuse_des', 0);
    assert.deepEqual(st.p[0].zoneBonus, [2, 0, 0]);
  });

  test('Salle des coffres : sur 5-6 en fin de tour, la plus faible ici gagne +2', () => {
    const st = partie(); st.dice = [5];
    st.p[0].terrains[1] = 'salle_coffres';
    const m = enJeu(st, 0, 'mercenaire', 1); enJeu(st, 0, 'golem', 1);
    endTurn(st);
    assert.equal(pw(st, m), 5);
  });
});

describe('Jackpot 777', () => {
  test('les 3 Sept en jeu : +2 à vos créatures, puis les effets Jackpot', () => {
    const st = partie();
    const pique = enJeu(st, 0, 'sept_pique', 0), trefle = enJeu(st, 0, 'sept_trefle', 1);
    const lot = enJeu(st, 0, 'gros_lot', 0), foe = enJeu(st, 1, 'golem', 2);
    enDeck(st, 0, 'golem'); enDeck(st, 0, 'colosse');
    assert.equal(st.p[0].jackpot, 0);
    const carreau = jouer(st, 0, 'sept_carreau', 2);
    assert.equal(st.p[0].jackpot, st.turn);
    assert.equal(pw(st, pique), 4);
    assert.equal(pw(st, trefle), 7, '+2, puis Jackpot du trèfle : +2 à ses alliés ici, lui compris');
    assert.equal(pw(st, carreau), 10, '3 + 2 + 5');
    assert.equal(pw(st, lot), 11, 'Gros lot : 6 + 2 + 3');
    assert.deepEqual(ids(st.p[0].hand), ['golem', 'colosse'], 'Jackpot du pique : pioche 2');
    assert.equal(pw(st, foe), 6, "l'adversaire n'est pas touché");
  });

  test('pas de Jackpot avec 2 Sept seulement', () => {
    const st = partie();
    enJeu(st, 0, 'sept_pique', 0);
    jouer(st, 0, 'sept_carreau', 2);
    assert.equal(st.p[0].jackpot, 0);
  });

  test('le Jackpot ne se déclenche qu\'une fois par partie', () => {
    const st = partie();
    enJeu(st, 0, 'sept_pique', 0); enJeu(st, 0, 'sept_trefle', 1);
    const carreau = jouer(st, 0, 'sept_carreau', 2);
    const avant = pw(st, carreau);
    const second = jouer(st, 0, 'sept_pique', 1);
    assert.equal(pw(st, carreau), avant);
    assert.equal(pw(st, second), 2);
  });

  test('Machine à sous : +3 de plus au Jackpot ; Allée des machines : Sept +2', () => {
    const st = partie();
    st.p[0].terrains[0] = 'allee_machines';
    const pique = enJeu(st, 0, 'sept_pique', 0);
    assert.equal(pw(st, pique), 4);
    const ms = enJeu(st, 0, 'machine_sous', 1);
    enJeu(st, 0, 'sept_trefle', 1);
    jouer(st, 0, 'sept_carreau', 2);
    assert.equal(pw(st, ms), 2 + 2 + 2 + 3, 'base, Jackpot, trèfle ici, Machine à sous');
  });

  test('un Sept révélé par Relève ou invocation déclenche aussi le Jackpot', () => {
    const st = partie();
    enJeu(st, 0, 'sept_pique', 0); enJeu(st, 0, 'sept_trefle', 1);
    enJeu(st, 0, 'mercenaire', 2);
    enDeck(st, 0, 'sept_carreau');
    jouer(st, 0, 'rituel', 2);
    assert.equal(st.p[0].jackpot, st.turn);
  });
});

describe('Horde et Festin (Gobelins)', () => {
  test('une seule Horde par zone : les effets Horde la font grandir', () => {
    const st = partie();
    jouer(st, 0, 'eclaireur', 0);
    jouer(st, 0, 'recruteur', 0);
    const h = st.p[0].board[0].filter(c => c.id === 'horde');
    assert.equal(h.length, 1);
    assert.equal(pw(st, h[0]), 3);
  });

  test('Horde dans une zone pleine : rien n\'est créé', () => {
    const st = partie();
    for (let i = 0; i < 3; i++) enJeu(st, 0, 'mercenaire', 0);
    jouer(st, 0, 'eclaireur', 0);
    assert.equal(st.p[0].board[0].length, 4);
    assert.ok(!st.p[0].board[0].some(c => c.id === 'horde'));
  });

  test('Chef de bande : Horde 1 dans chaque zone ; Porte-étendard : Hordes +1', () => {
    const st = partie();
    jouer(st, 0, 'chef', 1);
    enJeu(st, 0, 'porte_etendard', 2);
    const h = st.p[0].board.map(z => z.find(c => c.id === 'horde'));
    assert.deepEqual(h.map(x => pw(st, x)), [2, 2, 2]);
  });

  test('Seigneur de guerre : double la Horde ici', () => {
    const st = partie();
    jouer(st, 0, 'recruteur', 0); jouer(st, 0, 'appel', 0);
    jouer(st, 0, 'seigneur_guerre', 0);
    assert.equal(pw(st, st.p[0].board[0].find(c => c.id === 'horde')), 8);
  });

  test('Chaman : en fin de tour, la Horde ici gagne +1', () => {
    const st = partie();
    jouer(st, 0, 'eclaireur', 0); enJeu(st, 0, 'chaman', 0);
    endTurn(st);
    assert.equal(pw(st, st.p[0].board[0].find(c => c.id === 'horde')), 2);
  });

  test('Festin : dévoré en fin de tour par le Gobelin le plus faible ici', () => {
    const st = partie();
    const m = jouer(st, 0, 'marmiton', 0);
    const g = enJeu(st, 0, 'goinfre', 1);
    jouer(st, 0, 'cuistot', 1);
    endTurn(st);
    assert.equal(pw(st, m), 2);
    assert.ok(!st.p[0].board.flat().some(c => c.id === 'festin'));
    assert.equal(st.p[0].feasts, 2);
    // Cuistot (0) est plus faible que Goinfre (2) : c'est lui qui dévore.
    assert.equal(pw(st, g), 2);
    assert.equal(pw(st, st.p[0].board[1].find(c => c.id === 'cuistot')), 2);
  });
});

describe('Terrains', () => {
  test('révélés au tour prévu par le plan des terrains', () => {
    const st = partie();
    st.p[0].terrainPlan = [{ t: 'sanctuaire', z: 1, turn: 2 }];
    startTurn(st);
    assert.equal(st.turn, 2);
    assert.deepEqual(st.p[0].terrains, [null, 'sanctuaire', null]);
    assert.equal(zp(st, 0, 1), 2);
  });

  test('Prairie céleste : vos Anges ici +1 (pas ceux de l\'adversaire)', () => {
    const st = partie();
    st.p[0].terrains[0] = 'prairie';
    const a = enJeu(st, 0, 'cherubin', 0), b = enJeu(st, 1, 'cherubin', 0), m = enJeu(st, 0, 'mercenaire', 0);
    assert.deepEqual([pw(st, a), pw(st, b), pw(st, m)], [2, 1, 3]);
  });

  test('Ruines maudites : créatures adverses ici -1 ; Champ de bataille : tout le monde +1', () => {
    const st = partie();
    st.p[0].terrains[0] = 'ruines'; st.p[0].terrains[1] = 'champ';
    const a = enJeu(st, 0, 'mercenaire', 0), b = enJeu(st, 1, 'mercenaire', 0);
    const c = enJeu(st, 0, 'mercenaire', 1), d = enJeu(st, 1, 'mercenaire', 1);
    assert.deepEqual([pw(st, a), pw(st, b), pw(st, c), pw(st, d)], [3, 2, 4, 4]);
  });

  test('Duel singulier : +5 à une créature seule ici', () => {
    const st = partie();
    st.p[0].terrains[2] = 'duel';
    const a = enJeu(st, 0, 'mercenaire', 2);
    assert.equal(pw(st, a), 8);
    enJeu(st, 0, 'mercenaire', 2);
    assert.equal(pw(st, a), 3);
  });

  test('Forteresse : 4 emplacements pleins ici, vos autres zones +1', () => {
    const st = partie();
    st.p[0].terrains[0] = 'forteresse';
    for (let i = 0; i < 3; i++) enJeu(st, 0, 'mercenaire', 0);
    assert.equal(zp(st, 0, 1), 0);
    enJeu(st, 0, 'mercenaire', 0);
    assert.deepEqual([zp(st, 0, 1), zp(st, 0, 2)], [1, 1]);
  });

  test('Bois mouvant : vos créatures ici sont Déplaçables', () => {
    const st = partie();
    st.p[0].terrains[1] = 'bois';
    const a = enJeu(st, 0, 'mercenaire', 1), b = enJeu(st, 0, 'mercenaire', 0);
    assert.equal(isMobile(st, a), true); assert.equal(isMobile(st, b), false);
  });

  test('Bergerie maudite : une Chèvre au début du tour si la zone est vide', () => {
    const st = partie();
    st.p[0].terrains[0] = 'bergerie'; st.p[0].terrains[1] = 'bergerie';
    enJeu(st, 0, 'mercenaire', 1);
    startTurn(st);
    assert.deepEqual(ids(st.p[0].board[0]), ['chevre']);
    assert.deepEqual(ids(st.p[0].board[1]), ['mercenaire']);
  });

  test('Charnier : une créature détruite ici donne +1 aux Démons de votre main', () => {
    const st = partie();
    st.p[0].terrains[0] = 'charnier';
    enJeu(st, 0, 'mercenaire', 0);
    const d = enMain(st, 0, 'diablotin'), m = enMain(st, 0, 'mercenaire');
    jouer(st, 0, 'pacte', 0);
    assert.equal(d.buff, 1); assert.equal(m.buff, 0);
  });

  test('Aire de chasse : jouer un Dragon ici, la plus faible adverse -1 et le Dragon +1', () => {
    const st = partie();
    st.p[0].terrains[0] = 'aire';
    const f = enJeu(st, 1, 'mercenaire', 0);
    const w = jouer(st, 0, 'wyverne', 0);
    assert.equal(pw(st, w), 6); assert.equal(pw(st, f), 2);
  });

  test('Pare-feu : vos créatures ici ne peuvent pas être piratées', () => {
    const st = partie();
    st.p[1].terrains[0] = 'parefeu';
    const g = enJeu(st, 1, 'golem', 0), h = enJeu(st, 1, 'golem', 1);
    jouer(st, 0, 'glitcheuse', 0); jouer(st, 0, 'glitcheuse', 1);
    assert.ok(!g.hacked); assert.ok(h.hacked);
  });
});

describe('Autres mécaniques', () => {
  test('Drain : la cible perd, la source gagne', () => {
    const st = partie();
    const f = enJeu(st, 1, 'mercenaire', 0);
    const n = jouer(st, 0, 'novice', 0);
    assert.equal(pw(st, f), 2); assert.equal(pw(st, n), 1);
    assert.equal(st.p[0].stolen, 1);
  });

  test('Échange : votre Chèvre part, vous prenez la créature adverse la plus faible', () => {
    const st = partie();
    const f = enJeu(st, 1, 'mercenaire', 0); enJeu(st, 1, 'golem', 0);
    jouer(st, 0, 'tentateur', 0);
    assert.equal(f.owner, 0);
    assert.ok(st.p[0].board[0].includes(f));
    assert.deepEqual(ids(st.p[1].board[0]).sort(), ['chevre', 'golem']);
  });

  test('Piratage : la créature perd ses effets persistants', () => {
    const st = partie();
    const g = enJeu(st, 1, 'gardien', 0), a = enJeu(st, 1, 'mercenaire', 0);
    enJeu(st, 1, 'cherubin', 0);
    assert.equal(pw(st, a), 4);
    jouer(st, 0, 'glitcheuse', 0);
    // La plus puissante ici est le Mercenaire (4 avec l'aura) : c'est lui qui est piraté, l'aura reste.
    assert.ok(a.hacked); assert.equal(pw(st, a), 4);
    // Brise-glace pirate toutes les créatures adverses ici : l'aura de l'Ange gardien s'éteint.
    jouer(st, 0, 'brise_glace', 0);
    assert.ok(g.hacked); assert.equal(pw(st, a), 3);
  });

  test('Malware : le Virus pioché s\'exécute (la plus puissante perd 1) sans prendre de place en main', () => {
    const st = partie();
    const g = enJeu(st, 1, 'golem', 0);
    jouer(st, 0, 'script_kiddie', 0);
    assert.deepEqual(ids(st.p[1].deck), ['virus']);
    startTurn(st);
    assert.equal(st.p[1].malwareRun, 1);
    assert.equal(pw(st, g), 5);
    assert.equal(st.p[1].hand.length, 0);
  });

  test('Œuf : à l\'éclosion, une créature à 5 sceaux ou plus du deck le remplace', () => {
    const st = partie();
    const o = enJeu(st, 0, 'oeuf_braise', 0);
    const col = enDeck(st, 0, 'colosse'); enDeck(st, 0, 'mercenaire');
    enJeu(st, 0, 'matriarche', 1);
    jouer(st, 0, 'couvaison', 0);
    assert.ok(st.p[0].board[0].includes(col)); assert.ok(!st.p[0].board[0].includes(o));
    assert.equal(pw(st, col), 11, 'Colosse 9, Matriarche +2 aux créatures écloses');
  });

  test('Grâce : se déclenche en fin de tour si tous les sceaux sont dépensés', () => {
    const st = partie({ seals: 1 });
    const c = jouer(st, 0, 'cherubin', 0);
    const st2 = partie({ seals: 2 });
    const d = jouer(st2, 0, 'cherubin', 0);
    endTurn(st); endTurn(st2);
    assert.equal(pw(st, c), 2); assert.equal(pw(st2, d), 1);
    assert.equal(st2.p[0].treasure, 1, 'un sceau gardé rejoint le Trésor');
  });

  test('la partie se termine au 7e tour, gagnée par 2 zones sur 3', () => {
    const st = partie({ turn: 7 });
    enJeu(st, 0, 'golem', 0); enJeu(st, 0, 'golem', 1); enJeu(st, 1, 'colosse', 2);
    endTurn(st);
    assert.equal(st.over, true);
    assert.equal(st.result.winner, 0);
    assert.deepEqual(st.result.zones, [0, 0, 1]);
  });
});
