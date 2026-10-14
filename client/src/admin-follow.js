// Onglet Suivi de /admin : rétention (retours, cohortes, parcours des nouveaux comptes, joueurs à relancer) et suivi du contenu
// (bienvenue des 7 jours, clans, Boss mondial, quêtes d'histoire, événements, émotes, decks partagés, notifications, passe et classé).
// Les données viennent de GET /api/admin/follow (server/src/follow.js).

export function followTab({ call, render, esc }) {
  const S = { days: 30, data: null, err: '' };

  async function load() {
    S.err = '';
    try { S.data = await call('GET', `/api/admin/follow?days=${S.days}`); }
    catch (e) { S.err = e.message; }
    render();
  }
  // Options en liste : un objet à clés numériques se rangerait dans l'ordre des nombres (« Tout » = 0 en premier).
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, label]) => `<button class="${String(S[key]) === v ? 'on' : ''}" data-follow-${key}="${v}">${label}</button>`).join('')}</div>`;
  const tile = (label, value, sub = '') => `<div class="tile"><span class="eyebrow">${label}</span><b class="num">${value ?? '—'}</b>${sub ? `<small class="hint">${sub}</small>` : ''}</div>`;
  const pc = v => (v === null || v === undefined ? '—' : `${v} %`);
  const meter = (v, label = pc(v)) => `<span class="meter" title="${label}"><i style="--w:${v || 0}%"></i></span>`;
  const fmtDay = (d, o = { day: 'numeric', month: 'short' }) => new Date(`${d}T12:00`).toLocaleDateString('fr-FR', o);
  const table = (head, rows, empty = 'Rien pour le moment.') => `<table class="admin"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="hint">${empty}</td></tr>`}</tbody></table>`;
  const box = (title, body, hint = '') => `<div class="card-box scroll"><h3>${title}</h3>${hint ? `<p class="hint" style="margin:0">${hint}</p>` : ''}${body}</div>`;
  // Barres par jour, une seule série (comme l'onglet Stats).
  function bars(days, key, label) {
    const max = Math.max(1, ...days.map(d => d[key]));
    return `<div class="bars" role="img" aria-label="${label} par jour">${days.map(d => `<span title="${fmtDay(d.day)} : ${d[key]}" style="--h:${(100 * d[key] / max).toFixed(1)}%"></span>`).join('')}</div>
      <div class="row hint bars-axis"><small>${fmtDay(days[0].day)}</small><small>max ${max}</small><small>${fmtDay(days.at(-1).day)}</small></div>`;
  }

  function renderRetention(d) {
    const R = d.retention, back = (r, n) => tile(`Revenus après ${n}`, pc(r.rate), r.n ? `${r.back} sur ${r.n} compte${r.n > 1 ? 's' : ''}` : 'pas encore de compte assez ancien');
    const cohorts = R.cohorts.filter(c => c.n).map(c => `<tr><td>${fmtDay(c.week)}</td><td class="num">${c.n}</td>${c.weeks.map(w => (w === null ? '<td></td>'
      : `<td class="num heat" style="--p:${w}%">${w} %</td>`)).join('')}</tr>`);
    const funnel = d.funnel.map(s => `<tr><td>${esc(s.label)}</td><td class="num">${s.n}</td><td>${meter(s.rate)}</td><td class="num">${pc(s.rate)}</td></tr>`);
    const churn = R.churn.list.map(x => `<tr><td><b>${esc(x.name)}</b> <small class="hint">${esc(x.login)}</small></td><td>${fmtDay(x.last, { dateStyle: 'medium' })}</td></tr>`);
    return `<h3>Rétention</h3>
    <div class="tiles">${back(R.d1, '1 jour')}${back(R.d7, '7 jours')}${back(R.d30, '30 jours')}
      ${tile('Actifs du jour / du mois', pc(R.sticky.rate), `${R.sticky.dau ?? 0} par jour en moyenne sur 7 jours, ${R.sticky.mau} sur 30 jours`)}
      ${tile('À relancer', R.churn.n, 'venus ce mois-ci, absents depuis 7 jours')}</div>
    ${box('Cohortes par semaine de création', table(['Semaine du', 'Comptes', ...Array.from({ length: R.cohorts.length }, (_, k) => (k ? `S+${k}` : 'S0'))], cohorts, 'Aucun compte créé ces 8 dernières semaines.'),
      'Part des comptes créés cette semaine-là qui sont venus chaque semaine suivante (S0 : la semaine de création).')}
    ${box(`Parcours des nouveaux comptes ${S.days ? `(créés ces ${S.days} derniers jours)` : '(créés ces 90 derniers jours)'}`,
      table(['Étape', 'Comptes', '', 'Sur les créés'], funnel), 'Où les nouveaux joueurs s\'arrêtent, de la création à la fin de la bienvenue.')}
    ${box('Joueurs à relancer', table(['Joueur', 'Dernière venue'], churn, 'Personne : tous les joueurs du mois sont revenus cette semaine.'),
      R.churn.n > R.churn.list.length ? `Les ${R.churn.list.length} plus récents sur ${R.churn.n}.` : '')}`;
  }

  function renderContent(d) {
    const W = d.welcome, C = d.clans, B = d.boss, Q = d.story, E = d.emotes, D = d.decks, P = d.push, Z = d.seasons;
    const period = S.days ? `sur ${S.days} jours` : 'depuis le début du suivi';
    const welcome = `<div class="tiles">${tile('Bienvenue commencée', W.n)}${tile('Finie', W.done, pc(W.rate))}${tile('En cours', W.running)}${tile('Délai passé', W.lapsed, `${W.window} jours pour finir`)}</div>
      ${table(['Cadeaux pris', 'Comptes', ''], W.dist.map((n, i) => `<tr><td>${i} sur ${W.dist.length - 1}</td><td class="num">${n}</td><td>${meter(W.n ? Math.round(100 * n / W.n) : 0)}</td></tr>`))}`;
    const clans = `<div class="tiles">${tile('Clans', C.n)}${tile('Joueurs en clan', C.members, C.avgSize ? `${C.avgSize} par clan en moyenne` : '')}
      ${tile('Actifs en clan', pc(C.rate), `${C.activeIn} des ${C.active} joueurs venus cette semaine`)}</div>
      ${table(['Clan', 'Niveau', 'Membres', 'Actifs 7 j', 'Missions finies'], C.list.map(c => `<tr><td><b>${esc(c.name)}</b> <small class="hint">[${esc(c.tag || '')}]</small></td>
        <td class="num">${c.level}</td><td class="num">${c.members}</td><td class="num">${c.active}</td><td class="num">${c.done} sur ${c.missions}</td></tr>`), 'Aucun clan.')}`;
    const bossMax = Math.max(1, ...B.weeks.map(w => w.players || 0));
    const boss = `<div class="tiles">${tile('Cette semaine', B.players, `${esc(B.boss || '—')}${B.on ? '' : ' · fermé'}`)}${tile('Tentatives', B.runs, B.avgRuns ? `${B.avgRuns} par joueur (${B.attempts} par jour au plus)` : '')}
      ${tile('Meilleur score', B.best || '—', B.avgBest ? `${B.avgBest} en moyenne` : '')}${tile('Joueurs déjà venus', B.ever)}
      ${tile('Tentatives', B.periodRuns, period)}${tile('Achats au magasin', B.periodBuys, period)}</div>
      ${table(['Semaine du', 'Boss', 'Joueurs', ''], B.weeks.map(w => `<tr><td>${fmtDay(w.week)}${w.current ? ' <small class="hint">en cours</small>' : ''}</td><td>${esc(w.boss || '—')}</td>
        <td class="num">${w.players ?? '—'}</td><td>${meter(Math.round(100 * (w.players || 0) / bossMax), String(w.players ?? 0))}</td></tr>`))}`;
    const STATE = { open: 'ouverte', archive: 'archivée', soon: 'à venir', over: 'finie', off: 'fermée' };
    const story = `<div class="tiles">${tile('Joueurs en quête', Q.players)}${tile('Chapitres gagnés', Q.period, period)}</div>
      ${table(['Quête', 'État', 'Commencée', 'Finie', 'Taux de fin'], Q.quests.map(q => `<tr><td><b>${esc(q.name)}</b>${q.limited ? ' <small class="hint">limitée</small>' : ''}</td>
        <td>${STATE[q.state] || esc(q.state)}</td><td class="num">${q.started}</td><td class="num">${q.finished}</td><td class="num">${pc(q.started ? Math.round(100 * q.finished / q.started) : null)}</td></tr>`))}
      ${Q.quests.filter(q => q.started).map(q => `<details><summary>${esc(q.name)} : où les joueurs s'arrêtent</summary>
        ${table(['Chapitre', 'Gagné par', ''], q.reach.map((c, i) => `<tr><td>${i + 1}. ${esc(c.name)}</td><td class="num">${c.n}</td><td>${meter(Math.round(100 * c.n / q.started))}</td></tr>`))}</details>`).join('')}`;
    const delta = (on, off) => (on === null || off === null ? '—' : `${on} <small class="hint">contre ${off}</small>`);
    const events = table(['Événement', 'Effet', 'Jours', 'Actifs par jour', 'Parties par jour'], d.events.map(e => `<tr><td><b>${esc(e.name)}</b>${e.live ? ' <small class="ok">en cours</small>' : e.enabled ? '' : ' <small class="hint">coupé</small>'}</td>
      <td>${esc(e.effect)} ×${e.mult}</td><td class="num">${e.days}</td><td class="num">${delta(e.activeOn, e.activeOff)}</td><td class="num">${delta(e.gamesOn, e.gamesOff)}</td></tr>`));
    const emotes = `<div class="tiles">${tile('Émotes envoyées', E.sent, `${E.online} en ligne · ${E.solo} contre l'IA`)}${tile('Émotes achetées', E.bought, period)}
      ${tile('Joueurs avec des émotes en plus', E.owners)}${tile('Sélecteur personnalisé', E.custom)}</div>
      ${table(['Émote', 'Envoyée'], E.top.map(x => `<tr><td>${x.icon} ${esc(x.text)}</td><td class="num">${x.n}</td></tr>`), 'Aucune émote envoyée sur la période.')}`;
    const decks = `<div class="tiles">${tile('Codes copiés', D.shared, period)}${tile('Decks importés d\'un code', D.imported, period)}${tile('Decks bâtis d\'une recette', D.recipes, period)}
      ${tile('Decks par joueur', D.avg ?? '—', `${D.multi} sur ${D.players} en ont au moins 2`)}${tile('Decks contre un boss', D.bossDecks, 'joueurs qui en ont préparé un')}</div>`;
    const push = `<div class="tiles">${tile('Joueurs abonnés', P.players, `${P.devices} appareil${P.devices > 1 ? 's' : ''}`)}${tile('Abonnés parmi les actifs', pc(P.rate), 'joueurs venus ces 30 jours')}</div>
      ${table(['Sorte', 'Activée', `Envoyées (${period})`, 'Touchées', 'Taux'], P.kinds.map(k => `<tr><td>${esc(k.label)}</td><td class="num">${k.on}</td><td class="num">${k.sent}</td>
        <td class="num">${k.opened}</td><td class="num">${pc(k.sent ? Math.min(100, Math.round(100 * k.opened / k.sent)) : null)}</td></tr>`))}`;
    const seasons = `<div class="tiles">${tile('Passe de saison', Z.pass, 'joueurs qui avancent ce mois-ci')}${tile('Passe premium', Z.premium)}
      ${tile('Joueurs en classé', Z.ranked, `${Z.rankedGames} parties ce mois-ci`)}${tile('Calendrier', Z.calendar, 'joueurs qui ont pris au moins un jour ce mois-ci')}</div>`;
    const first = d.series.findIndex(x => x.bossRuns || x.storyChapters || x.emotes || x.push), days = first < 0 ? d.series.slice(-7) : d.series.slice(Math.min(first, d.series.length - 7));
    const curves = `<h3>Tentatives contre le boss par jour</h3>${bars(days, 'bossRuns', 'Tentatives')}<h3>Chapitres gagnés par jour</h3>${bars(days, 'storyChapters', 'Chapitres')}
      <h3>Émotes envoyées par jour</h3>${bars(days, 'emotes', 'Émotes')}<h3>Notifications envoyées par jour</h3>${bars(days, 'push', 'Notifications')}`;
    return `<h3>Nouveau contenu</h3>
    ${box('Bienvenue des 7 jours', welcome, 'Comptes créés depuis l\'arrivée de la bienvenue (et ceux à qui elle a été offerte).')}
    ${box('Clans', clans, 'Actif : venu ces 7 derniers jours. Missions : celles du jour et de la semaine en cours.')}
    ${box('Boss mondial', boss)}
    ${box('Quêtes d\'histoire', story)}
    ${box('Événements', events, 'Moyennes sur les 90 derniers jours : pendant l\'événement, contre les autres jours. Les parties sont celles en ligne et contre l\'IA (hors boss et quêtes).')}
    ${box('Émotes', emotes)}
    ${box('Decks partagés', decks)}
    ${box('Notifications', push, 'Une notification envoyée compte une fois par joueur, même s\'il a plusieurs appareils. Touchée : ouverte depuis la notification.')}
    ${box(`Passe et classé (saison ${esc(Z.season)})`, seasons)}
    <div class="card-box">${curves}</div>`;
  }

  function renderFollow() {
    const d = S.data;
    const head = `<div class="card-box"><div class="row">${seg('days', [['7', '7 jours'], ['30', '30 jours'], ['0', 'Tout']])}</div>
      <p class="hint" style="margin:0">La période s'applique aux compteurs (envois, achats, tentatives…) et au parcours des nouveaux comptes ; le reste montre l'état d'aujourd'hui.
      ${d?.since ? `Compteurs tenus depuis le ${fmtDay(d.since, { dateStyle: 'long' })}` : 'Compteurs tenus à partir de cette mise à jour'} ; émotes, decks partagés, notifications, boss et quêtes à partir de cette mise à jour.</p></div>`;
    if (S.err) return `${head}<p class="err">${esc(S.err)}</p>`;
    if (!d) return `${head}<p class="hint">Chargement…</p>`;
    return `${head}${renderRetention(d)}${renderContent(d)}`;
  }

  function onClick(t) {
    if (t.dataset.followDays) { S.days = +t.dataset.followDays; load(); return true; }
    return false;
  }
  return { load, render: renderFollow, onClick };
}
