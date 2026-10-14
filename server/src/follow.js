// Onglet Suivi de /admin : rétention (cohortes, retours après 1, 7 et 30 jours, joueurs à relancer, parcours des nouveaux comptes)
// et suivi du contenu ajouté (bienvenue des 7 jours, clans, Boss mondial, quêtes d'histoire, événements, émotes, decks partagés,
// notifications, passe de saison et classé). Tout est calculé à la demande à partir des comptes, des documents de réglages et des
// compteurs du jour (activity.js, document « compteurs ») ; rien n'est enregistré ici, sauf par la route de suivi de l'appli (track).
import { GENERALS } from '@jeu/engine';
import { today } from '@jeu/engine/collection';
import { TUTO_LESSONS, WELCOME_STEPS } from '@jeu/engine/rewards';
import { seasonId } from '@jeu/engine/ranked';
import { EMOTES } from '@jeu/engine/emotes';
import { clanLevelOf } from '@jeu/engine/clans';
import { bossWeek, addWeeks } from '@jeu/engine/boss';
import { QUESTS, questCfg, questState, isLimited } from '@jeu/engine/story';
import { isLive, EVENT_EFFECTS } from '@jeu/engine/events';
import { HttpError } from './accounts.js';
import { PUSH_KINDS } from './push.js';

const DAY_MS = 86_400_000, COHORT_WEEKS = 8, BOSS_WEEKS = 8, CHURN_LIST = 15, SPAN = 90;
// Ce que l'appli peut signaler (POST /api/track) : partage d'un code de deck, émote en partie contre l'IA, notification touchée.
// Une limite par joueur et par minute évite qu'un appareil ne gonfle les compteurs.
const TRACK_PER_MIN = 40;
const dayOf = ms => today(new Date(ms));
const addDays = (d, n) => dayOf(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS);
const diffDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
const monday = d => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const pct = (n, d) => (d ? Math.round(100 * n / d) : null);
const avg = (xs) => (xs.length ? Math.round(10 * xs.reduce((s, x) => s + x, 0) / xs.length) / 10 : null);

