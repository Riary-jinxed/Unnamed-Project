// Page d'administration : comptes des joueurs (création, profil, Éclats, collection, deck, accès), statistiques des parties,
// éditeur de cartes et de sets (brouillon puis publication), réglages de la boutique, courrier aux joueurs et codes cadeaux, signalements de bugs, annonces des Nouveautés.
// Protégée par la clé ADMIN_KEY du serveur, gardée dans ce navigateur seulement.
import './style.css';
import { DECKS, CARDS, GENERALS, TERRAINS, FAMILIES } from '@jeu/engine';
import { STARTERS, OWNABLE, SETS, today } from '@jeu/engine/collection';
import { addDays } from '@jeu/engine/events';
import { applyCatalog } from '@jeu/engine/catalog';
import { statsTab } from './admin-stats.js';
import { followTab } from './admin-follow.js';
import { esc, famStyle } from './common.js';
import { cardsTab } from './admin-cards.js';
import { rewardsTab } from './admin-rewards.js';
import { mailTab } from './admin-mail.js';
import { bugsTab } from './admin-bugs.js';
import { newsTab } from './admin-news.js';
import { eventsTab } from './admin-events.js';
import { bossTab } from './admin-boss.js';
import { storyTab } from './admin-story.js';
import { ARTS, ART_RARITIES, RARITY_IDS, rarityName } from '@jeu/engine/arts';
import { THEMES } from '@jeu/engine/themes';

const app = document.getElementById('app');
const KEY = 'jeu-admin-key';
const famOf = id => (GENERALS[id] ? GENERALS[id].fam : CARDS[id].kw.find(k => FAMILIES.includes(k))) || 'Neutre';
const nameOf = id => GENERALS[id] ? `${GENERALS[id].name} (général)` : CARDS[id].name;
const st = {
  key: (() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } })(),
  tab: 'accounts', accounts: null, q: '', sel: null, detail: null, cards: null, settings: null, defaults: null, arts: null, msg: '', err: '', busy: false,
};

async function adminCall(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-admin-key': st.key }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur du serveur.');
  return data;
}
const say = (msg, err = '') => { st.msg = msg; st.err = err; };
const TABS = { accounts: 'Comptes', stats: 'Stats', follow: 'Suivi', cards: 'Cartes', sets: 'Sets', shop: 'Boutique', rewards: 'Récompenses', events: 'Événements', boss: 'Boss', story: 'Quêtes', mail: 'Courrier', bugs: 'Signalements', news: 'Nouveautés' };
const tabCtx = { call: adminCall, render: () => render(), say, esc: s => esc(s), notice: () => notice() };
const stats = statsTab(tabCtx), rewards = rewardsTab(tabCtx), mail = mailTab(tabCtx), news = newsTab(tabCtx), events = eventsTab(tabCtx), boss = bossTab(tabCtx), story = storyTab(tabCtx), follow = followTab(tabCtx);
// Signalements : « Répondre par courrier » ouvre l'onglet Courrier avec le joueur en destinataire.
const bugs = bugsTab({ ...tabCtx, onReply: async login => {
  st.tab = 'mail'; say(''); render(); await mail.load();
  const to = document.getElementById('ms-to'), title = document.getElementById('ms-title');
  if (to) to.value = login; if (title && !title.value) title.value = 'Votre signalement';
  window.scrollTo(0, 0);
} });
// Après une publication, la liste des comptes et les collections tiennent compte des nouvelles cartes.
const cards = cardsTab({ ...tabCtx, onPublished: () => refresh() });
async function refresh() {
  try {
    const [list, conf, cat] = await Promise.all([adminCall('GET', '/api/admin/accounts'), adminCall('GET', '/api/admin/settings'), adminCall('GET', '/api/catalog')]);
    applyCatalog(cat.catalog);
    st.accounts = list.accounts; st.settings = conf.settings; st.defaults = conf.defaults; st.err = '';
    try { sessionStorage.setItem(KEY, st.key); } catch { /* stockage indisponible */ }
  } catch (e) { st.accounts = null; st.err = e.message; }
  render();
}
async function openAccount(login) {
  try { setDetail((await adminCall('GET', `/api/admin/account?login=${encodeURIComponent(login)}`)).account); st.sel = login; say(''); }
  catch (e) { say('', e.message); }
  render(); window.scrollTo(0, 0);
}
function setDetail(a) { st.detail = a; st.cards = new Set(a.owned); }
// Lance une action sur le compte ouvert, puis met à jour la fiche et la liste.
async function act(path, body, okMsg) {
  st.busy = true; render();
  try {
    const r = await adminCall('POST', path, { login: st.sel, ...body });
    if (r.account) setDetail(r.account);
    say(okMsg);
    st.accounts = (await adminCall('GET', '/api/admin/accounts')).accounts;
  } catch (e) { say('', e.message); }
  st.busy = false; render();
}

