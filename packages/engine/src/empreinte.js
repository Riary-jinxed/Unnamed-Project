// Empreinte du moteur : parties IA contre IA avec un hasard fixé d'avance, résumées en une empreinte.
// Une optimisation ou un nettoyage du moteur ne doit pas la changer ; un changement de règle ou de carte, si.
// node packages/engine/src/empreinte.js [tours de 144 parties, 1 par défaut]
import { createHash } from 'node:crypto';

// Hasard reproductible (mulberry32), installé avant de charger le moteur.
let seed = 12345;
Math.random = () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const { DECKS, GENERALS, newGame, startTurn, aiPlan, runTurn, viewFor } = await import('./engine.js');

const rounds = +process.argv[2] || 1, keys = Object.keys(DECKS), gens = Object.keys(GENERALS);
const hash = createHash('sha256'), t0 = Date.now();
let n = 0;
for (let r = 0; r < rounds; r++) for (const a of keys) for (const b of keys) {
  // Premier tour : généraux par défaut des decks ; tours suivants : généraux variés.
  const generals = r ? [gens[(n * 7) % gens.length], gens[(n * 11 + 3) % gens.length]] : [];
  n++;
  const st = newGame(a, b, ['A', 'B'], { generals }); startTurn(st);
  while (!st.over) {
    const plans = [aiPlan(st, 0, 60), aiPlan(st, 1, 60)];
    hash.update(JSON.stringify(plans));
    await runTurn(st, plans, flash => hash.update(`${JSON.stringify(viewFor(st, 0))}${JSON.stringify(viewFor(st, 1))}${flash}`), async () => {});
  }
  hash.update(JSON.stringify(st));
}
console.log(`${n} parties, empreinte ${hash.digest('hex').slice(0, 16)} (${Date.now() - t0} ms)`);
