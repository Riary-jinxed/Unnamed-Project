// Moteur de règles : pur, sans DOM ni réseau. Partagé par le serveur (parties en ligne) et l'appli (partie contre l'IA).
export const TURNS = 7, SLOTS = 4, HAND_MAX = 7, START_HAND = 3;
export const ZONE_NAMES = ['Gauche', 'Centre', 'Droite'];

// ---- Cartes du set de test ----
const isCreature = c => CARDS[c.id].type === 'C';
const hasKw = (c, k) => CARDS[c.id].kw.includes(k);

export const CARDS = {
  // ANGE
  cherubin:   { name: 'Chérubin', type: 'C', cost: 1, power: 2, kw: ['Ange'], sub: [], text: '' },
  gardien:    { name: 'Ange gardien', type: 'C', cost: 2, power: 2, kw: ['Ange'], sub: ['Clerc'], text: 'Persistant : vos autres créatures ici ont +1.',
                aura: (s, t) => t.owner === s.owner && t.zone === s.zone && t !== s ? 1 : 0 },
  heraut:     { name: 'Héraut céleste', type: 'C', cost: 3, power: 3, kw: ['Ange'], sub: [], text: 'Révélation : vos autres Anges en jeu gagnent +1.',
                onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  seraphin:   { name: 'Séraphin', type: 'C', cost: 5, power: 6, kw: ['Ange'], sub: [], text: 'Persistant : +3 si vous avez 4 créatures ici.',
                self: (c, st) => creaturesAt(st, c.owner, c.zone).length >= SLOTS ? 3 : 0 },
  archange:   { name: 'Archange', type: 'C', cost: 6, power: 8, kw: ['Ange'], sub: [], text: 'Révélation : vos autres créatures ici gagnent +1.',
                onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => buff(st, x, 1)) },
  benediction:{ name: 'Bénédiction', type: 'S', cost: 1, power: 0, kw: ['Ange'], sub: ['Clerc'], text: 'Sort : vos créatures ici gagnent +1.',
                onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).forEach(x => buff(st, x, 1)) },
  // HUMAIN
  recrue:     { name: 'Recrue', type: 'C', cost: 1, power: 1, kw: ['Humain'], sub: [], text: 'Révélation : +2 si vous avez une autre créature ici.',
                onReveal: (c, st) => { if (creaturesAt(st, c.owner, c.zone).some(x => x !== c)) buff(st, c, 2); } },
  clerc:      { name: 'Clerc de village', type: 'C', cost: 2, power: 2, kw: ['Humain'], sub: ['Clerc'], text: 'Fin de tour : une autre de vos créatures ici gagne +1.',
                onEndTurn: (c, st) => { const o = creaturesAt(st, c.owner, c.zone).filter(x => x !== c); if (o.length) buff(st, pick(o), 1); } },
  chevalier:  { name: 'Chevalier', type: 'C', cost: 3, power: 4, kw: ['Humain'], sub: [], text: '' },
  sorciere:   { name: 'Sorcière errante', type: 'C', cost: 3, power: 2, kw: ['Humain'], sub: ['Sorcier'], text: 'Révélation : piochez une carte.',
                onReveal: (c, st) => draw(st, c.owner, 1) },
  capitaine:  { name: 'Capitaine', type: 'C', cost: 4, power: 4, kw: ['Humain'], sub: [], text: 'Persistant : vos autres Humains ici ont +1.',
                aura: (s, t) => t.owner === s.owner && t.zone === s.zone && t !== s && hasKw(t, 'Humain') ? 1 : 0 },
  repli:      { name: 'Repli tactique', type: 'S', cost: 2, power: 0, kw: ['Humain'], sub: [], text: 'Sort : déplacez votre créature la plus faible d\'ici vers une autre zone. Elle gagne +2.',
                onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (!w) return;
                  const to = shuffle([0, 1, 2].filter(z => z !== c.zone && free(st, c.owner, z) > 0))[0];
                  if (to !== undefined) { move(st, w, to); buff(st, w, 2); } } },
  // DÉMON
  diablotin:  { name: 'Diablotin', type: 'C', cost: 1, power: 1, kw: ['Démon'], sub: [], text: 'Destruction : votre zone ici gagne +3.',
                onDestroyed: (c, st, z) => addZone(st, c.owner, z, 3) },
  succube:    { name: 'Succube', type: 'C', cost: 2, power: 3, kw: ['Démon'], sub: ['Déchu'], text: 'Révélation : défaussez une carte au hasard. Si vous le faites, +3.',
                onReveal: (c, st) => { if (discardRandom(st, c.owner)) buff(st, c, 3); } },
  bourreau:   { name: 'Bourreau', type: 'C', cost: 3, power: 4, kw: ['Démon'], sub: [], text: 'Révélation : détruisez votre autre créature la plus faible ici. Si vous le faites, +3.',
                onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone).filter(x => x !== c)); if (w && destroy(st, w)) buff(st, c, 3); } },
  ange_dechu: { name: 'Ange déchu', type: 'C', cost: 4, power: 5, kw: ['Démon', 'Ange'], sub: ['Déchu'], text: 'Persistant : les créatures adverses ici ont -1.',
                aura: (s, t) => t.owner !== s.owner && t.zone === s.zone ? -1 : 0 },
  seigneur:   { name: 'Seigneur des fosses', type: 'C', cost: 5, power: 6, kw: ['Démon'], sub: [], text: 'Quand une de vos autres créatures est détruite : +3.',
                onAllyDestroyed: (c, st) => buff(st, c, 3) },
  pacte:      { name: 'Pacte de sang', type: 'S', cost: 2, power: 0, kw: ['Démon'], sub: [], text: 'Sort : détruisez votre créature la plus faible ici, puis piochez 2 cartes.',
                onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) destroy(st, w); draw(st, c.owner, 2); } },
  // GOBELIN
  eclaireur:  { name: 'Gobelin éclaireur', type: 'C', cost: 1, power: 2, kw: ['Gobelin'], sub: [], text: '' },
  pyromane:   { name: 'Gobelin pyromane', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], sub: [], text: 'Révélation : détruisez la créature adverse la plus faible ici si sa puissance est 3 ou moins.',
                onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w && power(st, w) <= 3) destroy(st, w); } },
  chef:       { name: 'Chef de bande', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], sub: [], text: 'Révélation : invoquez un Gobelin 1 dans chacune de vos autres zones.',
                onReveal: (c, st) => [0, 1, 2].filter(z => z !== c.zone).forEach(z => summon(st, c.owner, z, 'jeton_gobelin')) },
  horde:      { name: 'Horde', type: 'C', cost: 3, power: 2, kw: ['Gobelin'], sub: [], text: 'Persistant : +1 par autre Gobelin que vous avez en jeu.',
                self: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Gobelin')).length },
  bombardier: { name: 'Bombardier', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], sub: [], text: 'Destruction : détruisez une créature adverse au hasard ici.',
                onDestroyed: (c, st, z) => { const e = creaturesAt(st, 1 - c.owner, z); if (e.length) destroy(st, pick(e)); } },
  embuscade:  { name: 'Embuscade', type: 'S', cost: 2, power: 0, kw: ['Gobelin'], sub: [], text: 'Sort : détruisez la créature adverse la plus forte ici dont la puissance est 4 ou moins.',
                onReveal: (c, st) => { const e = creaturesAt(st, 1 - c.owner, c.zone).filter(x => power(st, x) <= 4); const s = strongest(st, e); if (s) destroy(st, s); } },
  jeton_gobelin: { name: 'Gobelin', type: 'C', cost: 0, power: 1, kw: ['Gobelin'], sub: ['Jeton'], text: 'Jeton.', token: true },
  // DRAGON
  dragonnet:  { name: 'Dragonnet', type: 'C', cost: 1, power: 1, kw: ['Dragon'], sub: [], text: 'Début de tour : +1.',
                onStartTurn: (c, st) => buff(st, c, 1) },
  oeuf:       { name: 'Œuf de dragon', type: 'C', cost: 2, power: 0, kw: ['Dragon'], sub: [], text: 'Au début du tour 6 : +6.',
                onStartTurn: (c, st) => { if (st.turn === 6) buff(st, c, 6); } },
  drake:      { name: 'Drake des tempêtes', type: 'C', cost: 3, power: 4, kw: ['Dragon'], sub: [], text: 'Fin de tour : se déplace vers une autre de vos zones au hasard.',
                onEndTurn: (c, st) => { const to = shuffle([0, 1, 2].filter(z => z !== c.zone && free(st, c.owner, z) > 0))[0]; if (to !== undefined) move(st, c, to); } },
  wyverne:    { name: 'Wyverne', type: 'C', cost: 4, power: 5, kw: ['Dragon'], sub: [], text: 'Révélation : +3 si vous avez un autre Dragon en jeu.',
                onReveal: (c, st) => { if (mine(st, c.owner).some(x => x !== c && hasKw(x, 'Dragon'))) buff(st, c, 3); } },
  ancien:     { name: 'Dragon ancien', type: 'C', cost: 6, power: 9, kw: ['Dragon'], sub: [], text: '' },
  souffle:    { name: 'Souffle de feu', type: 'S', cost: 3, power: 0, kw: ['Dragon'], sub: [], text: 'Sort : les créatures adverses ici perdent 1.',
                onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => buff(st, x, -1)) },
  // HUMAINS DRAGONNIERS (deck Ancien)
  dragonnier: { name: 'Dragonnier', type: 'C', cost: 2, power: 2, kw: ['Humain'], sub: [], text: 'Révélation : +1 si vous avez un Dragon en jeu.',
                onReveal: (c, st) => { if (mine(st, c.owner).some(x => hasKw(x, 'Dragon'))) buff(st, c, 1); } },
  forgeron:   { name: 'Forgeron d\'écailles', type: 'C', cost: 3, power: 3, kw: ['Humain'], sub: [], text: 'Fin de tour : un de vos Dragons ici gagne +1.',
                onEndTurn: (c, st) => { const d = creaturesAt(st, c.owner, c.zone).filter(x => hasKw(x, 'Dragon')); if (d.length) buff(st, pick(d), 1); } },
  // DIEUX (variante de créature, 1 par deck)
  aurelion:   { name: 'Aurélion, Dieu de l\'Aube', type: 'C', god: true, cost: 6, power: 6, kw: ['Ange'], sub: ['Dieu'], text: 'Révélation : toutes vos autres créatures gagnent +1.',
                onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c).forEach(x => buff(st, x, 1)) },
  vorgoth:    { name: 'Vorgoth, Dieu des Abysses', type: 'C', god: true, cost: 6, power: 7, kw: ['Démon'], sub: ['Dieu'], text: 'Quand une de vos autres créatures est détruite : invoquez un Gobelin 1 dans sa zone.',
                onAllyDestroyed: (c, st, dead, z) => summon(st, c.owner, z, 'jeton_gobelin') },
  ignaroth:   { name: 'Ignaroth, Dieu-Dragon', type: 'C', god: true, cost: 6, power: 7, kw: ['Dragon'], sub: ['Dieu'], text: 'Révélation : vos autres Dragons gagnent +2.',
                onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Dragon')).forEach(x => buff(st, x, 2)) },
  // NEUTRES
  mercenaire: { name: 'Mercenaire', type: 'C', cost: 2, power: 3, kw: [], sub: [], text: '' },
  potion:     { name: 'Potion de force', type: 'S', cost: 1, power: 0, kw: [], sub: [], text: 'Sort : votre créature la plus forte ici gagne +2.',
                onReveal: (c, st) => { const s = strongest(st, creaturesAt(st, c.owner, c.zone)); if (s) buff(st, s, 2); } },
};

