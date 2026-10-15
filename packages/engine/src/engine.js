// Moteur de règles : pur, sans DOM ni réseau. Partagé par le serveur (parties en ligne) et l'appli (partie contre l'IA).
import { t, tMsg, msg } from './i18n.js';
export const TURNS = 7, SLOTS = 4, HAND_MAX = 7, START_HAND = 3;
// Nombre de tours de la partie : TURNS, sauf partie plus courte (newGame, opts.turns).
const turnsOf = st => st.turns || TURNS;
export const ZONE_NAMES = ['Gauche', 'Centre', 'Droite'];
export const FAMILIES = ['Ange', 'Démon', 'Gobelin', 'Elfe', 'Dragon', 'Mort-vivant', 'Vampire', 'Hacker', 'Cyborg'];

const isCreature = c => CARDS[c.id].type === 'C';
const hasKw = (c, k) => CARDS[c.id].kw.includes(k);
const half = n => Math.floor(n / 2);

// ---- Cartes du set 1 ----
// Crochets : onReveal, self (bonus persistant sur soi), aura (bonus persistant sur les autres), onStartTurn, onEndTurn,
// grace (fin de tour si tous les sceaux sont dépensés), onDestroyed, onAllyDestroyed, onMove, costFn (réduction de coût),
// onInspire (pioche hors début de tour), onSpell (sort révélé), onSwitch (changement de camp).
// Mots-clés : x (coût X), sacrifice (nombre de créatures à sacrifier), mobile (Déplaçable), token (jeton),
// raise (Relève), egg (Œuf), firewall (Pare-feu : jamais piratée), malware (jeton exécuté à la pioche), set (set d'origine, « base » si absent).
export const CARDS = {
  // ANGE : Grâce
  cherubin:    { name: 'Chérubin', type: 'C', cost: 1, power: 1, kw: ['Ange'], text: 'Grâce : +1.',
                 grace: (c, st) => buff(st, c, 1) },
  benediction: { name: 'Bénédiction', type: 'S', cost: 1, power: 0, kw: ['Ange'], text: 'Vos créatures ici gagnent +1.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).forEach(x => buff(st, x, 1)) },
  priere:      { name: 'Prière', type: 'S', cost: 0, x: true, power: 0, kw: ['Ange'], text: 'Coût X : dépense tous vos sceaux restants. Votre créature la plus faible ici gagne +X+1.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) buff(st, w, (c.xPaid || 0) + 1); } },
  gardien:     { name: 'Ange gardien', type: 'C', cost: 2, power: 2, kw: ['Ange'], text: 'Persistant : vos autres créatures ici ont +1.',
                 aura: (s, t) => t.owner === s.owner && t.zone === s.zone && t !== s ? 1 : 0 },
  messagere:   { name: 'Messagère', type: 'C', cost: 2, power: 2, kw: ['Ange'], text: 'Grâce : une autre de vos créatures ici gagne +1.',
                 grace: (c, st) => { const o = creaturesAt(st, c.owner, c.zone).filter(x => x !== c); if (o.length) buff(st, pick(o), 1); } },
  annonciatrice:{ name: 'Annonciatrice', type: 'C', cost: 2, power: 2, kw: ['Ange'], text: 'Révélation : +1 sceau au tour suivant.',
                 onReveal: (c, st) => { st.p[c.owner].bonusSeals++; log(st, '⟦{p}⟧ : +1 sceau au tour suivant.', 'up', { p: c.owner }); } },
  heraut:      { name: 'Héraut céleste', type: 'C', cost: 3, power: 3, kw: ['Ange'], text: 'Révélation : vos autres Anges gagnent +1.',
                 onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  juge:        { name: 'Juge céleste', type: 'C', cost: 3, power: 4, kw: ['Ange'], text: 'Grâce : la créature adverse la plus puissante ici perd 1.',
                 grace: (c, st) => { const s = strongest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (s) buff(st, s, -1); } },
  dominion:    { name: 'Dominion', type: 'C', cost: 5, power: 4, kw: ['Ange'], text: 'Grâce : vos autres Anges gagnent +1.',
                 grace: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  seraphin:    { name: 'Séraphin', type: 'C', cost: 5, power: 6, kw: ['Ange'], text: 'Révélation : +1 par tour précédent où vous avez dépensé tous vos sceaux.',
                 onReveal: (c, st) => { const n = st.p[c.owner].perfectTurns; if (n) buff(st, c, n); } },
  archange:    { name: 'Archange', type: 'C', cost: 6, power: 8, kw: ['Ange'], text: 'Révélation : vos autres créatures ici gagnent +1.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => buff(st, x, 1)) },

  // DÉMON : Sacrifice
  diablotin:   { name: 'Diablotin', type: 'C', cost: 1, power: 1, kw: ['Démon'], text: 'Destruction : votre zone ici gagne +2.',
                 onDestroyed: (c, st, z) => addZone(st, c.owner, z, 2) },
  cultiste:    { name: 'Cultiste', type: 'C', cost: 1, power: 1, kw: ['Démon'], text: 'Révélation : créez une Chèvre ici.',
                 onReveal: (c, st) => summon(st, c.owner, c.zone, 'chevre') },
  pacte:       { name: 'Marché des âmes', type: 'S', cost: 1, power: 0, kw: ['Démon'], text: 'Détruisez votre créature la plus faible ici, puis piochez une carte.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) destroy(st, w, c.owner); draw(st, c.owner, 1, true); } },
  bourreau:    { name: 'Bourreau', type: 'C', cost: 2, power: 3, kw: ['Démon'], text: 'Quand une de vos autres créatures ici est détruite : +2.',
                 onAllyDestroyed: (c, st, dead, z) => { if (z === c.zone) buff(st, c, 2); } },
  molosse:     { name: 'Molosse infernal', type: 'C', cost: 2, power: 5, kw: ['Démon'], sacrifice: 1, text: 'Sacrifice.' },
  rituel:      { name: 'Rituel d\'invocation', type: 'S', cost: 2, power: 0, kw: ['Démon'], text: 'Détruisez votre créature la plus faible ici, puis invoquez ici la première créature de votre deck, avec son effet Révélation.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) destroy(st, w, c.owner); callFromDeck(st, c.owner, c.zone); } },
  demon_majeur:{ name: 'Démon majeur', type: 'C', cost: 3, power: 8, kw: ['Démon'], sacrifice: 1, text: 'Sacrifice.' },
  moissonneur: { name: 'Moissonneur d\'âmes', type: 'C', cost: 3, power: 3, kw: ['Démon'], text: 'Persistant : +1 par créature que vous avez perdue cette partie.',
                 self: (c, st) => st.p[c.owner].lost },
  bete:        { name: 'Bête des abysses', type: 'C', cost: 4, power: 9, kw: ['Démon'], sacrifice: 2, text: 'Sacrifice 2.' },
  seigneur:    { name: 'Seigneur des fosses', type: 'C', cost: 5, power: 6, kw: ['Démon'], text: 'Quand une de vos autres créatures est détruite : +2.',
                 onAllyDestroyed: (c, st) => buff(st, c, 2) },
  archidemon:  { name: 'Archidémon', type: 'C', cost: 6, power: 11, kw: ['Démon'], sacrifice: 1, text: 'Sacrifice. Révélation : les créatures adverses ici perdent 1.',
                 onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => buff(st, x, -1)) },

  // GOBELIN : Horde
  eclaireur:   { name: 'Gobelin éclaireur', type: 'C', cost: 1, power: 1, kw: ['Gobelin'], text: 'Révélation : Horde 1.',
                 onReveal: (c, st) => horde(st, c.owner, c.zone, 1) },
  appel:       { name: 'Appel de la horde', type: 'S', cost: 1, power: 0, kw: ['Gobelin'], text: 'Horde 2.',
                 onReveal: (c, st) => horde(st, c.owner, c.zone, 2) },
  recruteur:   { name: 'Recruteur', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], text: 'Révélation : Horde 2.',
                 onReveal: (c, st) => horde(st, c.owner, c.zone, 2) },
  chaman:      { name: 'Chaman gobelin', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], text: 'Fin de tour : votre Horde ici gagne +1.',
                 onEndTurn: (c, st) => { const h = hordeAt(st, c.owner, c.zone); if (h) buff(st, h, 1); else return false; } },
  pyromane:    { name: 'Gobelin pyromane', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], text: 'Révélation : détruisez la créature adverse la plus faible ici si sa puissance est 3 ou moins.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w && power(st, w) <= 3) destroy(st, w, c.owner); } },
  proliferation:{ name: 'Prolifération', type: 'S', cost: 2, power: 0, kw: ['Gobelin'], text: 'Chacune de vos Hordes gagne +2.',
                 onReveal: (c, st) => hordes(st, c.owner).forEach(h => buff(st, h, 2)) },
  chef:        { name: 'Chef de bande', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], text: 'Révélation : Horde 1 dans chacune de vos zones.',
                 onReveal: (c, st) => [0, 1, 2].forEach(z => horde(st, c.owner, z, 1)) },
  porte_etendard:{ name: 'Porte-étendard', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], text: 'Persistant : vos Hordes ont +1.',
                 aura: (s, t) => t.owner === s.owner && t.id === 'horde' ? 1 : 0 },
  bombardier:  { name: 'Bombardier', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], text: 'Destruction : détruisez une créature adverse au hasard ici.',
                 onDestroyed: (c, st, z) => { const e = creaturesAt(st, 1 - c.owner, z); if (e.length) destroy(st, pick(e), c.owner); } },
  grand_chef:  { name: 'Grand-chef', type: 'C', cost: 4, power: 4, kw: ['Gobelin'], text: 'Révélation : Horde X, X étant le nombre de vos Gobelins en jeu.',
                 onReveal: (c, st) => horde(st, c.owner, c.zone, mine(st, c.owner).filter(x => hasKw(x, 'Gobelin')).length) },
  seigneur_guerre:{ name: 'Seigneur de guerre', type: 'C', cost: 5, power: 5, kw: ['Gobelin'], text: 'Révélation : doublez la puissance de votre Horde ici.',
                 onReveal: (c, st) => { const h = hordeAt(st, c.owner, c.zone); if (h) { const v = power(st, h); if (v > 0) buff(st, h, v); } } },

  // ELFE : Déplaçable et Déplacement
  eclaireuse:  { name: 'Éclaireuse sylvestre', type: 'C', cost: 1, power: 2, kw: ['Elfe'], mobile: true, text: 'Déplaçable.' },
  feu_follet:  { name: 'Feu follet', type: 'C', cost: 1, power: 1, kw: ['Elfe'], mobile: true, text: 'Déplaçable. Déplacement : +1.',
                 onMove: (c, st) => buff(st, c, 1) },
  vent:        { name: 'Vent des clairières', type: 'S', cost: 1, power: 0, kw: ['Elfe'], text: 'Déplacez votre créature la plus faible d\'ici vers une autre zone ; elle gagne +1.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); const to = w && bestZone(st, c.owner, c.zone);
                   if (to !== null && to !== undefined && move(st, w, to)) buff(st, w, 1); } },
  rodeuse:     { name: 'Rôdeuse', type: 'C', cost: 2, power: 3, kw: ['Elfe'], mobile: true, text: 'Déplaçable. Déplacement : la créature adverse la plus faible de la zone d\'arrivée perd 1.',
                 onMove: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w) buff(st, w, -1); } },
  druidesse:   { name: 'Druidesse', type: 'C', cost: 2, power: 3, kw: ['Elfe'], text: 'Révélation : déplacez une autre de vos créatures d\'ici vers une autre zone.',
                 onReveal: (c, st) => { const o = creaturesAt(st, c.owner, c.zone).filter(x => x !== c); const to = bestZone(st, c.owner, c.zone);
                   if (o.length && to !== null) move(st, weakest(st, o), to); } },
  sentier:     { name: 'Sentier caché', type: 'S', cost: 1, power: 0, kw: ['Elfe'], text: 'Vos créatures ici deviennent Déplaçables.',
                 onReveal: (c, st) => { const o = creaturesAt(st, c.owner, c.zone); o.forEach(x => { x.mobile = true; }); if (o.length) log(st, '{n} créature(s) deviennent Déplaçables.', '', { n: o.length }); } },
  archere:     { name: 'Archère des cimes', type: 'C', cost: 3, power: 5, kw: ['Elfe'], mobile: true, text: 'Déplaçable.' },
  canopee:     { name: 'Gardien de la canopée', type: 'C', cost: 3, power: 3, kw: ['Elfe'], text: 'Fin de tour : vos créatures qui se sont déplacées ce tour gagnent +1.',
                 onEndTurn: (c, st) => { const m = movedThisTurn(st, c.owner); m.forEach(x => buff(st, x, 1)); if (!m.length) return false; } },
  cerf:        { name: 'Chevaucheur de cerf', type: 'C', cost: 4, power: 5, kw: ['Elfe'], mobile: true, text: 'Déplaçable. Déplacement : +2.',
                 onMove: (c, st) => buff(st, c, 2) },
  sylvain:     { name: 'Ancien sylvain', type: 'C', cost: 5, power: 7, kw: ['Elfe'], text: 'Fin de tour : si une de vos créatures s\'est déplacée ce tour, +2.',
                 onEndTurn: (c, st) => { if (movedThisTurn(st, c.owner).length) buff(st, c, 2); else return false; } },
  reine:       { name: 'Reine sylvestre', type: 'C', cost: 6, power: 7, kw: ['Elfe'], text: 'Persistant : vos créatures sont Déplaçables.' },

  // DRAGON : Trésor
  dragonnet:   { name: 'Dragonnet', type: 'C', cost: 1, power: 1, kw: ['Dragon'], text: 'Début de tour : si vous avez gardé au moins 1 sceau au tour précédent, +1.',
                 onStartTurn: (c, st) => { if (st.p[c.owner].lastUnspent > 0) buff(st, c, 1); } },
  gardien_magot:{ name: 'Gardien du magot', type: 'C', cost: 1, power: 0, kw: ['Dragon'], text: 'Révélation : créez un Magot de dragon ici.',
                 onReveal: (c, st) => summon(st, c.owner, c.zone, 'magot') },
  thesauriser: { name: 'Thésauriser', type: 'S', cost: 1, power: 0, kw: ['Dragon'], text: 'Votre Trésor gagne +2.',
                 onReveal: (c, st) => { st.p[c.owner].treasure += 2; log(st, '⟦{p}⟧ : Trésor +2.', 'up', { p: c.owner }); } },
  oeuf:        { name: 'Œuf de dragon', type: 'C', cost: 2, power: 0, kw: ['Dragon'], text: 'Début du tour 6 : gagne autant de puissance que votre Trésor.',
                 onStartTurn: (c, st) => { if (st.turn === 6 && st.p[c.owner].treasure) buff(st, c, st.p[c.owner].treasure); } },
  drake:       { name: 'Drake avide', type: 'C', cost: 3, power: 3, kw: ['Dragon'], text: 'Révélation : +1 par tranche de 2 de votre Trésor.',
                 onReveal: (c, st) => { const n = half(st.p[c.owner].treasure); if (n) buff(st, c, n); } },
  souffle:     { name: 'Souffle de feu', type: 'S', cost: 2, power: 0, kw: ['Dragon'], text: 'Les créatures adverses ici perdent 1.',
                 onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => buff(st, x, -1)) },
  wyverne:     { name: 'Wyverne', type: 'C', cost: 4, power: 5, kw: ['Dragon'], text: 'Révélation : +3 si vous avez un autre Dragon en jeu.',
                 onReveal: (c, st) => { if (mine(st, c.owner).some(x => x !== c && hasKw(x, 'Dragon'))) buff(st, c, 3); } },
  cavernes:    { name: 'Dragon des cavernes', type: 'C', cost: 4, power: 5, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3) },
  rouge:       { name: 'Dragon rouge', type: 'C', cost: 5, power: 6, kw: ['Dragon'], text: 'Persistant : +1 par tranche de 3 de votre Trésor.',
                 self: (c, st) => Math.floor(st.p[c.owner].treasure / 3) },
  ancien:      { name: 'Dragon ancien', type: 'C', cost: 6, power: 9, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3) },
  dragon_or:   { name: 'Dragon d\'or', type: 'C', cost: 7, power: 11, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3) },

  // NEUTRES
  potion:      { name: 'Potion de force', type: 'S', cost: 1, power: 0, kw: [], text: 'Votre créature la plus forte ici gagne +2.',
                 onReveal: (c, st) => { const s = strongest(st, creaturesAt(st, c.owner, c.zone)); if (s) buff(st, s, 2); } },
  mercenaire:  { name: 'Mercenaire', type: 'C', cost: 2, power: 3, kw: [], text: '' },
  barde:       { name: 'Barde errant', type: 'C', cost: 2, power: 1, kw: [], text: 'Révélation : piochez une carte.',
                 onReveal: (c, st) => draw(st, c.owner, 1, true) },
  golem:       { name: 'Golem de pierre', type: 'C', cost: 4, power: 6, kw: [], text: '' },
  colosse:     { name: 'Colosse', type: 'C', cost: 6, power: 9, kw: [], text: '' },

  // ---- Set 2 : Crépuscule ----
  // MORT-VIVANT : Défausse, Relève et Exhumation
  squelette:   { set: 'set2', name: 'Squelette', type: 'C', cost: 1, power: 1, kw: ['Mort-vivant'], raise: true, text: 'Relève.' },
  goule:       { set: 'set2', name: 'Goule affamée', type: 'C', cost: 1, power: 2, kw: ['Mort-vivant'], raise: true, text: 'Relève. Révélation : Défausse 1.',
                 onReveal: (c, st) => discardFromHand(st, c.owner, 1) },
  fossoyeur:   { set: 'set2', name: 'Fossoyeur', type: 'C', cost: 2, power: 3, kw: ['Mort-vivant'], text: 'Révélation : Défausse 1, puis piochez 1 carte.',
                 onReveal: (c, st) => { discardFromHand(st, c.owner, 1); draw(st, c.owner, 1, true); } },
  zombie:      { set: 'set2', name: 'Zombie', type: 'C', cost: 2, power: 4, kw: ['Mort-vivant'], raise: true, text: 'Relève.' },
  spectre:     { set: 'set2', name: 'Spectre hurlant', type: 'C', cost: 3, power: 4, kw: ['Mort-vivant'], raise: true, text: 'Relève. Révélation : la créature adverse la plus puissante ici perd 2.',
                 onReveal: (c, st) => { const s = strongest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (s) buff(st, s, -2); } },
  necromancien:{ set: 'set2', name: 'Nécromancien', type: 'C', cost: 3, power: 3, kw: ['Mort-vivant'], text: 'Révélation : Exhumation ici de la créature la plus puissante de votre défausse qui coûte 4 ou moins.',
                 onReveal: (c, st) => exhume(st, c.owner, c.zone, 4) },
  chevalier_mort:{ set: 'set2', name: 'Chevalier de la mort', type: 'C', cost: 4, power: 6, kw: ['Mort-vivant'], raise: true, text: 'Relève. Révélation : Défausse 1.',
                 onReveal: (c, st) => discardFromHand(st, c.owner, 1) },
  liche:       { set: 'set2', name: 'Liche', type: 'C', cost: 5, power: 5, kw: ['Mort-vivant'], text: 'Persistant : +1 par tranche de 2 cartes dans votre défausse.',
                 self: (c, st) => half(st.p[c.owner].discard.length) },
  seigneur_os: { set: 'set2', name: 'Seigneur des os', type: 'C', cost: 6, power: 8, kw: ['Mort-vivant'], text: 'Révélation : Défausse 2, puis vos autres Morts-vivants en jeu gagnent +2.',
                 onReveal: (c, st) => { discardFromHand(st, c.owner, 2); mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Mort-vivant')).forEach(x => buff(st, x, 2)); } },
  danse_macabre:{ set: 'set2', name: 'Danse macabre', type: 'S', cost: 2, power: 0, kw: ['Mort-vivant'], text: 'Défausse 2, puis piochez 2 cartes.',
                 onReveal: (c, st) => { discardFromHand(st, c.owner, 2); draw(st, c.owner, 2, true); } },
  reanimation: { set: 'set2', name: 'Réanimation', type: 'S', cost: 2, power: 0, kw: ['Mort-vivant'], text: 'Exhumation ici de la créature la plus puissante de votre défausse.',
                 onReveal: (c, st) => exhume(st, c.owner, c.zone) },

  // VAMPIRE : Drain
  chauve_souris:{ set: 'set2', name: 'Chauve-souris', type: 'C', cost: 1, power: 0, kw: ['Vampire'], text: 'Révélation : Drain 1 sur une créature au hasard de la main adverse.',
                 onReveal: (c, st) => drainHand(st, c, 1, 1) },
  novice:      { set: 'set2', name: 'Vampire novice', type: 'C', cost: 1, power: 0, kw: ['Vampire'], text: 'Révélation : Drain 1 sur la créature adverse la plus faible ici.',
                 onReveal: (c, st) => drain(st, c, weakest(st, creaturesAt(st, 1 - c.owner, c.zone)), 1) },
  servante:    { set: 'set2', name: 'Servante de sang', type: 'C', cost: 2, power: 0, kw: ['Vampire'], text: 'Révélation : Drain 1 sur la créature adverse la plus puissante ici, et Drain 1 sur une créature de la main adverse.',
                 onReveal: (c, st) => { drain(st, c, strongest(st, creaturesAt(st, 1 - c.owner, c.zone)), 1); drainHand(st, c, 1, 1); } },
  rodeur_nuit: { set: 'set2', name: 'Rôdeur nocturne', type: 'C', cost: 2, power: 1, kw: ['Vampire'], text: 'Révélation : Drain 1 sur la première créature du deck adverse.',
                 onReveal: (c, st) => st.p[1 - c.owner].deck.filter(isCreature).slice(0, 1).forEach(x => drain(st, c, x, 1, 'deck')) },
  noble:       { set: 'set2', name: 'Noble vampire', type: 'C', cost: 4, power: 1, kw: ['Vampire'], text: 'Fin de tour : Drain 1 sur la créature adverse la plus puissante ici.',
                 onEndTurn: (c, st) => { const s = strongest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (s) drain(st, c, s, 1); else return false; } },
  buveuse:     { set: 'set2', name: 'Buveuse d\'âmes', type: 'C', cost: 3, power: 2, kw: ['Vampire'], text: 'Révélation : Drain 2 sur une créature au hasard de la main adverse.',
                 onReveal: (c, st) => drainHand(st, c, 1, 2) },
  comtesse:    { set: 'set2', name: 'Comtesse sanglante', type: 'C', cost: 5, power: 3, kw: ['Vampire'], text: 'Révélation : Drain 1 sur chaque créature adverse ici.',
                 onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => drain(st, c, x, 1)) },
  seigneur_vampire:{ set: 'set2', name: 'Seigneur vampire', type: 'C', cost: 5, power: 3, kw: ['Vampire'], text: 'Persistant : +1 par tranche de 2 de puissance que vous avez volée cette partie.',
                 self: (c, st) => half(st.p[c.owner].stolen || 0) },
  prince_nuit: { set: 'set2', name: 'Prince de la nuit', type: 'C', cost: 6, power: 3, kw: ['Vampire'], text: 'Révélation : Drain 2 sur la créature adverse la plus puissante en jeu, puis Drain 1 sur une créature de la main adverse.',
                 onReveal: (c, st) => { drain(st, c, strongest(st, mine(st, 1 - c.owner)), 2); drainHand(st, c, 1, 1); } },
  saignee:     { set: 'set2', name: 'Saignée', type: 'S', cost: 2, power: 0, kw: ['Vampire'], text: 'La créature adverse la plus puissante ici perd 2 ; votre créature la plus faible ici gagne +2.',
                 onReveal: (c, st) => drain(st, weakest(st, creaturesAt(st, c.owner, c.zone)), strongest(st, creaturesAt(st, 1 - c.owner, c.zone)), 2) },
  nuit_rouge:  { set: 'set2', name: 'Nuit rouge', type: 'S', cost: 4, power: 0, kw: ['Vampire'], text: 'Les créatures adverses ici perdent 1. Vos Vampires en jeu gagnent +1.',
                 onReveal: (c, st) => { creaturesAt(st, 1 - c.owner, c.zone).forEach(x => buff(st, x, -1)); mine(st, c.owner).filter(x => hasKw(x, 'Vampire')).forEach(x => buff(st, x, 1)); } },

  // GOBELIN : Festin
  marmiton:    { set: 'set2', name: 'Marmiton', type: 'C', cost: 1, power: 1, kw: ['Gobelin'], text: 'Révélation : Festin 1.',
                 onReveal: (c, st) => feast(st, c.owner, c.zone, 1) },
  cuistot:     { set: 'set2', name: 'Cuistot de la horde', type: 'C', cost: 2, power: 0, kw: ['Gobelin'], text: 'Révélation : Festin 2.',
                 onReveal: (c, st) => feast(st, c.owner, c.zone, 2) },
  goinfre:     { set: 'set2', name: 'Goinfre', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], text: 'Quand il dévore un Festin, il gagne +2 de plus.' },
  grand_banquet:{ set: 'set2', name: 'Grand banquet', type: 'S', cost: 2, power: 0, kw: ['Gobelin'], text: 'Festin 1 dans chacune de vos zones.',
                 onReveal: (c, st) => [0, 1, 2].forEach(z => feast(st, c.owner, z, 1)) },
  panse_fer:   { set: 'set2', name: 'Panse-de-fer', type: 'C', cost: 4, power: 4, kw: ['Gobelin'], text: 'Fin de tour : dévore les Festins de vos autres zones.',
                 onEndTurn: (c, st) => { const f = [0, 1, 2].filter(z => z !== c.zone).map(z => feastAt(st, c.owner, z)).filter(Boolean);
                   f.forEach(x => devour(st, c, x)); if (!f.length) return false; } },
  roi_glouton: { set: 'set2', name: 'Roi glouton', type: 'C', cost: 5, power: 5, kw: ['Gobelin'], text: 'Persistant : +1 par Festin dévoré par vos Gobelins cette partie.',
                 self: (c, st) => st.p[c.owner].feasts || 0 },

  // ANGE : Inspiration (pioche hors début de tour)
  scribe:      { set: 'set2', name: 'Scribe céleste', type: 'C', cost: 2, power: 1, kw: ['Ange'], text: 'Inspiration : +1.',
                 onInspire: (c, st) => buff(st, c, 1) },
  oracle:      { set: 'set2', name: 'Oracle', type: 'C', cost: 2, power: 0, kw: ['Ange'], text: 'Révélation : piochez 1 carte.',
                 onReveal: (c, st) => draw(st, c.owner, 1, true) },
  ecritures:   { set: 'set2', name: 'Écritures saintes', type: 'S', cost: 3, power: 0, kw: ['Ange'], text: 'Piochez 2 cartes.',
                 onReveal: (c, st) => draw(st, c.owner, 2, true) },
  archiviste:  { set: 'set2', name: 'Gardienne des archives', type: 'C', cost: 4, power: 3, kw: ['Ange'], text: 'Inspiration : vos autres Anges ici gagnent +1.',
                 onInspire: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  muse:        { set: 'set2', name: 'Muse ailée', type: 'C', cost: 4, power: 2, kw: ['Ange'], text: 'Révélation : piochez 1 carte ; si c\'est un Ange, il gagne +1.',
                 onReveal: (c, st) => draw(st, c.owner, 1, true).filter(x => hasKw(x, 'Ange')).forEach(x => { x.buff += 1; log(st, "⟦{p}⟧ : l'Ange pioché gagne +1.", 'up', { p: c.owner }); }) },
  choeur:      { set: 'set2', name: 'Chœur céleste', type: 'C', cost: 6, power: 4, kw: ['Ange'], text: 'Révélation : les Anges de votre main gagnent +1.',
                 onReveal: (c, st) => { const a = st.p[c.owner].hand.filter(x => hasKw(x, 'Ange')); a.forEach(x => { x.buff++; }); if (a.length) log(st, '⟦{p}⟧ : Anges en main +1.', 'up', { p: c.owner }); } },

  // DRAGON : Œufs
  oeuf_braise: { set: 'set2', name: 'Œuf de braise', type: 'C', cost: 1, power: 0, kw: ['Dragon'], egg: true, text: 'Œuf. Éclosion : au début du 3e tour après sa pose.',
                 onStartTurn: (c, st) => { if (st.turn >= c.enteredTurn + 3) hatch(st, c); } },
  oeuf_or:     { set: 'set2', name: 'Œuf doré', type: 'C', cost: 2, power: 0, kw: ['Dragon'], egg: true, text: 'Œuf. Éclosion : en fin de tour, si votre Trésor est de 6 ou plus.',
                 onEndTurn: (c, st) => { if (st.p[c.owner].treasure >= 6) hatch(st, c); else return false; } },
  oeuf_tempete:{ set: 'set2', name: 'Œuf de tempête', type: 'C', cost: 2, power: 1, kw: ['Dragon'], egg: true, text: 'Œuf. Éclosion : quand une autre de vos créatures ici est détruite.',
                 onAllyDestroyed: (c, st, dead, z) => { if (z === c.zone) hatch(st, c); } },
  couveuse:    { set: 'set2', name: 'Dragonne couveuse', type: 'C', cost: 3, power: 3, kw: ['Dragon'], text: 'Révélation : un de vos Œufs en jeu éclot.',
                 onReveal: (c, st) => { const e = eggs(st, c.owner); if (e.length) hatch(st, e[0]); } },
  couvaison:   { set: 'set2', name: 'Couvaison', type: 'S', cost: 2, power: 0, kw: ['Dragon'], text: 'Vos Œufs ici éclosent.',
                 onReveal: (c, st) => eggs(st, c.owner).filter(x => x.zone === c.zone).forEach(x => hatch(st, x)) },
  matriarche:  { set: 'set2', name: 'Matriarche des couvées', type: 'C', cost: 5, power: 5, kw: ['Dragon'], text: 'Persistant : vos créatures écloses ont +2.',
                 aura: (s, t) => t.owner === s.owner && t.hatched ? 2 : 0 },

  // DÉMON : Échange (contrôle)
  ame_damnee:  { set: 'set2', name: 'Âme damnée', type: 'C', cost: 1, power: -2, kw: ['Démon'], text: 'Révélation : piochez 1 carte.',
                 onReveal: (c, st) => draw(st, c.owner, 1, true) },
  possede:     { set: 'set2', name: 'Possédé', type: 'C', cost: 1, power: -3, kw: ['Démon'], text: 'Quand il change de camp, les créatures de son nouveau camp ici perdent 1.',
                 onSwitch: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => buff(st, x, -1)) },
  tentateur:   { set: 'set2', name: 'Tentateur', type: 'C', cost: 2, power: 2, kw: ['Démon'], text: 'Révélation : créez une Chèvre ici, puis Échange avec la créature adverse la plus faible ici.',
                 onReveal: (c, st) => { summon(st, c.owner, c.zone, 'chevre'); swap(st, c.owner, c.zone, l => weakest(st, l)); } },
  corrupteur:  { set: 'set2', name: 'Corrupteur', type: 'C', cost: 3, power: 2, kw: ['Démon'], text: 'Révélation : Échange avec la créature adverse la plus puissante ici dont la puissance est 4 ou moins.',
                 onReveal: (c, st) => swap(st, c.owner, c.zone, l => strongest(st, l.filter(x => power(st, x) <= 4))) },
  marche_dupes:{ set: 'set2', name: 'Marché de dupes', type: 'S', cost: 3, power: 0, kw: ['Démon'], text: 'Échange avec la créature adverse la plus puissante ici.',
                 onReveal: (c, st) => swap(st, c.owner, c.zone, l => strongest(st, l)) },
  archidiable: { set: 'set2', name: 'Archidiable', type: 'C', cost: 6, power: 6, kw: ['Démon'], text: 'Révélation : Échange dans chacune de vos zones, avec la créature adverse la plus faible.',
                 onReveal: (c, st) => [0, 1, 2].forEach(z => swap(st, c.owner, z, l => weakest(st, l))) },

  // ELFE : Sortilège
  apprentie:   { set: 'set2', name: 'Apprentie arcaniste', type: 'C', cost: 1, power: 2, kw: ['Elfe'], text: 'Sortilège : +1.',
                 onSpell: (c, st) => buff(st, c, 1) },
  lueur:       { set: 'set2', name: 'Lueur des sylves', type: 'S', cost: 1, power: 0, kw: ['Elfe'], text: 'Votre zone ici gagne +3.',
                 onReveal: (c, st) => addZone(st, c.owner, c.zone, 3) },
  ronces:      { set: 'set2', name: 'Ronces', type: 'S', cost: 2, power: 0, kw: ['Elfe'], text: 'La zone adverse ici perd 3.',
                 onReveal: (c, st) => addZone(st, 1 - c.owner, c.zone, -3) },
  mage_bois:   { set: 'set2', name: 'Mage des bois', type: 'C', cost: 3, power: 5, kw: ['Elfe'], text: 'Sortilège : la créature adverse la plus puissante dans la zone du sort perd 1.',
                 onSpell: (c, st, z) => { const s = strongest(st, creaturesAt(st, 1 - c.owner, z)); if (s) buff(st, s, -1); } },
  chant:       { set: 'set2', name: 'Chant des étoiles', type: 'S', cost: 2, power: 0, kw: ['Elfe'], text: 'Votre zone ici gagne +1 par sort que vous avez révélé cette partie, celui-ci compris.',
                 onReveal: (c, st) => addZone(st, c.owner, c.zone, st.p[c.owner].spells || 1) },
  grand_druide:{ set: 'set2', name: 'Grand druide', type: 'C', cost: 5, power: 6, kw: ['Elfe'], text: 'Persistant : vos sorts coûtent 1 de moins.' },

  // NEUTRES
  pilleur:     { set: 'set2', name: 'Pilleur de tombes', type: 'C', cost: 2, power: 2, kw: [], text: 'Révélation : reprenez en main la dernière carte de votre défausse.',
                 onReveal: (c, st) => { const P = st.p[c.owner], x = P.discard.at(-1); if (!x || P.hand.length >= HAND_MAX) return;
                   P.discard.pop(); P.hand.push(fresh(x)); log(st, '⟦{p}⟧ ⟦{p}|reprend|reprenez⟧ {card} en main.', 'up', { p: c.owner, card: nm(x.id) }); } },
  alchimiste:  { set: 'set2', name: 'Alchimiste', type: 'C', cost: 2, power: 1, kw: [], text: 'Révélation : les sorts de votre main coûtent 1 de moins.',
                 onReveal: (c, st) => { const s = st.p[c.owner].hand.filter(x => CARDS[x.id].type === 'S' && !CARDS[x.id].x); s.forEach(x => { x.discount = (x.discount || 0) - 1; });
                   if (s.length) log(st, '⟦{p}⟧ : sorts en main -1 sceau.', 'up', { p: c.owner }); } },
  garde_pont:  { set: 'set2', name: 'Garde du pont', type: 'C', cost: 3, power: 3, kw: [], text: 'Persistant : +2 si l\'adversaire a plus de créatures que vous ici.',
                 self: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).length > creaturesAt(st, c.owner, c.zone).length ? 2 : 0 },
  chevalier:   { set: 'set2', name: 'Chevalier errant', type: 'C', cost: 3, power: 4, kw: [], text: '' },
  titan:       { set: 'set2', name: 'Titan des plaines', type: 'C', cost: 7, power: 11, kw: [], text: '' },

  // ---- Set 3 : Cité Néon ----
  // HACKER : Malware (cartes piégées dans le deck adverse) et Piratage (effets coupés)
  script_kiddie:{ set: 'set3', name: 'Script-kiddie', type: 'C', cost: 1, power: 2, kw: ['Hacker'], text: 'Révélation : Malware 1.',
                 onReveal: (c, st) => malware(st, c.owner, 1) },
  brouilleur:  { set: 'set3', name: 'Brouilleur', type: 'C', cost: 1, power: 2, kw: ['Hacker'], text: 'Persistant : les créatures adverses piratées ici ont -1.',
                 aura: (s, t) => t.owner !== s.owner && t.zone === s.zone && t.hacked ? -1 : 0 },
  glitcheuse:  { set: 'set3', name: 'Glitcheuse', type: 'C', cost: 2, power: 1, kw: ['Hacker'], text: 'Révélation : Piratage sur la créature adverse la plus puissante ici.',
                 onReveal: (c, st) => hack(st, strongestFoe(st, c)) },
  injection:   { set: 'set3', name: 'Injection', type: 'S', cost: 1, power: 0, kw: ['Hacker'], text: 'Malware 2.',
                 onReveal: (c, st) => malware(st, c.owner, 2) },
  casseuse:    { set: 'set3', name: 'Casseuse de code', type: 'C', cost: 2, power: 2, kw: ['Hacker'], text: 'Révélation : Malware 1 (Ransomware).',
                 onReveal: (c, st) => malware(st, c.owner, 1, 'rancon') },
  fixer:       { set: 'set3', name: 'Fixer', type: 'C', cost: 3, power: 3, kw: ['Hacker'], text: 'Révélation : piochez 1 carte, puis Malware 1.',
                 onReveal: (c, st) => { draw(st, c.owner, 1, true); malware(st, c.owner, 1); } },
  fantome_reseau:{ set: 'set3', name: 'Hacker fantôme', type: 'C', cost: 3, power: 2, kw: ['Hacker'], text: 'Persistant : +1 par Malware exécuté chez l\'adversaire cette partie.',
                 self: (c, st) => st.p[1 - c.owner].malwareRun || 0 },
  coupe_circuit:{ set: 'set3', name: 'Coupe-circuit', type: 'S', cost: 2, power: 0, kw: ['Hacker'], text: 'Piratage du général adverse jusqu\'à la fin du tour suivant, puis Malware 1.',
                 onReveal: (c, st) => { hackGeneral(st, 1 - c.owner); malware(st, c.owner, 1); } },
  brise_glace: { set: 'set3', name: 'Brise-glace', type: 'C', cost: 4, power: 4, kw: ['Hacker'], text: 'Révélation : Piratage sur chaque créature adverse ici.',
                 onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => hack(st, x)) },
  ver_polymorphe:{ set: 'set3', name: 'Ver polymorphe', type: 'C', cost: 4, power: 4, kw: ['Hacker'], text: 'Révélation : Malware 2 (Worm).',
                 onReveal: (c, st) => malware(st, c.owner, 2, 'ver') },
  ia_rebelle:  { set: 'set3', name: 'IA rebelle', type: 'C', cost: 5, power: 5, kw: ['Hacker'], text: 'Révélation : Malware 3 (un Virus, un Worm et un Ransomware).',
                 onReveal: (c, st) => malware(st, c.owner, 3, 'mix') },
  seigneur_reseau:{ set: 'set3', name: 'Seigneur du réseau', type: 'C', cost: 6, power: 7, kw: ['Hacker'], text: 'Révélation : Piratage sur la créature adverse la plus puissante de chaque zone, puis Malware 1.',
                 onReveal: (c, st) => { [0, 1, 2].forEach(z => hack(st, strongest(st, creaturesAt(st, 1 - c.owner, z)))); malware(st, c.owner, 1); } },

  // CYBORG : Surcharge (sceaux gardés pour la révélation) et Implant
  gamin_augmente:{ set: 'set3', name: 'Gamin augmenté', type: 'C', cost: 1, power: 2, kw: ['Cyborg'], text: 'Surcharge 1 : +2.',
                 onReveal: (c, st) => { if (overload(st, c, 1)) buff(st, c, 2); } },
  charcudoc:   { set: 'set3', name: 'Charcudoc', type: 'C', cost: 2, power: 2, kw: ['Cyborg'], text: 'Révélation : Implant 2 sur votre autre créature la plus faible ici.',
                 onReveal: (c, st) => implant(st, weakest(st, creaturesAt(st, c.owner, c.zone).filter(x => x !== c)), 2) },
  samourai:    { set: 'set3', name: 'Samouraï des rues', type: 'C', cost: 2, power: 3, kw: ['Cyborg'], text: 'Surcharge 1 : +3.',
                 onReveal: (c, st) => { if (overload(st, c, 1)) buff(st, c, 3); } },
  bras_canon:  { set: 'set3', name: 'Bras-canon', type: 'C', cost: 3, power: 4, kw: ['Cyborg'], text: 'Surcharge 1 : la créature adverse la plus puissante ici perd 2.',
                 onReveal: (c, st) => { const s = strongestFoe(st, c); if (s && overload(st, c, 1)) buff(st, s, -2); } },
  implant_combat:{ set: 'set3', name: 'Implant de combat', type: 'S', cost: 1, power: 0, kw: ['Cyborg'], text: 'Implant 3 sur votre créature la plus faible ici.',
                 onReveal: (c, st) => implant(st, weakest(st, creaturesAt(st, c.owner, c.zone)), 3) },
  surtension:  { set: 'set3', name: 'Surtension', type: 'S', cost: 1, power: 0, kw: ['Cyborg'], text: 'Vos créatures ici gagnent +1. Surcharge 1 : +1 de plus chacune.',
                 onReveal: (c, st) => { const l = creaturesAt(st, c.owner, c.zone); const n = l.length && overload(st, c, 1) ? 2 : 1; l.forEach(x => buff(st, x, n)); } },
  chrome:      { set: 'set3', name: 'Solo chromé', type: 'C', cost: 3, power: 4, kw: ['Cyborg'], text: 'Persistant : +1 par Implant de vos créatures ici.',
                 self: (c, st) => creaturesAt(st, c.owner, c.zone).reduce((s, x) => s + (x.implants || 0), 0) },
  cyberpsycho: { set: 'set3', name: 'Cyberpsycho', type: 'C', cost: 3, power: 7, kw: ['Cyborg'], text: 'Fin de tour : perd 1.',
                 onEndTurn: (c, st) => buff(st, c, -1) },
  pilote_meca: { set: 'set3', name: 'Pilote de méca', type: 'C', cost: 4, power: 6, kw: ['Cyborg'], text: 'Surcharge 1 : Implant 1 sur vos autres créatures ici.',
                 onReveal: (c, st) => { const l = creaturesAt(st, c.owner, c.zone).filter(x => x !== c); if (l.length && overload(st, c, 1)) l.forEach(x => implant(st, x, 1)); } },
  colosse_augmente:{ set: 'set3', name: 'Colosse augmenté', type: 'C', cost: 5, power: 6, kw: ['Cyborg'], text: 'Révélation : Implant 1 sur chacune de vos créatures ici, celle-ci comprise.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).forEach(x => implant(st, x, 1)) },
  androide:    { set: 'set3', name: 'Androïde de combat', type: 'C', cost: 4, power: 5, kw: ['Cyborg'], text: 'Surcharge 2 : Implant 4 sur lui-même.',
                 onReveal: (c, st) => { if (overload(st, c, 2)) implant(st, c, 4); } },
  legende_chrome:{ set: 'set3', name: 'Légende des rues', type: 'C', cost: 6, power: 9, kw: ['Cyborg'], text: 'Persistant : vos autres créatures avec Implant ont +1.',
                 aura: (s, t) => t !== s && t.owner === s.owner && t.implants ? 1 : 0 },

  // ANGE : anges synthétiques (Implant)
  ange_synthetique:{ set: 'set3', name: 'Ange synthétique', type: 'C', cost: 2, power: 2, kw: ['Ange'], text: 'Grâce : Implant 1 sur une autre de vos créatures ici.',
                 grace: (c, st) => implant(st, weakest(st, creaturesAt(st, c.owner, c.zone).filter(x => x !== c)), 1) },
  aureole:     { set: 'set3', name: 'Auréole chromée', type: 'S', cost: 1, power: 0, kw: ['Ange'], text: 'Implant 1 sur chacun de vos Anges ici.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => hasKw(x, 'Ange')).forEach(x => implant(st, x, 1)) },
  seraphin_donnees:{ set: 'set3', name: 'Séraphin de données', type: 'C', cost: 4, power: 3, kw: ['Ange'], text: 'Révélation : Implant 1 sur vos autres Anges en jeu.',
                 onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => implant(st, x, 1)) },
  archange_cyber:{ set: 'set3', name: 'Archange cybernétique', type: 'C', cost: 6, power: 5, kw: ['Ange'], text: 'Persistant : +1 par créature avec Implant que vous avez en jeu.',
                 self: (c, st) => mine(st, c.owner).filter(x => x.implants).length },

  // DÉMON : daemons du réseau (Malware)
  daemon_parasite:{ set: 'set3', name: 'Daemon parasite', type: 'C', cost: 1, power: 1, kw: ['Démon'], text: 'Destruction : Malware 1.',
                 onDestroyed: (c, st) => malware(st, c.owner, 1) },
  possession:  { set: 'set3', name: 'Possession numérique', type: 'S', cost: 2, power: 0, kw: ['Démon'], text: 'Détruisez votre créature la plus faible ici, puis Malware 1 et piochez 1 carte.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) destroy(st, w, c.owner); malware(st, c.owner, 1); draw(st, c.owner, 1, true); } },
  daemon_corrupteur:{ set: 'set3', name: 'Daemon corrupteur', type: 'C', cost: 3, power: 3, kw: ['Démon'], text: 'Révélation : Malware 1 (Worm).',
                 onReveal: (c, st) => malware(st, c.owner, 1, 'ver') },
  archidaemon: { set: 'set3', name: 'Archidaemon', type: 'C', cost: 5, power: 7, kw: ['Démon'], sacrifice: 1, text: 'Sacrifice. Révélation : Malware 1.',
                 onReveal: (c, st) => malware(st, c.owner, 1) },

  // GOBELIN : bricoleurs (Surcharge)
  bricoleur:   { set: 'set3', name: 'Gobelin bricoleur', type: 'C', cost: 1, power: 1, kw: ['Gobelin'], text: 'Surcharge 1 : Horde 2.',
                 onReveal: (c, st) => { if (overload(st, c, 1)) horde(st, c.owner, c.zone, 2); } },
  petaradeur:  { set: 'set3', name: 'Pétaradeur', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], text: 'Surcharge 1 : la créature adverse la plus faible ici perd 2.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w && overload(st, c, 1)) buff(st, w, -2); } },
  ferrailleur: { set: 'set3', name: 'Ferrailleur', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], text: 'Révélation : Horde 1. Surcharge 2 : Horde 3 à la place.',
                 onReveal: (c, st) => horde(st, c.owner, c.zone, overload(st, c, 2) ? 3 : 1) },
  meca_gobelin:{ set: 'set3', name: 'Méca-gobelin', type: 'C', cost: 4, power: 5, kw: ['Gobelin'], text: 'Surcharge 2 : chacune de vos Hordes gagne +3.',
                 onReveal: (c, st) => { const h = hordes(st, c.owner); if (h.length && overload(st, c, 2)) h.forEach(x => buff(st, x, 3)); } },

  // ELFE : technomanciens (Piratage)
  technomancienne:{ set: 'set3', name: 'Technomancienne', type: 'C', cost: 2, power: 3, kw: ['Elfe'], text: 'Sortilège : +1, et Piratage sur la créature adverse la plus puissante dans la zone du sort.',
                 onSpell: (c, st, z) => { buff(st, c, 1); hack(st, strongest(st, creaturesAt(st, 1 - c.owner, z).filter(x => !x.hacked))); } },
  intrusion:   { set: 'set3', name: 'Sort d\'intrusion', type: 'S', cost: 1, power: 0, kw: ['Elfe'], text: 'Piratage sur la créature adverse la plus puissante ici ; elle perd 2.',
                 onReveal: (c, st) => { const s = strongestFoe(st, c); if (s) { hack(st, s); buff(st, s, -2); } } },
  decrypteuse: { set: 'set3', name: 'Elfe décrypteuse', type: 'C', cost: 3, power: 4, kw: ['Elfe'], text: 'Persistant : +3 si une créature adverse ici est piratée.',
                 self: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).some(x => x.hacked) ? 3 : 0 },
  oracle_reseau:{ set: 'set3', name: 'Oracle du réseau', type: 'C', cost: 5, power: 6, kw: ['Elfe'], text: 'Révélation : Piratage sur la créature adverse la plus puissante ici. Persistant : les créatures adverses piratées ont -1.',
                 onReveal: (c, st) => hack(st, strongestFoe(st, c)),
                 aura: (s, t) => t.owner !== s.owner && t.hacked ? -1 : 0 },

  // DRAGON : dragons corporatistes (Trésor et Implant)
  dragonnet_chrome:{ set: 'set3', name: 'Dragonnet chromé', type: 'C', cost: 1, power: 1, kw: ['Dragon'], text: 'Fin de tour : si vous gardez au moins 1 sceau, Implant 1 sur lui-même.',
                 onEndTurn: (c, st) => { if (st.p[c.owner].seals > 0) implant(st, c, 1); else return false; } },
  investissement:{ set: 'set3', name: 'Investissement', type: 'S', cost: 1, power: 0, kw: ['Dragon'], text: 'Votre Trésor gagne +1. Implant 1 sur votre Dragon le plus faible ici.',
                 onReveal: (c, st) => { st.p[c.owner].treasure += 1; log(st, '⟦{p}⟧ : Trésor +1.', 'up', { p: c.owner }); implant(st, weakest(st, creaturesAt(st, c.owner, c.zone).filter(x => hasKw(x, 'Dragon'))), 1); } },
  dragon_pdg:  { set: 'set3', name: 'Dragon PDG', type: 'C', cost: 6, power: 6, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor. Révélation : Implant 1 sur vos autres Dragons en jeu.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3),
                 onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Dragon')).forEach(x => implant(st, x, 1)) },
  wyrm_cyber:  { set: 'set3', name: 'Wyrm cybernétique', type: 'C', cost: 7, power: 8, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor. Persistant : +1 par Implant de vos Dragons.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3),
                 self: (c, st) => mine(st, c.owner).filter(x => hasKw(x, 'Dragon')).reduce((s, x) => s + (x.implants || 0), 0) },

  // MORT-VIVANT : fantômes dans la machine (Relève et Malware)
  fantome_numerique:{ set: 'set3', name: 'Fantôme numérique', type: 'C', cost: 1, power: 0, kw: ['Mort-vivant'], raise: true, text: 'Relève. Révélation : Malware 1.',
                 onReveal: (c, st) => malware(st, c.owner, 1) },
  sauvegarde:  { set: 'set3', name: 'Sauvegarde corrompue', type: 'S', cost: 1, power: 0, kw: ['Mort-vivant'], text: 'Défausse 1, puis Malware 1.',
                 onReveal: (c, st) => { discardFromHand(st, c.owner, 1); malware(st, c.owner, 1); } },
  zombie_cyber:{ set: 'set3', name: 'Zombie cybernétique', type: 'C', cost: 4, power: 4, kw: ['Mort-vivant'], raise: true, text: 'Relève.' },
  liche_quantique:{ set: 'set3', name: 'Liche quantique', type: 'C', cost: 5, power: 4, kw: ['Mort-vivant'], text: 'Persistant : +1 par Malware exécuté chez l\'adversaire cette partie.',
                 self: (c, st) => st.p[1 - c.owner].malwareRun || 0 },

  // VAMPIRE : vampires de données (Drain et Piratage)
  siphonneuse: { set: 'set3', name: 'Siphonneuse', type: 'C', cost: 1, power: 1, kw: ['Vampire'], text: 'Révélation : Drain 1 sur la créature adverse la plus faible ici ; Drain 2 si elle est piratée.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w) drain(st, c, w, w.hacked ? 2 : 1); } },
  vampire_donnees:{ set: 'set3', name: 'Vampire de données', type: 'C', cost: 2, power: 2, kw: ['Vampire'], text: 'Révélation : Piratage sur la créature adverse la plus puissante ici, puis Drain 1 sur elle.',
                 onReveal: (c, st) => { const s = strongestFoe(st, c); if (!s) return; hack(st, s); drain(st, c, s, 1); } },
  morsure_virale:{ set: 'set3', name: 'Morsure virale', type: 'S', cost: 2, power: 0, kw: ['Vampire'], text: 'Drain 2 sur la créature adverse piratée la plus puissante ici (à défaut, la plus puissante ici), au profit de votre Vampire le plus faible ici.',
                 onReveal: (c, st) => { const foes = creaturesAt(st, 1 - c.owner, c.zone), h = foes.filter(x => x.hacked);
                   drain(st, weakest(st, creaturesAt(st, c.owner, c.zone).filter(x => hasKw(x, 'Vampire'))), strongest(st, h.length ? h : foes), 2); } },
  comte_reseau:{ set: 'set3', name: 'Comte du réseau', type: 'C', cost: 4, power: 3, kw: ['Vampire'], text: 'Fin de tour : Drain 1 sur chaque créature adverse piratée ici.',
                 onEndTurn: (c, st) => { const h = creaturesAt(st, 1 - c.owner, c.zone).filter(x => x.hacked); h.forEach(x => drain(st, c, x, 1)); if (!h.length) return false; } },

  // NEUTRES
  mercenaire_augmente:{ set: 'set3', name: 'Mercenaire augmenté', type: 'C', cost: 2, power: 2, kw: [], text: 'Révélation : Implant 1 sur lui-même.',
                 onReveal: (c, st) => implant(st, c, 1) },
  fixeuse:     { set: 'set3', name: 'Fixeuse', type: 'C', cost: 2, power: 1, kw: [], text: 'Révélation : une carte au hasard de votre main coûte 1 de moins.',
                 onReveal: (c, st) => { const h = st.p[c.owner].hand.filter(x => (costOf(st, x) ?? 0) > 0); if (h.length) { const x = pick(h); x.discount = (x.discount || 0) - 1; log(st, '⟦{p}⟧ : une carte de la main coûte 1 de moins.', 'up', { p: c.owner }); } } },
  tourelle:    { set: 'set3', name: 'Tourelle automatique', type: 'C', cost: 3, power: 2, kw: [], text: 'Fin de tour : la créature adverse la plus faible ici perd 1.',
                 onEndTurn: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w) buff(st, w, -1); else return false; } },
  garde_securite:{ set: 'set3', name: 'Garde de sécurité', type: 'C', cost: 3, power: 4, kw: [], firewall: true, text: 'Pare-feu : vos créatures ici ne peuvent pas être piratées.' },
  unite_securite:{ set: 'set3', name: 'Unité de sécurité', type: 'C', cost: 5, power: 7, kw: [], text: '' },

  // ---- Set 2.5 : Faites vos jeux (mini-set casino) ----
  // Pari : on lance un dé à 6 faces (roll), l'effet dépend du résultat : 1-2, 3-5 ou 6. Pipé : le prochain dé fait 6 (load).
  // Sept : quand les 3 Sept d'un joueur sont en jeu, son Jackpot se déclenche une fois (jackpot). Triche : piocher la carte voulue.
  // NEUTRES : le deck du casino
  joueuse_des: { set: 'tapis', name: 'Joueuse de dés', type: 'C', cost: 1, power: 1, kw: [], text: 'Pari. 1-2 : rien. 3-5 : +2. 6 : +4.',
                 onReveal: (c, st) => pari(st, c, () => {}, () => buff(st, c, 2), () => buff(st, c, 4)) },
  croupier:    { set: 'tapis', name: 'Croupier', type: 'C', cost: 2, power: 3, kw: [], text: 'Révélation : votre prochain dé fait 6.',
                 onReveal: (c, st) => load(st, c.owner, 1) },
  des_pipes:   { set: 'tapis', name: 'Dés pipés', type: 'S', cost: 1, power: 0, kw: [], text: 'Vos 2 prochains dés font 6.',
                 onReveal: (c, st) => load(st, c.owner, 2) },
  cartes_biseautees:{ set: 'tapis', name: 'Cartes biseautées', type: 'S', cost: 1, power: 0, kw: [], text: 'Piochez un Sept de votre deck. S\'il n\'y en a plus, piochez 1 carte.',
                 onReveal: (c, st) => { if (!tutor(st, c.owner, x => CARDS[x.id].seven)) draw(st, c.owner, 1, true); } },
  as_manche:   { set: 'tapis', name: 'As dans la manche', type: 'S', cost: 1, power: 0, kw: [], text: 'Piochez la carte la plus chère de votre deck.',
                 onReveal: (c, st) => { const P = st.p[c.owner]; const m = Math.max(...P.deck.map(x => CARDS[x.id].cost)); tutor(st, c.owner, x => CARDS[x.id].cost === m); } },
  quitte_double:{ set: 'tapis', name: 'Quitte ou double', type: 'S', cost: 1, power: 0, kw: [], text: 'Pari sur votre créature la plus puissante ici. 1-2 : elle perd 2. 3-5 : +3. 6 : elle double sa puissance (au plus +8).',
                 onReveal: (c, st) => { const s = strongest(st, creaturesAt(st, c.owner, c.zone)); if (!s) return;
                   pari(st, c, () => buff(st, s, -2), () => buff(st, s, 3), () => { const v = power(st, s); if (v > 0) buff(st, s, Math.min(8, v)); }); } },
  roulette:    { set: 'tapis', name: 'Roulette', type: 'S', cost: 2, power: 0, kw: [], text: 'Pari. 1-2 : votre créature la plus faible ici gagne +2. 3-5 : vos créatures ici gagnent +1. 6 : vos créatures en jeu gagnent +2.',
                 onReveal: (c, st) => pari(st, c, () => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) buff(st, w, 2); },
                   () => creaturesAt(st, c.owner, c.zone).forEach(x => buff(st, x, 1)), () => mine(st, c.owner).forEach(x => buff(st, x, 2))) },
  machine_sous:{ set: 'tapis', name: 'Machine à sous', type: 'C', cost: 3, power: 2, kw: [], text: 'Fin de tour : Pari. 1-2 : rien. 3-5 : +1. 6 : +3. Jackpot : +3 de plus.',
                 onEndTurn: (c, st) => { let v = 0; pari(st, c, () => {}, () => { v = 1; }, () => { v = 3; }); if (v) buff(st, c, v); else return false; },
                 onJackpot: (c, st) => buff(st, c, 3) },
  videur:      { set: 'tapis', name: 'Videur du casino', type: 'C', cost: 3, power: 4, kw: [], text: 'Persistant : +1 par 6 obtenu à vos dés cette partie (au plus +4).',
                 self: (c, st) => Math.min(4, st.p[c.owner].sixes) },
  flambeur:    { set: 'tapis', name: 'Flambeur', type: 'C', cost: 4, power: 4, kw: [], text: 'Pari. 1-2 : piochez 1 carte. 3-5 : +3. 6 : +6.',
                 onReveal: (c, st) => pari(st, c, () => draw(st, c.owner, 1, true), () => buff(st, c, 3), () => buff(st, c, 6)) },
  gros_lot:    { set: 'tapis', name: 'Gros lot', type: 'C', cost: 5, power: 6, kw: [], text: 'Persistant : +3 si votre Jackpot a eu lieu.',
                 self: (c, st) => (st.p[c.owner].jackpot ? 3 : 0) },
  directeur:   { set: 'tapis', name: 'Directeur du casino', type: 'C', cost: 6, power: 6, kw: [], text: 'Pari. 1-2 : +1. 3-5 : +3. 6 : +6.',
                 onReveal: (c, st) => pari(st, c, () => buff(st, c, 1), () => buff(st, c, 3), () => buff(st, c, 6)) },
  // Les trois Sept : neutres, chacun à l'effigie d'une famille de départ (effigy : visuel et couleur, sans effet de jeu).
  // Pique : un Gobelin, carreau : un Démon, trèfle : un Elfe. Les 3 en jeu : Jackpot.
  sept_pique:  { set: 'tapis', name: 'Sept de pique', type: 'C', cost: 2, power: 2, kw: [], effigy: 'Gobelin', seven: true, text: 'Sept. Jackpot : piochez 2 cartes.',
                 onJackpot: (c, st) => draw(st, c.owner, 2, true) },
  sept_trefle: { set: 'tapis', name: 'Sept de trèfle', type: 'C', cost: 3, power: 3, kw: [], effigy: 'Elfe', seven: true, text: 'Sept. Jackpot : vos créatures ici gagnent +2.',
                 onJackpot: (c, st) => creaturesAt(st, c.owner, c.zone).forEach(x => buff(st, x, 2)) },
  sept_carreau:{ set: 'tapis', name: 'Sept de carreau', type: 'C', cost: 4, power: 3, kw: [], effigy: 'Démon', seven: true, text: 'Sept. Jackpot : +5.',
                 onJackpot: (c, st) => buff(st, c, 5) },
  // Support : les Anges conjurent la malchance, les Gobelins trichent en bande, les Démons profitent des 1 et des 2.
  ange_chance: { set: 'tapis', name: 'Ange de la chance', type: 'C', cost: 2, power: 3, kw: ['Ange'], text: 'Grâce : votre prochain dé fait 6, et celle-ci gagne +1.',
                 grace: (c, st) => { load(st, c.owner, 1); buff(st, c, 1); } },
  aureole:     { set: 'tapis', name: 'Auréole d\'or', type: 'S', cost: 1, power: 0, kw: ['Ange'], text: 'Vos Anges ici gagnent +2, et +1 de plus par 6 obtenu à vos dés cette partie (au plus +3 de plus).',
                 onReveal: (c, st) => { const n = 2 + Math.min(3, st.p[c.owner].sixes); creaturesAt(st, c.owner, c.zone).filter(x => hasKw(x, 'Ange')).forEach(x => buff(st, x, n)); } },
  archange_hasard:{ set: 'tapis', name: 'Archange du hasard', type: 'C', cost: 5, power: 6, kw: ['Ange'], floor3: true, text: 'Persistant : vos dés font au moins 3.' },
  gobelin_tricheur:{ set: 'tapis', name: 'Gobelin tricheur', type: 'C', cost: 1, power: 1, kw: ['Gobelin'], text: 'Pari. 1-2 : rien. 3-5 : Horde 1. 6 : Horde 3.',
                 onReveal: (c, st) => pari(st, c, null, () => horde(st, c.owner, c.zone, 1), () => horde(st, c.owner, c.zone, 3)) },
  roulette_gobeline:{ set: 'tapis', name: 'Roulette gobeline', type: 'S', cost: 2, power: 0, kw: ['Gobelin'], text: 'Un Pari dans chacune de vos zones. 1-2 : rien. 3-5 : Horde 1 dans cette zone. 6 : Horde 2 dans cette zone.',
                 onReveal: (c, st) => [0, 1, 2].forEach(z => { const v = roll(st, c.owner, z, c, c.id); if (v >= 6) horde(st, c.owner, z, 2); else if (v >= 3) horde(st, c.owner, z, 1); }) },
  bookmaker:   { set: 'tapis', name: 'Bookmaker gobelin', type: 'C', cost: 3, power: 3, kw: ['Gobelin'], text: 'Fin de tour : Pari. 1-2 : rien. 3-5 : votre Horde ici gagne +1. 6 : Horde 2 ici.',
                 onEndTurn: (c, st) => { let r = false; pari(st, c, null, () => { const h = hordeAt(st, c.owner, c.zone); if (h) { buff(st, h, 1); r = true; } }, () => { horde(st, c.owner, c.zone, 2); r = true; }); if (!r) return false; } },
  diable_joueur:{ set: 'tapis', name: 'Diable joueur', type: 'C', cost: 2, power: 5, kw: ['Démon'], text: 'Pari. 1-2 : il est sacrifié. 3-5 : +2. 6 : +4.',
                 onReveal: (c, st) => pari(st, c, () => destroy(st, c, c.owner), () => buff(st, c, 2), () => buff(st, c, 4)) },
  mise_ames:   { set: 'tapis', name: 'Mise des âmes', type: 'S', cost: 2, power: 0, kw: ['Démon'], text: 'Détruisez votre créature la plus faible ici, puis Pari. 1-2 : vos créatures ici gagnent +1. 3-5 : +2. 6 : +4.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) destroy(st, w, c.owner);
                   const all = n => () => creaturesAt(st, c.owner, c.zone).forEach(x => buff(st, x, n)); pari(st, c, all(1), all(2), all(4)); } },
  usurier:     { set: 'tapis', name: 'Usurier des Fosses', type: 'C', cost: 3, power: 3, kw: ['Démon'], text: 'Persistant : +1 par 1 ou 2 obtenu à vos dés cette partie (au plus +4).',
                 self: (c, st) => Math.min(4, st.p[c.owner].lows) },

  // ---- Récompenses : jamais dans les boosters (voir rewards.js) ----
  // Une carte par famille complétée dans son set d'origine, et une carte Dieu par set complété.
  voix_aube:   { set: 'recompense', name: 'Voix de l\'Aube', type: 'C', cost: 4, power: 4, kw: ['Ange'], text: 'Révélation : +1 sceau au tour suivant. Grâce : vos autres créatures ici gagnent +1.',
                 onReveal: (c, st) => { st.p[c.owner].bonusSeals++; log(st, '⟦{p}⟧ : +1 sceau au tour suivant.', 'up', { p: c.owner }); },
                 grace: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => buff(st, x, 1)) },
  heritier_abysses:{ set: 'recompense', name: 'Héritier des abysses', type: 'C', cost: 4, power: 7, kw: ['Démon'], sacrifice: 1, text: 'Sacrifice. Quand une de vos autres créatures est détruite, votre zone ici gagne +1.',
                 onAllyDestroyed: (c, st) => addZone(st, c.owner, c.zone, 1) },
  boss_horde:  { set: 'recompense', name: 'Boss de la Horde', type: 'C', cost: 4, power: 4, kw: ['Gobelin'], text: 'Révélation : Horde 2 dans chacune de vos zones.',
                 onReveal: (c, st) => [0, 1, 2].forEach(z => horde(st, c.owner, z, 2)) },
  gardienne_sentiers:{ set: 'recompense', name: 'Gardienne des sentiers', type: 'C', cost: 4, power: 5, kw: ['Elfe'], mobile: true, text: 'Déplaçable. Déplacement : vos autres créatures de la zone d\'arrivée gagnent +1.',
                 onMove: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => buff(st, x, 1)) },
  wyrm_tresor: { set: 'recompense', name: 'Wyrm du trésor', type: 'C', cost: 5, power: 7, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor. Révélation : votre Trésor gagne +2.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3),
                 onReveal: (c, st) => { st.p[c.owner].treasure += 2; log(st, '⟦{p}⟧ : Trésor +2.', 'up', { p: c.owner }); } },
  faucheur:    { set: 'recompense', name: 'Faucheur éternel', type: 'C', cost: 4, power: 5, kw: ['Mort-vivant'], raise: true, text: 'Relève. Révélation : exhumez ici la créature la plus puissante de votre défausse qui coûte 3 ou moins.',
                 onReveal: (c, st) => exhume(st, c.owner, c.zone, 3) },
  reine_ecarlate:{ set: 'recompense', name: 'Reine écarlate', type: 'C', cost: 5, power: 5, kw: ['Vampire'], text: 'Révélation : Drain 1 sur chaque créature adverse ici, et Drain 1 sur une créature de la main adverse.',
                 onReveal: (c, st) => { creaturesAt(st, 1 - c.owner, c.zone).forEach(x => drain(st, c, x, 1)); drainHand(st, c, 1, 1); } },
  // Familles du Set de base complétées dans le Crépuscule : une carte par famille, sur la mécanique de son soutien dans ce set.
  prophetesse: { set: 'recompense', name: 'Prophétesse', type: 'C', cost: 4, power: 3, kw: ['Ange'], text: 'Révélation : piochez 2 cartes. Inspiration : +1.',
                 onReveal: (c, st) => draw(st, c.owner, 2, true),
                 onInspire: (c, st) => buff(st, c, 1) },
  prince_dupes:{ set: 'recompense', name: 'Prince des dupes', type: 'C', cost: 4, power: 4, kw: ['Démon'], text: 'Révélation : créez une Chèvre ici, puis Échange avec la créature adverse la plus puissante ici dont la puissance est 6 ou moins.',
                 onReveal: (c, st) => { summon(st, c.owner, c.zone, 'chevre'); swap(st, c.owner, c.zone, l => strongest(st, l.filter(x => power(st, x) <= 6))); } },
  maitre_banquet:{ set: 'recompense', name: 'Maître du banquet', type: 'C', cost: 4, power: 4, kw: ['Gobelin'], text: 'Révélation : Festin 2 dans chacune de vos zones.',
                 onReveal: (c, st) => [0, 1, 2].forEach(z => feast(st, c.owner, z, 2)) },
  archimage:   { set: 'recompense', name: 'Archimage sylvestre', type: 'C', cost: 4, power: 4, kw: ['Elfe'], text: 'Sortilège : +2. Révélation : votre zone ici gagne +1 par sort que vous avez révélé cette partie.',
                 onSpell: (c, st) => buff(st, c, 2),
                 onReveal: (c, st) => { const n = st.p[c.owner].spells || 0; if (n) addZone(st, c.owner, c.zone, n); } },
  doyenne_couvees:{ set: 'recompense', name: 'Doyenne des couvées', type: 'C', cost: 4, power: 4, kw: ['Dragon'], text: 'Révélation : tous vos Œufs en jeu éclosent.',
                 onReveal: (c, st) => eggs(st, c.owner).forEach(x => hatch(st, x)) },
  // Dieux : un coup de pouce au deck le plus faible du moment (set de base : Dragon), puis au 2e plus faible (Crépuscule : Ange).
  dieu_base:   { set: 'recompense', name: 'Aurvax, Dieu des trésors', type: 'C', cost: 6, power: 8, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor. Révélation : vos autres Dragons gagnent +2.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3),
                 onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Dragon')).forEach(x => buff(st, x, 2)) },
  dieu_set2:   { set: 'recompense', name: 'Solenne, Déesse de l\'Aube', type: 'C', cost: 6, power: 7, kw: ['Ange'], text: 'Révélation : +2 sceaux au tour suivant. Grâce : vos Anges gagnent +1.',
                 onReveal: (c, st) => { st.p[c.owner].bonusSeals += 2; log(st, '⟦{p}⟧ : +2 sceaux au tour suivant.', 'up', { p: c.owner }); },
                 grace: (c, st) => mine(st, c.owner).filter(x => hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  // Familles complétées dans la Cité Néon : une carte par famille, sur la mécanique de son soutien dans ce set.
  architecte_chaos:{ set: 'recompense', name: 'Architecte du chaos', type: 'C', cost: 4, power: 4, kw: ['Hacker'], text: 'Révélation : Malware 2, puis Piratage sur la créature adverse la plus puissante ici.',
                 onReveal: (c, st) => { malware(st, c.owner, 2); hack(st, strongestFoe(st, c)); } },
  chrome_absolu:{ set: 'recompense', name: 'Chrome absolu', type: 'C', cost: 4, power: 4, kw: ['Cyborg'], text: 'Révélation : Implant 1 sur vos autres créatures ici. Surcharge 1 : Implant 2 sur lui-même.',
                 onReveal: (c, st) => { creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => implant(st, x, 1)); if (overload(st, c, 1)) implant(st, c, 2); } },
  ange_grille: { set: 'recompense', name: 'Ange de la Grille', type: 'C', cost: 4, power: 4, kw: ['Ange'], text: 'Révélation : Implant 1 sur chacune de vos autres créatures ici.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => implant(st, x, 1)) },
  daemon_racine:{ set: 'recompense', name: 'Daemon racine', type: 'C', cost: 4, power: 7, kw: ['Démon'], sacrifice: 1, text: 'Sacrifice. Révélation : Malware 2.',
                 onReveal: (c, st) => malware(st, c.owner, 2) },
  surchauffeur:{ set: 'recompense', name: 'Grand surchauffeur', type: 'C', cost: 4, power: 4, kw: ['Gobelin'], text: 'Révélation : Horde 2. Surcharge 1 : Horde 2 dans chacune de vos autres zones.',
                 onReveal: (c, st) => { horde(st, c.owner, c.zone, 2); if (overload(st, c, 1)) [0, 1, 2].filter(z => z !== c.zone).forEach(z => horde(st, c.owner, z, 2)); } },
  archi_techno:{ set: 'recompense', name: 'Archi-technomancienne', type: 'C', cost: 4, power: 4, kw: ['Elfe'], text: 'Sortilège : +1. Révélation : Piratage sur la créature adverse la plus puissante ici.',
                 onSpell: (c, st) => buff(st, c, 1),
                 onReveal: (c, st) => hack(st, strongestFoe(st, c)) },
  dragon_holding:{ set: 'recompense', name: 'Dragon de la holding', type: 'C', cost: 5, power: 7, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor. Révélation : Implant 1 sur vos autres Dragons en jeu.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3),
                 onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Dragon')).forEach(x => implant(st, x, 1)) },
  revenant_binaire:{ set: 'recompense', name: 'Revenant binaire', type: 'C', cost: 4, power: 5, kw: ['Mort-vivant'], raise: true, text: 'Relève. Révélation : Malware 1.',
                 onReveal: (c, st) => malware(st, c.owner, 1) },
  baronne_donnees:{ set: 'recompense', name: 'Baronne des données', type: 'C', cost: 5, power: 4, kw: ['Vampire'], text: 'Révélation : Piratage sur chaque créature adverse ici, puis Drain 1 sur chacune.',
                 onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => { hack(st, x); drain(st, c, x, 1); }) },
  // Dieu de la Cité Néon : pour les Hackers, le deck le plus faible du set à sa sortie.
  dieu_set3:   { set: 'recompense', name: 'Nexus, Dieu du Réseau', type: 'C', cost: 6, power: 7, kw: ['Hacker'], text: 'Révélation : Piratage du général adverse jusqu\'à la fin du tour suivant, puis Malware 2. Persistant : +1 par Malware exécuté chez l\'adversaire cette partie.',
                 onReveal: (c, st) => { hackGeneral(st, 1 - c.owner); malware(st, c.owner, 2); },
                 self: (c, st) => st.p[1 - c.owner].malwareRun || 0 },
  // Faites vos jeux complété : une carte de casino, pas de Dieu pour un mini-set.
  as_pique:    { set: 'recompense', name: 'As de pique', type: 'C', cost: 3, power: 4, kw: [], text: 'Révélation : votre prochain dé fait 6. Persistant : +3 si votre Jackpot a eu lieu.',
                 onReveal: (c, st) => load(st, c.owner, 1),
                 self: (c, st) => (st.p[c.owner].jackpot ? 3 : 0) },
  // Quêtes d'histoire à durée limitée (story.js) : une carte neutre par quête, gagnée pendant la quête seulement.
  epouvantail: { set: 'recompense', name: 'Épouvantail hanté', type: 'C', cost: 3, power: 3, kw: [], text: 'Persistant : +3 tant que l\'adversaire a plus de créatures que vous ici.',
                 self: (c, st) => (creaturesAt(st, 1 - c.owner, c.zone).length > creaturesAt(st, c.owner, c.zone).length ? 3 : 0) },
  pretre_eclipse:{ set: 'recompense', name: 'Prêtre de l\'éclipse', type: 'C', cost: 4, power: 5, kw: [], text: 'Révélation : les autres créatures ici, les vôtres comme celles de l\'adversaire, perdent 1.',
                 onReveal: (c, st) => [0, 1].forEach(p => creaturesAt(st, p, c.zone).filter(x => x !== c).forEach(x => buff(st, x, -1))) },
  de_pipe:     { set: 'recompense', name: 'Dé d\'or', type: 'C', cost: 2, power: 2, kw: [], text: 'Pari. 1-2 : relancez le dé. 3-5 : +2. 6 : +4.',
                 onReveal: (c, st) => { const r = () => pari(st, c, null, () => buff(st, c, 2), () => buff(st, c, 4)); pari(st, c, r, () => buff(st, c, 2), () => buff(st, c, 4)); } },
  coursier_neon:{ set: 'recompense', name: 'Coursier néon', type: 'C', cost: 2, power: 2, kw: [], mobile: true, text: 'Déplaçable. Déplacement : piochez 1 carte.',
                 onMove: (c, st) => draw(st, c.owner, 1, true) },

  // ---- Saisons : cartes du passe de saison (pass.js), jamais dans un booster pendant leur saison ----
  // Elles rejoignent le Set de base quelques mois après leur saison (réglage passCardMonths). Neutres : elles vont dans tous les decks.
  // Nuit des citrouilles (octobre 2026)
  citrouille:  { set: 'saison', name: 'Citrouille hantée', type: 'C', cost: 2, power: 2, kw: [], text: 'Révélation : farce ou friandise ! Si vous avez moins de créatures que l\'adversaire ici, sa créature la plus puissante ici perd 2 ; sinon, vos autres créatures ici gagnent +1.',
                 onReveal: (c, st) => { const foes = creaturesAt(st, 1 - c.owner, c.zone), mine = creaturesAt(st, c.owner, c.zone);
                   if (foes.length > mine.length) buff(st, strongest(st, foes), -2); else mine.filter(x => x !== c).forEach(x => buff(st, x, 1)); } },
  sorciere_sabbat:{ set: 'saison', name: 'Sorcière du sabbat', type: 'C', cost: 4, power: 3, kw: [], text: 'Révélation : piochez 1 carte, puis votre zone ici gagne +1 par sort que vous avez révélé cette partie.',
                 onReveal: (c, st) => { draw(st, c.owner, 1, true); const n = st.p[c.owner].spells || 0; if (n) addZone(st, c.owner, c.zone, n); } },
  // Néon 2099 (novembre 2026) : le Drone harcèle en se déplaçant, le Netrunner pirate la main adverse, le Mécha largue un Drone.
  drone:       { set: 'saison', name: 'Drone éclaireur', type: 'C', cost: 2, power: 2, kw: [], mobile: true, text: 'Déplaçable. Déplacement : la créature adverse la plus puissante de la zone d\'arrivée perd 1.',
                 onMove: (c, st) => { const s = strongest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (s) buff(st, s, -1); } },
  netrunner:   { set: 'saison', name: 'Netrunner', type: 'C', cost: 3, power: 2, kw: [], text: 'Révélation : la carte la plus chère de la main adverse coûte 1 de plus, puis piochez 1 carte.',
                 onReveal: (c, st) => { const h = st.p[1 - c.owner].hand.filter(x => costOf(st, x) !== null);
                   if (h.length) { const t = h.reduce((a, b) => (costOf(st, b) > costOf(st, a) ? b : a)); t.discount = (t.discount || 0) + 1;
                     log(st, "⟦{p}⟧ : le Netrunner s'infiltre, une carte de la main coûte 1 de plus.", 'down', { p: 1 - c.owner }); }
                   draw(st, c.owner, 1, true); } },
  mecha:       { set: 'saison', name: 'Mécha de la mégapole', type: 'C', cost: 5, power: 5, kw: [], text: 'Révélation : créez un Drone éclaireur dans la zone où vous êtes le plus en retard.',
                 onReveal: (c, st) => { const z = bestZone(st, c.owner, -1); if (z !== null) summon(st, c.owner, z, 'drone'); } },

  // JETONS
  horde:       { name: 'Horde', type: 'C', cost: 0, power: 0, kw: ['Gobelin'], token: true, text: 'Jeton. Une seule Horde par zone : les effets Horde la font grandir.' },
  chevre:      { name: 'Chèvre', type: 'C', cost: 0, power: -1, kw: [], token: true, text: 'Jeton. Si elle est sacrifiée, +1 sceau au tour suivant.',
                 onDestroyed: (c, st, z, sacrificed) => { if (sacrificed) { st.p[c.owner].bonusSeals++; log(st, '⟦{p}⟧ : +1 sceau au tour suivant.', 'up', { p: c.owner }); } } },
  magot:       { name: 'Magot de dragon', type: 'C', cost: 0, power: 0, kw: [], token: true, text: 'Jeton. Fin de tour : gagne autant de puissance que vos sceaux non dépensés.',
                 onEndTurn: (c, st) => { const n = st.p[c.owner].seals; if (n > 0) buff(st, c, n); else return false; } },
  festin:      { set: 'set2', name: 'Festin', type: 'C', cost: 0, power: 0, kw: [], token: true, text: 'Jeton. Un seul Festin par zone. En fin de tour, votre Gobelin le plus faible ici le dévore : il gagne sa puissance et le Festin disparaît.' },
  // Malwares (set 3) : mélangés dans le deck adverse, ils s'exécutent quand on les pioche et disparaissent sans être remplacés.
  virus:       { set: 'set3', name: 'Virus', type: 'S', cost: 0, power: 0, kw: [], token: true, text: 'Malware. Quand vous le piochez, il s\'exécute et disparaît : votre créature la plus puissante en jeu perd 1 (sans créature, vous perdez 1 sceau ce tour).',
                 malware: (st, p) => virusHit(st, p) },
  ver:         { set: 'set3', name: 'Worm', type: 'S', cost: 0, power: 0, kw: [], token: true, text: 'Malware. Quand vous le piochez, il s\'exécute et disparaît : comme un Virus, puis un Virus est mélangé dans votre deck.',
                 malware: (st, p) => { virusHit(st, p); plant(st, p, 'virus'); log(st, 'Le Worm se copie : un Virus rejoint le deck de ⟦{p}⟧.', 'down', { p }); } },
  rancon:      { set: 'set3', name: 'Ransomware', type: 'S', cost: 0, power: 0, kw: [], token: true, text: 'Malware. Quand vous le piochez, il s\'exécute et disparaît : la carte la plus chère de votre main coûte 1 de plus.',
                 malware: (st, p) => { const c = st.p[p].hand.filter(x => costOf(st, x) !== null).sort((a, b) => costOf(st, b) - costOf(st, a))[0];
                   if (c) { c.costMod = (c.costMod || 0) + 1; log(st, '{card} coûte 1 de plus.', 'down', { card: nm(c.id) }); } } },
  // Jetons des boss mondiaux (boss.js) : ses sbires, et ce qu'il pose chez le joueur.
  sbire:       { name: 'Sbire du boss', type: 'C', cost: 0, power: 4, kw: [], token: true, text: 'Jeton du boss, un dans chaque zone au début de la partie. Dépassez la puissance du boss dans une zone pour marquer des points en plus.' },
  cendres:     { name: 'Cendres d\'éclipse', type: 'C', cost: 0, power: -1, kw: [], token: true, text: 'Jeton du boss Ignaroth. Il prend une place dans votre zone.' },
  givre:       { name: 'Éclat de givre', type: 'S', cost: 0, power: 0, kw: [], token: true, text: 'Malware du boss Vael\'Thar. Quand vous le piochez, il s\'exécute et disparaît : vous perdez 1 sceau ce tour et votre créature la plus puissante perd 1.',
                 malware: (st, p) => { const P = st.p[p]; if (P.seals > 0) { P.seals--; log(st, '⟦{p}⟧ : -1 sceau.', 'down', { p }); } const s = strongest(st, mine(st, p)); if (s) buff(st, s, -1); } },
};

