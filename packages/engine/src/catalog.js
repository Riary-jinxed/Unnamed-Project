// Catalogue modifiable depuis /admin : retouches des cartes existantes, nouvelles cartes et sets.
// Le serveur garde un brouillon et une version publiée ; la version publiée est appliquée au moteur (serveur et appli).
// Les effets restent du code : une nouvelle carte reprend l'effet d'une carte existante, ou n'en a pas.
import { CARDS, GENERALS, FAMILIES } from './engine.js';
import { COLLECTIBLE, OWNABLE, GENERAL_IDS, BOOSTER_POOL, SETS, DEFAULT_SETS, setOf } from './collection.js';

// Cartes telles qu'écrites dans engine.js, avant toute retouche.
export const BASE_CARDS = Object.fromEntries(Object.entries(CARDS).map(([id, d]) => [id, { ...d }]));
// Champs modifiables d'une carte, et leurs bornes.
export const CARD_FIELDS = ['name', 'type', 'cost', 'power', 'fam', 'text', 'mobile', 'x', 'sacrifice'];
const LIMITS = { cost: [0, 20], power: [-10, 30], sacrifice: [0, 3] };
const LABELS = { cost: 'coût', power: 'puissance', sacrifice: 'créatures à sacrifier', mobile: 'déplaçable', x: 'coût X' };
const ID_RE = /^[a-z0-9_]{2,30}$/;
// Cartes et généraux qu'un catalogue enregistré avant leur arrivée ne connaît pas encore : ils rejoignent leur set d'origine.
// Un catalogue récent liste dans « known » tout ce qu'il connaissait ; un ancien ne connaissait que les cartes du Set de base.
const BASE_KNOWN = Object.keys(BASE_CARDS).filter(id => !BASE_CARDS[id].token && setOf(id) === 'base');
// Cartes dont l'effet peut être repris par une nouvelle carte.
export const EFFECT_SOURCES = Object.keys(BASE_CARDS).filter(id => !BASE_CARDS[id].token && Object.values(BASE_CARDS[id]).some(v => typeof v === 'function'));

export const emptyCatalog = () => ({ version: 0, cards: {}, sets: structuredClone(DEFAULT_SETS) });

// Champs modifiables d'une carte du moteur, sous la forme éditée dans /admin.
export const editable = d => ({ name: d.name, type: d.type, cost: d.cost, power: d.power, fam: d.kw.find(k => FAMILIES.includes(k)) || '',
  text: d.text || '', mobile: !!d.mobile, x: !!d.x, sacrifice: d.sacrifice || 0 });

// Fiche complète d'une carte selon le catalogue (sans l'appliquer).
export function cardFrom(id, entry) {
  const base = BASE_CARDS[id] || (entry?.effect && BASE_CARDS[entry.effect]
    ? Object.fromEntries(Object.entries(BASE_CARDS[entry.effect]).filter(([, v]) => typeof v === 'function')) : {});
  const d = { ...base };
  if (!entry) return d;
  for (const k of CARD_FIELDS) if (entry[k] !== undefined && k !== 'fam') d[k] = entry[k];
  if (entry.fam !== undefined) d.kw = entry.fam ? [entry.fam] : [];
  if (!d.kw) d.kw = [];
  if (!d.mobile) delete d.mobile; if (!d.x) delete d.x; if (!d.sacrifice) delete d.sacrifice;
  if (!BASE_CARDS[id]) { d.custom = true; d.effect = entry.effect || ''; }
  return d;
}

