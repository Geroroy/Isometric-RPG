// The whole scales the player can reach on each screen (renderer VIEW_LIMITS): zoom out with the −
// button to the end, then in with + to the end, logging scale, game view (w × h) and the character's
// height in css px; and the view at the far ends saved as shots.
//   npm run dev; node tools/qa/zoomsteps.mjs [out_dir]   (QA_URL for another server)
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/zoomsteps';
fs.mkdirSync(out, { recursive: true });
const SCREENS = [
  ['1366x768', { viewport: { width: 1366, height: 768 } }],
  ['1536x864@1.25 (1080p laptop 125%)', { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 }],
  ['1920x1080', { viewport: { width: 1920, height: 1080 } }],
  ['2560x1080 (21:9)', { viewport: { width: 2560, height: 1080 } }],
  ['2560x1440', { viewport: { width: 2560, height: 1440 } }],
  ['3840x2160', { viewport: { width: 3840, height: 2160 } }],
  ['phone 915x412@3.5 (S25 Ultra)', { ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true }],
];
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, opts] of SCREENS) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  if (opts.hasTouch) await page.tap('#startBtn');
  else await page.click('#startBtn');
  await page.waitForTimeout(1500);
  const st = () => page.evaluate(() => { const r = __renderer; return { s: r.devScale, w: r.w, h: r.h, ch: Math.round(52 * r.scale), touch: r.touchMode }; });
  const d = await st();
  const press = (dirn) => page.evaluate((dirn) => { const b = document.getElementById(dirn > 0 ? 'zoomIn' : 'zoomOut'); b.click(); }, dirn);
  for (let i = 0; i < 14; i++) await press(-1);
  await page.waitForTimeout(200);
  const lo = await st();
  await page.screenshot({ path: `${out}/${name.split(' ')[0]}_out.png` });
  const seq = [lo];
  for (let i = 0; i < 16; i++) {
    await press(1);
    const s = await st();
    if (s.s === seq[seq.length - 1].s) break;
    seq.push(s);
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/${name.split(' ')[0]}_in.png` });
  console.log(`${name}${d.touch ? ' [touch]' : ''}: default ${d.s}× ${d.w}×${d.h} | steps ${seq.map((s) => `${s.s}× ${s.w}×${s.h} (char ${s.ch}px)`).join(' → ')}${errs.length ? ' | errors ' + errs[0] : ''}`);
  await ctx.close();
}
await browser.close();
