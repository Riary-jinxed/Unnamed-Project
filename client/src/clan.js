// Clans : créer ou rejoindre un clan, missions de clan (du jour et de la semaine, cumulées sur tous les membres), membres et demandes,
// dons de ressources contre des Écus, magasin du clan et classement mensuel des clans. Le serveur fait tout (server/src/clans.js) ;
// cet écran affiche ce qu'il renvoie.
import { api } from './api.js';
import { esc } from './common.js';
import { artHTML } from './art.js';
import { CARDS, GENERALS } from '@jeu/engine';
import { ARTS, rarityName } from '@jeu/engine/arts';
import { CLAN_ICONS, CLAN_COLORS, CLAN_PRICE, CLAN_NAME_MAX, CLAN_DESC_MAX, CLAN_LEVELS, clanLevelOf, CLAN_ROLES, ROLE_RANK, canDo } from '@jeu/engine/clans';
import { seasonName } from '@jeu/engine/ranked';
import { TITLES } from '@jeu/engine/rewards';
import { t, tp, tField, locale } from '@jeu/engine/i18n';
import { createClanBoss } from './clan-boss.js';
import { clanBossPct } from '@jeu/engine/clan-boss';

// Symboles du blason (viewBox 24 × 24), posés en clair sur l'écu de la couleur du clan.
const SYMBOLS = {
  epee: '<path d="M12 1.5 14 4v11h-4V4z"/><path d="M6.5 14.5h11v2h-11z"/><path d="M11 16.5h2V21h-2z"/><circle cx="12" cy="22" r="1.6"/>',
  couronne: '<path d="M3 18 2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 11z"/><path d="M3 19.5h18V22H3z"/>',
  bouclier: '<path d="M12 2 20 5v6c0 6-4 9.5-8 11-4-1.5-8-5-8-11V5z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M11 6h2v12h-2zM7 10.5h10v2H7z"/>',
  etoile: '<path d="m12 1.8 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.3 3.6 1.5-7.1-5.4-4.9 7.2-.8z"/>',
  lune: '<path d="M15.5 2.5A10 10 0 1 0 21.5 18 8 8 0 0 1 15.5 2.5z"/>',
  flamme: '<path d="M12 1.5c1 4 6 6.5 6 12.5a6 6 0 0 1-12 0c0-3 1.5-5 3-6.5 0 2.5 1 4 2.5 4.5C10 8 11 5 12 1.5z"/>',
  arbre: '<circle cx="12" cy="8.5" r="6.5"/><circle cx="7" cy="12.5" r="4"/><circle cx="17" cy="12.5" r="4"/><path d="M10.8 13h2.4v9h-2.4z"/>',
  crane: '<path d="M12 2a8.5 8.5 0 0 0-8.5 8.5c0 3 1.5 5 3.5 6v3.5h10V16.5c2-1 3.5-3 3.5-6A8.5 8.5 0 0 0 12 2z"/><circle cx="8.5" cy="11" r="2.3" fill="var(--crest)"/><circle cx="15.5" cy="11" r="2.3" fill="var(--crest)"/><path d="M10 20h1.2v-3H10zM12.8 20H14v-3h-1.2z" fill="var(--crest)"/>',
};
const SHIELD = 'M3 3h34v16c0 13-8 21-17 25C11 40 3 32 3 19z';
// Blason d'un clan : écu de sa couleur, son symbole, et le liseré de sa meilleure bannière du classement.
export function crestHTML(c, cls = '') {
  const color = CLAN_COLORS[c.color] || CLAN_COLORS.azur;
  return `<span class="crest ${c.banner ? `cb-${esc(c.banner.id)}` : ''} ${cls}" style="--crest:${color}" aria-hidden="true"><svg viewBox="0 0 40 46">
    <path d="${SHIELD}" fill="${color}" stroke="currentColor" stroke-width="2.5"/><path d="M6 6h28v6H6z" fill="#fff" opacity=".14"/>
    <g transform="translate(8 9) scale(1)" fill="#fff8e6">${SYMBOLS[c.icon] || SYMBOLS.bouclier}</g></svg></span>`;
}
const tagHTML = c => `<span class="ctag">[${esc(c.tag)}]</span>`;
const bannerHTML = b => (b ? `<span class="cbanner cb-${esc(b.id)}">${esc(t(b.name))} · ${esc(seasonName(b.season))}</span>` : '');
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const ROLE_ICON = { maitre: '♛', adjoint: '⚜', souschef: '✦', membre: '' };
const roleHTML = r => (r === 'membre' ? '' : `<span class="crole r-${r}">${ROLE_ICON[r]} ${t(CLAN_ROLES[r])}</span> · `);
// Onglets de l'écran Social (barre du bas) : les amis et le clan.
export const socialTabs = cur => `<div class="seg socialtabs" role="tablist" aria-label="${t('Social')}">${[['friends', t('Amis')], ['clan', t('Clan')]].map(([id, label]) =>
  `<button role="tab" data-act="${id}" class="${cur === id ? 'on' : ''}" aria-selected="${cur === id}">${label}</button>`).join('')}</div>`;
const TABS = [['clan', t('Clan')], ['boss', t('Boss')], ['membres', t('Membres')], ['dons', t('Dons')], ['magasin', t('Magasin')], ['classement', t('Classement')]];

