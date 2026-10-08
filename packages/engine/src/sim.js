// Simulation IA contre IA pour l'équilibrage : node packages/engine/src/sim.js [parties par duel]
import { DECKS, newGame, startTurn, aiPlan, runTurn } from './engine.js';

const N = +process.argv[2] || 40;
const keys = Object.keys(DECKS);
const res = {};
for (const a of keys) for (const b of keys) {
  const k = `${DECKS[a].name} contre ${DECKS[b].name}`; res[k] = { victoires: 0, défaites: 0, nuls: 0 };
  for (let g = 0; g < N; g++) {
    const st = newGame(a, b); startTurn(st);
    while (!st.over) await runTurn(st, [aiPlan(st, 0, 80), aiPlan(st, 1, 80)], () => {}, async () => {});
    const w = st.result.winner; res[k][w === 0 ? 'victoires' : w === 1 ? 'défaites' : 'nuls']++;
  }
}
console.table(res);
