// Tutoriel : des leçons, chacune une partie contre l'IA jouée dans la page, avec des decks, des pioches et des terrains fixés,
// et des étapes de guidage affichées au-dessus de la main (bulle du guide, et sur PixiJS l'écran assombri autour de l'élément
// à toucher, avec une main qui montre le geste : stage-coach.js). Ni statistiques ni récompenses.
import { CARDS, newGame, startTurn, runTurn, viewFor } from '@jeu/engine';

// Sélecteurs partagés par les étapes.
const card = id => `[data-hand][data-id="${id}"]`;
const zone = z => `.board > .zone[data-z="${z}"]`;
const ZONES = '.board > .zone';
const GO = '[data-act="go"]';

// ---- Initiation : premier lancement guidé ----
// Une partie de 4 tours, sans terrain ni général, avec une seule idée par tour : poser une carte, gagner 2 zones,
// dépenser ses sceaux, frapper fort au dernier tour. L'adversaire joue peu, pour que le joueur gagne s'il suit le guide.
const INITIATION = {
  title: 'Initiation', turns: 4, bare: true,
  me: { general: 'erudit', hand: 3, order: ['cherubin', 'mercenaire', 'chevalier', 'golem', 'eclaireuse', 'barde', 'archere', 'gardien'], terrains: [] },
  foe: { general: 'cartographe', hand: 3, order: ['eclaireuse', 'mercenaire', 'barde', 'chevalier', 'golem', 'potion', 'cerf'], terrains: [],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 1]], 3: [['barde', 2]], 4: [['chevalier', 0]] } },
  steps: [
    { info: true, hl: '.board', text: 'Bienvenue ! Je suis Séraphine, je vais vous guider. Pour gagner, remportez **2 zones sur 3** à la fin du dernier tour.' },
    { hl: t => [card('cherubin'), ZONES], drag: () => [card('cherubin'), zone(1)], done: t => t.pend('cherubin'),
      text: 'Faites glisser le Chérubin sur une zone. Son coût est en haut à gauche, sa puissance en haut à droite.' },
    { go: true, text: 'Votre carte reste cachée jusqu\'à la révélation. Validez le tour.' },

    { info: true, turn: 2, hl: '.board .score', text: 'Les chiffres de chaque zone : la puissance de l\'adversaire, puis la vôtre. Le plus fort gagne la zone.' },
    { hl: t => [card('mercenaire'), ...t.zonesWithout('cherubin').map(zone)], drag: t => [card('mercenaire'), zone(t.zonesWithout('cherubin')[0])],
      done: t => t.apart('mercenaire', 'cherubin'),
      text: t => (t.pend('mercenaire') ? 'Il vous faut 2 zones : touchez le Mercenaire pour le reprendre, puis posez-le ailleurs.'
        : 'Chaque tour donne un sceau de plus. Posez le Mercenaire dans une **autre zone** que le Chérubin.') },
    { go: true, text: 'Validez le tour.' },

    { turn: 3, hl: () => ['#hand', '.dock .tseals'], done: t => t.sealsLeft() === 0,
      text: t => (t.ui.pending.length ? `Il vous reste ${t.sealsLeft()} sceau${t.sealsLeft() > 1 ? 'x' : ''} : posez une autre carte.`
        : '3 sceaux ce tour : posez **une ou plusieurs cartes**, jusqu\'à ne plus avoir de sceau.') },
    { go: true, text: 'Tous vos sceaux sont dépensés. Validez le tour.' },

    { turn: 4, hl: t => [card('golem'), zone(t.weakest())], drag: t => [card('golem'), zone(t.weakest())], done: t => t.pend('golem'),
      text: 'Dernier tour ! Le Golem frappe fort : posez-le dans la zone **la plus disputée**.' },
    { go: true, text: 'Validez : celui qui gagne 2 zones sur 3 remporte la partie.' },
  ],
  end: 'Initiation terminée : vous savez jouer ! Les leçons, dans « Apprendre » sur l\'accueil, vous montreront les effets, les déplacements et les généraux.',
};

