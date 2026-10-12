// Full-screen captures of chosen spots on two builds, for a before / after look.
//   node tools/qa/spotshots.mjs <out_dir> '<json {name:[x,y]}>' <label=url> [<label=url> ...]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out, spotsArg, ...builds] = process.argv;
fs.mkdirSync(out, { recursive: true });
const spots = JSON.parse(spotsArg);
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const b of builds) {
  const i = b.indexOf('=');
  const label = b.slice(0, i);
  const url = b.slice(i + 1);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(2500);
  for (const [name, at] of Object.entries(spots)) {
    await page.evaluate((at) => { const g = __game; g.player.x = at[0]; g.player.y = at[1]; g.player.path = null; }, at);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${label}_${name}.png` });
  }
  console.log(label, 'errors', errs.length, errs[0] || '');
  await page.close();
}
await browser.close();
