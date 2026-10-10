import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the build can be hosted from any sub-folder
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  // this build's id: the service worker keeps one cache per build (public/sw.js)
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
});
