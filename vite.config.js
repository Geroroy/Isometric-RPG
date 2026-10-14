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
          // (Vite's own hashed files sit directly in assets/; a subfolder there is external art — public/assets/<set>,
          // docs/ASSETS.md — whose names stay between builds, so it is hashed by content like the rest)
          else if (/^assets\/[^/]+$/.test(rel)) assets.push(rel);
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

// `npm run dev` only: the map editor's save (src/ui/mapEditor.js, Ctrl+S) POSTs the map here and it is
// written straight over public/maps/<name>.json, so a reload plays it (a build has no such route: it downloads).
function mapSave() {
  return {
    name: 'map-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__map/', (req, res, next) => {
        const name = decodeURIComponent((req.url || '').replace(/^\//, '').split('?')[0]);
        if (req.method !== 'POST' || !/^[a-z0-9_-]+$/i.test(name)) return next();
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            JSON.parse(body);
            fs.writeFileSync(path.resolve('public/maps', name + '.json'), body);
            res.statusCode = 204;
          } catch (e) {
            res.statusCode = 400;
            res.write(String(e.message));
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  // relative asset paths so the build can be hosted from any sub-folder
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  // this build's id: the service worker reads this build's asset manifest (public/sw.js)
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  plugins: [assetManifest(), mapSave()],
});
