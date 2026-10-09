// Page d'administration : comptes des joueurs (création, profil, Éclats, collection, deck, accès), statistiques des parties,
// éditeur de cartes et de sets (brouillon puis publication) et réglages de la boutique.
// Protégée par la clé ADMIN_KEY du serveur, gardée dans ce navigateur seulement.
import './style.css';
import { DECKS, CARDS, GENERALS, TERRAINS, FAMILIES } from '@jeu/engine';
import { STARTERS, COLLECTIBLE } from '@jeu/engine/collection';
import { applyCatalog } from '@jeu/engine/catalog';
import { statsTab } from './admin-stats.js';
import { cardsTab } from './admin-cards.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'jeu-admin-key';
const FAM = { 'Ange': '--f-ange', 'Démon': '--f-demon', 'Gobelin': '--f-gobelin', 'Elfe': '--f-elfe', 'Dragon': '--f-dragon' };
const famOf = id => CARDS[id].kw.find(k => FAMILIES.includes(k)) || 'Neutre';
const st = {
  key: (() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } })(),
  tab: 'accounts', accounts: null, q: '', sel: null, detail: null, cards: null, settings: null, defaults: null, msg: '', err: '', busy: false,
};

async function adminCall(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-admin-key': st.key }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur du serveur.');
  return data;
}
const say = (msg, err = '') => { st.msg = msg; st.err = err; };
const TABS = { accounts: 'Comptes', stats: 'Stats', cards: 'Cartes', sets: 'Sets', shop: 'Boutique' };
const tabCtx = { call: adminCall, render: () => render(), say, esc: s => esc(s), notice: () => notice() };
const stats = statsTab(tabCtx);
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
    <td class="num">${a.cards}</td><td class="num">${a.shards}</td><td>${a.lastBooster || '—'}</td><td class="num">${a.sessions}</td></tr>`).join('');
  return `${notice()}
  <div class="card-box" style="overflow-x:auto">
    <div class="row"><h2 style="font-size:20px;margin-right:auto">${st.accounts.length} compte${st.accounts.length > 1 ? 's' : ''}</h2>
      <input id="q" type="search" placeholder="Chercher un joueur" value="${esc(st.q)}" style="max-width:220px"></div>
    <table class="admin"><thead><tr><th>Identifiant</th><th>Pseudo</th><th>Deck de départ</th><th>Cartes</th><th>Éclats</th><th>Dernier booster</th><th>Sessions</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="hint">${q ? 'Aucun compte ne correspond.' : 'Aucun compte pour l\'instant.'}</td></tr>`}</tbody></table>
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
  for (const id of COLLECTIBLE) (byFam[famOf(id)] ||= []).push(id);
  const collection = [...FAMILIES, 'Neutre'].filter(f => byFam[f]).map(f => {
    const ids = byFam[f], n = ids.filter(id => st.cards.has(id)).length;
    return `<div class="famblock" style="--fam: var(${FAM[f] || '--f-neutre'})"><div class="row"><b style="margin-right:auto">${f}</b><small class="hint">${n}/${ids.length}</small>
      <button class="btn sm" type="button" data-fam-all="${f}">Tout</button><button class="btn sm" type="button" data-fam-none="${f}">Rien</button></div>
      <div class="chips">${ids.map(id => `<label class="pick ${st.cards.has(id) ? 'on' : ''} ${inDeck.has(id) ? 'lock' : ''}" title="${inDeck.has(id) ? 'Dans un deck du joueur' : ''}">
        <input type="checkbox" data-card="${id}" ${st.cards.has(id) ? 'checked' : ''} ${inDeck.has(id) ? 'disabled' : ''}>${esc(CARDS[id].name)}</label>`).join('')}</div></div>`;
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
    <h3>Profil et Éclats</h3>
    <div class="grid2">
      <div class="field"><label class="eyebrow" for="p-name">Pseudo</label><input id="p-name" maxlength="20" value="${esc(a.name)}"></div>
      <div class="field"><label class="eyebrow" for="p-shards">Éclats</label><input id="p-shards" type="number" min="0" step="1" value="${a.shards}"></div>
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
    <div class="row"><h3 style="margin-right:auto">Collection</h3><small class="hint">${st.cards.size}/${COLLECTIBLE.length} cartes</small></div>
    <p class="hint" style="margin:0">Cochez les cartes que le joueur possède. Les cartes de ses decks (grisées) ne peuvent pas être retirées.</p>
    ${collection}
    <div class="row"><button class="btn primary" data-act="cards" ${changed ? dis() : 'disabled'}>Enregistrer la collection</button>
      ${changed ? '<button class="btn" data-act="cards-undo">Annuler les changements</button>' : ''}</div>
  </div>
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
      ${field('shardsPerDuplicate', 'Éclats par doublon', 'Gagnés pour chaque carte déjà possédée.')}
    </div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer les prix</button><button class="btn" type="button" data-act="defaults">Revenir aux valeurs par défaut</button></div>
  </form>
  <form class="card-box" id="rotation">
    <h2 style="font-size:20px">Cartes du jour</h2>
    <p class="hint" style="margin:0">Chaque joueur a ses propres cartes du jour, tirées en priorité parmi celles qu'il n'a pas. Elles changent à minuit (heure de Paris).</p>
    ${field('dailyCards', 'Nombre de cartes du jour', 'Entre 1 et 10. Le changer renouvelle aussitôt les offres de tous.')}
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="renew">Renouveler les offres de tous maintenant</button></div>
    <p class="hint" style="margin:0">Renouveler tire de nouvelles cartes du jour pour tous les joueurs ; ils peuvent alors en acheter de nouveau aujourd'hui.</p>
  </form>`;
}

