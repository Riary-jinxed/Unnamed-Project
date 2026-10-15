// Clé courte de l'image de profil d'un compte : l'appli la compare pour savoir si l'image a changé, sans la retélécharger.
// Les images font jusqu'à 60 Ko : l'empreinte est gardée par compte et recalculée seulement quand l'image change.
import { createHash } from 'node:crypto';

const keys = new WeakMap();
export function avatarKey(a) {
  if (!a.avatar) return null;
  const k = keys.get(a);
  if (k && k.src === a.avatar) return k.key;
  const key = createHash('sha1').update(a.avatar).digest('hex').slice(0, 12);
  keys.set(a, { src: a.avatar, key });
  return key;
}
