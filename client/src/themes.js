// Thèmes de l'interface à l'effigie d'un général (themes.js du moteur, themes.css) : rayon Thèmes de la boutique, offres des
// autres boutiques (rayon Essence, magasin du boss mondial), aperçu à l'essai, et illustration du général posée en fond des menus.
import './themes.css';
import { esc } from './common.js';
import { themeArt } from './art.js';
import { t } from '@jeu/engine/i18n';
import { EXTRA_THEMES, SHOP_THEMES, themeShop, themeOut } from '@jeu/engine/themes';
import { ACHIEVEMENTS } from '@jeu/engine/rewards';

// Illustration du thème affiché, en variables CSS sur <body> (lues par themes.css), et classe « theme-extra » quand c'est un de
// ces thèmes (les règles communes de themes.css la visent). Appelé à chaque rendu : ne touche au style que quand le thème change.
let shown = null;
export function setThemeArt(theme) {
  if (theme === shown) return; shown = theme;
  const x = EXTRA_THEMES[theme], art = x && themeArt(x.card, x.art), st = document.body.style;
  document.body.classList.toggle('theme-extra', !!x);
  for (const [k, layer] of [['--theme-decor', 'decor'], ['--theme-perso', 'perso']]) {
    if (art?.[layer]) st.setProperty(k, `url('${art[layer]}')`); else st.removeProperty(k);
  }
}

const wonBy = id => ACHIEVEMENTS.find(x => x.theme === id);
// Carte d'un thème : son ciel, le général par-dessus, son nom.
export const themeCover = id => { const x = EXTRA_THEMES[id], art = themeArt(x.card, x.art);
  return `<span class="theme-cover theme-swatch theme-${esc(id)}" aria-hidden="true">${art?.perso || art?.decor ? `<span class="tc-art" style="background-image:${art.perso ? `url('${art.perso}'), ` : ''}url('${art.decor}')"></span>` : ''}</span>`; };

// Bouton « Essayer » d'un thème pas encore possédé (main.js montre le thème tant que la boutique où il est vendu est affichée).
// Retiré pour le moment (TRY_THEMES) : le bouton n'est plus affiché nulle part ; repasser à true pour le rendre.
const TRY_THEMES = false;
export const tryThemeHTML = (ui, id) => { if (!TRY_THEMES) return ''; const on = ui.themeTry === id;
  return `<button class="btn" data-act="try-theme" data-id="${esc(id)}" aria-pressed="${on}">${on ? t('Arrêter l\'essai') : t('Essayer')}</button>`; };
const WHERE = { essence: () => t('Au rayon Essence'), boss: () => t('Au magasin du boss mondial'), casino: () => t('À la boutique du casino') };

// app : ce que main.js prête (ui, prog, ico, canPay).
export function themeShopHTML(app) {
  const { ui } = app, a = ui.account, p = app.prog(), mine = (p.cosmetics.themes || []).map(x => x.id);
  const item = id => {
    const x = EXTRA_THEMES[id], name = t(x.name), own = mine.includes(id), cur = p.theme === id, where = themeShop(id);
    let act;
    if (cur) act = `<span class="chip ok">${t('Choisi')}</span>`;
    else if (own) act = `<button class="btn" data-theme="${esc(id)}" ${ui.busy ? 'disabled' : ''}>${t('Choisir')}</button>`;
    else if (WHERE[where]) act = `<button class="btn primary" data-act="theme-where" data-where="${where}">${WHERE[where]()}</button>`;
    else if (x.price || x.prisms) {
      const prisms = !!x.prisms, n = x.prisms || x.price, off = ui.busy || (prisms ? (a.prisms || 0) < n : !app.canPay(n));
      act = `<button class="btn primary num" data-act="buy-theme" data-id="${esc(id)}" ${off ? 'disabled' : ''}
        aria-label="${prisms ? t('Acheter le thème « {name} » pour {n} Prismes', { name: esc(name), n }) : t('Acheter le thème « {name} » pour {n} Éclats', { name: esc(name), n })}">${app.ico(prisms ? 'prism' : 'shard')}${n}</button>`;
    } else { const w = wonBy(id); act = `<small class="hint">${w ? t('Succès : {label}', { label: esc(t(w.label)) }) : t('À débloquer')}</small>`; }
    const tryBtn = own ? '' : tryThemeHTML(ui, id);
    return `<li class="themeitem ${cur ? 'on' : ''}">${themeCover(id)}<b>${esc(name)}</b><div class="row">${tryBtn}${act}</div></li>`;
  };
  const elsewhere = Object.keys(EXTRA_THEMES).filter(id => WHERE[themeShop(id)] && themeOut(id));
  return `<section class="card-box shopset themeshop">
    <div><span class="eyebrow">${t('Cosmétique')}</span><h2 style="font-size:22px">${t('Thèmes de l\'interface')}</h2></div>
    <p class="hint" style="margin:0">${t('Habillez toute l\'appli aux couleurs d\'un général : menus, boutons, table de partie, et son portrait en fond. Un thème acheté est aussitôt choisi ; changez-en quand vous voulez dans votre profil, rubrique Personnalisation.')}</p>
    ${ui.msg && !ui.sheet ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    <ul class="themelist">${SHOP_THEMES.filter(id => themeOut(id)).map(item).join('')}</ul>
    ${elsewhere.length ? `<div class="gal-h">${t('Dans les autres boutiques')}</div><ul class="themelist">${elsewhere.map(item).join('')}</ul>` : ''}
    <p class="hint" style="margin:0">${t('Les thèmes de saison se débloquent au palier 12 de la piste gratuite de leur passe.')}</p>
  </section>`;
}
// Thème vendu au rayon Essence : carte du thème, essai et achat en essence universelle (have : celle du joueur).
export function themeEssenceHTML(app, id, have) {
  const { ui } = app, x = EXTRA_THEMES[id], name = t(x.name), own = (app.prog().cosmetics.themes || []).some(y => y.id === id);
  return `<div class="essframe esstheme">${themeCover(id)}
    <div><b>${esc(name)}</b><small class="hint">${t('Thème de l\'interface, vendu seulement ici.')}</small></div>
    <div class="row">${own ? `<span class="chip ok">${t('Déjà à vous')}</span>` : `${tryThemeHTML(ui, id)}<button class="btn primary" data-act="buy-theme" data-id="${esc(id)}" ${have < x.essence || ui.busy ? 'disabled' : ''}
      aria-label="${t('Acheter le thème « {name} » pour {n} essence universelle', { name: esc(name), n: x.essence })}">${app.ico('essence')}${x.essence}</button>`}</div></div>`;
}
// Personnalisation : d'où vient un thème encore verrouillé.
export const themeLock = id => { const x = EXTRA_THEMES[id]; if (!x) return t('À débloquer avec le passe de cette saison');
  const where = themeShop(id);
  if (where === 'boss') return t('Au magasin du boss mondial, en Insignes');
  if (where === 'essence') return t('Au rayon Essence de la boutique');
  if (where === 'casino') return t('À la boutique du casino, en Jetons, pendant l\'événement');
  if (where === 'themes') return t('En vente au rayon Thèmes de la boutique');
  if (x.event) return t('À la boutique de l\'événement'); const w = wonBy(id); return w ? t('Succès : {label}', { label: t(w.label) }) : t('À débloquer'); };
