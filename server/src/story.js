// Quêtes d'histoire (packages/engine/src/story.js) : progression de chaque joueur, récompenses des chapitres, réglages de /admin.
// Les combats se jouent dans la page, comme une partie contre l'IA (client/src/story.js, avec solo.js) : l'appli envoie la victoire,
// le serveur vérifie que le chapitre est le suivant de la quête et que la quête est ouverte, puis donne sa récompense la première fois.
// Comme pour POST /api/games/solo, le résultat d'une partie jouée dans la page est cru sur parole ; chaque récompense ne se gagne
// qu'une fois, dans l'ordre des chapitres. Document « quetes » (réglages de /admin). Compte : story ({ [quête]: chapitres gagnés }).
// Statistiques des succès : storyChapters, storyCampaigns, storyLimited.
// Une quête d'événement canon finie passe dans l'histoire principale (état « archive », sans art Promo) et sa carte rejoint le
// booster du Set de base : releasedCards, joint au catalogue par cards.js ; onChange le prévient quand /admin change les dates.
import { today } from '@jeu/engine/collection';
import { QUESTS, questById, isLimited, questCfg, questState, questDaysLeft, chapterReward, releasedStoryCards, DEFAULT_STORY, REWARD_KEYS, STORY_LIMITS } from '@jeu/engine/story';
import { HttpError } from './accounts.js';
import { msg } from '@jeu/engine/i18n';

