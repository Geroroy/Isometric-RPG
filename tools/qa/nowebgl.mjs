// The Mustafar duel in a browser without WebGL (README: "WebGL을 쓸 수 없는 브라우저"): Chromium started with its 3D
// APIs off (--disable-3d-apis --disable-webgl: a real browser with no WebGL — not a mock), and a fresh profile (empty
// HTTP, IndexedDB and service-worker caches). Checks that WebGL really is unavailable in it, that loading finishes, and
// that the fight starts; prints the console's errors and warnings and any failed request.
//     node tools/qa/nowebgl.mjs [base_url] [hash]      (mode=mock: WebGL on in the browser, getContext('webgl') → null)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:5185/', hash = '#duel-mustafar', mode = 'real'] = process.argv;
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const args = mode === 'real' ? ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2', '--disable-gpu'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ executablePath: chrome, args });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
if (mode === 'mock') {
  await ctx.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      return /webgl/i.test(type) ? null : get.call(this, type, ...a);
    };
    if (self.OffscreenCanvas) {
      const og = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function (type, ...a) {
        return /webgl/i.test(type) ? null : og.call(this, type, ...a);
      };
    }
  });
}
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && log.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
page.on('response', (r) => r.status() >= 400 && !r.url().includes('/cards/') && log.push(`${r.status()} ${r.url()}`));
await page.goto(url + hash);
const webgl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
  return gl ? `available (${gl.getParameter(gl.VERSION)})` : 'unavailable';
});
console.log('mode', mode, '— WebGL in this browser:', webgl);
const t0 = Date.now();
const res = await page
  .waitForFunction(() => window.__ready || /오류/.test(document.querySelector('#loading .label')?.textContent || ''), null, { timeout: 600000 })
  .then(() => page.evaluate(() => ({ ready: !!window.__ready, label: document.querySelector('#loading .label')?.textContent })));
console.log('loading:', JSON.stringify(res), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (res.ready) {
  await page.click('#startBtn');
  await page.waitForTimeout(8000);
  const s = await page.evaluate(() => ({ part: window.__game.duel.part, cinema: !!window.__game.cinema, post: !!(window.__renderer.post && window.__renderer.post.ok) }));
  console.log('after start:', JSON.stringify(s));
  await page.screenshot({ path: `tools/qa/out/nowebgl_${mode}.png` });
}
console.log('console/requests:', log.length ? '\n  ' + log.slice(0, 20).join('\n  ') : 'none');
await browser.close();
process.exit(res.ready ? 0 : 1);