// ---- Généraux : rattachés à une famille pour le thème, sans restreindre le deck ----
// kind : texte affiché ; activate + needsZone : effet activable une fois par partie ; activateCost : sceaux dépensés.
export const GENERALS = {
  seraphine: { name: 'Séraphine, Main de l\'Aube', fam: 'Ange', kind: 'Activable',
               text: 'Activable, une fois par partie : si vous avez 0 sceau à la fin du tour, vos créatures qui déclenchent un effet de fin de tour gagnent +2.',
               activate: (p, st) => { st.p[p].angelBoost = st.turn; } },
  aurelia:   { name: 'Aurélia, Gardienne du Serment', fam: 'Ange', kind: 'Fin de partie',
               text: 'Fin de partie : si vous avez dépensé tous vos sceaux à au moins 5 tours, vos zones perdantes gagnent +2.',
               onEndGame: (p, st) => { if (st.p[p].perfectTurns >= 5) [0, 1, 2].forEach(z => { if (zonePower(st, p, z) < zonePower(st, 1 - p, z)) addZone(st, p, z, 2); }); } },
  morgrath:  { name: 'Morgrath, Seigneur des Fosses', fam: 'Démon', kind: 'Persistant',
               text: 'Quand une de vos créatures est détruite, une zone adjacente gagne +1.',
               onAllyDestroyed: (p, st, dead, z) => { const adj = z === 1 ? [0, 2] : [1];
                 const t = adj.reduce((a, b) => margin(st, p, b) < margin(st, p, a) ? b : a); addZone(st, p, t, 1); } },
  vorgoth:   { name: 'Vorgoth l\'Invocateur', fam: 'Démon', kind: 'Activable',
               text: 'Activable, une fois par partie : détruit votre créature la plus faible et invoque à sa place la première créature de votre deck, avec son effet Révélation.',
               activate: (p, st) => { const w = weakest(st, mine(st, p)); if (!w) return; const z = w.zone; destroy(st, w, p); callFromDeck(st, p, z); } },
  grisk:     { name: 'Grisk, Roi des Pillards', fam: 'Gobelin', kind: 'Fin de tour',
               text: 'Fin de tour, une fois par partie : si vous avez une Horde dans chaque zone, chaque Horde gagne +2.',
               onEndTurn: (p, st) => { const P = st.p[p]; if (P.generalUsed) return; const h = hordes(st, p);
                 if (h.length === 3) { P.generalUsed = true; log(st, '{g} se déclenche.', 'reveal', { g: gn(P.general) }); h.forEach(x => buff(st, x, 2)); } } },
  snagg:     { name: 'Snagg, Maître de la Horde', fam: 'Gobelin', kind: 'Activable',
               text: 'Activable, une fois par partie : détruit votre Horde la plus faible et répartit sa puissance, plus 3, équitablement entre vos autres Hordes.',
               activate: (p, st) => { const h = hordes(st, p); if (h.length < 2) return; const w = weakest(st, h); const v = Math.max(0, power(st, w)) + 3;
                 const rest = h.filter(x => x !== w); destroy(st, w, p);
                 rest.forEach((x, i) => { const n = Math.floor(v / rest.length) + (i < v % rest.length ? 1 : 0); if (n) buff(st, x, n); }); } },
  sylvaen:   { name: 'Sylvaën, Voix des Bois', fam: 'Elfe', kind: 'Fin de tour',
               text: 'Fin de tour : si une de vos créatures s\'est déplacée ce tour, une carte de votre main coûte 1 de moins.',
               onEndTurn: (p, st) => { if (!movedThisTurn(st, p).length) return; const h = st.p[p].hand.filter(c => (costOf(st, c) ?? 0) > 0);
                 if (h.length) { const c = pick(h); c.discount = (c.discount || 0) - 1; log(st, '⟦{p}⟧ : une carte de la main coûte 1 de moins.', 'up', { p }); } } },
  lirael:    { name: 'Lirael Pas-de-Vent', fam: 'Elfe', kind: 'Activable',
               text: 'Activable, une fois par partie : en fin de tour, chaque créature déplacée ce tour retourne à sa place si possible et déclenche ses effets de Déplacement.',
               activate: (p, st) => { st.p[p].returnMoves = st.turn; } },
  vaelthar:  { name: 'Vael\'Thar, l\'Aîné', fam: 'Dragon', kind: 'Début de partie',
               text: 'Début de partie : crée un Magot de dragon dans une zone au hasard. Magot : en fin de tour, gagne autant de puissance que vos sceaux non dépensés.',
               onStart: (p, st) => summon(st, p, pick([0, 1, 2]), 'magot') },
  ignaroth:  { name: 'Ignaroth le Dévoreur', fam: 'Dragon', kind: 'Fin de tour',
               text: 'Fin de tour : si vous avez dépensé tous vos sceaux, une créature Dragon au hasard de votre main gagne +1 sceau et -1 puissance ; sinon -1 sceau et +1 puissance (coût minimum 1).',
               onEndTurn: (p, st) => { const P = st.p[p], spent = P.seals === 0, d = P.hand.filter(c => isCreature(c) && hasKw(c, 'Dragon')); if (!d.length) return;
                 // Au coût minimum, le sceau n'est pas retiré (pas de dette cachée qui annulerait les +1 sceau suivants).
                 const c = pick(d); if (spent || costOf(st, c) > 1) c.costMod = (c.costMod || 0) + (spent ? 1 : -1); c.buff += spent ? -1 : 1;
                 log(st, spent ? '⟦{p}⟧ : {card} en main +1 sceau, -1 puissance.' : '⟦{p}⟧ : {card} en main -1 sceau, +1 puissance.', spent ? 'down' : 'up', { p, card: nm(c.id) }); } },
  cartographe:{ name: 'Le Cartographe', fam: null, kind: 'Début de partie', preview: true,
               text: 'Début de partie : vous voyez tous vos terrains, et où et quand ils seront révélés.' },
  erudit:    { name: 'L\'Érudit', fam: null, kind: 'Début de partie',
               text: 'Début de partie : piochez une carte.',
               onStart: (p, st) => draw(st, p, 1) },

  // ---- Set 2 ----
  mordrek:   { set: 'set2', name: 'Mordrek, Roi-liche', fam: 'Mort-vivant', kind: 'Persistant',
               text: 'Quand une carte est défaussée de votre main, votre zone la plus faible gagne +1.',
               onDiscard: (p, st) => addZone(st, p, [0, 1, 2].reduce((a, b) => margin(st, p, b) < margin(st, p, a) ? b : a), 1) },
  ossa:      { set: 'set2', name: 'Ossa la Nécromancienne', fam: 'Mort-vivant', kind: 'Activable', needsZone: true,
               text: 'Activable, une fois par partie : Exhumation, dans la zone choisie, de la créature la plus puissante de votre défausse (à défaut, la première créature de votre deck est invoquée) ; elle gagne +2.',
               activate: (p, st, z) => { let c = exhume(st, p, z); if (!c && free(st, p, z) > 0) { const i = st.p[p].deck.findIndex(isCreature); if (i >= 0) { [c] = st.p[p].deck.splice(i, 1); enter(st, c, z); } } if (c) buff(st, c, 2); } },
  valdric:   { set: 'set2', name: 'Comte Valdric', fam: 'Vampire', kind: 'Fin de tour',
               text: 'Fin de tour, 3 fois par partie : si vous avez révélé un Vampire ce tour, Drain 1 sur une créature au hasard de la main adverse, au profit de votre Vampire le plus faible.',
               onEndTurn: (p, st) => { const P = st.p[p], v = mine(st, p).filter(x => hasKw(x, 'Vampire'));
                 if ((P.generalUses || 0) < 3 && v.some(x => x.enteredTurn === st.turn)) { P.generalUses = (P.generalUses || 0) + 1; drainHand(st, weakest(st, v), 1, 1); } } },
  carmilla:  { set: 'set2', name: 'Dame Carmilla', fam: 'Vampire', kind: 'Activable', needsZone: true,
               text: 'Activable, une fois par partie : Drain 2 sur chaque créature adverse de la zone choisie, au profit de votre Vampire le plus faible de cette zone.',
               activate: (p, st, z) => { const v = weakest(st, creaturesAt(st, p, z).filter(x => hasKw(x, 'Vampire')));
                 creaturesAt(st, 1 - p, z).forEach(x => drain(st, v, x, 2)); } },
  gorbag:    { set: 'set2', name: 'Gorbag le Ripailleur', fam: 'Gobelin', kind: 'Début de tour',
               text: 'Début de tour, aux tours pairs : Festin 1 dans la zone où vous êtes le plus en retard.',
               onStartTurn: (p, st) => { if (st.turn % 2) return; const zs = [0, 1, 2].filter(z => free(st, p, z) > 0 || feastAt(st, p, z)); if (!zs.length) return;
                 feast(st, p, zs.reduce((a, b) => margin(st, p, b) < margin(st, p, a) ? b : a), 1); } },
  ophaniel:  { set: 'set2', name: 'Ophaniel, Voix des Cieux', fam: 'Ange', kind: 'Persistant',
               text: 'Quand vous piochez un Ange en dehors de la pioche du début de tour, il gagne +1.',
               onDraw: (p, st, c) => { if (hasKw(c, 'Ange') && isCreature(c)) { c.buff++; log(st, "⟦{p}⟧ : l'Ange pioché gagne +1.", 'up', { p }); } } },
  ysmera:    { set: 'set2', name: 'Ysmera, Mère des couvées', fam: 'Dragon', kind: 'Début de partie',
               text: 'Début de partie : un Œuf de braise rejoint votre main.',
               onStart: (p, st) => { const P = st.p[p]; if (P.hand.length < HAND_MAX) P.hand.push({ uid: st.nextUid++, id: 'oeuf_braise', owner: p, zone: -1, buff: 0, revealed: false }); } },
  belzharoth:{ set: 'set2', name: 'Belzharoth, Marchand d\'âmes', fam: 'Démon', kind: 'Activable', needsZone: true,
               text: 'Activable, une fois par partie : Échange dans la zone choisie, avec la créature adverse la plus puissante.',
               activate: (p, st, z) => swap(st, p, z, l => strongest(st, l)) },
  elyndra:   { set: 'set2', name: 'Elyndra, Tisseuse de sorts', fam: 'Elfe', kind: 'Persistant',
               text: 'Quand vous révélez un sort, votre zone où il est joué gagne +2.',
               onSpell: (p, st, z) => addZone(st, p, z, 2) },
  intendant: { set: 'set2', name: 'L\'Intendant', fam: null, kind: 'Début de partie',
               text: 'Début de partie : +1 sceau aux deux premiers tours.',
               onStart: (p, st) => { st.p[p].bonusSeals++; },
               onStartTurn: (p, st) => { if (st.turn === 1) st.p[p].bonusSeals++; } },
  // ---- Set 3 ----
  zero:      { set: 'set3', name: 'Zéro, l\'Intrus', fam: 'Hacker', kind: 'Persistant',
               text: 'Quand un de vos Malwares s\'exécute chez l\'adversaire, votre zone la plus faible gagne +1.',
               onMalware: (p, st) => addZone(st, p, weakestZone(st, p), 1) },
  nyx:       { set: 'set3', name: 'Nyx, Reine du réseau', fam: 'Hacker', kind: 'Activable', needsZone: true,
               text: 'Activable, une fois par partie : Piratage sur chaque créature adverse de la zone choisie, et du général adverse jusqu\'à la fin du tour suivant.',
               activate: (p, st, z) => { creaturesAt(st, 1 - p, z).forEach(x => hack(st, x)); hackGeneral(st, 1 - p); } },
  kaia:      { set: 'set3', name: 'Kaïa Lame-d\'acier', fam: 'Cyborg', kind: 'Persistant',
               text: 'Quand une de vos Surcharges se déclenche, la créature qui la déclenche gagne +1.',
               onOverload: (p, st, z, c) => { if (isCreature(c)) buff(st, c, 1); } },
  vex:       { set: 'set3', name: 'Doc Vex, Charcudoc', fam: 'Cyborg', kind: 'Début de tour',
               text: 'Début de tour, aux tours pairs : Implant 1 sur votre créature la plus faible en jeu.',
               onStartTurn: (p, st) => { if (st.turn % 2 === 0) implant(st, weakest(st, mine(st, p)), 1); } },
  machina:   { set: 'set3', name: 'Machina, Ange de la Grille', fam: 'Ange', kind: 'Fin de tour',
               text: 'Fin de tour : si vous avez dépensé tous vos sceaux, Implant 1 sur votre Ange le plus faible.',
               onEndTurn: (p, st) => { if (st.p[p].seals === 0) implant(st, weakest(st, mine(st, p).filter(x => hasKw(x, 'Ange'))), 1); } },
  mammon:    { set: 'set3', name: 'Mammon, Daemon du réseau', fam: 'Démon', kind: 'Persistant',
               text: 'Les 2 premières fois qu\'une de vos créatures est détruite, Malware 1.',
               onAllyDestroyed: (p, st) => { const P = st.p[p]; if ((P.generalUses || 0) >= 2) return; P.generalUses = (P.generalUses || 0) + 1; malware(st, p, 1); } },
  grizzbolt: { set: 'set3', name: 'Grizzbolt le Survolteur', fam: 'Gobelin', kind: 'Persistant',
               text: 'Quand une de vos Surcharges se déclenche, Horde 1 dans sa zone.',
               onOverload: (p, st, z) => horde(st, p, z, 1) },
  lysandre:  { set: 'set3', name: 'Lysandre, Technomancienne', fam: 'Elfe', kind: 'Persistant',
               text: 'Quand vous révélez un sort, votre zone où il est joué gagne +1 ; les 3 premières fois, Piratage sur la créature adverse la plus puissante de cette zone.',
               onSpell: (p, st, z) => { const P = st.p[p]; addZone(st, p, z, 1); if ((P.generalUses || 0) >= 3) return; const s = strongest(st, creaturesAt(st, 1 - p, z).filter(x => !x.hacked));
                 if (s && hack(st, s)) P.generalUses = (P.generalUses || 0) + 1; } },
  aurum:     { set: 'set3', name: 'Aurum, PDG d\'Arcadia', fam: 'Dragon', kind: 'Fin de tour',
               text: 'Fin de tour : si vous gardez au moins 3 sceaux, Implant 1 sur votre Dragon le plus puissant.',
               onEndTurn: (p, st) => { if (st.p[p].seals >= 3) implant(st, strongest(st, mine(st, p).filter(x => hasKw(x, 'Dragon'))), 1); } },
  spectre_ia:{ set: 'set3', name: 'Spectre, l\'IA défunte', fam: 'Mort-vivant', kind: 'Persistant',
               text: 'La première fois qu\'une de vos cartes se relève, Malware 1.',
               onRaise: (p, st) => { const P = st.p[p]; if (P.generalUses) return; P.generalUses = 1; malware(st, p, 1); } },
  selene:    { set: 'set3', name: 'Séléné, Vampire des données', fam: 'Vampire', kind: 'Persistant',
               text: 'Quand vous piratez une créature, Drain 1 sur elle au profit de votre Vampire le plus faible.',
               onHack: (p, st, c) => drain(st, weakest(st, mine(st, p).filter(x => hasKw(x, 'Vampire'))), c, 1) },
  courtier:  { set: 'set3', name: 'Le Courtier', fam: null, kind: 'Début de partie',
               text: 'Début de partie : la carte la plus chère de votre main coûte 1 de moins.',
               onStart: (p, st) => { const c = st.p[p].hand.filter(x => (costOf(st, x) ?? 0) > 0).sort((a, b) => costOf(st, b) - costOf(st, a))[0];
                 if (c) { c.discount = (c.discount || 0) - 1; log(st, '⟦{p}⟧ : {card} coûte 1 de moins.', 'up', { p, card: nm(c.id) }); } } },

  // ---- Set 2.5 : Faites vos jeux ----
  velours:   { set: 'tapis', name: 'Velours, Croupière des Fosses', fam: 'Démon', kind: 'Persistant',
               text: 'Chaque fois que vous faites 1 ou 2 à un dé, votre zone la plus faible gagne +2.',
               onRoll: (p, st, z, v) => { if (v <= 2) addZone(st, p, weakestZone(st, p), 2); } },
  fortuna:   { set: 'tapis', name: 'Fortuna, la Roue', fam: null, kind: 'Persistant',
               text: 'Quand vous faites 1 ou 2 à un dé, il est relancé une fois.', reroll: true },

  // ---- Boss mondiaux (boss.js) ----
  // Jamais en collection (boss: true, voir GENERAL_IDS). Le boss est le joueur 1, sans deck ni terrain, avec un Sbire dans chaque zone : à chaque tour, il joue
  // l'étape de son script (script[tour - 1], au début ou à la fin du tour) contre le joueur 0. boost : bonus de puissance de vos
  // créatures de ces familles ou de ces cartes contre lui (aura, cumulés). art : art alternatif qui le représente (portrait).
  boss_ignaroth: { boss: true, name: 'Ignaroth sous l\'éclipse', fam: 'Dragon', kind: 'Boss', art: 'ignaroth_eclipse',
               text: 'Boss mondial. Il frappe votre plateau : ses Cendres prennent vos places, son Souffle brûle votre créature la plus puissante.',
               boost: { fams: { Ange: 2, Vampire: 2, Elfe: 1 }, cards: { feu_follet: 2, juge: 2, archange: 2 } },
               script: [
                 { when: 'end', name: 'Pluie de cendres', text: 'Cendres d\'éclipse (-1) dans votre zone Gauche', act: (st, p) => ashes(st, p, 0) },
                 { when: 'end', name: 'Souffle d\'éclipse', text: 'votre créature la plus puissante au Centre perd 3', act: (st, p) => scorch(st, p, 1, 3) },
                 { when: 'end', name: 'Pluie de cendres', text: 'Cendres d\'éclipse (-1) dans votre zone Droite', act: (st, p) => ashes(st, p, 2) },
                 { when: 'end', name: 'Souffle d\'éclipse', text: 'votre créature la plus puissante à Gauche perd 3', act: (st, p) => scorch(st, p, 0, 3) },
                 { when: 'end', name: 'Pluie de cendres', text: 'Cendres d\'éclipse (-1) dans votre zone Centre', act: (st, p) => ashes(st, p, 1) },
                 { when: 'end', name: 'Souffle d\'éclipse', text: 'votre créature la plus puissante à Droite perd 3', act: (st, p) => scorch(st, p, 2, 3) },
                 { when: 'end', name: 'Éclipse totale', text: 'votre créature la plus puissante de chaque zone perd 2', act: (st, p) => [0, 1, 2].forEach(z => scorch(st, p, z, 2)) },
               ],
               aura: bossAura, onStart: bossMinions, onStartTurn: (p, st) => bossAct(p, st, 'start'), onEndTurn: (p, st) => bossAct(p, st, 'end') },
  boss_vorgoth: { boss: true, name: 'Vorgoth, le cercle infernal', fam: 'Démon', kind: 'Boss', art: 'vorgoth_cercle',
               text: 'Boss mondial. Il s\'en prend à votre main : cartes plus chères, cartes défaussées, créatures affaiblies avant d\'être jouées.',
               boost: { fams: { 'Mort-vivant': 2, Gobelin: 1 }, cards: { goule: 2, zombie: 2, recruteur: 2 } },
               script: [
                 { when: 'start', name: 'Tentation', text: 'la carte la plus chère de votre main coûte 1 de plus', act: (st, p) => tempt(st, p, 1) },
                 { when: 'end', name: 'Pacte rompu', text: 'vous défaussez une carte de votre main au hasard', act: (st, p) => pact(st, p) },
                 { when: 'start', name: 'Tentation', text: 'les 2 cartes les plus chères de votre main coûtent 1 de plus', act: (st, p) => tempt(st, p, 2) },
                 { when: 'end', name: 'Pacte rompu', text: 'vous défaussez une carte de votre main au hasard', act: (st, p) => pact(st, p) },
                 { when: 'start', name: 'Murmure', text: 'les créatures de votre main perdent 1', act: (st, p) => whisper(st, p) },
                 { when: 'end', name: 'Pacte rompu', text: 'vous défaussez une carte de votre main au hasard', act: (st, p) => pact(st, p) },
                 { when: 'end', name: 'Cercle de flammes', text: 'chacune de vos zones qui n\'est pas pleine perd 3', act: (st, p) => [0, 1, 2].forEach(z => { if (creaturesAt(st, p, z).length < SLOTS) addZone(st, p, z, -3); }) },
               ],
               aura: bossAura, onStart: bossMinions, onStartTurn: (p, st) => bossAct(p, st, 'start'), onEndTurn: (p, st) => bossAct(p, st, 'end') },
  boss_vaelthar: { boss: true, name: 'Vael\'Thar du glacier', fam: 'Dragon', kind: 'Boss', art: 'vaelthar_glacier',
               text: 'Boss mondial. Il gèle votre deck : Éclats de givre glissés dans vos pioches, créatures engourdies, cartes perdues.',
               boost: { fams: { 'Démon': 2, Dragon: 1 }, cards: { pyromane: 2, rouge: 2, bete: 2 } },
               script: [
                 { when: 'end', name: 'Givre', text: '2 Éclats de givre sont glissés dans le haut de votre deck', act: (st, p) => frost(st, p, 2) },
                 { when: 'end', name: 'Engourdissement', text: 'les 2 prochaines créatures de votre deck perdent 2', act: (st, p) => numb(st, p) },
                 { when: 'end', name: 'Givre', text: '2 Éclats de givre sont glissés dans le haut de votre deck', act: (st, p) => frost(st, p, 2) },
                 { when: 'end', name: 'Engourdissement', text: 'les 2 prochaines créatures de votre deck perdent 2', act: (st, p) => numb(st, p) },
                 { when: 'end', name: 'Givre', text: '2 Éclats de givre sont glissés dans le haut de votre deck', act: (st, p) => frost(st, p, 2) },
                 { when: 'end', name: 'Gel profond', text: 'les 2 premières cartes de votre deck partent à la défausse', act: (st, p) => mill(st, p, 2) },
                 { when: 'start', name: 'Blizzard', text: 'vos créatures en jeu de puissance 1 ou moins sont détruites', act: (st, p) => mine(st, p).filter(c => power(st, c) <= 1).forEach(c => destroy(st, c, 1 - p)) },
               ],
               aura: bossAura, onStart: bossMinions, onStartTurn: (p, st) => bossAct(p, st, 'start'), onEndTurn: (p, st) => bossAct(p, st, 'end') },
};

