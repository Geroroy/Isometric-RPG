import { defineConfig } from 'vite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// After a build: dist/asset-manifest.json — `files`: every file that keeps its name between builds
// (sprite sheets, audio, fonts, the baked bundle; not the page or the service worker) with a short
// hash of its content; `assets`: the build's own hashed files (assets/). The service worker
// (public/sw.js) caches files by that hash, so a new build re-downloads only what changed, and drops
// what the build no longer has.
function assetManifest() {
  let outDir = 'dist';
  return {
    name: 'asset-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = {};
      const assets = [];
      const skip = new Set(['index.html', 'sw.js', 'asset-manifest.json']);
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          const rel = path.relative(outDir, p).split(path.sep).join('/');
          if (e.isDirectory()) walk(p);
          else if (rel.startsWith('assets/')) assets.push(rel);
          else if (!skip.has(rel)) {
            files[rel] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
          }
        }
      };
      walk(outDir);
      fs.writeFileSync(path.join(outDir, 'asset-manifest.json'), JSON.stringify({ files, assets }));
    },
  };
}

export default defineConfig({
  // relative asset paths so the build can be hosted from any sub-folder
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  // this build's id: the service worker reads this build's asset manifest (public/sw.js)
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  plugins: [assetManifest()],
});
