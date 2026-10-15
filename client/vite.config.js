import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import vignettes from './vignettes.js';

// Version de l'appli, jointe aux signalements de bugs : commit déployé (Render le donne) et date de compilation.
const commit = (() => {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'dev'; }
})();
const VERSION = `${commit} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

// main.js est chargé par boot.js une fois la langue réglée : la page le précharge (avec ses dépendances)
// pour que son téléchargement parte tout de suite, en même temps que celui des traductions.
const precharge = {
  name: 'precharge-main', apply: 'build',
  transformIndexHtml: { order: 'post', handler(html, { bundle }) {
    const main = bundle && Object.values(bundle).find(c => c.type === 'chunk' && c.moduleIds.some(id => id.endsWith('/src/main.js')));
    if (!main) return html;
    const chunks = [main, ...main.imports.map(f => bundle[f])];
    const link = (rel, f) => ({ tag: 'link', attrs: { rel, crossorigin: true, href: `/${f}` }, injectTo: 'head' });
    // Ses feuilles de style aussi, dans la page comme avant : sans elles, l'écran s'afficherait d'abord sans mise en page.
    const css = new Set(chunks.flatMap(c => [...(c.viteMetadata?.importedCss || [])]));
    const tags = [...chunks.map(c => link('modulepreload', c.fileName)), ...[...css].map(f => link('stylesheet', f))]
      .filter(tag => !html.includes(`${tag.attrs.href}"`));
    return { html, tags };
  } },
};

export default defineConfig({
  // Vignettes des illustrations (vignettes.js, art.js) et préchargement de main.js.
  plugins: [vignettes(), precharge],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  server: { host: true, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' } },
  // Deux pages : l'appli et la page d'administration des comptes.
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
});