function render() {
  const unlocked = !!st.accounts;
  const tabs = unlocked ? `<button class="btn" data-act="lock">Verrouiller</button>
    <div class="seg tabs">${Object.entries(TABS).map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '';
  const body = !unlocked ? `<form class="card-box" id="unlock">
      <div class="field"><label class="eyebrow" for="key">Clé d'administration (ADMIN_KEY)</label><input id="key" type="password" value="${esc(st.key)}" required></div>
      ${st.err ? `<p class="err" style="margin:0">${esc(st.err)}</p>` : ''}
      <div class="row"><button class="btn primary" type="submit">Ouvrir</button></div></form>`
    : st.tab === 'shop' ? renderShopSettings() : st.tab === 'stats' ? stats.render() : st.tab === 'cards' ? cards.renderCards()
    : st.tab === 'sets' ? cards.renderSets() : st.sel && st.detail ? renderDetail() : renderList();
  app.innerHTML = `<div class="top"><span class="title">Administration</span>${tabs}</div>${body}`;
}

app.addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => document.getElementById(id).value;
  const id = e.target.id;
  if (id === 'unlock') { st.key = v('key'); refresh(); return; }
  if (cards.onSubmit(id)) return;
  if (id === 'create') {
    const password = v('password');
    try {
      const r = await adminCall('POST', '/api/admin/accounts', { login: v('login'), password, name: v('name'), create: true });
      say(`Compte créé : identifiant <b>${esc(r.account.login)}</b>, mot de passe <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`);
      await refresh();
    } catch (err) { say('', err.message); render(); }
    return;
  }
  if (id === 'profile') { act('/api/admin/account/update', { name: v('p-name'), shards: Number(v('p-shards')) }, 'Profil enregistré.'); return; }
  if (id === 'pass') {
    const password = v('p-pass');
    try {
      await adminCall('POST', '/api/admin/accounts', { login: st.sel, password, name: st.detail.name });
      setDetail((await adminCall('GET', `/api/admin/account?login=${encodeURIComponent(st.sel)}`)).account);
      say(`Mot de passe changé : <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`);
    } catch (err) { say('', err.message); }
    render(); return;
  }
  if (id === 'settings' || id === 'rotation') {
    const keys = id === 'settings' ? ['cardPrice', 'boosterPrice', 'boosterSize', 'shardsPerDuplicate'] : ['dailyCards'];
    saveSettings(Object.fromEntries(keys.map(k => [k, Number(v(`s-${k}`))])), 'Réglages enregistrés.');
  }
});
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
    if (st.tab === 'stats') stats.load(); else if ((st.tab === 'cards' || st.tab === 'sets') && !cards.loaded()) cards.load();
    render(); return;
  }
  if (stats.onClick(t) || cards.onClick(t)) return;
  if (t.dataset.addShards) { const i = document.getElementById('p-shards'); i.value = (Number(i.value) || 0) + Number(t.dataset.addShards); return; }
  const fam = t.dataset.famAll || t.dataset.famNone;
  if (fam) {
    const locked = new Set(st.detail.inDecks || st.detail.deck?.cards || []);
    for (const id of COLLECTIBLE) if (famOf(id) === fam && !locked.has(id)) t.dataset.famAll ? st.cards.add(id) : st.cards.delete(id);
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
