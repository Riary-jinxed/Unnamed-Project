// Simulation de l'économie : combien de jours pour compléter un set selon la façon de jouer.
// node packages/engine/src/eco.js [joueurs simulés]
// Les réglages simulés sont ceux par défaut (rewards.js, collection.js) ; un fichier JSON de réglages peut les remplacer :
// node packages/engine/src/eco.js 300 reglages.json  (mêmes clés que la boutique et les récompenses de /admin).
import { readFileSync } from 'node:fs';
import { DEFAULT_SETS, SHOP, SHARDS_PER_DUPLICATE, BOOSTER_SIZE } from './collection.js';
import { DEFAULT_REWARDS, MISSIONS, ACHIEVEMENTS, MAX_CARD_LEVEL, xpToNext, familyOf, levelCost } from './rewards.js';
import { STARTERS, starterKit } from './collection.js';

const RUNS = +process.argv[2] || 200;
const over = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : {};
const R = { ...DEFAULT_REWARDS, ...over };
const S = { cardPrice: SHOP.cardPrice, boosterPrice: SHOP.boosterPrice, boosterSize: SHOP.boosterSize, dailyCards: SHOP.dailyCards, shardsPerDuplicate: SHARDS_PER_DUPLICATE, ...over };
const M = Object.entries(MISSIONS).map(([id, m]) => ({ ...m, ...(over.missions?.[id] || {}) }));
const avgMission = { xp: M.reduce((s, m) => s + m.xp, 0) / M.length, shards: M.reduce((s, m) => s + m.shards, 0) / M.length };

// Profils de joueurs : jours joués par semaine, parties par jour joué, part des parties en ligne, missions faites par jour.
const PROFILES = {
  'Occasionnel': { days: 4, games: 2, pvp: 0.3, missions: 1.5, win: 0.5 },
  'Régulier': { days: 6, games: 4, pvp: 0.5, missions: 2.5, win: 0.5 },
  'Assidu': { days: 7, games: 8, pvp: 0.5, missions: 3, win: 0.5 },
};
const sets = DEFAULT_SETS.map(s => ({ id: s.id, cards: s.cards.slice() }));
const rnd = a => a[Math.floor(Math.random() * a.length)];

// levels : le joueur dépense aussi ses Éclats en niveaux de carte, une fois les sets ouverts complétés ; on suit alors jusqu'au jour maxDays.
function simulate(p, { set2Day = Infinity, set2Daily = Infinity, maxDays = 400, levels = false } = {}) {
  const kit = starterKit(rnd(STARTERS));
  const a = { cards: { ...kit.cards }, essence: {}, lvl: {}, shards: 0, level: 1, xp: 0, free: 0, wins: 0, games: 0, missions: 0, got: new Set(), done: {} };
  // Carte favorite : la première du deck de départ ; jour où ses doublons ont donné de quoi la monter au niveau maximum.
  const focus = kit.deck.cards[0], focusNeed = Array.from({ length: MAX_CARD_LEVEL - 1 }, (_, i) => levelCost(i + 2, R).essence).reduce((x, y) => x + y, 0);
  let focusEssence = 0;
  const out = { complete: {}, level: {}, shards: 0, cardsBought: 0, boostersBought: 0, dups: 0, cardLevels: {} };
  const open = day => sets.filter(s => s.id === 'base' || day >= set2Day);
  const daily = day => sets.filter(s => s.id === 'base' || day >= set2Daily);
  const own = ids => { let fresh = 0; for (const id of ids) { if (a.cards[id]) { gain(0, S.shardsPerDuplicate); a.essence[id] = (a.essence[id] || 0) + R.essencePerDuplicate; out.dups++; if (id === focus) focusEssence += R.essencePerDuplicate; } else { a.cards[id] = 1; fresh++; gain(R.xpNewCard, 0); } } return fresh; };
  function gain(xp, shards) {
    a.shards += shards; out.shards += shards; a.xp += xp;
    while (a.xp >= xpToNext(a.level, R)) { a.xp -= xpToNext(a.level, R); a.level++; a.shards += R.levelShards; out.shards += R.levelShards; if (R.boosterEvery && a.level % R.boosterEvery === 0) a.free++; }
  }
  function checks(day) {
    for (const s of sets) {
      for (const fam of new Set(s.cards.map(familyOf).filter(Boolean))) {
        const k = `${s.id}:${fam}`;
        if (!a.done[k] && s.cards.filter(id => familyOf(id) === fam).every(id => a.cards[id])) {
          a.done[k] = 1; gain(0, R.familyShards);
        }
      }
      if (!a.done[s.id] && s.cards.every(id => a.cards[id])) { a.done[s.id] = 1; out.complete[s.id] = day; gain(0, R.setShards); a.free += R.setBoosters; }
    }
    const stats = { level: a.level, wins: a.wins, games: a.games, missions: a.missions, cards: Object.keys(a.cards).length, pvpWins: a.wins / 2, pveWins: a.wins / 2 };
    for (const x of ACHIEVEMENTS) if (!a.done[x.id] && stats[x.stat] !== undefined && stats[x.stat] >= x.goal) { a.done[x.id] = 1; gain(0, x.shards); }
  }
  const missing = s => s.cards.filter(id => !a.cards[id]);
  for (let day = 1; day <= maxDays; day++) {
    if (Math.random() < p.days / 7) {
      const pool = daily(day).flatMap(s => s.cards), miss = pool.filter(id => !a.cards[id]);
      own([miss.length ? rnd(miss) : rnd(pool), ...Array.from({ length: BOOSTER_SIZE - 1 }, () => rnd(pool))]);
      for (let g = 0; g < p.games; g++) {
        const win = Math.random() < p.win, pvp = Math.random() < p.pvp;
        a.games++; if (win) a.wins++;
        if (g < R.gamesPerDay) gain(win ? (pvp ? R.xpPvpWin : R.xpPveWin) : (pvp ? R.xpPvpLoss : R.xpPveLoss), win ? (pvp ? R.shardsPvpWin : R.shardsPveWin) : R.shardsLoss);
      }
      const done = Math.min(R.missionsPerDay, Math.floor(p.missions) + (Math.random() < p.missions % 1 ? 1 : 0));
      for (let m = 0; m < done; m++) { a.missions++; gain(avgMission.xp, avgMission.shards); }
      checks(day);
      // Boosters offerts : ouverts dans le set ouvert où il manque le plus de cartes.
      while (a.free > 0) { const s = open(day).sort((x, y) => missing(y).length - missing(x).length)[0]; a.free--; own(Array.from({ length: S.boosterSize }, () => rnd(s.cards))); checks(day); }
      // Achats : cartes du jour manquantes, ou booster si un booster rapporte plus de cartes neuves par Éclat.
      for (const s of open(day)) {
        let offers = missing(s).sort(() => Math.random() - 0.5).slice(0, S.dailyCards);
        for (;;) {
          const miss = missing(s).length / s.cards.length;
          const boosterValue = (S.boosterSize * miss) / S.boosterPrice, cardValue = offers.length ? 1 / S.cardPrice : 0;
          if (!miss) break;
          if (boosterValue >= cardValue && a.shards >= S.boosterPrice) { a.shards -= S.boosterPrice; out.boostersBought++; own(Array.from({ length: S.boosterSize }, () => rnd(s.cards))); }
          else if (cardValue && a.shards >= S.cardPrice) { a.shards -= S.cardPrice; out.cardsBought++; own([offers.shift()]); }
          else break;
          checks(day);
        }
      }
      // Niveaux de carte : la carte la moins avancée qu'on peut payer ; sinon un booster pour ses doublons (et leur essence).
      if (levels && open(day).every(s => !missing(s).length)) for (;;) {
        const lv = id => a.lvl[id] || 1;
        const ok = Object.keys(a.cards).filter(id => lv(id) < MAX_CARD_LEVEL && (a.essence[id] || 0) >= levelCost(lv(id) + 1, R).essence && a.shards >= levelCost(lv(id) + 1, R).shards);
        if (!ok.length) {
          if (a.shards < S.boosterPrice) break;
          a.shards -= S.boosterPrice; out.boostersBought++; own(Array.from({ length: S.boosterSize }, () => rnd(sets[0].cards))); continue;
        }
        const id = ok.sort((x, y) => lv(x) - lv(y))[0], c = levelCost(lv(id) + 1, R);
        a.essence[id] -= c.essence; a.shards -= c.shards; a.lvl[id] = lv(id) + 1;
      }
    }
    for (const d of [7, 30, 60, 90]) if (day === d) out.level[d] = a.level;
    if (levels && [90, 180].includes(day)) out.cardLevels[day] = [2, 3, 4, 5].map(n => Object.values(a.lvl).filter(l => l >= n).length);
    if ((sets.every(s => out.complete[s.id]) || (set2Day === Infinity && out.complete.base)) && !out.days) out.days = day;
    if (!out.focus && focusEssence >= focusNeed) out.focus = day;
    out.last = day;
    if (out.days && day >= 30 && !levels) break;
  }
  return out;
}

