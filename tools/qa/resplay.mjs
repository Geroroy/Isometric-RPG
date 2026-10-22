// Play the PC view at one window size like a player: click-move the player with the real mouse to a few
// points, logging every rendered frame's player screen position (jitter, the view's follow, where it
// stops against the click), then zoom with the wheel notch by notch, checking each notch changes the
// whole scale and the player stays put on screen; saves a strip of frames of each.
//   npm run dev; node tools/qa/resplay.mjs [out_dir] [width] [height] [dpr]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/resplay', W = '1920', H = '1080', DPR = '1'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2000);
// log each rendered frame: the player's feet on screen (css px), the view, the scale
await page.evaluate(() => {
  const r = __renderer;
  const render = r.render.bind(r);
  window.__log = [];
  r.render = (dt) => {
    render(dt);
    const p = __game.player;
    __log.push([performance.now(), ((p.x - p.y) * 20 - r.cam.x) * r.scale, ((p.x + p.y) * 10 - r.cam.y) * r.scale, r.cam.x, r.cam.y, r.devScale, p.x, p.y]);
  };
});
const res = { size: `${W}x${H}@${DPR}`, moves: [], zoom: [] };
// click-moves: a point on screen off the player in four directions
const targets = [[0.72, 0.45], [0.3, 0.38], [0.42, 0.68], [0.6, 0.6]];
let k = 0;
for (const [fx, fy] of targets) {
  const cx = Math.round(+W * fx);
  let cy = Math.round(+H * fy);
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(120);
  // a click on a unit talks or attacks: nudge the point off any unit under it
  for (let t = 0; t < 6 && (await page.evaluate(() => !!__game.hover)); t++) {
    await page.mouse.move(cx, (cy += 40));
    await page.waitForTimeout(80);
  }
  const want = await page.evaluate(() => [__game.mouseWorld.x, __game.mouseWorld.y]);
  await page.evaluate(() => (__log.length = 0));
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/move${k}_${i}.png` });
  }
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const L = __log;
    let rev = 0;
    let maxStep = 0;
    let sdx = 0;
    let sdy = 0;
    // the player on screen against the world (screen x without the view's moves)
    for (let i = 1; i < L.length; i++) {
      const dx = L[i][1] + L[i][3] * (L[i][5] / devicePixelRatio) - (L[i - 1][1] + L[i - 1][3] * (L[i - 1][5] / devicePixelRatio));
      const dy = L[i][2] + L[i][4] * (L[i][5] / devicePixelRatio) - (L[i - 1][2] + L[i - 1][4] * (L[i - 1][5] / devicePixelRatio));
      if ((Math.abs(dx) > 0.5 && sdx && Math.sign(dx) !== sdx) || (Math.abs(dy) > 0.5 && sdy && Math.sign(dy) !== sdy)) rev++;
      if (Math.abs(dx) > 0.5) sdx = Math.sign(dx);
      if (Math.abs(dy) > 0.5) sdy = Math.sign(dy);
      maxStep = Math.max(maxStep, Math.hypot(dx, dy));
    }
    // how far the player drifts from the screen centre while the view follows
    const off = L.map((l) => Math.hypot(l[1] - innerWidth / 2, l[2] - innerHeight / 2));
    const last = L[L.length - 1];
    return { frames: L.length, rev, maxStep: +maxStep.toFixed(1), maxOff: Math.round(Math.max(...off)), endOff: Math.round(off[off.length - 1]), end: [+last[6].toFixed(2), +last[7].toFixed(2)] };
  });
  m.want = want.map((v) => +v.toFixed(2));
  m.err = +Math.hypot(m.end[0] - want[0], m.end[1] - want[1]).toFixed(2);
  res.moves.push(m);
  k++;
}
res.dialogue = await page.evaluate(() => __dialogue.isOpen);
// wheel zoom: out to the end, then in to the end — over open floor, clear of the player
await page.mouse.move(Math.round(+W * 0.2), Math.round(+H * 0.25));
const state = () => page.evaluate(() => { const p = __game.player; const r = __renderer; return { s: r.devScale, w: r.w, h: r.h, z: +r.zoom.toFixed(2), px: Math.round(((p.x - p.y) * 20 - r.cam.x) * r.scale), py: Math.round(((p.x + p.y) * 10 - r.cam.y) * r.scale) }; });
let n = 0;
for (const dy of [...Array(6).fill(120), ...Array(12).fill(-120)]) {
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(400);
  const s = await state();
  res.zoom.push(`${dy > 0 ? '−' : '+'} ${s.s}× ${s.w}×${s.h} z${s.z} player@${s.px},${s.py}`);
  await page.screenshot({ path: `${out}/zoom${String(n++).padStart(2, '0')}.png` });
}
await page.keyboard.press('0');
await page.waitForTimeout(400);
res.reset = await state();
res.saved = await page.evaluate(() => localStorage.getItem('cw.zoom.desktop.v2'));
res.errors = errs;
console.log(JSON.stringify(res, null, 1));
await browser.close();
