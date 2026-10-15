// Stockage des comptes : PostgreSQL si DATABASE_URL est défini (production), sinon un fichier JSON local (développement).
// Les comptes, les réglages du jeu (réglages de la boutique, catalogue de cartes) et l'historique des parties tiennent en mémoire ;
// chaque modification est écrite aussitôt.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.DATA_FILE || fileURLToPath(new URL('../data/comptes.json', import.meta.url));
const SETTINGS_FILE = FILE.replace(/[^/\\]*$/, 'reglages.json'), GAMES_FILE = FILE.replace(/[^/\\]*$/, 'parties.json');
// Documents lourds et rarement lus (captures des signalements) : pas gardés en mémoire, lus à la demande (loadDoc).
const COLD = 'signalement-img-', cold = key => key.startsWith(COLD);

// Écrit un fichier JSON en entier, une écriture à la fois par fichier.
function jsonFile(path) {
  let chain = Promise.resolve();
  return {
    async load(fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; } },
    save(data) {
      chain = chain.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path + '.tmp', JSON.stringify(data, null, 1)); await rename(path + '.tmp', path);
      });
      return chain;
    },
  };
}

function fileBackend() {
  const accounts = jsonFile(FILE), settings = jsonFile(SETTINGS_FILE), games = jsonFile(GAMES_FILE);
  let docs = {}; // tous les documents, captures comprises : le fichier est réécrit en entier
  return {
    label: `fichier ${FILE}`,
    load: () => accounts.load([]),
    // Le fichier est réécrit en entier (list : tous les comptes).
    save: (_, list) => accounts.save(list()),
    remove: (_, list) => accounts.save(list()),
    async loadDocs() { docs = await settings.load({}); return { ...docs }; },
    loadDoc: key => docs[key],
    saveDoc: (key, data) => { docs[key] = data; return settings.save(docs); },
    removeDoc: key => { delete docs[key]; return settings.save(docs); },
    loadGames: () => games.load([]),
    addGame: (_, all) => games.save(all),
  };
}

async function pgBackend(url) {
  const { default: pg } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes('host=/');
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  await pool.query('create table if not exists comptes (login text primary key, data jsonb not null, updated_at timestamptz not null default now())');
  await pool.query('create table if not exists reglages (cle text primary key, data jsonb not null, updated_at timestamptz not null default now())');
  await pool.query('create table if not exists parties (id bigserial primary key, data jsonb not null, created_at timestamptz not null default now())');
  return {
    label: 'PostgreSQL',
    async load() { return (await pool.query('select data from comptes')).rows.map(r => r.data); },
    save(acc) { return pool.query('insert into comptes (login, data) values ($1, $2) on conflict (login) do update set data = $2, updated_at = now()', [acc.login, acc]); },
    remove(login) { return pool.query('delete from comptes where login = $1', [login]); },
    async loadDocs() { return Object.fromEntries((await pool.query('select cle, data from reglages where cle not like $1', [COLD + '%'])).rows.map(r => [r.cle, r.data])); },
    async loadDoc(key) { return (await pool.query('select data from reglages where cle = $1', [key])).rows[0]?.data; },
    saveDoc(key, data) { return pool.query('insert into reglages (cle, data) values ($1, $2) on conflict (cle) do update set data = $2, updated_at = now()', [key, data]); },
    removeDoc(key) { return pool.query('delete from reglages where cle = $1', [key]); },
    async loadGames() { return (await pool.query('select data from parties order by id')).rows.map(r => r.data); },
    addGame(game) { return pool.query('insert into parties (data) values ($1)', [game]); },
  };
}

export async function openStore() {
  const backend = process.env.DATABASE_URL ? await pgBackend(process.env.DATABASE_URL) : fileBackend();
  if (!process.env.DATABASE_URL && process.env.RENDER) console.warn('ATTENTION : DATABASE_URL absent, les comptes seront perdus au prochain déploiement.');
  const accounts = new Map((await backend.load()).map(a => [a.login, a]));
  const docs = await backend.loadDocs(), games = await backend.loadGames();
  for (const k in docs) if (cold(k)) delete docs[k];
  const list = () => [...accounts.values()];
  console.log(`Comptes : ${accounts.size} chargé(s) depuis ${backend.label}.`);
  return {
    get: login => accounts.get(login),
    all: () => [...accounts.values()],
    async put(acc) { accounts.set(acc.login, acc); await backend.save(acc, list); },
    async remove(login) { accounts.delete(login); await backend.remove(login, list); },
    // Documents de réglages par clé : « jeu » (boutique), « catalogue » (cartes publiées), « brouillon » (cartes en cours).
    // Les documents « signalement-img-<id> » ne sont pas en mémoire : doc() ne les voit pas, loadDoc() les lit.
    doc: key => docs[key],
    loadDoc: async key => (cold(key) ? backend.loadDoc(key) : docs[key]),
    async putDoc(key, data) { if (!cold(key)) docs[key] = data; await backend.saveDoc(key, data); },
    async removeDoc(key) {
      if (!cold(key)) { if (!(key in docs)) return; delete docs[key]; }
      await backend.removeDoc(key);
    },
    games: () => games,
    async addGame(game) { games.push(game); await backend.addGame(game, games); },
  };
}
