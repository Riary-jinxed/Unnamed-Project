// Courrier : messages de l'équipe du jeu (annonces, événements, cadeaux à récupérer) et codes cadeaux.
// L'enveloppe en haut de l'accueil ouvre l'écran du courrier ; sa pastille compte les messages non lus et les récompenses à récupérer.
// Un code cadeau se saisit dans le courrier et dans la boutique.
import { api } from './api.js';
import { esc } from './common.js';
import { t, tp, tField, locale } from '@jeu/engine/i18n';

const ENVELOPE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
const frDay = iso => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });
const frDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' });

// app : ce que main.js prête au courrier (état ui, render, call, errLine, rewardItem, play).
export function createMail(app) {
  const { ui } = app;
  const m = ui.mail = { list: null, open: null, code: '', note: '', got: null, news: false };

  async function load() {
    const r = await app.call('GET', '/api/mail');
    if (r) m.list = r.mail;
    app.render();
  }
  async function act(path, body) {
    const r = await app.call('POST', path, body);
    if (!r) return;
    m.list = r.mail;
    if (r.got) { m.got = r.got; ui.sheet = 'mail-got'; app.play('reveal'); }
    app.render();
  }
  // Ouvrir un message le marque comme lu, sans attendre le serveur.
  function open(id) {
    m.open = m.open === id ? null : id;
    const msg = m.list?.find(x => x.id === id);
    if (msg && !msg.read) {
      msg.read = true;
      api('POST', '/api/mail/read', { id }, ui.auth).then(r => { m.list = r.mail; ui.account = r.account; app.render(); }).catch(() => {});
    }
    app.render();
  }
  async function redeem() {
    const code = m.code.trim(); if (!code) return;
    const r = await app.call('POST', '/api/redeem', { code });
    if (!r) return;
    m.code = ''; m.got = [r.got]; ui.sheet = 'mail-got'; app.play('reveal');
    app.render();
  }

  const pending = x => !!x.reward && !x.got;
  function item(x) {
    const on = m.open === x.id;
    return `<article class="card-box mailmsg kind-${x.kind} ${x.read ? '' : 'unread'}">
      <button class="mailhead" data-act="mail-open" data-id="${x.id}" aria-expanded="${on}">
        <span class="eyebrow">${esc(t(x.kindName))} · ${frDay(x.at)}</span>
        <b>${x.read ? '' : `<span class="mdot" aria-label="${t('Non lu')}"></span>`}${esc(tField(x, 'title'))}</b>
        ${pending(x) ? `<span class="chip gift">${t('Cadeau à récupérer')}</span>` : x.reward ? `<span class="chip ok">${t('Récupéré ✓')}</span>` : ''}</button>
      ${on ? `${x.body ? `<p class="mailbody">${esc(tField(x, 'body')).replace(/\n/g, '<br>')}</p>` : ''}
        ${x.reward ? `<div class="rewards">${app.rewardItem({ label: t('Récompense'), ...x.reward })}</div>` : ''}
        ${x.until ? `<p class="hint" style="margin:0">${t('Jusqu\'au {date}.', { date: frDate(x.until) })}</p>` : ''}
        <div class="row">${pending(x) ? `<button class="btn primary" data-act="mail-claim" data-id="${x.id}" ${ui.busy ? 'disabled' : ''}>${t('Récupérer')}</button>` : ''}
          ${pending(x) ? '' : `<button class="btn sm" data-act="mail-hide" data-id="${x.id}" ${ui.busy ? 'disabled' : ''}>${t('Supprimer')}</button>`}</div>` : ''}
    </article>`;
  }

  // Formulaire du code cadeau, dans le courrier et dans la boutique.
  const codeForm = () => `<form class="card-box codeform" id="gift-form">
    <div class="field"><label class="eyebrow" for="gift-code">${t('Code cadeau')}</label>
      <input id="gift-code" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${t('Entrez votre code')}" value="${esc(m.code)}"></div>
    <p class="hint" style="margin:0">${t('Les codes sont donnés pendant les événements et sur nos réseaux. Chacun ne sert qu\'une fois par compte.')}</p>
    <div class="row"><button class="btn primary" type="submit" ${ui.busy || !m.code.trim() ? 'disabled' : ''}>${t('Valider le code')}</button></div></form>`;

  // Nouveautés (icône du quotidien sur l'accueil) : le même écran, réduit aux annonces (notes de mise à jour, nouveaux sets).
  function newsScreen() {
    const L = m.list && m.list.filter(x => x.kind === 'news');
    return `<div class="top"><span class="title">${t('Nouveautés')}</span><button class="btn" data-act="home">${t('Retour')}</button></div>
    ${app.errLine()}
    ${!L ? `<p class="wait">${t('Chargement…')}</p>` : L.length ? `<div class="maillist">${L.map(item).join('')}</div>`
      : `<div class="card-box"><p class="hint" style="margin:0">${t('Aucune nouveauté pour l\'instant. Les mises à jour et les nouveaux sets seront annoncés ici.')}</p></div>`}`;
  }
  function screen() {
    if (m.news) return newsScreen();
    const L = m.list, waiting = L ? L.filter(pending).length : 0;
    return `<div class="top"><span class="title">${t('Courrier')}</span><button class="btn" data-act="home">${t('Retour')}</button></div>
    ${app.errLine()}
    ${waiting > 1 ? `<div class="card-box booster ready"><div><span class="eyebrow">${t('Cadeaux')}</span><h2 style="font-size:20px">${tp(waiting, '{n} récompense à récupérer', '{n} récompenses à récupérer')}</h2></div>
      <button class="btn primary" data-act="mail-claim-all" ${ui.busy ? 'disabled' : ''}>${t('Tout récupérer')}</button></div>` : ''}
    ${!L ? `<p class="wait">${t('Chargement…')}</p>` : L.length ? `<div class="maillist">${L.map(item).join('')}</div>`
      : `<div class="card-box"><p class="hint" style="margin:0">${t('Aucun message pour l\'instant. Les annonces, les événements et les cadeaux de l\'équipe arriveront ici.')}</p></div>`}
    ${codeForm()}`;
  }

  // Ce qu'on vient de recevoir (message ou code cadeau).
  function gotSheet() {
    const extra = r => (r.card && r.cardFresh === false ? `<p class="hint" style="margin:0">${t('Vous aviez déjà cette carte : elle devient {n} Éclats et de l\'essence.', { n: r.cardShards })}</p>` : '');
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1" role="dialog" aria-label="${t('Récompenses reçues')}"><div class="ph"><h2>${t('Récupéré')}</h2><button class="btn" data-act="close">${t('Fermer')}</button></div>
      <div class="rewards">${(m.got || []).map(r => app.rewardItem(r) + extra(r)).join('')}</div>
      ${(m.got || []).some(r => r.boosters) ? `<p class="hint" style="margin:0">${t('Les boosters offerts s\'ouvrent dans la boutique, les coffres d\'arts dans son onglet Arts.')}</p>`
        : (m.got || []).some(r => r.chests) ? `<p class="hint" style="margin:0">${t('Les coffres d\'arts offerts s\'ouvrent dans la boutique, onglet Arts.')}</p>` : ''}
      <div class="row"><button class="btn primary" data-act="close">${t('Super !')}</button></div></div></div>`;
  }

  // Enveloppe de l'accueil.
  function button() {
    const n = ui.account?.mail || 0;
    return `<button class="btn icon mailbtn" data-act="mail" aria-label="${n ? tp(n, 'Courrier, {n} nouveau', 'Courrier, {n} nouveaux') : t('Courrier')}" title="${t('Courrier')}">${ENVELOPE}${n ? `<span class="badge num">${n}</span>` : ''}</button>`;
  }

  function click(a, ds) {
    if (a === 'mail' || a === 'news') { ui.screen = 'mail'; ui.error = ''; m.open = null; m.news = a === 'news'; load(); }
    else if (a === 'mail-open') open(ds.id);
    else if (a === 'mail-claim' && !ui.busy) act('/api/mail/claim', { id: ds.id });
    else if (a === 'mail-claim-all' && !ui.busy) act('/api/mail/claim-all');
    else if (a === 'mail-hide' && !ui.busy) { m.open = null; act('/api/mail/hide', { id: ds.id }); }
    else return false;
    return true;
  }
  function input(e) {
    if (e.target.id !== 'gift-code') return false;
    m.code = e.target.value;
    const b = e.target.form?.querySelector('[type=submit]'); if (b) b.disabled = ui.busy || !m.code.trim();
    return true;
  }
  function submit(form) {
    if (form.id !== 'gift-form') return false;
    redeem();
    return true;
  }
  // Nouveau message envoyé par l'administration pendant que le joueur est connecté.
  function pushed() {
    if (!ui.auth) return;
    api('GET', '/api/me', undefined, ui.auth).then(r => { ui.account = r.account; if (ui.screen === 'mail') load(); else if (ui.screen !== 'game') app.render(); }).catch(() => {});
  }

  return { screen, codeForm, gotSheet, button, click, input, submit, pushed, closeGot: () => { m.got = null; } };
}
