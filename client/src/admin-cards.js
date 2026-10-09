// Onglets Cartes et Sets de /admin : retoucher les cartes, en créer, ranger les cartes dans des sets.
// Tout s'enregistre dans un brouillon côté serveur ; « Publier » l'applique au jeu.
import { FAMILIES } from '@jeu/engine';
import { BASE_CARDS, CARD_FIELDS, EFFECT_SOURCES, editable, applyCatalog } from '@jeu/engine/catalog';

const FAM = { 'Ange': '--f-ange', 'Démon': '--f-demon', 'Gobelin': '--f-gobelin', 'Elfe': '--f-elfe', 'Dragon': '--f-dragon' };
const famVar = fam => `--fam: var(${FAM[fam] || '--f-neutre'})`;
const BASE_IDS = Object.keys(BASE_CARDS).filter(id => !BASE_CARDS[id].token);
const TYPES = { C: 'Créature', S: 'Sort' };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);

// Fiche éditable d'une carte selon un catalogue, avec ses champs toujours dans le même ordre.
function eff(cat, id) {
  const e = cat.cards[id];
  if (!BASE_CARDS[id] && !e) return null;
  const src = BASE_CARDS[id] ? { ...editable(BASE_CARDS[id]), ...(e || {}) } : { text: '', fam: '', mobile: false, x: false, sacrifice: 0, ...e };
  const out = Object.fromEntries(CARD_FIELDS.map(k => [k, src[k]]));
  if (!BASE_CARDS[id]) out.effect = e.effect || '';
  return out;
}
const allIds = cat => [...BASE_IDS, ...Object.keys(cat.cards).filter(id => !BASE_CARDS[id])];

