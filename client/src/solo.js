// Partie contre l'IA : le même moteur tourne directement dans le navigateur.
import { newGame, startTurn, runTurn, aiSearch, viewFor, pick } from '@jeu/engine';
import { aiDeckKeys } from '@jeu/engine/collection';
import { aiReply } from '@jeu/engine/emotes';

// L'IA essaie 250 plans au hasard et garde le meilleur. Elle les essaie pendant que le joueur prépare son tour,
// par petites tranches entre deux images : valider ne bloque plus l'écran le temps qu'elle réfléchisse.
const TRIES = 250, SLICE = 10;

// deck : le deck du joueur { name, cards, terrains, general } ; l'IA prend un deck préconstruit au hasard.
export function startSolo(handlers, { name, deck }) {
  const names = [name, 'IA'];
  let st, ready = false, stopped = false, think = null;
  const emit = flash => !stopped && handlers.onView(viewFor(st, 0, { flash, ready: { me: ready, foe: true }, names, connected: [true, true] }));
  // Réflexion de l'IA pour le tour en cours. La partie ne change pas pendant la préparation : le plan reste valable.
  function startThinking() {
    const job = think = { plan: null, value: -Infinity, left: TRIES };
    const slice = () => {
      if (think !== job || stopped || job.left <= 0) return;
      const n = Math.min(SLICE, job.left), r = aiSearch(st, 1, n); job.left -= n;
      if (r.value > job.value) { job.value = r.value; job.plan = r.plan; }
      if (job.left > 0) setTimeout(slice, 0);
    };
    setTimeout(slice, 0);
  }
  // Plan de l'IA au moment où le joueur valide : ce qui reste à essayer est fait tout de suite (joueur très rapide).
  function aiTurn() {
    const job = think; think = null;
    if (job.left > 0) { const r = aiSearch(st, 1, job.left); if (r.value > job.value) job.plan = r.plan; }
    return job.plan;
  }
  function begin() { st = newGame(deck, pick(aiDeckKeys()), names, { generals: [deck.general, null] }); startTurn(st); st.phase = 'plan'; ready = false; emit(null); startThinking(); }
  begin();
  return {
    async submit(plan) {
      if (ready || st.over) return;
      ready = true; emit(null);
      const ai = aiTurn();
      await runTurn(st, [plan, ai], emit, ms => new Promise(r => setTimeout(r, ms)));
      ready = false; emit(null);
      if (!st.over) startThinking();
      // Fin de partie : résultat envoyé au serveur pour les statistiques.
      if (st.over && !stopped && handlers.onSoloOver) handlers.onSoloOver({ winner: st.result.winner, reason: st.result.reason, zones: st.result.zones, played: st.p[0].played,
        ai: { deckKey: st.p[1].deckKey, general: st.p[1].general, played: st.p[1].played } });
    },
    // Émote du joueur : montrée tout de suite ; l'IA répond parfois aux politesses.
    emote(id) {
      handlers.onEmote?.(0, id);
      const reply = aiReply(id);
      if (reply) setTimeout(() => { if (!stopped) handlers.onEmote?.(1, reply); }, 1200 + Math.random() * 800);
    },
    rematch: begin,
    leave() { stopped = true; },
  };
}
