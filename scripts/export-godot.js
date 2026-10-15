// Prépare les données du prototype Godot (dossier godot/) : npm run godot:data
// 1. godot/data/catalog.json : cartes, généraux, terrains, zones et réglages du moteur, tirés de @jeu/engine.
//    Le moteur reste la seule source des règles : Godot n'en lit que ce qu'il affiche.
// 2. godot/art/ : les illustrations de client/src/art en 640 px de large (sharp), comme les vignettes de l'appli.
//    Seules les images absentes ou plus anciennes que l'original sont refaites.
// 3. godot/music/ : les musiques de partie et de menu de client/public/music.
// Ces dossiers sont produits ici et ne sont pas suivis par git (godot/.gitignore).
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS, GENERALS, TERRAINS, FAMILIES, ZONE_NAMES, SLOTS, TURNS, HAND_MAX } from '../packages/engine/src/engine.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'godot');
const ART = join(ROOT, 'client/src/art');
const WIDTH = 640, QUALITY = 82;

// Couleurs des familles : celles de client/src/style.css (--f-…).
const FAM_COLORS = { 'Ange': '#e2b93e', 'Elfe': '#4fbcad', 'Démon': '#de5c56', 'Gobelin': '#79b85f', 'Dragon': '#e48447',
  'Mort-vivant': '#8fb19c', 'Vampire': '#d0547f', 'Hacker': '#3ad7ff', 'Cyborg': '#ff4fbf', 'Dieux': '#a585e6', neutre: '#99a1b0' };
const famOf = kw => (kw || []).find(k => FAMILIES.includes(k)) || null;
// Position des visages (portraits des généraux) : la table FACES de client/src/art.js, lue telle quelle.
const artJs = readFileSync(join(ROOT, 'client/src/art.js'), 'utf8');
const faces = new Function(`return ${artJs.match(/const FACES = (\{[\s\S]*?\});/)[1]}`)();
// Mots-clés mis en gras dans les textes d'effet : la liste KEYWORDS de client/src/common.js, lue telle quelle.
const commonJs = readFileSync(join(ROOT, 'client/src/common.js'), 'utf8');
const keywords = new Function(`return ${commonJs.match(/const KEYWORDS = (\[[\s\S]*?\]);/)[1]}`)();

const catalog = {
  slots: SLOTS, turns: TURNS, handMax: HAND_MAX, zones: ZONE_NAMES, families: FAM_COLORS, faces, keywords,
  cards: Object.fromEntries(Object.entries(CARDS).map(([id, c]) => [id, {
    name: c.name, type: c.type, cost: c.cost, power: c.power, kw: c.kw || [], text: c.text || '', x: !!c.x, fam: famOf(c.kw) }])),
  generals: Object.fromEntries(Object.entries(GENERALS).map(([id, g]) => [id, {
    name: g.name, fam: g.fam || null, kind: g.kind || '', text: g.text || '',
    activate: !!g.activate, needsZone: !!g.needsZone, activateCost: g.activateCost || 0 }])),
  terrains: Object.fromEntries(Object.entries(TERRAINS).map(([id, x]) => [id, { name: x.name, fam: x.fam || null, text: x.text || '' }])),
};
mkdirSync(join(OUT, 'data'), { recursive: true });
writeFileSync(join(OUT, 'data/catalog.json'), JSON.stringify(catalog));
console.log(`catalog.json : ${Object.keys(catalog.cards).length} cartes, ${Object.keys(catalog.generals).length} généraux, ${Object.keys(catalog.terrains).length} terrains.`);

// Illustrations : art/<id>/{decor,perso}.webp et art/terrain/<id>.webp (les arts alternatifs viendront avec la collection).
const { default: sharp } = await import('sharp');
const jobs = [];
for (const id of readdirSync(ART)) {
  const dir = join(ART, id);
  if (id === 'alt' || !statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('.webp')) jobs.push([join(dir, f), join(OUT, 'art', id, f)]);
}
let made = 0;
for (const [src, dst] of jobs) {
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
  mkdirSync(join(dst, '..'), { recursive: true });
  await sharp(src).resize({ width: WIDTH, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: QUALITY, alphaQuality: 100, effort: 4 }).toFile(dst);
  made++;
}
console.log(`Illustrations : ${made} refaites, ${jobs.length - made} déjà à jour.`);

// Musiques : les morceaux de base (les variantes des thèmes viendront avec les thèmes).
mkdirSync(join(OUT, 'music'), { recursive: true });
for (const f of ['partie.mp3', 'menu.mp3']) copyFileSync(join(ROOT, 'client/public/music', f), join(OUT, 'music', f));
console.log('Musiques : partie.mp3, menu.mp3.');
