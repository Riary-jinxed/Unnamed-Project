// Boss de clan (packages/engine/src/clan-boss.js) : ouverture par le Maître ou un adjoint, tentatives des membres, barre de PV
// commune, fermeture (boss vaincu ou fin du temps) et récompenses de chaque membre selon la part des PV retirés.
// Les parties se jouent dans un salon du serveur (index.js, message « clanboss ») : la tentative est comptée dès que la partie
// commence, et ses dégâts sont retirés à la fin (ou à l'abandon, avec le plateau du moment).
// Clan : raid ({ id, boss, level, max, hp, opened, ends, by, tries: { login: n }, dmg: { login: PV }, live: { login: date } }),
// raidLast (le dernier boss fermé : { boss, level, max, hp, pct, closed, defeated, top }), raidWeek (semaine de la dernière ouverture).
import { randomBytes } from 'node:crypto';
import { GENERALS } from '@jeu/engine';
import { CLAN_BOSS_IDS, CLAN_BOSS_DAYS, CLAN_BOSS_TRIES, CLAN_BOSS_LEVELS, clanBossRewards, CLAN_BOSS_SCORING, isClanBoss, clanBossLevel, clanBossDamage,
  clanBossPct, clanBossTier, clanBossReward, clanBossWeek } from '@jeu/engine/clan-boss';
import { bossInfo } from '@jeu/engine/boss';
import { canDo } from '@jeu/engine/clans';
import { HttpError } from './accounts.js';
import { msg, trMsg } from '@jeu/engine/i18n';
import { langOf } from './i18n.js';

const now = () => new Date().toISOString();
// Une tentative commencée juste avant la fin du temps compte encore : la fermeture l'attend jusqu'à LIVE_GRACE_MS.
const LIVE_GRACE_MS = 20 * 60_000;
const bossName = id => GENERALS[id]?.name || 'Boss de clan';
// Ce que l'appli montre d'un boss de clan : comme un boss mondial (script, cartes renforcées), et ses récompenses.
const info = id => ({ ...bossInfo(id), rewards: clanBossRewards(id) });

