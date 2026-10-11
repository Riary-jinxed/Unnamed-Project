// Ouverture d'un booster ou d'un coffre d'arts, comme en vrai : on déchire le haut du paquet et on retourne les cartes
// une à une, les nouvelles en dernier ; on frappe le coffre, sa lueur monte jusqu'à la rareté de l'art, puis il s'ouvre.
// Calque posé dans <body> (comme fx.js) : les rendus de #app pendant l'ouverture ne le coupent pas.
import './opening.css';
import { play } from './sfx.js';
import { reduceMotion } from './fx.js';

const buzz = p => { try { navigator.vibrate?.(p); } catch { /* vibreur indisponible */ } };
const wait = ms => new Promise(r => setTimeout(r, ms));

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
function close(root) { root.classList.add('out'); setTimeout(() => root.remove(), 260); }

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
    <button class="op-skip" type="button">Tout révéler</button>
    <div class="op-stage">
      <div class="pack" style="--tear:0">
        <div class="pack-top"><i class="pack-notch"></i></div><div class="pack-cut"></div>
        <div class="pack-body"><span class="pack-set">${setName}</span><span class="pack-emb"></span><b>Booster</b><small>${n} cartes</small></div>
        <div class="pack-sheen"></div>
      </div>
      <div class="stack" hidden>${order.map((c, k) => `<div class="oc ${c.fresh ? (c.general ? 'is-gen' : 'is-new') : ''}" style="z-index:${n - k}">
        <div class="oc-burst"></div>
        <div class="oc-in"><div class="oc-back mc back back-${back || 'classique'}"></div><div class="oc-face">${c.html}</div></div>
        <span class="oc-tag">${c.tag}</span></div>`).join('')}</div>
    </div>
    <p class="op-count num" aria-hidden="true"></p>
    <p class="op-hint" aria-live="polite">Glissez le long du haut du paquet pour le déchirer</p>`, finish);
  root.setAttribute('aria-label', title);
  const stage = root.querySelector('.op-stage'), pack = root.querySelector('.pack'), stack = root.querySelector('.stack');
  const hint = root.querySelector('.op-hint'), count = root.querySelector('.op-count');
  const els = [...stack.children];
  let idx = 0, tear = 0, torn = false, ready = false;

  // 1. Le paquet penche sous le doigt ; glisser le long du haut le déchire, un simple appui le déchire d'un coup.
  const setTilt = e => { const r = pack.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    pack.style.setProperty('--rx', `${(-y * 10).toFixed(1)}deg`); pack.style.setProperty('--ry', `${(x * 14).toFixed(1)}deg`); pack.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(0)}%`); };
  const setTear = v => {
    if (torn) return;
    const step = Math.floor(v * 10) > Math.floor(tear * 10);
    tear = Math.min(1, v); pack.style.setProperty('--tear', tear.toFixed(3));
    if (step) { play('tear'); buzz(4); }
    if (tear >= 1) rip();
  };
  const autoTear = () => { const go = () => { if (torn) return; setTear(tear + 0.07); requestAnimationFrame(go); }; go(); };
  async function rip() {
    torn = true; pack.classList.add('torn'); play('rip'); buzz(30);
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
    if (c.fresh) { el.classList.add('hint'); play('shimmer'); buzz(c.general ? [15, 40, 15] : 10); hint.textContent = c.general ? 'Quelque chose de rare… touchez pour retourner' : 'Touchez pour retourner la carte'; }
    else { hint.textContent = ''; setTimeout(() => { if (els[idx] === el) flip(el); }, 300); }
  }
  function flip(el) {
    if (el.classList.contains('flip')) return;
    const c = order[idx];
    el.classList.remove('hint'); el.classList.add('flip');
    if (c.fresh) { play(c.general ? 'astral' : 'fresh'); buzz(c.general ? [30, 50, 60] : 25); el.classList.add('shine'); }
    else play('flip');
    hint.textContent = idx < n - 1 ? 'Touchez ou glissez pour la carte suivante' : 'Touchez pour voir le résumé';
  }
  function toss(el, dir = -1) {
    if (idx >= n - 1) { finish(); return; }
    el.style.transition = 'transform .42s cubic-bezier(.4,0,.6,1), opacity .42s';
    el.style.transform = `translate(${dir * 110}vw, -8vh) rotate(${dir * 28}deg)`; el.style.opacity = '0';
    play('toss'); setTimeout(() => el.remove(), 450);
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
export function openChest({ rarity, html, chip, name, sub }, done) {
  const top = Math.max(0, TIERS.indexOf(rarity));
  if (reduceMotion()) { play(top ? 'astral' : 'reveal'); done(); return; }
  let finished = false;
  const finish = () => { if (finished) return; finished = true; close(root); done(); };
  const opsparks = Array.from({ length: 22 }, () => { const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 140;
    return `<i style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 60)}px;animation-delay:${Math.round(Math.random() * 180)}ms"></i>`; }).join('');
  const root = overlay(`opchest rar-${TIERS[0]}`, `
    <button class="op-skip" type="button">Passer</button>
    <div class="op-stage">
      <div class="oprays"></div><div class="opflash"></div>
      <div class="chest"><div class="chest-lid"><i></i><i></i></div><div class="chest-seam"></div>
        <div class="chest-body"><i></i><i></i><span class="chest-lock"></span></div></div>
      <div class="opsparks">${opsparks}</div>
      <div class="opreward"><div class="opreward-card">${html}</div>
        <div class="opreward-meta">${chip}<b>${name}</b><small>${sub}</small></div></div>
    </div>
    <p class="op-count num" aria-hidden="true"></p>
    <p class="op-hint" aria-live="polite">Touchez le coffre pour l'ouvrir</p>`, finish);
  root.setAttribute('aria-label', 'Coffre d\'arts');
  const chest = root.querySelector('.chest'), hint = root.querySelector('.op-hint'), flash = root.querySelector('.opflash');
  let hits = 0, tier = 0, opened = false, shown = false;
  const setTier = t => { root.classList.remove(`rar-${TIERS[tier]}`); tier = t; root.classList.add(`rar-${TIERS[t]}`); };
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  async function hit() {
    hits++;
    chest.style.setProperty('--amp', hits); chest.dataset.hits = hits;
    restart(chest, 'shake'); play('knock'); buzz(12 * hits);
    const t = Math.min(hits - 1, top);
    if (t > tier || hits === 1) {
      setTier(t);
      if (hits > 1) { restart(flash, 'go'); await wait(120); play('chestUp'); buzz([30, 30, 60]); }
    }
    hint.textContent = hits < 3 ? `Encore ${3 - hits} coup${3 - hits > 1 ? 's' : ''}…` : '';
    if (hits === 3) { await wait(480); open(); }
  }
  async function open() {
    opened = true; root.classList.add('lit'); chest.classList.add('open');
    play('chestOpen'); buzz([40, 30, 80]);
    if (top) setTimeout(() => play('astral'), 260);
    await wait(1100); shown = true; hint.textContent = 'Touchez pour continuer';
  }
  const act = () => { if (finished) return; if (!opened) { if (hits < 3) hit(); } else if (shown) finish(); };
  root.querySelector('.op-stage').addEventListener('click', act);
  root.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key) && !e.target.closest('.op-skip')) { e.preventDefault(); act(); } });
}
