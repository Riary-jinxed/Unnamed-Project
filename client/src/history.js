// Historique des parties (onglet Historique du profil) : bilan du joueur et ses dernières parties, chacune détaillée dans un panneau
// (zones, puissance tour par tour, cartes révélées à chaque tour, gains). Pas de replay : seulement ce que le serveur a gardé de la partie.
import { CARDS, GENERALS, TERRAINS, ZONE_NAMES } from '@jeu/engine';
import { api } from './api.js';
import { esc, famStyle } from './common.js';

const KINDS = { salon: 'En ligne', defi: 'Défi entre amis', 'defi-classe': 'Défi classé', 'classe-ia': 'Classé', ia: 'Contre l\'IA' };
const FILTERS = [['all', 'Toutes'], ['online', 'En ligne'], ['ranked', 'Classées'], ['ia', 'Contre l\'IA']];
const IN_FILTER = { all: () => true, online: g => g.mode === 'pvp', ranked: g => g.ranked, ia: g => g.kind === 'ia' };
const RES = { wins: 'Victoire', losses: 'Défaite', draws: 'Match nul' };
const FORM = { w: ['wins', 'V'], l: ['losses', 'D'], d: ['draws', 'N'] };
const ZONE_RES = { me: 'Gagnée', foe: 'Perdue', tie: 'Égalité' };

