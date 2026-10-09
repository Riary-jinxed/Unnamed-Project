// Appli web : connexion, collection et deck, accueil, salon en ligne, partie (en ligne ou contre l'IA).
import './style.css';
import { CARDS, GENERALS, TERRAINS, DECKS, FAMILIES, SLOTS, ZONE_NAMES, renderLog } from '@jeu/engine';
import { STARTERS, DECK_SIZE, DECK_TERRAINS, MAX_COPIES, MAX_DECKS, COLLECTIBLE, OWNABLE, SHARDS_PER_DUPLICATE, SETS, allowedGenerals, allowedTerrains, starterGenerals, deckError } from '@jeu/engine/collection';
import { api } from './api.js';
import { connectOnline } from './net.js';
import { startSolo } from './solo.js';
import { applyCatalog } from '@jeu/engine/catalog';
import { esc, famStyle, rich } from './common.js';
import { unlockAudio, play, isMuted, setMuted } from './sfx.js';
import { FRAMES, BACKS, rewardSourceOf, REWARD_CARDS } from '@jeu/engine/rewards';

const famVar = kw => famStyle(kw[0]);
const kwLine = d => (d.token ? 'Jeton · ' : '') + (d.kw.join(' · ') || 'Neutre');
const typeName = d => d.type === 'C' ? 'Créature' : 'Sort';
const costLabel = (d, cost) => d.x ? 'X' : cost ?? d.cost;
const genLine = g => `${g.fam || 'Générique'} · ${g.kind}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem('jeu-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jeu-' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

const params = new URLSearchParams(location.search);
const ui = {
  screen: 'loading', auth: store.get('auth', null), account: null, loginId: '', loginPass: '', starterPick: null, busy: false,
  booster: null, shop: null, edit: null, deckStep: 0, renaming: null, profile: null, nameDraft: '', colFam: '', joinCode: (params.get('code') || '').toUpperCase(),
  ctrl: null, mode: null, view: null, room: null, lobbyNames: [], error: '',
  pending: [], moves: [], moveSel: null, genZone: null, sel: null, focus: null, msg: '', sheet: null, lastTurn: 0, rematchAsked: false,
  drag: null, fx: null, zoom: null, soloReward: null, avatars: null,
};
const app = document.getElementById('app');

// ---- Contrôleurs (en ligne / IA) ----
const handlers = {
  onLobby(m) { ui.screen = 'lobby'; ui.room = m.room; ui.lobbyNames = m.names; ui.error = ''; store.set('session', { room: m.room, token: m.token }); render(); },
  onView(view, room) {
    if (room) ui.room = room;
    if (view.avatars) ui.avatars = view.avatars;
    const prev = ui.screen === 'game' ? ui.view : null;
    if (view.phase !== 'plan' || view.turn !== ui.lastTurn) { ui.pending = []; ui.moves = []; ui.moveSel = null; ui.genZone = null; ui.sel = null; }
    if (view.phase === 'plan' && view.turn !== ui.lastTurn) ui.msg = '';
    ui.lastTurn = view.turn; ui.view = view; ui.screen = 'game';
    if (view.phase === 'over' && (!ui.sheet || ui.sheet === 'zoom')) { ui.sheet = 'end'; ui.zoom = null; }
    if (view.phase !== 'over') { ui.rematchAsked = false; if (ui.sheet === 'end') ui.sheet = null; }
    viewEffects(prev, view);
    render();
  },
  onError(msg) { ui.error = msg; render(); },
  // Partie contre l'IA terminée : le serveur l'enregistre et renvoie ce qu'elle a rapporté.
  onSoloOver(result) {
    if (!ui.auth) return;
    api('POST', '/api/games/solo', result, ui.auth).then(r => { ui.soloReward = r.reward; if (r.account) ui.account = r.account; render(); }).catch(() => {});
  },
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
  ui.mode = 'online'; ui.error = ''; ui.avatars = null;
  ui.ctrl = connectOnline(handlers, action === 'create' ? { t: 'create', auth: ui.auth } : { t: 'join', room: ui.joinCode, auth: ui.auth });
}
function goSolo() {
  if (!deckReady()) return;
  ui.mode = 'solo'; ui.sheet = null; ui.lastTurn = 0; ui.soloReward = null;
  ui.ctrl = startSolo(handlers, { name: ui.account.name, deck: ui.account.deck });
}

// ---- Compte ----
const MENU = ['loading', 'login', 'starter'];
// Écran d'accueil selon l'état du compte (en dehors d'une partie).
const menuScreen = () => (ui.account ? (ui.account.starter ? 'home' : 'starter') : ui.auth ? 'loading' : 'login');
function setAccount(a) {
  ui.account = a;
  if (a.catalog !== catalogVersion) loadCatalog();
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
// Cartes et sets publiés depuis /admin : appliqués au moteur pour l'affichage et la partie contre l'IA.
let catalogVersion = 0;
async function loadCatalog() {
  try { const { catalog } = await api('GET', '/api/catalog'); catalogVersion = applyCatalog(catalog); render(); }
  catch { /* cartes d'origine en attendant */ }
}
async function boot() {
  await loadCatalog();
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
// Decks : jusqu'à MAX_DECKS. Création et modification en trois étapes : général, terrains, cartes.
const deckById = id => ui.account.decks.find(d => d.id === id);
const maxDecks = () => ui.account?.maxDecks ?? MAX_DECKS;
// Étapes accessibles : les terrains une fois le général choisi, les cartes une fois les terrains choisis.
const stepOpen = (e, i) => i === 0 || (i === 1 ? !!e.general : !!e.general && e.terrains.length === DECK_TERRAINS);
function editDeck(id = ui.account.active, back = 'home') {
  const d = id && deckById(id);
  ui.edit = d ? { id: d.id, name: d.name, cards: d.cards.slice(), terrains: d.terrains.slice(), general: d.general, back }
    : { id: null, name: `Deck ${ui.account.decks.length + 1}`, cards: [], terrains: [], general: null, back };
  // Un deck commencé reprend à la dernière étape accessible.
  ui.deckStep = [0, 1, 2].filter(i => stepOpen(ui.edit, i)).pop();
  ui.screen = 'deck'; ui.error = ''; ui.msg = '';
}
async function saveDeck() {
  const e = ui.edit;
  const r = await call('PUT', '/api/decks', { id: e.id, name: e.name, general: e.general, terrains: e.terrains, cards: e.cards });
  if (r) { ui.screen = e.back; ui.edit = null; ui.msg = ''; render(); }
}
function openDecks() { ui.screen = 'decks'; ui.error = ''; ui.msg = ''; render(); }
async function deckAction(act, id) {
  const d = deckById(id); if (!d) return;
  if (act === 'deck-play') call('POST', '/api/decks/play', { id });
  else if (act === 'deck-reset' && confirm(`Remettre « ${d.name} » à zéro ? Son général, ses terrains et ses cartes seront retirés.`)) call('POST', '/api/decks/reset', { id });
  else if (act === 'deck-delete' && confirm(`Supprimer « ${d.name} » ?`)) call('POST', '/api/decks/delete', { id });
  else if (act === 'deck-rename') { ui.renaming = { id, name: d.name }; ui.sheet = 'rename'; render(); }
  else if (act === 'deck-edit') { editDeck(id, 'decks'); render(); }
}
async function renameDeck() {
  const r = ui.renaming; if (!r) return;
  ui.sheet = null; ui.renaming = null;
  await call('POST', '/api/decks/rename', r);
}

// ---- Profil ----
function openProfile() {
  ui.screen = 'profile'; ui.error = ''; ui.msg = ''; ui.nameDraft = ui.account.name; ui.profile = null; render();
  call('GET', '/api/profile').then(r => { if (r) { ui.profile = r.stats; ui.progressInfo = { achievements: r.achievements, collection: r.collection }; render(); } });
}
async function saveName() {
  if (await call('PUT', '/api/profile', { name: ui.nameDraft })) { ui.msg = 'Pseudo enregistré.'; render(); }
}
// Image de profil : recadrée au centre en carré et réduite à 160 px avant l'envoi (affichée en cercle).
const AVATAR_SIZE = 160;
async function pickAvatar(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { ui.error = 'Choisissez une image.'; render(); return; }
  let url;
  try {
    const img = new Image(); url = URL.createObjectURL(file); img.src = url; await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
    c.width = c.height = AVATAR_SIZE;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    let data = c.toDataURL('image/webp', 0.85);
    if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.85);
    if (await call('PUT', '/api/profile', { avatar: data })) { ui.msg = 'Image de profil changée.'; render(); }
  } catch { ui.error = 'Impossible de lire cette image.'; render(); }
  finally { if (url) URL.revokeObjectURL(url); }
}
const initials = name => (String(name || '?').trim().match(/\S/g) || ['?'])[0].toUpperCase();
const avatarBare = (a, cls = '') => (a.avatar ? `<img class="avatar ${cls}" src="${esc(a.avatar)}" alt="">` : `<span class="avatar initials ${cls}" aria-hidden="true">${esc(initials(a.name))}</span>`);
// Le cadre choisi entoure l'image de profil.
const avatarHTML = (a, cls = '', frame = a.progress?.frame) => (frame ? `<span class="frame frame-${frame} ${cls}">${avatarBare(a, cls)}</span>` : avatarBare(a, cls));

// ---- Progression : niveau, missions, récompenses, personnalisation ----
const prog = () => ui.account?.progress || { level: 1, xp: 0, xpNext: 1, missions: [], inbox: [], cosmetics: { titles: [], frames: [], backs: [] }, freeBoosters: 0 };
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const levelBar = p => `<div class="lvl"><span class="lvlnum num">Niv. ${p.level}</span><div class="bar" role="progressbar" aria-valuenow="${p.xp}" aria-valuemin="0" aria-valuemax="${p.xpNext}" aria-label="Expérience"><span style="width:${pct(p.xp, p.xpNext)}%"></span></div><small class="hint num">${p.xp}/${p.xpNext} XP</small></div>`;
const gains = r => [r.xp ? `+${r.xp} XP` : '', r.shards ? `+${r.shards} Éclats` : '', r.boosters ? `+${r.boosters} booster${r.boosters > 1 ? 's' : ''} offert${r.boosters > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
const titleLabel = id => prog().cosmetics.titles.find(t => t.id === id)?.label || '';
function missionsHTML() {
  const p = prog();
  if (!p.missions.length) return '';
  return `<div class="gal-h">Missions du jour</div><div class="missions">${p.missions.map((m, i) => `<div class="mission ${m.done ? 'done' : ''}">
    <div class="row" style="justify-content:space-between;gap:8px"><span>${m.done ? '✓ ' : ''}${esc(m.label)}</span><small class="hint num">${gains(m)}</small></div>
    <div class="row" style="gap:8px"><div class="bar" style="flex:1"><span style="width:${pct(m.n, m.target)}%"></span></div><small class="num">${m.n}/${m.target}</small>
      ${!m.done && p.rerollsLeft ? `<button class="btn sm" data-act="reroll" data-i="${i}" ${ui.busy ? 'disabled' : ''}>Changer</button>` : ''}</div></div>`).join('')}</div>
    <p class="hint" style="margin:0">Nouvelles missions chaque jour à minuit.${p.rerollsLeft ? ` Vous pouvez en changer ${p.rerollsLeft} aujourd'hui.` : ''}</p>`;
}
// Ce que contient une récompense : gains, carte, titre, cadre, dos de carte.
function rewardItem(r) {
  const extra = [r.title ? `Titre « ${esc(titleLabel(r.title) || r.title)} »` : '', r.frame ? esc(FRAMES[r.frame] || r.frame) : '', r.back ? esc(BACKS[r.back] || r.back) : ''].filter(Boolean).join(' · ');
  return `<div class="reward"><div><b>${esc(r.label)}</b>${gains(r) ? `<div class="num">${gains(r)}</div>` : ''}${extra ? `<div class="hint">${extra}</div>` : ''}</div>
    ${r.card ? `<button class="ccard" data-zoom="${zoomKey(r.card)}">${anyCard(r.card)}</button>` : ''}</div>`;
}
function closeInbox() {
  ui.sheet = null; ui.account.progress.inbox = [];
  api('POST', '/api/rewards/seen', {}, ui.auth).then(r => { if (r.account) { ui.account = r.account; render(); } }).catch(() => {});
}
// Fin de partie : XP, Éclats et niveau gagnés.
function endRewardHTML() {
  const r = ui.mode === 'online' ? ui.view.reward : ui.soloReward;
  if (!r) return `<p class="hint" style="margin:0">${ui.auth ? 'Calcul des récompenses…' : ''}</p>`;
  return `<div class="endreward">${levelBar(r.progress)}
    <p style="margin:0">${r.rewarded ? (gains(r) || 'Pas de gain pour cette partie.') : 'Plus de récompense de partie aujourd\'hui ; les missions avancent toujours.'}${r.levelUp ? ` · <b>Niveau ${r.progress.level} !</b>` : ''}${r.missions ? ` · ${r.missions} mission${r.missions > 1 ? 's' : ''} accomplie${r.missions > 1 ? 's' : ''}` : ''}</p></div>`;
}
async function equip(body, okMsg) { if (await call('PUT', '/api/cosmetics', body)) { ui.msg = okMsg; render(); } }

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
  if (c.hidden) return `<div class="mc back back-${esc(badgeOf(1 - ui.view.seat)?.back || 'classique')}" aria-label="Carte cachée"></div>`;
  const d = CARDS[c.id]; const pw = c.revealed ? c.power : (opts.power ?? d.power);
  const cls = c.revealed ? (pw > d.power ? 'up' : pw < d.power ? 'down' : '') : '';
  const mv = opts.mine && moveOf(c.uid);
  const mobile = opts.mine && c.mobile && canPlay();
  return `<div class="mc ${opts.pending || !c.revealed ? 'pending' : ''} ${mobile ? 'mobile' : ''} ${ui.moveSel === c.uid ? 'msel' : ''} ${mv ? 'moving' : ''} ${ui.drag === c.uid ? 'dragging' : ''}" style="${famVar(d.kw)}"
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
  if (ui.moveSel !== null) return `<div class="hint">Touchez la zone vers laquelle déplacer ${esc(CARDS[me().board.flat().find(c => c.uid === ui.moveSel)?.id]?.name || 'cette créature')}. Le déplacement se fait à la révélation.</div>`;
  if (v.phase === 'plan' && v.ready.me) return `<div class="wait">Tour validé. En attente de ${esc(v.foe.name)}…</div>`;
  if (ui.sel !== null && canPlay()) return `<div class="hint">Touchez une de vos zones pour poser ${esc(CARDS[me().hand.find(c => c.uid === ui.sel)?.id]?.name || 'cette carte')}.</div>`;
  if (!f) return `<div class="hint">Touchez une carte pour la jouer, ou glissez-la vers une zone.${canPlay() && me().board.flat().some(c => c.mobile) ? ' Une créature marquée ⇄ peut changer de zone.' : ''}</div>`;
  if (f.kind === 'card') { const d = CARDS[f.id];
    return `<div class="h"><b>${esc(d.name)}</b><span class="meta">${typeName(d)} · coût ${d.x ? 'X' : d.cost}${d.type === 'C' ? ` · puissance ${d.power}` : ''} · ${kwLine(d)}</span></div><div>${d.text ? rich(d.text) : 'Pas d\'effet.'}</div>`; }
  if (f.kind === 'terrain') { const t = TERRAINS[f.id]; return `<div class="h"><b>${t.name}</b><span class="meta">Terrain</span></div><div>${rich(t.text)}</div>`; }
  if (f.kind === 'general') { const g = GENERALS[f.id]; return `<div class="h"><b>${g.name}</b><span class="meta">Général · ${genLine(g)}</span></div><div>${rich(g.text)}</div>`; }
  return '';
}
// Titre, niveau, cadre et dos de carte de chaque joueur : envoyés par le serveur en ligne ; contre l'IA, ceux du compte.
const badgeOf = seat => ui.view.badges?.[seat] || (seat === ui.view.seat && ui.account ? prog().badge : null);
// Image de profil : envoyée une fois par le serveur en ligne ; contre l'IA, la sienne seulement.
const avatarOf = seat => (ui.mode === 'online' ? ui.avatars?.[seat] : null) || (seat === ui.view.seat ? ui.account?.avatar : null) || null;
// Carte du général, toujours visible à côté du joueur. La sienne brille quand elle peut être activée.
function genSlot(side, isMe, canGen) {
  const g = GENERALS[side.general];
  const state = isMe && ui.genZone !== null ? 'armed' : g.activate && side.generalUsed ? 'used' : isMe && canGen ? 'ready' : '';
  const note = state === 'armed' ? 'Activé ce tour' : state === 'used' ? 'Utilisé' : g.activate ? `Activable${g.activateCost ? ` · ${g.activateCost} sceau` : ''}` : g.kind;
  return `<button class="gencard ${state}" style="${famVar([g.fam])}" data-general="${side.general}" data-side="${isMe ? 'me' : 'foe'}" aria-label="Général : ${esc(g.name)}">
    <span class="gk">Général</span><span class="gn">${esc(g.name)}</span><span class="gs">${esc(note)}</span></button>`;
}
function pbar(side, isMe, connected, canGen = false) {
  const seat = isMe ? ui.view.seat : 1 - ui.view.seat, b = badgeOf(seat);
  const who = { name: side.name, avatar: avatarOf(seat), progress: { frame: b?.frame } };
  const stats = [
    !isMe ? `<span class="num" title="Sceaux de l'adversaire ce tour">Sceaux ${side.seals}</span>` : '',
    `<span class="num">Main ${side.handCount}</span>`, `<span class="num">Deck ${side.deckCount}</span>`,
    side.treasure ? `<span class="num" title="Sceaux non dépensés aux tours précédents">Trésor ${side.treasure}</span>` : '',
    side.perfectTurns ? `<span class="num" title="Tours finis avec tous les sceaux dépensés">Grâce ${side.perfectTurns}</span>` : '',
  ].filter(Boolean).join('');
  const ready = !isMe && ui.view.phase === 'plan' && ui.view.ready.foe;
  return `<div class="pbar ${isMe ? 'me' : 'foe'}">
    <span class="pav">${avatarHTML(who, 'pa')}${!isMe && ui.mode === 'online' ? `<span class="dot ${connected ? '' : 'off'}" title="${connected ? 'Connecté' : 'Déconnecté'}"></span>` : ''}</span>
    <div class="pid"><div class="pline"><span class="who">${isMe ? 'Vous' : esc(side.name)}</span>${b ? `<small class="lv num">niv. ${b.level}</small>` : ''}${ready ? '<span class="chip ok">Prêt</span>' : ''}</div>
      ${b?.title ? `<div class="ptitle">${esc(b.title)}</div>` : ''}
      <div class="pstats">${stats}</div></div>
    ${genSlot(side, isMe, canGen)}</div>`;
}
// Tour en cours et sceaux, juste au-dessus de la main : sceaux libres, déjà engagés, et ce que coûterait la carte choisie.
function tempoHTML(seals) {
  const v = ui.view, total = Math.max(v.me.seals, 0);
  let pips = ''; for (let t = 1; t <= v.turns; t++) pips += `<span class="pip ${t < v.turn ? 'past' : t === v.turn ? 'now' : ''}"></span>`;
  const selCost = ui.sel !== null && canPlay() ? (CARDS[me().hand.find(c => c.uid === ui.sel)?.id]?.x ? Math.max(seals, 0) : handCost(ui.sel)) : 0;
  let tokens = '';
  if (total <= 12) for (let i = 0; i < total; i++) {
    const cls = i >= seals ? 'spent' : i >= seals - selCost ? 'cost' : '';
    tokens += `<span class="tok ${cls}"></span>`;
  }
  const last = v.turn === v.turns;
  return `<div class="tempo ${last ? 'last' : ''}">
    <div class="tturn"><span class="tl">${last ? 'Dernier tour' : 'Tour'}</span><b class="num">${v.turn}<small>/${v.turns}</small></b><span class="pips" aria-hidden="true">${pips}</span></div>
    <div class="tseals" aria-label="Sceaux restants : ${seals} sur ${total}"><span class="tl">Sceaux</span><span class="toks" aria-hidden="true">${tokens}</span><b class="num">${seals}<small>/${total}</small></b></div></div>`;
}
function renderGame() {
  const v = ui.view, m = v.me, f = v.foe, g = GENERALS[m.general];
  const play = canPlay();
  let board = '';
  for (const z of [0, 1, 2]) {
    const a = f.zonePower[z], b = m.zonePower[z];
    const mz = ui.moveSel !== null ? me().board.findIndex(col => col.some(c => c.uid === ui.moveSel)) : -1;
    const target = play && ((ui.sel && freeSlots(z) > 0) || (ui.moveSel !== null && z !== mz && freeSlots(z) > 0));
    const won = b > a ? 'won-me' : a > b ? 'won-foe' : '';
    board += `<div class="zone ${won} ${target ? 'target' : ''}" data-z="${z}" ${target ? 'tabindex="0" role="button"' : ''} aria-label="Zone ${ZONE_NAMES[z]}">
      ${terrainChip(f, z, false)}${slots(f, z, false)}
      <div class="score"><span class="v foe ${a > b ? 'lead' : ''}">${a}</span><span class="zn">${ZONE_NAMES[z]}</span><span class="v me ${b > a ? 'lead' : ''}">${b}</span></div>
      ${slots(m, z, true)}${terrainChip(m, z, true)}
      ${ui.genZone === z && g.needsZone ? `<div class="gmark">Général activé ici</div>` : ''}</div>`;
  }
  const planning = v.phase === 'plan';
  const seals = planning ? sealsLeft() : m.seals;
  const hand = (planning ? handLeft() : m.hand).map(c => { const d = CARDS[c.id];
    const cant = d.x ? seals <= 0 : c.cost > seals;
    const pcls = c.power > d.power ? 'up' : c.power < d.power ? 'down' : '';
    return `<button class="hc ${ui.sel === c.uid ? 'sel' : ''} ${ui.drag === c.uid ? 'dragging' : ''} ${cant ? 'cant' : ''}" style="${famVar(d.kw)}" data-hand="${c.uid}" data-id="${c.id}">
      <span class="top2"><span class="seal">${costLabel(d, c.cost)}</span>${d.type === 'C' ? `<span class="p num ${pcls}">${c.power}</span>` : '<span class="t">Sort</span>'}</span>
      <span class="n">${esc(d.name)}</span>${d.text ? `<span class="x">${rich(d.text)}</span>` : `<span class="k">${kwLine(d)}</span>`}</button>`; }).join('');
  const canGen = play && g.activate && !m.generalUsed && m.seals >= (g.activateCost || 0);
  const goLabel = v.phase === 'reveal' ? 'Révélation…' : v.ready.me ? 'En attente…' : v.turn === v.turns ? 'Valider le dernier tour' : 'Valider le tour';
  return `
  <div class="top"><span class="title">${ui.mode === 'online' ? `Partie ${esc(ui.room || '')}` : 'Contre l\'IA'}</span>
    ${muteBtn()}<button class="btn" data-act="log">Journal</button><button class="btn" data-act="set">Cartes</button></div>
  ${pbar(f, false, v.connected[1 - v.seat])}
  <div class="board">${board}</div>
  ${pbar(m, true, true, canGen)}
  <div class="info" aria-live="polite">${infoHTML()}</div>
  <div class="hand" id="hand">${hand || '<span class="empty">Main vide.</span>'}</div>
  <div class="dock">${tempoHTML(seals)}
    <div class="actions"><button class="btn" data-act="quit">Quitter</button>
      <button class="btn primary grow" data-act="go" ${play ? '' : 'disabled'}>${goLabel}</button></div></div>`;
}
// ---- Écrans du compte : connexion, deck de départ, accueil, collection, deck ----
const errLine = () => (ui.error ? `<p class="err" role="alert">${esc(ui.error)}</p>` : '');
const owned = id => (ui.account && ui.account.cards[id]) || 0;
// Éclats gagnés par doublon : réglable depuis /admin, le serveur l'envoie avec le compte.
const shardRate = () => ui.account?.shardRate ?? SHARDS_PER_DUPLICATE;
const famOfCard = id => GENERALS[id] ? GENERALS[id].fam : CARDS[id].kw.find(k => FAMILIES.includes(k)) || null;
const nameOf = id => (CARDS[id] || GENERALS[id]).name;
// Ordre d'affichage : famille, généraux d'abord, puis coût, puis nom.
const costKey = id => GENERALS[id] ? -1 : CARDS[id].cost;
const famRank = id => { const i = FAMILIES.indexOf(famOfCard(id)); return i < 0 ? FAMILIES.length : i; };
const byFamCost = (a, b) => famRank(a) - famRank(b) || costKey(a) - costKey(b) || nameOf(a).localeCompare(nameOf(b));
// Carte ou général, tel qu'il sort d'un booster ou s'affiche dans la collection.
const anyCard = id => GENERALS[id] ? genCard(id) : fullCard(id);
const zoomKey = id => `${GENERALS[id] ? 'general' : 'card'}:${id}`;
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
    const gens = starterGenerals(k).filter(g => GENERALS[g].fam).map(g => GENERALS[g].name).join(', ');
    return `<button class="deckopt ${ui.starterPick === k ? 'sel' : ''}" data-starter="${k}" style="${famVar([d.fam])}" aria-pressed="${ui.starterPick === k}">
      <span class="eyebrow">${d.fam}</span><h3>${d.name}</h3><small>Généraux : ${gens}, plus les généraux neutres.</small></button>`; }).join('');
  return `<div class="top"><span class="title">Bienvenue, ${esc(ui.account.name)}</span><button class="btn" data-act="set">Voir les cartes</button><button class="btn" data-act="logout">Se déconnecter</button></div>
  <div class="setup">
    <p>Choisissez votre deck de départ. Ses ${DECK_SIZE} cartes et ses généraux forment votre collection ; les boosters l'agrandissent ensuite, généraux compris. Ce choix est définitif.</p>
    <div class="decks starters">${opts}</div>
    ${errLine()}
    <div class="row"><button class="btn primary" data-act="starter" ${ui.starterPick && !ui.busy ? '' : 'disabled'}>${ui.starterPick ? `Prendre ${DECKS[ui.starterPick].name}` : 'Choisissez un deck'}</button></div>
  </div>`;
}
function renderHome() {
  const a = ui.account, d = a.deck, g = d && GENERALS[d.general], p = prog();
  const total = OWNABLE.filter(owned).length;
  const deckErr = d ? deckError(d, a) : 'Aucun deck.';
  return `
  <div class="top"><button class="profile-btn" data-act="profile" aria-label="Mon profil">${avatarHTML(a)}</button><span class="title">Jeu de cartes</span>${muteBtn()}<button class="btn" data-act="set">Voir les cartes</button><button class="btn" data-act="logout">Se déconnecter</button></div>
  <div class="setup">
    <div class="card-box booster ${a.boosterReady ? 'ready' : ''}">
      <div><span class="eyebrow">Bonjour ${esc(a.name)}</span><h2 style="font-size:22px">Booster du jour</h2></div>
      ${a.boosterReady ? `<button class="btn primary" data-act="booster" ${ui.busy ? 'disabled' : ''}>Ouvrir le booster</button>`
        : '<p class="hint" style="margin:0">Déjà ouvert aujourd\'hui. Le prochain arrive demain à minuit.</p>'}
    </div>
    <div class="card-box">
      <div class="row" style="justify-content:space-between"><span class="eyebrow">Progression${p.title ? ` · <span class="ptitle">${esc(titleLabel(p.title))}</span>` : ''}</span><button class="btn sm" data-act="profile">Succès et titres</button></div>
      ${levelBar(p)}
      ${p.freeBoosters ? `<div class="row"><span style="flex:1"><b>${p.freeBoosters} booster${p.freeBoosters > 1 ? 's' : ''} offert${p.freeBoosters > 1 ? 's' : ''}</b> à ouvrir dans le set de votre choix.</span><button class="btn primary" data-act="shop">Ouvrir</button></div>` : ''}
      ${missionsHTML()}
    </div>
    <div class="card-box">
      <div><span class="eyebrow">Deck joué</span><h2 style="font-size:22px">${esc(d ? d.name : 'Aucun deck')}</h2></div>
      ${d ? `<p style="margin:0">Général : ${g ? `<button class="chip" data-zoom="general:${d.general}">${g.name}</button>` : 'à choisir'} · ${d.cards.length} cartes · ${d.terrains.length} terrains</p>` : ''}
      ${deckErr ? `<p class="err" style="margin:0">${esc(deckErr)}</p>` : ''}
      <div class="row"><button class="btn" data-act="decks">Mes decks (${a.decks.length}/${maxDecks()})</button><button class="btn" data-act="edit">Modifier ce deck</button><button class="btn" data-act="collection">Ma collection (${total}/${OWNABLE.length})</button></div>
    </div>
    <div class="card-box booster">
      <div><span class="eyebrow">Boutique</span><h2 style="font-size:22px"><span class="num">${a.shards}</span> Éclats</h2>
        <small class="hint">Chaque doublon rapporte ${shardRate()} Éclats.</small></div>
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
// Cartes de récompense : on dit comment les obtenir.
function lockLabel(id) {
  const src = rewardSourceOf(id);
  if (!src) return 'Pas encore obtenue';
  const set = SETS.find(x => x.id === src.set)?.name || src.set;
  return src.kind === 'family' ? `Récompense : famille ${src.fam} complète (${set})` : `Récompense : set ${set} complet`;
}
function renderCollection() {
  const a = ui.account, fams = [...FAMILIES, 'Neutre'];
  const shown = OWNABLE.filter(id => !ui.colFam || (famOfCard(id) || 'Neutre') === ui.colFam).sort(byFamCost);
  const tile = id => { const n = owned(id);
    return `<button class="ccard ${n ? '' : 'locked'}" data-zoom="${zoomKey(id)}" aria-label="${esc(nameOf(id))}${n ? `, ${n} exemplaire${n > 1 ? 's' : ''}` : ', pas encore obtenue'}">
      ${anyCard(id)}${n > 1 ? `<span class="count num">×${n}</span>` : ''}${n ? '' : `<span class="lock">${esc(lockLabel(id))}</span>`}</button>`; };
  return `<div class="top"><span class="title">Ma collection</span><button class="btn" data-act="edit">Modifier le deck</button><button class="btn" data-act="home">Retour</button></div>
  <p class="hint" style="margin:0">${OWNABLE.filter(owned).length} cartes sur ${OWNABLE.length}, généraux compris. Touchez une carte pour la voir en grand.</p>
  <div class="seg famseg" role="group" aria-label="Famille"><button data-fam="" class="${ui.colFam ? '' : 'on'}">Toutes</button>${fams.map(f => `<button data-fam="${f}" class="${ui.colFam === f ? 'on' : ''}">${f}</button>`).join('')}</div>
  <div class="gallery">${shown.map(tile).join('')}</div>
  <div class="gal-h">Vos terrains</div><p class="hint" style="margin:0">Les terrains neutres, et ceux des familles dont vous possédez un général.</p>
  <div class="gallery">${allowedTerrains(a).map(terrainCard).join('')}</div>`;
}
// Boutique : un espace par set ; les sets à venir y ont déjà leur place.
function renderShop() {
  const sh = ui.shop, a = ui.account;
  const top = `<div class="top"><span class="title">Boutique</span><span class="chip num">${a.shards} Éclats</span><button class="btn" data-act="home">Retour</button></div>`;
  if (!sh) return `${top}${errLine()}<p class="wait">Chargement…</p>`;
  const P = sh.prices;
  const offer = (set, o) => {
    const label = o.bought ? 'Achetée' : o.owned ? 'Déjà dans votre collection' : `Acheter · ${P.cardPrice} Éclats`;
    return `<div class="offer"><button class="ccard" data-zoom="${zoomKey(o.id)}">${anyCard(o.id)}</button>
      <button class="btn ${o.bought || o.owned ? '' : 'primary'}" data-act="buy-card" data-set="${set.id}" data-id="${o.id}" ${o.bought || o.owned || a.shards < P.cardPrice || ui.busy ? 'disabled' : ''}>${label}</button></div>`;
  };
  const section = set => set.open ? `<section class="card-box shopset">
      <div><span class="eyebrow">${set.size} cartes</span><h2 style="font-size:22px">${esc(set.name)}</h2></div>
      <div class="gal-h">Cartes du jour</div><p class="hint" style="margin:0">${set.offers.length > 1 ? `${set.offers.length} cartes choisies` : 'Une carte choisie'} pour vous, renouvelées chaque jour à minuit.</p>
      <div class="gallery">${set.offers.map(o => offer(set, o)).join('')}</div>
      <div class="gal-h">Booster du set</div>
      <div class="row"><p class="hint" style="margin:0;flex:1">${P.boosterSize} cartes au hasard parmi les ${set.size} du set, toutes avec la même chance. Les doublons rapportent ${shardRate()} Éclats chacun.</p>
        <button class="btn primary" data-act="buy-booster" data-set="${set.id}" ${a.shards < P.boosterPrice || ui.busy ? 'disabled' : ''}>Acheter · ${P.boosterPrice} Éclats</button>
        ${sh.freeBoosters ? `<button class="btn primary" data-act="free-booster" data-set="${set.id}" ${ui.busy ? 'disabled' : ''}>Ouvrir un booster offert (${sh.freeBoosters})</button>` : ''}</div>
    </section>` : `<section class="card-box shopset soon"><div><span class="eyebrow">Bientôt disponible</span><h2 style="font-size:22px">${esc(set.name)}</h2></div>
      <p class="hint" style="margin:0">${esc(set.teaser)}</p></section>`;
  return `${top}${errLine()}${sh.sets.map(section).join('')}`;
}

// Liste des decks du joueur : jouer, modifier, renommer, remettre à zéro, supprimer, créer.
function renderDecks() {
  const a = ui.account, full = a.decks.length >= maxDecks();
  const item = d => {
    const err = deckError(d, a), g = GENERALS[d.general], on = d.id === a.active;
    return `<div class="card-box deckitem ${on ? 'active' : ''}" style="${famVar([g?.fam])}">
      <div><span class="eyebrow">${on ? 'Deck joué' : err ? 'Incomplet' : 'Prêt à jouer'}</span><h2 style="font-size:22px">${esc(d.name)}</h2></div>
      <p style="margin:0">${g ? esc(g.name) : 'Pas de général'} · <span class="num">${d.terrains.length}/${DECK_TERRAINS}</span> terrains · <span class="num">${d.cards.length}/${DECK_SIZE}</span> cartes</p>
      ${err && (d.general || d.cards.length || d.terrains.length) ? `<p class="hint" style="margin:0">${esc(err)}</p>` : ''}
      <div class="row">
        ${on ? '' : `<button class="btn ${err ? '' : 'primary'}" data-act="deck-play" data-id="${d.id}" ${err || ui.busy ? 'disabled' : ''}>Jouer ce deck</button>`}
        <button class="btn" data-act="deck-edit" data-id="${d.id}">Modifier</button>
        <button class="btn" data-act="deck-rename" data-id="${d.id}">Renommer</button>
        <button class="btn" data-act="deck-reset" data-id="${d.id}" ${ui.busy ? 'disabled' : ''}>Remettre à 0</button>
        <button class="btn" data-act="deck-delete" data-id="${d.id}" ${a.decks.length <= 1 || ui.busy ? 'disabled' : ''}>Supprimer</button>
      </div></div>`;
  };
  return `<div class="top"><span class="title">Mes decks</span><span class="chip num">${a.decks.length}/${maxDecks()}</span><button class="btn" data-act="home">Retour</button></div>
  <p class="hint" style="margin:0">Jusqu'à ${maxDecks()} decks. Le deck joué sert en ligne et contre l'IA ; un deck incomplet est gardé mais ne peut pas être joué.</p>
  ${errLine()}
  ${a.decks.map(item).join('')}
  <div class="row"><button class="btn primary" data-act="deck-new" ${full ? 'disabled' : ''}>Nouveau deck</button>${full ? `<span class="hint">Supprimez un deck pour en créer un autre.</span>` : ''}</div>`;
}

// Constructeur de deck en trois étapes : le général, puis les terrains, puis les cartes de la collection.
const STEPS = ['Général', 'Terrains', 'Cartes'];
function renderDeck() {
  const a = ui.account, e = ui.edit, err = deckError(e, a), step = ui.deckStep;
  const counts = [e.general ? '1/1' : '0/1', `${e.terrains.length}/${DECK_TERRAINS}`, `${e.cards.length}/${DECK_SIZE}`];
  const done = [!!e.general, e.terrains.length === DECK_TERRAINS, e.cards.length === DECK_SIZE];
  const stepper = STEPS.map((n, i) => `<button class="step ${step === i ? 'on' : ''} ${done[i] ? 'done' : ''}" data-step="${i}" ${stepOpen(e, i) ? '' : 'disabled'} aria-current="${step === i ? 'step' : 'false'}">
    <span class="sn">${i + 1}</span><span>${n}</span><span class="num sc">${counts[i]}</span></button>`).join('');
  let body = '', help = '';
  if (step === 0) {
    help = 'Choisissez le général qui mènera ce deck parmi ceux de votre collection. Les boosters en donnent d\'autres.';
    body = `<div class="gallery">${allowedGenerals(a).sort(byFamCost).map(k => `<button class="ccard pickcard ${e.general === k ? 'on' : ''}" data-gpick="${k}" aria-pressed="${e.general === k}">${genCard(k)}</button>`).join('')}</div>`;
  } else if (step === 1) {
    help = `Choisissez ${DECK_TERRAINS} terrains différents : les neutres et ceux des familles de vos généraux.`;
    body = `<div class="gallery">${allowedTerrains(a).map(k => `<button class="ccard pickcard ${e.terrains.includes(k) ? 'on' : ''}" data-tpick="${k}" aria-pressed="${e.terrains.includes(k)}">${terrainCard(k)}</button>`).join('')}</div>`;
  } else {
    help = `Choisissez ${DECK_SIZE} cartes différentes de votre collection.`;
    const row = (id, on) => { const d = CARDS[id];
      return `<button class="pickrow ${on ? 'on' : ''}" data-pick="${id}" style="${famVar(d.kw)}" aria-pressed="${on}">
        <span class="seal">${d.x ? 'X' : d.cost}</span><span class="pn"><b>${esc(d.name)}</b><small>${kwLine(d)} · ${d.text ? rich(d.text) : 'Pas d\'effet.'}</small></span>
        ${d.type === 'C' ? `<span class="p num">${d.power}</span>` : '<span class="p sm">Sort</span>'}</button>`; };
    body = `<div class="picklist">${COLLECTIBLE.filter(owned).sort(byFamCost).map(id => row(id, e.cards.includes(id))).join('')}</div>`;
  }
  const next = step < 2 && stepOpen(e, step + 1);
  return `<div class="top"><span class="title">${e.id ? 'Modifier le deck' : 'Nouveau deck'}</span><button class="btn" data-act="deck-cancel">Annuler</button>
    <button class="btn primary" data-act="save-deck" ${ui.busy ? 'disabled' : ''}>Enregistrer</button></div>
  <div class="field"><label class="eyebrow" for="deck-name">Nom du deck</label><input id="deck-name" maxlength="30" value="${esc(e.name)}"></div>
  <div class="deckbar steps" role="group" aria-label="Étapes">${stepper}</div>
  <p class="hint" style="margin:0">${esc(ui.msg || help)}</p>
  ${errLine()}
  ${body}
  <div class="row">${step > 0 ? '<button class="btn" data-act="step-prev">Étape précédente</button>' : ''}
    ${step < 2 ? `<button class="btn primary" data-act="step-next" ${next ? '' : 'disabled'}>Étape suivante : ${STEPS[step + 1]}</button>` : ''}
    <span class="hint">${err ? `Pas encore jouable : ${esc(err)} Vous pouvez enregistrer et finir plus tard.` : 'Deck complet, prêt à jouer.'}</span></div>`;
}

// Profil : image, pseudo, sets complétés et statistiques de victoire.
// Personnalisation : titre, cadre de profil et dos de carte débloqués.
function customizeHTML() {
  const a = ui.account, p = prog(), c = p.cosmetics;
  return `<div class="card-box"><div><span class="eyebrow">Personnalisation</span><h2 style="font-size:22px">Titre, cadre et dos de carte</h2></div>
    <div class="field"><label class="eyebrow" for="title-pick">Titre affiché sous votre pseudo</label>
      <select id="title-pick" ${c.titles.length ? '' : 'disabled'}><option value="">Aucun titre</option>${c.titles.map(t => `<option value="${esc(t.id)}" ${p.title === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
      ${c.titles.length ? '' : '<small class="hint">Les succès et les familles complétées donnent des titres.</small>'}</div>
    <div class="gal-h">Cadre de profil</div>
    <div class="picks"><button class="pickc ${p.frame ? '' : 'on'}" data-frame="">${avatarHTML(a, '', null)}<small>Sans cadre</small></button>
      ${Object.entries(FRAMES).map(([id, label]) => { const ok = c.frames.some(f => f.id === id);
        return `<button class="pickc ${p.frame === id ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-frame="${id}"` : 'disabled'} title="${ok ? '' : 'À débloquer'}">${avatarHTML(a, '', id)}<small>${esc(label)}</small></button>`; }).join('')}</div>
    <div class="gal-h">Dos de carte</div><p class="hint" style="margin:0">Votre adversaire le voit sur vos cartes cachées.</p>
    <div class="picks">${Object.entries(BACKS).map(([id, label]) => { const ok = c.backs.some(b => b.id === id);
      return `<button class="pickc ${p.back === id ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-back="${id}"` : 'disabled'}><span class="mc back back-${id}"></span><small>${esc(label)}</small></button>`; }).join('')}</div>
  </div>`;
}
// Familles de chaque set : avancement et récompense (carte unique, titre, dos) ; set complet : carte Dieu.
function familiesHTML() {
  const info = ui.progressInfo?.collection; if (!info) return '';
  return info.map(set => `<div class="gal-h">${esc(set.name)} : familles</div><div class="famlist">${set.families.map(f => `
    <div class="famrow ${f.done ? 'done' : ''}" style="${famStyle(f.fam)}"><span class="fdot"></span><b>${esc(f.fam)}</b><span class="num hint">${f.owned}/${f.total}</span>
      ${f.card ? `<button class="chip" data-zoom="${zoomKey(f.card)}">${esc(nameOf(f.card))}</button>` : ''}${f.done ? '<span class="ok">✓</span>' : ''}</div>`).join('')}
    ${set.reward ? `<div class="famrow ${set.done ? 'done' : ''}"><b>Set complet</b><button class="chip" data-zoom="${zoomKey(set.reward.card)}">${esc(nameOf(set.reward.card))}</button>${set.done ? '<span class="ok">✓</span>' : ''}</div>` : ''}</div>`).join('');
}
function achievementsHTML() {
  const list = ui.progressInfo?.achievements; if (!list) return '';
  const groups = [...new Set(list.map(x => x.group))], done = list.filter(x => x.done).length;
  return `<div class="card-box"><div><span class="eyebrow">Succès</span><h2 style="font-size:22px">${done} sur ${list.length}</h2></div>
    ${groups.map(g => `<div class="gal-h">${esc(g)}</div><div class="achs">${list.filter(x => x.group === g).map(x => `<div class="ach ${x.done ? 'done' : ''}">
      <div class="row" style="justify-content:space-between;gap:8px"><span>${x.done ? '✓ ' : ''}${esc(x.label)}</span><small class="hint">${[x.shards ? `${x.shards} Éclats` : '', x.title ? `titre « ${esc(x.title)} »` : '', x.frame ? esc(x.frame) : ''].filter(Boolean).join(' · ')}</small></div>
      ${x.done ? '' : `<div class="row" style="gap:8px"><div class="bar" style="flex:1"><span style="width:${pct(x.value, x.goal)}%"></span></div><small class="num">${x.value}/${x.goal}</small></div>`}</div>`).join('')}</div>`).join('')}</div>`;
}
function renderProfile() {
  const a = ui.account, st = ui.profile, p = prog();
  const sets = SETS.filter(s => s.cards.length).map(s => { const n = s.cards.filter(owned).length, pct = Math.round(100 * n / s.cards.length);
    return `<div class="setline ${n === s.cards.length ? 'done' : ''}"><div class="row" style="justify-content:space-between"><b>${esc(s.name)}</b>
      <span class="num">${n === s.cards.length ? 'Complété · ' : ''}${n}/${s.cards.length}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(s.name)}"><span style="width:${pct}%"></span></div></div>`; }).join('');
  const complete = SETS.filter(s => s.cards.length && s.cards.every(owned)).length;
  const tile = (label, r) => `<div class="stat"><span class="eyebrow">${label}</span><b class="num">${r.rate === null ? '–' : `${r.rate} %`}</b>
    <small class="hint num">${r.games} partie${r.games > 1 ? 's' : ''} · ${r.wins} V · ${r.losses} D${r.draws ? ` · ${r.draws} N` : ''}</small></div>`;
  const RES = { wins: 'Victoire', losses: 'Défaite', draws: 'Match nul' };
  const stats = !st ? '<p class="wait">Chargement…</p>' : `
    <div class="stats">${tile('Toutes les parties', st.all)}${tile('En ligne', st.pvp)}${tile('Contre l\'IA', st.pve)}</div>
    ${st.generals.length ? `<div class="gal-h">Par général</div><div class="statlist">${st.generals.map(g => `<div class="row"><span style="flex:1">${esc(g.name)}</span><span class="num hint">${g.games} partie${g.games > 1 ? 's' : ''}</span><b class="num">${g.rate} %</b></div>`).join('')}</div>` : ''}
    ${st.recent.length ? `<div class="gal-h">Dernières parties</div><div class="statlist">${st.recent.map(r => `<div class="row"><b class="res ${r.result}">${RES[r.result]}</b><span style="flex:1">contre ${esc(r.foe)} <small class="hint">· ${esc(r.deck || '')}</small></span><small class="hint num">${new Date(r.at).toLocaleDateString('fr-FR')}</small></div>`).join('')}</div>`
      : '<p class="hint" style="margin:0">Aucune partie jouée pour l\'instant.</p>'}`;
  return `<div class="top"><span class="title">Mon profil</span><button class="btn" data-act="home">Retour</button></div>
  ${errLine()}${ui.msg ? `<p class="hint" role="status" style="margin:0">${esc(ui.msg)}</p>` : ''}
  <div class="card-box profile">
    ${avatarHTML(a, 'big')}
    <div style="display:grid;gap:8px">
      <span class="eyebrow">Identifiant : ${esc(a.login)}</span>
      <div><b style="font-size:20px">${esc(a.name)}</b>${p.title ? `<div class="ptitle">${esc(titleLabel(p.title))}</div>` : ''}</div>
      ${levelBar(p)}
      <div class="row"><label class="btn" for="avatar-file">${a.avatar ? 'Changer l\'image' : 'Ajouter une image'}</label>
        <input id="avatar-file" type="file" accept="image/*" hidden>
        ${a.avatar ? `<button class="btn" data-act="avatar-remove" ${ui.busy ? 'disabled' : ''}>Retirer l'image</button>` : ''}</div>
    </div>
  </div>
  <form class="card-box" id="name-form">
    <div class="field"><label class="eyebrow" for="profile-name">Pseudo</label><input id="profile-name" maxlength="20" value="${esc(ui.nameDraft)}"></div>
    <div class="row"><button class="btn primary" type="submit" ${ui.busy || !ui.nameDraft.trim() || ui.nameDraft.trim() === a.name ? 'disabled' : ''}>Enregistrer le pseudo</button></div>
  </form>
  ${customizeHTML()}
  <div class="card-box"><div><span class="eyebrow">Collection</span><h2 style="font-size:22px">${complete} set${complete > 1 ? 's' : ''} complété${complete > 1 ? 's' : ''}</h2></div>
    <p class="hint" style="margin:0">${OWNABLE.filter(owned).length} cartes sur ${OWNABLE.length}, généraux compris.</p>${sets}${familiesHTML()}</div>
  ${achievementsHTML()}
  <div class="card-box"><div><span class="eyebrow">Statistiques</span><h2 style="font-size:22px">Victoires</h2></div>${stats}</div>`;
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
  return `<div class="fc" style="${famVar(d.kw)}"><div class="h"><b>${esc(d.name)}</b><span class="seal">${d.x ? 'X' : d.cost}</span></div>
    <span class="k">${typeName(d)} · ${kwLine(d)}</span><span class="x">${d.text ? rich(d.text) : 'Pas d\'effet.'}</span>${d.type === 'C' ? `<span class="p num">${d.power}</span>` : ''}</div>`; }
const genCard = k => { const g = GENERALS[k]; return `<div class="fc" style="${famVar([g.fam])}"><b>${g.name}</b><span class="k">Général · ${g.kind}</span><span class="x">${rich(g.text)}</span></div>`; };
const terrainCard = k => { const t = TERRAINS[k]; return `<div class="fc" style="${famVar([t.fam])}"><b>${t.name}</b><span class="k">Terrain</span><span class="x">${rich(t.text)}</span></div>`; };
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
    body = `
      <div class="zh"><span class="seal" title="Coût">${cost}</span><h2>${esc(d.name)}</h2>${d.type === 'C' ? `<span class="zp num ${pcls}" title="Puissance">${pw}</span>` : ''}</div>
      <span class="k">${typeName(d)} · ${kwLine(d)}${d.type === 'C' && pw !== d.power ? ` · puissance de base ${d.power}` : ''}</span>
      <p class="x">${d.text ? rich(d.text) : 'Pas d\'effet.'}</p>${zoomBtns(acts)}`;
  } else if (zm.kind === 'general') {
    const g = GENERALS[zm.id]; style = famVar([g.fam]);
    const acts = [];
    if (zm.mine && g.activate && play) {
      if (ui.genZone !== null) acts.push(`<p class="hint">Activé ce tour${g.needsZone ? `, zone ${ZONE_NAMES[ui.genZone]}` : ''}.</p><button class="btn" data-act="zgen">Annuler l'activation</button>`);
      else if (me().generalUsed) acts.push(`<p class="hint">Déjà utilisé dans cette partie.</p>`);
      else if (me().seals < (g.activateCost || 0)) acts.push(`<p class="hint">Pas assez de sceaux pour l'activer ce tour.</p>`);
      else if (g.needsZone) acts.push(`<span class="eyebrow">Activer dans la zone</span><div class="row">${[0, 1, 2].map(z => `<button class="btn primary" data-act="zgen" data-zone="${z}">${ZONE_NAMES[z]}</button>`).join('')}</div>`);
      else acts.push(`<button class="btn primary" data-act="zgen" data-zone="0">Activer le général</button>`);
    }
    const deck = ui.view && (zm.mine ? me() : zm.side === 'foe' ? ui.view.foe : null)?.deckName;
    body = `<div class="zh"><h2>${g.name}</h2></div><span class="k">Général · ${genLine(g)}${g.activateCost ? ` · activation ${g.activateCost} sceau` : ''}${deck ? ` · deck ${esc(deck)}` : ''}</span><p class="x">${rich(g.text)}</p>${zoomBtns(acts)}`;
  } else {
    const t = TERRAINS[zm.id]; style = famVar([t.fam]);
    body = `<div class="zh"><h2>${t.name}</h2></div><span class="k">Terrain${t.fam ? ` · ${t.fam}` : ''}</span><p class="x">${rich(t.text)}</p>`;
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
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Toutes les cartes</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">Un deck : ${DECK_SIZE} cartes différentes de votre collection, ${DECK_TERRAINS} terrains et un général de votre collection. Terrains : les neutres et ceux des familles de vos généraux.</p>${h}</div></div>`;
  }
  if (ui.sheet === 'rename' && ui.renaming) {
    return `<div class="sheet" data-act="close"><form class="panel" data-stop="1" id="rename-form"><div class="ph"><h2>Renommer le deck</h2><button class="btn" type="button" data-act="close">Fermer</button></div>
      <div class="field"><label class="eyebrow" for="rename-input">Nom du deck</label><input id="rename-input" maxlength="30" value="${esc(ui.renaming.name)}"></div>
      <div class="row"><button class="btn primary" type="submit">Renommer</button></div></form></div>`;
  }
  if (ui.sheet === 'inbox') {
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Récompenses</h2><button class="btn" data-act="close">Fermer</button></div>
      ${levelBar(prog())}<div class="rewards">${prog().inbox.slice().reverse().map(rewardItem).join('')}</div>
      <div class="row"><button class="btn primary" data-act="close">Super !</button></div></div></div>`;
  }
  if (ui.sheet === 'booster' && ui.booster) {
    const { title, cards, fresh, shards, xp } = ui.booster, n = fresh.filter(Boolean).length;
    const sum = [n ? `${n} nouvelle${n > 1 ? 's' : ''} carte${n > 1 ? 's' : ''} dans votre collection` : 'Aucune nouvelle carte', shards ? `${shards} Éclats gagnés avec les doublons` : '', xp ? `${xp} XP` : ''].filter(Boolean).join(', ');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>${esc(title)}</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">${sum}.</p>
      <div class="gallery">${cards.map((id, i) => `<div class="bcard ${fresh[i] ? '' : 'dup'}" style="animation-delay:${i * 120}ms">${fresh[i] ? '<span class="new">Nouvelle</span>' : `<span class="new shard">Doublon · +${shardRate()} Éclats</span>`}${anyCard(id)}</div>`).join('')}</div></div></div>`;
  }
  if (ui.sheet === 'end' && ui.view && ui.view.result) {
    const r = ui.view.result, s = ui.view.seat;
    const t = r.winner === s ? 'Victoire' : r.winner < 0 ? 'Match nul' : 'Défaite';
    const reason = renderLog(r.reason, s, ui.view.names);
    const zs = [0, 1, 2].map(z => `<div><div class="eyebrow">${ZONE_NAMES[z]}</div><b>${ui.view.me.zonePower[z]}</b> contre ${ui.view.foe.zonePower[z]}</div>`).join('');
    return `<div class="sheet"><div class="panel end"><h2>${t}</h2><p style="margin:0">${esc(reason)}.</p>
      <div class="zs">${zs}</div>${endRewardHTML()}<div class="row">
      <button class="btn primary" data-act="again" ${ui.rematchAsked ? 'disabled' : ''}>${ui.rematchAsked ? 'Revanche demandée…' : 'Revanche'}</button>
      <button class="btn" data-act="quit">Retour à l'accueil</button><button class="btn" data-act="log">Voir le journal</button></div></div></div>`;
  }
  return '';
}
function render() {
  const h = document.getElementById('hand'); const sx = h ? h.scrollLeft : 0;
  const screens = { loading: renderLoading, login: renderLogin, starter: renderStarter, home: renderHome, collection: renderCollection, shop: renderShop, deck: renderDeck, decks: renderDecks, profile: renderProfile, lobby: renderLobby, game: renderGame };
  // Récompenses gagnées (niveau, missions, succès, familles et sets complétés) : affichées en revenant à l'accueil.
  if (ui.screen === 'home' && !ui.sheet && prog().inbox.length) ui.sheet = 'inbox';
  const body = screens[ui.screen]();
  app.innerHTML = body + sheetHTML();
  if (ui.sheet === 'rename') { const r = document.getElementById('rename-input'); if (r && document.activeElement !== r) { r.focus(); r.select(); } }
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
  ui.msg = ''; ui.focus = { kind: 'card', id: drag.id }; ui.drag = drag.uid;
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
  ui.ctrl = null; ui.view = null; ui.screen = menuScreen(); ui.sheet = null; ui.pending = []; ui.lastTurn = 0; ui.soloReward = null; render();
  // Le compte a pu changer pendant la partie (XP, Éclats, missions, succès).
  if (ui.auth) api('GET', '/api/me', undefined, ui.auth).then(r => { setAccount(r.account); render(); }).catch(() => {});
}
app.addEventListener('input', e => {
  if (e.target.id === 'login-id') ui.loginId = e.target.value;
  if (e.target.id === 'login-pass') ui.loginPass = e.target.value;
  if (e.target.id === 'deck-name' && ui.edit) ui.edit.name = e.target.value;
  if (e.target.id === 'rename-input' && ui.renaming) ui.renaming.name = e.target.value;
  if (e.target.id === 'profile-name') { ui.nameDraft = e.target.value; const b = e.target.form?.querySelector('[type=submit]');
    if (b) b.disabled = ui.busy || !ui.nameDraft.trim() || ui.nameDraft.trim() === ui.account.name; }
  if (e.target.id === 'code') { ui.joinCode = e.target.value.toUpperCase(); e.target.value = ui.joinCode; }
});
app.addEventListener('change', e => {
  if (e.target.id === 'avatar-file') { pickAvatar(e.target.files[0]); e.target.value = ''; }
  if (e.target.id === 'title-pick') equip({ title: e.target.value || null }, 'Titre changé.');
});
app.addEventListener('submit', e => {
  e.preventDefault(); if (ui.busy) return;
  if (e.target.id === 'login-form') doLogin();
  else if (e.target.id === 'name-form') saveName();
  else if (e.target.id === 'rename-form') renameDeck();
});
app.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-hand],[data-card],[data-terrain],[data-general],[data-z],[data-starter],[data-pick],[data-tpick],[data-gpick],[data-step],[data-fam],[data-zoom],[data-frame],[data-back],[data-stop]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.stop && !e.target.closest('[data-act]')) return;
  if (ds.act) {
    const a = ds.act;
    if (a === 'close') { if (ui.sheet === 'inbox') closeInbox(); ui.sheet = null; ui.zoom = null; ui.renaming = null; render(); }
    else if (a === 'zplay' || a === 'zmove') { const uid = ui.zoom.uid; ui.sheet = null; ui.zoom = null;
      if (a === 'zplay') { ui.sel = uid; ui.moveSel = null; } else { ui.moveSel = uid; ui.sel = null; }
      tryPlace(+ds.zone); }
    else if (a === 'zback') { ui.pending = ui.pending.filter(p => p.uid !== ui.zoom.uid); ui.sheet = null; ui.zoom = null; ui.msg = ''; play('unplace'); render(); }
    else if (a === 'zstay') { ui.moves = ui.moves.filter(m => m.uid !== ui.zoom.uid); ui.sheet = null; ui.zoom = null; play('unplace'); render(); }
    else if (a === 'log' || a === 'set') { ui.sheet = a; render(); }
    else if (a === 'create') goOnline('create');
    else if (a === 'join') { if (ui.joinCode.length !== 4) { ui.error = 'Le code fait 4 lettres.'; render(); } else goOnline('join'); }
    else if (a === 'solo') goSolo();
    else if (a === 'copy') { const link = document.getElementById('link');
      navigator.clipboard.writeText(link.value).then(() => { t.textContent = 'Lien copié'; }).catch(() => { link.select(); }); }
    else if (a === 'go') { if (!canPlay()) return; play('validate');
      ui.ctrl.submit({ cards: ui.pending.map(p => ({ uid: p.uid, zone: p.zone })), moves: ui.moves.slice(), general: ui.genZone }); ui.sel = null; ui.moveSel = null; }
    // Activer le général (ou l'annuler) depuis sa carte en grand.
    else if (a === 'zgen') {
      if (!canPlay()) return;
      ui.genZone = ds.zone === undefined ? null : +ds.zone; ui.sheet = null; ui.zoom = null;
      ui.sel = null; ui.moveSel = null; ui.msg = '';
      // Le coût du général passe avant les cartes : on retire les dernières cartes posées s'il manque des sceaux.
      while (ui.genZone !== null && sealsLeft() < 0 && ui.pending.length) ui.pending.pop();
      play(ui.genZone === null ? 'unplace' : 'place'); render(); }
    else if (a === 'again') { ui.rematchAsked = true; ui.soloReward = null; ui.ctrl.rematch(); render(); }
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
    else if (a === 'free-booster' && !ui.busy) buy('/api/shop/booster', { set: ds.set, free: true });
    else if (a === 'reroll' && !ui.busy) call('POST', '/api/missions/reroll', { index: +ds.i });
    else if (a === 'edit') { editDeck(ui.account.active, ui.screen === 'collection' ? 'collection' : 'home'); render(); }
    else if (a === 'home') { ui.screen = 'home'; ui.edit = null; ui.error = ''; ui.msg = ''; render(); }
    else if (a === 'decks') openDecks();
    else if (a === 'deck-new') { if (ui.account.decks.length < maxDecks()) { editDeck(null, 'decks'); render(); } }
    else if (a.startsWith('deck-') && a !== 'deck-cancel' && !ui.busy) deckAction(a, ds.id);
    else if (a === 'deck-cancel') { ui.screen = ui.edit?.back || 'home'; ui.edit = null; ui.error = ''; ui.msg = ''; render(); }
    else if (a === 'step-next' && stepOpen(ui.edit, ui.deckStep + 1)) { ui.deckStep++; ui.msg = ''; render(); scrollTo(0, 0); }
    else if (a === 'step-prev') { ui.deckStep = Math.max(0, ui.deckStep - 1); ui.msg = ''; render(); scrollTo(0, 0); }
    else if (a === 'profile') openProfile();
    else if (a === 'avatar-remove' && !ui.busy) call('PUT', '/api/profile', { avatar: null });
    else if (a === 'save-deck' && !ui.busy) saveDeck();
    return;
  }
  if (ds.starter) { ui.starterPick = ds.starter; render(); return; }
  if (ds.frame !== undefined && !ui.busy) { equip({ frame: ds.frame || null }, 'Cadre changé.'); return; }
  if (ds.back && !ui.busy) { equip({ back: ds.back }, 'Dos de carte changé.'); return; }
  if (ds.fam !== undefined) { ui.colFam = ds.fam; render(); return; }
  if (ds.zoom) { const [kind, id] = ds.zoom.split(':'); openZoom({ kind, id }); render(); return; }
  if (ds.pick) { togglePick(ds.pick); return; }
  if (ds.tpick) { toggleTerrain(ds.tpick); return; }
  if (ds.gpick) { ui.edit.general = ds.gpick; ui.msg = '';
    // Premier choix du général : on passe directement aux terrains.
    if (ui.deckStep === 0 && !ui.edit.terrains.length) ui.deckStep = 1;
    render(); scrollTo(0, 0); return; }
  if (ds.step !== undefined) { const i = +ds.step; if (stepOpen(ui.edit, i)) { ui.deckStep = i; ui.msg = ''; render(); } return; }
  if (ds.hand) { const uid = +ds.hand; ui.focus = { kind: 'card', id: ds.id };
    // La carte s'affiche en grand ; en planification elle reste sélectionnée pour être posée en touchant une zone.
    if (canPlay()) { ui.sel = uid; ui.moveSel = null; ui.msg = ''; play('pick'); }
    openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
  if (ds.card) {
    if (ds.pending && canPlay() && ui.sel === null && ui.moveSel === null) { ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; openZoom({ kind: 'card', id: ds.id, uid: +ds.card }); render(); return; }
    if (ds.mobile && canPlay() && ui.sel === null && (ui.moveSel === null || ui.moveSel === +ds.card)) {
      const uid = +ds.card; ui.focus = { kind: 'card', id: ds.id }; ui.msg = '';
      // Sélectionnée pour un déplacement : toucher ensuite une zone la déplace, comme avant.
      if (!moveOf(uid)) { ui.moveSel = uid; play('pick'); }
      openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
    if (ds.id && ui.sel === null && ui.moveSel === null) { ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; openZoom({ kind: 'card', id: ds.id, uid: +ds.card }); render(); return; }
  }
  if (ds.terrain && ui.sel === null && ui.moveSel === null) { ui.focus = { kind: 'terrain', id: ds.terrain }; ui.msg = ''; openZoom({ kind: 'terrain', id: ds.terrain }); render(); return; }
  if (ds.general) { ui.focus = { kind: 'general', id: ds.general }; ui.msg = ''; openZoom({ kind: 'general', id: ds.general, mine: ds.side === 'me', side: ds.side }); render(); return; }
  const zone = t.closest('[data-z]'); if (zone) tryPlace(+zone.dataset.z);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) { if (ui.sheet === 'inbox') closeInbox(); ui.sheet = null; ui.zoom = null; render(); } });
app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone.target')) { e.preventDefault(); tryPlace(+e.target.dataset.z); } });

// Reprise d'une partie en ligne après rechargement de la page
const saved = store.get('session', null);
if (saved && saved.room && saved.token) { ui.mode = 'online'; ui.room = saved.room; ui.ctrl = connectOnline(handlers, { t: 'rejoin', room: saved.room, token: saved.token }); }
boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
