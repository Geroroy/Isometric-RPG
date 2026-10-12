// The sky traffic as a viewer sees it (docs/prompts/sky_traffic_movie.md): step the game frame by frame
// at a rim with the sky in view, the camera still and then panning, log every drawn craft (its lane,
// place and repeat: a stable id) and count
//   pop      — a craft first drawn inside the view (not entering from off-screen)
//   reversal — a craft whose screen step turns back (zigzag)
//   facing   — a view whose nose is not the way it goes
//   overlap  — two craft of one lane drawn over each other
// and the craft visible per tier; frames saved every 0.5 s.
//   npm run dev; node tools/qa/skytraffic.mjs [out_dir] [query=?map=v2&proto=bg]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/skytraffic', query = '?map=v2&proto=bg'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
});
await page.goto((process.env.QA_URL || 'http://127.0.0.1:5173/') + query);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
// a spot by the rim with sky in view: the walkable point nearest the level's north-west corner
const spot = await page.evaluate(() => {
  const w = __game.world;
  const pts = w.walk.low;
  return pts.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a));
});
const res = {};
for (const phase of ['still', 'pan']) {
  const r = await page.evaluate(({ spot, phase }) => {
    window.__stop = true;
    for (const el of document.querySelectorAll('.banner')) el.style.display = 'none';
    const g = __game;
    const R = __renderer;
    const T = window.__skyTraffic;
    g.player.x = spot.x;
    g.player.y = spot.y;
    g.player.path = null;
    for (let i = 0; i < 30; i++) {
      g.update(1 / 60);
      R.render(1 / 60);
    }
    const tracks = {};
    const perTier = [0, 0, 0, 0];
    let frames = 0;
    let overlap = 0;
    for (let f = 0; f < 360; f++) {
      if (phase === 'pan') {
        g.player.x = spot.x + 6 * Math.sin(f / 60);
        g.player.y = spot.y + 3 * Math.sin(f / 45);
      }
      g.player.path = null;
      g.update(1 / 60);
      T.log = [];
      R.render(1 / 60);
      frames++;
      const camx = R.cam.x;
      const camy = R.cam.y;
      const lanes = {};
      for (const [id, sx, sy, view, dir, k] of T.log) {
        const ti = +id[0];
        if (sx > 0 && sx < R.w && sy > 0 && sy < R.h) perTier[ti]++;
        const tr = (tracks[id] ||= { pts: [], view, dir, k, ti });
        tr.pts.push([f, sx, sy, camx, camy]);
        const lk = id.split(':').slice(0, 2).join(':');
        (lanes[lk] ||= []).push([sx, k]);
      }
      for (const list of Object.values(lanes)) {
        list.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < list.length; i++) if (list[i][0] - list[i - 1][0] < (list[i][1] ? 60 * list[i][1] : 4)) overlap++;
      }
    }
    T.log = null;
    let pop = 0;
    let rev = 0;
    let facing = 0;
    const bad = [];
    for (const [id, t] of Object.entries(tracks)) {
      const [f0, x0, y0] = t.pts[0];
      if (f0 > 0 && x0 > 30 && x0 < R.w - 30 && y0 > 30 && y0 < R.h - 30) {
        pop++;
        if (bad.length < 5) bad.push(`pop ${id} at ${x0},${y0} frame ${f0}`);
      }
      // the step in tier space (the view's own move taken out): its x must keep one sign
      // in tier space (the view's own move taken out, exactly as drawn): the craft's x must not go
      // back by more than the half pixel of its rounding
      const f = [0.07, 0.11, 0.17, 0.3][t.ti];
      let far = null;
      for (const q of t.pts) {
        const X = q[1] + q[3] * f;
        if (far === null) far = X;
        if (t.dir > 0 ? X < far - 1.01 : X > far + 1.01) {
          rev++;
          if (bad.length < 10) bad.push(`reversal ${id} frame ${q[0]}: ${X.toFixed(2)} after ${far.toFixed(2)}`);
          far = X;
        }
        far = t.dir > 0 ? Math.max(far, X) : Math.min(far, X);
      }
      if (t.view && ((t.dir > 0) !== (t.view === 'SE' || t.view === 'NE'))) facing++;
    }
    return { frames, craft: Object.keys(tracks).length, visiblePerFrame: perTier.map((n) => +(n / frames).toFixed(1)), pop, rev, facing, overlap, bad };
  }, { spot, phase });
  res[phase] = r;
  console.log(`${phase}: ${r.craft} craft over ${r.frames} frames; visible per frame by tier (dots, 1/4, 1/2, full) ${r.visiblePerFrame.join(', ')}; pop ${r.pop}, reversals ${r.rev}, facing ${r.facing}, overlaps ${r.overlap}${r.bad.length ? '\n  ' + r.bad.join('\n  ') : ''}`);
}
// frames to look at, with the clock running
await page.evaluate(() => (window.__stop = false));
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/sky_${i}.png` });
}
for (let i = 0; i < 10; i++) await page.click('#zoomOut');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/sky_wide.png` });
console.log(`errors ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`);
await browser.close();
