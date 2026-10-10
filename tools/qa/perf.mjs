// Performance measurement: three 30 s scenarios on the production build.
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   node tools/qa/perf.mjs <out.json> [device=phone|desktop] [url=http://localhost:4173/] [seconds=30]
// Per scenario: FPS and frame-callback time (rAF wrapped), CPU (CDP Performance
// TaskDuration / wall time), JS heap and GC count (V8 GC trace events), then a
// second pass with the CPU profiler for the top functions by self time.
// A: standing still in the city hub   B: walking round the hub
// C: fighting a droid camp on Christophsis, attacking and casting
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/perf/before.json', device = 'phone', url = 'http://localhost:4173/', secArg = '30'] = process.argv;
const SECONDS = +secArg;
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROME || findChrome('/opt/pw-browsers'),
  // SW_CANVAS=1: 2D canvases drawn on the page's own thread, so the profiler can charge every
  // canvas call to the game function that made it (normally the GPU process executes them)
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required', ...(process.env.SW_CANVAS ? ['--disable-accelerated-2d-canvas'] : [])],
});
const ctxOpts = device === 'phone' ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

// rAF wrapper: every frame callback's start, duration and the gap since the last frame
const INIT = () => {
  const raf = window.requestAnimationFrame.bind(window);
  const P = (window.__perf = { frames: [], active: false, rafCalls: 0, intervals: 0, timeouts: 0 });
  window.requestAnimationFrame = (cb) => {
    P.rafCalls++;
    return raf((now) => {
      const t0 = performance.now();
      cb(now);
      if (P.active) P.frames.push([t0, performance.now() - t0]);
    });
  };
  const si = window.setInterval.bind(window);
  window.setInterval = (...a) => (P.intervals++, si(...a));
};

const SCENARIOS = {
  A: async (page) => {
    await page.evaluate(() => {
      const p = __game.player;
      p.action = null;
      p.stopSteer && p.stopSteer();
    });
  },
  B: async (page) => {
    await page.evaluate(() => {
      const g = __game;
      const p = g.player;
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      let i = 0;
      p.steer(...dirs[0]);
      window.__walk = setTimeout(function step() {
        i = (i + 1) % 4;
        p.steer(...dirs[i]);
        window.__walk = setTimeout(step, 2500);
      }, 2500);
    });
  },
  C: async (page) => {
    await page.evaluate(() => {
      clearTimeout(window.__walk);
      const g = __game;
      const p = g.player;
      p.stopSteer();
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
      window.__fight = setTimeout(function act() {
        let best = null;
        let bd = 99;
        for (const u of g.activeUnits) {
          if (u.dead || u.team !== 'cis') continue;
          const d = Math.hypot(u.x - p.x, u.y - p.y);
          if (d < bd) (bd = d), (best = u);
        }
        if (!best) {
          // camp cleared: the next one
          const n = g.front.camps.filter((k) => !k.cleared && !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
          if (n) (p.x = n.x - 4), (p.y = n.y - 4);
        } else if (Math.random() < 0.35) {
          const s = p.hotbar[Math.floor(Math.random() * 6)];
          p.cooldowns[s] = 0;
          p.tryCast(s, best.x, best.y, best);
        } else p.basicAttack(best);
        window.__fight = setTimeout(act, 350);
      }, 300);
    });
  },
};

const page = await (await browser.newContext(ctxOpts)).newPage();
// PACE=12: hand the game a frame only 12 times a second. The container has no GPU, so at full rate the
// software compositor is saturated and every build reads ~350%; at a fixed low rate the GPU process's
// CPU per frame (gpuMsPerFrame) shows what each frame really costs to composite.
if (process.env.PACE)
  await page.addInitScript((fps) => {
    const raf = window.requestAnimationFrame.bind(window);
    let next = 0;
    window.requestAnimationFrame = (cb) => {
      const tick = (t) => {
        if (t < next) return raf(tick);
        next = Math.max(next + 1000 / fps, t - 1000 / fps);
        cb(t);
      };
      return raf(tick);
    };
  }, +process.env.PACE);
await page.addInitScript(INIT);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
if (device === 'phone') await page.tap('#startBtn');
else await page.click('#startBtn');
await page.waitForTimeout(1500);
for (let i = 0; i < 4 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
const env = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter((c) => c.width * c.height > 1000 && getComputedStyle(c).display !== 'none' && c.isConnected);
  return {
    dpr: devicePixelRatio,
    viewport: [innerWidth, innerHeight],
    canvases: cs.map((c) => ({ id: c.id || c.className, w: c.width, h: c.height, css: [c.clientWidth, c.clientHeight] })),
    rafLoops: window.__perf.rafCalls,
    intervals: window.__perf.intervals,
  };
});
console.log('ENV', JSON.stringify(env));