// ---- Boss mondiaux : actions de leur script ----
// p : le joueur visé (celui qui affronte le boss). Le boss écrit d'abord le nom de son action au journal (genHook : il a agi).
export const bossStep = (st, p = 1) => GENERALS[st.p[p].general]?.script?.[st.turn - 1] || null;
function bossAct(p, st, when) {
  const s = bossStep(st, p); if (!s || s.when !== when) return;
  log(st, '{g} : {step}, {text}.', 'reveal', { g: gn(st.p[p].general), step: [s.name], text: [s.text] });
  s.act(st, 1 - p);
}
// Bonus de vos créatures contre le boss : famille et carte, cumulés.
export function bossBoost(general, id) {
  const b = GENERALS[general]?.boost, d = CARDS[id]; if (!b || !d || d.type !== 'C' || d.token) return 0;
  return d.kw.reduce((n, k) => n + (b.fams[k] || 0), 0) + (b.cards[id] || 0);
}
function bossMinions(p, st) { for (const z of [0, 1, 2]) summon(st, p, z, 'sbire'); }
function bossAura(p, c, st) { return c.owner === p ? 0 : bossBoost(st.p[p].general, c.id); }
// Cendres : un jeton -1 dans la zone ; zone pleine, sa créature la plus faible perd 1.
function ashes(st, p, z) {
  if (free(st, p, z) <= 0) { const w = weakest(st, creaturesAt(st, p, z)); if (w) buff(st, w, -1); return; }
  st.p[p].board[z].push({ uid: st.nextUid++, id: 'cendres', owner: p, zone: z, buff: 0, revealed: true, order: st.order++ });
  log(st, "Des Cendres d'éclipse tombent chez ⟦{p}⟧ ({z}).", 'down', { p, z: zn(z) });
}
// Souffle : la créature la plus puissante de la zone perd n ; zone vide, la zone perd n.
function scorch(st, p, z, n) { const s = strongest(st, creaturesAt(st, p, z)); if (s) buff(st, s, -n); else addZone(st, p, z, -n); }
function tempt(st, p, n) {
  st.p[p].hand.filter(c => costOf(st, c) !== null).sort((a, b) => costOf(st, b) - costOf(st, a)).slice(0, n)
    .forEach(c => { c.costMod = (c.costMod || 0) + 1; log(st, '{card} coûte 1 de plus.', 'down', { card: nm(c.id) }); });
}
function pact(st, p) { const h = st.p[p].hand; if (h.length) discardCard(st, p, pick(h)); }
function whisper(st, p) {
  const h = st.p[p].hand.filter(isCreature); h.forEach(c => { c.buff -= 1; });
  if (h.length) log(st, 'Les créatures de la main de ⟦{p}⟧ perdent 1.', 'down', { p });
}
function frost(st, p, n) { for (let i = 0; i < n; i++) plant(st, p, 'givre'); log(st, '{n} Éclats de givre rejoignent le deck de ⟦{p}⟧.', 'down', { n, p }); }
function numb(st, p) {
  const list = st.p[p].deck.filter(isCreature).slice(0, 2); list.forEach(c => { c.buff -= 2; });
  if (list.length) log(st, list.length > 1 ? '{n} créatures du deck de ⟦{p}⟧ perdent 2.' : 'Une créature du deck de ⟦{p}⟧ perd 2.', 'down', { n: list.length, p });
}
function mill(st, p, n) {
  const P = st.p[p], gone = P.deck.splice(0, n);
  for (const c of gone) { if (!CARDS[c.id].token) P.discard.push(c); log(st, '{card} part du deck de ⟦{p}⟧ à la défausse.', 'down', { card: nm(c.id), p }); }
}

