// Play the rebuilt Coruscant (?map=v2, docs/CORUSCANT_REBUILD.md) and check what a player would see:
//   crowd — 90 s of the city's life sped up: every citizen's and patrol's progress (stuck time,
//           how many are standing still away from where they are going)
//   walk  — real mouse clicks along a route through each district: the arrival against the clicked
//           point, pop-ins and camera jumps per rendered frame, a frame saved every 0.8 s
//   cover — walking behind a tall building: the building fades while it covers the player
//   wide  — the widest zoom over each district (sightseeing)
//   npm run dev; node tools/qa/v2play.mjs [out_dir] [query=?map=v2&proto=bg]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/v2play', query = '?map=v2&proto=bg'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
await page.goto((process.env.QA_URL || 'http://127.0.0.1:5173/') + query);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
const spots = await page.evaluate(() => __game.world.qaSpots);
if (!spots) throw new Error('not the rebuilt map (no world.qaSpots)');

// --- crowd: 90 s of life, sped up (the player parked at the lift square)
const crowd = await page.evaluate((lift) => {
  const g = __game;
  g.player.x = lift[0];
  g.player.y = lift[1];
  const people = g.life.people;
  const moved = new Map(people.map((u) => [u, 0]));
  let maxStuck = 0;
  for (let i = 0; i < 90 * 30; i++) {
    const before = people.map((u) => [u.x, u.y]);
    g.update(1 / 30);
    people.forEach((u, k) => {
      moved.set(u, moved.get(u) + Math.hypot(u.x - before[k][0], u.y - before[k][1]));
      maxStuck = Math.max(maxStuck, u.stuck || 0);
    });
  }
  const still = people.filter((u) => moved.get(u) < 2).map((u) => `${u.name}@${u.x.toFixed(0)},${u.y.toFixed(0)}`);
  return { people: people.length, maxStuck: +maxStuck.toFixed(1), barelyMoved: still.length, barelyMovedWho: still.slice(0, 6) };
}, spots.liftSquare);
console.log(`crowd: ${crowd.people} people over 90 s — longest stuck ${crowd.maxStuck} s, ${crowd.barelyMoved} moved under 2 tiles ${crowd.barelyMovedWho.join(' ')}`);

// --- per-frame log (pop-ins, camera jumps, the player's fade by a covering prop)
await page.evaluate(() => {
  const r = __renderer;
  const g = __game;
  const render = r.render.bind(r);
  window.__log = { frames: 0, jumps: 0, pops: 0, bad: [] };
  let pc = null;
  let prev = null;
  r.render = (dt) => {
    render(dt);
    const L = __log;
    L.frames++;
    if (pc && Math.hypot(r.cam.x - pc.x, r.cam.y - pc.y) > 16) L.jumps++;
    pc = { x: r.cam.x, y: r.cam.y };
    const now = new Set(g.activeUnits);
    if (prev) {
      const alive = new Set(g.units);
      for (const u of now) {
        if (prev.has(u) || !alive.has(u) || u.dead || u.hidden) continue;
        const sx = (u.x - u.y) * 20 - r.cam.x;
        const sy = (u.x + u.y) * 10 - r.cam.y;
        if (sx > 20 && sx < r.w - 20 && sy > 70 && sy < r.h - r.consoleH / r.scale - 10) {
          L.pops++;
          if (L.bad.length < 4) L.bad.push(`${u.name || u.kind} at ${sx | 0},${sy | 0}`);
        }
      }
    }
    prev = now;
  };
});
// --- walk: click routes through the districts
const ROUTES = {
  lift_to_plaza: { from: spots.liftSquare, to: [spots.plaza] },
  plaza_to_cantina: { from: spots.plaza, to: [spots.cantina] },
  avenue_east: { from: spots.works, to: [spots.avenueEast] },
  stacks: { from: spots.westStacks, to: [[spots.westStacks[0], spots.westStacks[1] + 12]] },
  overlook: { from: spots.plaza, to: [spots.overlook] },
};
for (const [name, r] of Object.entries(ROUTES)) {
  await page.evaluate((p) => { const g = __game; g.player.x = p[0]; g.player.y = p[1]; g.player.path = null; }, r.from);
  await page.waitForTimeout(1500);
  await page.evaluate(() => Object.assign(__log, { frames: 0, jumps: 0, pops: 0, bad: [] }));
  const res = [];
  for (const t of r.to) {
    // click on the target's screen position
    const at = await page.evaluate((t) => { const R = __renderer; return [((t[0] - t[1]) * 20 - R.cam.x) * R.scale, ((t[0] + t[1]) * 10 - R.cam.y) * R.scale]; }, t);
    const cx = Math.max(10, Math.min(1910, at[0]));
    const cy = Math.max(10, Math.min(900, at[1]));
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(100);
    const want = await page.evaluate(() => [__game.mouseWorld.x, __game.mouseWorld.y]);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    let k = 0;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(800);
      if (s % 2 === 0) await page.screenshot({ path: `${out}/${name}_${String(k++).padStart(2, '0')}.png` });
      if (await page.evaluate(() => !__game.player.path)) break;
    }
    const end = await page.evaluate(() => [__game.player.x, __game.player.y]);
    res.push(Math.hypot(end[0] - want[0], end[1] - want[1]).toFixed(2));
  }
  const L = await page.evaluate(() => __log);
  console.log(`walk ${name}: ${res.join(', ')} tiles from the click; ${L.frames} frames, camera jumps ${L.jumps}, pop-ins ${L.pops}${L.bad.length ? ' (' + L.bad.join('; ') + ')' : ''}`);
}
// --- cover: behind the tower west of the plaza (towers_02) — does it fade over the player?
const cover = await page.evaluate(() => {
  const g = __game;
  const t = g.world.props.find((p) => p.sheet === 'towers_02');
  g.player.x = t.x - 2;
  g.player.y = t.y - 7.5; // just behind its back wall
  g.player.path = null;
  for (let i = 0; i < 20; i++) {
    g.update(1 / 60);
    __renderer.render(1 / 60);
  }
  return { tower: [t.x, t.y], alpha: t.alpha ?? 1, player: [g.player.x, g.player.y] };
});
await page.screenshot({ path: `${out}/cover.png` });
console.log(`cover: behind towers_02 at ${cover.tower} the tower's alpha is ${cover.alpha}`);
// --- wide: the widest zoom over each district
for (let i = 0; i < 10; i++) await page.click('#zoomOut');
for (const [name, p] of Object.entries(spots)) {
  await page.evaluate((p) => { const g = __game; g.player.x = p[0]; g.player.y = p[1]; g.player.path = null; }, p);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/wide_${name}.png` });
}
await page.evaluate(() => { const g = __game; g.player.x = 100; g.player.y = 62; g.player.path = null; });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/wide_upper.png` });
console.log(`errors ${errs.length}${errs[0] ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
