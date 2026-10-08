// Moteur de règles : pur, sans DOM ni réseau. Partagé par le serveur (parties en ligne) et l'appli (partie contre l'IA).
export const TURNS = 7, SLOTS = 4, HAND_MAX = 7, START_HAND = 3;
export const ZONE_NAMES = ['Gauche', 'Centre', 'Droite'];
export const FAMILIES = ['Ange', 'Démon', 'Gobelin', 'Elfe', 'Dragon'];

const isCreature = c => CARDS[c.id].type === 'C';
const hasKw = (c, k) => CARDS[c.id].kw.includes(k);
const half = n => Math.floor(n / 2);

// ---- Cartes du set 1 ----
// Crochets : onReveal, self (bonus persistant sur soi), aura (bonus persistant sur les autres), onStartTurn, onEndTurn,
// grace (fin de tour si tous les sceaux sont dépensés), onDestroyed, onAllyDestroyed, onMove, costFn (réduction de coût).
// Mots-clés : x (coût X), sacrifice (nombre de créatures à sacrifier), mobile (Déplaçable), token (jeton).
export const CARDS = {
  // ANGE : Grâce
  cherubin:    { name: 'Chérubin', type: 'C', cost: 1, power: 1, kw: ['Ange'], text: 'Grâce : +1.',
                 grace: (c, st) => buff(st, c, 1) },
  benediction: { name: 'Bénédiction', type: 'S', cost: 1, power: 0, kw: ['Ange'], text: 'Vos créatures ici gagnent +1.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).forEach(x => buff(st, x, 1)) },
  priere:      { name: 'Prière', type: 'S', cost: 0, x: true, power: 0, kw: ['Ange'], text: 'Coût X : dépense tous vos sceaux restants. Votre créature la plus faible ici gagne +X.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w && c.xPaid) buff(st, w, c.xPaid); } },
  gardien:     { name: 'Ange gardien', type: 'C', cost: 2, power: 2, kw: ['Ange'], text: 'Persistant : vos autres créatures ici ont +1.',
                 aura: (s, t) => t.owner === s.owner && t.zone === s.zone && t !== s ? 1 : 0 },
  messagere:   { name: 'Messagère', type: 'C', cost: 2, power: 2, kw: ['Ange'], text: 'Grâce : une autre de vos créatures ici gagne +1.',
                 grace: (c, st) => { const o = creaturesAt(st, c.owner, c.zone).filter(x => x !== c); if (o.length) buff(st, pick(o), 1); } },
  annonciatrice:{ name: 'Annonciatrice', type: 'C', cost: 2, power: 1, kw: ['Ange'], text: 'Révélation : +1 sceau au tour suivant.',
                 onReveal: (c, st) => { st.p[c.owner].bonusSeals++; log(st, `${who(st, c.owner)} : +1 sceau au tour suivant.`, 'up'); } },
  heraut:      { name: 'Héraut céleste', type: 'C', cost: 3, power: 3, kw: ['Ange'], text: 'Révélation : vos autres Anges gagnent +1.',
                 onReveal: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  juge:        { name: 'Juge céleste', type: 'C', cost: 3, power: 4, kw: ['Ange'], text: 'Grâce : la créature adverse la plus puissante ici perd 1.',
                 grace: (c, st) => { const s = strongest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (s) buff(st, s, -1); } },
  dominion:    { name: 'Dominion', type: 'C', cost: 4, power: 4, kw: ['Ange'], text: 'Grâce : vos autres Anges gagnent +1.',
                 grace: (c, st) => mine(st, c.owner).filter(x => x !== c && hasKw(x, 'Ange')).forEach(x => buff(st, x, 1)) },
  seraphin:    { name: 'Séraphin', type: 'C', cost: 5, power: 5, kw: ['Ange'], text: 'Révélation : +1 par tour précédent où vous avez dépensé tous vos sceaux.',
                 onReveal: (c, st) => { const n = st.p[c.owner].perfectTurns; if (n) buff(st, c, n); } },
  archange:    { name: 'Archange', type: 'C', cost: 6, power: 8, kw: ['Ange'], text: 'Révélation : vos autres créatures ici gagnent +1.',
                 onReveal: (c, st) => creaturesAt(st, c.owner, c.zone).filter(x => x !== c).forEach(x => buff(st, x, 1)) },

  // DÉMON : Sacrifice
  diablotin:   { name: 'Diablotin', type: 'C', cost: 1, power: 1, kw: ['Démon'], text: 'Destruction : votre zone ici gagne +2.',
                 onDestroyed: (c, st, z) => addZone(st, c.owner, z, 2) },
  cultiste:    { name: 'Cultiste', type: 'C', cost: 1, power: 1, kw: ['Démon'], text: 'Révélation : créez une Chèvre ici.',
                 onReveal: (c, st) => summon(st, c.owner, c.zone, 'chevre') },
  pacte:       { name: 'Pacte de sang', type: 'S', cost: 1, power: 0, kw: ['Démon'], text: 'Détruisez votre créature la plus faible ici, puis piochez une carte.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, c.owner, c.zone)); if (w) destroy(st, w, c.owner); draw(st, c.owner, 1); } },
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
  pyromane:    { name: 'Gobelin pyromane', type: 'C', cost: 2, power: 2, kw: ['Gobelin'], text: 'Révélation : détruisez la créature adverse la plus faible ici si sa puissance est 2 ou moins.',
                 onReveal: (c, st) => { const w = weakest(st, creaturesAt(st, 1 - c.owner, c.zone)); if (w && power(st, w) <= 2) destroy(st, w, c.owner); } },
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
  druidesse:   { name: 'Druidesse', type: 'C', cost: 2, power: 2, kw: ['Elfe'], text: 'Révélation : déplacez une autre de vos créatures d\'ici vers une autre zone.',
                 onReveal: (c, st) => { const o = creaturesAt(st, c.owner, c.zone).filter(x => x !== c); const to = bestZone(st, c.owner, c.zone);
                   if (o.length && to !== null) move(st, weakest(st, o), to); } },
  sentier:     { name: 'Sentier caché', type: 'S', cost: 2, power: 0, kw: ['Elfe'], text: 'Vos créatures ici deviennent Déplaçables.',
                 onReveal: (c, st) => { const o = creaturesAt(st, c.owner, c.zone); o.forEach(x => { x.mobile = true; }); if (o.length) log(st, `${o.length} créature(s) deviennent Déplaçables.`); } },
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
                 onReveal: (c, st) => { st.p[c.owner].treasure += 2; log(st, `${who(st, c.owner)} : Trésor +2.`, 'up'); } },
  oeuf:        { name: 'Œuf de dragon', type: 'C', cost: 2, power: 0, kw: ['Dragon'], text: 'Début du tour 6 : gagne autant de puissance que votre Trésor.',
                 onStartTurn: (c, st) => { if (st.turn === 6 && st.p[c.owner].treasure) buff(st, c, st.p[c.owner].treasure); } },
  drake:       { name: 'Drake avide', type: 'C', cost: 3, power: 3, kw: ['Dragon'], text: 'Révélation : +1 par tranche de 2 de votre Trésor.',
                 onReveal: (c, st) => { const n = half(st.p[c.owner].treasure); if (n) buff(st, c, n); } },
  souffle:     { name: 'Souffle de feu', type: 'S', cost: 3, power: 0, kw: ['Dragon'], text: 'Les créatures adverses ici perdent 1.',
                 onReveal: (c, st) => creaturesAt(st, 1 - c.owner, c.zone).forEach(x => buff(st, x, -1)) },
  wyverne:     { name: 'Wyverne', type: 'C', cost: 4, power: 5, kw: ['Dragon'], text: 'Révélation : +3 si vous avez un autre Dragon en jeu.',
                 onReveal: (c, st) => { if (mine(st, c.owner).some(x => x !== c && hasKw(x, 'Dragon'))) buff(st, c, 3); } },
  cavernes:    { name: 'Dragon des cavernes', type: 'C', cost: 4, power: 5, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3) },
  rouge:       { name: 'Dragon rouge', type: 'C', cost: 5, power: 6, kw: ['Dragon'], text: 'Persistant : +1 par tranche de 3 de votre Trésor.',
                 self: (c, st) => Math.floor(st.p[c.owner].treasure / 3) },
  ancien:      { name: 'Dragon ancien', type: 'C', cost: 6, power: 9, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3) },
  dragon_or:   { name: 'Dragon d\'or', type: 'C', cost: 7, power: 12, kw: ['Dragon'], text: 'Coûte 1 de moins par tranche de 3 de votre Trésor.',
                 costFn: (st, p) => -Math.floor(st.p[p].treasure / 3) },

  // NEUTRES
  potion:      { name: 'Potion de force', type: 'S', cost: 1, power: 0, kw: [], text: 'Votre créature la plus forte ici gagne +2.',
                 onReveal: (c, st) => { const s = strongest(st, creaturesAt(st, c.owner, c.zone)); if (s) buff(st, s, 2); } },
  mercenaire:  { name: 'Mercenaire', type: 'C', cost: 2, power: 3, kw: [], text: '' },
  barde:       { name: 'Barde errant', type: 'C', cost: 2, power: 1, kw: [], text: 'Révélation : piochez une carte.',
                 onReveal: (c, st) => draw(st, c.owner, 1) },
  golem:       { name: 'Golem de pierre', type: 'C', cost: 4, power: 6, kw: [], text: '' },
  colosse:     { name: 'Colosse', type: 'C', cost: 6, power: 9, kw: [], text: '' },

  // JETONS
  horde:       { name: 'Horde', type: 'C', cost: 0, power: 0, kw: ['Gobelin'], token: true, text: 'Jeton. Une seule Horde par zone : les effets Horde la font grandir.' },
  chevre:      { name: 'Chèvre', type: 'C', cost: 0, power: -1, kw: [], token: true, text: 'Jeton. Si elle est sacrifiée, +1 sceau au tour suivant.',
                 onDestroyed: (c, st, z, sacrificed) => { if (sacrificed) { st.p[c.owner].bonusSeals++; log(st, `${who(st, c.owner)} : +1 sceau au tour suivant.`, 'up'); } } },
  magot:       { name: 'Magot de dragon', type: 'C', cost: 0, power: 0, kw: [], token: true, text: 'Jeton. Fin de tour : gagne autant de puissance que vos sceaux non dépensés.',
                 onEndTurn: (c, st) => { const n = st.p[c.owner].seals; if (n > 0) buff(st, c, n); else return false; } },
};

// ---- Généraux : rattachés à une famille pour le thème, sans restreindre le deck ----
// kind : texte affiché ; activate + needsZone : effet activable une fois par partie ; activateCost : sceaux dépensés.
export const GENERALS = {
  seraphine: { name: 'Séraphine, Main de l\'Aube', fam: 'Ange', kind: 'Activable', activateCost: 1,
               text: 'Activable, une fois par partie, coûte 1 sceau : si vous avez 0 sceau à la fin du tour, vos créatures qui déclenchent un effet de fin de tour gagnent +1.',
               activate: (p, st) => { st.p[p].angelBoost = st.turn; } },
  aurelia:   { name: 'Aurélia, Gardienne du Serment', fam: 'Ange', kind: 'Fin de partie',
               text: 'Fin de partie : si vous avez dépensé tous vos sceaux à chaque tour, vos zones perdantes gagnent +2.',
               onEndGame: (p, st) => { if (st.p[p].perfectTurns >= TURNS) [0, 1, 2].forEach(z => { if (zonePower(st, p, z) < zonePower(st, 1 - p, z)) addZone(st, p, z, 2); }); } },
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
                 if (h.length === 3) { P.generalUsed = true; log(st, `${GENERALS[P.general].name} se déclenche.`, 'reveal'); h.forEach(x => buff(st, x, 2)); } } },
  snagg:     { name: 'Snagg, Maître de la Horde', fam: 'Gobelin', kind: 'Activable',
               text: 'Activable, une fois par partie : détruit votre Horde la plus faible et répartit sa puissance équitablement entre vos autres Hordes.',
               activate: (p, st) => { const h = hordes(st, p); if (h.length < 2) return; const w = weakest(st, h); const v = Math.max(0, power(st, w));
                 const rest = h.filter(x => x !== w); destroy(st, w, p);
                 rest.forEach((x, i) => { const n = Math.floor(v / rest.length) + (i < v % rest.length ? 1 : 0); if (n) buff(st, x, n); }); } },
  sylvaen:   { name: 'Sylvaën, Voix des Bois', fam: 'Elfe', kind: 'Fin de tour',
               text: 'Fin de tour : si une de vos créatures s\'est déplacée ce tour, une carte de votre main coûte 1 de moins.',
               onEndTurn: (p, st) => { if (!movedThisTurn(st, p).length) return; const h = st.p[p].hand.filter(c => (costOf(st, c) ?? 0) > 0);
                 if (h.length) { const c = pick(h); c.discount = (c.discount || 0) - 1; log(st, `${who(st, p)} : une carte de la main coûte 1 de moins.`, 'up'); } } },
  lirael:    { name: 'Lirael Pas-de-Vent', fam: 'Elfe', kind: 'Activable',
               text: 'Activable, une fois par partie : en fin de tour, chaque créature déplacée ce tour retourne à sa place si possible et déclenche ses effets de Déplacement.',
               activate: (p, st) => { st.p[p].returnMoves = st.turn; } },
  vaelthar:  { name: 'Vael\'Thar, l\'Aîné', fam: 'Dragon', kind: 'Début de partie',
               text: 'Début de partie : crée un Magot de dragon dans une zone au hasard. Magot : en fin de tour, gagne autant de puissance que vos sceaux non dépensés.',
               onStart: (p, st) => summon(st, p, pick([0, 1, 2]), 'magot') },
  ignaroth:  { name: 'Ignaroth le Dévoreur', fam: 'Dragon', kind: 'Fin de tour',
               text: 'Fin de tour : si vous avez dépensé tous vos sceaux, les Dragons de votre main et de votre deck gagnent +1 sceau et -1 puissance ; sinon -1 sceau et +1 puissance (coût minimum 1).',
               onEndTurn: (p, st) => { const P = st.p[p], spent = P.seals === 0, d = [...P.hand, ...P.deck].filter(c => hasKw(c, 'Dragon'));
                 d.forEach(c => { c.costMod = (c.costMod || 0) + (spent ? 1 : -1); c.buff += spent ? -1 : 1; });
                 if (d.length) log(st, `${who(st, p)} : Dragons en main et dans le deck ${spent ? '+1 sceau, -1 puissance' : '-1 sceau, +1 puissance'}.`, spent ? 'down' : 'up'); } },
  cartographe:{ name: 'Le Cartographe', fam: null, kind: 'Début de partie', preview: true,
               text: 'Début de partie : vous voyez tous vos terrains, et où et quand ils seront révélés.' },
  erudit:    { name: 'L\'Érudit', fam: null, kind: 'Début de partie',
               text: 'Début de partie : piochez une carte.',
               onStart: (p, st) => draw(st, p, 1) },
};

