// Banc d'équilibrage IA contre IA, sur tous les cœurs : node packages/engine/src/equilibrage.js [decks|generaux|cartes|tout] [parties] [tous]
// decks    : matrice des decks préconstruits (chaque duel joué dans les deux sens), et taux de victoire des cartes jouées.
// generaux : chaque général à la tête des decks de sa famille (les généraux neutres : de tous les decks), contre tous les decks.
//            Référence : le Cartographe, dont l'effet n'aide pas l'IA, joue le rôle de « sans général ».
// cartes   : chaque carte de chaque deck est remplacée par une créature sans effet du même coût ; l'écart de taux de victoire
//            mesure ce que la carte apporte de plus qu'une créature « vanille » (positif = mieux qu'une vanille).
// Les résultats bruts sont écrits en JSON dans equilibrage-resultats.json (dossier courant) pour être relus ou comparés.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { CARDS, DECKS, GENERALS, newGame, startTurn, aiPlan, runTurn } from './engine.js';
import { aiDeckKeys, unrevealed } from './collection.js';

const TRIES = 80;
// Créature sans effet de référence pour un coût donné, d'après les neutres vanille du jeu (Mercenaire 2/3, Chevalier 3/4, Golem 4/6…).
const VANILLA = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 6, 5: 7, 6: 9, 7: 11 };
for (const [c, p] of Object.entries(VANILLA)) CARDS[`vanille_${c}`] = { name: `Vanille ${c}/${p}`, type: 'C', cost: +c, power: p, kw: [], text: '' };
const vanillaFor = id => `vanille_${Math.min(7, Math.max(1, CARDS[id].cost))}`;

async function play(a, b, ga, gb) {
  const st = newGame(a, b, undefined, { generals: [ga, gb] }); st.sim = true; startTurn(st);
  while (!st.over) await runTurn(st, [aiPlan(st, 0, TRIES), aiPlan(st, 1, TRIES)], () => {}, async () => {});
  return { w: st.result.winner, played: [st.p[0].played, st.p[1].played] };
}

// Un travail : n parties entre a (siège 0 ou 1 en alternance) et b. Renvoie le score de a et les cartes jouées par a.
async function runJob(j) {
  let score = 0; const played = {};
  for (let i = 0; i < j.n; i++) {
    const swap = i % 2 === 1;
    const r = swap ? await play(j.b, j.a, j.gb, j.ga) : await play(j.a, j.b, j.ga, j.gb);
    const me = swap ? 1 : 0, s = r.w === me ? 1 : r.w < 0 ? 0.5 : 0;
    score += s;
    if (j.track) for (const id of new Set(r.played[me])) { const x = played[id] ||= [0, 0]; x[0]++; x[1] += s; }
  }
  return { id: j.id, score, n: j.n, played };
}

