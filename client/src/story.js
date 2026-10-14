// Quêtes d'histoire : liste des quêtes (campagnes et quêtes du moment), carte d'une quête avec ses chapitres, dialogues avant et
// après chaque combat, fin de partie. Les quêtes elles-mêmes (récit, adversaires, decks) sont dans packages/engine/src/story.js ;
// le serveur (server/src/story.js) tient la progression et donne les récompenses. Le combat se joue dans la page (solo.js) :
// main.js le lance avec gameOpts().
import { api } from './api.js';
import { esc, famStyle } from './common.js';
import { portraitHTML, sceneHTML } from './art.js';
import { CARDS, GENERALS, ZONE_NAMES, renderLog } from '@jeu/engine';
import { ARTS } from '@jeu/engine/arts';
import { TITLES } from '@jeu/engine/rewards';
import { LORE, NARRATOR, CARD_SHARDS, questById, isLimited, questTab, chapterDeck, foeDeck, castArt, castName, lineScene } from '@jeu/engine/story';

const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const frDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
// Force de l'IA en étoiles (essais de plans : 25 au premier chapitre, 220 au dernier).
const stars = tries => Math.max(1, Math.min(5, Math.round(tries / 50) + 1));
const starsHTML = tries => `<span class="sstars" aria-label="Difficulté ${stars(tries)} sur 5">${'★'.repeat(stars(tries))}<i>${'★'.repeat(5 - stars(tries))}</i></span>`;

