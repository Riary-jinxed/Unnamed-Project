// Nouveautés : l'espace des annonces de l'équipe (mises à jour majeures, nouveaux sets, annonce du prochain set, grands événements).
// Contrairement au courrier, une annonce ne se supprime pas de son côté et ne donne rien : c'est le journal du jeu, du plus récent au plus ancien.
// Document « nouveautes » : { posts: [{ id, at, from (jour de parution AAAA-MM-JJ, heure de Paris), kind, title, summary, body,
//   date (jour annoncé, pour le compte à rebours, ou null), set (set à montrer dans la boutique, ou null), pinned, push, pushed,
//   en: { title, summary, body } (version anglaise facultative) }] }.
// Une annonce dont le jour de parution n'est pas arrivé reste cachée : on peut la programmer à l'avance depuis /admin.
// Compte : newsRead = identifiants des annonces déjà vues (la pastille de l'accueil compte les autres).
import { randomBytes } from 'node:crypto';
import { today, setById } from '@jeu/engine/collection';
import { msg } from '@jeu/engine/i18n';
import { HttpError } from './accounts.js';
import { langOf } from './i18n.js';

// Sortes d'annonces (noms pour /admin ; l'appli a les siens, traduits, et une couleur par sorte).
export const NEWS_KINDS = { update: 'Mise à jour majeure', set: 'Nouveau set', teaser: 'Annonce de set', event: 'Événement' };
const MAX_POSTS = 100, MAX_READ = 200;
// Heure (de Paris) à laquelle part la notification d'une annonce programmée, comme l'arrivée du Boss mondial.
const PUSH_HOUR = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hourOf = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).find(p => p.type === 'hour').value);
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const cleanDate = (d, label) => {
  if (!d) return null;
  if (!DATE_RE.test(String(d))) throw new HttpError(400, `${label} : AAAA-MM-JJ.`);
  return String(d);
};