// CPU time of every Chromium process (renderer main thread is only part of it: the GPU
// process rasterises and composites the canvases), from /proc, by process type
function procCpu() {
  const out = {};
  const hz = 100;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    let cmd;
    try {
      cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!cmd.includes('chrome')) continue;
    const type = (cmd.match(/--type=([a-z-]+)/) || [, 'browser'])[1];
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    out[type] = (out[type] || 0) + (+st[11] + +st[12]) / hz;
  }
  return out;
}
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const results = { device, env, scenarios: {} };

for (const [name, setup] of Object.entries(SCENARIOS)) {
  await setup(page);
  await page.waitForTimeout(3000); // settle
  // pass 1: frames, CPU, heap, GC
  const gcEvents = [];
  await cdp.send('Tracing.start', { categories: 'v8,devtools.timeline,disabled-by-default-v8.gc', transferMode: 'ReturnAsStream' });
  const m0 = await metrics();
  const p0 = procCpu();
  const heap0 = await page.evaluate(() => performance.memory.usedJSHeapSize);
  await page.evaluate(() => ((__perf.frames = []), (__perf.active = true), (__perf.rafBefore = __perf.rafCalls)));
  const t0 = Date.now();
  const heapSamples = [];
  while (Date.now() - t0 < SECONDS * 1000) {
    await page.waitForTimeout(500);
    heapSamples.push(await page.evaluate(() => performance.memory.usedJSHeapSize));
  }
  const wall = (Date.now() - t0) / 1000;
  const fr = await page.evaluate(() => ((__perf.active = false), { frames: __perf.frames, rafDelta: __perf.rafCalls - __perf.rafBefore }));
  const m1 = await metrics();
  const p1 = procCpu();
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let data = '';
  for (;;) {
    const r = await cdp.send('IO.read', { handle: stream });
    data += r.data;
    if (r.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  const trace = JSON.parse(data);
  const evs = trace.traceEvents || trace;
  let minor = 0;
  let major = 0;
  let gcMs = 0;
  for (const e of evs) {
    if (e.ph !== 'X' && e.ph !== 'B') continue;
    if (e.name === 'MinorGC' || e.name === 'V8.GC_SCAVENGER' || e.name === 'Scavenge') (minor++, (gcMs += (e.dur || 0) / 1000));
    else if (e.name === 'MajorGC' || e.name === 'V8.GC_MARK_COMPACTOR' || e.name === 'MarkCompact') (major++, (gcMs += (e.dur || 0) / 1000));
  }
  const frames = fr.frames;
  const durs = frames.map((f) => f[1]).sort((a, b) => a - b);
  const gaps = frames.slice(1).map((f, i) => f[0] - frames[i][0]);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0;
  const heapMB = (heap0 + avg(heapSamples)) / 2 / 1048576;
  const res = {
    seconds: +wall.toFixed(1),
    fps: +(frames.length / wall).toFixed(1),
    frameGapMs: +avg(gaps).toFixed(2),
    callbackMs: { avg: +avg(durs).toFixed(2), p50: +pct(durs, 0.5).toFixed(2), p95: +pct(durs, 0.95).toFixed(2), max: +(durs.at(-1) || 0).toFixed(2) },
    cpuPct: +((100 * (m1.TaskDuration - m0.TaskDuration)) / wall).toFixed(1),
    procCpuPct: Object.fromEntries(Object.keys(p1).map((k) => [k, +((100 * (p1[k] - (p0[k] || 0))) / wall).toFixed(1)])),
    gpuMsPerFrame: +((1000 * ((p1['gpu-process'] || 0) - (p0['gpu-process'] || 0))) / Math.max(1, frames.length)).toFixed(1),
    procCpuTotalPct: +Object.keys(p1).reduce((s, k) => s + (100 * (p1[k] - (p0[k] || 0))) / wall, 0).toFixed(1),
    scriptPct: +((100 * (m1.ScriptDuration - m0.ScriptDuration)) / wall).toFixed(1),
    layoutStylePct: +((100 * (m1.LayoutDuration - m0.LayoutDuration + m1.RecalcStyleDuration - m0.RecalcStyleDuration)) / wall).toFixed(1),
    heapMB: { avg: +heapMB.toFixed(1), min: +(Math.min(...heapSamples) / 1048576).toFixed(1), max: +(Math.max(...heapSamples) / 1048576).toFixed(1) },
    gc: { minor, major, perSec: +((minor + major) / wall).toFixed(2), ms: +gcMs.toFixed(0) },
    domNodes: m1.Nodes,
    layoutCount: m1.LayoutCount - m0.LayoutCount,
  };
  // pass 2: CPU profile for the top functions (self time)
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(Math.min(15, SECONDS) * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(i, (profile.timeDeltas[i] || 0) / 1000);
  let total = 0;
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n);
  profile.samples.forEach((id, i) => {
    let n = byId.get(id);
    // a native canvas call (fill, drawImage…) is charged to the game function that made it
    let nat = '';
    while (n && !n.callFrame.url && parent.get(n.id) && parent.get(n.id).callFrame.url) {
      nat = n.callFrame.functionName + ' ← ';
      n = parent.get(n.id);
      break;
    }
    const cf = n.callFrame;
    const key = nat + `${cf.functionName || '(anonymous)'} ${cf.url ? cf.url.replace(/^.*\/(assets|src)\//, '$1/').replace(/\?.*$/, '') + ':' + (cf.lineNumber + 1) : ''}`.trim();
    const t = profile.timeDeltas[i + 1] ? profile.timeDeltas[i + 1] / 1000 : 0;
    total += t;
    self.set(key, (self.get(key) || 0) + t);
  });
  res.topSelf = [...self.entries()]
    .filter(([k]) => k !== '(idle)' && k !== '(program)')
    .sort((a, b) => b[1] - a[1])
    .slice(0, +(process.env.TOP || 12))
    .map(([k, v]) => [k, +((100 * v) / total).toFixed(1)]);
  res.idlePct = +((100 * (self.get('(idle)') || 0)) / total).toFixed(1);
  res.programPct = +((100 * (self.get('(program)') || 0)) / total).toFixed(1);
  res.gcSelfPct = +((100 * (self.get('(garbage collector)') || 0)) / total).toFixed(1);
  results.scenarios[name] = res;
  console.log(name, JSON.stringify(res));
}
await page.evaluate(() => (clearTimeout(window.__fight), clearTimeout(window.__walk)));
// hidden tab: does the loop keep running?
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});
const hiddenProbe = await page.evaluate(
  () =>
    new Promise((res) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      __perf.frames = [];
      __perf.active = true;
      setTimeout(() => {
        __perf.active = false;
        res({ framesIn2sWhenHidden: __perf.frames.length });
      }, 2000);
    }),
);
results.hidden = hiddenProbe;
results.errors = errs;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 1));
console.log('HIDDEN', JSON.stringify(hiddenProbe), 'errors', errs.length);
await browser.close();
