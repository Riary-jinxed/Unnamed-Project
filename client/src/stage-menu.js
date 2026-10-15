// Décor animé des menus, sur les toiles de stage.js : chargé avec lui, seulement avec WebGL et sans les animations réduites ou coupées (motion.js).
// Derrière les menus, stage.js garde sa brume, ses braises et sa lampe (aux couleurs de la saison, season.js) ; la vitrine de
// l'accueil a sa propre toile (lobby-stage.js). Ce fichier ajoute, par-dessus les menus :
// - Bouton Jouer : quelques étincelles qui montent de son bord.
// - Ce qui attend le joueur (booster du jour, tuile « à faire ») : une étincelle de temps en temps.
// - Halloween : de temps en temps, quelques chauves-souris traversent l'écran.
// - Néon 2099 : de temps en temps, une voiture volante passe au loin, phare devant et feu arrière rouge.
// - Éclipse d'Ignaroth : des cendres tombent en continu.
// - Ciel d'Elyndra : des étoiles s'allument et s'éteignent çà et là, et de temps en temps une étoile filante traverse le haut.
// - Estampe d'Ysmera : des pétales de cerisier tombent en tournoyant.
// - Bois de Sylvaën : des lucioles flottent et clignotent, et des feuilles tombent de temps en temps.
// - Aube de Séraphine : des plumes descendent lentement en se balançant, et des grains de lumière montent.
// - Roue de Fortuna : des jetons et des cartes (les Sept, l'As de pique) tombent en tournoyant, deux projecteurs balaient le ciel (stage.js), et de temps en temps le bouton Jouer crache un jackpot de jetons d'or.
// Rien ne s'affiche au-dessus d'une feuille ouverte, et rien ne tourne en partie.
import { Container, Sprite, Texture } from 'pixi.js';
import { kit, scene } from './stage.js';
import { season, palette, batCanvases, spinnerCanvas, petalCanvas, streakCanvas, leafCanvas, featherCanvas, chipCanvases, playingCardCanvases } from './season.js';

let started = false, bats = null, batTex = null, carTex = null, petalTex = null, streakTex = null, leafTex = null, featherTex = null, chipTex = null, cardTex = null, nextStar = 0, nextJackpot = 0, lastSpark = 0, lastTodo = 0, nextBats = 0, nextCar = 0;

// L'élément est-il à l'écran et non couvert (feuille, booster qui s'ouvre) ? Renvoie sa place, ou null.
function shown(el) {
  const r = el?.getBoundingClientRect();
  if (!r || !r.width || r.bottom < 0 || r.top > innerHeight) return null;
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  return el.contains(document.elementFromPoint(x, y)) ? r : null;
}
const sheetOpen = root => !!root.querySelector('.sheet');

// Une volée de 1 à 3 chauves-souris, d'un bord à l'autre, en ondulant ; les ailes battent en alternant deux silhouettes.
function flock(rnd) {
  const n = Math.floor(rnd(1, 4)), dir = Math.random() < 0.5 ? 1 : -1, y0 = rnd(innerHeight * 0.08, innerHeight * 0.55);
  for (let i = 0; i < n; i++) {
    const b = new Sprite(batTex[0]); b.anchor.set(0.5); b.tint = 0x1a0d22; b.alpha = 0.85;
    const sc = rnd(0.35, 0.6); b.scale.set(sc * dir, sc);
    b.position.set(dir > 0 ? -60 - i * rnd(30, 70) : innerWidth + 60 + i * rnd(30, 70), y0 + rnd(-40, 40));
    Object.assign(b, { vx: dir * rnd(3, 4.5), y0: b.y, amp: rnd(10, 26), seed: rnd(0, 6), flap: rnd(5, 7) });
    bats.addChild(b);
  }
}

