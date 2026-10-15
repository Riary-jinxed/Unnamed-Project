// Casino du Sept d'or : l'écran de l'événement du mini-set « Faites vos jeux ». Les Jetons, la machine à sous (quelques tirages par
// jour), Quitte ou double (une montée de tables contre l'IA, ouverte après la quête) et la boutique du casino.
// Le serveur fait foi (server/src/casino.js) ; les parties de Quitte ou double se jouent dans la page (solo.js) : main.js les lance
// avec gameOpts().
import { api } from './api.js';
import { esc, famStyle } from './common.js';
import { artHTML, portraitHTML } from './art.js';
import { CARDS, GENERALS, ZONE_NAMES, renderLog } from '@jeu/engine';
import { ARTS, rarityName } from '@jeu/engine/arts';
import { TITLES } from '@jeu/engine/rewards';
import { REEL, SLOT_PAYS, TABLES, QUEST_CHIPS, CONSOLATION, tableGame } from '@jeu/engine/casino';
import { t, tp, tField, locale } from '@jeu/engine/i18n';
import { themeCover } from './themes.js';
import './casino.css';

const frDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' });
// Machine à sous : hauteur d'un symbole (casino.css, --sym) et durée de rotation de chaque rouleau (ms).
const SYM = 64, SPIN_MS = [1100, 1500, 1900], STRIP = 16;
const symHTML = s => `<b class="sym ${s === '7' ? 'seven' : s === 'BAR' ? 'bar' : '♥♦'.includes(s) ? 'red' : ''}">${esc(s)}</b>`;

