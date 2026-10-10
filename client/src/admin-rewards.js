// Onglet Récompenses de /admin : courbe d'XP, gains des parties et des niveaux, missions quotidiennes, complétions, niveaux de carte, saisons classées, passe de saison et succès.
// Tout est enregistré dans le document « recompenses » ; les valeurs vides reprennent les valeurs par défaut.
import { MISSIONS, ACHIEVEMENTS, FAMILY_REWARDS, SET_REWARDS, FRAMES, CARD_LEVELS, xpToNext } from '@jeu/engine/rewards';
import { CARDS } from '@jeu/engine';
import { TIERS, seasonShardsKey, seasonPrismsKey } from '@jeu/engine/ranked';
import { PASS_KINDS, PASS_TIERS, SEASONS, passMissionLabel, refundTier } from '@jeu/engine/pass';

const GROUPS = [
  ['Niveau du compte', 'XP pour passer du niveau n au suivant : le plus petit entre « plafond » et « base + pas × (n − 1) ».', [
    ['xpBase', 'XP du niveau 1 au 2'], ['xpStep', 'XP de plus à chaque niveau'], ['xpCap', 'Plafond d\'XP par niveau'],
    ['levelShards', 'Éclats à chaque niveau'], ['boosterEvery', 'Un booster offert tous les … niveaux', '0 : jamais.'],
  ]],
  ['Parties', 'Un match nul compte comme une défaite. Au-delà du nombre de parties récompensées, une partie fait seulement avancer les missions.', [
    ['xpPvpWin', 'XP : victoire en ligne'], ['xpPvpLoss', 'XP : défaite en ligne'], ['xpPveWin', 'XP : victoire contre l\'IA'], ['xpPveLoss', 'XP : défaite contre l\'IA'],
    ['shardsPvpWin', 'Éclats : victoire en ligne'], ['shardsPveWin', 'Éclats : victoire contre l\'IA'], ['shardsLoss', 'Éclats : défaite'],
    ['gamesPerDay', 'Parties récompensées par jour'], ['xpNewCard', 'XP par nouvelle carte obtenue'],
  ]],
  ['Missions et complétions', 'Les cartes, titres, cadres et dos de carte des complétions sont fixes ; seuls les Éclats et boosters se règlent.', [
    ['missionsPerDay', 'Missions par jour', 'Entre 0 et 6.'], ['missionRerolls', 'Missions qu\'on peut changer par jour'],
    ['familyShards', 'Éclats : famille complétée dans un set'],
    ['setShards', 'Éclats : set complété'], ['setBoosters', 'Boosters offerts : set complété'],
  ]],
  ['Niveaux de carte', 'Purement cosmétiques. Chaque doublon donne de l\'essence de la carte (en plus des Éclats par doublon de l\'onglet Boutique) ; essence et Éclats font monter la carte : bronze, argent, or, puis astral avec un effet de mise en jeu.', [
    ['essencePerDuplicate', 'Essence par doublon'],
    ...[2, 3, 4, 5].flatMap(n => [[`lvl${n}Essence`, `Niveau ${n} (${CARD_LEVELS[n].name}) : essence`], [`lvl${n}Shards`, `Niveau ${n} (${CARD_LEVELS[n].name}) : Éclats`]]),
  ]],
  ['Mode classé', 'Éclats et Prismes (monnaie des arts alternatifs) reçus à la fin de chaque saison (un mois) selon le meilleur palier atteint. Les titres et cadres des paliers sont fixes.',
    TIERS.flatMap((t, i) => [[seasonShardsKey(i), `Éclats : saison finie en ${t.name}`], [seasonPrismsKey(i), `Prismes : saison finie en ${t.name}`]])],
  ['Calendrier du mois', 'Une récompense par jour de connexion, à récupérer le jour même ; tout repart le 1er du mois. Dimanche : des coffres d\'arts offerts, plus des Prismes les 2e et 4e dimanches.', [
    ['loginShards', 'Éclats : jour de semaine'], ['loginChests', 'Coffres d\'arts : dimanche'], ['loginPrisms', 'Prismes : 2e et 4e dimanches'],
  ]],
  ['Passe de saison', `Une saison par mois, ${PASS_TIERS} paliers. Les missions donnent l'XP de saison. Piste gratuite : des Éclats à chaque palier, des Prismes aux paliers 15 et 35, un coffre d'arts aux paliers 20 et 40, plus les cartes uniques et les cosmétiques. Piste premium : des Prismes à chaque palier, un coffre tous les 10 paliers, plus ses cosmétiques.`, [
    ['passTierXp', 'XP de saison par palier'], ['passDaily', 'Missions du passe par jour', 'Entre 0 et 6.'], ['passWeekly', 'Missions du passe par semaine', 'Entre 0 et 10.'],
    ['passXpDaily', 'XP de saison : mission du jour'], ['passXpWeekly', 'XP de saison : mission de la semaine'],
    ['passPrice', 'Prix du premium en Prismes'], ['passShards', 'Éclats : palier gratuit'], ['passPrisms', 'Prismes : paliers gratuits 15 et 35'], ['passChests', 'Coffres d\'arts : paliers gratuits 20 et 40'],
    ['passPremiumPrisms', 'Prismes : palier premium'], ['passPremiumChests', 'Coffres d\'arts : tous les 10 paliers premium'],
    ['passCardMonths', 'Mois avant que les cartes de saison rejoignent le Set de base', 'Comptés depuis le début de la saison : avec 3, une saison d\'octobre les ajoute en janvier. 0 : tout de suite.'],
  ]],
];

