// Play the city's air traffic like a player watching it, and measure what looks wrong: at a spot,
// step the game frame by frame (1/60 s), log every lane car's drawn screen position, and count
//   pop-ins  — a car first drawn well inside the view (it should come in from off-screen),
//   reversals — a car whose step on screen turns back on x or y (zigzag / jitter),
//   stalls    — a moving car not moving on screen for many frames, then jumping;
// and save a strip of frames (every 6th) of the view to look at the motion.
//   npm run dev; node tools/qa/trafficplay.mjs <out_dir> [spot=terrace] [seconds=6]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/trafficplay', spot = 'terrace', secs = '6'] = process.argv;
const SPOTS = { terrace: [96, 76], corner_se: [122, 77], plaza: [98, 112], lift: [84, 101], west_alley: [76, 114], pad: [112, 62] };
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : cb(t)));
});
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
const [sx, sy] = SPOTS[spot] || SPOTS.terrace;
await page.evaluate(({ sx, sy }) => {
  window.__stop = true;
  for (const el of document.querySelectorAll('.banner')) el.style.display = 'none';
  const g = __game;
  g.player.x = sx;
  g.player.y = sy;
  g.player.path = null;
  for (let i = 0; i < 60; i++) {
    g.update(1 / 60);
    __renderer.render(1 / 60);
  }
  window.__ids = new WeakMap();
  window.__nid = 0;
  window.__tracks = {};
}, { sx, sy });
const frames = Math.round(+secs * 60);
for (let f = 0; f < frames; f++) {
  await page.evaluate((f) => {
    const g = __game;
    const r = __renderer;
    g.player.path = null;
    g.update(1 / 60);
    r.render(1 / 60);
    (window.__cams ||= []).push([f, r.cam.x, r.cam.y]);
    if (!r.lanes) return;
    for (const kind of ['drop', 'over'])
      for (const it of r.lanes.visible(kind, r.cam, r.w, r.h)) {
        const c = it[4];
        let id = __ids.get(c);
        if (id === undefined) __ids.set(c, (id = __nid++));
        // in world-fixed screen pixels (the view's own moves taken out), so a camera nudge is not counted
        (__tracks[id] ||= { kind, pts: [] }).pts.push([f, Math.round(it[1]) + r.cam.x, Math.round(it[2]) + r.cam.y]);
      }
  }, f);
  if (f % 6 === 0) {
    await page.evaluate(() => __renderer.post.render(0));
    await page.screenshot({ path: `${out}/${spot}_${String(f).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: 1280, height: 590 } });
  }
}
const res = await page.evaluate(() => {
  const cams = window.__cams || [];
  let camMoves = 0;
  for (let i = 1; i < cams.length; i++) if (cams[i][1] !== cams[i - 1][1] || cams[i][2] !== cams[i - 1][2]) camMoves++;
  const W = __renderer.w;
  const H = __renderer.h;
  let pop = 0;
  let rev = 0;
  let stall = 0;
  const bad = [];
  for (const [id, t] of Object.entries(__tracks)) {
    const p = t.pts;
    const [f0, x0, y0] = p[0];
    const c0 = cams.find((c) => c[0] === f0) || [0, 0, 0];
    const vx0 = x0 - c0[1];
    const vy0 = y0 - c0[2];
    if (f0 > 0 && vx0 > 50 && vx0 < W - 50 && vy0 > 50 && vy0 < H - 50) {
      pop++;
      bad.push(`pop ${t.kind} #${id} at ${vx0},${vy0} frame ${f0}`);
    }
    let sdx = 0;
    let sdy = 0;
    let still = 0;
    for (let i = 1; i < p.length; i++) {
      if (p[i][0] !== p[i - 1][0] + 1) continue; // left the view and came back
      const dx = p[i][1] - p[i - 1][1];
      const dy = p[i][2] - p[i - 1][2];
      if ((dx && sdx && Math.sign(dx) !== sdx) || (dy && sdy && Math.sign(dy) !== sdy)) {
        rev++;
        if (bad.length < 40) bad.push(`reversal ${t.kind} #${id} frame ${p[i][0]}: step ${dx},${dy}`);
      }
      if (dx) sdx = Math.sign(dx);
      if (dy) sdy = Math.sign(dy);
      still = dx || dy ? 0 : still + 1;
      if (still === 20) stall++;
    }
  }
  const paths = Object.entries(__tracks).map(([id, t]) => `${t.kind} #${id}: ${t.pts[0].slice(1).join(',')} -> ${t.pts[t.pts.length - 1].slice(1).join(',')} (${t.pts.length} frames)`);
  return { cars: Object.keys(__tracks).length, view: [W, H], camMoves, pop, rev, stall, bad, paths };
});
console.log(`TRAFFIC ${spot}: ${res.cars} cars seen, ${res.pop} pop-ins, ${res.rev} reversals, ${res.stall} stalls (camera moved ${res.camMoves} frames); errors ${errs.length}`);
for (const b of res.bad.slice(0, 20)) console.log('  ' + b);
fs.writeFileSync(`${out}/${spot}_tracks.json`, JSON.stringify(res, null, 1));
await browser.close();
