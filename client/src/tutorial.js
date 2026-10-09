// Tutoriel : une partie contre l'IA jouée dans la page, avec des decks, des pioches et des terrains fixés,
// et des étapes de guidage affichées au-dessus de la main (coach). Ni statistiques ni récompenses.
import { CARDS, newGame, startTurn, runTurn, viewFor } from '@jeu/engine';

// Joueur : cartes dans l'ordre de pioche (les premières forment la main de départ, Érudit compris).
const ME = {
  general: 'erudit', hand: 4,
  order: ['cherubin', 'mercenaire', 'recruteur', 'potion', 'archere', 'golem', 'feu_follet', 'chevalier', 'barde', 'gardien', 'archange', 'messagere', 'heraut', 'juge', 'eclaireuse'],
  terrains: [{ t: 'sanctuaire', z: 1, turn: 1 }, { t: 'ruines', z: 2, turn: 2 }, { t: 'champ', z: 0, turn: 3 }],
};
// Adversaire : il joue toujours les mêmes cartes, dans les mêmes zones, pour que chaque leçon se passe comme prévu.
const FOE = {
  general: 'cartographe', hand: 3,
  order: ['eclaireuse', 'mercenaire', 'chevalier', 'golem', 'barde', 'potion', 'archere', 'sylvain', 'cerf', 'garde_pont', 'titan', 'dominion'],
  terrains: [{ t: 'forteresse', z: 0, turn: 1 }, { t: 'sanctuaire', z: 2, turn: 2 }],
  plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 2]], 3: [['chevalier', 1]], 4: [['golem', 0]], 5: [['archere', 2], ['barde', 1]], 6: [['sylvain', 1], ['potion', 1]], 7: [['cerf', 0], ['garde_pont', 2]] },
};
const deckOf = (s, name) => ({ name, cards: s.order, terrains: s.terrains.map(x => x.t), general: s.general });
// Remet le deck dans l'ordre voulu (newGame mélange) et fixe la main de départ et les terrains.
function arrange(P, s) {
  const all = [...P.hand, ...P.deck];
  const cards = s.order.map(id => all.splice(all.findIndex(c => c.id === id), 1)[0]);
  P.hand = cards.slice(0, s.hand); P.deck = cards.slice(s.hand);
  P.terrainPlan = s.terrains.map(x => ({ ...x }));
}
export function tutorialGame(names) {
  const st = newGame(deckOf(ME, 'Tutoriel'), deckOf(FOE, 'Entraînement'), names, { generals: [ME.general, FOE.general] });
  arrange(st.p[0], ME); arrange(st.p[1], FOE);
  startTurn(st); st.phase = 'plan';
  return st;
}
// Plan de l'adversaire pour le tour en cours.
export function foePlan(st) {
  const hand = st.p[1].hand.slice(), cards = [];
  for (const [id, zone] of FOE.plays[st.turn] || []) { const i = hand.findIndex(c => c.id === id); if (i >= 0) cards.push({ uid: hand.splice(i, 1)[0].uid, zone }); }
  return { cards, moves: [], general: null };
}

