// Catalogue de cartes et de sets modifiable depuis /admin : un brouillon, puis une publication qui l'applique au jeu.
// La version publiée est servie à l'appli (GET /api/catalog), qui l'applique aussi pour l'affichage et la partie contre l'IA.
import { catalogError, applyCatalog, emptyCatalog, BASE_CARDS, withNewcomers, knownIds } from '@jeu/engine/catalog';
import { HttpError } from './accounts.js';

export function createCatalog(store, accounts) {
  // Les cartes et généraux arrivés depuis l'enregistrement d'un catalogue rejoignent leur set d'origine.
  const upgrade = cat => ({ ...cat, sets: withNewcomers(cat), known: knownIds(cat) });
  let published = store.doc('catalogue') || emptyCatalog();
  if (catalogError(published)) { console.error('Catalogue publié invalide, cartes d\'origine utilisées :', catalogError(published)); published = emptyCatalog(); }
  published = upgrade(published);
  accounts.setCatalogVersion(applyCatalog(published));
  const draft = () => { const d = store.doc('brouillon'); return d ? upgrade(d) : published; };

  // Une carte créée puis publiée ne peut plus disparaître tant qu'un joueur la possède.
  function lostOwned(next) {
    const gone = Object.keys(published.cards).filter(id => !BASE_CARDS[id] && !next.cards[id]);
    return gone.filter(id => accounts.ownersOf(id).length);
  }
  async function saveDraft({ draft: d }) {
    const err = catalogError(d); if (err) throw new HttpError(400, err);
    const clean = { version: published.version, known: knownIds(d), cards: d.cards, sets: d.sets.map(s => ({ id: s.id, name: s.name.trim(), open: !!s.open, daily: !!s.daily, teaser: s.teaser || '', cards: [...new Set(s.cards)] })) };
    await store.putDoc('brouillon', clean);
    return view();
  }
  async function publish() {
    const d = draft();
    const err = catalogError(d); if (err) throw new HttpError(400, err);
    const lost = lostOwned(d);
    if (lost.length) throw new HttpError(409, `Des joueurs possèdent ces cartes, elles ne peuvent pas être supprimées : ${lost.join(', ')}.`);
    published = { ...d, version: (published.version || 0) + 1, publishedAt: new Date().toISOString() };
    await store.putDoc('catalogue', published);
    await store.putDoc('brouillon', published);
    accounts.setCatalogVersion(applyCatalog(published));
    console.log(`Catalogue de cartes publié (version ${published.version}).`);
    return view();
  }
  async function discard() { await store.putDoc('brouillon', published); return view(); }
  const view = () => ({ draft: draft(), published });

  return {
    routes: {
      'GET /api/catalog': () => ({ catalog: published }),
      'GET /api/admin/catalog': () => view(),
      'PUT /api/admin/catalog': (_, body) => saveDraft(body),
      'POST /api/admin/catalog/publish': () => publish(),
      'POST /api/admin/catalog/discard': () => discard(),
    },
    public: ['GET /api/catalog'],
  };
}