export const GENERALS = {
  seraphine: { name: 'Séraphine, Main de l\'Aube', kw: ['Ange', 'Humain'], kind: 'Persistant', text: 'Persistant : vos Anges ont +1.',
               aura: (p, t) => t.owner === p && hasKw(t, 'Ange') ? 1 : 0 },
  morgrath:  { name: 'Morgrath, Seigneur des Fosses', kw: ['Démon', 'Gobelin'], kind: 'Persistant', text: 'Quand une de vos créatures est détruite, votre zone où elle était gagne +1.',
               onAllyDestroyed: (p, st, dead, z) => addZone(st, p, z, 1) },
  vaelthar:  { name: 'Vael\'Thar, l\'Aîné', kw: ['Dragon', 'Humain'], kind: 'Activable', text: 'Activable, une fois par partie : la zone choisie gagne +2 pour vous.',
               activate: (p, st, z) => addZone(st, p, z, 2) },
};

export const TERRAINS = {
  sanctuaire: { name: 'Sanctuaire', text: 'Votre zone ici gagne +2.', flat: 2 },
  prairie:    { name: 'Prairie céleste', text: 'Vos Anges ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Ange') ? 1 : 0 },
  cite:       { name: 'Cité fortifiée', text: 'Vos Humains ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Humain') ? 1 : 0 },
  bastion:    { name: 'Bastion', text: 'Vos créatures de coût 1 ou 2 ici ont +1.', aura: (p, t) => t.owner === p && CARDS[t.id].cost >= 1 && CARDS[t.id].cost <= 2 ? 1 : 0 },
  brasier:    { name: 'Brasier', text: 'Vos Démons ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Démon') ? 1 : 0 },
  terrier:    { name: 'Terrier', text: 'À sa révélation : invoquez 2 Gobelins 1 ici.', onReveal: (p, st, z) => { summon(st, p, z, 'jeton_gobelin'); summon(st, p, z, 'jeton_gobelin'); } },
  gouffre:    { name: 'Gouffre', text: 'Quand une de vos créatures est détruite ici, votre zone ici gagne +2.', onAllyDestroyed: (p, st, dead, z, tz) => { if (z === tz) addZone(st, p, z, 2); } },
  nid:        { name: 'Nid de dragons', text: 'Vos Dragons ici ont +2.', aura: (p, t) => t.owner === p && hasKw(t, 'Dragon') ? 2 : 0 },
  temple:     { name: 'Temple ancien', text: 'Vos Dieux ici ont +2.', aura: (p, t) => t.owner === p && CARDS[t.id].god ? 2 : 0 },
  champ:      { name: 'Champ de bataille', text: 'Affecte les deux joueurs : toutes les créatures ici ont +1.', aura: () => 1, shared: true },
  ruines:     { name: 'Ruines maudites', text: 'Les créatures adverses ici ont -1.', aura: (p, t) => t.owner !== p ? -1 : 0 },
};

