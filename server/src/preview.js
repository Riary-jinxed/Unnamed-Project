// Zone de test : un compte testeur (réglé dans /admin) a un jour d'aperçu, a.preview = « AAAA-MM-JJ ». Pour ses requêtes et ses
// messages WebSocket, today() du moteur rend ce jour-là : il voit et joue les sets, decks, événements, saisons, quêtes et
// annonces de ce jour avant leur sortie, sur le jeu en ligne, sans rien changer pour les autres joueurs.
// Le jour suit la requête à travers ses await (AsyncLocalStorage). Ce qui est partagé reste au vrai jour : classé, Boss mondial,
// clans (dates passées explicitement au moteur) et compteurs de l'onglet Stats (realToday).
import { AsyncLocalStorage } from 'node:async_hooks';
import { setPreviewDay } from '@jeu/engine/collection';

const als = new AsyncLocalStorage();
setPreviewDay(() => als.getStore()?.day || null);

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Jour d'aperçu d'un compte, null s'il n'en a pas.
export const previewOf = a => (a && typeof a.preview === 'string' && DAY_RE.test(a.preview) ? a.preview : null);
// Exécute f (et ce qu'elle attend) au jour d'aperçu du compte a, ou au vrai jour sans compte testeur.
export const atPreview = (a, f) => als.run({ day: previewOf(a) }, f);
// Requête HTTP : le compte n'est connu qu'après lecture du jeton ; usePreview(a) fixe le jour pour le reste de la requête.
export const inRequest = f => als.run({ day: null }, f);
export const usePreview = a => { const s = als.getStore(); if (s) s.day = previewOf(a); };
