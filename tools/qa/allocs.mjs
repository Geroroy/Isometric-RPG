// Where scenario C (combat) allocates: CDP sampling heap profiler, by allocating function.
// Allocation churn is what makes the garbage collector run during play.
//   node tools/qa/allocs.mjs [url] [seconds=20]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://localhost:4173/';
const sec = +(process.argv[3] || 20);
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.tap('#startBtn');
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = __game;
  const p = g.player;
  g.travel('christophsis', g.places.christophsis.world.landing);
  g.cheats.god = true;
  g.cheats.force = true;
  p.level = 14;
  p.skills = { flurry: 5, djemso: 5, signature: 5, push: 4, throw: 3, leap: 3, shien: 3 };
  p.hotbar = ['signature', 'flurry', 'djemso', 'push', 'throw', 'leap'];
  p.recalc(true);
  p.setSaber(true);
  const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  p.x = c.x - 4;
  p.y = c.y - 4;
  setTimeout(function act() {
    let best = null;
    let bd = 99;
    for (const u of g.activeUnits) {
      if (u.dead || u.team !== 'cis') continue;
      const d = Math.hypot(u.x - p.x, u.y - p.y);
      if (d < bd) (bd = d), (best = u);
    }
    if (!best) {
      const n = g.front.camps.filter((k) => !k.cleared && !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (n) (p.x = n.x - 4), (p.y = n.y - 4);
    } else if (Math.random() < 0.35) {
      const s = p.hotbar[Math.floor(Math.random() * 6)];
      p.cooldowns[s] = 0;
      p.tryCast(s, best.x, best.y, best);
    } else p.basicAttack(best);
    setTimeout(act, 350);
  }, 300);
});
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const f0 = await page.evaluate(() => __game.time || 0);
await page.waitForTimeout(sec * 1000);
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const by = new Map();
let total = 0;
const walk = (n, stack) => {
  const f = n.callFrame;
  const name = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  const st = [name, ...stack].slice(0, 3);
  if (n.selfSize) {
    const k = st.join(' ← ');
    by.set(k, (by.get(k) || 0) + n.selfSize);
    total += n.selfSize;
  }
  for (const c of n.children) walk(c, st);
};
walk(profile.head, []);
console.log(`allocated ~${(total / 1048576 / sec).toFixed(2)} MB/s`);
for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP || 20))) console.log(`${((100 * v) / total).toFixed(1).padStart(5)}%  ${(v / 1024 / sec).toFixed(0).padStart(5)} KB/s  ${k}`);
await browser.close();
