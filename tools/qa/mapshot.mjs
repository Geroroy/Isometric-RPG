// The whole Mustafar duel map stitched from shots at a zoom, the UI hidden (docs/images/mustafar_map*.png):
// the camera walked over the map's region in steps of the view, each frame taken from the live loop
// (the loop running: the lava moves, the post pass draws the frame) and clipped to the canvas, then pasted by its camera offset.
//
//   npm run dev   (in another terminal)
//   node tools/qa/mapshot.mjs [out=tools/qa/out/mapshot/map.png] [x0,y0,x1,y1 = the ground's box] [zoom=1] [url]
//   options: --at=x,y   the player stood there first (the room it is in opens as it does in play)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opts = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [out = 'tools/qa/out/mapshot/map.png', box = '', zoomS = '1', url = 'http://127.0.0.1:5173/'] = args;
const zoom = +zoomS;
fs.mkdirSync(path.dirname(out), { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
});
await page.goto(url + '#duel-mustafar-legacy');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
for (let i = 0; i < 8 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
await page.waitForTimeout(500);
// the ground's box: the tiles that are not lava, with a margin
const region = box
  ? box.split(',').map(Number)
  : await page.evaluate(() => {
      const w = window.__game.world;
      let x0 = w.w, y0 = w.h, x1 = 0, y1 = 0;
      for (let y = 0; y < w.h; y++)
        for (let x = 0; x < w.w; x++) {
          if (w.biome[y * w.w + x] === 9) continue; // (BIOME.LAVA)
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
        }
      return [x0 - 6, y0 - 6, x1 + 6, y1 + 6];
    });
const [rx0, ry0, rx1, ry1] = region;
const at = opts.at ? opts.at.split(',').map(Number) : null;
const info = await page.evaluate(
  ({ zoom, at }) => {
    document.body.classList.add('ui-hidden');
    for (const el of document.querySelectorAll('body > *')) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
    const g = window.__game;
    const r = window.__renderer;
    // the duel's clock stopped: no scene takes the camera or fades the screen while the shots are taken
    if (g.duel) { g.duel.started = false; g.cinema = null; }
    r.setZoom(zoom, true);
    if (at) { g.player.x = at[0]; g.player.y = at[1]; g.player.path = null; }
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    r.render(1 / 60);
    const c = r.canvas.getBoundingClientRect();
    return { w: r.w, h: r.h, scale: r.scale, consoleH: r.consoleH, canvas: { x: c.x, y: c.y, w: c.width, h: c.height } };
  },
  { zoom, at }
);
// screen px of the region's corners (iso: x' = (x - y) 20, y' = (x + y) 10)
const sx0 = (rx0 - ry1) * 20, sx1 = (rx1 - ry0) * 20, sy0 = (rx0 + ry0) * 10, sy1 = (rx1 + ry1) * 10 + 120;
const stepX = Math.floor(info.w * 0.9), stepY = Math.floor(info.h * 0.8);
const tiles = [];
let n = 0;
for (let cy = sy0; cy < sy1; cy += stepY)
  for (let cx = sx0; cx < sx1; cx += stepX) {
    // the camera: render() puts the focus at (W/2, viewH 0.55) — ask for the focus that lands cam at (cx, cy)
    await page.evaluate(
      ({ cx, cy }) => {
        const g = window.__game;
        const r = window.__renderer;
        const viewH = r.h - r.consoleH / r.scale;
        const px = cx + r.w / 2, py = cy + viewH * 0.55;
        // worldToScreen inverse: x' = (x - y) 20, y' = (x + y) 10
        const fx = (px / 20 + py / 10) / 2, fy = (py / 10 - px / 20) / 2;
        g.camFocus = { x: fx, y: fy };
        g.fx.shakeAmt = 0;
      },
      { cx, cy }
    );
    await page.waitForTimeout(150);
    const cam = await page.evaluate(() => ({ x: window.__renderer.cam.x, y: window.__renderer.cam.y }));
    const file = path.join(path.dirname(out), `tile_${String(n++).padStart(3, '0')}.png`);
    await page.screenshot({ path: file, clip: { x: info.canvas.x, y: info.canvas.y, width: info.canvas.w, height: info.canvas.h } });
    tiles.push({ file, cam, w: info.w, h: info.h });
  }
fs.writeFileSync(path.join(path.dirname(out), 'tiles.json'), JSON.stringify({ scale: info.scale, w: info.w, h: info.h, region, tiles, errs }, null, 1));
console.log(JSON.stringify({ tiles: tiles.length, scale: info.scale, w: info.w, h: info.h, region, errs }));
await browser.close();
