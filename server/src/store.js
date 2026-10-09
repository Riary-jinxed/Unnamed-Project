// Stockage des comptes : PostgreSQL si DATABASE_URL est défini (production), sinon un fichier JSON local (développement).
// Les comptes tiennent en mémoire ; chaque modification est écrite aussitôt.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.DATA_FILE || fileURLToPath(new URL('../data/comptes.json', import.meta.url));

function fileBackend() {
  let chain = Promise.resolve();
  return {
    label: `fichier ${FILE}`,
    async load() { try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return []; } },
    // Le fichier est réécrit en entier, une écriture à la fois.
    save(_, all) {
      chain = chain.then(async () => {
        await mkdir(dirname(FILE), { recursive: true });
        await writeFile(FILE + '.tmp', JSON.stringify(all, null, 1)); await rename(FILE + '.tmp', FILE);
      });
      return chain;
    },
  };
}

async function pgBackend(url) {
  const { default: pg } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes('host=/');
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  await pool.query('create table if not exists comptes (login text primary key, data jsonb not null, updated_at timestamptz not null default now())');
  return {
    label: 'PostgreSQL',
    async load() { return (await pool.query('select data from comptes')).rows.map(r => r.data); },
    save(acc) { return pool.query('insert into comptes (login, data) values ($1, $2) on conflict (login) do update set data = $2, updated_at = now()', [acc.login, acc]); },
  };
}

export async function openStore() {
  const backend = process.env.DATABASE_URL ? await pgBackend(process.env.DATABASE_URL) : fileBackend();
  if (!process.env.DATABASE_URL && process.env.RENDER) console.warn('ATTENTION : DATABASE_URL absent, les comptes seront perdus au prochain déploiement.');
  const accounts = new Map((await backend.load()).map(a => [a.login, a]));
  console.log(`Comptes : ${accounts.size} chargé(s) depuis ${backend.label}.`);
  return {
    get: login => accounts.get(login),
    all: () => [...accounts.values()],
    async put(acc) { accounts.set(acc.login, acc); await backend.save(acc, [...accounts.values()]); },
  };
}
