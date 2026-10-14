// Appli web : connexion, collection et deck, accueil, salon en ligne, partie (en ligne ou contre l'IA).
// Langue d'abord (lang.js) : les autres modules affichent leurs textes avec t() dans la langue choisie.
import { langChosen, chooseLang, localizeCatalog, deviceLang } from './lang.js';
import { t, tp, tMsg, tField, getLang, LANGS, locale } from '@jeu/engine/i18n';
import './style.css';
import './habillage.css';
import './cyber.css';
import './halloween.css';
import './clan.css';
import './boss.css';
import './story.css';
import { CARDS, GENERALS, TERRAINS, DECKS, FAMILIES, SLOTS, ZONE_NAMES, renderLog, bossBoost } from '@jeu/engine';
import { STARTERS, DECK_SIZE, DECK_TERRAINS, MAX_COPIES, MAX_DECKS, COLLECTIBLE, OWNABLE, SHARDS_PER_DUPLICATE, SETS, setById, setOf, setRevealed, unrevealed, allowedGenerals, allowedTerrains, starterGenerals, deckError, deckCode, readDeckCode, fitDeck, recipeKeys, EXCHANGE_TIERS, exchangeOffers, exchangeFor, shopOrder, today } from '@jeu/engine/collection';
import { api } from './api.js';
import { connectOnline } from './net.js';
import { startSolo } from './solo.js';
import { startTutorial, LESSONS } from './tutorial.js';
import { codexHTML } from './codex.js';
import { createFriends } from './friends.js';
import { createMail } from './mail.js';
import { createNotifs } from './notifs.js';
import { createClan, crestHTML } from './clan.js';
import { createBoss } from './boss.js';
import { createStory } from './story.js';
import { questOfCard } from '@jeu/engine/story';
import { applyCatalog } from '@jeu/engine/catalog';
import { esc, famStyle, rich } from './common.js';
import { artBg, artHTML, heroHTML, portraitHTML, terrainBg, terrainHTML, holoCard, setHoloOff, popCard, setPopOff } from './art.js';
import './holo.js';
import './cosmetics.js';
import { unlockAudio, audioContext, play, isMuted, setMuted, sfxVolume, setSfxVolume, canVibrate, vibrations, setVibrations, buzz, feel } from './sfx.js';
import { setMusic, wakeMusic, musicVolume, setMusicVolume } from './music.js';
import { reduceMotion, banner, floatNum, zoneGlow, generalFire, backFlip, flyFrom, confetti, setInGame, stageReady, sparkle, shards, trail, ending, clearEnding, setEnd, coachGuide } from './fx.js';
import * as veil from './veil.js';
import { TABS, screenDir, slides, ghostScreen, ghostSheet } from './transition.js';
import { openPack, openChest } from './opening.js';
import { setHome } from './lobby.js';
import { stallHTML, vitrineHTML, shardPileSVG, setShop } from './shop.js';
import { FRAMES, BACKS, TITLES, rewardSourceOf, REWARD_CARDS, CARD_LEVELS, MAX_CARD_LEVEL, FAMILY_REWARDS, SET_REWARDS, ACHIEVEMENTS } from '@jeu/engine/rewards';
import { EMOTES, EMOTE_SLOTS, EMOTE_COOLDOWN_MS, EMOTE_SHOW_MS, SHOP_EMOTES, FREE_EMOTES } from '@jeu/engine/emotes';
import { STREAK_BONUS, seasonId, seasonName } from '@jeu/engine/ranked';
import { EVENT_EFFECTS, multLabel } from '@jeu/engine/events';
import { SEASONS, PASS_TIERS, SEASON_THEMES, seasonOfCard, seasonStarted, seasonStart, currentSeason, releaseMonth } from '@jeu/engine/pass';
import { ARTS, ART_THEMES, THEME_IDS, artsOf, artExists, themeArts, rarityKey, rarityName, chestPool, MAX_FAV_ARTS } from '@jeu/engine/arts';

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
  drag: null, fx: null, zoom: null, soloReward: null, avatars: null, player: null, friendFoe: null, rankedAi: false, bossRun: false, rankedData: null,
  codexQuery: '', zoomBack: null, coach: null, coachShown: null, gotArt: null, offline: false, bubbles: {}, emotePick: false, emoteMute: false, emoteAt: 0,
};
const app = document.getElementById('app');
// Amis et défis (friends.js) : écran, bandeau de défi, choix du deck pour une partie entre amis.
const friends = createFriends({ ui, render: () => render(), call: (...x) => call(...x), avatarHTML: (...x) => avatarHTML(...x), errLine: () => errLine(),
  deckError, play: (...x) => play(...x), generalName: id => GENERALS[id]?.name || 'Sans général', startFriendMatch: (...x) => startFriendMatch(...x), onMail: () => mail.pushed() });
// Courrier et codes cadeaux (mail.js).
const mail = createMail({ ui, render: () => render(), call: (...x) => call(...x), errLine: () => errLine(), rewardItem: r => rewardItem(r), play: (...x) => play(...x) });
// Clans (clan.js) : création, adhésion, missions de clan, dons, magasin et classement des clans.
const clan = createClan({ ui, render: () => render(), call: (...x) => call(...x), errLine: () => errLine(), avatarHTML: (...x) => avatarHTML(...x), ico: k => ico(k), play: (...x) => play(...x) });
// Boss mondial (boss.js) : boss de la semaine, tentatives, classement et magasin du boss ; à la table, son bandeau et la fin de tentative.
const boss = createBoss({ ui, render: () => render(), call: (...x) => call(...x), errLine: () => errLine(), avatarHTML: (...x) => avatarHTML(...x), ico: k => ico(k), play: (...x) => play(...x),
  go: () => goBoss(), editBossDeck: id => { editBossDeck(id); render(); }, gotArt: id => { ui.gotArt = { id }; ui.sheet = 'art'; render(); }, leaveGame: () => { if (ui.screen === 'game' || ui.ctrl) leaveTable(); } });
// Quêtes d'histoire (story.js) : campagnes et quêtes du moment, carte, dialogues ; le combat se joue dans la page (goStory).
const story = createStory({ ui, render: () => render(), call: (...x) => call(...x), errLine: () => errLine(), ico: k => ico(k), play: (...x) => play(...x),
  anyCard: (...x) => anyCard(...x), zoomKey: (...x) => zoomKey(...x), rewardItem: r => rewardItem(r), setAccount: a => setAccount(a), go: (q, i) => goStory(q, i), quit: () => quit(),
  leaveGame: () => { if (ui.screen === 'game' || ui.ctrl) leaveTable(); } });
// Notifications push (notifs.js) : réglées dans le profil ; en toucher une ouvre l'écran qu'elle annonce.
const notifs = createNotifs({ ui, render: () => render(), call: (...x) => call(...x), open: where => openFromNotif(where) });

// ---- Contrôleurs (en ligne / IA) ----
const handlers = {
  // Partie classée contre l'IA : le salon démarre aussitôt, pas d'écran d'attente.
  onLobby(m) { if (ui.rankedAi || ui.bossRun) { store.set('session', { room: m.room, token: m.token }); return; }
    ui.screen = 'lobby'; ui.room = m.room; ui.lobbyNames = m.names; ui.error = ''; store.set('session', { room: m.room, token: m.token, foe: ui.friendFoe }); render(); },
  onView(view, room) {
    if (room) ui.room = room;
    if (view.avatars) ui.avatars = view.avatars;
    ui.awayUntil = (view.away || []).map(ms => (ms == null ? null : Date.now() + ms));
    const prev = ui.screen === 'game' ? ui.view : null;
    // Arrivée à la table : pas de bulle, sélecteur fermé ; les émotes de l'adversaire coupées si le joueur l'a choisi (Profil).
    if (!prev) { ui.bubbles = {}; ui.emotePick = false; ui.emoteMute = !!store.get('emotes-off', false); }
    if (view.phase !== 'plan' || view.turn !== ui.lastTurn) { ui.pending = []; ui.moves = []; ui.moveSel = null; ui.genZone = null; ui.sel = null; }
    if (view.phase === 'plan' && view.turn !== ui.lastTurn) ui.msg = '';
    ui.lastTurn = view.turn; ui.view = view; ui.screen = 'game';
    if (view.phase === 'over' && (!ui.sheet || ui.sheet === 'zoom')) { ui.sheet = 'end'; ui.zoom = null; }
    if (view.phase === 'over' && ui.mode === 'tuto') lessonDone();
    if (view.phase !== 'over') { ui.rematchAsked = false; if (ui.sheet === 'end') ui.sheet = null; }
    viewEffects(prev, view);
    render();
  },
  // Émote reçue (la sienne comprise) : une bulle à côté du joueur, sauf celles de l'adversaire quand il les a coupées.
  onEmote(seat, id) {
    if (!EMOTES[id] || ui.screen !== 'game' || !ui.view) return;
    const mine = seat === ui.view.seat;
    if (!mine && ui.emoteMute) return;
    const b = ui.bubbles[seat] = { id, at: Date.now() };
    if (!mine) play('emote');
    render();
    setTimeout(() => { if (ui.bubbles[seat] === b) { delete ui.bubbles[seat]; if (ui.screen === 'game') render(); } }, EMOTE_SHOW_MS + 30);
  },
  onError(msg) { ui.error = msg; ui.offline = false; render(); },
  // Partie en ligne : connexion perdue ou retrouvée (net.js se reconnecte seul et reprend la partie).
  onLink(ok) { ui.offline = !ok; render(); },
  // Partie contre l'IA terminée : le serveur l'enregistre et renvoie ce qu'elle a rapporté.
  onSoloOver(result) {
    if (!ui.auth) return;
    api('POST', '/api/games/solo', result, ui.auth).then(r => { ui.soloReward = r.reward; if (r.account) ui.account = r.account; render(); }).catch(() => {});
  },
  onGone() { store.set('session', null); ui.screen = menuScreen(); ui.view = null; ui.error = 'La partie a expiré.'; ui.ctrl = null; ui.friendFoe = null; render(); },
  onLeft() {
    // Défi : l'ami a renoncé avant le début de la partie.
    ui.error = ui.friendFoe && ui.screen === 'lobby' ? `${ui.friendFoe} a annulé la partie.`
      : ui.view?.ranked && ui.view.phase !== 'over' ? 'Votre adversaire a quitté la partie classée : la victoire vous revient.' : 'Votre adversaire a quitté la partie.';
    store.set('session', null); ui.screen = menuScreen(); ui.view = null; ui.ctrl = null; ui.friendFoe = null; render();
  },
};
// On joue toujours le deck enregistré sur le compte.
function deckReady() {
  const err = deckError(ui.account.deck, ui.account);
  if (err) { ui.error = `Votre deck n'est pas jouable : ${err}`; render(); }
  return !err;
}
// Entrée en partie sous le voile (veil.js) : il monte, la partie démarre dessous, puis il s'efface une fois la table prête
// (plateau PixiJS chargé) ou le salon d'attente affiché, ou sur une erreur. Une astuce de jeu s'y affiche entre-temps.
function toTable(label, start) {
  veil.cover({ label, tips: ['jeu'], min: 900, run: () => { ui.error = ''; start(); },
    until: () => ui.screen === 'game' || ui.screen === 'lobby' || !!ui.error || !ui.ctrl,
    ready: () => (ui.screen === 'game' ? stageReady() : null) });
}
function goOnline(action) {
  if (!deckReady()) return;
  toTable(action === 'create' ? 'Ouverture du salon…' : 'Vous rejoignez la table…', () => {
    ui.mode = 'online'; ui.error = ''; ui.avatars = null; ui.friendFoe = null; ui.rankedAi = false; ui.sheet = null;
    ui.offline = false; ui.ctrl = connectOnline(handlers, action === 'create' ? { t: 'create', auth: ui.auth } : { t: 'join', room: ui.joinCode, auth: ui.auth });
  });
}
// Défi accepté : on entre dans le salon réservé avec le deck choisi.
function startFriendMatch(room, deck, foe) {
  toTable(`${foe} vous attend…`, () => {
    ui.mode = 'online'; ui.error = ''; ui.avatars = null; ui.friendFoe = foe; ui.rankedAi = false; ui.sheet = null;
    ui.offline = false; ui.ctrl = connectOnline(handlers, { t: 'join', room, auth: ui.auth, deck });
  });
}
// Partie classée contre l'IA : jouée par le serveur, l'IA est plus forte à chaque palier.
function goRanked() {
  if (!deckReady()) return;
  toTable('Votre adversaire s\'installe…', () => {
    ui.mode = 'online'; ui.error = ''; ui.avatars = null; ui.friendFoe = null; ui.rankedAi = true; ui.sheet = null; ui.lastTurn = 0;
    ui.offline = false; ui.ctrl = connectOnline(handlers, { t: 'ranked', auth: ui.auth });
  });
}
// Boss mondial : une tentative contre le boss de la semaine, jouée par le serveur. Elle compte dès que la partie commence.
function goBoss() {
  if (!boss.bossDeck(ui.account.boss?.id) && !deckReady()) return;
  toTable('Le boss se dresse devant vous…', () => {
    ui.mode = 'online'; ui.error = ''; ui.avatars = null; ui.friendFoe = null; ui.rankedAi = false; ui.bossRun = true; ui.sheet = null; ui.lastTurn = 0;
    ui.offline = false; ui.ctrl = connectOnline(handlers, { t: 'boss', auth: ui.auth });
  });
}
function goSolo() {
  if (!deckReady()) return;
  toTable('La table se prépare…', () => {
    ui.mode = 'solo'; ui.sheet = null; ui.lastTurn = 0; ui.soloReward = null;
    ui.ctrl = startSolo(handlers, { name: ui.account.name, deck: ui.account.deck });
  });
}
// Quête d'histoire : un chapitre contre l'IA, dans la page, avec le deck du héros (story.js). Pas besoin d'un deck jouable.
function goStory(quest, i) {
  toTable('Le récit se poursuit…', () => {
    ui.mode = 'story'; ui.sheet = null; ui.lastTurn = 0; ui.soloReward = null; ui.error = '';
    const ctrl = startSolo(handlers, story.gameOpts(quest, i, ui.account.name)), rematch = ctrl.rematch;
    ui.ctrl = { ...ctrl, rematch: () => { story.rematched(); rematch(); } };
  });
}
// Tutoriel : leçons guidées contre l'IA avec un deck fixé, sans deck du joueur ni récompense (tutorial.js).
// Premier lancement : un compte qui n'a pas encore de deck de départ entre directement dans l'initiation, une fois par appareil.
const tutoKey = () => `tuto-${ui.account?.login || ''}`;
function goTutorial(lesson = 'initiation') {
  store.set(tutoKey(), true); ui.tutoReward = null; ui.tutoSent = false;
  toTable('Séraphine vous attend…', () => {
    // Depuis la fin d'une leçon (leçon suivante) ou depuis Passer en pleine leçon : on quitte proprement la précédente.
    if (ui.ctrl) ui.ctrl.leave();
    ui.view = null; ui.pending = []; ui.sel = null; ui.moveSel = null; ui.genZone = null;
    ui.mode = 'tuto'; ui.sheet = null; ui.lastTurn = 0; ui.error = '';
    ui.ctrl = startTutorial(handlers, { name: ui.account?.name || 'Vous', lesson });
    render();
  });
}
// Les leçons s'enchaînent dans l'ordre de LESSONS : la fin d'une leçon propose la suivante, et Passer y mène directement.
const nextLesson = () => { const ks = Object.keys(LESSONS), i = ks.indexOf(ui.ctrl?.lesson); return i >= 0 ? ks[i + 1] || null : null; };
// Leçon finie (une fois par partie jouée) : le serveur donne sa récompense la première fois, affichée dans le panneau de fin.
function lessonDone() {
  if (ui.tutoSent || !ui.auth || !ui.ctrl?.lesson) return;
  ui.tutoSent = true;
  api('POST', '/api/tuto', { lesson: ui.ctrl.lesson }, ui.auth).then(r => { ui.tutoReward = r.reward; if (r.account) ui.account = r.account; render(); }).catch(() => {});
}
// Guide « Améliorer une carte » dans les menus : Séraphine offre un doublon du général joué (et de quoi le passer au niveau 2),
// puis montre où l'ouvrir dans la collection et le bouton de niveau. ui.guide : { gen } tant que le guide est ouvert.
async function takeGift() {
  const r = await call('POST', '/api/tuto/gift');
  if (!r) return;
  ui.guide = { gen: r.card }; ui.sheet = null; ui.screen = 'collection'; play('fresh'); render();
}
function guideCoach() {
  const g = ui.guide; if (!g) return null;
  const name = nameOf(g.gen).split(',')[0], at = `[data-zoom="${zoomKey(g.gen)}"]`;
  if (myLevel(g.gen) >= 2) return { done: true, info: true, hl: [], text: `Bravo ! ${name} passe au niveau 2 et gagne sa bordure de bronze. Chaque doublon de vos cartes donne de l'essence pour monter plus haut.` };
  if (ui.sheet === 'zoom' && ui.zoom?.id === g.gen) return { hl: ['[data-act="upgrade"]'], text: 'Touchez **Passer au niveau 2**. Le niveau ne change pas la façon de jouer : c\'est la parure de la carte.' };
  if (ui.screen === 'collection' && !ui.sheet) return { hl: [at], tap: at, text: `Votre doublon de ${name} donne de l'**essence**. Touchez ${name} pour l'ouvrir en grand.` };
  return null;
}
// Appelé à chaque rendu : lance l'initiation au premier lancement (hors du rendu en cours).
function firstLaunch() {
  if (ui.screen !== 'starter' || ui.sheet || !ui.account || ui.account.starter || store.get(tutoKey(), false)) return;
  store.set(tutoKey(), true); setTimeout(() => goTutorial('initiation'));
}

