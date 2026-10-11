// How far out the view can go (docs/prompts/zoom_out_sightseeing.md), by visible game-pixel rows R:
//   pop     — units drawn or dropped inside the visible view as they become active or not, with the
//             game's activation (game.updateActive: 34 tiles round the player, or in the renderer's
//             view). The player sweeps each world along both axes; every frame gets the camera and
//             the view rect the renderer would use at that R (game.viewRect set the same way).
//   active  — the most units acting at once on the sweep (what a wide view costs the simulation)
//   seen    — share of the level's floor in view at a central spot (each level), off — share of the
//             view off the level
//   ms      — the real frame loop's median frame time at R on a 1920×1080 window (no read-backs),
//             against R = 360
//   npm run dev; node tools/qa/zoomout.mjs [out_dir]   (QA_URL for another server)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/zoomout';
fs.mkdirSync(out, { recursive: true });
const RUNS = [
  ['16:9', 1920, 1080, [360, 540, 640, 720, 900, 1080]],
  ['21:9', 2560, 1080, [720, 1080]],
  ['4:3', 1440, 1080, [1080]],
];
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
await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
const consoleH = await page.evaluate(() => __renderer.consoleH);

const sweep = (an, aw, ah, R, gap) =>
  page.evaluate(
    ({ an, aw, ah, R, gap, consoleH }) => {
      window.__stop = true;
      const g = __game;
      const r = __renderer;
      const p = g.player;
      const W0 = g.world;
      const MAP = 192;
      let x0 = MAP, y0 = MAP, x1 = 0, y1 = 0;
      for (let y = 0; y < MAP; y++)
        for (let x = 0; x < MAP; x++)
          if (W0.biomeAt(x, y) !== 13) {
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
      const W = Math.ceil((R * aw) / ah);
      const H = R;
      const viewH = H - (consoleH * R) / ah;
      const camOf = () => {
        const ps = { x: (p.x - p.y) * 20, y: (p.x + p.y) * 10 - p.z * 0.4 * 24.49 };
        const cr = W0.camRegions && r.camRegion(W0.camRegions, p);
        if (cr) {
          const cl = (q, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, q)));
          ps.x = cl(ps.x, (cr.x0 - cr.y1) * 20 + W * 0.22, (cr.x1 - cr.y0) * 20 - W * 0.22);
          ps.y = cl(ps.y, (cr.x0 + cr.y0) * 10 + viewH * 0.24, (cr.x1 + cr.y1) * 10 - viewH * 0.3);
        }
        return { x: Math.round(ps.x - W / 2), y: Math.round(ps.y - viewH * 0.55) };
      };
      const box = (u) => {
        const f = u.frame && u.frame();
        const sx = (u.x - u.y) * 20;
        const sy = (u.x + u.y) * 10 - (u.z || 0) * 24.49;
        const hw = f ? Math.max(10, f.w / 2) : 20;
        const h = f ? f.h : 60;
        return [sx - hw, sy - h, sx + hw, sy + 4];
      };
      let pop = 0;
      let cut = 0; // pops on a frame the camera jumped (the region clamp switching)
      let jumps = 0; // frames the camera moved more than the player could (> 12 px)
      const jumpAt = [];
      let frames = 0;
      let maxActive = 0;
      const bad = [];
      for (const [ax, ay, bx, by] of [
        ...Array.from({ length: Math.floor((y1 - y0 - 8) / gap) + 1 }, (_, i) => [x0, y0 + 4 + i * gap, x1, y0 + 4 + i * gap]),
        ...Array.from({ length: Math.floor((x1 - x0 - 8) / gap) + 1 }, (_, i) => [x0 + 4 + i * gap, y0, x0 + 4 + i * gap, y1]),
      ]) {
        const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25);
        let prev = null;
        let pc = null;
        for (let i = 0; i <= n; i++) {
          p.x = ax + ((bx - ax) * i) / n;
          p.y = ay + ((by - ay) * i) / n;
          p.path = null;
          p.hp = p.maxHp;
          const c = camOf();
          g.viewRect = [c.x - 90, c.y - 24, c.x + W + 90, c.y + H + 260]; // as renderer.render sets it
          g.update(1 / 60);
          if (g.cinema || g.camFocus || g.world !== W0) { prev = null; continue; }
          frames++;
          const jumped = pc && Math.hypot(c.x - pc.x, c.y - pc.y) > 12;
          if (jumped) {
            jumps++;
            if (jumpAt.length < 4) jumpAt.push(`${p.x.toFixed(0)},${p.y.toFixed(0)} by ${Math.round(Math.hypot(c.x - pc.x, c.y - pc.y))}px`);
          }
          pc = c;
          const now = new Set(g.activeUnits);
          maxActive = Math.max(maxActive, now.size);
          if (prev) {
            const alive = new Set(g.units);
            for (const u of new Set([...prev, ...now])) {
              if (prev.has(u) === now.has(u) || !alive.has(u) || u.dead || u.hidden || u === p) continue;
              const b = box(u);
              if (b[2] > c.x && b[0] < c.x + W && b[3] > c.y && b[1] < c.y + viewH) {
                if (jumped) {
                  cut++;
                  continue;
                }
                pop++;
                if (bad.length < 3) bad.push(`${u.name || u.kind} ${now.has(u) ? 'in' : 'out'} at ${u.x.toFixed(0)},${u.y.toFixed(0)}`);
              }
            }
          }
          prev = now;
        }
      }
      g.viewRect = null;
      return { an, R, W, H, pop, cut, jumps, jumpAt, frames, maxActive, bad };
    },
    { an, aw, ah, R, gap, consoleH },
  );

