// Notes de mise à jour : chaque note est envoyée une seule fois dans le courrier de tous les joueurs, au premier démarrage
// du serveur qui la contient (donc au déploiement). Son identifiant est retenu : la supprimer depuis /admin ne la renvoie pas.
// Ajoutez une note en fin de liste avec un identifiant nouveau ; ne modifiez pas une note déjà partie.
export const NOTES_MAJ = [
  {
    id: 'maj-equilibrage-1',
    title: 'Mise à jour : équilibrage des généraux et des cartes',
    body: `Après plus de 500 000 parties simulées entre IA, voici les premiers ajustements d'équilibrage.

Généraux affaiblis
• Comte Valdric : son effet de fin de tour ne se déclenche plus que 3 fois par partie.
• Gorbag le Ripailleur : Festin 1 seulement aux tours pairs.

Généraux renforcés
• Séraphine : activation gratuite (au lieu de 1 sceau), et +2 au lieu de +1.
• Aurélia : il suffit d'avoir dépensé tous vos sceaux à au moins 5 tours (au lieu de tous).
• Ossa : si votre défausse n'a pas de créature, la première créature de votre deck est invoquée à la place.
• Dame Carmilla : Drain 2 au lieu de Drain 1.
• L'Intendant : +1 sceau aux tours 1 et 2 (au lieu du tour 1 seulement).

Cartes affaiblies
• Dominion : coûte 5 sceaux (au lieu de 4).
• Danse macabre : coûte 2 sceaux (au lieu de 1).
• Dragon d'or : puissance 11 (au lieu de 12).

Cartes renforcées
• Gobelin pyromane : détruit une créature de puissance 3 ou moins (au lieu de 2).
• Souffle de feu : coûte 2 sceaux (au lieu de 3).
• Sentier caché : coûte 1 sceau (au lieu de 2).
• Druidesse : puissance 3 (au lieu de 2).
• Annonciatrice : puissance 2 (au lieu de 1).
• Séraphin : puissance 6 (au lieu de 5).

Les decks préconstruits sont désormais bien plus proches les uns des autres. Dites-nous ce que vous en pensez en jeu !`,
  },
];
