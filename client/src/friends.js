// Amis : liste, demandes, statut en ligne et défis. La connexion de présence reste ouverte tant que le joueur est connecté ;
// le serveur y signale les changements (« friends »), les défis reçus et leur issue.
import { api } from './api.js';
import { esc } from './common.js';
import { socialTabs } from './clan.js';
import { t, tp, tField } from '@jeu/engine/i18n';

const STATUS = { online: t('En ligne'), game: t('En partie'), off: t('Hors ligne') };

// Connexion de présence, rouverte seule après une coupure (téléphone en veille, réseau perdu).
function connectPresence(auth, onMsg) {
  let ws, closed = false, wait = 1000;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => { wait = 1000; ws.send(JSON.stringify({ t: 'hello', auth })); };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'bye') { closed = true; ws.close(); } else onMsg(m); };
    ws.onclose = () => { if (!closed) setTimeout(() => !closed && open(), wait = Math.min(wait * 2, 15000)); };
  }
  open();
  return {
    send: m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
    close: () => { closed = true; ws.close(); },
  };
}

// app : ce que main.js prête à l'écran des amis (état ui, render, call, avatarHTML, deckError, play, startFriendMatch).
export function createFriends(app) {
  const { ui } = app;
  const f = ui.friends = { list: null, avatars: {}, query: '', note: '', challengeIn: null, challengeOut: null, match: null, deck: null, removing: null };
  let link = null, loading = false;

  async function refresh() {
    if (!ui.auth || loading) return;
    loading = true;
    try { setList(await api('GET', '/api/friends', undefined, ui.auth)); } catch { /* liste gardée */ }
    loading = false;
    app.render();
  }
  function setList(r) {
    f.list = { friends: r.friends, incoming: r.incoming, outgoing: r.outgoing };
    f.challengeIn = r.challengeIn; f.challengeOut = r.challengeOut;
    // Images de profil : demandées seulement quand l'une d'elles a changé.
    const all = [...r.friends, ...r.incoming, ...r.outgoing];
    if (all.some(p => p.avatar && f.avatars[p.login]?.key !== p.avatar)) {
      api('GET', '/api/friends/avatars', undefined, ui.auth).then(({ avatars }) => {
        for (const p of all) if (avatars[p.login]) f.avatars[p.login] = { key: p.avatar, src: avatars[p.login] };
        app.render();
      }).catch(() => {});
    }
  }
  // Message du serveur (champ msg) : traduit pour l'affichage ; le bandeau propose « Voir mes amis » pour une demande d'ami.
  const setNote = o => { f.note = o?.msg ? tField(o, 'msg') : ''; f.noteFriends = /demande|accepté|request|accepted/i.test(o?.msg || ''); };
  function onMsg(m) {
    if (m.t === 'hello' || m.t === 'friends') { if (m.msg) setNote(m); refresh(); return; }
    // Nouveau message au courrier (mail.js).
    if (m.t === 'mail') { app.onMail?.(); return; }
    if (m.t === 'challenge') { f.challengeIn = { id: m.id, from: m.from, ranked: m.ranked }; app.play('reveal'); }
    else if (m.t === 'challenge-sent') f.challengeOut = { id: m.id, to: m.to, ranked: m.ranked };
    else if (m.t === 'challenge-error') setNote(m);
    else if (m.t === 'challenge-gone') {
      if (f.challengeIn?.id === m.id) f.challengeIn = null;
      if (f.challengeOut?.id === m.id) f.challengeOut = null;
      // Salon d'un défi annulé pendant le choix du deck.
      if (m.room && f.match?.room === m.room) { f.match = null; if (ui.sheet === 'friend-deck') ui.sheet = null; }
      if (m.msg && ui.screen !== 'game') setNote(m);
    } else if (m.t === 'challenge-ready') {
      f.challengeIn = null; f.challengeOut = null;
      const playable = ui.account.decks.filter(d => !app.deckError(d, ui.account));
      f.match = { room: m.room, foe: m.foe, ranked: !!m.ranked };
      f.deck = (playable.find(d => d.id === ui.account.active) || playable[0])?.id || null;
      ui.sheet = 'friend-deck';
    } else return;
    app.render();
  }

  // Appel à l'API des amis : la réponse porte la liste à jour et parfois un message.
  async function act(path, body) {
    const r = await app.call('POST', path, body);
    if (r) { setList(r); setNote(r); if (path.endsWith('/add')) f.query = ''; }
    app.render();
  }

  const avatar = p => app.avatarHTML({ name: p.name, avatar: f.avatars[p.login]?.src || null }, '', p.frame);
  const who = p => `<span class="fwho">${avatar(p)}<span class="fname"><b>${esc(p.name)}</b>
    <small class="hint">${p.level ? t('niv. {n}', { n: p.level }) : ''}${p.title ? ` · <span class="ptitle">${esc(t(p.title))}</span>` : ''}</small></span></span>`;
  function friendRow(p) {
    const out = f.challengeOut, busy = !!out || !!f.challengeIn;
    const btn = out && out.to.login === p.login ? `<button class="btn sm" data-act="friend-cancel">${t('Annuler le défi')}</button>`
      : `<button class="btn sm ${p.status === 'online' ? 'primary' : ''}" data-act="friend-challenge" data-login="${esc(p.login)}" ${p.status === 'online' && !busy ? '' : 'disabled'}>${t('Défier')}</button>
        <button class="btn sm" data-act="friend-challenge" data-ranked="1" data-login="${esc(p.login)}" ${p.status === 'online' && !busy ? '' : 'disabled'}>${t('Défi classé')}</button>`;
    const confirm = f.removing === p.login;
    return `<div class="frow"><span class="fstatus ${p.status}" title="${STATUS[p.status]}"></span>${who(p)}
      <small class="fstate ${p.status}">${STATUS[p.status]}</small>
      <div class="row fbtns">${confirm ? `<button class="btn sm" data-act="friend-remove" data-login="${esc(p.login)}">${t('Confirmer le retrait')}</button><button class="btn sm" data-act="friend-keep">${t('Garder')}</button>`
        : `${btn}<button class="btn sm" data-act="friend-ask-remove" data-login="${esc(p.login)}" aria-label="${t('Retirer {name} de vos amis', { name: esc(p.name) })}">${t('Retirer')}</button>`}</div></div>`;
  }

  function screen() {
    const L = f.list;
    const note = f.note ? `<p class="hint" role="status" style="margin:0">${esc(f.note)}</p>` : '';
    const block = (title, body) => `<div class="card-box"><span class="eyebrow">${title}</span>${body}</div>`;
    const online = L ? L.friends.filter(p => p.status !== 'off').length : 0;
    return `<div class="top"><span class="title">${t('Social')}</span></div>${socialTabs('friends')}
    ${app.errLine()}${note}
    <form class="card-box" id="friend-form">
      <div class="field"><label class="eyebrow" for="friend-query">${t('Ajouter un ami')}</label>
        <input id="friend-query" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="${t('Pseudo ou identifiant')}" value="${esc(f.query)}"></div>
      <div class="row"><button class="btn primary" type="submit" ${ui.busy || !f.query.trim() ? 'disabled' : ''}>${t('Envoyer une demande')}</button></div>
    </form>
    ${!L ? `<p class="wait">${t('Chargement…')}</p>` : `
    ${L.incoming.length ? block(t('Demandes reçues ({n})', { n: L.incoming.length }), `<div class="flist">${L.incoming.map(p => `<div class="frow">${who(p)}<div class="row fbtns">
      <button class="btn sm primary" data-act="friend-accept" data-login="${esc(p.login)}" ${ui.busy ? 'disabled' : ''}>${t('Accepter')}</button>
      <button class="btn sm" data-act="friend-remove" data-login="${esc(p.login)}" ${ui.busy ? 'disabled' : ''}>${t('Refuser')}</button></div></div>`).join('')}</div>`) : ''}
    ${block(L.friends.length ? tp(online, 'Amis · {n} connecté sur {total}', 'Amis · {n} connectés sur {total}', { total: L.friends.length }) : t('Amis'), L.friends.length
      ? `<div class="flist">${L.friends.map(friendRow).join('')}</div><p class="hint" style="margin:0">${t('Défiez un ami connecté : s\'il accepte, chacun choisit son deck et la partie commence. Un défi classé compte pour le rang des deux.')}</p>`
      : `<p class="hint" style="margin:0">${t('Pas encore d\'amis. Demandez-leur leur pseudo et envoyez une demande.')}</p>`)}
    ${L.outgoing.length ? block(t('Demandes envoyées'), `<div class="flist">${L.outgoing.map(p => `<div class="frow">${who(p)}<div class="row fbtns">
      <button class="btn sm" data-act="friend-remove" data-login="${esc(p.login)}" ${ui.busy ? 'disabled' : ''}>${t('Annuler')}</button></div></div>`).join('')}</div>`) : ''}`}`;
  }

  // Bandeau de défi, par-dessus tous les écrans hors partie.
  function banner() {
    if (['game', 'lobby', 'login', 'loading'].includes(ui.screen) || ui.sheet === 'friend-deck') return '';
    if (f.challengeIn) return `<div class="fbanner" role="alertdialog" aria-label="${t('Défi reçu')}"><span>${f.challengeIn.ranked ? t('<b>{name}</b> vous défie en classé !', { name: esc(f.challengeIn.from.name) }) : t('<b>{name}</b> vous défie !', { name: esc(f.challengeIn.from.name) })}</span>
      <div class="row"><button class="btn primary" data-act="friend-yes">${t('Accepter')}</button><button class="btn" data-act="friend-no">${t('Refuser')}</button></div></div>`;
    if (f.challengeOut) return `<div class="fbanner" role="status"><span class="wait">${f.challengeOut.ranked ? t('Défi classé envoyé à <b>{name}</b>, en attente de sa réponse…', { name: esc(f.challengeOut.to.name) }) : t('Défi envoyé à <b>{name}</b>, en attente de sa réponse…', { name: esc(f.challengeOut.to.name) })}</span>
      <div class="row"><button class="btn" data-act="friend-cancel">${t('Annuler')}</button></div></div>`;
    if (f.note && ui.screen !== 'friends') return `<div class="fbanner" role="status"><span>${esc(f.note)}</span>
      <div class="row">${f.noteFriends ? `<button class="btn" data-act="friends">${t('Voir mes amis')}</button>` : ''}<button class="btn" data-act="friend-ok">${t('OK')}</button></div></div>`;
    return '';
  }

  // Défi accepté : choix du deck avant d'entrer dans le salon.
  function deckSheet() {
    const a = ui.account, decks = a.decks.filter(d => !app.deckError(d, a));
    return `<div class="sheet"><div class="panel" role="dialog" aria-label="${t('Choix du deck')}"><div class="ph"><h2>${f.match.ranked ? t('Partie classée contre {name}', { name: esc(f.match.foe) }) : t('Partie contre {name}', { name: esc(f.match.foe) })}</h2></div>
      <span class="eyebrow">${t('Choisissez votre deck')}</span>
      <div class="decks">${decks.map(d => `<button class="deckopt ${f.deck === d.id ? 'sel' : ''}" data-act="friend-deck" data-id="${d.id}" aria-pressed="${f.deck === d.id}">
        <b>${esc(d.name)}</b><small>${esc(app.generalName(d.general))} · ${tp(d.cards.length, '{n} carte', '{n} cartes')}</small></button>`).join('')}</div>
      <div class="row"><button class="btn primary" data-act="friend-play" ${f.deck ? '' : 'disabled'}>${t('Jouer avec ce deck')}</button>
        <button class="btn" data-act="friend-abort">${t('Annuler la partie')}</button></div></div></div>`;
  }

  // Clics de l'écran, du bandeau et du choix du deck. Renvoie true si l'action a été traitée ici.
  function click(a, ds) {
    if (a === 'friends') { ui.screen = 'friends'; ui.error = ''; f.note = ''; f.removing = null; refresh(); app.render(); }
    else if (a === 'friend-accept' && !ui.busy) act('/api/friends/accept', { login: ds.login });
    else if (a === 'friend-remove' && !ui.busy) { f.removing = null; act('/api/friends/remove', { login: ds.login }); }
    else if (a === 'friend-ask-remove') { f.removing = ds.login; app.render(); }
    else if (a === 'friend-keep') { f.removing = null; app.render(); }
    else if (a === 'friend-challenge') { f.note = ''; link?.send({ t: 'challenge', to: ds.login, ranked: !!ds.ranked }); }
    else if (a === 'friend-cancel' && f.challengeOut) link?.send({ t: 'challenge-cancel', id: f.challengeOut.id });
    else if ((a === 'friend-yes' || a === 'friend-no') && f.challengeIn) { link?.send({ t: 'challenge-answer', id: f.challengeIn.id, accept: a === 'friend-yes' }); f.challengeIn = null; app.render(); }
    else if (a === 'friend-ok') { f.note = ''; app.render(); }
    else if (a === 'friend-deck') { f.deck = ds.id; app.render(); }
    else if (a === 'friend-play' && f.match && f.deck) { const m = f.match; f.match = null; ui.sheet = null; app.startFriendMatch(m.room, f.deck, m.foe); }
    else if (a === 'friend-abort' && f.match) { link?.send({ t: 'challenge-abort', room: f.match.room }); f.match = null; ui.sheet = null; app.render(); }
    else return false;
    return true;
  }
  function input(e) {
    if (e.target.id !== 'friend-query') return false;
    f.query = e.target.value;
    const b = e.target.form?.querySelector('[type=submit]'); if (b) b.disabled = ui.busy || !f.query.trim();
    return true;
  }
  function submit(form) {
    if (form.id !== 'friend-form') return false;
    if (f.query.trim()) act('/api/friends/add', { name: f.query.trim() });
    return true;
  }

  return {
    screen, banner, deckSheet, click, input, submit,
    // Demandes reçues, pour le bouton de l'accueil.
    pending: () => f.list?.incoming.length || 0,
    start() { if (!link && ui.auth) link = connectPresence(ui.auth, onMsg); },
    stop() { link?.close(); link = null; Object.assign(f, { list: null, avatars: {}, note: '', challengeIn: null, challengeOut: null, match: null }); },
  };
}
