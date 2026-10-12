// Force ripple: the post shader's version against the CPU fallback, same frame.
// Freezes the game, adds a full ring and a cone, renders once each way, saves both.
//   node tools/qa/ripplecheck.mjs [url] [outPrefix]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || 'tools/qa/out/perf/ripple';
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
});
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.tap('#startBtn');
await page.waitForTimeout(2500);
for (const mode of ['gpu', 'cpu']) {
  await page.evaluate((mode) => {
    window.__stop = true;
    const g = __game;
    const R = __renderer;
    const post = R.post;
    const p = g.player;
    // no grain/time noise between the two shots
    post.opts.grain = false;
    g.fx.ripples.length = 0;
    g.fx.ripple(p.x + 2, p.y + 2, 4, 1, 3, null, Math.PI);
    g.fx.ripple(p.x - 3, p.y + 1, 5, 1, 3.5, 2.4, 0.75);
    for (const r of g.fx.ripples) r.t = 0.35;
    R.post = mode === 'gpu' ? post : null;
    post.ripples.length = 0;
    R.time = 10;
    R.render(0);
    R.post = post;
    post.render(0);
  }, mode);
  await page.screenshot({ path: `${out}_${mode}.png` });
}
await browser.close();
console.log('saved', out + '_gpu.png', out + '_cpu.png');
