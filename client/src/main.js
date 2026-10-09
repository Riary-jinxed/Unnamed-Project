// Appli web : connexion, collection et deck, accueil, salon en ligne, partie (en ligne ou contre l'IA).
import './style.css';
import { CARDS, GENERALS, TERRAINS, DECKS, FAMILIES, SLOTS, ZONE_NAMES, renderLog } from '@jeu/engine';
import { STARTERS, DECK_SIZE, DECK_TERRAINS, MAX_COPIES, BOOSTER_POOL, SHARDS_PER_DUPLICATE, allowedGenerals, allowedTerrains, deckError } from '@jeu/engine/collection';
import { api } from './api.js';
import { connectOnline } from './net.js';
import { startSolo } from './solo.js';
import { hasArt, artVar } from './art.js';
import { unlockAudio, play, isMuted, setMuted } from './sfx.js';

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
const ui = {
  screen: 'loading', auth: store.get('auth', null), account: null, loginId: '', loginPass: '', starterPick: null, busy: false,
  booster: null, shop: null, edit: null, colFam: '', joinCode: (params.get('code') || '').toUpperCase(),
  ctrl: null, mode: null, view: null, room: null, lobbyNames: [], error: '',
  pending: [], moves: [], moveSel: null, genZone: null, genMode: false, sel: null, focus: null, msg: '', sheet: null, lastTurn: 0, rematchAsked: false,
  drag: null, fx: null, zoom: null,
};
const app = document.getElementById('app');

// ---- Contrôleurs (en ligne / IA) ----
const handlers = {
  onLobby(m) { ui.screen = 'lobby'; ui.room = m.room; ui.lobbyNames = m.names; ui.error = ''; store.set('session', { room: m.room, token: m.token }); render(); },
  onView(view, room) {
    if (room) ui.room = room;
    const prev = ui.screen === 'game' ? ui.view : null;
    if (view.phase !== 'plan' || view.turn !== ui.lastTurn) { ui.pending = []; ui.moves = []; ui.moveSel = null; ui.genZone = null; ui.genMode = false; ui.sel = null; }
    if (view.phase === 'plan' && view.turn !== ui.lastTurn) ui.msg = '';
    ui.lastTurn = view.turn; ui.view = view; ui.screen = 'game';
    if (view.phase === 'over' && (!ui.sheet || ui.sheet === 'zoom')) { ui.sheet = 'end'; ui.zoom = null; }
    if (view.phase !== 'over') { ui.rematchAsked = false; if (ui.sheet === 'end') ui.sheet = null; }
    viewEffects(prev, view);
    render();
  },
  onError(msg) { ui.error = msg; render(); },
  onGone() { store.set('session', null); ui.screen = menuScreen(); ui.view = null; ui.error = 'La partie a expiré.'; ui.ctrl = null; render(); },
  onLeft() { store.set('session', null); ui.screen = menuScreen(); ui.view = null; ui.error = 'Votre adversaire a quitté la partie.'; ui.ctrl = null; render(); },
};
// On joue toujours le deck enregistré sur le compte.
function deckReady() {
  const err = deckError(ui.account.deck, ui.account);
  if (err) { ui.error = `Votre deck n'est pas jouable : ${err}`; render(); }
  return !err;
}
function goOnline(action) {
  if (!deckReady()) return;
  ui.mode = 'online'; ui.error = '';
  ui.ctrl = connectOnline(handlers, action === 'create' ? { t: 'create', auth: ui.auth } : { t: 'join', room: ui.joinCode, auth: ui.auth });
}
function goSolo() {
  if (!deckReady()) return;
  ui.mode = 'solo'; ui.sheet = null; ui.lastTurn = 0;
  ui.ctrl = startSolo(handlers, { name: ui.account.name, deck: ui.account.deck });
}

