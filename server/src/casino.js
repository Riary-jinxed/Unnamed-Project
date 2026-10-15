// Événement du casino du Sept d'or (packages/engine/src/casino.js) : Jetons, machine à sous, Quitte ou double et boutique.
// Les dates sont celles de la quête « casino » (document « quetes », réglé dans /admin). Compte : casino = { ev (début de l'événement :
// un nouvel événement repart de zéro), chips, spin { day, used, last }, runs { day, used }, run (montée en cours), buys { objet: n } }.
// Comme les chapitres d'histoire, les parties de Quitte ou double se jouent dans la page et leur résultat est cru sur parole ; le
// serveur tire les adversaires et les règles, tient le pot et limite les montées par jour.
import { DECKS, GENERALS } from '@jeu/engine';
import { today, aiDeckKeys } from '@jeu/engine/collection';
import { questCfg } from '@jeu/engine/story';
import { TITLES, FRAMES } from '@jeu/engine/rewards';
import { THEMES } from '@jeu/engine/themes';
import { CASINO_QUEST, QUEST_CHIPS, SLOT_PULLS, spinReels, slotPay, TABLE_RUNS, CONSOLATION, TABLES, RULES, tablePot, drawTable,
  CASINO_SHOP, casinoItem, isCasinoCosmetic, itemKey, itemReady, casinoPhase, shopUntil } from '@jeu/engine/casino';
import { HttpError } from './accounts.js';
import { tr, msg } from '@jeu/engine/i18n';
import { langOf } from './i18n.js';

const now = () => new Date().toISOString();