// ---- Terrains ----
// Crochets : flat (bonus de zone), aura, onReveal, onStartTurn, onEndTurn, onAllyDestroyed, onCardReveal.
export const TERRAINS = {
  prairie:   { name: 'Prairie céleste', fam: 'Ange', text: 'Vos Anges ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Ange') ? 1 : 0 },
  autel:     { name: 'Autel de la Grâce', fam: 'Ange', text: 'Fin de tour : si vous avez dépensé tous vos sceaux, la créature adverse la plus puissante ici perd 1.',
               onEndTurn: (p, st, z) => { if (st.p[p].seals === 0) { const s = strongest(st, creaturesAt(st, 1 - p, z)); if (s) buff(st, s, -1); } } },
  charnier:  { name: 'Charnier', fam: 'Démon', text: 'Quand une de vos créatures est détruite ici, les Démons de votre main gagnent +1.',
               onAllyDestroyed: (p, st, dead, z, tz) => { if (z !== tz) return; const d = st.p[p].hand.filter(c => hasKw(c, 'Démon'));
                 d.forEach(c => { c.buff++; }); if (d.length) log(st, '⟦{p}⟧ : Démons en main +1.', 'up', { p }); } },
  bergerie:  { name: 'Bergerie maudite', fam: 'Démon', text: 'Début de tour : si vous n\'avez aucune créature ici, créez une Chèvre ici. Chèvre (0/-1) : si elle est sacrifiée, +1 sceau au tour suivant.',
               onStartTurn: (p, st, z) => { if (!creaturesAt(st, p, z).length) summon(st, p, z, 'chevre'); } },
  terrier:   { name: 'Terrier', fam: 'Gobelin', text: 'Vos Gobelins ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Gobelin') ? 1 : 0 },
  razzia:    { name: 'Piste de razzia', fam: 'Gobelin', text: 'Début de tour : votre Horde ici se déplace vers une autre zone que vous perdez, si possible, et gagne +2.',
               onStartTurn: (p, st, z) => { const h = hordeAt(st, p, z); if (!h) return;
                 const to = [0, 1, 2].filter(x => x !== z && margin(st, p, x) < 0 && (free(st, p, x) > 0 || hordeAt(st, p, x))).sort((a, b) => margin(st, p, a) - margin(st, p, b))[0];
                 if (to === undefined) return; const other = hordeAt(st, p, to);
                 if (other) { const v = Math.max(0, power(st, h)) + 2; removeToken(st, h); buff(st, other, v); log(st, 'La Horde rejoint celle de la zone {z}.', '', { z: zn(to) }); }
                 else if (move(st, h, to)) buff(st, h, 2); } },
  bois:      { name: 'Bois mouvant', fam: 'Elfe', text: 'Vos créatures ici sont Déplaçables.' },
  clairiere: { name: 'Clairière', fam: 'Elfe', text: 'Fin de tour : vos créatures arrivées ici par déplacement ce tour gagnent +1.',
               onEndTurn: (p, st, z) => movedThisTurn(st, p).filter(c => c.zone === z).forEach(c => buff(st, c, 1)) },
  nid:       { name: 'Nid de dragons', fam: 'Dragon', text: 'Vos Dragons ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Dragon') ? 1 : 0 },
  aire:      { name: 'Aire de chasse', fam: 'Dragon', text: 'Quand vous jouez un Dragon ici, la créature adverse la plus faible ici perd 1 et votre Dragon gagne +1.',
               onCardReveal: (p, st, c, z) => { if (!hasKw(c, 'Dragon') || !isCreature(c)) return; const w = weakest(st, creaturesAt(st, 1 - p, z)); if (w) buff(st, w, -1); buff(st, c, 1); } },
  duel:      { name: 'Duel singulier', fam: null, text: 'Si vous n\'avez qu\'une seule créature ici, elle gagne +5.',
               aura: (p, t, st) => t.owner === p && creaturesAt(st, p, t.zone).length === 1 ? 5 : 0 },
  forteresse:{ name: 'Forteresse', fam: null, text: 'Si vos 4 emplacements ici sont occupés, vos autres zones gagnent +1.' },
  sanctuaire:{ name: 'Sanctuaire', fam: null, text: 'Votre zone ici gagne +2.', flat: 2 },
  ruines:    { name: 'Ruines maudites', fam: null, text: 'Les créatures adverses ici ont -1.', aura: (p, t) => t.owner !== p ? -1 : 0 },
  champ:     { name: 'Champ de bataille', fam: null, text: 'Affecte les deux joueurs : toutes les créatures ici ont +1.', aura: () => 1, shared: true },

  // ---- Set 2 ----
  cimetiere: { set: 'set2', name: 'Cimetière', fam: 'Mort-vivant', text: 'Vos cartes qui se relèvent arrivent ici si un emplacement est libre, et gagnent +1 de plus.' },
  crypte:    { set: 'set2', name: 'Crypte', fam: 'Mort-vivant', text: 'Fin de tour : si vous avez une créature ici, la carte avec Relève la moins chère de votre main est défaussée (elle se relève).',
               onEndTurn: (p, st, z) => { if (!creaturesAt(st, p, z).length) return; const r = st.p[p].hand.filter(c => CARDS[c.id].raise).sort((a, b) => CARDS[a.id].cost - CARDS[b.id].cost)[0];
                 if (r) discardCard(st, p, r); } },
  chateau:   { set: 'set2', name: 'Château de la nuit', fam: 'Vampire', text: 'Vos Vampires ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Vampire') ? 1 : 0 },
  bassin:    { set: 'set2', name: 'Bassin de sang', fam: 'Vampire', text: 'Fin de tour : Drain 1 sur la créature adverse la plus puissante ici, au profit de votre Vampire le plus faible ici.',
               onEndTurn: (p, st, z) => { const v = weakest(st, creaturesAt(st, p, z).filter(x => hasKw(x, 'Vampire'))); if (v) drain(st, v, strongest(st, creaturesAt(st, 1 - p, z)), 1); } },
  table:     { set: 'set2', name: 'Table du festin', fam: 'Gobelin', text: 'Début de tour : si vous avez un Gobelin ici, Festin 1 ici.',
               onStartTurn: (p, st, z) => { if (creaturesAt(st, p, z).some(c => hasKw(c, 'Gobelin'))) feast(st, p, z, 1); } },
  bibliotheque:{ set: 'set2', name: 'Bibliothèque céleste', fam: 'Ange', text: 'Fin de tour : si vous avez dépensé tous vos sceaux et avez un Ange ici, piochez 1 carte.',
               onEndTurn: (p, st, z) => { if (st.p[p].seals === 0 && creaturesAt(st, p, z).some(c => hasKw(c, 'Ange'))) draw(st, p, 1, true); } },
  couvoir:   { set: 'set2', name: 'Couvoir volcanique', fam: 'Dragon', text: 'Début de tour : vos Œufs ici éclosent.',
               onStartTurn: (p, st, z) => eggs(st, p).filter(c => c.zone === z).forEach(c => hatch(st, c)) },
  foire:     { set: 'set2', name: 'Foire aux âmes', fam: 'Démon', text: 'Fin de tour : Échange ici avec la créature adverse la plus faible.',
               onEndTurn: (p, st, z) => swap(st, p, z, l => weakest(st, l)) },
  cercle:    { set: 'set2', name: 'Cercle de pierres levées', fam: 'Elfe', text: 'Quand vous révélez un sort ici, la zone adverse ici perd 1.',
               onSpellHere: (p, st, z) => addZone(st, 1 - p, z, -1) },
  source:    { set: 'set2', name: 'Source de mana', fam: null, text: 'Fin de tour : si vous avez 3 créatures ou plus ici, +1 sceau au tour suivant.',
               onEndTurn: (p, st, z) => { if (creaturesAt(st, p, z).length >= 3) { st.p[p].bonusSeals++; log(st, '⟦{p}⟧ : +1 sceau au tour suivant.', 'up', { p }); } } },
  guet:      { set: 'set2', name: 'Tour de guet', fam: null, text: 'Votre créature la plus puissante ici gagne +2.',
               aura: (p, t, st) => t.owner === p && t === topRaw(creaturesAt(st, p, t.zone)) ? 2 : 0 },
  // ---- Set 3 ----
  datacentre:{ set: 'set3', name: 'Datacentre', fam: 'Hacker', text: 'Fin de tour : si vous avez un Hacker ici, Malware 1.',
               onEndTurn: (p, st, z) => { if (creaturesAt(st, p, z).some(c => hasKw(c, 'Hacker'))) malware(st, p, 1); } },
  brouillage:{ set: 'set3', name: 'Zone de brouillage', fam: 'Hacker', text: 'Les créatures que l\'adversaire révèle ici sont piratées.',
               onFoeReveal: (p, st, c) => hack(st, c) },
  clinique:  { set: 'set3', name: 'Clinique clandestine', fam: 'Cyborg', text: 'Début de tour : Implant 1 sur votre créature la plus faible ici.',
               onStartTurn: (p, st, z) => implant(st, weakest(st, creaturesAt(st, p, z)), 1) },
  centrale:  { set: 'set3', name: 'Centrale électrique', fam: 'Cyborg', text: 'Vos Surcharges ici coûtent 1 sceau de moins.' },
  nuage:     { set: 'set3', name: 'Nuage céleste', fam: 'Ange', text: 'Vos créatures avec Implant ici ont +1.', aura: (p, t) => t.owner === p && t.implants ? 1 : 0 },
  darknet:   { set: 'set3', name: 'Darknet', fam: 'Démon', text: 'Quand une de vos créatures est détruite ici, Malware 1.',
               onAllyDestroyed: (p, st, dead, z, tz) => { if (z === tz) malware(st, p, 1); } },
  decharge:  { set: 'set3', name: 'Décharge', fam: 'Gobelin', text: 'Quand une de vos Surcharges se déclenche ici, la créature adverse la plus faible ici perd 1.' },
  cables:    { set: 'set3', name: 'Forêt de câbles', fam: 'Elfe', text: 'Quand vous révélez un sort ici, Piratage sur la créature adverse la plus puissante ici.',
               onSpellHere: (p, st, z) => hack(st, strongest(st, creaturesAt(st, 1 - p, z).filter(x => !x.hacked))) },
  tour_corpo:{ set: 'set3', name: 'Tour corporatiste', fam: 'Dragon', text: 'Fin de tour : si vous gardez au moins 1 sceau, Implant 1 sur votre Dragon le plus faible ici.',
               onEndTurn: (p, st, z) => { if (st.p[p].seals > 0) implant(st, weakest(st, creaturesAt(st, p, z).filter(c => hasKw(c, 'Dragon'))), 1); } },
  serveur:   { set: 'set3', name: 'Serveur fantôme', fam: 'Mort-vivant', text: 'Vos cartes qui se relèvent ici gagnent Implant 1.' },
  club:      { set: 'set3', name: 'Club Néon rouge', fam: 'Vampire', text: 'Fin de tour : Drain 1 sur la créature adverse piratée la plus puissante ici, au profit de votre Vampire le plus faible ici.',
               onEndTurn: (p, st, z) => { const v = weakest(st, creaturesAt(st, p, z).filter(c => hasKw(c, 'Vampire'))); const h = creaturesAt(st, 1 - p, z).filter(c => c.hacked);
                 if (v && h.length) drain(st, v, strongest(st, h), 1); } },
  parefeu:   { set: 'set3', name: 'Pare-feu', fam: null, text: 'Vos créatures ici ne peuvent pas être piratées.' },
  marche_noir:{ set: 'set3', name: 'Marché noir', fam: null, text: 'Fin de tour : si vous gardez au moins 1 sceau, une carte au hasard de votre main coûte 1 de moins.',
               onEndTurn: (p, st) => { if (st.p[p].seals <= 0) return; const h = st.p[p].hand.filter(x => (costOf(st, x) ?? 0) > 0);
                 if (h.length) { const x = pick(h); x.discount = (x.discount || 0) - 1; log(st, '⟦{p}⟧ : une carte de la main coûte 1 de moins.', 'up', { p }); } } },
  // ---- Set 2.5 ----
  casino_fosses:{ set: 'tapis', name: 'Casino des Fosses', fam: null, text: 'Vos dés lancés ici font +1 (au plus 6).' },
  salle_coffres:{ set: 'tapis', name: 'Salle des coffres', fam: null, text: 'Fin de tour : vous lancez un dé ; sur 5 ou 6, votre créature la plus faible ici gagne +2.',
               onEndTurn: (p, st, z) => { if (roll(st, p, z, null, null) >= 5) { const w = weakest(st, creaturesAt(st, p, z)); if (w) buff(st, w, 2); } } },
  allee_machines:{ set: 'tapis', name: 'Allée des machines', fam: null, text: 'Vos Sept ici ont +2.', aura: (p, t) => t.owner === p && CARDS[t.id].seven ? 2 : 0 },
};