// ---- Compte ----
const MENU = ['loading', 'login', 'starter'];
// Écran d'accueil selon l'état du compte (en dehors d'une partie).
const menuScreen = () => (ui.account ? (ui.account.starter ? 'home' : 'starter') : ui.auth ? 'loading' : 'login');
function setAccount(a) {
  ui.account = a;
  friends.start(); notifs.sync();
  if (a.catalog !== catalogVersion) loadCatalog();
  if (MENU.includes(ui.screen)) ui.screen = a.starter ? 'home' : 'starter';
}
function signedOut(msg = '') {
  friends.stop(); clan.stop(); boss.stop(); story.stop();
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
  try { const { catalog } = await api('GET', '/api/catalog'); applyCatalog(catalog); localizeCatalog(); catalogVersion = catalog.stamp ?? catalog.version ?? 0; render(); }
  catch { /* cartes d'origine en attendant */ }
}
// Ouverture sous le voile (déjà affiché par index.html) : cartes publiées, puis compte ; il s'efface sur le premier écran,
// une fois les polices chargées (et le plateau, si l'on reprend une partie en cours), ou sur une erreur avec « Réessayer ».
async function boot() {
  ui.error = '';
  // Premier lancement sur cet appareil : choix de la langue d'abord (la page se recharge dans la langue choisie).
  if (!langChosen()) { veil.cover({ until: () => true }); ui.screen = 'lang'; render(); return; }
  veil.cover({ label: 'Chargement des cartes…', until: () => ui.screen !== 'loading' || !!ui.error, ready: () => {
    veil.step(1, 'Préparation du salon…');
    return Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]).then(() => (ui.screen === 'game' ? stageReady() : null));
  } });
  veil.step(0.25);
  await loadCatalog();
  if (!ui.auth) { signedOut(); render(); return; }
  veil.step(0.6, 'Connexion à votre compte…');
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
  // Cet appareil cesse d'abord de recevoir les notifications du compte (il faut encore la session pour le dire au serveur).
  notifs.forget(token).finally(() => api('POST', '/api/logout', {}, token).catch(() => {}));
}
// Affiche les cartes reçues (booster du jour, booster ou carte achetés en boutique).
// Un booster s'ouvre d'abord comme en vrai (opening.js) : paquet à déchirer, cartes retournées une à une ; le récapitulatif suit.
function showCards(r, set = 'base') {
  const summary = () => { ui.booster = { ...r, opened: r.cards.length > 1 }; ui.sheet = 'booster'; render(); };
  if (r.cards.length < 2) { play('reveal'); summary(); return; }
  openPack({ title: r.title, set, setName: esc(SETS.find(x => x.id === set)?.name || ''), back: prog().back,
    cards: r.cards.map((id, i) => ({ html: anyCard(id, myLevel(id), mySel(id), myBorder(id), 'grand'), fresh: !!r.fresh[i], general: !!GENERALS[id],
      tag: r.fresh[i] ? (GENERALS[id] ? 'Nouveau général !' : 'Nouvelle carte !') : dupTag(id) })) }, summary);
}
async function openBoosterNow() {
  const r = await call('POST', '/api/booster');
  if (r) showCards(r, SETS.find(x => x.daily)?.id);
}
async function openShop(tab = ui.shopTab || 'sets') {
  ui.screen = 'shop'; ui.shopTab = tab; ui.error = ''; ui.msg = ''; render();
  const r = await call('GET', '/api/shop');
  if (r) { ui.shop = r.shop; render(); }
}
async function buy(path, body) {
  const r = await call('POST', path, body);
  if (r) { ui.shop = r.shop; showCards(r, body.set); }
}
// Art alternatif acheté ou sorti du coffre : montré en grand, prêt à être choisi pour sa carte.
async function buyArt(path, body) {
  const r = await call('POST', path, body);
  if (!r) return;
  ui.shop = r.shop; ui.msg = '';
  const art = ARTS[r.art], show = () => { ui.gotArt = { id: r.art, chest: !!r.chest }; ui.sheet = 'art'; render(); };
  // Coffre : on le frappe, il s'ouvre (opening.js), puis l'art s'affiche, prêt à être choisi.
  if (r.chest) { openChest({ rarity: art.rarity, html: artHTML(art.card, nameOf(art.card), myLevel(art.card), 'grand', art.id), chip: rarChip(art), name: esc(art.name), sub: esc(nameOf(art.card)) }, show); return; }
  play(['epique', 'legendaire'].includes(art.rarity) ? 'astral' : 'reveal'); show();
}
// ---- Change de devises : Prismes en Éclats, par offres fixes (exchangeOffers du moteur), jamais l'inverse ----
const prismRate = () => ui.account?.prismShards ?? 0;
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
// Achat en Éclats : s'il en manque et que le change est ouvert, le panneau « need » propose l'offre fixe la plus proche
// du besoin (exchangeFor), puis l'achat repart tout seul après le change. Renvoie true si le panneau s'ouvre à la place de l'achat.
// verb : la fin du bouton (« Changer et acheter ») ; then : l'achat à relancer.
function lacksShards(price, verb, then) {
  const need = price - (ui.account?.shards || 0);
  if (!(need > 0) || !prismRate()) return false;
  ui.need = { need, verb, then, offer: exchangeFor(prismRate(), need), back: ui.sheet === 'zoom' ? { zoom: ui.zoom, zoomBack: ui.zoomBack } : null };
  ui.sheet = 'need'; ui.error = ''; play('pick'); render();
  return true;
}
// Retour à ce qui était ouvert avant le panneau « need » (la carte en grand, pour monter son niveau).
function leaveNeed() {
  const back = ui.need?.back; ui.need = null;
  if (back) { ui.sheet = 'zoom'; ui.zoom = back.zoom; ui.zoomBack = back.zoomBack; } else ui.sheet = null;
}
async function exchange(id) {
  const o = exchangeOffers(prismRate()).find(x => x.id === id), then = ui.sheet === 'need' ? ui.need?.then : null;
  if (!o) return;
  const r = await call('POST', '/api/shop/convert', { offer: o.id });
  if (!r) return;
  if (r.shop) ui.shop = r.shop;
  play('reveal');
  if (ui.sheet === 'need') { leaveNeed(); render(); then?.(); return; }
  ui.msg = `+${fmt(r.shards)} Éclats.`; render();
}
// Calendrier de connexion du mois : récompense du jour.
async function claimDay() {
  const r = await call('POST', '/api/calendar/claim');
  if (r) { ui.calGot = r.got; play('reveal'); render(); }
}
// Bienvenue des nouveaux comptes : récompense suivante (une par jour de connexion distinct).
async function claimWelcome() {
  const r = await call('POST', '/api/welcome/claim');
  if (r) { ui.welGot = r.got; play('reveal'); if (r.got.frame) confetti(); render(); }
}
// Decks : jusqu'à MAX_DECKS. Création et modification en trois étapes : général, terrains, cartes.
const deckById = id => ui.account.decks.find(d => d.id === id);
const maxDecks = () => ui.account?.maxDecks ?? MAX_DECKS;
// Étapes accessibles : les terrains une fois le général choisi, les cartes une fois les terrains choisis.
const stepOpen = (e, i) => i === 0 || (i === 1 ? !!e.general : !!e.general && e.terrains.length === DECK_TERRAINS);
function editDeck(id = ui.account.active, back = 'home') {
  const d = id && deckById(id);
  // Un terrain d'un set pas encore sorti (choisi avant qu'il soit caché) est retiré : il n'apparaît pas parmi les choix.
  ui.edit = d ? { id: d.id, name: d.name, cards: d.cards.slice(), terrains: d.terrains.filter(t => !unrevealed(t)), general: d.general, back }
    : { id: null, name: `Deck ${ui.account.decks.length + 1}`, cards: [], terrains: [], general: null, back };
  // Un deck commencé reprend à la dernière étape accessible.
  ui.deckStep = [0, 1, 2].filter(i => stepOpen(ui.edit, i)).pop();
  ui.screen = 'deck'; ui.error = ''; ui.msg = '';
}
// Deck préparé contre un boss mondial (boss.js) : le sien, sinon une copie du deck joué à ajuster.
function editBossDeck(boss) {
  const d = ui.account.bossDecks?.[boss] || ui.account.deck;
  ui.edit = { boss, id: null, name: ui.account.bossDecks?.[boss]?.name || `Contre ${GENERALS[boss].name.split(/,\s*/)[0]}`,
    cards: d ? d.cards.slice() : [], terrains: d ? d.terrains.slice() : [], general: d?.general || null, back: 'decks' };
  ui.deckStep = [0, 1, 2].filter(i => stepOpen(ui.edit, i)).pop();
  ui.screen = 'deck'; ui.error = ''; ui.msg = '';
}
async function saveDeck() {
  const e = ui.edit, body = { name: e.name, general: e.general, terrains: e.terrains, cards: e.cards };
  const r = e.boss ? await call('PUT', '/api/boss/deck', { boss: e.boss, ...body }) : await call('PUT', '/api/decks', { id: e.id, ...body });
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
// Codes de deck : partager un deck (le sien ou une recette) en copiant son code, en créer un en collant celui d'un autre.
function showDeckCode(d) { ui.shareDeck = { name: d.name, code: deckCode(d) }; ui.sheet = 'deck-code'; render(); }
function copyDeckCode(btn) {
  const box = document.getElementById('deck-code');
  navigator.clipboard.writeText(ui.shareDeck.code).then(() => { btn.textContent = 'Code copié'; }).catch(() => { box?.select(); });
}
// Liste lisible de noms, raccourcie au-delà de `max`.
const namesLine = (ids, max = 6) => ids.slice(0, max).map(nameOf).join(', ') + (ids.length > max ? ` et ${ids.length - max} autre${ids.length - max > 1 ? 's' : ''}` : '');
// Ce qui manque pour reconstruire un deck avec sa collection, en une phrase.
function missingLine({ missing: m }) {
  const parts = [m.general && `le général ${nameOf(m.general)}`,
    m.terrains.length && `${m.terrains.length > 1 ? 'les terrains' : 'le terrain'} ${m.terrains.map(t => TERRAINS[t].name).join(', ')} (il faut un général de leur famille)`,
    m.cards.length && `${m.cards.length} carte${m.cards.length > 1 ? 's' : ''} : ${namesLine(m.cards)}`].filter(Boolean);
  return parts.length ? `Il vous manque ${parts.join(' ; ')}.` : '';
}
// Ouvre le constructeur sur un nouveau deck rempli avec ce que la collection permet de reprendre d'un code ou d'une recette.
function buildFrom(d, what) {
  if (ui.account.decks.length >= maxDecks()) { ui.error = `${maxDecks()} decks au plus : supprimez-en un pour ${what === 'code' ? 'importer ce code' : 'construire cette recette'}.`; render(); return; }
  const fit = fitDeck(d, ui.account), skip = fit.missing.unknown;
  editDeck(null, 'decks');
  Object.assign(ui.edit, { ...fit.deck, name: fit.deck.name || ui.edit.name });
  ui.deckStep = [0, 1, 2].filter(i => stepOpen(ui.edit, i)).pop();
  ui.msg = [fit.complete ? 'Vous avez tout : vérifiez le deck puis enregistrez-le.' : `${missingLine(fit)} Complétez avec vos cartes, ou enregistrez-le incomplet pour le finir plus tard.`,
    skip ? `${skip} élément${skip > 1 ? 's' : ''} inconnu${skip > 1 ? 's' : ''} ou pas encore sorti${skip > 1 ? 's' : ''} ignoré${skip > 1 ? 's' : ''}.` : ''].filter(Boolean).join(' ');
  ui.importCode = ''; ui.importErr = ''; render(); scrollTo(0, 0);
}
function importDeck() {
  const d = readDeckCode(ui.importCode);
  if (!d) { ui.importErr = 'Ce code de deck est illisible : copiez-le en entier, il commence par DK1-.'; render(); return; }
  buildFrom(d, 'code');
}

// Notification touchée (notifs.js) : l'écran qu'elle annonce, sauf en pleine partie ou dans un salon.
function openFromNotif(where) {
  if (!ui.account?.starter || ['game', 'lobby'].includes(ui.screen)) return;
  ui.sheet = null; ui.error = ''; ui.msg = '';
  if (where === 'friends' || where === 'clan') { (where === 'clan' ? clan : friends).click(where, {}); return; }
  if (where === 'ranked') { openRanked(); return; }
  if (where === 'boss') { boss.click('boss', {}); return; }
  ui.screen = 'home';
  if (where === 'calendar') { ui.sheet = 'calendar'; ui.calGot = null; }
  render();
}

// ---- Profil ----
function openProfile(tab = 'profil') {
  ui.screen = 'profile'; ui.profileTab = tab; ui.error = ''; ui.msg = ''; ui.nameDraft = ui.account.name; ui.profile = null; ui.notifs.note = ''; render();
  notifs.load();
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
// Bilan de victoires d'un mode (Mon profil et profil public).
const winTile = (label, r) => `<div class="stat"><span class="eyebrow">${label}</span><b class="num">${r.rate === null ? '–' : `${r.rate} %`}</b>
  <small class="hint num">${r.games} partie${r.games > 1 ? 's' : ''} · ${r.wins} V · ${r.losses} D${r.draws ? ` · ${r.draws} N` : ''}</small></div>`;
const winTiles = st => `<div class="stats">${winTile('Toutes les parties', st.all)}${winTile('En ligne', st.pvp)}${winTile('Contre l\'IA', st.pve)}</div>`;
// Général et cartes les plus joués : { id, games | plays, level, art }, en version réduite comme sur le plateau
// (illustration, nom, puissance, sans le texte) ; touchée, la carte s'ouvre en grand.
function smallCard(c) {
  const d = CARDS[c.id], g = GENERALS[c.id], name = (d || g).name;
  const p = g ? '<span class="p sm">Général</span>' : d.type === 'C' ? `<span class="p num">${d.power}</span>` : '<span class="p sm">Sort</span>';
  return `<button class="mc topmc${lvCls(c.border || c.level)}" style="${famVar(g ? [g.fam] : d.kw)}" data-zoom="${zoomKey(c.id, c.art || '')}" aria-label="${esc(name)} : voir en grand">
    ${artBg(c.id, c.art)}<span class="n">${esc(name)}</span>${p}</button>`;
}
const topCard = (c, n) => `<div class="topcard">${smallCard(c)}<small class="hint num">${n}</small></div>`;
// Art préféré : l'illustration seule (avec le nom de la carte), sans le texte de la carte ; touché, il s'ouvre en grand.
// lvl : niveau de la carte (le même pour tous ses arts) ; par défaut, celui de votre carte.
const artOnly = (id, lvl = myLevel(ARTS[id].card)) => artHTML(ARTS[id].card, nameOf(ARTS[id].card), lvl, '', id);
const favArt = (id, n, lvl) => `<div class="topcard"><button class="favart" data-zoom="${zoomKey(ARTS[id].card, id)}" aria-label="${esc(ARTS[id].name)} : voir en grand">${artOnly(id, lvl)}</button>
  <small class="hint">${n}</small></div>`;
const plays = n => `${n} partie${n > 1 ? 's' : ''}`;
function cardStatsHTML(cards, gen) {
  if (!cards.length && !gen) return '<p class="hint" style="margin:0">Aucune carte jouée pour l\'instant.</p>';
  return `<div class="topcards">${gen ? `<div class="topgen"><span class="eyebrow">Général le plus joué</span><div class="topgenrow">${smallCard(gen)}
      <span><b>${esc(GENERALS[gen.id].name)}</b><br><small class="hint num">${plays(gen.games)}${gen.rate !== null ? ` · ${gen.rate} % de victoires` : ''}</small></span></div></div>` : ''}
    ${cards.length ? `<div class="topfive"><span class="eyebrow">${cards.length > 1 ? `Les ${cards.length} cartes les plus jouées` : 'Carte la plus jouée'}</span>
      <div class="topgrid">${cards.map(c => topCard(c, plays(c.plays))).join('')}</div></div>` : ''}</div>`;
}

// ---- Profil public d'un joueur (pop-up, depuis le classement) ----
async function openPlayer(login) {
  ui.sheet = 'player'; ui.player = { login, data: null }; ui.error = ''; render();
  try { const r = await api('GET', `/api/player?login=${encodeURIComponent(login)}`, undefined, ui.auth); if (ui.player?.login === login) ui.player.data = r.player; }
  catch (e) { ui.error = e.message; }
  render();
}
// Demande d'ami (ou acceptation de la sienne) depuis le profil public.
async function playerFriend(accept) {
  const P = ui.player?.data; if (!P) return;
  const r = await call('POST', accept ? '/api/friends/accept' : '/api/friends/add', accept ? { login: P.login } : { name: P.login });
  if (r && ui.player?.data === P) { P.friend = accept || P.friend === 'in' ? 'friend' : 'out'; render(); }
}
function playerSheet() {
  const P = ui.player.data, close = '<button class="btn" data-act="close">Fermer</button>';
  if (!P) return `<div class="sheet" data-act="close"><div class="panel" data-stop="1" role="dialog" aria-label="Profil du joueur"><div class="ph"><h2>Profil</h2>${close}</div>
    ${ui.error ? errLine() : '<p class="wait">Chargement…</p>'}</div></div>`;
  const friend = { me: '<span class="hint">C\'est votre profil.</span>', friend: '<span class="hint">✓ Vous êtes amis.</span>', out: '<span class="hint">Demande d\'ami envoyée.</span>',
    in: `<button class="btn primary" data-act="player-accept" ${ui.busy ? 'disabled' : ''}>Accepter sa demande d'ami</button>` }[P.friend]
    || `<button class="btn primary" data-act="player-add" ${ui.busy ? 'disabled' : ''}>Envoyer une demande d'ami</button>`;
  const favs = P.favArts.filter(x => ARTS[x.id]);
  return `<div class="sheet" data-act="close"><div class="panel pprofile" data-stop="1" role="dialog" aria-label="Profil de ${esc(P.name)}">
    <div class="ph"><h2>Profil</h2>${close}</div>
    <div class="card-box profile">${avatarHTML(P, 'big', P.frame)}
      <div style="display:grid;gap:6px"><div><b style="font-size:20px">${esc(P.name)}</b>${P.title ? `<div class="ptitle">${esc(P.title)}</div>` : ''}</div>
        <span class="hint">Niveau <span class="num">${P.level}</span></span>
        ${P.clan ? `<span class="pclan">${crestHTML(P.clan, 'sm')}<b>${esc(P.clan.name)}</b> <span class="ctag">[${esc(P.clan.tag)}]</span>${P.clan.role ? ` <small class="hint">· ${esc(P.clan.role)}</small>` : ''}</span>` : ''}
        ${P.ranked ? `<span>${rankHTML(P.ranked.rank)} <small class="hint num">· ${P.ranked.pos}${P.ranked.pos === 1 ? 'er' : 'e'} du classement</small></span>` : ''}</div></div>
    <div class="row" role="status">${friend}</div>${errLine()}
    <span class="eyebrow">Victoires</span>${winTiles(P.stats)}
    ${cardStatsHTML(P.cards, P.general)}
    <span class="eyebrow">Arts préférés</span>${favs.length ? `<div class="favgrid">${favs.map(x => favArt(x.id, esc(ARTS[x.id].name), x.level || 1)).join('')}</div>`
      : '<p class="hint" style="margin:0">Pas encore d\'arts préférés.</p>'}
  </div></div>`;
}

// ---- Progression : niveau, missions, récompenses, personnalisation ----
const prog = () => ui.account?.progress || { level: 1, xp: 0, xpNext: 1, missions: [], inbox: [], cosmetics: { titles: [], frames: [], backs: [] }, freeBoosters: 0 };
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const levelBar = p => `<div class="lvl"><span class="lvlnum num">Niv. ${p.level}</span><div class="bar" role="progressbar" aria-valuenow="${p.xp}" aria-valuemin="0" aria-valuemax="${p.xpNext}" aria-label="Expérience"><span style="width:${pct(p.xp, p.xpNext)}%"></span></div><small class="hint num">${p.xp}/${p.xpNext} XP</small></div>`;
const gains = r => [r.xp ? `+${r.xp} XP` : '', r.shards ? `+${r.shards} Éclats` : '', r.prisms ? `+${r.prisms} Prisme${r.prisms > 1 ? 's' : ''}` : '',
  r.chests ? `+${r.chests} coffre${r.chests > 1 ? 's' : ''} d'arts offert${r.chests > 1 ? 's' : ''}` : '', r.boosters ? `+${r.boosters} booster${r.boosters > 1 ? 's' : ''} offert${r.boosters > 1 ? 's' : ''}` : '',
  r.passXp ? `+${r.passXp} XP de saison` : '', r.essence ? `+${r.essence} essence${r.essenceCard ? ` de ${nameOf(r.essenceCard)}` : ''}` : '',
  r.uniEssence ? `+${r.uniEssence} essence universelle` : '', r.clanCoins ? `+${r.clanCoins} Écu${r.clanCoins > 1 ? 's' : ''} de clan` : '',
  r.bossCoins ? `+${r.bossCoins} Insigne${r.bossCoins > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
const titleLabel = id => prog().cosmetics.titles.find(t => t.id === id)?.label || '';
function missionsHTML() {
  const p = prog();
  if (!p.missions.length) return '';
  return `<div class="missions">${p.missions.map((m, i) => `<div class="mission ${m.done ? 'done' : ''}">
    <div class="row" style="justify-content:space-between;gap:8px"><span>${m.done ? '✓ ' : ''}${esc(m.label)}</span><small class="hint num">${gains(m)}</small></div>
    <div class="row" style="gap:8px"><div class="bar" style="flex:1"><span style="width:${pct(m.n, m.target)}%"></span></div><small class="num">${m.n}/${m.target}</small>
      ${!m.done && p.rerollsLeft ? `<button class="btn sm" data-act="reroll" data-i="${i}" ${ui.busy ? 'disabled' : ''}>Changer</button>` : ''}</div></div>`).join('')}</div>
    <p class="hint" style="margin:0">Nouvelles missions chaque jour à minuit.${p.rerollsLeft ? ` Vous pouvez en changer ${p.rerollsLeft} aujourd'hui.` : ''}</p>`;
}
// Ce que contient une récompense : gains, carte, titre, cadre, dos de carte, art Promo.
function rewardItem(r) {
  const art = r.art && ARTS[r.art];
  const extra = [r.title ? `Titre « ${esc(titleLabel(r.title) || r.title)} »` : '', r.frame ? esc(FRAMES[r.frame] || r.frame) : '', r.back ? esc(BACKS[r.back] || r.back) : '',
    art ? `Art Promo « ${esc(art.name)} »` : '', r.theme ? `Thème de l'interface « ${esc(SEASON_THEMES[r.theme] || r.theme)} » (Profil, Personnalisation)` : '',
    r.emote && EMOTES[r.emote] ? `Émote ${EMOTES[r.emote].icon} « ${esc(EMOTES[r.emote].text)} » (Profil, Personnalisation)` : ''].filter(Boolean).join(' · ');
  return `<div class="reward"><div><b>${esc(r.label)}</b>${gains(r) ? `<div class="num">${gains(r)}</div>` : ''}${extra ? `<div class="hint">${extra}</div>` : ''}</div>
    ${r.card ? `<button class="ccard" data-zoom="${zoomKey(r.card)}">${anyCard(r.card)}</button>` : ''}
    ${art ? `<button class="ccard" data-zoom="${zoomKey(art.card, art.id)}">${anyCard(art.card, myLevel(art.card), art.id, myBorder(art.card))}</button>` : ''}</div>`;
}
// Icônes des monnaies (style.css, .ico-…) : Éclat, Prisme, coffre d'arts.
const ico = kind => `<span class="ico ico-${kind}" aria-hidden="true"></span>`;
// Calendrier du mois : une case par jour, semaine du lundi au dimanche. Dimanche : coffre d'arts (et parfois des Prismes).
function calendarHTML(cal) {
  const [y, m] = cal.month.split('-').map(Number), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const what = d => (d.chests ? `${ico('chest')}${d.prisms ? `<span class="calgain"><small class="num">+${d.prisms}</small>${ico('prism')}</span>` : ''}`
    : `<span class="calgain"><small class="num">${d.shards}</small>${ico('shard')}</span>`);
  const label = d => [`${d.day}`, d.chests ? `coffre d'arts${d.prisms ? ` et ${d.prisms} Prismes` : ''}` : `${d.shards} Éclats`, d.got ? 'récupéré' : d.missed ? 'manqué' : d.day === cal.today ? 'aujourd\'hui' : ''].filter(Boolean).join(', ');
  const cell = d => `<div class="calday ${d.chests ? 'sun' : ''} ${d.got ? 'got' : ''} ${d.missed ? 'missed' : ''} ${d.day === cal.today ? 'today' : ''}" aria-label="${label(d)}">
    <span class="num cdn">${d.day}</span>${what(d)}${d.got ? '<span class="ok">✓</span>' : ''}</div>`;
  const g = ui.calGot;
  return `<div class="sheet" data-act="close"><div class="panel calendar" data-stop="1" role="dialog" aria-label="Calendrier du mois"><div class="ph"><h2>Calendrier de ${esc(cal.name)}</h2><button class="btn" data-act="close">Fermer</button></div>
    <p class="hint" style="margin:0">Connectez-vous chaque jour pour récupérer sa récompense : des Éclats ${ico('shard')} en semaine, un coffre d'arts ${ico('chest')} chaque dimanche, et des Prismes ${ico('prism')} en plus un dimanche sur deux. Un jour manqué est perdu ; tout repart le 1er du mois.</p>
    <div class="calgrid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="calh">${x}</span>`).join('')}${'<span></span>'.repeat(lead)}${cal.days.map(cell).join('')}</div>
    ${g ? `<p role="status" style="margin:0"><b>Récupéré : ${gains(g)}.</b>${g.chests ? ' Le coffre vous attend à l\'accueil et dans la boutique, onglet Arts.' : ''}</p>` : ''}
    ${errLine()}
    <div class="row">${cal.ready ? `<button class="btn primary" data-act="claim-day" ${ui.busy ? 'disabled' : ''}>Récupérer la récompense du jour</button>`
      : g?.chests ? `<button class="btn primary" data-act="${chestPool(ui.account.arts).length && prog().freeChests ? 'chest-free' : 'shop-arts'}" ${ui.busy ? 'disabled' : ''}>Ouvrir le coffre</button>` : '<span class="hint">Revenez demain pour la suite.</span>'}
      <button class="btn" data-act="close">Fermer</button></div></div></div>`;
}
// Bienvenue des 7 jours : une case par récompense, prise un jour de connexion distinct (pas forcément consécutif) avant la date limite.
const fmtDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
function welcomeWhat(x) {
  const chip = (n, icon) => `<span class="calgain"><small class="num">${n}</small>${ico(icon)}</span>`;
  return [x.shards ? chip(x.shards, 'shard') : '', x.prisms ? chip(x.prisms, 'prism') : '', x.chests ? `${x.chests > 1 ? `<small class="num">${x.chests}</small>` : ''}${ico('chest')}` : '',
    x.boosters ? `<span class="welbooster" aria-hidden="true"></span>${x.boosters > 1 ? `<small class="num">×${x.boosters}</small>` : ''}` : '',
    x.frame ? `<span class="frame frame-${x.frame} swatch"></span>` : ''].join('');
}
const welcomeLabel = x => [x.shards ? `${x.shards} Éclats` : '', x.prisms ? `${x.prisms} Prismes` : '', x.chests ? `${x.chests} coffre${x.chests > 1 ? 's' : ''} d'arts` : '',
  x.boosters ? `${x.boosters} booster${x.boosters > 1 ? 's' : ''} offert${x.boosters > 1 ? 's' : ''}` : '', x.frame ? FRAMES[x.frame] : '', x.title ? `titre « ${TITLES[x.title] || x.title} »` : ''].filter(Boolean).join(', ');
function welcomeHTML(w) {
  const cell = x => `<div class="welday ${x.n === w.steps ? 'last' : ''} ${x.got ? 'got' : ''} ${x.today && !x.got ? 'today' : ''}" aria-label="Jour ${x.n} : ${esc(welcomeLabel(x))}${x.got ? ', récupéré' : ''}">
    <span class="eyebrow">Jour ${x.n}</span><span class="welgain">${welcomeWhat(x)}</span>${x.n === w.steps ? `<small>${esc(TITLES[x.title] || '')}</small>` : ''}${x.got ? '<span class="ok">✓</span>' : ''}</div>`;
  const g = ui.welGot;
  const foot = w.done ? 'Bienvenue terminée : merci de votre fidélité !' : w.expired ? 'Le délai de la bienvenue est passé.'
    : `${w.got} sur ${w.steps} récupérées · jusqu'au ${fmtDay(w.last)} (${w.left} jour${w.left > 1 ? 's' : ''})`;
  return `<div class="sheet" data-act="close"><div class="panel welcome" data-stop="1" role="dialog" aria-label="Bienvenue"><div class="ph"><h2>Bienvenue à la taverne</h2><button class="btn" data-act="close">Fermer</button></div>
    <p class="hint" style="margin:0">Pour vos débuts, sept cadeaux vous attendent : un par jour où vous vous connectez, pas besoin que ce soit d'affilée. Le septième vous offre le ${esc(FRAMES.bienvenue)} et le titre « ${esc(TITLES.bienvenue)} ». Le calendrier du mois continue à côté.</p>
    <div class="welgrid">${w.list.map(cell).join('')}</div>
    <p class="hint num" style="margin:0">${foot}</p>
    ${g ? `<p role="status" style="margin:0"><b>Récupéré : ${esc(welcomeLabel(g))}.</b>${g.boosters ? ' Vos boosters vous attendent à l\'accueil.' : g.chests ? ' Le coffre vous attend à l\'accueil et dans la boutique, onglet Arts.' : g.frame ? ' Équipez votre cadre et votre titre depuis votre profil.' : ''}</p>` : ''}
    ${errLine()}
    <div class="row">${w.ready ? `<button class="btn primary" data-act="claim-welcome" ${ui.busy ? 'disabled' : ''}>Récupérer le cadeau du jour ${w.got + 1}</button>`
      : g?.frame ? '<button class="btn primary" data-act="welcome-profile">Voir mon profil</button>' : w.done || w.expired ? '' : '<span class="hint">Revenez demain pour le cadeau suivant.</span>'}
      <button class="btn" data-act="close">Fermer</button></div></div></div>`;
}
function closeInbox() {
  ui.sheet = null; ui.account.progress.inbox = [];
  api('POST', '/api/rewards/seen', {}, ui.auth).then(r => { if (r.account) { ui.account = r.account; render(); } }).catch(() => {});
}
// ---- Mode classé ----
const rankHTML = k => `<span class="rank rank-${k.id}">${esc(k.label)}</span>${k.max ? ` <span class="rstars" role="img" aria-label="${k.stars} étoile${k.stars > 1 ? 's' : ''} sur ${k.max}">${'★'.repeat(k.stars)}<span class="off">${'★'.repeat(k.max - k.stars)}</span></span>` : ''}`;
function rankedLine(k) {
  const d = k.delta > 0 ? `+${k.delta} étoile${k.delta > 1 ? 's' : ''}${k.bonus ? ' (bonus compris)' : ''}${k.mult ? ` · <span class="evtag">${multLabel(k.mult)} événement</span>` : ''}` : k.delta < 0 ? `${k.delta} étoile` : 'rang inchangé';
  return `<p style="margin:0">Classé : ${rankHTML(k.after)} · ${d}${k.promoted ? ' · <b>Promotion !</b>' : ''}</p>`;
}
async function openRanked() {
  ui.screen = 'ranked'; ui.error = ''; ui.rankedData = null; render();
  try { ui.rankedData = await api('GET', '/api/ranked', undefined, ui.auth); } catch (e) { ui.error = e.message; }
  render();
}
function renderRanked() {
  const D = ui.rankedData, R = D ? D.ranked : prog().ranked;
  const head = `<div class="top"><span class="title">Mode classé</span><button class="btn" data-act="home">Retour</button></div>${errLine()}`;
  if (!R) return `${head}<p class="wait">Chargement…</p>`;
  // Un joueur du classement s'ouvre en pop-up (profil public) ; le top 10 montre son image et son cadre.
  const who = p => `<button class="lwho" data-act="player" data-login="${esc(p.login)}" aria-label="Profil de ${esc(p.name)}">${'avatar' in p ? avatarHTML(p, 'lav', p.frame) : ''}
      <span class="fname"><b>${esc(p.name)}</b>${p.title ? ` <small class="ptitle">${esc(p.title)}</small>` : ''}</span></button>`;
  const ladder = !D ? '<p class="wait">Chargement…</p>' : D.ladder.length ? `<ol class="ladder">${D.ladder.map(p => `<li class="${p.login === ui.account.login ? 'me' : ''} ${'avatar' in p ? 'top' : ''}">
      <span class="lpos num">${p.pos}</span>${who(p)}
      <span class="lrank">${rankHTML(p.rank)}</span><small class="hint num">${p.wins} V · ${p.games - p.wins} D/N</small></li>`).join('')}</ol>`
    : '<p class="hint" style="margin:0">Personne n\'a encore joué en classé cette saison. Soyez le premier !</p>';
  const rewards = !D ? '' : `<div class="card-box"><span class="eyebrow">Récompenses de fin de saison</span>
    <p class="hint" style="margin:0">Selon le meilleur palier atteint pendant la saison. Les titres et cadres des paliers en dessous sont aussi débloqués.</p>
    <ul class="tiers">${D.rewards.map(t => `<li class="${R.best.id === t.id ? 'on' : ''}"><span class="rank rank-${t.id}">${esc(t.name)}</span>
      <span>${[t.shards ? `${t.shards} Éclats` : '', t.prisms ? `${t.prisms} Prismes` : '', t.title ? `titre « ${esc(t.title)} »` : '', t.frame ? esc(t.frame) : ''].filter(Boolean).join(' · ') || '–'}</span></li>`).join('')}</ul>
    ${D.places ? `<span class="eyebrow">En plus, selon la place au classement final</span>
    <p class="hint" style="margin:0">Le classement est figé à la fin du mois. Il faut avoir joué au moins ${D.places.games} partie${D.places.games > 1 ? 's' : ''} classée${D.places.games > 1 ? 's' : ''} dans la saison.</p>
    <ul class="tiers">${D.places.list.map(p => `<li><b>${esc(p.name)}</b>
      <span>${[p.shards ? `${p.shards} Éclats` : '', p.prisms ? `${p.prisms} Prismes` : '', `titre « ${esc(p.title)} »`].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>` : ''}</div>`;
  // Podium figé de la saison précédente.
  const last = D?.last?.top.length ? `<div class="card-box"><span class="eyebrow">Podium de ${esc(D.last.seasonName)}</span>
    <ol class="ladder">${D.last.top.map(p => `<li class="${p.login === ui.account.login ? 'me' : ''}"><span class="lpos num">${p.pos}</span>
      ${who({ ...p, title: null })}<span class="lrank">${rankHTML(p.rank)}</span></li>`).join('')}</ol></div>` : '';
  const evs = (prog().events?.live || []).filter(ev => ev.effect === 'ranked');
  return `${head}
  ${evs.map(ev => eventCard(ev, `Chaque victoire classée rapporte ${multLabel(ev.mult)} étoiles, bonus de série compris. Une défaite n'en retire toujours qu'une.`)).join('')}
  <div class="card-box">
    <span class="eyebrow">Saison ${esc(R.seasonName)} · encore ${R.daysLeft} jour${R.daysLeft > 1 ? 's' : ''}</span>
    <h2 style="font-size:24px">${rankHTML(R.rank)}</h2>
    <p class="hint" style="margin:0">${R.games} partie${R.games > 1 ? 's' : ''} classée${R.games > 1 ? 's' : ''} · ${R.wins} victoire${R.wins > 1 ? 's' : ''}${R.streak > 1 ? ` · série de ${R.streak}` : ''} · meilleur rang : ${esc(R.best.label)}</p>
    <div class="row"><button class="btn primary" data-act="ranked-play">Partie classée contre l'IA ${esc(R.ai)}</button><button class="btn" data-act="friends">Défier un ami en classé</button></div>
    <p class="hint" style="margin:0">Une victoire donne une étoile, une défaite en retire une, sans jamais redescendre sous le début de votre palier.
      ${STREAK_BONUS} victoires d'affilée ou plus donnent une étoile de plus, jusqu'au Diamant. L'IA devient plus forte à chaque palier.
      En défi classé, battre un ami mieux classé que vous donne une étoile de plus. Quitter une partie classée en cours compte comme une défaite.
      À la fin du mois, vous recevez les récompenses de votre meilleur palier (et de votre place si vous finissez dans le top 10), puis vous redescendez d'un palier.</p>
  </div>
  <div class="card-box"><span class="eyebrow">Classement de la saison</span>${ladder}</div>
  ${rewards}
  ${last}`;
}

// ---- Passe de saison ----
// Une saison par mois : missions du jour, de la semaine et de la saison pour l'XP de saison, paliers gratuits et premium (payé en Prismes).
async function openPass() {
  ui.screen = 'pass'; ui.error = ''; ui.msg = ''; ui.passData = null; render();
  try { ui.passData = (await api('GET', '/api/pass', undefined, ui.auth)).pass; } catch (e) { ui.error = e.message; }
  render();
}
async function buyPass() {
  const P = ui.passData; if (!P) return;
  if (!confirm(`Acheter le passe premium ${P.name} pour ${P.price} Prismes ?`)) return;
  const r = await call('POST', '/api/pass/premium');
  if (r) { ui.passData = r.pass; ui.msg = 'Passe premium activé : les récompenses premium des paliers déjà atteints vous attendent à l\'accueil.'; render(); }
}
// Pas de passe aujourd'hui : celui du mois se dévoile bientôt (début décalé, voir start dans pass.js), ou il n'y en a pas ce mois-ci.
function nextPassLine() {
  const x = SEASONS.find(s => s.id === seasonId() && !seasonStarted(s.id, today()));
  return x ? `Le passe « ${esc(x.name)} » se dévoile le ${esc(frDate(seasonStart(x)))}. Revenez vite !` : 'Pas de passe de saison ce mois-ci. Revenez le mois prochain !';
}
// Cosmétiques et cartes des saisons pas encore commencées : cachés tant qu'on ne les a pas.
const futureSeasons = () => SEASONS.filter(x => !seasonStarted(x.id, today()));
// Sets pas encore sortis (date de sortie à venir) : leurs cartes, familles, récompenses et cosmétiques restent cachés.
const setHidden = id => !!id && !setRevealed(setById(id));
const futureCosmetic = id => futureSeasons().some(x => [x.frame[0], x.framePremium[0], x.back[0], x.backPremium[0]].includes(id))
  || FAMILY_REWARDS.some(r => r.back === id && setHidden(r.set)) || Object.entries(SET_REWARDS).some(([set, r]) => r.frame === id && setHidden(set));
const hiddenCard = id => { if (owned(id)) return false; const x = seasonOfCard(id); if (x && !seasonStarted(x.id, today())) return true;
  if (questOfCard(id)?.from > today()) return true;
  return unrevealed(id) || setHidden(rewardSourceOf(id)?.set); };
// Familles à montrer : celles qui ont au moins une carte visible.
const shownFamilies = () => FAMILIES.filter(f => OWNABLE.some(id => famOfCard(id) === f && !hiddenCard(id)));
// Une récompense de palier, en court (un palier peut en avoir plusieurs, comme un coffre et un cadre).
function passGift(r) {
  const parts = [
    r.card ? `<button class="chip pgift" data-zoom="${zoomKey(r.card)}">Carte · ${esc(nameOf(r.card))}</button>` : '',
    r.art && ARTS[r.art] ? `<button class="chip pgift" data-zoom="${zoomKey(ARTS[r.art].card, r.art)}">Art Promo · ${esc(ARTS[r.art].name)}</button>` : '',
    r.title ? `<span class="pgift">Titre « ${esc(TITLES[r.title] || r.title)} »</span>` : '',
    r.frame ? `<span class="pgift"><span class="frame frame-${r.frame} swatch"></span>${esc(FRAMES[r.frame] || r.frame)}</span>` : '',
    r.back ? `<span class="pgift"><span class="mc back back-${r.back}"></span>${esc(BACKS[r.back] || r.back)}</span>` : '',
    r.theme ? `<span class="pgift"><span class="theme-swatch theme-${r.theme}"></span>Thème « ${esc(SEASON_THEMES[r.theme] || r.theme)} »</span>` : '',
    r.shards ? `<span class="pgift">${ico('shard')}<span class="num">${r.shards}</span></span>` : '',
    r.prisms ? `<span class="pgift">${ico('prism')}<span class="num">${r.prisms}</span></span>` : '',
    r.chests ? `<span class="pgift">${ico('chest')}<span>${r.chests > 1 ? `${r.chests} coffres` : 'Coffre'} d'arts</span></span>` : '',
  ].filter(Boolean);
  return parts.length ? `<span class="pgifts">${parts.join('')}</span>` : '<span class="pgift">–</span>';
}
function passMissions(list) {
  return `<div class="missions">${list.map(m => `<div class="mission ${m.done ? 'done' : ''}">
    <div class="row" style="justify-content:space-between;gap:8px"><span>${m.done ? '✓ ' : ''}${esc(m.label)}</span><small class="hint num">${m.xp} XP de saison</small></div>
    ${m.done ? '' : `<div class="row" style="gap:8px"><div class="bar" style="flex:1"><span style="width:${pct(m.n, m.target)}%"></span></div><small class="num">${m.n}/${m.target}</small></div>`}</div>`).join('')}</div>`;
}
const frDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
function renderPass() {
  const P = ui.passData, a = ui.account;
  const head = `<div class="top"><span class="title">Passe de saison</span><span class="chip num cur prism" title="Prismes" aria-label="${a.prisms} Prismes">${ico('prism')}${a.prisms}</span><button class="btn" data-act="home">Retour</button></div>${errLine()}`;
  if (!P) return `${head}${ui.error ? '' : prog().pass === null ? `<p class="hint">${nextPassLine()}</p>` : '<p class="wait">Chargement…</p>'}`;
  const doneSeason = P.seasonal.filter(m => m.done).length;
  const cardTier = id => P.track.find(t => t.free.card === id)?.tier;
  const premium = P.premium ? '<p style="margin:0"><b>Premium actif ✓</b> <span class="hint">Les récompenses premium tombent à chaque palier.</span></p>'
    : `<div class="row"><button class="btn primary" data-act="pass-buy" ${a.prisms >= P.price && !ui.busy ? '' : 'disabled'}>Passer premium · ${P.price} Prismes</button>
      ${a.prisms < P.price ? `<small class="hint num">Il vous manque ${P.price - a.prisms} Prismes.</small>` : ''}</div>
      <p class="hint" style="margin:0">Le premium ajoute des Prismes ${ico('prism')} à presque chaque palier${P.refund ? ` : ils vous rendent son prix dès le palier ${P.refund}` : ''}. Il donne aussi un coffre d'arts ${ico('chest')} tous les 10 paliers, un cadre, un dos de carte et un titre de la saison. Les paliers déjà atteints sont donnés tout de suite.</p>`;
  const row = t => { const got = t.tier <= P.got.free, cur = t.tier === P.tier + 1;
    return `<li class="ptier ${got ? 'got' : ''} ${cur ? 'cur' : ''}"><span class="pnum num">${t.tier}</span><div class="pcell">${passGift(t.free)}${got ? '<span class="ok">✓</span>' : ''}</div>
      <div class="pcell prem ${P.premium ? '' : 'lock'}">${passGift(t.premium)}${P.premium && t.tier <= P.got.premium ? '<span class="ok">✓</span>' : ''}</div></li>`; };
  return `${head}
  <div class="card-box passhead theme-${P.theme}">
    <span class="eyebrow">Saison de ${esc(seasonName(P.id))} · encore ${P.daysLeft} jour${P.daysLeft > 1 ? 's' : ''}</span>
    <h2 style="font-size:26px">${esc(P.name)}</h2>
    <p class="hint" style="margin:0">${esc(P.blurb)}</p>
    <div class="lvl"><span class="lvlnum num">Palier ${P.tier}/${P.tiers}</span><div class="bar" role="progressbar" aria-valuenow="${P.xp}" aria-valuemin="0" aria-valuemax="${P.next}" aria-label="${P.tier >= P.tiers ? 'Coffre de fin de passe suivant' : 'XP de saison'}"><span style="width:${pct(P.xp, P.next)}%"></span></div>
      <small class="hint num">${P.xp}/${P.next} XP</small></div>
    ${P.tier >= P.tiers ? `<p style="margin:0"><b>Passe terminé !</b> <span class="hint">Chaque ${P.bonusChest.every} XP de saison ouvre un coffre de fin de passe${P.bonus ? ` (${P.bonus} déjà ouvert${P.bonus > 1 ? 's' : ''})` : ''}.</span></p>` : ''}
    ${ui.msg ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    ${premium}
  </div>
  <div class="card-box"><span class="eyebrow">Cartes uniques de la saison</span>
    <p class="hint" style="margin:0">Elles ne sortent d'aucun booster pendant la saison. Elles rejoindront le Set de base en ${esc(seasonName(releaseMonth(P.cards[0], P.cardMonths)))}.</p>
    <div class="gallery">${P.cards.map(id => `<div class="offer"><button class="ccard" data-zoom="${zoomKey(id)}">${anyCard(id)}</button><small class="hint">Palier ${cardTier(id)}${owned(id) ? ' · obtenue ✓' : ''}</small></div>`).join('')}</div>
    <span class="eyebrow">Arts Promo de la saison</span>
    <p class="hint" style="margin:0">Sur la piste gratuite : on les gagne en montant les paliers.</p>
    <div class="promos">${P.promo.map(x => { const art = ARTS[x.art];
      return `<div class="promo ${x.got ? 'got' : ''}"><button class="ccard artthumb" data-zoom="${zoomKey(art.card, art.id)}" aria-label="Voir ${esc(art.name)} en grand">${artHTML(art.card, nameOf(art.card), 1, '', art.id)}</button>
        <div><span class="eyebrow">Art Promo</span><b>${esc(art.name)}</b><small class="hint num">${x.got ? 'Obtenu ✓' : `Palier ${x.tier}`}</small></div></div>`; }).join('')}</div></div>
  <div class="card-box"><span class="eyebrow">Missions</span>
    <p class="hint" style="margin:0">Elles se valident toutes seules et donnent l'XP de saison qui fait monter les paliers. Chaque partie en donne aussi : ${P.xpWin} pour une victoire, ${P.xpLoss} sinon (dans la limite des parties récompensées du jour).</p>
    <div class="gal-h">Du jour</div><p class="hint" style="margin:0">Nouvelles missions chaque jour à minuit.</p>${passMissions(P.daily)}
    <div class="gal-h">De la semaine</div><p class="hint" style="margin:0">Jusqu'au ${esc(frDate(P.weekEnds))} à minuit.</p>${passMissions(P.weekly)}
    <div class="gal-h">De la saison · ${doneSeason}/${P.seasonal.length}</div><p class="hint" style="margin:0">Tout le mois pour les accomplir.</p>
    ${passMissions(P.seasonal)}</div>
  <div class="card-box"><span class="eyebrow">Paliers</span>
    <p class="hint" style="margin:0">${PASS_TIERS} paliers. Chaque palier atteint donne sa récompense tout de suite : la piste gratuite pour tous, la piste premium avec le passe premium.</p>
    <div class="ptrack"><div class="ptier phead"><span></span><span class="eyebrow">Gratuit</span><span class="eyebrow">Premium</span></div><ol>${P.track.map(row).join('')}</ol></div>
    <div class="promo bonusbox ${P.tier >= P.tiers ? 'got' : ''}"><span class="bonusico">${ico('chest')}</span><div><span class="eyebrow">Après le palier ${P.tiers}, sans fin</span><b>Coffre de fin de passe</b>
      <small class="hint">Tous les ${P.bonusChest.every} XP de saison, pour tous : ${P.bonusChest.odds.shards} % de chances d'avoir ${P.bonusChest.shards} Éclats ${ico('shard')}, ${P.bonusChest.odds.prisms} % ${P.bonusChest.prisms} Prismes ${ico('prism')}, ${P.bonusChest.odds.essence} % ${P.bonusChest.essence} essence d'une de vos cartes.</small></div></div></div>`;
}