// Une voiture volante d'un bord à l'autre, plus petite et plus pâle quand elle passe haut (au loin).
function spinner(rnd) {
  const dir = Math.random() < 0.5 ? 1 : -1, y = rnd(innerHeight * 0.06, innerHeight * 0.4), far = 1 - y / (innerHeight * 0.5);
  const b = new Sprite(carTex); b.anchor.set(0.5); b.alpha = 0.95 - far * 0.35;
  const sc = rnd(0.45, 0.65) * (1 - far * 0.4); b.scale.set(sc * dir, sc);
  b.position.set(dir > 0 ? -90 : innerWidth + 90, y);
  Object.assign(b, { vx: dir * rnd(4, 6.5), y0: y, amp: rnd(2, 5), seed: rnd(0, 6), flap: 0, car: true });
  bats.addChild(b);
}

// Ce qui tombe en se balançant et en tournant sur soi : pétale (estampe), feuille (Sylvaën), plume (Séraphine, plus lente).
const FALL = {
  estampe: () => [petalTex, Math.random() < 0.7 ? 0xf6b8c4 : 0xfbe0e4, 0.35, 0.7, 1],
  sylve: () => [leafTex, [0x6ab040, 0x9ad060, 0xd8c050, 0x4a8a3a][Math.floor(Math.random() * 4)], 0.4, 0.7, 1],
  aube: () => [featherTex, Math.random() < 0.7 ? 0xfff8ec : 0xffe0a0, 0.35, 0.6, 0.45],
  casino: () => Math.random() < 0.7 ? [chipTex[Math.floor(Math.random() * chipTex.length)], 0xffffff, 0.4, 0.6, 0.9]
    : [cardTex[Math.floor(Math.random() * cardTex.length)], 0xffffff, 0.45, 0.6, 0.7],
};
function petal(rnd) {
  const [tex, tint, s0, s1, slow] = FALL[season()]();
  const b = new Sprite(tex); b.anchor.set(0.5); b.tint = tint; b.alpha = rnd(0.75, 0.95);
  const sc = rnd(s0, s1); b.scale.set(sc);
  b.position.set(rnd(-20, innerWidth), -16);
  Object.assign(b, { petal: true, look: season(), vx: rnd(0.15, 0.5) * slow, vy: rnd(0.5, 1) * slow, x0: b.x, amp: rnd(14, 34), seed: rnd(0, 6), spin: rnd(-0.03, 0.03) * slow, flipT: rnd(0.002, 0.004), sc });
  bats.addChild(b);
}
// Une luciole : elle erre au hasard, s'allume et s'éteint lentement.
function firefly(rnd, sparkTex) {
  const b = new Sprite(sparkTex); b.anchor.set(0.5); b.blendMode = 'add'; b.tint = Math.random() < 0.7 ? 0xd8ff70 : 0x90ffc0;
  b.position.set(rnd(0, innerWidth), rnd(innerHeight * 0.1, innerHeight)); b.alpha = 0;
  Object.assign(b, { fly: true, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.1), seed: rnd(0, 6), life: rnd(400, 800), age: 0, sc: rnd(0.12, 0.22) });
  bats.addChild(b);
}
// Une étoile filante en haut de l'écran, qui file en descendant un peu et s'éteint.
function shooting(rnd) {
  const dir = Math.random() < 0.5 ? 1 : -1, a = rnd(0.25, 0.45), b = new Sprite(streakTex);
  b.anchor.set(1, 0.5); b.blendMode = 'add'; b.tint = Math.random() < 0.5 ? 0xfff2c0 : 0xd8e4ff; b.scale.set(rnd(0.8, 1.3) * dir, 1);
  b.rotation = dir * a; b.position.set(rnd(innerWidth * 0.1, innerWidth * 0.9), rnd(innerHeight * 0.02, innerHeight * 0.2));
  Object.assign(b, { star: true, vx: dir * Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 1 });
  bats.addChild(b);
}

