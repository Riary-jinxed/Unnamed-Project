// Annonces écrites dans le code : chacune paraît une seule fois dans les Nouveautés, au premier démarrage du serveur qui la contient
// (donc au déploiement). Son identifiant est retenu : la supprimer depuis /admin ne la fait pas revenir.
// Ajoutez une annonce en fin de liste avec un identifiant nouveau ; ensuite, modifiez-la plutôt depuis /admin.
// Même forme que les annonces de /admin (server/src/news.js) : from = jour de parution, date = jour annoncé (compte à rebours, À venir),
// set = set montré dans la boutique une fois sorti.
export const NEWS_SEED = [
  {
    id: 'set-crepuscule',
    from: '2026-10-15', kind: 'set', set: 'set2', date: null,
    title: 'Set 2 « Crépuscule »',
    summary: 'Mort-vivants et Vampires rejoignent la bataille : 57 cartes, 10 généraux et 11 terrains.',
    body: `Le crépuscule tombe sur le monde d'Éclats. Deux nouvelles familles arrivent, et chaque famille du Set de base reçoit des renforts.

• Mort-vivant : défaussez pour revenir en jeu. Défausse, Relève et Exhumation.
• Vampire : Drain, qui affaiblit l'adversaire jusque dans sa main et son deck pour renforcer le Vampire.
• Nouvelles mécaniques pour les autres familles : Festin (Gobelin), Inspiration (Ange), Œuf et Éclosion (Dragon), Échange (Démon), Sortilège (Elfe).

57 cartes, 10 généraux, 11 terrains et de nouveaux decks préconstruits. Les boosters Crépuscule sont dans la boutique.`,
    en: {
      title: 'Set 2 "Twilight"',
      summary: 'Undead and Vampires join the battle: 57 cards, 10 generals and 11 terrains.',
      body: `Twilight falls over the world of Shards. Two new families arrive, and every family of the Base Set gets reinforcements.

• Undead: discard to come back into play. Discard, Rise and Exhume.
• Vampire: Drain, which weakens your opponent all the way into their hand and deck to strengthen the Vampire.
• New mechanics for the other families: Feast (Goblin), Inspiration (Angel), Egg and Hatch (Dragon), Swap (Demon), Spellcast (Elf).

57 cards, 10 generals, 11 terrains and new preconstructed decks. Twilight boosters are in the shop.`,
    },
  },
  {
    id: 'teaser-faites-vos-jeux',
    from: '2026-10-15', kind: 'teaser', set: 'tapis', date: '2026-10-23',
    title: 'Mini-set « Faites vos jeux » le 23 octobre',
    summary: 'Le casino ouvre ses portes : dés, triche et Jackpot, juste avant la semaine double points de classé.',
    body: `Un mini-set de 24 cartes arrive le vendredi 23 octobre, avec le week-end double XP.

• Pari : à la révélation, un dé à 6 faces décide de l'effet.
• Triche : pipez vos prochains dés, ou piochez la carte voulue dans votre deck.
• Les trois Sept : réunissez-les en jeu pour déclencher le Jackpot.

Deux nouveaux généraux, trois terrains, un deck préconstruit et une quête limitée. De quoi préparer la semaine double points de classé du 25 au 31 octobre.`,
    en: {
      title: 'Mini-set "Place your bets" on October 23',
      summary: 'The casino opens its doors: dice, cheating and Jackpot, right before the double ranked points week.',
      body: `A 24-card mini-set arrives on Friday, October 23, together with the double XP weekend.

• Bet: on reveal, a 6-sided die decides the effect.
• Cheat: load your next dice, or draw the card you want from your deck.
• The three Sevens: get them all into play to trigger the Jackpot.

Two new generals, three terrains, a preconstructed deck and a limited quest. Just in time for the double ranked points week, October 25 to 31.`,
    },
  },
];
