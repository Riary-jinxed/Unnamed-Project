// Voile de chargement : couvre l'écran pendant l'ouverture de l'appli, l'entrée en partie et le retour au salon,
// avec une astuce qui change toutes les quelques secondes. Écrit en HTML et CSS (veil.css, chargé par index.html) : il s'affiche avant PixiJS,
// que l'ouverture charge plus tard. Au démarrage, il est déjà dans index.html, avant même que le script arrive.
//
// cover({ label, tips, run, until, ready, min }) : le voile monte (s'il n'est pas déjà là), puis `run()` s'exécute dessous ;
// à chaque rendu, `check()` regarde `until()` ; une fois vrai, on attend `ready()` (le plateau PixiJS, les polices…)
// et au moins `min` ms d'affichage, puis le voile s'efface. Il s'efface de toute façon au bout de 12 s.
import { rich, famStyle } from './common.js';

// jeu : règles et conseils de partie ; menu : collection, boutique, progression. Le texte passe par rich() (mots-clés en gras).
const TIPS = [
  { k: 'jeu', t: 'Gagnez au moins 2 zones sur 3 à la fin du tour 7. Sinon, la puissance totale des trois zones départage.' },
  { k: 'jeu', t: 'Au tour 5, vous avez 5 sceaux : posez plusieurs petites cartes ou une grosse, tant qu\'il vous en reste.' },
  { k: 'jeu', t: 'Touchez deux fois une carte pour la voir en grand, même une carte de l\'adversaire ou un terrain.' },
  { k: 'jeu', t: 'Une carte posée ce tour se reprend en main d\'une touche, tant que vous n\'avez pas validé.' },
  { k: 'jeu', t: 'Le joueur qui mène révèle ses cartes en premier : celui qui est derrière voit venir le coup.' },
  { k: 'jeu', t: 'Votre général s\'active une seule fois par partie : touchez-le deux fois pendant la préparation. Gardez-le pour le bon moment.' },
  { k: 'jeu', t: 'La main est limitée à 7 cartes : une carte piochée en trop part à la défausse.' },
  { k: 'jeu', t: 'Aux tours 1, 2 et 3, un terrain de votre deck se révèle dans une de vos zones et y reste jusqu\'à la fin.' },
  { k: 'jeu', t: 'Chaque zone a 4 emplacements de votre côté : une zone pleine ne prend plus de carte.' },
  { k: 'jeu', t: 'Une carte à Coût X prend tous vos sceaux restants : posez-la en dernier.' },
  { k: 'jeu', t: 'Abandonner une zone perdue d\'avance pour renforcer les deux autres est souvent la clé de la victoire.' },
  { k: 'jeu', f: 'Ange', t: 'Anges : la Grâce se déclenche en fin de tour si vous avez dépensé tous vos sceaux.' },
  { k: 'jeu', f: 'Démon', t: 'Démons : un Sacrifice détruit vos créatures les plus faibles de la zone. S\'il en manque, c\'est la carte elle-même qui part.' },
  { k: 'jeu', f: 'Gobelin', t: 'Gobelins : une seule Horde par zone. Chaque nouvelle Horde renforce celle qui est déjà là.' },
  { k: 'jeu', f: 'Elfe', t: 'Elfes : une créature marquée ⇄ change de zone pendant la préparation et libère sa place dès ce tour.' },
  { k: 'jeu', f: 'Dragon', t: 'Dragons : les sceaux que vous ne dépensez pas remplissent votre Trésor, et vos Dragons en profitent.' },
  { k: 'jeu', f: 'Mort-vivant', t: 'Morts-vivants : une carte avec Relève défaussée de votre main entre en jeu gratuitement, avec +1.' },
  { k: 'jeu', f: 'Vampire', t: 'Vampires : le Drain peut viser une carte de la main ou du deck adverse, qui arrivera affaiblie.' },
  { k: 'menu', t: 'Le booster du jour est offert : revenez chaque jour pour l\'ouvrir.' },
  { k: 'menu', t: 'Chaque doublon tiré d\'un booster rapporte des Éclats et de l\'essence pour faire monter vos cartes de niveau.' },
  { k: 'menu', t: 'Une carte qui monte de niveau change de bordure, du bronze jusqu\'à l\'astral.' },
  { k: 'menu', t: 'Le calendrier du mois offre une récompense chaque jour, et un coffre le dimanche.' },
  { k: 'menu', t: 'Les Prismes achètent des arts alternatifs. Le rayon Change les transforme en Éclats si besoin.' },
  { k: 'menu', t: 'Les missions de l\'accueil font monter votre niveau plus vite.' },
  { k: 'menu', t: 'Le codex, dans « Apprendre », explique chaque mot-clé avec des cartes d\'exemple.' },
  { k: 'menu', t: 'Défiez un ami depuis l\'onglet Amis, en partie normale ou classée.' },
  { k: 'menu', t: 'En classé, quitter une partie en cours compte comme une défaite.' },
];
const TIP_MS = 5200, IN_MS = 240, OUT_MS = 460, MAX_MS = 12000;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

