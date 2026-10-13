// Vignettes des illustrations : « import x from './art/…/decor.webp?vignette' » donne l'adresse d'une copie réduite à 640 px
// de large (art.js), faite à la compilation avec sharp. L'original n'est pas touché : il reste servi tel quel pour la vue en grand.
// Les vignettes déjà faites sont gardées dans node_modules/.cache/vignettes (clé : contenu de l'image), si bien qu'une
// compilation ne réduit que les images nouvelles ou modifiées. En développement, la vignette est l'original.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const WIDTH = 640, QUALITY = 90, SUFFIX = '?vignette';
const CACHE = new URL('./node_modules/.cache/vignettes/', import.meta.url);

export default function vignettes() {
  let build = false;
  return {
    name: 'vignettes',
    enforce: 'pre',
    configResolved(cfg) { build = cfg.command === 'build'; },
    async load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const file = id.slice(0, -SUFFIX.length);
      if (!build) return `export default ${JSON.stringify('/@fs' + file)};`;
      const src = await readFile(file), key = createHash('sha1').update(src).digest('hex');
      const cached = new URL(`${key}-${WIDTH}-${QUALITY}.webp`, CACHE);
      let out = await readFile(cached).catch(() => null);
      if (!out) {
        const { default: sharp } = await import('sharp');
        out = await sharp(src).resize({ width: WIDTH, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: QUALITY, alphaQuality: 100, effort: 4 }).toBuffer();
        await mkdir(CACHE, { recursive: true }); await writeFile(cached, out);
      }
      const ref = this.emitFile({ type: 'asset', name: basename(file), source: out });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}
