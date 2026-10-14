// Ouverture d'un booster ou d'un coffre d'arts, comme en vrai : on déchire le haut du paquet et on retourne les cartes
// une à une, les nouvelles en dernier ; on frappe le coffre, sa lueur monte jusqu'à la rareté de l'art, puis il s'ouvre.
// Calque posé dans <body> (comme fx.js) : les rendus de #app pendant l'ouverture ne le coupent pas.
import './opening.css';
import { play, buzz } from './sfx.js';
import { reduceMotion } from './fx.js';
import { t, tp } from '@jeu/engine/i18n';

const wait = ms => new Promise(r => setTimeout(r, ms));
// Effets PixiJS (opening-stage.js) : chargés à la première ouverture, seulement avec WebGL. Tant qu'ils ne sont pas prêts,
// ou s'ils ne peuvent pas l'être, l'ouverture garde ses effets en CSS (opening.css) ; prêts, ils les remplacent (classe .px).
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
function stageFor(root, onReady) {
  if (!webgl()) return;
  import('./opening-stage.js').then(m => m.mount(root).then(ok => { if (!ok || !root.isConnected) return; root.classList.add('px'); root._fx = m; onReady?.(m); }))
    .catch(err => console.warn('Effets PixiJS de l\'ouverture indisponibles', err));
}
const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

// Calque plein écran, fermé par `close` ; Échap passe directement au résultat.
function overlay(cls, html, onSkip) {
  const root = document.createElement('div');
  root.className = `op ${cls}`; root.tabIndex = -1;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  root.innerHTML = html;
  document.body.append(root); root.focus({ preventScroll: true });
  root.querySelector('.op-skip').addEventListener('click', e => { e.stopPropagation(); onSkip(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); onSkip(); } });
  return root;
}
function close(root) { root.classList.add('out'); setTimeout(() => { root._fx?.unmount(root); root.remove(); }, 260); }

// Face du paquet, dessinée comme un objet de jeu : feuille métallisée aux couleurs du set, reflets irisés, cadre doré,
// blason qui rayonne, bandeau du set, titre gravé et plaque du nombre de cartes. viewBox 230×320 (sous la bande à déchirer).
// Aussi exposé dans l'étal de la boutique (shop.js) : `id` préfixe ses dégradés, pour que deux paquets d'une même page ne
// partagent pas les couleurs du premier.
export const packSVG = (setName, n, id = 'opp') => `<svg class="pack-art" viewBox="0 0 230 320" aria-hidden="true"><defs>
  <linearGradient id="${id}-f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--pk1)"/><stop offset=".55" style="stop-color:var(--pk3)"/><stop offset="1" style="stop-color:var(--pk1)"/></linearGradient>
  <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c0"/><stop offset=".5" stop-color="#f0c454"/><stop offset="1" stop-color="#a26a1a"/></linearGradient>
  <linearGradient id="${id}-h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6ad5" stop-opacity="0"/><stop offset=".3" stop-color="#ff6ad5"/><stop offset=".45" stop-color="#7afcff"/><stop offset=".6" stop-color="#fffb7a"/><stop offset=".75" stop-color="#ff6ad5" stop-opacity="0"/></linearGradient>
  <radialGradient id="${id}-r"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" style="stop-color:var(--pk2)" stop-opacity=".6"/><stop offset="1" style="stop-color:var(--pk2)" stop-opacity="0"/></radialGradient></defs>
  <rect width="230" height="320" fill="url(#${id}-f)"/>
  <rect width="230" height="320" fill="url(#${id}-h)" opacity=".16" class="pack-holo"/>
  <circle cx="115" cy="132" r="92" fill="url(#${id}-r)" opacity=".55"/>
  <g class="pack-rays" style="transform-origin:115px 132px">${Array.from({ length: 12 }, (_, i) => `<path d="M115 132 L${115 + Math.cos(i * Math.PI / 6 - .1) * 110} ${132 + Math.sin(i * Math.PI / 6 - .1) * 110} L${115 + Math.cos(i * Math.PI / 6 + .1) * 110} ${132 + Math.sin(i * Math.PI / 6 + .1) * 110}Z"/>`).join('')}</g>
  <rect x="9" y="6" width="212" height="300" rx="10" fill="none" stroke="url(#${id}-g)" stroke-width="4"/>
  <rect x="16" y="13" width="198" height="286" rx="6" fill="none" stroke="#f0c454" stroke-width="1" opacity=".5"/>
  <path d="M40 22 H190 L182 36 L190 50 H40 L48 36 Z" style="fill:var(--pk2)" stroke="#1a0f05" stroke-width="2.5" stroke-linejoin="round"/>
  <text x="115" y="41" text-anchor="middle" class="pack-settxt">${setName}</text>
  <circle cx="115" cy="132" r="44" fill="url(#${id}-g)" stroke="#1a0f05" stroke-width="4"/>
  <circle cx="115" cy="132" r="34" style="fill:var(--pk3)" stroke="#a26a1a" stroke-width="2"/>
  <path d="M115 104 L122 124 L143 124 L126 137 L132 158 L115 145 L98 158 L104 137 L87 124 L108 124 Z" fill="url(#${id}-g)" stroke="#1a0f05" stroke-width="2" stroke-linejoin="round"/>
  <text x="115" y="224" text-anchor="middle" class="pack-title" textLength="176" lengthAdjust="spacingAndGlyphs">BOOSTER</text>
  <rect x="68" y="244" width="94" height="28" rx="14" fill="#1a0f05" stroke="url(#${id}-g)" stroke-width="2.5"/>
  <text x="115" y="263" text-anchor="middle" class="pack-count">${t('{n} CARTES', { n })}</text></svg>`;

