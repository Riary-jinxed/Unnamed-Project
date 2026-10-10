// Onglet Courrier de /admin : messages aux joueurs (annonces, événements, cadeaux) avec une récompense facultative, et codes cadeaux.
import { CARDS, GENERALS } from '@jeu/engine';
import { OWNABLE } from '@jeu/engine/collection';
import { ARTS, rarityName } from '@jeu/engine/arts';

const AMOUNTS = [['shards', 'Éclats'], ['prisms', 'Prismes'], ['xp', 'XP'], ['boosters', 'Boosters offerts'], ['chests', 'Coffres d\'arts offerts']];
const nameOf = id => (GENERALS[id] ? `${GENERALS[id].name} (général)` : CARDS[id]?.name || id);
const frDay = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function mailTab({ call, render, say, esc, notice }) {
  const S = { data: null, err: '', busy: false };
  async function load() {
    try { S.data = await call('GET', '/api/admin/mail'); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  // Chaque affichage réécrit la page : ce qui est saisi dans les formulaires est remis en place, sauf dans celui qui vient d'être envoyé avec succès.
  const FORMS = '#mail-send [id], #code-create [id]';
  const snapshot = () => [...document.querySelectorAll(FORMS)].map(el => [el.id, el.type === 'checkbox' ? el.checked : el.value, el.closest('form').id]);
  const restore = (snap, skip) => { for (const [id, v, form] of snap) { const el = document.getElementById(id); if (el && form !== skip) el[el.type === 'checkbox' ? 'checked' : 'value'] = v; } };
  async function post(path, body, msg, form = null) {
    const snap = snapshot();
    S.busy = true; render(); restore(snap);
    let ok = false;
    try { S.data = await call('POST', path, body); say(typeof msg === 'function' ? msg(S.data) : msg); ok = true; } catch (e) { say('', e.message); }
    S.busy = false; render(); restore(snap, ok ? form : null);
  }
  const dis = () => (S.busy ? 'disabled' : '');

  // Champs d'une récompense, préfixés pour avoir deux formulaires sur la page.
  const rewardFields = p => `<div class="grid2">
    ${AMOUNTS.map(([k, label]) => `<div class="field"><label class="eyebrow" for="${p}-${k}">${label}</label><input id="${p}-${k}" type="number" min="0" step="1" placeholder="0"></div>`).join('')}
    <div class="field"><label class="eyebrow" for="${p}-card">Carte</label><select id="${p}-card"><option value="">Aucune</option>
      ${OWNABLE.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr')).map(id => `<option value="${id}">${esc(nameOf(id))}</option>`).join('')}</select>
      <small class="hint">Déjà possédée, elle devient des Éclats et de l'essence comme un doublon.</small></div>
    <div class="field"><label class="eyebrow" for="${p}-art">Art alternatif</label><select id="${p}-art"><option value="">Aucun</option>
      ${Object.values(ARTS).map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(nameOf(x.card))} · ${esc(rarityName(x))}</option>`).join('')}</select></div>
  </div>`;
  const readReward = p => {
    const v = k => document.getElementById(`${p}-${k}`).value;
    return { ...Object.fromEntries(AMOUNTS.map(([k]) => [k, v(k) === '' ? 0 : Number(v(k))])), card: v('card') || null, art: v('art') || null };
  };

  function renderMail() {
    if (S.err) return `${notice()}<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="wait">Chargement…</p>';
    const D = S.data;
    const msgRows = D.messages.map(m => `<tr><td>${frDay(m.at)}</td><td>${esc(m.kindName)}</td><td><b>${esc(m.title)}</b>${m.body ? `<br><small class="hint">${esc(m.body.slice(0, 90))}${m.body.length > 90 ? '…' : ''}</small>` : ''}</td>
      <td>${m.to ? esc(m.to.join(', ')) : m.newcomers ? 'Tous' : 'Tous (comptes existants)'}</td><td>${esc(m.rewardLabel) || '—'}</td>
      <td class="num">${m.read}/${m.reach}</td><td class="num">${m.reward ? `${m.got}/${m.reach}` : '—'}</td>
      <td>${m.until ? `${esc(m.until)}${m.live ? '' : ' <span class="chip off">fini</span>'}` : '—'}</td>
      <td><button class="btn sm bad" data-mail-del="${m.id}" ${dis()}>Supprimer</button></td></tr>`).join('');
    const codeRows = D.codes.map(c => `<tr><td><b class="num">${esc(c.code)}</b>${c.label ? `<br><small class="hint">${esc(c.label)}</small>` : ''}</td><td>${esc(c.rewardLabel)}</td>
      <td class="num">${c.uses}${c.max ? `/${c.max}` : ''}</td><td>${c.until ? esc(c.until) : '—'}</td>
      <td>${c.off ? '<span class="chip off">désactivé</span>' : !c.live ? '<span class="chip off">expiré</span>' : c.max && c.uses >= c.max ? '<span class="chip warn">épuisé</span>' : '<span class="chip ok">actif</span>'}</td>
      <td><div class="row" style="gap:6px"><button class="btn sm" data-code-off="${esc(c.code)}" data-on="${c.off ? '' : '1'}" ${dis()}>${c.off ? 'Réactiver' : 'Désactiver'}</button>
        <button class="btn sm bad" data-code-del="${esc(c.code)}" ${dis()}>Supprimer</button></div></td></tr>`).join('');
    return `${notice()}
    <form class="card-box" id="mail-send">
      <h2 style="font-size:20px">Envoyer un message</h2>
      <p class="hint" style="margin:0">Le message arrive dans le courrier des joueurs (l'enveloppe en haut de l'accueil). Avec une récompense, ils la récupèrent depuis le message.</p>
      <div class="grid2">
        <div class="field"><label class="eyebrow" for="ms-kind">Type</label><select id="ms-kind">${Object.entries(D.kinds).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label class="eyebrow" for="ms-until">Visible jusqu'au</label><input id="ms-until" type="date"><small class="hint">Vide : toujours. Après cette date, le message et sa récompense disparaissent.</small></div>
      </div>
      <div class="field"><label class="eyebrow" for="ms-title">Titre</label><input id="ms-title" maxlength="80" required></div>
      <div class="field"><label class="eyebrow" for="ms-body">Message</label><textarea id="ms-body" rows="4" maxlength="2000"></textarea></div>
      <div class="field"><label class="eyebrow" for="ms-to">Destinataires</label><input id="ms-to" placeholder="Tous les joueurs" autocapitalize="off">
        <small class="hint">Vide : tous les joueurs. Sinon, des identifiants séparés par des virgules.</small></div>
      <label class="check"><input id="ms-new" type="checkbox" checked> Aussi pour les joueurs créés après l'envoi (message à tous)</label>
      <h3>Récompense (facultative)</h3>
      ${rewardFields('mr')}
      <div class="row"><button class="btn primary" type="submit" ${dis()}>Envoyer</button></div>
    </form>
    <div class="card-box" style="overflow-x:auto"><h2 style="font-size:20px">Messages envoyés</h2>
      ${D.messages.length ? `<table class="admin"><thead><tr><th>Envoi</th><th>Type</th><th>Titre</th><th>À</th><th>Récompense</th><th>Lus</th><th>Récupérés</th><th>Fin</th><th></th></tr></thead><tbody>${msgRows}</tbody></table>
      <p class="hint" style="margin:0">Supprimer retire le message de tous les courriers, récompense comprise si elle n'a pas été récupérée.</p>` : '<p class="hint" style="margin:0">Aucun message envoyé.</p>'}</div>
    <form class="card-box" id="code-create">
      <h2 style="font-size:20px">Créer un code cadeau</h2>
      <p class="hint" style="margin:0">Les joueurs le saisissent dans leur courrier ou en bas de la boutique. Chaque compte ne peut l'utiliser qu'une fois.</p>
      <div class="grid2">
        <div class="field"><label class="eyebrow" for="cc-code">Code</label><input id="cc-code" maxlength="24" placeholder="Tiré au hasard" autocapitalize="characters"><small class="hint">3 à 24 caractères : lettres, chiffres, tiret.</small></div>
        <div class="field"><label class="eyebrow" for="cc-label">Nom affiché au joueur</label><input id="cc-label" maxlength="60" placeholder="Code Halloween"></div>
        <div class="field"><label class="eyebrow" for="cc-max">Utilisations au total</label><input id="cc-max" type="number" min="0" step="1" placeholder="0"><small class="hint">0 : sans limite.</small></div>
        <div class="field"><label class="eyebrow" for="cc-until">Valable jusqu'au</label><input id="cc-until" type="date"><small class="hint">Vide : sans fin.</small></div>
      </div>
      <h3>Récompense</h3>
      ${rewardFields('cr')}
      <div class="row"><button class="btn primary" type="submit" ${dis()}>Créer le code</button></div>
    </form>
    <div class="card-box" style="overflow-x:auto"><h2 style="font-size:20px">Codes cadeaux</h2>
      ${D.codes.length ? `<table class="admin"><thead><tr><th>Code</th><th>Récompense</th><th>Utilisé</th><th>Fin</th><th>État</th><th></th></tr></thead><tbody>${codeRows}</tbody></table>` : '<p class="hint" style="margin:0">Aucun code pour l\'instant.</p>'}</div>`;
  }

  function onSubmit(id) {
    const v = k => document.getElementById(k).value;
    if (id === 'mail-send') {
      const to = v('ms-to').trim();
      if (!to && !confirm('Envoyer ce message à tous les joueurs ?')) return true;
      post('/api/admin/mail', { kind: v('ms-kind'), title: v('ms-title'), body: v('ms-body'), to, until: v('ms-until') || null,
        newcomers: document.getElementById('ms-new').checked, reward: readReward('mr') }, 'Message envoyé.', id);
      return true;
    }
    if (id === 'code-create') {
      post('/api/admin/codes', { code: v('cc-code'), label: v('cc-label'), max: Number(v('cc-max') || 0), until: v('cc-until') || null, reward: readReward('cr') },
        d => `Code créé : <b>${esc(d.created)}</b>.`, id);
      return true;
    }
    return false;
  }
  function onClick(t) {
    const ds = t.dataset;
    if (ds.mailDel) { if (confirm('Supprimer ce message de tous les courriers ?')) post('/api/admin/mail/delete', { id: ds.mailDel }, 'Message supprimé.'); return true; }
    if (ds.codeOff) { post('/api/admin/codes/edit', { code: ds.codeOff, off: !!ds.on }, ds.on ? 'Code désactivé.' : 'Code réactivé.'); return true; }
    if (ds.codeDel) { if (confirm(`Supprimer le code ${ds.codeDel} ?`)) post('/api/admin/codes/edit', { code: ds.codeDel, remove: true }, 'Code supprimé.'); return true; }
    return false;
  }
  return { load, render: renderMail, onSubmit, onClick };
}