const pct = r => (r.rate === null ? '–' : `${r.rate} %`);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const duration = ms => { const s = Math.round(ms / 1000), m = Math.floor(s / 60); return m ? `${m} min${s % 60 ? ` ${String(s % 60).padStart(2, '0')}` : ''}` : `${s} s`; };
const when = at => new Date(at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const genName = id => GENERALS[id]?.name || 'Sans général';
const sum = a => a.reduce((s, x) => s + x, 0);

// app : ce que main.js prête (ui, render, zoomKey).
export function createHistory(app) {
  const { ui } = app;
  const H = ui.history = { data: null, filter: 'all', sel: null, loading: false, error: '' };

  async function load() {
    if (H.loading) return;
    H.loading = true; H.error = '';
    try { H.data = await api('GET', '/api/history', undefined, ui.auth); } catch (e) { H.error = e.message; }
    H.loading = false;
    app.render();
  }

  // Une carte révélée : touchée, elle s'ouvre en grand.
  const cardChip = id => {
    const d = CARDS[id] || GENERALS[id];
    if (!d) return `<span class="chip hcard">${esc(id)}</span>`;
    return `<button class="chip hcard" style="${famStyle(CARDS[id]?.kw?.[0] || GENERALS[id]?.fam)}" data-zoom="${app.zoomKey(id)}">${esc(d.name)}</button>`;
  };
  const tile = (label, value, sub = '') => `<div class="stat"><span class="eyebrow">${label}</span><b class="num">${value}</b>${sub ? `<small class="hint num">${sub}</small>` : ''}</div>`;
  const recLine = r => `${plural(r.games, 'partie')} · ${r.wins} V · ${r.losses} D${r.draws ? ` · ${r.draws} N` : ''}`;
  const rateRow = (label, r) => `<div class="row"><span style="flex:1;min-width:0">${label}</span><small class="hint num">${recLine(r)}</small><b class="num hrate">${pct(r)}</b></div>`;

  function summaryHTML(S) {
    const form = S.form ? `<div class="hform" aria-label="Dix dernières parties, de la plus ancienne à la plus récente">${[...S.form].map(c => `<span class="res ${FORM[c][0]}" title="${RES[FORM[c][0]]}">${FORM[c][1]}</span>`).join('')}</div>` : '';
    const kinds = Object.entries(S.kinds).filter(([k]) => KINDS[k]).sort((x, y) => y[1].games - x[1].games);
    // Généraux adverses : ceux rencontrés au moins deux fois, du plus joué au moins joué.
    const foes = S.foes.filter(f => f.games >= 2);
    return `<div class="stats">
        ${tile('Bilan', pct(S), recLine(S))}
        ${tile('Série en cours', S.streak ? plural(S.streak, 'victoire') : '–', `record : ${S.best ? plural(S.best, 'victoire') : '–'} d'affilée`)}
        ${S.zones !== null ? tile('Zones gagnées', `${String(S.zones).replace('.', ',')} / 3`, `en moyenne · ${plural(S.sweeps, 'victoire')} 3 zones sur 3`) : ''}
        ${S.avgMs ? tile('Durée moyenne', duration(S.avgMs)) : ''}
      </div>
      ${form ? `<div class="gal-h">Forme</div>${form}` : ''}
      ${kinds.length > 1 ? `<div class="gal-h">Par type de partie</div><div class="statlist">${kinds.map(([k, r]) => rateRow(KINDS[k], r)).join('')}</div>` : ''}
      ${S.decks.length ? `<div class="gal-h">Par deck</div><div class="statlist">${S.decks.map(d => rateRow(`${esc(d.deck || 'Deck')} <small class="hint">· ${esc(genName(d.general))}</small>`, d)).join('')}</div>` : ''}
      ${foes.length ? `<div class="gal-h">Contre chaque général</div><div class="statlist">${foes.map(f => rateRow(esc(f.name), f)).join('')}</div>` : ''}`;
  }

  function rowHTML(g) {
    const score = g.zones ? `${g.zones.filter(z => z === 'me').length}–${g.zones.filter(z => z === 'foe').length}` : '';
    return `<button class="hrow" data-act="hist-game" data-id="${esc(g.id)}">
      <b class="res ${g.result}">${RES[g.result]}</b>
      <span class="hmid"><span>contre ${esc(g.foe.name)} <small class="hint">· ${esc(genName(g.foe.general))}</small></span>
        <small class="hint">${esc(KINDS[g.kind] || '')}${g.me.deck ? ` · ${esc(g.me.deck)}` : ''}${g.forfeit ? ' · abandon' : ''}</small></span>
      <span class="hend"><b class="num">${score}</b><small class="hint num">${when(g.at)}</small></span></button>`;
  }

  // Onglet Historique du profil.
  function tab() {
    if (!H.data && !H.loading && !H.error) load();
    if (!H.data) return `<div class="card-box">${H.error ? `<p class="err" role="alert">${esc(H.error)}</p><div class="row"><button class="btn" data-act="hist-reload">Réessayer</button></div>` : '<p class="wait">Chargement…</p>'}</div>`;
    const { games, summary } = H.data;
    if (!games.length) return '<div class="card-box"><span class="eyebrow">Historique</span><p class="hint" style="margin:0">Aucune partie jouée pour l\'instant : vos parties en ligne, classées et contre l\'IA apparaîtront ici.</p></div>';
    const list = games.filter(IN_FILTER[H.filter]);
    return `<div class="card-box"><div><span class="eyebrow">Historique</span><h2 style="font-size:22px">Votre bilan</h2></div>${summaryHTML(summary)}</div>
      <div class="card-box"><div><span class="eyebrow">Parties</span><h2 style="font-size:22px">${games.length > 1 ? `Les ${games.length} dernières` : 'Votre dernière partie'}</h2></div>
        <div class="seg hfilter" role="tablist" aria-label="Type de partie">${FILTERS.map(([id, label]) => `<button role="tab" data-act="hist-filter" data-filter="${id}" class="${H.filter === id ? 'on' : ''}" aria-selected="${H.filter === id}">${label}</button>`).join('')}</div>
        ${list.length ? `<div class="hlist">${list.map(rowHTML).join('')}</div>` : '<p class="hint" style="margin:0">Aucune partie de ce type parmi les dernières.</p>'}
        <p class="hint" style="margin:0">Touchez une partie pour la voir en détail.</p></div>`;
  }

  // Puissance totale de chaque joueur à la fin de chaque tour : deux courbes.
  function chartHTML(trace) {
    if (!trace || trace.length < 2) return '';
    const tot = trace.map(t => [sum(t[0]), sum(t[1])]);
    const W = 300, Hh = 120, pad = 22, max = Math.max(1, ...tot.flat()), min = Math.min(0, ...tot.flat());
    const x = i => pad + i * (W - 2 * pad) / (tot.length - 1), y = v => Hh - pad - (v - min) * (Hh - 2 * pad) / (max - min || 1);
    const line = p => tot.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t[p]).toFixed(1)}`).join(' ');
    const dots = p => tot.map((t, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(t[p]).toFixed(1)}" r="3"/>`).join('');
    return `<figure class="hchart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Puissance totale à la fin de chaque tour : ${tot.map((t, i) => `tour ${i + 1}, ${t[0]} contre ${t[1]}`).join(' ; ')}">
        <line class="axis" x1="${pad}" x2="${W - pad}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
        <path class="foe" d="${line(1)}"/><g class="foe">${dots(1)}</g><path class="me" d="${line(0)}"/><g class="me">${dots(0)}</g>
        ${tot.map((_, i) => `<text x="${x(i).toFixed(1)}" y="${Hh - 4}">${i + 1}</text>`).join('')}
      </svg><figcaption class="hint"><span class="hkey me"></span>Vous <span class="hkey foe"></span>Adversaire · puissance totale à la fin de chaque tour</figcaption></figure>`;
  }

  // Cartes révélées tour par tour (cut : nombre de cartes révélées à la fin de chaque tour), sinon toutes ensemble.
  function byTurn(side, turns) {
    if (!side.cut?.length) return [side.played];
    return Array.from({ length: turns }, (_, t) => side.played.slice(t ? side.cut[t - 1] ?? side.played.length : 0, side.cut[t] ?? side.played.length));
  }
  function turnsHTML(g) {
    const turns = Math.max(g.me.cut?.length || 0, g.foe.cut?.length || 0);
    if (!turns) {
      return `<div class="gal-h">Vos cartes révélées</div><div class="hcards">${g.me.played.map(cardChip).join('') || '<span class="hint">Aucune.</span>'}</div>
        <div class="gal-h">Cartes révélées par ${esc(g.foe.name)}</div><div class="hcards">${g.foe.played.map(cardChip).join('') || '<span class="hint">Aucune.</span>'}</div>`;
    }
    const mine = byTurn(g.me, turns), theirs = byTurn(g.foe, turns);
    return `<div class="gal-h">Tour par tour</div><div class="hturns">${mine.map((m, t) => {
      const tr = g.trace?.[t], lead = tr ? [0, 1, 2].map(z => Math.sign(tr[0][z] - tr[1][z])) : null;
      const score = lead ? `${lead.filter(v => v > 0).length}–${lead.filter(v => v < 0).length}` : '';
      return `<div class="hturn"><div class="row"><b>Tour ${t + 1}</b>${score ? `<small class="hint num">zones menées ${score}</small>` : ''}</div>
        <div class="hcards me">${m.map(cardChip).join('') || '<span class="hint">—</span>'}</div>
        <div class="hcards foe">${theirs[t].map(cardChip).join('') || '<span class="hint">—</span>'}</div></div>`;
    }).join('')}</div>`;
  }

  function zonesHTML(g) {
    if (!g.zones) return '';
    return `<div class="hzones">${[0, 1, 2].map(z => {
      const t = [g.me.terrains?.[z], g.foe.terrains?.[z]].filter(Boolean).map(id => TERRAINS[id]?.name).filter(Boolean);
      return `<div class="hzone ${g.zones[z]}"><span class="eyebrow">${ZONE_NAMES[z]}</span>
        ${g.me.pow ? `<b class="num"><span class="me">${g.me.pow[z]}</span> – <span class="foe">${g.foe.pow[z]}</span></b>` : ''}
        <small>${ZONE_RES[g.zones[z]]}</small>${t.length ? `<small class="hint">${esc(t.join(' · '))}</small>` : ''}</div>`;
    }).join('')}</div>`;
  }

  // Compteurs de chaque joueur, quand la partie les a gardés.
  function countersHTML(g) {
    if (g.me.treasure === undefined) return '';
    const row = (label, f) => `<div class="row"><span style="flex:1">${label}</span><b class="num me">${f(g.me)}</b><b class="num foe">${f(g.foe)}</b></div>`;
    return `<div class="gal-h">En chiffres</div><div class="statlist hcount">
      <div class="row"><span style="flex:1"></span><small class="hint">Vous</small><small class="hint">${esc(g.foe.name)}</small></div>
      ${row('Cartes révélées', s => s.played.length)}${row('Sorts lancés', s => s.spells)}${row('Créatures perdues', s => s.lost)}
      ${row('Tours parfaits (tous les sceaux dépensés)', s => s.perfect)}${row('Trésor', s => s.treasure)}
      ${row('Général activé', s => (s.gen ? 'oui' : 'non'))}</div>`;
  }

  function gainHTML(gain) {
    if (!gain) return '';
    const parts = [gain.xp ? `+${gain.xp} XP` : '', gain.shards ? `+${gain.shards} Éclats` : '',
      gain.stars ? `${gain.stars > 0 ? '+' : ''}${plural(gain.stars, 'étoile')}` : ''].filter(Boolean);
    return parts.length ? `<p class="hgain">${parts.map(p => `<span class="chip">${p}</span>`).join('')}</p>` : '';
  }

  // Panneau d'une partie.
  function sheet() {
    const g = H.data?.games.find(x => x.id === H.sel);
    if (!g) return '';
    const facts = [KINDS[g.kind], when(g.at), g.ms ? duration(g.ms) : '', g.turns ? plural(g.turns, 'tour') : ''].filter(Boolean).join(' · ');
    return `<div class="sheet" data-act="close"><div class="panel hgame" data-stop="1" role="dialog" aria-label="Détail de la partie">
      <div class="ph"><h2 class="res ${g.result}">${RES[g.result]}</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">${esc(facts)}</p>
      <p style="margin:0">${esc(g.forfeit ? `Partie arrêtée : ${g.reason}` : g.reason ? `${g.reason[0].toUpperCase()}${g.reason.slice(1)}` : '')}</p>
      <div class="hvs">
        <div><span class="eyebrow me">Vous</span><b>${esc(g.me.deck || 'Deck')}</b><small class="hint">${g.me.general ? cardChip(g.me.general) : ''}</small></div>
        <div><span class="eyebrow foe">Adversaire</span>${g.foe.login ? `<button class="linkbtn" data-act="player" data-login="${esc(g.foe.login)}"><b>${esc(g.foe.name)}</b></button>` : `<b>${esc(g.foe.name)}</b>`}
          <small class="hint">${g.foe.general ? cardChip(g.foe.general) : ''}</small></div>
      </div>
      ${gainHTML(g.me.gain)}
      ${zonesHTML(g)}${chartHTML(g.trace)}${turnsHTML(g)}${countersHTML(g)}
    </div></div>`;
  }

  return {
    tab, sheet, load,
    // Le profil se rouvre : l'historique est relu à la prochaine visite de l'onglet.
    reset() { H.data = null; H.error = ''; },
    click(a, ds) {
      if (a === 'hist-filter') { H.filter = ds.filter; app.render(); return true; }
      if (a === 'hist-game') { H.sel = ds.id; ui.sheet = 'game'; app.render(); return true; }
      if (a === 'hist-reload') { load(); app.render(); return true; }
      return false;
    },
  };
}
