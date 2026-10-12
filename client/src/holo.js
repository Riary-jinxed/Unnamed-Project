// Cartes vivantes : le reflet holographique des arts alternatifs et des cartes rares (art.js, « .holo ») suit l'inclinaison
// du téléphone, ou la souris posée sur la carte. L'inclinaison est écrite dans --tilt-x et --tilt-y (de -1 à 1) sur <html>,
// la souris les écrit sur la carte survolée ; holo.css en tire la position du reflet et de l'éclat.
// Sans capteur ni souris, le reflet ondule tout seul (holo.css). Avec « réduire les animations », il reste immobile.
import './holo.css';

const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = v => Math.max(-1, Math.min(1, v));
const RANGE = 22; // degrés d'inclinaison pour aller d'un bord du reflet à l'autre

// Inclinaison lissée, mesurée par rapport à la façon dont le téléphone est tenu : le repère suit lentement la main,
// si bien qu'un téléphone tenu immobile ramène le reflet au centre et que seuls les mouvements le font bouger.
let base = null, cur = [0, 0], goal = [0, 0], frame = 0;
function onTilt(e) {
  if (e.beta === null || e.gamma === null || still.matches) return;
  // Écran tourné : on remet les axes dans le sens de l'écran.
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  const [x, y] = a === 90 ? [e.beta, -e.gamma] : a === -90 || a === 270 ? [-e.beta, e.gamma] : a === 180 ? [-e.gamma, -e.beta] : [e.gamma, e.beta];
  if (!base) base = [x, y];
  base = [base[0] + (x - base[0]) * .02, base[1] + (y - base[1]) * .02];
  goal = [clamp((x - base[0]) / RANGE), clamp((y - base[1]) / RANGE)];
  if (!root.dataset.tilt) root.dataset.tilt = '1';
  frame ||= requestAnimationFrame(step);
}
function step() {
  cur = cur.map((v, i) => v + (goal[i] - v) * .25);
  root.style.setProperty('--tilt-x', cur[0].toFixed(3));
  root.style.setProperty('--tilt-y', cur[1].toFixed(3));
  frame = Math.abs(cur[0] - goal[0]) + Math.abs(cur[1] - goal[1]) > .002 ? requestAnimationFrame(step) : 0;
}
addEventListener('deviceorientation', onTilt);

// iPhone : le capteur n'est donné qu'après une autorisation demandée au toucher. On la demande au premier toucher
// d'une carte holographique, une seule fois.
const needsAsk = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
let asked = false;
if (needsAsk) addEventListener('click', e => {
  if (asked || !(e.target.closest?.('.art.holo') || e.target.closest?.('button')?.querySelector('.art.holo'))) return;
  asked = true; DeviceOrientationEvent.requestPermission().catch(() => {});
}, true);

// Souris : le reflet suit le pointeur sur la carte survolée, et revient au repos en la quittant.
let hovered = null;
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || still.matches) return;
  const el = e.target.closest?.('.art.holo');
  if (hovered && hovered !== el) leave(hovered);
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--tilt-x', clamp(((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
  el.style.setProperty('--tilt-y', clamp(((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  el.classList.add('hover'); hovered = el;
}, { passive: true });
document.addEventListener('mouseleave', () => hovered && leave(hovered));
function leave(el) { el.style.removeProperty('--tilt-x'); el.style.removeProperty('--tilt-y'); el.classList.remove('hover'); hovered = null; }
