// Vérifie les traductions : npm run i18n [-- --all] [-- --strict]
// 1. Relève dans le code les textes passés à t(), tp(), tr(), trp(), msg() et log(st, …) et liste ceux qui n'ont pas
//    de traduction anglaise (clé absente des dictionnaires).
// 2. Vérifie les données affichées par t(x.name) : cartes, généraux, terrains, decks, sets, familles, zones…
// 3. Signale les traductions dont les {variables} ne correspondent pas à celles du texte français.
// --all : liste tous les textes manquants (sinon les 40 premiers par fichier) ; --strict : code d'erreur s'il en manque.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), ALL = args.includes('--all'), STRICT = args.includes('--strict');
const { addStrings, strings } = await import('../packages/engine/src/i18n.js');
addStrings('en', (await import('../packages/engine/src/lang/en/index.js')).default);
addStrings('en', (await import('../client/src/lang/en/index.js')).default);
const EN = strings('en');

// Fichiers relus : l'appli (hors page /admin, qui reste en français), le moteur et le serveur.
const DIRS = ['client/src', 'packages/engine/src', 'server/src'];
const SKIP = p => /(^|\/)admin[^/]*\.js$|(^|\/)i18n\.js$|\/lang\/|\/(sim|eco|empreinte|equilibrage)\.js$/.test(p);
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f) && !SKIP(relative(ROOT, p))) files.push(p); } };
DIRS.forEach(d => walk(join(ROOT, d)));

