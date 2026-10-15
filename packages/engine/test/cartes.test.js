// Contrôles de toutes les cartes, terrains, généraux et decks : données cohérentes, et aucun effet qui plante.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, TERRAINS, GENERALS, DECKS, startTurn, endTurn } from '../src/engine.js';
import { partie, enJeu, enMain, enDeck, jouer } from './aide.js';

const jouables = Object.keys(CARDS).filter(id => !CARDS[id].token);

describe('Données', () => {
  test('chaque carte a un nom, un type, un coût, une puissance et des mots-clés', () => {
    for (const [id, d] of Object.entries(CARDS)) {
      assert.equal(typeof d.name, 'string', id);
      assert.ok(['C', 'S'].includes(d.type), `${id} : type ${d.type}`);
      assert.ok(Number.isInteger(d.cost) && d.cost >= 0, `${id} : coût`);
      assert.ok(Number.isInteger(d.power), `${id} : puissance`);
      assert.ok(Array.isArray(d.kw), `${id} : mots-clés`);
      assert.equal(typeof d.text, 'string', `${id} : texte`);
    }
  });

  test('chaque deck préconstruit a 15 cartes, des terrains et un général existants', () => {
    for (const [k, d] of Object.entries(DECKS)) {
      assert.equal(d.cards.length, 15, `${k} : ${d.cards.length} cartes`);
      for (const id of d.cards) assert.ok(CARDS[id] && !CARDS[id].token, `${k} : carte ${id}`);
      assert.ok(d.terrains.length >= 3, `${k} : terrains`);
      for (const t of d.terrains) assert.ok(TERRAINS[t], `${k} : terrain ${t}`);
      assert.ok(GENERALS[d.general], `${k} : général ${d.general}`);
    }
  });

  test('il y a exactement 3 Sept', () => {
    assert.deepEqual(Object.keys(CARDS).filter(id => CARDS[id].seven).sort(), ['sept_carreau', 'sept_pique', 'sept_trefle']);
  });
});

// Un plateau garni des deux côtés, une main et un deck, pour que chaque effet ait de quoi agir.
function plateauGarni(opts) {
  const st = partie(opts);
  for (const p of [0, 1]) {
    enJeu(st, p, 'mercenaire', 0); enJeu(st, p, 'golem', 1); enJeu(st, p, 'chevre', 2); enJeu(st, p, 'squelette', 2);
    for (const id of ['zombie', 'potion', 'cherubin']) enMain(st, p, id);
    for (const id of ['colosse', 'barde', 'sept_pique', 'mercenaire', 'golem', 'titan']) enDeck(st, p, id);
    st.p[p].discard.push({ uid: st.nextUid++, id: 'golem', owner: p, zone: -1, buff: 0 });
  }
  return st;
}
// Fait tourner un tour complet : fin de tour, début du suivant, puis une autre fin de tour.
function unTour(st) { endTurn(st); if (!st.over) { startTurn(st); endTurn(st); } }

describe('Aucun effet ne plante', () => {
  test('chaque carte jouable, révélée puis sur un tour complet', () => {
    for (const id of jouables) {
      for (const zone of [0, 2]) {
        const st = plateauGarni();
        assert.doesNotThrow(() => { jouer(st, 0, id, zone); unTour(st); }, `${id} (zone ${zone})`);
      }
    }
  });

  test('chaque terrain, sur les deux camps', () => {
    for (const t of Object.keys(TERRAINS)) {
      const st = plateauGarni();
      for (const p of [0, 1]) st.p[p].terrains = [t, t, t];
      assert.doesNotThrow(() => { jouer(st, 0, 'joueuse_des', 0); jouer(st, 1, 'gobelin_tricheur', 1); unTour(st); }, t);
    }
  });

  test('chaque général (hors boss), avec son pouvoir activé', () => {
    for (const [g, d] of Object.entries(GENERALS)) {
      if (d.boss) continue;
      const st = plateauGarni({ generals: [g, g] });
      assert.doesNotThrow(() => {
        if (d.onStart) d.onStart(0, st);
        if (d.activate) d.activate(0, st, 1);
        jouer(st, 0, 'joueuse_des', 0); jouer(st, 0, 'goule', 1); unTour(st);
      }, g);
    }
  });
});
