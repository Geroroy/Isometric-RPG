// Measure what bounds the view's zoom (docs/prompts/zoom_limits.md), by visible game-pixel rows R:
//   pop   — units drawn or dropped inside the visible view (above the console) because they cross the
//           units' activation box (game.js: |dx|,|dy| < 34 around the player). The player sweeps each
//           world in straight lines along both world axes while the game runs; every frame, each R and
//           aspect gets the camera the renderer would use (its level clamp included), so one walk
//           measures them all. Teleports, cutscenes and despawns are not counted.
//   rim   — share of the visible view off the level (void / out of the map), for reference.
//   ms    — renderer.render + post.render per frame at R (1920×1080, median of 30 frames, two spots),
//           against R = 360.
//   reach — whether an enemy at blaster range (B1: 7 tiles) in each of 8 directions shows its feet and
//           body centre inside the visible view (and the same for the alert radius, 10 tiles).
//   npm run dev; node tools/qa/zoomlimits.mjs [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/zoomlimits';
fs.mkdirSync(out, { recursive: true });
const ROWS = [180, 200, 216, 240, 256, 270, 288, 300, 320, 360, 400, 432, 480, 540, 576, 600, 640, 680, 720, 800, 900];
const ASPECTS = [['16:9', 1920, 1080], ['16:10', 1920, 1200], ['21:9', 2560, 1080], ['4:3', 1440, 1080]];
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
const consoleH = await page.evaluate(() => __renderer.consoleH);

// ---------------------------------------------------------------- pop-ins and rim, by sweeping a world
const sweep = (world) =>
  page.evaluate(
    ({ ROWS, ASPECTS, consoleH, world }) => {
      const g = __game;
      const r = __renderer;
      const p = g.player;
      const W0 = g.world;
      const MAP = 192;
      // the level's extent: cells that are not void
      let x0 = MAP, y0 = MAP, x1 = 0, y1 = 0;
      for (let y = 0; y < MAP; y++)
        for (let x = 0; x < MAP; x++)
          if (W0.biomeAt(x, y) !== 13 && !(W0.blocked && W0.blocked[y * MAP + x] === 2)) {
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
      const lines = [];
      const GAP = 10;
      for (let y = y0 + 4; y <= y1 - 4; y += GAP) lines.push([x0, y, x1, y]);
      for (let x = x0 + 4; x <= x1 - 4; x += GAP) lines.push([x, y0, x, y1]);
      // every R × aspect: the camera the renderer would place (renderer.render), without shake / drift
      const views = [];
      for (const [an, aw, ah] of ASPECTS)
        for (const R of ROWS) {
          const W = Math.ceil((R * aw) / ah);
          const H = R;
          const viewH = H - (consoleH * R) / ah; // the console's css height in game px at this R
          views.push({ an, R, W, H, viewH, pop: 0, rim: 0, rimN: 0, bad: [] });
        }
      const camOf = (v) => {
        const ps = { x: (p.x - p.y) * 20, y: (p.x + p.y) * 10 - p.z * 0.4 * 24.49 };
        const cr = W0.camRegions && r.camRegion(W0.camRegions, p);
        if (cr) {
          const cl = (q, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, q)));
          ps.x = cl(ps.x, (cr.x0 - cr.y1) * 20 + v.W * 0.22, (cr.x1 - cr.y0) * 20 - v.W * 0.22);
          ps.y = cl(ps.y, (cr.x0 + cr.y0) * 10 + v.viewH * 0.24, (cr.x1 + cr.y1) * 10 - v.viewH * 0.3);
        }
        return { x: Math.round(ps.x - v.W / 2), y: Math.round(ps.y - v.viewH * 0.55) };
      };
      // a unit's sprite box on screen (game px, world-fixed): feet ± half width, up to its height
      const box = (u) => {
        const f = u.frame && u.frame();
        const sx = (u.x - u.y) * 20;
        const sy = (u.x + u.y) * 10 - (u.z || 0) * 24.49;
        const hw = f ? Math.max(10, f.w / 2) : 20;
        const h = f ? f.h : 60;
        return [sx - hw, sy - h, sx + hw, sy + 4];
      };
      let frames = 0;
      let skipped = 0;
      p.god = true;
      for (const [ax, ay, bx, by] of lines) {
        const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.2);
        let prev = null;
        for (let i = 0; i <= n; i++) {
          p.x = ax + ((bx - ax) * i) / n;
          p.y = ay + ((by - ay) * i) / n;
          p.path = null;
          p.hp = p.maxHp;
          g.update(1 / 60);
          if (g.cinema || g.camFocus || g.player !== p || g.world !== W0) { prev = null; skipped++; continue; }
          frames++;
          const now = new Set(g.activeUnits);
          if (prev) {
            const alive = new Set(g.units);
            for (const u of new Set([...prev, ...now])) {
              if (prev.has(u) === now.has(u) || !alive.has(u) || u.dead || u.hidden || u === p) continue;
              const b = box(u);
              for (const v of views) {
                const c = camOf(v);
                if (b[2] > c.x && b[0] < c.x + v.W && b[3] > c.y && b[1] < c.y + v.viewH) {
                  v.pop++;
                  if (v.bad.length < 3) v.bad.push(`${u.name || u.kind} ${now.has(u) ? 'in' : 'out'} at ${u.x.toFixed(0)},${u.y.toFixed(0)} (player ${p.x.toFixed(0)},${p.y.toFixed(0)})`);
                }
              }
            }
          }
          prev = now;
          // the rim: every 40th frame, a 16 × 9 grid over each view
          if (frames % 40 === 0)
            for (const v of views) {
              const c = camOf(v);
              let off = 0;
              for (let gy = 0; gy < 9; gy++)
                for (let gx = 0; gx < 16; gx++) {
                  const sx = c.x + ((gx + 0.5) * v.W) / 16;
                  const sy = c.y + ((gy + 0.5) * v.viewH) / 9;
                  const wx = (sx / 20 + sy / 10) / 2;
                  const wy = (sy / 10 - sx / 20) / 2;
                  if (wx < 0 || wy < 0 || wx >= MAP || wy >= MAP || W0.biomeAt(wx, wy) === 13) off++;
                }
              v.rim += off / 144;
              v.rimN++;
            }
        }
      }
      return { world, extent: [x0, y0, x1, y1], lines: lines.length, frames, skipped, units: g.units.length, views: views.map((v) => ({ an: v.an, R: v.R, pop: v.pop, rim: v.rimN ? +(v.rim / v.rimN).toFixed(3) : null, bad: v.bad })) };
    },
    { ROWS, ASPECTS, consoleH, world },
  );

