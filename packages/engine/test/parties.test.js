// Parties complètes IA contre IA avec chaque deck préconstruit : elles vont au bout, sans effet en erreur, et les règles
// de base tiennent à chaque tour (7 cartes en main au plus, 4 cartes par zone au plus, sceaux jamais négatifs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, HAND_MAX, SLOTS, newGame, startTurn, aiPlan, runTurn } from '../src/engine.js';

const keys = Object.keys(DECKS);

test('chaque deck joue des parties complètes, dans les deux sièges', async () => {
  const erreurs = [];
  const err = console.error;
  console.error = (...a) => erreurs.push(a.map(String).join(' '));
  try {
    for (let round = 1; round <= 2; round++) {
      for (let i = 0; i < keys.length; i++) {
        const a = keys[i], b = keys[(i + round) % keys.length];
        const st = newGame(a, b); startTurn(st);
        let tours = 0;
        while (!st.over) {
          await runTurn(st, [aiPlan(st, 0, 20), aiPlan(st, 1, 20)], () => {}, async () => {});
          assert.ok(++tours <= 10, `${a} contre ${b} : la partie ne finit pas`);
          for (const P of st.p) {
            assert.ok(P.hand.length <= HAND_MAX, `${a} contre ${b} : ${P.hand.length} cartes en main`);
            for (const z of P.board) assert.ok(z.length <= SLOTS, `${a} contre ${b} : ${z.length} cartes dans une zone`);
            assert.ok(P.seals >= 0, `${a} contre ${b} : sceaux négatifs`);
          }
        }
        assert.equal(st.turn, 7, `${a} contre ${b}`);
        assert.ok([-1, 0, 1].includes(st.result.winner));
      }
    }
  } finally { console.error = err; }
  assert.deepEqual(erreurs, [], 'effets en erreur pendant les parties');
});