const notice = () => `${st.msg ? `<p class="ok" style="margin:0">${st.msg}</p>` : ''}${st.err ? `<p class="err" style="margin:0">${esc(st.err)}</p>` : ''}`;
const dis = () => (st.busy ? 'disabled' : '');

// Zone de test : jour d'aperçu du compte (server/src/preview.js). Raccourcis : demain, dans une semaine, et la sortie de chaque set à venir.
function previewBlock(a) {
  const day = today(), soon = [{ d: addDays(day, 1), label: 'Demain' }, { d: addDays(day, 7), label: 'Dans 7 jours' },
    ...SETS.filter(s => s.reveal && s.reveal > day).sort((x, y) => x.reveal.localeCompare(y.reveal)).map(s => ({ d: s.reveal, label: `Sortie de ${s.name}` }))];
  return `<form class="card-box" id="preview">
    <h3>Zone de test</h3>
    <p class="hint" style="margin:0">Un jour d'aperçu fait vivre ce compte à cette date sur le jeu en ligne : les sets, decks préconstruits, terrains, événements, saisons du passe, quêtes et annonces de ce jour-là y sont visibles et jouables (boutique, collection, decks, IA). Rien ne change pour les autres joueurs. Le classé et les Boss sont fermés à ce compte pendant ce temps. L'appli du testeur prend le changement à sa prochaine action (ou en la rechargeant).</p>
    <div class="row"><input id="p-preview" type="date" value="${esc(a.preview || '')}" min="${day}" aria-label="Jour d'aperçu" style="max-width:200px">
      <button class="btn primary" type="submit" ${dis()}>${a.preview ? 'Changer le jour' : 'En faire un compte de test'}</button>
      ${a.preview ? `<button class="btn" type="button" data-act="preview-off" ${dis()}>Revenir au jour réel</button>` : ''}</div>
    <div class="row"><span class="hint">Raccourcis :</span>${soon.map(x => `<button class="btn sm" type="button" data-preview-day="${x.d}" title="${x.d}">${esc(x.label)}</button>`).join('')}</div>
  </form>`;
}

