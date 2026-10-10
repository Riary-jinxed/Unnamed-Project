// Page d'administration : comptes des joueurs (création, profil, Éclats, collection, deck, accès), statistiques des parties,
// éditeur de cartes et de sets (brouillon puis publication) et réglages de la boutique.
// Protégée par la clé ADMIN_KEY du serveur, gardée dans ce navigateur seulement.
import './style.css';
import { DECKS, CARDS, GENERALS, TERRAINS, FAMILIES } from '@jeu/engine';
import { STARTERS, OWNABLE } from '@jeu/engine/collection';
import { applyCatalog } from '@jeu/engine/catalog';
import { statsTab } from './admin-stats.js';
import { esc, famStyle } from './common.js';
import { cardsTab } from './admin-cards.js';
import { rewardsTab } from './admin-rewards.js';
import { ARTS, ART_RARITIES, RARITY_IDS, rarityName } from '@jeu/engine/arts';

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
const TABS = { accounts: 'Comptes', stats: 'Stats', cards: 'Cartes', sets: 'Sets', shop: 'Boutique', rewards: 'Récompenses' };
const tabCtx = { call: adminCall, render: () => render(), say, esc: s => esc(s), notice: () => notice() };
const stats = statsTab(tabCtx), rewards = rewardsTab(tabCtx);
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

