// How much of the player shows on every walkable tile of the hub (the rebuilt map promises: all of him,
// give or take a sliver — tools/maps/undercity_v2.py closes where something would hide him). Per tile the
// frame is drawn with him and without him; the pixels that change over his body (above his feet, the
// shadow left out) against the pixels of his own sprite give the share in view.
//   node tools/qa/visibility.mjs [url] [step=2]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:5173/?map=v2&proto=bg', step = '2'] = process.argv;
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
const res = await page.evaluate(async (step) => {
  const R = __renderer;
  const g = __game;
  const w = g.world;
  const p = g.player;
  // the crowd stays home (only the player and the buildings matter here)
  for (const u of g.units) if (u !== p) u.hidden = true;
  // the player as a flat magenta cut-out (his dark clothes at night are near the floor's colour)
  const flat = document.createElement('canvas');
  const drawUnit = R.drawUnit.bind(R);
  R.drawUnit = (u) => {
    if (u !== p) return drawUnit(u);
    const f = u.frame();
    flat.width = f.w;
    flat.height = f.h;
    const x = flat.getContext('2d');
    x.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ff00ff';
    x.fillRect(0, 0, f.w, f.h);
    R.smooth(false);
    R.ctx.drawImage(flat, Math.round(u.x * 20 - u.y * 20 - f.ox - R.cam.x), Math.round((u.x + u.y) * 10 - f.oy - R.cam.y));
  };
  R.relight = false;
  const who = (px, py) => {
    // the props drawn after him whose rectangle overlaps his body
    const s = [(px - py) * 20, (px + py) * 10];
    return w.props.filter((pr) => !pr.flat && pr.rect && pr.drawDepth > p.drawDepth && s[0] > pr.rect[0] && s[0] < pr.rect[0] + pr.rect[2] && s[1] - 40 < pr.rect[1] + pr.rect[3] && s[1] > pr.rect[1]).map((pr) => pr.sheet || pr.type);
  };
  const own = (f) => {
    const c = document.createElement('canvas');
    c.width = f.w;
    c.height = f.h;
    const x = c.getContext('2d');
    x.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    const d = x.getImageData(0, 0, f.w, f.h).data;
    let n = 0;
    for (let y = 0; y < f.h - 6; y++) for (let xx = 0; xx < f.w; xx++) if (d[(y * f.w + xx) * 4 + 3] > 128) n++;
    return n;
  };
  const bad = [];
  let n = 0;
  for (let y = 0; y < w.h; y += step)
    for (let x = 0; x < w.w; x += step) {
      if (w.blocked[y * w.w + x]) continue;
      p.x = x + 0.5;
      p.y = y + 0.5;
      p.path = null;
      p.hidden = false;
      R.render(0);
      const f = p.frame();
      const sx = Math.round(p.x * 20 - p.y * 20 - f.ox - R.cam.x);
      const sy = Math.round((p.x + p.y) * 10 - f.oy - R.cam.y);
      if (sx < 0 || sy < 0 || sx + f.w > R.w || sy + f.h > R.h) continue;
      const a = R.ctx.getImageData(sx, sy, f.w, f.h - 6).data;
      p.hidden = true;
      R.render(0);
      const b = R.ctx.getImageData(sx, sy, f.w, f.h - 6).data;
      p.hidden = false;
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) diff++;
      const share = diff / Math.max(1, own(f));
      n++;
      if (share < 0.6) bad.push([x, y, +share.toFixed(2), who(p.x, p.y).join(',')]);
    }
  return { n, bad };
}, +step);
console.log(`tiles ${res.n}; the player less than 60% in view on ${res.bad.length}`);
for (const b of res.bad.slice(0, 40)) console.log('  ', JSON.stringify(b));
await browser.close();
