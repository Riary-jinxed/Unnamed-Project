// Onglet Quêtes de /admin : quêtes d'histoire (packages/engine/src/story.js, server/src/story.js).
// Pour chaque quête : ouverte ou non, dates des quêtes à durée limitée, récompenses de chaque chapitre (les nombres ; la carte,
// l'art Promo et le titre du dernier chapitre restent ceux du code). Tout s'enregistre d'un bloc ; le serveur l'applique aussitôt.
const KEYS = [['shards', 'Éclats'], ['xp', 'XP'], ['prisms', 'Prismes'], ['boosters', 'Boosters'], ['chests', 'Coffres']];
const STATE = { open: 'Ouverte', soon: 'Pas encore commencée', over: 'Terminée', off: 'Fermée' };
const frDay = d => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const clone = x => JSON.parse(JSON.stringify(x));

export function storyTab({ call, render, say, esc, notice }) {
  const S = { data: null, s: null, err: '', busy: false };
  const take = d => { S.data = d; S.s = Object.fromEntries(d.quests.map(q => [q.id, clone(q.settings)])); };
  async function load() {
    try { take(await call('GET', '/api/admin/story')); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  async function post(body, msg) {
    S.busy = true; render();
    try { take(await call('POST', '/api/admin/story', body)); say(msg); } catch (e) { say('', e.message); }
    S.busy = false; render();
  }
  const dis = () => (S.busy ? 'disabled' : '');

  function questBox(q) {
    const s = S.s[q.id], limited = q.kind === 'limitee';
    const extra = ch => [ch.card ? 'carte' : '', ch.art ? 'art Promo' : '', ch.title ? 'titre' : ''].filter(Boolean).join(', ');
    const rows = q.chapters.map((ch, i) => `<tr><td><b>${i + 1}. ${esc(ch.name)}</b><br><small class="hint">contre ${esc(ch.foe)}${extra(ch) ? ` · plus ${extra(ch)}` : ''}</small></td>
      ${KEYS.map(([k]) => `<td><input type="number" min="0" step="1" style="width:76px" data-sk="${q.id}.${i}.${k}" value="${s.rewards[i]?.[k] ?? 0}"></td>`).join('')}</tr>`).join('');
    return `<div class="card-box"><div class="row" style="justify-content:space-between"><h2 style="font-size:19px;margin:0">${esc(q.name)}</h2>
        <small class="hint">${limited ? 'Durée limitée' : 'Campagne'} · ${STATE[q.state]} · commencée par ${q.started} joueur${q.started > 1 ? 's' : ''}, finie par ${q.finished}</small></div>
      <label class="check"><input type="checkbox" data-sk="${q.id}.on" ${s.on ? 'checked' : ''}> Ouverte aux joueurs</label>
      ${limited ? `<div class="row"><label class="bfield"><small class="hint">Début (inclus)</small><input type="date" data-sk="${q.id}.from" value="${esc(s.from || '')}"></label>
        <label class="bfield"><small class="hint">Fin (incluse)</small><input type="date" data-sk="${q.id}.to" value="${esc(s.to || '')}"></label>
        <small class="hint">Du ${esc(frDay(s.from))} au ${esc(frDay(s.to))}, heure de Paris. Elle se montre « bientôt » 7 jours avant.</small></div>` : ''}
      <div class="scroll"><table class="admin"><thead><tr><th>Chapitre (récompense de la première victoire)</th>${KEYS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function renderStory() {
    if (S.err) return `${notice()}<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="wait">Chargement…</p>';
    return `${notice()}
      <div class="card-box"><h2 style="font-size:20px">Quêtes d'histoire</h2>
        <p class="hint" style="margin:0">Les campagnes restent ouvertes ; les quêtes à durée limitée s'ouvrent entre leurs deux dates. Une quête finie ou fermée disparaît de l'appli, et ce que les joueurs y ont gagné leur reste.
          Les combats se jouent dans l'appli contre l'IA ; chaque récompense se gagne une fois, à la première victoire du chapitre. Aujourd'hui : ${esc(frDay(S.data.day))}.</p></div>
      ${S.data.quests.map(questBox).join('')}
      <div class="row"><button class="btn primary" data-act="story-save" ${dis()}>Enregistrer</button>
        ${S.data.custom ? `<button class="btn" data-act="story-reset" ${dis()}>Revenir aux réglages par défaut</button>` : ''}</div>`;
  }
  function onClick(t) {
    const act = t.dataset.act; if (!S.s) return false;
    if (act === 'story-save') { post({ settings: S.s }, 'Réglages des quêtes enregistrés.'); return true; }
    if (act === 'story-reset') { if (confirm('Revenir aux réglages par défaut des quêtes (dates, récompenses) ?')) post({ reset: true }, 'Réglages par défaut rétablis.'); return true; }
    return false;
  }
  // Les champs modifient les réglages en place : « quête.on », « quête.from », « quête.to », « quête.chapitre.clé ».
  function onInput(e) {
    const el = e.target, path = el.dataset?.sk; if (!path || !S.s) return false;
    const [id, a, b] = path.split('.'), s = S.s[id]; if (!s) return false;
    if (a === 'on') s.on = el.checked;
    else if (a === 'from' || a === 'to') s[a] = el.value;
    else (s.rewards[Number(a)] ||= {})[b] = el.value === '' ? 0 : Number(el.value);
    if (e.type === 'change' && (a === 'from' || a === 'to')) render();
    return true;
  }
  return { load, render: renderStory, onClick, onInput };
}