// ---- Decks préconstruits : la construction est libre, ces listes servent à tester ----
export const DECKS = {
  ange:    { name: 'Grâce céleste', fam: 'Ange', general: 'seraphine',
             cards: ['cherubin', 'benediction', 'priere', 'gardien', 'messagere', 'annonciatrice', 'heraut', 'juge', 'dominion', 'seraphin', 'archange', 'potion', 'mercenaire', 'barde', 'golem'],
             terrains: ['prairie', 'autel', 'sanctuaire', 'champ', 'forteresse'] },
  demon:   { name: 'Pacte infernal', fam: 'Démon', general: 'morgrath',
             cards: ['diablotin', 'cultiste', 'pacte', 'bourreau', 'molosse', 'rituel', 'demon_majeur', 'moissonneur', 'bete', 'seigneur', 'archidemon', 'potion', 'mercenaire', 'barde', 'golem'],
             terrains: ['charnier', 'bergerie', 'sanctuaire', 'ruines', 'duel'] },
  gobelin: { name: 'Grande Horde', fam: 'Gobelin', general: 'grisk',
             cards: ['eclaireur', 'appel', 'recruteur', 'chaman', 'pyromane', 'proliferation', 'chef', 'porte_etendard', 'bombardier', 'grand_chef', 'seigneur_guerre', 'potion', 'mercenaire', 'barde', 'golem'],
             terrains: ['terrier', 'razzia', 'sanctuaire', 'champ', 'forteresse'] },
  elfe:    { name: 'Vents sylvestres', fam: 'Elfe', general: 'sylvaen',
             cards: ['eclaireuse', 'feu_follet', 'vent', 'rodeuse', 'druidesse', 'sentier', 'archere', 'canopee', 'cerf', 'sylvain', 'reine', 'potion', 'mercenaire', 'barde', 'golem'],
             terrains: ['bois', 'clairiere', 'sanctuaire', 'ruines', 'duel'] },
  dragon:  { name: 'Trésor du dragon', fam: 'Dragon', general: 'vaelthar',
             cards: ['dragonnet', 'gardien_magot', 'thesauriser', 'oeuf', 'drake', 'souffle', 'wyverne', 'cavernes', 'rouge', 'ancien', 'dragon_or', 'potion', 'mercenaire', 'barde', 'golem'],
             terrains: ['nid', 'aire', 'sanctuaire', 'ruines', 'champ'] },
  // Set 2 : les deux nouvelles familles, puis chaque famille du set 1 avec son support.
  mortvivant:{ name: 'Marche des morts', fam: 'Mort-vivant', general: 'mordrek',
             cards: ['squelette', 'goule', 'fossoyeur', 'zombie', 'spectre', 'necromancien', 'chevalier_mort', 'liche', 'seigneur_os', 'danse_macabre', 'reanimation', 'pilleur', 'mercenaire', 'chevalier', 'golem'],
             terrains: ['cimetiere', 'crypte', 'sanctuaire', 'ruines', 'duel'] },
  vampire: { name: 'Soif éternelle', fam: 'Vampire', general: 'valdric',
             cards: ['chauve_souris', 'novice', 'servante', 'rodeur_nuit', 'noble', 'buveuse', 'comtesse', 'seigneur_vampire', 'prince_nuit', 'saignee', 'nuit_rouge', 'potion', 'mercenaire', 'chevalier', 'golem'],
             terrains: ['chateau', 'bassin', 'sanctuaire', 'ruines', 'champ'] },
  festin:  { name: 'Grande ripaille', fam: 'Gobelin', general: 'gorbag',
             cards: ['marmiton', 'cuistot', 'goinfre', 'grand_banquet', 'panse_fer', 'roi_glouton', 'eclaireur', 'appel', 'recruteur', 'chaman', 'chef', 'porte_etendard', 'grand_chef', 'seigneur_guerre', 'golem'],
             terrains: ['table', 'terrier', 'sanctuaire', 'champ', 'forteresse'] },
  oracle:  { name: 'Parole céleste', fam: 'Ange', general: 'ophaniel',
             cards: ['scribe', 'oracle', 'ecritures', 'archiviste', 'muse', 'choeur', 'cherubin', 'benediction', 'gardien', 'messagere', 'heraut', 'juge', 'dominion', 'archange', 'barde'],
             terrains: ['bibliotheque', 'prairie', 'sanctuaire', 'champ', 'forteresse'] },
  couvee:  { name: 'Couvée ardente', fam: 'Dragon', general: 'ysmera',
             cards: ['oeuf_braise', 'oeuf_or', 'oeuf_tempete', 'couveuse', 'couvaison', 'matriarche', 'dragonnet', 'gardien_magot', 'thesauriser', 'drake', 'wyverne', 'rouge', 'ancien', 'dragon_or', 'titan'],
             terrains: ['couvoir', 'nid', 'sanctuaire', 'ruines', 'champ'] },
  contrat: { name: 'Contrats infernaux', fam: 'Démon', general: 'belzharoth',
             cards: ['ame_damnee', 'possede', 'tentateur', 'corrupteur', 'marche_dupes', 'archidiable', 'cultiste', 'diablotin', 'pacte', 'bourreau', 'molosse', 'demon_majeur', 'moissonneur', 'seigneur', 'golem'],
             terrains: ['foire', 'bergerie', 'sanctuaire', 'ruines', 'duel'] },
  arcanes: { name: 'Arcanes sylvestres', fam: 'Elfe', general: 'elyndra',
             cards: ['apprentie', 'lueur', 'ronces', 'mage_bois', 'chant', 'grand_druide', 'vent', 'sentier', 'eclaireuse', 'feu_follet', 'rodeuse', 'archere', 'cerf', 'sylvain', 'alchimiste'],
             terrains: ['cercle', 'bois', 'sanctuaire', 'ruines', 'duel'] },  // Set 3 : les deux nouvelles familles, puis chaque famille existante avec son support. Cachés à l'IA avant la sortie du set (aiDeckKeys).
  hacker:  { set: 'set3', name: 'Intrusion totale', fam: 'Hacker', general: 'zero',
             cards: ['script_kiddie', 'brouilleur', 'glitcheuse', 'injection', 'casseuse', 'fixer', 'fantome_reseau', 'coupe_circuit', 'brise_glace', 'ver_polymorphe', 'ia_rebelle', 'seigneur_reseau', 'garde_securite', 'mercenaire', 'golem'],
             terrains: ['datacentre', 'brouillage', 'sanctuaire', 'ruines', 'duel'] },
  cyborg:  { set: 'set3', name: 'Chrome et néon', fam: 'Cyborg', general: 'kaia',
             cards: ['gamin_augmente', 'charcudoc', 'samourai', 'bras_canon', 'implant_combat', 'surtension', 'chrome', 'cyberpsycho', 'pilote_meca', 'colosse_augmente', 'androide', 'legende_chrome', 'mercenaire_augmente', 'chevalier', 'golem'],
             terrains: ['clinique', 'centrale', 'sanctuaire', 'champ', 'forteresse'] },
  grille:  { set: 'set3', name: 'Grille céleste', fam: 'Ange', general: 'machina',
             cards: ['ange_synthetique', 'aureole', 'seraphin_donnees', 'archange_cyber', 'cherubin', 'benediction', 'gardien', 'messagere', 'annonciatrice', 'heraut', 'juge', 'dominion', 'seraphin', 'mercenaire_augmente', 'golem'],
             terrains: ['nuage', 'prairie', 'sanctuaire', 'champ', 'forteresse'] },
  daemons: { set: 'set3', name: 'Daemons du réseau', fam: 'Démon', general: 'mammon',
             cards: ['daemon_parasite', 'possession', 'daemon_corrupteur', 'archidaemon', 'diablotin', 'cultiste', 'pacte', 'bourreau', 'molosse', 'rituel', 'demon_majeur', 'moissonneur', 'bete', 'seigneur', 'archidemon'],
             terrains: ['darknet', 'charnier', 'bergerie', 'ruines', 'duel'] },
  bricole: { set: 'set3', name: 'Bricole et surtension', fam: 'Gobelin', general: 'grizzbolt',
             cards: ['bricoleur', 'petaradeur', 'ferrailleur', 'meca_gobelin', 'eclaireur', 'appel', 'recruteur', 'chaman', 'pyromane', 'proliferation', 'chef', 'porte_etendard', 'grand_chef', 'seigneur_guerre', 'golem'],
             terrains: ['decharge', 'terrier', 'sanctuaire', 'champ', 'forteresse'] },
  techno:  { set: 'set3', name: 'Technomancie', fam: 'Elfe', general: 'lysandre',
             cards: ['technomancienne', 'intrusion', 'decrypteuse', 'oracle_reseau', 'apprentie', 'lueur', 'ronces', 'mage_bois', 'chant', 'grand_druide', 'eclaireuse', 'archere', 'druidesse', 'alchimiste', 'sylvain'],
             terrains: ['cables', 'cercle', 'sanctuaire', 'ruines', 'duel'] },
  arcadia: { set: 'set3', name: 'Arcadia Corp', fam: 'Dragon', general: 'aurum',
             cards: ['dragonnet_chrome', 'investissement', 'dragon_pdg', 'wyrm_cyber', 'dragonnet', 'gardien_magot', 'thesauriser', 'drake', 'wyverne', 'cavernes', 'rouge', 'ancien', 'dragon_or', 'mercenaire_augmente', 'golem'],
             terrains: ['tour_corpo', 'nid', 'sanctuaire', 'ruines', 'marche_noir'] },
  fantomes:{ set: 'set3', name: 'Fantômes du réseau', fam: 'Mort-vivant', general: 'spectre_ia',
             cards: ['fantome_numerique', 'sauvegarde', 'zombie_cyber', 'liche_quantique', 'squelette', 'goule', 'fossoyeur', 'zombie', 'spectre', 'necromancien', 'garde_securite', 'seigneur_os', 'danse_macabre', 'reanimation', 'mercenaire_augmente'],
             terrains: ['serveur', 'cimetiere', 'crypte', 'ruines', 'duel'] },
  donnees: { set: 'set3', name: 'Soif de données', fam: 'Vampire', general: 'selene',
             cards: ['siphonneuse', 'vampire_donnees', 'morsure_virale', 'comte_reseau', 'chauve_souris', 'novice', 'servante', 'rodeur_nuit', 'buveuse', 'comtesse', 'seigneur_vampire', 'prince_nuit', 'saignee', 'glitcheuse', 'golem'],
             terrains: ['club', 'chateau', 'bassin', 'ruines', 'sanctuaire'] },
  // Set 2.5 : le casino des neutres, le seul deck préconstruit du mini-set.
  tapis:   { set: 'tapis', name: 'Maison de jeu', fam: null, general: 'fortuna',
             cards: ['joueuse_des', 'croupier', 'des_pipes', 'cartes_biseautees', 'as_manche', 'quitte_double', 'roulette', 'sept_pique', 'sept_trefle', 'sept_carreau', 'machine_sous', 'videur', 'flambeur', 'gros_lot', 'directeur'],
             terrains: ['casino_fosses', 'salle_coffres', 'allee_machines', 'ruines', 'champ'] },
};