export function cardsTab({ call, render, say, esc, notice, onPublished }) {
  const S = { cat: null, err: '', q: '', fam: 'all', edit: null, form: null, set: null, busy: false };

  async function load() {
    try { S.cat = await call('GET', '/api/admin/catalog'); S.err = ''; }
    catch (e) { S.err = e.message; }
    render();
  }
  const draft = () => S.cat.draft, pub = () => S.cat.published;
  const changedCards = () => [...new Set([...allIds(draft()), ...allIds(pub())])].filter(id => !same(eff(draft(), id), eff(pub(), id)));
  const setsChanged = () => !same(draft().sets, pub().sets);
  async function saveDraft(next, okMsg) {
    S.busy = true; render();
    try { S.cat = await call('PUT', '/api/admin/catalog', { draft: next }); say(okMsg); S.edit = null; S.form = null; S.set = null; }
    catch (e) { say('', e.message); }
    S.busy = false; render(); window.scrollTo(0, 0);
  }
  const clone = () => structuredClone(draft());

  function banner() {
    const n = changedCards().length, sets = setsChanged();
    if (!n && !sets) return `<div class="card-box"><p class="hint" style="margin:0">Aucun changement en attente. Le jeu utilise la version publiée${pub().version ? ` n°${pub().version}` : ' d\'origine'}.</p></div>`;
    const what = [n ? `${n} carte${n > 1 ? 's' : ''}` : '', sets ? 'les sets' : ''].filter(Boolean).join(' et ');
    return `<div class="card-box draft"><p style="margin:0"><b>Brouillon non publié :</b> ${what}. Les joueurs ne voient rien tant que ce n'est pas publié.</p>
      <div class="row"><button class="btn primary" data-cat="publish" ${S.busy ? 'disabled' : ''}>Publier dans le jeu</button><button class="btn" data-cat="discard" ${S.busy ? 'disabled' : ''}>Abandonner le brouillon</button></div></div>`;
  }

  // ---- Cartes ----
  function renderCards() {
    if (S.err) return `<p class="err">${esc(S.err)}</p>`;
    if (!S.cat) return '<p class="hint">Chargement…</p>';
    if (S.form) return `${notice()}${renderEditor()}`;
    const changed = new Set(changedCards()), q = S.q.trim().toLowerCase();
    const ids = allIds(draft()).filter(id => {
      const c = eff(draft(), id);
      return (S.fam === 'all' || (c.fam || 'Neutre') === S.fam || (S.fam === 'changed' && changed.has(id))) && (!q || c.name.toLowerCase().includes(q) || id.includes(q));
    });
    const rows = ids.map(id => {
      const c = eff(draft(), id), tags = [];
      if (!BASE_CARDS[id]) tags.push(pub().cards[id] ? 'créée' : 'nouvelle');
      else if (draft().cards[id]) tags.push('retouchée');
      if (changed.has(id)) tags.push('non publiée');
      const sets = draft().sets.filter(s => s.cards.includes(id)).map(s => s.name);
      return `<button class="crow" data-cat-edit="${id}" style="${famVar(c.fam)}">
        <span class="seal">${c.x ? 'X' : c.cost}</span>
        <span><b>${esc(c.name)}</b> <small class="hint">${TYPES[c.type]}${c.type === 'C' ? ` · ${c.power}` : ''} · ${esc(sets.join(', ') || 'hors set')}</small><br><small class="hint">${esc(c.text)}</small></span>
        <span class="tags">${tags.map(t => `<span class="chip ${t === 'non publiée' ? 'warn' : ''}">${t}</span>`).join('')}</span></button>`;
    }).join('');
    return `${notice()}${banner()}
    <div class="card-box">
      <div class="row"><input id="cat-q" type="search" placeholder="Chercher une carte" value="${esc(S.q)}" style="flex:1;min-width:140px">
        <select id="cat-fam" aria-label="Famille">${[['all', 'Toutes'], ...[...FAMILIES, 'Neutre'].map(f => [f, f]), ['changed', 'Non publiées']].map(([v, l]) => `<option value="${v}" ${S.fam === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn primary" data-cat="new">Nouvelle carte</button></div>
      <div class="clist">${rows || '<p class="hint" style="margin:0">Aucune carte.</p>'}</div>
    </div>`;
  }

  function renderEditor() {
    const f = S.form, id = S.edit, isNew = id === null, base = BASE_CARDS[id], orig = base && editable(base);
    const num = (k, label, min, max) => `<div class="field"><label class="eyebrow" for="cf-${k}">${label}</label><input id="cf-${k}" type="number" min="${min}" max="${max}" step="1" value="${f[k]}">
      ${orig && orig[k] !== f[k] ? `<small class="hint">Origine : ${orig[k]}</small>` : ''}</div>`;
    const effectText = f.effect ? BASE_CARDS[f.effect].text : '';
    return `<form class="card-box" id="card-form">
      <div class="row"><h2 style="font-size:22px;margin-right:auto">${isNew ? 'Nouvelle carte' : esc(f.name)}</h2>${id ? `<small class="hint">${esc(id)}</small>` : ''}</div>
      ${base ? '<p class="hint" style="margin:0">Carte d\'origine : son effet est dans le code. Vous pouvez changer ses chiffres, son nom, sa famille et son texte. Si vous changez ce que fait l\'effet, changez aussi le texte.</p>' : ''}
      <div class="grid2">
        <div class="field"><label class="eyebrow" for="cf-name">Nom</label><input id="cf-name" maxlength="40" required value="${esc(f.name)}">${orig && orig.name !== f.name ? `<small class="hint">Origine : ${esc(orig.name)}</small>` : ''}</div>
        ${isNew ? `<div class="field"><label class="eyebrow" for="cf-id">Identifiant</label><input id="cf-id" maxlength="30" placeholder="Tiré du nom" value="${esc(f.id || '')}" autocapitalize="none" spellcheck="false"><small class="hint">a-z, 0-9 et _, définitif.</small></div>` : ''}
        <div class="field"><label class="eyebrow" for="cf-type">Type</label><select id="cf-type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="eyebrow" for="cf-fam">Famille</label><select id="cf-fam">${['', ...FAMILIES].map(k => `<option value="${k}" ${f.fam === k ? 'selected' : ''}>${k || 'Neutre'}</option>`).join('')}</select></div>
        ${num('cost', 'Coût en sceaux', 0, 20)}${num('power', 'Puissance', -10, 30)}${num('sacrifice', 'Créatures à sacrifier', 0, 3)}
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="cf-mobile" ${f.mobile ? 'checked' : ''}> Déplaçable</label>
        <label class="check"><input type="checkbox" id="cf-x" ${f.x ? 'checked' : ''}> Coût X (dépense tous les sceaux)</label></div>
      ${!base ? `<div class="field"><label class="eyebrow" for="cf-effect">Effet</label><select id="cf-effect"><option value="">Sans effet</option>
        ${EFFECT_SOURCES.map(k => `<option value="${k}" ${f.effect === k ? 'selected' : ''}>Comme ${esc(BASE_CARDS[k].name)}</option>`).join('')}</select>
        <small class="hint">${effectText ? `Effet repris : « ${esc(effectText)} »` : 'Une carte sans effet : seulement son coût et sa puissance.'} Les effets sont du code : une nouvelle carte reprend l'effet d'une carte existante.</small></div>` : ''}
      <div class="field"><label class="eyebrow" for="cf-text">Texte de la carte</label><textarea id="cf-text" maxlength="400" rows="3">${esc(f.text)}</textarea>
        ${orig && orig.text !== f.text ? `<small class="hint">Origine : ${esc(orig.text)}</small>` : ''}
        ${!base && f.effect && !f.text ? '<button class="btn sm" type="button" data-cat="copy-text">Reprendre le texte de l\'effet</button>' : ''}</div>
      ${isNew ? `<div class="field"><label class="eyebrow" for="cf-set">Set</label><select id="cf-set"><option value="">Hors set (seulement donnée par l'admin)</option>
        ${draft().sets.map(s => `<option value="${esc(s.id)}" ${f.set === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
      <div class="row"><button class="btn primary" type="submit" ${S.busy ? 'disabled' : ''}>Enregistrer dans le brouillon</button><button class="btn" type="button" data-cat="cancel">Annuler</button>
        ${base && draft().cards[id] ? '<button class="btn" type="button" data-cat="revert">Revenir à l\'origine</button>' : ''}
        ${!base && !isNew ? '<button class="btn bad" type="button" data-cat="delete">Supprimer la carte</button>' : ''}</div>
    </form>`;
  }

  // Lit le formulaire dans S.form (pour garder la saisie quand la page se redessine).
  function readForm() {
    const el = id => document.getElementById(id);
    if (!el('card-form')) return;
    const f = S.form;
    for (const k of ['name', 'text', 'type', 'fam']) f[k] = el(`cf-${k}`).value;
    for (const k of ['cost', 'power', 'sacrifice']) f[k] = Number(el(`cf-${k}`).value);
    f.mobile = el('cf-mobile').checked; f.x = el('cf-x').checked;
    if (el('cf-effect')) f.effect = el('cf-effect').value;
    if (el('cf-id')) f.id = el('cf-id').value.trim();
    if (el('cf-set')) f.set = el('cf-set').value;
  }
  function saveCard() {
    readForm();
    const f = S.form, next = clone(), base = BASE_CARDS[S.edit];
    const fields = Object.fromEntries(CARD_FIELDS.map(k => [k, k === 'name' || k === 'text' ? f[k].trim() : f[k]]));
    if (base) {
      const orig = editable(base), diff = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !same(v, orig[k])));
      if (Object.keys(diff).length) next.cards[S.edit] = diff; else delete next.cards[S.edit];
      return saveDraft(next, `${esc(fields.name)} enregistrée dans le brouillon.`);
    }
    let id = S.edit;
    if (id === null) {
      id = f.id || slug(fields.name);
      if (BASE_CARDS[id] || next.cards[id]) { say('', `L'identifiant « ${id} » est déjà pris : choisissez-en un autre.`); render(); return; }
      if (f.set) next.sets.find(s => s.id === f.set)?.cards.push(id);
    }
    next.cards[id] = { ...fields, effect: f.effect || '' };
    saveDraft(next, `${esc(fields.name)} enregistrée dans le brouillon.`);
  }

  // ---- Sets ----
  function renderSets() {
    if (S.err) return `<p class="err">${esc(S.err)}</p>`;
    if (!S.cat) return '<p class="hint">Chargement…</p>';
    if (S.set) return `${notice()}${renderSetEditor()}`;
    const list = draft().sets.map((s, i) => `<div class="card-box">
      <div class="row"><h3 style="margin-right:auto">${esc(s.name)}</h3><small class="hint">${s.cards.length} cartes</small><button class="btn" data-set-edit="${i}">Modifier</button></div>
      <div class="row">${s.open ? '<span class="chip">En boutique</span>' : '<span class="chip">Bientôt disponible</span>'}${s.daily ? '<span class="chip">Booster quotidien</span>' : ''}</div>
      ${s.teaser ? `<p class="hint" style="margin:0">${esc(s.teaser)}</p>` : ''}</div>`).join('');
    const loose = allIds(draft()).filter(id => !draft().sets.some(s => s.cards.includes(id)));
    return `${notice()}${banner()}
    <div class="card-box"><p class="hint" style="margin:0">Un set ouvert a sa section en boutique (cartes du jour et booster du set). Un set fermé y apparaît comme « bientôt disponible ». Les sets « booster quotidien » alimentent le booster gratuit du jour.</p>
      <div class="row"><button class="btn primary" data-cat="new-set">Nouveau set</button></div>
      ${loose.length ? `<p class="hint" style="margin:0">Hors de tout set : ${loose.map(id => esc(eff(draft(), id).name)).join(', ')}.</p>` : ''}</div>
    ${list}`;
  }
  function renderSetEditor() {
    const s = S.set, isNew = S.set.index === null;
    const byFam = {};
    for (const id of allIds(draft())) (byFam[eff(draft(), id).fam || 'Neutre'] ||= []).push(id);
    const chips = [...FAMILIES, 'Neutre'].filter(f => byFam[f]).map(f => `<div class="famblock" style="${famVar(f)}"><div class="row"><b style="margin-right:auto">${f}</b>
      <small class="hint">${byFam[f].filter(id => s.cards.includes(id)).length}/${byFam[f].length}</small>
      <button class="btn sm" type="button" data-set-all="${f}">Tout</button><button class="btn sm" type="button" data-set-none="${f}">Rien</button></div>
      <div class="chips">${byFam[f].map(id => `<label class="pick ${s.cards.includes(id) ? 'on' : ''}"><input type="checkbox" data-set-card="${id}" ${s.cards.includes(id) ? 'checked' : ''}>${esc(eff(draft(), id).name)}</label>`).join('')}</div></div>`).join('');
    return `<form class="card-box" id="set-form">
      <h2 style="font-size:22px">${isNew ? 'Nouveau set' : esc(s.name)}</h2>
      <div class="grid2">
        <div class="field"><label class="eyebrow" for="sf-name">Nom</label><input id="sf-name" maxlength="40" required value="${esc(s.name)}"></div>
        ${isNew ? `<div class="field"><label class="eyebrow" for="sf-id">Identifiant</label><input id="sf-id" maxlength="30" placeholder="Tiré du nom" value="${esc(s.id)}" autocapitalize="none" spellcheck="false"></div>` : ''}
      </div>
      <div class="row"><label class="check"><input type="checkbox" id="sf-open" ${s.open ? 'checked' : ''}> Ouvert en boutique</label>
        <label class="check"><input type="checkbox" id="sf-daily" ${s.daily ? 'checked' : ''}> Dans le booster quotidien</label></div>
      <div class="field"><label class="eyebrow" for="sf-teaser">Présentation (affichée tant que le set est fermé)</label><textarea id="sf-teaser" maxlength="300" rows="2">${esc(s.teaser)}</textarea></div>
      <div class="row"><b style="margin-right:auto">Cartes du set</b><small class="hint">${s.cards.length} cartes</small></div>
      ${chips}
      <div class="row"><button class="btn primary" type="submit" ${S.busy ? 'disabled' : ''}>Enregistrer dans le brouillon</button><button class="btn" type="button" data-cat="cancel">Annuler</button>
        ${!isNew ? '<button class="btn bad" type="button" data-cat="delete-set">Supprimer le set</button>' : ''}</div>
    </form>`;
  }
  function readSet() {
    const el = id => document.getElementById(id);
    if (!el('set-form')) return;
    S.set.name = el('sf-name').value; S.set.teaser = el('sf-teaser').value; S.set.open = el('sf-open').checked; S.set.daily = el('sf-daily').checked;
    if (el('sf-id')) S.set.id = el('sf-id').value.trim();
  }
  function saveSet() {
    readSet();
    const { index, ...s } = S.set, next = clone();
    s.name = s.name.trim();
    if (index === null) {
      s.id = s.id || slug(s.name);
      if (next.sets.some(x => x.id === s.id)) { say('', `Un set a déjà l'identifiant « ${s.id} ».`); render(); return; }
      next.sets.push(s);
    } else next.sets[index] = s;
    saveDraft(next, `Set ${esc(s.name)} enregistré dans le brouillon.`);
  }

  async function publish() {
    if (!confirm('Publier le brouillon ? Les cartes et les sets changent tout de suite pour tous les joueurs, y compris dans les parties en cours.')) return;
    S.busy = true; render();
    try { S.cat = await call('POST', '/api/admin/catalog/publish'); applyCatalog(S.cat.published); say(`Publié : version n°${S.cat.published.version}.`); onPublished(); }
    catch (e) { say('', e.message); }
    S.busy = false; render();
  }

  function onClick(t) {
    if (t.dataset.catEdit) { const id = t.dataset.catEdit; S.edit = id; S.form = { ...eff(draft(), id) }; say(''); render(); window.scrollTo(0, 0); return true; }
    if (t.dataset.setEdit) { const i = +t.dataset.setEdit; S.set = { ...structuredClone(draft().sets[i]), index: i }; say(''); render(); window.scrollTo(0, 0); return true; }
    const fam = t.dataset.setAll || t.dataset.setNone;
    if (fam) {
      readSet();
      const ids = allIds(draft()).filter(id => (eff(draft(), id).fam || 'Neutre') === fam);
      S.set.cards = t.dataset.setAll ? [...new Set([...S.set.cards, ...ids])] : S.set.cards.filter(id => !ids.includes(id));
      render(); return true;
    }
    switch (t.dataset.cat) {
      case 'new': S.edit = null; S.form = { name: '', type: 'C', cost: 1, power: 1, fam: '', text: '', mobile: false, x: false, sacrifice: 0, effect: '', set: draft().sets[0]?.id || '' }; say(''); render(); return true;
      case 'new-set': S.set = { index: null, id: '', name: '', open: false, daily: false, teaser: '', cards: [] }; say(''); render(); return true;
      case 'cancel': S.edit = null; S.form = null; S.set = null; say(''); render(); return true;
      case 'copy-text': readForm(); S.form.text = BASE_CARDS[S.form.effect].text; render(); return true;
      case 'revert': { const next = clone(); delete next.cards[S.edit]; saveDraft(next, `${esc(BASE_CARDS[S.edit].name)} revient à l'origine dans le brouillon.`); return true; }
      case 'delete': {
        if (!confirm(`Supprimer ${S.form.name} du brouillon ?`)) return true;
        const next = clone(); delete next.cards[S.edit]; next.sets.forEach(s => { s.cards = s.cards.filter(id => id !== S.edit); });
        saveDraft(next, 'Carte supprimée du brouillon.'); return true;
      }
      case 'delete-set': {
        if (!confirm(`Supprimer le set ${S.set.name} du brouillon ? Ses cartes restent dans le jeu.`)) return true;
        const next = clone(); next.sets.splice(S.set.index, 1); saveDraft(next, 'Set supprimé du brouillon.'); return true;
      }
      case 'publish': publish(); return true;
      case 'discard':
        if (confirm('Abandonner tous les changements non publiés ?')) {
          call('POST', '/api/admin/catalog/discard').then(r => { S.cat = r; say('Brouillon abandonné.'); render(); }).catch(e => { say('', e.message); render(); });
        }
        return true;
    }
    return false;
  }
  function onSubmit(id) {
    if (id === 'card-form') { saveCard(); return true; }
    if (id === 'set-form') { saveSet(); return true; }
    return false;
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'cat-fam') { S.fam = t.value; render(); return true; }
    if (t.id === 'cf-effect' || t.id === 'cf-type') { readForm(); render(); return true; }
    if (t.dataset?.setCard) {
      readSet();
      const id = t.dataset.setCard;
      S.set.cards = t.checked ? [...S.set.cards, id] : S.set.cards.filter(x => x !== id);
      render(); return true;
    }
    return false;
  }
  function onInput(e) {
    if (e.target.id !== 'cat-q') return false;
    S.q = e.target.value; const pos = e.target.selectionStart; render();
    const q = document.getElementById('cat-q'); q.focus(); q.setSelectionRange(pos, pos);
    return true;
  }
  return { load, renderCards, renderSets, onClick, onSubmit, onChange, onInput, loaded: () => !!S.cat };
}