// app : ce que main.js prête à l'écran (état ui, render, call, errLine, ico, play, anyCard, zoomKey, rewardItem, go : lance un chapitre).
export function createStory(app) {
  const { ui } = app;
  const S = ui.storyScreen = { data: null, sel: null, ch: null, talk: null, run: null, result: null, lore: false, tab: 'main' };
  const ico = k => app.ico(k);
  const info = id => S.data?.quests.find(x => x.id === id) || null;

  async function load() {
    try { S.data = await api('GET', '/api/story', undefined, ui.auth); } catch (e) { ui.error = e.message; }
    app.render();
  }

  // ---- Portraits ----
  // Portrait d'un personnage dans une quête : un général (avec l'art choisi pour la quête) ou une carte, recadrés sur le visage ;
  // une initiale tant qu'il n'a pas d'illustration.
  function face(q, who, ch = null, cls = '') {
    const g = GENERALS[who], c = CARDS[who], fam = g ? g.fam : c?.kw?.[0];
    return `<span class="gport ${cls}" style="${famStyle(fam)}">${portraitHTML(who, g ? castArt(q, who, ch) : null) || `<span class="gport-init">${esc(castName(who)[0])}</span>`}</span>`;
  }

  // ---- Carte d'une quête ----
  // Un décor provisoire dessiné en SVG (160 x 100), propre à chaque quête, puis le chemin et les chapitres par-dessus.
  // Les chapitres sont placés en % de la carte (at), le chemin suit les mêmes points.
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  const tree = (x, y, h, c) => `<path d="M${x} ${y - h}L${x + h * 0.38} ${y}H${x - h * 0.38}Z" fill="${c}"/><rect x="${x - 0.5}" y="${y}" width="1" height="${h * 0.18}" fill="#2a1a10"/>`;
  const DECOR = {
    razzia: () => { const r = rng(7);
      // Les Monts d'Or au fond à droite (chaîne lointaine, massif doré avec son repaire), puis les collines, la forêt, le bourg et les terriers.
      let s = '<path d="M64 52 L82 34 L92 41 L106 24 L118 35 L128 20 L138 30 L150 16 L160 22 V58 H64Z" fill="#7d8fa8" opacity=".55"/>';
      s += '<path d="M94 56 L108 34 L114 38 L126 16 L134 20 L141 5 L149 15 L154 11 L160 17 V60 H94Z" fill="#c4922e"/>';
      s += '<path d="M141 5 L149 15 L147 26 L156 36 L160 34 V60 H128 L138 40 L135 24Z" fill="#94641c"/><path d="M126 16 L134 20 L130 30 L122 44 L114 50 L118 34Z" fill="#a8761f"/>';
      s += '<path d="M141 5 L145 10 L141 12 L137 10Z M126 16 L129 19 L124 21Z M154 11 L157 15 L152 15Z" fill="#fff6cf"/>';
      s += '<path d="M112 46 l6 -6 4 3 6 -8 M136 44 l5 -7 3 4 5 -9 M146 30 l4 -6" stroke="#ffe27a" stroke-width=".45" fill="none" opacity=".75"/>';
      s += '<path d="M124 56 V51 a7 7 0 0 1 14 0 V56Z" fill="#241005"/><path d="M127 56 V52.5 a4 4 0 0 1 8 0 V56Z" fill="#ff9a1a" opacity=".45"/>';
      for (let i = 0; i < 9; i++) s += `<circle cx="${124 + r() * 14}" cy="${53 + r() * 3}" r="${0.6 + r() * 0.6}" fill="#ffd24a"/>`;
      // Vael'Thar qui tourne au-dessus de son repaire : ailes, cou, queue.
      s += '<g transform="translate(116 13)" fill="#3a2410" opacity=".85"><path d="M0 0 C-3 -5 -9 -6 -12 -4 C-8 -3 -6 -1 -5 1Z M3 0 C6 -5 12 -6 15 -4 C11 -3 9 -1 8 1Z"/>'
        + '<path d="M-5 1 C-1 -1 4 -1 8 1 C5 3 0 3 -5 1Z M8 1 l4 -1.5 l1 1Z M-5 1 C-9 2 -12 4 -15 3" stroke="#3a2410" stroke-width=".6"/></g>';
      s += '<path d="M0 62 Q30 48 62 57 T118 58 T160 58 V100 H0Z" fill="#5d6e2c"/><path d="M0 80 Q40 66 82 78 T160 72 V100 H0Z" fill="#46561f"/>';
      for (let i = 0; i < 16; i++) s += tree(98 + r() * 30, 47 + r() * 14, 5 + r() * 4, i % 3 ? '#2e4a22' : '#3a5a26');
      // Le Bourg-aux-Moutons : maisons aux toits rouges, clocher, moutons.
      [[44, 56], [50, 54], [57, 57], [63, 55]].forEach(([x, y]) => { s += `<rect x="${x}" y="${y}" width="5" height="4" fill="#d8c8a0"/><path d="M${x - 0.6} ${y}l3.1 -3 3.1 3Z" fill="#a8402a"/>`; });
      s += '<rect x="53" y="47" width="2.6" height="8" fill="#d8c8a0"/><path d="M52.6 47l1.7 -4 1.7 4Z" fill="#6a4a8a"/>';
      for (let i = 0; i < 5; i++) s += `<ellipse cx="${38 + r() * 34}" cy="${62 + r() * 6}" rx="1.3" ry=".9" fill="#f4f0e4"/>`;
      // La Grande Tablée : la fumée du feu de camp.
      s += '<circle cx="86" cy="76" r="1.6" fill="#ff8a2a"/><path d="M86 74 q-2 -4 1 -7 q-2 -4 1 -7" stroke="#d8d0c0" stroke-width="1.2" fill="none" opacity=".45"/>';
      // Les Terriers : buttes percées de trous.
      for (let i = 0; i < 4; i++) { const x = 6 + i * 9, y = 86 + (i % 2) * 4; s += `<ellipse cx="${x + 3}" cy="${y}" rx="4.6" ry="3" fill="#6a4a24"/><ellipse cx="${x + 3}" cy="${y + 0.6}" rx="1.8" ry="1.3" fill="#1e1208"/>`; }
      return s; },
    racines: () => { const r = rng(11); let s = '<path d="M0 40 Q80 30 160 40 V100 H0Z" fill="#1d3a20"/><path d="M-5 70 C30 60 50 90 90 76 S140 60 165 72" stroke="#3a7a9a" stroke-width="4" fill="none" opacity=".7"/>';
      for (let i = 0; i < 40; i++) s += tree(r() * 160, 30 + r() * 70, 6 + r() * 7, i % 3 ? '#1f5a2a' : '#2f6e30');
      s += '<circle cx="80" cy="18" r="16" fill="#2f6e30" opacity=".85"/><rect x="77" y="22" width="6" height="22" fill="#4a2e18"/>';
      return s; },
    pacte: () => { const r = rng(5); let s = '<rect y="30" width="160" height="70" fill="#2a0e10"/>';
      for (let i = 0; i < 9; i++) { const x = r() * 160, y = 35 + r() * 60; s += `<path d="M${x} ${y} l${6 + r() * 8} ${3 - r() * 6} l${5 + r() * 6} ${4 - r() * 8}" stroke="#ff6a2a" stroke-width="${0.6 + r()}" fill="none" opacity=".8"/>`; }
      for (let i = 0; i < 10; i++) { const x = r() * 160, y = 38 + r() * 58, h = 3 + r() * 5; s += `<path d="M${x} ${y}l1.5 -${h} 1.5 ${h}Z" fill="#160608"/>`; }
      s += '<path d="M128 30 v-16 h4 v-6 h3 v6 h4 v-10 h4 v10 h4 v16Z" fill="#140508"/>';
      return s; },
    halloween: () => { const r = rng(31); let s = '<circle cx="26" cy="20" r="13" fill="#f4e6b0" opacity=".9"/><circle cx="31" cy="17" r="12" fill="#2a1240" opacity=".35"/><path d="M0 60 Q40 50 80 60 T160 54 V100 H0Z" fill="#1e0f2e"/>';
      for (let i = 0; i < 30; i++) s += `<circle cx="${r() * 160}" cy="${r() * 40}" r="${0.3 + r() * 0.5}" fill="#fff" opacity="${0.4 + r() * 0.5}"/>`;
      for (let i = 0; i < 8; i++) { const x = 10 + r() * 140, y = 64 + r() * 30; s += `<ellipse cx="${x}" cy="${y}" rx="3" ry="2.4" fill="#e8742a"/><rect x="${x - 0.4}" y="${y - 3.2}" width="0.8" height="1.4" fill="#3a6a2a"/>`; }
      for (let i = 0; i < 6; i++) { const x = 40 + r() * 60, y = 50 + r() * 14; s += `<path d="M${x} ${y}v-4a2 2 0 0 1 4 0v4Z" fill="#4a4060"/>`; }
      return s; },
    eclipse: () => { const r = rng(19); let s = '<circle cx="140" cy="16" r="14" fill="#ff9a2a" opacity=".55"/><circle cx="140" cy="16" r="11" fill="#0a0410"/>';
      for (let i = 0; i < 40; i++) s += `<circle cx="${r() * 160}" cy="${r() * 50}" r="${0.3 + r() * 0.4}" fill="#ffd9a0" opacity="${0.3 + r() * 0.5}"/>`;
      s += '<path d="M0 70 L20 46 L34 60 L52 38 L70 62 L92 44 L110 64 L130 48 L160 66 V100 H0Z" fill="#1a0e22"/><path d="M0 86 Q50 74 100 86 T160 80 V100 H0Z" fill="#120818"/>';
      return s; },
    neon: () => { const r = rng(3); let s = '<rect y="56" width="160" height="44" fill="#0a1024"/>';
      for (let i = 0; i <= 16; i++) s += `<path d="M80 56 L${i * 10 - 0} 100" stroke="#2ad4ff" stroke-width=".25" opacity=".5"/>`;
      for (let i = 0; i < 6; i++) s += `<path d="M0 ${60 + i * i * 1.4}H160" stroke="#ff3ad0" stroke-width=".25" opacity=".45"/>`;
      for (let i = 0; i < 22; i++) { const x = i * 7.5, h = 12 + r() * 34; s += `<rect x="${x}" y="${56 - h}" width="6.5" height="${h}" fill="#101a3a"/>`;
        for (let k = 0; k < 4; k++) if (r() > 0.5) s += `<rect x="${x + 1 + (k % 2) * 2.5}" y="${56 - h + 3 + k * 4}" width="1.4" height="1.4" fill="${r() > 0.5 ? '#2ad4ff' : '#ff3ad0'}"/>`; }
      return s; },
  };
  const SKY = { razzia: ['#9ac0d8', '#e8d2a0'], racines: ['#20382a', '#3a5a2a'], pacte: ['#1a0608', '#4a1414'], halloween: ['#140a26', '#3a1a4a'], eclipse: ['#05030a', '#2a1030'], neon: ['#05081a', '#1a0a3a'] };
  // Chemin entre deux étapes : une courbe douce, qui ondule d'un côté puis de l'autre.
  function route(pts) {
    return pts.map(([x, y], i) => { if (!i) return `M${x} ${y}`;
      const [px, py] = pts[i - 1], mx = (px + x) / 2, my = (py + y) / 2, dx = x - px, dy = y - py, k = (i % 2 ? 1 : -1) * 0.18;
      return `Q${mx - dy * k} ${my + dx * k} ${x} ${y}`; }).join(' ');
  }
  function mapHTML(q, I, sel) {
    const pts = q.chapters.map(ch => [ch.at[0] * 1.6, ch.at[1]]), won = I.won;
    const [top, bottom] = SKY[q.map] || SKY.razzia;
    const svg = `<svg class="smap-bg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="sky-${q.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
        <radialGradient id="vig-${q.id}"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>
      <rect width="160" height="100" fill="url(#sky-${q.id})"/>${(DECOR[q.map] || DECOR.razzia)()}
      <path d="${route(pts)}" class="sroute" fill="none"/>
      ${won > 0 ? `<path d="${route(pts.slice(0, Math.min(won + 1, pts.length)))}" class="sroute done" fill="none"/>` : ''}
      <rect width="160" height="100" fill="url(#vig-${q.id})"/></svg>`;
    const node = (ch, i) => {
      const state = i < won ? 'done' : i === won ? 'next' : 'locked';
      return `<button class="snode ${state} ${i === sel ? 'sel' : ''}" style="left:${ch.at[0]}%;top:${ch.at[1]}%" data-act="story-ch" data-i="${i}"
        aria-label="Chapitre ${i + 1} : ${esc(ch.name)}${state === 'done' ? ', gagné' : state === 'locked' ? ', pas encore ouvert' : ', à jouer'}">
        ${face(q, ch.foe.general, ch)}<span class="snum num">${state === 'done' ? '✓' : i + 1}</span><span class="splace ${ch.at[0] > 78 ? 'r' : ch.at[0] < 18 ? 'l' : ''}">${esc(ch.place)}</span></button>`;
    };
    return `<div class="smap smap-${q.map}" style="${famStyle(q.fam)}">${svg}${q.chapters.map(node).join('')}</div>`;
  }

  // ---- Récompenses ----
  function rewardChips(r) {
    const card = r.card && CARDS[r.card], art = r.art && ARTS[r.art];
    return [r.shards ? `<span class="chip num">${ico('shard')}${r.shards}</span>` : '', r.prisms ? `<span class="chip num">${ico('prism')}${r.prisms}</span>` : '',
      r.xp ? `<span class="chip num">${r.xp} XP</span>` : '', r.boosters ? `<span class="chip">${plural(r.boosters, 'booster')} offert${r.boosters > 1 ? 's' : ''}</span>` : '',
      r.chests ? `<span class="chip">${ico('chest')}${plural(r.chests, 'coffre')} d'arts</span>` : '',
      card ? `<button class="chip sgift" data-zoom="${app.zoomKey(r.card)}">Carte · ${esc(card.name)}</button>` : '',
      art ? `<button class="chip sgift" data-zoom="${app.zoomKey(art.card, art.id)}">Art Promo · ${esc(art.name)}</button>` : '',
      r.title ? `<span class="chip sgift">Titre « ${esc(TITLES[r.title] || r.title)} »</span>` : ''].filter(Boolean).join('');
  }

  // ---- Écran : liste des quêtes ----
  function questCard(I) {
    const q = questById(I.id); if (!q) return '';
    if (I.state === 'soon') return `<div class="squest soon smap-${q.map}"><span class="squest-art"></span><div class="squest-tx"><span class="eyebrow">Bientôt · le ${esc(frDate(I.from))}</span>
      <b>${esc(q.name)}</b><small class="hint">Une nouvelle quête arrive. Revenez vite !</small></div></div>`;
    const done = I.won >= I.total;
    return `<button class="squest smap-${q.map} ${done ? 'done' : ''}" data-act="story-open" data-quest="${q.id}" style="${famStyle(q.fam)}">
      <span class="squest-art">${face(q, q.hero, null, 'squest-face')}</span>
      <span class="squest-tx"><span class="eyebrow">${eyebrow(q, I)}</span>
        <b>${esc(q.name)}</b><small class="hint">${esc(q.tagline)}</small>
        <span class="squest-foot num">${done ? 'Terminée ✓' : `Chapitre ${I.won + 1} sur ${I.total}`}</span>
        <span class="bar" aria-hidden="true"><span style="width:${Math.round(100 * I.won / I.total)}%"></span></span></span></button>`;
  }
  // Deux onglets : l'histoire principale (campagnes, puis les quêtes d'événement qui l'ont fait avancer) et les événements en cours.
  const tabOf = I => questTab(questById(I.id), I.state);
  function listHTML() {
    const D = S.data, all = D.quests.filter(x => questById(x.id)), main = all.filter(x => tabOf(x) === 'main'), events = all.filter(x => tabOf(x) === 'event');
    const camps = main.filter(x => x.state === 'open'), suite = main.filter(x => x.state === 'archive');
    const live = events.filter(x => x.state === 'open' && x.won < x.total).length;
    const tabs = `<div class="seg tabs stabs" role="tablist">${[['main', 'Histoire principale', 0], ['event', 'Événements', live]].map(([k, l, n]) =>
      `<button class="${S.tab === k ? 'on' : ''}" role="tab" aria-selected="${S.tab === k}" data-act="story-tab" data-tab="${k}">${l}${n ? ` <span class="dot num">${n}</span>` : ''}</button>`).join('')}</div>`;
    const body = S.tab === 'event'
      ? `<p class="hint" style="margin:0">Des quêtes à durée limitée, avec leurs récompenses à elles : carte de quête, art Promo et titre. Celles qui font avancer l'histoire rejoignent l'histoire principale à la fin de l'événement, sans l'art Promo.</p>
        ${events.length ? `<div class="squests">${events.map(questCard).join('')}</div>` : '<p class="wait">Pas d\'événement en ce moment. Revenez bientôt !</p>'}`
      : `<section class="card-box slore"><span class="eyebrow">Le monde d'Éclats</span><h2>${esc(LORE.title)}</h2>
          ${(S.lore ? LORE.text : LORE.text.slice(0, 1)).map(p => `<p>${esc(p)}</p>`).join('')}
          <button class="linkbtn" data-act="story-lore">${S.lore ? 'Réduire' : 'Lire la suite'}</button></section>
        <div class="gal-h">Campagnes</div><p class="hint" style="margin:0">Une campagne par deck de départ. Vous jouez le deck du héros : pas besoin d'avoir ses cartes.</p>
        <div class="squests">${camps.map(questCard).join('')}</div>
        ${suite.length ? `<div class="gal-h">La suite de l'histoire</div><p class="hint" style="margin:0">Les événements passés qui ont changé les Terres d'Aube, à rejouer quand vous voulez.</p>
          <div class="squests">${suite.map(questCard).join('')}</div>` : ''}`;
    return `${tabs}${body}`;
  }
  // Petite ligne au-dessus du nom d'une quête.
  function eyebrow(q, I, long = false) {
    if (I.state === 'archive') return `Suite de l'histoire · ${esc(q.fam)}`;
    if (isLimited(q)) return long ? `Événement · jusqu'au ${esc(frDate(I.to))}` : `Événement · encore ${plural(I.daysLeft, 'jour')}`;
    return `Campagne · ${esc(q.fam)}`;
  }

  // ---- Écran : une quête ----
  const nextOf = I => Math.min(I.won, I.total - 1);
  function chapterHTML(q, I, i) {
    const ch = q.chapters[i], won = i < I.won, locked = i > I.won, r = I.rewards[i] || {};
    const deck = chapterDeck(q, i), joined = q.chapters.slice(0, i).filter(c => c.join).map(c => CARDS[c.join.card].name);
    return `<div class="card-box schap" style="${famStyle(GENERALS[ch.foe.general]?.fam)}">
      <span class="eyebrow">Chapitre ${i + 1} sur ${q.chapters.length} · ${esc(ch.place)}</span><h2>${esc(ch.name)}</h2>
      <div class="sfoe">${face(q, ch.foe.general, ch)}<div><small class="hint">Adversaire</small><b>${esc(ch.foe.name)}</b>
        <small class="hint">${starsHTML(ch.foe.tries)}${ch.foe.bonus ? ' · ses zones commencent avec +1' : ''}</small></div></div>
      <div class="srew"><small class="hint">${won ? 'Récompense obtenue ✓' : 'Récompense de la première victoire'}</small><div class="srew-row ${won ? 'got' : ''}">${rewardChips(r) || '<span class="hint">Aucune</span>'}</div></div>
      ${ch.join ? `<p class="hint" style="margin:0">Victoire : <b>${esc(CARDS[ch.join.card].name)}</b> rejoint votre deck pour la suite.</p>` : ''}
      <p class="hint" style="margin:0">Votre deck : <b>${esc(deck.name)}</b> avec ${esc(GENERALS[deck.general].name)}${joined.length ? `, renforcé par ${joined.map(esc).join(', ')}` : ''}.
        <button class="linkbtn" data-act="story-deck" data-i="${i}">Voir le deck</button></p>
      <button class="playbtn splay" data-act="story-fight" data-i="${i}" ${locked || ui.busy ? 'disabled' : ''}><span>${locked ? 'Verrouillé' : won ? 'Rejouer' : 'Combattre'}</span>
        <small>${locked ? `Gagnez d'abord « ${esc(q.chapters[i - 1].name)} »` : won ? 'Sans nouvelle récompense' : `${esc(ch.foe.name)} vous attend`}</small></button></div>`;
  }
  function questHTML(q, I) {
    const sel = S.ch ?? nextOf(I);
    const note = I.state === 'open' && isLimited(q) ? (q.canon
      ? 'Cette quête fait avancer l\'histoire : à la fin de l\'événement, elle rejoindra l\'histoire principale, sans son art Promo, et sa carte arrivera dans le booster du Set de base.'
      : 'Une quête hors de l\'histoire principale : elle disparaît à la fin de l\'événement, avec ses récompenses.')
      : I.state === 'archive' ? `Version définitive d'un événement passé : son art Promo n'est plus à gagner, et sa carte de quête, désormais dans le booster du Set de base, est remplacée par ${CARD_SHARDS} Éclats.` : '';
    return `<div class="squest-head" style="${famStyle(q.fam)}"><span class="eyebrow">${eyebrow(q, I, true)}</span>
        <p class="sprologue">${esc(q.prologue)}</p>${note ? `<p class="hint" style="margin:0">${note}</p>` : ''}</div>
      ${mapHTML(q, I, sel)}
      <p class="hint num" style="margin:0">${I.won >= I.total ? 'Quête terminée ✓ : chaque chapitre peut se rejouer.' : `${I.won} chapitre${I.won > 1 ? 's' : ''} gagné${I.won > 1 ? 's' : ''} sur ${I.total}. Touchez une étape de la carte.`}</p>
      ${chapterHTML(q, I, sel)}`;
  }

  function screen() {
    const q = S.sel && questById(S.sel), I = q && info(q.id);
    const back = q ? 'story-back' : 'home';
    const head = `<div class="top"><button class="btn icon" data-act="${back}" aria-label="${q ? 'Retour aux quêtes' : 'Retour à l\'accueil'}">‹</button><span class="title">${q ? esc(q.name) : 'Histoire'}</span></div>`;
    if (!S.data) return `${head}${app.errLine()}<p class="wait">Chargement…</p>`;
    if (q && !I) { S.sel = null; return `${head}${app.errLine()}${listHTML()}`; }
    return `${head}${app.errLine()}${q ? questHTML(q, I) : listHTML()}`;
  }

  // ---- Dialogues ----
  // Une réplique à la fois, avec le portrait de celui qui parle ; la narration s'affiche comme un parchemin.
  // En tête, l'illustration du lieu (ou celle de la réplique) ; sans image, le ciel de la carte de la quête.
  function sceneBox(q, ch, line) {
    const id = lineScene(ch, line), img = id ? sceneHTML(id) : '';
    return `<div class="stalk-scene smap-${q.map} ${img ? '' : 'empty'}" aria-hidden="true">${img}<span class="stalk-place">${esc(ch.place)}</span></div>`;
  }
  function talkHTML() {
    const T = S.talk, q = questById(T.quest), ch = q.chapters[T.i], line = T.lines[T.n], [who, text] = line, last = T.n === T.lines.length - 1;
    const narr = who === NARRATOR;
    return `<div class="sheet stalk-sheet"><div class="panel stalk ${narr ? 'narr' : ''}" role="dialog" aria-label="${esc(ch.name)}">
      ${sceneBox(q, ch, line)}
      <span class="eyebrow">Chapitre ${T.i + 1} · ${esc(ch.name)}</span>
      <div class="stalk-body">${narr ? '' : face(q, who, ch, 'stalk-face')}<div class="stalk-tx">${narr ? '' : `<b>${esc(castName(who))}</b>`}<p>${esc(text)}</p></div></div>
      <div class="stalk-dots" aria-hidden="true">${T.lines.map((_, k) => `<i class="${k <= T.n ? 'on' : ''}"></i>`).join('')}</div>
      <div class="row"><button class="btn" data-act="story-skip">Passer</button><button class="btn primary" data-act="story-talk">${last ? 'Au combat !' : 'Suivant'}</button></div></div></div>`;
  }

  // ---- Fin d'un combat ----
  function endHTML(v) {
    const R = S.run, q = R && questById(R.quest), ch = q?.chapters[R.i]; if (!ch) return '';
    const r = v.result, s = v.seat, win = r.winner === s;
    const zs = [0, 1, 2].map(z => `<div class="${v.me.zonePower[z] > v.foe.zonePower[z] ? 'me' : v.me.zonePower[z] < v.foe.zonePower[z] ? 'foe' : ''}"><div class="eyebrow">${ZONE_NAMES[z]}</div><b>${v.me.zonePower[z]}</b> contre ${v.foe.zonePower[z]}</div>`).join('');
    const reason = esc(renderLog(r.reason, s, v.names));
    if (!win) return `<div class="sheet"><div class="panel end send"><span class="eyebrow">${esc(q.name)} · chapitre ${R.i + 1}</span><h2>${r.winner < 0 ? 'Match nul' : 'Défaite'}</h2>
      <p style="margin:0">${reason}.</p><div class="zs">${zs}</div>
      <p class="hint" style="margin:0">Il faut gagner pour avancer dans l'histoire. ${ch.foe.bonus ? 'Ses zones partent avec +1 : visez deux zones et laissez la troisième.' : 'Une autre pioche, une autre partie : réessayez !'}</p>
      <div class="row"><button class="btn primary" data-act="again" ${ui.rematchAsked ? 'disabled' : ''}>Réessayer</button><button class="btn" data-act="story-map">Retour à la carte</button><button class="btn" data-act="log">Voir le journal</button></div></div></div>`;
    const res = S.result, done = res?.done, next = R.i + 1 < q.chapters.length;
    const lines = ch.outro.map(([who, text]) => who === NARRATOR ? `<p class="soutro narr">${esc(text)}</p>`
      : `<div class="soutro">${face(q, who, ch)}<p><b>${esc(castName(who))}</b>${esc(text)}</p></div>`).join('');
    const gain = !res ? '<p class="hint" style="margin:0">Enregistrement de la victoire…</p>'
      : res.reward ? `<div class="rewards">${app.rewardItem({ ...res.reward, label: 'Récompense du chapitre' })}</div>`
        : '<p class="hint" style="margin:0">Chapitre déjà gagné : pas de nouvelle récompense.</p>';
    return `<div class="sheet"><div class="panel end send win"><span class="eyebrow">${esc(q.name)} · chapitre ${R.i + 1}</span><h2>Victoire</h2>
      <p style="margin:0">${reason}.</p><div class="zs">${zs}</div>
      <div class="soutros">${lines}</div>
      ${ch.join && res?.reward ? `<p style="margin:0">Nouvel allié : <b>${esc(CARDS[ch.join.card].name)}</b> rejoint votre deck.</p>` : ''}
      ${gain}${done ? `<p class="sdone"><b>Quête terminée !</b> ${isLimited(q) ? 'Ses récompenses sont à vous pour de bon.' : 'Les autres campagnes racontent la même histoire, vue d\'ailleurs.'}</p>` : ''}
      <div class="row"><button class="btn primary" data-act="story-map" ${res ? '' : 'disabled'}>${next ? 'Chapitre suivant' : 'Retour à la carte'}</button><button class="btn" data-act="log">Voir le journal</button></div></div></div>`;
  }

  // ---- Partie ----
  // Ce que main.js passe à startSolo pour jouer le chapitre i : decks, nom et force de l'adversaire, bonus de zone, arts, fin.
  function gameOpts(quest, i, name) {
    const q = questById(quest), ch = q.chapters[i];
    const arts = Object.fromEntries([ch.foe.general].map(g => [g, castArt(q, g, ch)]).filter(([, a]) => a));
    S.run = { quest, i }; S.result = null;
    return { name, deck: chapterDeck(q, i), foe: foeDeck(ch), foeName: ch.foe.name, tries: ch.foe.tries,
      badges: Object.keys(arts).length ? [null, { arts, looks: {}, borders: {} }] : null,
      setup: st => { if (ch.foe.bonus) ch.foe.bonus.forEach((n, z) => { st.p[1].zoneBonus[z] += n; }); },
      onOver: res => over(quest, i, res) };
  }
  // Fin du combat : une victoire est envoyée au serveur, qui donne la récompense la première fois.
  async function over(quest, i, res) {
    if (res.winner !== 0 || !ui.auth) return;
    try {
      const r = await api('POST', '/api/story/win', { quest, chapter: i }, ui.auth);
      S.result = { reward: r.reward, done: r.done, first: !!r.reward }; S.data = r.story;
      if (r.account) app.setAccount(r.account);
      if (r.reward) app.play('levelup');
    } catch (e) { S.result = { reward: null }; ui.error = e.message; }
    app.render();
  }

  // ---- Clics ----
  function open(quest) {
    const I = info(quest); if (!I) return;
    S.sel = quest; S.ch = null; S.tab = tabOf(I); ui.error = ''; app.play('pick'); app.render();
  }
  function fight(i) {
    const q = questById(S.sel), I = info(S.sel); if (!q || !I || i > I.won) return;
    S.talk = { quest: q.id, i, n: 0, lines: q.chapters[i].intro };
    ui.sheet = 'story-talk'; app.play('pick'); app.render();
  }
  function click(a, ds) {
    if (a === 'story') { app.leaveGame?.(); ui.screen = 'story'; ui.sheet = null; ui.error = ''; if (ds.quest) { S.sel = ds.quest; S.ch = null; S.tab = ds.tab || 'main'; } load(); app.render(); }
    else if (a === 'story-open') open(ds.quest);
    else if (a === 'story-back') { S.sel = null; S.ch = null; app.render(); }
    else if (a === 'story-lore') { S.lore = !S.lore; app.render(); }
    else if (a === 'story-tab') { S.tab = ds.tab === 'event' ? 'event' : 'main'; app.play('pick'); app.render(); }
    else if (a === 'story-ch') { S.ch = Number(ds.i); app.play('pick'); app.render(); }
    else if (a === 'story-fight' && !ui.busy) fight(Number(ds.i));
    else if (a === 'story-talk') { const T = S.talk; if (!T) return true; if (T.n < T.lines.length - 1) { T.n++; app.play('flip'); app.render(); } else start(); }
    else if (a === 'story-skip') start();
    else if (a === 'story-deck') { S.deckOf = Number(ds.i); ui.sheet = 'story-deck'; app.render(); }
    else if (a === 'story-map') {
      // Retour à la carte : sur le chapitre suivant après une victoire.
      const R = S.run; if (R) { S.sel = R.quest; S.ch = null; }
      app.quit();
    }
    else return false;
    return true;
  }
  function start() {
    const T = S.talk; S.talk = null; ui.sheet = null;
    if (T) app.go(T.quest, T.i);
  }
  // Deck du chapitre en feuille : général, terrains et cartes, avec les alliés rejoints.
  function deckSheet() {
    const q = questById(S.sel); if (!q) return '';
    const d = chapterDeck(q, S.deckOf || 0), allies = new Set(q.chapters.map(c => c.join?.card).filter(Boolean));
    return `<div class="sheet" data-act="close"><div class="panel" data-stop="1" role="dialog" aria-label="Deck de la quête"><div class="ph"><h2>${esc(d.name)}</h2><button class="btn" data-act="close">Fermer</button></div>
      <p class="hint" style="margin:0">Le deck du héros pour ce chapitre. Il ne dépend pas de votre collection, et les alliés gagnés en chemin le renforcent.</p>
      <div class="gallery sdeck"><div class="bcard">${app.anyCard(d.general)}</div>${d.cards.map(id => `<div class="bcard">${allies.has(id) ? '<span class="new">Allié</span>' : ''}${app.anyCard(id)}</div>`).join('')}</div></div></div>`;
  }

  return {
    screen, click, endHTML, gameOpts,
    sheet() { if (ui.sheet === 'story-talk' && S.talk) return talkHTML(); if (ui.sheet === 'story-deck') return deckSheet(); return null; },
    // Partie relancée (Réessayer) : la victoire précédente n'est plus affichée.
    rematched() { S.result = null; },
    // Libellé de la partie dans la barre du haut.
    label() { const q = S.run && questById(S.run.quest); return q ? `${q.name} · ${S.run.i + 1}/${q.chapters.length}` : 'Histoire'; },
    // Tuile de l'accueil : la quête à suivre (la quête du moment d'abord).
    tile(account) {
      const t = account.storyTile; if (!t) return '';
      const q = t.id && questById(t.id);
      if (!q) return `<button class="tile stile" data-act="story"><span class="eyebrow">Histoire</span><b>Campagnes</b><span class="tile-foot num">${t.done ? `${t.done} terminée${t.done > 1 ? 's' : ''} ✓` : 'Le monde d\'Éclats'}</span></button>`;
      const live = t.daysLeft != null;
      return `<button class="tile stile smap-${q.map} todo" data-act="story" data-quest="${q.id}" data-tab="${live ? 'event' : 'main'}" style="${famStyle(q.fam)}"><span class="stile-art">${face(q, q.hero)}</span>
        <span class="eyebrow">${live ? `Événement · ${t.daysLeft} j` : 'Histoire'}</span><b>${esc(q.name)}</b>
        <span class="tile-foot num">Chapitre ${t.won + 1}/${t.total}</span><span class="bar" aria-hidden="true"><span style="width:${Math.round(100 * t.won / t.total)}%"></span></span></button>`;
    },
    reload: load,
    stop() { Object.assign(S, { data: null, sel: null, ch: null, talk: null, run: null, result: null }); },
  };
}
