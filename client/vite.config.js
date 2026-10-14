import { defineConfig } from 'vite';
import vignettes from './vignettes.js';

export default defineConfig({
  // Vignettes des illustrations (vignettes.js, art.js).
  plugins: [vignettes()],
  server: { host: true, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' } },
  // Deux pages : l'appli et la page d'administration des comptes.
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
});
