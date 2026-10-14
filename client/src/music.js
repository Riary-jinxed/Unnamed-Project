// Musiques d'ambiance : fichiers MP3 de public/music/ (voir docs/musique.md), joués en boucle selon l'écran et la saison.
// Chaque écran demande ses morceaux par ordre de préférence (« partie-halloween », puis « partie ») : un fichier absent
// est oublié et le suivant prend sa place ; sans aucun fichier, silence.
// La musique passe par le contexte Web Audio des bruitages : le volume marche aussi sur iPhone, et « Couper le son » coupe tout.
import { audioContext, isMuted } from './sfx.js';

const FADE = 1.5; // secondes de fondu enchaîné entre deux morceaux
// Son vide joué au premier geste du joueur : sur iPhone, un lecteur ainsi « autorisé » peut ensuite jouer à tout moment.
const SILENCE = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';
let volume = 0.5;
try { const v = parseFloat(localStorage.getItem('jeu-music')); if (v >= 0 && v <= 1) volume = v; } catch { /* stockage indisponible */ }
let bus = null, decks = [], cur = null, wanted = [];
const missing = new Set();
const level = () => volume * volume; // le curseur suit l'oreille plutôt que l'amplitude

export const musicVolume = () => volume;
export function setMusicVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  try { localStorage.setItem('jeu-music', String(volume)); } catch { /* stockage indisponible */ }
  if (bus) bus.gain.setTargetAtTime(level(), audioContext().currentTime, 0.05);
  sync();
}
// Morceaux voulus pour l'écran affiché, par ordre de préférence (appelé à chaque affichage).
export function setMusic(list) { wanted = list; sync(); }

// Dès que le son est permis (au chargement si possible, sinon au premier geste, après unlockAudio) : deux lecteurs, pour passer d'un morceau à l'autre en fondu.
export function wakeMusic() {
  const ctx = audioContext();
  if (!ctx) return;
  if (!bus) {
    bus = ctx.createGain(); bus.gain.value = level(); bus.connect(ctx.destination);
    decks = [0, 1].map(() => {
      const el = new Audio(), gain = ctx.createGain(), d = { el, gain, name: null, token: 0, ok: false };
      el.loop = true; el.preload = 'auto'; gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain); gain.connect(bus);
      el.addEventListener('error', () => {
        if (!d.name) return;
        missing.add(d.name); d.name = null;
        if (cur === d) { cur = null; sync(); }
      });
      el.src = SILENCE;
      return d;
    });
    document.addEventListener('visibilitychange', sync);
    ctx.addEventListener('statechange', sync);
  }
  sync();
  // Tant qu'un lecteur n'a jamais pu jouer (geste pas encore reconnu par le navigateur), on réessaie à chaque geste.
  decks.forEach(d => {
    if (d.ok || (d.name && d !== cur)) return;
    d.el.play().then(() => { d.ok = true; if (!d.name) d.el.pause(); }).catch(() => {});
  });
}

function fade(d, to) {
  const g = d.gain.gain, t = audioContext().currentTime, token = ++d.token;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + FADE);
  if (!to) setTimeout(() => { if (d.token === token) { d.el.pause(); d.name = null; } }, FADE * 1000 + 50);
}

function sync() {
  if (!bus) return;
  // Appli en arrière-plan : tout s'arrête net, et reprend au retour.
  if (document.hidden) { decks.forEach(d => { d.token++; d.el.pause(); d.gain.gain.value = 0; d.name = null; }); cur = null; return; }
  const on = !isMuted() && volume > 0 && audioContext().state === 'running';
  const name = on ? wanted.find(n => !missing.has(n)) || null : null;
  if ((cur?.name || null) === name) return;
  const old = cur;
  if (old) fade(old, 0);
  cur = null;
  if (!name) return;
  // Le morceau qu'on vient de quitter revient en fondu là où il en était ; sinon, l'autre lecteur le charge.
  let d = decks.find(x => x.name === name);
  if (!d) { d = decks.find(x => x !== old && !x.name) || decks.find(x => x !== old); d.name = name; d.el.src = `/music/${name}.mp3`; }
  d.el.play().then(() => { d.ok = true; }).catch(() => {});
  fade(d, 1); cur = d;
}
