// Onglet Nouveautés de /admin : annonces des mises à jour majeures, des nouveaux sets et du prochain set, programmables à l'avance.
import { SETS } from '@jeu/engine/collection';

const frDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function newsTab({ call, render, say, esc, notice }) {
  const S = { data: null, err: '', busy: false, edit: null };
  async function load() {
    try { S.data = await call('GET', '/api/admin/news'); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  // Chaque affichage réécrit la page : ce qui est saisi est remis en place, sauf après un enregistrement réussi.
  const snapshot = () => [...document.querySelectorAll('#news-form [id]')].map(el => [el.id, el.type === 'checkbox' ? el.checked : el.value]);
  const restore = snap => { for (const [id, v] of snap) { const el = document.getElementById(id); if (el) el[el.type === 'checkbox' ? 'checked' : 'value'] = v; } };
  async function post(path, body, msg, { clear = false } = {}) {
    const snap = snapshot();
    S.busy = true; render(); restore(snap);
    let ok = false;
    try { S.data = await call('POST', path, body); say(msg); ok = true; } catch (e) { say('', e.message); }
    S.busy = false;
    if (ok && clear) S.edit = null;
    render();
    if (!(ok && clear)) restore(snap);
  }
  const dis = () => (S.busy ? 'disabled' : '');

  function form(D) {
    const p = S.edit || {}, en = p.en || {}, v = x => esc(x ?? '');
    return `<form class="card-box" id="news-form">
      <h2 style="font-size:20px">${p.id ? 'Modifier l\'annonce' : 'Nouvelle annonce'}</h2>
      <p class="hint" style="margin:0">Elle paraît dans l'écran Nouveautés de l'appli, avec un bandeau « À la une » sur l'accueil tant que le joueur ne l'a pas vue.
        Un jour de parution plus tard la programme : elle reste cachée jusque-là.</p>
      <div class="grid2">
        <div class="field"><label class="eyebrow" for="nw-kind">Sorte</label><select id="nw-kind">${Object.entries(D.kinds).map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label class="eyebrow" for="nw-from">Jour de parution</label><input id="nw-from" type="date" value="${v(p.from || D.today)}"><small class="hint">Heure de Paris, dès minuit.</small></div>
        <div class="field"><label class="eyebrow" for="nw-date">Jour annoncé (compte à rebours)</label><input id="nw-date" type="date" value="${v(p.date)}"><small class="hint">Sortie d'un set ou d'une mise à jour. Vide : pas de compte à rebours.</small></div>
        <div class="field"><label class="eyebrow" for="nw-set">Set concerné</label><select id="nw-set"><option value="">Aucun</option>
          ${SETS.map(s => `<option value="${s.id}" ${p.set === s.id ? 'selected' : ''}>${esc(s.name)}${s.reveal ? ` (sortie ${esc(s.reveal)})` : ''}</option>`).join('')}</select>
          <small class="hint">Ajoute « Voir dans la boutique » une fois le set sorti.</small></div>
      </div>
      <div class="field"><label class="eyebrow" for="nw-title">Titre</label><input id="nw-title" maxlength="90" required value="${v(p.title)}"></div>
      <div class="field"><label class="eyebrow" for="nw-summary">Résumé (une ou deux phrases, montré sur l'accueil)</label><input id="nw-summary" maxlength="200" value="${v(p.summary)}"></div>
      <div class="field"><label class="eyebrow" for="nw-body">Texte complet</label><textarea id="nw-body" rows="8" maxlength="4000">${v(p.body)}</textarea>
        <small class="hint">Une ligne vide sépare les paragraphes ; des lignes qui commencent par « • » ou « - » font une liste.</small></div>
      <details ${en.title || en.summary || en.body ? 'open' : ''}><summary class="eyebrow">Version anglaise (facultative)</summary>
        <div class="field"><label class="eyebrow" for="nw-en-title">Title</label><input id="nw-en-title" maxlength="90" value="${v(en.title)}"></div>
        <div class="field"><label class="eyebrow" for="nw-en-summary">Summary</label><input id="nw-en-summary" maxlength="200" value="${v(en.summary)}"></div>
        <div class="field"><label class="eyebrow" for="nw-en-body">Text</label><textarea id="nw-en-body" rows="6" maxlength="4000">${v(en.body)}</textarea></div>
        <small class="hint">Vide : les joueurs en anglais voient le texte français.</small></details>
      <label class="check"><input id="nw-pinned" type="checkbox" ${p.pinned ? 'checked' : ''}> Épingler en tête de liste</label>
      <label class="check"><input id="nw-push" type="checkbox" ${p.push ? 'checked' : ''} ${p.pushed && p.push ? 'disabled' : ''}> Envoyer une notification le jour de parution (dès 10 h, aux joueurs qui ont activé « Nouveautés du jeu »)</label>
      <div class="row"><button class="btn primary" type="submit" ${dis()}>${p.id ? 'Enregistrer' : 'Publier'}</button>
        ${p.id ? `<button class="btn" type="button" data-news-cancel="1" ${dis()}>Annuler</button>` : ''}</div>
    </form>`;
  }

  function renderNews() {
    if (S.err) return `${notice()}<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="wait">Chargement…</p>';
    const D = S.data;
    const rows = D.posts.map(p => `<tr><td>${frDay(p.from)}<br>${p.live ? '<span class="chip ok">en ligne</span>' : '<span class="chip warn">programmée</span>'}</td>
      <td>${esc(D.kinds[p.kind] || p.kind)}${p.pinned ? '<br><small class="hint">épinglée</small>' : ''}</td>
      <td><b>${esc(p.title)}</b>${p.summary ? `<br><small class="hint">${esc(p.summary)}</small>` : ''}${p.en ? '<br><small class="hint">+ version anglaise</small>' : ''}</td>
      <td>${p.date ? frDay(p.date) : '—'}</td><td>${p.push ? (p.pushed ? 'envoyée' : 'prévue') : '—'}</td>
      <td class="num">${p.live ? `${p.read}/${p.players}` : '—'}</td>
      <td><div class="row" style="gap:6px"><button class="btn sm" data-news-edit="${p.id}" ${dis()}>Modifier</button><button class="btn sm bad" data-news-del="${p.id}" ${dis()}>Supprimer</button></div></td></tr>`).join('');
    return `${notice()}${form(D)}
    <div class="card-box" style="overflow-x:auto"><h2 style="font-size:20px">Annonces</h2>
      ${D.posts.length ? `<table class="admin"><thead><tr><th>Parution</th><th>Sorte</th><th>Titre</th><th>Jour annoncé</th><th>Notification</th><th>Vue par</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="hint" style="margin:0">Aucune annonce pour l\'instant.</p>'}</div>`;
  }

  function onSubmit(id) {
    if (id !== 'news-form') return false;
    const v = k => document.getElementById(k).value, on = k => document.getElementById(k).checked;
    const editing = S.edit?.id || null;
    const from = v('nw-from');
    if (!editing && from <= S.data.today && !confirm('Publier cette annonce tout de suite pour tous les joueurs ?')) return true;
    post('/api/admin/news', { id: editing, kind: v('nw-kind'), from, date: v('nw-date') || null, set: v('nw-set') || null, title: v('nw-title'), summary: v('nw-summary'), body: v('nw-body'),
      en: { title: v('nw-en-title'), summary: v('nw-en-summary'), body: v('nw-en-body') }, pinned: on('nw-pinned'), push: on('nw-push') || !!(S.edit?.pushed && S.edit?.push) },
    editing ? 'Annonce enregistrée.' : from > S.data.today ? `Annonce programmée pour le ${frDay(from)}.` : 'Annonce publiée.', { clear: true });
    return true;
  }
  function onClick(t) {
    const ds = t.dataset;
    if (ds.newsEdit) { S.edit = S.data.posts.find(p => p.id === ds.newsEdit) || null; render(); window.scrollTo(0, 0); return true; }
    if (ds.newsCancel) { S.edit = null; render(); return true; }
    if (ds.newsDel) { if (confirm('Supprimer cette annonce pour tous les joueurs ?')) post('/api/admin/news/delete', { id: ds.newsDel }, 'Annonce supprimée.'); return true; }
    return false;
  }
  return { load, render: renderNews, onSubmit, onClick };
}