// Multiplicateurs d'événement appliqués aux gains d'une partie (XP ×2…).
const eventTags = ev => Object.entries(ev || {}).map(([k, m]) => ` <span class="evtag">${multLabel(m)} ${esc(EVENT_EFFECTS[k]?.short || k)}</span>`).join('');
// Fin de partie : XP, Éclats et niveau gagnés.
function endRewardHTML() {
  const r = ui.mode === 'online' ? ui.view.reward : ui.soloReward;
  if (!r) return `<p class="hint" style="margin:0">${ui.auth ? 'Calcul des récompenses…' : ''}</p>`;
  return `<div class="endreward">${levelBar(r.progress)}
    <p style="margin:0">${r.rewarded ? (gains(r) || 'Pas de gain pour cette partie.') + eventTags(r.events) : `Plus de récompense de partie aujourd'hui ; les missions avancent toujours.${r.passXp ? ` · +${r.passXp} XP de saison` : ''}`}${r.levelUp ? ` · <b>Niveau ${r.progress.level} !</b>` : ''}${r.missions ? ` · ${r.missions} mission${r.missions > 1 ? 's' : ''} accomplie${r.missions > 1 ? 's' : ''}` : ''}</p>${r.ranked ? rankedLine(r.ranked) : ''}</div>`;
}
// Ce que l'écran de fin anime sur PixiJS (fx.js, setEnd) : les récompenses de la partie, une fois connues.
function endReel() {
  if (ui.sheet !== 'end' || ui.mode === 'tuto' || ui.mode === 'story' || !ui.view?.result || ui.view.boss) return null;
  const r = ui.mode === 'online' ? ui.view.reward : ui.soloReward; if (!r) return null;
  const w = ui.view.result.winner;
  return { key: JSON.stringify(r), reward: r, result: w === ui.view.seat ? 'win' : w < 0 ? 'tie' : 'lose' };
}
async function equip(body, okMsg) { if (await call('PUT', '/api/cosmetics', body)) { ui.msg = okMsg; render(); } }

// ---- Niveaux de carte (cosmétiques) ----
// Chaque doublon donne de l'essence de la carte ; essence et Éclats la font monter de niveau : bordure, puis effet de mise en jeu.
const myLevel = id => ui.account?.cardLevels?.[id] || 1;
// Bordure montrée : celle choisie parmi les niveaux atteints (compte : lvLook), sinon celle du niveau.
// Le niveau est celui de la carte, quel que soit l'art choisi ; la bordure ne change ni le reflet ni le débordement.
const myBorder = id => { const lvl = myLevel(id), b = ui.account?.lvLook?.[id]; return b >= 1 && b < lvl ? b : lvl; };
const essenceOf = id => ui.account?.essence?.[id] || 0;
const lvInfo = () => prog().cardLevels || { essenceRate: 0, max: MAX_CARD_LEVEL, costs: {} };
const nextCost = id => lvInfo().costs[myLevel(id) + 1] || null;
// Essence universelle : une carte est au plafond quand son essence suffit à la monter jusqu'au niveau maximum (montée ou non) ;
// ses doublons donnent alors de l'essence universelle, qui s'échange contre l'essence d'une autre carte.
const uniOf = () => ui.account?.uniEssence || 0;
const uniPer = () => lvInfo().uniPerEssence || 2;
const toMax = id => { let need = 0; for (let n = myLevel(id) + 1; n <= MAX_CARD_LEVEL; n++) need += lvInfo().costs[n]?.essence || 0; return Math.max(0, need - essenceOf(id)); };
const isCapped = id => toMax(id) === 0;
// Ce qu'un doublon de cette carte vient de donner (booster, achat), pour son étiquette.
const dupTag = id => `Doublon · +${shardRate()} Éclats${isCapped(id) ? (lvInfo().uniRate ? ` · +${lvInfo().uniRate} essence universelle` : '') : lvInfo().essenceRate ? ` · +${lvInfo().essenceRate} essence` : ''}`;
// Essence qui manque à une carte pour son prochain niveau (0 : elle a de quoi monter, ou elle est au maximum).
const missingEssence = id => { const c = nextCost(id); return c ? Math.max(0, c.essence - essenceOf(id)) : 0; };
async function convertEssence(id, amount) {
  const r = await call('POST', '/api/essence/convert', { card: id, amount });
  if (!r) return;
  if (r.shop) ui.shop = r.shop;
  ui.msg = `+${r.essence} essence de ${nameOf(id)} contre ${r.price} essence universelle.`;
  play('reveal'); render();
}
// Il manque des Éclats : le bouton reste actif si le change est ouvert, il propose alors une offre de change (lacksShards).
const canUpgrade = id => { const c = nextCost(id); return !!(ui.account && ui.account.cards[id] && c && essenceOf(id) >= c.essence && (ui.account.shards >= c.shards || prismRate())); };
// Classe de la bordure d'un niveau (style.css, « .lv-… »), vide au niveau de base.
const lvCls = lvl => (CARD_LEVELS[lvl]?.look ? ` lv lv-${CARD_LEVELS[lvl].look}` : '');
const hasFx = lvl => !!CARD_LEVELS[lvl]?.fx;
async function upgrade(id) {
  const r = await call('POST', '/api/cards/upgrade', { card: id });
  if (!r) return;
  ui.msg = `${nameOf(id)} passe au niveau ${r.level} : ${CARD_LEVELS[r.level].perk.toLowerCase()}.`;
  ui.fx = { list: [['.zoomcard', 'lv-up']], burst: hasFx(r.level) ? ['.zoomcard'] : [] };
  play(hasFx(r.level) ? 'astral' : 'levelup'); render();
}
async function chooseBorder(id, level) {
  if (!await call('PUT', '/api/cards/border', { card: id, level })) return;
  ui.msg = `${nameOf(id)} : ${level > 1 ? `bordure ${CARD_LEVELS[level].name.toLowerCase()}` : 'aspect d\'origine, sans bordure'}.`;
  ui.fx = { list: [['.zoomcard', 'lv-up']] }; play('pick'); render();
}
// Menu « Bordure » de la carte ouverte en grand depuis la collection : une des bordures des niveaux atteints, à montrer à la place de la dernière.
function borderHTML(id) {
  const lvl = myLevel(id), cur = myBorder(id);
  if (!owned(id) || lvl < 2) return '';
  const opt = n => { const x = CARD_LEVELS[n], on = cur === n;
    return `<button class="artopt bdopt ${on ? 'on' : ''}" data-act="border-pick" data-card="${id}" data-lv="${n}" aria-pressed="${on}" ${ui.busy ? 'disabled' : ''}>
      <span class="lvsw${lvCls(n)}"></span><span><b>${n > 1 ? x.name : 'Aucune'}</b><small class="hint">${n === lvl ? 'Actuelle' : `Niv. ${n}`}</small></span></button>`; };
  return `<div class="zacts artbox bdbox"><span class="eyebrow">Bordure · ${lvl} sur ${MAX_CARD_LEVEL} obtenues</span>
    <div class="bdopts" role="group" aria-label="Bordure">${Array.from({ length: lvl }, (_, i) => opt(i + 1)).join('')}</div>
    <p class="hint">Votre adversaire voit la bordure choisie. Le niveau, le reflet et le personnage hors du cadre restent ceux de la carte, quel que soit l'art.</p></div>`;
}
// Bloc « Niveau de la carte » de la carte ouverte en grand depuis la collection.
function upgradeHTML(id) {
  if (!owned(id)) return '';
  const lvl = myLevel(id), c = nextCost(id), ess = essenceOf(id), rate = lvInfo().essenceRate;
  const ladder = CARD_LEVELS.slice(2).map((x, i) => `<li class="${lvl >= i + 2 ? 'done' : ''}"><span class="lvsw lv lv-${x.look}"></span><span><b>Niv. ${i + 2} · ${x.name}</b> <small class="hint">${esc(x.perk)}</small></span>${lvl >= i + 2 ? '<span class="ok">✓</span>' : ''}</li>`).join('');
  const next = c ? `<div class="row" style="gap:8px"><div class="bar" style="flex:1" role="progressbar" aria-valuenow="${Math.min(ess, c.essence)}" aria-valuemin="0" aria-valuemax="${c.essence}" aria-label="Essence"><span style="width:${pct(ess, c.essence)}%"></span></div><small class="num">${ess}/${c.essence} essence</small></div>
      <button class="btn ${canUpgrade(id) ? 'primary' : ''}" data-act="upgrade" data-id="${id}" ${canUpgrade(id) && !ui.busy ? '' : 'disabled'}>Passer au niveau ${lvl + 1} · ${c.essence} essence + ${c.shards} Éclats</button>
      ${ess < c.essence ? `<p class="hint">Chaque doublon de cette carte donne ${rate} essence.</p>${uniHTML(id)}` : ui.account.shards < c.shards ? `<p class="hint">Il vous manque ${c.shards - ui.account.shards} Éclats.</p>` : ''}
      ${isCapped(id) ? `<p class="hint">Cette carte a déjà toute l'essence qu'il lui faut jusqu'au niveau ${MAX_CARD_LEVEL} : ses prochains doublons donnent ${lvInfo().uniRate} essence universelle ${ico('essence')} chacun.</p>` : ''}`
    : `<p class="hint">Niveau maximum atteint. Ses doublons donnent maintenant ${lvInfo().uniRate} essence universelle ${ico('essence')} chacun, à échanger contre l'essence d'une autre carte ou un art du rayon Essence.</p>
      <button class="btn" data-act="shop-essence">Rayon Essence · ${ico('essence')}${fmt(uniOf())}</button>`;
  return `<div class="zacts lvbox"><span class="eyebrow">Niveau de la carte · ${lvl}/${MAX_CARD_LEVEL}</span>
    <p class="hint">Purement cosmétique : la carte joue pareil à tous les niveaux. Votre adversaire voit sa bordure et son effet.</p>
    <ul class="lvladder">${ladder}</ul>${ui.msg ? `<p class="hint" role="status"><b>${esc(ui.msg)}</b></p>` : ''}${next}</div>`;
}

// Compléter l'essence du prochain niveau avec l'essence universelle (uniPerEssence pour 1), sur la carte ouverte en grand.
function uniHTML(id) {
  const miss = missingEssence(id), cost = miss * uniPer(), have = uniOf();
  if (!miss || !have) return '';
  return `<button class="btn ${have >= cost ? 'primary' : ''}" data-act="uni-convert" data-id="${id}" data-n="${miss}" ${have >= cost && !ui.busy ? '' : 'disabled'}>Compléter avec l'essence universelle · ${ico('essence')}${cost}</button>
    <p class="hint">${have >= cost ? `Vous en avez ${fmt(have)} : ${uniPer()} pour 1 essence de cette carte.` : `Il vous en faut ${cost} (vous en avez ${fmt(have)}).`}</p>`;
}

