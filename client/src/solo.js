// Partie contre l'IA : le même moteur tourne directement dans le navigateur.
import { DECKS, newGame, startTurn, runTurn, aiPlan, viewFor, pick } from '@jeu/engine';

// deck : le deck du joueur { name, cards, terrains, general } ; l'IA prend un deck préconstruit au hasard.
export function startSolo(handlers, { name, deck }) {
  const names = [name, 'IA'];
  let st, ready = false, stopped = false;
  const emit = flash => !stopped && handlers.onView(viewFor(st, 0, { flash, ready: { me: ready, foe: true }, names, connected: [true, true] }));
  function begin() { st = newGame(deck, pick(Object.keys(DECKS)), names, { generals: [deck.general, null] }); startTurn(st); st.phase = 'plan'; ready = false; emit(null); }
  begin();
  return {
    async submit(plan) {
      if (ready || st.over) return;
      ready = true; emit(null);
      const ai = aiPlan(st, 1, 250);
      await runTurn(st, [plan, ai], emit, ms => new Promise(r => setTimeout(r, ms)));
      ready = false; emit(null);
      // Fin de partie : résultat envoyé au serveur pour les statistiques.
      if (st.over && !stopped && handlers.onSoloOver) handlers.onSoloOver({ winner: st.result.winner, reason: st.result.reason, played: st.p[0].played,
        ai: { deckKey: st.p[1].deckKey, general: st.p[1].general, played: st.p[1].played } });
    },
    rematch: begin,
    leave() { stopped = true; },
  };
}
