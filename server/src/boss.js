// Boss mondial (packages/engine/src/boss.js) : tentatives du jour, score et paliers de chaque tentative, classement de la semaine,
// figé à sa fin avec les récompenses de chaque tranche, magasin du boss et réglages de /admin.
// Les parties se jouent dans un salon du serveur (index.js, message « boss ») : la tentative est comptée dès que la partie commence,
// et son score est calculé ici à la fin (ou à l'abandon, avec le plateau du moment). Documents : « boss » (réglages de /admin),
// « boss-classement » ({ [semaine]: { closed, boss, n, top } }). Compte : boss ({ week, boss, total, best, runs, day, used, last }),
// bossCoins (Insignes), bossBuys ({ week, n: { objet: achats } }). Statistiques des succès : bossRuns, bossBest, bossKinds, bossTop10.
import { createHash } from 'node:crypto';
import { GENERALS } from '@jeu/engine';
import { today, draftError, deckError } from '@jeu/engine/collection';
import { artExists } from '@jeu/engine/arts';
import { TITLES, FRAMES, BACKS } from '@jeu/engine/rewards';
import { DEFAULT_BOSS, BOSS_IDS, BOSS_SHOP, BOSS_LIMITS, isBoss, bossInfo, bossWeek, addWeeks, weekLast, weekDaysLeft, bossOfWeek, bossScore,
  tiersReached, rankBracket, bossItem, itemPrice, itemLimit } from '@jeu/engine/boss';
import { HttpError } from './accounts.js';

const LADDER_SIZE = 50, HISTORY = 10;
const now = () => new Date().toISOString();
const avatarKey = a => (a.avatar ? createHash('sha1').update(a.avatar).digest('hex').slice(0, 12) : null);
const nth = n => (n === 1 ? '1re' : `${n}e`);

