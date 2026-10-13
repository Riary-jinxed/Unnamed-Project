// Bruitages synthétisés avec Web Audio : aucun fichier à télécharger, aucun droit à gérer.
let ctx = null, master = null, noiseBuf = null;
let muted = false, volume = 1, haptics = true;
try {
  muted = localStorage.getItem('jeu-muted') === 'true';
  const v = parseFloat(localStorage.getItem('jeu-sfx')); if (v >= 0 && v <= 1) volume = v;
  haptics = localStorage.getItem('jeu-vibrations') !== 'false';
} catch { /* stockage indisponible */ }
const level = () => 0.5 * volume * volume; // le curseur suit l'oreille plutôt que l'amplitude

// Le navigateur n'autorise le son qu'après un geste du joueur : on prépare le contexte au premier appui.
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const isMuted = () => muted;
export const audioContext = () => ctx;
export function setMuted(m) { muted = m; try { localStorage.setItem('jeu-muted', String(m)); } catch { /* stockage indisponible */ } }
// Volume des bruitages, réglé dans le profil (la musique a le sien, music.js).
export const sfxVolume = () => volume;
export function setSfxVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  try { localStorage.setItem('jeu-sfx', String(volume)); } catch { /* stockage indisponible */ }
  if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05);
}

// Vibrations du téléphone, à part du son : on peut jouer sans le son mais avec les vibrations, ou l'inverse.
// Rien sur ordinateur ni sur iPhone (Safari ne sait pas faire vibrer) : canVibrate() le dit au réglage du profil.
const VIBRATES = typeof navigator.vibrate === 'function' && (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches);
export const canVibrate = () => VIBRATES;
export const vibrations = () => haptics;
export function setVibrations(on) { haptics = on; try { localStorage.setItem('jeu-vibrations', String(on)); } catch { /* stockage indisponible */ } }
export function buzz(pattern) {
  if (!haptics || document.hidden) return;
  try { navigator.vibrate?.(pattern); } catch { /* vibreur indisponible */ }
}
// Vibrations des moments de partie, du simple toucher au coup de tonnerre (durées en millisecondes).
const HAPTICS = {
  place: 12, validate: 18, deny: [25, 40, 25], spell: 20, terrain: 30, general: [20, 40, 30],
  hit: [30, 20, 15], destroy: [45, 30, 70], astral: [20, 30, 20, 30, 60], turn: 10,
  win: [60, 50, 60, 50, 160], lose: [220], tie: [70, 80, 70],
};
export function feel(name) { if (HAPTICS[name]) buzz(HAPTICS[name]); }

// Note simple avec enveloppe : fréquence de départ, arrivée éventuelle, durée, forme d'onde, volume, décalage.
function tone(f, { to, dur = 0.15, type = 'sine', vol = 0.3, at = 0 } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
// Souffle filtré (glissement de carte, impact).
function noise({ dur = 0.12, freq = 2000, to, q = 1, vol = 0.3, at = 0, type = 'bandpass' } = {}) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}

