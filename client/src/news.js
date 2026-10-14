// Nouveautés : le journal du jeu (mises à jour majeures, nouveaux sets, annonce du prochain set, grands événements), écrit depuis /admin.
// À la une sur l'accueil (bandeau de la dernière annonce pas encore vue, puis tuile), écran de la liste, compte à rebours vers le jour annoncé.
// Ouvrir l'écran marque toutes les annonces comme vues (server/src/news.js).
import './news.css';
import { api } from './api.js';
import { esc } from './common.js';
import { t, tp, locale } from '@jeu/engine/i18n';
import { setById, setRevealed, today } from '@jeu/engine/collection';

export const NEWS_KINDS = { update: 'Mise à jour majeure', set: 'Nouveau set', teaser: 'Annonce de set', event: 'Événement' };
// Pictogrammes des sortes : flèche de mise à jour, paquet de cartes, étoile filante, drapeau.
const ICONS = {
  update: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  set: '<rect x="4" y="6" width="11" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>',
  teaser: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  event: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
};
const icon = k => `<svg class="nw-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.update}</svg>`;
const kindName = k => t(NEWS_KINDS[k] || NEWS_KINDS.update);
const dayLabel = d => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' });
const daysUntil = d => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86400000);
// Compte à rebours vers le jour annoncé (sortie d'un set, d'une mise à jour) : rien une fois passé de plus d'une semaine.
function countdown(d) {
  if (!d) return '';
  const n = daysUntil(d);
  if (n < -7) return '';
  const text = n > 1 ? tp(n, 'Dans {n} jour', 'Dans {n} jours') : n === 1 ? t('Demain') : n === 0 ? t('Aujourd\'hui') : t('Disponible');
  return `<span class="nw-count ${n <= 0 ? 'now' : ''}"><b class="num">${text}</b><small>${esc(dayLabel(d))}</small></span>`;
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

// app : ce que main.js prête aux nouveautés (état ui, render, call, errLine).
export function createNews(app) {
  const { ui } = app;
  const N = ui.news = { list: null, lead: null, open: null };

  async function load() {
    const r = await app.call('POST', '/api/news/seen');
    if (r) N.list = r.news;
    app.render();
  }
  function go(id = null) {
    ui.screen = 'news'; ui.error = ''; ui.sheet = null;
    N.lead = id; N.open = null;
    // L'annonce touchée sur l'accueil est déjà vue : la pastille s'éteint sans attendre le serveur.
    if (ui.account?.news) ui.account.news = { ...ui.account.news, unread: 0, top: null };
    load();
  }

  const shopBtn = p => {
    const set = p.set && setById(p.set);
    return set && setRevealed(set) && set.open !== false ? `<button class="btn primary" data-act="shop">${t('Voir dans la boutique')}</button>` : '';
  };
  function item(p, first) {
    const on = first || N.open === p.id;
    return `<article class="card-box nw nw-${esc(p.kind)} ${first ? 'nw-hero' : ''} ${p.read ? '' : 'unread'}" id="nw-${esc(p.id)}">
      <button class="nw-head" ${first ? 'disabled' : `data-act="news-open" data-id="${esc(p.id)}" aria-expanded="${on}"`}>
        <span class="nw-badge">${icon(p.kind)}</span>
        <span class="nw-txt"><span class="eyebrow">${p.pinned ? `${t('Épinglé')} · ` : ''}${esc(kindName(p.kind))} · ${esc(dayLabel(p.from))}</span>
          <b>${p.read ? '' : `<span class="mdot" aria-label="${t('Nouveau')}"></span>`}${esc(p.title)}</b>
          ${p.summary ? `<small>${esc(p.summary)}</small>` : ''}</span>
        ${countdown(p.date)}</button>
      ${on && (p.body || shopBtn(p)) ? `<div class="nw-body">${bodyHTML(p.body)}${shopBtn(p) ? `<div class="row">${shopBtn(p)}</div>` : ''}</div>` : ''}
    </article>`;
  }

  function screen() {
    const L = N.list;
    // L'annonce touchée sur l'accueil s'ouvre en tête de liste ; sinon la plus récente (ou l'épinglée). Les autres s'ouvrent sur place.
    const list = L && N.lead ? [L.find(p => p.id === N.lead), ...L.filter(p => p.id !== N.lead)].filter(Boolean) : L;
    return `<div class="top"><span class="title">${t('Nouveautés')}</span><button class="btn" data-act="home">${t('Retour')}</button></div>
    ${app.errLine()}
    ${!list ? `<p class="wait">${t('Chargement…')}</p>` : list.length ? `<div class="nwlist">${list.map((p, i) => item(p, i === 0)).join('')}</div>`
      : `<div class="card-box"><p class="hint" style="margin:0">${t('Aucune annonce pour l\'instant. Les mises à jour, les nouveaux sets et les annonces de l\'équipe paraîtront ici.')}</p></div>`}`;
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
  // Tuile de l'accueil : la dernière annonce parue, toujours là pour relire le journal.
  function tile(a) {
    const n = a.news;
    if (!n?.last) return '';
    const cd = n.last.date && daysUntil(n.last.date) > 0 ? tp(daysUntil(n.last.date), 'Dans {n} jour', 'Dans {n} jours') : '';
    return `<button class="tile nwtile ${n.unread ? 'todo' : ''}" data-act="news"><span class="eyebrow">${t('Nouveautés')}</span><b>${esc(n.last.title)}</b>
      <span class="tile-foot">${n.unread ? tp(n.unread, '{n} nouvelle annonce', '{n} nouvelles annonces') : cd || esc(kindName(n.last.kind))}</span></button>`;
  }

  function click(a, ds) {
    if (a === 'news') go(ds.id || null);
    else if (a === 'news-open') { N.open = N.open === ds.id ? null : ds.id; app.render(); }
    else return false;
    return true;
  }
  // Annonce parue pendant que le joueur est connecté : la pastille de l'accueil (et la liste ouverte) se mettent à jour.
  function pushed() {
    if (!ui.auth) return;
    api('GET', '/api/me', undefined, ui.auth).then(r => { ui.account = r.account; if (ui.screen === 'news') load(); else if (ui.screen !== 'game') app.render(); }).catch(() => {});
  }

  return { screen, banner, tile, click, pushed, go };
}
