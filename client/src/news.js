// Nouveautés : le journal du jeu (mises à jour majeures, nouveaux sets, annonce du prochain set, grands événements), écrit depuis /admin,
// et le planning de ce qui arrive. Deux onglets, au style de l'accueil :
// - Annonces : la plus récente (ou celle touchée sur l'accueil) en grand bandeau, avec son compte à rebours, puis toutes les autres en lignes.
// - À venir : ce qui est en cours (saison, quêtes, événements, Boss mondial) avec sa jauge, puis ce qui arrive jour par jour (server/src/planning.js).
// Sur l'accueil : bandeau « À la une » de la dernière annonce pas encore vue (banner) ; l'icône du quotidien ouvre l'écran (main.js).
// Ouvrir l'écran marque toutes les annonces comme vues (server/src/news.js).
import './news.css';
import { api } from './api.js';
import { esc, famStyle } from './common.js';
import { portraitHTML } from './art.js';
import { t, tp, locale } from '@jeu/engine/i18n';
import { GENERALS } from '@jeu/engine';
import { setById, setRevealed, today, OWNABLE, setOf } from '@jeu/engine/collection';
import { SEASONS } from '@jeu/engine/pass';
import { seasonName } from '@jeu/engine/ranked';
import { questById } from '@jeu/engine/story';
import { EVENT_EFFECTS, multLabel } from '@jeu/engine/events';
import { ARTS } from '@jeu/engine/arts';

export const NEWS_KINDS = { update: 'Mise à jour majeure', set: 'Nouveau set', teaser: 'Annonce de set', event: 'Événement' };
// Pictogrammes : sortes d'annonces (flèche de mise à jour, paquet de cartes, étoile, drapeau) et entrées du planning.
const ICONS = {
  update: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  set: '<rect x="4" y="6" width="11" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>',
  teaser: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  event: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  season: '<path d="M6 3h12v5a6 6 0 0 1-12 0zM9 21h6M12 14v7"/>',
  quest: '<path d="M4 5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 5a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  boss: '<path d="M4 8l4 3 4-7 4 7 4-3-2 11H6z"/>',
};
const icon = k => `<svg class="nw-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.update}</svg>`;
const CHEVRON = '<svg class="nw-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const kindName = k => t(NEWS_KINDS[k] || NEWS_KINDS.update);
const date = (d, o) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(), { timeZone: 'UTC', ...o });
const dayLabel = d => date(d, { day: 'numeric', month: 'long' });
const daysUntil = (d, from = today()) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const inDays = n => (n > 1 ? tp(n, 'Dans {n} jour', 'Dans {n} jours') : n === 1 ? t('Demain') : n === 0 ? t('Aujourd\'hui') : t('Disponible'));
// Compte à rebours vers le jour annoncé (sortie d'un set, d'une mise à jour) : rien une fois passé de plus d'une semaine.
function countdown(d) {
  if (!d) return '';
  const n = daysUntil(d);
  if (n < -7) return '';
  return `<span class="nw-count ${n <= 0 ? 'now' : ''}"><b class="num">${inDays(n)}</b><small>${esc(dayLabel(d))}</small></span>`;
}
// Médaillon du grand bandeau : jours qui restent avant le jour annoncé, ✓ une fois arrivé.
function medal(d) {
  if (!d) return '';
  const n = daysUntil(d);
  if (n < -7) return '';
  return `<span class="nwf-medal num" aria-hidden="true">${n > 0 ? `<b>${n}</b><small>${tp(n, 'jour', 'jours')}</small>` : '<b>✓</b>'}</span>`;
}
// Paragraphes et listes à puces (lignes qui se suivent et commencent par « • » ou « - ») du texte écrit dans /admin.
const BULLET = /^\s*[•-]\s+/;
function bodyHTML(s) {
  return String(s || '').split(/\n{2,}/).map(par => {
    const runs = [];
    for (const l of par.split('\n')) {
      const li = BULLET.test(l), last = runs[runs.length - 1];
      if (last && last.li === li) last.lines.push(l); else runs.push({ li, lines: [l] });
    }
    return runs.map(r => (r.li ? `<ul>${r.lines.map(l => `<li>${esc(l.replace(BULLET, ''))}</li>`).join('')}</ul>` : `<p>${r.lines.map(esc).join('<br>')}</p>`)).join('');
  }).join('');
}
// Illustration d'un set : son premier général illustré.
const setArt = id => { const g = id && OWNABLE.find(x => GENERALS[x] && setOf(x) === id && portraitHTML(x)); return g ? portraitHTML(g) : ''; };
// Illustration d'une saison : son premier art Promo de général (comme le bandeau du passe sur l'accueil).
const seasonArt = x => { const promo = x?.promo.map(p => p.art).find(id => ARTS[id] && GENERALS[ARTS[id].card]); return promo ? portraitHTML(ARTS[promo].card, promo) : ''; };

