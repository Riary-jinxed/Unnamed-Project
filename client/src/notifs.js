// Notifications push (server/src/push.js, service worker public/sw.js) : activées appareil par appareil depuis le profil,
// avec le choix des sortes reçues (réglage du compte, le même sur tous ses appareils).
// Sur iPhone et iPad, elles ne marchent que dans l'appli ajoutée à l'écran d'accueil (iOS 16.4 ou plus).
import { api } from './api.js';
import { esc } from './common.js';
import { t, tp, tField } from '@jeu/engine/i18n';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// La clé publique VAPID arrive en base64 « URL » ; le navigateur la veut en octets.
const keyBytes = b64 => { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
// Le service worker n'est installé que dans l'appli compilée (main.js) : sans lui, pas de notification.
const registration = async () => (supported() ? navigator.serviceWorker.getRegistration() : null);
const currentSub = async () => { const reg = await registration(); return reg ? reg.pushManager.getSubscription() : null; };

// app : ce que main.js prête aux notifications (état ui, render, call, open : aller à l'écran qu'une notification désigne).
export function createNotifs(app) {
  const { ui } = app;
  const n = ui.notifs = { info: null, here: false, note: '', synced: false };

  async function load() {
    const r = await app.call('GET', '/api/push');
    if (r) n.info = r;
    n.here = supported() && Notification.permission === 'granted' && !!(await currentSub().catch(() => null));
    app.render();
  }
  // Abonnement de cet appareil, envoyé au serveur. Un ancien abonnement fait avec une autre clé est remplacé.
  async function subscribe(publicKey) {
    const reg = await registration();
    if (!reg) throw new Error(t('Les notifications ne sont pas disponibles ici.'));
    const opts = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
    let sub;
    try { sub = await reg.pushManager.subscribe(opts); }
    catch (e) { const old = await reg.pushManager.getSubscription(); if (!old) throw e; await old.unsubscribe(); sub = await reg.pushManager.subscribe(opts); }
    return api('POST', '/api/push/subscribe', { sub: sub.toJSON() }, ui.auth);
  }
  async function enable() {
    n.note = '';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      n.note = perm === 'denied' ? t('Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur, puis réessayez.') : t('Notifications non autorisées.');
      app.render(); return;
    }
    ui.busy = true; app.render();
    try { n.info = await subscribe(n.info.publicKey); n.here = true; n.note = t('Notifications activées sur cet appareil.'); }
    catch (e) { ui.error = e.message || t('Impossible d\'activer les notifications.'); }
    ui.busy = false; app.render();
  }
  async function disable() {
    ui.busy = true; app.render();
    const sub = await currentSub().catch(() => null);
    try {
      if (sub) { n.info = await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }, ui.auth); await sub.unsubscribe(); }
      n.here = false; n.note = t('Notifications coupées sur cet appareil.');
    } catch (e) { ui.error = e.message; }
    ui.busy = false; app.render();
  }
  async function setKind(id, on) {
    const r = await app.call('POST', '/api/push/kinds', { kinds: { [id]: on } });
    if (r) n.info = r;
  }
  async function test() {
    const r = await app.call('POST', '/api/push/test');
    if (r) { n.info = r; n.note = tField(r, 'msg'); app.render(); }
  }

  // À la connexion : l'abonnement de cet appareil est renvoyé au serveur (il a pu changer, ou servir à un autre compte avant).
  async function sync() {
    if (n.synced || !ui.auth || !supported() || Notification.permission !== 'granted') return;
    n.synced = true;
    const sub = await currentSub().catch(() => null);
    if (sub) api('POST', '/api/push/subscribe', { sub: sub.toJSON() }, ui.auth).then(r => { n.info = r; n.here = true; }).catch(() => {});
  }
  // À la déconnexion : cet appareil ne reçoit plus les notifications du compte.
  async function forget(token) {
    n.info = null; n.here = false; n.synced = false;
    const sub = await currentSub().catch(() => null);
    if (!sub) return;
    await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }, token).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  // Notification touchée : l'appli déjà ouverte reçoit un message du service worker, sinon elle s'ouvre avec « ?ouvrir= ».
  function listen() {
    if (!supported()) return;
    navigator.serviceWorker.addEventListener('message', e => { if (e.data?.t === 'notif-open') { app.track?.('pushOpen', e.data.kind); app.open(e.data.open); } });
    const q = new URLSearchParams(location.search), open = q.get('ouvrir'), kind = q.get('notif');
    if (open) {
      history.replaceState(null, '', location.pathname);
      const wait = setInterval(() => { if (ui.account?.starter && ui.screen === 'home') { clearInterval(wait); if (kind) app.track?.('pushOpen', kind); app.open(open); } }, 300);
      setTimeout(() => clearInterval(wait), 30_000);
    }
  }

  function html() {
    const box = body => `<div class="card-box notifs"><div><span class="eyebrow">${t('Réglages')}</span><h2 style="font-size:22px">${t('Notifications')}</h2></div>${body}</div>`;
    if (!supported()) return box(`<p class="hint" style="margin:0">${isIos()
      ? t('Sur iPhone et iPad, ajoutez d\'abord l\'appli à l\'écran d\'accueil (bouton Partager, puis « Sur l\'écran d\'accueil »), et ouvrez-la depuis son icône : les notifications se règlent alors ici.')
      : t('Ce navigateur ne sait pas recevoir de notifications.')}</p>`);
    if (!n.info) return box(`<p class="wait">${t('Chargement…')}</p>`);
    const blocked = Notification.permission === 'denied', others = n.info.devices - (n.here ? 1 : 0);
    const status = n.here ? t('Activées sur cet appareil.') : blocked ? t('Bloquées par le navigateur pour ce site : autorisez-les dans ses réglages.') : t('Désactivées sur cet appareil.');
    return box(`
      <p class="hint" style="margin:0" role="status">${status}${others > 0 ? ` ${tp(others, 'Aussi activées sur {n} autre appareil.', 'Aussi activées sur {n} autres appareils.')}` : ''}</p>
      <div class="row">${n.here
        ? `<button class="btn" data-act="notif-off" ${ui.busy ? 'disabled' : ''}>${t('Désactiver sur cet appareil')}</button><button class="btn" data-act="notif-test" ${ui.busy ? 'disabled' : ''}>${t('M\'envoyer un essai')}</button>`
        : `<button class="btn primary" data-act="notif-on" ${ui.busy || blocked ? 'disabled' : ''}>${t('Activer sur cet appareil')}</button>`}</div>
      ${n.note ? `<p class="hint" style="margin:0">${esc(n.note)}</p>` : ''}
      <div class="notif-kinds">${n.info.kinds.map(k => `<label class="check notif-kind"><input type="checkbox" data-notif="${esc(k.id)}" ${k.on ? 'checked' : ''} ${ui.busy ? 'disabled' : ''}>
        <span><b>${esc(t(k.label))}</b><small class="hint">${esc(t(k.hint))}</small></span></label>`).join('')}</div>`);
  }

  return {
    html, load, sync, forget, listen,
    click(a) {
      if (a === 'notif-on') enable();
      else if (a === 'notif-off') disable();
      else if (a === 'notif-test') test();
      else return false;
      return true;
    },
    change(e) {
      const id = e.target.dataset?.notif; if (!id) return false;
      setKind(id, e.target.checked);
      return true;
    },
  };
}