export function start() {
  if (started) return; started = true;
  const { over, sparkTex, rnd } = kit();
  batTex = batCanvases().map(c => Texture.from(c));
  carTex = Texture.from(spinnerCanvas());
  petalTex = Texture.from(petalCanvas()); streakTex = Texture.from(streakCanvas()); leafTex = Texture.from(leafCanvas()); featherTex = Texture.from(featherCanvas());
  chipTex = chipCanvases().map(c => Texture.from(c)); cardTex = playingCardCanvases().map(c => Texture.from(c));
  // Gardé d'une scène à l'autre : stage.js ne le détruit pas en vidant la toile (keep).
  bats = Object.assign(new Container(), { keep: true });

  over.ticker.add(t => {
    const { root, spawn } = kit(), now = performance.now(), dt = t.deltaTime;
    if (scene() !== 'menu' || !root) { bats.parent?.removeChild(bats); bats.removeChildren().forEach(b => b.destroy()); return; }
    if (!bats.parent) over.stage.addChild(bats);
    const pal = palette(), busy = sheetOpen(root);

    // Bouton Jouer : étincelles qui montent de son bord haut.
    const pb = !busy && shown(root.querySelector('.playbtn'));
    if (pb && now - lastSpark > 420) { lastSpark = now + rnd(-120, 120);
      spawn(sparkTex, pb.left + rnd(12, pb.width - 12), pb.top + rnd(0, 6), { tint: pal.spark[Math.random() < 0.6 ? 0 : 1], scale: rnd(0.12, 0.22), vx: rnd(-0.15, 0.15), vy: -rnd(0.35, 0.7), drag: 1, ttl: rnd(40, 60) }); }

    // Ce qui attend : booster du jour, tuile à faire.
    if (!busy && now - lastTodo > 900) { lastTodo = now + rnd(-200, 200);
      const todo = [...root.querySelectorAll('.card-box.booster.ready, .tile.todo')].map(shown).filter(Boolean);
      const tr = todo[Math.floor(rnd(0, todo.length))];
      if (tr) spawn(sparkTex, tr.left + rnd(8, tr.width - 8), tr.top + rnd(0, 4), { tint: pal.spark[0], scale: rnd(0.1, 0.18), vy: -rnd(0.25, 0.5), drag: 1, ttl: 50 }); }

    // Halloween : une volée de chauves-souris toutes les 10 à 20 secondes, jamais par-dessus une feuille.
    if (season() === 'halloween' && !busy && now > nextBats) { if (nextBats) flock(rnd); nextBats = now + rnd(10000, 20000); }
    // Néon 2099 : une voiture volante toutes les 8 à 16 secondes.
    if (season() === 'cyber' && !busy && now > nextCar) { if (nextCar) spinner(rnd); nextCar = now + rnd(8000, 16000); }
    // Éclipse : cendres qui tombent doucement.
    if (season() === 'eclipse' && !busy) {
      if (Math.random() < 0.05 * dt) { const vy = rnd(0.4, 0.8), hot = Math.random() < 0.25;
        spawn(sparkTex, rnd(0, innerWidth), -8, { tint: hot ? 0xff6a2a : 0x7a6a66, blend: hot ? 'add' : 'normal',
          vx: rnd(-0.3, 0.1), vy, drag: 1, scale: rnd(0.06, 0.13), ttl: innerHeight / vy, alpha: rnd(0.4, 0.75) }); }
    }
    // Ciel d'Elyndra : étoiles qui scintillent un instant, et une étoile filante toutes les 6 à 14 secondes.
    if (season() === 'astral' && !busy) {
      if (Math.random() < 0.08 * dt) spawn(sparkTex, rnd(0, innerWidth), rnd(0, innerHeight), { tint: pal.embers[Math.floor(rnd(0, 3))], scale: rnd(0.08, 0.2), drag: 1, ttl: rnd(40, 90), grow: 0.004 });
      if (now > nextStar) { if (nextStar) shooting(rnd); nextStar = now + rnd(6000, 14000); }
    }
    // Estampe d'Ysmera : pétales de cerisier ; Bois de Sylvaën : feuilles plus rares et lucioles ; Aube : plumes et grains de lumière.
    const look = season(), n = bats.children.length;
    if (look === 'estampe' && !busy && Math.random() < 0.04 * dt && n < 40) petal(rnd);
    if (look === 'sylve' && !busy) {
      if (Math.random() < 0.012 * dt && n < 40) petal(rnd);
      if (Math.random() < 0.05 * dt && bats.children.filter(b => b.fly).length < 16) firefly(rnd, sparkTex);
    }
    if (look === 'aube' && !busy) {
      if (Math.random() < 0.01 * dt && n < 30) petal(rnd);
      if (Math.random() < 0.06 * dt) spawn(sparkTex, rnd(0, innerWidth), rnd(innerHeight * 0.35, innerHeight), { tint: Math.random() < 0.6 ? 0xfff0c0 : 0xffd0e0, vx: rnd(-0.15, 0.15), vy: -rnd(0.4, 0.9), drag: 1, scale: rnd(0.08, 0.16), ttl: rnd(200, 360), alpha: 0.8 });
    }
    // Roue de Fortuna : jetons qui tombent, et toutes les 12 à 22 secondes un jackpot de jetons d'or qui jaillit du bouton Jouer.
    if (look === 'casino' && !busy) {
      if (Math.random() < 0.011 * dt && n < 18) petal(rnd);
      if (now > nextJackpot) { if (nextJackpot && pb) for (let i = 0; i < 28; i++) { const a = -Math.PI / 2 + rnd(-0.6, 0.6), v = rnd(5, 9);
        spawn(chipTex[i % 5 ? 3 : Math.floor(rnd(0, 3))], pb.left + pb.width / 2 + rnd(-30, 30), pb.top + 6, { blend: 'normal', vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.25, drag: 0.99, spin: rnd(-0.2, 0.2), rot: rnd(0, 6), scale: rnd(0.3, 0.45), ttl: rnd(60, 90) }); }
        nextJackpot = now + rnd(12000, 22000); }
    }
    bats.visible = !busy;
    for (const b of [...bats.children]) {
      if (b.petal) {
        // chute balancée ; le pétale se retourne (largeur qui oscille) en tournant
        b.y += b.vy * dt; b.x0 += b.vx * dt; b.x = b.x0 + Math.sin(b.y / 60 + b.seed) * b.amp; b.rotation += b.spin * dt;
        b.scale.x = b.sc * Math.cos(now * b.flipT + b.seed);
        if (b.y > innerHeight + 30 || season() !== b.look) b.destroy();
        continue;
      }
      if (b.fly) {
        // errance : la direction tourne doucement ; l'éclat suit un battement lent, et s'éteint en fin de vie
        b.age += dt; b.vx += Math.sin(now / 900 + b.seed) * 0.01 * dt; b.vy += Math.cos(now / 1100 + b.seed * 2) * 0.01 * dt;
        b.vx *= 0.99; b.vy *= 0.99; b.x += b.vx * dt; b.y += b.vy * dt;
        const k = Math.min(1, b.age / 60, (b.life - b.age) / 60); b.alpha = Math.max(0, k) * (0.45 + 0.55 * Math.max(0, Math.sin(now / 400 + b.seed * 3)));
        b.scale.set(b.sc * (0.8 + 0.4 * b.alpha));
        if (b.age > b.life || season() !== 'sylve') b.destroy();
        continue;
      }
      if (b.star) { b.x += b.vx * dt; b.y += b.vy * dt; b.alpha = b.life -= 0.025 * dt; if (b.life <= 0) b.destroy(); continue; }
      b.x += b.vx * dt; b.y = b.y0 + Math.sin(b.x / 70 + b.seed) * b.amp;
      if (!b.car) b.texture = batTex[Math.floor(now / (1000 / b.flap) + b.seed) % 2];
      if (b.x < -260 || b.x > innerWidth + 260) b.destroy();
    }
  });
}