// ---- Arts alternatifs (cosmétiques) ----
// Art choisi pour une carte, s'il est toujours possédé ; null : l'illustration d'origine.
const mySel = id => { const x = ui.account?.artSel?.[id]; return x && ui.account.arts?.[x] && artExists(x) ? x : null; };
const myArts = id => artsOf(id).filter(x => ui.account?.arts?.[x.id]);
// Reflet holographique (art.js, holo.js) : allumé sauf sur les cartes où le joueur l'a coupé.
setHoloOff(() => ui.account?.holoOff || {});
const holoOn = id => !ui.account?.holoOff?.[id];
async function toggleHolo(card) {
  const on = !holoOn(card);
  if (!await call('PUT', '/api/arts/holo', { card, on })) return;
  ui.msg = on ? `Reflet holographique rallumé sur ${nameOf(card)}.` : `Reflet holographique coupé sur ${nameOf(card)}.`; play('pick'); render();
}
// Interrupteur du reflet, sur la carte ouverte en grand depuis la collection, si elle en a un (art alternatif, niveau Or ou plus).
function holoHTML(id) {
  if (!owned(id) || !holoCard(myLevel(id), mySel(id))) return '';
  const on = holoOn(id);
  return `<button class="artopt holotgl ${on ? 'on' : ''}" data-act="holo-toggle" data-card="${id}" role="switch" aria-checked="${on}" ${ui.busy ? 'disabled' : ''}>
    <span class="holosw" aria-hidden="true"></span><span><b>Reflet holographique</b> <small class="hint">${on ? 'Activé : il bouge quand vous inclinez le téléphone' : 'Désactivé sur cette carte'}</small></span></button>`;
}
// Débordement du personnage (art.js, niveau Or et plus) : allumé sauf sur les cartes où le joueur l'a coupé.
setPopOff(() => ui.account?.popOff || {});
const popOn = id => !ui.account?.popOff?.[id];
async function togglePop(card) {
  const on = !popOn(card);
  if (!await call('PUT', '/api/arts/pop', { card, on })) return;
  ui.msg = on ? `${nameOf(card)} sort de nouveau du cadre.` : `${nameOf(card)} reste dans son cadre.`; play('pick'); render();
}
// Interrupteur du débordement, sur la carte ouverte en grand depuis la collection, une fois le débordement débloqué.
function popHTML(id) {
  if (!owned(id) || !popCard(id, myLevel(id), mySel(id))) return '';
  const on = popOn(id);
  return `<button class="artopt holotgl ${on ? 'on' : ''}" data-act="pop-toggle" data-card="${id}" role="switch" aria-checked="${on}" ${ui.busy ? 'disabled' : ''}>
    <span class="holosw" aria-hidden="true"></span><span><b>Personnage hors du cadre</b> <small class="hint">${on ? 'Activé : il déborde de l\'illustration' : 'Désactivé : il reste dans le cadre'}</small></span></button>`;
}
// Effets de la carte (reflet, débordement) : un bloc d'interrupteurs, s'il y en a.
const fxHTML = id => { const h = holoHTML(id) + popHTML(id); return h ? `<div class="zacts holobox">${h}</div>` : ''; };
// Pastille de rareté (style.css, « .rar-… »).
const rarChip = art => `<span class="rarchip rar-${rarityKey(art)}">${esc(rarityName(art))}</span>`;
// Famille d'arts d'un art (arts.js, ART_THEMES), pour les sous-titres.
const themeOf = art => (art.theme ? ART_THEMES[art.theme].name : '');
async function selectArt(card, art) {
  const r = await call('PUT', '/api/arts/select', { card, art: art || null });
  if (!r) return;
  ui.msg = art ? `Art « ${ARTS[art].name} » choisi pour ${nameOf(card)}.` : `${nameOf(card)} reprend son illustration d'origine.`;
  ui.fx = { list: [['.zoomwrap .zoomart', 'art-swap']] }; play('pick'); render();
}
// Bloc « Arts » de la carte ouverte en grand depuis la collection : l'origine et les arts possédés, à choisir ; ceux qui restent à trouver.
function artsHTML(id) {
  const all = artsOf(id); if (!all.length) return '';
  const mine = myArts(id), cur = mySel(id), missing = all.length - mine.length;
  const opt = (art, label, sub) => `<button class="artopt ${cur === (art?.id || null) ? 'on' : ''}" data-act="art-pick" data-card="${id}" data-art="${art?.id || ''}" aria-pressed="${cur === (art?.id || null)}" ${ui.busy ? 'disabled' : ''}>
    <span class="artsw ${art ? `rar-${rarityKey(art)}` : ''}"></span><span><b>${esc(label)}</b>${sub ? ` <small class="hint">${sub}</small>` : ''}</span>${cur === (art?.id || null) ? '<span class="ok">✓</span>' : ''}</button>`;
  return `<div class="zacts artbox"><span class="eyebrow">Arts de la carte · ${mine.length + 1}/${all.length + 1}</span>
    <p class="hint">Purement cosmétique. Votre adversaire voit l'art choisi quand la carte est révélée.</p>
    <div class="artopts">${opt(null, 'Illustration d\'origine', '')}${mine.map(x => opt(x, x.name, esc([rarityName(x), themeOf(x) && `famille ${themeOf(x)}`].filter(Boolean).join(' · ')))).join('')}</div>
    ${missing ? `<p class="hint">${missing} autre${missing > 1 ? 's' : ''} art${missing > 1 ? 's' : ''} à trouver en boutique${all.some(x => x.edition === 'promo' && !ui.account.arts?.[x.id]) ? ' ou en récompense' : ''}${all.some(x => x.edition === 'clan' && !ui.account.arts?.[x.id]) ? ' ou au magasin de clan' : ''}.</p>` : ''}</div>`;
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
// Les places se comptent en fin de tour : une carte déplacée libère la sienne aussitôt.
const freeSlots = z => SLOTS - me().board[z].filter(c => !moveOf(c.uid)).length - ui.pending.filter(p => p.zone === z).length - ui.moves.filter(m => m.zone === z).length;
const moveOf = uid => ui.moves.find(m => m.uid === uid);
// Zone d'une de ses cartes sur le plateau : celle du début du tour, et celle où elle sera après les déplacements prévus.
const boardZone = uid => me().board.findIndex(col => col.some(c => c.uid === uid));
const planZone = uid => moveOf(uid)?.zone ?? boardZone(uid);
// Puissance d'une zone de son côté une fois les déplacements prévus faits (estimation : les auras ne sont pas recalculées).
const planPower = z => me().zonePower[z] + ui.moves.reduce((s, m) => {
  const c = me().board.flat().find(x => x.uid === m.uid), p = c && c.revealed && CARDS[c.id].type === 'C' ? c.power : 0;
  return s + (m.zone === z ? p : 0) - (boardZone(m.uid) === z ? p : 0);
}, 0);
const handLeft = () => me().hand.filter(c => !ui.pending.some(p => p.uid === c.uid));
const canPlay = () => ui.view && ui.view.phase === 'plan' && !ui.view.ready.me;

// ---- Rendu ----
function miniCard(c, opts = {}) {
  if (c.hidden) return `<div class="mc back back-${esc(badgeOf(1 - ui.view.seat)?.back || 'classique')}" data-hid="${c.uid}" aria-label="Carte cachée"></div>`;
  const d = CARDS[c.id]; const pw = c.revealed ? c.power : (opts.power ?? d.power);
  const cls = c.revealed ? (pw > d.power ? 'up' : pw < d.power ? 'down' : '') : '';
  const mv = opts.mine && ui.view.phase === 'plan' && moveOf(c.uid);
  const mobile = opts.mine && c.mobile && canPlay();
  const seat = opts.mine || opts.pending ? ui.view.seat : 1 - ui.view.seat, lv = lvCls(borderIn(seat, c.id));
  return `<div class="mc${lv} ${opts.pending || !c.revealed ? 'pending' : ''} ${mobile ? 'mobile' : ''} ${ui.moveSel === c.uid ? 'msel' : ''} ${mv ? 'moving' : ''} ${ui.drag === c.uid ? 'dragging' : ''}" style="${famVar(d.kw)}"
    data-card="${c.uid}" data-id="${c.id}" ${opts.pending ? 'data-pending="1"' : ''} ${mobile ? 'data-mobile="1"' : ''} title="${esc(d.name)}">
    ${artBg(c.id, artIn(seat, c.id))}${mv ? `<span class="mv" title="Déplacée depuis ${ZONE_NAMES[boardZone(c.uid)]}" aria-label="Déplacée depuis ${ZONE_NAMES[boardZone(c.uid)]}">⇄</span>` : mobile ? '<span class="mv" aria-label="Déplaçable">⇄</span>' : ''}
    <span class="n">${esc(d.name)}</span>${d.type === 'C' ? `<span class="p num ${cls}">${pw}</span>` : `<span class="p" style="font-size:12px">Sort</span>`}</div>`;
}
function slots(side, z, isMe) {
  // De son côté, pendant la préparation, les cartes déplacées s'affichent déjà dans leur nouvelle zone.
  const plan = isMe && ui.view.phase === 'plan';
  const here = plan ? side.board.flat().filter(c => planZone(c.uid) === z) : side.board[z];
  const cards = here.map(c => miniCard(c, { mine: isMe }));
  if (isMe) for (const p of ui.pending.filter(p => p.zone === z)) cards.push(miniCard({ uid: p.uid, id: p.id, revealed: false }, { pending: true }));
  // Pendant la révélation, une zone vidée puis remplie peut compter une carte de plus le temps que le déplacement se fasse.
  let h = ''; for (let i = 0; i < Math.max(SLOTS, cards.length); i++) h += cards[i] || `<div class="slot"></div>`;
  return `<div class="slots">${h}</div>`;
}
function terrainChip(side, z, isMe) {
  const t = side.terrains[z];
  const soon = isMe && side.terrainPlan && side.terrainPlan.find(x => x.z === z);
  if (!t && soon) return `<button class="terrain soon" data-terrain="${soon.t}">Tour ${soon.turn} : ${TERRAINS[soon.t].name}</button>`;
  if (!t) return ui.view.noTerrain ? '<div class="terrain none"></div>' : `<div class="terrain">${ui.view.turn < 3 ? 'Terrain à venir' : '—'}</div>`;
  return `<button class="terrain set ${isMe ? 'me' : 'foe'}" data-terrain="${t}">${TERRAINS[t].name}</button>`;
}
// Titre, niveau, cadre et dos de carte de chaque joueur : envoyés par le serveur en ligne ; contre l'IA, ceux du compte.
const badgeOf = seat => ui.view.badges?.[seat] || (seat === ui.view.seat && ui.account ? prog().badge : null);
// Niveau d'une carte en partie : le sien vient du compte ; celui de l'adversaire, du serveur, une fois la carte révélée.
const levelIn = (seat, id) => (seat === ui.view.seat ? myLevel(id) : badgeOf(seat)?.looks?.[id] || 1);
// Bordure montrée par un joueur sur une carte : celle qu'il a choisie, sinon celle de son niveau.
const borderIn = (seat, id) => (seat === ui.view.seat ? myBorder(id) : badgeOf(seat)?.borders?.[id] || levelIn(seat, id));
// Art alternatif d'une carte en partie : le sien vient du compte ; celui de l'adversaire, du serveur, une fois la carte révélée.
const artIn = (seat, id) => (seat === ui.view.seat ? mySel(id) : badgeOf(seat)?.arts?.[id] || null);
// Image de profil : envoyée une fois par le serveur en ligne ; contre l'IA, la sienne seulement.
const avatarOf = seat => (ui.mode === 'online' ? ui.avatars?.[seat] : null) || (seat === ui.view.seat ? ui.account?.avatar : null) || null;
// Carte du général, toujours visible à côté du joueur : portrait, nom, et ce qu'il fait ou peut faire maintenant.
// La sienne brille quand elle peut être activée ; une double touche l'ouvre en grand avec son effet.
function genSlot(side, isMe, canGen) {
  const g = GENERALS[side.general], seat = isMe ? ui.view.seat : 1 - ui.view.seat;
  const state = isMe && ui.genZone !== null ? 'armed' : side.generalUsed ? 'used' : isMe && canGen ? 'ready' : '';
  const cost = g.activateCost ? ` · ${g.activateCost} sceau${g.activateCost > 1 ? 'x' : ''}` : '';
  const note = state === 'armed' ? 'Activé ce tour' : state === 'used' ? (g.activate ? 'Utilisé' : 'Déclenché')
    : state === 'ready' ? `Activer${cost}` : g.activate ? `Activable${cost}` : g.kind;
  // « Séraphine, Main de l'Aube » : le nom, puis le titre en petit. Sans virgule, le nom entier sur deux lignes.
  const [short, epithet] = g.name.split(/,\s*/);
  const pic = portraitHTML(side.general, artIn(seat, side.general)) || `<span class="gport-init" aria-hidden="true">${esc(short[0])}</span>`;
  // --gt : le portrait respire sans à-coup d'un rendu à l'autre (ses animations CSS reprennent là où elles en étaient).
  return `<button class="gencard${lvCls(borderIn(seat, side.general))} ${state}" style="${famVar([g.fam])}; --gt: -${Math.round(performance.now())}ms" data-general="${side.general}" data-gfam="${g.fam || ''}" data-side="${isMe ? 'me' : 'foe'}"
    aria-label="Général : ${esc(g.name)}, ${esc(note)}" title="${esc(g.text)}">
    <span class="gport">${pic}</span>
    <span class="gtx"><span class="gk">${g.boss ? 'Boss' : 'Général'}</span><span class="gn ${epithet ? '' : 'two'}">${esc(short)}</span>${epithet ? `<span class="ge">${esc(epithet)}</span>` : ''}
    <span class="gs">${g.activate ? '<i class="gdot" aria-hidden="true"></i>' : ''}${esc(note)}</span></span></button>`;
}
function pbar(side, isMe, connected, canGen = false) {
  const seat = isMe ? ui.view.seat : 1 - ui.view.seat, b = badgeOf(seat);
  const who = { name: side.name, avatar: avatarOf(seat), progress: { frame: b?.frame } };
  // Le boss n'a ni main ni deck : sa ligne dit plutôt combien de zones il tient encore.
  const held = !isMe && ui.view.boss ? [0, 1, 2].filter(z => !ui.view.boss.score.zones[z]?.beat).length : 0;
  const stats = !isMe && ui.view.boss ? `<span class="num">${held ? `Tient ${held} zone${held > 1 ? 's' : ''} sur 3` : 'Débordé partout'}</span>` : [
    !isMe ? `<span class="num" title="Sceaux de l'adversaire ce tour">Sceaux ${side.seals}</span>` : '',
    `<span class="num">Main ${side.handCount}</span>`, `<span class="num">Deck ${side.deckCount}</span>`,
    side.treasure ? `<span class="num" title="Sceaux non dépensés aux tours précédents">Trésor ${side.treasure}</span>` : '',
    side.perfectTurns ? `<span class="num" title="Tours finis avec tous les sceaux dépensés">Grâce ${side.perfectTurns}</span>` : '',
  ].filter(Boolean).join('');
  const ready = !isMe && ui.view.phase === 'plan' && ui.view.ready.foe;
  const av = `${avatarHTML(who, 'pa')}${!isMe && ui.mode === 'online' ? `<span class="dot ${connected ? '' : 'off'}" title="${connected ? 'Connecté' : 'Déconnecté'}"></span>` : ''}`;
  // Émotes (pas dans le tutoriel) : votre portrait ouvre le sélecteur, celui de l'adversaire coupe ou rétablit ses émotes.
  const emo = ui.mode === 'online' || ui.mode === 'solo';
  const pav = !emo ? `<span class="pav">${av}</span>` : isMe
    ? `<button class="pav emobtn ${ui.emotePick ? 'on' : ''}" data-act="emotes" aria-haspopup="menu" aria-expanded="${ui.emotePick}" aria-label="Envoyer une émote" title="Émotes">${av}<span class="emohint" aria-hidden="true">${EMO_ICON}</span></button>`
    : `<button class="pav emobtn" data-act="emote-mute" aria-pressed="${ui.emoteMute}" aria-label="${ui.emoteMute ? 'Rétablir' : 'Couper'} les émotes de ${esc(side.name)}" title="${ui.emoteMute ? 'Émotes coupées' : 'Couper ses émotes'}">${av}${ui.emoteMute ? `<span class="emohint off" aria-hidden="true">${MUTED_ICON}</span>` : ''}</button>`;
  // Bulle et sélecteur d'émotes : à côté du bandeau, pas dedans (les thèmes découpent le bandeau, clip-path, ce qui les cacherait).
  return `<div class="pslot">${bubbleHTML(seat, isMe)}${isMe && emo && ui.emotePick ? emotePickHTML() : ''}<div class="pbar ${isMe ? 'me' : 'foe'}">
    ${pav}
    <div class="pid"><div class="pline"><span class="who">${isMe ? 'Vous' : esc(side.name)}</span>${b?.level ? `<small class="lv num">niv. ${b.level}</small>` : ''}${ready ? '<span class="chip ok">Prêt</span>' : ''}${b?.title ? `<span class="ptitle">${esc(b.title)}</span>` : ''}</div>
      <div class="pstats">${stats}</div></div>
    ${ui.view.noGeneral ? '' : genSlot(side, isMe, canGen)}</div></div>`;
}
// ---- Émotes en partie ----
const EMO_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
const MUTED_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor" stroke="none" opacity=".35"/><path d="M3 3l18 18"/></svg>';
const emoteBody = id => `<span class="ei" aria-hidden="true">${EMOTES[id].icon}</span><span class="et">${esc(EMOTES[id].text)}</span>`;
// Bulle d'une émote à côté du joueur. Son animation (pop, puis fondu) reprend où elle en était quand la partie se redessine.
function bubbleHTML(seat, isMe) {
  const b = ui.bubbles[seat], t = b ? Date.now() - b.at : 0;
  if (!b || t >= EMOTE_SHOW_MS) return '';
  return `<div class="ebubble ${isMe ? 'me' : 'foe'}" role="status" style="animation-delay:-${t}ms">${emoteBody(b.id)}</div>`;
}
// Sélecteur, au-dessus de votre bandeau : vos émotes (Profil, Personnalisation), et de quoi couper celles de l'adversaire.
function emotePickHTML() {
  const list = prog().emotes?.length ? prog().emotes : FREE_EMOTES;
  return `<div class="emotepick" role="menu" aria-label="Émotes">
    <div class="emogrid">${list.filter(id => EMOTES[id]).map(id => `<button class="emo" role="menuitem" data-act="emote" data-id="${id}">${emoteBody(id)}</button>`).join('')}</div>
    <button class="emomute ${ui.emoteMute ? 'on' : ''}" data-act="emote-mute" aria-pressed="${ui.emoteMute}">${ui.emoteMute ? MUTED_ICON : EMO_ICON}${ui.emoteMute ? 'Émotes de l\'adversaire coupées' : 'Couper les émotes de l\'adversaire'}</button></div>`;
}
function sendEmote(id) {
  ui.emotePick = false;
  if (Date.now() - ui.emoteAt < EMOTE_COOLDOWN_MS) { ui.msg = 'Une émote à la fois : attendez un instant.'; msgFades(); render(); return; }
  ui.emoteAt = Date.now(); ui.ctrl?.emote?.(id); play('pick'); render();
}
function toggleEmoteMute() {
  ui.emoteMute = !ui.emoteMute; ui.emotePick = false;
  if (ui.emoteMute && ui.view) delete ui.bubbles[1 - ui.view.seat];
  ui.msg = ui.emoteMute ? `Émotes de ${ui.view?.foe.name || 'l\'adversaire'} coupées pour cette partie.` : `Émotes de ${ui.view?.foe.name || 'l\'adversaire'} rétablies.`;
  msgFades(); render();
}
// Tour en cours, dans la barre du haut sous le type de partie : numéro et un point par tour.
function turnHTML(label) {
  const v = ui.view;
  let pips = ''; for (let t = 1; t <= v.turns; t++) pips += `<span class="pip ${t < v.turn ? 'past' : t === v.turn ? 'now' : ''}"></span>`;
  return `<div class="tturn ${v.turn === v.turns ? 'last' : ''}"><span class="tmode">${label}</span>
    <div class="th"><span class="tl">Tour</span><b class="num">${v.turn}<small>/${v.turns}</small></b><span class="pips" aria-hidden="true">${pips}</span></div></div>`;
}
// Sceaux, en bas à côté de Valider : sceaux libres, déjà engagés, et ce que coûterait la carte choisie.
function sealsHTML(seals) {
  const v = ui.view, total = Math.max(v.me.seals, 0);
  const selCost = ui.sel !== null && canPlay() ? (CARDS[me().hand.find(c => c.uid === ui.sel)?.id]?.x ? Math.max(seals, 0) : handCost(ui.sel)) : 0;
  let tokens = '';
  if (total <= 12) for (let i = 0; i < total; i++) {
    const cls = i >= seals ? 'spent' : i >= seals - selCost ? 'cost' : '';
    tokens += `<span class="tok ${cls}"></span>`;
  }
  // Titre et nombre, puis les jetons : sur deux rangées au-delà de 5 pour laisser la place au bouton Valider.
  return `<div class="tseals" aria-label="Sceaux restants : ${seals} sur ${total}"><div class="th"><span class="tl">Sceaux</span><b class="num">${seals}<small>/${total}</small></b></div><span class="toks ${total > 5 ? 'many' : ''}" aria-hidden="true">${tokens}</span></div>`;
}
function renderGame() {
  const v = ui.view, m = v.me, f = v.foe, g = GENERALS[m.general];
  const play = canPlay();
  let board = '';
  for (const z of [0, 1, 2]) {
    const a = f.zonePower[z], b = v.phase === 'plan' ? planPower(z) : m.zonePower[z];
    const mz = ui.moveSel !== null ? planZone(ui.moveSel) : -1;
    const target = play && ((ui.sel && freeSlots(z) > 0) || (ui.moveSel !== null && z !== mz && freeSlots(z) > 0));
    const won = b > a ? 'won-me' : a > b ? 'won-foe' : '';
    board += `<div class="zone ${won} ${target ? 'target' : ''}" data-z="${z}" ${target ? 'tabindex="0" role="button"' : ''} aria-label="Zone ${ZONE_NAMES[z]}">
      ${f.terrains[z] ? terrainBg(f.terrains[z], 'foe') : ''}${m.terrains[z] ? terrainBg(m.terrains[z], 'me') : ''}${terrainChip(f, z, false)}${slots(f, z, false)}
      <div class="score"><span class="v foe ${a > b ? 'lead' : ''}">${a}</span><span class="zn">${ZONE_NAMES[z]}</span><span class="v me ${b > a ? 'lead' : ''}">${b}</span></div>
      ${slots(m, z, true)}${terrainChip(m, z, true)}
      ${ui.genZone === z && g.needsZone ? `<div class="gmark">Général activé ici</div>` : ''}</div>`;
  }
  const planning = v.phase === 'plan';
  const seals = planning ? sealsLeft() : m.seals;
  const hand = (planning ? handLeft() : m.hand).map(c => { const d = CARDS[c.id];
    const cant = d.x ? seals <= 0 : c.cost > seals;
    const pcls = c.power > d.power ? 'up' : c.power < d.power ? 'down' : '';
    return `<button class="hc${lvCls(myBorder(c.id))} ${ui.sel === c.uid ? 'sel' : ''} ${ui.drag === c.uid ? 'dragging' : ''} ${cant ? 'cant' : ''}" style="${famVar(d.kw)}" data-hand="${c.uid}" data-id="${c.id}">${artBg(c.id, mySel(c.id))}
      <span class="top2"><span class="seal">${costLabel(d, c.cost)}</span>${d.type === 'C' ? `<span class="p num ${pcls}">${c.power}</span>` : '<span class="t">Sort</span>'}</span>
      <span class="n">${esc(d.name)}</span>${d.text ? `<span class="x">${rich(d.text)}</span>` : `<span class="k">${kwLine(d)}</span>`}${boss.handChip(v, c.id)}</button>`; }).join('');
  const canGen = play && g.activate && !m.generalUsed && m.seals >= (g.activateCost || 0);
  const goLabel = v.phase === 'reveal' ? 'Révélation…' : v.ready.me ? 'En attente…' : v.turn === v.turns ? 'Valider le dernier tour' : 'Valider le tour';
  const mode = ui.mode === 'online' ? (v.boss ? 'Boss mondial' : v.ranked ? 'Partie classée' : `Partie ${esc(ui.room || '')}`) : ui.mode === 'tuto' ? 'Tutoriel' : ui.mode === 'story' ? esc(story.label()) : 'Contre l\'IA';
  // Hors tutoriel, pas d'encadré d'info : une double touche ouvre la carte en grand, et un refus (zone pleine, sceaux) s'affiche en bulle au-dessus de la main.
  const toast = ui.msg ? `<div class="toast" role="alert">${esc(ui.msg)}</div>` : '';
  return `
  <div class="top">${turnHTML(mode)}
    ${muteBtn()}<button class="btn" data-act="log">Journal</button><button class="btn" data-act="set">Cartes</button></div>
  ${linkHTML(v)}
  ${pbar(f, false, v.connected[1 - v.seat])}
  ${boss.tableHTML(v)}
  <div class="board">${board}</div>
  ${pbar(m, true, true, canGen)}
  ${ui.coach ? coachHTML(ui.coach) : ''}
  <div class="hand" id="hand">${hand || '<span class="empty">Main vide.</span>'}</div>
  <div class="dock">${toast}<button class="btn icon" data-act="quit" aria-label="Quitter la partie" title="Quitter la partie">${QUIT_ICON}</button>${sealsHTML(seals)}
    <button class="btn primary grow" data-act="go" ${play && (ui.mode !== 'tuto' || ui.ctrl?.canSubmit(ui)) ? '' : 'disabled'}>${goLabel}</button></div>`;
}
// Partie en ligne : bandeau quand l'un des deux joueurs a perdu la connexion. Sa place lui est gardée, la partie reprend à son retour.
// Au-delà de 60 secondes sans revenir, le joueur déconnecté perd par forfait : le serveur donne le temps qui reste (view.away).
function linkHTML(v) {
  if (ui.mode !== 'online') return '';
  const playing = v.phase !== 'over';
  if (ui.offline) return `<div class="link-lost" role="status">Connexion perdue, reconnexion en cours…${ui.ctrl?.queued() ? ' Votre tour partira dès le retour du réseau.' : ''}${playing ? ' Sans retour sous 60 secondes, la partie est perdue.' : ''}</div>`;
  if (playing && !v.connected[1 - v.seat]) {
    const until = ui.awayUntil?.[1 - v.seat];
    return `<div class="link-lost foe" role="status">${esc(v.foe.name)} s'est déconnecté : ${until
      ? `victoire par forfait s'il ne revient pas dans ${countdown(until)}.` : 'la partie reprend dès son retour.'}</div>`;
  }
  return '';
}
// Compte à rebours en secondes, mis à jour chaque seconde sans redessiner l'écran.
const secsLeft = until => `${Math.max(0, Math.ceil((until - Date.now()) / 1000))} s`;
const countdown = until => `<b class="num" data-until="${until}">${secsLeft(until)}</b>`;
setInterval(() => document.querySelectorAll('[data-until]').forEach(el => { el.textContent = secsLeft(+el.dataset.until); }), 1000);
// Consigne du guide : mots-clés en gras (rich), et **mots importants** en or.
const coachText = t => rich(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
// Bulle du tutoriel, entre votre bandeau et la main : portrait de Séraphine, la guide, avancée de la leçon, consigne en une ou deux
// lignes et bouton Suivant pour une étape d'information. « Passer » quitte la leçon (au premier lancement : vers le choix du deck).
// La bulle s'anime quand la consigne change (.new, ui.coachShown).
const coachHTML = (c, float = false) => {
  const dots = c.steps ? `<span class="coach-dots" aria-label="Étape ${c.step} sur ${c.steps}">${Array.from({ length: c.steps }, (_, i) => `<i class="${i + 1 < c.step ? 'past' : i + 1 === c.step ? 'now' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="coach ${float ? 'float' : ''} ${float === 'bottom' ? 'bottom' : ''} ${c.text !== ui.coachShown ? 'new' : ''}" role="status" aria-live="polite">
  <span class="coach-face" aria-hidden="true">${portraitHTML('seraphine')}</span>
  <div class="coach-body"><div class="coach-head"><b>Séraphine</b>${dots}${c.done ? '' : ui.screen !== 'game' ? '<button class="coach-skip" data-act="guide-skip">Passer</button>' : nextLesson() ? `<button class="coach-skip" data-act="tuto" data-lesson="${nextLesson()}" title="Passer à la leçon suivante">Passer</button>` : '<button class="coach-skip" data-act="quit">Passer</button>'}</div>
    <p>${coachText(c.text)}</p></div>
  ${c.info ? `<button class="btn primary sm coach-next" data-act="tuto-next">${c.done ? 'Terminer' : 'Suivant'}</button>` : ''}</div>`;
};
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
// border : niveau de la bordure montrée (myBorder), par défaut celle du niveau.
// cls : classe de l'illustration (« grand » : toujours l'original, pour une carte montrée en grand ; art.js).
const anyCard = (id, lvl = 1, art = null, border = lvl, cls = '') => GENERALS[id] ? genCard(id, lvl, art, border, cls) : fullCard(id, lvl, art, border, cls);
// art : montrer cet art alternatif en grand (aperçu en boutique).
const zoomKey = (id, art = '') => `${GENERALS[id] ? 'general' : 'card'}:${id}${art ? `:${art}` : ''}`;
function renderLoading() {
  return `<div class="top"><span class="title">Jeu de cartes</span></div>
  <div class="card-box">${ui.error ? `${errLine()}<div class="row"><button class="btn primary" data-act="retry">Réessayer</button><button class="btn" data-act="logout">Changer de compte</button></div>` : '<p class="wait">Connexion…</p>'}</div>`;
}
// Choix de la langue au premier lancement (réglable ensuite dans le profil).
function renderLang() {
  return `<div class="top"><span class="title">Jeu de cartes</span></div>
  <div class="card-box langpick">
    <h2 style="font-size:22px">Langue · Language</h2>
    <p class="hint" style="margin:0">Choisissez la langue du jeu. Vous pourrez la changer dans votre profil.<br>Choose the game's language. You can change it later in your profile.</p>
    <div class="row">${langButtons(deviceLang())}</div>
  </div>`;
}
// Boutons des langues ; `on` : celle qui est mise en avant.
const langButtons = on => LANGS.map(([id, name]) => `<button class="btn ${id === on ? 'primary' : ''}" data-act="lang" data-lang="${id}" aria-pressed="${id === on}">${name}</button>`).join('');
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
  return `<div class="top"><span class="title">Bienvenue, ${esc(ui.account.name)}</span><button class="btn" data-act="tuto">Initiation</button><button class="btn" data-act="set">Voir les cartes</button><button class="btn" data-act="logout">Se déconnecter</button></div>
  <div class="setup">
    <p>Choisissez votre deck de départ. Ses ${DECK_SIZE} cartes et ses généraux forment votre collection ; les boosters l'agrandissent ensuite, généraux compris. Ce choix est définitif.</p>
    <div class="decks starters">${opts}</div>
    ${errLine()}
    <div class="row"><button class="btn primary" data-act="starter" ${ui.starterPick && !ui.busy ? '' : 'disabled'}>${ui.starterPick ? `Prendre ${DECKS[ui.starterPick].name}` : 'Choisissez un deck'}</button></div>
  </div>`;
}
function renderHome() {
  const a = ui.account, d = a.deck, g = d && GENERALS[d.general], p = prog();
  clan.warm();
  const deckErr = d ? deckError(d, a) : 'Aucun deck.';
  const left = p.missions.filter(m => !m.done).length;
  // Booster du jour, boosters et coffres offerts : un seul bandeau, seulement quand il y a quelque chose à ouvrir.
  // Les cadeaux s'ouvrent ici même (un bouton par set ouvert), sans passer par la boutique.
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`, dis = ui.busy ? 'disabled' : '';
  const openSets = shopOrder(SETS).filter(x => x.open && x.cards.length && setRevealed(x)), chests = p.freeChests && chestPool(a.arts).length ? p.freeChests : 0;
  const giftBtns = [
    ...(p.freeBoosters ? openSets.map(x => `<button class="btn primary" data-act="free-booster" data-set="${x.id}" ${dis}>${openSets.length > 1 ? `Booster ${esc(x.name)}` : 'Ouvrir un booster'}</button>`) : []),
    chests ? `<button class="btn primary" data-act="chest-free" ${dis}>Ouvrir un coffre</button>` : '',
  ].join('');
  // Un coffre offert reste en attente tant que le joueur a tous les arts du coffre : rien à ouvrir alors.
  const giftTitle = [p.freeBoosters ? `${plural(p.freeBoosters, 'booster')} offert${p.freeBoosters > 1 ? 's' : ''}` : '',
    chests ? `${plural(chests, 'coffre')} d'arts offert${chests > 1 ? 's' : ''}` : ''].filter(Boolean).map(x => `<span>${x}</span>`).join('');
  const gift = a.boosterReady ? `<div class="card-box booster ready">
      <div><span class="eyebrow">Bonjour ${esc(a.name)}</span><h2>Booster du jour</h2></div>
      <button class="btn primary" data-act="booster" ${dis}>Ouvrir</button></div>`
    : giftBtns ? `<div class="card-box booster ready gifts">
      <div><span class="eyebrow">Récompense</span><h2>${giftTitle}</h2></div>
      <div class="giftbtns">${giftBtns}</div></div>` : '';
  // Salon de jeu, à la manière des jeux de cartes mobiles : le général du deck joué en grand, un gros bouton Jouer,
  // et autour des tuiles (passe, missions, calendrier) qui ouvrent chacune leur écran ou leur feuille.
  const hero = g ? heroHTML(d.general, mySel(d.general)) : '';
  const cal = p.calendar;
  return `
  <div class="top hometop hud"><button class="profile-btn" data-act="profile" aria-label="Mon profil">${avatarHTML(a)}</button>
    <button class="hud-id" data-act="profile"><b>${esc(a.name)}</b><span class="hud-lv num">Niv. ${p.level}<span class="bar" aria-hidden="true"><span style="width:${pct(p.xp, p.xpNext)}%"></span></span></span></button>
    <span class="wallet">${walletHTML()}</span>${mail.button()}${muteBtn()}</div>
  <div class="setup home lobby">
    ${gift}
    <section class="showcase" style="${g ? famVar([g.fam]) : ''}" data-fam="${esc(g?.fam || '')}">
      <div class="sc-art">${hero || `<span class="sc-init" aria-hidden="true">${esc((g?.name || '?')[0])}</span>`}</div>
      ${eventChips(p.events?.live || [])}
      ${p.ranked ? `<button class="sc-rank" data-act="ranked" aria-label="Classement">${rankHTML(p.ranked.rank)}<small>${esc(p.ranked.seasonName)}</small></button>` : ''}
      <button class="sc-deck" data-act="decks"><span class="eyebrow">Deck joué</span><b>${esc(d ? d.name : 'Aucun deck')}</b>${g ? `<small>${esc(g.name)}</small>` : ''}<span class="sc-change">Changer</span></button>
    </section>
    ${deckErr ? `<p class="err" style="margin:0">${esc(deckErr)}</p>` : ''}
    <button class="playbtn" data-act="${p.ranked ? 'ranked-play' : 'solo'}"><span>Jouer</span><small>${p.ranked ? 'Partie classée' : "Contre l'IA"}</small></button>
    <div class="duo">${p.ranked ? `<button class="btn" data-act="solo">Contre l'IA</button>` : `<button class="btn" data-act="learn">Apprendre</button>`}<button class="btn" data-act="play-friend">Avec un ami</button></div>
    ${errLine()}
    <div class="tiles">
      ${p.pass ? `<button class="tile passline theme-${p.pass.theme}" data-act="pass"><span class="eyebrow">Passe · ${p.pass.daysLeft} j</span><b>${esc(p.pass.name)}</b>
        <span class="tile-foot num">Palier ${p.pass.tier}/${p.pass.tiers}</span><span class="bar" aria-hidden="true"><span style="width:${pct(p.pass.xp, p.pass.next)}%"></span></span></button>` : ''}
      ${p.missions.length ? `<button class="tile ${left ? 'todo' : ''}" data-act="missions"><span class="eyebrow">Missions du jour</span><b class="num">${p.missions.length - left}/${p.missions.length}</b>
        <span class="tile-foot">${left ? `${left} à faire` : 'Toutes faites ✓'}</span></button>` : ''}
      ${cal ? `<button class="tile ${cal.ready ? 'todo' : ''}" data-act="calendar"><span class="eyebrow">Calendrier</span><b>${esc(cal.name.split(' ')[0])}</b>
        <span class="tile-foot num">${cal.ready ? 'Récompense à récupérer' : `${cal.got} jour${cal.got > 1 ? 's' : ''} sur ${cal.days.length}`}</span></button>` : ''}
      ${p.welcome && !p.welcome.expired && (!p.welcome.done || p.welcome.claimed) ? `<button class="tile welcometile ${p.welcome.ready ? 'todo' : ''}" data-act="welcome"><span class="eyebrow">Bienvenue · ${p.welcome.left} j</span><b class="num">${p.welcome.got}/${p.welcome.steps}</b>
        <span class="tile-foot">${p.welcome.ready ? 'Cadeau à récupérer' : p.welcome.done ? 'Terminée ✓' : 'Revenez demain'}</span></button>` : ''}
      ${story.tile(a)}${boss.tile(a)}${clan.tile(a)}
      <button class="tile" data-act="profile" data-tab="succes"><span class="eyebrow">Progression${p.title ? ` · ${esc(titleLabel(p.title))}` : ''}</span><b class="num">Niv. ${p.level}</b>
        <span class="tile-foot num">${p.xp}/${p.xpNext} XP · Succès</span></button>
    </div>
    ${p.ranked ? '<button class="learnline" data-act="learn">Apprendre à jouer : tutoriel et codex des mots-clés</button>' : ''}
  </div>`;
}
// ---- Événements temporaires ----
// Week-end double XP, semaine double points de classé… : réglés depuis /admin, appliqués par le serveur (events.js du moteur).
function eventCard(ev, text) {
  return `<div class="card-box evcard ev-${esc(ev.effect)}"><span class="evmult num">${multLabel(ev.mult)}</span>
    <div><span class="eyebrow">Événement · ${evRemaining(ev)}</span><b>${esc(ev.name)}</b><small>${text}</small></div></div>`;
}
// Médailles « ×2 XP », « ×2 PC » en haut à gauche de la vitrine de l'accueil (rubans, bord dentelé, centre bombé) ;
// chacune ouvre la feuille de son événement. Les couleurs viennent de la classe de l'effet (style.css : --m-hi, --m-mid, --m-lo, --m-rib).
const MEDAL = `<svg class="medal-svg" viewBox="0 0 60 76" aria-hidden="true">
  <path class="rib" d="M14 0h12l8 30-9 4z"/><path class="rib alt" d="M46 0H34l-8 30 9 4z"/>
  <polygon class="rim" points="30.0,23.0 34.4,25.9 39.6,24.9 42.5,29.3 47.7,30.3 48.7,35.5 53.1,38.4 52.1,43.6 55.0,48.0 52.1,52.4 53.1,57.6 48.7,60.5 47.7,65.7 42.5,66.7 39.6,71.1 34.4,70.1 30.0,73.0 25.6,70.1 20.4,71.1 17.5,66.7 12.3,65.7 11.3,60.5 6.9,57.6 7.9,52.4 5.0,48.0 7.9,43.6 6.9,38.4 11.3,35.5 12.3,30.3 17.5,29.3 20.4,24.9 25.6,25.9"/>
  <circle class="face" cx="30" cy="48" r="19"/><circle class="ring" cx="30" cy="48" r="16.5"/>
  <ellipse class="shine" cx="23" cy="40" rx="8" ry="4.5" transform="rotate(-30 23 40)"/></svg>`;
const eventChips = evs => (evs.length ? `<div class="sc-events">${evs.map(ev => `<button class="medal ev-${esc(ev.effect)}" data-act="event" data-ev="${esc(ev.id)}"
  aria-label="Événement ${esc(ev.name)} : ${multLabel(ev.mult)} ${esc(EVENT_EFFECTS[ev.effect]?.chip || '')}">${MEDAL}<span class="medal-txt${(EVENT_EFFECTS[ev.effect]?.chip || '').length > 6 ? ' long' : ''}"><b>${multLabel(ev.mult)}</b><small>${esc(EVENT_EFFECTS[ev.effect]?.chip || '')}</small></span></button>`).join('')}</div>` : '');
// Temps qui reste avant la fin (minuit, heure de Paris) : en jours, puis en heures le dernier jour.
function evRemaining(ev) {
  if (ev.daysLeft > 1) return `encore ${ev.daysLeft} jours`;
  const h = Math.max(0, Math.ceil((Date.parse(ev.ends) - Date.now()) / 3600000));
  return h > 1 ? `encore ${h} heures` : 'dernière heure';
}
function eventSheet(ev) {
  const what = EVENT_EFFECTS[ev.effect];
  return `<div class="sheet" data-act="close"><div class="panel" data-stop="1" role="dialog" aria-label="${esc(ev.name)}">
    <div class="ph"><h2>${esc(ev.name)}</h2><button class="btn" data-act="close">Fermer</button></div>
    <div class="evcard ev-${esc(ev.effect)}"><span class="evmult num">${multLabel(ev.mult)}</span>
      <div><span class="eyebrow">Événement · ${evRemaining(ev)}</span><b>${multLabel(ev.mult)} sur les ${esc(what?.what || '')}</b>
      <small>${esc(ev.period[0].toUpperCase() + ev.period.slice(1))}, jusqu'à minuit (heure de Paris).</small></div></div>
    ${ev.effect === 'ranked' ? `<p class="hint" style="margin:0">Chaque victoire classée rapporte ${multLabel(ev.mult)} étoiles, bonus de série compris. Une défaite n'en retire toujours qu'une.</p>
      <div class="row"><button class="btn primary" data-act="ranked">Jouer en classé</button></div>` : ''}
  </div></div>`;
}
// Monnaies du joueur, en haut de l'accueil : chacune ouvre le rayon de la boutique où elle se dépense.
function walletHTML() {
  const a = ui.account;
  return `<button class="chip num cur" data-act="shop" aria-label="${a.shards} Éclats, ouvrir la boutique" title="Éclats">${ico('shard')}${a.shards}</button>
    <button class="chip num cur prism" data-act="shop-arts" aria-label="${a.prisms} Prismes, ouvrir les arts de la boutique" title="Prismes">${ico('prism')}${a.prisms}</button>`;
}
// Barre du bas, sur l'accueil et les écrans du menu : on passe de l'un à l'autre sans revenir à l'accueil.
const HOME_PATH = 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z';
const tabIcon = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
// Écrans qui ont la barre du bas, et l'onglet allumé sur chacun (aucun pour les sous-écrans de l'accueil).
const TABBED = { home: 'home', collection: 'collection', decks: 'decks', shop: 'shop', friends: 'friends', profile: '', ranked: '', pass: '', mail: '', clan: 'friends', boss: '', story: '' };
function tabbar(cur) {
  const upgradable = OWNABLE.filter(canUpgrade).length, asks = friends.pending();
  const nav = (act, label, badge, extra = '') => `<button data-act="${act}" ${cur === act ? 'class="on" aria-current="page"' : ''} ${extra}>${label}${badge ? `<span class="badge num">${badge}</span>` : ''}</button>`;
  const tab = (act, icon, label, badge) => nav(act, `${tabIcon(icon)}<span>${label}</span>`, badge);
  // L'onglet allumé glisse depuis celui de l'écran précédent (habillage.css, .tabbar.slid).
  const at = TABS.indexOf(cur), was = ui.screen !== ui.shownScreen ? TABS.indexOf(TABBED[ui.shownScreen]) : -1;
  const slid = at >= 0 && was >= 0 && at !== was ? ` slid" style="--tab:${at};--from:${was}` : '';
  return `<nav class="tabbar${slid}" aria-label="Menu">${tab('home', HOME_PATH, 'Accueil')}${tab('collection', 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 8l2 3-2 3-2-3z', 'Collection', upgradable)}${tab('decks', 'M8 2h11a1 1 0 0 1 1 1v15M5 5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'Decks')}${tab('shop', 'M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM9 8V6a3 3 0 0 1 6 0v2', 'Boutique')}${tab('friends', 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2.4.6 4 2.8 4 6', 'Social', asks)}</nav>`;
}
// Cartes de récompense : on dit comment les obtenir.
function lockLabel(id) {
  // Carte de quête : réservée à sa quête, tant qu'elle n'est pas arrivée dans le booster du Set de base (quête passée dans l'histoire principale).
  const sq = questOfCard(id); if (sq && !SETS.some(x => x.cards.includes(id))) return `Récompense : quête ${sq.name}`;
  const ss = seasonOfCard(id);
  if (ss && !SETS.some(x => x.cards.includes(id))) return `Récompense : passe de saison ${ss.name}`;
  const src = rewardSourceOf(id);
  if (!src) return 'Pas encore obtenue';
  const set = SETS.find(x => x.id === src.set)?.name || src.set;
  return src.kind === 'family' ? `Récompense : famille ${src.fam} complète (${set})` : `Récompense : set ${set} complet`;
}
function renderCollection() {
  const a = ui.account, fams = [...shownFamilies(), 'Neutre'];
  const shown = OWNABLE.filter(id => !hiddenCard(id) && (!ui.colFam || (famOfCard(id) || 'Neutre') === ui.colFam)).sort(byFamCost);
  const tile = id => { const n = owned(id), lvl = myLevel(id), up = canUpgrade(id);
    return `<button class="ccard ${n ? '' : 'locked'} ${n && (lvl > 1 || up) ? 'tagged' : ''}" data-zoom="${zoomKey(id)}" aria-label="${esc(nameOf(id))}${n ? `, niveau ${lvl}${up ? ', peut monter de niveau' : ''}` : ', pas encore obtenue'}">
      ${anyCard(id, n ? lvl : 1, n ? mySel(id) : null, n ? myBorder(id) : 1)}${n > 1 ? `<span class="count num">×${n}</span>` : ''}${n ? '' : `<span class="lock">${esc(lockLabel(id))}</span>`}
      ${n && (lvl > 1 || up) ? `<span class="lvtag num ${up ? 'up' : ''}">${lvl > 1 ? `Niv. ${lvl}` : ''}${up ? `${lvl > 1 ? ' · ' : ''}↑ Améliorer` : ''}</span>` : ''}</button>`; };
  return `<div class="top"><span class="title">Ma collection</span><button class="btn" data-act="edit">Modifier le deck</button></div>
  <p class="hint" style="margin:0">${OWNABLE.filter(owned).length} cartes sur ${OWNABLE.filter(id => !hiddenCard(id)).length}, généraux compris. Touchez une carte pour la voir en grand et la faire monter de niveau avec l'essence de ses doublons.</p>
  <div class="seg famseg" role="group" aria-label="Famille"><button data-fam="" class="${ui.colFam ? '' : 'on'}">Toutes</button>${fams.map(f => `<button data-fam="${f}" class="${ui.colFam === f ? 'on' : ''}">${f}</button>`).join('')}</div>
  <div class="gallery vignettes">${shown.map(tile).join('')}</div>
  <div class="gal-h">Vos terrains</div><p class="hint" style="margin:0">Les terrains neutres, et ceux des familles dont vous possédez un général.</p>
  <div class="gallery">${allowedTerrains(a).map(terrainCard).join('')}</div>`;
}
// Boutique : un espace par set ; les sets à venir y ont déjà leur place.
// Deux onglets : les sets (cartes et boosters, en Éclats) et les arts alternatifs (en Prismes).
// Cadenas d'un rayon fermé.
const LOCK = '<svg class="lockico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
function renderShop() {
  const sh = ui.shop, a = ui.account, tab = ['arts', 'essence', 'change'].includes(ui.shopTab) && sh?.arts ? ui.shopTab : ui.shopTab === 'clan' && a.clan ? 'clan' : ui.shopTab === 'boss' ? 'boss' : ui.shopTab === 'emotes' ? 'emotes' : 'sets';
  const tabBtn = (id, label, badge) => `<button role="tab" data-act="shop-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}" aria-selected="${tab === id}">${label}${badge ? `<span class="badge num">${badge}</span>` : ''}</button>`;
  // Rayon du clan : verrouillé (cadenas) tant que le joueur n'a pas de clan ; le toucher mène alors à l'écran des clans.
  const clanTab = a.clan ? tabBtn('clan', `${ico('ecu')}Clan`) : `<button role="tab" class="locked" data-act="clan" aria-disabled="true" title="Rejoignez un clan pour l'ouvrir">${LOCK}Clan</button>`;
  const top = `<div class="top"><span class="title">Boutique</span><span class="chip num cur" title="Éclats" aria-label="${a.shards} Éclats">${ico('shard')}${a.shards}</span>${sh?.arts ? `<span class="chip num cur prism" title="Prismes" aria-label="${sh.arts.prisms} Prismes">${ico('prism')}${sh.arts.prisms}</span>` : ''}${tab === 'essence' && sh?.essence ? `<span class="chip num cur uni" title="Essence universelle" aria-label="${sh.essence.universal} essence universelle">${ico('essence')}${fmt(sh.essence.universal)}</span>` : ''}</div>
    ${sh?.arts ? `<div class="seg shoptabs" role="tablist" aria-label="Rayons de la boutique">${tabBtn('sets', 'Sets')}${tabBtn('arts', 'Arts', sh.arts.chest.free)}${sh.essence ? tabBtn('essence', 'Essence') : ''}${tabBtn('change', 'Change')}${tabBtn('emotes', 'Émotes')}${clanTab}${tabBtn('boss', `${ico('insigne')}Boss`)}</div>` : ''}`;
  if (tab === 'clan') return `${top}${clan.shopTab()}`;
  if (tab === 'boss') return `${top}${boss.shopTab()}`;
  if (tab === 'emotes') return `${top}${errLine()}${emoteShopHTML()}`;
  if (!sh) return `${top}${errLine()}<p class="wait">Chargement…</p>`;
  if (tab === 'arts') return `${top}${artStall(sh.arts)}${errLine()}${artShopHTML(sh.arts)}`;
  if (tab === 'change') return `${top}${errLine()}${exchangeHTML(sh.arts)}`;
  if (tab === 'essence') return `${top}${errLine()}${essenceShopHTML(sh.essence)}`;
  const P = sh.prices;
  // Étal : un booster par set ouvert, le plus récent en premier (ordre du serveur) ; le toucher l'achète, ou ouvre un booster offert s'il en reste.
  // Chaque set a son prix de booster (une nouveauté coûte un peu plus) ; « Nouveau » sur le paquet du set le plus récent quand il y en a plusieurs.
  const open = sh.sets.filter(x => x.open);
  const stall = stallHTML(open.map((set, i) => { const price = set.boosterPrice ?? P.boosterPrice, fresh = i === 0 && open.length > 1;
    return sh.freeBoosters
      ? { kind: 'pack', act: 'free-booster', set: set.id, setName: esc(set.name), n: P.boosterSize, free: sh.freeBoosters, fresh, tag: 'Ouvrir', off: ui.busy, label: `Ouvrir un booster ${esc(set.name)} offert` }
      : { kind: 'pack', act: 'buy-booster', set: set.id, setName: esc(set.name), n: P.boosterSize, fresh, tag: `${ico('shard')}${price}`, off: !canPay(price) || ui.busy, label: `Acheter un booster ${esc(set.name)} pour ${price} Éclats` }; }),
    { info: 'booster-info', infoLabel: 'Ce que contiennent les boosters' });
  // Sélection du jour en vitrine (shop.js) : illustration, coût, « Nouvelle » si le joueur ne l'a pas, prix ou « Vendue ».
  const offers = set => vitrineHTML({ title: 'Sélection du jour', sub: 'Cartes à l\'unité', slots: set.offers.map(o => {
    const d = CARDS[o.id], gen = GENERALS[o.id], name = esc(nameOf(o.id));
    return { art: artHTML(o.id, nameOf(o.id)), zoom: zoomKey(o.id), name, caption: false, sub: gen ? `Général · ${esc(gen.kind)}` : `${typeName(d)} · ${kwLine(d)}`, cost: gen ? null : d.x ? 'X' : d.cost,
      style: `${famVar(gen ? [gen.fam] : d.kw)};--glow:var(--fam)`, badge: o.owned || o.bought ? '' : 'Nouvelle',
      state: o.bought ? 'sold' : o.owned ? 'owned' : 'sale', act: 'buy-card', id: o.id, set: set.id, off: !canPay(P.cardPrice) || ui.busy,
      price: `${ico('shard')}${P.cardPrice}`, label: `Acheter ${name} pour ${P.cardPrice} Éclats` }; }) });
  const section = (set, i) => { const price = set.boosterPrice ?? P.boosterPrice, fresh = set.open && i === 0 && open.length > 1;
    return set.open ? `<section class="card-box shopset${fresh ? ' fresh' : ''} pk-${set.id}">
      <div><span class="eyebrow">${fresh ? '<span class="newset">Nouveau set</span> · ' : ''}${set.size} cartes</span><h2 style="font-size:22px">${esc(set.name)}</h2></div>
      ${offers(set)}
      <p class="hint" style="margin:0">${set.offers.length > 1 ? `${set.offers.length} cartes choisies` : 'Une carte choisie'} pour vous, en priorité parmi celles qui vous manquent, renouvelées chaque jour à minuit.</p>
      <div class="row boosterrow"><span class="gal-h">Booster du set</span>
        <button class="stall-info infobtn" data-act="booster-info" aria-haspopup="dialog" aria-label="Ce que contient un booster ${esc(set.name)}">i</button>
        <button class="btn primary" data-act="buy-booster" data-set="${set.id}" ${!canPay(price) || ui.busy ? 'disabled' : ''}>Acheter · ${price} Éclats</button>
        ${sh.freeBoosters ? `<button class="btn primary" data-act="free-booster" data-set="${set.id}" ${ui.busy ? 'disabled' : ''}>Ouvrir un booster offert (${sh.freeBoosters})</button>` : ''}</div>
    </section>` : `<section class="card-box shopset soon"><div><span class="eyebrow">Bientôt disponible</span><h2 style="font-size:22px">${esc(set.name)}</h2></div>
      <p class="hint" style="margin:0">${esc(set.teaser)}</p></section>`; };
  return `${top}${stall}${errLine()}${dupsHTML(sh)}${sh.sets.map(section).join('')}${mail.codeForm()}`;
}
// Doublons du jour : des cartes possédées qui peuvent encore monter, en vitrine ; chacun donne l'essence d'un doublon.
function dupsHTML(sh) {
  if (!sh.dups?.length) return '';
  const price = sh.prices.dupPrice, rate = lvInfo().essenceRate;
  const vit = vitrineHTML({ title: 'Doublons du jour', sub: 'Pour monter vos cartes', cls: 'dupvit', slots: sh.dups.map(o => {
    const d = CARDS[o.id], gen = GENERALS[o.id], name = esc(nameOf(o.id)), lvl = myLevel(o.id), c = nextCost(o.id);
    return { art: artHTML(o.id, nameOf(o.id), lvl, '', mySel(o.id)), zoom: zoomKey(o.id, mySel(o.id) || ''), name, caption: false,
      sub: c ? `Niv. ${lvl} · <span class="num">${essenceOf(o.id)}/${c.essence}</span> essence` : 'Niveau maximum', cost: gen ? null : d.x ? 'X' : d.cost,
      style: `${famVar(gen ? [gen.fam] : d.kw)};--glow:var(--fam)`, badge: `+${rate} essence`,
      state: o.bought ? 'sold' : o.capped ? 'owned' : 'sale', done: o.capped && !o.bought ? 'Essence au complet' : '', act: 'buy-dup', id: o.id, off: !canPay(price) || ui.busy,
      price: `${ico('shard')}${price}`, label: `Acheter un doublon de ${name} pour ${price} Éclats` }; }) });
  return `<section class="card-box shopset dupbox">
    ${vit}
    ${ui.msg && !ui.sheet && ui.shopTab !== 'essence' ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    <p class="hint" style="margin:0">Des cartes de votre collection à qui il manque encore de l'essence, celles de vos decks d'abord. Un doublon acheté donne ${rate} essence de la carte ; renouvelés chaque jour à minuit.</p>
  </section>`;
}
// Rayon Essence : l'essence universelle (doublons des cartes au niveau maximum) contre l'essence d'une autre carte ou un art de l'édition Essence.
function essenceShopHTML(E) {
  if (!E) return '';
  const per = uniPer(), have = E.universal;
  const vit = vitrineHTML({ title: 'Arts de l\'essence', sub: 'Édition Essence · famille Astrale', timer: false, cls: 'essvit', slots: E.arts.map(o => { const art = ARTS[o.id], name = esc(art.name);
    return { art: artHTML(art.card, nameOf(art.card), myLevel(art.card), '', art.id), zoom: zoomKey(art.card, art.id), name, cls: `rar-${rarityKey(art)}`, style: '--glow:var(--rar)',
      sub: esc(nameOf(art.card)), badge: esc(rarityName(art)), state: o.owned ? 'owned' : 'sale',
      act: 'buy-ess-art', id: o.id, off: have < o.price || ui.busy, price: `${ico('essence')}${o.price}`, label: `Acheter l'art ${name} pour ${o.price} essence universelle` }; }) });
  return `<section class="card-box shopset essbox">
    <div><span class="eyebrow">Rayon Essence</span><h2 style="font-size:22px">Essence universelle</h2></div>
    <div class="unibal">${ico('essence')}<b class="num">${fmt(have)}</b><span class="hint">essence universelle</span></div>
    <p class="hint" style="margin:0">Quand une carte a toute l'essence qu'il lui faut jusqu'au niveau ${MAX_CARD_LEVEL}, même sans être montée, chacun de ses doublons donne ${lvInfo().uniRate} essence universelle.
      Pour donner de l'essence à une autre carte (${per} pour 1), ouvrez-la en grand dans la collection. Ici, elle s'échange contre les arts de l'édition Essence, vendus seulement dans ce rayon.</p>
    ${ui.msg && !ui.sheet ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    ${vit}
    <p class="hint" style="margin:0">Toujours en vente ici, jamais au coffre ni dans les arts du jour. Réunissez-les tous pour compléter la famille d'arts Astrale et gagner son titre.</p>
  </section>`;
}
// Art de l'édition Essence acheté : montré en grand, prêt à être choisi pour sa carte (comme un art du jour).
async function buyEssenceArt(id) { await buyArt('/api/shop/essence-art', { art: id }); }
async function buyDup(id) {
  const r = await call('POST', '/api/shop/dup', { card: id });
  if (!r) return;
  ui.shop = r.shop;
  ui.msg = `+${r.essence} essence de ${nameOf(id)}${r.universal ? ` et ${r.universal} essence universelle` : ''}.${myLevel(id) < MAX_CARD_LEVEL && missingEssence(id) === 0 ? ' Elle peut monter de niveau dans la collection.' : ''}`;
  play('reveal'); render();
}
// Rayon Émotes : les émotes en vente (Éclats ou Prismes), puis celles des succès et celles offertes à tous.
function emoteShopHTML() {
  const a = ui.account, mine = prog().cosmetics.emotes || [];
  const bubble = id => `<span class="ebubble static">${emoteBody(id)}</span>`;
  const sale = id => { const e = EMOTES[id], own = mine.includes(id), price = e.prisms ? `${ico('prism')}${e.prisms}` : `${ico('shard')}${e.price}`;
    const off = ui.busy || (e.prisms ? (a.prisms || 0) < e.prisms : !canPay(e.price));
    return `<li class="emoitem ${own ? 'owned' : ''}">${bubble(id)}${own ? '<span class="chip ok">Possédée</span>'
      : `<button class="btn primary num" data-act="buy-emote" data-id="${id}" ${off ? 'disabled' : ''} aria-label="Acheter l'émote « ${esc(e.text)} » pour ${e.prisms ? `${e.prisms} Prismes` : `${e.price} Éclats`}">${price}</button>`}</li>`; };
  const won = ACHIEVEMENTS.filter(x => x.emote && EMOTES[x.emote]).map(x => `<li class="emoitem ${mine.includes(x.emote) ? 'owned' : ''}">${bubble(x.emote)}
    ${mine.includes(x.emote) ? '<span class="chip ok">Possédée</span>' : `<small class="hint">Succès : ${esc(x.label)}</small>`}</li>`).join('');
  return `<section class="card-box shopset emoshop">
    <div><span class="eyebrow">Cosmétique</span><h2 style="font-size:22px">Émotes</h2></div>
    <p class="hint" style="margin:0">Une icône et une phrase courte pour saluer, féliciter ou taquiner votre adversaire : en partie, touchez votre portrait pour en envoyer une. Chacun peut couper les émotes de l'autre en touchant son portrait.</p>
    ${ui.msg && !ui.sheet ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    <ul class="emolist">${SHOP_EMOTES.map(sale).join('')}</ul>
    <div class="gal-h">À gagner avec les succès</div>
    <ul class="emolist">${won}</ul>
    <div class="gal-h">Offertes à tous</div>
    <ul class="emolist free">${FREE_EMOTES.map(id => `<li>${bubble(id)}</li>`).join('')}</ul>
    <p class="hint" style="margin:0">Choisissez les ${EMOTE_SLOTS} émotes de votre sélecteur dans votre profil, rubrique Personnalisation.</p>
  </section>`;
}
async function buyEmote(id) {
  const r = await call('POST', '/api/shop/emote', { emote: id });
  if (!r) return;
  ui.msg = `Émote « ${EMOTES[id].text} » obtenue${prog().emotes?.includes(id) ? ', déjà dans votre sélecteur' : ' : ajoutez-la à votre sélecteur depuis votre profil'}.`;
  play('reveal'); render();
}
// Prix d'un booster d'un set (le serveur l'envoie avec chaque set de la boutique).
const boosterPriceOf = id => ui.shop?.sets.find(x => x.id === id)?.boosterPrice ?? ui.shop?.prices.boosterPrice;
// Prix en Éclats : payable tout de suite, ou après un change si le change est ouvert.
const canPay = price => (ui.account?.shards || 0) >= price || !!prismRate();
// Étal du rayon Arts : le coffre, ouvert gratuitement s'il en reste d'offerts. Son bouton « i » montre ses chances (chestInfo).
function artStall(A) {
  if (!A) return '';
  const C = A.chest, free = C.free && C.left;
  return stallHTML([free ? { kind: 'chest', act: 'chest-free', free: C.free, tag: 'Ouvrir', off: ui.busy, label: 'Ouvrir un coffre d\'arts offert' }
    : { kind: 'chest', act: 'chest', tag: C.left ? `${ico('prism')}${C.price}` : 'Vide', off: !C.left || A.prisms < C.price || ui.busy, label: C.left ? `Ouvrir un coffre d'arts pour ${C.price} Prismes` : 'Coffre vide pour vous' }],
    { title: 'Coffre d\'arts', info: 'chest-info' });
}
// Ce que contiennent les boosters, en fenêtre quand on touche le « i » de l'étal des sets (ou d'un set) : le texte tenait mal à côté du bouton d'achat.
function boosterInfo(sh) {
  if (!sh) return '';
  const P = sh.prices, open = sh.sets.filter(x => x.open);
  const sets = open.map(set => `<li><b>${esc(set.name)}</b><span class="hint num">${set.size} cartes · ${ico('shard')}${set.boosterPrice ?? P.boosterPrice}</span></li>`).join('');
  return `<div class="sheet" data-act="close"><div class="panel infobox" id="booster-info" role="dialog" aria-label="Boosters" data-stop="1">
    <div class="ph"><h2>Boosters</h2><button class="btn closex" data-act="close" aria-label="Fermer">×</button></div>
    <p style="margin:0">Un booster donne ${P.boosterSize} cartes au hasard parmi celles de son set, toutes avec la même chance, généraux compris.</p>
    <ul class="boosterlist">${sets}</ul>
    <p style="margin:0">Chaque doublon rapporte ${shardRate()} Éclats ${ico('shard')} et ${lvInfo().essenceRate} essence de la carte, pour la faire monter de niveau.</p>
    ${sh.freeBoosters ? `<p class="hint" style="margin:0">Vous avez ${sh.freeBoosters} booster${sh.freeBoosters > 1 ? 's' : ''} offert${sh.freeBoosters > 1 ? 's' : ''} : touchez un paquet pour l'ouvrir.</p>` : ''}</div></div>`;
}
// Ce que contient le coffre, en fenêtre quand on touche le « i » de l'étal : chances selon la rareté, coffres offerts en attente.
// Se ferme par la croix, Échap ou un clic à côté.
function chestInfo(A) {
  if (!A) return '';
  const C = A.chest, rates = C.rates.map(r => `<li><span class="rarchip rar-${r.rarity}">${esc(r.name)}</span><span class="num">${String(r.pct).replace('.', ',')} %</span></li>`).join('');
  return `<div class="sheet" data-act="close"><div class="panel infobox" id="chest-info" role="dialog" aria-label="Coffre d'arts" data-stop="1">
    <div class="ph"><h2>Coffre d'arts</h2><button class="btn closex" data-act="close" aria-label="Fermer">×</button></div>
    <p style="margin:0">Le coffre donne un art que vous n'avez pas encore, au hasard${rates ? ', avec ces chances selon la rareté :' : '.'}</p>
    ${rates ? `<ul class="rates">${rates}</ul>` : ''}
    <p class="hint" style="margin:0">${C.left ? `Encore ${C.left} art${C.left > 1 ? 's' : ''} possible${C.left > 1 ? 's' : ''} pour vous. ` : C.free ? `Vos ${C.free} coffre${C.free > 1 ? 's' : ''} offert${C.free > 1 ? 's' : ''} vous attendent : ils s'ouvriront dès que de nouveaux arts arriveront. ` : 'Vous avez tous les arts du coffre. '}Des coffres sont offerts par les succès rares, le calendrier du dimanche et le passe premium.</p></div></div>`;
}
// Arts alternatifs en boutique : offres du jour et coffre, payés en Prismes (monnaie rare : saisons classées, succès).
function artShopHTML(A) {
  if (!A) return '';
  const vit = vitrineHTML({ title: 'Arts du jour', sub: 'Arts à l\'unité', slots: A.offers.map(o => { const art = ARTS[o.id], name = esc(art.name);
    return { art: artHTML(art.card, nameOf(art.card), myLevel(art.card), '', art.id), zoom: zoomKey(art.card, art.id), name, cls: `rar-${rarityKey(art)}`, style: '--glow:var(--rar)',
      sub: `${esc(nameOf(art.card))}${art.theme ? ` · ${esc(themeOf(art))}` : ''}`, badge: esc(rarityName(art)), state: o.owned ? 'owned' : 'sale',
      act: 'buy-art', id: o.id, off: A.prisms < o.price || ui.busy, price: `${ico('prism')}${o.price}`, label: `Acheter l'art ${name} pour ${o.price} Prismes` }; }) });
  return `<section class="card-box shopset artshop">
    <div><span class="eyebrow">Cosmétique</span><h2 style="font-size:22px">Arts alternatifs</h2></div>
    <p class="hint" style="margin:0">D'autres illustrations pour vos cartes, à choisir ensuite dans la collection. Votre adversaire les voit quand vos cartes sont révélées.
      Ils se paient en Prismes, gagnés en fin de saison classée, avec les succès et le calendrier du mois.</p>
    ${A.offers.length ? `${vit}<p class="hint" style="margin:0">Choisis pour vous parmi les arts que vous n'avez pas, renouvelés chaque jour à minuit.${A.offers.some(o => !owned(ARTS[o.id].card)) ? ' Certains vont sur une carte que vous n\'avez pas encore.' : ''}</p>`
      : '<p class="hint" style="margin:0">Vous avez tous les arts en vente. Revenez quand de nouveaux arriveront.</p>'}
    <div class="gal-h">Familles d'arts</div>
    <p class="hint" style="margin:0">Des arts au même thème et au même style, sur des cartes de familles différentes. Réunissez une famille pour gagner son titre.</p>
    <ul class="artthemes">${THEME_IDS.map(t => { const all = themeArts(t), got = all.filter(x => ui.account?.arts?.[x.id]).length;
      return all.length ? `<li class="${got === all.length ? 'done' : ''}"><b>${esc(ART_THEMES[t].name)}</b><small class="hint">${all.map(x => esc(nameOf(x.card))).join(', ')}</small><span class="num">${got}/${all.length}</span></li>` : ''; }).join('')}</ul>
  </section>`;
}
// Rayon Change : des Éclats contre des Prismes, en offres fixes à prix fixe, présentées en vitrine (bonus pour les grosses offres).
// Le jour où des Prismes s'achèteront avec de l'argent, leurs offres prendront place dans ce rayon, sous celles-ci.
function exchangeHTML(A) {
  if (!A) return '';
  const rate = A.prismShards, offers = exchangeOffers(rate);
  const vit = vitrineHTML({ title: 'Prismes en Éclats', sub: 'Bureau de change', timer: false, cls: 'exchange', slots: offers.map((o, i) => ({
    art: shardPileSVG(i, `xp${i}`), name: `${fmt(o.shards)} Éclats`, sub: o.bonus ? `dont ${fmt(o.shards - o.prisms * rate)} en bonus` : 'Au taux de base',
    badge: o.bonus ? `+${o.bonus} %` : '', style: '--glow:#f0c454', state: 'sale', act: 'exchange', id: o.id, off: A.prisms < o.prisms || ui.busy,
    price: `${ico('prism')}${o.prisms}`, label: `Changer ${o.prisms} Prismes contre ${o.shards} Éclats` })) });
  return `<section class="card-box shopset exchangebox">
    <div><span class="eyebrow">Change</span><h2 style="font-size:22px">Échange de devises</h2></div>
    <p class="hint" style="margin:0">Vos Prismes ${ico('prism')} contre des Éclats ${ico('shard')}, en offres fixes : plus l'offre est grosse, plus le bonus l'est.
      Le change ne marche que dans ce sens. Quand un achat manque d'Éclats, l'offre qui suffit vous est proposée.</p>
    ${ui.msg && !ui.sheet ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    ${offers.length ? vit : '<p class="hint" style="margin:0">Le change est fermé pour le moment.</p>'}
  </section>`;
}

// Liste des decks du joueur : jouer, modifier, renommer, partager, remettre à zéro, supprimer, créer ou importer.
// Onglets de l'écran des decks : les decks du joueur, les recettes (decks préconstruits à reconstruire) et ceux préparés contre les boss mondiaux (boss.js).
const decksTabs = cur => `<div class="seg btabs" role="tablist" aria-label="Decks">${[['mine', 'Mes decks'], ['recettes', 'Recettes'], ['boss', 'Boss mondial']].map(([id, label]) =>
  `<button role="tab" data-act="decks-tab" data-tab="${id}" class="${cur === id ? 'on' : ''}" aria-selected="${cur === id}">${label}</button>`).join('')}</div>`;
function renderDecks() {
  const a = ui.account, full = a.decks.length >= maxDecks();
  if (ui.decksTab === 'recettes') return renderRecipes();
  if (ui.decksTab === 'boss') return `<div class="top"><span class="title">Decks contre les boss</span></div>${decksTabs('boss')}${boss.decksHTML()}`;
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
        ${d.general || d.cards.length || d.terrains.length ? `<button class="btn" data-act="deck-share" data-id="${d.id}">Partager</button>` : ''}
        <button class="btn" data-act="deck-reset" data-id="${d.id}" ${ui.busy ? 'disabled' : ''}>Remettre à 0</button>
        <button class="btn" data-act="deck-delete" data-id="${d.id}" ${a.decks.length <= 1 || ui.busy ? 'disabled' : ''}>Supprimer</button>
      </div></div>`;
  };
  return `<div class="top"><span class="title">Mes decks</span><span class="chip num">${a.decks.length}/${maxDecks()}</span></div>
  ${decksTabs('mine')}
  <p class="hint" style="margin:0">Jusqu'à ${maxDecks()} decks. Le deck joué sert en ligne et contre l'IA ; un deck incomplet est gardé mais ne peut pas être joué.</p>
  ${errLine()}
  ${a.decks.map(item).join('')}
  <div class="row"><button class="btn primary" data-act="deck-new" ${full ? 'disabled' : ''}>Nouveau deck</button>${full ? `<span class="hint">Supprimez un deck pour en créer un autre.</span>` : ''}</div>
  <form class="card-box deckimport" id="deck-import-form">
    <div><span class="eyebrow">Code de deck</span><h2 style="font-size:22px">Importer un deck</h2></div>
    <p class="hint" style="margin:0">Collez le code qu'un joueur vous a partagé (bouton Partager de ses decks). Le deck est repris avec les cartes de votre collection ; ce qui vous manque est indiqué.</p>
    <div class="field"><label class="eyebrow" for="deck-import">Code</label><input id="deck-import" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="DK1-…" value="${esc(ui.importCode || '')}"></div>
    ${ui.importErr ? `<p class="err" role="alert" style="margin:0">${esc(ui.importErr)}</p>` : ''}
    <div class="row"><button class="btn primary" type="submit" ${full ? 'disabled' : ''}>Importer</button>${full ? `<span class="hint">Supprimez un deck pour en importer un.</span>` : ''}</div>
  </form>`;
}
// Recettes : les decks préconstruits des sets sortis, avec ce que le joueur en possède. Les plus proches d'être complets d'abord.
function renderRecipes() {
  const a = ui.account, full = a.decks.length >= maxDecks();
  const list = recipeKeys().map(k => ({ k, d: DECKS[k], fit: fitDeck(DECKS[k], a) }))
    .map(x => ({ ...x, have: x.fit.deck.cards.length + x.fit.deck.terrains.length + (x.fit.deck.general ? 1 : 0) }))
    .sort((x, y) => y.have - x.have);
  const item = ({ k, d, fit, have }) => {
    const g = GENERALS[d.general], own = id => !!owned(id), tOk = t => fit.deck.terrains.includes(t);
    return `<div class="card-box deckitem recipe ${fit.complete ? 'ready' : ''}" style="${famVar([d.fam])}">
      <div><span class="eyebrow">${esc(d.fam)} · ${esc(setById(d.set || setOf(d.general))?.name || 'Set de base')}</span><h2 style="font-size:22px">${esc(d.name)}</h2></div>
      <p style="margin:0">${esc(g.name)} · <span class="num">${have}/${1 + DECK_TERRAINS + DECK_SIZE}</span> en votre possession${fit.complete ? ' · <b>complet</b>' : ''}</p>
      <div class="rbar" aria-hidden="true"><span style="width:${Math.round(100 * have / (1 + DECK_TERRAINS + DECK_SIZE))}%"></span></div>
      ${fit.complete ? '' : `<p class="hint" style="margin:0">${esc(missingLine(fit))}</p>`}
      <details class="rlist"><summary>Voir la recette</summary>
        <p class="hint" style="margin:0">Général : <span class="${own(d.general) ? '' : 'miss'}">${esc(g.name)}</span></p>
        <p class="hint" style="margin:0">Terrains : ${d.terrains.map(t => `<span class="${tOk(t) ? '' : 'miss'}">${esc(TERRAINS[t].name)}</span>`).join(', ')}</p>
        <ul>${d.cards.slice().sort(byFamCost).map(id => `<li class="${own(id) ? '' : 'miss'}"><span class="seal">${CARDS[id].x ? 'X' : CARDS[id].cost}</span>${esc(nameOf(id))}${own(id) ? '' : ' <small>à obtenir</small>'}</li>`).join('')}</ul>
      </details>
      <div class="row">
        <button class="btn ${fit.complete ? 'primary' : ''}" data-act="recipe-use" data-id="${k}" ${full ? 'disabled' : ''}>Construire ce deck</button>
        <button class="btn" data-act="recipe-share" data-id="${k}">Partager</button>
      </div></div>`;
  };
  return `<div class="top"><span class="title">Recettes</span><span class="chip num">${a.decks.length}/${maxDecks()}</span></div>
  ${decksTabs('recettes')}
  <p class="hint" style="margin:0">Les decks préconstruits du jeu, ceux que joue l'IA. Construisez-en un : il est repris avec les cartes de votre collection, et vous complétez ce qui manque.${full ? ` Vous avez déjà ${maxDecks()} decks : supprimez-en un pour en construire un autre.` : ''}</p>
  ${errLine()}
  ${list.map(item).join('')}`;
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
    help = `Choisissez ${DECK_SIZE} cartes différentes de votre collection.${e.boss ? ' Les cartes marquées +N sont renforcées contre ce boss.' : ''}`;
    const row = (id, on) => { const d = CARDS[id];
      return `<button class="pickrow ${on ? 'on' : ''}" data-pick="${id}" style="${famVar(d.kw)}" aria-pressed="${on}">
        <span class="seal">${d.x ? 'X' : d.cost}</span><span class="pn"><b>${esc(d.name)}</b><small>${kwLine(d)} · ${d.text ? rich(d.text) : 'Pas d\'effet.'}</small></span>
        ${d.type === 'C' ? `<span class="p num">${d.power}</span>` : '<span class="p sm">Sort</span>'}${e.boss && bossBoost(e.boss, id) ? `<span class="bboost-tag num" title="Renforcée contre ce boss">+${bossBoost(e.boss, id)}</span>` : ''}</button>`; };
    body = `<div class="picklist">${COLLECTIBLE.filter(owned).sort(byFamCost).map(id => row(id, e.cards.includes(id))).join('')}</div>`;
  }
  const next = step < 2 && stepOpen(e, step + 1);
  return `<div class="top"><span class="title">${e.boss ? `Contre ${esc(GENERALS[e.boss].name.split(/,\s*/)[0])}` : e.id ? 'Modifier le deck' : 'Nouveau deck'}</span><button class="btn" data-act="deck-cancel">Annuler</button>
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
// Personnalisation : thème de l'interface, titre, cadre de profil et dos de carte débloqués.
function themePicks(p) {
  const own = id => p.cosmetics.themes?.some(t => t.id === id), cur = currentSeason(today());
  const pick = (val, label, swatch, on, ok = true, hint = '') => `<button class="pickc ${on ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-theme="${val}"` : 'disabled'} title="${esc(hint)}">
    <span class="theme-swatch theme-${swatch}"></span><small>${esc(label)}</small></button>`;
  const themes = Object.entries(SEASON_THEMES).filter(([id]) => own(id) || !futureSeasons().some(x => x.theme === id));
  return `<div class="gal-h">Thème de l'interface</div>
    <p class="hint" style="margin:0">Chaque passe de saison débloque son thème au palier 12 de la piste gratuite. Changez-en quand vous voulez.</p>
    <div class="picks">${pick('', `Saison en cours${cur ? ` (${cur.name})` : ''}`, cur?.theme || 'base', !p.theme)}${pick('base', 'Classique', 'base', p.theme === 'base')}
      ${themes.map(([id, name]) => pick(id, name, id, p.theme === id, own(id), own(id) ? '' : 'À débloquer avec le passe de cette saison')).join('')}</div>`;
}
function customizeHTML() {
  const a = ui.account, p = prog(), c = p.cosmetics;
  return `<div class="card-box"><div><span class="eyebrow">Personnalisation</span><h2 style="font-size:22px">Thème, titre, cadre, dos de carte et émotes</h2></div>
    ${themePicks(p)}
    <div class="field"><label class="eyebrow" for="title-pick">Titre affiché sous votre pseudo</label>
      <select id="title-pick" ${c.titles.length ? '' : 'disabled'}><option value="">Aucun titre</option>${c.titles.map(t => `<option value="${esc(t.id)}" ${p.title === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
      ${c.titles.length ? '' : '<small class="hint">Les succès et les familles complétées donnent des titres.</small>'}</div>
    <div class="gal-h">Cadre de profil</div>
    <div class="picks"><button class="pickc ${p.frame ? '' : 'on'}" data-frame="">${avatarHTML(a, '', null)}<small>Sans cadre</small></button>
      ${Object.entries(FRAMES).filter(([id]) => !futureCosmetic(id) || c.frames.some(f => f.id === id)).map(([id, label]) => { const ok = c.frames.some(f => f.id === id);
        return `<button class="pickc ${p.frame === id ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-frame="${id}"` : 'disabled'} title="${ok ? '' : 'À débloquer'}">${avatarHTML(a, '', id)}<small>${esc(label)}</small></button>`; }).join('')}</div>
    <div class="gal-h">Dos de carte</div><p class="hint" style="margin:0">Votre adversaire le voit sur vos cartes cachées.</p>
    <div class="picks">${Object.entries(BACKS).filter(([id]) => !futureCosmetic(id) || c.backs.some(b => b.id === id)).map(([id, label]) => { const ok = c.backs.some(b => b.id === id);
      return `<button class="pickc ${p.back === id ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-back="${id}"` : 'disabled'}><span class="mc back back-${id}"></span><small>${esc(label)}</small></button>`; }).join('')}</div>
    ${favArtsHTML()}
    ${emotesHTML()}
  </div>`;
}
// Émotes du sélecteur en partie : EMOTE_SLOTS au plus parmi celles possédées, dans l'ordre choisi (au moins une).
function emotesHTML() {
  const p = prog(), set = p.emotes || [], mine = p.cosmetics.emotes || [];
  return `<div class="gal-h">Émotes en partie · <span class="num">${set.length}/${EMOTE_SLOTS}</span></div>
    <p class="hint" style="margin:0">En partie, touchez votre portrait pour envoyer une émote. Touchez-en une ici pour l'ajouter à votre sélecteur ou l'en retirer.</p>
    <div class="emopick">${mine.map(id => { const i = set.indexOf(id), full = i < 0 && set.length >= EMOTE_SLOTS, last = i >= 0 && set.length === 1;
      return `<button class="emo ${i >= 0 ? 'on' : ''}" data-act="emote-slot" data-id="${id}" aria-pressed="${i >= 0}" ${ui.busy || full || last ? 'disabled' : ''}>
        ${emoteBody(id)}${i >= 0 ? `<span class="favn num" aria-label="Choix ${i + 1}">${i + 1}</span>` : ''}</button>`; }).join('')}</div>
    <label class="check"><input type="checkbox" id="emotes-off" ${store.get('emotes-off', false) ? 'checked' : ''}> Couper les émotes de mes adversaires à chaque partie</label>
    <div class="row"><button class="btn" data-act="shop-emotes">D'autres émotes en boutique</button></div>`;
}
function toggleEmoteSlot(id) {
  const set = (prog().emotes || []).slice(), i = set.indexOf(id);
  if (i >= 0) { if (set.length === 1) return; set.splice(i, 1); } else if (set.length < EMOTE_SLOTS) set.push(id); else return;
  equip({ emotes: set }, i >= 0 ? 'Émote retirée du sélecteur.' : 'Émote ajoutée au sélecteur.');
}
// Arts préférés : jusqu'à MAX_FAV_ARTS arts possédés, montrés dans cet ordre sur le profil public.
const favArts = () => prog().favArts || [];
function favArtsHTML() {
  const mine = Object.keys(ui.account.arts || {}).filter(artExists).map(id => ARTS[id]).sort((x, y) => byFamCost(x.card, y.card) || x.name.localeCompare(y.name)), fav = favArts();
  return `<div class="gal-h">Arts préférés · <span class="num">${fav.length}/${MAX_FAV_ARTS}</span></div>
    <p class="hint" style="margin:0">${mine.length ? `Choisissez jusqu'à ${MAX_FAV_ARTS} de vos arts alternatifs : les joueurs les voient sur votre profil. Touchez un art choisi pour le retirer.`
      : 'Vos arts alternatifs (boutique, coffres, récompenses) apparaîtront ici : choisissez-en jusqu\'à 3 à montrer sur votre profil.'}</p>
    ${mine.length ? `<div class="favpick">${mine.map(art => { const i = fav.indexOf(art.id), full = i < 0 && fav.length >= MAX_FAV_ARTS;
      return `<button class="favopt ${i >= 0 ? 'on' : ''}" data-act="fav-art" data-id="${art.id}" aria-pressed="${i >= 0}" ${ui.busy || full ? 'disabled' : ''}>
        ${artOnly(art.id)}${i >= 0 ? `<span class="favn num" aria-label="Choix ${i + 1}">${i + 1}</span>` : ''}<small>${esc(art.name)}</small></button>`; }).join('')}</div>` : ''}`;
}
function toggleFavArt(id) {
  const fav = favArts().slice(), i = fav.indexOf(id);
  if (i >= 0) fav.splice(i, 1); else if (fav.length < MAX_FAV_ARTS) fav.push(id); else return;
  equip({ favArts: fav }, i >= 0 ? 'Art retiré de vos préférés.' : 'Art ajouté à vos préférés.');
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
      <div class="row" style="justify-content:space-between;gap:8px"><span>${x.done ? '✓ ' : ''}${esc(x.label)}</span><small class="hint">${[x.shards ? `${x.shards} Éclats` : '', x.prisms ? `${x.prisms} Prisme${x.prisms > 1 ? 's' : ''}` : '', x.chests ? `${x.chests} coffre${x.chests > 1 ? 's' : ''} d'arts` : '', x.title ? `titre « ${esc(x.title)} »` : '', x.frame ? `${x.frameId ? `<span class="frame frame-${esc(x.frameId)} swatch"></span>` : ''}${esc(x.frame)}` : '', x.emote && EMOTES[x.emote] ? `émote ${EMOTES[x.emote].icon} « ${esc(EMOTES[x.emote].text)} »` : ''].filter(Boolean).join(' · ')}</small></div>
      ${x.done ? '' : `<div class="row" style="gap:8px"><div class="bar" style="flex:1"><span style="width:${pct(x.value, x.goal)}%"></span></div><small class="num">${x.value}/${x.goal}</small></div>`}</div>`).join('')}</div>`).join('')}</div>`;
}
// Profil en onglets : le haut (image, pseudo, niveau) reste, la rubrique change en dessous.
const PROFILE_TABS = [['profil', 'Profil'], ['collection', 'Collection'], ['perso', 'Personnalisation'], ['succes', 'Succès']];
function renderProfile() {
  const a = ui.account, st = ui.profile, p = prog();
  const sets = SETS.filter(s => s.cards.length && setRevealed(s)).map(s => { const n = s.cards.filter(owned).length, pct = Math.round(100 * n / s.cards.length);
    return `<div class="setline ${n === s.cards.length ? 'done' : ''}"><div class="row" style="justify-content:space-between"><b>${esc(s.name)}</b>
      <span class="num">${n === s.cards.length ? 'Complété · ' : ''}${n}/${s.cards.length}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(s.name)}"><span style="width:${pct}%"></span></div></div>`; }).join('');
  const complete = SETS.filter(s => s.cards.length && setRevealed(s) && s.cards.every(owned)).length;
  const RES = { wins: 'Victoire', losses: 'Défaite', draws: 'Match nul' };
  const stats = !st ? '<p class="wait">Chargement…</p>' : `
    ${winTiles(st)}
    <div class="gal-h">Cartes</div>${cardStatsHTML((st.cards || []).map(c => ({ ...c, level: myLevel(c.id), border: myBorder(c.id), art: mySel(c.id) })),
      st.generals[0] && { ...st.generals[0], level: myLevel(st.generals[0].id), border: myBorder(st.generals[0].id), art: mySel(st.generals[0].id) })}
    ${st.generals.length ? `<div class="gal-h">Par général</div><div class="statlist">${st.generals.map(g => `<div class="row"><span style="flex:1">${esc(g.name)}</span><span class="num hint">${g.games} partie${g.games > 1 ? 's' : ''}</span><b class="num">${g.rate} %</b></div>`).join('')}</div>` : ''}
    ${st.recent.length ? `<div class="gal-h">Dernières parties</div><div class="statlist">${st.recent.map(r => `<div class="row"><b class="res ${r.result}">${RES[r.result]}</b><span style="flex:1">contre ${esc(r.foe)} <small class="hint">· ${esc(r.deck || '')}</small></span><small class="hint num">${new Date(r.at).toLocaleDateString('fr-FR')}</small></div>`).join('')}</div>`
      : '<p class="hint" style="margin:0">Aucune partie jouée pour l\'instant.</p>'}`;
  const tab = PROFILE_TABS.some(([id]) => id === ui.profileTab) ? ui.profileTab : 'profil';
  const tabBtn = ([id, label]) => `<button role="tab" data-act="profile-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}" aria-selected="${tab === id}">${label}</button>`;
  const body = {
    profil: () => `<form class="card-box" id="name-form">
      <div class="field"><label class="eyebrow" for="profile-name">Pseudo</label><input id="profile-name" maxlength="20" value="${esc(ui.nameDraft)}"></div>
      <div class="row"><button class="btn primary" type="submit" ${ui.busy || !ui.nameDraft.trim() || ui.nameDraft.trim() === a.name ? 'disabled' : ''}>Enregistrer le pseudo</button></div>
    </form>
    <div class="card-box"><div><span class="eyebrow">Réglages</span><h2 style="font-size:22px">Langue, son et vibrations</h2></div>
      <div class="field"><span class="eyebrow">Langue · Language</span><div class="row">${langButtons(getLang())}</div></div>
      <label class="check"><input type="checkbox" id="sound-on" ${isMuted() ? '' : 'checked'}> Son activé</label>
      <div class="field"><label class="eyebrow" for="sfx-volume">Bruitages · <span id="sfx-pct" class="num">${Math.round(sfxVolume() * 100)} %</span></label>
        <input id="sfx-volume" type="range" min="0" max="100" step="5" value="${Math.round(sfxVolume() * 100)}" ${isMuted() ? 'disabled' : ''}></div>
      <div class="field"><label class="eyebrow" for="music-volume">Musique · <span id="music-pct" class="num">${Math.round(musicVolume() * 100)} %</span></label>
        <input id="music-volume" type="range" min="0" max="100" step="5" value="${Math.round(musicVolume() * 100)}" ${isMuted() ? 'disabled' : ''}></div>
      ${canVibrate() ? `<label class="check"><input type="checkbox" id="vibrations-on" ${vibrations() ? 'checked' : ''}> Vibrations en partie</label>`
        : '<p class="hint" style="margin:0">Les vibrations ne marchent que sur un téléphone Android : ni sur ordinateur, ni sur iPhone.</p>'}</div>
    ${notifs.html()}
    <div class="card-box"><div><span class="eyebrow">Statistiques</span><h2 style="font-size:22px">Victoires</h2></div>${stats}</div>`,
    collection: () => `<div class="card-box"><div><span class="eyebrow">Collection</span><h2 style="font-size:22px">${complete} set${complete > 1 ? 's' : ''} complété${complete > 1 ? 's' : ''}</h2></div>
      <p class="hint" style="margin:0">${OWNABLE.filter(owned).length} cartes sur ${OWNABLE.filter(id => !hiddenCard(id)).length}, généraux compris.</p>${sets}${ui.progressInfo ? familiesHTML() : '<p class="wait">Chargement…</p>'}
      <div class="row"><button class="btn" data-act="collection">Voir mes cartes</button></div></div>`,
    perso: customizeHTML,
    succes: () => (ui.progressInfo ? achievementsHTML() : '<p class="wait">Chargement…</p>'),
  }[tab]();
  return `<div class="top"><span class="title">Mon profil</span><button class="btn" data-act="logout">Se déconnecter</button><button class="btn" data-act="home">Retour</button></div>
  ${errLine()}${ui.msg ? `<p class="hint" role="status" style="margin:0">${esc(ui.msg)}</p>` : ''}
  <div class="card-box profile">
    ${avatarHTML(a, 'big')}
    <div style="display:grid;gap:8px">
      <span class="eyebrow">Identifiant : ${esc(a.login)}</span>
      <div><b style="font-size:20px">${esc(a.name)}</b>${p.title ? `<div class="ptitle">${esc(titleLabel(p.title))}</div>` : ''}</div>
      ${levelBar(p)}
      <div class="row"><label class="btn" for="avatar-file">${a.avatar ? 'Changer l\'image' : 'Ajouter une image'}</label>
        <input id="avatar-file" type="file" accept="image/*" hidden>
        ${a.avatar ? `<button class="btn" data-act="avatar-remove" ${ui.busy ? 'disabled' : ''}>Retirer l'image</button>` : ''}
        <button class="btn" data-act="player" data-login="${esc(a.login)}">Voir mon profil public</button></div>
    </div>
  </div>
  <div class="seg proftabs" role="tablist" aria-label="Rubriques du profil">${PROFILE_TABS.map(tabBtn).join('')}</div>
  ${body}`;
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
  const lost = ui.offline ? '<div class="link-lost" role="status">Connexion perdue, reconnexion en cours…</div>' : '';
  if (ui.friendFoe) return `
  <div class="top"><span class="title">Partie entre amis</span></div>${lost}
  <div class="card-box" style="text-align:center;justify-items:center">
    <span class="eyebrow">Contre ${esc(ui.friendFoe)}</span>
    <p class="wait">${esc(ui.friendFoe)} choisit son deck. La partie commence dès que son choix est fait.</p>
    <button class="btn" data-act="quit">Annuler</button>
  </div>`;
  const link = `${location.origin}${location.pathname}?code=${ui.room}`;
  return `
  <div class="top"><span class="title">Partie en attente</span></div>${lost}
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
function fullCard(id, lvl = 1, art = null, border = lvl, cls = '') { const d = CARDS[id];
  return `<div class="fc${lvCls(border)}" style="${famVar(d.kw)}">${artHTML(id, d.name, lvl, cls, art)}<div class="h"><b>${esc(d.name)}</b><span class="seal">${d.x ? 'X' : d.cost}</span></div>
    <span class="k">${typeName(d)} · ${kwLine(d)}</span><span class="x">${d.text ? rich(d.text) : 'Pas d\'effet.'}</span>${d.type === 'C' ? `<span class="p num">${d.power}</span>` : ''}</div>`; }
const genCard = (k, lvl = 1, art = null, border = lvl, cls = '') => { const g = GENERALS[k]; return `<div class="fc${lvCls(border)}" style="${famVar([g.fam])}">${artHTML(k, g.name, lvl, cls, art)}<b>${g.name}</b><span class="k">Général · ${g.kind}</span><span class="x">${rich(g.text)}</span></div>`; };
const terrainCard = k => { const t = TERRAINS[k]; return `<div class="fc" style="${famVar([t.fam])}">${terrainHTML(k, t.name)}<b>${t.name}</b><span class="k">Terrain</span><span class="x">${rich(t.text)}</span></div>`; };
// Carte affichée en grand, avec les actions possibles sur elle pendant la planification.
const artLine = art => (ARTS[art] ? ` · art ${esc(ARTS[art].name)} (${esc(rarityName(ARTS[art]))})` : '');
function zoomBtns(acts) { return acts.length ? `<div class="zacts">${acts.join('')}</div>` : ''; }
function zoomHTML() {
  const zm = ui.zoom, play = ui.view && canPlay();
  let body = '', style = '', lvl = 1, art = null, border = null;
  if (zm.kind === 'card') {
    const d = CARDS[zm.id];
    const inHand = ui.view && me().hand.find(c => c.uid === zm.uid);
    const pend = ui.view && ui.pending.find(p => p.uid === zm.uid);
    const onBoard = ui.view && !pend && cardsOf(ui.view).get(zm.uid);
    const cost = inHand ? (d.x ? 'X' : inHand.cost) : (d.x ? 'X' : d.cost);
    const pw = inHand ? inHand.power : onBoard && onBoard.revealed ? onBoard.power : d.power;
    const pcls = pw > d.power ? 'up' : pw < d.power ? 'down' : '';
    const seat = onBoard ? (onBoard.side === 'me' ? ui.view.seat : 1 - ui.view.seat) : null;
    lvl = seat !== null ? levelIn(seat, zm.id) : myLevel(zm.id); border = seat !== null ? borderIn(seat, zm.id) : myBorder(zm.id);
    art = zm.art || (seat !== null ? artIn(seat, zm.id) : mySel(zm.id));
    const acts = [];
    if (play && inHand && !pend) {
      const left = sealsLeft(), cant = d.x ? left <= 0 : inHand.cost > left;
      if (cant) acts.push(`<p class="hint">Pas assez de sceaux pour la jouer ce tour (il vous en reste ${left}).</p>`);
      else acts.push(`<span class="eyebrow">Jouer dans la zone</span><div class="row">${[0, 1, 2].map(z => `<button class="btn" data-act="zplay" data-zone="${z}" ${freeSlots(z) > 0 ? '' : 'disabled'}>${ZONE_NAMES[z]}</button>`).join('')}</div>`);
    }
    if (play && pend) acts.push(`<button class="btn" data-act="zback">Reprendre en main</button>`);
    if (play && onBoard && onBoard.side === 'me' && onBoard.mobile) {
      const now = planZone(zm.uid);
      acts.push(`<span class="eyebrow">Déplacer vers</span><div class="row">${[0, 1, 2].filter(z => z !== now).map(z => `<button class="btn" data-act="zmove" data-zone="${z}" ${freeSlots(z) > 0 ? '' : 'disabled'}>${ZONE_NAMES[z]}</button>`).join('')}</div>`);
      if (moveOf(zm.uid)) acts.push(`<button class="btn" data-act="zstay" ${freeSlots(onBoard.z) > 0 ? '' : 'disabled'}>Annuler le déplacement</button>`);
    }
    style = famVar(d.kw);
    body = `
      <div class="zh"><span class="seal" title="Coût">${cost}</span><h2>${esc(d.name)}</h2>${d.type === 'C' ? `<span class="zp num ${pcls}" title="Puissance">${pw}</span>` : ''}</div>
      <span class="k">${typeName(d)} · ${kwLine(d)}${d.type === 'C' && pw !== d.power ? ` · puissance de base ${d.power}` : ''}${lvl > 1 ? ` · niveau ${lvl}` : ''}${artLine(art)}</span>
      <p class="x">${d.text ? rich(d.text) : 'Pas d\'effet.'}</p>${zoomBtns(acts)}${ui.screen === 'collection' ? fxHTML(zm.id) + borderHTML(zm.id) + artsHTML(zm.id) + upgradeHTML(zm.id) : ''}`;
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
    const seat = ui.view && zm.side ? (zm.mine ? ui.view.seat : 1 - ui.view.seat) : null;
    lvl = seat !== null ? levelIn(seat, zm.id) : myLevel(zm.id); border = seat !== null ? borderIn(seat, zm.id) : myBorder(zm.id);
    art = zm.art || (seat !== null ? artIn(seat, zm.id) : mySel(zm.id));
    body = `<div class="zh"><h2>${g.name}</h2></div><span class="k">Général · ${genLine(g)}${g.activateCost ? ` · activation ${g.activateCost} sceau` : ''}${deck ? ` · deck ${esc(deck)}` : ''}${lvl > 1 ? ` · niveau ${lvl}` : ''}${artLine(art)}</span><p class="x">${rich(g.text)}</p>${zoomBtns(acts)}${ui.screen === 'collection' ? fxHTML(zm.id) + borderHTML(zm.id) + artsHTML(zm.id) + upgradeHTML(zm.id) : ''}`;
  } else {
    const t = TERRAINS[zm.id]; style = famVar([t.fam]);
    body = `<div class="zh"><h2>${t.name}</h2></div><span class="k">Terrain${t.fam ? ` · ${t.fam}` : ''}</span><p class="x">${rich(t.text)}</p>`;
  }
  const pic = zm.kind === 'terrain' ? terrainHTML(zm.id, TERRAINS[zm.id].name, 'zoomart') : artHTML(zm.id, nameOf(zm.id), lvl, 'zoomart', art);
  return `<div class="sheet zoom" data-act="close"><div class="zoomwrap" data-stop="1" style="${style}">${pic}<div class="panel zoomcard${lvCls(border ?? lvl)}" data-stop="1" style="${style}" role="dialog" aria-label="Détail de la carte">${body}
    <button class="btn" data-act="close">Fermer</button></div></div></div>`;
}
function openZoom(zoom) { ui.zoom = zoom; ui.sheet = 'zoom'; ui.zoomBack = null; ui.fx = { list: [['.zoomcard', 'zoom-in']] }; }
// Ferme le panneau ouvert ; une carte ouverte depuis le codex y ramène.
function closeSheet() {
  if (ui.sheet === 'need') { leaveNeed(); ui.error = ''; render(); return; }
  if (ui.sheet === 'inbox') closeInbox();
  if (ui.sheet === 'mail-got') mail.closeGot();
  ui.sheet = ui.sheet === 'zoom' && ui.zoomBack ? ui.zoomBack : null; ui.zoom = null; ui.zoomBack = null; ui.renaming = null; ui.gotArt = null; ui.calGot = null; ui.welGot = null; ui.msg = '';
  if (ui.sheet !== 'player') ui.player = null;
  render();
}
function sheetHTML() {
  if (ui.sheet === 'zoom' && ui.zoom) return zoomHTML();
  const st = story.sheet(); if (st) return st;
  if (ui.sheet === 'friend-deck') return friends.deckSheet();
  if (ui.sheet === 'player' && ui.player) return playerSheet();
  if (ui.sheet === 'log' && ui.view) {
    const names = ui.view.names;
    const lines = ui.view.log.map(l => `<div class="${l.kind}">${esc(renderLog(l, ui.view.seat, names))}</div>`).join('');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Journal</h2><button class="btn" data-act="close">Fermer</button></div>
      <div class="log" id="logbox">${lines || '<span class="hint">Rien pour l\'instant.</span>'}</div></div></div>`;
  }
  if (ui.sheet === 'set') {
    const ids = o => Object.keys(o);
    let h = '';
    for (const fam of [...shownFamilies(), null]) {
      const cards = ids(CARDS).filter(k => !CARDS[k].token && (CARDS[k].kw[0] || null) === fam && !hiddenCard(k));
      const tokens = fam === null ? ids(CARDS).filter(k => CARDS[k].token && !unrevealed(k)) : [];
      h += `<div class="gal-h">${fam || 'Neutres et jetons'}</div><div class="gallery">
        ${ids(GENERALS).filter(k => GENERALS[k].fam === fam && !GENERALS[k].boss && !hiddenCard(k)).map(k => genCard(k)).join('')}
        ${cards.map(k => fullCard(k)).join('')}${ids(TERRAINS).filter(k => TERRAINS[k].fam === fam && !unrevealed(k)).map(terrainCard).join('')}${tokens.map(k => fullCard(k)).join('')}</div>`;
    }
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Toutes les cartes</h2><div class="row"><button class="btn" data-act="codex">Mots-clés</button><button class="btn" data-act="close">Fermer</button></div></div>
      <p class="hint" style="margin:0">Un deck : ${DECK_SIZE} cartes différentes de votre collection, ${DECK_TERRAINS} terrains et un général de votre collection. Terrains : les neutres et ceux des familles de vos généraux.</p>${h}</div></div>`;
  }
  if (ui.sheet === 'codex') {
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Codex</h2><button class="btn" data-act="close">Fermer</button></div>
      <div class="field"><label class="eyebrow" for="codex-q">Chercher un mot-clé</label><input id="codex-q" type="search" autocomplete="off" value="${esc(ui.codexQuery)}" placeholder="Horde, Grâce, sceaux…"></div>
      <div id="codex-list">${codexHTML(ui.codexQuery)}</div></div></div>`;
  }
  if (ui.sheet === 'play-friend') {
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Jouer avec un ami</h2><button class="btn" data-act="close">Fermer</button></div>
      <div class="row"><button class="btn primary" data-act="create">Créer une partie</button><button class="btn" data-act="friends">Défier un ami${friends.pending() ? ` · ${friends.pending()}` : ''}</button></div>
      <div class="or">ou rejoindre avec un code</div>
      <div class="row"><div class="field" style="flex:1"><label class="eyebrow" for="code">Code de la partie</label>
        <input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(ui.joinCode)}" placeholder="ABCD"></div>
        <button class="btn" data-act="join" style="align-self:end">Rejoindre</button></div>${errLine()}</div></div>`;
  }
  if (ui.sheet === 'missions') {
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Missions du jour</h2><button class="btn" data-act="close">Fermer</button></div>
      ${levelBar(prog())}${missionsHTML()}</div></div>`;
  }
  if (ui.sheet === 'gift') {
    const g = ui.account.deck?.general;
    return `<div class="sheet"><div class="panel gift" role="dialog" aria-label="Cadeau de Séraphine">
      <div class="gift-head"><span class="coach-face" aria-hidden="true">${portraitHTML('seraphine')}</span><h2>Un cadeau pour bien commencer</h2></div>
      <p style="margin:0">Je vous offre un <strong>doublon</strong> de votre général${g ? `, ${esc(nameOf(g).split(',')[0])}` : ''}, et les Éclats pour l'améliorer. Les doublons font monter vos cartes de niveau : je vais vous montrer comment.</p>
      ${g ? `<div class="gift-card">${anyCard(g, myLevel(g), mySel(g), myBorder(g))}</div>` : ''}${errLine()}
      <div class="row"><button class="btn primary" data-act="gift-take" ${ui.busy ? 'disabled' : ''}>Recevoir et l'améliorer</button></div></div></div>`;
  }
  if (ui.sheet === 'learn') {
    const done = ui.account?.tuto || [];
    const lessons = Object.entries(LESSONS).map(([k, l], i) => `<button class="lesson ${done.includes(k) ? 'done' : ''}" data-act="tuto" data-lesson="${k}"><span class="lesson-n num">${done.includes(k) ? '✓' : i + 1}</span>
      <span class="lesson-t"><b>${esc(l.title)}</b><small>${esc(l.blurb)}</small></span>${done.includes(k) ? '' : `${ui.account?.tutoShards ? `<span class="lesson-r num">+${ui.account.tutoShards}${ico('shard')}</span>` : ''}`}</button>`).join('');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Apprendre</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">Séraphine vous guide pendant une partie contre l'IA, avec un deck prêt à jouer. Chaque leçon finie rapporte des Éclats la première fois, et un booster vous attend quand elles le sont toutes.</p>
      <div class="lessons">${lessons}</div>
      <div class="row"><button class="btn" data-act="codex">Codex des mots-clés</button><button class="btn" data-act="set">Toutes les cartes</button></div></div></div>`;
  }
  if (ui.sheet === 'chest-info' && ui.screen === 'shop') return chestInfo(ui.shop?.arts);
  if (ui.sheet === 'booster-info' && ui.screen === 'shop') return boosterInfo(ui.shop);
  if (ui.sheet === 'need' && ui.need) {
    // Il manque des Éclats : l'offre de change fixe qui suffit (ou la plus grosse), sans choix du montant.
    const { need, offer: o, verb } = ui.need, have = ui.account.prisms || 0, short = o.prisms - have, step = EXCHANGE_TIERS.findIndex(t => t.id === o.id);
    return `<div class="sheet" data-act="close"><div class="panel needpanel" data-stop="1"><div class="ph"><h2>Il vous manque ${fmt(need)} Éclats</h2><button class="btn" data-act="close">Fermer</button></div>
      <div class="needoffer">${shardPileSVG(step, 'np')}<div class="needmeta"><span class="eyebrow">Bureau de change</span>
        <b class="needgain num">+${fmt(o.shards)} ${ico('shard')}</b><span class="num">pour ${o.prisms} Prismes ${ico('prism')}</span>
        ${o.bonus ? `<span class="needbonus num">+${o.bonus} % de bonus</span>` : ''}</div></div>
      <p class="hint" style="margin:0">${short > 0 ? `Il vous manque ${short} Prisme${short > 1 ? 's' : ''} (vous en avez ${have}). Ils se gagnent en saison classée, avec les succès, le passe et le calendrier du mois.`
        : `Après l'achat, il vous restera ${fmt(o.shards - need)} Éclats et ${have - o.prisms} Prisme${have - o.prisms > 1 ? 's' : ''}. Le change ne s'annule pas.`}</p>
      ${errLine()}
      <div class="row"><button class="btn primary" data-act="exchange" data-id="${o.id}" ${short > 0 || ui.busy ? 'disabled' : ''}>${ico('prism')} ${o.prisms} · Changer et ${verb}</button>
        <button class="btn" data-act="shop-change">Toutes les offres</button></div></div></div>`;
  }
  if (ui.sheet === 'deck-code' && ui.shareDeck) {
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>Partager « ${esc(ui.shareDeck.name)} »</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">Envoyez ce code à un ami : il le colle dans « Importer un deck » de ses decks et retrouve ce deck avec les cartes qu'il possède.</p>
      <textarea id="deck-code" class="deckcode" readonly rows="${Math.min(10, Math.max(3, Math.ceil(ui.shareDeck.code.length / 40)))}" spellcheck="false">${esc(ui.shareDeck.code)}</textarea>
      <div class="row"><button class="btn primary" data-act="dcode-copy">Copier le code</button></div></div></div>`;
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
  if (ui.sheet === 'calendar' && prog().calendar) return calendarHTML(prog().calendar);
  if (ui.sheet === 'welcome' && prog().welcome) return welcomeHTML(prog().welcome);
  if (ui.sheet === 'event') { const ev = prog().events?.live.find(x => x.id === ui.evSel); if (ev) return eventSheet(ev); }
  if (ui.sheet === 'mail-got') return mail.gotSheet();
  if (ui.sheet === 'art' && ui.gotArt) {
    const art = ARTS[ui.gotArt.id], on = mySel(art.card) === art.id;
    return `<div class="sheet" data-act="close"><div class="panel gotart" data-stop="1"><div class="ph"><h2>${ui.gotArt.chest ? 'Coffre d\'arts' : 'Nouvel art'}</h2><button class="btn" data-act="close">Fermer</button></div>
      <div class="row" style="gap:8px">${rarChip(art)}<b>${esc(art.name)}</b><small class="hint">${esc(nameOf(art.card))}</small></div>
      <div class="bcard gotcard">${artHTML(art.card, nameOf(art.card), myLevel(art.card), 'grand', art.id)}</div>
      ${ui.msg ? `<p class="hint" role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
      <div class="row"><button class="btn ${on ? '' : 'primary'}" data-act="art-pick" data-card="${art.card}" data-art="${art.id}" ${on || ui.busy ? 'disabled' : ''}>${on ? 'Art utilisé ✓' : 'Utiliser cet art'}</button>
        <button class="btn" data-act="close">Plus tard</button></div>
      <p class="hint" style="margin:0">Vous pourrez changer d'art à tout moment depuis la carte, dans la collection.${owned(art.card) ? '' : ' Il s\'affichera dès que vous aurez la carte.'}</p></div></div>`;
  }
  if (ui.sheet === 'booster' && ui.booster) {
    const { title, cards, fresh, shards, xp } = ui.booster, n = fresh.filter(Boolean).length;
    const sum = [n ? `${n} nouvelle${n > 1 ? 's' : ''} carte${n > 1 ? 's' : ''} dans votre collection` : 'Aucune nouvelle carte', shards ? `${shards} Éclats${[ui.booster.essence ? `${ui.booster.essence} essence` : '', ui.booster.universal ? `${ui.booster.universal} essence universelle` : ''].filter(Boolean).map(x => ` et ${x}`).join('')} gagnés avec les doublons` : '', xp ? `${xp} XP` : ''].filter(Boolean).join(', ');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1"><div class="ph"><h2>${esc(title)}</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">${sum}.</p>
      <div class="gallery ${ui.booster.opened ? 'opened' : ''}">${cards.map((id, i) => `<div class="bcard ${fresh[i] ? '' : 'dup'}" style="animation-delay:${i * 120}ms">${fresh[i] ? '<span class="new">Nouvelle</span>' : `<span class="new shard">${dupTag(id)}</span>`}${anyCard(id, myLevel(id), mySel(id))}</div>`).join('')}</div></div></div>`;
  }
  if (ui.sheet === 'end' && ui.view?.result && ui.view.boss) return boss.endHTML(ui.view, ui.rematchAsked);
  if (ui.sheet === 'end' && ui.view?.result && ui.mode === 'story') return story.endHTML(ui.view);
  if (ui.sheet === 'end' && ui.view && ui.view.result) {
    const r = ui.view.result, s = ui.view.seat;
    const t = r.winner === s ? 'Victoire' : r.winner < 0 ? 'Match nul' : 'Défaite';
    const reason = renderLog(r.reason, s, ui.view.names);
    const zs = [0, 1, 2].map(z => `<div class="${['', 'me', 'foe'][zoneSide(ui.view, z)]}"><div class="eyebrow">${ZONE_NAMES[z]}</div><b>${ui.view.me.zonePower[z]}</b> contre ${ui.view.foe.zonePower[z]}</div>`).join('');
    if (ui.mode === 'tuto') return `<div class="sheet"><div class="panel end"><h2>${t}</h2><p style="margin:0">${esc(reason)}.</p><div class="zs">${zs}</div>
      <p style="margin:0">${esc(ui.ctrl?.endText || '')}</p>${ui.tutoReward ? `<div class="rewards">${rewardItem(ui.tutoReward)}</div>
      ${ui.tutoReward.boosters ? '<p class="hint" style="margin:0">Toutes les leçons sont finies : votre booster offert vous attend sur l\'accueil.</p>' : ''}` : ''}<div class="row">
      ${nextLesson() ? `<button class="btn primary" data-act="tuto" data-lesson="${nextLesson()}">Leçon suivante : ${esc(LESSONS[nextLesson()].title)}</button>` : ''}
      <button class="btn ${nextLesson() ? '' : 'primary'}" data-act="quit">${ui.account?.starter ? (nextLesson() ? 'Arrêter le tuto' : 'Retour à l\'accueil') : (nextLesson() ? 'Passer : choisir mon deck' : 'Choisir mon deck')}</button><button class="btn" data-act="again">Rejouer la leçon</button>
      ${ui.account?.starter ? '<button class="btn" data-act="codex">Ouvrir le codex</button>' : ''}</div></div></div>`;
    return `<div class="sheet"><div class="panel end"><h2>${t}</h2><p style="margin:0">${esc(reason)}.</p>
      <div class="zs">${zs}</div>${endRewardHTML()}<div class="row">
      <button class="btn primary" data-act="again" ${ui.rematchAsked ? 'disabled' : ''}>${ui.rematchAsked ? 'Revanche demandée…' : 'Revanche'}</button>
      <button class="btn" data-act="quit">Retour à l'accueil</button><button class="btn" data-act="log">Voir le journal</button></div></div></div>`;
  }
  return '';
}
const SEASON_OVERRIDE = (q => q === null ? null : q === 'base' ? '' : q)(new URLSearchParams(location.search).get('saison'));
// Dernier écran posé (render) : son HTML et ses nœuds, gardés tels quels tant que l'écran ne change pas.
const lastScreen = { body: null, nodes: [] };
function render() {
  const h = document.getElementById('hand'); const sx = h ? h.scrollLeft : 0;
  // Menu glissant des rayons de la boutique : sa position est gardée quand l'écran se redessine.
  const stx = app.querySelector('.shoptabs')?.scrollLeft || 0;
  // Défilement de la fenêtre ouverte, gardé quand elle se redessine (ex. : après une amélioration, en bas de la fiche).
  const sp = app.querySelector(':scope > .sheet .panel'); const sy = sp && ui.sheet === ui.shownSheet && ui.zoom?.id === ui.shownZoom ? sp.scrollTop : 0;
  const screens = { lang: renderLang, loading: renderLoading, login: renderLogin, starter: renderStarter, home: renderHome, collection: renderCollection, shop: renderShop, deck: renderDeck, decks: renderDecks, profile: renderProfile, ranked: renderRanked, pass: renderPass, lobby: renderLobby, game: renderGame, friends: friends.screen, mail: mail.screen, clan: clan.screen, boss: boss.screen, story: story.screen };
  // Récompenses gagnées (niveau, missions, succès, familles et sets complétés) : affichées en revenant à l'accueil.
  if (ui.screen === 'home' && !ui.sheet && prog().inbox.length) ui.sheet = 'inbox';
  // Cadeau de bienvenue du jour pas encore récupéré : la bienvenue s'ouvre une fois par visite, avant le calendrier.
  if (ui.screen === 'home' && !ui.sheet && prog().welcome?.ready && !ui.welShown) { ui.welShown = true; ui.welGot = null; ui.sheet = 'welcome'; }
  // Récompense du jour du calendrier pas encore récupérée : le calendrier s'ouvre une fois par visite.
  if (ui.screen === 'home' && !ui.sheet && prog().calendar?.ready && !ui.calShown) { ui.calShown = true; ui.calGot = null; ui.sheet = 'calendar'; }
  // Cadeau de Séraphine, une fois par compte : un doublon du général joué, à améliorer aussitôt (guide « Améliorer une carte »).
  if (ui.screen === 'home' && !ui.sheet && ui.account?.starter && ui.account.tutoGift === false && !ui.guide) ui.sheet = 'gift';
  firstLaunch();
  ui.coach = ui.screen === 'game' ? (ui.mode === 'tuto' && ui.ctrl ? ui.ctrl.coach(ui) : null) : guideCoach();
  const body = screens[ui.screen](), bar = ui.screen in TABBED ? tabbar(TABBED[ui.screen]) : '';
  app.classList.toggle('ingame', ui.screen === 'game');
  // Thème de l'interface (décors PixiJS, habillage.css) : ?saison=… dans l'adresse pour en essayer un (« base » : aucun), sinon celui
  // choisi dans la personnalisation, sinon celui de la saison en cours.
  document.body.dataset.season = SEASON_OVERRIDE ?? uiTheme();
  setInGame(app, ui.screen === 'game');
  setMusic(musicFor());
  // Transitions (transition.js, habillage.css) : seulement quand l'écran ou la feuille change, pas à chaque rafraîchissement.
  // Entre deux menus, l'ancien écran glisse d'un côté pendant que le nouveau arrive de l'autre ; une feuille fermée redescend.
  const moved = ui.screen !== ui.shownScreen, motion = !reduceMotion() && !veil.covering();
  const hop = moved && slides(ui.shownScreen) && slides(ui.screen), dir = hop && motion ? screenDir(ui.shownScreen, ui.screen) : 0;
  if (dir) ghostScreen(app, dir);
  if (motion && ui.shownSheet && !ui.sheet) ghostSheet(app.querySelector(':scope > .sheet'));
  const tail = bar + friends.banner() + sheetHTML() + (ui.coach && ui.sheet === 'zoom' ? coachHTML(ui.coach, true) : ui.coach && ui.screen !== 'game' && !ui.sheet ? coachHTML(ui.coach, 'bottom') : '');
  // Écran inchangé (on ouvre ou ferme une carte en grand, une fenêtre…) : il reste en place et seul ce qui est par-dessus est
  // redessiné, avec la barre du bas (son onglet ne glisse qu'au premier rendu d'un écran). Refaire toute la collection (plus de
  // 200 cartes et leurs images) à chaque toucher prenait près d'une seconde sur téléphone. La partie, elle, est toujours
  // redessinée en entier (ses effets partent d'éléments neufs).
  if (!moved && ui.screen !== 'game' && body === lastScreen.body && lastScreen.nodes.every(n => n.parentNode === app)) {
    const keep = new Set(lastScreen.nodes);
    for (const n of [...app.childNodes]) if (!keep.has(n)) n.remove();
    app.querySelectorAll('.coach-hl').forEach(el => el.classList.remove('coach-hl'));
  } else { app.innerHTML = body; lastScreen.body = body; lastScreen.nodes = [...app.childNodes]; }
  app.insertAdjacentHTML('beforeend', tail);
  if (hop) scrollTo({ top: 0, behavior: 'instant' });
  setHome(app); setShop(app); setEnd(app, endReel());
  app.style.setProperty('--dx', `${dir * 36}px`); app.style.setProperty('--dy', dir ? '0px' : '10px');
  app.classList.toggle('screen-in', moved);
  if (ui.sheet && ui.sheet !== ui.shownSheet) app.querySelector(':scope > .sheet')?.classList.add('sheet-in');
  ui.shownScreen = ui.screen; ui.shownSheet = ui.sheet; ui.shownZoom = ui.zoom?.id;
  if (ui.sheet === 'rename') { const r = document.getElementById('rename-input'); if (r && document.activeElement !== r) { r.focus(); r.select(); } }
  const h2 = document.getElementById('hand'); if (h2) h2.scrollLeft = sx;
  // Rayon qui change : son onglet est amené dans le menu glissant s'il était caché sur le côté.
  const st = app.querySelector('.shoptabs');
  if (st) {
    st.scrollLeft = stx;
    const on = st.querySelector('button.on');
    if (on && ui.shopTab !== ui.shownShopTab) { const l = on.offsetLeft - st.offsetLeft, r = l + on.offsetWidth; if (l < st.scrollLeft) st.scrollLeft = l; else if (r > st.scrollLeft + st.clientWidth) st.scrollLeft = r - st.clientWidth; }
    ui.shownShopTab = ui.shopTab;
    const edge = () => { st.classList.toggle('more-l', st.scrollLeft > 2); st.classList.toggle('more-r', st.scrollLeft + st.clientWidth < st.scrollWidth - 2); };
    edge(); st.onscroll = edge;
  }
  if (sy) { const p2 = app.querySelector(':scope > .sheet .panel'); if (p2) p2.scrollTop = sy; }
  const lb = document.getElementById('logbox'); if (lb) lb.parentElement.scrollTop = lb.scrollHeight;
  applyFx();
  // Tutoriel : l'élément à toucher est mis en valeur, et amené à l'écran quand l'étape change. Sur PixiJS, le reste de l'écran
  // s'assombrit et une main montre le geste (coachGuide, stage-coach.js) ; sinon, un contour qui clignote.
  const hl = ui.coach?.hl?.length ? [...app.querySelectorAll(ui.coach.hl.join(','))] : [];
  hl.forEach(el => el.classList.add('coach-hl'));
  const fresh = ui.coach && ui.coach.text !== ui.coachShown;
  if (fresh) { ui.coachShown = ui.coach.text; if (hl[0] && (!ui.sheet || ui.guide)) hl[0].scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' }); if (ui.coach.hl.length) play('coach'); }
  coachGuide(ui.coach && !ui.sheet ? ui.coach : null);
  veil.check();
}

// Thème choisi (null : celui de la saison en cours ; « base » : thème de base ; sinon un thème débloqué).
function uiTheme() {
  const p = ui.account ? prog() : null, pick = p?.theme;
  if (pick === 'base') return '';
  if (pick && p.cosmetics.themes?.some(t => t.id === pick)) return pick;
  return currentSeason(today())?.theme || '';
}
// Musique de l'écran : la partie ou les menus, dans la version du thème affiché si elle existe (music.js).
function musicFor() {
  const scene = ui.screen === 'game' ? 'partie' : 'menu', theme = document.body.dataset.season;
  return theme ? [`${scene}-${theme}`, scene] : [scene];
}

// ---- Animations et bruitages ----
const SPEAKER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/>';
const QUIT_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
const muteBtn = () => `<button class="btn icon" data-act="mute" aria-pressed="${isMuted()}" aria-label="${isMuted() ? 'Activer le son' : 'Couper le son'}" title="${isMuted() ? 'Activer le son' : 'Couper le son'}">${SPEAKER}${isMuted() ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'}</svg></button>`;
const cardSel = uid => `[data-card="${uid}"]`;
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
  if (cls === 'shatter') shards(r);
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(g); setTimeout(() => g.remove(), 900);
}
// Effet de mise en jeu des cartes au niveau maximum : éclat de lumière et étincelles par-dessus la table.
function burstAt(el) {
  if (!el || reduceMotion()) return;
  const r = el.getBoundingClientRect(), b = document.createElement('div');
  b.className = 'astralfx'; b.setAttribute('aria-hidden', 'true');
  Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  b.style.setProperty('--s', `${Math.max(r.width, r.height)}px`);
  b.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--r:${i * 30}deg;--d:${(i % 3) * 70}ms"></i>`).join('');
  document.body.append(b); setTimeout(() => b.remove(), 1400);
}
// Camp qui mène une zone : 1 pour soi, 2 pour l'adversaire, 0 à égalité.
const zoneSide = (view, z) => { const d = view.me.zonePower[z] - view.foe.zonePower[z]; return d > 0 ? 1 : d < 0 ? 2 : 0; };
const SIDES = ['', 'me', 'foe'];
const turnBanner = view => (view.turn === view.turns ? ['Dernier tour', `Tour ${view.turn}`, 'last'] : [`Tour ${view.turn}`, `sur ${view.turns}`, '']);
// Compare la vue précédente à la nouvelle : prépare les animations du prochain rendu et joue les bruitages.
// `after` : effets posés par-dessus la table une fois le rendu fait (ils ont besoin de la place des éléments).
function viewEffects(prev, view) {
  const list = [], sounds = [], burst = [], after = [];
  const fxOf = c => c && c.id && hasFx(borderIn(c.side === 'me' ? view.seat : 1 - view.seat, c.id));
  const at = sel => app.querySelector(sel);
  let flip = null;
  if (!prev || view.turn < prev.turn || (prev.phase === 'over' && view.phase !== 'over')) {
    // Début de partie : la main arrive carte par carte.
    clearEnding();
    view.me.hand.forEach((c, i) => list.push([`[data-hand="${c.uid}"]`, 'drawn', i * 70]));
    if (view.phase === 'plan') after.push(() => banner(at('.board'), ...turnBanner(view)));
    // Général de début de partie (pioche, Magot, Œuf…) : son effet après le bandeau du tour.
    if (view.turn <= 1) for (const side of ['me', 'foe']) if (view[side].genFired || GENERALS[view[side].general]?.kind === 'Début de partie') after.push(() => setTimeout(() => generalFire(at(`.pbar.${side} [data-general]`)), 1700 + (side === 'foe' ? 500 : 0)));
    ui.fx = { list, after }; play('draw'); return;
  }
  const before = cardsOf(prev), after2 = cardsOf(view), f = view.flash;
  // Début de la révélation : les cartes cachées de l'adversaire arrivent, les siennes sont scellées.
  if (prev.phase === 'plan' && view.phase === 'reveal') {
    after.push(() => banner(at('.board'), 'Révélation', '', 'reveal'));
    let i = 0;
    for (const [uid, b] of after2) if (!before.has(uid)) list.push(b.side === 'foe' ? [`[data-hid="${uid}"]`, 'dealt', (i++) * 90] : [cardSel(uid), 'sealed']);
    sounds.push('deal');
  }
  if (f !== null && f !== undefined) {
    const a = before.get(f), b = after2.get(f);
    if (!b) {
      sounds.push('spell'); if (fxOf(a)) { burstAt(at(cardSel(f))); sounds.push('astral'); }
      ghostOut(f, 'spellout'); if (a) list.push([`.zone[data-z="${a.z}"]`, 'spellcast']); }
    else if (a && a.revealed) { sounds.push('place'); const el = at(cardSel(f)); if (el) flip = { uid: f, rect: el.getBoundingClientRect() }; }
    else {
      sounds.push(b.side === 'me' ? 'reveal' : 'revealFoe'); list.push([cardSel(f), b.side === 'me' ? 'reveal' : 'reveal-foe']);
      // Carte de l'adversaire : son dos se retourne d'abord, sa face apparaît ensuite.
      const back = b.side === 'foe' && at(`[data-hid="${f}"]`) && !reduceMotion();
      if (back) { backFlip(at(`[data-hid="${f}"]`)); list.push([cardSel(f), 'after-back']); }
      after.push(() => setTimeout(() => sparkle(at(cardSel(f)), b.power), back ? 200 : 60));
      if (fxOf(b)) { list.push([cardSel(f), 'astral-in']); burst.push(cardSel(f)); sounds.push('astral'); }
    }
  }
  // Une carte de l'adversaire qui perd de la puissance, c'est un coup porté ; une des siennes, un coup reçu (on le sent au téléphone).
  let gone = false, up = false, hit = false, hurt = false;
  for (const [uid, a] of before) if (a.revealed && uid !== f && !after2.has(uid)) { ghostOut(uid, 'shatter'); gone = true; }
  for (const [uid, b] of after2) { const a = before.get(uid);
    if (a && a.revealed && b.revealed && a.power !== b.power && uid !== f) {
      const u = b.power > a.power; list.push([`${cardSel(uid)} .p`, u ? 'pup' : 'pdown']); if (u) up = true; else if (b.side === 'foe') hit = true; else hurt = true;
      after.push(() => floatNum(at(cardSel(uid)), b.power - a.power)); } }
  for (const side of ['me', 'foe']) for (const z of [0, 1, 2]) {
    const d = view[side].zonePower[z] - prev[side].zonePower[z];
    if (d) { list.push([`.zone[data-z="${z}"] .v.${side}`, 'bump']); after.push(() => floatNum(at(`.zone[data-z="${z}"] .v.${side}`), d, side)); }
    if (!prev[side].terrains[z] && view[side].terrains[z]) { list.push([`.zone[data-z="${z}"] .terrain.set.${side}`, 'terrain-in']); sounds.push('terrain'); }
  }
  // Une zone change de camp pendant la révélation : elle s'illumine à la couleur de son nouveau meneur.
  let swing = false;
  if (view.phase !== 'over') for (const z of [0, 1, 2]) {
    const was = zoneSide(prev, z), now = zoneSide(view, z);
    if (now && now !== was) { swing = true; after.push(() => zoneGlow(at(`.zone[data-z="${z}"]`), SIDES[now])); }
  }
  // Le général agit (activé, ou son pouvoir se déclenche) : son effet, un peu après ceux des cartes pour ne pas s'y superposer.
  for (const side of ['me', 'foe']) if ((!prev[side].generalUsed && view[side].generalUsed) || (view[side].genFired || 0) > (prev[side].genFired || 0)) {
    sounds.push('general'); after.push(() => setTimeout(() => generalFire(at(`.pbar.${side} [data-general]`)), 300));
  }
  if (!prev.ready.foe && view.ready.foe && view.phase === 'plan') list.push(['.pbar.foe .chip.ok', 'pop']);
  if (gone) sounds.push('destroy'); else if (hit) sounds.push('hit'); else if (hurt) sounds.push('down'); else if (up) sounds.push('up');
  if (swing && sounds.length < 3) sounds.push('swing');
  if (view.phase === 'plan' && view.turn !== prev.turn) {
    const had = new Set(prev.me.hand.map(c => c.uid));
    view.me.hand.filter(c => !had.has(c.uid)).forEach((c, i) => list.push([`[data-hand="${c.uid}"]`, 'drawn', 200 + i * 70]));
    after.push(() => banner(at('.board'), ...turnBanner(view)));
    sounds.push('turn', 'draw');
  }
  let result = null;
  if (view.phase === 'over' && prev.phase !== 'over' && view.result) {
    const win = view.result.winner === view.seat; result = win ? 'win' : view.result.winner < 0 ? 'tie' : 'lose';
    list.push(['.panel.end', 'end-in']);
    // Les zones s'allument une à une à la couleur de leur gagnant, puis les confettis en cas de victoire.
    // Fanfare (ou chute) et vibration avec le grand titre (stage.js, ending) : il frappe tout de suite en victoire,
    // il tombe en défaite et la vibration arrive quand il touche le sol.
    const res = result;
    // Boss mondial : pas de victoire ni de défaite, le score de la tentative s'affiche à la place du grand titre.
    if (view.boss) after.push(() => { [0, 1, 2].forEach(z => { if (view.boss.score.zones[z]?.beat) zoneGlow(at(`.zone[data-z="${z}"]`), SIDES[1], z * 220, true); });
      setTimeout(() => { play('win'); feel('win'); confetti(); }, 700); });
    else after.push(() => { [0, 1, 2].forEach(z => { const s = zoneSide(view, z); if (s) zoneGlow(at(`.zone[data-z="${z}"]`), SIDES[s], z * 220, true); });
      setTimeout(() => { ending(res); play(res); setTimeout(() => feel(res), res === 'lose' ? 490 : 0); }, 700); if (win) setTimeout(confetti, 450); });
  }
  ui.fx = { list, flip, burst, after };
  [...new Set(sounds)].slice(0, 3).forEach((s, i) => i ? setTimeout(() => play(s), i * 110) : play(s));
  // Une seule vibration par changement, la plus forte : la fin de partie (jouée avec le titre, plus haut), une carte détruite, un coup reçu…
  if (!result) feel((gone ? 'destroy' : hurt ? 'hit' : sounds.includes('astral') ? 'astral' : sounds.includes('general') ? 'general'
    : sounds.includes('spell') ? 'spell' : sounds.includes('terrain') ? 'terrain' : sounds.includes('turn') ? 'turn' : ''));
}
// Applique une seule fois les animations préparées, sur les éléments du rendu qui vient d'avoir lieu.
function applyFx() {
  const fx = ui.fx; ui.fx = null; if (!fx) return;
  for (const [sel, cls, delay] of fx.list) for (const el of app.querySelectorAll(sel)) {
    if (delay) el.style.animationDelay = `${delay}ms`;
    el.classList.add(cls);
  }
  for (const sel of fx.burst || []) burstAt(app.querySelector(sel));
  // Déplacement : la carte glisse depuis son ancienne place.
  if (fx.flip) flyFrom(app.querySelector(cardSel(fx.flip.uid)), fx.flip.rect, { ms: 420 });
  // Carte posée ou reprise en main : elle vole de là où elle était jusqu'à sa nouvelle place.
  for (const [sel, rect] of fx.fly || []) flyFrom(app.querySelector(sel), rect);
  for (const f of fx.after || []) f();
}
// Place à l'écran d'un élément avant le prochain rendu (pour l'y faire voler ensuite).
const rectOf = sel => app.querySelector(sel)?.getBoundingClientRect() || null;
// Reprend en main une carte posée ce tour : elle revient de sa case vers la main.
function unplace(uid) {
  const from = rectOf(cardSel(uid));
  ui.pending = ui.pending.filter(p => p.uid !== uid);
  if (from) ui.fx = { list: [], fly: [[`[data-hand="${uid}"]`, from]] };
  play('unplace');
}

// ---- Son au lancement ----
// Le navigateur ne laisse jouer le son qu'après un geste du joueur. On tente quand même dès le chargement (ordinateur
// où le site est déjà familier, appli installée) ; sinon le tout premier toucher, clic ou touche, n'importe où sur la page
// (écran d'ouverture compris), lance la musique. Sur Android, un toucher ne compte qu'au moment où le doigt se lève :
// d'où pointerup et touchend en plus de pointerdown.
unlockAudio();
if (audioContext()?.state === 'running') wakeMusic();
else audioContext()?.addEventListener('statechange', () => { if (audioContext().state === 'running') wakeMusic(); });
for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(t, () => { unlockAudio(); wakeMusic(); }, { capture: true, passive: true });

// ---- Glisser-déposer (en plus du toucher) ----
let drag = null, swallowClick = false;
const zoneAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.zone.target'); };
app.addEventListener('pointerdown', e => {
  if ((e.pointerType === 'mouse' && e.button !== 0) || !ui.view || !canPlay() || ui.screen !== 'game') return;
  const h = e.target.closest('[data-hand]'), m = e.target.closest('[data-mobile]');
  if (!h && !m) return;
  const el = h || m;
  drag = { kind: h ? 'hand' : 'move', uid: +(h ? h.dataset.hand : m.dataset.card), id: el.dataset.id, el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, touch: e.pointerType !== 'mouse', ghost: null };
});
function startDrag(e) {
  const r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
  g.classList.remove('sel', 'cant', 'msel', 'coach-hl'); g.classList.add('dragghost');
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
  e.preventDefault(); trail(e.clientX, e.clientY);
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx - parseFloat(drag.ghost.style.left)}px, ${e.clientY - drag.dy - parseFloat(drag.ghost.style.top)}px) rotate(${Math.max(-8, Math.min(8, dx / 20))}deg) scale(1.06)`;
  const over = zoneAt(e.clientX, e.clientY);
  for (const z of app.querySelectorAll('.zone.over')) if (z !== over) z.classList.remove('over');
  if (over) over.classList.add('over');
}, { passive: false });
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  if (!d.ghost) return;
  ui.drag = null; swallowClick = true; setTimeout(() => { swallowClick = false; }, 60);
  const over = !cancel && zoneAt(e.clientX, e.clientY), from = d.ghost.getBoundingClientRect();
  d.ghost.remove();
  // Lâchée hors d'une zone, ou dépôt refusé : la carte revient à sa place depuis l'endroit où elle a été lâchée.
  const back = () => { ui.sel = null; ui.moveSel = null; ui.fx = { list: [], fly: [[d.kind === 'hand' ? `[data-hand="${d.uid}"]` : cardSel(d.uid), from]] }; render(); };
  if (over) {
    dropRect = from; tryPlace(+over.dataset.z); dropRect = null;
    // Dépôt refusé : le message explique pourquoi.
    if (ui.sel === d.uid || ui.moveSel === d.uid) back();
  } else back();
}
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', e => endDrag(e, true));
app.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// ---- Interactions ----
// Double touche (souris ou doigt) : deux touches sur la même carte à moins de DOUBLE_TAP_MS. Le rendu remplace les éléments entre les deux, d'où une clé plutôt que l'élément.
const DOUBLE_TAP_MS = 350;
let lastTap = null, pendingTap = null;
function doubleTap(key) {
  const now = Date.now(), dbl = lastTap && lastTap.key === key && now - lastTap.t < DOUBLE_TAP_MS;
  lastTap = dbl ? null : { key, t: now }; return dbl;
}
// Carte lâchée par un glisser-déposer : elle part de là où le doigt l'a lâchée.
let dropRect = null;
function tryPlace(z) {
  if (!canPlay()) return;
  if (ui.moveSel !== null) {
    // Le déplacement s'applique tout de suite à l'aperçu ; ramener la carte dans sa zone de départ l'annule.
    const uid = ui.moveSel, now = planZone(uid);
    if (z === now) { ui.moveSel = null; ui.msg = ''; }
    else if (freeSlots(z) <= 0) { ui.msg = `La zone ${ZONE_NAMES[z]} est pleine de votre côté.`; play('deny'); feel('deny'); msgFades(); }
    else {
      const from = dropRect || rectOf(cardSel(uid));
      ui.moves = ui.moves.filter(m => m.uid !== uid);
      if (z !== boardZone(uid)) ui.moves.push({ uid, zone: z });
      ui.moveSel = null; ui.msg = ''; play('place'); feel('place');
      if (from && !reduceMotion()) ui.fx = { list: [], fly: [[cardSel(uid), from]] };
    }
    render(); return;
  }
  if (!ui.sel) return;
  const c = handLeft().find(x => x.uid === ui.sel); if (!c) return;
  const d = CARDS[c.id], left = sealsLeft();
  if (freeSlots(z) <= 0) ui.msg = `La zone ${ZONE_NAMES[z]} est pleine de votre côté.`;
  else if (d.x ? left <= 0 : c.cost > left) ui.msg = d.x ? `Il ne vous reste aucun sceau pour ${d.name}.` : `Pas assez de sceaux : ${d.name} coûte ${c.cost}, il vous en reste ${left}.`;
  else {
    const from = dropRect || rectOf(`[data-hand="${c.uid}"]`);
    ui.pending.push({ uid: c.uid, id: c.id, zone: z }); ui.sel = null; ui.msg = '';
    ui.fx = from && !reduceMotion() ? { list: [], fly: [[cardSel(c.uid), from]] } : { list: [[cardSel(c.uid), 'dropin']] }; play('place'); feel('place'); }
  if (ui.msg) { play('deny'); feel('deny'); msgFades(); }
  render();
}
// La bulle d'un refus s'efface seule après un moment.
let msgTimer = null;
function msgFades() { const m = ui.msg; clearTimeout(msgTimer); msgTimer = setTimeout(() => { if (ui.msg === m && ui.screen === 'game') { ui.msg = ''; render(); } }, 2600); }
// Retour au salon : depuis une partie, sous le voile, le temps que la table laisse place aux menus.
function quit() {
  if (ui.screen === 'game' && !veil.covering()) { veil.cover({ label: 'Retour au salon…', tips: ['menu'], min: 500, run: leaveTable, until: () => ui.screen !== 'game' }); return; }
  leaveTable();
}
function leaveTable() {
  if (ui.ctrl) ui.ctrl.leave();
  store.set('session', null);
  // Un chapitre d'histoire ramène à la carte de sa quête.
  const back = ui.mode === 'story' && ui.account?.starter ? 'story' : menuScreen();
  if (back === 'story') { ui.mode = null; story.reload(); }
  ui.ctrl = null; ui.view = null; ui.friendFoe = null; ui.rankedAi = false; ui.bossRun = false; ui.screen = back; ui.sheet = null; ui.pending = []; ui.lastTurn = 0; ui.soloReward = null; render();
  // Le compte a pu changer pendant la partie (XP, Éclats, missions, succès).
  if (ui.auth) api('GET', '/api/me', undefined, ui.auth).then(r => { setAccount(r.account); render(); }).catch(() => {});
}
app.addEventListener('input', e => {
  if (friends.input(e) || mail.input(e) || clan.input(e)) return;
  if (e.target.id === 'login-id') ui.loginId = e.target.value;
  if (e.target.id === 'login-pass') ui.loginPass = e.target.value;
  if (e.target.id === 'deck-name' && ui.edit) ui.edit.name = e.target.value;
  if (e.target.id === 'rename-input' && ui.renaming) ui.renaming.name = e.target.value;
  if (e.target.id === 'deck-import') { ui.importCode = e.target.value; if (ui.importErr) { ui.importErr = ''; e.target.closest('form')?.querySelector('.err')?.remove(); } }
  if (e.target.id === 'profile-name') { ui.nameDraft = e.target.value; const b = e.target.form?.querySelector('[type=submit]');
    if (b) b.disabled = ui.busy || !ui.nameDraft.trim() || ui.nameDraft.trim() === ui.account.name; }
  if (e.target.id === 'codex-q') { ui.codexQuery = e.target.value; document.getElementById('codex-list').innerHTML = codexHTML(ui.codexQuery); }
  if (e.target.id === 'sfx-volume') { setSfxVolume(e.target.value / 100); document.getElementById('sfx-pct').textContent = `${e.target.value} %`; }
  if (e.target.id === 'music-volume') { setMusicVolume(e.target.value / 100); document.getElementById('music-pct').textContent = `${e.target.value} %`; }
  if (e.target.id === 'code') { ui.joinCode = e.target.value.toUpperCase(); e.target.value = ui.joinCode; }
});
app.addEventListener('change', e => {
  // Réglages du son : on fait entendre (ou sentir) le résultat tout de suite.
  if (notifs.change(e)) return;
  if (e.target.id === 'sfx-volume') play('place');
  if (e.target.id === 'sound-on') { setMuted(!e.target.checked); play('validate'); render(); }
  if (e.target.id === 'vibrations-on') { setVibrations(e.target.checked); buzz(40); }
  if (e.target.id === 'avatar-file') { pickAvatar(e.target.files[0]); e.target.value = ''; }
  if (e.target.id === 'title-pick') equip({ title: e.target.value || null }, 'Titre changé.');
  if (e.target.id === 'emotes-off') store.set('emotes-off', e.target.checked);
});
app.addEventListener('submit', e => {
  e.preventDefault(); if (ui.busy) return;
  if (friends.submit(e.target) || mail.submit(e.target) || clan.submit(e.target)) return;
  if (e.target.id === 'login-form') doLogin();
  else if (e.target.id === 'name-form') saveName();
  else if (e.target.id === 'rename-form') renameDeck();
  else if (e.target.id === 'deck-import-form') importDeck();
});
// Les missions repliées ou dépliées le restent d'un affichage à l'autre.
app.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-hand],[data-card],[data-terrain],[data-general],[data-z],[data-starter],[data-pick],[data-tpick],[data-gpick],[data-step],[data-fam],[data-zoom],[data-frame],[data-back],[data-theme],[data-stop]');
  // Sélecteur d'émotes ouvert : toucher ailleurs le referme.
  if (ui.emotePick && !e.target.closest('.emotepick,[data-act="emotes"]')) { ui.emotePick = false; if (!t) { render(); return; } }
  if (!t) return;
  const ds = t.dataset;
  if (ds.stop && !e.target.closest('[data-act]')) return;
  if (ds.act) {
    const a = ds.act;
    if (a === 'friends' && ui.sheet === 'play-friend') { ui.sheet = null; ui.error = ''; }
    if (friends.click(a, ds) || mail.click(a, ds) || clan.click(a, ds) || boss.click(a, ds) || story.click(a, ds) || notifs.click(a)) return;
    if (a === 'close') closeSheet();
    else if (a === 'zplay' || a === 'zmove') { const uid = ui.zoom.uid; ui.sheet = null; ui.zoom = null;
      if (a === 'zplay') { ui.sel = uid; ui.moveSel = null; } else { ui.moveSel = uid; ui.sel = null; }
      tryPlace(+ds.zone); }
    else if (a === 'zback') { unplace(ui.zoom.uid); ui.sheet = null; ui.zoom = null; ui.msg = ''; render(); }
    else if (a === 'zstay') { const uid = ui.zoom.uid; ui.sheet = null; ui.zoom = null; ui.moveSel = uid; ui.sel = null; tryPlace(boardZone(uid)); }
    else if (a === 'log' || a === 'set' || a === 'learn' || a === 'missions') { ui.sheet = a; render(); }
    else if (a === 'play-friend') { ui.sheet = a; ui.error = ''; render(); }
    else if (a === 'create') goOnline('create');
    else if (a === 'join') { if (ui.joinCode.length !== 4) { ui.error = 'Le code fait 4 lettres.'; render(); } else goOnline('join'); }
    else if (a === 'solo') goSolo();
    else if (a === 'tuto') goTutorial(ds.lesson);
    else if (a === 'tuto-next') { if (ui.guide) ui.guide = null; else ui.ctrl?.next(); render(); }
    else if (a === 'guide-skip') { ui.guide = null; render(); }
    else if (a === 'gift-take' && !ui.busy) takeGift();
    else if (a === 'codex') { ui.sheet = 'codex'; ui.zoom = null; render(); }
    else if (a === 'copy') { const link = document.getElementById('link');
      navigator.clipboard.writeText(link.value).then(() => { t.textContent = 'Lien copié'; }).catch(() => { link.select(); }); }
    else if (a === 'go') { if (!canPlay()) return; play('validate'); feel('validate');
      ui.ctrl.submit({ cards: ui.pending.map(p => ({ uid: p.uid, zone: p.zone })), moves: ui.moves.slice(), general: ui.genZone }); ui.sel = null; ui.moveSel = null; if (ui.offline) render(); }
    // Activer le général (ou l'annuler) depuis sa carte en grand.
    else if (a === 'zgen') {
      if (!canPlay()) return;
      ui.genZone = ds.zone === undefined ? null : +ds.zone; ui.sheet = null; ui.zoom = null;
      ui.sel = null; ui.moveSel = null; ui.msg = '';
      // Le coût du général passe avant les cartes : on retire les dernières cartes posées s'il manque des sceaux.
      while (ui.genZone !== null && sealsLeft() < 0 && ui.pending.length) ui.pending.pop();
      play(ui.genZone === null ? 'unplace' : 'place'); render(); }
    else if (a === 'again') { ui.tutoSent = false; ui.tutoReward = null; ui.rematchAsked = true; ui.soloReward = null; ui.ctrl.rematch(); render(); }
    else if (a === 'quit') {
      if (ui.screen === 'game' && ui.view?.ranked && ui.view.phase !== 'over' && !confirm('Quitter une partie classée en cours compte comme une défaite. Quitter quand même ?')) return;
      if (ui.screen === 'game' && ui.view?.boss && ui.view.phase !== 'over' && !confirm('Quitter la tentative la termine avec votre plateau actuel : elle compte comme jouée. Quitter quand même ?')) return;
      quit(); }
    else if (a === 'ranked') { ui.sheet = null; openRanked(); }
    else if (a === 'pass') openPass();
    else if (a === 'pass-buy' && !ui.busy) buyPass();
    else if (a === 'ranked-play') goRanked();
    else if (a === 'mute') { setMuted(!isMuted()); render(); }
    else if (a === 'emotes') { ui.emotePick = !ui.emotePick; if (ui.emotePick) play('pick'); render(); }
    else if (a === 'emote') sendEmote(ds.id);
    else if (a === 'emote-mute') toggleEmoteMute();
    else if (a === 'emote-slot' && !ui.busy) toggleEmoteSlot(ds.id);
    else if (a === 'buy-emote' && !ui.busy) { const e = EMOTES[ds.id], go = () => buyEmote(ds.id); if (e.prisms || !lacksShards(e.price, 'acheter', go)) go(); }
    else if (a === 'shop-emotes') openShop('emotes');
    else if (a === 'logout') doLogout();
    else if (a === 'retry') boot();
    else if (a === 'lang') chooseLang(ds.lang);
    else if (a === 'starter' && ui.starterPick && !ui.busy) call('POST', '/api/starter', { starter: ui.starterPick });
    else if (a === 'booster' && !ui.busy) openBoosterNow();
    else if (a === 'collection') { ui.screen = 'collection'; ui.error = ''; render(); }
    else if (a === 'shop') openShop('sets');
    else if (a === 'buy-card' && !ui.busy) { const go = () => buy('/api/shop/card', { set: ds.set, card: ds.id }); if (!lacksShards(ui.shop?.prices.cardPrice, 'acheter', go)) go(); }
    else if (a === 'buy-booster' && !ui.busy) { const go = () => buy('/api/shop/booster', { set: ds.set }); if (!lacksShards(boosterPriceOf(ds.set), 'acheter', go)) go(); }
    else if (a === 'free-booster' && !ui.busy) buy('/api/shop/booster', { set: ds.set, free: true });
    else if (a === 'buy-art' && !ui.busy) buyArt('/api/shop/art', { art: ds.id });
    else if (a === 'chest' && !ui.busy) buyArt('/api/shop/chest', {});
    else if (a === 'chest-free' && !ui.busy) buyArt('/api/shop/chest', { free: true });
    else if (a === 'shop-tab') { ui.shopTab = ds.tab; ui.msg = ''; ui.error = ''; render(); }
    else if (a === 'shop-arts') { ui.sheet = null; ui.calGot = null; openShop('arts'); }
    else if (a === 'exchange' && !ui.busy) exchange(ds.id);
    else if (a === 'buy-dup' && !ui.busy) { const go = () => buyDup(ds.id); if (!lacksShards(ui.shop?.prices.dupPrice, 'acheter', go)) go(); }
    else if (a === 'buy-ess-art' && !ui.busy) buyEssenceArt(ds.id);
    else if (a === 'uni-convert' && !ui.busy) convertEssence(ds.id, +ds.n);
    else if (a === 'shop-essence') { ui.sheet = null; ui.zoom = null; ui.msg = ''; openShop('essence'); }
    else if (a === 'shop-change') { ui.need = null; ui.sheet = null; ui.zoom = null; openShop('change'); }
    else if (a === 'chest-info') { ui.sheet = 'chest-info'; render(); }
    else if (a === 'booster-info') { ui.sheet = 'booster-info'; render(); }
    else if (a === 'calendar') { ui.sheet = 'calendar'; ui.calGot = null; render(); }
    else if (a === 'event') { ui.sheet = 'event'; ui.evSel = t.dataset.ev; render(); }
    else if (a === 'claim-day' && !ui.busy) claimDay();
    else if (a === 'welcome') { ui.sheet = 'welcome'; ui.welGot = null; render(); }
    else if (a === 'claim-welcome' && !ui.busy) claimWelcome();
    else if (a === 'welcome-profile') { ui.sheet = null; ui.welGot = null; openProfile(); }
    else if (a === 'art-pick' && !ui.busy) selectArt(ds.card, ds.art);
    else if (a === 'holo-toggle' && !ui.busy) toggleHolo(ds.card);
    else if (a === 'border-pick' && !ui.busy) chooseBorder(ds.card, +ds.lv);
    else if (a === 'pop-toggle' && !ui.busy) togglePop(ds.card);
    else if (a === 'reroll' && !ui.busy) call('POST', '/api/missions/reroll', { index: +ds.i });
    else if (a === 'edit') { editDeck(ui.account.active, ui.screen === 'collection' ? 'collection' : 'home'); render(); }
    else if (a === 'home') { ui.screen = 'home'; ui.edit = null; ui.error = ''; ui.msg = ''; render(); }
    else if (a === 'decks') openDecks();
    else if (a === 'deck-new') { if (ui.account.decks.length < maxDecks()) { editDeck(null, 'decks'); render(); } }
    else if (a === 'deck-share') { const d = deckById(ds.id); if (d) showDeckCode(d); }
    else if (a === 'decks-tab') { ui.decksTab = ds.tab; ui.error = ''; ui.msg = ''; render(); scrollTo(0, 0); }
    else if (a === 'recipe-use' && DECKS[ds.id]) buildFrom(DECKS[ds.id], 'recette');
    else if (a === 'recipe-share' && DECKS[ds.id]) showDeckCode(DECKS[ds.id]);
    else if (a === 'dcode-copy' && ui.shareDeck) copyDeckCode(t);
    else if (a.startsWith('deck-') && a !== 'deck-cancel' && !ui.busy) deckAction(a, ds.id);
    else if (a === 'deck-cancel') { ui.screen = ui.edit?.back || 'home'; ui.edit = null; ui.error = ''; ui.msg = ''; render(); }
    else if (a === 'step-next' && stepOpen(ui.edit, ui.deckStep + 1)) { ui.deckStep++; ui.msg = ''; render(); scrollTo(0, 0); }
    else if (a === 'step-prev') { ui.deckStep = Math.max(0, ui.deckStep - 1); ui.msg = ''; render(); scrollTo(0, 0); }
    else if (a === 'profile') openProfile(ds.tab);
    else if (a === 'player') openPlayer(ds.login);
    else if ((a === 'player-add' || a === 'player-accept') && !ui.busy) playerFriend(a === 'player-accept');
    else if (a === 'fav-art' && !ui.busy) toggleFavArt(ds.id);
    else if (a === 'profile-tab') { ui.profileTab = ds.tab; ui.msg = ''; ui.error = ''; render(); }
    else if (a === 'avatar-remove' && !ui.busy) call('PUT', '/api/profile', { avatar: null });
    else if (a === 'save-deck' && !ui.busy) saveDeck();
    else if (a === 'upgrade' && !ui.busy) { const go = () => upgrade(ds.id); if (!lacksShards(nextCost(ds.id)?.shards, 'monter de niveau', go)) go(); }
    return;
  }
  if (ds.starter) { ui.starterPick = ds.starter; render(); return; }
  if (ds.frame !== undefined && !ui.busy) { equip({ frame: ds.frame || null }, 'Cadre changé.'); return; }
  if (ds.theme !== undefined && !ui.busy) { equip({ theme: ds.theme || null }, 'Thème changé.'); return; }
  if (ds.back && !ui.busy) { equip({ back: ds.back }, 'Dos de carte changé.'); return; }
  if (ds.fam !== undefined) { ui.colFam = ds.fam; render(); return; }
  if (ds.zoom) { const [kind, id, art] = ds.zoom.split(':'); const back = ui.sheet === 'codex' || ui.sheet === 'player' ? ui.sheet : null; openZoom({ kind, id, art: art || null }); ui.zoomBack = back; ui.msg = ''; render(); return; }
  if (ds.pick) { togglePick(ds.pick); return; }
  if (ds.tpick) { toggleTerrain(ds.tpick); return; }
  if (ds.gpick) { ui.edit.general = ds.gpick; ui.msg = '';
    // Premier choix du général : on passe directement aux terrains.
    if (ui.deckStep === 0 && !ui.edit.terrains.length) ui.deckStep = 1;
    render(); scrollTo(0, 0); return; }
  if (ds.step !== undefined) { const i = +ds.step; if (stepOpen(ui.edit, i)) { ui.deckStep = i; ui.msg = ''; render(); } return; }
  // En partie : une touche sélectionne la carte (une deuxième la désélectionne), une double touche l'affiche en grand.
  if (ds.hand) { const uid = +ds.hand; ui.focus = { kind: 'card', id: ds.id }; ui.msg = '';
    if (doubleTap(`hand:${uid}`)) { if (canPlay()) { ui.sel = uid; ui.moveSel = null; } openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
    if (canPlay()) { ui.moveSel = null; ui.sel = ui.sel === uid ? null : uid; play(ui.sel === null ? 'unplace' : 'pick'); }
    render(); return; }
  if (ds.card) { const uid = +ds.card;
    // Une carte posée ce tour : une touche la reprend en main, sélectionnée pour être reposée ailleurs.
    // On attend un instant pour ne pas la reprendre si c'est une double touche.
    if (ds.pending && pendingTap?.uid === uid) { clearTimeout(pendingTap.timer); pendingTap = null; openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
    if (ds.pending && canPlay() && ui.sel === null && ui.moveSel === null) {
      ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; clearTimeout(pendingTap?.timer);
      pendingTap = { uid, timer: setTimeout(() => { pendingTap = null;
        if (!canPlay() || ui.sheet || !ui.pending.some(p => p.uid === uid)) return;
        unplace(uid); ui.sel = uid; render(); }, DOUBLE_TAP_MS) };
      return; }
    if (ds.mobile && canPlay() && ui.sel === null && (ui.moveSel === null || ui.moveSel === uid)) {
      ui.focus = { kind: 'card', id: ds.id }; ui.msg = '';
      // Sélectionnée pour un déplacement : toucher ensuite une zone la déplace ; la retoucher la désélectionne.
      if (doubleTap(`card:${uid}`)) { ui.moveSel = uid; openZoom({ kind: 'card', id: ds.id, uid }); render(); return; }
      ui.moveSel = ui.moveSel === uid ? null : uid; play(ui.moveSel === null ? 'unplace' : 'pick');
      render(); return; }
    if (ds.id && ui.sel === null && ui.moveSel === null) { if (doubleTap(`card:${uid}`)) { ui.focus = { kind: 'card', id: ds.id }; ui.msg = ''; openZoom({ kind: 'card', id: ds.id, uid }); render(); } return; }
  }
  if (ds.terrain && ui.sel === null && ui.moveSel === null) { if (doubleTap(`terrain:${ds.terrain}`)) { ui.focus = { kind: 'terrain', id: ds.terrain }; ui.msg = ''; openZoom({ kind: 'terrain', id: ds.terrain }); render(); } return; }
  if (ds.general) { if (doubleTap(`general:${ds.side}`)) { ui.focus = { kind: 'general', id: ds.general }; ui.msg = ''; openZoom({ kind: 'general', id: ds.general, mine: ds.side === 'me', side: ds.side }); render(); } return; }
  const zone = t.closest('[data-z]'); if (zone) tryPlace(+zone.dataset.z);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.emotePick) { ui.emotePick = false; render(); return; }
  if (e.key === 'Escape' && ui.sheet && ui.sheet !== 'friend-deck') closeSheet();
});
app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone.target')) { e.preventDefault(); tryPlace(+e.target.dataset.z); } });

// Reprise d'une partie en ligne après rechargement de la page
const saved = store.get('session', null);
if (saved && saved.room && saved.token) { ui.mode = 'online'; ui.room = saved.room; ui.friendFoe = saved.foe || null; ui.ctrl = connectOnline(handlers, { t: 'rejoin', room: saved.room, token: saved.token }); }
boot();
notifs.listen();

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