// ---- Terrains ----
// Crochets : flat (bonus de zone), aura, onReveal, onStartTurn, onEndTurn, onAllyDestroyed, onCardReveal.
export const TERRAINS = {
  prairie:   { name: 'Prairie céleste', fam: 'Ange', text: 'Vos Anges ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Ange') ? 1 : 0 },
  autel:     { name: 'Autel de la Grâce', fam: 'Ange', text: 'Fin de tour : si vous avez dépensé tous vos sceaux, la créature adverse la plus puissante ici perd 1.',
               onEndTurn: (p, st, z) => { if (st.p[p].seals === 0) { const s = strongest(st, creaturesAt(st, 1 - p, z)); if (s) buff(st, s, -1); } } },
  charnier:  { name: 'Charnier', fam: 'Démon', text: 'Quand une de vos créatures est détruite ici, les Démons de votre main gagnent +1.',
               onAllyDestroyed: (p, st, dead, z, tz) => { if (z !== tz) return; const d = st.p[p].hand.filter(c => hasKw(c, 'Démon'));
                 d.forEach(c => { c.buff++; }); if (d.length) log(st, `${who(st, p)} : Démons en main +1.`, 'up'); } },
  bergerie:  { name: 'Bergerie maudite', fam: 'Démon', text: 'Début de tour : si vous n\'avez aucune créature ici, créez une Chèvre ici. Chèvre (0/-1) : si elle est sacrifiée, +1 sceau au tour suivant.',
               onStartTurn: (p, st, z) => { if (!creaturesAt(st, p, z).length) summon(st, p, z, 'chevre'); } },
  terrier:   { name: 'Terrier', fam: 'Gobelin', text: 'Vos Gobelins ici ont +1.', aura: (p, t) => t.owner === p && hasKw(t, 'Gobelin') ? 1 : 0 },
  razzia:    { name: 'Piste de razzia', fam: 'Gobelin', text: 'Début de tour : votre Horde ici se déplace vers une autre zone que vous perdez, si possible, et gagne +2.',
               onStartTurn: (p, st, z) => { const h = hordeAt(st, p, z); if (!h) return;
                 const to = [0, 1, 2].filter(x => x !== z && margin(st, p, x) < 0 && (free(st, p, x) > 0 || hordeAt(st, p, x))).sort((a, b) => margin(st, p, a) - margin(st, p, b))[0];
                 if (to === undefined) return; const other = hordeAt(st, p, to);
                 if (other) { const v = Math.max(0, power(st, h)) + 2; removeToken(st, h); buff(st, other, v); log(st, `La Horde rejoint celle de la zone ${ZONE_NAMES[to]}.`); }
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
// opts.generals = [général du joueur 0, général du joueur 1] pour remplacer le général par défaut du deck.
export function newGame(deck0, deck1, names = ['Joueur 1', 'Joueur 2'], opts = {}) {
  let uid = 1;
  const gens = opts.generals || [];
  const mk = (p, key) => {
    const d = DECKS[key];
    const pool = shuffle(d.terrains), zones = shuffle([0, 1, 2]);
    return {
      name: names[p], deckKey: key, general: GENERALS[gens[p]] ? gens[p] : d.general, generalUsed: false,
      deck: shuffle(d.cards).map(id => ({ uid: uid++, id, owner: p, zone: -1, buff: 0, revealed: false })),
      hand: [], discard: [], terrainPlan: pool.slice(0, 3).map((t, i) => ({ t, z: zones[i], turn: i + 1 })),
      terrains: [null, null, null], board: [[], [], []], zoneBonus: [0, 0, 0],
      seals: 0, bonusSeals: 0, treasure: 0, lastUnspent: 0, perfectTurns: 0, lost: 0, moves: [],
    };
  };
  const st = { turn: 0, p: [mk(0, deck0), mk(1, deck1)], log: [], nextUid: 1000, order: 0, leader: 0, over: false, sim: false };
  for (const p of [0, 1]) draw(st, p, START_HAND);
  for (const p of [0, 1]) { const g = GENERALS[st.p[p].general]; if (g.onStart) g.onStart(p, st); }
  return st;
}

const creaturesAt = (st, p, z) => st.p[p].board[z].filter(c => c.revealed && isCreature(c));
const mine = (st, p) => [0, 1, 2].flatMap(z => creaturesAt(st, p, z));
const hordeAt = (st, p, z) => creaturesAt(st, p, z).find(c => c.id === 'horde');
const hordes = (st, p) => mine(st, p).filter(c => c.id === 'horde');
const movedThisTurn = (st, p) => mine(st, p).filter(c => c.movedTurn === st.turn);
const margin = (st, p, z) => zonePower(st, p, z) - zonePower(st, 1 - p, z);
export const free = (st, p, z) => SLOTS - st.p[p].board[z].length;
function allRevealed(st) { return [0, 1].flatMap(p => [0, 1, 2].flatMap(z => st.p[p].board[z].filter(c => c.revealed))); }

// Coût actuel d'une carte (null pour un coût X).
export function costOf(st, c) {
  const d = CARDS[c.id]; if (d.x) return null;
  let v = d.cost + (c.costMod || 0) + (d.costFn ? d.costFn(st, c.owner) : 0);
  if (d.cost >= 1) v = Math.max(1, v);
  return Math.max(0, v + (c.discount || 0));
}
export function isMobile(st, c) {
  if (!c.revealed || !isCreature(c) || CARDS[c.id].token) return false;
  if (CARDS[c.id].mobile || c.mobile) return true;
  if (st.p[c.owner].terrains[c.zone] === 'bois') return true;
  return mine(st, c.owner).some(x => x.id === 'reine');
}

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
// Zone d'arrivée choisie par un effet de déplacement : celle où l'on est le plus en retard, avec un emplacement libre.
function bestZone(st, p, from) {
  const zs = [0, 1, 2].filter(z => z !== from && free(st, p, z) > 0);
  if (!zs.length) return null;
  return zs.reduce((a, b) => margin(st, p, b) < margin(st, p, a) ? b : a);
}

// ---- Actions ----
function draw(st, p, n) {
  const P = st.p[p];
  for (let i = 0; i < n; i++) {
    const c = P.deck.shift(); if (!c) { log(st, `${who(st, p)} : deck vide, pas de pioche.`); return; }
    if (P.hand.length >= HAND_MAX) { P.discard.push(c); log(st, `${who(st, p)} : main pleine, ${nm(c.id)} part à la défausse.`); }
    else P.hand.push(c);
  }
}
function buff(st, c, n) { c.buff += n; log(st, `${nm(c.id)} ${n >= 0 ? '+' : ''}${n}.`, n >= 0 ? 'up' : 'down'); }
function addZone(st, p, z, n) { st.p[p].zoneBonus[z] += n; log(st, `${who(st, p)} : zone ${ZONE_NAMES[z]} +${n}.`, 'up'); }
function summon(st, p, z, id) {
  if (free(st, p, z) <= 0) return null;
  const c = { uid: st.nextUid++, id, owner: p, zone: z, buff: 0, revealed: true, order: st.order++ };
  st.p[p].board[z].push(c); log(st, `${who(st, p)} ${vb(p, 'crée', 'créez')} ${nm(id)} (${ZONE_NAMES[z]}).`); return c;
}
// Horde X : crée une Horde de puissance X ici, ou fait grandir celle qui y est déjà.
function horde(st, p, z, x) {
  if (x <= 0) return;
  const h = hordeAt(st, p, z);
  if (h) { buff(st, h, x); return; }
  const n = summon(st, p, z, 'horde'); if (n) { n.buff = x; log(st, `Horde ${x}.`, 'up'); }
}
function removeToken(st, c) { const P = st.p[c.owner]; P.board[c.zone] = P.board[c.zone].filter(x => x !== c); }
// Fait entrer une carte en jeu face visible et résout son effet Révélation.
function enter(st, c, z) {
  const P = st.p[c.owner];
  c.zone = z; c.revealed = true; c.pending = false; c.order = st.order++; P.board[z].push(c);
  log(st, `${who(st, c.owner)} ${vb(c.owner, 'invoque', 'invoquez')} ${nm(c.id)} (${ZONE_NAMES[z]}).`, 'reveal');
  const d = CARDS[c.id]; if (d.onReveal) d.onReveal(c, st);
}
function callFromDeck(st, p, z) {
  const P = st.p[p]; if (free(st, p, z) <= 0) return;
  const i = P.deck.findIndex(c => isCreature(c)); if (i < 0) return;
  const [c] = P.deck.splice(i, 1); enter(st, c, z);
}
// Déplacement : la créature change de zone de son côté, si un emplacement est libre.
function move(st, c, to) {
  const P = st.p[c.owner]; if (to === c.zone || free(st, c.owner, to) <= 0 || !P.board[c.zone].includes(c)) return false;
  if (c.movedTurn !== st.turn) c.turnStartZone = c.zone;
  P.board[c.zone] = P.board[c.zone].filter(x => x !== c); c.zone = to; P.board[to].push(c); c.movedTurn = st.turn;
  log(st, `${nm(c.id)} se déplace vers ${ZONE_NAMES[to]}.`);
  const d = CARDS[c.id]; if (d.onMove) d.onMove(c, st);
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
  log(st, `${d.name} (${who(st, c.owner)}) ${sacrificed ? 'est sacrifiée' : 'est détruite'}.`, 'down');
  if (d.onDestroyed) d.onDestroyed(c, st, z, sacrificed);
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
const stillThere = (st, c) => st.p[c.owner].board[c.zone].includes(c);

// ---- Tour ----
export function startTurn(st) {
  st.turn++;
  log(st, `— Tour ${st.turn} —`, 'turn');
  for (const p of [0, 1]) { const P = st.p[p]; P.seals = st.turn + P.bonusSeals; P.bonusSeals = 0; P.moves = []; draw(st, p, 1); }
  for (const p of [0, 1]) {
    const P = st.p[p]; const plan = P.terrainPlan.find(x => x.turn === st.turn); if (!plan) continue;
    P.terrains[plan.z] = plan.t; log(st, `${who(st, p)} ${vb(p, 'révèle', 'révélez')} le terrain ${TERRAINS[plan.t].name} (${ZONE_NAMES[plan.z]}).`, 'terrain');
    if (TERRAINS[plan.t].onReveal) TERRAINS[plan.t].onReveal(p, st, plan.z);
  }
  st.leader = computeLeader(st);
  for (const c of ordered(st)) { const d = CARDS[c.id]; if (d.onStartTurn && stillThere(st, c)) d.onStartTurn(c, st); }
  for (const p of [st.leader, 1 - st.leader]) st.p[p].terrains.forEach((t, z) => { if (t && TERRAINS[t].onStartTurn) TERRAINS[t].onStartTurn(p, st, z); });
}

export function placeHidden(st, p, uid, z) {
  const P = st.p[p]; const i = P.hand.findIndex(c => c.uid === uid); if (i < 0) return false;
  const c = P.hand[i]; const d = CARDS[c.id];
  const cost = d.x ? P.seals : costOf(st, c);
  if (free(st, p, z) <= 0 || cost > P.seals) return false;
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
    P.generalUsed = true; log(st, `${who(st, s.p)} ${vb(s.p, 'active', 'activez')} ${g.name}${g.needsZone ? ` (${ZONE_NAMES[s.zone]})` : ''}.`, 'reveal'); g.activate(s.p, st, s.zone); return null;
  }
  if (s.kind === 'move') {
    const c = [0, 1, 2].flatMap(z => P.board[z]).find(x => x.uid === s.uid);
    if (!c || !isMobile(st, c) || c.playerMoved === st.turn) return null;
    c.playerMoved = st.turn; move(st, c, s.zone); return c;
  }
  const c = [0, 1, 2].flatMap(z => P.board[z]).find(x => x.uid === s.uid); if (!c) return null;
  c.pending = false; c.revealed = true;
  const d = CARDS[c.id];
  log(st, `${who(st, s.p)} ${vb(s.p, 'révèle', 'révélez')} ${d.name} (${ZONE_NAMES[c.zone]}).`, 'reveal');
  if (d.sacrifice) {
    const others = creaturesAt(st, s.p, c.zone).filter(x => x !== c);
    if (others.length < d.sacrifice) { log(st, `Pas assez de créatures à sacrifier pour ${d.name}.`, 'down'); destroy(st, c, null); return c; }
    for (let i = 0; i < d.sacrifice; i++) { const w = weakest(st, creaturesAt(st, s.p, c.zone).filter(x => x !== c)); if (w) destroy(st, w, s.p); }
  }
  if (d.onReveal) d.onReveal(c, st);
  if (stillThere(st, c)) { const t = P.terrains[c.zone]; if (t && TERRAINS[t].onCardReveal) TERRAINS[t].onCardReveal(s.p, st, c, c.zone); }
  if (d.type === 'S') { P.board[c.zone] = P.board[c.zone].filter(x => x !== c); P.discard.push(c); }
  return c;
}
export function endTurn(st) {
  const fired = new Set();
  for (const c of ordered(st)) {
    const d = CARDS[c.id]; if (!stillThere(st, c)) continue;
    if (d.onEndTurn && d.onEndTurn(c, st) !== false) fired.add(c);
    if (d.grace && st.p[c.owner].seals === 0 && stillThere(st, c)) { d.grace(c, st); fired.add(c); }
  }
  for (const p of [st.leader, 1 - st.leader]) {
    const P = st.p[p];
    P.terrains.forEach((t, z) => { if (t && TERRAINS[t].onEndTurn) TERRAINS[t].onEndTurn(p, st, z); });
    if (P.angelBoost === st.turn && P.seals === 0) [...fired].filter(c => c.owner === p && stillThere(st, c)).forEach(c => buff(st, c, 1));
    if (P.returnMoves === st.turn) movedThisTurn(st, p).forEach(c => { if (c.turnStartZone !== undefined && c.turnStartZone !== c.zone) move(st, c, c.turnStartZone); });
    const g = GENERALS[P.general]; if (g.onEndTurn) g.onEndTurn(p, st);
  }
  for (const p of [0, 1]) {
    const P = st.p[p];
    P.treasure += P.seals; P.lastUnspent = P.seals;
    if (P.seals === 0) P.perfectTurns++;
  }
  if (st.turn >= TURNS) finish(st);
}
function finish(st) {
  for (const p of [st.leader, 1 - st.leader]) { const g = GENERALS[st.p[p].general]; if (g.onEndGame) g.onEndGame(p, st); }
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
const deckHas = (P, fam) => [...P.hand, ...P.deck].some(c => hasKw(c, fam));
function evalFor(st, p) {
  let s = 0;
  for (const z of [0, 1, 2]) { const d = zonePower(st, p, z) - zonePower(st, 1 - p, z); s += Math.tanh(d / 4) * 10; }
  const P = st.p[p];
  if (st.turn < TURNS) {
    // Valeur future des sceaux gardés (Trésor) ou dépensés au sceau près (Grâce).
    if (deckHas(P, 'Dragon') || P.general === 'vaelthar') s += P.treasure * 0.6 * (TURNS - st.turn) / TURNS;
    if (P.general === 'aurelia' || deckHas(P, 'Ange')) s += P.perfectTurns * 0.8;
  }
  return s;
}
export function aiPlan(st, p, tries) {
  tries = tries || 250;
  const P = st.p[p]; let best = { cards: [], moves: [], general: null }, bestV = -Infinity;
  const g = GENERALS[P.general];
  const mobiles = mine(st, p).filter(c => isMobile(st, c));
  for (let i = 0; i < tries; i++) {
    const plan = { cards: [], moves: [], general: null }; let seals = P.seals; const used = [0, 0, 0].map((_, z) => P.board[z].length);
    if (g.activate && !P.generalUsed && seals >= (g.activateCost || 0) && Math.random() < (st.turn >= 5 ? 0.5 : 0.15)) {
      plan.general = g.needsZone ? Math.floor(Math.random() * 3) : 0; seals -= g.activateCost || 0;
    }
    for (const c of mobiles) if (Math.random() < 0.3) {
      const zs = [0, 1, 2].filter(z => z !== c.zone && used[z] < SLOTS); if (!zs.length) continue;
      const z = pick(zs); used[z]++; plan.moves.push({ uid: c.uid, zone: z });
    }
    for (const c of shuffle(P.hand)) {
      const d = CARDS[c.id], cost = d.x ? seals : costOf(st, c);
      if (cost > seals || Math.random() < 0.15 || (d.x && seals === 0)) continue;
      const zs = [0, 1, 2].filter(z => used[z] < SLOTS); if (!zs.length) break;
      const z = pick(zs); used[z]++; seals -= cost; plan.cards.push({ uid: c.uid, zone: z });
    }
    // Un coût X se pose en dernier pour prendre tous les sceaux restants.
    plan.cards.sort((a, b) => (CARDS[P.hand.find(c => c.uid === a.uid).id].x ? 1 : 0) - (CARDS[P.hand.find(c => c.uid === b.uid).id].x ? 1 : 0));
    const sim = clone(st);
    const gen = [null, null]; gen[p] = applyPlan(sim, p, plan);
    for (const s of revealSteps(sim, gen).filter(s => s.p === p)) doStep(sim, s);
    endTurn(sim);
    const v = evalFor(sim, p) + Math.random() * 0.01;
    if (v > bestV) { bestV = v; best = plan; }
  }
  return best;
}

// ---- Tour complet (serveur et partie contre l'IA) ----
// Applique un plan : coût du général, déplacements prévus, cartes posées face cachée.
// Renvoie la zone d'activation du général (0 pour un général sans zone), ou null.
export function applyPlan(st, p, plan) {
  const P = st.p[p]; const g = GENERALS[P.general];
  let gz = null;
  const z = plan && plan.general;
  if (g.activate && !P.generalUsed && [0, 1, 2].includes(z) && P.seals >= (g.activateCost || 0)) { gz = z; P.seals -= g.activateCost || 0; }
  P.moves = [];
  const seen = new Set();
  for (const m of (plan && Array.isArray(plan.moves) ? plan.moves : []).slice(0, 12)) {
    const c = mine(st, p).find(x => x.uid === m.uid);
    if (!c || seen.has(c.uid) || !isMobile(st, c) || c.playerMoved === st.turn || ![0, 1, 2].includes(m.zone) || m.zone === c.zone) continue;
    seen.add(c.uid); P.moves.push({ uid: c.uid, zone: m.zone });
  }
  for (const x of (plan && Array.isArray(plan.cards) ? plan.cards : []).slice(0, 12)) placeHidden(st, p, x.uid, x.zone);
  return gz;
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
    const g = GENERALS[P.general];
    return {
      name: P.name, deckKey: P.deckKey, general: P.general, generalUsed: P.generalUsed,
      hand: isMe ? P.hand.map(c => ({ uid: c.uid, id: c.id, cost: costOf(st, c), power: CARDS[c.id].power + c.buff })) : undefined,
      handCount: P.hand.length, deckCount: P.deck.length, seals: P.seals,
      treasure: P.treasure, perfectTurns: P.perfectTurns,
      terrains: P.terrains.slice(), zoneBonus: P.zoneBonus.slice(),
      terrainPlan: isMe && g.preview ? P.terrainPlan.filter(x => x.turn > st.turn) : undefined,
      board: P.board.map(z => z.slice().sort((a, b) => a.order - b.order).map(c =>
        c.revealed ? { uid: c.uid, id: c.id, revealed: true, power: power(st, c), mobile: isMe && isMobile(st, c) && c.playerMoved !== st.turn }
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