// Une quête limitée se montre « bientôt » quelques jours avant son début.
const TEASE_DAYS = 7;
const daysTo = (from, day) => Math.round((Date.parse(`${from}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000);

export function createStory(store, accounts, { onChange = () => {} } = {}) {
  const progress = accounts.progress;
  const doc = () => store.doc('quetes') || {};
  const cfg = id => questCfg(id, doc());
  const won = (a, id) => a.story?.[id] || 0;

  // ---- Vue du joueur ----
  // Les quêtes jouables (ouvertes ou archivées), et les quêtes limitées qui commencent bientôt (nom et date seulement).
  // Une quête limitée non canon finie, ou une quête fermée, disparaît ; ses récompenses restent acquises.
  function view(a) {
    const day = today();
    const quests = QUESTS.map(q => {
      const c = cfg(q.id), state = questState(q, c, day);
      if (state === 'soon' && daysTo(c.from, day) <= TEASE_DAYS) return { id: q.id, state, from: c.from, name: q.name };
      if (state !== 'open' && state !== 'archive') return null;
      const live = state === 'open' && isLimited(q);
      return { id: q.id, state, from: c.from || null, to: c.to || null, daysLeft: live ? questDaysLeft(c, day) : null,
        won: won(a, q.id), total: q.chapters.length, rewards: q.chapters.map((_, i) => chapterReward(q, i, c, state === 'archive')) };
    }).filter(Boolean);
    return { quests };
  }
  // Tuile de l'accueil : la quête limitée en cours (la plus proche de sa fin) à finir, sinon la campagne commencée la plus avancée.
  function tile(a) {
    if (!a.starter) return null;
    const v = view(a).quests.filter(x => x.state === 'open' || x.state === 'archive');
    const left = x => x.won < x.total, live = x => x.daysLeft !== null;
    const limited = v.filter(x => live(x) && left(x)).sort((x, y) => x.daysLeft - y.daysLeft)[0];
    const pick = limited || v.filter(x => !live(x) && left(x)).sort((x, y) => y.won - x.won)[0] || null;
    const done = v.filter(x => !live(x) && !left(x)).length;
    return pick ? { id: pick.id, won: pick.won, total: pick.total, daysLeft: pick.daysLeft, done } : { id: null, done };
  }

  // ---- Victoire ----
  // Chapitre gagné : la récompense la première fois (les chapitres déjà gagnés se rejouent sans récompense).
  async function win(a, body) {
    const q = questById(String(body.quest || '')), i = Number(body.chapter);
    if (!q || !Number.isInteger(i) || i < 0 || i >= q.chapters.length) throw new HttpError(400, msg('Chapitre inconnu.'));
    if (!a.starter) throw new HttpError(409, msg('Choisissez d\'abord votre deck de départ.'));
    const c = cfg(q.id);
    const state = questState(q, c, today());
    if (state !== 'open' && state !== 'archive') throw new HttpError(409, state === 'soon' ? msg('Cette quête n\'a pas encore commencé.') : state === 'over' ? msg('Cette quête est terminée.') : msg('Cette quête est fermée pour le moment.'));
    const n = won(a, q.id);
    if (i > n) throw new HttpError(409, msg('Gagnez d\'abord les chapitres précédents.'));
    if (!a.level) progress.init(a);
    if (i < n) return { reward: null, replay: true, story: view(a), account: accounts.me(a) };
    a.story = { ...(a.story || {}), [q.id]: n + 1 };
    const done = n + 1 === q.chapters.length;
    const reward = { kind: 'story', label: `${q.name} : ${q.chapters[i].name}`, labelMsg: msg('{quest} : {chapter}', { quest: [q.name], chapter: [q.chapters[i].name] }), ...chapterReward(q, i, c, state === 'archive') };
    progress.grant(a, reward, { silent: true });
    progress.count(a, 'storyChapters');
    // Une quête d'événement rejouée dans l'histoire principale ne compte plus pour les succès de quête.
    if (done && state === 'open') progress.count(a, isLimited(q) ? 'storyLimited' : 'storyCampaigns');
    await store.put(a);
    return { reward, done, story: view(a), account: accounts.me(a) };
  }

  // ---- /admin ----
  function adminView() {
    const day = today(), d = doc();
    const players = store.all().filter(a => a.story);
    return { day, defaults: DEFAULT_STORY, custom: !!Object.keys(d).length,
      quests: QUESTS.map(q => { const c = cfg(q.id);
        return { id: q.id, name: q.name, kind: q.kind, canon: !!q.canon, chapters: q.chapters.map(ch => ({ name: ch.name, foe: ch.foe.name, card: ch.reward.card || null, art: ch.reward.art || null, title: ch.reward.title || null })),
          settings: c, state: questState(q, c, day), started: players.filter(a => a.story[q.id]).length, finished: players.filter(a => a.story[q.id] >= q.chapters.length).length }; }) };
  }
  const int = (v, [lo, hi], where) => { const n = Number(v ?? 0); if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${where} : un nombre entier de ${lo} à ${hi}.`); return n; };
  const date = (v, where) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${where} : une date AAAA-MM-JJ.`); return v; };
  async function save(body) {
    if (body.reset) { await store.putDoc('quetes', {}); onChange(); return adminView(); }
    const s = body.settings || {}, out = {};
    for (const q of QUESTS) {
      const x = s[q.id]; if (!x) continue;
      const o = { on: !!x.on };
      if (isLimited(q)) {
        o.from = date(x.from, `${q.name}, début`); o.to = date(x.to, `${q.name}, fin`);
        if (o.to < o.from) throw new HttpError(400, `${q.name} : la fin doit venir après le début.`);
      }
      o.rewards = q.chapters.map((ch, i) => Object.fromEntries(REWARD_KEYS.map(k => [k, int(x.rewards?.[i]?.[k], STORY_LIMITS[k], `${q.name}, chapitre ${i + 1}, ${k}`)])));
      out[q.id] = o;
    }
    await store.putDoc('quetes', out);
    onChange();
    return adminView();
  }

  return {
    tile,
    releasedCards: () => releasedStoryCards(doc(), today()),
    routes: {
      'GET /api/story': a => view(a),
      'POST /api/story/win': (a, body) => win(a, body || {}),
      'GET /api/admin/story': () => adminView(),
      'POST /api/admin/story': (_, body) => save(body || {}),
    },
  };
}
