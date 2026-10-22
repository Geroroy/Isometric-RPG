// The device aspect-ratio check (ui/viewport.js, renderer.baseH): for PC monitors (16:9, 21:9, 32:9) and
// touch devices (a 4:3 tablet, a phone, a foldable's inner and cover screens, a phone held upright) — the
// view box (pillarboxed or not), the game view in game px and its aspect, the pixel scale, whether the
// "turn your phone" screen shows, that the console fills the box, and on PC that the mouse lands where it
// points: a real mouse move onto the player's feet (inside the box) must give back the player's tile.
// Saves a shot per device.
//   npm run dev; node tools/qa/aspect.mjs [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/aspect';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// name, css width, css height, dpr, touch
const DEVICES = [
  ['pc_16x9', 1920, 1080, 1, false],
  ['pc_21x9', 2560, 1080, 1, false],
  ['pc_32x9', 3840, 1080, 1, false],
  ['tablet_4x3', 1024, 768, 2, true],
  ['phone_s25u', 915, 412, 3.5, true],
  ['fold_inner', 830, 714, 2.6, true],
  ['fold_cover', 914, 373, 2.6, true],
  ['phone_upright', 412, 915, 3.5, true],
];
const only = process.argv[3] ? process.argv[3].split(',') : null;
for (const [name, w, h, dpr, touch] of DEVICES) {
  if (only && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  const rotate = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none');
  if (!rotate) {
    if (touch) await page.tap('#startBtn');
    else await page.click('#startBtn');
    await page.waitForTimeout(1500);
  }
  const r = await page.evaluate(() => {
    const r = __renderer;
    for (let i = 0; i < 10; i++) r.render(1 / 60);
    const b = document.body.getBoundingClientRect();
    const con = document.querySelector('.console');
    const cr = con && con.getClientRects().length ? con.getBoundingClientRect() : null;
    return {
      boxed: document.body.classList.contains('boxed'),
      body: [Math.round(b.left), Math.round(b.width)],
      console: cr ? [Math.round(cr.left), Math.round(cr.width)] : null,
      touch: r.touchMode,
      devScale: r.devScale,
      w: r.w,
      h: r.h,
      canvasCss: [r.canvas.style.width, r.canvas.style.height],
    };
  });
  let mouse = '-';
  if (!touch && !rotate) {
    const feet = await page.evaluate(() => {
      const r = __renderer;
      const p = __game.player;
      const left = document.body.getBoundingClientRect().left;
      return [left + ((p.x - p.y) * 20 - r.cam.x) * r.scale, ((p.x + p.y) * 10 - r.cam.y) * r.scale];
    });
    await page.mouse.move(feet[0], feet[1]);
    await page.waitForTimeout(150);
    mouse = await page.evaluate(() => {
      const p = __game.player;
      return Math.hypot(__game.mouseWorld.x - p.x, __game.mouseWorld.y - p.y).toFixed(3) + ' tiles';
    });
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(
    `${name.padEnd(14)} ${w}×${h}@${dpr} (${(w / h).toFixed(2)}) | rotate ${rotate} | boxed ${r.boxed} body x ${r.body[0]} w ${r.body[1]} | console ${r.console ? r.console.join(' w ') : '-'} | ` +
      `touch ${r.touch} scale ${r.devScale} view ${r.w}×${r.h} game px (${(r.w / r.h).toFixed(2)}) | mouse→feet ${mouse} | errors ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`,
  );
  await ctx.close();
}
await browser.close();
