// The same two scenes every time, for before/after comparisons of a performance change:
// the city hub where the game starts, and a Christophsis camp with Anakin's blade lit.
//   node tools/qa/perfshot.mjs <out_prefix> [url] [device=phone]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , prefix = 'tools/qa/out/perf/shot', url = 'http://localhost:4173/', device = 'phone'] = process.argv;
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const b = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxOpts = device === 'phone' ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const page = await (await b.newContext(ctxOpts)).newPage();
await page.addInitScript(() => (Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })()));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
if (device === 'phone') await page.tap('#startBtn');
else await page.click('#startBtn');
await page.waitForTimeout(2500);
fs.mkdirSync(path.dirname(prefix), { recursive: true });
await page.screenshot({ path: prefix + '_hub.png' });
await page.evaluate(() => {
  const g = __game;
  const p = g.player;
  g.travel('christophsis', g.places.christophsis.world.landing);
  const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  p.x = c.x - 3;
  p.y = c.y - 3;
  p.faceTo(c.x, c.y);
  p.setSaber(true);
  g.cheats.god = true;
});
await page.waitForTimeout(3500);
await page.screenshot({ path: prefix + '_camp.png' });
console.log('shots', prefix);
await b.close();