// app : ce que main.js prête aux nouveautés (état ui, render, call, errLine).
export function createNews(app) {
  const { ui } = app;
  const N = ui.news = { list: null, upcoming: null, day: null, lead: null, open: null, tab: 'news' };

  async function load() {
    const r = await app.call('POST', '/api/news/seen');
    if (r) { N.list = r.news; N.upcoming = r.upcoming || []; N.day = r.today || today(); }
    app.render();
  }
  function go(id = null, tab = 'news') {
    ui.screen = 'news'; ui.error = ''; ui.sheet = null;
    N.lead = id; N.open = null; N.tab = tab;
    // L'annonce touchée sur l'accueil est déjà vue : la pastille s'éteint sans attendre le serveur.
    if (ui.account?.news) ui.account.news = { ...ui.account.news, unread: 0, top: null };
    load();
  }

  const shopBtn = p => {
    const set = p.set && setById(p.set);
    return set && setRevealed(set) && set.open !== false ? `<button class="btn primary" data-act="shop">${t('Voir dans la boutique')}</button>` : '';
  };

  // ---- Annonces ----
  // La une : grand bandeau aux couleurs de sa sorte, illustration du set à droite, médaillon du compte à rebours, texte complet dessous.
  function featured(p) {
    const art = p.set ? setArt(p.set) : '';
    return `<article class="nwf nw-${esc(p.kind)}" id="nw-${esc(p.id)}">
      <div class="nwf-band">
        ${art ? `<span class="nwf-art">${art}</span>` : `<span class="nwf-mark">${icon(p.kind)}</span>`}
        <span class="nwf-txt"><span class="eyebrow">${p.pinned ? `${t('Épinglé')} · ` : ''}${esc(kindName(p.kind))} · ${esc(dayLabel(p.from))}</span>
          <b>${esc(p.title)}</b>${p.summary ? `<small>${esc(p.summary)}</small>` : ''}</span>
        ${medal(p.date)}
        ${p.date && daysUntil(p.date) >= -7 ? `<span class="nwf-foot num">${esc(inDays(daysUntil(p.date)))} · ${esc(date(p.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</span>` : ''}
      </div>
      ${p.body || shopBtn(p) ? `<div class="nwf-body">${bodyHTML(p.body)}${shopBtn(p) ? `<div class="row">${shopBtn(p)}</div>` : ''}</div>` : ''}
    </article>`;
  }
  // Les autres : une ligne chacune (pastille de sa sorte, titre, date), qui s'ouvre sur place.
  function row(p) {
    const on = N.open === p.id;
    return `<article class="nwr nw-${esc(p.kind)} ${p.read ? '' : 'unread'} ${on ? 'open' : ''}" id="nw-${esc(p.id)}">
      <button class="nwr-head" data-act="news-open" data-id="${esc(p.id)}" aria-expanded="${on}">
        <span class="nw-badge">${icon(p.kind)}</span>
        <span class="nw-txt"><span class="eyebrow">${p.pinned ? `${t('Épinglé')} · ` : ''}${esc(kindName(p.kind))} · ${esc(dayLabel(p.from))}</span>
          <b>${p.read ? '' : `<span class="mdot" aria-label="${t('Nouveau')}"></span>`}${esc(p.title)}</b>
          ${p.summary && !on ? `<small>${esc(p.summary)}</small>` : ''}</span>
        ${countdown(p.date)}${CHEVRON}</button>
      ${on ? `<div class="nwr-body">${p.summary ? `<p class="nwr-sum">${esc(p.summary)}</p>` : ''}${bodyHTML(p.body)}${shopBtn(p) ? `<div class="row">${shopBtn(p)}</div>` : ''}</div>` : ''}
    </article>`;
  }
  function newsTab() {
    const L = N.list;
    if (!L.length) return `<div class="card-box"><p class="hint" style="margin:0">${t('Aucune annonce pour l\'instant. Les mises à jour, les nouveaux sets et les annonces de l\'équipe paraîtront ici.')}</p></div>`;
    // L'annonce touchée sur l'accueil passe à la une ; sinon la plus récente (ou l'épinglée).
    const lead = (N.lead && L.find(p => p.id === N.lead)) || L[0], rest = L.filter(p => p !== lead);
    return `${featured(lead)}
      ${rest.length ? `<section class="home-sec"><h3 class="home-h">${t('Toutes les annonces')}</h3><div class="nwrows">${rest.map(row).join('')}</div></section>` : ''}`;
  }

  // ---- À venir ----
  // Ce que montre une entrée du planning : pictogramme, couleur, illustration, titre et sous-titre.
  function entry(x) {
    if (x.kind === 'set') { const s = setById(x.id); return { ico: 'set', tone: 'set', art: setArt(x.id), title: t('Sortie du set {name}', { name: t(s?.name || x.id) }), sub: t('Nouveau set') }; }
    if (x.kind === 'season') { const s = SEASONS.find(y => y.id === x.id); return { ico: 'season', tone: 'season', art: seasonArt(s), title: t('Passe de saison : {name}', { name: t(s?.name || '') }), sub: t('Nouveau passe et nouvelle saison classée') }; }
    if (x.kind === 'seasonEnd') { const s = x.pass && SEASONS.find(y => y.id === x.pass); return { ico: 'season', tone: 'season', art: seasonArt(s), title: s ? t(s.name) : t('Saison {name}', { name: seasonName(x.id) }), sub: t('Saison classée et passe de saison') }; }
    if (x.kind === 'quest') { const q = questById(x.id); return { ico: 'quest', tone: 'quest', art: q ? portraitHTML(q.hero) : '', fam: q?.fam, title: t(q?.name || x.id), sub: t('Quête d\'histoire limitée') }; }
    if (x.kind === 'event') { const fx = EVENT_EFFECTS[x.effect]; return { ico: 'event', tone: 'event', title: t(x.name), sub: `${t('Événement')} · ${multLabel(x.mult)} ${t(fx?.chip || '')}` }; }
    if (x.kind === 'boss') { const g = GENERALS[x.id]; return { ico: 'boss', tone: 'boss', art: g ? portraitHTML(x.id, g.art) : '', fam: g?.fam, title: g?.name || x.id, sub: t('Boss mondial de la semaine') }; }
    const p = N.list.find(y => y.id === x.id);
    return { ico: p?.kind || 'update', tone: p?.kind || 'update', title: p?.title || '', sub: kindName(p?.kind), news: x.id };
  }
  // En ce moment : une carte par chose en cours, sa jauge (jours passés sur la période) et ce qui reste.
  function nowCard(x, day) {
    const e = entry(x), len = daysUntil(x.to, x.day) + 1, done = daysUntil(day, x.day) + 1, left = daysUntil(x.to, day) + 1;
    return `<div class="nwn nwt-${e.tone}" ${e.fam ? `style="${famStyle(e.fam)}"` : ''}>
      ${e.art ? `<span class="nwn-art">${e.art}</span>` : ''}
      <span class="nw-badge">${icon(e.ico)}</span>
      <span class="nw-txt"><span class="eyebrow">${esc(e.sub)}</span><b>${esc(e.title)}</b></span>
      <span class="nwn-left num">${left > 1 ? tp(left, 'encore {n} jour', 'encore {n} jours') : t('dernier jour')}</span>
      <span class="bar" aria-hidden="true"><span style="width:${Math.round(100 * Math.min(1, done / len))}%"></span></span>
      <span class="nwn-foot num">${t('jusqu\'au {date}', { date: esc(date(x.to, { weekday: 'long', day: 'numeric', month: 'long' })) })}</span></div>`;
  }
  // Bientôt : une ligne par jour (date en pavé, trait de la couleur de l'entrée), regroupées par mois.
  function soonRow(x, day) {
    const e = entry(x), n = daysUntil(x.day, day);
    return `<${e.news ? `button data-act="news-goto" data-id="${esc(e.news)}"` : 'div'} class="nws nwt-${e.tone}">
      <span class="nws-date"><small>${esc(date(x.day, { weekday: 'short' }))}</small><b class="num">${esc(date(x.day, { day: 'numeric' }))}</b></span>
      <span class="nws-line" aria-hidden="true"></span>
      <span class="nw-txt"><span class="eyebrow">${esc(e.sub)}</span><b>${esc(e.title)}</b>
        <small class="num">${esc(inDays(n))}${x.to && x.to !== x.day ? ` · ${t('jusqu\'au {date}', { date: esc(dayLabel(x.to)) })}` : ''}</small></span>
      ${e.art ? `<span class="nws-art">${e.art}</span>` : `<span class="nw-badge">${icon(e.ico)}</span>`}</${e.news ? 'button' : 'div'}>`;
  }
  function planTab() {
    const day = N.day || today(), U = N.upcoming || [], now = U.filter(x => x.now), soon = U.filter(x => !x.now);
    const months = [];
    for (const x of soon) { const m = x.day.slice(0, 7), last = months[months.length - 1]; if (last?.m === m) last.list.push(x); else months.push({ m, list: [x] }); }
    return `${now.length ? `<section class="home-sec"><h3 class="home-h">${t('En ce moment')}</h3><div class="nwnow">${now.map(x => nowCard(x, day)).join('')}</div></section>` : ''}
      ${months.map(({ m, list }) => `<section class="home-sec"><h3 class="home-h">${esc(date(`${m}-15`, { month: 'long', year: 'numeric' }))}</h3><div class="nwsoon">${list.map(x => soonRow(x, day)).join('')}</div></section>`).join('')}
      ${soon.length ? '' : `<div class="card-box"><p class="hint" style="margin:0">${t('Rien d\'autre de prévu pour l\'instant : les prochaines dates paraîtront ici.')}</p></div>`}`;
  }

  function screen() {
    const tab = N.tab, ready = !!N.list;
    const tabBtn = (id, label) => `<button role="tab" data-act="news-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}" aria-selected="${tab === id}">${label}</button>`;
    return `<div class="top"><span class="title">${t('Nouveautés')}</span><button class="btn" data-act="home">${t('Retour')}</button></div>
    <div class="seg btabs nwtabs" role="tablist" aria-label="${t('Nouveautés')}">${tabBtn('news', t('Annonces'))}${tabBtn('plan', t('À venir'))}</div>
    ${app.errLine()}
    <div class="nwscreen">${!ready ? `<p class="wait">${t('Chargement…')}</p>` : tab === 'plan' ? planTab() : newsTab()}</div>`;
  }

  // Accueil : bandeau de la dernière annonce pas encore vue (mise à jour majeure, set, annonce de set).
  function banner(a) {
    const top = a.news?.top;
    if (!top) return '';
    const more = a.news.unread - 1;
    return `<button class="nw-banner nw-${esc(top.kind)}" data-act="news" data-id="${esc(top.id)}">
      <span class="nw-badge">${icon(top.kind)}</span>
      <span class="nw-txt"><span class="eyebrow">${t('À la une')} · ${esc(kindName(top.kind))}${more > 0 ? ` · ${tp(more, '+{n} autre', '+{n} autres')}` : ''}</span>
        <b>${esc(top.title)}</b>${top.summary ? `<small>${esc(top.summary)}</small>` : ''}</span>
      ${countdown(top.date)}</button>`;
  }

  function click(a, ds) {
    if (a === 'news') go(ds.id || null);
    else if (a === 'news-open') { N.open = N.open === ds.id ? null : ds.id; app.render(); }
    else if (a === 'news-tab') { N.tab = ds.tab; app.render(); window.scrollTo(0, 0); }
    // Une annonce du planning : elle passe à la une de l'onglet Annonces.
    else if (a === 'news-goto') { N.lead = ds.id; N.open = null; N.tab = 'news'; app.render(); window.scrollTo(0, 0); }
    else return false;
    return true;
  }
  // Annonce parue pendant que le joueur est connecté : la pastille de l'accueil (et la liste ouverte) se mettent à jour.
  function pushed() {
    if (!ui.auth) return;
    api('GET', '/api/me', undefined, ui.auth).then(r => { ui.account = r.account; if (ui.screen === 'news') load(); else if (ui.screen !== 'game') app.render(); }).catch(() => {});
  }

  return { screen, banner, click, pushed, go };
}