const SOUNDS = {
  pick: () => { noise({ dur: 0.06, freq: 3500, vol: 0.18 }); tone(880, { dur: 0.05, type: 'triangle', vol: 0.06 }); },
  place: () => { noise({ dur: 0.09, freq: 900, to: 300, vol: 0.35 }); tone(140, { to: 90, dur: 0.1, vol: 0.25 }); },
  unplace: () => { noise({ dur: 0.08, freq: 1200, to: 3000, vol: 0.2 }); },
  deny: () => { tone(180, { dur: 0.09, type: 'square', vol: 0.08 }); tone(150, { dur: 0.12, type: 'square', vol: 0.08, at: 0.09 }); },
  validate: () => { tone(523, { dur: 0.25, type: 'triangle', vol: 0.18 }); tone(784, { dur: 0.35, type: 'triangle', vol: 0.15, at: 0.08 }); },
  draw: () => { noise({ dur: 0.18, freq: 1500, to: 4000, q: 0.8, vol: 0.2 }); },
  reveal: () => { noise({ dur: 0.16, freq: 600, to: 3500, vol: 0.22 }); tone(660, { dur: 0.3, type: 'triangle', vol: 0.15, at: 0.08 }); tone(990, { dur: 0.35, vol: 0.1, at: 0.12 }); },
  revealFoe: () => { noise({ dur: 0.16, freq: 500, to: 2500, vol: 0.22 }); tone(440, { dur: 0.3, type: 'triangle', vol: 0.15, at: 0.08 }); tone(415, { dur: 0.35, vol: 0.08, at: 0.12 }); },
  spell: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, { dur: 0.25, vol: 0.08, at: i * 0.04 })); noise({ dur: 0.3, freq: 5000, q: 2, vol: 0.06 }); },
  up: () => { tone(600, { to: 1200, dur: 0.18, type: 'sine', vol: 0.1 }); },
  down: () => { tone(300, { to: 120, dur: 0.22, type: 'sawtooth', vol: 0.06 }); },
  destroy: () => { noise({ dur: 0.3, freq: 400, to: 80, type: 'lowpass', vol: 0.5 }); tone(90, { to: 40, dur: 0.3, vol: 0.35 }); },
  terrain: () => { tone(110, { to: 70, dur: 0.5, vol: 0.3 }); noise({ dur: 0.4, freq: 250, type: 'lowpass', vol: 0.25 }); },
  // Début de tour (petit carillon), cartes de l'adversaire posées face cachée, zone qui change de camp.
  turn: () => { tone(587, { dur: 0.35, type: 'triangle', vol: 0.1 }); tone(880, { dur: 0.5, type: 'sine', vol: 0.07, at: 0.1 }); },
  deal: () => { [0, 0.07, 0.14].forEach(at => noise({ dur: 0.07, freq: 1800, to: 700, vol: 0.18, at })); },
  swing: () => { tone(330, { to: 660, dur: 0.28, type: 'triangle', vol: 0.09 }); noise({ dur: 0.25, freq: 900, to: 2500, q: 1.5, vol: 0.06 }); },
  general: () => { [392, 523, 659].forEach((f, i) => tone(f, { dur: 0.4, type: 'sawtooth', vol: 0.05, at: i * 0.06 })); },
  // Niveau de carte gagné, et effet de mise en jeu d'une carte au niveau maximum.
  levelup: () => { [523, 659, 784].forEach((f, i) => tone(f, { dur: 0.3, type: 'triangle', vol: 0.14, at: i * 0.08 })); noise({ dur: 0.3, freq: 3000, to: 6000, q: 2, vol: 0.06 }); },
  astral: () => { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, { dur: 0.45, vol: 0.07, at: 0.05 + i * 0.05 })); tone(262, { to: 523, dur: 0.5, type: 'triangle', vol: 0.12 }); noise({ dur: 0.5, freq: 6000, q: 3, vol: 0.05 }); },
  // Ouverture d'un booster (opening.js) : papier froissé pendant qu'on déchire, déchirure finale, carte retournée, carte jetée.
  tear: () => { noise({ dur: 0.045, freq: 2800 + Math.random() * 2600, q: 2.5, vol: 0.11 }); },
  rip: () => { noise({ dur: 0.32, freq: 1800, to: 6500, q: 0.7, vol: 0.32 }); noise({ dur: 0.12, freq: 500, type: 'lowpass', vol: 0.3, at: 0.02 }); },
  flip: () => { noise({ dur: 0.07, freq: 2600, to: 1100, q: 1.2, vol: 0.18 }); },
  toss: () => { noise({ dur: 0.16, freq: 700, to: 3200, q: 1, vol: 0.12 }); },
  // Tutoriel : nouvelle consigne de Séraphine, deux notes douces.
  coach: () => { tone(1047, { dur: 0.16, type: 'triangle', vol: 0.06 }); tone(1568, { dur: 0.3, type: 'triangle', vol: 0.05, at: 0.09 }); },
  shimmer: () => { [1568, 2093, 2637].forEach((f, i) => tone(f, { dur: 0.3, vol: 0.035, at: i * 0.07 })); },
  fresh: () => { noise({ dur: 0.1, freq: 2600, to: 1100, q: 1.2, vol: 0.18 }); [659, 880, 1319].forEach((f, i) => tone(f, { dur: 0.35, type: 'triangle', vol: 0.12, at: 0.05 + i * 0.06 })); },
  // Coffre d'arts : coup sur le coffre, lueur qui monte d'une rareté, ouverture.
  knock: () => { tone(120, { to: 70, dur: 0.18, vol: 0.4 }); noise({ dur: 0.12, freq: 700, type: 'lowpass', vol: 0.4 }); tone(1900, { dur: 0.08, type: 'square', vol: 0.025, at: 0.01 }); },
  chestUp: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.22, type: 'triangle', vol: 0.1, at: i * 0.05 })); noise({ dur: 0.35, freq: 3000, to: 8000, q: 2, vol: 0.06 }); },
  chestOpen: () => { noise({ dur: 0.5, freq: 300, to: 4000, q: 0.6, vol: 0.35 }); tone(80, { to: 50, dur: 0.35, vol: 0.4 }); [523, 659, 784, 1047].forEach(f => tone(f, { dur: 0.9, type: 'triangle', vol: 0.07, at: 0.12 })); },
  // Coup porté : une carte de l'adversaire perd de la puissance (choc sourd et claquement).
  hit: () => { noise({ dur: 0.1, freq: 1600, to: 500, q: 1.4, vol: 0.32 }); tone(170, { to: 70, dur: 0.16, type: 'triangle', vol: 0.3 }); noise({ dur: 0.05, freq: 5000, q: 3, vol: 0.08, at: 0.01 }); },
  // Fin de partie : fanfare et accord tenu, chute grave, ou deux notes qui s'éteignent.
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: i === 3 ? 0.9 : 0.18, type: 'triangle', vol: 0.18, at: i * 0.13 }));
    [523, 659, 784].forEach(f => tone(f, { dur: 1.1, type: 'sine', vol: 0.07, at: 0.52 }));
    [2093, 2637, 3136].forEach((f, i) => tone(f, { dur: 0.35, vol: 0.03, at: 0.6 + i * 0.08 })); noise({ dur: 0.6, freq: 6000, q: 2, vol: 0.04, at: 0.5 });
  },
  lose: () => {
    [392, 349, 311, 262].forEach((f, i) => tone(f, { dur: i === 3 ? 0.9 : 0.22, type: 'triangle', vol: 0.15, at: i * 0.18 }));
    tone(131, { to: 98, dur: 1.2, type: 'sawtooth', vol: 0.05, at: 0.54 }); noise({ dur: 0.5, freq: 300, type: 'lowpass', vol: 0.15, at: 0.54 });
  },
  tie: () => { [440, 440].forEach((f, i) => tone(f, { dur: 0.25, type: 'triangle', vol: 0.15, at: i * 0.2 })); tone(330, { dur: 0.6, vol: 0.06, at: 0.4 }); },
};
export function play(name) {
  if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* son indisponible */ }
}