// ---- Utilitaires ----
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
// Pouvoir du général : appelle son crochet et compte ses déclenchements (il a écrit au journal : il a agi),
// pour que l'appli joue son effet à chaque fois (viewFor, genFired).
function genHook(st, p, hook, ...args) {
  const f = GENERALS[st.p[p].general][hook]; if (!f || genHacked(st, p)) return;
  const n = st.log.length; f(p, st, ...args);
  if (st.log.length > n) st.p[p].genFired = (st.p[p].genFired || 0) + 1;
}
function log(st, msg, kind, vars) { if (!st.sim) st.log.push({ turn: st.turn, msg, kind: kind || '', ...(vars ? { vars } : {}) }); }
// Les messages du journal sont des modèles (traduits à l'affichage, voir renderLog) aux marqueurs résolus selon qui regarde :
// ⟦{p}⟧ = nom du joueur p (ou « Vous »), ⟦{p}|il forme|vous formez⟧ = l'une ou l'autre forme ; noms de carte, de général,
// de terrain et de zone par marqueur (nm, gn, tn, zn), dans la langue de celui qui lit.
const nm = id => `⟪c:${id}⟫`;
const gn = id => `⟪g:${id}⟫`;
const tn = id => `⟪t:${id}⟫`;
const zn = z => `⟪z:${z}⟫`;
// Raison de fin de partie en variable du journal : toujours un [modèle, variables] pour être traduite (texte seul compris).
const asMsg = r => (Array.isArray(r) ? r : [r]);

// ---- État ----
// opts.generals = [général du joueur 0, général du joueur 1] pour remplacer le général par défaut du deck.
// Un deck est soit la clé d'un deck préconstruit, soit un objet { name, cards, terrains, general } (deck d'un joueur).
export function newGame(deck0, deck1, names = ['Joueur 1', 'Joueur 2'], opts = {}) {
  let uid = 1;
  const gens = opts.generals || [];
  const mk = (p, key) => {
    const d = typeof key === 'string' ? DECKS[key] : key;
    const pool = shuffle(d.terrains), zones = shuffle([0, 1, 2]);
    return {
      name: names[p], deckKey: typeof key === 'string' ? key : null, deckName: d.name, general: GENERALS[gens[p]] ? gens[p] : d.general, generalUsed: false,
      deck: shuffle(d.cards).map(id => ({ uid: uid++, id, owner: p, zone: -1, buff: 0, revealed: false })),
      hand: [], discard: [], terrainPlan: pool.slice(0, 3).map((t, i) => ({ t, z: zones[i], turn: i + 1 })),
      terrains: [null, null, null], board: [[], [], []], zoneBonus: [0, 0, 0],
      seals: 0, bonusSeals: 0, treasure: 0, lastUnspent: 0, perfectTurns: 0, lost: 0, moves: [], played: [],
      stolen: 0, feasts: 0, spells: 0, malwareRun: 0, overloads: 0, loaded: 0, sixes: 0, lows: 0, rolls: [], rollCount: 0, jackpot: 0,
    };
  };
  const st = { turn: 0, p: [mk(0, deck0), mk(1, deck1)], log: [], nextUid: 1000, order: 0, leader: 0, over: false, sim: false };
  // Partie plus courte que TURNS (initiation du tutoriel).
  if (opts.turns) st.turns = opts.turns;
  for (const p of [0, 1]) draw(st, p, START_HAND);
  for (const p of [0, 1]) genHook(st, p, 'onStart');
  return st;
}

const creaturesAt = (st, p, z) => st.p[p].board[z].filter(c => c.revealed && isCreature(c));
const mine = (st, p) => [0, 1, 2].flatMap(z => creaturesAt(st, p, z));
const hordeAt = (st, p, z) => creaturesAt(st, p, z).find(c => c.id === 'horde');
const hordes = (st, p) => mine(st, p).filter(c => c.id === 'horde');
const feastAt = (st, p, z) => creaturesAt(st, p, z).find(c => c.id === 'festin');
const eggs = (st, p) => mine(st, p).filter(c => CARDS[c.id].egg && !c.hatched).sort((a, b) => a.order - b.order);
const movedThisTurn = (st, p) => mine(st, p).filter(c => c.movedTurn === st.turn);
const margin = (st, p, z) => zonePower(st, p, z) - zonePower(st, 1 - p, z);
const weakestZone = (st, p) => [0, 1, 2].reduce((a, b) => margin(st, p, b) < margin(st, p, a) ? b : a);
const strongestFoe = (st, c) => strongest(st, creaturesAt(st, 1 - c.owner, c.zone));
export const free = (st, p, z) => SLOTS - st.p[p].board[z].length;
// Effets d'une carte : aucun si elle est piratée (Persistant, auras, Fin de tour, Destruction… ne fonctionnent plus).
const NOFX = {};
const fx = c => (c.hacked ? NOFX : CARDS[c.id]);
// Général piraté : son pouvoir ne fonctionne pas jusqu'à la fin du tour indiqué.
export const genHacked = (st, p) => !!st.p[p].genHacked && st.p[p].genHacked >= st.turn;

// Coût actuel d'une carte (null pour un coût X).
export function costOf(st, c) {
  const d = CARDS[c.id]; if (d.x) return null;
  let v = d.cost + (c.costMod || 0) + (d.costFn ? d.costFn(st, c.owner) : 0);
  if (d.cost >= 1) v = Math.max(1, v);
  const druid = d.type === 'S' && c.owner >= 0 && mine(st, c.owner).some(x => x.id === 'grand_druide' && !x.hacked) ? -1 : 0;
  return Math.max(0, v + (c.discount || 0) + druid);
}
export function isMobile(st, c) {
  if (!c.revealed || !isCreature(c) || CARDS[c.id].token) return false;
  if ((CARDS[c.id].mobile || c.mobile) && !c.hacked) return true;
  if (st.p[c.owner].terrains[c.zone] === 'bois') return true;
  return mine(st, c.owner).some(x => x.id === 'reine' && !x.hacked);
}