// app : ce que main.js prête (ui, render, call, errLine, ico, play, avatarHTML, gotArt, go : lance une table, quit, toStory).
export function createCasino(app) {
  const { ui } = app;
  const C = ui.casinoScreen = { data: null, tab: 'jeux', spin: null, note: '', result: null, from: 'home' };
  const chip = n => `<span class="num chipn">${app.ico('jeton')}${n}</span>`;
  const block = (title, body, cls = '') => `<div class="card-box ${cls}"><span class="eyebrow">${title}</span>${body}</div>`;
  const note = () => (C.note ? `<p class="hint" role="status" style="margin:0">${esc(C.note)}</p>` : '');

  // Garde à jour le résumé du compte (tuile de l'accueil, pastille de l'onglet du casino).
  function sync(D) {
    if (!D || !ui.account) return;
    const open = D.phase === 'open';
    ui.account.casino = D.phase === 'open' || D.phase === 'shop' ? { phase: D.phase, chips: D.chips, spins: open ? D.spins : 0, runs: open && D.questDone ? D.runs : 0 } : null;
  }
  async function load() {
    try { const r = await api('GET', '/api/casino', undefined, ui.auth); C.data = r.casino; sync(C.data); } catch (e) { ui.error = e.message; }
    app.render();
  }
  function open(from = 'home') {
    app.leaveGame?.(); C.from = from; C.note = ''; C.spin = null; ui.screen = 'casino'; ui.sheet = null; ui.error = ''; load(); app.render();
  }

  // ---- Machine à sous ----
  // Pendant la rotation, chaque rouleau fait défiler une bande de symboles qui finit sur le résultat ; un nouvel affichage reprend
  // l'animation là où elle en est (délai négatif).
  function reelsHTML() {
    const S = C.spin, D = C.data, last = S?.reels || D.lastSpin || ['7', '7', '7'];
    const elapsed = S ? Date.now() - S.at : 0;
    return `<div class="slotm ${S && !S.done ? 'spinning' : ''} ${S?.done && S.pay !== 'none' ? 'won' : ''} ${S?.done && S.pay === 'jackpot' ? 'jackpot' : ''}" style="--sym:${SYM}px">
      <div class="slot-lights" aria-hidden="true"></div>
      <div class="slot-reels" role="img" aria-label="${esc(last.join(' '))}">${last.map((s, i) => {
        if (!S || S.done) return `<div class="slot-reel"><div class="slot-strip">${symHTML(s)}</div></div>`;
        const strip = S.strips[i].concat(s);
        return `<div class="slot-reel"><div class="slot-strip go" style="--n:${strip.length - 1};animation-duration:${SPIN_MS[i]}ms;animation-delay:-${Math.min(elapsed, SPIN_MS[i])}ms">${strip.map(symHTML).join('')}</div></div>`;
      }).join('')}</div></div>
      <div class="slot-win ${S?.done && S.pay !== 'none' ? 'won' : ''}" role="status">${S?.done ? (S.pay === 'none' ? t('{name} : +{n} Jetons', { name: esc(t(S.name)), n: S.chips }) : t('<b>{name}</b> : +{n} Jetons !', { name: esc(t(S.name)), n: S.chips })) : S ? t('Les rouleaux tournent…') : `<span class="hint">${t('Alignez trois 7 pour le Jackpot : {n} Jetons !', { n: SLOT_PAYS[0].chips })}</span>`}</div>`;
  }
  function slotHTML() {
    const D = C.data, live = D.phase === 'open', left = D.spins;
    const pays = SLOT_PAYS.map(p => `<li><span>${esc(t(p.name))}</span><b class="num">+${p.chips}</b></li>`).join('');
    return block(t('Machine à sous'), `${reelsHTML()}
      <button class="playbtn slotbtn" data-act="casino-spin" ${!live || left <= 0 || ui.busy || (C.spin && !C.spin.done) ? 'disabled' : ''}>
        <span>${left > 0 ? t('Tirer le levier') : t('Revenez demain')}</span><small class="num">${tp(left, '{n} tirage sur {max} aujourd\'hui', '{n} tirages sur {max} aujourd\'hui', { max: D.spinMax })}</small></button>
      <details class="slot-pays"><summary>${t('Gains de la machine')}</summary><ul>${pays}</ul></details>`, 'cslot');
  }
  async function spin() {
    if (C.spin && !C.spin.done) return;
    const r = await app.call('POST', '/api/casino/spin');
    if (!r) return;
    const strips = [0, 1, 2].map(() => Array.from({ length: STRIP }, () => REEL[Math.floor(Math.random() * REEL.length)].s));
    C.spin = { ...r.spin, strips, at: Date.now(), done: false };
    app.play('dice'); app.render();
    setTimeout(() => {
      C.data = r.casino; sync(C.data); C.spin.done = true;
      app.play(r.spin.pay === 'jackpot' ? 'jackpot' : r.spin.pay === 'none' ? 'pick' : 'six');
      if (ui.screen === 'casino') app.render();
    }, SPIN_MS[2] + 150);
  }

  // ---- Quitte ou double ----
  const ladderHTML = (at, won) => `<ol class="qod-ladder">${TABLES.map((T, i) => `<li class="${i < at || (i === at && won) ? 'done' : i === at ? 'now' : ''}"><span>${esc(t(T.name))}</span><b class="num">${T.pot}</b></li>`).join('')}</ol>`;
  function tableCard(T) {
    const g = GENERALS[T.general];
    return `<div class="qod-table" style="${famStyle(g?.fam)}">
      <div class="qod-foe"><span class="gport">${portraitHTML(T.general, g?.art) || `<span class="gport-init">${esc((g?.name || '?')[0])}</span>`}</span>
        <div><small class="hint">${t('Table {n} sur {total} · {name}', { n: T.i + 1, total: TABLES.length, name: esc(t(T.table)) })}</small><b>${esc(t(T.generalName))}</b>
          <small class="hint">${t('Deck : {deck}', { deck: esc(t(T.deckName)) })}${T.bonus ? ` · ${t('zones adverses renforcées')}` : ''}</small></div></div>
      <p class="qod-rule"><b>${t('Règle de la maison : {name}', { name: esc(t(T.ruleName)) })}</b>${esc(t(T.ruleText))}</p>
      <p class="qod-pot">${t('Pot de cette table : {n}', { n: chip(T.pot) })}</p></div>`;
  }
  function qodHTML() {
    const D = C.data, R = D.run, live = D.phase === 'open';
    const intro = `<p class="hint" style="margin:0">${t('Cinq tables contre la maison, avec votre deck joué. Après chaque victoire, encaissez le pot ou remettez-le en jeu.')}</p>
      <details class="cmore"><summary>${t('Règles')}</summary><p>${t('Chaque table est plus dure et paie mieux que la précédente. Une défaite fait tout perdre, sauf {n} Jetons de consolation. Chaque table tire un adversaire parmi les decks sortis et une règle de la maison.', { n: CONSOLATION })}</p></details>`;
    if (!D.questDone) return block(t('Quitte ou double'), `${intro}<p style="margin:0"><b>${t('S\'ouvre à la fin de la quête « La Nuit du Sept d\'or ».')}</b></p>
      <button class="btn primary" data-act="casino-quest">${t('Jouer la quête')}</button>`, 'cqod locked');
    if (!R) return block(t('Quitte ou double'), `${intro}${ladderHTML(-1)}
      <button class="playbtn" data-act="casino-table" ${!live || D.runs <= 0 || ui.busy ? 'disabled' : ''}><span>${D.runs > 0 ? t('S\'asseoir à la première table') : t('Revenez demain')}</span>
        <small class="num">${tp(D.runs, '{n} montée restante aujourd\'hui', '{n} montées restantes aujourd\'hui')}</small></button>`, 'cqod');
    const T = R.table;
    if (R.state === 'choice') return block(t('Quitte ou double'), `${ladderHTML(T.i, true)}
      <p class="qod-won">${t('Table gagnée ! Il y a {n} sur le tapis.', { n: chip(R.pot) })}</p>
      ${R.next ? `<p class="hint" style="margin:0">${t('Quitte ou double : la {table} paie {n}, mais une défaite fait tout perdre.', { table: esc(t(R.next.table)), n: chip(R.next.pot) })}</p>` : ''}
      <div class="row"><button class="btn primary" data-act="casino-cash" ${ui.busy ? 'disabled' : ''}>${t('Encaisser {n}', { n: chip(R.pot) })}</button>
        <button class="btn" data-act="casino-next" ${ui.busy || !live ? 'disabled' : ''}>${t('Quitte ou double')}</button></div>`, 'cqod');
    return block(t('Quitte ou double'), `${ladderHTML(T.i)}${R.pot ? `<p class="hint" style="margin:0">${t('En jeu : {n} gagnés à la table précédente.', { n: chip(R.pot) })}</p>` : ''}${tableCard(T)}
      <button class="playbtn" data-act="casino-play" ${ui.busy || !live ? 'disabled' : ''}><span>${t('Jouer cette table')}</span><small>${t('Avec votre deck joué')}</small></button>`, 'cqod');
  }
  async function tableCall(path, body) {
    const r = await app.call('POST', path, body); if (!r) return null;
    C.data = r.casino; sync(C.data); app.render(); return r;
  }

  // ---- Boutique ----
  const KIND = { theme: t('Thème de l\'interface'), frame: t('Cadre de profil'), title: t('Titre'), shards: t('Éclats'), boosters: t('Booster'), prisms: t('Prismes'), uniEssence: t('Essence') };
  function itemVisual(x) {
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art') { const A = ARTS[id], card = A.card; return `<div class="citem-art">${artHTML(card, (CARDS[card] || GENERALS[card]).name, 1, '', id)}</div>`; }
    if (x.kind === 'theme') return `<div class="citem-art">${themeCover(id)}</div>`;
    if (x.kind === 'frame') return app.avatarHTML(ui.account, 'cav', id);
    if (x.kind === 'title') return `<span class="ctitle">${t('« {title} »', { title: esc(t(TITLES[id] || id)) })}</span>`;
    if (x.kind === 'boosters') return '<span class="bres"><span class="bpack" aria-hidden="true"></span></span>';
    const icon = { shards: 'shard', prisms: 'prism', uniEssence: 'essence' }[x.kind];
    return `<span class="bres">${app.ico(icon)}<b class="num">×${x.n}</b></span>`;
  }
  function shopHTML() {
    const D = C.data;
    const item = x => {
      const art = x.kind === 'art' ? ARTS[x.id.slice(4)] : null, cosmetic = !x.limit, soldOut = !cosmetic && x.bought >= x.limit;
      const state = x.owned ? `<span class="ok">${t('✓ Possédé')}</span>` : soldOut ? `<span class="hint">${t('Épuisé')}</span>`
        : `<button class="btn sm ${D.chips >= x.price ? 'primary' : ''}" data-act="casino-buy" data-item="${esc(x.id)}" ${ui.busy || D.chips < x.price ? 'disabled' : ''}>${app.ico('jeton')}${x.price}</button>`;
      return `<div class="citem ${x.owned ? 'owned' : ''} ${soldOut ? 'locked' : ''} k-${x.kind}">${itemVisual(x)}<b>${esc(t(x.name))}</b>
        <small class="hint">${art ? `${esc(rarityName(art))} · ${esc((CARDS[art.card] || GENERALS[art.card]).name)}` : KIND[x.kind]}${cosmetic ? '' : ` · ${t('{n}/{max} pendant l\'événement', { n: x.bought, max: x.limit })}`}</small>${state}</div>`;
    };
    const buyBtn = x => `<button class="btn sm ${D.chips >= x.price ? 'primary' : ''}" data-act="casino-buy" data-item="${esc(x.id)}" ${ui.busy || D.chips < x.price ? 'disabled' : ''}>${app.ico('jeton')}${x.price}</button>`;
    const res = x => {
      const soldOut = x.bought >= x.limit;
      return `<li class="cres ${soldOut ? 'locked' : ''}">${itemVisual(x)}<span><b>${esc(t(x.name))}</b><small class="hint">${t('{n}/{max} pendant l\'événement', { n: x.bought, max: x.limit })}</small></span>
        ${soldOut ? `<span class="hint">${t('Épuisé')}</span>` : buyBtn(x)}</li>`;
    };
    const cos = D.shop.filter(x => !x.limit), more = D.shop.filter(x => x.limit);
    return `${block(t('Exclusivités du casino'), `<p class="hint" style="margin:0">${t('Seulement ici, pendant l\'événement, et une seule fois.')}</p>
      <div class="cshop">${cos.map(item).join('')}</div>`, 'cshopbox')}
      ${block(t('Ressources'), `<ul class="creslist">${more.map(res).join('')}</ul>`, 'cshopbox')}`;
  }

  // ---- Écran ----
  function head() {
    const D = C.data, back = C.from === 'story';
    return `<div class="top">${back ? `<button class="btn icon" data-act="casino-back" aria-label="${t('Retour')}">‹</button>` : ''}<span class="title">${t('Casino')}</span>
      ${D ? `<span class="chipbal" aria-label="${t('{n} Jetons', { n: D.chips })}">${chip(D.chips)}</span>` : ''}</div>`;
  }
  // Bandeau de l'événement : temps qui reste, tirages et montées du jour, puis comment gagner des Jetons.
  function heroHTML() {
    const D = C.data, open = D.phase === 'open';
    const days = Math.max(1, Math.ceil((Date.parse(`${D.to}T23:59:59Z`) - Date.now()) / 86400000));
    const when = open ? tp(days, 'Tables ouvertes encore {n} jour, jusqu\'au {to}', 'Tables ouvertes encore {n} jours, jusqu\'au {to}', { to: esc(frDate(D.to)) })
      : t('Tables fermées. Boutique ouverte jusqu\'au {until}', { until: esc(frDate(D.shopUntil)) });
    const pill = (label, n, max, off) => `<span class="cpill ${off ? 'off' : n ? 'todo' : ''}"><small>${label}</small><b class="num">${off ? off : `${n}/${max}`}</b></span>`;
    const pills = open ? `<div class="cpills">${pill(t('Tirages'), D.spins, D.spinMax)}${pill(t('Montées'), D.runs, D.runMax, D.questDone ? '' : t('Après la quête'))}</div>` : '';
    const done = D.questDone ? QUEST_CHIPS.length : null;
    return `<div class="chero"><span class="chero-art" aria-hidden="true">7</span>
      <span class="eyebrow">${t('Événement · Faites vos jeux')}</span><b class="chero-name">${t('Casino du Sept d\'or')}</b>
      <small class="chero-when">${when}</small>${pills}
      <details class="cmore chow"><summary>${t('Comment gagner des Jetons ?')}</summary><ul>
        <li><b>${t('La quête :')}</b> ${t('{list} Jetons par chapitre, à la première victoire.', { list: QUEST_CHIPS.join(', ') })}${done ? ` <span class="ok">${t('✓ Terminée')}</span>` : ''}</li>
        <li><b>${t('La machine à sous :')}</b> ${tp(D.spinMax, '{n} tirage par jour.', '{n} tirages par jour.')}</li>
        <li><b>${t('Quitte ou double :')}</b> ${tp(D.runMax, '{n} montée par jour, après la quête.', '{n} montées par jour, après la quête.')}</li></ul>
        <p>${t('Les Jetons ne servent qu\'à la boutique du casino et disparaissent quand elle ferme, le {until}.', { until: esc(frDate(D.shopUntil)) })}</p></details></div>`;
  }
  function screen() {
    const D = C.data;
    if (!D) return `${head()}${app.errLine()}<p class="wait">${t('Chargement…')}</p>`;
    if (D.phase === 'soon' || D.phase === 'over') return `${head()}${app.errLine()}<p class="wait">${D.phase === 'soon' ? t('Le casino ouvre le {date}.', { date: esc(frDate(D.from)) }) : t('Le casino a fermé ses portes. À l\'année prochaine !')}</p>`;
    const tabs = `<div class="seg casinotabs" role="tablist">${[['jeux', t('Jeux')], ['boutique', t('Boutique')]].map(([k, l]) =>
      `<button class="${C.tab === k ? 'on' : ''}" role="tab" aria-selected="${C.tab === k}" data-act="casino-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
    const body = C.tab === 'boutique' || D.phase === 'shop' ? shopHTML() : `${slotHTML()}${qodHTML()}`;
    return `${head()}${app.errLine()}${note()}${heroHTML()}${D.phase === 'open' ? tabs : ''}${body}`;
  }

  // ---- Partie ----
  function gameOpts(name) {
    const T = C.data.run.table, g = tableGame(T);
    C.result = null;
    return { name, deck: ui.account.deck, foe: g.foe, foeName: t(T.generalName), tries: g.tries, setup: g.setup, onOver: res => over(res) };
  }
  async function over(res) {
    C.result = { pending: true, win: res.winner === 0, draw: res.winner < 0 };
    app.render();
    try {
      const r = await api('POST', '/api/casino/table/result', { win: res.winner === 0 }, ui.auth);
      C.data = r.casino; sync(C.data); C.result = { ...C.result, ...r.outcome, pending: false };
      app.play(r.outcome.win ? 'levelup' : 'pick');
    } catch (e) { C.result = { ...C.result, pending: false, error: e.message }; }
    app.render();
  }
  const label = () => { const T = C.data?.run?.table; return T ? `${t('Quitte ou double')} · ${T.i + 1}/${TABLES.length}` : t('Quitte ou double'); };
  function endHTML(v) {
    const r = v.result, s = v.seat, R = C.result || { pending: true };
    const zs = [0, 1, 2].map(z => `<div class="${v.me.zonePower[z] > v.foe.zonePower[z] ? 'me' : v.me.zonePower[z] < v.foe.zonePower[z] ? 'foe' : ''}"><div class="eyebrow">${t(ZONE_NAMES[z])}</div>${t('<b>{me}</b> contre {foe}', { me: v.me.zonePower[z], foe: v.foe.zonePower[z] })}</div>`).join('');
    const win = r.winner === s, reason = esc(renderLog(r.reason, s, v.names));
    const status = R.pending ? `<p class="hint" style="margin:0">${t('Le croupier compte les jetons…')}</p>`
      : R.error ? `<p class="hint" style="margin:0">${esc(R.error)}</p>`
        : !R.win ? `<p style="margin:0">${R.lost ? t('Vous perdez les {n} Jetons en jeu. Lot de consolation : +{c} Jetons.', { n: R.lost, c: R.chips }) : t('Lot de consolation : +{c} Jetons.', { c: R.chips })}</p>`
          : R.top ? `<p class="qod-won">${t('Vous avez fait sauter la table de Fortuna : +{n} Jetons !', { n: R.chips })}</p>`
            : `<p class="qod-won">${t('{n} Jetons sur le tapis. Encaissez-les, ou tentez la table suivante.', { n: R.pot })}</p>`;
    const choice = !R.pending && R.win && !R.top && !R.error;
    return `<div class="sheet"><div class="panel end send ${win ? 'win' : ''}"><span class="eyebrow">${esc(label())}</span>
      <h2>${win ? t('Table gagnée') : r.winner < 0 ? t('Égalité : la maison gagne') : t('Défaite')}</h2>
      <p style="margin:0">${reason}.</p><div class="zs">${zs}</div>${status}
      <div class="row">${choice ? `<button class="btn primary" data-act="casino-cash">${t('Encaisser {n}', { n: R.pot })}</button><button class="btn" data-act="casino-next">${t('Quitte ou double')}</button>`
        : `<button class="btn primary" data-act="casino-home" ${R.pending ? 'disabled' : ''}>${t('Retour au casino')}</button>`}<button class="btn" data-act="log">${t('Voir le journal')}</button></div></div></div>`;
  }

  // ---- Clics ----
  function click(a, ds) {
    if (a === 'casino') open(ds.from || (ui.screen === 'story' ? 'story' : 'home'));
    else if (a === 'casino-back') { if (C.from === 'story') app.toStory(); else { ui.screen = 'home'; app.render(); } }
    else if (a === 'casino-tab') { C.tab = ds.tab === 'boutique' ? 'boutique' : 'jeux'; app.play('pick'); app.render(); }
    else if (a === 'casino-spin' && !ui.busy) spin();
    else if (a === 'casino-quest') app.toStory();
    else if (a === 'casino-table' && !ui.busy) tableCall('/api/casino/table');
    else if (a === 'casino-play' && !ui.busy) { if (!ui.account.deck) { ui.error = t('Il vous faut un deck joué complet.'); app.render(); } else app.go(); }
    else if (a === 'casino-cash' && !ui.busy) { const inGame = ui.screen === 'game'; tableCall('/api/casino/table/choice', { go: false }).then(r => { if (r) { C.note = t('+{n} Jetons encaissés.', { n: r.outcome.cashed }); app.play('levelup'); if (inGame) app.quit(); } }); }
    else if (a === 'casino-next' && !ui.busy) { const inGame = ui.screen === 'game'; tableCall('/api/casino/table/choice', { go: true }).then(r => { if (r && inGame) app.quit(); }); }
    else if (a === 'casino-home') app.quit();
    else if (a === 'casino-buy' && !ui.busy) buy(ds.item);
    else return false;
    return true;
  }
  async function buy(item) {
    C.note = '';
    const r = await app.call('POST', '/api/casino/buy', { item });
    if (r) { C.data = r.casino; C.note = r.msg ? tField(r, 'msg') : ''; app.play('reveal'); if (r.got?.art) app.gotArt?.(r.got.art); }
    app.render();
  }

  return {
    screen, click, endHTML, gameOpts, label, open, reload: load,
    // Tuile de l'accueil pendant l'événement : Jetons, tirages et montées qui restent.
    tile(account) {
      const c = account.casino; if (!c) return '';
      const todo = c.spins + c.runs;
      return `<button class="tile ctile ${todo ? 'todo' : ''}" data-act="casino" data-from="home"><span class="ctile-art" aria-hidden="true">7 7 7</span>
        <span class="eyebrow">${c.phase === 'open' ? t('Événement · Casino') : t('Boutique du casino')}</span><b>${t('Casino du Sept d\'or')}</b>
        <span class="tile-foot num">${chip(c.chips)}${c.spins ? ` · ${tp(c.spins, '{n} tirage', '{n} tirages')}` : ''}${c.runs ? ` · ${tp(c.runs, '{n} montée', '{n} montées')}` : ''}</span></button>`;
    },
    stop() { Object.assign(C, { data: null, spin: null, result: null, note: '' }); },
  };
}