// ---- Étapes ----
// Chaque étape a un texte (ou une fonction qui le donne), un élément à mettre en valeur (hl, sélecteur CSS) et :
// - info : un bouton Suivant ;
// - done(t) : l'étape passe seule quand la condition est remplie ;
// - go : étape « Valider le tour », qui suit toujours l'étape d'action du tour (si celle-ci est défaite, le guide y revient) ;
// - free : jeu libre ;
// - turn : tour où commence l'étape (sinon celui de l'étape précédente).
// Le bouton Valider n'est ouvert qu'aux étapes go et free.
const NAME = id => CARDS[id].name;
const STEPS = [
  { info: true, hl: '.board', text: 'Bienvenue ! Une partie dure 7 tours, sur 3 zones : Gauche, Centre et Droite. Pour gagner, remportez au moins 2 zones sur 3 à la fin du tour 7.' },
  { info: true, hl: '.score', text: 'Dans chaque zone, l\'adversaire joue en haut et vous en bas. Les deux chiffres au milieu sont la puissance totale de chaque camp : le plus fort gagne la zone.' },
  { info: true, hl: '.terrain.set.me', text: 'Aux tours 1, 2 et 3, chacun révèle un terrain. Le vôtre, le Sanctuaire, donne +2 à votre zone Centre. Touchez un terrain pour lire son effet.' },
  { info: true, hl: '.tseals', text: 'Chaque tour vous donne des sceaux pour poser des cartes : 1 au tour 1, 2 au tour 2, et ainsi de suite. Vos sceaux sont en bas de l\'écran.' },
  { hl: '[data-hand][data-id="cherubin"]', done: t => t.sel('cherubin') || t.pend('cherubin'),
    text: 'Touchez le Chérubin dans votre main. Son coût, 1 sceau, est en haut à gauche ; sa puissance, 1, en haut à droite.' },
  { hl: '[data-act="zplay"], .zone.target', done: t => t.pend('cherubin'),
    text: t => (t.sel('cherubin') ? 'Choisissez la zone où le poser, le Centre par exemple.' : 'Touchez le Chérubin dans votre main, puis une zone.') },
  { go: true,
    text: 'Votre carte est posée face cachée : l\'adversaire ne la verra qu\'à la révélation, comme vous ne voyez pas les siennes. Touchez Valider le tour.' },

  { info: true, turn: 2, hl: '.mc[data-id="cherubin"]',
    text: 'Votre Chérubin est passé à 2. « Grâce » est un mot-clé : en fin de tour, si vous avez dépensé tous vos sceaux, il gagne +1. Le Codex, sur l\'accueil, explique tous les mots-clés.' },
  { hl: '[data-hand][data-id="mercenaire"]', done: t => t.apart('mercenaire', 'cherubin'),
    text: t => (t.pend('mercenaire') ? 'Le Mercenaire est dans la même zone que le Chérubin. Touchez-le pour le reprendre en main, puis posez-le ailleurs.'
      : 'Tour 2 : vous avez pioché une carte et vous avez 2 sceaux. Posez le Mercenaire, de puissance 3, dans une autre zone que le Chérubin : il faut gagner 2 zones.') },
  { go: true, text: 'Validez le tour.' },

  { turn: 3, hl: '[data-hand][data-id="recruteur"]', done: t => t.pend('recruteur'),
    text: 'Tour 3, 3 sceaux : vous pouvez poser plusieurs cartes tant qu\'il vous reste des sceaux. Posez le Recruteur. Son effet « Révélation » se déclenchera quand il sera révélé.' },
  { hl: '[data-hand][data-id="potion"]', done: t => t.together('potion', 'recruteur'),
    text: t => (t.pend('potion') ? 'Posez la Potion dans la même zone que le Recruteur : touchez-la pour la reprendre en main.'
      : 'Il vous reste 1 sceau : posez la Potion de force dans la zone du Recruteur. Un sort agit à la révélation, puis part à la défausse.') },
  { go: true, text: 'Vous avez dépensé tous vos sceaux. Validez le tour.' },

  { info: true, turn: 4, hl: '.mc[data-id="horde"]',
    text: 'Le Recruteur a créé une Horde de puissance 2 : c\'est un jeton, une créature créée par un effet. La Potion a donné +2 à votre créature la plus forte de sa zone.' },
  { hl: '[data-hand][data-id="archere"], [data-hand][data-id="feu_follet"]', done: t => t.pend('archere') && t.pend('feu_follet'),
    text: 'Tour 4. L\'Archère des cimes et le Feu follet sont « Déplaçables » : une fois en jeu, ils pourront changer de zone. Posez-les tous les deux.' },
  { go: true, text: 'Validez le tour.' },

  { turn: 5, hl: '.mc[data-mobile]', done: t => t.ui.moves.length > 0,
    text: t => (t.ui.moveSel !== null ? 'Touchez maintenant la zone où l\'envoyer.'
      : 'Tour 5. Vos créatures marquées ⇄ peuvent changer de zone. Touchez-en une, puis une autre zone : elle s\'y déplacera à la révélation, avant vos nouvelles cartes.') },
  { info: true, hl: '.pbar.me .gencard',
    text: 'Votre général est à droite de votre bandeau : touchez-le pour lire son effet. L\'Érudit vous a fait piocher une carte de plus en début de partie ; d\'autres s\'activent une fois par partie.' },
  { free: true, text: 'À vous de jouer : posez d\'autres cartes si vous voulez, puis validez. Le Journal raconte tout ce qui s\'est passé.' },
  { free: true, turn: 6, text: 'Plus que deux tours. Regardez où vous perdez et renforcez les zones que vous pouvez encore gagner.' },
  { free: true, turn: 7, text: 'Dernier tour : à la fin, celui qui gagne 2 zones sur 3 remporte la partie.' },
];
STEPS.forEach((s, i) => { s.turn = s.turn || (i ? STEPS[i - 1].turn : 1); });
const REVEAL = 'Révélation : les cartes des deux camps se retournent une à une, le joueur qui mène d\'abord.';

