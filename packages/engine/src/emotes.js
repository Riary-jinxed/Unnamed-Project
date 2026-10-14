// Émotes en partie : une icône et une phrase courte, envoyées à l'adversaire pendant une partie.
// Partagé par le serveur (qui vérifie qu'une émote est possédée et limite leur nombre) et l'appli (sélecteur, boutique, profil).
// Les émotes « free » sont offertes à tous ; les autres s'achètent en boutique (price en Éclats, prisms en Prismes)
// ou se gagnent avec un succès (champ emote des succès, rewards.js). Une émote déjà possédée n'est jamais retirée.
// Ne dépend de rien : rewards.js y fait référence par identifiant.

export const EMOTES = {
  // Offertes à tous : elles forment le sélecteur de départ.
  salut: { icon: '👋', text: 'Salut !', free: true },
  bienjoue: { icon: '👏', text: 'Bien joué !', free: true },
  merci: { icon: '🙏', text: 'Merci !', free: true },
  oups: { icon: '😅', text: 'Oups…', free: true },
  hmm: { icon: '🤔', text: 'Hmm…', free: true },
  gg: { icon: '🤝', text: 'Bonne partie !', free: true },
  // Boutique, rayon Émotes.
  chance: { icon: '🍀', text: 'Bonne chance !', price: 250 },
  waouh: { icon: '😮', text: 'Waouh !', price: 250 },
  haha: { icon: '😂', text: 'Ha ha !', price: 250 },
  grr: { icon: '😤', text: 'Grrr…', price: 300 },
  revanche: { icon: '🔁', text: 'Revanche ?', price: 300 },
  prevu: { icon: '😏', text: 'Tout se passe comme prévu.', price: 400 },
  trone: { icon: '👑', text: 'Le trône est à moi.', prisms: 15 },
  tremblez: { icon: '🐉', text: 'Tremblez, mortels !', prisms: 20 },
  // Succès (rewards.js, champ emote).
  feu: { icon: '🔥', text: 'Personne ne m\'arrête !' },
  garde: { icon: '⚔️', text: 'En garde !' },
  tournee: { icon: '🍺', text: 'Une tournée pour la table !' },
  attendais: { icon: '😈', text: 'Je t\'attendais.' },
  patience: { icon: '🦉', text: 'Patience et longueur de temps…' },
  admire: { icon: '🏆', text: 'Admire et apprends.' },
};
export const EMOTE_IDS = Object.keys(EMOTES);
export const FREE_EMOTES = EMOTE_IDS.filter(id => EMOTES[id].free);
// Émotes du sélecteur en partie : EMOTE_SLOTS au plus, choisies dans le profil ; sans choix, les émotes offertes.
export const EMOTE_SLOTS = 8;
// En partie : une émote toutes les EMOTE_COOLDOWN_MS au plus, EMOTE_MAX par partie ; une bulle reste EMOTE_SHOW_MS à l'écran.
export const EMOTE_COOLDOWN_MS = 2500, EMOTE_MAX = 30, EMOTE_SHOW_MS = 3200;
export const SHOP_EMOTES = EMOTE_IDS.filter(id => EMOTES[id].price || EMOTES[id].prisms);

// owned : émotes gagnées ou achetées du compte (cosmetics.emotes) ; les émotes offertes sont toujours possédées.
export const ownsEmote = (owned, id) => !!EMOTES[id] && (EMOTES[id].free || (owned || []).includes(id));
export const ownedEmotes = owned => EMOTE_IDS.filter(id => ownsEmote(owned, id));
// Sélecteur du compte : son choix (émotes encore possédées), ou les émotes offertes.
export function emoteSet(owned, set) {
  const mine = (Array.isArray(set) ? set : []).filter((id, i, l) => ownsEmote(owned, id) && l.indexOf(id) === i).slice(0, EMOTE_SLOTS);
  return mine.length ? mine : FREE_EMOTES.slice(0, EMOTE_SLOTS);
}

// Réponse de l'IA à une émote du joueur (parties contre l'IA, en ligne ou dans l'appli) : de temps en temps, et seulement
// aux politesses. Renvoie une émote ou null.
const AI_REPLIES = { salut: 'salut', gg: 'gg', bienjoue: 'merci', waouh: 'merci', chance: 'merci', merci: 'gg', revanche: 'gg', prevu: 'hmm', haha: 'oups' };
export const aiReply = (id, rnd = Math.random) => (AI_REPLIES[id] && rnd() < 0.7 ? AI_REPLIES[id] : null);
