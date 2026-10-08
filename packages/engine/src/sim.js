// Simulation IA contre IA pour l'équilibrage : node packages/engine/src/sim.js [parties par duel] [generaux]
// Sans option : chaque deck avec son général par défaut. Avec « generaux » : chaque général mène le deck de sa famille,
// contre tous les decks, pour comparer les généraux entre eux.
import { DECKS, GENERALS, newGame, startTurn, aiPlan, runTurn } from './engine.js';

const N = +process.argv[2] || 40;
const byGeneral = process.argv[3] === 'generaux';
const keys = Object.keys(DECKS);
const famDeck = fam => keys.find(k => DECKS[k].fam === fam);

async function play(a, b, ga, gb) {
  const st = newGame(a, b, undefined, { generals: [ga, gb] }); startTurn(st);
  while (!st.over) await runTurn(st, [aiPlan(st, 0, 80), aiPlan(st, 1, 80)], () => {}, async () => {});
  return st.result.winner;
}

const res = {};
if (!byGeneral) {
  for (const a of keys) {
    const row = {};
    let w = 0, n = 0;
    for (const b of keys) {
      let v = 0;
      for (let g = 0; g < N; g++) { const r = await play(a, b); if (r === 0) v++; else if (r < 0) v += 0.5; }
      row[DECKS[b].name] = `${Math.round(100 * v / N)} %`;
      if (a !== b) { w += v; n += N; }
    }
    row['Global'] = `${Math.round(100 * w / n)} %`;
    res[DECKS[a].name] = row;
  }
  console.log('Taux de victoire du deck en ligne contre le deck en colonne :');
} else {
  for (const g of Object.keys(GENERALS)) {
    const a = famDeck(GENERALS[g].fam) || keys[0];
    let w = 0, n = 0;
    for (const b of keys) for (let i = 0; i < N; i++) { const r = await play(a, b, g); if (r === 0) w++; else if (r < 0) w += 0.5; n++; }
    res[GENERALS[g].name] = { deck: DECKS[a].name, victoires: `${Math.round(100 * w / n)} %` };
  }
}
console.table(res);