// ---- Compte ----
const MENU = ['loading', 'login', 'starter'];
// Écran d'accueil selon l'état du compte (en dehors d'une partie).
const menuScreen = () => (ui.account ? (ui.account.starter ? 'home' : 'starter') : ui.auth ? 'loading' : 'login');
function setAccount(a) {
  ui.account = a;
  if (MENU.includes(ui.screen)) ui.screen = a.starter ? 'home' : 'starter';
}
function signedOut(msg = '') {
  store.set('auth', null); ui.auth = null; ui.account = null; ui.screen = 'login'; ui.error = msg; ui.busy = false;
}
// Appel à l'API avec la session du joueur ; une session expirée renvoie à l'écran de connexion.
async function call(method, path, body) {
  ui.busy = true; ui.error = ''; render();
  try { const r = await api(method, path, body, ui.auth); if (r.account) setAccount(r.account); return r; }
  catch (e) { if (e.status === 401) signedOut(e.message); else ui.error = e.message; return null; }
  finally { ui.busy = false; render(); }
}
async function boot() {
  if (!ui.auth) { signedOut(); render(); return; }
  await call('GET', '/api/me');
}
async function doLogin() {
  ui.busy = true; ui.error = ''; render();
  try {
    const r = await api('POST', '/api/login', { login: ui.loginId, password: ui.loginPass });
    store.set('auth', r.token); ui.auth = r.token; ui.loginPass = ''; setAccount(r.account);
  } catch (e) { ui.error = e.message; }
  ui.busy = false; render();
}
function doLogout() {
  const token = ui.auth; signedOut(); render();
  api('POST', '/api/logout', {}, token).catch(() => {});
}
// Affiche les cartes reçues (booster du jour, booster ou carte achetés en boutique).
function showCards(r) { ui.booster = r; ui.sheet = 'booster'; play('reveal'); render(); }
async function openBoosterNow() {
  const r = await call('POST', '/api/booster');
  if (r) showCards(r);
}
async function openShop() {
  ui.screen = 'shop'; ui.error = ''; render();
  const r = await call('GET', '/api/shop');
  if (r) { ui.shop = r.shop; render(); }
}
async function buy(path, body) {
  const r = await call('POST', path, body);
  if (r) { ui.shop = r.shop; showCards(r); }
}
function editDeck() {
  const d = ui.account.deck;
  ui.edit = { name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: d.general };
  ui.screen = 'deck'; ui.error = ''; ui.msg = '';
}
async function saveDeck() {
  if (await call('PUT', '/api/deck', ui.edit)) { ui.edit = null; ui.screen = 'home'; render(); }
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
  return `<div class="mc ${opts.pending || !c.revealed ? 'pending' : ''} ${mobile ? 'mobile' : ''} ${ui.moveSel === c.uid ? 'msel' : ''} ${mv ? 'moving' : ''} ${ui.drag === c.uid ? 'dragging' : ''} ${hasArt(c.id) ? 'art' : ''}" style="${famVar(d.kw)}${artVar(c.id)}"
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
  if (ui.sel !== null && canPlay()) return `<div class="hint">Touchez une de vos zones pour poser ${esc(CARDS[me().hand.find(c => c.uid === ui.sel)?.id]?.name || 'cette carte')}.</div>`;
  if (!f) return `<div class="hint">Touchez une carte pour la voir en grand et la jouer, ou faites-la glisser vers une zone. Une créature marquée ⇄ peut changer de zone.</div>`;
  if (f.kind === 'card') { const d = CARDS[f.id];
    return `<div class="h"><b>${esc(d.name)}</b><span class="meta">${typeName(d)} · coût ${d.x ? 'X' : d.cost}${d.type === 'C' ? ` · puissance ${d.power}` : ''} · ${kwLine(d)}</span></div><div>${d.text || 'Pas d\'effet.'}</div>`; }
  if (f.kind === 'terrain') { const t = TERRAINS[f.id]; return `<div class="h"><b>${t.name}</b><span class="meta">Terrain</span></div><div>${t.text}</div>`; }
  if (f.kind === 'general') { const g = GENERALS[f.id]; return `<div class="h"><b>${g.name}</b><span class="meta">Général · ${genLine(g)}</span></div><div>${g.text}</div>`; }
  return '';
}
function pbar(side, isMe, connected) {
  const g = GENERALS[side.general];
  return `<div class="pbar ${isMe ? 'me' : 'foe'}"><span class="who">${isMe ? 'Vous' : esc(side.name)} · ${esc(side.deckName)}</span>
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
    const won = b > a ? 'won-me' : a > b ? 'won-foe' : '';
    board += `<div class="zone ${won} ${target ? 'target' : ''}" data-z="${z}" ${target ? 'tabindex="0" role="button"' : ''} aria-label="Zone ${ZONE_NAMES[z]}">
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
    return `<button class="hc ${ui.sel === c.uid ? 'sel' : ''} ${ui.drag === c.uid ? 'dragging' : ''} ${cant ? 'cant' : ''} ${hasArt(c.id) ? 'art' : ''}" style="${famVar(d.kw)}${artVar(c.id)}" data-hand="${c.uid}" data-id="${c.id}">
      <span class="top2"><span class="seal">${costLabel(d, c.cost)}</span><span class="t">${typeName(d)}</span></span>
      <span class="n">${esc(d.name)}</span><span class="k">${kwLine(d)}</span>${d.type === 'C' ? `<span class="p num ${pcls}">${c.power}</span>` : ''}</button>`; }).join('');
  const canGen = play && g.activate && !m.generalUsed && (ui.genZone !== null || sealsLeft() >= (g.activateCost || 0));
  const goLabel = v.phase === 'reveal' ? 'Révélation…' : v.ready.me ? 'En attente…' : v.turn === v.turns ? 'Valider le dernier tour' : 'Valider le tour';
  return `
  <div class="top"><span class="title">${ui.mode === 'online' ? `Partie ${esc(ui.room || '')}` : 'Contre l\'IA'}</span>
    <span class="turnbox"><span>Tour <b class="num">${v.turn}</b>/${v.turns}</span><span>Sceaux <b class="num">${seals}</b>/${v.turn}</span></span>
    ${muteBtn()}<button class="btn" data-act="log">Journal</button><button class="btn" data-act="set">Cartes</button></div>
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
// ---- Écrans du compte : connexion, deck de départ, accueil, collection, deck ----
const errLine = () => (ui.error ? `<p class="err" role="alert">${esc(ui.error)}</p>` : '');
const owned = id => (ui.account && ui.account.cards[id]) || 0;
const famOfCard = id => CARDS[id].kw.find(k => FAMILIES.includes(k)) || null;
// Ordre d'affichage : famille du set, puis coût, puis nom.
const byFamCost = (a, b) => [...FAMILIES, null].indexOf(famOfCard(a)) - [...FAMILIES, null].indexOf(famOfCard(b)) || CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name);
function renderLoading() {
  return `<div class="top"><span class="title">Jeu de cartes</span></div>
  <div class="card-box">${ui.error ? `${errLine()}<div class="row"><button class="btn primary" data-act="retry">Réessayer</button><button class="btn" data-act="logout">Changer de compte</button></div>` : '<p class="wait">Connexion…</p>'}</div>`;
}
function renderLogin() {
  return `<div class="top"><span class="title">Jeu de cartes</span>${muteBtn()}</div>
  <form class="card-box" id="login-form">
    <h2 style="font-size:22px">Connexion</h2>
    <p class="hint" style="margin:0">Utilisez l'identifiant et le mot de passe qu'on vous a donnés.</p>
    <div class="field"><label class="eyebrow" for="login-id">Identifiant</label><input id="login-id" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(ui.loginId)}"></div>
    <div class="field"><label class="eyebrow" for="login-pass">Mot de passe</label><input id="login-pass" type="password" autocomplete="current-password" value="${esc(ui.loginPass)}"></div>
    ${errLine()}
    <div class="row"><button class="btn primary" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Connexion…' : 'Se connecter'}</button></div>
  </form>`;
}
function renderStarter() {
  const opts = STARTERS.map(k => { const d = DECKS[k];
    const gens = allowedGenerals(k).filter(g => GENERALS[g].fam).map(g => GENERALS[g].name).join(', ');
    return `<button class="deckopt ${ui.starterPick === k ? 'sel' : ''}" data-starter="${k}" style="${famVar([d.fam])}" aria-pressed="${ui.starterPick === k}">
      <span class="eyebrow">${d.fam}</span><h3>${d.name}</h3><small>Généraux : ${gens}, plus les généraux neutres.</small></button>`; }).join('');
  return `<div class="top"><span class="title">Bienvenue, ${esc(ui.account.name)}</span><button class="btn" data-act="set">Voir les cartes</button><button class="btn" data-act="logout">Se déconnecter</button></div>
  <div class="setup">
    <p>Choisissez votre deck de départ. Ses ${DECK_SIZE} cartes forment votre collection ; le booster quotidien l'agrandit ensuite. Vos généraux et terrains sont les neutres et ceux de cette famille. Ce choix est définitif.</p>
    <div class="decks starters">${opts}</div>
    ${errLine()}
    <div class="row"><button class="btn primary" data-act="starter" ${ui.starterPick && !ui.busy ? '' : 'disabled'}>${ui.starterPick ? `Prendre ${DECKS[ui.starterPick].name}` : 'Choisissez un deck'}</button></div>
  </div>`;
}
function renderHome() {
  const a = ui.account, d = a.deck, g = GENERALS[d.general];
  const total = BOOSTER_POOL.filter(owned).length;
  const deckErr = deckError(d, a);
  return `
  <div class="top"><span class="title">Jeu de cartes</span>${muteBtn()}<button class="btn" data-act="set">Voir les cartes</button><button class="btn" data-act="logout">Se déconnecter</button></div>
  <div class="setup">
    <div class="card-box booster ${a.boosterReady ? 'ready' : ''}">
      <div><span class="eyebrow">Bonjour ${esc(a.name)}</span><h2 style="font-size:22px">Booster du jour</h2></div>
      ${a.boosterReady ? `<button class="btn primary" data-act="booster" ${ui.busy ? 'disabled' : ''}>Ouvrir le booster</button>`
        : '<p class="hint" style="margin:0">Déjà ouvert aujourd\'hui. Le prochain arrive demain à minuit.</p>'}
    </div>
    <div class="card-box">
      <div><span class="eyebrow">Votre deck</span><h2 style="font-size:22px">${esc(d.name)}</h2></div>
      <p style="margin:0">Général : <button class="chip" data-zoom="general:${d.general}">${g.name}</button> · ${d.cards.length} cartes · ${d.terrains.length} terrains</p>
      ${deckErr ? `<p class="err" style="margin:0">${esc(deckErr)}</p>` : ''}
      <div class="row"><button class="btn" data-act="edit">Modifier le deck</button><button class="btn" data-act="collection">Ma collection (${total}/${BOOSTER_POOL.length})</button></div>
    </div>
    <div class="card-box booster">
      <div><span class="eyebrow">Boutique</span><h2 style="font-size:22px"><span class="num">${a.shards}</span> Éclats</h2>
        <small class="hint">Chaque doublon rapporte ${SHARDS_PER_DUPLICATE} Éclats.</small></div>
      <button class="btn" data-act="shop">Ouvrir la boutique</button>
    </div>
    ${errLine()}
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
function renderCollection() {
  const a = ui.account, fams = [...FAMILIES, 'Neutre'];
  const shown = BOOSTER_POOL.filter(id => !ui.colFam || (famOfCard(id) || 'Neutre') === ui.colFam).sort(byFamCost);
  const tile = id => { const n = owned(id);
    return `<button class="ccard ${n ? '' : 'locked'}" data-zoom="card:${id}" aria-label="${esc(CARDS[id].name)}${n ? `, ${n} exemplaire${n > 1 ? 's' : ''}` : ', pas encore obtenue'}">
      ${fullCard(id)}${n > 1 ? `<span class="count num">×${n}</span>` : ''}${n ? '' : '<span class="lock">Pas encore obtenue</span>'}</button>`; };
  return `<div class="top"><span class="title">Ma collection</span><button class="btn" data-act="edit">Modifier le deck</button><button class="btn" data-act="home">Retour</button></div>
  <p class="hint" style="margin:0">${BOOSTER_POOL.filter(owned).length} cartes sur ${BOOSTER_POOL.length}. Touchez une carte pour la voir en grand.</p>
  <div class="seg famseg" role="group" aria-label="Famille"><button data-fam="" class="${ui.colFam ? '' : 'on'}">Toutes</button>${fams.map(f => `<button data-fam="${f}" class="${ui.colFam === f ? 'on' : ''}">${f}</button>`).join('')}</div>
  <div class="gallery">${shown.map(tile).join('')}</div>
  <div class="gal-h">Vos généraux</div><div class="gallery">${allowedGenerals(a.starter).map(genCard).join('')}</div>
  <div class="gal-h">Vos terrains</div><div class="gallery">${allowedTerrains(a.starter).map(terrainCard).join('')}</div>`;
}
// Boutique : un espace par set ; les sets à venir y ont déjà leur place.
function renderShop() {
  const sh = ui.shop, a = ui.account;
  const top = `<div class="top"><span class="title">Boutique</span><span class="chip num">${a.shards} Éclats</span><button class="btn" data-act="home">Retour</button></div>`;
  if (!sh) return `${top}${errLine()}<p class="wait">Chargement…</p>`;
  const P = sh.prices;
  const offer = (set, o) => {
    const label = o.bought ? 'Achetée' : o.owned ? 'Déjà dans votre collection' : `Acheter · ${P.cardPrice} Éclats`;
    return `<div class="offer"><button class="ccard" data-zoom="card:${o.id}">${fullCard(o.id)}</button>
      <button class="btn ${o.bought || o.owned ? '' : 'primary'}" data-act="buy-card" data-set="${set.id}" data-id="${o.id}" ${o.bought || o.owned || a.shards < P.cardPrice || ui.busy ? 'disabled' : ''}>${label}</button></div>`;
  };
  const section = set => set.open ? `<section class="card-box shopset">
      <div><span class="eyebrow">${set.size} cartes</span><h2 style="font-size:22px">${esc(set.name)}</h2></div>
      <div class="gal-h">Cartes du jour</div><p class="hint" style="margin:0">Trois cartes choisies pour vous, renouvelées chaque jour à minuit.</p>
      <div class="gallery">${set.offers.map(o => offer(set, o)).join('')}</div>
      <div class="gal-h">Booster du set</div>
      <div class="row"><p class="hint" style="margin:0;flex:1">${P.boosterSize} cartes au hasard parmi les ${set.size} du set, toutes avec la même chance. Les doublons rapportent ${SHARDS_PER_DUPLICATE} Éclats chacun.</p>
        <button class="btn primary" data-act="buy-booster" data-set="${set.id}" ${a.shards < P.boosterPrice || ui.busy ? 'disabled' : ''}>Acheter · ${P.boosterPrice} Éclats</button></div>
    </section>` : `<section class="card-box shopset soon"><div><span class="eyebrow">Bientôt disponible</span><h2 style="font-size:22px">${esc(set.name)}</h2></div>
      <p class="hint" style="margin:0">${esc(set.teaser)}</p></section>`;
  return `${top}${errLine()}${sh.sets.map(section).join('')}`;
}

// Constructeur de deck : on coche les cartes de la collection, les terrains et le général.
function renderDeck() {
  const a = ui.account, e = ui.edit, err = deckError(e, a);
  const row = (id, on) => { const d = CARDS[id];
    return `<button class="pickrow ${on ? 'on' : ''}" data-pick="${id}" style="${famVar(d.kw)}" aria-pressed="${on}">
      <span class="seal">${d.x ? 'X' : d.cost}</span><span class="pn"><b>${esc(d.name)}</b><small>${kwLine(d)} · ${d.text || 'Pas d\'effet.'}</small></span>
      ${d.type === 'C' ? `<span class="p num">${d.power}</span>` : '<span class="p sm">Sort</span>'}</button>`; };
  const trow = k => { const t = TERRAINS[k], on = e.terrains.includes(k);
    return `<button class="pickrow ${on ? 'on' : ''}" data-tpick="${k}" style="${famVar([t.fam])}" aria-pressed="${on}"><span class="pn"><b>${t.name}</b><small>${t.fam || 'Neutre'} · ${t.text}</small></span></button>`; };
  const cards = BOOSTER_POOL.filter(owned).sort(byFamCost);
  const gens = allowedGenerals(a.starter), cur = GENERALS[e.general];
  return `<div class="top"><span class="title">Modifier le deck</span><button class="btn" data-act="home">Annuler</button>
    <button class="btn primary" data-act="save-deck" ${err || ui.busy ? 'disabled' : ''}>Enregistrer</button></div>
  <div class="deckbar"><span class="num ${e.cards.length === DECK_SIZE ? 'ok' : ''}">Cartes ${e.cards.length}/${DECK_SIZE}</span><span class="num ${e.terrains.length === DECK_TERRAINS ? 'ok' : ''}">Terrains ${e.terrains.length}/${DECK_TERRAINS}</span>
    <span class="hint">${esc(ui.msg || err || 'Deck prêt à jouer.')}</span></div>
  ${errLine()}
  <div class="field"><label class="eyebrow" for="deck-name">Nom du deck</label><input id="deck-name" maxlength="30" value="${esc(e.name)}"></div>
  <div class="field genbox"><label class="eyebrow" for="deck-general">Général</label>
    <select id="deck-general">${gens.map(k => `<option value="${k}" ${e.general === k ? 'selected' : ''}>${GENERALS[k].name} (${GENERALS[k].fam || 'neutre'})</option>`).join('')}</select>
    <small>${cur ? `${cur.kind} : ${cur.text}` : ''}</small></div>
  <div class="gal-h">Terrains</div><div class="picklist">${allowedTerrains(a.starter).map(trow).join('')}</div>
  <div class="gal-h">Cartes de votre collection</div><div class="picklist">${cards.map(id => row(id, e.cards.includes(id))).join('')}</div>`;
}
function togglePick(id) {
  const e = ui.edit; ui.msg = '';
  if (e.cards.includes(id)) e.cards.splice(e.cards.indexOf(id), 1);
  else if (e.cards.length >= DECK_SIZE) ui.msg = `Le deck est complet (${DECK_SIZE} cartes) : retirez-en une d'abord.`;
  else if (e.cards.filter(x => x === id).length >= MAX_COPIES || owned(id) <= e.cards.filter(x => x === id).length) ui.msg = 'Déjà dans le deck.';
  else e.cards.push(id);
  render();
}
function toggleTerrain(k) {
  const e = ui.edit; ui.msg = '';
  if (e.terrains.includes(k)) e.terrains.splice(e.terrains.indexOf(k), 1);
  else if (e.terrains.length >= DECK_TERRAINS) ui.msg = `Vous avez déjà ${DECK_TERRAINS} terrains : retirez-en un d'abord.`;
  else e.terrains.push(k);
  render();
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
  return `<div class="fc" style="${famVar(d.kw)}">${hasArt(id) ? `<img class="art" src="/art/${id}.webp" alt="" loading="lazy" width="432" height="640">` : ''}<div class="h"><b>${esc(d.name)}</b><span class="seal">${d.x ? 'X' : d.cost}</span></div>
    <span class="k">${typeName(d)} · ${kwLine(d)}</span><span class="x">${d.text || 'Pas d\'effet.'}</span>${d.type === 'C' ? `<span class="p num">${d.power}</span>` : ''}</div>`; }