export const DECKS = {
  lumiere: { name: 'Lumière', general: 'seraphine', cards: ['cherubin', 'gardien', 'heraut', 'seraphin', 'archange', 'benediction', 'recrue', 'clerc', 'chevalier', 'sorciere', 'capitaine', 'repli', 'mercenaire', 'aurelion', 'potion'],
             terrains: ['sanctuaire', 'prairie', 'cite', 'bastion', 'champ'] },
  abime:   { name: 'Abîme', general: 'morgrath', cards: ['diablotin', 'succube', 'bourreau', 'ange_dechu', 'seigneur', 'pacte', 'eclaireur', 'pyromane', 'chef', 'horde', 'bombardier', 'embuscade', 'mercenaire', 'vorgoth', 'potion'],
             terrains: ['brasier', 'terrier', 'gouffre', 'ruines', 'sanctuaire'] },
  ancien:  { name: 'Ancien', general: 'vaelthar', cards: ['dragonnet', 'oeuf', 'drake', 'wyverne', 'ancien', 'souffle', 'dragonnier', 'forgeron', 'recrue', 'chevalier', 'sorciere', 'capitaine', 'ignaroth', 'mercenaire', 'potion'],
             terrains: ['nid', 'temple', 'sanctuaire', 'ruines', 'champ'] },
};