// ---- Partie guidée : les règles en entier, sur 7 tours ----
const FULL = {
  title: 'Partie guidée', turns: 7,
  // Joueur : cartes dans l'ordre de pioche (les premières forment la main de départ, Érudit compris).
  me: {
    general: 'erudit', hand: 4,
    order: ['cherubin', 'mercenaire', 'recruteur', 'potion', 'archere', 'golem', 'feu_follet', 'chevalier', 'barde', 'gardien', 'archange', 'messagere', 'heraut', 'juge', 'eclaireuse'],
    terrains: [{ t: 'sanctuaire', z: 1, turn: 1 }, { t: 'ruines', z: 2, turn: 2 }, { t: 'champ', z: 0, turn: 3 }],
  },
  // Adversaire : il joue toujours les mêmes cartes, dans les mêmes zones, pour que chaque leçon se passe comme prévu.
  foe: {
    general: 'cartographe', hand: 3,
    order: ['eclaireuse', 'mercenaire', 'chevalier', 'golem', 'barde', 'potion', 'archere', 'sylvain', 'cerf', 'garde_pont', 'titan', 'dominion'],
    terrains: [{ t: 'forteresse', z: 0, turn: 1 }, { t: 'sanctuaire', z: 2, turn: 2 }],
    plays: { 1: [['eclaireuse', 0]], 2: [['mercenaire', 2]], 3: [['chevalier', 1]], 4: [['golem', 0]], 5: [['archere', 2], ['barde', 1]], 6: [['sylvain', 1], ['potion', 1]], 7: [['cerf', 0], ['garde_pont', 2]] },
  },
  steps: [
    { info: true, hl: '.board', text: 'Bienvenue ! Une partie dure 7 tours, sur 3 zones : Gauche, Centre et Droite. Pour gagner, remportez au moins 2 zones sur 3 à la fin du tour 7.' },
    { info: true, hl: '.board .score', text: 'Dans chaque zone, l\'adversaire joue en haut et vous en bas. Les deux chiffres au milieu sont la puissance totale de chaque camp : le plus fort gagne la zone.' },
    { info: true, hl: '.terrain.set.me', text: 'Aux tours 1, 2 et 3, chacun révèle un terrain. Le vôtre, le Sanctuaire, donne +2 à votre zone Centre. Touchez deux fois un terrain pour lire son effet.' },
    { info: true, hl: '.dock .tseals', text: 'Chaque tour vous donne des sceaux pour poser des cartes : 1 au tour 1, 2 au tour 2, et ainsi de suite. Vos sceaux sont en bas de l\'écran.' },
    { hl: card('cherubin'), tap: () => card('cherubin'), done: t => t.sel('cherubin') || t.pend('cherubin'),
      text: 'Touchez le Chérubin dans votre main. Son coût, 1 sceau, est en haut à gauche ; sa puissance, 1, en haut à droite.' },
    { hl: () => ['[data-act="zplay"]', '.zone.target'], tap: () => zone(1), done: t => t.pend('cherubin'),
      text: t => (t.sel('cherubin') ? 'Choisissez la zone où le poser, le Centre par exemple.' : 'Touchez le Chérubin dans votre main, puis une zone.') },
    { go: true,
      text: 'Votre carte est posée face cachée : l\'adversaire ne la verra qu\'à la révélation, comme vous ne voyez pas les siennes. Touchez Valider le tour.' },

    { info: true, turn: 2, hl: '.mc[data-id="cherubin"]',
      text: 'Votre Chérubin est passé à 2. « Grâce » est un mot-clé : en fin de tour, si vous avez dépensé tous vos sceaux, il gagne +1. Le Codex, sur l\'accueil, explique tous les mots-clés.' },
    { hl: card('mercenaire'), drag: t => [card('mercenaire'), zone(t.zonesWithout('cherubin')[0])], done: t => t.apart('mercenaire', 'cherubin'),
      text: t => (t.pend('mercenaire') ? 'Le Mercenaire est dans la même zone que le Chérubin. Touchez-le pour le reprendre en main, puis posez-le ailleurs.'
        : 'Tour 2 : vous avez pioché une carte et vous avez 2 sceaux. Posez le Mercenaire, de puissance 3, dans une autre zone que le Chérubin : il faut gagner 2 zones.') },
    { go: true, text: 'Validez le tour.' },

    { turn: 3, hl: card('recruteur'), done: t => t.pend('recruteur'),
      text: 'Tour 3, 3 sceaux : vous pouvez poser plusieurs cartes tant qu\'il vous reste des sceaux. Posez le Recruteur. Son effet « Révélation » se déclenchera quand il sera révélé.' },
    { hl: card('potion'), drag: t => [card('potion'), zone(t.zoneOf('recruteur'))], done: t => t.together('potion', 'recruteur'),
      text: t => (t.pend('potion') ? 'Posez la Potion dans la même zone que le Recruteur : touchez-la pour la reprendre en main.'
        : 'Il vous reste 1 sceau : posez la Potion de force dans la zone du Recruteur. Un sort agit à la révélation, puis part à la défausse.') },
    { go: true, text: 'Vous avez dépensé tous vos sceaux. Validez le tour.' },

    { info: true, turn: 4, hl: '.mc[data-id="horde"]',
      text: 'Le Recruteur a créé une Horde de puissance 2 : c\'est un jeton, une créature créée par un effet. La Potion a donné +2 à votre créature la plus forte de sa zone.' },
    { hl: () => [card('archere'), card('feu_follet')], done: t => t.pend('archere') && t.pend('feu_follet'),
      text: 'Tour 4. L\'Archère des cimes et le Feu follet sont « Déplaçables » : une fois en jeu, ils pourront changer de zone. Posez-les tous les deux.' },
    { go: true, text: 'Validez le tour.' },

    { turn: 5, hl: '.mc[data-mobile]', done: t => t.ui.moves.length > 0,
      text: t => (t.ui.moveSel !== null ? 'Touchez maintenant la zone où l\'envoyer.'
        : 'Tour 5. Vos créatures marquées ⇄ peuvent changer de zone. Touchez-en une, puis une autre zone : elle y passe aussitôt et libère sa place pour une nouvelle carte.') },
    { info: true, hl: '.pbar.me .gencard',
      text: 'Votre général est à droite de votre bandeau : touchez-le deux fois pour lire son effet. L\'Érudit vous a fait piocher une carte de plus en début de partie ; d\'autres s\'activent une fois par partie.' },
    { free: true, text: 'À vous de jouer : posez d\'autres cartes si vous voulez, puis validez. Le Journal raconte tout ce qui s\'est passé.' },
    { free: true, turn: 6, text: 'Plus que deux tours. Regardez où vous perdez et renforcez les zones que vous pouvez encore gagner.' },
    { free: true, turn: 7, text: 'Dernier tour : à la fin, celui qui gagne 2 zones sur 3 remporte la partie.' },
  ],
  end: 'Tutoriel terminé : vous connaissez les bases. Le codex, dans « Apprendre » sur l\'accueil, explique tous les autres mots-clés.',
};

