// The blade's ignition frame by frame (docs/SABER_STYLE.md "점화"): Anakin on the night front
// beside two droids, the blade switched on, one crop per instant — the hilt spark, the core
// running out, the glow settling, with the floor and the droids flashing and settling.
//   TRAIL=tcw node tools/qa/saberignite.mjs <out_dir> [url]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
const url = process.argv[3] || 'http://127.0.0.1:4173/';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript((TRAIL) => {
  localStorage.setItem('cw.saber', JSON.stringify({ trail: TRAIL || 'tcw', len: 1, glow: 1 }));
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
  Math.random = (() => {
    let s = 5;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  })();
}, process.env.TRAIL);
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1200);
const TIMES = [0, 0.017, 0.05, 0.1, 0.15, 0.2, 0.27, 0.35, 0.5, 0.8];
for (const where of ['dark', 'bright']) {
  await page.evaluate((where) => {
    window.__stop = true;
    const g = __game;
    const p = g.player;
    if (where === 'dark' && g.place !== 'christophsis') {
      g.travel('christophsis', g.places.christophsis.world.landing);
      const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      p.x = c.x - 4.5;
      p.y = c.y - 4.5;
      const ds = g.units.filter((u) => u.team === 'cis' && !u.dead && u.kind !== 'b2').slice(0, 2);
      for (const u of ds) if (!g.activeUnits.includes(u)) g.activeUnits.push(u);
      ds.forEach((u, i) => {
        u.x = p.x + (i ? 1.0 : -0.9);
        u.y = p.y + (i ? -0.9 : 0.6);
        u.facing = Math.atan2(p.y - u.y, p.x - u.x);
        u.anim = 'idle';
      });
    }
    if (where === 'bright' && g.place !== 'hub') g.travel('hub', g.places.hub.world.landing);
    const bn = document.querySelector('.banner');
    if (bn) bn.style.display = 'none';
    p.facing = Math.PI * 0.25;
    p.anim = 'idle';
    p.animT = 0.3;
    p.saberHist = null;
    p.trailUntil = 0;
  }, where);
  // the blade off, a few frames settled, then on: render to each instant and crop
  for (const T of TIMES) {
    await page.evaluate((T) => {
      const g = __game;
      const R = __renderer;
      const p = g.player;
      p.saberLit = false;
      p.saberIgnite = false;
      p.wasLit = undefined;
      for (let i = 0; i < 3; i++) R.render(1 / 60);
      p.setSaber(true); // the real path (raises saberIgnite); the first render stamps T=0
      R.render(0);
      for (let t = 0; t < T - 1e-6; t += 1 / 120) R.render(1 / 120);
      R.post.render(0);
    }, T);
    const c = await page.evaluate(() => {
      const R = __renderer;
      const cx = (R.w / 2 - R.drift.x) * R.scale;
      const cy = (R.h - R.consoleH / R.scale) * 0.55 * R.scale;
      return { x: Math.round(cx - 110), y: Math.round(cy - 150), width: 220, height: 200 };
    });
    await page.screenshot({ path: `${out}/${where}_${T.toFixed(3)}.png`, clip: c });
  }
}
console.log('errors', errs.length, errs[0] || '');
fs.writeFileSync(`${out}/times.json`, JSON.stringify(TIMES));
await browser.close();