// Contrôleur de partie (comme startSolo) et guide. handlers : ceux de main.js (onView).
export function startTutorial(handlers, { name }) {
  const names = [name, 'Entraîneur'];
  let st, ready = false, stopped = false, step = 0;
  const emit = flash => !stopped && handlers.onView(viewFor(st, 0, { flash, ready: { me: ready, foe: true }, names, connected: [true, true] }));
  function begin() { st = tutorialGame(names); ready = false; step = 0; emit(null); }
  begin();
  // Outils des conditions d'étape, à partir de l'état de l'appli.
  const tools = ui => {
    const pending = id => ui.pending.find(p => p.id === id);
    const zoneOf = id => { const p = pending(id); if (p) return p.zone; return ui.view.me.board.findIndex(col => col.some(c => c.id === id)); };
    return {
      ui,
      sel: id => ui.sel !== null && ui.view.me.hand.find(c => c.uid === ui.sel)?.id === id,
      pend: id => !!pending(id),
      apart: (a, b) => !!pending(a) && zoneOf(a) !== zoneOf(b),
      together: (a, b) => !!pending(a) && zoneOf(a) === zoneOf(b),
    };
  };
  // Étape en cours : passe celles qui sont faites ou d'un tour déjà joué, revient à l'action du tour si elle a été défaite.
  function sync(ui) {
    const v = ui.view, t = tools(ui);
    for (;;) {
      const s = STEPS[step]; if (!s) return null;
      if (v.turn > s.turn) { step++; continue; }
      if (s.done && v.phase === 'plan' && s.done(t)) { step++; continue; }
      if (s.go && !STEPS[step - 1].done(t)) { step--; continue; }
      return s;
    }
  }
  return {
    async submit(plan) {
      if (ready || st.over) return;
      ready = true; emit(null);
      await runTurn(st, [plan, foePlan(st)], emit, ms => new Promise(r => setTimeout(r, ms)));
      ready = false; emit(null);
    },
    rematch: begin,
    leave() { stopped = true; },
    // Ce que le guide affiche : { text, hl, info } ou null.
    coach(ui) {
      const v = ui.view; if (!v || v.phase === 'over') return null;
      if (v.phase === 'reveal' || v.ready.me) return { text: REVEAL };
      const s = sync(ui); if (!s || s.turn > v.turn) return null;
      return { text: typeof s.text === 'function' ? s.text(tools(ui)) : s.text, hl: s.go ? '[data-act="go"]' : s.hl, info: !!s.info };
    },
    next() { if (STEPS[step]?.info) step++; },
    // Le bouton Valider n'est ouvert qu'aux étapes « Valider » et en jeu libre.
    canSubmit(ui) { const s = sync(ui); return !s || s.free || s.go; },
  };
}
