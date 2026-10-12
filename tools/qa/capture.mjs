// Game screenshots for the reference comparison (tools/qa/compare.py):
// one shot per place, HUD hidden, the same zoom and window every time.
//
//   npm run dev   (in another terminal)
//   node tools/qa/capture.mjs [out_dir=tools/qa/out/shots] [url=http://localhost:5173/]
//
// Chromium: Playwright's (PLAYWRIGHT_BROWSERS_PATH) or CHROME=/path/to/chrome.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/shots', url = 'http://localhost:5173/'] = process.argv;
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers') ? findChrome('/opt/pw-browsers') : undefined);
fs.mkdirSync(out, { recursive: true });

// place → how to get there (hash for the duels, else a player position)
const SHOTS = [
  { name: 'christophsis', go: (g) => g.travel('christophsis', g.places.christophsis.world.landing) },
  { name: 'coruscant', go: (g) => ((g.player.x = g.world.spawn.x), (g.player.y = g.world.spawn.y)) },
  { name: 'undercity', go: (g) => ((g.player.x = 96), (g.player.y = 108)) },
  { name: 'geonosis', hash: '#duel' },
  { name: 'mustafar', hash: '#duel-mustafar' },
];

function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url + (s.hash || ''));
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(1500);
  for (let i = 0; i < 4 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  if (s.go) await page.evaluate(`(${s.go.toString()})(window.__game)`);
  await page.evaluate(() => {
    window.__renderer.setZoom(1.5);
    for (const sel of ['#hud', '#overlay']) {
      const el = document.querySelector(sel);
      if (el) el.style.visibility = 'hidden';
    }
  });
  await page.waitForTimeout(2500);
  const file = path.join(out, s.name + '.png');
  await page.screenshot({ path: file });
  console.log('shot', file);
  await page.close();
}
await browser.close();
