// Boss mondial : le boss de la semaine, ses tentatives du jour, le classement de la semaine et le magasin du boss (Insignes).
// Le serveur fait tout (server/src/boss.js) ; cet écran affiche ce qu'il renvoie. La partie elle-même se joue comme une partie
// en ligne (main.js, goBoss) : ce module donne aussi ce qui change à la table (action du boss, score, cartes renforcées) et la fin.
import { api } from './api.js';
import { esc, famStyle } from './common.js';
import { artHTML, heroHTML, portraitHTML } from './art.js';
import { CARDS, GENERALS, ZONE_NAMES, bossBoost } from '@jeu/engine';
import { ARTS, rarityName } from '@jeu/engine/arts';
import { bossBoostLabel } from '@jeu/engine/boss';
import { TITLES } from '@jeu/engine/rewards';

const TABS = [['boss', 'Boss'], ['classement', 'Classement'], ['magasin', 'Magasin']];
const WHEN = { start: 'Début du tour', end: 'Fin du tour' };
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const nth = n => (n === 1 ? '1er' : `${n}e`);
const dayName = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// app : ce que main.js prête à l'écran (état ui, render, call, errLine, avatarHTML, ico, play, go : lance une tentative).
export function createBoss(app) {
  const { ui } = app;
  const B = ui.bossScreen = { data: null, tab: 'boss', ladder: null, note: '', avatars: {} };
  const ico = k => app.ico(k);
  const coins = n => `<span class="num">${ico('insigne')}${n}</span>`;
  const block = (title, body, cls = '') => `<div class="card-box ${cls}"><span class="eyebrow">${title}</span>${body}</div>`;
  const note = () => (B.note ? `<p class="hint" role="status" style="margin:0">${esc(B.note)}</p>` : '');

  async function load() {
    try { B.data = await api('GET', '/api/boss', undefined, ui.auth); } catch (e) { ui.error = e.message; }
    app.render();
  }
  async function ladder() {
    try { B.ladder = await api('GET', '/api/boss/ladder', undefined, ui.auth); } catch (e) { ui.error = e.message; }
    app.render();
    // Images de profil du top 10 : demandées une fois, quand l'une d'elles a changé.
    const top = (B.ladder?.ladder || []).filter(x => x.avatar && B.avatars[x.login]?.key !== x.avatar);
    if (top.length) api('GET', '/api/boss/avatars', undefined, ui.auth).then(({ avatars }) => {
      for (const x of top) if (avatars[x.login]) B.avatars[x.login] = { key: x.avatar, src: avatars[x.login] };
      app.render();
    }).catch(() => {});
  }

  // ---- Morceaux d'écran ----
  // Le boss en grand : son illustration (l'art de son général), sinon un visuel provisoire à ses couleurs.
  const bossArt = b => heroHTML(b.id, b.art) || `<span class="sc-init" aria-hidden="true">${esc(b.name[0])}</span>`;
  const boostChips = b => `<div class="bboosts">${bossBoostLabel(b.boost).map(x => `<span class="chip bboost">${esc(x)}</span>`).join('')}</div>`;
  function head() {
    return `<div class="top"><button class="btn icon" data-act="home" aria-label="Retour à l'accueil">‹</button><span class="title">Boss mondial</span>
      <span class="wallet"><span class="chip num cur insigne" title="Insignes" aria-label="${B.data?.coins ?? 0} Insignes">${ico('insigne')}${B.data?.coins ?? 0}</span></span></div>`;
  }
  function tabs() {
    return `<div class="seg btabs" role="tablist" aria-label="Boss mondial">${TABS.map(([id, label]) => `<button role="tab" class="${B.tab === id ? 'on' : ''}" aria-selected="${B.tab === id}" data-act="boss-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
  }
  function heroBlock(D) {
    const b = D.boss, out = D.left <= 0;
    return `<section class="bhero" style="${famStyle(b.fam)}">
      <div class="bhero-art">${bossArt(b)}</div>
      <div class="bhero-tx"><span class="eyebrow">Boss de la semaine · jusqu'au ${dayName(D.ends)}</span><h2>${esc(b.name)}</h2>
        <p class="hint" style="margin:0">${esc(b.text)}</p>
        <div class="bstats num"><span><b>${D.total}</b><small>points cette semaine</small></span><span><b>${D.best}</b><small>meilleure tentative</small></span>
          <span><b>${D.pos ? nth(D.pos) : '–'}</b><small>${D.n ? `sur ${D.n} joueur${D.n > 1 ? 's' : ''}` : 'pas encore classé'}</small></span></div>
        <button class="playbtn bplay" data-act="boss-play" ${out || ui.busy ? 'disabled' : ''}><span>${out ? 'Revenez demain' : 'Affronter'}</span>
          <small class="num">${out ? `${D.attempts} nouvelles tentatives à minuit` : `${D.left} tentative${D.left > 1 ? 's' : ''} sur ${D.attempts} aujourd'hui`}</small></button>
        <p class="hint" style="margin:0">La partie se joue avec votre deck joué. Une tentative commencée compte, même abandonnée.</p></div></section>`;
  }
  function scriptBlock(b) {
    return block('Ses 7 tours', `<ol class="bscript">${b.script.map(s => `<li><span class="bturn num">${s.turn}</span><div><b>${esc(s.name)}</b>
      <small class="hint">${WHEN[s.when]} · ${esc(s.text)}</small></div></li>`).join('')}</ol>`);
  }
  function rulesBlock(D) {
    const S = D.scoring;
    return block('Score d\'une tentative', `<p class="hint" style="margin:0">À la fin du tour 7, chacune de vos trois zones rapporte :</p>
      <ul class="tiers"><li><b>${S.perPower} points</b><span>par point de puissance</span></li><li><b>+${S.fullZone}</b><span>si elle est pleine (4 créatures)</span></li>
        <li><b>+${S.beatZone}</b><span>si vous y dépassez la puissance du boss</span></li></ul>
      <p class="hint" style="margin:0">Le boss pose un Sbire de puissance 4 dans chaque zone au premier tour. Ces cartes sont renforcées contre lui, sur le plateau :</p>
      ${boostChips(D.boss)}`);
  }
  // Paliers d'une tentative : chacun atteint donne sa récompense, cumulée avec celles d'en dessous.
  const tierGain = t => [t.coins ? coins(t.coins) : '', t.shards ? `<span class="num">${ico('shard')}${t.shards}</span>` : '', t.xp ? `<span class="num">${t.xp} XP</span>` : ''].filter(Boolean).join(' ');
  function tiersBlock(D) {
    return block('Paliers d\'une tentative', `<p class="hint" style="margin:0">Chaque palier atteint par une tentative donne sa récompense, et ils se cumulent.</p>
      <ul class="tiers btiers">${D.tiers.map(t => `<li class="${D.best >= t.points ? 'done' : ''}"><b class="num">${t.points} pts</b><span>${tierGain(t)}</span>${D.best >= t.points ? '<span class="ok">✓</span>' : ''}</li>`).join('')}</ul>`);
  }
  function lastBlock(D) {
    if (!D.last.length) return '';
    return block('Vos tentatives', `<ul class="blast">${D.last.slice(0, 6).map(x => `<li><small class="hint">${new Date(x.at).toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small>
      <b class="num">${x.score} pts</b></li>`).join('')}</ul>`);
  }
  function nextBlock(D) {
    const parts = [];
    if (D.next && D.next.id !== D.boss.id) parts.push(`<div class="bnext"><span class="gport">${portraitHTML(D.next.id, D.next.art) || `<span class="gport-init">${esc(D.next.name[0])}</span>`}</span>
      <div><small class="hint">La semaine prochaine</small><b>${esc(D.next.name)}</b>${boostChips(D.next)}</div></div>`);
    if (D.lastWeek?.top.length) parts.push(`<div><small class="hint">Podium de la semaine dernière (${esc(D.lastWeek.name)}, ${D.lastWeek.n} joueur${D.lastWeek.n > 1 ? 's' : ''})</small>
      <ol class="ladder">${D.lastWeek.top.map(x => `<li><span class="lpos num">${x.pos}</span><span class="fname"><b>${esc(x.name)}</b></span><b class="num cscore">${x.total}</b></li>`).join('')}</ol></div>`);
    return parts.length ? block('À venir', parts.join('')) : '';
  }
  function bossTab() {
    const D = B.data;
    if (!D.on || !D.boss) return block('Boss mondial', '<p style="margin:0">Le boss mondial est fermé pour le moment. Revenez bientôt !</p>');
    return `${heroBlock(D)}${tiersBlock(D)}${rulesBlock(D)}${scriptBlock(D.boss)}${lastBlock(D)}${nextBlock(D)}`;
  }

  function ranksHTML(ranks) {
    const gain = r => [r.coins ? coins(r.coins) : '', r.prisms ? `<span class="num">${ico('prism')}${r.prisms}</span>` : '', r.shards ? `<span class="num">${ico('shard')}${r.shards}</span>` : '', r.title ? `titre « ${esc(TITLES[r.title] || r.title)} »` : ''].filter(Boolean).join(' · ');
    return `<ul class="tiers">${ranks.map(r => `<li><b>${esc(r.name)}</b><span>${gain(r)}</span></li>`).join('')}</ul>`;
  }
  function ladderTab() {
    const L = B.ladder, D = B.data;
    if (!L) return block('Classement de la semaine', '<p class="wait">Chargement…</p>');
    const who = x => `<button class="lwho" data-act="player" data-login="${esc(x.login)}" aria-label="Profil de ${esc(x.name)}">${'avatar' in x ? app.avatarHTML({ name: x.name, avatar: B.avatars[x.login]?.src || null }, 'lav', x.frame) : ''}
      <span class="fname"><b>${esc(x.name)}</b>${x.title ? ` <small class="ptitle">${esc(x.title)}</small>` : ''}</span></button>`;
    const row = x => `<li class="${x.login === ui.account.login ? 'me' : ''} ${x.pos <= 3 ? 'top' : ''}"><span class="lpos num">${x.pos}</span>${who(x)}<b class="num cscore">${x.total}</b>
      <small class="hint num">${x.runs} tentative${x.runs > 1 ? 's' : ''} · meilleure ${x.best}</small></li>`;
    const mine = L.mine && !L.ladder.some(x => x.login === L.mine.login) ? `<ol class="ladder"><li class="me"><span class="lpos num">${L.mine.pos}</span><span class="fname"><b>Vous</b></span><b class="num cscore">${L.mine.total}</b></li></ol>` : '';
    return `${block(`Classement de la semaine${D?.boss ? ` · ${esc(D.boss.name)}` : ''}`, `<p class="hint" style="margin:0">Le total des points de toutes vos tentatives de la semaine. À égalité, la meilleure tentative départage.</p>
      ${L.ladder.length ? `<ol class="ladder">${L.ladder.map(row).join('')}</ol>` : '<p class="hint" style="margin:0">Personne n\'a encore affronté le boss cette semaine. Soyez le premier !</p>'}${mine}`)}
      ${block('Récompenses de fin de semaine', `<p class="hint" style="margin:0">Le classement est figé dimanche à minuit. Chaque joueur qui a fait au moins une tentative reçoit la récompense de sa tranche${L.n ? ` (${L.n} joueur${L.n > 1 ? 's' : ''} classé${L.n > 1 ? 's' : ''} pour l'instant)` : ''}.</p>
        ${ranksHTML(L.ranks)}`)}`;
  }

  const KIND = { back: 'Dos de carte', frame: 'Cadre de profil', title: 'Titre', shards: 'Éclats', boosters: 'Booster', chests: 'Coffre d\'arts', prisms: 'Prismes', uniEssence: 'Essence' };
  function itemVisual(x) {
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art') { const A = ARTS[id], card = A.card; return `<div class="citem-art">${artHTML(card, (CARDS[card] || GENERALS[card]).name, 1, '', id)}</div>`; }
    if (x.kind === 'back') return `<span class="mc back back-${esc(id)}"></span>`;
    if (x.kind === 'frame') return app.avatarHTML(ui.account, 'cav', id);
    if (x.kind === 'title') return `<span class="ctitle">« ${esc(x.name.replace(/^Titre « (.*) »$/, '$1'))} »</span>`;
    if (x.kind === 'boosters') return '<span class="bres"><span class="bpack" aria-hidden="true"></span></span>';
    const icon = { shards: 'shard', prisms: 'prism', uniEssence: 'essence', chests: 'chest' }[x.kind];
    return `<span class="bres">${ico(icon)}<b class="num">×${x.n}</b></span>`;
  }
  function shopHTML() {
    const D = B.data;
    const item = x => {
      const art = x.kind === 'art' ? ARTS[x.id.slice(4)] : null, cosmetic = !x.limit;
      const soldOut = !cosmetic && x.bought >= x.limit;
      const state = x.owned ? '<span class="ok">✓ Possédé</span>' : soldOut ? '<span class="hint">Revenez lundi</span>'
        : `<button class="btn sm ${D.coins >= x.price ? 'primary' : ''}" data-act="boss-buy" data-item="${esc(x.id)}" ${ui.busy || D.coins < x.price ? 'disabled' : ''}>${ico('insigne')}${x.price}</button>`;
      return `<div class="citem ${x.owned ? 'owned' : ''} ${soldOut ? 'locked' : ''} k-${x.kind}">${itemVisual(x)}<b>${esc(x.name)}</b>
        <small class="hint">${art ? `${esc(rarityName(art))} · ${esc((CARDS[art.card] || GENERALS[art.card]).name)}` : KIND[x.kind]}${cosmetic ? '' : ` · ${x.bought}/${x.limit} cette semaine`}</small>${state}</div>`;
    };
    return block(`Magasin du boss · vous avez ${coins(D.coins)} Insignes`, `<p class="hint" style="margin:0">Les Insignes se gagnent à chaque tentative (paliers de points) et à la fin de chaque semaine selon votre place au classement. Les ressources se rachètent chaque semaine ; arts, dos, cadre et titre, une seule fois.</p>
      <div class="cshop">${D.shop.map(item).join('')}</div>`);
  }

  function screen() {
    if (!B.data) return `${head()}${app.errLine()}<p class="wait">Chargement…</p>`;
    const body = { boss: bossTab, classement: ladderTab, magasin: shopHTML }[B.tab]();
    return `${head()}${app.errLine()}${note()}${tabs()}${body}`;
  }

  // ---- À la table ----
  // Bandeau du boss au-dessus du plateau : son action de ce tour (avant ou après votre révélation) et votre score du moment.
  function tableHTML(v) {
    const s = v.boss?.step; if (!v.boss) return '';
    return `<div class="bbar" role="status"><span class="bbar-step">${s ? `<b>${esc(s.name)}</b><small>${WHEN[s.when]} · ${esc(s.text)}</small>` : '<b>Le boss attend</b>'}</span>
      <span class="bbar-score num"><small>Score</small><b>${v.boss.score.total}</b></span></div>`;
  }
  // Bonus d'une carte de la main contre le boss (famille ou carte renforcée).
  const handChip = (v, id) => { const n = v.boss ? bossBoost(v.boss.id, id) : 0; return n ? `<span class="bboost-tag num" title="Renforcée contre le boss : +${n} sur le plateau">+${n}</span>` : ''; };

  // Fin d'une tentative : score par zone, paliers atteints, gains, total de la semaine.
  function endHTML(v, asked) {
    const r = v.reward?.boss, sc = v.boss?.score;
    const zs = [0, 1, 2].map(z => { const x = (r?.zones || sc?.zones || [])[z] || { power: 0, points: 0 };
      return `<div class="${x.beat ? 'me' : ''}"><div class="eyebrow">${ZONE_NAMES[z]}</div><b class="num">${x.points}</b><small class="hint">puissance ${x.power}${x.full ? ' · pleine' : ''}${x.beat ? ' · gagnée' : ''}</small></div>`; }).join('');
    if (!r) return `<div class="sheet"><div class="panel end bend"><h2>Tentative terminée</h2><div class="zs">${zs}</div><p class="hint" style="margin:0">Calcul du score…</p></div></div>`;
    const tiers = `<ul class="tiers btiers">${r.tiers.map((t, i) => `<li class="${r.reached.includes(i) ? 'done' : ''}"><b class="num">${t.points} pts</b><span>${tierGain(t)}</span>${r.reached.includes(i) ? '<span class="ok">✓</span>' : ''}</li>`).join('')}</ul>`;
    const next = r.tiers.find(t => t.points > r.score);
    const gain = [r.gain.bossCoins ? `+${r.gain.bossCoins} Insignes` : '', r.gain.shards ? `+${r.gain.shards} Éclats` : '', r.gain.xp ? `+${r.gain.xp} XP` : ''].filter(Boolean).join(' · ');
    return `<div class="sheet"><div class="panel end bend"><span class="eyebrow">${esc(GENERALS[r.boss]?.name || 'Boss mondial')}${r.abandoned ? ' · tentative abandonnée' : ''}</span>
      <h2 class="bend-score num">${r.score} <small>points</small></h2>
      <div class="zs">${zs}</div>
      <p style="margin:0">${gain || 'Aucun palier atteint cette fois.'}${r.levelUp ? ` · <b>Niveau ${r.progress.level} !</b>` : ''}${next ? ` <small class="hint">Prochain palier : ${next.points} points.</small>` : ''}</p>
      ${tiers}
      <p class="num" style="margin:0">Cette semaine : <b>${r.total}</b> points${r.pos ? `, ${nth(r.pos)} du classement` : ''} · meilleure tentative ${r.best}</p>
      <div class="row"><button class="btn primary" data-act="again" ${asked || r.left <= 0 ? 'disabled' : ''}>${asked ? 'Nouvelle tentative…' : r.left > 0 ? `Nouvelle tentative (${r.left})` : 'Plus de tentative aujourd\'hui'}</button>
        <button class="btn" data-act="boss">Boss mondial</button><button class="btn" data-act="log">Voir le journal</button></div></div></div>`;
  }

  // ---- Clics ----
  function click(a, ds) {
    if (a === 'boss') { app.leaveGame?.(); ui.screen = 'boss'; ui.sheet = null; ui.error = ''; B.note = ''; load(); if (B.tab === 'classement') ladder(); app.render(); }
    else if (a === 'boss-tab') { B.tab = ds.tab; B.note = ''; ui.error = ''; if (ds.tab === 'classement') ladder(); if (ds.tab === 'magasin' && !B.data) load(); app.render(); }
    else if (a === 'boss-play' && !ui.busy) app.go();
    else if (a === 'boss-buy' && !ui.busy) buy(ds.item);
    else return false;
    return true;
  }
  async function buy(item) {
    B.note = '';
    const r = await app.call('POST', '/api/boss/buy', { item });
    if (r) { B.data = r; B.note = r.msg || ''; app.play('reveal'); if (r.got?.art) app.gotArt?.(r.got.art); }
    app.render();
  }

  return {
    screen, click, tableHTML, handChip, endHTML,
    // Onglet Boss de la boutique : le magasin du boss (chargé au besoin).
    shopTab() {
      if (!B.data) { load(); return '<p class="wait">Chargement…</p>'; }
      return `${app.errLine()}${note()}${shopHTML()}`;
    },
    // Tuile de l'accueil : le boss de la semaine, les tentatives du jour et le total.
    tile(account) {
      const t = account.boss; if (!t) return '';
      return `<button class="tile btile ${t.left ? 'todo' : ''}" data-act="boss"><span class="btile-art">${portraitHTML(t.id, t.art)}</span><span class="eyebrow">Boss mondial · ${t.daysLeft} j</span>
        <b>${esc(t.name.split(/,\s*/)[0])}</b><span class="tile-foot num">${t.left ? `${t.left}/${t.attempts} tentative${t.left > 1 ? 's' : ''}` : 'Revenez demain'}${t.total ? ` · ${t.total} pts` : ''}</span>
        <span class="bar" aria-hidden="true"><span style="width:${pct(t.attempts - t.left, t.attempts)}%"></span></span></button>`;
    },
    reload: load,
    stop() { Object.assign(B, { data: null, ladder: null, note: '', avatars: {}, tab: 'boss' }); },
  };
}