export function power(st, c) {
  const d = CARDS[c.id];
  let v = d.power + c.buff;
  if (d.self && !c.hacked) v += d.self(c, st);
  // Auras des créatures révélées des deux joueurs (boucles simples : power() est appelée des milliers de fois par l'IA).
  for (const P of st.p) for (const zone of P.board) for (const s of zone) {
    if (!s.revealed || s.hacked) continue;
    const sd = CARDS[s.id]; if (sd.aura && sd.type === 'C') v += sd.aura(s, c, st);
  }
  for (let p = 0; p < 2; p++) {
    const g = GENERALS[st.p[p].general]; if (g.aura && !genHacked(st, p)) v += g.aura(p, c, st);
    const t = st.p[p].terrains[c.zone]; if (t && TERRAINS[t].aura) v += TERRAINS[t].aura(p, c, st);
  }
  return v;
}
export function zonePower(st, p, z) {
  const P = st.p[p];
  let v = P.zoneBonus[z];
  const t = P.terrains[z]; if (t && TERRAINS[t].flat) v += TERRAINS[t].flat;
  P.terrains.forEach((tt, tz) => { if (tt === 'forteresse' && tz !== z && creaturesAt(st, p, tz).length >= SLOTS) v += 1; });
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
// Plus forte selon la puissance imprimée et les bonus reçus, sans les effets persistants (sert aux effets persistants eux-mêmes).
function topRaw(list) { let b = null, bv = -Infinity; for (const c of list) { const v = CARDS[c.id].power + c.buff; if (v > bv) { bv = v; b = c; } } return b; }
// Zone d'arrivée choisie par un effet de déplacement : celle où l'on est le plus en retard, avec un emplacement libre.
function bestZone(st, p, from) {
  const zs = [0, 1, 2].filter(z => z !== from && free(st, p, z) > 0);
  if (!zs.length) return null;
  return zs.reduce((a, b) => margin(st, p, b) < margin(st, p, a) ? b : a);
}

// ---- Actions ----
// extra : pioche due à un effet (hors pioche du début de tour), qui déclenche Inspiration. Renvoie les cartes piochées en main.
function draw(st, p, n, extra = false) {
  const P = st.p[p], got = [];
  for (let i = 0; i < n; i++) {
    const c = P.deck.shift(); if (!c) { if (!GENERALS[P.general]?.boss) log(st, '⟦{p}⟧ : deck vide, pas de pioche.', '', { p }); break; }
    if (CARDS[c.id].malware) { runMalware(st, p, c); continue; }
    if (P.hand.length >= HAND_MAX) { log(st, '⟦{p}⟧ : main pleine, {card} part à la défausse.', '', { p, card: nm(c.id) }); P.hand.push(c); discardCard(st, p, c, true); continue; }
    P.hand.push(c); got.push(c);
    if (!extra) continue;
    genHook(st, p, 'onDraw', c);
    for (const x of mine(st, p)) { const xd = fx(x); if (xd.onInspire && stillThere(st, x)) xd.onInspire(x, st, c); }
  }
  return got;
}
function buff(st, c, n) { c.buff += n; log(st, '{card} {n}.', n >= 0 ? 'up' : 'down', { card: nm(c.id), n: `${n >= 0 ? '+' : ''}${n}` }); }
function addZone(st, p, z, n) { st.p[p].zoneBonus[z] += n; log(st, '⟦{p}⟧ : zone {z} {n}.', n >= 0 ? 'up' : 'down', { p, z: zn(z), n: `${n >= 0 ? '+' : ''}${n}` }); }
// Carte qui revient en main ou en jeu depuis la défausse : elle repart de zéro.
function fresh(c) {
  for (const k of ['pending', 'movedTurn', 'playerMoved', 'turnStartZone', 'mobile', 'xPaid', 'hatched', 'enteredTurn', 'discount', 'costMod', 'hacked', 'implants']) delete c[k];
  c.buff = 0; c.revealed = false; c.zone = -1; return c;
}

// Défausse : une carte quitte la main. Une carte avec Relève entre alors en jeu.
function discardCard(st, p, c, silent) {
  const P = st.p[p]; const i = P.hand.indexOf(c); if (i < 0) return;
  P.hand.splice(i, 1); P.discard.push(c);
  if (!silent) log(st, '⟦{p}⟧ ⟦{p}|défausse|défaussez⟧ {card}.', 'down', { p, card: nm(c.id) });
  genHook(st, p, 'onDiscard', c);
  if (CARDS[c.id].raise) raise(st, p, c);
}
// Défausse N : défausse jusqu'à N cartes avec Relève de votre main, les plus chères d'abord. Les autres cartes restent en main.
function discardFromHand(st, p, n) {
  for (let i = 0; i < n; i++) {
    const c = st.p[p].hand.filter(x => CARDS[x.id].raise).sort((a, b) => CARDS[b.id].cost - CARDS[a.id].cost)[0];
    if (!c) return; discardCard(st, p, c);
  }
}
// Relève : la carte défaussée entre en jeu avec +1, dans la zone où l'on est le plus en retard (le Cimetière l'attire et donne +1 de plus).
function raise(st, p, c) {
  const P = st.p[p];
  const cim = P.terrains.findIndex((t, z) => t === 'cimetiere' && free(st, p, z) > 0);
  const z = cim >= 0 ? cim : bestZone(st, p, -1);
  if (z === null || z === undefined) return;
  P.discard.splice(P.discard.indexOf(c), 1); fresh(c);
  log(st, '{card} se relève.', 'up', { card: nm(c.id) });
  c.buff = cim >= 0 ? 2 : 1;
  enter(st, c, z);
  if (P.terrains[z] === 'serveur' && stillThere(st, c)) implant(st, c, 1);
  genHook(st, p, 'onRaise', c);
}
// Exhumation : la créature la plus puissante de la défausse (coût max éventuel) revient en jeu dans la zone z.
function exhume(st, p, z, maxCost = Infinity) {
  const P = st.p[p]; if (free(st, p, z) <= 0) return null;
  const c = P.discard.filter(x => isCreature(x) && CARDS[x.id].cost <= maxCost).sort((a, b) => CARDS[b.id].power - CARDS[a.id].power)[0];
  if (!c) return null;
  P.discard.splice(P.discard.indexOf(c), 1); fresh(c);
  log(st, '⟦{p}⟧ ⟦{p}|exhume|exhumez⟧ {card}.', 'up', { p, card: nm(c.id) });
  enter(st, c, z); return c;
}

// Drain : la cible perd n, la source gagne n (la source peut manquer : la cible perd quand même).
// where : 'board' (en jeu, défaut), 'hand' ou 'deck' (la perte s'applique quand la carte sera jouée).
function drain(st, src, target, n, where = 'board') {
  if (!target || n <= 0) return;
  if (where === 'board') buff(st, target, -n);
  else { target.buff -= n; log(st, where === 'hand' ? 'Une carte de la main de ⟦{p}⟧ perd {n}.' : 'Une carte du deck de ⟦{p}⟧ perd {n}.', 'down', { p: target.owner, n }); }
  if (src && stillThere(st, src)) { buff(st, src, n); st.p[src.owner].stolen += n; }
}
// Drain sur k créatures au hasard de la main adverse.
function drainHand(st, src, k, n) {
  const foe = 1 - src.owner;
  shuffle(st.p[foe].hand.filter(isCreature)).slice(0, k).forEach(x => drain(st, src, x, n, 'hand'));
}

// Festin X : crée un Festin de puissance X ici, ou fait grandir celui qui y est déjà.
function feast(st, p, z, x) {
  if (x <= 0) return;
  const f = feastAt(st, p, z);
  if (f) { buff(st, f, x); return; }
  const n = summon(st, p, z, 'festin'); if (n) n.buff = x;
}
// Un Gobelin dévore un Festin : il gagne sa puissance (Goinfre : +2 de plus), le Festin disparaît.
function devour(st, g, f) {
  const v = Math.max(0, power(st, f)) + (g.id === 'goinfre' && !g.hacked ? 2 : 0);
  removeToken(st, f); st.p[g.owner].feasts++;
  log(st, '{card} dévore le Festin.', 'up', { card: nm(g.id) }); buff(st, g, v);
}

// Éclosion : l'Œuf laisse place à une créature au hasard du deck qui coûte 5 ou plus ; sinon il gagne +3.
function hatch(st, egg) {
  const P = st.p[egg.owner]; if (!stillThere(st, egg) || egg.hatched) return;
  const pool = P.deck.filter(c => isCreature(c) && CARDS[c.id].cost >= 5);
  if (!pool.length) { egg.hatched = true; log(st, "{card} éclot, mais le deck n'a pas de créature à 5 sceaux ou plus.", '', { card: nm(egg.id) }); buff(st, egg, 3); return; }
  const z = egg.zone, c = pick(pool);
  P.board[z] = P.board[z].filter(x => x !== egg); P.discard.push(egg);
  P.deck.splice(P.deck.indexOf(c), 1);
  log(st, '{card} éclot !', 'reveal', { card: nm(egg.id) });
  c.hatched = true; enter(st, c, z);
}

// Échange : votre créature de puissance négative la plus faible ici passe chez l'adversaire, et vous prenez la créature adverse choisie ici
// (jamais une Horde ni un Festin, qui restent uniques dans leur zone).
function swap(st, p, z, choose) {
  const neg = creaturesAt(st, p, z).filter(c => power(st, c) < 0);
  if (!neg.length) return false;
  const give = weakest(st, neg), take = choose(creaturesAt(st, 1 - p, z).filter(c => c.id !== 'horde' && c.id !== 'festin'));
  if (!take) return false;
  const P = st.p[p], F = st.p[1 - p];
  P.board[z] = P.board[z].filter(x => x !== give); F.board[z] = F.board[z].filter(x => x !== take);
  give.owner = 1 - p; take.owner = p; F.board[z].push(give); P.board[z].push(take);
  log(st, '⟦{p}⟧ ⟦{p}|échange|échangez⟧ {give} contre {take} ({z}).', 'reveal', { p, give: nm(give.id), take: nm(take.id), z: zn(z) });
  for (const c of [give, take]) { const d = fx(c); if (d.onSwitch) d.onSwitch(c, st); }
  return true;
}
// ---- Set 3 : Malware, Piratage, Implant et Surcharge ----
const MALWARES = ['virus', 'ver', 'rancon'];
// Un Malware glissé au hasard parmi les 6 premières cartes du deck du joueur p.
function plant(st, p, id) {
  const D = st.p[p].deck;
  D.splice(Math.floor(Math.random() * Math.min(D.length + 1, 6)), 0, { uid: st.nextUid++, id, owner: p, zone: -1, buff: 0, revealed: false });
}
// Malware N : N Malwares (Virus par défaut, 'mix' pour un de chaque sorte) glissés dans le haut du deck adverse.
function malware(st, p, n, kind = 'virus') {
  if (n <= 0) return;
  for (let i = 0; i < n; i++) plant(st, 1 - p, kind === 'mix' ? MALWARES[i % MALWARES.length] : kind);
  log(st, n > 1 ? '⟦{p}⟧ ⟦{p}|injecte|injectez⟧ {n} Malwares dans le deck adverse.' : '⟦{p}⟧ ⟦{p}|injecte|injectez⟧ un Malware dans le deck adverse.', 'down', { p, n });
}
// Un Malware pioché s'exécute et disparaît, sans être remplacé.
function runMalware(st, p, c) {
  st.p[p].malwareRun++;
  log(st, "⟦{p}⟧ ⟦{p}|pioche|piochez⟧ un {card} : il s'exécute.", 'down', { p, card: nm(c.id) });
  CARDS[c.id].malware(st, p);
  genHook(st, 1 - p, 'onMalware', c);
}
function virusHit(st, p) {
  const s = strongest(st, mine(st, p)); if (s) { buff(st, s, -1); return; }
  if (st.p[p].seals > 0) { st.p[p].seals--; log(st, '⟦{p}⟧ : -1 sceau.', 'down', { p }); }
}
// Piratage : la créature perd ses effets jusqu'à ce qu'elle quitte le jeu (Pare-feu : impossible).
function hack(st, c) {
  if (!c || c.hacked || st.p[c.owner].terrains[c.zone] === 'parefeu'
      || creaturesAt(st, c.owner, c.zone).some(x => CARDS[x.id].firewall && !x.hacked)) return false;
  c.hacked = true; log(st, '{card} est piratée : ses effets ne fonctionnent plus.', 'down', { card: nm(c.id) });
  genHook(st, 1 - c.owner, 'onHack', c);
  return true;
}
// Piratage du général : son pouvoir ne fonctionne plus jusqu'à la fin du tour suivant.
function hackGeneral(st, p) {
  if (GENERALS[st.p[p].general].boss) return;
  st.p[p].genHacked = st.turn + 1;
  log(st, "{g} est piraté jusqu'à la fin du tour suivant.", 'down', { g: gn(st.p[p].general) });
}
// Implant N : la créature gagne +N et un Implant (compté par les Cyborgs).
function implant(st, c, n) {
  if (!c || n <= 0) return;
  c.implants = (c.implants || 0) + 1; c.buff += n;
  log(st, '{card} reçoit un Implant : +{n}.', 'up', { card: nm(c.id), n });
}
// Surcharge N : à la révélation, s'il vous reste assez de sceaux, ils sont dépensés et l'effet Surcharge s'applique.
function overload(st, c, n) {
  const P = st.p[c.owner];
  let cost = n;
  if (P.terrains[c.zone] === 'centrale') cost = Math.max(0, cost - 1);
  if (P.seals < cost) return false;
  P.seals -= cost; P.overloads++;
  if (cost) log(st, cost > 1 ? '{card} : Surcharge ({n} sceaux).' : '{card} : Surcharge ({n} sceau).', 'reveal', { card: nm(c.id), n: cost });
  else log(st, '{card} : Surcharge (0 sceau).', 'reveal', { card: nm(c.id) });
  genHook(st, c.owner, 'onOverload', c.zone, c);
  if (P.terrains[c.zone] === 'decharge') { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w) buff(st, w, -1); }
  return true;
}

// ---- Set 2.5 : Pari, dés pipés, Sept et Jackpot ----
// Dé à 6 faces : st.dice (suite de résultats fixée, pour le tutoriel) sinon au hasard.
const d6 = st => (st.dice?.length ? st.dice.shift() : 1 + Math.floor(Math.random() * 6));
// Dé du joueur p dans la zone z, lancé par la carte c (null : un terrain), id pour le journal. Renvoie le résultat.
// Pipé (loaded) : 6 sans lancer. Fortuna : un 1 ou un 2 est relancé une fois. Casino des Fosses : +1 ici, au plus 6.
// Chaque dé est noté dans P.rolls (n, valeur, carte, zone) : l'appli y lit les dés à animer.
function roll(st, p, z, c, id) {
  const P = st.p[p];
  let v;
  if (P.loaded > 0) { P.loaded--; v = 6; }
  else {
    v = d6(st);
    if (v <= 2 && GENERALS[P.general].reroll && !genHacked(st, p)) {
      if (id) log(st, '{card} : dé {v}, relancé.', 'down', { card: nm(id), v }); else log(st, '⟦{p}⟧ : dé {v}, relancé.', 'down', { p, v });
      P.genFired = (P.genFired || 0) + 1; v = d6(st);
    }
    if (P.terrains[z] === 'casino_fosses') v = Math.min(6, v + 1);
    if (v < 3 && mine(st, p).some(x => fx(x).floor3)) v = 3;
  }
  if (v === 6) P.sixes++;
  if (v <= 2) P.lows++;
  P.rolls.push({ n: ++P.rollCount, v, uid: c ? c.uid : null, z });
  if (P.rolls.length > 8) P.rolls.shift();
  st.pause = (st.pause || 0) + 450;
  if (id) log(st, '{card} : dé {v}.', v >= 6 ? 'up' : v <= 2 ? 'down' : '', { card: nm(id), v });
  else log(st, '⟦{p}⟧ : dé {v}.', v >= 6 ? 'up' : v <= 2 ? 'down' : '', { p, v });
  genHook(st, p, 'onRoll', z, v);
  return v;
}
// Pari de la carte c : un dé, puis l'effet de sa tranche (1-2, 3-5 ou 6).
function pari(st, c, low, mid, high) {
  const v = roll(st, c.owner, c.zone, c, c.id);
  const f = v <= 2 ? low : v <= 5 ? mid : high; if (f) f(); return v;
}
// Dés pipés : les n prochains dés du joueur font 6.
function load(st, p, n) { st.p[p].loaded += n; log(st, n > 1 ? '⟦{p}⟧ : ⟦{p}|ses|vos⟧ {n} prochains dés feront 6.' : '⟦{p}⟧ : ⟦{p}|son|votre⟧ prochain dé fera 6.', 'up', { p, n }); }
// Triche : met sur le dessus du deck la première carte qui convient, puis la pioche. Renvoie false s'il n'y en a pas.
function tutor(st, p, ok) {
  const P = st.p[p], i = P.deck.findIndex(ok); if (i < 0) return false;
  const [x] = P.deck.splice(i, 1); P.deck.unshift(x); draw(st, p, 1, true); return true;
}
// Jackpot : la première fois que les 3 Sept du joueur sont en jeu en même temps, ses créatures gagnent +2,
// puis les effets « Jackpot » de ses cartes en jeu se déclenchent. Une fois par partie.
const SEVENS = Object.keys(CARDS).filter(id => CARDS[id].seven);
function checkJackpot(st, p) {
  const P = st.p[p]; if (P.jackpot) return;
  const here = new Set(mine(st, p).map(x => x.id)); if (!SEVENS.every(id => here.has(id))) return;
  P.jackpot = st.turn; st.pause = (st.pause || 0) + 2200;
  log(st, '⟦{p}⟧ : 7 7 7, Jackpot !', 'up', { p });
  for (const x of mine(st, p)) buff(st, x, 2);
  for (const x of mine(st, p)) { const d = fx(x); if (d.onJackpot) d.onJackpot(x, st); }
  genHook(st, p, 'onJackpot');
}

function summon(st, p, z, id) {
  if (free(st, p, z) <= 0) return null;
  const c = { uid: st.nextUid++, id, owner: p, zone: z, buff: 0, revealed: true, order: st.order++ };
  st.p[p].board[z].push(c); log(st, '⟦{p}⟧ ⟦{p}|crée|créez⟧ {card} ({z}).', '', { p, card: nm(id), z: zn(z) }); return c;
}
// Horde X : crée une Horde de puissance X ici, ou fait grandir celle qui y est déjà.
function horde(st, p, z, x) {
  if (x <= 0) return;
  const h = hordeAt(st, p, z);
  if (h) { buff(st, h, x); return; }
  const n = summon(st, p, z, 'horde'); if (n) { n.buff = x; log(st, 'Horde {n}.', 'up', { n: x }); }
}
function removeToken(st, c) { const P = st.p[c.owner]; P.board[c.zone] = P.board[c.zone].filter(x => x !== c); }
// Fait entrer une carte en jeu face visible et résout son effet Révélation.
function enter(st, c, z) {
  const P = st.p[c.owner];
  c.zone = z; c.revealed = true; c.pending = false; c.order = st.order++; c.enteredTurn = st.turn; P.board[z].push(c);
  log(st, '⟦{p}⟧ ⟦{p}|invoque|invoquez⟧ {card} ({z}).', 'reveal', { p: c.owner, card: nm(c.id), z: zn(z) });
  const d = CARDS[c.id]; if (d.onReveal) d.onReveal(c, st);
  if (d.seven) checkJackpot(st, c.owner);
}
function callFromDeck(st, p, z) {
  const P = st.p[p]; if (free(st, p, z) <= 0) return;
  const i = P.deck.findIndex(c => isCreature(c)); if (i < 0) return;
  const [c] = P.deck.splice(i, 1); enter(st, c, z);
}
// Déplacement : la créature change de zone de son côté, si un emplacement est libre.
// room : places libres déjà vérifiées par l'appelant (déplacement prévu par le joueur), sinon la zone doit avoir une place libre.
function move(st, c, to, room) {
  const P = st.p[c.owner]; if (to === c.zone || (room ?? free(st, c.owner, to)) <= 0 || !P.board[c.zone].includes(c)) return false;
  if (c.movedTurn !== st.turn) c.turnStartZone = c.zone;
  P.board[c.zone] = P.board[c.zone].filter(x => x !== c); c.zone = to; P.board[to].push(c); c.movedTurn = st.turn;
  log(st, '{card} se déplace vers {z}.', '', { card: nm(c.id), z: zn(to) });
  const d = fx(c); if (d.onMove) d.onMove(c, st);
  return true;
}
// by = joueur dont l'effet détruit la créature ; une destruction par son propre propriétaire est un sacrifice.
function destroy(st, c, by) {
  const d = CARDS[c.id];
  const P = st.p[c.owner], z = c.zone;
  if (!P.board[z].includes(c)) return false;
  P.board[z] = P.board[z].filter(x => x !== c);
  if (!d.token) P.discard.push(c);
  P.lost++;
  const sacrificed = by === c.owner;
  log(st, sacrificed ? '{card} (⟦{p}⟧) est sacrifiée.' : '{card} (⟦{p}⟧) est détruite.', 'down', { card: nm(c.id), p: c.owner });
  if (d.onDestroyed && !c.hacked) d.onDestroyed(c, st, z, sacrificed);
  for (const x of ordered(st).filter(x => x.owner === c.owner && x !== c)) { const xd = fx(x); if (xd.onAllyDestroyed) xd.onAllyDestroyed(x, st, c, z); }
  genHook(st, c.owner, 'onAllyDestroyed', c, z);
  P.terrains.forEach((t, tz) => { if (t && TERRAINS[t].onAllyDestroyed) TERRAINS[t].onAllyDestroyed(c.owner, st, c, z, tz); });
  return true;
}
// Ordre de résolution : joueur qui mène, zones de gauche à droite, ordre de pose
function ordered(st) {
  const L = st.leader; const out = [];
  for (const p of [L, 1 - L]) for (const z of [0, 1, 2]) out.push(...st.p[p].board[z].filter(c => c.revealed).sort((a, b) => a.order - b.order));
  return out;
}
const stillThere = (st, c) => st.p[c.owner].board[c.zone].includes(c);

// ---- Tour ----
export function startTurn(st) {
  st.turn++;
  log(st, '— Tour {n} —', 'turn', { n: st.turn });
  for (const p of [0, 1]) { const P = st.p[p]; P.seals = st.turn + P.bonusSeals; P.bonusSeals = 0; P.moves = []; draw(st, p, 1); }
  for (const p of [0, 1]) {
    const P = st.p[p]; const plan = P.terrainPlan.find(x => x.turn === st.turn); if (!plan) continue;
    P.terrains[plan.z] = plan.t; log(st, '⟦{p}⟧ ⟦{p}|révèle|révélez⟧ le terrain {terrain} ({z}).', 'terrain', { p, terrain: tn(plan.t), z: zn(plan.z) });
    if (TERRAINS[plan.t].onReveal) TERRAINS[plan.t].onReveal(p, st, plan.z);
  }
  st.leader = computeLeader(st);
  for (const c of ordered(st)) { const d = fx(c); if (d.onStartTurn && stillThere(st, c)) d.onStartTurn(c, st); }
  for (const p of [st.leader, 1 - st.leader]) {
    st.p[p].terrains.forEach((t, z) => { if (t && TERRAINS[t].onStartTurn) TERRAINS[t].onStartTurn(p, st, z); });
    genHook(st, p, 'onStartTurn');
  }
}

