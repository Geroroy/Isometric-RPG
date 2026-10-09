import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the build can be hosted from any sub-folder
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