// ---- Utilitaires ----
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function log(st, msg, kind) { if (!st.sim) st.log.push({ turn: st.turn, msg, kind: kind || '' }); }
const nm = id => CARDS[id].name;
// Les messages du journal portent des marqueurs résolus par l'appli selon qui regarde :
// ⟦p⟧ = nom du joueur p (ou « Vous »), ⟦p|il|vous⟧ = verbe conjugué.
const who = (st, p) => `⟦${p}⟧`;
const vb = (p, il, vous) => `⟦${p}|${il}|${vous}⟧`;

// ---- État ----
export function newGame(deck0, deck1, names = ['Joueur 1', 'Joueur 2']) {
  let uid = 1;
  const mk = (p, key) => {
    const d = DECKS[key];
    return {
      name: names[p], deckKey: key, general: d.general, generalUsed: false,
      deck: shuffle(d.cards).map(id => ({ uid: uid++, id, owner: p, zone: -1, buff: 0, revealed: false })),
      hand: [], discard: [], terrainPool: shuffle(d.terrains), terrains: [null, null, null],
      board: [[], [], []], zoneBonus: [0, 0, 0], seals: 0,
    };
  };
  const st = { turn: 0, p: [mk(0, deck0), mk(1, deck1)], log: [], nextUid: 1000, order: 0, leader: 0, over: false, sim: false };
  for (const p of [0, 1]) draw(st, p, START_HAND);
  return st;
}

