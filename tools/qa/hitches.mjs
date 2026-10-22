// Hitches a player feels in the city: every frame callback's length (rAF wrapped) and the long tasks,
// tagged with what was going on — walking the districts, the turbolift both ways, zooming out and in.
//   node tools/qa/hitches.mjs <url> [label]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:4173/', label = ''] = process.argv;
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.addInitScript(() => {
  window.__cb = [];
  window.__phase = 'load';
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); window.__cb.push([window.__phase, performance.now() - a]); });
});
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
const phase = (p) => page.evaluate((p) => (window.__phase = p), p);
const walkTo = async (x, y, secs) => { await page.evaluate(({ x, y }) => __game.player.moveTo ? __game.player.moveTo(x, y) : 0, { x, y }); await page.waitForTimeout(secs * 1000); };
const v2 = await page.evaluate(() => !!__game.world.qaSpots);
const __lift1 = await page.evaluate(() => { const L = __game.world.lifts[1]; return [L.x + 2, L.y + 3]; });
await phase('upper walk');
await walkTo(90, 66, 4);
await walkTo(84, 76, 4);
await page.waitForTimeout(12000); // at the lift a while, as a player walking up to it (its far end is made ahead)
await phase('lift down');
await page.evaluate(() => { const L = __game.world.lifts[0]; __game.player.x = L.x; __game.player.y = L.y; __game.player.path = null; });
await page.waitForTimeout(4000);
await phase('undercity walk');
const route = v2 ? [[98, 112.5], [120, 112.5], [140, 112.5], [98, 126], [57, 132], [98, 146]] : [[98, 112], [121, 106], [117, 128], [96, 123.5], [76, 114], [75, 126]];
for (const [x, y] of route) await walkTo(x, y, 5);
await phase('zoom out');
for (let i = 0; i < 4; i++) { await page.click('#zoomOut'); await page.waitForTimeout(1500); }
await phase('zoomed-out walk');
for (const [x, y] of route.slice(0, 3)) await walkTo(x, y, 4);
await phase('zoom in');
for (let i = 0; i < 4; i++) { await page.click('#zoomIn'); await page.waitForTimeout(1500); }
await walkTo(__lift1[0], __lift1[1], 4);
await page.waitForTimeout(12000);
await phase('lift up');
await page.evaluate(() => { const L = __game.world.lifts[1]; __game.player.x = L.x; __game.player.y = L.y; __game.player.path = null; });
await page.waitForTimeout(4000);
const res = await page.evaluate(() => {
  const by = {};
  for (const [p, ms] of window.__cb) {
    const b = (by[p] ||= { n: 0, sum: 0, max: 0, over33: 0 });
    b.n++;
    b.sum += ms;
    b.max = Math.max(b.max, ms);
    if (ms > 33) b.over33++;
  }
  return Object.fromEntries(Object.entries(by).map(([k, b]) => [k, `avg ${(b.sum / b.n).toFixed(1)} ms, max ${b.max.toFixed(0)} ms, ${b.over33} frames > 33 ms of ${b.n}`]));
});
for (const [k, v] of Object.entries(res)) console.log(`${label} ${k}: ${v}`);
await browser.close();
