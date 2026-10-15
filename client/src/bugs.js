// Signaler un bug : bouton du courrier, qui ouvre la feuille « bug » (type de problème, description, capture d'écran facultative).
// L'appli joint d'elle-même la version, l'appareil, l'écran et les dernières erreurs JavaScript ; l'équipe lit tout dans /admin (onglet Signalements).
import { esc } from './common.js';
import { reduceMotion } from './fx.js';
import { t, locale } from '@jeu/engine/i18n';

const KINDS = { bug: t('Bug ou plantage'), display: t('Affichage'), rules: t('Règles d\'une carte ou d\'une partie'), account: t('Compte, achats ou récompenses'), other: t('Autre') };
// Capture réduite à 1280 px de côté au plus, puis compressée jusqu'à tenir sous SHOT_MAX caractères (limite du serveur : 90 000).
const SHOT_SIDE = 1280, SHOT_MAX = 85_000;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// Dernières erreurs de l'appli, gardées pour le prochain signalement.
const errors = [];
const keep = text => { errors.push({ at: new Date().toISOString(), text: String(text).slice(0, 400) }); if (errors.length > 5) errors.shift(); };
window.addEventListener('error', e => keep(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
window.addEventListener('unhandledrejection', e => keep(`Promesse rejetée : ${e.reason?.message || e.reason}`));

async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    let scale = Math.min(1, SHOT_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    for (let i = 0; i < 6; i++, scale *= 0.75) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.7, 0.5]) {
        let data = c.toDataURL('image/webp', q);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', q);
        if (data.length <= SHOT_MAX) return data;
      }
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

// app : ce que main.js prête aux signalements (état ui, render, call, errLine).
export function createBugs(app) {
  const { ui } = app;
  const fresh = () => ({ kind: 'bug', text: '', shot: null, shotErr: '', sent: false });
  const b = ui.bug = fresh();

  const context = () => ({
    version: VERSION, ua: navigator.userAgent, platform: navigator.userAgentData?.platform || navigator.platform || '', lang: locale(),
    screen: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}`, dpr: devicePixelRatio || 1,
    touch: navigator.maxTouchPoints > 0, standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    online: navigator.onLine, page: ui.bugFrom || ui.screen, theme: ui.account?.progress?.theme || null, reducedMotion: reduceMotion(), errors: errors.slice(),
  });

  async function send() {
    if (b.text.trim().length < 10) return;
    const r = await app.call('POST', '/api/bugs', { kind: b.kind, text: b.text, shot: b.shot, context: context() });
    if (!r) return;
    Object.assign(b, fresh(), { sent: true });
    app.render();
  }
  async function pickShot(file) {
    if (!file) return;
    b.shotErr = '';
    if (!file.type.startsWith('image/')) b.shotErr = t('Choisissez une image.');
    else {
      try { b.shot = await shrink(file); if (!b.shot) b.shotErr = t('Cette image est trop lourde, même réduite.'); }
      catch { b.shot = null; b.shotErr = t('Impossible de lire cette image.'); }
    }
    app.render();
  }

  // Encart du courrier.
  const box = () => `<div class="card-box bugbox"><div><span class="eyebrow">${t('Un souci ?')}</span>
      <p class="hint" style="margin:0">${t('Un bug, un affichage bizarre, une carte qui ne fait pas ce qu\'elle dit : dites-le à l\'équipe.')}</p></div>
    <button class="btn" data-act="bug">${t('Signaler un bug')}</button></div>`;

  function sheet() {
    const head = `<div class="ph"><h2>${t('Signaler un bug')}</h2><button class="btn" type="button" data-act="close">${t('Fermer')}</button></div>`;
    if (b.sent) {
      return `<div class="sheet" data-act="close"><div class="panel" data-stop="1" role="dialog" aria-label="${t('Signaler un bug')}">${head}
        <p style="margin:0"><b>${t('Merci, c\'est envoyé !')}</b></p>
        <p class="hint" style="margin:0">${t('L\'équipe lit chaque signalement. Si elle a besoin de précisions, elle vous écrira dans le courrier.')}</p>
        <div class="row"><button class="btn primary" type="button" data-act="close">${t('Super !')}</button></div></div></div>`;
    }
    const ok = b.text.trim().length >= 10;
    return `<div class="sheet" data-act="close"><form class="panel bugform" data-stop="1" id="bug-form" role="dialog" aria-label="${t('Signaler un bug')}">${head}
      ${app.errLine()}
      <div class="field"><label class="eyebrow" for="bug-kind">${t('Type de problème')}</label>
        <select id="bug-kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${b.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label class="eyebrow" for="bug-text">${t('Que s\'est-il passé ?')}</label>
        <textarea id="bug-text" rows="5" maxlength="2000" placeholder="${t('Ce que vous faisiez, ce qui s\'est passé, ce que vous attendiez.')}">${esc(b.text)}</textarea></div>
      <div class="field"><span class="eyebrow">${t('Capture d\'écran (facultative)')}</span>
        ${b.shot ? `<div class="row"><img class="bugshot" src="${b.shot}" alt="${t('Capture jointe')}"><button class="btn sm" type="button" data-act="bug-shot-clear">${t('Retirer')}</button></div>`
          : `<div class="row"><label class="btn sm" for="bug-shot">${t('Joindre une image')}</label><input id="bug-shot" type="file" accept="image/*" hidden></div>`}
        ${b.shotErr ? `<p class="err" style="margin:0">${esc(b.shotErr)}</p>` : ''}</div>
      <p class="hint" style="margin:0">${t('Joint automatiquement : version du jeu, appareil, navigateur, taille d\'écran et dernières erreurs de l\'appli.')}</p>
      <div class="row"><button class="btn primary" type="submit" ${ui.busy || !ok ? 'disabled' : ''}>${t('Envoyer')}</button></div></form></div>`;
  }

  function click(a) {
    if (a === 'bug') { Object.assign(b, b.sent ? fresh() : {}); ui.bugFrom = ui.screen; ui.error = ''; ui.sheet = 'bug'; app.render(); }
    else if (a === 'bug-shot-clear') { b.shot = null; b.shotErr = ''; app.render(); }
    else return false;
    return true;
  }
  function input(e) {
    if (e.target.id !== 'bug-text') return false;
    b.text = e.target.value;
    const s = e.target.form?.querySelector('[type=submit]'); if (s) s.disabled = ui.busy || b.text.trim().length < 10;
    return true;
  }
  function change(e) {
    if (e.target.id === 'bug-kind') { b.kind = e.target.value; return true; }
    if (e.target.id === 'bug-shot') { pickShot(e.target.files[0]); e.target.value = ''; return true; }
    return false;
  }
  function submit(form) {
    if (form.id !== 'bug-form') return false;
    send();
    return true;
  }
  // Fermer la feuille après l'envoi repart d'un formulaire vide ; sinon ce qui est écrit reste pour plus tard.
  const closed = () => { if (b.sent) Object.assign(b, fresh()); };

  return { box, sheet, click, input, change, submit, closed };
}
