// Cosmétiques du plateau (board.js du moteur) : rayon Plateau de la boutique et choix dans la personnalisation du profil.
// Tapis de jeu : la table sous le plateau en partie (mats.js, dessinée par stage.js), vue par le joueur seul.
// Effets de pose : ce qui jaillit quand une de vos cartes arrive dans sa case (stage-cards.js) ; l'adversaire le voit à la révélation.
// Dos de carte : ceux du rayon rejoignent les autres dos (rewards.js, BACKS) ; l'adversaire les voit sur vos cartes cachées.
// Les aperçus sont en CSS (plateau.css) : rien à charger pour les montrer.
import './plateau.css';
import { esc } from './common.js';
import { t } from '@jeu/engine/i18n';
import { MATS, MAT_IDS, POSES, POSE_IDS, SHOP_BACKS, DEFAULT_POSE } from '@jeu/engine/board';
import { ACHIEVEMENTS, BACKS } from '@jeu/engine/rewards';

const priceOf = x => (x.prisms ? { k: 'prisms', n: x.prisms } : { k: 'shards', n: x.price });
export const matSwatch = id => `<span class="mat-sw mat-${esc(id || 'table')}" aria-hidden="true"></span>`;
export const poseSwatch = id => `<span class="pose-sw pose-${esc(id)}" aria-hidden="true"><span class="pose-card"></span><span class="pose-ico">${POSES[id]?.icon || ''}</span></span>`;

// Ce qu'une récompense (boîte, passe, succès) contient du plateau : une ligne par objet.
export function rewardBits(r) {
  return [r.mat && MATS[r.mat] ? t('Tapis de jeu « {name} » (Profil, Personnalisation)', { name: esc(t(MATS[r.mat].name)) }) : '',
    r.pose && POSES[r.pose] ? t('Effet de pose {icon} « {name} » (Profil, Personnalisation)', { icon: POSES[r.pose].icon, name: esc(t(POSES[r.pose].name)) }) : ''].filter(Boolean);
}