function renderList() {
  const q = st.q.trim().toLowerCase();
  const list = st.accounts.slice().sort((a, b) => a.login.localeCompare(b.login)).filter(a => !q || a.login.includes(q) || a.name.toLowerCase().includes(q));
  const rows = list.map(a => `<tr data-open="${esc(a.login)}" tabindex="0">
    <td><b>${esc(a.login)}</b>${a.disabled ? ' <span class="chip off">désactivé</span>' : ''}${a.preview ? ` <span class="chip">test · ${esc(a.preview)}</span>` : ''}</td><td>${esc(a.name)}</td><td>${a.starter ? esc(DECKS[a.starter].name) : '—'}</td>
    <td class="num">${a.level}</td><td class="num">${a.cards}</td><td class="num">${a.shards}</td><td>${a.lastBooster || '—'}</td><td class="num">${a.sessions}</td></tr>`).join('');
  return `${notice()}
  <div class="card-box" style="overflow-x:auto">
    <div class="row"><h2 style="font-size:20px;margin-right:auto">${st.accounts.length} compte${st.accounts.length > 1 ? 's' : ''}</h2>
      <input id="q" type="search" placeholder="Chercher un joueur" value="${esc(st.q)}" style="max-width:220px"></div>
    <table class="admin"><thead><tr><th>Identifiant</th><th>Pseudo</th><th>Deck de départ</th><th>Niveau</th><th>Cartes</th><th>Éclats</th><th>Dernier booster</th><th>Sessions</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="8" class="hint">${q ? 'Aucun compte ne correspond.' : 'Aucun compte pour l\'instant.'}</td></tr>`}</tbody></table>
    <p class="hint" style="margin:0">Cliquez sur un compte pour le modifier.</p>
  </div>
  <form class="card-box" id="create">
    <h2 style="font-size:20px">Créer un compte</h2>
    <div class="grid2">
      <div class="field"><label class="eyebrow" for="login">Identifiant</label><input id="login" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label class="eyebrow" for="name">Pseudo affiché en partie</label><input id="name" maxlength="20" placeholder="Par défaut : l'identifiant"></div>
    </div>
    <div class="field"><label class="eyebrow" for="password">Mot de passe</label><input id="password" required minlength="8" autocomplete="new-password"></div>
    <div class="row"><button class="btn primary" type="submit">Créer</button><button class="btn" type="button" data-act="gen" data-for="password">Mot de passe au hasard</button></div>
  </form>`;
}

function renderDetail() {
  const a = st.detail, inDeck = new Set(a.inDecks || a.deck?.cards || []);
  const byFam = {};
  for (const id of OWNABLE) (byFam[famOf(id)] ||= []).push(id);
  const collection = [...FAMILIES, 'Neutre'].filter(f => byFam[f]).map(f => {
    const ids = byFam[f], n = ids.filter(id => st.cards.has(id)).length;
    return `<div class="famblock" style="${famStyle(f)}"><div class="row"><b style="margin-right:auto">${f}</b><small class="hint">${n}/${ids.length}</small>
      <button class="btn sm" type="button" data-fam-all="${f}">Tout</button><button class="btn sm" type="button" data-fam-none="${f}">Rien</button></div>
      <div class="chips">${ids.map(id => `<label class="pick ${st.cards.has(id) ? 'on' : ''} ${inDeck.has(id) ? 'lock' : ''}" title="${inDeck.has(id) ? 'Dans un deck du joueur' : ''}">
        <input type="checkbox" data-card="${id}" ${st.cards.has(id) ? 'checked' : ''} ${inDeck.has(id) ? 'disabled' : ''}>${esc(nameOf(id))}</label>`).join('')}</div></div>`;
  }).join('');
  const changed = st.cards.size !== a.owned.length || a.owned.some(id => !st.cards.has(id));
  const deck = a.deck ? `<p style="margin:0"><b>${esc(a.deck.name)}</b> · général ${esc(GENERALS[a.deck.general]?.name || a.deck.general || 'à choisir')}${a.decks > 1 ? ` <small class="hint">(deck joué, ${a.decks} decks en tout)</small>` : ''}</p>
    <p class="hint" style="margin:0">${a.deck.cards.map(id => esc(CARDS[id]?.name || id)).join(', ')}</p>
    <p class="hint" style="margin:0">Terrains : ${a.deck.terrains.map(id => esc(TERRAINS[id]?.name || id)).join(', ')}</p>
    ${a.deckError ? `<p class="err" style="margin:0">Deck injouable : ${esc(a.deckError)}</p>` : ''}` : '<p class="hint" style="margin:0">Pas encore de deck : le joueur choisira son deck de départ à sa prochaine connexion.</p>';
  return `<div class="row"><button class="btn" data-act="back">← Tous les comptes</button></div>
  <div class="card-box">
    <div class="row"><h2 style="font-size:24px;margin-right:auto">${esc(a.login)}</h2>${a.preview ? `<span class="chip">Compte de test · ${esc(a.preview)}</span>` : ''}${a.disabled ? '<span class="chip off">Désactivé</span>' : '<span class="chip">Actif</span>'}</div>
    <p class="hint" style="margin:0">Créé le ${a.created ? new Date(a.created).toLocaleDateString('fr-FR') : '—'} · ${a.sessions} session${a.sessions > 1 ? 's' : ''} ouverte${a.sessions > 1 ? 's' : ''} · ${a.cards} cartes</p>
    ${notice()}
  </div>
  <form class="card-box" id="profile">
    <h3>Profil, monnaies et niveau</h3>
    <div class="grid2">
      <div class="field"><label class="eyebrow" for="p-name">Pseudo</label><input id="p-name" maxlength="20" value="${esc(a.name)}"></div>
      <div class="field"><label class="eyebrow" for="p-shards">Éclats</label><input id="p-shards" type="number" min="0" step="1" value="${a.shards}"></div>
      <div class="field"><label class="eyebrow" for="p-prisms">Prismes</label><input id="p-prisms" type="number" min="0" step="1" value="${a.prisms}"><small class="hint">Monnaie des arts alternatifs.</small></div>
      <div class="field"><label class="eyebrow" for="p-uni">Essence universelle</label><input id="p-uni" type="number" min="0" step="1" value="${a.uniEssence || 0}"><small class="hint">Doublons des cartes au niveau maximum ; se dépense au rayon Essence.</small></div>
      <div class="field"><label class="eyebrow" for="p-level">Niveau</label><input id="p-level" type="number" min="1" step="1" value="${a.level}">
        <small class="hint">${a.xp} XP dans ce niveau. Changer le niveau ne donne pas les récompenses des niveaux sautés.</small></div>
      <div class="field"><label class="eyebrow" for="p-free">Boosters offerts à ouvrir</label><input id="p-free" type="number" min="0" step="1" value="${a.freeBoosters}"></div>
      <div class="field"><label class="eyebrow" for="p-family">Boosters de famille à ouvrir</label><input id="p-family" type="number" min="0" step="1" value="${a.familyBoosters || 0}"></div>
      <div class="field"><label class="eyebrow" for="p-chests">Coffres d'arts offerts à ouvrir</label><input id="p-chests" type="number" min="0" step="1" value="${a.freeChests || 0}"></div>
    </div>
    <div class="row"><button class="btn primary" type="submit" ${dis()}>Enregistrer</button>
      <span class="hint">Ajouter :</span>${[100, 300, 1000].map(n => `<button class="btn sm" type="button" data-add-shards="${n}">+${n}</button>`).join('')}</div>
  </form>
  ${previewBlock(a)}
  <div class="card-box">
    <h3>Deck et boosters</h3>
    ${deck}
    <div class="row"><select id="starter" aria-label="Deck de départ">${STARTERS.map(k => `<option value="${k}" ${a.starter === k ? 'selected' : ''}>${esc(DECKS[k].name)} (${DECKS[k].fam})</option>`).join('')}</select>
      <button class="btn" data-act="starter" ${dis()}>${a.starter ? 'Changer de deck de départ' : 'Attribuer ce deck'}</button></div>
    <p class="hint" style="margin:0">Le joueur garde sa collection ; les cartes du nouveau deck y sont ajoutées et ce deck préconstruit devient son deck joué.</p>
    <div class="row">
      <button class="btn" data-act="booster" ${a.boosterReady || !a.starter ? 'disabled' : dis()}>${a.boosterReady ? 'Booster du jour disponible' : 'Rendre le booster du jour'}</button>
      <button class="btn" data-act="shop" ${dis()}>Nouvelles cartes du jour en boutique</button>
    </div>
  </div>
  <div class="card-box">
    <div class="row"><h3 style="margin-right:auto">Collection</h3><small class="hint">${st.cards.size}/${OWNABLE.length} cartes</small></div>
    <p class="hint" style="margin:0">Cochez les cartes que le joueur possède. Les cartes de ses decks (grisées) ne peuvent pas être retirées.</p>
    ${collection}
    <div class="row"><button class="btn primary" data-act="cards" ${changed ? dis() : 'disabled'}>Enregistrer la collection</button>
      ${changed ? '<button class="btn" data-act="cards-undo">Annuler les changements</button>' : ''}</div>
  </div>
  ${artsBlock(a)}
  ${themesBlock(a)}
  <div class="card-box">
    <h3>Bienvenue des 7 jours</h3>
    <p class="hint" style="margin:0">${a.welcome ? `${a.welcome.got} cadeau${a.welcome.got > 1 ? 'x' : ''} sur ${a.welcome.steps} récupéré${a.welcome.got > 1 ? 's' : ''} · ${a.welcome.done ? 'terminée' : a.welcome.expired ? `délai passé le ${esc(a.welcome.last)}` : `jusqu'au ${esc(a.welcome.last)}${a.welcome.claimed ? ' · pris aujourd\'hui' : ''}`}`
      : 'Ce compte a été créé avant la bienvenue des 7 jours : il n\'y a pas droit.'}</p>
    <div class="row"><button class="btn" data-act="welcome" ${dis()}>${a.welcome ? 'Relancer la bienvenue depuis aujourd\'hui' : 'Offrir la bienvenue'}</button></div>
    <p class="hint" style="margin:0">Le délai repart d'aujourd'hui et les sept cadeaux redeviennent à prendre (le cadre et le titre déjà gagnés restent).</p>
  </div>
  <form class="card-box" id="pass">
    <h3>Accès</h3>
    <div class="field"><label class="eyebrow" for="p-pass">Nouveau mot de passe</label><input id="p-pass" minlength="8" required autocomplete="new-password"></div>
    <div class="row"><button class="btn primary" type="submit" ${dis()}>Changer le mot de passe</button><button class="btn" type="button" data-act="gen" data-for="p-pass">Au hasard</button></div>
    <p class="hint" style="margin:0">Changer le mot de passe ferme aussi toutes ses sessions.</p>
    <div class="row">
      <button class="btn" type="button" data-act="logout" ${a.sessions ? dis() : 'disabled'}>Fermer ses sessions</button>
      <button class="btn" type="button" data-act="disable" ${dis()}>${a.disabled ? 'Réactiver le compte' : 'Désactiver le compte'}</button>
    </div>
  </form>
  <div class="card-box danger">
    <h3>Zone sensible</h3>
    <div class="row">
      <button class="btn" data-act="reset" ${dis()}>Remettre le compte à zéro</button>
      <button class="btn bad" data-act="delete" ${dis()}>Supprimer le compte</button>
    </div>
    <p class="hint" style="margin:0">Remettre à zéro vide la collection, les Éclats et le deck : le joueur rechoisit un deck de départ. Supprimer efface tout, sans retour.</p>
  </div>`;
}

// Arts alternatifs du joueur : retirer un art, en donner un (Promo, geste commercial).
function artsBlock(a) {
  const mine = Object.keys(a.arts || {}).filter(id => ARTS[id]);
  const label = id => `${esc(ARTS[id].name)} · ${esc(nameOf(ARTS[id].card))} · ${esc(rarityName(ARTS[id]))}`;
  return `<div class="card-box">
    <div class="row"><h3 style="margin-right:auto">Arts alternatifs</h3><small class="hint">${mine.length}/${Object.keys(ARTS).length}</small></div>
    ${mine.length ? `<div class="chips">${mine.map(id => `<span class="pick on">${label(id)}${a.arts[id].gift ? ' · offert' : ''}
      <button class="btn sm" type="button" data-art-take="${id}" ${dis()}>Retirer</button></span>`).join('')}</div>` : '<p class="hint" style="margin:0">Aucun art pour l\'instant.</p>'}
    <div class="row"><select id="give-art" aria-label="Art à donner">${Object.keys(ARTS).filter(id => !a.arts?.[id]).map(id => `<option value="${id}">${label(id)}</option>`).join('')}</select>
      <button class="btn" data-act="give-art" ${dis()}>Donner cet art</button></div>
    <p class="hint" style="margin:0">Les arts Promo ne sont jamais en vente : ils se donnent d'ici.</p>
  </div>`;
}
// Thèmes de saison du joueur : en donner un pour tester avant sa saison, ou le retirer.
function themesBlock(a) {
  const mine = (a.themes || []).filter(id => THEMES[id]), other = Object.keys(THEMES).filter(id => !mine.includes(id));
  return `<div class="card-box">
    <div class="row"><h3 style="margin-right:auto">Thèmes de l'interface</h3><small class="hint">${mine.length}/${Object.keys(THEMES).length}</small></div>
    ${mine.length ? `<div class="chips">${mine.map(id => `<span class="pick on">${esc(THEMES[id])}
      <button class="btn sm" type="button" data-theme-take="${id}" ${dis()}>Retirer</button></span>`).join('')}</div>` : '<p class="hint" style="margin:0">Aucun thème pour l\'instant.</p>'}
    ${other.length ? `<div class="row"><select id="give-theme" aria-label="Thème à donner">${other.map(id => `<option value="${id}">${esc(THEMES[id])}</option>`).join('')}</select>
      <button class="btn" data-act="give-theme" ${dis()}>Donner ce thème</button></div>` : ''}
    <p class="hint" style="margin:0">Le joueur le choisit ensuite dans Personnalisation, même avant le début de sa saison.</p>
  </div>`;
}
// Catalogue des arts alternatifs : rareté, prix, nombre de joueurs qui l'ont.
function artsCatalog() {
  if (!st.arts) return '<p class="wait">Chargement des arts…</p>';
  const rows = st.arts.map(x => `<tr><td><b>${esc(x.name)}</b>${x.exists ? '' : ' <span class="chip off">carte absente</span>'}<br><small class="hint">${esc(x.id)}</small></td><td>${esc(CARDS[x.card]?.name || GENERALS[x.card]?.name || x.card)}</td>
    <td>${esc(x.rarityName)}${x.edition === 'promo' && x.how ? `<br><small class="hint">${esc(x.how)}</small>` : ''}</td>
    <td class="num">${x.price === null ? '—' : x.edition === 'essence' ? `${x.price} essence` : x.edition === 'clan' ? `${x.price} Écus` : x.edition === 'casino' ? `${x.price} Jetons` : x.price}</td><td class="num">${x.owners}</td></tr>`).join('');
  return `<div class="card-box" style="overflow-x:auto"><h2 style="font-size:20px">Catalogue des arts</h2>
    <p class="hint" style="margin:0">Les arts se déclarent dans <code>packages/engine/src/arts.js</code> et leurs images dans <code>client/src/art/alt/&lt;id&gt;/</code> ; sans image, l'appli montre un art provisoire.</p>
    <table class="admin"><thead><tr><th>Art</th><th>Carte</th><th>Rareté</th><th>Prix (Prismes, ou essence universelle pour l'édition Essence)</th><th>Joueurs</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderShopSettings() {
  const s = st.settings, d = st.defaults;
  const field = (k, label, hint) => `<div class="field"><label class="eyebrow" for="s-${k}">${label}</label>
    <input id="s-${k}" type="number" min="0" step="1" value="${s[k]}"><small class="hint">${hint} Par défaut : ${d[k]}.</small></div>`;
  return `${notice()}
  <form class="card-box" id="settings">
    <h2 style="font-size:20px">Prix de la boutique</h2>
    <div class="grid2">
      ${field('cardPrice', 'Prix d\'une carte du jour', 'En Éclats.')}
      ${field('boosterPrice', 'Prix d\'un booster du set', 'En Éclats.')}
      ${field('boosterSize', 'Cartes par booster acheté', 'Entre 1 et 10.')}
      ${field('shardsPerDuplicate', 'Éclats par doublon', 'Gagnés pour chaque carte déjà possédée. L\'essence par doublon se règle dans l\'onglet Récompenses.')}
      ${field('familyBoosterEvery', 'Booster de famille tous les', 'Boosters ouverts (quotidien, achetés, offerts) pour en gagner un, entre 0 et 100. 0 les retire. Le joueur choisit la famille ; ses cartes sortent des sets en vente.')}
    </div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer les prix</button><button class="btn" type="button" data-act="defaults">Revenir aux valeurs par défaut</button></div>
  </form>
  <form class="card-box" id="rotation">
    <h2 style="font-size:20px">Cartes du jour</h2>
    <p class="hint" style="margin:0">Chaque joueur a ses propres cartes du jour, tirées en priorité parmi celles qu'il n'a pas. Elles changent à minuit (heure de Paris).</p>
    ${field('dailyCards', 'Nombre de cartes du jour', 'Entre 1 et 10. Le changer renouvelle aussitôt les offres de tous.')}
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="renew">Renouveler les offres de tous maintenant</button></div>
    <p class="hint" style="margin:0">Renouveler tire de nouvelles cartes du jour et de nouveaux arts du jour pour tous les joueurs ; ils peuvent alors en acheter de nouveau aujourd'hui.</p>
  </form>
  <form class="card-box" id="dup-settings">
    <h2 style="font-size:20px">Doublons du jour et rayon Essence</h2>
    <p class="hint" style="margin:0">Doublons du jour (onglet Sets de la boutique) : des cartes que le joueur possède et à qui il manque encore de l'essence, celles de ses decks d'abord, renouvelées à minuit. Un doublon acheté donne l'essence d'un doublon (onglet Récompenses), sans les Éclats d'un doublon tiré.
      Rayon Essence : les arts de l'édition Essence, toujours en vente, payés en essence universelle (les doublons d'une carte qui a déjà toute l'essence de ses niveaux ; taux d'échange dans l'onglet Récompenses).</p>
    <div class="grid2">
      ${field('dupOffers', 'Doublons du jour', 'Entre 0 et 10. 0 les retire de la boutique.')}
      ${field('dupPrice', 'Prix d\'un doublon du jour', 'En Éclats.')}
      ${RARITY_IDS.map(r => field(`essArtPrice_${r}`, `Art ${ART_RARITIES[r].name.toLowerCase()} de l'édition Essence`, 'En essence universelle.')).join('')}
      ${field('essFramePrice', 'Cadre de la nébuleuse (animé)', 'En essence universelle.')}
    </div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="dup-defaults">Revenir aux valeurs par défaut</button></div>
  </form>
  <form class="card-box" id="art-settings">
    <h2 style="font-size:20px">Arts alternatifs</h2>
    <p class="hint" style="margin:0">Payés en Prismes, la monnaie rare gagnée en fin de saison classée, avec les succès et le calendrier du mois (onglet Récompenses). Les coffres offerts (succès rares, dimanches du calendrier) s'ouvrent sans Prismes. Chaque joueur a ses arts du jour, tirés selon leur rareté parmi ceux qu'il n'a pas (ceux de ses cartes trois fois plus souvent). Le coffre donne un art qu'il n'a pas, avec les mêmes chances.</p>
    <div class="grid2">
      ${field('artOffers', 'Arts du jour', 'Entre 0 et 12.')}
      ${field('chestPrice', 'Prix du coffre', 'En Prismes.')}
      ${RARITY_IDS.map(r => field(`artPrice_${r}`, `Prix d'un art ${ART_RARITIES[r].name.toLowerCase()}`, 'En Prismes.')).join('')}
      ${field('prismShards', 'Éclats par Prisme changé', 'Base des offres fixes du change (10, 30, 60 et 120 Prismes, avec 0, 10, 20 et 30 % de bonus). Change à sens unique. 0 le ferme.')}
    </div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="art-defaults">Revenir aux valeurs par défaut</button></div>
  </form>
  ${artsCatalog()}`;
}

function render() {
  const unlocked = !!st.accounts;
  const tabs = unlocked ? `<button class="btn" data-act="lock">Verrouiller</button>
    <div class="seg tabs">${Object.entries(TABS).map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '';
  const body = !unlocked ? `<form class="card-box" id="unlock">
      <div class="field"><label class="eyebrow" for="key">Clé d'administration (ADMIN_KEY)</label><input id="key" type="password" value="${esc(st.key)}" required></div>
      ${st.err ? `<p class="err" style="margin:0">${esc(st.err)}</p>` : ''}
      <div class="row"><button class="btn primary" type="submit">Ouvrir</button></div></form>`
    : st.tab === 'shop' ? renderShopSettings() : st.tab === 'rewards' ? rewards.render() : st.tab === 'events' ? events.render() : st.tab === 'boss' ? boss.render() : st.tab === 'story' ? story.render() : st.tab === 'mail' ? mail.render() : st.tab === 'bugs' ? bugs.render() : st.tab === 'news' ? news.render() : st.tab === 'stats' ? stats.render() : st.tab === 'follow' ? follow.render() : st.tab === 'cards' ? cards.renderCards()
    : st.tab === 'sets' ? cards.renderSets() : st.sel && st.detail ? renderDetail() : renderList();
  app.innerHTML = `<div class="top"><span class="title">Administration</span>${tabs}</div>${body}`;
}

app.addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => document.getElementById(id).value;
  const id = e.target.id;
  if (id === 'unlock') { st.key = v('key'); refresh(); return; }
  if (cards.onSubmit(id) || rewards.onSubmit(id) || mail.onSubmit(id) || news.onSubmit(id)) return;
  if (id === 'create') {
    const password = v('password');
    try {
      const r = await adminCall('POST', '/api/admin/accounts', { login: v('login'), password, name: v('name'), create: true });
      say(`Compte créé : identifiant <b>${esc(r.account.login)}</b>, mot de passe <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`);
      await refresh();
    } catch (err) { say('', err.message); render(); }
    return;
  }
  if (id === 'preview') {
    const day = v('p-preview');
    act('/api/admin/account/update', { preview: day }, day ? `Compte de test : il voit le jeu au ${esc(day)}.` : 'Ce compte revient au jour réel.'); return;
  }
  if (id === 'profile') { act('/api/admin/account/update', { name: v('p-name'), shards: Number(v('p-shards')), prisms: Number(v('p-prisms')), uniEssence: Number(v('p-uni')), level: Number(v('p-level')), freeBoosters: Number(v('p-free')), familyBoosters: Number(v('p-family')), freeChests: Number(v('p-chests')) }, 'Profil enregistré.'); return; }
  if (id === 'pass') {
    const password = v('p-pass');
    try {
      await adminCall('POST', '/api/admin/accounts', { login: st.sel, password, name: st.detail.name });
      setDetail((await adminCall('GET', `/api/admin/account?login=${encodeURIComponent(st.sel)}`)).account);
      say(`Mot de passe changé : <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`);
    } catch (err) { say('', err.message); }
    render(); return;
  }
  if (id === 'settings' || id === 'rotation' || id === 'art-settings' || id === 'dup-settings') {
    const keys = id === 'settings' ? ['cardPrice', 'boosterPrice', 'boosterSize', 'shardsPerDuplicate', 'familyBoosterEvery'] : id === 'rotation' ? ['dailyCards'] : id === 'dup-settings' ? DUP_KEYS : ART_KEYS;
    saveSettings(Object.fromEntries(keys.map(k => [k, Number(v(`s-${k}`))])), 'Réglages enregistrés.');
  }
});
const ART_KEYS = ['artOffers', 'chestPrice', ...RARITY_IDS.map(r => `artPrice_${r}`), 'prismShards'];
const DUP_KEYS = ['dupOffers', 'dupPrice', ...RARITY_IDS.map(r => `essArtPrice_${r}`), 'essFramePrice'];
async function loadArts() {
  try { st.arts = (await adminCall('GET', '/api/admin/arts')).arts; } catch (e) { say('', e.message); }
  render();
}
async function saveSettings(body, okMsg) {
  try { const r = await adminCall('POST', '/api/admin/settings', body); st.settings = r.settings; say(okMsg); }
  catch (e) { say('', e.message); }
  render();
}