// Leçons proposées dans « Apprendre », dans l'ordre. L'initiation est lancée seule au premier lancement.
export const LESSONS = {
  initiation: { ...INITIATION, blurb: '4 tours · poser ses cartes et gagner 2 zones' },
  complet: { ...FULL, blurb: '7 tours · terrains, effets, déplacements et généraux' },
};
for (const l of Object.values(LESSONS)) l.steps.forEach((s, i) => { s.turn = s.turn || (i ? l.steps[i - 1].turn : 1); });

const deckOf = (s, name) => ({ name, cards: s.order, terrains: s.terrains.map(x => x.t), general: s.general });
// Remet le deck dans l'ordre voulu (newGame mélange) et fixe la main de départ et les terrains.
function arrange(P, s) {
  const all = [...P.hand, ...P.deck];
  const cards = s.order.map(id => all.splice(all.findIndex(c => c.id === id), 1)[0]);
  P.hand = cards.slice(0, s.hand); P.deck = cards.slice(s.hand);
  P.terrainPlan = s.terrains.map(x => ({ ...x }));
}
export function tutorialGame(names, lesson = LESSONS.complet) {
  const st = newGame(deckOf(lesson.me, 'Tutoriel'), deckOf(lesson.foe, 'Entraînement'), names, { generals: [lesson.me.general, lesson.foe.general], turns: lesson.turns });
  arrange(st.p[0], lesson.me); arrange(st.p[1], lesson.foe);
  startTurn(st); st.phase = 'plan';
  return st;
}
// Plan de l'adversaire pour le tour en cours.
function foePlan(st, lesson) {
  const hand = st.p[1].hand.slice(), cards = [];
  for (const [id, z] of lesson.foe.plays[st.turn] || []) { const i = hand.findIndex(c => c.id === id); if (i >= 0) cards.push({ uid: hand.splice(i, 1)[0].uid, zone: z }); }
  return { cards, moves: [], general: null };
}

