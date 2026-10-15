// Tables du moteur dont les textes s'affichent par t(x.champ) (vérifiées par scripts/i18n.js).
// [fichier de packages/engine/src, export, champs à traduire ('*' : toutes les chaînes ; dans une liste, tous les éléments)].
// Les titres, cadres et dos des saisons, des clans et du boss sont rangés dans TITLES, FRAMES et BACKS (rewards.js).
export default [
  // Récompenses : leçons du tutoriel, cosmétiques, niveaux de carte, succès.
  ['rewards.js', 'TUTO_LESSONS', ['name']],
  ['rewards.js', 'FRAMES', '*'],
  ['rewards.js', 'BACKS', '*'],
  ['rewards.js', 'TITLES', '*'],
  ['rewards.js', 'CARD_LEVELS', ['name', 'perk']],
  ['rewards.js', 'ACHIEVEMENTS', ['label', 'group', 'title']],
  // Émotes, événements, saisons.
  ['emotes.js', 'EMOTES', ['text']],
  ['events.js', 'EVENT_EFFECTS', ['name', 'chip', 'short', 'what']],
  ['events.js', 'DEFAULT_EVENTS', ['name']],
  ['pass.js', 'SEASON_THEMES', '*'],
  ['themes.js', 'EXTRA_THEMES', ['name']],
  // Arts alternatifs.
  ['arts.js', 'ART_RARITIES', ['name']],
  ['arts.js', 'ART_THEMES', ['name', 'title']],
  ['arts.js', 'ARTS', ['name', 'how']],
  ['arts.js', 'RETIRED_ARTS', ['name']],
  // Clans.
  ['clans.js', 'CLAN_ICONS', '*'],
  ['clans.js', 'CLAN_ROLES', '*'],
  ['clans.js', 'DONATIONS', ['name']],
  ['clans.js', 'CLAN_PROJECTS', ['name', 'desc']],
  ['clans.js', 'CLAN_SHOP', ['name']],
  ['clans.js', 'CLAN_PLACES', ['name', 'bannerName']],
  // Boss mondial et mode classé.
  ['boss.js', 'BOSS_SHOP', ['name']],
  ['ranked.js', 'TIERS', ['name', 'title']],
  ['ranked.js', 'PLACES', ['name', 'title']],
  ['story.js', 'STORY_TEXTS', '*'],
];