const genCard = k => { const g = GENERALS[k]; return `<div class="fc" style="${famVar([g.fam])}"><b>${g.name}</b><span class="k">Général · ${g.kind}</span><span class="x">${g.text}</span></div>`; };
const terrainCard = k => { const t = TERRAINS[k]; return `<div class="fc" style="${famVar([t.fam])}"><b>${t.name}</b><span class="k">Terrain</span><span class="x">${t.text}</span></div>`; };
// Carte affichée en grand, avec les actions possibles sur elle pendant la planification.
function zoomBtns(acts) { return acts.length ? `<div class="zacts">${acts.join('')}</div>` : ''; }
function zoomHTML() {
  const zm = ui.zoom, play = ui.view && canPlay();
  let body = '', style = '';
  if (zm.kind === 'card') {
    const d = CARDS[zm.id];
    const inHand = ui.view && me().hand.find(c => c.uid === zm.uid);
    const pend = ui.view && ui.pending.find(p => p.uid === zm.uid);
    const onBoard = ui.view && !pend && cardsOf(ui.view).get(zm.uid);
    const cost = inHand ? (d.x ? 'X' : inHand.cost) : (d.x ? 'X' : d.cost);
    const pw = inHand ? inHand.power : onBoard && onBoard.revealed ? onBoard.power : d.power;
    const pcls = pw > d.power ? 'up' : pw < d.power ? 'down' : '';
    const acts = [];
    if (play && inHand && !pend) {
      const left = sealsLeft(), cant = d.x ? left <= 0 : inHand.cost > left;
      if (cant) acts.push(`<p class="hint">Pas assez de sceaux pour la jouer ce tour (il vous en reste ${left}).</p>`);
      else acts.push(`<span class="eyebrow">Jouer dans la zone</span><div class="row">${[0, 1, 2].map(z => `<button class="btn" data-act="zplay" data-zone="${z}" ${freeSlots(z) > 0 ? '' : 'disabled'}>${ZONE_NAMES[z]}</button>`).join('')}</div>`);
    }
    if (play && pend) acts.push(`<button class="btn" data-act="zback">Reprendre en main</button>`);
    if (play && onBoard && onBoard.side === 'me' && onBoard.mobile) {
      if (moveOf(zm.uid)) acts.push(`<button class="btn" data-act="zstay">Annuler le déplacement</button>`);
      else acts.push(`<span class="eyebrow">Déplacer vers</span><div class="row">${[0, 1, 2].filter(z => z !== onBoard.z).map(z => `<button class="btn" data-act="zmove" data-zone="${z}" ${freeSlots(z) > 0 ? '' : 'disabled'}>${ZONE_NAMES[z]}</button>`).join('')}</div>`);
    }
    style = famVar(d.kw);
    body = `${hasArt(zm.id) ? `<img class="zart" src="/art/${zm.id}.webp" alt="" width="432" height="640">` : ''}
      <div class="zh"><span class="seal" title="Coût">${cost}</span><h2>${esc(d.name)}</h2>${d.type === 'C' ? `<span class="zp num ${pcls}" title="Puissance">${pw}</span>` : ''}</div>
      <span class="k">${typeName(d)} · ${kwLine(d)}${d.type === 'C' && pw !== d.power ? ` · puissance de base ${d.power}` : ''}</span>
      <p class="x">${d.text || 'Pas d\'effet.'}</p>${zoomBtns(acts)}`;
  } else if (zm.kind === 'general') {
    const g = GENERALS[zm.id]; style = famVar([g.fam]);
    body = `<div class="zh"><h2>${g.name}</h2></div><span class="k">Général · ${genLine(g)}${g.activateCost ? ` · activation ${g.activateCost} sceau` : ''}</span><p class="x">${g.text}</p>`;
  } else {
    const t = TERRAINS[zm.id]; style = famVar([t.fam]);
    body = `<div class="zh"><h2>${t.name}</h2></div><span class="k">Terrain${t.fam ? ` · ${t.fam}` : ''}</span><p class="x">${t.text}</p>`;
  }
  return `<div class="sheet zoom" data-act="close"><div class="panel zoomcard" data-stop="1" style="${style}" role="dialog" aria-label="Détail de la carte">${body}
    <button class="btn" data-act="close">Fermer</button></div></div>`;
}
function openZoom(zoom) { ui.zoom = zoom; ui.sheet = 'zoom'; ui.fx = { list: [['.zoomcard', 'zoom-in']] }; }
function sheetHTML() {
  if (ui.sheet === 'zoom' && ui.zoom) return zoomHTML();
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
      <p class="hint" style="margin:0">Un deck : ${DECK_SIZE} cartes différentes de votre collection, ${DECK_TERRAINS} terrains et un général. Généraux et terrains : les neutres et ceux de la famille de votre deck de départ.</p>${h}</div></div>`;
  }
  if (ui.sheet === 'booster' && ui.booster) {
    const { title, cards, fresh, shards } = ui.booster, n = fresh.filter(Boolean).length;
    const sum = [n ? `${n} nouvelle${n > 1 ? 's' : ''} carte${n > 1 ? 's' : ''} dans votre collection` : 'Aucune nouvelle carte', shards ? `${shards} Éclats gagnés avec les doublons` : ''].filter(Boolean).join(', ');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>${esc(title)}</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">${sum}.</p>
      <div class="gallery">${cards.map((id, i) => `<div class="bcard ${fresh[i] ? '' : 'dup'}" style="animation-delay:${i * 120}ms">${fresh[i] ? '<span class="new">Nouvelle</span>' : `<span class="new shard">Doublon · +${SHARDS_PER_DUPLICATE} Éclats</span>`}${fullCard(id)}</div>`).join('')}</div></div></div>`;
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
  const screens = { loading: renderLoading, login: renderLogin, starter: renderStarter, home: renderHome, collection: renderCollection, shop: renderShop, deck: renderDeck, lobby: renderLobby, game: renderGame };
  const body = screens[ui.screen]();
  app.innerHTML = body + sheetHTML();
  const h2 = document.getElementById('hand'); if (h2) h2.scrollLeft = sx;
  const lb = document.getElementById('logbox'); if (lb) lb.parentElement.scrollTop = lb.scrollHeight;
  applyFx();
}

