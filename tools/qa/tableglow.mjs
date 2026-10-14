// A ground-layer piece's glow under the characters (renderer.js drawCityGlow / maskedGlow): Anakin in front of the
// conference table, its light strip behind his head; the scene frozen (frames, blades off, neon flicker, lights) and drawn with
// the glow's cut-out off, then on. Checked: within his sprite's opaque pixels the strip's light is gone (the
// picture darker there), and the rest of the table's picture is the same.
//
//   npm run dev   (in another terminal)
//   node tools/qa/tableglow.mjs [out_dir=tools/qa/out/tableglow] [url=http://localhost:5173/]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/tableglow', url = 'http://localhost:5173/'] = process.argv;
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers') ? findChrome('/opt/pw-browsers') : undefined);
fs.mkdirSync(out, { recursive: true });

function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    for (const p of [path.join(dir, d, 'chrome-linux', 'chrome'), path.join(dir, d, 'chrome-linux64', 'chrome')]) if (fs.existsSync(p)) return p;
  }
}

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url + '#duel-mustafar');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
for (let i = 0; i < 6 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
await page.evaluate(() => {
  for (const s of ['#hud', '#overlay']) {
    const e = document.querySelector(s);
    if (e) e.style.visibility = 'hidden';
  }
  const g = window.__game;
  g.player.x = 119.0; // in front of the table (along y at x 118), the strip behind his head
  g.player.y = 74.2;
  const ob = g.activeUnits.find((u) => u !== g.player && !u.dead);
  if (ob) {
    ob.x = 96; // (out of the shot: only Anakin covers the table)
    ob.y = 118;
  }
  g.camFocus = { x: 118.5, y: 74.5 };
  window.__renderer.setZoom(3);
});
await page.waitForTimeout(800);
// frozen: the units' frames (their blades off: a blade shimmers frame to frame), the duel, every neon's flicker and
// hum, the lights' flicker
await page.evaluate(() => {
  const g = window.__game;
  for (const u of g.activeUnits) u.saberLit = false;
  for (const u of g.activeUnits) {
    const f = u.frame();
    u.frame = () => f;
    u.update = () => {};
  }
  if (g.duel) g.duel.update = () => {};
  for (const p of g.world.props) if (p.layers && p.layers.meta && p.layers.meta.neon) p.layers = { ...p.layers, meta: { ...p.layers.meta, neon: { base: 1, hum: 0, speed: 0, flicker: { rate: 0, dur: [0, 0], level: 1 } } } };
  for (const l of g.world.lights) l.flicker = 0;
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const r = window.__renderer;
  r._cov = r.coversOf;
  r.coversOf = () => null;
});
await page.waitForTimeout(300);
const A = await page.screenshot({ path: path.join(out, 'unmasked.png') });
await page.evaluate(() => {
  const r = window.__renderer;
  r.coversOf = r._cov;
});
await page.waitForTimeout(300);
const B = await page.screenshot({ path: path.join(out, 'masked.png') });
// the player's opaque pixels on the screen (CSS px), and the two shots' brightness there and elsewhere
const res = await page.evaluate(
  async ([a, b]) => {
    const load = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const px = (img) => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const da = px(ia);
    const db = px(ib);
    const r = window.__renderer;
    const p = window.__game.player;
    const f = p.frame();
    const fc = document.createElement('canvas');
    fc.width = f.w;
    fc.height = f.h;
    const fx = fc.getContext('2d');
    fx.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    const fa = fx.getImageData(0, 0, f.w, f.h).data;
    const s = { x: (p.x - p.y) * 20, y: (p.x + p.y) * 10 - (p.z || 0) * 24.494897 };
    const k = f.k || 1;
    const x0 = Math.round(s.x - f.ox * k - r.cam.x);
    const y0 = Math.round(s.y - f.oy * k - r.cam.y);
    const S = r.scale;
    let inA = 0, inB = 0, n = 0;
    const inside = new Uint8Array(ia.width * ia.height);
    for (let v = 0; v < f.h; v++)
      for (let u = 0; u < f.w; u++) {
        if (fa[(v * f.w + u) * 4 + 3] < 250) continue;
        // (this game pixel's middle on the screen)
        const X = Math.floor((x0 + (u + 0.5) * k) * S);
        const Y = Math.floor((y0 + (v + 0.5) * k) * S);
        if (X < 0 || Y < 0 || X >= ia.width || Y >= ia.height) continue;
        const i = (Y * ia.width + X) * 4;
        inA += da[i] + da[i + 1] + da[i + 2];
        inB += db[i] + db[i + 1] + db[i + 2];
        inside[Y * ia.width + X] = 1;
        n++;
      }
    // elsewhere on the table: pixels within its picture, outside his sprite's box (± a game px), changed by more than 40
    let outside = 0;
    const mg = S + 2; // (a game px and two: his place on the screen rounded as the renderer does)
    const bx0 = Math.floor(x0 * S) - mg, by0 = Math.floor(y0 * S) - mg, bx1 = Math.ceil((x0 + f.w * k) * S) + mg, by1 = Math.ceil((y0 + f.h * k) * S) + mg;
    const t = window.__game.world.props.find((q) => q.sheet === 'mfTable_y');
    const tx0 = Math.max(0, Math.floor((t.rect[0] - r.cam.x) * S)), ty0 = Math.max(0, Math.floor((t.rect[1] - r.cam.y) * S));
    const tx1 = Math.min(ia.width, Math.ceil((t.rect[0] + t.rect[2] - r.cam.x) * S)), ty1 = Math.min(ia.height, Math.ceil((t.rect[1] + t.rect[3] - r.cam.y) * S));
    for (let Y = ty0; Y < ty1; Y++)
      for (let X = tx0; X < tx1; X++) {
        if (X >= bx0 && X <= bx1 && Y >= by0 && Y <= by1) continue;
        const i = (Y * ia.width + X) * 4;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 40) outside++;
      }
    return { n, meanUnmasked: inA / n / 3, meanMasked: inB / n / 3, outside };
  },
  [A.toString('base64'), B.toString('base64')],
);
console.log(JSON.stringify(res));
let fails = 0;
const check = (name, ok) => (console.log((ok ? 'ok   ' : 'FAIL ') + name), ok || fails++);
check('the strip no longer lights his body (darker inside his sprite)', res.meanMasked < res.meanUnmasked - 1);
check("the rest of the table's picture unchanged (no px off outside his box)", res.outside === 0);
console.log('errors', errs);
if (errs.length) fails++;
await browser.close();
process.exit(fails ? 1 : 0);