// share of a level in view at a spot, and of the view off the level
const seen = (R, aw, ah, spot, lv) =>
  page.evaluate(
    ({ R, aw, ah, spot, lv, consoleH }) => {
      const w = __game.world;
      const W = (R * aw) / ah;
      const viewH = R - (consoleH * R) / ah;
      const cx = (spot[0] - spot[1]) * 20;
      const cy = (spot[0] + spot[1]) * 10;
      const vx0 = cx - W / 2;
      const vy0 = cy - viewH * 0.55;
      let tot = 0;
      let inv = 0;
      for (let y = 0; y < 192; y++)
        for (let x = 0; x < 192; x++) {
          if (w.biomeAt(x, y) === 13) continue;
          if (lv === 'up' && y >= 90) continue;
          if (lv === 'low' && y < 90) continue;
          tot++;
          const sx = (x + 0.5 - (y + 0.5)) * 20;
          const sy = (x + y + 1) * 10;
          if (sx > vx0 && sx < vx0 + W && sy > vy0 && sy < vy0 + viewH) inv++;
        }
      let off = 0;
      for (let gy = 0; gy < 12; gy++)
        for (let gx = 0; gx < 20; gx++) {
          const sx = vx0 + ((gx + 0.5) * W) / 20;
          const sy = vy0 + ((gy + 0.5) * viewH) / 12;
          const wx = (sx / 20 + sy / 10) / 2;
          const wy = (sy / 10 - sx / 20) / 2;
          if (wx < 0 || wy < 0 || wx >= 192 || wy >= 192 || w.biomeAt(wx, wy) === 13) off++;
        }
      return { seen: +(inv / tot).toFixed(2), off: +(off / 240).toFixed(2) };
    },
    { R, aw, ah, spot, lv, consoleH },
  );

const rows = [];
for (const [an, aw, ah, Rs] of RUNS)
  for (const R of Rs) {
    const cor = await sweep(an, aw, ah, R, 12);
    const up = await seen(R, aw, ah, [96, 72], 'up');
    const low = await seen(R, aw, ah, [98, 114], 'low');
    rows.push({ an, R, cor, up, low });
    console.log(`coruscant ${an} R${R} (${cor.W}×${cor.H}): pop ${cor.pop} (+${cor.cut} on camera jumps; ${cor.jumps} jumps ${cor.jumpAt.join(' ')}) over ${cor.frames} frames, active ≤ ${cor.maxActive}; plaza seen ${up.seen} off ${up.off}; undercity seen ${low.seen} off ${low.off}${cor.bad.length ? ' | ' + cor.bad.join('; ') : ''}`);
  }
// frame time in the real loop, by R (1920×1080), at the plaza and the undercity
const perf = {};
for (const R of process.env.NO_PERF ? [] : [360, 540, 720, 900, 1080]) {
  for (const [spot, x, y] of [['plaza', 96, 72], ['undercity', 98, 114]]) {
    await page.evaluate(({ R, x, y }) => {
      const r = __renderer;
      r.computeDevScale = () => (innerHeight * devicePixelRatio) / R;
      r.resize();
      const g = __game;
      g.player.x = x;
      g.player.y = y;
      g.player.path = null;
      window.__stop = false;
    }, { R, x, y });
    await page.waitForTimeout(5000);
    const ms = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; __game.player.path = null; if (t.length < 60) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res(+t[30].toFixed(1)); } }; requestAnimationFrame(f); }));
    (perf[R] ||= {})[spot] = ms;
  }
  console.log(`frame R${R}: ${JSON.stringify(perf[R])}`);
}
// Christophsis: the widest view, the sweep (its camps) and the share in view
await page.evaluate(() => { window.__stop = false; __game.travel('christophsis', __game.places.christophsis.world.landing); });
await page.waitForTimeout(3000);
for (let i = 0; i < 6 && (await page.evaluate(() => !!__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
for (const R of [540, 1080]) {
  const ch = await sweep('16:9', 1920, 1080, R, 24);
  console.log(`christophsis 16:9 R${R}: pop ${ch.pop} (+${ch.cut} on ${ch.jumps} camera jumps) over ${ch.frames} frames, active ≤ ${ch.maxActive}${ch.bad.length ? ' | ' + ch.bad.join('; ') : ''}`);
  rows.push({ an: '16:9', R, chr: ch });
}
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ rows, perf, errors: errs }, null, 1));
console.log('errors', errs.length, errs[0] || '');
await browser.close();
