// Onglet Signalements de /admin : bugs envoyés par les joueurs depuis leur courrier (bugs.js du serveur), avec le contexte joint
// par l'appli (version, appareil, écran, dernières erreurs) et une capture facultative, chargée à la demande.
const frDay = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const FILTERS = { new: 'Nouveaux', seen: 'Vus', done: 'Réglés', all: 'Tous' };

// onReply(login) : ouvre l'onglet Courrier avec ce joueur en destinataire.
export function bugsTab({ call, render, say, esc, notice, onReply }) {
  const S = { data: null, err: '', busy: false, filter: 'new', shots: {} };
  async function load() {
    try { S.data = await call('GET', '/api/admin/bugs'); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  // Chaque affichage réécrit la page : les notes en cours de saisie sont remises en place.
  const snapshot = () => [...document.querySelectorAll('.bugnote')].map(el => [el.id, el.value]);
  const restore = snap => { for (const [id, v] of snap) { const el = document.getElementById(id); if (el) el.value = v; } };
  async function post(path, body, msg) {
    const snap = snapshot();
    S.busy = true; render(); restore(snap);
    try { S.data = await call('POST', path, body); say(msg); } catch (e) { say('', e.message); }
    S.busy = false; render(); restore(snap);
  }
  async function shot(id) {
    const snap = snapshot();
    try { S.shots[id] = (await call('GET', `/api/admin/bugs/shot?id=${encodeURIComponent(id)}`)).shot; } catch (e) { say('', e.message); }
    render(); restore(snap);
  }
  const dis = () => (S.busy ? 'disabled' : '');
  const chip = s => (s === 'new' ? '<span class="chip warn">nouveau</span>' : s === 'seen' ? '<span class="chip">vu</span>' : '<span class="chip ok">réglé</span>');

  function context(c = {}) {
    const rows = [['Version', c.version], ['Serveur', c.server], ['Appareil', c.platform], ['Navigateur', c.ua], ['Langue', c.lang],
      ['Écran', c.screen && `${c.screen} · fenêtre ${c.viewport} · ×${c.dpr}`], ['Tactile', c.touch ? 'oui' : 'non'], ['Appli installée', c.standalone ? 'oui' : 'non'],
      ['En ligne', c.online ? 'oui' : 'non'], ['Écran du jeu', c.page], ['Thème', c.theme], ['Animations réduites', c.reducedMotion ? 'oui' : 'non']]
      .filter(([, v]) => v !== null && v !== undefined && v !== '');
    const errs = (c.errors || []).map(e => `<li><small class="hint">${e.at ? esc(frDay(e.at)) : ''}</small> <code>${esc(e.text)}</code></li>`).join('');
    return `<details><summary class="eyebrow">Contexte joint</summary>
      <table class="admin"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
      ${errs ? `<p style="margin:6px 0 0"><b>Dernières erreurs de l'appli</b></p><ul style="margin:0">${errs}</ul>` : '<p class="hint" style="margin:6px 0 0">Aucune erreur de l\'appli relevée.</p>'}</details>`;
  }

  function item(r, D) {
    const img = S.shots[r.id];
    return `<article class="card-box">
      <div class="row"><b style="margin-right:auto">${esc(D.kinds[r.kind] || r.kind)}</b>${chip(r.status)}</div>
      <p class="hint" style="margin:0">${frDay(r.at)} · <b>${esc(r.login)}</b>${r.name && r.name !== r.login ? ` (${esc(r.name)})` : ''} · ${esc(r.context?.version || 'version inconnue')}</p>
      <p style="margin:0;white-space:pre-wrap">${esc(r.text)}</p>
      ${r.shot ? img ? `<img src="${img}" alt="Capture du joueur" style="max-width:100%;max-height:520px;justify-self:start;border-radius:var(--r);border:1px solid var(--line)">`
        : `<div class="row"><button class="btn sm" data-bug-shot="${r.id}">Voir la capture</button></div>` : ''}
      ${context(r.context)}
      <div class="field"><label class="eyebrow" for="bn-${r.id}">Note de l'équipe</label><textarea class="bugnote" id="bn-${r.id}" rows="2" maxlength="1000">${esc(r.note || '')}</textarea></div>
      <div class="row" style="gap:6px">
        ${Object.entries(D.statuses).map(([k, l]) => `<button class="btn sm ${r.status === k ? 'primary' : ''}" data-bug-status="${k}" data-id="${r.id}" ${r.status === k ? 'disabled' : dis()}>${l}</button>`).join('')}
        <button class="btn sm" data-bug-note="${r.id}" ${dis()}>Enregistrer la note</button>
        <button class="btn sm" data-bug-reply="${esc(r.login)}">Répondre par courrier</button>
        <button class="btn sm bad" data-bug-del="${r.id}" ${dis()}>Supprimer</button></div>
    </article>`;
  }

  function renderBugs() {
    if (S.err) return `${notice()}<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="wait">Chargement…</p>';
    const D = S.data, list = D.reports.filter(r => S.filter === 'all' || r.status === S.filter);
    const count = k => (k === 'all' ? D.reports.length : D.reports.filter(r => r.status === k).length);
    return `${notice()}
    <div class="card-box"><div class="row"><h2 style="font-size:20px;margin-right:auto">Signalements des joueurs</h2>
      <div class="seg">${Object.entries(FILTERS).map(([k, l]) => `<button class="${S.filter === k ? 'on' : ''}" data-bug-filter="${k}">${l} (${count(k)})</button>`).join('')}</div></div>
      <p class="hint" style="margin:0">Envoyés depuis le courrier de l'appli (« Signaler un bug »). Les 300 derniers sont gardés. « Répondre par courrier » ouvre l'onglet Courrier avec le joueur en destinataire.</p></div>
    ${list.length ? list.map(r => item(r, D)).join('') : `<p class="hint">${S.filter === 'new' ? 'Aucun nouveau signalement.' : 'Aucun signalement ici.'}</p>`}`;
  }

  function onClick(el) {
    const ds = el.dataset;
    if (ds.bugFilter) { S.filter = ds.bugFilter; render(); return true; }
    if (ds.bugShot) { shot(ds.bugShot); return true; }
    if (ds.bugStatus) { post('/api/admin/bugs/edit', { id: ds.id, status: ds.bugStatus }, 'Signalement mis à jour.'); return true; }
    if (ds.bugNote) { post('/api/admin/bugs/edit', { id: ds.bugNote, note: document.getElementById(`bn-${ds.bugNote}`).value }, 'Note enregistrée.'); return true; }
    if (ds.bugReply) { onReply(ds.bugReply); return true; }
    if (ds.bugDel) { if (confirm('Supprimer ce signalement ?')) post('/api/admin/bugs/delete', { id: ds.bugDel }, 'Signalement supprimé.'); return true; }
    return false;
  }
  return { load, render: renderBugs, onClick };
}
