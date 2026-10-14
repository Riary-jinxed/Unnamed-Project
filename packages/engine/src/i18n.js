// Traductions : le texte français écrit dans le code sert de clé, chaque langue a un dictionnaire « français → traduction ».
// Un texte absent du dictionnaire s'affiche en français : un nouveau texte marche tout de suite, il reste à le traduire.
//   t('Booster du jour')                      → « Daily booster » en anglais
//   t('Il vous faut {n} Éclats.', { n: 12 })  → les {nom} sont remplacés après traduction
//   tp(n, '{n} carte', '{n} cartes')          → singulier ou pluriel selon la langue (français : 0 et 1 au singulier)
// L'appli choisit sa langue au démarrage (client/src/lang.js) ; le serveur traduit pour chaque requête avec tr(langue, …).
// `npm run i18n` liste les textes encore sans traduction.
export const LANGS = [['fr', 'Français'], ['en', 'English']];
export const LANG_IDS = LANGS.map(([id]) => id);
const LOCALES = { fr: 'fr-FR', en: 'en-US' };
const dicts = { fr: {}, en: {} };
let current = 'fr';

// Ajoute des traductions (un objet « texte français → traduction ») à une langue.
export function addStrings(lang, dict) { Object.assign(dicts[lang] ||= {}, dict); }
export const isLang = l => LANG_IDS.includes(l);
export function setLang(l) { current = isLang(l) ? l : 'fr'; return current; }
export const getLang = () => current;
// Code de langue pour toLocaleString et Intl (« fr-FR », « en-US »).
export const locale = (l = current) => LOCALES[l] || LOCALES.fr;
// Langue d'un en-tête Accept-Language ou X-Lang (« en-US,en;q=0.9 » → « en ») ; français par défaut.
export function pickLang(header) {
  for (const part of String(header || '').toLowerCase().split(',')) { const l = part.trim().slice(0, 2); if (isLang(l)) return l; }
  return 'fr';
}

// Remplace les {nom} par vars.nom ; un {nom} sans valeur reste tel quel.
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? vars[k] : m));
// Traduction dans une langue donnée (serveur : celle du joueur qui demande).
export function tr(lang, s, vars) {
  if (typeof s !== 'string') return s;
  const r = (lang !== 'fr' && dicts[lang]?.[s]) || s;
  return vars ? fill(r, vars) : r;
}
// Traduction dans la langue de l'appli.
export const t = (s, vars) => tr(current, s, vars);
// Vrai si n se dit au singulier dans cette langue.
export const singular = (n, lang = current) => (lang === 'fr' ? Math.abs(n) < 2 : Math.abs(n) === 1);
// Singulier ou pluriel : {n} vaut le nombre.
export const trp = (lang, n, one, many, vars) => tr(lang, singular(n, lang) ? one : many, { n, ...vars });
export const tp = (n, one, many, vars) => trp(current, n, one, many, vars);
// Texte composé ailleurs (serveur, journal de partie) : une chaîne, ou [modèle, variables] dont les variables
// peuvent elles-mêmes être des [modèle, variables]. Tout est traduit au moment de l'afficher.
export function trMsg(lang, m) {
  if (!Array.isArray(m)) return tr(lang, m);
  const [s, vars] = m;
  if (!vars) return tr(lang, s);
  const v = {};
  for (const [k, x] of Object.entries(vars)) v[k] = Array.isArray(x) ? trMsg(lang, x) : x;
  return tr(lang, s, v);
}
export const tMsg = m => trMsg(current, m);
// Texte envoyé par le serveur : o.champMsg (un msg()) s'il existe, sinon o.champ (texte français) traduit tel quel.
export const tField = (o, k) => (o?.[`${k}Msg`] ? tMsg(o[`${k}Msg`]) : t(o?.[k]));
// Message à traduire plus tard (rangé, envoyé à l'appli…) : msg('Il reste {n} tours.', { n }) → ['Il reste {n} tours.', { n }].
// Sans variables, le texte seul. Repéré par npm run i18n comme t().
export const msg = (s, vars) => (vars ? [s, vars] : s);
// Dictionnaire d'une langue (vérifications de npm run i18n).
export const strings = lang => dicts[lang] || {};