// XP de saison qu'un joueur qui fait tout peut gagner sur un mois de 31 jours : missions du jour, de la semaine (4,4 semaines) et de la saison.
const passMonthXp = (season, r) => Math.round(31 * r.passDaily * r.passXpDaily + 4.4 * r.passWeekly * r.passXpWeekly + season.missions.reduce((t, m) => t + r.passMissions[m.id].xp, 0));

export function rewardsTab({ call, render, say, esc, notice }) {
  const S = { data: null, err: '' };
  async function load() {
    try { S.data = await call('GET', '/api/admin/rewards'); S.err = ''; } catch (e) { S.err = e.message; }
    render();
  }
  function curve(r) {
    let total = 0; const at = {};
    for (let n = 1; n < 50; n++) { total += xpToNext(n, r); if ([5, 10, 20, 30, 50].includes(n + 1)) at[n + 1] = total; }
    return Object.entries(at).map(([lvl, xp]) => `niveau ${lvl} : ${xp.toLocaleString('fr-FR')} XP`).join(' · ');
  }
  function renderRewards() {
    if (S.err) return `<p class="err">${esc(S.err)}</p>`;
    if (!S.data) return '<p class="hint">Chargement…</p>';
    const r = S.data.rewards, d = S.data.defaults;
    const field = ([k, label, hint = '']) => `<div class="field"><label class="eyebrow" for="r-${k}">${label}</label>
      <input id="r-${k}" type="number" min="0" step="1" value="${r[k]}"><small class="hint">${hint} Par défaut : ${d[k]}.</small></div>`;
    const missions = Object.entries(MISSIONS).map(([id, m]) => { const v = r.missions[id], label = m.label(v.target, 'd\'une famille');
      return `<tr><td><label class="check"><input type="checkbox" id="m-${id}-on" ${v.on ? 'checked' : ''}>${esc(label)}</label></td>
        ${['target', 'xp', 'shards'].map(k => `<td><input id="m-${id}-${k}" type="number" min="0" step="1" value="${v[k]}" style="width:80px" aria-label="${k}"></td>`).join('')}</tr>`; }).join('');
    const achievements = ACHIEVEMENTS.map(x => `<tr><td>${esc(x.label)}</td><td class="hint">${[x.title ? `titre « ${esc(x.title)} »` : '', x.frame ? esc(FRAMES[x.frame]) : ''].filter(Boolean).join(' · ')}</td>
      <td><input id="a-${x.id}" type="number" min="0" step="1" value="${r.achievements[x.id]}" style="width:90px" aria-label="Éclats"></td>
      <td><input id="ap-${x.id}" type="number" min="0" step="1" value="${r.achievementPrisms[x.id]}" style="width:80px" aria-label="Prismes"></td>
      <td><input id="ac-${x.id}" type="number" min="0" max="10" step="1" value="${r.achievementChests[x.id]}" style="width:70px" aria-label="Coffres d'arts"></td></tr>`).join('');
    const pool = Object.entries(PASS_KINDS).map(([k, x]) => { const v = r.passPool[k];
      return `<tr><td>${esc(x.label('N', 'd\'une famille'))}</td>${['daily', 'weekly'].map(sc => `<td><input id="pp-${k}-${sc}" type="number" min="0" step="1" value="${v[sc] ?? 0}" style="width:80px" aria-label="${sc}"></td>`).join('')}</tr>`; }).join('');
    const seasons = SEASONS.map(x => `<h3 style="font-size:17px">${esc(x.name)} (${x.id})</h3>
      <p class="hint" style="margin:0">Le premium se rembourse ${refundTier(x, r) ? `au palier ${refundTier(x, r)}` : 'jamais avec ces réglages'} ; XP de saison possible sur le mois : environ ${passMonthXp(x, r).toLocaleString('fr-FR')} pour ${(PASS_TIERS * r.passTierXp).toLocaleString('fr-FR')} nécessaires.</p>
      <div class="scroll"><table class="admin"><thead><tr><th>Mission de saison</th><th>Objectif</th><th>XP</th></tr></thead><tbody>${x.missions.map(m => { const v = r.passMissions[m.id];
        return `<tr><td>${esc(passMissionLabel({ ...m, target: v.target }))}</td>${['target', 'xp'].map(k => `<td><input id="pm-${m.id}-${k}" type="number" min="0" step="1" value="${v[k]}" style="width:90px" aria-label="${k}"></td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`).join('');
    const fams = FAMILY_REWARDS.map(f => `<li>${esc(f.fam)} (${f.set === 'base' ? 'Set de base' : 'Crépuscule'}) : ${esc(CARDS[f.card]?.name || f.card)}, titre « ${esc(f.title)} »</li>`).join('');
    const sets = Object.entries(SET_REWARDS).map(([set, s]) => `<li>${set === 'base' ? 'Set de base' : 'Crépuscule'} : ${esc(CARDS[s.card]?.name || s.card)}, titre « ${esc(s.title)} », ${esc(FRAMES[s.frame])}</li>`).join('');
    return `${notice()}
    <form class="card-box" id="rewards">
      ${GROUPS.map(([title, hint, fields]) => `<h2 style="font-size:20px">${title}</h2><p class="hint" style="margin:0">${hint}</p><div class="grid2">${fields.map(field).join('')}</div>`).join('')}
      <p class="hint" style="margin:0">XP cumulée avec ces réglages : ${curve(r)}.</p>
      <h2 style="font-size:20px">Missions quotidiennes</h2>
      <p class="hint" style="margin:0">Décochez une mission pour ne plus la tirer. Elles sont tirées au hasard chaque jour parmi celles cochées.</p>
      <div class="scroll"><table class="admin"><thead><tr><th>Mission</th><th>Objectif</th><th>XP</th><th>Éclats</th></tr></thead><tbody>${missions}</tbody></table></div>
      <h2 style="font-size:20px">Missions du passe de saison</h2>
      <p class="hint" style="margin:0">Objectif de chaque sorte de mission quand elle est tirée pour le jour ou pour la semaine (0 : jamais tirée). Les missions de saison ont leur propre objectif et leur XP, par saison.</p>
      <div class="scroll"><table class="admin"><thead><tr><th>Mission</th><th>Objectif du jour</th><th>Objectif de la semaine</th></tr></thead><tbody>${pool}</tbody></table></div>
      ${seasons}
      <h2 style="font-size:20px">Succès</h2>
      <div class="scroll"><table class="admin"><thead><tr><th>Succès</th><th>Débloque</th><th>Éclats</th><th>Prismes</th><th>Coffres</th></tr></thead><tbody>${achievements}</tbody></table></div>
      <div class="row"><button class="btn primary" type="submit">Enregistrer les récompenses</button><button class="btn" type="button" data-act="rewards-defaults">Revenir aux valeurs par défaut</button></div>
      <p class="hint" style="margin:0">Les nouveaux réglages valent pour les prochaines récompenses ; les missions déjà tirées aujourd'hui gardent leurs valeurs.</p>
    </form>
    <div class="card-box"><h2 style="font-size:20px">Cartes de récompense</h2>
      <p class="hint" style="margin:0">Elles ne sortent d'aucun booster. Chaque famille complétée dans chaque set : sa carte, un titre et un dos de carte.</p>
      <ul class="games">${fams}</ul>
      <p class="hint" style="margin:0">Set complété : une carte Dieu pour le deck le plus faible du moment, un titre et un cadre.</p><ul class="games">${sets}</ul></div>`;
  }
  async function save(body, msg) {
    try { S.data = await call('POST', '/api/admin/rewards', body); say(msg); } catch (e) { say('', e.message); }
    render();
  }
  function onSubmit(id) {
    if (id !== 'rewards') return false;
    const v = k => document.getElementById(k);
    const body = Object.fromEntries(GROUPS.flatMap(g => g[2]).map(([k]) => [k, Number(v(`r-${k}`).value)]));
    body.missions = Object.fromEntries(Object.keys(MISSIONS).map(mid => [mid, { on: v(`m-${mid}-on`).checked,
      ...Object.fromEntries(['target', 'xp', 'shards'].map(k => [k, Number(v(`m-${mid}-${k}`).value)])) }]));
    body.passPool = Object.fromEntries(Object.keys(PASS_KINDS).map(k => [k, { daily: Number(v(`pp-${k}-daily`).value), weekly: Number(v(`pp-${k}-weekly`).value) }]));
    body.passMissions = Object.fromEntries(SEASONS.flatMap(x => x.missions).map(m => [m.id, { target: Number(v(`pm-${m.id}-target`).value), xp: Number(v(`pm-${m.id}-xp`).value) }]));
    body.achievements = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, Number(v(`a-${x.id}`).value)]));
    body.achievementPrisms = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, Number(v(`ap-${x.id}`).value)]));
    body.achievementChests = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, Number(v(`ac-${x.id}`).value)]));
    save(body, 'Récompenses enregistrées.');
    return true;
  }
  function onClick(t) {
    if (t.dataset.act !== 'rewards-defaults') return false;
    if (confirm('Remettre toutes les récompenses aux valeurs par défaut ?')) save({ reset: true }, 'Récompenses remises par défaut.');
    return true;
  }
  return { load, render: renderRewards, onSubmit, onClick, loaded: () => !!S.data };
}
