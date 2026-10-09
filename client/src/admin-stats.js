// Onglet Stats de /admin : taux de victoire en JcJ et contre l'IA, par joueur et par général, et cartes les plus jouées.
import { famStyle } from './common.js';

const SORTS = { plays: 'Les plus jouées', best: 'Meilleur taux de victoire', worst: 'Pire taux de victoire', decks: 'Les plus mises en deck' };
const MIN_SAMPLE = 5;

export function statsTab({ call, render, esc }) {
  const S = { mode: 'all', days: 30, data: null, err: '', sort: 'plays', all: false };

  async function load() {
    S.err = '';
    try { S.data = await call('GET', `/api/admin/stats?mode=${S.mode}&days=${S.days}`); }
    catch (e) { S.err = e.message; }
    render();
  }
  const pct = (v, n) => (v === null ? '—' : `<span class="${n < MIN_SAMPLE ? 'hint' : ''}">${v} %</span>`);
  const wld = r => `${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ''}`;
  const seg = (key, opts) => `<div class="seg">${Object.entries(opts).map(([v, label]) => `<button class="${String(S[key]) === v ? 'on' : ''}" data-stats-${key}="${v}">${label}</button>`).join('')}</div>`;
  const tile = (label, value, sub = '') => `<div class="tile"><span class="eyebrow">${label}</span><b class="num">${value}</b>${sub ? `<small class="hint">${sub}</small>` : ''}</div>`;

  function renderStats() {
    const head = `<div class="card-box"><div class="row">${seg('mode', { all: 'Toutes', pvp: 'JcJ', pve: 'Contre l\'IA' })}${seg('days', { 7: '7 jours', 30: '30 jours', 0: 'Tout' })}</div>
      <p class="hint" style="margin:0">Victoire = 1, nul = ½. Les taux en gris reposent sur moins de ${MIN_SAMPLE} parties.</p></div>`;
    if (S.err) return `${head}<p class="err">${esc(S.err)}</p>`;
    const d = S.data;
    if (!d) return `${head}<p class="hint">Chargement…</p>`;
    if (!d.total) return `${head}<div class="card-box"><p class="hint" style="margin:0">Aucune partie terminée sur cette période. Les parties sont enregistrées à partir de cette mise à jour.</p></div>`;
    const sorted = d.cards.slice().sort({
      plays: (a, b) => b.plays - a.plays,
      decks: (a, b) => b.decks - a.decks,
      best: (a, b) => (b.plays >= MIN_SAMPLE) - (a.plays >= MIN_SAMPLE) || (b.playedRate ?? -1) - (a.playedRate ?? -1),
      worst: (a, b) => (b.plays >= MIN_SAMPLE) - (a.plays >= MIN_SAMPLE) || (a.playedRate ?? 101) - (b.playedRate ?? 101),
    }[S.sort]);
    const cards = S.all ? sorted : sorted.slice(0, 20);
    const players = d.players.map(p => `<tr><td><b>${esc(p.name)}</b> <small class="hint">${esc(p.login)}</small></td>
      <td class="num">${p.pvp.games}</td><td class="num">${p.pvp.games ? wld(p.pvp) : '—'}</td><td class="num">${pct(p.pvp.rate, p.pvp.games)}</td>
      <td class="num">${p.pve.games}</td><td class="num">${p.pve.games ? wld(p.pve) : '—'}</td><td class="num">${pct(p.pve.rate, p.pve.games)}</td></tr>`).join('');
    const generals = d.generals.map(g => `<tr><td><span class="fdot" style="${famStyle(g.fam)}"></span>${esc(g.name)}</td>
      <td class="num">${g.games}</td><td class="num">${wld(g)}</td><td class="num">${pct(g.rate, g.games)}</td></tr>`).join('');
    const cardRows = cards.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.plays}</td><td class="num">${pct(c.playedRate, c.plays)}</td>
      <td class="num">${c.decks}</td><td class="num">${pct(c.deckRate, c.decks)}</td></tr>`).join('');
    const recent = d.recent.map(g => {
      const names = g.players.map((p, i) => `${g.winner === i ? '<b>' : ''}${esc(p.name)}${g.winner === i ? '</b>' : ''} <small class="hint">${esc(p.deck || '')}</small>`).join(' contre ');
      return `<li><small class="hint">${new Date(g.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · ${g.mode === 'pvp' ? 'JcJ' : 'IA'}</small><br>${names}${g.winner < 0 ? ' · nul' : ''}</li>`;
    }).join('');
    return `${head}
    <div class="tiles">${tile('Parties', d.total)}${tile('JcJ', d.pvp)}${tile('Contre l\'IA', d.pve)}
      ${tile('Victoires contre l\'IA', d.vsAi.rate === null ? '—' : `${d.vsAi.rate} %`, d.vsAi.games ? `${wld(d.vsAi)} sur ${d.vsAi.games}` : '')}</div>
    <div class="card-box scroll"><h3>Joueurs</h3>
      <table class="admin"><thead><tr><th>Joueur</th><th>JcJ</th><th>V-D-N</th><th>%</th><th>IA</th><th>V-D-N</th><th>%</th></tr></thead><tbody>${players || '<tr><td colspan="7" class="hint">—</td></tr>'}</tbody></table></div>
    <div class="card-box scroll"><h3>Généraux</h3>
      <p class="hint" style="margin:0">Tous les camps, IA comprise.</p>
      <table class="admin"><thead><tr><th>Général</th><th>Parties</th><th>V-D-N</th><th>%</th></tr></thead><tbody>${generals}</tbody></table></div>
    <div class="card-box scroll"><div class="row"><h3 style="margin-right:auto">Cartes</h3>
      <select id="stats-sort" aria-label="Tri des cartes">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="hint" style="margin:0">« Jouée » : nombre de parties où la carte a été posée, et le taux de victoire de son camp ces parties-là. « En deck » : présente dans le deck, jouée ou non.</p>
      <table class="admin"><thead><tr><th>Carte</th><th>Jouée</th><th>% si jouée</th><th>En deck</th><th>% si en deck</th></tr></thead><tbody>${cardRows}</tbody></table>
      ${sorted.length > 20 ? `<div class="row"><button class="btn" data-stats-all="1">${S.all ? 'Voir les 20 premières' : `Voir les ${sorted.length} cartes`}</button></div>` : ''}</div>
    <div class="card-box"><h3>Dernières parties</h3><ul class="games">${recent}</ul></div>`;
  }

  function onClick(t) {
    if (t.dataset.statsMode) { S.mode = t.dataset.statsMode; load(); return true; }
    if (t.dataset.statsDays) { S.days = +t.dataset.statsDays; load(); return true; }
    if (t.dataset.statsAll) { S.all = !S.all; render(); return true; }
    return false;
  }
  function onChange(e) { if (e.target.id === 'stats-sort') { S.sort = e.target.value; render(); return true; } return false; }
  return { load, render: renderStats, onClick, onChange };
}