const creaturesAt = (st, p, z) => st.p[p].board[z].filter(c => c.revealed && isCreature(c));
const mine = (st, p) => [0, 1, 2].flatMap(z => creaturesAt(st, p, z));
export const free = (st, p, z) => SLOTS - st.p[p].board[z].length;
function allRevealed(st) { return [0, 1].flatMap(p => [0, 1, 2].flatMap(z => st.p[p].board[z].filter(c => c.revealed))); }

export function power(st, c) {
  const d = CARDS[c.id];
  let v = d.power + c.buff;
  if (d.self) v += d.self(c, st);
  for (const s of allRevealed(st)) { const sd = CARDS[s.id]; if (sd.aura && isCreature(s)) v += sd.aura(s, c, st); }
  for (const p of [0, 1]) {
    const g = GENERALS[st.p[p].general]; if (g.aura) v += g.aura(p, c, st);
    const t = st.p[p].terrains[c.zone]; if (t && TERRAINS[t].aura) v += TERRAINS[t].aura(p, c, st);
  }
  return v;
}
export function zonePower(st, p, z) {
  let v = st.p[p].zoneBonus[z];
  const t = st.p[p].terrains[z]; if (t && TERRAINS[t].flat) v += TERRAINS[t].flat;
  for (const c of creaturesAt(st, p, z)) v += power(st, c);
  return v;
}
function zoneWinner(st, z) { const a = zonePower(st, 0, z), b = zonePower(st, 1, z); return a > b ? 0 : b > a ? 1 : -1; }
function computeLeader(st) {
  const w = [0, 0]; for (const z of [0, 1, 2]) { const r = zoneWinner(st, z); if (r >= 0) w[r]++; }
  if (w[0] !== w[1]) return w[0] > w[1] ? 0 : 1;
  const t = [0, 1].map(p => [0, 1, 2].reduce((s, z) => s + zonePower(st, p, z), 0));
  if (t[0] !== t[1]) return t[0] > t[1] ? 0 : 1;
  return Math.random() < 0.5 ? 0 : 1;
}
function weakest(st, list) { let b = null, bv = Infinity; for (const c of list) { const v = power(st, c); if (v < bv) { bv = v; b = c; } } return b; }
function strongest(st, list) { let b = null, bv = -Infinity; for (const c of list) { const v = power(st, c); if (v > bv) { bv = v; b = c; } } return b; }