// ---- Étapes ----
// Chaque étape a un texte (ou une fonction qui le donne) et :
// - hl : ce qu'il faut mettre en valeur, un sélecteur CSS ou une fonction qui renvoie une liste de sélecteurs ;
// - drag (glisser une carte de la main vers une zone) ou tap (toucher) : le geste que la main du guide montre ;
// - info : un bouton Suivant ;
// - done(t) : l'étape passe seule quand la condition est remplie ;
// - go : étape « Valider le tour », qui suit toujours l'étape d'action du tour (si celle-ci est défaite, le guide y revient) ;
// - free : jeu libre ;
// - turn : tour où commence l'étape (sinon celui de l'étape précédente).
// Le bouton Valider n'est ouvert qu'aux étapes go et free.
const REVEAL = 'Révélation : les cartes des deux camps se retournent une à une, le joueur qui mène d\'abord.';

// Contrôleur de partie (comme startSolo) et guide. handlers : ceux de main.js (onView).
export function startTutorial(handlers, { name, lesson: key = 'complet' }) {
  const lesson = LESSONS[key] || LESSONS.complet, STEPS = lesson.steps;
  const names = [name, 'Entraîneur'];
  let st, ready = false, stopped = false, step = 0;
  const emit = flash => !stopped && handlers.onView(viewFor(st, 0, { flash, ready: { me: ready, foe: true }, names, connected: [true, true], bare: !!lesson.bare }));
  function begin() { st = tutorialGame(names, lesson); ready = false; step = 0; emit(null); }
  begin();
  // Outils des conditions d'étape, à partir de l'état de l'appli.
  const tools = ui => {
    const v = ui.view, pending = id => ui.pending.find(p => p.id === id);
    const zoneOf = id => { const p = pending(id); if (p) return p.zone; return v.me.board.findIndex(col => col.some(c => c.id === id)); };
    return {
      ui, zoneOf,
      sel: id => ui.sel !== null && v.me.hand.find(c => c.uid === ui.sel)?.id === id,
      pend: id => !!pending(id),
      apart: (a, b) => !!pending(a) && zoneOf(a) !== zoneOf(b),
      together: (a, b) => !!pending(a) && zoneOf(a) === zoneOf(b),
      // Zones où la carte n'est pas (pour en poser une autre ailleurs).
      zonesWithout: id => [0, 1, 2].filter(z => z !== zoneOf(id)),
      // Zone où l'écart avec l'adversaire est le pire.
      weakest: () => [0, 1, 2].reduce((a, z) => (v.foe.zonePower[z] - v.me.zonePower[z] > v.foe.zonePower[a] - v.me.zonePower[a] ? z : a), 0),
      sealsLeft: () => v.me.seals - ui.pending.reduce((n, p) => n + (v.me.hand.find(c => c.uid === p.uid)?.cost || 0), 0),
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
  const list = x => (x == null ? [] : typeof x === 'string' ? [x] : x);
  return {
    lesson: key,
    async submit(plan) {
      if (ready || st.over) return;
      ready = true; emit(null);
      await runTurn(st, [plan, foePlan(st, lesson)], emit, ms => new Promise(r => setTimeout(r, ms)));
      ready = false; emit(null);
    },
    rematch: begin,
    leave() { stopped = true; },
    // Ce que le guide affiche : { text, hl, info, drag, tap, step, steps } ou null.
    // hl : liste de sélecteurs ; drag : [d'où, vers où] ; tap : sélecteur.
    coach(ui) {
      const v = ui.view; if (!v || v.phase === 'over') return null;
      if (v.phase === 'reveal' || v.ready.me) return { text: REVEAL, hl: [] };
      const s = sync(ui); if (!s || s.turn > v.turn) return null;
      const t = tools(ui), val = x => (typeof x === 'function' ? x(t) : x);
      return {
        text: val(s.text), info: !!s.info, step: step + 1, steps: STEPS.length,
        hl: s.go ? [GO] : list(val(s.hl)), tap: s.go ? GO : val(s.tap) || null, drag: s.go ? null : val(s.drag) || null,
      };
    },
    next() { if (STEPS[step]?.info) step++; },
    // Le bouton Valider n'est ouvert qu'aux étapes « Valider » et en jeu libre.
    canSubmit(ui) { const s = sync(ui); return !s || s.free || s.go; },
    endText: lesson.end,
  };
}
