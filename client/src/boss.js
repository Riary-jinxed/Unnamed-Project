// Boss mondial : le boss de la semaine, ses tentatives du jour, le classement de la semaine et le magasin du boss (Insignes).
// Le serveur fait tout (server/src/boss.js) ; cet écran affiche ce qu'il renvoie. La partie elle-même se joue comme une partie
// en ligne (main.js, goBoss) : ce module donne aussi ce qui change à la table (action du boss, score, cartes renforcées) et la fin.
import { api } from './api.js';
import { esc, famStyle } from './common.js';
import { artHTML, heroHTML, portraitHTML } from './art.js';
import { CARDS, GENERALS, ZONE_NAMES, bossBoost } from '@jeu/engine';
import { ARTS, rarityName } from '@jeu/engine/arts';
import { BOSS_IDS, bossInfo, bossBoostLabel } from '@jeu/engine/boss';
import { DECK_SIZE, DECK_TERRAINS, deckError } from '@jeu/engine/collection';
import { TITLES } from '@jeu/engine/rewards';
import { t, tp, tField, locale } from '@jeu/engine/i18n';
import { hpBarHTML } from './clan-boss.js';

const TABS = [['boss', t('Boss')], ['classement', t('Classement')], ['magasin', t('Magasin')]];
const WHEN = { start: t('Début du tour'), end: t('Fin du tour') };
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const nth = n => (n === 1 ? t('1er') : t('{n}e', { n }));
const dayName = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

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
  const bossArt = b => heroHTML(b.id, b.art) || `<span class="sc-init" aria-hidden="true">${esc(t(b.name)[0])}</span>`;
  const boostChips = b => `<div class="bboosts">${bossBoostLabel(b.boost).map(x => `<span class="chip bboost">${esc(x)}</span>`).join('')}</div>`;
  function head() {
    return `<div class="top"><button class="btn icon" data-act="home" aria-label="${t('Retour à l\'accueil')}">‹</button><span class="title">${t('Boss mondial')}</span>
      <span class="wallet"><span class="chip num cur insigne" title="${t('Insignes')}" aria-label="${t('{n} Insignes', { n: B.data?.coins ?? 0 })}">${ico('insigne')}${B.data?.coins ?? 0}</span></span></div>`;
  }
  function tabs() {
    return `<div class="seg btabs" role="tablist" aria-label="${t('Boss mondial')}">${TABS.map(([id, label]) => `<button role="tab" class="${B.tab === id ? 'on' : ''}" aria-selected="${B.tab === id}" data-act="boss-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
  }
  // Deck joué contre un boss : celui préparé pour lui s'il est complet, sinon le deck joué.
  const bossDeck = id => { const d = ui.account.bossDecks?.[id]; return d && !deckError(d, ui.account) ? d : null; };
  function heroBlock(D) {
    const b = D.boss, out = D.left <= 0, prepared = bossDeck(b.id), deck = prepared || ui.account.deck;
    return `<section class="bhero" style="${famStyle(b.fam)}">
      <div class="bhero-art">${bossArt(b)}</div>
      <div class="bhero-tx"><span class="eyebrow">${t('Boss de la semaine · jusqu\'au {date}', { date: dayName(D.ends) })}</span><h2>${esc(t(b.name))}</h2>
        <p class="hint" style="margin:0">${esc(t(b.text))}</p>
        <div class="bstats num"><span><b>${D.total}</b><small>${t('points cette semaine')}</small></span><span><b>${D.best}</b><small>${t('meilleure tentative')}</small></span>
          <span><b>${D.pos ? nth(D.pos) : '–'}</b><small>${D.n ? tp(D.n, 'sur {n} joueur', 'sur {n} joueurs') : t('pas encore classé')}</small></span></div>
        <button class="playbtn bplay" data-act="boss-play" ${out || ui.busy ? 'disabled' : ''}><span>${out ? t('Revenez demain') : t('Affronter')}</span>
          <small class="num">${out ? tp(D.attempts, '{n} nouvelle tentative à minuit', '{n} nouvelles tentatives à minuit') : tp(D.left, '{n} tentative sur {total} aujourd\'hui', '{n} tentatives sur {total} aujourd\'hui', { total: D.attempts })}</small></button>
        <div class="bdeckline"><span><small class="hint">${prepared ? t('Deck préparé contre lui') : t('Votre deck joué')}</small><b>${esc(deck?.name || t('Aucun deck'))}</b></span>
          <button class="btn sm" data-act="boss-decks">${prepared ? t('Modifier') : t('Préparer un deck')}</button></div>
        <p class="hint" style="margin:0">${t('Une tentative commencée compte, même abandonnée.')}</p></div></section>`;
  }
  function scriptBlock(b) {
    return block(t('Ses 7 tours'), `<ol class="bscript">${b.script.map(s => `<li><span class="bturn num">${s.turn}</span><div><b>${esc(t(s.name))}</b>
      <small class="hint">${WHEN[s.when]} · ${esc(t(s.text))}</small></div></li>`).join('')}</ol>`);
  }
  function rulesBlock(D) {
    const S = D.scoring;
    return block(t('Score d\'une tentative'), `<p class="hint" style="margin:0">${t('À la fin du tour 7, chacune de vos trois zones rapporte :')}</p>
      <ul class="tiers"><li><b>${tp(S.perPower, '{n} point', '{n} points')}</b><span>${t('par point de puissance')}</span></li><li><b>+${S.fullZone}</b><span>${t('si elle est pleine (4 créatures)')}</span></li>
        <li><b>+${S.beatZone}</b><span>${t('si vous y dépassez la puissance du boss')}</span></li></ul>
      <p class="hint" style="margin:0">${t('Le boss pose un Sbire de puissance 4 dans chaque zone au premier tour. Ces cartes sont renforcées contre lui, sur le plateau :')}</p>
      ${boostChips(D.boss)}`);
  }
  // Paliers d'une tentative : chacun atteint donne sa récompense, cumulée avec celles d'en dessous.
  const tierGain = x => [x.coins ? coins(x.coins) : '', x.shards ? `<span class="num">${ico('shard')}${x.shards}</span>` : '', x.xp ? `<span class="num">${t('{n} XP', { n: x.xp })}</span>` : ''].filter(Boolean).join(' ');
  function tiersBlock(D) {
    return block(t('Paliers d\'une tentative'), `<p class="hint" style="margin:0">${t('Chaque palier atteint par une tentative donne sa récompense, et ils se cumulent.')}</p>
      <ul class="tiers btiers">${D.tiers.map(x => `<li class="${D.best >= x.points ? 'done' : ''}"><b class="num">${t('{n} pts', { n: x.points })}</b><span>${tierGain(x)}</span>${D.best >= x.points ? '<span class="ok">✓</span>' : ''}</li>`).join('')}</ul>`);
  }
  function lastBlock(D) {
    if (!D.last.length) return '';
    return block(t('Vos tentatives'), `<ul class="blast">${D.last.slice(0, 6).map(x => `<li><small class="hint">${new Date(x.at).toLocaleDateString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small>
      <b class="num">${t('{n} pts', { n: x.score })}</b></li>`).join('')}</ul>`);
  }
  function nextBlock(D) {
    const parts = [];
    if (D.next && D.next.id !== D.boss.id) parts.push(`<div class="bnext"><span class="gport">${portraitHTML(D.next.id, D.next.art) || `<span class="gport-init">${esc(t(D.next.name)[0])}</span>`}</span>
      <div><small class="hint">${t('La semaine prochaine')}</small><b>${esc(t(D.next.name))}</b>${boostChips(D.next)}</div></div>`);
    if (D.lastWeek?.top.length) parts.push(`<div><small class="hint">${tp(D.lastWeek.n, 'Podium de la semaine dernière ({name}, {n} joueur)', 'Podium de la semaine dernière ({name}, {n} joueurs)', { name: esc(t(D.lastWeek.name)) })}</small>
      <ol class="ladder">${D.lastWeek.top.map(x => `<li><span class="lpos num">${x.pos}</span><span class="fname"><b>${esc(x.name)}</b></span><b class="num cscore">${x.total}</b></li>`).join('')}</ol></div>`);
    return parts.length ? block(t('À venir'), parts.join('')) : '';
  }
  function bossTab() {
    const D = B.data;
    if (!D.on || !D.boss) return block(t('Boss mondial'), `<p style="margin:0">${t('Le boss mondial est fermé pour le moment. Revenez bientôt !')}</p>`);
    return `${heroBlock(D)}${tiersBlock(D)}${rulesBlock(D)}${scriptBlock(D.boss)}${lastBlock(D)}${nextBlock(D)}`;
  }

  function ranksHTML(ranks) {
    const gain = r => [r.coins ? coins(r.coins) : '', r.prisms ? `<span class="num">${ico('prism')}${r.prisms}</span>` : '', r.shards ? `<span class="num">${ico('shard')}${r.shards}</span>` : '', r.title ? t('titre « {title} »', { title: esc(t(TITLES[r.title] || r.title)) }) : ''].filter(Boolean).join(' · ');
    return `<ul class="tiers">${ranks.map(r => `<li><b>${esc(t(r.name))}</b><span>${gain(r)}</span></li>`).join('')}</ul>`;
  }
  function ladderTab() {
    const L = B.ladder, D = B.data;
    if (!L) return block(t('Classement de la semaine'), `<p class="wait">${t('Chargement…')}</p>`);
    const who = x => `<button class="lwho" data-act="player" data-login="${esc(x.login)}" aria-label="${t('Profil de {name}', { name: esc(x.name) })}">${'avatar' in x ? app.avatarHTML({ name: x.name, avatar: B.avatars[x.login]?.src || null }, 'lav', x.frame) : ''}
      <span class="fname"><b>${esc(x.name)}</b>${x.title ? ` <small class="ptitle">${esc(t(x.title))}</small>` : ''}</span></button>`;
    const row = x => `<li class="${x.login === ui.account.login ? 'me' : ''} ${x.pos <= 3 ? 'top' : ''}"><span class="lpos num">${x.pos}</span>${who(x)}<b class="num cscore">${x.total}</b>
      <small class="hint num">${tp(x.runs, '{n} tentative · meilleure {best}', '{n} tentatives · meilleure {best}', { best: x.best })}</small></li>`;
    const mine = L.mine && !L.ladder.some(x => x.login === L.mine.login) ? `<ol class="ladder"><li class="me"><span class="lpos num">${L.mine.pos}</span><span class="fname"><b>${t('Vous')}</b></span><b class="num cscore">${L.mine.total}</b></li></ol>` : '';
    return `${block(D?.boss ? t('Classement de la semaine · {name}', { name: esc(t(D.boss.name)) }) : t('Classement de la semaine'), `<p class="hint" style="margin:0">${t('Le total des points de toutes vos tentatives de la semaine. À égalité, la meilleure tentative départage.')}</p>
      ${L.ladder.length ? `<ol class="ladder">${L.ladder.map(row).join('')}</ol>` : `<p class="hint" style="margin:0">${t('Personne n\'a encore affronté le boss cette semaine. Soyez le premier !')}</p>`}${mine}`)}
      ${block(t('Récompenses de fin de semaine'), `<p class="hint" style="margin:0">${L.n ? tp(L.n, 'Le classement est figé dimanche à minuit. Chaque joueur qui a fait au moins une tentative reçoit la récompense de sa tranche ({n} joueur classé pour l\'instant).', 'Le classement est figé dimanche à minuit. Chaque joueur qui a fait au moins une tentative reçoit la récompense de sa tranche ({n} joueurs classés pour l\'instant).') : t('Le classement est figé dimanche à minuit. Chaque joueur qui a fait au moins une tentative reçoit la récompense de sa tranche.')}</p>
        ${ranksHTML(L.ranks)}`)}`;
  }

  const KIND = { back: t('Dos de carte'), frame: t('Cadre de profil'), title: t('Titre'), shards: t('Éclats'), boosters: t('Booster'), chests: t('Coffre d\'arts'), prisms: t('Prismes'), uniEssence: t('Essence') };
  function itemVisual(x) {
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art') { const A = ARTS[id], card = A.card; return `<div class="citem-art">${artHTML(card, (CARDS[card] || GENERALS[card]).name, 1, '', id)}</div>`; }
    if (x.kind === 'back') return `<span class="mc back back-${esc(id)}"></span>`;
    if (x.kind === 'frame') return app.avatarHTML(ui.account, 'cav', id);
    if (x.kind === 'title') return `<span class="ctitle">${t('« {title} »', { title: esc(t(TITLES[id] || x.name.replace(/^Titre « (.*) »$/, '$1'))) })}</span>`;
    if (x.kind === 'boosters') return '<span class="bres"><span class="bpack" aria-hidden="true"></span></span>';
    const icon = { shards: 'shard', prisms: 'prism', uniEssence: 'essence', chests: 'chest' }[x.kind];
    return `<span class="bres">${ico(icon)}<b class="num">×${x.n}</b></span>`;
  }
  function shopHTML() {
    const D = B.data;
    const item = x => {
      const art = x.kind === 'art' ? ARTS[x.id.slice(4)] : null, cosmetic = !x.limit;
      const soldOut = !cosmetic && x.bought >= x.limit;
      const state = x.owned ? `<span class="ok">${t('✓ Possédé')}</span>` : soldOut ? `<span class="hint">${t('Revenez lundi')}</span>`
        : `<button class="btn sm ${D.coins >= x.price ? 'primary' : ''}" data-act="boss-buy" data-item="${esc(x.id)}" ${ui.busy || D.coins < x.price ? 'disabled' : ''}>${ico('insigne')}${x.price}</button>`;
      return `<div class="citem ${x.owned ? 'owned' : ''} ${soldOut ? 'locked' : ''} k-${x.kind}">${itemVisual(x)}<b>${esc(t(x.name))}</b>
        <small class="hint">${art ? `${esc(rarityName(art))} · ${esc((CARDS[art.card] || GENERALS[art.card]).name)}` : KIND[x.kind]}${cosmetic ? '' : ` · ${t('{n}/{max} cette semaine', { n: x.bought, max: x.limit })}`}</small>${state}</div>`;
    };
    return block(t('Magasin du boss · vous avez {n} Insignes', { n: coins(D.coins) }), `<p class="hint" style="margin:0">${t('Les Insignes se gagnent à chaque tentative (paliers de points) et à la fin de chaque semaine selon votre place au classement. Les ressources se rachètent chaque semaine ; arts, dos, cadre et titre, une seule fois.')}</p>
      <div class="cshop">${D.shop.map(item).join('')}</div>`);
  }

  function screen() {
    if (!B.data) return `${head()}${app.errLine()}<p class="wait">${t('Chargement…')}</p>`;
    const body = { boss: bossTab, classement: ladderTab, magasin: shopHTML }[B.tab]();
    return `${head()}${app.errLine()}${note()}${tabs()}${body}`;
  }

  // ---- Decks contre les boss (onglet Boss mondial de l'écran des decks) ----
  // Un deck par boss, pour s'y préparer ; complet, il est joué à la place du deck joué contre ce boss. Le boss de la semaine en premier.
  function decksHTML() {
    const a = ui.account, week = a.boss?.id;
    const ids = [...BOSS_IDS].sort((x, y) => (y === week) - (x === week));
    const item = id => {
      const b = bossInfo(id), d = a.bossDecks?.[id], err = d && deckError(d, a), g = d && GENERALS[d.general];
      const state = !d ? `<p class="hint" style="margin:0">${t('Pas de deck préparé : votre deck joué servira contre lui.')}</p>`
        : err ? `<p class="hint" style="margin:0">${t('Pas encore jouable : {err} Votre deck joué servira tant qu\'il n\'est pas fini.', { err: esc(err) })}</p>`
          : `<p class="ok" style="margin:0">${t('Prêt : il remplace votre deck joué contre ce boss.')}</p>`;
      return `<div class="card-box bdeck ${id === week ? 'now' : ''}" style="${famStyle(b.fam)}">
        <div class="bdeck-head"><span class="gport">${portraitHTML(id, b.art) || `<span class="gport-init">${esc(b.name[0])}</span>`}</span>
          <div><span class="eyebrow">${id === week ? t('Boss de cette semaine') : t('Boss mondial')}</span><h2>${esc(b.name)}</h2><small class="hint">${esc(b.text)}</small></div></div>
        <div><small class="hint">${t('Renforcées contre lui')}</small>${boostChips(b)}</div>
        ${d ? `<p style="margin:0"><b>${esc(d.name)}</b> · ${g ? esc(g.name) : t('Pas de général')} · ${t('<span class="num">{n}/{max}</span> terrains', { n: d.terrains.length, max: DECK_TERRAINS })} · ${t('<span class="num">{n}/{max}</span> cartes', { n: d.cards.length, max: DECK_SIZE })}</p>` : ''}
        ${state}
        <div class="row"><button class="btn ${d ? '' : 'primary'}" data-act="bdeck-edit" data-boss="${id}">${d ? t('Modifier') : t('Préparer un deck')}</button>
          ${d ? `<button class="btn" data-act="bdeck-reset" data-boss="${id}" ${ui.busy ? 'disabled' : ''}>${t('Supprimer')}</button>` : ''}</div></div>`;
    };
    return `<p class="hint" style="margin:0">${t('Préparez un deck contre chaque boss, avec les cartes qu\'il renforce. Il part de votre deck joué et ne prend pas de place parmi vos decks.')}</p>
      ${app.errLine()}${ids.map(item).join('')}`;
  }

  // ---- À la table ----
  // Bandeau du boss au-dessus du plateau : son action de ce tour (avant ou après votre révélation) et votre score du moment.
  function tableHTML(v) {
    const s = v.boss?.step; if (!v.boss) return '';
    // Boss de clan : il ne tient qu'une seule zone, en travers du plateau, avec sa barre de PV (après les dégâts du moment).
    if (v.boss.clan) {
      const c = v.boss.clan, g = GENERALS[v.boss.id], hp = Math.max(0, c.hp - v.boss.score.total);
      return `<div class="bbar cbzone" role="status" style="${famStyle(g?.fam)}"><span class="bbar-step">${s ? `<b>${esc(t(s.name))}</b><small>${WHEN[s.when]} · ${esc(t(s.text))}</small>` : `<b>${t('Le boss attend')}</b>`}</span>
        <span class="bbar-score num"><small>${t('Dégâts')}</small><b>${v.boss.score.total}</b></span>${hpBarHTML(hp, c.max, 'sm')}</div>`;
    }
    return `<div class="bbar" role="status"><span class="bbar-step">${s ? `<b>${esc(t(s.name))}</b><small>${WHEN[s.when]} · ${esc(t(s.text))}</small>` : `<b>${t('Le boss attend')}</b>`}</span>
      <span class="bbar-score num"><small>${t('Score')}</small><b>${v.boss.score.total}</b></span></div>`;
  }
  // Bonus d'une carte de la main contre le boss (famille ou carte renforcée).
  const handChip = (v, id) => { const n = v.boss ? bossBoost(v.boss.id, id) : 0; return n ? `<span class="bboost-tag num" title="${t('Renforcée contre le boss : +{n} sur le plateau', { n })}">+${n}</span>` : ''; };

  // Fin d'une tentative : score par zone, paliers atteints, gains, total de la semaine.
  function endHTML(v, asked) {
    if (v.boss?.clan) return clanEndHTML(v, asked);
    const r = v.reward?.boss, sc = v.boss?.score;
    const zs = [0, 1, 2].map(z => { const x = (r?.zones || sc?.zones || [])[z] || { power: 0, points: 0 };
      return `<div class="${x.beat ? 'me' : ''}"><div class="eyebrow">${t(ZONE_NAMES[z])}</div><b class="num">${x.points}</b><small class="hint">${t('puissance {n}', { n: x.power })}${x.full ? ` · ${t('pleine')}` : ''}${x.beat ? ` · ${t('gagnée')}` : ''}</small></div>`; }).join('');
    if (!r) return `<div class="sheet"><div class="panel end bend"><h2>${t('Tentative terminée')}</h2><div class="zs">${zs}</div><p class="hint" style="margin:0">${t('Calcul du score…')}</p></div></div>`;
    const tiers = `<ul class="tiers btiers">${r.tiers.map((x, i) => `<li class="${r.reached.includes(i) ? 'done' : ''}"><b class="num">${t('{n} pts', { n: x.points })}</b><span>${tierGain(x)}</span>${r.reached.includes(i) ? '<span class="ok">✓</span>' : ''}</li>`).join('')}</ul>`;
    const next = r.tiers.find(x => x.points > r.score);
    const gain = [r.gain.bossCoins ? t('+{n} Insignes', { n: r.gain.bossCoins }) : '', r.gain.shards ? t('+{n} Éclats', { n: r.gain.shards }) : '', r.gain.xp ? t('+{n} XP', { n: r.gain.xp }) : ''].filter(Boolean).join(' · ');
    return `<div class="sheet"><div class="panel end bend"><span class="eyebrow">${esc(GENERALS[r.boss]?.name || t('Boss mondial'))}${r.abandoned ? ` · ${t('tentative abandonnée')}` : ''}</span>
      <h2 class="bend-score num">${t('{n} <small>points</small>', { n: r.score })}</h2>
      <div class="zs">${zs}</div>
      <p style="margin:0">${gain || t('Aucun palier atteint cette fois.')}${r.levelUp ? ` · <b>${t('Niveau {n} !', { n: r.progress.level })}</b>` : ''}${next ? ` <small class="hint">${t('Prochain palier : {n} points.', { n: next.points })}</small>` : ''}</p>
      ${tiers}
      <p class="num" style="margin:0">${r.pos ? t('Cette semaine : <b>{n}</b> points, {pos} du classement · meilleure tentative {best}', { n: r.total, pos: nth(r.pos), best: r.best }) : t('Cette semaine : <b>{n}</b> points · meilleure tentative {best}', { n: r.total, best: r.best })}</p>
      <div class="row"><button class="btn primary" data-act="again" ${asked || r.left <= 0 ? 'disabled' : ''}>${asked ? t('Nouvelle tentative…') : r.left > 0 ? t('Nouvelle tentative ({n})', { n: r.left }) : t('Plus de tentative aujourd\'hui')}</button>
        <button class="btn" data-act="boss">${t('Boss mondial')}</button><button class="btn" data-act="log">${t('Voir le journal')}</button></div></div></div>`;
  }

  // Fin d'une tentative contre le boss de clan : dégâts par zone, PV du boss, tentatives qui restent.
  function clanEndHTML(v, asked) {
    const r = v.reward?.boss, sc = v.boss.score;
    const zs = [0, 1, 2].map(z => { const x = (r?.zones || sc.zones)[z] || { power: 0, points: 0 };
      return `<div><div class="eyebrow">${t(ZONE_NAMES[z])}</div><b class="num">${x.points}</b><small class="hint">${t('puissance {n}', { n: x.power })}${x.full ? ` · ${t('pleine')}` : ''}</small></div>`; }).join('');
    if (!r) return `<div class="sheet"><div class="panel end bend"><h2>${t('Tentative terminée')}</h2><div class="zs">${zs}</div><p class="hint" style="margin:0">${t('Calcul des dégâts…')}</p></div></div>`;
    const state = !r.counted ? t('Le boss était déjà reparti : ces dégâts ne comptent plus.')
      : r.defeated ? `<b>${t('Boss vaincu ! Les récompenses arrivent à tout le clan.')}</b>` : t('Le clan lui a retiré {n} % de ses PV.', { n: r.pct });
    return `<div class="sheet"><div class="panel end bend"><span class="eyebrow">${esc(GENERALS[r.boss]?.name || t('Boss de clan'))}${r.abandoned ? ` · ${t('tentative abandonnée')}` : ''}</span>
      <h2 class="bend-score num">${t('{n} <small>dégâts</small>', { n: r.damage })}</h2>
      <div class="zs">${zs}</div>
      ${r.counted ? hpBarHTML(r.hp, r.max) : ''}
      <p style="margin:0">${state}</p>
      <p class="num" style="margin:0">${t('Vos dégâts contre ce boss : <b>{n}</b>', { n: r.total })}</p>
      <div class="row"><button class="btn primary" data-act="again" ${asked || r.left <= 0 ? 'disabled' : ''}>${asked ? t('Nouvelle tentative…') : r.left > 0 ? t('Nouvelle tentative ({n})', { n: r.left }) : t('Plus de tentative contre ce boss')}</button>
        <button class="btn" data-act="clan-boss">${t('Boss de clan')}</button><button class="btn" data-act="log">${t('Voir le journal')}</button></div></div></div>`;
  }

  // ---- Clics ----
  function click(a, ds) {
    if (a === 'boss') { app.leaveGame?.(); ui.screen = 'boss'; ui.sheet = null; ui.error = ''; B.note = ''; load(); if (B.tab === 'classement') ladder(); app.render(); }
    else if (a === 'boss-tab') { B.tab = ds.tab; B.note = ''; ui.error = ''; if (ds.tab === 'classement') ladder(); if (ds.tab === 'magasin' && !B.data) load(); app.render(); }
    else if (a === 'boss-play' && !ui.busy) app.go();
    else if (a === 'boss-buy' && !ui.busy) buy(ds.item);
    else if (a === 'boss-decks') { ui.decksTab = 'boss'; ui.screen = 'decks'; ui.error = ''; app.render(); }
    else if (a === 'bdeck-edit') app.editBossDeck(ds.boss);
    else if (a === 'bdeck-reset' && !ui.busy) { if (confirm(t('Supprimer le deck préparé contre {name} ? Votre deck joué servira contre lui.', { name: bossInfo(ds.boss).name }))) app.call('POST', '/api/boss/deck/reset', { boss: ds.boss }); }
    else return false;
    return true;
  }
  async function buy(item) {
    B.note = '';
    const r = await app.call('POST', '/api/boss/buy', { item });
    if (r) { B.data = r; B.note = r.msg ? tField(r, 'msg') : ''; app.play('reveal'); if (r.got?.art) app.gotArt?.(r.got.art); }
    app.render();
  }

  return {
    screen, click, tableHTML, handChip, endHTML, decksHTML, bossDeck,
    // Onglet Boss de la boutique : le magasin du boss (chargé au besoin).
    shopTab() {
      if (!B.data) { load(); return `<p class="wait">${t('Chargement…')}</p>`; }
      return `${app.errLine()}${note()}${shopHTML()}`;
    },
    // Tuile de l'accueil : le boss de la semaine, les tentatives du jour et le total.
    tile(account) {
      const bt = account.boss; if (!bt) return '';
      return `<button class="tile btile ${bt.left ? 'todo' : ''}" data-act="boss"><span class="btile-art">${portraitHTML(bt.id, bt.art)}</span><span class="eyebrow">${t('Boss mondial · {n} j', { n: bt.daysLeft })}</span>
        <b>${esc(t(bt.name).split(/,\s*/)[0])}</b><span class="tile-foot num">${bt.left ? tp(bt.left, '{n}/{total} tentative', '{n}/{total} tentatives', { total: bt.attempts }) : t('Revenez demain')}${bt.total ? ` · ${t('{n} pts', { n: bt.total })}` : ''}</span>
        <span class="bar" aria-hidden="true"><span style="width:${pct(bt.attempts - bt.left, bt.attempts)}%"></span></span></button>`;
    },
    reload: load,
    stop() { Object.assign(B, { data: null, ladder: null, note: '', avatars: {}, tab: 'boss' }); },
  };
}
