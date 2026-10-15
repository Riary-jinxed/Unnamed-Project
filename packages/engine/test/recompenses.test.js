// Réglages de l'économie : calendrier de connexion, magasins du boss et du casino (bilan d'octobre 2026).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REWARDS as R, MISSIONS, loginCalendar } from '../src/rewards.js';
import { BOSS_SHOP } from '../src/boss.js';
import { CASINO_SHOP } from '../src/casino.js';
import { SHOP } from '../src/collection.js';

describe('Économie', () => {
  test('calendrier : coffre les 1er, 3e et 5e dimanches, Prismes les 2e et 4e', () => {
    // Novembre 2026 : dimanches 1, 8, 15, 22 et 29.
    const sundays = loginCalendar('2026-11').filter(d => d.sunday);
    assert.deepEqual(sundays.map(d => d.day), [1, 8, 15, 22, 29]);
    assert.deepEqual(sundays.map(d => [d.chests, d.prisms]), [[R.loginChests, 0], [0, R.loginPrisms], [R.loginChests, 0], [0, R.loginPrisms], [R.loginChests, 0]]);
  });
  test('magasins : le booster n\'est pas plus cher que les Éclats qui le paient', () => {
    const boss = id => BOSS_SHOP.find(x => x.id === id), casino = id => CASINO_SHOP.find(x => x.id === id);
    // Boss : le booster coûte autant que l'offre de 300 Éclats. Casino : autant que 250 Éclats (le prix du booster en boutique).
    assert.equal(boss('booster').price, boss('shards').price);
    assert.equal(casino('boosters').price, casino('shards').price * SHOP.boosterPrice / casino('shards').n);
  });
  test('« Battre l\'IA 2 fois » paie comme « Gagner 2 parties »', () => {
    assert.equal(MISSIONS.win_pve.target, MISSIONS.win.target);
    assert.deepEqual([MISSIONS.win_pve.xp, MISSIONS.win_pve.shards], [MISSIONS.win.xp, MISSIONS.win.shards]);
  });
});
