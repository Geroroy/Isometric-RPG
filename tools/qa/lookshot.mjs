// The equipped outfit in game, close up: one shot per facing and pose, the HUD hidden,
// the camera at full zoom on the player in the plaza — for before/after model reviews.
//   npm run dev; node tools/qa/lookshot.mjs <out_dir> [look=tunic] [label=shot] [url]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/look', look = 'tunic', label = 'shot', url = 'http://127.0.0.1:5173/'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript((look) => {
  localStorage.setItem('cw.look', look);
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
}, look);
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);

// [name, facing (deg, world), animation, time into it (s), saber, zoom]
const POSES = [
  ['scene', 45, 'idle', 0.4, true, 1],
  ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => [`idleOff_${a}`, a, 'idleOff', 0.3, false, 2.5]),
  ['run_45', 45, 'run', 0.2, true, 2.5],
  ['run_225', 225, 'run', 0.2, true, 2.5],
  ['attack1_45', 45, 'attack1', 0.18, true, 2.5],
  ['cast_90', 90, 'cast', 0.3, true, 2.5],
];
for (const [name, deg, anim, t, saber, zoom] of POSES) {
  const box = await page.evaluate(
    ({ deg, anim, t, saber, zoom }) => {
      window.__stop = true;
      for (const el of document.querySelectorAll('body > *')) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas#world')) el.style.visibility = 'hidden';
      const g = __game;
      const p = g.player;
      __renderer.setZoom(zoom);
      p.x = g.world.spawn.x;
      p.y = g.world.spawn.y;
      p.path = null;
      if (p.saberOn !== saber) p.setSaber(saber);
      for (let i = 0; i < 120; i++) {
        g.update(1 / 60);
        __renderer.render(1 / 60);
      }
      p.facing = (deg * Math.PI) / 180;
      p.setAnim(anim, 1, true);
      p.animT = t;
      __renderer.render(0);
      __renderer.post.render(0);
      return [innerWidth, innerHeight];
    },
    { deg, anim, t, saber, zoom },
  );
  await page.waitForTimeout(250);
  const clip = zoom > 1 ? { x: box[0] / 2 - 170, y: box[1] / 2 - 250, width: 340, height: 360 } : undefined;
  await page.screenshot({ path: `${out}/${label}_${name}.png`, clip });
}
console.log('errors', errs.length, errs[0] || '');
await browser.close();