function renderList() {
  const q = st.q.trim().toLowerCase();
  const list = st.accounts.slice().sort((a, b) => a.login.localeCompare(b.login)).filter(a => !q || a.login.includes(q) || a.name.toLowerCase().includes(q));
  const rows = list.map(a => `<tr data-open="${esc(a.login)}" tabindex="0">
    <td><b>${esc(a.login)}</b>${a.disabled ? ' <span class="chip off">désactivé</span>' : ''}</td><td>${esc(a.name)}</td><td>${a.starter ? esc(DECKS[a.starter].name) : '—'}</td>
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
    <div class="field"><label class="eyebrow" for="password">Mot de passe</label><input id="password" required minlength="4" autocomplete="new-password"></div>
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
    <div class="row"><h2 style="font-size:24px;margin-right:auto">${esc(a.login)}</h2>${a.disabled ? '<span class="chip off">Désactivé</span>' : '<span class="chip">Actif</span>'}</div>
    <p class="hint" style="margin:0">Créé le ${a.created ? new Date(a.created).toLocaleDateString('fr-FR') : '—'} · ${a.sessions} session${a.sessions > 1 ? 's' : ''} ouverte${a.sessions > 1 ? 's' : ''} · ${a.cards} cartes</p>
    ${notice()}
  </div>
  <form class="card-box" id="profile">
    <h3>Profil, Éclats et niveau</h3>
    <div class="grid2">
      <div class="field"><label class="eyebrow" for="p-name">Pseudo</label><input id="p-name" maxlength="20" value="${esc(a.name)}"></div>
      <div class="field"><label class="eyebrow" for="p-shards">Éclats</label><input id="p-shards" type="number" min="0" step="1" value="${a.shards}"></div>
      <div class="field"><label class="eyebrow" for="p-level">Niveau</label><input id="p-level" type="number" min="1" step="1" value="${a.level}">
        <small class="hint">${a.xp} XP dans ce niveau. Changer le niveau ne donne pas les récompenses des niveaux sautés.</small></div>
      <div class="field"><label class="eyebrow" for="p-free">Boosters offerts à ouvrir</label><input id="p-free" type="number" min="0" step="1" value="${a.freeBoosters}"></div>
    </div>
    <div class="row"><button class="btn primary" type="submit" ${dis()}>Enregistrer</button>
      <span class="hint">Ajouter :</span>${[100, 300, 1000].map(n => `<button class="btn sm" type="button" data-add-shards="${n}">+${n}</button>`).join('')}</div>
  </form>
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
  <form class="card-box" id="pass">
    <h3>Accès</h3>
    <div class="field"><label class="eyebrow" for="p-pass">Nouveau mot de passe</label><input id="p-pass" minlength="4" required autocomplete="new-password"></div>
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
    ${mine.length ? `<div class="chips">${mine.map(id => `<span class="pick on">${label(id)}${a.arts[id].n ? ` · n° ${a.arts[id].n}` : ''}${a.arts[id].gift ? ' · offert' : ''}
      <button class="btn sm" type="button" data-art-take="${id}" ${dis()}>Retirer</button></span>`).join('')}</div>` : '<p class="hint" style="margin:0">Aucun art pour l\'instant.</p>'}
    <div class="row"><select id="give-art" aria-label="Art à donner">${Object.keys(ARTS).filter(id => !a.arts?.[id]).map(id => `<option value="${id}">${label(id)}</option>`).join('')}</select>
      <button class="btn" data-act="give-art" ${dis()}>Donner cet art</button></div>
    <p class="hint" style="margin:0">Les arts Promo ne sont jamais en vente : ils se donnent d'ici. Une Limited donnée ne compte pas dans son stock et n'a pas de numéro.</p>
  </div>`;
}
// Catalogue des arts alternatifs : rareté, prix, ventes des Limited, nombre de joueurs qui l'ont.
function artsCatalog() {
  if (!st.arts) return '<p class="wait">Chargement des arts…</p>';
  const rows = st.arts.map(x => `<tr><td><b>${esc(x.name)}</b>${x.exists ? '' : ' <span class="chip off">carte absente</span>'}<br><small class="hint">${esc(x.id)}</small></td><td>${esc(CARDS[x.card]?.name || GENERALS[x.card]?.name || x.card)}</td>
    <td>${esc(x.rarityName)}${x.edition === 'limited' ? `<br><small class="hint">${x.from || '…'} → ${x.until || '…'}</small>` : x.edition === 'promo' && x.how ? `<br><small class="hint">${esc(x.how)}</small>` : ''}</td>
    <td class="num">${x.price === null ? '—' : x.price}</td><td class="num">${x.sold === null ? '—' : `${x.sold}/${x.stock}`}</td><td class="num">${x.owners}</td></tr>`).join('');
  return `<div class="card-box" style="overflow-x:auto"><h2 style="font-size:20px">Catalogue des arts</h2>
    <p class="hint" style="margin:0">Les arts se déclarent dans <code>packages/engine/src/arts.js</code> et leurs images dans <code>client/src/art/alt/&lt;id&gt;/</code> ; sans image, l'appli montre un art provisoire.</p>
    <table class="admin"><thead><tr><th>Art</th><th>Carte</th><th>Rareté</th><th>Prix</th><th>Vendus</th><th>Joueurs</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  <form class="card-box" id="art-settings">
    <h2 style="font-size:20px">Arts alternatifs</h2>
    <p class="hint" style="margin:0">Chaque joueur a ses arts du jour, tirés selon leur rareté parmi ceux qu'il n'a pas (ceux de ses cartes trois fois plus souvent). Le coffre donne un art qu'il n'a pas, avec les mêmes chances. Les Limited ont leur propre prix et leur stock, dans le catalogue.</p>
    <div class="grid2">
      ${field('artOffers', 'Arts du jour', 'Entre 0 et 12.')}
      ${field('chestPrice', 'Prix du coffre', 'En Éclats.')}
      ${RARITY_IDS.map(r => field(`artPrice_${r}`, `Prix d'un art ${ART_RARITIES[r].name.toLowerCase()}`, 'En Éclats.')).join('')}
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
    : st.tab === 'shop' ? renderShopSettings() : st.tab === 'rewards' ? rewards.render() : st.tab === 'stats' ? stats.render() : st.tab === 'cards' ? cards.renderCards()
    : st.tab === 'sets' ? cards.renderSets() : st.sel && st.detail ? renderDetail() : renderList();
  app.innerHTML = `<div class="top"><span class="title">Administration</span>${tabs}</div>${body}`;
}

app.addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => document.getElementById(id).value;
  const id = e.target.id;
  if (id === 'unlock') { st.key = v('key'); refresh(); return; }
  if (cards.onSubmit(id) || rewards.onSubmit(id)) return;
  if (id === 'create') {
    const password = v('password');
    try {
      const r = await adminCall('POST', '/api/admin/accounts', { login: v('login'), password, name: v('name'), create: true });
      say(`Compte créé : identifiant <b>${esc(r.account.login)}</b>, mot de passe <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`);
      await refresh();
    } catch (err) { say('', err.message); render(); }
    return;
  }
  if (id === 'profile') { act('/api/admin/account/update', { name: v('p-name'), shards: Number(v('p-shards')), level: Number(v('p-level')), freeBoosters: Number(v('p-free')) }, 'Profil enregistré.'); return; }
  if (id === 'pass') {
    const password = v('p-pass');
    try {
      await adminCall('POST', '/api/admin/accounts', { login: st.sel, password, name: st.detail.name });
      setDetail((await adminCall('GET', `/api/admin/account?login=${encodeURIComponent(st.sel)}`)).account);
      say(`Mot de passe changé : <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`);
    } catch (err) { say('', err.message); }
    render(); return;
  }
  if (id === 'settings' || id === 'rotation' || id === 'art-settings') {
    const keys = id === 'settings' ? ['cardPrice', 'boosterPrice', 'boosterSize', 'shardsPerDuplicate'] : id === 'rotation' ? ['dailyCards'] : ART_KEYS;
    saveSettings(Object.fromEntries(keys.map(k => [k, Number(v(`s-${k}`))])), 'Réglages enregistrés.');
  }
});
const ART_KEYS = ['artOffers', 'chestPrice', ...RARITY_IDS.map(r => `artPrice_${r}`)];
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
    if (st.tab === 'stats') stats.load(); else if (st.tab === 'shop') loadArts(); else if (st.tab === 'rewards') rewards.load(); else if ((st.tab === 'cards' || st.tab === 'sets') && !cards.loaded()) cards.load();
    render(); return;
  }
  if (stats.onClick(t) || cards.onClick(t) || rewards.onClick(t)) return;
  if (t.dataset.artTake) { act('/api/admin/account/art', { art: t.dataset.artTake, give: false }, 'Art retiré.'); return; }
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
    case 'shop': act('/api/admin/account/shop', {}, 'Nouvelles cartes du jour tirées pour ce joueur.'); break;
    case 'cards': act('/api/admin/account/cards', { cards: [...st.cards] }, 'Collection enregistrée.'); break;
    case 'cards-undo': st.cards = new Set(a.owned); render(); break;
    case 'logout': act('/api/admin/account/logout', {}, 'Sessions fermées : le joueur devra se reconnecter.'); break;
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
      const { cardPrice, boosterPrice, boosterSize, shardsPerDuplicate } = st.defaults;
      saveSettings({ cardPrice, boosterPrice, boosterSize, shardsPerDuplicate }, 'Prix remis par défaut.'); break;
    }
    case 'give-art': { const id = document.getElementById('give-art')?.value; if (id) act('/api/admin/account/art', { art: id, give: true }, `Art « ${esc(ARTS[id].name)} » donné.`); break; }
    case 'art-defaults': saveSettings(Object.fromEntries(ART_KEYS.map(k => [k, st.defaults[k]])), 'Prix des arts remis par défaut.'); break;
    case 'renew':
      if (confirm('Tirer de nouvelles cartes du jour pour tous les joueurs ?')) saveSettings({ renew: true }, 'Offres du jour renouvelées pour tous.');
      break;
  }
});
app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.open) openAccount(e.target.dataset.open); });
app.addEventListener('input', e => {
  if (cards.onInput(e)) return;
  if (e.target.id === 'q') { st.q = e.target.value; const pos = e.target.selectionStart; render(); const q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos); }
});
app.addEventListener('change', e => {
  if (stats.onChange(e) || cards.onChange(e)) return;
  const id = e.target.dataset?.card; if (!id) return;
  e.target.checked ? st.cards.add(id) : st.cards.delete(id);
  render();
});
st.key ? refresh() : render();
