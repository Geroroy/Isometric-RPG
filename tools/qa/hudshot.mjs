// The HUD on PC and phone: hub, combat, settings, skill tree.
//   npx vite preview --port 4173 (build first); node tools/qa/hudshot.mjs <out_dir>
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, opts] of [['pc', { viewport: { width: 1280, height: 720 } }], ['phone', { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const page = await (await b.newContext(opts)).newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  if (name === 'phone') await page.tap('#startBtn'); else await page.click('#startBtn');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}_hub.png` });
  await page.evaluate(() => { const g = __game, p = g.player; g.travel('christophsis', g.places.christophsis.world.landing); const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; p.x = c.x - 3; p.y = c.y - 3; g.cheats.god = true; p.setSaber(true); p.level = 6; p.skills = { flurry: 2, push: 1, throw: 1 }; p.hotbar = ['flurry', 'push', 'throw']; p.recalc(true); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/${name}_camp.png` });
  if (name === 'pc') {
    // a slot half-way through its cooldown (the scan line) and the mouse over another (the hover sweep)
    await page.evaluate(() => { const p = __game.player; p.cooldowns.push = 4; });
    await page.hover('.ab-row .ab:nth-child(3)');
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${out}/pc_deck.png`, clip: { x: 330, y: 600, width: 420, height: 100 } });
    await page.evaluate(() => __hud.toggle('settings', true));
    await page.waitForTimeout(120); // mid-sweep
    await page.screenshot({ path: `${out}/pc_settings_opening.png` });
    await page.evaluate(() => __hud.toggle('settings', false));
  }
  if (name === 'pc') { await page.evaluate(() => __hud.toggle('settings', true)); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/pc_settings.png` }); await page.evaluate(() => (__hud.toggle('settings', false), __hud.toggle('tree', true))); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/pc_tree.png` }); }
  await page.close();
}
await b.close();
