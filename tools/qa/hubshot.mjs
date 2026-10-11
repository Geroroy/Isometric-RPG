// The city hub's two levels from above: the upper plaza, the undercity market street, the
// cantina square and the alleys — one wide capture per spot (docs/UNDERCITY_MAP.md).
//   node tools/qa/hubshot.mjs <out_dir> [url] [label]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
const url = process.argv[3] || 'http://127.0.0.1:4173/';
const label = process.argv[4] || 'hub';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
});
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
const spots = await page.evaluate(() => (window.__hubSpots ? window.__hubSpots() : null));
const SPOTS = spots || (process.env.OLD ? [['plaza', 94, 64], ['market_w', 78, 108], ['market_e', 112, 108], ['cantina', 108, 124], ['alleys', 84, 124]] : [['lift', 84, 101], ['plaza', 98, 112], ['overlook', 96, 123], ['west_alley', 76, 114], ['court', 75, 126], ['workshop', 121, 106], ['cantina', 117, 128], ['vent_se', 130, 121]]);
for (const [name, x, y] of SPOTS) {
  await page.evaluate(({ x, y }) => {
    window.__stop = true;
    const g = __game;
    const p = g.player;
    const bn = document.querySelector('.banner');
    if (bn) bn.style.display = 'none';
    p.x = x;
    p.y = y;
    p.path = null;
    p.setSaber(false);
    g.updateActive();
    for (let i = 0; i < 90; i++) {
      g.update(1 / 60);
      __renderer.render(1 / 60);
    }
    __renderer.post.render(0);
  }, { x, y });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}_${name}.png` });
}
console.log('errors', errs.length, errs[0] || '');
await browser.close();
