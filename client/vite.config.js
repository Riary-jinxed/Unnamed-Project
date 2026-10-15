import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import vignettes from './vignettes.js';

// Version de l'appli, jointe aux signalements de bugs : commit déployé (Render le donne) et date de compilation.
const commit = (() => {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'dev'; }
})();
const VERSION = `${commit} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

export default defineConfig({
  // Vignettes des illustrations (vignettes.js, art.js).
  plugins: [vignettes()],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  server: { host: true, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' } },
  // Deux pages : l'appli et la page d'administration des comptes.
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
});