// room : places libres de la zone en fin de tour (déplacements prévus compris), par défaut celles du plateau.
export function placeHidden(st, p, uid, z, room) {
  const P = st.p[p]; const i = P.hand.findIndex(c => c.uid === uid); if (i < 0) return false;
  const c = P.hand[i]; const d = CARDS[c.id];
  const cost = d.x ? P.seals : costOf(st, c);
  if ((room ?? free(st, p, z)) <= 0 || cost > P.seals) return false;
  P.hand.splice(i, 1); P.seals -= cost; if (d.x) c.xPaid = cost;
  c.zone = z; c.revealed = false; c.order = st.order++; c.pending = true;
  P.board[z].push(c); return true;
}
function pendingOf(st, p) { return [0, 1, 2].flatMap(z => st.p[p].board[z].filter(c => c.pending)).sort((a, b) => a.order - b.order); }

// Étapes de révélation, dans l'ordre : par joueur (celui qui mène d'abord), général, déplacements, puis cartes posées.
export function revealSteps(st, gen) {
  st.leader = computeLeader(st);
  const steps = [];
  for (const p of [st.leader, 1 - st.leader]) {
    if (gen[p] !== null && gen[p] !== undefined) steps.push({ kind: 'general', p, zone: gen[p] });
    for (const m of st.p[p].moves) steps.push({ kind: 'move', p, uid: m.uid, zone: m.zone });
    for (const c of pendingOf(st, p)) steps.push({ kind: 'card', p, uid: c.uid });
  }
  return steps;
}
export function doStep(st, s) {
  const P = st.p[s.p];
  if (s.kind === 'general') {
    const g = GENERALS[P.general]; if (P.generalUsed || !g.activate) return null;
    if (genHacked(st, s.p)) { log(st, '{g} est piraté : son pouvoir ne répond pas.', 'down', { g: gn(P.general) }); return null; }
    P.generalUsed = true; log(st, g.needsZone ? '⟦{p}⟧ ⟦{p}|active|activez⟧ {g} ({z}).' : '⟦{p}⟧ ⟦{p}|active|activez⟧ {g}.', 'reveal', { p: s.p, g: gn(P.general), z: zn(s.zone) }); g.activate(s.p, st, s.zone); return null;
  }
  if (s.kind === 'move') {
    const c = [0, 1, 2].flatMap(z => P.board[z]).find(x => x.uid === s.uid);
    if (!c || !isMobile(st, c) || c.playerMoved === st.turn) return null;
    // Les cartes de la zone d'arrivée qui doivent encore en partir lui laissent leur place (une zone vidée et remplie le même tour).
    const leaving = P.moves.filter(m => m.zone !== s.zone && P.board[s.zone].some(x => x.uid === m.uid && x.playerMoved !== st.turn && isMobile(st, x))).length;
    c.playerMoved = st.turn; move(st, c, s.zone, SLOTS - P.board[s.zone].length + leaving); return c;
  }
  const c = [0, 1, 2].flatMap(z => P.board[z]).find(x => x.uid === s.uid); if (!c) return null;
  c.pending = false; c.revealed = true; c.enteredTurn = st.turn; P.played.push(c.id);
  const d = CARDS[c.id];
  log(st, '⟦{p}⟧ ⟦{p}|révèle|révélez⟧ {card} ({z}).', 'reveal', { p: s.p, card: nm(c.id), z: zn(c.zone) });
  if (d.sacrifice) {
    const others = creaturesAt(st, s.p, c.zone).filter(x => x !== c);
    if (others.length < d.sacrifice) { log(st, 'Pas assez de créatures à sacrifier pour {card}.', 'down', { card: nm(c.id) }); destroy(st, c, null); return c; }
    for (let i = 0; i < d.sacrifice; i++) { const w = weakest(st, creaturesAt(st, s.p, c.zone).filter(x => x !== c)); if (w) destroy(st, w, s.p); }
  }
  if (d.type === 'S') P.spells++;
  if (d.onReveal) d.onReveal(c, st);
  if (d.seven) checkJackpot(st, c.owner);
  if (stillThere(st, c)) { const t = P.terrains[c.zone]; if (t && TERRAINS[t].onCardReveal) TERRAINS[t].onCardReveal(s.p, st, c, c.zone); }
  if (stillThere(st, c) && isCreature(c)) { const t = st.p[1 - s.p].terrains[c.zone]; if (t && TERRAINS[t].onFoeReveal) TERRAINS[t].onFoeReveal(1 - s.p, st, c, c.zone); }
  if (d.type === 'S') {
    // Sortilège : créatures, général et terrain réagissent au sort révélé.
    const z = c.zone;
    for (const x of mine(st, s.p)) { const xd = fx(x); if (xd.onSpell && stillThere(st, x)) xd.onSpell(x, st, z, c); }
    genHook(st, s.p, 'onSpell', z, c);
    const t = P.terrains[z]; if (t && TERRAINS[t].onSpellHere) TERRAINS[t].onSpellHere(s.p, st, z, c);
    P.board[z] = P.board[z].filter(x => x !== c); P.discard.push(c);
  }
  return c;
}
export function endTurn(st) {
  const fired = new Set();
  for (const c of ordered(st)) {
    const d = fx(c); if (!stillThere(st, c)) continue;
    if (d.onEndTurn && d.onEndTurn(c, st) !== false) fired.add(c);
    if (d.grace && st.p[c.owner].seals === 0 && stillThere(st, c)) { d.grace(c, st); fired.add(c); }
  }
  // Festins : votre Gobelin le plus faible de la zone dévore le Festin.
  for (const p of [st.leader, 1 - st.leader]) for (const z of [0, 1, 2]) {
    const f = feastAt(st, p, z); if (!f) continue;
    const g = weakest(st, creaturesAt(st, p, z).filter(c => c !== f && hasKw(c, 'Gobelin')));
    if (g) devour(st, g, f);
  }
  for (const p of [st.leader, 1 - st.leader]) {
    const P = st.p[p];
    P.terrains.forEach((t, z) => { if (t && TERRAINS[t].onEndTurn) TERRAINS[t].onEndTurn(p, st, z); });
    if (P.angelBoost === st.turn && P.seals === 0) [...fired].filter(c => c.owner === p && stillThere(st, c)).forEach(c => buff(st, c, 2));
    if (P.returnMoves === st.turn) movedThisTurn(st, p).forEach(c => { if (c.turnStartZone !== undefined && c.turnStartZone !== c.zone) move(st, c, c.turnStartZone); });
    genHook(st, p, 'onEndTurn');
  }
  for (const p of [0, 1]) {
    const P = st.p[p];
    P.treasure += P.seals; P.lastUnspent = P.seals;
    if (P.seals === 0) P.perfectTurns++;
  }
  // Historique des joueurs : puissance de chaque zone et nombre de cartes révélées à la fin du tour (pas dans les simulations de l'IA).
  if (!st.sim) (st.trace ||= []).push({ pow: [0, 1].map(p => [0, 1, 2].map(z => zonePower(st, p, z))), n: [0, 1].map(p => st.p[p].played.length) });
  if (st.turn >= turnsOf(st)) finish(st);
}
function finish(st) {
  for (const p of [st.leader, 1 - st.leader]) guard(() => genHook(st, p, 'onEndGame'), 'onEndGame');
  st.over = true;
  const w = [0, 0]; const zones = [0, 1, 2].map(z => zoneWinner(st, z)); zones.forEach(r => { if (r >= 0) w[r]++; });
  const tot = [0, 1].map(p => [0, 1, 2].reduce((s, z) => s + zonePower(st, p, z), 0));
  let winner = -1, reason;
  if (w[0] >= 2) { winner = 0; reason = msg('{n} zones sur 3', { n: w[0] }); }
  else if (w[1] >= 2) { winner = 1; reason = msg('{n} zones sur 3', { n: w[1] }); }
  else if (tot[0] !== tot[1]) { winner = tot[0] > tot[1] ? 0 : 1; reason = msg('départage à la puissance totale ({a} contre {b})', { a: tot[0], b: tot[1] }); }
  else reason = msg('zones et puissance totale à égalité');
  st.result = { winner, reason, zones, tot };
  if (winner < 0) log(st, 'Match nul.', 'turn');
  else log(st, '⟦{p}⟧ ⟦{p}|gagne|gagnez⟧ : {reason}.', 'turn', { p: winner, reason: asMsg(reason) });
}
// Forfait (joueur déconnecté trop longtemps) : la partie s'arrête aussitôt et l'autre joueur gagne. Les zones restent celles du plateau.
// reason : texte français ou msg('modèle', { … }), gardé tel quel dans st.result.reason (traduit à l'affichage par renderLog).
export function forfeitGame(st, loser, reason) {
  st.over = true; st.phase = 'over';
  const zones = [0, 1, 2].map(z => zoneWinner(st, z));
  const tot = [0, 1].map(p => [0, 1, 2].reduce((s, z) => s + zonePower(st, p, z), 0));
  st.result = { winner: 1 - loser, reason, zones, tot, forfeit: true };
  log(st, '⟦{p}⟧ ⟦{p}|perd|perdez⟧ : {reason}.', 'turn', { p: loser, reason: asMsg(reason) });
}

// Partie interrompue (serveur arrêté pour une mise à jour) : elle s'arrête sans gagnant ni perdant, avec le plateau du moment.
export function interruptGame(st, reason) {
  st.over = true; st.phase = 'over';
  const zones = [0, 1, 2].map(z => zoneWinner(st, z));
  const tot = [0, 1].map(p => [0, 1, 2].reduce((s, z) => s + zonePower(st, p, z), 0));
  st.result = { winner: -1, reason, zones, tot, interrupted: true };
  log(st, 'Partie interrompue : {reason}.', 'turn', { reason: asMsg(reason) });
}

// Détail d'une partie terminée, pour l'historique des joueurs (pas de replay) : tours joués, puissance des zones à chaque fin de tour
// (trace, avant les effets de fin de partie), cartes révélées tour par tour (cut : nombre de cartes de played à la fin de chaque tour),
// et pour chaque joueur la puissance finale de ses zones, ses terrains et quelques compteurs.
export function gameDetail(st) {
  const trace = st.trace || [];
  return {
    turns: st.turn, trace: trace.map(t => t.pow),
    sides: [0, 1].map(p => { const P = st.p[p]; return {
      pow: [0, 1, 2].map(z => zonePower(st, p, z)), terrains: P.terrains.slice(), cut: trace.map(t => t.n[p]),
      treasure: P.treasure, perfect: P.perfectTurns, spells: P.spells, lost: P.lost, gen: !!P.generalUsed, genFired: P.genFired || 0,
    }; }),
  };
}

// ---- IA ----
// Copie profonde d'objets et de tableaux simples, en gardant les références partagées (une carte n'est copiée qu'une fois).
function copy(v, seen) {
  if (v === null || typeof v !== 'object') return v;
  let c = seen.get(v); if (c) return c;
  if (Array.isArray(v)) { c = new Array(v.length); seen.set(v, c); for (let i = 0; i < v.length; i++) c[i] = copy(v[i], seen); }
  else { c = {}; seen.set(v, c); for (const k in v) c[k] = copy(v[k], seen); }
  return c;
}
// État simulé par l'IA : sans le journal (inutile et coûteux à copier), plusieurs fois plus rapide que structuredClone.
function clone(st) { const { log: _, trace: __, ...rest } = st; const c = copy(rest, new Map()); c.sim = true; c.log = []; return c; }
const deckHas = (P, fam) => [...P.hand, ...P.deck].some(c => hasKw(c, fam));
function evalFor(st, p) {
  let s = 0;
  for (const z of [0, 1, 2]) { const d = zonePower(st, p, z) - zonePower(st, 1 - p, z); s += Math.tanh(d / 4) * 10; }
  const P = st.p[p];
  if (st.turn < turnsOf(st)) {
    // Valeur future des sceaux gardés (Trésor) ou dépensés au sceau près (Grâce).
    if (deckHas(P, 'Dragon') || P.general === 'vaelthar') s += P.treasure * 0.6 * (turnsOf(st) - st.turn) / turnsOf(st);
    if (P.general === 'aurelia' || deckHas(P, 'Ange')) s += P.perfectTurns * 0.8;
    // Malwares en attente dans le deck adverse : chacun coûtera une pioche et un peu de puissance.
    const mw = st.p[1 - p].deck.reduce((n, c) => n + (CARDS[c.id].malware ? 1 : 0), 0);
    if (mw) s += mw * 1.2 * (turnsOf(st) - st.turn) / turnsOf(st);
    // Dés pipés en réserve : autant de 6 à venir. Sept en jeu : le Jackpot approche.
    if (P.loaded) s += P.loaded * 0.8 * (turnsOf(st) - st.turn) / turnsOf(st);
    if (!P.jackpot) { const n = new Set(mine(st, p).filter(x => CARDS[x.id].seven).map(x => x.id)).size; if (n) s += [0, 0.5, 2][n] || 0; }
  }
  return s;
}
export function aiPlan(st, p, tries) { return aiSearch(st, p, tries || 250).plan; }
// Même recherche, avec la note du meilleur plan : la partie contre l'IA (solo.js) la découpe en petites tranches
// pendant que le joueur prépare son tour, pour ne jamais bloquer l'écran.
export function aiSearch(st, p, tries) {
  const P = st.p[p]; let best = { cards: [], moves: [], general: null }, bestV = -Infinity;
  const g = GENERALS[P.general];
  const mobiles = mine(st, p).filter(c => isMobile(st, c));
  for (let i = 0; i < tries; i++) {
    const plan = { cards: [], moves: [], general: null }; let seals = P.seals; const used = [0, 0, 0].map((_, z) => P.board[z].length);
    if (g.activate && !P.generalUsed && !genHacked(st, p) && seals >= (g.activateCost || 0) && Math.random() < (st.turn >= 5 ? 0.5 : 0.15)) {
      plan.general = g.needsZone ? Math.floor(Math.random() * 3) : 0; seals -= g.activateCost || 0;
    }
    for (const c of mobiles) if (Math.random() < 0.3) {
      const zs = [0, 1, 2].filter(z => z !== c.zone && used[z] < SLOTS); if (!zs.length) continue;
      const z = pick(zs); used[z]++; used[c.zone]--; plan.moves.push({ uid: c.uid, zone: z });
    }
    // Une partie des plans garde 1 ou 2 sceaux pour la révélation (Surcharge, Trésor).
    const keep = Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (const c of shuffle(P.hand)) {
      const d = CARDS[c.id], cost = d.x ? seals : costOf(st, c);
      if (cost > seals - (d.x ? 0 : keep) || Math.random() < 0.15 || (d.x && seals === 0)) continue;
      const zs = [0, 1, 2].filter(z => used[z] < SLOTS); if (!zs.length) break;
      const z = pick(zs); used[z]++; seals -= cost; plan.cards.push({ uid: c.uid, zone: z });
    }
    // Un coût X se pose en dernier pour prendre tous les sceaux restants.
    plan.cards.sort((a, b) => (CARDS[P.hand.find(c => c.uid === a.uid).id].x ? 1 : 0) - (CARDS[P.hand.find(c => c.uid === b.uid).id].x ? 1 : 0));
    const sim = clone(st);
    const gen = [null, null]; gen[p] = applyPlan(sim, p, plan);
    // Un plan dont la simulation plante (effet en erreur) est écarté : l'IA joue quand même.
    try { for (const s of revealSteps(sim, gen).filter(s => s.p === p)) doStep(sim, s); endTurn(sim); } catch { continue; }
    const v = evalFor(sim, p) + Math.random() * 0.01;
    if (v > bestV) { bestV = v; best = plan; }
  }
  return { plan: best, value: bestV };
}

// ---- Tour complet (serveur et partie contre l'IA) ----
// Applique un plan : coût du général, déplacements prévus, cartes posées face cachée.
// Les places se comptent en fin de tour : une carte qui quitte une zone y libère sa place pour une carte posée ou une autre arrivée.
// Renvoie la zone d'activation du général (0 pour un général sans zone), ou null.
export function applyPlan(st, p, plan) {
  const P = st.p[p]; const g = GENERALS[P.general];
  let gz = null;
  const z = plan && plan.general;
  if (g.activate && !P.generalUsed && !genHacked(st, p) && [0, 1, 2].includes(z) && P.seals >= (g.activateCost || 0)) { gz = z; P.seals -= g.activateCost || 0; }
  P.moves = [];
  const seen = new Set();
  for (const m of (plan && Array.isArray(plan.moves) ? plan.moves : []).slice(0, 12)) {
    const c = mine(st, p).find(x => x.uid === m.uid);
    if (!c || seen.has(c.uid) || !isMobile(st, c) || c.playerMoved === st.turn || ![0, 1, 2].includes(m.zone) || m.zone === c.zone) continue;
    seen.add(c.uid); P.moves.push({ uid: c.uid, zone: m.zone, from: c.zone });
  }
  // Une zone qui dépasserait SLOTS en fin de tour : ses derniers déplacements entrants sont refusés.
  // Une zone déjà trop pleine sans déplacement entrant (un départ prévu qui a échoué) reste telle quelle : sans cette garde, la boucle ne finissait jamais.
  const used = () => [0, 1, 2].map(z => P.board[z].length - P.moves.filter(m => m.from === z).length + P.moves.filter(m => m.zone === z).length);
  for (let n = used(), z; (z = n.findIndex((v, i) => v > SLOTS && P.moves.some(m => m.zone === i))) >= 0; n = used()) P.moves.splice(P.moves.findLastIndex(m => m.zone === z), 1);
  const n = used();
  for (const x of (plan && Array.isArray(plan.cards) ? plan.cards : []).slice(0, 12)) if ([0, 1, 2].includes(x.zone) && placeHidden(st, p, x.uid, x.zone, SLOTS - n[x.zone])) n[x.zone]++;
  return gz;
}

// Résout un tour une fois les deux plans connus. `emit(flashUid)` est appelé après chaque étape visible,
// `wait(ms)` laisse le temps à l'animation (instantané en simulation).
// Un effet qui plante est noté dans la console et sauté : la partie continue et va jusqu'au bout (fin, historique).
export async function runTurn(st, plans, emit, wait) {
  const gen = [applyPlan(st, 0, plans[0]), applyPlan(st, 1, plans[1])];
  st.phase = 'reveal';
  const steps = revealSteps(st, gen);
  // Le bandeau « Révélation » (1,5 s côté appli) disparaît avant que la première carte soit révélée.
  emit(null); await wait(1600);
  // Partie arrêtée pendant la révélation (forfait, serveur interrompu) : le tour s'arrête là, sans écraser son résultat.
  for (const s of steps) { if (st.over) return; st.pause = 0; const c = guard(() => doStep(st, s), s); emit(c ? c.uid : null); await wait(850 + (st.pause || 0)); }
  if (st.over) return;
  st.pause = 0; guard(() => endTurn(st), 'endTurn');
  if (!st.over && st.turn >= turnsOf(st)) guard(() => finish(st), 'finish');
  if (st.over) { st.phase = 'over'; emit(null); return; }
  emit(null); await wait(350 + (st.pause || 0));
  if (st.over) return;
  guard(() => startTurn(st), 'startTurn'); st.phase = 'plan'; emit(null);
}
function guard(fn, what) {
  try { return fn(); } catch (e) { console.error('Effet en erreur, ignoré :', what, e); return null; }
}

// Vue d'une partie pour un siège : la main et les cartes cachées de l'adversaire ne sont jamais envoyées.
export function viewFor(st, seat, extra = {}) {
  const side = (p, isMe) => {
    const P = st.p[p];
    const g = GENERALS[P.general];
    return {
      name: P.name, deckKey: P.deckKey, deckName: P.deckName, general: P.general, generalUsed: P.generalUsed, genFired: P.genFired || 0,
      hand: isMe ? P.hand.map(c => ({ uid: c.uid, id: c.id, cost: costOf(st, c), power: CARDS[c.id].power + c.buff })) : undefined,
      handCount: P.hand.length, deckCount: P.deck.length, seals: P.seals,
      treasure: P.treasure, perfectTurns: P.perfectTurns, loaded: P.loaded || 0, sixes: P.sixes || 0, rolls: P.rolls ? P.rolls.slice() : [], jackpot: P.jackpot || 0,
      terrains: P.terrains.slice(), zoneBonus: P.zoneBonus.slice(),
      terrainPlan: isMe && g.preview ? P.terrainPlan.filter(x => x.turn > st.turn) : undefined,
      board: P.board.map(z => z.slice().sort((a, b) => a.order - b.order).map(c =>
        c.revealed ? { uid: c.uid, id: c.id, revealed: true, power: power(st, c), mobile: isMe && isMobile(st, c) && c.playerMoved !== st.turn }
          : isMe ? { uid: c.uid, id: c.id, revealed: false } : { uid: c.uid, hidden: true })),
      zonePower: [0, 1, 2].map(z => zonePower(st, p, z)),
    };
  };
  return {
    seat, turn: st.turn, turns: turnsOf(st), phase: st.phase || 'plan',
    me: side(seat, true), foe: side(1 - seat, false),
    log: st.log.slice(-80), result: st.result || null, ...extra,
  };
}

// Texte d'une ligne du journal pour le joueur `seat`, dans la langue de l'appli.
// Une ligne est { msg, vars } : msg est un modèle français traduit par i18n.js, puis les marqueurs sont résolus :
// ⟦p⟧ = nom du joueur p (ou « Vous »), ⟦p|il|vous⟧ = l'une ou l'autre forme selon qui regarde (@ y vaut le nom du joueur p),
// ⟪c:id⟫, ⟪g:id⟫, ⟪t:id⟫ = nom d'une carte, d'un général, d'un terrain ; ⟪z:n⟫ = nom d'une zone.
// Une ligne d'avant (msg déjà rédigé, sans vars) passe aussi.
const NAMED = { c: id => t(CARDS[id]?.name), g: id => t(GENERALS[id]?.name), t: id => t(TERRAINS[id]?.name), z: n => t(ZONE_NAMES[+n]) };
export function renderLog(line, seat, names) {
  const m = line && typeof line === 'object' && !Array.isArray(line) ? (line.vars ? [line.msg, line.vars] : line.msg) : line;
  return tMsg(m)
    .replace(/⟪([cgtz]):([^⟫]*)⟫/g, (_, k, id) => NAMED[k](id) ?? id)
    .replace(/⟦(\d)\|([^|⟧]*)\|([^⟧]*)⟧/g, (_, p, il, vous) => (+p === seat ? vous : il).replace(/@/g, names[+p] ?? ''))
    .replace(/⟦(\d)⟧/g, (_, p) => (+p === seat ? t('Vous') : names[+p]));
}