// ---- Actions ----
function draw(st, p, n) {
  const P = st.p[p];
  for (let i = 0; i < n; i++) {
    const c = P.deck.shift(); if (!c) { log(st, `${who(st, p)} : deck vide, pas de pioche.`); return; }
    if (P.hand.length >= HAND_MAX) { P.discard.push(c); log(st, `${who(st, p)} : main pleine, ${nm(c.id)} part à la défausse.`); }
    else P.hand.push(c);
  }
}
function discardRandom(st, p) {
  const P = st.p[p]; if (!P.hand.length) return false;
  const i = Math.floor(Math.random() * P.hand.length); const [c] = P.hand.splice(i, 1); P.discard.push(c);
  log(st, `${who(st, p)} ${vb(p, 'défausse', 'défaussez')} ${nm(c.id)}.`); return true;
}
function buff(st, c, n) { c.buff += n; log(st, `${nm(c.id)} ${n >= 0 ? '+' : ''}${n}.`, n >= 0 ? 'up' : 'down'); }
function addZone(st, p, z, n) { st.p[p].zoneBonus[z] += n; log(st, `${who(st, p)} : zone ${ZONE_NAMES[z]} +${n}.`, 'up'); }
function summon(st, p, z, id) {
  if (free(st, p, z) <= 0) return null;
  const c = { uid: st.nextUid++, id, owner: p, zone: z, buff: 0, revealed: true, order: st.order++ };
  st.p[p].board[z].push(c); log(st, `${who(st, p)} ${vb(p, 'invoque', 'invoquez')} ${nm(id)} (${ZONE_NAMES[z]}).`); return c;
}
function move(st, c, to) {
  const P = st.p[c.owner]; if (free(st, c.owner, to) <= 0) return false;
  P.board[c.zone] = P.board[c.zone].filter(x => x !== c); c.zone = to; P.board[to].push(c);
  log(st, `${nm(c.id)} se déplace vers ${ZONE_NAMES[to]}.`); return true;
}
function destroy(st, c) {
  const d = CARDS[c.id];
  if (d.indestructible) { log(st, `${d.name} ne peut pas être détruite.`); return false; }
  const P = st.p[c.owner], z = c.zone;
  if (!P.board[z].includes(c)) return false;
  P.board[z] = P.board[z].filter(x => x !== c);
  if (!d.token) P.discard.push(c);
  log(st, `${d.name} (${who(st, c.owner)}) est détruite.`, 'down');
  if (d.onDestroyed) d.onDestroyed(c, st, z);
  for (const x of ordered(st).filter(x => x.owner === c.owner && x !== c)) { const xd = CARDS[x.id]; if (xd.onAllyDestroyed) xd.onAllyDestroyed(x, st, c, z); }
  const g = GENERALS[P.general]; if (g.onAllyDestroyed) g.onAllyDestroyed(c.owner, st, c, z);
  P.terrains.forEach((t, tz) => { if (t && TERRAINS[t].onAllyDestroyed) TERRAINS[t].onAllyDestroyed(c.owner, st, c, z, tz); });
  return true;
}
// Ordre de résolution : joueur qui mène, zones de gauche à droite, ordre de pose
function ordered(st) {
  const L = st.leader; const out = [];
  for (const p of [L, 1 - L]) for (const z of [0, 1, 2]) out.push(...st.p[p].board[z].filter(c => c.revealed).sort((a, b) => a.order - b.order));
  return out;
}

// ---- Tour ----
export function startTurn(st) {
  st.turn++;
  log(st, `— Tour ${st.turn} —`, 'turn');
  for (const p of [0, 1]) { st.p[p].seals = st.turn; draw(st, p, 1); }
  if (st.turn <= 3) for (const p of [0, 1]) {
    const P = st.p[p]; const t = P.terrainPool.shift();
    const z = pick([0, 1, 2].filter(z => !P.terrains[z]));
    P.terrains[z] = t; log(st, `${who(st, p)} ${vb(p, 'révèle', 'révélez')} le terrain ${TERRAINS[t].name} (${ZONE_NAMES[z]}).`, 'terrain');
    if (TERRAINS[t].onReveal) TERRAINS[t].onReveal(p, st, z);
  }
  st.leader = computeLeader(st);
  for (const c of ordered(st)) { const d = CARDS[c.id]; if (d.onStartTurn && stillThere(st, c)) d.onStartTurn(c, st); }
}
const stillThere = (st, c) => st.p[c.owner].board[c.zone].includes(c);

