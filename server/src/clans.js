// Clans : création (contre des Prismes) et adhésion, missions de clan quotidiennes et hebdomadaires cumulées sur tous les membres,
// dons de ressources contre des Écus (monnaie du clan), magasin du clan, niveaux 1 à 5 et classement mensuel des clans.
// Les clans sont rangés dans le document de réglages « clans » ({ [id]: clan }) ; le classement figé de chaque mois dans
// « classement-clans » ({ [saison]: { closed, top } }). Compte : clan (identifiant), clanCoins (Écus), clanReq (demandes en attente),
// clanDon (dons du jour : { date, shards, prisms, uniEssence }).
import { createHash, randomBytes } from 'node:crypto';
import { CARDS, shuffle } from '@jeu/engine';
import { ARTS, artExists } from '@jeu/engine/arts';
import { TITLES, FRAMES, BACKS } from '@jeu/engine/rewards';
import { rankOf, seasonId, seasonName } from '@jeu/engine/ranked';
import { CLAN_PRICE, CLAN_NAME_MAX, CLAN_TAG_RE, CLAN_DESC_MAX, MAX_REQUESTS, MAX_CLAN_REQUESTS, CLAN_LEVELS, clanLevelOf, clanLevelView, maxMembers,
  CLAN_ICONS, CLAN_COLORS, CLAN_MISSION_KINDS, CLAN_DAILY, CLAN_WEEKLY, CLAN_MISSION_REWARDS, clanMissionLabel, clanTarget, clanShare, clanDay, clanWeek, DON_DAY_COINS,
  DONATIONS, donationCoins, CLAN_SHOP, clanItem, CLAN_LADDER_SIZE, CLAN_PLACES, clanPlaceOf } from '@jeu/engine/clans';
import { HttpError } from './accounts.js';

const LOG_MAX = 30;
const now = () => new Date().toISOString();
const avatarKey = a => (a.avatar ? createHash('sha1').update(a.avatar).digest('hex').slice(0, 12) : null);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

