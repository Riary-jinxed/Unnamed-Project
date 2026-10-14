// Boss de clan : onglet Boss de l'écran du clan (clan.js). Le Maître ou un adjoint ouvre un boss pour tout le clan ; chaque membre
// a ses tentatives, et la barre de PV du boss est commune. Le serveur fait tout (server/src/clan-boss.js) ; cet écran affiche ce
// qu'il renvoie. La partie se joue comme une tentative contre le boss mondial (main.js, goClanBoss ; bandeau et fin : boss.js).
import { api } from './api.js';
import { esc, famStyle } from './common.js';
import { heroHTML, portraitHTML } from './art.js';
import { GENERALS } from '@jeu/engine';
import { bossBoostLabel } from '@jeu/engine/boss';
import { clanBossReward, clanBossTier } from '@jeu/engine/clan-boss';
import { deckError } from '@jeu/engine/collection';
import { t, tp, tField, locale } from '@jeu/engine/i18n';

const WHEN = { start: t('Début du tour'), end: t('Fin du tour') };
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const until = iso => new Date(iso).toLocaleString(locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Barre de PV du boss (aussi à la table, boss.js).
export function hpBarHTML(hp, max, cls = '') {
  return `<div class="cbhp ${cls}" role="progressbar" aria-valuenow="${hp}" aria-valuemin="0" aria-valuemax="${max}" aria-label="${t('PV du boss')}">
    <span class="cbhp-fill" style="width:${pct(hp, max)}%"></span><span class="cbhp-tx num">${t('{hp} / {max} PV', { hp, max })}</span></div>`;
}

// app : ce que clan.js prête (ui, render, call, errLine, ico, play, go : lance une tentative, editBossDeck).
export function createClanBoss(app) {
  const { ui } = app;
  const R = ui.clanBoss = { data: null, pick: null, note: '' };
  const block = (title, body, cls = '') => `<div class="card-box ${cls}"><span class="eyebrow">${title}</span>${body}</div>`;
  const ico = k => app.ico(k);

  async function load() {
    try { R.data = await api('GET', '/api/clan/boss', undefined, ui.auth); } catch (e) { ui.error = e.message; }
    if (R.data && !R.pick) R.pick = { boss: R.data.bosses[0]?.id, level: Math.min(R.data.clan.level, R.data.levels.length) };
    app.render();
  }

  // Récompense d'un palier au niveau du boss.
  function gainHTML(i, level) {
    const { reward: r, clanXp } = clanBossReward(i, level);
    return [r.clanCoins ? `<span class="num">${ico('ecu')}${r.clanCoins}</span>` : '', r.shards ? `<span class="num">${ico('shard')}${r.shards}</span>` : '',
      r.prisms ? `<span class="num">${ico('prism')}${r.prisms}</span>` : '', r.boosters ? tp(r.boosters, '{n} booster', '{n} boosters') : '',
      clanXp ? `<span class="num">${t('+{n} XP de clan', { n: clanXp })}</span>` : ''].filter(Boolean).join(' ');
  }
  function rewardsBlock(D, level, reached = -1) {
    return block(t('Récompenses du clan · niveau {n}', { n: level }), `<p class="hint" style="margin:0">${t('À la fermeture du boss, chaque membre reçoit la récompense de la part de PV retirée par le clan, même à 0 %. Il faut avoir été dans le clan à son ouverture, ou l\'avoir affronté.')}</p>
      <ul class="tiers btiers">${D.rewards.map((x, i) => `<li class="${i <= reached ? 'done' : ''}"><b class="num">${x.pct ? t('{n} %', { n: x.pct }) : t('Participation')}</b><span>${gainHTML(i, level)}</span>${i === reached ? '<span class="ok">✓</span>' : ''}</li>`).join('')}</ul>`);
  }
  const boostChips = b => `<div class="bboosts">${bossBoostLabel(b.boost).map(x => `<span class="chip bboost">${esc(x)}</span>`).join('')}</div>`;
  function rulesBlock(D, b) {
    const S = D.scoring;
    return block(t('Dégâts d\'une tentative'), `<p class="hint" style="margin:0">${t('En face, le boss ne tient qu\'une seule zone : sa barre de PV. À la fin du tour 7, chacune de vos trois zones lui retire :')}</p>
      <ul class="tiers"><li><b>${t('{n} PV', { n: S.perPower })}</b><span>${t('par point de puissance')}</span></li><li><b>+${S.fullZone}</b><span>${t('si elle est pleine (4 créatures)')}</span></li></ul>
      <p class="hint" style="margin:0">${t('Ces cartes sont renforcées contre lui, sur le plateau :')}</p>${boostChips(b)}
      <ol class="bscript">${b.script.map(s => `<li><span class="bturn num">${s.turn}</span><div><b>${esc(t(s.name))}</b><small class="hint">${WHEN[s.when]} · ${esc(t(s.text))}</small></div></li>`).join('')}</ol>`);
  }
  // Deck joué : celui préparé contre le boss mondial d'origine s'il est complet, sinon le deck joué.
  const fromOf = id => GENERALS[id]?.from || id;
  const bossDeck = id => { const d = ui.account.bossDecks?.[fromOf(id)]; return d && !deckError(d, ui.account) ? d : null; };

  function raidHTML(D) {
    const r = D.raid, b = r.boss, out = r.left <= 0 || r.hp <= 0, prepared = bossDeck(b.id), deck = prepared || ui.account.deck;
    const hero = `<section class="bhero cbhero" style="${famStyle(b.fam)}">
      <div class="bhero-art">${heroHTML(b.id, b.art) || `<span class="sc-init" aria-hidden="true">${esc(t(b.name)[0])}</span>`}</div>
      <div class="bhero-tx"><span class="eyebrow">${t('Boss de clan · niveau {n} · jusqu\'à {date}', { n: r.level, date: until(r.ends) })}</span><h2>${esc(t(b.name))}</h2>
        ${hpBarHTML(r.hp, r.max)}
        <div class="bstats num"><span><b>${t('{n} %', { n: r.pct })}</b><small>${t('PV retirés')}</small></span><span><b>${r.mine}</b><small>${t('vos dégâts')}</small></span>
          <span><b>${r.players}</b><small>${tp(r.players, 'membre l\'a affronté', 'membres l\'ont affronté')}</small></span></div>
        <button class="playbtn bplay" data-act="cboss-play" ${out || ui.busy ? 'disabled' : ''}><span>${r.left <= 0 ? t('Tentatives finies') : t('Affronter')}</span>
          <small class="num">${tp(r.left, '{n} tentative sur {total}', '{n} tentatives sur {total}', { total: D.tries })}</small></button>
        <div class="bdeckline"><span><small class="hint">${prepared ? t('Deck préparé contre lui') : t('Votre deck joué')}</small><b>${esc(deck?.name || t('Aucun deck'))}</b></span>
          <button class="btn sm" data-act="cboss-deck" data-boss="${esc(fromOf(b.id))}">${prepared ? t('Modifier') : t('Préparer un deck')}</button></div>
        <p class="hint" style="margin:0">${t('Ouvert par {name}. Une tentative commencée compte, même abandonnée.', { name: esc(r.by) })}</p></div></section>`;
    const ladder = r.ladder.length ? `<ol class="ladder">${r.ladder.map((x, i) => `<li class="${x.login === ui.account.login ? 'me' : ''}"><span class="lpos num">${i + 1}</span><span class="fname"><b>${esc(x.name)}</b></span>
      <b class="num cscore">${x.dmg}</b><small class="hint num">${tp(x.tries, '{n} tentative', '{n} tentatives')}</small></li>`).join('')}</ol>`
      : `<p class="hint" style="margin:0">${t('Personne ne l\'a encore affronté. À vous l\'honneur !')}</p>`;
    return `${hero}${rewardsBlock(D, r.level, clanBossTier(r.pct))}${block(t('Dégâts des membres'), ladder)}${rulesBlock(D, b)}`;
  }

  function openHTML(D) {
    const P = R.pick, b = D.bosses.find(x => x.id === P.boss) || D.bosses[0], L = D.levels.find(x => x.level === P.level) || D.levels[0];
    const bosses = `<div class="cbpicks">${D.bosses.map(x => `<button type="button" class="cbpick ${x.id === b.id ? 'on' : ''}" data-act="cboss-pick" data-boss="${x.id}" aria-pressed="${x.id === b.id}" style="${famStyle(x.fam)}">
      <span class="gport">${portraitHTML(x.id, x.art) || `<span class="gport-init">${esc(t(x.name)[0])}</span>`}</span><b>${esc(t(x.name).split(/,\s*/)[0])}</b></button>`).join('')}</div>`;
    const levels = `<div class="cblevels">${D.levels.map(x => { const locked = x.level > D.clan.level;
      return `<button type="button" class="cblevel ${x.level === L.level ? 'on' : ''}" data-act="cboss-level" data-level="${x.level}" aria-pressed="${x.level === L.level}" ${locked ? 'disabled' : ''}
        title="${locked ? t('Il faut un clan de niveau {n}.', { n: x.level }) : ''}"><b class="num">${t('Niv. {n}', { n: x.level })}</b><small class="num">${t('{n} PV', { n: x.hp })}</small></button>`; }).join('')}</div>`;
    return `${block(t('Ouvrir un boss de clan'), `<p class="hint" style="margin:0">${t('Il reste ouvert {days} jours. Chaque membre a {n} tentatives, et les points de ses 3 zones font baisser la barre de PV commune. Un boss par semaine.', { days: D.days, n: D.tries })}</p>
      <span class="eyebrow">${t('Boss')}</span>${bosses}<p class="hint" style="margin:0">${esc(t(b.text))}</p>${boostChips(b)}
      <span class="eyebrow">${t('Niveau (jusqu\'au niveau du clan)')}</span>${levels}
      <button class="btn primary" data-act="cboss-open" ${ui.busy ? 'disabled' : ''}>${t('Ouvrir {name}, niveau {n}', { name: esc(t(b.name).split(/,\s*/)[0]), n: L.level })}</button>`)}
      ${rewardsBlock(D, L.level)}${rulesBlock(D, b)}`;
  }

  function lastHTML(D) {
    const x = D.last; if (!x) return '';
    return block(t('Dernier boss de clan'), `<p style="margin:0"><b>${esc(t(x.name))}</b> · ${t('niveau {n}', { n: x.level })} · ${x.defeated ? t('vaincu !') : t('{n} % de ses PV retirés', { n: x.pct })}</p>
      <small class="hint">${new Date(x.closed).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })} · ${tp(x.players, '{n} membre l\'a affronté', '{n} membres l\'ont affronté')}</small>
      ${x.top.length ? `<ol class="ladder">${x.top.map((p, i) => `<li><span class="lpos num">${i + 1}</span><span class="fname"><b>${esc(p.name)}</b></span><b class="num cscore">${p.dmg}</b></li>`).join('')}</ol>` : ''}`);
  }

  function html() {
    const D = R.data;
    if (!D) return `<p class="wait">${t('Chargement…')}</p>`;
    const note = R.note ? `<p class="hint" role="status" style="margin:0">${esc(R.note)}</p>` : '';
    if (D.raid) return `${note}${raidHTML(D)}${lastHTML(D)}`;
    const why = D.canOpen && !D.thisWeek ? '' : block(t('Boss de clan'), `<p style="margin:0">${D.thisWeek ? t('Le boss de clan de cette semaine est passé. Le prochain pourra être ouvert lundi.')
      : t('Aucun boss de clan ouvert. Le Maître ou un adjoint peut en ouvrir un pour tout le clan.')}</p>`);
    return `${note}${why}${D.canOpen && !D.thisWeek ? openHTML(D) : ''}${lastHTML(D)}`;
  }

  async function openRaid() {
    R.note = '';
    const r = await app.call('POST', '/api/clan/boss/open', R.pick);
    if (r) { R.data = r; R.note = r.msg ? tField(r, 'msg') : ''; app.play('reveal'); }
    app.render();
  }
  function click(a, ds) {
    if (a === 'cboss-pick') { R.pick.boss = ds.boss; app.render(); }
    else if (a === 'cboss-level') { R.pick.level = +ds.level; app.render(); }
    else if (a === 'cboss-open' && !ui.busy) openRaid();
    else if (a === 'cboss-play' && !ui.busy && R.data?.raid) app.go(R.data.raid.boss.id);
    else if (a === 'cboss-deck') app.editBossDeck(ds.boss);
    else return false;
    return true;
  }

  return { html, click, load, bossDeck, stop() { Object.assign(R, { data: null, pick: null, note: '' }); } };
}
