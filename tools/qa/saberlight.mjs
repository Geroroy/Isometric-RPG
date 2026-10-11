// Before/after shots of the lightsaber look and its light in play (same frozen instant in both
// builds): Anakin among droids on the night front — blade held, mid-swing — and on the bright pad.
//   node tools/qa/saberlight.mjs <out_dir> <label=url> [<label=url> ...]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
const builds = process.argv.slice(3).map((a) => a.split('='));
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [label, url] of builds) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ TRAIL, PALETTE }) => {
    process = { env: { TRAIL, PALETTE } };
    localStorage.setItem('cw.saber', JSON.stringify({ trail: process.env.TRAIL || 'tcw', palette: process.env.PALETTE || 'tcw', len: 1, glow: 1 }));
    const raf = window.requestAnimationFrame.bind(window);
    window.__stop = false;
    window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
    Math.random = (() => {
      let s = 5;
      return () => (s = (s * 16807) % 2147483647) / 2147483647;
    })();
  }, { TRAIL: process.env.TRAIL, PALETTE: process.env.PALETTE });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(1200);
  const shot = async (name, T, where, anim = 'attack1', color = null) => {
    await page.evaluate(({ T, where, anim, color }) => {
      window.__stop = true;
      const g = __game;
      const R = __renderer;
      const p = g.player;
      if (where === 'dark' && g.place !== 'christophsis') {
        g.travel('christophsis', g.places.christophsis.world.landing);
        const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        p.x = c.x - 4.5;
        p.y = c.y - 4.5;
        // two droids beside him, frozen (the active list is refreshed by the game's update, which is stopped)
        const ds = g.units.filter((u) => u.team === 'cis' && !u.dead && u.kind !== 'b2').slice(0, 2);
        for (const u of ds) if (!g.activeUnits.includes(u)) g.activeUnits.push(u);
        ds.forEach((u, i) => {
          u.x = p.x + (i ? 1.4 : -0.4);
          u.y = p.y + (i ? -0.3 : 1.5);
          u.facing = Math.atan2(p.y - u.y, p.x - u.x);
        });
      }
      const bn = document.querySelector('.banner');
      if (bn) bn.style.display = 'none';
      p.setSaber(true);
      p.saberColor = color || p.__ownColor || (p.__ownColor = p.saberColor);
      p.facing = Math.PI * 0.25;
      g.fx.parts.length = 0;
      p.anim = anim;
      p.animSpeed = 1;
      p.saberHist = null;
      p.saberTrail = null;
      p.trailUntil = 0;
      for (let t = 0; t <= T + 1e-6; t += 1 / 60) {
        p.animT = t;
        R.render(1 / 60);
      }
      R.post.render(0);
    }, { T, where, anim, color });
    const c = await page.evaluate(() => {
      const R = __renderer;
      const cx = (R.w / 2 - R.drift.x) * R.scale;
      const cy = (R.h - R.consoleH / R.scale) * 0.55 * R.scale;
      return { x: Math.round(cx - 200), y: Math.round(cy - 170), width: 400, height: 250 };
    });
    await page.screenshot({ path: `${out}/${label}_${name}.png`, clip: c });
  };
  await shot('bright_swing', 0.29, 'bright');
  await shot('dark_idle', 0.5, 'dark', 'idle');
  await shot('dark_swing', 0.29, 'dark');
  await shot('dark_end', 0.4, 'dark');
  await shot('dark_sig', 0.6, 'dark', 'sig'); // the Signature Move's spin cut (frames 9-13 at 20 fps)
  await shot('dark_red', 0.29, 'dark', 'attack1', [255, 50, 40]); // a red blade (Dooku's, the Sith)
  console.log(label, 'errors', errs.length, errs[0] || '');
  await page.close();
}
await browser.close();