export function createClans(store, accounts) {
  const clans = store.doc('clans') || {};
  const progress = accounts.progress;
  const save = () => store.putDoc('clans', clans).catch(e => console.error('Clans non enregistrés :', e));
  const put = a => store.put(a).catch(e => console.error('Compte non enregistré :', e));
  const log = (c, text) => { c.log = [{ at: now(), text }, ...(c.log || [])].slice(0, LOG_MAX); };
  const nameOf = login => store.get(login)?.name || login;
  const level = c => clanLevelOf(c.xp || 0);
  const isFull = c => c.members.length >= maxMembers(level(c));

  // Clan du joueur. Un membre dont le compte a été supprimé quitte son clan ; un clan vide disparaît.
  function prune(c) {
    const before = c.members.length;
    c.members = c.members.filter(l => store.get(l));
    c.requests = (c.requests || []).filter(l => store.get(l));
    if (!c.members.length) { delete clans[c.id]; return null; }
    if (!c.members.includes(c.leader)) c.leader = c.members[0];
    if (c.members.length !== before) save();
    return c;
  }
  function clanOf(a) {
    const c = a.clan && clans[a.clan];
    if (c && c.members.includes(a.login)) return prune(c);
    if (a.clan) a.clan = null;
    return null;
  }
  const mine = a => { const c = clanOf(a); if (!c) throw new HttpError(409, 'Vous n\'êtes dans aucun clan.'); return c; };
  const lead = a => { const c = mine(a); if (c.leader !== a.login) throw new HttpError(403, 'Seul le chef du clan peut faire cela.'); return c; };

  // ---- Missions de clan ----
  // Tirées au premier passage du jour (ou de la semaine). L'objectif d'une mission pas encore accomplie suit la taille du clan.
  function draw(c, scope, n) {
    const kinds = shuffle(Object.keys(CLAN_MISSION_KINDS).filter(k => CLAN_MISSION_KINDS[k][scope])).slice(0, n);
    return kinds.map(kind => ({ kind, target: clanTarget(kind, scope, c.members.length), n: 0, done: false, by: {} }));
  }
  function missions(c) {
    const day = clanDay(), week = clanWeek();
    let changed = false;
    if (c.day?.id !== day) { c.day = { id: day, list: draw(c, 'daily', CLAN_DAILY) }; changed = true; }
    if (c.week?.id !== week) { c.week = { id: week, list: draw(c, 'weekly', CLAN_WEEKLY), dons: {}, points: {} }; changed = true; }
    for (const [scope, list] of [['daily', c.day.list], ['weekly', c.week.list]]) for (const m of list) {
      const t = clanTarget(m.kind, scope, c.members.length);
      if (!m.done && m.target !== t) { m.target = t; changed = true; }
    }
    if (changed) save();
    return c;
  }
  // Part qu'un membre peut encore faire d'une mission : à plusieurs, personne ne la finit seul.
  const shareOf = (c, m) => clanShare(m.target, c.members.length);
  // Une mission accomplie : XP du clan (et peut-être un niveau), Écus pour chaque membre qui y a contribué.
  function complete(c, m, scope, current) {
    const r = CLAN_MISSION_REWARDS[scope], before = level(c);
    m.done = true; c.xp = (c.xp || 0) + r.xp;
    log(c, `Mission ${scope === 'daily' ? 'du jour' : 'de la semaine'} accomplie : ${clanMissionLabel(m)} (+${r.xp} XP de clan)`);
    const label = `Mission de clan accomplie : ${clanMissionLabel(m)}`;
    for (const login of Object.keys(m.by)) {
      if (!c.members.includes(login)) continue;
      const b = login === current?.login ? current : store.get(login); if (!b) continue;
      progress.grant(b, { kind: 'clan', label, clanCoins: r.coins });
      if (b !== current) put(b);
    }
    const after = level(c);
    if (after > before) {
      log(c, `Le clan passe au niveau ${after} !`);
      for (const login of c.members) {
        const b = login === current?.login ? current : store.get(login); if (!b) continue;
        progress.grant(b, { kind: 'clan', label: `Votre clan ${c.name} passe au niveau ${after}` });
        if (b !== current) put(b);
      }
    }
  }
  // counts : avancement par sorte de mission. a : le compte qui avance (enregistré par l'appelant).
  function advance(c, a, counts) {
    missions(c);
    let changed = false;
    for (const [scope, list] of [['daily', c.day.list], ['weekly', c.week.list]]) for (const m of list) {
      const n = Math.min(counts[m.kind] || 0, shareOf(c, m) - (m.by[a.login] || 0));
      if (n <= 0 || m.done) continue;
      m.n = Math.min(m.target, m.n + n); m.by[a.login] = (m.by[a.login] || 0) + n; changed = true;
      if (m.n >= m.target) complete(c, m, scope, a);
    }
    // Activité de la semaine de chaque membre (parties jouées), pour la liste des membres.
    if (counts.games) { c.week.points[a.login] = (c.week.points[a.login] || 0) + counts.games; changed = true; }
    if (changed) save();
  }
  // Fin de partie (accounts.recordGame) : les missions du clan avancent.
  function onGame(a, { result, played = [], ranked = false }) {
    const c = clanOf(a); if (!c) return;
    advance(c, a, { games: 1, wins: result === 'win' ? 1 : 0, cards: played.filter(id => CARDS[id] && !CARDS[id].token).length,
      spells: played.filter(id => CARDS[id]?.type === 'S').length, creatures: played.filter(id => CARDS[id]?.type === 'C').length, ranked: ranked ? 1 : 0 });
  }

  // ---- Classement ----
  // Score d'un clan pour une saison : étoiles classées cumulées des membres qui y ont joué au moins une partie classée.
  const starsOf = (login, season) => { const R = store.get(login)?.ranked; return R && R.season === season && R.games ? R.r : 0; };
  const scoreOf = (c, season = seasonId()) => c.members.reduce((s, l) => s + starsOf(l, season), 0);
  const banner = c => (c.banners || []).slice().sort((x, y) => x.pos - y.pos || (y.season > x.season ? 1 : -1))[0] || null;
  const short = c => ({ id: c.id, name: c.name, tag: c.tag, icon: c.icon, color: c.color, level: level(c), banner: banner(c) });
  function ladder(season = seasonId()) {
    return Object.values(clans).map(prune).filter(Boolean).map(c => ({ c, score: scoreOf(c, season) })).filter(x => x.score > 0)
      .sort((x, y) => y.score - x.score || (y.c.xp || 0) - (x.c.xp || 0) || x.c.created.localeCompare(y.c.created))
      .map((x, i) => ({ pos: i + 1, ...short(x.c), members: x.c.members.length, score: x.score }));
  }
  const finals = () => store.doc('classement-clans') || {};
  // Fin du mois (progress.closeSeason, avant que les rangs ne repartent) : les 10 premiers clans sont figés ; chaque membre reçoit
  // les récompenses de la place de son clan, et le clan garde sa bannière.
  function closeSeason(season) {
    if (finals()[season]) return;
    const top = ladder(season).slice(0, CLAN_LADDER_SIZE).map(x => ({ ...x, logins: clans[x.id].members.slice() }));
    store.putDoc('classement-clans', { ...finals(), [season]: { closed: now(), top } }).catch(e => console.error('Classement des clans non enregistré :', e));
    for (const x of top) {
      const p = CLAN_PLACES[clanPlaceOf(x.pos)], c = clans[x.id]; if (!p || !c) continue;
      (c.banners ||= []).push({ id: p.banner, name: p.bannerName, season, pos: x.pos });
      log(c, `${seasonName(season)} : ${x.pos === 1 ? '1re' : `${x.pos}e`} place du classement des clans, ${p.bannerName.toLowerCase()} gagnée`);
      for (const login of x.logins) {
        const b = store.get(login); if (!b || !b.level) continue;
        progress.grant(b, { kind: 'clan', label: `Classement des clans de ${seasonName(season)} : ${c.name}, ${x.pos === 1 ? '1re' : `${x.pos}e`} place`,
          prisms: p.prisms, clanCoins: p.coins, title: p.title });
        put(b);
      }
    }
    if (top.length) { save(); console.log(`Classement des clans de ${seasonName(season)} figé : ${top.map(x => `${x.pos}. ${x.tag}`).join(', ')}.`); }
  }
  function lastSeason() {
    const all = finals(), id = Object.keys(all).sort().pop();
    return id ? { season: id, seasonName: seasonName(id), top: all[id].top.slice(0, 3).map(({ logins, ...x }) => x) } : null;
  }

  // ---- Vues ----
  function member(c, login) {
    const b = store.get(login), badge = progress.badge(b), R = b.ranked?.season === seasonId() && b.ranked.games ? rankOf(b.ranked.r) : null;
    return { login, name: b.name, level: badge.level, title: badge.title, frame: badge.frame, avatar: avatarKey(b), leader: c.leader === login,
      joined: c.joined?.[login] || c.created, rank: R, week: c.week?.points?.[login] || 0, dons: c.week?.dons?.[login] || 0 };
  }
  const missionView = m => ({ kind: m.kind, label: clanMissionLabel(m), n: m.n, target: m.target, done: m.done, mine: 0 });
  function clanView(a, c) {
    missions(c);
    const pos = ladder().find(x => x.id === c.id);
    const ms = list => list.map(m => ({ ...missionView(m), mine: m.by[a.login] || 0, share: shareOf(c, m) }));
    return { ...short(c), desc: c.desc || '', open: !!c.open, leader: c.leader, me: a.login, created: c.created,
      progress: clanLevelView(c.xp || 0), maxLevel: CLAN_LEVELS.length,
      members: c.members.map(l => member(c, l)).sort((x, y) => (y.leader - x.leader) || y.week - x.week || x.name.localeCompare(y.name, 'fr')),
      requests: c.leader === a.login ? c.requests.map(l => { const b = store.get(l); return { login: l, name: b.name, level: b.level || 1, avatar: avatarKey(b) }; }) : [],
      missions: { day: ms(c.day.list), week: ms(c.week.list), rewards: CLAN_MISSION_REWARDS },
      banners: c.banners || [], log: c.log || [], score: scoreOf(c), pos: pos ? pos.pos : null };
  }
  // Ce qu'il faut à l'écran du clan : le clan (ou null), les Écus, les dons du jour et le magasin.
  function donView(a) {
    const d = a.clanDon?.date === clanDay() ? a.clanDon : {};
    const coinsLeft = Math.max(0, DON_DAY_COINS - (d.coins || 0));
    return Object.entries(DONATIONS).map(([res, x]) => ({ res, name: x.name, rate: x.rate, coins: x.coins || 1, cap: x.cap, given: d[res] || 0, have: a[res] || 0,
      left: Math.min(x.cap - (d[res] || 0), Math.floor(coinsLeft / (x.coins || 1)) * x.rate) }));
  }
  const donDay = a => { const d = a.clanDon?.date === clanDay() ? a.clanDon : {}; return { max: DON_DAY_COINS, got: d.coins || 0 }; };
  function shopView(a, c) {
    const lv = c ? level(c) : 0;
    return CLAN_SHOP.filter(x => x.kind !== 'art' || artExists(x.id.slice(4))).map(x => ({ ...x, owned: owns(a, x), locked: lv < x.level }));
  }
  function view(a) {
    const c = clanOf(a);
    return { clan: c ? clanView(a, c) : null, coins: a.clanCoins || 0, price: CLAN_PRICE, donations: donView(a), donDay: donDay(a), shop: shopView(a, c),
      requested: (a.clanReq || []).map(id => clans[id]).filter(x => x && x.requests.includes(a.login)).map(short),
      icons: CLAN_ICONS, colors: CLAN_COLORS, levels: CLAN_LEVELS, places: CLAN_PLACES };
  }
  const listItem = (a, c) => ({ ...short(c), desc: c.desc || '', open: !!c.open, members: c.members.length, max: maxMembers(level(c)), score: scoreOf(c),
    asked: c.requests.includes(a.login) });
  // Clans à rejoindre : recherche par nom ou étiquette ; sans recherche, ceux qui ont de la place, les plus hauts d'abord.
  function list(a, q = '') {
    q = String(q || '').trim().toLowerCase();
    const all = Object.values(clans).map(prune).filter(Boolean);
    const hits = q ? all.filter(c => c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q)) : all.filter(c => !isFull(c));
    return { clans: hits.sort((x, y) => level(y) - level(x) || y.members.length - x.members.length || x.name.localeCompare(y.name, 'fr')).slice(0, 30).map(c => listItem(a, c)) };
  }
  // Images de profil des membres et des demandes (l'appli les demande quand leur empreinte change).
  function avatars(a) {
    const c = mine(a), out = {};
    for (const l of [...c.members, ...(c.leader === a.login ? c.requests : [])]) { const b = store.get(l); if (b?.avatar) out[l] = b.avatar; }
    return { avatars: out };
  }
  const done = (a, msg) => ({ ...view(a), account: accounts.me(a), ...(msg ? { msg } : {}) });

  // ---- Création, adhésion, départ ----
  function cleanName(name) {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    if (n.length < 3 || n.length > CLAN_NAME_MAX) throw new HttpError(400, `Le nom du clan fait de 3 à ${CLAN_NAME_MAX} caractères.`);
    return n;
  }
  function settings(c, { desc, open, icon, color }) {
    if (desc !== undefined) { const d = String(desc || '').trim(); if (d.length > CLAN_DESC_MAX) throw new HttpError(400, `Description : ${CLAN_DESC_MAX} caractères au plus.`); c.desc = d; }
    if (open !== undefined) c.open = !!open;
    if (icon !== undefined) { if (!CLAN_ICONS[icon]) throw new HttpError(400, 'Symbole inconnu.'); c.icon = icon; }
    if (color !== undefined) { if (!CLAN_COLORS[color]) throw new HttpError(400, 'Couleur inconnue.'); c.color = color; }
  }
  // Entrer dans un clan : les demandes envoyées ailleurs sont retirées.
  function enter(c, b) {
    for (const id of b.clanReq || []) if (clans[id]) clans[id].requests = clans[id].requests.filter(l => l !== b.login);
    b.clanReq = []; b.clan = c.id;
    if (!c.members.includes(b.login)) c.members.push(b.login);
    c.requests = c.requests.filter(l => l !== b.login);
    (c.joined ||= {})[b.login] = now();
    log(c, `${b.name} rejoint le clan.`);
  }
  async function create(a, body) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    if (clanOf(a)) throw new HttpError(409, 'Quittez d\'abord votre clan.');
    const name = cleanName(body.name), tag = String(body.tag || '').trim().toUpperCase();
    if (!CLAN_TAG_RE.test(tag)) throw new HttpError(400, 'L\'étiquette du clan fait 2 à 4 lettres ou chiffres.');
    const all = Object.values(clans);
    if (all.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'Un clan porte déjà ce nom.');
    if (all.some(c => c.tag === tag)) throw new HttpError(409, 'Un clan porte déjà cette étiquette.');
    if ((a.prisms || 0) < CLAN_PRICE) throw new HttpError(409, `Il vous faut ${CLAN_PRICE} Prismes pour créer un clan (vous en avez ${a.prisms || 0}).`);
    const c = { id: randomBytes(5).toString('hex'), name, tag, icon: 'bouclier', color: 'azur', desc: '', open: true, leader: a.login, members: [], requests: [],
      joined: {}, xp: 0, created: now(), banners: [], log: [] };
    settings(c, { desc: body.desc, open: body.open ?? true, icon: body.icon || 'bouclier', color: body.color || 'azur' });
    a.prisms -= CLAN_PRICE;
    clans[c.id] = c;
    enter(c, a); c.log = []; log(c, `${a.name} fonde le clan ${c.name}.`);
    missions(c);
    await Promise.all([save(), store.put(a)]);
    return done(a, `Clan ${c.name} créé !`);
  }
  async function join(a, { id }) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    if (clanOf(a)) throw new HttpError(409, 'Quittez d\'abord votre clan.');
    const c = clans[String(id || '')] && prune(clans[String(id || '')]);
    if (!c) throw new HttpError(404, 'Ce clan n\'existe plus.');
    if (isFull(c)) throw new HttpError(409, `${c.name} est complet.`);
    let msg;
    if (c.open) { enter(c, a); msg = `Bienvenue dans ${c.name} !`; }
    else {
      if (c.requests.includes(a.login)) throw new HttpError(409, 'Demande déjà envoyée.');
      a.clanReq = (a.clanReq || []).filter(x => clans[x]?.requests.includes(a.login));
      if (a.clanReq.length >= MAX_REQUESTS) throw new HttpError(409, `${MAX_REQUESTS} demandes en attente au plus : annulez-en une.`);
      if (c.requests.length >= MAX_CLAN_REQUESTS) throw new HttpError(409, `${c.name} a déjà trop de demandes en attente.`);
      c.requests.push(a.login); a.clanReq.push(c.id);
      msg = `Demande envoyée à ${c.name}. Le chef du clan doit l'accepter.`;
    }
    await Promise.all([save(), store.put(a)]);
    return done(a, msg);
  }
  async function cancel(a, { id }) {
    const c = clans[String(id || '')];
    if (c) c.requests = c.requests.filter(l => l !== a.login);
    a.clanReq = (a.clanReq || []).filter(x => x !== id);
    await Promise.all([save(), store.put(a)]);
    return done(a);
  }
  // Retirer un membre (départ ou exclusion) : le chef qui part laisse sa place au plus ancien membre ; le dernier ferme le clan.
  function removeMember(c, b, text) {
    c.members = c.members.filter(l => l !== b.login);
    if (c.joined) delete c.joined[b.login];
    b.clan = null;
    if (!c.members.length) { delete clans[c.id]; return; }
    log(c, text);
    if (c.leader === b.login) {
      c.leader = c.members.slice().sort((x, y) => (c.joined?.[x] || '').localeCompare(c.joined?.[y] || ''))[0];
      log(c, `${nameOf(c.leader)} devient chef du clan.`);
    }
  }
  async function leave(a) {
    const c = mine(a);
    removeMember(c, a, `${a.name} quitte le clan.`);
    await Promise.all([save(), store.put(a)]);
    return done(a, `Vous avez quitté ${c.name}.`);
  }
  const target = (c, login, where = 'members') => {
    const b = store.get(String(login || ''));
    if (!b || !c[where].includes(b.login)) throw new HttpError(404, where === 'members' ? 'Ce joueur n\'est pas dans le clan.' : 'Cette demande n\'existe plus.');
    return b;
  };
  async function accept(a, { login }) {
    const c = lead(a), b = target(c, login, 'requests');
    if (clanOf(b)) { c.requests = c.requests.filter(l => l !== b.login); await save(); throw new HttpError(409, `${b.name} a déjà rejoint un autre clan.`); }
    if (isFull(c)) throw new HttpError(409, 'Le clan est complet : montez de niveau pour accueillir plus de membres.');
    enter(c, b);
    progress.grant(b, { kind: 'clan', label: `Vous avez rejoint le clan ${c.name}` });
    await Promise.all([save(), store.put(b)]);
    return done(a, `${b.name} a rejoint le clan.`);
  }
  async function refuse(a, { login }) {
    const c = lead(a), b = target(c, login, 'requests');
    c.requests = c.requests.filter(l => l !== b.login); b.clanReq = (b.clanReq || []).filter(x => x !== c.id);
    await Promise.all([save(), store.put(b)]);
    return done(a);
  }
  async function kick(a, { login }) {
    const c = lead(a), b = target(c, login);
    if (b.login === a.login) throw new HttpError(400, 'Pour partir, quittez le clan.');
    removeMember(c, b, `${b.name} est exclu du clan.`);
    progress.grant(b, { kind: 'clan', label: `Vous ne faites plus partie du clan ${c.name}` });
    await Promise.all([save(), store.put(b)]);
    return done(a, `${b.name} ne fait plus partie du clan.`);
  }
  async function promote(a, { login }) {
    const c = lead(a), b = target(c, login);
    if (b.login === a.login) throw new HttpError(400, 'Vous êtes déjà chef du clan.');
    c.leader = b.login; log(c, `${a.name} confie la tête du clan à ${b.name}.`);
    await save();
    return done(a, `${b.name} est maintenant chef du clan.`);
  }
  async function edit(a, body) {
    const c = lead(a);
    settings(c, body || {});
    await save();
    return done(a, 'Clan mis à jour.');
  }

  // ---- Dons ----
  // Une ressource contre des Écus, dans la limite du jour. Les Écus des dons font avancer la mission de dons de la semaine.
  async function donate(a, { res, amount }) {
    const c = mine(a), d = DONATIONS[res];
    if (!d) throw new HttpError(400, 'Ressource inconnue.');
    const n = Number(amount);
    if (!Number.isInteger(n) || n < d.rate) throw new HttpError(400, `Donnez au moins ${d.rate} ${d.name}.`);
    const day = clanDay(); if (a.clanDon?.date !== day) a.clanDon = { date: day };
    const per = d.coins || 1, coinsLeft = DON_DAY_COINS - (a.clanDon.coins || 0);
    if (coinsLeft < per) throw new HttpError(409, `Vous avez atteint la limite de dons du jour (${DON_DAY_COINS} Écus). Revenez demain !`);
    const left = Math.min(d.cap - (a.clanDon[res] || 0), Math.floor(coinsLeft / per) * d.rate), give = Math.min(n - (n % d.rate), left - (left % d.rate));
    if (give <= 0) throw new HttpError(409, `Vous avez déjà donné ${d.cap} ${d.name} aujourd'hui.`);
    if ((a[res] || 0) < give) throw new HttpError(409, `Il vous faut ${give} ${d.name} (vous en avez ${a[res] || 0}).`);
    const coins = donationCoins(res, give);
    a[res] -= give; a.clanDon[res] = (a.clanDon[res] || 0) + give; a.clanDon.coins = (a.clanDon.coins || 0) + coins; a.clanCoins = (a.clanCoins || 0) + coins;
    missions(c);
    c.week.dons[a.login] = (c.week.dons[a.login] || 0) + coins;
    log(c, `${a.name} donne ${give} ${give > 1 ? d.name : d.name.replace(/s$/, '')} (${plural(coins, 'Écu')}).`);
    advance(c, a, { dons: coins });
    await Promise.all([save(), store.put(a)]);
    return done(a, `Merci ! +${plural(coins, 'Écu')}.`);
  }

  // ---- Magasin ----
  function owns(a, x) {
    const [kind, ...rest] = x.id.split(':'), id = rest.join(':');
    if (kind === 'art') return !!a.arts?.[id];
    const cos = a.cosmetics || {};
    return kind === 'title' ? !!cos.titles?.includes(id) : kind === 'frame' ? !!cos.frames?.includes(id) : !!cos.backs?.includes(id);
  }
  async function buy(a, { item }) {
    const c = mine(a), x = clanItem(String(item || ''));
    if (!x) throw new HttpError(400, 'Objet inconnu.');
    if (level(c) < x.level) throw new HttpError(409, `Il faut un clan de niveau ${x.level}.`);
    if (owns(a, x)) throw new HttpError(409, 'Vous l\'avez déjà.');
    if ((a.clanCoins || 0) < x.price) throw new HttpError(409, `Il vous faut ${x.price} Écus (vous en avez ${a.clanCoins || 0}).`);
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art' && !artExists(id)) throw new HttpError(409, 'Cet art n\'est plus en vente.');
    if (!a.level) progress.init(a);
    a.clanCoins -= x.price;
    if (x.kind === 'art') a.arts = { ...(a.arts || {}), [id]: { at: now(), clan: true } };
    else progress.grant(a, { [x.kind]: id }, { silent: true });
    progress.check(a);
    await store.put(a);
    return { ...done(a, `${x.name} : à vous !`), got: x.kind === 'art' ? { art: id } : { [x.kind]: id, label: { title: TITLES, frame: FRAMES, back: BACKS }[x.kind][id] } };
  }

  // Ce que montre le profil public d'un joueur.
  const badge = login => { const b = store.get(login), c = b && clanOf(b); return c ? short(c) : null; };

  return {
    onGame, closeSeason, badge, clanOf,
    routes: {
      'GET /api/clan': a => view(a),
      'GET /api/clan/avatars': a => avatars(a),
      'GET /api/clans': (a, _, __, url) => list(a, url.searchParams.get('q')),
      'GET /api/clans/ladder': a => { const c = clanOf(a), L = ladder();
        return { ladder: L.slice(0, CLAN_LADDER_SIZE), mine: c ? L.find(x => x.id === c.id) || { ...short(c), score: 0, pos: null, members: c.members.length } : null,
          places: CLAN_PLACES, last: lastSeason(), seasonName: seasonName(seasonId()) }; },
      'POST /api/clan/create': (a, body) => create(a, body || {}),
      'POST /api/clan/join': (a, body) => join(a, body || {}),
      'POST /api/clan/cancel': (a, body) => cancel(a, body || {}),
      'POST /api/clan/leave': a => leave(a),
      'POST /api/clan/accept': (a, body) => accept(a, body || {}),
      'POST /api/clan/refuse': (a, body) => refuse(a, body || {}),
      'POST /api/clan/kick': (a, body) => kick(a, body || {}),
      'POST /api/clan/promote': (a, body) => promote(a, body || {}),
      'POST /api/clan/edit': (a, body) => edit(a, body || {}),
      'POST /api/clan/donate': (a, body) => donate(a, body || {}),
      'POST /api/clan/buy': (a, body) => buy(a, body || {}),
      // Administration : liste des clans, dissolution.
      'GET /api/admin/clans': () => ({ clans: Object.values(clans).map(prune).filter(Boolean).map(c => ({ ...short(c), xp: c.xp || 0, members: c.members.length, leader: c.leader, created: c.created, score: scoreOf(c) })) }),
      'POST /api/admin/clans/delete': async (_, { id } = {}) => {
        const c = clans[String(id || '')]; if (!c) throw new HttpError(404, 'Clan inconnu.');
        for (const l of [...c.members, ...c.requests]) { const b = store.get(l); if (b) { if (b.clan === c.id) b.clan = null; b.clanReq = (b.clanReq || []).filter(x => x !== c.id); await store.put(b); } }
        delete clans[c.id]; await save();
        return { ok: true };
      },
    },
  };
}