// Renvoie un message d'erreur, ou null si le catalogue est valable.
export function catalogError(cat) {
  if (!cat || typeof cat.cards !== 'object' || !Array.isArray(cat.sets)) return 'Catalogue invalide.';
  for (const [id, e] of Object.entries(cat.cards)) {
    const base = BASE_CARDS[id];
    if (base && base.token) return `${base.name} est un jeton : il ne se modifie pas ici.`;
    if (!base) {
      if (!ID_RE.test(id)) return `Identifiant « ${id} » : 2 à 30 caractères parmi a-z, 0-9 et _.`;
      if (e.effect && !EFFECT_SOURCES.includes(e.effect)) return `Effet inconnu pour ${id}.`;
      for (const k of ['name', 'type', 'cost', 'power']) if (e[k] === undefined) return `Il manque « ${k} » à la carte ${id}.`;
    }
    const label = e.name || base?.name || id;
    if (e.name !== undefined && (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40)) return `${label} : un nom de 1 à 40 caractères.`;
    if (e.text !== undefined && (typeof e.text !== 'string' || e.text.length > 400)) return `${label} : texte de 400 caractères au plus.`;
    if (e.type !== undefined && !['C', 'S'].includes(e.type)) return `${label} : type C (créature) ou S (sort).`;
    if (e.fam !== undefined && e.fam !== '' && !FAMILIES.includes(e.fam)) return `${label} : famille inconnue.`;
    for (const [k, [min, max]] of Object.entries(LIMITS)) if (e[k] !== undefined && (!Number.isInteger(e[k]) || e[k] < min || e[k] > max)) return `${label} : ${LABELS[k]} entre ${min} et ${max}.`;
    for (const k of ['mobile', 'x']) if (e[k] !== undefined && typeof e[k] !== 'boolean') return `${label} : ${LABELS[k]} oui ou non.`;
  }
  const ids = new Set(cat.sets.map(s => s.id));
  if (ids.size !== cat.sets.length) return 'Deux sets ont le même identifiant.';
  for (const s of cat.sets) {
    if (!ID_RE.test(String(s.id))) return `Identifiant de set « ${s.id} » : 2 à 30 caractères parmi a-z, 0-9 et _.`;
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40) return 'Chaque set a un nom de 1 à 40 caractères.';
    if (typeof s.teaser !== 'string' || s.teaser.length > 300) return `${s.name} : présentation de 300 caractères au plus.`;
    if (!Array.isArray(s.cards) || s.cards.some(id => !(BASE_CARDS[id] && !BASE_CARDS[id].token) && !GENERALS[id] && !cat.cards[id])) return `${s.name} contient une carte inconnue.`;
  }
  if (!cat.sets.some(s => s.daily && s.cards.length)) return 'Au moins un set non vide doit alimenter le booster quotidien.';
  return null;
}

// Tout ce que le catalogue connaît : à enregistrer dans « known » à chaque sauvegarde du brouillon.
export const knownIds = cat => [...new Set([...OWNABLE, ...Object.keys(cat.cards || {})])];

// Applique un catalogue au moteur : CARDS, cartes à collectionner, sets et booster quotidien sont mis à jour sur place.
export function applyCatalog(cat) {
  if (!cat || catalogError(cat)) cat = emptyCatalog();
  for (const id of Object.keys(CARDS)) if (!BASE_CARDS[id]) delete CARDS[id];
  for (const [id, d] of Object.entries(BASE_CARDS)) CARDS[id] = { ...d };
  for (const [id, e] of Object.entries(cat.cards)) CARDS[id] = cardFrom(id, e);
  COLLECTIBLE.splice(0, Infinity, ...Object.keys(CARDS).filter(k => !CARDS[k].token));
  OWNABLE.splice(0, Infinity, ...COLLECTIBLE, ...GENERAL_IDS);
  const sets = withNewcomers(cat);
  SETS.splice(0, Infinity, ...sets.map(s => ({ ...s, cards: s.cards.filter(id => OWNABLE.includes(id)) })));
  BOOSTER_POOL.splice(0, Infinity, ...new Set(SETS.filter(s => s.daily).flatMap(s => s.cards)));
  return cat.version || 0;
}
// Sets du catalogue, avec les cartes et généraux qu'il ne connaissait pas encore ajoutés à leur set d'origine (s'il existe).
export function withNewcomers(cat) {
  const sets = cat.sets.map(s => ({ ...s, cards: s.cards.slice() }));
  const known = new Set(cat.known || [...BASE_KNOWN, ...Object.keys(cat.cards || {})]);
  for (const id of OWNABLE) {
    if (known.has(id) || sets.some(s => s.cards.includes(id))) continue;
    sets.find(s => s.id === setOf(id))?.cards.push(id);
  }
  return sets;
}
