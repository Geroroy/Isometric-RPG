// Ships the browser-baked props (gfx/assets.js 'core' bundle) with the game, so
// no device has to bake them on its first launch or after an update.
//
//   npm run dev          (in another terminal)
//   node tools/bake_core.mjs [url=http://localhost:5173/] [--hd]
//
// --hd: the remastered graphics' bundle instead ('core_hd': the same props and characters at 2× the pixel
// density, gfx/assets.js loadAssetsHD) → core_hd.json + core_hd_<n>.png. Re-run both when either goes stale.
//
// Opens the game once, lets it bake (or reuse) the 'core' bundle, reads it back
// from IndexedDB and writes public/sprites/baked/core.json + core_<n>.png. The
// JSON carries the source hash (gfx/assetCache.js SOURCE_HASH); the game only
// uses it while the hash matches, so a stale file falls back to baking. Re-run
// after changing models/props/anims/baker code (the game warns in the console).
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const HD = process.argv.includes('--hd');
const NAME = HD ? 'core_hd' : 'core';
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5173/';
const OUT = 'public/sprites/baked';
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers') ? findChrome('/opt/pw-browsers') : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(url + (HD ? '?bakehd' : '?bake'));
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
if (HD) await page.evaluate(() => window.__bakeHD());
// the save runs in the background after the bake: wait for the record
const rec = await page.evaluate(async (NAME) => {
  const get = () =>
    new Promise((res) => {
      const r = indexedDB.open('cw-sprites', 1);
      r.onsuccess = () => {
        const t = r.result.transaction('bundles', 'readonly').objectStore('bundles').get(NAME);
        t.onsuccess = () => res(t.result || null);
        t.onerror = () => res(null);
      };
      r.onerror = () => res(null);
    });
  let rec = null;
  for (let i = 0; i < 120 && !rec; i++) {
    rec = await get();
    if (!rec) await new Promise((r) => setTimeout(r, 500));
  }
  if (!rec) return null;
  const b64 = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  return { hash: rec.hash, json: rec.json, pages: await Promise.all(rec.blobs.map(b64)) };
}, NAME);
await browser.close();
if (!rec) throw new Error(`no ${NAME} bundle in IndexedDB`);
// this bundle's files replaced, the other's kept
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f === NAME + '.json' || new RegExp(`^${NAME}_\\d+\\.png$`).test(f)) fs.rmSync(path.join(OUT, f));
const pages = rec.pages.map((b, i) => {
  const f = `${NAME}_${i}.png`;
  fs.writeFileSync(path.join(OUT, f), Buffer.from(b, 'base64'));
  return f;
});
fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify({ hash: rec.hash, pages, json: rec.json }));
const kb = pages.concat(NAME + '.json').reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
console.log(`wrote ${OUT}/${NAME}.json + ${pages.length} pages (${Math.round(kb)} KB), hash ${rec.hash}`);
