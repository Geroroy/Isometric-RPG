// Pixels nothing paints in a frame: the game canvas is filled magenta just before the world is drawn
// and the magenta left after it is counted, at spots over the city (the backdrop is drawn only where
// renderer.voidRect finds the drop; anything else must be covered by the terrain).
//   node tools/qa/coverage.mjs [url] [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:4173/', out = 'tools/qa/out/coverage'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2000);
const res = await page.evaluate(async () => {
  const R = __renderer;
  const g = __game;
  const out = [];
  const pts = [];
  for (let y = 36; y <= 160; y += 4) for (let x = 36; x <= 160; x += 4) pts.push([x, y]);
  for (const [x, y] of pts) {
    g.player.x = x;
    g.player.y = y;
    g.player.path = null;
    for (let i = 0; i < 2; i++) {
      // terrain chunks built and the frame settled
      R.render(1 / 60);
    }
    const ctx = R.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, R.w, R.h);
    // only the world: the backdrop and the terrain (what must cover every pixel)
    const T = R.terrain;
    const terrainOnly = R._terrainOnly;
    R.render(1 / 60);
    const d = ctx.getImageData(0, 0, R.w, R.h).data;
    let n = 0;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 240 && d[i + 1] < 16 && d[i + 2] > 240) {
        n++;
        const px = (i / 4) % R.w;
        const py = Math.floor(i / 4 / R.w);
        bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py);
      }
    if (n) out.push({ at: [x, y], n, box: [bx0, by0, bx1, by1], cam: [R.cam.x, R.cam.y] });
  }
  return { spots: pts.length, bad: out };
});
console.log(`spots ${res.spots}, with uncovered pixels ${res.bad.length}`);
for (const b of res.bad.slice(0, 20)) console.log(JSON.stringify(b));
await browser.close();