const results = {};
results.coruscant = await sweep('coruscant');
console.log(`coruscant: ${results.coruscant.frames} frames, ${results.coruscant.lines} lines, extent ${results.coruscant.extent}`);
await page.evaluate(() => __game.travel('christophsis', __game.places.christophsis.world.landing));
await page.waitForTimeout(3000);
for (let i = 0; i < 6 && (await page.evaluate(() => !!__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
results.christophsis = await sweep('christophsis');
console.log(`christophsis: ${results.christophsis.frames} frames, ${results.christophsis.lines} lines, extent ${results.christophsis.extent}`);

// ---------------------------------------------------------------- frame time by R (1920×1080)
await page.evaluate(() => __game.travel('hub', __game.places.hub.world.landing));
await page.waitForTimeout(3000);
const perf = {};
for (const [spot, sx, sy] of [['terrace', 96, 76], ['undercity plaza', 98, 112]]) {
  for (const R of ROWS) {
    const ms = await page.evaluate(
      ({ R, sx, sy }) => {
        const r = __renderer;
        const g = __game;
        r.computeDevScale = () => (innerHeight * devicePixelRatio) / R;
        r.resize();
        g.player.x = sx;
        g.player.y = sy;
        g.player.path = null;
        const t = [];
        for (let i = 0; i < 36; i++) {
          g.update(1 / 60);
          const a = performance.now();
          r.render(1 / 60);
          r.post && r.post.render(1 / 60);
          if (i >= 6) t.push(performance.now() - a);
        }
        t.sort((a, b) => a - b);
        return t[t.length >> 1];
      },
      { R, sx, sy },
    );
    (perf[R] ||= {})[spot] = +ms.toFixed(1);
  }
}

// ---------------------------------------------------------------- reach (analytic, the renderer's camera)
// the player's feet sit at 55% of the visible height (PC); the console covers consoleH css px at the bottom
const reach = (R, aw, ah, dist, body = 27) => {
  const W = (R * aw) / ah;
  const viewH = R - (consoleH * R) / ah;
  const py = viewH * 0.55;
  const ok = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const ux = Math.cos(a) * dist;
    const uy = Math.sin(a) * dist;
    const sx = W / 2 + (ux - uy) * 20;
    const sy = py + (ux + uy) * 10;
    ok.push(sx > 12 && sx < W - 12 && sy - body > 2 && sy < viewH - 2);
  }
  return ok.every(Boolean);
};

// ---------------------------------------------------------------- the table
const lines = [];
lines.push(`console ${consoleH} css px; errors ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`);
lines.push('R | ' + ASPECTS.map((a) => `pop ${a[0]}`).join(' | ') + ' | rim 16:9 cor/chr | ms terrace, plaza (×360) | char css@1080p | B1 7 in view | alert 10 in view');
const base = perf[360];
for (const R of ROWS) {
  const pops = ASPECTS.map(([an]) => results.coruscant.views.find((v) => v.an === an && v.R === R).pop + results.christophsis.views.find((v) => v.an === an && v.R === R).pop);
  const rc = results.coruscant.views.find((v) => v.an === '16:9' && v.R === R).rim;
  const rh = results.christophsis.views.find((v) => v.an === '16:9' && v.R === R).rim;
  const pf = perf[R];
  const ratio = Math.max(pf.terrace / base.terrace, pf['undercity plaza'] / base['undercity plaza']);
  lines.push(`${R} | ${pops.join(' | ')} | ${rc} / ${rh} | ${pf.terrace}, ${pf['undercity plaza']} (${ratio.toFixed(2)}) | ${Math.round((52 * 1080) / R)} | ${reach(R, 1920, 1080, 7) ? 'yes' : 'no'} | ${reach(R, 1920, 1080, 10) ? 'yes' : 'no'}`);
}
const text = lines.join('\n');
console.log(text);
fs.writeFileSync(`${out}/table.txt`, text + '\n');
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, perf, consoleH }, null, 1));
for (const w of ['coruscant', 'christophsis']) for (const v of results[w].views.filter((v) => v.an === '16:9' && v.bad.length)) console.log(`  ${w} R${v.R}: ${v.bad.join('; ')}`);
await browser.close();
