// Walk along the platforms' edges (where the city beyond shows) and save consecutive frames: the
// backdrop, the rim walls and the props there as a player sees them move.
//   node tools/qa/edgewalk.mjs [url] [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:4173/', out = 'tools/qa/out/edgewalk'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2000);
const ROUTES = (process.env.ROUTES && JSON.parse(process.env.ROUTES)) || {
  south: [[60, 152], [140, 152]],
  west: [[44, 100], [44, 150]],
  upperEast: [[120, 40], [120, 76]],
  upperSouth: [[66, 76], [118, 76]],
};
for (const [name, [a, b]] of Object.entries(ROUTES)) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    await page.evaluate(([x, y]) => { const g = __game; g.player.x = x; g.player.y = y; g.player.path = null; }, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}_${String(i).padStart(2, '0')}.png` });
  }
}
await browser.close();