// Lit une chaîne littérale à la position i (', " ou ` sans ${}) ; renvoie [texte, fin] ou null.
function literal(src, i) {
  const q = src[i]; if (!`'"\``.includes(q)) return null;
  let s = '';
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      const n = src[++j];
      if (n === 'u') { s += String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16)); j += 4; } else s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      continue;
    }
    if (q === '`' && c === '$' && src[j + 1] === '{') return null;
    if (c === q) return [s, j + 1];
    s += c;
  }
  return null;
}
// Arguments d'un appel commençant juste après « ( » : liste de [début, fin] au premier niveau.
function argsAt(src, i) {
  const out = []; let depth = 0, start = i;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (`'"\``.includes(c)) { // saute une chaîne (les ${} des gabarits comptent comme imbrication)
      const q = c; j++;
      for (; j < src.length && src[j] !== q; j++) { if (src[j] === '\\') j++; else if (q === '`' && src[j] === '$' && src[j + 1] === '{') { let d = 1; j += 2; for (; j < src.length && d; j++) { if (src[j] === '{') d++; else if (src[j] === '}') d--; } j--; } }
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) { out.push([start, j]); return out; } depth--; }
    else if (c === ',' && depth === 0) { out.push([start, j]); start = j + 1; }
  }
  return out;
}
// Position des arguments à traduire, par fonction.
const CALLS = { t: [0], tp: [1, 2], tr: [1], trp: [2, 3], msg: [0], log: [1] };
const RE = /(?<![\w$.])(t|tp|tr|trp|msg|log)\(/g;
const found = new Map(); // texte → fichiers
let dynamic = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8'), rel = relative(ROOT, f);
  for (const m of src.matchAll(RE)) {
    const name = m[1], a = argsAt(src, m.index + m[0].length);
    // Dans un commentaire « // … » : ignoré.
    if (/(^|[^:'"`])\/\//.test(src.slice(src.lastIndexOf('\n', m.index) + 1, m.index))) continue;
    if (name === 'log' && !/^\s*st\b/.test(src.slice(...(a[0] || [0, 0])))) continue;
    for (const k of CALLS[name]) {
      if (!a[k]) continue;
      const raw = src.slice(a[k][0], a[k][1]).trim();
      // t(cond ? 'a' : 'b') : les deux branches.
      const parts = raw.match(/^[^'"`]*\?\s*(['"`][\s\S]*?['"`])\s*:\s*(['"`][\s\S]*['"`])$/)?.slice(1) || [raw];
      for (const p of parts) {
        const lit = literal(p.trim(), 0);
        if (!lit || lit[1] !== p.trim().length) { dynamic++; continue; }
        if (!found.has(lit[0])) found.set(lit[0], new Set());
        found.get(lit[0]).add(rel);
      }
    }
  }
}

// Données affichées par t(…) sans texte littéral dans le code.
const data = new Map();
const add = (s, where) => { if (typeof s === 'string' && s.trim() && /\p{L}/u.test(s)) { if (!data.has(s)) data.set(s, where); } };
const E = await import('../packages/engine/src/engine.js');
const C = await import('../packages/engine/src/collection.js');
for (const [id, d] of Object.entries(E.CARDS)) { add(d.name, `CARDS.${id}`); add(d.text, `CARDS.${id}`); }
for (const [id, d] of Object.entries(E.GENERALS)) { add(d.name, `GENERALS.${id}`); add(d.text, `GENERALS.${id}`); add(d.kind, `GENERALS.${id}`); }
for (const [id, d] of Object.entries(E.TERRAINS)) { add(d.name, `TERRAINS.${id}`); add(d.text, `TERRAINS.${id}`); }
for (const [id, d] of Object.entries(E.DECKS)) add(d.name, `DECKS.${id}`);
for (const s of C.DEFAULT_SETS) { add(s.name, `SETS.${s.id}`); add(s.teaser, `SETS.${s.id}`); }
E.FAMILIES.forEach(f => add(f, 'FAMILIES'));
E.ZONE_NAMES.forEach(z => add(z, 'ZONE_NAMES'));
// Autres tables du moteur affichées par t(x.champ) : [module, export, champs]. À compléter quand une table s'affiche.
const TABLES = (await import('./i18n-tables.js')).default;
for (const [mod, name, keys] of TABLES) {
  const M = await import(`../packages/engine/src/${mod}`), seen = new Set();
  const visit = (v, path) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v);
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string') { if (keys === '*' || keys.includes(k) || Array.isArray(v)) add(x, `${name}${path}.${k}`); }
      else visit(x, `${path}.${k}`);
    }
  };
  visit(M[name], '');
}

// Bilan.
const missing = new Map();
for (const [s, where] of found) if (!(s in EN)) for (const w of where) { if (!missing.has(w)) missing.set(w, []); missing.get(w).push(s); }
const dataMissing = [...data].filter(([s]) => !(s in EN));
const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const badVars = Object.entries(EN).filter(([fr, en]) => typeof en !== 'string' || vars(fr) !== vars(en));

const total = found.size + data.size, miss = new Set([...[...missing.values()].flat(), ...dataMissing.map(([s]) => s)]).size;
console.log(`Textes relevés : ${found.size} dans le code, ${data.size} dans les données (${dynamic} appels à texte calculé, non vérifiables).`);
console.log(`Traductions anglaises : ${Object.keys(EN).length} ; manquantes : ${miss} sur ${total}.`);
for (const [f, list] of [...missing].sort()) {
  console.log(`\n${f} : ${list.length} sans traduction`);
  for (const s of ALL ? list : list.slice(0, 40)) console.log(`  ${JSON.stringify(s)}`);
  if (!ALL && list.length > 40) console.log(`  … (--all pour tout voir)`);
}
if (dataMissing.length) {
  console.log(`\nDonnées : ${dataMissing.length} sans traduction`);
  for (const [s, w] of ALL ? dataMissing : dataMissing.slice(0, 60)) console.log(`  ${w} : ${JSON.stringify(s)}`);
  if (!ALL && dataMissing.length > 60) console.log('  … (--all pour tout voir)');
}
if (badVars.length) {
  console.log(`\nVariables différentes entre le français et l'anglais : ${badVars.length}`);
  for (const [fr, en] of badVars) console.log(`  ${JSON.stringify(fr)} → ${JSON.stringify(en)}`);
}
if (STRICT && (miss || badVars.length)) process.exit(1);