// app : ce que main.js prête à l'écran (état ui, render, call, avatarHTML, errLine, ico, openPlayer, play).
export function createClan(app) {
  const { ui } = app;
  const C = ui.clan = { data: null, tab: 'clan', list: null, query: '', ladder: null, form: null, edit: null, confirm: null, note: '', avatars: {} };
  const me = () => C.data?.clan;
  // Boss de clan (clan-boss.js) : son onglet.
  const raid = createClanBoss(app);

  async function load() {
    try { set(await api('GET', '/api/clan', undefined, ui.auth)); } catch (e) { ui.error = e.message; }
    app.render();
    if (!me()) search();
    if (C.tab === 'classement') ladder();
    if (C.tab === 'boss' && me()) raid.load();
  }
  function set(r) {
    C.data = r;
    // Images de profil des membres : demandées seulement quand l'une d'elles a changé.
    const ppl = r.clan ? [...r.clan.members, ...r.clan.requests] : [];
    if (ppl.some(p => p.avatar && C.avatars[p.login]?.key !== p.avatar)) {
      api('GET', '/api/clan/avatars', undefined, ui.auth).then(({ avatars }) => {
        for (const p of ppl) if (avatars[p.login]) C.avatars[p.login] = { key: p.avatar, src: avatars[p.login] };
        app.render();
      }).catch(() => {});
    }
  }
  async function search() {
    try { C.list = (await api('GET', `/api/clans?q=${encodeURIComponent(C.query.trim())}`, undefined, ui.auth)).clans; } catch (e) { ui.error = e.message; }
    app.render();
  }
  async function ladder() {
    try { C.ladder = await api('GET', '/api/clans/ladder', undefined, ui.auth); } catch (e) { ui.error = e.message; }
    app.render();
  }
  // Appel à l'API des clans : la réponse porte l'écran à jour et parfois un message.
  async function act(path, body, after) {
    C.note = '';
    const r = await app.call('POST', path, body);
    if (r) { set(r); C.note = r.msg ? tField(r, 'msg') : ''; after?.(r); if (r.got?.art) app.gotArt?.(r.got.art); }
    if (r && !me()) search();
    app.render();
    return r;
  }

  // ---- Morceaux d'écran ----
  const avatar = p => app.avatarHTML({ name: p.name, avatar: C.avatars[p.login]?.src || null }, 'cav', p.frame);
  const block = (title, body, cls = '') => `<div class="card-box ${cls}"><span class="eyebrow">${title}</span>${body}</div>`;
  const note = () => (C.note ? `<p class="hint" role="status" style="margin:0">${esc(C.note)}</p>` : '');
  const busy = () => (ui.busy ? 'disabled' : '');
  const coins = n => `<span class="num">${app.ico('ecu')}${n}</span>`;

  function head(title) {
    return `<div class="top"><span class="title">${title}</span><span class="wallet"><span class="chip num cur ecu" title="${t('Écus')}">${app.ico('ecu')}${C.data?.coins ?? 0}</span></span></div>
      ${socialTabs('clan')}`;
  }

  // Sans clan : en créer un, ou en rejoindre un.
  function lobby() {
    const D = C.data, f = C.form;
    const pickIcon = (cur, act) => `<div class="cpicks">${Object.entries(CLAN_ICONS).map(([id, name]) => `<button type="button" class="cpick ${cur.icon === id ? 'on' : ''}" data-act="${act}" data-icon="${id}" aria-label="${esc(t(name))}" aria-pressed="${cur.icon === id}">${crestHTML({ ...cur, icon: id })}</button>`).join('')}</div>`;
    const pickColor = (cur, act) => `<div class="cpicks">${Object.entries(CLAN_COLORS).map(([id, c]) => `<button type="button" class="cswatch ${cur.color === id ? 'on' : ''}" data-act="${act}" data-color="${id}" style="--sw:${c}" aria-label="${esc(id)}" aria-pressed="${cur.color === id}"></button>`).join('')}</div>`;
    const canPay = (ui.account.prisms || 0) >= CLAN_PRICE;
    const create = f ? `<form class="card-box cform" id="clan-create">
        <div class="cpreview">${crestHTML(f, 'big')}<div><b>${esc(f.name || t('Nom du clan'))}</b> <span class="ctag">[${esc((f.tag || 'TAG').toUpperCase())}]</span>
          <small class="hint">${f.open ? t('Ouvert à tous') : t('Sur demande')}</small></div></div>
        <div class="field"><label class="eyebrow" for="clan-name">${t('Nom')}</label><input id="clan-name" maxlength="${CLAN_NAME_MAX}" autocomplete="off" value="${esc(f.name)}" placeholder="${t('Les Lames d\'Argent')}"></div>
        <div class="field"><label class="eyebrow" for="clan-tag">${t('Étiquette (2 à 4 lettres ou chiffres)')}</label><input id="clan-tag" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(f.tag)}" placeholder="${t('LAME')}"></div>
        <span class="eyebrow">${t('Symbole')}</span>${pickIcon(f, 'clan-f-icon')}
        <span class="eyebrow">${t('Couleur')}</span>${pickColor(f, 'clan-f-color')}
        <div class="field"><label class="eyebrow" for="clan-desc">${t('Description (facultative)')}</label><input id="clan-desc" maxlength="${CLAN_DESC_MAX}" autocomplete="off" value="${esc(f.desc)}" placeholder="${t('Parties chaque soir, bonne humeur')}"></div>
        <label class="ctoggle"><input type="checkbox" id="clan-open" ${f.open ? 'checked' : ''}> ${t('Ouvert à tous (sinon, vous acceptez chaque demande)')}</label>
        <div class="row"><button class="btn primary" type="submit" ${ui.busy || !canPay ? 'disabled' : ''}>${t('Fonder le clan')} · ${app.ico('prism')}${CLAN_PRICE}</button>
          <button class="btn" type="button" data-act="clan-create-cancel">${t('Annuler')}</button></div>
        ${canPay ? '' : `<p class="hint" style="margin:0">${t('Il vous faut {n} Prismes (vous en avez {have}).', { n: CLAN_PRICE, have: ui.account.prisms || 0 })}</p>`}</form>`
      : `<div class="card-box chero"><div><span class="eyebrow">${t('Fonder un clan')}</span><h2>${t('Votre propre bannière')}</h2>
          <p class="hint" style="margin:0">${t('Choisissez un nom, une étiquette et un blason. Les membres font avancer ensemble les missions du clan, qui monte jusqu\'au niveau {n}.', { n: CLAN_LEVELS.length })}</p></div>
          <button class="btn primary" data-act="clan-create-open">${t('Créer')} · ${app.ico('prism')}${CLAN_PRICE}</button></div>`;
    const row = c => `<div class="crow">${crestHTML(c)}<span class="cname"><b>${esc(c.name)}</b> ${tagHTML(c)}
        <small class="hint">${t('Niv. {n}', { n: c.level })} · ${t('{n}/{max} membres', { n: c.members, max: c.max })} · ${c.open ? t('ouvert') : t('sur demande')}${c.desc ? ` · ${esc(c.desc)}` : ''}</small>${bannerHTML(c.banner)}</span>
      <div class="row fbtns">${c.asked ? `<button class="btn sm" data-act="clan-cancel" data-id="${c.id}" ${busy()}>${t('Annuler la demande')}</button>`
        : `<button class="btn sm primary" data-act="clan-join" data-id="${c.id}" ${busy()}>${c.open ? t('Rejoindre') : t('Demander')}</button>`}</div></div>`;
    const asked = D?.requested?.length ? block(t('Demandes envoyées'), `<div class="flist">${D.requested.map(c => `<div class="crow">${crestHTML(c)}<span class="cname"><b>${esc(c.name)}</b> ${tagHTML(c)}<small class="hint">${t('En attente du chef du clan')}</small></span>
      <div class="row fbtns"><button class="btn sm" data-act="clan-cancel" data-id="${c.id}" ${busy()}>${t('Annuler')}</button></div></div>`).join('')}</div>`) : '';
    return `${head(t('Clans'))}${app.errLine()}${note()}
      ${create}${asked}
      <form class="card-box" id="clan-search"><div class="field"><label class="eyebrow" for="clan-q">${t('Rejoindre un clan')}</label>
        <div class="row"><input id="clan-q" maxlength="24" autocomplete="off" placeholder="${t('Nom ou étiquette')}" value="${esc(C.query)}"><button class="btn" type="submit">${t('Chercher')}</button></div></div>
        ${!C.list ? `<p class="wait">${t('Chargement…')}</p>` : C.list.length ? `<div class="flist">${C.list.map(row).join('')}</div>`
          : `<p class="hint" style="margin:0">${C.query.trim() ? t('Aucun clan ne porte ce nom.') : t('Aucun clan n\'a de place pour l\'instant. Fondez le vôtre !')}</p>`}</form>
      <button class="btn" data-act="clan-tab" data-tab="classement">${t('Classement des clans')}</button>
      ${C.tab === 'classement' ? ladderHTML() : ''}`;
  }

  // ---- Avec un clan ----
  function header(c) {
    const P = c.progress, max = P.level >= c.maxLevel;
    return `<div class="card-box cheader" style="--crest:${CLAN_COLORS[c.color] || CLAN_COLORS.azur}">
      ${crestHTML(c, 'big')}
      <div class="cinfo"><span class="eyebrow">${c.pos ? `${c.pos === 1 ? t('1er du classement des clans') : t('{n}e du classement des clans', { n: c.pos })} · ` : ''}${tp(c.members.length, '{n} membre sur {max}', '{n} membres sur {max}', { max: P.members })}</span>
        <h2>${esc(c.name)} ${tagHTML(c)}</h2>
        ${c.desc ? `<p class="hint" style="margin:0">${esc(c.desc)}</p>` : ''}
        <div class="lvl"><span class="lvlnum num">${t('Niv. {n}', { n: P.level })}</span><div class="bar" role="progressbar" aria-valuenow="${P.xp}" aria-valuemin="${P.from}" aria-valuemax="${P.next ?? P.xp}" aria-label="${t('XP du clan')}">
          <span style="width:${max ? 100 : pct(P.xp - P.from, P.next - P.from)}%"></span></div><small class="hint num">${max ? t('Niveau maximum') : t('{n}/{max} XP', { n: P.xp - P.from, max: P.next - P.from })}</small></div>
        ${c.banners.length ? `<div class="cbanners">${c.banners.slice().reverse().map(bannerHTML).join('')}</div>` : ''}</div></div>`;
  }
  function tabs() {
    const asks = me()?.requests.length || 0;
    return `<div class="seg ctabs" role="tablist" aria-label="${t('Rubriques du clan')}">${TABS.map(([id, label]) => `<button role="tab" class="${C.tab === id ? 'on' : ''}" aria-selected="${C.tab === id}" data-act="clan-tab" data-tab="${id}">${label}${id === 'membres' && asks ? `<span class="badge num">${asks}</span>` : ''}</button>`).join('')}</div>`;
  }
  function missionsHTML(c) {
    const R = c.missions.rewards;
    const m = x => `<li class="${x.done ? 'done' : ''}"><div class="mtext"><b>${esc(tField(x, 'label'))}</b><small class="hint num">${x.done ? t('Accomplie ✓') : `${x.n}/${x.target}`}${x.done ? '' : ` · ${t('votre part : {n}/{max}', { n: x.mine, max: x.share })}`}</small></div>
      <div class="bar" aria-hidden="true"><span style="width:${pct(x.n, x.target)}%"></span></div></li>`;
    return `${block(t('Missions du jour'), `<p class="hint" style="margin:0">${t('Chaque partie de chaque membre compte, et l\'objectif grandit avec le clan. Chacun peut en faire au plus sa part : il faut jouer à plusieurs. Une mission accomplie donne {xp} XP au clan et {coins} Écus à chacun de ceux qui y ont participé. Renouvelées à minuit.', { xp: R.daily.xp, coins: coins(R.daily.coins) })}</p>
        <ul class="cmissions">${c.missions.day.map(m).join('')}</ul>`)}
      ${block(t('Missions de la semaine'), `<p class="hint" style="margin:0">${t('{xp} XP de clan et {coins} Écus pour chaque participant. Renouvelées le lundi.', { xp: R.weekly.xp, coins: coins(R.weekly.coins) })}</p>
        <ul class="cmissions">${c.missions.week.map(m).join('')}</ul>`)}
      ${block(t('Niveaux du clan'), `<ul class="tiers">${CLAN_LEVELS.map(l => `<li class="${l.level === c.progress.level ? 'on' : ''}"><b>${t('Niveau {n}', { n: l.level })}</b><span>${l.xp ? `${t('{n} XP', { n: l.xp })} · ` : ''}${tp(l.members, '{n} membre', '{n} membres')}${shopUnlocks(l.level)}</span></li>`).join('')}</ul>`)}
      ${c.log.length ? block(t('Journal du clan'), `<ul class="clog">${c.log.slice(0, 12).map(x => `<li><small class="hint">${new Date(x.at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}</small> ${esc(tField(x, 'text'))}</li>`).join('')}</ul>`) : ''}`;
  }
  const shopUnlocks = lv => { const n = C.data.shop.filter(x => x.level === lv).length; return n ? ` · ${tp(n, '{n} objet au magasin', '{n} objets au magasin')}` : ''; };

  function membersHTML(c) {
    const myRank = ROLE_RANK[c.role], lead = canDo(c.role, 'edit');
    const who = p => `<button class="fwho" data-act="player" data-login="${esc(p.login)}" aria-label="${t('Profil de {name}', { name: esc(p.name) })}">${avatar(p)}<span class="fname"><b>${esc(p.name)}</b>
      <small class="hint">${roleHTML(p.role)}${t('niv. {n}', { n: p.level })}${p.title ? ` · <span class="ptitle">${esc(t(p.title))}</span>` : ''}${p.away >= 3 ? ` · ${t('absent depuis {n} j', { n: p.away })}` : ''}</small></span></button>`;
    // Gestion d'un membre de rang plus bas que soi : rôle (Maître et adjoints), confier le clan (Maître), exclure.
    const acts = p => {
      if (p.login === c.me || ROLE_RANK[p.role] >= myRank || !canDo(c.role, 'kick')) return '';
      if (C.confirm?.login === p.login) return `<div class="row fbtns"><button class="btn sm primary" data-act="clan-${C.confirm.what}" data-login="${esc(p.login)}" ${busy()}>${C.confirm.what === 'kick' ? t('Confirmer l\'exclusion') : t('Confirmer : nouveau Maître')}</button>
        <button class="btn sm" data-act="clan-no">${t('Annuler')}</button></div>`;
      if (C.manage !== p.login) return `<div class="row fbtns"><button class="btn sm" data-act="clan-manage" data-login="${esc(p.login)}">${t('Gérer')}</button></div>`;
      const roles = canDo(c.role, 'roles') ? ['adjoint', 'souschef', 'membre'].filter(r => r !== p.role && ROLE_RANK[r] < myRank)
        .map(r => `<button class="btn sm" data-act="clan-role" data-role="${r}" data-login="${esc(p.login)}" ${busy()}>${r === 'membre' ? t('Rétrograder membre') : t('Nommer {role}', { role: t(CLAN_ROLES[r]).toLowerCase() })}</button>`).join('') : '';
      return `<div class="row fbtns">${roles}${c.role === 'maitre' ? `<button class="btn sm" data-act="clan-ask" data-what="promote" data-login="${esc(p.login)}">${t('Confier le clan')}</button>` : ''}
        <button class="btn sm" data-act="clan-ask" data-what="kick" data-login="${esc(p.login)}">${t('Exclure')}</button><button class="btn sm" data-act="clan-manage">${t('Fermer')}</button></div>`;
    };
    const leader = c.members.find(p => p.role === 'maitre');
    const claim = c.claim ? block(t('Le Maître est absent'), `<p style="margin:0">${t('{name} n\'est pas venu depuis {n} jours. En tant que {role}, vous pouvez prendre la tête du clan ; il deviendra adjoint.', { name: esc(leader?.name || t('Le Maître')), n: leader?.away, role: t(CLAN_ROLES[c.role]).toLowerCase() })}</p>
      <div class="row"><button class="btn primary" data-act="clan-claim" ${busy()}>${t('Prendre la tête du clan')}</button></div>`) : '';
    const rolesHelp = block(t('Rôles'), `<ul class="tiers croles">
      <li><b>${ROLE_ICON.maitre} ${t(CLAN_ROLES.maitre)}</b><span>${t('Fondateur du clan : tous les droits, nomme les adjoints, peut confier le clan.')}</span></li>
      <li><b>${ROLE_ICON.adjoint} ${t(CLAN_ROLES.adjoint)}</b><span>${t('Mêmes droits que le Maître, sauf nommer des adjoints. Prend la tête du clan si le Maître n\'est pas venu depuis {days} jours. {max} au plus.', { days: c.inactiveDays, max: c.roleMax.adjoint })}</span></li>
      <li><b>${ROLE_ICON.souschef} ${t(CLAN_ROLES.souschef)}</b><span>${t('Accepte les demandes d\'adhésion et exclut les membres. {max} au plus.', { max: c.roleMax.souschef })}</span></li>
      <li><b>${t(CLAN_ROLES.membre)}</b><span>${t('Joue les missions, donne et achète au magasin.')}</span></li></ul>`);
    const row = p => `<div class="frow cmember">${who(p)}<small class="cstat num">${p.rank ? `<span class="rank rank-${esc(p.rank.id)}">${esc(p.rank.label)}</span>` : `<span class="hint">${t('Pas classé')}</span>`}
      <span class="hint">${tp(p.week, '{n} partie', '{n} parties')} · ${t('{n} Écus donnés cette semaine', { n: p.dons })}</span></small>${acts(p)}</div>`;
    const reqs = canDo(c.role, 'requests') && c.requests.length ? block(t('Demandes d\'adhésion ({n})', { n: c.requests.length }), `<div class="flist">${c.requests.map(p => `<div class="frow"><span class="fwho">${avatar(p)}<span class="fname"><b>${esc(p.name)}</b><small class="hint">${t('niv. {n}', { n: p.level })}</small></span></span>
      <div class="row fbtns"><button class="btn sm primary" data-act="clan-accept" data-login="${esc(p.login)}" ${busy()}>${t('Accepter')}</button><button class="btn sm" data-act="clan-refuse" data-login="${esc(p.login)}" ${busy()}>${t('Refuser')}</button></div></div>`).join('')}</div>`) : '';
    const E = C.edit;
    const settings = !lead ? '' : E ? `<form class="card-box cform" id="clan-edit"><span class="eyebrow">${t('Réglages du clan')}</span>
        <div class="cpicks">${Object.entries(CLAN_ICONS).map(([id, name]) => `<button type="button" class="cpick ${E.icon === id ? 'on' : ''}" data-act="clan-e-icon" data-icon="${id}" aria-label="${esc(t(name))}" aria-pressed="${E.icon === id}">${crestHTML({ ...E, icon: id })}</button>`).join('')}</div>
        <div class="cpicks">${Object.entries(CLAN_COLORS).map(([id, col]) => `<button type="button" class="cswatch ${E.color === id ? 'on' : ''}" data-act="clan-e-color" data-color="${id}" style="--sw:${col}" aria-label="${esc(id)}" aria-pressed="${E.color === id}"></button>`).join('')}</div>
        <div class="field"><label class="eyebrow" for="clan-edesc">${t('Description')}</label><input id="clan-edesc" maxlength="${CLAN_DESC_MAX}" autocomplete="off" value="${esc(E.desc)}"></div>
        <label class="ctoggle"><input type="checkbox" id="clan-eopen" ${E.open ? 'checked' : ''}> ${t('Ouvert à tous')}</label>
        <div class="row"><button class="btn primary" type="submit" ${busy()}>${t('Enregistrer')}</button><button class="btn" type="button" data-act="clan-edit-cancel">${t('Annuler')}</button></div></form>`
      : `<button class="btn" data-act="clan-edit-open">${t('Modifier le blason, la description, l\'accès')}</button>`;
    const leave = C.confirm?.what === 'leave' ? `<div class="card-box"><p style="margin:0">${t('Quitter {name} ?', { name: esc(c.name) })}${c.members.length === 1 ? ` ${t('Vous êtes le dernier membre : le clan disparaîtra.')}` : c.role === 'maitre' ? ` ${t('L\'adjoint le plus ancien (sinon un sous-chef, sinon le membre le plus ancien) deviendra Maître.')}` : ''} ${t('Ce que vous avez acheté au magasin vous reste.')}</p>
        <div class="row"><button class="btn primary" data-act="clan-leave" ${busy()}>${t('Quitter le clan')}</button><button class="btn" data-act="clan-no">${t('Rester')}</button></div></div>`
      : `<button class="btn" data-act="clan-ask" data-what="leave">${t('Quitter le clan')}</button>`;
    return `${claim}${reqs}${block(t('Membres · {n}/{max}', { n: c.members.length, max: c.progress.members }), `<div class="flist">${c.members.map(row).join('')}</div>
      <p class="hint" style="margin:0">${t('Le rang classé de chaque membre compte pour le classement des clans.')}</p>`)}${rolesHelp}${settings}${leave}`;
  }

  function donsHTML() {
    const D = C.data;
    const row = d => {
      const left = d.left, steps = [...new Set([d.rate * (d.res === 'shards' ? 10 : d.res === 'prisms' ? 1 : 4), left - (left % d.rate)])].filter(n => n >= d.rate && n <= left);
      const name = d.res === 'shards' ? `${app.ico('shard')} ${t('Éclats')}` : d.res === 'prisms' ? `${app.ico('prism')} ${t('Prismes')}` : t('Essence universelle');
      return `<div class="cdon"><div><b>${name}</b><small class="hint num">${tp(d.coins, '{rate} pour {n} Écu', '{rate} pour {n} Écus', { rate: d.rate })} · ${t('aujourd\'hui {n}/{max}', { n: d.given, max: d.cap })} · ${t('vous en avez {n}', { n: d.have })}</small>
        <div class="bar" aria-hidden="true"><span style="width:${pct(d.given, d.cap)}%"></span></div></div>
        <div class="row fbtns">${left >= d.rate ? steps.map(n => `<button class="btn sm ${n === steps[steps.length - 1] ? 'primary' : ''}" data-act="clan-donate" data-res="${d.res}" data-amount="${n}" ${ui.busy || d.have < n ? 'disabled' : ''}>${t('Donner {n}', { n })} · +${Math.floor(n / d.rate) * d.coins} ${app.ico('ecu')}</button>`).join('') : `<small class="hint">${t('Limite du jour atteinte')}</small>`}</div></div>`;
    };
    return `${block(t('Dons · vous avez {n} Écus', { n: coins(D.coins) }), `<p class="hint" style="margin:0">${t('Donnez des ressources au clan : elles vont au trésor du clan, vous recevez des Écus à dépenser au magasin du clan, et vos dons font avancer la mission de dons de la semaine. Limites renouvelées à minuit.')}</p>
      ${D.donations.map(row).join('')}`)}${treasuryHTML(me())}`;
  }
  const RES = { shards: ['shard', t('Éclats')], prisms: ['prism', t('Prismes')], uniEssence: [null, t('essence universelle')] };
  const resHTML = (r, n) => `${RES[r][0] ? app.ico(RES[r][0]) : ''}${n}${RES[r][0] ? '' : ` ${RES[r][1]}`}`;
  // Trésor du clan : ce que les membres ont donné, et les projets que le Maître et les adjoints peuvent financer.
  function treasuryHTML(c) {
    const T = c.treasury, can = canDo(c.role, 'treasury');
    const day = iso => new Date(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const proj = p => {
      const enough = Object.entries(p.cost).every(([r, n]) => (T.bank[r] || 0) >= n);
      const state = p.until ? `<span class="ok">${t('En cours jusqu\'au {date}', { date: day(p.until) })}</span>` : p.done ? `<span class="ok">${t('Ouvert cette semaine ✓')}</span>`
        : can ? `<button class="btn sm ${enough ? 'primary' : ''}" data-act="clan-fund" data-id="${p.id}" ${ui.busy || !enough ? 'disabled' : ''}>${t('Financer')}</button>` : '';
      return `<div class="cproj ${p.until || p.done ? 'on' : ''}"><div><b>${esc(t(p.name))}</b><small class="hint">${esc(t(p.desc))}</small>
        <small class="num">${t('Coût :')} ${Object.entries(p.cost).map(([r, n]) => `<span class="${p.until || p.done || (T.bank[r] || 0) >= n ? '' : 'short'}">${resHTML(r, n)}</span>`).join(' + ')}</small></div>${state}</div>`;
    };
    return block(t('Trésor du clan'), `<div class="cbank num">${Object.keys(RES).map(r => `<span>${resHTML(r, T.bank[r] || 0)}</span>`).join('')}</div>
      <p class="hint" style="margin:0">${can ? t('Les ressources données s\'accumulent ici. Vous pouvez les dépenser en projets pour tout le clan ; leur coût suit la taille du clan.') : t('Les ressources données s\'accumulent ici. Le Maître et les adjoints peuvent les dépenser en projets pour tout le clan ; leur coût suit la taille du clan.')}</p>
      ${T.projects.map(proj).join('')}`);
  }

  function itemVisual(x) {
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art') { const A = ARTS[id], card = A.card; return `<div class="citem-art">${artHTML(card, (CARDS[card] || GENERALS[card]).name, 1, '', id)}</div>`; }
    if (x.kind === 'back') return `<span class="mc back back-${esc(id)}"></span>`;
    if (x.kind === 'frame') return app.avatarHTML(ui.account, 'cav', id);
    return `<span class="ctitle">${t('« {title} »', { title: esc(t(TITLES[id] || x.name.replace(/^Titre « (.*) »$/, '$1'))) })}</span>`;
  }
  function shopHTML() {
    const D = C.data, lv = me().progress.level;
    const item = x => {
      const art = x.kind === 'art' ? ARTS[x.id.slice(4)] : null;
      const state = x.owned ? `<span class="ok">${t('✓ Possédé')}</span>` : x.locked ? `<span class="hint">${t('Clan niveau {n}', { n: x.level })}</span>`
        : `<button class="btn sm ${D.coins >= x.price ? 'primary' : ''}" data-act="clan-buy" data-item="${esc(x.id)}" ${ui.busy || D.coins < x.price ? 'disabled' : ''}>${app.ico('ecu')}${x.price}</button>`;
      return `<div class="citem ${x.locked ? 'locked' : ''} ${x.owned ? 'owned' : ''} k-${x.kind}">${itemVisual(x)}<b>${esc(t(x.name))}</b>
        <small class="hint">${art ? `${esc(rarityName(art))} · ${esc((CARDS[art.card] || GENERALS[art.card]).name)}` : { back: t('Dos de carte'), frame: t('Cadre de profil'), title: t('Titre') }[x.kind]}</small>${state}</div>`;
    };
    return block(t('Magasin du clan · vous avez {n} Écus', { n: coins(D.coins) }), `<p class="hint" style="margin:0">${t('Arts de la famille Bannières, dos, cadres et titres, seulement ici. Votre clan est niveau {n} : les objets d\'un niveau plus haut se débloquent quand il monte. Ce que vous achetez vous reste, même si vous quittez le clan.', { n: lv })}</p>
      <div class="cshop">${D.shop.map(item).join('')}</div>`);
  }

  function ladderHTML() {
    const L = C.ladder;
    if (!L) return block(t('Classement des clans'), `<p class="wait">${t('Chargement…')}</p>`);
    const row = x => `<li class="${me()?.id === x.id ? 'me' : ''}"><span class="lpos num">${x.pos ?? '–'}</span><span class="cname">${crestHTML(x)}<span><b>${esc(x.name)}</b> ${tagHTML(x)}
      <small class="hint">${t('Niv. {n}', { n: x.level })} · ${tp(x.members, '{n} membre', '{n} membres')}</small></span></span><b class="num cscore">${x.score} ★</b></li>`;
    const mine = L.mine && !L.ladder.some(x => x.id === L.mine.id) ? `<ol class="ladder"><li class="me"><span class="lpos num">${L.mine.pos ?? '–'}</span><span class="cname">${crestHTML(L.mine)}<span><b>${esc(L.mine.name)}</b> ${tagHTML(L.mine)}</span></span><b class="num cscore">${L.mine.score} ★</b></li></ol>` : '';
    const last = L.last?.top.length ? block(t('Podium des clans de {season}', { season: esc(L.last.seasonName) }), `<ol class="ladder">${L.last.top.map(row).join('')}</ol>`) : '';
    return `${block(t('Classement des clans · {season}', { season: esc(L.seasonName) }), `<p class="hint" style="margin:0">${t('Le score d\'un clan est la somme des étoiles classées de ses membres cette saison. Jouez en classé pour faire monter votre clan !')}</p>
      ${L.ladder.length ? `<ol class="ladder cladder">${L.ladder.map(row).join('')}</ol>` : `<p class="hint" style="margin:0">${t('Aucun clan classé pour l\'instant ce mois-ci.')}</p>`}${mine}`)}
      ${block(t('Récompenses de fin de mois'), `<p class="hint" style="margin:0">${t('Le classement est figé à la fin du mois. Chaque membre des 10 meilleurs clans reçoit les récompenses de la place de son clan, et le clan garde sa bannière.')}</p>
        <ul class="tiers">${L.places.map(p => `<li><b>${esc(t(p.name))}</b><span>${app.ico('prism')}${p.prisms} · ${app.ico('ecu')}${p.coins} · ${t('titre')} · <span class="cbanner cb-${p.banner}">${esc(t(p.bannerName))}</span></span></li>`).join('')}</ul>`)}
      ${last}`;
  }

  function screen() {
    if (!C.data) return `${head(t('Clan'))}${app.errLine()}<p class="wait">${t('Chargement…')}</p>`;
    const c = me();
    if (!c) return lobby();
    const body = { clan: () => missionsHTML(c), boss: () => raid.html(), membres: () => membersHTML(c), dons: donsHTML, magasin: shopHTML, classement: ladderHTML }[C.tab]();
    return `${head(t('Mon clan'))}${app.errLine()}${note()}${header(c)}${tabs()}${body}`;
  }

  // ---- Clics, saisies, formulaires ----
  function click(a, ds) {
    if (a === 'clan') { ui.screen = 'clan'; ui.error = ''; C.note = ''; C.confirm = null; C.edit = null; C.data ||= null; load(); app.render(); }
    else if (a === 'clan-tab') { C.tab = ds.tab; C.confirm = null; C.note = ''; if (ds.tab === 'classement') ladder(); if (ds.tab === 'boss') raid.load(); app.render(); }
    else if (a === 'clan-boss') { app.leaveGame?.(); C.tab = 'boss'; click('clan', {}); }
    else if (raid.click(a, ds)) return true;
    else if (a === 'clan-create-open') { C.form = { name: '', tag: '', icon: 'epee', color: 'gueules', desc: '', open: true }; app.render(); }
    else if (a === 'clan-create-cancel') { C.form = null; app.render(); }
    else if (a === 'clan-f-icon' && C.form) { C.form.icon = ds.icon; app.render(); }
    else if (a === 'clan-f-color' && C.form) { C.form.color = ds.color; app.render(); }
    else if (a === 'clan-e-icon' && C.edit) { C.edit.icon = ds.icon; app.render(); }
    else if (a === 'clan-e-color' && C.edit) { C.edit.color = ds.color; app.render(); }
    else if (a === 'clan-edit-open') { const c = me(); C.edit = { icon: c.icon, color: c.color, desc: c.desc, open: c.open }; app.render(); }
    else if (a === 'clan-edit-cancel') { C.edit = null; app.render(); }
    else if (a === 'clan-join' && !ui.busy) act('/api/clan/join', { id: ds.id }, () => { C.tab = 'clan'; });
    else if (a === 'clan-cancel' && !ui.busy) act('/api/clan/cancel', { id: ds.id });
    else if (a === 'clan-ask') { C.confirm = { what: ds.what, login: ds.login }; app.render(); }
    else if (a === 'clan-no') { C.confirm = null; app.render(); }
    else if (a === 'clan-leave' && !ui.busy) { C.confirm = null; act('/api/clan/leave', {}, () => { C.tab = 'clan'; }); }
    else if (['clan-kick', 'clan-promote', 'clan-accept', 'clan-refuse'].includes(a) && !ui.busy) { C.confirm = null; C.manage = null; act(`/api/clan/${a.slice(5)}`, { login: ds.login }); }
    else if (a === 'clan-manage') { C.manage = ds.login || null; C.confirm = null; app.render(); }
    else if (a === 'clan-role' && !ui.busy) { C.manage = null; act('/api/clan/role', { login: ds.login, role: ds.role }); }
    else if (a === 'clan-claim' && !ui.busy) act('/api/clan/claim', {});
    else if (a === 'clan-fund' && !ui.busy) act('/api/clan/fund', { id: ds.id }, () => app.play('reveal'));
    else if (a === 'clan-donate' && !ui.busy) act('/api/clan/donate', { res: ds.res, amount: +ds.amount }, () => app.play('coin'));
    else if (a === 'clan-buy' && !ui.busy) act('/api/clan/buy', { item: ds.item }, () => app.play('reveal'));
    else return false;
    return true;
  }
  function input(e) {
    const t = e.target, f = C.form, E = C.edit;
    if (t.id === 'clan-q') { C.query = t.value; return true; }
    if (f && t.id === 'clan-name') { f.name = t.value; refreshPreview(); return true; }
    if (f && t.id === 'clan-tag') { f.tag = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); t.value = f.tag; refreshPreview(); return true; }
    if (f && t.id === 'clan-desc') { f.desc = t.value; return true; }
    if (f && t.id === 'clan-open') { f.open = t.checked; app.render(); return true; }
    if (E && t.id === 'clan-edesc') { E.desc = t.value; return true; }
    if (E && t.id === 'clan-eopen') { E.open = t.checked; return true; }
    return false;
  }
  // Aperçu du blason pendant la saisie, sans redessiner le formulaire (le curseur reste en place).
  function refreshPreview() {
    const b = document.querySelector('#clan-create .cpreview b'), tg = document.querySelector('#clan-create .cpreview .ctag');
    if (b) b.textContent = C.form.name || t('Nom du clan');
    if (tg) tg.textContent = `[${C.form.tag || 'TAG'}]`;
  }
  function submit(form) {
    if (form.id === 'clan-search') { search(); return true; }
    if (form.id === 'clan-create' && C.form) { const f = C.form; act('/api/clan/create', f, () => { C.form = null; C.tab = 'clan'; }); return true; }
    if (form.id === 'clan-edit' && C.edit) { act('/api/clan/edit', C.edit, () => { C.edit = null; }); return true; }
    return false;
  }

  return {
    screen, click, input, submit,
    // Onglet Clan de la boutique : le magasin du clan (chargé au besoin).
    shopTab() {
      if (!C.data) { load(); return `<p class="wait">${t('Chargement…')}</p>`; }
      return me() ? `${app.errLine()}${note()}${shopHTML()}` : `<p class="hint">${t('Rejoignez un clan pour ouvrir son magasin.')}</p>`;
    },
    // Demandes d'adhésion en attente (pour ceux qui peuvent les accepter), pour la tuile de l'accueil.
    pending: () => me()?.requests.length || 0,
    // Tuile de l'accueil : le clan, ou l'invitation à en rejoindre un.
    tile(account) {
      const c = me(), lv = c ? c.progress.level : 0;
      if (account.clan && c) {
        const left = [...c.missions.day].filter(m => !m.done).length, R = c.raid;
        // Boss de clan ouvert : la tuile mène à son onglet et montre ses PV.
        if (R?.open) return `<button class="tile ctile ${R.left ? 'todo' : ''}" data-act="clan-boss"><span class="eyebrow">${t('Boss de clan · niv. {n}', { n: lv })}</span>
          <b class="ctile-name">${crestHTML(c, 'sm')}<span>${esc(t(GENERALS[R.boss]?.name || '').split(/,\s*/)[0])}</span></b><span class="tile-foot num">${t('{n} % des PV retirés', { n: clanBossPct(R.hp, R.max) })}${R.left ? ` · ${tp(R.left, '{n} tentative', '{n} tentatives')}` : ''}</span>
          <span class="bar" aria-hidden="true"><span style="width:${pct(R.hp, R.max)}%"></span></span></button>`;
        return `<button class="tile ctile ${c.requests.length ? 'todo' : ''}" data-act="clan"><span class="eyebrow">${t('Clan · niv. {n}', { n: lv })}</span>
          <b class="ctile-name">${crestHTML(c, 'sm')}<span>${esc(c.name)}</span></b><span class="tile-foot num">${left ? tp(left, '{n} mission du jour en cours', '{n} missions du jour en cours') : t('Missions du jour finies ✓')}</span></button>`;
      }
      return `<button class="tile ctile" data-act="clan"><span class="eyebrow">${t('Clan')}</span><b>${account.clan ? t('Mon clan') : t('Rejoindre')}</b>
        <span class="tile-foot">${account.clan ? t('Missions, dons, magasin') : t('Créer ou rejoindre un clan')}</span></button>`;
    },
    // Charge le clan en arrière-plan (tuile de l'accueil).
    warm() { if (ui.auth && ui.account?.clan && !C.data) api('GET', '/api/clan', undefined, ui.auth).then(r => { set(r); app.render(); }).catch(() => {}); },
    stop() { Object.assign(C, { data: null, list: null, ladder: null, form: null, edit: null, confirm: null, note: '', avatars: {}, tab: 'clan' }); raid.stop(); },
    bossDeck: id => raid.bossDeck(id),
    levelOf: clanLevelOf,
  };
}