export function createCasino(store, accounts) {
  const progress = accounts.progress;
  const cfg = () => questCfg(CASINO_QUEST, store.doc('quetes') || {});
  const phase = () => casinoPhase(cfg(), today());
  // État du joueur pour l'événement en cours (un événement plus ancien est oublié, Jetons compris).
  function state(a) {
    const ev = cfg().from;
    if (a.casino?.ev !== ev) a.casino = { ev, chips: 0, spin: null, runs: null, run: null, buys: {} };
    return a.casino;
  }
  const questDone = a => (a.story?.[CASINO_QUEST] || 0) >= QUEST_CHIPS.length;
  const spinsLeft = C => SLOT_PULLS - (C.spin?.day === today() ? C.spin.used : 0);
  const runsLeft = C => TABLE_RUNS - (C.runs?.day === today() ? C.runs.used : 0);
  const need = (ok, text) => { if (!ok) throw new HttpError(409, text); };
  const open = () => need(phase() === 'open', phase() === 'shop' ? msg('Le casino a fermé ses tables : seule la boutique est encore ouverte.') : msg('Le casino n\'est pas ouvert.'));

  // ---- Boutique ----
  function owns(a, x) {
    const id = itemKey(x), cos = a.cosmetics || {};
    return x.kind === 'art' ? !!a.arts?.[id] : x.kind === 'title' ? !!cos.titles?.includes(id) : x.kind === 'frame' ? !!cos.frames?.includes(id) : x.kind === 'theme' ? !!cos.themes?.includes(id) : false;
  }
  const shopView = (a, C) => CASINO_SHOP.filter(itemReady).map(x => ({ ...x, bought: C.buys[x.id] || 0, owned: isCasinoCosmetic(x) && owns(a, x) }));
  async function buy(a, { item }) {
    const p = phase(); need(p === 'open' || p === 'shop', msg('La boutique du casino est fermée.'));
    const x = casinoItem(String(item || '')); if (!x || !itemReady(x)) throw new HttpError(400, msg('Objet inconnu.'));
    const C = state(a);
    if (isCasinoCosmetic(x)) need(!owns(a, x), msg('Vous l\'avez déjà.'));
    else need((C.buys[x.id] || 0) < x.limit, msg('Déjà acheté {n} fois pendant cet événement.', { n: x.limit }));
    need(C.chips >= x.price, msg('Il vous faut {price} Jetons (vous en avez {have}).', { price: x.price, have: C.chips }));
    if (!a.level) progress.init(a);
    C.chips -= x.price; C.buys[x.id] = (C.buys[x.id] || 0) + 1;
    const id = itemKey(x);
    if (x.kind === 'art') a.arts = { ...(a.arts || {}), [id]: { at: now(), casino: true } };
    else if (isCasinoCosmetic(x)) progress.grant(a, { [x.kind]: id }, { silent: true });
    else if (x.kind === 'uniEssence') a.uniEssence = (a.uniEssence || 0) + x.n;
    else progress.grant(a, { [x.kind]: x.n }, { silent: true });
    progress.check(a);
    await store.put(a);
    const label = { title: TITLES, frame: FRAMES, theme: THEMES }[x.kind]?.[id];
    return { ...view(a), account: accounts.me(a), msg: tr(langOf(a), '{name} : à vous !', { name: tr(langOf(a), x.name) }),
      got: x.kind === 'art' ? { art: id } : isCasinoCosmetic(x) ? { [x.kind]: id, label } : null };
  }

  // ---- Machine à sous ----
  async function spin(a) {
    open(); need(a.starter, msg('Choisissez d\'abord votre deck de départ.'));
    const C = state(a); need(spinsLeft(C) > 0, msg('Plus de tirage aujourd\'hui : revenez demain !'));
    const reels = spinReels(), pay = slotPay(reels);
    C.spin = { day: today(), used: (C.spin?.day === today() ? C.spin.used : 0) + 1, last: reels };
    C.chips += pay.chips;
    await store.put(a);
    return { ...view(a), spin: { reels, pay: pay.id, name: pay.name, chips: pay.chips } };
  }

  // ---- Quitte ou double ----
  const tableInfo = T => ({ i: T.i, deck: T.deck, deckName: DECKS[T.deck].name, general: T.general, generalName: GENERALS[T.general]?.name || T.general,
    rule: T.rule, ruleName: RULES[T.rule].name, ruleText: RULES[T.rule].text, pot: tablePot(T.i, T.rule), table: TABLES[T.i].name, bonus: TABLES[T.i].bonus || null, tries: TABLES[T.i].tries });
  async function tableStart(a) {
    open(); need(a.starter, msg('Choisissez d\'abord votre deck de départ.'));
    need(questDone(a), msg('Finissez d\'abord la quête « La Nuit du Sept d\'or ».'));
    const C = state(a);
    if (C.run) return { ...view(a) };
    need(runsLeft(C) > 0, msg('Plus de montée aujourd\'hui : revenez demain !'));
    C.runs = { day: today(), used: (C.runs?.day === today() ? C.runs.used : 0) + 1 };
    C.run = { table: drawTable(0, aiDeckKeys()), pot: 0, state: 'play' };
    await store.put(a);
    return view(a);
  }
  async function tableResult(a, { win }) {
    open(); const C = state(a), R = C.run; need(R && R.state === 'play', msg('Pas de table en cours.'));
    if (!win) {
      const lost = R.pot; C.run = null; C.chips += CONSOLATION;
      await store.put(a);
      return { ...view(a), outcome: { win: false, lost, chips: CONSOLATION } };
    }
    R.pot = tablePot(R.table.i, R.table.rule);
    if (R.table.i === TABLES.length - 1) { C.chips += R.pot; C.run = null; await store.put(a); return { ...view(a), outcome: { win: true, top: true, chips: R.pot } }; }
    R.state = 'choice';
    await store.put(a);
    return { ...view(a), outcome: { win: true, pot: R.pot } };
  }
  async function tableChoice(a, { go }) {
    open(); const C = state(a), R = C.run; need(R && R.state === 'choice', msg('Rien à encaisser pour le moment.'));
    if (go) { R.table = drawTable(R.table.i + 1, aiDeckKeys()); R.state = 'play'; await store.put(a); return view(a); }
    const chips = R.pot; C.chips += chips; C.run = null;
    await store.put(a);
    return { ...view(a), outcome: { cashed: chips } };
  }

  // ---- Quête : les chapitres de « La Nuit du Sept d'or » donnent aussi des Jetons (appelé par story.js, première victoire) ----
  function onChapter(a, q, i) {
    if (q.id !== CASINO_QUEST || phase() !== 'open' || !QUEST_CHIPS[i]) return {};
    state(a).chips += QUEST_CHIPS[i];
    return { chips: QUEST_CHIPS[i] };
  }

  // ---- Vue ----
  function view(a) {
    const c = cfg(), p = phase(), C = state(a), R = C.run;
    return { casino: { phase: p, from: c.from, to: c.to, shopUntil: c.to ? shopUntil(c) : null, chips: C.chips, questDone: questDone(a),
      spins: spinsLeft(C), spinMax: SLOT_PULLS, lastSpin: C.spin?.day === today() ? C.spin.last : null,
      runs: runsLeft(C), runMax: TABLE_RUNS, run: R ? { state: R.state, pot: R.pot, table: tableInfo(R.table), next: R.state === 'choice' && R.table.i + 1 < TABLES.length ? { i: R.table.i + 1, table: TABLES[R.table.i + 1].name, pot: TABLES[R.table.i + 1].pot } : null } : null,
      shop: shopView(a, C) } };
  }
  // Tuile de l'accueil : pendant l'événement, les tirages qui restent.
  function tile(a) {
    const p = phase(); if (!a.starter || (p !== 'open' && p !== 'shop')) return null;
    const C = state(a);
    return { phase: p, chips: C.chips, spins: p === 'open' ? spinsLeft(C) : 0, runs: p === 'open' && questDone(a) ? runsLeft(C) : 0 };
  }

  return {
    onChapter, tile,
    routes: {
      'GET /api/casino': a => view(a),
      'POST /api/casino/spin': a => spin(a),
      'POST /api/casino/table': a => tableStart(a),
      'POST /api/casino/table/result': (a, body) => tableResult(a, body || {}),
      'POST /api/casino/table/choice': (a, body) => tableChoice(a, body || {}),
      'POST /api/casino/buy': (a, body) => buy(a, body || {}),
    },
  };
}