app.addEventListener('click', e => {
  const t = e.target.closest('button, tr[data-open]');
  if (!t) return;
  if (t.dataset.open) { openAccount(t.dataset.open); return; }
  if (t.dataset.tab) {
    st.tab = t.dataset.tab; st.sel = null; st.detail = null; say('');
    if (st.tab === 'stats') stats.load(); else if (st.tab === 'follow') follow.load(); else if (st.tab === 'shop') loadArts(); else if (st.tab === 'rewards') rewards.load(); else if (st.tab === 'mail') mail.load(); else if (st.tab === 'bugs') bugs.load(); else if (st.tab === 'news') news.load(); else if (st.tab === 'events') events.load(); else if (st.tab === 'boss') boss.load(); else if (st.tab === 'story') story.load(); else if ((st.tab === 'cards' || st.tab === 'sets') && !cards.loaded()) cards.load();
    render(); return;
  }
  if (stats.onClick(t) || follow.onClick(t) || cards.onClick(t) || rewards.onClick(t) || mail.onClick(t) || bugs.onClick(t) || news.onClick(t) || events.onClick(t) || boss.onClick(t) || story.onClick(t)) return;
  if (t.dataset.themeTake) { act('/api/admin/account/theme', { theme: t.dataset.themeTake, give: false }, 'Thème retiré.'); return; }
  if (t.dataset.artTake) { act('/api/admin/account/art', { art: t.dataset.artTake, give: false }, 'Art retiré.'); return; }
  if (t.dataset.previewDay) { document.getElementById('p-preview').value = t.dataset.previewDay; return; }
  if (t.dataset.addShards) { const i = document.getElementById('p-shards'); i.value = (Number(i.value) || 0) + Number(t.dataset.addShards); return; }
  const fam = t.dataset.famAll || t.dataset.famNone;
  if (fam) {
    const locked = new Set(st.detail.inDecks || st.detail.deck?.cards || []);
    for (const id of OWNABLE) if (famOf(id) === fam && !locked.has(id)) t.dataset.famAll ? st.cards.add(id) : st.cards.delete(id);
    render(); return;
  }
  const a = st.detail;
  switch (t.dataset.act) {
    case 'gen': {
      const words = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint32Array(8));
      document.getElementById(t.dataset.for).value = Array.from(r, n => words[n % words.length]).join('');
      break;
    }
    case 'lock': st.accounts = null; st.key = ''; try { sessionStorage.removeItem(KEY); } catch { /* rien */ } say(''); render(); break;
    case 'back': st.sel = null; st.detail = null; say(''); render(); break;
    case 'starter': {
      const s = document.getElementById('starter').value;
      if (a.starter && !confirm(`Remplacer le deck joué de ${a.login} par « ${DECKS[s].name} » ?`)) break;
      act('/api/admin/account/starter', { starter: s }, `Deck de départ : ${esc(DECKS[s].name)}.`); break;
    }
    case 'booster': act('/api/admin/account/booster', {}, 'Le booster du jour est de nouveau disponible.'); break;
    case 'welcome':
      if (!a.welcome || confirm(`Relancer la bienvenue de ${a.login} ? Les sept cadeaux redeviennent à prendre.`)) act('/api/admin/account/welcome', {}, 'Bienvenue des 7 jours lancée pour ce compte.');
      break;
    case 'shop': act('/api/admin/account/shop', {}, 'Nouvelles cartes du jour tirées pour ce joueur.'); break;
    case 'cards': act('/api/admin/account/cards', { cards: [...st.cards] }, 'Collection enregistrée.'); break;
    case 'cards-undo': st.cards = new Set(a.owned); render(); break;
    case 'logout': act('/api/admin/account/logout', {}, 'Sessions fermées : le joueur devra se reconnecter.'); break;
    case 'preview-off': act('/api/admin/account/update', { preview: '' }, 'Ce compte revient au jour réel.'); break;
    case 'disable': act('/api/admin/account/update', { disabled: !a.disabled }, a.disabled ? 'Compte réactivé.' : 'Compte désactivé : le joueur ne peut plus se connecter.'); break;
    case 'reset':
      if (confirm(`Remettre ${a.login} à zéro ? Sa collection, ses Éclats et son deck seront effacés.`)) act('/api/admin/account/reset', {}, 'Compte remis à zéro.');
      break;
    case 'delete':
      if (prompt(`Pour supprimer définitivement ce compte, tapez son identifiant : ${a.login}`) === a.login) {
        adminCall('POST', '/api/admin/account/delete', { login: a.login })
          .then(async () => { st.sel = null; st.detail = null; say(`Compte ${esc(a.login)} supprimé.`); await refresh(); })
          .catch(err => { say('', err.message); render(); });
      }
      break;
    case 'defaults': {
      const { cardPrice, boosterPrice, boosterSize, shardsPerDuplicate, familyBoosterEvery } = st.defaults;
      saveSettings({ cardPrice, boosterPrice, boosterSize, shardsPerDuplicate, familyBoosterEvery }, 'Prix remis par défaut.'); break;
    }
    case 'give-art': { const id = document.getElementById('give-art')?.value; if (id) act('/api/admin/account/art', { art: id, give: true }, `Art « ${esc(ARTS[id].name)} » donné.`); break; }
    case 'give-theme': { const id = document.getElementById('give-theme')?.value; if (id) act('/api/admin/account/theme', { theme: id, give: true }, `Thème « ${esc(THEMES[id])} » donné.`); break; }
    case 'dup-defaults': saveSettings(Object.fromEntries(DUP_KEYS.map(k => [k, st.defaults[k]])), 'Doublons du jour et arts de l\'essence remis par défaut.'); break;
    case 'art-defaults': saveSettings(Object.fromEntries(ART_KEYS.map(k => [k, st.defaults[k]])), 'Prix des arts remis par défaut.'); break;
    case 'renew':
      if (confirm('Tirer de nouvelles cartes du jour pour tous les joueurs ?')) saveSettings({ renew: true }, 'Offres du jour renouvelées pour tous.');
      break;
  }
});
app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.open) openAccount(e.target.dataset.open); });
app.addEventListener('input', e => {
  if (cards.onInput(e) || events.onInput(e) || boss.onInput(e) || story.onInput(e)) return;
  if (e.target.id === 'q') { st.q = e.target.value; const pos = e.target.selectionStart; render(); const q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos); }
});
app.addEventListener('change', e => {
  if (stats.onChange(e) || cards.onChange(e) || events.onInput(e) || boss.onInput(e) || story.onInput(e)) return;
  const id = e.target.dataset?.card; if (!id) return;
  e.target.checked ? st.cards.add(id) : st.cards.delete(id);
  render();
});
st.key ? refresh() : render();