let root = document.getElementById('veil');
// off : caché ; in : en train de monter ; on : couvre l'écran ; out : en train de s'effacer.
let state = root?.classList.contains('on') ? 'on' : 'off', shownAt = 0, job = null, tipTimer = null, lastTip = -1, kinds = null;

function make() {
  root = document.createElement('div'); root.id = 'veil'; root.className = 'veil';
  root.innerHTML = `<div class="veil-embers" aria-hidden="true">${'<i></i>'.repeat(12)}</div>
    <div class="veil-in"><div class="veil-emblem" aria-hidden="true"><i></i></div><div class="veil-title">Jeu de cartes</div>
    <div class="veil-bar"><i></i></div><p class="veil-label"></p></div>
    <div class="veil-tip"><span class="eyebrow">Astuce</span><p></p></div>`;
  root.setAttribute('role', 'status');
  document.body.append(root);
  return root;
}
const $ = sel => (root || make()).querySelector(sel);

// Une astuce au hasard (jamais deux fois la même d'affilée), dans les familles demandées.
function nextTip() {
  const pool = TIPS.map((x, i) => i).filter(i => !kinds || kinds.includes(TIPS[i].k));
  let i = pool[Math.floor(Math.random() * pool.length)];
  if (i === lastTip && pool.length > 1) i = pool[(pool.indexOf(i) + 1) % pool.length];
  lastTip = i;
  const tip = $('.veil-tip'), p = tip.querySelector('p'), x = TIPS[i];
  const show = () => { p.innerHTML = rich(x.t); tip.setAttribute('style', x.f ? famStyle(x.f) : ''); tip.classList.toggle('fam', !!x.f); tip.classList.add('shown'); };
  if (!tip.classList.contains('shown') || reduce()) { show(); return; }
  tip.classList.remove('shown'); setTimeout(show, 260);
}
function tipsOn() { clearInterval(tipTimer); nextTip(); tipTimer = setInterval(nextTip, TIP_MS); }

// Avancement (0 à 1) et texte sous la barre ; sans avancement, la barre ondule.
export function step(p, label) {
  const bar = $('.veil-bar');
  bar.classList.toggle('busy', p == null);
  if (p != null) bar.firstElementChild.style.width = `${Math.round(Math.max(0.04, Math.min(1, p)) * 100)}%`;
  if (label != null) $('.veil-label').textContent = label;
}

export function cover({ label = '', tips = null, run = null, until = () => true, ready = null, min = 0 } = {}) {
  const me = job = { until, ready, min, armed: false };
  kinds = tips; step(null, label);
  const go = () => { if (job !== me) return; me.armed = true; run?.(); check(); };
  setTimeout(() => { if (job === me) { me.until = () => true; check(); } }, MAX_MS);
  if (state === 'on' || state === 'in') { if (!tipTimer) tipsOn(); if (state === 'on') go(); else setTimeout(go, IN_MS); return; }
  const el = root || make();
  el.classList.remove('off'); el.removeAttribute('aria-hidden'); void el.offsetWidth;
  el.classList.add('on'); state = 'in'; shownAt = performance.now(); tipsOn();
  setTimeout(() => { if (state === 'in') state = 'on'; go(); }, reduce() ? 0 : IN_MS);
}

// Appelé après chaque rendu : le voile s'efface dès que ce qu'il attendait est là.
export function check() {
  const me = job;
  if (!me?.armed || !me.until()) return;
  job = null; me.armed = false;
  Promise.race([Promise.resolve(me.ready?.()).catch(() => {}), wait(4000)])
    .then(() => wait(Math.max(0, shownAt + me.min - performance.now())))
    .then(() => { if (!job) reveal(); });
}

function reveal() {
  if (!root || state === 'off' || state === 'out') return;
  state = 'out'; root.classList.remove('on');
  setTimeout(() => { if (state !== 'out') return; state = 'off'; root.classList.add('off'); root.setAttribute('aria-hidden', 'true'); clearInterval(tipTimer); tipTimer = null; }, reduce() ? 0 : OUT_MS);
}

// Le voile est-il à l'écran (ou en train d'y monter) ?
export const covering = () => state === 'in' || state === 'on';