// plan = { cards: [{uid, zone}], general: zone|null }
function canPlace(st, p, card, z, pendingCost) {
  return free(st, p, z) > 0 && CARDS[card.id].cost + (pendingCost || 0) <= st.p[p].seals;
}
export function placeHidden(st, p, uid, z) {
  const P = st.p[p]; const i = P.hand.findIndex(c => c.uid === uid); if (i < 0) return false;
  const c = P.hand[i]; if (free(st, p, z) <= 0 || CARDS[c.id].cost > P.seals) return false;
  P.hand.splice(i, 1); P.seals -= CARDS[c.id].cost; c.zone = z; c.revealed = false; c.order = st.order++; c.pending = true;
  P.board[z].push(c); return true;
}
function pendingOf(st, p) { return [0, 1, 2].flatMap(z => st.p[p].board[z].filter(c => c.pending)).sort((a, b) => a.order - b.order); }

// Une étape de révélation : renvoie la liste des étapes dans l'ordre
export function revealSteps(st, gen) {
  st.leader = computeLeader(st);
  const steps = [];
  for (const p of [st.leader, 1 - st.leader]) {
    if (gen[p] !== null && gen[p] !== undefined) steps.push({ kind: 'general', p, zone: gen[p] });
    for (const c of pendingOf(st, p)) steps.push({ kind: 'card', p, uid: c.uid });
  }
  return steps;
}
export function doStep(st, s) {
  const P = st.p[s.p];
  if (s.kind === 'general') {
    const g = GENERALS[P.general]; if (P.generalUsed || !g.activate) return null;
    P.generalUsed = true; log(st, `${who(st, s.p)} ${vb(s.p, 'active', 'activez')} ${g.name} (${ZONE_NAMES[s.zone]}).`, 'reveal'); g.activate(s.p, st, s.zone); return null;
  }
  const c = [0, 1, 2].flatMap(z => P.board[z]).find(x => x.uid === s.uid); if (!c) return null;
  c.pending = false; c.revealed = true;
  const d = CARDS[c.id];
  log(st, `${who(st, s.p)} ${vb(s.p, 'révèle', 'révélez')} ${d.name} (${ZONE_NAMES[c.zone]}).`, 'reveal');
  if (d.onReveal) d.onReveal(c, st);
  if (d.type === 'S') { P.board[c.zone] = P.board[c.zone].filter(x => x !== c); P.discard.push(c); }
  return c;
}
export function endTurn(st) {
  for (const c of ordered(st)) { const d = CARDS[c.id]; if (d.onEndTurn && stillThere(st, c)) d.onEndTurn(c, st); }
  if (st.turn >= TURNS) finish(st);
}
function finish(st) {
  st.over = true;
  const w = [0, 0]; const zones = [0, 1, 2].map(z => zoneWinner(st, z)); zones.forEach(r => { if (r >= 0) w[r]++; });
  const tot = [0, 1].map(p => [0, 1, 2].reduce((s, z) => s + zonePower(st, p, z), 0));
  let winner = -1, reason;
  if (w[0] >= 2) { winner = 0; reason = `${w[0]} zones sur 3`; }
  else if (w[1] >= 2) { winner = 1; reason = `${w[1]} zones sur 3`; }
  else if (tot[0] !== tot[1]) { winner = tot[0] > tot[1] ? 0 : 1; reason = `départage à la puissance totale (${tot[0]} contre ${tot[1]})`; }
  else reason = 'zones et puissance totale à égalité';
  st.result = { winner, reason, zones, tot };
  log(st, winner < 0 ? 'Match nul.' : `${who(st, winner)} ${vb(winner, 'gagne', 'gagnez')} : ${reason}.`, 'turn');
}

