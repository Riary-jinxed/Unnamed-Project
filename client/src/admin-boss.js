// Onglet Boss de /admin : réglages du boss mondial (packages/engine/src/boss.js, server/src/boss.js).
// Ouverture, tentatives par jour, barème du score, rotation des boss, paliers d'une tentative, tranches du classement de fin de semaine
// et prix du magasin. Tout se modifie ici puis s'enregistre d'un bloc ; le serveur l'applique aussitôt (la semaine en cours comprise).
const frDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const clone = x => JSON.parse(JSON.stringify(x));

export function bossTab({ call, render, say, esc, notice }) {
  const S = { data: null, s: null, err: '', busy: false };
  const take = d => { S.data = d; S.s = clone(d.settings); };
  async function load() {
    try { take(await call('GET', '/api/admin/boss')); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  async function post(body, msg) {
    S.busy = true; render();
    try { take(await call('POST', '/api/admin/boss', body)); say(msg); } catch (e) { say('', e.message); }
    S.busy = false; render();
  }
  const dis = () => (S.busy ? 'disabled' : '');
  const bossName = id => S.data.bosses.find(b => b.id === id)?.name || id;
  const num = (path, v, label, w = 90) => `<label class="bfield"><small class="hint">${label}</small><input type="number" min="0" step="1" style="width:${w}px" data-bk="${path}" value="${v ?? ''}"></label>`;

  function renderBoss() {
    if (S.err) return `${notice()}<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="wait">Chargement…</p>';
    const D = S.data, s = S.s;
    const rotation = D.bosses.map(b => `<label class="check"><input type="checkbox" data-brot="${b.id}" ${s.rotation.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}
      <small class="hint">(${b.script.map(x => esc(x.name)).join(', ')})</small></label>`).join('');
    const tiers = s.tiers.map((t, i) => `<div class="row brow">${num(`tiers.${i}.points`, t.points, 'Points', 90)}${num(`tiers.${i}.coins`, t.coins, 'Insignes')}${num(`tiers.${i}.shards`, t.shards, 'Éclats')}${num(`tiers.${i}.xp`, t.xp, 'XP')}
      <button class="btn sm bad" data-btier-del="${i}" ${dis()}>Retirer</button></div>`).join('');
    const titles = Object.entries(D.titles);
    const ranks = s.ranks.map((r, i) => `<div class="row brow"><label class="bfield"><small class="hint">Nom</small><input data-bk="ranks.${i}.name" value="${esc(r.name)}" maxlength="40" style="width:140px"></label>
      <label class="bfield"><small class="hint">Type</small><select data-bk="ranks.${i}.kind"><option value="top" ${r.top ? 'selected' : ''}>places 1 à N</option><option value="pct" ${r.top ? '' : 'selected'}>N % premiers</option></select></label>
      ${num(`ranks.${i}.${r.top ? 'top' : 'pct'}`, r.top || r.pct, 'N', 70)}${num(`ranks.${i}.coins`, r.coins, 'Insignes')}${num(`ranks.${i}.prisms`, r.prisms, 'Prismes', 70)}${num(`ranks.${i}.shards`, r.shards, 'Éclats', 80)}
      <label class="bfield"><small class="hint">Titre</small><select data-bk="ranks.${i}.title"><option value="">aucun</option>${titles.map(([k, l]) => `<option value="${k}" ${r.title === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button class="btn sm bad" data-brank-del="${i}" ${dis()}>Retirer</button></div>`).join('');
    const shop = D.shopItems.map(x => { const o = s.shop[x.id] || {}, cosmetic = ['art', 'title', 'frame', 'back'].includes(x.kind);
      return `<div class="row brow"><span style="min-width:220px"><b>${esc(x.name)}</b> <small class="hint">${cosmetic ? 'une fois' : `${x.n ?? ''} par achat`}</small></span>
        ${num(`shop.${x.id}.price`, o.price ?? x.price, `Prix (défaut ${x.price})`, 90)}${cosmetic ? '' : num(`shop.${x.id}.limit`, o.limit ?? x.limit, `Par semaine (défaut ${x.limit}, 0 = retiré)`, 90)}</div>`; }).join('');
    const ladder = D.ladder.length ? `<ol class="hint" style="margin:0;padding-left:22px">${D.ladder.map(x => `<li><b>${esc(x.name)}</b> (${esc(x.login)}) : ${x.total} points en ${x.runs} tentative${x.runs > 1 ? 's' : ''}, meilleure ${x.best}</li>`).join('')}</ol>` : '<p class="hint" style="margin:0">Personne n\'a encore joué cette semaine.</p>';
    return `${notice()}
    <div class="card-box">
      <h2 style="font-size:20px">Boss mondial</h2>
      <p class="hint" style="margin:0">Semaine du ${esc(frDay(D.week))} au ${esc(frDay(D.ends))} : <b>${esc(bossName(D.boss) || 'aucun')}</b>, ${D.n} joueur${D.n > 1 ? 's' : ''} classé${D.n > 1 ? 's' : ''}.
        Ensuite : ${D.upcoming.map(u => `${esc(frDay(u.week))} ${esc(bossName(u.boss))}`).join(' · ')}. Le classement est figé et récompensé chaque lundi à minuit (heure de Paris).</p>
      <label class="check"><input type="checkbox" data-bk="on" ${s.on ? 'checked' : ''}> Mode ouvert aux joueurs</label>
      <div class="row brow">${num('attempts', s.attempts, 'Tentatives par jour', 80)}${num('perPower', s.perPower, 'Points par puissance', 80)}${num('fullZone', s.fullZone, 'Bonus zone pleine', 80)}${num('beatZone', s.beatZone, 'Bonus zone gagnée', 80)}</div>
    </div>
    <div class="card-box"><span class="eyebrow">Rotation (une semaine chacun, dans cet ordre)</span>${rotation}</div>
    <div class="card-box"><span class="eyebrow">Paliers d'une tentative (cumulés)</span>${tiers}
      <div class="row"><button class="btn sm" data-act="btier-add" ${dis()}>Ajouter un palier</button></div></div>
    <div class="card-box"><span class="eyebrow">Récompenses de fin de semaine (places, puis parts du classement ; il faut une tranche à 100 %)</span>${ranks}
      <div class="row"><button class="btn sm" data-act="brank-add" ${dis()}>Ajouter une tranche</button></div></div>
    <div class="card-box"><span class="eyebrow">Magasin du boss (prix en Insignes)</span>${shop}</div>
    <div class="card-box"><span class="eyebrow">Classement en cours (20 premiers)</span>${ladder}
      ${D.closed.length ? `<p class="hint" style="margin:0">Semaines figées : ${D.closed.map(c => `${esc(frDay(c.week))} ${esc(bossName(c.boss))} (${c.n})`).join(' · ')}</p>` : ''}</div>
    <div class="row">
      <button class="btn primary" data-act="boss-save" ${dis()}>Enregistrer</button>
      ${D.custom ? `<button class="btn" data-act="boss-reset" ${dis()}>Revenir aux réglages par défaut</button>` : ''}
    </div>`;
  }

  function onClick(t) {
    const act = t.dataset.act, s = S.s;
    if (!s) return false;
    if (t.dataset.btierDel) { s.tiers.splice(Number(t.dataset.btierDel), 1); render(); return true; }
    if (t.dataset.brankDel) { s.ranks.splice(Number(t.dataset.brankDel), 1); render(); return true; }
    if (act === 'btier-add') { const last = s.tiers[s.tiers.length - 1]; s.tiers.push({ points: (last?.points || 0) + 200, coins: 10, shards: 0, xp: 0 }); render(); return true; }
    if (act === 'brank-add') { s.ranks.push({ id: `r${Date.now().toString(36)}`, name: 'Nouvelle tranche', pct: 100, coins: 10, prisms: 0 }); render(); return true; }
    if (act === 'boss-save') { post({ settings: s }, 'Réglages du boss mondial enregistrés.'); return true; }
    if (act === 'boss-reset') { if (confirm('Revenir aux réglages par défaut du boss mondial (paliers, tranches, prix) ?')) post({ reset: true }, 'Réglages par défaut rétablis.'); return true; }
    return false;
  }
  // Les champs modifient les réglages en place ; changer le type d'une tranche ou la rotation réaffiche l'onglet.
  function onInput(e) {
    const el = e.target, s = S.s; if (!s) return false;
    if (el.dataset?.brot) {
      const id = el.dataset.brot; s.rotation = el.checked ? [...s.rotation.filter(x => x !== id), id] : s.rotation.filter(x => x !== id);
      if (e.type === 'change') render(); return true;
    }
    const path = el.dataset?.bk; if (!path) return false;
    const keys = path.split('.'), last = keys.pop();
    // Les identifiants du magasin contiennent « : » mais pas de point : le chemin reste sûr.
    let o = s; for (const k of keys) o = o[k] ??= {};
    if (last === 'on') o.on = el.checked;
    else if (last === 'kind') { const n = o.top || o.pct || 1; delete o.top; delete o.pct; o[el.value] = el.value === 'pct' ? Math.min(100, n) : n; }
    else if (['name', 'title'].includes(last)) { if (el.value) o[last] = el.value; else delete o[last]; }
    else o[last] = el.value === '' ? 0 : Number(el.value);
    if (e.type === 'change' && (last === 'kind' || last === 'on')) render();
    return true;
  }
  return { load, render: renderBoss, onClick, onInput };
}