// notify(logins) : prévient les joueurs connectés (connexion de présence) qu'une annonce vient de paraître.
// upcoming() : le planning de l'onglet « À venir » (planning.js), branché par index.js une fois le Boss mondial créé.
export function createNews(store, accounts, { notify = () => {} } = {}) {
  let upcoming = () => [];
  const posts = () => store.doc('nouveautes')?.posts || [];
  const save = list => store.putDoc('nouveautes', { ...store.doc('nouveautes'), posts: list.slice(-MAX_POSTS) });
  const live = (p, day = today()) => p.from <= day;
  // Épinglées d'abord, puis de la plus récente à la plus ancienne.
  const order = (a, b) => (b.pinned - a.pinned) || b.from.localeCompare(a.from) || b.at.localeCompare(a.at);
  const shown = () => posts().filter(p => live(p)).sort(order);
  const read = a => a.newsRead || [];
  const unread = a => shown().filter(p => !read(a).includes(p.id));

  // Texte dans la langue du joueur : la version anglaise quand elle est remplie, sinon le français.
  const field = (p, k, lang) => (lang !== 'fr' && p.en?.[k]) || p[k];
  const view = (p, a) => {
    const lang = langOf(a), set = p.set && setById(p.set);
    return { id: p.id, from: p.from, kind: p.kind, title: field(p, 'title', lang), summary: field(p, 'summary', lang), body: field(p, 'body', lang),
      date: p.date, set: set ? set.id : null, pinned: !!p.pinned, read: read(a).includes(p.id) };
  };
  // Pour l'accueil : le nombre d'annonces pas encore vues et la plus récente d'entre elles (bandeau « À la une »).
  function tile(a) {
    if (!a.starter) return null;
    const all = shown(); if (!all.length) return null;
    const fresh = unread(a), top = fresh.slice().sort((x, y) => y.from.localeCompare(x.from) || y.at.localeCompare(x.at))[0] || null;
    const last = all.slice().sort((x, y) => y.from.localeCompare(x.from))[0];
    const pick = p => { const v = view(p, a); return { id: v.id, kind: v.kind, title: v.title, summary: v.summary, date: v.date, from: v.from }; };
    return { unread: fresh.length, top: top ? pick(top) : null, last: pick(last) };
  }
  accounts.setNewsTile(tile);

  const reply = a => ({ news: shown().map(p => view(p, a)), upcoming: upcoming(), today: today(), account: accounts.me(a) });
  // Ouvrir l'écran marque tout ce qui est paru comme vu.
  async function seen(a) {
    const ids = shown().map(p => p.id), had = read(a);
    if (ids.every(id => had.includes(id))) return reply(a);
    a.newsRead = [...new Set([...had, ...ids])].slice(-MAX_READ);
    await store.put(a);
    return reply(a);
  }

  // Annonces programmées : le jour venu (dès PUSH_HOUR), une notification à ceux qui l'ont demandée et la pastille des joueurs connectés.
  // Appelé chaque minute (index.js) et après chaque enregistrement depuis /admin : une annonce du jour publiée après 10 h part aussitôt.
  let pushFn = null;
  function setPush(push) { pushFn = push; }
  async function announce(now = new Date()) {
    if (hourOf(now) < PUSH_HOUR) return;
    const day = today(now), list = posts(), due = list.filter(p => live(p, day) && !p.pushed);
    if (!due.length) return;
    due.forEach(p => { p.pushed = true; });
    await save(list);
    notify(store.all().map(a => a.login));
    for (const p of due.filter(x => x.push)) {
      Promise.resolve(pushFn?.broadcast('news', lang => ({ title: field(p, 'title', lang), body: field(p, 'summary', lang) || msg('Nouvelle annonce dans les Nouveautés.'), tag: `news-${p.id}`, open: 'news' })))
        .catch(e => console.error('Annonce non envoyée :', e));
    }
  }

  // ---- Administration ----
  function adminView() {
    const all = store.all().filter(a => a.starter), day = today();
    return {
      posts: posts().slice().sort(order).map(p => ({ ...p, live: live(p, day), read: all.filter(a => read(a).includes(p.id)).length, players: all.length })),
      kinds: NEWS_KINDS, today: day,
    };
  }
  async function upsert(body) {
    const title = clip(body.title, 90);
    if (!title) throw new HttpError(400, 'Donnez un titre à l\'annonce.');
    const kind = NEWS_KINDS[body.kind] ? body.kind : 'update';
    const set = body.set ? String(body.set) : null;
    if (set && !setById(set)) throw new HttpError(400, 'Set inconnu.');
    const en = { title: clip(body.en?.title, 90), summary: clip(body.en?.summary, 200), body: clip(body.en?.body, 4000) };
    const fields = { kind, title, summary: clip(body.summary, 200), body: clip(body.body, 4000), from: cleanDate(body.from, 'Jour de parution') || today(),
      date: cleanDate(body.date, 'Jour annoncé'), set, pinned: !!body.pinned, push: !!body.push, en: en.title || en.summary || en.body ? en : null };
    const list = posts();
    if (body.id) {
      const p = list.find(x => x.id === body.id);
      if (!p) throw new HttpError(404, 'Annonce introuvable.');
      // Reprogrammée plus tard : elle repartira (notification comprise) le jour venu.
      const later = fields.from > today() && fields.from !== p.from;
      Object.assign(p, fields, later ? { pushed: false } : {});
    } else {
      list.push({ id: randomBytes(6).toString('hex'), at: new Date().toISOString(), ...fields, pushed: false });
    }
    await save(list);
    await announce();
    return adminView();
  }
  async function remove({ id }) {
    await save(posts().filter(p => p.id !== id));
    return adminView();
  }

  return {
    announce, setPush, shown, setUpcoming: f => { upcoming = f; },
    routes: {
      'GET /api/news': a => reply(a),
      'POST /api/news/seen': a => seen(a),
      'GET /api/admin/news': () => adminView(),
      'POST /api/admin/news': (_, body) => upsert(body || {}),
      'POST /api/admin/news/delete': (_, body) => remove(body || {}),
    },
  };
}
