// Stockage des comptes : PostgreSQL si DATABASE_URL est défini (production), sinon un fichier JSON local (développement).
// Les comptes et les réglages du jeu tiennent en mémoire ; chaque modification est écrite aussitôt.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.DATA_FILE || fileURLToPath(new URL('../data/comptes.json', import.meta.url));
const SETTINGS_FILE = FILE.replace(/[^/\\]*$/, 'reglages.json');

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
  const accounts = jsonFile(FILE), settings = jsonFile(SETTINGS_FILE);
  return {
    label: `fichier ${FILE}`,
    load: () => accounts.load([]),
    // Le fichier est réécrit en entier.
    save: (_, all) => accounts.save(all),
    remove: (_, all) => accounts.save(all),
    loadSettings: () => settings.load({}),
    saveSettings: data => settings.save(data),
  };
}

async function pgBackend(url) {
  const { default: pg } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes('host=/');
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  await pool.query('create table if not exists comptes (login text primary key, data jsonb not null, updated_at timestamptz not null default now())');
  await pool.query('create table if not exists reglages (cle text primary key, data jsonb not null, updated_at timestamptz not null default now())');
  return {
    label: 'PostgreSQL',
    async load() { return (await pool.query('select data from comptes')).rows.map(r => r.data); },
    save(acc) { return pool.query('insert into comptes (login, data) values ($1, $2) on conflict (login) do update set data = $2, updated_at = now()', [acc.login, acc]); },
    remove(login) { return pool.query('delete from comptes where login = $1', [login]); },
    async loadSettings() { return (await pool.query("select data from reglages where cle = 'jeu'")).rows[0]?.data || {}; },
    saveSettings(data) { return pool.query("insert into reglages (cle, data) values ('jeu', $1) on conflict (cle) do update set data = $1, updated_at = now()", [data]); },
  };
}

export async function openStore() {
  const backend = process.env.DATABASE_URL ? await pgBackend(process.env.DATABASE_URL) : fileBackend();
  if (!process.env.DATABASE_URL && process.env.RENDER) console.warn('ATTENTION : DATABASE_URL absent, les comptes seront perdus au prochain déploiement.');
  const accounts = new Map((await backend.load()).map(a => [a.login, a]));
  let settings = await backend.loadSettings();
  console.log(`Comptes : ${accounts.size} chargé(s) depuis ${backend.label}.`);
  return {
    get: login => accounts.get(login),
    all: () => [...accounts.values()],
    async put(acc) { accounts.set(acc.login, acc); await backend.save(acc, [...accounts.values()]); },
    async remove(login) { accounts.delete(login); await backend.remove(login, [...accounts.values()]); },
    settings: () => settings,
    async putSettings(data) { settings = data; await backend.saveSettings(data); },
  };
}