export function createBoss(store, accounts) {
  const progress = accounts.progress;
  const put = a => store.put(a).catch(e => console.error('Compte non enregistré :', e));
  // Réglages : valeurs par défaut, puis celles de /admin (listes remplacées d'un bloc).
  function cfg() {
    const doc = store.doc('boss') || {};
    return { ...DEFAULT_BOSS, ...doc, shop: { ...(doc.shop || {}) } };
  }
  const weekBoss = (week = bossWeek()) => bossOfWeek(week, cfg().rotation);
  const finals = () => store.doc('boss-classement') || {};

  // ---- État du joueur ----
  // Une nouvelle semaine repart de zéro, après avoir figé le classement de celle que le joueur avait jouée.
  function state(a) {
    const week = bossWeek();
    if (a.boss?.week !== week) {
      if (a.boss?.week && a.boss.runs) closeWeek(a.boss.week);
      a.boss = { week, boss: weekBoss(week), total: 0, best: 0, runs: 0, day: null, used: 0, last: [] };
    }
    if (a.boss.day !== today()) { a.boss.day = today(); a.boss.used = 0; }
    return a.boss;
  }
  const left = a => Math.max(0, cfg().attempts - state(a).used);

  // Une tentative commence (index.js) : le boss de la semaine, si le mode est ouvert et qu'il reste des tentatives aujourd'hui.
  function start(a) {
    const c = cfg(), id = weekBoss();
    if (!c.on || !id) throw new HttpError(409, 'Le boss mondial est fermé pour le moment.');
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const B = state(a);
    if (B.used >= c.attempts) throw new HttpError(409, `Plus de tentative aujourd'hui (${c.attempts} par jour) : revenez demain !`);
    B.used++; B.boss = id;
    put(a);
    return id;
  }
  // Fin d'une tentative : score, paliers atteints et leurs récompenses, total de la semaine.
  function finish(a, st, { abandoned = false } = {}) {
    const c = cfg(), B = state(a), id = st.p[1].general;
    const score = bossScore(st, c), reached = tiersReached(score.total, c.tiers);
    const sum = reached.reduce((r, i) => { const t = c.tiers[i]; return { bossCoins: r.bossCoins + (t.coins || 0), shards: r.shards + (t.shards || 0), xp: r.xp + (t.xp || 0) }; }, { bossCoins: 0, shards: 0, xp: 0 });
    // Une tentative commencée la semaine d'avant compte pour celle-ci : le joueur l'a jouée maintenant.
    B.total += score.total; B.best = Math.max(B.best, score.total); B.runs++;
    B.last = [{ at: now(), score: score.total, boss: id }, ...(B.last || [])].slice(0, HISTORY);
    if (!a.level) progress.init(a);
    const s = a.stats;
    s.bossRuns = (s.bossRuns || 0) + 1; s.bossBest = Math.max(s.bossBest || 0, score.total);
    s.bossSeen = { ...(s.bossSeen || {}), [id]: 1 }; s.bossKinds = Object.keys(s.bossSeen).length;
    const before = a.level, gain = Object.fromEntries(Object.entries(sum).filter(([, n]) => n));
    if (Object.keys(gain).length) progress.grant(a, { kind: 'boss', label: `${GENERALS[id]?.name || 'Boss mondial'} : ${score.total} points`, ...gain }, { silent: true });
    progress.check(a);
    const pos = ladder().findIndex(x => x.login === a.login) + 1;
    return { boss: id, score: score.total, zones: score.zones, reached, tiers: c.tiers, gain, abandoned, total: B.total, best: B.best, pos: pos || null,
      left: left(a), levelUp: a.level > before, progress: { level: a.level, xp: a.xp, xpNext: progress.view(a).xpNext } };
  }

  // ---- Classement ----
  // Joueurs qui ont fait au moins une tentative cette semaine : total, puis meilleur score, puis moins de tentatives.
  function ladder(week = bossWeek()) {
    return store.all().filter(a => a.boss?.week === week && a.boss.runs > 0)
      .sort((x, y) => y.boss.total - x.boss.total || y.boss.best - x.boss.best || x.boss.runs - y.boss.runs || x.login.localeCompare(y.login))
      .map((a, i) => ({ pos: i + 1, login: a.login, name: a.name, total: a.boss.total, best: a.boss.best, runs: a.boss.runs }));
  }
  // Fin de semaine : classement figé, puis chaque joueur reçoit les récompenses de sa tranche (places, puis part du classement).
  // Appelé chaque minute pour la semaine d'avant (index.js), et avant qu'un joueur ne passe à la semaine suivante.
  function closeWeek(week = addWeeks(bossWeek(), -1)) {
    if (week >= bossWeek() || finals()[week]) return;
    const c = cfg(), L = ladder(week), boss = store.all().find(a => a.boss?.week === week)?.boss.boss || bossOfWeek(week, c.rotation);
    const name = GENERALS[boss]?.name || 'Boss mondial';
    store.putDoc('boss-classement', { ...finals(), [week]: { closed: now(), boss, n: L.length, top: L.slice(0, 10) } })
      .catch(e => console.error('Classement du boss non enregistré :', e));
    for (const x of L) {
      const a = store.get(x.login), r = rankBracket(x.pos, L.length, c.ranks); if (!a || !r) continue;
      if (!a.level) progress.init(a);
      if (x.pos <= 10) a.stats.bossTop10 = (a.stats.bossTop10 || 0) + 1;
      progress.grant(a, { kind: 'boss', label: `${name} : ${nth(x.pos)} place sur ${L.length} (${r.name})`, bossCoins: r.coins || 0, prisms: r.prisms || 0, shards: r.shards || 0,
        ...(r.title && TITLES[r.title] ? { title: r.title } : {}) });
      progress.check(a);
      put(a);
    }
    if (L.length) console.log(`Boss mondial de la semaine du ${week} figé : ${L.length} joueur${L.length > 1 ? 's' : ''}.`);
  }
  function lastWeek() {
    const all = finals(), week = Object.keys(all).sort().pop(); if (!week) return null;
    const x = all[week];
    return { week, boss: x.boss, name: GENERALS[x.boss]?.name || x.boss, n: x.n, top: x.top.slice(0, 3) };
  }

  // ---- Magasin ----
  const buys = a => { const week = bossWeek(); if (a.bossBuys?.week !== week) a.bossBuys = { week, n: {} }; return a.bossBuys.n; };
  function owns(a, x) {
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art') return !!a.arts?.[id];
    const cos = a.cosmetics || {};
    return x.kind === 'title' ? !!cos.titles?.includes(id) : x.kind === 'frame' ? !!cos.frames?.includes(id) : x.kind === 'back' ? !!cos.backs?.includes(id) : false;
  }
  const isCosmetic = x => ['art', 'title', 'frame', 'back'].includes(x.kind);
  function shopView(a) {
    const c = cfg(), n = buys(a);
    return BOSS_SHOP.filter(x => x.kind !== 'art' || artExists(x.id.slice(4))).map(x => ({ ...x, price: itemPrice(x, c), limit: isCosmetic(x) ? 0 : itemLimit(x, c),
      bought: n[x.id] || 0, owned: isCosmetic(x) && owns(a, x) }))
      .filter(x => isCosmetic(x) || x.limit > 0);
  }
  async function buy(a, { item }) {
    const c = cfg(), x = bossItem(String(item || ''));
    if (!x) throw new HttpError(400, 'Objet inconnu.');
    const price = itemPrice(x, c), n = buys(a);
    if (isCosmetic(x)) { if (owns(a, x)) throw new HttpError(409, 'Vous l\'avez déjà.'); }
    else if ((n[x.id] || 0) >= itemLimit(x, c)) throw new HttpError(409, itemLimit(x, c) ? `Déjà acheté ${itemLimit(x, c)} fois cette semaine : revenez lundi.` : 'Pas en vente pour le moment.');
    if ((a.bossCoins || 0) < price) throw new HttpError(409, `Il vous faut ${price} Insignes (vous en avez ${a.bossCoins || 0}).`);
    const id = x.id.slice(x.kind.length + 1);
    if (x.kind === 'art' && !artExists(id)) throw new HttpError(409, 'Cet art n\'est plus en vente.');
    if (!a.level) progress.init(a);
    a.bossCoins -= price; n[x.id] = (n[x.id] || 0) + 1;
    if (x.kind === 'art') a.arts = { ...(a.arts || {}), [id]: { at: now(), boss: true } };
    else if (isCosmetic(x)) progress.grant(a, { [x.kind]: id }, { silent: true });
    else if (x.kind === 'uniEssence') a.uniEssence = (a.uniEssence || 0) + x.n;
    else progress.grant(a, { [x.kind]: x.n }, { silent: true });
    progress.check(a);
    await store.put(a);
    return { ...view(a), account: accounts.me(a), msg: `${x.name} : à vous !`,
      got: x.kind === 'art' ? { art: id } : isCosmetic(x) ? { [x.kind]: id, label: { title: TITLES, frame: FRAMES, back: BACKS }[x.kind][id] } : null };
  }

  // Arrivée du boss de la semaine : une notification push (sorte « events » de push.js) dès 10 h (heure de Paris), une fois par semaine
  // (document « boss-annonce »). Appelé chaque minute (index.js).
  function announce(push, now = new Date()) {
    const week = bossWeek(now), id = weekBoss(week);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).find(p => p.type === 'hour').value);
    if (!cfg().on || !id || hour < 10 || store.doc('boss-annonce')?.week === week) return;
    store.putDoc('boss-annonce', { week }).catch(e => console.error('Annonce du boss non enregistrée :', e));
    Promise.resolve(push.broadcast('events', { title: `Boss mondial : ${GENERALS[id].name}`, tag: 'boss', open: 'boss',
      body: `Le boss de la semaine est arrivé : ${cfg().attempts} tentatives par jour pour grimper au classement, jusqu'à dimanche.` }))
      .catch(e => console.error('Annonce du boss non envoyée :', e));
  }

  // ---- Decks contre les boss ----
  // Un deck par boss, préparé dans l'onglet Boss mondial des decks ; complet, il est joué à la place du deck joué contre ce boss.
  const cleanDeck = (id, d) => ({ id, name: String(d.name ?? '').trim().slice(0, 30) || `Contre ${GENERALS[id].name.split(/,\s*/)[0]}`,
    general: d.general || null, terrains: (d.terrains || []).slice(), cards: (d.cards || []).slice() });
  function deckFor(a, id) { const d = a.bossDecks?.[id]; return d && !deckError(d, a) ? d : null; }
  async function saveDeck(a, body) {
    if (!a.starter) throw new HttpError(409, 'Choisissez d\'abord votre deck de départ.');
    const id = String(body.boss || ''); if (!isBoss(id)) throw new HttpError(400, 'Boss inconnu.');
    const d = cleanDeck(id, body), err = draftError(d, a); if (err) throw new HttpError(400, err);
    a.bossDecks = { ...(a.bossDecks || {}), [id]: d };
    await store.put(a);
    return { account: accounts.me(a) };
  }
  async function resetDeck(a, body) {
    const id = String(body.boss || ''); if (!isBoss(id)) throw new HttpError(400, 'Boss inconnu.');
    if (a.bossDecks) delete a.bossDecks[id];
    await store.put(a);
    return { account: accounts.me(a) };
  }

  // ---- Vues ----
  function view(a) {
    const c = cfg(), week = bossWeek(), id = weekBoss(week), B = state(a), L = ladder(week), mine = L.find(x => x.login === a.login);
    return { on: !!c.on && !!id, week, ends: weekLast(week), daysLeft: weekDaysLeft(week), boss: id ? bossInfo(id) : null, next: bossInfo(weekBoss(addWeeks(week, 1))),
      attempts: c.attempts, left: left(a), total: B.total, best: B.best, runs: B.runs, last: B.last || [], pos: mine?.pos || null, n: L.length,
      scoring: { perPower: c.perPower, fullZone: c.fullZone, beatZone: c.beatZone }, tiers: c.tiers, ranks: c.ranks,
      coins: a.bossCoins || 0, shop: shopView(a), lastWeek: lastWeek() };
  }
  function ladderView(a) {
    const L = ladder();
    const row = x => { const b = store.get(x.login), badge = b && progress.badge(b);
      return { ...x, title: badge?.title || null, frame: badge?.frame || null, ...(x.pos <= 10 ? { avatar: b ? avatarKey(b) : null } : {}) }; };
    return { ladder: L.slice(0, LADDER_SIZE).map(row), mine: L.find(x => x.login === a.login) || null, n: L.length, ranks: cfg().ranks };
  }
  // Images de profil du top 10 du classement.
  function avatars() {
    const out = {};
    for (const x of ladder().slice(0, 10)) { const b = store.get(x.login); if (b?.avatar) out[x.login] = b.avatar; }
    return { avatars: out };
  }
  // Résumé pour la tuile de l'accueil (accounts.me).
  function tile(a) {
    const c = cfg(), id = weekBoss(); if (!c.on || !id || !a.starter) return null;
    const B = a.boss?.week === bossWeek() ? a.boss : null, used = B && B.day === today() ? B.used : 0;
    return { id, name: GENERALS[id].name, art: GENERALS[id].art, left: Math.max(0, c.attempts - used), attempts: c.attempts, total: B?.total || 0, daysLeft: weekDaysLeft(bossWeek()) };
  }

  // ---- /admin ----
  const int = (v, [lo, hi], where) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${where} : un nombre entier de ${lo} à ${hi}.`); return n; };
  function adminView() {
    const week = bossWeek(), L = ladder(week);
    return { settings: cfg(), defaults: DEFAULT_BOSS, bosses: BOSS_IDS.map(bossInfo), shopItems: BOSS_SHOP, week, ends: weekLast(week), boss: weekBoss(week),
      upcoming: [1, 2, 3].map(n => ({ week: addWeeks(week, n), boss: weekBoss(addWeeks(week, n)) })), titles: Object.fromEntries(Object.entries(TITLES).filter(([k]) => k.startsWith('boss:'))),
      ladder: L.slice(0, 20), n: L.length, closed: Object.entries(finals()).sort(([x], [y]) => y.localeCompare(x)).slice(0, 8).map(([w, x]) => ({ week: w, boss: x.boss, n: x.n, closed: x.closed })),
      custom: !!Object.keys(store.doc('boss') || {}).length };
  }
  async function save(body) {
    if (body.reset) { await store.putDoc('boss', {}); return adminView(); }
    const s = body.settings || {}, L = BOSS_LIMITS, out = {};
    out.on = !!s.on;
    for (const k of ['attempts', 'perPower', 'fullZone', 'beatZone']) out[k] = int(s[k], L[k], { attempts: 'Tentatives par jour', perPower: 'Points par puissance', fullZone: 'Bonus de zone pleine', beatZone: 'Bonus de zone gagnée' }[k]);
    if (!Array.isArray(s.rotation) || !s.rotation.length || s.rotation.some(id => !isBoss(id))) throw new HttpError(400, 'Rotation : au moins un boss, parmi les boss connus.');
    out.rotation = s.rotation.slice(0, 12);
    if (!Array.isArray(s.tiers) || !s.tiers.length || s.tiers.length > 10) throw new HttpError(400, 'Paliers : de 1 à 10.');
    out.tiers = s.tiers.map((t, i) => ({ points: int(t.points, L.points, `Palier ${i + 1}, points`), coins: int(t.coins || 0, L.coins, `Palier ${i + 1}, Insignes`),
      shards: int(t.shards || 0, L.shards, `Palier ${i + 1}, Éclats`), xp: int(t.xp || 0, L.xp, `Palier ${i + 1}, XP`) })).sort((x, y) => x.points - y.points);
    if (!Array.isArray(s.ranks) || !s.ranks.length || s.ranks.length > 12) throw new HttpError(400, 'Tranches du classement : de 1 à 12.');
    out.ranks = s.ranks.map((r, i) => {
      const where = `Tranche ${i + 1}`, x = { id: String(r.id || `r${i}`).replace(/[^a-z0-9]/gi, '').slice(0, 20) || `r${i}`, name: String(r.name || '').trim().slice(0, 40) || where };
      if (r.top) x.top = int(r.top, L.top, `${where}, place`); else x.pct = int(r.pct, L.pct, `${where}, pourcentage`);
      x.coins = int(r.coins || 0, L.coins, `${where}, Insignes`); x.prisms = int(r.prisms || 0, L.prisms, `${where}, Prismes`);
      if (r.shards) x.shards = int(r.shards, L.shards, `${where}, Éclats`);
      if (r.title) { if (!TITLES[r.title]) throw new HttpError(400, `${where} : titre inconnu.`); x.title = r.title; }
      return x;
    });
    // Les places d'abord (dans l'ordre), puis les parts du classement ; la dernière tranche couvre tout le monde.
    out.ranks.sort((x, y) => (x.top ? 0 : 1) - (y.top ? 0 : 1) || (x.top || 0) - (y.top || 0) || (x.pct || 0) - (y.pct || 0));
    if (!out.ranks.some(r => r.pct === 100)) throw new HttpError(400, 'Il faut une tranche à 100 % : chaque joueur reçoit au moins sa récompense de participation.');
    out.shop = {};
    for (const x of BOSS_SHOP) { const v = s.shop?.[x.id]; if (!v) continue;
      out.shop[x.id] = { price: int(v.price ?? x.price, L.price, `${x.name}, prix`), ...(isCosmetic(x) ? {} : { limit: int(v.limit ?? x.limit, L.limit, `${x.name}, limite`) }) }; }
    await store.putDoc('boss', out);
    return adminView();
  }

  return {
    start, finish, closeWeek, announce, tile, cfg, weekBoss, deckFor,
    routes: {
      'GET /api/boss': a => view(a),
      'GET /api/boss/ladder': a => ladderView(a),
      'GET /api/boss/avatars': () => avatars(),
      'POST /api/boss/buy': (a, body) => buy(a, body || {}),
      'PUT /api/boss/deck': (a, body) => saveDeck(a, body || {}),
      'POST /api/boss/deck/reset': (a, body) => resetDeck(a, body || {}),
      'GET /api/admin/boss': () => adminView(),
      'POST /api/admin/boss': (_, body) => save(body || {}),
    },
  };
}