if (!isMainThread) {
  parentPort.on('message', async j => parentPort.postMessage(await runJob(j)));
} else {
  const mode = process.argv[2] || 'tout';
  const N = +process.argv[3] || 40;
  // Decks des sets déjà sortis, comme l'IA du jeu ; « tous » en 4e argument pour inclure les sets à venir.
  const keys = process.argv[4] === 'tous' ? Object.keys(DECKS) : aiDeckKeys();
  const deckObj = (k, swapOut, swapIn, general) => ({ ...DECKS[k], general: general || DECKS[k].general,
    cards: swapOut ? DECKS[k].cards.map(c => c === swapOut ? swapIn : c) : DECKS[k].cards });

  // Pool de workers : chaque worker prend le travail suivant dès qu'il a fini.
  async function pool(jobs, label) {
    const out = new Array(jobs.length); let next = 0, done = 0; const t0 = Date.now();
    const W = Math.max(1, availableParallelism());
    await Promise.all(Array.from({ length: Math.min(W, jobs.length) }, () => new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url));
      const feed = () => { if (next < jobs.length) { const j = jobs[next]; w.postMessage({ ...j, id: next++ }); } else { w.terminate(); resolve(); } };
      w.on('message', r => { out[r.id] = r; done++;
        if (done % Math.ceil(jobs.length / 20) === 0) process.stderr.write(`\r${label} : ${done}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} s)   `);
        feed(); });
      w.on('error', reject); feed();
    })));
    process.stderr.write(`\r${label} : ${jobs.length}/${jobs.length} en ${Math.round((Date.now() - t0) / 1000)} s\n`);
    return out;
  }
  const pct = v => Math.round(1000 * v) / 10;
  const results = {};

  if (mode === 'decks' || mode === 'tout') {
    const jobs = [];
    for (const a of keys) for (const b of keys) if (a !== b) jobs.push({ a, b, n: N, track: true, key: [a, b] });
    const r = await pool(jobs, 'Decks');
    const m = {}, played = {}, base = {};
    jobs.forEach((j, i) => { const [a, b] = j.key; (m[a] ||= {})[b] = r[i].score / r[i].n;
      const B = base[a] ||= [0, 0]; B[0] += r[i].n; B[1] += r[i].score;
      for (const [id, [n, s]] of Object.entries(r[i].played)) { const x = (played[a] ||= {})[id] ||= [0, 0]; x[0] += n; x[1] += s; } });
    const table = {};
    for (const a of keys) { const row = { Global: pct(base[a][1] / base[a][0]) };
      for (const b of keys) row[DECKS[b].name.slice(0, 10)] = a === b ? '—' : pct((m[a][b] + 1 - m[b][a]) / 2);
      table[DECKS[a].name] = row; }
    console.log(`\nDecks : taux de victoire (%) du deck en ligne contre le deck en colonne, ${2 * N} parties par paire.`);
    console.table(table);
    // Cartes jouées : taux de victoire du deck les parties où la carte a été posée, comparé à son taux global.
    const cardRows = [];
    for (const a of keys) for (const [id, [n, s]] of Object.entries(played[a] || {})) {
      const g = base[a][1] / base[a][0], tot = base[a][0];
      cardRows.push({ deck: DECKS[a].name, carte: CARDS[id].name, 'jouée %': pct(n / tot), 'victoires si jouée': pct(s / n), 'écart': pct(s / n - g) });
    }
    results.decks = { matrix: m, base, played };
    results.cartesJouees = cardRows;
  }

  if (mode === 'generaux' || mode === 'tout') {
    const combos = [];
    for (const g of Object.keys(GENERALS)) if (process.argv[4] === 'tous' || !unrevealed(g)) for (const k of keys) if (!GENERALS[g].fam || GENERALS[g].fam === DECKS[k].fam) combos.push([g, k]);
    for (const k of keys) if (!combos.some(([g, kk]) => g === 'cartographe' && kk === k)) combos.push(['cartographe', k]);
    const jobs = [];
    for (const [g, k] of combos) for (const b of keys) if (b !== k) jobs.push({ a: deckObj(k, null, null, g), b, n: Math.ceil(N / 2) * 2, key: [g, k] });
    const r = await pool(jobs, 'Généraux');
    const agg = {};
    jobs.forEach((j, i) => { const x = agg[j.key.join('|')] ||= [0, 0]; x[0] += r[i].n; x[1] += r[i].score; });
    const rate = (g, k) => { const x = agg[`${g}|${k}`]; return x[1] / x[0]; };
    const byGen = {};
    for (const [g, k] of combos) { const b = byGen[g] ||= { n: 0, d: 0, decks: [] }; const d = rate(g, k) - rate('cartographe', k);
      b.n++; b.d += d; b.decks.push(`${DECKS[k].name} ${d >= 0 ? '+' : ''}${pct(d)}`); }
    const table = {};
    Object.entries(byGen).sort((a, b) => b[1].d / b[1].n - a[1].d / a[1].n).forEach(([g, b]) => {
      table[GENERALS[g].name] = { famille: GENERALS[g].fam || 'neutre', 'apport moyen (pts)': pct(b.d / b.n), 'par deck': b.decks.join(' · ') };
    });
    console.log(`\nGénéraux : points de taux de victoire gagnés par rapport au même deck sans effet de général (Cartographe).`);
    console.table(table);
    results.generaux = { agg, table };
  }

  if (mode === 'cartes' || mode === 'tout') {
    const jobs = [];
    const variants = [];
    for (const k of keys) { variants.push([k, null]); for (const c of new Set(DECKS[k].cards)) variants.push([k, c]); }
    // Le témoin (deck inchangé) joue deux fois plus pour réduire le bruit de la référence.
    for (const [k, c] of variants) for (const b of keys) if (b !== k)
      jobs.push({ a: c ? deckObj(k, c, vanillaFor(c)) : k, b, n: (c ? 1 : 2) * Math.ceil(N / 2) * 2, key: [k, c] });
    const r = await pool(jobs, 'Cartes');
    const agg = {};
    jobs.forEach((j, i) => { const x = agg[`${j.key[0]}|${j.key[1] || ''}`] ||= [0, 0]; x[0] += r[i].n; x[1] += r[i].score; });
    const rows = [];
    for (const [k, c] of variants) if (c) {
      const [n, s] = agg[`${k}|${c}`], [n0, s0] = agg[`${k}|`];
      rows.push({ deck: DECKS[k].name, carte: CARDS[c].name, coût: CARDS[c].cost, 'apport vs vanille (pts)': pct(s0 / n0 - s / n), parties: n });
    }
    rows.sort((a, b) => b['apport vs vanille (pts)'] - a['apport vs vanille (pts)']);
    console.log(`\nCartes : points de taux de victoire perdus quand la carte est remplacée par une créature sans effet du même coût.`);
    console.log('Les plus fortes :'); console.table(rows.slice(0, 15));
    console.log('Les plus faibles :'); console.table(rows.slice(-15).reverse());
    results.cartes = rows;
  }

  writeFileSync('equilibrage-resultats.json', JSON.stringify({ mode, N, tries: TRIES, at: new Date().toISOString(), ...results }, null, 1));
  console.log('\nRésultats bruts : equilibrage-resultats.json');
}