// app : ce que main.js prête (ui, prog, render, call, equip, ico, play, canPay, lacksShards, errLine).
export function createPlateau(app) {
  const { ui } = app;
  const owned = () => { const c = app.prog().cosmetics || {}; return { mat: c.mats || [], pose: c.poses || [DEFAULT_POSE], back: (c.backs || []).map(b => b.id) }; };
  const NAMES = { mat: id => MATS[id]?.name, pose: id => POSES[id]?.name, back: id => BACKS[id] };
  const winBy = (kind, id) => ACHIEVEMENTS.find(x => x[kind] === id);

  // Une tuile de la boutique : aperçu, nom, puis prix, « Utiliser » ou « Choisi ».
  function tile(kind, id, x, prev) {
    const own = owned()[kind].includes(id), cur = kind === 'mat' ? app.prog().mat === id : kind === 'pose' ? app.prog().pose === id : app.prog().back === id;
    const name = t(NAMES[kind](id)), a = ui.account;
    let act = '';
    if (cur) act = `<span class="chip ok">${t('Choisi')}</span>`;
    else if (own) act = `<button class="btn" data-act="use-board" data-kind="${kind}" data-id="${esc(id)}" ${ui.busy ? 'disabled' : ''}>${t('Utiliser')}</button>`;
    else if (x.price || x.prisms) {
      const p = priceOf(x), off = ui.busy || (p.k === 'prisms' ? (a.prisms || 0) < p.n : !app.canPay(p.n));
      act = `<button class="btn primary num" data-act="buy-board" data-kind="${kind}" data-id="${esc(id)}" ${off ? 'disabled' : ''}
        aria-label="${p.k === 'prisms' ? t('Acheter « {name} » pour {n} Prismes', { name: esc(name), n: p.n }) : t('Acheter « {name} » pour {n} Éclats', { name: esc(name), n: p.n })}">${app.ico(p.k === 'prisms' ? 'prism' : 'shard')}${p.n}</button>`;
    } else { const w = winBy(kind, id); act = `<small class="hint">${w ? t('Succès : {label}', { label: esc(t(w.label)) }) : t('À débloquer')}</small>`; }
    return `<li class="btile ${own ? 'owned' : ''} ${cur ? 'on' : ''}">${prev}<b>${esc(name)}</b>${act}</li>`;
  }

  function shopHTML() {
    const mats = MAT_IDS.map(id => tile('mat', id, MATS[id], matSwatch(id)));
    const poses = POSE_IDS.filter(id => !POSES[id].free).map(id => tile('pose', id, POSES[id], poseSwatch(id)));
    const backs = Object.entries(SHOP_BACKS).map(([id, x]) => tile('back', id, x, `<span class="mc back back-${esc(id)}"></span>`));
    return `<section class="card-box shopset boardshop">
      <div><span class="eyebrow">${t('Cosmétique')}</span><h2 style="font-size:22px">${t('Plateau')}</h2></div>
      <p class="hint" style="margin:0">${t('Habillez votre table de partie : un tapis de jeu sous le plateau, un effet quand vos cartes se posent, un dos pour vos cartes cachées. Un objet acheté est aussitôt installé ; changez-en quand vous voulez dans votre profil, rubrique Personnalisation.')}</p>
      ${ui.msg && !ui.sheet ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
      <div class="gal-h">${t('Tapis de jeu')}</div>
      <p class="hint" style="margin:0">${t('Vous seul le voyez : il remplace la table du thème de l\'interface pendant vos parties.')}</p>
      <ul class="btiles">${mats.join('')}</ul>
      <div class="gal-h">${t('Effets de pose')}</div>
      <p class="hint" style="margin:0">${t('Quand une de vos cartes arrive dans sa case. Votre adversaire le voit aussi quand vos cartes se révèlent.')}</p>
      <ul class="btiles">${poses.join('')}</ul>
      <div class="gal-h">${t('Dos de carte')}</div>
      <p class="hint" style="margin:0">${t('Votre adversaire le voit sur vos cartes cachées.')}</p>
      <ul class="btiles">${backs.join('')}</ul>
    </section>`;
  }

  // Personnalisation du profil : tapis et effet de pose, choisis parmi ceux possédés (les autres restent visibles, verrouillés).
  function customizeHTML() {
    const p = app.prog(), mine = owned();
    const pick = (attr, val, prev, label, on, ok, hint = '') => `<button class="pickc ${on ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-${attr}="${esc(val)}"` : 'disabled'} title="${esc(hint)}">${prev}<small>${esc(label)}</small></button>`;
    const lock = (kind, id, x) => (x.price || x.prisms ? t('En vente au rayon Plateau de la boutique') : winBy(kind, id) ? t('Succès : {label}', { label: t(winBy(kind, id).label) }) : t('À débloquer'));
    return `<div class="gal-h">${t('Tapis de jeu')}</div><p class="hint" style="margin:0">${t('La table sous le plateau, pendant vos parties. Vous seul le voyez.')}</p>
      <div class="picks">${pick('mat', '', matSwatch(''), t('Table du thème'), !p.mat, true)}
        ${MAT_IDS.map(id => { const ok = mine.mat.includes(id); return pick('mat', id, matSwatch(id), t(MATS[id].name), p.mat === id, ok, ok ? '' : lock('mat', id, MATS[id])); }).join('')}</div>
      <div class="gal-h">${t('Effet de pose')}</div><p class="hint" style="margin:0">${t('Quand une de vos cartes arrive dans sa case ; votre adversaire le voit à la révélation.')}</p>
      <div class="picks">${POSE_IDS.map(id => { const ok = mine.pose.includes(id); return pick('pose', id, poseSwatch(id), t(POSES[id].name), (p.pose || DEFAULT_POSE) === id, ok, ok ? '' : lock('pose', id, POSES[id])); }).join('')}</div>
      <div class="row"><button class="btn" data-act="shop-plateau">${t('D\'autres tapis, effets et dos en boutique')}</button></div>`;
  }

  async function buy(kind, id) {
    const r = await app.call('POST', '/api/shop/board', { kind, id }, true);
    if (!r) return;
    const name = t(NAMES[kind](id));
    ui.msg = kind === 'mat' ? t('Tapis « {name} » obtenu et installé pour vos prochaines parties.', { name })
      : kind === 'pose' ? t('Effet de pose « {name} » obtenu et choisi.', { name }) : t('Dos « {name} » obtenu et choisi.', { name });
    app.play('reveal'); app.render();
  }
  function use(kind, id) {
    app.equip({ [kind]: id || null }, kind === 'mat' ? t('Tapis de jeu changé.') : kind === 'pose' ? t('Effet de pose changé.') : t('Dos de carte changé.'));
  }
  // Clic du rayon : acheter (avec le change d'Éclats proposé s'il en manque), ou utiliser un objet possédé.
  function onBuy(kind, id) {
    const x = kind === 'mat' ? MATS[id] : kind === 'pose' ? POSES[id] : SHOP_BACKS[id]; if (!x) return;
    const go = () => buy(kind, id);
    if (x.prisms || !app.lacksShards(x.price, t('acheter'), go)) go();
  }
  return { shopHTML, customizeHTML, onBuy, use };
}
