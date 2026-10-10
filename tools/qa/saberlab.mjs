// The four lightsaber looks (trail style x palette, src/gfx/saberStyle.js) side by side.
// Per look: a swing's start / middle / end on a dark floor, the middle on a bright floor,
// a clash; the game is frozen and stepped by hand so every look shows the same instant.
// Also times a frame (render + post-processing, GPU finished) per look and with the old look.
//   npx vite preview --port 4173 (build first); node tools/qa/saberlab.mjs [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/saberlab';
const url = process.env.URL || 'http://127.0.0.1:4173/';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const LOOKS = [
  ['tcw', 'tcw'],
  ['tcw', 'rots'],
  ['movie', 'tcw'],
  ['movie', 'rots'],
  ['old', null], // the game as it is (for the timing)
];
const timing = {};
for (const [trail, palette] of LOOKS) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ trail, palette }) => {
    localStorage.setItem('cw.saber', JSON.stringify(trail === 'old' ? { lab: false } : { trail, palette, lab: true }));
    const raf = window.requestAnimationFrame.bind(window);
    window.__stop = false;
    window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
    Math.random = (() => {
      let s = 11;
      return () => (s = (s * 16807) % 2147483647) / 2147483647;
    })();
  }, { trail, palette });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(1500);
  const name = trail === 'old' ? 'old' : `${trail}-${palette}`;

  // place: 'dark' (Christophsis, night) or 'bright' (the Jedi landing pad); clear the area
  const place = (where) =>
    page.evaluate((where) => {
      window.__stop = true;
      const g = __game;
      const p = g.player;
      // the game starts in the city hub (bright pad): only the night front needs a trip
      if (where === 'dark' && g.place !== 'christophsis') {
        g.travel('christophsis', g.places.christophsis.world.landing);
        // out on the dark crystal ground, short of the nearest camp
        const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        p.x = c.x - 9;
        p.y = c.y - 9;
      }
      const bn = document.querySelector('.banner');
      if (bn) bn.style.display = 'none';
      for (const u of g.activeUnits) if (u !== p && Math.hypot(u.x - p.x, u.y - p.y) < 6) u.hidden = true;
      p.setSaber(true);
      p.facing = Math.PI * 0.25; // the swing crosses the screen
      g.fx.parts.length = 0;
    }, where);
  // step the swing from its start to animation time T, rendering each 1/60 s (the trail builds up)
  const swingTo = (T) =>
    page.evaluate((T) => {
      const g = __game;
      const R = __renderer;
      const p = g.player;
      p.anim = 'attack1';
      p.animSpeed = 1;
      p.saberHist = null;
      p.saberTrail = null;
      p.trailUntil = 0;
      for (let t = 0; t <= T + 1e-6; t += 1 / 60) {
        p.animT = t;
        R.render(1 / 60);
      }
      R.post.render(0);
    }, T);
  const clip = () =>
    page.evaluate(() => {
      const R = __renderer;
      const g = __game;
      const cx = (R.w / 2 - R.drift.x) * R.scale;
      const cy = (R.h - (g.cinema ? 0 : R.consoleH) / R.scale) * 0.55 * R.scale;
      return { x: Math.round(cx - 110), y: Math.round(cy - 150), width: 220, height: 200 };
    });
  if (trail !== 'old') {
    await place('bright');
    await swingTo(0.29);
    await page.screenshot({ path: `${out}/${name}_bright_2mid.png`, clip: await clip() });
    await place('dark');
    for (const [k, T] of [['1start', 0.245], ['2mid', 0.29], ['3end', 0.4]]) {  // attack1: the cut is frames 5-7 (23 fps)
      await swingTo(T);
      await page.screenshot({ path: `${out}/${name}_dark_${k}.png`, clip: await clip() });
    }
    await swingTo(0.29);
    await page.screenshot({ path: `${out}/${name}_dark_wide.png`, clip: { ...(await clip()), x: (await clip()).x - 90, width: 400 } });
    // a clash at the blade's middle, the moment after contact
    await page.evaluate(() => {
      const R = __renderer;
      const p = __game.player;
      const f = p.frame();
      const b = f.markers.saberBase;
      const e = f.markers.saberTip;
      if (!b || !e) return;
      const W = R.w;
      const cx = W / 2 - R.drift.x;
      const cy = (R.h - R.consoleH / R.scale) * 0.55;
      const ctx = R.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      __saberStyle.drawClash(ctx, cx + (b[0] + e[0]) * 0.5, cy + (b[1] + e[1]) * 0.5, 0.8);
      R.post.render(0);
    });
    await page.screenshot({ path: `${out}/${name}_dark_clash.png`, clip: await clip() });
  }
  // timing: a frame (game render + post, GPU waited), the swing looping, on the dark floor
  await place('dark');
  timing[name] = await page.evaluate(() => {
    const R = __renderer;
    const p = __game.player;
    const gl = R.post.gl;
    const px = new Uint8Array(4);
    p.anim = 'attack1';
    const run = (n) => {
      const ms = [];
      for (let i = 0; i < n; i++) {
        p.animT = (i / 60) % 0.45;
        const t0 = performance.now();
        R.render(1 / 60);
        R.post.render(1 / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ms.push(performance.now() - t0);
      }
      ms.sort((a, b) => a - b);
      return ms;
    };
    run(60);
    const ms = run(240);
    // the saber pass alone (CPU side): drawSabers on its own
    const ctx = R.ctx;
    const t0 = performance.now();
    for (let i = 0; i < 240; i++) {
      p.animT = (i / 60) % 0.45;
      R.time += 1 / 60;
      ctx.globalCompositeOperation = 'lighter';
      R.drawSabers(ctx, R.cam, 1 / 60);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.getImageData(0, 0, 1, 1); // wait for the canvas's drawing to finish
    const sab = (performance.now() - t0) / 240;
    return { frameAvg: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2), frameP95: +ms[Math.floor(ms.length * 0.95)].toFixed(2), saberPassMs: +sab.toFixed(3) };
  });
  console.log(name, JSON.stringify(timing[name]), errs.length ? 'ERRORS ' + errs[0] : '');
  await page.close();
}
fs.writeFileSync(`${out}/timing.json`, JSON.stringify(timing, null, 1));
await browser.close();
