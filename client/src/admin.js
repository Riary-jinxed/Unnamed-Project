// Page d'administration : créer les comptes des joueurs et changer leurs mots de passe.
// Protégée par la clé ADMIN_KEY du serveur, gardée dans ce navigateur seulement.
import './style.css';
import { DECKS } from '@jeu/engine';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'jeu-admin-key';
const st = { key: (() => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } })(), accounts: null, msg: '', err: '' };

async function adminCall(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-admin-key': st.key }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur du serveur.');
  return data;
}
async function refresh() {
  try { st.accounts = (await adminCall('GET', '/api/admin/accounts')).accounts; st.err = ''; try { sessionStorage.setItem(KEY, st.key); } catch { /* stockage indisponible */ } }
  catch (e) { st.accounts = null; st.err = e.message; }
  render();
}
function render() {
  const rows = (st.accounts || []).sort((a, b) => a.login.localeCompare(b.login)).map(a => `<tr>
    <td><b>${esc(a.login)}</b></td><td>${esc(a.name)}</td><td>${a.starter ? esc(DECKS[a.starter].name) : '—'}</td>
    <td class="num">${a.cards}</td><td class="num">${a.shards}</td><td>${a.lastBooster || '—'}</td></tr>`).join('');
  app.innerHTML = `<div class="top"><span class="title">Comptes des joueurs</span></div>
  ${st.accounts ? `
  <form class="card-box" id="create">
    <h2 style="font-size:20px">Créer un compte ou changer un mot de passe</h2>
    <p class="hint" style="margin:0">Si l'identifiant existe déjà, son mot de passe est remplacé et ses sessions sont fermées ; sa collection est gardée.</p>
    <div class="field"><label class="eyebrow" for="login">Identifiant</label><input id="login" autocapitalize="none" spellcheck="false" required></div>
    <div class="field"><label class="eyebrow" for="name">Pseudo affiché en partie</label><input id="name" maxlength="20" placeholder="Par défaut : l'identifiant"></div>
    <div class="field"><label class="eyebrow" for="password">Mot de passe</label><input id="password" required minlength="4" autocomplete="new-password"></div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" id="gen">Mot de passe au hasard</button></div>
    ${st.msg ? `<p style="margin:0">${st.msg}</p>` : ''}${st.err ? `<p class="err" style="margin:0">${esc(st.err)}</p>` : ''}
  </form>
  <div class="card-box" style="overflow-x:auto"><table class="admin"><thead><tr><th>Identifiant</th><th>Pseudo</th><th>Deck de départ</th><th>Cartes</th><th>Éclats</th><th>Dernier booster</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="hint">Aucun compte pour l\'instant.</td></tr>'}</tbody></table></div>`
  : `<form class="card-box" id="unlock">
    <div class="field"><label class="eyebrow" for="key">Clé d'administration (ADMIN_KEY)</label><input id="key" type="password" value="${esc(st.key)}" required></div>
    ${st.err ? `<p class="err" style="margin:0">${esc(st.err)}</p>` : ''}
    <div class="row"><button class="btn primary" type="submit">Ouvrir</button></div></form>`}
  <style>.admin { width: 100%; border-collapse: collapse; font-size: 14px; } .admin th, .admin td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); } .admin th { color: var(--muted); font-weight: 500; }</style>`;
}
app.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'unlock') { st.key = document.getElementById('key').value; refresh(); return; }
  const v = id => document.getElementById(id).value;
  const login = v('login'), password = v('password');
  try {
    const r = await adminCall('POST', '/api/admin/accounts', { login, password, name: v('name') });
    st.msg = `${r.created ? 'Compte créé' : 'Mot de passe changé'} : identifiant <b>${esc(r.account.login)}</b>, mot de passe <b>${esc(password)}</b>. Notez-le pour le communiquer au joueur.`;
    st.err = ''; await refresh();
  } catch (err) { st.err = err.message; st.msg = ''; render(); }
});
app.addEventListener('click', e => {
  if (e.target.id !== 'gen') return;
  const words = 'abcdefghjkmnpqrstuvwxyz23456789', a = crypto.getRandomValues(new Uint32Array(8));
  document.getElementById('password').value = Array.from(a, n => words[n % words.length]).join('');
});
st.key ? refresh() : render();
