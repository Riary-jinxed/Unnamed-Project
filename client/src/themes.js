// Thèmes de l'interface à l'effigie d'un général (themes.js du moteur, themes.css) : rayon Thèmes de la boutique, aperçu à
// l'essai, et illustration du général posée en fond des menus.
import './themes.css';
import { esc } from './common.js';
import { themeArt } from './art.js';
import { t } from '@jeu/engine/i18n';
import { EXTRA_THEMES, SHOP_THEMES } from '@jeu/engine/themes';
import { ACHIEVEMENTS } from '@jeu/engine/rewards';

// Illustration du thème affiché, en variables CSS sur <body> (lues par themes.css). Appelé à chaque rendu : ne touche au style
// que quand le thème change.
let shown = null;
export function setThemeArt(theme) {
  if (theme === shown) return; shown = theme;
  const x = EXTRA_THEMES[theme], art = x && themeArt(x.card, x.art), st = document.body.style;
  for (const [k, layer] of [['--theme-decor', 'decor'], ['--theme-perso', 'perso']]) {
    if (art?.[layer]) st.setProperty(k, `url('${art[layer]}')`); else st.removeProperty(k);
  }
}

const wonBy = id => ACHIEVEMENTS.find(x => x.theme === id);
// Carte d'un thème : son ciel, le général par-dessus, son nom.
const cover = id => { const x = EXTRA_THEMES[id], art = themeArt(x.card, x.art);
  return `<span class="theme-cover theme-swatch theme-${esc(id)}" aria-hidden="true">${art?.perso || art?.decor ? `<span class="tc-art" style="background-image:${art.perso ? `url('${art.perso}'), ` : ''}url('${art.decor}')"></span>` : ''}</span>`; };

// app : ce que main.js prête (ui, prog, ico, canPay).
export function themeShopHTML(app) {
  const { ui } = app, a = ui.account, p = app.prog(), mine = (p.cosmetics.themes || []).map(x => x.id);
  const item = id => {
    const x = EXTRA_THEMES[id], name = t(x.name), own = mine.includes(id), cur = p.theme === id, trying = ui.themeTry === id;
    let act;
    if (cur) act = `<span class="chip ok">${t('Choisi')}</span>`;
    else if (own) act = `<button class="btn" data-theme="${esc(id)}" ${ui.busy ? 'disabled' : ''}>${t('Choisir')}</button>`;
    else if (x.price || x.prisms) {
      const prisms = !!x.prisms, n = x.prisms || x.price, off = ui.busy || (prisms ? (a.prisms || 0) < n : !app.canPay(n));
      act = `<button class="btn primary num" data-act="buy-theme" data-id="${esc(id)}" ${off ? 'disabled' : ''}
        aria-label="${prisms ? t('Acheter le thème « {name} » pour {n} Prismes', { name: esc(name), n }) : t('Acheter le thème « {name} » pour {n} Éclats', { name: esc(name), n })}">${app.ico(prisms ? 'prism' : 'shard')}${n}</button>`;
    } else { const w = wonBy(id); act = `<small class="hint">${w ? t('Succès : {label}', { label: esc(t(w.label)) }) : t('À débloquer')}</small>`; }
    const tryBtn = own ? '' : `<button class="btn" data-act="try-theme" data-id="${esc(id)}" aria-pressed="${trying}">${trying ? t('Arrêter l\'essai') : t('Essayer')}</button>`;
    return `<li class="themeitem ${cur ? 'on' : ''}">${cover(id)}<b>${esc(name)}</b><div class="row">${tryBtn}${act}</div></li>`;
  };
  const won = Object.keys(EXTRA_THEMES).filter(id => !SHOP_THEMES.includes(id));
  return `<section class="card-box shopset themeshop">
    <div><span class="eyebrow">${t('Cosmétique')}</span><h2 style="font-size:22px">${t('Thèmes de l\'interface')}</h2></div>
    <p class="hint" style="margin:0">${t('Habillez toute l\'appli aux couleurs d\'un général : menus, boutons, table de partie, et son portrait en fond. « Essayer » le montre ici sans l\'acheter. Un thème acheté est aussitôt choisi ; changez-en quand vous voulez dans votre profil, rubrique Personnalisation.')}</p>
    ${ui.msg && !ui.sheet ? `<p role="status" style="margin:0"><b>${esc(ui.msg)}</b></p>` : ''}
    <ul class="themelist">${SHOP_THEMES.map(item).join('')}</ul>
    ${won.length ? `<div class="gal-h">${t('À gagner avec les succès')}</div><ul class="themelist">${won.map(item).join('')}</ul>` : ''}
    <p class="hint" style="margin:0">${t('Les thèmes de saison se débloquent au palier 12 de la piste gratuite de leur passe.')}</p>
  </section>`;
}
// Personnalisation : d'où vient un thème encore verrouillé.
export const themeLock = id => { const x = EXTRA_THEMES[id]; if (!x) return t('À débloquer avec le passe de cette saison');
  if (x.price || x.prisms) return t('En vente au rayon Thèmes de la boutique'); const w = wonBy(id); return w ? t('Succès : {label}', { label: t(w.label) }) : t('À débloquer'); };
