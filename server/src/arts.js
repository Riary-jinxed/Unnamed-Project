// Arts alternatifs : offres du jour propres à chaque joueur, coffre, choix de l'art de chaque carte, dons depuis /admin (Promo).
// Payés en Prismes, la monnaie rare des arts (pay est fourni par accounts.js).
// Compte : arts = { idArt: { at, gift? } }, artSel = { idCarte: idArt }, artShop = offres du jour.
import { ARTS, artExists, isClassic, artPrice, artOffers, chestPool, chestRates, weightedPick, rarityName } from '@jeu/engine/arts';
import { today } from '@jeu/engine/collection';
import { HttpError } from './accounts.js';

export function createArts(store, cfg) {
  const owns = (a, id) => !!a.arts?.[id];
  function give(a, id, extra = {}) { a.arts = { ...(a.arts || {}), [id]: { at: new Date().toISOString(), ...extra } }; }

  // Offres du jour : renouvelées à minuit, ou quand l'administrateur renouvelle les offres (rotation).
  function day(a) {
    const c = cfg(), d = a.artShop;
    if (d && d.date === today() && (d.rotation || 0) === c.rotation && d.offers.every(artExists)) return d;
    return (a.artShop = { date: today(), rotation: c.rotation, offers: artOffers(a.arts, a.cards, c.artOffers), bought: [] });
  }
  function view(a) {
    const c = cfg();
    return {
      prisms: a.prisms || 0,
      offers: day(a).offers.map(id => ({ id, price: artPrice(ARTS[id], c), owned: owns(a, id) })),
      chest: { price: c.chestPrice, rates: chestRates(a.arts), left: chestPool(a.arts).length },
    };
  }

  // Achat d'un art du jour. pay(a, prix) refuse s'il manque des Prismes.
  function buy(a, { art: id }, pay) {
    const art = ARTS[id];
    if (!art || !artExists(id)) throw new HttpError(400, 'Art inconnu.');
    if (owns(a, id)) throw new HttpError(409, 'Vous avez déjà cet art.');
    if (art.edition === 'promo') throw new HttpError(409, 'Cet art ne se vend pas : il s\'obtient en récompense.');
    const d = day(a);
    if (!isClassic(art) || !d.offers.includes(id)) throw new HttpError(400, 'Cet art n\'est plus en vente aujourd\'hui.');
    pay(a, artPrice(art, cfg()));
    d.bought.push(id); give(a, id);
    return art;
  }
  // Coffre : un art que le joueur n'a pas encore, au hasard selon sa rareté.
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
  // Catalogue avec le nombre de joueurs qui ont chaque art, pour l'onglet Boutique.
  function adminList() {
    const all = store.all();
    return Object.values(ARTS).map(art => ({ ...art, exists: artExists(art.id), rarityName: rarityName(art), price: art.edition === 'promo' ? null : artPrice(art, cfg()),
      owners: all.filter(x => owns(x, art.id)).length }));
  }
  // Donner (Promo, geste commercial) ou retirer un art.
  function adminGive(a, { art: id, give: on }) {
    if (!ARTS[id]) throw new HttpError(400, 'Art inconnu.');
    if (on) { if (!owns(a, id)) give(a, id, { gift: true }); return; }
    if (a.arts) delete a.arts[id];
    for (const [card, sel] of Object.entries(a.artSel || {})) if (sel === id) delete a.artSel[card];
  }

  return { view, buy, chest, select, adminList, adminGive };
}