// ---- Animations et bruitages ----
const SPEAKER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/>';
const muteBtn = () => `<button class="btn icon" data-act="mute" aria-pressed="${isMuted()}" aria-label="${isMuted() ? 'Activer le son' : 'Couper le son'}" title="${isMuted() ? 'Activer le son' : 'Couper le son'}">${SPEAKER}${isMuted() ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'}</svg></button>`;
const cardSel = uid => `[data-card="${uid}"]`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function cardsOf(view) {
  const m = new Map();
  for (const side of ['me', 'foe']) view[side].board.forEach((col, z) => col.forEach(c => m.set(c.uid, { ...c, side, z })));
  return m;
}
// Copie d'une carte qui quitte le plateau, animée par-dessus la table puis retirée.
function ghostOut(uid, cls) {
  const el = app.querySelector(cardSel(uid)); if (!el || reduceMotion()) return;
  const r = el.getBoundingClientRect(), g = el.cloneNode(true);
  g.classList.add('fxghost', cls);
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(g); setTimeout(() => g.remove(), 900);
}
// Compare la vue précédente à la nouvelle : prépare les animations du prochain rendu et joue les bruitages.
function viewEffects(prev, view) {
  const list = [], sounds = [];
  let flip = null;
  if (!prev || view.turn < prev.turn || (prev.phase === 'over' && view.phase !== 'over')) {
    // Début de partie : la main arrive carte par carte.
    view.me.hand.forEach((c, i) => list.push([`[data-hand="${c.uid}"]`, 'drawn', i * 70]));
    ui.fx = { list }; play('draw'); return;
  }
  const before = cardsOf(prev), after = cardsOf(view), f = view.flash;
  if (f !== null && f !== undefined) {
    const a = before.get(f), b = after.get(f);
    if (!b) { sounds.push('spell'); ghostOut(f, 'spellout'); if (a) list.push([`.zone[data-z="${a.z}"]`, 'spellcast']); }
    else if (a && a.revealed) { sounds.push('place'); const el = app.querySelector(cardSel(f)); if (el) flip = { uid: f, rect: el.getBoundingClientRect() }; }
    else { sounds.push(b.side === 'me' ? 'reveal' : 'revealFoe'); list.push([cardSel(f), b.side === 'me' ? 'reveal' : 'reveal-foe']); }
  }
  let gone = false, up = false, down = false;
  for (const [uid, a] of before) if (a.revealed && uid !== f && !after.has(uid)) { ghostOut(uid, 'shatter'); gone = true; }
  for (const [uid, b] of after) { const a = before.get(uid);
    if (a && a.revealed && b.revealed && a.power !== b.power && uid !== f) { const u = b.power > a.power; list.push([`${cardSel(uid)} .p`, u ? 'pup' : 'pdown']); if (u) up = true; else down = true; } }
  for (const side of ['me', 'foe']) for (const z of [0, 1, 2]) {
    if (prev[side].zonePower[z] !== view[side].zonePower[z]) list.push([`.zone[data-z="${z}"] .v.${side}`, 'bump']);
    if (!prev[side].terrains[z] && view[side].terrains[z]) { list.push([`.zone[data-z="${z}"] .terrain.set.${side}`, 'terrain-in']); sounds.push('terrain'); }
  }
  if ((!prev.me.generalUsed && view.me.generalUsed) || (!prev.foe.generalUsed && view.foe.generalUsed)) sounds.push('general');
  if (gone) sounds.push('destroy'); else if (up) sounds.push('up'); else if (down) sounds.push('down');
  if (view.phase === 'plan' && view.turn !== prev.turn) {
    const had = new Set(prev.me.hand.map(c => c.uid));
    view.me.hand.filter(c => !had.has(c.uid)).forEach((c, i) => list.push([`[data-hand="${c.uid}"]`, 'drawn', i * 70]));
    sounds.push('draw');
  }
  if (view.phase === 'over' && prev.phase !== 'over' && view.result) {
    sounds.push(view.result.winner === view.seat ? 'win' : view.result.winner < 0 ? 'tie' : 'lose');
    list.push(['.panel.end', 'end-in']);
  }
  ui.fx = { list, flip };
  [...new Set(sounds)].slice(0, 3).forEach((s, i) => i ? setTimeout(() => play(s), i * 110) : play(s));
}
// Applique une seule fois les animations préparées, sur les éléments du rendu qui vient d'avoir lieu.
function applyFx() {
  const fx = ui.fx; ui.fx = null; if (!fx) return;
  for (const [sel, cls, delay] of fx.list) for (const el of app.querySelectorAll(sel)) {
    if (delay) el.style.animationDelay = `${delay}ms`;
    el.classList.add(cls);
  }
  // Déplacement : la carte glisse depuis son ancienne place.
  if (fx.flip && !reduceMotion()) {
    const el = app.querySelector(cardSel(fx.flip.uid)); if (!el || !el.animate) return;
    const r = el.getBoundingClientRect(), dx = fx.flip.rect.left - r.left, dy = fx.flip.rect.top - r.top;
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.08)`, zIndex: 2 }, { transform: 'none', zIndex: 2 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

// ---- Glisser-déposer (en plus du toucher) ----
let drag = null, swallowClick = false;
const zoneAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.zone.target'); };
app.addEventListener('pointerdown', e => {
  unlockAudio();
  if ((e.pointerType === 'mouse' && e.button !== 0) || !ui.view || !canPlay() || ui.screen !== 'game') return;
  const h = e.target.closest('[data-hand]'), m = e.target.closest('[data-mobile]');
  if (!h && !m) return;
  if (m && moveOf(+m.dataset.card)) return;
  const el = h || m;
  drag = { kind: h ? 'hand' : 'move', uid: +(h ? h.dataset.hand : m.dataset.card), id: el.dataset.id, el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, touch: e.pointerType !== 'mouse', ghost: null };
});
function startDrag(e) {
  const r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
  g.classList.remove('sel', 'cant', 'msel'); g.classList.add('dragghost');
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top; drag.ghost = g; document.body.append(g);
  if (drag.kind === 'hand') { ui.sel = drag.uid; ui.moveSel = null; } else { ui.moveSel = drag.uid; ui.sel = null; }
  ui.genMode = false; ui.msg = ''; ui.focus = { kind: 'card', id: drag.id }; ui.drag = drag.uid;
  play('pick'); render();
}
window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.ghost) {
    if (Math.hypot(dx, dy) < 8) return;
    // Sur écran tactile, un glissement horizontal dans la main la fait défiler.
    if (drag.touch && drag.kind === 'hand' && Math.abs(dx) > Math.abs(dy)) { drag = null; return; }
    startDrag(e);
  }
  e.preventDefault();
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx - parseFloat(drag.ghost.style.left)}px, ${e.clientY - drag.dy - parseFloat(drag.ghost.style.top)}px) rotate(${Math.max(-8, Math.min(8, dx / 20))}deg) scale(1.06)`;
  const over = zoneAt(e.clientX, e.clientY);
  for (const z of app.querySelectorAll('.zone.over')) if (z !== over) z.classList.remove('over');
  if (over) over.classList.add('over');
}, { passive: false });
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  if (!d.ghost) return;
  d.ghost.remove(); ui.drag = null; swallowClick = true; setTimeout(() => { swallowClick = false; }, 60);
  const over = !cancel && zoneAt(e.clientX, e.clientY);
  if (over) {
    tryPlace(+over.dataset.z);
    // Dépôt refusé : la carte revient en main, le message explique pourquoi.
    if (ui.sel === d.uid || ui.moveSel === d.uid) { ui.sel = null; ui.moveSel = null; render(); }
  } else {
    ui.sel = null; ui.moveSel = null; render();
  }
}
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', e => endDrag(e, true));
app.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// ---- Interactions ----
function tryPlace(z) {
  if (!canPlay()) return;
  if (ui.genMode) { ui.genZone = z; ui.genMode = false; ui.msg = ''; render(); return; }
  if (ui.moveSel !== null) {
    const from = me().board.findIndex(col => col.some(c => c.uid === ui.moveSel));
    if (z === from) { ui.moveSel = null; ui.msg = ''; }
    else if (freeSlots(z) <= 0) { ui.msg = `La zone ${ZONE_NAMES[z]} est pleine de votre côté.`; play('deny'); }
    else { ui.moves.push({ uid: ui.moveSel, zone: z }); ui.moveSel = null; ui.msg = ''; play('place'); }
    render(); return;
  }
  if (!ui.sel) return;
  const c = handLeft().find(x => x.uid === ui.sel); if (!c) return;
  const d = CARDS[c.id], left = sealsLeft();
  if (freeSlots(z) <= 0) ui.msg = `La zone ${ZONE_NAMES[z]} est pleine de votre côté.`;
  else if (d.x ? left <= 0 : c.cost > left) ui.msg = d.x ? `Il ne vous reste aucun sceau pour ${d.name}.` : `Pas assez de sceaux : ${d.name} coûte ${c.cost}, il vous en reste ${left}.`;
  else { ui.pending.push({ uid: c.uid, id: c.id, zone: z }); ui.sel = null; ui.msg = ''; ui.fx = { list: [[cardSel(c.uid), 'dropin']] }; play('place'); }
  if (ui.msg) play('deny');
  render();
}
function quit() {
  if (ui.ctrl) ui.ctrl.leave();
  store.set('session', null);
  ui.ctrl = null; ui.view = null; ui.screen = menuScreen(); ui.sheet = null; ui.pending = []; ui.lastTurn = 0; render();
}
app.addEventListener('input', e => {
  if (e.target.id === 'login-id') ui.loginId = e.target.value;
  if (e.target.id === 'login-pass') ui.loginPass = e.target.value;
  if (e.target.id === 'deck-name' && ui.edit) ui.edit.name = e.target.value;
  if (e.target.id === 'code') { ui.joinCode = e.target.value.toUpperCase(); e.target.value = ui.joinCode; }
});
app.addEventListener('change', e => { if (e.target.id === 'deck-general' && ui.edit) { ui.edit.general = e.target.value; render(); } });
app.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'login-form' && !ui.busy) doLogin(); });
app.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-hand],[data-card],[data-terrain],[data-general],[data-z],[data-starter],[data-pick],[data-tpick],[data-fam],[data-zoom],[data-stop]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.stop && !e.target.closest('[data-act]')) return;
  if (ds.act) {
    const a = ds.act;
    if (a === 'close') { ui.sheet = null; ui.zoom = null; render(); }
    else if (a === 'zplay' || a === 'zmove') { const uid = ui.zoom.uid; ui.sheet = null; ui.zoom = null;
      if (a === 'zplay') { ui.sel = uid; ui.moveSel = null; } else { ui.moveSel = uid; ui.sel = null; }
      ui.genMode = false; tryPlace(+ds.zone); }
    else if (a === 'zback') { ui.pending = ui.pending.filter(p => p.uid !== ui.zoom.uid); ui.sheet = null; ui.zoom = null; ui.msg = ''; play('unplace'); render(); }
    else if (a === 'zstay') { ui.moves = ui.moves.filter(m => m.uid !== ui.zoom.uid); ui.sheet = null; ui.zoom = null; play('unplace'); render(); }
    else if (a === 'log' || a === 'set') { ui.sheet = a; render(); }
    else if (a === 'create') goOnline('create');
    else if (a === 'join') { if (ui.joinCode.length !== 4) { ui.error = 'Le code fait 4 lettres.'; render(); } else goOnline('join'); }
    else if (a === 'solo') goSolo();
    else if (a === 'copy') { const link = document.getElementById('link');
      navigator.clipboard.writeText(link.value).then(() => { t.textContent = 'Lien copié'; }).catch(() => { link.select(); }); }
    else if (a === 'go') { if (!canPlay()) return; play('validate');
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
    else if (a === 'mute') { setMuted(!isMuted()); render(); }
    else if (a === 'logout') doLogout();
    else if (a === 'retry') boot();
    else if (a === 'starter' && ui.starterPick && !ui.busy) call('POST', '/api/starter', { starter: ui.starterPick });
    else if (a === 'booster' && !ui.busy) openBoosterNow();
    else if (a === 'collection') { ui.screen = 'collection'; ui.error = ''; render(); }
    else if (a === 'shop') openShop();
    else if (a === 'buy-card' && !ui.busy) buy('/api/shop/card', { set: ds.set, card: ds.id });
    else if (a === 'buy-booster' && !ui.busy) buy('/api/shop/booster', { set: ds.set });
    else if (a === 'edit') { editDeck(); render(); }
    else if (a === 'home') { ui.screen = 'home'; ui.edit = null; ui.error = ''; ui.msg = ''; render(); }
    else if (a === 'save-deck' && !ui.busy) saveDeck();
    return;
  }
  if (ds.starter) { ui.starterPick = ds.starter; render(); return; }
  if (ds.fam !== undefined) { ui.colFam = ds.fam; render(); return; }
  if (ds.zoom) { const [kind, id] = ds.zoom.split(':'); openZoom({ kind, id }); render(); return; }
  if (ds.pick) { togglePick(ds.pick); return; }
  if (ds.tpick) { toggleTerrain(ds.tpick); return; }
  if (ds.hand) { const uid = +ds.hand; ui.focus = { kind: 'card', id: ds.id };
    // La carte s'affiche en grand ; en planification elle reste sélectionnée pour être posée en touchant une zone.
    if (canPlay()) { ui.sel = uid; ui.genMode = false; ui.moveSel = null; ui.msg = ''; play('pick'); }
    openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
  if (ds.card) {
    if (ds.pending && canPlay() && ui.sel === null && !ui.genMode && ui.moveSel === null) { ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; openZoom({ kind: 'card', id: ds.id, uid: +ds.card }); render(); return; }
    if (ds.mobile && canPlay() && ui.sel === null && !ui.genMode && (ui.moveSel === null || ui.moveSel === +ds.card)) {
      const uid = +ds.card; ui.focus = { kind: 'card', id: ds.id }; ui.msg = '';
      // Sélectionnée pour un déplacement : toucher ensuite une zone la déplace, comme avant.
      if (!moveOf(uid)) { ui.moveSel = uid; play('pick'); }
      openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
    if (ds.id && ui.sel === null && !ui.genMode && ui.moveSel === null) { ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; openZoom({ kind: 'card', id: ds.id, uid: +ds.card }); render(); return; }
  }
  if (ds.terrain && ui.sel === null && !ui.genMode && ui.moveSel === null) { ui.focus = { kind: 'terrain', id: ds.terrain }; ui.msg = ''; openZoom({ kind: 'terrain', id: ds.terrain }); render(); return; }
  if (ds.general) { ui.focus = { kind: 'general', id: ds.general }; ui.msg = ''; openZoom({ kind: 'general', id: ds.general }); render(); return; }
  const zone = t.closest('[data-z]'); if (zone) tryPlace(+zone.dataset.z);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; ui.zoom = null; render(); } });
app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone.target')) { e.preventDefault(); tryPlace(+e.target.dataset.z); } });

// Reprise d'une partie en ligne après rechargement de la page
const saved = store.get('session', null);
if (saved && saved.room && saved.token) { ui.mode = 'online'; ui.room = saved.room; ui.ctrl = connectOnline(handlers, { t: 'rejoin', room: saved.room, token: saved.token }); }
boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