// ---- IA ----
function clone(st) { const c = structuredClone(st); c.sim = true; c.log = []; return c; }
function evalFor(st, p) {
  let s = 0;
  for (const z of [0, 1, 2]) { const d = zonePower(st, p, z) - zonePower(st, 1 - p, z); s += Math.tanh(d / 4) * 10; }
  return s;
}
export function aiPlan(st, p, tries) {
  tries = tries || 250;
  const P = st.p[p]; let best = { cards: [], general: null }, bestV = -Infinity;
  const g = GENERALS[P.general];
  for (let i = 0; i < tries; i++) {
    const plan = { cards: [], general: null }; let seals = P.seals; const used = [0, 0, 0].map((_, z) => P.board[z].length);
    for (const c of shuffle(P.hand)) {
      const cost = CARDS[c.id].cost; if (cost > seals || Math.random() < 0.15) continue;
      const zs = [0, 1, 2].filter(z => used[z] < SLOTS); if (!zs.length) break;
      const z = pick(zs); used[z]++; seals -= cost; plan.cards.push({ uid: c.uid, zone: z });
    }
    if (g.activate && !P.generalUsed && st.turn >= 6 && Math.random() < 0.7) plan.general = Math.floor(Math.random() * 3);
    const sim = clone(st);
    for (const x of plan.cards) placeHidden(sim, p, x.uid, x.zone);
    const gen = [null, null]; gen[p] = plan.general;
    for (const s of revealSteps(sim, gen).filter(s => s.p === p)) doStep(sim, s);
    endTurn(sim);
    const v = evalFor(sim, p) + (P.seals - sim.p[p].seals) * 0.15 + Math.random() * 0.01;
    if (v > bestV) { bestV = v; best = plan; }
  }
  return best;
}


// ---- Tour complet (serveur et partie contre l'IA) ----
// Pose les cartes valides d'un plan ; renvoie la zone d'activation du général, ou null.
export function applyPlan(st, p, plan) {
  const P = st.p[p];
  for (const x of (plan && plan.cards) || []) placeHidden(st, p, x.uid, x.zone);
  const z = plan && plan.general;
  const g = GENERALS[P.general];
  return g.activate && !P.generalUsed && [0, 1, 2].includes(z) ? z : null;
}

// Résout un tour une fois les deux plans connus. `emit(flashUid)` est appelé après chaque étape visible,
// `wait(ms)` laisse le temps à l'animation (instantané en simulation).
export async function runTurn(st, plans, emit, wait) {
  const gen = [applyPlan(st, 0, plans[0]), applyPlan(st, 1, plans[1])];
  st.phase = 'reveal';
  const steps = revealSteps(st, gen);
  emit(null); await wait(500);
  for (const s of steps) { const c = doStep(st, s); emit(c ? c.uid : null); await wait(600); }
  endTurn(st);
  if (st.over) { st.phase = 'over'; emit(null); return; }
  emit(null); await wait(350);
  startTurn(st); st.phase = 'plan'; emit(null);
}

// Vue d'une partie pour un siège : la main et les cartes cachées de l'adversaire ne sont jamais envoyées.
export function viewFor(st, seat, extra = {}) {
  const side = (p, isMe) => {
    const P = st.p[p];
    return {
      name: P.name, deckKey: P.deckKey, general: P.general, generalUsed: P.generalUsed,
      hand: isMe ? P.hand.map(c => ({ uid: c.uid, id: c.id })) : undefined,
      handCount: P.hand.length, deckCount: P.deck.length, seals: P.seals,
      terrains: P.terrains.slice(), zoneBonus: P.zoneBonus.slice(),
      board: P.board.map(z => z.slice().sort((a, b) => a.order - b.order).map(c =>
        c.revealed ? { uid: c.uid, id: c.id, revealed: true, power: power(st, c) }
          : isMe ? { uid: c.uid, id: c.id, revealed: false } : { uid: c.uid, hidden: true })),
      zonePower: [0, 1, 2].map(z => zonePower(st, p, z)),
    };
  };
  return {
    seat, turn: st.turn, turns: TURNS, phase: st.phase || 'plan',
    me: side(seat, true), foe: side(1 - seat, false),
    log: st.log.slice(-80), result: st.result || null, ...extra,
  };
}

// Remplace les marqueurs du journal pour le joueur `seat`.
export function renderLog(msg, seat, names) {
  return msg
    .replace(/⟦(\d)\|([^|⟧]*)\|([^⟧]*)⟧/g, (_, p, il, vous) => (+p === seat ? vous : il))
    .replace(/⟦(\d)⟧/g, (_, p) => (+p === seat ? 'Vous' : names[+p]));
}
