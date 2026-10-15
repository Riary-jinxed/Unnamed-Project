// Outils des tests : une partie vide et contrôlée (mains, decks et plateaux vides, aucun terrain prévu, général sans effet),
// où l'on pose les cartes voulues, puis on les révèle comme en vraie partie.
import assert from 'node:assert/strict';
import { newGame, placeHidden, revealSteps, doStep, power, zonePower, CARDS } from '../src/engine.js';

const DECK_TEST = { name: 'Test', cards: Array(15).fill('mercenaire'), terrains: ['sanctuaire', 'ruines', 'champ'], general: 'cartographe' };

export function partie({ seals = 10, generals = ['cartographe', 'cartographe'], turn = 1 } = {}) {
  const st = newGame(DECK_TEST, DECK_TEST, ['A', 'B'], { generals });
  st.turn = turn; st.leader = 0;
  for (const P of st.p) { P.hand = []; P.deck = []; P.terrainPlan = []; P.seals = seals; }
  return st;
}

const carte = (st, p, id) => {
  assert.ok(CARDS[id], `carte inconnue : ${id}`);
  return { uid: st.nextUid++, id, owner: p, zone: -1, buff: 0, revealed: false };
};
// Carte déjà en jeu, face visible (sans effet Révélation).
export function enJeu(st, p, id, z, buff = 0) {
  const c = carte(st, p, id); Object.assign(c, { zone: z, revealed: true, order: st.order++, enteredTurn: st.turn, buff });
  st.p[p].board[z].push(c); return c;
}
export function enMain(st, p, id) { const c = carte(st, p, id); st.p[p].hand.push(c); return c; }
export function enDeck(st, p, id) { const c = carte(st, p, id); st.p[p].deck.push(c); return c; }
// Pose la carte face cachée puis résout la révélation (sacrifice, Révélation, sorts…), comme pendant un tour.
export function jouer(st, p, id, z) {
  const c = enMain(st, p, id);
  assert.ok(placeHidden(st, p, c.uid, z), `${id} n'a pas pu être posée`);
  for (const s of revealSteps(st, [null, null])) doStep(st, s);
  return c;
}
export const pw = (st, c) => power(st, c);
export const zp = (st, p, z) => zonePower(st, p, z);
export const ids = list => list.map(c => c.id);
