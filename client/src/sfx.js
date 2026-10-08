// Bruitages synthétisés avec Web Audio : aucun fichier à télécharger, aucun droit à gérer.
let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('jeu-muted') === 'true'; } catch { /* stockage indisponible */ }

// Le navigateur n'autorise le son qu'après un geste du joueur : on prépare le contexte au premier appui.
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem('jeu-muted', String(m)); } catch { /* stockage indisponible */ } }

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
  general: () => { [392, 523, 659].forEach((f, i) => tone(f, { dur: 0.4, type: 'sawtooth', vol: 0.05, at: i * 0.06 })); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: i === 3 ? 0.7 : 0.18, type: 'triangle', vol: 0.18, at: i * 0.13 })); },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, { dur: i === 3 ? 0.7 : 0.22, type: 'triangle', vol: 0.15, at: i * 0.18 })); },
  tie: () => { [440, 440].forEach((f, i) => tone(f, { dur: 0.25, type: 'triangle', vol: 0.15, at: i * 0.2 })); },
};
export function play(name) {
  if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* son indisponible */ }
}