export function createClanBoss(store, accounts, clans) {
  const progress = accounts.progress, C = clans.internals;
  const put = a => store.put(a).catch(e => console.error('Compte non enregistré :', e));
  const canOpen = (c, login) => canDo(C.roleOf(c, login), 'edit');
  const live = r => r && !r.closed;

  // ---- Ouverture ----
  async function open(a, { boss, level }) {
    const c = clans.clanOf(a); if (!c) throw new HttpError(409, msg('Vous n\'êtes dans aucun clan.'));
    if (!canOpen(c, a.login)) throw new HttpError(403, msg('Seuls le Maître et les adjoints peuvent ouvrir un boss de clan.'));
    if (live(c.raid)) throw new HttpError(409, msg('Un boss de clan est déjà ouvert.'));
    if (c.raidWeek === clanBossWeek()) throw new HttpError(409, msg('Un seul boss de clan par semaine : revenez lundi.'));
    const id = String(boss || ''); if (!isClanBoss(id)) throw new HttpError(400, msg('Boss inconnu.'));
    const n = Number(level);
    if (!Number.isInteger(n) || n < 1 || n > CLAN_BOSS_LEVELS.length) throw new HttpError(400, msg('Niveau inconnu.'));
    if (n > C.level(c)) throw new HttpError(409, msg('Il faut un clan de niveau {n}.', { n }));
    const L = clanBossLevel(n), opened = now();
    c.raid = { id: randomBytes(4).toString('hex'), boss: id, level: n, max: L.hp, hp: L.hp, opened, ends: new Date(Date.now() + CLAN_BOSS_DAYS * 86_400_000).toISOString(),
      by: a.login, tries: {}, dmg: {}, live: {} };
    c.raidWeek = clanBossWeek();
    C.log(c, msg('{name} ouvre le boss de clan {boss} (niveau {n}).', { name: a.name, boss: [bossName(id)], n }));
    await C.save();
    C.pushTo(c.members.filter(l => l !== a.login), { title: msg('Boss de clan : {name}', { name: [bossName(id)] }),
      body: msg('{name} a ouvert un boss de clan : {n} tentatives chacun pendant {days} jours pour faire tomber sa barre de PV.', { name: a.name, n: CLAN_BOSS_TRIES, days: CLAN_BOSS_DAYS }) });
    accounts.activity.count('clanBossOpened');
    return done(a, msg('{name} est ouvert pour tout le clan !', { name: [bossName(id)] }));
  }

  // ---- Tentatives ----
  // Une tentative commence (index.js) : le boss ouvert du clan du joueur, s'il lui reste des tentatives.
  function start(a) {
    if (!a.starter) throw new HttpError(409, msg('Choisissez d\'abord votre deck de départ.'));
    const c = clans.clanOf(a); if (!c) throw new HttpError(409, msg('Vous n\'êtes dans aucun clan.'));
    const r = c.raid;
    if (!live(r) || r.ends <= now()) throw new HttpError(409, msg('Aucun boss de clan ouvert pour le moment.'));
    if (r.hp <= 0) throw new HttpError(409, msg('Le boss de clan est déjà vaincu.'));
    if ((r.tries[a.login] || 0) >= CLAN_BOSS_TRIES) throw new HttpError(409, msg('Vous avez fait vos {n} tentatives contre ce boss.', { n: CLAN_BOSS_TRIES }));
    r.tries[a.login] = (r.tries[a.login] || 0) + 1; (r.live ||= {})[a.login] = now();
    C.save();
    accounts.activity.count('clanBossRuns');
    return { boss: r.boss, clan: c.id, raid: r.id };
  }
  // Fin d'une tentative : ses dégâts sont retirés aux PV du boss ; à zéro, il est vaincu et le clan reçoit ses récompenses.
  // Si le boss a fermé entre-temps (ou si le joueur a changé de clan), les dégâts ne comptent plus.
  function finish(a, st, run, { abandoned = false } = {}) {
    const c = C.byId(run.clan), r = c?.raid, dmg = clanBossDamage(st, CLAN_BOSS_SCORING);
    let dealt = 0, counted = false;
    if (r && r.id === run.raid && !r.closed) {
      counted = true;
      delete r.live?.[a.login];
      dealt = Math.min(r.hp, dmg.total); r.hp -= dealt;
      r.dmg[a.login] = (r.dmg[a.login] || 0) + dmg.total;
      if (dealt && r.hp <= 0) close(c, a);
      C.save();
    }
    if (!a.level) progress.init(a);
    a.stats.clanBossRuns = (a.stats.clanBossRuns || 0) + 1;
    a.stats.clanBossBest = Math.max(a.stats.clanBossBest || 0, dmg.total);
    progress.check(a);
    const R = r && r.id === run.raid ? r : null;
    return { clan: true, boss: run.boss, damage: dmg.total, dealt, counted, zones: dmg.zones, abandoned, hp: R ? R.hp : 0, max: R ? R.max : 0, defeated: !!R && R.hp <= 0,
      left: R && !R.closed ? Math.max(0, CLAN_BOSS_TRIES - (R.tries[a.login] || 0)) : 0, total: R ? R.dmg[a.login] || 0 : dmg.total,
      pct: R ? clanBossPct(R.hp, R.max) : 0 };
  }

  // ---- Fermeture ----
  // Boss vaincu, ou temps écoulé : chaque membre reçoit la récompense du pourcentage atteint (au moins celle de 0 %).
  // Ont droit à la récompense : les membres déjà là à l'ouverture, et ceux qui ont fait au moins une tentative.
  // current : le compte qui a porté le dernier coup (enregistré par l'appelant).
  function close(c, current = null) {
    const r = c.raid; if (!live(r)) return;
    r.closed = now();
    const pct = clanBossPct(r.hp, r.max), tier = clanBossTier(pct, r.boss), { reward, clanXp } = clanBossReward(r.boss, tier, r.level), defeated = r.hp <= 0, name = bossName(r.boss);
    const top = Object.entries(r.dmg).sort(([, x], [, y]) => y - x).slice(0, 5).map(([login, n]) => ({ login, name: store.get(login)?.name || login, dmg: n }));
    c.raidLast = { boss: r.boss, level: r.level, max: r.max, hp: Math.max(0, r.hp), pct, tier, defeated, closed: r.closed, top, players: Object.keys(r.tries).length, reward, clanXp };
    C.log(c, defeated ? msg('Boss de clan {boss} vaincu (niveau {n}) !', { boss: [name], n: r.level })
      : msg('Boss de clan {boss} reparti : {pct} % de ses PV retirés.', { boss: [name], pct }));
    for (const login of c.members) {
      if (!r.tries[login] && (c.joined?.[login] || c.created) > r.opened) continue;
      const b = login === current?.login ? current : store.get(login); if (!b) continue;
      if (!b.level) progress.init(b);
      // L'essence universelle n'est pas comptée par grant : ajoutée ici, et montrée avec le reste.
      if (reward.uniEssence) b.uniEssence = (b.uniEssence || 0) + reward.uniEssence;
      progress.grant(b, { kind: 'clan', label: `Boss de clan ${name} : ${pct} %`, labelMsg: msg('Boss de clan {boss} : {pct} %', { boss: [name], pct }), ...reward });
      if (defeated) b.stats.clanBossWins = (b.stats.clanBossWins || 0) + 1;
      progress.check(b);
      if (b !== current) put(b);
    }
    if (clanXp) C.addXp(c, clanXp, current);
    C.pushTo(c.members.filter(l => l !== current?.login), { title: defeated ? msg('Boss de clan vaincu !') : msg('Boss de clan terminé'),
      body: msg('{boss} : {pct} % de ses PV retirés. Vos récompenses vous attendent.', { boss: [name], pct }) });
    delete c.raid;
    console.log(`Boss de clan ${name} du clan ${c.tag} fermé : ${pct} %.`);
  }
  // Appelé chaque minute (index.js) : les boss dont le temps est écoulé ferment, une fois leurs dernières tentatives finies.
  function tick() {
    const t = now(), stale = new Date(Date.now() - LIVE_GRACE_MS).toISOString();
    let changed = false;
    for (const c of C.all()) {
      const r = c.raid; if (!live(r) || r.ends > t) continue;
      if (Object.values(r.live || {}).some(at => at > stale)) continue;
      close(c); changed = true;
    }
    if (changed) C.save();
  }

  // ---- Vues ----
  // Résumé dans la vue du clan (clans.js) : la tuile de l'accueil et l'onglet Boss.
  function summary(a, c) {
    const r = live(c.raid) ? c.raid : null;
    return { open: !!r, boss: r?.boss || null, hp: r?.hp ?? 0, max: r?.max ?? 0, ends: r?.ends || null, left: r ? Math.max(0, CLAN_BOSS_TRIES - (r.tries[a.login] || 0)) : 0,
      canOpen: !r && canOpen(c, a.login) && c.raidWeek !== clanBossWeek() };
  }
  function view(a) {
    const c = clans.clanOf(a); if (!c) throw new HttpError(409, msg('Vous n\'êtes dans aucun clan.'));
    const r = live(c.raid) ? c.raid : null, lv = C.level(c);
    const row = ([login, n]) => ({ login, name: store.get(login)?.name || login, dmg: n, tries: r.tries[login] || 0 });
    return {
      clan: { id: c.id, name: c.name, level: lv }, role: C.roleOf(c, a.login), canOpen: !r && canOpen(c, a.login), thisWeek: c.raidWeek === clanBossWeek(),
      tries: CLAN_BOSS_TRIES, days: CLAN_BOSS_DAYS, levels: CLAN_BOSS_LEVELS, scoring: CLAN_BOSS_SCORING, bosses: CLAN_BOSS_IDS.map(info),
      raid: r ? { boss: info(r.boss), level: r.level, max: r.max, hp: r.hp, pct: clanBossPct(r.hp, r.max), opened: r.opened, ends: r.ends, by: store.get(r.by)?.name || r.by,
        left: Math.max(0, CLAN_BOSS_TRIES - (r.tries[a.login] || 0)), mine: r.dmg[a.login] || 0,
        ladder: Object.entries(r.dmg).sort(([, x], [, y]) => y - x).map(row), players: Object.keys(r.tries).length } : null,
      last: c.raidLast ? { ...c.raidLast, name: bossName(c.raidLast.boss) } : null,
    };
  }
  const done = (a, m) => ({ ...view(a), account: accounts.me(a), ...(m ? { msg: trMsg(langOf(a), m) } : {}) });

  clans.setRaidView(summary);
  return {
    start, finish, tick,
    routes: {
      'GET /api/clan/boss': a => view(a),
      'POST /api/clan/boss/open': (a, body) => open(a, body || {}),
    },
  };
}
