// Load the game like a player and collect every page error and console error: the title, the
// start, the hub, the turbolift down, the undercity's spots, the flight to Christophsis and
// back, a fight, the popups. Exit 1 when anything was thrown.
//   node tools/qa/smoke.mjs [url]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
const warns = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('console.error: ' + m.text());
  else if (m.type() === 'warning') warns.push(m.text());
});
page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
page.on('response', (r) => {
  if (r.status() >= 400) warns.push(`${r.status()} ${r.url()}`);
});
const step = async (name, fn) => {
  const n = errs.length;
  try {
    await fn();
  } catch (e) {
    errs.push(`${name}: ${e.message.split('\n')[0]}`);
  }
  console.log(`${errs.length > n ? 'FAIL' : 'ok  '} ${name}`);
};
await step('load', async () => {
  await page.goto(url);
  await page.waitForFunction(() => window.__ready || document.querySelector('#loading .err, .error'), null, { timeout: 900000 });
  const err = await page.evaluate(() => (document.querySelector('#loading')?.textContent || '').match(/오류[^\n]*/)?.[0]);
  if (err) throw new Error(err);
});
await step('start', async () => {
  await page.click('#startBtn');
  await page.waitForTimeout(2500);
});
const run = (sec) => page.waitForTimeout(sec * 1000);
await step('hub: walk the plaza', async () => {
  await page.evaluate(() => {
    const g = __game;
    g.player.moveTo ? g.player.moveTo(94, 66) : (g.player.x = 94, g.player.y = 66);
  });
  await run(2);
});
await step('turbolift down', async () => {
  await page.evaluate(() => {
    const g = __game;
    const L = g.world.lifts[0];
    g.player.x = L.x;
    g.player.y = L.y;
    g.player.path = null;
  });
  await run(4);
  const y = await page.evaluate(() => __game.player.y);
  if (y < 90) throw new Error('still on the upper level, y=' + y);
});
for (const [name, x, y] of [['plaza', 98, 112], ['west alley', 76, 114], ['court', 75, 126], ['workshop', 121, 106], ['cantina', 117, 128], ['vent SE', 130, 121], ['overlook', 96, 123.5]]) {
  await step('undercity: ' + name, async () => {
    await page.evaluate(({ x, y }) => {
      __game.player.x = x;
      __game.player.y = y;
      __game.player.path = null;
      __game.updateActive();
    }, { x, y });
    await run(2.5);
  });
}
await step('popups: map / skills / char / settings', async () => {
  for (const k of ['map', 'tree', 'char', 'settings']) {
    await page.evaluate((k) => __hud.toggle(k, true), k);
    await run(0.5);
    await page.evaluate((k) => __hud.toggle(k, false), k);
  }
});
await step('fly to Christophsis', async () => {
  await page.evaluate(() => {
    const g = __game;
    g.travel('christophsis', g.places.christophsis.world.landing);
  });
  await run(3);
});
await step('fight', async () => {
  await page.evaluate(() => {
    const g = __game;
    const p = g.player;
    const c = g.front.camps.filter((k) => !k.boss)[0];
    p.x = c.x - 3;
    p.y = c.y - 3;
    p.path = null;
    p.setSaber(true);
    g.updateActive();
  });
  await run(6);
});
await step('fly back to the hub', async () => {
  await page.evaluate(() => {
    const g = __game;
    g.travel('hub', g.places.hub.world.landing);
  });
  await run(3);
});
console.log('\nerrors:', errs.length);
for (const e of errs) console.log('  ' + e);
console.log('warnings (first 12 of ' + warns.length + '):');
for (const w of warns.slice(0, 12)) console.log('  ' + w);
await browser.close();
process.exit(errs.length ? 1 : 0);
