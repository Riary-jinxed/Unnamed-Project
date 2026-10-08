// Appli web : accueil, salon en ligne, partie (en ligne ou contre l'IA).
import './style.css';
import { CARDS, GENERALS, TERRAINS, DECKS, FAMILIES, SLOTS, ZONE_NAMES, renderLog } from '@jeu/engine';
import { connectOnline } from './net.js';
import { startSolo } from './solo.js';

const FAM = { 'Ange': '--f-ange', 'Démon': '--f-demon', 'Gobelin': '--f-gobelin', 'Elfe': '--f-elfe', 'Dragon': '--f-dragon' };
const famVar = kw => `--fam: var(${FAM[kw[0]] || '--f-neutre'})`;
const kwLine = d => (d.token ? 'Jeton · ' : '') + (d.kw.join(' · ') || 'Neutre');
const typeName = d => d.type === 'C' ? 'Créature' : 'Sort';
const costLabel = (d, cost) => d.x ? 'X' : cost ?? d.cost;
const genLine = g => `${g.fam || 'Générique'} · ${g.kind}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('jeu-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jeu-' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

const params = new URLSearchParams(location.search);
const savedDeck = store.get('deck', 'ange'), savedGen = store.get('general', '');
const ui = {
  screen: 'home', name: store.get('name', ''), deck: DECKS[savedDeck] ? savedDeck : 'ange', general: GENERALS[savedGen] ? savedGen : '', joinCode: (params.get('code') || '').toUpperCase(),
  ctrl: null, mode: null, view: null, room: null, lobbyNames: [], error: '',
  pending: [], moves: [], moveSel: null, genZone: null, genMode: false, sel: null, focus: null, msg: '', sheet: null, lastTurn: 0, rematchAsked: false,
};
const app = document.getElementById('app');

// ---- Contrôleurs (en ligne / IA) ----
const handlers = {
  onLobby(m) { ui.screen = 'lobby'; ui.room = m.room; ui.lobbyNames = m.names; ui.error = ''; store.set('session', { room: m.room, token: m.token }); render(); },
  onView(view, room) {
    if (room) ui.room = room;
    if (view.phase !== 'plan' || view.turn !== ui.lastTurn) { ui.pending = []; ui.moves = []; ui.moveSel = null; ui.genZone = null; ui.genMode = false; ui.sel = null; }
    if (view.phase === 'plan' && view.turn !== ui.lastTurn) ui.msg = '';
    ui.lastTurn = view.turn; ui.view = view; ui.screen = 'game';
    if (view.phase === 'over' && !ui.sheet) { ui.sheet = 'end'; }
    if (view.phase !== 'over') { ui.rematchAsked = false; if (ui.sheet === 'end') ui.sheet = null; }
    render();
  },
  onError(msg) { ui.error = msg; render(); },
  onGone() { store.set('session', null); ui.screen = 'home'; ui.error = 'La partie a expiré.'; ui.ctrl = null; render(); },
  onLeft() { store.set('session', null); ui.screen = 'home'; ui.error = 'Votre adversaire a quitté la partie.'; ui.ctrl = null; render(); },
};
function goOnline(action) {
  const name = ui.name.trim() || 'Joueur';
  store.set('name', name); store.set('deck', ui.deck); store.set('general', ui.general);
  ui.mode = 'online'; ui.error = '';
  const general = ui.general || null;
  ui.ctrl = connectOnline(handlers, action === 'create' ? { t: 'create', name, deck: ui.deck, general } : { t: 'join', room: ui.joinCode, name, deck: ui.deck, general });
}
function goSolo() {
  const name = ui.name.trim() || 'Joueur';
  store.set('name', name); store.set('deck', ui.deck); store.set('general', ui.general);
  ui.mode = 'solo'; ui.sheet = null; ui.lastTurn = 0;
  ui.ctrl = startSolo(handlers, { name, deck: ui.deck, general: ui.general || null });
}

// ---- Calculs locaux pendant la planification ----
const me = () => ui.view.me;
const myGen = () => GENERALS[me().general];
const genCost = () => (ui.genZone !== null ? myGen().activateCost || 0 : 0);
const handCost = uid => { const c = me().hand.find(x => x.uid === uid); return c ? c.cost : 0; };
// Sceaux restants après le général et les cartes posées, dans l'ordre de pose (un coût X prend tout ce qui reste).
function planCosts() {
  let s = me().seals - genCost(); const costs = {};
  for (const p of ui.pending) { const c = CARDS[p.id].x ? Math.max(0, s) : handCost(p.uid); costs[p.uid] = c; s -= c; }
  return { left: s, costs };
}
const sealsLeft = () => planCosts().left;
const freeSlots = z => SLOTS - me().board[z].length - ui.pending.filter(p => p.zone === z).length - ui.moves.filter(m => m.zone === z).length;
const moveOf = uid => ui.moves.find(m => m.uid === uid);
const handLeft = () => me().hand.filter(c => !ui.pending.some(p => p.uid === c.uid));
const canPlay = () => ui.view && ui.view.phase === 'plan' && !ui.view.ready.me;

// ---- Rendu ----
function miniCard(c, opts = {}) {
  if (c.hidden) return `<div class="mc back" aria-label="Carte cachée"></div>`;
  const d = CARDS[c.id]; const pw = c.revealed ? c.power : (opts.power ?? d.power);
  const cls = c.revealed ? (pw > d.power ? 'up' : pw < d.power ? 'down' : '') : '';
  const mv = opts.mine && moveOf(c.uid);
  const mobile = opts.mine && c.mobile && canPlay();
  return `<div class="mc ${opts.pending || !c.revealed ? 'pending' : ''} ${mobile ? 'mobile' : ''} ${ui.moveSel === c.uid ? 'msel' : ''} ${mv ? 'moving' : ''} ${ui.view.flash === c.uid ? 'flash' : ''}" style="${famVar(d.kw)}"
    data-card="${c.uid}" data-id="${c.id}" ${opts.pending ? 'data-pending="1"' : ''} ${mobile ? 'data-mobile="1"' : ''} title="${esc(d.name)}">
    ${mv ? `<span class="mv">→ ${ZONE_NAMES[mv.zone]}</span>` : mobile ? '<span class="mv" aria-label="Déplaçable">⇄</span>' : ''}
    <span class="n">${esc(d.name)}</span>${d.type === 'C' ? `<span class="p num ${cls}">${pw}</span>` : `<span class="p" style="font-size:12px">Sort</span>`}</div>`;
}
function slots(side, z, isMe) {
  const cards = side.board[z].map(c => miniCard(c, { mine: isMe }));
  if (isMe) for (const p of ui.pending.filter(p => p.zone === z)) cards.push(miniCard({ uid: p.uid, id: p.id, revealed: false }, { pending: true }));
  if (isMe) for (const m of ui.moves.filter(m => m.zone === z)) cards.push(`<div class="slot" title="Emplacement réservé pour un déplacement"></div>`);
  let h = ''; for (let i = 0; i < SLOTS; i++) h += cards[i] || `<div class="slot"></div>`;
  return `<div class="slots">${h}</div>`;
}
function terrainChip(side, z, isMe) {
  const t = side.terrains[z];
  const soon = isMe && side.terrainPlan && side.terrainPlan.find(x => x.z === z);
  if (!t && soon) return `<button class="terrain soon" data-terrain="${soon.t}">Tour ${soon.turn} : ${TERRAINS[soon.t].name}</button>`;
  if (!t) return `<div class="terrain">${ui.view.turn < 3 ? 'Terrain à venir' : '—'}</div>`;
  return `<button class="terrain set ${isMe ? 'me' : 'foe'}" data-terrain="${t}">${TERRAINS[t].name}</button>`;
}
function infoHTML() {
  const f = ui.focus, v = ui.view;
  if (ui.msg) return `<div class="hint">${esc(ui.msg)}</div>`;
  if (ui.genMode) return `<div class="hint">Touchez la zone où activer votre général.</div>`;
  if (ui.moveSel !== null) return `<div class="hint">Touchez la zone vers laquelle déplacer ${esc(CARDS[me().board.flat().find(c => c.uid === ui.moveSel)?.id]?.name || 'cette créature')}. Le déplacement se fait à la révélation.</div>`;
  if (v.phase === 'plan' && v.ready.me) return `<div class="wait">Tour validé. En attente de ${esc(v.foe.name)}…</div>`;
  if (!f) return `<div class="hint">Touchez une carte de votre main, puis une de vos zones pour la poser. Touchez une carte posée ce tour pour la reprendre. Une créature marquée ⇄ peut changer de zone.</div>`;
  if (f.kind === 'card') { const d = CARDS[f.id];
    return `<div class="h"><b>${esc(d.name)}</b><span class="meta">${typeName(d)} · coût ${d.x ? 'X' : d.cost}${d.type === 'C' ? ` · puissance ${d.power}` : ''} · ${kwLine(d)}</span></div><div>${d.text || 'Pas d\'effet.'}</div>`; }
  if (f.kind === 'terrain') { const t = TERRAINS[f.id]; return `<div class="h"><b>${t.name}</b><span class="meta">Terrain</span></div><div>${t.text}</div>`; }
  if (f.kind === 'general') { const g = GENERALS[f.id]; return `<div class="h"><b>${g.name}</b><span class="meta">Général · ${genLine(g)}</span></div><div>${g.text}</div>`; }
  return '';
}
function pbar(side, isMe, connected) {
  const g = GENERALS[side.general];
  return `<div class="pbar ${isMe ? 'me' : 'foe'}"><span class="who">${isMe ? 'Vous' : esc(side.name)} · ${DECKS[side.deckKey].name}</span>
    ${!isMe && ui.mode === 'online' ? `<span class="dot ${connected ? '' : 'off'}" title="${connected ? 'Connecté' : 'Déconnecté'}"></span>` : ''}
    <button class="chip ${g.activate && side.generalUsed ? 'used' : ''}" data-general="${side.general}">${g.name}</button>
    <span class="num">Main ${side.handCount}</span><span class="num">Deck ${side.deckCount}</span>
    ${side.treasure ? `<span class="num" title="Sceaux non dépensés aux tours précédents">Trésor ${side.treasure}</span>` : ''}
    ${side.perfectTurns ? `<span class="num" title="Tours finis avec tous les sceaux dépensés">Grâce ${side.perfectTurns}</span>` : ''}
    ${!isMe && ui.view.phase === 'plan' && ui.view.ready.foe ? '<span class="chip">Prêt</span>' : ''}</div>`;
}
function renderGame() {
  const v = ui.view, m = v.me, f = v.foe, g = GENERALS[m.general];
  const play = canPlay();
  let board = '';
  for (const z of [0, 1, 2]) {
    const a = f.zonePower[z], b = m.zonePower[z];
    const mz = ui.moveSel !== null ? me().board.findIndex(col => col.some(c => c.uid === ui.moveSel)) : -1;
    const target = play && (ui.genMode || (ui.sel && freeSlots(z) > 0) || (ui.moveSel !== null && z !== mz && freeSlots(z) > 0));
    board += `<div class="zone ${target ? 'target' : ''}" data-z="${z}" ${target ? 'tabindex="0" role="button"' : ''} aria-label="Zone ${ZONE_NAMES[z]}">
      ${terrainChip(f, z, false)}${slots(f, z, false)}
      <div class="score"><span class="v foe ${a > b ? 'lead' : ''}">${a}</span><span class="zn">${ZONE_NAMES[z]}</span><span class="v me ${b > a ? 'lead' : ''}">${b}</span></div>
      ${slots(m, z, true)}${terrainChip(m, z, true)}
      ${ui.genZone === z ? `<div class="gmark">Général activé ici</div>` : ''}</div>`;
  }
  const planning = v.phase === 'plan';
  const seals = planning ? sealsLeft() : m.seals;
  const hand = (planning ? handLeft() : m.hand).map(c => { const d = CARDS[c.id];
    const cant = d.x ? seals <= 0 : c.cost > seals;
    const pcls = c.power > d.power ? 'up' : c.power < d.power ? 'down' : '';
    return `<button class="hc ${ui.sel === c.uid ? 'sel' : ''} ${cant ? 'cant' : ''}" style="${famVar(d.kw)}" data-hand="${c.uid}" data-id="${c.id}">
      <span class="top2"><span class="seal">${costLabel(d, c.cost)}</span><span class="t">${typeName(d)}</span></span>
      <span class="n">${esc(d.name)}</span><span class="k">${kwLine(d)}</span>${d.type === 'C' ? `<span class="p num ${pcls}">${c.power}</span>` : ''}</button>`; }).join('');
  const canGen = play && g.activate && !m.generalUsed && (ui.genZone !== null || sealsLeft() >= (g.activateCost || 0));
  const goLabel = v.phase === 'reveal' ? 'Révélation…' : v.ready.me ? 'En attente…' : v.turn === v.turns ? 'Valider le dernier tour' : 'Valider le tour';
  return `
  <div class="top"><span class="title">${ui.mode === 'online' ? `Partie ${esc(ui.room || '')}` : 'Contre l\'IA'}</span>
    <span class="turnbox"><span>Tour <b class="num">${v.turn}</b>/${v.turns}</span><span>Sceaux <b class="num">${seals}</b>/${v.turn}</span></span>
    <button class="btn" data-act="log">Journal</button><button class="btn" data-act="set">Cartes</button></div>
  ${pbar(f, false, v.connected[1 - v.seat])}
  <div class="board">${board}</div>
  ${pbar(m, true, true)}
  <div class="info" aria-live="polite">${infoHTML()}</div>
  <div class="hand" id="hand">${hand || '<span class="empty">Main vide.</span>'}</div>
  <div class="actions">
    ${g.activate ? `<button class="btn ${ui.genMode || ui.genZone !== null ? 'on' : ''}" data-act="gen" ${canGen ? '' : 'disabled'}>${ui.genZone !== null ? 'Annuler le général' : m.generalUsed ? 'Général utilisé' : `Activer le général${g.activateCost ? ` (${g.activateCost} sceau)` : ''}`}</button>` : ''}
    <button class="btn" data-act="quit">Quitter</button>
    <button class="btn primary grow" data-act="go" ${play ? '' : 'disabled'}>${goLabel}</button>
  </div>`;
}
function deckPicker() {
  return `<div class="decks">${Object.keys(DECKS).map(k => { const d = DECKS[k], g = GENERALS[d.general];
    return `<button class="deckopt ${ui.deck === k ? 'sel' : ''}" data-deck="${k}"><span class="eyebrow">${d.fam}</span><h3>${d.name}</h3>
      <small>Général conseillé : ${g.name}</small></button>`; }).join('')}</div>`;
}
function generalPicker() {
  const def = DECKS[ui.deck].general, cur = GENERALS[ui.general || def];
  const opt = k => `<option value="${k}" ${ui.general === k ? 'selected' : ''}>${GENERALS[k].name} (${GENERALS[k].fam || 'générique'})</option>`;
  return `<div class="field genbox"><label class="eyebrow" for="general">Votre général</label>
    <select id="general"><option value="" ${ui.general ? '' : 'selected'}>Général conseillé : ${GENERALS[def].name}</option>${Object.keys(GENERALS).map(opt).join('')}</select>
    <small>${cur.kind} : ${cur.text}</small></div>`;
}
function renderHome() {
  return `
  <div class="top"><span class="title">Jeu de cartes</span><button class="btn" data-act="set">Voir les cartes</button></div>
  <div class="setup">
    <div class="field"><label class="eyebrow" for="name">Votre pseudo</label><input id="name" maxlength="20" autocomplete="nickname" value="${esc(ui.name)}" placeholder="Votre pseudo"></div>
    <div class="field"><span class="eyebrow">Votre deck</span>${deckPicker()}</div>
    ${generalPicker()}
    ${ui.error ? `<p class="err">${esc(ui.error)}</p>` : ''}
    <div class="card-box">
      <h2 style="font-size:22px">Jouer avec un ami</h2>
      <div class="row"><button class="btn primary" data-act="create">Créer une partie</button></div>
      <div class="or">ou rejoindre avec un code</div>
      <div class="row"><div class="field" style="flex:1"><label class="eyebrow" for="code">Code de la partie</label>
        <input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(ui.joinCode)}" placeholder="ABCD"></div>
        <button class="btn" data-act="join" style="align-self:end">Rejoindre</button></div>
    </div>
    <div class="row"><button class="btn" data-act="solo">Jouer contre l'IA</button></div>
  </div>`;
}
function renderLobby() {
  const link = `${location.origin}${location.pathname}?code=${ui.room}`;
  return `
  <div class="top"><span class="title">Partie en attente</span></div>
  <div class="card-box" style="text-align:center;justify-items:center">
    <span class="eyebrow">Code à donner à votre ami</span>
    <span class="code">${esc(ui.room)}</span>
    <p class="hint" style="margin:0">Ou envoyez-lui ce lien :</p>
    <input id="link" readonly value="${esc(link)}" style="width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:var(--r);background:var(--bg);color:var(--ink)">
    <button class="btn" data-act="copy">Copier le lien</button>
    <p class="wait">La partie commence dès que votre ami rejoint.</p>
    <button class="btn" data-act="quit">Annuler</button>
  </div>`;
}
function fullCard(id) { const d = CARDS[id];
  return `<div class="fc" style="${famVar(d.kw)}"><div class="h"><b>${esc(d.name)}</b><span class="seal">${d.x ? 'X' : d.cost}</span></div>
    <span class="k">${typeName(d)} · ${kwLine(d)}</span><span class="x">${d.text || 'Pas d\'effet.'}</span>${d.type === 'C' ? `<span class="p num">${d.power}</span>` : ''}</div>`; }
const genCard = k => { const g = GENERALS[k]; return `<div class="fc" style="${famVar([g.fam])}"><b>${g.name}</b><span class="k">Général · ${g.kind}</span><span class="x">${g.text}</span></div>`; };
const terrainCard = k => { const t = TERRAINS[k]; return `<div class="fc" style="${famVar([t.fam])}"><b>${t.name}</b><span class="k">Terrain</span><span class="x">${t.text}</span></div>`; };
function sheetHTML() {
  if (ui.sheet === 'log' && ui.view) {
    const names = ui.view.names;
    const lines = ui.view.log.map(l => `<div class="${l.kind}">${esc(renderLog(l.msg, ui.view.seat, names))}</div>`).join('');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Journal</h2><button class="btn" data-act="close">Fermer</button></div>
      <div class="log" id="logbox">${lines || '<span class="hint">Rien pour l\'instant.</span>'}</div></div></div>`;
  }
  if (ui.sheet === 'set') {
    const ids = o => Object.keys(o);
    let h = '';
    for (const fam of [...FAMILIES, null]) {
      const cards = ids(CARDS).filter(k => !CARDS[k].token && (CARDS[k].kw[0] || null) === fam);
      const tokens = fam === null ? ids(CARDS).filter(k => CARDS[k].token) : [];
      h += `<div class="gal-h">${fam || 'Neutres et jetons'}</div><div class="gallery">
        ${ids(GENERALS).filter(k => GENERALS[k].fam === fam).map(genCard).join('')}
        ${cards.map(fullCard).join('')}${ids(TERRAINS).filter(k => TERRAINS[k].fam === fam).map(terrainCard).join('')}${tokens.map(fullCard).join('')}</div>`;
    }
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Set 1</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">Le deck est libre : 15 cartes, 5 terrains et n'importe quel général. Les decks de l'accueil sont des listes de départ.</p>${h}</div></div>`;
  }
  if (ui.sheet === 'end' && ui.view && ui.view.result) {
    const r = ui.view.result, s = ui.view.seat;
    const t = r.winner === s ? 'Victoire' : r.winner < 0 ? 'Match nul' : 'Défaite';
    const reason = renderLog(r.reason, s, ui.view.names);
    const zs = [0, 1, 2].map(z => `<div><div class="eyebrow">${ZONE_NAMES[z]}</div><b>${ui.view.me.zonePower[z]}</b> contre ${ui.view.foe.zonePower[z]}</div>`).join('');
    return `<div class="sheet"><div class="panel end"><h2>${t}</h2><p style="margin:0">${esc(reason)}.</p>
      <div class="zs">${zs}</div><div class="row">
      <button class="btn primary" data-act="again" ${ui.rematchAsked ? 'disabled' : ''}>${ui.rematchAsked ? 'Revanche demandée…' : 'Revanche'}</button>
      <button class="btn" data-act="quit">Retour à l'accueil</button><button class="btn" data-act="log">Voir le journal</button></div></div></div>`;
  }
  return '';
}
function render() {
  const h = document.getElementById('hand'); const sx = h ? h.scrollLeft : 0;
  const body = ui.screen === 'home' ? renderHome() : ui.screen === 'lobby' ? renderLobby() : renderGame();
  app.innerHTML = body + sheetHTML();
  const h2 = document.getElementById('hand'); if (h2) h2.scrollLeft = sx;
  const lb = document.getElementById('logbox'); if (lb) lb.parentElement.scrollTop = lb.scrollHeight;
}

