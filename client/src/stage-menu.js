// Décor animé des menus, sur les toiles de stage.js : chargé avec lui, seulement avec WebGL et sans « réduire les animations ».
// Derrière les menus, stage.js garde sa brume, ses braises et sa lampe (aux couleurs de la saison, season.js) ; la vitrine de
// l'accueil a sa propre toile (lobby-stage.js). Ce fichier ajoute, par-dessus les menus :
// - Bouton Jouer : quelques étincelles qui montent de son bord.
// - Ce qui attend le joueur (booster du jour, tuile « à faire ») : une étincelle de temps en temps.
// - Halloween : de temps en temps, quelques chauves-souris traversent l'écran.
// - Néon 2099 : de temps en temps, une voiture volante passe au loin, phare devant et feu arrière rouge.
// - Éclipse d'Ignaroth : des cendres tombent en continu, et de temps en temps le dragon passe devant le soleil noir en crachant des braises.
// Rien ne s'affiche au-dessus d'une feuille ouverte, et rien ne tourne en partie.
import { Container, Sprite, Texture } from 'pixi.js';
import { kit, scene } from './stage.js';
import { season, palette, batCanvases, spinnerCanvas, dragonCanvases } from './season.js';

let started = false, bats = null, batTex = null, carTex = null, dragonTex = null, lastSpark = 0, lastTodo = 0, nextBats = 0, nextCar = 0, nextDragon = 0;

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

// Le dragon : il entre par un bord, passe haut (devant le soleil noir, en haut à droite) et ressort de l'autre côté en planant.
function dragon(rnd) {
  const dir = Math.random() < 0.5 ? 1 : -1, y = rnd(innerHeight * 0.02, innerHeight * 0.07);
  const b = new Sprite(dragonTex[0]); b.anchor.set(0.5); b.tint = 0x0a0204; b.alpha = 0.92;
  const sc = rnd(0.7, 1) * Math.min(1, innerWidth / 420); b.scale.set(sc * dir, sc);
  b.position.set(dir > 0 ? -160 : innerWidth + 160, y);
  Object.assign(b, { vx: dir * rnd(2.4, 3.2), y0: y, amp: rnd(8, 16), seed: rnd(0, 6), flap: rnd(1.6, 2.2), dragon: true, sc });
  bats.addChild(b);
}

export function start() {
  if (started) return; started = true;
  const { over, sparkTex, rnd } = kit();
  batTex = batCanvases().map(c => Texture.from(c));
  carTex = Texture.from(spinnerCanvas());
  dragonTex = dragonCanvases().map(c => Texture.from(c));
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
    // Éclipse : cendres qui tombent doucement, et le dragon toutes les 14 à 26 secondes.
    if (season() === 'eclipse' && !busy) {
      if (Math.random() < 0.05 * dt) { const vy = rnd(0.4, 0.8), hot = Math.random() < 0.25;
        spawn(sparkTex, rnd(0, innerWidth), -8, { tint: hot ? 0xff6a2a : 0x7a6a66, blend: hot ? 'add' : 'normal',
          vx: rnd(-0.3, 0.1), vy, drag: 1, scale: rnd(0.06, 0.13), ttl: innerHeight / vy, alpha: rnd(0.4, 0.75) }); }
      if (now > nextDragon) { if (nextDragon) dragon(rnd); nextDragon = now + rnd(14000, 26000); }
    }
    bats.visible = !busy;
    for (const b of [...bats.children]) {
      b.x += b.vx * dt; b.y = b.y0 + Math.sin(b.x / 70 + b.seed) * b.amp;
      if (b.dragon) {
        // battement lent : ailes hautes, à plat, basses, à plat ; braises qui s'échappent de la gueule
        b.texture = dragonTex[[0, 1, 2, 1][Math.floor(now / (1000 / b.flap / 4) + b.seed) % 4]];
        if (!busy && Math.random() < 0.35 * dt) { const d = Math.sign(b.scale.x), mx = b.x + d * 90 * b.sc, my = b.y - 14 * b.sc;
          spawn(sparkTex, mx, my, { tint: palette().embers[Math.floor(rnd(0, 3))], vx: d * rnd(0.5, 1.6), vy: rnd(-0.2, 0.6), g: 0.02, scale: rnd(0.12, 0.28), ttl: rnd(30, 60) }); }
      } else if (!b.car) b.texture = batTex[Math.floor(now / (1000 / b.flap) + b.seed) % 2];
      if (b.x < -260 || b.x > innerWidth + 260) b.destroy();
    }
  });
}
