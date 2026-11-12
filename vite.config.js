import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The site lives in site/ and builds to dist/, which the deploy publishes to
 * Amplify with a config.json written beside it. `npm run dev` serves no
 * config.json, so the page runs on its sample inventory (site/src/core/config.js).
 */
export default defineConfig({
  root: 'site',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    // So the phone on the same Wi-Fi can open the dev server.
    host: true
  },
  test: {
    root: '.',
    environment: 'jsdom',
    include: ['site/src/**/*.test.{js,jsx}']
  }
});
