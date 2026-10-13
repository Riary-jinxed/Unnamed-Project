// Clans : créer ou rejoindre un clan, missions de clan (du jour et de la semaine, cumulées sur tous les membres), membres et demandes,
// dons de ressources contre des Écus, magasin du clan et classement mensuel des clans. Le serveur fait tout (server/src/clans.js) ;
// cet écran affiche ce qu'il renvoie.
import { api } from './api.js';
import { esc } from './common.js';
import { artHTML } from './art.js';
import { CARDS, GENERALS } from '@jeu/engine';
import { ARTS, rarityName } from '@jeu/engine/arts';
import { CLAN_ICONS, CLAN_COLORS, CLAN_PRICE, CLAN_NAME_MAX, CLAN_DESC_MAX, CLAN_LEVELS, clanLevelOf } from '@jeu/engine/clans';
import { seasonName } from '@jeu/engine/ranked';

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
const bannerHTML = b => (b ? `<span class="cbanner cb-${esc(b.id)}">${esc(b.name)} · ${esc(seasonName(b.season))}</span>` : '');
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const pct = (n, d) => Math.max(0, Math.min(100, Math.round(100 * n / (d || 1))));
const ROLE = { leader: 'Chef du clan' };
// Onglets de l'écran Social (barre du bas) : les amis et le clan.
export const socialTabs = cur => `<div class="seg socialtabs" role="tablist" aria-label="Social">${[['friends', 'Amis'], ['clan', 'Clan']].map(([id, label]) =>
  `<button role="tab" data-act="${id}" class="${cur === id ? 'on' : ''}" aria-selected="${cur === id}">${label}</button>`).join('')}</div>`;
const TABS = [['clan', 'Clan'], ['membres', 'Membres'], ['dons', 'Dons'], ['magasin', 'Magasin'], ['classement', 'Classement']];