export function createFollow(store, accounts, { boss, events }) {
  // Jours actifs de chaque joueur : jours d'ouverture de l'appli (activeDays) et jours de partie enregistrés (comme activity.js).
  function activeSets() {
    const by = new Map(store.all().map(a => [a.login, new Set(a.activeDays || [])]));
    for (const g of store.games()) for (const P of g.players) if (P.login && by.has(P.login)) by.get(P.login).add(dayOf(Date.parse(g.at)));
    return by;
  }
  // Compteurs du jour (activity.js) sur la période : totaux, et valeur d'une clé jour par jour.
  const counters = () => store.doc('compteurs') || {};
  const sumSince = (since, test) => {
    const out = {};
    for (const [d, c] of Object.entries(counters())) if (d >= since) for (const [k, n] of Object.entries(c)) if (test(k)) out[k] = (out[k] || 0) + n;
    return out;
  };

  // ---- Rétention ----
  function retention(accs, sets, day) {
    // Retour « après N jours » : le joueur est revenu au moins une fois N jours ou plus après le jour de sa création.
    // Seuls comptent les comptes assez anciens pour que ce délai soit passé.
    const back = n => {
      const pool = accs.filter(a => a.created && diffDays(dayOf(Date.parse(a.created)), day) >= n);
      const ok = pool.filter(a => { const c = dayOf(Date.parse(a.created)); return [...sets.get(a.login)].some(d => diffDays(c, d) >= n); });
      return { n: pool.length, back: ok.length, rate: pct(ok.length, pool.length) };
    };
    // Cohortes : comptes créés chaque semaine (lundi), part de la cohorte venue chaque semaine suivante.
    const thisWeek = monday(day);
    const cohorts = Array.from({ length: COHORT_WEEKS }, (_, i) => addDays(thisWeek, -7 * (COHORT_WEEKS - 1 - i))).map(week => {
      const members = accs.filter(a => a.created && monday(dayOf(Date.parse(a.created))) === week);
      const weeks = Array.from({ length: COHORT_WEEKS }, (_, k) => {
        const from = addDays(week, 7 * k), to = addDays(from, 6);
        if (from > day) return null;
        return pct(members.filter(a => [...sets.get(a.login)].some(d => d >= from && d <= to)).length, members.length);
      });
      return { week, n: members.length, weeks };
    });
    // Joueurs à relancer : venus ces 30 derniers jours, mais pas ces 7 derniers.
    const lastOf = a => [...sets.get(a.login)].sort().at(-1) || null;
    const churn = accs.map(a => ({ login: a.login, name: a.name, last: lastOf(a) }))
      .filter(x => x.last && diffDays(x.last, day) >= 7 && diffDays(x.last, day) < 30).sort((x, y) => y.last.localeCompare(x.last));
    // Collant : joueurs actifs par jour en moyenne sur 7 jours, rapportés aux actifs du mois.
    const activeOn = d => [...sets.values()].filter(s => s.has(d)).length;
    const week7 = Array.from({ length: 7 }, (_, i) => activeOn(addDays(day, -i)));
    const month = [...sets.values()].filter(s => [...s].some(d => diffDays(d, day) < 30)).length;
    return { d1: back(1), d7: back(7), d30: back(30), cohorts, churn: { n: churn.length, list: churn.slice(0, CHURN_LIST) },
      sticky: { dau: avg(week7), mau: month, rate: pct(week7.reduce((s, x) => s + x, 0) / 7, month) } };
  }
  // Parcours des comptes créés sur la période : deck de départ, première partie, tutoriel, retour un autre jour, bienvenue finie.
  // Le tutoriel peut se faire à tout moment : chaque étape est rapportée aux comptes créés, pas à l'étape d'avant.
  function funnel(accs, sets, since) {
    const fresh = accs.filter(a => a.created && dayOf(Date.parse(a.created)) >= since);
    const steps = [
      ['Compte créé', () => true],
      ['Deck de départ choisi', a => !!a.starter],
      ['Première partie', a => (a.stats?.games || 0) > 0],
      ['Une leçon du tutoriel', a => (a.tuto || []).length > 0],
      ['Tutoriel fini', a => TUTO_LESSONS.every(l => (a.tuto || []).includes(l.id))],
      ['Revenu un autre jour', a => sets.get(a.login).size >= 2],
      ['Revenu 3 jours ou plus', a => sets.get(a.login).size >= 3],
      [`Bienvenue finie (${WELCOME_STEPS} jours)`, a => (a.welcome?.days?.length || 0) >= WELCOME_STEPS],
    ];
    return steps.map(([label, test]) => { const n = fresh.filter(test).length; return { label, n, rate: pct(n, fresh.length) }; });
  }

  // ---- Contenu ----
  function welcome(accs, day) {
    const W = accs.filter(a => a.welcome), win = accounts.progress.cfg().welcomeWindow;
    const dist = Array.from({ length: WELCOME_STEPS + 1 }, (_, n) => W.filter(a => Math.min(WELCOME_STEPS, a.welcome.days?.length || 0) === n).length);
    const done = W.filter(a => (a.welcome.days?.length || 0) >= WELCOME_STEPS).length;
    const running = W.filter(a => (a.welcome.days?.length || 0) < WELCOME_STEPS && diffDays(dayOf(Date.parse(a.welcome.start)), day) < win).length;
    return { n: W.length, done, running, lapsed: W.length - done - running, rate: pct(done, W.length), dist, window: win };
  }
  function clans(accs, sets, day) {
    const all = Object.values(store.doc('clans') || {}).filter(c => c.members?.length);
    const recent = login => [...(sets.get(login) || [])].some(d => diffDays(d, day) < 7);
    const active = accs.filter(a => recent(a.login)), inClan = new Set(all.flatMap(c => c.members));
    const list = all.map(c => ({ name: c.name, tag: c.tag, level: clanLevelOf(c.xp || 0), members: c.members.length, active: c.members.filter(recent).length,
      done: [...(c.day?.list || []), ...(c.week?.list || [])].filter(m => m.done).length, missions: (c.day?.list?.length || 0) + (c.week?.list?.length || 0) }))
      .sort((x, y) => y.active - x.active || y.members - x.members);
    return { n: all.length, members: inClan.size, avgSize: avg(all.map(c => c.members.length)), activeIn: active.filter(a => inClan.has(a.login)).length,
      active: active.length, rate: pct(active.filter(a => inClan.has(a.login)).length, active.length), list: list.slice(0, 15) };
  }
  function bossStats(accs, since) {
    const week = bossWeek(), cfg = boss.cfg(), cur = accs.filter(a => a.boss?.week === week && a.boss.runs > 0);
    const finals = store.doc('boss-classement') || {};
    const weeks = Array.from({ length: BOSS_WEEKS }, (_, i) => addWeeks(week, -(BOSS_WEEKS - 1 - i))).map(w => {
      if (w === week) return { week: w, boss: GENERALS[boss.weekBoss(w)]?.name || null, players: cur.length, current: true };
      const f = finals[w]; return { week: w, boss: f ? GENERALS[f.boss]?.name || f.boss : null, players: f ? f.n : null };
    });
    const c = sumSince(since, k => k === 'bossRuns' || k === 'bossBuys');
    return { on: !!cfg.on, attempts: cfg.attempts, week, boss: GENERALS[boss.weekBoss()]?.name || null, players: cur.length,
      runs: cur.reduce((s, a) => s + a.boss.runs, 0), avgRuns: avg(cur.map(a => a.boss.runs)), best: Math.max(0, ...cur.map(a => a.boss.best)),
      avgBest: avg(cur.map(a => a.boss.best)), ever: accs.filter(a => a.stats?.bossRuns).length, weeks, periodRuns: c.bossRuns || 0, periodBuys: c.bossBuys || 0 };
  }
  function story(accs, since, day) {
    const doc = store.doc('quetes') || {};
    const quests = QUESTS.map(q => {
      const n = q.chapters.length, won = accs.map(a => a.story?.[q.id] || 0);
      return { id: q.id, name: q.name, limited: isLimited(q), state: questState(q, questCfg(q.id, doc), day), chapters: n,
        started: won.filter(w => w > 0).length, finished: won.filter(w => w >= n).length,
        // Joueurs arrivés au moins jusqu'à chaque chapitre (chapitre gagné).
        reach: q.chapters.map((ch, i) => ({ name: ch.name, n: won.filter(w => w > i).length })) };
    });
    return { quests, players: accs.filter(a => Object.values(a.story || {}).some(Boolean)).length, period: sumSince(since, k => k === 'storyChapters').storyChapters || 0 };
  }
  // Effet des événements : joueurs actifs et parties par jour pendant l'événement, contre les autres jours (90 derniers jours).
  function eventsImpact(sets, day) {
    const days = Array.from({ length: SPAN }, (_, i) => addDays(day, -(SPAN - 1 - i)));
    const first = days.find(d => [...sets.values()].some(s => s.has(d)));
    const span = first ? days.filter(d => d >= first && d < day) : [];
    const games = {}; for (const g of store.games()) { const d = dayOf(Date.parse(g.at)); games[d] = (games[d] || 0) + 1; }
    const active = d => [...sets.values()].filter(s => s.has(d)).length;
    return events.list().map(ev => {
      const on = span.filter(d => isLive(ev, d)), off = span.filter(d => !isLive(ev, d));
      return { id: ev.id, name: ev.name, effect: EVENT_EFFECTS[ev.effect]?.name || ev.effect, mult: ev.mult, enabled: !!ev.on, live: isLive(ev, day), days: on.length,
        activeOn: avg(on.map(active)), activeOff: avg(off.map(active)), gamesOn: avg(on.map(d => games[d] || 0)), gamesOff: avg(off.map(d => games[d] || 0)) };
    });
  }
  function emotes(accs, since) {
    const c = sumSince(since, k => k.startsWith('emote'));
    const top = Object.entries(c).filter(([k]) => k.startsWith('emote:')).map(([k, n]) => ({ id: k.slice(6), n }))
      .filter(x => EMOTES[x.id]).sort((x, y) => y.n - x.n).map(x => ({ ...x, icon: EMOTES[x.id].icon, text: EMOTES[x.id].text }));
    return { sent: (c.emotesOnline || 0) + (c.emotesSolo || 0), online: c.emotesOnline || 0, solo: c.emotesSolo || 0, bought: c.emotesBought || 0,
      owners: accs.filter(a => a.cosmetics?.emotes?.length).length, custom: accs.filter(a => a.emoteSet).length, top: top.slice(0, 10) };
  }
  function decks(accs, since) {
    const c = sumSince(since, k => k.startsWith('deck'));
    const started = accs.filter(a => a.starter);
    return { shared: c.deckShared || 0, imported: c.deckImported || 0, recipes: c.deckRecipe || 0, avg: avg(started.map(a => a.decks?.length || 0)),
      multi: started.filter(a => (a.decks?.length || 0) >= 2).length, players: started.length, bossDecks: accs.filter(a => Object.keys(a.bossDecks || {}).length).length };
  }
  function notifications(accs, sets, since, day) {
    const subs = accs.filter(a => a.push?.subs?.length), recent = a => [...(sets.get(a.login) || [])].some(d => diffDays(d, day) < 30);
    const c = sumSince(since, k => k.startsWith('push'));
    return { players: subs.length, devices: subs.reduce((s, a) => s + a.push.subs.length, 0), rate: pct(subs.filter(recent).length, accs.filter(recent).length),
      kinds: Object.entries(PUSH_KINDS).map(([id, k]) => ({ id, label: k.label, on: subs.filter(a => !a.push.off?.includes(id)).length,
        sent: c[`pushSent:${id}`] || 0, opened: c[`pushOpened:${id}`] || 0 })) };
  }
  function seasons(accs) {
    const season = seasonId();
    const pass = accs.filter(a => a.seasonPass?.season === season), ranked = accs.filter(a => a.ranked?.season === season && a.ranked.games);
    return { season, pass: pass.filter(a => a.seasonPass.xp > 0).length, premium: pass.filter(a => a.seasonPass.premium).length,
      ranked: ranked.length, rankedGames: ranked.reduce((s, a) => s + a.ranked.games, 0),
      calendar: accs.filter(a => a.calendar?.month === season && a.calendar.days?.length).length };
  }
  // Courbe par jour des compteurs du contenu (depuis le premier jour où l'un d'eux a bougé).
  function series(day, span) {
    const doc = counters(), keys = { bossRuns: 'bossRuns', storyChapters: 'storyChapters', emotes: ['emotesOnline', 'emotesSolo'], push: k => k.startsWith('pushSent:') };
    const val = (c, k) => (typeof k === 'function' ? Object.entries(c || {}).filter(([x]) => k(x)).reduce((s, [, n]) => s + n, 0)
      : [].concat(k).reduce((s, x) => s + (c?.[x] || 0), 0));
    return Array.from({ length: span }, (_, i) => addDays(day, -(span - 1 - i))).map(d => ({ day: d, ...Object.fromEntries(Object.entries(keys).map(([n, k]) => [n, val(doc[d], k)])) }));
  }

  function stats(days = 0) {
    const day = today(), accs = store.all(), sets = activeSets();
    const span = days > 0 ? days : SPAN, since = days > 0 ? addDays(day, -(days - 1)) : '';
    return { day, since: Object.keys(counters()).sort()[0] || null,
      retention: retention(accs, sets, day), funnel: funnel(accs, sets, since || addDays(day, -(SPAN - 1))),
      welcome: welcome(accs, day), clans: clans(accs, sets, day), boss: bossStats(accs, since), story: story(accs, since, day),
      events: eventsImpact(sets, day), emotes: emotes(accs, since), decks: decks(accs, since), push: notifications(accs, sets, since, day),
      seasons: seasons(accs), series: series(day, span) };
  }

  // ---- Signalements de l'appli ----
  const recent = new Map();
  async function track(a, body) {
    const what = String(body?.what || ''), id = String(body?.id || '');
    const key = { deckShare: 'deckShared', emote: EMOTES[id] ? 'emotesSolo' : null, pushOpen: PUSH_KINDS[id] ? `pushOpened:${id}` : null }[what];
    if (!key) throw new HttpError(400, 'Signalement inconnu.');
    const now = Date.now(), r = recent.get(a.login);
    if (r && now - r.at < 60_000) { if (r.n >= TRACK_PER_MIN) return { ok: true }; r.n++; } else recent.set(a.login, { at: now, n: 1 });
    accounts.activity.count(what === 'emote' ? [key, `emote:${id}`] : key);
    // Missions « partager un deck » et « envoyer des émotes » (une émote possédée, contre l'IA).
    const mission = what === 'deckShare' ? 'deckShare' : what === 'emote' && accounts.progress.canEmote(a, id) ? 'emote' : null;
    if (!mission) return { ok: true };
    accounts.progress.act(a, mission); await store.put(a);
    // Un deck partagé depuis les menus : l'appli reprend le compte (missions à jour). En partie, elle le reprend à la fin.
    return mission === 'deckShare' ? { ok: true, account: accounts.me(a) } : { ok: true };
  }

  return {
    routes: {
      'GET /api/admin/follow': (_, __, ___, url) => stats(+url.searchParams.get('days') || 0),
      'POST /api/track': (a, body) => track(a, body),
    },
  };
}