// ---- Interactions ----
function tryPlace(z) {
  if (!canPlay()) return;
  if (ui.genMode) { ui.genZone = z; ui.genMode = false; ui.msg = ''; render(); return; }
  if (ui.moveSel !== null) {
    const from = me().board.findIndex(col => col.some(c => c.uid === ui.moveSel));
    if (z === from) { ui.moveSel = null; ui.msg = ''; }
    else if (freeSlots(z) <= 0) ui.msg = `La zone ${ZONE_NAMES[z]} est pleine de votre côté.`;
    else { ui.moves.push({ uid: ui.moveSel, zone: z }); ui.moveSel = null; ui.msg = ''; }
    render(); return;
  }
  if (!ui.sel) return;
  const c = handLeft().find(x => x.uid === ui.sel); if (!c) return;
  const d = CARDS[c.id], left = sealsLeft();
  if (freeSlots(z) <= 0) ui.msg = `La zone ${ZONE_NAMES[z]} est pleine de votre côté.`;
  else if (d.x ? left <= 0 : c.cost > left) ui.msg = d.x ? `Il ne vous reste aucun sceau pour ${d.name}.` : `Pas assez de sceaux : ${d.name} coûte ${c.cost}, il vous en reste ${left}.`;
  else { ui.pending.push({ uid: c.uid, id: c.id, zone: z }); ui.sel = null; ui.msg = ''; }
  render();
}
function quit() {
  if (ui.ctrl) ui.ctrl.leave();
  store.set('session', null);
  ui.ctrl = null; ui.view = null; ui.screen = 'home'; ui.sheet = null; ui.pending = []; ui.lastTurn = 0; render();
}
app.addEventListener('input', e => {
  if (e.target.id === 'name') ui.name = e.target.value;
  if (e.target.id === 'code') { ui.joinCode = e.target.value.toUpperCase(); e.target.value = ui.joinCode; }
});
app.addEventListener('change', e => { if (e.target.id === 'general') { ui.general = e.target.value; render(); } });
app.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-hand],[data-card],[data-terrain],[data-general],[data-z],[data-deck],[data-stop]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.stop && !e.target.closest('[data-act]')) return;
  if (ds.act) {
    const a = ds.act;
    if (a === 'close') { ui.sheet = null; render(); }
    else if (a === 'log' || a === 'set') { ui.sheet = a; render(); }
    else if (a === 'create') goOnline('create');
    else if (a === 'join') { if (ui.joinCode.length !== 4) { ui.error = 'Le code fait 4 lettres.'; render(); } else goOnline('join'); }
    else if (a === 'solo') goSolo();
    else if (a === 'copy') { const link = document.getElementById('link');
      navigator.clipboard.writeText(link.value).then(() => { t.textContent = 'Lien copié'; }).catch(() => { link.select(); }); }
    else if (a === 'go') { if (!canPlay()) return;
      ui.ctrl.submit({ cards: ui.pending.map(p => ({ uid: p.uid, zone: p.zone })), moves: ui.moves.slice(), general: ui.genZone }); ui.sel = null; ui.moveSel = null; ui.genMode = false; }
    else if (a === 'gen') {
      if (ui.genZone !== null) ui.genZone = null;
      else if (myGen().needsZone) ui.genMode = !ui.genMode;
      else ui.genZone = 0;
      ui.sel = null; ui.moveSel = null; ui.msg = '';
      // Le coût du général passe avant les cartes : on retire les dernières cartes posées s'il manque des sceaux.
      while (ui.genZone !== null && sealsLeft() < 0 && ui.pending.length) ui.pending.pop();
      render(); }
    else if (a === 'again') { ui.rematchAsked = true; ui.ctrl.rematch(); render(); }
    else if (a === 'quit') quit();
    return;
  }
  if (ds.deck) { ui.deck = ds.deck; render(); return; }
  if (ds.hand) { if (!canPlay()) { ui.focus = { kind: 'card', id: ds.id }; render(); return; }
    const uid = +ds.hand; ui.sel = ui.sel === uid ? null : uid; ui.genMode = false; ui.moveSel = null; ui.msg = ''; ui.focus = { kind: 'card', id: ds.id }; render(); return; }
  if (ds.card) {
    if (ds.pending && canPlay()) { ui.pending = ui.pending.filter(p => p.uid !== +ds.card); ui.msg = ''; ui.focus = { kind: 'card', id: ds.id }; render(); return; }
    if (ds.mobile && canPlay() && ui.sel === null && !ui.genMode && (ui.moveSel === null || ui.moveSel === +ds.card)) {
      const uid = +ds.card; ui.focus = { kind: 'card', id: ds.id }; ui.msg = '';
      if (moveOf(uid)) { ui.moves = ui.moves.filter(m => m.uid !== uid); ui.moveSel = null; }
      else ui.moveSel = ui.moveSel === uid ? null : uid;
      render(); return; }
    if (ds.id && ui.sel === null && !ui.genMode && ui.moveSel === null) { ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; render(); return; }
  }
  if (ds.terrain && ui.sel === null && !ui.genMode && ui.moveSel === null) { ui.focus = { kind: 'terrain', id: ds.terrain }; ui.msg = ''; render(); return; }
  if (ds.general) { ui.focus = { kind: 'general', id: ds.general }; ui.msg = ''; render(); return; }
  const zone = t.closest('[data-z]'); if (zone) tryPlace(+zone.dataset.z);
});
app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone.target')) { e.preventDefault(); tryPlace(+e.target.dataset.z); } });

// Reprise d'une partie en ligne après rechargement de la page
const saved = store.get('session', null);
if (saved && saved.room && saved.token) { ui.mode = 'online'; ui.room = saved.room; ui.ctrl = connectOnline(handlers, { t: 'rejoin', room: saved.room, token: saved.token }); }
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
