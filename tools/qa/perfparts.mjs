// Where the frame goes in the city (the real frame loop, GPU work included): the median frame interval
// at a spot, then again with one part switched off at a time — the buildings and props, their glow
// layer, the lighting pass, the backdrop (sky, buildings beyond, traffic), the post-processing.
// Diagnostic only: it switches parts off from the page.
//   node tools/qa/perfparts.mjs <url> [label] [width] [height]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:4173/', label = '', W = '1920', H = '1080'] = process.argv;
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H } })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
const frame = () => page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; __game.player.path = null; if (t.length < 40) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res(+t[20].toFixed(0)); } }; requestAnimationFrame(f); }));
const PARTS = {
  all: () => {},
  noProps: () => { for (const p of __game.world.props) if (!p.hidden) (p.hidden = true), (p._qaHid = true); },
  noGlow: () => { __renderer._glow = __renderer.drawCityGlow; __renderer.drawCityGlow = () => {}; },
  noLighting: () => { __renderer._light = __renderer.drawLighting; __renderer.drawLighting = () => {}; },
  noBackdrop: () => { __game.world.city = false; },
  noPost: () => { const o = __renderer.post.opts; window.__po = { ...o }; for (const k of ['grade', 'bloom', 'vignette', 'grain']) o[k] = false; },
};
const UNDO = () => {
  for (const p of __game.world.props) if (p._qaHid) (p.hidden = false), (p._qaHid = false);
  if (__renderer._glow) (__renderer.drawCityGlow = __renderer._glow), (__renderer._glow = null);
  if (__renderer._light) (__renderer.drawLighting = __renderer._light), (__renderer._light = null);
  __game.world.city = true;
  if (window.__po) Object.assign(__renderer.post.opts, window.__po);
};
const spots = await page.evaluate(() => {
  const q = __game.world.qaSpots;
  return q ? { plaza: q.plaza, upper: [100, 64] } : { plaza: [98, 112], upper: [100, 64] };
});
for (const [name, at] of Object.entries(spots)) {
  await page.evaluate((at) => { const g = __game; g.player.x = at[0]; g.player.y = at[1]; g.player.path = null; }, at);
  await page.waitForTimeout(4000);
  const row = {};
  for (const [k, fn] of Object.entries(PARTS)) {
    await page.evaluate(`(${fn.toString()})()`);
    await page.waitForTimeout(1200);
    row[k] = await frame();
    await page.evaluate(`(${UNDO.toString()})()`);
  }
  const lights = await page.evaluate(() => __game.world.lights.length);
  console.log(`${label} ${name}: ${Object.entries(row).map(([k, v]) => `${k} ${v}`).join(' | ')} ms; lights ${lights}`);
}
await browser.close();