// app : ce que main.js prête à l'écran (état ui, render, call, avatarHTML, errLine, ico, openPlayer, play).
export function createClan(app) {
  const { ui } = app;
  const C = ui.clan = { data: null, tab: 'clan', list: null, query: '', ladder: null, form: null, edit: null, confirm: null, note: '', avatars: {} };
  const me = () => C.data?.clan;

  async function load() {
    try { set(await api('GET', '/api/clan', undefined, ui.auth)); } catch (e) { ui.error = e.message; }
    app.render();
    if (!me()) search();
    if (C.tab === 'classement') ladder();
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
    if (r) { set(r); C.note = r.msg || ''; after?.(r); if (r.got?.art) app.gotArt?.(r.got.art); }
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
    return `<div class="top"><span class="title">${title}</span><span class="wallet"><span class="chip num cur ecu" title="Écus">${app.ico('ecu')}${C.data?.coins ?? 0}</span></span></div>
      ${socialTabs('clan')}`;
  }

  // Sans clan : en créer un, ou en rejoindre un.
  function lobby() {
    const D = C.data, f = C.form;
    const pickIcon = (cur, act) => `<div class="cpicks">${Object.entries(CLAN_ICONS).map(([id, name]) => `<button type="button" class="cpick ${cur.icon === id ? 'on' : ''}" data-act="${act}" data-icon="${id}" aria-label="${esc(name)}" aria-pressed="${cur.icon === id}">${crestHTML({ ...cur, icon: id })}</button>`).join('')}</div>`;
    const pickColor = (cur, act) => `<div class="cpicks">${Object.entries(CLAN_COLORS).map(([id, c]) => `<button type="button" class="cswatch ${cur.color === id ? 'on' : ''}" data-act="${act}" data-color="${id}" style="--sw:${c}" aria-label="${esc(id)}" aria-pressed="${cur.color === id}"></button>`).join('')}</div>`;
    const canPay = (ui.account.prisms || 0) >= CLAN_PRICE;
    const create = f ? `<form class="card-box cform" id="clan-create">
        <div class="cpreview">${crestHTML(f, 'big')}<div><b>${esc(f.name || 'Nom du clan')}</b> <span class="ctag">[${esc((f.tag || 'TAG').toUpperCase())}]</span>
          <small class="hint">${f.open ? 'Ouvert à tous' : 'Sur demande'}</small></div></div>
        <div class="field"><label class="eyebrow" for="clan-name">Nom</label><input id="clan-name" maxlength="${CLAN_NAME_MAX}" autocomplete="off" value="${esc(f.name)}" placeholder="Les Lames d'Argent"></div>
        <div class="field"><label class="eyebrow" for="clan-tag">Étiquette (2 à 4 lettres ou chiffres)</label><input id="clan-tag" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(f.tag)}" placeholder="LAME"></div>
        <span class="eyebrow">Symbole</span>${pickIcon(f, 'clan-f-icon')}
        <span class="eyebrow">Couleur</span>${pickColor(f, 'clan-f-color')}
        <div class="field"><label class="eyebrow" for="clan-desc">Description (facultative)</label><input id="clan-desc" maxlength="${CLAN_DESC_MAX}" autocomplete="off" value="${esc(f.desc)}" placeholder="Parties chaque soir, bonne humeur"></div>
        <label class="ctoggle"><input type="checkbox" id="clan-open" ${f.open ? 'checked' : ''}> Ouvert à tous (sinon, vous acceptez chaque demande)</label>
        <div class="row"><button class="btn primary" type="submit" ${ui.busy || !canPay ? 'disabled' : ''}>Fonder le clan · ${app.ico('prism')}${CLAN_PRICE}</button>
          <button class="btn" type="button" data-act="clan-create-cancel">Annuler</button></div>
        ${canPay ? '' : `<p class="hint" style="margin:0">Il vous faut ${CLAN_PRICE} Prismes (vous en avez ${ui.account.prisms || 0}).</p>`}</form>`
      : `<div class="card-box chero"><div><span class="eyebrow">Fonder un clan</span><h2>Votre propre bannière</h2>
          <p class="hint" style="margin:0">Choisissez un nom, une étiquette et un blason. Les membres font avancer ensemble les missions du clan, qui monte jusqu'au niveau ${CLAN_LEVELS.length}.</p></div>
          <button class="btn primary" data-act="clan-create-open">Créer · ${app.ico('prism')}${CLAN_PRICE}</button></div>`;
    const row = c => `<div class="crow">${crestHTML(c)}<span class="cname"><b>${esc(c.name)}</b> ${tagHTML(c)}
        <small class="hint">Niv. ${c.level} · ${c.members}/${c.max} membres · ${c.open ? 'ouvert' : 'sur demande'}${c.desc ? ` · ${esc(c.desc)}` : ''}</small>${bannerHTML(c.banner)}</span>
      <div class="row fbtns">${c.asked ? `<button class="btn sm" data-act="clan-cancel" data-id="${c.id}" ${busy()}>Annuler la demande</button>`
        : `<button class="btn sm primary" data-act="clan-join" data-id="${c.id}" ${busy()}>${c.open ? 'Rejoindre' : 'Demander'}</button>`}</div></div>`;
    const asked = D?.requested?.length ? block('Demandes envoyées', `<div class="flist">${D.requested.map(c => `<div class="crow">${crestHTML(c)}<span class="cname"><b>${esc(c.name)}</b> ${tagHTML(c)}<small class="hint">En attente du chef du clan</small></span>
      <div class="row fbtns"><button class="btn sm" data-act="clan-cancel" data-id="${c.id}" ${busy()}>Annuler</button></div></div>`).join('')}</div>`) : '';
    return `${head('Clans')}${app.errLine()}${note()}
      ${create}${asked}
      <form class="card-box" id="clan-search"><div class="field"><label class="eyebrow" for="clan-q">Rejoindre un clan</label>
        <div class="row"><input id="clan-q" maxlength="24" autocomplete="off" placeholder="Nom ou étiquette" value="${esc(C.query)}"><button class="btn" type="submit">Chercher</button></div></div>
        ${!C.list ? '<p class="wait">Chargement…</p>' : C.list.length ? `<div class="flist">${C.list.map(row).join('')}</div>`
          : `<p class="hint" style="margin:0">${C.query.trim() ? 'Aucun clan ne porte ce nom.' : 'Aucun clan n\'a de place pour l\'instant. Fondez le vôtre !'}</p>`}</form>
      <button class="btn" data-act="clan-tab" data-tab="classement">Classement des clans</button>
      ${C.tab === 'classement' ? ladderHTML() : ''}`;
  }

  // ---- Avec un clan ----
  function header(c) {
    const P = c.progress, max = P.level >= c.maxLevel;
    return `<div class="card-box cheader" style="--crest:${CLAN_COLORS[c.color] || CLAN_COLORS.azur}">
      ${crestHTML(c, 'big')}
      <div class="cinfo"><span class="eyebrow">${c.pos ? `${c.pos}${c.pos === 1 ? 'er' : 'e'} du classement des clans · ` : ''}${plural(c.members.length, 'membre')} sur ${P.members}</span>
        <h2>${esc(c.name)} ${tagHTML(c)}</h2>
        ${c.desc ? `<p class="hint" style="margin:0">${esc(c.desc)}</p>` : ''}
        <div class="lvl"><span class="lvlnum num">Niv. ${P.level}</span><div class="bar" role="progressbar" aria-valuenow="${P.xp}" aria-valuemin="${P.from}" aria-valuemax="${P.next ?? P.xp}" aria-label="XP du clan">
          <span style="width:${max ? 100 : pct(P.xp - P.from, P.next - P.from)}%"></span></div><small class="hint num">${max ? 'Niveau maximum' : `${P.xp - P.from}/${P.next - P.from} XP`}</small></div>
        ${c.banners.length ? `<div class="cbanners">${c.banners.slice().reverse().map(bannerHTML).join('')}</div>` : ''}</div></div>`;
  }
  function tabs() {
    const asks = me()?.requests.length || 0;
    return `<div class="seg ctabs" role="tablist" aria-label="Rubriques du clan">${TABS.map(([id, label]) => `<button role="tab" class="${C.tab === id ? 'on' : ''}" aria-selected="${C.tab === id}" data-act="clan-tab" data-tab="${id}">${label}${id === 'membres' && asks ? `<span class="badge num">${asks}</span>` : ''}</button>`).join('')}</div>`;
  }
  function missionsHTML(c) {
    const R = c.missions.rewards;
    const m = x => `<li class="${x.done ? 'done' : ''}"><div class="mtext"><b>${esc(x.label)}</b><small class="hint num">${x.done ? 'Accomplie ✓' : `${x.n}/${x.target}`}${x.done ? '' : ` · votre part : ${x.mine}/${x.share}`}</small></div>
      <div class="bar" aria-hidden="true"><span style="width:${pct(x.n, x.target)}%"></span></div></li>`;
    return `${block('Missions du jour', `<p class="hint" style="margin:0">Chaque partie de chaque membre compte, et l'objectif grandit avec le clan. Chacun peut en faire au plus sa part : il faut jouer à plusieurs. Une mission accomplie donne ${R.daily.xp} XP au clan et ${coins(R.daily.coins)} Écus à chacun de ceux qui y ont participé. Renouvelées à minuit.</p>
        <ul class="cmissions">${c.missions.day.map(m).join('')}</ul>`)}
      ${block('Missions de la semaine', `<p class="hint" style="margin:0">${R.weekly.xp} XP de clan et ${coins(R.weekly.coins)} Écus pour chaque participant. Renouvelées le lundi.</p>
        <ul class="cmissions">${c.missions.week.map(m).join('')}</ul>`)}
      ${block('Niveaux du clan', `<ul class="tiers">${CLAN_LEVELS.map(l => `<li class="${l.level === c.progress.level ? 'on' : ''}"><b>Niveau ${l.level}</b><span>${l.xp ? `${l.xp} XP · ` : ''}${l.members} membres${shopUnlocks(l.level)}</span></li>`).join('')}</ul>`)}
      ${c.log.length ? block('Journal du clan', `<ul class="clog">${c.log.slice(0, 12).map(x => `<li><small class="hint">${new Date(x.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small> ${esc(x.text)}</li>`).join('')}</ul>`) : ''}`;
  }
  const shopUnlocks = lv => { const n = C.data.shop.filter(x => x.level === lv).length; return n ? ` · ${n} objet${n > 1 ? 's' : ''} au magasin` : ''; };

  function membersHTML(c) {
    const lead = c.leader === c.me;
    const who = p => `<button class="fwho" data-act="player" data-login="${esc(p.login)}" aria-label="Profil de ${esc(p.name)}">${avatar(p)}<span class="fname"><b>${esc(p.name)}</b>
      <small class="hint">${p.leader ? `<span class="crole">♛ ${ROLE.leader}</span> · ` : ''}niv. ${p.level}${p.title ? ` · <span class="ptitle">${esc(p.title)}</span>` : ''}</small></span></button>`;
    const acts = p => {
      if (!lead || p.login === c.me) return '';
      if (C.confirm?.login === p.login) return `<div class="row fbtns"><button class="btn sm primary" data-act="clan-${C.confirm.what}" data-login="${esc(p.login)}" ${busy()}>${C.confirm.what === 'kick' ? 'Confirmer l\'exclusion' : 'Confirmer : nouveau chef'}</button>
        <button class="btn sm" data-act="clan-no">Annuler</button></div>`;
      return `<div class="row fbtns"><button class="btn sm" data-act="clan-ask" data-what="promote" data-login="${esc(p.login)}">Nommer chef</button>
        <button class="btn sm" data-act="clan-ask" data-what="kick" data-login="${esc(p.login)}">Exclure</button></div>`;
    };
    const row = p => `<div class="frow cmember">${who(p)}<small class="cstat num">${p.rank ? `<span class="rank rank-${esc(p.rank.id)}">${esc(p.rank.label)}</span>` : '<span class="hint">Pas classé</span>'}
      <span class="hint">${plural(p.week, 'partie')} · ${p.dons} Écus donnés cette semaine</span></small>${acts(p)}</div>`;
    const reqs = lead && c.requests.length ? block(`Demandes d'adhésion (${c.requests.length})`, `<div class="flist">${c.requests.map(p => `<div class="frow"><span class="fwho">${avatar(p)}<span class="fname"><b>${esc(p.name)}</b><small class="hint">niv. ${p.level}</small></span></span>
      <div class="row fbtns"><button class="btn sm primary" data-act="clan-accept" data-login="${esc(p.login)}" ${busy()}>Accepter</button><button class="btn sm" data-act="clan-refuse" data-login="${esc(p.login)}" ${busy()}>Refuser</button></div></div>`).join('')}</div>`) : '';
    const E = C.edit;
    const settings = !lead ? '' : E ? `<form class="card-box cform" id="clan-edit"><span class="eyebrow">Réglages du clan</span>
        <div class="cpicks">${Object.entries(CLAN_ICONS).map(([id, name]) => `<button type="button" class="cpick ${E.icon === id ? 'on' : ''}" data-act="clan-e-icon" data-icon="${id}" aria-label="${esc(name)}" aria-pressed="${E.icon === id}">${crestHTML({ ...E, icon: id })}</button>`).join('')}</div>
        <div class="cpicks">${Object.entries(CLAN_COLORS).map(([id, col]) => `<button type="button" class="cswatch ${E.color === id ? 'on' : ''}" data-act="clan-e-color" data-color="${id}" style="--sw:${col}" aria-label="${esc(id)}" aria-pressed="${E.color === id}"></button>`).join('')}</div>
        <div class="field"><label class="eyebrow" for="clan-edesc">Description</label><input id="clan-edesc" maxlength="${CLAN_DESC_MAX}" autocomplete="off" value="${esc(E.desc)}"></div>
        <label class="ctoggle"><input type="checkbox" id="clan-eopen" ${E.open ? 'checked' : ''}> Ouvert à tous</label>
        <div class="row"><button class="btn primary" type="submit" ${busy()}>Enregistrer</button><button class="btn" type="button" data-act="clan-edit-cancel">Annuler</button></div></form>`
      : '<button class="btn" data-act="clan-edit-open">Modifier le blason, la description, l\'accès</button>';
    const leave = C.confirm?.what === 'leave' ? `<div class="card-box"><p style="margin:0">Quitter ${esc(c.name)} ?${c.members.length === 1 ? ' Vous êtes le dernier membre : le clan disparaîtra.' : lead ? ' Le membre le plus ancien deviendra chef.' : ''} Ce que vous avez acheté au magasin vous reste.</p>
        <div class="row"><button class="btn primary" data-act="clan-leave" ${busy()}>Quitter le clan</button><button class="btn" data-act="clan-no">Rester</button></div></div>`
      : '<button class="btn" data-act="clan-ask" data-what="leave">Quitter le clan</button>';
    return `${reqs}${block(`Membres · ${c.members.length}/${c.progress.members}`, `<div class="flist">${c.members.map(row).join('')}</div>
      <p class="hint" style="margin:0">Le rang classé de chaque membre compte pour le classement des clans.</p>`)}${settings}${leave}`;
  }

  function donsHTML() {
    const D = C.data;
    const row = d => {
      const left = d.left, steps = [...new Set([d.rate * (d.res === 'shards' ? 10 : d.res === 'prisms' ? 1 : 4), left - (left % d.rate)])].filter(n => n >= d.rate && n <= left);
      const name = d.res === 'shards' ? `${app.ico('shard')} Éclats` : d.res === 'prisms' ? `${app.ico('prism')} Prismes` : 'Essence universelle';
      return `<div class="cdon"><div><b>${name}</b><small class="hint num">${d.rate} pour ${d.coins} Écu${d.coins > 1 ? 's' : ''} · aujourd'hui ${d.given}/${d.cap} · vous en avez ${d.have}</small>
        <div class="bar" aria-hidden="true"><span style="width:${pct(d.given, d.cap)}%"></span></div></div>
        <div class="row fbtns">${left >= d.rate ? steps.map(n => `<button class="btn sm ${n === steps[steps.length - 1] ? 'primary' : ''}" data-act="clan-donate" data-res="${d.res}" data-amount="${n}" ${ui.busy || d.have < n ? 'disabled' : ''}>Donner ${n} · +${Math.floor(n / d.rate) * d.coins} ${app.ico('ecu')}</button>`).join('') : `<small class="hint">${d.given >= d.cap ? 'Limite du jour atteinte' : 'Limite d\'Écus du jour atteinte'}</small>`}</div></div>`;
    };
    const day = D.donDay;
    return block(`Dons · vous avez ${coins(D.coins)} Écus`, `<p class="hint" style="margin:0">Donnez des ressources au clan : vous recevez des Écus à dépenser au magasin du clan, et vos dons font avancer la mission de dons de la semaine. Au plus ${day.max} Écus de dons par jour, toutes ressources confondues ; limites renouvelées à minuit.</p>
      <div class="cdonday"><b class="num">Aujourd'hui : ${day.got}/${day.max} ${app.ico('ecu')}</b><div class="bar" aria-hidden="true"><span style="width:${pct(day.got, day.max)}%"></span></div></div>
      ${D.donations.map(row).join('')}`);
  }

  function itemVisual(x) {
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art') { const A = ARTS[id], card = A.card; return `<div class="citem-art">${artHTML(card, (CARDS[card] || GENERALS[card]).name, 1, '', id)}</div>`; }
    if (x.kind === 'back') return `<span class="mc back back-${esc(id)}"></span>`;
    if (x.kind === 'frame') return app.avatarHTML(ui.account, 'cav', id);
    return `<span class="ctitle">« ${esc(x.name.replace(/^Titre « (.*) »$/, '$1'))} »</span>`;
  }
  function shopHTML() {
    const D = C.data, lv = me().progress.level;
    const item = x => {
      const art = x.kind === 'art' ? ARTS[x.id.slice(4)] : null;
      const state = x.owned ? '<span class="ok">✓ Possédé</span>' : x.locked ? `<span class="hint">Clan niveau ${x.level}</span>`
        : `<button class="btn sm ${D.coins >= x.price ? 'primary' : ''}" data-act="clan-buy" data-item="${esc(x.id)}" ${ui.busy || D.coins < x.price ? 'disabled' : ''}>${app.ico('ecu')}${x.price}</button>`;
      return `<div class="citem ${x.locked ? 'locked' : ''} ${x.owned ? 'owned' : ''} k-${x.kind}">${itemVisual(x)}<b>${esc(x.name)}</b>
        <small class="hint">${art ? `${esc(rarityName(art))} · ${esc((CARDS[art.card] || GENERALS[art.card]).name)}` : { back: 'Dos de carte', frame: 'Cadre de profil', title: 'Titre' }[x.kind]}</small>${state}</div>`;
    };
    return block(`Magasin du clan · vous avez ${coins(D.coins)} Écus`, `<p class="hint" style="margin:0">Arts de la famille Bannières, dos, cadres et titres, seulement ici. Votre clan est niveau ${lv} : les objets d'un niveau plus haut se débloquent quand il monte. Ce que vous achetez vous reste, même si vous quittez le clan.</p>
      <div class="cshop">${D.shop.map(item).join('')}</div>`);
  }

  function ladderHTML() {
    const L = C.ladder;
    if (!L) return block('Classement des clans', '<p class="wait">Chargement…</p>');
    const row = x => `<li class="${me()?.id === x.id ? 'me' : ''}"><span class="lpos num">${x.pos ?? '–'}</span><span class="cname">${crestHTML(x)}<span><b>${esc(x.name)}</b> ${tagHTML(x)}
      <small class="hint">Niv. ${x.level} · ${plural(x.members, 'membre')}</small></span></span><b class="num cscore">${x.score} ★</b></li>`;
    const mine = L.mine && !L.ladder.some(x => x.id === L.mine.id) ? `<ol class="ladder"><li class="me"><span class="lpos num">${L.mine.pos ?? '–'}</span><span class="cname">${crestHTML(L.mine)}<span><b>${esc(L.mine.name)}</b> ${tagHTML(L.mine)}</span></span><b class="num cscore">${L.mine.score} ★</b></li></ol>` : '';
    const last = L.last?.top.length ? block(`Podium des clans de ${esc(L.last.seasonName)}`, `<ol class="ladder">${L.last.top.map(row).join('')}</ol>`) : '';
    return `${block(`Classement des clans · ${esc(L.seasonName)}`, `<p class="hint" style="margin:0">Le score d'un clan est la somme des étoiles classées de ses membres cette saison. Jouez en classé pour faire monter votre clan !</p>
      ${L.ladder.length ? `<ol class="ladder cladder">${L.ladder.map(row).join('')}</ol>` : '<p class="hint" style="margin:0">Aucun clan classé pour l\'instant ce mois-ci.</p>'}${mine}`)}
      ${block('Récompenses de fin de mois', `<p class="hint" style="margin:0">Le classement est figé à la fin du mois. Chaque membre des 10 meilleurs clans reçoit les récompenses de la place de son clan, et le clan garde sa bannière.</p>
        <ul class="tiers">${L.places.map(p => `<li><b>${esc(p.name)}</b><span>${app.ico('prism')}${p.prisms} · ${app.ico('ecu')}${p.coins} · titre · <span class="cbanner cb-${p.banner}">${esc(p.bannerName)}</span></span></li>`).join('')}</ul>`)}
      ${last}`;
  }

  function screen() {
    if (!C.data) return `${head('Clan')}${app.errLine()}<p class="wait">Chargement…</p>`;
    const c = me();
    if (!c) return lobby();
    const body = { clan: () => missionsHTML(c), membres: () => membersHTML(c), dons: donsHTML, magasin: shopHTML, classement: ladderHTML }[C.tab]();
    return `${head('Mon clan')}${app.errLine()}${note()}${header(c)}${tabs()}${body}`;
  }

  // ---- Clics, saisies, formulaires ----
  function click(a, ds) {
    if (a === 'clan') { ui.screen = 'clan'; ui.error = ''; C.note = ''; C.confirm = null; C.edit = null; C.data ||= null; load(); app.render(); }
    else if (a === 'clan-tab') { C.tab = ds.tab; C.confirm = null; C.note = ''; if (ds.tab === 'classement') ladder(); app.render(); }
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
    else if (['clan-kick', 'clan-promote', 'clan-accept', 'clan-refuse'].includes(a) && !ui.busy) { C.confirm = null; act(`/api/clan/${a.slice(5)}`, { login: ds.login }); }
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
    if (b) b.textContent = C.form.name || 'Nom du clan';
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
      if (!C.data) { load(); return '<p class="wait">Chargement…</p>'; }
      return me() ? `${app.errLine()}${note()}${shopHTML()}` : '<p class="hint">Rejoignez un clan pour ouvrir son magasin.</p>';
    },
    // Demandes d'adhésion en attente (pour le chef), pour la tuile de l'accueil.
    pending: () => (me()?.leader === me()?.me ? me()?.requests.length || 0 : 0),
    // Tuile de l'accueil : le clan, ou l'invitation à en rejoindre un.
    tile(account) {
      const c = me(), lv = c ? c.progress.level : 0;
      if (account.clan && c) {
        const left = [...c.missions.day].filter(m => !m.done).length;
        return `<button class="tile ctile ${C.data?.clan?.requests.length && c.leader === c.me ? 'todo' : ''}" data-act="clan"><span class="eyebrow">Clan · niv. ${lv}</span>
          <b class="ctile-name">${crestHTML(c, 'sm')}${esc(c.name)}</b><span class="tile-foot num">${left ? `${left} mission${left > 1 ? 's' : ''} du jour en cours` : 'Missions du jour finies ✓'}</span></button>`;
      }
      return `<button class="tile ctile" data-act="clan"><span class="eyebrow">Clan</span><b>${account.clan ? 'Mon clan' : 'Rejoindre'}</b>
        <span class="tile-foot">${account.clan ? 'Missions, dons, magasin' : 'Créer ou rejoindre un clan'}</span></button>`;
    },
    // Charge le clan en arrière-plan (tuile de l'accueil).
    warm() { if (ui.auth && ui.account?.clan && !C.data) api('GET', '/api/clan', undefined, ui.auth).then(r => { set(r); app.render(); }).catch(() => {}); },
    stop() { Object.assign(C, { data: null, list: null, ladder: null, form: null, edit: null, confirm: null, note: '', avatars: {}, tab: 'clan' }); },
    levelOf: clanLevelOf,
  };
}
