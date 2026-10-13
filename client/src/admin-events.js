// Onglet Événements de /admin : bonus temporaires (week-end double XP, semaine double points de classé…), packages/engine/src/events.js.
// La liste se modifie ici puis s'enregistre d'un bloc ; le serveur l'applique aussitôt.
const frDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function eventsTab({ call, render, say, esc, notice }) {
  const S = { data: null, list: null, err: '', busy: false };
  const take = d => { S.data = d; S.list = d.list.map(({ live, period, ...ev }) => ({ ...ev })); };
  async function load() {
    try { take(await call('GET', '/api/admin/events')); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  async function post(body, msg) {
    S.busy = true; render();
    try { take(await call('POST', '/api/admin/events', body)); say(msg); } catch (e) { say('', e.message); }
    S.busy = false; render();
  }
  const dis = () => (S.busy ? 'disabled' : '');
  // Période calculée par le serveur pour la version enregistrée de l'événement (même identifiant, mêmes réglages).
  function state(ev) {
    const saved = S.data.list.find(x => x.id === ev.id);
    const same = saved && ['effect', 'mult', 'when', 'on', 'from', 'to'].every(k => saved[k] === ev[k]);
    if (!same) return '<span class="chip warn">à enregistrer</span>';
    if (!ev.on) return '<span class="chip off">arrêté</span>';
    if (saved.live) return `<span class="chip ok">en cours</span> <small class="hint">jusqu'au ${esc(frDay(saved.period.to))}</small>`;
    return saved.period ? `<small class="hint">prochain : ${esc(frDay(saved.period.from))} → ${esc(frDay(saved.period.to))}</small>` : '<span class="chip off">fini</span>';
  }

  function renderEvents() {
    if (S.err) return `${notice()}<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="wait">Chargement…</p>';
    const D = S.data, opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(typeof l === 'string' ? l : l.name)}</option>`).join('');
    const field = (i, k, label, input) => `<div class="field"><label class="eyebrow" for="ev-${i}-${k}">${label}</label>${input(`id="ev-${i}-${k}" data-ev="${i}" data-k="${k}"`)}</div>`;
    const rows = S.list.map((ev, i) => `<div class="card-box">
      <div class="row" style="justify-content:space-between"><label class="check"><input type="checkbox" data-ev="${i}" data-k="on" ${ev.on ? 'checked' : ''}> <b>${esc(ev.name || 'Sans nom')}</b></label>
        <span>${state(ev)}</span></div>
      <div class="grid2">
        ${field(i, 'name', 'Nom affiché aux joueurs', at => `<input ${at} value="${esc(ev.name)}" maxlength="60">`)}
        ${field(i, 'effect', 'Bonus', at => `<select ${at}>${opts(D.effects, ev.effect)}</select>`)}
        ${field(i, 'mult', 'Multiplicateur', at => `<select ${at}>${D.mults.map(m => `<option value="${m}" ${m === ev.mult ? 'selected' : ''}>×${String(m).replace('.', ',')}</option>`).join('')}</select>`)}
        ${field(i, 'when', 'Quand', at => `<select ${at}>${opts(D.when, ev.when)}</select>`)}
        ${ev.when === 'dates' ? `${field(i, 'from', 'Premier jour', at => `<input type="date" ${at} value="${esc(ev.from || '')}">`)}${field(i, 'to', 'Dernier jour', at => `<input type="date" ${at} value="${esc(ev.to || '')}">`)}` : ''}
      </div>
      <div class="row"><button class="btn sm bad" data-ev-del="${i}" ${dis()}>Retirer</button></div></div>`).join('');
    return `${notice()}
    <div class="card-box">
      <h2 style="font-size:20px">Événements temporaires</h2>
      <p class="hint" style="margin:0">Pendant un événement, le bonus multiplie un gain pour tous les joueurs, qui le voient sur l'accueil (et à l'écran classé pour les points de classé).
        Les jours sont ceux du jeu : de minuit à minuit, heure de Paris. Deux événements sur le même bonus ne se cumulent pas : le plus fort compte. Aujourd'hui : ${esc(frDay(D.today))}</p>
      <ul class="hint" style="margin:0;padding-left:18px">${Object.values(D.effects).map(e => `<li><b>${esc(e.name)}</b> : ${esc(e.hint)}</li>`).join('')}</ul>
    </div>
    ${rows || '<p class="hint">Aucun événement.</p>'}
    <div class="row">
      <button class="btn" data-act="ev-add" ${dis()}>Ajouter un événement</button>
      <button class="btn primary" data-act="ev-save" ${dis()}>Enregistrer</button>
      ${D.custom ? `<button class="btn" data-act="ev-reset" ${dis()}>Revenir aux événements par défaut</button>` : ''}
    </div>`;
  }

  function onClick(t) {
    const act = t.dataset.act;
    if (t.dataset.evDel) { S.list.splice(Number(t.dataset.evDel), 1); render(); return true; }
    if (act === 'ev-add') { S.list.push({ id: '', name: 'Nouvel événement', effect: 'xp', mult: 2, when: 'dates', from: S.data.today, to: S.data.today, on: true }); render(); return true; }
    if (act === 'ev-save') { post({ list: S.list }, 'Événements enregistrés.'); return true; }
    if (act === 'ev-reset') { if (confirm('Remplacer la liste par les événements par défaut (week-end double XP, semaine double points de classé) ?')) post({ reset: true }, 'Événements par défaut rétablis.'); return true; }
    return false;
  }
  // Les champs modifient la liste en place ; un changement de période ou de bonus réaffiche la ligne (dates, état).
  function onInput(e) {
    const el = e.target, i = el.dataset?.ev; if (i === undefined || !S.list) return false;
    const ev = S.list[Number(i)], k = el.dataset.k;
    ev[k] = k === 'on' ? el.checked : k === 'mult' ? Number(el.value) : el.value;
    if (k === 'when' && el.value === 'dates' && !ev.from) Object.assign(ev, { from: S.data.today, to: S.data.today });
    if (e.type === 'change' && k !== 'name') render();
    return true;
  }
  return { load, render: renderEvents, onClick, onInput };
}