const median = xs => { const s = xs.filter(x => x !== undefined).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : '—'; };
function table(title, opts) {
  const res = {};
  for (const [name, p] of Object.entries(PROFILES)) {
    const runs = Array.from({ length: RUNS }, () => simulate(p, opts));
    res[name] = {
      'Set de base (jours)': median(runs.map(r => r.complete.base)),
      ...(opts.set2Day < Infinity ? { 'Crépuscule (jours après ouverture)': median(runs.map(r => r.complete.set2 && r.complete.set2 - opts.set2Day)) } : {}),
      'Niveau à J7': median(runs.map(r => r.level[7])), 'Niveau à J30': median(runs.map(r => r.level[30])),
      'Éclats gagnés / jour': Math.round(median(runs.map(r => r.shards / r.last))),
      'Cartes achetées': median(runs.map(r => r.cardsBought)), 'Boosters achetés': median(runs.map(r => r.boostersBought)),
    };
  }
  console.log(`\n${title}`); console.table(res);
}

table('Set de base seul', {});
table('Crépuscule ouvert en boutique au jour 30, dans le booster quotidien au jour 60', { set2Day: 30, set2Daily: 60 });
table('Nouveau joueur, les deux sets déjà ouverts (Crépuscule en boutique seulement)', { set2Day: 1, set2Daily: Infinity });

// Niveaux de carte : Set de base seul, le joueur monte ses cartes une fois la collection complète.
const lv = {};
for (const [name, p] of Object.entries(PROFILES)) {
  const runs = Array.from({ length: RUNS }, () => simulate(p, { levels: true, maxDays: 365 }));
  const at = (d, i) => median(runs.map(r => r.cardLevels[d]?.[i]));
  lv[name] = { 'Doublons / jour': +median(runs.map(r => r.dups / r.last)).toFixed(1), 'Une carte précise au niv. 5 (jour)': median(runs.map(r => r.focus)),
    ...Object.fromEntries([90, 180].flatMap(d => [[`J${d} : niv. 2+`, at(d, 0)], [`J${d} : niv. 3+`, at(d, 1)], [`J${d} : niv. 4+`, at(d, 2)], [`J${d} : niv. 5`, at(d, 3)]])) };
}
console.log('\nNiveaux de carte (Set de base seul) : cartes à chaque niveau'); console.table(lv);