// Booster. cards : [{ html, fresh, general, tag }] dans l'ordre reçu ; set : 'base', 'set2'… (couleurs du paquet) ;
// back : dos de carte du joueur. done() affiche ensuite le récapitulatif.
export function openPack({ title, setName, set, back, cards }, done) {
  if (reduceMotion() || cards.length < 2) { play('reveal'); done(); return; }
  // Comme dans un vrai paquet, le meilleur est au fond : doublons, puis nouvelles cartes, puis nouveaux généraux.
  const rank = c => (c.fresh ? (c.general ? 2 : 1) : 0);
  const order = cards.map((c, i) => ({ ...c, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  const n = order.length, tilt = order.map(() => Math.round((Math.random() - 0.5) * 6));
  let finished = false;
  const finish = () => { if (finished) return; finished = true; close(root); done(); };
  const root = overlay(`oppack pk-${set || 'base'}`, `
    <button class="op-skip" type="button">${t('Tout révéler')}</button>
    <div class="op-stage">
      <div class="pack" style="--tear:0">
        <div class="pack-top"><i class="pack-notch"></i><span class="pack-pull">${t('Déchirer ici')}</span></div><div class="pack-cut"></div>
        <div class="pack-body">${packSVG(setName, n)}</div>
        <div class="pack-sheen"></div>
      </div>
      <div class="stack" hidden>${order.map((c, k) => `<div class="oc ${c.fresh ? (c.general ? 'is-gen' : 'is-new') : ''}" style="z-index:${n - k}">
        <div class="oc-burst"></div>
        <div class="oc-in"><div class="oc-back mc back back-${back || 'classique'}"></div><div class="oc-face">${c.html}</div></div>
        <span class="oc-tag">${c.tag}</span></div>`).join('')}</div>
    </div>
    <p class="op-count num" aria-hidden="true"></p>
    <p class="op-hint" aria-live="polite">${t('Glissez le long du haut du paquet pour le déchirer')}</p>`, finish);
  root.setAttribute('aria-label', title);
  const stage = root.querySelector('.op-stage'), pack = root.querySelector('.pack'), stack = root.querySelector('.stack');
  const hint = root.querySelector('.op-hint'), count = root.querySelector('.op-count');
  const els = [...stack.children];
  let idx = 0, tear = 0, torn = false, ready = false, stopHint = null, stopRays = null;
  const fx = () => root._fx, pk = () => cssVar(root, '--pk2');
  // Une carte nouvelle déjà présentée quand PixiJS arrive reçoit tout de suite son halo.
  stageFor(root, m => { const el = els[idx]; if (ready && el?.classList.contains('hint')) stopHint = m.hint(el, order[idx].general); });

  // 1. Le paquet penche sous le doigt ; glisser le long du haut le déchire, un simple appui le déchire d'un coup.
  const setTilt = e => { const r = pack.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    pack.style.setProperty('--rx', `${(-y * 10).toFixed(1)}deg`); pack.style.setProperty('--ry', `${(x * 14).toFixed(1)}deg`); pack.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(0)}%`); };
  const setTear = v => {
    if (torn) return;
    const step = Math.floor(v * 10) > Math.floor(tear * 10);
    tear = Math.min(1, v); pack.style.setProperty('--tear', tear.toFixed(3));
    if (step) { play('tear'); buzz(4); const r = pack.getBoundingClientRect(); fx()?.tear(r.left + tear * r.width, r.top + r.height * 0.13, pk()); }
    if (tear >= 1) rip();
  };
  const autoTear = () => { const go = () => { if (torn) return; setTear(tear + 0.07); requestAnimationFrame(go); }; go(); };
  async function rip() {
    torn = true; pack.classList.add('torn'); play('rip'); buzz(30); fx()?.rip(pack, pk());
    hint.textContent = '';
    await wait(260); stack.hidden = false; layout(); stack.classList.add('rise'); pack.classList.add('away');
    await wait(620); pack.remove(); ready = true; present();
  }

  // 2. Les cartes : face cachée, l'une sur l'autre. Doublon : il se retourne seul ; nouvelle carte : elle brille, on la retourne.
  function layout() {
    els.forEach((el, k) => { if (k < idx) return; const d = k - idx;
      el.style.transform = `translate(${d * 3}px, ${d * 4}px) rotate(${d ? tilt[k] : 0}deg)`; });
  }
  function present() {
    const el = els[idx]; if (!el) { finish(); return; }
    count.textContent = `${idx + 1} / ${n}`;
    const c = order[idx];
    if (c.fresh) { el.classList.add('hint'); play('shimmer'); stopHint = fx()?.hint(el, c.general); buzz(c.general ? [15, 40, 15] : 10); hint.textContent = c.general ? t('Quelque chose de rare… touchez pour retourner') : t('Touchez pour retourner la carte'); }
    else { hint.textContent = ''; setTimeout(() => { if (els[idx] === el) flip(el); }, 300); }
  }
  function flip(el) {
    if (el.classList.contains('flip')) return;
    const c = order[idx];
    el.classList.remove('hint'); el.classList.add('flip');
    stopHint?.(); stopHint = null; stopRays = fx()?.reveal(el, c.fresh ? (c.general ? 2 : 1) : 0);
    if (c.fresh) { play(c.general ? 'astral' : 'fresh'); buzz(c.general ? [30, 50, 60] : 25); el.classList.add('shine'); }
    else play('flip');
    hint.textContent = idx < n - 1 ? t('Touchez ou glissez pour la carte suivante') : t('Touchez pour voir le résumé');
  }
  function toss(el, dir = -1) {
    if (idx >= n - 1) { finish(); return; }
    el.style.transition = 'transform .42s cubic-bezier(.4,0,.6,1), opacity .42s';
    el.style.transform = `translate(${dir * 110}vw, -8vh) rotate(${dir * 28}deg)`; el.style.opacity = '0';
    play('toss'); fx()?.toss(el, dir); stopRays?.(); stopRays = null; setTimeout(() => el.remove(), 450);
    idx++; layout(); present();
  }
  // Un appui : déchirer, retourner la carte du dessus, ou la jeter pour voir la suivante.
  function act(dir = -1) {
    if (finished) return;
    if (!torn) { autoTear(); return; }
    const el = els[idx]; if (!ready || !el) return;
    if (!el.classList.contains('flip')) flip(el); else toss(el, dir);
  }

  let start = null, moved = 0, lastX = 0, dragX = 0;
  stage.addEventListener('pointerdown', e => {
    start = { x: e.clientX, y: e.clientY }; lastX = e.clientX; moved = 0; dragX = 0;
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  });
  stage.addEventListener('pointermove', e => {
    if (!torn && pack.isConnected) setTilt(e);
    if (!start) return;
    const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
    if (!torn) { setTear(tear + Math.abs(dx) / (pack.offsetWidth * 0.85)); return; }
    const el = els[idx];
    if (ready && el?.classList.contains('flip')) {
      dragX = e.clientX - start.x;
      el.style.transition = 'none'; el.style.transform = `translate(${dragX}px, ${Math.abs(dragX) * -0.08}px) rotate(${dragX / 14}deg)`;
    }
  });
  const up = () => {
    if (!start) return; start = null;
    const el = els[idx];
    if (Math.abs(dragX) > 70 && el?.classList.contains('flip')) { toss(el, Math.sign(dragX)); return; }
    if (el) { el.style.transition = ''; layout(); }
    // Un appui, ou un glissé sur une carte encore cachée (ou le paquet déjà déchiré à moitié) : même effet qu'un appui.
    if (moved < 10 || (torn && el && !el.classList.contains('flip'))) act();
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { start = null; if (els[idx]) { els[idx].style.transition = ''; layout(); } });
  root.addEventListener('keydown', e => {
    if (['Enter', ' ', 'ArrowRight', 'ArrowLeft'].includes(e.key) && !e.target.closest('.op-skip')) { e.preventDefault(); act(e.key === 'ArrowRight' ? 1 : -1); }
  });
}

// Coffre d'arts. rarity : 'rare', 'epique', 'legendaire' ; html : l'art en grand ; chip : pastille de rareté ; name, sub : l'art et sa carte.
// Trois coups sur le coffre : la lueur part du bleu (rare) et monte, coup après coup, jusqu'à la vraie rareté.
const TIERS = ['rare', 'epique', 'legendaire'];
// Le coffre, dessiné comme un objet de jeu : contour épais, bois verni, ferrures dorées, serrure à gemme (couleur de la rareté).
// Couvercle fermé (.c-lid) et couvercle ouvert basculé vers l'arrière, face intérieure visible (.c-lidopen), derrière le corps ;
// entre les deux, l'intérieur du coffre qui s'illumine (.c-mouth). viewBox 200×200, fente à y = 100. Aussi dans l'étal de la boutique.
export const chestSVG = (id = 'opc') => `<svg class="chest-svg" viewBox="0 0 200 200" aria-hidden="true"><defs>
  <linearGradient id="${id}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8743a"/><stop offset="1" stop-color="#5e3013"/></linearGradient>
  <linearGradient id="${id}-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d48e48"/><stop offset="1" stop-color="#7a4219"/></linearGradient>
  <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c0"/><stop offset=".45" stop-color="#f0c454"/><stop offset="1" stop-color="#a26a1a"/></linearGradient>
  <linearGradient id="${id}-i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1406"/><stop offset="1" stop-color="#4a2810"/></linearGradient>
  <radialGradient id="${id}-m"><stop offset="0" stop-color="#fff"/><stop offset=".45" style="stop-color:var(--rar)"/><stop offset="1" style="stop-color:var(--rar)" stop-opacity="0"/></radialGradient>
  <clipPath id="${id}-lc"><path d="M22 100 V72 Q22 36 100 34 Q178 36 178 72 V100 Z"/></clipPath></defs>
  <ellipse class="c-shadow" cx="100" cy="186" rx="82" ry="10" fill="#000" opacity=".5"/>
  <g class="c-lidopen"><path d="M24 100 L36 30 Q100 16 164 30 L176 100 Z" fill="url(#${id}-i)" stroke="#1e0e04" stroke-width="5" stroke-linejoin="round"/>
    <path d="M36 30 Q100 16 164 30 L162 42 Q100 29 38 42 Z" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2"/>
    <path d="M44 62 Q100 52 156 62 M48 82 Q100 74 152 82" stroke="#160a02" stroke-width="2" fill="none" opacity=".7"/>
    <path d="M58 40 L54 100 M142 40 L146 100" stroke="url(#${id}-g)" stroke-width="10"/></g>
  <ellipse class="c-mouth" cx="100" cy="100" rx="78" ry="14" fill="url(#${id}-m)"/>
  <g class="c-body"><path d="M24 98 H176 V170 Q176 180 166 180 H34 Q24 180 24 170 Z" fill="url(#${id}-w)" stroke="#2a1406" stroke-width="5" stroke-linejoin="round"/>
    <path d="M28 126 H172 M28 152 H172" stroke="#3a1c08" stroke-width="2.5" opacity=".6"/>
    <path d="M32 106 H168" stroke="#eab078" stroke-width="2.5" opacity=".45" stroke-linecap="round"/>
    <rect x="48" y="98" width="18" height="82" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2"/><rect x="134" y="98" width="18" height="82" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2"/>
    <rect x="22" y="166" width="156" height="14" rx="5" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2.5"/>
    <path d="M24 136 V170 Q24 180 34 180 H52 V170 H34 V136 Z M176 136 V170 Q176 180 166 180 H148 V170 H166 V136 Z" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2"/>
    <g fill="#5a3a0a"><circle cx="57" cy="114" r="2.5"/><circle cx="57" cy="150" r="2.5"/><circle cx="143" cy="114" r="2.5"/><circle cx="143" cy="150" r="2.5"/></g></g>
  <g class="c-lid"><path d="M22 100 V72 Q22 36 100 34 Q178 36 178 72 V100 Z" fill="url(#${id}-l)" stroke="#2a1406" stroke-width="5" stroke-linejoin="round"/>
    <g clip-path="url(#${id}-lc)"><rect x="48" y="30" width="18" height="72" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2"/><rect x="134" y="30" width="18" height="72" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2"/>
      <path d="M22 62 Q100 50 178 62" stroke="#4a2410" stroke-width="2.5" fill="none" opacity=".55"/></g>
    <path d="M34 70 Q36 46 96 42" stroke="#f6c690" stroke-width="5" fill="none" stroke-linecap="round" opacity=".55"/>
    <rect x="18" y="88" width="164" height="14" rx="5" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="2.5"/></g>
  <g class="c-lock"><path d="M82 82 H118 V108 Q118 122 100 130 Q82 122 82 108 Z" fill="url(#${id}-g)" stroke="#5a3a0a" stroke-width="3" stroke-linejoin="round"/>
    <circle class="c-gem" cx="100" cy="104" r="10" stroke="#3a2006" stroke-width="2.5"/><circle cx="96.5" cy="100.5" r="3.2" fill="#fff" opacity=".85"/></g></svg>`;
export function openChest({ rarity, html, chip, name, sub }, done) {
  const top = Math.max(0, TIERS.indexOf(rarity));
  if (reduceMotion()) { play(top ? 'astral' : 'reveal'); done(); return; }
  let finished = false;
  const finish = () => { if (finished) return; finished = true; close(root); done(); };
  const opsparks = Array.from({ length: 22 }, () => { const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 140;
    return `<i style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 60)}px;animation-delay:${Math.round(Math.random() * 180)}ms"></i>`; }).join('');
  const root = overlay(`opchest rar-${TIERS[0]}`, `
    <button class="op-skip" type="button">${t('Passer')}</button>
    <div class="op-stage">
      <div class="oprays"></div><div class="opflash"></div>
      <div class="chest">${chestSVG()}</div>
      <div class="opsparks">${opsparks}</div>
      <div class="opreward"><div class="opreward-card">${html}</div>
        <div class="opreward-meta">${chip}<b>${name}</b><small>${sub}</small></div></div>
    </div>
    <p class="op-count num" aria-hidden="true"></p>
    <p class="op-hint" aria-live="polite">${t('Touchez le coffre pour l\'ouvrir')}</p>`, finish);
  root.setAttribute('aria-label', t('Coffre d\'arts'));
  const chest = root.querySelector('.chest'), hint = root.querySelector('.op-hint'), flash = root.querySelector('.opflash');
  let hits = 0, tier = 0, opened = false, shown = false;
  const fx = () => root._fx, rar = () => cssVar(root, '--rar');
  stageFor(root, m => { if (hits && !opened) m.seam(chest, hits, rar()); });
  const setTier = t => { root.classList.remove(`rar-${TIERS[tier]}`); tier = t; root.classList.add(`rar-${TIERS[t]}`); };
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  async function hit() {
    hits++;
    chest.style.setProperty('--amp', hits); chest.dataset.hits = hits;
    restart(chest, 'shake'); play('knock'); buzz(12 * hits);
    const ti = Math.min(hits - 1, top);
    if (ti > tier || hits === 1) setTier(ti);
    fx()?.knock(chest, hits, rar()); fx()?.seam(chest, hits, rar());
    if (ti > 0 && ti === tier && hits === ti + 1) { restart(flash, 'go'); fx()?.tierUp(chest, rar()); await wait(120); play('chestUp'); buzz([30, 30, 60]); }
    hint.textContent = hits < 3 ? tp(3 - hits, 'Encore {n} coup…', 'Encore {n} coups…') : '';
    if (hits === 3) { await wait(480); open(); }
  }
  async function open() {
    // Le coffre bondit, retombe, et le couvercle bascule vers l'arrière à l'atterrissage (opening.css, chestjump).
    opened = true; chest.classList.add('open'); play('swing');
    await wait(330);
    root.classList.add('lit'); fx()?.chestOpen(chest, rar(), rarity);
    play('chestOpen'); buzz([40, 30, 80]);
    if (top) setTimeout(() => play('astral'), 260);
    await wait(1100); shown = true; hint.textContent = t('Touchez pour continuer');
  }
  const act = () => { if (finished) return; if (!opened) { if (hits < 3) hit(); } else if (shown) finish(); };
  root.querySelector('.op-stage').addEventListener('click', act);
  root.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key) && !e.target.closest('.op-skip')) { e.preventDefault(); act(); } });
}
