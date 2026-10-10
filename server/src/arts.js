// Arts alternatifs : offres du jour propres à chaque joueur, éditions Limited numérotées, coffre, choix de l'art de chaque carte,
// dons depuis /admin (Promo). Payés en Éclats, comme le reste de la boutique.
// Compte : arts = { idArt: { at, n } } (n : numéro d'exemplaire d'une Limited), artSel = { idCarte: idArt }, artShop = offres du jour.
// Document « arts » : sold = { idArt: exemplaires vendus } pour le stock des Limited.
import { ARTS, artExists, isClassic, limitedOpen, artPrice, artOffers, chestPool, chestRates, weightedPick, rarityName } from '@jeu/engine/arts';
import { today } from '@jeu/engine/collection';
import { HttpError } from './accounts.js';

export function createArts(store, cfg) {
  const sold = id => store.doc('arts')?.sold?.[id] || 0;
  const left = art => Math.max(0, (art.stock || 0) - sold(art.id));
  const owns = (a, id) => !!a.arts?.[id];
  function give(a, id, extra = {}) { a.arts = { ...(a.arts || {}), [id]: { at: new Date().toISOString(), ...extra } }; }

  // Offres du jour : renouvelées à minuit, ou quand l'administrateur renouvelle les offres (rotation).
  function day(a) {
    const c = cfg(), d = a.artShop;
    if (d && d.date === today() && (d.rotation || 0) === c.rotation && d.offers.every(artExists)) return d;
    return (a.artShop = { date: today(), rotation: c.rotation, offers: artOffers(a.arts, a.cards, c.artOffers), bought: [] });
  }
  function view(a) {
    const c = cfg(), d = day(a), now = today();
    const item = art => ({ id: art.id, price: artPrice(art, c), owned: owns(a, art.id) });
    return {
      offers: d.offers.map(id => item(ARTS[id])),
      limited: Object.values(ARTS).filter(art => artExists(art.id) && limitedOpen(art, now))
        .map(art => ({ ...item(art), stock: art.stock, left: left(art), until: art.until || null, n: a.arts?.[art.id]?.n || null })),
      chest: { price: c.chestPrice, rates: chestRates(a.arts), left: chestPool(a.arts).length },
    };
  }

  // Achat d'un art : une offre du jour, ou une Limited en vente avec du stock. pay(a, prix) refuse s'il manque des Éclats.
  // Rien n'attend entre la vérification du stock et la vente : deux joueurs ne peuvent pas prendre le dernier exemplaire.
  function buy(a, { art: id }, pay) {
    const art = ARTS[id];
    if (!art || !artExists(id)) throw new HttpError(400, 'Art inconnu.');
    if (owns(a, id)) throw new HttpError(409, 'Vous avez déjà cet art.');
    if (art.edition === 'limited') {
      if (!limitedOpen(art, today())) throw new HttpError(409, 'Cette édition Limited n\'est plus en vente.');
      if (!left(art)) throw new HttpError(409, 'Tous les exemplaires de cette édition Limited sont partis.');
      pay(a, artPrice(art, cfg()));
      const doc = store.doc('arts') || {}, n = sold(id) + 1;
      store.putDoc('arts', { ...doc, sold: { ...(doc.sold || {}), [id]: n } }).catch(e => console.error('Stock Limited non enregistré :', e));
      give(a, id, { n });
      return art;
    }
    if (art.edition === 'promo') throw new HttpError(409, 'Cet art ne se vend pas : il s\'obtient en récompense.');
    const d = day(a);
    if (!isClassic(art) || !d.offers.includes(id)) throw new HttpError(400, 'Cet art n\'est plus en vente aujourd\'hui.');
    pay(a, artPrice(art, cfg()));
    d.bought.push(id); give(a, id);
    return art;
  }
  // Coffre : un art classique que le joueur n'a pas encore, au hasard selon sa rareté.
  function chest(a, pay) {
    const pool = chestPool(a.arts);
    if (!pool.length) throw new HttpError(409, 'Vous avez déjà tous les arts que contient le coffre.');
    pay(a, cfg().chestPrice);
    const art = weightedPick(pool);
    give(a, art.id);
    return art;
  }
  // Art affiché pour une carte : un art possédé de cette carte, ou null pour l'illustration d'origine.
  function select(a, { card, art: id }) {
    if (id === null || id === undefined || id === '') { if (a.artSel) delete a.artSel[card]; return; }
    const art = ARTS[id];
    if (!art || !artExists(id) || art.card !== card) throw new HttpError(400, 'Cet art ne va pas avec cette carte.');
    if (!owns(a, id)) throw new HttpError(409, 'Vous n\'avez pas cet art.');
    a.artSel = { ...(a.artSel || {}), [card]: id };
  }

  // ---- Administration ----
  // Catalogue avec ventes et propriétaires, pour l'onglet Boutique.
  function adminList() {
    const all = store.all();
    return Object.values(ARTS).map(art => ({ ...art, exists: artExists(art.id), rarityName: rarityName(art), price: art.edition === 'promo' ? null : artPrice(art, cfg()),
      sold: art.edition === 'limited' ? sold(art.id) : null, owners: all.filter(x => owns(x, art.id)).length }));
  }
  // Donner (Promo, geste commercial) ou retirer un art. Une Limited donnée ne compte pas dans le stock vendu et n'a pas de numéro.
  function adminGive(a, { art: id, give: on }) {
    if (!ARTS[id]) throw new HttpError(400, 'Art inconnu.');
    if (on) { if (!owns(a, id)) give(a, id, { gift: true }); return; }
    if (a.arts) delete a.arts[id];
    for (const [card, sel] of Object.entries(a.artSel || {})) if (sel === id) delete a.artSel[card];
  }

  return { view, buy, chest, select, adminList, adminGive };
}
