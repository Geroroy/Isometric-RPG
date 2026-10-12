// Shots of the city beyond the platforms' edges, before and after the building-sheet backdrop
// prototype (?proto=bg): the reference screenshot's spot (by Figrin Dan, the undercity's west rim),
// the four edges of the map (the walkable points farthest along each world axis, on each level),
// a pan along an edge (every 5th frame, for the parallax), and the frame time (renderer.render +
// post, waited for with a 1-pixel read back; median of 60 frames after 180 to settle) at each spot.
//   npm run dev; node tools/qa/backdropshots.mjs <out_dir> [before|after|both] [width] [height]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/backdrop', which = 'both', W = '1920', H = '1080'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
const report = {};
for (const tag of which === 'both' ? ['before', 'after'] : [which]) {
  const page = await (await browser.newContext({ viewport: { width: +W, height: +H } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__stop = false;
    window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
  });
  await page.goto(base + (tag === 'after' ? '?proto=bg' : ''));
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(2500);
  // the spots: the reference shot's, and per level the walkable points farthest along each axis
  const spots = await page.evaluate(() => {
    const w = __game.world;
    const s = { reference: [115.5, 128.5] };
    for (const [lv, list] of [['up', w.walk.up], ['low', w.walk.low]]) {
      const by = (f) => list.reduce((a, b) => (f(b) < f(a) ? b : a));
      // world −x is the screen's upper left, +x lower right, −y upper right, +y lower left
      s[`${lv}_upperLeft`] = (({ x, y }) => [x + 1.5, y])(by((p) => p.x + Math.abs(p.y - 90) * 0.01));
      s[`${lv}_lowerRight`] = (({ x, y }) => [x - 1.5, y])(by((p) => -p.x));
      s[`${lv}_upperRight`] = (({ x, y }) => [x, y + 1.5])(by((p) => p.y));
      s[`${lv}_lowerLeft`] = (({ x, y }) => [x, y - 1.5])(by((p) => -p.y));
    }
    return s;
  });
  const res = {};
  for (const [name, [x, y]] of Object.entries(spots)) {
    const ms = await page.evaluate(
      ({ x, y }) => {
        window.__stop = true;
        for (const el of document.querySelectorAll('.banner')) el.style.display = 'none';
        const g = __game;
        const r = __renderer;
        g.player.x = x;
        g.player.y = y;
        g.player.path = null;
        const t = [];
        for (let i = 0; i < 240; i++) {
          g.update(1 / 60);
          const a = performance.now();
          r.render(1 / 60);
          r.post.render(1 / 60);
          r.ctx.getImageData(0, 0, 1, 1); // wait for the drawing itself, not only its recording
          if (i >= 180) t.push(performance.now() - a);
        }
        t.sort((a, b) => a - b);
        return +t[t.length >> 1].toFixed(2);
      },
      { x, y },
    );
    await page.screenshot({ path: `${out}/${tag}_${name}.png` });
    res[name] = ms;
  }
  // the reference spot again zoomed out a step (more of the drop in view)
  await page.evaluate(() => {
    document.getElementById('zoomOut').click();
    const g = __game;
    g.player.x = 115.5;
    g.player.y = 128.5;
    g.player.path = null;
    for (let i = 0; i < 60; i++) {
      g.update(1 / 60);
      __renderer.render(1 / 60);
    }
    __renderer.post.render(1 / 60);
  });
  await page.screenshot({ path: `${out}/${tag}_reference_wide.png` });
  // a pan: the player walked along the undercity's west rim, every 5th frame shot
  await page.evaluate(() => {
    const g = __game;
    g.player.x = 104;
    g.player.y = 126;
  });
  for (let f = 0; f < 40; f++) {
    await page.evaluate((f) => {
      const g = __game;
      g.player.x = 104 + f * 0.18;
      g.player.y = 126 - f * 0.18;
      g.player.path = null;
      g.update(1 / 60);
      __renderer.render(1 / 60);
      __renderer.post.render(1 / 60);
    }, f);
    if (f % 5 === 0) await page.screenshot({ path: `${out}/${tag}_pan_${String(f).padStart(2, '0')}.png` });
  }
  report[tag] = { ms: res, errors: errs };
  console.log(tag, JSON.stringify(res), 'errors', errs.length, errs[0] || '');
  await page.context().close();
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
